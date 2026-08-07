import { describe, expect, it } from 'vitest';
import { ReactionDiffusionCpuEngine } from '../engine';
import { REACTION_DIFFUSION_SCHEMA_VERSION } from '../types';
import type { FieldState, GrayScottSetup, Intervention } from '../types';
import { ReferenceGrayScottSimulation, createDeterministicField } from './reference-kernel';

function setup(overrides: Partial<GrayScottSetup> = {}): GrayScottSetup {
	return {
		feed: 0,
		kill: 0,
		diffusionU: 0.1,
		diffusionV: 0.05,
		timestep: 0.1,
		gridSize: 16,
		domainWidth: 16,
		boundary: 'periodic',
		maskPreset: 'open-square',
		initialCondition: 'blank-feed',
		seed: 'kernel-test',
		integrator: 'heun',
		...overrides
	};
}

describe('ReferenceGrayScottSimulation', () => {
	it('creates identical initial arrays for identical setup and seed', () => {
		const first = createDeterministicField(setup({ initialCondition: 'noise-patch' }));
		const second = createDeterministicField(setup({ initialCondition: 'noise-patch' }));
		expect([...first.u]).toEqual([...second.u]);
		expect([...first.v]).toEqual([...second.v]);
		expect([...first.mask]).toEqual([...second.mask]);
	});

	it('leaves the feed equilibrium exactly invariant', () => {
		const simulation = new ReferenceGrayScottSimulation(
			setup({ feed: 0.0367, kill: 0.0649, initialCondition: 'blank-feed' })
		);
		for (let step = 0; step < 10; step += 1) simulation.step();
		const state = simulation.snapshot();
		expect(state.u.every((value) => value === 1)).toBe(true);
		expect(state.v.every((value) => value === 0)).toBe(true);
	});

	it('conserves the periodic mean under pure diffusion while reducing variance', () => {
		const model = setup({ diffusionU: 0, diffusionV: 0.1 });
		const state: FieldState = {
			size: model.gridSize,
			u: new Float64Array(256).fill(0),
			v: Float64Array.from({ length: 256 }, (_, index) => (index % 16 === 0 ? 1 : 0)),
			mask: new Uint8Array(256).fill(1)
		};
		const beforeMean = mean(state.v);
		const beforeVariance = variance(state.v);
		const simulation = new ReferenceGrayScottSimulation(model, state);
		simulation.step();
		const after = simulation.snapshot();
		expect(mean(after.v)).toBeCloseTo(beforeMean, 14);
		expect(variance(after.v)).toBeLessThan(beforeVariance);
	});

	it('matches canonical normalized intervention replay bit for bit', () => {
		const model = setup({
			feed: 0.0367,
			kill: 0.0649,
			initialCondition: 'central-soft-disk'
		});
		const interventions: Intervention[] = [
			{
				schemaVersion: REACTION_DIFFUSION_SCHEMA_VERSION,
				sequence: 0,
				step: 1,
				kind: 'brush',
				tool: 'mixed-pulse',
				shape: 'soft-disk',
				target: 'both',
				from: [0.2, 0.35],
				to: [0.72, 0.61],
				radius: 0.08,
				strength: 0.12,
				falloff: 1.4
			},
			{
				schemaVersion: REACTION_DIFFUSION_SCHEMA_VERSION,
				sequence: 1,
				step: 2,
				kind: 'mask',
				active: false,
				from: [0.48, 0.2],
				to: [0.48, 0.8],
				radius: 0.025
			}
		];
		const canonical = new ReactionDiffusionCpuEngine(model, {
			interventions,
			target: 'both',
			rejectUnsafe: false
		});
		const workerAdapter = new ReferenceGrayScottSimulation(model, undefined, 'both');
		canonical.step(5);
		for (let step = 0; step < 5; step += 1) workerAdapter.step(interventions);
		const expected = canonical.snapshot();
		const actual = workerAdapter.snapshot();
		expect([...actual.u]).toEqual([...expected.u]);
		expect([...actual.v]).toEqual([...expected.v]);
		expect([...actual.mask]).toEqual([...expected.mask]);
	});
});

function mean(values: Float64Array): number {
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function variance(values: Float64Array): number {
	const average = mean(values);
	return values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
}
