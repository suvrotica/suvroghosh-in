import { ALL_NULL_METRICS } from './constants';
import type {
	EigenAnalysis,
	MatrixSummary,
	MetricValues,
	NullMetric,
	NullMetricComparison,
	SingularAnalysis
} from './types';

export function summarizeMatrix(
	values: Float64Array,
	rows: number,
	columns: number,
	eigen: EigenAnalysis | undefined,
	singular: SingularAnalysis
): MatrixSummary {
	validateShape(values, rows, columns);
	let sum = 0;
	let sumSquares = 0;
	let minimum = Number.POSITIVE_INFINITY;
	let maximum = Number.NEGATIVE_INFINITY;
	const rowMeans = new Float64Array(rows);
	const columnMeans = new Float64Array(columns);
	const rowNorms = new Float64Array(rows);
	const columnNorms = new Float64Array(columns);

	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const value = values[row * columns + column];
			sum += value;
			sumSquares += value * value;
			minimum = Math.min(minimum, value);
			maximum = Math.max(maximum, value);
			rowMeans[row] += value;
			columnMeans[column] += value;
			rowNorms[row] += value * value;
			columnNorms[column] += value * value;
		}
	}
	for (let row = 0; row < rows; row += 1) {
		rowMeans[row] /= columns;
		rowNorms[row] = Math.sqrt(rowNorms[row]);
	}
	for (let column = 0; column < columns; column += 1) {
		columnMeans[column] /= rows;
		columnNorms[column] = Math.sqrt(columnNorms[column]);
	}

	const count = values.length;
	const mean = sum / count;
	const variance = Math.max(0, sumSquares / count - mean * mean);
	let spectralRadius: number | null = null;
	if (eigen) {
		spectralRadius = 0;
		for (let index = 0; index < eigen.real.length; index += 1) {
			spectralRadius = Math.max(
				spectralRadius,
				Math.hypot(eigen.real[index], eigen.imaginary[index])
			);
		}
	}

	return {
		mean,
		stddev: Math.sqrt(variance),
		min: minimum,
		max: maximum,
		frobeniusNorm: Math.sqrt(sumSquares),
		spectralRadius,
		conditionNumber: singular.condition,
		rank: singular.rank,
		rowMeans,
		columnMeans,
		rowNorms,
		columnNorms
	};
}

export function calculateMetricValues(
	values: Float64Array,
	rows: number,
	columns: number,
	eigen: EigenAnalysis | undefined,
	singular: SingularAnalysis,
	summary?: MatrixSummary,
	localizationMagnitudeRank?: number
): MetricValues {
	const matrixSummary = summary ?? summarizeMatrix(values, rows, columns, eigen, singular);
	let leadingEigenvalue: number | null = null;
	let inverseParticipationRatio: number | null = null;
	if (eigen && eigen.real.length > 0) {
		let selected = 0;
		let entirelyReal = true;
		for (let index = 0; index < eigen.real.length; index += 1) {
			if (Math.abs(eigen.imaginary[index]) > 1e-12) entirelyReal = false;
			if (eigen.real[index] > eigen.real[selected]) selected = index;
		}
		if (entirelyReal) leadingEigenvalue = eigen.real[selected];
		if (eigen.ipr && eigen.ipr.length > selected) {
			// A user selection is compared with the same eigenvalue-magnitude rank
			// in each null draw. Without a selection, use the algebraically leading
			// real eigenvalue or the spectral-radius eigenpair for a complex spectrum.
			const localizationIndex =
				localizationMagnitudeRank === undefined
					? entirelyReal
						? selected
						: largestMagnitudeIndex(eigen.real, eigen.imaginary)
					: indexAtMagnitudeRank(eigen.real, eigen.imaginary, localizationMagnitudeRank);
			inverseParticipationRatio = eigen.ipr[localizationIndex];
		}
	}

	return {
		largestSingularValue: singular.values[0] ?? null,
		spectralRadius: matrixSummary.spectralRadius,
		leadingEigenvalue,
		inverseParticipationRatio,
		rowColumnCorrelation:
			rows === columns
				? pearsonCorrelation(matrixSummary.rowMeans, matrixSummary.columnMeans)
				: null,
		lowFrequencyPower: lowFrequencyPowerFraction(values, rows, columns),
		blockContrast: twoBlockContrast(values, rows, columns)
	};
}

