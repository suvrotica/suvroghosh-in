<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import SEO from '$lib/components/seo/SEO.svelte';
	import TopicResourceCard from '$lib/components/topics/TopicResourceCard.svelte';

	let { data }: { data: PageData } = $props();

	let TopicContent = $derived(data.content);
	let readingPaths = $derived([
		{
			key: 'beginner',
			id: 'beginner',
			label: 'Beginner path',
			eyebrow: 'Begin here',
			path: data.topic.readingPaths.beginner
		},
		{
			key: 'intermediate',
			id: 'intermediate',
			label: 'Intermediate path',
			eyebrow: 'Build context',
			path: data.topic.readingPaths.intermediate
		},
		{
			key: 'deep',
			id: 'deep-reading',
			label: 'Deep-reading path',
			eyebrow: 'Go further',
			path: data.topic.readingPaths.deep
		}
	]);
	let relatedResourceGroups = $derived(
		[
			{
				key: 'visualizations',
				label: 'Visualizations and simulations',
				items: data.topic.relatedResources.visualizations
			},
			{ key: 'games', label: 'Games', items: data.topic.relatedResources.games },
			{
				key: 'other',
				label: 'Other interactive and visual material',
				items: data.topic.relatedResources.other
			}
		].filter((group) => group.items.length > 0)
	);

	const dateFormatter = new Intl.DateTimeFormat('en-IN', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});

	function formatDate(value: string) {
		return dateFormatter.format(new Date(`${value}T00:00:00`));
	}
</script>

<SEO {...data.seo} />

