<script lang="ts">
	import { onMount } from 'svelte';

	type ScatterCase = {
		index: number;
		id: string;
		outcome: 0 | 1;
		squaredLosses: { clinician: number; model: number; ensemble: number };
		probabilities: { clinician: number; model: number; ensemble: number };
	};

	type ErrorMetrics = {
		crossErrorTerm: number;
		correlations: {
			latentResiduals: number | null;
			casewiseSquaredLosses: number | null;
		};
	};

	let {
		cases,
		selectedCaseIndex,
		configuredCorrelation,
		metrics,
		onselect
	}: {
		cases: readonly ScatterCase[];
		selectedCaseIndex: number;
		configuredCorrelation: number;
		metrics: ErrorMetrics;
		onselect?: (caseIndex: number) => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let canvasRegion = $state<HTMLElement>();
	let renderFrame: number | null = null;
	let cssWidth = 720;
	let cssHeight = 460;
	let plottedCases = $derived(cases.slice(0, 600));
	let selected = $derived(cases.find((item) => item.index === selectedCaseIndex) ?? null);

	function format(value: number | null, digits = 3): string {
		return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
	}

	function scheduleRender(): void {
		if (typeof window === 'undefined' || renderFrame !== null) return;
		renderFrame = window.requestAnimationFrame(() => {
			renderFrame = null;
			render();
		});
	}

	function render(): void {
		if (!canvas || typeof window === 'undefined') return;
		const bounds = canvas.getBoundingClientRect();
		if (!(bounds.width > 0 && bounds.height > 0)) return;
		cssWidth = bounds.width;
		cssHeight = bounds.height;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.max(1, Math.round(bounds.width * ratio));
		canvas.height = Math.max(1, Math.round(bounds.height * ratio));
		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, bounds.width, bounds.height);

		const styles = getComputedStyle(canvas);
		const paper = styles.getPropertyValue('--icu-plot-paper').trim() || '#f8f6ef';
		const ink = styles.getPropertyValue('--icu-ink').trim() || '#182028';
		const muted = styles.getPropertyValue('--icu-muted').trim() || '#687078';
		const rule = styles.getPropertyValue('--icu-rule').trim() || '#c8c5bb';
		const clinician = styles.getPropertyValue('--icu-clinician').trim() || '#167a9c';
		const model = styles.getPropertyValue('--icu-model').trim() || '#c46b22';
		const ensemble = styles.getPropertyValue('--icu-ensemble').trim() || '#7554b3';

		context.fillStyle = paper;
		context.fillRect(0, 0, bounds.width, bounds.height);

		const margin = { left: 55, right: 18, top: 30, bottom: 54 };
		const plotWidth = Math.max(1, bounds.width - margin.left - margin.right);
		const plotHeight = Math.max(1, bounds.height - margin.top - margin.bottom);
		const px = (value: number) => margin.left + Math.max(0, Math.min(1, value)) * plotWidth;
		const py = (value: number) => margin.top + (1 - Math.max(0, Math.min(1, value))) * plotHeight;

		context.fillStyle = paper;
		context.strokeStyle = rule;
		context.lineWidth = 1;
		context.fillRect(margin.left, margin.top, plotWidth, plotHeight);
		context.strokeRect(margin.left, margin.top, plotWidth, plotHeight);

		context.font = '12px ui-monospace, monospace';
		context.fillStyle = muted;
		context.textAlign = 'center';
		context.textBaseline = 'top';
		for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
			context.beginPath();
			context.strokeStyle = rule;
			context.moveTo(px(tick), margin.top);
			context.lineTo(px(tick), margin.top + plotHeight);
			context.moveTo(margin.left, py(tick));
			context.lineTo(margin.left + plotWidth, py(tick));
			context.stroke();
			context.fillText(tick.toFixed(2), px(tick), margin.top + plotHeight + 8);
			context.textAlign = 'right';
			context.textBaseline = 'middle';
			context.fillText(tick.toFixed(2), margin.left - 8, py(tick));
			context.textAlign = 'center';
			context.textBaseline = 'top';
		}

		context.save();
		context.setLineDash([8, 5]);
		context.strokeStyle = muted;
		context.lineWidth = 1.7;
		context.beginPath();
		context.moveTo(px(0), py(0));
		context.lineTo(px(1), py(1));
		context.stroke();
		context.restore();

		context.save();
		context.beginPath();
		context.rect(margin.left, margin.top, plotWidth, plotHeight);
		context.clip();
		for (const item of plottedCases) {
			const x = px(item.squaredLosses.clinician);
			const y = py(item.squaredLosses.model);
			context.globalAlpha = 0.42;
			context.fillStyle = item.outcome === 1 ? model : clinician;
			context.beginPath();
			if (item.outcome === 1) context.rect(x - 2.1, y - 2.1, 4.2, 4.2);
			else context.arc(x, y, 2.15, 0, Math.PI * 2);
			context.fill();
		}
		context.restore();
		context.globalAlpha = 1;

		if (selected) {
			const x = px(selected.squaredLosses.clinician);
			const y = py(selected.squaredLosses.model);
			context.strokeStyle = ink;
			context.fillStyle = paper;
			context.lineWidth = 3;
			context.beginPath();
			context.arc(x, y, 7.5, 0, Math.PI * 2);
			context.fill();
			context.stroke();
			context.strokeStyle = ensemble;
			context.lineWidth = 2;
			context.beginPath();
			context.arc(x, y, 4.2, 0, Math.PI * 2);
			context.stroke();
		}

		context.fillStyle = ink;
		context.textAlign = 'center';
		context.textBaseline = 'bottom';
		context.font = '700 12px ui-sans-serif, sans-serif';
		context.fillText('Clinician squared loss', margin.left + plotWidth / 2, bounds.height - 3);
		context.save();
		context.translate(13, margin.top + plotHeight / 2);
		context.rotate(-Math.PI / 2);
		context.fillText('Model squared loss', 0, 0);
		context.restore();

		context.font = '700 12px ui-sans-serif, sans-serif';
		context.textAlign = 'left';
		context.textBaseline = 'top';
		context.fillStyle = muted;
		context.fillText('clinician closer', margin.left + 8, margin.top + 7);
		context.textAlign = 'right';
		context.textBaseline = 'bottom';
		context.fillText('model closer', margin.left + plotWidth - 8, margin.top + plotHeight - 7);
		context.fillStyle = model;
		context.textBaseline = 'top';
		context.fillText('both badly wrong', margin.left + plotWidth - 8, margin.top + 7);
	}

	function inspectPointer(event: MouseEvent): void {
		if (!canvas || !onselect || !plottedCases.length) return;
		const bounds = canvas.getBoundingClientRect();
		const margin = { left: 55, right: 18, top: 30, bottom: 54 };
		const plotWidth = Math.max(1, bounds.width - margin.left - margin.right);
		const plotHeight = Math.max(1, bounds.height - margin.top - margin.bottom);
		const lossX = Math.max(0, Math.min(1, (event.clientX - bounds.left - margin.left) / plotWidth));
		const lossY = Math.max(
			0,
			Math.min(1, 1 - (event.clientY - bounds.top - margin.top) / plotHeight)
		);
		let closest = plottedCases[0];
		let distance = Number.POSITIVE_INFINITY;
		for (const item of plottedCases) {
			const dx = (item.squaredLosses.clinician - lossX) * plotWidth;
			const dy = (item.squaredLosses.model - lossY) * plotHeight;
			const candidate = dx * dx + dy * dy;
			if (candidate < distance) {
				distance = candidate;
				closest = item;
			}
		}
		if (distance <= 22 * 22) onselect(closest.index);
	}

	$effect(() => {
		void plottedCases;
		void selectedCaseIndex;
		scheduleRender();
	});

	onMount(() => {
		const observer = new ResizeObserver(scheduleRender);
		if (canvasRegion) observer.observe(canvasRegion);
		if (canvas) observer.observe(canvas);

		const mutationObserver = new MutationObserver(scheduleRender);
		mutationObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'data-mode']
		});
		mutationObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'data-mode']
		});

		const queries = [
			window.matchMedia('(prefers-color-scheme: dark)'),
			window.matchMedia('(prefers-contrast: more)'),
			window.matchMedia('(forced-colors: active)')
		];
		for (const query of queries) query.addEventListener('change', scheduleRender);
		window.addEventListener('orientationchange', scheduleRender);
		document.addEventListener('fullscreenchange', scheduleRender);
		scheduleRender();

		return () => {
			observer.disconnect();
			mutationObserver.disconnect();
			for (const query of queries) query.removeEventListener('change', scheduleRender);
			window.removeEventListener('orientationchange', scheduleRender);
			document.removeEventListener('fullscreenchange', scheduleRender);
			if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
			renderFrame = null;
		};
	});
