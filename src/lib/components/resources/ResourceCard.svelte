<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		resourceKindLabel,
		type ResourceCardRecord,
		type ResourceSummary
	} from '$lib/content/resources';
	import CopyButton from './CopyButton.svelte';

	let { resource }: { resource: ResourceCardRecord } = $props();

	function detailParams(item: ResourceCardRecord | ResourceSummary) {
		return {
			kind: item.kindSegment,
			slug: item.slug
		};
	}
</script>

<article
	class="resource-card group flex min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-300 bg-neutral-50 shadow-sm transition-colors hover:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/80 dark:hover:border-neutral-500"
	data-resource-card
	data-resource-kind={resource.kindSegment}
>
	<a
		href={resolve('/resources/[kind=resourceKind]/[slug]', detailParams(resource))}
		class="relative block aspect-video overflow-hidden bg-neutral-200 outline-offset-[-3px] focus-visible:outline-2 focus-visible:outline-neutral-700 dark:bg-neutral-800 dark:focus-visible:outline-neutral-200"
		aria-label={`Open ${resource.title}`}
	>
		<img
			src={resource.thumbnail}
			alt={resource.thumbnailAlt}
			width={resource.thumbnailWidth}
			height={resource.thumbnailHeight}
			loading="lazy"
			decoding="async"
			class="h-full w-full object-cover transition-[filter] duration-300 group-hover:contrast-105"
		/>
	</a>

	<div class="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
		<div
			class="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs tracking-[0.1em] uppercase"
		>
			<span class="font-bold text-neutral-800 dark:text-neutral-200">
				{resourceKindLabel(resource.kind)}
			</span>
			<span class="text-neutral-500 normal-case dark:text-neutral-400">
				{resource.estimatedLength}
			</span>
		</div>

		<h3 class="m-0 text-xl leading-snug font-bold text-neutral-950 dark:text-neutral-50">
			<a
				href={resolve('/resources/[kind=resourceKind]/[slug]', detailParams(resource))}
				class="break-words underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-600 hover:decoration-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:decoration-neutral-700 dark:hover:text-neutral-300 dark:hover:decoration-neutral-400 dark:focus-visible:outline-neutral-300"
			>
				{resource.title}
			</a>
		</h3>
		<p
			class="mt-3 mb-0 line-clamp-3 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
		>
			{resource.description}
		</p>

		<ul class="mt-4 flex min-w-0 flex-wrap gap-1.5" aria-label={`${resource.title} tags`}>
			{#each resource.tags as tag (tag)}
				<li
					class="max-w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs leading-tight break-words text-neutral-600 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400"
				>
					{tag}
				</li>
			{/each}
		</ul>

		<div class="mt-auto pt-5">
			<div class="border-t border-neutral-300 pt-4 dark:border-neutral-700">
				<h4
					class="m-0 text-xs font-bold tracking-[0.1em] text-neutral-500 uppercase dark:text-neutral-400"
				>
					Related resources
				</h4>
				<ul class="mt-2 space-y-1">
					{#each resource.relatedResources.slice(0, 2) as related (related.ref)}
						<li class="min-w-0">
							<a
								href={resolve('/resources/[kind=resourceKind]/[slug]', detailParams(related))}
								class="inline-flex min-h-11 max-w-full items-center text-sm font-semibold break-words text-neutral-700 underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-300 dark:decoration-neutral-600 dark:hover:text-white dark:hover:decoration-neutral-300 dark:focus-visible:outline-neutral-300"
							>
								{related.title}
							</a>
						</li>
					{/each}
				</ul>
			</div>

			<div class="mt-3 flex items-center justify-between gap-3">
				<CopyButton copyText={resource.copyText} kind={resource.kind} title={resource.title} />
				<a
					href={resolve('/resources/[kind=resourceKind]/[slug]', detailParams(resource))}
					class="inline-flex min-h-11 items-center text-sm font-bold text-neutral-700 underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-300 dark:decoration-neutral-600 dark:hover:text-white dark:hover:decoration-neutral-300 dark:focus-visible:outline-neutral-300"
				>
					Open <span class="ml-1" aria-hidden="true">→</span>
				</a>
			</div>
		</div>
	</div>
</article>
