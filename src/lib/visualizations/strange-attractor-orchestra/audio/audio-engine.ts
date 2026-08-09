import type {
	AudioEngineDebugSnapshot,
	AudioIntensityMode,
	AudioObservationView,
	GuidedIntroAudioStage,
	SonicEvent,
	SoundWorldId,
	SoundWorldPatch
} from './contracts';
import {
	conductingKeepsEvent,
	INACTIVE_CONDUCTING_STATE,
	sanitizeConductingState,
	type ConductingState
} from './conducting';
import { createOrchestraMasterGraph, type OrchestraMasterGraph } from './graph-builder';
import { GuidedIntroTextureLayer } from './guided-texture';
import { AUDIO_OBSERVATION_TRANSITION_SECONDS, safeAudioObservationView } from './mapping';
import { safeSoundWorld, soundWorldPatch } from './patches';
import {
	AUDIO_PERFORMANCE_TRANSITION_SECONDS,
	applyAudioIntensityToPatch,
	audioIntensityTargets,
	guidedIntroAudioPolicy,
	intensityKeepsEvent,
	safeAudioIntensityMode,
	safeGuidedIntroAudioStage
} from './performance';
import { OrchestraLookaheadScheduler, type SchedulerTimerHost } from './scheduler';
import {
	AUDIO_INITIAL_VOLUME,
	AUDIO_MAX_VOICES,
	AUDIO_POST_COMPRESSOR_MAKEUP_GAIN,
	AUDIO_SCHEDULER_INTERVAL_MS,
	AUDIO_SCHEDULER_LOOKAHEAD_SECONDS,
	safeMasterVolume,
	safeVoiceCap
} from './safety';
import { OrchestraVoicePool, scheduleSonicEvent } from './voices';

type BrowserAudioContext = AudioContext;

export type AudioContextFactory = () => BrowserAudioContext;

export type VisibilityDocument = Pick<
	Document,
	'hidden' | 'addEventListener' | 'removeEventListener'
>;

export type OrchestraAudioEngineOptions = Readonly<{
	seed?: string | number;
	soundWorld?: SoundWorldId;
	volume?: number;
	observationView?: AudioObservationView;
	guidedIntroStage?: GuidedIntroAudioStage;
	intensityMode?: AudioIntensityMode;
	/** Maximum simultaneous resonator voices. Portrait callers should pass their mobile cap (2–3). */
	voiceCap?: number;
	contextFactory?: AudioContextFactory;
	timerHost?: SchedulerTimerHost;
	visibilityDocument?: VisibilityDocument | null;
}>;

function browserContextFactory(): BrowserAudioContext {
	if (typeof window === 'undefined') {
		throw new Error('Web Audio is available only in a browser after an explicit user gesture.');
	}
	const Constructor =
		window.AudioContext ??
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Constructor) throw new Error('Web Audio is unavailable in this browser.');
	return new Constructor({ latencyHint: 'interactive' });
}

function defaultVisibilityDocument(): VisibilityDocument | null {
	return typeof document === 'undefined' ? null : document;
}

/**
 * User-gesture-owned real-time audio engine.
 *
 * Constructing this class is inert: no AudioContext, oscillator, timer or listener is created
 * until start() is called directly by the experience's Start the instrument action.
 */
export class StrangeAttractorAudioEngine {
	private readonly contextFactory: AudioContextFactory;
	private readonly timerHost?: SchedulerTimerHost;
	private readonly visibilityDocument: VisibilityDocument | null;
	private context: BrowserAudioContext | null = null;
	private graph: OrchestraMasterGraph | null = null;
	private guidedTexture: GuidedIntroTextureLayer | null = null;
	private voices: OrchestraVoicePool | null = null;
	private scheduler: OrchestraLookaheadScheduler | null = null;
	private events: readonly SonicEvent[] = [];
	private seed: string | number;
	private world: SoundWorldId;
	private performancePatch: SoundWorldPatch;
	private observationView: AudioObservationView;
	private guidedIntroStage: GuidedIntroAudioStage;
	private intensityMode: AudioIntensityMode;
	private readonly voiceCap: number;
	private guidedShotFourVoiceScheduled = false;
	private volume: number;
	private playhead = 0;
	private playing = false;
	private muted = false;
	private visibilityPaused = false;
	private resumeAfterVisibility = false;
	private emergency = false;
	private conductingState: ConductingState = INACTIVE_CONDUCTING_STATE;
	private disposed = false;
	private visibilityListenerInstalled = false;

