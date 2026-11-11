import { describe, expect, it } from 'vitest';
import { PRESETS, meshDimensions } from './config.ts';
import { axisymmetricStepGain, surfaceEigenvalueBelow } from './diagnostics.ts';
import {
	FingerprintSolver,
	boundaryActivation,
	boundaryLoss,
	equilibrium,
	instability
} from './solver.ts';

describe('fingerprint surface solver', () => {
	it('damps the homogeneous mode but amplifies a resolved discrete surface mode', () => {
		const { u, v } = equilibrium();
		expect(u).toBeCloseTo(9.46626845, 7);
		expect(v).toBeCloseTo(16.2927706, 7);
		const {
			trace,
			determinant,
			unstableEigenvalueRange: [low, high]
		} = instability();
		expect(trace).toBeLessThan(0);
		expect(determinant).toBeGreaterThan(0);
		const mode = surfaceEigenvalueBelow(meshDimensions(240), 0, 0.12548)!;
		expect(mode.eigenvalue).toBeGreaterThan(low);
		expect(mode.eigenvalue).toBeLessThan(high);
		expect(axisymmetricStepGain(mode.eigenvalue)).toBeGreaterThan(1);
		expect(axisymmetricStepGain(0)).toBeLessThan(1);
	});

	it('changes crease onset independently of the nail and recovers both boundary limits', () => {
		expect(boundaryActivation(5, 10)).toBe(0);
		expect(boundaryActivation(60, 10)).toBe(0.5);
		expect(boundaryActivation(111, 10)).toBe(1);
		expect(boundaryLoss(0, 2)).toBe(0);
		expect(boundaryLoss(0.5, 2)).toBe(0.25);
		expect(boundaryLoss(1, 2)).toBe(0.5);

		const early = new FingerprintSolver({ ...PRESETS.arch, noise: 0 }, { meshScale: 0.5 });
		const late = new FingerprintSolver(
			{ ...PRESETS.arch, noise: 0, timing: 24 },
			{ meshScale: 0.5 }
		);
		early.advance(40);
		late.advance(40);
		expect(early.time).toBe(20);
		const crease = early.mesh.columns * (early.mesh.rows - 1) + Math.floor(early.mesh.columns / 2);
		expect(early.frame()[crease]).toBeLessThan(late.frame()[crease]);
		expect(late.frame()[crease]).toBeCloseTo(equilibrium().u, 5);
	});

	it('replays identical settings and changes the starting field with the seed or patch position', () => {
		const options = { meshScale: 0.5 };
		const a = new FingerprintSolver(PRESETS.loop, options);
		const b = new FingerprintSolver(PRESETS.loop, options);
		const anotherSeed = new FingerprintSolver({ ...PRESETS.loop, seed: 30 }, options);
		const movedPatch = new FingerprintSolver({ ...PRESETS.loop, position: 0.15 }, options);
		const baseline = a.frame();
		expect(anotherSeed.frame().some((value, index) => value !== baseline[index])).toBe(true);
		expect(movedPatch.frame().some((value, index) => Math.abs(value - baseline[index]) > 0.5)).toBe(
			true
		);
		a.advance(40);
		b.advance(40);
		const current = b.frame();
		expect(a.frame().every((value, index) => value === current[index])).toBe(true);
	});

	it('loses the initial patch without spatial exchange while diffusion grows contrast', () => {
		const config = { ...PRESETS.loop, noise: 0 };
		const diffusing = new FingerprintSolver(config, { meshScale: 0.5 });
		const local = new FingerprintSolver(config, { meshScale: 0.5, noDiffusion: true });
		diffusing.advance(300);
		local.advance(300);
		const steady = equilibrium().u;
		expect(local.frame().every((value) => Math.abs(value - steady) < 1e-5)).toBe(true);
		expect(diffusing.frame().some((value) => value > steady + 2)).toBe(true);
	});
});
