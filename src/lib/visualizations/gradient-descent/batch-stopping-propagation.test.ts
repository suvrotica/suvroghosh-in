import { describe, expect, it, vi } from 'vitest';
import { computeBasinGrid, runParticleFlow } from './analysis';
import { AnalysisWorkerClient } from './analysis-worker-client';
import { createAnalysisWorkerHandler } from './analysis-worker-handler';
import type {
	AnalysisWorkerResponse,
	BasinAnalysisPayload,
	ParticleFlowAnalysisPayload
} from './analysis-worker-protocol';
import { createLandscape } from './landscapes';

const selection = {
	id: 'quadratic' as const,
	quadratic: { lambda1: 1, lambda2: 1, rotation: 0 }
};

describe('batch-analysis stopping-rule propagation', () => {
	it('threads step tolerance and stall patience through the deterministic basin Worker path', async () => {
		const payload: BasinAnalysisPayload = {
			landscape: selection,
			optimizer: { id: 'gd', learningRate: 0.01 },
			width: 2,
			height: 2,
			maximumIterations: 4,
			gradientTolerance: 0,
			stepTolerance: 1,
			stallPatience: 1,
			classificationTolerance: 0.2,
			seed: 'basin-stopping-proof'
		};
		const expected = computeBasinGrid({
			...payload,
			landscape: createLandscape(payload.landscape)
		});
		expect(expected.cells.every((cell) => cell.status === 'stalled')).toBe(true);
		expect(expected.cells.every((cell) => cell.iterations === 1)).toBe(true);

		const responses: AnalysisWorkerResponse[] = [];
		const handler = createAnalysisWorkerHandler((response) => responses.push(response));
		handler({ type: 'basin-grid', generation: 19, payload });
		await vi.waitFor(() => {
			const response = responses.find((candidate) => candidate.type === 'basin-grid-result');
			expect(response?.type).toBe('basin-grid-result');
			if (response?.type === 'basin-grid-result') expect(response.result).toEqual(expected);
		});
	});

	it('threads all three controls through the deterministic no-Worker particle fallback', async () => {
		const loosePayload: ParticleFlowAnalysisPayload = {
			landscape: selection,
			optimizer: { id: 'gd', learningRate: 0.1 },
			starts: [
				[1, 0],
				[2, 0]
			],
			maximumIterations: 4,
			gradientTolerance: 3,
			stepTolerance: 0,
			stallPatience: 1,
			seed: 'particle-stopping-proof'
		};
		const strictPayload: ParticleFlowAnalysisPayload = {
			...loosePayload,
			gradientTolerance: 0,
			stepTolerance: 0.21,
			stallPatience: 1
		};
		const expectedLoose = runParticleFlow({
			...loosePayload,
			landscape: createLandscape(loosePayload.landscape)
		});
		const expectedStrict = runParticleFlow({
			...strictPayload,
			landscape: createLandscape(strictPayload.landscape)
		});
		expect(expectedLoose.map((trajectory) => trajectory.status)).toEqual([
			'converged',
			'converged'
		]);
		expect(expectedLoose.map((trajectory) => trajectory.path.length)).toEqual([1, 1]);
		expect(expectedStrict.map((trajectory) => trajectory.status)).toEqual(['stalled', 'stalled']);
		expect(expectedStrict.map((trajectory) => trajectory.path.length)).toEqual([2, 2]);

		const client = new AnalysisWorkerClient(() => null);
		expect(await client.requestParticleFlow(loosePayload)).toEqual(expectedLoose);
		expect(await client.requestParticleFlow(strictPayload)).toEqual(expectedStrict);
		// A repeated fallback request must preserve paths and per-particle seed order.
		expect(await client.requestParticleFlow(strictPayload)).toEqual(expectedStrict);
		client.terminate();
	});
});
