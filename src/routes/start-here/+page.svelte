<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		breadcrumbSchema,
		collectionPageSchema,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';

	let { data }: { data: PageData } = $props();

	const title = 'Start Here | SuvroGhosh.In';
	const description =
		'Five curated reading paths through the essays, healthcare systems writing, science, Calcutta observations, and short fiction of Suvro Ghosh.';
	const canonicalUrl = `${siteUrl}/start-here`;

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(value));
	}
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	keywords={['Start here', 'Essays', 'Healthcare IT', 'Science', 'Calcutta', 'Short fiction']}
	schema={withSiteGraph([
		collectionPageSchema({
			name: 'Start Here',
			description,
			url: canonicalUrl,
			about: 'Curated reading paths through the work of Suvro Ghosh'
		}),
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Start Here', url: canonicalUrl }
		])
	])}
/>

<article class="page-enter mx-auto max-w-5xl py-4 md:py-8">
	<nav aria-label="Breadcrumb" class="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
		<ol class="flex flex-wrap items-center gap-2">
			<li>
				<a
					href={resolve('/')}
					class="inline-flex min-h-11 items-center font-semibold underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:text-white dark:focus-visible:outline-neutral-300"
					>Home</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li aria-current="page" class="font-medium text-neutral-800 dark:text-neutral-200">
				Start here
			</li>
		</ol>
	</nav>

	<header class="border-b border-neutral-300 pb-9 dark:border-neutral-700">
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			A guided entrance
		</p>
		<h1 class="mb-4 text-4xl font-bold text-neutral-950 md:text-6xl dark:text-neutral-50">
			Start here
		</h1>
		<p
			class="mb-3 max-w-3xl text-left text-lg leading-relaxed text-neutral-700 dark:text-neutral-300"
		>
			This is a large and varied library. These five short paths offer a way in, whether you came
			for healthcare systems, science, Calcutta, fiction, or simply the voice behind the site.
		</p>
		<p class="mb-0 max-w-3xl text-left text-sm text-neutral-500 dark:text-neutral-400">
			The selections are editorial choices, not a popularity ranking. Each path is ordered to be
			read from top to bottom.
		</p>
	</header>

	<nav aria-label="Reading paths" class="border-b border-neutral-300 py-7 dark:border-neutral-700">
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Choose a path
		</p>
		<ol class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
			{#each data.paths as path, index (path.id)}
				<li>
					<a
						href={`#${path.id}`}
						class="group flex h-full min-h-16 items-center gap-3 rounded-md border border-neutral-300 bg-white px-3 py-2 no-underline transition-colors hover:border-neutral-500 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-300"
					>
						<span class="text-xs font-bold text-neutral-500 dark:text-neutral-400">
							{String(index + 1).padStart(2, '0')}
						</span>
						<span class="text-sm leading-snug font-semibold text-neutral-900 dark:text-neutral-100">
							{path.eyebrow}
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</nav>

	<div class="divide-y divide-neutral-300 dark:divide-neutral-700">
		{#each data.paths as path, index (path.id)}
			<section
				id={path.id}
				class="scroll-mt-28 py-10 md:py-14"
				aria-labelledby={`${path.id}-heading`}
			>
				<div class="mb-6 grid gap-3 md:grid-cols-[8rem_1fr] md:gap-6">
					<p class="mb-0 text-sm font-bold text-neutral-500 dark:text-neutral-400">
						{String(index + 1).padStart(2, '0')} / {String(data.paths.length).padStart(2, '0')}
					</p>
					<div>
						<p
							class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
						>
							{path.eyebrow}
						</p>
						<h2
							id={`${path.id}-heading`}
							class="mb-3 text-2xl leading-tight font-bold text-neutral-950 md:text-3xl dark:text-neutral-50"
						>
							{path.label}
						</h2>
						<p class="mb-0 max-w-2xl text-left text-neutral-600 dark:text-neutral-400">
							{path.description}
						</p>
					</div>
				</div>

				<ol class="border-y border-neutral-300 dark:border-neutral-700">
					{#each path.posts as post, postIndex (post.slug)}
						<li class="border-b border-neutral-300 last:border-b-0 dark:border-neutral-700">
							<a
								href={resolve('/blog/[category]/[slug]', {
									category: post.categorySlug,
									slug: post.slug
								})}
								class="group grid min-h-28 gap-3 py-5 no-underline transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 sm:grid-cols-[3rem_1fr_auto] sm:items-start sm:px-4 dark:hover:bg-neutral-900 dark:focus-visible:outline-neutral-300"
							>
								<span class="text-sm font-bold text-neutral-400 dark:text-neutral-500">
									{postIndex + 1}
								</span>
								<span>
									<span
										class="block text-xl leading-snug font-bold text-neutral-950 transition-colors group-hover:text-neutral-600 dark:text-neutral-50 dark:group-hover:text-neutral-300"
									>
										{post.title}
									</span>
									<span
										class="mt-2 block max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
									>
										{post.description}
									</span>
								</span>
								<span
									class="text-xs leading-5 text-neutral-500 sm:text-right dark:text-neutral-400"
								>
									<span class="block font-semibold uppercase">{post.categoryLabel}</span>
									<time class="block" datetime={post.date}>{formatDate(post.date)}</time>
									{#if post.readingTime}<span class="block">{post.readingTime}</span>{/if}
								</span>
							</a>
						</li>
					{/each}
				</ol>
			</section>
		{/each}
	</div>

	<aside
		class="mt-2 flex flex-col gap-5 rounded-lg border border-neutral-300 bg-neutral-100 p-6 sm:flex-row sm:items-center sm:justify-between md:p-8 dark:border-neutral-700 dark:bg-neutral-900"
		aria-labelledby="wander-heading"
	>
		<div>
			<p
				class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Prefer to wander?
			</p>
			<h2 id="wander-heading" class="mb-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
				The complete library is open
			</h2>
			<p class="mb-0 max-w-xl text-left text-sm text-neutral-600 dark:text-neutral-400">
				Browse chronologically, search the archive, or follow a recurring topic wherever it leads.
			</p>
		</div>
		<div class="flex shrink-0 flex-wrap gap-3">
			<a
				href={resolve('/blog')}
				class="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white no-underline transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white dark:focus-visible:outline-neutral-300"
				>All posts</a
			>
			<a
				href={resolve('/blog/topics')}
				class="inline-flex min-h-11 items-center rounded-md border border-neutral-400 px-4 py-2 text-sm font-semibold text-neutral-800 no-underline transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-300"
				>Browse topics</a
			>
		</div>
	</aside>
</article>
