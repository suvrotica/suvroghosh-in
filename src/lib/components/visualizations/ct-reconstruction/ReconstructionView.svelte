<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		title: string;
		description: string;
		values?: Float32Array | null;
		size: number;
		mode?: 'attenuation' | 'difference';
		partial?: boolean;
		progress?: number;
		valueLabel?: string;
		autoWindow?: boolean;
		windowCenter?: number;
		windowWidth?: number;
		zoom?: number;
	};

	let {
		title,
		description,
		values = null,
		size,
		mode = 'attenuation',
		partial = false,
		progress = 0,
		valueLabel = 'No reconstruction yet',
		autoWindow = true,
		windowCenter = 0.5,
		windowWidth = 1,
		zoom = 1
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let sourceCanvas: HTMLCanvasElement | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let mounted = $state(false);

	function finiteRange(data: Float32Array) {
		if (!autoWindow && mode !== 'difference') {
			const width = Math.max(0.001, windowWidth);
			return [windowCenter - width / 2, windowCenter + width / 2] as const;
		}
		let minimum = Number.POSITIVE_INFINITY;
		let maximum = Number.NEGATIVE_INFINITY;
		for (let index = 0; index < data.length; index += 1) {
			const value = data[index];
			if (!Number.isFinite(value)) continue;
			if (value < minimum) minimum = value;
			if (value > maximum) maximum = value;
		}
		if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [0, 1] as const;
		if (mode === 'difference') {
			const extent = Math.max(Math.abs(minimum), Math.abs(maximum), 1e-8);
			return [-extent, extent] as const;
		}
		return [Math.min(0, minimum), Math.max(maximum, 1e-8)] as const;
	}

	function draw() {
		if (!mounted || !canvas) return;
		const context = canvas.getContext('2d', { alpha: false });
		if (!context) return;

		context.save();
		context.fillStyle = '#080a0a';
		context.fillRect(0, 0, canvas.width, canvas.height);

		if (!values || values.length !== size * size || !sourceCanvas) {
			context.strokeStyle = '#3f4a4a';
			context.lineWidth = Math.max(1, canvas.width / 320);
			const step = canvas.width / 8;
			for (let offset = step; offset < canvas.width; offset += step) {
				context.beginPath();
				context.moveTo(offset, 0);
				context.lineTo(offset, canvas.height);
				context.moveTo(0, offset);
				context.lineTo(canvas.width, offset);
				context.stroke();
			}
			context.fillStyle = '#b9c4c4';
			context.font = `${Math.max(12, canvas.width / 26)}px ui-monospace, monospace`;
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillText('Awaiting projection data', canvas.width / 2, canvas.height / 2);
			context.restore();
			return;
		}

		sourceCanvas.width = size;
		sourceCanvas.height = size;
		const sourceContext = sourceCanvas.getContext('2d', { alpha: false });
		if (!sourceContext) {
			context.restore();
			return;
		}

		const [minimum, maximum] = finiteRange(values);
		const range = Math.max(maximum - minimum, 1e-8);
		const image = sourceContext.createImageData(size, size);
		for (let index = 0; index < values.length; index += 1) {
			const normalized = Math.max(0, Math.min(1, (values[index] - minimum) / range));
			const byte = Math.round(normalized * 255);
			const offset = index * 4;
			if (mode === 'difference') {
				const signed = values[index] / Math.max(Math.abs(minimum), Math.abs(maximum), 1e-8);
				const magnitude = Math.min(1, Math.abs(signed));
				image.data[offset] = signed >= 0 ? Math.round(255 * magnitude) : Math.round(36 * magnitude);
				image.data[offset + 1] = Math.round(255 * (1 - magnitude));
				image.data[offset + 2] =
					signed < 0 ? Math.round(255 * magnitude) : Math.round(36 * magnitude);
			} else {
				image.data[offset] = byte;
				image.data[offset + 1] = byte;
				image.data[offset + 2] = byte;
			}
			image.data[offset + 3] = 255;
		}
		sourceContext.putImageData(image, 0, 0);
		context.imageSmoothingEnabled = true;
		const cropSize = size / Math.max(1, zoom);
		const cropOffset = (size - cropSize) / 2;
		context.drawImage(
			sourceCanvas,
			cropOffset,
			cropOffset,
			cropSize,
			cropSize,
			0,
			0,
			canvas.width,
			canvas.height
		);

		context.strokeStyle = '#d6e2e2';
		context.globalAlpha = 0.42;
		context.lineWidth = Math.max(1, canvas.width / 360);
		context.beginPath();
		context.arc(canvas.width / 2, canvas.height / 2, canvas.width * 0.352, 0, Math.PI * 2);
		context.stroke();
		context.restore();
	}

	function resize() {
		if (!canvas) return;
		const rectangle = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, rectangle.width < 480 ? 1.5 : 2);
		const width = Math.max(1, Math.round(rectangle.width * dpr));
		const height = Math.max(1, Math.round(rectangle.height * dpr));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		draw();
	}

	onMount(() => {
		sourceCanvas = document.createElement('canvas');
		mounted = true;
		resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(canvas);
		window.addEventListener('site-theme-change', draw);
		resize();
		return () => {
			mounted = false;
			resizeObserver?.disconnect();
			window.removeEventListener('site-theme-change', draw);
			sourceCanvas = null;
		};
	});

	$effect(() => {
		const drawInputs = [values, size, mode, autoWindow, windowCenter, windowWidth, zoom];
		void drawInputs;
		if (mounted) requestAnimationFrame(draw);
	});
