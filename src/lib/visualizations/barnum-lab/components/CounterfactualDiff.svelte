<script lang="ts">
	import type { CounterfactualResult } from './ui-types';

	let { result }: { result: CounterfactualResult } = $props();
</script>

<section class="counterfactual" aria-labelledby="counterfactual-heading">
	<header>
		<p>Demographic counterfactual</p>
		<h3 id="counterfactual-heading">The supposed person changed. The claims did not.</h3>
	</header>

	<div class="profiles">
		<article><span>Before</span><strong>{result.beforeLabel}</strong></article>
		<span class="arrow" aria-hidden="true">→</span>
		<article><span>Fictional contrast</span><strong>{result.afterLabel}</strong></article>
	</div>

	<div class="invariant">
		<span aria-hidden="true">=</span>
		<p>
			<strong>{Math.round(result.semanticIdOverlap)}% semantic-ID overlap</strong>
			{result.identicalSemanticIds
				? 'The exact ordered core IDs stayed identical.'
				: 'The core-ID sequence changed; this violates the intended invariant.'}
		</p>
	</div>

	<div class="diff-columns">
		<section aria-labelledby="surface-changes-heading">
			<h4 id="surface-changes-heading">Surface details changed</h4>
			{#if result.changedSurfaceDetails.length}
				<ul>
					{#each result.changedSurfaceDetails as detail (detail)}<li>{detail}</li>{/each}
				</ul>
			{:else}
				<p>Only the context label changed.</p>
			{/if}
		</section>
		<section aria-labelledby="core-unchanged-heading">
			<h4 id="core-unchanged-heading">Core claims held fixed</h4>
			<p>{result.unchangedCoreIds.length} sealed semantic IDs remained in the same order.</p>
			<details>
				<summary>Show semantic IDs</summary>
				<ul class="ids">
					{#each result.unchangedCoreIds as id (id)}<li><code>{id}</code></li>{/each}
				</ul>
			</details>
		</section>
	</div>
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
	.diff-columns h4,
	.diff-columns p,
	.diff-columns ul {
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

	.diff-columns {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.diff-columns section {
		border-top: 1px solid var(--barnum-rule);
		padding-top: 0.55rem;
	}

	.diff-columns h4 {
		font: 760 0.75rem/1.35 var(--barnum-sans);
	}

	.diff-columns p,
	.diff-columns li,
	details summary {
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.diff-columns ul {
		margin-top: 0.35rem;
		padding-left: 1rem;
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

		.diff-columns {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.counterfactual,
		.profiles article,
		.invariant,
		.invariant > span,
		.diff-columns section {
			border-color: CanvasText;
		}
	}
</style>
