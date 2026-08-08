import type p5 from 'p5';
import { normalizeFlowerConfig } from './config';
import { createExportPlan } from './export';
import { buildBloomGeometry, morphologyHash } from './geometry';
import { getPreset } from './presets';
import { deriveBloomSeeds, hashString32, hashToHex } from './seed';
import type { BloomGeometry, ExportResult, FlowerConfig } from './types';
import {
	PerlinBloomRenderer,
	type BloomLayerSet,
	type BloomPointer,
	type BloomPulse,
	type BloomRenderStats,
	type CanvasSurface,
	type RenderQuality
} from './renderer';

const GEOMETRY_REBUILD_DELAY_MS = 72;
const MAX_DELTA_MS = 50;
const MIN_CANVAS_EDGE = 2;
const FALLBACK_CANVAS_WIDTH = 960;
const FALLBACK_CANVAS_HEIGHT = 640;
const MAX_PULSES = 8;

const LOW_QUALITY: RenderQuality = Object.freeze({
	name: 'low',
	petalStride: 2,
	veinStride: 7,
	interference: false,
	pollenCount: 54,
	backgroundPoints: 42,
	glowScale: 0.27,
	glowBlur: 6
});

const HIGH_QUALITY: RenderQuality = Object.freeze({
	name: 'high',
	petalStride: 1,
	veinStride: 4,
	interference: true,
	pollenCount: 112,
	backgroundPoints: 88,
	glowScale: 0.42,
	glowBlur: 10
});

const LOW_STILL_QUALITY: RenderQuality = Object.freeze({
	...LOW_QUALITY,
	pollenCount: 14
});

const HIGH_STILL_QUALITY: RenderQuality = Object.freeze({
	...HIGH_QUALITY,
	pollenCount: 22
});

const GEOMETRY_KEYS = Object.freeze([
	'seed',
	'petals',
	'whorls',
	'bloomScale',
	'petalLength',
	'petalWidth',
	'widthProfile',
	'curl',
	'symmetry',
	'asymmetry',
	'tipStyle',
	'noiseStrength',
	'noiseScale',
	'domainWarp',
	'octaves',
	'falloff',
	'boxSize',
	'constraint',
	'ruptureThreshold',
	'breakout',
	'boundaryPhysics'
] as const satisfies readonly (keyof FlowerConfig)[]);

const BACKGROUND_KEYS = Object.freeze([
	'preset',
	'palette',
	'seed',
	'grain',
	'octaves',
	'falloff'
] as const satisfies readonly (keyof FlowerConfig)[]);

type P5Graphics = p5.Graphics;

export type PerlinBloomEngineOptions = Readonly<{
	P5: typeof p5;
	host: HTMLElement;
	config: Readonly<FlowerConfig>;
	debug?: boolean;
	descriptionId?: string;
	onReady?: (engine: PerlinBloomEngine) => void;
	onError?: (error: unknown) => void;
	onPausedChange?: (paused: boolean) => void;
}>;

export type ExportStillOptions = Readonly<{
	scale?: 1 | 2 | 4;
	signature?: boolean;
	time?: number;
	filename?: string;
	download?: boolean;
}>;

export type PerlinBloomDiagnostics = Readonly<{
	ready: boolean;
	destroyed: boolean;
	paused: boolean;
	pageVisible: boolean;
	offscreen: boolean;
	quality: 'low' | 'high';
	fps: number;
	frameTime: number;
	frameCount: number;
	elapsed: number;
	ruptureCount: number;
	deformedPointCount: number;
	canvasWidth: number;
	canvasHeight: number;
	bufferGeneration: number;
	morphologyHash: string;
	configHash: string;
}>;

type GraphicsBuffers = {
	background: P5Graphics;
	instrument: P5Graphics;
	body: P5Graphics;
	light: P5Graphics;
	glow: P5Graphics;
	particles: P5Graphics;
};

function changed<Key extends keyof FlowerConfig>(
	previous: Readonly<FlowerConfig>,
	next: Readonly<FlowerConfig>,
	keys: readonly Key[]
): boolean {
	return keys.some((key) => previous[key] !== next[key]);
}

function boundedDimension(value: number, fallback: number): number {
	if (!Number.isFinite(value) || value < MIN_CANVAS_EDGE) return fallback;
	return Math.max(MIN_CANVAS_EDGE, Math.round(value));
}

function configHash(config: Readonly<FlowerConfig>): string {
	return `pbc-${hashToHex(hashString32(JSON.stringify(config)))}`;
}

function surfaceFromGraphics(graphics: P5Graphics): CanvasSurface {
	return {
		canvas: graphics.elt,
		context: graphics.drawingContext as CanvasRenderingContext2D
	};
}

