import type { DopplerVector3 } from './DopplerSource';

export type SoundscapeAssetKey =
	| 'cityBed'
	| 'lowLayer'
	| 'middleLayer'
	| 'highLayer'
	| 'wind'
	| 'paperFlutter'
	| 'nearMiss'
	| 'taxiHorn'
	| 'busHorn'
	| 'tramBell'
	| 'ferryHorn'
	| 'train';

export type MajorAudioEventKind = 'taxi-horn' | 'bus-horn' | 'tram-bell' | 'ferry-horn' | 'train';

export interface MajorAudioEvent {
	readonly id: string;
	readonly kind: MajorAudioEventKind;
	readonly district: string;
	readonly atSeconds: number;
	readonly gain: number;
	readonly pan: number;
	readonly distance: 'near' | 'middle' | 'distant';
}

export interface MajorAudioScheduleOptions {
	readonly seed: string | number;
	readonly district: string;
	readonly durationSeconds: number;
	readonly startsAtSeconds?: number;
	readonly minimumGapSeconds?: number;
	readonly maximumGapSeconds?: number;
}

export interface AltitudeSoundWeights {
	readonly low: number;
	readonly middle: number;
	readonly high: number;
}

export interface SoundscapeUpdate {
	readonly simulationTimeSeconds: number;
	readonly altitudeM: number;
	/** 0 is open air; 1 is close to architecture even when flying high beside a tower. */
	readonly closeFlight?: number;
	readonly apparentWindMps?: number | DopplerVector3;
	/** Camera-right dot apparent-wind direction, already normalised to -1..1. */
	readonly windPan?: number;
	readonly listenerPosition?: DopplerVector3;
	readonly listenerForward?: DopplerVector3;
	readonly listenerUp?: DopplerVector3;
}

export interface SpatialSoundOptions {
	readonly position?: DopplerVector3;
	readonly gain?: number;
	readonly playbackRate?: number;
	readonly priority?: number;
	readonly occluded?: boolean;
	readonly lowpassHz?: number;
	readonly caption?: string;
	readonly whenSeconds?: number;
}

export interface SoundscapeActivationOptions {
	readonly audible?: boolean;
	readonly context?: AudioContext;
	readonly ownsContext?: boolean;
}

export type SoundscapeBufferLoader = (
	url: string,
	context: AudioContext,
	signal: AbortSignal
) => Promise<AudioBuffer>;

export interface SoundscapeOptions {
	/** Storing an injected context is inert; the graph is built only by activateFromUserGesture(). */
	readonly context?: AudioContext;
	readonly ownsContext?: boolean;
	readonly contextFactory?: () => AudioContext;
	readonly assets?: Partial<Record<SoundscapeAssetKey, string>>;
	readonly bufferLoader?: SoundscapeBufferLoader;
	readonly maxVoices?: number;
	readonly initialVoiceLimit?: number;
	readonly masterVolume?: number;
	readonly onCaption?: (caption: string) => void;
}

export interface SoundscapeDebugSnapshot {
	readonly contextConstructed: boolean;
	readonly contextState: AudioContextState | 'unavailable';
	readonly graphConstructed: boolean;
	readonly activated: boolean;
	readonly silentMode: boolean;
	readonly muted: boolean;
	readonly paused: boolean;
	readonly destroyed: boolean;
	readonly activeVoices: number;
	readonly voiceLimit: number;
	readonly loadedAssets: readonly SoundscapeAssetKey[];
	readonly altitudeWeights: AltitudeSoundWeights;
	readonly scheduledEventCursor: number;
	readonly scheduledEventCount: number;
}

interface SoundscapeGraph {
	readonly master: GainNode;
	readonly limiter: DynamicsCompressorNode;
	readonly buses: Readonly<{
		city: GainNode;
		low: GainNode;
		middle: GainNode;
		high: GainNode;
		wind: GainNode;
		paper: GainNode;
		effects: GainNode;
	}>;
	readonly altitudeFilters: readonly [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode];
	readonly windFilter: BiquadFilterNode;
	readonly windPanner: StereoPannerNode | null;
}

