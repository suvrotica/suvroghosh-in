import type {
	Completion,
	Dataset,
	Estimate,
	Experiment,
	ObservedData,
	OrderingId,
	Scenario,
	Settings,
	Summary,
	ViewId
} from './types';

export const DEFAULT_SETTINGS: Settings = {
	seed: 1847,
	scenario: 'mcar',
	view: 'variables',
	rate: 0.35,
	strength: 2,
	imputation: 'none',
	draw: 0,
	delta: 0,
	ordering: 'original',
	reveal: false
};

export const SCENARIOS: Scenario[] = [
	{
		id: 'mcar',
		label: 'Missing completely at random',
		short: 'Scattered holes',
		mechanism: 'MCAR · independent of every score and the observed predictor',
		story: 'A courier loses a random handful of measurement slips.',
		rule: 'Each cell has the same independent chance of disappearing.',
		look: 'Look for a dusting of gaps, without a preferred participant or variable.',
		view: 'variables'
	},
	{
		id: 'mar',
		label: 'Missing depending on observed information',
		short: 'The observed clue',
		mechanism: 'MAR · depends on a separate, fully observed baseline predictor',
		story: 'Participants with higher recorded baseline scores are harder to reach.',
		rule: 'The probability of a missing cell increases with the observed baseline predictor.',
		look: 'Order by baseline: darkness gathers where the recorded predictor is higher.',
		view: 'variables'
	},
	{
		id: 'mnar',
		label: 'Missing depending on the missing value itself',
		short: 'The unseen clue',
		mechanism: 'MNAR · depends on the score that is then hidden',
		story: 'A high measurement is less likely to be submitted, even at the same baseline.',
		rule: 'Higher values have a greater probability of disappearing.',
		look: 'Reveal the simulated truth to see which values the darkness conceals.',
		view: 'variables'
	},
	{
		id: 'dropout',
		label: 'Dropout over time',
		short: 'The vanishing cohort',
		mechanism: 'MAR · dropout time depends on the fully observed baseline and a random draw',
		story: 'A participant leaves the study; every later visit is missing.',
		rule: 'Each participant has one dropout frontier. Nothing returns after that frontier.',
		look: 'Order by dropout time to turn the ragged edge into a diagonal.',
		view: 'time'
	},
	{
		id: 'variables',
		label: 'Entire missing variables',
		short: 'Silent instruments',
		mechanism: 'MCAR by design · selected columns are lost independently of their values',
		story: 'Some measurement channels were never recorded for anybody.',
		rule: 'A seeded selection of whole columns disappears. The rate moves in column-sized steps.',
		look: 'A completely absent variable cannot be learned from these data alone.',
		view: 'variables'
	},
	{
		id: 'instrument',
		label: 'Failed instruments',
		short: 'An outage, then recovery',
		mechanism: 'MCAR by design · equipment outages are scheduled independently of scores',
		story: 'Four instruments fail for bounded stretches, then resume measuring.',
		rule: 'Each participant has a contiguous outage; the first and final visits remain measured.',
		look: 'Unlike dropout, light returns. The achieved rate is bounded by recovery.',
		view: 'time'
	},
	{
		id: 'nonresponse',
		label: 'Selective nonresponse',
		short: 'Dark continents',
		mechanism: 'MAR · whole-row response depends on recorded baseline and recorded group',
		story: 'A known baseline group is less likely to return any questionnaire.',
		rule: 'Select participants using their observed baseline and group; hide all their responses.',
		look: 'Order by baseline to reveal a continent that the overall missing percentage conceals.',
		view: 'variables'
	}
];

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Separate streams keep a new mask or predictive draw from regenerating the complete data. */
function random(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function normal(next: () => number): number {
	return (
		Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, next()))) * Math.cos(2 * Math.PI * next())
	);
}

function uniform(seed: number, index: number, stream: number): number {
	return random((seed ^ Math.imul(index + 1, 0x9e3779b1) ^ stream) >>> 0)();
}

