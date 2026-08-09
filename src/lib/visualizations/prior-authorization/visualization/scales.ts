import type { ClockSeriesPoint } from '../engine/types.ts';

export type NumericScale = Readonly<{
	domain: readonly [number, number];
	range: readonly [number, number];
	map: (value: number) => number;
}>;

export function createNumericScale(
	domain: readonly [number, number],
	range: readonly [number, number]
): NumericScale {
	const [domainStart, domainEnd] = domain;
	const [rangeStart, rangeEnd] = range;
	const span = domainEnd - domainStart;
	return {
		domain,
		range,
		map: (value: number) =>
			span === 0
				? rangeStart
				: rangeStart + ((value - domainStart) / span) * (rangeEnd - rangeStart)
	};
}

export function createClockScales(
	series: readonly ClockSeriesPoint[],
	width: number,
	height: number
): Readonly<{
	x: NumericScale;
	patientElapsed: NumericScale;
	activeHumanWork: NumericScale;
	automatedProcessing: NumericScale;
}> {
	const safeWidth = Math.max(1, width);
	const safeHeight = Math.max(1, height);
	const max = (key: 'patientElapsedMs' | 'activeHumanWorkSeconds' | 'automatedProcessingMs') =>
		Math.max(0, ...series.map((point) => point[key]));
	return {
		x: createNumericScale([0, Math.max(1, series.length - 1)], [0, safeWidth]),
		patientElapsed: createNumericScale([0, max('patientElapsedMs') || 1], [safeHeight, 0]),
		activeHumanWork: createNumericScale([0, max('activeHumanWorkSeconds') || 1], [safeHeight, 0]),
		automatedProcessing: createNumericScale([0, max('automatedProcessingMs') || 1], [safeHeight, 0])
	};
}