interface LoopSource {
	readonly key: SoundscapeAssetKey;
	readonly source: AudioBufferSourceNode;
}

interface VoiceSlot {
	readonly index: number;
	readonly filter: BiquadFilterNode;
	readonly panner: PannerNode;
	readonly gain: GainNode;
	source: AudioBufferSourceNode | null;
	priority: number;
	startedAt: number;
}

export const DEFAULT_SOUNDSCAPE_ASSETS = Object.freeze({
	cityBed: '/games/kagojer-dana/audio/calcutta-bed.wav'
} as const satisfies Partial<Record<SoundscapeAssetKey, string>>);

const MAJOR_ASSET_KEYS: Readonly<Record<MajorAudioEventKind, SoundscapeAssetKey>> = {
	'taxi-horn': 'taxiHorn',
	'bus-horn': 'busHorn',
	'tram-bell': 'tramBell',
	'ferry-horn': 'ferryHorn',
	train: 'train'
};

const MAJOR_CAPTIONS: Readonly<Record<MajorAudioEventKind, string>> = {
	'taxi-horn': 'Taxi horn',
	'bus-horn': 'Bus horn',
	'tram-bell': 'Tram bell',
	'ferry-horn': 'Ferry horn',
	train: 'Train'
};

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
	return amount * amount * (3 - 2 * amount);
}

function finiteNonNegative(value: number, fallback = 0): number {
	return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function hashString(value: string): number {
	let hash = 2_166_136_261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x7feb352d);
	hash ^= hash >>> 15;
	hash = Math.imul(hash, 0x846ca68b);
	hash ^= hash >>> 16;
	return hash >>> 0;
}

function deterministicUnit(seed: string | number, namespace: string): number {
	return hashString(`${String(seed)}\u241f${namespace}`) / 4_294_967_296;
}

function kindsForDistrict(district: string): readonly MajorAudioEventKind[] {
	const id = district.toLowerCase();
	if (id.includes('hooghly') || id.includes('river')) return ['ferry-horn', 'train'];
	if (id.includes('esplanade') || id.includes('college')) {
		return ['tram-bell', 'bus-horn', 'taxi-horn'];
	}
	if (id.includes('park')) return ['taxi-horn', 'bus-horn'];
	if (id.includes('new-town') || id.includes('new town')) return ['bus-horn', 'taxi-horn'];
	if (id.includes('maidan')) return ['train', 'taxi-horn'];
	return ['taxi-horn', 'bus-horn'];
}

/** Major events use one namespace per slot, so unrelated birds or props cannot move them. */
export function createMajorAudioSchedule(
	options: MajorAudioScheduleOptions
): readonly MajorAudioEvent[] {
	const duration = finiteNonNegative(options.durationSeconds);
	const startsAt = finiteNonNegative(options.startsAtSeconds ?? 0);
	const minimumGap = clamp(finiteNonNegative(options.minimumGapSeconds ?? 18, 18), 8, 60);
	const maximumGap = Math.max(
		minimumGap,
		clamp(finiteNonNegative(options.maximumGapSeconds ?? 32, 32), minimumGap, 90)
	);
	const kinds = kindsForDistrict(options.district);
	const events: MajorAudioEvent[] = [];
	let localTime = 7 + deterministicUnit(options.seed, `audio/${options.district}/opening`) * 8;
	for (let index = 0; localTime < duration; index += 1) {
		const kindIndex = Math.floor(
			deterministicUnit(options.seed, `audio/${options.district}/kind/${index}`) * kinds.length
		);
		const kind = kinds[kindIndex] ?? kinds[0];
		const pan =
			deterministicUnit(options.seed, `audio/${options.district}/pan/${index}`) * 1.6 - 0.8;
		const distanceUnit = deterministicUnit(
			options.seed,
			`audio/${options.district}/distance/${index}`
		);
		const distance = distanceUnit < 0.2 ? 'near' : distanceUnit < 0.67 ? 'middle' : 'distant';
		events.push({
			id: `${options.district}-major-${index}`,
			kind,
			district: options.district,
			atSeconds: startsAt + localTime,
			gain:
				0.24 + deterministicUnit(options.seed, `audio/${options.district}/gain/${index}`) * 0.18,
			pan,
			distance
		});
		const gapUnit = deterministicUnit(options.seed, `audio/${options.district}/gap/${index}`);
		localTime += minimumGap + gapUnit * (maximumGap - minimumGap);
	}
	return Object.freeze(events);
}

