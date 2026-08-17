<script lang="ts">
	import FitRating from './FitRating.svelte';
	import type { FitRating as FitRatingValue, ReadingStatement } from './ui-types';

	let {
		statement,
		index,
		reveal = false,
		showRating = true,
		onrate
	}: {
		statement: ReadingStatement;
		index: number;
		reveal?: boolean;
		showRating?: boolean;
		onrate?: (rating: FitRatingValue) => void;
	} = $props();

	let cardKind = $derived(
		statement.basis === 'direct-echo'
			? 'Direct echo'
			: statement.adaptation === 'sealed'
				? 'Sealed generic claim'
				: 'Feedback reuse'
	);
</script>

<article
	class="reading-card"
	class:echo={statement.basis === 'direct-echo'}
	class:adaptive={statement.adaptation !== 'sealed'}
	data-statement-id={statement.id}
	data-basis={statement.basis}
	data-adaptation={statement.adaptation}
>
	<header>
		<p>Statement {index}</p>
		<span>{reveal ? cardKind : 'Reading'}</span>
	</header>

	{#if reveal && statement.segments?.length}
		<p class="sentence segmented">
			{#each statement.segments as segment, segmentIndex (`${statement.id}:${segmentIndex}`)}
				<span data-basis={segment.basis} data-adaptation={segment.adaptation}>
					<span class="segment-text">{segment.text}</span>
					{#if segment.label}<small>{segment.label}</small>{/if}
				</span>
			{/each}
		</p>
	{:else}
		<p class="sentence">{statement.text}</p>
	{/if}

	{#if reveal && statement.plainExplanation}
		<p class="explanation">{statement.plainExplanation}</p>
	{/if}

	{#if showRating && onrate}
		<FitRating name={`rating-${statement.id}`} value={statement.rating} onchange={onrate} />
	{:else if reveal}
		<p class="rating-readout">
			Current recorded judgment: <strong>{statement.rating.replaceAll('-', ' ')}</strong>
		</p>
	{/if}

	{#if reveal && statement.trace?.length}
		<details class="trace">
			<summary>Inspect this statement</summary>
			<dl>
				{#each statement.trace as row (`${statement.id}:${row.label}`)}
					<div>
						<dt>{row.label}</dt>
						<dd>{row.value}</dd>
					</div>
				{/each}
			</dl>
		</details>
	{/if}
</article>

<style>
	.reading-card {
		display: grid;
		gap: 0.8rem;
		min-width: 0;
		border: 1px solid var(--barnum-rule);
		border-top: 3px solid var(--barnum-vermilion);
		border-radius: 0.5rem;
		background: var(--barnum-raised);
		padding: clamp(0.75rem, 2cqi, 1rem);
		box-shadow: 0 0.35rem 1rem color-mix(in oklab, var(--barnum-ink) 6%, transparent);
	}

	.reading-card.echo {
		border-top-color: var(--barnum-blue);
	}

	.reading-card.adaptive {
		border-top-color: var(--barnum-ochre);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	header p,
	header span,
	.sentence,
	.explanation,
	.rating-readout {
		margin: 0;
	}

	header p,
	header span {
		font: 750 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	header p {
		color: var(--barnum-muted);
	}

	header span {
		color: var(--barnum-vermilion);
	}

	.echo header span {
		color: var(--barnum-blue);
	}

	.adaptive header span {
		color: var(--barnum-ochre-text);
	}

	.sentence {
		font: 520 clamp(1rem, 2.3cqi, 1.22rem) / 1.5 var(--barnum-serif);
		letter-spacing: -0.008em;
	}

	.segmented {
		display: flex;
		flex-wrap: wrap;
		gap: 0.28rem;
		align-items: flex-start;
	}

	.segmented > span {
		display: inline-grid;
		gap: 0.14rem;
		border-bottom: 2px solid var(--barnum-vermilion);
		padding: 0.22rem 0.25rem;
		background: color-mix(in oklab, var(--barnum-vermilion) 7%, transparent);
	}

	.segmented > span[data-basis='direct-echo'] {
		border-color: var(--barnum-blue);
		background: color-mix(in oklab, var(--barnum-blue) 8%, transparent);
	}

	.segmented > span[data-adaptation]:not([data-adaptation='sealed']) {
		border-color: var(--barnum-ochre);
		background: color-mix(in oklab, var(--barnum-ochre) 9%, transparent);
	}

	.segment-text {
		display: inline;
	}

	.segmented small {
		font: 700 0.7rem/1.25 var(--barnum-mono);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--barnum-muted);
	}

	.explanation,
	.rating-readout {
		border-left: 3px solid var(--barnum-rule);
		padding-left: 0.65rem;
		color: var(--barnum-muted);
		font: 0.7rem/1.5 var(--barnum-sans);
	}

	.rating-readout strong {
		color: var(--barnum-ink);
		text-transform: capitalize;
	}

	.trace {
		border-top: 1px solid var(--barnum-rule);
		padding-top: 0.65rem;
	}

	.trace summary {
		min-height: 2.75rem;
		padding-block: 0.7rem;
		font: 750 0.75rem/1.3 var(--barnum-sans);
		cursor: pointer;
	}

	.trace summary:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	.trace dl {
		display: grid;
		gap: 0;
		margin: 0;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.35rem;
	}

	.trace dl > div {
		display: grid;
		grid-template-columns: minmax(7rem, 0.75fr) minmax(0, 1.25fr);
		gap: 0.6rem;
		padding: 0.5rem;
	}

	.trace dl > div + div {
		border-top: 1px solid var(--barnum-rule);
	}

	.trace dt,
	.trace dd {
		margin: 0;
		font: 0.72rem/1.45 var(--barnum-mono);
		overflow-wrap: anywhere;
	}

	.trace dt {
		font-weight: 750;
		color: var(--barnum-muted);
	}

	@media (max-width: 28rem) {
		.trace dl > div {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.segmented > span {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.reading-card,
		.segmented > span,
		.trace,
		.trace dl,
		.trace dl > div {
			border-color: CanvasText;
		}
	}
</style>
