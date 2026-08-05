import { describe, expect, it, vi } from 'vitest';
import { runStabilitySweep } from './analysis';
import { AnalysisWorkerClient } from './analysis-worker-client';
import { createAnalysisWorkerHandler } from './analysis-worker-handler';
import type { AnalysisWorkerResponse, StabilityAnalysisPayload } from './analysis-worker-protocol';
import { createQuadraticLandscape } from './landscapes';

const landscape = createQuadraticLandscape({ lambda1: 1, lambda2: 2, rotation: 0 });
const selection = {
	id: 'quadratic' as const,
	quadratic: { lambda1: 1, lambda2: 2, rotation: 0 }
};
const common = {
	landscape,
	start: [1, 0] as const,
	optimizer: { id: 'gd' as const },
	learningRates: [0.1],
	maximumIterations: 4
};

describe('one-dimensional stability sweep stopping rules', () => {
	it('changes the measured regime when the full-gradient tolerance changes', () => {
		const strict = runStabilitySweep({
			...common,
			gradientTolerance: 0,
			stepTolerance: 0
		})[0];
		const loose = runStabilitySweep({
			...common,
			gradientTolerance: 2,
			stepTolerance: 0
		})[0];

		expect(strict).toMatchObject({ status: 'iteration-limit', iterations: 4 });
		expect(loose).toMatchObject({ status: 'converged', iterations: 0 });
		expect(loose.finalTheta).toEqual(common.start);
		expect(strict.finalLoss).toBeLessThan(loose.finalLoss);
	});

	it('threads step tolerance and stall patience into every cell simulation', () => {
		const stalled = runStabilitySweep({
			...common,
			gradientTolerance: 0,
			stepTolerance: 0.2,
			stallPatience: 1
		})[0];
		const notStalled = runStabilitySweep({
			...common,
			gradientTolerance: 0,
			stepTolerance: 0,
			stallPatience: 1
		})[0];

		expect(stalled).toMatchObject({ status: 'stalled', iterations: 1 });
		expect(notStalled).toMatchObject({ status: 'iteration-limit', iterations: 4 });
	});
});

describe('stability stopping rules through the worker boundary', () => {
	it('honours gradient tolerance in the typed Worker handler payload', async () => {
		const responses: AnalysisWorkerResponse[] = [];
		const handler = createAnalysisWorkerHandler((response) => responses.push(response));
		const payload: StabilityAnalysisPayload = {
			landscape: selection,
			start: [1, 0],
			optimizer: { id: 'gd' },
			learningRates: [0.1],
			maximumIterations: 4,
			gradientTolerance: 2,
			stepTolerance: 0,
			stallPatience: 2
		};
		handler({ type: 'stability-sweep', generation: 13, payload });

		await vi.waitFor(() => {
			const response = responses.find((candidate) => candidate.type === 'stability-sweep-result');
			expect(response?.type).toBe('stability-sweep-result');
			if (response?.type === 'stability-sweep-result') {
				expect(response.result[0]).toMatchObject({ status: 'converged', iterations: 0 });
			}
		});
	});

	it('honours stall settings in the cancellable no-Worker fallback', async () => {
		const client = new AnalysisWorkerClient(() => null);
		const result = await client.requestStabilitySweep({
			landscape: selection,
			start: [1, 0],
			optimizer: { id: 'gd' },
			learningRates: [0.1],
			maximumIterations: 4,
			gradientTolerance: 0,
			stepTolerance: 0.2,
			stallPatience: 1
		});
		expect(result[0]).toMatchObject({ status: 'stalled', iterations: 1 });
		client.terminate();
	});
});