export function majorAudioScheduleSignature(events: readonly MajorAudioEvent[]): string {
	return hashString(
		events
			.map(
				(event) =>
					`${event.id}:${event.kind}:${event.atSeconds.toFixed(4)}:${event.pan.toFixed(4)}:${event.gain.toFixed(4)}`
			)
			.join('|')
	)
		.toString(16)
		.padStart(8, '0');
}

/**
 * Smooth, normalised crossfades around 28 m and 150 m. closeFlight reintroduces local detail beside
 * high towers, preserving the brief's rule that altitude alone does not determine intimacy.
 */
export function altitudeSoundWeights(altitudeM: number, closeFlight = 0): AltitudeSoundWeights {
	const altitude = finiteNonNegative(altitudeM);
	const lowToMiddle = smoothstep(18, 42, altitude);
	const middleToHigh = smoothstep(112, 188, altitude);
	let low = 1 - lowToMiddle;
	let middle = lowToMiddle * (1 - middleToHigh);
	let high = middleToHigh;
	let total = low + middle + high;
	low /= total;
	middle /= total;
	high /= total;

	const intimacy = clamp(Number.isFinite(closeFlight) ? closeFlight : 0, 0, 1);
	if (intimacy > 0) {
		low = low * (1 - intimacy) + 0.55 * intimacy;
		middle = middle * (1 - intimacy) + 0.4 * intimacy;
		high = high * (1 - intimacy) + 0.05 * intimacy;
		total = low + middle + high;
		low /= total;
		middle /= total;
		high /= total;
	}
	return { low, middle, high };
}

function browserAudioContextFactory(): AudioContext {
	if (typeof window === 'undefined') {
		throw new Error('Web Audio can be activated only in a browser from an explicit user gesture.');
	}
	const Constructor =
		window.AudioContext ??
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Constructor) throw new Error('Web Audio is unavailable in this browser.');
	return new Constructor({ latencyHint: 'interactive' });
}

async function browserBufferLoader(
	url: string,
	context: AudioContext,
	signal: AbortSignal
): Promise<AudioBuffer> {
	const response = await fetch(url, { signal, credentials: 'same-origin' });
	if (!response.ok) throw new Error(`Could not load soundscape asset (${response.status}).`);
	const encoded = await response.arrayBuffer();
	return context.decodeAudioData(encoded.slice(0));
}

function setParam(
	parameter: AudioParam,
	value: number,
	at: number,
	smoothingSeconds: number
): void {
	parameter.setTargetAtTime(value, Math.max(0, at), Math.max(0.001, smoothingSeconds));
}

function magnitude(value: number | DopplerVector3 | undefined): number {
	if (typeof value === 'number') return finiteNonNegative(value);
	if (!value) return 0;
	return Math.hypot(value.x, value.y, value.z);
}

