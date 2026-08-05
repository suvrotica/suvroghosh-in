<script lang="ts">
	import { contourLevels, marchingSquares } from './marching-squares';
	import {
		clampPoint,
		domainBounds,
		finitePoint,
		objectPoint,
		pointX,
		pointY,
		type DomainLike,
		type HistoryRecord,
		type ObjectPoint,
		type PointLike,
		type RegressionDatum,
		type SampledGrid
	} from './types';

	type Props = {
		points: readonly RegressionDatum[];
		theta: PointLike;
		parameterDomain: DomainLike;
		grid?: SampledGrid | null;
		history?: readonly HistoryRecord[];
		optimum?: PointLike | null;
		parameterLabels?: readonly [string, string];
		outlierEnabled?: boolean;
		onoutliertoggle?: (enabled: boolean) => void;
		onthetachange?: (theta: ObjectPoint) => void;
	};

	let {
		points,
		theta,
		parameterDomain,
		grid = null,
		history = [],
		optimum = null,
		parameterLabels = ['m', 'b'],
		outlierEnabled = true,
		onoutliertoggle = () => undefined,
		onthetachange = () => undefined
	}: Props = $props();

	let scatterSvg: SVGSVGElement;
	let landscapeSvg: SVGSVGElement;
	let scatterControl: HTMLButtonElement;
	let landscapeControl: HTMLButtonElement;
	let dragMode: 'idle' | 'translate-line' | 'left-handle' | 'right-handle' | 'parameter' = 'idle';
	let dragPointer = -1;
	let dragStartY = 0;
	let dragTheta: ObjectPoint = { x: 0, y: 0 };
	let previewTheta = $state<ObjectPoint | null>(null);
	let status = $state(
		'Drag either endpoint to rotate the line, or drag the line to change its intercept.'
	);
	let liveStatus = $state('');

	const dataPlot = { left: 48, right: 410, top: 24, bottom: 250 } as const;
	const parameterPlot = { left: 54, right: 412, top: 24, bottom: 250 } as const;

	let visiblePoints = $derived(points.filter((point) => !point.isOutlier || outlierEnabled));
	let hasOutlier = $derived(points.some((point) => point.isOutlier));
	let displayTheta = $derived(previewTheta ?? theta);

	function dataBounds() {
		let xMin = Number.POSITIVE_INFINITY;
		let xMax = Number.NEGATIVE_INFINITY;
		let yMin = Number.POSITIVE_INFINITY;
		let yMax = Number.NEGATIVE_INFINITY;
		for (const point of visiblePoints) {
			xMin = Math.min(xMin, point.x);
			xMax = Math.max(xMax, point.x);
			yMin = Math.min(yMin, point.y);
			yMax = Math.max(yMax, point.y);
		}
		if (!Number.isFinite(xMin)) [xMin, xMax, yMin, yMax] = [-1, 1, -1, 1];
		if (xMin === xMax) [xMin, xMax] = [xMin - 1, xMax + 1];
		if (yMin === yMax) [yMin, yMax] = [yMin - 1, yMax + 1];
		const lineLeft = pointX(displayTheta) * xMin + pointY(displayTheta);
		const lineRight = pointX(displayTheta) * xMax + pointY(displayTheta);
		yMin = Math.min(yMin, lineLeft, lineRight);
		yMax = Math.max(yMax, lineLeft, lineRight);
		const xPadding = (xMax - xMin) * 0.08;
		const yPadding = (yMax - yMin) * 0.12;
		return {
			xMin: xMin - xPadding,
			xMax: xMax + xPadding,
			yMin: yMin - yPadding,
			yMax: yMax + yPadding
		};
	}

	let dataRange = $derived(dataBounds());
	let parameterRange = $derived(domainBounds(parameterDomain));

	function dataX(value: number): number {
		return (
			dataPlot.left +
			((value - dataRange.xMin) / (dataRange.xMax - dataRange.xMin)) *
				(dataPlot.right - dataPlot.left)
		);
	}

	function dataY(value: number): number {
		return (
			dataPlot.bottom -
			((value - dataRange.yMin) / (dataRange.yMax - dataRange.yMin)) *
				(dataPlot.bottom - dataPlot.top)
		);
	}

	function dataYValue(pixel: number): number {
		return (
			dataRange.yMax -
			((pixel - dataPlot.top) / (dataPlot.bottom - dataPlot.top)) *
				(dataRange.yMax - dataRange.yMin)
		);
	}

	function parameterX(value: number): number {
		return (
			parameterPlot.left +
			((value - parameterRange.xMin) / (parameterRange.xMax - parameterRange.xMin)) *
				(parameterPlot.right - parameterPlot.left)
		);
	}

	function parameterY(value: number): number {
		return (
			parameterPlot.bottom -
			((value - parameterRange.yMin) / (parameterRange.yMax - parameterRange.yMin)) *
				(parameterPlot.bottom - parameterPlot.top)
		);
	}

	function lineY(x: number): number {
		return pointX(displayTheta) * x + pointY(displayTheta);
	}

	function format(value: number): string {
		if (!Number.isFinite(value)) return '—';
		if (value !== 0 && (Math.abs(value) >= 10_000 || Math.abs(value) < 0.001))
			return value.toExponential(3);
		return value.toLocaleString('en-IN', { maximumFractionDigits: 4 });
	}

	function meanSquaredError(): number {
		if (visiblePoints.length === 0) return Number.NaN;
		let sum = 0;
		for (const point of visiblePoints) {
			const residual = lineY(point.x) - point.y;
			sum += residual * residual;
		}
		return sum / visiblePoints.length;
	}

	let mse = $derived(meanSquaredError());

	function parameterFromEvent(event: PointerEvent): ObjectPoint {
		const rectangle = landscapeSvg.getBoundingClientRect();
		const x = ((event.clientX - rectangle.left) / rectangle.width) * 440;
		const y = ((event.clientY - rectangle.top) / rectangle.height) * 280;
		return clampPoint(
			{
				x:
					parameterRange.xMin +
					((x - parameterPlot.left) / (parameterPlot.right - parameterPlot.left)) *
						(parameterRange.xMax - parameterRange.xMin),
				y:
					parameterRange.yMax -
					((y - parameterPlot.top) / (parameterPlot.bottom - parameterPlot.top)) *
						(parameterRange.yMax - parameterRange.yMin)
			},
			parameterDomain
		);
	}

	function scatterCoordinates(event: PointerEvent): ObjectPoint {
		const rectangle = scatterSvg.getBoundingClientRect();
		return {
			x: ((event.clientX - rectangle.left) / rectangle.width) * 440,
			y: ((event.clientY - rectangle.top) / rectangle.height) * 280
		};
	}

	function beginLineDrag(event: PointerEvent): void {
		if (event.button !== 0) return;
		scatterControl.focus();
		const position = scatterCoordinates(event);
		const leftHandle = { x: dataX(dataRange.xMin), y: dataY(lineY(dataRange.xMin)) };
		const rightHandle = { x: dataX(dataRange.xMax), y: dataY(lineY(dataRange.xMax)) };
		if (Math.hypot(position.x - leftHandle.x, position.y - leftHandle.y) < 18)
			dragMode = 'left-handle';
		else if (Math.hypot(position.x - rightHandle.x, position.y - rightHandle.y) < 18)
			dragMode = 'right-handle';
		else dragMode = 'translate-line';
		dragPointer = event.pointerId;
		dragStartY = position.y;
		dragTheta = objectPoint(displayTheta);
		previewTheta = dragTheta;
		scatterSvg.setPointerCapture(event.pointerId);
	}

	function moveLine(event: PointerEvent): void {
		if (event.pointerId !== dragPointer || dragMode === 'idle' || dragMode === 'parameter') return;
		const position = scatterCoordinates(event);
		let next: ObjectPoint;
		if (dragMode === 'translate-line') {
			const worldDelta = dataYValue(position.y) - dataYValue(dragStartY);
			next = { x: dragTheta.x, y: dragTheta.y + worldDelta };
		} else if (dragMode === 'left-handle') {
			const leftX = dataRange.xMin;
			const rightX = dataRange.xMax;
			const rightY = dragTheta.x * rightX + dragTheta.y;
			const leftY = dataYValue(position.y);
			const slope = (rightY - leftY) / Math.max(Number.EPSILON, rightX - leftX);
			next = { x: slope, y: leftY - slope * leftX };
		} else {
			const leftX = dataRange.xMin;
			const rightX = dataRange.xMax;
			const leftY = dragTheta.x * leftX + dragTheta.y;
			const rightY = dataYValue(position.y);
			const slope = (rightY - leftY) / Math.max(Number.EPSILON, rightX - leftX);
			next = { x: slope, y: leftY - slope * leftX };
		}
		next = clampPoint(next, parameterDomain);
		previewTheta = next;
		status = `Regression line set to ${parameterLabels[0]} ${format(next.x)}, ${parameterLabels[1]} ${format(next.y)}.`;
	}

	function beginParameterDrag(event: PointerEvent): void {
		if (event.button !== 0) return;
		landscapeControl.focus();
		dragMode = 'parameter';
		dragPointer = event.pointerId;
		previewTheta = objectPoint(displayTheta);
		landscapeSvg.setPointerCapture(event.pointerId);
		moveParameter(event);
	}

	function moveParameter(event: PointerEvent): void {
		if (dragMode !== 'parameter' || event.pointerId !== dragPointer) return;
		const next = parameterFromEvent(event);
		previewTheta = next;
		status = `Parameter point ${parameterLabels[0]} ${format(next.x)}, ${parameterLabels[1]} ${format(next.y)}.`;
	}

	function endDrag(event: PointerEvent, commit = true): void {
		if (event.pointerId !== dragPointer) return;
		if (scatterSvg?.hasPointerCapture(event.pointerId))
			scatterSvg.releasePointerCapture(event.pointerId);
		if (landscapeSvg?.hasPointerCapture(event.pointerId))
			landscapeSvg.releasePointerCapture(event.pointerId);
		if (commit && previewTheta) {
			onthetachange(previewTheta);
			liveStatus = status;
		}
		previewTheta = null;
		dragMode = 'idle';
		dragPointer = -1;
	}

	function keyboardParameters(event: KeyboardEvent, source: 'line' | 'parameter'): void {
		const scale = event.shiftKey ? 0.01 : 0.035;
		const slopeStep = (parameterRange.xMax - parameterRange.xMin) * scale;
		const interceptStep = (parameterRange.yMax - parameterRange.yMin) * scale;
		let next = { x: pointX(displayTheta), y: pointY(displayTheta) };
		if (event.key === 'ArrowLeft') next.x -= slopeStep;
		else if (event.key === 'ArrowRight') next.x += slopeStep;
		else if (event.key === 'ArrowUp') next.y += interceptStep;
		else if (event.key === 'ArrowDown') next.y -= interceptStep;
		else return;
		event.preventDefault();
		next = clampPoint(next, parameterDomain);
		onthetachange(next);
		status = `${source === 'line' ? 'Regression line' : 'Parameter point'} set to ${parameterLabels[0]} ${format(next.x)}, ${parameterLabels[1]} ${format(next.y)}.`;
		liveStatus = status;
	}

	function contourPath() {
		if (!grid) return '';
		return marchingSquares(grid, contourLevels(grid, 11))
			.map((segment) => {
				const fromX =
					parameterPlot.left +
					(segment.from[0] / Math.max(1, grid.width - 1)) *
						(parameterPlot.right - parameterPlot.left);
				const fromY =
					parameterPlot.bottom -
					(segment.from[1] / Math.max(1, grid.height - 1)) *
						(parameterPlot.bottom - parameterPlot.top);
				const toX =
					parameterPlot.left +
					(segment.to[0] / Math.max(1, grid.width - 1)) *
						(parameterPlot.right - parameterPlot.left);
				const toY =
					parameterPlot.bottom -
					(segment.to[1] / Math.max(1, grid.height - 1)) *
						(parameterPlot.bottom - parameterPlot.top);
				return `M${fromX.toFixed(2)},${fromY.toFixed(2)}L${toX.toFixed(2)},${toY.toFixed(2)}`;
			})
			.join('');
	}

	let contours = $derived(contourPath());

	function historyPath(): string {
		return history
			.filter((record) => finitePoint(record.theta))
			.map(
				(record, index) =>
					`${index === 0 ? 'M' : 'L'}${parameterX(pointX(record.theta)).toFixed(2)},${parameterY(pointY(record.theta)).toFixed(2)}`
			)
			.join(' ');
	}
