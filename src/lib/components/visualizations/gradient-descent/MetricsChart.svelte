<script module lang="ts">
	export function nearestMetricIndex(values: readonly number[], target: number): number {
		if (!Number.isFinite(target)) return -1;

		let nearestIndex = -1;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (let index = 0; index < values.length; index += 1) {
			const value = values[index];
			if (!Number.isFinite(value)) continue;
			const distance = Math.abs(value - target);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestIndex = index;
			}
		}
		return nearestIndex;
	}
</script>

<script lang="ts">
	import {
		finitePoint,
		minimumPoint,
		pointX,
		pointY,
		type HistoryRecord,
		type KnownMinimum,
		type PointLike,
		type TerrainRun
	} from './types';

	type Metric = 'loss' | 'gradientNorm' | 'stepNorm' | 'distance';
	type XAxis =
		| 'optimizerUpdates'
		| 'activeGradientComputations'
		| 'activeGradientExamplesProcessed';

	type Props = {
		history?: readonly HistoryRecord[];
		runs?: readonly TerrainRun[];
		selectedStepIndex?: number;
		transitionProgress?: number;
		metric?: Metric;
		/** When supplied, distance means Euclidean distance to the nearest declared minimum. */
		knownMinima?: readonly KnownMinimum[];
		/** Backwards-compatible single target, used only when knownMinima has no valid points. */
		referencePoint?: PointLike | null;
		referenceLabel?: string;
		xAxis?: XAxis;
		logScale?: boolean;
		xDomain?: readonly [minimum: number, maximum: number] | null;
		yDomain?: readonly [minimum: number, maximum: number] | null;
		onselectstep?: (index: number) => void;
	};

	let {
		history = [],
		runs = [],
		selectedStepIndex = -1,
		transitionProgress = 1,
		metric = 'loss',
		knownMinima = [],
		referencePoint = null,
		referenceLabel = 'reference point',
		xAxis = 'optimizerUpdates',
		logScale = true,
		xDomain = null,
		yDomain = null,
		onselectstep = () => undefined
	}: Props = $props();

	const plot = { left: 70, right: 760, top: 24, bottom: 264 } as const;
	const metricLabels: Record<Exclude<Metric, 'distance'>, string> = {
		loss: 'Raw loss',
		gradientNorm: 'Outgoing gradient norm at θ',
		stepNorm: 'Outgoing step norm from θ'
	};
	const seriesStyles = {
		active: { className: 'series-active', dash: '14 4 3 4' },
		gd: { className: 'series-gd', dash: '' },
		momentum: { className: 'series-momentum', dash: '10 6' },
		rmsprop: { className: 'series-rmsprop', dash: '2 5' },
		adam: { className: 'series-adam', dash: '10 5 2 5' }
	} as const;
	let displayedRuns = $derived<readonly TerrainRun[]>(
		runs.length > 0
			? runs
			: [{ id: 'active', label: 'Active optimizer', history, pattern: 'solid', marker: 'diamond' }]
	);
	let selectedRecord = $derived(
		history[
			Math.max(
				0,
				Math.min(history.length - 1, selectedStepIndex < 0 ? history.length - 1 : selectedStepIndex)
			)
		] ?? null
	);
	let lastPointerIndex = -1;

	type DistanceTarget = {
		readonly point: PointLike;
		readonly label?: string;
		readonly source: 'known-minimum' | 'single-reference';
	};

	function resolveDistanceTargets(): readonly DistanceTarget[] {
		const declared = knownMinima
			.map((minimum) => ({
				point: minimumPoint(minimum),
				label: minimum.label,
				source: 'known-minimum' as const
			}))
			.filter(
				(
					target
				): target is {
					point: PointLike;
					label: string | undefined;
					source: 'known-minimum';
				} => target.point !== null && finitePoint(target.point)
			);
		if (declared.length > 0) return declared;
		return referencePoint && finitePoint(referencePoint)
			? [
					{
						point: referencePoint,
						label: referenceLabel.trim() || 'reference point',
						source: 'single-reference'
					}
				]
			: [];
	}

	let distanceTargets = $derived(resolveDistanceTargets());

	function distanceMetricLabel(): string {
		if (distanceTargets.length > 1) return 'Distance to nearest known minimum';
		const target = distanceTargets[0];
		if (!target) return 'Distance to reference point';
		if (target.source === 'known-minimum')
			return `Distance to ${target.label?.trim() || 'known minimum'}`;
		return `Distance to ${target.label?.trim() || 'reference point'}`;
	}

	let activeMetricLabel = $derived(
		metric === 'distance' ? distanceMetricLabel() : metricLabels[metric]
	);

	function xValue(record: HistoryRecord): number {
		if (xAxis === 'optimizerUpdates') return record.optimizerUpdates ?? record.iteration;
		if (xAxis === 'activeGradientExamplesProcessed') {
			return record.activeGradientExamplesProcessed ?? 0;
		}
		return record.activeGradientComputations ?? record.gradientEvaluations;
	}

	function xAxisLabel(): string {
		if (xAxis === 'optimizerUpdates') return 'Optimizer updates';
		if (xAxis === 'activeGradientExamplesProcessed')
			return 'Active-gradient examples processed';
		return 'Active-gradient computations';
	}

	function scalarValue(record: HistoryRecord): number | null {
		if (metric === 'distance') {
			let nearest = Number.POSITIVE_INFINITY;
			for (const target of distanceTargets) {
				const value = Math.hypot(
					pointX(record.theta) - pointX(target.point),
					pointY(record.theta) - pointY(target.point)
				);
				if (Number.isFinite(value)) nearest = Math.min(nearest, value);
			}
			return Number.isFinite(nearest) ? nearest : null;
		}
		const value = metric === 'loss' ? record.loss : record[metric];
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	/**
	 * History row t stores diagnostics for the incoming transition to θ_t. The
	 * microscope is centred on θ_t and shows the transition out of it, so shift
	 * transition metrics one row forward here to keep the shared cursor honest.
	 */
	function yValueAt(records: readonly HistoryRecord[], index: number): number | null {
		const record = records[index];
		if (!record) return null;
		if (metric === 'loss' || metric === 'distance') return scalarValue(record);

		const outgoing = records[index + 1];
		if (metric === 'gradientNorm') {
			const value = outgoing?.gradientNorm ?? record.terminalEvaluation?.gradientNorm ?? null;
			return typeof value === 'number' && Number.isFinite(value) ? value : null;
		}
		const value = outgoing?.stepNorm ?? null;
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function seriesStyle(run: TerrainRun) {
		if (run.id === 'active') return seriesStyles.active;
		if (run.id === 'gd') return seriesStyles.gd;
		if (run.id === 'momentum') return seriesStyles.momentum;
		if (run.id === 'rmsprop') return seriesStyles.rmsprop;
		if (run.id === 'adam') return seriesStyles.adam;
		return seriesStyles.active;
	}

	function shiftForLogScale(): number {
		if (!logScale || metric !== 'loss') return 0;
		let minimum = yDomain?.[0] ?? Number.POSITIVE_INFINITY;
		for (const run of displayedRuns) {
			for (const record of run.history) minimum = Math.min(minimum, record.loss);
		}
		return Number.isFinite(minimum) && minimum <= 0 ? -minimum + 1e-12 : 0;
	}

	let logShift = $derived(shiftForLogScale());

	function transformY(value: number): number {
		return logScale ? Math.log10(Math.max(value + logShift, 1e-16)) : value;
	}

	function bounds() {
		let xMin = xDomain?.[0] ?? Number.POSITIVE_INFINITY;
		let xMax = xDomain?.[1] ?? Number.NEGATIVE_INFINITY;
		let yMin = Number.POSITIVE_INFINITY;
		let yMax = Number.NEGATIVE_INFINITY;
		if (yDomain && yDomain[1] > yDomain[0]) {
			yMin = transformY(yDomain[0]);
			yMax = transformY(yDomain[1]);
		}
		for (const run of displayedRuns) {
			for (let index = 0; index < run.history.length; index += 1) {
				const record = run.history[index];
				const x = xValue(record);
				const y = yValueAt(run.history, index);
				if (!Number.isFinite(x) || y === null) continue;
				if (!xDomain) {
					xMin = Math.min(xMin, x);
					xMax = Math.max(xMax, x);
				}
				const transformed = transformY(y);
				if (!yDomain) {
					yMin = Math.min(yMin, transformed);
					yMax = Math.max(yMax, transformed);
				}
			}
		}
		if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) [xMin, xMax] = [0, 1];
		if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) [yMin, yMax] = [0, 1];
		if (xMin === xMax) xMax = xMin + 1;
		if (yMin === yMax) {
			const padding = Math.max(1, Math.abs(yMin) * 0.1);
			yMin -= padding;
			yMax += padding;
		}
		const yPadding = (yMax - yMin) * 0.08;
		return { xMin, xMax, yMin: yMin - yPadding, yMax: yMax + yPadding };
	}

	let chartBounds = $derived(bounds());

	function sx(value: number): number {
		return (
			plot.left +
			((value - chartBounds.xMin) / Math.max(Number.EPSILON, chartBounds.xMax - chartBounds.xMin)) *
				(plot.right - plot.left)
		);
	}

	function sy(value: number): number {
		const transformed = transformY(value);
		return (
			plot.bottom -
			((transformed - chartBounds.yMin) /
				Math.max(Number.EPSILON, chartBounds.yMax - chartBounds.yMin)) *
				(plot.bottom - plot.top)
		);
	}

	function path(records: readonly HistoryRecord[]): string {
		let output = '';
		let drawing = false;
		for (let index = 0; index < records.length; index += 1) {
			const record = records[index];
			const x = xValue(record);
			const y = yValueAt(records, index);
			if (!Number.isFinite(x) || y === null) {
				drawing = false;
				continue;
			}
			output += `${drawing ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)} `;
			drawing = true;
		}
		return output.trim();
	}

	function format(value: number | null | undefined): string {
		if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
		if (value !== 0 && (Math.abs(value) >= 10_000 || Math.abs(value) < 0.001)) {
			return value.toExponential(3);
		}
		return value.toLocaleString('en-IN', { maximumFractionDigits: 5 });
	}

	function tickValue(fraction: number): number {
		const transformed = chartBounds.yMax - fraction * (chartBounds.yMax - chartBounds.yMin);
		return logScale ? 10 ** transformed - logShift : transformed;
	}

	function selectStep(index: number, source: 'keyboard' | 'pointer'): void {
		if (!Number.isSafeInteger(index) || index < 0 || index >= history.length) return;
		if (source === 'keyboard') lastPointerIndex = -1;
		onselectstep(index);
	}

	function selectedChanged(event: Event): void {
		selectStep(Number((event.currentTarget as HTMLInputElement).value), 'keyboard');
	}

	function selectNearestFromPointer(event: PointerEvent): void {
		const target = event.currentTarget as SVGRectElement;
		const svg = target.ownerSVGElement;
		if (!svg) return;
		const bounds = svg.getBoundingClientRect();
		if (!(bounds.width > 0)) return;

		const viewBoxX = ((event.clientX - bounds.left) / bounds.width) * 790;
		const plotFraction = Math.max(
			0,
			Math.min(1, (viewBoxX - plot.left) / (plot.right - plot.left))
		);
		const metricX =
			chartBounds.xMin + plotFraction * Math.max(0, chartBounds.xMax - chartBounds.xMin);
		const index = nearestMetricIndex(history.map(xValue), metricX);
		if (index < 0 || index === lastPointerIndex) return;

		lastPointerIndex = index;
		selectStep(index, 'pointer');
	}

	function selectionPosition(): { x: number; y: number | null } | null {
		if (!selectedRecord) return null;
		const index = history.indexOf(selectedRecord);
		const selectedY = yValueAt(history, index);
		const progress = Math.max(0, Math.min(1, transitionProgress));
		if (index < 1 || index !== history.length - 1 || progress >= 1) {
			const selectedX = Math.max(
				chartBounds.xMin,
				Math.min(chartBounds.xMax, xValue(selectedRecord))
			);
			return { x: sx(selectedX), y: selectedY === null ? null : sy(selectedY) };
		}
		const previous = history[index - 1];
		const previousY = yValueAt(history, index - 1);
		const interpolatedX = xValue(previous) + (xValue(selectedRecord) - xValue(previous)) * progress;
		const x = sx(Math.max(chartBounds.xMin, Math.min(chartBounds.xMax, interpolatedX)));
		if (previousY === null || selectedY === null) return { x, y: null };
		return {
			x,
			y: sy(previousY) + (sy(selectedY) - sy(previousY)) * progress
		};
	}

	let selectedPosition = $derived(selectionPosition());

	function comparisonValues(): readonly { label: string; value: number | null }[] {
		if (runs.length === 0 || !selectedRecord) return [];
		const targetX = xValue(selectedRecord);
		return runs.map((run) => {
			const index = nearestMetricIndex(run.history.map(xValue), targetX);
			return {
				label: run.label,
				value: index < 0 ? null : yValueAt(run.history, index)
			};
		});
	}

	let comparedValues = $derived(comparisonValues());
