<script lang="ts">
	import { MIN_NULL_SAMPLES_FOR_TAIL_INTERPRETATION } from '$lib/visualizations/random-matrix';
	import {
		formatNumber,
		type ComputePhase,
		type MetricComparisonView,
		type NullEnsembleView,
		type SignalType
	} from './types';

	let {
		signalType,
		signalStrength,
		nullResult,
		phase = 'idle',
		nullDescription,
		onsignalchange = () => undefined,
		onstrengthchange = () => undefined,
		onrun = () => undefined
	}: {
		signalType: SignalType;
		signalStrength: number;
		nullResult?: NullEnsembleView;
		phase?: ComputePhase;
		nullDescription: string;
		onsignalchange?: (signal: SignalType) => void;
		onstrengthchange?: (strength: number, commit: boolean) => void;
		onrun?: () => void;
	} = $props();

	const signals: readonly { id: SignalType; label: string; formula: string }[] = [
		{ id: 'none', label: 'No planted signal', formula: 'A = X' },
		{ id: 'rank-one', label: 'Rank-one spike', formula: 'A = X + αuvᵀ' },
		{ id: 'two-block', label: 'Two-block communities', formula: 'A = X + αB' },
		{ id: 'diagonal-band', label: 'Diagonal band', formula: 'A = X + αD' },
		{ id: 'toeplitz', label: 'Toeplitz-like correlation', formula: 'A = X + αT' },
		{ id: 'sparse-hubs', label: 'Sparse hubs', formula: 'A = X + αH' },
		{ id: 'repeated-motif', label: 'Repeated motif', formula: 'A = X + αM' },
		{ id: 'nonzero-mean', label: 'Nonzero mean', formula: 'A = X + α11ᵀ/n' },
		{ id: 'unequal-row-variance', label: 'Unequal row variance', formula: 'A = S(α)X' }
	];

	let selectedSignal = $derived(signals.find((signal) => signal.id === signalType) ?? signals[0]);
	let busy = $derived(phase === 'loading' || phase === 'working');

	function verdict(metric: MetricComparisonView): string {
		if (
			!nullResult ||
			(metric.validSampleCount ?? 0) < MIN_NULL_SAMPLES_FOR_TAIL_INTERPRETATION ||
			typeof metric.twoSidedPValue !== 'number'
		)
			return 'insufficient ensemble samples';
		if (metric.twoSidedPValue <= 0.05) return 'unusual under this null model';
		return 'ordinary under this null model';
	}

	function verdictClass(metric: MetricComparisonView): string {
		const label = verdict(metric);
		if (label.startsWith('unusual')) return 'unusual';
		if (label.startsWith('ordinary')) return 'ordinary';
		return 'insufficient';
	}

	function percentilePosition(metric: MetricComparisonView): number {
		return Math.max(0, Math.min(100, metric.percentile ?? 50));
	}

	function strengthInput(event: Event, commit: boolean): void {
		onstrengthchange(Number((event.currentTarget as HTMLInputElement).value), commit);
	}
</script>

