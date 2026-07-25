import { CalcuttaAudio } from './audio';
import { GameInput, type InputCommand } from './input';
import { StreetRenderer } from './renderer';
import { StreetSimulation } from './simulation';
import type { EngineOptions, EnginePublicApi, RuntimePhase, RunResult } from './runtime-types';
import type { GameSettings } from './settings';

const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const MAX_CATCH_UP_STEPS = 5;
const HUD_INTERVAL_MS = 100;

type PauseReason = 'user' | 'visibility' | 'blur';

export class CalcuttaFootpathEngine implements EnginePublicApi {
	private readonly canvas: HTMLCanvasElement;
	private readonly host: HTMLElement;
	private readonly callbacks: EngineOptions['callbacks'];
	private settings: GameSettings;
	private simulation: StreetSimulation;
	private renderer: StreetRenderer;
	private input: GameInput;
	private audio = new CalcuttaAudio();
	private resizeObserver: ResizeObserver;
	private frameId = 0;
	private lastFrameTime = 0;
	private accumulator = 0;
	private lastHudAt = -Infinity;
	private phase: RuntimePhase;
	private resumePhase: RuntimePhase = 'playing';
	private pauseReasons = new Set<PauseReason>();
	private destroyed = false;
	private result: RunResult | null = null;
	private previousFailedRuns: number;

	constructor(canvas: HTMLCanvasElement, host: HTMLElement, options: EngineOptions) {
		this.canvas = canvas;
		this.host = host;
		this.callbacks = options.callbacks;
		this.settings = { ...options.settings };
		this.previousFailedRuns = Math.max(0, options.previousFailedRuns ?? 0);
		this.phase = options.tutorial ? 'tutorial' : 'playing';
		this.simulation = new StreetSimulation(options.seed, this.settings, this.previousFailedRuns);
		this.renderer = new StreetRenderer(canvas, this.settings);
		this.input = new GameInput(this.handleCommand);
		this.input.setActive(true);
		this.resizeObserver = new ResizeObserver(this.resize);
		this.resizeObserver.observe(host);
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
		this.callbacks.onHud(this.simulation.hud(this.phase));
		this.scheduleFrame();
	}

	private resize = (): void => {
		if (this.destroyed) return;
		const bounds = this.host.getBoundingClientRect();
		this.renderer.resize(bounds.width, bounds.height);
		this.lastFrameTime = 0;
		this.accumulator = 0;
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
		this.accumulator = 0;
	}

	private renderAndPublishHud(time = performance.now()): void {
		this.renderer.render(this.simulation, time);
		this.callbacks.onHud(this.simulation.hud(this.phase, this.pauseReasons.has('visibility')));
		this.lastHudAt = time;
	}

	private handleCommand = (command: InputCommand): void => {
		if (this.destroyed) return;
		if (command === 'pause' && ['tutorial', 'playing'].includes(this.phase)) {
			this.pause();
		}
		this.callbacks.onCommand(command);
	};

	private handleVisibility = (): void => {
		if (document.hidden) {
			this.addPauseReason('visibility');
		} else {
			this.removePauseReason('visibility');
		}
	};

	private handleBlur = (): void => {
		this.addPauseReason('blur');
	};

	private handleFocus = (): void => {
		this.removePauseReason('blur');
	};

	private handleAudioGesture = (): void => {
		if (this.settings.soundEnabled) void this.audio.setEnabled(true);
	};

	private addPauseReason(reason: PauseReason): void {
		if (this.destroyed || ['won', 'lost', 'error', 'title', 'loading'].includes(this.phase)) return;
		if (this.phase !== 'paused') this.resumePhase = this.phase;
		this.pauseReasons.add(reason);
		if (this.phase !== 'paused') {
			this.phase = 'paused';
			this.input.setActive(false);
			this.stopLoop();
			this.audio.setRain(false);
			this.callbacks.onPhase('paused');
			this.renderAndPublishHud();
		}
	}

	private removePauseReason(reason: PauseReason): void {
		if (this.destroyed) return;
		this.pauseReasons.delete(reason);
		if (this.phase === 'paused' && this.pauseReasons.size === 0) {
			this.phase = this.resumePhase === 'tutorial' ? 'tutorial' : 'playing';
			this.input.setActive(true);
			this.lastFrameTime = 0;
			this.accumulator = 0;
			this.callbacks.onPhase(this.phase);
			this.audio.setRain(this.settings.soundEnabled && this.simulation.weather === 'rain');
			this.scheduleFrame();
		}
	}

	private fail(cause: unknown): void {
		if (this.destroyed || this.phase === 'error') return;
		this.phase = 'error';
		this.input.setActive(false);
		this.stopLoop();
		this.audio.setRain(false);
		const message =
			cause instanceof Error && cause.message
				? cause.message
				: 'The street failed to assemble itself.';
		console.error('Calcutta Footpath Simulator runtime error:', cause);
		this.callbacks.onPhase('error');
		this.callbacks.onError(message);
	}

