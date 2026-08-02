<script lang="ts">
	import { onMount } from 'svelte';
	import type { PlotPoint } from './ObservatoryPanel.svelte';

	type Props = {
		points: PlotPoint[];
		revision: number;
		oncapture: (capture: () => HTMLCanvasElement | null) => void;
	};

	let { points, revision, oncapture }: Props = $props();
	let canvas: HTMLCanvasElement;
	let resizeObserver: ResizeObserver | null = null;
	let drawFrame = 0;

	const thresholds = [0.001, 0.01, 0.1, 1] as const;
	let summary = $derived.by(() => {
		revision.toString();
		const latest = points.at(-1);
		return latest
			? `Logarithmic separation history with ${points.length.toLocaleString('en')} bounded samples. Latest lower-bob separation ${formatDistance(latest.y)} at ${latest.x.toFixed(2)} simulated seconds.`
			: 'Run Shadow Futures to collect a logarithmic lower-bob separation history.';
	});

	$effect(() => {
		revision.toString();
		if (!canvas || typeof requestAnimationFrame === 'undefined') return;
		cancelAnimationFrame(drawFrame);
		drawFrame = requestAnimationFrame(draw);
	});

	onMount(() => {
		resizeObserver = new ResizeObserver(draw);
		resizeObserver.observe(canvas);
		oncapture(() => (canvas.width > 0 ? canvas : null));
		draw();
		return () => {
			cancelAnimationFrame(drawFrame);
			resizeObserver?.disconnect();
			oncapture(() => null);
		};
	});

	function draw() {
		if (!canvas || document.hidden) return;
		const width = Math.max(300, canvas.clientWidth);
		const height = Math.max(220, canvas.clientHeight);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const pixelWidth = Math.round(width * dpr);
		const pixelHeight = Math.round(height * dpr);
		if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
			canvas.width = pixelWidth;
			canvas.height = pixelHeight;
		}
		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.fillStyle = '#081015';
		context.fillRect(0, 0, width, height);

		const margin = { top: 18, right: 18, bottom: 38, left: 58 };
		const plotWidth = Math.max(1, width - margin.left - margin.right);
		const plotHeight = Math.max(1, height - margin.top - margin.bottom);
		const xMaximum = Math.max(1, points.at(-1)?.x ?? 1);
		const largestValue = points.reduce(
			(maximum, point) => (Number.isFinite(point.y) ? Math.max(maximum, point.y) : maximum),
			1
		);
		const logMinimum = -9;
		const logMaximum = Math.max(0, Math.ceil(Math.log10(Math.max(1, largestValue))));
		const mapX = (value: number) => margin.left + (value / xMaximum) * plotWidth;
		const mapY = (value: number) => {
			const logValue = Math.log10(Math.max(10 ** logMinimum, value));
			return (
				margin.top +
				(1 - (logValue - logMinimum) / Math.max(1, logMaximum - logMinimum)) * plotHeight
			);
		};

		context.strokeStyle = '#2a3d46';
		context.lineWidth = 1;
		for (let index = 0; index <= 4; index += 1) {
			const x = margin.left + (plotWidth * index) / 4;
			context.beginPath();
			context.moveTo(x, margin.top);
			context.lineTo(x, margin.top + plotHeight);
			context.stroke();
		}

		context.save();
		context.setLineDash([4, 5]);
		context.font = '11px ui-monospace, monospace';
		for (const threshold of thresholds) {
			const y = mapY(threshold);
			context.strokeStyle = '#806d52';
			context.beginPath();
			context.moveTo(margin.left, y);
			context.lineTo(margin.left + plotWidth, y);
			context.stroke();
			context.fillStyle = '#c9b38e';
			context.fillText(formatDistance(threshold), margin.left + 4, y - 4);
		}
		context.restore();

		context.strokeStyle = '#92d8ca';
		context.lineWidth = 1.8;
		context.beginPath();
		let started = false;
		for (const point of points) {
			if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.y < 0) continue;
			const x = mapX(point.x);
			const y = mapY(point.y);
			if (!started) {
				context.moveTo(x, y);
				started = true;
			} else context.lineTo(x, y);
		}
		if (started) context.stroke();

		const latest = points.at(-1);
		if (latest && Number.isFinite(latest.x) && Number.isFinite(latest.y)) {
			const x = mapX(latest.x);
			const y = mapY(latest.y);
			context.save();
			context.translate(x, y);
			context.rotate(Math.PI / 4);
			context.fillStyle = '#f4eee4';
			context.fillRect(-4, -4, 8, 8);
			context.restore();
		}

		context.fillStyle = '#9eb0b6';
		context.font = '11px ui-monospace, monospace';
		context.textAlign = 'center';
		context.fillText('Simulated time (s)', margin.left + plotWidth / 2, height - 10);
		context.save();
		context.translate(13, margin.top + plotHeight / 2);
		context.rotate(-Math.PI / 2);
		context.fillText('Lower-bob separation (m, log)', 0, 0);
		context.restore();
		context.textAlign = 'left';
		context.fillStyle = '#78909a';
		context.fillText('0', margin.left, height - 24);
		context.textAlign = 'right';
		context.fillText(xMaximum.toFixed(1), margin.left + plotWidth, height - 24);
	}

	function formatDistance(value: number) {
		if (value < 0.001) return `${(value * 1_000_000).toPrecision(3)} µm`;
		if (value < 0.01) return `${(value * 1_000).toPrecision(3)} mm`;
		if (value < 1) return `${(value * 100).toPrecision(3)} cm`;
		return `${value.toPrecision(3)} m`;
	}
</script>

<figure class="separation-chart">
	<div class="chart-title">
		<strong>Log separation history</strong>
		<span>Thresholds: 1 mm · 1 cm · 10 cm · 1 m</span>
	</div>
	<canvas bind:this={canvas} aria-label={summary}></canvas>
	<figcaption>{summary}</figcaption>
</figure>

<style>
	.separation-chart {
		margin: 1rem 0 0;
		border: 1px solid #334a54;
		border-radius: 0.75rem;
		background: #081015;
		overflow: hidden;
	}
	.chart-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 0.9rem 0;
		color: #f4eee4;
		font-size: 0.78rem;
	}
	.chart-title span,
	figcaption {
		color: #9eb0b6;
	}
	canvas {
		display: block;
		width: 100%;
		height: 230px;
	}
	figcaption {
		margin: 0;
		padding: 0 0.9rem 0.85rem;
		font-size: 0.72rem;
		line-height: 1.45;
	}
	@media (max-width: 560px) {
		.chart-title {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
