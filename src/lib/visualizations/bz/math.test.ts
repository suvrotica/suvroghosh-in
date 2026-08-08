import { describe, expect, it } from 'vitest';
import {
	BZCpuSolver,
	BZ_PRESETS,
	DEFAULT_OREGONATOR_SETUP,
	DEFAULT_SCHNAKENBERG_SETUP,
	OREGONATOR_EQUATIONS_ID,
	OREGONATOR_MODEL_VERSION,
	SCHNAKENBERG_EQUATIONS_ID,
	SCHNAKENBERG_MODEL_VERSION,
	SeededRandom,
	assertValidBZSetup,
	activeAreaMetrics,
	createBZRandom,
	eigenvalues2x2,
	normalizeBZSetup,
	oregonatorReaction,
	oregonatorRecoveredEquilibrium,
	scanSchnakenbergDispersion,
	schnakenbergEquilibrium,
	schnakenbergJacobian,
	schnakenbergReaction
} from './index';
import type { OregonatorSetup, SchnakenbergSetup } from './types';

function oregonator(
	overrides: Partial<Omit<OregonatorSetup, 'parameters'>> & {
		parameters?: Partial<OregonatorSetup['parameters']>;
	} = {}
): OregonatorSetup {
	return {
		...DEFAULT_OREGONATOR_SETUP,
		...overrides,
		model: 'oregonator',
		modelVersion: OREGONATOR_MODEL_VERSION,
		equationsId: OREGONATOR_EQUATIONS_ID,
		parameters: { ...DEFAULT_OREGONATOR_SETUP.parameters, ...overrides.parameters }
	};
}

function schnakenberg(
	overrides: Partial<Omit<SchnakenbergSetup, 'parameters'>> & {
		parameters?: Partial<SchnakenbergSetup['parameters']>;
	} = {}
): SchnakenbergSetup {
	return {
		...DEFAULT_SCHNAKENBERG_SETUP,
		...overrides,
		model: 'schnakenberg',
		modelVersion: SCHNAKENBERG_MODEL_VERSION,
		equationsId: SCHNAKENBERG_EQUATIONS_ID,
		parameters: { ...DEFAULT_SCHNAKENBERG_SETUP.parameters, ...overrides.parameters }
	};
}

describe('deterministic BZ random streams', () => {
	it('replays a stream exactly and keeps named forks consumption-order independent', () => {
		const first = createBZRandom('same-seed', 'heterogeneity');
		const second = createBZRandom('same-seed', 'heterogeneity');
		expect(Array.from({ length: 12 }, () => first.next())).toEqual(
			Array.from({ length: 12 }, () => second.next())
		);

		const root = new SeededRandom('fork-seed');
		const before = root.fork('a');
		root.next();
		root.next();
		const after = root.fork('a');
		expect(Array.from({ length: 8 }, () => before.next())).toEqual(
			Array.from({ length: 8 }, () => after.next())
		);
		expect(createBZRandom('same-seed', 'a').next()).not.toBe(
			createBZRandom('same-seed', 'b').next()
		);
	});
});

describe('strict setup validation and normalization', () => {
	it('accepts canonical discriminated setups and rejects inconsistent model identity', () => {
		expect(() => assertValidBZSetup(oregonator())).not.toThrow();
		expect(() => assertValidBZSetup(schnakenberg())).not.toThrow();
		expect(() =>
			assertValidBZSetup({
				...oregonator(),
				modelVersion: SCHNAKENBERG_MODEL_VERSION as typeof OREGONATOR_MODEL_VERSION
			})
		).toThrow(/identity/u);
		expect(() =>
			assertValidBZSetup({ ...oregonator(), boundary: 'periodic', geometry: 'circular-dish' })
		).toThrow(/square/u);
	});

	it('normalizes untrusted numbers and explicitly turns a periodic dish into a square', () => {
		const result = normalizeBZSetup({
			model: 'oregonator',
			parameters: { epsilon: -5, q: 'bad', f: 999 },
			diffusionU: -1,
			diffusionV: Number.NaN,
			timestep: 999,
			gridSize: 18.6,
			domainSize: 10,
			activeRadius: 20,
			boundary: 'periodic',
			geometry: 'circular-dish',
			seed: 42
		});
		expect(result.issues.length).toBeGreaterThan(5);
		expect(result.setup.geometry).toBe('square');
		expect(result.setup.boundary).toBe('periodic');
		expect(result.setup.gridSize).toBe(19);
		expect(result.setup.activeRadius).toBe(5);
		expect(result.setup.diffusionU).toBe(0);
		expect(() => assertValidBZSetup(result.setup)).not.toThrow();
	});
});

