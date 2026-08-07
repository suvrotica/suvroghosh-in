import { describe, expect, it } from 'vitest';
import { calculateRadialSpectrum, prepareSpectrumField, radix2Fft2d } from './spectrum';

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
});
