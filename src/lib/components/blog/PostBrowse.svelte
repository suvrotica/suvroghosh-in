<script lang="ts">
	import { resolve } from '$app/paths';
	import type { BlogPostSummary } from '$lib/content/posts';
	import PostGallery from './PostGallery.svelte';

	type SearchFacets = {
		categories: { slug: string; label: string; count: number }[];
	};

	let {
		posts,
		facets
	}: {
		posts: BlogPostSummary[];
		facets: SearchFacets;
	} = $props();

	const latestLimit = 24;
	let latestPosts = $derived(posts.slice(0, latestLimit));
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
				Explore
			</button>
		</form>
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
			Showing {latestPosts.length} of {posts.length} posts
		</p>
	</div>

	<PostGallery posts={latestPosts} />
</section>
