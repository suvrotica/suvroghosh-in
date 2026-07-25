<script lang="ts">
	type Props = {
		m: ArrayLike<number>;
		h: ArrayLike<number>;
		n: ArrayLike<number>;
		durationMs: number;
		cursorMs?: number;
		summary?: string;
		oncursor?: (timeMs: number) => void;
	};

	let { m, h, n, durationMs, cursorMs, summary, oncursor }: Props = $props();

	const uid = $props.id();
	const viewWidth = 720;
	const viewHeight = 260;
	const pad = { top: 40, right: 24, bottom: 42, left: 48 };
	const plotWidth = viewWidth - pad.left - pad.right;
	const plotHeight = viewHeight - pad.top - pad.bottom;
	let svg: SVGSVGElement;
	let localCursorMs = $state<number | undefined>(undefined);
	let activeCursorMs = $derived(cursorMs ?? localCursorMs);
	let sampleCount = $derived(Math.min(m.length, h.length, n.length));
	let selectedIndex = $derived(indexAt(activeCursorMs));
	let selectedM = $derived(valueAt(m, selectedIndex));
	let selectedH = $derived(valueAt(h, selectedIndex));
	let selectedN = $derived(valueAt(n, selectedIndex));
	let mPath = $derived(pathFor(m));
	let hPath = $derived(pathFor(h));
	let nPath = $derived(pathFor(n));
	let accessibleSummary = $derived(summary ?? makeSummary());

	function clamp(value: number, minimum: number, maximum: number) {
		return Math.min(maximum, Math.max(minimum, value));
	}

	function formatGate(value: number | undefined) {
		return value === undefined ? 'unavailable' : value.toFixed(3);
	}

	function formatTime(value: number) {
		return `${Math.max(0, value)
			.toFixed(2)
			.replace(/\.?0+$/, '')} ms`;
	}

	function xForIndex(index: number) {
		return sampleCount <= 1 ? pad.left : pad.left + (index / (sampleCount - 1)) * plotWidth;
	}

	function yForValue(value: number) {
		return pad.top + (1 - value) * plotHeight;
	}

	function indexAt(timeMs: number | undefined) {
		if (sampleCount === 0) return undefined;
		if (timeMs === undefined) return sampleCount - 1;
		const fraction = durationMs <= 0 ? 0 : clamp(timeMs / Math.max(0, durationMs), 0, 1);
		return Math.round(fraction * Math.max(0, sampleCount - 1));
	}

	function valueAt(values: ArrayLike<number>, index: number | undefined) {
		if (index === undefined || index < 0 || index >= values.length) return undefined;
		const value = Number(values[index]);
		return Number.isFinite(value) ? value : undefined;
	}

	function pathFor(values: ArrayLike<number>) {
		const count = Math.min(sampleCount, values.length);
		let path = '';
		let drawing = false;
		for (let index = 0; index < count; index += 1) {
			const value = Number(values[index]);
			if (!Number.isFinite(value)) {
				drawing = false;
				continue;
			}
			path += `${drawing ? 'L' : 'M'} ${xForIndex(index).toFixed(2)} ${yForValue(value).toFixed(2)} `;
			drawing = true;
		}
		return path.trim();
	}

	function makeSummary() {
		const currentTime = activeCursorMs ?? durationMs;
		return `Hodgkin–Huxley gate probabilities over ${formatTime(durationMs)}. At ${formatTime(currentTime)}, sodium activation m is ${formatGate(selectedM)}, sodium inactivation h is ${formatGate(selectedH)}, and potassium activation n is ${formatGate(selectedN)}. Every gate is dimensionless and should remain between zero and one.`;
	}

	function moveCursor(next: number) {
		const safe = clamp(next, 0, Math.max(0, durationMs));
		localCursorMs = safe;
		oncursor?.(safe);
	}

	function setCursorFromClientX(clientX: number) {
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		const localX = ((clientX - rect.left) / Math.max(1, rect.width)) * viewWidth;
		const fraction = clamp((localX - pad.left) / Math.max(1, plotWidth), 0, 1);
		moveCursor(fraction * Math.max(0, durationMs));
	}

	function handlePointerMove(event: PointerEvent) {
		setCursorFromClientX(event.clientX);
	}

	function handlePointerDown(event: PointerEvent) {
		svg.focus();
		setCursorFromClientX(event.clientX);
	}

	function handleKeydown(event: KeyboardEvent) {
		const sampleStep = durationMs / Math.max(1, sampleCount - 1);
		const current = activeCursorMs ?? durationMs;
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
</script>

<figure
	class="hh-gates m-0 min-w-0"
	aria-labelledby={`${uid}-title`}
	aria-describedby={`${uid}-summary ${uid}-instructions`}
>
	<figcaption class="mb-2 flex flex-wrap items-baseline justify-between gap-3">
		<span id={`${uid}-title`} class="text-sm font-bold text-ink">Hodgkin–Huxley gates</span>
		<span class="font-mono text-xs text-ink-muted">
			{formatTime(activeCursorMs ?? durationMs)}
			· m {formatGate(selectedM)}
			· h {formatGate(selectedH)}
			· n {formatGate(selectedN)}
		</span>
	</figcaption>

	<svg
		bind:this={svg}
		viewBox={`0 0 ${viewWidth} ${viewHeight}`}
		class="block w-full touch-pan-y rounded-lg border bg-paper-raised"
		role="slider"
		tabindex="0"
		aria-labelledby={`${uid}-svg-title`}
		aria-describedby={`${uid}-svg-desc ${uid}-instructions`}
		aria-valuemin="0"
		aria-valuemax={Math.max(0, durationMs)}
		aria-valuenow={clamp(activeCursorMs ?? durationMs, 0, Math.max(0, durationMs))}
		aria-valuetext={`${formatTime(activeCursorMs ?? durationMs)}, m ${formatGate(selectedM)}, h ${formatGate(selectedH)}, n ${formatGate(selectedN)}`}
		aria-orientation="horizontal"
		onpointermove={handlePointerMove}
		onpointerdown={handlePointerDown}
		onkeydown={handleKeydown}
	>
		<title id={`${uid}-svg-title`}>Hodgkin–Huxley gate probabilities m, h, and n</title>
		<desc id={`${uid}-svg-desc`}>{accessibleSummary}</desc>
		<defs>
			<clipPath id={`${uid}-clip`}>
				<rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} />
			</clipPath>
		</defs>

		<rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} class="plot-background" />

		{#each [0, 0.25, 0.5, 0.75, 1] as tick (tick)}
			{@const y = yForValue(tick)}
			<path d={`M ${pad.left} ${y} H ${pad.left + plotWidth}`} class="grid-line" />
			<text x={pad.left - 9} y={y + 4} text-anchor="end" class="tick-label">{tick}</text>
		{/each}

		{#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
			{@const x = pad.left + fraction * plotWidth}
			<text {x} y={viewHeight - 17} text-anchor="middle" class="tick-label">
				{formatTime(fraction * Math.max(0, durationMs))}
			</text>
		{/each}

		<g clip-path={`url(#${uid}-clip)`}>
			{#if mPath}<path d={mPath} class="gate-line gate-m" />{/if}
			{#if hPath}<path d={hPath} class="gate-line gate-h" />{/if}
			{#if nPath}<path d={nPath} class="gate-line gate-n" />{/if}

			{#if activeCursorMs !== undefined}
				{@const cursorX =
					pad.left +
					(durationMs <= 0 ? 0 : clamp(activeCursorMs / Math.max(0, durationMs), 0, 1)) * plotWidth}
				<path d={`M ${cursorX} ${pad.top} V ${pad.top + plotHeight}`} class="cursor-line" />
				{#if selectedM !== undefined}
					<circle cx={cursorX} cy={yForValue(selectedM)} r="4.5" class="point point-m" />
				{/if}
				{#if selectedH !== undefined}
					<path
						d={`M ${cursorX} ${yForValue(selectedH) - 5} l 5 5 l -5 5 l -5 -5 z`}
						class="point point-h"
					/>
				{/if}
				{#if selectedN !== undefined}
					<rect
						x={cursorX - 4.5}
						y={yForValue(selectedN) - 4.5}
						width="9"
						height="9"
						class="point point-n"
					/>
				{/if}
			{/if}
		</g>

		<rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} class="plot-border" />
		<text x={pad.left + plotWidth / 2} y={viewHeight - 3} text-anchor="middle" class="axis-label">
			time (ms)
		</text>
		<text
			x="14"
			y={pad.top + plotHeight / 2}
			text-anchor="middle"
			transform={`rotate(-90 14 ${pad.top + plotHeight / 2})`}
			class="axis-label"
		>
			gate probability (0–1)
		</text>

		<g transform={`translate(${pad.left + 8} 18)`} aria-hidden="true">
			<path d="M 0 0 H 26" class="gate-line gate-m" />
			<text x="33" y="4" class="legend-label">m · Na⁺ activation</text>
			<path d="M 188 0 H 214" class="gate-line gate-h" />
			<text x="221" y="4" class="legend-label">h · Na⁺ inactivation</text>
			<path d="M 400 0 H 426" class="gate-line gate-n" />
			<text x="433" y="4" class="legend-label">n · K⁺ activation</text>
		</g>
	</svg>

	<p id={`${uid}-instructions`} class="sr-only">
		Use Left and Right Arrow to inspect adjacent samples. Hold Shift for ten samples. Use Home and
		End for the beginning or end.
	</p>
	<p id={`${uid}-summary`} class="sr-only">{accessibleSummary}</p>
</figure>

<style>
	.hh-gates {
		--paper-raised: #070a0f;
		--ink: #eef2f6;
		--ink-muted: #a8b1bf;
		--rule: #303744;
		--focus: #f4d58d;
	}

	svg {
		min-height: 12rem;
		border-color: var(--rule);
		color: var(--ink);
	}

	svg:focus-visible {
		outline: 3px solid var(--focus, currentColor);
		outline-offset: -3px;
	}

	.plot-background {
		fill: var(--paper-raised);
	}

	.grid-line,
	.plot-border,
	.gate-line,
	.cursor-line {
		fill: none;
		vector-effect: non-scaling-stroke;
	}

	.grid-line {
		stroke: var(--rule);
		stroke-width: 1;
	}

	.plot-border {
		stroke: var(--ink);
		stroke-width: 1;
	}

	.gate-line {
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.gate-m {
		stroke: #73b7c8;
	}

	.gate-h {
		stroke: #d9a066;
		stroke-dasharray: 9 5;
	}

	.gate-n {
		stroke: #b9a5e2;
		stroke-dasharray: 2 4;
	}

	.cursor-line {
		stroke: var(--ink);
		stroke-width: 1;
		stroke-dasharray: 6 3;
	}

	.point {
		fill: var(--paper-raised);
		stroke: var(--ink);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.tick-label,
	.axis-label,
	.legend-label {
		fill: var(--ink-muted);
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-size: 11px;
	}

	.axis-label {
		fill: var(--ink);
		font-size: 12px;
		font-weight: 700;
	}

	.legend-label {
		fill: var(--ink);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 11px;
	}

	@media (max-width: 40rem) {
		svg {
			min-height: 10rem;
		}

		.legend-label {
			font-size: 10px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.gate-line,
		.cursor-line,
		.point {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.gate-line,
		.cursor-line,
		.point,
		.grid-line,
		.plot-border {
			stroke: CanvasText;
		}
	}
</style>