function setListener(context: AudioContext, update: SoundscapeUpdate): void {
	const listener = context.listener;
	const now = context.currentTime;
	const position = update.listenerPosition;
	const forward = update.listenerForward;
	const up = update.listenerUp;
	if (position && 'positionX' in listener) {
		setParam(listener.positionX, position.x, now, 0.04);
		setParam(listener.positionY, position.y, now, 0.04);
		setParam(listener.positionZ, position.z, now, 0.04);
	} else if (position && 'setPosition' in listener) {
		(
			listener as AudioListener & { setPosition(x: number, y: number, z: number): void }
		).setPosition(position.x, position.y, position.z);
	}
	if (forward && up && 'forwardX' in listener) {
		setParam(listener.forwardX, forward.x, now, 0.05);
		setParam(listener.forwardY, forward.y, now, 0.05);
		setParam(listener.forwardZ, forward.z, now, 0.05);
		setParam(listener.upX, up.x, now, 0.05);
		setParam(listener.upY, up.y, now, 0.05);
		setParam(listener.upZ, up.z, now, 0.05);
	} else if (forward && up && 'setOrientation' in listener) {
		(
			listener as AudioListener & {
				setOrientation(
					fx: number,
					fy: number,
					fz: number,
					ux: number,
					uy: number,
					uz: number
				): void;
			}
		).setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
	}
}

/**
 * Central, user-gesture-owned Web Audio manager. Construction and silent activation are inert:
 * neither creates an AudioContext nor invokes the asset loader.
 */
export class Soundscape {
	private readonly contextFactory: () => AudioContext;
	private readonly bufferLoader: SoundscapeBufferLoader;
	private readonly assets: Partial<Record<SoundscapeAssetKey, string>>;
	private readonly maxVoices: number;
	private readonly onCaption?: (caption: string) => void;
	private readonly masterVolume: number;
	private context: AudioContext | null;
	private ownsContext: boolean;
	private graph: SoundscapeGraph | null = null;
	private voiceSlots: VoiceSlot[] = [];
	private voiceLimit: number;
	private readonly buffers = new Map<SoundscapeAssetKey, AudioBuffer>();
	private readonly loops: LoopSource[] = [];
	private readonly abortController = new AbortController();
	private loadingPromise: Promise<void> | null = null;
	private schedule: readonly MajorAudioEvent[] = [];
	private scheduleCursor = 0;
	private lastSimulationTime = 0;
	private weights: AltitudeSoundWeights = { low: 1, middle: 0, high: 0 };
	private lastCaptionAt = Number.NEGATIVE_INFINITY;
	private activated = false;
	private silentMode = false;
	private muted = false;
	private paused = true;
	private destroyed = false;

	constructor(options: SoundscapeOptions = {}) {
		this.contextFactory = options.contextFactory ?? browserAudioContextFactory;
		this.bufferLoader = options.bufferLoader ?? browserBufferLoader;
		this.assets = { ...DEFAULT_SOUNDSCAPE_ASSETS, ...options.assets };
		this.maxVoices = Math.round(clamp(options.maxVoices ?? 8, 1, 16));
		this.voiceLimit = Math.round(
			clamp(options.initialVoiceLimit ?? this.maxVoices, 1, this.maxVoices)
		);
		this.masterVolume = clamp(options.masterVolume ?? 0.68, 0, 0.8);
		this.onCaption = options.onCaption;
		this.context = options.context ?? null;
		this.ownsContext = options.ownsContext ?? true;
	}

	/** Adopts the synchronously primed user-gesture context before activation builds any nodes. */
	attachContext(context: AudioContext, options: { ownsContext?: boolean } = {}): void {
		this.ensureUsable();
		if (this.graph || this.activated) {
			throw new Error('Attach the soundscape AudioContext before activating its graph.');
		}
		if (this.context && this.context !== context) {
			throw new Error('A different AudioContext is already attached to this soundscape.');
		}
		this.context = context;
		this.ownsContext = options.ownsContext ?? true;
	}

