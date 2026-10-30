import { describe, expect, it } from 'vitest';
import { CIE_D65_SAMPLES } from './colour-data';
import {
	createColourLut,
	FILM_REFRACTIVE_INDEX,
	filmColour,
	linearToSrgb,
	MAX_ANGLE_DEG,
	MAX_THICKNESS_NM,
	reflectance,
	sampleColourLut,
	spectrumColour,
	srgbToLinear
} from './optics';

/** Independent one-layer characteristic-matrix/admittance calculation. */
function characteristicReflectance(d: number, angle: number, wavelength: number): number {
	const n = FILM_REFRACTIVE_INDEX;
	const theta = (angle * Math.PI) / 180;
	const c0 = Math.cos(theta);
	const c1 = Math.sqrt(1 - (Math.sin(theta) / n) ** 2);
	const delta = (2 * Math.PI * n * d * c1) / wavelength;
	const s = Math.sin(delta);
	const c = Math.cos(delta);
	const polarised = (q0: number, q1: number) => {
		const numeratorImaginary = s * ((q0 * q0) / q1 - q1);
		const denominatorReal = 2 * q0 * c;
		const denominatorImaginary = s * ((q0 * q0) / q1 + q1);
		return numeratorImaginary ** 2 / (denominatorReal ** 2 + denominatorImaginary ** 2);
	};
	return 0.5 * (polarised(c0, n * c1) + polarised(1 / c0, n / c1));
}

describe('air / soap-like film / air spectral reflection', () => {
	it('has a black zero-thickness limit at every demonstrated angle', () => {
		for (const angle of [0, 25, 50, 75, 85]) {
			for (const wavelength of [380, 450, 550, 650, 780]) {
				expect(reflectance(0, angle, wavelength)).toBe(0);
				expect(reflectance(0.0001, angle, wavelength)).toBeLessThan(1e-10);
			}
			expect(filmColour(0, angle)).toEqual([0, 0, 0]);
		}
	});

	it('places reflection maxima at odd quarter waves and minima at half waves', () => {
		const n = FILM_REFRACTIVE_INDEX;
		const interfaceR = ((1 - n) / (1 + n)) ** 2;
		const expectedPeak = (4 * interfaceR) / (1 + interfaceR) ** 2;
		for (const wavelength of [420, 550, 680]) {
			for (const order of [0, 1, 2, 3]) {
				const quarterWave = ((2 * order + 1) * wavelength) / (4 * n);
				const halfWave = ((order + 1) * wavelength) / (2 * n);
				expect(reflectance(quarterWave, 0, wavelength)).toBeCloseTo(expectedPeak, 12);
				expect(reflectance(halfWave, 0, wavelength)).toBeLessThan(1e-25);
				expect(reflectance(quarterWave * 0.99, 0, wavelength)).toBeLessThan(expectedPeak);
			}
		}
	});

	it('matches a separate characteristic-matrix calculation at oblique incidence', () => {
		for (const thickness of [1, 30, 103.151, 250, 590, 1200]) {
			for (const angle of [0, 18, 53.12, 65, 75, 85, 89]) {
				for (const wavelength of [380, 470, 550, 630, 780]) {
					expect(reflectance(thickness, angle, wavelength)).toBeCloseTo(
						characteristicReflectance(thickness, angle, wavelength),
						12
					);
				}
			}
		}
	});

	it('moves a fixed interference order to shorter wavelengths when tilted', () => {
		const thickness = 110;
		for (const angle of [20, 45, 70]) {
			const cosFilm = Math.sqrt(
				1 - (Math.sin((angle * Math.PI) / 180) / FILM_REFRACTIVE_INDEX) ** 2
			);
			const peakWavelength = 4 * FILM_REFRACTIVE_INDEX * thickness * cosFilm;
			expect(peakWavelength).toBeLessThan(4 * FILM_REFRACTIVE_INDEX * thickness);
			const peak = reflectance(thickness, angle, peakWavelength);
			expect(peak).toBeGreaterThan(reflectance(thickness, angle, peakWavelength * 0.98));
			expect(peak).toBeGreaterThan(reflectance(thickness, angle, peakWavelength * 1.02));
		}
	});

	it('is angle-symmetric and conserves reflected-power bounds throughout the domain', () => {
		for (let d = 0; d <= 1200; d += 37) {
			for (let angle = 0; angle <= 85; angle += 5) {
				for (let wavelength = 380; wavelength <= 780; wavelength += 23) {
					const value = reflectance(d, angle, wavelength);
					expect(Number.isFinite(value)).toBe(true);
					expect(value).toBeGreaterThanOrEqual(0);
					expect(value).toBeLessThanOrEqual(1);
					expect(value).toBe(reflectance(d, -angle, wavelength));
				}
			}
		}
	});

	it('rejects nonphysical direct optical inputs instead of propagating NaN', () => {
		for (const [d, angle, wavelength] of [
			[-1, 0, 550],
			[100, 90, 550],
			[100, 0, 0],
			[Number.NaN, 0, 550],
			[100, Number.POSITIVE_INFINITY, 550],
			[100, 0, Number.NaN]
		]) {
			expect(() => reflectance(d, angle, wavelength)).toThrow(RangeError);
		}
	});
});

