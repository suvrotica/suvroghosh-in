<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		snapshotForDisplay,
		validatePublicSnapshot
	} from '$lib/visualizations/mindmap-studio/exports';

	let {
		data,
		title = '',
		caption = '',
		sourceWarning = '',
		outlineOpen = false
	}: {
		data: unknown;
		title?: string;
		caption?: string;
		sourceWarning?: string;
		outlineOpen?: boolean;
	} = $props();
	const checked = $derived.by(() => {
		try {
			return { snapshot: validatePublicSnapshot(data), error: '' };
		} catch (error) {
			return {
				snapshot: null,
				error: error instanceof Error ? error.message : 'The published map could not be read.'
			};
		}
	});
	const snapshot = $derived(checked.snapshot);
	const project = $derived(snapshot ? snapshotForDisplay(snapshot) : null);
	const displayTitle = $derived(title || snapshot?.title || 'Published mind map');
	let MapCanvas = $state<
		| typeof import('$lib/components/visualizations/mindmap-studio/MindMapCanvas.svelte').default
		| null
	>(null);
	let GraphCanvas = $state<
		| typeof import('$lib/components/visualizations/mindmap-studio/KnowledgeGraph.svelte').default
		| null
	>(null);
	let active = $state(false);
	let loading = $state(false);
	let error = $state('');
	let view = $state<'map' | 'graph'>('map');
	let selectedId = $state<string | null>(null);
	let selectedEdgeId = $state<string | null>(null);
	let disposed = false;
	const selectedNode = $derived(snapshot?.nodes.find((node) => node.id === selectedId));
	const selectedEdge = $derived(snapshot?.edges.find((edge) => edge.id === selectedEdgeId));
	onDestroy(() => {
		disposed = true;
	});

	async function activate() {
		if (loading || !snapshot) return;
		loading = true;
		error = '';
		try {
			const [map, graph] = await Promise.all([
				import('$lib/components/visualizations/mindmap-studio/MindMapCanvas.svelte'),
				import('$lib/components/visualizations/mindmap-studio/KnowledgeGraph.svelte')
			]);
			if (disposed) return;
			MapCanvas = map.default;
			GraphCanvas = graph.default;
			active = true;
		} catch {
			if (!disposed)
				error =
					'The interactive view could not load. The complete text outline is available below.';
		} finally {
			if (!disposed) loading = false;
		}
	}
	function selectNode(id: string) {
		selectedId = id;
		selectedEdgeId = null;
	}
	function selectEdge(id: string) {
		selectedEdgeId = id;
		selectedId = null;
	}
</script>

