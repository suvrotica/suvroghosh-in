import { describe, expect, it } from 'vitest';
import { sampleAperturePoint, validateApertureProfile } from './aperture';

describe('aperture profiles', () => {
	it('accepts a positive band-limited Fourier aperture', () => {
		const result = validateApertureProfile(
			{
				width: 1,
				height: 1.4,
				profile: {
					kind: 'fourier',
					terms: [
						{ harmonic: 2, cosine: 0.12, sine: 0 },
						{ harmonic: 5, cosine: 0, sine: -0.08 }
					]
				}
			},
			32
		);
		expect(result.valid).toBe(true);
		expect(result.minimumRadius).toBeGreaterThan(0);
		expect(result.simple).toBe(true);
	});

	it('rejects negative polar radius and above-Nyquist harmonics', () => {
		const result = validateApertureProfile(
			{
				width: 1,
				height: 1,
				profile: { kind: 'fourier', terms: [{ harmonic: 20, cosine: 1.2, sine: 0 }] }
			},
			32
		);
		expect(result.valid).toBe(false);
		expect(result.errors.length).toBeGreaterThanOrEqual(2);
	});

	it('returns a closed superellipse parameterization', () => {
		const parameters = {
			width: 2,
			height: 1,
			profile: { kind: 'superellipse' as const, exponent: 4 }
		};
		const start = sampleAperturePoint(parameters, 0);
		const end = sampleAperturePoint(parameters, Math.PI * 2);
		expect(Math.hypot(start.x - end.x, start.y - end.y)).toBeLessThan(1e-12);
	});

	it('rotates an asymmetric aperture within its transported plane', () => {
		const unrotated = sampleAperturePoint(
			{ width: 2, height: 1, profile: { kind: 'ellipse' }, rotation: 0 },
			0
		);
		const rotated = sampleAperturePoint(
			{ width: 2, height: 1, profile: { kind: 'ellipse' }, rotation: Math.PI / 2 },
			0
		);
		expect(unrotated.x).toBeCloseTo(2, 12);
		expect(unrotated.y).toBeCloseTo(0, 12);
		expect(rotated.x).toBeCloseTo(0, 12);
		expect(rotated.y).toBeCloseTo(2, 12);
	});
});
