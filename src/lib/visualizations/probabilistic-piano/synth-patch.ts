import { REVERB_ROOMS, type ReverbRoom } from './procedural-ir';

export { REVERB_ROOMS, type ReverbRoom };

export const SYNTH_PATCH_VERSION = 1 as const;
export const SYNTH_STORAGE_KEY = 'suvro-synth-patches:v1';
export const MAX_PATCH_HASH_LENGTH = 4096;
export const MAX_USER_PATCHES = 32;
export const ARP_STEP_COUNT = 16;

export const PATCH_CATEGORIES = ['Poly', 'Lead', 'Bass', 'Pad', 'Keys', 'FX'] as const;
export type PatchCategory = (typeof PATCH_CATEGORIES)[number];

export const OSC1_WAVES = [
	'saw',
	'pwm',
	'tri',
	'sine',
	'supersaw',
	'fm',
	'harmonic',
	'5-partial'
] as const;
export type Osc1Wave = (typeof OSC1_WAVES)[number];

export const OSC2_WAVES = ['saw', 'pwm', 'tri', 'sine'] as const;
export type Osc2Wave = (typeof OSC2_WAVES)[number];

export const OSC_OCTAVES = [-1, 0, 1, 2] as const;
export type OscOctave = (typeof OSC_OCTAVES)[number];

export const SUB_OCTAVES = [-1, -2] as const;
export type SubOctave = (typeof SUB_OCTAVES)[number];

export const SUB_WAVES = ['sine', 'square'] as const;
export type SubWave = (typeof SUB_WAVES)[number];

export const NOISE_TYPES = ['white', 'pink'] as const;
export type NoiseType = (typeof NOISE_TYPES)[number];

export const FILTER_TYPES = ['lp12', 'lp24', 'bp12', 'hp12'] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

export const LFO_WAVES = ['sine', 'tri', 'saw', 'square', 'sh'] as const;
export type LfoWave = (typeof LFO_WAVES)[number];

export const SYNC_DIVISIONS = [
	'1/16',
	'1/8',
	'1/8t',
	'1/4',
	'1/4d',
	'1/2',
	'1/1',
	'2/1',
	'4/1'
] as const;
export type SyncDivision = (typeof SYNC_DIVISIONS)[number];

export const DELAY_SYNC_DIVISIONS = ['1/16', '1/8', '1/8t', '1/8d', '1/4', '1/4d', '1/2'] as const;
export type DelaySyncDivision = (typeof DELAY_SYNC_DIVISIONS)[number];

export const ARP_DIVISIONS = ['1/4', '1/8', '1/8t', '1/16', '1/16t', '1/32'] as const;
export type ArpDivision = (typeof ARP_DIVISIONS)[number];

export const MOD_SOURCES = ['lfo1', 'lfo2', 'filterEnv', 'velocity', 'modWheel'] as const;
export type ModSource = (typeof MOD_SOURCES)[number];

export const MOD_DESTINATIONS = ['pitch', 'shape', 'cutoff', 'resonance', 'amp'] as const;
export type ModDestination = (typeof MOD_DESTINATIONS)[number];

export const VOICE_MODES = ['poly', 'mono', 'legato', 'unison'] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];

export const UNISON_VOICES = [2, 3] as const;
export type UnisonVoices = (typeof UNISON_VOICES)[number];

export const CHORD_MEMORY_MODES = [
	'off',
	'oct',
	'5th',
	'maj7',
	'min7',
	'sus4',
	'9th',
	'latch'
] as const;
export type ChordMemoryMode = (typeof CHORD_MEMORY_MODES)[number];

export const ARP_MODES = ['up', 'down', 'up-down', 'random', 'chord', 'order'] as const;
export type ArpMode = (typeof ARP_MODES)[number];

export const ARP_ENGINES = ['off', 'arp', 'seq'] as const;
export type ArpEngine = (typeof ARP_ENGINES)[number];

export const PATCH_BOUNDS = Object.freeze({
	maxTextLength: 48,
	semi: [-12, 12] as const,
	fine: [-50, 50] as const,
	shape: [0, 1] as const,
	fmRatio: [0.5, 8] as const,
	mix: [0, 1] as const,
	cutoffHz: [20, 18000] as const,
	resonance: [0.5, 20] as const,
	drive: [0, 1] as const,
	envAmt: [-1, 1] as const,
	keyTrack: [0, 1] as const,
	attack: [0.002, 4] as const,
	decay: [0.01, 6] as const,
	sustain: [0, 1] as const,
	release: [0.015, 6] as const,
	lfoRateHz: [0.05, 25] as const,
	lfoDepth: [0, 1] as const,
	modDepth: [-1, 1] as const,
	chorusRateHz: [0.1, 5] as const,
	chorusDepth: [0, 1] as const,
	crushBitDepth: [3, 16] as const,
	crushToneHz: [400, 16000] as const,
	delayTimeMs: [40, 900] as const,
	delayFeedback: [0, 0.88] as const,
	delayToneHz: [400, 16000] as const,
	unisonSpreadCt: [0, 40] as const,
	glideMs: [0, 600] as const,
	arpOctaves: [1, 3] as const,
	arpGate: [0.05, 1] as const,
	arpSwing: [0, 1] as const,
	bpm: [40, 220] as const,
	stepNote: [0, 127] as const,
	stepNoteOffset: [-24, 24] as const,
	stepGate: [0.05, 1] as const
});

export interface Osc1Config {
	wave: Osc1Wave;
	oct: OscOctave;
	semi: number;
	fine: number;
	shape: number;
	fmRatio: number;
}

export interface Osc2Config {
	wave: Osc2Wave;
	oct: OscOctave;
	semi: number;
	fine: number;
	shape: number;
	ringMod: boolean;
}

export interface SubConfig {
	oct: SubOctave;
	wave: SubWave;
}

export interface NoiseConfig {
	type: NoiseType;
}

export interface MixConfig {
	osc1: number;
	osc2: number;
	sub: number;
	noise: number;
}

export interface FilterConfig {
	type: FilterType;
	cutoffHz: number;
	resonance: number;
	drive: number;
	envAmt: number;
	keyTrack: number;
}

export interface AdsrConfig {
	attack: number;
	decay: number;
	sustain: number;
	release: number;
}

export interface LfoConfig {
	wave: LfoWave;
	rateHz: number;
	syncDiv: SyncDivision;
	depth: number;
	bpmSync: boolean;
	keySync: boolean;
}

export type ModMatrixRow = [number, number, number, number, number];
export type ModMatrix5x5 = [ModMatrixRow, ModMatrixRow, ModMatrixRow, ModMatrixRow, ModMatrixRow];

export interface FxConfig {
	chorus: { bypass: boolean; rateHz: number; depth: number; mix: number };
	crush: { bypass: boolean; drive: number; bitDepth: number; toneHz: number; mix: number };
	delay: {
		bypass: boolean;
		timeMs: number;
		bpmSync: boolean;
		syncDiv: DelaySyncDivision;
		feedback: number;
		toneHz: number;
		mix: number;
	};
	reverb: { room: ReverbRoom; mix: number };
}

export interface SeqStep {
	active: boolean;
	note: number | null;
	noteOffset: number;
	gate: number;
	tie: boolean;
	accent: boolean;
}

export interface ArpSeqConfig {
	engine: ArpEngine;
	arpMode: ArpMode;
	octaves: 1 | 2 | 3;
	division: ArpDivision;
	gate: number;
	swing: number;
	bpm: number;
	hold: boolean;
	steps: SeqStep[];
}

