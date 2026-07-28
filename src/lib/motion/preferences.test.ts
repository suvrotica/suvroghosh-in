import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MOTION_PREFERENCE,
	isMotionPreference,
	normaliseMotionPreference,
	resolveMotion,
	shouldRunAmbientField
} from './preferences';
import type { RouteMotionConfig } from './types';

describe('motion preference validation', () => {
	it.each(['system', 'still', 'gentle', 'alive'])('accepts the public preference %s', (value) => {
		expect(isMotionPreference(value)).toBe(true);
		expect(normaliseMotionPreference(value)).toBe(value);
	});

	it.each([undefined, null, '', 'reduce', 'Alive', 1, {}, []])(
		'normalises invalid preference %j to system',
		(value) => {
			expect(isMotionPreference(value)).toBe(false);
			expect(normaliseMotionPreference(value)).toBe(DEFAULT_MOTION_PREFERENCE);
		}
	);
});

describe('motion preference resolution', () => {
	it('uses gentle as the non-reduced system default', () => {
		expect(resolveMotion('system', false)).toBe('gentle');
		expect(resolveMotion('gentle', false)).toBe('gentle');
		expect(resolveMotion('not-a-preference', false)).toBe('gentle');
	});

	it('preserves explicit still and alive choices when the OS does not reduce motion', () => {
		expect(resolveMotion('still', false)).toBe('still');
		expect(resolveMotion('alive', false)).toBe('alive');
	});

	it.each(['system', 'still', 'gentle', 'alive', 'stale-value'])(
		'makes the OS reduced-motion preference authoritative over %s',
		(preference) => {
			expect(resolveMotion(preference, true)).toBe('still');
		}
	);
});

describe('ambient field eligibility', () => {
	const animatedRoute: RouteMotionConfig = {
		biome: 'home',
		intensity: 'standard',
		ambient: 'animated'
	};

	it('runs only visible, animated, non-still routes', () => {
		expect(shouldRunAmbientField(animatedRoute, 'gentle')).toBe(true);
		expect(shouldRunAmbientField(animatedRoute, 'alive')).toBe(true);
		expect(shouldRunAmbientField(animatedRoute, 'still')).toBe(false);
		expect(shouldRunAmbientField(animatedRoute, 'gentle', false)).toBe(false);
	});

	it.each<RouteMotionConfig>([
		{ biome: 'off', intensity: 'off', ambient: 'off' },
		{ biome: 'lab', intensity: 'standard', ambient: 'static' },
		{ biome: 'quiet', intensity: 'off', ambient: 'animated' }
	])('does not run an ineligible route config', (config) => {
		expect(shouldRunAmbientField(config, 'alive')).toBe(false);
	});
});
