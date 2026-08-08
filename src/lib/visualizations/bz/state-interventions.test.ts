import { describe, expect, it } from 'vitest';
import {
	BZCpuSolver,
	BZ_GUIDED_EXPERIMENTS,
	BZ_PRESETS,
	BZ_SCHEMA_VERSION,
	DEFAULT_OREGONATOR_SETUP,
	OREGONATOR_EQUATIONS_ID,
	OREGONATOR_MODEL_VERSION,
	activeAreaMetrics,
	applyBZIntervention,
	applyInterventionsAtStep,
	approximateHomogenization,
	cloneBZFieldState,
	createInitialBZField,
	fivePointLaplacianAt,
	getBZPreset,
	parseBZInterventions,
	recoveredStateForSetup,
	scanSchnakenbergDispersion,
	serializeBZInterventions
} from './index';
import type { BZFieldState, BZInitialCondition, BZIntervention, OregonatorSetup } from './types';

function setup(
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

function squareField(size: number): BZFieldState {
	const length = size * size;
	const u = new Float64Array(length);
	const v = new Float64Array(length);
	const domainMask = new Uint8Array(length);
	const mask = new Uint8Array(length);
	domainMask.fill(1);
	mask.fill(1);
	for (let index = 0; index < length; index += 1) {
		u[index] = 0.1 + index / length;
		v[index] = 0.8 - index / (2 * length);
	}
	return { size, u, v, domainMask, mask };
}

describe('named deterministic initial conditions', () => {
	it('builds a genuine circular active domain and reproducible obstacle mask', () => {
		const configuration = setup({
			gridSize: 33,
			domainSize: 10,
			activeRadius: 4.5,
			maskPreset: 'seeded-obstacles',
			initialCondition: 'heterogeneity',
			seed: 'mask-seed'
		});
		const first = createInitialBZField(configuration);
		const second = createInitialBZField(configuration);
		expect(first.domainMask[0]).toBe(0);
		expect(first.domainMask[16 * 33 + 16]).toBe(1);
		expect(first.mask).toEqual(second.mask);
		expect(first.u).toEqual(second.u);
		expect(first.v).toEqual(second.v);
		expect(createInitialBZField({ ...configuration, seed: 'other-seed' }).u).not.toEqual(first.u);
	});

	it('implements every declared named recipe with finite, positive active state', () => {
		const recipes: readonly BZInitialCondition[] = [
			'uniform-equilibrium',
			'uniform-clock',
			'target-wave',
			'broken-front',
			'paired-fronts',
			'heterogeneity',
			'pacemaker',
			'turing-noise'
		];
		for (const initialCondition of recipes) {
			const state = createInitialBZField(
				setup({ gridSize: 24, domainSize: 8, activeRadius: 3.7, initialCondition })
			);
			const metrics = activeAreaMetrics(state);
			expect(metrics.activeCells).toBeGreaterThan(0);
			expect(metrics.minimumU).toBeGreaterThanOrEqual(0);
			expect(metrics.minimumV).toBeGreaterThanOrEqual(0);
			expect(Number.isFinite(metrics.maximumU)).toBe(true);
			expect(Number.isFinite(metrics.maximumV)).toBe(true);
		}
	});
});

describe('honest approximate homogenization', () => {
	it('preserves active means, leaves inactive storage alone, and reduces each variance monotonically', () => {
		const state = squareField(8);
		state.mask[0] = 0;
		state.u[0] = 999;
		state.v[0] = -999;
		const before = activeAreaMetrics(state);
		let previousVarianceU = before.varianceU;
		let previousVarianceV = before.varianceV;
		for (let pass = 0; pass < 4; pass += 1) {
			const reading = approximateHomogenization(state, 0.5);
			expect(reading.label).toBe('Approximate homogenization');
			expect(reading.after.meanU).toBeCloseTo(before.meanU, 14);
			expect(reading.after.meanV).toBeCloseTo(before.meanV, 14);
			expect(reading.after.varianceU).toBeLessThan(previousVarianceU);
			expect(reading.after.varianceV).toBeLessThan(previousVarianceV);
			previousVarianceU = reading.after.varianceU;
			previousVarianceV = reading.after.varianceV;
		}
		expect(state.u[0]).toBe(999);
		expect(state.v[0]).toBe(-999);
		const uniform = approximateHomogenization(state, 1);
		expect(uniform.after.varianceU).toBeLessThan(1e-28);
		expect(uniform.after.varianceV).toBeLessThan(1e-28);
	});
});

describe('step-indexed scientific interventions', () => {
	it('makes probe strictly non-mutating', () => {
		const configuration = setup({
			gridSize: 5,
			domainSize: 5,
			activeRadius: 2.5,
			geometry: 'square',
			boundary: 'no-flux'
		});
		const state = squareField(5);
		const before = cloneBZFieldState(state);
		const result = applyBZIntervention(state, configuration, {
			schemaVersion: BZ_SCHEMA_VERSION,
			sequence: 0,
			step: 4,
			kind: 'probe',
			point: [0.5, 0.5]
		});
		expect(result.mutated).toBe(false);
		expect(result.probe).toMatchObject({ row: 2, column: 2, index: 12, active: true });
		expect(state.u).toEqual(before.u);
		expect(state.v).toEqual(before.v);
		expect(state.mask).toEqual(before.mask);
	});

	it('paints an impermeable obstacle and restores it by the declared neighbor rule', () => {
		const configuration = setup({
			gridSize: 5,
			domainSize: 5,
			activeRadius: 2.5,
			geometry: 'square',
			boundary: 'no-flux'
		});
		const state = squareField(5);
		const center = 12;
		const neighbourMeanU = (state.u[7] + state.u[17] + state.u[11] + state.u[13]) / 4;
		const neighbourMeanV = (state.v[7] + state.v[17] + state.v[11] + state.v[13]) / 4;
		const obstacleResult = applyBZIntervention(state, configuration, {
			schemaVersion: BZ_SCHEMA_VERSION,
			sequence: 0,
			step: 0,
			kind: 'obstacle',
			from: [0.5, 0.5],
			to: [0.5, 0.5],
			radius: 0.01
		});
		expect(obstacleResult.affectedCells).toBe(1);
		expect(state.domainMask[center]).toBe(1);
		expect(state.mask[center]).toBe(0);

		// The hidden obstacle value cannot leak into a uniform surrounding stencil.
		for (let index = 0; index < state.u.length; index += 1) {
			if (state.mask[index]) state.u[index] = 0.4;
		}
		state.u[center] = 999;
		expect(fivePointLaplacianAt(state.u, state.mask, 5, 2, 1, 'no-flux', 1)).toBe(0);

		// Put the original neighbours back to verify pre-restore neighbor averaging.
		const fresh = squareField(5);
		state.u.set(fresh.u);
		state.v.set(fresh.v);
		const restoreResult = applyBZIntervention(state, configuration, {
			schemaVersion: BZ_SCHEMA_VERSION,
			sequence: 1,
			step: 1,
			kind: 'restore',
			from: [0.5, 0.5],
			to: [0.5, 0.5],
			radius: 0.01,
			initialization: 'neighbor-mean'
		});
		expect(restoreResult.affectedCells).toBe(1);
		expect(state.mask[center]).toBe(1);
		expect(state.u[center]).toBeCloseTo(neighbourMeanU, 15);
		expect(state.v[center]).toBeCloseTo(neighbourMeanV, 15);
	});

	it('never restores cells outside the immutable circular domain', () => {
		const configuration = setup({ gridSize: 9, domainSize: 9, activeRadius: 3.5 });
		const state = createInitialBZField(configuration);
		expect(state.domainMask[0]).toBe(0);
		applyBZIntervention(state, configuration, {
			schemaVersion: BZ_SCHEMA_VERSION,
			sequence: 0,
			step: 0,
			kind: 'restore',
			from: [0, 0],
			to: [0, 0],
			radius: 0.3,
			initialization: 'recovered'
		});
		expect(state.mask[0]).toBe(0);
	});

	it('applies a pacemaker only on its declared model steps', () => {
		const configuration = setup({
			gridSize: 5,
			domainSize: 5,
			activeRadius: 2.5,
			geometry: 'square',
			boundary: 'no-flux'
		});
		const state = createInitialBZField({
			...configuration,
			initialCondition: 'uniform-equilibrium'
		});
		const event: BZIntervention = {
			schemaVersion: BZ_SCHEMA_VERSION,
			sequence: 0,
			step: 2,
			kind: 'pacemaker',
			center: [0.5, 0.5],
			radius: 0.12,
			amount: 0.4,
			periodSteps: 3,
			endStep: 8
		};
		const baseline = state.u[12];
		expect(applyInterventionsAtStep(state, configuration, [event], 1)).toHaveLength(0);
		expect(state.u[12]).toBe(baseline);
		expect(applyInterventionsAtStep(state, configuration, [event], 2)).toHaveLength(1);
		const firstPulse = state.u[12];
		expect(firstPulse).toBeGreaterThan(baseline);
		expect(applyInterventionsAtStep(state, configuration, [event], 4)).toHaveLength(0);
		expect(state.u[12]).toBe(firstPulse);
		expect(applyInterventionsAtStep(state, configuration, [event], 5)).toHaveLength(1);
		expect(state.u[12]).toBeGreaterThan(firstPulse);
		expect(applyInterventionsAtStep(state, configuration, [event], 9)).toHaveLength(0);
	});

	it('round-trips every intervention variant in deterministic step/sequence order', () => {
		const events: BZIntervention[] = [
			{
				schemaVersion: BZ_SCHEMA_VERSION,
				sequence: 7,
				step: 2,
				kind: 'excite',
				center: [0.2, 0.3],
				radius: 0.05,
				amount: 0.4
			},
			{
				schemaVersion: BZ_SCHEMA_VERSION,
				sequence: 0,
				step: 0,
				kind: 'inhibit',
				center: [0.8, 0.3],
				radius: 0.04,
				amount: 0.2
			},
			{
				schemaVersion: BZ_SCHEMA_VERSION,
				sequence: 1,
				step: 1,
				kind: 'cut',
				from: [0.1, 0.5],
				to: [0.9, 0.5],
				width: 0.02,
				targetU: 0.02,
				targetV: 0.28,
				strength: 1
			},
			{
				schemaVersion: BZ_SCHEMA_VERSION,
				sequence: 2,
				step: 1,
				kind: 'obstacle',
				from: [0.4, 0.4],
				to: [0.6, 0.6],
				radius: 0.03
			},
			{
				schemaVersion: BZ_SCHEMA_VERSION,
				sequence: 3,
				step: 3,
				kind: 'restore',
				from: [0.4, 0.4],
				to: [0.6, 0.6],
				radius: 0.03,
				initialization: 'recovered'
			},
			{
				schemaVersion: BZ_SCHEMA_VERSION,
				sequence: 4,
				step: 4,
				kind: 'mix',
				fraction: 0.8
			},
			{
				schemaVersion: BZ_SCHEMA_VERSION,
				sequence: 5,
				step: 5,
				kind: 'probe',
				point: [0.5, 0.5]
			},
			{
				schemaVersion: BZ_SCHEMA_VERSION,
				sequence: 6,
				step: 0,
				kind: 'pacemaker',
				center: [0.5, 0.5],
				radius: 0.04,
				amount: 0.3,
				periodSteps: 10,
				endStep: 100
			}
		];
		const parsed = parseBZInterventions(serializeBZInterventions(events));
		expect(parsed.map((event) => [event.step, event.sequence])).toEqual([
			[0, 0],
			[0, 6],
			[1, 1],
			[1, 2],
			[2, 7],
			[3, 3],
			[4, 4],
			[5, 5]
		]);
		expect(parseBZInterventions(serializeBZInterventions(parsed))).toEqual(parsed);
	});
});

describe('guided metadata and robust qualitative behavior', () => {
	it('declares complete, replayable metadata for all six guides', () => {
		expect(BZ_GUIDED_EXPERIMENTS).toHaveLength(6);
		for (const experiment of BZ_GUIDED_EXPERIMENTS) {
			expect(BZ_PRESETS.some((candidate) => candidate.id === experiment.presetId)).toBe(true);
			expect(Object.keys(experiment.rawParameters).length).toBeGreaterThanOrEqual(5);
			expect(experiment.grid).toBeGreaterThan(1);
			expect(experiment.domainSize).toBeGreaterThan(0);
			expect(experiment.timestep).toBeGreaterThan(0);
			expect(experiment.observationTime).toBeGreaterThan(0);
			expect(experiment.lookFor.length).toBeGreaterThan(20);
			expect(experiment.whatHappened.length).toBeGreaterThan(20);
			expect(experiment.caveat).toMatch(/candidate/u);
		}
	});

	it('keeps a well-mixed clock spatially uniform while its local state changes', () => {
		const base = getBZPreset('well-mixed-clock').setup as OregonatorSetup;
		const configuration = setup({
			...base,
			gridSize: 2,
			domainSize: 2,
			activeRadius: 1,
			geometry: 'square',
			boundary: 'no-flux'
		});
		const solver = new BZCpuSolver(configuration);
		const initialU = solver.state.u[0];
		let minimumU = initialU;
		let maximumU = initialU;
		for (let step = 0; step < 4_000; step += 1) {
			solver.step();
			minimumU = Math.min(minimumU, solver.state.u[0]);
			maximumU = Math.max(maximumU, solver.state.u[0]);
		}
		const metrics = activeAreaMetrics(solver.state);
		expect(metrics.varianceU).toBeLessThan(1e-28);
		expect(metrics.varianceV).toBeLessThan(1e-28);
		expect(maximumU - minimumU).toBeGreaterThan(0.05);
		expect(metrics.minimumU).toBeGreaterThanOrEqual(0);
		expect(metrics.maximumU).toBeLessThan(2);
	});

	it('gives target and collision recipes distinct finite front geometry', () => {
		const target = createInitialBZField(
			setup({ gridSize: 48, domainSize: 12, activeRadius: 5.6, initialCondition: 'target-wave' })
		);
		const paired = createInitialBZField(
			setup({ gridSize: 48, domainSize: 12, activeRadius: 5.6, initialCondition: 'paired-fronts' })
		);
		const equilibrium = recoveredStateForSetup(setup());
		const targetExcited = Array.from(target.u).filter(
			(value) => value > equilibrium.u + 0.2
		).length;
		const pairedExcited = Array.from(paired.u).filter(
			(value) => value > equilibrium.u + 0.2
		).length;
		expect(targetExcited).toBeGreaterThan(0);
		expect(pairedExcited).toBeGreaterThan(targetExcited);
		expect(activeAreaMetrics(target).maximumU).toBeLessThan(1);
		expect(activeAreaMetrics(paired).maximumV).toBeLessThan(1);
	});

	it('advances a localized target excitation outward at equal fixed model time', () => {
		const configuration = setup({
			gridSize: 48,
			domainSize: 12,
			activeRadius: 5.6,
			timestep: 0.0005,
			initialCondition: 'target-wave'
		});
		const solver = new BZCpuSolver(configuration);
		const excitedRadius = (state: Readonly<BZFieldState>): number => {
			let radius = 0;
			for (let row = 0; row < state.size; row += 1) {
				const y = ((row + 0.5) / state.size - 0.5) * configuration.domainSize;
				for (let column = 0; column < state.size; column += 1) {
					const index = row * state.size + column;
					if (!state.mask[index] || state.u[index] <= 0.2) continue;
					const x = ((column + 0.5) / state.size - 0.5) * configuration.domainSize;
					radius = Math.max(radius, Math.hypot(x, y));
				}
			}
			return radius;
		};
		const initialRadius = excitedRadius(solver.state);
		solver.step(500);
		const laterRadius = excitedRadius(solver.state);
		expect(solver.modelTime).toBeCloseTo(0.25, 14);
		expect(initialRadius).toBeGreaterThan(0);
		expect(laterRadius).toBeGreaterThan(initialRadius + 0.5);
		expect(Number.isFinite(activeAreaMetrics(solver.state).maximumU)).toBe(true);
	}, 20_000);

	it('amplifies seeded finite modes only in the declared diffusion-driven comparator', () => {
		const candidate = getBZPreset('diffusion-driven-spots').setup;
		if (candidate.model !== 'schnakenberg') throw new Error('Preset model contract changed.');
		const configuration = { ...candidate, parameters: { ...candidate.parameters }, gridSize: 64 };
		const dispersion = scanSchnakenbergDispersion(configuration);
		expect(dispersion.classification).toBe('classical-diffusion-driven');
		expect(dispersion.resolved).toBe(true);
		const solver = new BZCpuSolver(configuration);
		const before = activeAreaMetrics(solver.state);
		solver.step(2_000);
		const after = activeAreaMetrics(solver.state);
		expect(solver.modelTime).toBeCloseTo(20, 14);
		expect(after.varianceU).toBeGreaterThan(before.varianceU * 3);
		expect(after.meanU).toBeCloseTo(before.meanU, 3);
		expect(after.meanV).toBeCloseTo(before.meanV, 3);
	}, 20_000);
});
