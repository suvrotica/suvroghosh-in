<script lang="ts">
	import type {
		ComplexValue,
		DecimalComplexValue,
		PrecisionMode
	} from '$lib/visualizations/fractal-atlas/types';
	import { floatCoordinateGridCollapses } from '$lib/visualizations/fractal-atlas/render/quality';
	import type { WebGLPrecisionDiagnostics } from '$lib/visualizations/fractal-atlas/render/webgl';
	import { doubleSingleCoordinateGridCollapses } from '$lib/visualizations/fractal-atlas/precision/double-single';

	type Props = {
		center: ComplexValue;
		centerDecimal?: DecimalComplexValue;
		spanY: number;
		canvasWidth: number;
		renderer: string;
		mode: PrecisionMode;
		rotation?: number;
		canvasHeight?: number;
		devicePixelRatio?: number;
		maxIterations?: number;
		diagnostics?: WebGLPrecisionDiagnostics | null;
	};

	let {
		center,
		centerDecimal,
		spanY,
		canvasWidth,
		renderer,
		mode,
		rotation = 0,
		canvasHeight = canvasWidth,
		devicePixelRatio = 1,
		maxIterations = 0,
		diagnostics = null
	}: Props = $props();

	let unitsPerPixel = $derived(spanY / Math.max(1, canvasHeight));
	let unitsPerDevicePixel = $derived(
		diagnostics?.pixelScale ?? unitsPerPixel / Math.max(1, devicePixelRatio)
	);
	let viewWidth = $derived(spanY * (canvasWidth / Math.max(1, canvasHeight)));
	let effectiveRenderHeight = $derived(
		Math.max(1, Math.round(spanY / Math.max(Number.MIN_VALUE, unitsPerDevicePixel)))
	);
	let effectiveRenderWidth = $derived(
		Math.max(1, Math.round(effectiveRenderHeight * (canvasWidth / Math.max(1, canvasHeight))))
	);
	let activeTier = $derived(
		diagnostics?.tier ??
			(renderer !== 'webgl2'
				? 'cpu-double'
				: mode === 'float'
					? 'gpu-float'
					: mode === 'double-single'
						? 'double-single'
						: mode === 'perturbation'
							? 'perturbation'
							: 'gpu-float')
	);
	let usesGpuFloat = $derived(activeTier === 'gpu-float');
	let gpuGridCollapsed = $derived(
		floatCoordinateGridCollapses(center.re, center.im, spanY, rotation, canvasHeight)
	);
	let doubleSingleGridCollapsed = $derived(
		doubleSingleCoordinateGridCollapses(center.re, center.im, spanY, rotation, canvasHeight)
	);
	let jsNeighboursDistinct = $derived(
		center.re + unitsPerPixel !== center.re || center.im + unitsPerPixel !== center.im
	);
	let distinguishable = $derived(
		diagnostics?.neighboursDistinct ??
			(activeTier === 'gpu-float'
				? !gpuGridCollapsed
				: activeTier === 'double-single'
					? !doubleSingleGridCollapsed
					: activeTier === 'perturbation'
						? unitsPerDevicePixel >= 1e-37
						: jsNeighboursDistinct)
	);
	let relativeScale = $derived(
		unitsPerPixel / Math.max(1, Math.abs(center.re), Math.abs(center.im))
	);
	let activeRelativeScale = $derived(
		activeTier === 'perturbation'
			? unitsPerDevicePixel / Math.max(Number.MIN_VALUE, Math.abs(spanY))
			: relativeScale
	);
	let arithmeticEpsilon = $derived(
		activeTier === 'gpu-float'
			? 2 ** -23
			: activeTier === 'double-single'
				? 2 ** -44
				: activeTier === 'perturbation'
					? 2 ** -23
					: Number.EPSILON
	);
	let condition = $derived(
		!distinguishable || activeRelativeScale < arithmeticEpsilon
			? 'Precision exhausted'
			: activeRelativeScale < arithmeticEpsilon * 64
				? 'Approaching limit'
				: 'Comfortable'
	);
	let magnification = $derived(2.8 / Math.max(spanY, Number.MIN_VALUE));
	let estimatedDigits = $derived(
		diagnostics?.estimatedDecimalDigits ??
			(activeTier === 'double-single' ? 14 : activeTier === 'cpu-double' ? 16 : 7)
	);
	let coordinateDigits = $derived(
		Math.max(0, Math.ceil(-Math.log10(Math.max(Number.MIN_VALUE, unitsPerDevicePixel))))
	);
	let tierLabel = $derived(
		diagnostics?.label ??
			(activeTier === 'gpu-float'
				? 'GPU float'
				: activeTier === 'double-single'
					? 'Extended double-single'
					: activeTier === 'perturbation'
						? 'Perturbation'
						: 'CPU double')
	);

	function scientific(value: number) {
		return Number.isFinite(value) ? value.toExponential(4) : 'not finite';
	}
</script>

