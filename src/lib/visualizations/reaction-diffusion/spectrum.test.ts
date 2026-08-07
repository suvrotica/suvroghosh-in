import { describe, expect, it } from 'vitest';
import { resampleSpectrumInput } from './display';
import { calculateRadialSpectrum, prepareSpectrumField, radix2Fft2d } from './spectrum';

function horizontalSinusoid(size: number, cycles: number): Float64Array {
	const field = new Float64Array(size * size);
	for (let row = 0; row < size; row += 1) {
		for (let column = 0; column < size; column += 1) {
			field[row * size + column] = Math.sin((2 * Math.PI * cycles * (column + 0.5)) / size);
		}
	}
	return field;
}

function horizontalHarmonicAmplitude(field: Float64Array, size: number, cycles: number): number {
	let real = 0;
	let imaginary = 0;
	for (let column = 0; column < size; column += 1) {
		const value = field[column];
		const angle = (2 * Math.PI * cycles * (column + 0.5)) / size;
		real += value * Math.cos(angle);
		imaginary -= value * Math.sin(angle);
	}
	return (2 * Math.hypot(real, imaginary)) / size;
}

function strongestHorizontalHarmonic(field: Float64Array, size: number): number {
	let strongestCycles = 1;
	let strongestAmplitude = horizontalHarmonicAmplitude(field, size, strongestCycles);
	for (let cycles = 2; cycles <= size / 2; cycles += 1) {
		const amplitude = horizontalHarmonicAmplitude(field, size, cycles);
		if (amplitude > strongestAmplitude) {
			strongestCycles = cycles;
			strongestAmplitude = amplitude;
		}
	}
	return strongestCycles;
}

function centreNearestRestriction(field: Float64Array, sourceSize: number, targetSize: number) {
	const output = new Float64Array(targetSize * targetSize);
	for (let row = 0; row < targetSize; row += 1) {
		const sourceRow = Math.floor(((row + 0.5) * sourceSize) / targetSize);
		for (let column = 0; column < targetSize; column += 1) {
			const sourceColumn = Math.floor(((column + 0.5) * sourceSize) / targetSize);
			output[row * targetSize + column] = field[sourceRow * sourceSize + sourceColumn];
		}
	}
	return output;
}

