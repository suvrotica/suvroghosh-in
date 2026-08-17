<script lang="ts">
	import 'katex/dist/katex.min.css';
	import courierPrimeLatinUrl from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2?url';
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import ReadingProgress from '$lib/components/animation/ReadingProgress.svelte';
	import ArticleActions from '$lib/components/blog/ArticleActions.svelte';
	import ArticleQuickAnswer from '$lib/components/blog/ArticleQuickAnswer.svelte';
	import AuthorPanel from '$lib/components/blog/AuthorPanel.svelte';
	import Notebook from '$lib/components/blog/Notebook.svelte';
	import PostNavigation from '$lib/components/blog/PostNavigation.svelte';
	import HealthcareHumanMarginLayout from '$lib/components/blog/raw-thought/HealthcareHumanMarginLayout.svelte';
	import PlumbingBrochureLayout from '$lib/components/blog/raw-thought/PlumbingBrochureLayout.svelte';
	import TableOfContents from '$lib/components/blog/TableOfContents.svelte';
	import WordCloud from '$lib/components/visual/WordCloud.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let PostContent = $derived(data.content);
	let authorName = $derived(data.metadata.author?.trim() || 'Suvro Ghosh');
	let isSiteAuthor = $derived(authorName.toLocaleLowerCase('en') === 'suvro ghosh');
	let headings = $derived(data.metadata.headings ?? []);
	let postNavigation = $derived(data.postNavigation);
	let postTopics = $derived(data.postTopics ?? []);
	let relatedPosts = $derived(data.relatedPosts ?? []);

	const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});

	function formatArticleDate(value: string) {
		return longDateFormatter.format(new Date(`${value}T00:00:00Z`));
	}
</script>

