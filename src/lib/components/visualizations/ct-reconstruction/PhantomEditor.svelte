<script lang="ts">
	import { onMount } from 'svelte';
	import { materialDefinition } from '$lib/visualizations/ct-reconstruction/materials';
	import {
		clonePhantom,
		createBlankPhantom,
		createPresetPhantom,
		paintBrushSegment,
		paintCircle,
		paintEllipse
	} from '$lib/visualizations/ct-reconstruction/phantom';
	import {
		MaterialId,
		type Phantom,
		type PhantomPresetId
	} from '$lib/visualizations/ct-reconstruction/types';

	export type PhantomSelection = {
		x: number;
		y: number;
		row: number;
		column: number;
		material: MaterialId;
		density: number;
	};

	export type PhantomEditorProps = {
		phantom: Phantom;
		preset: PhantomPresetId;
		disabled?: boolean;
		onphantomcommit: (phantom: Phantom) => void;
		onpresetchange: (preset: PhantomPresetId, phantom: Phantom) => void;
		onselectionchange?: (selection: PhantomSelection | null) => void;
	};

	type EditorTool = 'inspect' | 'circle' | 'ellipse' | 'brush' | 'eraser';
	type Point = { x: number; y: number };

	let {
		phantom,
		preset,
		disabled = false,
		onphantomcommit,
		onpresetchange,
		onselectionchange
	}: PhantomEditorProps = $props();

	const uid = $props.id();
	const HISTORY_LIMIT = 24;
	const TAP_MOVE_THRESHOLD_PX = 10;
	const presetOptions: Array<{ id: PhantomPresetId; label: string }> = [
		{ id: 'simple-circles', label: 'Simple circles' },
		{ id: 'head', label: 'Head cross-section' },
		{ id: 'lungs', label: 'Lung cross-section' },
		{ id: 'abdomen', label: 'Abdomen' },
		{ id: 'hidden-lesion', label: 'Hidden lesion' },
		{ id: 'sparse', label: 'Sparse shapes' },
		{ id: 'metal', label: 'Metal implant' },
		{ id: 'blank', label: 'Blank field' }
	];
	const toolOptions: Array<{ id: EditorTool; label: string; symbol: string; help: string }> = [
		{
			id: 'inspect',
			label: 'Inspect',
			symbol: '⌖',
			help: 'Select a phantom pixel without changing it.'
		},
		{ id: 'circle', label: 'Circle', symbol: '○', help: 'Place one circle at the pointer.' },
		{ id: 'ellipse', label: 'Ellipse', symbol: '⬭', help: 'Place one ellipse at the pointer.' },
		{ id: 'brush', label: 'Brush', symbol: '✎', help: 'Paint a continuous material stroke.' },
		{ id: 'eraser', label: 'Eraser', symbol: '⌫', help: 'Paint air over existing material.' }
	];
	const materialOptions: Array<{
		id: MaterialId;
		label: string;
		symbol: string;
		description: string;
	}> = [
		{ id: MaterialId.Air, label: 'Air', symbol: '○', description: 'Empty or erased region' },
		{
			id: MaterialId.SoftTissue,
			label: 'Soft tissue',
			symbol: '●',
			description: 'Mid-grey illustrative material'
		},
		{
			id: MaterialId.Bone,
			label: 'Bone',
			symbol: '▦',
			description: 'Bright stippled material'
		},
		{
			id: MaterialId.LesionHigh,
			label: 'Lesion',
			symbol: '±',
			description: 'Synthetic hatched contrast target'
		},
		{
			id: MaterialId.Metal,
			label: 'Metal',
			symbol: '◆',
			description: 'Very bright striped implant'
		}
	];

	function initialWorkingPhantom() {
		return clonePhantom(phantom);
	}

	function initialHistory() {
		return [clonePhantom(phantom)];
	}

	let canvas: HTMLCanvasElement;
	let canvasHost: HTMLButtonElement;
	let sourceCanvas: HTMLCanvasElement | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let themeObserver: MutationObserver | null = null;
	let drawFrame = 0;
	let mounted = $state(false);
	let activePointerId: number | null = null;
	let activePointerTool: EditorTool | null = null;
	let activePointerMaterial: MaterialId | null = null;
	let gestureBefore: Phantom | null = null;
	let gestureChanged = false;
	let previousPointerPoint: Point | null = null;
	let pointerDownClientPoint: Point | null = null;
	let tapMovementExceeded = false;
	let lastEmittedSnapshot: Phantom | null = null;

	let workingPhantom = $state.raw<Phantom>(initialWorkingPhantom());
	let history = $state.raw<Phantom[]>(initialHistory());
	let historyIndex = $state(0);
	let tool = $state<EditorTool>('inspect');
	let selectedMaterial = $state<MaterialId>(MaterialId.SoftTissue);
	let circleRadiusPercent = $state(14);
	let brushRadiusPercent = $state(4);
	let ellipseWidthPercent = $state(36);
	let ellipseHeightPercent = $state(24);
	let selection = $state<PhantomSelection | null>(null);
	let hoverPoint = $state<Point | null>(null);
	let keyboardPoint = $state<Point>({ x: 0, y: 0 });
	let canvasFocused = $state(false);

	let canUndo = $derived(historyIndex > 0);
	let canRedo = $derived(historyIndex < history.length - 1);
	let activeMaterial = $derived(tool === 'eraser' ? MaterialId.Air : selectedMaterial);
	let selectionText = $derived.by(() => {
		if (!selection) return 'No point selected. Choose Inspect, then tap the phantom.';
		const definition = materialDefinition(selection.material);
		return `Selected row ${selection.row + 1}, column ${selection.column + 1}: ${definition.label}, density ${selection.density.toFixed(2)} at x ${selection.x.toFixed(2)}, y ${selection.y.toFixed(2)}.`;
	});
	let toolInstruction = $derived.by(() => {
		switch (tool) {
			case 'inspect':
				return 'Tap or click to inspect a pixel. With the canvas focused, move the cursor with the arrow keys.';
			case 'circle':
				return 'Tap or click to place a circle of the selected material. The edit is committed when the pointer is released.';
			case 'ellipse':
				return 'Tap or click to place an ellipse of the selected material. Width and height are set below.';
			case 'brush':
				return 'Drag with a mouse, finger, or pen to paint. The complete stroke becomes one undo step.';
			case 'eraser':
				return 'Drag to replace material with air. The complete erased stroke becomes one undo step.';
		}
	});

	function clamp(value: number, minimum: number, maximum: number) {
		return Math.max(minimum, Math.min(maximum, value));
	}

	function phantomsEqual(left: Phantom, right: Phantom) {
		if (
			left === right ||
			(left.size === right.size &&
				left.revision === right.revision &&
				left.materials === right.materials &&
				left.density === right.density)
		) {
			return true;
		}
		if (
			left.size !== right.size ||
			left.revision !== right.revision ||
			left.materials.length !== right.materials.length ||
			left.density.length !== right.density.length
		) {
			return false;
		}
		for (let index = 0; index < left.materials.length; index += 1) {
			if (
				left.materials[index] !== right.materials[index] ||
				left.density[index] !== right.density[index]
			) {
				return false;
			}
		}
		return true;
	}

	function scheduleDraw() {
		if (!mounted || drawFrame) return;
		drawFrame = requestAnimationFrame(() => {
			drawFrame = 0;
			draw();
		});
	}

	function materialPixel(material: MaterialId, row: number, column: number) {
		switch (material) {
			case MaterialId.Air:
				return [7, 10, 10] as const;
			case MaterialId.SoftTissue: {
				const variation = (row + column) % 7 === 0 ? 7 : 0;
				return [105 + variation, 116 + variation, 114 + variation] as const;
			}
			case MaterialId.Bone: {
				const dot = row % 5 === 0 && column % 5 === 0 ? 24 : 0;
				return [190 + dot, 199 + dot, 197 + dot] as const;
			}
			case MaterialId.LesionLow: {
				const hatch = (row + column) % 7 < 2 ? 16 : 0;
				return [119 + hatch, 109 + hatch, 98 + hatch] as const;
			}
			case MaterialId.LesionHigh: {
				const hatch = (row + column) % 7 < 2 || (row - column + 1024) % 9 < 2 ? 22 : 0;
				return [150 + hatch, 132 + hatch, 99 + hatch] as const;
			}
			case MaterialId.Metal: {
				const stripe = (row + column) % 8 < 3 ? 55 : 0;
				return [245 - stripe, 247 - stripe, 246 - stripe] as const;
			}
		}
	}

	function drawSource() {
		if (!sourceCanvas) return;
		const size = workingPhantom.size;
		if (sourceCanvas.width !== size || sourceCanvas.height !== size) {
			sourceCanvas.width = size;
			sourceCanvas.height = size;
		}
		const context = sourceCanvas.getContext('2d', { alpha: false });
		if (!context) return;
		const image = context.createImageData(size, size);
		for (let index = 0; index < workingPhantom.materials.length; index += 1) {
			const row = Math.floor(index / size);
			const column = index - row * size;
			const [red, green, blue] = materialPixel(
				workingPhantom.materials[index] as MaterialId,
				row,
				column
			);
			const offset = index * 4;
			image.data[offset] = red;
			image.data[offset + 1] = green;
			image.data[offset + 2] = blue;
			image.data[offset + 3] = 255;
		}
		context.putImageData(image, 0, 0);
	}

	function drawCursor(
		context: CanvasRenderingContext2D,
		point: Point,
		width: number,
		height: number,
		preview = false
	) {
		const pixelX = ((point.x + 1) / 2) * width;
		const pixelY = ((1 - point.y) / 2) * height;
		const styles = getComputedStyle(canvas);
		const accent = styles.getPropertyValue('--accent').trim() || '#67e8f9';
		const focus = styles.getPropertyValue('--focus').trim() || '#ffffff';
		context.save();
		context.strokeStyle = preview ? accent : focus;
		context.lineWidth = Math.max(1.5, width / 280);
		context.setLineDash(preview ? [Math.max(3, width / 110), Math.max(2, width / 150)] : []);

		if (preview && tool === 'circle') {
			context.beginPath();
			context.arc(pixelX, pixelY, (circleRadiusPercent / 100) * (width / 2), 0, Math.PI * 2);
			context.stroke();
		} else if (preview && tool === 'ellipse') {
			context.beginPath();
			context.ellipse(
				pixelX,
				pixelY,
				(ellipseWidthPercent / 100) * (width / 2),
				(ellipseHeightPercent / 100) * (height / 2),
				0,
				0,
				Math.PI * 2
			);
			context.stroke();
		} else if (preview && (tool === 'brush' || tool === 'eraser')) {
			context.beginPath();
			context.arc(pixelX, pixelY, (brushRadiusPercent / 100) * (width / 2), 0, Math.PI * 2);
			context.stroke();
		} else {
			const arm = Math.max(7, width / 42);
			context.beginPath();
			context.moveTo(pixelX - arm, pixelY);
			context.lineTo(pixelX + arm, pixelY);
			context.moveTo(pixelX, pixelY - arm);
			context.lineTo(pixelX, pixelY + arm);
			context.stroke();
		}
		context.restore();
	}

	function draw() {
		if (!mounted || !canvas || !sourceCanvas) return;
		const context = canvas.getContext('2d', { alpha: false });
		if (!context) return;
		drawSource();
		const width = canvas.width;
		const height = canvas.height;
		const styles = getComputedStyle(canvas);
		context.fillStyle = styles.getPropertyValue('--paper-soft').trim() || '#111514';
		context.fillRect(0, 0, width, height);
		context.imageSmoothingEnabled = false;
		context.drawImage(sourceCanvas, 0, 0, width, height);

		context.save();
		context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
		context.lineWidth = Math.max(1, width / 360);
		context.beginPath();
		context.arc(
			width / 2,
			height / 2,
			Math.min(width, height) / 2 - context.lineWidth,
			0,
			Math.PI * 2
		);
		context.stroke();
		context.restore();

		if (selection) drawCursor(context, selection, width, height);
		const previewPoint = hoverPoint ?? (canvasFocused ? keyboardPoint : null);
		if (previewPoint && tool !== 'inspect') drawCursor(context, previewPoint, width, height, true);
	}

	function resize() {
		if (!canvas) return;
		const rectangle = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, rectangle.width < 480 ? 1.5 : 2);
		const nextWidth = Math.max(1, Math.round(rectangle.width * dpr));
		const nextHeight = Math.max(1, Math.round(rectangle.height * dpr));
		if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
			canvas.width = nextWidth;
			canvas.height = nextHeight;
		}
		draw();
	}

	function pointFromClient(clientX: number, clientY: number): Point {
		const rectangle = canvas.getBoundingClientRect();
		return {
			x: clamp(((clientX - rectangle.left) / Math.max(1, rectangle.width)) * 2 - 1, -1, 1),
			y: clamp(1 - ((clientY - rectangle.top) / Math.max(1, rectangle.height)) * 2, -1, 1)
		};
	}

	function selectionAt(point: Point): PhantomSelection {
		const size = workingPhantom.size;
		const column = clamp(Math.floor(((point.x + 1) / 2) * size), 0, size - 1);
		const row = clamp(Math.floor(((1 - point.y) / 2) * size), 0, size - 1);
		const index = row * size + column;
		return {
			x: ((column + 0.5) * 2) / size - 1,
			y: 1 - ((row + 0.5) * 2) / size,
			row,
			column,
			material: workingPhantom.materials[index] as MaterialId,
			density: workingPhantom.density[index]
		};
	}

	function selectPoint(point: Point, announce = true) {
		selection = selectionAt(point);
		keyboardPoint = { x: selection.x, y: selection.y };
		if (announce) onselectionchange?.({ ...selection });
		scheduleDraw();
	}

	function clearSelection() {
		selection = null;
		onselectionchange?.(null);
		scheduleDraw();
	}

	function applyTool(
		from: Point,
		to: Point,
		firstPoint: boolean,
		toolToApply = tool,
		materialToApply = activeMaterial
	) {
		switch (toolToApply) {
			case 'inspect':
				return false;
			case 'circle':
				if (!firstPoint) return false;
				paintCircle(workingPhantom, {
					centerX: to.x,
					centerY: to.y,
					radius: circleRadiusPercent / 100,
					material: materialToApply
				});
				break;
			case 'ellipse':
				if (!firstPoint) return false;
				paintEllipse(workingPhantom, {
					centerX: to.x,
					centerY: to.y,
					radiusX: ellipseWidthPercent / 100,
					radiusY: ellipseHeightPercent / 100,
					material: materialToApply
				});
				break;
			case 'brush':
			case 'eraser':
				paintBrushSegment(workingPhantom, {
					fromX: from.x,
					fromY: from.y,
					toX: to.x,
					toY: to.y,
					radius: brushRadiusPercent / 100,
					material: materialToApply
				});
				break;
		}
		gestureChanged = true;
		selectPoint(to, false);
		scheduleDraw();
		return true;
	}

	function recordSnapshot() {
		let next = history.slice(0, historyIndex + 1);
		next.push(clonePhantom(workingPhantom));
		if (next.length > HISTORY_LIMIT) next = next.slice(next.length - HISTORY_LIMIT);
		history = next;
		historyIndex = next.length - 1;
	}

	function resetHistory(next: Phantom) {
		history = [clonePhantom(next)];
		historyIndex = 0;
	}

	function emitPhantomCommit() {
		const emitted = clonePhantom(workingPhantom);
		lastEmittedSnapshot = clonePhantom(emitted);
		onphantomcommit(emitted);
	}

	function emitPresetChange(nextPreset: PhantomPresetId) {
		const emitted = clonePhantom(workingPhantom);
		lastEmittedSnapshot = clonePhantom(emitted);
		onpresetchange(nextPreset, emitted);
	}

	function handlePointerDown(event: PointerEvent) {
		if (disabled || activePointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		canvasHost.focus({ preventScroll: true });
		const point = pointFromClient(event.clientX, event.clientY);
		hoverPoint = point;
		selectPoint(point);
		if (tool === 'inspect') {
			if (event.pointerType !== 'touch') event.preventDefault();
			return;
		}

		activePointerId = event.pointerId;
		activePointerTool = tool;
		activePointerMaterial = activeMaterial;
		gestureChanged = false;
		previousPointerPoint = point;
		pointerDownClientPoint = { x: event.clientX, y: event.clientY };
		tapMovementExceeded = false;

		if (activePointerTool === 'brush' || activePointerTool === 'eraser') {
			event.preventDefault();
			gestureBefore = clonePhantom(workingPhantom);
			canvas.setPointerCapture(event.pointerId);
			applyTool(point, point, true, activePointerTool, activePointerMaterial);
		} else if (event.pointerType !== 'touch') {
			event.preventDefault();
			canvas.setPointerCapture(event.pointerId);
		}
	}

	function handlePointerMove(event: PointerEvent) {
		const point = pointFromClient(event.clientX, event.clientY);
		hoverPoint = point;
		if (activePointerId !== event.pointerId || disabled) {
			scheduleDraw();
			return;
		}
		if (activePointerTool === 'brush' || activePointerTool === 'eraser') {
			event.preventDefault();
			applyTool(
				previousPointerPoint ?? point,
				point,
				false,
				activePointerTool,
				activePointerMaterial ?? activeMaterial
			);
			previousPointerPoint = point;
		} else if (pointerDownClientPoint) {
			const deltaX = event.clientX - pointerDownClientPoint.x;
			const deltaY = event.clientY - pointerDownClientPoint.y;
			if (Math.hypot(deltaX, deltaY) > TAP_MOVE_THRESHOLD_PX) tapMovementExceeded = true;
			if (event.pointerType !== 'touch') event.preventDefault();
		}
	}

	function finishPointer(event: PointerEvent) {
		if (activePointerId !== event.pointerId) return;
		const point = pointFromClient(event.clientX, event.clientY);
		if (activePointerTool === 'brush' || activePointerTool === 'eraser') {
			event.preventDefault();
		} else {
			if (pointerDownClientPoint) {
				const deltaX = event.clientX - pointerDownClientPoint.x;
				const deltaY = event.clientY - pointerDownClientPoint.y;
				if (Math.hypot(deltaX, deltaY) > TAP_MOVE_THRESHOLD_PX) tapMovementExceeded = true;
			}
			if (event.pointerType !== 'touch') event.preventDefault();
			if (!tapMovementExceeded) {
				gestureBefore = clonePhantom(workingPhantom);
				applyTool(
					point,
					point,
					true,
					activePointerTool ?? tool,
					activePointerMaterial ?? activeMaterial
				);
			}
		}
		const changed = gestureChanged;
		activePointerId = null;
		activePointerTool = null;
		activePointerMaterial = null;
		gestureBefore = null;
		previousPointerPoint = null;
		pointerDownClientPoint = null;
		tapMovementExceeded = false;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		if (changed) {
			recordSnapshot();
			emitPhantomCommit();
		}
	}

	function cancelPointer(event: PointerEvent) {
		if (activePointerId !== event.pointerId) return;
		if (
			activePointerTool === 'brush' ||
			activePointerTool === 'eraser' ||
			event.pointerType !== 'touch'
		) {
			event.preventDefault();
		}
		activePointerId = null;
		activePointerTool = null;
		activePointerMaterial = null;
		previousPointerPoint = null;
		pointerDownClientPoint = null;
		tapMovementExceeded = false;
		gestureChanged = false;
		if (gestureBefore) workingPhantom = clonePhantom(gestureBefore);
		gestureBefore = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		if (selection) selectPoint(selection, false);
		scheduleDraw();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (disabled) return;
		const step = (2 / workingPhantom.size) * (event.shiftKey ? 10 : 1);
		let next = keyboardPoint;
		switch (event.key) {
			case 'ArrowLeft':
				next = { ...next, x: clamp(next.x - step, -1, 1) };
				break;
			case 'ArrowRight':
				next = { ...next, x: clamp(next.x + step, -1, 1) };
				break;
			case 'ArrowUp':
				next = { ...next, y: clamp(next.y + step, -1, 1) };
				break;
			case 'ArrowDown':
				next = { ...next, y: clamp(next.y - step, -1, 1) };
				break;
			case 'Home':
				next = { x: 0, y: 0 };
				break;
			case ' ':
			case 'Enter':
				event.preventDefault();
				selectPoint(next);
				if (tool === 'inspect') return;
				gestureBefore = clonePhantom(workingPhantom);
				gestureChanged = false;
				applyTool(next, next, true);
				gestureBefore = null;
				if (gestureChanged) {
					recordSnapshot();
					emitPhantomCommit();
				}
				return;
			default:
				return;
		}
		event.preventDefault();
		keyboardPoint = next;
		selectPoint(next);
	}

	function chooseTool(next: EditorTool) {
		tool = next;
		if (next === 'eraser') selectedMaterial = MaterialId.Air;
		scheduleDraw();
	}

	function chooseMaterial(next: MaterialId) {
		selectedMaterial = next;
		if (tool === 'eraser') tool = 'brush';
		scheduleDraw();
	}

	function changePreset(event: Event) {
		const nextPreset = (event.currentTarget as HTMLSelectElement).value as PhantomPresetId;
		const next = createPresetPhantom(nextPreset, workingPhantom.size);
		next.revision = workingPhantom.revision + 1;
		workingPhantom = next;
		resetHistory(next);
		clearSelection();
		emitPresetChange(nextPreset);
		scheduleDraw();
	}

	function clearPhantom() {
		const next = createBlankPhantom(workingPhantom.size);
		next.revision = workingPhantom.revision + 1;
		workingPhantom = next;
		recordSnapshot();
		clearSelection();
		emitPhantomCommit();
		scheduleDraw();
	}

	function undo() {
		if (!canUndo || disabled) return;
		historyIndex -= 1;
		workingPhantom = clonePhantom(history[historyIndex]);
		clearSelection();
		emitPhantomCommit();
		scheduleDraw();
	}

	function redo() {
		if (!canRedo || disabled) return;
		historyIndex += 1;
		workingPhantom = clonePhantom(history[historyIndex]);
		clearSelection();
		emitPhantomCommit();
		scheduleDraw();
	}

	function numberValue(event: Event) {
		return Number((event.currentTarget as HTMLInputElement).value);
	}

	onMount(() => {
		sourceCanvas = document.createElement('canvas');
		mounted = true;
		resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(canvas);
		const redrawForTheme = () => scheduleDraw();
		window.addEventListener('site-theme-change', redrawForTheme);
		themeObserver = new MutationObserver(redrawForTheme);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme']
		});
		resize();

		return () => {
			mounted = false;
			resizeObserver?.disconnect();
			themeObserver?.disconnect();
			window.removeEventListener('site-theme-change', redrawForTheme);
			if (drawFrame) cancelAnimationFrame(drawFrame);
			drawFrame = 0;
			sourceCanvas = null;
		};
	});

	$effect(() => {
		const incoming = phantom;
		const phantomInputs = [
			incoming.size,
			incoming.revision,
			incoming.materials,
			incoming.density,
			preset
		];
		void phantomInputs;
		if (activePointerId !== null) return;
		if (lastEmittedSnapshot && phantomsEqual(incoming, lastEmittedSnapshot)) {
			lastEmittedSnapshot = null;
			return;
		}
		if (phantomsEqual(incoming, workingPhantom)) return;
		workingPhantom = clonePhantom(incoming);
		resetHistory(incoming);
		selection = null;
		scheduleDraw();
	});

	$effect(() => {
		const editorInputs = [
			circleRadiusPercent,
			brushRadiusPercent,
			ellipseWidthPercent,
			ellipseHeightPercent,
			tool,
			selectedMaterial
		];
		void editorInputs;
		if (mounted) scheduleDraw();
	});
