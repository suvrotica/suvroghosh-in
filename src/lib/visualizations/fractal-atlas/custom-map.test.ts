import { describe, expect, it } from 'vitest';
import {
	cloneCustomMapRecipe,
	customMapFormula,
	customMapStep,
	customMapSupportsDistanceEstimate,
	identifyCustomMap,
	normalizeCustomMapRecipe,
	transformCustomMapValue
} from './custom-map';
import { createFamilyDefaultState } from './families';
import { iterateCustomMap, iterateMandelbrot } from './math';
import {
	normalizeFractalState,
	parseFractalState,
	parseLocalState,
	serializeFractalState,
	serializeLocalState
} from './state';
import type { CustomMapRecipe } from './types';
import { sampleFractalPoint } from './render/math';
import { fractalFragmentSource } from './render/shaders';

function recipe(changes: Partial<CustomMapRecipe> = {}): CustomMapRecipe {
	return {
		...cloneCustomMapRecipe(),
		...changes,
		memoryCoefficient: {
			...cloneCustomMapRecipe().memoryCoefficient,
			...changes.memoryCoefficient
		}
	};
}

describe('bounded Formula Mutation Laboratory recipes', () => {
	it('accepts only the fixed data grammar and bounds every numerical field', () => {
		const validation = normalizeCustomMapRecipe({
			power: 99.8,
			conjugateBeforePower: true,
			absoluteReal: false,
			absoluteImaginary: true,
			addC: true,
			memoryEnabled: true,
			memoryCoefficient: { re: 500, im: -500 },
			initialZ: 'pixel',
			source: 'globalThis.compromised = true',
			shader: 'while (true) {}'
		});
		expect(validation.recipe).toEqual({
			power: 12,
			conjugateBeforePower: true,
			absoluteReal: false,
			absoluteImaginary: true,
			addC: true,
			memoryEnabled: true,
			memoryCoefficient: { re: 16, im: -16 },
			initialZ: 'pixel'
		});
		expect(validation.issues.some((entry) => entry.message.includes('executable'))).toBe(true);
		expect('source' in validation.recipe).toBe(false);
		expect('shader' in validation.recipe).toBe(false);
	});

	it('applies conjugation, component folds, power, c, then Phoenix memory in exact order', () => {
		const transformed = transformCustomMapValue(
			{ re: -1, im: -2 },
			recipe({
				conjugateBeforePower: true,
				absoluteReal: true,
				absoluteImaginary: false
			})
		);
		expect(transformed).toEqual({ re: 1, im: 2 });
		const next = customMapStep(
			{ re: -1, im: -2 },
			{ re: 2, im: -1 },
			{ re: 0.25, im: -0.5 },
			recipe({
				conjugateBeforePower: true,
				absoluteReal: true,
				memoryEnabled: true,
				memoryCoefficient: { re: 0.5, im: 0.25 }
			})
		);
		// (1 + 2i)² + (0.25 − 0.5i) + (0.5 + 0.25i)(2 − i)
		expect(next.re).toBeCloseTo(-1.5, 12);
		expect(next.im).toBeCloseTo(3.5, 12);
	});

	it('generates an exact recurrence and recognises only conventional recipes', () => {
		const burningShip = recipe({ absoluteReal: true, absoluteImaginary: true });
		expect(customMapFormula(burningShip, 'parameter').full).toBe(
			'T(zₙ) = |Re(zₙ)| + i|Im(zₙ)|; zₙ₊₁ = T(zₙ)² + c; z₀ = 0; pixel supplies c'
		);
		expect(identifyCustomMap(burningShip, 'parameter')).toEqual({
			label: 'Burning Ship',
			conventionalFamily: 'burning-ship',
			conventional: true
		});
		expect(
			identifyCustomMap(recipe({ absoluteReal: true, absoluteImaginary: false }), 'parameter')
		).toEqual({
			label: 'Custom map',
			conventionalFamily: null,
			conventional: false
		});
		expect(
			identifyCustomMap(
				recipe({
					memoryEnabled: true,
					memoryCoefficient: { re: -0.5, im: 0.1 }
				}),
				'dynamical'
			)
		).toEqual({
			label: 'Custom map',
			conventionalFamily: null,
			conventional: false
		});
	});

	it('disables complex-derivative distance estimates for folds and conjugation', () => {
		expect(customMapSupportsDistanceEstimate(recipe(), 'parameter')).toBe(true);
		expect(
			customMapSupportsDistanceEstimate(recipe({ conjugateBeforePower: true }), 'parameter')
		).toBe(false);
		expect(
			customMapSupportsDistanceEstimate(
				recipe({ absoluteReal: true, initialZ: 'pixel' }),
				'dynamical'
			)
		).toBe(false);
		expect(customMapSupportsDistanceEstimate(recipe({ initialZ: 'zero' }), 'dynamical')).toBe(
			false
		);
	});
});

