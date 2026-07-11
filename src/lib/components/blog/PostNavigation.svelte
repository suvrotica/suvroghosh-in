<script lang="ts">
	import { resolve } from '$app/paths';

	type NavigationPost = {
		title: string;
		slug: string;
		categorySlug: string;
		categoryLabel: string;
		date: string;
	};

	let {
		newer,
		older
	}: {
		newer: NavigationPost | null;
		older: NavigationPost | null;
	} = $props();

	function formattedDate(date: string) {
		return new Date(date).toLocaleDateString('en-IN', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

{#if newer || older}
	<nav
		aria-label="Chronological post navigation"
		class="mt-12 border-y border-neutral-200 py-6 dark:border-neutral-800"
	>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#if newer}
				<a
					href={resolve('/blog/[category]/[slug]', {
						category: newer.categorySlug,
						slug: newer.slug
					})}
					class="group flex min-h-28 flex-col rounded-lg border border-neutral-200 bg-white p-4 no-underline shadow-sm transition-colors hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:hover:border-neutral-600 dark:focus-visible:outline-neutral-300"
				>
					<span
						class="text-xs font-bold tracking-[0.12em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						<span aria-hidden="true">&larr;</span> Newer post
					</span>
					<span
						class="mt-2 leading-snug font-semibold text-neutral-900 group-hover:text-neutral-600 dark:text-neutral-100 dark:group-hover:text-neutral-300"
					>
						{newer.title}
					</span>
					<span class="mt-auto pt-3 text-xs text-neutral-500 dark:text-neutral-400">
						{newer.categoryLabel} &middot; {formattedDate(newer.date)}
					</span>
				</a>
			{/if}

			{#if older}
				<a
					href={resolve('/blog/[category]/[slug]', {
						category: older.categorySlug,
						slug: older.slug
					})}
					class="group flex min-h-28 flex-col rounded-lg border border-neutral-200 bg-white p-4 text-left no-underline shadow-sm transition-colors hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 sm:text-right dark:border-neutral-800 dark:bg-neutral-900/50 dark:hover:border-neutral-600 dark:focus-visible:outline-neutral-300 {newer
						? ''
						: 'sm:col-start-2'}"
				>
					<span
						class="text-xs font-bold tracking-[0.12em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						Older post <span aria-hidden="true">&rarr;</span>
					</span>
					<span
						class="mt-2 leading-snug font-semibold text-neutral-900 group-hover:text-neutral-600 dark:text-neutral-100 dark:group-hover:text-neutral-300"
					>
						{older.title}
					</span>
					<span class="mt-auto pt-3 text-xs text-neutral-500 dark:text-neutral-400">
						{older.categoryLabel} &middot; {formattedDate(older.date)}
					</span>
				</a>
			{/if}
		</div>
	</nav>
{/if}