export function generateDataset(seed: number, view: ViewId): Dataset {
	const rows = 96;
	const cols = view === 'time' ? 24 : 16;
	const next = random((seed ^ 0x3c6ef372) >>> 0);
	const missingNext = random((seed ^ 0xa54ff53a) >>> 0);
	const truth = new Float64Array(rows * cols);
	const uniforms = new Float64Array(rows * cols);
	const driver = new Float64Array(rows);
	const groups = new Uint8Array(rows);
	for (let row = 0; row < rows; row++) {
		driver[row] = normal(next);
		groups[row] = driver[row] > 0 ? 1 : 0;
		const individual = normal(next) * 3;
		for (let col = 0; col < cols; col++) {
			const baseline = 50 + 10 * driver[row] + individual;
			const signal =
				view === 'time'
					? 0.38 * col + 4 * Math.sin(col / 4 + driver[row])
					: 3.8 * Math.sin(col * 0.85) + 0.2 * col;
			truth[row * cols + col] = baseline + signal + 5.5 * normal(next);
			uniforms[row * cols + col] = missingNext();
		}
	}
	return {
		seed,
		view,
		rows,
		cols,
		truth,
		driver,
		groups,
		uniforms,
		columns: Array.from({ length: cols }, (_, col) =>
			view === 'time'
				? `Visit ${String(col + 1).padStart(2, '0')}`
				: `Measure ${String(col + 1).padStart(2, '0')}`
		),
		unit: 'score points'
	};
}

function logistic(value: number): number {
	return 1 / (1 + Math.exp(-clamp(value, -40, 40)));
}

/** Calibrate the expected probability, not the realised count, without refreshing uniforms. */
function calibratedMask(scores: Float64Array, uniforms: Float64Array, rate: number): Uint8Array {
	const mask = new Uint8Array(scores.length);
	if (rate <= 0) return mask;
	if (rate >= 1) return mask.fill(1);
	let low = -40;
	let high = 40;
	for (let iteration = 0; iteration < 48; iteration++) {
		const mid = (low + high) / 2;
		let total = 0;
		for (const score of scores) total += logistic(mid + score);
		if (total / scores.length > rate) high = mid;
		else low = mid;
	}
	const intercept = (low + high) / 2;
	for (let cell = 0; cell < scores.length; cell++) {
		mask[cell] = uniforms[cell] < logistic(intercept + scores[cell]) ? 1 : 0;
	}
	return mask;
}

/** Ranked selection supplies nested masks for structural processes with exact attainable counts. */
function topIndices(scores: number[], count: number): number[] {
	return scores
		.map((score, index) => ({ score, index }))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.slice(0, count)
		.map(({ index }) => index);
}

