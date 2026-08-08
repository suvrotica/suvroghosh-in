import type { BZCalibrationRecordV2 } from './v2-types';

export interface BZProofRadialTrack {
	readonly startTime: number;
	readonly endTime: number;
	readonly startRadius: number;
	readonly endRadius: number;
	readonly samples: number;
	readonly outwardFraction: number;
}

export interface BZProofTargetTrace {
	readonly startTime: number;
	readonly endTime: number;
	readonly maximumRadius: number;
	readonly tracks: readonly BZProofRadialTrack[];
}

export interface BZProofCoreSample {
	readonly modelTime: number;
	readonly x: number;
	readonly y: number;
	readonly charge: -1 | 1;
}

export interface BZProofRotationTrack {
	readonly label: string;
	readonly startTime: number;
	readonly endTime: number;
	readonly rotations: number;
	readonly samples: number;
}

export interface BZProofSpiralTrace {
	readonly startTime: number;
	readonly endTime: number;
	readonly maximumCoordinate: number;
	readonly samples: readonly BZProofCoreSample[];
	readonly tracks: readonly BZProofRotationTrack[];
	readonly periodMean: number | null;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: null;
}

function finite(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function objective(
	calibration: Readonly<BZCalibrationRecordV2>
): Readonly<Record<string, unknown>> | null {
	return record(calibration.metrics.objective);
}

/**
 * Extracts the compact, version-agnostic radial-track envelope published by the
 * target-wave calibration. Invalid or incomplete trace rows are omitted rather
 * than guessed into a visual claim.
 */
export function bzProofTargetTrace(
	calibration: Readonly<BZCalibrationRecordV2>
): BZProofTargetTrace | null {
	if (calibration.presetId !== 'classic-target-rings') return null;
	const source = objective(calibration);
	if (!source || !Array.isArray(source.trackSummaries)) return null;
	const tracks = source.trackSummaries.flatMap((value): BZProofRadialTrack[] => {
		const item = record(value);
		if (!item) return [];
		const startTime = finite(item.startTime);
		const endTime = finite(item.endTime);
		const startRadius = finite(item.startRadius);
		const endRadius = finite(item.endRadius);
		const samples = positiveInteger(item.samples);
		const outwardFraction = finite(item.outwardFraction);
		if (
			startTime === null ||
			endTime === null ||
			startRadius === null ||
			endRadius === null ||
			samples === null ||
			outwardFraction === null ||
			endTime <= startTime ||
			startRadius < 0 ||
			endRadius < 0
		) {
			return [];
		}
		return [{ startTime, endTime, startRadius, endRadius, samples, outwardFraction }];
	});
	if (tracks.length === 0) return null;
	const startTime = Math.min(
		calibration.observationWindow.startTime,
		...tracks.map((track) => track.startTime)
	);
	const endTime = Math.max(
		calibration.observationWindow.endTime,
		...tracks.map((track) => track.endTime)
	);
	const maximumRadius = Math.max(
		calibration.setup.activeRadius,
		...tracks.flatMap((track) => [track.startRadius, track.endRadius])
	);
	return { startTime, endTime, maximumRadius, tracks };
}

/**
 * Extracts measured core samples and finite-time rotation tracks for the single
 * spiral or garden. The result contains only manifest evidence; it performs no
 * morphology inference in the browser.
 */
export function bzProofSpiralTrace(
	calibration: Readonly<BZCalibrationRecordV2>
): BZProofSpiralTrace | null {
	if (
		calibration.presetId !== 'persistent-single-spiral' &&
		calibration.presetId !== 'spiral-garden'
	) {
		return null;
	}
	const source = objective(calibration);
	if (!source) return null;
	const samples = (Array.isArray(source.samples) ? source.samples : []).flatMap(
		(value): BZProofCoreSample[] => {
			const item = record(value);
			if (!item) return [];
			const modelTime = finite(item.modelTime);
			const x = finite(item.x);
			const y = finite(item.y);
			const charge = item.charge === -1 || item.charge === 1 ? item.charge : null;
			return modelTime === null || x === null || y === null || charge === null
				? []
				: [{ modelTime, x, y, charge }];
		}
	);
	const tracks: BZProofRotationTrack[] = [];
	if (calibration.presetId === 'persistent-single-spiral') {
		const segments = Array.isArray(source.trackSegments)
			? source.trackSegments
			: [source.trackSegments];
		for (const [index, value] of segments.entries()) {
			const segment = record(value);
			const rotations = finite(segment?.rotations ?? source.rotations);
			const startStep = finite(segment?.startStep);
			const endStep = finite(segment?.endStep);
			const count = positiveInteger(segment?.samples);
			if (
				rotations !== null &&
				startStep !== null &&
				endStep !== null &&
				count !== null &&
				endStep > startStep
			) {
				tracks.push({
					label: index === 0 ? 'Tracked core' : `Tracked core ${index + 1}`,
					startTime: startStep * calibration.setup.timestep,
					endTime: endStep * calibration.setup.timestep,
					rotations,
					samples: count
				});
			}
		}
	} else if (Array.isArray(source.trackSummaries)) {
		for (const [index, value] of source.trackSummaries.entries()) {
			const item = record(value);
			const startTime = finite(item?.start);
			const endTime = finite(item?.end);
			const rotations = finite(item?.rotations);
			const count = positiveInteger(item?.samples);
			if (
				startTime !== null &&
				endTime !== null &&
				rotations !== null &&
				count !== null &&
				endTime > startTime
			) {
				tracks.push({
					label: `Core ${index + 1}`,
					startTime,
					endTime,
					rotations,
					samples: count
				});
			}
		}
	}
	if (tracks.length === 0) return null;
	return {
		startTime: Math.min(
			calibration.observationWindow.startTime,
			...tracks.map((track) => track.startTime)
		),
		endTime: Math.max(
			calibration.observationWindow.endTime,
			...tracks.map((track) => track.endTime)
		),
		maximumCoordinate: calibration.setup.activeRadius,
		samples,
		tracks,
		periodMean: finite(source.rotationPeriodMean)
	};
}
