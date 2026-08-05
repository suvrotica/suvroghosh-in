import { describe, expect, it, vi } from 'vitest';
import {
	AnalysisCancelledError,
	classifyLocalHessian,
	computeBasinGrid,
	directionalLossProfile,
	runParticleFlow,
	trajectoryArcLength,
	updateAlignment
} from './analysis';
import { AnalysisWorkerClient } from './analysis-worker-client';
import { createAnalysisWorkerHandler } from './analysis-worker-handler';
import type { AnalysisWorkerResponse } from './analysis-worker-protocol';
import {
	CONTAINED_SADDLE_LANDSCAPE,
	createQuadraticLandscape,
	HIMMELBLAU_LANDSCAPE
} from './landscapes';
import { runSimulation } from './simulation';

describe('analysis helpers', () => {
	it('classifies the contained origin as saddle-like and profiles raw loss along a direction', () => {
		const classification = classifyLocalHessian(CONTAINED_SADDLE_LANDSCAPE.hessian!([0, 0]));
		expect(classification.classification).toBe('saddle-like');
		expect(classification.eigenvalues).toEqual([2, -2]);
		const profile = directionalLossProfile({
			landscape: CONTAINED_SADDLE_LANDSCAPE,
			theta: [0, 0],
			direction: [0, 3],
			radius: 0.5,
			samples: 5
		});
		expect(profile.direction).toEqual([0, 1]);
		expect(profile.directionalDerivative).toBe(0);
		expect(profile.directionalCurvature).toBe(-2);
		expect(profile.points[2]).toMatchObject({ offset: 0, loss: 0, tangentLoss: 0 });
	});

	it('computes deterministic basin cells and preserves the requested grid topology', () => {
		const options = {
			landscape: HIMMELBLAU_LANDSCAPE,
			optimizer: { id: 'gd' as const, learningRate: 0.01 },
			width: 4,
			height: 3,
			maximumIterations: 400,
			classificationTolerance: 0.35,
			seed: 'small-basin'
		};
		const first = computeBasinGrid(options);
		const second = computeBasinGrid(options);
		expect(first).toEqual(second);
		expect(first.cells).toHaveLength(12);
		expect(first.width).toBe(4);
		expect(first.height).toBe(3);
		expect(
			new Set(first.cells.map((cell) => cell.minimumIndex).filter((index) => index !== null)).size
		).toBeGreaterThanOrEqual(2);
	});

	it('runs every released particle through the actual optimizer and exposes complete paths', () => {
		const starts = HIMMELBLAU_LANDSCAPE.knownMinima.map(
			(minimum) => [minimum.theta[0] + 0.1, minimum.theta[1] - 0.1] as const
		);
		const trajectories = runParticleFlow({
			landscape: HIMMELBLAU_LANDSCAPE,
			optimizer: { id: 'momentum', learningRate: 0.005, beta: 0.8 },
			starts,
			maximumIterations: 300,
			classificationTolerance: 0.35
		});
		expect(trajectories).toHaveLength(4);
		for (const [index, trajectory] of trajectories.entries()) {
			expect(trajectory.path[0]).toEqual(starts[index]);
			expect(trajectory.path.at(-1)).toEqual(trajectory.finalTheta);
			expect(trajectory.classification.minimumIndex).toBe(index);
		}
	});

	it('never assigns unresolved basin cells or particles merely because an endpoint is nearby', () => {
		const basin = computeBasinGrid({
			landscape: HIMMELBLAU_LANDSCAPE,
			optimizer: { id: 'gd', learningRate: 0.000001 },
			width: 2,
			height: 2,
			maximumIterations: 1,
			classificationTolerance: 100,
			gradientTolerance: 0
		});
		expect(basin.cells.every((cell) => cell.minimumIndex === null)).toBe(true);

		const [particle] = runParticleFlow({
			landscape: HIMMELBLAU_LANDSCAPE,
			optimizer: { id: 'gd', learningRate: 0.000001 },
			starts: [[3.01, 2.01]],
			maximumIterations: 1,
			classificationTolerance: 100
		});
		expect(particle.status).toBe('iteration-limit');
		expect(particle.classification.minimumIndex).toBeNull();
	});

	it('measures path length and distinguishes update from the negative gradient', () => {
		const snapshot = runSimulation(
			{
				landscape: createQuadraticLandscape({ lambda1: 1, lambda2: 4, rotation: 0 }),
				optimizer: { id: 'momentum', learningRate: 0.1, beta: 0.9 },
				maximumIterations: 4,
				gradientTolerance: 0
			},
			4
		);
		expect(trajectoryArcLength(snapshot)).toBeGreaterThan(0);
		expect(updateAlignment(snapshot, 1)).toBeCloseTo(1, 14);
		expect(updateAlignment(snapshot, 2)).not.toBeCloseTo(1, 6);
	});

	it('honours synchronous cancellation checks', () => {
		expect(() =>
			computeBasinGrid({
				landscape: HIMMELBLAU_LANDSCAPE,
				optimizer: { id: 'gd', learningRate: 0.01 },
				width: 3,
				height: 3,
				shouldCancel: () => true
			})
		).toThrow(AnalysisCancelledError);
	});
});

describe('cancellable analysis worker protocol', () => {
	it('supersedes an older basin generation and completes the newest sweep', async () => {
		const responses: AnalysisWorkerResponse[] = [];
		const handler = createAnalysisWorkerHandler((response) => responses.push(response));
		handler({
			type: 'basin-grid',
			generation: 1,
			payload: {
				landscape: { id: 'himmelblau' },
				optimizer: { id: 'gd', learningRate: 0.01 },
				width: 5,
				height: 5,
				maximumIterations: 100
			}
		});
		handler({
			type: 'stability-sweep',
			generation: 2,
			payload: {
				landscape: { id: 'quadratic' },
				optimizer: { id: 'gd' },
				learningRates: [0.05, 0.3],
				maximumIterations: 8
			}
		});
		await vi.waitFor(
			() => {
				expect(
					responses.some((response) => response.type === 'cancelled' && response.generation === 1)
				).toBe(true);
				expect(
					responses.some(
						(response) => response.type === 'stability-sweep-result' && response.generation === 2
					)
				).toBe(true);
			},
			{ timeout: 2_000 }
		);
	});

	it('uses the asynchronous synchronous fallback and can cancel it', async () => {
		const client = new AnalysisWorkerClient(() => null);
		const sweep = await client.requestStabilitySweep({
			landscape: { id: 'quadratic' },
			optimizer: { id: 'gd' },
			learningRates: [0.05, 0.1],
			maximumIterations: 5
		});
		expect(sweep).toHaveLength(2);

		const pending = client.requestBasinGrid({
			landscape: { id: 'himmelblau' },
			optimizer: { id: 'gd', learningRate: 0.01 },
			width: 10,
			height: 10,
			maximumIterations: 200
		});
		client.cancel();
		await expect(pending).rejects.toBeInstanceOf(AnalysisCancelledError);
		client.terminate();
	});
});
