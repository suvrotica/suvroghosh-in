import { SOUND_WORLD_IDS, type SoundWorldId, type SoundWorldPatch } from './contracts';
import { patchIsSafe, sanitizePatch } from './safety';

const rawPatches = {
	glass: {
		id: 'glass',
		label: 'Glass Observatory',
		description: 'Fine white-noise taps illuminate a bright, slowly decaying modal glass body.',
		noiseColour: 'white',
		rootFrequencyHz: 220,
		scaleSemitones: [0, 2, 7, 9, 14, 19],
		modalRatios: [1, 1.497, 2.01, 2.996, 4.07],
		modalGains: [0.84, 0.58, 0.36, 0.22, 0.12],
		resonanceQ: 18,
		voiceGain: 0.105,
		noiseGain: 0.82,
		oscillatorGain: 0.045,
		attackSeconds: 0.006,
		holdSeconds: 0.035,
		releaseSeconds: 0.72,
		excitationSeconds: 0.085,
		detuneCents: 4,
		brightness: 0.82,
		effectDelaySeconds: 0.19,
		effectFeedback: 0.17,
		effectWetGain: 0.13,
		transitionSeconds: 0.5
	},
	magnetic: {
		id: 'magnetic',
		label: 'Magnetic Weather',
		description:
			'Brown and pink excitation moves through weighty, low resonances and restrained drones.',
		noiseColour: 'brown',
		rootFrequencyHz: 73.42,
		scaleSemitones: [0, 3, 5, 7, 10, 12],
		modalRatios: [1, 1.414, 2, 2.73, 3.99],
		modalGains: [0.92, 0.64, 0.42, 0.22, 0.1],
		resonanceQ: 8.5,
		voiceGain: 0.092,
		noiseGain: 0.74,
		oscillatorGain: 0.11,
		attackSeconds: 0.018,
		holdSeconds: 0.08,
		releaseSeconds: 1.05,
		excitationSeconds: 0.18,
		detuneCents: 8,
		brightness: 0.34,
		effectDelaySeconds: 0.31,
		effectFeedback: 0.12,
		effectWetGain: 0.09,
		transitionSeconds: 0.62
	},
	swarm: {
		id: 'swarm',
		label: 'Bioluminescent Swarm',
		description:
			'Short pink-noise impulses flicker across mobile, closely spaced resonant partials.',
		noiseColour: 'pink',
		rootFrequencyHz: 164.81,
		scaleSemitones: [0, 2, 4, 7, 11, 14],
		modalRatios: [1, 1.22, 1.51, 2.03, 2.57, 3.11],
		modalGains: [0.72, 0.66, 0.48, 0.31, 0.18, 0.1],
		resonanceQ: 12,
		voiceGain: 0.08,
		noiseGain: 0.9,
		oscillatorGain: 0.035,
		attackSeconds: 0.004,
		holdSeconds: 0.018,
		releaseSeconds: 0.36,
		excitationSeconds: 0.055,
		detuneCents: 13,
		brightness: 0.7,
		effectDelaySeconds: 0.11,
		effectFeedback: 0.08,
		effectWetGain: 0.075,
		transitionSeconds: 0.42
	},
	radio: {
		id: 'radio',
		label: 'Radio Telescope After Midnight',
		description:
			'Violet static excites narrow spectral lines above a quiet sub-audio-derived carrier.',
		noiseColour: 'violet',
		rootFrequencyHz: 110,
		scaleSemitones: [0, 1, 6, 8, 13, 18],
		modalRatios: [1, 1.618, 2.414, 3.732, 5.08],
		modalGains: [0.76, 0.61, 0.39, 0.2, 0.11],
		resonanceQ: 21,
		voiceGain: 0.087,
		noiseGain: 0.78,
		oscillatorGain: 0.065,
		attackSeconds: 0.012,
		holdSeconds: 0.05,
		releaseSeconds: 0.9,
		excitationSeconds: 0.11,
		detuneCents: 5,
		brightness: 0.9,
		effectDelaySeconds: 0.43,
		effectFeedback: 0.22,
		effectWetGain: 0.14,
		transitionSeconds: 0.58
	}
} as const satisfies Record<SoundWorldId, SoundWorldPatch>;

export const SOUND_WORLD_PATCHES: Readonly<Record<SoundWorldId, SoundWorldPatch>> =
	Object.fromEntries(
		SOUND_WORLD_IDS.map((id) => [id, Object.freeze(sanitizePatch(rawPatches[id]))])
	) as Record<SoundWorldId, SoundWorldPatch>;

for (const patch of Object.values(SOUND_WORLD_PATCHES)) {
	if (!patchIsSafe(patch)) throw new Error(`Unsafe audio patch: ${patch.id}`);
}

export function isSoundWorldId(value: unknown): value is SoundWorldId {
	return typeof value === 'string' && (SOUND_WORLD_IDS as readonly string[]).includes(value);
}

export function soundWorldPatch(id: SoundWorldId): SoundWorldPatch {
	return SOUND_WORLD_PATCHES[id];
}

export function safeSoundWorld(value: unknown, fallback: SoundWorldId = 'glass'): SoundWorldId {
	return isSoundWorldId(value) ? value : fallback;
}
