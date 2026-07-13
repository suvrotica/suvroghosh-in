<script lang="ts">
	import { resolve } from '$app/paths';
	import type { BlogPostSummary } from '$lib/content/posts';
	import { BLOG_PAGE_SIZE } from '$lib/content/pagination';
	import ArchivePagination from './ArchivePagination.svelte';
	import PostGallery from './PostGallery.svelte';

	type SearchFacets = {
		categories: { slug: string; label: string; count: number }[];
		years: { value: string; count: number }[];
		topics: { slug: string; label: string; count: number; categoryCount: number }[];
	};

	let {
		posts,
		facets,
		page,
		totalResults,
		totalPages
	}: {
		posts: BlogPostSummary[];
		facets: SearchFacets;
		page: number;
		totalResults: number;
		totalPages: number;
	} = $props();

	let rangeStart = $derived(totalResults > 0 ? (page - 1) * BLOG_PAGE_SIZE + 1 : 0);
	let rangeEnd = $derived(rangeStart + posts.length - 1);
</script>

<section aria-labelledby="archive-tools-heading">
	<div
		class="rounded-xl border border-neutral-300 bg-neutral-100 p-5 shadow-sm sm:p-6 dark:border-neutral-700 dark:bg-neutral-800/60"
	>
		<div class="max-w-2xl">
			<h2
				id="archive-tools-heading"
				class="!mt-0 !mb-2 !text-2xl !leading-tight text-neutral-950 dark:text-neutral-50"
			>
				Find something to read
			</h2>
			<p class="!mb-0 !text-left text-sm text-neutral-600 dark:text-neutral-400">
				Search the complete archive or narrow it to one category. More filters appear with the
				results.
			</p>
		</div>

		<form
			action={resolve('/blog')}
			method="get"
			role="search"
			aria-label="Search and browse the writing archive"
			class="mt-5 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(13rem,1fr)_auto] md:items-end"
		>
			<label
				class="flex flex-col gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
			>
				Search all writing
				<input
					type="search"
					name="search"
					placeholder="Try FHIR, Calcutta, statistics…"
					class="h-11 min-w-0 rounded-md border border-neutral-300 bg-white px-3 text-base font-normal text-neutral-950 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:focus-visible:outline-neutral-300"
				/>
			</label>

			<label
				class="flex flex-col gap-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
			>
				Category
				<select
					name="category"
					class="h-11 min-w-0 rounded-md border border-neutral-300 bg-white px-3 text-sm font-normal text-neutral-950 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:focus-visible:outline-neutral-300"
				>
					<option value="">All categories</option>
					{#each facets.categories as category (category.slug)}
						<option value={category.slug}>{category.label} ({category.count})</option>
					{/each}
				</select>
			</label>

			<button
				type="submit"
				class="h-11 rounded-md bg-neutral-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white dark:focus-visible:outline-neutral-300"
			>
				Search
			</button>
		</form>

		{#if facets.years.length > 0}
			<nav
				aria-label="Browse archive by year"
				class="mt-5 border-t border-neutral-300 pt-4 dark:border-neutral-700"
			>
				<p
					class="!mb-2 !text-left text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
				>
					Browse by year
				</p>
				<ul class="flex flex-wrap gap-2">
					{#each facets.years as year (year.value)}
						<li>
							<a
								href={resolve('/blog/archive/[year]', { year: year.value })}
								class="inline-flex min-h-11 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 no-underline transition-colors hover:border-neutral-500 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:outline-neutral-300"
							>
								{year.value}
								<span class="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400"
									>({year.count})</span
								>
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}

		{#if facets.topics.length > 0}
			<nav
				aria-label="Browse recurring topics"
				class="mt-5 border-t border-neutral-300 pt-4 dark:border-neutral-700"
			>
				<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
					<p
						class="!m-0 !text-left text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						Recurring topics
					</p>
					<a
						href={resolve('/blog/topics')}
						class="inline-flex min-h-11 items-center text-xs font-semibold text-neutral-600 underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 dark:text-neutral-400 dark:hover:text-white"
						>Browse all topics</a
					>
				</div>
				<ul class="flex flex-wrap gap-2">
					{#each facets.topics.slice(0, 12) as topic (topic.slug)}
						<li>
							<a
								href={resolve('/blog/topics/[topic]', { topic: topic.slug })}
								class="inline-flex min-h-11 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 no-underline transition-colors hover:border-neutral-500 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:outline-neutral-300"
							>
								{topic.label}
								<span class="ml-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400"
									>({topic.count})</span
								>
							</a>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
	</div>

	<div class="mt-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p
				class="!mb-1 !text-left text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Recently published
			</p>
			<h2 class="!m-0 !text-2xl !leading-tight text-neutral-950 dark:text-neutral-50">
				Latest writing
			</h2>
		</div>
		<p class="!mb-0 !text-left text-sm text-neutral-500 dark:text-neutral-400">
			Showing {rangeStart}–{rangeEnd} of {totalResults} posts · Page {page} of {totalPages}
		</p>
	</div>

	<PostGallery {posts} />
	<ArchivePagination currentPage={page} {totalPages} label="All posts pagination" />
</section>