	/**
	 * Explicit activation boundary. Call it directly from Fly with Calcutta sound. Passing audible:
	 * false is the silent start path and returns before context construction or asset loading.
	 */
	async activateFromUserGesture(options: SoundscapeActivationOptions = {}): Promise<boolean> {
		this.ensureUsable();
		if (options.audible === false) {
			this.silentMode = true;
			this.muted = true;
			this.paused = false;
			return false;
		}
		this.silentMode = false;
		if (options.context) {
			this.attachContext(options.context, { ownsContext: options.ownsContext ?? true });
		}
		// Context construction and graph creation intentionally happen synchronously before the first
		// await so the browser's transient user-activation token is still alive.
		if (!this.context) {
			this.context = this.contextFactory();
			this.ownsContext = true;
		}
		if (this.context.state === 'closed') throw new Error('The soundscape AudioContext is closed.');
		if (!this.graph) this.initialiseGraph(this.context);
		this.activated = true;
		this.muted = false;
		this.paused = false;
		const resumePromise =
			this.context.state === 'suspended' ? this.context.resume() : Promise.resolve();
		this.loadingPromise ??= this.loadConfiguredAssets(this.context);
		await Promise.all([resumePromise, this.loadingPromise]);
		this.applyMasterGain();
		return this.context.state === 'running';
	}

	/** Alias for controller code that uses start() for every lifecycle subsystem. */
	start(options: SoundscapeActivationOptions = {}): Promise<boolean> {
		return this.activateFromUserGesture(options);
	}

	setMajorSchedule(events: readonly MajorAudioEvent[], simulationTimeSeconds = 0): void {
		this.schedule = [...events].sort(
			(left, right) => left.atSeconds - right.atSeconds || left.id.localeCompare(right.id)
		);
		this.seekSchedule(simulationTimeSeconds);
	}

	setDistrictSchedule(options: MajorAudioScheduleOptions): readonly MajorAudioEvent[] {
		const schedule = createMajorAudioSchedule(options);
		this.setMajorSchedule(schedule, options.startsAtSeconds ?? 0);
		return schedule;
	}

	seekSchedule(simulationTimeSeconds: number): void {
		const time = finiteNonNegative(simulationTimeSeconds);
		this.lastSimulationTime = time;
		this.scheduleCursor = this.schedule.findIndex((event) => event.atSeconds >= time);
		if (this.scheduleCursor < 0) this.scheduleCursor = this.schedule.length;
	}

	update(update: SoundscapeUpdate): AltitudeSoundWeights {
		this.weights = altitudeSoundWeights(update.altitudeM, update.closeFlight);
		const context = this.context;
		const graph = this.graph;
		if (!context || !graph || !this.activated || this.silentMode || this.destroyed) {
			this.lastSimulationTime = finiteNonNegative(update.simulationTimeSeconds);
			return this.weights;
		}
		const now = context.currentTime;
		setParam(graph.buses.low.gain, this.weights.low * 0.32, now, 0.32);
		setParam(graph.buses.middle.gain, this.weights.middle * 0.29, now, 0.32);
		setParam(graph.buses.high.gain, this.weights.high * 0.28, now, 0.32);

		const apparentWind = magnitude(update.apparentWindMps);
		const windAmount = smoothstep(2.5, 22, apparentWind);
		setParam(graph.buses.wind.gain, 0.025 + windAmount * 0.25, now, 0.09);
		setParam(graph.windFilter.frequency, 650 + windAmount * 5_200, now, 0.08);
		setParam(graph.buses.paper.gain, 0.02 + windAmount * 0.2, now, 0.07);
		if (graph.windPanner) {
			setParam(graph.windPanner.pan, clamp(update.windPan ?? 0, -0.65, 0.65), now, 0.09);
		}
		setListener(context, update);
		this.dispatchScheduledEvents(finiteNonNegative(update.simulationTimeSeconds));
		return this.weights;
	}

