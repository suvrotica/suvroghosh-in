<script lang="ts">
	import {
		ALL_PRESETS,
		type PresetShelf,
		type ShellPreset
	} from '$lib/visualizations/gastropod-shell-lab/shell/presets';
	import PresetThumbnail from './PresetThumbnail.svelte';

	interface Props {
		currentPresetId?: string;
		collapsed?: boolean;
		onselect: (preset: ShellPreset) => void;
		oncollapsedchange?: (value: boolean) => void;
	}

	let { currentPresetId, collapsed = false, onselect, oncollapsedchange }: Props = $props();
	let shelf = $state<PresetShelf>('gastropod-archetypes');
	let query = $state('');

	const shelfMeta: Record<PresetShelf, { label: string; short: string; count: number }> = {
		'gastropod-archetypes': {
			label: 'Gastropod archetypes',
			short: 'Gastropods',
			count: ALL_PRESETS.filter((preset) => preset.shelf === 'gastropod-archetypes').length
		},
		'comparative-molluscs': {
			label: 'Comparative molluscs',
			short: 'Comparative',
			count: ALL_PRESETS.filter((preset) => preset.shelf === 'comparative-molluscs').length
		},
		'mathematical-experiments': {
			label: 'Mathematical experiments',
			short: 'Experiments',
			count: ALL_PRESETS.filter((preset) => preset.shelf === 'mathematical-experiments').length
		}
	};

	let filtered = $derived(
		ALL_PRESETS.filter((preset) => {
			const term = query.trim().toLowerCase();
			return (
				preset.shelf === shelf &&
				(!term ||
					preset.title.toLowerCase().includes(term) ||
					preset.morphologicalNote.toLowerCase().includes(term))
			);
		})
	);
</script>

