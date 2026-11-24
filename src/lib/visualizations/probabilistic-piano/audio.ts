import { MIDI_MAX, MIDI_MIN } from './model';
import { generateProceduralIr, type ReverbRoom } from './procedural-ir';
import {
	FACTORY_PRESETS,
	validateSynthPatch,
	type DelaySyncDivision,
	type LfoWave,
	type ModMatrix5x5,
	type Osc2Wave,
	type SyncDivision,
	type SynthPatch
} from './synth-patch';
import { claimPlayback, releasePlayback } from '$lib/components/blog/tts/playback';

/** This is an original synthesised synthesizer & piano engine, with no downloaded sound assets. */
export const PIANO_PLAYABLE_VOICES = 20;
export const PIANO_MAX_NODE_VOICES = 24;
export const PIANO_MASTER_GAIN = 0.24;
export const UNISON_PLAYABLE_NOTES = 6;
export const SUPERSAW_POLY_FALLBACK_THRESHOLD = 8;

const DEFAULT_ATTACK_SECONDS = 0.006;
const DEFAULT_RELEASE_SECONDS = 0.15;
const STEAL_RELEASE_SECONDS = 0.018;
const MONO_RETRIGGER_RELEASE_SECONDS = 0.008;
const PARTIALS = [1, 2.003, 3.009, 4.02, 6.04] as const;
const PARTIAL_LEVELS = [1, 0.33, 0.14, 0.07, 0.028] as const;
const PIANO_PARTIAL_FLOOR = 0.00001;
const EXP_RELEASE_FLOOR = 0.0001;
const DEFAULT_PITCH_BEND_RANGE = 2;
const MOD_PITCH_CENTS = 200;
const MOD_CUTOFF_CENTS = 4800;
const MOD_RESONANCE_RANGE = 10;
const MOD_AMP_RANGE = 0.5;
const MOD_PWM_OFFSET = 0.45;

const SYNC_BEATS: Readonly<Record<SyncDivision, number>> = {
	'1/16': 0.25,
	'1/8': 0.5,
	'1/8t': 1 / 3,
	'1/4': 1,
	'1/4d': 1.5,
	'1/2': 2,
	'1/1': 4,
	'2/1': 8,
	'4/1': 16
};

const DELAY_BEATS: Readonly<Record<DelaySyncDivision, number>> = {
	'1/16': 0.25,
	'1/8': 0.5,
	'1/8t': 1 / 3,
	'1/8d': 0.75,
	'1/4': 1,
	'1/4d': 1.5,
	'1/2': 2
};

type ScheduledSourceEntry = {
	node: AudioScheduledSourceNode;
	ended: boolean;
	stopped: boolean;
	stopTimer?: ReturnType<typeof setTimeout>;
	isOscillator?: boolean;
};

type PartialEnvelopeSpec = {
	startedAt: number;
	attackEndAt: number;
	peak: number;
	midAt: number;
	midGain: number;
	endAt: number;
};

type VoiceOscillatorTarget = {
	osc: OscillatorNode;
	multiplier: number;
	gainNode: GainNode;
	unmutedGain: number | null;
	partialEnvelope?: PartialEnvelopeSpec;
	mutedByNyquist: boolean;
	gainFrom: number;
	gainTo: number;
	gainStart: number;
	gainEnd: number;
	glideFromHz: number;
	glideToHz: number;
	glideStart: number;
	glideEnd: number;
};

type VoicePwmTarget = {
	bias: ConstantSourceNode;
};

type VoiceFmTarget = {
	gain: GainNode;
	baseFreq: number;
	fmIndex: number;
	osc1Mult: number;
	modMult: number;
	mutedByNyquist: boolean;
	glideFromHz: number;
	glideToHz: number;
	glideStart: number;
	glideEnd: number;
	modGains: Array<{ gain: GainNode; scale: number }>;
};

type SynthVoice = {
	id: string;
	pitch: number;
	velocity: number;
	nodeCost: number;
	startedAt: number;
	held: boolean;
	released: boolean;
	releaseAt: number;
	releaseFrom: number;
	releaseDuration: number;
	is5Partial: boolean;
	sustainTransparent: boolean;
	attack: number;
	decay: number;
	peakGain: number;
	sustainGain: number;
	filterAttack: number;
	filterDecay: number;
	filterSustain: number;
	filterReleaseFrom: number;
	filterReleaseDuration: number;
	ampVca: GainNode;
	modAmpGain: GainNode | null;
	filter1: BiquadFilterNode;
	filter2: BiquadFilterNode | null;
	filterEnvSource: ConstantSourceNode | null;
	filterEnvGain: GainNode | null;
	sources: ScheduledSourceEntry[];
	oscTargets: VoiceOscillatorTarget[];
	pwmTargets: VoicePwmTarget[];
	fmTargets: VoiceFmTarget[];
	modGains: GainNode[];
	cleanupNodes: AudioNode[];
	detachLinks: Array<{ from: AudioNode; to: AudioNode | AudioParam }>;
	cleaned: boolean;
};

export type SynthAudioOptions = Readonly<{
	/** Dependency injection does not invoke the factory until the explicit enable action. */
	contextFactory?: () => AudioContext;
	/** Optional initial synthesizer patch (defaults to 01 Forgiving Grand). */
	patch?: SynthPatch;
	/** Stable object used with single-active-playback coordination. */
	playbackOwner?: object;
	/** Optional callback notified when an external audio source (e.g. TTS) stops the synth. */
	onExternalStop?: () => void;
	/** Pitch bend range in semitones (default 2). */
	pitchBendRange?: number;
}>;

export type PianoAudioOptions = SynthAudioOptions;

export type SynthOfflineGraphOptions = Readonly<{
	patch?: SynthPatch;
	volume?: number;
	masterGain?: number;
	pitchBendRange?: number;
}>;

export interface SynthOfflineGraph {
	readonly patch: SynthPatch;
	readonly activeCount: number;
	readonly currentTime: number;
	hasVoice(id: string): boolean;
	noteOn(pitch: number, velocity?: number, at?: number, patchOverride?: SynthPatch): string;
	noteOff(voiceId: string, at?: number): void;
	scheduleNote(
		pitch: number,
		velocity: number,
		at: number,
		duration: number,
		patchOverride?: SynthPatch
	): string;
	setPatch(patch: SynthPatch, at?: number): void;
	setSustain(value: boolean, at?: number): void;
	setPitchBend(norm: number, at?: number): void;
	setModWheel(norm: number, at?: number): void;
	setVolume(value: number, at?: number): void;
	dispose(): void;
}

function browserAudioContext(): AudioContext {
	if (typeof window === 'undefined')
		throw new Error('Enable sound in a browser to play the piano.');
	const Constructor =
		window.AudioContext ??
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Constructor) throw new Error('Web Audio is unavailable; silent playing still works.');
	return new Constructor({ latencyHint: 'interactive' });
}

function unit(value: number, fallback = 0): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function clamp(value: number, min: number, max: number, fallback = min): number {
	return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function midiToHz(pitch: number): number {
	return 440 * 2 ** ((pitch - 69) / 12);
}

function syncDivToHz(div: SyncDivision, bpm: number): number {
	const safeBpm = clamp(bpm, 40, 220, 110);
	const beats = SYNC_BEATS[div] ?? 1;
	return safeBpm / 60 / beats;
}

function delayDivToSeconds(div: DelaySyncDivision, bpm: number): number {
	const safeBpm = clamp(bpm, 40, 220, 110);
	const beats = DELAY_BEATS[div] ?? 0.5;
	return (60 / safeBpm) * beats;
}

function createMulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	};
}

let cachedHardClipCurve: Float32Array<ArrayBuffer> | null = null;
function getHardClipCurve(): Float32Array<ArrayBuffer> {
	if (cachedHardClipCurve) return cachedHardClipCurve;
	const length = 257;
	const curve = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		const x = (2 * i) / (length - 1) - 1;
		curve[i] = Math.max(-1, Math.min(1, x));
	}
	cachedHardClipCurve = curve;
	return curve;
}

let cachedPwmCurve: Float32Array<ArrayBuffer> | null = null;
function getPwmComparatorCurve(): Float32Array<ArrayBuffer> {
	if (cachedPwmCurve) return cachedPwmCurve;
	const length = 257;
	const curve = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		const x = (2 * i) / (length - 1) - 1;
		curve[i] = Math.tanh(40 * x);
	}
	cachedPwmCurve = curve;
	return curve;
}

function buildDriveCurve(drive: number): Float32Array<ArrayBuffer> {
	const length = 257;
	const curve = new Float32Array(length);
	const k = 1 + clamp(drive, 0, 1, 0) * 10;
	const norm = Math.tanh(k) || 1;
	for (let i = 0; i < length; i++) {
		const x = (2 * i) / (length - 1) - 1;
		curve[i] = Math.tanh(k * x) / norm;
	}
	return curve;
}

function buildCrushDriveCurve(drive: number, bitDepth: number): Float32Array<ArrayBuffer> {
	const length = 2049;
	const curve = new Float32Array(length);
	const k = 1 + clamp(drive, 0, 1, 0) * 8;
	const norm = Math.tanh(k) || 1;
	const bits = Math.round(clamp(bitDepth, 3, 16, 16));
	const levels = Math.pow(2, bits - 1);
	for (let i = 0; i < length; i++) {
		const x = (2 * i) / (length - 1) - 1;
		const driven = Math.tanh(k * x) / norm;
		const quantized = Math.round(driven * levels) / levels;
		curve[i] = Math.max(-1, Math.min(1, quantized));
	}
	return curve;
}

function mapOscType(wave: 'saw' | 'tri' | 'sine' | 'square'): OscillatorType {
	if (wave === 'saw') return 'sawtooth';
	if (wave === 'tri') return 'triangle';
	return wave;
}

function mapLfoType(wave: Exclude<LfoWave, 'sh'>): OscillatorType {
	if (wave === 'tri') return 'triangle';
	if (wave === 'saw') return 'sawtooth';
	return wave;
}

/**
 * Shared live + offline synthesizer graph engine.
 * Never touches window/document globals directly so Node tests and OfflineAudioContext stay safe.
 */
class SynthGraphCore {
	private readonly context: BaseAudioContext;
	private readonly offline: boolean;
	private readonly masterGainScale: number;
	private readonly pitchBendRange: number;
	private currentPatch: SynthPatch;

	// Master graph nodes (master created FIRST for predictable gains[0] slot)
	private master: GainNode;
	private voiceSumBus: GainNode;
	private chorusDryGain: GainNode;
	private chorusWetGain: GainNode;
	private chorusDelayL: DelayNode;
	private chorusDelayR: DelayNode;
	private chorusOut: GainNode;
	private crushDryGain: GainNode;
	private crushWetGain: GainNode;
	private crushShaper: WaveShaperNode;
	private crushTone: BiquadFilterNode;
	private crushOut: GainNode;
	private delayDryGain: GainNode;
	private delayWetGain: GainNode;
	private delayNodeL: DelayNode;
	private delayNodeR: DelayNode;
	private delayToneL: BiquadFilterNode;
	private delayToneR: BiquadFilterNode;
	private delayFbLtoR: GainNode;
	private delayFbRtoL: GainNode;
	private delayOut: GainNode;
	private reverbDryGain: GainNode;
	private reverbWetGain: GainNode;
	private convolver: ConvolverNode;
	private reverbOut: GainNode;
	private compressor: DynamicsCompressorNode;
	private hardClipper: WaveShaperNode;
	private analyser: AnalyserNode;
	private fxCleanupNodes: AudioNode[] = [];

	// Global modulation buses (lazy oscillator sources)
	private lfoBus: [GainNode, GainNode];
	private lfoSource: [AudioScheduledSourceNode | null, AudioScheduledSourceNode | null] = [
		null,
		null
	];
	private lfoWave: [LfoWave | null, LfoWave | null] = [null, null];
	private lfoStartTime: [number, number] = [0, 0];
	private chorusLfo: OscillatorNode | null = null;
	private chorusLfoGainL: GainNode | null = null;
	private chorusLfoGainR: GainNode | null = null;
	private chorusLfoStartTime = 0;
	private offlineRetiredModNodes: AudioNode[] = [];
	private offlineRetiredVoices: SynthVoice[] = [];
	private pitchBendSource: ConstantSourceNode;
	private modWheelSource: ConstantSourceNode;

	// Caches
	private readonly irCache = new Map<string, AudioBuffer>();
	private readonly noiseBufferCache = new Map<string, AudioBuffer>();
	private readonly shBufferCache = new Map<number, AudioBuffer>();
	private readonly periodicWaveCache = new Map<number, PeriodicWave>();

	// Voice & performance state
	private readonly voices = new Map<string, SynthVoice>();
	private serial = 0;
	private volume = 0.65;
	private muted = false;
	private enabled = false;
	private sustain = false;
	private pitchBendNorm = 0;
	private modWheelNorm = 0;
	private lastPitch: number | null = null;
	private disposed = false;

