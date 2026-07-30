<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Component } from 'svelte';
	import {
		resourceKindLabel,
		type ResourceRecord,
		type ResourceSummary
	} from '$lib/content/resources';
	import CopyButton from './CopyButton.svelte';
	import RelatedResources from './RelatedResources.svelte';

	let {
		resource,
		relatedResources,
		thumbnailWidth,
		thumbnailHeight,
		content: Content
	}: {
		resource: ResourceRecord;
		relatedResources: ResourceSummary[];
		thumbnailWidth: number;
		thumbnailHeight: number;
		content: Component;
	} = $props();

	let kindPluralLabel = $derived(resource.kind === 'prompt' ? 'Prompts' : 'Word Lists');
	let effectiveDate = $derived(resource.dateModified ?? resource.date);

	function formatDate(date: string) {
		return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<article
	class="article-prose mx-auto max-w-3xl min-w-0"
	lang={resource.language === 'mixed' ? undefined : resource.language}
	data-resource-detail
>
	<nav aria-label="Breadcrumb" class="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
		<ol class="flex min-w-0 flex-wrap items-center gap-2">
			<li>
				<a
					href={resolve('/')}
					class="inline-flex min-h-11 items-center transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:text-neutral-100 dark:focus-visible:outline-neutral-300"
					>Home</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li>
				<a
					href={resolve('/resources')}
					class="inline-flex min-h-11 items-center transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:text-neutral-100 dark:focus-visible:outline-neutral-300"
					>The Field Kit</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li>
				<a
					href={resolve(
						resource.kind === 'prompt' ? '/resources#prompts' : '/resources#word-lists'
					)}
					class="inline-flex min-h-11 items-center transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:text-neutral-100 dark:focus-visible:outline-neutral-300"
					>{kindPluralLabel}</a
				>
			</li>
			<li class="hidden sm:block" aria-hidden="true">/</li>
			<li
				class="hidden min-w-0 flex-1 truncate font-medium text-neutral-900 sm:block dark:text-neutral-200"
				aria-current="page"
			>
				{resource.title}
			</li>
		</ol>
	</nav>

	<header
		class="border-b border-neutral-300 pb-8 dark:border-neutral-700"
		data-route-atmosphere-region
		data-route-scene="article"
	>
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			{resourceKindLabel(resource.kind)} · The Field Kit
		</p>
		<h1
			class="m-0 text-4xl leading-tight font-bold tracking-tight text-neutral-950 sm:text-5xl dark:text-neutral-50"
		>
			{resource.title}
		</h1>
		<p
			class="mt-5 mb-0 max-w-2xl text-left text-lg leading-relaxed text-neutral-700 dark:text-neutral-300"
		>
			{resource.description}
		</p>

		<div
			class="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400"
		>
			<span>{resource.estimatedLength}</span>
			<span aria-hidden="true">·</span>
			{#if resource.dateModified}
				<span>Updated <time datetime={effectiveDate}>{formatDate(effectiveDate)}</time></span>
			{:else}
				<span>Published <time datetime={resource.date}>{formatDate(resource.date)}</time></span>
			{/if}
		</div>

		<ul class="mt-5 flex min-w-0 flex-wrap gap-2" aria-label={`${resource.title} tags`}>
			{#each resource.tags as tag (tag)}
				<li
					class="max-w-full rounded-md border border-neutral-300 px-2.5 py-1 text-xs leading-tight break-words text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
				>
					{tag}
				</li>
			{/each}
		</ul>

		<div class="mt-6 flex flex-col items-start gap-2">
			<CopyButton copyText={resource.copyText} kind={resource.kind} title={resource.title} />
			<p
				class="m-0 max-w-xl text-left text-xs leading-relaxed text-neutral-500 dark:text-neutral-400"
			>
				Copies the reusable section below, without the introduction or usage notes.
			</p>
		</div>
	</header>

	<figure
		class="my-8 overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
	>
		<img
			src={resource.thumbnail}
			alt={resource.thumbnailAlt}
			width={thumbnailWidth}
			height={thumbnailHeight}
			loading="eager"
			fetchpriority="high"
			decoding="async"
			class="aspect-video h-auto w-full object-cover"
		/>
	</figure>

	<div
		class="resource-prose mx-auto prose max-w-[var(--article-width)] min-w-0 prose-neutral dark:prose-invert prose-headings:scroll-mt-24 prose-headings:font-sans prose-code:break-words prose-pre:max-w-full prose-pre:overflow-x-auto"
		data-article-reading-region
	>
		<Content />
	</div>

	<RelatedResources resources={relatedResources} />

	<a
		href={resolve('/resources')}
		class="mt-10 inline-flex min-h-11 items-center text-sm font-bold text-neutral-700 underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-300 dark:decoration-neutral-600 dark:hover:text-white dark:hover:decoration-neutral-300 dark:focus-visible:outline-neutral-300"
	>
		<span class="mr-1" aria-hidden="true">←</span> Back to The Field Kit
	</a>
</article>

<style>
	.resource-prose :global(pre),
	.resource-prose :global(code),
	.resource-prose :global(a) {
		overflow-wrap: anywhere;
	}

	.resource-prose :global(table) {
		display: block;
		max-width: 100%;
		overflow-x: auto;
	}
</style>
