<script lang="ts">
	import { TERRAIN_PRESETS } from '$lib/visualizations/lightning-atlas/config';
	import type {
		BatchAnalysisResult,
		TerrainPresetId
	} from '$lib/visualizations/lightning-atlas/types';

	type Props = {
		result: BatchAnalysisResult | null;
		comparison: BatchAnalysisResult | null;
		busy: boolean;
		compareTerrain: TerrainPresetId;
		onrun?: () => void;
		oncompare?: () => void;
		oncompareterrain?: (terrain: TerrainPresetId) => void;
	};

	let { result, comparison, busy, compareTerrain, onrun, oncompare, oncompareterrain }: Props =
		$props();
	let maximumCell = $derived(Math.max(1, ...(result?.heatmap.map((cell) => cell.count) ?? [1])));
</script>

<section class="study-panel" aria-labelledby="batch-heading">
	<header>
		<div>
			<p>Terrain Study</p>
			<h3 id="batch-heading">Model attachment frequency</h3>
		</div>
		<button type="button" onclick={onrun} disabled={busy}
			>{busy ? 'Calculating…' : 'Run 100 virtual flashes'}</button
		>
	</header>
	<p class="caveat">
		This is model attachment frequency across a deterministic seed range, not real-world strike
		risk.
	</p>

	{#if result}
		<p class="denominator">
			{result.groundFlashCount} of {result.runs} selected model flashes reached the ground; all frequencies
			use {result.runs} as the denominator.
		</p>
		<div class="batch-summary">
			<div class="heatmap" aria-hidden="true">
				{#each Array.from({ length: 108 }, (_, index) => index) as cellIndex (cellIndex)}
					{@const x = (cellIndex % 12) / 11}
					{@const z = Math.floor(cellIndex / 12) / 8}
					{@const cell = result.heatmap.find(
						(candidate) => Math.abs(candidate.x - x) < 0.02 && Math.abs(candidate.z - z) < 0.02
					)}
					<span
						style={`--heat:${(cell?.count ?? 0) / maximumCell}`}
						title={`${cell?.count ?? 0} model attachments`}
					></span>
				{/each}
			</div>
			<div class="top-frequency">
				<span>Most frequent model attachment</span>
				<strong>{result.frequencies[0]?.label ?? 'No ground attachment'}</strong>
				<small
					>{result.frequencies[0]
						? `${Math.round(result.frequencies[0].frequency * 100)} of 100 virtual flashes`
						: '—'}</small
				>
			</div>
		</div>

		<section class="frequency-table" aria-label="Model attachment frequencies">
			<table>
				<caption
					>{result.runs} deterministic model flashes on {result.terrain.replaceAll(
						'-',
						' '
					)}</caption
				>
				<thead
					><tr
						><th scope="col">Candidate</th><th scope="col">Kind</th><th scope="col">Count</th><th
							scope="col">Model frequency</th
						></tr
					></thead
				>
				<tbody>
					{#each result.frequencies.slice(0, 12) as entry (entry.candidateId)}
						<tr
							><th scope="row">{entry.label}</th><td>{entry.kind.replaceAll('-', ' ')}</td><td
								>{entry.count}</td
							><td>{(entry.frequency * 100).toFixed(0)}%</td></tr
						>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<div class="comparison-controls">
		<label>
			<span>Compare the same storm seed with</span>
			<select
				value={compareTerrain}
				onchange={(event) => oncompareterrain?.(event.currentTarget.value as TerrainPresetId)}
			>
				{#each TERRAIN_PRESETS as preset (preset.id)}<option value={preset.id}>{preset.name}</option
					>{/each}
			</select>
		</label>
		<button type="button" onclick={oncompare} disabled={busy}
			>{busy ? 'Calculating…' : 'Compare 100 flashes'}</button
		>
	</div>
	{#if comparison}
		<p class="comparison-result">
			Under the same seed range, <strong
				>{comparison.frequencies[0]?.label ?? 'no ground feature'}</strong
			>
			was the leading model attachment in {comparison.terrain.replaceAll('-', ' ')}
			({Math.round((comparison.frequencies[0]?.frequency ?? 0) * 100)}%).
		</p>
	{/if}
</section>

<style>
	.study-panel {
		border-top: 1px solid var(--atlas-line);
		background: var(--atlas-panel-strong);
		padding: 1rem;
		color: var(--atlas-text);
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	header p,
	header h3 {
		margin: 0;
	}
	header p {
		color: var(--atlas-muted);
		font:
			0.65rem 'Courier Prime',
			monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	header h3 {
		margin-top: 0.15rem;
		font-size: 1rem;
	}
	button,
	select {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-control);
		padding: 0.45rem 0.7rem;
		color: inherit;
		font: inherit;
		font-size: 0.74rem;
	}
	button:hover:not(:disabled),
	button:focus-visible,
	select:focus-visible {
		border-color: var(--atlas-accent);
		outline: none;
	}
	button:disabled {
		opacity: 0.5;
	}
	.caveat {
		margin: 0.55rem 0 0;
		color: var(--atlas-muted);
		font-size: 0.72rem;
	}
	.denominator {
		margin: 0.65rem 0 0;
		color: var(--atlas-muted);
		font-size: 0.72rem;
	}
	.batch-summary {
		display: grid;
		grid-template-columns: minmax(15rem, 1fr) minmax(12rem, 0.55fr);
		gap: 0.8rem;
		margin-top: 0.8rem;
	}
	.heatmap {
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: 2px;
		aspect-ratio: 12 / 5;
		border: 1px solid var(--atlas-line);
		background: var(--atlas-control);
		padding: 3px;
	}
	.heatmap span {
		background: color-mix(in srgb, var(--atlas-accent) calc(var(--heat) * 86%), transparent);
	}
	.top-frequency {
		display: grid;
		align-content: center;
		gap: 0.25rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.4rem;
		padding: 0.75rem;
	}
	.top-frequency span,
	.top-frequency small {
		color: var(--atlas-muted);
		font-size: 0.68rem;
	}
	.top-frequency strong {
		color: var(--atlas-accent);
	}
	.frequency-table {
		margin-top: 0.8rem;
		overflow-x: auto;
		border: 1px solid var(--atlas-line);
		border-radius: 0.4rem;
	}
	table {
		width: 100%;
		min-width: 36rem;
		border-collapse: collapse;
		font-size: 0.72rem;
	}
	caption,
	th,
	td {
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid var(--atlas-line);
		text-align: left;
	}
	caption {
		color: var(--atlas-muted);
		font-family: 'Courier Prime', monospace;
	}
	thead th {
		color: var(--atlas-muted);
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	.comparison-controls {
		display: flex;
		align-items: end;
		gap: 0.65rem;
		margin-top: 0.8rem;
	}
	.comparison-controls label {
		display: grid;
		flex: 1;
		gap: 0.25rem;
	}
	.comparison-controls span {
		color: var(--atlas-muted);
		font-size: 0.68rem;
	}
	.comparison-result {
		margin: 0.65rem 0 0;
		border-left: 2px solid var(--atlas-accent);
		padding-left: 0.65rem;
		color: var(--atlas-muted);
		font-size: 0.74rem;
		line-height: 1.5;
	}

	@media (max-width: 640px) {
		header,
		.comparison-controls {
			align-items: stretch;
			flex-direction: column;
		}
		.batch-summary {
			grid-template-columns: 1fr;
		}
	}
</style>