	playOneShot(key: SoundscapeAssetKey, options: SpatialSoundOptions = {}): boolean {
		if (
			this.destroyed ||
			this.silentMode ||
			this.paused ||
			this.muted ||
			!this.context ||
			!this.graph
		) {
			return false;
		}
		const buffer = this.buffers.get(key);
		if (!buffer) return false;
		const priority = Number.isFinite(options.priority) ? Number(options.priority) : 0;
		const slot = this.acquireVoice(priority);
		if (!slot) return false;
		this.releaseVoice(slot);
		const context = this.context;
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = false;
		source.playbackRate.value = clamp(options.playbackRate ?? 1, 0.92, 1.08);
		source.connect(slot.filter);
		const occluded = options.occluded === true;
		const gain = clamp(options.gain ?? 0.34, 0, 0.75) * (occluded ? 0.5 : 1);
		setParam(slot.gain.gain, gain, context.currentTime, 0.015);
		setParam(
			slot.filter.frequency,
			occluded ? clamp(options.lowpassHz ?? 1_800, 1_200, 2_500) : (options.lowpassHz ?? 12_000),
			context.currentTime,
			0.06
		);
		if (options.position) {
			setParam(slot.panner.positionX, options.position.x, context.currentTime, 0.025);
			setParam(slot.panner.positionY, options.position.y, context.currentTime, 0.025);
			setParam(slot.panner.positionZ, options.position.z, context.currentTime, 0.025);
		}
		slot.source = source;
		slot.priority = priority;
		slot.startedAt = context.currentTime;
		const release = () => {
			if (slot.source === source) this.releaseVoice(slot);
		};
		source.addEventListener('ended', release, { once: true });
		source.start(Math.max(context.currentTime, options.whenSeconds ?? context.currentTime));
		if (options.caption) this.emitCaption(options.caption, this.lastSimulationTime);
		return true;
	}

	playNearMiss(options: SpatialSoundOptions = {}): boolean {
		return this.playOneShot('nearMiss', { priority: 5, ...options });
	}

	setVoiceLimit(limit: number): number {
		this.voiceLimit = Math.round(
			clamp(Number.isFinite(limit) ? limit : this.voiceLimit, 1, this.maxVoices)
		);
		for (const slot of this.voiceSlots) {
			if (slot.index >= this.voiceLimit && slot.source) this.releaseVoice(slot);
		}
		return this.voiceLimit;
	}

	setMuted(muted: boolean): boolean {
		this.muted = Boolean(muted);
		this.applyMasterGain();
		return this.muted;
	}

	async pause(): Promise<void> {
		if (this.destroyed || this.paused) return;
		this.paused = true;
		this.applyMasterGain();
		if (this.context?.state === 'running') await this.context.suspend().catch(() => undefined);
	}

	async resume(): Promise<boolean> {
		this.ensureUsable();
		if (!this.context || !this.graph || !this.activated || this.silentMode) return false;
		if (this.context.state === 'closed') return false;
		if (this.context.state === 'suspended') await this.context.resume().catch(() => undefined);
		this.paused = false;
		this.applyMasterGain();
		return this.context.state === 'running';
	}

	debugSnapshot(): SoundscapeDebugSnapshot {
		return {
			contextConstructed: this.context !== null,
			contextState: this.context?.state ?? 'unavailable',
			graphConstructed: this.graph !== null,
			activated: this.activated,
			silentMode: this.silentMode,
			muted: this.muted,
			paused: this.paused,
			destroyed: this.destroyed,
			activeVoices: this.voiceSlots.filter((slot) => slot.source !== null).length,
			voiceLimit: this.voiceLimit,
			loadedAssets: [...this.buffers.keys()].sort(),
			altitudeWeights: { ...this.weights },
			scheduledEventCursor: this.scheduleCursor,
			scheduledEventCount: this.schedule.length
		};
	}

	async destroy(): Promise<void> {
		if (this.destroyed) return;
		this.destroyed = true;
		this.abortController.abort();
		for (const slot of this.voiceSlots) {
			this.releaseVoice(slot);
			slot.filter.disconnect();
			slot.panner.disconnect();
			slot.gain.disconnect();
		}
		this.voiceSlots = [];
		for (const loop of this.loops) {
			try {
				loop.source.stop();
			} catch {
				// A failed asset start or closed context may already have stopped the node.
			}
			loop.source.disconnect();
		}
		this.loops.length = 0;
		if (this.graph) {
			for (const filter of this.graph.altitudeFilters) filter.disconnect();
			this.graph.windFilter.disconnect();
			this.graph.windPanner?.disconnect();
			for (const bus of Object.values(this.graph.buses)) bus.disconnect();
			this.graph.master.disconnect();
			this.graph.limiter.disconnect();
			this.graph = null;
		}
		this.buffers.clear();
		const context = this.context;
		this.context = null;
		this.activated = false;
		this.paused = true;
		if (context && this.ownsContext && context.state !== 'closed') {
			await context.close().catch(() => undefined);
		}
	}

