<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		DOMAIN_COLORING_PRESETS,
		DomainColoringRenderer,
		ExpressionError,
		domainColoringPreset,
		niceGridStep,
		panViewport,
		parseExpression,
		viewportBounds,
		zoomViewport,
		type ExpressionNode,
		type Viewport
	} from '$lib/visualizations/domain-coloring';
	import { renderPixelDensity } from '$lib/visualizations/webgl';

	const uid = $props.id();
	const defaultPreset = DOMAIN_COLORING_PRESETS[0];
	const fallbackPoster = '/images/domain-coloring-explorer.svg';

	type Gesture = {
		x: number;
		y: number;
		distance: number;
	};

	let laboratory: HTMLElement;
	let canvasHost: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let gridCanvas: HTMLCanvasElement;
	let renderer: DomainColoringRenderer | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let mounted = $state(false);
	let stageWidth = $state(1);
	let stageHeight = $state(1);
	let pixelDensity = 1;
	let renderState = $state<'idle' | 'ready' | 'fallback' | 'error'>('idle');
	let status = $state('Preparing the complex plane…');
	let expressionError = $state('');
	let activePresetId = $state<string | null>(defaultPreset.id);
	let functionDraft = $state(defaultPreset.expression);
	let functionSource = $state(defaultPreset.expression);
	let activeExpression: ExpressionNode = parseExpression(defaultPreset.expression);
	let viewport = $state<Viewport>({ ...defaultPreset.view });
	let gridVisible = $state(true);
	let pointerReadout = $state('Move over the plane to inspect z.');
	let activePointers = new SvelteMap<number, { x: number; y: number }>();
	let previousGesture: Gesture | null = null;

	let activePreset = $derived(activePresetId ? domainColoringPreset(activePresetId) : undefined);
	let bounds = $derived(viewportBounds(viewport, stageWidth, stageHeight));
	let rangeLabel = $derived(
		`Re ${formatBound(bounds.minRe)} to ${formatBound(bounds.maxRe)} · Im ${formatBound(bounds.minIm)} to ${formatBound(bounds.maxIm)}`
	);
	let currentDescription = $derived(
		activePreset
			? `${activePreset.notation}. ${activePreset.summary} Visible range: ${rangeLabel}.`
			: `Custom function f(z) = ${functionSource}. Visible range: ${rangeLabel}.`
	);

	function formatBound(value: number) {
		if (Math.abs(value) >= 10_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
			return value.toExponential(2);
		}
		const precision = viewport.spanIm < 0.05 ? 4 : viewport.spanIm < 1 ? 3 : 2;
		const rounded = Number(value.toFixed(precision));
		return Object.is(rounded, -0) ? '0' : String(rounded);
	}

	function redraw() {
		renderer?.render(viewport);
		drawGrid();
	}

	function resize() {
		if (!canvasHost || !canvas || !gridCanvas) return;
		const rect = canvasHost.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		stageWidth = rect.width;
		stageHeight = rect.height;
		pixelDensity = renderPixelDensity();
		renderer?.resize(rect.width, rect.height, pixelDensity);
		gridCanvas.width = Math.max(1, Math.round(rect.width * pixelDensity));
		gridCanvas.height = Math.max(1, Math.round(rect.height * pixelDensity));
		gridCanvas.style.width = `${rect.width}px`;
		gridCanvas.style.height = `${rect.height}px`;
		redraw();
	}

	function drawGrid() {
		if (!gridCanvas || stageWidth < 1 || stageHeight < 1) return;
		const context = gridCanvas.getContext('2d');
		if (!context) return;
		context.setTransform(pixelDensity, 0, 0, pixelDensity, 0, 0);
		context.clearRect(0, 0, stageWidth, stageHeight);
		if (!gridVisible) return;

		const currentBounds = viewportBounds(viewport, stageWidth, stageHeight);
		const spanRe = currentBounds.maxRe - currentBounds.minRe;
		const spanIm = currentBounds.maxIm - currentBounds.minIm;
		const step = niceGridStep(spanIm, stageHeight);
		const firstRe = Math.ceil(currentBounds.minRe / step) * step;
		const firstIm = Math.ceil(currentBounds.minIm / step) * step;
		const xAxisY = Math.min(
			stageHeight - 20,
			Math.max(16, ((currentBounds.maxIm - 0) / spanIm) * stageHeight)
		);
		const yAxisX = Math.min(
			stageWidth - 34,
			Math.max(30, ((0 - currentBounds.minRe) / spanRe) * stageWidth)
		);

		context.lineWidth = 1;
		context.strokeStyle = 'rgba(255,255,255,0.24)';
		context.beginPath();
		for (let value = firstRe; value <= currentBounds.maxRe + step * 0.25; value += step) {
			const x = ((value - currentBounds.minRe) / spanRe) * stageWidth;
			context.moveTo(Math.round(x) + 0.5, 0);
			context.lineTo(Math.round(x) + 0.5, stageHeight);
		}
		for (let value = firstIm; value <= currentBounds.maxIm + step * 0.25; value += step) {
			const y = ((currentBounds.maxIm - value) / spanIm) * stageHeight;
			context.moveTo(0, Math.round(y) + 0.5);
			context.lineTo(stageWidth, Math.round(y) + 0.5);
		}
		context.stroke();

		context.strokeStyle = 'rgba(255,255,255,0.82)';
		context.lineWidth = 1.5;
		context.beginPath();
		if (currentBounds.minIm <= 0 && currentBounds.maxIm >= 0) {
			const y = ((currentBounds.maxIm - 0) / spanIm) * stageHeight;
			context.moveTo(0, y);
			context.lineTo(stageWidth, y);
		}
		if (currentBounds.minRe <= 0 && currentBounds.maxRe >= 0) {
			const x = ((0 - currentBounds.minRe) / spanRe) * stageWidth;
			context.moveTo(x, 0);
			context.lineTo(x, stageHeight);
		}
		context.stroke();

		context.font = '500 11px ui-monospace, SFMono-Regular, Consolas, monospace';
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.lineJoin = 'round';
		context.strokeStyle = 'rgba(5,7,13,0.9)';
		context.fillStyle = 'rgba(255,255,255,0.92)';
		context.lineWidth = 3;

		for (let value = firstRe; value <= currentBounds.maxRe + step * 0.25; value += step) {
			if (Math.abs(value) < step * 0.1) continue;
			const x = ((value - currentBounds.minRe) / spanRe) * stageWidth;
			if (x < 24 || x > stageWidth - 24) continue;
			const label = gridLabel(value, step);
			context.strokeText(label, x, xAxisY);
			context.fillText(label, x, xAxisY);
		}

		context.textAlign = 'right';
		for (let value = firstIm; value <= currentBounds.maxIm + step * 0.25; value += step) {
			if (Math.abs(value) < step * 0.1) continue;
			const y = ((currentBounds.maxIm - value) / spanIm) * stageHeight;
			if (y < 14 || y > stageHeight - 14) continue;
			const label = gridLabel(value, step);
			context.strokeText(label, yAxisX - 5, y);
			context.fillText(label, yAxisX - 5, y);
		}

		context.textBaseline = 'top';
		context.textAlign = 'right';
		context.strokeText('Re z', stageWidth - 10, xAxisY + 7);
		context.fillText('Re z', stageWidth - 10, xAxisY + 7);
		context.textAlign = 'left';
		context.strokeText('Im z', yAxisX + 7, 8);
		context.fillText('Im z', yAxisX + 7, 8);
	}

	function gridLabel(value: number, step: number) {
		const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step))));
		const rounded = Number(value.toFixed(decimals));
		return Object.is(rounded, -0) ? '0' : String(rounded);
	}

	function applyFunction() {
		try {
			const parsed = parseExpression(functionDraft);
			renderer?.setExpression(parsed);
			activeExpression = parsed;
			functionSource = functionDraft.trim();
			activePresetId = null;
			expressionError = '';
			status = `Rendered f(z) = ${functionSource}.`;
			redraw();
		} catch (error) {
			expressionError =
				error instanceof ExpressionError
					? error.message
					: 'This function could not be drawn. Try one of the examples.';
			status = 'The previous valid function remains on the plane.';
		}
	}

	function choosePreset(id: string) {
		const preset = domainColoringPreset(id);
		if (!preset) return;
		const parsed = parseExpression(preset.expression);
		try {
			renderer?.setExpression(parsed);
		} catch {
			expressionError = 'The graphics driver could not compile this example.';
			return;
		}
		activeExpression = parsed;
		activePresetId = preset.id;
		functionDraft = preset.expression;
		functionSource = preset.expression;
		viewport = { ...preset.view };
		expressionError = '';
		status = `${preset.label} selected. ${preset.notice}`;
		redraw();
	}

	function resetView() {
		viewport = { ...(activePreset?.view ?? defaultPreset.view) };
		status = 'View reset.';
		redraw();
	}

	function zoomBy(factor: number) {
		viewport = zoomViewport(
			viewport,
			stageWidth / 2,
			stageHeight / 2,
			stageWidth,
			stageHeight,
			factor
		);
		status = factor < 1 ? 'Zoomed in.' : 'Zoomed out.';
		redraw();
	}

	function toggleGrid() {
		gridVisible = !gridVisible;
		status = gridVisible ? 'Coordinate grid shown.' : 'Coordinate grid hidden.';
		drawGrid();
	}

	function pointerPosition(event: PointerEvent) {
		const rect = canvasHost.getBoundingClientRect();
		return { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	function currentGesture(): Gesture | null {
		const points = [...activePointers.values()];
		if (!points.length) return null;
		const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
		const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
		const distance =
			points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
		return { x, y, distance };
	}

	function handlePointerDown(event: PointerEvent) {
		const point = pointerPosition(event);
		activePointers.set(event.pointerId, point);
		canvas.setPointerCapture(event.pointerId);
		previousGesture = currentGesture();
		updatePointerReadout(point.x, point.y);
	}

	function handlePointerMove(event: PointerEvent) {
		const point = pointerPosition(event);
		updatePointerReadout(point.x, point.y);
		if (!activePointers.has(event.pointerId)) return;
		activePointers.set(event.pointerId, point);
		const gesture = currentGesture();
		if (!gesture || !previousGesture) {
			previousGesture = gesture;
			return;
		}

		viewport = panViewport(
			viewport,
			gesture.x - previousGesture.x,
			gesture.y - previousGesture.y,
			stageWidth,
			stageHeight
		);
		if (gesture.distance > 0 && previousGesture.distance > 0) {
			viewport = zoomViewport(
				viewport,
				gesture.x,
				gesture.y,
				stageWidth,
				stageHeight,
				previousGesture.distance / gesture.distance
			);
		}
		previousGesture = gesture;
		status =
			activePointers.size > 1
				? 'Pinching and panning the complex plane.'
				: 'Panning the complex plane.';
		redraw();
	}

	function handlePointerEnd(event: PointerEvent) {
		activePointers.delete(event.pointerId);
		previousGesture = currentGesture();
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		const rect = canvasHost.getBoundingClientRect();
		const factor = Math.exp(Math.max(-180, Math.min(180, event.deltaY)) * 0.0017);
		viewport = zoomViewport(
			viewport,
			event.clientX - rect.left,
			event.clientY - rect.top,
			stageWidth,
			stageHeight,
			factor
		);
		status = factor < 1 ? 'Zoomed in around the pointer.' : 'Zoomed out around the pointer.';
		redraw();
	}

	function handleKeydown(event: KeyboardEvent) {
		const panStep = event.shiftKey ? 80 : 36;
		if (event.key === 'ArrowLeft') {
			viewport = panViewport(viewport, panStep, 0, stageWidth, stageHeight);
		} else if (event.key === 'ArrowRight') {
			viewport = panViewport(viewport, -panStep, 0, stageWidth, stageHeight);
		} else if (event.key === 'ArrowUp') {
			viewport = panViewport(viewport, 0, panStep, stageWidth, stageHeight);
		} else if (event.key === 'ArrowDown') {
			viewport = panViewport(viewport, 0, -panStep, stageWidth, stageHeight);
		} else if (event.key === '+' || event.key === '=') {
			zoomBy(0.72);
			event.preventDefault();
			return;
		} else if (event.key === '-') {
			zoomBy(1.38);
			event.preventDefault();
			return;
		} else if (event.key === '0' || event.key === 'Home') {
			resetView();
			event.preventDefault();
			return;
		} else {
			return;
		}
		event.preventDefault();
		status = 'View moved with the keyboard.';
		redraw();
	}

	function updatePointerReadout(x: number, y: number) {
		const visible = viewportBounds(viewport, stageWidth, stageHeight);
		const real = visible.minRe + (x / stageWidth) * (visible.maxRe - visible.minRe);
		const imaginary = visible.maxIm - (y / stageHeight) * (visible.maxIm - visible.minIm);
		const sign = imaginary < 0 ? '−' : '+';
		pointerReadout = `z = ${formatBound(real)} ${sign} ${formatBound(Math.abs(imaginary))}i`;
	}

	onMount(() => {
		mounted = true;
		const query = new URLSearchParams(window.location.search);
		if (query.get('webgl') === 'off') {
			renderState = 'fallback';
			status = 'WebGL is disabled. Showing the static identity-map fallback.';
			return;
		}

		try {
			renderer = new DomainColoringRenderer(canvas);
			renderer.setExpression(activeExpression);
			renderState = 'ready';
			status = 'Identity map ready. Drag to pan; scroll or pinch to zoom.';
			resizeObserver = new ResizeObserver(resize);
			resizeObserver.observe(canvasHost);
			resize();
		} catch (error) {
			renderState = 'fallback';
			status =
				error instanceof Error
					? `${error.message} Showing a static identity-map fallback.`
					: 'WebGL is unavailable. Showing a static identity-map fallback.';
		}

		const handleContextLost = (event: Event) => {
			event.preventDefault();
			renderState = 'fallback';
			status = 'The graphics context was lost. Showing the static fallback.';
		};
		canvas.addEventListener('webglcontextlost', handleContextLost);

		return () => {
			mounted = false;
			resizeObserver?.disconnect();
			canvas.removeEventListener('webglcontextlost', handleContextLost);
			renderer?.destroy();
			renderer = null;
			activePointers.clear();
		};
	});
</script>

<section
	bind:this={laboratory}
	class="domain-lab article-breakout not-prose"
	aria-labelledby={`${uid}-heading`}
>
	<header class="lab-header">
		<div>
			<p class="lab-kicker">Interactive · Complex analysis</p>
			<h2 id={`${uid}-heading`}>Domain-colouring explorer</h2>
			<p class="lab-subtitle">Every point z becomes the colour of f(z).</p>
		</div>
		<p class="lab-status" aria-live="polite">{status}</p>
	</header>

	<div class="function-panel">
		<form
			class="function-form"
			onsubmit={(event) => {
				event.preventDefault();
				applyFunction();
			}}
		>
			<label for={`${uid}-function`}>Complex function <span>f(z) =</span></label>
			<div class="function-row">
				<input
					id={`${uid}-function`}
					type="text"
					bind:value={functionDraft}
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					aria-describedby={`${uid}-syntax ${expressionError ? `${uid}-error` : ''}`}
				/>
				<button type="submit">Draw function</button>
			</div>
			<p id={`${uid}-syntax`} class="syntax-help">
				Use z, i, + − * / ^, parentheses, exp, log, sin, cos, tan, sqrt, or abs.
			</p>
			{#if expressionError}
				<p id={`${uid}-error`} class="expression-error" role="alert">{expressionError}</p>
			{/if}
		</form>

		<div class="preset-control">
			<label for={`${uid}-preset`}>Illuminating examples</label>
			<select
				id={`${uid}-preset`}
				value={activePresetId ?? 'custom'}
				onchange={(event) => {
					if (event.currentTarget.value !== 'custom') choosePreset(event.currentTarget.value);
				}}
			>
				{#if !activePresetId}<option value="custom">Custom expression</option>{/if}
				{#each DOMAIN_COLORING_PRESETS as preset (preset.id)}
					<option value={preset.id}>{preset.label} · {preset.expression}</option>
				{/each}
			</select>
			<p>{activePreset?.summary ?? 'A safely parsed custom function.'}</p>
		</div>
	</div>

	<div class="canvas-frame">
		<div
			bind:this={canvasHost}
			class="canvas-host"
			role="group"
			aria-label="Interactive domain-colouring plane"
		>
			<img
				src={fallbackPoster}
				alt=""
				class:visible={renderState !== 'ready'}
				class="fallback-poster"
			/>
			<canvas
				bind:this={canvas}
				class:visible={renderState === 'ready'}
				aria-label={currentDescription}
				tabindex="0"
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerEnd}
				onpointercancel={handlePointerEnd}
				onwheel={handleWheel}
				onkeydown={handleKeydown}
			>
				Domain-colouring image for {functionSource}. The explanation and visible range are available
				below.
			</canvas>
			<canvas bind:this={gridCanvas} class="grid-overlay" aria-hidden="true"></canvas>
			<div class="pointer-readout" aria-hidden="true">{pointerReadout}</div>
			{#if !mounted || renderState === 'idle'}
				<div class="loading-state">Preparing the complex plane…</div>
			{/if}
		</div>
	</div>

	<div class="view-toolbar" aria-label="Complex plane view controls">
		<div class="view-actions">
			<button type="button" onclick={() => zoomBy(0.72)} aria-label="Zoom in">Zoom in</button>
			<button type="button" onclick={() => zoomBy(1.38)} aria-label="Zoom out">Zoom out</button>
			<button type="button" onclick={resetView}>Reset view</button>
			<button type="button" onclick={toggleGrid} aria-pressed={gridVisible}>
				{gridVisible ? 'Hide grid' : 'Show grid'}
			</button>
		</div>
		<output class="range-readout" aria-label="Visible complex-plane range">{rangeLabel}</output>
	</div>

	<div class="learning-row">
		<section class="notice-panel" aria-labelledby={`${uid}-notice`}>
			<p class="panel-kicker">What to notice</p>
			<h3 id={`${uid}-notice`}>{activePreset?.notation ?? `f(z) = ${functionSource}`}</h3>
			<p>
				{activePreset?.notice ??
					'Follow the hue around dark zeros and bright poles, then use the repeated contours to compare magnitudes.'}
			</p>
			<p class="branch-note">
				For log, sqrt, and non-integer powers, the explorer uses principal values. A branch cut is a
				consistent choice of branch, not an intrinsic tear in every interpretation.
			</p>
		</section>

		<section class="legend-panel" aria-labelledby={`${uid}-legend`}>
			<p class="panel-kicker">How to read the field</p>
			<h3 id={`${uid}-legend`}>Angle chooses hue; magnitude shapes contours</h3>
			<div class="legend-items">
				<div class="phase-legend">
					<span class="hue-wheel" aria-hidden="true"></span>
					<p><strong>Phase</strong><span>One full hue cycle = one full turn in angle.</span></p>
				</div>
				<div class="magnitude-legend">
					<span aria-hidden="true"></span>
					<p>
						<strong>Magnitude</strong><span>Repeated bands mark powers of two in |f(z)|.</span>
					</p>
				</div>
				<div class="singularity-key">
					<span class="zero-dot" aria-hidden="true"></span>
					<p><strong>Zeros darken</strong><span>Contour rings converge where |f(z)| → 0.</span></p>
				</div>
				<div class="singularity-key">
					<span class="pole-dot" aria-hidden="true"></span>
					<p>
						<strong>Poles brighten</strong><span>Contour rings converge where |f(z)| → ∞.</span>
					</p>
				</div>
			</div>
		</section>
	</div>

	<p class="sr-only" aria-live="polite">{currentDescription}</p>
	<footer class="lab-footer">
		Drag or use arrow keys to pan. Scroll, pinch, or use +/- to zoom. Press 0 or Home to reset. The
		grid and text descriptions preserve structure that colour alone cannot carry.
	</footer>
</section>

<style>
	.domain-lab {
		position: relative;
		width: min(84rem, calc(100vw - 1.5rem));
		transform: translateX(-50%);
		margin: 2.5rem 0;
		overflow: hidden;
		border: 1px solid #273046;
		border-radius: 1rem;
		background: #090d16;
		color: #e9edf5;
		box-shadow: 0 24px 60px -30px rgb(0 0 0 / 0.8);
	}

	.lab-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.75rem 1.5rem;
		border-bottom: 1px solid #242b3d;
		padding: 1rem 1.1rem;
		background: #0c111d;
	}

	.lab-kicker,
	.panel-kicker {
		margin: 0 0 0.18rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.17em;
		text-transform: uppercase;
		color: #67e8f9;
	}

	h2,
	h3 {
		margin: 0;
		color: #fff;
	}

	h2 {
		font-size: 1.35rem;
		font-weight: 800;
	}

	h3 {
		font-size: 1rem;
		line-height: 1.35;
	}

	.lab-subtitle,
	.lab-status,
	.syntax-help,
	.preset-control p,
	.notice-panel p,
	.legend-panel p,
	.lab-footer {
		margin: 0;
		text-align: left;
	}

	.lab-subtitle {
		margin-top: 0.2rem;
		font-size: 0.8rem;
		color: #9ba7bd;
	}

	.lab-status {
		max-width: 32rem;
		font-size: 0.75rem;
		line-height: 1.45;
		color: #aab4c7;
	}

	.function-panel {
		display: grid;
		gap: 1rem;
		border-bottom: 1px solid #242b3d;
		padding: 0.9rem 1rem;
		background: #101624;
	}

	.function-form label,
	.preset-control label {
		display: block;
		margin-bottom: 0.35rem;
		font-size: 0.76rem;
		font-weight: 700;
		color: #dce3ef;
	}

	.function-form label span {
		color: #7dd3fc;
	}

	.function-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.45rem;
	}

	input,
	select,
	button {
		min-height: 2.75rem;
		border: 1px solid #44506a;
		border-radius: 0.5rem;
		background: #0a0f1a;
		color: #f4f7fb;
		font: inherit;
	}

	input,
	select {
		width: 100%;
		padding: 0.55rem 0.7rem;
	}

	input {
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
	}

	button {
		padding: 0.5rem 0.85rem;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
	}

	button:hover {
		border-color: #7dd3fc;
		background: #182238;
	}

	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	canvas:focus-visible {
		outline: 3px solid #fef08a;
		outline-offset: 2px;
	}

	.function-row button {
		border-color: #67e8f9;
		background: #155e75;
	}

	.syntax-help,
	.preset-control p {
		margin-top: 0.38rem;
		font-size: 0.7rem;
		line-height: 1.4;
		color: #8f9bb0;
	}

	.expression-error {
		margin: 0.45rem 0 0;
		font-size: 0.74rem;
		font-weight: 650;
		color: #fda4af;
	}

	.canvas-frame {
		padding: 0;
		background: #05070d;
	}

	.canvas-host {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		min-height: 24rem;
		overflow: hidden;
		background: #05070d;
	}

	canvas,
	.fallback-poster {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
	}

	canvas.visible,
	.fallback-poster.visible {
		opacity: 1;
	}

	canvas {
		touch-action: none;
		cursor: grab;
	}

	canvas:active {
		cursor: grabbing;
	}

	.fallback-poster {
		object-fit: cover;
	}

	.grid-overlay {
		z-index: 2;
		opacity: 1;
		pointer-events: none;
	}

	.pointer-readout {
		position: absolute;
		z-index: 3;
		right: 0.65rem;
		bottom: 0.6rem;
		border: 1px solid rgb(255 255 255 / 0.2);
		border-radius: 0.35rem;
		background: rgb(5 7 13 / 0.78);
		padding: 0.28rem 0.45rem;
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-size: 0.68rem;
		color: #f8fafc;
		pointer-events: none;
		backdrop-filter: blur(6px);
	}

	.loading-state {
		position: absolute;
		inset: 0;
		z-index: 4;
		display: grid;
		place-items: center;
		background: rgb(5 7 13 / 0.72);
		font-size: 0.8rem;
		color: #dbeafe;
	}

	.view-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-top: 1px solid #242b3d;
		border-bottom: 1px solid #242b3d;
		padding: 0.7rem 0.85rem;
		background: #0c111d;
	}

	.view-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.view-actions button {
		min-height: 2.5rem;
	}

	.view-actions button[aria-pressed='true'] {
		border-color: #67e8f9;
		background: #164e63;
	}

	.range-readout {
		font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
		font-size: 0.7rem;
		color: #aab4c7;
	}

	.learning-row {
		display: grid;
		gap: 0.8rem;
		padding: 0.9rem 1rem;
	}

	.notice-panel,
	.legend-panel {
		border: 1px solid #2d364a;
		border-radius: 0.7rem;
		background: #0e1421;
		padding: 0.85rem;
	}

	.notice-panel > p:not(.panel-kicker) {
		margin-top: 0.5rem;
		font-size: 0.78rem;
		line-height: 1.55;
		color: #b3bdce;
	}

	.notice-panel .branch-note {
		color: #8d99ae;
	}

	.legend-items {
		display: grid;
		gap: 0.55rem;
		margin-top: 0.65rem;
	}

	.phase-legend,
	.magnitude-legend,
	.singularity-key {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
	}

	.phase-legend p,
	.magnitude-legend p,
	.singularity-key p {
		display: grid;
		gap: 0.08rem;
		font-size: 0.72rem;
		color: #aab4c7;
	}

	.legend-items strong {
		color: #eef2f7;
	}

	.legend-items p span {
		line-height: 1.35;
	}

	.hue-wheel {
		width: 1.8rem;
		height: 1.8rem;
		border: 2px solid rgb(255 255 255 / 0.35);
		border-radius: 999px;
		background: conic-gradient(#ff3b3b, #fff238, #38ef7d, #35d6ff, #7457ff, #ff43bd, #ff3b3b);
	}

	.magnitude-legend > span {
		width: 1.8rem;
		height: 1.8rem;
		border: 1px solid rgb(255 255 255 / 0.25);
		border-radius: 0.25rem;
		background: repeating-linear-gradient(90deg, #1b2437 0 4px, #d8e0ec 4px 8px);
	}

	.zero-dot,
	.pole-dot {
		width: 1.15rem;
		height: 1.15rem;
		margin-left: 0.32rem;
		border-radius: 999px;
	}

	.zero-dot {
		border: 1px solid #526078;
		background: #02040c;
	}

	.pole-dot {
		border: 1px solid #fff;
		background: #fff3d9;
		box-shadow: 0 0 0.5rem #fff3d9;
	}

	.lab-footer {
		border-top: 1px solid #242b3d;
		padding: 0.75rem 1rem;
		font-size: 0.7rem;
		line-height: 1.5;
		color: #7f8ba1;
	}

	@media (min-width: 780px) {
		.function-panel {
			grid-template-columns: minmax(0, 1.45fr) minmax(16rem, 0.85fr);
			align-items: start;
		}

		.learning-row {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		}

		.legend-items {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (max-width: 640px) {
		.domain-lab {
			width: calc(100vw - 1.5rem);
			border-radius: 0.75rem;
		}

		.lab-header,
		.function-panel,
		.learning-row {
			padding-right: 0.75rem;
			padding-left: 0.75rem;
		}

		.function-row {
			grid-template-columns: 1fr;
		}

		.canvas-host {
			aspect-ratio: 4 / 5;
			min-height: 27rem;
		}

		.view-toolbar {
			align-items: flex-start;
		}

		.view-actions {
			width: 100%;
		}

		.view-actions button {
			flex: 1 1 calc(50% - 0.4rem);
		}

		.range-readout {
			line-height: 1.45;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto;
		}
	}
</style>
