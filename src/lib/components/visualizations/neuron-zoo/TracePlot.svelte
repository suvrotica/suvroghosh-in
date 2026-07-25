<script lang="ts">
	import { onMount } from 'svelte';

	type TimedEvent = number | { timeMs: number };

	type Props = {
		label: string;
		unit: string;
		values: ArrayLike<number>;
		durationMs: number;
		yMin: number;
		yMax: number;
		events?: readonly TimedEvent[];
		cursorMs?: number;
		color?: string;
		dash?: string | readonly number[];
		threshold?: number;
		summary?: string;
		oncursor?: (timeMs: number) => void;
	};

	let {
		label,
		unit,
		values,
		durationMs,
		yMin,
		yMax,
		events = [],
		cursorMs,
		color = '#73b7c8',
		dash = [],
		threshold,
		summary,
		oncursor
	}: Props = $props();

	const uid = $props.id();
	const pad = { top: 18, right: 14, bottom: 30, left: 52 };
	let frame: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(640);
	let height = $state(224);
	let pixelRatio = $state(1);
	let localCursorMs = $state<number | undefined>(undefined);
	let activeCursorMs = $derived(cursorMs ?? localCursorMs);
	let cursorValue = $derived(valueAt(activeCursorMs));
	let accessibleSummary = $derived(summary ?? makeSummary());

	function finite(value: number, fallback: number) {
		return Number.isFinite(value) ? value : fallback;
	}

	function clamp(value: number, minimum: number, maximum: number) {
		return Math.min(maximum, Math.max(minimum, value));
	}

	function eventTime(event: TimedEvent) {
		return typeof event === 'number' ? event : event.timeMs;
	}

	function dashPattern(value: string | readonly number[]) {
		if (Array.isArray(value)) return value.map(Number).filter((part) => part > 0);
		return String(value)
			.split(/[\s,]+/)
			.map(Number)
			.filter((part) => part > 0);
	}

	function valueAt(timeMs: number | undefined) {
		if (timeMs === undefined || values.length === 0) return undefined;
		const safeDuration = Math.max(0, finite(durationMs, 0));
		const fraction = safeDuration === 0 ? 0 : clamp(timeMs / safeDuration, 0, 1);
		const index = Math.round(fraction * Math.max(0, values.length - 1));
		const value = Number(values[index]);
		return Number.isFinite(value) ? value : undefined;
	}

	function formatValue(value: number) {
		const span = Math.abs(yMax - yMin);
		const digits = span <= 0.02 ? 4 : span <= 2 ? 3 : span <= 20 ? 2 : 1;
		return value.toFixed(digits).replace(/\.?0+$/, '');
	}

	function makeSummary() {
		let minimum = Number.POSITIVE_INFINITY;
		let maximum = Number.NEGATIVE_INFINITY;
		let finiteCount = 0;

		for (let index = 0; index < values.length; index += 1) {
			const value = Number(values[index]);
			if (!Number.isFinite(value)) continue;
			minimum = Math.min(minimum, value);
			maximum = Math.max(maximum, value);
			finiteCount += 1;
		}

		if (finiteCount === 0) {
			return `${label}: no finite samples are available. The plotted axis is ${yMin} to ${yMax} ${unit}.`;
		}

		const eventCount = events.filter((event) => Number.isFinite(eventTime(event))).length;
		return `${label}: ${finiteCount} samples over ${formatTime(durationMs)}. Minimum ${formatValue(minimum)} ${unit}; maximum ${formatValue(maximum)} ${unit}; ${eventCount} ${eventCount === 1 ? 'event' : 'events'}.`;
	}

	function formatTime(timeMs: number) {
		return `${Math.max(0, finite(timeMs, 0))
			.toFixed(2)
			.replace(/\.?0+$/, '')} ms`;
	}

	function chartBounds() {
		return {
			left: pad.left,
			right: Math.max(pad.left + 1, width - pad.right),
			top: pad.top,
			bottom: Math.max(pad.top + 1, height - pad.bottom)
		};
	}

	function xForTime(timeMs: number) {
		const bounds = chartBounds();
		const safeDuration = Math.max(0, finite(durationMs, 0));
		const fraction = safeDuration === 0 ? 0 : clamp(timeMs / safeDuration, 0, 1);
		return bounds.left + fraction * (bounds.right - bounds.left);
	}

	function yForValue(value: number) {
		const bounds = chartBounds();
		const span = yMax - yMin;
		const fraction = span === 0 ? 0.5 : (value - yMin) / span;
		return bounds.bottom - fraction * (bounds.bottom - bounds.top);
	}

	function cssColor(name: string, fallback: string) {
		const value = getComputedStyle(frame).getPropertyValue(name).trim();
		return value || fallback;
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

		const bounds = chartBounds();
		const ink = cssColor('--plot-ink', '#27221b');
		const muted = cssColor('--plot-muted', '#675f54');
		const rule = cssColor('--plot-rule', '#c9bda9');
		const background = cssColor('--plot-background', '#fbf7ee');

		context.fillStyle = background;
		context.fillRect(0, 0, width, height);
		context.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
		context.textBaseline = 'middle';

		context.strokeStyle = rule;
		context.lineWidth = 1;
		context.setLineDash([]);
		for (let tick = 0; tick <= 4; tick += 1) {
			const fraction = tick / 4;
			const y = bounds.bottom - fraction * (bounds.bottom - bounds.top);
			const tickValue = yMin + fraction * (yMax - yMin);
			context.beginPath();
			context.moveTo(bounds.left, Math.round(y) + 0.5);
			context.lineTo(bounds.right, Math.round(y) + 0.5);
			context.stroke();
			context.fillStyle = muted;
			context.textAlign = 'right';
			context.fillText(formatValue(tickValue), bounds.left - 7, y);
		}

		const xTickCount = width < 320 ? 2 : 4;
		for (let tick = 0; tick <= xTickCount; tick += 1) {
			const fraction = tick / xTickCount;
			const x = bounds.left + fraction * (bounds.right - bounds.left);
			context.fillStyle = muted;
			context.textAlign = tick === 0 ? 'left' : tick === xTickCount ? 'right' : 'center';
			context.fillText(formatTime(fraction * Math.max(0, durationMs)), x, height - 10);
		}

		if (threshold !== undefined && Number.isFinite(threshold)) {
			const y = yForValue(threshold);
			if (y >= bounds.top && y <= bounds.bottom) {
				context.strokeStyle = ink;
				context.lineWidth = 1;
				context.setLineDash([3, 3]);
				context.beginPath();
				context.moveTo(bounds.left, y);
				context.lineTo(bounds.right, y);
				context.stroke();
				context.fillStyle = ink;
				context.textAlign = 'right';
				context.fillText('threshold', bounds.right - 4, Math.max(bounds.top + 7, y - 7));
			}
		}

		context.save();
		context.beginPath();
		context.rect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
		context.clip();

		if (values.length > 0) {
			context.strokeStyle = color;
			context.lineWidth = 2;
			context.lineCap = 'round';
			context.lineJoin = 'round';
			context.setLineDash(dashPattern(dash));
			context.beginPath();
			let drawing = false;
			for (let index = 0; index < values.length; index += 1) {
				const value = Number(values[index]);
				if (!Number.isFinite(value)) {
					drawing = false;
					continue;
				}
				const x =
					values.length === 1
						? bounds.left
						: bounds.left + (index / (values.length - 1)) * (bounds.right - bounds.left);
				const y = yForValue(value);
				if (drawing) context.lineTo(x, y);
				else {
					context.moveTo(x, y);
					drawing = true;
				}
			}
			context.stroke();
		}

		context.strokeStyle = ink;
		context.fillStyle = background;
		context.lineWidth = 1.5;
		context.setLineDash([]);
		for (const event of events) {
			const time = eventTime(event);
			if (!Number.isFinite(time) || time < 0 || time > durationMs) continue;
			const x = xForTime(time);
			context.beginPath();
			context.moveTo(x, bounds.top);
			context.lineTo(x, bounds.top + 9);
			context.stroke();
			context.beginPath();
			context.moveTo(x - 3, bounds.top + 1);
			context.lineTo(x + 3, bounds.top + 1);
			context.lineTo(x, bounds.top + 5);
			context.closePath();
			context.fill();
			context.stroke();
		}

		if (activeCursorMs !== undefined) {
			const safeCursor = clamp(activeCursorMs, 0, Math.max(0, durationMs));
			const x = xForTime(safeCursor);
			context.strokeStyle = ink;
			context.lineWidth = 1;
			context.setLineDash([6, 3]);
			context.beginPath();
			context.moveTo(x, bounds.top);
			context.lineTo(x, bounds.bottom);
			context.stroke();

			const value = valueAt(safeCursor);
			if (value !== undefined) {
				const y = yForValue(value);
				context.fillStyle = background;
				context.strokeStyle = ink;
				context.setLineDash([]);
				context.beginPath();
				context.arc(x, y, 4, 0, Math.PI * 2);
				context.fill();
				context.stroke();
			}
		}
		context.restore();

		context.strokeStyle = ink;
		context.setLineDash([]);
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(bounds.left, bounds.top);
		context.lineTo(bounds.left, bounds.bottom);
		context.lineTo(bounds.right, bounds.bottom);
		context.stroke();
	}

	function setCursorFromClientX(clientX: number) {
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const bounds = chartBounds();
		const localX = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
		const fraction = clamp((localX - bounds.left) / Math.max(1, bounds.right - bounds.left), 0, 1);
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
		const sampleStep = durationMs / Math.max(1, values.length - 1);
		const current = activeCursorMs ?? 0;
		let next = current;

		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				next -= event.shiftKey ? sampleStep * 10 : sampleStep;
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				next += event.shiftKey ? sampleStep * 10 : sampleStep;
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
			height = Math.max(176, rect.height);
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
	class="trace-plot m-0 min-w-0"
	aria-labelledby={`${uid}-title`}
	aria-describedby={`${uid}-summary ${uid}-instructions`}
>
	<figcaption class="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<span id={`${uid}-title`} class="text-sm font-bold text-ink">{label}</span>
		<span class="font-mono text-xs text-ink-muted">
			{#if activeCursorMs !== undefined}
				{formatTime(activeCursorMs)}
				{#if cursorValue !== undefined}
					· {formatValue(cursorValue)} {unit}
				{/if}
			{:else}
				{unit}
			{/if}
		</span>
	</figcaption>

	<div
		bind:this={frame}
		class="plot-frame relative h-56 min-h-44 overflow-hidden rounded-lg border"
	>
		<canvas
			bind:this={canvas}
			class="block h-full w-full touch-pan-y"
			role="slider"
			tabindex="0"
			aria-label={`${label} time cursor`}
			aria-describedby={`${uid}-summary ${uid}-instructions`}
			aria-valuemin="0"
			aria-valuemax={Math.max(0, durationMs)}
			aria-valuenow={clamp(activeCursorMs ?? 0, 0, Math.max(0, durationMs))}
			aria-valuetext={`${formatTime(activeCursorMs ?? 0)}${cursorValue === undefined ? '' : `, ${formatValue(cursorValue)} ${unit}`}`}
			aria-orientation="horizontal"
			onpointermove={handlePointerMove}
			onpointerdown={handlePointerDown}
			onkeydown={handleKeydown}
		></canvas>
	</div>

	<p id={`${uid}-instructions`} class="sr-only">
		Use Left and Right Arrow to inspect adjacent samples, Shift plus Arrow for ten samples, Page Up
		and Page Down for larger steps, and Home or End for the start or end.
	</p>
	<p id={`${uid}-summary`} class="sr-only">{accessibleSummary}</p>
</figure>

<style>
	.trace-plot {
		--plot-background: #070a0f;
		--plot-ink: #eef2f6;
		--plot-muted: #a8b1bf;
		--plot-rule: #303744;
		--ink: #eef2f6;
		--ink-muted: #a8b1bf;
		--focus: #f4d58d;
	}

	.plot-frame {
		border-color: var(--plot-rule);
		background: var(--plot-background);
	}

	canvas:focus-visible {
		outline: 3px solid var(--focus, currentColor);
		outline-offset: -3px;
	}

	@media (max-width: 40rem) {
		.plot-frame {
			height: 11rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		canvas {
			scroll-behavior: auto;
		}
	}

	@media (forced-colors: active) {
		.plot-frame {
			border: 1px solid CanvasText;
		}
	}
</style>
