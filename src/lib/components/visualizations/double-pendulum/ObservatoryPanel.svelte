<script module lang="ts">
	export type PlotPoint = { x: number; y: number };
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		phasePoints: PlotPoint[];
		poincarePoints: PlotPoint[];
		energyPoints: PlotPoint[];
		separationPoints: PlotPoint[];
		phaseView: 'theta1-omega1' | 'theta2-omega2' | 'theta1-theta2';
		shadowAvailable: boolean;
		revision: number;
		onphaseview: (view: Props['phaseView']) => void;
		oncopydata: () => void;
		oncapture: (capture: () => HTMLCanvasElement | null) => void;
	};

	let {
		phasePoints,
		poincarePoints,
		energyPoints,
		separationPoints,
		phaseView,
		shadowAvailable,
		revision,
		onphaseview,
		oncopydata,
		oncapture
	}: Props = $props();

	let phaseCanvas: HTMLCanvasElement;
	let poincareCanvas: HTMLCanvasElement;
	let energyCanvas: HTMLCanvasElement;
	let separationCanvas: HTMLCanvasElement;
	let resizeObserver: ResizeObserver | null = null;
	let frame = 0;

	const phaseLabels = $derived(
		phaseView === 'theta1-omega1'
			? ['Upper angle θ₁ (rad)', 'Upper angular velocity ω₁ (rad/s)']
			: phaseView === 'theta2-omega2'
				? ['Lower angle θ₂ (rad)', 'Lower angular velocity ω₂ (rad/s)']
				: ['Upper angle θ₁ (rad)', 'Lower angle θ₂ (rad)']
	);

	let phaseSummary = $derived.by(() => {
		revision.toString();
		return phasePoints.length === 0
			? 'Run the pendulum to collect a trajectory.'
			: `${phasePoints.length.toLocaleString('en')} rolling phase-space samples are visible. The newest point is marked with a diamond.`;
	});
	let poincareSummary = $derived.by(() => {
		revision.toString();
		return poincarePoints.length === 0
			? 'No Poincaré crossings yet.'
			: `${poincarePoints.length.toLocaleString('en')} upward crossings of θ₂ = 0 have been recorded.`;
	});
	let energySummary = $derived.by(() => {
		revision.toString();
		return energyPoints.length === 0
			? 'Run the pendulum to collect an energy-error history.'
			: `Latest relative energy error: ${formatScientific(energyPoints.at(-1)?.y ?? 0)}.`;
	});
	let separationSummary = $derived.by(() => {
		revision.toString();
		return !shadowAvailable
			? 'Enable Shadow Futures to measure separation.'
			: separationPoints.length === 0
				? 'Run Shadow Futures to collect a separation history.'
				: `Latest lower-bob separation: ${formatDistance(separationPoints.at(-1)?.y ?? 0)}.`;
	});

	$effect(() => {
		revision.toString();
		phaseView.toString();
		if (typeof requestAnimationFrame === 'undefined' || !phaseCanvas) return;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(drawAll);
	});

	onMount(() => {
		resizeObserver = new ResizeObserver(() => drawAll());
		for (const canvas of [phaseCanvas, poincareCanvas, energyCanvas, separationCanvas]) {
			resizeObserver.observe(canvas);
		}
		oncapture(captureComposite);
		drawAll();
		return () => {
			cancelAnimationFrame(frame);
			resizeObserver?.disconnect();
			oncapture(() => null);
		};
	});

	function captureComposite() {
		drawAll();
		const sources = [phaseCanvas, poincareCanvas, energyCanvas, separationCanvas].filter(
			(source) => source?.width > 0 && source.height > 0
		);
		if (sources.length !== 4) return null;
		const gap = 24;
		const columnWidth = Math.max(...sources.map((source) => source.width));
		const rowHeight = Math.max(...sources.map((source) => source.height));
		const output = document.createElement('canvas');
		output.width = columnWidth * 2 + gap;
		output.height = rowHeight * 2 + gap;
		const context = output.getContext('2d');
		if (!context) return null;
		context.fillStyle = '#081015';
		context.fillRect(0, 0, output.width, output.height);
		for (let index = 0; index < sources.length; index += 1) {
			const source = sources[index];
			const column = index % 2;
			const row = Math.floor(index / 2);
			context.drawImage(
				source,
				column * (columnWidth + gap) + Math.round((columnWidth - source.width) / 2),
				row * (rowHeight + gap) + Math.round((rowHeight - source.height) / 2)
			);
		}
		return output;
	}

	function stableLogDomain(
		points: PlotPoint[],
		floor: number,
		contextualCeiling: number
	): [number, number] {
		let maximum = contextualCeiling;
		for (const point of points) {
			if (Number.isFinite(point.y) && point.y > maximum) maximum = point.y;
		}
		const expandedCeiling =
			maximum > contextualCeiling ? 10 ** Math.ceil(Math.log10(maximum)) : contextualCeiling;
		return [floor, expandedCeiling];
	}

	function formatScientific(value: number): string {
		if (!Number.isFinite(value)) return 'not finite';
		if (value === 0) return '0';
		return value.toExponential(2);
	}

	function formatDistance(value: number): string {
		if (!Number.isFinite(value)) return 'not finite';
		if (value < 0.001) return `${(value * 1_000_000).toPrecision(3)} µm`;
		if (value < 1) return `${(value * 100).toPrecision(3)} cm`;
		return `${value.toPrecision(3)} m`;
	}

	function prepareCanvas(canvas: HTMLCanvasElement) {
		const width = Math.max(280, canvas.clientWidth);
		const height = Math.max(210, canvas.clientHeight);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const pixelWidth = Math.round(width * dpr);
		const pixelHeight = Math.round(height * dpr);
		if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
			canvas.width = pixelWidth;
			canvas.height = pixelHeight;
		}
		const context = canvas.getContext('2d');
		if (!context) return null;
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		return { context, width, height };
	}

	function drawAll() {
		if (document.hidden) return;
		drawTrace(phaseCanvas, phasePoints, {
			xLabel: phaseLabels[0],
			yLabel: phaseLabels[1],
			fixedX: [-Math.PI, Math.PI],
			fixedY: phaseView === 'theta1-theta2' ? [-Math.PI, Math.PI] : undefined,
			wrappedX: true,
			wrappedY: phaseView === 'theta1-theta2',
			currentMarker: true
		});
		drawTrace(poincareCanvas, poincarePoints, {
			xLabel: 'θ₁ at crossing (rad)',
			yLabel: 'ω₁ at crossing (rad/s)',
			fixedX: [-Math.PI, Math.PI],
			points: true
		});
		drawTrace(energyCanvas, energyPoints, {
			xLabel: 'Simulated time (s)',
			yLabel: 'Relative error',
			logY: true,
			fixedY: stableLogDomain(energyPoints, 1e-14, 1e-2)
		});
		drawTrace(separationCanvas, shadowAvailable ? separationPoints : [], {
			xLabel: 'Simulated time (s)',
			yLabel: 'Lower-bob separation (m)',
			logY: true,
			fixedY: stableLogDomain(separationPoints, 1e-9, 1),
			thresholds: [0.001, 0.01, 0.1, 1]
		});
	}

	type DrawOptions = {
		xLabel: string;
		yLabel: string;
		fixedX?: [number, number];
		fixedY?: [number, number];
		logY?: boolean;
		points?: boolean;
		currentMarker?: boolean;
		thresholds?: number[];
		wrappedX?: boolean;
		wrappedY?: boolean;
	};

	function crossesWrappedSeam(
		previous: PlotPoint | undefined,
		point: PlotPoint,
		options: DrawOptions
	) {
		return (
			previous !== undefined &&
			((options.wrappedX && Math.abs(point.x - previous.x) > Math.PI) ||
				(options.wrappedY && Math.abs(point.y - previous.y) > Math.PI))
		);
	}

	function drawTrace(canvas: HTMLCanvasElement, input: PlotPoint[], options: DrawOptions) {
		const prepared = prepareCanvas(canvas);
		if (!prepared) return;
		const { context: ctx, width, height } = prepared;
		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = '#0a1015';
		ctx.fillRect(0, 0, width, height);

		const margin = { left: 48, right: 18, top: 18, bottom: 42 };
		const plotWidth = Math.max(1, width - margin.left - margin.right);
		const plotHeight = Math.max(1, height - margin.top - margin.bottom);
		const points = input.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
		const transformed = options.logY
			? points.map((point) => ({ x: point.x, y: Math.log10(Math.max(1e-16, point.y)) }))
			: points;
		const fixedY = options.fixedY
			? options.logY
				? ([
						Math.log10(Math.max(1e-16, options.fixedY[0])),
						Math.log10(Math.max(1e-16, options.fixedY[1]))
					] as [number, number])
				: options.fixedY
			: undefined;
		const [xMin, xMax] =
			options.fixedX ??
			extent(
				transformed.map((point) => point.x),
				0,
				1
			);
		const [yMin, yMax] =
			fixedY ??
			extent(
				transformed.map((point) => point.y),
				-8,
				0
			);
		const mapX = (value: number) =>
			margin.left + ((value - xMin) / Math.max(1e-12, xMax - xMin)) * plotWidth;
		const mapY = (value: number) =>
			margin.top + (1 - (value - yMin) / Math.max(1e-12, yMax - yMin)) * plotHeight;

		ctx.strokeStyle = '#2a3d46';
		ctx.lineWidth = 1;
		ctx.setLineDash([]);
		for (let index = 0; index <= 4; index += 1) {
			const x = margin.left + (plotWidth * index) / 4;
			const y = margin.top + (plotHeight * index) / 4;
			ctx.beginPath();
			ctx.moveTo(x, margin.top);
			ctx.lineTo(x, margin.top + plotHeight);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(margin.left, y);
			ctx.lineTo(margin.left + plotWidth, y);
			ctx.stroke();
		}

		if (options.thresholds && options.logY) {
			ctx.save();
			ctx.setLineDash([4, 5]);
			ctx.font = '11px ui-monospace, monospace';
			for (const threshold of options.thresholds) {
				const logValue = Math.log10(threshold);
				if (logValue < yMin || logValue > yMax) continue;
				const y = mapY(logValue);
				ctx.strokeStyle = '#7b6850';
				ctx.beginPath();
				ctx.moveTo(margin.left, y);
				ctx.lineTo(margin.left + plotWidth, y);
				ctx.stroke();
				ctx.fillStyle = '#c9b38e';
				ctx.fillText(formatDistance(threshold), margin.left + 4, y - 4);
			}
			ctx.restore();
		}

		let seamBreaks = 0;
		if (transformed.length > 0) {
			ctx.strokeStyle = '#dc7a4f';
			ctx.fillStyle = '#dc7a4f';
			ctx.lineWidth = 1.6;
			ctx.beginPath();
			let previous: PlotPoint | undefined;
			for (let index = 0; index < transformed.length; index += 1) {
				const point = transformed[index];
				const x = mapX(point.x);
				const y = mapY(point.y);
				if (options.points) {
					ctx.moveTo(x + 2.2, y);
					ctx.arc(x, y, 2.2, 0, Math.PI * 2);
				} else if (!previous || crossesWrappedSeam(previous, point, options)) {
					if (previous) seamBreaks += 1;
					ctx.moveTo(x, y);
				} else ctx.lineTo(x, y);
				previous = point;
			}
			if (options.points) ctx.fill();
			else ctx.stroke();
			if (options.currentMarker) {
				const latest = transformed.at(-1)!;
				const x = mapX(latest.x);
				const y = mapY(latest.y);
				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(Math.PI / 4);
				ctx.fillStyle = '#a7dfd1';
				ctx.fillRect(-4, -4, 8, 8);
				ctx.restore();
			}
		}
		canvas.dataset.seamBreaks = String(seamBreaks);
		canvas.dataset.wrappedX = String(Boolean(options.wrappedX));
		canvas.dataset.wrappedY = String(Boolean(options.wrappedY));

		ctx.fillStyle = '#aebfc5';
		ctx.font = '11px ui-monospace, monospace';
		ctx.textAlign = 'center';
		ctx.fillText(options.xLabel, margin.left + plotWidth / 2, height - 10);
		ctx.save();
		ctx.translate(12, margin.top + plotHeight / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText(options.yLabel, 0, 0);
		ctx.restore();
		ctx.textAlign = 'left';
		ctx.fillStyle = '#78909a';
		ctx.fillText(formatTick(xMin), margin.left, height - 27);
		ctx.textAlign = 'right';
		ctx.fillText(formatTick(xMax), margin.left + plotWidth, height - 27);
		ctx.textAlign = 'left';
		ctx.fillText(
			options.logY ? `10^${formatTick(yMax)}` : formatTick(yMax),
			margin.left + 4,
			margin.top + 12
		);
		ctx.fillText(
			options.logY ? `10^${formatTick(yMin)}` : formatTick(yMin),
			margin.left + 4,
			margin.top + plotHeight - 4
		);
	}

	function extent(values: number[], fallbackMin: number, fallbackMax: number): [number, number] {
		if (values.length === 0) return [fallbackMin, fallbackMax];
		let minimum = Math.min(...values);
		let maximum = Math.max(...values);
		if (minimum === maximum) {
			const padding = Math.max(1e-6, Math.abs(minimum) * 0.1, 0.1);
			minimum -= padding;
			maximum += padding;
		}
		const padding = (maximum - minimum) * 0.06;
		return [minimum - padding, maximum + padding];
	}

	function formatTick(value: number) {
		if (!Number.isFinite(value)) return '—';
		if (Math.abs(value) >= 1_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
			return value.toExponential(1);
		}
		return value.toFixed(Math.abs(value) < 10 ? 2 : 0);
	}
</script>

<section class="observatory" aria-labelledby="observatory-title">
	<header class="observatory-header">
		<div>
			<p class="eyebrow">Hidden geometry</p>
			<h3 id="observatory-title">Phase-Space Observatory</h3>
		</div>
		<label>
			<span>Phase portrait</span>
			<select
				value={phaseView}
				onchange={(event) => onphaseview(event.currentTarget.value as Props['phaseView'])}
			>
				<option value="theta1-omega1">θ₁ versus ω₁</option>
				<option value="theta2-omega2">θ₂ versus ω₂</option>
				<option value="theta1-theta2">θ₁ versus θ₂</option>
			</select>
		</label>
	</header>

	<div class="plot-grid">
		<figure>
			<div class="plot-title">
				<strong>Rolling phase portrait</strong><span>Current point ◆</span>
			</div>
			<canvas bind:this={phaseCanvas} aria-label={phaseSummary} data-phase-view={phaseView}
			></canvas>
			<figcaption>{phaseSummary}</figcaption>
		</figure>
		<figure>
			<div class="plot-title"><strong>Poincaré section</strong><span>θ₂ = 0, ω₂ &gt; 0</span></div>
			<canvas bind:this={poincareCanvas} aria-label={poincareSummary}></canvas>
			<figcaption>
				{poincareSummary} The section samples the trajectory whenever it cuts one chosen surface in one
				direction.
			</figcaption>
		</figure>
		<figure>
			<div class="plot-title">
				<strong>Numerical energy ledger</strong><span>Logarithmic scale</span>
			</div>
			<canvas bind:this={energyCanvas} aria-label={energySummary}></canvas>
			<figcaption>{energySummary}</figcaption>
		</figure>
		<figure>
			<div class="plot-title"><strong>Shadow separation</strong><span>Logarithmic scale</span></div>
			<canvas bind:this={separationCanvas} aria-label={separationSummary}></canvas>
			<figcaption>{separationSummary}</figcaption>
		</figure>
	</div>

	<div class="observatory-actions">
		<button type="button" onclick={oncopydata}>Copy sampled chart data</button>
		<p>Rolling buffers retain a bounded sample of the calculation, not every integration step.</p>
	</div>
</section>

<style>
	.observatory {
		border-top: 1px solid var(--dp-line, #33464e);
		background: #0d151a;
		padding: clamp(1rem, 3vw, 1.75rem);
		color: #f4eee4;
	}
	.observatory-header,
	.observatory-actions,
	.plot-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.observatory-header h3,
	.observatory-header p,
	.observatory-actions p,
	figure,
	figcaption {
		margin: 0;
	}
	.observatory-header h3 {
		color: #f4eee4 !important;
		font-size: clamp(1.15rem, 2.4vw, 1.55rem);
		font-weight: 500;
		letter-spacing: -0.02em;
	}
	.eyebrow {
		color: #d88960;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.observatory-header label {
		display: grid;
		gap: 0.3rem;
		min-width: min(100%, 15rem);
		color: #b8c7cc;
		font-size: 0.75rem;
	}
	select,
	button {
		min-height: 2.75rem;
		border: 1px solid #455d67;
		border-radius: 0.45rem;
		background: #132229;
		color: #f4eee4;
		font: inherit;
	}
	select {
		padding: 0.55rem 2rem 0.55rem 0.7rem;
	}
	button {
		cursor: pointer;
		padding: 0.55rem 0.8rem;
	}
	select:focus-visible,
	button:focus-visible {
		outline: 3px solid #a7dfd1;
		outline-offset: 2px;
	}
	.plot-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
		margin: 1rem 0;
	}
	figure {
		min-width: 0;
		border: 1px solid #283d46;
		border-radius: 0.6rem;
		background: #0a1015;
		overflow: hidden;
	}
	.plot-title {
		padding: 0.7rem 0.8rem 0.4rem;
		color: #e9e2d8;
		font-size: 0.78rem;
	}
	.plot-title span {
		color: #91a6ad;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
	}
	canvas {
		display: block;
		width: 100%;
		height: 15rem;
	}
	figcaption {
		min-height: 3.2rem;
		border-top: 1px solid #23353c;
		padding: 0.55rem 0.8rem 0.7rem;
		color: #9eb0b6;
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.observatory-actions p {
		max-width: 48rem;
		color: #91a6ad;
		font-size: 0.72rem;
	}
	@media (max-width: 760px) {
		.plot-grid {
			grid-template-columns: 1fr;
		}
		canvas {
			height: 13.5rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}
</style>