<section class="structure-detector lens-panel" aria-labelledby="structure-detector-heading">
	<header class="lens-header">
		<div>
			<p class="eyebrow">LENS 05 · NULL COMPARISON</p>
			<h3 id="structure-detector-heading">Structure detector</h3>
			<p>
				Ask whether declared statistics are unusual relative to a declared random ensemble—not
				whether a picture “looks meaningful”.
			</p>
		</div>
		<div class="null-count">
			<span>Null matrices sampled</span><strong
				>{nullResult?.samples.toLocaleString('en-GB') ?? '0'}</strong
			>
		</div>
	</header>

	<div class="detector-layout">
		<div class="signal-console">
			<label>
				<span>Planted structure</span>
				<select
					value={signalType}
					onchange={(event) =>
						onsignalchange((event.currentTarget as HTMLSelectElement).value as SignalType)}
				>
					{#each signals as signal (signal.id)}<option value={signal.id}>{signal.label}</option
						>{/each}
				</select>
			</label>
			<div class="formula" aria-label={`Signal model ${selectedSignal.formula}`}>
				{selectedSignal.formula}
			</div>
			<label class="strength-slider">
				<span><strong>Signal strength α</strong><output>{signalStrength.toFixed(2)}</output></span>
				<input
					type="range"
					min="0"
					max="6"
					step="0.05"
					value={signalStrength}
					disabled={signalType === 'none'}
					oninput={(event) => strengthInput(event, false)}
					onchange={(event) => strengthInput(event, true)}
				/>
			</label>
			<div class="null-model-card">
				<span>Declared null model</span>
				<p>{nullDescription}</p>
			</div>
			<button type="button" class="run-comparison" disabled={busy} onclick={onrun}>
				{busy
					? 'Sampling null matrices…'
					: nullResult
						? 'Resample null ensemble'
						: 'Compare with null ensemble'}
			</button>
			<p class="dependency-note">
				Every conclusion below depends on this null model. Changing its distribution, symmetry,
				scale, sparsity, or dimension changes the question.
			</p>
		</div>

		<div class="results" aria-live="polite" aria-busy={busy}>
			{#if busy}
				<div class="empty-state">
					<strong>Building the empirical reference.</strong><span
						>The worker is generating deterministic null matrices and evaluating the same declared
						statistics.</span
					>
				</div>
			{:else if !nullResult || nullResult.metrics.length === 0}
				<div class="empty-state">
					<strong>No verdict has been requested.</strong><span
						>Run a null comparison. The instrument will report percentiles, not a binary detector.</span
					>
				</div>
			{:else}
				<div class="metric-list">
					{#each nullResult.metrics as metric (metric.id)}
						<article class="metric-card">
							<header>
								<div>
									<h4>{metric.label}</h4>
									<p>
										{metric.description ??
											'Compared with the same statistic under the declared null.'}
									</p>
								</div>
								<strong class={verdictClass(metric)}>{verdict(metric)}</strong>
							</header>
							<div
								class="percentile-track"
								aria-label={`${metric.label}: empirical percentile ${formatNumber(metric.percentile, 2)}`}
							>
								<span class="tail left">2.5</span><span class="tail right">97.5</span>
								<div class="marker" style={`left: ${percentilePosition(metric)}%`}>
									<span></span>
								</div>
							</div>
							<dl>
								<div>
									<dt>Observed</dt>
									<dd>{formatNumber(metric.value, 6)}</dd>
								</div>
								<div>
									<dt>Null mean</dt>
									<dd>{formatNumber(metric.nullMean, 6)}</dd>
								</div>
								<div>
									<dt>Null SD</dt>
									<dd>{formatNumber(metric.nullStandardDeviation, 5)}</dd>
								</div>
								<div>
									<dt>Empirical percentile</dt>
									<dd>{formatNumber(metric.percentile, 3)}%</dd>
								</div>
								<div>
									<dt>Standardised deviation</dt>
									<dd>{formatNumber(metric.zScore, 4)}σ</dd>
								</div>
								<div>
									<dt>Two-sided empirical p</dt>
									<dd>{formatNumber(metric.twoSidedPValue, 4)}</dd>
								</div>
								<div>
									<dt>Valid null samples</dt>
									<dd>{metric.validSampleCount ?? 0}</dd>
								</div>
							</dl>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<aside class="honesty-panel">
		<div>
			<p>WHAT THE COMPARISON SAYS</p>
			<strong>“Unusual under this null model” is conditional language.</strong>
		</div>
		<ul>
			<li>A single realization does not establish an ensemble law.</li>
			<li>A visual pattern is not automatically statistically significant.</li>
			<li>
				Testing many metrics and reporting only the most exciting one creates a multiple-comparisons
				problem.
			</li>
			<li>Finite matrices and finite null samples make percentile estimates noisy.</li>
		</ul>
	</aside>
	{#if nullResult?.warnings?.length}
		<ul class="warnings" aria-label="Null comparison warnings">
			{#each nullResult.warnings as warning (warning)}<li>{warning}</li>{/each}
		</ul>
	{/if}
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
	.null-model-card p,
	.dependency-note,
	.empty-state strong,
	.empty-state span,
	.metric-card h4,
	.metric-card p,
	.honesty-panel p,
	.warnings {
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
	.null-count {
		min-width: 8rem;
		border-left: 1px solid var(--rm-rule);
		padding-left: 0.8rem;
		text-align: right;
	}
	.null-count span,
	.null-count strong {
		display: block;
	}
	.null-count span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
	}
	.null-count strong {
		margin-top: 0.15rem;
		font: 800 1rem var(--rm-mono);
	}
	.detector-layout {
		display: grid;
		grid-template-columns: minmax(16rem, 0.65fr) minmax(0, 1.35fr);
		gap: 0.7rem;
		margin-top: 0.75rem;
	}
	.signal-console,
	.results {
		min-width: 0;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
		background: var(--rm-surface);
		padding: 0.7rem;
	}
	.signal-console {
		display: grid;
		align-content: start;
		gap: 0.65rem;
	}
	.signal-console label {
		display: grid;
		gap: 0.25rem;
		color: var(--rm-muted);
		font-size: 0.7rem;
		font-weight: 700;
	}
	.signal-console select,
	.run-comparison {
		width: 100%;
		min-height: 2.75rem;
		box-sizing: border-box;
		border: 1px solid var(--rm-control);
		border-radius: 0.38rem;
		background: var(--rm-paper);
		padding: 0.45rem 0.6rem;
		color: var(--rm-ink);
		font: 650 0.76rem var(--rm-sans);
	}
	.formula {
		border: 1px solid var(--rm-rule);
		border-radius: 0.35rem;
		background: var(--rm-plot-paper);
		padding: 0.7rem;
		font: 750 0.86rem var(--rm-mono);
		text-align: center;
	}
	.strength-slider > span {
		display: flex;
		justify-content: space-between;
		gap: 0.7rem;
	}
	.strength-slider output {
		color: var(--rm-ink);
		font-family: var(--rm-mono);
	}
	.strength-slider input {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--rm-accent);
	}
	.null-model-card {
		border-left: 3px solid var(--rm-theory);
		background: color-mix(in srgb, var(--rm-theory) 7%, var(--rm-paper));
		padding: 0.55rem 0.65rem;
	}
	.null-model-card span {
		color: var(--rm-muted);
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.null-model-card p,
	.dependency-note {
		margin-top: 0.28rem;
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.run-comparison {
		border-color: var(--rm-accent);
		background: var(--rm-accent);
		color: var(--rm-accent-ink);
		font-weight: 800;
		cursor: pointer;
	}
	.run-comparison:disabled {
		cursor: wait;
		opacity: 0.65;
	}
	.dependency-note {
		color: var(--rm-muted);
	}
	.results {
		min-height: 22rem;
	}
	.empty-state {
		display: grid;
		height: 100%;
		min-height: 20rem;
		place-content: center;
		gap: 0.25rem;
		padding: 1rem;
		text-align: center;
	}
	.empty-state strong {
		font-size: 0.9rem;
	}
	.empty-state span {
		max-width: 32rem;
		color: var(--rm-muted);
		font-size: 0.74rem;
		line-height: 1.45;
	}
	.metric-list {
		display: grid;
		gap: 0.6rem;
	}
	.metric-card {
		border: 1px solid var(--rm-rule);
		border-radius: 0.35rem;
		padding: 0.65rem;
	}
	.metric-card header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.65rem;
	}
	.metric-card h4 {
		font-size: 0.82rem;
	}
	.metric-card p {
		margin-top: 0.16rem;
		color: var(--rm-muted);
		font-size: 0.6875rem;
		line-height: 1.35;
	}
	.metric-card header > strong {
		flex: none;
		border: 1px solid currentColor;
		border-radius: 999px;
		padding: 0.18rem 0.42rem;
		font-size: 0.6875rem;
		font-weight: 800;
	}
	.metric-card header > strong.ordinary {
		color: var(--rm-ordinary);
	}
	.metric-card header > strong.unusual {
		color: var(--rm-warning);
	}
	.metric-card header > strong.insufficient {
		color: var(--rm-muted);
	}
	.percentile-track {
		position: relative;
		height: 1.75rem;
		margin: 0.65rem 0;
		border-radius: 999px;
		background: linear-gradient(
			90deg,
			color-mix(in srgb, var(--rm-warning) 18%, transparent) 0 2.5%,
			color-mix(in srgb, var(--rm-ordinary) 15%, transparent) 2.5% 97.5%,
			color-mix(in srgb, var(--rm-warning) 18%, transparent) 97.5% 100%
		);
	}
	.percentile-track::after {
		position: absolute;
		top: 50%;
		left: 0;
		width: 100%;
		height: 1px;
		background: var(--rm-rule);
		content: '';
	}
	.percentile-track .tail {
		position: absolute;
		z-index: 1;
		top: 0.32rem;
		color: var(--rm-muted);
		font: 650 0.6875rem var(--rm-mono);
	}
	.percentile-track .left {
		left: 0.25rem;
	}
	.percentile-track .right {
		right: 0.25rem;
	}
	.marker {
		position: absolute;
		z-index: 2;
		top: 50%;
		width: 0;
		height: 100%;
		transform: translateY(-50%);
	}
	.marker span {
		position: absolute;
		top: 50%;
		left: 0;
		width: 0.72rem;
		height: 0.72rem;
		transform: translate(-50%, -50%) rotate(45deg);
		border: 2px solid var(--rm-paper);
		background: var(--rm-selected);
	}
	dl {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		margin: 0;
	}
	dl > div {
		min-width: 0;
		border-right: 1px solid var(--rm-rule);
		padding: 0 0.45rem;
	}
	dl > div:first-child {
		padding-left: 0;
	}
	dl > div:last-child {
		border-right: 0;
		padding-right: 0;
	}
	dt {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		line-height: 1.3;
		text-transform: uppercase;
	}
	dd {
		overflow-wrap: anywhere;
		margin: 0.14rem 0 0;
		font: 700 0.6875rem var(--rm-mono);
	}
	.honesty-panel {
		display: grid;
		grid-template-columns: minmax(13rem, 0.65fr) minmax(0, 1.35fr);
		gap: 0.8rem;
		margin-top: 0.7rem;
		border: 1px solid var(--rm-warning);
		border-left-width: 4px;
		border-radius: 0.4rem;
		background: color-mix(in srgb, var(--rm-warning) 6%, var(--rm-paper));
		padding: 0.7rem;
	}
	.honesty-panel p {
		color: var(--rm-warning);
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.07em;
	}
	.honesty-panel strong {
		display: block;
		margin-top: 0.22rem;
		font-size: 0.82rem;
		line-height: 1.35;
	}
	.honesty-panel ul,
	.warnings {
		margin-block: 0;
		padding-left: 1.2rem;
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.warnings {
		margin-top: 0.55rem;
		color: var(--rm-warning);
	}
	:where(select, input, button):focus-visible {
		outline: 3px solid var(--rm-focus);
		outline-offset: 2px;
	}
	@media (max-width: 62rem) {
		.detector-layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 44rem) {
		.metric-card header,
		.honesty-panel {
			grid-template-columns: minmax(0, 1fr);
			align-items: stretch;
			flex-direction: column;
		}
		.metric-card header > strong {
			align-self: start;
		}
		dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.5rem 0;
		}
		dl > div,
		dl > div:first-child,
		dl > div:last-child {
			border-right: 0;
			padding: 0;
		}
	}
	@media (max-width: 34rem) {
		.lens-header {
			flex-direction: column;
		}
		.null-count {
			width: 100%;
			border-top: 1px solid var(--rm-rule);
			border-left: 0;
			padding-top: 0.45rem;
			padding-left: 0;
			text-align: left;
		}
	}
	@media (forced-colors: active) {
		.signal-console,
		.results,
		.signal-console select,
		.formula,
		.run-comparison,
		.metric-card,
		.honesty-panel {
			border-color: CanvasText;
		}
		.run-comparison {
			background: ButtonFace;
			color: ButtonText;
		}
		.percentile-track {
			border: 1px solid CanvasText;
			background: Canvas;
		}
		.marker span {
			background: Highlight;
		}
	}
</style>
