import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	PRESETS,
	NUMERIC_LIMITS,
	decodeSettings,
	encodeSettings,
	generateSplats,
	normalizeSettings,
	presetSettings,
	randomizeSettings,
	type NumericSetting
} from './model';

describe('Splat Studio state boundaries', () => {
	it('round trips every preset and control through its versioned URL', () => {
		for (const preset of PRESETS) {
			const settings = {
				...presetSettings(preset.id, 4294967295),
				pointer: true as const,
				hue: 173,
				background: 'plum' as const,
				quality: 'low' as const
			};
			expect(decodeSettings(`?${encodeSettings(settings)}`)).toEqual(settings);
		}
	});

	it('rejects malformed, oversized, and unknown-version state', () => {
		for (const search of ['?v=2&s=[]', '?v=1&s=broken', '?v=1&s={}', 'x'.repeat(4097)]) {
			expect(decodeSettings(search)).toEqual(DEFAULT_SETTINGS);
		}
	});

	it('bounds all numbers and accepts only known enum values', () => {
		const corrupt = {
			...DEFAULT_SETTINGS,
			size: Infinity,
			seed: -10,
			symmetry: 3.8,
			palette: '__proto__',
			style: 'unknown',
			pointer: 'yes',
			density: 500
		};
		const clean = normalizeSettings(corrupt);
		expect(clean.size).toBe(DEFAULT_SETTINGS.size);
		expect(clean.seed).toBe(0);
		expect(clean.symmetry).toBe(4);
		expect(clean.density).toBe(NUMERIC_LIMITS.density.max);
		expect(clean.style).toBe(DEFAULT_SETTINGS.style);
		expect(clean.palette).toBe(DEFAULT_SETTINGS.palette);
		expect(clean.pointer).toBe(false);
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
	});

	it('produces a deterministic surprise within curated control bounds', () => {
		expect(randomizeSettings(85)).toEqual(randomizeSettings(85));
		expect(randomizeSettings(85)).not.toEqual(randomizeSettings(86));
		for (let seed = 0; seed < 20; seed++) {
			const result = randomizeSettings(seed);
			expect(normalizeSettings(result)).toEqual(result);
			expect(result.size).toBeLessThan(1.4);
		}
	});
});

describe('Splat Studio procedural sculpture', () => {
	it('generates deterministic, finite geometry and normalized flow tangents for all six forms', () => {
		const signatures: string[] = [];
		for (const preset of PRESETS) {
			const settings = presetSettings(preset.id, 90210);
			const a = generateSplats(settings, 600);
			const b = generateSplats(settings, 600);
			expect(a).toEqual(b);
			expect(a.positions.length).toBe(1800);
			expect(a.tangents.length).toBe(1800);
			expect(a.coordinates.length).toBe(600);
			expect(a.randoms.length).toBe(600);
			for (let i = 0; i < 600; i++) {
				expect(a.coordinates[i]).toBeGreaterThanOrEqual(0);
				expect(a.coordinates[i]).toBeLessThanOrEqual(1);
				expect(Math.hypot(...a.tangents.subarray(i * 3, i * 3 + 3))).toBeCloseTo(1, 5);
			}
			expect(
				Array.from(a.positions).every((value) => Number.isFinite(value) && Math.abs(value) < 5)
			).toBe(true);
			signatures.push(Array.from(a.positions.slice(0, 12)).join(','));
		}
		expect(new Set(signatures).size).toBe(6);
	});

	it('keeps the same particle prefix when the quality budget changes', () => {
		const small = generateSplats(DEFAULT_SETTINGS, 20);
		const large = generateSplats(DEFAULT_SETTINGS, 100);
		expect(small.positions).toEqual(large.positions.slice(0, 60));
		expect(small.coordinates).toEqual(large.coordinates.slice(0, 20));
	});

	it('responds to each structural control and seed', () => {
		const baseline = generateSplats(DEFAULT_SETTINGS, 40).positions;
		for (const patch of [
			{ scale: 1.3 },
			{ twist: 1.4 },
			{ curl: 1.7 },
			{ spread: 1.5 },
			{ hollow: 0.9 },
			{ symmetry: 7 },
			{ seed: 1929 }
		]) {
			expect(generateSplats({ ...DEFAULT_SETTINGS, ...patch }, 40).positions).not.toEqual(baseline);
		}
	});

	it.each(PRESETS)('$name responds to every shape knob across its full bounded range', (preset) => {
		const settings = presetSettings(preset.id, 1847);
		const knobs: NumericSetting[] = ['scale', 'twist', 'curl', 'spread', 'hollow', 'symmetry'];
		for (const knob of knobs) {
			const { min, max } = NUMERIC_LIMITS[knob];
			const low = generateSplats({ ...settings, [knob]: min }, 160);
			const high = generateSplats({ ...settings, [knob]: max }, 160);
			for (const geometry of [low, high]) {
				expect(
					Array.from(geometry.positions).every(Number.isFinite),
					`${knob} finite positions`
				).toBe(true);
				expect(
					Array.from(geometry.tangents).every(Number.isFinite),
					`${knob} finite tangents`
				).toBe(true);
			}
			const rms = Math.sqrt(
				low.positions.reduce((sum, value, i) => sum + (value - high.positions[i]) ** 2, 0) /
					low.positions.length
			);
			expect(rms, `${knob} produces a visible geometric change`).toBeGreaterThan(0.005);
		}
	});

	it('handles invalid budgets without allocating unbounded buffers', () => {
		expect(generateSplats(DEFAULT_SETTINGS, -10).positions.length).toBe(0);
		expect(generateSplats(DEFAULT_SETTINGS, NaN).positions.length).toBe(0);
		expect(generateSplats(DEFAULT_SETTINGS, 4.9).positions.length).toBe(12);
	});
});
