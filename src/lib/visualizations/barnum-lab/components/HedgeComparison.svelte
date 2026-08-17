<script lang="ts">
	import type { ReadingStatement } from './ui-types';

	let {
		withoutHedges,
		withHedges
	}: {
		withoutHedges: readonly ReadingStatement[];
		withHedges: readonly ReadingStatement[];
	} = $props();

	let pairs = $derived(
		Array.from({ length: Math.max(withoutHedges.length, withHedges.length) }, (_, index) => ({
			id: `hedge-pair-${index + 1}`,
			without: withoutHedges[index],
			with: withHedges[index]
		}))
	);
</script>

<section
	id="barnum-hedge-experiment"
	class="hedge-experiment"
	data-testid="barnum-hedge-experiment"
	aria-labelledby="hedge-experiment-heading"
>
	<header>
		<p>Experiment 4 · Hedges off versus on</p>
		<h3 id="hedge-experiment-heading">Two deterministic runs, paired by output slot</h3>
		<span>
			“Hedge off” excludes modal-hedge and exception-clause candidates. “Hedge on” moves those
			candidates forward. These are controlled generator runs, not silent edits to the sealed guided
			deck.
		</span>
	</header>

	<div class="pairs">
		{#each pairs as pair, index (pair.id)}
			<article>
				<h4>Output slot {index + 1}</h4>
				<div class="variants">
					<section>
						<strong>Hedge off</strong>
						{#if pair.without}
							<p>{pair.without.text}</p>
							<code>{pair.without.coreId}</code>
						{:else}
							<p>No eligible claim filled this slot.</p>
						{/if}
					</section>
					<section>
						<strong>Hedge on</strong>
						{#if pair.with}
							<p>{pair.with.text}</p>
							<code>{pair.with.coreId}</code>
						{:else}
							<p>No eligible claim filled this slot.</p>
						{/if}
					</section>
				</div>
				<p class="change">
					{pair.without?.coreId === pair.with?.coreId
						? 'Same core ID in this paired slot.'
						: 'Core ID changed: the filter selected a different claim. This is not evidence that one fixed claim became more accurate.'}
				</p>
			</article>
		{/each}
	</div>
</section>

<style>
	.hedge-experiment {
		display: grid;
		gap: 0.75rem;
		border: 1px solid var(--barnum-rule);
		border-left: 4px solid var(--barnum-ochre);
		border-radius: 0.5rem;
		background: var(--barnum-raised);
		padding: 0.8rem;
	}

	header p,
	header h3,
	header span,
	h4,
	.variants p,
	.change {
		margin: 0;
	}

	header p {
		color: var(--barnum-ochre-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h3 {
		margin-top: 0.12rem;
		font: 800 0.95rem/1.25 var(--barnum-sans);
	}

	header span,
	.change {
		display: block;
		margin-top: 0.2rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.5 var(--barnum-sans);
	}

	.pairs {
		display: grid;
		gap: 0.6rem;
	}

	.pairs > article {
		border-top: 1px solid var(--barnum-rule);
		padding-top: 0.6rem;
	}

	h4 {
		font: 760 0.75rem/1.35 var(--barnum-sans);
	}

	.variants {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin-top: 0.45rem;
	}

	.variants section {
		display: grid;
		gap: 0.35rem;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.6rem;
	}

	.variants strong {
		font: 760 0.72rem/1.35 var(--barnum-sans);
	}

	.variants p {
		font: 0.84rem/1.5 var(--barnum-serif);
	}

	.variants code {
		color: var(--barnum-muted);
		font: 0.7rem/1.4 var(--barnum-mono);
		overflow-wrap: anywhere;
	}

	.change {
		border-left: 2px solid var(--barnum-ochre);
		padding-left: 0.5rem;
	}

	@media (max-width: 36rem) {
		.variants {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.hedge-experiment,
		.pairs > article,
		.variants section,
		.change {
			border-color: CanvasText;
		}
	}
</style>