</script>

<section
	class="regression-lab"
	data-testid="gradient-regression-landscape"
	aria-labelledby="regression-heading"
>
	<header>
		<div>
			<p class="eyebrow">Regression as terrain</p>
			<h3 id="regression-heading">One line, two parameters, one quadratic loss surface</h3>
		</div>
		<p class="mse">MSE <strong>{format(mse)}</strong></p>
	</header>

	{#if hasOutlier}
		<label class="outlier-toggle">
			<input
				type="checkbox"
				checked={outlierEnabled}
				onchange={(event) => onoutliertoggle(event.currentTarget.checked)}
			/>
			Include the controlled outlier
		</label>
	{/if}

	<div class="regression-grid">
		<div class="panel">
			<h4>Data space</h4>
			<button
				type="button"
				bind:this={scatterControl}
				class="plot-interaction"
				aria-label="Interactive regression line. Drag an endpoint to rotate the line, drag its middle to change the intercept, or use the arrow keys."
				onpointerdown={beginLineDrag}
				onpointermove={moveLine}
				onpointerup={endDrag}
				onpointercancel={(event) => endDrag(event, false)}
				onkeydown={(event) => keyboardParameters(event, 'line')}
			>
				<svg
					bind:this={scatterSvg}
					viewBox="0 0 440 280"
					role="img"
					aria-labelledby="regression-data-title regression-data-desc"
				>
					<title id="regression-data-title"
						>Regression data, residuals, and current fitted line</title
					>
					<desc id="regression-data-desc">
						Drag an endpoint to rotate the line or drag the line to change its intercept. Arrow Left
						and Right adjust slope; Arrow Up and Down adjust intercept.
					</desc>
					<line
						class="axis"
						x1={dataPlot.left}
						x2={dataPlot.right}
						y1={dataPlot.bottom}
						y2={dataPlot.bottom}
					/>
					<line
						class="axis"
						x1={dataPlot.left}
						x2={dataPlot.left}
						y1={dataPlot.top}
						y2={dataPlot.bottom}
					/>
					{#each visiblePoints as point (point.id ?? `${point.x}-${point.y}`)}
						<line
							class="residual"
							x1={dataX(point.x)}
							x2={dataX(point.x)}
							y1={dataY(point.y)}
							y2={dataY(lineY(point.x))}
						/>
					{/each}
					<line
						class="touch-line-target"
						x1={dataX(dataRange.xMin)}
						x2={dataX(dataRange.xMax)}
						y1={dataY(lineY(dataRange.xMin))}
						y2={dataY(lineY(dataRange.xMax))}
					/>
					<line
						class="regression-line"
						x1={dataX(dataRange.xMin)}
						x2={dataX(dataRange.xMax)}
						y1={dataY(lineY(dataRange.xMin))}
						y2={dataY(lineY(dataRange.xMax))}
					/>
					<circle
						class="touch-point-target"
						cx={dataX(dataRange.xMin)}
						cy={dataY(lineY(dataRange.xMin))}
						r="18"
					/>
					<circle
						class="line-handle touch-drag-handle"
						cx={dataX(dataRange.xMin)}
						cy={dataY(lineY(dataRange.xMin))}
						r="7"
					/>
					<circle
						class="touch-point-target"
						cx={dataX(dataRange.xMax)}
						cy={dataY(lineY(dataRange.xMax))}
						r="18"
					/>
					<circle
						class="line-handle touch-drag-handle"
						cx={dataX(dataRange.xMax)}
						cy={dataY(lineY(dataRange.xMax))}
						r="7"
					/>
					{#each visiblePoints as point (point.id ?? `${point.x}-${point.y}`)}
						<circle
							class:outlier={point.isOutlier}
							class="datum"
							cx={dataX(point.x)}
							cy={dataY(point.y)}
							r={point.isOutlier ? 5.6 : 4.3}
						/>
					{/each}
					<text
						class="axis-label"
						x={(dataPlot.left + dataPlot.right) / 2}
						y="275"
						text-anchor="middle">x</text
					>
					<text
						class="axis-label"
						x="14"
						y={(dataPlot.top + dataPlot.bottom) / 2}
						transform="rotate(-90 14 137)"
						text-anchor="middle">y</text
					>
				</svg>
			</button>
		</div>

		<div class="panel">
			<h4>Parameter space</h4>
			<button
				type="button"
				bind:this={landscapeControl}
				class="plot-interaction"
				aria-label="Interactive parameter landscape. Drag to change slope and intercept together, or use the arrow keys."
				onpointerdown={beginParameterDrag}
				onpointermove={moveParameter}
				onpointerup={endDrag}
				onpointercancel={(event) => endDrag(event, false)}
				onkeydown={(event) => keyboardParameters(event, 'parameter')}
			>
				<svg
					bind:this={landscapeSvg}
					viewBox="0 0 440 280"
					role="img"
					aria-labelledby="regression-parameter-title regression-parameter-desc"
				>
					<title id="regression-parameter-title"
						>Mean-squared-error contour landscape over slope and intercept</title
					>
					<desc id="regression-parameter-desc">
						Drag the parameter marker to update the regression line. The optimizer path is drawn
						through the same parameter coordinates.
					</desc>
					<rect
						class="parameter-field"
						x={parameterPlot.left}
						y={parameterPlot.top}
						width={parameterPlot.right - parameterPlot.left}
						height={parameterPlot.bottom - parameterPlot.top}
					/>
					<path class="contours" d={contours} />
					<line
						class="axis"
						x1={parameterPlot.left}
						x2={parameterPlot.right}
						y1={parameterPlot.bottom}
						y2={parameterPlot.bottom}
					/>
					<line
						class="axis"
						x1={parameterPlot.left}
						x2={parameterPlot.left}
						y1={parameterPlot.top}
						y2={parameterPlot.bottom}
					/>
					<path class="optimizer-path" d={historyPath()} />
					{#if optimum && finitePoint(optimum)}
						<g
							class="optimum"
							transform={`translate(${parameterX(pointX(optimum))} ${parameterY(pointY(optimum))})`}
						>
							<circle r="6" /><path d="M-9,0H9M0,-9V9" />
						</g>
					{/if}
					<path
						class="parameter-marker"
						d={`M${parameterX(pointX(displayTheta))},${parameterY(pointY(displayTheta)) - 7} l7,7 -7,7 -7,-7 z`}
					/>
					<circle
						class="touch-point-target"
						cx={parameterX(pointX(displayTheta))}
						cy={parameterY(pointY(displayTheta))}
						r="20"
					/>
					<text
						class="axis-label"
						x={(parameterPlot.left + parameterPlot.right) / 2}
						y="275"
						text-anchor="middle">{parameterLabels[0]} · slope</text
					>
					<text
						class="axis-label"
						x="14"
						y={(parameterPlot.top + parameterPlot.bottom) / 2}
						transform="rotate(-90 14 137)"
						text-anchor="middle">{parameterLabels[1]} · intercept</text
					>
				</svg>
			</button>
		</div>
	</div>

	<p class="status">{status}</p>
	<p class="sr-only" aria-live="polite" aria-atomic="true">{liveStatus}</p>
	<dl class="parameter-readout">
		<div>
			<dt>{parameterLabels[0]} · slope</dt>
			<dd>{format(pointX(displayTheta))}</dd>
		</div>
		<div>
			<dt>{parameterLabels[1]} · intercept</dt>
			<dd>{format(pointY(displayTheta))}</dd>
		</div>
		<div>
			<dt>Raw mean squared error</dt>
			<dd>{format(mse)}</dd>
		</div>
	</dl>
</section>

<style>
	.regression-lab {
		min-width: 0;
		border-top: 1px solid #414641;
		background: #121615;
		padding: clamp(0.85rem, 2vw, 1.25rem);
		color: #e9e2d5;
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

	h3,
	h4 {
		margin: 0;
		font-family: var(--font-sans, sans-serif);
	}

	h3 {
		font-size: 1rem;
	}

	h4 {
		font-size: 0.78rem;
	}

	.mse {
		margin: 0;
		color: #aaa498;
		font: 0.68rem/1.4 var(--font-mono, monospace);
		text-align: right;
	}

	.mse strong {
		display: block;
		color: #f0e8d9;
		font-size: 0.9rem;
	}

	.outlier-toggle {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		color: #c9c2b5;
		font-size: 0.76rem;
		cursor: pointer;
	}

	.outlier-toggle input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: #c79a52;
	}

	.regression-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin-top: 0.7rem;
	}

	.panel {
		min-width: 0;
	}

	.plot-interaction {
		display: block;
		width: 100%;
		border: 0;
		padding: 0;
		margin-top: 0.4rem;
		background: transparent;
		color: inherit;
		touch-action: pan-y pinch-zoom;
		cursor: crosshair;
	}

	.touch-line-target,
	.touch-point-target,
	.touch-drag-handle {
		touch-action: none;
	}

	.touch-line-target {
		fill: none;
		stroke: transparent;
		stroke-width: 28;
	}

	.touch-point-target {
		fill: transparent;
		stroke: none;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		background: #0c100f;
	}

	.plot-interaction:focus-visible {
		outline: 3px solid #f0cf88;
		outline-offset: 2px;
	}

	.axis {
		stroke: #777b72;
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.axis-label {
		fill: #aaa498;
		font:
			10px ui-monospace,
			monospace;
	}

	.residual {
		stroke: #d78b6c;
		stroke-width: 1.2;
		stroke-dasharray: 3 3;
		opacity: 0.64;
	}

	.regression-line {
		stroke: #e7bd68;
		stroke-width: 2.8;
		vector-effect: non-scaling-stroke;
	}

	.line-handle {
		fill: #e7bd68;
		stroke: #0c100f;
		stroke-width: 2;
	}

	.datum {
		fill: #75b9b0;
		stroke: #0c100f;
		stroke-width: 1.3;
	}

	.datum.outlier {
		fill: #d78b6c;
	}

	.parameter-field {
		fill: #101715;
	}

	.contours {
		fill: none;
		stroke: #bcb5a8;
		stroke-width: 0.8;
		opacity: 0.48;
		vector-effect: non-scaling-stroke;
	}

	.optimizer-path {
		fill: none;
		stroke: #e7bd68;
		stroke-width: 2.4;
		vector-effect: non-scaling-stroke;
	}

	.parameter-marker {
		fill: #f1eadb;
		stroke: #0c100f;
		stroke-width: 1.4;
		vector-effect: non-scaling-stroke;
	}

	.optimum circle,
	.optimum path {
		fill: none;
		stroke: #75b9b0;
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.status {
		min-height: 1.2rem;
		margin: 0.7rem 0 0;
		color: #aaa498;
		font: 0.68rem/1.4 var(--font-mono, monospace);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.parameter-readout {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1px;
		margin: 0.7rem 0 0;
		background: #39403c;
	}

	.parameter-readout div {
		min-width: 0;
		background: #171c1a;
		padding: 0.55rem;
	}

	.parameter-readout dt {
		color: #aaa498;
		font: 0.62rem/1.3 var(--font-mono, monospace);
	}

	.parameter-readout dd {
		overflow: hidden;
		margin: 0.25rem 0 0;
		color: #ece4d7;
		font: 0.78rem/1.25 var(--font-mono, monospace);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 52rem) {
		.regression-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 38rem) {
		header {
			display: block;
		}

		.mse {
			margin-top: 0.45rem;
			text-align: left;
		}

		.parameter-readout {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.regression-lab,
		svg {
			background: Canvas;
			color: CanvasText;
		}

		.axis,
		.residual,
		.regression-line,
		.contours,
		.optimizer-path,
		.parameter-marker,
		.datum,
		.line-handle,
		.optimum circle,
		.optimum path {
			stroke: CanvasText;
		}
	}
</style>
