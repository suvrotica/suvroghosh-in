import { fft, nextPowerOfTwo } from './fft';
import type { FilterName, Sinogram } from './types';

function sinc(value: number): number {
	return Math.abs(value) < 1e-12 ? 1 : Math.sin(value) / value;
}

/**
 * Dimensionless windowed-ramp response for |f|/Nyquist in [0,1].
 * Physical frequency scaling is applied by filterProjection.
 */
export function frequencyWeight(
	normalizedFrequency: number,
	filter: FilterName,
	cutoff = 1
): number {
	const frequency = Math.abs(normalizedFrequency);
	const boundedCutoff = Math.max(0, Math.min(1, Number.isFinite(cutoff) ? cutoff : 0));
	if (frequency === 0 || boundedCutoff === 0 || frequency > boundedCutoff || frequency > 1) {
		return 0;
	}
	const ratio = frequency / boundedCutoff;
	let window: number;
	switch (filter) {
		case 'ramp':
			window = 1;
			break;
		case 'shepp-logan':
			window = sinc((Math.PI * ratio) / 2);
			break;
		case 'cosine':
			window = Math.cos((Math.PI * ratio) / 2);
			break;
		case 'hann':
			window = 0.5 + 0.5 * Math.cos(Math.PI * ratio);
			break;
		case 'hamming':
			window = 0.54 + 0.46 * Math.cos(Math.PI * ratio);
			break;
		default: {
			const exhaustive: never = filter;
			throw new RangeError(`Unknown reconstruction filter: ${String(exhaustive)}.`);
		}
	}
	return frequency * Math.max(0, window);
}

export function filterProjection(
	profile: Float32Array | Float64Array,
	filter: FilterName = 'shepp-logan',
	cutoff = 1,
	sampleSpacing = 1
): Float32Array {
	if (profile.length < 2) throw new RangeError('A projection needs at least two detector samples.');
	if (!Number.isFinite(sampleSpacing) || sampleSpacing <= 0) {
		throw new RangeError('Detector sample spacing must be finite and positive.');
	}
	const transformLength = nextPowerOfTwo(profile.length * 2);
	const real = new Float64Array(transformLength);
	const imaginary = new Float64Array(transformLength);
	const offset = Math.floor((transformLength - profile.length) / 2);
	for (let index = 0; index < profile.length; index += 1) {
		const value = profile[index];
		if (!Number.isFinite(value)) throw new RangeError('Projection values must all be finite.');
		real[offset + index] = value;
	}

	fft(real, imaginary);
	const nyquistFrequency = 1 / (2 * sampleSpacing);
	for (let index = 0; index < transformLength; index += 1) {
		const signedIndex = index <= transformLength / 2 ? index : index - transformLength;
		const normalizedFrequency = Math.abs(signedIndex) / (transformLength / 2);
		const weight = frequencyWeight(normalizedFrequency, filter, cutoff) * nyquistFrequency;
		real[index] *= weight;
		imaginary[index] *= weight;
	}
	fft(real, imaginary, true);

	const result = new Float32Array(profile.length);
	for (let index = 0; index < result.length; index += 1) {
		const value = real[offset + index];
		result[index] = Number.isFinite(value) ? value : 0;
	}
	return result;
}

export function filterSinogram(sinogram: Sinogram, filter: FilterName, cutoff = 1): Float32Array {
	const expectedLength = sinogram.projectionCount * sinogram.detectorCount;
	if (sinogram.values.length !== expectedLength) {
		throw new RangeError('Sinogram storage does not match its dimensions.');
	}
	const result = new Float32Array(expectedLength);
	for (let angleIndex = 0; angleIndex < sinogram.projectionCount; angleIndex += 1) {
		if (sinogram.acquired[angleIndex] === 0) continue;
		const offset = angleIndex * sinogram.detectorCount;
		const profile = sinogram.values.slice(offset, offset + sinogram.detectorCount);
		result.set(filterProjection(profile, filter, cutoff, sinogram.detectorSpacing), offset);
	}
	return result;
}