	constructor(
		context: BaseAudioContext,
		options: {
			offline: boolean;
			patch?: SynthPatch;
			volume?: number;
			masterGainScale?: number;
			pitchBendRange?: number;
			enabled?: boolean;
		}
	) {
		this.context = context;
		this.offline = options.offline;
		this.currentPatch = validateSynthPatch(options.patch ?? FACTORY_PRESETS[0]);
		this.volume = unit(options.volume ?? 0.65, 0.65);
		this.masterGainScale = options.masterGainScale ?? PIANO_MASTER_GAIN;
		this.pitchBendRange = clamp(options.pitchBendRange ?? DEFAULT_PITCH_BEND_RANGE, 1, 24, 2);
		this.enabled = options.enabled ?? options.offline;

		// Create master FIRST so gains[0] is always master
		this.master = context.createGain();
		this.master.gain.value = this.offline ? this.volume * this.masterGainScale : 0;

		this.voiceSumBus = context.createGain();
		this.voiceSumBus.gain.value = 1;

		// Chorus stage
		this.chorusDryGain = context.createGain();
		this.chorusWetGain = context.createGain();
		this.chorusDelayL = context.createDelay(0.1);
		this.chorusDelayL.delayTime.value = 0.015;
		this.chorusDelayR = context.createDelay(0.1);
		this.chorusDelayR.delayTime.value = 0.022;
		const chorusPanL = context.createStereoPanner();
		chorusPanL.pan.value = -0.75;
		const chorusPanR = context.createStereoPanner();
		chorusPanR.pan.value = 0.75;
		this.chorusOut = context.createGain();

		this.voiceSumBus.connect(this.chorusDryGain);
		this.chorusDryGain.connect(this.chorusOut);
		this.voiceSumBus.connect(this.chorusDelayL);
		this.voiceSumBus.connect(this.chorusDelayR);
		this.chorusDelayL.connect(chorusPanL);
		this.chorusDelayR.connect(chorusPanR);
		chorusPanL.connect(this.chorusWetGain);
		chorusPanR.connect(this.chorusWetGain);
		this.chorusWetGain.connect(this.chorusOut);

		// Bit-depth crush & drive stage
		this.crushDryGain = context.createGain();
		this.crushWetGain = context.createGain();
		this.crushShaper = context.createWaveShaper();
		this.crushShaper.oversample = 'none';
		this.crushTone = context.createBiquadFilter();
		this.crushTone.type = 'lowpass';
		this.crushTone.Q.value = 0.7;
		this.crushOut = context.createGain();

		this.chorusOut.connect(this.crushDryGain);
		this.crushDryGain.connect(this.crushOut);
		this.chorusOut.connect(this.crushShaper);
		this.crushShaper.connect(this.crushTone);
		this.crushTone.connect(this.crushWetGain);
		this.crushWetGain.connect(this.crushOut);

		// Stereo cross-coupled multi-delay stage
		this.delayDryGain = context.createGain();
		this.delayWetGain = context.createGain();
		this.delayNodeL = context.createDelay(2.0);
		this.delayNodeR = context.createDelay(2.0);
		this.delayToneL = context.createBiquadFilter();
		this.delayToneL.type = 'lowpass';
		this.delayToneL.Q.value = 0.7;
		this.delayToneR = context.createBiquadFilter();
		this.delayToneR.type = 'lowpass';
		this.delayToneR.Q.value = 0.7;
		this.delayFbLtoR = context.createGain();
		this.delayFbRtoL = context.createGain();
		const delayPanL = context.createStereoPanner();
		delayPanL.pan.value = -0.65;
		const delayPanR = context.createStereoPanner();
		delayPanR.pan.value = 0.65;
		this.delayOut = context.createGain();

		this.crushOut.connect(this.delayDryGain);
		this.delayDryGain.connect(this.delayOut);
		this.crushOut.connect(this.delayNodeL);
		this.crushOut.connect(this.delayNodeR);
		this.delayNodeL.connect(this.delayToneL);
		this.delayNodeR.connect(this.delayToneR);
		this.delayToneL.connect(this.delayFbLtoR);
		this.delayFbLtoR.connect(this.delayNodeR);
		this.delayToneR.connect(this.delayFbRtoL);
		this.delayFbRtoL.connect(this.delayNodeL);
		this.delayToneL.connect(delayPanL);
		this.delayToneR.connect(delayPanR);
		delayPanL.connect(this.delayWetGain);
		delayPanR.connect(this.delayWetGain);
		this.delayWetGain.connect(this.delayOut);

		// Procedural convolver reverb stage
		this.reverbDryGain = context.createGain();
		this.reverbWetGain = context.createGain();
		this.convolver = context.createConvolver();
		this.reverbOut = context.createGain();

		this.delayOut.connect(this.reverbDryGain);
		this.reverbDryGain.connect(this.reverbOut);
		this.delayOut.connect(this.convolver);
		this.convolver.connect(this.reverbWetGain);
		this.reverbWetGain.connect(this.reverbOut);

		// Safety limiter + 0 dBFS hard clipper + master + analyser + destination
		this.compressor = context.createDynamicsCompressor();
		this.compressor.threshold.value = -3;
		this.compressor.knee.value = 6;
		this.compressor.ratio.value = 12;
		this.compressor.attack.value = 0.003;
		this.compressor.release.value = 0.12;

		this.hardClipper = context.createWaveShaper();
		this.hardClipper.oversample = 'none';
		this.hardClipper.curve = getHardClipCurve();

		this.analyser = context.createAnalyser();
		this.analyser.fftSize = 2048;
		this.analyser.smoothingTimeConstant = 0.8;

		this.reverbOut.connect(this.compressor);
		this.compressor.connect(this.hardClipper);
		this.hardClipper.connect(this.master);
		this.master.connect(this.analyser);
		this.analyser.connect(context.destination);

		// Global modulation buses & control sources
		this.lfoBus = [context.createGain(), context.createGain()];
		this.pitchBendSource = context.createConstantSource();
		this.pitchBendSource.offset.value = 0;
		this.pitchBendSource.start(0);
		this.modWheelSource = context.createConstantSource();
		this.modWheelSource.offset.value = 0;
		this.modWheelSource.start(0);

		this.fxCleanupNodes = [
			this.master,
			this.voiceSumBus,
			this.chorusDryGain,
			this.chorusWetGain,
			this.chorusDelayL,
			this.chorusDelayR,
			chorusPanL,
			chorusPanR,
			this.chorusOut,
			this.crushDryGain,
			this.crushWetGain,
			this.crushShaper,
			this.crushTone,
			this.crushOut,
			this.delayDryGain,
			this.delayWetGain,
			this.delayNodeL,
			this.delayNodeR,
			this.delayToneL,
			this.delayToneR,
			this.delayFbLtoR,
			this.delayFbRtoL,
			delayPanL,
			delayPanR,
			this.delayOut,
			this.reverbDryGain,
			this.reverbWetGain,
			this.convolver,
			this.reverbOut,
			this.compressor,
			this.hardClipper,
			this.analyser,
			this.lfoBus[0],
			this.lfoBus[1],
			this.pitchBendSource,
			this.modWheelSource
		];

		this.applyFx(this.currentPatch, 0);
		this.applyLfoBusGains(this.currentPatch, 0);
	}

	get patch(): SynthPatch {
		return this.currentPatch;
	}

	get activeCount(): number {
		return this.voices.size;
	}

	get currentTime(): number {
		return this.context.currentTime;
	}

	hasVoice(id: string): boolean {
		const voice = this.voices.get(id);
		return Boolean(voice && !voice.released && this.currentTime < voice.releaseAt);
	}

	setEnabled(value: boolean): void {
		this.enabled = value;
		this.updateMaster(this.currentTime);
	}

	setVolume(value: number, at?: number): void {
		this.volume = unit(value);
		this.updateMaster(at ?? this.currentTime);
	}

	setMuted(value: boolean, at?: number): void {
		this.muted = Boolean(value);
		this.updateMaster(at ?? this.currentTime);
	}

	setSustain(value: boolean, at?: number): void {
		this.sustain = Boolean(value);
		if (!this.sustain) {
			const when = this.offline ? Math.max(0, at ?? this.currentTime) : this.currentTime;
			const ampRelease = this.effectiveReleaseSeconds(this.currentPatch);
			const filterRelease = this.effectiveFilterReleaseSeconds(this.currentPatch);
			for (const voice of this.voices.values()) {
				if (!voice.held && !voice.released) {
					this.releaseVoice(voice, ampRelease, when, false, filterRelease);
				}
			}
		}
	}

	setPitchBend(norm: number, at?: number): void {
		this.pitchBendNorm = clamp(norm, -1, 1, 0);
		const cents = this.pitchBendNorm * this.pitchBendRange * 100;
		const when = this.offline ? Math.max(0, at ?? this.currentTime) : this.currentTime;
		this.pitchBendSource.offset.setValueAtTime(cents, when);
	}

	setModWheel(norm: number, at?: number): void {
		this.modWheelNorm = unit(norm, 0);
		const when = this.offline ? Math.max(0, at ?? this.currentTime) : this.currentTime;
		this.modWheelSource.offset.setValueAtTime(this.modWheelNorm, when);
	}

	setPatch(patch: SynthPatch, at?: number): void {
		const validated = validateSynthPatch(patch);
		this.currentPatch = validated;
		const when = this.offline ? Math.max(0, at ?? this.currentTime) : this.currentTime;
		this.applyFx(validated, when);
		this.applyLfoBusGains(validated, when);
		if (this.offline || this.voices.size > 0) {
			this.ensureGlobalModulators(when, false);
		} else {
			this.stopGlobalModulators(when, false);
		}
	}

	getAnalyserData(
		timeDomain?: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>,
		freq?: Uint8Array<ArrayBuffer>
	): boolean {
		if (this.disposed) return false;
		if (timeDomain) {
			if (timeDomain instanceof Float32Array) {
				this.analyser.getFloatTimeDomainData(timeDomain);
			} else {
				this.analyser.getByteTimeDomainData(timeDomain);
			}
		}
		if (freq) {
			this.analyser.getByteFrequencyData(freq);
		}
		return true;
	}

	noteOn(pitch: number, velocity = 0.75, at?: number, patchOverride?: SynthPatch): string {
		const when = this.offline ? Math.max(0, at ?? this.currentTime) : this.currentTime;
		return this.createVoice(pitch, velocity, when, undefined, patchOverride);
	}

	scheduleNote(
		pitch: number,
		velocity: number,
		at: number,
		duration: number,
		patchOverride?: SynthPatch
	): string {
		if (!Number.isFinite(at) || !Number.isFinite(duration)) return '';
		const start = this.offline
			? Math.max(0, at)
			: Math.max(this.currentTime, Math.min(this.currentTime + 0.25, at));
		const boundedDuration = this.offline
			? Math.max(0.03, Math.min(30, duration))
			: Math.max(0.03, Math.min(4, duration));
		return this.createVoice(pitch, velocity, start, boundedDuration, patchOverride);
	}

	noteOff(id: string, at?: number): void {
		const voice = this.voices.get(id);
		if (!voice || voice.released) return;
		voice.held = false;
		if (!this.sustain) {
			const when = this.offline
				? Math.max(voice.startedAt, at ?? this.currentTime)
				: this.currentTime;
			this.releaseVoice(
				voice,
				this.effectiveReleaseSeconds(this.currentPatch),
				when,
				false,
				this.effectiveFilterReleaseSeconds(this.currentPatch)
			);
		}
	}

	stopAll(): void {
		this.sustain = false;
		this.lastPitch = null;
		for (const voice of [...this.voices.values()]) {
			this.releaseVoice(voice, STEAL_RELEASE_SECONDS, undefined, true);
		}
		this.stopGlobalModulators(this.currentTime, false);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.enabled = false;
		this.sustain = false;
		this.lastPitch = null;
		for (const voice of [...this.voices.values()]) {
			this.cleanupVoice(voice);
		}
		for (const voice of this.offlineRetiredVoices) {
			this.cleanupVoice(voice);
		}
		this.offlineRetiredVoices = [];
		this.stopGlobalModulators(this.currentTime, true);
		for (const node of this.offlineRetiredModNodes) {
			node.disconnect();
		}
		this.offlineRetiredModNodes = [];
		try {
			this.pitchBendSource.stop();
		} catch {
			// Ignore if already stopped.
		}
		try {
			this.modWheelSource.stop();
		} catch {
			// Ignore if already stopped.
		}
		for (const node of this.fxCleanupNodes) {
			node.disconnect();
		}
		this.fxCleanupNodes = [];
		this.irCache.clear();
		this.noiseBufferCache.clear();
		this.shBufferCache.clear();
		this.periodicWaveCache.clear();
	}

	private updateMaster(when: number): void {
		if (this.disposed) return;
		const gain = this.enabled && !this.muted ? this.volume * this.masterGainScale : 0;
		if (this.offline) {
			this.master.gain.setValueAtTime(gain, when);
		} else {
			this.master.gain.setTargetAtTime(gain, when, 0.012);
		}
	}

	private effectiveReleaseSeconds(patch: SynthPatch): number {
		if (patch.osc1.wave === '5-partial' && patch.ampEnv.release === DEFAULT_RELEASE_SECONDS) {
			return DEFAULT_RELEASE_SECONDS;
		}
		return clamp(patch.ampEnv.release, 0.015, 6, DEFAULT_RELEASE_SECONDS);
	}

	private effectiveFilterReleaseSeconds(patch: SynthPatch): number {
		return clamp(patch.filterEnv.release, 0.015, 6, DEFAULT_RELEASE_SECONDS);
	}

