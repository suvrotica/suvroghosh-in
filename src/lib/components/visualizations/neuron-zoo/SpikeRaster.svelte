<script lang="ts">
	import { onMount } from 'svelte';

	type RasterEvent = number | { timeMs: number; label?: string };
	type Marker = 'tick' | 'double' | 'triangle' | 'diamond' | 'circle';

	type RasterRow = {
		id?: string;
		label: string;
		events?: readonly RasterEvent[];
		timesMs?: readonly number[];
		color?: string;
		marker?: Marker;
	};

	type Props = {
		rows: readonly RasterRow[];
		durationMs: number;
		cursorMs?: number;
		stepMs?: number;
		summary?: string;
		oncursor?: (timeMs: number) => void;
	};

	let { rows, durationMs, cursorMs, stepMs, summary, oncursor }: Props = $props();

	const uid = $props.id();
	const pad = { top: 18, right: 14, bottom: 30, left: 126 };
	const palette = ['#73b7c8', '#d9a066', '#b9a5e2', '#8fbc8f', '#df8c95'];
	const markers: Marker[] = ['tick', 'double', 'triangle', 'diamond', 'circle'];
	let frame: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(640);
	let height = $state(230);
	let pixelRatio = $state(1);
	let localCursorMs = $state<number | undefined>(undefined);
	let activeCursorMs = $derived(cursorMs ?? localCursorMs);
	let frameHeight = $derived(Math.max(168, 54 + rows.length * 34));
	let accessibleSummary = $derived(summary ?? makeSummary());

	function clamp(value: number, minimum: number, maximum: number) {
		return Math.min(maximum, Math.max(minimum, value));
	}

	function timeOf(event: RasterEvent) {
		return typeof event === 'number' ? event : event.timeMs;
	}

	function rowEvents(row: RasterRow) {
		return row.events ?? row.timesMs ?? [];
	}

	function formatTime(value: number) {
		return `${Math.max(0, value)
			.toFixed(2)
			.replace(/\.?0+$/, '')} ms`;
	}

	function makeSummary() {
		if (rows.length === 0) return 'Spike raster: no model rows are available.';
		return rows
			.map((row) => {
				const times = Array.from(rowEvents(row), timeOf).filter(Number.isFinite);
				const first = times.length > 0 ? ` First at ${formatTime(Math.min(...times))}.` : '';
				const last = times.length > 1 ? ` Last at ${formatTime(Math.max(...times))}.` : '';
				return `${row.label}: ${times.length} ${times.length === 1 ? 'event' : 'events'}.${first}${last}`;
			})
			.join(' ');
	}

	function bounds() {
		return {
			left: Math.min(pad.left, Math.max(72, width * 0.34)),
			right: Math.max(pad.left + 1, width - pad.right),
			top: pad.top,
			bottom: Math.max(pad.top + 1, height - pad.bottom)
		};
	}

	function xForTime(timeMs: number) {
		const chart = bounds();
		const fraction = durationMs <= 0 ? 0 : clamp(timeMs / Math.max(0, durationMs), 0, 1);
		return chart.left + fraction * (chart.right - chart.left);
	}

	function cssColor(name: string, fallback: string) {
		const value = getComputedStyle(frame).getPropertyValue(name).trim();
		return value || fallback;
	}

	function drawMarker(
		context: CanvasRenderingContext2D,
		marker: Marker,
		x: number,
		y: number,
		halfHeight: number
	) {
		context.beginPath();
		switch (marker) {
			case 'double':
				context.moveTo(x - 1.75, y - halfHeight);
				context.lineTo(x - 1.75, y + halfHeight);
				context.moveTo(x + 1.75, y - halfHeight);
				context.lineTo(x + 1.75, y + halfHeight);
				context.stroke();
				break;
			case 'triangle':
				context.moveTo(x, y - halfHeight);
				context.lineTo(x - 4, y + halfHeight);
				context.lineTo(x + 4, y + halfHeight);
				context.closePath();
				context.stroke();
				break;
			case 'diamond':
				context.moveTo(x, y - halfHeight);
				context.lineTo(x - 4, y);
				context.lineTo(x, y + halfHeight);
				context.lineTo(x + 4, y);
				context.closePath();
				context.stroke();
				break;
			case 'circle':
				context.arc(x, y, Math.min(4, halfHeight), 0, Math.PI * 2);
				context.stroke();
				break;
			default:
				context.moveTo(x, y - halfHeight);
				context.lineTo(x, y + halfHeight);
				context.stroke();
		}
	}

	function draw() {
		if (!canvas || !frame || width <= 0 || height <= 0) return;
		const ratio = Math.max(1, pixelRatio);
		const bitmapWidth = Math.max(1, Math.round(width * ratio));
		const bitmapHeight = Math.max(1, Math.round(height * ratio));
		if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
			canvas.width = bitmapWidth;
			canvas.height = bitmapHeight;
		}

		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);

		const chart = bounds();
		const ink = cssColor('--raster-ink', '#27221b');
		const muted = cssColor('--raster-muted', '#675f54');
		const rule = cssColor('--raster-rule', '#c9bda9');
		const background = cssColor('--raster-background', '#fbf7ee');
		const rowHeight = (chart.bottom - chart.top) / Math.max(1, rows.length);

		context.fillStyle = background;
		context.fillRect(0, 0, width, height);
		context.font = '12px ui-sans-serif, system-ui, sans-serif';
		context.textBaseline = 'middle';

		for (let index = 0; index < rows.length; index += 1) {
			const row = rows[index];
			const centerY = chart.top + (index + 0.5) * rowHeight;
			context.strokeStyle = rule;
			context.lineWidth = 1;
			context.setLineDash([2, 4]);
			context.beginPath();
			context.moveTo(chart.left, centerY);
			context.lineTo(chart.right, centerY);
			context.stroke();

			context.fillStyle = ink;
			context.textAlign = 'right';
			context.fillText(row.label, chart.left - 12, centerY);

			context.strokeStyle = row.color ?? palette[index % palette.length];
			context.lineWidth = 2;
			context.setLineDash([]);
			for (const event of rowEvents(row)) {
				const time = timeOf(event);
				if (!Number.isFinite(time) || time < 0 || time > durationMs) continue;
				drawMarker(
					context,
					row.marker ?? markers[index % markers.length],
					xForTime(time),
					centerY,
					Math.min(8, rowHeight * 0.3)
				);
			}
		}

		context.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
		context.fillStyle = muted;
		for (let tick = 0; tick <= 4; tick += 1) {
			const fraction = tick / 4;
			const x = chart.left + fraction * (chart.right - chart.left);
			context.textAlign = tick === 0 ? 'left' : tick === 4 ? 'right' : 'center';
			context.fillText(formatTime(fraction * Math.max(0, durationMs)), x, height - 10);
		}

		if (activeCursorMs !== undefined) {
			const x = xForTime(activeCursorMs);
			context.strokeStyle = ink;
			context.lineWidth = 1;
			context.setLineDash([6, 3]);
			context.beginPath();
			context.moveTo(x, chart.top);
			context.lineTo(x, chart.bottom);
			context.stroke();
		}

		context.strokeStyle = ink;
		context.lineWidth = 1;
		context.setLineDash([]);
		context.strokeRect(chart.left, chart.top, chart.right - chart.left, chart.bottom - chart.top);
	}

	function setCursorFromClientX(clientX: number) {
		const rect = canvas.getBoundingClientRect();
		const chart = bounds();
		const localX = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
		const fraction = clamp((localX - chart.left) / Math.max(1, chart.right - chart.left), 0, 1);
		const next = fraction * Math.max(0, durationMs);
		localCursorMs = next;
		oncursor?.(next);
	}

	function moveCursor(next: number) {
		const safe = clamp(next, 0, Math.max(0, durationMs));
		localCursorMs = safe;
		oncursor?.(safe);
	}

	function handlePointerMove(event: PointerEvent) {
		setCursorFromClientX(event.clientX);
	}

	function handlePointerDown(event: PointerEvent) {
		canvas.focus();
		setCursorFromClientX(event.clientX);
	}

	function handleKeydown(event: KeyboardEvent) {
		const increment = stepMs ?? Math.max(0.025, durationMs / 200);
		const current = activeCursorMs ?? 0;
		let next = current;
		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				next -= event.shiftKey ? increment * 10 : increment;
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				next += event.shiftKey ? increment * 10 : increment;
				break;
			case 'PageDown':
				next -= durationMs / 10;
				break;
			case 'PageUp':
				next += durationMs / 10;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = durationMs;
				break;
			default:
				return;
		}
		event.preventDefault();
		moveCursor(next);
	}

	onMount(() => {
		const updateSize = () => {
			const rect = frame.getBoundingClientRect();
			width = Math.max(240, rect.width);
			height = Math.max(150, rect.height);
			pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
		};
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
		updateSize();
		observer?.observe(frame);
		window.addEventListener('resize', updateSize);
		return () => {
			observer?.disconnect();
			window.removeEventListener('resize', updateSize);
		};
	});

	$effect(() => {
		draw();
	});
