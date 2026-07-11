<script lang="ts">
	import type { PostHeading } from '$lib/content/posts';

	let {
		headings,
		variant
	}: {
		headings: PostHeading[];
		variant: 'mobile' | 'desktop';
	} = $props();
</script>

{#if headings.length >= 2}
	{#if variant === 'mobile'}
		<details
			class="group mb-10 rounded-lg border border-neutral-300 bg-neutral-100 shadow-sm xl:hidden dark:border-neutral-700 dark:bg-neutral-800/60"
		>
			<summary
				class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-4 py-3 text-sm font-semibold text-neutral-900 marker:content-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-100 dark:focus-visible:outline-neutral-300 [&::-webkit-details-marker]:hidden"
			>
				<span>On this page</span>
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					fill="none"
					class="size-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180"
				>
					<path
						d="m5 7.5 5 5 5-5"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</summary>

			<nav
				aria-label="On this page"
				class="border-t border-neutral-300 px-3 py-3 dark:border-neutral-700"
			>
				<ol class="space-y-0.5">
					{#each headings as heading (heading.id)}
						<li class:ml-3={heading.level === 3} class:ml-6={heading.level >= 4}>
							<a
								href={`#${heading.id}`}
								class="flex min-h-11 items-center rounded-md px-2 py-2 text-sm leading-snug text-neutral-700 transition-colors hover:bg-white hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white dark:focus-visible:outline-neutral-300"
							>
								{heading.text}
							</a>
						</li>
					{/each}
				</ol>
			</nav>
		</details>
	{:else}
		<nav
			aria-label="On this page"
			class="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto border-l border-neutral-300 pl-5 dark:border-neutral-700"
		>
			<div
				class="mb-3 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				On this page
			</div>
			<ol class="space-y-1">
				{#each headings as heading (heading.id)}
					<li class:ml-3={heading.level === 3} class:ml-6={heading.level >= 4}>
						<a
							href={`#${heading.id}`}
							class="block rounded-sm py-1.5 text-sm leading-snug text-neutral-600 transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-400 dark:hover:text-neutral-100 dark:focus-visible:outline-neutral-300"
						>
							{heading.text}
						</a>
					</li>
				{/each}
			</ol>
		</nav>
	{/if}
{/if}