	private applyFx(patch: SynthPatch, when: number): void {
		const nyquist = Math.min(16000, this.context.sampleRate * 0.46);
		const { chorus, crush, delay, reverb } = patch.fx;

		// Chorus dry/wet
		const chorusActive = !chorus.bypass && chorus.mix > 0 && chorus.depth > 0;
		const chorusWet = chorusActive ? unit(chorus.mix) : 0;
		this.chorusDryGain.gain.setValueAtTime(1 - chorusWet * 0.5, when);
		this.chorusWetGain.gain.setValueAtTime(chorusWet, when);

		// Bit-depth crush & drive
		const crushActive = !crush.bypass && crush.mix > 0;
		const crushWet = crushActive ? unit(crush.mix) : 0;
		this.crushDryGain.gain.setValueAtTime(1 - crushWet, when);
		this.crushWetGain.gain.setValueAtTime(crushWet, when);
		this.crushTone.frequency.setValueAtTime(clamp(crush.toneHz, 400, nyquist, 12000), when);
		if (crushActive) {
			this.crushShaper.curve = buildCrushDriveCurve(crush.drive, crush.bitDepth);
		} else {
			this.crushShaper.curve = getHardClipCurve();
		}

		// Stereo multi-delay
		const delayActive = !delay.bypass && delay.mix > 0;
		const delayWet = delayActive ? unit(delay.mix) : 0;
		const delaySeconds = delay.bpmSync
			? delayDivToSeconds(delay.syncDiv, patch.arpSeq.bpm)
			: delay.timeMs / 1000;
		const timeL = clamp(delaySeconds, 0.02, 2.0, 0.32);
		const timeR = clamp(delaySeconds * 0.75, 0.015, 2.0, 0.24);
		const fb = delayActive ? clamp(delay.feedback, 0, 0.88, 0.25) : 0;
		this.delayDryGain.gain.setValueAtTime(1, when);
		this.delayWetGain.gain.setValueAtTime(delayWet, when);
		this.delayNodeL.delayTime.setValueAtTime(timeL, when);
		this.delayNodeR.delayTime.setValueAtTime(timeR, when);
		this.delayToneL.frequency.setValueAtTime(clamp(delay.toneHz, 400, nyquist, 6500), when);
		this.delayToneR.frequency.setValueAtTime(clamp(delay.toneHz, 400, nyquist, 6500), when);
		this.delayFbLtoR.gain.setValueAtTime(fb, when);
		this.delayFbRtoL.gain.setValueAtTime(fb, when);

		// Procedural convolver reverb
		const reverbActive = reverb.room !== 'off' && reverb.mix > 0;
		const reverbWet = reverbActive ? unit(reverb.mix) : 0;
		this.reverbDryGain.gain.setValueAtTime(1 - reverbWet * 0.5, when);
		this.reverbWetGain.gain.setValueAtTime(reverbWet, when);
		if (reverbActive) {
			this.convolver.buffer = this.getOrCreateIrBuffer(reverb.room);
		} else {
			this.convolver.buffer = null;
		}
	}

	private applyLfoBusGains(patch: SynthPatch, when: number): void {
		this.lfoBus[0].gain.setValueAtTime(unit(patch.lfo1.depth), when);
		this.lfoBus[1].gain.setValueAtTime(unit(patch.lfo2.depth), when);
	}

	private getOrCreateIrBuffer(room: ReverbRoom): AudioBuffer {
		const sr = Math.round(this.context.sampleRate);
		const key = `${room}:${sr}`;
		const cached = this.irCache.get(key);
		if (cached) return cached;
		const ir = generateProceduralIr(room, sr);
		const buffer = this.context.createBuffer(2, ir.left.length, ir.sampleRate);
		buffer.getChannelData(0).set(ir.left);
		buffer.getChannelData(1).set(ir.right);
		this.irCache.set(key, buffer);
		return buffer;
	}

	private getOrCreateNoiseBuffer(type: 'white' | 'pink'): AudioBuffer {
		const sr = Math.round(this.context.sampleRate);
		const key = `${type}:${sr}`;
		const cached = this.noiseBufferCache.get(key);
		if (cached) return cached;
		const length = Math.max(1024, sr * 2);
		const buffer = this.context.createBuffer(1, length, sr);
		const data = buffer.getChannelData(0);
		const rand = createMulberry32(type === 'white' ? 0x517cc1b7 : 0x7369a2f1);
		if (type === 'white') {
			for (let i = 0; i < length; i++) {
				data[i] = (rand() * 2 - 1) * 0.45;
			}
		} else {
			let b0 = 0;
			let b1 = 0;
			let b2 = 0;
			let b3 = 0;
			let b4 = 0;
			let b5 = 0;
			let b6 = 0;
			for (let i = 0; i < length; i++) {
				const white = rand() * 2 - 1;
				b0 = 0.99886 * b0 + white * 0.0555179;
				b1 = 0.99332 * b1 + white * 0.0750759;
				b2 = 0.969 * b2 + white * 0.153852;
				b3 = 0.8665 * b3 + white * 0.3104856;
				b4 = 0.55 * b4 + white * 0.5329522;
				b5 = -0.7616 * b5 - white * 0.016898;
				const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
				b6 = white * 0.115926;
				data[i] = Math.max(-0.5, Math.min(0.5, pink * 0.08));
			}
		}
		this.noiseBufferCache.set(key, buffer);
		return buffer;
	}

	private getOrCreateShBuffer(): AudioBuffer {
		const sr = Math.round(this.context.sampleRate);
		const cached = this.shBufferCache.get(sr);
		if (cached) return cached;
		const length = Math.max(64, sr);
		const buffer = this.context.createBuffer(1, length, sr);
		const data = buffer.getChannelData(0);
		const steps = 16;
		const stepLen = Math.max(1, Math.floor(length / steps));
		const rand = createMulberry32(0x9e3779b9);
		let value = rand() * 2 - 1;
		for (let i = 0; i < length; i++) {
			if (i % stepLen === 0) value = rand() * 2 - 1;
			data[i] = value;
		}
		this.shBufferCache.set(sr, buffer);
		return buffer;
	}

	private getOrCreateHarmonicWave(shape: number): PeriodicWave {
		const bucket = Math.round(unit(shape) * 20);
		const cached = this.periodicWaveCache.get(bucket);
		if (cached) return cached;
		const tilt = bucket / 20;
		const count = 17;
		const real = new Float32Array(count);
		const imag = new Float32Array(count);
		const exponent = 2.2 - tilt * 1.4;
		for (let k = 1; k < count; k++) {
			imag[k] = 1 / Math.pow(k, exponent);
		}
		const wave = this.context.createPeriodicWave(real, imag);
		this.periodicWaveCache.set(bucket, wave);
		return wave;
	}

	private ensureGlobalModulators(when: number, isNoteOn: boolean): void {
		if (this.disposed) return;
		const patch = this.currentPatch;
		const lfos = [patch.lfo1, patch.lfo2] as const;

		for (let idx = 0; idx < 2; idx++) {
			const cfg = lfos[idx];
			const rowHasDepth = patch.modMatrix[idx].some((v) => v !== 0);
			const needed = cfg.depth > 0 && rowHasDepth;
			if (!needed) {
				this.stopLfo(idx, when, false);
				continue;
			}
			const rateHz = cfg.bpmSync
				? syncDivToHz(cfg.syncDiv, patch.arpSeq.bpm)
				: clamp(cfg.rateHz, 0.05, 25, 1);

			const existing = this.lfoSource[idx];
			const waveChanged = existing !== null && this.lfoWave[idx] !== cfg.wave;
			const keyRestart = isNoteOn && cfg.keySync && !this.offline;
			if (existing && (waveChanged || keyRestart)) {
				this.stopLfo(idx, when, false);
			} else if (existing) {
				// Update existing LFO rate if OscillatorNode or AudioBufferSourceNode
				if ('frequency' in existing) {
					(existing as OscillatorNode).frequency.setValueAtTime(rateHz, when);
				} else if ('playbackRate' in existing) {
					(existing as AudioBufferSourceNode).playbackRate.setValueAtTime(
						clamp(rateHz / 16, 0.01, 50, 1),
						when
					);
				}
				continue;
			}

			if (cfg.wave === 'sh') {
				const bufSrc = this.context.createBufferSource();
				bufSrc.buffer = this.getOrCreateShBuffer();
				bufSrc.loop = true;
				bufSrc.playbackRate.setValueAtTime(clamp(rateHz / 16, 0.01, 50, 1), when);
				bufSrc.connect(this.lfoBus[idx]);
				bufSrc.start(when);
				this.lfoSource[idx] = bufSrc;
				this.lfoWave[idx] = 'sh';
				this.lfoStartTime[idx] = when;
			} else {
				const osc = this.context.createOscillator();
				osc.type = mapLfoType(cfg.wave);
				osc.frequency.setValueAtTime(rateHz, when);
				osc.connect(this.lfoBus[idx]);
				osc.start(when);
				this.lfoSource[idx] = osc;
				this.lfoWave[idx] = cfg.wave;
				this.lfoStartTime[idx] = when;
			}
		}

		// Lazy Chorus LFO
		const { chorus } = patch.fx;
		const chorusNeeded = !chorus.bypass && chorus.mix > 0 && chorus.depth > 0;
		if (!chorusNeeded) {
			this.stopChorusLfo(when, false);
		} else {
			const rateHz = clamp(chorus.rateHz, 0.1, 5, 0.8);
			const modDepthSec = unit(chorus.depth) * 0.004;
			if (!this.chorusLfo) {
				const lfo = this.context.createOscillator();
				lfo.type = 'sine';
				lfo.frequency.setValueAtTime(rateHz, when);
				const gL = this.context.createGain();
				gL.gain.setValueAtTime(modDepthSec, when);
				const gR = this.context.createGain();
				gR.gain.setValueAtTime(-modDepthSec, when);
				lfo.connect(gL);
				lfo.connect(gR);
				gL.connect(this.chorusDelayL.delayTime);
				gR.connect(this.chorusDelayR.delayTime);
				lfo.start(when);
				this.chorusLfo = lfo;
				this.chorusLfoGainL = gL;
				this.chorusLfoGainR = gR;
				this.chorusLfoStartTime = when;
			} else {
				this.chorusLfo.frequency.setValueAtTime(rateHz, when);
				this.chorusLfoGainL?.gain.setValueAtTime(modDepthSec, when);
				this.chorusLfoGainR?.gain.setValueAtTime(-modDepthSec, when);
			}
		}
	}

	private stopLfo(index: number, when = this.currentTime, forceDispose = false): void {
		const src = this.lfoSource[index];
		if (!src) return;
		this.lfoSource[index] = null;
		this.lfoWave[index] = null;
		src.onended = null;
		if (this.offline && !forceDispose) {
			const stopAt = Math.max(when, this.lfoStartTime[index]);
			try {
				src.stop(stopAt);
			} catch {
				// Ignore if already stopped.
			}
			this.offlineRetiredModNodes.push(src);
			return;
		}
		try {
			src.stop();
		} catch {
			// Ignore if already stopped.
		}
		src.disconnect();
	}

	private stopChorusLfo(when = this.currentTime, forceDispose = false): void {
		if (this.offline && !forceDispose) {
			if (this.chorusLfo) {
				const lfo = this.chorusLfo;
				this.chorusLfo = null;
				lfo.onended = null;
				const stopAt = Math.max(when, this.chorusLfoStartTime);
				try {
					lfo.stop(stopAt);
				} catch {
					// Ignore if already stopped.
				}
				this.offlineRetiredModNodes.push(lfo);
			}
			if (this.chorusLfoGainL) {
				this.offlineRetiredModNodes.push(this.chorusLfoGainL);
				this.chorusLfoGainL = null;
			}
			if (this.chorusLfoGainR) {
				this.offlineRetiredModNodes.push(this.chorusLfoGainR);
				this.chorusLfoGainR = null;
			}
			return;
		}
		if (this.chorusLfo) {
			const lfo = this.chorusLfo;
			this.chorusLfo = null;
			lfo.onended = null;
			try {
				lfo.stop();
			} catch {
				// Ignore if already stopped.
			}
			lfo.disconnect();
		}
		this.chorusLfoGainL?.disconnect();
		this.chorusLfoGainL = null;
		this.chorusLfoGainR?.disconnect();
		this.chorusLfoGainR = null;
	}

	private stopGlobalModulators(when = this.currentTime, forceDispose = false): void {
		this.stopLfo(0, when, forceDispose);
		this.stopLfo(1, when, forceDispose);
		this.stopChorusLfo(when, forceDispose);
	}

	private willProduceAudioSource(pitch: number, patch: SynthPatch): boolean {
		if (patch.mix.noise > 0) return true;
		const nyquistLimit = this.context.sampleRate * 0.46;
		const baseHz = midiToHz(pitch);
		if (patch.mix.osc1 > 0 || (patch.osc2.ringMod && patch.mix.osc2 > 0)) {
			const osc1Mult = 2 ** (patch.osc1.oct + patch.osc1.semi / 12 + patch.osc1.fine / 1200);
			if (baseHz * osc1Mult < nyquistLimit) return true;
		}
		if (patch.mix.osc2 > 0) {
			const osc2Mult = 2 ** (patch.osc2.oct + patch.osc2.semi / 12 + patch.osc2.fine / 1200);
			if (baseHz * osc2Mult < nyquistLimit) return true;
		}
		if (patch.mix.sub > 0) {
			const subMult = patch.sub.oct === -2 ? 0.25 : 0.5;
			if (baseHz * subMult < nyquistLimit) return true;
		}
		return false;
	}

