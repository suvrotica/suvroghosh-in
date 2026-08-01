<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type {
		ComplexValue,
		DecimalComplexValue,
		FractalFamily,
		FractalViewport,
		FractalViewState
	} from '$lib/visualizations/fractal-atlas/types';
	import {
		boundedGridValues,
		complexToScreen,
		decimalComplexToScreen,
		panViewport,
		screenToComplex,
		screenToDecimalComplex,
		viewportBounds,
		zoomToRectangle,
		zoomViewport
	} from '$lib/visualizations/fractal-atlas/viewport';
	import { samplePalette } from '$lib/visualizations/fractal-atlas/palettes';
	import {
		drawFractalPngCaption,
		type FractalPngCaption
	} from '$lib/visualizations/fractal-atlas/png-export';
	import { Canvas2DFractalRenderer } from '$lib/visualizations/fractal-atlas/render/cpu';
	import { doubleSingleCoordinateGridCollapses } from '$lib/visualizations/fractal-atlas/precision/double-single';
	import {
		computeCpuRenderSize,
		cpuFallbackPixelBudget,
		progressiveWorkerBudget
	} from '$lib/visualizations/fractal-atlas/render/quality';
	import {
		WebGLFractalRenderer,
		WebGLHistogramFallbackRequiredError,
		WebGLPrecisionFallbackRequiredError,
		type WebGLPrecisionDiagnostics
	} from '$lib/visualizations/fractal-atlas/render/webgl';
	import {
		createFractalProgressiveWorkerClient,
		type FractalProgressiveWorkerClient
	} from '$lib/visualizations/fractal-atlas/worker/client';
	import type {
		DensityFrame,
		FernFrame,
		FractalWorkerResponse,
		RasterTileFrame
	} from '$lib/visualizations/fractal-atlas/worker/protocol';

	type Props = {
		viewState: FractalViewState;
		selectedPoint?: ComplexValue | null;
		selectedPointDecimal?: DecimalComplexValue | null;
		orbitOverlay?: readonly ComplexValue[];
		label?: string;
		linked?: boolean;
		interactive?: boolean;
		showGrid?: boolean;
		guideOverlay?: 'none' | 'mandelbrot-landmarks' | 'multibrot-symmetry';
		sierpinskiMode?: 'recursive' | 'chaos' | 'overlay';
		onviewchange?: (next: FractalViewState) => void;
		onviewcommit?: (before: FractalViewState, after: FractalViewState, reason: string) => void;
		onprobe?: (point: ComplexValue, decimal?: DecimalComplexValue) => void;
		onhover?: (point: ComplexValue | null, decimal?: DecimalComplexValue | null) => void;
		onstatus?: (message: string, backend: string) => void;
		onprogress?: (progress: number, label: string) => void;
		onprecision?: (diagnostics: WebGLPrecisionDiagnostics) => void;
		onsize?: (metrics: { width: number; height: number; devicePixelRatio: number }) => void;
	};

	let {
		viewState,
		selectedPoint = null,
		selectedPointDecimal = null,
		orbitOverlay = [],
		label = 'Interactive fractal plane',
		linked = false,
		interactive = true,
		showGrid = true,
		guideOverlay = 'none',
		sierpinskiMode = 'overlay',
		onviewchange,
		onviewcommit,
		onprobe,
		onhover,
		onstatus,
		onprogress,
		onprecision,
		onsize
	}: Props = $props();
	const uid = $props.id();

	type Point = { x: number; y: number };
	type PointerRecord = Point & { startX: number; startY: number };
	type ProgressivePhase = 'idle' | 'running' | 'paused' | 'complete';
	type PointerMode = 'pan' | 'marker' | 'box' | null;

	let stage: HTMLDivElement;
	let gpuCanvas: HTMLCanvasElement;
	let fallbackCanvas: HTMLCanvasElement;
	let overlayCanvas: HTMLCanvasElement;
	let webgl: WebGLFractalRenderer | null = null;
	let cpu: Canvas2DFractalRenderer | null = null;
	let worker: FractalProgressiveWorkerClient | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let mounted = $state(false);
	let nearViewport = $state(false);
	let pageVisible = $state(true);
	let interactionEngaged = $state(false);
	let width = $state(1);
	let height = $state(1);
	let pixelRatio = 1;
	let renderFrame = 0;
	let overlayFrame = 0;
	let progressiveRestartTimer: ReturnType<typeof setTimeout> | null = null;
	let progressiveWorkerKey: string | null = null;
	let rasterFallbackPrefix = '';
	let wheelCommitTimer: ReturnType<typeof setTimeout> | null = null;
	let activeBackend = $state<'webgl2' | 'canvas-2d' | 'worker' | 'vector'>('canvas-2d');
	let progressivePhase = $state<ProgressivePhase>('idle');
	let progressiveLabel = $state('');
	let pointers = new SvelteMap<number, PointerRecord>();
	let gestureDistance = 0;
	let gestureMidpoint: Point | null = null;
	let dragOriginState: FractalViewState | null = null;
	let dragMoved = false;
	let lastPointer: Point | null = null;
	let pointerMode: PointerMode = null;
	let markerDragPoint: ComplexValue | null = null;
	let markerDragDecimal: DecimalComplexValue | null = null;
	let boxStart: Point | null = null;
	let boxEnd: Point | null = null;
	let wheelOriginState: FractalViewState | null = null;
	let wheelLatestState: FractalViewState | null = null;
	let wheelInteracting = false;
	let userWantsProgressiveRun = true;
	let previousFamily: FractalFamily | null = null;

	const rasterFamily = $derived(
		viewState.family === 'mandelbrot' ||
			viewState.family === 'julia' ||
			viewState.family === 'multibrot' ||
			viewState.family === 'burning-ship' ||
			viewState.family === 'tricorn' ||
			viewState.family === 'phoenix' ||
			viewState.family === 'custom-map' ||
			viewState.family === 'newton'
	);
	const progressiveFamily = $derived(
		viewState.family === 'buddhabrot' || viewState.family === 'barnsley-fern'
	);
	const vectorFamily = $derived(
		viewState.family === 'sierpinski' || viewState.family === 'l-system'
	);
	const accessibleLabel = $derived(
		`${label}. Centre ${viewState.center.re.toExponential(6)} ${viewState.center.im < 0 ? 'minus' : 'plus'} ${Math.abs(viewState.center.im).toExponential(6)} imaginary; vertical span ${viewState.spanY.toExponential(6)}; ${viewState.coloring.replaceAll('-', ' ')} colouring at ${viewState.renderQuality} quality; ${activeBackend} renderer.`
	);

	function cloneState(value: FractalViewState): FractalViewState {
		return structuredClone($state.snapshot(value));
	}

	function displayPaletteColour(value: number) {
		return samplePalette(viewState.customPalette ?? viewState.paletteId, value, {
			offset: viewState.paletteOffset,
			cycles: viewState.paletteCycles
		});
	}

	function stateViewport(value: FractalViewState): FractalViewport {
		return {
			center: value.center,
			centerDecimal: value.centerDecimal,
			spanY: value.spanY,
			rotation: value.rotation
		};
	}

	function presentedY(y: number) {
		return viewState.flipY ? height - y : y;
	}

	function presentedDeltaY(deltaY: number) {
		return viewState.flipY ? -deltaY : deltaY;
	}

	function presentedToComplex(point: Point) {
		return screenToComplex(stateViewport(viewState), point.x, presentedY(point.y), width, height);
	}

	function presentedToDecimalComplex(point: Point) {
		return screenToDecimalComplex(
			stateViewport(viewState),
			point.x,
			presentedY(point.y),
			width,
			height
		);
	}

	function complexToPresentedScreen(value: ComplexValue, decimal?: DecimalComplexValue | null) {
		const point = decimal
			? decimalComplexToScreen(stateViewport(viewState), decimal, width, height)
			: complexToScreen(stateViewport(viewState), value, width, height);
		return { x: point.x, y: viewState.flipY ? height - point.y : point.y };
	}

	function withViewport(value: FractalViewState, viewport: ReturnType<typeof stateViewport>) {
		return {
			...value,
			center: { ...viewport.center },
			centerDecimal: viewport.centerDecimal ? { ...viewport.centerDecimal } : undefined,
			spanY: viewport.spanY,
			rotation: viewport.rotation
		};
	}

	function setStatus(message: string, backend = activeBackend) {
		onstatus?.(message, backend);
	}

	function updateCanvasGeometry(canvas: HTMLCanvasElement, ratio = pixelRatio) {
		const nextWidth = Math.max(1, Math.round(width * ratio));
		const nextHeight = Math.max(1, Math.round(height * ratio));
		if (canvas.width !== nextWidth) canvas.width = nextWidth;
		if (canvas.height !== nextHeight) canvas.height = nextHeight;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
	}

	function resize() {
		if (!stage) return;
		const rect = stage.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		width = rect.width;
		height = rect.height;
		pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
		onsize?.({ width, height, devicePixelRatio: pixelRatio });
		updateCanvasGeometry(overlayCanvas);
		webgl?.resize(width, height, pixelRatio);
		cpu?.resize(width, height, 1);
		scheduleRender();
		scheduleOverlay();
	}

	function scheduleRender() {
		if (!mounted || !nearViewport || !pageVisible) return;
		cancelAnimationFrame(renderFrame);
		renderFrame = requestAnimationFrame(() => {
			if (rasterFamily) renderRaster();
			else if (progressiveFamily) {
				const key = progressiveRenderKey();
				if (worker && progressiveWorkerKey === key) {
					if (userWantsProgressiveRun && progressivePhase === 'paused') {
						worker.run();
						progressivePhase = 'running';
						setStatus('Progressive render resumed from its preserved accumulation.', 'worker');
					}
				} else {
					scheduleProgressiveRestart();
				}
			} else if (vectorFamily) renderVector();
		});
	}

	function progressiveRenderKey() {
		return JSON.stringify({
			state: $state.snapshot(viewState),
			width: Math.max(1, Math.round(width)),
			height: Math.max(1, Math.round(height))
		});
	}

	function scheduleOverlay() {
		if (!mounted || !nearViewport || !pageVisible) return;
		cancelAnimationFrame(overlayFrame);
		overlayFrame = requestAnimationFrame(drawOverlay);
	}

	function renderRaster() {
		const beyondPublishedPrecision =
			viewState.precisionMode === 'perturbation' ||
			(viewState.precisionMode === 'auto' &&
				doubleSingleCoordinateGridCollapses(
					viewState.center.re,
					viewState.center.im,
					viewState.spanY,
					viewState.rotation,
					Math.max(1, Math.round(height))
				));
		if (beyondPublishedPrecision) {
			renderPrecisionCeilingPlate(
				'Perturbation is outside the published runtime scope; showing the bounded CPU-double ceiling while preserving the exact decimal coordinate.'
			);
			return;
		}
		fallbackCanvas.hidden = true;
		gpuCanvas.hidden = false;
		try {
			if (!webgl) {
				webgl = new WebGLFractalRenderer(gpuCanvas, {
					onStatus: (message) => setStatus(message, 'webgl2'),
					onError: (message) => setStatus(message, 'webgl2'),
					onContextLost: () => {
						gpuCanvas.hidden = true;
						fallbackCanvas.hidden = false;
						activeBackend = 'canvas-2d';
						renderCpuFallback(
							'WebGL2 context lost; showing a bounded Canvas frame while restoration is attempted.'
						);
					},
					onContextRestored: () => {
						fallbackCanvas.hidden = true;
						gpuCanvas.hidden = false;
						activeBackend = 'webgl2';
						setStatus('WebGL2 restored; the preserved atlas state was rebuilt.', 'webgl2');
						scheduleRender();
					},
					onPrecisionReady: scheduleRender,
					onPrecisionDiagnostics: onprecision
				});
				webgl.resize(width, height, pixelRatio);
			}
			webgl.render(viewState, {
				preview: pointers.size > 0 || wheelInteracting || markerDragPoint !== null,
				pixelRatio
			});
			if (activeBackend === 'worker') worker?.cancel();
			activeBackend = 'webgl2';
			return;
		} catch (error) {
			if (webgl?.isContextLost) {
				renderCpuFallback(
					'WebGL2 context is temporarily lost; showing the bounded Canvas fallback.'
				);
				return;
			}
			if (
				error instanceof WebGLPrecisionFallbackRequiredError ||
				error instanceof WebGLHistogramFallbackRequiredError
			) {
				gpuCanvas.hidden = true;
				fallbackCanvas.hidden = false;
				renderCpuFallback(error.message);
				return;
			}
			webgl?.destroy();
			webgl = null;
			gpuCanvas.hidden = true;
			fallbackCanvas.hidden = false;
			renderCpuFallback(
				error instanceof Error ? `WebGL2 unavailable: ${error.message}` : undefined
			);
		}
	}

	function renderPrecisionCeilingPlate(message: string) {
		gpuCanvas.hidden = true;
		fallbackCanvas.hidden = false;
		const renderWidth = Math.max(240, Math.round(width));
		const renderHeight = Math.max(180, Math.round(height));
		fallbackCanvas.width = renderWidth;
		fallbackCanvas.height = renderHeight;
		fallbackCanvas.style.width = `${width}px`;
		fallbackCanvas.style.height = `${height}px`;
		const context = fallbackCanvas.getContext('2d', { alpha: false });
		if (context) {
			context.fillStyle = '#090a10';
			context.fillRect(0, 0, renderWidth, renderHeight);
			context.strokeStyle = 'rgba(202, 178, 113, 0.16)';
			context.lineWidth = 1;
			for (let x = 0; x <= renderWidth; x += Math.max(24, Math.round(renderWidth / 12))) {
				context.beginPath();
				context.moveTo(x + 0.5, 0);
				context.lineTo(x + 0.5, renderHeight);
				context.stroke();
			}
			for (let y = 0; y <= renderHeight; y += Math.max(24, Math.round(renderHeight / 9))) {
				context.beginPath();
				context.moveTo(0, y + 0.5);
				context.lineTo(renderWidth, y + 0.5);
				context.stroke();
			}
			const titleSize = Math.max(15, Math.min(24, renderWidth / 24));
			context.fillStyle = '#d7c386';
			context.font = `600 ${titleSize}px ui-monospace, monospace`;
			context.textAlign = 'center';
			context.fillText('PRECISION CEILING', renderWidth / 2, renderHeight / 2 - titleSize * 0.35);
			context.fillStyle = '#aaa7a0';
			context.font = `${Math.max(11, titleSize * 0.56)}px ui-monospace, monospace`;
			context.fillText(
				'Exact coordinate preserved · raster detail withheld',
				renderWidth / 2,
				renderHeight / 2 + titleSize
			);
		}
		activeBackend = 'canvas-2d';
		setStatus(
			`${message} Precision ceiling plate ready; no collapsed raster was substituted.`,
			'canvas-2d'
		);
	}

	function renderCpuFallback(prefix?: string) {
		const preview = pointers.size > 0 || wheelInteracting || markerDragPoint !== null;
		try {
			const maxPixels = cpuFallbackMaxPixels();
			const size = computeCpuRenderSize(width, height, { preview, maxPixels });
			const context = fallbackCanvas.getContext('2d', { alpha: false });
			if (!context) throw new Error('Canvas 2D is unavailable.');
			fallbackCanvas.width = size.width;
			fallbackCanvas.height = size.height;
			fallbackCanvas.style.width = `${width}px`;
			fallbackCanvas.style.height = `${height}px`;
			context.fillStyle = viewState.interiorColor;
			context.fillRect(0, 0, size.width, size.height);
			rasterFallbackPrefix = prefix ?? '';
			ensureWorker().startRaster(
				{
					state: cloneState(viewState),
					width: Math.max(1, Math.round(width)),
					height: Math.max(1, Math.round(height)),
					preview,
					maxPixels,
					maxIterations: viewState.maxIterations,
					tileWidth: 64,
					tileHeight: 32
				},
				true
			);
			activeBackend = 'worker';
			setStatus(
				`${prefix ? `${prefix} ` : ''}Bounded CPU Worker is rendering ${size.width} × ${size.height} in small tiles.`,
				'worker'
			);
			return;
		} catch (workerError) {
			const workerMessage =
				workerError instanceof Error ? workerError.message : 'The CPU Worker could not start.';
			renderSynchronousCpuFallback(prefix, workerMessage);
		}
	}

	function cpuFallbackMaxPixels() {
		return cpuFallbackPixelBudget(viewState.renderQuality);
	}

	function renderSynchronousCpuFallback(prefix?: string, workerMessage?: string) {
		try {
			if (!cpu) {
				cpu = new Canvas2DFractalRenderer(fallbackCanvas);
				cpu.resize(width, height, 1);
			}
			const result = cpu.render(viewState, {
				preview: pointers.size > 0 || wheelInteracting || markerDragPoint !== null,
				maxPixels: cpuFallbackMaxPixels()
			});
			activeBackend = 'canvas-2d';
			setStatus(
				`${prefix ? `${prefix} ` : ''}${workerMessage ? `Module Worker unavailable: ${workerMessage} ` : ''}Last-resort Canvas frame ready at ${result.width} × ${result.height}, using ${result.iterations} of ${viewState.maxIterations} requested iterations.`,
				'canvas-2d'
			);
		} catch (fallbackError) {
			setStatus(
				fallbackError instanceof Error
					? fallbackError.message
					: 'This fractal could not be rendered.',
				'canvas-2d'
			);
		}
	}

	function scheduleProgressiveRestart() {
		if (!mounted || !nearViewport || !pageVisible) return;
		if (progressiveRestartTimer) clearTimeout(progressiveRestartTimer);
		progressiveRestartTimer = setTimeout(startProgressive, 90);
	}

	function ensureWorker() {
		if (worker) return worker;
		worker = createFractalProgressiveWorkerClient();
		worker.subscribe(handleWorkerMessage);
		return worker;
	}

	function startProgressive() {
		if (!progressiveFamily || !nearViewport || !pageVisible || width < 2 || height < 2) {
			return;
		}
		gpuCanvas.hidden = true;
		fallbackCanvas.hidden = false;
		activeBackend = 'worker';
		progressivePhase = 'running';
		const context = fallbackCanvas.getContext('2d', { alpha: false });
		if (!context) {
			setStatus('Canvas 2D is unavailable for this progressive renderer.', 'worker');
			return;
		}
		const budget = progressiveWorkerBudget(viewState.renderQuality);
		const renderWidth = Math.max(240, Math.min(budget.maxWidth, Math.round(width)));
		const renderHeight = Math.max(160, Math.round(renderWidth * (height / width)));
		fallbackCanvas.width = renderWidth;
		fallbackCanvas.height = renderHeight;
		fallbackCanvas.style.width = `${width}px`;
		fallbackCanvas.style.height = `${height}px`;
		progressiveWorkerKey = progressiveRenderKey();
		context.fillStyle = viewState.family === 'barnsley-fern' ? viewState.interiorColor : '#07080d';
		context.fillRect(0, 0, renderWidth, renderHeight);

		try {
			const client = ensureWorker();
			if (viewState.family === 'buddhabrot') {
				const bounds = viewportBounds(stateViewport(viewState), renderWidth, renderHeight);
				const density = viewState.density ?? {
					targetSamples: 250_000,
					exposure: 1,
					gamma: 0.65,
					iterationBands: [
						[20, 80],
						[80, 250],
						[250, 500]
					] as [number, number][]
				};
				client.startDensity(
					{
						mode: density.iterationBands.length >= 3 ? 'nebulabrot' : 'buddhabrot',
						width: renderWidth,
						height: renderHeight,
						seed: viewState.seed,
						targetSamples: Math.min(
							budget.densitySampleCap,
							Math.max(10_000, density.targetSamples)
						),
						samplesPerBatch: budget.densityBatchSize,
						maxIterations: Math.min(2_000, Math.max(40, viewState.maxIterations)),
						bailout: Math.max(2, viewState.bailout),
						sampleBounds: { minRe: -2.2, maxRe: 1.2, minIm: -1.6, maxIm: 1.6 },
						orbitBounds: bounds,
						minEscapeIterations: 4,
						exposure: density.exposure,
						gamma: density.gamma,
						percentileClip: 0.995,
						iterationWindows: [
							[density.iterationBands[0]?.[0] ?? 20, density.iterationBands[0]?.[1] ?? 80],
							[density.iterationBands[1]?.[0] ?? 81, density.iterationBands[1]?.[1] ?? 250],
							[
								density.iterationBands[2]?.[0] ?? 251,
								density.iterationBands[2]?.[1] ?? Math.max(500, viewState.maxIterations)
							]
						],
						publishEveryBatches: 2
					},
					userWantsProgressiveRun
				);
				progressiveLabel = 'Sampling escaped orbits…';
			} else {
				client.startFern(
					{
						seed: viewState.seed,
						targetPoints: budget.fernPointCap,
						pointsPerBatch: budget.fernBatchSize,
						burnIn: 20,
						transforms: viewState.ifs?.transforms
					},
					userWantsProgressiveRun
				);
				progressiveLabel = 'Growing the seeded affine point cloud…';
			}
			progressivePhase = userWantsProgressiveRun ? 'running' : 'paused';
			setStatus(progressiveLabel, 'worker');
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : 'The progressive Worker could not start.',
				'worker'
			);
		}
	}

	function handleWorkerMessage(message: FractalWorkerResponse) {
		if (message.type === 'RASTER_TILE') {
			if (rasterFamily && activeBackend === 'worker') drawRasterTile(message.frame);
			return;
		}
		if (message.type === 'READY' && message.task === 'raster') {
			onprogress?.(message.progress.progress, 'CPU tile renderer ready');
			return;
		}
		if (message.type === 'STATUS' && message.task === 'raster') {
			onprogress?.(
				message.progress.progress,
				message.progress.progress < 0.5 && viewState.coloring === 'histogram'
					? 'Building the bounded histogram CDF…'
					: `Rendering CPU tiles · ${Math.round(message.progress.progress * 100)}%`
			);
			return;
		}
		if (message.type === 'COMPLETE' && message.task === 'raster') {
			onprogress?.(1, 'CPU tile render complete');
			setStatus(
				`${rasterFallbackPrefix ? `${rasterFallbackPrefix} ` : ''}Bounded CPU Worker tile render complete.`,
				'worker'
			);
			return;
		}
		if (message.type === 'ERROR' && rasterFamily && activeBackend === 'worker') {
			renderSynchronousCpuFallback(rasterFallbackPrefix, message.message);
			return;
		}
		if (!progressiveFamily) return;
		if (message.type === 'DENSITY_FRAME') {
			drawDensityFrame(message.frame);
			onprogress?.(
				message.frame.progress,
				`${message.frame.samplesProcessed.toLocaleString()} candidates · ${message.frame.escapingOrbits.toLocaleString()} escaped · ${message.frame.accumulatedOrbits.toLocaleString()} accepted · ${message.frame.plottedOrbitPoints.toLocaleString()} orbit points · ${(message.frame.width * message.frame.height).toLocaleString()} display pixels`
			);
		} else if (message.type === 'FERN_FRAME') {
			drawFernFrame(message.frame);
			onprogress?.(
				message.frame.progress,
				`${message.frame.totalPoints.toLocaleString()} / ${message.frame.targetPoints.toLocaleString()} points${message.frame.activeTransform === null ? '' : ` · transform ${message.frame.activeTransform + 1}`}`
			);
		} else if (message.type === 'STATUS') {
			progressivePhase = message.phase;
			onprogress?.(
				message.progress.progress,
				`${message.progress.completed.toLocaleString()} / ${message.progress.total.toLocaleString()}`
			);
		} else if (message.type === 'COMPLETE') {
			progressivePhase = 'complete';
			onprogress?.(1, 'Progressive render complete');
			setStatus('Progressive Worker render complete.', 'worker');
		} else if (message.type === 'ERROR') {
			progressivePhase = 'paused';
			setStatus(message.message, 'worker');
		}
	}

	function drawRasterTile(frame: RasterTileFrame) {
		const context = fallbackCanvas.getContext('2d', { alpha: false });
		if (!context) return;
		if (
			fallbackCanvas.width !== frame.renderWidth ||
			fallbackCanvas.height !== frame.renderHeight
		) {
			fallbackCanvas.width = frame.renderWidth;
			fallbackCanvas.height = frame.renderHeight;
		}
		const pixels = new Uint8ClampedArray(frame.pixels.length);
		pixels.set(frame.pixels);
		context.putImageData(new ImageData(pixels, frame.width, frame.height), frame.x, frame.y);
		onprogress?.(
			frame.progress,
			`CPU tiles · ${frame.completedWorkUnits.toLocaleString()} / ${frame.totalWorkUnits.toLocaleString()} work units`
		);
		if (frame.complete) {
			setStatus(
				`${rasterFallbackPrefix ? `${rasterFallbackPrefix} ` : ''}CPU Worker frame ready at ${frame.renderWidth} × ${frame.renderHeight}, using ${frame.iterations} of ${frame.requestedIterations} requested iterations.`,
				'worker'
			);
		}
	}

	function drawDensityFrame(frame: DensityFrame) {
		const context = fallbackCanvas.getContext('2d', { alpha: false });
		if (!context) return;
		if (fallbackCanvas.width !== frame.width || fallbackCanvas.height !== frame.height) {
			fallbackCanvas.width = frame.width;
			fallbackCanvas.height = frame.height;
		}
		const pixels = new Uint8ClampedArray(frame.pixels.length);
		pixels.set(frame.pixels);
		const image = new ImageData(pixels, frame.width, frame.height);
		context.putImageData(image, 0, 0);
		progressivePhase = frame.complete ? 'complete' : frame.running ? 'running' : 'paused';
	}

	function drawFernFrame(frame: FernFrame) {
		const context = fallbackCanvas.getContext('2d', { alpha: false });
		if (!context) return;
		const scaleX = fallbackCanvas.width / 6.2;
		const scaleY = fallbackCanvas.height / 10.4;
		const transformCount = Math.max(1, viewState.ifs?.transforms.length ?? 4);
		for (let index = 0; index < frame.transformIndices.length; index += 1) {
			const x = frame.points[index * 2];
			const y = frame.points[index * 2 + 1];
			const paletteValue =
				viewState.ifs?.colorBy === 'age'
					? (frame.batchStart + index) / Math.max(1, frame.targetPoints - 1)
					: frame.transformIndices[index] / Math.max(1, transformCount - 1);
			context.fillStyle = displayPaletteColour(paletteValue);
			context.fillRect((x + 3.1) * scaleX, fallbackCanvas.height - (y + 0.2) * scaleY, 1, 1);
		}
		progressivePhase = frame.complete ? 'complete' : frame.running ? 'running' : 'paused';
	}

	function renderVector() {
		gpuCanvas.hidden = true;
		fallbackCanvas.hidden = false;
		activeBackend = 'vector';
		const ratio = Math.min(2, pixelRatio);
		updateCanvasGeometry(fallbackCanvas, ratio);
		const context = fallbackCanvas.getContext('2d', { alpha: false });
		if (!context) return;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.fillStyle = viewState.interiorColor;
		context.fillRect(0, 0, width, height);
		if (viewState.family === 'sierpinski') drawSierpinski(context);
		else drawLSystem(context);
		progressivePhase = 'complete';
		onprogress?.(1, 'Deterministic construction ready');
		setStatus(
			viewState.family === 'sierpinski'
				? sierpinskiMode === 'recursive'
					? 'Deterministic recursive-removal construction ready.'
					: sierpinskiMode === 'chaos'
						? 'Seeded chaos-game point construction ready.'
						: 'Recursive triangles and a seeded chaos-game point cloud coincide in this comparison.'
				: 'Deterministic construction ready.',
			'vector'
		);
	}

	function drawSierpinski(context: CanvasRenderingContext2D) {
		const depth = Math.min(9, Math.max(0, Math.round(viewState.exponent)));
		const margin = Math.min(width, height) * 0.08;
		const side = Math.min(width - margin * 2, (height - margin * 2) * (2 / Math.sqrt(3)));
		const triangleHeight = (side * Math.sqrt(3)) / 2;
		const offsetX = (width - side) / 2;
		const offsetY = (height - triangleHeight) / 2;
		const vertices: [Point, Point, Point] = [
			{ x: offsetX + side / 2, y: offsetY },
			{ x: offsetX, y: offsetY + triangleHeight },
			{ x: offsetX + side, y: offsetY + triangleHeight }
		];

		context.save();
		context.globalAlpha = sierpinskiMode === 'overlay' ? 0.34 : 0.94;
		function triangle(a: Point, b: Point, c: Point, level: number) {
			if (level <= 0) {
				context.fillStyle = displayPaletteColour(
					(a.x - offsetX + (a.y - offsetY) * 0.35) / Math.max(1, side + triangleHeight * 0.35)
				);
				context.beginPath();
				context.moveTo(a.x, a.y);
				context.lineTo(b.x, b.y);
				context.lineTo(c.x, c.y);
				context.closePath();
				context.fill();
				return;
			}
			const ab = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
			const bc = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
			const ca = { x: (c.x + a.x) / 2, y: (c.y + a.y) / 2 };
			triangle(a, ab, ca, level - 1);
			triangle(ab, b, bc, level - 1);
			triangle(ca, bc, c, level - 1);
		}

		if (sierpinskiMode !== 'chaos') {
			triangle(vertices[0], vertices[1], vertices[2], depth);
		}

		let randomState = viewState.seed >>> 0 || 0x6d2b79f5;
		const random = () => {
			randomState ^= randomState << 13;
			randomState ^= randomState >>> 17;
			randomState ^= randomState << 5;
			return (randomState >>> 0) / 4_294_967_296;
		};
		const point = { x: offsetX + side / 2, y: offsetY + triangleHeight / 2 };
		const pointBudget =
			viewState.renderQuality === 'draft'
				? 12_000
				: viewState.renderQuality === 'high'
					? 70_000
					: 32_000;
		const vertexColours = [
			displayPaletteColour(0.15),
			displayPaletteColour(0.5),
			displayPaletteColour(0.85)
		];
		if (sierpinskiMode !== 'recursive') {
			context.globalAlpha = 0.9;
			for (let index = 0; index < pointBudget + 20; index += 1) {
				const vertexIndex = Math.min(2, Math.floor(random() * 3));
				const vertex = vertices[vertexIndex];
				point.x = (point.x + vertex.x) / 2;
				point.y = (point.y + vertex.y) / 2;
				if (index < 20) continue;
				context.fillStyle = vertexColours[vertexIndex];
				context.fillRect(point.x, point.y, 0.85, 0.85);
			}
		}
		context.restore();
	}

	type TurtleSegment = { x1: number; y1: number; x2: number; y2: number; depth: number };

	function safeLSystemSegments(): TurtleSegment[] {
		const definition = viewState.lSystem;
		if (!definition) return [];
		let sentence = definition.axiom.slice(0, 20_000);
		const generations = Math.min(7, Math.max(0, Math.floor(definition.generations)));
		for (let generation = 0; generation < generations; generation += 1) {
			let next = '';
			for (const symbol of sentence) {
				next += definition.rules[symbol] ?? symbol;
				if (next.length > 250_000) break;
			}
			sentence = next.slice(0, 250_000);
		}
		const segments: TurtleSegment[] = [];
		const stack: Array<{ x: number; y: number; angle: number }> = [];
		let x = 0;
		let y = 0;
		let angle = ((definition.startAngleDegrees ?? 0) * Math.PI) / 180;
		const turn = (definition.angleDegrees * Math.PI) / 180;
		const stepLength = Math.max(0.001, Math.min(1_000, definition.stepLength));
		for (let index = 0; index < sentence.length && segments.length < 160_000; index += 1) {
			const symbol = sentence[index];
			if (symbol === 'F' || symbol === 'G') {
				const nextX = x + Math.cos(angle) * stepLength;
				const nextY = y + Math.sin(angle) * stepLength;
				segments.push({ x1: x, y1: y, x2: nextX, y2: nextY, depth: stack.length });
				x = nextX;
				y = nextY;
			} else if (symbol === 'f') {
				x += Math.cos(angle) * stepLength;
				y += Math.sin(angle) * stepLength;
			} else if (symbol === '+') angle += turn;
			else if (symbol === '-') angle -= turn;
			else if (symbol === '[' && stack.length < 128) stack.push({ x, y, angle });
			else if (symbol === ']') {
				const restored = stack.pop();
				if (restored) ({ x, y, angle } = restored);
			}
		}
		return segments;
	}

	function drawLSystem(context: CanvasRenderingContext2D) {
		const segments = safeLSystemSegments();
		if (!segments.length) return;
		const xs = segments.flatMap((segment) => [segment.x1, segment.x2]);
		const ys = segments.flatMap((segment) => [segment.y1, segment.y2]);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		const margin = 28;
		const scale = Math.min(
			(width - margin * 2) / Math.max(1e-9, maxX - minX),
			(height - margin * 2) / Math.max(1e-9, maxY - minY)
		);
		const offsetX = (width - (maxX - minX) * scale) / 2 - minX * scale;
		const offsetY = (height - (maxY - minY) * scale) / 2 + maxY * scale;
		context.lineCap = 'round';
		context.lineWidth = Math.max(0.6, viewState.lSystem?.lineWidth ?? 1.4);
		for (let index = 0; index < segments.length; index += 1) {
			const segment = segments[index];
			context.strokeStyle = displayPaletteColour(
				viewState.lSystem?.colorByDepth
					? segment.depth / 8
					: index / Math.max(1, segments.length - 1)
			);
			context.beginPath();
			context.moveTo(offsetX + segment.x1 * scale, offsetY - segment.y1 * scale);
			context.lineTo(offsetX + segment.x2 * scale, offsetY - segment.y2 * scale);
			context.stroke();
		}
	}

	function drawOverlay() {
		if (!overlayCanvas || width < 2 || height < 2) return;
		const context = overlayCanvas.getContext('2d');
		if (!context) return;
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		context.clearRect(0, 0, width, height);
		if (showGrid && !vectorFamily && viewState.family !== 'barnsley-fern') drawGrid(context);
		if (guideOverlay !== 'none' && !vectorFamily) drawMathematicalGuide(context);
		if (
			viewState.coloring === 'orbit-trap' &&
			viewState.orbitTrap &&
			!vectorFamily &&
			viewState.family !== 'barnsley-fern'
		) {
			drawOrbitTrap(context);
		}
		if (orbitOverlay.length > 1 && !vectorFamily && viewState.family !== 'barnsley-fern') {
			context.save();
			context.strokeStyle = 'rgba(244, 221, 161, 0.92)';
			context.lineWidth = 1.35;
			context.beginPath();
			for (let index = 0; index < orbitOverlay.length; index += 1) {
				const point = complexToPresentedScreen(orbitOverlay[index]);
				if (index === 0) context.moveTo(point.x, point.y);
				else context.lineTo(point.x, point.y);
			}
			context.stroke();
			context.fillStyle = 'rgba(112, 211, 218, 0.9)';
			for (
				let index = 0;
				index < orbitOverlay.length;
				index += Math.max(1, Math.floor(orbitOverlay.length / 32))
			) {
				const point = complexToPresentedScreen(orbitOverlay[index]);
				context.beginPath();
				context.arc(point.x, point.y, 1.8, 0, Math.PI * 2);
				context.fill();
			}
			context.restore();
		}
		const visibleMarker = markerDragPoint ?? selectedPoint;
		const visibleMarkerDecimal = markerDragDecimal ?? selectedPointDecimal;
		if (visibleMarker && !vectorFamily && viewState.family !== 'barnsley-fern') {
			const point = complexToPresentedScreen(visibleMarker, visibleMarkerDecimal);
			context.strokeStyle = '#f4dda1';
			context.fillStyle = '#0b0d13';
			context.lineWidth = 1.5;
			context.beginPath();
			context.arc(point.x, point.y, linked ? 7 : 5, 0, Math.PI * 2);
			context.fill();
			context.stroke();
			context.beginPath();
			context.moveTo(point.x - 12, point.y);
			context.lineTo(point.x + 12, point.y);
			context.moveTo(point.x, point.y - 12);
			context.lineTo(point.x, point.y + 12);
			context.stroke();
		}
		if (boxStart && boxEnd) {
			const left = Math.min(boxStart.x, boxEnd.x);
			const top = Math.min(boxStart.y, boxEnd.y);
			const boxWidth = Math.abs(boxEnd.x - boxStart.x);
			const boxHeight = Math.abs(boxEnd.y - boxStart.y);
			context.save();
			context.fillStyle = 'rgba(112, 211, 218, 0.12)';
			context.strokeStyle = 'rgba(154, 234, 239, 0.95)';
			context.lineWidth = 1.5;
			context.setLineDash([7, 4]);
			context.fillRect(left, top, boxWidth, boxHeight);
			context.strokeRect(
				left + 0.75,
				top + 0.75,
				Math.max(0, boxWidth - 1.5),
				Math.max(0, boxHeight - 1.5)
			);
			context.restore();
		}
	}

	function drawMathematicalGuide(context: CanvasRenderingContext2D) {
		context.save();
		context.strokeStyle = 'rgba(244, 221, 161, 0.88)';
		context.fillStyle = 'rgba(8, 10, 15, 0.84)';
		context.lineWidth = 1.25;
		context.setLineDash([6, 4]);

		if (
			guideOverlay === 'mandelbrot-landmarks' &&
			viewState.family === 'mandelbrot' &&
			viewState.plane === 'parameter'
		) {
			const cardioid = Array.from({ length: 181 }, (_, index) => {
				const angle = (index / 180) * Math.PI * 2;
				return {
					re: 0.5 * Math.cos(angle) - 0.25 * Math.cos(2 * angle),
					im: 0.5 * Math.sin(angle) - 0.25 * Math.sin(2 * angle)
				};
			});
			const bulb = Array.from({ length: 121 }, (_, index) => {
				const angle = (index / 120) * Math.PI * 2;
				return {
					re: -1 + 0.25 * Math.cos(angle),
					im: 0.25 * Math.sin(angle)
				};
			});
			drawComplexPolyline(context, cardioid);
			drawComplexPolyline(context, bulb);
			drawGuideLabel(context, 'main cardioid', { re: -0.1, im: 0.18 });
			drawGuideLabel(context, 'period-2 bulb', { re: -1, im: 0.31 });
		} else if (
			guideOverlay === 'multibrot-symmetry' &&
			viewState.family === 'multibrot' &&
			viewState.plane === 'parameter'
		) {
			const order = Math.max(1, Math.round(viewState.exponent) - 1);
			const extent =
				Math.max(viewState.spanY, viewState.spanY * (width / Math.max(1, height))) * 1.2;
			context.beginPath();
			for (let index = 0; index < order; index += 1) {
				const angle = (index / order) * Math.PI * 2;
				const from = complexToPresentedScreen({
					re: -Math.cos(angle) * extent,
					im: -Math.sin(angle) * extent
				});
				const to = complexToPresentedScreen({
					re: Math.cos(angle) * extent,
					im: Math.sin(angle) * extent
				});
				context.moveTo(from.x, from.y);
				context.lineTo(to.x, to.y);
			}
			context.stroke();
			drawGuideLabel(context, `${order}-fold rotational guide`, { re: 0.08, im: 0.08 });
		}
		context.restore();
	}

	function drawComplexPolyline(context: CanvasRenderingContext2D, points: readonly ComplexValue[]) {
		if (!points.length) return;
		context.beginPath();
		for (let index = 0; index < points.length; index += 1) {
			const point = complexToPresentedScreen(points[index]);
			if (index === 0) context.moveTo(point.x, point.y);
			else context.lineTo(point.x, point.y);
		}
		context.stroke();
	}

	function drawGuideLabel(
		context: CanvasRenderingContext2D,
		label: string,
		position: ComplexValue
	) {
		const point = complexToPresentedScreen(position);
		if (point.x < -80 || point.x > width + 80 || point.y < -20 || point.y > height + 20) return;
		context.setLineDash([]);
		context.font = '600 11px ui-monospace, SFMono-Regular, Consolas, monospace';
		const measured = context.measureText(label);
		const x = Math.max(4, Math.min(width - measured.width - 10, point.x));
		const y = Math.max(14, Math.min(height - 5, point.y));
		context.fillRect(x - 4, y - 12, measured.width + 8, 16);
		context.fillStyle = 'rgba(244, 221, 161, 0.94)';
		context.fillText(label, x, y);
		context.fillStyle = 'rgba(8, 10, 15, 0.84)';
		context.setLineDash([6, 4]);
	}

	function drawOrbitTrap(context: CanvasRenderingContext2D) {
		const trap = viewState.orbitTrap;
		if (!trap) return;
		const centre = complexToPresentedScreen(trap.position);
		const pixelsPerUnit = height / Math.max(Number.MIN_VALUE, viewState.spanY);
		const extent = Math.max(viewState.spanY, viewState.spanY * (width / Math.max(1, height))) * 2;
		const direction = {
			re: Math.cos(trap.rotation),
			im: Math.sin(trap.rotation)
		};
		const perpendicular = { re: -direction.im, im: direction.re };
		const line = (vector: { re: number; im: number }, offset = 0) => {
			const normal = { re: -vector.im, im: vector.re };
			const origin = {
				re: trap.position.re + normal.re * offset,
				im: trap.position.im + normal.im * offset
			};
			const from = complexToPresentedScreen({
				re: origin.re - vector.re * extent,
				im: origin.im - vector.im * extent
			});
			const to = complexToPresentedScreen({
				re: origin.re + vector.re * extent,
				im: origin.im + vector.im * extent
			});
			context.moveTo(from.x, from.y);
			context.lineTo(to.x, to.y);
		};

		context.save();
		context.strokeStyle = 'rgba(112, 211, 218, 0.82)';
		context.fillStyle = 'rgba(8, 12, 18, 0.78)';
		context.lineWidth = 1.25;
		context.setLineDash([5, 4]);
		context.beginPath();
		if (trap.kind === 'point') {
			context.arc(centre.x, centre.y, 5, 0, Math.PI * 2);
		} else if (trap.kind === 'circle') {
			context.arc(
				centre.x,
				centre.y,
				Math.max(1, Math.min(Math.hypot(width, height) * 2, trap.radius * pixelsPerUnit)),
				0,
				Math.PI * 2
			);
		} else if (trap.kind === 'line') {
			line(direction);
		} else if (trap.kind === 'cross') {
			line(direction);
			line(perpendicular);
		} else {
			const spacing = Math.max(1e-12, Math.abs(trap.spacing));
			for (let index = -16; index <= 16; index += 1) {
				line(direction, index * spacing);
				line(perpendicular, index * spacing);
			}
		}
		context.stroke();
		context.setLineDash([]);
		context.beginPath();
		context.arc(centre.x, centre.y, 2.5, 0, Math.PI * 2);
		context.fill();
		context.stroke();
		context.restore();
	}

	function drawGrid(context: CanvasRenderingContext2D) {
		const viewport = stateViewport(viewState);
		const bounds = viewportBounds(viewport, width, height);
		const order = Math.floor(Math.log10(Math.max(Number.MIN_VALUE, viewport.spanY)));
		const rawStep = 10 ** order;
		const candidates = [rawStep / 5, rawStep / 2, rawStep, rawStep * 2];
		const step =
			candidates.find((candidate) => (candidate / viewport.spanY) * height >= 58) ?? rawStep * 5;
		context.lineWidth = 1;
		context.strokeStyle = 'rgba(236, 224, 194, 0.09)';
		context.beginPath();
		for (const re of boundedGridValues(bounds.minRe, bounds.maxRe, step)) {
			const rawPoint = complexToScreen(viewport, { re, im: 0 }, width, height);
			const point = { x: rawPoint.x, y: viewState.flipY ? height - rawPoint.y : rawPoint.y };
			context.moveTo(point.x, 0);
			context.lineTo(point.x, height);
		}
		for (const im of boundedGridValues(bounds.minIm, bounds.maxIm, step)) {
			const rawPoint = complexToScreen(viewport, { re: 0, im }, width, height);
			const point = { x: rawPoint.x, y: viewState.flipY ? height - rawPoint.y : rawPoint.y };
			context.moveTo(0, point.y);
			context.lineTo(width, point.y);
		}
		context.stroke();
		context.strokeStyle = 'rgba(236, 224, 194, 0.24)';
		context.beginPath();
		if (bounds.minIm <= 0 && bounds.maxIm >= 0) {
			const axis = complexToPresentedScreen({ re: 0, im: 0 });
			context.moveTo(0, axis.y);
			context.lineTo(width, axis.y);
		}
		if (bounds.minRe <= 0 && bounds.maxRe >= 0) {
			const axis = complexToPresentedScreen({ re: 0, im: 0 });
			context.moveTo(axis.x, 0);
			context.lineTo(axis.x, height);
		}
		context.stroke();
	}

	function localPoint(event: MouseEvent | PointerEvent | WheelEvent): Point {
		const rect = stage.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	function pointerDown(event: PointerEvent) {
		if (!interactive) return;
		finishWheelGesture();
		if (event.pointerType === 'touch') interactionEngaged = true;
		stage.focus({ preventScroll: true });
		stage.setPointerCapture(event.pointerId);
		const point = localPoint(event);
		pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y });
		lastPointer = point;
		dragMoved = false;
		if (pointers.size === 1) {
			dragOriginState = cloneState(viewState);
			if (event.shiftKey) {
				pointerMode = 'box';
				boxStart = point;
				boxEnd = point;
			} else if (selectedPoint) {
				const marker = complexToPresentedScreen(selectedPoint, selectedPointDecimal);
				pointerMode = Math.hypot(point.x - marker.x, point.y - marker.y) <= 18 ? 'marker' : 'pan';
				if (pointerMode === 'marker') {
					markerDragPoint = { ...selectedPoint };
					markerDragDecimal = selectedPointDecimal ? { ...selectedPointDecimal } : null;
				}
			} else {
				pointerMode = 'pan';
			}
		}
		if (pointers.size === 2) {
			pointerMode = 'pan';
			markerDragPoint = null;
			markerDragDecimal = null;
			boxStart = null;
			boxEnd = null;
			const [first, second] = [...pointers.values()];
			gestureDistance = Math.hypot(second.x - first.x, second.y - first.y);
			gestureMidpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
		}
	}

	function pointerMove(event: PointerEvent) {
		const point = localPoint(event);
		onhover?.(presentedToComplex(point), presentedToDecimalComplex(point));
		if (!interactive || !pointers.has(event.pointerId)) return;
		const previous = pointers.get(event.pointerId);
		if (!previous) return;
		pointers.set(event.pointerId, { ...previous, x: point.x, y: point.y });
		if (pointerMode === 'marker' && pointers.size === 1) {
			if (Math.hypot(point.x - previous.startX, point.y - previous.startY) > 2) dragMoved = true;
			markerDragPoint = presentedToComplex(point);
			markerDragDecimal = presentedToDecimalComplex(point);
			onhover?.(markerDragPoint, markerDragDecimal);
			scheduleOverlay();
			scheduleRender();
			return;
		}
		if (pointerMode === 'box' && pointers.size === 1) {
			if (Math.hypot(point.x - previous.startX, point.y - previous.startY) > 3) dragMoved = true;
			boxEnd = point;
			scheduleOverlay();
			return;
		}
		if (pointers.size >= 2) {
			const [first, second] = [...pointers.values()];
			const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
			const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
			let viewport = stateViewport(viewState);
			if (gestureMidpoint) {
				viewport = panViewport(
					viewport,
					midpoint.x - gestureMidpoint.x,
					presentedDeltaY(midpoint.y - gestureMidpoint.y),
					width,
					height
				);
			}
			viewport = zoomViewport(
				viewport,
				midpoint.x,
				presentedY(midpoint.y),
				width,
				height,
				gestureDistance / distance
			);
			onviewchange?.(withViewport(viewState, viewport));
			gestureDistance = distance;
			gestureMidpoint = midpoint;
			dragMoved = true;
			return;
		}
		if (lastPointer) {
			const dx = point.x - lastPointer.x;
			const dy = point.y - lastPointer.y;
			if (Math.hypot(point.x - previous.startX, point.y - previous.startY) > 3) dragMoved = true;
			onviewchange?.(
				withViewport(
					viewState,
					panViewport(stateViewport(viewState), dx, presentedDeltaY(dy), width, height)
				)
			);
		}
		lastPointer = point;
	}

	function pointerUp(event: PointerEvent) {
		const point = localPoint(event);
		const record = pointers.get(event.pointerId);
		pointers.delete(event.pointerId);
		if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
		if (pointerMode === 'marker' && markerDragPoint) {
			onprobe?.({ ...markerDragPoint }, markerDragDecimal ? { ...markerDragDecimal } : undefined);
		} else if (
			pointerMode === 'box' &&
			boxStart &&
			boxEnd &&
			dragOriginState &&
			Math.abs(boxEnd.x - boxStart.x) >= 8 &&
			Math.abs(boxEnd.y - boxStart.y) >= 8
		) {
			const viewport = zoomToRectangle(
				stateViewport(dragOriginState),
				{ x: boxStart.x, y: presentedY(boxStart.y) },
				{ x: boxEnd.x, y: presentedY(boxEnd.y) },
				width,
				height
			);
			const next = withViewport(viewState, viewport);
			onviewchange?.(next);
			onviewcommit?.(dragOriginState, cloneState(next), 'Rectangle zoom');
		} else if (
			pointerMode !== 'box' &&
			!dragMoved &&
			record &&
			Math.hypot(point.x - record.startX, point.y - record.startY) <= 5
		) {
			onprobe?.(presentedToComplex(point), presentedToDecimalComplex(point));
		}
		if (pointers.size === 0) {
			if (pointerMode === 'pan' && dragMoved && dragOriginState) {
				onviewcommit?.(dragOriginState, cloneState(viewState), 'Pan or pinch');
			}
			dragOriginState = null;
			lastPointer = null;
			gestureMidpoint = null;
			gestureDistance = 0;
			pointerMode = null;
			markerDragPoint = null;
			markerDragDecimal = null;
			boxStart = null;
			boxEnd = null;
			onhover?.(null, null);
			scheduleRender();
			scheduleOverlay();
		} else {
			const remaining = [...pointers.values()][0];
			lastPointer = { x: remaining.x, y: remaining.y };
		}
	}

	function pointerLeave() {
		if (pointers.size === 0) onhover?.(null);
	}

	function wheel(event: WheelEvent) {
		if (!interactive) return;
		event.preventDefault();
		if (!wheelOriginState) wheelOriginState = cloneState(viewState);
		wheelInteracting = true;
		const point = localPoint(event);
		const factor = Math.exp(Math.max(-1.2, Math.min(1.2, event.deltaY * 0.0013)));
		const next = withViewport(
			viewState,
			zoomViewport(stateViewport(viewState), point.x, presentedY(point.y), width, height, factor)
		);
		wheelLatestState = cloneState(next);
		onviewchange?.(next);
		if (wheelCommitTimer) clearTimeout(wheelCommitTimer);
		wheelCommitTimer = setTimeout(finishWheelGesture, 180);
	}

	function finishWheelGesture() {
		if (wheelCommitTimer) clearTimeout(wheelCommitTimer);
		wheelCommitTimer = null;
		if (wheelOriginState && wheelLatestState) {
			const direction = wheelLatestState.spanY < wheelOriginState.spanY ? 'Zoom in' : 'Zoom out';
			onviewcommit?.(wheelOriginState, wheelLatestState, direction);
		}
		wheelOriginState = null;
		wheelLatestState = null;
		if (wheelInteracting) {
			wheelInteracting = false;
			scheduleRender();
		}
	}

	function doubleClick(event: MouseEvent) {
		if (!interactive) return;
		event.preventDefault();
		const before = cloneState(viewState);
		const point = localPoint(event);
		const next = withViewport(
			viewState,
			zoomViewport(stateViewport(viewState), point.x, presentedY(point.y), width, height, 0.5)
		);
		onviewchange?.(next);
		onviewcommit?.(before, cloneState(next), 'Double-click zoom');
	}

	function keydown(event: KeyboardEvent) {
		if (!interactive) return;
		if (event.key === 'Escape') {
			interactionEngaged = false;
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			onprobe?.(
				{ ...viewState.center },
				viewState.centerDecimal ? { ...viewState.centerDecimal } : undefined
			);
			return;
		}
		if (selectedPoint && event.altKey && event.key.startsWith('Arrow')) {
			event.preventDefault();
			const marker = complexToPresentedScreen(selectedPoint, selectedPointDecimal);
			const distance = event.shiftKey ? 8 : 1;
			const moved = {
				x:
					marker.x +
					(event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0),
				y:
					marker.y +
					(event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0)
			};
			onprobe?.(presentedToComplex(moved), presentedToDecimalComplex(moved));
			return;
		}
		const before = cloneState(viewState);
		let viewport = stateViewport(viewState);
		let handled = true;
		const panScale = event.shiftKey ? 0.24 : 0.08;
		const panX = width * panScale;
		const panY = height * panScale;
		if (event.key === 'ArrowLeft') viewport = panViewport(viewport, panX, 0, width, height);
		else if (event.key === 'ArrowRight') viewport = panViewport(viewport, -panX, 0, width, height);
		else if (event.key === 'ArrowUp') {
			viewport = panViewport(viewport, 0, presentedDeltaY(panY), width, height);
		} else if (event.key === 'ArrowDown') {
			viewport = panViewport(viewport, 0, presentedDeltaY(-panY), width, height);
		} else if (event.key === '+' || event.key === '=') {
			viewport = zoomViewport(viewport, width / 2, height / 2, width, height, 0.72);
		} else if (event.key === '-' || event.key === '_') {
			viewport = zoomViewport(viewport, width / 2, height / 2, width, height, 1.38);
		} else handled = false;
		if (!handled) return;
		event.preventDefault();
		const next = withViewport(viewState, viewport);
		onviewchange?.(next);
		onviewcommit?.(before, cloneState(next), 'Keyboard navigation');
	}

	export function pauseProgressive() {
		userWantsProgressiveRun = false;
		worker?.pause();
		progressivePhase = 'paused';
		setStatus('Progressive render paused.', 'worker');
	}

	export function runProgressive() {
		userWantsProgressiveRun = true;
		if (nearViewport && pageVisible) {
			if (worker) worker.run();
			else scheduleProgressiveRestart();
			progressivePhase = 'running';
			setStatus('Progressive render running.', 'worker');
		} else {
			setStatus('Run requested; rendering will resume when this plane is visible.', 'worker');
		}
	}

	export function stepProgressive() {
		userWantsProgressiveRun = false;
		if (nearViewport && pageVisible) {
			worker?.step(viewState.family === 'barnsley-fern' ? 1 : undefined);
		}
		progressivePhase = 'paused';
		setStatus(
			nearViewport && pageVisible
				? viewState.family === 'barnsley-fern'
					? 'Advanced one seeded affine decision.'
					: 'Advanced one deterministic batch.'
				: 'Step deferred because this plane is not visible.',
			'worker'
		);
	}

	export function restartProgressive() {
		progressiveWorkerKey = null;
		startProgressive();
	}

	export async function pngBlob(caption?: FractalPngCaption): Promise<Blob | null> {
		if (!stage || width < 1 || height < 1) return null;
		const output = document.createElement('canvas');
		const ratio = Math.min(2, window.devicePixelRatio || 1);
		output.width = Math.max(1, Math.round(width * ratio));
		output.height = Math.max(1, Math.round(height * ratio));
		const context = output.getContext('2d');
		if (!context) return null;
		context.scale(ratio, ratio);
		context.fillStyle = viewState.interiorColor;
		context.fillRect(0, 0, width, height);
		const visibleRaster = gpuCanvas.hidden ? fallbackCanvas : gpuCanvas;
		context.drawImage(visibleRaster, 0, 0, width, height);
		context.drawImage(overlayCanvas, 0, 0, width, height);
		if (caption) drawFractalPngCaption(context, width, height, caption);
		return await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
	}

	export function cssSize() {
		return {
			width: Math.max(1, Math.round(width)),
			height: Math.max(1, Math.round(height))
		};
	}

	export function focus() {
		stage?.focus();
	}

	$effect(() => {
		void viewState;
		if (!mounted) return;
		const familyChanged = previousFamily !== viewState.family;
		if (familyChanged) {
			if (!progressiveFamily) {
				if (progressiveRestartTimer) clearTimeout(progressiveRestartTimer);
				progressiveRestartTimer = null;
				worker?.dispose();
				worker = null;
				progressiveWorkerKey = null;
				progressivePhase = 'idle';
				onprogress?.(0, 'Progressive renderer idle');
			} else {
				userWantsProgressiveRun = true;
			}
			previousFamily = viewState.family;
		}
		if (!nearViewport || !pageVisible) {
			if (rasterFamily && activeBackend === 'worker') {
				worker?.pause();
				setStatus(
					pageVisible
						? 'CPU tile render paused while this plane is offscreen.'
						: 'CPU tile render paused while this tab is hidden.',
					'worker'
				);
			}
			if (progressiveFamily && progressivePhase === 'running') {
				worker?.pause();
				progressivePhase = 'paused';
				setStatus(
					pageVisible
						? 'Progressive render paused while this plane is offscreen.'
						: 'Progressive render paused while this tab is hidden.',
					'worker'
				);
			}
			return;
		}
		scheduleRender();
		scheduleOverlay();
	});

	$effect(() => {
		void selectedPoint;
		void selectedPointDecimal;
		void orbitOverlay;
		void showGrid;
		void guideOverlay;
		void sierpinskiMode;
		if (mounted) {
			scheduleOverlay();
			if (viewState.family === 'sierpinski') scheduleRender();
		}
	});

	onMount(() => {
		mounted = true;
		pageVisible = document.visibilityState !== 'hidden';
		previousFamily = viewState.family;
		const initialRectangle = stage.getBoundingClientRect();
		nearViewport =
			initialRectangle.bottom >= -240 &&
			initialRectangle.top <= window.innerHeight + 240 &&
			initialRectangle.right >= 0 &&
			initialRectangle.left <= window.innerWidth;
		const handleVisibility = () => {
			pageVisible = document.visibilityState !== 'hidden';
		};
		document.addEventListener('visibilitychange', handleVisibility);
		if ('IntersectionObserver' in window) {
			intersectionObserver = new IntersectionObserver(
				(entries) => {
					nearViewport = entries.some((entry) => entry.isIntersecting);
				},
				{ rootMargin: '240px 0px' }
			);
			intersectionObserver.observe(stage);
		} else {
			nearViewport = true;
		}
		resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(stage);
		resize();
		updateCanvasGeometry(gpuCanvas);
		updateCanvasGeometry(fallbackCanvas);
		return () => {
			mounted = false;
			resizeObserver?.disconnect();
			resizeObserver = null;
			intersectionObserver?.disconnect();
			intersectionObserver = null;
			document.removeEventListener('visibilitychange', handleVisibility);
			cancelAnimationFrame(renderFrame);
			cancelAnimationFrame(overlayFrame);
			if (progressiveRestartTimer) clearTimeout(progressiveRestartTimer);
			if (wheelCommitTimer) clearTimeout(wheelCommitTimer);
			webgl?.destroy();
			cpu?.destroy();
			worker?.dispose();
			webgl = null;
			cpu = null;
			worker = null;
			progressiveWorkerKey = null;
		};
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={stage}
	class:interactive
	class:linked
	class:interaction-engaged={interactionEngaged}
	class="fractal-stage"
	role="application"
	tabindex={interactive ? 0 : -1}
	aria-label={accessibleLabel}
	aria-describedby={interactive ? `${uid}-instructions` : undefined}
	onpointerdown={pointerDown}
	onpointermove={pointerMove}
	onpointerup={pointerUp}
	onpointercancel={pointerUp}
	onpointerleave={pointerLeave}
	onwheel={wheel}
	onkeydown={keydown}
	ondblclick={doubleClick}
>
	{#if interactive}
		<span id={`${uid}-instructions`} class="sr-only">
			Tap once to engage touch navigation. Drag to pan, scroll or pinch to zoom, double-click to
			zoom in, click or press Enter to inspect an orbit, and use the arrow or plus and minus keys to
			navigate. Press Escape to release touch navigation.
		</span>
	{/if}
	<canvas bind:this={gpuCanvas} class="render-layer" aria-hidden="true"></canvas>
	<canvas bind:this={fallbackCanvas} class="render-layer" aria-hidden="true"></canvas>
	<canvas bind:this={overlayCanvas} class="overlay-layer" aria-hidden="true"></canvas>
	{#if progressiveFamily}
		<div class="progressive-chip" data-phase={progressivePhase}>
			<span class="pulse" aria-hidden="true"></span>
			{progressivePhase === 'running'
				? 'Progressive'
				: progressivePhase === 'paused'
					? 'Paused'
					: progressivePhase === 'complete'
						? 'Complete'
						: 'Preparing'}
		</div>
	{/if}
</div>

<style>
	.fractal-stage {
		position: relative;
		isolation: isolate;
		width: 100%;
		height: 100%;
		min-height: 19rem;
		overflow: hidden;
		background:
			radial-gradient(circle at 48% 40%, rgba(55, 45, 88, 0.28), transparent 45%), #090a10;
		outline: none;
		touch-action: pan-y;
	}

	.fractal-stage.interaction-engaged {
		touch-action: none;
	}

	.fractal-stage.interactive {
		cursor: crosshair;
	}

	.fractal-stage.interactive:active {
		cursor: grabbing;
	}

	.fractal-stage:focus-visible {
		box-shadow: inset 0 0 0 3px #e2c66e;
	}

	.render-layer,
	.overlay-layer {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	.overlay-layer {
		z-index: 2;
		pointer-events: none;
	}

	.linked {
		box-shadow: inset 0 0 0 1px rgba(93, 174, 181, 0.45);
	}

	.progressive-chip {
		position: absolute;
		z-index: 3;
		top: 0.7rem;
		left: 0.7rem;
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		border: 1px solid rgba(230, 214, 173, 0.22);
		border-radius: 999px;
		padding: 0.28rem 0.55rem;
		background: rgba(9, 10, 16, 0.76);
		color: #eee2c5;
		font:
			600 0.67rem/1.2 ui-monospace,
			SFMono-Regular,
			Menlo,
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		backdrop-filter: blur(8px);
	}

	.pulse {
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 50%;
		background: #d8bc63;
	}

	.progressive-chip[data-phase='running'] .pulse {
		animation: breathe 1.6s ease-in-out infinite;
	}

	.progressive-chip[data-phase='complete'] .pulse {
		background: #63a68c;
	}

	.progressive-chip[data-phase='paused'] .pulse {
		background: #aa7659;
	}

	@keyframes breathe {
		50% {
			opacity: 0.35;
			transform: scale(0.72);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.progressive-chip[data-phase='running'] .pulse {
			animation: none;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
