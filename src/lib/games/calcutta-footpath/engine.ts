import { GameInput, type InputCommand } from './input';
import type {
	EngineOptions,
	EnginePublicApi,
	HudSnapshot,
	RuntimePhase,
	RunResult
} from './runtime-types';
import type { GameSettings } from './settings';
import {
	continuousSourcePriority,
	selectSpatialOneShotsForFrame,
	SpatialStreetAudio,
	type AudioListenerFrame,
	type MovingAudioSource
} from './spatial-audio';
import {
	SpatialStreetSimulation,
	type SpatialEntityKind,
	type SpatialRenderSnapshot,
	type SpatialSimulationUpdate
} from './spatial-simulation';
import { isWalkable, nearestWalkableEdge, type WorldPoint } from './spatial-world';
import {
	createCalcuttaFootpathThreeRenderer,
	type FootpathRenderEntity,
	type FootpathRenderEntityKind,
	type FootpathRenderFrame,
	type FootpathRendererMetrics,
	type FootpathRendererStatusEvent,
	type FootpathThreeRendererApi
} from './three-renderer';

const MAX_FRAME_SECONDS = 0.1;
const HUD_INTERVAL_MS = 100;
const AUDIO_SOURCE_RADIUS_M = 54;
const MAX_CONTINUOUS_AUDIO_SOURCES = 18;
const OCCLUSION_INTERVAL_MS = 220;
const LOOK_RADIANS_PER_PIXEL = 0.0042;

type PauseReason = 'user' | 'visibility' | 'blur' | 'context';

