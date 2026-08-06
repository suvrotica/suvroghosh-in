import { describe, expect, it, vi } from 'vitest';
import {
	AnalysisCancelledError,
	runMomentumStabilitySweep,
	runMomentumStabilitySweepAsync
} from './analysis';
import { AnalysisWorkerClient } from './analysis-worker-client';
import { createAnalysisWorkerHandler } from './analysis-worker-handler';
import type { AnalysisWorkerResponse } from './analysis-worker-protocol';
import { createQuadraticLandscape } from './landscapes';
import { runSimulation } from './simulation';

const landscape = createQuadraticLandscape({ lambda1: 1, lambda2: 4, rotation: 0 });
const commonOptions = {
	landscape,
	start: [1, -1] as const,
	learningRates: [0.01, 0.1, 0.25] as const,
	betaValues: [0, 0.8] as const,
	seed: 'same-weather-seed',
	maximumIterations: 8,
	gradientTolerance: 0,
	stepTolerance: 0
};

describe('two-dimensional momentum stability sweep', () => {
	it('builds a deterministic row-major (beta, log eta) grid under one optimizer-update budget', () => {
		const first = runMomentumStabilitySweep(commonOptions);
		const second = runMomentumStabilitySweep(commonOptions);

		expect(first).toEqual(second);
		expect(first).toMatchObject({
			width: 3,
			height: 2,
			learningRates: [0.01, 0.1, 0.25],
			betaValues: [0, 0.8],
			start: [1, -1],
			seed: 'same-weather-seed',
			maximumIterations: 8
		});
		expect(first.logLearningRates).toEqual([-2, -1, Math.log10(0.25)]);
		expect(first.cells).toHaveLength(6);
		expect(first.cells.map(({ learningRate, beta }) => [learningRate, beta])).toEqual([
			[0.01, 0],
			[0.1, 0],
			[0.25, 0],
			[0.01, 0.8],
			[0.1, 0.8],
			[0.25, 0.8]
		]);
		for (const cell of first.cells) {
			expect(cell.logLearningRate).toBeCloseTo(Math.log10(cell.learningRate), 14);
			expect(cell.gradientEvaluations).toBe(8);
			expect(cell.iterations).toBe(8);
			expect(cell.minimumLoss).toBeLessThanOrEqual(first.initialLoss);
			expect(cell.lossReduction).toBeCloseTo(first.initialLoss - cell.finalLoss, 14);
		}
	});

	it('uses the documented momentum convention, with beta zero matching vanilla GD', () => {
		const grid = runMomentumStabilitySweep(commonOptions);
		const momentumAtBetaZero = grid.cells.find(
			(cell) => cell.beta === 0 && cell.learningRate === 0.1
		)!;
		const vanilla = runSimulation(
			{
				landscape,
				start: commonOptions.start,
				optimizer: { id: 'gd', learningRate: 0.1 },
				seed: commonOptions.seed,
				maximumIterations: commonOptions.maximumIterations,
				gradientTolerance: 0,
				stepTolerance: 0
			},
			commonOptions.maximumIterations
		);
		expect(momentumAtBetaZero.finalTheta).toEqual(vanilla.theta);
		expect(momentumAtBetaZero.finalLoss).toBe(vanilla.loss);
		expect(momentumAtBetaZero.gradientEvaluations).toBe(vanilla.gradientEvaluations);
	});

	it('validates the logarithmic eta and beta axes and honours cancellation', async () => {
		expect(() =>
			runMomentumStabilitySweep({
				...commonOptions,
				learningRates: [0, 0.1]
			})
		).toThrow(/finite positive/);
		expect(() =>
			runMomentumStabilitySweep({
				...commonOptions,
				betaValues: [0.8, 0.5]
			})
		).toThrow(/strictly increasing/);

		let checks = 0;
		await expect(
			runMomentumStabilitySweepAsync({
				...commonOptions,
				shouldCancel: () => ++checks > 2
			})
		).rejects.toBeInstanceOf(AnalysisCancelledError);
	});
});

describe('momentum stability worker path', () => {
	it('handles the typed worker request and emits the complete grid', async () => {
		const responses: AnalysisWorkerResponse[] = [];
		const handler = createAnalysisWorkerHandler((response) => responses.push(response));
		handler({
			type: 'momentum-stability-sweep',
			generation: 7,
			payload: {
				landscape: { id: 'quadratic', quadratic: { lambda1: 1, lambda2: 4, rotation: 0 } },
				start: [1, -1],
				learningRates: [0.01, 0.1],
				betaValues: [0, 0.8],
				seed: 'worker-weather',
				maximumIterations: 4,
				gradientTolerance: 0,
				stepTolerance: 0
			}
		});

		await vi.waitFor(() => {
			const response = responses.find(
				(candidate) => candidate.type === 'momentum-stability-sweep-result'
			);
			expect(response).toMatchObject({
				type: 'momentum-stability-sweep-result',
				generation: 7,
				result: { width: 2, height: 2, maximumIterations: 4 }
			});
		});
	});

	it('supports the no-Worker fallback and cancellation through the shared client', async () => {
		const client = new AnalysisWorkerClient(() => null);
		const result = await client.requestMomentumStabilitySweep({
			landscape: { id: 'quadratic', quadratic: { lambda1: 1, lambda2: 4, rotation: 0 } },
			start: [1, -1],
			learningRates: [0.01, 0.1],
			betaValues: [0, 0.8],
			maximumIterations: 4,
			gradientTolerance: 0,
			stepTolerance: 0
		});
		expect(result.cells).toHaveLength(4);

		const pending = client.requestMomentumStabilitySweep({
			landscape: { id: 'quadratic' },
			learningRates: Array.from({ length: 20 }, (_, index) => 10 ** (-4 + index / 5)),
			betaValues: Array.from({ length: 20 }, (_, index) => index * 0.045),
			maximumIterations: 50
		});
		client.cancel();
		await expect(pending).rejects.toBeInstanceOf(AnalysisCancelledError);
		client.terminate();
	});
});
