import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MetricsChart, {
	nearestMetricIndex
} from '$lib/components/visualizations/gradient-descent/MetricsChart.svelte';
import type { SimulationHistoryPoint } from './types';

const HISTORY: readonly SimulationHistoryPoint[] = [
	{
		iteration: 0,
		optimizerUpdates: 0,
		activeGradientComputations: 0,
		additionalFullGradientComputations: 0,
		activeGradientExamplesProcessed: null,
		diagnosticExamplesProcessed: null,
		gradientEvaluations: 0,
		theta: [9, 0],
		loss: 1,
		gradient: null,
		fullGradient: null,
		update: null,
		gradientNorm: null,
		stepNorm: null,
		optimizerDiagnostics: null,
		batchIndices: null
	}
];

const MULTI_STEP_HISTORY: readonly SimulationHistoryPoint[] = [
	HISTORY[0],
	{
		...HISTORY[0],
		iteration: 1,
		gradientEvaluations: 2,
		theta: [8, 0],
		loss: 0.5
	}
];

describe('MetricsChart iteration selection', () => {
	it('selects the nearest finite stored x value with deterministic ties', () => {
		expect(nearestMetricIndex([0, 2, 9, 10], 8.2)).toBe(2);
		expect(nearestMetricIndex([0, 2, 9, 10], 9.8)).toBe(3);
		expect(nearestMetricIndex([0, 2], 1)).toBe(0);
		expect(nearestMetricIndex([Number.NaN, 5, Number.POSITIVE_INFINITY], 5.1)).toBe(1);
		expect(nearestMetricIndex([0, 1], Number.NaN)).toBe(-1);
	});

	it('renders a pointer hit target and keeps the range as its keyboard controller', () => {
		const { body } = render(MetricsChart, {
			props: {
				history: MULTI_STEP_HISTORY,
				selectedStepIndex: 1,
				logScale: false
			}
		});

		expect(body).toContain('data-testid="gradient-metrics-hit-target"');
		expect(body).toContain('aria-hidden="true"');
		expect(body).toContain('type="range"');
		expect(body).toContain('aria-describedby="gradient-metrics-selected-readout"');
		expect(body).toContain('aria-valuetext="Iteration 1"');
		expect(body).not.toContain('aria-live');
	});
});

describe('MetricsChart distance references', () => {
	it('labels and computes distance against the nearest declared minimum', () => {
		const { body } = render(MetricsChart, {
			props: {
				history: HISTORY,
				selectedStepIndex: 0,
				metric: 'distance',
				logScale: false,
				knownMinima: [
					{ theta: [0, 0], loss: 0, label: 'left minimum' },
					{ theta: [10, 0], loss: 0, label: 'right minimum' }
				]
			}
		});

		expect(body).toContain('Distance to nearest known minimum');
		expect(body).toContain('nearest of 2 declared minima');
		expect(body).toMatch(/<strong[^>]*>1<\/strong>/);
	});

	it('preserves a named single-reference fallback', () => {
		const { body } = render(MetricsChart, {
			props: {
				history: HISTORY,
				selectedStepIndex: 0,
				metric: 'distance',
				logScale: false,
				referencePoint: [0, 0],
				referenceLabel: 'origin benchmark'
			}
		});

		expect(body).toContain('Distance to origin benchmark');
		expect(body).toMatch(/<strong[^>]*>9<\/strong>/);
	});
});