describe('exact reaction mathematics', () => {
	it('matches hand-computed Oregonator and Schnakenberg reaction terms', () => {
		const oregonatorValue = oregonatorReaction(0.2, 0.1, { epsilon: 0.5, q: 0.05, f: 1.2 });
		expect(oregonatorValue.u).toBeCloseTo(0.176, 14);
		expect(oregonatorValue.v).toBeCloseTo(0.1, 14);

		const schnakenbergValue = schnakenbergReaction(2, 0.5, { a: 0.1, b: 0.9, gamma: 2 });
		expect(schnakenbergValue.u).toBeCloseTo(0.2, 14);
		expect(schnakenbergValue.v).toBeCloseTo(-2.2, 14);
		expect(() => oregonatorReaction(-0.05, 0.1, { epsilon: 0.5, q: 0.05, f: 1.2 })).toThrow(
			/denominator/u
		);
	});

	it('returns equilibria whose reaction terms vanish', () => {
		const oregonatorParameters = { epsilon: 0.02, q: 0.002, f: 1.4 };
		const oregonatorEquilibrium = oregonatorRecoveredEquilibrium(oregonatorParameters);
		const oregonatorDerivative = oregonatorReaction(
			oregonatorEquilibrium.u,
			oregonatorEquilibrium.v,
			oregonatorParameters
		);
		expect(oregonatorDerivative.u).toBeCloseTo(0, 12);
		expect(oregonatorDerivative.v).toBe(0);

		const schnakenbergParameters = { a: 0.1, b: 0.9, gamma: 1 };
		const schnakenbergState = schnakenbergEquilibrium(schnakenbergParameters);
		const schnakenbergDerivative = schnakenbergReaction(
			schnakenbergState.u,
			schnakenbergState.v,
			schnakenbergParameters
		);
		expect(schnakenbergState).toEqual({ u: 1, v: 0.9 });
		expect(schnakenbergDerivative.u).toBeCloseTo(0, 14);
		expect(schnakenbergDerivative.v).toBeCloseTo(0, 14);
	});
});

describe('Schnakenberg linear stability', () => {
	it('computes the exact equilibrium Jacobian and complex 2x2 eigenvalues', () => {
		const jacobian = schnakenbergJacobian({ a: 0.1, b: 0.9, gamma: 1 });
		expect(jacobian.matrix[0]).toBeCloseTo(0.8, 14);
		expect(jacobian.matrix[1]).toBeCloseTo(1, 14);
		expect(jacobian.matrix[2]).toBeCloseTo(-1.8, 14);
		expect(jacobian.matrix[3]).toBeCloseTo(-1, 14);
		expect(jacobian.trace).toBeCloseTo(-0.2, 14);
		expect(jacobian.determinant).toBeCloseTo(1, 14);
		expect(jacobian.eigenvalues[0].real).toBeCloseTo(-0.1, 14);
		expect(jacobian.eigenvalues[0].imaginary).toBeCloseTo(Math.sqrt(3.96) / 2, 14);

		expect(eigenvalues2x2([3, 0, 0, -2])).toEqual([
			{ real: 3, imaginary: 0 },
			{ real: -2, imaginary: 0 }
		]);
	});

	it('distinguishes a stable uniform setup from a resolved diffusion-driven one', () => {
		const stable = scanSchnakenbergDispersion(schnakenberg({ diffusionU: 0.01, diffusionV: 0.01 }));
		expect(stable.zeroModeGrowth).toBeLessThan(0);
		expect(stable.maximumGrowth).toBeLessThan(0);
		expect(stable.classification).toBe('linearly-stable');

		const turing = scanSchnakenbergDispersion(schnakenberg({ diffusionU: 0.01, diffusionV: 0.1 }));
		expect(turing.zeroModeGrowth).toBeLessThan(0);
		expect(turing.maximumGrowth).toBeGreaterThan(0);
		expect(turing.classification).toBe('classical-diffusion-driven');
		expect(turing.fastestWavenumber).toBeGreaterThan(0);
		expect(turing.predictedWavelength).toBeGreaterThan(0);
		expect(turing.resolved).toBe(true);
	});

	it('keeps preset claims testable and labels every record as a candidate', () => {
		for (const preset of BZ_PRESETS) {
			expect(preset.calibrationModelTime).toBeGreaterThan(0);
			expect(preset.diagnostics.validationStatus).toBe('candidate');
			expect(preset.caveat).toMatch(/candidate/u);
			if (preset.setup.model === 'oregonator') {
				expect(preset.setup.diffusionV).toBe(0);
				expect(preset.caveat).toMatch(/Dv = 0/u);
			}
			if (preset.id.startsWith('diffusion-driven-') || preset.id === 'labyrinth') {
				const reading = scanSchnakenbergDispersion(preset.setup as SchnakenbergSetup);
				expect(reading.classification).toBe('classical-diffusion-driven');
				expect(reading.resolved).toBe(true);
			}
		}
	});

	it('starts every candidate preset without non-finite values or hidden state repair', () => {
		for (const preset of BZ_PRESETS) {
			const solver = new BZCpuSolver(preset.setup);
			solver.step(20);
			const metrics = activeAreaMetrics(solver.state);
			expect(Number.isFinite(metrics.minimumU), preset.id).toBe(true);
			expect(Number.isFinite(metrics.maximumU), preset.id).toBe(true);
			expect(Number.isFinite(metrics.minimumV), preset.id).toBe(true);
			expect(Number.isFinite(metrics.maximumV), preset.id).toBe(true);
		}
	});
});
