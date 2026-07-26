<script lang="ts">
	import { onMount } from 'svelte';

	type Selection = {
		angleIndex: number;
		detectorIndex: number;
		value: number | null;
	};

	type Props = {
		sinogram?: Float32Array | null;
		projectionCount: number;
		detectorCount: number;
		acquiredMask?: Uint8Array | null;
		completedRows?: number;
		selectedPoint?: { x: number; y: number } | null;
		onselect?: (selection: Selection) => void;
	};

	let {
		sinogram = null,
		projectionCount,
		detectorCount,
		acquiredMask = null,
		completedRows = 0,
		selectedPoint = null,
		onselect
	}: Props = $props();

	const uid = $props.id();
	let canvas: HTMLCanvasElement;
	let sourceCanvas: HTMLCanvasElement | null = null;
	let observer: ResizeObserver | null = null;
	let mounted = $state(false);
	let selection = $state<Selection | null>(null);

	function maximumValue() {
		if (!sinogram) return 1;
		let maximum = 0;
		for (let index = 0; index < sinogram.length; index += 1) {
			const value = sinogram[index];
			if (Number.isFinite(value) && value > maximum) maximum = value;
		}
		return Math.max(maximum, 1e-6);
	}

	function draw() {
		if (!mounted || !canvas || !sourceCanvas) return;
		const context = canvas.getContext('2d', { alpha: false });
		const sourceContext = sourceCanvas.getContext('2d', { alpha: false });
		if (!context || !sourceContext) return;

		sourceCanvas.width = Math.max(1, detectorCount);
		sourceCanvas.height = Math.max(1, projectionCount);
		const image = sourceContext.createImageData(sourceCanvas.width, sourceCanvas.height);
		const maximum = maximumValue();

		for (let row = 0; row < projectionCount; row += 1) {
			const omitted = acquiredMask?.[row] === 0;
			const pending = row >= completedRows && !omitted;
			for (let column = 0; column < detectorCount; column += 1) {
				const pixel = (row * detectorCount + column) * 4;
				const value = sinogram?.[row * detectorCount + column];
				if (omitted) {
					const hatch = (row + column) % 7 < 2 ? 90 : 37;
					image.data[pixel] = hatch;
					image.data[pixel + 1] = hatch;
					image.data[pixel + 2] = hatch;
				} else if (pending || !Number.isFinite(value)) {
					image.data[pixel] = 10;
					image.data[pixel + 1] = 13;
					image.data[pixel + 2] = 13;
				} else {
					const normalized = Math.max(0, Math.min(1, Number(value) / maximum));
					const byte = Math.round(255 * Math.sqrt(normalized));
					image.data[pixel] = byte;
					image.data[pixel + 1] = byte;
					image.data[pixel + 2] = byte;
				}
				image.data[pixel + 3] = 255;
			}
		}
		sourceContext.putImageData(image, 0, 0);
		context.fillStyle = '#080a0a';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.imageSmoothingEnabled = false;
		context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

		if (selectedPoint) {
			context.save();
			context.strokeStyle = '#f5cf68';
			context.lineWidth = Math.max(1.5, canvas.width / 240);
			context.setLineDash([Math.max(3, canvas.width / 70), Math.max(3, canvas.width / 90)]);
			context.beginPath();
			for (let row = 0; row < projectionCount; row += 1) {
				const theta = (row / projectionCount) * Math.PI;
				const s = selectedPoint.x * Math.cos(theta) + selectedPoint.y * Math.sin(theta);
				const column = ((s + Math.SQRT2) / (2 * Math.SQRT2)) * (detectorCount - 1);
				const x = (column / Math.max(1, detectorCount - 1)) * canvas.width;
				const y = (row / Math.max(1, projectionCount - 1)) * canvas.height;
				if (row === 0) context.moveTo(x, y);
				else context.lineTo(x, y);
			}
			context.stroke();
			context.restore();
		}

		if (selection) {
			const x = ((selection.detectorIndex + 0.5) / detectorCount) * canvas.width;
			const y = ((selection.angleIndex + 0.5) / projectionCount) * canvas.height;
			context.strokeStyle = '#67e8f9';
			context.lineWidth = Math.max(1.5, canvas.width / 250);
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x, canvas.height);
			context.moveTo(0, y);
			context.lineTo(canvas.width, y);
			context.stroke();
		}
	}

	function resize() {
		const rectangle = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, rectangle.width < 480 ? 1.5 : 2);
		canvas.width = Math.max(1, Math.round(rectangle.width * dpr));
		canvas.height = Math.max(1, Math.round(rectangle.height * dpr));
		draw();
	}

	function selectAt(clientX: number, clientY: number) {
		const rectangle = canvas.getBoundingClientRect();
		const detectorIndex = Math.max(
			0,
			Math.min(
				detectorCount - 1,
				Math.floor(((clientX - rectangle.left) / rectangle.width) * detectorCount)
			)
		);
		const angleIndex = Math.max(
			0,
			Math.min(
				projectionCount - 1,
				Math.floor(((clientY - rectangle.top) / rectangle.height) * projectionCount)
			)
		);
		const raw = sinogram?.[angleIndex * detectorCount + detectorIndex];
		selection = {
			angleIndex,
			detectorIndex,
			value: typeof raw === 'number' && Number.isFinite(raw) ? raw : null
		};
		onselect?.(selection);
		draw();
	}

	function handlePointer(event: PointerEvent) {
		selectAt(event.clientX, event.clientY);
	}

	function handleKeydown(event: KeyboardEvent) {
		const next = selection ?? {
			angleIndex: 0,
			detectorIndex: Math.floor(detectorCount / 2),
			value: null
		};
		const rowStep = event.shiftKey ? 10 : 1;
		switch (event.key) {
			case 'ArrowLeft':
				next.detectorIndex = Math.max(0, next.detectorIndex - rowStep);
				break;
			case 'ArrowRight':
				next.detectorIndex = Math.min(detectorCount - 1, next.detectorIndex + rowStep);
				break;
			case 'ArrowUp':
				next.angleIndex = Math.max(0, next.angleIndex - rowStep);
				break;
			case 'ArrowDown':
				next.angleIndex = Math.min(projectionCount - 1, next.angleIndex + rowStep);
				break;
			case 'Home':
				next.detectorIndex = 0;
				break;
			case 'End':
				next.detectorIndex = detectorCount - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		const raw = sinogram?.[next.angleIndex * detectorCount + next.detectorIndex];
		selection = {
			...next,
			value: typeof raw === 'number' && Number.isFinite(raw) ? raw : null
		};
		onselect?.(selection);
		draw();
	}

	onMount(() => {
		sourceCanvas = document.createElement('canvas');
		mounted = true;
		observer = new ResizeObserver(resize);
		observer.observe(canvas);
		window.addEventListener('site-theme-change', draw);
		resize();
		return () => {
			mounted = false;
			observer?.disconnect();
			window.removeEventListener('site-theme-change', draw);
			sourceCanvas = null;
		};
	});

	$effect(() => {
		const drawInputs = [
			sinogram,
			acquiredMask,
			completedRows,
			selectedPoint,
			projectionCount,
			detectorCount
		];
		void drawInputs;
		if (mounted) requestAnimationFrame(draw);
	});

	let selectionText = $derived(
		selection
			? `Angle ${((selection.angleIndex / projectionCount) * 180).toFixed(1)}°, detector ${selection.detectorIndex + 1} of ${detectorCount}, measured line integral ${selection.value === null ? 'not acquired' : selection.value.toFixed(3)}.`
			: 'Tap, click, or use the arrow keys to inspect an angle and detector bin.'
	);
</script>

<section class="sinogram-panel" aria-labelledby="ct-sinogram-title">
	<header>
		<div>
			<p class="eyebrow">Projection history</p>
			<h3 id="ct-sinogram-title">Sinogram</h3>
		</div>
		<span>{completedRows}/{projectionCount} rows</span>
	</header>
	<button
		type="button"
		class="plot"
		aria-label="Inspect the sinogram"
		aria-describedby={`${uid}-instructions ${uid}-readout`}
		onpointerdown={handlePointer}
		onpointermove={(event) => {
			if (event.pointerType === 'mouse') handlePointer(event);
		}}
		onkeydown={handleKeydown}
	>
		<span class="axis y-axis" aria-hidden="true">angle θ</span>
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
		<span class="axis x-axis" aria-hidden="true">detector position s →</span>
	</button>
	<p id={`${uid}-instructions`} class="sr-only">
		Use the arrow keys to move one detector bin or angle. Hold Shift to move ten steps. Home and End
		move to the first and last detector.
	</p>
	<p id={`${uid}-readout`} class="readout">{selectionText}</p>
	<details>
		<summary>What is this?</summary>
		<p>
			Each row is one projection angle. Missing rows are hatched. A selected phantom point follows
			the dashed sinusoidal path because its detector coordinate changes with angle.
		</p>
	</details>
</section>

<style>
	.sinogram-panel {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--rule);
		border-radius: 0.7rem;
		background: var(--paper-raised);
		color: var(--ink);
		contain: layout paint;
	}
	header {
		display: flex;
		min-height: 3.4rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--rule);
		padding: 0.65rem 0.8rem;
	}
	h3,
	header p,
	.readout,
	details p {
		margin: 0;
	}
	h3 {
		font-size: 0.92rem;
	}
	header > span {
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		color: var(--ink-muted);
	}
	.eyebrow {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.61rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.plot {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border: 0;
		padding: 0.55rem 0.55rem 1.5rem 1.65rem;
		background: #080a0a;
		color: inherit;
		font: inherit;
		text-align: inherit;
		cursor: crosshair;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: crosshair;
		outline: none;
		touch-action: pan-y;
	}
	.plot:focus-visible {
		box-shadow: 0 0 0 3px var(--focus);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
	.axis {
		position: absolute;
		z-index: 1;
		font-family: ui-monospace, monospace;
		font-size: 0.58rem;
		color: #dce3e3;
		pointer-events: none;
	}
	.x-axis {
		right: 0.55rem;
		bottom: 0.3rem;
	}
	.y-axis {
		top: 0.55rem;
		bottom: 1.5rem;
		left: 0.25rem;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}
	.readout {
		min-height: 3.45rem;
		border-top: 1px solid var(--rule);
		padding: 0.6rem 0.8rem;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		line-height: 1.45;
		color: var(--ink-muted);
	}
	details {
		border-top: 1px solid var(--rule);
		padding: 0.6rem 0.8rem;
		font-size: 0.72rem;
	}
	summary {
		min-height: 2rem;
		cursor: pointer;
		font-weight: 700;
	}
	details p {
		padding: 0.35rem 0 0.25rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
</style>
