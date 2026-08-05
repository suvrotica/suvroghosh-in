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

<aside class="legend" aria-label="Map legend" data-priority-labels={visibleCount}>
	<div class="legend-heading">
		<span>Survey key</span>
		<span>{totalCount} mapped peaks · collision-aware labels</span>
	</div>
	<div class="grammar-key" aria-label="Permanent map symbols">
		<div class="grammar-item">
			<span class="map-symbol peak-symbol" aria-hidden="true"></span>
			<span>
				<strong>Peak marker</strong>
				<small>one named construct; filled when exposed, hollow when submerged</small>
			</span>
		</div>
		<div class="grammar-item">
			<span class="map-symbol terrain-symbol" aria-hidden="true"></span>
			<span>
				<strong>Terrain</strong>
				<small>density produced by shared coded features</small>
			</span>
		</div>
		<div class="grammar-item">
			<span class="map-symbol coastline-symbol" aria-hidden="true"></span>
			<span>
				<strong>Coastline</strong>
				<small>the current explanatory threshold</small>
			</span>
		</div>
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

	.grammar-key {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		padding: 0.55rem 0;
		border-block: 1px solid var(--arch-rule);
	}

	.grammar-item {
		display: grid;
		grid-template-columns: 1.5rem minmax(0, 1fr);
		align-items: center;
		gap: 0.42rem;
		min-width: 0;
	}

	.grammar-item > span:last-child {
		display: grid;
		gap: 0.05rem;
	}

	.grammar-item strong {
		font-size: 0.65rem;
		letter-spacing: 0.035em;
	}

	.grammar-item small {
		font-size: 0.58rem;
		line-height: 1.3;
	}

	.map-symbol {
		position: relative;
		display: block;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 0.22rem;
		background: color-mix(in srgb, var(--arch-water-deep) 82%, black);
		overflow: hidden;
	}

	.peak-symbol::before,
	.peak-symbol::after {
		position: absolute;
		top: 50%;
		width: 0.36rem;
		height: 0.36rem;
		border: 1px solid color-mix(in srgb, var(--arch-label) 80%, white);
		border-radius: 50%;
		content: '';
		transform: translateY(-50%);
	}

	.peak-symbol::before {
		left: 0.25rem;
		background: var(--arch-label);
	}

	.peak-symbol::after {
		right: 0.25rem;
		background: transparent;
	}

	.terrain-symbol {
		background:
			repeating-linear-gradient(160deg, transparent 0 0.25rem, rgba(255, 255, 255, 0.16) 0.27rem),
			linear-gradient(135deg, var(--arch-water-deep) 4%, #829b91 52%, #e2d9ba 100%);
	}

	.coastline-symbol {
		background: linear-gradient(135deg, var(--arch-water-deep) 0 48%, #b4b39a 49% 100%);
	}

	.coastline-symbol::after {
		position: absolute;
		inset: 0.12rem -0.16rem;
		border: 1.5px solid color-mix(in srgb, var(--arch-label) 82%, white);
		border-radius: 48%;
		content: '';
		transform: rotate(-34deg);
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

	@media (max-width: 42rem) {
		.grammar-key {
			grid-template-columns: 1fr;
		}

		.legend-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.15rem;
		}
	}
</style>