	constructor(options: OrchestraAudioEngineOptions = {}) {
		this.contextFactory = options.contextFactory ?? browserContextFactory;
		this.timerHost = options.timerHost;
		this.visibilityDocument = options.visibilityDocument ?? defaultVisibilityDocument();
		this.seed = options.seed ?? 'langford-1847';
		this.world = safeSoundWorld(options.soundWorld);
		this.intensityMode = safeAudioIntensityMode(options.intensityMode);
		this.performancePatch = applyAudioIntensityToPatch(
			soundWorldPatch(this.world),
			this.intensityMode
		);
		this.observationView = safeAudioObservationView(options.observationView);
		this.guidedIntroStage = safeGuidedIntroAudioStage(options.guidedIntroStage);
		this.voiceCap = safeVoiceCap(options.voiceCap ?? AUDIO_MAX_VOICES);
		this.volume = safeMasterVolume(options.volume ?? AUDIO_INITIAL_VOLUME);
	}

	setScore(events: readonly SonicEvent[], seed: string | number = this.seed): void {
		this.ensureNotDisposed();
		this.events = events.slice();
		this.seed = seed;
		if (!this.scheduler || !this.context || !this.voices) return;
		const now = this.context.currentTime;
		this.voices.cancelAfter(now + 0.002);
		this.scheduler.setEvents(this.events);
		this.scheduler.seek(this.playhead);
	}

	/** Explicit activation boundary. This is the only method that may construct AudioContext. */
	async start(options: { scorePosition?: number; audible?: boolean } = {}): Promise<void> {
		this.ensureNotDisposed();
		if (this.emergency) {
			throw new Error('Emergency silence is active; explicitly clear it before starting.');
		}
		if (!this.context) this.initializeAfterGesture();
		const context = this.requireContext();
		if (context.state === 'suspended') await context.resume();
		if (context.state === 'closed') throw new Error('The orchestra AudioContext is closed.');
		this.graph!.clearEmergencySilence(context.currentTime);
		if (options.audible !== undefined) this.muted = !options.audible;
		this.graph!.setTransportAudible(!this.muted, context.currentTime);
		this.playhead = Math.max(0, options.scorePosition ?? this.playhead);
		this.scheduler!.seek(this.playhead);
		this.scheduler!.play(this.playhead);
		this.playing = true;
		this.visibilityPaused = false;
	}

	pause(): number {
		if (!this.context || !this.scheduler || !this.graph || !this.voices) return this.playhead;
		const now = this.context.currentTime;
		this.playhead = this.scheduler.pause();
		this.voices.cancelAfter(now + 0.002);
		this.voices.stopAll(now, 0.035);
		this.graph.setTransportAudible(false, now, 0.035);
		this.playing = false;
		return this.playhead;
	}

	async resume(): Promise<void> {
		this.ensureNotDisposed();
		if (!this.context || !this.scheduler || !this.graph) {
			throw new Error('Call start() from a user gesture before resuming the orchestra.');
		}
		if (this.emergency) {
			throw new Error('Emergency silence is active; explicitly clear it before resuming.');
		}
		if (this.context.state === 'suspended') await this.context.resume();
		this.graph.setTransportAudible(!this.muted, this.context.currentTime);
		this.scheduler.play(this.playhead);
		this.playing = true;
		this.visibilityPaused = false;
	}

	seek(scorePosition: number): number {
		this.ensureNotDisposed();
		this.playhead = Math.max(0, Number.isFinite(scorePosition) ? scorePosition : 0);
		if (this.context && this.scheduler && this.voices) {
			const now = this.context.currentTime;
			this.voices.stopAll(now, 0.025);
			this.voices.cancelAfter(now + 0.001);
			this.scheduler.seek(this.playhead);
		}
		return this.playhead;
	}

	setPlaybackRate(rate: number): number {
		return this.scheduler?.setPlaybackRate(rate) ?? 1;
	}

	setVolume(value: number): number {
		this.volume = safeMasterVolume(value);
		this.graph?.setVolume(this.volume);
		return this.volume;
	}

	/** Persistent mute survives pause/resume, visibility changes and score replacement. */
	setMuted(value: boolean): boolean {
		this.muted = Boolean(value);
		if (this.context && this.graph && !this.emergency) {
			this.graph.setTransportAudible(this.playing && !this.muted, this.context.currentTime);
		}
		return this.muted;
	}

