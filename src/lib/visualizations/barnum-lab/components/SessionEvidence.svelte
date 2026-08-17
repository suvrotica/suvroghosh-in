<script lang="ts">
	import type { ProductionCounts } from './ui-types';

	let { metrics }: { metrics: ProductionCounts } = $props();

	let basisMaximum = $derived(
		Math.max(1, metrics.unsupportedGenericClauseCount, metrics.directEchoClauseCount)
	);
	let adaptationMaximum = $derived(
		Math.max(
			1,
			metrics.sealedClauseCount,
			metrics.feedbackSelectedClauseCount,
			metrics.hedgedClauseCount,
			metrics.elaboratedClauseCount
		)
	);
</script>

<section
	class="production-panel"
	data-testid="barnum-guided-session-counts"
	aria-labelledby="production-panel-heading"
>
	<header>
		<p class="panel-letter">Panel B · guided-session counts</p>
		<h3 id="production-panel-heading">How the guided text was produced</h3>
		<p>
			{metrics.statementCount} statements containing {metrics.semanticClauseCount} semantic clauses in
			the guided session. These counts stay attached to that guided reading when the open laboratory creates
			a controlled branch.
		</p>
	</header>

	<section aria-labelledby="basis-heading">
		<h4 id="basis-heading">Claim basis</h4>
		<p>These categories answer where a clause came from.</p>
		<div class="bars basis" aria-hidden="true">
			<div>
				<span><i class="generic"></i>Unsupported generic</span>
				<b style={`--bar: ${(metrics.unsupportedGenericClauseCount / basisMaximum) * 100}%`}></b>
				<strong>{metrics.unsupportedGenericClauseCount}</strong>
			</div>
			<div>
				<span><i class="echo"></i>Direct echo of an answer</span>
				<b style={`--bar: ${(metrics.directEchoClauseCount / basisMaximum) * 100}%`}></b>
				<strong>{metrics.directEchoClauseCount}</strong>
			</div>
		</div>
	</section>

	<section aria-labelledby="adaptation-heading">
		<h4 id="adaptation-heading">Adaptation status</h4>
		<p>A direct echo can also be feedback selected, so this is a separate dimension.</p>
		<div class="bars adaptation" aria-hidden="true">
			{#each [{ label: 'Sealed', value: metrics.sealedClauseCount }, { label: 'Feedback selected', value: metrics.feedbackSelectedClauseCount }, { label: 'Hedged', value: metrics.hedgedClauseCount }, { label: 'Elaborated', value: metrics.elaboratedClauseCount }] as row (row.label)}
				<div>
					<span><i></i>{row.label}</span>
					<b style={`--bar: ${(row.value / adaptationMaximum) * 100}%`}></b>
					<strong>{row.value}</strong>
				</div>
			{/each}
		</div>
	</section>

	<table>
		<caption>Exact guided-session clause provenance counts</caption>
		<thead
			><tr
				><th scope="col">Dimension</th><th scope="col">Category</th><th scope="col">Clauses</th></tr
			></thead
		>
		<tbody>
			<tr
				><th scope="row">Claim basis</th><td>Unsupported generic</td><td
					>{metrics.unsupportedGenericClauseCount}</td
				></tr
			>
			<tr
				><th scope="row">Claim basis</th><td>Direct echo</td><td>{metrics.directEchoClauseCount}</td
				></tr
			>
			<tr><th scope="row">Adaptation</th><td>Sealed</td><td>{metrics.sealedClauseCount}</td></tr>
			<tr
				><th scope="row">Adaptation</th><td>Feedback selected</td><td
					>{metrics.feedbackSelectedClauseCount}</td
				></tr
			>
			<tr><th scope="row">Adaptation</th><td>Hedged</td><td>{metrics.hedgedClauseCount}</td></tr>
			<tr
				><th scope="row">Adaptation</th><td>Elaborated</td><td>{metrics.elaboratedClauseCount}</td
				></tr
			>
		</tbody>
	</table>

	{#if metrics.nonFitsOmittedFromPolishedSummaryCount > 0}
		<p class="omissions">
			<strong
				>{metrics.nonFitsOmittedFromPolishedSummaryCount} non-fit{metrics.nonFitsOmittedFromPolishedSummaryCount ===
				1
					? ''
					: 's'}</strong
			>
			were omitted from the polished summary, but remain in the audit.
		</p>
	{/if}
</section>

<style>
	.production-panel {
		display: grid;
		gap: 0.8rem;
		min-width: 0;
		border: 1px solid var(--barnum-rule);
		border-top: 4px solid var(--barnum-ochre);
		border-radius: 0.55rem;
		background: var(--barnum-raised);
		padding: 0.8rem;
	}

	header p,
	header h3,
	section h4,
	section > p,
	.omissions {
		margin: 0;
	}

	.panel-letter {
		color: var(--barnum-ochre-text);
		font: 780 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h3 {
		margin-top: 0.12rem;
		font: 800 1rem/1.2 var(--barnum-sans);
	}

	header > p:last-child,
	section > p,
	.omissions {
		margin-top: 0.2rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.production-panel > section {
		border: 1px solid var(--barnum-rule);
		border-radius: 0.4rem;
		padding: 0.68rem;
	}

	h4 {
		font: 760 0.75rem/1.4 var(--barnum-sans);
	}

	.bars {
		display: grid;
		gap: 0.38rem;
		margin-top: 0.55rem;
	}

	.bars > div {
		display: grid;
		grid-template-columns: minmax(8.5rem, 0.8fr) minmax(4rem, 1fr) 1.5rem;
		align-items: center;
		gap: 0.45rem;
		font: 0.72rem/1.35 var(--barnum-sans);
	}

	.bars span {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.bars i {
		display: inline-block;
		width: 0.58rem;
		height: 0.58rem;
		border: 2px solid var(--barnum-ochre);
	}

	.bars i.generic {
		border-color: var(--barnum-vermilion);
		border-radius: 50%;
	}

	.bars i.echo {
		border-color: var(--barnum-blue);
		transform: rotate(45deg);
	}

	.bars b {
		display: block;
		height: 0.52rem;
		border: 1px solid var(--barnum-control);
		background: linear-gradient(
			to right,
			var(--bar-color, var(--barnum-ochre)) var(--bar),
			var(--barnum-paper) var(--bar)
		);
	}

	.basis > div:first-child {
		--bar-color: var(--barnum-vermilion);
	}

	.basis > div:last-child {
		--bar-color: var(--barnum-blue);
	}

	.bars strong {
		font: 750 0.72rem/1 var(--barnum-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	caption {
		margin-bottom: 0.35rem;
		font: 750 0.72rem/1.35 var(--barnum-sans);
		text-align: left;
	}

	th,
	td {
		border-top: 1px solid var(--barnum-rule);
		padding: 0.35rem;
		font: 0.7rem/1.4 var(--barnum-sans);
		text-align: left;
	}

	thead th {
		font-family: var(--barnum-mono);
		color: var(--barnum-muted);
	}

	.omissions {
		border-left: 3px solid var(--barnum-vermilion);
		padding-left: 0.55rem;
	}

	.omissions strong {
		color: var(--barnum-ink);
	}

	@media (max-width: 30rem) {
		.bars > div {
			grid-template-columns: minmax(0, 1fr) 1.5rem;
		}

		.bars b {
			grid-column: 1 / -1;
		}
	}

	@media (forced-colors: active) {
		.production-panel,
		.production-panel > section,
		.bars b,
		.bars i,
		th,
		td {
			border-color: CanvasText;
		}
	}
</style>
