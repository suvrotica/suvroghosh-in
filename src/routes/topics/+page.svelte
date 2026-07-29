<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import SEO from '$lib/components/seo/SEO.svelte';
	import LivingTopicMap from '$lib/components/topics/LivingTopicMap.svelte';
	import {
		absoluteUrl,
		breadcrumbSchema,
		collectionPageSchema,
		itemListSchema,
		siteTitle,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import { topicHeadquartersPath } from '$lib/content/topics';

	let { data }: { data: PageData } = $props();

	const title = `Topic Headquarters | ${siteTitle}`;
	const description =
		'Guided routes through Suvro Ghosh’s substantial subjects, with a clear starting point, ordered reading paths, glossaries, FAQs, and complete related archives.';
	const canonicalUrl = `${siteUrl}/topics`;
	const dateFormatter = new Intl.DateTimeFormat('en-IN', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
	const groups = $derived(
		Array.from(new Set(data.topics.map((topic) => topic.group))).map((name) => ({
			name,
			topics: data.topics.filter((topic) => topic.group === name)
		}))
	);

	function formatDate(value: string) {
		return dateFormatter.format(new Date(`${value}T00:00:00`));
	}
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	modifiedTime={data.effectiveDateModified}
	keywords={[
		'Topic Headquarters',
		'HL7',
		'FHIR',
		'Healthcare AI',
		'Calcutta',
		'Bipolar depression',
		'Interactive mathematics',
		'Suvro Ghosh'
	]}
	schema={withSiteGraph([
		collectionPageSchema({
			name: 'Topic Headquarters',
			description,
			url: canonicalUrl,
			dateModified: data.effectiveDateModified
		}),
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Topic Headquarters', url: canonicalUrl }
		]),
		itemListSchema({
			name: 'Topic Headquarters',
			url: canonicalUrl,
			items: data.topics.map((topic) => ({
				name: topic.title,
				url: absoluteUrl(topicHeadquartersPath(topic.slug)) ?? canonicalUrl
			}))
		})
	])}
/>

<article class="page-enter py-4 md:py-8">
	<nav aria-label="Breadcrumb" class="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
		<ol class="flex flex-wrap items-center gap-2">
			<li>
				<a
					href={resolve('/')}
					class="inline-flex min-h-11 items-center font-semibold underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:text-white dark:focus-visible:outline-neutral-300"
					>Home</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li aria-current="page" class="font-medium text-neutral-800 dark:text-neutral-200">
				Topic Headquarters
			</li>
		</ol>
	</nav>

	<header class="mb-12 border-y border-neutral-300 py-8 dark:border-neutral-700">
		<p
			class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Guided reading
		</p>
		<h1 class="archive-title mb-4 font-bold text-neutral-950 dark:text-neutral-50">
			Topic Headquarters
		</h1>
		<p
			class="mb-0 max-w-[var(--article-width)] text-left font-serif text-lg leading-relaxed text-neutral-700 dark:text-neutral-300"
		>
			These are editorial routes through subjects that need more than a tag archive. Each
			headquarters explains the terrain, chooses a first piece, builds three reading paths, and
			still keeps every related item within reach.
		</p>
		<p class="mt-4 mb-0 text-left text-sm text-neutral-500 dark:text-neutral-400">
			Updated <time datetime={data.effectiveDateModified}
				>{formatDate(data.effectiveDateModified)}</time
			>
		</p>
	</header>

	<LivingTopicMap topics={data.topics} />

	<div class="space-y-12" data-topic-directory>
		{#each groups as group (group.name)}
			<section aria-labelledby={`group-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
				<h2
					id={`group-${group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
					class="mb-5 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
				>
					{group.name}
				</h2>
				<ul class="grid gap-4 sm:grid-cols-2">
					{#each group.topics as topic (topic.slug)}
						<li>
							<a
								href={resolve('/topics/[slug]', { slug: topic.slug })}
								class="post-card group flex h-full min-h-64 flex-col rounded-xl border border-neutral-300 bg-white p-5 no-underline shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-visible:outline-neutral-300"
							>
								<p
									class="mb-2 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
								>
									{topic.resourceCount}
									{topic.resourceCount === 1 ? 'resource' : 'resources'}
								</p>
								<h3
									class="mb-3 text-xl font-bold text-neutral-950 transition-colors group-hover:text-neutral-600 dark:text-neutral-50 dark:group-hover:text-neutral-300"
								>
									{topic.title}
								</h3>
								<p
									class="mb-4 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
								>
									{topic.description}
								</p>
								<div
									class="mt-auto border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800"
								>
									<p class="mb-1 text-left font-semibold text-neutral-800 dark:text-neutral-200">
										Start with {topic.bestStartingArticle.title}
									</p>
									<p class="mb-0 text-left text-xs text-neutral-500 dark:text-neutral-400">
										Updated {formatDate(topic.effectiveDateModified)}
									</p>
								</div>
								<span
									class="mt-4 inline-flex min-h-11 items-center self-start text-sm font-bold text-neutral-950 underline decoration-neutral-400 underline-offset-4 dark:text-neutral-100"
								>
									Explore topic <span class="ml-1" aria-hidden="true">→</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</article>