	toggleMuted(): boolean {
		return this.setMuted(!this.muted);
	}

	/** Ephemeral performance control. This state never enters the score, snapshot, or export. */
	setConducting(horizontal: number, vertical: number, active: boolean): ConductingState {
		this.ensureNotDisposed();
		this.conductingState = sanitizeConductingState(horizontal, vertical, active);
		this.graph?.setConducting(
			this.conductingState.horizontal,
			this.conductingState.vertical,
			this.conductingState.active
		);
		return this.conductingState;
	}

	setSoundWorld(value: SoundWorldId): SoundWorldId {
		this.ensureNotDisposed();
		const next = safeSoundWorld(value, this.world);
		if (next === this.world) return this.world;
		this.world = next;
		this.performancePatch = applyAudioIntensityToPatch(
			soundWorldPatch(this.world),
			this.intensityMode
		);
		if (!this.context || !this.graph || !this.voices || !this.scheduler) return this.world;

		const now = this.context.currentTime;
		const wasPlaying = this.playing;
		if (wasPlaying) this.playhead = this.scheduler.pause();
		this.voices.cancelAfter(now + 0.002);
		const destination = this.graph.crossfadeWorld(this.performancePatch, now);
		this.graph.setEffectPatch(this.performancePatch, now, this.performancePatch.transitionSeconds);
		this.voices.setDestination(destination);
		if (wasPlaying) this.scheduler.play(this.playhead);
		return this.world;
	}

	/**
	 * Ephemeral Raw / Weather / Braided audition. The canonical score is never rewritten.
	 * Existing voices fade on the previous bus while newly scheduled voices use the new treatment.
	 */
	setObservationView(value: AudioObservationView): AudioObservationView {
		this.ensureNotDisposed();
		const next = safeAudioObservationView(value);
		if (next === this.observationView) return this.observationView;
		this.observationView = next;
		if (!this.context || !this.graph || !this.voices || !this.scheduler) {
			return this.observationView;
		}

		const now = this.context.currentTime;
		const wasPlaying = this.playing;
		if (wasPlaying) this.playhead = this.scheduler.pause();
		this.voices.cancelAfter(now + 0.002);
		this.voices.stopAll(now, AUDIO_OBSERVATION_TRANSITION_SECONDS);
		const destination = this.graph.crossfadeWorld(
			{ transitionSeconds: AUDIO_OBSERVATION_TRANSITION_SECONDS },
			now
		);
		this.voices.setDestination(destination);
		if (wasPlaying) this.scheduler.play(this.playhead);
		return this.observationView;
	}

	/**
	 * Ephemeral opening choreography. Shots 1–3 schedule no score voices, shot 3 alone fades in a
	 * quiet continuous filtered texture, shot 4 admits exactly one canonical resonator event, and
	 * shot 5/free restore the restrained score. The score array is never edited.
	 */
	setGuidedIntroStage(value: GuidedIntroAudioStage): GuidedIntroAudioStage {
		this.ensureNotDisposed();
		const next = safeGuidedIntroAudioStage(value);
		if (next === this.guidedIntroStage) return this.guidedIntroStage;
		this.guidedIntroStage = next;
		this.guidedShotFourVoiceScheduled = false;
		this.transitionEphemeralPerformance();
		return this.guidedIntroStage;
	}

	/**
	 * Ephemeral hearing-comfort layer. Lower mode deterministically thins score events and reduces
	 * spectral brightness, oscillator low-bed, resonance/release depth, and shot-3 texture strength;
	 * it intentionally leaves the canonical score and master-volume setting unchanged.
	 */
	setIntensityMode(value: AudioIntensityMode): AudioIntensityMode {
		this.ensureNotDisposed();
		const next = safeAudioIntensityMode(value);
		if (next === this.intensityMode) return this.intensityMode;
		this.intensityMode = next;
		this.performancePatch = applyAudioIntensityToPatch(
			soundWorldPatch(this.world),
			this.intensityMode
		);
		this.transitionEphemeralPerformance();
		return this.intensityMode;
	}

	/** Fast, ramped kill switch that cannot be undone by ordinary resume(). */
	emergencySilence(): void {
		if (!this.context || !this.graph || !this.voices || !this.scheduler) {
			this.emergency = true;
			this.playing = false;
			return;
		}
		const now = this.context.currentTime;
		this.playhead = this.scheduler.pause();
		this.voices.emergencyStop(now);
		this.voices.cancelAfter(now + 0.001);
		this.graph.emergencySilence(now);
		this.emergency = true;
		this.playing = false;
	}

