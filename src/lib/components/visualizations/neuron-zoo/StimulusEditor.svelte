<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		waveform: Float64Array;
		durationMs: number;
		cursorMs: number;
		mode: 'draw' | 'inject';
		disabled?: boolean;
		onwaveformchange: (waveform: Float64Array) => void;
		onliveamplitude?: (amplitude: number | null) => void;
	};

	let {
		waveform,
		durationMs,
		cursorMs,
		mode,
		disabled = false,
		onwaveformchange,
		onliveamplitude
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let host: HTMLDivElement;
	let width = $state(720);
	let height = $state(188);
	let drawing = $state(false);
	let keyboardIndex = $state(0);
	let lastIndex = -1;
	let lastAmplitude = 0;
	let beforeStroke: Float64Array | null = null;
	let undoStack = $state<Float64Array[]>([]);
	let redoStack = $state<Float64Array[]>([]);
	let resizeObserver: ResizeObserver | null = null;
	let uid = $props.id();

	function clamp(value: number, minimum: number, maximum: number) {
		return Math.max(minimum, Math.min(maximum, value));
	}

	function copyWaveform() {
		return new Float64Array(waveform);
	}

	function emit(next: Float64Array) {
		onwaveformchange(next);
	}

	function remember(previous: Float64Array) {
		undoStack = [...undoStack.slice(-29), previous];
		redoStack = [];
	}

	function amplitudeFromY(y: number) {
		return clamp(1 - (2 * y) / Math.max(1, height), -1, 1);
	}

	function indexFromX(x: number) {
		return Math.round(clamp(x / Math.max(1, width), 0, 1) * Math.max(0, waveform.length - 1));
	}

	function paintSegment(index: number, amplitude: number) {
		const next = copyWaveform();
		if (lastIndex < 0 || lastIndex === index) {
			next[index] = amplitude;
		} else {
			const start = Math.min(lastIndex, index);
			const end = Math.max(lastIndex, index);
			for (let sample = start; sample <= end; sample += 1) {
				const fraction = (sample - lastIndex) / (index - lastIndex);
				next[sample] = clamp(lastAmplitude + (amplitude - lastAmplitude) * fraction, -1, 1);
			}
		}
		lastIndex = index;
		lastAmplitude = amplitude;
		keyboardIndex = index;
		emit(next);
	}

	function pointerCoordinates(event: PointerEvent) {
		const bounds = canvas.getBoundingClientRect();
		return {
			x: clamp(event.clientX - bounds.left, 0, bounds.width) * (width / Math.max(1, bounds.width)),
			y: clamp(event.clientY - bounds.top, 0, bounds.height) * (height / Math.max(1, bounds.height))
		};
	}

	function handlePointerDown(event: PointerEvent) {
		if (disabled) return;
		drawing = true;
		canvas.setPointerCapture(event.pointerId);
		const point = pointerCoordinates(event);
		const amplitude = amplitudeFromY(point.y);
		if (mode === 'inject') {
			onliveamplitude?.(amplitude);
		} else {
			beforeStroke = copyWaveform();
			lastIndex = -1;
			paintSegment(indexFromX(point.x), amplitude);
		}
		event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent) {
		if (!drawing || disabled) return;
		const point = pointerCoordinates(event);
		const amplitude = amplitudeFromY(point.y);
		if (mode === 'inject') onliveamplitude?.(amplitude);
		else paintSegment(indexFromX(point.x), amplitude);
		event.preventDefault();
	}

	function finishPointer(event: PointerEvent) {
		if (!drawing) return;
		drawing = false;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		if (mode === 'inject') {
			onliveamplitude?.(null);
		} else if (beforeStroke) {
			remember(beforeStroke);
		}
		beforeStroke = null;
		lastIndex = -1;
	}

	function undo() {
		const previous = undoStack.at(-1);
		if (!previous) return;
		redoStack = [...redoStack.slice(-29), copyWaveform()];
		undoStack = undoStack.slice(0, -1);
		emit(new Float64Array(previous));
	}

	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		undoStack = [...undoStack.slice(-29), copyWaveform()];
		redoStack = redoStack.slice(0, -1);
		emit(new Float64Array(next));
	}

	function transform(kind: 'clear' | 'invert' | 'smooth') {
		const previous = copyWaveform();
		const next = copyWaveform();
		if (kind === 'clear') {
			next.fill(0);
		} else if (kind === 'invert') {
			for (let index = 0; index < next.length; index += 1) next[index] = -next[index];
		} else {
			for (let index = 1; index < next.length - 1; index += 1) {
				next[index] = (previous[index - 1] + 2 * previous[index] + previous[index + 1]) / 4;
			}
		}
		remember(previous);
		emit(next);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (disabled || mode !== 'draw' || waveform.length === 0) return;
		const coarse = event.shiftKey ? Math.max(1, Math.round(waveform.length / 100)) : 1;
		let nextIndex = keyboardIndex;
		let nextAmplitude = waveform[keyboardIndex] ?? 0;
		let amplitudeChanged = false;

		switch (event.key) {
			case 'ArrowLeft':
				nextIndex = clamp(keyboardIndex - coarse, 0, waveform.length - 1);
				break;
			case 'ArrowRight':
				nextIndex = clamp(keyboardIndex + coarse, 0, waveform.length - 1);
				break;
			case 'ArrowUp':
				nextAmplitude = clamp(nextAmplitude + (event.shiftKey ? 0.1 : 0.02), -1, 1);
				amplitudeChanged = true;
				break;
			case 'ArrowDown':
				nextAmplitude = clamp(nextAmplitude - (event.shiftKey ? 0.1 : 0.02), -1, 1);
				amplitudeChanged = true;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = waveform.length - 1;
				break;
			case '0':
				nextAmplitude = 0;
				amplitudeChanged = true;
				break;
			default:
				return;
		}

		event.preventDefault();
		if (nextIndex !== keyboardIndex) keyboardIndex = nextIndex;
		if (amplitudeChanged && nextAmplitude !== waveform[keyboardIndex]) {
			const previous = copyWaveform();
			const next = copyWaveform();
			next[keyboardIndex] = nextAmplitude;
			remember(previous);
			emit(next);
		}
	}

	function draw() {
		if (!canvas) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const pixelWidth = Math.max(1, Math.round(width * dpr));
		const pixelHeight = Math.max(1, Math.round(height * dpr));
		if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
			canvas.width = pixelWidth;
			canvas.height = pixelHeight;
		}
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, width, height);
		context.fillStyle = '#070a0f';
		context.fillRect(0, 0, width, height);

		context.strokeStyle = '#252b35';
		context.lineWidth = 1;
		for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
			const x = fraction * width;
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x, height);
			context.stroke();
		}
		for (const amplitude of [-1, -0.5, 0, 0.5, 1]) {
			const y = ((1 - amplitude) / 2) * height;
			context.beginPath();
			context.moveTo(0, y);
			context.lineTo(width, y);
			context.stroke();
		}

		context.strokeStyle = '#94a3b8';
		context.setLineDash([5, 5]);
		context.beginPath();
		context.moveTo(0, height / 2);
		context.lineTo(width, height / 2);
		context.stroke();
		context.setLineDash([]);

		if (waveform.length > 0) {
			context.strokeStyle = '#f4d58d';
			context.lineWidth = 2;
			context.beginPath();
			for (let pixel = 0; pixel < width; pixel += 1) {
				const index = Math.round((pixel / Math.max(1, width - 1)) * (waveform.length - 1));
				const y = ((1 - clamp(waveform[index], -1, 1)) / 2) * height;
				if (pixel === 0) context.moveTo(pixel, y);
				else context.lineTo(pixel, y);
			}
			context.stroke();
		}

		const cursorX = clamp(cursorMs / Math.max(durationMs, Number.EPSILON), 0, 1) * width;
		context.strokeStyle = '#ffffff';
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(cursorX, 0);
		context.lineTo(cursorX, height);
		context.stroke();

		if (mode === 'draw') {
			const keyX = (keyboardIndex / Math.max(1, waveform.length - 1)) * width;
			const keyY = ((1 - (waveform[keyboardIndex] ?? 0)) / 2) * height;
			context.fillStyle = '#ffffff';
			context.beginPath();
			context.arc(keyX, keyY, 3.5, 0, Math.PI * 2);
			context.fill();
		}
	}

	onMount(() => {
		resizeObserver = new ResizeObserver(([entry]) => {
			width = Math.max(280, Math.round(entry.contentRect.width));
			height = Math.max(144, Math.min(220, Math.round(width * 0.26)));
			draw();
		});
		resizeObserver.observe(host);
		draw();
		return () => {
			resizeObserver?.disconnect();
			onliveamplitude?.(null);
		};
	});

	$effect(() => {
		void waveform;
		void cursorMs;
		void keyboardIndex;
		void mode;
		if (typeof window !== 'undefined') requestAnimationFrame(draw);
	});