<section class="precision" aria-labelledby="precision-meter-heading">
	<div class="meter-heading">
		<div>
			<p>Precision meter</p>
			<h3 id="precision-meter-heading">{condition}</h3>
		</div>
		<span
			class:warning={condition === 'Approaching limit'}
			class:danger={condition === 'Precision exhausted'}
		>
			{distinguishable ? 'neighbours distinct' : 'coordinate collapse'}
		</span>
	</div>
	<div class="bar" aria-hidden="true">
		<i
			style:width={condition === 'Comfortable'
				? '34%'
				: condition === 'Approaching limit'
					? '70%'
					: '100%'}
		></i>
	</div>
	<dl>
		<div>
			<dt>Current centre</dt>
			<dd>
				{centerDecimal?.re ?? scientific(center.re)}
				{(centerDecimal?.im ?? center.im.toString()).startsWith('-') ? '−' : '+'}
				{(centerDecimal?.im ?? scientific(Math.abs(center.im))).replace(/^-/, '')}i
			</dd>
		</div>
		<div>
			<dt>View width</dt>
			<dd>{scientific(viewWidth)}</dd>
		</div>
		<div>
			<dt>Approx. zoom</dt>
			<dd>{magnification.toLocaleString('en', { maximumFractionDigits: 1 })}×</dd>
		</div>
		<div>
			<dt>Vertical span</dt>
			<dd>{scientific(spanY)}</dd>
		</div>
		<div>
			<dt>Units / CSS px</dt>
			<dd>{scientific(unitsPerPixel)}</dd>
		</div>
		<div>
			<dt>Units / device px</dt>
			<dd>{scientific(unitsPerDevicePixel)}</dd>
		</div>
		<div>
			<dt>Renderer</dt>
			<dd>{renderer}</dd>
		</div>
		<div>
			<dt>Requested mode</dt>
			<dd>{mode}</dd>
		</div>
		<div>
			<dt>Active precision tier</dt>
			<dd>{tierLabel}</dd>
		</div>
		<div>
			<dt>Estimated digits</dt>
			<dd>{estimatedDigits} arithmetic · {coordinateDigits} coordinate</dd>
		</div>
		<div>
			<dt>Maximum iterations</dt>
			<dd>{maxIterations > 0 ? maxIterations.toLocaleString() : 'not supplied'}</dd>
		</div>
		<div>
			<dt>Neighbouring pixels</dt>
			<dd>{distinguishable ? 'distinct in the active tier' : 'merged / collapsed'}</dd>
		</div>
		<div>
			<dt>Reference orbit</dt>
			<dd>
				{diagnostics?.referencePending
					? 'calculating'
					: diagnostics?.referencePrecisionDigits
						? `${diagnostics.referencePrecisionDigits} worker digits · ≈${diagnostics.referenceUploadDigits ?? 14} GPU coefficient digits`
						: 'not used'}
			</dd>
		</div>
		<div>
			<dt>Rebased</dt>
			<dd>{diagnostics?.rebased ? 'yes, tiled references' : 'no'}</dd>
		</div>
		<div>
			<dt>Glitch diagnostics</dt>
			<dd>
				{diagnostics
					? `${diagnostics.glitchesDetected} / ${diagnostics.diagnosticSamples} sampled`
					: 'not available'}
			</dd>
		</div>
		<div>
			<dt>Relative cost</dt>
			<dd>{diagnostics?.increasedRenderCost ?? (usesGpuFloat ? 'baseline' : 'increased')}</dd>
		</div>
	</dl>
	<p>
		The mathematical object has indefinitely small structure. This estimate uses the active renderer
		in a {Math.round(canvasWidth)} × {Math.round(canvasHeight)} CSS-pixel viewport and an effective
		{effectiveRenderWidth} × {effectiveRenderHeight} sample grid; more iterations do not repair merged
		coordinates.
	</p>
</section>

<style>
	.precision {
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 0.45rem;
		background: var(--atlas-panel, #11131b);
		padding: 0.85rem;
		color: var(--atlas-text, #f0ece3);
	}

	.meter-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.7rem;
	}

	.meter-heading p {
		margin: 0;
		color: var(--atlas-brass, #d1a65d);
		font: 700 0.62rem/1.2 var(--font-sans);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0.25rem 0 0;
		font: 750 1rem/1.2 var(--font-sans);
	}

	.meter-heading span {
		border: 1px solid #4b7b68;
		border-radius: 999px;
		padding: 0.28rem 0.45rem;
		color: #9cd5bb;
		font: 0.58rem/1.2 var(--font-mono);
		white-space: nowrap;
	}

	.meter-heading span.warning {
		border-color: #8c6f36;
		color: #e0bd70;
	}

	.meter-heading span.danger {
		border-color: #995348;
		color: #f19b8b;
	}

	.bar {
		height: 0.34rem;
		margin: 0.7rem 0;
		overflow: hidden;
		border-radius: 999px;
		background: #292b35;
	}

	.bar i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #66b694, #d6aa5e 70%, #d96958);
	}

	dl {
		display: grid;
		gap: 0.3rem;
		margin: 0;
		font: 0.65rem/1.35 var(--font-mono);
	}

	dl div {
		display: grid;
		grid-template-columns: 8.5rem minmax(0, 1fr);
		gap: 0.6rem;
	}

	dt {
		color: var(--atlas-muted, #aaa6b5);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
		text-align: right;
	}

	.precision > p {
		margin: 0.7rem 0 0;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.67rem/1.45 var(--font-sans);
	}
</style>