	/** Must be called from an explicit user action after the reason for emergency silence is clear. */
	async clearEmergencySilence(): Promise<void> {
		this.ensureNotDisposed();
		if (!this.context || !this.graph) {
			this.emergency = false;
			return;
		}
		if (this.context.state === 'suspended') await this.context.resume();
		this.graph.clearEmergencySilence(this.context.currentTime);
		this.emergency = false;
	}

	debugSnapshot(): AudioEngineDebugSnapshot {
		const scheduler = this.scheduler?.debugSnapshot();
		const voices = this.voices?.debugSnapshot();
		const guidedTexture = this.guidedTexture?.debugSnapshot();
		const graph = this.graph?.debugSnapshot();
		return {
			contextConstructed: this.context !== null,
			contextState: this.context?.state ?? 'unavailable',
			playing: this.playing,
			muted: this.muted,
			visibilityPaused: this.visibilityPaused,
			emergencySilenced: this.emergency,
			soundWorld: this.world,
			observationView: this.observationView,
			guidedIntroStage: this.guidedIntroStage,
			intensityMode: this.intensityMode,
			intensityToneGainDb:
				graph?.intensityToneGainDb ?? audioIntensityTargets(this.intensityMode).brightnessShelfDb,
			makeupGain: graph?.makeupGain ?? AUDIO_POST_COMPRESSOR_MAKEUP_GAIN,
			effect: graph?.effect ?? {
				delaySeconds: this.performancePatch.effectDelaySeconds,
				feedback: this.performancePatch.effectFeedback,
				wetGain: this.performancePatch.effectWetGain
			},
			guidedTextureActive: guidedTexture?.active ?? false,
			guidedTextureTargetGain: guidedTexture?.targetGain ?? 0,
			masterVolume: this.volume,
			voiceCap: this.voiceCap,
			playheadSeconds: scheduler?.playheadSeconds ?? this.playhead,
			activeVoices: voices?.activeVoices ?? 0,
			peakVoices: voices?.peakVoices ?? 0,
			polyphonyGainScale: voices?.polyphonyGainScale ?? 1,
			scheduledVoices: voices?.totalScheduled ?? 0,
			scheduledEvents: scheduler?.scheduledEvents ?? 0,
			queuedEvents: scheduler?.queuedEvents ?? this.events.length,
			schedulerIntervalMs: scheduler?.intervalMs ?? AUDIO_SCHEDULER_INTERVAL_MS,
			schedulerLookaheadSeconds: scheduler?.lookaheadSeconds ?? AUDIO_SCHEDULER_LOOKAHEAD_SECONDS,
			conducting: this.conductingState
		};
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.removeVisibilityListener();
		this.scheduler?.dispose();
		this.scheduler = null;
		this.voices?.dispose();
		this.voices = null;
		this.guidedTexture?.dispose();
		this.guidedTexture = null;
		this.graph?.dispose();
		this.graph = null;
		const context = this.context;
		this.context = null;
		this.playing = false;
		this.conductingState = INACTIVE_CONDUCTING_STATE;
		if (context && context.state !== 'closed') await context.close();
	}

	private initializeAfterGesture(): void {
		const context = this.contextFactory();
		this.context = context;
		this.graph = createOrchestraMasterGraph(context, this.volume, this.performancePatch);
		this.graph.setIntensityMode(this.intensityMode, context.currentTime, 0);
		this.graph.setConducting(
			this.conductingState.horizontal,
			this.conductingState.vertical,
			this.conductingState.active,
			context.currentTime
		);
		this.voices = new OrchestraVoicePool(context, this.graph.destination, this.voiceCap);
		this.scheduler = new OrchestraLookaheadScheduler(
			context,
			(event, audioTime, eventIndex) => {
				if (!this.voices || !this.graph || this.emergency) return;
				if (!this.guidedStageKeepsEvent()) return;
				if (
					this.guidedIntroStage !== 'shot-4' &&
					(!intensityKeepsEvent(event.id, eventIndex, this.intensityMode) ||
						!conductingKeepsEvent(event.id, eventIndex, this.conductingState))
				) {
					return;
				}
				scheduleSonicEvent(
					this.voices,
					event,
					this.performancePatch,
					this.seed,
					audioTime,
					eventIndex,
					this.observationView
				);
			},
			this.timerHost
		);
		this.scheduler.setEvents(this.events);
		this.updateGuidedTexture(context.currentTime, AUDIO_PERFORMANCE_TRANSITION_SECONDS);
		this.installVisibilityListener();
	}