</script>

<section class="phantom-editor" aria-labelledby={`${uid}-title`}>
	<header class="panel-header">
		<div>
			<p>Synthetic attenuation map</p>
			<h3 id={`${uid}-title`}>Phantom editor</h3>
		</div>
		<span>{workingPhantom.size} × {workingPhantom.size}</span>
	</header>

	<div class="preset-history">
		<label for={`${uid}-preset`}>
			<span>Phantom preset</span>
			<select id={`${uid}-preset`} value={preset} {disabled} onchange={changePreset}>
				{#each presetOptions as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		</label>
		<div class="history-actions" aria-label="Edit history">
			<button type="button" disabled={disabled || !canUndo} onclick={undo} title="Undo last edit">
				<span aria-hidden="true">↶</span> Undo
			</button>
			<button type="button" disabled={disabled || !canRedo} onclick={redo} title="Redo edit">
				<span aria-hidden="true">↷</span> Redo
			</button>
			<button type="button" {disabled} onclick={clearPhantom} title="Clear to air">
				<span aria-hidden="true">□</span> Clear
			</button>
		</div>
	</div>

	<div class="tool-strip" role="toolbar" aria-label="Phantom drawing tools">
		{#each toolOptions as option (option.id)}
			<button
				type="button"
				{disabled}
				aria-pressed={tool === option.id}
				title={option.help}
				onclick={() => chooseTool(option.id)}
			>
				<span aria-hidden="true">{option.symbol}</span>
				{option.label}
			</button>
		{/each}
	</div>

	<div class="editor-body">
		<div class="canvas-column">
			<button
				bind:this={canvasHost}
				type="button"
				class="canvas-frame"
				{disabled}
				aria-label="Editable synthetic CT phantom. Use the selected tool with a pointer, or use arrow keys to move the keyboard cursor and Space or Enter to apply it."
				aria-describedby={`${uid}-instructions ${uid}-selection`}
				aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home Space Enter"
				onkeydown={handleKeydown}
				onfocus={() => {
					canvasFocused = true;
					if (!selection) selectPoint(keyboardPoint);
					scheduleDraw();
				}}
				onblur={() => {
					canvasFocused = false;
					scheduleDraw();
				}}
			>
				<canvas
					bind:this={canvas}
					aria-hidden="true"
					data-tool={tool}
					onpointerdown={handlePointerDown}
					onpointermove={handlePointerMove}
					onpointerup={finishPointer}
					onpointercancel={cancelPointer}
					onlostpointercapture={cancelPointer}
					onpointerleave={() => {
						if (activePointerId === null) {
							hoverPoint = null;
							scheduleDraw();
						}
					}}
				></canvas>
			</button>
			<p id={`${uid}-instructions`} class="instructions">{toolInstruction}</p>
			<p id={`${uid}-selection`} class="selection-readout">{selectionText}</p>
		</div>

		<aside class="editor-controls" aria-label="Phantom material and shape settings">
			<fieldset>
				<legend>Material</legend>
				<div class="material-list">
					{#each materialOptions as option (option.id)}
						<button
							type="button"
							{disabled}
							aria-pressed={activeMaterial === option.id && tool !== 'eraser'}
							onclick={() => chooseMaterial(option.id)}
						>
							<span class="material-symbol" data-material={option.id} aria-hidden="true"
								>{option.symbol}</span
							>
							<span>
								<strong>{option.label}</strong>
								<small>{option.description}</small>
							</span>
						</button>
					{/each}
				</div>
			</fieldset>

			<div class="size-controls">
				<label for={`${uid}-circle-radius`}>
					<span>Circle radius <output>{circleRadiusPercent}%</output></span>
					<input
						id={`${uid}-circle-radius`}
						type="range"
						min="2"
						max="45"
						step="1"
						value={circleRadiusPercent}
						{disabled}
						oninput={(event) => (circleRadiusPercent = numberValue(event))}
					/>
				</label>
				<label for={`${uid}-brush-radius`}>
					<span>Brush size <output>{brushRadiusPercent}%</output></span>
					<input
						id={`${uid}-brush-radius`}
						type="range"
						min="1"
						max="24"
						step="1"
						value={brushRadiusPercent}
						{disabled}
						oninput={(event) => (brushRadiusPercent = numberValue(event))}
					/>
				</label>
				<label for={`${uid}-ellipse-width`}>
					<span>Ellipse width <output>{ellipseWidthPercent}%</output></span>
					<input
						id={`${uid}-ellipse-width`}
						type="range"
						min="4"
						max="90"
						step="1"
						value={ellipseWidthPercent}
						{disabled}
						oninput={(event) => (ellipseWidthPercent = numberValue(event))}
					/>
				</label>
				<label for={`${uid}-ellipse-height`}>
					<span>Ellipse height <output>{ellipseHeightPercent}%</output></span>
					<input
						id={`${uid}-ellipse-height`}
						type="range"
						min="4"
						max="90"
						step="1"
						value={ellipseHeightPercent}
						{disabled}
						oninput={(event) => (ellipseHeightPercent = numberValue(event))}
					/>
				</label>
			</div>
		</aside>
	</div>

	<details>
		<summary>What am I editing?</summary>
		<p>
			This is the hidden attenuation map. A real scanner never receives this picture directly; it
			receives line measurements from the detector. Here the map remains visible because the
			simulation knows the synthetic answer. Material names and patterns are illustrative, not
			clinical tissue values.
		</p>
	</details>
</section>

<style>
	.phantom-editor {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--rule);
		border-radius: 0.7rem;
		background: var(--paper-raised);
		color: var(--ink);
		contain: layout paint;
	}
	.panel-header {
		display: flex;
		min-height: 3.4rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.65rem 0.8rem;
	}
	.panel-header p,
	.panel-header h3,
	.instructions,
	.selection-readout,
	details p {
		margin: 0;
	}
	.panel-header p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.panel-header h3 {
		font-size: 0.92rem;
	}
	.panel-header > span {
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		color: var(--ink-muted);
	}
	.preset-history {
		display: grid;
		grid-template-columns: minmax(10rem, 1fr) auto;
		align-items: end;
		gap: 0.65rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.65rem 0.75rem;
	}
	.preset-history label,
	.size-controls label {
		display: grid;
		gap: 0.32rem;
		font-size: 0.8125rem;
		font-weight: 750;
	}
	.history-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	button,
	select,
	input {
		font: inherit;
	}
	button,
	select {
		min-height: 2.75rem;
		border: 1px solid var(--control-border);
		border-radius: 0.42rem;
		background: var(--paper-raised);
		color: var(--ink);
	}
	select {
		width: 100%;
		padding: 0.45rem 0.55rem;
		font-size: 0.8125rem;
	}
	button {
		padding: 0.45rem 0.58rem;
		font-size: 0.8125rem;
		font-weight: 750;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	button:disabled,
	select:disabled,
	input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	button[aria-pressed='true'] {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-foreground);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.tool-strip {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.35rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.55rem 0.65rem;
	}
	.tool-strip button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}
	.tool-strip button > span {
		font-size: 1rem;
		line-height: 1;
	}
	.editor-body {
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(11.5rem, 0.75fr);
	}
	.canvas-column {
		min-width: 0;
		border-right: 1px solid var(--rule);
	}
	.canvas-frame {
		display: block;
		width: 100%;
		min-height: 0;
		aspect-ratio: 1;
		border: 0;
		border-radius: 0;
		background: #070a0a;
		padding: 0;
		color: inherit;
		cursor: crosshair;
		text-align: initial;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: crosshair;
		outline: none;
	}
	canvas[data-tool='inspect'],
	canvas[data-tool='circle'],
	canvas[data-tool='ellipse'] {
		touch-action: pan-y;
	}
	canvas[data-tool='brush'],
	canvas[data-tool='eraser'] {
		touch-action: none;
	}
	.canvas-frame:focus-visible {
		box-shadow: inset 0 0 0 3px var(--focus);
		outline: none;
	}
	.instructions,
	.selection-readout {
		border-top: 1px solid var(--rule);
		padding: 0.58rem 0.7rem;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--ink-muted);
	}
	.selection-readout {
		min-height: 3.25rem;
		font-family: ui-monospace, monospace;
	}
	.editor-controls {
		min-width: 0;
	}
	fieldset {
		min-width: 0;
		margin: 0;
		border: 0;
		border-bottom: 1px solid var(--rule);
		padding: 0.65rem;
	}
	legend {
		padding: 0 0 0.4rem;
		font-size: 0.8125rem;
		font-weight: 800;
	}
	.material-list {
		display: grid;
		gap: 0.35rem;
	}
	.material-list button {
		display: grid;
		min-height: 3.35rem;
		grid-template-columns: 1.65rem minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
		text-align: left;
	}
	.material-list strong,
	.material-list small {
		display: block;
	}
	.material-list small {
		margin-top: 0.08rem;
		font-size: 0.75rem;
		font-weight: 450;
		line-height: 1.25;
		color: currentColor;
		opacity: 0.76;
	}
	.material-symbol {
		display: grid;
		width: 1.55rem;
		height: 1.55rem;
		place-items: center;
		border: 1px solid currentColor;
		border-radius: 0.28rem;
		background: #080a0a;
		color: #f5f7f7;
		font-size: 0.85rem;
	}
	.material-symbol[data-material='1'] {
		background: #697573;
	}
	.material-symbol[data-material='2'] {
		background:
			radial-gradient(circle, #555 1px, transparent 1.5px) 0 0 / 5px 5px,
			#d8dfdd;
		color: #202625;
	}
	.material-symbol[data-material='4'] {
		background: repeating-linear-gradient(135deg, transparent 0 4px, #5c5143 4px 6px), #a89370;
	}
	.material-symbol[data-material='5'] {
		background: repeating-linear-gradient(135deg, #f7f8f8 0 4px, #555 4px 6px);
		color: #111;
	}
	.size-controls {
		display: grid;
		gap: 0.65rem;
		padding: 0.7rem;
	}
	.size-controls label > span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	output {
		font-family: ui-monospace, monospace;
		font-weight: 500;
		color: var(--ink-muted);
	}
	input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--accent);
	}
	details {
		border-top: 1px solid var(--rule);
		padding: 0.55rem 0.75rem;
		font-size: 0.75rem;
	}
	summary {
		min-height: 2.2rem;
		cursor: pointer;
		font-size: 0.8125rem;
		font-weight: 800;
	}
	details p {
		padding: 0.3rem 0 0.35rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
	@media (max-width: 720px) {
		.preset-history {
			grid-template-columns: 1fr;
		}
		.editor-body {
			grid-template-columns: 1fr;
		}
		.canvas-column {
			border-right: 0;
			border-bottom: 1px solid var(--rule);
		}
		.material-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.material-list button:last-child {
			grid-column: span 2;
		}
		.size-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.tool-strip {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
		.tool-strip button {
			grid-column: span 2;
		}
		.tool-strip button:nth-last-child(-n + 2) {
			grid-column: span 3;
		}
	}
	@media (max-width: 430px) {
		.material-list,
		.size-controls {
			grid-template-columns: 1fr;
		}
		.material-list button:last-child {
			grid-column: auto;
		}
	}
	@media (forced-colors: active) {
		.phantom-editor,
		.panel-header,
		.preset-history,
		.tool-strip,
		.canvas-column,
		fieldset,
		details,
		button,
		select,
		.instructions,
		.selection-readout {
			border-color: CanvasText;
		}
		button[aria-pressed='true'] {
			background: Highlight;
			color: HighlightText;
		}
		.canvas-frame:focus-visible {
			outline: 3px solid Highlight;
			outline-offset: -3px;
			box-shadow: none;
		}
	}
</style>