describe('radial two-dimensional spectrum', () => {
	it('19. reports no dominant wavelength for a constant field', () => {
		const field = new Float64Array(64 * 64);
		field.fill(0.37);
		const reading = calculateRadialSpectrum(field, 64, 128);
		expect(reading.trustworthy).toBe(false);
		expect(reading.dominantQ).toBeNull();
		expect(reading.dominantWavelength).toBeNull();

		const mask = new Uint8Array(field.length);
		for (let row = 12; row < 52; row += 1) {
			for (let column = 12; column < 52; column += 1) mask[row * 64 + column] = 1;
		}
		const masked = calculateRadialSpectrum(field, 64, 128, { mask, window: 'none' });
		expect(masked.trustworthy).toBe(false);
		expect(masked.bins.every((bin) => bin.power < 1e-24)).toBe(true);
	});

	it('20. recovers the wavelength of a synthetic sinusoid within radial-bin tolerance', () => {
		const size = 64;
		const domainWidth = 128;
		const cycles = 8;
		const field = new Float64Array(size * size);
		for (let row = 0; row < size; row += 1) {
			for (let column = 0; column < size; column += 1) {
				field[row * size + column] = Math.sin((2 * Math.PI * cycles * column) / size);
			}
		}
		const reading = calculateRadialSpectrum(field, size, domainWidth, { window: 'none' });
		expect(reading.trustworthy).toBe(true);
		expect(reading.dominantWavelength).toBeCloseTo(domainWidth / cycles, 12);
	});

	it('21. mean subtraction removes the Fourier DC component', () => {
		const size = 32;
		const field = new Float64Array(size * size);
		for (let index = 0; index < field.length; index += 1) field[index] = 7 + (index % 3) * 0.1;
		const prepared = prepareSpectrumField(field, size, { subtractMean: true, window: 'none' });
		const transformed = radix2Fft2d(prepared.field, prepared.size);
		expect(Math.abs(transformed.real[0])).toBeLessThan(1e-10);
		expect(Math.abs(transformed.imaginary[0])).toBeLessThan(1e-10);
	});

	it('22. applies the Hann window deterministically', () => {
		const size = 32;
		const field = new Float64Array(size * size);
		for (let index = 0; index < field.length; index += 1) field[index] = Math.sin(index * 0.13);
		const first = prepareSpectrumField(field, size, { window: 'hann' });
		const second = prepareSpectrumField(field, size, { window: 'hann' });
		expect(first.field).toEqual(second.field);
		expect(first.field[0]).toBe(0);
		expect(first.field).not.toEqual(prepareSpectrumField(field, size, { window: 'none' }).field);
	});

	it('declines a single front instead of naming the domain-scale gradient a wavelength', () => {
		const size = 64;
		const field = new Float64Array(size * size);
		for (let row = 0; row < size; row += 1) {
			for (let column = 0; column < size; column += 1) {
				field[row * size + column] = column < size / 2 ? 0.15 : 0.75;
			}
		}
		const reading = calculateRadialSpectrum(field, size, 128, { window: 'none' });
		expect(reading.trustworthy).toBe(false);
		expect(reading.dominantWavelength).toBeNull();
		expect(reading.reason).toMatch(/too much of the domain/iu);
	});

	it('area-averages sinusoids immediately below and above the reduced-grid Nyquist limit', () => {
		const sourceSize = 96;
		const targetSize = 64;
		const mask = new Uint8Array(sourceSize * sourceSize).fill(1);
		const belowNyquist = horizontalSinusoid(sourceSize, 31);
		const aboveNyquist = horizontalSinusoid(sourceSize, 33);
		const restrictedBelow = resampleSpectrumInput(belowNyquist, mask, sourceSize, targetSize).field;
		const restrictedAbove = resampleSpectrumInput(aboveNyquist, mask, sourceSize, targetSize).field;
		const belowAmplitude = horizontalHarmonicAmplitude(restrictedBelow, targetSize, 31);
		const foldedAboveAmplitude = horizontalHarmonicAmplitude(restrictedAbove, targetSize, 31);
		const nearestBelowAmplitude = horizontalHarmonicAmplitude(
			centreNearestRestriction(belowNyquist, sourceSize, targetSize),
			targetSize,
			31
		);
		const nearestAboveAmplitude = horizontalHarmonicAmplitude(
			centreNearestRestriction(aboveNyquist, sourceSize, targetSize),
			targetSize,
			31
		);

		// 31 cycles remain at 31; 33 cycles fold around the target Nyquist of 32 to 31.
		expect(strongestHorizontalHarmonic(restrictedBelow, targetSize)).toBe(31);
		expect(strongestHorizontalHarmonic(restrictedAbove, targetSize)).toBe(31);
		expect(belowAmplitude).toBeCloseTo(0.5990827858603143, 12);
		expect(foldedAboveAmplitude).toBeCloseTo(0.5554631818910428, 12);
		// Exact footprint averaging is a box low-pass: both edge modes are attenuated
		// relative to centre-point decimation, with the above-Nyquist mode attenuated more.
		expect(belowAmplitude).toBeLessThan(nearestBelowAmplitude * 0.75);
		expect(foldedAboveAmplitude).toBeLessThan(nearestAboveAmplitude * 0.75);
		expect(foldedAboveAmplitude).toBeLessThan(belowAmplitude);

		const preparedAbove = prepareSpectrumField(aboveNyquist, sourceSize, {
			subtractMean: false,
			window: 'none'
		});
		expect(preparedAbove.size).toBe(targetSize);
		expect(preparedAbove.field).toEqual(restrictedAbove);
	});
});
