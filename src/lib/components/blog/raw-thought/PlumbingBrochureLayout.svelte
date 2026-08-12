<script lang="ts">
	import '@fontsource-variable/caveat/wght.css';
	import { resolve } from '$app/paths';
	import { setContext, type Component } from 'svelte';
	import ReadingProgress from '$lib/components/animation/ReadingProgress.svelte';
	import ArticleActions from '$lib/components/blog/ArticleActions.svelte';
	import TTS from '$lib/components/blog/TTS.svelte';
	import PostNavigation from '$lib/components/blog/PostNavigation.svelte';
	import WordCloud from '$lib/components/visual/WordCloud.svelte';
	import type { BlogPostMetadata } from '$lib/content/posts';
	import manifestJson from '$lib/data/thought-folios/ai-plumbing.json';
	import { THOUGHT_FOLIO_CONTEXT, type ThoughtFolioManifest } from './thought-folio-context';
	import './ai-plumbing.css';

	type TopicLink = {
		label: string;
		href: string;
		hasLandingPage?: boolean;
		isHeadquarters?: boolean;
	};

	type RelatedPost = {
		title: string;
		slug: string;
		categoryLabel: string;
		categorySlug: string;
		sharedTags: string[];
	};

	type NavigationPost = {
		title: string;
		slug: string;
		categorySlug: string;
		categoryLabel: string;
		date: string;
	};

	type LayoutData = {
		slug: string;
		metadata: BlogPostMetadata & {
			categoryLabel: string;
			categorySlug: string;
		};
		postNavigation: {
			newer: NavigationPost | null;
			older: NavigationPost | null;
		};
		postTopics?: TopicLink[];
		relatedPosts?: RelatedPost[];
	};

	let { data, content: Content }: { data: LayoutData; content: Component } = $props();

	const manifest = manifestJson as ThoughtFolioManifest;
	setContext(THOUGHT_FOLIO_CONTEXT, { manifest });

	const dateFormatter = new Intl.DateTimeFormat('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

	let relatedPosts = $derived(data.relatedPosts ?? []);
	let postTopics = $derived(data.postTopics ?? []);
	let authorName = $derived(data.metadata.author?.trim() || 'Suvro Ghosh');

	function formatDate(value: string) {
		return dateFormatter.format(new Date(`${value}T00:00:00Z`));
	}
</script>

<ReadingProgress ink="var(--folio-lime)" />

<div class="plumbing-folio" data-thought-folio={manifest.id}>
	<div class="folio-utility" data-tts-exclude>
		<nav class="folio-breadcrumb" aria-label="Breadcrumb">
			<ol>
				<li><a href={resolve('/')}>Home</a></li>
				<li aria-hidden="true">/</li>
				<li><a href={resolve('/blog')}>Essays</a></li>
			</ol>
		</nav>
		<span>{manifest.issue}</span>
		<span>{data.metadata.readingTime ?? 'Field guide'}</span>
	</div>

	<article class="folio-book">
		<section
			class="folio-cover thought-spread"
			id="cover"
			data-tone="coal"
			aria-labelledby="folio-title"
		>
			<div class="thought-spread__rail" aria-hidden="true" data-tts-exclude>
				<span>{manifest.issue}</span>
				<span>00</span>
				<span>Orientation plate</span>
			</div>
			<div class="thought-spread__leaves">
				<div class="thought-leaf folio-cover__lead" data-side="left">
					<div class="folio-cover__art" aria-hidden="true">
						<img
							src="/images/thought-folios/ai-plumbing/department-cabinet.jpg"
							alt=""
							width="1003"
							height="1568"
							fetchpriority="high"
							decoding="async"
						/>
					</div>
					<div class="folio-cover__copy">
						<p class="folio-kicker">A satirical field manual</p>
						<h1 id="folio-title">
							<span class="folio-title__quiet">The Magnificent</span>
							<span class="folio-title__primary">Plumbing</span>
							<span class="folio-title__secondary">Department <em>of</em></span>
							<span class="folio-title__closing">Artificial Intelligence</span>
						</h1>
						<p class="folio-deck">
							Hands, doors, manuals, suitcases, tripwires—and the nouns hired to supervise them.
						</p>
					</div>
				</div>

				<div class="thought-leaf folio-cover__contents" data-side="right">
					<div class="folio-cover__masthead">
						<p>{data.metadata.categoryLabel}</p>
						<p>
							By <a href={resolve('/resume')} rel="author">{authorName}</a><br />
							Published <time datetime={data.metadata.date}>{formatDate(data.metadata.date)}</time>
							{#if data.metadata.dateModified}
								<br />Updated
								<time datetime={data.metadata.dateModified}
									>{formatDate(data.metadata.dateModified)}</time
								>
							{/if}
						</p>
					</div>
					<div>
						<p class="folio-kicker">Contents / pressure map</p>
						<ol class="folio-contents">
							{#each manifest.spreads as spread (spread.id)}
								<li>
									<a href={`#${spread.id}`}>
										<span>{spread.number}</span>
										<strong>{spread.title}</strong>
										<small>{spread.kicker}</small>
									</a>
								</li>
							{/each}
						</ol>
					</div>
					<div class="folio-tts">
						<p class="folio-kicker">Audio pressure valve</p>
						<TTS />
						{#if data.metadata.status === 'living'}
							<p class="folio-living">
								<span aria-hidden="true"></span> Living essay — fittings may change.
							</p>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<div class="folio-reading prose" data-article-reading-region>
			<Content />
		</div>

		<section
			class="folio-endpaper thought-spread"
			data-tone="paper"
			aria-labelledby="residue-heading"
			data-tts-exclude
		>
			<div class="thought-spread__rail" aria-hidden="true" data-tts-exclude>
				<span>{manifest.issue}</span>
				<span>12</span>
				<span>Residue &amp; controls</span>
			</div>
			<div class="thought-spread__leaves">
				<div class="thought-leaf folio-residue" data-side="left">
					<p class="folio-kicker">Language left in the pipes</p>
					<h2 id="residue-heading">Pressure residue</h2>
					<WordCloud slug={data.slug} title={data.metadata.title} class="folio-word-cloud" />
				</div>
				<div class="thought-leaf folio-controls" data-side="right">
					<p class="folio-kicker">Operator panel</p>
					<h2>Keep, print, or pass it on</h2>
					<p>
						This page is a one-off visual system. The essay remains ordinary Markdown underneath, so
						the words survive if the machinery is removed.
					</p>
					<ArticleActions title={data.metadata.title} />

					{#if postTopics.length > 0}
						<nav class="folio-topics" aria-label="Post topics">
							{#each postTopics as topic (topic.href)}
								<a href={resolve(topic.href as '/blog')}>{topic.label}</a>
							{/each}
						</nav>
					{/if}

					<div class="folio-signoff">
						<span>Filed by</span>
						<a href={resolve('/resume')} rel="author">{authorName}</a>
						<small>Calcutta / {formatDate(data.metadata.date)}</small>
					</div>
				</div>
			</div>
		</section>

		<div class="folio-navigation" data-tts-exclude>
			<PostNavigation newer={data.postNavigation.newer} older={data.postNavigation.older} />
		</div>

		{#if relatedPosts.length > 0}
			<section class="folio-related" aria-labelledby="related-heading" data-tts-exclude>
				<div class="folio-related__head">
					<p class="folio-kicker">Adjacent pipework</p>
					<h2 id="related-heading">Related reading</h2>
				</div>
				<div class="folio-related__grid">
					{#each relatedPosts as post, index (post.slug)}
						<a
							href={resolve('/blog/[category]/[slug]', {
								category: post.categorySlug,
								slug: post.slug
							})}
						>
							<span>{String(index + 1).padStart(2, '0')}</span>
							<small>{post.categoryLabel}</small>
							<strong>{post.title}</strong>
							<em>{post.sharedTags.slice(0, 3).join(' · ') || 'More from the field notes'}</em>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	</article>
</div>
