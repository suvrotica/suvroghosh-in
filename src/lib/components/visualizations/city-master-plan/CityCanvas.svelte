<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type {
		CellCoordinate,
		CityResult,
		GenerationEvent,
		Rotation
	} from '$lib/visualizations/city-master-plan/engine/types';
	import {
		CITY_CAMERA_MAX_ZOOM,
		CITY_CAMERA_MIN_ZOOM,
		clampCityCamera,
		clampNumber,
		fitCityCamera,
		overlayFromGenerationEvent,
		renderCityBase,
		renderCityOverlay,
		renderCityToBlob,
		resetCityCamera,
		screenToCityCell,
		screenToWorld,
		type CityAppearance,
		type CityCamera,
		type CityExportOptions,
		type CityPlacementPreview,
		type CityRenderOverlay
	} from '$lib/visualizations/city-master-plan/render';

	export type CityCanvasMode = 'play' | 'lab';

	export type CityCanvasProps = {
		result?: CityResult | null;
		poster?: string;
		posterAlt?: string;
		mode?: CityCanvasMode;
		/**
		 * Replays the first N genuine result.events. Omit it to show the complete
		 * city. Fabric and occupation have separate reveal masks.
		 */
		revealEventCount?: number | null;
		event?: GenerationEvent | null;
		selected?: CellCoordinate | null;
		currentCell?: CellCoordinate | null;
		propagationCells?: readonly CellCoordinate[];
		entropy?: readonly (number | null | undefined)[];
		candidateCounts?: readonly (number | null | undefined)[];
		revealedCells?: readonly boolean[];
		placement?: CityPlacementPreview | null;
		appearance?: CityAppearance | 'auto';
		showEntropy?: boolean;
		showSockets?: boolean;
		showGrid?: boolean;
		animate?: boolean;
		disabled?: boolean;
		autoFit?: boolean;
		ariaLabel?: string;
		onselect?: (cell: CellCoordinate) => void;
		oninspect?: (cell: CellCoordinate) => void;
		onplace?: (cell: CellCoordinate, rotation: Rotation) => void;
		onhover?: (cell: CellCoordinate | null) => void;
		onrotate?: (rotation: Rotation) => void;
		onviewchange?: (camera: CityCamera) => void;
		onready?: () => void;
		onerror?: (message: string) => void;
	};

	type RenderState = 'poster' | 'ready' | 'error';
	type GestureMode = 'idle' | 'pending' | 'pan' | 'pinch' | 'scroll';
	type PointerSample = {
		clientX: number;
		clientY: number;
		pointerType: string;
	};
	type ReplayVisibility = {
		fabric: readonly boolean[];
		occupation: readonly boolean[];
	} | null;
	type PinchStart = {
		distance: number;
		midpointX: number;
		midpointY: number;
		worldX: number;
		worldY: number;
		camera: CityCamera;
	};

	let {
		result = null,
		poster = '/images/the-city-that-refuses-a-master-plan.webp',
		posterAlt = 'Illustrated poster for The City That Refuses a Master Plan.',
		mode = 'play',
		revealEventCount = null,
		event,
		selected,
		currentCell,
		propagationCells,
		entropy,
		candidateCounts,
		revealedCells,
		placement = null,
		appearance = 'auto',
		showEntropy,
		showSockets = false,
		showGrid = false,
		animate = true,
		disabled = false,
		autoFit = true,
		ariaLabel,
		onselect,
		oninspect,
		onplace,
		onhover,
		onrotate,
		onviewchange,
		onready,
		onerror
	}: CityCanvasProps = $props();

	const uid = $props.id();
	const activePointers = new SvelteMap<number, PointerSample>();
	const PAN_THRESHOLD = 7;
	const TOUCH_AXIS_RATIO = 1.12;
	const AMBIENT_FRAME_INTERVAL = 80;

	let stage: HTMLDivElement;
	let baseCanvas: HTMLCanvasElement;
	let interactionCanvas: HTMLCanvasElement;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let themeObserver: MutationObserver | null = null;
	let motionQuery: MediaQueryList | null = null;
	let baseFrame = 0;
	let overlayFrame = 0;
	let ambientFrame = 0;
	let lastAmbientAt = 0;
	let mounted = $state(false);
	let stageWidth = $state(1);
	let stageHeight = $state(1);
	let pixelRatio = $state(1);
	let renderState = $state<RenderState>('poster');
	let renderError = $state('');
	let documentAppearance = $state<CityAppearance>('paper');
	let reducedMotion = $state(false);
	let siteMotionStill = $state(false);
	let inView = $state(true);
	let documentVisible = $state(true);
	let camera = $state<CityCamera>({ x: 0, y: 0, zoom: 1 });
	let hasCamera = false;
	// Keep an untouched fitted view responsive to its eventual container size.
	// The result can arrive before ResizeObserver reports the real stage bounds;
	// without this flag that first 1 × 1 fit remains stuck at the minimum zoom.
	let cameraTracksFit = true;
	let fittedResultKey = '';
	let internalSelected = $state<CellCoordinate | null>(null);
	let hoveredCell = $state<CellCoordinate | null>(null);
	let status = $state('City map ready for inspection.');
	let gestureMode = $state<GestureMode>('idle');
	let primaryPointerId: number | null = null;
	let pointerStartX = 0;
	let pointerStartY = 0;
	let pointerStartCamera: CityCamera = { x: 0, y: 0, zoom: 1 };
	let gestureMoved = false;
	let pinchStart: PinchStart | null = null;
	let readyReported = false;
	let errorReported = false;

	let resolvedAppearance = $derived<CityAppearance>(
		appearance === 'auto' ? documentAppearance : appearance
	);
	let entropyVisible = $derived(showEntropy ?? mode === 'lab');
	let effectiveSelected = $derived(selected === undefined ? internalSelected : selected);
	let shouldAnimate = $derived(
		Boolean(result) &&
			animate &&
			!reducedMotion &&
			!siteMotionStill &&
			inView &&
			documentVisible &&
			renderState === 'ready'
	);

	let replayVisibility = $derived.by<ReplayVisibility>(() => {
		if (!result || revealEventCount === null || revealEventCount === undefined) return null;
		const count = Math.max(0, Math.floor(revealEventCount));
		if (count >= result.events.length) return null;
		const cellCount = result.width * result.height;
		const fabric = new Array<boolean>(cellCount).fill(false);
		const occupation = new Array<boolean>(cellCount).fill(false);
		for (let index = 0; index < count; index += 1) {
			const replayEvent = result.events[index];
			switch (replayEvent.type) {
				case 'observe': {
					const cellIndex = replayEvent.cell.y * result.width + replayEvent.cell.x;
					if (cellIndex < 0 || cellIndex >= cellCount) break;
					if (replayEvent.pass === 'fabric') fabric[cellIndex] = true;
					else occupation[cellIndex] = true;
					break;
				}
				case 'patch': {
					const cellIndex = replayEvent.patch.cell.y * result.width + replayEvent.patch.cell.x;
					if (cellIndex >= 0 && cellIndex < cellCount) {
						if (replayEvent.pass === 'fabric') fabric[cellIndex] = true;
						else occupation[cellIndex] = true;
					}
					break;
				}
				case 'complete':
					fabric.fill(true);
					occupation.fill(true);
					break;
			}
		}
		return { fabric, occupation };
	});

	let activeEvent = $derived.by<GenerationEvent | null>(() => {
		if (event !== undefined) return event;
		if (!result || revealEventCount === null || revealEventCount === undefined) return null;
		const index = Math.min(result.events.length, Math.max(0, Math.floor(revealEventCount))) - 1;
		return index >= 0 ? result.events[index] : null;
	});
	let eventOverlay = $derived(overlayFromGenerationEvent(activeEvent));
	let effectiveCurrentCell = $derived(
		currentCell === undefined ? eventOverlay.currentCell : currentCell
	);
	let effectivePropagation = $derived(
		propagationCells === undefined ? eventOverlay.propagationCells : propagationCells
	);
	let effectivePlacement = $derived.by<CityPlacementPreview | null>(() => {
		if (!placement) return null;
		if (placement.origin !== undefined) return placement;
		return {
			...placement,
			origin: hoveredCell ?? effectiveSelected
		};
	});
	let dynamicAriaLabel = $derived.by(() => {
		if (ariaLabel) return ariaLabel;
		if (!result) {
			return 'Fictional city poster. The interactive city map is preparing.';
		}
		const selectedText = effectiveSelected
			? ` Selected cell column ${effectiveSelected.x + 1}, row ${effectiveSelected.y + 1}.`
			: '';
		return `${result.cityName}, a fictional ${result.width} by ${result.height} neighbourhood generated from seed ${result.seed}.${selectedText} Use the arrow keys to select cells, Enter to inspect, and the map controls to fit or zoom.`;
	});

	function currentOverlay(): CityRenderOverlay {
		return {
			selectedCell: effectiveSelected,
			hoveredCell,
			currentCell: effectiveCurrentCell,
			propagationCells: effectivePropagation,
			entropy,
			candidateCounts,
			revealedCells,
			revealedFabricCells: replayVisibility?.fabric,
			revealedOccupationCells: replayVisibility?.occupation,
			placement: effectivePlacement,
			showEntropy: entropyVisible,
			showGrid,
			showSockets
		};
	}

	function reportError(cause: unknown): void {
		const message = cause instanceof Error ? cause.message : 'The city map could not be rendered.';
		renderError = message;
		renderState = 'error';
		if (!errorReported) {
			errorReported = true;
			onerror?.(message);
			console.error('City Canvas renderer:', cause);
		}
	}

	function clearCanvas(canvas: HTMLCanvasElement | undefined): void {
		if (!canvas) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, canvas.width, canvas.height);
	}

	function drawBase(): void {
		baseFrame = 0;
		if (!mounted || !baseCanvas) return;
		if (!result) {
			clearCanvas(baseCanvas);
			renderState = 'poster';
			return;
		}
		try {
			const context = baseCanvas.getContext('2d', { alpha: false });
			if (!context) throw new Error('This browser does not provide a Canvas 2D context.');
			renderCityBase(context, {
				result,
				viewportWidth: stageWidth,
				viewportHeight: stageHeight,
				pixelRatio,
				camera,
				appearance: resolvedAppearance,
				mode: 'interactive',
				time: 0,
				animate: false,
				overlay: currentOverlay()
			});
			renderState = 'ready';
			renderError = '';
			errorReported = false;
			if (!readyReported) {
				readyReported = true;
				onready?.();
			}
		} catch (cause) {
			reportError(cause);
		}
	}

	function drawOverlay(time = performance.now()): void {
		overlayFrame = 0;
		if (!mounted || !interactionCanvas) return;
		if (!result) {
			clearCanvas(interactionCanvas);
			return;
		}
		try {
			const context = interactionCanvas.getContext('2d', { alpha: true });
			if (!context) throw new Error('This browser does not provide a Canvas 2D context.');
			renderCityOverlay(context, {
				result,
				viewportWidth: stageWidth,
				viewportHeight: stageHeight,
				pixelRatio,
				camera,
				appearance: resolvedAppearance,
				mode: 'interactive',
				time,
				animate: shouldAnimate,
				overlay: currentOverlay()
			});
		} catch (cause) {
			reportError(cause);
		}
	}

	function scheduleBase(): void {
		if (!mounted || baseFrame) return;
		baseFrame = requestAnimationFrame(drawBase);
	}

	function scheduleOverlay(): void {
		if (!mounted || overlayFrame) return;
		overlayFrame = requestAnimationFrame(() => drawOverlay());
	}

	function ambientLoop(time: number): void {
		ambientFrame = 0;
		if (!shouldAnimate) return;
		if (time - lastAmbientAt >= AMBIENT_FRAME_INTERVAL) {
			lastAmbientAt = time;
			drawOverlay(time);
		}
		ambientFrame = requestAnimationFrame(ambientLoop);
	}

	function startAmbientLoop(): void {
		if (!mounted || ambientFrame || !shouldAnimate) return;
		ambientFrame = requestAnimationFrame(ambientLoop);
	}

	function stopAmbientLoop(): void {
		if (ambientFrame) cancelAnimationFrame(ambientFrame);
		ambientFrame = 0;
		lastAmbientAt = 0;
	}

	function setCamera(next: CityCamera, announce = false, tracksFit = false): void {
		if (!result) return;
		camera = clampCityCamera(next, result, stageWidth, stageHeight);
		hasCamera = true;
		cameraTracksFit = tracksFit;
		onviewchange?.({ ...camera });
		scheduleBase();
		scheduleOverlay();
		if (announce) status = `Map zoom ${Math.round(camera.zoom * 100)} percent.`;
	}

	export function fit(): void {
		if (!result) return;
		setCamera(fitCityCamera(result, stageWidth, stageHeight), true, true);
		status = 'City fitted within the map frame.';
	}

	export function fitCity(): void {
		fit();
	}

	export function reset(): void {
		if (!result) return;
		setCamera(resetCityCamera(result), true);
		status = 'Map reset to one drawing unit per screen pixel.';
	}

	export function resetView(): void {
		reset();
	}

	function zoomAt(
		nextZoom: number,
		screenX = stageWidth / 2,
		screenY = stageHeight / 2,
		announce = false
	): void {
		if (!result) return;
		const world = screenToWorld(screenX, screenY, camera, stageWidth, stageHeight);
		const zoom = clampNumber(nextZoom, CITY_CAMERA_MIN_ZOOM, CITY_CAMERA_MAX_ZOOM);
		setCamera(
			{
				x: world.x - (screenX - stageWidth / 2) / zoom,
				y: world.y - (screenY - stageHeight / 2) / zoom,
				zoom
			},
			announce
		);
	}

	export function zoomIn(): void {
		zoomAt(camera.zoom * 1.24, stageWidth / 2, stageHeight / 2, true);
	}

	export function zoomOut(): void {
		zoomAt(camera.zoom / 1.24, stageWidth / 2, stageHeight / 2, true);
	}

	export function focus(): void {
		interactionCanvas?.focus({ preventScroll: true });
	}

	export function getCamera(): CityCamera {
		return { ...camera };
	}

	export async function exportPng(options: CityExportOptions = {}): Promise<Blob> {
		if (!result) throw new Error('There is no completed city to export.');
		return renderCityToBlob(result, {
			appearance: resolvedAppearance,
			...options
		});
	}

	function resize(): void {
		if (!stage || !baseCanvas || !interactionCanvas) return;
		const rectangle = stage.getBoundingClientRect();
		if (rectangle.width < 2 || rectangle.height < 2) return;
		stageWidth = rectangle.width;
		stageHeight = rectangle.height;
		pixelRatio = Math.min(window.devicePixelRatio || 1, rectangle.width < 520 ? 1.5 : 2);
		const backingWidth = Math.max(1, Math.round(stageWidth * pixelRatio));
		const backingHeight = Math.max(1, Math.round(stageHeight * pixelRatio));
		for (const canvas of [baseCanvas, interactionCanvas]) {
			if (canvas.width !== backingWidth) canvas.width = backingWidth;
			if (canvas.height !== backingHeight) canvas.height = backingHeight;
		}
		if (result) {
			if (!hasCamera || (autoFit && cameraTracksFit)) {
				camera = fitCityCamera(result, stageWidth, stageHeight);
				hasCamera = true;
				cameraTracksFit = autoFit;
			} else {
				camera = clampCityCamera(camera, result, stageWidth, stageHeight);
			}
		}
		scheduleBase();
		scheduleOverlay();
	}

	function cellAtClient(clientX: number, clientY: number): CellCoordinate | null {
		if (!result || !interactionCanvas) return null;
		const rectangle = interactionCanvas.getBoundingClientRect();
		const screenX = ((clientX - rectangle.left) / Math.max(1, rectangle.width)) * stageWidth;
		const screenY = ((clientY - rectangle.top) / Math.max(1, rectangle.height)) * stageHeight;
		return screenToCityCell(
			screenX,
			screenY,
			camera,
			stageWidth,
			stageHeight,
			result.width,
			result.height
		);
	}

	function localPoint(clientX: number, clientY: number): CellCoordinate {
		const rectangle = interactionCanvas.getBoundingClientRect();
		return {
			x: ((clientX - rectangle.left) / Math.max(1, rectangle.width)) * stageWidth,
			y: ((clientY - rectangle.top) / Math.max(1, rectangle.height)) * stageHeight
		};
	}

	function sameCell(left: CellCoordinate | null, right: CellCoordinate | null): boolean {
		return left?.x === right?.x && left?.y === right?.y;
	}

	function setHovered(cell: CellCoordinate | null): void {
		if (sameCell(hoveredCell, cell)) return;
		hoveredCell = cell;
		onhover?.(cell ? { ...cell } : null);
		scheduleOverlay();
	}

	function featureLabel(cell: CellCoordinate): string {
		if (!result) return 'cell';
		const index = cell.y * result.width + cell.x;
		const occupation = result.occupationTiles[index];
		const fabric = result.fabricTiles[index];
		const occupationLabel =
			occupation && occupation.prototypeId !== 'empty'
				? occupation.prototypeId || occupation.id
				: null;
		const source = occupationLabel || fabric?.prototypeId || fabric?.id;
		return source ? source.replaceAll('-', ' ') : 'undecided cell';
	}

	function selectCell(cell: CellCoordinate, activate = false): void {
		internalSelected = { ...cell };
		onselect?.({ ...cell });
		status = `Selected column ${cell.x + 1}, row ${cell.y + 1}: ${featureLabel(cell)}.`;
		if (activate) {
			if (placement?.active) {
				onplace?.({ ...cell }, placement.rotation);
				status = `Placement requested at column ${cell.x + 1}, row ${cell.y + 1}.`;
			} else {
				oninspect?.({ ...cell });
			}
		}
		scheduleOverlay();
	}

	function beginPinch(): void {
		if (activePointers.size < 2) return;
		const pointers = [...activePointers.values()];
		const first = pointers[0];
		const second = pointers[1];
		const firstLocal = localPoint(first.clientX, first.clientY);
		const secondLocal = localPoint(second.clientX, second.clientY);
		const midpointX = (firstLocal.x + secondLocal.x) / 2;
		const midpointY = (firstLocal.y + secondLocal.y) / 2;
		const world = screenToWorld(midpointX, midpointY, camera, stageWidth, stageHeight);
		pinchStart = {
			distance: Math.max(
				1,
				Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
			),
			midpointX,
			midpointY,
			worldX: world.x,
			worldY: world.y,
			camera: { ...camera }
		};
		gestureMode = 'pinch';
		gestureMoved = true;
		for (const pointerId of activePointers.keys()) {
			if (!interactionCanvas.hasPointerCapture(pointerId)) {
				try {
					interactionCanvas.setPointerCapture(pointerId);
				} catch {
					// A browser may end one touch while the second is arriving.
				}
			}
		}
	}

	function updatePinch(): void {
		if (!pinchStart || activePointers.size < 2 || !result) return;
		const pointers = [...activePointers.values()];
		const first = pointers[0];
		const second = pointers[1];
		const firstLocal = localPoint(first.clientX, first.clientY);
		const secondLocal = localPoint(second.clientX, second.clientY);
		const midpointX = (firstLocal.x + secondLocal.x) / 2;
		const midpointY = (firstLocal.y + secondLocal.y) / 2;
		const distance = Math.max(
			1,
			Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
		);
		const zoom = clampNumber(
			pinchStart.camera.zoom * (distance / pinchStart.distance),
			CITY_CAMERA_MIN_ZOOM,
			CITY_CAMERA_MAX_ZOOM
		);
		setCamera({
			x: pinchStart.worldX - (midpointX - stageWidth / 2) / zoom,
			y: pinchStart.worldY - (midpointY - stageHeight / 2) / zoom,
			zoom
		});
	}

	function handlePointerDown(pointerEvent: PointerEvent): void {
		if (disabled || !result) return;
		if (pointerEvent.pointerType === 'mouse' && pointerEvent.button !== 0) return;
		interactionCanvas.focus({ preventScroll: true });
		activePointers.set(pointerEvent.pointerId, {
			clientX: pointerEvent.clientX,
			clientY: pointerEvent.clientY,
			pointerType: pointerEvent.pointerType
		});
		if (activePointers.size >= 2) {
			pointerEvent.preventDefault();
			beginPinch();
			return;
		}
		primaryPointerId = pointerEvent.pointerId;
		pointerStartX = pointerEvent.clientX;
		pointerStartY = pointerEvent.clientY;
		pointerStartCamera = { ...camera };
		gestureMode = 'pending';
		gestureMoved = false;
		if (pointerEvent.pointerType !== 'touch') {
			pointerEvent.preventDefault();
			interactionCanvas.setPointerCapture(pointerEvent.pointerId);
		}
	}

	function handlePointerMove(pointerEvent: PointerEvent): void {
		const existing = activePointers.get(pointerEvent.pointerId);
		if (!existing) {
			if (pointerEvent.pointerType === 'mouse') {
				setHovered(cellAtClient(pointerEvent.clientX, pointerEvent.clientY));
			}
			return;
		}
		activePointers.set(pointerEvent.pointerId, {
			...existing,
			clientX: pointerEvent.clientX,
			clientY: pointerEvent.clientY
		});
		if (activePointers.size >= 2) {
			pointerEvent.preventDefault();
			if (gestureMode !== 'pinch') beginPinch();
			updatePinch();
			return;
		}
		if (pointerEvent.pointerId !== primaryPointerId) return;
		const deltaX = pointerEvent.clientX - pointerStartX;
		const deltaY = pointerEvent.clientY - pointerStartY;
		const distance = Math.hypot(deltaX, deltaY);
		if (gestureMode === 'pending' && distance >= PAN_THRESHOLD) {
			if (
				pointerEvent.pointerType === 'touch' &&
				Math.abs(deltaY) > Math.abs(deltaX) * TOUCH_AXIS_RATIO
			) {
				gestureMode = 'scroll';
				gestureMoved = true;
				return;
			}
			if (
				pointerEvent.pointerType !== 'touch' ||
				Math.abs(deltaX) > Math.abs(deltaY) * TOUCH_AXIS_RATIO
			) {
				gestureMode = 'pan';
				gestureMoved = true;
				if (!interactionCanvas.hasPointerCapture(pointerEvent.pointerId)) {
					interactionCanvas.setPointerCapture(pointerEvent.pointerId);
				}
			}
		}
		if (gestureMode === 'pan') {
			pointerEvent.preventDefault();
			setCamera({
				x: pointerStartCamera.x - deltaX / pointerStartCamera.zoom,
				y: pointerStartCamera.y - deltaY / pointerStartCamera.zoom,
				zoom: pointerStartCamera.zoom
			});
		} else if (gestureMode === 'pending') {
			setHovered(cellAtClient(pointerEvent.clientX, pointerEvent.clientY));
		}
	}

	function finishPointer(pointerEvent: PointerEvent, cancelled = false): void {
		const existed = activePointers.has(pointerEvent.pointerId);
		if (!existed) return;
		const wasPinch = gestureMode === 'pinch';
		const wasClick =
			!cancelled &&
			!gestureMoved &&
			gestureMode === 'pending' &&
			pointerEvent.pointerId === primaryPointerId;
		activePointers.delete(pointerEvent.pointerId);
		if (interactionCanvas.hasPointerCapture(pointerEvent.pointerId)) {
			interactionCanvas.releasePointerCapture(pointerEvent.pointerId);
		}
		if (wasClick) {
			const cell = cellAtClient(pointerEvent.clientX, pointerEvent.clientY);
			if (cell) selectCell(cell, true);
		}
		if (wasPinch && activePointers.size === 1) {
			const [pointerId, remaining] = [...activePointers.entries()][0];
			primaryPointerId = pointerId;
			pointerStartX = remaining.clientX;
			pointerStartY = remaining.clientY;
			pointerStartCamera = { ...camera };
			gestureMode = 'pending';
			gestureMoved = true;
			pinchStart = null;
			return;
		}
		if (activePointers.size === 0) {
			primaryPointerId = null;
			gestureMode = 'idle';
			gestureMoved = false;
			pinchStart = null;
		}
	}

	function handlePointerLeave(): void {
		if (activePointers.size === 0) setHovered(null);
	}

	function handleWheel(wheelEvent: WheelEvent): void {
		if (disabled || !result) return;
		wheelEvent.preventDefault();
		interactionCanvas.focus({ preventScroll: true });
		const point = localPoint(wheelEvent.clientX, wheelEvent.clientY);
		const multiplier = Math.exp(-wheelEvent.deltaY * 0.0014);
		zoomAt(camera.zoom * multiplier, point.x, point.y);
	}

	function keyboardStartCell(): CellCoordinate {
		if (!result) return { x: 0, y: 0 };
		return (
			effectiveSelected ?? {
				x: Math.floor(result.width / 2),
				y: Math.floor(result.height / 2)
			}
		);
	}

	function handleKeydown(keyEvent: KeyboardEvent): void {
		if (disabled || !result) return;
		const start = keyboardStartCell();
		const step = keyEvent.shiftKey ? 5 : 1;
		let next: CellCoordinate;
		switch (keyEvent.key) {
			case 'ArrowLeft':
				next = { ...start, x: Math.max(0, start.x - step) };
				break;
			case 'ArrowRight':
				next = { ...start, x: Math.min(result.width - 1, start.x + step) };
				break;
			case 'ArrowUp':
				next = { ...start, y: Math.max(0, start.y - step) };
				break;
			case 'ArrowDown':
				next = { ...start, y: Math.min(result.height - 1, start.y + step) };
				break;
			case 'Home':
				next = { x: 0, y: 0 };
				break;
			case 'End':
				next = { x: result.width - 1, y: result.height - 1 };
				break;
			case 'Enter':
				keyEvent.preventDefault();
				selectCell(start, true);
				return;
			case ' ':
				if (!placement?.active) return;
				keyEvent.preventDefault();
				selectCell(start, true);
				return;
			case 'r':
			case 'R':
				if (!placement?.active) return;
				keyEvent.preventDefault();
				onrotate?.(((placement.rotation + 1) % 4) as Rotation);
				status = 'Anchor rotated clockwise.';
				return;
			case '+':
			case '=':
				keyEvent.preventDefault();
				zoomIn();
				return;
			case '-':
			case '_':
				keyEvent.preventDefault();
				zoomOut();
				return;
			case '0':
				keyEvent.preventDefault();
				reset();
				return;
			case 'f':
			case 'F':
				keyEvent.preventDefault();
				fit();
				return;
			default:
				return;
		}
		keyEvent.preventDefault();
		selectCell(next);
	}

	function appearanceFromDocument(): CityAppearance {
		const theme = document.documentElement.dataset.theme;
		if (theme === 'night') return 'night';
		if (theme === 'high-contrast') return 'high-contrast';
		if (theme === 'light') return 'light';
		return 'paper';
	}

	function updatePreferences(): void {
		documentAppearance = appearanceFromDocument();
		siteMotionStill = document.documentElement.dataset.motion === 'still';
		reducedMotion = motionQuery?.matches ?? false;
	}

	onMount(() => {
		mounted = true;
		motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		updatePreferences();
		if (!baseCanvas.getContext('2d') || !interactionCanvas.getContext('2d')) {
			reportError('This browser could not initialise the city Canvas.');
			return;
		}

		resizeObserver =
			typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
		resizeObserver?.observe(stage);
		intersectionObserver =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver(
						([entry]) => {
							inView = entry?.isIntersecting ?? true;
						},
						{ rootMargin: '180px 0px', threshold: 0.01 }
					);
		intersectionObserver?.observe(stage);
		themeObserver = new MutationObserver(updatePreferences);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme', 'data-motion']
		});
		const handleThemeEvent = () => updatePreferences();
		const handleVisibility = () => {
			documentVisible = !document.hidden;
		};
		const handleWindowResize = () => resize();
		interactionCanvas.addEventListener('wheel', handleWheel, { passive: false });
		window.addEventListener('site-theme-change', handleThemeEvent);
		window.addEventListener('resize', handleWindowResize);
		document.addEventListener('visibilitychange', handleVisibility);
		motionQuery.addEventListener('change', updatePreferences);
		resize();

		return () => {
			mounted = false;
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			themeObserver?.disconnect();
			interactionCanvas.removeEventListener('wheel', handleWheel);
			window.removeEventListener('site-theme-change', handleThemeEvent);
			window.removeEventListener('resize', handleWindowResize);
			document.removeEventListener('visibilitychange', handleVisibility);
			motionQuery?.removeEventListener('change', updatePreferences);
			if (baseFrame) cancelAnimationFrame(baseFrame);
			if (overlayFrame) cancelAnimationFrame(overlayFrame);
			stopAmbientLoop();
			activePointers.clear();
		};
	});

	$effect(() => {
		const nextResultKey = result
			? `${result.width}x${result.height}:${result.fingerprint}:${result.seed}`
			: '';
		if (!mounted || !result || nextResultKey === fittedResultKey) return;
		fittedResultKey = nextResultKey;
		readyReported = false;
		if (autoFit || !hasCamera) {
			camera = fitCityCamera(result, stageWidth, stageHeight);
			hasCamera = true;
			cameraTracksFit = autoFit;
			onviewchange?.({ ...camera });
		} else {
			camera = clampCityCamera(camera, result, stageWidth, stageHeight);
		}
		scheduleBase();
		scheduleOverlay();
	});

	$effect(() => {
		const baseInputs = [
			result,
			resolvedAppearance,
			stageWidth,
			stageHeight,
			pixelRatio,
			camera.x,
			camera.y,
			camera.zoom,
			replayVisibility?.fabric,
			replayVisibility?.occupation,
			revealedCells
		];
		void baseInputs;
		scheduleBase();
	});

	$effect(() => {
		const overlayInputs = [
			result,
			resolvedAppearance,
			stageWidth,
			stageHeight,
			pixelRatio,
			camera.x,
			camera.y,
			camera.zoom,
			effectiveSelected,
			hoveredCell,
			effectiveCurrentCell,
			effectivePropagation,
			entropy,
			candidateCounts,
			effectivePlacement,
			entropyVisible,
			showGrid,
			showSockets
		];
		void overlayInputs;
		scheduleOverlay();
	});

	$effect(() => {
		if (shouldAnimate) {
			startAmbientLoop();
		} else {
			stopAmbientLoop();
			scheduleOverlay();
		}
	});
