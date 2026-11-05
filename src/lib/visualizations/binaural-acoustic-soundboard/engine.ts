import { claimPlayback, releasePlayback } from '$lib/components/blog/tts/playback';
import {
	BINAURAL_BASE_HZ,
	CHANNEL_DEFINITIONS,
	CHANNEL_IDS,
	DEFAULT_MASTER_VOLUME,
	STARTING_PRESETS,
	TIMER_FADE_SECONDS,
	TIMER_OPTIONS,
	channelLinearGain,
	clampDifferenceHz,
	clampMasterVolume,
	cloneMix,
	isChannelAudible,
	resolveBinauralFrequencies,
	synthesizeProceduralFanChannels,
	synthesizeProceduralNoiseChannels,
	type ChannelId,
	type NoiseColor,
	type SoundboardMix,
	type TimerMinutes
} from './sounds';

export type SoundboardStatus = 'stopped' | 'loading' | 'playing' | 'error';

export interface SoundboardState {
	status: SoundboardStatus;
	mix: SoundboardMix;
	masterVolume: number;
	masterMuted: boolean;
	sleepEndsAt: number | null;
	sleepMinutes: TimerMinutes;
	fadingOut: boolean;
	loadingChannels: ChannelId[];
	unavailableChannels: ChannelId[];
	channelErrors: Partial<Record<ChannelId, string>>;
	error: string;
}

export interface AudioParamLike {
	value: number;
	setValueAtTime(value: number, startTime: number): void;
	linearRampToValueAtTime(value: number, endTime: number): void;
	cancelScheduledValues(startTime: number): void;
}

export interface AudioNodeLike {
	connect(destination: unknown, output?: number, input?: number): unknown;
	disconnect(): void;
	channelCount?: number;
	channelCountMode?: string;
	channelInterpretation?: string;
}

export interface GainNodeLike extends AudioNodeLike {
	gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
	type: OscillatorType;
	frequency: AudioParamLike;
	start(when?: number): void;
	stop(when?: number): void;
}

export interface AudioBufferLike {
	readonly duration: number;
	readonly length: number;
	readonly numberOfChannels: number;
	readonly sampleRate: number;
	getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
	buffer: AudioBufferLike | null;
	loop: boolean;
	loopStart?: number;
	loopEnd?: number;
	playbackRate: AudioParamLike;
	start(when?: number, offset?: number): void;
	stop(when?: number): void;
}

export interface AnalyserNodeLike extends AudioNodeLike {
	fftSize: number;
	getByteTimeDomainData(array: Uint8Array): void;
	getFloatTimeDomainData?(array: Float32Array): void;
}

export interface AudioContextLike {
	readonly currentTime: number;
	readonly sampleRate: number;
	readonly state: 'suspended' | 'running' | 'closed' | string;
	readonly destination: unknown;
	resume(): Promise<void>;
	suspend?(): Promise<void>;
	close(): Promise<void>;
	createGain(): GainNodeLike;
	createOscillator(): OscillatorNodeLike;
	createChannelMerger(numberOfInputs?: number): AudioNodeLike;
	createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
	createBufferSource(): AudioBufferSourceNodeLike;
	createAnalyser(): AnalyserNodeLike;
	decodeAudioData(audioData: ArrayBuffer): Promise<AudioBufferLike>;
}

export interface SoundboardEngineOptions {
	createContext?: () => AudioContextLike;
	fetchAsset?: (url: string) => Promise<ArrayBuffer>;
	now?: () => number;
}

function configureStereoNode(node: AudioNodeLike) {
	try {
		node.channelCount = 2;
		node.channelCountMode = 'explicit';
		node.channelInterpretation = 'speakers';
	} catch {
		/* optional in lightweight test doubles */
	}
}

function rampParam(param: AudioParamLike, target: number, now: number, durationSec = 0.045) {
	param.cancelScheduledValues(now);
	param.setValueAtTime(param.value, now);
	if (durationSec <= 0) {
		param.setValueAtTime(target, now);
	} else {
		param.linearRampToValueAtTime(target, now + durationSec);
	}
}

