<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '$lib/components/ui/badge';
	import type { TopicResource } from '$lib/topics/types';

	let {
		resource,
		featured = false,
		compact = false,
		eager = false
	}: {
		resource: TopicResource;
		featured?: boolean;
		compact?: boolean;
		eager?: boolean;
	} = $props();

	const dateFormatter = new Intl.DateTimeFormat('en-IN', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});

	function formatDate(value: string) {
		return dateFormatter.format(new Date(`${value}T00:00:00`));
	}
</script>

<a
	href={resolve(resource.path as '/blog')}
	class="post-card group flex h-full min-w-0 {featured
		? 'flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white shadow-sm sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(16rem,0.72fr)] dark:border-neutral-700 dark:bg-neutral-900'
		: 'flex-col rounded-lg border border-neutral-300 bg-white p-4 no-underline shadow-sm dark:border-neutral-700 dark:bg-neutral-900'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:focus-visible:outline-neutral-300"
>
	<div class={featured ? 'flex min-w-0 flex-col p-5 sm:p-6' : 'flex min-w-0 flex-1 flex-col'}>
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<Badge variant={featured ? 'default' : 'outline'}>{resource.contentType}</Badge>
			<span class="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
				{resource.category}
			</span>
		</div>

		<span
			class="{featured
				? 'text-xl leading-tight sm:text-2xl'
				: 'text-base leading-snug'} font-bold text-neutral-950 transition-colors group-hover:text-neutral-600 dark:text-neutral-50 dark:group-hover:text-neutral-300"
		>
			{resource.title}
		</span>

		{#if !compact}
			<p
				class="{featured
					? 'mt-3 text-base'
					: 'mt-2 text-sm'} mb-0 text-left leading-relaxed text-neutral-600 dark:text-neutral-400"
			>
				{resource.description}
			</p>
		{/if}

		<div
			class="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 text-xs text-neutral-500 dark:text-neutral-400"
		>
			{#if resource.dateModified}
				<span
					>Updated <time datetime={resource.dateModified}>{formatDate(resource.dateModified)}</time
					></span
				>
			{:else}
				<time datetime={resource.date}>{formatDate(resource.date)}</time>
			{/if}
			{#if resource.readingTime}
				<span aria-hidden="true">·</span>
				<span>{resource.readingTime} read</span>
			{/if}
		</div>
	</div>

	{#if featured && resource.thumbnail}
		<div class="order-first min-h-48 bg-neutral-200 sm:order-last dark:bg-neutral-800">
			<img
				src={resource.thumbnail}
				alt={resource.thumbnailAlt?.trim() || ''}
				width={resource.thumbnailWidth}
				height={resource.thumbnailHeight}
				loading={eager ? 'eager' : 'lazy'}
				fetchpriority={eager ? 'high' : 'auto'}
				decoding="async"
				class="h-full w-full object-cover"
			/>
		</div>
	{/if}
</a>