export interface SynthPatch {
	version: typeof SYNTH_PATCH_VERSION;
	id: string;
	name: string;
	category: PatchCategory;
	osc1: Osc1Config;
	osc2: Osc2Config;
	sub: SubConfig;
	noise: NoiseConfig;
	mix: MixConfig;
	filter: FilterConfig;
	ampEnv: AdsrConfig;
	filterEnv: AdsrConfig;
	lfo1: LfoConfig;
	lfo2: LfoConfig;
	modMatrix: ModMatrix5x5;
	fx: FxConfig;
	voiceMode: VoiceMode;
	unisonVoices: UnisonVoices;
	unisonSpreadCt: number;
	glideMs: number;
	chordMemory: ChordMemoryMode;
	arpSeq: ArpSeqConfig;
}

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

function emptyModMatrix(): ModMatrix5x5 {
	return [
		[0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0]
	];
}

function defaultSeqStep(): SeqStep {
	return {
		active: false,
		note: null,
		noteOffset: 0,
		gate: 0.8,
		tie: false,
		accent: false
	};
}

function createDefaultSteps(overrides?: readonly Partial<SeqStep>[]): SeqStep[] {
	return Array.from({ length: ARP_STEP_COUNT }, (_, idx) => ({
		...defaultSeqStep(),
		...(overrides?.[idx] ?? {})
	}));
}

function createForgivingGrandBase(): SynthPatch {
	return {
		version: SYNTH_PATCH_VERSION,
		id: '01-forgiving-grand',
		name: '01 Forgiving Grand',
		category: 'Keys',
		osc1: { wave: '5-partial', oct: 0, semi: 0, fine: 0, shape: 0, fmRatio: 1 },
		osc2: { wave: 'sine', oct: 0, semi: 0, fine: 0, shape: 0.5, ringMod: false },
		sub: { oct: -1, wave: 'sine' },
		noise: { type: 'white' },
		mix: { osc1: 1, osc2: 0, sub: 0, noise: 0 },
		filter: { type: 'lp24', cutoffHz: 18000, resonance: 0.7, drive: 0, envAmt: 0, keyTrack: 0 },
		ampEnv: { attack: 0.006, decay: 0.3, sustain: 1, release: 0.15 },
		filterEnv: { attack: 0.01, decay: 0.4, sustain: 0.5, release: 0.3 },
		lfo1: { wave: 'sine', rateHz: 1.2, syncDiv: '1/4', depth: 0, bpmSync: false, keySync: false },
		lfo2: { wave: 'tri', rateHz: 0.4, syncDiv: '1/2', depth: 0, bpmSync: false, keySync: false },
		modMatrix: emptyModMatrix(),
		fx: {
			chorus: { bypass: true, rateHz: 0.8, depth: 0.35, mix: 0 },
			crush: { bypass: true, drive: 0, bitDepth: 16, toneHz: 12000, mix: 0 },
			delay: {
				bypass: true,
				timeMs: 320,
				bpmSync: false,
				syncDiv: '1/8d',
				feedback: 0.25,
				toneHz: 6500,
				mix: 0
			},
			reverb: { room: 'off', mix: 0 }
		},
		voiceMode: 'poly',
		unisonVoices: 2,
		unisonSpreadCt: 12,
		glideMs: 0,
		chordMemory: 'off',
		arpSeq: {
			engine: 'off',
			arpMode: 'up',
			octaves: 1,
			division: '1/16',
			gate: 0.8,
			swing: 0,
			bpm: 110,
			hold: false,
			steps: createDefaultSteps()
		}
	};
}

const DEFAULT_PATCH: SynthPatch = createForgivingGrandBase();

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (infer U)[] ? U[] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function makePreset(overrides: DeepPartial<SynthPatch>): SynthPatch {
	const base = createForgivingGrandBase();
	const next: SynthPatch = {
		...base,
		...overrides,
		osc1: { ...base.osc1, ...(overrides.osc1 ?? {}) },
		osc2: { ...base.osc2, ...(overrides.osc2 ?? {}) },
		sub: { ...base.sub, ...(overrides.sub ?? {}) },
		noise: { ...base.noise, ...(overrides.noise ?? {}) },
		mix: { ...base.mix, ...(overrides.mix ?? {}) },
		filter: { ...base.filter, ...(overrides.filter ?? {}) },
		ampEnv: { ...base.ampEnv, ...(overrides.ampEnv ?? {}) },
		filterEnv: { ...base.filterEnv, ...(overrides.filterEnv ?? {}) },
		lfo1: { ...base.lfo1, ...(overrides.lfo1 ?? {}) },
		lfo2: { ...base.lfo2, ...(overrides.lfo2 ?? {}) },
		modMatrix: (overrides.modMatrix as ModMatrix5x5 | undefined) ?? base.modMatrix,
		fx: {
			chorus: { ...base.fx.chorus, ...(overrides.fx?.chorus ?? {}) },
			crush: { ...base.fx.crush, ...(overrides.fx?.crush ?? {}) },
			delay: { ...base.fx.delay, ...(overrides.fx?.delay ?? {}) },
			reverb: { ...base.fx.reverb, ...(overrides.fx?.reverb ?? {}) }
		},
		arpSeq: {
			...base.arpSeq,
			...(overrides.arpSeq ?? {}),
			steps: (overrides.arpSeq?.steps as SeqStep[] | undefined) ?? base.arpSeq.steps
		}
	};
	return deepFreezePatch(validateSynthPatch(next));
}

function deepFreezePatch(patch: SynthPatch): SynthPatch {
	Object.freeze(patch.osc1);
	Object.freeze(patch.osc2);
	Object.freeze(patch.sub);
	Object.freeze(patch.noise);
	Object.freeze(patch.mix);
	Object.freeze(patch.filter);
	Object.freeze(patch.ampEnv);
	Object.freeze(patch.filterEnv);
	Object.freeze(patch.lfo1);
	Object.freeze(patch.lfo2);
	for (const row of patch.modMatrix) Object.freeze(row);
	Object.freeze(patch.modMatrix);
	Object.freeze(patch.fx.chorus);
	Object.freeze(patch.fx.crush);
	Object.freeze(patch.fx.delay);
	Object.freeze(patch.fx.reverb);
	Object.freeze(patch.fx);
	for (const step of patch.arpSeq.steps) Object.freeze(step);
	Object.freeze(patch.arpSeq.steps);
	Object.freeze(patch.arpSeq);
	return Object.freeze(patch);
}