	private createVoice(
		pitch: number,
		velocity: number,
		at: number,
		duration?: number,
		patchOverride?: SynthPatch
	): string {
		if (this.disposed || !this.enabled) return '';
		if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) return '';
		const strength = unit(velocity);
		if (strength === 0) return '';

		const patch = patchOverride ? validateSynthPatch(patchOverride) : this.currentPatch;
		const voiceMode = patch.voiceMode;
		const unisonCount = voiceMode === 'unison' ? patch.unisonVoices : 1;
		const playableLimit = voiceMode === 'unison' ? UNISON_PLAYABLE_NOTES : PIANO_PLAYABLE_VOICES;
		const now = at;

		// Legato: glide existing active manual voice without hijacking timed scheduleNote voices
		if (voiceMode === 'legato' && duration === undefined) {
			const activeList = [...this.voices.values()].filter(
				(v) => !v.released && !Number.isFinite(v.releaseAt) && !v.cleaned
			);
			const legatoTarget = activeList.at(-1);
			if (legatoTarget) {
				const newBaseHz = midiToHz(pitch);
				const glideSec = Math.max(0.005, clamp(patch.glideMs, 0, 600, 0) / 1000);
				const muteRampSec = Math.min(glideSec, 0.015);
				const nyquistLimit = this.context.sampleRate * 0.46;
				const nyquistMutedGains = new Set<GainNode>();
				const scheduledMuteGains = new Set<GainNode>();
				const nyquistUnmutedGains = new Set<GainNode>();
				const evalPartialEnvelope = (env: PartialEnvelopeSpec, t: number): number => {
					if (t <= env.startedAt) return 0;
					if (t < env.attackEndAt) {
						return (
							env.peak * ((t - env.startedAt) / Math.max(0.001, env.attackEndAt - env.startedAt))
						);
					}
					if (env.midAt < env.endAt && t < env.midAt) {
						const frac = (t - env.attackEndAt) / Math.max(0.001, env.midAt - env.attackEndAt);
						return env.peak * Math.pow(env.midGain / Math.max(PIANO_PARTIAL_FLOOR, env.peak), frac);
					}
					if (t < env.endAt) {
						const startT = env.midAt < env.endAt ? env.midAt : env.attackEndAt;
						const startG = env.midAt < env.endAt ? env.midGain : env.peak;
						const frac = (t - startT) / Math.max(0.001, env.endAt - startT);
						return Math.max(
							PIANO_PARTIAL_FLOOR,
							startG * Math.pow(PIANO_PARTIAL_FLOOR / Math.max(PIANO_PARTIAL_FLOOR, startG), frac)
						);
					}
					return PIANO_PARTIAL_FLOOR;
				};
				const estimateTargetGain = (target: VoiceOscillatorTarget): number => {
					if (target.partialEnvelope) {
						if (!target.mutedByNyquist && now >= target.gainEnd) {
							return evalPartialEnvelope(target.partialEnvelope, now);
						}
						if (now >= target.gainEnd || target.gainEnd <= target.gainStart) return target.gainTo;
						if (now <= target.gainStart) return target.gainFrom;
						const frac = (now - target.gainStart) / (target.gainEnd - target.gainStart);
						return target.gainFrom + (target.gainTo - target.gainFrom) * frac;
					}
					if (target.unmutedGain === null) return target.gainNode.gain.value;
					if (now >= target.gainEnd || target.gainEnd <= target.gainStart) return target.gainTo;
					if (now <= target.gainStart) return target.gainFrom;
					const frac = (now - target.gainStart) / (target.gainEnd - target.gainStart);
					return target.gainFrom + (target.gainTo - target.gainFrom) * frac;
				};
				for (const target of legatoTarget.oscTargets) {
					let currentFreq: number;
					if (
						now >= target.glideEnd ||
						target.glideEnd <= target.glideStart ||
						target.glideFromHz <= 0 ||
						target.glideToHz <= 0
					) {
						currentFreq = target.glideToHz;
					} else if (now <= target.glideStart) {
						currentFreq = target.glideFromHz;
					} else {
						const frac = (now - target.glideStart) / (target.glideEnd - target.glideStart);
						currentFreq =
							target.glideFromHz * Math.pow(target.glideToHz / target.glideFromHz, frac);
					}
					const newFreq = newBaseHz * target.multiplier;
					if (newFreq > 0 && newFreq < nyquistLimit) {
						target.osc.frequency.cancelScheduledValues(now);
						target.osc.frequency.setValueAtTime(currentFreq, now);
						target.osc.frequency.exponentialRampToValueAtTime(newFreq, now + glideSec);
						target.glideFromHz = currentFreq;
						target.glideToHz = newFreq;
						target.glideStart = now;
						target.glideEnd = now + glideSec;
						if (target.mutedByNyquist) {
							if (target.partialEnvelope) {
								const env = target.partialEnvelope;
								const startGain = estimateTargetGain(target);
								const resumeAt = now + muteRampSec;
								const targetGain = evalPartialEnvelope(env, resumeAt);
								if (!nyquistUnmutedGains.has(target.gainNode)) {
									nyquistUnmutedGains.add(target.gainNode);
									target.gainNode.gain.cancelScheduledValues(now);
									target.gainNode.gain.setValueAtTime(startGain, now);
									target.gainNode.gain.linearRampToValueAtTime(targetGain, resumeAt);
									if (resumeAt < env.midAt && env.midAt < env.endAt) {
										target.gainNode.gain.exponentialRampToValueAtTime(env.midGain, env.midAt);
										target.gainNode.gain.exponentialRampToValueAtTime(
											PIANO_PARTIAL_FLOOR,
											env.endAt
										);
									} else if (resumeAt < env.endAt) {
										target.gainNode.gain.exponentialRampToValueAtTime(
											PIANO_PARTIAL_FLOOR,
											env.endAt
										);
									}
								}
								target.gainFrom = startGain;
								target.gainTo = targetGain;
								target.gainStart = now;
								target.gainEnd = resumeAt;
							} else if (target.unmutedGain !== null) {
								const startGain = estimateTargetGain(target);
								if (!nyquistUnmutedGains.has(target.gainNode)) {
									nyquistUnmutedGains.add(target.gainNode);
									target.gainNode.gain.cancelScheduledValues(now);
									target.gainNode.gain.setValueAtTime(startGain, now);
									target.gainNode.gain.linearRampToValueAtTime(
										target.unmutedGain,
										now + muteRampSec
									);
								}
								target.gainFrom = startGain;
								target.gainTo = target.unmutedGain;
								target.gainStart = now;
								target.gainEnd = now + muteRampSec;
							}
							target.mutedByNyquist = false;
						}
					} else {
						nyquistMutedGains.add(target.gainNode);
						target.osc.frequency.cancelScheduledValues(now);
						target.osc.frequency.setValueAtTime(currentFreq, now);
						target.glideFromHz = currentFreq;
						target.glideToHz = currentFreq;
						target.glideStart = now;
						target.glideEnd = now;
						if (!target.mutedByNyquist) {
							const startGain = estimateTargetGain(target);
							if (!scheduledMuteGains.has(target.gainNode)) {
								scheduledMuteGains.add(target.gainNode);
								target.gainNode.gain.cancelScheduledValues(now);
								target.gainNode.gain.setValueAtTime(startGain, now);
								target.gainNode.gain.linearRampToValueAtTime(0, now + muteRampSec);
							}
							if (target.unmutedGain !== null) {
								target.gainFrom = startGain;
								target.gainTo = 0;
								target.gainStart = now;
								target.gainEnd = now + muteRampSec;
							}
							target.mutedByNyquist = true;
						}
					}
				}
				for (const fmTarget of legatoTarget.fmTargets) {
					let currentOsc1Hz: number;
					if (
						now >= fmTarget.glideEnd ||
						fmTarget.glideEnd <= fmTarget.glideStart ||
						fmTarget.glideFromHz <= 0 ||
						fmTarget.glideToHz <= 0
					) {
						currentOsc1Hz = fmTarget.glideToHz;
					} else if (now <= fmTarget.glideStart) {
						currentOsc1Hz = fmTarget.glideFromHz;
					} else {
						const frac = (now - fmTarget.glideStart) / (fmTarget.glideEnd - fmTarget.glideStart);
						currentOsc1Hz =
							fmTarget.glideFromHz * Math.pow(fmTarget.glideToHz / fmTarget.glideFromHz, frac);
					}
					const newOsc1Hz = newBaseHz * fmTarget.osc1Mult;
					const newModHz = newBaseHz * fmTarget.modMult;
					if (
						nyquistMutedGains.has(fmTarget.gain) ||
						newModHz >= nyquistLimit ||
						newOsc1Hz >= nyquistLimit
					) {
						if (!fmTarget.mutedByNyquist) {
							if (!scheduledMuteGains.has(fmTarget.gain)) {
								scheduledMuteGains.add(fmTarget.gain);
								fmTarget.gain.gain.cancelScheduledValues(now);
								fmTarget.gain.gain.setValueAtTime(fmTarget.gain.gain.value, now);
								fmTarget.gain.gain.linearRampToValueAtTime(0, now + muteRampSec);
							}
							for (const modEntry of fmTarget.modGains) {
								modEntry.gain.gain.cancelScheduledValues(now);
								modEntry.gain.gain.setValueAtTime(modEntry.scale * currentOsc1Hz, now);
								modEntry.gain.gain.linearRampToValueAtTime(0, now + muteRampSec);
							}
						}
						fmTarget.mutedByNyquist = true;
						fmTarget.glideFromHz = currentOsc1Hz;
						fmTarget.glideToHz = currentOsc1Hz;
						fmTarget.glideStart = now;
						fmTarget.glideEnd = now;
						continue;
					}
					const wasMutedByNyquist = fmTarget.mutedByNyquist;
					const startFmGain = wasMutedByNyquist ? 0 : fmTarget.fmIndex * currentOsc1Hz;
					fmTarget.mutedByNyquist = false;
					fmTarget.gain.gain.cancelScheduledValues(now);
					fmTarget.gain.gain.setValueAtTime(startFmGain, now);
					fmTarget.gain.gain.linearRampToValueAtTime(fmTarget.fmIndex * newOsc1Hz, now + glideSec);
					fmTarget.baseFreq = newOsc1Hz;
					fmTarget.glideFromHz = currentOsc1Hz;
					fmTarget.glideToHz = newOsc1Hz;
					fmTarget.glideStart = now;
					fmTarget.glideEnd = now + glideSec;
					for (const modEntry of fmTarget.modGains) {
						modEntry.gain.gain.cancelScheduledValues(now);
						modEntry.gain.gain.setValueAtTime(
							wasMutedByNyquist ? 0 : modEntry.scale * currentOsc1Hz,
							now
						);
						modEntry.gain.gain.linearRampToValueAtTime(modEntry.scale * newOsc1Hz, now + glideSec);
					}
				}
				const oldId = legatoTarget.id;
				const nextId = `piano-${++this.serial}`;
				this.voices.delete(oldId);
				legatoTarget.id = nextId;
				legatoTarget.pitch = pitch;
				legatoTarget.held = true;
				this.voices.set(nextId, legatoTarget);
				this.lastPitch = pitch;
				return nextId;
			}
		}

		const canProduceSource = this.willProduceAudioSource(pitch, patch);
		let playable: SynthVoice[] = [];

		if (canProduceSource) {
			// In offline rendering, currentTime stays 0 and onended never fires during synchronous
			// scheduling, so retire completed voices at `now` without stop(0) or disconnect().
			if (this.offline) {
				for (const [id, v] of this.voices) {
					if (
						(v.released || Number.isFinite(v.releaseAt)) &&
						v.releaseAt + v.releaseDuration + 0.002 <= now
					) {
						this.voices.delete(id);
						this.offlineRetiredVoices.push(v);
					}
				}
			}

			// Mono: quickly release any existing playable voices
			if (voiceMode === 'mono') {
				for (const existing of [...this.voices.values()]) {
					if (!existing.released && now < existing.releaseAt) {
						this.releaseVoice(existing, MONO_RETRIGGER_RELEASE_SECONDS, now);
					}
				}
			}

			// Playable polyphony limit check (while loop handles live Poly -> Unison cap switch)
			playable = [...this.voices.values()].filter(
				(v) => !v.released && now < v.releaseAt && !v.cleaned
			);
			while (playable.length >= playableLimit) {
				const victimIdx = playable.findIndex((v) => !v.held);
				const idx = victimIdx >= 0 ? victimIdx : 0;
				const [oldest] = playable.splice(idx, 1);
				this.releaseVoice(oldest, STEAL_RELEASE_SECONDS, now);
			}

			// Tail-first node budget reclamation (reclaim oldest already-released tail BEFORE dropping)
			let totalNodeCost = 0;
			for (const v of this.voices.values()) {
				totalNodeCost += v.nodeCost;
			}
			while (totalNodeCost + unisonCount > PIANO_MAX_NODE_VOICES && this.voices.size > 0) {
				let victim: SynthVoice | undefined;
				for (const v of this.voices.values()) {
					if (v.released || now >= v.releaseAt) {
						victim = v;
						break;
					}
				}
				if (!victim) {
					for (const v of this.voices.values()) {
						if (!v.held) {
							victim = v;
							break;
						}
					}
				}
				if (!victim) {
					victim = this.voices.values().next().value;
				}
				if (!victim) break;
				totalNodeCost -= victim.nodeCost;
				if (this.offline) {
					this.releaseVoice(victim, STEAL_RELEASE_SECONDS, now, true);
					this.voices.delete(victim.id);
					this.offlineRetiredVoices.push(victim);
				} else {
					this.cleanupVoice(victim);
				}
			}
		}