describe('custom-map orbit, state, and renderer parity', () => {
	it('matches the canonical quadratic orbit and updates optional memory after using zₙ₋₁', () => {
		const standard = iterateCustomMap({ re: 2, im: 0 }, recipe(), {
			maxIterations: 20,
			bailout: 2,
			periodicity: false
		});
		const mandelbrot = iterateMandelbrot(
			{ re: 2, im: 0 },
			{ maxIterations: 20, bailout: 2, periodicity: false }
		);
		expect(standard.iterations).toBe(mandelbrot.iterations);
		expect(standard.value).toEqual(mandelbrot.value);

		const memory = iterateCustomMap(
			{ re: 1, im: 0 },
			recipe({
				memoryEnabled: true,
				memoryCoefficient: { re: 0.5, im: 0 },
				initialZ: 'pixel'
			}),
			{
				plane: 'dynamical',
				c: { re: 0, im: 0 },
				maxIterations: 2,
				bailout: 100,
				periodicity: false
			}
		);
		expect(memory.orbit.map((point) => point.value.re)).toEqual([1, 1, 1.5]);
		expect(memory.orbit[2].previous).toEqual({ re: 1, im: 0 });
	});

	it('round-trips recipes through URL and local state and sanitises invalid distance mode', () => {
		const state = createFamilyDefaultState('custom-map');
		state.plane = 'dynamical';
		state.customMap = recipe({
			power: 7,
			conjugateBeforePower: true,
			absoluteReal: true,
			addC: false,
			memoryEnabled: true,
			memoryCoefficient: { re: -0.3, im: 0.2 },
			initialZ: 'pixel'
		});
		const query = serializeFractalState(state);
		expect(query.has('map')).toBe(true);
		expect(parseFractalState(query).state).toEqual(state);
		expect(parseLocalState(serializeLocalState(state)).state).toEqual(state);

		const invalidDistance = normalizeFractalState({ ...state, coloring: 'distance' });
		expect(invalidDistance.state.coloring).toBe('smooth');
		expect(invalidDistance.issues.some((entry) => entry.path === 'coloring')).toBe(true);
	});

	it('matches known CPU escape maps and exposes one fixed, bounded WebGL variant', () => {
		const point = { re: -1.7, im: -0.04 };
		const burningShip = createFamilyDefaultState('burning-ship');
		burningShip.maxIterations = 80;
		const custom = createFamilyDefaultState('custom-map');
		custom.maxIterations = 80;
		custom.customMap = recipe({ absoluteReal: true, absoluteImaginary: true });
		const customSample = sampleFractalPoint(custom, point, 80);
		const knownSample = sampleFractalPoint(burningShip, point, 80);
		expect(customSample.status).toBe(knownSample.status);
		expect(customSample.iterations).toBe(knownSample.iterations);
		expect(customSample.smoothIteration).toBeCloseTo(knownSample.smoothIteration, 12);
		expect(customSample.magnitude).toBeCloseTo(knownSample.magnitude, 12);
		expect(customSample.distanceEstimate).toBe(0);

		const source = fractalFragmentSource('custom-map');
		expect(source).toContain('uniform int u_customConjugate');
		expect(source).toContain('uniform vec2 u_customMemoryCoefficient');
		expect(source).toContain('int exponent = clamp(u_exponent, 2, 12)');
		expect(source).toContain('for (int iteration = 0; iteration < MAX_ITERATIONS; iteration += 1)');
		expect(source).not.toContain('eval(');
		expect(source).not.toContain('new Function');
		expect(source).not.toContain('while (');
	});
});