export const FACTORY_PRESETS: readonly SynthPatch[] = Object.freeze([
	// 01
	deepFreezePatch(createForgivingGrandBase()),
	// 02
	makePreset({
		id: '02-electric-tines',
		name: '02 Electric Tines',
		category: 'Keys',
		osc1: { wave: 'fm', shape: 0.36, fmRatio: 2 },
		osc2: { wave: 'sine', oct: 1, shape: 0.5 },
		mix: { osc1: 0.85, osc2: 0.25, sub: 0, noise: 0 },
		filter: { type: 'lp24', cutoffHz: 7200, resonance: 0.85, envAmt: 0.22, keyTrack: 0.35 },
		ampEnv: { attack: 0.004, decay: 1.4, sustain: 0.18, release: 0.45 },
		filterEnv: { attack: 0.004, decay: 0.55, sustain: 0.2, release: 0.35 },
		lfo1: { wave: 'sine', rateHz: 3.4, depth: 0.25 },
		modMatrix: [
			[0, 0, 0.12, 0, 0.18],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0.18, 0.25, 0, 0.2],
			[0, 0, 0, 0, 0]
		],
		fx: {
			chorus: { bypass: false, rateHz: 0.65, depth: 0.32, mix: 0.22 },
			reverb: { room: 'studio', mix: 0.2 }
		}
	}),
	// 03
	makePreset({
		id: '03-warm-analog-poly',
		name: '03 Warm Analog Poly',
		category: 'Poly',
		osc1: { wave: 'saw', shape: 0.4 },
		osc2: { wave: 'saw', fine: 9, shape: 0.4 },
		mix: { osc1: 0.72, osc2: 0.68, sub: 0.12, noise: 0 },
		filter: {
			type: 'lp24',
			cutoffHz: 2400,
			resonance: 1.6,
			drive: 0.12,
			envAmt: 0.48,
			keyTrack: 0.45
		},
		ampEnv: { attack: 0.025, decay: 0.65, sustain: 0.74, release: 0.55 },
		filterEnv: { attack: 0.03, decay: 0.75, sustain: 0.28, release: 0.48 },
		lfo1: { wave: 'sine', rateHz: 0.9, depth: 0.2 },
		modMatrix: [
			[0.05, 0, 0.14, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0.2, 0, 0.12],
			[0, 0, 0.25, 0, 0]
		],
		fx: {
			chorus: { bypass: false, rateHz: 0.45, depth: 0.28, mix: 0.18 },
			reverb: { room: 'studio', mix: 0.24 }
		}
	}),
	// 04
	makePreset({
		id: '04-neon-supersaw',
		name: '04 Neon Supersaw',
		category: 'Poly',
		osc1: { wave: 'supersaw', shape: 0.55 },
		osc2: { wave: 'saw', oct: 0, fine: -7 },
		sub: { oct: -1, wave: 'sine' },
		mix: { osc1: 0.85, osc2: 0.35, sub: 0.35, noise: 0 },
		filter: {
			type: 'lp12',
			cutoffHz: 5200,
			resonance: 1.4,
			drive: 0.15,
			envAmt: 0.38,
			keyTrack: 0.5
		},
		ampEnv: { attack: 0.015, decay: 0.5, sustain: 0.85, release: 0.42 },
		filterEnv: { attack: 0.015, decay: 0.45, sustain: 0.4, release: 0.35 },
		fx: {
			chorus: { bypass: false, rateHz: 0.95, depth: 0.45, mix: 0.32 },
			reverb: { room: 'chamber', mix: 0.28 }
		}
	}),
	// 05
	makePreset({
		id: '05-glass-pluck',
		name: '05 Glass Pluck',
		category: 'Poly',
		osc1: { wave: 'harmonic', shape: 0.65 },
		osc2: { wave: 'tri', oct: 1, fine: 5 },
		mix: { osc1: 0.8, osc2: 0.4, sub: 0, noise: 0.04 },
		filter: { type: 'lp24', cutoffHz: 3200, resonance: 2.4, envAmt: 0.55, keyTrack: 0.85 },
		ampEnv: { attack: 0.003, decay: 0.22, sustain: 0, release: 0.24 },
		filterEnv: { attack: 0.003, decay: 0.2, sustain: 0, release: 0.2 },
		fx: {
			delay: {
				bypass: false,
				timeMs: 280,
				bpmSync: false,
				syncDiv: '1/8d',
				feedback: 0.36,
				toneHz: 5200,
				mix: 0.26
			},
			reverb: { room: 'room', mix: 0.22 }
		}
	}),
	// 06
	makePreset({
		id: '06-midnight-mono-lead',
		name: '06 Midnight Mono Lead',
		category: 'Lead',
		osc1: { wave: 'pwm', shape: 0.32 },
		osc2: { wave: 'saw', fine: 6 },
		mix: { osc1: 0.82, osc2: 0.46, sub: 0.18, noise: 0 },
		filter: {
			type: 'lp24',
			cutoffHz: 2800,
			resonance: 3.1,
			drive: 0.2,
			envAmt: 0.44,
			keyTrack: 0.6
		},
		ampEnv: { attack: 0.012, decay: 0.32, sustain: 0.84, release: 0.22 },
		filterEnv: { attack: 0.015, decay: 0.35, sustain: 0.45, release: 0.25 },
		lfo1: { wave: 'sine', rateHz: 5.2, depth: 0.55 },
		modMatrix: [
			[0.06, 0.42, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0.18, 0, 0],
			[0.12, 0, 0.3, 0, 0]
		],
		voiceMode: 'legato',
		glideMs: 75,
		fx: {
			delay: {
				bypass: false,
				timeMs: 360,
				bpmSync: false,
				syncDiv: '1/4',
				feedback: 0.32,
				toneHz: 4800,
				mix: 0.24
			},
			reverb: { room: 'studio', mix: 0.22 }
		}
	}),
	// 07
	makePreset({
		id: '07-acid-res-lead',
		name: '07 Acid Resonance Lead',
		category: 'Lead',
		osc1: { wave: 'saw', shape: 0.5 },
		osc2: { wave: 'pwm', shape: 0.2 },
		mix: { osc1: 0.9, osc2: 0.22, sub: 0.15, noise: 0 },
		filter: {
			type: 'lp24',
			cutoffHz: 680,
			resonance: 9.5,
			drive: 0.35,
			envAmt: 0.72,
			keyTrack: 0.5
		},
		ampEnv: { attack: 0.004, decay: 0.28, sustain: 0.65, release: 0.14 },
		filterEnv: { attack: 0.005, decay: 0.24, sustain: 0.12, release: 0.15 },
		voiceMode: 'mono',
		glideMs: 45,
		fx: {
			delay: {
				bypass: false,
				timeMs: 240,
				bpmSync: false,
				syncDiv: '1/16',
				feedback: 0.38,
				toneHz: 4200,
				mix: 0.22
			}
		}
	}),
	// 08
	makePreset({
		id: '08-sub-octave-bass',
		name: '08 Sub Octave Bass',
		category: 'Bass',
		osc1: { wave: 'saw', oct: -1, shape: 0.4 },
		osc2: { wave: 'tri', oct: -1, fine: 4 },
		sub: { oct: -1, wave: 'sine' },
		mix: { osc1: 0.7, osc2: 0.25, sub: 0.75, noise: 0 },
		filter: {
			type: 'lp24',
			cutoffHz: 540,
			resonance: 2.2,
			drive: 0.22,
			envAmt: 0.52,
			keyTrack: 0.25
		},
		ampEnv: { attack: 0.004, decay: 0.34, sustain: 0.72, release: 0.14 },
		filterEnv: { attack: 0.004, decay: 0.22, sustain: 0.15, release: 0.14 },
		voiceMode: 'mono',
		glideMs: 20
	}),
	// 09
	makePreset({
		id: '09-acid-pulse-bass',
		name: '09 Acid Pulse Bass',
		category: 'Bass',
		osc1: { wave: 'pwm', oct: -1, shape: 0.28 },
		osc2: { wave: 'saw', oct: -1, fine: -5 },
		sub: { oct: -1, wave: 'square' },
		mix: { osc1: 0.78, osc2: 0.3, sub: 0.45, noise: 0 },
		filter: {
			type: 'lp24',
			cutoffHz: 760,
			resonance: 6.2,
			drive: 0.3,
			envAmt: 0.62,
			keyTrack: 0.35
		},
		ampEnv: { attack: 0.003, decay: 0.26, sustain: 0.58, release: 0.12 },
		filterEnv: { attack: 0.003, decay: 0.2, sustain: 0.1, release: 0.12 },
		voiceMode: 'mono',
		glideMs: 30,
		fx: {
			crush: { bypass: false, drive: 0.28, bitDepth: 12, toneHz: 6200, mix: 0.25 }
		}
	}),
	// 10
	makePreset({
		id: '10-monsoon-haze-pad',
		name: '10 Monsoon Haze Pad',
		category: 'Pad',
		osc1: { wave: 'saw', shape: 0.45 },
		osc2: { wave: 'pwm', fine: 8, shape: 0.6 },
		noise: { type: 'pink' },
		mix: { osc1: 0.68, osc2: 0.62, sub: 0.2, noise: 0.05 },
		filter: { type: 'lp12', cutoffHz: 1850, resonance: 1.5, envAmt: 0.28, keyTrack: 0.3 },
		ampEnv: { attack: 1.1, decay: 1.2, sustain: 0.88, release: 2.2 },
		filterEnv: { attack: 1.3, decay: 1.5, sustain: 0.5, release: 2.0 },
		lfo1: { wave: 'sine', rateHz: 0.28, depth: 0.45 },
		modMatrix: [
			[0, 0.22, 0.34, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0.3, 0, 0]
		],
		voiceMode: 'unison',
		unisonVoices: 2,
		unisonSpreadCt: 18,
		fx: {
			chorus: { bypass: false, rateHz: 0.35, depth: 0.48, mix: 0.35 },
			reverb: { room: 'hall', mix: 0.48 }
		}
	}),
	// 11
	makePreset({
		id: '11-shimmer-choir-pad',
		name: '11 Shimmer Choir Pad',
		category: 'Pad',
		osc1: { wave: 'harmonic', shape: 0.52 },
		osc2: { wave: 'tri', oct: 1, fine: 6 },
		noise: { type: 'pink' },
		mix: { osc1: 0.72, osc2: 0.52, sub: 0.14, noise: 0.08 },
		filter: { type: 'bp12', cutoffHz: 2200, resonance: 1.8, envAmt: 0.24, keyTrack: 0.45 },
		ampEnv: { attack: 0.85, decay: 1.0, sustain: 0.9, release: 2.4 },
		filterEnv: { attack: 0.9, decay: 1.2, sustain: 0.6, release: 1.8 },
		lfo1: { wave: 'tri', rateHz: 0.4, depth: 0.35 },
		modMatrix: [
			[0, 0.25, 0.22, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0]
		],
		fx: {
			chorus: { bypass: false, rateHz: 0.5, depth: 0.52, mix: 0.4 },
			reverb: { room: 'canyon', mix: 0.55 }
		}
	}),
	// 12
	makePreset({
		id: '12-twilight-arp',
		name: '12 Twilight Arp',
		category: 'Poly',
		osc1: { wave: 'pwm', shape: 0.35 },
		osc2: { wave: 'tri', oct: 1, fine: 4 },
		mix: { osc1: 0.8, osc2: 0.42, sub: 0.22, noise: 0 },
		filter: { type: 'lp24', cutoffHz: 2600, resonance: 2.8, envAmt: 0.5, keyTrack: 0.65 },
		ampEnv: { attack: 0.004, decay: 0.28, sustain: 0.25, release: 0.22 },
		filterEnv: { attack: 0.004, decay: 0.24, sustain: 0.15, release: 0.2 },
		fx: {
			delay: {
				bypass: false,
				timeMs: 400,
				bpmSync: true,
				syncDiv: '1/8d',
				feedback: 0.44,
				toneHz: 5600,
				mix: 0.32
			},
			reverb: { room: 'chamber', mix: 0.28 }
		},
		arpSeq: {
			engine: 'arp',
			arpMode: 'up-down',
			octaves: 2,
			division: '1/16',
			gate: 0.72,
			swing: 0.12,
			bpm: 112,
			hold: false,
			steps: createDefaultSteps()
		}
	}),
	// 13
	makePreset({
		id: '13-bitcrushed-bell',
		name: '13 Bitcrushed Bell',
		category: 'FX',
		osc1: { wave: 'fm', shape: 0.58, fmRatio: 3.5 },
		osc2: { wave: 'sine', oct: 1, fine: 11, ringMod: true },
		mix: { osc1: 0.82, osc2: 0.48, sub: 0, noise: 0.04 },
		filter: { type: 'lp12', cutoffHz: 6400, resonance: 1.9, envAmt: 0.32, keyTrack: 0.6 },
		ampEnv: { attack: 0.002, decay: 1.15, sustain: 0.08, release: 0.9 },
		filterEnv: { attack: 0.002, decay: 0.75, sustain: 0.1, release: 0.65 },
		fx: {
			crush: { bypass: false, drive: 0.3, bitDepth: 6, toneHz: 7800, mix: 0.55 },
			reverb: { room: 'canyon', mix: 0.42 }
		}
	}),
	// 14
	makePreset({
		id: '14-cosmic-drone',
		name: '14 Cosmic Drone',
		category: 'FX',
		osc1: { wave: 'harmonic', oct: -1, shape: 0.7 },
		osc2: { wave: 'pwm', oct: 0, fine: 14, shape: 0.45, ringMod: true },
		sub: { oct: -2, wave: 'sine' },
		noise: { type: 'pink' },
		mix: { osc1: 0.72, osc2: 0.5, sub: 0.38, noise: 0.12 },
		filter: {
			type: 'bp12',
			cutoffHz: 1100,
			resonance: 4.5,
			drive: 0.18,
			envAmt: 0.35,
			keyTrack: 0.25
		},
		ampEnv: { attack: 1.4, decay: 1.8, sustain: 0.92, release: 2.8 },
		filterEnv: { attack: 1.6, decay: 2.0, sustain: 0.6, release: 2.4 },
		lfo1: { wave: 'sh', rateHz: 1.6, depth: 0.55 },
		lfo2: { wave: 'sine', rateHz: 0.18, depth: 0.6 },
		modMatrix: [
			[0, 0, 0.48, 0.2, 0],
			[0.14, 0.45, 0.2, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0, 0, 0],
			[0, 0, 0.35, 0, 0]
		],
		fx: {
			delay: {
				bypass: false,
				timeMs: 480,
				bpmSync: false,
				syncDiv: '1/4d',
				feedback: 0.56,
				toneHz: 3600,
				mix: 0.4
			},
			reverb: { room: 'canyon', mix: 0.62 }
		}
	})
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	try {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	} catch {
		return false;
	}
}