function layersFromGraphics(buffers: GraphicsBuffers): BloomLayerSet {
	return {
		background: surfaceFromGraphics(buffers.background),
		instrument: surfaceFromGraphics(buffers.instrument),
		body: surfaceFromGraphics(buffers.body),
		light: surfaceFromGraphics(buffers.light),
		glow: surfaceFromGraphics(buffers.glow),
		particles: surfaceFromGraphics(buffers.particles)
	};
}

function createCanvasSurface(width: number, height: number): CanvasSurface {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d', { alpha: true });
	if (!context) throw new Error('This browser could not create an export surface.');
	return { canvas, context };
}

function createExportLayers(width: number, height: number, quality: RenderQuality): BloomLayerSet {
	return {
		background: createCanvasSurface(width, height),
		instrument: createCanvasSurface(width, height),
		body: createCanvasSurface(width, height),
		light: createCanvasSurface(width, height),
		glow: createCanvasSurface(
			Math.max(1, Math.round(width * quality.glowScale)),
			Math.max(1, Math.round(height * quality.glowScale))
		),
		particles: createCanvasSurface(width, height)
	};
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		try {
			canvas.toBlob((blob) => {
				if (blob) resolve(blob);
				else reject(new Error('The browser returned no PNG data.'));
			}, 'image/png');
		} catch {
			reject(new Error('The browser blocked PNG encoding.'));
		}
	});
}

/**
 * One explicit-lifecycle p5 instance. The class owns every observer, listener, graphics buffer and
 * export token that it creates; Svelte only supplies serializable configuration snapshots.
 */
export class PerlinBloomEngine {
	private readonly host: HTMLElement;
	private readonly debug: boolean;
	private readonly descriptionId?: string;
	private readonly onReady?: (engine: PerlinBloomEngine) => void;
	private readonly onError?: (error: unknown) => void;
	private readonly onPausedChange?: (paused: boolean) => void;
	private instance: p5 | null = null;
	private canvasElement: HTMLCanvasElement | null = null;
	private canvasContext: CanvasRenderingContext2D | null = null;
	private buffers: GraphicsBuffers | null = null;
	private layerSet: BloomLayerSet | null = null;
	private geometry: BloomGeometry;
	private renderer: PerlinBloomRenderer;
	private config: FlowerConfig;
	private resizeObserver: ResizeObserver | null = null;
	private intersectionObserver: IntersectionObserver | null = null;
	private resizeFrame = 0;
	private qualityFrame = 0;
	private interactionFrame = 0;
	private rebuildTimer = 0;
	private revokeTimers = new Set<number>();
	private objectUrls = new Set<string>();
	private removeCanvasListeners: () => void = () => {};
	private removeWindowResize: () => void = () => {};
	private ready = false;
	private readyDelivered = false;
	private destroyed = false;
	private failed = false;
	private paused = false;
	private pageVisible = true;
	private offscreen = false;
	private backgroundDirty = true;
	private resolvedQuality: 'low' | 'high' = 'high';
	private cssWidth = FALLBACK_CANVAS_WIDTH;
	private cssHeight = FALLBACK_CANVAS_HEIGHT;
	private elapsed = 0;
	private pointer: BloomPointer = { x: 0.5, y: 0.5, active: false };
	private pointerTarget: BloomPointer = { x: 0.5, y: 0.5, active: false };
	private pulses: BloomPulse[] = [];
	private exportGeneration = 0;
	private bufferGeneration = 0;
	private frameCount = 0;
	private averageFrameTime = 16.67;
	private averageCadence = 16.67;
	private fps = 60;
	private lastFrameTime = 0;
	private lastDrawStarted = 0;
	private ruptureCount = 0;
	private deformedPointCount = 0;
	private lastQualityChangeFrame = -1_000;
	private particleSeed = 0;

	constructor(options: PerlinBloomEngineOptions) {
		this.host = options.host;
		this.debug = options.debug === true;
		this.descriptionId = options.descriptionId;
		this.onReady = options.onReady;
		this.onError = options.onError;
		this.onPausedChange = options.onPausedChange;
		this.config = normalizeFlowerConfig(options.config);
		this.particleSeed = deriveBloomSeeds(this.config.seed).particles;
		this.geometry = buildBloomGeometry(this.config, { samplesPerPetal: 56 });
		this.renderer = new PerlinBloomRenderer(this.geometry);
		this.pageVisible = typeof document === 'undefined' ? true : !document.hidden;

		try {
			this.instance = new options.P5((p) => {
				p.setup = () => this.setup(p);
				p.draw = () => this.draw(p);
			}, this.host);
		} catch {
			this.fail('The 2D bloom renderer could not be initialized.');
		}
	}

