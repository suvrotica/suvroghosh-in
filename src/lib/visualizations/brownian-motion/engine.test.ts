import { describe, expect, it } from 'vitest';
import {
	applyBoundaryToParticle,
	BrownianSimulation,
	FreeBrownianModel,
	GaussianSampler,
	LabelledRandomStreams,
	ParticleState,
	TrajectoryBuffer,
	type BoundaryCondition
} from '.';
import { SeededRandom } from '$lib/utils/seeded-random';

const unbounded: BoundaryCondition = { mode: 'unbounded' };
const box = { minX: 0, maxX: 10, minY: 0, maxY: 10 } as const;

function simulation(seed: string, particleCount = 128, diffusion = 0.6): BrownianSimulation {
	return new BrownianSimulation({
		seed,
		particleCount,
		timestep: 1 / 120,
		model: new FreeBrownianModel({ diffusion }),
		initialCondition: { x: 0, y: 0, spread: 0 },
		boundary: unbounded,
		trajectory: { capacity: 16, sampleEverySteps: 10, trackedParticleCount: 8 }
	});
}

describe('labelled deterministic randomness', () => {
	it('replays a known uniform sequence from the shared seeded generator', () => {
		const stream = new LabelledRandomStreams(123).uniform('known');
		expect(Array.from({ length: 6 }, () => stream.next())).toEqual([
			0.8860990388784558, 0.8730613060761243, 0.9751804759725928, 0.8332848756108433,
			0.6071976919192821, 0.9057202041149139
		]);
	});

	it('keeps a labelled stream independent of construction and consumption order', () => {
		const baseline = new LabelledRandomStreams('independent-streams');
		const expected = Array.from({ length: 24 }, () => baseline.uniform('motion-x').next());

		const perturbed = new LabelledRandomStreams('independent-streams');
		for (let index = 0; index < 1_000; index += 1) {
			perturbed.uniform('unrelated').next();
			perturbed.normal('another-subsystem').next();
		}
		const actual = Array.from({ length: 24 }, () => perturbed.uniform('motion-x').next());
		expect(actual).toEqual(expected);
	});

	it('produces finite Gaussian values and reuses the cached Box–Muller partner', () => {
		let calls = 0;
		const values = [0.25, 0.5];
		const sampler = new GaussianSampler({
			next: () => {
				calls += 1;
				return values[(calls - 1) % values.length];
			}
		});
		expect(Number.isFinite(sampler.next())).toBe(true);
		expect(Number.isFinite(sampler.next())).toBe(true);
		expect(calls).toBe(2);

		const seeded = new GaussianSampler(new SeededRandom('finite-gaussian-sequence'));
		for (let index = 0; index < 10_000; index += 1) {
			expect(Number.isFinite(seeded.next())).toBe(true);
		}
	});
});

describe('boundary mappings', () => {
	it('reflects arbitrarily large positive and negative overshoots', () => {
		const state = new ParticleState(1);
		state.alive[0] = 1;
		state.unwrappedX[0] = 37;
		state.unwrappedY[0] = -23;
		applyBoundaryToParticle(state, 0, { mode: 'reflecting', bounds: box });
		expect(state.x[0]).toBe(3);
		expect(state.y[0]).toBe(3);
		expect(state.unwrappedX[0]).toBe(37);
		expect(state.unwrappedY[0]).toBe(-23);
	});

	it('wraps periodic display coordinates while preserving unwrapped displacement', () => {
		const state = new ParticleState(1);
		state.alive[0] = 1;
		state.unwrappedX[0] = 32;
		state.unwrappedY[0] = -1;
		applyBoundaryToParticle(state, 0, { mode: 'periodic', bounds: box });
		expect(state.x[0]).toBe(2);
		expect(state.y[0]).toBe(9);
		expect(state.unwrappedX[0]).toBe(32);
		expect(state.unwrappedY[0]).toBe(-1);
	});

	it('absorbs a crossing particle and leaves it at the wall for rendering', () => {
		const state = new ParticleState(1);
		state.alive[0] = 1;
		state.unwrappedX[0] = 11.5;
		state.unwrappedY[0] = 4;
		applyBoundaryToParticle(state, 0, { mode: 'absorbing', bounds: box });
		expect(state.alive[0]).toBe(0);
		expect(state.x[0]).toBe(10);
		expect(state.y[0]).toBe(4);
		expect(state.unwrappedX[0]).toBe(11.5);
	});
});

describe('BrownianSimulation', () => {
	it('resets to the exact same trajectory with the same seed', () => {
		const run = simulation('reset-replay');
		run.step(240);
		const expectedX = run.state.unwrappedX.slice();
		const expectedY = run.state.unwrappedY.slice();

		run.reset();
		run.step(240);
		expect(run.state.unwrappedX).toEqual(expectedX);
		expect(run.state.unwrappedY).toEqual(expectedY);
		expect(run.clock.stepIndex).toBe(240);
	});

	it('is independent of render-frame partitioning at a fixed timestep', () => {
		const sixtyFrames = simulation('frame-partitions');
		const twentyFrames = simulation('frame-partitions');
		for (let frame = 0; frame < 60; frame += 1) sixtyFrames.advanceFrame(1 / 60);
		for (let frame = 0; frame < 20; frame += 1) twentyFrames.advanceFrame(1 / 20);

		expect(sixtyFrames.clock.stepIndex).toBe(120);
		expect(twentyFrames.clock.stepIndex).toBe(120);
		expect(sixtyFrames.state.unwrappedX).toEqual(twentyFrames.state.unwrappedX);
		expect(sixtyFrames.state.unwrappedY).toEqual(twentyFrames.state.unwrappedY);
	});

	it('recovers the two-dimensional MSD law within seeded ensemble error', () => {
		const diffusion = 0.75;
		const run = simulation('msd-law', 12_000, diffusion);
		run.step(120);
		const measured = run.metrics().meanSquareDisplacement;
		if (measured === null) throw new Error('The unbounded ensemble unexpectedly has no particles.');
		const expected = 4 * diffusion * 1;
		expect(Math.abs(measured - expected) / expected).toBeLessThan(0.05);
	});

	it('keeps only the newest trajectory samples at its fixed capacity', () => {
		const state = new ParticleState(1);
		state.alive[0] = 1;
		const buffer = new TrajectoryBuffer(1, 2, 1);
		for (let time = 0; time < 3; time += 1) {
			state.x[0] = time;
			state.y[0] = -time;
			buffer.push(time, state);
		}
		const trail = buffer.particleTrail(0);
		expect(Array.from(trail.times)).toEqual([1, 2]);
		expect(Array.from(trail.x)).toEqual([1, 2]);
		expect(Array.from(trail.y)).toEqual([-1, -2]);
	});
});
