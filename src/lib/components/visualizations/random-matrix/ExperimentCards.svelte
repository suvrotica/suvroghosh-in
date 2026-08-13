<script lang="ts">
	import type { ExperimentCard } from './types';

	let {
		cards,
		active = '',
		canUndo = false,
		onapply,
		onundo
	}: {
		cards: readonly ExperimentCard[];
		active?: string;
		canUndo?: boolean;
		onapply: (card: ExperimentCard) => void;
		onundo: () => void;
	} = $props();
</script>

<section class="experiment-cards" aria-labelledby="random-matrix-experiments-heading">
	<header>
		<div>
			<p>GUIDED EXPERIMENTS</p>
			<h3 id="random-matrix-experiments-heading">Change one mathematical question</h3>
		</div>
		<button type="button" disabled={!canUndo} onclick={onundo}>Undo last card</button>
	</header>
	<div class="card-strip">
		{#each cards as card (card.id)}
			<button
				type="button"
				class:active={active === card.id}
				aria-pressed={active === card.id}
				onclick={() => onapply(card)}
			>
				<span>{card.title}</span>
				<small>{card.prompt}</small>
			</button>
		{/each}
	</div>
</section>

<style>
	.experiment-cards {
		border-top: 1px solid var(--rm-rule);
		background: var(--rm-surface);
		padding: 0.75rem 0.8rem;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	header p,
	header h3 {
		margin: 0;
	}
	header p {
		color: var(--rm-accent);
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.09em;
	}
	header h3 {
		margin-top: 0.12rem;
		font-size: 0.92rem;
	}
	header button {
		min-height: 2.75rem;
		border: 1px solid var(--rm-control);
		border-radius: 0.38rem;
		background: var(--rm-paper);
		padding: 0.45rem 0.65rem;
		color: var(--rm-ink);
		font: 750 0.72rem var(--rm-sans);
		cursor: pointer;
	}
	header button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}
	.card-strip {
		display: grid;
		grid-auto-columns: minmax(13.5rem, 1fr);
		grid-auto-flow: column;
		gap: 0.5rem;
		margin-top: 0.65rem;
		overflow-x: auto;
		padding: 0.15rem 0 0.4rem;
		overscroll-behavior-inline: contain;
		scroll-snap-type: inline proximity;
	}
	.card-strip button {
		display: grid;
		min-height: 5rem;
		align-content: start;
		gap: 0.3rem;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
		background: var(--rm-paper);
		padding: 0.65rem;
		color: var(--rm-ink);
		text-align: left;
		cursor: pointer;
		scroll-snap-align: start;
	}
	.card-strip button:hover,
	.card-strip button.active {
		border-color: var(--rm-accent);
		background: color-mix(in srgb, var(--rm-accent) 7%, var(--rm-paper));
	}
	.card-strip span {
		font-size: 0.76rem;
		font-weight: 800;
	}
	.card-strip small {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		line-height: 1.4;
	}
	button:focus-visible {
		outline: 3px solid var(--rm-focus);
		outline-offset: 2px;
	}
	@media (max-width: 34rem) {
		header {
			align-items: stretch;
			flex-direction: column;
		}
		.card-strip {
			grid-auto-columns: minmax(12.5rem, 82%);
		}
	}
	@media (forced-colors: active) {
		.experiment-cards,
		header button,
		.card-strip button {
			border-color: CanvasText;
		}
	}
</style>