		const context = this.context;
		const nyquistLimit = context.sampleRate * 0.46;
		const filterCeilingHz = Math.min(18000, nyquistLimit * 0.999);

		const voiceMixer = context.createGain();
		voiceMixer.gain.value = 1;

		const hasDrive = patch.filter.drive > 0;
		let preFilterInput: AudioNode = voiceMixer;
		const cleanupNodes: AudioNode[] = [voiceMixer];

		if (hasDrive) {
			const preDrive = context.createWaveShaper();
			preDrive.oversample = 'none';
			preDrive.curve = buildDriveCurve(patch.filter.drive);
			voiceMixer.connect(preDrive);
			preFilterInput = preDrive;
			cleanupNodes.push(preDrive);
		}

		const modMatrix: ModMatrix5x5 = patch.modMatrix;
		const velocityPitchMod = modMatrix[3][0] * strength * MOD_PITCH_CENTS;
		const velocityShapeMod = modMatrix[3][1] * strength;
		const velocityCutoffMod = modMatrix[3][2] * strength * MOD_CUTOFF_CENTS;
		const velocityResMod = modMatrix[3][3] * strength * MOD_RESONANCE_RANGE;
		const velocityAmpMod = modMatrix[3][4] * strength * MOD_AMP_RANGE;

		const keyTrackSemis = ((pitch - 60) / 12) * patch.filter.keyTrack;
		const trackedCutoff = clamp(
			patch.filter.cutoffHz * 2 ** keyTrackSemis,
			20,
			filterCeilingHz,
			filterCeilingHz
		);
		const maxHeadroomCents = Math.max(
			0,
			1200 * Math.log2(filterCeilingHz / Math.max(20, trackedCutoff))
		);
		const clampedVelocityCutoffMod =
			velocityCutoffMod > 0 ? Math.min(velocityCutoffMod, maxHeadroomCents) : velocityCutoffMod;
		const remainingHeadroom = Math.max(0, maxHeadroomCents - Math.max(0, clampedVelocityCutoffMod));
		const rawEnvFilterCents =
			patch.filter.envAmt * MOD_CUTOFF_CENTS + modMatrix[2][2] * MOD_CUTOFF_CENTS;
		const totalPosDynamicCents =
			Math.max(0, rawEnvFilterCents) +
			Math.abs(modMatrix[0][2]) * MOD_CUTOFF_CENTS +
			Math.abs(modMatrix[1][2]) * MOD_CUTOFF_CENTS +
			Math.max(0, modMatrix[4][2]) * MOD_CUTOFF_CENTS;
		const cutoffModScale =
			totalPosDynamicCents > remainingHeadroom && totalPosDynamicCents > 0
				? remainingHeadroom / totalPosDynamicCents
				: 1;

		const baseResonance = clamp(patch.filter.resonance + velocityResMod, 0.5, 20, 0.7);
		const minFilterQ =
			patch.filter.type === 'lp24' ? Math.max(0.5, Math.sqrt(baseResonance)) : baseResonance;
		const negResHeadroom = Math.max(0, minFilterQ - 0.05);
		const totalNegResMod =
			Math.abs(modMatrix[0][3]) * MOD_RESONANCE_RANGE +
			Math.abs(modMatrix[1][3]) * MOD_RESONANCE_RANGE +
			Math.max(0, -modMatrix[2][3]) * MOD_RESONANCE_RANGE +
			Math.max(0, -modMatrix[4][3]) * MOD_RESONANCE_RANGE;
		const resModScale =
			totalNegResMod > negResHeadroom && totalNegResMod > 0 ? negResHeadroom / totalNegResMod : 1;

		const filter1 = context.createBiquadFilter();
		filter1.frequency.setValueAtTime(trackedCutoff, now);
		let filter2: BiquadFilterNode | null = null;
		if (patch.filter.type === 'lp24') {
			filter1.type = 'lowpass';
			filter1.Q.setValueAtTime(Math.max(0.5, Math.sqrt(baseResonance)), now);
			filter2 = context.createBiquadFilter();
			filter2.type = 'lowpass';
			filter2.frequency.setValueAtTime(trackedCutoff, now);
			filter2.Q.setValueAtTime(baseResonance, now);
			preFilterInput.connect(filter1);
			filter1.connect(filter2);
			cleanupNodes.push(filter1, filter2);
		} else {
			filter1.type =
				patch.filter.type === 'bp12'
					? 'bandpass'
					: patch.filter.type === 'hp12'
						? 'highpass'
						: 'lowpass';
			filter1.Q.setValueAtTime(baseResonance, now);
			preFilterInput.connect(filter1);
			cleanupNodes.push(filter1);
		}

		if (clampedVelocityCutoffMod !== 0) {
			filter1.detune.setValueAtTime(clampedVelocityCutoffMod, now);
			filter2?.detune.setValueAtTime(clampedVelocityCutoffMod, now);
		}

		const ampVca = context.createGain();
		const totalNegAmpMod =
			Math.abs(modMatrix[0][4]) * MOD_AMP_RANGE +
			Math.abs(modMatrix[1][4]) * MOD_AMP_RANGE +
			Math.max(0, -modMatrix[2][4]) * MOD_AMP_RANGE +
			Math.max(0, -modMatrix[4][4]) * MOD_AMP_RANGE;
		const ampModScale = totalNegAmpMod > 1 ? (1 - 1e-12) / totalNegAmpMod : 1;
		const ampModActive =
			modMatrix[0][4] !== 0 ||
			modMatrix[1][4] !== 0 ||
			modMatrix[2][4] !== 0 ||
			modMatrix[4][4] !== 0;
		const modAmpGain = ampModActive ? context.createGain() : null;
		const panner = context.createStereoPanner();
		const register = unit((pitch - MIDI_MIN) / (MIDI_MAX - MIDI_MIN));
		panner.pan.setValueAtTime((register - 0.5) * 0.3, now);

		const filterTail = filter2 ?? filter1;
		filterTail.connect(ampVca);
		if (modAmpGain) {
			modAmpGain.gain.setValueAtTime(1, now);
			ampVca.connect(modAmpGain);
			modAmpGain.connect(panner);
			cleanupNodes.push(ampVca, modAmpGain, panner);
		} else {
			ampVca.connect(panner);
			cleanupNodes.push(ampVca, panner);
		}
		panner.connect(this.voiceSumBus);

		const is5Partial = patch.osc1.wave === '5-partial';
		const attack = clamp(patch.ampEnv.attack, 0.002, 4, DEFAULT_ATTACK_SECONDS);
		const decay = clamp(patch.ampEnv.decay, 0.01, 6, 0.3);
		const sustain = unit(patch.ampEnv.sustain, 1);
		const releaseSec = this.effectiveReleaseSeconds(patch);
		const sustainTransparent = is5Partial && sustain === 1 && attack <= DEFAULT_ATTACK_SECONDS;
		const peakGain = sustainTransparent
			? 1
			: Math.max(EXP_RELEASE_FLOOR, (0.25 + 0.75 * strength) * (1 + velocityAmpMod));
		const sustainGain = sustainTransparent ? 1 : Math.max(0, peakGain * sustain);
		const releaseAt = duration === undefined ? Infinity : now + duration;
		let ampReleaseFrom = sustainTransparent ? 1 : sustainGain;

		if (sustainTransparent) {
			ampVca.gain.setValueAtTime(1, now);
			if (duration !== undefined) {
				ampVca.gain.setValueAtTime(1, releaseAt);
				ampVca.gain.exponentialRampToValueAtTime(EXP_RELEASE_FLOOR, releaseAt + releaseSec);
				ampVca.gain.linearRampToValueAtTime(0, releaseAt + releaseSec + 0.002);
			}
		} else if (duration === undefined) {
			ampReleaseFrom = 1;
			ampVca.gain.setValueAtTime(0, now);
			ampVca.gain.linearRampToValueAtTime(peakGain, now + attack);
			ampVca.gain.exponentialRampToValueAtTime(
				Math.max(EXP_RELEASE_FLOOR, sustainGain),
				now + attack + decay
			);
			if (sustainGain === 0) {
				ampVca.gain.linearRampToValueAtTime(0, now + attack + decay + 0.002);
			}
		} else if (duration <= attack) {
			const relStartGain = Math.max(
				EXP_RELEASE_FLOOR,
				peakGain * (duration / Math.max(0.001, attack))
			);
			ampReleaseFrom = relStartGain;
			ampVca.gain.setValueAtTime(0, now);
			ampVca.gain.linearRampToValueAtTime(relStartGain, releaseAt);
			ampVca.gain.exponentialRampToValueAtTime(EXP_RELEASE_FLOOR, releaseAt + releaseSec);
			ampVca.gain.linearRampToValueAtTime(0, releaseAt + releaseSec + 0.002);
		} else if (duration < attack + decay) {
			const decTarget = Math.max(EXP_RELEASE_FLOOR, sustainGain);
			const frac = (duration - attack) / Math.max(0.001, decay);
			const relStartGain = Math.max(
				EXP_RELEASE_FLOOR,
				peakGain * Math.pow(decTarget / Math.max(EXP_RELEASE_FLOOR, peakGain), frac)
			);
			const attackEnd = Math.min(now + attack, releaseAt);
			ampReleaseFrom = relStartGain;
			ampVca.gain.setValueAtTime(0, now);
			ampVca.gain.linearRampToValueAtTime(peakGain, attackEnd);
			ampVca.gain.exponentialRampToValueAtTime(relStartGain, releaseAt);
			ampVca.gain.exponentialRampToValueAtTime(EXP_RELEASE_FLOOR, releaseAt + releaseSec);
			ampVca.gain.linearRampToValueAtTime(0, releaseAt + releaseSec + 0.002);
		} else {
			const attackEnd = Math.min(now + attack, releaseAt);
			const decayEnd = Math.min(now + attack + decay, releaseAt);
			const decTarget = Math.max(EXP_RELEASE_FLOOR, sustainGain);
			ampVca.gain.setValueAtTime(0, now);
			ampVca.gain.linearRampToValueAtTime(peakGain, attackEnd);
			ampVca.gain.exponentialRampToValueAtTime(decTarget, decayEnd);
			if (sustainGain === 0 && releaseAt > decayEnd + 0.002) {
				ampReleaseFrom = 0;
				ampVca.gain.linearRampToValueAtTime(0, decayEnd + 0.002);
				ampVca.gain.setValueAtTime(0, releaseAt);
				ampVca.gain.linearRampToValueAtTime(0, releaseAt + releaseSec + 0.002);
			} else {
				ampReleaseFrom = decTarget;
				ampVca.gain.setValueAtTime(decTarget, releaseAt);
				ampVca.gain.exponentialRampToValueAtTime(EXP_RELEASE_FLOOR, releaseAt + releaseSec);
				ampVca.gain.linearRampToValueAtTime(0, releaseAt + releaseSec + 0.002);
			}
		}

