<script lang="ts">
	import type { CounterfactualResult } from './ui-types';

	let {
		result,
		technical = false
	}: {
		result: CounterfactualResult;
		technical?: boolean;
	} = $props();
</script>

<section
	class="counterfactual"
	data-testid="barnum-counterfactual-result"
	aria-labelledby="counterfactual-heading"
>
	<header>
		<p>Surface-details check</p>
		<h3 id="counterfactual-heading">
			{result.identicalSemanticIds
				? result.unchangedCoreIds.length === 7
					? 'Same seven readings, in the same order'
					: `Same ${result.unchangedCoreIds.length} readings, in the same order`
				: 'The reading order changed unexpectedly'}
		</h3>
	</header>

	<div class="profiles">
		<article><span>Before</span><strong>{result.beforeLabel}</strong></article>
		<span class="arrow" aria-hidden="true">→</span>
		<article><span>Fictional contrast</span><strong>{result.afterLabel}</strong></article>
	</div>

	<div class="invariant">
		<span aria-hidden="true">=</span>
		<p>
			<strong>
				{result.identicalSemanticIds
					? 'The original reading stayed unchanged.'
					: 'This comparison failed its unchanged-reading check.'}
			</strong>
			{result.identicalSemanticIds
				? 'Changing these details did not change what the page had already chosen.'
				: 'The page should not describe this as an unchanged comparison.'}
		</p>
	</div>

	<section class="changes" aria-labelledby="surface-changes-heading">
		<h4 id="surface-changes-heading">What changed</h4>
		{#if result.changes.length}
			<table data-testid="barnum-counterfactual-changes">
				<thead
					><tr><th scope="col">Clue</th><th scope="col">Before</th><th scope="col">After</th></tr
					></thead
				>
				<tbody>
					{#each result.changes as change (change.label)}
						<tr
							><th scope="row">{change.label}</th><td>{change.before}</td><td>{change.after}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		{:else}
			<p>No surface clue changed.</p>
		{/if}
	</section>

	{#if technical}
		<details class="technical">
			<summary>Technical equality check</summary>
			<p>{Math.round(result.semanticIdOverlap)}% ID overlap in the exact original order.</p>
			<ul class="ids">
				{#each result.unchangedCoreIds as id (id)}<li><code>{id}</code></li>{/each}
			</ul>
		</details>
	{/if}
</section>

<style>
	.counterfactual {
		display: grid;
		gap: 0.75rem;
		border: 1px solid var(--barnum-rule);
		border-left: 4px solid var(--barnum-blue);
		border-radius: 0.5rem;
		background: var(--barnum-raised);
		padding: 0.8rem;
	}

	header p,
	header h3,
	.invariant p,
	.changes h4,
	.changes p,
	.technical p,
	.technical ul {
		margin: 0;
	}

	header p {
		color: var(--barnum-blue-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h3 {
		margin-top: 0.12rem;
		font: 800 0.95rem/1.25 var(--barnum-sans);
	}

	.profiles {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
	}

	.profiles article {
		display: grid;
		gap: 0.16rem;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.4rem;
		background: var(--barnum-paper);
		padding: 0.65rem;
	}

	.profiles span,
	.profiles strong {
		font: 0.72rem/1.4 var(--barnum-sans);
	}

	.profiles article span {
		color: var(--barnum-muted);
	}

	.arrow {
		font-size: 1.2rem !important;
	}

	.invariant {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		gap: 0.65rem;
		align-items: center;
		border: 1px solid var(--barnum-blue);
		border-radius: 0.4rem;
		background: color-mix(in oklab, var(--barnum-blue) 8%, var(--barnum-paper));
		padding: 0.65rem;
	}

	.invariant > span {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border: 1px solid var(--barnum-blue);
		border-radius: 50%;
		font: 800 0.9rem/1 var(--barnum-mono);
	}

	.invariant p {
		display: grid;
		gap: 0.1rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.45 var(--barnum-sans);
	}

	.invariant strong {
		color: var(--barnum-ink);
	}

	.changes {
		border-top: 1px solid var(--barnum-rule);
		padding-top: 0.55rem;
	}

	.changes h4 {
		font: 760 0.75rem/1.35 var(--barnum-sans);
	}

	.changes p,
	details summary {
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	table {
		width: 100%;
		margin-top: 0.35rem;
		border-collapse: collapse;
	}

	th,
	td {
		border-top: 1px solid var(--barnum-rule);
		padding: 0.42rem;
		font: 0.72rem/1.45 var(--barnum-sans);
		text-align: left;
	}

	thead th {
		color: var(--barnum-muted);
		font-weight: 750;
	}

	.technical {
		border-top: 1px solid var(--barnum-rule);
	}

	details summary {
		min-height: 2.75rem;
		padding-block: 0.75rem;
		font-weight: 750;
		cursor: pointer;
	}

	details summary:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.ids {
		max-height: 9rem;
		overflow-y: auto;
	}

	.technical p,
	.technical ul {
		margin: 0 0.65rem 0.65rem;
	}

	.ids code {
		font: 0.7rem/1.45 var(--barnum-mono);
	}

	@media (max-width: 30rem) {
		.profiles {
			grid-template-columns: 1fr;
		}

		.arrow {
			transform: rotate(90deg);
			text-align: center;
		}
	}

	@media (forced-colors: active) {
		.counterfactual,
		.profiles article,
		.invariant,
		.invariant > span,
		.changes,
		th,
		td {
			border-color: CanvasText;
		}
	}
</style>
