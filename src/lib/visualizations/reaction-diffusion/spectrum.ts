import type { SpectrumReading } from './types';
import { resampleSpectrumInput } from './display';

export interface SpectrumOptions {
	readonly subtractMean?: boolean;
	readonly window?: 'none' | 'hann';
	readonly mask?: Uint8Array;
	readonly minimumProminence?: number;
	readonly minimumPeakFraction?: number;
	readonly minimumCyclesAcrossDomain?: number;
}

function isPowerOfTwo(value: number): boolean {
	return value > 0 && (value & (value - 1)) === 0;
}

function fft1d(real: Float64Array, imaginary: Float64Array): void {
	const length = real.length;
	if (!isPowerOfTwo(length) || imaginary.length !== length) {
		throw new RangeError('Radix-2 FFT arrays must have the same power-of-two length.');
	}
	for (let index = 1, reverse = 0; index < length; index += 1) {
		let bit = length >> 1;
		for (; reverse & bit; bit >>= 1) reverse ^= bit;
		reverse ^= bit;
		if (index < reverse) {
			[real[index], real[reverse]] = [real[reverse], real[index]];
			[imaginary[index], imaginary[reverse]] = [imaginary[reverse], imaginary[index]];
		}
	}
	for (let block = 2; block <= length; block <<= 1) {
		const angle = (-2 * Math.PI) / block;
		const stepReal = Math.cos(angle);
		const stepImaginary = Math.sin(angle);
		for (let offset = 0; offset < length; offset += block) {
			let twiddleReal = 1;
			let twiddleImaginary = 0;
			for (let index = 0; index < block / 2; index += 1) {
				const even = offset + index;
				const odd = even + block / 2;
				const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
				const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
				real[odd] = real[even] - oddReal;
				imaginary[odd] = imaginary[even] - oddImaginary;
				real[even] += oddReal;
				imaginary[even] += oddImaginary;
				const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
				twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
				twiddleReal = nextReal;
			}
		}
	}
}

export interface Fft2dResult {
	readonly real: Float64Array;
	readonly imaginary: Float64Array;
}

export function radix2Fft2d(input: Float64Array, size: number): Fft2dResult {
	if (!isPowerOfTwo(size) || input.length !== size * size) {
		throw new RangeError('2D FFT input must be a square power-of-two field.');
	}
	const real = new Float64Array(input);
	const imaginary = new Float64Array(input.length);
	const lineReal = new Float64Array(size);
	const lineImaginary = new Float64Array(size);
	for (let row = 0; row < size; row += 1) {
		const offset = row * size;
		lineReal.set(real.subarray(offset, offset + size));
		lineImaginary.fill(0);
		fft1d(lineReal, lineImaginary);
		real.set(lineReal, offset);
		imaginary.set(lineImaginary, offset);
	}
	for (let column = 0; column < size; column += 1) {
		for (let row = 0; row < size; row += 1) {
			const index = row * size + column;
			lineReal[row] = real[index];
			lineImaginary[row] = imaginary[index];
		}
		fft1d(lineReal, lineImaginary);
		for (let row = 0; row < size; row += 1) {
			const index = row * size + column;
			real[index] = lineReal[row];
			imaginary[index] = lineImaginary[row];
		}
	}
	return { real, imaginary };
}

function fftSizeFor(size: number): number {
	let result = 1;
	while (result * 2 <= size) result *= 2;
	return result;
}

export function prepareSpectrumField(
	field: Float64Array,
	size: number,
	options: Readonly<SpectrumOptions> = {}
): { readonly field: Float64Array; readonly size: number } {
	if (!Number.isInteger(size) || size < 2 || field.length !== size * size) {
		throw new RangeError('Spectrum input must be a square field.');
	}
	if (options.mask && options.mask.length !== field.length) {
		throw new RangeError('Spectrum mask length differs from the field.');
	}
	const outputSize = fftSizeFor(size);
	const sourceMask = options.mask ?? new Uint8Array(field.length).fill(1);
	const restricted = resampleSpectrumInput(field, sourceMask, size, outputSize);
	const output = restricted.field;
	const active = restricted.mask;
	let sum = 0;
	let count = 0;
	for (let row = 0; row < outputSize; row += 1) {
		for (let column = 0; column < outputSize; column += 1) {
			const index = row * outputSize + column;
			if (!active[index]) continue;
			const value = output[index];
			if (!Number.isFinite(value)) throw new RangeError('Spectrum requires finite field values.');
			sum += value;
			count += 1;
		}
	}
	const mean = options.subtractMean === false || count === 0 ? 0 : sum / count;
	const window = options.window ?? 'hann';
	for (let row = 0; row < outputSize; row += 1) {
		const rowWindow =
			window === 'hann' ? 0.5 - 0.5 * Math.cos((2 * Math.PI * row) / (outputSize - 1)) : 1;
		for (let column = 0; column < outputSize; column += 1) {
			const index = row * outputSize + column;
			if (!active[index]) {
				output[index] = 0;
				continue;
			}
			const columnWindow =
				window === 'hann' ? 0.5 - 0.5 * Math.cos((2 * Math.PI * column) / (outputSize - 1)) : 1;
			const value = (output[index] - mean) * rowWindow * columnWindow;
			output[index] = value === 0 ? 0 : value;
		}
	}
	return { field: output, size: outputSize };
}