export function createMask(data: Dataset, settings: Settings): Uint8Array {
	const { rows, cols, seed } = data;
	const rate = clamp(settings.rate, 0, 0.95);
	const strength = clamp(settings.strength, 0, 4);
	const mask = new Uint8Array(rows * cols);
	if (rate === 0) return mask;
	if (settings.scenario === 'mcar') {
		for (let cell = 0; cell < mask.length; cell++) mask[cell] = data.uniforms[cell] < rate ? 1 : 0;
	} else if (settings.scenario === 'mar' || settings.scenario === 'mnar') {
		const scores = new Float64Array(mask.length);
		for (let cell = 0; cell < mask.length; cell++) {
			scores[cell] =
				strength *
				(settings.scenario === 'mar'
					? data.driver[Math.floor(cell / cols)]
					: (data.truth[cell] - 52) / 12);
		}
		return calibratedMask(scores, data.uniforms, rate);
	} else if (settings.scenario === 'variables') {
		const scores = Array.from({ length: cols }, (_, col) => uniform(seed, col, 0x51ed270b));
		for (const col of topIndices(scores, Math.round(rate * cols))) {
			for (let row = 0; row < rows; row++) mask[row * cols + col] = 1;
		}
	} else if (settings.scenario === 'nonresponse') {
		const scores = Array.from({ length: rows }, (_, row) => {
			const draw = clamp(uniform(seed, row, 0x1b873593), 0.00001, 0.99999);
			return strength * (data.driver[row] + 0.6 * data.groups[row]) + Math.log(draw / (1 - draw));
		});
		for (const row of topIndices(scores, Math.round(rate * rows)))
			mask.fill(1, row * cols, (row + 1) * cols);
	} else if (settings.scenario === 'dropout') {
		const scores = Array.from({ length: rows * cols }, (_, cell) => {
			const row = Math.floor(cell / cols);
			const visit = cell % cols;
			return (
				visit / cols +
				0.22 * strength * Math.tanh(data.driver[row]) +
				0.3 * (uniform(seed, row, 0x7f4a7c15) - 0.5)
			);
		});
		for (const cell of topIndices(scores, Math.round(rate * mask.length))) mask[cell] = 1;
	} else if (settings.scenario === 'instrument') {
		for (let row = 0; row < rows; row++) {
			const instrument = row % 4;
			const center = (0.2 + 0.6 * uniform(seed, instrument, 0x94d049bb)) * cols;
			const variation = 1 + 0.12 * strength * (uniform(seed, row, 0x369dea0f) - 0.5);
			const length = clamp(Math.round(rate * cols * variation), 0, cols - 2);
			const start = clamp(Math.round(center - length / 2), 1, cols - 1 - length);
			mask.fill(1, row * cols + start, row * cols + start + length);
		}
	}
	return mask;
}

/** Deliberately omit truth, seed, groups and the mask-generator's random draws. */
export function observe(data: Dataset, mask: Uint8Array): ObservedData {
	return {
		rows: data.rows,
		cols: data.cols,
		values: Float64Array.from(data.truth, (value, index) => (mask[index] ? Number.NaN : value)),
		mask: mask.slice(),
		driver: data.driver.slice()
	};
}

export function impute(observed: ObservedData, settings: Settings): Completion {
	const { rows, cols, mask, driver } = observed;
	const values = observed.values.slice();
	const spread = new Float64Array(values.length).fill(Number.NaN);
	const unestimable: number[] = [];
	if (settings.imputation === 'none') return { values, spread, method: 'none', unestimable };
	const drawSeed = (settings.seed ^ 0xbb67ae85 ^ Math.imul(settings.draw + 1, 0x9e3779b1)) >>> 0;
	for (let col = 0; col < cols; col++) {
		let n = 0;
		let sumX = 0;
		let sumY = 0;
		for (let row = 0; row < rows; row++) {
			const cell = row * cols + col;
			if (!mask[cell] && Number.isFinite(values[cell])) {
				n++;
				sumX += driver[row];
				sumY += values[cell];
			}
		}
		if (n === 0 || (settings.imputation === 'predictive' && n < 3)) {
			unestimable.push(col);
			continue;
		}
		const meanX = sumX / n;
		const meanY = sumY / n;
		let sxx = 0;
		let sxy = 0;
		for (let row = 0; row < rows; row++) {
			const cell = row * cols + col;
			if (!mask[cell] && Number.isFinite(values[cell])) {
				sxx += (driver[row] - meanX) ** 2;
				sxy += (driver[row] - meanX) * (values[cell] - meanY);
			}
		}
		const slope = sxx > 1e-10 ? sxy / sxx : 0;
		let squaredError = 0;
		for (let row = 0; row < rows; row++) {
			const cell = row * cols + col;
			if (!mask[cell] && Number.isFinite(values[cell])) {
				squaredError += (values[cell] - (meanY + slope * (driver[row] - meanX))) ** 2;
			}
		}
		const degrees = n - (sxx > 1e-10 ? 2 : 1);
		const residualSD = degrees > 0 ? Math.sqrt(squaredError / degrees) : 0;
		for (let row = 0; row < rows; row++) {
			const cell = row * cols + col;
			if (!mask[cell]) continue;
			if (settings.imputation === 'mean') values[cell] = meanY;
			else {
				const leverage = 1 / n + (sxx > 1e-10 ? (driver[row] - meanX) ** 2 / sxx : 0);
				const predictiveSD = residualSD * Math.sqrt(1 + leverage);
				spread[cell] = predictiveSD;
				const sensitivity =
					settings.scenario === 'mnar' ? clamp(settings.delta, -3, 3) * residualSD : 0;
				values[cell] =
					meanY +
					slope * (driver[row] - meanX) +
					sensitivity +
					predictiveSD * normal(random((drawSeed ^ Math.imul(cell + 1, 0x85ebca6b)) >>> 0));
			}
		}
	}
	return { values, spread, method: settings.imputation, unestimable };
}

