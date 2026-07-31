<script lang="ts">
	import type { CityResult } from '$lib/visualizations/city-master-plan';

	type Props = {
		result: CityResult | null;
		selectedDescription?: string;
	};

	let { result, selectedDescription = 'No map cell is selected.' }: Props = $props();

	let featureCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		if (!result) return [] as Array<[string, number]>;
		for (const tile of result.fabricTiles) {
			counts[tile.prototypeId] = (counts[tile.prototypeId] ?? 0) + 1;
		}
		for (const tile of result.occupationTiles) {
			if (tile.prototypeId.startsWith('empty')) continue;
			counts[tile.prototypeId] = (counts[tile.prototypeId] ?? 0) + 1;
		}
		return Object.entries(counts).sort((left, right) => right[1] - left[1]);
	});
</script>

<details class="accessible-report">
	<summary>Accessible city report</summary>
	{#if result}
		<div class="report-body">
			<p>
				<strong>{result.cityName}</strong> is a {result.width} by {result.height} cell fictional neighbourhood
				anchored by {result.anchor.id.replaceAll('-', ' ')} at column
				{result.anchor.x + 1}, row {result.anchor.y + 1}.
			</p>
			<h4>Network and access</h4>
			<ul>
				<li>
					{result.analysis.walkable.largestComponent} of
					{result.analysis.walkable.cellCount} walkable cells belong to the largest connected component.
				</li>
				<li>
					{result.analysis.walkable.reachedBorderExits} of
					{result.analysis.walkable.borderExits} boundary exits are reached.
				</li>
				<li>
					{result.analysis.frontage.accessibleCount} of
					{result.analysis.frontage.occupiedCount} occupied structures have frontage access.
				</li>
				<li>
					{result.analysis.drainage.connectedToOutlet} drain segments reach an outlet;
					{result.analysis.drainage.uphill} are explicitly uphill.
				</li>
			</ul>
			<h4>Scores</h4>
			<p>
				Functional {result.scores.functional} out of 100,
				{result.scores.functionalLabel}. Calamity {result.scores.calamity} out of 100,
				{result.scores.calamityLabel}.
			</p>
			<h4>Feature counts</h4>
			<ul class="counts">
				{#each featureCounts as [feature, count] (feature)}
					<li><span>{feature.replaceAll('-', ' ')}</span><strong>{count}</strong></li>
				{/each}
			</ul>
			<h4>Municipal exceptions</h4>
			{#if result.municipalPatches.length}
				<ol>
					{#each result.municipalPatches as patch (patch.id)}
						<li>
							{patch.anomalyType.replaceAll('-', ' ')} at column {patch.cell.x + 1}, row
							{patch.cell.y + 1}. {patch.violatedRules.join('; ')}.
						</li>
					{/each}
				</ol>
			{:else}
				<p>No municipal exceptions were required.</p>
			{/if}
			<h4>Selected cell</h4>
			<p>{selectedDescription}</p>
		</div>
	{:else}
		<p class="waiting">The canonical city report will appear when local generation completes.</p>
	{/if}
</details>

<style>
	.accessible-report {
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
	}
	summary {
		min-height: 3rem;
		padding: 0.75rem;
		cursor: pointer;
		font-size: 0.76rem;
		font-weight: 800;
		color: var(--accent);
	}
	summary:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.report-body,
	.waiting {
		border-top: 1px solid var(--rule);
		padding: 0.75rem;
	}
	.report-body :where(p, ul, ol, h4),
	.waiting {
		margin: 0;
	}
	.report-body h4 {
		margin-top: 0.75rem;
		font-size: 0.75rem;
		color: var(--ink);
	}
	.report-body p,
	.report-body li,
	.waiting {
		font-size: 0.7rem;
		line-height: 1.5;
		color: var(--ink);
	}
	.report-body ul,
	.report-body ol {
		margin-top: 0.35rem;
		padding-left: 1.1rem;
	}
	.counts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem 0.7rem;
		padding-left: 0 !important;
		list-style: none;
	}
	.counts li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px dotted var(--rule);
	}
	.counts span {
		text-transform: capitalize;
	}
	.waiting {
		color: var(--ink-muted);
	}
</style>