export function calculateRadialSpectrum(
	field: Float64Array,
	size: number,
	domainWidth: number,
	options: Readonly<SpectrumOptions> = {}
): SpectrumReading {
	if (!(domainWidth > 0) || !Number.isFinite(domainWidth)) {
		throw new RangeError('Spectrum domain width must be positive.');
	}
	const prepared = prepareSpectrumField(field, size, options);
	const transformed = radix2Fft2d(prepared.field, prepared.size);
	const maximumBin = Math.floor(prepared.size / 2);
	const sums = new Float64Array(maximumBin + 1);
	const counts = new Uint32Array(maximumBin + 1);
	for (let row = 0; row < prepared.size; row += 1) {
		const ky = row <= prepared.size / 2 ? row : row - prepared.size;
		for (let column = 0; column < prepared.size; column += 1) {
			const kx = column <= prepared.size / 2 ? column : column - prepared.size;
			const bin = Math.round(Math.hypot(kx, ky));
			if (bin > maximumBin) continue;
			const index = row * prepared.size + column;
			const power =
				transformed.real[index] * transformed.real[index] +
				transformed.imaginary[index] * transformed.imaginary[index];
			sums[bin] += power;
			counts[bin] += 1;
		}
	}
	const normalization = prepared.size ** 4;
	const bins = Array.from({ length: maximumBin + 1 }, (_, index) => ({
		q: (2 * Math.PI * index) / domainWidth,
		power: counts[index] ? sums[index] / counts[index] / normalization : 0
	}));
	let peakIndex = 1;
	for (let index = 2; index < bins.length; index += 1) {
		if (bins[index].power > bins[peakIndex].power) peakIndex = index;
	}
	const nonDcPowers = bins.slice(1).map((bin) => bin.power);
	const peakPower = nonDcPowers.length ? bins[peakIndex].power : 0;
	const backgroundPowers = nonDcPowers
		.filter((_, index) => Math.abs(index + 1 - peakIndex) > 1)
		.sort((a, b) => a - b);
	const background =
		backgroundPowers.length === 0 ? 0 : backgroundPowers[Math.floor(backgroundPowers.length / 2)];
	const prominence = peakPower === 0 ? 0 : peakPower / Math.max(background, Number.EPSILON);
	const totalNonDc = sums.slice(1).reduce((sum, value) => sum + value, 0);
	const peakFraction = totalNonDc === 0 ? 0 : sums[peakIndex] / totalNonDc;
	const minimumProminence = options.minimumProminence ?? 3;
	const minimumPeakFraction = options.minimumPeakFraction ?? 0.08;
	const minimumCyclesAcrossDomain = Math.max(2, options.minimumCyclesAcrossDomain ?? 2);
	const repeatsAcrossDomain = peakIndex >= minimumCyclesAcrossDomain;
	const trustworthy =
		peakPower > Number.EPSILON * 32 &&
		prominence >= minimumProminence &&
		peakFraction >= minimumPeakFraction &&
		repeatsAcrossDomain;
	const dominantQ = trustworthy ? bins[peakIndex].q : null;
	const dominantWavelength = dominantQ === null ? null : (2 * Math.PI) / dominantQ;
	return {
		bins,
		dominantQ,
		dominantWavelength,
		domainFraction: dominantWavelength === null ? null : dominantWavelength / domainWidth,
		prominence,
		trustworthy,
		reason: trustworthy
			? 'A concentrated, repeated non-zero radial spectral peak was detected.'
			: !repeatsAcrossDomain && peakPower > Number.EPSILON * 32
				? 'The strongest variation spans too much of the domain to establish a repeated wavelength.'
				: 'No non-zero radial peak is sufficiently prominent and concentrated to report a wavelength.',
		window: options.window ?? 'hann'
	};
}
