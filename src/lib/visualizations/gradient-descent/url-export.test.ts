import { describe, expect, it } from 'vitest';
import {
	createSimulationSummary,
	safeExportStem,
	simulationSummaryJson,
	simulationToCsv
} from './exports';
import { createQuadraticLandscape } from './landscapes';
import { runSimulation } from './simulation';
import {
	parseExperimentUrlState,
	serializeExperimentUrlState,
	type ExperimentUrlState
} from './url-state';

describe('mathematical acceptance: portable experiment state', () => {
	it('10. round-trips URL state within the declared twelve-significant-digit precision', () => {
		const state: ExperimentUrlState = {
			version: 1,
			landscape: {
				id: 'quadratic',
				quadratic: { lambda1: 1.2345678901234, lambda2: 37.987654321987, rotation: -0.731234567891 }
			},
			optimizer: {
				id: 'adam',
				learningRate: 0.004567891234567,
				beta1: 0.812345678912,
				beta2: 0.991234567891,
				epsilon: 1.23456789123e-9
			},
			start: [3.123456789123, -2.987654321987],
			seed: 'descent-url-round-trip',
			speed: 30,
			maximumIterations: 4321,
			gradientTolerance: 2.34567891234e-8,
			gradientMode: { kind: 'noisy', sigma: 0.0123456789123 }
		};
		const parameters = serializeExperimentUrlState(state);
		const parsed = parseExperimentUrlState(parameters);
		expect(parsed.warnings).toEqual([]);
		expect(parsed.state.landscape.id).toBe('quadratic');
		expect(parsed.state.optimizer.id).toBe('adam');
		expect(parsed.state.seed).toBe(state.seed);
		expect(parsed.state.maximumIterations).toBe(state.maximumIterations);
		expect(parsed.state.gradientMode.kind).toBe('noisy');

		const relativeError = (actual: number, expected: number) =>
			Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
		expect(relativeError(parsed.state.start[0], state.start[0])).toBeLessThan(1e-11);
		expect(relativeError(parsed.state.start[1], state.start[1])).toBeLessThan(1e-11);
		expect(
			relativeError(parsed.state.optimizer.learningRate, state.optimizer.learningRate)
		).toBeLessThan(1e-11);
		expect(relativeError(parsed.state.speed, state.speed)).toBeLessThan(1e-11);
		expect(relativeError(parsed.state.gradientTolerance, state.gradientTolerance)).toBeLessThan(
			1e-11
		);
		expect(
			relativeError((parsed.state.gradientMode as { sigma: number }).sigma, 0.0123456789123)
		).toBeLessThan(1e-11);
		expect(relativeError(parsed.state.landscape.quadratic!.lambda1!, 1.2345678901234)).toBeLessThan(
			1e-11
		);
		expect(relativeError(parsed.state.landscape.quadratic!.lambda2!, 37.987654321987)).toBeLessThan(
			1e-11
		);
	});

	it('reports and safely defaults malformed URL controls', () => {
		const parsed = parseExperimentUrlState(
			'v=99&landscape=unknown&optimizer=adam&lr=NaN&x=999&beta1=2&seed='
		);
		expect(parsed.warnings.length).toBeGreaterThanOrEqual(5);
		expect(parsed.state.landscape.id).toBe('rosenbrock');
		expect(parsed.state.optimizer.learningRate).toBeGreaterThan(0);
		expect(parsed.state.start[0]).toBeGreaterThanOrEqual(-2);
	});

	it('round-trips every exposed inclusive optimizer boundary', () => {
		const minimumRate = parseExperimentUrlState('optimizer=gd&lr=0.000001');
		expect(minimumRate.warnings).toEqual([]);
		expect(minimumRate.state.optimizer.learningRate).toBe(1e-6);

		const adam = parseExperimentUrlState('optimizer=adam&lr=10&beta1=0.999&beta2=0.9999&eps=0.1');
		expect(adam.warnings).toEqual([]);
		expect(adam.state.optimizer).toMatchObject({
			learningRate: 10,
			beta1: 0.999,
			beta2: 0.9999,
			epsilon: 0.1
		});
	});

	it('rejects crafted values that the exposed laboratory controls cannot represent', () => {
		const parsed = parseExperimentUrlState(
			'landscape=quadratic&l1=1000&l2=0.001&angle=10&lr=50&speed=23&max=10001&noise=21'
		);
		expect(parsed.warnings.length).toBeGreaterThanOrEqual(7);
		expect(parsed.state.landscape.quadratic).toEqual({
			lambda1: 1,
			lambda2: 14,
			rotation: Math.PI / 6
		});
		expect(parsed.state.optimizer.learningRate).toBe(0.08);
		expect(parsed.state.speed).toBe(12);
		expect(parsed.state.maximumIterations).toBe(2_000);
	});
});

describe('run data alternatives', () => {
	it('exports truthful CSV rows and a versioned JSON summary', () => {
		const snapshot = runSimulation(
			{
				landscape: createQuadraticLandscape({ lambda1: 1, lambda2: 2, rotation: 0 }),
				start: [1, -1],
				optimizer: { id: 'gd', learningRate: 0.1 },
				seed: 'csv-proof',
				maximumIterations: 3,
				gradientTolerance: 0
			},
			3
		);
		const csv = simulationToCsv(snapshot);
		const lines = csv.trim().split('\r\n');
		expect(lines).toHaveLength(snapshot.history.length + 1);
		expect(lines[0]).toContain('raw_loss');
		expect(lines[0]).toContain('cumulative_gradient_evaluations_at_record');
		expect(lines[0]).toContain('transition_from_iteration');
		expect(lines[0]).toContain('active_gradient_at_origin_1');
		expect(lines[1].split(',')[2]).toBe('');
		expect(lines[2].split(',')[2]).toBe('0');
		expect(Number(lines[2].split(',')[3])).toBe(snapshot.history[0].theta[0]);
		expect(lines.at(-1)).toContain(snapshot.status);
		expect(lines.at(-1)).toContain(snapshot.loss.toString());

		const summary = createSimulationSummary(snapshot);
		expect(summary.schema).toBe('suvroghosh.gradient-descent.run');
		expect(summary.version).toBe(1);
		expect(summary.finalTheta).toEqual(snapshot.theta);
		expect(summary.gradientEvaluations).toBe(3);
		expect(JSON.parse(simulationSummaryJson(snapshot))).toEqual(summary);
		expect(safeExportStem(snapshot)).toBe('gradient-descent-quadratic-gd-csv-proof');
	});
});
