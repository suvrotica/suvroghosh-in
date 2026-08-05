<script lang="ts">
	import type { Bias, BiasLens, LegendItem } from '$lib/visualizations/bias-archipelago/bias-types';

	let {
		lens,
		items,
		visibleCount,
		totalCount,
		selected
	}: {
		lens: BiasLens;
		items: LegendItem[];
		visibleCount: number;
		totalCount: number;
		selected?: Bias;
	} = $props();
</script>

<aside class="legend" aria-label="Map legend">
	<div class="legend-heading">
		<span>Survey key</span>
		<span>{visibleCount} of {totalCount} peaks labelled</span>
	</div>
	<p>
		<strong>Terrain height means density of related constructs</strong>—not severity, prevalence,
		irrationality, or empirical importance.
	</p>
	<p>
		This is a curated explanatory model, not a settled taxonomy. Proximity indicates functional
		resemblance; it does not make two constructs identical.
	</p>
	{#if lens !== 'none' && items.length}
		<div class="key-grid" aria-label={`${lens} categories`}>
			{#each items as item (item.id)}
				<span>
					<i style={`--key-colour:${item.colour}`} aria-hidden="true">{item.symbol}</i>
					{item.label}
				</span>
			{/each}
		</div>
	{/if}
	{#if selected}
		<p class="selected-note"><span aria-hidden="true">◎</span> Selected: {selected.name}</p>
	{/if}
</aside>

<style>
	.legend {
		display: grid;
		gap: 0.45rem;
		padding: 0.75rem 0.85rem;
		border: 1px solid var(--arch-rule);
		border-radius: 0.55rem;
		background: color-mix(in srgb, var(--arch-panel) 88%, transparent);
		color: var(--arch-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}

	.legend-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: var(--arch-text);
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	p {
		margin: 0;
	}

	strong {
		color: var(--arch-text);
	}

	.key-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.8rem;
		padding-top: 0.25rem;
		border-top: 1px solid var(--arch-rule);
	}

	.key-grid span {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}

	i {
		display: inline-grid;
		width: 1rem;
		height: 1rem;
		place-items: center;
		border: 1px solid color-mix(in srgb, var(--key-colour) 70%, white);
		border-radius: 0.2rem;
		background: color-mix(in srgb, var(--key-colour) 72%, transparent);
		color: white;
		font-size: 0.55rem;
		font-style: normal;
	}

	.selected-note {
		color: var(--arch-text);
	}
</style>
