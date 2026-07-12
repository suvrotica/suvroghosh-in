<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let {
		currentPage,
		totalPages,
		label = 'Archive pagination'
	}: {
		currentPage: number;
		totalPages: number;
		label?: string;
	} = $props();

	let pageItems = $derived(buildPageItems(currentPage, totalPages));

	function buildPageItems(current: number, total: number): (number | 'ellipsis')[] {
		if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
		if (current <= 3) return [1, 2, 3, 'ellipsis', total];
		if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
		return [1, 'ellipsis', current, 'ellipsis', total];
	}

	function pageHref(targetPage: number): '/blog' | `/blog?${string}` {
		const params = new SvelteURLSearchParams(page.url.searchParams);

		for (const key of ['search', 'category', 'year']) {
			if (!params.get(key)?.trim()) params.delete(key);
		}
		if (params.get('sort') === 'relevance') params.delete('sort');

		if (targetPage <= 1) params.delete('page');
		else params.set('page', String(targetPage));

		const query = params.toString();
		return query ? `/blog?${query}` : '/blog';
	}

	const linkClass =
		'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 no-underline transition-colors hover:border-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950';
	const disabledClass =
		'inline-flex min-h-11 min-w-11 cursor-not-allowed items-center justify-center rounded-md border border-neutral-200 px-3 text-sm font-semibold text-neutral-400 dark:border-neutral-800 dark:text-neutral-600';
</script>

{#if totalPages > 1}
	<nav
		aria-label={label}
		class="mt-8 grid grid-cols-2 gap-3 rounded-lg border border-neutral-300 bg-neutral-100 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center dark:border-neutral-700 dark:bg-neutral-800/60"
	>
		{#if currentPage > 1}
			<a
				href={resolve(pageHref(currentPage - 1))}
				rel="prev"
				class={`${linkClass} justify-self-start`}
				aria-label={`Previous page, page ${currentPage - 1}`}
			>
				<span aria-hidden="true">←</span>&nbsp;Previous
			</a>
		{:else}
			<span class={`${disabledClass} justify-self-start`} aria-disabled="true">
				<span aria-hidden="true">←</span>&nbsp;Previous
			</span>
		{/if}

		<div
			class="col-span-2 row-start-2 flex flex-wrap items-center justify-center gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1"
		>
			{#each pageItems as item, index (`${item}-${index}`)}
				{#if item === 'ellipsis'}
					<span
						class="inline-flex min-h-11 min-w-6 items-center justify-center text-neutral-500"
						aria-hidden="true">…</span
					>
				{:else if item === currentPage}
					<span
						class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-neutral-900 px-3 text-sm font-bold text-white dark:bg-neutral-100 dark:text-neutral-900"
						aria-current="page"
						aria-label={`Current page, page ${item}`}
					>
						{item}
					</span>
				{:else}
					<a href={resolve(pageHref(item))} class={linkClass} aria-label={`Go to page ${item}`}
						>{item}</a
					>
				{/if}
			{/each}
		</div>

		{#if currentPage < totalPages}
			<a
				href={resolve(pageHref(currentPage + 1))}
				rel="next"
				class={`${linkClass} col-start-2 row-start-1 justify-self-end sm:col-start-3`}
				aria-label={`Next page, page ${currentPage + 1}`}
			>
				Next&nbsp;<span aria-hidden="true">→</span>
			</a>
		{:else}
			<span
				class={`${disabledClass} col-start-2 row-start-1 justify-self-end sm:col-start-3`}
				aria-disabled="true"
			>
				Next&nbsp;<span aria-hidden="true">→</span>
			</span>
		{/if}

		<p class="sr-only">Page {currentPage} of {totalPages}</p>
	</nav>
{/if}