</script>

<section class="image-panel" aria-labelledby={`${title.toLowerCase().replace(/\W+/g, '-')}-title`}>
	<header>
		<div>
			<p class="eyebrow">{partial ? 'Partial reconstruction' : 'Image estimate'}</p>
			<h4 id={`${title.toLowerCase().replace(/\W+/g, '-')}-title`}>{title}</h4>
		</div>
		{#if partial}<span class="partial-label">{Math.round(progress * 100)}%</span>{/if}
	</header>
	<div
		class="canvas-frame"
		role="img"
		aria-label={`${title}. ${valueLabel} ${autoWindow ? 'Automatic intensity window.' : `Window centre ${windowCenter.toFixed(2)}, width ${windowWidth.toFixed(2)}.`} ${zoom > 1 ? `${zoom.toFixed(1)} times zoom.` : 'Fit to panel.'}`}
	>
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
		<div class="scale" aria-hidden="true">
			{#if mode === 'difference'}
				<span>negative</span><span>zero</span><span>positive</span>
			{:else}
				<span>low</span><span>attenuation</span><span>high</span>
			{/if}
		</div>
	</div>
	<p class="panel-description">{description}</p>
</section>

<style>
	.image-panel {
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
	h4,
	.eyebrow,
	.panel-description {
		margin: 0;
	}
	h4 {
		font-size: 0.92rem;
		line-height: 1.2;
		color: var(--ink);
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
	.partial-label {
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 0.2rem 0.45rem;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		color: var(--ink);
	}
	.canvas-frame {
		position: relative;
		aspect-ratio: 1;
		background: #080a0a;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		outline: none;
	}
	.scale {
		position: absolute;
		right: 0.45rem;
		bottom: 0.4rem;
		left: 0.45rem;
		display: flex;
		justify-content: space-between;
		border-radius: 0.2rem;
		background: rgb(0 0 0 / 68%);
		padding: 0.16rem 0.3rem;
		font-family: ui-monospace, monospace;
		font-size: 0.58rem;
		color: #f2f5f5;
		pointer-events: none;
	}
	.panel-description {
		min-height: 3.9rem;
		border-top: 1px solid var(--rule);
		padding: 0.65rem 0.8rem;
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
	@media (forced-colors: active) {
		.image-panel,
		header,
		.panel-description {
			border-color: CanvasText;
		}
	}
</style>