		// Filter ADSR envelope (lazy ConstantSourceNode only when envAmt or modMatrix[2] is active)
		let filterEnvSource: ConstantSourceNode | null = null;
		let filterEnvGain: GainNode | null = null;
		const fAtk = clamp(patch.filterEnv.attack, 0.002, 4, 0.01);
		const fDec = clamp(patch.filterEnv.decay, 0.01, 6, 0.4);
		const fSus = unit(patch.filterEnv.sustain, 0.5);
		const fRel = this.effectiveFilterReleaseSeconds(patch);
		let filterReleaseFrom = fSus;
		const filterEnvRowActive = modMatrix[2].some((v) => v !== 0);
		if (patch.filter.envAmt !== 0 || filterEnvRowActive) {
			filterEnvSource = context.createConstantSource();
			filterEnvSource.offset.setValueAtTime(1, now);
			filterEnvGain = context.createGain();
			const fDecTarget = Math.max(EXP_RELEASE_FLOOR, fSus);
			if (duration === undefined) {
				filterEnvGain.gain.setValueAtTime(0, now);
				filterEnvGain.gain.linearRampToValueAtTime(1, now + fAtk);
				filterEnvGain.gain.exponentialRampToValueAtTime(fDecTarget, now + fAtk + fDec);
				if (fSus === 0) {
					filterEnvGain.gain.linearRampToValueAtTime(0, now + fAtk + fDec + 0.002);
				}
			} else if (duration <= fAtk) {
				const relStart = Math.max(EXP_RELEASE_FLOOR, duration / Math.max(0.001, fAtk));
				filterReleaseFrom = relStart;
				filterEnvGain.gain.setValueAtTime(0, now);
				filterEnvGain.gain.linearRampToValueAtTime(relStart, releaseAt);
				filterEnvGain.gain.exponentialRampToValueAtTime(EXP_RELEASE_FLOOR, releaseAt + fRel);
				filterEnvGain.gain.linearRampToValueAtTime(0, releaseAt + fRel + 0.002);
			} else if (duration < fAtk + fDec) {
				const frac = (duration - fAtk) / Math.max(0.001, fDec);
				const relStart = Math.max(EXP_RELEASE_FLOOR, Math.pow(fDecTarget, frac));
				const fAttackEnd = Math.min(now + fAtk, releaseAt);
				filterReleaseFrom = relStart;
				filterEnvGain.gain.setValueAtTime(0, now);
				filterEnvGain.gain.linearRampToValueAtTime(1, fAttackEnd);
				filterEnvGain.gain.exponentialRampToValueAtTime(relStart, releaseAt);
				filterEnvGain.gain.exponentialRampToValueAtTime(EXP_RELEASE_FLOOR, releaseAt + fRel);
				filterEnvGain.gain.linearRampToValueAtTime(0, releaseAt + fRel + 0.002);
			} else {
				const fAttackEnd = Math.min(now + fAtk, releaseAt);
				const fDecayEnd = Math.min(now + fAtk + fDec, releaseAt);
				filterEnvGain.gain.setValueAtTime(0, now);
				filterEnvGain.gain.linearRampToValueAtTime(1, fAttackEnd);
				filterEnvGain.gain.exponentialRampToValueAtTime(fDecTarget, fDecayEnd);
				if (fSus === 0 && releaseAt > fDecayEnd + 0.002) {
					filterReleaseFrom = 0;
					filterEnvGain.gain.linearRampToValueAtTime(0, fDecayEnd + 0.002);
					filterEnvGain.gain.setValueAtTime(0, releaseAt);
					filterEnvGain.gain.linearRampToValueAtTime(0, releaseAt + fRel + 0.002);
				} else {
					filterReleaseFrom = fDecTarget;
					filterEnvGain.gain.setValueAtTime(fDecTarget, releaseAt);
					filterEnvGain.gain.exponentialRampToValueAtTime(EXP_RELEASE_FLOOR, releaseAt + fRel);
					filterEnvGain.gain.linearRampToValueAtTime(0, releaseAt + fRel + 0.002);
				}
			}
			filterEnvSource.connect(filterEnvGain);
			cleanupNodes.push(filterEnvGain);
		}

		const voice: SynthVoice = {
			id: `piano-${++this.serial}`,
			pitch,
			velocity: strength,
			nodeCost: unisonCount,
			startedAt: now,
			held: true,
			released: false,
			releaseAt,
			releaseFrom: ampReleaseFrom,
			releaseDuration: duration === undefined ? 0 : releaseSec,
			is5Partial,
			sustainTransparent,
			attack,
			decay,
			peakGain,
			sustainGain,
			filterAttack: fAtk,
			filterDecay: fDec,
			filterSustain: fSus,
			filterReleaseFrom,
			filterReleaseDuration: duration === undefined ? 0 : fRel,
			ampVca,
			modAmpGain,
			filter1,
			filter2,
			filterEnvSource,
			filterEnvGain,
			sources: [],
			oscTargets: [],
			pwmTargets: [],
			fmTargets: [],
			modGains: [],
			cleanupNodes,
			detachLinks: [],
			cleaned: false
		};

		const baseHz = midiToHz(pitch);
		const prevHz =
			patch.glideMs > 0 && this.lastPitch !== null && this.lastPitch !== pitch
				? midiToHz(this.lastPitch)
				: null;
		const glideSec = clamp(patch.glideMs, 0, 600, 0) / 1000;

		const registerSource = (
			node: AudioScheduledSourceNode,
			stopTime: number,
			isOscillator = false
		) => {
			const entry: ScheduledSourceEntry = {
				node,
				ended: false,
				stopped: false,
				isOscillator
			};
			voice.sources.push(entry);
			node.onended = () => {
				if (entry.stopTimer !== undefined) {
					clearTimeout(entry.stopTimer);
					entry.stopTimer = undefined;
				}
				if (entry.ended || voice.cleaned) return;
				entry.ended = true;
				node.disconnect();
				if (voice.sources.every((item) => item.ended)) {
					this.cleanupVoice(voice);
				}
			};
			node.start(now);
			if (Number.isFinite(stopTime)) {
				this.scheduleSourceStop(voice, entry, stopTime);
			}
		};

		const applyGlideAndDetune = (
			osc: OscillatorNode,
			multiplier: number,
			detuneCents: number,
			gainNode: GainNode,
			unmutedGain: number | null,
			partialEnvelope?: PartialEnvelopeSpec
		) => {
			const targetHz = baseHz * multiplier;
			let glideFromHz = targetHz;
			let glideEnd = now;
			if (prevHz !== null && glideSec > 0) {
				glideFromHz = prevHz * multiplier;
				glideEnd = now + glideSec;
				osc.frequency.setValueAtTime(glideFromHz, now);
				osc.frequency.exponentialRampToValueAtTime(targetHz, glideEnd);
			} else {
				osc.frequency.setValueAtTime(targetHz, now);
			}
			const totalDetune = detuneCents + velocityPitchMod;
			if (totalDetune !== 0) {
				osc.detune.setValueAtTime(totalDetune, now);
			}
			this.pitchBendSource.connect(osc.detune);
			voice.detachLinks.push({ from: this.pitchBendSource, to: osc.detune });
			const nominalGain = unmutedGain ?? 0;
			voice.oscTargets.push({
				osc,
				multiplier,
				gainNode,
				unmutedGain,
				partialEnvelope,
				mutedByNyquist: false,
				gainFrom: nominalGain,
				gainTo: nominalGain,
				gainStart: now,
				gainEnd: now,
				glideFromHz,
				glideToHz: targetHz,
				glideStart: now,
				glideEnd
			});
		};

		const buildOscSource = (
			wave: Osc2Wave,
			freqMultiplier: number,
			shape: number,
			detuneCents: number,
			targetNode: AudioNode,
			gainNode: GainNode,
			unmutedGain: number | null,
			defaultStop: number
		): boolean => {
			const freq = baseHz * freqMultiplier;
			if (freq >= nyquistLimit) return false;
			if (wave === 'pwm') {
				const tri = context.createOscillator();
				tri.type = 'triangle';
				applyGlideAndDetune(tri, freqMultiplier, detuneCents, gainNode, unmutedGain);
				const duty = 0.05 + clamp(shape + velocityShapeMod * 0.45, 0, 1, 0.5) * 0.9;
				const bias = context.createConstantSource();
				bias.offset.setValueAtTime((duty - 0.5) * 2, now);
				const comp = context.createWaveShaper();
				comp.oversample = '4x';
				comp.curve = getPwmComparatorCurve();
				const dcBlock = context.createBiquadFilter();
				dcBlock.type = 'highpass';
				dcBlock.frequency.setValueAtTime(10, now);
				tri.connect(comp);
				bias.connect(comp);
				comp.connect(dcBlock);
				dcBlock.connect(targetNode);
				voice.pwmTargets.push({ bias });
				voice.cleanupNodes.push(comp, dcBlock);
				registerSource(tri, defaultStop, true);
				registerSource(bias, defaultStop, false);
				return true;
			}
			const osc = context.createOscillator();
			osc.type = mapOscType(wave);
			applyGlideAndDetune(osc, freqMultiplier, detuneCents, gainNode, unmutedGain);
			osc.connect(targetNode);
			registerSource(osc, defaultStop, true);
			return true;
		};

		const defaultStop = duration === undefined ? Infinity : releaseAt + releaseSec + 0.002;
		const unisonOffsets = unisonCount === 1 ? [0] : unisonCount === 2 ? [-0.5, 0.5] : [-1, 0, 1];
		const layerScale = 1 / Math.sqrt(unisonCount);

		for (let layerIdx = 0; layerIdx < unisonOffsets.length; layerIdx++) {
			const layerDetune = unisonOffsets[layerIdx] * patch.unisonSpreadCt;
			const layerBus =
				unisonCount === 1
					? voiceMixer
					: (() => {
							const g = context.createGain();
							g.gain.setValueAtTime(layerScale, now);
							g.connect(voiceMixer);
							voice.cleanupNodes.push(g);
							return g;
						})();

			// OSC 1
			const osc1NeedsRender = patch.mix.osc1 > 0 || (patch.osc2.ringMod && patch.mix.osc2 > 0);
			let osc1RawBus: GainNode | null = null;
			if (osc1NeedsRender) {
				const osc1Mult = 2 ** (patch.osc1.oct + patch.osc1.semi / 12 + patch.osc1.fine / 1200);
				const osc1Hz = baseHz * osc1Mult;
				const osc1Mix = unit(patch.mix.osc1);
				const osc1MixGain = context.createGain();
				osc1MixGain.gain.setValueAtTime(osc1Mix, now);
				osc1MixGain.connect(layerBus);
				voice.cleanupNodes.push(osc1MixGain);

				if (patch.osc2.ringMod && patch.mix.osc2 > 0) {
					const rawBus = context.createGain();
					rawBus.gain.setValueAtTime(1, now);
					rawBus.connect(osc1MixGain);
					voice.cleanupNodes.push(rawBus);
					osc1RawBus = rawBus;
				}
				const osc1Dest = osc1RawBus ?? osc1MixGain;
				const osc1UnmutedGain = osc1RawBus ? 1 : osc1Mix;

				if (patch.osc1.wave === '5-partial') {
					const pianoDecay = 5.4 - register * 3;
					for (let index = 0; index < PARTIALS.length; index++) {
						const partialMult = osc1Mult * PARTIALS[index];
						const partialFreq = baseHz * partialMult;
						if (partialFreq >= nyquistLimit) continue;
						const source = context.createOscillator();
						const envelope = context.createGain();
						const brightness = index === 0 ? 1 : (0.5 + strength * 0.5) * (1 - register * 0.4);
						const peak = 0.12 * strength ** 1.35 * PARTIAL_LEVELS[index] * brightness;
						const partialDur = pianoDecay / (1 + index * 0.5);
						const attackEnd = Math.min(attack, Math.max(0.002, partialDur * 0.5));
						const midOffset = Math.max(attackEnd + 0.001, 0.17);
						const midGain = Math.max(PIANO_PARTIAL_FLOOR, peak * 0.38);
						source.type = 'sine';
						applyGlideAndDetune(source, partialMult, layerDetune, envelope, peak, {
							startedAt: now,
							attackEndAt: now + attackEnd,
							peak,
							midAt: now + midOffset,
							midGain,
							endAt: now + partialDur
						});
						envelope.gain.setValueAtTime(0, now);
						envelope.gain.linearRampToValueAtTime(peak, now + attackEnd);
						if (midOffset < partialDur && now + midOffset < now + partialDur) {
							envelope.gain.exponentialRampToValueAtTime(midGain, now + midOffset);
						}
						envelope.gain.exponentialRampToValueAtTime(PIANO_PARTIAL_FLOOR, now + partialDur);
						source.connect(envelope);
						envelope.connect(osc1Dest);
						voice.cleanupNodes.push(envelope);
						const stopAt = Math.min(now + partialDur + 0.025, releaseAt + releaseSec + 0.002);
						registerSource(source, stopAt, true);
					}
				} else if (patch.osc1.wave === 'supersaw') {
					if (osc1Hz < nyquistLimit) {
						const useDetunedTriple = playable.length < SUPERSAW_POLY_FALLBACK_THRESHOLD;
						if (useDetunedTriple) {
							const spread = 6 + clamp(patch.osc1.shape + velocityShapeMod * 0.5, 0, 1, 0) * 34;
							const sawNominalGain = 1 / Math.sqrt(3);
							const sawGain = context.createGain();
							sawGain.gain.setValueAtTime(sawNominalGain, now);
							sawGain.connect(osc1Dest);
							voice.cleanupNodes.push(sawGain);
							for (const offset of [-spread, 0, spread]) {
								const osc = context.createOscillator();
								osc.type = 'sawtooth';
								applyGlideAndDetune(osc, osc1Mult, layerDetune + offset, sawGain, sawNominalGain);
								osc.connect(sawGain);
								registerSource(osc, defaultStop, true);
							}
						} else {
							buildOscSource(
								'saw',
								osc1Mult,
								patch.osc1.shape,
								layerDetune,
								osc1Dest,
								osc1Dest,
								osc1UnmutedGain,
								defaultStop
							);
						}
					}
				} else if (patch.osc1.wave === 'fm') {
					if (osc1Hz < nyquistLimit) {
						const carrier = context.createOscillator();
						carrier.type = 'sine';
						applyGlideAndDetune(carrier, osc1Mult, layerDetune, osc1Dest, osc1UnmutedGain);
						carrier.connect(osc1Dest);
						registerSource(carrier, defaultStop, true);

						const modMult = osc1Mult * clamp(patch.osc1.fmRatio, 0.5, 8, 1);
						const modHz = baseHz * modMult;
						if (modHz < nyquistLimit) {
							const mod = context.createOscillator();
							mod.type = 'sine';
							const fmGain = context.createGain();
							const fmIndex = clamp(patch.osc1.shape + velocityShapeMod * 0.5, 0, 1, 0) * 5;
							fmGain.gain.setValueAtTime(fmIndex * osc1Hz, now);
							applyGlideAndDetune(mod, modMult, layerDetune, fmGain, null);
							mod.connect(fmGain);
							fmGain.connect(carrier.frequency);
							const prevOsc1Hz = prevHz !== null && glideSec > 0 ? prevHz * osc1Mult : osc1Hz;
							voice.fmTargets.push({
								gain: fmGain,
								baseFreq: osc1Hz,
								fmIndex,
								osc1Mult,
								modMult,
								mutedByNyquist: false,
								glideFromHz: prevOsc1Hz,
								glideToHz: osc1Hz,
								glideStart: now,
								glideEnd: prevHz !== null && glideSec > 0 ? now + glideSec : now,
								modGains: []
							});
							voice.cleanupNodes.push(fmGain);
							registerSource(mod, defaultStop, true);
						}
					}
				} else if (patch.osc1.wave === 'harmonic') {
					if (osc1Hz < nyquistLimit) {
						const osc = context.createOscillator();
						osc.setPeriodicWave(
							this.getOrCreateHarmonicWave(patch.osc1.shape + velocityShapeMod * 0.5)
						);
						applyGlideAndDetune(osc, osc1Mult, layerDetune, osc1Dest, osc1UnmutedGain);
						osc.connect(osc1Dest);
						registerSource(osc, defaultStop, true);
					}
				} else {
					buildOscSource(
						patch.osc1.wave,
						osc1Mult,
						patch.osc1.shape,
						layerDetune,
						osc1Dest,
						osc1Dest,
						osc1UnmutedGain,
						defaultStop
					);
				}
			}

			// OSC 2 (+ Ring Mod)
			if (patch.mix.osc2 > 0) {
				const osc2Mult = 2 ** (patch.osc2.oct + patch.osc2.semi / 12 + patch.osc2.fine / 1200);
				const osc2Mix = unit(patch.mix.osc2);
				const osc2MixGain = context.createGain();
				osc2MixGain.gain.setValueAtTime(osc2Mix, now);
				osc2MixGain.connect(layerBus);
				voice.cleanupNodes.push(osc2MixGain);

				if (patch.osc2.ringMod && osc1RawBus) {
					const ringGain = context.createGain();
					ringGain.gain.setValueAtTime(0, now);
					osc1RawBus.connect(ringGain);
					ringGain.connect(osc2MixGain);
					voice.cleanupNodes.push(ringGain);
					buildOscSource(
						patch.osc2.wave,
						osc2Mult,
						patch.osc2.shape,
						layerDetune,
						ringGain.gain as unknown as AudioNode,
						osc2MixGain,
						osc2Mix,
						defaultStop
					);
				} else {
					buildOscSource(
						patch.osc2.wave,
						osc2Mult,
						patch.osc2.shape,
						layerDetune,
						osc2MixGain,
						osc2MixGain,
						osc2Mix,
						defaultStop
					);
				}
			}

			// SUB OSC
			if (patch.mix.sub > 0) {
				const subMult = patch.sub.oct === -2 ? 0.25 : 0.5;
				if (baseHz * subMult < nyquistLimit) {
					const subOsc = context.createOscillator();
					subOsc.type = patch.sub.wave;
					const subMix = unit(patch.mix.sub);
					const subGain = context.createGain();
					subGain.gain.setValueAtTime(subMix, now);
					applyGlideAndDetune(subOsc, subMult, layerDetune, subGain, subMix);
					subOsc.connect(subGain);
					subGain.connect(layerBus);
					voice.cleanupNodes.push(subGain);
					registerSource(subOsc, defaultStop, true);
				}
			}
		}

