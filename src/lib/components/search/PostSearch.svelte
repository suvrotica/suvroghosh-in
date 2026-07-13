<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArchivePagination from '$lib/components/blog/ArchivePagination.svelte';
	import PostGallery from '$lib/components/blog/PostGallery.svelte';
	import type { BlogPostSummary } from '$lib/content/posts';
	import { BLOG_PAGE_SIZE } from '$lib/content/pagination';

	type SearchSort = 'relevance' | 'newest' | 'oldest';
	type SearchFacets = {
		categories: { slug: string; label: string; count: number }[];
		years: { value: string; count: number }[];
	};
	type PagefindResultData = {
		url: string;
		excerpt: string;
		plain_excerpt: string;
		meta: Record<string, string>;
	};
	type PagefindResultHandle = {
		data: () => Promise<PagefindResultData>;
	};
	type PagefindSearchResponse = {
		results: PagefindResultHandle[];
	};
	type PagefindSearchOptions = {
		filters?: Record<string, string>;
		sort?: { date: 'asc' | 'desc' };
	};
	type PagefindModule = {
		init: () => Promise<void>;
		options: (options: {
			excerptLength: number;
			ranking: { metaWeights: Record<string, number> };
		}) => Promise<void>;
		search: (
			term: string | null,
			options?: PagefindSearchOptions
		) => Promise<PagefindSearchResponse>;
		debouncedSearch: (
			term: string | null,
			options?: PagefindSearchOptions,
			debounceTimeout?: number
		) => Promise<PagefindSearchResponse | null>;
	};

	type Props = {
		initialQuery: string;
		initialCategory: string;
		initialTag: string;
		initialYear: string;
		initialSort: SearchSort;
		initialPage: number;
		fallbackPosts: BlogPostSummary[];
		fallbackResultCount: number;
		fallbackPageCount: number;
		facets: SearchFacets;
	};

	let {
		initialQuery: query,
		initialCategory: category,
		initialTag: tag,
		initialYear: year,
		initialSort: sort,
		initialPage: currentPage,
		fallbackPosts,
		fallbackResultCount,
		fallbackPageCount,
		facets
	}: Props = $props();

	let results = $state<PagefindResultData[]>([]);
	let resultHandles: PagefindResultHandle[] = [];
	let resultCount = $state(0);
	let enhanced = $state(false);
	let loading = $state(false);
	let errorMessage = $state('');
	let requestSequence = 0;
	let pagefindPromise: Promise<PagefindModule> | null = null;
	let displayedResultCount = $derived(enhanced ? resultCount : fallbackResultCount);
	let displayedPageCount = $derived(
		enhanced ? Math.ceil(resultCount / BLOG_PAGE_SIZE) : fallbackPageCount
	);

	function pagefindOptions(): PagefindSearchOptions {
		const filters: Record<string, string> = {};
		if (category) filters.category = category;
		if (tag) filters.tag = tag;
		if (year) filters.year = year;

		return {
			...(Object.keys(filters).length > 0 ? { filters } : {}),
			...(sort === 'newest' || (sort === 'relevance' && !query.trim())
				? { sort: { date: 'desc' as const } }
				: sort === 'oldest'
					? { sort: { date: 'asc' as const } }
					: {})
		};
	}

	async function loadPagefind() {
		if (!pagefindPromise) {
			pagefindPromise = (async () => {
				const pagefindUrl = new URL('/pagefind/pagefind.js', window.location.origin).href;
				const pagefind = (await import(/* @vite-ignore */ pagefindUrl)) as PagefindModule;
				await pagefind.options({
					excerptLength: 32,
					ranking: {
						metaWeights: {
							title: 5,
							description: 2,
							category: 1.5,
							tags: 1.25
						}
					}
				});
				await pagefind.init();
				return pagefind;
			})();
		}
		return pagefindPromise;
	}

	function syncUrl() {
		const url = new URL(window.location.href);
		const values = {
			search: query.trim(),
			category,
			tag,
			year,
			sort,
			page: currentPage > 1 ? String(currentPage) : ''
		};

		for (const [key, value] of Object.entries(values)) {
			if (value && !(key === 'sort' && value === 'relevance')) {
				url.searchParams.set(key, value);
			} else {
				url.searchParams.delete(key);
			}
		}
		window.history.replaceState(window.history.state, '', url);
	}

	async function loadResultPage(sequence: number, pageNumber: number) {
		const start = (pageNumber - 1) * BLOG_PAGE_SIZE;
		const loaded = await Promise.all(
			resultHandles.slice(start, start + BLOG_PAGE_SIZE).map((result) => result.data())
		);
		if (sequence === requestSequence) results = loaded;
	}

	async function runSearch(immediate = false, resetPage = true) {
		const sequence = ++requestSequence;
		if (resetPage) currentPage = 1;
		loading = true;
		errorMessage = '';

		try {
			const pagefind = await loadPagefind();
			const term = query.trim() || null;
			const response = immediate
				? await pagefind.search(term, pagefindOptions())
				: await pagefind.debouncedSearch(term, pagefindOptions(), 250);

			if (!response || sequence !== requestSequence) return;
			resultHandles = response.results;
			resultCount = resultHandles.length;
			const pageCount = Math.ceil(resultCount / BLOG_PAGE_SIZE);
			currentPage = pageCount === 0 ? 1 : Math.min(currentPage, pageCount);
			await loadResultPage(sequence, currentPage);
			if (sequence !== requestSequence) return;
			enhanced = true;
			syncUrl();
		} catch (error) {
			console.error('Pagefind search failed:', error);
			errorMessage =
				'Full-text search is unavailable. Showing server-rendered metadata matches instead.';
			enhanced = false;
		} finally {
			if (sequence === requestSequence) loading = false;
		}
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		void runSearch(true);
	}

	function changeQuery(event: Event) {
		query = (event.currentTarget as HTMLInputElement).value;
		void runSearch();
	}

	function formatDate(value: string | undefined) {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? value
			: date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	afterNavigate(() => {
		enhanced = false;
		void runSearch(true, false);
	});
</script>

<section aria-labelledby="search-results-heading">
	<form
		action="/blog"
		method="get"
		role="search"
		aria-label="Filter writing archive"
		class="mb-8 rounded-lg border border-neutral-300 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-800/60"
		onsubmit={submitSearch}
	>
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(16rem,2fr)_1fr_1fr_1fr_auto]">
			{#if tag}
				<input type="hidden" name="tag" value={tag} />
			{/if}
			<label
				class="flex flex-col gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
			>
				Search all writing
				<input
					type="search"
					name="search"
					value={query}
					placeholder="Try FHIR, Calcutta, statistics…"
					autocomplete="off"
					class="h-11 rounded-md border border-neutral-300 bg-white px-3 text-base text-neutral-900 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
					onfocus={() => void loadPagefind()}
					oninput={changeQuery}
				/>
			</label>

			<label
				class="flex flex-col gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
			>
				Category
				<select
					name="category"
					bind:value={category}
					class="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
					onchange={() => void runSearch(true)}
				>
					<option value="">All categories</option>
					{#each facets.categories as option (option.slug)}
						<option value={option.slug}>{option.label} ({option.count})</option>
					{/each}
				</select>
			</label>

			<label
				class="flex flex-col gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
			>
				Year
				<select
					name="year"
					bind:value={year}
					class="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
					onchange={() => void runSearch(true)}
				>
					<option value="">All years</option>
					{#each facets.years as option (option.value)}
						<option value={option.value}>{option.value} ({option.count})</option>
					{/each}
				</select>
			</label>

			<label
				class="flex flex-col gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
			>
				Sort
				<select
					name="sort"
					bind:value={sort}
					class="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
					onchange={() => void runSearch(true)}
				>
					<option value="relevance">Relevance</option>
					<option value="newest">Newest</option>
					<option value="oldest">Oldest</option>
				</select>
			</label>

			<button
				type="submit"
				class="h-11 self-end rounded-md bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
			>
				Search
			</button>
		</div>
	</form>

	{#if tag}
		<div
			class="mb-5 flex flex-wrap items-center gap-2 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200"
		>
			<span class="font-semibold">Topic</span>
			<span class="rounded-sm bg-white px-2 py-1 font-medium dark:bg-neutral-900">{tag}</span>
			<a
				href={resolve('/blog')}
				class="ml-auto inline-flex min-h-8 items-center font-semibold underline underline-offset-4 hover:text-neutral-950 dark:hover:text-white"
			>
				Clear topic
			</a>
		</div>
	{/if}

	<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
		<h2
			id="search-results-heading"
			class="m-0 text-xl font-bold text-neutral-900 dark:text-neutral-100"
		>
			Search results
		</h2>
		<a
			href={resolve('/blog')}
			class="text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400"
		>
			Clear search
		</a>
	</div>

	<p
		class="mb-5 text-sm text-neutral-600 dark:text-neutral-400"
		aria-live="polite"
		aria-atomic="true"
	>
		{#if loading}
			Searching…
		{:else}
			{displayedResultCount}
			{displayedResultCount === 1 ? 'result' : 'results'}
			{#if displayedResultCount > 0 && displayedPageCount > 0}
				· Page {currentPage} of {displayedPageCount}
			{/if}
		{/if}
	</p>

	{#if errorMessage}
		<p
			class="mb-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
		>
			{errorMessage}
		</p>
	{/if}

	{#if enhanced}
		{#if results.length > 0}
			<ol
				class="divide-y divide-neutral-300 border-y border-neutral-300 dark:divide-neutral-700 dark:border-neutral-700"
			>
				{#each results as result (result.url)}
					<li class="py-5">
						<div
							class="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400"
						>
							{result.meta.category}
							{#if result.meta.date}<span aria-hidden="true"> · </span>{formatDate(
									result.meta.date
								)}{/if}
						</div>
						<a
							href={resolve('/blog/[category]/[slug]', {
								category: result.meta.category_slug,
								slug: result.meta.slug
							})}
							class="text-lg font-bold text-neutral-900 hover:text-neutral-600 dark:text-neutral-100 dark:hover:text-neutral-300"
						>
							{result.meta.title}
						</a>
						{#if result.excerpt}
							<p
								class="search-excerpt mt-2 mb-0 text-left text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
							>
								<!-- Pagefind entity-encodes excerpts before inserting its own mark elements. -->
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html result.excerpt}
							</p>
						{:else if result.meta.description}
							<p
								class="mt-2 mb-0 text-left text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
							>
								{result.meta.description}
							</p>
						{/if}
					</li>
				{/each}
			</ol>

			<ArchivePagination
				{currentPage}
				totalPages={displayedPageCount}
				label="Search results pagination"
			/>
		{:else}
			<div
				class="rounded-lg border border-dashed border-neutral-400 px-5 py-10 text-center dark:border-neutral-600"
			>
				<h3 class="m-0 text-lg font-bold">Nothing matched</h3>
				<p class="mt-2 mb-0 text-center text-sm text-neutral-600 dark:text-neutral-400">
					Try fewer words, remove a filter, or browse the full archive.
				</p>
			</div>
		{/if}
	{:else if fallbackPosts.length > 0}
		<PostGallery posts={fallbackPosts} />
		<ArchivePagination
			{currentPage}
			totalPages={displayedPageCount}
			label="Search results pagination"
		/>
	{:else}
		<div
			class="rounded-lg border border-dashed border-neutral-400 px-5 py-10 text-center dark:border-neutral-600"
		>
			<h3 class="m-0 text-lg font-bold">Nothing matched</h3>
			<p class="mt-2 mb-0 text-center text-sm text-neutral-600 dark:text-neutral-400">
				Try fewer words, remove a filter, or browse the full archive.
			</p>
		</div>
	{/if}
</section>

<style>
	.search-excerpt :global(mark) {
		border-radius: 0.15em;
		background: #fde68a;
		color: #171717;
		padding-inline: 0.08em;
	}
</style>