</script>

<section class="shared-error" aria-labelledby="icu-shared-error-heading">
	<header>
		<div>
			<p class="eyebrow">ERROR OVERLAP</p>
			<h3 id="icu-shared-error-heading">Where the forecasters miss together</h3>
		</div>
		<p class="sample-note">
			{plottedCases.length} deterministic display cases · full cohort metrics
		</p>
	</header>

	<div class="metric-grid">
		<article>
			<span>Configured latent ρ</span><strong>{configuredCorrelation.toFixed(2)}</strong>
			<small>hidden score residual dependence</small>
		</article>
		<article>
			<span>Realized latent correlation</span><strong
				>{format(metrics.correlations.latentResiduals)}</strong
			>
			<small>generated hidden residuals</small>
		</article>
		<article>
			<span>Squared-loss correlation</span><strong
				>{format(metrics.correlations.casewiseSquaredLosses)}</strong
			>
			<small>casewise evaluated losses</small>
		</article>
		<article>
			<span>Cross-error term, C</span><strong>{metrics.crossErrorTerm.toFixed(4)}</strong>
			<small>mean product of signed forecast errors</small>
		</article>
	</div>

	<figure bind:this={canvasRegion} data-testid="icu-shared-error-canvas">
		<figcaption>
			<span><i class="circle" aria-hidden="true"></i> outcome did not occur</span>
			<span><i class="square" aria-hidden="true"></i> outcome occurred</span>
			<span><i class="selected" aria-hidden="true"></i> selected case</span>
		</figcaption>
		<canvas
			bind:this={canvas}
			width="720"
			height="460"
			tabindex="0"
			aria-label={`Scatterplot of ${plottedCases.length} synthetic cases. Horizontal position is clinician squared loss and vertical position is model squared loss. The diagonal means equal loss; the upper-right means both performed badly. ${selected ? `Selected ${selected.id}: clinician loss ${selected.squaredLosses.clinician.toFixed(4)}, model loss ${selected.squaredLosses.model.toFixed(4)}.` : ''}`}
			onclick={inspectPointer}
		></canvas>
		<p>
			The diagonal marks equal loss. Below it the model is closer; above it the clinician is closer.
			The upper-right contains cases where both forecasts are badly wrong.
		</p>
	</figure>

	<p class="distinction">
		These quantities are not interchangeable. Configured ρ is conditional correlation in the
		simulator’s hidden score noise. Realized latent correlation describes this generated cohort.
		Squared-loss correlation and C describe evaluated forecast errors; binary outcomes mechanically
		push signed probability residuals toward the same sign.
	</p>

	<details>
		<summary>Semantic table for all plotted cases</summary>
		<div class="table-scroll">
			<table>
				<caption>Deterministic cases represented in the shared-error Canvas</caption>
				<thead>
					<tr>
						<th scope="col">Synthetic case</th><th scope="col">Outcome</th><th scope="col"
							>Clinician forecast</th
						><th scope="col">Model forecast</th><th scope="col">Clinician loss</th><th scope="col"
							>Model loss</th
						><th scope="col">Closer forecast</th>
					</tr>
				</thead>
				<tbody>
					{#each plottedCases as item (item.index)}
						<tr class:selected={item.index === selectedCaseIndex}>
							<th scope="row">
								{#if onselect}
									<button type="button" onclick={() => onselect?.(item.index)}>{item.id}</button>
								{:else}
									{item.id}
								{/if}
							</th>
							<td>{item.outcome ? 'Occurred' : 'Did not occur'}</td>
							<td>{(item.probabilities.clinician * 100).toFixed(1)}%</td>
							<td>{(item.probabilities.model * 100).toFixed(1)}%</td>
							<td>{item.squaredLosses.clinician.toFixed(4)}</td>
							<td>{item.squaredLosses.model.toFixed(4)}</td>
							<td>
								{item.squaredLosses.clinician < item.squaredLosses.model
									? 'Clinician'
									: item.squaredLosses.model < item.squaredLosses.clinician
										? 'Model'
										: 'Equal'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>

<style>
	.shared-error {
		display: grid;
		min-width: 0;
		gap: 0.75rem;
	}

	header,
	figcaption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	header p,
	header h3,
	figure,
	figcaption,
	figure p,
	.distinction,
	.sample-note {
		margin: 0;
	}

	.eyebrow {
		color: var(--icu-accent, var(--accent));
		font: 760 0.62rem var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		letter-spacing: 0.09em;
	}

	header h3 {
		margin-top: 0.15rem;
		font: 790 clamp(1rem, 2cqi, 1.25rem)/1.2 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.sample-note {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.63rem var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		text-align: right;
	}

	.metric-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.metric-grid article {
		display: grid;
		min-width: 0;
		gap: 0.12rem;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.45rem;
		background: var(--icu-raised, var(--paper-raised));
		padding: 0.55rem;
	}

	.metric-grid span,
	.metric-grid small {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.61rem/1.3 var(--icu-sans, var(--font-sans, sans-serif));
	}

	.metric-grid strong {
		font: 800 0.96rem var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		font-variant-numeric: tabular-nums;
	}

	.metric-grid small {
		font-size: 0.56rem;
	}

	figure {
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.55rem;
		background: var(--icu-plot-paper, var(--paper));
		padding: 0.55rem;
	}

	figcaption {
		justify-content: flex-start;
		flex-wrap: wrap;
		margin-bottom: 0.45rem;
		color: var(--icu-muted, var(--ink-muted));
		font: 0.62rem/1.2 var(--icu-sans, var(--font-sans, sans-serif));
	}

	figcaption span {
		display: flex;
		align-items: center;
		gap: 0.28rem;
	}

	figcaption i {
		display: block;
		width: 0.55rem;
		height: 0.55rem;
		border: 2px solid var(--icu-clinician);
	}

	figcaption i.circle {
		border-radius: 50%;
	}

	figcaption i.square {
		border-color: var(--icu-model);
	}

	figcaption i.selected {
		border: 3px double var(--icu-ink, var(--ink));
		border-radius: 50%;
	}

	canvas {
		display: block;
		width: 100%;
		height: clamp(18rem, 50cqi, 30rem);
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		background: var(--icu-plot-paper, var(--paper));
		cursor: crosshair;
		touch-action: manipulation;
	}

	canvas:focus-visible,
	:where(summary, button):focus-visible {
		outline: 3px solid var(--icu-focus, var(--focus-ring, var(--accent)));
		outline-offset: 2px;
	}

	figure p,
	.distinction {
		color: var(--icu-muted, var(--ink-muted));
		font: 0.66rem/1.5 var(--icu-sans, var(--font-sans, sans-serif));
	}

	figure p {
		margin-top: 0.45rem;
	}

	.distinction {
		border-left: 3px solid var(--icu-ensemble);
		padding: 0.55rem 0.65rem;
		background: color-mix(in oklab, var(--icu-ensemble) 7%, var(--icu-raised, var(--paper-raised)));
	}

	details {
		min-width: 0;
		border: 1px solid var(--icu-rule, var(--rule));
		border-radius: 0.45rem;
		background: var(--icu-raised, var(--paper-raised));
	}

	summary {
		min-height: 2.75rem;
		padding: 0.7rem;
		font: 740 0.7rem var(--icu-sans, var(--font-sans, sans-serif));
		cursor: pointer;
	}

	.table-scroll {
		max-height: 28rem;
		overflow: auto;
		border-top: 1px solid var(--icu-rule, var(--rule));
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font: 0.62rem/1.35 var(--icu-mono, var(--font-mono, ui-monospace, monospace));
		font-variant-numeric: tabular-nums;
	}

	caption {
		padding: 0.55rem;
		text-align: left;
	}

	th,
	td {
		border-top: 1px solid var(--icu-rule, var(--rule));
		padding: 0.4rem;
		text-align: right;
		white-space: nowrap;
	}

	th:first-child,
	td:first-child,
	th:nth-child(2),
	td:nth-child(2) {
		text-align: left;
	}

	tr.selected {
		background: color-mix(in oklab, var(--icu-ensemble) 10%, transparent);
	}

	table button {
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 0;
		background: transparent;
		padding: 0.25rem;
		color: var(--icu-accent, var(--accent));
		font: inherit;
		font-weight: 750;
		text-decoration: underline;
		cursor: pointer;
	}

	@container icu-lab (max-width: 48rem) {
		.metric-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@container icu-lab (max-width: 32rem) {
		header {
			align-items: flex-start;
			flex-direction: column;
		}

		.sample-note {
			text-align: left;
		}

		.metric-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		canvas {
			height: min(82cqi, 24rem);
		}
	}

	@media (forced-colors: active) {
		.metric-grid article,
		figure,
		canvas,
		details,
		.table-scroll,
		th,
		td {
			border-color: CanvasText;
		}
	}
</style>