		// NOISE (1 buffer source per voice when mix.noise > 0)
		if (patch.mix.noise > 0) {
			const noiseSrc = context.createBufferSource();
			noiseSrc.buffer = this.getOrCreateNoiseBuffer(patch.noise.type);
			noiseSrc.loop = true;
			const noiseGain = context.createGain();
			noiseGain.gain.setValueAtTime(unit(patch.mix.noise), now);
			noiseSrc.connect(noiseGain);
			noiseGain.connect(voiceMixer);
			voice.cleanupNodes.push(noiseGain);
			registerSource(noiseSrc, defaultStop, false);
		}

		if (voice.sources.length === 0) {
			this.cleanupVoice(voice);
			return '';
		}

		// Connect Filter Env + 5x5 Mod Matrix routes
		if (filterEnvSource && filterEnvGain) {
			const envFilterCents =
				rawEnvFilterCents > 0 ? rawEnvFilterCents * cutoffModScale : rawEnvFilterCents;
			if (envFilterCents !== 0) {
				const g = context.createGain();
				g.gain.setValueAtTime(envFilterCents, now);
				filterEnvGain.connect(g);
				g.connect(filter1.detune);
				if (filter2) g.connect(filter2.detune);
				voice.modGains.push(g);
			}
			this.connectModDestinations(
				voice,
				filterEnvGain,
				modMatrix[2],
				now,
				true,
				cutoffModScale,
				ampModScale,
				resModScale
			);
			const filterStop =
				duration === undefined ? Infinity : releaseAt + Math.min(releaseSec, fRel) + 0.002;
			registerSource(filterEnvSource, filterStop, false);
		}

		for (let r = 0; r < 2; r++) {
			if (modMatrix[r].some((v) => v !== 0)) {
				this.connectModDestinations(
					voice,
					this.lfoBus[r],
					modMatrix[r],
					now,
					false,
					cutoffModScale,
					ampModScale,
					resModScale
				);
			}
		}
		if (modMatrix[4].some((v) => v !== 0)) {
			this.connectModDestinations(
				voice,
				this.modWheelSource,
				modMatrix[4],
				now,
				false,
				cutoffModScale,
				ampModScale,
				resModScale
			);
		}

		this.voices.set(voice.id, voice);
		this.lastPitch = pitch;
		this.ensureGlobalModulators(now, true);
		return voice.id;
	}

	private connectModDestinations(
		voice: SynthVoice,
		sourceNode: AudioNode,
		row: readonly [number, number, number, number, number],
		when: number,
		skipCutoff = false,
		cutoffModScale = 1,
		ampModScale = 1,
		resModScale = 1
	): void {
		const context = this.context;

		// 0: Pitch
		if (row[0] !== 0 && voice.oscTargets.length > 0) {
			const g = context.createGain();
			g.gain.setValueAtTime(row[0] * MOD_PITCH_CENTS, when);
			sourceNode.connect(g);
			if (
				sourceNode === this.lfoBus[0] ||
				sourceNode === this.lfoBus[1] ||
				sourceNode === this.modWheelSource
			) {
				voice.detachLinks.push({ from: sourceNode, to: g });
			}
			for (const target of voice.oscTargets) {
				g.connect(target.osc.detune);
			}
			voice.modGains.push(g);
		}

		// 1: Shape (PWM bias or FM index)
		if (row[1] !== 0 && (voice.pwmTargets.length > 0 || voice.fmTargets.length > 0)) {
			if (voice.pwmTargets.length > 0) {
				const g = context.createGain();
				g.gain.setValueAtTime(row[1] * MOD_PWM_OFFSET, when);
				sourceNode.connect(g);
				if (
					sourceNode === this.lfoBus[0] ||
					sourceNode === this.lfoBus[1] ||
					sourceNode === this.modWheelSource
				) {
					voice.detachLinks.push({ from: sourceNode, to: g });
				}
				for (const target of voice.pwmTargets) {
					g.connect(target.bias.offset);
				}
				voice.modGains.push(g);
			}
			for (const target of voice.fmTargets) {
				const g = context.createGain();
				const scale = row[1] * 2.5;
				g.gain.setValueAtTime(scale * target.baseFreq, when);
				sourceNode.connect(g);
				if (
					sourceNode === this.lfoBus[0] ||
					sourceNode === this.lfoBus[1] ||
					sourceNode === this.modWheelSource
				) {
					voice.detachLinks.push({ from: sourceNode, to: g });
				}
				g.connect(target.gain.gain);
				target.modGains.push({ gain: g, scale });
				voice.modGains.push(g);
			}
		}

		// 2: Cutoff
		if (!skipCutoff && row[2] !== 0) {
			const isBipolarSource = sourceNode === this.lfoBus[0] || sourceNode === this.lfoBus[1];
			const scaledCents =
				isBipolarSource || row[2] > 0
					? row[2] * MOD_CUTOFF_CENTS * cutoffModScale
					: row[2] * MOD_CUTOFF_CENTS;
			if (scaledCents !== 0) {
				const g = context.createGain();
				g.gain.setValueAtTime(scaledCents, when);
				sourceNode.connect(g);
				if (
					sourceNode === this.lfoBus[0] ||
					sourceNode === this.lfoBus[1] ||
					sourceNode === this.modWheelSource
				) {
					voice.detachLinks.push({ from: sourceNode, to: g });
				}
				g.connect(voice.filter1.detune);
				if (voice.filter2) g.connect(voice.filter2.detune);
				voice.modGains.push(g);
			}
		}

		// 3: Resonance (budgeted so negative/bipolar mod never drives Q below 0.05)
		if (row[3] !== 0) {
			const isBipolarSource = sourceNode === this.lfoBus[0] || sourceNode === this.lfoBus[1];
			const scaledRes =
				isBipolarSource || row[3] < 0
					? row[3] * MOD_RESONANCE_RANGE * resModScale
					: row[3] * MOD_RESONANCE_RANGE;
			if (scaledRes !== 0) {
				const g = context.createGain();
				g.gain.setValueAtTime(scaledRes, when);
				sourceNode.connect(g);
				if (
					sourceNode === this.lfoBus[0] ||
					sourceNode === this.lfoBus[1] ||
					sourceNode === this.modWheelSource
				) {
					voice.detachLinks.push({ from: sourceNode, to: g });
				}
				g.connect(voice.filter1.Q);
				if (voice.filter2) g.connect(voice.filter2.Q);
				voice.modGains.push(g);
			}
		}

		// 4: Amp (routed to post-VCA modAmpGain so closed ampVca stays silent)
		if (row[4] !== 0) {
			const isBipolarSource = sourceNode === this.lfoBus[0] || sourceNode === this.lfoBus[1];
			const scaledAmp =
				isBipolarSource || row[4] < 0
					? row[4] * MOD_AMP_RANGE * ampModScale
					: row[4] * MOD_AMP_RANGE;
			if (scaledAmp !== 0) {
				const g = context.createGain();
				g.gain.setValueAtTime(scaledAmp, when);
				sourceNode.connect(g);
				if (
					sourceNode === this.lfoBus[0] ||
					sourceNode === this.lfoBus[1] ||
					sourceNode === this.modWheelSource
				) {
					voice.detachLinks.push({ from: sourceNode, to: g });
				}
				g.connect(voice.modAmpGain ? voice.modAmpGain.gain : voice.ampVca.gain);
				voice.modGains.push(g);
			}
		}
	}

	private estimateCurrentAmpGain(voice: SynthVoice, now: number): number {
		const isReleasing =
			voice.released || (Number.isFinite(voice.releaseAt) && now >= voice.releaseAt);
		if (isReleasing) {
			const relElapsed = Math.max(0, now - voice.releaseAt);
			if (relElapsed >= voice.releaseDuration) return EXP_RELEASE_FLOOR;
			const frac = relElapsed / Math.max(0.002, voice.releaseDuration);
			return Math.max(
				EXP_RELEASE_FLOOR,
				voice.releaseFrom *
					Math.pow(EXP_RELEASE_FLOOR / Math.max(EXP_RELEASE_FLOOR, voice.releaseFrom), frac)
			);
		}
		if (voice.sustainTransparent) return 1;
		const elapsed = Math.max(0, now - voice.startedAt);
		if (elapsed < voice.attack) {
			return voice.peakGain * (elapsed / Math.max(0.001, voice.attack));
		}
		if (elapsed < voice.attack + voice.decay) {
			const frac = (elapsed - voice.attack) / Math.max(0.001, voice.decay);
			const decTarget = Math.max(EXP_RELEASE_FLOOR, voice.sustainGain);
			return (
				voice.peakGain * Math.pow(decTarget / Math.max(EXP_RELEASE_FLOOR, voice.peakGain), frac)
			);
		}
		return voice.sustainGain;
	}

	private estimateCurrentFilterGain(voice: SynthVoice, now: number): number {
		const isReleasing =
			voice.released || (Number.isFinite(voice.releaseAt) && now >= voice.releaseAt);
		if (isReleasing) {
			const relElapsed = Math.max(0, now - voice.releaseAt);
			if (relElapsed >= voice.filterReleaseDuration) return EXP_RELEASE_FLOOR;
			const frac = relElapsed / Math.max(0.002, voice.filterReleaseDuration);
			return Math.max(
				EXP_RELEASE_FLOOR,
				voice.filterReleaseFrom *
					Math.pow(EXP_RELEASE_FLOOR / Math.max(EXP_RELEASE_FLOOR, voice.filterReleaseFrom), frac)
			);
		}
		const elapsed = Math.max(0, now - voice.startedAt);
		if (elapsed < voice.filterAttack) {
			return elapsed / Math.max(0.001, voice.filterAttack);
		}
		if (elapsed < voice.filterAttack + voice.filterDecay) {
			const frac = (elapsed - voice.filterAttack) / Math.max(0.001, voice.filterDecay);
			const decTarget = Math.max(EXP_RELEASE_FLOOR, voice.filterSustain);
			return Math.pow(decTarget, frac);
		}
		return voice.filterSustain;
	}

	private scheduleSourceStop(voice: SynthVoice, entry: ScheduledSourceEntry, stopAt: number): void {
		if (entry.stopTimer !== undefined) {
			clearTimeout(entry.stopTimer);
			entry.stopTimer = undefined;
		}
		if (entry.ended || entry.stopped || voice.cleaned || this.disposed) return;
		if (this.offline) {
			entry.stopped = true;
			try {
				entry.node.stop(stopAt);
			} catch {
				// Ignore if already stopped.
			}
			return;
		}
		const runStop = () => {
			entry.stopTimer = undefined;
			if (entry.ended || entry.stopped || voice.cleaned || this.disposed) return;
			const remainingMs = (stopAt - this.currentTime) * 1000;
			if (remainingMs > 1) {
				entry.stopTimer = setTimeout(runStop, Math.ceil(remainingMs));
				return;
			}
			entry.stopped = true;
			try {
				entry.node.stop(Math.max(this.currentTime, stopAt));
			} catch {
				// The source may already have stopped or ended on the audio thread.
			}
		};
		const delayMs = Math.max(0, (stopAt - this.currentTime) * 1000);
		entry.stopTimer = setTimeout(runStop, Math.ceil(delayMs));
	}

	private releaseVoice(
		voice: SynthVoice,
		duration: number,
		at?: number,
		forceShorten = false,
		filterDuration = duration
	): void {
		if (voice.cleaned || !this.context) return;
		if (voice.released && !forceShorten) return;
		if (!this.offline) {
			if (this.context.state !== 'running') {
				this.cleanupVoice(voice);
				return;
			}
			if (at === undefined && voice.startedAt > this.currentTime) {
				this.cleanupVoice(voice);
				return;
			}
		}
		const now = this.offline
			? Math.max(voice.startedAt, at ?? this.currentTime)
			: at !== undefined && at >= this.currentTime
				? Math.max(voice.startedAt, at)
				: Math.max(voice.startedAt, this.currentTime);

		const isReleasing =
			voice.released || (Number.isFinite(voice.releaseAt) && now >= voice.releaseAt);
		if (isReleasing && !forceShorten) return;

		let releaseDur = Math.max(0.002, duration);
		let filterReleaseDur = Math.max(0.002, filterDuration);
		if (isReleasing && forceShorten) {
			const remaining = Math.max(0.002, voice.releaseAt + voice.releaseDuration - now);
			releaseDur = Math.min(remaining, releaseDur);
			const remainingFilter = Math.max(0.002, voice.releaseAt + voice.filterReleaseDuration - now);
			filterReleaseDur = Math.min(remainingFilter, filterReleaseDur);
		}

		const currentGain = Math.max(EXP_RELEASE_FLOOR, this.estimateCurrentAmpGain(voice, now));
		const fGain = Math.max(EXP_RELEASE_FLOOR, this.estimateCurrentFilterGain(voice, now));

		voice.held = false;
		voice.released = true;
		voice.releaseAt = now;
		voice.releaseFrom = currentGain;
		voice.releaseDuration = releaseDur;
		voice.filterReleaseFrom = fGain;
		voice.filterReleaseDuration = filterReleaseDur;

		voice.ampVca.gain.cancelScheduledValues(now);
		voice.ampVca.gain.setValueAtTime(currentGain, now);
		voice.ampVca.gain.exponentialRampToValueAtTime(EXP_RELEASE_FLOOR, now + releaseDur);
		voice.ampVca.gain.linearRampToValueAtTime(0, now + releaseDur + 0.002);

		if (voice.filterEnvGain) {
			voice.filterEnvGain.gain.cancelScheduledValues(now);
			voice.filterEnvGain.gain.setValueAtTime(fGain, now);
			voice.filterEnvGain.gain.exponentialRampToValueAtTime(
				EXP_RELEASE_FLOOR,
				now + filterReleaseDur
			);
			voice.filterEnvGain.gain.linearRampToValueAtTime(0, now + filterReleaseDur + 0.002);
		}

		const stopAt = now + releaseDur + 0.002;
		for (const src of voice.sources) {
			if (src.stopTimer !== undefined) {
				clearTimeout(src.stopTimer);
				src.stopTimer = undefined;
			}
			if (!src.ended && !src.stopped) {
				if (forceShorten || this.offline) {
					src.stopped = true;
					try {
						src.node.stop(stopAt);
					} catch {
						// The source may already have stopped or ended on the audio thread.
					}
				} else {
					this.scheduleSourceStop(voice, src, stopAt);
				}
			}
		}
	}

	private cleanupVoice(voice: SynthVoice): void {
		if (voice.cleaned) return;
		voice.cleaned = true;
		for (const src of voice.sources) {
			if (src.stopTimer !== undefined) {
				clearTimeout(src.stopTimer);
				src.stopTimer = undefined;
			}
			src.node.onended = null;
			if (!src.ended) {
				if (!src.stopped) {
					src.stopped = true;
					try {
						src.node.stop();
					} catch {
						// The source may already have ended before its queued onended callback.
					}
				}
				src.node.disconnect();
			}
			src.ended = true;
		}
		for (const link of voice.detachLinks) {
			try {
				link.from.disconnect(link.to as AudioNode);
			} catch {
				// Ignore if already disconnected or mock doesn't implement selective disconnect.
			}
		}
		for (const g of voice.modGains) g.disconnect();
		for (const node of voice.cleanupNodes) node.disconnect();
		this.voices.delete(voice.id);
		if (!this.offline && this.voices.size === 0 && !this.disposed) {
			this.stopGlobalModulators(this.currentTime, false);
		}
	}
}

