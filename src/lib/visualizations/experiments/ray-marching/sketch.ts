import type p5 from 'p5';
import fragmentTemplate from './fragment.frag?raw';
import vertexSource from './vertex.vert?raw';
import {
	buildFragmentSource,
	createRayMarchingQualityMonitor,
	observeRayMarchingQualityFrame,
	resolveRayMarchingFramebufferSize,
	type QualityFramePhase,
	type RayMarchingQualityHints,
	type RayMarchingQualityMonitor
} from './quality';
import {
	createRayMarchingClock,
	resetRayMarchingClock,
	setRayMarchingClockPlaying,
	setRayMarchingClockSuspended,
	tickRayMarchingClock,
	type RayMarchingClock
} from './clock';
import type {
	RayMarchingCamera,
	RayMarchingDebugView,
	RayMarchingPalette,
	RayMarchingQualityChoice,
	RayMarchingQualityTier,
	RayMarchingStageId
} from './types';

export type RayMarchingRenderSnapshot = Readonly<{
	stage: RayMarchingStageId;
	debugView: RayMarchingDebugView;
	palette: RayMarchingPalette;
	fogAmount: number;
	pulseSpeed: number;
	focalLength: number;
	camera: RayMarchingCamera;
	playing: boolean;
	suspended: boolean;
	qualityChoice: RayMarchingQualityChoice;
	qualityTier: RayMarchingQualityTier;
}>;

export type RayMarchingSketchStatus =
	| 'initializing'
	| 'first-frame'
	| 'context-lost'
	| 'shader-error';

export type MountRayMarchingSketchOptions = Readonly<{
	host: HTMLDivElement;
	qualityHints: RayMarchingQualityHints;
	getSnapshot: () => RayMarchingRenderSnapshot;
	isCancelled: () => boolean;
	onStatus: (status: RayMarchingSketchStatus, message: string) => void;
	onReady: (canvas: HTMLCanvasElement) => void;
	onContextRestored: () => void;
	onQualityDowngrade: (from: RayMarchingQualityTier, to: RayMarchingQualityTier) => void;
}>;

export type RayMarchingSketchController = Readonly<{
	redraw: () => void;
	syncPlayback: () => void;
	resize: (cssWidth: number, cssHeight: number) => void;
	restart: () => void;
	pulse: (staticPosition?: boolean) => void;
	destroy: () => void;
	canvas: () => HTMLCanvasElement | null;
}>;

const DEBUG_IDS: Record<RayMarchingDebugView, number> = {
	beauty: 0,
	'march-cost': 1,
	normals: 2,
	'distance-bands': 3
};

const PALETTE_IDS: Record<RayMarchingPalette, number> = {
	cathedral: 0,
	'blue-hour': 1,
	'amber-archive': 2
};

const MAX_PULSE_AGE_SECONDS = 7.5;
const STATIC_PULSE_AGE_SECONDS = 1.7;
const FIRST_FRAME_ATTEMPTS = 5;

type P5WithLockedWebGL1 = p5 & {
	_glAttributes: (WebGLContextAttributes & { version: 1 }) | null;
	_renderer?: { _pixelDensity: number };
};

function conciseError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/\s+/gu, ' ').trim().slice(0, 260) || 'The shader could not start.';
}

function compileShaderSource(
	gl: WebGLRenderingContext,
	type: number,
	source: string,
	label: string
): void {
	const shader = gl.createShader(type);
	if (!shader) throw new Error(`The browser could not allocate the ${label}.`);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
	const log = gl.getShaderInfoLog(shader)?.trim();
	gl.deleteShader(shader);
	if (!compiled) throw new Error(`${label} compilation failed${log ? `: ${log}` : '.'}`);
}

/**
 * One deliberately bounded startup read proves that the poster is not retired for a blank buffer.
 * It never runs again after readiness and is not part of the animation hot path.
 */
function firstFrameHasVariation(gl: WebGLRenderingContext, width: number, height: number): boolean {
	const samples = [
		[0.18, 0.22],
		[0.5, 0.5],
		[0.82, 0.24],
		[0.28, 0.76],
		[0.72, 0.72]
	] as const;
	const pixel = new Uint8Array(4);
	let minimum = 255;
	let maximum = 0;
	let total = 0;

	gl.flush();
	for (const [x, y] of samples) {
		gl.readPixels(
			Math.min(width - 1, Math.max(0, Math.floor(width * x))),
			Math.min(height - 1, Math.max(0, Math.floor(height * y))),
			1,
			1,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			pixel
		);
		for (let channel = 0; channel < 3; channel += 1) {
			minimum = Math.min(minimum, pixel[channel]);
			maximum = Math.max(maximum, pixel[channel]);
			total += pixel[channel];
		}
	}

	return total > 24 && maximum - minimum > 3;
}

