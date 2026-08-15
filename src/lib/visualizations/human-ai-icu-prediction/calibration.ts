import { logistic, logit } from './normal';
import type {
	CalibrationCurves,
	CalibrationStatus,
	ForecasterConfig,
	ReliabilityBin,
	SimulatedSyntheticCase,
	WilsonInterval
} from './types';

const WILSON_95_Z = 1.959_963_984_540_054;

function validateCalibrationParameters(intercept: number, slope: number): void {
	if (!Number.isFinite(intercept)) {
		throw new RangeError('Calibration intercept must be finite.');
	}
	if (!Number.isFinite(slope) || slope <= 0) {
		throw new RangeError('Calibration slope must be finite and greater than zero.');
	}
}

export function calibratedProbabilityFromBaseLogOdds(
	baseLogOdds: number,
	intercept: number,
	slope: number
): number {
	if (!Number.isFinite(baseLogOdds)) {
		throw new RangeError('Base log odds must be finite.');
	}
	validateCalibrationParameters(intercept, slope);
	return logistic((baseLogOdds - intercept) / slope);
}

/** Applies the conventional calibration relation logit(Y | p) = c + m logit(p). */
export function applyCalibration(
	baseProbability: number,
	intercept: number,
	slope: number
): number {
	validateCalibrationParameters(intercept, slope);
	return calibratedProbabilityFromBaseLogOdds(logit(baseProbability), intercept, slope);
}

export function calibrationStatus(
	config: Pick<ForecasterConfig, 'calibrationIntercept' | 'calibrationSlope'>,
	tolerance = 1e-10
): CalibrationStatus {
	validateCalibrationParameters(config.calibrationIntercept, config.calibrationSlope);
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('Calibration-status tolerance must be finite and non-negative.');
	}

	const level =
		config.calibrationIntercept > tolerance
			? 'systematically-low'
			: config.calibrationIntercept < -tolerance
				? 'systematically-high'
				: 'level-ok';
	const spread =
		config.calibrationSlope < 1 - tolerance
			? 'too-extreme'
			: config.calibrationSlope > 1 + tolerance
				? 'too-timid'
				: 'spread-ok';
	const calibrated = level === 'level-ok' && spread === 'spread-ok';
	const labels: string[] = [];
	if (calibrated) labels.push('calibrated');
	if (level === 'systematically-low') labels.push('systematically low');
	if (level === 'systematically-high') labels.push('systematically high');
	if (spread === 'too-extreme') labels.push('too extreme');
	if (spread === 'too-timid') labels.push('too timid');

	return { calibrated, level, spread, labels };
}

export function describeCalibrationStatus(
	config: Pick<ForecasterConfig, 'calibrationIntercept' | 'calibrationSlope'>
): string {
	return calibrationStatus(config).labels.join(' and ');
}

export function wilsonInterval(eventCount: number, count: number, z = WILSON_95_Z): WilsonInterval {
	if (!Number.isSafeInteger(count) || count <= 0) {
		throw new RangeError('Wilson interval count must be a positive safe integer.');
	}
	if (!Number.isSafeInteger(eventCount) || eventCount < 0 || eventCount > count) {
		throw new RangeError('Wilson interval event count must lie between zero and count.');
	}
	if (!Number.isFinite(z) || z <= 0) {
		throw new RangeError('Wilson interval z value must be finite and positive.');
	}

	const proportion = eventCount / count;
	const zSquared = z * z;
	const denominator = 1 + zSquared / count;
	const centre = (proportion + zSquared / (2 * count)) / denominator;
	const halfWidth =
		(z / denominator) *
		Math.sqrt((proportion * (1 - proportion)) / count + zSquared / (4 * count * count));
	return {
		lower: Math.max(0, centre - halfWidth),
		upper: Math.min(1, centre + halfWidth)
	};
}

type ForecastKey = keyof SimulatedSyntheticCase['probabilities'];