<svelte:head>
	{#if data.metadata.rawThoughtLayout !== 'healthcare-human-margin' && !(data.metadata.categorySlug === 'visualizations' && data.slug === 'the-profile-that-knows-almost-nothing-about-you')}
		<link
			rel="preload"
			href={courierPrimeLatinUrl}
			as="font"
			type="font/woff2"
			crossorigin="anonymous"
		/>
	{/if}
	{#if data.metadata.rawThoughtLayout === 'healthcare-human-margin'}
		<link
			rel="preload"
			href="/fonts/human-margin/barlow-condensed-latin-600-normal.woff2"
			as="font"
			type="font/woff2"
			crossorigin="anonymous"
		/>
	{/if}
</svelte:head>

<SEO {...data.seo} />

{#if data.metadata.rawThoughtLayout === 'ai-plumbing-field-manual'}
	<PlumbingBrochureLayout {data} content={PostContent} />
{:else if data.metadata.rawThoughtLayout === 'healthcare-human-margin'}
	<HealthcareHumanMarginLayout {data} content={PostContent} />
{:else}
	<div
		class="article-shell page-enter mx-auto max-w-6xl px-4 py-12 md:px-8 xl:relative xl:left-1/2 xl:grid xl:w-[72rem] xl:max-w-[calc(100vw-2rem)] xl:-translate-x-1/2 xl:grid-cols-[minmax(0,48rem)_minmax(12rem,16rem)] xl:items-start xl:gap-12 {data
			.metadata.immersiveLead
			? 'immersive-lead'
			: ''}"
		data-essay-ink={data.essayInk}
	>
		<ReadingProgress ink="var(--essay-ink)" />
		<article class="article-print mx-auto max-w-3xl min-w-0 xl:mx-0">
			<nav
				aria-label="Breadcrumb"
				class="text-sm text-neutral-500 dark:text-neutral-400 print:hidden {data.metadata
					.immersiveLead
					? 'mb-3'
					: 'mb-8'}"
			>
				<ol class="flex min-w-0 flex-wrap items-center gap-2">
					<li>
						<a
							href={resolve('/')}
							class="transition-colors hover:text-neutral-950 dark:hover:text-neutral-100">Home</a
						>
					</li>
					<li><span aria-hidden="true">/</span></li>
					<li>
						<a
							href={resolve('/blog')}
							class="transition-colors hover:text-neutral-950 dark:hover:text-neutral-100">Blog</a
						>
					</li>
					<li><span aria-hidden="true">/</span></li>
					<li>
						<a
							href={resolve('/blog/[category]', { category: data.metadata.categorySlug })}
							class="transition-colors hover:text-neutral-950 dark:hover:text-neutral-100"
							>{data.metadata.categoryLabel}</a
						>
					</li>
					<li class="hidden sm:block"><span aria-hidden="true">/</span></li>
					<li
						class="hidden min-w-0 flex-1 truncate font-medium text-neutral-900 sm:block dark:text-neutral-200"
						aria-current="page"
					>
						{data.metadata.title}
					</li>
				</ol>
			</nav>

			{#if !data.metadata.immersiveLead}
				<header
					class="mb-12 border-b border-neutral-200 pb-8 dark:border-neutral-800"
					data-route-atmosphere-region
					data-route-scene="article"
				>
					<h1
						class="article-title mb-4 font-sans font-bold tracking-tight text-neutral-900 dark:text-white"
					>
						{data.metadata.title}
					</h1>
					<div class="mb-6 h-px w-20 bg-[var(--essay-ink)]" aria-hidden="true"></div>
					<div
						class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400"
					>
						<span
							>By <a
								href={resolve('/resume')}
								rel="author"
								class="font-medium transition-colors hover:text-neutral-950 dark:hover:text-neutral-100"
								>{authorName}</a
							></span
						>
						{#if data.metadata.date}<span aria-hidden="true">&middot;</span><span
								>Published <time datetime={data.metadata.date}
									>{formatArticleDate(data.metadata.date)}</time
								></span
							>{/if}
						{#if data.metadata.dateModified}<span aria-hidden="true">&middot;</span><span
								>Updated <time datetime={data.metadata.dateModified}
									>{formatArticleDate(data.metadata.dateModified)}</time
								></span
							>{/if}
						{#if data.metadata.readingTime}<span aria-hidden="true">&middot;</span><span
								>{data.metadata.readingTime} read</span
							>{/if}
					</div>
					{#if data.metadata.status === 'living'}<p
							class="mt-6 inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
						>
							This is a living essay and may be updated as facts change.
						</p>{/if}
					{#if postTopics.length > 0}
						<nav aria-label="Post topics" class="mt-6 flex flex-wrap gap-2 print:hidden">
							{#each postTopics as topic (topic.href)}
								<a
									href={resolve(topic.href as '/blog')}
									class="inline-flex min-h-11 items-center rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
									title={topic.hasLandingPage ? `Browse the ${topic.label} topic` : undefined}
								>
									{topic.isHeadquarters ? `Explore ${topic.label}` : topic.label}
								</a>
							{/each}
						</nav>
					{/if}

					<ArticleActions title={data.metadata.title} />
				</header>
			{/if}

			{#if !data.metadata.interactiveFirst && !data.metadata.immersiveLead}
				<div class="print:hidden">
					<TableOfContents {headings} variant="mobile" />
				</div>
			{/if}

			{#if !data.metadata.interactiveFirst && !data.metadata.immersiveLead && (data.metadata.inPlainEnglish || data.metadata.keyTerms?.length || data.metadata.faq?.length)}
				<ArticleQuickAnswer
					inPlainEnglish={data.metadata.inPlainEnglish}
					keyTerms={data.metadata.keyTerms}
					faq={data.metadata.faq}
				/>
			{/if}

			{#if data.metadata.notebook && !data.metadata.immersiveLead}
				<Notebook
					src={data.metadata.notebook}
					title={`${data.metadata.title} — Mojo notebook`}
					caption="Rendered from the source notebook during the site build."
				/>
			{/if}

			<div
				class="article-prose mx-auto prose max-w-[var(--article-width)] prose-neutral dark:prose-invert prose-headings:scroll-mt-20 prose-headings:font-sans prose-code:font-mono prose-pre:font-mono prose-img:rounded-xl"
				data-article-reading-region
			>
				<PostContent />
			</div>

			{#if data.metadata.immersiveLead}
				<footer
					aria-label="Article information"
					class="mt-12 border-y border-neutral-200 py-6 dark:border-neutral-800 print:hidden"
				>
					{#if data.metadata.status === 'living'}
						<p
							class="mb-5 inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
						>
							This is a living essay and may be updated as facts change.
						</p>
					{/if}
					{#if postTopics.length > 0}
						<p
							class="mb-3 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
						>
							Explore the topics
						</p>
						<nav aria-label="Post topics" class="flex flex-wrap gap-2">
							{#each postTopics as topic (topic.href)}
								<a
									href={resolve(topic.href as '/blog')}
									class="inline-flex min-h-11 items-center rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
									title={topic.hasLandingPage ? `Browse the ${topic.label} topic` : undefined}
								>
									{topic.isHeadquarters ? `Explore ${topic.label}` : topic.label}
								</a>
							{/each}
						</nav>
					{/if}

					<ArticleActions title={data.metadata.title} />
				</footer>
			{/if}

			{#if data.metadata.notebook && data.metadata.immersiveLead}
				<Notebook
					src={data.metadata.notebook}
					title={`${data.metadata.title} — Mojo notebook`}
					caption="Rendered from the source notebook during the site build."
				/>
			{/if}

			{#if (data.metadata.interactiveFirst || data.metadata.immersiveLead) && (data.metadata.inPlainEnglish || data.metadata.keyTerms?.length || data.metadata.faq?.length)}
				<ArticleQuickAnswer
					inPlainEnglish={data.metadata.inPlainEnglish}
					keyTerms={data.metadata.keyTerms}
					faq={data.metadata.faq}
					deferred
				/>
			{/if}

			{#if data.metadata.categorySlug === 'healthcare-it'}
				<section
					data-tts-exclude
					aria-labelledby="healthcare-it-consulting-heading"
					class="mt-12 rounded-lg border border-neutral-300 bg-neutral-50 p-6 dark:border-neutral-700 dark:bg-neutral-900/60 print:hidden"
				>
					<p
						class="mb-2 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						Healthcare IT consulting
					</p>
					<h2
						id="healthcare-it-consulting-heading"
						class="mb-3 text-xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
					>
						Working through a difficult clinical data or interoperability problem?
					</h2>
					<p
						class="m-0 max-w-2xl text-left text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"
					>
						I advise on HIE and EHR architecture, HL7/FHIR interoperability, clinical data
						migration, terminology, analytics, and AI data readiness.
					</p>
					<div class="mt-5 flex flex-wrap gap-x-5 gap-y-2">
						<a
							href={resolve('/consulting')}
							class="inline-flex min-h-11 items-center text-sm font-bold text-neutral-950 underline decoration-neutral-500 underline-offset-4 transition-colors hover:text-neutral-600 hover:decoration-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-100 dark:decoration-neutral-500 dark:hover:text-neutral-300 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
						>
							See healthcare IT consulting <span class="ml-1" aria-hidden="true">→</span>
						</a>
						<a
							href={resolve('/healthcare-it-gulf')}
							class="inline-flex min-h-11 items-center text-sm font-semibold text-neutral-700 underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-300 dark:decoration-neutral-600 dark:hover:text-white dark:hover:decoration-neutral-300 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
						>
							Gulf &amp; Kuwait healthcare IT <span class="ml-1" aria-hidden="true">→</span>
						</a>
					</div>
				</section>
			{/if}

			{#if isSiteAuthor}
				<AuthorPanel />
			{/if}

			<div class="print:hidden">
				<ScrollReveal>
					<Separator class="mt-16" />
					<WordCloud slug={data.slug} title={data.metadata.title} />
				</ScrollReveal>
			</div>

			<div class="print:hidden">
				<PostNavigation newer={postNavigation.newer} older={postNavigation.older} />
			</div>

			{#if relatedPosts.length > 0}
				<ScrollReveal delay={100}>
					<section aria-labelledby="related-reading-heading" class="mt-12 print:hidden">
						<h2
							id="related-reading-heading"
							class="mb-2 text-2xl font-bold text-neutral-900 dark:text-white"
						>
							Related reading
						</h2>
						<p class="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
							Selected by shared topics and section, with closer publication dates breaking ties.
						</p>
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{#each relatedPosts as post (post.slug)}
								<a
									href={resolve('/blog/[category]/[slug]', {
										category: post.categorySlug,
										slug: post.slug
									})}
									class="post-card group flex min-h-32 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white no-underline shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/50 dark:focus-visible:outline-neutral-300"
								>
									{#if post.thumbnail}
										<div
											class="aspect-[1200/630] overflow-hidden bg-neutral-100 dark:bg-neutral-900"
										>
											<img
												src={post.thumbnail}
												alt={post.thumbnailAlt?.trim() || ''}
												width="1200"
												height="630"
												loading="lazy"
												decoding="async"
												class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
											/>
										</div>
									{/if}
									<div class="flex flex-1 flex-col p-4">
										<div class="mb-1 text-xs font-medium tracking-wider text-neutral-400 uppercase">
											{post.categoryLabel}
										</div>
										<div
											class="font-semibold text-neutral-900 transition-colors group-hover:text-neutral-600 dark:text-neutral-100 dark:group-hover:text-neutral-300"
										>
											{post.title}
										</div>
										<div
											class="mt-auto pt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400"
										>
											{#if post.sharedTags.length > 0}
												Shared topics: {post.sharedTags.join(' · ')}
											{:else}
												More in {post.categoryLabel}
											{/if}
										</div>
									</div>
								</a>
							{/each}
						</div>
					</section>
				</ScrollReveal>
			{/if}
		</article>

		{#if headings.length >= 2 && !data.metadata.immersiveLead}
			<aside class="hidden xl:block xl:pt-20 print:hidden">
				<TableOfContents {headings} variant="desktop" />
			</aside>
		{/if}
	</div>
{/if}

<style>
	.article-shell.immersive-lead {
		padding-top: 0.5rem;
	}

	@media (min-width: 48rem) {
		.article-shell.immersive-lead {
			padding-top: 1rem;
		}
	}
</style>
