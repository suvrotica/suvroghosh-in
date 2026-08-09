import { describe, expect, it } from 'vitest';
import { ATTRACTOR_REGISTRY, getAttractorDefinition } from './registry';
import {
	CONTINUOUS_DERIVATIVES,
	chuaDerivative,
	chuaNonlinearity,
	exactDivergence,
	henonMapStep,
	langfordDerivative,
	mackeyGlassDerivative,
	rabinovichFabrikantDerivative
} from './systems';

function derivative(id: keyof typeof CONTINUOUS_DERIVATIVES, state: number[]): number[] {
	const definition = getAttractorDefinition(id);
	const output = new Float64Array(state.length);
	CONTINUOUS_DERIVATIVES[id]?.(Float64Array.from(state), definition.parameters, output);
	return [...output];
}

function expectVector(actual: readonly number[], expected: readonly number[], digits = 12): void {
	expect(actual).toHaveLength(expected.length);
	for (let index = 0; index < expected.length; index += 1) {
		expect(actual[index]).toBeCloseTo(expected[index], digits);
	}
}

describe('typed attractor registry', () => {
	it('contains exactly the ten distinct required systems and all three families', () => {
		expect(ATTRACTOR_REGISTRY).toHaveLength(10);
		expect(new Set(ATTRACTOR_REGISTRY.map(({ id }) => id)).size).toBe(10);
		expect(new Set(ATTRACTOR_REGISTRY.map(({ family }) => family))).toEqual(
			new Set(['continuous', 'discrete-map', 'delay-system'])
		);
		expect(ATTRACTOR_REGISTRY.map(({ id }) => id)).toEqual([
			'lorenz-63',
			'rossler',
			'thomas',
			'sprott-b',
			'langford',
			'rucklidge',
			'chua',
			'henon',
			'mackey-glass',
			'rabinovich-fabrikant'
		]);
	});

	it('registers the exact canonical integration conventions from the brief', () => {
		expect(getAttractorDefinition('lorenz-63')).toMatchObject({
			parameters: { sigma: 10, rho: 28, beta: 8 / 3 },
			initialState: [1, 1, 1],
			integrator: 'rk4',
			stepSize: 0.005,
			burnInSteps: 5_000
		});
		expect(getAttractorDefinition('rossler')).toMatchObject({
			parameters: { a: 0.2, b: 0.2, c: 5.7 },
			stepSize: 0.01,
			burnInSteps: 10_000
		});
		expect(getAttractorDefinition('thomas')).toMatchObject({
			parameters: { b: 0.18 },
			initialState: [0.1, 0, 0],
			stepSize: 0.01,
			burnInSteps: 40_000
		});
		expect(getAttractorDefinition('langford').equationLatex).toContain('-(x^2+y^2)(1+ez)');
		expect(getAttractorDefinition('henon')).toMatchObject({
			integrator: 'direct-map',
			burnInSteps: 1_000
		});
		expect(getAttractorDefinition('mackey-glass')).toMatchObject({
			integrator: 'delay-rk4',
			stepSize: 0.05,
			burnInSteps: 20_000
		});
		expect(getAttractorDefinition('rabinovich-fabrikant').warnings?.[0]).toBe(
			'Experimental / sensitive to initial conditions and numerical settings.'
		);
	});

	it('has finite calibrated guards, complete projections, classifiers, and authoritative sources', () => {
		for (const definition of ATTRACTOR_REGISTRY) {
			expect(definition.pointCount).toBeGreaterThan(0);
			expect(definition.calibrationSteps).toBeGreaterThan(0);
			expect(definition.escapeRadius).toBeGreaterThan(0);
			expect(definition.maxDerivative).toBeGreaterThan(0);
			expect(definition.projection.labels).toHaveLength(3);
			expect(definition.regionClassifier.labels.length).toBeGreaterThan(1);
			expect(definition.source.doiOrUrl).toMatch(/^https:\/\//u);
		}
	});
});

describe('hand-calculated system equations', () => {
	it('evaluates Lorenz–63, Rössler, Thomas, and Sprott B derivatives', () => {
		expectVector(derivative('lorenz-63', [1, 2, 3]), [10, 23, -6]);
		expectVector(derivative('rossler', [1, 2, 3]), [-5, 1.4, -13.9]);
		expectVector(derivative('thomas', [1, 2, 3]), [
			Math.sin(2) - 0.18,
			Math.sin(3) - 0.36,
			Math.sin(1) - 0.54
		]);
		expectVector(derivative('sprott-b', [2, 3, 4]), [12, -1, -5]);
	});

	it('retains Langford’s full radial term', () => {
		const definition = getAttractorDefinition('langford');
		const state = Float64Array.from([1, 2, 0.5]);
		const output = new Float64Array(3);
		langfordDerivative(state, definition.parameters, output);
		const { a, b, c, d, e, f } = definition.parameters;
		expectVector(
			[...output],
			[
				(0.5 - b) * 1 - d * 2,
				d * 1 + (0.5 - b) * 2,
				c + a * 0.5 - 0.5 ** 3 / 3 - (1 ** 2 + 2 ** 2) * (1 + e * 0.5) + f * 0.5
			]
		);
	});

	it('evaluates Rucklidge and Rabinovich–Fabrikant at hand-calculated states', () => {
		expectVector(derivative('rucklidge', [1, 2, 3]), [5.4, 1, 1]);
		const definition = getAttractorDefinition('rabinovich-fabrikant');
		const output = new Float64Array(3);
		rabinovichFabrikantDerivative(Float64Array.from([1, 2, 3]), definition.parameters, output);
		expectVector([...output], [6.1, 9.2, -2 * 3 * (0.2876 + 2)]);
	});

	it('tests all three Chua piecewise regions and its derivative', () => {
		const { m0, m1 } = getAttractorDefinition('chua').parameters;
		expect(chuaNonlinearity(-2, m0, m1)).toBeCloseTo(m1 * -2 - (m0 - m1), 14);
		expect(chuaNonlinearity(0.5, m0, m1)).toBeCloseTo(m0 * 0.5, 14);
		expect(chuaNonlinearity(2, m0, m1)).toBeCloseTo(m1 * 2 + (m0 - m1), 14);
		const state = Float64Array.from([2, 0.5, -1]);
		const output = new Float64Array(3);
		const definition = getAttractorDefinition('chua');
		chuaDerivative(state, definition.parameters, output);
		const h = chuaNonlinearity(2, m0, m1);
		expectVector([...output], [15.6 * (0.5 - 2 - h), 0.5, -14]);
	});

	it('iterates Hénon directly and evaluates the Mackey–Glass delayed derivative', () => {
		const henon = getAttractorDefinition('henon');
		const output = new Float64Array(2);
		henonMapStep(Float64Array.from([0, 0]), henon.parameters, output);
		expectVector([...output], [1, 0]);
		henonMapStep(output.slice(), henon.parameters, output);
		expectVector([...output], [-0.4, 0.3]);
		const mackey = getAttractorDefinition('mackey-glass');
		expect(mackeyGlassDerivative(1.2, 1.2, mackey.parameters)).toBeCloseTo(
			(0.2 * 1.2) / (1 + 1.2 ** 10) - 0.1 * 1.2,
			14
		);
	});
});

describe('divergence regression identities', () => {
	it.each([
		['lorenz-63', -(10 + 1 + 8 / 3)],
		['thomas', -0.54],
		['sprott-b', -1],
		['rucklidge', -3],
		['rabinovich-fabrikant', -0.3752]
	] as const)('%s has its exact registered identity', (id, expected) => {
		const definition = getAttractorDefinition(id);
		expect(exactDivergence(id, [0.7, -0.2, 1.3], definition.parameters)).toBeCloseTo(expected, 12);
		expect(definition.divergenceCheck?.expected).toBeCloseTo(expected, 12);
	});
});
