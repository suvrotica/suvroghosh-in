<script lang="ts">
	import { resolve } from '$app/paths';
	import { resourceKindLabel, type ResourceSummary } from '$lib/content/resources';

	let { resources }: { resources: ResourceSummary[] } = $props();

	function detailParams(resource: ResourceSummary) {
		return {
			kind: resource.kindSegment,
			slug: resource.slug
		};
	}
</script>

{#if resources.length > 0}
	<section
		aria-labelledby="related-resources-heading"
		class="mt-12 border-t border-neutral-300 pt-8 dark:border-neutral-700"
	>
		<h2
			id="related-resources-heading"
			class="m-0 text-2xl font-bold text-neutral-950 dark:text-neutral-50"
		>
			Related resources
		</h2>
		<div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each resources.slice(0, 4) as resource (resource.ref)}
				<article
					class="flex min-w-0 flex-col rounded-lg border border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900/70"
				>
					<p
						class="m-0 text-xs font-bold tracking-[0.1em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						{resourceKindLabel(resource.kind)} · {resource.estimatedLength}
					</p>
					<h3 class="mt-2 mb-0 text-lg leading-snug font-bold">
						<a
							href={resolve('/resources/[kind=resourceKind]/[slug]', detailParams(resource))}
							class="break-words text-neutral-950 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-600 hover:decoration-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-50 dark:decoration-neutral-700 dark:hover:text-neutral-300 dark:hover:decoration-neutral-400 dark:focus-visible:outline-neutral-300"
						>
							{resource.title}
						</a>
					</h3>
					<p
						class="mt-2 mb-0 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
					>
						{resource.description}
					</p>
				</article>
			{/each}
		</div>
	</section>
{/if}
