import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import StepMicroscope from '$lib/components/visualizations/gradient-descent/StepMicroscope.svelte';
import type { SimulationHistoryPoint, Vector2 } from './types';

function record(fullGradient: Vector2): SimulationHistoryPoint {
	return {
		iteration: 4,
		gradientEvaluations: 4,
		theta: [0.5, -0.25],
		loss: 2,
		gradient: fullGradient,
		fullGradient,
		update: [-0.01, 0.005],
		gradientNorm: Math.hypot(...fullGradient),
		stepNorm: Math.hypot(0.01, 0.005),
		optimizerDiagnostics: null,
		batchIndices: null
	};
}

const POSITIVE_DEFINITE = {
	values: [2, 5] as const,
	vectors: [[1, 0] as const, [0, 1] as const] as const,
	// This legacy Hessian-only label must not force stationary-point wording.
	classification: 'minimum-like'
};

describe('StepMicroscope curvature language', () => {
	it('uses definiteness rather than minimum wording away from stationarity', () => {
		const { body } = render(StepMicroscope, {
			props: {
				record: record([3, 4]),
				eigensystem: POSITIVE_DEFINITE,
				showProfile: false,
				showTangentPlane: false
			}
		});

		expect(body).toContain('Positive-definite curvature');
		expect(body).not.toContain('Stationary minimum-like point');
		expect(body).toContain('curvature classification rather than a stationary-point claim');
	});

	it('uses stationary minimum-like wording only with a near-zero full gradient', () => {
		const { body } = render(StepMicroscope, {
			props: {
				record: record([1e-10, -1e-10]),
				eigensystem: POSITIVE_DEFINITE,
				stationaryGradientTolerance: 1e-7,
				showProfile: false,
				showTangentPlane: false
			}
		});

		expect(body).toContain('Stationary minimum-like point');
		expect(body).toContain('locally consistent with a strict minimum');
	});

	it('calls a nonstationary mixed-sign Hessian indefinite curvature, not a saddle point', () => {
		const { body } = render(StepMicroscope, {
			props: {
				record: record([1, 0]),
				eigensystem: {
					values: [-2, 3],
					vectors: [
						[1, 0],
						[0, 1]
					]
				},
				showProfile: false,
				showTangentPlane: false
			}
		});

		expect(body).toContain('Indefinite curvature');
		expect(body).not.toContain('Stationary saddle point');
	});

	it('labels post-update optimizer memory with its recorded diagnostic iteration', () => {
		const origin = record([1, 0]);
		const withMemory: SimulationHistoryPoint = {
			...origin,
			optimizerDiagnostics: {
				optimizer: 'momentum',
				iteration: 5,
				gradient: [1, 0],
				effectiveDirection: [0.75, 0],
				update: [-0.01, 0],
				stepNorm: 0.01,
				velocity: [0.75, 0]
			}
		};
		const { body } = render(StepMicroscope, {
			props: {
				record: withMemory,
				eigensystem: POSITIVE_DEFINITE,
				auxiliaryVectors: [{ label: 'Momentum velocity vₜ', vector: [0.75, 0], kind: 'memory' }],
				showProfile: false,
				showTangentPlane: false
			}
		});

		expect(body).toContain('Momentum velocity v[5] after update 5');
		expect(body).toContain('θ[4] → θ[5]');
		expect(body).not.toContain('velocity vₜ');
	});

	it('calls an uphill accepted update wrong-way when lower samples are on the opposite half-ray', () => {
		const { body } = render(StepMicroscope, {
			props: {
				record: record([1, 0]),
				eigensystem: POSITIVE_DEFINITE,
				profile: [
					{ alpha: -1, loss: 0 },
					{ alpha: 0, loss: 2 },
					{ alpha: 0.1, loss: 3 }
				],
				profileChosenAlpha: 0.1,
				nextLoss: 3,
				showProfile: true,
				showTangentPlane: false
			}
		});

		expect(body).toContain('Update climbs in this slice');
		expect(body).toContain('lower displayed values lie on the opposite half');
		expect(body).not.toContain('Overshoot in this slice');
	});
});
