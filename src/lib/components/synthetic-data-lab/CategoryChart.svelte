<script lang="ts">
	let { values = [], name = 'category' }: { values?: unknown[]; name?: string } = $props();
	let categories = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const v of values) {
			if (v !== null && v !== undefined) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
	});
	let max = $derived(Math.max(1, ...categories.map((c) => c[1])));
	const colors = ['#087f80', '#2d756b', '#47755c', '#5d6f44', '#94612f', '#965840'];
</script>

<div class="categories" role="img" aria-label={`Category frequencies for ${name}`}>
	{#each categories as [label, count], i}<div class="row">
			<span class="name">{label}</span>
			<div class="track">
				<div style={`width:${(count / max) * 100}%;background:${colors[i % colors.length]}`}>
					<span>{count.toLocaleString()}</span>
				</div>
			</div>
			<span class="pct">{((count / Math.max(1, values.length)) * 100).toFixed(1)}%</span>
		</div>{/each}
	{#if !categories.length}<p>Your category frequencies appear here.</p>{/if}
</div>

<style>
	.categories {
		padding: 20px 10px;
		min-height: 220px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 12px;
	}
	.row {
		display: grid;
		grid-template-columns: 100px 1fr 55px;
		gap: 12px;
		align-items: center;
		font-size: 12px;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #455e59;
	}
	.track {
		height: 26px;
		background: #f0f3ed;
		border-radius: 3px;
	}
	.track div {
		height: 100%;
		border-radius: 3px;
		min-width: 34px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}
	.track span {
		padding: 0 7px;
		font-size: 10px;
		color: #fff;
	}
	.pct {
		color: #52665b;
		font-variant-numeric: tabular-nums;
	}
	p {
		text-align: center;
		color: #52665b;
	}
	@media (max-width: 500px) {
		.row {
			grid-template-columns: 70px 1fr 46px;
			gap: 8px;
		}
	}
</style>
