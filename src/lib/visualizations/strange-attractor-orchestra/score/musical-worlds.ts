import type { SoundWorldId, SoundWorldPatch } from '../types';

export const SOUND_WORLD_PATCHES: Readonly<Record<SoundWorldId, SoundWorldPatch>> = Object.freeze({
	glass: Object.freeze({
		id: 'glass',
		name: 'Glass Observatory',
		scaleSemitones: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
		baseMidi: 47,
		voicing: Object.freeze([0, 7, 12, 19]),
		excitation: 'blue',
		resonatorPartialRatios: Object.freeze([1, 2.01, 2.98, 4.13, 5.21]),
		envelope: Object.freeze({ attack: 0.012, decay: 1.4, maximum: 3.5 }),
		eventDensityCeiling: 10,
		busGains: Object.freeze({ tonal: 0.31, texture: 0.12, voice: 0.08 }),
		filterHz: Object.freeze([240, 9_000]) as readonly [number, number],
		effectSends: Object.freeze({ delay: 0.2, reverb: 0.24 }),
		mobile: Object.freeze({ maximumVoices: 3, eventDensityCeiling: 6 })
	}),
	magnetic: Object.freeze({
		id: 'magnetic',
		name: 'Magnetic Weather',
		scaleSemitones: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
		baseMidi: 35,
		voicing: Object.freeze([0, 5, 12, 17]),
		excitation: 'brown',
		resonatorPartialRatios: Object.freeze([1, 1.5, 2.01, 2.52, 3.02]),
		envelope: Object.freeze({ attack: 0.02, decay: 1.8, maximum: 4 }),
		eventDensityCeiling: 8,
		busGains: Object.freeze({ tonal: 0.25, texture: 0.16, voice: 0.1 }),
		filterHz: Object.freeze([90, 5_500]) as readonly [number, number],
		effectSends: Object.freeze({ delay: 0.12, reverb: 0.19 }),
		mobile: Object.freeze({ maximumVoices: 3, eventDensityCeiling: 5 })
	}),
	swarm: Object.freeze({
		id: 'swarm',
		name: 'Bioluminescent Swarm',
		scaleSemitones: Object.freeze([0, 1, 4, 6, 7, 10]),
		baseMidi: 55,
		voicing: Object.freeze([0, 4, 11, 18]),
		excitation: 'white',
		resonatorPartialRatios: Object.freeze([1, 1.41, 2.17, 3.11, 4.27]),
		envelope: Object.freeze({ attack: 0.008, decay: 0.55, maximum: 1.8 }),
		eventDensityCeiling: 12,
		busGains: Object.freeze({ tonal: 0.24, texture: 0.1, voice: 0.06 }),
		filterHz: Object.freeze([420, 11_000]) as readonly [number, number],
		effectSends: Object.freeze({ delay: 0.1, reverb: 0.14 }),
		mobile: Object.freeze({ maximumVoices: 3, eventDensityCeiling: 7 })
	}),
	radio: Object.freeze({
		id: 'radio',
		name: 'Radio Telescope After Midnight',
		scaleSemitones: Object.freeze([0, 2, 7, 9]),
		baseMidi: 38,
		voicing: Object.freeze([0, 7, 14, 19]),
		excitation: 'narrow-band',
		resonatorPartialRatios: Object.freeze([1, 1.99, 3.01, 4.97]),
		envelope: Object.freeze({ attack: 0.018, decay: 2.8, maximum: 5 }),
		eventDensityCeiling: 5,
		busGains: Object.freeze({ tonal: 0.22, texture: 0.14, voice: 0.11 }),
		filterHz: Object.freeze([160, 7_000]) as readonly [number, number],
		effectSends: Object.freeze({ delay: 0.3, reverb: 0.28 }),
		mobile: Object.freeze({ maximumVoices: 2, eventDensityCeiling: 3.5 })
	})
});

export function isSoundWorldId(value: unknown): value is SoundWorldId {
	return value === 'glass' || value === 'magnetic' || value === 'swarm' || value === 'radio';
}

export function getSoundWorldPatch(id: SoundWorldId): SoundWorldPatch {
	return SOUND_WORLD_PATCHES[id];
}
