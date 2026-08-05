<script lang="ts">
	import sourceRegistry from '$lib/data/bias-archipelago/sources.json';
	import type {
		Bias,
		BiasNeighbour,
		BiasRelation
	} from '$lib/visualizations/bias-archipelago/bias-types';

	type SourceRecord = {
		id: string;
		url: string;
		doi: string;
		authors: string;
		year: number;
		title: string;
		venue: string;
		kind: 'original study' | 'meta-analysis' | 'review' | 'book chapter' | 'journal article';
	};

	const sourcesById = new Map(
		(sourceRegistry as SourceRecord[]).map((source) => [source.id.toLowerCase(), source])
	);

	let {
		bias,
		relations,
		neighbours,
		biasById,
		comparing,
		oncompare,
		onselect,
		onclose
	}: {
		bias: Bias;
		relations: BiasRelation[];
		neighbours: BiasNeighbour[];
		biasById: Map<string, Bias>;
		comparing: boolean;
		oncompare: () => void;
		onselect: (id: string) => void;
		onclose: () => void;
	} = $props();

	let sheetHeight = $state(44);
	let dragStartY = 0;
	let dragStartHeight = 44;
	let dragMoved = false;
	let dragging = $state(false);

	let nearby = $derived(
		relations.filter((relation) => ['shared-mechanism', 'near-overlap'].includes(relation.type))
	);
	let differentEngine = $derived(
		relations.filter((relation) => relation.type === 'same-effect-different-mechanism')
	);
	let cascades = $derived(relations.filter((relation) => relation.type === 'cascade'));
	let mirrors = $derived(relations.filter((relation) => relation.type === 'mirror'));
	let curatedNearbyIds = $derived(
		new Set(
			nearby.map((relation) => (relation.source === bias.id ? relation.target : relation.source))
		)
	);
	let featureNeighbours = $derived(
		neighbours.filter((neighbour) => !curatedNearbyIds.has(neighbour.id)).slice(0, 5)
	);

	function otherBias(relation: BiasRelation) {
		return biasById.get(relation.source === bias.id ? relation.target : relation.source);
	}

	function pointerDown(event: PointerEvent) {
		if (window.matchMedia('(min-width: 62rem)').matches) return;
		dragging = true;
		dragMoved = false;
		dragStartY = event.clientY;
		dragStartHeight = sheetHeight;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function pointerMove(event: PointerEvent) {
		if (!dragging) return;
		const delta = ((dragStartY - event.clientY) / window.innerHeight) * 100;
		if (Math.abs(delta) > 1) dragMoved = true;
		sheetHeight = Math.max(25, Math.min(78, dragStartHeight + delta));
	}

	function pointerUp() {
		dragging = false;
		if (!dragMoved) {
			cycleSheetHeight();
			return;
		}
		sheetHeight = sheetHeight > 58 ? 72 : sheetHeight < 34 ? 28 : 44;
	}

	function cycleSheetHeight() {
		sheetHeight = sheetHeight < 36 ? 44 : sheetHeight < 60 ? 72 : 28;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		if (event.key === 'Enter' || event.key === ' ') cycleSheetHeight();
		if (event.key === 'ArrowUp') sheetHeight = sheetHeight < 44 ? 44 : 72;
		if (event.key === 'ArrowDown') sheetHeight = sheetHeight > 44 ? 44 : 28;
		if (event.key === 'Home') sheetHeight = 28;
		if (event.key === 'End') sheetHeight = 72;
	}

	function sourceId(source: string) {
		try {
			const url = new URL(source);
			if (/^(?:dx\.)?doi\.org$/i.test(url.hostname)) {
				return decodeURIComponent(url.pathname.replace(/^\//, '')).toLowerCase();
			}
		} catch {
			// Keep the original identifier for the visible fallback below.
		}
		return source.toLowerCase();
	}

	function sourceRecord(source: string) {
		return sourcesById.get(sourceId(source));
	}

	function fallbackSourceLabel(source: string) {
		const id = sourceId(source);
		return id.startsWith('10.') ? `DOI ${id}` : source;
	}
</script>

<aside
	class="details"
	style={`--sheet-height:${sheetHeight}dvh`}
	aria-labelledby="bias-details-title"
	data-dragging={dragging}
>
	<button
		class="drag-handle"
		type="button"
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
		onkeydown={handleKeydown}
		aria-label={`Resize details sheet. Current height ${Math.round(sheetHeight)} percent. Tap to cycle or use arrow keys.`}
	>
		<span></span>
	</button>
	<header>
		<div>
			<p>{bias.family.replaceAll('-', ' ')} · peak record</p>
			<h3 id="bias-details-title" tabindex="-1">{bias.name}</h3>
		</div>
		<button class="close" type="button" onclick={onclose} aria-label="Close bias details">×</button>
	</header>

	<div class="actions">
		<button type="button" class:active={comparing} onclick={oncompare}>
			{comparing ? 'First peak chosen' : 'Compare this peak'}
		</button>
		<a href={`#index-${bias.id}`}>Open in textual index</a>
	</div>

	<section>
		<h4>What it is</h4>
		<p>{bias.definition}</p>
	</section>
	<section class="example">
		<h4>A street-level example</h4>
		<p>{bias.example}</p>
	</section>
	<section>
		<h4>Its recipe</h4>
		<ul class="chips" aria-label="Strongest components">
			{#each bias.mechanisms as mechanism (mechanism)}<li>
					{mechanism.replaceAll('-', ' ')}
				</li>{/each}
			{#each bias.triggers.slice(0, 3) as trigger (trigger)}<li>
					{trigger.replaceAll('-', ' ')}
				</li>{/each}
		</ul>
	</section>

	<section>
		<h4>Its nearest neighbours</h4>
		{#if nearby.length}
			{@render RelationList({ items: nearby, otherBias, onselect })}
		{/if}
		{#if featureNeighbours.length}
			<ul class="feature-neighbours">
				{#each featureNeighbours as neighbour (neighbour.id)}
					{@const other = biasById.get(neighbour.id)}
					{#if other}
						<li>
							<button type="button" onclick={() => onselect(other.id)}>{other.name}</button>
							<span class="feature-match">
								<strong
									>Feature match in this atlas: {(neighbour.similarity * 100).toFixed(0)}%</strong
								>
								<small
									>Computed from the declared editorial feature model—not an experimental effect
									size.</small
								>
							</span>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</section>
	<section>
		<h4>Same appearance, different engine</h4>
		{#if differentEngine.length}
			{@render RelationList({ items: differentEngine, otherBias, onselect })}
		{:else}
			<p class="empty-relation">No curated different-engine relation is recorded for this peak.</p>
		{/if}
	</section>
	<section>
		<h4>Can recruit / can be recruited by</h4>
		<p class="caution">
			These are documented or review-grounded decision sequences, not claims of inevitable
			causation.
		</p>
		{#if cascades.length}
			{@render RelationList({ items: cascades, otherBias, onselect })}
		{:else}
			<p class="empty-relation">No cautious cascade relation is currently curated for this peak.</p>
		{/if}
	</section>
	<section>
		<h4>Mirror or countercurrent</h4>
		{#if mirrors.length}
			{@render RelationList({ items: mirrors, otherBias, onselect })}
		{:else}
			<p class="empty-relation">No evidence-backed countercurrent is currently recorded.</p>
		{/if}
	</section>

	<section>
		<h4>Research lineage</h4>
		<p>
			{bias.lineages.map((lineage) => lineage.tradition).join(' · ')}{bias.firstAssociatedYear
				? ` · early source used in this atlas: ${bias.firstAssociatedYear}`
				: ''}
		</p>
		{#each bias.lineages.filter((lineage) => lineage.note) as lineage (lineage.tradition)}
			<p class="caution">{lineage.note}</p>
		{/each}
	</section>
	<section>
		<h4>Evidence note</h4>
		<p>
			<span class="status">{bias.evidenceStatus.replaceAll('-', ' ')}</span>
			{bias.evidenceNote}
		</p>
	</section>
	<section>
		<h4>Sources</h4>
		<ol class="sources">
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			{#each bias.canonicalSources as source (source)}
				<li>{@render SourceLink({ source })}</li>
			{/each}
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</ol>
	</section>
</aside>

{#snippet RelationList({
	items,
	otherBias,
	onselect
}: {
	items: BiasRelation[];
	otherBias: (relation: BiasRelation) => Bias | undefined;
	onselect: (id: string) => void;
})}
	<ul class="relations">
		{#each items as relation (`${relation.source}:${relation.target}:${relation.type}`)}
			{@const other = otherBias(relation)}
			<li>
				{#if other}<button type="button" onclick={() => onselect(other.id)}>{other.name}</button
					>{/if}
				<span>{relation.explanation}</span>
				<small>{relation.strength} · {relation.type.replaceAll('-', ' ')}</small>
				<span class="relation-sources">
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					{#each relation.sourceIds as source (source)}
						{@render SourceLink({ source, compact: true })}
					{/each}
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet SourceLink({ source, compact = false }: { source: string; compact?: boolean })}
	{@const record = sourceRecord(source)}
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		class="source-link"
		class:compact
		href={record?.url ?? source}
		target="_blank"
		rel="noreferrer"
	>
		{#if record}
			<span>
				<strong>{record.authors} ({record.year})</strong>, “{record.title}” —
				<em>{record.venue}</em>
			</span>
			<small>{record.kind}</small>
		{:else}
			<span>Source metadata unavailable — {fallbackSourceLabel(source)}</span>
			<small>external source</small>
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

<style>
	.details {
		min-width: 0;
		max-height: 48rem;
		overflow: auto;
		border: 1px solid var(--arch-rule);
		border-radius: 0.65rem;
		background: var(--arch-panel);
		color: var(--arch-text);
		scrollbar-color: var(--arch-rule) transparent;
	}

	.drag-handle {
		display: none;
	}

	header {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
		border-bottom: 1px solid var(--arch-rule);
		background: color-mix(in srgb, var(--arch-panel) 96%, transparent);
		backdrop-filter: blur(0.6rem);
	}

	header p {
		margin: 0 0 0.2rem;
		color: var(--arch-muted);
		font-size: 0.62rem;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		font-family: var(--arch-serif);
		font-size: 1.5rem;
		line-height: 1.05;
	}

	.close {
		width: 2.5rem;
		height: 2.5rem;
		border: 1px solid var(--arch-rule);
		border-radius: 999px;
		background: transparent;
		color: var(--arch-text);
		font-size: 1.4rem;
		cursor: pointer;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid var(--arch-rule);
	}

	.actions button,
	.actions a,
	.relations button,
	.feature-neighbours button {
		min-height: 2.35rem;
		padding: 0.42rem 0.65rem;
		border: 1px solid var(--arch-rule);
		border-radius: 999px;
		background: transparent;
		color: var(--arch-accent-bright);
		font: inherit;
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
	}

	.actions .active,
	.actions button:hover,
	.actions a:hover,
	.relations button:hover,
	.feature-neighbours button:hover {
		border-color: var(--arch-accent);
		background: color-mix(in srgb, var(--arch-accent) 15%, transparent);
	}

	section {
		padding: 0.9rem 1rem;
		border-bottom: 1px solid var(--arch-rule);
	}

	.feature-neighbours {
		display: grid;
		gap: 0.45rem;
		padding: 0;
		margin: 0.65rem 0 0;
		list-style: none;
	}

	.feature-neighbours li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
	}

	.feature-neighbours > li > span,
	.empty-relation {
		color: var(--arch-muted);
		font-size: 0.68rem;
	}

	.feature-match {
		display: grid;
		max-width: 17rem;
		gap: 0.18rem;
		text-align: right;
	}

	.feature-match strong {
		color: var(--arch-text);
		font-weight: 700;
	}

	.feature-match small {
		font-size: 0.62rem;
		line-height: 1.35;
	}

	h4 {
		margin: 0 0 0.38rem;
		color: var(--arch-accent-bright);
		font-size: 0.66rem;
		font-weight: 780;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	p {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.55;
	}

	.example {
		background: color-mix(in srgb, var(--arch-land) 8%, transparent);
	}

	.chips,
	.relations,
	.sources {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.chips li,
	.status {
		padding: 0.28rem 0.48rem;
		border: 1px solid var(--arch-rule);
		border-radius: 999px;
		color: var(--arch-muted);
		font-size: 0.66rem;
		text-transform: capitalize;
	}

	.relations {
		display: grid;
		gap: 0.65rem;
	}

	.relations li {
		display: grid;
		gap: 0.32rem;
	}

	.relations button {
		justify-self: start;
		min-height: 2rem;
		padding: 0.25rem 0.55rem;
	}

	.relations span {
		font-size: 0.76rem;
		line-height: 1.45;
	}

	.relations small,
	.caution {
		color: var(--arch-muted);
		font-size: 0.67rem;
	}

	.relation-sources {
		display: grid;
		gap: 0.45rem;
	}

	.source-link {
		display: grid;
		gap: 0.18rem;
		padding: 0.55rem 0.62rem;
		border: 1px solid var(--arch-rule);
		border-radius: 0.35rem;
		color: var(--arch-accent-bright);
		font-size: 0.72rem;
		line-height: 1.45;
		text-decoration: none;
	}

	.source-link:hover {
		border-color: var(--arch-accent);
		background: color-mix(in srgb, var(--arch-accent) 8%, transparent);
	}

	.source-link em {
		color: var(--arch-text);
	}

	.source-link small {
		color: var(--arch-muted);
		font-size: 0.62rem;
		font-weight: 750;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.source-link.compact {
		padding: 0.42rem 0.5rem;
		font-size: 0.67rem;
	}

	.sources {
		display: grid;
		gap: 0.35rem;
		counter-reset: sources;
	}

	@media (max-width: 61.99rem) {
		.feature-neighbours li {
			align-items: flex-start;
			flex-direction: column;
		}

		.feature-match {
			max-width: none;
			text-align: left;
		}

		.details {
			position: fixed;
			z-index: 40;
			right: 0.5rem;
			bottom: 0;
			left: 0.5rem;
			height: var(--sheet-height);
			max-height: 78dvh;
			border-bottom-right-radius: 0;
			border-bottom-left-radius: 0;
			box-shadow: 0 -1rem 3rem rgb(0 10 14 / 42%);
			transition: height 180ms ease;
		}

		.details[data-dragging='true'] {
			transition: none;
		}

		.drag-handle {
			display: grid;
			width: 100%;
			height: 2.75rem;
			place-items: center;
			border: 0;
			background: var(--arch-panel);
			touch-action: none;
			cursor: ns-resize;
		}

		.close {
			width: 2.75rem;
			height: 2.75rem;
		}

		.drag-handle span {
			width: 3rem;
			height: 0.25rem;
			border-radius: 999px;
			background: var(--arch-rule);
		}

		header {
			top: 2.75rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.details {
			transition: none;
		}
	}
</style>
