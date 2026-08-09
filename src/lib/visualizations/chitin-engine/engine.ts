import { FallbackRenderer, renderFallbackFrame } from './fallback-renderer';
import { canvasToBlob, planExportDimensions } from './export';
import { normalizeExhibitState } from './genome';
import { buildCreaturePhenotype } from './phenotype-builder';
import { createCreaturePose, updateCreaturePose, type ChitinPose } from './pose';
import { getPalette } from './presets';
import { createRenderPacket, fillRenderPacket } from './render-packet';
import {
	WebGLRenderer,
	deriveRenderProjection,
	type RenderProjection,
	type WebGLRenderStats
} from './webgl-renderer';
import type { BodyPlate, CreaturePhenotype, ExhibitState, RenderPacket, Vec2 } from './types';

export type ChitinRendererKind = 'webgl2' | 'canvas2d';
export type ChitinEngineStatus = 'loading' | 'ready' | 'fallback' | 'context-lost' | 'error';

export type ChitinEngineOptions = Readonly<{
	host: HTMLElement;
	state: ExhibitState;
	descriptionId: string;
	selectedSegment?: number;
	reducedMotion?: boolean;
	posterMode?: boolean;
	onStatus?: (status: ChitinEngineStatus, message: string, renderer: ChitinRendererKind) => void;
	onSelection?: (segment: number) => void;
	onCameraChange?: (camera: Pick<ExhibitState, 'cameraYaw' | 'cameraPitch'>) => void;
}>;

export type ChitinExportOptions = Readonly<{
	width: number;
	height: number;
	scale?: 1 | 2 | 4;
	transparent?: boolean;
	includeLabel?: boolean;
}>;

type PointerState = {
	id: number;
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	dragging: boolean;
} | null;

const MAX_EXPORT_EDGE = 8_192;
const MAX_EXPORT_PIXELS = 24_000_000;
const MAX_VIEWPORT_EDGE = 4_096;
const MAX_VIEWPORT_PIXELS = 12_000_000;

