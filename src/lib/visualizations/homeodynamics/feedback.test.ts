import { describe, expect, it } from 'vitest';
import {
	FEEDBACK_HOPF_THRESHOLD,
	FEEDBACK_PRESETS,
	classifyFeedbackRegime,
	feedbackEquilibrium,
	historyAt,
	simulateFeedback
} from './feedback';

describe('delayed negative-feedback teaching model', () => {
	it('places the common operating state exactly at one', () => {
		for (const preset of Object.values(FEEDBACK_PRESETS)) {
			expect(feedbackEquilibrium(preset.parameters)).toBeCloseTo(1, 12);
		}
		expect(FEEDBACK_PRESETS.damped.parameters.delay).toBeLessThan(FEEDBACK_HOPF_THRESHOLD);
		expect(FEEDBACK_PRESETS.sustained.parameters.delay).toBeGreaterThan(FEEDBACK_HOPF_THRESHOLD);
	});

	it('uses equilibrium prehistory, the post-impulse zero sample and interpolation', () => {
		const values = new Float64Array([1.6, 1.5]);
		expect(historyAt(-0.01, values, 1, 0.01, 1)).toBe(1);
		expect(historyAt(0, values, 1, 0.01, 1)).toBe(1.6);
		expect(historyAt(0.005, values, 1, 0.01, 1)).toBeCloseTo(1.55, 12);
		expect(() => historyAt(0.02, values, 1, 0.01, 1)).toThrow('future');
	});

	it('classifies all three numerically verified presets as named', () => {
		for (const preset of Object.values(FEEDBACK_PRESETS)) {
			const samples = simulateFeedback(preset.parameters);
			const metrics = classifyFeedbackRegime(samples, preset.parameters);
			expect(metrics.classification).toBe(preset.id);
			expect(metrics.finiteAndPositive).toBe(true);
		}
	});

	it('keeps the instantaneous preset monotonic after the perturbation', () => {
		const parameters = FEEDBACK_PRESETS.monotonic.parameters;
		const samples = simulateFeedback(parameters);
		const start = Math.round(parameters.perturbationTime / parameters.dt);
		const atOne = samples[start + Math.round(1 / parameters.dt)];
		const atTwo = samples[start + Math.round(2 / parameters.dt)];
		expect(samples[start].x).toBeCloseTo(1.6, 12);
		expect(atOne.x).toBeCloseTo(1.039525179, 7);
		expect(atTwo.x).toBeCloseTo(1.001993796, 7);
	});

	it('retains a bounded sustained tail after transients', () => {
		const parameters = FEEDBACK_PRESETS.sustained.parameters;
		const samples = simulateFeedback(parameters);
		const metrics = classifyFeedbackRegime(samples, parameters);
		expect(metrics.finalRange).toBeGreaterThan(0.63);
		expect(metrics.finalRange).toBeLessThan(0.64);
		expect(metrics.finalRange / metrics.previousRange).toBeCloseTo(1, 3);
	});
});
