<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { boundsFromPoints, screenToWorld, zoomAround } from '$lib/notes/geometry';
	import { prepareImageFile } from '$lib/notes/images';
	import {
		createId,
		isDrawingTool,
		type CanvasObject,
		type DrawingTool,
		type InkPoint,
		type ShapeObject,
		type StickyObject,
		type StrokeObject,
		type TextObject
	} from '$lib/notes/model';
	import type { InkEditorState } from '$lib/notes/editor-state.svelte';
	import { CanvasRenderer } from '$lib/notes/renderer';
	import { normalizeStrokePoints } from '$lib/notes/strokes';
	import InkMinimap from './InkMinimap.svelte';

	type Props = {
		editor: InkEditorState;
		readOnly?: boolean;
		label?: string;
		onnotice?: (message: string) => void;
		onimage?: (file: File, position: { x: number; y: number }) => void;
	};

	let {
		editor,
		readOnly = false,
		label = 'Infinite handwritten note canvas',
		onnotice,
		onimage
	}: Props = $props();

	let root: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(1);
	let height = $state(1);
	let renderer = new CanvasRenderer();
	let draftPoints = $state<InkPoint[]>([]);
	let previewObject = $state<CanvasObject | null>(null);
	let lasso = $state<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
	let textEntry = $state<{
		kind: 'text' | 'sticky';
		worldX: number;
		worldY: number;
		screenX: number;
		screenY: number;
		value: string;
	} | null>(null);
	let importing = $state(false);
	let activeMode = $state<'draw' | 'pan' | 'move' | 'shape' | 'lasso' | 'erase' | null>(null);
	let activePointerId: number | null = null;
	let activePenPointerId: number | null = null;
	let gestureTool: DrawingTool | ShapeObject['shape'] | null = null;
	let pointerStart = { x: 0, y: 0 };
	let viewportStart = { x: 0, y: 0, zoom: 1 };
	let lastPenAt = 0;
	let spaceHeld = false;
	let touches = new SvelteMap<number, { x: number; y: number }>();
	let gesture: {
		distance: number;
		center: { x: number; y: number };
		viewport: { x: number; y: number; zoom: number };
		worldAnchor: { x: number; y: number };
	} | null = null;
	let textArea = $state<HTMLTextAreaElement>();

	function render() {
		if (!canvas) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		renderer.render(context, editor.document, editor.viewport, {
			width,
			height,
			devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
			selectedIds: readOnly ? undefined : editor.selectedSet,
			previewObject,
			guides: readOnly ? undefined : editor.alignmentGuides,
			readOnly
		});
	}

	function resize() {
		if (!root || !canvas) return;
		const rectangle = root.getBoundingClientRect();
		width = Math.max(1, rectangle.width);
		height = Math.max(1, rectangle.height);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		render();
	}

	function localPoint(event: PointerEvent | WheelEvent | DragEvent) {
		const rectangle = canvas.getBoundingClientRect();
		return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
	}

	function toInkPoint(event: PointerEvent): InkPoint {
		const screen = localPoint(event);
		const world = screenToWorld(screen, editor.viewport);
		const pressure =
			event.pointerType === 'mouse' || event.pressure <= 0
				? 0.5
				: Math.max(0.01, Math.min(1, event.pressure));
		const point: InkPoint = {
			x: world.x,
			y: world.y,
			pressure,
			time: event.timeStamp
		};
		if (event.pointerType === 'pen') {
			point.tiltX = event.tiltX;
			point.tiltY = event.tiltY;
			point.twist = event.twist;
			point.tangentialPressure = event.tangentialPressure;
			if ('altitudeAngle' in event && Number.isFinite(event.altitudeAngle)) {
				point.altitudeAngle = event.altitudeAngle;
			}
			if ('azimuthAngle' in event && Number.isFinite(event.azimuthAngle)) {
				point.azimuthAngle = event.azimuthAngle;
			}
		}
		return point;
	}

	function coalesced(event: PointerEvent) {
		try {
			const events = event.getCoalescedEvents?.();
			return events && events.length > 0 ? events : [event];
		} catch {
			return [event];
		}
	}

	function isShapeTool(tool: string | null): tool is ShapeObject['shape'] {
		return tool === 'line' || tool === 'arrow' || tool === 'rectangle' || tool === 'ellipse';
	}

	function makeStrokePreview(points: InkPoint[], tool: DrawingTool): StrokeObject | null {
		if (points.length === 0) return null;
		const style = { ...editor.brushes[tool] };
		const bounds = boundsFromPoints(points, style.size / 2 + 2);
		const now = new Date().toISOString();
		const width = Math.max(1, bounds.maxX - bounds.minX);
		const height = Math.max(1, bounds.maxY - bounds.minY);
		return {
			id: 'preview-stroke',
			type: 'stroke',
			tool,
			x: bounds.minX,
			y: bounds.minY,
			width,
			height,
			sourceWidth: width,
			sourceHeight: height,
			rotation: 0,
			opacity: 1,
			locked: false,
			hidden: false,
			zIndex: 100_000,
			createdAt: now,
			updatedAt: `${now}:${points.length}`,
			points: normalizeStrokePoints(points, bounds.minX, bounds.minY),
			style
		};
	}

	function makeShapePreview(
		start: { x: number; y: number },
		end: { x: number; y: number },
		shape: ShapeObject['shape']
	) {
		const minX = Math.min(start.x, end.x);
		const minY = Math.min(start.y, end.y);
		const width = Math.max(1, Math.abs(end.x - start.x));
		const height = Math.max(1, Math.abs(end.y - start.y));
		const now = new Date().toISOString();
		return {
			id: 'preview-shape',
			type: 'shape',
			shape,
			x: minX,
			y: minY,
			width,
			height,
			rotation: 0,
			opacity: 0.72,
			locked: false,
			hidden: false,
			zIndex: 100_000,
			createdAt: now,
			updatedAt: now,
			from: { x: start.x - minX, y: start.y - minY },
			to: { x: end.x - minX, y: end.y - minY },
			stroke: editor.activeBrush.color,
			strokeWidth: Math.max(1, editor.activeBrush.size * 0.65)
		} satisfies ShapeObject;
	}

	function startTouch(event: PointerEvent) {
		if (!readOnly && (activePenPointerId !== null || performance.now() - lastPenAt < 700)) {
			return;
		}
		event.preventDefault();
		canvas.focus({ preventScroll: true });
		const point = localPoint(event);
		touches.set(event.pointerId, point);
		canvas.setPointerCapture(event.pointerId);
		if (touches.size === 2) {
			if (activeMode === 'move') editor.cancelTransform();
			activeMode = null;
			activePointerId = null;
			const [first, second] = [...touches.values()];
			const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
			gesture = {
				distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
				center,
				viewport: { ...editor.viewport },
				worldAnchor: screenToWorld(center, editor.viewport)
			};
		} else if (touches.size === 1) {
			activePointerId = event.pointerId;
			pointerStart = point;
			viewportStart = { ...editor.viewport };
			if (readOnly || editor.tool === 'hand') {
				activeMode = 'pan';
			} else if (editor.tool === 'select') {
				const world = screenToWorld(point, editor.viewport);
				const hit = renderer.hitTest(editor.document, world, 12 / editor.viewport.zoom);
				if (hit) {
					editor.selectObject(hit.id);
					editor.beginTransform();
					activeMode = 'move';
				} else {
					editor.clearSelection();
					activeMode = 'pan';
				}
			} else {
				activePointerId = null;
				activeMode = null;
			}
		}
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.pointerType === 'pen') lastPenAt = performance.now();
		const fingerAuthoring =
			event.pointerType === 'touch' &&
			!readOnly &&
			editor.fingerInkEnabled &&
			activePenPointerId === null &&
			performance.now() - lastPenAt >= 700 &&
			editor.tool !== 'select' &&
			editor.tool !== 'lasso' &&
			editor.tool !== 'hand';
		if (event.pointerType === 'touch' && !fingerAuthoring) {
			startTouch(event);
			return;
		}
		if (
			event.button !== 0 &&
			event.button !== 1 &&
			!(event.pointerType === 'pen' && event.button === 2) &&
			!(event.pointerType === 'pen' && event.button === 5)
		) {
			return;
		}
		if (event.pointerType === 'pen') {
			if (activeMode === 'move' && touches.size > 0) editor.cancelTransform();
			for (const pointerId of touches.keys()) {
				if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
			}
			touches.clear();
			gesture = null;
			activePointerId = null;
			activeMode = null;
			activePenPointerId = event.pointerId;
		}
		event.preventDefault();
		canvas.focus({ preventScroll: true });
		canvas.setPointerCapture(event.pointerId);
		activePointerId = event.pointerId;
		gestureTool = null;
		const screen = localPoint(event);
		const world = screenToWorld(screen, editor.viewport);
		pointerStart = screen;
		viewportStart = { ...editor.viewport };

		if (readOnly || spaceHeld || editor.tool === 'hand' || event.button === 1) {
			activeMode = 'pan';
			return;
		}

		const barrelEraser =
			event.pointerType === 'pen' && ((event.buttons & 2) === 2 || event.button === 5);
		if (editor.tool === 'eraser' || barrelEraser) {
			activeMode = 'erase';
			const hit = renderer.hitTest(editor.document, world, 14 / editor.viewport.zoom);
			if (hit) editor.deleteObject(hit.id);
			return;
		}

		const selectedTool = editor.tool;
		if (isDrawingTool(selectedTool)) {
			activeMode = 'draw';
			gestureTool = selectedTool;
			draftPoints = [toInkPoint(event)];
			previewObject = makeStrokePreview(draftPoints, selectedTool);
			return;
		}

		if (isShapeTool(selectedTool)) {
			activeMode = 'shape';
			gestureTool = selectedTool;
			previewObject = makeShapePreview(world, world, selectedTool);
			return;
		}

		if (editor.tool === 'text' || editor.tool === 'sticky') {
			textEntry = {
				kind: editor.tool,
				worldX: world.x,
				worldY: world.y,
				screenX: Math.min(width - 300, Math.max(12, screen.x)),
				screenY: Math.min(height - 190, Math.max(12, screen.y)),
				value: ''
			};
			setTimeout(() => textArea?.focus(), 0);
			activeMode = null;
			return;
		}

		const hit = renderer.hitTest(editor.document, world, 8 / editor.viewport.zoom);
		if (hit && editor.tool !== 'lasso') {
			editor.selectObject(hit.id, event.shiftKey);
			editor.beginTransform();
			activeMode = 'move';
		} else {
			if (!event.shiftKey) editor.clearSelection();
			activeMode = 'lasso';
			lasso = { startX: screen.x, startY: screen.y, endX: screen.x, endY: screen.y };
		}
	}

	function updateTouch(event: PointerEvent) {
		if (!touches.has(event.pointerId)) return;
		touches.set(event.pointerId, localPoint(event));
		if (touches.size < 2 || !gesture) {
			if (activePointerId === event.pointerId && activeMode === 'pan') {
				const current = localPoint(event);
				editor.setViewport({
					...viewportStart,
					x: viewportStart.x + current.x - pointerStart.x,
					y: viewportStart.y + current.y - pointerStart.y
				});
			} else if (activePointerId === event.pointerId && activeMode === 'move') {
				const current = localPoint(event);
				const world = screenToWorld(current, editor.viewport);
				const startWorld = screenToWorld(pointerStart, viewportStart);
				editor.moveSelection(world.x - startWorld.x, world.y - startWorld.y);
			}
			return;
		}
		const [first, second] = [...touches.values()];
		const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
		const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
		const zoom = Math.max(0.1, Math.min(8, gesture.viewport.zoom * (distance / gesture.distance)));
		editor.setViewport({
			zoom,
			x: center.x - gesture.worldAnchor.x * zoom,
			y: center.y - gesture.worldAnchor.y * zoom
		});
	}

	function handlePointerMove(event: PointerEvent) {
		if (event.pointerType === 'pen') lastPenAt = performance.now();
		if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
			updateTouch(event);
			return;
		}
		if (event.pointerId !== activePointerId || !activeMode) return;
		event.preventDefault();
		const screen = localPoint(event);
		const world = screenToWorld(screen, editor.viewport);

		if (activeMode === 'pan') {
			editor.setViewport({
				...viewportStart,
				x: viewportStart.x + screen.x - pointerStart.x,
				y: viewportStart.y + screen.y - pointerStart.y
			});
			return;
		}
		if (activeMode === 'draw' && gestureTool && isDrawingTool(gestureTool)) {
			draftPoints = [...draftPoints, ...coalesced(event).map(toInkPoint)];
			previewObject = makeStrokePreview(draftPoints, gestureTool);
			return;
		}
		if (activeMode === 'erase') {
			const hit = renderer.hitTest(editor.document, world, 14 / editor.viewport.zoom);
			if (hit) editor.deleteObject(hit.id);
			return;
		}
		if (activeMode === 'move') {
			const startWorld = screenToWorld(pointerStart, viewportStart);
			editor.moveSelection(world.x - startWorld.x, world.y - startWorld.y);
			return;
		}
		if (activeMode === 'shape' && isShapeTool(gestureTool)) {
			const startWorld = screenToWorld(pointerStart, viewportStart);
			previewObject = makeShapePreview(startWorld, world, gestureTool);
			return;
		}
		if (activeMode === 'lasso' && lasso) {
			lasso = { ...lasso, endX: screen.x, endY: screen.y };
		}
	}

	function finishTouch(event: PointerEvent, cancelled = false) {
		touches.delete(event.pointerId);
		if (touches.size < 2) gesture = null;
		if (activePointerId === event.pointerId) {
			if (activeMode === 'move') {
				if (cancelled) editor.cancelTransform();
				else editor.finishTransform();
			}
			activePointerId = null;
			activeMode = null;
		}
	}

	function handlePointerUp(event: PointerEvent) {
		if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
			finishTouch(event);
			return;
		}
		if (event.pointerId !== activePointerId) return;
		const mode = activeMode;
		const screen = localPoint(event);
		const world = screenToWorld(screen, editor.viewport);
		if (mode === 'draw' && gestureTool && isDrawingTool(gestureTool)) {
			const finalPoints = [...draftPoints, ...coalesced(event).map(toInkPoint)];
			editor.addStroke(finalPoints, gestureTool);
		} else if (mode === 'shape') {
			const startWorld = screenToWorld(pointerStart, viewportStart);
			if (
				isShapeTool(gestureTool) &&
				Math.hypot(world.x - startWorld.x, world.y - startWorld.y) > 2
			) {
				editor.addShape(gestureTool, startWorld, world);
			}
		} else if (mode === 'move') {
			editor.finishTransform();
		} else if (mode === 'lasso' && lasso) {
			const start = screenToWorld({ x: lasso.startX, y: lasso.startY }, editor.viewport);
			const end = screenToWorld({ x: lasso.endX, y: lasso.endY }, editor.viewport);
			const found = renderer.search({
				minX: Math.min(start.x, end.x),
				minY: Math.min(start.y, end.y),
				maxX: Math.max(start.x, end.x),
				maxY: Math.max(start.y, end.y)
			});
			editor.select(
				found
					.filter((object) => !editor.editTileContents || object.type !== 'tile')
					.map((object) => object.id),
				event.shiftKey
			);
		}
		activePointerId = null;
		activeMode = null;
		draftPoints = [];
		previewObject = null;
		lasso = null;
		gestureTool = null;
		if (event.pointerType === 'pen' && activePenPointerId === event.pointerId) {
			activePenPointerId = null;
			lastPenAt = performance.now();
		}
	}

	function handlePointerCancel(event: PointerEvent) {
		if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
			finishTouch(event, true);
			return;
		}
		if (event.pointerId !== activePointerId) return;
		if (activeMode === 'move') editor.cancelTransform();
		activePointerId = null;
		activeMode = null;
		draftPoints = [];
		previewObject = null;
		lasso = null;
		gestureTool = null;
		if (event.pointerType === 'pen' && activePenPointerId === event.pointerId) {
			activePenPointerId = null;
			lastPenAt = performance.now();
		}
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		const point = localPoint(event);
		if (event.ctrlKey || event.metaKey) {
			const factor = Math.exp(-event.deltaY * 0.003);
			editor.setViewport(zoomAround(editor.viewport, point, editor.viewport.zoom * factor));
		} else {
			editor.setViewport({
				...editor.viewport,
				x: editor.viewport.x - event.deltaX,
				y: editor.viewport.y - event.deltaY
			});
		}
	}

	function submitText(event: SubmitEvent) {
		event.preventDefault();
		if (!textEntry?.value.trim()) {
			textEntry = null;
			return;
		}
		const now = new Date().toISOString();
		const nextZ =
			editor.document.objects.reduce((highest, object) => Math.max(highest, object.zIndex), 0) + 1;
		if (textEntry.kind === 'text') {
			const object: TextObject = {
				id: createId('text'),
				type: 'text',
				x: textEntry.worldX,
				y: textEntry.worldY,
				width: 360,
				height: 120,
				rotation: 0,
				opacity: 1,
				locked: false,
				hidden: false,
				zIndex: nextZ,
				createdAt: now,
				updatedAt: now,
				text: textEntry.value.trim(),
				color: editor.activeBrush.color,
				fontSize: 28,
				fontFamily: 'serif',
				align: 'left'
			};
			editor.addObject(object);
		} else {
			const object: StickyObject = {
				id: createId('sticky'),
				type: 'sticky',
				x: textEntry.worldX,
				y: textEntry.worldY,
				width: 260,
				height: 220,
				rotation: -1,
				opacity: 1,
				locked: false,
				hidden: false,
				zIndex: nextZ,
				createdAt: now,
				updatedAt: now,
				text: textEntry.value.trim(),
				color: '#f2d98b',
				textColor: '#322b20',
				fontSize: 22
			};
			editor.addObject(object);
		}
		textEntry = null;
	}

	async function insertDroppedImage(file: File, screen: { x: number; y: number }) {
		const position = screenToWorld(screen, editor.viewport);
		const intendedTileId = editor.activeTileId;
		if (onimage) {
			onimage(file, position);
			return;
		}
		importing = true;
		onnotice?.('Preparing image…');
		try {
			const image = await prepareImageFile(file);
			editor.addImage(image, position, intendedTileId);
			onnotice?.('Image added. Use Select to move, resize, rotate, or group it with ink.');
		} catch (error) {
			onnotice?.(error instanceof Error ? error.message : 'The image could not be added.');
		} finally {
			importing = false;
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		if (readOnly) return;
		const file = event.dataTransfer?.files[0];
		if (file) void insertDroppedImage(file, localPoint(event));
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.target !== canvas) return;
		if (event.code === 'Space' && !event.repeat) {
			spaceHeld = true;
			event.preventDefault();
		}
		if (readOnly && (event.key === '+' || event.key === '=')) {
			editor.setViewport(
				zoomAround(editor.viewport, { x: width / 2, y: height / 2 }, editor.viewport.zoom * 1.15)
			);
		}
		if (readOnly && event.key === '-') {
			editor.setViewport(
				zoomAround(editor.viewport, { x: width / 2, y: height / 2 }, editor.viewport.zoom / 1.15)
			);
		}
	}

	function handleKeyup(event: KeyboardEvent) {
		if (event.code === 'Space') spaceHeld = false;
	}

	onMount(() => {
		const observer = new ResizeObserver(resize);
		observer.observe(root);
		resize();
		renderer.onRender = (count) => (editor.visibleObjectCount = count);
		return () => {
			observer.disconnect();
			renderer.dispose();
		};
	});

	$effect(() => {
		void editor.document;
		void editor.viewport;
		void editor.selectedIds;
		void editor.alignmentGuides;
		void previewObject;
		void width;
		void height;
		render();
	});
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<div
	bind:this={root}
	role="group"
	class:read-only={readOnly}
	class="ink-canvas-root"
	ondragover={(event) => {
		if (!readOnly) event.preventDefault();
	}}
	ondrop={handleDrop}
