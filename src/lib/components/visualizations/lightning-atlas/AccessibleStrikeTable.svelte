<script lang="ts">
	import type { LightningFlash } from '$lib/visualizations/lightning-atlas/types';

	type Props = {
		flashes: LightningFlash[];
		selectedIndex: number;
		onselect?: (flash: LightningFlash) => void;
	};

	let { flashes, selectedIndex, onselect }: Props = $props();
	const metres = (value: number) =>
		value >= 1_000 ? `${(value / 1_000).toFixed(2)} km` : `${Math.round(value)} m`;
</script>

<section class="table-wrap" aria-label="Recent simulated strike log">
	<table>
		<caption>Recent strike log — every value is simulated</caption>
		<thead>
			<tr>
				<th scope="col">Flash</th>
				<th scope="col">Family</th>
				<th scope="col">Scale</th>
				<th scope="col">Attachment</th>
				<th scope="col">Branches</th>
				<th scope="col">Channel</th>
				<th scope="col">Thunder</th>
			</tr>
		</thead>
		<tbody>
			{#each flashes as flash (flash.id)}
				<tr class:selected={flash.strikeIndex === selectedIndex}>
					<th scope="row">
						<button
							type="button"
							aria-pressed={flash.strikeIndex === selectedIndex}
							onclick={() => onselect?.(flash)}
						>
							{flash.strikeIndex + 1}
						</button>
					</th>
					<td>{flash.type}</td>
					<td>{flash.strikeScale}</td>
					<td>{flash.attachment?.label ?? 'Intra-cloud'}</td>
					<td>{flash.branchCount}</td>
					<td>{metres(flash.channelLengthMetres)}</td>
					<td>{flash.thunderDelaySeconds.toFixed(1)} s</td>
				</tr>
			{:else}
				<tr><td colspan="7">No simulated strikes yet.</td></tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--atlas-line);
		border-radius: 0.45rem;
		background: var(--atlas-panel);
		color: var(--atlas-text);
	}

	table {
		width: 100%;
		min-width: 42rem;
		border-collapse: collapse;
		font-size: 0.75rem;
	}

	caption {
		padding: 0.7rem;
		color: var(--atlas-muted);
		font-family: 'Courier Prime', monospace;
		text-align: left;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	th,
	td {
		padding: 0.58rem 0.68rem;
		border-top: 1px solid var(--atlas-line);
		text-align: left;
	}

	thead th {
		color: var(--atlas-muted);
		font-size: 0.68rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	tr.selected {
		background: color-mix(in srgb, var(--atlas-accent) 10%, transparent);
	}

	button {
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.3rem;
		background: var(--atlas-control);
		color: var(--atlas-accent);
		font: inherit;
		font-weight: 700;
	}
</style>
