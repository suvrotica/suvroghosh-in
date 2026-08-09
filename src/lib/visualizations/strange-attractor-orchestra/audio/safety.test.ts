import { describe, expect, it } from 'vitest';
import {
	AUDIO_INITIAL_VOLUME,
	AUDIO_MAX_MASTER_VOLUME,
	AUDIO_MAX_PAN,
	AUDIO_MAX_VOICES,
	AUDIO_POST_COMPRESSOR_MAKEUP_GAIN,
	createSoftClipCurve,
	safeFrequency,
	safeMasterVolume,
	safePan,
	safeVoiceCap,
	softClipSample
} from './safety';

describe('orchestra audio safety limits', () => {
	it('keeps conservative defaults and hard concurrency/spatial limits', () => {
		expect(AUDIO_INITIAL_VOLUME).toBe(0.23);
		expect(AUDIO_INITIAL_VOLUME).toBeLessThan(AUDIO_MAX_MASTER_VOLUME);
		expect(AUDIO_MAX_VOICES).toBe(6);
		expect(AUDIO_MAX_PAN).toBe(0.65);
		expect(20 * Math.log10(AUDIO_POST_COMPRESSOR_MAKEUP_GAIN)).toBeCloseTo(39.645, 3);
		expect(safeMasterVolume(10)).toBe(AUDIO_MAX_MASTER_VOLUME);
		expect(safeMasterVolume(-1)).toBe(0);
		expect(safePan(4)).toBe(AUDIO_MAX_PAN);
		expect(safePan(-4)).toBe(-AUDIO_MAX_PAN);
		expect(safeVoiceCap(2)).toBe(2);
		expect(safeVoiceCap(99)).toBe(AUDIO_MAX_VOICES);
		expect(safeVoiceCap(Number.NaN)).toBe(AUDIO_MAX_VOICES);
	});

	it('raises modal-bank signals into an audible range before the bounded final master', () => {
		const representativePreClipPeaks = [0.004, 0.0049, 0.0077];
		const projectedDefaultVolumePeaks = representativePreClipPeaks.map(
			(peak) => AUDIO_INITIAL_VOLUME * softClipSample(peak * AUDIO_POST_COMPRESSOR_MAKEUP_GAIN)
		);
		expect(Math.min(...projectedDefaultVolumePeaks)).toBeGreaterThan(0.1);
		expect(Math.max(...projectedDefaultVolumePeaks)).toBeLessThanOrEqual(AUDIO_INITIAL_VOLUME);
		// Whatever arrives at the waveshaper, the default master retains at least 12 dBFS headroom.
		expect(20 * Math.log10(AUDIO_INITIAL_VOLUME)).toBeLessThan(-12);
	});

	it('bounds frequency and produces a finite monotonic soft-clip curve', () => {
		expect(safeFrequency(-Infinity)).toBe(32);
		expect(safeFrequency(Infinity)).toBe(32);
		expect(safeFrequency(40_000)).toBe(8_000);
		const curve = createSoftClipCurve(2_048);
		expect(curve).toHaveLength(2_048);
		expect(curve[0]).toBeCloseTo(-1, 5);
		expect(curve.at(-1)).toBeCloseTo(1, 5);
		for (let index = 1; index < curve.length; index += 1) {
			expect(Number.isFinite(curve[index])).toBe(true);
			expect(curve[index]).toBeGreaterThanOrEqual(curve[index - 1]);
			expect(Math.abs(curve[index])).toBeLessThanOrEqual(1);
		}
		expect(softClipSample(20)).toBeLessThanOrEqual(1);
	});
});