export function buildSynthOfflineGraph(
	context: BaseAudioContext,
	options: SynthOfflineGraphOptions = {}
): SynthOfflineGraph {
	const core = new SynthGraphCore(context, {
		offline: true,
		patch: options.patch,
		volume: options.volume ?? 0.65,
		masterGainScale: options.masterGain ?? PIANO_MASTER_GAIN,
		pitchBendRange: options.pitchBendRange,
		enabled: true
	});
	return {
		get patch() {
			return core.patch;
		},
		get activeCount() {
			return core.activeCount;
		},
		get currentTime() {
			return core.currentTime;
		},
		hasVoice: (id: string) => core.hasVoice(id),
		noteOn: (pitch: number, velocity?: number, at?: number, patchOverride?: SynthPatch) =>
			core.noteOn(pitch, velocity, at, patchOverride),
		noteOff: (voiceId: string, at?: number) => core.noteOff(voiceId, at),
		scheduleNote: (
			pitch: number,
			velocity: number,
			at: number,
			duration: number,
			patchOverride?: SynthPatch
		) => core.scheduleNote(pitch, velocity, at, duration, patchOverride),
		setPatch: (patch: SynthPatch, at?: number) => core.setPatch(patch, at),
		setSustain: (value: boolean, at?: number) => core.setSustain(value, at),
		setPitchBend: (norm: number, at?: number) => core.setPitchBend(norm, at),
		setModWheel: (norm: number, at?: number) => core.setModWheel(norm, at),
		setVolume: (value: number, at?: number) => core.setVolume(value, at),
		dispose: () => core.dispose()
	};
}

/**
 * Per-instrument owned Web Audio synthesizer. Construction is inert, including during SSR.
 * Twenty playable voices (six in Unison) plus stealing/release tails up to twenty-four node voices.
 */
export class SynthAudio {
	private readonly contextFactory: () => AudioContext;
	private readonly options: SynthAudioOptions;
	private readonly playbackOwner: object;
	private audioContext: AudioContext | null = null;
	private core: SynthGraphCore | null = null;
	private currentPatch: SynthPatch;
	private volume = 0.65;
	private muted = false;
	private sustain = false;
	private pitchBendNorm = 0;
	private modWheelNorm = 0;
	private enabled = false;
	private disposed = false;
	private generation = 0;

	constructor(options: SynthAudioOptions = {}) {
		this.options = options;
		this.contextFactory = options.contextFactory ?? browserAudioContext;
		this.currentPatch = validateSynthPatch(options.patch ?? FACTORY_PRESETS[0]);
		this.playbackOwner = options.playbackOwner ?? this;
	}

	get ready(): boolean {
		return !this.disposed && this.enabled && this.audioContext?.state === 'running';
	}

	/** Includes release tails, rather than pretending disconnected ownership means no audio nodes. */
	get activeCount(): number {
		return this.core?.activeCount ?? 0;
	}

	/** Transport schedulers read this clock; frame/performance clocks do not schedule sound. */
	get currentTime(): number {
		return this.audioContext?.currentTime ?? 0;
	}

	get context(): AudioContext | null {
		return this.audioContext;
	}

	get patch(): SynthPatch {
		return this.core ? this.core.patch : this.currentPatch;
	}

	hasVoice(id: string): boolean {
		return this.core?.hasVoice(id) ?? false;
	}

	/** Call directly inside a user gesture: context construction occurs before the first await. */
	async enable(): Promise<void> {
		if (this.disposed) throw new Error('This piano has been disposed.');
		const generation = ++this.generation;
		if (!this.audioContext) {
			const ctx = this.contextFactory();
			this.audioContext = ctx;
			this.core = new SynthGraphCore(ctx, {
				offline: false,
				patch: this.currentPatch,
				volume: this.volume,
				pitchBendRange: this.options.pitchBendRange,
				enabled: false
			});
			this.core.setMuted(this.muted);
			this.core.setSustain(this.sustain);
			this.core.setPitchBend(this.pitchBendNorm);
			this.core.setModWheel(this.modWheelNorm);
		}
		const context = this.audioContext;
		if (context.state === 'closed') throw new Error('The piano audio context is closed.');
		try {
			if (context.state !== 'running') await context.resume();
		} catch (error) {
			if (this.disposed || generation !== this.generation) return;
			this.enabled = false;
			this.core?.setEnabled(false);
			releasePlayback(this.playbackOwner);
			throw error;
		}
		if (this.disposed || generation !== this.generation) return;
		if (context.state !== 'running') {
			this.enabled = false;
			this.core?.setEnabled(false);
			releasePlayback(this.playbackOwner);
			throw new Error('Sound is still suspended. Try Enable sound again.');
		}
		claimPlayback(this.playbackOwner, this.handleExternalStop);
		this.enabled = true;
		this.core?.setEnabled(true);
	}

	/** Returns an empty ID for silent mode, invalid pitches, zero velocity or momentary capacity. */
	noteOn(pitch: number, velocity = 0.75, at?: number, patchOverride?: SynthPatch): string {
		if (!this.ready || !this.core) return '';
		if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) return '';
		if (unit(velocity) === 0) return '';
		const id = this.core.noteOn(pitch, velocity, at, patchOverride);
		if (id) claimPlayback(this.playbackOwner, this.handleExternalStop);
		return id;
	}

	/** Bounded audio-clock lookahead for optional accompaniment; there is no delayed timer queue. */
	scheduleNote(
		pitch: number,
		velocity: number,
		at: number,
		duration: number,
		patchOverride?: SynthPatch
	): string {
		if (!this.ready || !this.core) return '';
		if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) return '';
		if (!Number.isFinite(at) || !Number.isFinite(duration) || unit(velocity) === 0) return '';
		const id = this.core.scheduleNote(pitch, velocity, at, duration, patchOverride);
		if (id) claimPlayback(this.playbackOwner, this.handleExternalStop);
		return id;
	}

	noteOff(id: string, at?: number): void {
		this.core?.noteOff(id, at);
	}

	setSustain(value: boolean): void {
		this.sustain = Boolean(value);
		this.core?.setSustain(this.sustain);
	}

	setVolume(value: number): void {
		this.volume = unit(value);
		this.core?.setVolume(this.volume);
	}

	setMuted(value: boolean): void {
		this.muted = Boolean(value);
		this.core?.setMuted(this.muted);
	}

	setPatch(patch: SynthPatch): void {
		const validated = validateSynthPatch(patch);
		this.currentPatch = validated;
		this.core?.setPatch(validated);
	}

	setPitchBend(norm: number): void {
		this.pitchBendNorm = clamp(norm, -1, 1, 0);
		this.core?.setPitchBend(this.pitchBendNorm);
	}

	setModWheel(norm: number): void {
		this.modWheelNorm = unit(norm, 0);
		this.core?.setModWheel(this.modWheelNorm);
	}

	getAnalyserData(
		timeDomain?: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>,
		freq?: Uint8Array<ArrayBuffer>
	): boolean {
		if (!this.ready || !this.core) return false;
		return this.core.getAnalyserData(timeDomain, freq);
	}

	/** Keeps an already enabled instrument playable, while invalidating unfinished activation. */
	stopAll(): void {
		this.generation++;
		this.sustain = false;
		releasePlayback(this.playbackOwner);
		this.core?.stopAll();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.enabled = false;
		this.generation++;
		this.sustain = false;
		releasePlayback(this.playbackOwner);
		this.core?.dispose();
		this.core = null;
		const context = this.audioContext;
		this.audioContext = null;
		if (context && context.state !== 'closed') void context.close().catch(() => {});
	}

	private readonly handleExternalStop = (): void => {
		this.options.onExternalStop?.();
		this.stopAll();
	};
}

export const PianoAudio = SynthAudio;
export type PianoAudio = SynthAudio;