function shouldContinuouslyAnimate(
	snapshot: RayMarchingRenderSnapshot,
	pulseAge: number,
	ready: boolean
): boolean {
	if (!ready) return true;
	if (snapshot.suspended) return false;
	if (snapshot.playing && snapshot.stage === 8) return true;
	return snapshot.playing && pulseAge >= 0;
}

export async function mountRayMarchingSketch(
	options: MountRayMarchingSketchOptions
): Promise<RayMarchingSketchController | null> {
	options.onStatus('initializing', 'Loading p5 and preparing the WebGL shader…');
	const { default: P5 } = await import('p5');
	if (options.isCancelled()) return null;
	// This instance supplies all callbacks explicitly. The global-mode verifier otherwise
	// attempts to parse Svelte's bundled module as a sketch and emits a false console error.
	P5.disableFriendlyErrors = true;

	let disposed = false;
	let canvasElement: HTMLCanvasElement | null = null;
	let clock: RayMarchingClock = createRayMarchingClock({ playing: false });
	let pulseAge = -1;
	let ready = false;
	let contextLost = false;
	let firstFrameAttempts = 0;
	let lastCssWidth = 0;
	let lastCssHeight = 0;
	let lastTier: RayMarchingQualityTier | null = null;
	let qualityMonitor: RayMarchingQualityMonitor = createRayMarchingQualityMonitor({
		choice: options.getSnapshot().qualityChoice,
		hints: options.qualityHints,
		initialTier: options.getSnapshot().qualityTier,
		nowMs: performance.now()
	});
	let nextQualityPhase: QualityFramePhase = 'compile';
	let removeContextListeners = () => {};
	const controllerHolder: { current: RayMarchingSketchController | null } = { current: null };

	new P5((p) => {
		const shaderCache = new Map<RayMarchingQualityTier, p5.Shader>();
		const validatedSources = new Set<RayMarchingQualityTier>();

		function currentCanvasSize(): Readonly<{ width: number; height: number }> {
			const width = Math.max(1, Math.round(options.host.clientWidth));
			const height = Math.max(1, Math.round(options.host.clientHeight));
			return { width, height };
		}

		function applyCanvasSize(cssWidth: number, cssHeight: number): void {
			if (!canvasElement || disposed) return;
			const snapshot = options.getSnapshot();
			const resolved = resolveRayMarchingFramebufferSize(
				cssWidth,
				cssHeight,
				window.devicePixelRatio || 1,
				snapshot.qualityTier
			);
			if (
				resolved.cssWidth === lastCssWidth &&
				resolved.cssHeight === lastCssHeight &&
				lastTier === snapshot.qualityTier
			) {
				return;
			}

			lastCssWidth = resolved.cssWidth;
			lastCssHeight = resolved.cssHeight;
			lastTier = snapshot.qualityTier;
			const renderer = (p as P5WithLockedWebGL1)._renderer;
			if (renderer) renderer._pixelDensity = resolved.pixelRatio;
			p.resizeCanvas(resolved.cssWidth, resolved.cssHeight, true);
			nextQualityPhase = 'resize';
		}

		function shaderForTier(tier: RayMarchingQualityTier): p5.Shader {
			const cached = shaderCache.get(tier);
			if (cached) return cached;
			const gl = p.drawingContext as WebGLRenderingContext;
			const fragmentSource = buildFragmentSource(fragmentTemplate, tier);
			if (!validatedSources.has(tier)) {
				compileShaderSource(gl, gl.VERTEX_SHADER, vertexSource, 'vertex shader');
				compileShaderSource(gl, gl.FRAGMENT_SHADER, fragmentSource, `${tier} fragment shader`);
				validatedSources.add(tier);
			}
			const shader = p.createShader(vertexSource, fragmentSource);
			shaderCache.set(tier, shader);
			nextQualityPhase = 'compile';
			return shader;
		}

		function applyUniforms(shader: p5.Shader, snapshot: RayMarchingRenderSnapshot): void {
			if (!canvasElement) return;
			const pulseRadius =
				pulseAge < 0 ? -1 : pulseAge * (3.25 * Math.max(0.5, snapshot.pulseSpeed));
			const pulseStrength = pulseAge < 0 ? 0 : Math.max(0, 1 - pulseAge / MAX_PULSE_AGE_SECONDS);
			shader.setUniform('u_resolution', [canvasElement.width, canvasElement.height]);
			shader.setUniform('u_time', clock.elapsedSeconds);
			shader.setUniform('u_stage', snapshot.stage);
			shader.setUniform('u_debug', DEBUG_IDS[snapshot.debugView]);
			shader.setUniform('u_camera', [snapshot.camera.yaw, snapshot.camera.pitch]);
			shader.setUniform('u_focalLength', snapshot.focalLength);
			shader.setUniform('u_fogAmount', snapshot.fogAmount);
			shader.setUniform('u_palette', PALETTE_IDS[snapshot.palette]);
			shader.setUniform('u_pulseRadius', pulseRadius);
			shader.setUniform('u_pulseStrength', pulseStrength);
		}

		function handleContextLost(event: Event): void {
			if (disposed) return;
			event.preventDefault();
			contextLost = true;
			p.noLoop();
			clock = setRayMarchingClockSuspended(clock, true);
			options.onStatus(
				'context-lost',
				'The WebGL context was lost. The poster is visible while the renderer waits to recover.'
			);
		}

		function handleContextRestored(): void {
			if (disposed) return;
			options.onContextRestored();
		}

		p.setup = () => {
			try {
				const initialSize = currentCanvasSize();
				const initialSnapshot = options.getSnapshot();
				const resolved = resolveRayMarchingFramebufferSize(
					initialSize.width,
					initialSize.height,
					window.devicePixelRatio || 1,
					initialSnapshot.qualityTier
				);
				// p5 2.3 reads this before RendererGL creates its first and only context.
				// Calling setAttributes() after createCanvas() would recreate the context.
				(p as P5WithLockedWebGL1)._glAttributes = {
					version: 1,
					alpha: false,
					antialias: false,
					depth: false,
					stencil: false,
					preserveDrawingBuffer: false,
					premultipliedAlpha: false,
					powerPreference: 'high-performance'
				};
				const canvasRenderer = p.createCanvas(1, 1, p.WEBGL);
				const renderer = (p as P5WithLockedWebGL1)._renderer;
				if (renderer) renderer._pixelDensity = resolved.pixelRatio;
				p.resizeCanvas(resolved.cssWidth, resolved.cssHeight, true);
				canvasElement = canvasRenderer.elt as HTMLCanvasElement;
				canvasElement.dataset.rayMarchingCanvas = 'true';
				canvasElement.tabIndex = -1;
				canvasElement.setAttribute('aria-hidden', 'true');
				p.noStroke();
				lastCssWidth = resolved.cssWidth;
				lastCssHeight = resolved.cssHeight;
				lastTier = initialSnapshot.qualityTier;
				clock = createRayMarchingClock({
					playing: initialSnapshot.playing,
					suspended: initialSnapshot.suspended
				});

				canvasElement.addEventListener('webglcontextlost', handleContextLost);
				canvasElement.addEventListener('webglcontextrestored', handleContextRestored);
				removeContextListeners = () => {
					canvasElement?.removeEventListener('webglcontextlost', handleContextLost);
					canvasElement?.removeEventListener('webglcontextrestored', handleContextRestored);
				};
				void shaderForTier(initialSnapshot.qualityTier);
				options.onStatus(
					'first-frame',
					'The shader compiled. Waiting for its first visible frame…'
				);
			} catch (error) {
				p.noLoop();
				options.onStatus('shader-error', conciseError(error));
			}
		};

		p.draw = () => {
			if (disposed || contextLost || !canvasElement) return;
			const frameStartedAt = performance.now();
			const snapshot = options.getSnapshot();
			try {
				clock = setRayMarchingClockPlaying(clock, snapshot.playing);
				clock = setRayMarchingClockSuspended(clock, snapshot.suspended);
				const previousElapsed = clock.elapsedSeconds;
				clock = tickRayMarchingClock(clock, frameStartedAt);
				let elapsedDelta = clock.elapsedSeconds - previousElapsed;
				if (elapsedDelta < 0) elapsedDelta += 600;
				if (pulseAge >= 0 && snapshot.playing && !snapshot.suspended) {
					pulseAge += Math.min(0.05, Math.max(0, elapsedDelta));
					if (pulseAge > MAX_PULSE_AGE_SECONDS) pulseAge = -1;
				}

				const shader = shaderForTier(snapshot.qualityTier);
				applyUniforms(shader, snapshot);
				p.shader(shader);
				p.rect(-p.width / 2, -p.height / 2, p.width, p.height);

				if (!ready) {
					firstFrameAttempts += 1;
					const gl = p.drawingContext as WebGLRenderingContext;
					if (
						firstFrameHasVariation(gl, canvasElement.width, canvasElement.height) ||
						firstFrameAttempts >= FIRST_FRAME_ATTEMPTS
					) {
						if (
							firstFrameAttempts >= FIRST_FRAME_ATTEMPTS &&
							!firstFrameHasVariation(gl, canvasElement.width, canvasElement.height)
						) {
							throw new Error('The shader rendered a blank or uniform drawing buffer.');
						}
						ready = true;
						options.onReady(canvasElement);
					}
				}

				const measuredFrameMs = Math.max(
					0.01,
					performance.now() - frameStartedAt,
					Number.isFinite(p.deltaTime) ? p.deltaTime : 0
				);
				const phase = nextQualityPhase;
				nextQualityPhase = 'active';
				if (
					qualityMonitor.choice !== snapshot.qualityChoice ||
					(snapshot.qualityChoice !== 'auto' && qualityMonitor.tier !== snapshot.qualityTier)
				) {
					qualityMonitor = createRayMarchingQualityMonitor({
						choice: snapshot.qualityChoice,
						hints: options.qualityHints,
						initialTier: snapshot.qualityTier,
						nowMs: frameStartedAt
					});
				}
				const qualityUpdate = observeRayMarchingQualityFrame(qualityMonitor, {
					nowMs: frameStartedAt,
					frameMs: measuredFrameMs,
					phase
				});
				qualityMonitor = qualityUpdate.state;
				if (qualityUpdate.downgradedFrom && qualityUpdate.downgradedTo) {
					options.onQualityDowngrade(qualityUpdate.downgradedFrom, qualityUpdate.downgradedTo);
				}

				if (!shouldContinuouslyAnimate(snapshot, pulseAge, ready)) p.noLoop();
			} catch (error) {
				p.noLoop();
				options.onStatus('shader-error', conciseError(error));
			}
		};

		controllerHolder.current = Object.freeze({
			redraw: () => {
				if (!disposed && !contextLost) p.redraw(1);
			},
			syncPlayback: () => {
				if (disposed || contextLost) return;
				const snapshot = options.getSnapshot();
				if (lastTier !== snapshot.qualityTier && lastCssWidth > 0 && lastCssHeight > 0) {
					applyCanvasSize(lastCssWidth, lastCssHeight);
				}
				clock = setRayMarchingClockPlaying(clock, snapshot.playing);
				clock = setRayMarchingClockSuspended(clock, snapshot.suspended);
				nextQualityPhase = snapshot.suspended ? 'hidden' : 'resume';
				if (shouldContinuouslyAnimate(snapshot, pulseAge, ready)) p.loop();
				else p.noLoop();
			},
			resize: (cssWidth, cssHeight) => {
				applyCanvasSize(cssWidth, cssHeight);
				if (!shouldContinuouslyAnimate(options.getSnapshot(), pulseAge, ready)) p.redraw(1);
			},
			restart: () => {
				clock = resetRayMarchingClock(clock, { playing: true });
				pulseAge = -1;
				nextQualityPhase = 'resume';
				if (shouldContinuouslyAnimate(options.getSnapshot(), pulseAge, ready)) p.loop();
				else p.redraw(1);
			},
			pulse: (staticPosition = false) => {
				pulseAge = staticPosition ? STATIC_PULSE_AGE_SECONDS : 0;
				if (staticPosition || !options.getSnapshot().playing) p.redraw(1);
				else p.loop();
			},
			destroy: () => {
				if (disposed) return;
				disposed = true;
				removeContextListeners();
				const gl = p.drawingContext as WebGLRenderingContext | undefined;
				p.remove();
				gl?.getExtension('WEBGL_lose_context')?.loseContext();
				canvasElement = null;
				shaderCache.clear();
			},
			canvas: () => canvasElement
		});
	}, options.host);

	const mountedController = controllerHolder.current;
	if (options.isCancelled()) {
		mountedController?.destroy();
		return null;
	}

	return mountedController;
}

export { fragmentTemplate as rayMarchingFragmentTemplate, vertexSource as rayMarchingVertexSource };