function defaultCreateContext(): AudioContextLike {
	const Ctor =
		typeof window !== 'undefined'
			? (window.AudioContext ??
				(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
			: undefined;
	if (!Ctor) {
		throw new Error('Web Audio is not available in this browser.');
	}
	return new Ctor() as unknown as AudioContextLike;
}

async function defaultFetchAsset(url: string): Promise<ArrayBuffer> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return await response.arrayBuffer();
}

export function isWebAudioSupported(): boolean {
	if (typeof window === 'undefined') return true;
	return Boolean(
		window.AudioContext ||
			(window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
	);
}

/**
 * Build a pure stereo binaural + ambient mix on a supplied BaseAudioContext or
 * OfflineAudioContext for deterministic audio-rendering tests.
 */
export function buildOfflineTestGraph(
	ctx: Pick<
		AudioContextLike,
		| 'currentTime'
		| 'sampleRate'
		| 'destination'
		| 'createGain'
		| 'createOscillator'
		| 'createChannelMerger'
		| 'createBuffer'
		| 'createBufferSource'
	>,
	mix: SoundboardMix,
	options: {
		masterVolume?: number;
		masterMuted?: boolean;
		durationSeconds?: number;
		timerFadeRemainingSeconds?: number | null;
	} = {}
) {
	const now = ctx.currentTime;
	const masterVolume = clampMasterVolume(options.masterVolume ?? 1, 1);
	const masterMuted = Boolean(options.masterMuted);
	const durationSeconds = options.durationSeconds ?? 1;

	const mixBus = ctx.createGain();
	const masterGain = ctx.createGain();
	const timerFadeGain = ctx.createGain();
	configureStereoNode(mixBus);
	configureStereoNode(masterGain);
	configureStereoNode(timerFadeGain);

	mixBus.gain.setValueAtTime(1, now);
	masterGain.gain.setValueAtTime(masterMuted ? 0 : masterVolume, now);
	timerFadeGain.gain.setValueAtTime(1, now);

	if (
		typeof options.timerFadeRemainingSeconds === 'number' &&
		Number.isFinite(options.timerFadeRemainingSeconds)
	) {
		const rem = Math.max(0, options.timerFadeRemainingSeconds);
		if (rem <= 0) {
			timerFadeGain.gain.setValueAtTime(0, now);
		} else if (rem <= TIMER_FADE_SECONDS) {
			timerFadeGain.gain.setValueAtTime(rem / TIMER_FADE_SECONDS, now);
			timerFadeGain.gain.linearRampToValueAtTime(0, now + rem);
		} else {
			timerFadeGain.gain.setValueAtTime(1, now);
			timerFadeGain.gain.setValueAtTime(1, now + (rem - TIMER_FADE_SECONDS));
			timerFadeGain.gain.linearRampToValueAtTime(0, now + rem);
		}
	}

	mixBus.connect(masterGain);
	masterGain.connect(timerFadeGain);
	timerFadeGain.connect(ctx.destination);

	// Binaural tones routed strictly to Left (0) and Right (1) via ChannelMergerNode(2)
	const binauralGain = ctx.createGain();
	configureStereoNode(binauralGain);
	binauralGain.gain.setValueAtTime(
		channelLinearGain('binaural', mix.channels.binaural.level, mix.channels.binaural.muted),
		now
	);
	const merger = ctx.createChannelMerger(2);
	const leftOsc = ctx.createOscillator();
	const rightOsc = ctx.createOscillator();
	const leftGain = ctx.createGain();
	const rightGain = ctx.createGain();
	const freqs = resolveBinauralFrequencies(mix.binauralDifferenceHz, BINAURAL_BASE_HZ);

	leftOsc.type = 'sine';
	rightOsc.type = 'sine';
	leftOsc.frequency.setValueAtTime(freqs.leftHz, now);
	rightOsc.frequency.setValueAtTime(freqs.rightHz, now);
	leftGain.gain.setValueAtTime(0.5, now);
	rightGain.gain.setValueAtTime(0.5, now);

	leftOsc.connect(leftGain);
	rightOsc.connect(rightGain);
	leftGain.connect(merger, 0, 0);
	rightGain.connect(merger, 0, 1);
	merger.connect(binauralGain);
	binauralGain.connect(mixBus);
	leftOsc.start(now);
	rightOsc.start(now);
	leftOsc.stop(now + durationSeconds);
	rightOsc.stop(now + durationSeconds);

	// Procedural Fan
	if (isChannelAudible(mix.channels.fan)) {
		const [fanL, fanR] = synthesizeProceduralFanChannels(
			ctx.sampleRate,
			Math.max(1.5, durationSeconds)
		);
		const fanBuf = ctx.createBuffer(2, fanL.length, ctx.sampleRate);
		fanBuf.getChannelData(0).set(fanL);
		fanBuf.getChannelData(1).set(fanR);
		const fanSrc = ctx.createBufferSource();
		fanSrc.buffer = fanBuf;
		fanSrc.loop = true;
		const fanGain = ctx.createGain();
		configureStereoNode(fanGain);
		fanGain.gain.setValueAtTime(
			channelLinearGain('fan', mix.channels.fan.level, mix.channels.fan.muted),
			now
		);
		fanSrc.connect(fanGain);
		fanGain.connect(mixBus);
		fanSrc.start(now);
		fanSrc.stop(now + durationSeconds);
	}

	// Procedural Soft noise (Brown / Pink)
	if (isChannelAudible(mix.channels.noise)) {
		const [noiseL, noiseR] = synthesizeProceduralNoiseChannels(
			mix.noiseColor,
			ctx.sampleRate,
			Math.max(1.5, durationSeconds)
		);
		const noiseBuf = ctx.createBuffer(2, noiseL.length, ctx.sampleRate);
		noiseBuf.getChannelData(0).set(noiseL);
		noiseBuf.getChannelData(1).set(noiseR);
		const noiseSrc = ctx.createBufferSource();
		noiseSrc.buffer = noiseBuf;
		noiseSrc.loop = true;
		const noiseGain = ctx.createGain();
		configureStereoNode(noiseGain);
		noiseGain.gain.setValueAtTime(
			channelLinearGain('noise', mix.channels.noise.level, mix.channels.noise.muted),
			now
		);
		noiseSrc.connect(noiseGain);
		noiseGain.connect(mixBus);
		noiseSrc.start(now);
		noiseSrc.stop(now + durationSeconds);
	}

	return {
		freqs,
		mixBus,
		masterGain,
		timerFadeGain,
		binauralGain
	};
}

interface ActiveLoopPair {
	primary: AudioBufferSourceNodeLike;
	secondary: AudioBufferSourceNodeLike;
	secondaryGain: GainNodeLike;
}

export function createSoundboardEngine(
	onChange: (state: SoundboardState) => void,
	options: SoundboardEngineOptions = {}
) {
	const createContext = options.createContext ?? defaultCreateContext;
	const fetchAsset = options.fetchAsset ?? defaultFetchAsset;
	const getNow = options.now ?? (() => Date.now());

	const owner = {};
	let state: SoundboardState = {
		status: 'stopped',
		mix: cloneMix(STARTING_PRESETS.reading.mix),
		masterVolume: DEFAULT_MASTER_VOLUME,
		masterMuted: false,
		sleepEndsAt: null,
		sleepMinutes: 0,
		fadingOut: false,
		loadingChannels: [],
		unavailableChannels: [],
		channelErrors: {},
		error: ''
	};

	let ctx: AudioContextLike | null = null;
	let mixBusGain: GainNodeLike | null = null;
	let masterVolumeGain: GainNodeLike | null = null;
	let timerFadeGain: GainNodeLike | null = null;
	let analyser: AnalyserNodeLike | null = null;
	let channelGains: Partial<Record<ChannelId, GainNodeLike>> = {};

	// Active procedural / binaural nodes for the current playback session
	let binauralLeftOsc: OscillatorNodeLike | null = null;
	let binauralRightOsc: OscillatorNodeLike | null = null;
	let binauralMerger: AudioNodeLike | null = null;
	let binauralLeftGain: GainNodeLike | null = null;
	let binauralRightGain: GainNodeLike | null = null;

	let fanSourcePair: ActiveLoopPair | null = null;
	let brownSource: AudioBufferSourceNodeLike | null = null;
	let pinkSource: AudioBufferSourceNodeLike | null = null;
	let brownSubGain: GainNodeLike | null = null;
	let pinkSubGain: GainNodeLike | null = null;

	let recordedSourcePairs: Partial<Record<'rain' | 'city', ActiveLoopPair>> = {};
	const decodedBufferCache = new Map<ChannelId, AudioBufferLike>();
	let proceduralBuffers: {
		fan?: AudioBufferLike;
		brown?: AudioBufferLike;
		pink?: AudioBufferLike;
	} = {};
	const inFlightLoads = new Map<ChannelId, Promise<AudioBufferLike | null>>();

	let revision = 0;
	let destroyed = false;
	let sleepTimeout: ReturnType<typeof setTimeout> | undefined;
	let fadeNoticeTimeout: ReturnType<typeof setTimeout> | undefined;
	let timeDomainBytes: Uint8Array | null = null;
	let timeDomainFloats: Float32Array | null = null;

	function emit(patch: Partial<SoundboardState> = {}) {
		state = {
			...state,
			...patch,
			mix: patch.mix ? cloneMix(patch.mix) : cloneMix(state.mix),
			loadingChannels: [...(patch.loadingChannels ?? state.loadingChannels)],
			unavailableChannels: [...(patch.unavailableChannels ?? state.unavailableChannels)],
			channelErrors: { ...(patch.channelErrors ?? state.channelErrors) }
		};
		if (!destroyed) onChange(state);
	}

	function clearSleepTimers() {
		if (sleepTimeout !== undefined) {
			clearTimeout(sleepTimeout);
			sleepTimeout = undefined;
		}
		if (fadeNoticeTimeout !== undefined) {
			clearTimeout(fadeNoticeTimeout);
			fadeNoticeTimeout = undefined;
		}
	}

	function stopLoopPair(pair: ActiveLoopPair | null | undefined) {
		if (!pair) return;
		try {
			pair.primary.stop();
		} catch {
			/* already stopped */
		}
		try {
			pair.secondary.stop();
		} catch {
			/* already stopped */
		}
		try {
			pair.primary.disconnect();
			pair.secondary.disconnect();
			pair.secondaryGain.disconnect();
		} catch {
			/* ignore */
		}
	}

	function teardownActiveSources() {
		revision++;
		inFlightLoads.clear();

		if (binauralLeftOsc) {
			try {
				binauralLeftOsc.stop();
				binauralLeftOsc.disconnect();
			} catch {
				/* ignore */
			}
			binauralLeftOsc = null;
		}
		if (binauralRightOsc) {
			try {
				binauralRightOsc.stop();
				binauralRightOsc.disconnect();
			} catch {
				/* ignore */
			}
			binauralRightOsc = null;
		}
		binauralLeftGain?.disconnect();
		binauralRightGain?.disconnect();
		binauralMerger?.disconnect();
		binauralLeftGain = null;
		binauralRightGain = null;
		binauralMerger = null;

		stopLoopPair(fanSourcePair);
		fanSourcePair = null;

		if (brownSource) {
			try {
				brownSource.stop();
				brownSource.disconnect();
			} catch {
				/* ignore */
			}
			brownSource = null;
		}
		if (pinkSource) {
			try {
				pinkSource.stop();
				pinkSource.disconnect();
			} catch {
				/* ignore */
			}
			pinkSource = null;
		}
		brownSubGain?.disconnect();
		pinkSubGain?.disconnect();
		brownSubGain = null;
		pinkSubGain = null;

		stopLoopPair(recordedSourcePairs.rain);
		stopLoopPair(recordedSourcePairs.city);
		recordedSourcePairs = {};

		for (const id of CHANNEL_IDS) {
			channelGains[id]?.disconnect();
		}
		channelGains = {};

		mixBusGain?.disconnect();
		masterVolumeGain?.disconnect();
		timerFadeGain?.disconnect();
		analyser?.disconnect();
		mixBusGain = null;
		masterVolumeGain = null;
		timerFadeGain = null;
		analyser = null;
	}

	function createLoopPairFromBuffer(
		audioCtx: AudioContextLike,
		buffer: AudioBufferLike,
		destination: GainNodeLike,
		secondaryRate = 0.93,
		secondaryGainLevel = 0.25
	): ActiveLoopPair {
		const primary = audioCtx.createBufferSource();
		primary.buffer = buffer;
		primary.loop = true;
		primary.playbackRate.setValueAtTime(1, audioCtx.currentTime);
		primary.connect(destination);

		const secondary = audioCtx.createBufferSource();
		secondary.buffer = buffer;
		secondary.loop = true;
		secondary.playbackRate.setValueAtTime(secondaryRate, audioCtx.currentTime);

		const secondaryGain = audioCtx.createGain();
		configureStereoNode(secondaryGain);
		secondaryGain.gain.setValueAtTime(secondaryGainLevel, audioCtx.currentTime);
		secondary.connect(secondaryGain);
		secondaryGain.connect(destination);

		const offset = buffer.duration > 1 ? buffer.duration * 0.47 : 0;
		primary.start(audioCtx.currentTime, 0);
		secondary.start(audioCtx.currentTime, offset);

		return { primary, secondary, secondaryGain };
	}

	function ensureProceduralBuffers(audioCtx: AudioContextLike) {
		if (!proceduralBuffers.fan) {
			const [fanL, fanR] = synthesizeProceduralFanChannels(audioCtx.sampleRate, 6.0);
			const buf = audioCtx.createBuffer(2, fanL.length, audioCtx.sampleRate);
			buf.getChannelData(0).set(fanL);
			buf.getChannelData(1).set(fanR);
			proceduralBuffers.fan = buf;
		}
		if (!proceduralBuffers.brown) {
			const [brownL, brownR] = synthesizeProceduralNoiseChannels('brown', audioCtx.sampleRate, 6.5);
			const buf = audioCtx.createBuffer(2, brownL.length, audioCtx.sampleRate);
			buf.getChannelData(0).set(brownL);
			buf.getChannelData(1).set(brownR);
			proceduralBuffers.brown = buf;
		}
		if (!proceduralBuffers.pink) {
			const [pinkL, pinkR] = synthesizeProceduralNoiseChannels('pink', audioCtx.sampleRate, 6.5);
			const buf = audioCtx.createBuffer(2, pinkL.length, audioCtx.sampleRate);
			buf.getChannelData(0).set(pinkL);
			buf.getChannelData(1).set(pinkR);
			proceduralBuffers.pink = buf;
		}
	}

	/**
	 * Schedule or reconcile the dedicated 10-second timer fade gain stage on the
	 * Web Audio timeline so moving the master volume dial cannot override it.
	 */
	function scheduleTimerFadeAutomation() {
		clearSleepTimers();
		if (state.sleepEndsAt === null) {
			if (ctx && timerFadeGain) {
				rampParam(timerFadeGain.gain, 1, ctx.currentTime, 0.06);
			}
			if (state.fadingOut) emit({ fadingOut: false });
			return;
		}

		const remainingMs = state.sleepEndsAt - getNow();
		if (remainingMs <= 0) {
			if (ctx && timerFadeGain) {
				timerFadeGain.gain.cancelScheduledValues(ctx.currentTime);
				timerFadeGain.gain.setValueAtTime(0, ctx.currentTime);
			}
			stop();
			return;
		}

		const remainingSec = remainingMs / 1000;
		const fadeWindowMs = TIMER_FADE_SECONDS * 1000;

		if (ctx && timerFadeGain) {
			const now = ctx.currentTime;
			timerFadeGain.gain.cancelScheduledValues(now);
			if (remainingSec <= TIMER_FADE_SECONDS) {
				const currentFadeGain = Math.max(0, Math.min(1, remainingSec / TIMER_FADE_SECONDS));
				timerFadeGain.gain.setValueAtTime(currentFadeGain, now);
				timerFadeGain.gain.linearRampToValueAtTime(0, now + remainingSec);
			} else {
				const fadeStartOffsetSec = remainingSec - TIMER_FADE_SECONDS;
				timerFadeGain.gain.setValueAtTime(1, now);
				timerFadeGain.gain.setValueAtTime(1, now + fadeStartOffsetSec);
				timerFadeGain.gain.linearRampToValueAtTime(0, now + remainingSec);
			}
		}

		if (remainingMs <= fadeWindowMs) {
			if (!state.fadingOut) emit({ fadingOut: true });
		} else {
			if (state.fadingOut) emit({ fadingOut: false });
			fadeNoticeTimeout = setTimeout(() => {
				if (!destroyed && state.sleepEndsAt !== null) {
					emit({ fadingOut: true });
					// Reconcile Web Audio automation at the exact start of the 10s fade window
					if (ctx && timerFadeGain) {
						const remSec = Math.max(0, (state.sleepEndsAt - getNow()) / 1000);
						const now = ctx.currentTime;
						timerFadeGain.gain.cancelScheduledValues(now);
						timerFadeGain.gain.setValueAtTime(Math.min(1, remSec / TIMER_FADE_SECONDS), now);
						timerFadeGain.gain.linearRampToValueAtTime(0, now + remSec);
					}
				}
			}, remainingMs - fadeWindowMs);
		}

		sleepTimeout = setTimeout(() => {
			if (!destroyed) stop();
		}, remainingMs);
	}

	async function ensureRecordedChannelLoaded(
		channelId: 'rain' | 'city',
		sessionToken: number
	): Promise<void> {
		if (destroyed || sessionToken !== revision || !ctx) return;
		const channelGain = channelGains[channelId];
		if (!channelGain) return;
		if (recordedSourcePairs[channelId]) return;

		const cached = decodedBufferCache.get(channelId);
		if (cached) {
			recordedSourcePairs[channelId] = createLoopPairFromBuffer(
				ctx,
				cached,
				channelGain,
				channelId === 'rain' ? 0.93 : 0.91,
				0.26
			);
			return;
		}

		let pending = inFlightLoads.get(channelId);
		if (!pending) {
			const assetUrl = CHANNEL_DEFINITIONS[channelId].assetUrl;
			if (!assetUrl) return;
			const loadingSet = new Set(state.loadingChannels);
			loadingSet.add(channelId);
			emit({
				loadingChannels: [...loadingSet],
				status: state.status === 'playing' ? 'playing' : 'loading'
			});

			const activeCtx = ctx;
			pending = (async () => {
				try {
					const bytes = await fetchAsset(assetUrl);
					if (destroyed || sessionToken !== revision) return null;
					const decoded = await activeCtx.decodeAudioData(bytes.slice(0));
					if (destroyed || sessionToken !== revision) return null;
					decodedBufferCache.set(channelId, decoded);
					return decoded;
				} catch {
					if (!destroyed && sessionToken === revision) {
						const unavailable = new Set(state.unavailableChannels);
						unavailable.add(channelId);
						const nextErrors = {
							...state.channelErrors,
							[channelId]: `${CHANNEL_DEFINITIONS[channelId].name} audio could not be loaded. Other channels remain usable.`
						};
						emit({
							unavailableChannels: [...unavailable],
							channelErrors: nextErrors
						});
					}
					return null;
				} finally {
					inFlightLoads.delete(channelId);
					if (!destroyed && sessionToken === revision) {
						const nextLoading = state.loadingChannels.filter((id) => id !== channelId);
						emit({
							loadingChannels: nextLoading,
							status:
								state.status === 'loading' && nextLoading.length === 0 ? 'playing' : state.status
						});
					}
				}
			})();
			inFlightLoads.set(channelId, pending);
		}

		const buffer = await pending;
		if (
			buffer &&
			!destroyed &&
			sessionToken === revision &&
			ctx &&
			channelGains[channelId] &&
			!recordedSourcePairs[channelId]
		) {
			const nextUnavailable = state.unavailableChannels.filter((id) => id !== channelId);
			const nextErrors = { ...state.channelErrors };
			delete nextErrors[channelId];
			recordedSourcePairs[channelId] = createLoopPairFromBuffer(
				ctx,
				buffer,
				channelGains[channelId]!,
				channelId === 'rain' ? 0.93 : 0.91,
				0.26
			);
			emit({
				unavailableChannels: nextUnavailable,
				channelErrors: nextErrors,
				status: state.loadingChannels.length === 0 ? 'playing' : state.status
			});
		}
	}

	function syncAudibleRecordedChannels(sessionToken: number): Promise<void[]> {
		if (!ctx || (state.status !== 'playing' && state.status !== 'loading')) {
			return Promise.resolve([]);
		}
		const tasks: Promise<void>[] = [];
		for (const id of ['rain', 'city'] as const) {
			if (isChannelAudible(state.mix.channels[id]) && !state.unavailableChannels.includes(id)) {
				tasks.push(ensureRecordedChannelLoaded(id, sessionToken));
			}
		}
		return Promise.all(tasks);
	}

	function applyMixToAudioGraph(durationSec = 0.045) {
		if (!ctx) return;
		const now = ctx.currentTime;

		for (const id of CHANNEL_IDS) {
			const gainNode = channelGains[id];
			if (!gainNode) continue;
			const ch = state.mix.channels[id];
			const targetGain = channelLinearGain(id, ch.level, ch.muted);
			rampParam(gainNode.gain, targetGain, now, durationSec);
		}

		if (brownSubGain && pinkSubGain) {
			const isPink = state.mix.noiseColor === 'pink';
			rampParam(brownSubGain.gain, isPink ? 0 : 1, now, 0.06);
			rampParam(pinkSubGain.gain, isPink ? 1 : 0, now, 0.06);
		}

		if (binauralLeftOsc && binauralRightOsc) {
			const freqs = resolveBinauralFrequencies(state.mix.binauralDifferenceHz, BINAURAL_BASE_HZ);
			rampParam(binauralLeftOsc.frequency, freqs.leftHz, now, 0.05);
			rampParam(binauralRightOsc.frequency, freqs.rightHz, now, 0.05);
		}

		syncAudibleRecordedChannels(revision);
	}

	async function play() {
		if (destroyed) return;
		// Check if sleep timer already expired before starting
		if (state.sleepEndsAt !== null && getNow() >= state.sleepEndsAt) {
			emit({ sleepEndsAt: null, sleepMinutes: 0, fadingOut: false });
		}

		teardownActiveSources();
		claimPlayback(owner, stop);
		const sessionToken = revision;

		try {
			if (!ctx || ctx.state === 'closed') {
				ctx = createContext();
				proceduralBuffers = {};
				decodedBufferCache.clear();
			}

			const audioCtx = ctx;
			ensureProceduralBuffers(audioCtx);
			const now = audioCtx.currentTime;

			mixBusGain = audioCtx.createGain();
			masterVolumeGain = audioCtx.createGain();
			timerFadeGain = audioCtx.createGain();
			analyser = audioCtx.createAnalyser();
			analyser.fftSize = 256;

			configureStereoNode(mixBusGain);
			configureStereoNode(masterVolumeGain);
			configureStereoNode(timerFadeGain);

			mixBusGain.gain.setValueAtTime(1, now);
			masterVolumeGain.gain.setValueAtTime(state.masterMuted ? 0 : state.masterVolume, now);
			timerFadeGain.gain.setValueAtTime(1, now);

			mixBusGain.connect(masterVolumeGain);
			masterVolumeGain.connect(timerFadeGain);
			timerFadeGain.connect(analyser);
			analyser.connect(audioCtx.destination);

			// Create individual channel gain stages
			for (const id of CHANNEL_IDS) {
				const chGain = audioCtx.createGain();
				configureStereoNode(chGain);
				const chState = state.mix.channels[id];
				chGain.gain.setValueAtTime(channelLinearGain(id, chState.level, chState.muted), now);
				chGain.connect(mixBusGain);
				channelGains[id] = chGain;
			}

			// 1. Procedural Fan channel
			if (proceduralBuffers.fan && channelGains.fan) {
				fanSourcePair = createLoopPairFromBuffer(
					audioCtx,
					proceduralBuffers.fan,
					channelGains.fan,
					0.94,
					0.24
				);
			}

			// 2. Procedural Soft noise channel (Brown & Pink dual sources with crossfade sub-gains)
			if (proceduralBuffers.brown && proceduralBuffers.pink && channelGains.noise) {
				brownSubGain = audioCtx.createGain();
				pinkSubGain = audioCtx.createGain();
				configureStereoNode(brownSubGain);
				configureStereoNode(pinkSubGain);
				const isPink = state.mix.noiseColor === 'pink';
				brownSubGain.gain.setValueAtTime(isPink ? 0 : 1, now);
				pinkSubGain.gain.setValueAtTime(isPink ? 1 : 0, now);

				brownSource = audioCtx.createBufferSource();
				brownSource.buffer = proceduralBuffers.brown;
				brownSource.loop = true;
				brownSource.connect(brownSubGain);
				brownSubGain.connect(channelGains.noise);
				brownSource.start(now);

				pinkSource = audioCtx.createBufferSource();
				pinkSource.buffer = proceduralBuffers.pink;
				pinkSource.loop = true;
				pinkSource.connect(pinkSubGain);
				pinkSubGain.connect(channelGains.noise);
				pinkSource.start(now);
			}

			// 3. Binaural tones channel: explicit Left (channel 0) and Right (channel 1) via ChannelMergerNode(2)
			if (channelGains.binaural) {
				const freqs = resolveBinauralFrequencies(state.mix.binauralDifferenceHz, BINAURAL_BASE_HZ);
				binauralMerger = audioCtx.createChannelMerger(2);
				binauralLeftOsc = audioCtx.createOscillator();
				binauralRightOsc = audioCtx.createOscillator();
				binauralLeftGain = audioCtx.createGain();
				binauralRightGain = audioCtx.createGain();

				binauralLeftOsc.type = 'sine';
				binauralRightOsc.type = 'sine';
				binauralLeftOsc.frequency.setValueAtTime(freqs.leftHz, now);
				binauralRightOsc.frequency.setValueAtTime(freqs.rightHz, now);
				binauralLeftGain.gain.setValueAtTime(0.5, now);
				binauralRightGain.gain.setValueAtTime(0.5, now);

				binauralLeftOsc.connect(binauralLeftGain);
				binauralRightOsc.connect(binauralRightGain);
				binauralLeftGain.connect(binauralMerger, 0, 0);
				binauralRightGain.connect(binauralMerger, 0, 1);
				binauralMerger.connect(channelGains.binaural);

				binauralLeftOsc.start(now);
				binauralRightOsc.start(now);
			}

			// Schedule timer fade automation if a sleep timer is active
			scheduleTimerFadeAutomation();

			const needsRecordedLoad = (['rain', 'city'] as const).some(
				(id) => isChannelAudible(state.mix.channels[id]) && !decodedBufferCache.has(id)
			);
			emit({
				status: needsRecordedLoad ? 'loading' : 'playing',
				error: '',
				unavailableChannels: [],
				channelErrors: {}
			});

			if (audioCtx.state === 'suspended') {
				await audioCtx.resume();
			}
			if (destroyed || sessionToken !== revision) return;

			await syncAudibleRecordedChannels(sessionToken);
			if (destroyed || sessionToken !== revision) return;
			if (state.loadingChannels.length === 0) {
				emit({ status: 'playing', error: '' });
			}
		} catch (error) {
			if (destroyed || sessionToken !== revision) return;
			teardownActiveSources();
			clearSleepTimers();
			releasePlayback(owner);
			const message =
				error instanceof Error && error.name === 'NotAllowedError'
					? 'Your browser blocked audio start. Press Play again to listen.'
					: 'Audio could not be started in this browser.';
			emit({
				status: 'error',
				error: message,
				sleepEndsAt: null,
				sleepMinutes: 0,
				fadingOut: false,
				loadingChannels: []
			});
		}
	}

	function stop() {
		teardownActiveSources();
		clearSleepTimers();
		releasePlayback(owner);
		if (ctx && ctx.state === 'running' && typeof ctx.suspend === 'function') {
			void ctx.suspend().catch(() => {});
		}
		emit({
			status: 'stopped',
			error: '',
			sleepEndsAt: null,
			sleepMinutes: 0,
			fadingOut: false,
			loadingChannels: []
		});
	}

	function setMix(nextMix: SoundboardMix, options: { rampSeconds?: number } = {}) {
		emit({ mix: cloneMix(nextMix) });
		if (state.status === 'playing' || state.status === 'loading') {
			applyMixToAudioGraph(options.rampSeconds ?? 0.08);
		}
	}

	function setChannelLevel(channelId: ChannelId, level: number) {
		const prev = state.mix.channels[channelId];
		const clamped = Math.round(Math.min(100, Math.max(0, level)));
		const savedLevel =
			clamped > 0
				? clamped
				: prev.savedLevel || CHANNEL_DEFINITIONS[channelId].defaultUnmuteLevel;
		const nextMix: SoundboardMix = {
			...state.mix,
			channels: {
				...state.mix.channels,
				[channelId]: {
					level: clamped,
					muted: clamped > 0 ? false : prev.muted,
					savedLevel
				}
			}
		};
		emit({ mix: nextMix });
		if (state.status === 'playing' || state.status === 'loading') {
			applyMixToAudioGraph(0.045);
		}
	}

	function setChannelMuted(channelId: ChannelId, muted: boolean) {
		const prev = state.mix.channels[channelId];
		const defaultLevel = CHANNEL_DEFINITIONS[channelId].defaultUnmuteLevel;
		const savedLevel =
			prev.level > 0 ? prev.level : prev.savedLevel > 0 ? prev.savedLevel : defaultLevel;
		const nextLevel = !muted && prev.level === 0 ? savedLevel : prev.level;
		const nextMix: SoundboardMix = {
			...state.mix,
			channels: {
				...state.mix.channels,
				[channelId]: {
					level: nextLevel,
					muted,
					savedLevel
				}
			}
		};
		emit({ mix: nextMix });
		if (state.status === 'playing' || state.status === 'loading') {
			applyMixToAudioGraph(0.045);
		}
	}

	function setNoiseColor(color: NoiseColor) {
		if (color !== 'brown' && color !== 'pink') return;
		const nextMix: SoundboardMix = {
			...state.mix,
			noiseColor: color
		};
		emit({ mix: nextMix });
		if (state.status === 'playing' || state.status === 'loading') {
			applyMixToAudioGraph(0.06);
		}
	}

	function setBinauralDifferenceHz(differenceHz: number) {
		const clamped = clampDifferenceHz(differenceHz, state.mix.binauralDifferenceHz);
		const nextMix: SoundboardMix = {
			...state.mix,
			binauralDifferenceHz: clamped
		};
		emit({ mix: nextMix });
		if (state.status === 'playing' || state.status === 'loading') {
			applyMixToAudioGraph(0.05);
		}
	}

	function setMasterVolume(volume: number) {
		if (!Number.isFinite(volume)) return;
		const clamped = clampMasterVolume(volume, state.masterVolume);
		const nextMuted = clamped > 0 ? false : state.masterMuted;
		emit({ masterVolume: clamped, masterMuted: nextMuted });
		if (ctx && masterVolumeGain) {
			rampParam(masterVolumeGain.gain, nextMuted ? 0 : clamped, ctx.currentTime, 0.045);
		}
	}

	function setMasterMuted(muted: boolean) {
		emit({ masterMuted: Boolean(muted) });
		if (ctx && masterVolumeGain) {
			rampParam(
				masterVolumeGain.gain,
				muted ? 0 : state.masterVolume,
				ctx.currentTime,
				0.045
			);
		}
	}

	function setSleep(minutes: TimerMinutes) {
		const validMinutes = TIMER_OPTIONS.includes(minutes) ? minutes : 0;
		const endsAt = validMinutes > 0 ? getNow() + validMinutes * 60_000 : null;
		emit({
			sleepMinutes: validMinutes,
			sleepEndsAt: endsAt,
			fadingOut: false
		});
		scheduleTimerFadeAutomation();
	}

	function checkSleep() {
		if (state.sleepEndsAt === null) return;
		if (getNow() >= state.sleepEndsAt) {
			// Immediately zero the dedicated timer fade gain before a suspended context can become audible
			if (ctx && timerFadeGain) {
				timerFadeGain.gain.cancelScheduledValues(ctx.currentTime);
				timerFadeGain.gain.setValueAtTime(0, ctx.currentTime);
			}
			stop();
		} else {
			scheduleTimerFadeAutomation();
		}
	}

	function retryChannel(channelId: 'rain' | 'city') {
		const nextUnavailable = state.unavailableChannels.filter((id) => id !== channelId);
		const nextErrors = { ...state.channelErrors };
		delete nextErrors[channelId];
		emit({
			unavailableChannels: nextUnavailable,
			channelErrors: nextErrors
		});
		if (state.status === 'playing' || state.status === 'loading') {
			void ensureRecordedChannelLoaded(channelId, revision);
		}
	}

	function getOutputLevel(): number {
		if (state.status !== 'playing' || state.masterMuted || !analyser) return 0;
		if (typeof analyser.getFloatTimeDomainData === 'function') {
			if (!timeDomainFloats || timeDomainFloats.length !== analyser.fftSize) {
				timeDomainFloats = new Float32Array(analyser.fftSize);
			}
			analyser.getFloatTimeDomainData(timeDomainFloats);
			let sumSq = 0;
			for (let i = 0; i < timeDomainFloats.length; i++) {
				sumSq += timeDomainFloats[i] * timeDomainFloats[i];
			}
			const rms = Math.sqrt(sumSq / timeDomainFloats.length);
			return Math.min(1, rms * 4.5);
		}
		if (!timeDomainBytes || timeDomainBytes.length !== analyser.fftSize) {
			timeDomainBytes = new Uint8Array(analyser.fftSize);
		}
		analyser.getByteTimeDomainData(timeDomainBytes);
		let sumSq = 0;
		for (let i = 0; i < timeDomainBytes.length; i++) {
			const norm = (timeDomainBytes[i] - 128) / 128;
			sumSq += norm * norm;
		}
		const rms = Math.sqrt(sumSq / timeDomainBytes.length);
		return Math.min(1, rms * 4.5);
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('pageshow', checkSleep);
		window.addEventListener('pagehide', stop);
		document.addEventListener('visibilitychange', checkSleep);
	}

	onChange({ ...state, mix: cloneMix(state.mix) });

	return {
		play,
		stop,
		setMix,
		setChannelLevel,
		setChannelMuted,
		setNoiseColor,
		setBinauralDifferenceHz,
		setMasterVolume,
		setMasterMuted,
		setSleep,
		checkSleep,
		retryChannel,
		getOutputLevel,
		getState: () => ({ ...state, mix: cloneMix(state.mix) }),
		destroy() {
			stop();
			destroyed = true;
			if (ctx && ctx.state !== 'closed') {
				void ctx.close().catch(() => {});
			}
			ctx = null;
			if (typeof window !== 'undefined') {
				window.removeEventListener('pageshow', checkSleep);
				window.removeEventListener('pagehide', stop);
				document.removeEventListener('visibilitychange', checkSleep);
			}
		}
	};
}
