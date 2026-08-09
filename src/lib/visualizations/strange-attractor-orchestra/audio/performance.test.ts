import { describe, expect, it } from 'vitest';
import { soundWorldPatch } from './patches';
import {
	AUDIO_PERFORMANCE_TRANSITION_SECONDS,
	LOWER_INTENSITY_EVENT_KEEP_RATIO,
	applyAudioIntensityToPatch,
	audioIntensityTargets,
	guidedIntroAudioPolicy,
	intensityKeepsEvent,
	safeAudioIntensityMode,
	safeGuidedIntroAudioStage
} from './performance';

describe('ephemeral opening and intensity policies', () => {
	it('gates the five guided shots exactly as choreographed', () => {
		expect(guidedIntroAudioPolicy('shot-1')).toEqual({
			scoredVoiceLimit: 0,
			continuousTexture: false
		});
		expect(guidedIntroAudioPolicy('shot-2')).toEqual({
			scoredVoiceLimit: 0,
			continuousTexture: false
		});
		expect(guidedIntroAudioPolicy('shot-3')).toEqual({
			scoredVoiceLimit: 0,
			continuousTexture: true
		});
		expect(guidedIntroAudioPolicy('shot-4')).toEqual({
			scoredVoiceLimit: 1,
			continuousTexture: false
		});
		expect(guidedIntroAudioPolicy('shot-5')).toEqual({
			scoredVoiceLimit: null,
			continuousTexture: false
		});
		expect(guidedIntroAudioPolicy('free')).toEqual(guidedIntroAudioPolicy('shot-5'));
		expect(safeGuidedIntroAudioStage('invalid')).toBe('free');
	});

	it('uses the same 160 ms safety transition as observation-view crossfades', () => {
		expect(AUDIO_PERFORMANCE_TRANSITION_SECONDS).toBe(0.16);
	});

	it('deterministically reduces event density in Lower mode', () => {
		const first = Array.from({ length: 512 }, (_, index) =>
			intensityKeepsEvent(`event-${index}`, index, 'lower')
		);
		const second = Array.from({ length: 512 }, (_, index) =>
			intensityKeepsEvent(`event-${index}`, index, 'lower')
		);
		const keptRatio = first.filter(Boolean).length / first.length;
		expect(first).toEqual(second);
		expect(keptRatio).toBeGreaterThan(LOWER_INTENSITY_EVENT_KEEP_RATIO - 0.08);
		expect(keptRatio).toBeLessThan(LOWER_INTENSITY_EVENT_KEEP_RATIO + 0.08);
		expect(
			Array.from({ length: 512 }, (_, index) =>
				intensityKeepsEvent(`event-${index}`, index, 'standard')
			).every(Boolean)
		).toBe(true);
	});

	it('reduces brightness, low-bed and effect depth without changing master gain or source patch', () => {
		const source = soundWorldPatch('magnetic');
		const before = JSON.stringify(source);
		const lower = applyAudioIntensityToPatch(source, 'lower');
		const targets = audioIntensityTargets('lower');

		expect(targets.brightnessShelfDb).toBeLessThan(0);
		expect(targets.eventKeepRatio).toBeLessThan(1);
		expect(lower.brightness).toBeLessThan(source.brightness);
		expect(lower.oscillatorGain).toBeLessThan(source.oscillatorGain);
		expect(lower.resonanceQ).toBeLessThan(source.resonanceQ);
		expect(lower.releaseSeconds).toBeLessThan(source.releaseSeconds);
		expect(lower.detuneCents).toBeLessThan(source.detuneCents);
		expect(lower.effectFeedback).toBeLessThan(source.effectFeedback);
		expect(lower.effectWetGain).toBeLessThan(source.effectWetGain);
		expect(lower.effectDelaySeconds).toBe(source.effectDelaySeconds);
		expect(lower.voiceGain).toBe(source.voiceGain);
		expect(lower.transitionSeconds).toBe(source.transitionSeconds);
		expect(JSON.stringify(source)).toBe(before);
		expect(applyAudioIntensityToPatch(source, 'standard')).toBe(source);
		expect(safeAudioIntensityMode('unexpected')).toBe('standard');
	});
});
