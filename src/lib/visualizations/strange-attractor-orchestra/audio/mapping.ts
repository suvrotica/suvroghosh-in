import type { AudioObservationView, SonicEvent, SoundWorldPatch } from './contracts';
import { hashString32 } from './seeded-noise';
import {
	clamp,
	clampUnit,
	midiToFrequency,
	safeDuration,
	safeFrequency,
	safePan,
	safeRamp
} from './safety';

export type AudioVoicePlan = Readonly<{
	id: string;
	kind: string;
	scoreTime: number;
	durationSeconds: number;
	excitationSeconds: number;
	intensity: number;
	pan: number;
	baseFrequencyHz: number;
	modalFrequenciesHz: readonly number[];
	modalGains: readonly number[];
	noiseSeed: string;
	noiseGain: number;
	oscillatorGain: number;
	attackSeconds: number;
	holdSeconds: number;
	releaseSeconds: number;
	detuneCents: number;
}>;

export const AUDIO_OBSERVATION_TRANSITION_SECONDS = 0.16;

export function safeAudioObservationView(value: unknown): AudioObservationView {
	return value === 'raw' || value === 'noise' || value === 'braided' ? value : 'braided';
}

function finite(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function regionIndex(region: SonicEvent['region']): number {
	if (typeof region === 'number' && Number.isFinite(region)) return Math.abs(Math.round(region));
	return hashString32(region ?? 'centre');
}

function defaultDuration(kind: string): number {
	if (/recurrence/iu.test(kind)) return 1.1;
	if (/dense|knot/iu.test(kind)) return 0.85;
	if (/ridge/iu.test(kind)) return 0.64;
	if (/fold/iu.test(kind)) return 0.3;
	return 0.52;
}

function eventKind(event: SonicEvent): string {
	return event.kind ?? event.type ?? 'pulse';
}

export function buildVoicePlan(
	event: SonicEvent,
	patch: SoundWorldPatch,
	masterSeed: string | number,
	eventIndex = 0,
	observationView: AudioObservationView = 'braided'
): AudioVoicePlan {
	const view = safeAudioObservationView(observationView);
	const kind = eventKind(event);
	const identity = `${event.id}|${kind}|${eventIndex}`;
	const hash = hashString32(`${masterSeed}|${event.seed ?? ''}|${identity}`);
	const scaleIndex =
		(regionIndex(event.region ?? event.sourceFeature) + hash) % patch.scaleSemitones.length;
	const octave = ((hash >>> 9) % 3) - 1;
	const mappedFrequency =
		patch.rootFrequencyHz * 2 ** ((patch.scaleSemitones[scaleIndex] + octave * 12) / 12);
	const baseFrequency =
		finite(event.frequencyHz ?? event.pitchHz, 0) > 0
			? safeFrequency((event.frequencyHz ?? event.pitchHz)!)
			: Number.isFinite(event.pitch)
				? midiToFrequency(event.pitch!)
				: safeFrequency(mappedFrequency);
	const height = clampUnit(finite(event.height, 0.5), 0.5);
	const curvature = clampUnit(finite(event.curvature, 0), 0);
	const stretching = clampUnit(finite(event.stretching, 0), 0);
	const recurrence = clampUnit(finite(event.recurrence, 0), 0);
	const density = clampUnit(finite(event.density, 0), 0);
	const noise = clampUnit(finite(event.noise, 0.4), 0.4);
	const eventIntensity = clampUnit(finite(event.intensity ?? event.velocity01, 0.58), 0.58);
	const featureIntensity = clampUnit(
		eventIntensity * 0.62 + curvature * 0.12 + recurrence * 0.1 + density * 0.1 + noise * 0.06
	);
	const inferredPan = (height * 2 - 1) * 0.52 + (((hash >>> 17) & 255) / 255 - 0.5) * 0.16;
	// Core pan is derived from the weather curl. Raw audition deliberately removes it and retains
	// only a restrained height cue; Braided and Weather preserve the measured curl placement.
	const pan =
		view === 'raw' ? safePan((height * 2 - 1) * 0.36) : safePan(finite(event.pan, inferredPan));
	const release = safeDuration(
		patch.releaseSeconds * (0.72 + recurrence * 0.5 + density * 0.22),
		patch.releaseSeconds
	);
	// Curvature is the measured turning rate. Sharper turns have a genuinely shorter onset,
	// while safeRamp preserves the global 4 ms anti-click floor.
	const attack = safeRamp(patch.attackSeconds * (1 - curvature * 0.55), patch.attackSeconds);
	const duration = safeDuration(
		Math.max(finite(event.duration, defaultDuration(kind)), attack + release),
		defaultDuration(kind)
	);
	// Local stretching is the measured separation rate between neighbouring trajectory samples.
	// Lift the modal band-pass centres as that separation rises; safeFrequency retains the 8 kHz cap.
	const weatherSpectralLift = view === 'raw' ? 0 : patch.brightness * noise * 0.05;
	const spectralLift = 1 + stretching * 0.12 + curvature * 0.08 + weatherSpectralLift;
	const noiseTreatment = view === 'noise' ? 1.18 : view === 'raw' ? 0.82 : 1;
	const oscillatorTreatment = view === 'noise' ? 0.48 : 1;

	return {
		id: String(event.id),
		kind,
		scoreTime: Math.max(0, finite(event.time, 0)),
		durationSeconds: duration,
		excitationSeconds: Math.min(duration, patch.excitationSeconds * (0.75 + density * 0.5)),
		intensity: featureIntensity,
		pan,
		baseFrequencyHz: baseFrequency,
		modalFrequenciesHz: patch.modalRatios.map((ratio) =>
			safeFrequency(baseFrequency * ratio * spectralLift)
		),
		modalGains: patch.modalGains,
		noiseSeed: `${masterSeed}|audio-noise|${event.seed ?? ''}|${identity}`,
		noiseGain: clamp(
			patch.noiseGain * (0.72 + (view === 'raw' ? 0 : noise) * 0.28) * noiseTreatment,
			0,
			1
		),
		oscillatorGain: clamp(
			patch.oscillatorGain * (0.8 + recurrence * 0.2) * oscillatorTreatment,
			0,
			0.35
		),
		attackSeconds: attack,
		holdSeconds: Math.min(duration * 0.35, patch.holdSeconds + density * 0.025),
		releaseSeconds: Math.min(duration, release),
		detuneCents: patch.detuneCents * ((((hash >>> 24) & 255) / 255) * 2 - 1)
	};
}