	private setup(p: p5): void {
		if (this.destroyed || this.failed) return;
		try {
			this.resolvedQuality = this.chooseInitialQuality();
			if (this.resolvedQuality === 'low' || !this.config.motionEnabled) {
				this.geometry = buildBloomGeometry(this.config, {
					samplesPerPetal: this.geometrySampleCount()
				});
				this.renderer.setGeometry(this.geometry);
			}
			const measured = this.measureHost();
			this.cssWidth = measured.width;
			this.cssHeight = measured.height;
			p.pixelDensity(this.desiredPixelDensity());
			const canvas = p.createCanvas(this.cssWidth, this.cssHeight);
			this.canvasElement = canvas.elt as HTMLCanvasElement;
			const context = this.canvasElement.getContext('2d', { alpha: false });
			if (!context) throw new Error('Canvas 2D is unavailable.');
			this.canvasContext = context;
			p.noiseDetail(this.config.octaves, this.config.falloff);
			this.seedNoise(p);
			p.frameRate(this.resolvedQuality === 'low' ? 30 : 60);
			this.decorateCanvas();
			this.installCanvasListeners();
			this.installObservers();
			this.createBuffers(p);
			this.ready = true;
			this.syncDiagnosticsAttributes(true);
			this.syncLoop();
		} catch {
			this.fail('This browser could not create the bloom drawing surfaces.');
		}
	}

	private draw(p: p5): void {
		if (
			this.destroyed ||
			this.failed ||
			!this.ready ||
			!this.canvasElement ||
			!this.canvasContext ||
			!this.buffers
		) {
			return;
		}
		const started = performance.now();
		if (this.lastDrawStarted > 0) {
			const cadence = Math.min(250, Math.max(1, started - this.lastDrawStarted));
			this.averageCadence = this.averageCadence * 0.9 + cadence * 0.1;
			this.fps = 1_000 / Math.max(1, this.averageCadence);
		}
		this.lastDrawStarted = started;
		if (this.shouldAnimate()) {
			const delta = Math.min(
				MAX_DELTA_MS,
				Math.max(0, Number.isFinite(p.deltaTime) ? p.deltaTime : 0)
			);
			this.elapsed += delta / 1_000;
		}

		const pointerEase = this.pointerTarget.active ? 0.16 : 0.075;
		this.pointer = {
			x: this.pointer.x + (this.pointerTarget.x - this.pointer.x) * pointerEase,
			y: this.pointer.y + (this.pointerTarget.y - this.pointer.y) * pointerEase,
			active:
				this.pointerTarget.active || Math.hypot(this.pointer.x - 0.5, this.pointer.y - 0.5) > 0.008
		};
		if (!this.pointerTarget.active) {
			this.pointerTarget = { x: 0.5, y: 0.5, active: false };
		}
		while (this.pulses.length > 0 && this.elapsed - this.pulses[0].startedAt > 1.6) {
			this.pulses.shift();
		}

		const profile = this.qualityProfile();
		const width = this.canvasElement.width;
		const height = this.canvasElement.height;
		let stats: BloomRenderStats;
		try {
			stats = this.renderer.render(
				this.canvasContext,
				this.layerSet ?? layersFromGraphics(this.buffers),
				{
					config: this.config,
					palette: this.currentPalette(),
					geometry: this.geometry,
					width,
					height,
					time: this.elapsed,
					pointer: this.pointer,
					pulses: this.pulses,
					quality: profile,
					noise: (x, y, z) => p.noise(x, y, z),
					particleSeed: this.particleSeed,
					redrawBackground: this.backgroundDirty,
					debug: this.debug,
					fps: this.fps,
					frameTime: this.lastFrameTime
				}
			);
		} catch {
			this.fail('The bloom frame could not be rendered on this canvas.');
			return;
		}
		this.backgroundDirty = false;
		this.ruptureCount = stats.ruptureCount;
		this.deformedPointCount = stats.deformedPointCount;
		this.frameCount += 1;
		this.lastFrameTime = Math.max(0, performance.now() - started);
		this.averageFrameTime = this.averageFrameTime * 0.94 + this.lastFrameTime * 0.06;
		this.considerAutoQuality();
		if (this.frameCount === 1 || this.frameCount % 12 === 0 || this.debug) {
			this.syncDiagnosticsAttributes(this.frameCount === 1);
		}
		if (!this.readyDelivered) {
			this.readyDelivered = true;
			this.onReady?.(this);
		}
	}

	private currentPalette() {
		return getPreset(this.config.palette).palette;
	}

	private geometrySampleCount(): number {
		if (this.resolvedQuality === 'low') return 30;
		return 56;
	}

