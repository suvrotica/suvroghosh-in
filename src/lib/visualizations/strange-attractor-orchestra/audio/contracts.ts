/**
 * Structural boundary between the deterministic score and browser audio.
 *
 * The score package may re-export these names or pass its own structurally compatible values.
 * Keeping the audio package free of an import from a still-evolving score module also keeps its
 * pure safety, mapping and export tests independently runnable.
 */
export const SOUND_WORLD_IDS = ['glass', 'magnetic', 'swarm', 'radio'] as const;

export type SoundWorldId = (typeof SOUND_WORLD_IDS)[number];

/** Ephemeral audition treatment for the visual Raw / Weather / Braided comparison. */
export type AudioObservationView = 'raw' | 'noise' | 'braided';

/** Ephemeral opening-choreography state; never serialized into the mathematical snapshot. */
export type GuidedIntroAudioStage = 'shot-1' | 'shot-2' | 'shot-3' | 'shot-4' | 'shot-5' | 'free';

/** Ephemeral hearing-comfort treatment; the canonical score and master volume stay unchanged. */
export type AudioIntensityMode = 'standard' | 'lower';

export type NoiseColour = 'white' | 'pink' | 'brown' | 'violet';

export type SonicEventKind =
	| 'lobe-crossing'
	| 'sharp-fold'
	| 'section-crossing'
	| 'region-transition'
	| 'recurrence'
	| 'fold'
	| 'cell-boundary'
	| 'dense-knot'
	| 'noise-ridge'
	| 'pulse'
	| (string & {});

/** Score time is seconds. `pitch` is MIDI; canonical core events supply `pitchHz` instead. */
type SonicEventBase = Readonly<{
	id: string | number;
	time: number;
	simulationStep?: number;
	simulationTime?: number;
	duration?: number;
	intensity?: number;
	velocity01?: number;
	pitch?: number;
	frequencyHz?: number;
	pitchHz?: number;
	pan?: number;
	region?: string | number;
	sourceFeature?: string;
	explanation?: string;
	height?: number;
	curvature?: number;
	stretching?: number;
	recurrence?: number;
	density?: number;
	noise?: number;
	seed?: string | number;
	metadata?: Readonly<Record<string, unknown>>;
}>;

/** Accepts both the canonical core event (`type`) and lightweight audio-local events (`kind`). */
export type SonicEvent = SonicEventBase &
	Readonly<
		| { type: SonicEventKind; kind?: SonicEventKind }
		| { type?: SonicEventKind; kind: SonicEventKind }
	>;

export type SoundWorldPatch = Readonly<{
	id: SoundWorldId;
	label: string;
	description: string;
	noiseColour: NoiseColour;
	rootFrequencyHz: number;
	scaleSemitones: readonly number[];
	modalRatios: readonly number[];
	modalGains: readonly number[];
	resonanceQ: number;
	voiceGain: number;
	noiseGain: number;
	oscillatorGain: number;
	attackSeconds: number;
	holdSeconds: number;
	releaseSeconds: number;
	excitationSeconds: number;
	detuneCents: number;
	brightness: number;
	effectDelaySeconds: number;
	effectFeedback: number;
	effectWetGain: number;
	transitionSeconds: number;
}>;

export type AudioProgressStage = 'preparing' | 'rendering' | 'encoding' | 'complete';

export type AudioExportProgress = Readonly<{
	stage: AudioProgressStage;
	progress: number;
	message: string;
}>;

export type AudioEngineDebugSnapshot = Readonly<{
	contextConstructed: boolean;
	contextState: AudioContextState | 'unavailable';
	playing: boolean;
	muted: boolean;
	visibilityPaused: boolean;
	emergencySilenced: boolean;
	soundWorld: SoundWorldId;
	observationView: AudioObservationView;
	guidedIntroStage: GuidedIntroAudioStage;
	intensityMode: AudioIntensityMode;
	intensityToneGainDb: number;
	makeupGain: number;
	effect: Readonly<{ delaySeconds: number; feedback: number; wetGain: number }>;
	guidedTextureActive: boolean;
	guidedTextureTargetGain: number;
	masterVolume: number;
	voiceCap: number;
	playheadSeconds: number;
	activeVoices: number;
	peakVoices: number;
	polyphonyGainScale: number;
	scheduledVoices: number;
	scheduledEvents: number;
	queuedEvents: number;
	schedulerIntervalMs: number;
	schedulerLookaheadSeconds: number;
	conducting: Readonly<{
		horizontal: number;
		vertical: number;
		active: boolean;
	}>;
}>;
