import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	classifyBasin,
	releaseParticleStarts,
	runOptimizerRace,
	runStabilitySweep
} from './analysis';
import { sampleGradient } from './gradients';
import {
	CONTAINED_SADDLE_LANDSCAPE,
	createQuadraticLandscape,
	createRegressionLandscape,
	HIMMELBLAU_LANDSCAPE,
	ROSENBROCK_LANDSCAPE
} from './landscapes';
import { SeededRandom } from './prng';
import { GradientDescentSimulation, runSimulation } from './simulation';
import type { LandscapeDefinition, OptimizerConfig } from './types';

afterEach(() => vi.restoreAllMocks());

describe('mathematical acceptance: stochastic sampling and run lifecycle', () => {
	it('8. selects identical seeded minibatches and gradients in identical order', () => {
		const landscape = createRegressionLandscape(false);
		const firstRandom = new SeededRandom('minibatch-proof');
		const secondRandom = new SeededRandom('minibatch-proof');
		const first = Array.from({ length: 12 }, () =>
			sampleGradient(landscape, [0.5, -1], { kind: 'minibatch', batchSize: 2 }, firstRandom)
		);
		const second = Array.from({ length: 12 }, () =>
			sampleGradient(landscape, [0.5, -1], { kind: 'minibatch', batchSize: 2 }, secondRandom)
		);
		expect(first).toEqual(second);
		expect(new Set(first.map((sample) => sample.batchIndices!.join(','))).size).toBeGreaterThan(1);
		for (const sample of first) {
			expect(sample.batchIndices).toHaveLength(2);
			expect(new Set(sample.batchIndices).size).toBe(2);
		}
	});

	it('uses no ambient Math.random for seeded minibatches, noisy gradients, or particle release', () => {
		vi.spyOn(Math, 'random').mockImplementation(() => {
			throw new Error('ambient randomness used');
		});
		const regression = createRegressionLandscape(false);
		expect(() =>
			sampleGradient(regression, [0, 0], { kind: 'minibatch', batchSize: 4 }, new SeededRandom('a'))
		).not.toThrow();
		expect(() =>
			sampleGradient(
				ROSENBROCK_LANDSCAPE,
				[-1, 1],
				{ kind: 'noisy', sigma: 0.2 },
				new SeededRandom('b')
			)
		).not.toThrow();
		expect(() =>
			releaseParticleStarts({
				domain: HIMMELBLAU_LANDSCAPE.domain,
				columns: 3,
				rows: 3,
				jitter: 0.2,
				seed: 'c'
			})
		).not.toThrow();
	});

	it('9. replay reproduces the identical stochastic path, batches, diagnostics and losses', () => {
		const simulation = new GradientDescentSimulation({
			landscape: createRegressionLandscape(false),
			optimizer: { id: 'adam', learningRate: 0.04 },
			gradientMode: { kind: 'minibatch', batchSize: 2 },
			seed: 'descent-replay-proof',
			maximumIterations: 40,
			gradientTolerance: 0
		});
		const first = simulation.run(40);
		const replay = simulation.replay(first.iteration).snapshot();
		expect(replay.history).toEqual(first.history);
		expect(replay.theta).toEqual(first.theta);
		expect(replay.loss).toBe(first.loss);
		expect(replay.gradientEvaluations).toBe(first.gradientEvaluations);
	});

	it('runs internally without materialising and cloning a discarded snapshot per iteration', () => {
		const simulation = new GradientDescentSimulation({
			landscape: createQuadraticLandscape({ lambda1: 1, lambda2: 3, rotation: 0.2 }),
			optimizer: { id: 'momentum', learningRate: 0.02, beta: 0.8 },
			maximumIterations: 80,
			gradientTolerance: 0,
			stepTolerance: 0
		});
		const snapshotSpy = vi.spyOn(simulation, 'snapshot');
		const result = simulation.run(80);
		expect(result.iteration).toBe(80);
		expect(snapshotSpy).toHaveBeenCalledTimes(1);
	});

	it('keeps bulk run deterministic with repeated public steps and bounded histories', () => {
		const config = {
			landscape: createRegressionLandscape(false),
			optimizer: { id: 'adam' as const, learningRate: 0.025 },
			gradientMode: { kind: 'minibatch' as const, batchSize: 2 as const },
			seed: 'bulk-versus-public-step',
			maximumIterations: 30,
			maximumHistoryLength: 7,
			gradientTolerance: 0,
			stepTolerance: 0
		};
		const bulk = new GradientDescentSimulation(config).run(30);
		const steppedSimulation = new GradientDescentSimulation(config);
		let stepped = steppedSimulation.snapshot();
		for (let iteration = 0; iteration < 30; iteration += 1) {
			stepped = steppedSimulation.step();
		}
		expect(bulk).toEqual(stepped);
		expect(bulk.history).toHaveLength(7);
		expect(bulk.history.map((point) => point.iteration)).toEqual([0, 25, 26, 27, 28, 29, 30]);
	});

	it('preserves running status across clock-driven steps and pauses explicitly', () => {
		const simulation = new GradientDescentSimulation({
			landscape: createQuadraticLandscape(),
			optimizer: { id: 'gd', learningRate: 0.01 },
			maximumIterations: 10
		});
		expect(simulation.play().status).toBe('running');
		expect(simulation.step().status).toBe('running');
		expect(simulation.pause().status).toBe('paused');
		expect(simulation.step().status).toBe('paused');
	});

	it('11. recognizes each published Himmelblau minimum and rejects an unclassified centre point', () => {
		HIMMELBLAU_LANDSCAPE.knownMinima.forEach((minimum, minimumIndex) => {
			const classification = classifyBasin(
				[minimum.theta[0] + 0.01, minimum.theta[1] - 0.01],
				HIMMELBLAU_LANDSCAPE.knownMinima,
				0.05
			);
			expect(classification.minimumIndex).toBe(minimumIndex);
			expect(classification.minimum).toBe(minimum);
		});
		expect(classifyBasin([0, 0], HIMMELBLAU_LANDSCAPE.knownMinima, 0.1).minimumIndex).toBeNull();
	});

	it('12. reports a finite domain escape and never clamps the iterate back to the map', () => {
		const landscape = createQuadraticLandscape({ lambda1: 1, lambda2: 1, rotation: 0 });
		const snapshot = runSimulation(
			{
				landscape,
				start: [4, 4],
				optimizer: { id: 'gd', learningRate: 10 },
				maximumIterations: 10
			},
			10
		);
		expect(snapshot.status).toBe('escaped-domain');
		expect(snapshot.theta).toEqual([-36, -36]);
		expect(snapshot.history).toHaveLength(2);
		expect(snapshot.theta[0]).toBeLessThan(landscape.domain.min[0]);
	});

	it('12. reports numerical divergence while retaining the last valid point', () => {
		const landscape = createQuadraticLandscape({ lambda1: 2, lambda2: 3, rotation: 0 });
		const start = [4, 4] as const;
		const snapshot = new GradientDescentSimulation({
			landscape,
			start,
			optimizer: { id: 'gd', learningRate: Number.MAX_VALUE }
		}).step();
		expect(snapshot.status).toBe('numerically-diverged');
		expect(snapshot.theta).toEqual(start);
		expect(snapshot.loss).toBe(landscape.value(start));
		expect(snapshot.history).toHaveLength(1);
		expect(snapshot.gradientEvaluations).toBe(1);
		expect(snapshot.optimizerUpdates).toBe(0);
		expect(snapshot.activeGradientComputations).toBe(1);
		expect(snapshot.additionalFullGradientComputations).toBe(0);
		expect(snapshot.activeGradientExamplesProcessed).toBeNull();
		expect(snapshot.diagnosticExamplesProcessed).toBeNull();
	});

	it.each(['rmsprop', 'adam'] as const)(
		'reports %s accumulator overflow as numerical divergence rather than a zero-step stall',
		(optimizerId) => {
			const landscape: LandscapeDefinition = {
				id: 'quadratic',
				name: 'Finite-gradient overflow probe',
				shortDescription: 'Exercises squared-gradient accumulator overflow.',
				parameterLabels: ['x', 'y'],
				domain: { min: [-1, -1], max: [1, 1] },
				defaultStart: [0, 0],
				defaultLearningRate: 0.1,
				knownMinima: [],
				recommendedCamera: 'probe',
				recommendedHeightMapping: 'linear',
				citationsOrNotes: [],
				value: () => 0,
				gradient: () => [Number.MAX_VALUE, 1],
				hessian: () => [
					[1, 0],
					[0, 1]
				]
			};
			const snapshot = new GradientDescentSimulation({
				landscape,
				optimizer: { id: optimizerId, learningRate: 0.1 },
				maximumIterations: 2
			}).step();
			expect(snapshot.status).toBe('numerically-diverged');
			expect(snapshot.theta).toEqual([0, 0]);
			expect(snapshot.history).toHaveLength(1);
			expect(snapshot.gradientEvaluations).toBe(1);
			expect(snapshot.history[0].gradientEvaluations).toBe(1);
			expect(snapshot.history[0].terminalEvaluation?.fullGradient).toEqual([Number.MAX_VALUE, 1]);
		}
	);

	it.each([
		{ id: 'momentum', learningRate: 1, beta: 0.9 },
		{
			id: 'adam',
			learningRate: 1,
			beta1: 0.9,
			beta2: 0.999,
			epsilon: Number.MIN_VALUE
		}
	] as const satisfies readonly OptimizerConfig[])(
		'does not call $id converged while stored optimizer memory predicts a real update',
		(optimizer) => {
			const simulation = new GradientDescentSimulation({
				landscape: createQuadraticLandscape({ lambda1: 1, lambda2: 1, rotation: 0 }),
				start: [1, 0],
				optimizer,
				maximumIterations: 4,
				gradientTolerance: 1e-12,
				stepTolerance: 1e-12
			});
			expect(simulation.step().theta).toEqual([0, 0]);
			const afterMemoryStep = simulation.step();
			expect(afterMemoryStep.status).toBe('paused');
			expect(afterMemoryStep.iteration).toBe(2);
			expect(afterMemoryStep.theta[0]).not.toBe(0);
			expect(afterMemoryStep.history[2].fullGradient).toEqual([0, 0]);
			expect(afterMemoryStep.history[2].stepNorm).toBeGreaterThan(0.5);
		}
	);

	it('does not call a zero-gradient saddle converged', () => {
		const snapshot = runSimulation(
			{
				landscape: CONTAINED_SADDLE_LANDSCAPE,
				start: [0, 0],
				optimizer: { id: 'gd', learningRate: 0.1 },
				maximumIterations: 2
			},
			2
		);
		expect(snapshot.status).toBe('stalled');
	});

	it('uses the full gradient for stochastic stopping while retaining active-gradient diagnostics', () => {
		const landscape = createRegressionLandscape(false);
		const gradientMode = { kind: 'minibatch' as const, batchSize: 1 as const };
		const seed = 'full-gradient-stopping-proof';
		const firstSample = sampleGradient(landscape, [0, 0], gradientMode, new SeededRandom(seed));
		const selectedPoint = landscape.points[firstSample.batchIndices![0]];
		const start = [0, selectedPoint.y] as const;
		const expectedSample = sampleGradient(landscape, start, gradientMode, new SeededRandom(seed));
		expect(expectedSample.active).toEqual([0, 0]);
		expect(Math.hypot(...expectedSample.full)).toBeGreaterThan(1);

		const snapshot = runSimulation(
			{
				landscape,
				start,
				optimizer: { id: 'gd', learningRate: 0.01 },
				gradientMode,
				seed,
				maximumIterations: 1,
				gradientTolerance: 1e-12
			},
			1
		);
		expect(snapshot.status).toBe('iteration-limit');
		expect(snapshot.theta).toEqual(start);
		expect(snapshot.history[1].gradientNorm).toBe(0);
		expect(Math.hypot(...snapshot.history[1].fullGradient!)).toBeGreaterThan(1);
	});

	it('stops at a full-data optimum before a non-zero minibatch sample can move it away', () => {
		const landscape = createRegressionLandscape(false);
		const start = landscape.knownMinima[0].theta;
		const gradientMode = { kind: 'minibatch' as const, batchSize: 1 as const };
		const seed = 'full-optimum-sample-proof';
		const sample = sampleGradient(landscape, start, gradientMode, new SeededRandom(seed));
		expect(Math.hypot(...sample.full)).toBeLessThan(1e-10);
		expect(Math.hypot(...sample.active)).toBeGreaterThan(1e-3);
		expect(Number.isFinite(sample.angularErrorRadians)).toBe(true);

		const simulation = new GradientDescentSimulation({
			landscape,
			start,
			optimizer: { id: 'gd', learningRate: 0.1 },
			gradientMode,
			seed,
			maximumIterations: 1,
			gradientTolerance: 1e-10
		});
		const snapshot = simulation.run(1);
		expect(snapshot.status).toBe('converged');
		expect(snapshot.theta).toEqual(start);
		expect(snapshot.history).toHaveLength(1);
		expect(snapshot.gradientEvaluations).toBe(1);
		expect(snapshot.history[0].gradientEvaluations).toBe(1);
		expect(snapshot.optimizerUpdates).toBe(0);
		expect(snapshot.activeGradientComputations).toBe(1);
		expect(snapshot.additionalFullGradientComputations).toBe(1);
		expect(snapshot.activeGradientExamplesProcessed).toBe(1);
		expect(snapshot.diagnosticExamplesProcessed).toBe(landscape.points.length);
		expect(snapshot.history[0].gradient).toBeNull();
		expect(snapshot.history[0].terminalEvaluation).toEqual({
			gradient: sample.active,
			fullGradient: sample.full,
			gradientNorm: Math.hypot(...sample.active),
			fullGradientNorm: Math.hypot(...sample.full),
			batchIndices: sample.batchIndices
		});
		expect(simulation.replay().snapshot()).toEqual(snapshot);
	});

	it('reports optimizer work, diagnostics, and regression examples as separate counters', () => {
		const landscape = createRegressionLandscape(false);
		const minibatch = runSimulation(
			{
				landscape,
				optimizer: { id: 'gd', learningRate: 0.01 },
				gradientMode: { kind: 'minibatch', batchSize: 4 },
				maximumIterations: 3,
				gradientTolerance: 0,
				stepTolerance: 0
			},
			3
		);
		expect(minibatch.optimizerUpdates).toBe(3);
		expect(minibatch.activeGradientComputations).toBe(3);
		expect(minibatch.additionalFullGradientComputations).toBe(3);
		expect(minibatch.activeGradientExamplesProcessed).toBe(12);
		expect(minibatch.diagnosticExamplesProcessed).toBe(landscape.points.length * 3);

		const fullBatch = runSimulation(
			{
				landscape,
				optimizer: { id: 'gd', learningRate: 0.01 },
				gradientMode: { kind: 'minibatch', batchSize: 'full' },
				maximumIterations: 2,
				gradientTolerance: 0,
				stepTolerance: 0
			},
			2
		);
		expect(fullBatch.optimizerUpdates).toBe(2);
		expect(fullBatch.activeGradientComputations).toBe(2);
		expect(fullBatch.additionalFullGradientComputations).toBe(0);
		expect(fullBatch.activeGradientExamplesProcessed).toBe(landscape.points.length * 2);
		expect(fullBatch.diagnosticExamplesProcessed).toBe(0);
	});

	it('bounds retained history while preserving iteration zero and current iteration semantics', () => {
		const snapshot = runSimulation(
			{
				landscape: createQuadraticLandscape({ lambda1: 1, lambda2: 2, rotation: 0 }),
				start: [1, -1],
				optimizer: { id: 'gd', learningRate: 0.01 },
				maximumIterations: 20,
				maximumHistoryLength: 5,
				gradientTolerance: 0,
				stepTolerance: 0
			},
			20
		);
		expect(snapshot.iteration).toBe(20);
		expect(snapshot.gradientEvaluations).toBe(20);
		expect(snapshot.history.map((point) => point.iteration)).toEqual([0, 17, 18, 19, 20]);
		expect(snapshot.theta).toEqual(snapshot.history.at(-1)!.theta);

		const invalid = new GradientDescentSimulation({
			landscape: createQuadraticLandscape(),
			optimizer: { id: 'gd', learningRate: 0.01 },
			maximumHistoryLength: 1
		}).snapshot();
		expect(invalid.status).toBe('invalid-configuration');
		expect(invalid.statusMessage).toMatch(/maximumHistoryLength/);
	});

	it('compares optimizers under exactly the same optimizer-update budget', () => {
		const entries = runOptimizerRace({
			landscape: createQuadraticLandscape({ lambda1: 1, lambda2: 4, rotation: 0.2 }),
			optimizers: [
				{ id: 'gd', learningRate: 0.1 },
				{ id: 'momentum', learningRate: 0.05, beta: 0.8 },
				{ id: 'adam', learningRate: 0.05 }
			],
			optimizerUpdateBudget: 12
		});
		expect(entries).toHaveLength(3);
		expect(entries.map((entry) => entry.snapshot.gradientEvaluations)).toEqual([12, 12, 12]);
	});

	it('produces deterministic particle starts and stability sweeps', () => {
		const starts = releaseParticleStarts({
			domain: HIMMELBLAU_LANDSCAPE.domain,
			columns: 4,
			rows: 3,
			jitter: 0.1,
			seed: 'walkers'
		});
		expect(starts).toEqual(
			releaseParticleStarts({
				domain: HIMMELBLAU_LANDSCAPE.domain,
				columns: 4,
				rows: 3,
				jitter: 0.1,
				seed: 'walkers'
			})
		);
		const sweep = runStabilitySweep({
			landscape: createQuadraticLandscape({ lambda1: 1, lambda2: 10, rotation: 0 }),
			optimizer: { id: 'gd' },
			learningRates: [0.05, 0.25],
			maximumIterations: 20
		});
		expect(sweep.map((entry) => entry.learningRate)).toEqual([0.05, 0.25]);
		expect(sweep[0].maximumLoss).toBeLessThanOrEqual(sweep[1].maximumLoss);
	});
});
