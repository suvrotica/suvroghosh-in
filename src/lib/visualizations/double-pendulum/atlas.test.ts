import { describe, expect, it } from 'vitest';
import {
	ATLAS_LIMITS,
	AtlasMemoryCache,
	atlasCacheKey,
	atlasCellAngles,
	computeAtlasRows,
	computePredictionHorizon,
	isAtlasSettings,
	validateAtlasSettings,
	type AtlasSettings
} from './atlas';

function atlasSettings(overrides: Partial<AtlasSettings> = {}): AtlasSettings {
	const base: AtlasSettings = {
		bounds: {
			theta1Min: -Math.PI,
			theta1Max: Math.PI,
			theta2Min: -Math.PI,
			theta2Max: Math.PI
		},
		width: 4,
		height: 3,
		parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
		omega1: 0,
		omega2: 0,
		perturbation: { dimension: 'theta1', magnitude: 1e-5 },
		divergenceThreshold: 0.01,
		maxTime: 0.04,
		dt: 0.01,
		rowsPerChunk: 1
	};
	return {
		...base,
		...overrides,
		bounds: { ...base.bounds, ...overrides.bounds },
		parameters: { ...base.parameters, ...overrides.parameters },
		perturbation: { ...base.perturbation, ...overrides.perturbation }
	};
}

describe('Prediction Horizon Atlas settings', () => {
	it('snapshots valid settings and rejects unsafe bounds, allocation, time, and step requests', () => {
		const source = atlasSettings();
		const validated = validateAtlasSettings(source);
		source.parameters.m1 = 99;
		expect(validated.parameters.m1).toBe(1);
		expect(isAtlasSettings(validated)).toBe(true);

		expect(() =>
			validateAtlasSettings(atlasSettings({ width: ATLAS_LIMITS.maxResolution + 1 }))
		).toThrow(/width/i);
		expect(() =>
			validateAtlasSettings(
				atlasSettings({ bounds: { ...source.bounds, theta1Min: 0, theta1Max: 0 } })
			)
		).toThrow(/theta1Min/i);
		expect(() => validateAtlasSettings(atlasSettings({ maxTime: Number.NaN }))).toThrow(/finite/i);
		expect(() =>
			validateAtlasSettings(
				atlasSettings({
					width: 256,
					height: 256,
					maxTime: 60,
					dt: 1 / 240
				})
			)
		).toThrow(/cell-step safety cap/i);
	});

	it('maps cell centres left-to-right and top-to-bottom without duplicating periodic edges', () => {
		const settings = atlasSettings({ width: 2, height: 2 });
		expect(atlasCellAngles(settings, 0, 0)).toEqual({
			theta1: -Math.PI / 2,
			theta2: Math.PI / 2
		});
		expect(atlasCellAngles(settings, 1, 1)).toEqual({
			theta1: Math.PI / 2,
			theta2: -Math.PI / 2
		});
	});
});

describe('Prediction Horizon Atlas numerics', () => {
	it('distinguishes crossed horizons from time-capped agreement on a small grid', () => {
		const result = computeAtlasRows(
			atlasSettings({
				width: 4,
				height: 3,
				perturbation: { dimension: 'theta1', magnitude: 1e-3 },
				divergenceThreshold: 0.0011,
				maxTime: 0.5,
				dt: 0.005
			}),
			0,
			1
		);
		expect(result.capped.some((value) => value === 0)).toBe(true);
		expect(result.capped.some((value) => value === 1)).toBe(true);
		expect(result.horizons.some((value) => value < 0.5)).toBe(true);
	});

	it('is deterministic per cell and records immediate lower-bob threshold crossings', () => {
		const settings = atlasSettings({
			perturbation: { dimension: 'theta1', magnitude: 1e-3 },
			divergenceThreshold: 1e-4
		});
		const first = computePredictionHorizon(settings, 1, -0.5);
		const replay = computePredictionHorizon(settings, 1, -0.5);
		expect(first).toEqual(replay);
		expect(first).toEqual({ horizon: 0, capped: false, steps: 0 });
	});

	it('produces reproducible progressive rows and marks retained agreement at the time cap', () => {
		const settings = atlasSettings({
			width: 3,
			height: 2,
			perturbation: { dimension: 'theta1', magnitude: 1e-8 },
			divergenceThreshold: 1,
			maxTime: 0.03,
			dt: 0.01
		});
		const first = computeAtlasRows(settings, 0, 2);
		const replay = computeAtlasRows(settings, 0, 2);

		expect(first.horizons).toEqual(replay.horizons);
		expect(first.capped).toEqual(replay.capped);
		expect(first.horizons).toHaveLength(6);
		expect([...first.horizons].every((value) => Math.abs(value - settings.maxTime) < 1e-7)).toBe(
			true
		);
		expect([...first.capped]).toEqual(Array(6).fill(1));
		expect(first).toMatchObject({ completedRows: 2, totalRows: 2, progress: 1 });
	});
});

describe('atlas cache identity', () => {
	it('changes for every experiment field and ignores only the row scheduling batch size', () => {
		const base = atlasSettings();
		const keys = [
			atlasSettings({ bounds: { ...base.bounds, theta1Min: -3 } }),
			atlasSettings({ bounds: { ...base.bounds, theta1Max: 3 } }),
			atlasSettings({ bounds: { ...base.bounds, theta2Min: -3 } }),
			atlasSettings({ bounds: { ...base.bounds, theta2Max: 3 } }),
			atlasSettings({ width: 5 }),
			atlasSettings({ height: 4 }),
			atlasSettings({ parameters: { ...base.parameters, m1: 1.1 } }),
			atlasSettings({ parameters: { ...base.parameters, m2: 1.1 } }),
			atlasSettings({ parameters: { ...base.parameters, l1: 1.1 } }),
			atlasSettings({ parameters: { ...base.parameters, l2: 1.1 } }),
			atlasSettings({ parameters: { ...base.parameters, g: 1.62 } }),
			atlasSettings({ omega1: 0.1 }),
			atlasSettings({ omega2: -0.1 }),
			atlasSettings({ perturbation: { dimension: 'theta2', magnitude: 1e-5 } }),
			atlasSettings({ perturbation: { dimension: 'theta1', magnitude: 1e-6 } }),
			atlasSettings({ divergenceThreshold: 0.02 }),
			atlasSettings({ maxTime: 0.05 }),
			atlasSettings({ dt: 0.005 })
		].map(atlasCacheKey);

		expect(new Set([atlasCacheKey(base), ...keys]).size).toBe(keys.length + 1);
		expect(atlasCacheKey(atlasSettings({ rowsPerChunk: 2 }))).toBe(atlasCacheKey(base));
	});

	it('stores completed arrays defensively in a bounded memory cache', () => {
		const cache = new AtlasMemoryCache(1);
		const firstSettings = atlasSettings({ width: 2, height: 2 });
		const first = {
			width: 2,
			height: 2,
			horizons: new Float32Array([0.01, 0.02, 0.03, 0.04]),
			capped: new Uint8Array([0, 0, 1, 1])
		};
		cache.set(firstSettings, first);
		first.horizons[0] = 99;
		expect(cache.get(firstSettings)?.horizons[0]).toBeCloseTo(0.01);

		const secondSettings = atlasSettings({ width: 2, height: 2, omega1: 0.1 });
		cache.set(secondSettings, {
			width: 2,
			height: 2,
			horizons: new Float32Array(4),
			capped: new Uint8Array(4)
		});
		expect(cache.size).toBe(1);
		expect(cache.get(firstSettings)).toBeUndefined();
	});
});