	private guidedStageKeepsEvent(): boolean {
		const policy = guidedIntroAudioPolicy(this.guidedIntroStage);
		if (policy.scoredVoiceLimit === 0) return false;
		if (policy.scoredVoiceLimit === 1) {
			if (this.guidedShotFourVoiceScheduled) return false;
			this.guidedShotFourVoiceScheduled = true;
		}
		return true;
	}

	private transitionEphemeralPerformance(): void {
		if (!this.context || !this.graph || !this.voices || !this.scheduler) return;
		const now = this.context.currentTime;
		const wasPlaying = this.playing;
		if (wasPlaying) this.playhead = this.scheduler.pause();
		this.voices.cancelAfter(now + 0.002);
		this.voices.stopAll(now, AUDIO_PERFORMANCE_TRANSITION_SECONDS);
		const destination = this.graph.crossfadeWorld(
			{ transitionSeconds: AUDIO_PERFORMANCE_TRANSITION_SECONDS },
			now
		);
		this.voices.setDestination(destination);
		this.graph.setIntensityMode(this.intensityMode, now, AUDIO_PERFORMANCE_TRANSITION_SECONDS);
		this.graph.setEffectPatch(this.performancePatch, now, AUDIO_PERFORMANCE_TRANSITION_SECONDS);
		this.updateGuidedTexture(now, AUDIO_PERFORMANCE_TRANSITION_SECONDS);
		this.scheduler.seek(this.playhead);
		if (wasPlaying) this.scheduler.play(this.playhead);
	}

	private updateGuidedTexture(at: number, transitionSeconds: number): void {
		if (!this.context || !this.graph) return;
		const active = guidedIntroAudioPolicy(this.guidedIntroStage).continuousTexture;
		if (active && !this.guidedTexture) {
			this.guidedTexture = new GuidedIntroTextureLayer(
				this.context,
				this.graph.ephemeralInput,
				this.seed
			);
		}
		this.guidedTexture?.setState(active, this.intensityMode, at, transitionSeconds);
	}

	private installVisibilityListener(): void {
		if (!this.visibilityDocument || this.visibilityListenerInstalled) return;
		this.visibilityDocument.addEventListener('visibilitychange', this.handleVisibilityChange);
		this.visibilityListenerInstalled = true;
	}

	private removeVisibilityListener(): void {
		if (!this.visibilityDocument || !this.visibilityListenerInstalled) return;
		this.visibilityDocument.removeEventListener('visibilitychange', this.handleVisibilityChange);
		this.visibilityListenerInstalled = false;
	}

	private handleVisibilityChange = (): void => {
		if (!this.visibilityDocument || !this.context || !this.graph) return;
		if (this.visibilityDocument.hidden) {
			this.resumeAfterVisibility = this.playing;
			if (this.playing) this.pause();
			this.visibilityPaused = this.resumeAfterVisibility;
			void this.suspendAfterVisibilityRamp();
			return;
		}
		if (!this.resumeAfterVisibility || this.emergency) return;
		this.resumeAfterVisibility = false;
		void this.resume().catch(() => {
			// Autoplay policy may require another explicit user gesture; state stays visibly paused.
			this.visibilityPaused = true;
		});
	};

	private async suspendAfterVisibilityRamp(): Promise<void> {
		const context = this.context;
		if (!context || context.state !== 'running') return;
		await new Promise((resolve) => setTimeout(resolve, 45));
		if (this.visibilityDocument?.hidden && context.state === 'running') {
			await context.suspend().catch(() => undefined);
		}
	}

	private requireContext(): BrowserAudioContext {
		if (!this.context) throw new Error('The orchestra AudioContext has not been started.');
		return this.context;
	}

	private ensureNotDisposed(): void {
		if (this.disposed) throw new Error('The orchestra audio engine has been disposed.');
	}
}

export function createStrangeAttractorAudioEngine(
	options: OrchestraAudioEngineOptions = {}
): StrangeAttractorAudioEngine {
	return new StrangeAttractorAudioEngine(options);
}