</script>

<figure
	class="spike-raster m-0 min-w-0"
	aria-labelledby={`${uid}-title`}
	aria-describedby={`${uid}-summary ${uid}-instructions`}
>
	<figcaption class="mb-2 flex flex-wrap items-baseline justify-between gap-3">
		<span id={`${uid}-title`} class="text-sm font-bold text-ink">Spike and event raster</span>
		{#if activeCursorMs !== undefined}
			<span class="font-mono text-xs text-ink-muted">{formatTime(activeCursorMs)}</span>
		{/if}
	</figcaption>
	<div
		bind:this={frame}
		class="raster-frame relative min-h-40 overflow-hidden rounded-lg border"
		style:height={`${frameHeight}px`}
	>
		<canvas
			bind:this={canvas}
			class="block h-full w-full touch-pan-y"
			role="slider"
			tabindex="0"
			aria-label="Spike and event raster time cursor"
			aria-describedby={`${uid}-summary ${uid}-instructions`}
			aria-valuemin="0"
			aria-valuemax={Math.max(0, durationMs)}
			aria-valuenow={clamp(activeCursorMs ?? 0, 0, Math.max(0, durationMs))}
			aria-valuetext={formatTime(activeCursorMs ?? 0)}
			aria-orientation="horizontal"
			onpointermove={handlePointerMove}
			onpointerdown={handlePointerDown}
			onkeydown={handleKeydown}
		></canvas>
	</div>
	<p id={`${uid}-instructions`} class="sr-only">
		Use Left and Right Arrow to move the shared time cursor. Hold Shift for a larger step. Use Home
		and End to move to the beginning or end.
	</p>
	<p id={`${uid}-summary`} class="sr-only">{accessibleSummary}</p>
</figure>

<style>
	.spike-raster {
		--raster-background: #070a0f;
		--raster-ink: #eef2f6;
		--raster-muted: #a8b1bf;
		--raster-rule: #303744;
		--ink: #eef2f6;
		--ink-muted: #a8b1bf;
		--focus: #f4d58d;
	}

	.raster-frame {
		border-color: var(--raster-rule);
		background: var(--raster-background);
	}

	canvas:focus-visible {
		outline: 3px solid var(--focus, currentColor);
		outline-offset: -3px;
	}

	@media (prefers-reduced-motion: reduce) {
		canvas {
			scroll-behavior: auto;
		}
	}

	@media (forced-colors: active) {
		.raster-frame {
			border: 1px solid CanvasText;
		}
	}
</style>