function safeIsArray(value: unknown): value is unknown[] {
	try {
		return Array.isArray(value);
	} catch {
		return false;
	}
}

function own(obj: Record<string, unknown>, key: string): unknown {
	try {
		return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
	} catch {
		return undefined;
	}
}

function ownIndex(arr: unknown[], index: number): unknown {
	try {
		return Object.prototype.hasOwnProperty.call(arr, index) ? arr[index] : undefined;
	} catch {
		return undefined;
	}
}

function normalizeZero(value: number): number {
	return value === 0 ? 0 : value;
}

function stripControlChars(text: string): string {
	let result = '';
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code < 32 || code === 127) continue;
		if (code >= 0xd800 && code <= 0xdbff) {
			const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
			if (next >= 0xdc00 && next <= 0xdfff) {
				result += text[i] + text[i + 1];
				i++;
			}
			continue;
		}
		if (code >= 0xdc00 && code <= 0xdfff) continue;
		result += text[i];
	}
	return result;
}

function sanitizeText(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	let cleaned = stripControlChars(value).trim();
	if (cleaned.length > PATCH_BOUNDS.maxTextLength) {
		let end = PATCH_BOUNDS.maxTextLength;
		const lastCode = cleaned.charCodeAt(end - 1);
		if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
			end--;
		}
		cleaned = cleaned.slice(0, end);
	}
	return cleaned.length > 0 ? cleaned : fallback;
}