{#snippet outline(parentId: string | null)}
	{#if snapshot}
		<ol>
			{#each snapshot.nodes.filter((node) => node.parentId === parentId) as node (node.id)}
				<li>
					<strong>{node.label}</strong> <span class="status">{node.status}</span>
					{#if node.description}<p>{node.description}</p>{/if}
					{#if snapshot.nodes.some((child) => child.parentId === node.id)}{@render outline(
							node.id
						)}{/if}
				</li>
			{/each}
		</ol>
	{/if}
{/snippet}

<figure class="mindmap-figure" class:night={snapshot?.theme === 'night'} aria-label={displayTitle}>
	<header>
		<div>
			<span class="eyebrow">A map of ideas</span>
			<h3>{displayTitle}</h3>
		</div>
		{#if snapshot}<span class="count"
				>{snapshot.nodes.length} ideas · {snapshot.edges.length} connections</span
			>{/if}
	</header>
	{#if checked.error}
		<p class="notice" role="alert">{checked.error}</p>
	{:else if snapshot && project}
		<div class="reading-actions">
			{#if !active}
				<button type="button" disabled={loading} onclick={activate}
					>{loading ? 'Opening the map…' : 'Explore this map'}</button
				>
				<span>Pan, zoom and follow connections.</span>
			{:else}
				<div class="view-switch" aria-label="Published map view">
					<button
						type="button"
						aria-pressed={view === 'map'}
						onclick={() => {
							view = 'map';
						}}>Mind map</button
					>
					<button
						type="button"
						aria-pressed={view === 'graph'}
						onclick={() => {
							view = 'graph';
						}}>Knowledge graph</button
					>
				</div>
				<button
					type="button"
					class="quiet"
					onclick={() => {
						active = false;
					}}>Close interactive view</button
				>
			{/if}
		</div>
		{#if error}<p class="notice" role="status">{error}</p>{/if}
		{#if active && MapCanvas && GraphCanvas}
			<div class="figure-canvas">
				{#if view === 'map'}
					<MapCanvas
						{project}
						{selectedId}
						onselect={selectNode}
						onchange={() => {}}
						readonly={true}
						onerror={(message) => {
							error = message;
						}}
					/>
				{:else}
					<GraphCanvas
						{project}
						{selectedId}
						onselect={selectNode}
						onedgeselect={selectEdge}
						onerror={(message) => {
							error = message;
						}}
					/>
				{/if}
			</div>
			{#if selectedNode}
				<aside class="selection" aria-label="Selected idea" aria-live="polite">
					<span class="status">{selectedNode.category} · {selectedNode.status}</span>
					<h4>{selectedNode.label}</h4>
					<p>{selectedNode.description || 'No further description was published for this idea.'}</p>
				</aside>
			{:else if selectedEdge}
				<aside class="selection" aria-label="Selected relationship" aria-live="polite">
					<span class="status">{selectedEdge.status}</span>
					<h4>
						{snapshot.nodes.find((node) => node.id === selectedEdge.from)?.label} → {selectedEdge.type.replaceAll(
							'_',
							' '
						)} → {snapshot.nodes.find((node) => node.id === selectedEdge.to)?.label}
					</h4>
					<p>
						{selectedEdge.rationale || 'No further rationale was published for this relationship.'}
					</p>
				</aside>
			{/if}
		{/if}
		<details class="text-outline" open={outlineOpen && !active}>
			<summary>Read the complete text outline</summary>
			{@render outline(null)}
			{#if snapshot.edges.length}
				<h4>Connections across branches</h4>
				<ul>
					{#each snapshot.edges as edge (edge.id)}<li>
							<strong>{snapshot.nodes.find((node) => node.id === edge.from)?.label}</strong> → {edge.type.replaceAll(
								'_',
								' '
							)} → <strong>{snapshot.nodes.find((node) => node.id === edge.to)?.label}</strong>
							<span class="status">{edge.status}</span>{#if edge.rationale}<p>
									{edge.rationale}
								</p>{/if}
						</li>{/each}
				</ul>
			{/if}
		</details>
	{/if}
	<figcaption>
		{#if caption}<p>{caption}</p>{/if}
		<p class="source-warning">
			This published snapshot omits original source bodies and evidence excerpts. Explicit, inferred
			and speculative labels record the author's classification; source support cannot be
			independently checked in this view.{sourceWarning ? ` ${sourceWarning}` : ''}
		</p>
	</figcaption>
</figure>

<style>
	.mindmap-figure {
		--figure-paper: #f7f2e7;
		--figure-surface: #fdfaf3;
		--figure-ink: #2b241c;
		--figure-muted: #655e52;
		--figure-rule: #ded7c9;
		margin: 2rem 0;
		overflow: hidden;
		border: 1px solid var(--figure-rule);
		border-radius: 16px;
		background: var(--figure-paper);
		color: var(--figure-ink);
	}
	.mindmap-figure.night {
		--figure-paper: #202724;
		--figure-surface: #29342f;
		--figure-ink: #f2ecdf;
		--figure-muted: #c1c6bc;
		--figure-rule: #46534b;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 22px 24px;
		border-bottom: 1px solid var(--figure-rule);
	}
	h3 {
		margin: 6px 0 0;
		color: inherit;
		font: 500 1.6rem/1.2 var(--font-serif, Georgia, serif);
	}
	.eyebrow {
		font: 11px var(--font-sans, sans-serif);
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: var(--figure-muted);
	}
	.count {
		font-size: 12px;
		color: var(--figure-muted);
	}
	.reading-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		justify-content: space-between;
		align-items: center;
		padding: 14px 24px;
		font: 13px var(--font-sans, sans-serif);
	}
	.reading-actions > span {
		color: var(--figure-muted);
	}
	button {
		border: 1px solid var(--figure-rule);
		border-radius: 7px;
		padding: 10px 14px;
		min-height: 44px;
		color: inherit;
		background: var(--figure-surface);
		font: inherit;
		cursor: pointer;
	}
	button[aria-pressed='true'] {
		background: #355f50;
		border-color: #355f50;
		color: #fffaf0;
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid #8b6427;
		outline-offset: 3px;
	}
	button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.view-switch {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.quiet {
		background: transparent;
	}
	.figure-canvas {
		height: min(72vh, 720px);
		min-height: 600px;
		border-block: 1px solid var(--figure-rule);
	}
	.selection {
		padding: 20px 24px;
		border-bottom: 1px solid var(--figure-rule);
		background: var(--figure-surface);
	}
	h4 {
		margin: 0.35rem 0;
		color: inherit;
		font-size: 1rem;
	}
	.selection p {
		margin-bottom: 0;
	}
	.status {
		color: var(--figure-muted);
		font: 11px var(--font-sans, sans-serif);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.text-outline {
		padding: 18px 24px;
		font-size: 0.93rem;
		line-height: 1.6;
	}
	.text-outline summary {
		cursor: pointer;
		font-weight: 600;
	}
	.text-outline :global(ol),
	.text-outline ul {
		padding-left: 1.3rem;
	}
	.text-outline :global(li) {
		margin: 0.6rem 0;
	}
	.text-outline :global(p) {
		margin: 0.25rem 0 0.75rem;
		color: var(--figure-muted);
		overflow-wrap: anywhere;
	}
	.text-outline :global(strong) {
		color: inherit;
	}
	figcaption {
		padding: 16px 24px;
		border-top: 1px solid var(--figure-rule);
		font-size: 0.85rem;
		line-height: 1.6;
	}
	figcaption p {
		margin: 0 0 0.5rem;
	}
	.source-warning {
		color: var(--figure-muted);
		font-size: 0.78rem;
	}
	.notice {
		padding: 16px 24px;
		font-size: 0.9rem;
	}
	@media (max-width: 600px) {
		header,
		.reading-actions,
		.selection,
		.text-outline,
		figcaption {
			padding-inline: 15px;
		}
		h3 {
			font-size: 1.35rem;
		}
		.figure-canvas {
			min-height: 600px;
		}
		.reading-actions > span {
			display: none;
		}
	}
	@media print {
		.reading-actions,
		.figure-canvas,
		.selection {
			display: none;
		}
		.mindmap-figure {
			break-inside: auto;
		}
		.text-outline {
			display: block;
		}
	}
</style>
