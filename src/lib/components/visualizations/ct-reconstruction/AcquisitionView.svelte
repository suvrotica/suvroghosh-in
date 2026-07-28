<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		materials: Uint8Array;
		gridSize: number;
		angleRad?: number;
		projection?: Float32Array | null;
		detectorCount: number;
		selectedDetector?: number;
		acquired?: boolean;
	};

	let {
		materials,
		gridSize,
		angleRad = 0,
		projection = null,
		detectorCount,
		selectedDetector = Math.floor(detectorCount / 2),
		acquired = false
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let phantomCanvas: HTMLCanvasElement | null = null;
	let observer: ResizeObserver | null = null;
	let mounted = $state(false);

	const materialGray = [4, 105, 196, 118, 142, 252];

	function preparePhantom() {
		if (!phantomCanvas) return;
		phantomCanvas.width = gridSize;
		phantomCanvas.height = gridSize;
		const context = phantomCanvas.getContext('2d', { alpha: false });
		if (!context) return;
		const image = context.createImageData(gridSize, gridSize);
		for (let index = 0; index < materials.length; index += 1) {
			const value = materialGray[materials[index]] ?? 0;
			const offset = index * 4;
			image.data[offset] = value;
			image.data[offset + 1] = value;
			image.data[offset + 2] = value;
			image.data[offset + 3] = 255;
		}
		context.putImageData(image, 0, 0);
	}

	function drawProjection(context: CanvasRenderingContext2D, width: number, height: number) {
		const plotTop = height * 0.77;
		const plotBottom = height * 0.95;
		context.fillStyle = '#101616';
		context.fillRect(width * 0.08, plotTop, width * 0.84, plotBottom - plotTop);
		context.strokeStyle = '#617070';
		context.lineWidth = Math.max(1, width / 480);
		context.strokeRect(width * 0.08, plotTop, width * 0.84, plotBottom - plotTop);
		if (!projection?.length) return;
		let maximum = 0;
		for (const value of projection) if (Number.isFinite(value) && value > maximum) maximum = value;
		maximum = Math.max(maximum, 1e-6);
		context.strokeStyle = '#67e8f9';
		context.lineWidth = Math.max(1.5, width / 260);
		context.beginPath();
		for (let index = 0; index < projection.length; index += 1) {
			const x = width * 0.08 + (index / Math.max(1, projection.length - 1)) * width * 0.84;
			const y = plotBottom - (projection[index] / maximum) * (plotBottom - plotTop) * 0.86;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.stroke();
		context.fillStyle = '#c7d2d2';
		context.font = `${Math.max(9, width / 48)}px ui-monospace, monospace`;
		context.fillText('current detector profile', width * 0.1, plotTop + width * 0.035);
	}

	function draw() {
		if (!mounted || !canvas || !phantomCanvas) return;
		preparePhantom();
		const context = canvas.getContext('2d', { alpha: false });
		if (!context) return;
		const width = canvas.width;
		const height = canvas.height;
		context.fillStyle = '#080a0a';
		context.fillRect(0, 0, width, height);

		const centreX = width * 0.5;
		const centreY = height * 0.36;
		const radius = Math.min(width * 0.25, height * 0.27);
		context.save();
		context.beginPath();
		context.arc(centreX, centreY, radius, 0, Math.PI * 2);
		context.clip();
		context.imageSmoothingEnabled = true;
		context.drawImage(phantomCanvas, centreX - radius, centreY - radius, radius * 2, radius * 2);
		context.restore();
		context.strokeStyle = '#aab6b6';
		context.lineWidth = Math.max(1, width / 360);
		context.beginPath();
		context.arc(centreX, centreY, radius, 0, Math.PI * 2);
		context.stroke();

		context.save();
		context.translate(centreX, centreY);
		context.rotate(angleRad + Math.PI / 2);
		const detectorX = radius * 1.42;
		const sourceX = -radius * 1.42;
		context.strokeStyle = '#7f8b8b';
		context.lineWidth = Math.max(1, width / 500);
		for (let ray = -4; ray <= 4; ray += 1) {
			const y = (ray / 4) * radius * 0.88;
			context.beginPath();
			context.moveTo(sourceX, y);
			context.lineTo(detectorX, y);
			context.stroke();
		}
		const selectedOffset =
			((selectedDetector / Math.max(1, detectorCount - 1)) * 2 - 1) * radius * 0.96;
		context.strokeStyle = '#67e8f9';
		context.lineWidth = Math.max(2, width / 230);
		context.beginPath();
		context.moveTo(sourceX, selectedOffset);
		context.lineTo(detectorX, selectedOffset);
		context.stroke();
		context.strokeStyle = '#f4f7f7';
		context.lineWidth = Math.max(2, width / 260);
		context.beginPath();
		context.moveTo(detectorX, -radius);
		context.lineTo(detectorX, radius);
		context.stroke();
		for (let bin = 0; bin < 13; bin += 1) {
			const y = -radius + (bin / 12) * radius * 2;
			context.beginPath();
			context.moveTo(detectorX - width * 0.008, y);
			context.lineTo(detectorX + width * 0.008, y);
			context.stroke();
		}
		context.restore();

		context.fillStyle = '#e8eeee';
		context.font = `${Math.max(11, width / 32)}px ui-monospace, monospace`;
		context.fillText(`θ ${((angleRad * 180) / Math.PI).toFixed(1)}°`, width * 0.07, height * 0.1);
		context.fillStyle = acquired ? '#67e8f9' : '#aab6b6';
		context.fillText(acquired ? 'row acquired' : 'ready', width * 0.72, height * 0.1);
		drawProjection(context, width, height);
	}

	function resize() {
		const rectangle = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, rectangle.width < 480 ? 1.5 : 2);
		canvas.width = Math.max(1, Math.round(rectangle.width * dpr));
		canvas.height = Math.max(1, Math.round(rectangle.height * dpr));
		draw();
	}

	onMount(() => {
		phantomCanvas = document.createElement('canvas');
		mounted = true;
		observer = new ResizeObserver(resize);
		observer.observe(canvas);
		window.addEventListener('site-theme-change', draw);
		resize();
		return () => {
			mounted = false;
			observer?.disconnect();
			window.removeEventListener('site-theme-change', draw);
			phantomCanvas = null;
		};
	});

	$effect(() => {
		const drawInputs = [
			materials,
			gridSize,
			angleRad,
			projection,
			detectorCount,
			selectedDetector,
			acquired
		];
		void drawInputs;
		if (mounted) requestAnimationFrame(draw);
	});
</script>

<section class="acquisition-panel" aria-labelledby="ct-acquisition-title">
	<header>
		<div>
			<p>Parallel-beam teaching model</p>
			<h3 id="ct-acquisition-title">Acquisition</h3>
		</div>
		<span>{((angleRad * 180) / Math.PI).toFixed(1)}°</span>
	</header>
	<div
		class="canvas-frame"
		role="img"
		aria-label={`Acquisition schematic at ${((angleRad * 180) / Math.PI).toFixed(1)} degrees. Representative parallel rays cross the synthetic phantom and reach a detector line. Detector bin ${selectedDetector + 1} is selected.`}
	>
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
	</div>
	<details>
		<summary>How to read this panel</summary>
		<p class="description">
			Every detector bin contains the total attenuation along one ray. It cannot say where along
			that ray the attenuation occurred.
		</p>
	</details>
</section>

<style>
	.acquisition-panel {
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
	.description {
		margin: 0;
	}
	h3 {
		font-size: 0.92rem;
	}
	header p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	header > span {
		font-family: ui-monospace, monospace;
		font-size: 0.8125rem;
		color: var(--ink-muted);
	}
	.canvas-frame {
		aspect-ratio: 4 / 3;
		background: #080a0a;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		outline: none;
	}
	.description {
		padding: 0.35rem 0 0.25rem;
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
	details {
		border-top: 1px solid var(--rule);
		padding: 0.6rem 0.8rem;
		font-size: 0.75rem;
	}
	summary {
		min-height: 2rem;
		cursor: pointer;
		font-weight: 700;
	}
	summary:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
</style>