export type ViewportAllocation = Readonly<{
	width: number;
	height: number;
	pixelRatio: number;
	backingWidth: number;
	backingHeight: number;
	capped: boolean;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function sameGenome(left: ExhibitState['genome'], right: ExhibitState['genome']): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/** Keeps ordinary viewport canvases below both edge and total-pixel budgets. */
export function resolveViewportAllocation(
	widthInput: number,
	heightInput: number,
	devicePixelRatioInput: number,
	maximumPixelRatioInput: number
): ViewportAllocation {
	const sourceWidth = Math.max(2, Number.isFinite(widthInput) ? widthInput : 2);
	const sourceHeight = Math.max(2, Number.isFinite(heightInput) ? heightInput : 2);
	const maximumPixelRatio = clamp(
		Number.isFinite(maximumPixelRatioInput) ? maximumPixelRatioInput : 1,
		0.5,
		3
	);
	const desiredRatio = clamp(
		Number.isFinite(devicePixelRatioInput) ? devicePixelRatioInput : 1,
		0.75,
		maximumPixelRatio
	);
	const edgeScale = MAX_VIEWPORT_EDGE / Math.max(sourceWidth, sourceHeight);
	const pixelScale = Math.sqrt(MAX_VIEWPORT_PIXELS / (sourceWidth * sourceHeight));
	const totalScale = Math.min(desiredRatio, edgeScale, pixelScale);
	// Both renderers accept a minimum DPR of 0.5. Reduce their logical size as
	// well when an exceptionally large host needs a smaller total backing scale.
	const pixelRatio = clamp(totalScale, 0.5, maximumPixelRatio);
	const logicalScale = Math.min(1, totalScale / pixelRatio);
	const width = Math.max(2, sourceWidth * logicalScale);
	const height = Math.max(2, sourceHeight * logicalScale);
	const backingWidth = Math.max(1, Math.round(width * pixelRatio));
	const backingHeight = Math.max(1, Math.round(height * pixelRatio));
	return {
		width,
		height,
		pixelRatio,
		backingWidth,
		backingHeight,
		capped:
			backingWidth < Math.round(sourceWidth * desiredRatio) ||
			backingHeight < Math.round(sourceHeight * desiredRatio)
	};
}

function maximumSegmentIndex(phenotype: CreaturePhenotype): number {
	let maximum = -1;
	for (const plate of phenotype.plates) {
		if (Number.isFinite(plate.segmentIndex)) {
			maximum = Math.max(maximum, Math.round(plate.segmentIndex));
		}
	}
	return maximum;
}

function projectPlateForSelection(
	plate: BodyPlate,
	bodyOffset: Vec2,
	projection: RenderProjection,
	state: Pick<ExhibitState, 'cameraYaw' | 'cameraPitch' | 'cameraRoll'>,
	width: number,
	height: number
): Vec2 {
	const dx = plate.center.x + bodyOffset.x - projection.centerX;
	const dy = plate.center.y + bodyOffset.y - projection.centerY;
	const cosine = Math.cos(state.cameraRoll);
	const sine = Math.sin(state.cameraRoll);
	let x = dx * cosine - dy * sine;
	let y = dx * sine + dy * cosine;
	x = x * Math.cos(state.cameraYaw) + plate.depth * Math.sin(state.cameraYaw) * 0.22;
	y = y * Math.cos(state.cameraPitch) + plate.depth * Math.sin(state.cameraPitch) * 0.22;
	return {
		x: (x * projection.scaleX * 0.5 + 0.5) * width,
		y: (0.5 - y * projection.scaleY * 0.5) * height
	};
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
	canvas.width = 1;
	canvas.height = 1;
}

export class ChitinEngine {
	readonly host: HTMLElement;
	private canvas: HTMLCanvasElement;
	private webgl: WebGLRenderer | null = null;
	private fallback: FallbackRenderer | null = null;
	private rendererKind: ChitinRendererKind = 'canvas2d';
	private state: ExhibitState;
	private phenotype: CreaturePhenotype;
	private pose: ChitinPose;
	private packet: RenderPacket;
	private selectedSegment: number;
	private readonly options: ChitinEngineOptions;
	private resizeObserver: ResizeObserver | null = null;
	private intersectionObserver: IntersectionObserver | null = null;
	private resizeFrame = 0;
	private animationFrame = 0;
	private restoreFallbackTimer: ReturnType<typeof setTimeout> | undefined;
	private previousTimestamp = 0;
	private visible = true;
	private documentVisible = true;
	private contextRecovering = false;
	private renderingFailed = false;
	private exportInProgress = false;
	private reducedMotion: boolean;
	private posterMode: boolean;
	private disposed = false;
	private readyReported = false;
	private dirty = true;
	private singleStepRequested = false;
	private startleRequested = false;
	private threatActive = false;
	private pointer: PointerState = null;
	private dragYaw = 0;
	private dragPitch = 0;
	private hoverYaw = 0;
	private hoverPitch = 0;

	private readonly handleVisibility = (): void => {
		this.documentVisible = document.visibilityState !== 'hidden';
		this.previousTimestamp = 0;
		if (this.documentVisible) this.requestDraw();
	};

	private readonly handlePointerDown = (event: PointerEvent): void => {
		if (this.disposed || event.button !== 0) return;
		this.pointer = {
			id: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			lastY: event.clientY,
			dragging: false
		};
		try {
			this.canvas.setPointerCapture?.(event.pointerId);
		} catch {
			// Pointer capture is optional; ordinary pointer-up handling remains active.
		}
	};

	private readonly handlePointerMove = (event: PointerEvent): void => {
		const bounds = this.canvas.getBoundingClientRect();
		if (bounds.width <= 0 || bounds.height <= 0) return;
		const localX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
		const localY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
		if (!this.pointer || this.pointer.id !== event.pointerId) {
			this.hoverYaw = (localX - 0.5) * 0.028;
			this.hoverPitch = (0.5 - localY) * 0.018;
			this.dirty = true;
			this.requestDraw();
			return;
		}
		const distance = Math.hypot(
			event.clientX - this.pointer.startX,
			event.clientY - this.pointer.startY
		);
		if (distance > 6) this.pointer.dragging = true;
		if (this.pointer.dragging) {
			event.preventDefault();
			this.dragYaw = clamp(
				this.dragYaw + ((event.clientX - this.pointer.lastX) / bounds.width) * 0.55,
				-0.35 - this.state.cameraYaw,
				0.35 - this.state.cameraYaw
			);
			this.dragPitch = clamp(
				this.dragPitch + ((event.clientY - this.pointer.lastY) / bounds.height) * 0.4,
				-0.22 - this.state.cameraPitch,
				0.22 - this.state.cameraPitch
			);
		}
		this.pointer.lastX = event.clientX;
		this.pointer.lastY = event.clientY;
		this.dirty = true;
		this.requestDraw();
	};

	private readonly handlePointerUp = (event: PointerEvent): void => {
		if (!this.pointer || this.pointer.id !== event.pointerId) return;
		const dragged = this.pointer.dragging;
		try {
			if (!this.canvas.hasPointerCapture || this.canvas.hasPointerCapture(event.pointerId)) {
				this.canvas.releasePointerCapture?.(event.pointerId);
			}
		} catch {
			// The capture may already have been released by browser gesture handling.
		}
		this.pointer = null;
		if (dragged) {
			const cameraYaw = clamp(this.state.cameraYaw + this.dragYaw, -0.35, 0.35);
			const cameraPitch = clamp(this.state.cameraPitch + this.dragPitch, -0.22, 0.22);
			this.state = normalizeExhibitState({ ...this.state, cameraYaw, cameraPitch });
			this.dragYaw = 0;
			this.dragPitch = 0;
			try {
				this.options.onCameraChange?.({ cameraYaw, cameraPitch });
			} catch {
				// Consumer callbacks cannot be allowed to break the render lifecycle.
			}
		} else {
			this.startle();
			if (this.state.view === 'anatomy' || this.state.view === 'gait') {
				this.selectNearest(event.clientX, event.clientY);
			}
		}
		this.requestDraw();
	};

	private readonly handlePointerCancel = (event: PointerEvent): void => {
		if (!this.pointer || this.pointer.id !== event.pointerId) return;
		this.pointer = null;
		this.dragYaw = 0;
		this.dragPitch = 0;
		this.dirty = true;
		this.requestDraw();
	};

	private readonly handlePointerLeave = (): void => {
		if (this.pointer) return;
		this.hoverYaw = 0;
		this.hoverPitch = 0;
		this.dirty = true;
		this.requestDraw();
	};

	constructor(options: ChitinEngineOptions) {
		this.options = options;
		this.host = options.host;
		this.state = normalizeExhibitState(options.state);
		this.phenotype = buildCreaturePhenotype(this.state.genome);
		this.pose = createCreaturePose(this.phenotype, {
			paused: this.state.paused,
			genomeTime: options.posterMode ? 1.84 : 0
		});
		this.packet = createRenderPacket({ view: this.state.view });
		const initialSelection =
			typeof options.selectedSegment === 'number' && Number.isFinite(options.selectedSegment)
				? options.selectedSegment
				: -1;
		this.selectedSegment = clamp(
			Math.round(initialSelection),
			-1,
			maximumSegmentIndex(this.phenotype)
		);
		this.reducedMotion = options.reducedMotion === true;
		this.posterMode = options.posterMode === true;
		this.canvas = this.createCanvas();
		this.host.appendChild(this.canvas);
		this.installRenderer();
		this.installLifecycle();
		this.resize();
		this.requestDraw();
	}

	private createCanvas(): HTMLCanvasElement {
		const canvas = document.createElement('canvas');
		canvas.className = 'chitin-render-canvas';
		canvas.dataset.chitinCanvas = 'true';
		canvas.dataset.rendererStatus = 'loading';
		canvas.setAttribute('aria-hidden', 'true');
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block';
		canvas.style.touchAction = 'pan-y';
		return canvas;
	}

	private installRenderer(): void {
		this.renderingFailed = false;
		this.report('loading', 'Assembling the specimen graph and shell field.');
		try {
			this.webgl = new WebGLRenderer(this.canvas, {
				onContextLost: () => this.contextLost(),
				onContextRestored: () => this.contextRestored(),
				onError: (error) => this.switchToFallback(error.message)
			});
			this.rendererKind = 'webgl2';
			this.contextRecovering = false;
			this.canvas.dataset.renderer = 'webgl2';
		} catch (error) {
			const message = error instanceof Error ? error.message : 'WebGL2 initialization failed.';
			this.switchToFallback(message);
		}
	}

	private replaceCanvas(): void {
		this.removePointerListeners();
		this.pointer = null;
		this.dragYaw = 0;
		this.dragPitch = 0;
		const previous = this.canvas;
		const replacement = this.createCanvas();
		previous.replaceWith(replacement);
		releaseCanvas(previous);
		this.canvas = replacement;
		this.addPointerListeners();
	}

	private switchToFallback(reason: string): void {
		if (this.disposed) return;
		clearTimeout(this.restoreFallbackTimer);
		this.restoreFallbackTimer = undefined;
		this.contextRecovering = false;
		this.webgl?.dispose();
		this.webgl = null;
		this.fallback?.dispose();
		this.fallback = null;
		this.replaceCanvas();
		this.rendererKind = 'canvas2d';
		try {
			this.fallback = new FallbackRenderer(this.canvas);
			this.renderingFailed = false;
			this.canvas.dataset.renderer = 'canvas2d';
			this.report(
				'fallback',
				`Advanced shell rendering is unavailable. A simplified specimen is shown. ${reason}`
			);
			this.resize();
			this.dirty = true;
			this.requestDraw();
		} catch {
			this.renderingFailed = true;
			this.report('error', 'Neither WebGL2 nor Canvas2D could open the specimen chamber.');
		}
	}

	private contextLost(): void {
		if (this.disposed) return;
		this.contextRecovering = true;
		if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
		this.animationFrame = 0;
		this.report(
			'context-lost',
			'Graphics context lost. Preserving the genome while recovery is attempted.'
		);
		this.restoreFallbackTimer = setTimeout(() => {
			if (this.webgl?.isContextLost) {
				this.switchToFallback('The WebGL2 context did not return in time.');
			}
		}, 2_400);
	}

	private contextRestored(): void {
		clearTimeout(this.restoreFallbackTimer);
		this.restoreFallbackTimer = undefined;
		this.contextRecovering = false;
		this.previousTimestamp = 0;
		this.report('ready', 'WebGL2 restored. The same genome has been reconstructed.');
		this.dirty = true;
		this.requestDraw();
	}

	private installLifecycle(): void {
		this.addPointerListeners();
		document.addEventListener('visibilitychange', this.handleVisibility);
		if (typeof ResizeObserver === 'undefined') {
			window.addEventListener('resize', this.resize);
		} else {
			this.resizeObserver = new ResizeObserver(() => {
				if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
				this.resizeFrame = requestAnimationFrame(this.resize);
			});
			this.resizeObserver.observe(this.host);
		}
		if (typeof IntersectionObserver !== 'undefined') {
			this.intersectionObserver = new IntersectionObserver(
				(entries) => {
					this.visible = entries.some(
						(entry) => entry.isIntersecting && entry.intersectionRatio > 0.02
					);
					this.previousTimestamp = 0;
					if (this.visible) this.requestDraw();
				},
				{ threshold: [0, 0.02, 0.2] }
			);
			this.intersectionObserver.observe(this.host);
		}
	}

	private addPointerListeners(): void {
		this.canvas.addEventListener('pointerdown', this.handlePointerDown);
		this.canvas.addEventListener('pointermove', this.handlePointerMove);
		this.canvas.addEventListener('pointerup', this.handlePointerUp);
		this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
		this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
	}

	private removePointerListeners(): void {
		this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
		this.canvas.removeEventListener('pointermove', this.handlePointerMove);
		this.canvas.removeEventListener('pointerup', this.handlePointerUp);
		this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
		this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
	}

	private readonly resize = (): void => {
		this.resizeFrame = 0;
		if (this.disposed) return;
		const bounds = this.host.getBoundingClientRect();
		if (bounds.width < 2 || bounds.height < 2) return;
		const quality = this.state.quality;
		const maximumRatio =
			quality === 'low'
				? 1
				: quality === 'medium'
					? 1.5
					: quality === 'high'
						? 2.25
						: bounds.width < 700
							? 1.25
							: 2;
		const allocation = resolveViewportAllocation(
			bounds.width,
			bounds.height,
			window.devicePixelRatio || 1,
			maximumRatio
		);
		this.webgl?.setSize(allocation.width, allocation.height, allocation.pixelRatio);
		this.fallback?.setSize(allocation.width, allocation.height, allocation.pixelRatio);
		this.dirty = true;
		this.requestDraw();
	};

	private report(status: ChitinEngineStatus, message: string): void {
		this.canvas.dataset.rendererStatus = status;
		try {
			this.options.onStatus?.(status, message, this.rendererKind);
		} catch {
			// Status presentation is owned by the caller; rendering must remain usable.
		}
	}

	private requestDraw(): void {
		if (
			this.disposed ||
			this.animationFrame ||
			!this.visible ||
			!this.documentVisible ||
			this.contextRecovering ||
			this.renderingFailed
		)
			return;
		this.animationFrame = requestAnimationFrame(this.draw);
	}

	private readonly draw = (timestamp: number): void => {
		this.animationFrame = 0;
		if (this.disposed || !this.visible || !this.documentVisible || this.contextRecovering) return;
		const deltaTime = this.previousTimestamp > 0 ? (timestamp - this.previousTimestamp) / 1_000 : 0;
		this.previousTimestamp = timestamp;
		const motionAllowed = !this.state.paused && !this.reducedMotion && !this.posterMode;
		updateCreaturePose(this.pose, this.phenotype, {
			deltaTime,
			paused: !motionAllowed,
			singleStep: this.singleStepRequested,
			reducedMotion: this.reducedMotion && !this.singleStepRequested,
			threat: this.threatActive,
			startle: this.startleRequested
		});
		this.singleStepRequested = false;
		this.startleRequested = false;
		fillRenderPacket(this.packet, this.phenotype, this.pose, {
			view: this.state.view,
			selectedSegment: this.selectedSegment,
			includeOverlays: true,
			maxSurfaceInstances:
				this.state.quality === 'low' ? 240 : this.state.quality === 'high' ? 1_200 : 640
		});
		const frameState = normalizeExhibitState({
			...this.state,
			cameraYaw: this.state.cameraYaw + this.dragYaw + this.hoverYaw,
			cameraPitch: this.state.cameraPitch + this.dragPitch + this.hoverPitch,
			paused: !motionAllowed
		});
		try {
			if (this.webgl) {
				const stats: WebGLRenderStats = this.webgl.render(this.packet, {
					state: frameState,
					palette: getPalette(this.phenotype.genome.palette),
					time: this.pose.time,
					padding: this.posterMode ? 0.045 : 0.08
				});
				if (stats.truncated && !this.readyReported) {
					this.report(
						'ready',
						'Specimen ready; secondary surface marks were capped for this device.'
					);
				}
			} else if (this.fallback) {
				this.fallback.render(this.phenotype, this.pose, frameState, {
					palette: getPalette(this.phenotype.genome.palette),
					selectedSegment: this.selectedSegment,
					includeLabel: this.posterMode,
					includeOverlays: true,
					time: this.pose.time,
					label: `${this.phenotype.informalName} · ${this.phenotype.archiveDesignation}`
				});
			}
			if (!this.readyReported) {
				this.readyReported = true;
				this.report(
					this.rendererKind === 'webgl2' ? 'ready' : 'fallback',
					this.rendererKind === 'webgl2'
						? 'Specimen ready. Drag to tilt; tap for a startle response.'
						: 'Simplified Canvas2D specimen ready.'
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'The renderer stopped unexpectedly.';
			if (this.webgl) this.switchToFallback(message);
			else {
				this.renderingFailed = true;
				this.report('error', message);
			}
		}
		this.dirty = false;
		// Threat/startle transitions deliberately freeze with all other pose state
		// while paused. Scheduling on their unequal targets here would create a
		// permanent no-op RAF loop.
		if (motionAllowed) this.requestDraw();
	};

	private selectNearest(clientX: number, clientY: number): void {
		const bounds = this.canvas.getBoundingClientRect();
		if (bounds.width <= 0 || bounds.height <= 0 || this.packet.plateCount === 0) return;
		const projection = deriveRenderProjection(this.packet, bounds.width, bounds.height, 0.08);
		const camera = {
			cameraYaw: clamp(this.state.cameraYaw + this.hoverYaw, -0.7, 0.7),
			cameraPitch: clamp(this.state.cameraPitch + this.hoverPitch, -0.5, 0.5),
			cameraRoll: this.state.cameraRoll
		};
		let closest = -1;
		let distance = Number.POSITIVE_INFINITY;
		for (const plate of this.phenotype.plates) {
			const projected = projectPlateForSelection(
				plate,
				this.pose.bodyOffset,
				projection,
				camera,
				bounds.width,
				bounds.height
			);
			const x = bounds.left + projected.x;
			const y = bounds.top + projected.y;
			const candidate = Math.hypot(clientX - x, clientY - y);
			if (candidate < distance) {
				distance = candidate;
				closest = plate.segmentIndex;
			}
		}
		if (closest >= 0 && distance < Math.max(44, bounds.width * 0.12)) {
			this.setSelectedSegment(closest);
			try {
				this.options.onSelection?.(closest);
			} catch {
				// Selection callbacks are advisory and must not abort pointer handling.
			}
		}
	}

	setState(input: ExhibitState): void {
		if (this.disposed) return;
		const next = normalizeExhibitState(input, this.state);
		if (!sameGenome(next.genome, this.state.genome)) {
			this.phenotype = buildCreaturePhenotype(next.genome);
			this.pose = createCreaturePose(this.phenotype, {
				paused: next.paused,
				genomeTime: this.posterMode ? 1.84 : 0
			});
			this.selectedSegment = clamp(this.selectedSegment, -1, maximumSegmentIndex(this.phenotype));
		}
		this.state = next;
		this.dirty = true;
		this.resize();
		this.requestDraw();
	}

	setReducedMotion(value: boolean): void {
		if (this.disposed) return;
		this.reducedMotion = value;
		this.previousTimestamp = 0;
		this.dirty = true;
		this.requestDraw();
	}

	setPosterMode(value: boolean): void {
		if (this.disposed) return;
		this.posterMode = value;
		this.previousTimestamp = 0;
		this.dirty = true;
		this.requestDraw();
	}

	setSelectedSegment(value: number): void {
		if (this.disposed) return;
		this.selectedSegment = clamp(
			Math.round(Number.isFinite(value) ? value : -1),
			-1,
			maximumSegmentIndex(this.phenotype)
		);
		this.dirty = true;
		this.requestDraw();
	}

	startle(): void {
		if (this.disposed) return;
		this.startleRequested = true;
		this.requestDraw();
	}

	setThreat(value: boolean): void {
		if (this.disposed) return;
		this.threatActive = value;
		this.requestDraw();
	}

	singleStep(): void {
		if (this.disposed) return;
		this.singleStepRequested = true;
		this.requestDraw();
	}

	getCanvasElement(): HTMLCanvasElement {
		return this.canvas;
	}

	getRendererKind(): ChitinRendererKind {
		return this.rendererKind;
	}

	getPhenotype(): CreaturePhenotype {
		return this.phenotype;
	}

	async exportStill(options: ChitinExportOptions): Promise<Blob> {
		if (this.disposed) throw new Error('Cannot export a destroyed Chitin Engine.');
		if (this.exportInProgress) throw new Error('A Chitin Engine export is already in progress.');
		this.exportInProgress = true;
		try {
			return await this.renderStill(options);
		} finally {
			this.exportInProgress = false;
		}
	}

	private async renderStill(options: ChitinExportOptions): Promise<Blob> {
		if (
			!Number.isFinite(options.width) ||
			!Number.isFinite(options.height) ||
			options.width <= 0 ||
			options.height <= 0
		) {
			throw new RangeError('Export dimensions must be positive finite numbers.');
		}
		const baseWidth = clamp(Math.round(options.width), 64, MAX_EXPORT_EDGE);
		const baseHeight = clamp(Math.round(options.height), 64, MAX_EXPORT_EDGE);
		const plan = planExportDimensions(baseWidth, baseHeight, options.scale ?? 1, {
			maxLongestEdge: MAX_EXPORT_EDGE,
			maxPixels: MAX_EXPORT_PIXELS,
			workingCopies: 2
		});
		if (!plan.safe) {
			throw new RangeError(plan.reason ?? 'The requested still image exceeds safe export limits.');
		}
		const { width, height } = plan;
		const exportState = normalizeExhibitState({ ...this.state, paused: true });
		const exportPacket = createRenderPacket({ view: exportState.view, selectedSegment: -1 });
		fillRenderPacket(exportPacket, this.phenotype, this.pose, {
			view: exportState.view,
			selectedSegment: -1,
			includeOverlays: exportState.view !== 'specimen'
		});
		const includeLabel = options.includeLabel ?? true;

		// Canvas context modes cannot be switched after one has been acquired. A
		// failed WebGL export therefore gets its own disposable canvas, and the
		// deterministic Canvas2D fallback always starts on a fresh one.
		if (!options.transparent && !includeLabel) {
			let webglCanvas: HTMLCanvasElement | null = null;
			let renderer: WebGLRenderer | null = null;
			try {
				webglCanvas = document.createElement('canvas');
				webglCanvas.width = width;
				webglCanvas.height = height;
				renderer = new WebGLRenderer(webglCanvas, {
					contextAttributes: { preserveDrawingBuffer: true, alpha: false, antialias: true }
				});
				renderer.setSize(width, height, 1);
				renderer.render(exportPacket, {
					state: exportState,
					palette: getPalette(this.phenotype.genome.palette),
					time: this.pose.time,
					padding: 0.055
				});
				return await canvasToBlob(webglCanvas, 'image/png');
			} catch {
				// Continue through the required deterministic Canvas2D export route.
			} finally {
				renderer?.dispose();
				if (webglCanvas) releaseCanvas(webglCanvas);
			}
		}

		let fallbackCanvas: HTMLCanvasElement | null = null;
		try {
			fallbackCanvas = document.createElement('canvas');
			fallbackCanvas.width = width;
			fallbackCanvas.height = height;
			const context = fallbackCanvas.getContext('2d', { alpha: true });
			if (!context) throw new Error('Canvas2D is unavailable.');
			renderFallbackFrame(context, this.phenotype, this.pose, exportState, {
				palette: getPalette(this.phenotype.genome.palette),
				width,
				height,
				pixelRatio: 1,
				transparent: options.transparent,
				includeLabel,
				includeOverlays: exportState.view !== 'specimen',
				exportSafe: true,
				label: `${this.phenotype.informalName} · ${this.phenotype.archiveDesignation} · ${this.state.genome.seed}`,
				time: this.pose.time
			});
			return await canvasToBlob(fallbackCanvas, 'image/png');
		} catch (error) {
			throw new Error('The Chitin Engine still image could not be rendered.', { cause: error });
		} finally {
			if (fallbackCanvas) releaseCanvas(fallbackCanvas);
		}
	}

	destroy(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.renderingFailed = true;
		this.contextRecovering = false;
		if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
		if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
		this.animationFrame = 0;
		this.resizeFrame = 0;
		clearTimeout(this.restoreFallbackTimer);
		this.restoreFallbackTimer = undefined;
		this.resizeObserver?.disconnect();
		this.intersectionObserver?.disconnect();
		window.removeEventListener('resize', this.resize);
		document.removeEventListener('visibilitychange', this.handleVisibility);
		this.removePointerListeners();
		this.webgl?.dispose();
		this.fallback?.dispose();
		this.webgl = null;
		this.fallback = null;
		this.pointer = null;
		this.pose.limbs.length = 0;
		this.pose.flexible.clear();
		this.packet.plates = new Float32Array(0);
		this.packet.plateCount = 0;
		this.packet.capsules = new Float32Array(0);
		this.packet.capsuleCount = 0;
		releaseCanvas(this.canvas);
		this.canvas.remove();
	}
}