function clampNum(value: unknown, bounds: readonly [number, number], fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return normalizeZero(fallback);
	return normalizeZero(Math.min(bounds[1], Math.max(bounds[0], value)));
}

function clampInt(value: unknown, bounds: readonly [number, number], fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return normalizeZero(fallback);
	return normalizeZero(Math.min(bounds[1], Math.max(bounds[0], Math.round(value))));
}

function snapEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === 'string' && (allowed as readonly string[]).includes(value)
		? (value as T)
		: fallback;
}

function snapBool(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function snapOctave(value: unknown, fallback: OscOctave): OscOctave {
	return clampInt(value, [-1, 2], fallback) as OscOctave;
}

function snapSubOctave(value: unknown, fallback: SubOctave): SubOctave {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return value <= -1.5 ? -2 : -1;
}

function snapUnisonVoices(value: unknown, fallback: UnisonVoices): UnisonVoices {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return value >= 2.5 ? 3 : 2;
}

function validateAdsr(input: unknown, fallback: AdsrConfig): AdsrConfig {
	const obj = isPlainObject(input) ? input : {};
	return {
		attack: clampNum(own(obj, 'attack'), PATCH_BOUNDS.attack, fallback.attack),
		decay: clampNum(own(obj, 'decay'), PATCH_BOUNDS.decay, fallback.decay),
		sustain: clampNum(own(obj, 'sustain'), PATCH_BOUNDS.sustain, fallback.sustain),
		release: clampNum(own(obj, 'release'), PATCH_BOUNDS.release, fallback.release)
	};
}

function validateLfo(input: unknown, fallback: LfoConfig): LfoConfig {
	const obj = isPlainObject(input) ? input : {};
	return {
		wave: snapEnum(own(obj, 'wave'), LFO_WAVES, fallback.wave),
		rateHz: clampNum(own(obj, 'rateHz'), PATCH_BOUNDS.lfoRateHz, fallback.rateHz),
		syncDiv: snapEnum(own(obj, 'syncDiv'), SYNC_DIVISIONS, fallback.syncDiv),
		depth: clampNum(own(obj, 'depth'), PATCH_BOUNDS.lfoDepth, fallback.depth),
		bpmSync: snapBool(own(obj, 'bpmSync'), fallback.bpmSync),
		keySync: snapBool(own(obj, 'keySync'), fallback.keySync)
	};
}

function validateModMatrix(input: unknown): ModMatrix5x5 {
	const rows = safeIsArray(input) ? input : [];
	const matrix: ModMatrixRow[] = [];
	for (let r = 0; r < 5; r++) {
		const maybeRow = ownIndex(rows, r);
		const rawRow = safeIsArray(maybeRow) ? maybeRow : [];
		const row: ModMatrixRow = [
			clampNum(ownIndex(rawRow, 0), PATCH_BOUNDS.modDepth, 0),
			clampNum(ownIndex(rawRow, 1), PATCH_BOUNDS.modDepth, 0),
			clampNum(ownIndex(rawRow, 2), PATCH_BOUNDS.modDepth, 0),
			clampNum(ownIndex(rawRow, 3), PATCH_BOUNDS.modDepth, 0),
			clampNum(ownIndex(rawRow, 4), PATCH_BOUNDS.modDepth, 0)
		];
		matrix.push(row);
	}
	return matrix as ModMatrix5x5;
}

function validateSeqStep(input: unknown): SeqStep {
	const obj = isPlainObject(input) ? input : {};
	const rawNote = own(obj, 'note');
	const note =
		typeof rawNote === 'number' && Number.isFinite(rawNote)
			? clampInt(rawNote, PATCH_BOUNDS.stepNote, 60)
			: null;
	return {
		active: snapBool(own(obj, 'active'), false),
		note,
		noteOffset: clampInt(own(obj, 'noteOffset'), PATCH_BOUNDS.stepNoteOffset, 0),
		gate: clampNum(own(obj, 'gate'), PATCH_BOUNDS.stepGate, 0.8),
		tie: snapBool(own(obj, 'tie'), false),
		accent: snapBool(own(obj, 'accent'), false)
	};
}

export function validateSynthPatch(input: unknown): SynthPatch {
	const d = DEFAULT_PATCH;
	const obj = isPlainObject(input) ? input : {};

	const osc1Raw = own(obj, 'osc1');
	const osc1Obj = isPlainObject(osc1Raw) ? osc1Raw : {};
	const osc2Raw = own(obj, 'osc2');
	const osc2Obj = isPlainObject(osc2Raw) ? osc2Raw : {};
	const subRaw = own(obj, 'sub');
	const subObj = isPlainObject(subRaw) ? subRaw : {};
	const noiseRaw = own(obj, 'noise');
	const noiseObj = isPlainObject(noiseRaw) ? noiseRaw : {};
	const mixRaw = own(obj, 'mix');
	const mixObj = isPlainObject(mixRaw) ? mixRaw : {};
	const filterRaw = own(obj, 'filter');
	const filterObj = isPlainObject(filterRaw) ? filterRaw : {};
	const fxRaw = own(obj, 'fx');
	const fxObj = isPlainObject(fxRaw) ? fxRaw : {};
	const chorusRaw = own(fxObj, 'chorus');
	const chorusObj = isPlainObject(chorusRaw) ? chorusRaw : {};
	const crushRaw = own(fxObj, 'crush');
	const crushObj = isPlainObject(crushRaw) ? crushRaw : {};
	const delayRaw = own(fxObj, 'delay');
	const delayObj = isPlainObject(delayRaw) ? delayRaw : {};
	const reverbRaw = own(fxObj, 'reverb');
	const reverbObj = isPlainObject(reverbRaw) ? reverbRaw : {};
	const arpRaw = own(obj, 'arpSeq');
	const arpObj = isPlainObject(arpRaw) ? arpRaw : {};
	const stepsRaw = own(arpObj, 'steps');
	const rawSteps = safeIsArray(stepsRaw) ? stepsRaw : [];

	const steps: SeqStep[] = [];
	for (let i = 0; i < ARP_STEP_COUNT; i++) {
		steps.push(validateSeqStep(ownIndex(rawSteps, i)));
	}

	return {
		version: SYNTH_PATCH_VERSION,
		id: sanitizeText(own(obj, 'id'), d.id),
		name: sanitizeText(own(obj, 'name'), d.name),
		category: snapEnum(own(obj, 'category'), PATCH_CATEGORIES, d.category),
		osc1: {
			wave: snapEnum(own(osc1Obj, 'wave'), OSC1_WAVES, d.osc1.wave),
			oct: snapOctave(own(osc1Obj, 'oct'), d.osc1.oct),
			semi: clampInt(own(osc1Obj, 'semi'), PATCH_BOUNDS.semi, d.osc1.semi),
			fine: clampNum(own(osc1Obj, 'fine'), PATCH_BOUNDS.fine, d.osc1.fine),
			shape: clampNum(own(osc1Obj, 'shape'), PATCH_BOUNDS.shape, d.osc1.shape),
			fmRatio: clampNum(own(osc1Obj, 'fmRatio'), PATCH_BOUNDS.fmRatio, d.osc1.fmRatio)
		},
		osc2: {
			wave: snapEnum(own(osc2Obj, 'wave'), OSC2_WAVES, d.osc2.wave),
			oct: snapOctave(own(osc2Obj, 'oct'), d.osc2.oct),
			semi: clampInt(own(osc2Obj, 'semi'), PATCH_BOUNDS.semi, d.osc2.semi),
			fine: clampNum(own(osc2Obj, 'fine'), PATCH_BOUNDS.fine, d.osc2.fine),
			shape: clampNum(own(osc2Obj, 'shape'), PATCH_BOUNDS.shape, d.osc2.shape),
			ringMod: snapBool(own(osc2Obj, 'ringMod'), d.osc2.ringMod)
		},
		sub: {
			oct: snapSubOctave(own(subObj, 'oct'), d.sub.oct),
			wave: snapEnum(own(subObj, 'wave'), SUB_WAVES, d.sub.wave)
		},
		noise: {
			type: snapEnum(own(noiseObj, 'type'), NOISE_TYPES, d.noise.type)
		},
		mix: {
			osc1: clampNum(own(mixObj, 'osc1'), PATCH_BOUNDS.mix, d.mix.osc1),
			osc2: clampNum(own(mixObj, 'osc2'), PATCH_BOUNDS.mix, d.mix.osc2),
			sub: clampNum(own(mixObj, 'sub'), PATCH_BOUNDS.mix, d.mix.sub),
			noise: clampNum(own(mixObj, 'noise'), PATCH_BOUNDS.mix, d.mix.noise)
		},
		filter: {
			type: snapEnum(own(filterObj, 'type'), FILTER_TYPES, d.filter.type),
			cutoffHz: clampNum(own(filterObj, 'cutoffHz'), PATCH_BOUNDS.cutoffHz, d.filter.cutoffHz),
			resonance: clampNum(own(filterObj, 'resonance'), PATCH_BOUNDS.resonance, d.filter.resonance),
			drive: clampNum(own(filterObj, 'drive'), PATCH_BOUNDS.drive, d.filter.drive),
			envAmt: clampNum(own(filterObj, 'envAmt'), PATCH_BOUNDS.envAmt, d.filter.envAmt),
			keyTrack: clampNum(own(filterObj, 'keyTrack'), PATCH_BOUNDS.keyTrack, d.filter.keyTrack)
		},
		ampEnv: validateAdsr(own(obj, 'ampEnv'), d.ampEnv),
		filterEnv: validateAdsr(own(obj, 'filterEnv'), d.filterEnv),
		lfo1: validateLfo(own(obj, 'lfo1'), d.lfo1),
		lfo2: validateLfo(own(obj, 'lfo2'), d.lfo2),
		modMatrix: validateModMatrix(own(obj, 'modMatrix')),
		fx: {
			chorus: {
				bypass: snapBool(own(chorusObj, 'bypass'), d.fx.chorus.bypass),
				rateHz: clampNum(own(chorusObj, 'rateHz'), PATCH_BOUNDS.chorusRateHz, d.fx.chorus.rateHz),
				depth: clampNum(own(chorusObj, 'depth'), PATCH_BOUNDS.chorusDepth, d.fx.chorus.depth),
				mix: clampNum(own(chorusObj, 'mix'), PATCH_BOUNDS.mix, d.fx.chorus.mix)
			},
			crush: {
				bypass: snapBool(own(crushObj, 'bypass'), d.fx.crush.bypass),
				drive: clampNum(own(crushObj, 'drive'), PATCH_BOUNDS.drive, d.fx.crush.drive),
				bitDepth: clampInt(
					own(crushObj, 'bitDepth'),
					PATCH_BOUNDS.crushBitDepth,
					d.fx.crush.bitDepth
				),
				toneHz: clampNum(own(crushObj, 'toneHz'), PATCH_BOUNDS.crushToneHz, d.fx.crush.toneHz),
				mix: clampNum(own(crushObj, 'mix'), PATCH_BOUNDS.mix, d.fx.crush.mix)
			},
			delay: {
				bypass: snapBool(own(delayObj, 'bypass'), d.fx.delay.bypass),
				timeMs: clampNum(own(delayObj, 'timeMs'), PATCH_BOUNDS.delayTimeMs, d.fx.delay.timeMs),
				bpmSync: snapBool(own(delayObj, 'bpmSync'), d.fx.delay.bpmSync),
				syncDiv: snapEnum(own(delayObj, 'syncDiv'), DELAY_SYNC_DIVISIONS, d.fx.delay.syncDiv),
				feedback: clampNum(
					own(delayObj, 'feedback'),
					PATCH_BOUNDS.delayFeedback,
					d.fx.delay.feedback
				),
				toneHz: clampNum(own(delayObj, 'toneHz'), PATCH_BOUNDS.delayToneHz, d.fx.delay.toneHz),
				mix: clampNum(own(delayObj, 'mix'), PATCH_BOUNDS.mix, d.fx.delay.mix)
			},
			reverb: {
				room: snapEnum(own(reverbObj, 'room'), REVERB_ROOMS, d.fx.reverb.room),
				mix: clampNum(own(reverbObj, 'mix'), PATCH_BOUNDS.mix, d.fx.reverb.mix)
			}
		},
		voiceMode: snapEnum(own(obj, 'voiceMode'), VOICE_MODES, d.voiceMode),
		unisonVoices: snapUnisonVoices(own(obj, 'unisonVoices'), d.unisonVoices),
		unisonSpreadCt: clampNum(
			own(obj, 'unisonSpreadCt'),
			PATCH_BOUNDS.unisonSpreadCt,
			d.unisonSpreadCt
		),
		glideMs: clampNum(own(obj, 'glideMs'), PATCH_BOUNDS.glideMs, d.glideMs),
		chordMemory: snapEnum(own(obj, 'chordMemory'), CHORD_MEMORY_MODES, d.chordMemory),
		arpSeq: {
			engine: snapEnum(own(arpObj, 'engine'), ARP_ENGINES, d.arpSeq.engine),
			arpMode: snapEnum(own(arpObj, 'arpMode'), ARP_MODES, d.arpSeq.arpMode),
			octaves: clampInt(own(arpObj, 'octaves'), PATCH_BOUNDS.arpOctaves, d.arpSeq.octaves) as
				| 1
				| 2
				| 3,
			division: snapEnum(own(arpObj, 'division'), ARP_DIVISIONS, d.arpSeq.division),
			gate: clampNum(own(arpObj, 'gate'), PATCH_BOUNDS.arpGate, d.arpSeq.gate),
			swing: clampNum(own(arpObj, 'swing'), PATCH_BOUNDS.arpSwing, d.arpSeq.swing),
			bpm: clampInt(own(arpObj, 'bpm'), PATCH_BOUNDS.bpm, d.arpSeq.bpm),
			hold: snapBool(own(arpObj, 'hold'), d.arpSeq.hold),
			steps
		}
	};
}

export function cloneSynthPatch(patch: SynthPatch): SynthPatch {
	return validateSynthPatch(patch);
}

export function getFactoryPreset(idOrIndex: string | number): SynthPatch {
	if (typeof idOrIndex === 'number') {
		const idx = Number.isInteger(idOrIndex) ? idOrIndex : -1;
		const found =
			idx >= 0 && idx < FACTORY_PRESETS.length ? FACTORY_PRESETS[idx] : FACTORY_PRESETS[0];
		return cloneSynthPatch(found);
	}
	const found = FACTORY_PRESETS.find(
		(preset) => preset.id === idOrIndex || preset.name === idOrIndex
	);
	return cloneSynthPatch(found ?? FACTORY_PRESETS[0]);
}

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < B64URL_ALPHABET.length; i++) {
	B64URL_LOOKUP[B64URL_ALPHABET.charCodeAt(i)] = i;
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const b0 = bytes[i];
		const hasB1 = i + 1 < bytes.length;
		const hasB2 = i + 2 < bytes.length;
		const b1 = hasB1 ? bytes[i + 1] : 0;
		const b2 = hasB2 ? bytes[i + 2] : 0;
		const triple = (b0 << 16) | (b1 << 8) | b2;
		out += B64URL_ALPHABET[(triple >>> 18) & 63];
		out += B64URL_ALPHABET[(triple >>> 12) & 63];
		if (hasB1) out += B64URL_ALPHABET[(triple >>> 6) & 63];
		if (hasB2) out += B64URL_ALPHABET[triple & 63];
	}
	return out;
}