/** Sample mean and sample SD for one column. NaN and infinity are absent, never zero. */
export function estimate(values: ArrayLike<number>, cols: number, column: number): Estimate {
	let n = 0;
	let mean = 0;
	let m2 = 0;
	for (let cell = column; cell < values.length; cell += cols) {
		const value = values[cell];
		if (!Number.isFinite(value)) continue;
		n++;
		const difference = value - mean;
		mean += difference / n;
		m2 += difference * (value - mean);
	}
	return { mean: n ? mean : null, sd: n > 1 ? Math.sqrt(m2 / (n - 1)) : null, n };
}

export function summarize(mask: Uint8Array, rows: number, cols: number): Summary {
	const rowMissing = Array<number>(rows).fill(0);
	const columnMissing = Array<number>(cols).fill(0);
	const coMissing = Array.from({ length: cols }, () => Array<number>(cols).fill(0));
	const patternCounts = new Map<string, number>();
	let missing = 0;
	let completeCases = 0;
	for (let row = 0; row < rows; row++) {
		let pattern = '';
		for (let col = 0; col < cols; col++) {
			const absent = mask[row * cols + col] ? 1 : 0;
			pattern += absent;
			rowMissing[row] += absent;
			columnMissing[col] += absent;
			missing += absent;
			if (absent) {
				for (let other = 0; other < cols; other++) {
					if (mask[row * cols + other]) coMissing[col][other]++;
				}
			}
		}
		if (!rowMissing[row]) completeCases++;
		patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
	}
	return {
		missing,
		rate: rows * cols ? missing / (rows * cols) : 0,
		completeCases,
		rowMissing,
		columnMissing,
		patterns: [...patternCounts.entries()]
			.map(([pattern, count]) => ({ pattern, count }))
			.sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern)),
		coMissing
	};
}

export function rowOrdering(data: Dataset, mask: Uint8Array, ordering: OrderingId): number[] {
	const result = Array.from({ length: data.rows }, (_, row) => row);
	if (ordering === 'original') return result;
	const missingByRow = Array.from({ length: data.rows }, (_, row) => {
		let count = 0;
		for (let col = 0; col < data.cols; col++) count += mask[row * data.cols + col];
		return count;
	});
	const firstGap = (row: number) => {
		for (let col = 0; col < data.cols; col++) if (mask[row * data.cols + col]) return col;
		return data.cols;
	};
	return result.sort((a, b) => {
		if (ordering === 'driver') return data.driver[a] - data.driver[b] || a - b;
		if (ordering === 'dropout') return firstGap(a) - firstGap(b) || a - b;
		return missingByRow[a] - missingByRow[b] || a - b;
	});
}

export function buildExperiment(settings: Settings): Experiment {
	const data = generateDataset(settings.seed, settings.view);
	const mask = createMask(data, settings);
	const observed = observe(data, mask);
	return {
		settings: { ...settings },
		data,
		observed,
		completion: impute(observed, settings),
		summary: summarize(mask, data.rows, data.cols),
		order: rowOrdering(data, mask, settings.ordering)
	};
}
