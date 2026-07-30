<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import type { ResourceCardRecord, ResourceKind } from '$lib/content/resources';
	import ResourceCard from './ResourceCard.svelte';

	let {
		prompts,
		lists
	}: {
		prompts: ResourceCardRecord[];
		lists: ResourceCardRecord[];
	} = $props();

	type TabDefinition = {
		kind: ResourceKind;
		hash: '#prompts' | '#word-lists';
		panelId: 'prompts' | 'word-lists';
		label: 'Prompts' | 'Word Lists';
	};

	const tabs: readonly TabDefinition[] = [
		{ kind: 'prompt', hash: '#prompts', panelId: 'prompts', label: 'Prompts' },
		{ kind: 'list', hash: '#word-lists', panelId: 'word-lists', label: 'Word Lists' }
	];

	let enhanced = $state(false);
	let activeKind = $state<ResourceKind>('prompt');
	let query = $state('');
	let promptTab: HTMLAnchorElement;
	let listTab: HTMLAnchorElement;

	// Global Pagefind remains intentionally blog/topic-only until it gains a deliberate resource
	// result type; this small catalogue searches only title, description, and tags in memory.
	function filterResources(resources: ResourceCardRecord[]) {
		const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
		if (words.length === 0) return resources;

		return resources.filter((resource) => {
			const haystack = [resource.title, resource.description, ...resource.tags]
				.join(' ')
				.toLocaleLowerCase();
			return words.every((word) => haystack.includes(word));
		});
	}

	let filteredPrompts = $derived(filterResources(prompts));
	let filteredLists = $derived(filterResources(lists));
	let activeTotal = $derived(activeKind === 'prompt' ? prompts.length : lists.length);
	let activeFiltered = $derived(
		activeKind === 'prompt' ? filteredPrompts.length : filteredLists.length
	);
	let searchLabel = $derived(activeKind === 'prompt' ? 'Search prompts' : 'Search word lists');
	let resultLabel = $derived(
		query.trim() && activeFiltered !== activeTotal
			? `${activeFiltered} of ${activeTotal} ${activeKind === 'prompt' ? 'prompts' : 'word lists'}`
			: `${activeTotal} ${activeKind === 'prompt' ? 'prompts' : 'word lists'}`
	);

	function tabFor(kind: ResourceKind) {
		return kind === 'prompt' ? promptTab : listTab;
	}

	function readLocation() {
		const url = new SvelteURL(window.location.href);
		activeKind = url.hash === '#word-lists' ? 'list' : 'prompt';
		query = url.searchParams.get('q') ?? '';
	}

	function writeLocation(kind: ResourceKind, mode: 'push' | 'replace') {
		const tab = tabs.find((candidate) => candidate.kind === kind) ?? tabs[0];
		const url = new SvelteURL(window.location.href);
		url.hash = tab.hash;
		window.history[`${mode}State`](window.history.state, '', url.toString());
	}

	function activate(kind: ResourceKind, mode: 'push' | 'replace' = 'push') {
		activeKind = kind;
		writeLocation(kind, mode);
	}

	function updateQuery(value: string) {
		query = value;
		const url = new SvelteURL(window.location.href);
		if (query.trim()) url.searchParams.set('q', query.trim());
		else url.searchParams.delete('q');
		window.history.replaceState(window.history.state, '', url.toString());
	}

	function handleTabClick(event: MouseEvent, kind: ResourceKind) {
		if (!enhanced) return;
		event.preventDefault();
		activate(kind);
	}

	function handleTabKeydown(event: KeyboardEvent, kind: ResourceKind) {
		if (!enhanced) return;

		const currentIndex = tabs.findIndex((tab) => tab.kind === kind);
		let nextIndex: number | undefined;
		if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
		if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		if (event.key === 'Home') nextIndex = 0;
		if (event.key === 'End') nextIndex = tabs.length - 1;

		if (nextIndex !== undefined) {
			event.preventDefault();
			const nextKind = tabs[nextIndex].kind;
			activate(nextKind, 'replace');
			requestAnimationFrame(() => tabFor(nextKind)?.focus());
			return;
		}

		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			activate(kind);
		}
	}

	onMount(() => {
		enhanced = true;
		readLocation();

		const restoreLocation = () => readLocation();
		window.addEventListener('hashchange', restoreLocation);
		window.addEventListener('popstate', restoreLocation);
		return () => {
			window.removeEventListener('hashchange', restoreLocation);
			window.removeEventListener('popstate', restoreLocation);
		};
	});
</script>