</script>

<section class="editor" aria-labelledby="{uid}-stimulus-heading">
	<div class="editor-heading">
		<div>
			<p class="eyebrow">Canonical command</p>
			<h3 id="{uid}-stimulus-heading">Shared normalized stimulus, s(t)</h3>
		</div>
		<p class="range">+1 <span aria-hidden="true">↕</span> −1 · {durationMs.toLocaleString()} ms</p>
	</div>

	<div class="tools" aria-label="Stimulus editing tools">
		<button type="button" onclick={undo} disabled={disabled || undoStack.length === 0}>Undo</button>
		<button type="button" onclick={redo} disabled={disabled || redoStack.length === 0}>Redo</button>
		<button type="button" onclick={() => transform('clear')} {disabled}>Clear</button>
		<button type="button" onclick={() => transform('invert')} {disabled}>Invert</button>
		<button type="button" onclick={() => transform('smooth')} {disabled}>Smooth once</button>
	</div>

	<div class="canvas-host" bind:this={host}>
		<canvas
			bind:this={canvas}
			class:drawing
			tabindex={disabled ? undefined : 0}
			aria-label={mode === 'draw'
				? 'Editable shared stimulus waveform. Left and right arrows move through time. Up and down arrows change amplitude. Hold Shift for larger steps.'
				: 'Live injection surface. Hold a pointer and move vertically to inject positive or negative command at the current simulation time.'}
			aria-describedby="{uid}-editor-help"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={finishPointer}
			onpointercancel={finishPointer}
			onlostpointercapture={finishPointer}
			onkeydown={handleKeydown}
		></canvas>
		<span class="amplitude top" aria-hidden="true">+1</span>
		<span class="amplitude middle" aria-hidden="true">0</span>
		<span class="amplitude bottom" aria-hidden="true">−1</span>
	</div>

	<p id="{uid}-editor-help" class="help">
		{#if mode === 'draw'}
			Drag to paint. Missed samples are filled by deterministic linear interpolation. Keyboard:
			arrows edit the selected sample; Shift makes a larger move.
		{:else}
			Hold the pointer to inject at the white time cursor. Vertical position sets amplitude; the
			recorded samples remain replayable.
		{/if}
	</p>
</section>

<style>
	.editor {
		min-width: 0;
	}
	.editor-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.eyebrow,
	.range,
	.help {
		margin: 0;
		color: #9aa3b2;
		font-size: 0.75rem;
	}
	.eyebrow {
		margin-bottom: 0.2rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	h3 {
		margin: 0;
		color: #fff;
		font-size: clamp(1rem, 2vw, 1.25rem);
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid #303744;
		border-radius: 0.45rem;
		background: #121720;
		padding: 0.5rem 0.7rem;
		color: #dce2ea;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: #9aa3b2;
		background: #1a202b;
	}
	button:focus-visible,
	canvas:focus-visible {
		outline: 3px solid #f4d58d;
		outline-offset: 3px;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}
	.canvas-host {
		position: relative;
		min-height: 9rem;
		overflow: hidden;
		border: 1px solid #303744;
		border-radius: 0.65rem;
		background: #070a0f;
	}
	canvas {
		display: block;
		width: 100%;
		height: auto;
		min-height: 9rem;
		cursor: crosshair;
		touch-action: pan-y;
	}
	canvas.drawing {
		touch-action: none;
	}
	.amplitude {
		position: absolute;
		left: 0.35rem;
		color: #aab3c1;
		font:
			0.65rem/1 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
		pointer-events: none;
	}
	.amplitude.top {
		top: 0.35rem;
	}
	.amplitude.middle {
		top: 50%;
		transform: translateY(-50%);
	}
	.amplitude.bottom {
		bottom: 0.35rem;
	}
	.help {
		margin-top: 0.55rem;
		line-height: 1.5;
	}
	@media (max-width: 40rem) {
		.editor-heading {
			align-items: start;
			flex-direction: column;
			gap: 0.35rem;
		}
		.tools {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		button {
			padding-inline: 0.35rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>
