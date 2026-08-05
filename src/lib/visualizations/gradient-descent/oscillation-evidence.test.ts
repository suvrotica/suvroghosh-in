import { describe, expect, it, vi } from 'vitest';
import { runMomentumStabilitySweep, runStabilitySweep } from './analysis';
import { AnalysisWorkerClient } from './analysis-worker-client';
import { createAnalysisWorkerHandler } from './analysis-worker-handler';
import type { AnalysisWorkerResponse } from './analysis-worker-protocol';
import { createQuadraticLandscape } from './landscapes';
import { runSimulation } from './simulation';

const landscape = createQuadraticLandscape({ lambda1: 1, lambda2: 1, rotation: 0 });
const selection = {
	id: 'quadratic' as const,
	quadratic: { lambda1: 1, lambda2: 1, rotation: 0 }
};
const stoppingRules = {
	maximumIterations: 8,
	gradientTolerance: 0,
	stepTolerance: 0,
	stallPatience: 8
};

describe('direction-reversal oscillation evidence', () => {
	it('identifies stable eta = 1.5 quadratic GD as oscillatory while its loss decreases monotonically', () => {
		const snapshot = runSimulation(
			{
				landscape,
				start: [1, 0],
				optimizer: { id: 'gd', learningRate: 1.5 },
				...stoppingRules
			},
			stoppingRules.maximumIterations
		);
		const losses = snapshot.history.map((point) => point.loss);
		for (let index = 1; index < losses.length; index += 1) {
			expect(losses[index]).toBeLessThan(losses[index - 1]);
		}

		const [calm, alternating] = runStabilitySweep({
			landscape,
			start: [1, 0],
			optimizer: { id: 'gd' },
			learningRates: [0.5, 1.5],
			...stoppingRules
		});
		expect(alternating).toMatchObject({
			directionReversalCount: 7,
			directionComparisonCount: 7,
			directionReversalRate: 1,
			isOscillatory: true
		});
		expect(calm).toMatchObject({
			directionReversalCount: 0,
			directionComparisonCount: 7,
			directionReversalRate: 0,
			isOscillatory: false
		});
	});

	it('adds the same evidence to every momentum stability cell', () => {
		const grid = runMomentumStabilitySweep({
			landscape,
			start: [1, 0],
			learningRates: [0.5, 1.5],
			betaValues: [0, 0.5],
			...stoppingRules
		});
		const alternating = grid.cells.find((cell) => cell.learningRate === 1.5 && cell.beta === 0);
		expect(alternating).toMatchObject({
			directionReversalCount: 7,
			directionComparisonCount: 7,
			directionReversalRate: 1,
			isOscillatory: true
		});
	});
});

describe('oscillation evidence across analysis execution paths', () => {
	it('survives the typed Worker response unchanged', async () => {
		const responses: AnalysisWorkerResponse[] = [];
		const handler = createAnalysisWorkerHandler((response) => responses.push(response));
		handler({
			type: 'stability-sweep',
			generation: 17,
			payload: {
				landscape: selection,
				start: [1, 0],
				optimizer: { id: 'gd' },
				learningRates: [1.5],
				...stoppingRules
			}
		});

		await vi.waitFor(() => {
			const response = responses.find((candidate) => candidate.type === 'stability-sweep-result');
			expect(response?.type).toBe('stability-sweep-result');
			if (response?.type === 'stability-sweep-result') {
				expect(response.result[0]).toMatchObject({
					directionReversalCount: 7,
					directionReversalRate: 1,
					isOscillatory: true
				});
			}
		});
	});

	it('survives the cancellable no-Worker momentum fallback unchanged', async () => {
		const client = new AnalysisWorkerClient(() => null);
		const result = await client.requestMomentumStabilitySweep({
			landscape: selection,
			start: [1, 0],
			learningRates: [0.5, 1.5],
			betaValues: [0, 0.5],
			...stoppingRules
		});
		const alternating = result.cells.find((cell) => cell.learningRate === 1.5 && cell.beta === 0);
		expect(alternating).toMatchObject({
			directionReversalCount: 7,
			directionComparisonCount: 7,
			directionReversalRate: 1,
			isOscillatory: true
		});
		client.terminate();
	});
});