	private measureHost(): { width: number; height: number } {
		const bounds = this.host.getBoundingClientRect();
		const width = boundedDimension(
			bounds.width || this.host.clientWidth,
			this.cssWidth || FALLBACK_CANVAS_WIDTH
		);
		const height = boundedDimension(
			bounds.height || this.host.clientHeight,
			this.cssHeight || Math.round(width * (FALLBACK_CANVAS_HEIGHT / FALLBACK_CANVAS_WIDTH))
		);
		return { width, height };
	}

	private chooseInitialQuality(): 'low' | 'high' {
		if (this.config.quality === 'low' || this.config.quality === 'high') return this.config.quality;
		const measured = this.measureHost();
		const area = measured.width * measured.height;
		const density = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
		const cores = typeof navigator === 'undefined' ? 8 : navigator.hardwareConcurrency || 4;
		return measured.width < 620 || area > 1_450_000 || density > 2.25 || cores <= 4
			? 'low'
			: 'high';
	}

	private desiredPixelDensity(): number {
		if (this.resolvedQuality === 'low') return 1;
		const density = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
		return Math.min(2, Math.max(1, Math.round(density)));
	}

	private qualityProfile(): RenderQuality {
		if (!this.config.motionEnabled) {
			return this.resolvedQuality === 'low' ? LOW_STILL_QUALITY : HIGH_STILL_QUALITY;
		}
		return this.resolvedQuality === 'low' ? LOW_QUALITY : HIGH_QUALITY;
	}

	private considerAutoQuality(): void {
		if (this.config.quality !== 'auto' || this.frameCount - this.lastQualityChangeFrame < 180)
			return;
		let next = this.resolvedQuality;
		if (this.resolvedQuality === 'high' && this.frameCount > 75 && this.averageFrameTime > 25) {
			next = 'low';
		} else if (
			this.resolvedQuality === 'low' &&
			this.frameCount > 360 &&
			this.averageFrameTime < 12.5 &&
			this.cssWidth >= 720 &&
			this.cssWidth * this.cssHeight < 1_200_000
		) {
			next = 'high';
		}
		if (next === this.resolvedQuality) return;
		this.resolvedQuality = next;
		this.lastQualityChangeFrame = this.frameCount;
		this.scheduleGeometryRebuild();
		if (!this.qualityFrame) {
			this.qualityFrame = window.requestAnimationFrame(() => {
				this.qualityFrame = 0;
				this.resize(this.cssWidth, this.cssHeight, true);
			});
		}
	}

	private seedNoise(p = this.instance): void {
		if (!p) return;
		const seeds = deriveBloomSeeds(this.config.seed);
		this.particleSeed = seeds.particles;
		p.noiseSeed(seeds.noise);
		p.randomSeed(seeds.morphology);
	}

	private createGraphics(p: p5, width: number, height: number): P5Graphics {
		const graphics = p.createGraphics(Math.max(1, width), Math.max(1, height));
		graphics.pixelDensity(1);
		if (graphics.elt.width !== width || graphics.elt.height !== height) {
			graphics.resizeCanvas(Math.max(1, width), Math.max(1, height), true);
		}
		return graphics;
	}

	private createBuffers(p: p5): void {
		this.releaseBuffers();
		const width = Math.max(1, this.canvasElement?.width ?? p.width);
		const height = Math.max(1, this.canvasElement?.height ?? p.height);
		const glowScale = this.qualityProfile().glowScale;
		this.buffers = {
			background: this.createGraphics(p, width, height),
			instrument: this.createGraphics(p, width, height),
			body: this.createGraphics(p, width, height),
			light: this.createGraphics(p, width, height),
			glow: this.createGraphics(
				p,
				Math.max(1, Math.round(width * glowScale)),
				Math.max(1, Math.round(height * glowScale))
			),
			particles: this.createGraphics(p, width, height)
		};
		this.layerSet = layersFromGraphics(this.buffers);
		this.bufferGeneration += 1;
		this.backgroundDirty = true;
	}

	private releaseBuffers(): void {
		if (!this.buffers) return;
		for (const graphics of Object.values(this.buffers)) graphics.remove();
		this.buffers = null;
		this.layerSet = null;
	}

	private decorateCanvas(): void {
		if (!this.canvasElement) return;
		this.canvasElement.tabIndex = 0;
		this.canvasElement.setAttribute('role', 'img');
		this.canvasElement.setAttribute('data-testid', 'perlin-bloom-canvas');
		this.canvasElement.setAttribute('data-perlin-bloom-canvas', 'true');
		this.canvasElement.setAttribute('data-renderer', 'canvas-2d');
		this.canvasElement.setAttribute('draggable', 'false');
		if (this.descriptionId) this.canvasElement.setAttribute('aria-describedby', this.descriptionId);
		this.updateAccessibleLabel();
	}

