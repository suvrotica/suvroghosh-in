import { filterSinogram } from './filters';
import {
	DEFAULT_RECONSTRUCTION_SETTINGS,
	type ReconstructionResult,
	type ReconstructionSettings,
	type Sinogram
} from './types';

export interface BackprojectionOptions {
	size: number;
	angle: number;
	detectorMin?: number;
	detectorMax?: number;
	weight?: number;
}

function validateOutputSize(size: number): void {
	if (!Number.isInteger(size) || size < 2 || size > 2048) {
		throw new RangeError('Reconstruction size must be an integer from 2 through 2048.');
	}
}

function projectionSample(
	projection: Float32Array | Float64Array,
	detectorCoordinate: number,
	detectorMin: number,
	detectorMax: number
): number {
	const spacing = (detectorMax - detectorMin) / projection.length;
	const detectorIndex = (detectorCoordinate - detectorMin) / spacing - 0.5;
	if (detectorIndex < -0.5 || detectorIndex > projection.length - 0.5) return 0;
	const left = Math.floor(detectorIndex);
	const fraction = detectorIndex - left;
	const leftValue = left < 0 ? 0 : (projection[left] ?? 0);
	const rightValue = left + 1 >= projection.length ? 0 : (projection[left + 1] ?? 0);
	return leftValue * (1 - fraction) + rightValue * fraction;
}

/**
 * Add one projection to a row-major square reconstruction buffer.
 * The caller controls angular quadrature through options.weight.
 */
export function accumulateBackprojection(
	target: Float32Array,
	projection: Float32Array | Float64Array,
	options: BackprojectionOptions
): Float32Array {
	validateOutputSize(options.size);
	if (target.length !== options.size * options.size) {
		throw new RangeError('Backprojection target does not match its declared size.');
	}
	if (projection.length < 2) throw new RangeError('A projection needs at least two samples.');
	if (!Number.isFinite(options.angle)) throw new RangeError('Projection angle must be finite.');
	const detectorMin = options.detectorMin ?? -Math.SQRT2;
	const detectorMax = options.detectorMax ?? Math.SQRT2;
	if (!(detectorMax > detectorMin)) throw new RangeError('Detector bounds are invalid.');
	const weight = options.weight ?? 1;
	if (!Number.isFinite(weight)) throw new RangeError('Backprojection weight must be finite.');
	const cosine = Math.cos(options.angle);
	const sine = Math.sin(options.angle);

	for (let row = 0; row < options.size; row += 1) {
		const y = 1 - ((row + 0.5) * 2) / options.size;
		for (let column = 0; column < options.size; column += 1) {
			const x = ((column + 0.5) * 2) / options.size - 1;
			const detectorCoordinate = x * cosine + y * sine;
			target[row * options.size + column] +=
				weight * projectionSample(projection, detectorCoordinate, detectorMin, detectorMax);
		}
	}
	return target;
}

export function reconstructSinogram(
	sinogram: Sinogram,
	settings: Partial<ReconstructionSettings> = {}
): ReconstructionResult {
	const normalized = { ...DEFAULT_RECONSTRUCTION_SETTINGS, ...settings };
	const size = normalized.imageSize ?? Math.max(8, Math.min(512, sinogram.detectorCount));
	validateOutputSize(size);
	if (!Number.isFinite(normalized.cutoff) || normalized.cutoff < 0 || normalized.cutoff > 1) {
		throw new RangeError('Filter cutoff must be between 0 and 1.');
	}
	const expectedLength = sinogram.projectionCount * sinogram.detectorCount;
	if (
		sinogram.values.length !== expectedLength ||
		sinogram.angles.length !== sinogram.projectionCount ||
		sinogram.acquired.length !== sinogram.projectionCount
	) {
		throw new RangeError('Sinogram arrays do not match their declared dimensions.');
	}

	const backprojection = new Float32Array(size * size);
	const filteredBackprojection = new Float32Array(size * size);
	const filteredSinogram = filterSinogram(sinogram, normalized.filter, normalized.cutoff);
	let acquiredProjectionCount = 0;
	for (const acquired of sinogram.acquired) acquiredProjectionCount += acquired === 0 ? 0 : 1;
	const angleWeight = acquiredProjectionCount > 0 ? Math.PI / acquiredProjectionCount : 0;
	for (let angleIndex = 0; angleIndex < sinogram.projectionCount; angleIndex += 1) {
		if (sinogram.acquired[angleIndex] === 0) continue;
		const offset = angleIndex * sinogram.detectorCount;
		const projection = sinogram.values.subarray(offset, offset + sinogram.detectorCount);
		const filtered = filteredSinogram.subarray(offset, offset + sinogram.detectorCount);
		const options: BackprojectionOptions = {
			size,
			angle: sinogram.angles[angleIndex],
			detectorMin: sinogram.detectorMin,
			detectorMax: sinogram.detectorMax,
			weight: angleWeight
		};
		accumulateBackprojection(backprojection, projection, options);
		accumulateBackprojection(filteredBackprojection, filtered, options);
	}

	return {
		size,
		backprojection,
		filteredBackprojection,
		filteredSinogram,
		acquiredProjectionCount
	};
}