	private initialiseGraph(context: AudioContext): void {
		const master = context.createGain();
		const limiter = context.createDynamicsCompressor();
		limiter.threshold.value = -10;
		limiter.knee.value = 3;
		limiter.ratio.value = 12;
		limiter.attack.value = 0.003;
		limiter.release.value = 0.24;
		master.gain.value = 0;
		master.connect(limiter);
		limiter.connect(context.destination);

		const city = context.createGain();
		const low = context.createGain();
		const middle = context.createGain();
		const high = context.createGain();
		const wind = context.createGain();
		const paper = context.createGain();
		const effects = context.createGain();
		city.gain.value = 0.16;
		low.gain.value = 0.32;
		middle.gain.value = 0;
		high.gain.value = 0;
		wind.gain.value = 0.025;
		paper.gain.value = 0.02;
		effects.gain.value = 0.72;

		const lowFilter = context.createBiquadFilter();
		lowFilter.type = 'lowpass';
		lowFilter.frequency.value = 3_200;
		const middleFilter = context.createBiquadFilter();
		middleFilter.type = 'bandpass';
		middleFilter.frequency.value = 1_450;
		middleFilter.Q.value = 0.35;
		const highFilter = context.createBiquadFilter();
		highFilter.type = 'highpass';
		highFilter.frequency.value = 480;
		lowFilter.connect(low);
		middleFilter.connect(middle);
		highFilter.connect(high);

		const windFilter = context.createBiquadFilter();
		windFilter.type = 'lowpass';
		windFilter.frequency.value = 650;
		const windPanner =
			typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
		if (windPanner) {
			windFilter.connect(windPanner);
			windPanner.connect(wind);
		} else {
			windFilter.connect(wind);
		}

		for (const bus of [city, low, middle, high, wind, paper, effects]) bus.connect(master);
		this.graph = {
			master,
			limiter,
			buses: { city, low, middle, high, wind, paper, effects },
			altitudeFilters: [lowFilter, middleFilter, highFilter],
			windFilter,
			windPanner
		};
		this.voiceSlots = Array.from({ length: this.maxVoices }, (_, index) => {
			const filter = context.createBiquadFilter();
			filter.type = 'lowpass';
			filter.frequency.value = 12_000;
			const panner = context.createPanner();
			panner.panningModel = 'HRTF';
			panner.distanceModel = 'inverse';
			panner.refDistance = 2;
			panner.maxDistance = 120;
			panner.rolloffFactor = 0.85;
			const gain = context.createGain();
			gain.gain.value = 0;
			filter.connect(panner);
			panner.connect(gain);
			gain.connect(effects);
			return { index, filter, panner, gain, source: null, priority: 0, startedAt: 0 };
		});
	}

	private async loadConfiguredAssets(context: AudioContext): Promise<void> {
		const entries = Object.entries(this.assets).filter(
			(entry): entry is [SoundscapeAssetKey, string] =>
				typeof entry[1] === 'string' && entry[1].length > 0
		);
		await Promise.all(
			entries.map(async ([key, url]) => {
				const buffer = await this.bufferLoader(url, context, this.abortController.signal);
				if (this.destroyed || this.abortController.signal.aborted) return;
				this.buffers.set(key, buffer);
				if (key === 'cityBed') this.startCityBed(context, buffer);
				else if (key === 'lowLayer') this.startLoop(context, key, buffer, this.graph?.buses.low);
				else if (key === 'middleLayer')
					this.startLoop(context, key, buffer, this.graph?.buses.middle);
				else if (key === 'highLayer') this.startLoop(context, key, buffer, this.graph?.buses.high);
				else if (key === 'wind') this.startLoop(context, key, buffer, this.graph?.windFilter);
				else if (key === 'paperFlutter')
					this.startLoop(context, key, buffer, this.graph?.buses.paper);
			})
		);
	}