	private updateAccessibleLabel(): void {
		if (!this.canvasElement) return;
		const preset = getPreset(this.config.preset);
		const palette = getPreset(this.config.palette);
		const view = this.config.view === 'anatomy' ? 'Anatomy view' : 'Artwork view';
		const paletteDescription =
			palette.id === preset.id ? preset.name : `${preset.name} morphology in ${palette.name} light`;
		this.canvasElement.setAttribute(
			'aria-label',
			`${paletteDescription} Perlin bloom, seed ${this.config.seed}. ${this.config.petals} petals per whorl across ${this.config.whorls} whorls press through a luminous square boundary. ${view}. Move the pointer to bend outer petals. With canvas focus, use the arrow keys to move the focus point, Home to centre it, and Enter to send a pulse.`
		);
	}

	private installCanvasListeners(): void {
		const canvas = this.canvasElement;
		if (!canvas) return;
		let dragging = false;

		const updatePointer = (event: PointerEvent) => {
			const bounds = canvas.getBoundingClientRect();
			this.pointerTarget = {
				x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
				y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / Math.max(1, bounds.height))),
				active: true
			};
			if (dragging && event.cancelable) event.preventDefault();
			if (!this.shouldAnimate()) this.scheduleInteractionRedraw();
		};
		const pointerDown = (event: PointerEvent) => {
			if (event.button !== 0) return;
			dragging = true;
			canvas.focus({ preventScroll: true });
			canvas.setPointerCapture?.(event.pointerId);
			updatePointer(event);
			this.pulseAt(this.pointerTarget.x, this.pointerTarget.y);
		};
		const pointerUp = (event: PointerEvent) => {
			dragging = false;
			if (canvas.hasPointerCapture?.(event.pointerId))
				canvas.releasePointerCapture(event.pointerId);
			if (event.pointerType !== 'mouse') {
				this.pointerTarget = { x: 0.5, y: 0.5, active: false };
				this.scheduleInteractionRedraw();
			}
		};
		const pointerLeave = () => {
			if (!dragging) {
				this.pointerTarget = { x: 0.5, y: 0.5, active: false };
				this.scheduleInteractionRedraw();
			}
		};
		const keyDown = (event: KeyboardEvent) => {
			const step = event.shiftKey ? 0.1 : 0.035;
			let handled = true;
			if (event.key === 'ArrowLeft')
				this.pointerTarget = {
					...this.pointerTarget,
					x: clamp01(this.pointerTarget.x - step),
					active: true
				};
			else if (event.key === 'ArrowRight')
				this.pointerTarget = {
					...this.pointerTarget,
					x: clamp01(this.pointerTarget.x + step),
					active: true
				};
			else if (event.key === 'ArrowUp')
				this.pointerTarget = {
					...this.pointerTarget,
					y: clamp01(this.pointerTarget.y - step),
					active: true
				};
			else if (event.key === 'ArrowDown')
				this.pointerTarget = {
					...this.pointerTarget,
					y: clamp01(this.pointerTarget.y + step),
					active: true
				};
			else if (event.key === 'Home') this.pointerTarget = { x: 0.5, y: 0.5, active: true };
			else if (event.key === 'Enter') this.pulseAt(this.pointerTarget.x, this.pointerTarget.y);
			else handled = false;
			if (!handled) return;
			event.preventDefault();
			if (!this.shouldAnimate()) this.scheduleInteractionRedraw();
		};

		canvas.addEventListener('pointermove', updatePointer, { passive: false });
		canvas.addEventListener('pointerdown', pointerDown, { passive: false });
		canvas.addEventListener('pointerup', pointerUp);
		canvas.addEventListener('pointercancel', pointerUp);
		canvas.addEventListener('pointerleave', pointerLeave);
		canvas.addEventListener('keydown', keyDown);
		this.removeCanvasListeners = () => {
			canvas.removeEventListener('pointermove', updatePointer);
			canvas.removeEventListener('pointerdown', pointerDown);
			canvas.removeEventListener('pointerup', pointerUp);
			canvas.removeEventListener('pointercancel', pointerUp);
			canvas.removeEventListener('pointerleave', pointerLeave);
			canvas.removeEventListener('keydown', keyDown);
		};
	}

	private installObservers(): void {
		const scheduleResize = () => {
			if (this.destroyed || this.resizeFrame) return;
			this.resizeFrame = window.requestAnimationFrame(() => {
				this.resizeFrame = 0;
				const measured = this.measureHost();
				this.resize(measured.width, measured.height);
			});
		};

		if (typeof ResizeObserver === 'undefined') {
			window.addEventListener('resize', scheduleResize, { passive: true });
			this.removeWindowResize = () => window.removeEventListener('resize', scheduleResize);
		} else {
			this.resizeObserver = new ResizeObserver(scheduleResize);
			this.resizeObserver.observe(this.host);
		}

		if (typeof IntersectionObserver !== 'undefined') {
			this.intersectionObserver = new IntersectionObserver(
				(entries) => {
					this.offscreen = !(entries[0]?.isIntersecting ?? true);
					this.syncLoop();
				},
				{ rootMargin: '180px 0px', threshold: 0.01 }
			);
			this.intersectionObserver.observe(this.host);
		}
		document.addEventListener('visibilitychange', this.handleVisibility);
	}

	private readonly handleVisibility = () => {
		this.pageVisible = !document.hidden;
		this.syncLoop();
	};

	private scheduleInteractionRedraw(): void {
		if (this.destroyed || this.shouldAnimate() || this.interactionFrame) return;
		this.interactionFrame = window.requestAnimationFrame(() => {
			this.interactionFrame = 0;
			if (this.destroyed || this.shouldAnimate()) return;
			this.instance?.redraw();
			const targetDistance = Math.hypot(
				this.pointer.x - this.pointerTarget.x,
				this.pointer.y - this.pointerTarget.y
			);
			if (targetDistance > 0.002) {
				this.scheduleInteractionRedraw();
			} else if (!this.pointerTarget.active) {
				this.pointer = { x: 0.5, y: 0.5, active: false };
			}
		});
	}

	private shouldAnimate(): boolean {
		return (
			this.ready &&
			!this.destroyed &&
			!this.failed &&
			!this.paused &&
			this.config.motionEnabled &&
			this.pageVisible &&
			!this.offscreen
		);
	}

	private syncLoop(): void {
		if (!this.instance || !this.ready || this.destroyed || this.failed) return;
		if (this.shouldAnimate()) {
			this.instance.frameRate(this.resolvedQuality === 'low' ? 30 : 60);
			this.instance.loop();
		} else {
			this.instance.noLoop();
			if (this.pageVisible && !this.offscreen) this.instance.redraw();
		}
		this.syncDiagnosticsAttributes();
	}

	private scheduleGeometryRebuild(): void {
		if (this.rebuildTimer) window.clearTimeout(this.rebuildTimer);
		this.rebuildTimer = window.setTimeout(() => {
			this.rebuildTimer = 0;
			this.rebuildGeometry();
		}, GEOMETRY_REBUILD_DELAY_MS);
	}

	private syncDiagnosticsAttributes(force = false): void {
		if (!this.canvasElement) return;
		const diagnostics = this.getDiagnostics();
		const attributes: Readonly<Record<string, string>> = {
			'data-ready': String(diagnostics.ready),
			'data-morphology-hash': morphologyHash(this.config),
			'data-geometry-hash': this.geometry.morphologyHash,
			'data-config-hash': diagnostics.configHash,
			'data-seed-hash': hashToHex(this.geometry.seedHash),
			'data-view': this.config.view,
			'data-quality': this.config.quality,
			'data-resolved-quality': diagnostics.quality,
			'data-motion': this.shouldAnimate() ? 'alive' : 'still',
			'data-frame-count': String(diagnostics.frameCount),
			'data-buffer-generation': String(diagnostics.bufferGeneration),
			'data-rupture-count': String(diagnostics.ruptureCount),
			'data-petal-count': String(this.config.petals),
			'data-whorl-count': String(this.config.whorls),
			'data-fps': diagnostics.fps.toFixed(1),
			'data-frame-time': diagnostics.frameTime.toFixed(2)
		};
		for (const [name, value] of Object.entries(attributes)) {
			if (force || this.canvasElement.getAttribute(name) !== value) {
				this.canvasElement.setAttribute(name, value);
			}
		}
		this.host.dataset.engineMorphologyHash = morphologyHash(this.config);
		this.host.dataset.engineView = this.config.view;
		this.host.dataset.engineQuality = diagnostics.quality;
	}

	private fail(message: string): void {
		if (this.destroyed || this.failed) return;
		this.failed = true;
		this.ready = false;
		this.instance?.noLoop();
		this.host.dataset.engineError = 'true';
		this.onError?.(new Error(message));
	}

	setConfig(nextInput: Readonly<FlowerConfig> | Readonly<Partial<FlowerConfig>>): void {
		if (this.destroyed) return;
		const previous = this.config;
		const next = normalizeFlowerConfig({ ...previous, ...nextInput }, previous);
		const needsGeometry = changed(previous, next, GEOMETRY_KEYS);
		const needsBackground = changed(previous, next, BACKGROUND_KEYS);
		const needsNoiseDetail = previous.octaves !== next.octaves || previous.falloff !== next.falloff;
		const needsReseed = previous.seed !== next.seed;
		const needsQuality = previous.quality !== next.quality;
		this.config = next;
		if (needsNoiseDetail) this.instance?.noiseDetail(next.octaves, next.falloff);
		if (needsReseed) this.seedNoise();
		if (needsBackground || needsReseed) this.backgroundDirty = true;
		if (needsGeometry || previous.motionEnabled !== next.motionEnabled) {
			this.scheduleGeometryRebuild();
		}
		if (needsQuality) {
			this.resolvedQuality = this.chooseInitialQuality();
			this.scheduleGeometryRebuild();
			this.resize(this.cssWidth, this.cssHeight, true);
		}
		this.updateAccessibleLabel();
		this.syncDiagnosticsAttributes(true);
		if (!this.shouldAnimate()) this.instance?.redraw();
		else this.syncLoop();
	}

	rebuildGeometry(): void {
		if (this.destroyed) return;
		if (this.rebuildTimer) {
			window.clearTimeout(this.rebuildTimer);
			this.rebuildTimer = 0;
		}
		this.geometry = buildBloomGeometry(this.config, {
			samplesPerPetal: this.geometrySampleCount()
		});
		this.renderer.setGeometry(this.geometry);
		this.backgroundDirty = true;
		this.syncDiagnosticsAttributes(true);
		if (!this.shouldAnimate()) this.instance?.redraw();
	}

	setPaused(paused: boolean): void {
		if (this.destroyed || this.paused === paused) return;
		this.paused = paused;
		this.onPausedChange?.(paused);
		this.syncLoop();
		if (paused && !this.pointerTarget.active) this.scheduleInteractionRedraw();
	}

	getPaused(): boolean {
		return this.paused;
	}

	setOffscreen(offscreen: boolean): void {
		if (this.destroyed || this.offscreen === offscreen) return;
		this.offscreen = offscreen;
		this.syncLoop();
	}

	setPageVisible(visible: boolean): void {
		if (this.destroyed || this.pageVisible === visible) return;
		this.pageVisible = visible;
		this.syncLoop();
	}

	pulseAt(x: number, y: number): void {
		if (this.destroyed) return;
		const pulse: BloomPulse = {
			x: clamp01(Number.isFinite(x) ? x : 0.5),
			y: clamp01(Number.isFinite(y) ? y : 0.5),
			startedAt: this.elapsed,
			strength: 1
		};
		if (this.pulses.length >= MAX_PULSES) this.pulses.shift();
		this.pulses.push(pulse);
		if (!this.shouldAnimate()) this.instance?.redraw();
	}

	resize(width: number, height: number, force = false): void {
		if (this.destroyed || !this.instance || !this.ready) return;
		const nextWidth = boundedDimension(width, this.cssWidth);
		const nextHeight = boundedDimension(height, this.cssHeight);
		if (!force && nextWidth === this.cssWidth && nextHeight === this.cssHeight) return;
		this.cssWidth = nextWidth;
		this.cssHeight = nextHeight;
		this.instance.pixelDensity(this.desiredPixelDensity());
		this.instance.resizeCanvas(nextWidth, nextHeight, true);
		this.createBuffers(this.instance);
		this.syncDiagnosticsAttributes(true);
		if (!this.shouldAnimate()) this.instance.redraw();
	}

	getCanvasElement(): HTMLCanvasElement | null {
		return this.canvasElement;
	}

	getElapsedTime(): number {
		return this.elapsed;
	}

	getDiagnostics(): PerlinBloomDiagnostics {
		return {
			ready: this.ready,
			destroyed: this.destroyed,
			paused: this.paused,
			pageVisible: this.pageVisible,
			offscreen: this.offscreen,
			quality: this.resolvedQuality,
			fps: this.fps,
			frameTime: this.lastFrameTime,
			frameCount: this.frameCount,
			elapsed: this.elapsed,
			ruptureCount: this.ruptureCount,
			deformedPointCount: this.deformedPointCount,
			canvasWidth: this.canvasElement?.width ?? 0,
			canvasHeight: this.canvasElement?.height ?? 0,
			bufferGeneration: this.bufferGeneration,
			morphologyHash: morphologyHash(this.config),
			configHash: configHash(this.config)
		};
	}

	async exportStill(options: ExportStillOptions = {}): Promise<ExportResult> {
		if (this.destroyed || !this.ready || !this.instance) {
			throw new Error('The bloom renderer is not ready to export.');
		}
		// Export the latest requested morphology even if a slider debounce is still pending.
		if (this.geometry.morphologyHash !== morphologyHash(this.config)) this.rebuildGeometry();
		const plan = createExportPlan(this.config, {
			width: Math.max(1, this.cssWidth),
			height: Math.max(1, this.cssHeight),
			scale: options.scale ?? 1,
			includeSignature: options.signature,
			filename: options.filename
		});
		const { width, height, filename } = plan;
		const generation = ++this.exportGeneration;

		try {
			const output = document.createElement('canvas');
			output.width = width;
			output.height = height;
			const context = output.getContext('2d', { alpha: false });
			if (!context) throw new Error('This browser could not create the export canvas.');
			const layers = createExportLayers(width, height, HIGH_QUALITY);
			const exportGeometry = buildBloomGeometry(this.config, { samplesPerPetal: 64 });
			const exportRenderer = new PerlinBloomRenderer(exportGeometry);
			const exportParticleSeed = deriveBloomSeeds(this.config.seed).particles;
			this.instance.noiseDetail(this.config.octaves, this.config.falloff);
			this.seedNoise(this.instance);
			const selectedTime = Number.isFinite(options.time) ? Math.max(0, options.time as number) : 0;
			const trailFrames = this.config.trails > 0 && this.config.motionEnabled ? 3 : 1;
			for (let trailIndex = 0; trailIndex < trailFrames; trailIndex += 1) {
				exportRenderer.render(context, layers, {
					config: this.config,
					palette: this.currentPalette(),
					geometry: exportGeometry,
					width,
					height,
					time: Math.max(0, selectedTime - (trailFrames - trailIndex - 1) * 0.055),
					pointer: { x: 0.5, y: 0.5, active: false },
					pulses: [],
					quality: HIGH_QUALITY,
					noise: (x, y, z) => this.instance?.noise(x, y, z) ?? 0.5,
					particleSeed: exportParticleSeed,
					redrawBackground: trailIndex === 0
				});
			}
			if (plan.includeSignature) this.drawSignature(context, width, height);
			const blob = await canvasBlob(output);
			if (this.destroyed || generation !== this.exportGeneration) {
				throw new Error('The export was cancelled because the bloom was closed.');
			}
			if (options.download) this.downloadBlob(blob, filename);
			return {
				blob,
				width,
				height,
				scale: plan.scale,
				wasCapped: plan.wasCapped,
				filename
			};
		} catch (error) {
			if (error instanceof Error && /cancelled/iu.test(error.message)) throw error;
			throw new Error('The browser could not allocate or encode this PNG. Try a smaller scale.', {
				cause: error
			});
		}
	}

	private drawSignature(context: CanvasRenderingContext2D, width: number, height: number): void {
		const shortest = Math.min(width, height);
		const fontSize = Math.max(10, Math.min(22, shortest * 0.018));
		const padding = fontSize * 0.9;
		context.save();
		context.font = `500 ${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
		context.textAlign = 'right';
		context.textBaseline = 'bottom';
		context.fillStyle = 'rgba(2, 4, 12, 0.58)';
		const label = `PERLIN BLOOM · ${this.config.seed}`;
		const measured = context.measureText(label).width;
		context.fillRect(
			width - measured - padding * 2,
			height - fontSize - padding * 1.6,
			measured + padding * 1.5,
			fontSize + padding
		);
		context.fillStyle = 'rgba(228, 249, 255, 0.76)';
		context.fillText(label, width - padding, height - padding * 0.55);
		context.restore();
	}

	private downloadBlob(blob: Blob, filename: string): void {
		const url = URL.createObjectURL(blob);
		this.objectUrls.add(url);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.rel = 'noopener';
		anchor.click();
		const timer = window.setTimeout(() => {
			this.revokeTimers.delete(timer);
			this.objectUrls.delete(url);
			URL.revokeObjectURL(url);
		}, 0);
		this.revokeTimers.add(timer);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.ready = false;
		this.exportGeneration += 1;
		if (this.rebuildTimer) window.clearTimeout(this.rebuildTimer);
		if (this.resizeFrame) window.cancelAnimationFrame(this.resizeFrame);
		if (this.qualityFrame) window.cancelAnimationFrame(this.qualityFrame);
		if (this.interactionFrame) window.cancelAnimationFrame(this.interactionFrame);
		this.resizeObserver?.disconnect();
		this.intersectionObserver?.disconnect();
		document.removeEventListener('visibilitychange', this.handleVisibility);
		this.removeWindowResize();
		this.removeCanvasListeners();
		for (const timer of this.revokeTimers) window.clearTimeout(timer);
		this.revokeTimers.clear();
		for (const url of this.objectUrls) URL.revokeObjectURL(url);
		this.objectUrls.clear();
		this.releaseBuffers();
		this.pulses.length = 0;
		this.instance?.remove();
		this.instance = null;
		this.canvasContext = null;
		this.canvasElement = null;
	}
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}
