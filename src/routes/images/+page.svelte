<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import ImageCollectionNav from '$lib/components/images/ImageCollectionNav.svelte';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { collectionPageSchema, siteUrl, withSiteGraph } from '$lib/components/seo/SEO';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let activeLabel = $derived(
		data.tabs.find((tab) => tab.key === data.activeTab)?.label ?? 'Images'
	);
	let title = $derived(
		`${activeLabel}${data.page > 1 ? ` — Page ${data.page}` : ''} | Suvro Ghosh`
	);
	let description = $derived(
		`Browse ${data.totalItems} ${activeLabel.toLowerCase()} from SuvroGhosh.IN${data.page > 1 ? `, page ${data.page}` : ''}. Select any thumbnail to open the full-size image in a new browser tab.`
	);
	let canonicalUrl = $derived(siteUrl + pageHref(data.page));
	let pageItems = $derived(buildPageItems(data.page, data.totalPages));

	function buildPageItems(current: number, total: number): (number | 'ellipsis')[] {
		if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
		if (current <= 4) return [1, 2, 3, 4, 'ellipsis', total];
		if (current >= total - 3) return [1, 'ellipsis', total - 3, total - 2, total - 1, total];
		return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
	}

	function pageHref(targetPage: number) {
		const params = new SvelteURLSearchParams();
		if (data.activeTab !== 'images') params.set('tab', data.activeTab);
		if (targetPage > 1) params.set('page', String(targetPage));
		const query = params.toString();
		return query ? `/images?${query}` : '/images';
	}

	function formatBytes(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;
	}

	const linkClass =
		'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-700 no-underline transition-colors hover:border-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950';
	const disabledClass =
		'inline-flex min-h-11 min-w-11 cursor-not-allowed items-center justify-center rounded-md border border-neutral-200 px-3 text-sm font-semibold text-neutral-400 dark:border-neutral-800 dark:text-neutral-600';
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	schema={withSiteGraph([
		collectionPageSchema({
			name: activeLabel,
			description,
			url: canonicalUrl,
			about: 'Image gallery'
		})
	])}
/>

<section class="page-enter py-4 md:py-8">
	<header class="mb-8">
		<p
			class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Media library
		</p>
		<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-5xl dark:text-neutral-100">
			Images
		</h1>
		<p class="max-w-3xl text-left text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
			Browse the site’s images, photos, sketches, and generated thumbnails. Select a thumbnail to
			open the full-size file in a new browser tab.
		</p>
	</header>

	<ImageCollectionNav tabs={data.tabs} activeKey={data.activeTab} />

	<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="m-0 text-xl font-bold text-neutral-900 dark:text-neutral-100">{activeLabel}</h2>
		<p class="m-0 text-sm text-neutral-500 dark:text-neutral-400">
			Showing {data.rangeStart}–{data.rangeEnd} of {data.totalItems} · Page {data.page} of
			{Math.max(data.totalPages, 1)}
		</p>
	</div>

	{#if data.assets.length > 0}
		<ul
			id="media-gallery"
			aria-label={`${activeLabel} gallery`}
			class="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:grid-cols-4"
		>
			{#each data.assets as asset, index (asset.src)}
				<li
					class="min-w-0 overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
				>
					<a
						href={resolve(asset.src as '/images')}
						target="_blank"
						rel="noopener noreferrer"
						class="group block h-full no-underline focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
						aria-label={`Open ${asset.name} full size in a new tab`}
					>
						<div class="aspect-[4/3] overflow-hidden bg-neutral-200 dark:bg-neutral-800">
							<img
								src={asset.src}
								alt={asset.name}
								width={asset.width ?? undefined}
								height={asset.height ?? undefined}
								loading={index < 8 ? 'eager' : 'lazy'}
								decoding="async"
								class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
							/>
						</div>
						<div class="p-2.5">
							<p
								class="m-0 truncate text-left text-xs font-semibold text-neutral-700 dark:text-neutral-300"
								title={asset.name}
							>
								{asset.name}
							</p>
							<p class="mt-1 mb-0 text-left text-[0.7rem] text-neutral-500 dark:text-neutral-500">
								{#if asset.width && asset.height}{asset.width} × {asset.height} ·
								{/if}{formatBytes(asset.bytes)}
							</p>
						</div>
						<span class="sr-only">, opens in a new tab</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<div
			id="media-gallery"
			class="rounded-lg border border-neutral-300 py-16 text-center text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
		>
			No images are available in this collection.
		</div>
	{/if}

	{#if data.totalPages > 1}
		<nav
			aria-label={`${activeLabel} pagination`}
			class="mt-8 grid grid-cols-2 gap-3 rounded-lg border border-neutral-300 bg-neutral-100 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center dark:border-neutral-700 dark:bg-neutral-800/60"
		>
			{#if data.page > 1}
				<a
					href={resolve(pageHref(data.page - 1) as '/images')}
					rel="prev"
					class={`${linkClass} justify-self-start`}
				>
					<span aria-hidden="true">←</span>&nbsp;Previous
				</a>
			{:else}
				<span class={`${disabledClass} justify-self-start`} aria-disabled="true"
					><span aria-hidden="true">←</span>&nbsp;Previous</span
				>
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
					{:else if item === data.page}
						<span
							class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-neutral-900 px-3 text-sm font-bold text-white dark:bg-neutral-100 dark:text-neutral-900"
							aria-current="page">{item}</span
						>
					{:else}
						<a
							href={resolve(pageHref(item) as '/images')}
							class={linkClass}
							aria-label={`Go to page ${item}`}>{item}</a
						>
					{/if}
				{/each}
			</div>

			{#if data.page < data.totalPages}
				<a
					href={resolve(pageHref(data.page + 1) as '/images')}
					rel="next"
					class={`${linkClass} col-start-2 row-start-1 justify-self-end sm:col-start-3`}
				>
					Next&nbsp;<span aria-hidden="true">→</span>
				</a>
			{:else}
				<span
					class={`${disabledClass} col-start-2 row-start-1 justify-self-end sm:col-start-3`}
					aria-disabled="true">Next&nbsp;<span aria-hidden="true">→</span></span
				>
			{/if}
		</nav>
	{/if}
</section>