export function eigenvalueMagnitudeRank(
	eigen: EigenAnalysis | undefined,
	selectedIndex: number | undefined
): number | undefined {
	if (!eigen || eigen.real.length === 0 || selectedIndex === undefined) return undefined;
	const bounded = Math.max(0, Math.min(eigen.real.length - 1, Math.round(selectedIndex)));
	return magnitudeOrder(eigen.real, eigen.imaginary).indexOf(bounded);
}

export function compareMetricToNull(
	observed: number | null,
	nullSamples: readonly (number | null)[]
): NullMetricComparison {
	const valid = nullSamples.filter(
		(value): value is number => typeof value === 'number' && Number.isFinite(value)
	);
	if (observed === null || !Number.isFinite(observed) || valid.length === 0) {
		return {
			observed,
			mean: null,
			stddev: null,
			zScore: null,
			percentile: null,
			twoSidedPValue: null,
			validSampleCount: valid.length
		};
	}
	const moments = streamingMoments(valid);
	const less = valid.reduce((count, value) => count + (value < observed ? 1 : 0), 0);
	const equal = valid.reduce((count, value) => count + (value === observed ? 1 : 0), 0);
	const lowerTail = less + equal;
	const upperTail = valid.length - less;
	const twoSidedPValue = Math.min(
		1,
		(2 * (1 + Math.min(lowerTail, upperTail))) / (valid.length + 1)
	);
	return {
		observed,
		mean: moments.mean,
		stddev: moments.stddev,
		zScore: moments.stddev > 0 ? (observed - moments.mean) / moments.stddev : null,
		percentile: (100 * (less + 0.5 * equal)) / valid.length,
		twoSidedPValue,
		validSampleCount: valid.length
	};
}

export function emptyMetricValues(): MetricValues {
	return Object.fromEntries(ALL_NULL_METRICS.map((metric) => [metric, null])) as MetricValues;
}

export function selectMetricValues(
	values: MetricValues,
	metrics: readonly NullMetric[]
): MetricValues {
	const selected = emptyMetricValues();
	for (const metric of metrics) selected[metric] = values[metric];
	return selected;
}

export function streamingMoments(values: readonly number[]): {
	mean: number;
	variance: number;
	stddev: number;
} {
	if (values.length === 0) return { mean: 0, variance: 0, stddev: 0 };
	let mean = 0;
	let secondMoment = 0;
	let count = 0;
	for (const value of values) {
		count += 1;
		const delta = value - mean;
		mean += delta / count;
		secondMoment += delta * (value - mean);
	}
	const variance = count > 1 ? secondMoment / (count - 1) : 0;
	return { mean, variance, stddev: Math.sqrt(Math.max(0, variance)) };
}

export function pearsonCorrelation(
	left: ArrayLike<number>,
	right: ArrayLike<number>
): number | null {
	if (left.length !== right.length || left.length < 2) return null;
	let leftMean = 0;
	let rightMean = 0;
	for (let index = 0; index < left.length; index += 1) {
		leftMean += left[index];
		rightMean += right[index];
	}
	leftMean /= left.length;
	rightMean /= right.length;
	let covariance = 0;
	let leftVariance = 0;
	let rightVariance = 0;
	for (let index = 0; index < left.length; index += 1) {
		const leftCentered = left[index] - leftMean;
		const rightCentered = right[index] - rightMean;
		covariance += leftCentered * rightCentered;
		leftVariance += leftCentered * leftCentered;
		rightVariance += rightCentered * rightCentered;
	}
	const denominator = Math.sqrt(leftVariance * rightVariance);
	return denominator > 0 ? covariance / denominator : null;
}

