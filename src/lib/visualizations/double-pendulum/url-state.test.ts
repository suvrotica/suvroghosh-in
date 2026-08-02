import { describe, expect, it } from 'vitest';
import { validateAtlasSettings } from './atlas';
import { MIN_TIMESTEP } from './integrators';
import { createDefaultConfiguration } from './presets';
import {
	MAX_URL_STATE_LENGTH,
	normalizeConfiguration,
	parseUrlState,
	serializeUrlState
} from './url-state';

describe('double-pendulum URL state', () => {
	it('ships a default atlas experiment that satisfies the worker work budget', () => {
		const configuration = createDefaultConfiguration();
		const atlas = configuration.atlas;
		expect(() =>
			validateAtlasSettings({
				bounds: {
					theta1Min: atlas.theta1Min,
					theta1Max: atlas.theta1Max,
					theta2Min: atlas.theta2Min,
					theta2Max: atlas.theta2Max
				},
				width: atlas.resolution,
				height: atlas.resolution,
				parameters: configuration.parameters,
				omega1: atlas.fixedOmega1,
				omega2: atlas.fixedOmega2,
				perturbation: {
					dimension: atlas.perturbationDimension,
					magnitude: atlas.perturbationMagnitude
				},
				divergenceThreshold: atlas.divergenceThreshold,
				maxTime: atlas.timeCap,
				dt: atlas.timestep,
				rowsPerChunk: 4
			})
		).not.toThrow();
	});

	it('round-trips a complete reproducible configuration without material loss', () => {
		const configuration = createDefaultConfiguration();
		configuration.mode = 'shadow';
		configuration.preset = 'custom';
		configuration.initialState = {
			theta1: 1.234567890123,
			omega1: -0.4321,
			theta2: -2.34567890123,
			omega2: 0.8765
		};
		configuration.parameters = { m1: 1.3, m2: 2.1, l1: 0.85, l2: 1.25, g: 3.71 };
		configuration.timestep = 1 / 720;
		configuration.speed = 2;
		configuration.trailLength = 4_321;
		configuration.perturbationDimension = 'omega2';
		configuration.perturbationMagnitude = 2.5e-9;
		configuration.atlas = {
			theta1Min: -2.5,
			theta1Max: 2.7,
			theta2Min: -2.2,
			theta2Max: 2.4,
			resolution: 192,
			fixedOmega1: 0.2,
			fixedOmega2: -0.3,
			perturbationDimension: 'theta2',
			perturbationMagnitude: 8e-8,
			divergenceThreshold: 0.01,
			timeCap: 12,
			timestep: 1 / 240,
			selectedTheta1: 0.125,
			selectedTheta2: -0.75
		};

		const serialized = serializeUrlState(configuration);
		const parsed = parseUrlState(serialized);
		expect(parsed.issues).toEqual([]);
		expect(parsed.configuration).toEqual(configuration);
	});

	it('falls back or clamps malformed, non-finite, and unsafe values', () => {
		const fallback = createDefaultConfiguration();
		const parsed = parseUrlState(
			'?v=1&mode=banana&th1=NaN&om1=Infinity&m1=-5&l2=9999&g=0' +
				'&dt=-1&speed=99&trail=-4&pdim=nope&eps=0&ares=9999' +
				'&a1min=2&a1max=-2&sel1=Infinity'
		);
		const result = parsed.configuration;
		expect(result.mode).toBe(fallback.mode);
		expect(result.initialState.theta1).toBe(fallback.initialState.theta1);
		expect(result.initialState.omega1).toBe(fallback.initialState.omega1);
		expect(result.parameters.m1).toBe(0.01);
		expect(result.parameters.l2).toBe(20);
		expect(result.parameters.g).toBe(0.05);
		expect(result.timestep).toBe(MIN_TIMESTEP);
		expect(result.speed).toBe(4);
		expect(result.trailLength).toBe(120);
		expect(result.perturbationMagnitude).toBe(1e-12);
		expect(result.atlas.resolution).toBe(256);
		expect(result.atlas.theta1Min).toBe(fallback.atlas.theta1Min);
		expect(result.atlas.theta1Max).toBe(fallback.atlas.theta1Max);
		expect(result.atlas.selectedTheta1).toBeUndefined();
		expect(parsed.issues.length).toBeGreaterThan(8);
	});

	it('supports legacy intelligible parameter names and rejects unsupported versions safely', () => {
		const migrated = parseUrlState(
			'?theta1=0.25&omega1=-0.5&theta2=0.75&omega2=1&mode=shadow-futures'
		);
		expect(migrated.configuration.mode).toBe('shadow');
		expect(migrated.configuration.initialState).toEqual({
			theta1: 0.25,
			omega1: -0.5,
			theta2: 0.75,
			omega2: 1
		});
		const unsupported = parseUrlState('?v=999&th1=1');
		expect(unsupported.unsupportedVersion).toBe(true);
		expect(unsupported.configuration).toEqual(createDefaultConfiguration());
	});

	it('rejects URL modes and integrators that the live laboratory does not implement', () => {
		const fallback = createDefaultConfiguration();
		const parsed = parseUrlState('?mode=choir&int=euler');
		expect(parsed.configuration.mode).toBe(fallback.mode);
		expect(parsed.configuration.integrator).toBe('rk4');
		expect(parsed.issues.some((entry) => entry.path === 'mode')).toBe(true);
		expect(parsed.issues.some((entry) => entry.path === 'integrator')).toBe(true);
	});

	it('bounds direct object input and oversized query strings without throwing', () => {
		const normalized = normalizeConfiguration({
			initialState: { theta1: Number.NaN, omega1: 1e9, theta2: 0, omega2: 0 },
			parameters: { m1: Number.POSITIVE_INFINITY }
		});
		expect(normalized.configuration.initialState.omega1).toBe(100);
		expect(normalized.configuration.parameters.m1).toBe(1);
		expect(normalized.issues.length).toBeGreaterThan(1);
		const boundedAtlas = parseUrlState('?ares=256&acap=60&adt=0.0005');
		expect(boundedAtlas.configuration.atlas.timeCap).toBeLessThan(1);
		expect(boundedAtlas.issues.some((entry) => entry.path === 'atlas.timeCap')).toBe(true);

		const oversized = parseUrlState(`?v=1&padding=${'x'.repeat(MAX_URL_STATE_LENGTH)}`);
		expect(oversized.issues[0]?.message).toContain('safety limit');
		expect(oversized.configuration).toEqual(createDefaultConfiguration());
	});
});