</script>

<figure
	class:canvas-ready={renderState === 'ready'}
	class:is-enhanced={mounted}
	class:is-manipulating={gestureMode === 'pan' || gestureMode === 'pinch'}
	class="city-canvas"
>
	<div bind:this={stage} class="city-stage">
		<img class="city-poster" src={poster} alt="" aria-hidden="true" width="1600" height="1200" />

		<canvas bind:this={baseCanvas} class="city-map" aria-hidden="true">
			{posterAlt} The article and canonical city report remain available as ordinary text.
		</canvas>

		<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
		<canvas
			bind:this={interactionCanvas}
			class="city-interaction"
			class:is-manipulating={gestureMode === 'pan' || gestureMode === 'pinch'}
			role="application"
			tabindex={disabled ? -1 : 0}
			aria-label={dynamicAriaLabel}
			aria-describedby={`${uid}-instructions ${uid}-fiction`}
			aria-disabled={disabled}
			oncontextmenu={(canvasEvent) => canvasEvent.preventDefault()}
			onkeydown={handleKeydown}
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={(pointerEvent) => finishPointer(pointerEvent)}
			onpointercancel={(pointerEvent) => finishPointer(pointerEvent, true)}
			onlostpointercapture={(pointerEvent) => finishPointer(pointerEvent, true)}
			onpointerleave={handlePointerLeave}
		>
			This interactive city map requires Canvas 2D. The poster and accessible report remain
			available.
		</canvas>

		<div class="city-tools" role="group" aria-label="Map view controls">
			<button type="button" disabled={!result || disabled} onclick={zoomOut} aria-label="Zoom out">
				<span aria-hidden="true">−</span>
			</button>
			<button type="button" disabled={!result || disabled} onclick={zoomIn} aria-label="Zoom in">
				<span aria-hidden="true">+</span>
			</button>
			<button type="button" disabled={!result || disabled} onclick={fit}>Fit</button>
			<button
				type="button"
				disabled={!result || disabled}
				onclick={reset}
				aria-label="Reset to 100%"
			>
				1:1
			</button>
		</div>

		{#if renderState === 'error'}
			<div class="canvas-error" role="alert">
				<strong>The survey table is unavailable.</strong>
				<span>{renderError}</span>
			</div>
		{/if}
	</div>

	<p class="sr-only" aria-live="polite" aria-atomic="true">{status}</p>

	<figcaption>
		<span id={`${uid}-fiction`} class="fiction-note">
			Fictional neighbourhood generated from local rules. Not a map of a real place.
		</span>
		<span id={`${uid}-instructions`} class="canvas-instructions">
			Drag horizontally to pan; scroll normally with a vertical touch. Pinch or use the buttons to
			zoom. Arrow keys select a cell, Enter inspects it, F fits the map, and 0 resets the view.{#if placement?.active}
				Space or Enter places the anchor; R rotates it.{/if}
		</span>
	</figcaption>
</figure>

<style>
	.city-canvas {
		--city-frame: color-mix(in srgb, var(--border, #6c6456) 72%, transparent);
		--city-paper: var(--paper-soft, #d6c9aa);
		position: relative;
		width: 100%;
		margin: 0;
	}

	.city-stage {
		position: relative;
		overflow: hidden;
		width: 100%;
		aspect-ratio: 4 / 3;
		min-height: 20rem;
		max-height: min(72vh, 52rem);
		border: 1px solid var(--city-frame);
		border-radius: clamp(0.65rem, 1.4vw, 1rem);
		background: #171813;
		box-shadow:
			0 1.1rem 2.8rem rgb(23 20 15 / 0.18),
			inset 0 0 0 1px rgb(255 255 255 / 0.04);
		isolation: isolate;
	}

	.city-poster,
	.city-map,
	.city-interaction {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	.city-poster {
		z-index: 1;
		object-fit: cover;
		background: var(--city-paper);
		opacity: 1;
		transition: opacity var(--motion-medium, 300ms) ease;
	}

	.city-map {
		z-index: 2;
		pointer-events: none;
		opacity: 0;
	}

	.city-interaction {
		z-index: 3;
		cursor: grab;
		opacity: 0;
		outline: none;
		/* One-finger vertical movement belongs to the article. Horizontal and
		   two-finger gestures remain available to the map. */
		touch-action: pan-y;
	}

	.canvas-ready .city-poster {
		pointer-events: none;
		opacity: 0;
	}

	.canvas-ready .city-map,
	.canvas-ready .city-interaction {
		opacity: 1;
	}

	.city-interaction.is-manipulating {
		cursor: grabbing;
		touch-action: none;
	}

	.city-interaction:focus-visible {
		box-shadow: inset 0 0 0 4px var(--focus-ring, #d0a23a);
	}

	.city-tools {
		position: absolute;
		z-index: 5;
		top: 0.75rem;
		right: 0.75rem;
		display: none;
		overflow: hidden;
		gap: 1px;
		padding: 2px;
		border: 1px solid rgb(255 255 255 / 0.2);
		border-radius: 0.65rem;
		background: rgb(23 24 19 / 0.84);
		box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 0.24);
		backdrop-filter: blur(8px);
	}

	.is-enhanced .city-tools {
		display: flex;
	}

	.city-tools button {
		display: inline-grid;
		min-width: 2.75rem;
		min-height: 2.75rem;
		place-items: center;
		border: 0;
		border-radius: 0.45rem;
		background: rgb(244 233 205 / 0.94);
		color: #28251f;
		font:
			700 0.78rem/1 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
		cursor: pointer;
	}

	.city-tools button:hover:not(:disabled) {
		background: #fff4d6;
	}

	.city-tools button:focus-visible {
		outline: 3px solid #d0a23a;
		outline-offset: -3px;
	}

	.city-tools button:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}

	.canvas-error {
		position: absolute;
		z-index: 6;
		inset: auto 1rem 1rem;
		display: grid;
		gap: 0.25rem;
		padding: 0.85rem 1rem;
		border: 1px solid #a65742;
		border-radius: 0.6rem;
		background: rgb(30 27 23 / 0.92);
		color: #f4e8ce;
		font-size: 0.85rem;
	}

	figcaption {
		display: grid;
		gap: 0.3rem;
		padding: 0.65rem 0.2rem 0;
		color: var(--muted-foreground, #6e675d);
		font-size: 0.76rem;
		line-height: 1.45;
	}

	.fiction-note {
		color: var(--foreground, #28251f);
		font-weight: 650;
	}

	.canvas-instructions {
		max-width: 78ch;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	:global(html[data-theme='night']) .city-stage {
		border-color: rgb(221 208 178 / 0.35);
		background: #080d0d;
	}

	:global(html[data-theme='high-contrast']) .city-stage {
		border: 2px solid #fff;
		border-radius: 0;
		box-shadow: none;
	}

	:global(html[data-theme='high-contrast']) .city-tools {
		border: 2px solid #fff;
		border-radius: 0;
		background: #000;
	}

	:global(html[data-theme='high-contrast']) .city-tools button {
		border-radius: 0;
		background: #000;
		color: #fff;
	}

	@media (max-width: 520px) {
		.city-stage {
			aspect-ratio: 1 / 1;
			min-height: min(92vw, 25rem);
		}

		.city-tools {
			top: 0.5rem;
			right: 0.5rem;
		}

		.city-tools button {
			min-width: 2.75rem;
			padding: 0 0.5rem;
		}

		.canvas-instructions {
			font-size: 0.72rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.city-poster {
			transition: none;
		}
	}
	:global(html[data-motion='still']) .city-poster {
		transition: none;
	}
</style>