function base64UrlToBytes(str: string): Uint8Array | null {
	if (str.length === 0 || str.length % 4 === 1) return null;
	const fullGroups = Math.floor(str.length / 4);
	const rem = str.length % 4;
	const outLen = fullGroups * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0);
	const out = new Uint8Array(outLen);
	let outIdx = 0;
	for (let i = 0; i < str.length; i += 4) {
		const c0 = str.charCodeAt(i);
		const c1 = str.charCodeAt(i + 1);
		const c2 = i + 2 < str.length ? str.charCodeAt(i + 2) : -1;
		const c3 = i + 3 < str.length ? str.charCodeAt(i + 3) : -1;
		if (c0 >= 128 || c1 >= 128 || (c2 >= 0 && c2 >= 128) || (c3 >= 0 && c3 >= 128)) return null;
		const v0 = B64URL_LOOKUP[c0];
		const v1 = B64URL_LOOKUP[c1];
		const v2 = c2 >= 0 ? B64URL_LOOKUP[c2] : 0;
		const v3 = c3 >= 0 ? B64URL_LOOKUP[c3] : 0;
		if (v0 < 0 || v1 < 0 || (c2 >= 0 && v2 < 0) || (c3 >= 0 && v3 < 0)) return null;
		const triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
		out[outIdx++] = (triple >>> 16) & 0xff;
		if (c2 >= 0) out[outIdx++] = (triple >>> 8) & 0xff;
		if (c3 >= 0) out[outIdx++] = triple & 0xff;
	}
	return out;
}