	private frame = (time: number): void => {
		this.frameId = 0;
		if (this.destroyed) return;
		try {
			if (this.lastFrameTime === 0) this.lastFrameTime = time;
			const frameSeconds = Math.min(
				MAX_FRAME_SECONDS,
				Math.max(0, (time - this.lastFrameTime) / 1_000)
			);
			this.lastFrameTime = time;

			if (this.phase === 'playing' || this.phase === 'tutorial') {
				this.accumulator += frameSeconds;
				let steps = 0;
				while (this.accumulator >= FIXED_STEP_SECONDS && steps < MAX_CATCH_UP_STEPS) {
					const rawInput = this.input.vector();
					const portrait = this.host.clientHeight > this.host.clientWidth * 1.12;
					const projectedInput = portrait
						? { ...rawInput, x: -rawInput.y, y: rawInput.x }
						: rawInput;
					const update = this.simulation.update(FIXED_STEP_SECONDS, projectedInput);
					for (const sound of update.sounds) this.audio.play(sound);
					this.audio.setRain(this.simulation.weather === 'rain');
					if (update.tutorialCue) {
						this.callbacks.onHud(this.simulation.hud(this.phase));
						this.lastHudAt = time;
					}
					if (update.ended) {
						this.finish(update.ended.won, update.ended.context, update.ended.reason);
						break;
					}
					if (this.phase === 'tutorial' && this.simulation.progress >= 0.205) {
						this.phase = 'playing';
						this.callbacks.onPhase('playing');
					}
					this.accumulator -= FIXED_STEP_SECONDS;
					steps += 1;
				}
				if (steps === MAX_CATCH_UP_STEPS) this.accumulator = 0;
			} else {
				this.accumulator = 0;
			}

			this.renderer.render(this.simulation, time);
			if (time - this.lastHudAt >= HUD_INTERVAL_MS) {
				this.callbacks.onHud(this.simulation.hud(this.phase, this.pauseReasons.has('visibility')));
				this.lastHudAt = time;
			}
			this.scheduleFrame();
		} catch (cause) {
			this.fail(cause);
		}
	};

	private finish(
		won: boolean,
		context: Parameters<StreetSimulation['result']>[1],
		reason: string
	): void {
		if (this.result || this.destroyed) return;
		this.phase = won ? 'won' : 'lost';
		this.input.setActive(false);
		this.stopLoop();
		this.audio.setRain(false);
		this.audio.play(won ? 'victory' : 'loss');
		this.result = this.simulation.result(won, context, reason);
		this.callbacks.onPhase(this.phase);
		this.callbacks.onHud(this.simulation.hud(this.phase));
		this.callbacks.onResult(this.result);
	}

	start(seed: string, tutorial: boolean): void {
		this.restart(seed, tutorial);
	}

	restart(seed: string, tutorial: boolean, previousFailedRuns = this.previousFailedRuns): void {
		if (this.destroyed) return;
		this.previousFailedRuns = Math.max(0, previousFailedRuns);
		this.phase = 'restarting';
		this.callbacks.onPhase('restarting');
		this.simulation.destroy();
		this.simulation = new StreetSimulation(seed, this.settings, this.previousFailedRuns);
		this.result = null;
		this.pauseReasons.clear();
		this.resumePhase = tutorial ? 'tutorial' : 'playing';
		this.phase = this.resumePhase;
		this.lastFrameTime = 0;
		this.accumulator = 0;
		this.lastHudAt = -Infinity;
		this.input.clear();
		this.input.setActive(true);
		this.callbacks.onPhase(this.phase);
		this.callbacks.onHud(this.simulation.hud(this.phase));
		this.scheduleFrame();
	}

	pause(byVisibility = false): void {
		this.addPauseReason(byVisibility ? 'visibility' : 'user');
	}

	resume(): void {
		this.removePauseReason('user');
	}

	enableAudioFromGesture(): void {
		if (this.destroyed) return;
		void this.audio.setEnabled(true);
	}

	setSettings(settings: GameSettings): void {
		if (this.destroyed) return;
		this.settings = { ...settings };
		this.simulation.setSettings(this.settings);
		this.renderer.setSettings(this.settings);
		void this.audio.setEnabled(this.settings.soundEnabled);
		if (!this.settings.soundEnabled || !this.isActivePhase()) this.audio.setRain(false);
		if (!this.isActivePhase()) this.renderAndPublishHud();
	}

	setTouchVector(x: number, y: number): void {
		this.input.setTouchVector(x, y);
	}

	setTouchDash(pressed: boolean): void {
		this.input.setTouchDash(pressed);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		if (this.frameId) cancelAnimationFrame(this.frameId);
		this.frameId = 0;
		this.resizeObserver.disconnect();
		window.visualViewport?.removeEventListener('resize', this.resize);
		document.removeEventListener('visibilitychange', this.handleVisibility);
		window.removeEventListener('blur', this.handleBlur);
		window.removeEventListener('focus', this.handleFocus);
		window.removeEventListener('keydown', this.handleAudioGesture, { capture: true });
		window.removeEventListener('pointerdown', this.handleAudioGesture, { capture: true });
		document.removeEventListener('fullscreenchange', this.resize);
		this.input.destroy();
		this.renderer.destroy();
		this.simulation.destroy();
		void this.audio.destroy();
	}
}

export function createCalcuttaFootpathEngine(
	canvas: HTMLCanvasElement,
	host: HTMLElement,
	options: EngineOptions
): EnginePublicApi {
	return new CalcuttaFootpathEngine(canvas, host, options);
}
