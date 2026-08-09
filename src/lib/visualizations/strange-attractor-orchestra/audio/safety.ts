import type { SoundWorldPatch } from './contracts';

export const AUDIO_INITIAL_VOLUME = 0.23;
export const AUDIO_MAX_MASTER_VOLUME = 0.5;
/** Calibrated modal-bank make-up before the final safety waveshaper: +39.65 dB when unsaturated. */
export const AUDIO_POST_COMPRESSOR_MAKEUP_GAIN = 96;
export const AUDIO_MAX_VOICES = 6;
export const AUDIO_MAX_PAN = 0.65;
export const AUDIO_MIN_FREQUENCY_HZ = 32;
export const AUDIO_MAX_FREQUENCY_HZ = 8_000;
export const AUDIO_MAX_EVENT_SECONDS = 6;
export const AUDIO_MAX_OFFLINE_SECONDS = 300;
export const AUDIO_SCHEDULER_INTERVAL_MS = 25;
export const AUDIO_SCHEDULER_LOOKAHEAD_SECONDS = 0.125;
export const AUDIO_MIN_RAMP_SECONDS = 0.004;
export const AUDIO_EMERGENCY_RAMP_SECONDS = 0.008;
export const AUDIO_RESUME_RAMP_SECONDS = 0.06;

export function clamp(value: number, minimum: number, maximum: number): number {
	if (!Number.isFinite(value)) return minimum;
	return Math.min(maximum, Math.max(minimum, value));
}

export function clampUnit(value: number, fallback = 0): number {
	return clamp(Number.isFinite(value) ? value : fallback, 0, 1);
}

export function safeMasterVolume(value: number): number {
	return clamp(value, 0, AUDIO_MAX_MASTER_VOLUME);
}

export function safeVoiceCap(value: number): number {
	return Number.isFinite(value) ? Math.round(clamp(value, 1, AUDIO_MAX_VOICES)) : AUDIO_MAX_VOICES;
}

export function safePan(value: number): number {
	return clamp(value, -AUDIO_MAX_PAN, AUDIO_MAX_PAN);
}

export function safeFrequency(value: number): number {
	return clamp(value, AUDIO_MIN_FREQUENCY_HZ, AUDIO_MAX_FREQUENCY_HZ);
}

export function safeDuration(value: number, fallback = 0.35): number {
	return clamp(
		Number.isFinite(value) ? value : fallback,
		AUDIO_MIN_RAMP_SECONDS,
		AUDIO_MAX_EVENT_SECONDS
	);
}

export function safeRamp(value: number, fallback = 0.03): number {
	return clamp(Number.isFinite(value) ? value : fallback, AUDIO_MIN_RAMP_SECONDS, 2);
}

export function midiToFrequency(note: number): number {
	return safeFrequency(440 * 2 ** ((clamp(note, 0, 127) - 69) / 12));
}

export function softClipSample(value: number, drive = 1.6): number {
	const safeDrive = clamp(drive, 1, 4);
	return Math.tanh(clamp(value, -1, 1) * safeDrive) / Math.tanh(safeDrive);
}

export function createSoftClipCurve(size = 2_048, drive = 1.6): Float32Array<ArrayBuffer> {
	const safeSize = Math.round(clamp(size, 256, 65_536));
	const curve = new Float32Array(safeSize);
	for (let index = 0; index < safeSize; index += 1) {
		const input = (index / (safeSize - 1)) * 2 - 1;
		curve[index] = softClipSample(input, drive);
	}
	return curve;
}

export function sanitizePatch(patch: SoundWorldPatch): SoundWorldPatch {
	const modalCount = Math.min(6, Math.max(1, patch.modalRatios.length, patch.modalGains.length));
	const modalRatios = Array.from({ length: modalCount }, (_, index) =>
		clamp(Number(patch.modalRatios[index] ?? 1), 0.25, 16)
	);
	const modalGains = Array.from({ length: modalCount }, (_, index) =>
		clamp(Number(patch.modalGains[index] ?? 0), 0, 1)
	);
	const scaleSemitones = (patch.scaleSemitones.length > 0 ? patch.scaleSemitones : [0]).map(
		(note) => Math.round(clamp(Number(note), -36, 48))
	);

	return {
		...patch,
		rootFrequencyHz: safeFrequency(patch.rootFrequencyHz),
		scaleSemitones,
		modalRatios,
		modalGains,
		resonanceQ: clamp(patch.resonanceQ, 0.3, 30),
		voiceGain: clamp(patch.voiceGain, 0, 0.18),
		noiseGain: clamp(patch.noiseGain, 0, 1),
		oscillatorGain: clamp(patch.oscillatorGain, 0, 0.35),
		attackSeconds: safeRamp(patch.attackSeconds, 0.008),
		holdSeconds: clamp(patch.holdSeconds, 0, 2),
		releaseSeconds: safeRamp(patch.releaseSeconds, 0.35),
		excitationSeconds: safeDuration(patch.excitationSeconds, 0.12),
		detuneCents: clamp(patch.detuneCents, 0, 35),
		brightness: clampUnit(patch.brightness, 0.5),
		effectDelaySeconds: clamp(patch.effectDelaySeconds, 0.04, 0.9),
		effectFeedback: clamp(patch.effectFeedback, 0, 0.28),
		effectWetGain: clamp(patch.effectWetGain, 0, 0.18),
		transitionSeconds: safeRamp(patch.transitionSeconds, 0.45)
	};
}

export function patchIsSafe(patch: SoundWorldPatch): boolean {
	const sanitized = sanitizePatch(patch);
	return (
		JSON.stringify(sanitized) === JSON.stringify(patch) &&
		patch.modalRatios.length === patch.modalGains.length &&
		patch.modalRatios.length >= 1 &&
		patch.modalRatios.length <= 6 &&
		patch.scaleSemitones.length >= 1
	);
}

export function abortError(message = 'The audio operation was cancelled.'): Error {
	if (typeof DOMException !== 'undefined') return new DOMException(message, 'AbortError');
	const error = new Error(message);
	error.name = 'AbortError';
	return error;
}

export function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortError();
}