<section aria-labelledby="resource-catalogue-heading" class="mt-10" data-resource-catalogue>
	<h2 id="resource-catalogue-heading" class="sr-only">Field Kit catalogue</h2>

	<div
		class="border-y border-neutral-300 bg-neutral-100/75 px-2 py-2 dark:border-neutral-700 dark:bg-neutral-900/70"
	>
		<div role="tablist" aria-label="Field Kit resource types" class="grid grid-cols-2 gap-2">
			<a
				bind:this={promptTab}
				id="prompts-tab"
				href="#prompts"
				role="tab"
				aria-selected={activeKind === 'prompt'}
				aria-controls="prompts"
				aria-label={`Prompts, ${prompts.length}`}
				tabindex={enhanced ? (activeKind === 'prompt' ? 0 : -1) : 0}
				onclick={(event) => handleTabClick(event, 'prompt')}
				onkeydown={(event) => handleTabKeydown(event, 'prompt')}
				class="inline-flex min-h-12 min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-bold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 sm:px-4 dark:focus-visible:outline-neutral-300 {activeKind ===
				'prompt'
					? 'border-neutral-800 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-950'
					: 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 hover:text-neutral-950 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white'}"
			>
				<span>Prompts</span>
				<span
					aria-hidden="true"
					class="rounded-full border border-current/30 px-2 py-0.5 text-xs font-semibold"
					>{prompts.length}</span
				>
			</a>
			<a
				bind:this={listTab}
				id="word-lists-tab"
				href="#word-lists"
				role="tab"
				aria-selected={activeKind === 'list'}
				aria-controls="word-lists"
				aria-label={`Word Lists, ${lists.length}`}
				tabindex={enhanced ? (activeKind === 'list' ? 0 : -1) : 0}
				onclick={(event) => handleTabClick(event, 'list')}
				onkeydown={(event) => handleTabKeydown(event, 'list')}
				class="inline-flex min-h-12 min-w-0 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-bold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 sm:px-4 dark:focus-visible:outline-neutral-300 {activeKind ===
				'list'
					? 'border-neutral-800 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-950'
					: 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 hover:text-neutral-950 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white'}"
			>
				<span>Word Lists</span>
				<span
					aria-hidden="true"
					class="rounded-full border border-current/30 px-2 py-0.5 text-xs font-semibold"
					>{lists.length}</span
				>
			</a>
		</div>

		<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
			<label
				class="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-bold text-neutral-700 dark:text-neutral-200"
			>
				<span>{searchLabel}</span>
				<input
					type="search"
					value={query}
					placeholder={searchLabel}
					autocomplete="off"
					oninput={(event) => updateQuery(event.currentTarget.value)}
					class="h-11 min-w-0 rounded-md border border-neutral-300 bg-white px-3 text-base font-normal text-neutral-950 shadow-sm placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:focus-visible:outline-neutral-300"
				/>
			</label>
			{#if query}
				<button
					type="button"
					onclick={() => updateQuery('')}
					class="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-400 bg-white px-4 text-sm font-bold text-neutral-700 hover:border-neutral-600 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-400 dark:hover:text-white dark:focus-visible:outline-neutral-300"
				>
					Clear search
				</button>
			{/if}
		</div>

		<p
			class="mt-2 mb-0 text-left text-sm text-neutral-600 dark:text-neutral-400"
			aria-live="polite"
		>
			{resultLabel}
		</p>
	</div>

	<div
		id="prompts"
		role="tabpanel"
		aria-labelledby="prompts-tab"
		tabindex="0"
		hidden={enhanced && activeKind !== 'prompt'}
		class="resource-panel scroll-mt-28 pt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-500"
		data-resource-panel="prompts"
	>
		<div class="mb-5 border-b border-neutral-300 pb-4 dark:border-neutral-700">
			<h2 class="m-0 text-2xl font-bold text-neutral-950 dark:text-neutral-50">Prompts</h2>
			<p class="mt-2 mb-0 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
				Reusable working briefs for implementation, research, editing, visual thinking, and creative
				practice.
			</p>
		</div>
		{#if filteredPrompts.length > 0}
			<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
				{#each filteredPrompts as resource (resource.ref)}
					<ResourceCard {resource} />
				{/each}
			</div>
		{:else}
			<div
				role="status"
				aria-live="polite"
				class="rounded-lg border border-dashed border-neutral-400 px-5 py-10 text-center dark:border-neutral-600"
				data-no-results
			>
				<h3 class="m-0 text-lg font-bold">No prompts matched</h3>
				<p class="mt-2 mb-0 text-center text-sm text-neutral-600 dark:text-neutral-400">
					Try fewer words or clear the search.
				</p>
			</div>
		{/if}
	</div>

	<div
		id="word-lists"
		role="tabpanel"
		aria-labelledby="word-lists-tab"
		tabindex="0"
		hidden={enhanced && activeKind !== 'list'}
		class="resource-panel scroll-mt-28 pt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-500"
		data-resource-panel="lists"
	>
		<div class="mb-5 border-b border-neutral-300 pb-4 dark:border-neutral-700">
			<h2 class="m-0 text-2xl font-bold text-neutral-950 dark:text-neutral-50">Word Lists</h2>
			<p class="mt-2 mb-0 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
				Precise vocabulary organised by use, register, nuance, and the situations in which a bare
				synonym is not enough.
			</p>
		</div>
		{#if filteredLists.length > 0}
			<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
				{#each filteredLists as resource (resource.ref)}
					<ResourceCard {resource} />
				{/each}
			</div>
		{:else}
			<div
				role="status"
				aria-live="polite"
				class="rounded-lg border border-dashed border-neutral-400 px-5 py-10 text-center dark:border-neutral-600"
				data-no-results
			>
				<h3 class="m-0 text-lg font-bold">No word lists matched</h3>
				<p class="mt-2 mb-0 text-center text-sm text-neutral-600 dark:text-neutral-400">
					Try fewer words or clear the search.
				</p>
			</div>
		{/if}
	</div>
</section>

<style>
	.resource-panel:not([hidden]) {
		animation: field-kit-panel-in 160ms ease-out both;
	}

	@keyframes field-kit-panel-in {
		from {
			opacity: 0.72;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.resource-panel:not([hidden]) {
			animation: none;
		}
	}
</style>
