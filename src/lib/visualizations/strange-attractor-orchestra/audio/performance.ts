import type { AudioIntensityMode, GuidedIntroAudioStage, SoundWorldPatch } from './contracts';
import { hashString32 } from './seeded-noise';

export const AUDIO_PERFORMANCE_TRANSITION_SECONDS = 0.16;
export const LOWER_INTENSITY_EVENT_KEEP_RATIO = 0.62;

export type GuidedIntroAudioPolicy = Readonly<{
	scoredVoiceLimit: 0 | 1 | null;
	continuousTexture: boolean;
}>;

export type AudioIntensityTargets = Readonly<{
	eventKeepRatio: number;
	brightnessShelfDb: number;
	brightnessRatio: number;
	lowBedGainRatio: number;
	effectDepthRatio: number;
	textureGain: number;
	textureFrequencyHz: number;
	textureQ: number;
}>;

const STANDARD_INTENSITY_TARGETS: AudioIntensityTargets = Object.freeze({
	eventKeepRatio: 1,
	brightnessShelfDb: 0,
	brightnessRatio: 1,
	lowBedGainRatio: 1,
	effectDepthRatio: 1,
	textureGain: 0.00055,
	textureFrequencyHz: 520,
	textureQ: 0.82
});

const LOWER_INTENSITY_TARGETS: AudioIntensityTargets = Object.freeze({
	eventKeepRatio: LOWER_INTENSITY_EVENT_KEEP_RATIO,
	brightnessShelfDb: -3.2,
	brightnessRatio: 0.68,
	lowBedGainRatio: 0.48,
	effectDepthRatio: 0.68,
	textureGain: 0.00026,
	textureFrequencyHz: 390,
	textureQ: 0.58
});

export function safeGuidedIntroAudioStage(value: unknown): GuidedIntroAudioStage {
	return value === 'shot-1' ||
		value === 'shot-2' ||
		value === 'shot-3' ||
		value === 'shot-4' ||
		value === 'shot-5' ||
		value === 'free'
		? value
		: 'free';
}

export function safeAudioIntensityMode(value: unknown): AudioIntensityMode {
	return value === 'lower' ? 'lower' : 'standard';
}

export function guidedIntroAudioPolicy(stage: GuidedIntroAudioStage): GuidedIntroAudioPolicy {
	if (stage === 'shot-1' || stage === 'shot-2') {
		return { scoredVoiceLimit: 0, continuousTexture: false };
	}
	if (stage === 'shot-3') return { scoredVoiceLimit: 0, continuousTexture: true };
	if (stage === 'shot-4') return { scoredVoiceLimit: 1, continuousTexture: false };
	return { scoredVoiceLimit: null, continuousTexture: false };
}

export function audioIntensityTargets(mode: AudioIntensityMode): AudioIntensityTargets {
	return mode === 'lower' ? LOWER_INTENSITY_TARGETS : STANDARD_INTENSITY_TARGETS;
}

/** Deterministic performance thinning. Event identity and score order remain untouched. */
export function intensityKeepsEvent(
	eventId: string | number,
	eventIndex: number,
	mode: AudioIntensityMode
): boolean {
	const keepRatio = audioIntensityTargets(mode).eventKeepRatio;
	if (keepRatio >= 1) return true;
	const unit = hashString32(`intensity|${eventId}|${eventIndex}`) / 4_294_967_296;
	return unit < keepRatio;
}

/**
 * Applies the non-volume parts of Lower intensity to a disposable performance patch.
 * The canonical sound-world patch is immutable and remains the source of truth.
 */
export function applyAudioIntensityToPatch(
	patch: SoundWorldPatch,
	mode: AudioIntensityMode
): SoundWorldPatch {
	if (mode === 'standard') return patch;
	const targets = audioIntensityTargets(mode);
	return Object.freeze({
		...patch,
		brightness: patch.brightness * targets.brightnessRatio,
		oscillatorGain: patch.oscillatorGain * targets.lowBedGainRatio,
		noiseGain: patch.noiseGain * (0.72 + targets.effectDepthRatio * 0.28),
		resonanceQ: Math.max(0.3, patch.resonanceQ * targets.effectDepthRatio),
		releaseSeconds: patch.releaseSeconds * (0.7 + targets.effectDepthRatio * 0.3),
		detuneCents: patch.detuneCents * targets.effectDepthRatio,
		effectFeedback: patch.effectFeedback * targets.effectDepthRatio,
		effectWetGain: patch.effectWetGain * targets.effectDepthRatio
	});
}