	private startCityBed(context: AudioContext, buffer: AudioBuffer): void {
		if (!this.graph || this.loops.some((loop) => loop.key === 'cityBed')) return;
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		// One decoded/looping city bed feeds a restrained broad bed plus three filtered altitude
		// perspectives. This avoids three downloads and keeps loop timing phase-locked.
		source.connect(this.graph.buses.city);
		for (const filter of this.graph.altitudeFilters) source.connect(filter);
		source.start(context.currentTime);
		this.loops.push({ key: 'cityBed', source });
	}

	private startLoop(
		context: AudioContext,
		key: SoundscapeAssetKey,
		buffer: AudioBuffer,
		destination: AudioNode | undefined
	): void {
		if (!destination || this.loops.some((loop) => loop.key === key)) return;
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		source.connect(destination);
		source.start(context.currentTime);
		this.loops.push({ key, source });
	}

	private dispatchScheduledEvents(simulationTimeSeconds: number): void {
		if (simulationTimeSeconds < this.lastSimulationTime) this.seekSchedule(simulationTimeSeconds);
		while (
			this.scheduleCursor < this.schedule.length &&
			this.schedule[this.scheduleCursor].atSeconds <= simulationTimeSeconds
		) {
			const event = this.schedule[this.scheduleCursor];
			const distanceGain =
				event.distance === 'near' ? 1 : event.distance === 'middle' ? 0.72 : 0.48;
			const horizontal = event.pan * (event.distance === 'near' ? 14 : 36);
			this.playOneShot(MAJOR_ASSET_KEYS[event.kind], {
				position: { x: horizontal, y: event.kind === 'ferry-horn' ? -8 : 0, z: -24 },
				gain: event.gain * distanceGain,
				priority: 3,
				caption: `${MAJOR_CAPTIONS[event.kind]} — ${event.pan < -0.2 ? 'left' : event.pan > 0.2 ? 'right' : 'ahead'}, ${event.distance}`
			});
			this.scheduleCursor += 1;
		}
		this.lastSimulationTime = simulationTimeSeconds;
	}

	private acquireVoice(priority: number): VoiceSlot | null {
		const usable = this.voiceSlots.slice(0, this.voiceLimit);
		const free = usable.find((slot) => slot.source === null);
		if (free) return free;
		const quietest = usable.sort(
			(left, right) => left.priority - right.priority || left.startedAt - right.startedAt
		)[0];
		return quietest && priority > quietest.priority ? quietest : null;
	}

	private releaseVoice(slot: VoiceSlot): void {
		const source = slot.source;
		if (source) {
			try {
				source.stop();
			} catch {
				// The ended handler can race an explicit pool steal.
			}
			source.disconnect();
		}
		slot.source = null;
		slot.priority = 0;
		if (this.context) setParam(slot.gain.gain, 0, this.context.currentTime, 0.015);
	}

	private emitCaption(caption: string, atSeconds: number): void {
		if (!this.onCaption || !caption || atSeconds - this.lastCaptionAt < 2.5) return;
		this.lastCaptionAt = atSeconds;
		this.onCaption(caption);
	}

	private applyMasterGain(): void {
		if (!this.context || !this.graph) return;
		const audible = this.activated && !this.silentMode && !this.muted && !this.paused;
		setParam(
			this.graph.master.gain,
			audible ? this.masterVolume : 0,
			this.context.currentTime,
			0.035
		);
	}

	private ensureUsable(): void {
		if (this.destroyed) throw new Error('The soundscape has been destroyed.');
	}
}
