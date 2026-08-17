<script lang="ts">
	import ReadingCard from './ReadingCard.svelte';
	import type { ReadingStatement } from './ui-types';

	let {
		blind,
		dressed,
		adaptive,
		contextLabel,
		showProvenance = false
	}: {
		blind: readonly ReadingStatement[];
		dressed: readonly ReadingStatement[];
		adaptive: readonly ReadingStatement[];
		contextLabel?: string;
		showProvenance?: boolean;
	} = $props();

	let views = $derived([
		{
			id: 'blind',
			label: 'Blind',
			note: 'Sealed generic statements only.',
			statements: blind
		},
		{
			id: 'dressed',
			label: 'Dressed',
			note: contextLabel ?? 'Same deck, neutral context header, direct echoes identified.',
			statements: dressed
		},
		{
			id: 'adaptive',
			label: 'Adaptive',
			note: 'Reserved derivatives may use eligible feedback.',
			statements: adaptive
		}
	]);
</script>

<section class="comparison" aria-labelledby="comparison-heading">
	<header>
		<p>Front of house / backstage</p>
		<h3 id="comparison-heading">Three views of the same local machine</h3>
	</header>

	<div class="view-grid">
		{#each views as view (view.id)}
			<section aria-labelledby={`view-${view.id}`}>
				<header>
					<h4 id={`view-${view.id}`}>{view.label}</h4>
					<p>{view.note}</p>
				</header>
				<div class="statement-list">
					{#each view.statements as statement, index (statement.id)}
						<ReadingCard {statement} index={index + 1} reveal={showProvenance} showRating={false} />
					{/each}
				</div>
			</section>
		{/each}
	</div>
</section>

<style>
	.comparison {
		display: grid;
		gap: 0.75rem;
	}

	.comparison > header p,
	.comparison > header h3,
	.view-grid > section > header h4,
	.view-grid > section > header p {
		margin: 0;
	}

	.comparison > header p {
		color: var(--barnum-vermilion-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.comparison > header h3 {
		margin-top: 0.12rem;
		font: 800 1rem/1.2 var(--barnum-sans);
	}

	.view-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(20rem, 1fr));
		gap: 0.6rem;
		overflow-x: auto;
		padding-bottom: 0.35rem;
		scroll-snap-type: x proximity;
	}

	.view-grid > section {
		min-width: 0;
		scroll-snap-align: start;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.5rem;
		background: var(--barnum-soft);
		padding: 0.65rem;
	}

	.view-grid > section > header {
		min-height: 4rem;
		border-bottom: 1px solid var(--barnum-rule);
		padding: 0.2rem 0.15rem 0.55rem;
	}

	.view-grid > section > header h4 {
		font: 800 0.78rem/1.2 var(--barnum-sans);
	}

	.view-grid > section > header p {
		margin-top: 0.18rem;
		color: var(--barnum-muted);
		font: 0.72rem/1.45 var(--barnum-sans);
	}

	.statement-list {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}

	@container barnum-lab (max-width: 68rem) {
		.view-grid {
			grid-auto-columns: minmax(18rem, 84cqi);
			grid-template-columns: none;
			grid-auto-flow: column;
		}
	}

	@container barnum-lab (max-width: 32rem) {
		.view-grid {
			display: grid;
			grid-auto-flow: row;
			grid-template-columns: 1fr;
			overflow: visible;
		}
	}

	@media (forced-colors: active) {
		.view-grid > section,
		.view-grid > section > header {
			border-color: CanvasText;
		}
	}
</style>