describe('spectral colour and the bounded GPU lookup', () => {
	it('uses the official CIE samples and reproduces a neutral D65 reflector', () => {
		expect(CIE_D65_SAMPLES).toHaveLength(81);
		expect(CIE_D65_SAMPLES[0][0]).toBe(380);
		expect(CIE_D65_SAMPLES.at(-1)?.[0]).toBe(780);
		expect(CIE_D65_SAMPLES.find(([wavelength]) => wavelength === 555)?.[2]).toBe(1);
		for (const grey of [0, 0.18, 0.5]) {
			for (const channel of spectrumColour(new Array(81).fill(grey))) {
				expect(channel).toBeCloseTo(grey, 3);
			}
		}
		for (const channel of spectrumColour(new Array(81).fill(1))) {
			expect(channel).toBeCloseTo(1, 3);
		}
	});

	it('integrates the optical spectrum and preserves the thin-film dark region', () => {
		for (const [d, angle] of [
			[20, 0],
			[100, 45],
			[220, 30],
			[480, 60],
			[1200, 85]
		]) {
			const reference = spectrumColour(
				CIE_D65_SAMPLES.map(([wavelength]) => reflectance(d, angle, wavelength))
			);
			expect(filmColour(d, angle)).toEqual(reference);
		}
		expect(Math.max(...filmColour(2, 0))).toBeLessThan(0.0002);
		expect(Math.max(...filmColour(100, 0))).toBeGreaterThan(0.05);
		expect(filmColour(260, 0)).not.toEqual(filmColour(260, 60));
	});

	it('roundtrips display encoding without adding an exposure or gamma twice', () => {
		for (const linear of [0, 0.0001, 0.0031308, 0.018, 0.18, 0.5, 1]) {
			expect(srgbToLinear(linearToSrgb(linear))).toBeCloseTo(linear, 7);
		}
		expect(linearToSrgb(0.18)).toBeCloseTo(0.461356, 6);
	});

	it('keeps the RGBA LUT bounded and agrees with direct spectral colour off-grid', () => {
		const lut = createColourLut();
		expect(lut.width).toBe(1025);
		expect(lut.height).toBe(257);
		expect(lut.data).toHaveLength(lut.width * lut.height * 4);
		expect(lut.data.byteLength).toBeLessThan(1_100_000);
		expect(lut.maxThicknessNm / (lut.width - 1)).toBeLessThan(5);
		expect(lut.maxThicknessNm).toBe(MAX_THICKNESS_NM);
		expect(lut.maxAngleDeg).toBe(MAX_ANGLE_DEG);
		for (let row = 0; row < lut.height; row++) {
			const offset = row * lut.width * 4;
			expect(Array.from(lut.data.slice(offset, offset + 4))).toEqual([0, 0, 0, 255]);
		}
		let maximumError = 0;
		let worstSample = '';
		for (let d = 0.713; d <= 1200; d += 2.719) {
			for (let angle = 0.173; angle <= MAX_ANGLE_DEG; angle += 0.517) {
				const reference = filmColour(d, angle);
				const sample = sampleColourLut(lut, d, angle);
				for (let channel = 0; channel < 3; channel++) {
					const error = Math.abs(reference[channel] - sample[channel]);
					if (error > maximumError) {
						maximumError = error;
						worstSample = `thickness=${d}nm angle=${angle}° channel=${channel}; expected=${reference}; sampled=${sample}`;
					}
				}
			}
		}
		// Includes RGBA8 quantisation, encoded-space interpolation and the cusp
		// where spectral colour first reaches the finite sRGB display gamut.
		expect(maximumError, worstSample).toBeLessThan(0.01);
		// Near-zero thickness changes rapidly at grazing incidence. Probe this
		// small region more densely than the broad colour-field grid above.
		for (let d = 0.113; d < 30; d += 0.137) {
			for (let angle = 80.013; angle <= MAX_ANGLE_DEG; angle += 0.131) {
				const reference = filmColour(d, angle);
				const sampled = sampleColourLut(lut, d, angle);
				for (let channel = 0; channel < 3; channel++) {
					expect(Math.abs(reference[channel] - sampled[channel])).toBeLessThan(0.01);
				}
			}
		}
		// Orthographic unit-sphere normal: cos(theta)=sqrt(1-r²). Its centre
		// looks straight at the viewer, and only the narrow outer rim is capped.
		expect(Math.acos(Math.sqrt(1 - 0 ** 2))).toBe(0);
		const rimStart = Math.sin((MAX_ANGLE_DEG * Math.PI) / 180);
		expect(1 - rimStart).toBeLessThan(0.00381);
		for (const radius of [rimStart, 0.999, 1]) {
			const localAngle = (Math.acos(Math.sqrt(Math.max(0, 1 - radius ** 2))) * 180) / Math.PI;
			const expected = sampleColourLut(lut, 480, MAX_ANGLE_DEG);
			const actual = sampleColourLut(lut, 480, localAngle);
			for (let channel = 0; channel < 3; channel++) {
				expect(actual[channel]).toBeCloseTo(expected[channel], 12);
			}
		}
	});

	it('bounds colour inputs consistently and rejects malformed spectral samples', () => {
		expect(filmColour(-10, 0)).toEqual([0, 0, 0]);
		expect(filmColour(1400, 90)).toEqual(filmColour(1200, 85));
		expect(filmColour(100, -45)).toEqual(filmColour(100, 45));
		expect(filmColour(Number.NaN, 0)).toEqual([0, 0, 0]);
		expect(() => spectrumColour([1, 0, 0])).toThrow(RangeError);
		expect(() => spectrumColour(new Array(81).fill(-1))).toThrow(RangeError);
	});
});
