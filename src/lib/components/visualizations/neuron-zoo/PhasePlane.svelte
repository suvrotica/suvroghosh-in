<script lang="ts">
	type PhasePoint = {
		v: number;
		w: number;
	};

	type Props = {
		v: ArrayLike<number>;
		w: ArrayLike<number>;
		vNullcline: readonly PhasePoint[];
		wNullcline: readonly PhasePoint[];
		currentPoint?: PhasePoint;
		durationMs: number;
		cursorMs?: number;
		vMin?: number;
		vMax?: number;
		wMin?: number;
		wMax?: number;
		summary?: string;
		oncursor?: (timeMs: number) => void;
	};

	let {
		v,
		w,
		vNullcline,
		wNullcline,
		currentPoint,
		durationMs,
		cursorMs,
		vMin = -2.5,
		vMax = 2.5,
		wMin = -1.5,
		wMax = 1.5,
		summary,
		oncursor
	}: Props = $props();

	const uid = $props.id();
	const viewWidth = 520;
	const viewHeight = 340;
	const pad = { top: 28, right: 24, bottom: 48, left: 58 };
	const plotWidth = viewWidth - pad.left - pad.right;
	const plotHeight = viewHeight - pad.top - pad.bottom;
	let svg: SVGSVGElement;
	let localIndex = $state<number | undefined>(undefined);
	let pointCount = $derived(Math.min(v.length, w.length));
	let selectedIndex = $derived(indexForCursor(cursorMs, localIndex));
	let selectedPoint = $derived(
		pointForIndex(selectedIndex) ?? currentPoint ?? pointForIndex(pointCount - 1)
	);
	let trajectoryPath = $derived(pathFromSeries(v, w));
	let vNullclinePath = $derived(pathFromPoints(vNullcline));
	let wNullclinePath = $derived(pathFromPoints(wNullcline));
	let accessibleSummary = $derived(summary ?? makeSummary());

	function clamp(value: number, minimum: number, maximum: number) {
		return Math.min(maximum, Math.max(minimum, value));
	}

	function format(value: number) {
		return value.toFixed(3).replace(/\.?0+$/, '');
	}

	function xFor(value: number) {
		const span = vMax - vMin;
		const fraction = span === 0 ? 0.5 : (value - vMin) / span;
		return pad.left + fraction * plotWidth;
	}

	function yFor(value: number) {
		const span = wMax - wMin;
		const fraction = span === 0 ? 0.5 : (value - wMin) / span;
		return pad.top + (1 - fraction) * plotHeight;
	}

	function indexForCursor(externalCursor: number | undefined, internalIndex: number | undefined) {
		if (pointCount === 0) return undefined;
		if (externalCursor !== undefined) {
			const fraction = durationMs <= 0 ? 0 : clamp(externalCursor / Math.max(0, durationMs), 0, 1);
			return Math.round(fraction * Math.max(0, pointCount - 1));
		}
		return internalIndex;
	}

	function pointForIndex(index: number | undefined) {
		if (index === undefined || index < 0 || index >= pointCount) return undefined;
		const nextV = Number(v[index]);
		const nextW = Number(w[index]);
		return Number.isFinite(nextV) && Number.isFinite(nextW) ? { v: nextV, w: nextW } : undefined;
	}

	function pathFromSeries(vValues: ArrayLike<number>, wValues: ArrayLike<number>) {
		const count = Math.min(vValues.length, wValues.length);
		let path = '';
		let drawing = false;
		for (let index = 0; index < count; index += 1) {
			const nextV = Number(vValues[index]);
			const nextW = Number(wValues[index]);
			if (!Number.isFinite(nextV) || !Number.isFinite(nextW)) {
				drawing = false;
				continue;
			}
			path += `${drawing ? 'L' : 'M'} ${xFor(nextV).toFixed(2)} ${yFor(nextW).toFixed(2)} `;
			drawing = true;
		}
		return path.trim();
	}

	function pathFromPoints(points: readonly PhasePoint[]) {
		let path = '';
		let drawing = false;
		for (const point of points) {
			if (!Number.isFinite(point.v) || !Number.isFinite(point.w)) {
				drawing = false;
				continue;
			}
			path += `${drawing ? 'L' : 'M'} ${xFor(point.v).toFixed(2)} ${yFor(point.w).toFixed(2)} `;
			drawing = true;
		}
		return path.trim();
	}

	function timeForIndex(index: number) {
		if (pointCount <= 1 || durationMs <= 0) return 0;
		return (index / (pointCount - 1)) * durationMs;
	}

	function makeSummary() {
		const selected = selectedPoint;
		const current = selected
			? ` Current point: v ${format(selected.v)}, w ${format(selected.w)}.`
			: '';
		return `FitzHugh–Nagumo phase plane with ${pointCount} trajectory points. Both axes are dimensionless. The solid curve is the v-nullcline; the dashed curve is the w-nullcline.${current}`;
	}

	function selectIndex(index: number) {
		if (pointCount === 0) return;
		const safeIndex = clamp(Math.round(index), 0, pointCount - 1);
		localIndex = safeIndex;
		oncursor?.(timeForIndex(safeIndex));
	}

	function nearestIndex(clientX: number, clientY: number) {
		if (!svg || pointCount === 0) return undefined;
		const rect = svg.getBoundingClientRect();
		const targetX = ((clientX - rect.left) / Math.max(1, rect.width)) * viewWidth;
		const targetY = ((clientY - rect.top) / Math.max(1, rect.height)) * viewHeight;
		let closestIndex: number | undefined;
		let closestDistance = Number.POSITIVE_INFINITY;

		for (let index = 0; index < pointCount; index += 1) {
			const point = pointForIndex(index);
			if (!point) continue;
			const deltaX = xFor(point.v) - targetX;
			const deltaY = yFor(point.w) - targetY;
			const distance = deltaX * deltaX + deltaY * deltaY;
			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = index;
			}
		}
		return closestIndex;
	}

	function handlePointer(event: PointerEvent) {
		const index = nearestIndex(event.clientX, event.clientY);
		if (index !== undefined) selectIndex(index);
	}

	function handlePointerDown(event: PointerEvent) {
		svg.focus();
		handlePointer(event);
	}

	function handleKeydown(event: KeyboardEvent) {
		const current = selectedIndex ?? Math.max(0, pointCount - 1);
		let next = current;
		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				next -= event.shiftKey ? 10 : 1;
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				next += event.shiftKey ? 10 : 1;
				break;
			case 'PageDown':
				next -= Math.max(1, Math.round(pointCount / 10));
				break;
			case 'PageUp':
				next += Math.max(1, Math.round(pointCount / 10));
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = pointCount - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		selectIndex(next);
	}