<aside class:collapsed class="preset-browser" aria-label="Shell preset browser">
	<header>
		<div>
			<p class="panel-title">Model-generated forms</p>
			<h2>Specimen drawers</h2>
		</div>
		<button
			class="icon-button collapse"
			type="button"
			aria-label={collapsed ? 'Expand preset browser' : 'Collapse preset browser'}
			onclick={() => oncollapsedchange?.(!collapsed)}>{collapsed ? '›' : '‹'}</button
		>
	</header>

	{#if !collapsed}
		<label class="search">
			<span class="sr-only">Search presets</span>
			<span aria-hidden="true">⌕</span>
			<input type="search" placeholder="Search forms…" bind:value={query} />
		</label>

		<div class="shelf-tabs" role="tablist" aria-label="Preset shelves">
			{#each Object.entries(shelfMeta) as [id, meta] (id)}
				<button
					type="button"
					role="tab"
					aria-selected={shelf === id}
					onclick={() => (shelf = id as PresetShelf)}
				>
					<span>{meta.short}</span><strong>{meta.count}</strong>
				</button>
			{/each}
		</div>

		{#if shelf === 'comparative-molluscs'}
			<p class="taxonomy-note">
				<strong>Taxonomic comparison:</strong> these are cephalopods, not gastropods.
			</p>
		{:else if shelf === 'mathematical-experiments'}
			<p class="taxonomy-note">
				<strong>Beyond archetypes:</strong> deterministic mathematical forms from the same engine.
			</p>
		{/if}

		<div class="preset-list" role="tabpanel" aria-label={shelfMeta[shelf].label}>
			{#each filtered as preset (preset.id)}
				<button
					class:active={currentPresetId === preset.id}
					class:warning={preset.diagnostics.declaredStatus !== 'safe'}
					class="preset-card"
					type="button"
					onclick={() => onselect(preset)}
					aria-pressed={currentPresetId === preset.id}
					aria-label={`${preset.title}. ${preset.scopeBadge}. ${preset.morphologicalNote} Scientific note: ${preset.scientificNote}`}
					title={`${preset.taxonomicClass} · ${preset.viewHint}\n${preset.scientificNote}`}
				>
					<div class="thumbnail">
						<PresetThumbnail
							recipe={preset.recipe}
							label={preset.title}
							active={currentPresetId === preset.id}
						/>
						<span class="schematic-mark" aria-hidden="true">Schematic</span>
						{#if preset.diagnostics.declaredStatus !== 'safe'}
							<span class="warning-mark" aria-label={preset.diagnostics.declaredStatus}>!</span>
						{/if}
					</div>
					<div class="preset-copy">
						<div class="preset-title">
							<strong>{preset.title}</strong><span class="seed number"
								>#{preset.seed.toString(16).padStart(8, '0')}</span
							>
						</div>
						<p>{preset.morphologicalNote}</p>
						<small class="scientific">{preset.scientificNote}</small>
						<span class="scope">{preset.scopeBadge} · {preset.viewHint}</span>
					</div>
				</button>
			{/each}
			{#if filtered.length === 0}<p class="empty">No forms match “{query}”.</p>{/if}
		</div>
	{/if}
</aside>

<style>
	.preset-browser {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border-right: 1px solid var(--line);
		background: var(--bg-raised);
		transition: width 160ms ease;
		overflow: hidden;
	}

	.preset-browser.collapsed {
		width: 44px;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-height: 58px;
		padding: 0.7rem 0.75rem;
		border-bottom: 1px solid var(--line);
	}

	.collapsed header {
		justify-content: center;
		padding: 0.4rem;
	}

	.collapsed header > div {
		display: none;
	}

	h2 {
		margin: 0.14rem 0 0;
		font-size: 0.95rem;
		font-weight: 650;
	}

	.collapse {
		flex: 0 0 auto;
		width: 30px;
		height: 30px;
		min-height: 30px;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0.65rem;
		padding: 0 0.55rem;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--bg);
		color: var(--faint);
	}

	.search input {
		width: 100%;
		height: 34px;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font-size: 0.7rem;
	}

	.search input::placeholder {
		color: var(--faint);
	}

	.shelf-tabs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 0 0.65rem 0.65rem;
	}

	.shelf-tabs button {
		display: grid;
		place-items: center;
		gap: 0.12rem;
		min-width: 0;
		min-height: 42px;
		padding: 0.25rem 0.18rem;
		border: 0;
		border-bottom: 2px solid var(--line);
		background: transparent;
		font-size: 0.54rem;
		color: var(--muted);
	}

	.shelf-tabs button strong {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.54rem;
		font-weight: 500;
		color: var(--faint);
	}

	.shelf-tabs button[aria-selected='true'] {
		border-bottom-color: var(--amber);
		color: var(--amber);
	}

	.taxonomy-note {
		margin: 0 0.65rem 0.6rem;
		padding: 0.48rem 0.55rem;
		border-left: 2px solid var(--cyan);
		background: color-mix(in srgb, var(--cyan-soft) 12%, transparent);
		font-size: 0.58rem;
		line-height: 1.45;
		color: var(--muted);
	}

	.taxonomy-note strong {
		color: var(--cyan);
	}

	.preset-list {
		display: grid;
		flex: 1 1 0;
		align-content: start;
		gap: 0.48rem;
		min-height: 0;
		padding: 0 0.65rem 0.8rem;
		overflow-y: auto;
	}

	.preset-card {
		display: grid;
		grid-template-columns: 82px minmax(0, 1fr);
		min-height: 108px;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--panel);
		text-align: left;
		overflow: hidden;
	}

	.preset-card:hover {
		border-color: var(--line-bright);
		background: var(--panel-2);
	}

	.preset-card.active {
		border-color: var(--amber);
		box-shadow: inset 3px 0 0 var(--amber);
	}

	.preset-card.warning:not(.active) {
		border-color: color-mix(in srgb, var(--danger) 35%, var(--line));
	}

	.thumbnail {
		position: relative;
		min-width: 0;
		height: 108px;
		border-right: 1px solid var(--line);
	}

	.warning-mark {
		position: absolute;
		top: 5px;
		left: 5px;
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--danger);
		font-size: 0.6rem;
		font-weight: 800;
		color: #170907;
	}

	.schematic-mark {
		position: absolute;
		right: 4px;
		bottom: 4px;
		padding: 0.12rem 0.24rem;
		border: 1px solid var(--line);
		border-radius: 3px;
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		font-size: 0.42rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--faint);
	}

	.preset-copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 0.52rem 0.58rem;
	}

	.preset-title {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.4rem;
	}

	.preset-title strong {
		overflow: hidden;
		font-size: 0.7rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.seed {
		font-size: 0.48rem;
		color: var(--faint);
	}

	.preset-copy p {
		display: -webkit-box;
		margin: 0.28rem 0 0;
		overflow: hidden;
		font-size: 0.56rem;
		line-height: 1.35;
		color: var(--muted);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.scientific {
		display: -webkit-box;
		margin-top: 0.22rem;
		overflow: hidden;
		font-size: 0.51rem;
		line-height: 1.3;
		color: var(--faint);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.scope {
		margin-top: auto;
		padding-top: 0.28rem;
		font-size: 0.49rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--cyan);
	}

	.empty {
		padding: 1.4rem 0.5rem;
		font-size: 0.68rem;
		text-align: center;
		color: var(--muted);
	}

	@media (max-width: 900px) {
		.preset-browser {
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}

		.preset-browser header,
		.search,
		.taxonomy-note,
		.collapse {
			display: none;
		}

		.shelf-tabs {
			padding: 0.4rem 0.65rem;
		}

		.shelf-tabs button {
			min-height: 44px;
		}

		.preset-list {
			display: flex;
			gap: 0.55rem;
			padding: 0 0.65rem 0.7rem;
			overflow-x: auto;
			overflow-y: hidden;
			scroll-snap-type: x proximity;
		}

		.preset-card {
			flex: 0 0 220px;
			grid-template-columns: 72px minmax(0, 1fr);
			scroll-snap-align: start;
		}

		.thumbnail {
			height: 108px;
		}
	}
</style>