export function lowFrequencyPowerFraction(
	values: Float64Array,
	rows: number,
	columns: number
): number {
	validateShape(values, rows, columns);
	let mean = 0;
	for (const value of values) mean += value;
	mean /= values.length;
	let totalEnergy = 0;
	for (const value of values) totalEnergy += (value - mean) ** 2;
	if (totalEnergy === 0) return 0;
	let lowEnergy = 0;
	const seenConjugatePairs = new Set<string>();
	for (const [requestedRowFrequency, requestedColumnFrequency] of [
		[1, 0],
		[0, 1],
		[1, 1],
		[2, 0],
		[0, 2]
	] as const) {
		const rowFrequency = requestedRowFrequency % rows;
		const columnFrequency = requestedColumnFrequency % columns;
		if (rowFrequency === 0 && columnFrequency === 0) continue;
		const conjugateRow = (rows - rowFrequency) % rows;
		const conjugateColumn = (columns - columnFrequency) % columns;
		const key =
			rowFrequency < conjugateRow ||
			(rowFrequency === conjugateRow && columnFrequency <= conjugateColumn)
				? `${rowFrequency},${columnFrequency}`
				: `${conjugateRow},${conjugateColumn}`;
		if (seenConjugatePairs.has(key)) continue;
		seenConjugatePairs.add(key);
		let cosine = 0;
		let sine = 0;
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const centered = values[row * columns + column] - mean;
				const phase =
					2 * Math.PI * (rowFrequency * (row / rows) + columnFrequency * (column / columns));
				cosine += centered * Math.cos(phase);
				sine += centered * Math.sin(phase);
			}
		}
		// A non-self-conjugate real-field mode has an omitted negative partner
		// carrying the same power. Nyquist modes are their own partner.
		const conjugateWeight =
			rowFrequency === conjugateRow && columnFrequency === conjugateColumn ? 1 : 2;
		lowEnergy += (conjugateWeight * (cosine * cosine + sine * sine)) / values.length;
	}
	return Math.max(0, Math.min(1, lowEnergy / totalEnergy));
}

export function twoBlockContrast(values: Float64Array, rows: number, columns: number): number {
	validateShape(values, rows, columns);
	let withinSum = 0;
	let betweenSum = 0;
	let withinCount = 0;
	let betweenCount = 0;
	let overallMean = 0;
	for (const value of values) overallMean += value;
	overallMean /= values.length;
	let variance = 0;
	for (let row = 0; row < rows; row += 1) {
		const rowBlock = row < rows / 2 ? 0 : 1;
		for (let column = 0; column < columns; column += 1) {
			const value = values[row * columns + column];
			variance += (value - overallMean) ** 2;
			const columnBlock = column < columns / 2 ? 0 : 1;
			if (rowBlock === columnBlock) {
				withinSum += value;
				withinCount += 1;
			} else {
				betweenSum += value;
				betweenCount += 1;
			}
		}
	}
	const standardDeviation = Math.sqrt(variance / values.length);
	if (standardDeviation === 0 || withinCount === 0 || betweenCount === 0) return 0;
	return (withinSum / withinCount - betweenSum / betweenCount) / standardDeviation;
}

function largestMagnitudeIndex(real: Float64Array, imaginary: Float64Array): number {
	let selected = 0;
	for (let index = 1; index < real.length; index += 1) {
		if (
			Math.hypot(real[index], imaginary[index]) > Math.hypot(real[selected], imaginary[selected])
		) {
			selected = index;
		}
	}
	return selected;
}

function indexAtMagnitudeRank(real: Float64Array, imaginary: Float64Array, rank: number): number {
	const order = magnitudeOrder(real, imaginary);
	return order[Math.max(0, Math.min(order.length - 1, Math.round(rank)))] ?? 0;
}

function magnitudeOrder(real: Float64Array, imaginary: Float64Array): number[] {
	return Array.from({ length: real.length }, (_, index) => index).sort((left, right) => {
		const magnitudeDelta =
			Math.hypot(real[right], imaginary[right]) - Math.hypot(real[left], imaginary[left]);
		return magnitudeDelta === 0 ? left - right : magnitudeDelta;
	});
}

function validateShape(values: Float64Array, rows: number, columns: number): void {
	if (values.length !== rows * columns || rows < 1 || columns < 1) {
		throw new RangeError('Matrix shape does not match its storage.');
	}
}
