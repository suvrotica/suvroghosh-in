import { describe, expect, it, vi } from 'vitest';
import {
	AnalysisCancelledError,
	runParticleFlow,
	runParticleFlowAsync,
	type ParticleFlowOptions
} from './analysis';
import { AnalysisWorkerClient } from './analysis-worker-client';
import { createAnalysisWorkerHandler } from './analysis-worker-handler';
import type {
	AnalysisWorkerResponse,
	ParticleFlowAnalysisPayload
} from './analysis-worker-protocol';
import { createLandscape, createQuadraticLandscape } from './landscapes';

const starts = [
	[-1.5, -1],
	[-0.5, 1.25],
	[0.75, -1.5],
	[1.5, 1]
] as const;

const selection = {
	id: 'quadratic' as const,
	quadratic: { lambda1: 1, lambda2: 3, rotation: 0.2 }
};

const payload: ParticleFlowAnalysisPayload = {
	landscape: selection,
	optimizer: { id: 'momentum', learningRate: 0.04, beta: 0.75 },
	starts,
	seed: 'particle-worker-proof',
	maximumIterations: 24,
	classificationTolerance: 0.2
};

function coreOptions(): ParticleFlowOptions {
	return {
		...payload,
		landscape: createQuadraticLandscape(selection.quadratic)
	};
}

describe('asynchronous particle flow', () => {
	it('preserves every deterministic path produced by the synchronous implementation', async () => {
		const expected = runParticleFlow(coreOptions());
		const actual = await runParticleFlowAsync(coreOptions());
		expect(actual).toEqual(expected);
		expect(actual.map((trajectory) => trajectory.id)).toEqual([0, 1, 2, 3]);
		actual.forEach((trajectory, index) => {
			expect(trajectory.start).toEqual(starts[index]);
			expect(trajectory.path[0]).toEqual(starts[index]);
			expect(trajectory.path.at(-1)).toEqual(trajectory.finalTheta);
		});
	});

	it('can be cancelled before the first particle or between particles', async () => {
		await expect(
			runParticleFlowAsync({ ...coreOptions(), shouldCancel: () => true })
		).rejects.toBeInstanceOf(AnalysisCancelledError);

		let checks = 0;
		await expect(
			runParticleFlowAsync({
				...coreOptions(),
				shouldCancel: () => ++checks > 1
			})
		).rejects.toBeInstanceOf(AnalysisCancelledError);
	});
});

describe('particle flow worker protocol', () => {
	it('handles a typed request and returns the same deterministic trajectories', async () => {
		const responses: AnalysisWorkerResponse[] = [];
		const handler = createAnalysisWorkerHandler((response) => responses.push(response));
		handler({ type: 'particle-flow', generation: 11, payload });

		await vi.waitFor(() => {
			const response = responses.find((candidate) => candidate.type === 'particle-flow-result');
			expect(response?.type).toBe('particle-flow-result');
			if (response?.type === 'particle-flow-result') {
				expect(response.generation).toBe(11);
				expect(response.result).toEqual(
					runParticleFlow({ ...payload, landscape: createLandscape(payload.landscape) })
				);
			}
		});
	});

	it('supports deterministic no-Worker fallback and shared client cancellation', async () => {
		const client = new AnalysisWorkerClient(() => null);
		const result = await client.requestParticleFlow(payload);
		expect(result).toEqual(
			runParticleFlow({ ...payload, landscape: createLandscape(payload.landscape) })
		);

		const pending = client.requestParticleFlow({
			...payload,
			starts: Array.from({ length: 24 }, (_, index) => [
				-1.8 + (index % 6) * 0.6,
				-1.8 + Math.floor(index / 6) * 0.9
			]),
			maximumIterations: 100
		});
		client.cancel();
		await expect(pending).rejects.toBeInstanceOf(AnalysisCancelledError);
		client.terminate();
	});
});
