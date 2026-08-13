<script lang="ts">
	import { onMount } from 'svelte';
	import { formatNumber, type ComplexSpectrumView, type SingularView } from './types';

	let {
		matrix,
		rows,
		columns,
		eigen,
		singular,
		spectralRadius = 0,
		highContrast = false
	}: {
		matrix: Float64Array;
		rows: number;
		columns: number;
		eigen?: ComplexSpectrumView;
		singular?: SingularView;
		spectralRadius?: number;
		highContrast?: boolean;
	} = $props();

	let plotHost: HTMLElement;
	let chartWidth = $state(820);
	let trajectoryStep = $state(14);
	let narrowPlot = $derived(chartWidth < 620);
	let geometry = $derived(directionGeometry(chartWidth));
	let leftPlot = $derived(geometry.left);
	let rightPlot = $derived(geometry.right);
	let chartHeight = $derived(geometry.height);
	let leftRect = $derived(panelRect(leftPlot));
	let rightRect = $derived(panelRect(rightPlot));
	let inputCloud = $derived(buildInputCloud(72));
	let projectedCloud = $derived(buildProjectedCloud(inputCloud));
	let cloudScale = $derived(projectedScale());
	let trajectory = $derived(buildTrajectory(20));
	let selectedTrajectory = $derived(
		trajectory[Math.max(0, Math.min(trajectory.length - 1, trajectoryStep))]
	);
	let dominantDirection = $derived(dominantSliceDirection());
	let dynamicsLabel = $derived(classifyDynamics());

	function directionGeometry(width: number) {
		const safeWidth = Math.max(280, Math.min(960, width));
		if (safeWidth < 620) {
			const radius = Math.max(88, Math.min(142, (safeWidth - 72) / 2));
			const left = { cx: safeWidth / 2, cy: radius + 58, radius };
			const right = { cx: safeWidth / 2, cy: left.cy + radius * 2 + 100, radius };
			return { left, right, height: right.cy + radius + 62 };
		}
		const radius = Math.max(116, Math.min(148, safeWidth * 0.18));
		return {
			left: { cx: safeWidth * 0.285, cy: 225, radius },
			right: { cx: safeWidth * 0.715, cy: 225, radius },
			height: 470
		};
	}

	function panelRect(plot: { cx: number; cy: number; radius: number }) {
		return {
			x: plot.cx - plot.radius - 28,
			y: plot.cy - plot.radius - 28,
			width: plot.radius * 2 + 56,
			height: plot.radius * 2 + 56
		};
	}

	function entry(row: number, column: number): number {
		if (row < 0 || column < 0 || row >= rows || column >= columns) return 0;
		const value = matrix[row * columns + column];
		return Number.isFinite(value) ? value : 0;
	}

	function buildInputCloud(count: number): readonly { x: number; y: number }[] {
		return Array.from({ length: count }, (_, index) => {
			const angle = (index / count) * Math.PI * 2;
			return { x: Math.cos(angle), y: Math.sin(angle) };
		});
	}

	function buildProjectedCloud(
		points: readonly { x: number; y: number }[]
	): readonly { x: number; y: number }[] {
		const a = entry(0, 0);
		const b = entry(0, 1);
		const c = entry(1, 0);
		const d = entry(1, 1);
		return points.map((point) => ({ x: a * point.x + b * point.y, y: c * point.x + d * point.y }));
	}

	function projectedScale(): number {
		let extent = 1;
		for (const point of projectedCloud)
			extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
		return leftPlot.radius / (extent * 1.12);
	}

	function inputPath(): string {
		return (
			inputCloud
				.map(
					(point, index) =>
						`${index === 0 ? 'M' : 'L'}${leftPlot.cx + point.x * leftPlot.radius},${leftPlot.cy - point.y * leftPlot.radius}`
				)
				.join(' ') + ' Z'
		);
	}

	function projectedPath(): string {
		return (
			projectedCloud
				.map(
					(point, index) =>
						`${index === 0 ? 'M' : 'L'}${rightPlot.cx + point.x * cloudScale},${rightPlot.cy - point.y * cloudScale}`
				)
				.join(' ') + ' Z'
		);
	}

	function dominantSliceDirection(): { x: number; y: number; gain: number } {
		const a = entry(0, 0);
		const b = entry(0, 1);
		const c = entry(1, 0);
		const d = entry(1, 1);
		const m00 = a * a + c * c;
		const m01 = a * b + c * d;
		const m11 = b * b + d * d;
		const angle = 0.5 * Math.atan2(2 * m01, m00 - m11);
		const x = Math.cos(angle);
		const y = Math.sin(angle);
		return { x, y, gain: Math.hypot(a * x + b * y, c * x + d * y) };
	}

	interface TrajectoryPoint {
		step: number;
		x: number;
		y: number;
		gain: number;
		logMagnitude: number;
	}

	function buildTrajectory(steps: number): readonly TrajectoryPoint[] {
		const dimension = Math.max(1, columns);
		let vector = new Float64Array(dimension);
		vector[0] = 1;
		if (dimension > 1) vector[1] = 0.37;
		let norm = Math.hypot(...Array.from(vector));
		for (let index = 0; index < vector.length; index += 1) vector[index] /= norm || 1;
		let logMagnitude = 0;
		const output: TrajectoryPoint[] = [
			{ step: 0, x: vector[0] ?? 0, y: vector[1] ?? 0, gain: 1, logMagnitude }
		];
		for (let step = 1; step <= steps; step += 1) {
			const next = new Float64Array(rows);
			for (let row = 0; row < rows; row += 1) {
				let sum = 0;
				for (let column = 0; column < columns; column += 1)
					sum += entry(row, column) * (vector[column] ?? 0);
				next[row] = sum;
			}
			norm = Math.hypot(...Array.from(next));
			if (!(norm > 1e-15) || !Number.isFinite(norm)) {
				output.push({ step, x: 0, y: 0, gain: 0, logMagnitude: Number.NEGATIVE_INFINITY });
				break;
			}
			logMagnitude += Math.log(norm);
			vector = new Float64Array(dimension);
			for (let index = 0; index < Math.min(dimension, next.length); index += 1)
				vector[index] = next[index] / norm;
			output.push({
				step,
				x: vector[0] ?? 0,
				y: vector[1] ?? 0,
				gain: norm,
				logMagnitude
			});
		}
		return output;
	}

	function trajectoryPath(): string {
		return trajectory
			.slice(0, trajectoryStep + 1)
			.map(
				(point, index) =>
					`${index === 0 ? 'M' : 'L'}${rightPlot.cx + point.x * rightPlot.radius * 0.82},${rightPlot.cy - point.y * rightPlot.radius * 0.82}`
			)
			.join(' ');
	}

	function classifyDynamics(): string {
		const hasImaginary = eigen ? maxAbs(eigen.imaginary) > 1e-8 : false;
		if (spectralRadius < 0.98)
			return hasImaginary ? 'shrinks while turning' : 'shrinks asymptotically';
		if (spectralRadius > 1.02)
			return hasImaginary
				? 'grows while rotating or oscillating'
				: 'contains an asymptotically growing mode';
		return hasImaginary
			? 'turns near the stability boundary'
			: 'sits near the growth–decay boundary';
	}

	function maxAbs(values: Float64Array): number {
		let result = 0;
		for (const value of values) result = Math.max(result, Math.abs(value));
		return result;
	}

	function projectedMagnitude(): number {
		return Math.hypot(selectedTrajectory?.x ?? 0, selectedTrajectory?.y ?? 0);
	}

	onMount(() => {
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width && width > 0) chartWidth = width;
		});
		if (plotHost) observer.observe(plotHost);
		return () => observer.disconnect();
	});