>
	<canvas
		bind:this={canvas}
		tabindex="0"
		aria-label={label}
		aria-describedby="ink-canvas-help"
		class:grabbing={activeMode === 'pan' || activeMode === 'move'}
		class:crosshair={!readOnly && isDrawingTool(editor.tool)}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerCancel}
		onwheel={handleWheel}
	></canvas>

	<p id="ink-canvas-help" class="sr-only">
		{readOnly
			? 'Pan with one finger or a mouse wheel. Pinch with two fingers or use Control plus wheel to zoom.'
			: 'Draw with a pen or mouse. Touch uses two-finger pan and pinch zoom to reject palms. Use the toolbar or keyboard shortcuts to select tools.'}
	</p>
	<ul class="sr-only" aria-label="Canvas objects">
		{#each editor.document.objects.slice(0, 200) as object (object.id)}
			<li>
				{#if object.type === 'image'}
					Image: {object.alt || 'No text alternative provided'}
				{:else if object.type === 'text' || object.type === 'sticky'}
					{object.type === 'sticky' ? 'Sticky note' : 'Text'}: {object.text}
				{:else if object.type === 'tile'}
					Movable tile: {object.title}
				{:else if object.type === 'stroke'}
					{object.tool} handwriting stroke
				{:else}
					{object.shape} shape
				{/if}
			</li>
		{/each}
		{#if editor.document.objects.length > 200}
			<li>
				{editor.document.objects.length - 200} additional canvas objects. Use the transcript for the complete
				accessible reading version.
			</li>
		{/if}
	</ul>

	{#if lasso}
		<div
			class="lasso-box"
			style:left={`${Math.min(lasso.startX, lasso.endX)}px`}
			style:top={`${Math.min(lasso.startY, lasso.endY)}px`}
			style:width={`${Math.abs(lasso.endX - lasso.startX)}px`}
			style:height={`${Math.abs(lasso.endY - lasso.startY)}px`}
			aria-hidden="true"
		></div>
	{/if}

	{#if textEntry}
		<form
			class="text-entry"
			style:left={`${textEntry.screenX}px`}
			style:top={`${textEntry.screenY}px`}
			onsubmit={submitText}
		>
			<label for="canvas-text-entry">
				{textEntry.kind === 'sticky' ? 'Sticky note text' : 'Text'}
			</label>
			<textarea
				bind:this={textArea}
				id="canvas-text-entry"
				bind:value={textEntry.value}
				rows="4"
				maxlength={textEntry.kind === 'sticky' ? 2000 : 5000}
			></textarea>
			<div>
				<button type="submit">Place</button>
				<button type="button" onclick={() => (textEntry = null)}>Cancel</button>
			</div>
		</form>
	{/if}

	{#if importing}
		<div class="image-loading" role="status">Preparing image…</div>
	{/if}

	{#if editor.showMinimap && !editor.distractionFree}
		<InkMinimap {editor} surfaceWidth={width} surfaceHeight={height} />
	{/if}

	<div class="canvas-stats" aria-hidden="true">
		{Math.round(editor.viewport.zoom * 100)}% · {editor.visibleObjectCount}/{editor.objectCount}
	</div>
</div>

<style>
	.ink-canvas-root {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 24rem;
		overflow: hidden;
		background: #fbf7ec;
		isolation: isolate;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		cursor: default;
		-webkit-user-select: none;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	canvas.crosshair {
		cursor: crosshair;
	}

	canvas.grabbing {
		cursor: grabbing;
	}

	canvas:focus-visible {
		outline: 3px solid #2f6b60;
		outline-offset: -4px;
	}

	.lasso-box {
		position: absolute;
		z-index: 7;
		pointer-events: none;
		border: 1.5px dashed #2f6b60;
		background: rgb(47 107 96 / 9%);
	}

	.text-entry {
		position: absolute;
		z-index: 20;
		width: min(18rem, calc(100% - 1.5rem));
		padding: 0.75rem;
		border: 1px solid #8d7c63;
		border-radius: 0.5rem;
		background: #fffaf0;
		box-shadow: 0 12px 38px rgb(43 36 28 / 24%);
		color: #2b241c;
	}

	.text-entry label {
		display: block;
		margin-bottom: 0.35rem;
		font-size: 0.78rem;
		font-weight: 700;
	}

	.text-entry textarea {
		display: block;
		width: 100%;
		resize: vertical;
		border: 1px solid #998a74;
		border-radius: 0.35rem;
		background: #fffdf7;
		padding: 0.55rem;
		font:
			1rem/1.4 Georgia,
			serif;
	}

	.text-entry div {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}

	.text-entry button {
		min-height: 2.75rem;
		border: 1px solid #776a57;
		border-radius: 0.35rem;
		padding: 0.45rem 0.8rem;
		font-weight: 700;
	}

	.image-loading {
		position: absolute;
		inset: 50% auto auto 50%;
		z-index: 15;
		transform: translate(-50%, -50%);
		border-radius: 999px;
		background: rgb(43 36 28 / 88%);
		padding: 0.65rem 1rem;
		color: white;
		font-size: 0.86rem;
	}

	.canvas-stats {
		position: absolute;
		right: max(0.75rem, env(safe-area-inset-right));
		bottom: max(0.65rem, env(safe-area-inset-bottom));
		z-index: 6;
		border-radius: 999px;
		background: rgb(255 250 240 / 82%);
		padding: 0.25rem 0.55rem;
		color: #625746;
		font-size: 0.68rem;
		box-shadow: 0 1px 5px rgb(43 36 28 / 10%);
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}
</style>