interface SortedCalibrationEntry {
	readonly probability: number;
	readonly outcome: 0 | 1;
	readonly caseIndex: number;
}

interface TieGroup {
	readonly entries: readonly SortedCalibrationEntry[];
	readonly midpointRank: number;
}

function calibrationEntries(
	cases: readonly SimulatedSyntheticCase[],
	forecast: ForecastKey
): readonly SortedCalibrationEntry[] {
	return cases
		.map((syntheticCase) => {
			const probability = syntheticCase.probabilities[forecast];
			if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
				throw new RangeError('Reliability-diagram probabilities must be finite and lie in [0, 1].');
			}
			return { probability, outcome: syntheticCase.outcome, caseIndex: syntheticCase.index };
		})
		.sort(
			(left, right) => left.probability - right.probability || left.caseIndex - right.caseIndex
		);
}

function groupTies(entries: readonly SortedCalibrationEntry[]): readonly TieGroup[] {
	const groups: TieGroup[] = [];
	let groupStart = 0;
	while (groupStart < entries.length) {
		let groupEnd = groupStart + 1;
		while (
			groupEnd < entries.length &&
			entries[groupEnd].probability === entries[groupStart].probability
		) {
			groupEnd += 1;
		}
		groups.push({
			entries: entries.slice(groupStart, groupEnd),
			midpointRank: (groupStart + groupEnd) / 2
		});
		groupStart = groupEnd;
	}
	return groups;
}

function summarizeReliabilityBin(
	entries: readonly SortedCalibrationEntry[],
	index: number
): ReliabilityBin {
	let probabilitySum = 0;
	let eventCount = 0;
	for (const entry of entries) {
		probabilitySum += entry.probability;
		eventCount += entry.outcome;
	}
	return {
		index,
		count: entries.length,
		eventCount,
		meanPrediction: probabilitySum / entries.length,
		eventRate: eventCount / entries.length,
		wilson95: wilsonInterval(eventCount, entries.length),
		minPrediction: entries[0].probability,
		maxPrediction: entries[entries.length - 1].probability
	};
}

/**
 * Equal-count reliability bins that never split exact prediction ties. Large tie groups can
 * therefore collapse nominal quantile bins; a constant forecast correctly becomes one bin.
 */
export function buildReliabilityBins(
	cases: readonly SimulatedSyntheticCase[],
	forecast: ForecastKey,
	requestedBins = 10
): readonly ReliabilityBin[] {
	if (!Number.isSafeInteger(requestedBins) || requestedBins <= 0) {
		throw new RangeError('Requested reliability-bin count must be a positive safe integer.');
	}
	if (cases.length === 0) return [];

	const entries = calibrationEntries(cases, forecast);
	const tieGroups = groupTies(entries);
	const nominalBinCount = Math.min(requestedBins, tieGroups.length);
	const assignedBins = new Map<number, SortedCalibrationEntry[]>();

	for (const group of tieGroups) {
		const nominalIndex = Math.min(
			nominalBinCount - 1,
			Math.floor((group.midpointRank / entries.length) * nominalBinCount)
		);
		const binEntries = assignedBins.get(nominalIndex) ?? [];
		binEntries.push(...group.entries);
		assignedBins.set(nominalIndex, binEntries);
	}

	return [...assignedBins.keys()]
		.sort((left, right) => left - right)
		.map((nominalIndex, outputIndex) =>
			summarizeReliabilityBin(assignedBins.get(nominalIndex)!, outputIndex)
		);
}

export function buildCalibrationCurves(
	cases: readonly SimulatedSyntheticCase[],
	requestedBins = 10
): CalibrationCurves {
	return {
		clinician: buildReliabilityBins(cases, 'clinician', requestedBins),
		model: buildReliabilityBins(cases, 'model', requestedBins),
		ensemble: buildReliabilityBins(cases, 'ensemble', requestedBins)
	};
}