function round4(value: number): number {
	const rounded = Math.round(value * 10000) / 10000;
	return normalizeZero(rounded);
}

function boolToBit(value: boolean): 0 | 1 {
	return value ? 1 : 0;
}

function bitToBool(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') return value;
	if (value === 1) return true;
	if (value === 0) return false;
	return fallback;
}

function prepareForHash(patch: SynthPatch): Record<string, unknown> {
	const c = validateSynthPatch(patch);
	const flatMod: number[] = [];
	let hasNonZeroMod = false;
	for (const row of c.modMatrix) {
		for (const cell of row) {
			const v = round4(cell);
			if (v !== 0) hasNonZeroMod = true;
			flatMod.push(v);
		}
	}
	const steps = c.arpSeq.steps.map((s) => [
		boolToBit(s.active),
		s.note,
		s.noteOffset,
		round4(s.gate),
		boolToBit(s.tie),
		boolToBit(s.accent)
	]);
	const out: Record<string, unknown> = {
		v: c.version,
		i: c.id,
		n: c.name,
		c: c.category,
		o1: [
			c.osc1.wave,
			c.osc1.oct,
			c.osc1.semi,
			round4(c.osc1.fine),
			round4(c.osc1.shape),
			round4(c.osc1.fmRatio)
		],
		o2: [
			c.osc2.wave,
			c.osc2.oct,
			c.osc2.semi,
			round4(c.osc2.fine),
			round4(c.osc2.shape),
			boolToBit(c.osc2.ringMod)
		],
		s: [c.sub.oct, c.sub.wave],
		ns: c.noise.type,
		m: [round4(c.mix.osc1), round4(c.mix.osc2), round4(c.mix.sub), round4(c.mix.noise)],
		f: [
			c.filter.type,
			round4(c.filter.cutoffHz),
			round4(c.filter.resonance),
			round4(c.filter.drive),
			round4(c.filter.envAmt),
			round4(c.filter.keyTrack)
		],
		ae: [
			round4(c.ampEnv.attack),
			round4(c.ampEnv.decay),
			round4(c.ampEnv.sustain),
			round4(c.ampEnv.release)
		],
		fe: [
			round4(c.filterEnv.attack),
			round4(c.filterEnv.decay),
			round4(c.filterEnv.sustain),
			round4(c.filterEnv.release)
		],
		l1: [
			c.lfo1.wave,
			round4(c.lfo1.rateHz),
			c.lfo1.syncDiv,
			round4(c.lfo1.depth),
			boolToBit(c.lfo1.bpmSync),
			boolToBit(c.lfo1.keySync)
		],
		l2: [
			c.lfo2.wave,
			round4(c.lfo2.rateHz),
			c.lfo2.syncDiv,
			round4(c.lfo2.depth),
			boolToBit(c.lfo2.bpmSync),
			boolToBit(c.lfo2.keySync)
		],
		fx: [
			[
				boolToBit(c.fx.chorus.bypass),
				round4(c.fx.chorus.rateHz),
				round4(c.fx.chorus.depth),
				round4(c.fx.chorus.mix)
			],
			[
				boolToBit(c.fx.crush.bypass),
				round4(c.fx.crush.drive),
				c.fx.crush.bitDepth,
				round4(c.fx.crush.toneHz),
				round4(c.fx.crush.mix)
			],
			[
				boolToBit(c.fx.delay.bypass),
				round4(c.fx.delay.timeMs),
				boolToBit(c.fx.delay.bpmSync),
				c.fx.delay.syncDiv,
				round4(c.fx.delay.feedback),
				round4(c.fx.delay.toneHz),
				round4(c.fx.delay.mix)
			],
			[c.fx.reverb.room, round4(c.fx.reverb.mix)]
		],
		vm: [c.voiceMode, c.unisonVoices, round4(c.unisonSpreadCt), round4(c.glideMs), c.chordMemory],
		as: [
			c.arpSeq.engine,
			c.arpSeq.arpMode,
			c.arpSeq.octaves,
			c.arpSeq.division,
			round4(c.arpSeq.gate),
			round4(c.arpSeq.swing),
			c.arpSeq.bpm,
			boolToBit(c.arpSeq.hold),
			steps
		]
	};
	if (hasNonZeroMod) out.mm = flatMod;
	return out;
}

