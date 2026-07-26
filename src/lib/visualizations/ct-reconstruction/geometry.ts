import {
	DEFAULT_ACQUISITION_SETTINGS,
	DETECTOR_HALF_SPAN,
	type AcquisitionSettings,
	type ProjectionGeometry
} from './types';

function positiveInteger(value: number, label: string, maximum: number): number {
	if (!Number.isInteger(value) || value < 1 || value > maximum) {
		throw new RangeError(`${label} must be an integer from 1 through ${maximum}.`);
	}
	return value;
}

export function normalizeAcquisitionSettings(
	settings: Partial<AcquisitionSettings> = {}
): Required<AcquisitionSettings> {
	const merged = { ...DEFAULT_ACQUISITION_SETTINGS, ...settings };
	positiveInteger(merged.projectionCount, 'Projection count', 720);
	positiveInteger(merged.detectorCount, 'Detector-bin count', 2048);
	if (!Number.isFinite(merged.dose) || merged.dose < 0 || merged.dose > 1) {
		throw new RangeError('Relative dose must be between 0 and 1.');
	}
	if (
		!Number.isFinite(merged.additionalNoise) ||
		merged.additionalNoise < 0 ||
		merged.additionalNoise > 1
	) {
		throw new RangeError('Additional noise must be between 0 and 1.');
	}
	if (
		!Number.isFinite(merged.missingAngleWidth) ||
		merged.missingAngleWidth < 0 ||
		merged.missingAngleWidth >= 180
	) {
		throw new RangeError('Missing-angle width must be in [0, 180) degrees.');
	}
	if (!Number.isFinite(merged.missingAngleCenter)) {
		throw new RangeError('Missing-angle centre must be finite.');
	}
	if (
		!Number.isFinite(merged.rayStepScale) ||
		merged.rayStepScale < 0.1 ||
		merged.rayStepScale > 2
	) {
		throw new RangeError('Ray-step scale must be between 0.1 and 2 phantom pixels.');
	}
	return merged;
}

function periodicAngularDistanceDegrees(left: number, right: number): number {
	const difference = Math.abs((((left - right) % 180) + 180) % 180);
	return Math.min(difference, 180 - difference);
}

export function createProjectionGeometry(
	settings: Partial<AcquisitionSettings> = {}
): ProjectionGeometry {
	const normalized = normalizeAcquisitionSettings(settings);
	const { projectionCount, detectorCount } = normalized;
	const angles = new Float64Array(projectionCount);
	const cosines = new Float64Array(projectionCount);
	const sines = new Float64Array(projectionCount);
	const acquired = new Uint8Array(projectionCount);
	const halfMissingWidth = normalized.missingAngleWidth / 2;

	for (let index = 0; index < projectionCount; index += 1) {
		const angle = (index * Math.PI) / projectionCount;
		angles[index] = angle;
		cosines[index] = Math.cos(angle);
		sines[index] = Math.sin(angle);
		const angleDegrees = (index * 180) / projectionCount;
		acquired[index] =
			halfMissingWidth > 0 &&
			periodicAngularDistanceDegrees(angleDegrees, normalized.missingAngleCenter) < halfMissingWidth
				? 0
				: 1;
	}

	const detectorMin = -DETECTOR_HALF_SPAN;
	const detectorMax = DETECTOR_HALF_SPAN;
	const detectorSpacing = (detectorMax - detectorMin) / detectorCount;
	const detectorPositions = new Float64Array(detectorCount);
	for (let bin = 0; bin < detectorCount; bin += 1) {
		detectorPositions[bin] = detectorMin + (bin + 0.5) * detectorSpacing;
	}

	return {
		angles,
		cosines,
		sines,
		detectorPositions,
		acquired,
		projectionCount,
		detectorCount,
		detectorMin,
		detectorMax,
		detectorSpacing
	};
}

export function sampleGridBilinear(
	grid: Float32Array | Float64Array,
	size: number,
	x: number,
	y: number
): number {
	if (x < -1 || x > 1 || y < -1 || y > 1) return 0;
	const gridX = ((x + 1) * size) / 2 - 0.5;
	const gridY = ((1 - y) * size) / 2 - 0.5;
	const x0 = Math.floor(gridX);
	const y0 = Math.floor(gridY);
	const fractionX = gridX - x0;
	const fractionY = gridY - y0;

	const at = (column: number, row: number): number =>
		column < 0 || row < 0 || column >= size || row >= size ? 0 : (grid[row * size + column] ?? 0);

	const top = at(x0, y0) * (1 - fractionX) + at(x0 + 1, y0) * fractionX;
	const bottom = at(x0, y0 + 1) * (1 - fractionX) + at(x0 + 1, y0 + 1) * fractionX;
	return top * (1 - fractionY) + bottom * fractionY;
}