<article class="page-enter py-4 md:py-8">
	<nav aria-label="Breadcrumb" class="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
		<ol class="flex min-w-0 flex-wrap items-center gap-2">
			<li>
				<a
					href={resolve('/')}
					class="inline-flex min-h-11 items-center font-semibold underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:text-white dark:focus-visible:outline-neutral-300"
					>Home</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li>
				<a
					href={resolve('/topics')}
					class="inline-flex min-h-11 items-center font-semibold underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:text-white dark:focus-visible:outline-neutral-300"
					>Topic Headquarters</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li
				aria-current="page"
				class="min-w-0 truncate font-medium text-neutral-800 dark:text-neutral-200"
			>
				{data.topic.shortTitle}
			</li>
		</ol>
	</nav>

	<header class="mb-10 border-y border-neutral-300 py-8 dark:border-neutral-700">
		<p
			class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Topic Headquarters
		</p>
		<h1 class="archive-title mb-4 font-bold text-neutral-950 dark:text-neutral-50">
			{data.topic.title}
		</h1>
		<p
			class="mb-5 max-w-[var(--article-width)] text-left font-serif text-lg leading-relaxed text-neutral-700 dark:text-neutral-300"
		>
			{data.topic.description}
		</p>
		<div
			class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400"
		>
			<span
				>{data.topic.resourceCount}
				{data.topic.resourceCount === 1 ? 'resource' : 'resources'}</span
			>
			<span aria-hidden="true">·</span>
			<span
				>Updated <time datetime={data.topic.effectiveDateModified}
					>{formatDate(data.topic.effectiveDateModified)}</time
				></span
			>
		</div>
	</header>

	<section
		aria-label={`${data.topic.title} introduction`}
		data-pagefind-body
		class="article-prose mx-auto prose mb-12 max-w-[var(--article-width)] prose-neutral dark:prose-invert"
	>
		<TopicContent />
	</section>

	<section id="start-here" aria-labelledby="start-here-heading" class="mb-10 scroll-mt-24">
		<div class="mb-5">
			<p
				class="mb-2 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Best place to start
			</p>
			<h2
				id="start-here-heading"
				class="mb-3 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
			>
				One useful first door
			</h2>
			<p
				class="mb-0 max-w-2xl text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
			>
				{data.topic.startHereReason}
			</p>
		</div>
		<TopicResourceCard resource={data.topic.bestStartingArticle} featured eager />
	</section>

	<nav
		aria-label="On this topic page"
		class="mb-12 rounded-lg border border-neutral-300 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-900"
	>
		<p
			class="mb-2 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			On this page
		</p>
		<ul class="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
			<li><a href="#beginner">Beginner</a></li>
			<li><a href="#intermediate">Intermediate</a></li>
			<li><a href="#deep-reading">Deep reading</a></li>
			{#if relatedResourceGroups.length > 0}<li>
					<a href="#related-resources">Interactives</a>
				</li>{/if}
			<li><a href="#glossary">Glossary</a></li>
			<li><a href="#faq">FAQ</a></li>
			<li><a href="#recently-updated">Recently updated</a></li>
			<li><a href="#all-material">All material</a></li>
		</ul>
	</nav>

	<section aria-labelledby="reading-paths-heading" class="mb-14">
		<h2
			id="reading-paths-heading"
			class="mb-3 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
		>
			Three reading paths
		</h2>
		<p
			class="mb-6 max-w-2xl text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
		>
			These are ordered editorial journeys, not automatic difficulty labels. Follow one route or
			move between them as your questions change.
		</p>

		<div class="grid gap-5 lg:grid-cols-3">
			{#each readingPaths as readingPath (readingPath.key)}
				<section
					id={readingPath.id}
					aria-labelledby={`${readingPath.id}-heading`}
					class="scroll-mt-24 rounded-xl border border-neutral-300 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-900/60"
				>
					<p
						class="mb-2 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						{readingPath.eyebrow}
					</p>
					<h3
						id={`${readingPath.id}-heading`}
						class="mb-3 text-xl font-bold text-neutral-950 dark:text-neutral-50"
					>
						{readingPath.label}
					</h3>
					<p class="mb-5 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
						{readingPath.path.description}
					</p>
					<ol class="space-y-4">
						{#each readingPath.path.items as resource, index (resource.path)}
							<li class="relative pl-7">
								<span
									aria-hidden="true"
									class="absolute top-3 left-0 flex h-5 w-5 items-center justify-center rounded-full border border-neutral-400 text-[0.68rem] font-bold text-neutral-600 dark:border-neutral-600 dark:text-neutral-300"
									>{index + 1}</span
								>
								<TopicResourceCard {resource} />
							</li>
						{/each}
					</ol>
				</section>
			{/each}
		</div>
	</section>

	{#if relatedResourceGroups.length > 0}
		<section
			id="related-resources"
			aria-labelledby="related-resources-heading"
			class="mb-14 scroll-mt-24"
		>
			<h2
				id="related-resources-heading"
				class="mb-3 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
			>
				Related visual and interactive material
			</h2>
			<p
				class="mb-6 max-w-2xl text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
			>
				These resources let you inspect, manipulate, play, listen, or look instead of only reading
				an argument.
			</p>
			<div class="space-y-8">
				{#each relatedResourceGroups as group (group.key)}
					<section aria-labelledby={`resource-group-${group.key}`}>
						<h3
							id={`resource-group-${group.key}`}
							class="mb-4 text-lg font-bold text-neutral-950 dark:text-neutral-50"
						>
							{group.label}
						</h3>
						<ul class="grid gap-4 sm:grid-cols-2">
							{#each group.items as resource (resource.path)}
								<li><TopicResourceCard {resource} /></li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		</section>
	{/if}

	<section
		id="contrarian-view"
		aria-labelledby="contrarian-heading"
		class="mb-14 scroll-mt-24 border-y border-neutral-400 py-7 dark:border-neutral-600"
	>
		<p
			class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Suvro’s contrarian view
		</p>
		<h2
			id="contrarian-heading"
			class="mb-4 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
		>
			{data.topic.contrarianView.heading}
		</h2>
		<div class="max-w-[var(--article-width)] space-y-4">
			{#each data.topic.contrarianView.paragraphs as paragraph (paragraph)}
				<p
					class="mb-0 text-left font-serif text-base leading-relaxed text-neutral-700 dark:text-neutral-300"
				>
					{paragraph}
				</p>
			{/each}
		</div>
	</section>

	<section id="glossary" aria-labelledby="glossary-heading" class="mb-14 scroll-mt-24">
		<h2
			id="glossary-heading"
			class="mb-3 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
		>
			Glossary
		</h2>
		<p
			class="mb-6 max-w-2xl text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
		>
			A small working vocabulary for this subject, defined for the way it appears across this site.
		</p>
		<dl class="grid gap-x-8 gap-y-0 sm:grid-cols-2">
			{#each data.topic.glossary as entry (entry.term)}
				<div class="border-t border-neutral-300 py-4 dark:border-neutral-700">
					<dt class="font-bold text-neutral-950 dark:text-neutral-50">
						{#if entry.relatedPath}
							<a
								href={resolve(entry.relatedPath as '/blog')}
								class="underline decoration-neutral-400 underline-offset-4">{entry.term}</a
							>
						{:else}
							{entry.term}
						{/if}
					</dt>
					<dd class="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
						{entry.definition}
					</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section id="faq" aria-labelledby="faq-heading" class="mb-14 scroll-mt-24">
		<h2
			id="faq-heading"
			class="mb-3 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
		>
			Frequently asked questions
		</h2>
		<div
			class="mt-6 divide-y divide-neutral-300 border-y border-neutral-300 dark:divide-neutral-700 dark:border-neutral-700"
		>
			{#each data.topic.faqs as item (item.question)}
				<details class="group">
					<summary
						class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-50 dark:focus-visible:outline-neutral-300 [&::-webkit-details-marker]:hidden"
					>
						<span>{item.question}</span>
						<span aria-hidden="true" class="text-xl font-normal group-open:hidden">+</span>
						<span aria-hidden="true" class="hidden text-xl font-normal group-open:inline">−</span>
					</summary>
					<p
						class="mb-5 max-w-[var(--article-width)] text-left text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
					>
						{item.answer}
					</p>
				</details>
			{/each}
		</div>
	</section>

	<section
		id="recently-updated"
		aria-labelledby="recently-updated-heading"
		class="mb-14 scroll-mt-24"
	>
		<h2
			id="recently-updated-heading"
			class="mb-3 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
		>
			Recently updated material
		</h2>
		<p
			class="mb-6 max-w-2xl text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
		>
			Automatically ordered by each resource’s declared update date, with publication date used only
			when no update is recorded.
		</p>
		<ul class="grid gap-4 sm:grid-cols-2">
			{#each data.topic.recentlyUpdated as resource (resource.path)}
				<li><TopicResourceCard {resource} compact /></li>
			{/each}
		</ul>
	</section>

	<section id="all-material" aria-labelledby="all-material-heading" class="mb-14 scroll-mt-24">
		<h2
			id="all-material-heading"
			class="mb-3 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
		>
			Browse all material
		</h2>
		<p
			class="mb-6 max-w-2xl text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
		>
			The complete published collection currently assigned to this headquarters: {data.topic
				.resourceCount}
			{data.topic.resourceCount === 1 ? 'resource' : 'resources'}.
		</p>
		<ul class="grid gap-4 sm:grid-cols-2">
			{#each data.topic.allMaterial as resource (resource.path)}
				<li><TopicResourceCard {resource} compact /></li>
			{/each}
		</ul>
	</section>

	{#if data.relatedTopics.length > 0}
		<section
			aria-labelledby="related-topics-heading"
			class="border-t border-neutral-300 pt-8 dark:border-neutral-700"
		>
			<h2
				id="related-topics-heading"
				class="mb-5 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
			>
				Related Topic Headquarters
			</h2>
			<ul class="grid gap-4 sm:grid-cols-2">
				{#each data.relatedTopics as topic (topic.slug)}
					<li>
						<a
							href={resolve('/topics/[slug]', { slug: topic.slug })}
							class="post-card group flex h-full min-h-40 flex-col rounded-lg border border-neutral-300 bg-white p-5 no-underline shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-visible:outline-neutral-300"
						>
							<h3
								class="mb-2 text-lg font-bold text-neutral-950 transition-colors group-hover:text-neutral-600 dark:text-neutral-50 dark:group-hover:text-neutral-300"
							>
								{topic.title}
							</h3>
							<p
								class="mb-4 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
							>
								{topic.description}
							</p>
							<span
								class="mt-auto text-sm font-bold underline decoration-neutral-400 underline-offset-4"
							>
								Explore topic <span aria-hidden="true">→</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</article>