export function spatialEntityKindToRenderKind(kind: SpatialEntityKind): FootpathRenderEntityKind {
	switch (kind) {
		case 'human':
			return 'pedestrian';
		case 'food-stall':
			return 'stall';
		case 'delivery-obstruction':
			return 'debris';
		default:
			return kind;
	}
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

export class CalcuttaFootpathEngine implements EnginePublicApi {
	private readonly canvas: HTMLCanvasElement;
	private readonly host: HTMLElement;
	private readonly callbacks: EngineOptions['callbacks'];
	private settings: GameSettings;
	private simulation: SpatialStreetSimulation;
	private readonly renderer: FootpathThreeRendererApi;
	private readonly input: GameInput;
	private readonly audio = new SpatialStreetAudio();
	private readonly resizeObserver: ResizeObserver | null;
	private frameId = 0;
	private lastFrameTime = 0;
	private lastHudAt = -Infinity;
	private phase: RuntimePhase;
	private resumePhase: RuntimePhase = 'playing';
	private readonly pauseReasons = new Set<PauseReason>();
	private automaticallyPaused = false;
	private destroyed = false;
	private result: RunResult | null = null;
	private previousFailedRuns: number;
	private lastSnapshot: SpatialRenderSnapshot;
	private reaction = '';
	private reactionUntil = 0;
	private lookYaw = 0;
	private lookPitch = 0;
	private lookActive = false;
	private nextOcclusionAtMs = 0;
	private readonly occlusionCache = new Map<string, boolean>();
	private lastRendererMetrics: FootpathRendererMetrics | null = null;

	constructor(canvas: HTMLCanvasElement, host: HTMLElement, options: EngineOptions) {
		this.canvas = canvas;
		this.host = host;
		this.callbacks = options.callbacks;
		this.settings = { ...options.settings };
		this.previousFailedRuns = Math.max(0, options.previousFailedRuns ?? 0);
		this.phase = options.tutorial ? 'tutorial' : 'playing';
		this.resumePhase = this.phase;
		this.simulation = new SpatialStreetSimulation(
			options.seed,
			this.settings,
			this.previousFailedRuns
		);
		this.lastSnapshot = this.simulation.snapshot();
		this.renderer = createCalcuttaFootpathThreeRenderer(canvas, {
			world: this.simulation.world,
			quality: this.settings.detailLevel,
			reducedMotion: this.settings.reducedMotion,
			cameraMovement: this.settings.cameraMovement,
			onMetrics: this.handleRendererMetrics,
			onStatus: this.handleRendererStatus
		});
		this.input = new GameInput(this.handleCommand);
		this.input.setActive(true);
		this.resizeObserver =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.resize);
		this.resizeObserver?.observe(host);
		window.visualViewport?.addEventListener('resize', this.resize);
		document.addEventListener('visibilitychange', this.handleVisibility);
		window.addEventListener('blur', this.handleBlur);
		window.addEventListener('focus', this.handleFocus);
		window.addEventListener('keydown', this.handleAudioGesture, { capture: true });
		window.addEventListener('pointerdown', this.handleAudioGesture, { capture: true });
		document.addEventListener('fullscreenchange', this.resize);
		this.resize();
		void this.audio.setEnabled(this.settings.soundEnabled);
		this.callbacks.onPhase(this.phase);
		this.callbacks.onReady();
		this.publishHud();
		this.renderSnapshot(1 / 60);
		this.scheduleFrame();
	}

	private resize = (): void => {
		if (this.destroyed) return;
		const bounds = this.host.getBoundingClientRect();
		this.renderer.resize(bounds.width, bounds.height);
		this.lastFrameTime = 0;
		if (!this.isActivePhase()) this.renderAndPublishHud();
	};

	private isActivePhase(): boolean {
		return this.phase === 'playing' || this.phase === 'tutorial';
	}

	private scheduleFrame(): void {
		if (this.destroyed || this.frameId || !this.isActivePhase()) return;
		this.frameId = requestAnimationFrame(this.frame);
	}

	private stopLoop(): void {
		if (this.frameId) cancelAnimationFrame(this.frameId);
		this.frameId = 0;
		this.lastFrameTime = 0;
	}

	private handleCommand = (command: InputCommand): void => {
		if (this.destroyed) return;
		if (command === 'pause' && this.isActivePhase()) this.pause();
		this.callbacks.onCommand(command);
	};

	private handleVisibility = (): void => {
		if (document.hidden) this.addAutomaticPauseReason('visibility');
		else this.settleAutomaticPauseReason('visibility');
	};

	private handleBlur = (): void => {
		this.addAutomaticPauseReason('blur');
	};

	private handleFocus = (): void => {
		this.settleAutomaticPauseReason('blur');
	};

	private handleAudioGesture = (): void => {
		if (this.settings.soundEnabled && this.isActivePhase()) void this.audio.setEnabled(true);
	};

	private handleRendererStatus = (event: FootpathRendererStatusEvent): void => {
		if (this.destroyed) return;
		if (event.status === 'context-lost') {
			this.setReaction('The 3D view paused while the browser restores it.', 8_000);
			this.addPauseReason('context');
		} else if (event.status === 'context-restored') {
			this.removePauseReason('context');
			this.setReaction('The 3D view has been restored.');
		} else if (event.status === 'error') {
			this.fail(event.message || 'The browser could not create the 3D street.');
		}
	};

	private handleRendererMetrics = (metrics: FootpathRendererMetrics): void => {
		this.lastRendererMetrics = metrics;
		if (!import.meta.env.DEV) return;
		this.host.dataset.renderFps = metrics.fps.toFixed(1);
		this.host.dataset.renderFrameMs = metrics.frameMs.toFixed(2);
		this.host.dataset.renderDrawCalls = String(metrics.drawCalls);
		this.host.dataset.renderTriangles = String(metrics.triangles);
		this.host.dataset.renderEntities = String(metrics.entityCount);
		this.host.dataset.renderTextureBytes = String(metrics.approximateTextureMemoryBytes);
		this.host.dataset.renderQuality = metrics.quality;
	};

	private setReaction(message: string, durationMs = 3_200): void {
		this.reaction = message;
		this.reactionUntil = performance.now() + durationMs;
		this.publishHud();
	}

	private currentReaction(): string {
		if (performance.now() <= this.reactionUntil) return this.reaction;
		this.reaction = '';
		return '';
	}

	private addPauseReason(reason: PauseReason): void {
		if (this.destroyed || ['won', 'lost', 'error', 'title', 'loading'].includes(this.phase)) return;
		if (this.phase !== 'paused') this.resumePhase = this.phase;
		this.pauseReasons.add(reason);
		if (this.phase === 'paused') return;
		this.phase = 'paused';
		this.input.setActive(false);
		this.stopLoop();
		void this.audio.setEnabled(false);
		this.callbacks.onPhase('paused');
		this.renderAndPublishHud();
	}

	private addAutomaticPauseReason(reason: Extract<PauseReason, 'visibility' | 'blur'>): void {
		this.automaticallyPaused = true;
		this.addPauseReason(reason);
	}

	private settleAutomaticPauseReason(reason: Extract<PauseReason, 'visibility' | 'blur'>): void {
		if (!this.pauseReasons.has(reason)) return;
		this.pauseReasons.delete(reason);
		// Returning to the page must never restart movement without an explicit user action.
		// A user pause reason holds the simulation after all automatic reasons have cleared.
		if (this.phase === 'paused') this.pauseReasons.add('user');
		this.renderAndPublishHud();
	}

	private removePauseReason(reason: PauseReason): void {
		if (this.destroyed) return;
		this.pauseReasons.delete(reason);
		if (this.phase !== 'paused' || this.pauseReasons.size > 0) return;
		this.phase = this.resumePhase === 'tutorial' ? 'tutorial' : 'playing';
		this.input.setActive(true);
		this.lastFrameTime = 0;
		this.callbacks.onPhase(this.phase);
		if (this.settings.soundEnabled) void this.audio.setEnabled(true);
		this.scheduleFrame();
	}

	private fail(cause: unknown): void {
		if (this.destroyed || this.phase === 'error') return;
		this.phase = 'error';
		this.input.setActive(false);
		this.stopLoop();
		void this.audio.setEnabled(false);
		const message =
			cause instanceof Error && cause.message
				? cause.message
				: typeof cause === 'string' && cause
					? cause
					: 'The street failed to assemble itself.';
		console.error('Calcutta Footpath Simulator runtime error:', cause);
		this.callbacks.onPhase('error');
		this.callbacks.onError(message);
	}

	private movementIntent(): Parameters<SpatialStreetSimulation['update']>[1] {
		const vector = this.input.vector(this.settings.controlScheme);
		return {
			mode: this.settings.controlScheme,
			moveForward: clamp(-vector.y, -1, 1),
			turn: clamp(vector.x, -1, 1),
			strafe: 0,
			hurry: vector.dash
		};
	}

	private frame = (time: number): void => {
		this.frameId = 0;
		if (this.destroyed) return;
		try {
			if (this.lastFrameTime === 0) this.lastFrameTime = time;
			const deltaSeconds = Math.min(
				MAX_FRAME_SECONDS,
				Math.max(0, (time - this.lastFrameTime) / 1_000)
			);
			this.lastFrameTime = time;

			if (this.isActivePhase()) {
				const update = this.simulation.update(deltaSeconds, this.movementIntent());
				this.lastSnapshot = update.snapshot;
				this.processAudio(update, deltaSeconds);
				if (
					this.phase === 'tutorial' &&
					(this.simulation.metrics.distance >= 6 || this.simulation.elapsedMs >= 40_000)
				) {
					this.phase = 'playing';
					this.resumePhase = 'playing';
					this.callbacks.onPhase('playing');
				}
				if (update.result) {
					this.finish(update.result);
					return;
				}
			}

			this.renderSnapshot(deltaSeconds || 1 / 60);
			if (time - this.lastHudAt >= HUD_INTERVAL_MS) this.publishHud(time);
			this.scheduleFrame();
		} catch (cause) {
			this.fail(cause);
		}
	};

	private renderFrame(snapshot: SpatialRenderSnapshot, deltaSeconds: number): FootpathRenderFrame {
		const nearest = nearestWalkableEdge(snapshot.player, { world: this.simulation.world });
		const entities: FootpathRenderEntity[] = snapshot.entities
			// Stalls are authored once as part of the persistent world; their simulation records drive
			// interaction and sound without creating coincident duplicate geometry.
			.filter((entity) => entity.kind !== 'food-stall')
			.map((entity) => ({
				id: entity.id,
				kind: spatialEntityKindToRenderKind(entity.kind),
				position: { x: entity.x, z: entity.z },
				headingRadians: entity.headingRadians,
				velocity: entity.velocity,
				variant: entity.variant,
				state: entity.state,
				visible: entity.active,
				priority: entity.dangerous ? 5 : entity.kind === 'human' ? 2 : 3
			}));
		return {
			elapsedSeconds: snapshot.elapsedMs / 1_000,
			deltaSeconds,
			player: {
				id: 'player',
				kind: 'player',
				position: { x: snapshot.player.x, z: snapshot.player.z },
				headingRadians: snapshot.player.headingRadians,
				velocity: snapshot.player.velocity,
				variant: snapshot.player.motion,
				state: snapshot.player.motion,
				laneWidthM: nearest.edge.widthM,
				priority: 100
			},
			entities,
			weather: {
				state: snapshot.weather.state,
				rainIntensity: snapshot.weather.intensity,
				wetness:
					snapshot.weather.state === 'rain'
						? Math.max(0.35, snapshot.weather.intensity)
						: snapshot.weather.state === 'post-rain'
							? 0.62
							: 0,
				wind: { x: -0.65, z: 0.22 }
			},
			reducedMotion: this.settings.reducedMotion,
			cameraMovement: this.settings.cameraMovement,
			look: {
				yawRadians: this.lookYaw,
				pitchRadians: this.lookPitch,
				active: this.lookActive
			}
		};
	}

	private renderSnapshot(deltaSeconds: number): void {
		this.renderer.renderFrame(this.renderFrame(this.lastSnapshot, deltaSeconds));
	}

	private renderAndPublishHud(): void {
		this.renderSnapshot(1 / 60);
		this.publishHud();
	}

	private listenerFrame(snapshot: SpatialRenderSnapshot): AudioListenerFrame {
		const edge = nearestWalkableEdge(snapshot.player, { world: this.simulation.world }).edge;
		return {
			x: snapshot.player.x,
			y: 1.62,
			z: snapshot.player.z,
			heading: snapshot.player.heading + this.lookYaw,
			vx: snapshot.player.vx,
			vz: snapshot.player.vz,
			enclosure: clamp(1 - edge.weatherExposure, 0.06, 0.86),
			raining: snapshot.weather.state === 'rain' && snapshot.weather.intensity > 0.05
		};
	}

	private lineIsOccluded(listener: WorldPoint, source: WorldPoint): boolean {
		for (let sample = 1; sample <= 5; sample += 1) {
			const fraction = sample / 6;
			const point = {
				x: listener.x + (source.x - listener.x) * fraction,
				z: listener.z + (source.z - listener.z) * fraction
			};
			if (!isWalkable(point, 0.06, { world: this.simulation.world })) return true;
		}
		return false;
	}

	private continuousAudioSources(snapshot: SpatialRenderSnapshot): MovingAudioSource[] {
		const listener = snapshot.player;
		const workshopSources: MovingAudioSource[] = this.simulation.world.landmarks
			.filter((landmark) => landmark.kind === 'workshop-shutter')
			.map((landmark) => ({
				id: `audio-${landmark.id}`,
				kind: 'workshop',
				x: landmark.position.x,
				y: 0.9,
				z: landmark.position.z,
				vx: 0,
				vz: 0,
				active: true,
				occluded: false
			}));
		const sources = [...this.simulation.audioSources(), ...workshopSources]
			.map((source) => ({
				source,
				distance: Math.hypot(source.x - listener.x, source.z - listener.z),
				priority: continuousSourcePriority(source, listener)
			}))
			.filter(({ distance }) => distance <= AUDIO_SOURCE_RADIUS_M)
			.sort((left, right) => right.priority - left.priority || left.distance - right.distance)
			.slice(0, MAX_CONTINUOUS_AUDIO_SOURCES)
			.map(({ source }) => source);

		if (snapshot.elapsedMs >= this.nextOcclusionAtMs) {
			this.nextOcclusionAtMs = snapshot.elapsedMs + OCCLUSION_INTERVAL_MS;
			const activeIds = new Set(sources.map((source) => source.id));
			for (const id of this.occlusionCache.keys()) {
				if (!activeIds.has(id)) this.occlusionCache.delete(id);
			}
			for (const source of sources) {
				this.occlusionCache.set(source.id, this.lineIsOccluded(listener, source));
			}
		}
		return sources.map((source) => ({
			...source,
			occluded: this.occlusionCache.get(source.id) ?? false
		}));
	}

	private processAudio(update: SpatialSimulationUpdate, deltaSeconds: number): void {
		if (!this.settings.soundEnabled) return;
		const listener = this.listenerFrame(update.snapshot);
		this.audio.update(listener, this.continuousAudioSources(update.snapshot), deltaSeconds);
		for (const event of selectSpatialOneShotsForFrame(update.audioEvents)) {
			this.audio.play(event.kind, {
				x: event.x,
				y: event.kind === 'footstep' ? 0.05 : 0.8,
				z: event.z
			});
		}
		if (import.meta.env.DEV && this.lastRendererMetrics) {
			const debug = this.audio.debugSnapshot();
			this.host.dataset.audioContext = debug.contextState;
			this.host.dataset.audioNodes = String(debug.activeNodes);
			this.host.dataset.audioSources = String(debug.sources.length);
		}
	}

	private hudSnapshot(): HudSnapshot {
		const snapshot = this.lastSnapshot;
		const hud = snapshot.hud;
		const activeEffect = this.simulation.food.activeEffects[0];
		return {
			phase: this.phase,
			stamina: hud.stamina,
			morale: hud.morale,
			reflex: this.simulation.metrics.reflex,
			distance: hud.routeDistanceM,
			distanceMetres: Math.round(hud.routeDistanceM),
			zone: hud.streetName,
			weather: hud.weather,
			elapsedMs: hud.elapsedMs,
			score: this.result?.score.total ?? 0,
			warning: hud.warningText,
			tutorialCue: this.phase === 'tutorial' ? hud.onboardingCue : '',
			reaction: this.currentReaction(),
			foodEffect: activeEffect
				? `${activeEffect.source.charAt(0).toUpperCase()}${activeEffect.source.slice(1)} is affecting the walk.`
				: '',
			seed: this.simulation.seed,
			dashReady: hud.hurryReady,
			pausedByVisibility: this.automaticallyPaused,
			destinationMetres: hud.destinationMetres,
			streetName: hud.streetName,
			interactionPrompt: hud.interactionPrompt,
			visualCue: hud.warning?.visual ? hud.warning.text : '',
			highContrastWarnings: this.settings.highContrastWarnings,
			walkingAutomatically: hud.walkingAutomatically,
			visitedEdges: hud.visitedEdgeIds,
			playerMapPosition: {
				x: snapshot.player.x,
				z: snapshot.player.z,
				heading: snapshot.player.heading
			}
		};
	}

	private publishHud(at = performance.now()): void {
		this.callbacks.onHud(this.hudSnapshot());
		this.lastHudAt = at;
	}

	private finish(result: RunResult): void {
		if (this.result || this.destroyed) return;
		this.result = result;
		this.phase = result.won ? 'won' : 'lost';
		this.input.setActive(false);
		this.stopLoop();
		// Keep the ambient bed, but retire positional vehicle and pedestrian voices so they
		// cannot remain frozen around the listener behind the results dialog.
		this.audio.update(this.listenerFrame(this.lastSnapshot), [], 1 / 60);
		this.callbacks.onPhase(this.phase);
		this.publishHud();
		this.callbacks.onResult(result);
	}

	start(seed: string, tutorial: boolean): void {
		this.restart(seed, tutorial);
	}

	restart(seed: string, tutorial: boolean, previousFailedRuns = this.previousFailedRuns): void {
		if (this.destroyed) return;
		this.previousFailedRuns = Math.max(0, previousFailedRuns);
		this.phase = 'restarting';
		this.callbacks.onPhase('restarting');
		this.simulation = new SpatialStreetSimulation(seed, this.settings, this.previousFailedRuns);
		this.lastSnapshot = this.simulation.snapshot();
		this.result = null;
		this.pauseReasons.clear();
		this.automaticallyPaused = false;
		this.resumePhase = tutorial ? 'tutorial' : 'playing';
		this.phase = this.resumePhase;
		this.lastFrameTime = 0;
		this.lastHudAt = -Infinity;
		this.reaction = '';
		this.reactionUntil = 0;
		this.lookYaw = 0;
		this.lookPitch = 0;
		this.lookActive = false;
		this.nextOcclusionAtMs = 0;
		this.occlusionCache.clear();
		this.input.clear();
		this.input.setActive(true);
		this.renderer.releaseLookOffset();
		this.callbacks.onPhase(this.phase);
		this.publishHud();
		if (this.settings.soundEnabled) void this.audio.setEnabled(true);
		this.renderSnapshot(1 / 60);
		this.scheduleFrame();
	}

	pause(byVisibility = false): void {
		this.addPauseReason(byVisibility ? 'visibility' : 'user');
	}

	resume(): void {
		this.automaticallyPaused = false;
		this.pauseReasons.delete('visibility');
		this.pauseReasons.delete('blur');
		this.removePauseReason('user');
	}

	enableAudioFromGesture(): Promise<boolean> {
		if (this.destroyed) return Promise.resolve(false);
		return this.audio.setEnabled(true);
	}

	setSettings(settings: GameSettings): void {
		if (this.destroyed) return;
		this.settings = { ...settings };
		this.simulation.setSettings(this.settings);
		this.renderer.setQuality(this.settings.detailLevel);
		this.renderer.setReducedMotion(this.settings.reducedMotion);
		this.renderer.setCameraMovement(this.settings.cameraMovement);
		void this.audio.setEnabled(this.settings.soundEnabled && this.isActivePhase());
		if (!this.isActivePhase()) this.renderAndPublishHud();
	}

	setTouchVector(x: number, y: number): void {
		this.input.setTouchVector(x, y);
	}

	setTouchDash(pressed: boolean): void {
		this.input.setTouchDash(pressed);
	}

	setWalkTarget(clientX: number, clientY: number): void {
		if (this.destroyed || !this.isActivePhase()) return;
		const hit = this.renderer.screenToRoad(clientX, clientY);
		if (!hit) {
			this.setReaction('Choose a clear part of the street to walk there.');
			return;
		}
		const result = this.simulation.walkTo(hit.point, 'click');
		if (!result.accepted) {
			this.setReaction(
				result.reason === 'outside-walkable-world'
					? 'That point is outside the walkable street.'
					: 'The street cannot reach that point just now.'
			);
		}
		this.lastSnapshot = this.simulation.snapshot();
		this.publishHud();
	}

	stopWalking(): void {
		if (this.destroyed || !this.isActivePhase()) return;
		this.simulation.stop();
		this.lastSnapshot = this.simulation.snapshot();
		this.setReaction('You stop. The neighbourhood keeps moving.');
	}

	turnAround(): void {
		if (this.destroyed || !this.isActivePhase()) return;
		this.simulation.turnAround();
		this.lastSnapshot = this.simulation.snapshot();
		this.publishHud();
	}

	interact(): void {
		if (this.destroyed || !this.isActivePhase()) return;
		const interaction = this.simulation.interact();
		if (!interaction.accepted) {
			this.setReaction(
				interaction.reason === 'nothing-nearby'
					? 'There is nothing to stop for within reach.'
					: 'Give the stall a moment.'
			);
		} else {
			this.setReaction(`Stopping briefly for ${interaction.kind ?? 'food'}.`);
		}
		this.lastSnapshot = this.simulation.snapshot();
	}

	setLookOffset(deltaX: number, deltaY: number, active: boolean): void {
		if (this.destroyed) return;
		if (!active) {
			this.lookActive = false;
			this.lookYaw = 0;
			this.lookPitch = 0;
			this.renderer.releaseLookOffset();
			return;
		}
		this.lookActive = true;
		this.lookYaw = clamp(this.lookYaw + deltaX * LOOK_RADIANS_PER_PIXEL, -1.12, 1.12);
		this.lookPitch = clamp(this.lookPitch + deltaY * LOOK_RADIANS_PER_PIXEL, -0.28, 0.24);
		this.renderer.setLookOffset(this.lookYaw, this.lookPitch, true);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.stopLoop();
		this.resizeObserver?.disconnect();
		window.visualViewport?.removeEventListener('resize', this.resize);
		document.removeEventListener('visibilitychange', this.handleVisibility);
		window.removeEventListener('blur', this.handleBlur);
		window.removeEventListener('focus', this.handleFocus);
		window.removeEventListener('keydown', this.handleAudioGesture, { capture: true });
		window.removeEventListener('pointerdown', this.handleAudioGesture, { capture: true });
		document.removeEventListener('fullscreenchange', this.resize);
		this.input.destroy();
		this.renderer.dispose();
		void this.audio.destroy();
		if (import.meta.env.DEV) {
			for (const key of Object.keys(this.host.dataset)) {
				if (key.startsWith('render') || key.startsWith('audio')) delete this.host.dataset[key];
			}
		}
	}
}

export function createCalcuttaFootpathEngine(
	canvas: HTMLCanvasElement,
	host: HTMLElement,
	options: EngineOptions
): EnginePublicApi {
	return new CalcuttaFootpathEngine(canvas, host, options);
}
