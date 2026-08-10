import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	parseSettings,
	serializeSettings,
	withReducedMotionDefault
} from './settings';

describe('Kagojer Dana settings', () => {
	it('rejects invalid enums and clamps sensitivity', () => {
		const parsed = parseSettings(
			JSON.stringify({ windMode: 'hurricane', quality: 'ultra', sensitivity: 99 })
		);
		expect(parsed.windMode).toBe(DEFAULT_SETTINGS.windMode);
		expect(parsed.quality).toBe(DEFAULT_SETTINGS.quality);
		expect(parsed.sensitivity).toBe(1.6);
	});

	it('round-trips valid preferences', () => {
		const settings = { ...DEFAULT_SETTINGS, calmCamera: true, invertPitch: true };
		expect(parseSettings(serializeSettings(settings))).toEqual(settings);
	});

	it('defaults new reduced-motion visitors to calm flight without overriding a saved choice', () => {
		expect(withReducedMotionDefault(DEFAULT_SETTINGS, true, false).calmFlight).toBe(true);
		expect(withReducedMotionDefault(DEFAULT_SETTINGS, true, true).calmFlight).toBe(false);
	});
});
