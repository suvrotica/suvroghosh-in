<script lang="ts">
	let {
		title,
		index,
		annotation,
		items,
		total,
		wide = false
	}: {
		title: string;
		index: string;
		annotation: string;
		items: { key: string; label: string; views: number }[];
		total: number;
		wide?: boolean;
	} = $props();
	const count = (value: number) => new Intl.NumberFormat('en-GB').format(value);
	let maximum = $derived(Math.max(1, ...items.map((item) => item.views)));
</script>

<section class:wide class="ranking-panel" aria-label={title}>
	<header>
		<div>
			<span class="index">{index}</span>
			<h2>{title}</h2>
		</div>
		<span class="column-label">Views</span>
	</header>
	<p class="annotation">{annotation}</p>
	{#if items.length}
		<ol>
			{#each items.slice(0, 10) as item, rank (item.key)}
				<li>
					<span class="rank" aria-hidden="true">{String(rank + 1).padStart(2, '0')}</span>
					<div class="entry">
						<div class="entry-label">
							<span title={item.label}>{item.label}</span><strong>{count(item.views)}</strong>
						</div>
						<div class="bar-track" aria-hidden="true">
							<span style:width={`${(item.views / maximum) * 100}%`}></span>
						</div>
						<span class="sr-only"
							>{total > 0 ? Math.round((item.views / total) * 100) : 0}% of recorded views.</span
						>
					</div>
				</li>
			{/each}
		</ol>
		{#if items.length > 10}<p class="more">
				Top 10 of {count(items.length)} recorded entries. Export for all returned rows.
			</p>{/if}
	{:else}
		<p class="empty">No recorded views in this breakdown.</p>
	{/if}
</section>

<style>
	.ranking-panel {
		min-width: 0;
		border-top: 2px solid var(--ink);
		padding-top: 1.1rem;
	}
	header,
	header > div {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
	}
	header {
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font: 600 clamp(1.5rem, 2.4vw, 1.9rem)/1.15 var(--font-serif);
		letter-spacing: -0.035em;
	}
	.index,
	.column-label,
	.rank {
		color: var(--ink-faint);
		font: 0.65rem/1.4 var(--font-mono);
	}
	.index {
		color: var(--observatory-rust, var(--ink-muted));
	}
	.column-label {
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.annotation {
		margin: 0.6rem 0 1.1rem;
		color: var(--ink-muted);
		font-size: 0.76rem;
		line-height: 1.5;
	}
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: start;
		gap: 0.8rem;
		border-top: 1px solid var(--rule);
		padding: 0.8rem 0;
	}
	.rank {
		flex: 0 0 1.2rem;
		margin-top: 0.14rem;
	}
	.entry {
		flex: 1;
		min-width: 0;
	}
	.entry-label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		font-size: 0.82rem;
		line-height: 1.45;
	}
	.entry-label > span {
		overflow-wrap: anywhere;
	}
	.entry-label strong {
		flex-shrink: 0;
		font: 600 0.85rem/1.45 var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.bar-track {
		height: 3px;
		margin-top: 0.6rem;
		background: color-mix(in srgb, var(--accent) 9%, transparent);
	}
	.bar-track span {
		display: block;
		height: 100%;
		min-width: 1px;
		background: var(--accent);
	}
	.empty,
	.more {
		padding: 1rem 0;
		border-top: 1px solid var(--rule);
		color: var(--ink-faint);
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.more {
		font-size: 0.65rem;
	}
</style>