</script>

<section
	class="metrics-chart"
	data-testid="gradient-metrics-chart"
	aria-labelledby="gradient-metrics-heading"
>
	<header>
		<div>
			<p class="eyebrow">Convergence instrument</p>
			<h3 id="gradient-metrics-heading">{activeMetricLabel}</h3>
		</div>
		{#if selectedRecord}
			<p id="gradient-metrics-selected-readout" class="selected-readout">
				{runs.length > 0 ? 'active-run cursor' : `step ${selectedRecord.iteration}`} · {activeMetricLabel.toLowerCase()}
				<strong>{format(yValueAt(history, history.indexOf(selectedRecord)))}</strong>
			</p>
		{/if}
	</header>
	{#if comparedValues.length > 0}
		<dl class="comparison-values" aria-label="Race values nearest the comparison cursor">
			{#each comparedValues as entry (entry.label)}
				<div>
					<dt>{entry.label}</dt>
					<dd>{format(entry.value)}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	<div class="legend" aria-label="Optimizer series">
		{#each displayedRuns as run (run.id)}
			<span>
				<svg class="legend-line" viewBox="0 0 30 8" aria-hidden="true">
					<line
						class={seriesStyle(run).className}
						x1="1"
						x2="29"
						y1="4"
						y2="4"
						stroke-dasharray={seriesStyle(run).dash}
					/>
				</svg>
				{run.label}
			</span>
		{/each}
	</div>

	<p class="mobile-chart-note">Swipe or use Shift + mouse wheel to inspect the full chart.</p>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (A labelled native scroll region must be focusable.) -->
	<div
		class="chart-viewport"
		tabindex="0"
		role="region"
		aria-label="Horizontally scrollable metric chart"
	>
		<svg viewBox="0 0 790 310" role="img" aria-labelledby="metrics-svg-title metrics-svg-desc">
			<title id="metrics-svg-title">{activeMetricLabel} by {xAxisLabel().toLowerCase()}</title
			>
			<desc id="metrics-svg-desc">
				{displayedRuns.length} optimizer {displayedRuns.length === 1 ? 'path' : 'paths'} compared on the
				{runs.length > 0
					? 'race’s disclosed shared horizontal budget; the active run supplies only the vertical inspection cursor and is not a fifth race curve.'
					: 'active run’s horizontal budget.'}
				{logScale
					? logShift > 0
						? `The vertical axis is log base ten after adding a disclosed shift of ${format(logShift)} so non-positive raw loss remains defined.`
						: 'The vertical axis is log base ten with a tiny epsilon floor at zero.'
					: 'The vertical axis is linear.'}
				{xDomain && yDomain ? ' Both plotted domains remain fixed for this run.' : ''}
				{metric === 'distance'
					? distanceTargets.length > 1
						? ` Each value is the Euclidean distance to the nearest of ${distanceTargets.length} declared minima.`
						: distanceTargets.length === 1
							? ` Each value is the Euclidean distance to the named target ${distanceTargets[0].label ?? 'reference point'}.`
							: ' No valid distance reference is available.'
					: ''}
				{metric === 'gradientNorm' || metric === 'stepNorm'
					? ' Transition diagnostics are aligned with their origin: the value at theta t describes the outgoing transition from theta t to theta t plus one, matching the step microscope. A terminal active-gradient computation may supply the final gradient norm without another optimizer update.'
					: ''}
				{transitionProgress < 1
					? ' The selection diamond is visually interpolated between two exact stored iterations; numeric values remain those of the selected destination.'
					: ''}
			</desc>
			<g class="grid" aria-hidden="true">
				{#each [0, 0.25, 0.5, 0.75, 1] as fraction (fraction)}
					<line
						x1={plot.left}
						x2={plot.right}
						y1={plot.top + fraction * (plot.bottom - plot.top)}
						y2={plot.top + fraction * (plot.bottom - plot.top)}
					/>
					<text
						x={plot.left - 10}
						y={plot.top + fraction * (plot.bottom - plot.top) + 4}
						text-anchor="end"
					>
						{format(tickValue(fraction))}
					</text>
				{/each}
			</g>
			<line class="axis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
			<line class="axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
			<text class="tick" x={plot.left} y={plot.bottom + 22}>{format(chartBounds.xMin)}</text>
			<text class="tick" x={plot.right} y={plot.bottom + 22} text-anchor="end"
				>{format(chartBounds.xMax)}</text
			>
			<text class="axis-label" x={(plot.left + plot.right) / 2} y="306" text-anchor="middle">
				{xAxisLabel()}
			</text>
			<text
				class="axis-label"
				x="14"
				y={(plot.top + plot.bottom) / 2}
				text-anchor="middle"
				transform={`rotate(-90 14 ${(plot.top + plot.bottom) / 2})`}
			>
				{activeMetricLabel}{logScale
					? logShift > 0
						? ` · log₁₀(value + ${format(logShift)})`
						: ' · log₁₀(value with ε floor)'
					: ''}
			</text>
			{#each displayedRuns as run (run.id)}
				<path
					class={`metric-line ${seriesStyle(run).className}`}
					d={path(run.history)}
					stroke-dasharray={seriesStyle(run).dash}
				/>
			{/each}
			{#if selectedPosition}
				<line
					class="selection-line"
					x1={selectedPosition.x}
					x2={selectedPosition.x}
					y1={plot.top}
					y2={plot.bottom}
				/>
				{#if runs.length === 0 && selectedPosition.y !== null}
					<path
						class="selection-marker"
						d={`M${selectedPosition.x},${selectedPosition.y - 6} l6,6 -6,6 -6,-6 z`}
					/>
				{/if}
			{/if}
			<rect
				class="plot-hit-target"
				data-testid="gradient-metrics-hit-target"
				x={plot.left}
				y={plot.top}
				width={plot.right - plot.left}
				height={plot.bottom - plot.top}
				fill="transparent"
				aria-hidden="true"
				onpointerenter={selectNearestFromPointer}
				onpointermove={selectNearestFromPointer}
				onpointerdown={selectNearestFromPointer}
				onpointerleave={() => (lastPointerIndex = -1)}
			/>
		</svg>
	</div>

	{#if history.length > 1}
		<label class="scrubber-label" for="gradient-metric-scrubber">
			Inspect step <strong>{selectedRecord?.iteration ?? 0}</strong>
		</label>
		<input
			id="gradient-metric-scrubber"
			class="scrubber"
			type="range"
			min="0"
			max={history.length - 1}
			step="1"
			aria-describedby="gradient-metrics-selected-readout"
			aria-valuetext={`Iteration ${selectedRecord?.iteration ?? 0}`}
			value={Math.max(
				0,
				Math.min(history.length - 1, selectedStepIndex < 0 ? history.length - 1 : selectedStepIndex)
			)}
			oninput={selectedChanged}
		/>
	{/if}

	<details>
		<summary>Recent numeric values</summary>
		<div class="table-wrap">
			<table>
				<thead><tr><th>Step</th><th>{xAxisLabel()}</th><th>{activeMetricLabel}</th></tr></thead>
				<tbody>
					{#each history.slice(-12) as record (record.iteration)}
						<tr>
							<td>{record.iteration}</td>
							<td>{xValue(record)}</td>
							<td>{format(yValueAt(history, history.indexOf(record)))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<style>
	.metrics-chart {
		min-width: 0;
		border-top: 1px solid #3c423e;
		background: #111514;
		padding: 1rem;
		color: #e8e1d4;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0 0 0.2rem;
		color: #c79a52;
		font: 700 0.64rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		font: 720 1rem/1.25 var(--font-sans, sans-serif);
	}

	.selected-readout {
		margin: 0;
		color: #aaa498;
		font: 0.7rem/1.4 var(--font-mono, monospace);
		text-align: right;
	}

	.selected-readout strong {
		display: block;
		color: #f0e8d9;
		font-size: 0.88rem;
	}

	.comparison-values {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.45rem;
		margin: 0.7rem 0 0;
	}

	.comparison-values div {
		min-width: 0;
		border-left: 2px solid #4d5651;
		padding-left: 0.45rem;
	}

	.comparison-values dt,
	.comparison-values dd {
		overflow: hidden;
		margin: 0;
		font: 0.64rem/1.35 var(--font-mono, monospace);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.comparison-values dt {
		color: #aaa498;
	}

	.comparison-values dd {
		color: #f0e8d9;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem 1rem;
		margin-top: 0.75rem;
		color: #bbb4a7;
		font: 0.68rem/1.3 var(--font-mono, monospace);
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.legend-line {
		display: block;
		width: 1.7rem;
		height: 0.5rem;
		margin: 0;
		overflow: visible;
	}

	.legend-line line {
		stroke-width: 2.4;
		vector-effect: non-scaling-stroke;
	}

	.chart-viewport {
		max-width: 100%;
		overflow-x: auto;
		overscroll-behavior-inline: contain;
	}

	.chart-viewport:focus-visible {
		outline: 2px solid #c79a52;
		outline-offset: 2px;
	}

	.chart-viewport > svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 25rem;
		margin-top: 0.5rem;
		overflow: visible;
	}

	.grid line,
	.axis {
		stroke: #3d4440;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.axis {
		stroke: #8d8b82;
	}

	.grid text,
	.tick,
	.axis-label {
		fill: #aaa498;
		font:
			10px ui-monospace,
			monospace;
	}

	.metric-line {
		fill: none;
		stroke-width: 2.4;
		vector-effect: non-scaling-stroke;
	}

	.series-active {
		color: #f1eadb;
		stroke: #f1eadb;
	}

	.series-gd {
		color: #e7bd68;
		stroke: #e7bd68;
	}

	.series-momentum {
		color: #75b9b0;
		stroke: #75b9b0;
	}

	.series-rmsprop {
		color: #d78b6c;
		stroke: #d78b6c;
	}

	.series-adam {
		color: #b69bd3;
		stroke: #b69bd3;
	}

	.mobile-chart-note {
		display: none;
		margin: 0.5rem 0 0;
		color: #aaa498;
		font: 0.68rem/1.4 var(--font-mono, monospace);
	}

	.selection-line {
		stroke: #e8e1d4;
		stroke-width: 1;
		stroke-dasharray: 3 4;
		opacity: 0.48;
		vector-effect: non-scaling-stroke;
	}

	.selection-marker {
		fill: #f1eadb;
		stroke: #111514;
		stroke-width: 1.4;
		vector-effect: non-scaling-stroke;
	}

	.plot-hit-target {
		pointer-events: all;
		cursor: crosshair;
	}

	.scrubber-label {
		display: flex;
		justify-content: space-between;
		color: #aaa498;
		font: 0.7rem/1.3 var(--font-mono, monospace);
	}

	.scrubber-label strong {
		color: #e8e1d4;
	}

	.scrubber {
		width: 100%;
		min-height: 2.5rem;
		accent-color: #c79a52;
	}

	details {
		border-top: 1px solid #343a37;
		padding-top: 0.55rem;
		color: #c9c2b5;
		font-size: 0.75rem;
	}

	summary {
		min-height: 2.75rem;
		cursor: pointer;
		font-weight: 700;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font: 0.7rem/1.35 var(--font-mono, monospace);
	}

	th,
	td {
		border-bottom: 1px solid #343a37;
		padding: 0.35rem;
		text-align: right;
	}

	th:first-child,
	td:first-child {
		text-align: left;
	}

	@media (max-width: 40rem) {
		.metrics-chart {
			padding-inline: 0.55rem;
		}

		header {
			display: block;
		}

		.selected-readout {
			margin-top: 0.45rem;
			text-align: left;
		}

		.mobile-chart-note {
			display: block;
		}

		.chart-viewport > svg {
			width: 42rem;
			max-width: none;
		}
	}

	@media (forced-colors: active) {
		.metrics-chart {
			background: Canvas;
			color: CanvasText;
		}

		.metric-line,
		.axis,
		.grid line,
		.selection-line,
		.selection-marker {
			stroke: CanvasText;
		}
	}
</style>