</script>

<section
	class="direction-machine lens-panel"
	class:high-contrast={highContrast}
	aria-labelledby="direction-machine-heading"
>
	<header class="lens-header">
		<div>
			<p class="eyebrow">LENS 04 · ACTION</p>
			<h3 id="direction-machine-heading">Direction machine</h3>
			<p>
				A labelled two-coordinate projection of an n-dimensional transformation—not the whole space.
			</p>
		</div>
		<div class="dynamics-readout">
			<span>Long-run indication</span><strong>{dynamicsLabel}</strong>
		</div>
	</header>

	<aside class="projection-warning">
		<strong>Projection contract.</strong> The left circle lies in span(e₁,e₂). The right shape plots only
		the first two coordinates of Av. Hidden coordinates can carry substantial energy. The trajectory is
		renormalised after every multiplication so direction remains visible; growth is reported separately.
	</aside>

	<figure bind:this={plotHost} data-export-surface class:narrow={narrowPlot}>
		<svg
			viewBox={`0 0 ${chartWidth} ${chartHeight}`}
			role="img"
			aria-labelledby="direction-title direction-description"
		>
			<title id="direction-title"
				>A matrix transforming a coordinate-plane circle and a repeated direction</title
			>
			<desc id="direction-description"
				>The left panel shows unit directions supported on the first two coordinate axes. The right
				panel shows their first two output coordinates and a normalised repeated-application
				trajectory through step {trajectoryStep}.</desc
			>
			<defs>
				<marker
					id="rm-arrow"
					viewBox="0 0 10 10"
					refX="8"
					refY="5"
					markerWidth="5"
					markerHeight="5"
					orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker
				>
			</defs>
			<rect
				class="plot-background"
				x={leftRect.x}
				y={leftRect.y}
				width={leftRect.width}
				height={leftRect.height}
				rx="6"
			/>
			<rect
				class="plot-background"
				x={rightRect.x}
				y={rightRect.y}
				width={rightRect.width}
				height={rightRect.height}
				rx="6"
			/>
			<g class="axes">
				<line
					x1={leftPlot.cx - leftPlot.radius - 12}
					x2={leftPlot.cx + leftPlot.radius + 12}
					y1={leftPlot.cy}
					y2={leftPlot.cy}
				/>
				<line
					x1={leftPlot.cx}
					x2={leftPlot.cx}
					y1={leftPlot.cy - leftPlot.radius - 12}
					y2={leftPlot.cy + leftPlot.radius + 12}
				/>
				<line
					x1={rightPlot.cx - rightPlot.radius - 12}
					x2={rightPlot.cx + rightPlot.radius + 12}
					y1={rightPlot.cy}
					y2={rightPlot.cy}
				/>
				<line
					x1={rightPlot.cx}
					x2={rightPlot.cx}
					y1={rightPlot.cy - rightPlot.radius - 12}
					y2={rightPlot.cy + rightPlot.radius + 12}
				/>
			</g>
			<path class="input-circle" d={inputPath()} />
			{#each inputCloud.filter((_, index) => index % 6 === 0) as point, index (index)}
				<circle
					class="cloud-point"
					cx={leftPlot.cx + point.x * leftPlot.radius}
					cy={leftPlot.cy - point.y * leftPlot.radius}
					r="3"
				/>
			{/each}
			<line
				class="dominant"
				x1={leftPlot.cx - dominantDirection.x * leftPlot.radius}
				y1={leftPlot.cy + dominantDirection.y * leftPlot.radius}
				x2={leftPlot.cx + dominantDirection.x * leftPlot.radius}
				y2={leftPlot.cy - dominantDirection.y * leftPlot.radius}
			/>
			<path class="output-shape" d={projectedPath()} />
			{#each projectedCloud.filter((_, index) => index % 6 === 0) as point, index (index)}
				<circle
					class="output-point"
					cx={rightPlot.cx + point.x * cloudScale}
					cy={rightPlot.cy - point.y * cloudScale}
					r="3"
				/>
			{/each}
			<path class="trajectory" d={trajectoryPath()} marker-end="url(#rm-arrow)" />
			{#each trajectory.slice(0, trajectoryStep + 1) as point (point.step)}
				<circle
					class="trajectory-point"
					class:selected={point.step === trajectoryStep}
					cx={rightPlot.cx + point.x * rightPlot.radius * 0.82}
					cy={rightPlot.cy - point.y * rightPlot.radius * 0.82}
					r={point.step === trajectoryStep ? 5 : 2.6}
				>
					<title
						>Step {point.step}: projected direction ({formatNumber(point.x, 3)}, {formatNumber(
							point.y,
							3
						)}), one-step gain {formatNumber(point.gain, 3)}</title
					>
				</circle>
			{/each}
			<text
				class="panel-label"
				x={leftPlot.cx}
				y={leftPlot.cy - leftPlot.radius - 38}
				text-anchor="middle">BEFORE · v in span(e₁,e₂)</text
			>
			<text
				class="panel-label"
				x={rightPlot.cx}
				y={rightPlot.cy - rightPlot.radius - 38}
				text-anchor="middle">AFTER · first two coordinates of Av</text
			>
			<text class="axis-label" x={leftPlot.cx + leftPlot.radius + 4} y={leftPlot.cy - 7}>e₁</text>
			<text class="axis-label" x={leftPlot.cx + 7} y={leftPlot.cy - leftPlot.radius + 2}>e₂</text>
			<text class="axis-label" x={rightPlot.cx + rightPlot.radius + 4} y={rightPlot.cy - 7}
				>coord 1</text
			>
			<text class="axis-label" x={rightPlot.cx + 7} y={rightPlot.cy - rightPlot.radius + 2}
				>coord 2</text
			>
			<text
				class="scale-note"
				x={rightPlot.cx}
				y={rightPlot.cy + rightPlot.radius + 40}
				text-anchor="middle"
				>Output fitted independently · slice gain max {formatNumber(
					1 / Math.max(cloudScale / leftPlot.radius, 1e-12),
					4
				)}</text
			>
		</svg>
		<figcaption>
			Orange line: strongest stretching direction within this two-coordinate slice. Blue path:
			normalised power iteration projected to the same two displayed coordinates.
		</figcaption>
	</figure>

	<label class="trajectory-slider">
		<span
			><strong>Repeated application step</strong><output
				>{trajectoryStep} / {Math.max(0, trajectory.length - 1)}</output
			></span
		>
		<input
			type="range"
			min="0"
			max={Math.max(0, trajectory.length - 1)}
			step="1"
			bind:value={trajectoryStep}
		/>
	</label>

	<div class="summary-grid">
		<div>
			<span>Displayed slice gain</span><strong>{formatNumber(dominantDirection.gain, 5)}</strong>
		</div>
		<div>
			<span>Global largest singular value</span><strong
				>{formatNumber(singular?.values[0], 5)}</strong
			>
		</div>
		<div><span>Spectral radius</span><strong>{formatNumber(spectralRadius, 5)}</strong></div>
		<div>
			<span>Step {trajectoryStep} one-step gain</span><strong
				>{formatNumber(selectedTrajectory?.gain, 5)}</strong
			>
		</div>
		<div>
			<span>Projected direction length</span><strong>{formatNumber(projectedMagnitude(), 5)}</strong
			>
		</div>
		<div>
			<span>Cumulative log growth before normalising</span><strong
				>{formatNumber(selectedTrajectory?.logMagnitude, 5)}</strong
			>
		</div>
	</div>

	<p class="interpretation">
		Singular values control the largest one-step stretch. Eigenvalues and the spectral radius
		describe invariant modes and asymptotic growth, but a non-normal matrix can show large transient
		amplification before that long-run story dominates.
	</p>
</section>

<style>
	.lens-header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
	}
	.lens-header p,
	.lens-header h3,
	.projection-warning,
	figure,
	figcaption,
	.interpretation {
		margin: 0;
	}
	.eyebrow {
		color: var(--rm-accent);
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.11em;
	}
	.lens-header h3 {
		margin-top: 0.12rem;
		font-size: clamp(1.1rem, 2vw, 1.45rem);
	}
	.lens-header p:last-child {
		max-width: 50rem;
		margin-top: 0.22rem;
		color: var(--rm-muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.dynamics-readout {
		max-width: 15rem;
		border-left: 1px solid var(--rm-rule);
		padding-left: 0.8rem;
		text-align: right;
	}
	.dynamics-readout span,
	.dynamics-readout strong {
		display: block;
	}
	.dynamics-readout span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
	}
	.dynamics-readout strong {
		margin-top: 0.18rem;
		font-size: 0.78rem;
		line-height: 1.3;
	}
	.projection-warning {
		margin-top: 0.7rem;
		border: 1px solid var(--rm-rule);
		border-left: 4px solid var(--rm-accent);
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--rm-accent) 6%, var(--rm-paper));
		padding: 0.55rem 0.65rem;
		font-size: 0.72rem;
		line-height: 1.48;
	}
	figure {
		margin-top: 0.7rem;
		min-width: 0;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.plot-background {
		fill: var(--rm-plot-paper);
		stroke: var(--rm-rule);
	}
	.axes line {
		stroke: var(--rm-rule);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.input-circle,
	.output-shape {
		fill: color-mix(in srgb, var(--rm-point) 7%, transparent);
		stroke: var(--rm-point);
		stroke-width: 2.2;
		vector-effect: non-scaling-stroke;
	}
	.cloud-point,
	.output-point {
		fill: var(--rm-point);
	}
	.dominant {
		stroke: var(--rm-selected);
		stroke-width: 3;
		stroke-dasharray: 9 5;
		vector-effect: non-scaling-stroke;
	}
	.trajectory {
		fill: none;
		stroke: var(--rm-theory);
		stroke-width: 2.2;
		vector-effect: non-scaling-stroke;
	}
	.trajectory-point {
		fill: var(--rm-theory);
		stroke: var(--rm-plot-paper);
		stroke-width: 1;
	}
	.trajectory-point.selected {
		fill: var(--rm-selected);
		stroke: var(--rm-ink);
		stroke-width: 2;
	}
	#rm-arrow path {
		fill: var(--rm-theory);
	}
	.panel-label,
	.axis-label,
	.scale-note {
		fill: var(--rm-muted);
		font-family: var(--rm-mono);
	}
	.panel-label {
		font-size: 11px;
		font-weight: 750;
		letter-spacing: 0.05em;
	}
	.axis-label,
	.scale-note {
		font-size: 11px;
	}
	figure.narrow .panel-label,
	figure.narrow .axis-label,
	figure.narrow .scale-note {
		font-size: 11px;
	}
	figcaption,
	.interpretation {
		margin-top: 0.4rem;
		color: var(--rm-muted);
		font-size: 0.72rem;
		line-height: 1.48;
	}
	.trajectory-slider {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.7rem;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
		padding: 0.6rem 0.7rem;
	}
	.trajectory-slider span {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		font-size: 0.74rem;
	}
	.trajectory-slider output {
		font-family: var(--rm-mono);
	}
	.trajectory-slider input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--rm-accent);
	}
	.summary-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		margin-top: 0.7rem;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
	}
	.summary-grid > div {
		min-width: 0;
		border-right: 1px solid var(--rm-rule);
		padding: 0.55rem;
	}
	.summary-grid > div:last-child {
		border-right: 0;
	}
	.summary-grid span,
	.summary-grid strong {
		display: block;
	}
	.summary-grid span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		line-height: 1.3;
		text-transform: uppercase;
	}
	.summary-grid strong {
		overflow-wrap: anywhere;
		margin-top: 0.16rem;
		font: 750 0.7rem var(--rm-mono);
	}
	@media (max-width: 58rem) {
		.summary-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.summary-grid > div:nth-child(3) {
			border-right: 0;
		}
		.summary-grid > div:nth-child(-n + 3) {
			border-bottom: 1px solid var(--rm-rule);
		}
	}
	@media (max-width: 34rem) {
		.lens-header {
			flex-direction: column;
		}
		.dynamics-readout {
			max-width: none;
			border-top: 1px solid var(--rm-rule);
			border-left: 0;
			padding-top: 0.45rem;
			padding-left: 0;
			text-align: left;
		}
		.summary-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.summary-grid > div,
		.summary-grid > div:nth-child(3) {
			border-right: 0;
			border-bottom: 1px solid var(--rm-rule);
		}
		.summary-grid > div:last-child {
			border-bottom: 0;
		}
	}
	@media (forced-colors: active) {
		.plot-background,
		.projection-warning,
		.trajectory-slider,
		.summary-grid,
		.summary-grid > div {
			border-color: CanvasText;
		}
		.input-circle,
		.output-shape,
		.dominant,
		.trajectory {
			stroke: CanvasText;
		}
		.cloud-point,
		.output-point,
		.trajectory-point {
			fill: CanvasText;
		}
	}
</style>