function expandCompactPatch(raw: Record<string, unknown>): Record<string, unknown> {
	const d = DEFAULT_PATCH;
	const tuple = (key: string): unknown[] => {
		const val = own(raw, key);
		return safeIsArray(val) ? val : [];
	};
	const o1 = tuple('o1');
	const o2 = tuple('o2');
	const s = tuple('s');
	const m = tuple('m');
	const f = tuple('f');
	const ae = tuple('ae');
	const fe = tuple('fe');
	const l1 = tuple('l1');
	const l2 = tuple('l2');
	const mmRaw = tuple('mm');
	const modMatrix: unknown[][] = [];
	if (mmRaw.length === 25) {
		for (let r = 0; r < 5; r++) {
			modMatrix.push([
				mmRaw[r * 5],
				mmRaw[r * 5 + 1],
				mmRaw[r * 5 + 2],
				mmRaw[r * 5 + 3],
				mmRaw[r * 5 + 4]
			]);
		}
	}
	const fx = tuple('fx');
	const fxCh = safeIsArray(fx[0]) ? fx[0] : [];
	const fxCr = safeIsArray(fx[1]) ? fx[1] : [];
	const fxDl = safeIsArray(fx[2]) ? fx[2] : [];
	const fxRv = safeIsArray(fx[3]) ? fx[3] : [];
	const vm = tuple('vm');
	const as = tuple('as');
	const rawSteps = safeIsArray(as[8]) ? as[8] : [];
	const steps = Array.from({ length: ARP_STEP_COUNT }, (_, idx) => {
		const st = safeIsArray(rawSteps[idx]) ? rawSteps[idx] : [];
		return {
			active: bitToBool(st[0], false),
			note: st[1],
			noteOffset: st[2],
			gate: st[3],
			tie: bitToBool(st[4], false),
			accent: bitToBool(st[5], false)
		};
	});
	return {
		version: SYNTH_PATCH_VERSION,
		id: own(raw, 'i'),
		name: own(raw, 'n'),
		category: own(raw, 'c'),
		osc1: { wave: o1[0], oct: o1[1], semi: o1[2], fine: o1[3], shape: o1[4], fmRatio: o1[5] },
		osc2: {
			wave: o2[0],
			oct: o2[1],
			semi: o2[2],
			fine: o2[3],
			shape: o2[4],
			ringMod: bitToBool(o2[5], d.osc2.ringMod)
		},
		sub: { oct: s[0], wave: s[1] },
		noise: { type: own(raw, 'ns') },
		mix: { osc1: m[0], osc2: m[1], sub: m[2], noise: m[3] },
		filter: {
			type: f[0],
			cutoffHz: f[1],
			resonance: f[2],
			drive: f[3],
			envAmt: f[4],
			keyTrack: f[5]
		},
		ampEnv: { attack: ae[0], decay: ae[1], sustain: ae[2], release: ae[3] },
		filterEnv: { attack: fe[0], decay: fe[1], sustain: fe[2], release: fe[3] },
		lfo1: {
			wave: l1[0],
			rateHz: l1[1],
			syncDiv: l1[2],
			depth: l1[3],
			bpmSync: bitToBool(l1[4], d.lfo1.bpmSync),
			keySync: bitToBool(l1[5], d.lfo1.keySync)
		},
		lfo2: {
			wave: l2[0],
			rateHz: l2[1],
			syncDiv: l2[2],
			depth: l2[3],
			bpmSync: bitToBool(l2[4], d.lfo2.bpmSync),
			keySync: bitToBool(l2[5], d.lfo2.keySync)
		},
		modMatrix: mmRaw.length === 25 ? modMatrix : undefined,
		fx: {
			chorus: {
				bypass: bitToBool(fxCh[0], d.fx.chorus.bypass),
				rateHz: fxCh[1],
				depth: fxCh[2],
				mix: fxCh[3]
			},
			crush: {
				bypass: bitToBool(fxCr[0], d.fx.crush.bypass),
				drive: fxCr[1],
				bitDepth: fxCr[2],
				toneHz: fxCr[3],
				mix: fxCr[4]
			},
			delay: {
				bypass: bitToBool(fxDl[0], d.fx.delay.bypass),
				timeMs: fxDl[1],
				bpmSync: bitToBool(fxDl[2], d.fx.delay.bpmSync),
				syncDiv: fxDl[3],
				feedback: fxDl[4],
				toneHz: fxDl[5],
				mix: fxDl[6]
			},
			reverb: { room: fxRv[0], mix: fxRv[1] }
		},
		voiceMode: vm[0],
		unisonVoices: vm[1],
		unisonSpreadCt: vm[2],
		glideMs: vm[3],
		chordMemory: vm[4],
		arpSeq: {
			engine: as[0],
			arpMode: as[1],
			octaves: as[2],
			division: as[3],
			gate: as[4],
			swing: as[5],
			bpm: as[6],
			hold: bitToBool(as[7], d.arpSeq.hold),
			steps
		}
	};
}

export function encodePatchHash(patch: SynthPatch): string {
	const payload = prepareForHash(patch);
	const bytes = new TextEncoder().encode(JSON.stringify(payload));
	const encoded = `#patch=${bytesToBase64Url(bytes)}`;
	if (encoded.length > MAX_PATCH_HASH_LENGTH) {
		throw new RangeError(`Encoded patch hash exceeded ${MAX_PATCH_HASH_LENGTH} characters.`);
	}
	return encoded;
}

export function decodePatchHash(hash: string): {
	patch: SynthPatch;
	ok: boolean;
	reason?: string;
} {
	const fallback = (): SynthPatch => cloneSynthPatch(FACTORY_PRESETS[0]);
	if (typeof hash !== 'string' || hash.length === 0) {
		return { patch: fallback(), ok: false, reason: 'Patch hash is empty.' };
	}
	if (hash.length > MAX_PATCH_HASH_LENGTH) {
		return {
			patch: fallback(),
			ok: false,
			reason: `Patch hash exceeds maximum length of ${MAX_PATCH_HASH_LENGTH} characters.`
		};
	}

	const payload = hash.startsWith('#patch=')
		? hash.slice('#patch='.length)
		: hash.startsWith('patch=')
			? hash.slice('patch='.length)
			: null;
	if (payload === null) {
		return { patch: fallback(), ok: false, reason: 'Missing #patch= prefix.' };
	}

	if (payload.length === 0) {
		return { patch: fallback(), ok: false, reason: 'Patch hash payload is empty.' };
	}

	const bytes = base64UrlToBytes(payload);
	if (!bytes) {
		return { patch: fallback(), ok: false, reason: 'Invalid base64url patch payload.' };
	}

	let jsonText: string;
	try {
		jsonText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return { patch: fallback(), ok: false, reason: 'Patch payload is not valid UTF-8.' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		return { patch: fallback(), ok: false, reason: 'Patch payload is not valid JSON.' };
	}

	if (!isPlainObject(parsed)) {
		return { patch: fallback(), ok: false, reason: 'Patch payload must be a JSON object.' };
	}
	if (own(parsed, 'version') === SYNTH_PATCH_VERSION) {
		return { patch: validateSynthPatch(parsed), ok: true };
	}
	if (own(parsed, 'v') === SYNTH_PATCH_VERSION) {
		return { patch: validateSynthPatch(expandCompactPatch(parsed)), ok: true };
	}
	return {
		patch: fallback(),
		ok: false,
		reason: `Unsupported patch version (expected ${SYNTH_PATCH_VERSION}).`
	};
}

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
	if (storage === null) return null;
	if (storage !== undefined) return storage;
	try {
		const candidate = (globalThis as { localStorage?: unknown }).localStorage;
		if (
			candidate &&
			typeof candidate === 'object' &&
			typeof (candidate as StorageLike).getItem === 'function' &&
			typeof (candidate as StorageLike).setItem === 'function'
		) {
			return candidate as StorageLike;
		}
		return null;
	} catch {
		return null;
	}
}

export function loadUserPatches(storage?: StorageLike | null): SynthPatch[] {
	const store = resolveStorage(storage);
	if (!store) return [];
	try {
		const raw = store.getItem(SYNTH_STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.slice(0, MAX_USER_PATCHES).map((item) => validateSynthPatch(item));
	} catch {
		return [];
	}
}

export function saveUserPatches(
	patches: readonly SynthPatch[],
	storage?: StorageLike | null
): boolean {
	const store = resolveStorage(storage);
	if (!store) return false;
	const sanitized = patches.slice(0, MAX_USER_PATCHES).map((patch) => validateSynthPatch(patch));
	try {
		store.setItem(SYNTH_STORAGE_KEY, JSON.stringify(sanitized));
		return true;
	} catch {
		return false;
	}
}