</script>

<figure
	class="phase-plane m-0 min-w-0"
	aria-labelledby={`${uid}-title`}
	aria-describedby={`${uid}-summary ${uid}-instructions`}
>
	<figcaption class="mb-2 flex flex-wrap items-baseline justify-between gap-3">
		<span id={`${uid}-title`} class="text-sm font-bold text-ink">FitzHugh–Nagumo phase plane</span>
		{#if selectedPoint}
			<span class="font-mono text-xs text-ink-muted">
				v {format(selectedPoint.v)} · w {format(selectedPoint.w)}
			</span>
		{/if}
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
		aria-valuenow={selectedIndex === undefined
			? Math.max(0, durationMs)
			: timeForIndex(selectedIndex)}
		aria-valuetext={`Time ${format(selectedIndex === undefined ? Math.max(0, durationMs) : timeForIndex(selectedIndex))} milliseconds${selectedPoint ? `, v ${format(selectedPoint.v)}, w ${format(selectedPoint.w)}` : ''}`}
		aria-orientation="horizontal"
		onpointermove={handlePointer}
		onpointerdown={handlePointerDown}
		onkeydown={handleKeydown}
	>
		<title id={`${uid}-svg-title`}>FitzHugh–Nagumo phase portrait</title>
		<desc id={`${uid}-svg-desc`}>{accessibleSummary}</desc>
		<defs>
			<clipPath id={`${uid}-clip`}>
				<rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} />
			</clipPath>
			<pattern id={`${uid}-trajectory-pattern`} width="8" height="8" patternUnits="userSpaceOnUse">
				<path d="M 0 8 L 8 0" stroke="currentColor" stroke-width="0.6" opacity="0.3" />
			</pattern>
		</defs>

		<rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} class="plot-background" />

		{#each [0, 1, 2, 3, 4] as tick (tick)}
			{@const fraction = tick / 4}
			{@const x = pad.left + fraction * plotWidth}
			{@const y = pad.top + (1 - fraction) * plotHeight}
			<path d={`M ${x} ${pad.top} V ${pad.top + plotHeight}`} class="grid-line" />
			<path d={`M ${pad.left} ${y} H ${pad.left + plotWidth}`} class="grid-line" />
			<text {x} y={viewHeight - 23} text-anchor="middle" class="tick-label">
				{format(vMin + fraction * (vMax - vMin))}
			</text>
			<text x={pad.left - 10} y={y + 4} text-anchor="end" class="tick-label">
				{format(wMin + fraction * (wMax - wMin))}
			</text>
		{/each}

		<g clip-path={`url(#${uid}-clip)`}>
			{#if vNullclinePath}
				<path d={vNullclinePath} class="v-nullcline" />
			{/if}
			{#if wNullclinePath}
				<path d={wNullclinePath} class="w-nullcline" />
			{/if}
			{#if trajectoryPath}
				<path d={trajectoryPath} class="trajectory-halo" />
				<path d={trajectoryPath} class="trajectory" />
			{/if}
			{#if selectedPoint}
				<g
					transform={`translate(${xFor(selectedPoint.v)} ${yFor(selectedPoint.w)})`}
					class="current-point"
				>
					<circle r="6" />
					<path d="M -9 0 H 9 M 0 -9 V 9" />
				</g>
			{/if}
		</g>

		<rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} class="plot-border" />
		<text x={pad.left + plotWidth / 2} y={viewHeight - 5} text-anchor="middle" class="axis-label">
			fast variable v (dimensionless)
		</text>
		<text
			x="15"
			y={pad.top + plotHeight / 2}
			text-anchor="middle"
			transform={`rotate(-90 15 ${pad.top + plotHeight / 2})`}
			class="axis-label"
		>
			recovery variable w (dimensionless)
		</text>

		<g transform={`translate(${pad.left + 8} ${pad.top + 13})`} aria-hidden="true">
			<path d="M 0 0 H 24" class="v-nullcline" />
			<text x="30" y="4" class="legend-label">v-nullcline</text>
			<path d="M 105 0 H 129" class="w-nullcline" />
			<text x="135" y="4" class="legend-label">w-nullcline</text>
			<path d="M 224 0 H 248" class="trajectory" />
			<text x="254" y="4" class="legend-label">trajectory</text>
		</g>
	</svg>

	<p id={`${uid}-instructions`} class="sr-only">
		Use Arrow keys to inspect the trajectory. Hold Shift for ten points. Use Home and End for the
		first or last point.
	</p>
	<p id={`${uid}-summary`} class="sr-only">{accessibleSummary}</p>
</figure>

<style>
	.phase-plane {
		--paper-raised: #070a0f;
		--ink: #eef2f6;
		--ink-muted: #a8b1bf;
		--rule: #303744;
		--focus: #f4d58d;
	}

	svg {
		min-height: 14rem;
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

	.plot-border {
		fill: none;
		stroke: var(--ink);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.grid-line {
		fill: none;
		stroke: var(--rule);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.v-nullcline,
	.w-nullcline,
	.trajectory,
	.trajectory-halo {
		fill: none;
		vector-effect: non-scaling-stroke;
	}

	.v-nullcline {
		stroke: #d9a066;
		stroke-width: 2;
	}

	.w-nullcline {
		stroke: #b9a5e2;
		stroke-width: 2;
		stroke-dasharray: 8 5;
	}

	.trajectory-halo {
		stroke: var(--paper-raised);
		stroke-width: 6;
	}

	.trajectory {
		stroke: #73b7c8;
		stroke-width: 2.75;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 1 0;
	}

	.current-point circle {
		fill: var(--paper-raised);
		stroke: var(--ink);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.current-point path {
		stroke: var(--ink);
		stroke-width: 1;
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
	}

	@media (max-width: 40rem) {
		svg {
			min-height: 12rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.trajectory,
		.current-point {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.v-nullcline,
		.w-nullcline,
		.trajectory,
		.current-point circle,
		.current-point path,
		.plot-border,
		.grid-line {
			stroke: CanvasText;
		}
	}
</style>
