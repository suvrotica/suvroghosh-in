import { describe, expect, it } from 'vitest';
import { defaultParameters } from './model';
import { parseState, serialiseState } from './state';

describe('shareable lens lab settings', () => {
	it('round trips builtin sample and bounded settings', () => {
		const state = {
			sample: 'facade' as const,
			effect: 'funhouse' as const,
			parameters: {
				...defaultParameters('funhouse'),
				strength: 0.81,
				centerX: 0.31,
				axis: 'vertical' as const,
				phase: 2.4
			}
		};
		const restored = parseState(serialiseState(state));
		expect(restored).toEqual(state);
	});
	it('allows only known samples/effects and finite scalar values', () => {
		const state = parseState(
			'?sample=data:image/png,secret&effect=script&strength=NaN&centerX=-6&radius=999&filename=private.jpg'
		);
		expect(state.sample).toBe('calibration');
		expect(state.effect).toBe('barrel');
		expect(state.parameters.strength).toBe(0.6);
		expect(state.parameters.centerX).toBe(0);
		expect(state.parameters.radius).toBe(1.5);
		expect(serialiseState(state).toString()).not.toContain('private');
	});
	it('restores a true identity state independently of fisheye coefficients', () => {
		const state = parseState('?effect=original&advanced=0&k1=0&k2=0&k3=0');
		expect(state.effect).toBe('original');
		expect(state.parameters.strength).toBe(0);
		expect(state.parameters.mirror).toBe(false);
	});
});
