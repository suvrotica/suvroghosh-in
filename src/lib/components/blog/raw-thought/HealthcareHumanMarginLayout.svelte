<script lang="ts">
	import { resolve } from '$app/paths';
	import { setContext, type Component } from 'svelte';
	import ReadingProgress from '$lib/components/animation/ReadingProgress.svelte';
	import ArticleActions from '$lib/components/blog/ArticleActions.svelte';
	import AuthorPanel from '$lib/components/blog/AuthorPanel.svelte';
	import PostNavigation from '$lib/components/blog/PostNavigation.svelte';
	import TTS from '$lib/components/blog/TTS.svelte';
	import WordCloud from '$lib/components/visual/WordCloud.svelte';
	import type { BlogPostMetadata } from '$lib/content/posts';
	import manifestJson from '$lib/data/thought-folios/healthcare-human-margin.json';
	import ThoughtArt from './ThoughtArt.svelte';
	import {
		THOUGHT_FOLIO_CONTEXT,
		type ThoughtFolioManifest,
		type ThoughtFolioSpread
	} from './thought-folio-context';
	import humanMarginStyles from './healthcare-human-margin-brochure.css?url';

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
		thumbnail?: string;
		thumbnailAlt?: string;
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

	function requireSpread(id: string): ThoughtFolioSpread {
		const spread = manifest.spreads.find((candidate) => candidate.id === id);
		if (!spread) throw new Error(`Missing Human Margin manifest spread: ${id}`);
		return spread;
	}

	const coverSpread = requireSpread('cover');
	const briefSpread = requireSpread('reader-brief');
	const endpaperSpread = requireSpread('endpaper');

	const dateFormatter = new Intl.DateTimeFormat('en-GB', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

	let relatedPosts = $derived(data.relatedPosts ?? []);
	let postTopics = $derived(data.postTopics ?? []);
	let contents = $derived(manifest.contents ?? []);
	let authorName = $derived(data.metadata.author?.trim() || 'Suvro Ghosh');
	let coverTitleLines = $derived.by(() => {
		const words = data.metadata.title.trim().split(/\s+/u);
		if (words.length < 11) return [data.metadata.title];
		return [
			words.slice(0, 4).join(' '),
			words.slice(4, 7).join(' '),
			words.slice(7, 10).join(' '),
			words.slice(10).join(' ')
		];
	});

	function formatDate(value: string) {
		return dateFormatter.format(new Date(`${value}T00:00:00Z`));
	}

	async function prepareFolioPrint() {
		if (typeof document === 'undefined') return;

		const images = Array.from(
			document.querySelectorAll<HTMLImageElement>(
				'[data-thought-folio="healthcare-human-margin"] .thought-art img'
			)
		);
		for (const image of images) image.loading = 'eager';

		const deadline = performance.now() + 3_500;
		await new Promise<void>((resolveImages) => {
			const checkImages = () => {
				if (
					images.every((image) => image.complete && image.naturalWidth > 0) ||
					performance.now() >= deadline
				) {
					resolveImages();
					return;
				}
				window.setTimeout(checkImages, 50);
			};
			checkImages();
		});

		await Promise.all(
			images
				.filter((image) => image.complete && image.naturalWidth > 0)
				.map((image) => image.decode().catch(() => undefined))
		);
	}
</script>

<svelte:head>
	<link rel="stylesheet" href={humanMarginStyles} />
</svelte:head>

<div class="hm-folio" data-thought-folio={manifest.id}>
	<ReadingProgress ink="var(--hm-teal)" />

	<a class="hm-skip-link" href="#the-uncomfortable-premise">Skip to the article</a>

	<nav class="hm-utility" aria-label="Breadcrumb" data-tts-exclude data-pagefind-ignore>
		<ol>
			<li><a href={resolve('/')}>Home</a></li>
			<li aria-hidden="true">/</li>
			<li><a href={resolve('/blog')}>Blog</a></li>
			<li aria-hidden="true">/</li>
			<li>
				<a href={resolve('/blog/[category]', { category: data.metadata.categorySlug })}
					>{data.metadata.categoryLabel}</a
				>
			</li>
		</ol>
		<span>{manifest.issue}</span>
	</nav>

	<article class="hm-book" data-article-reading-region data-pagefind-body>
		<section
			class="thought-spread hm-cover"
			id={coverSpread.id}
			data-spread={coverSpread.number}
			data-tone={coverSpread.tone}
			aria-labelledby="hm-title"
		>
			<div class="thought-spread__rail" aria-hidden="true" data-tts-exclude>
				<span>{manifest.issue}</span>
				<span>{coverSpread.number}</span>
				<span>{coverSpread.kicker}</span>
			</div>
			<div class="thought-spread__leaves">
				<div class="thought-leaf hm-cover-lead" data-side="left">
					<div class="thought-leaf__content">
						<div class="hm-cover-strap" data-tts-exclude data-pagefind-ignore>
							<span>{data.metadata.categoryLabel}</span>
							<span>{manifest.label}</span>
						</div>

						<h1 id="hm-title" class="hm-cover-title">
							{#each coverTitleLines as line (line)}<span>{line + ' '}</span>{/each}
						</h1>

						<p class="hm-print-route" data-tts-exclude data-pagefind-ignore>
							<a
								href={resolve('/blog/[category]/[slug]', {
									category: data.metadata.categorySlug,
									slug: data.slug
								})}>www.suvroghosh.in/blog/{data.metadata.categorySlug}/{data.slug}</a
							>
						</p>

						<div class="hm-cover-meta" data-tts-exclude data-pagefind-ignore>
							<p><span>By</span><a href={resolve('/resume')} rel="author">{authorName}</a></p>
							<p>
								<span>Published</span><time datetime={data.metadata.date}
									>{formatDate(data.metadata.date)}</time
								>
							</p>
							{#if data.metadata.dateModified}
								<p>
									<span class="hm-date-pair"
										>Updated <time datetime={data.metadata.dateModified}
											>{formatDate(data.metadata.dateModified)}</time
										></span
									>
								</p>
							{/if}
						</div>

						<p class="hm-cover-deck" data-tts-exclude data-pagefind-ignore>
							{data.metadata.inPlainEnglish}
						</p>

						<ThoughtArt id="cover-service-panel" priority />
					</div>
				</div>

				<div
					class="thought-leaf hm-cover-index"
					data-side="right"
					data-tts-exclude
					data-pagefind-ignore
				>
					<div class="thought-leaf__content">
						<div class="hm-revision">
							<span>Issue 01</span>
							<span>Revision {data.metadata.dateModified ?? data.metadata.date}</span>
						</div>

						<nav class="hm-contents" aria-label="Article contents">
							<p class="hm-label">Contents / pressure map</p>
							<ol>
								{#each contents as item (item.anchor)}
									<li>
										<a href={`#${item.anchor}`}>
											<span>{item.number}</span><strong>{item.title}</strong>
										</a>
									</li>
								{/each}
							</ol>
						</nav>

						<div class="hm-tag-index">
							<p class="hm-label">Filed under</p>
							<ul>
								{#each data.metadata.tags as tag (tag)}<li>{tag}</li>{/each}
							</ul>
						</div>

						<blockquote class="hm-cover-thesis" aria-hidden="true">
							<span>The Human Margin</span>
							<p>The map is not the territory.</p>
						</blockquote>

						<div class="hm-front-controls">
							<ArticleActions title={data.metadata.title} preparePrint={prepareFolioPrint} />
							<a href={resolve('/blog/[category]', { category: data.metadata.categorySlug })}
								>Back to {data.metadata.categoryLabel}<span aria-hidden="true">→</span></a
							>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section
			class="thought-spread hm-reader-brief"
			id={briefSpread.id}
			data-spread={briefSpread.number}
			data-tone={briefSpread.tone}
			aria-label={briefSpread.title}
			data-tts-exclude
			data-pagefind-ignore
		>
			<div class="thought-spread__rail" aria-hidden="true">
				<span>{manifest.issue}</span><span>{briefSpread.number}</span><span
					>{briefSpread.kicker}</span
				>
			</div>
			<div class="thought-spread__leaves">
				<div class="thought-leaf hm-brief-summary" data-side="left">
					<div class="thought-leaf__content">
						<p class="hm-kicker">Quick Answer</p>
						<p class="hm-quick-answer">{data.metadata.inPlainEnglish}</p>
						<div class="hm-key-terms">
							<p class="hm-label">Six terms in the record</p>
							<ol>
								{#each data.metadata.keyTerms ?? [] as term, index (term)}
									<li><span>{String(index + 1).padStart(2, '0')}</span><strong>{term}</strong></li>
								{/each}
							</ol>
						</div>
						<div class="hm-listen">
							<p class="hm-label">Listen / canonical article only</p>
							<TTS />
						</div>
					</div>
				</div>

				<div class="thought-leaf hm-brief-faq" data-side="right">
					<div class="thought-leaf__content">
						<p class="hm-kicker">Questions before the machinery</p>
						<ol class="hm-faq-list">
							{#each data.metadata.faq ?? [] as item, index (item.question)}
								<li>
									<span>{String(index + 1).padStart(2, '0')}</span>
									<strong>{item.question}</strong>
									<p>{item.answer}</p>
								</li>
							{/each}
						</ol>
					</div>
				</div>
			</div>
		</section>

		<div class="hm-reading prose">
			<Content />
		</div>

		<section
			class="thought-spread hm-endpaper"
			id={endpaperSpread.id}
			data-spread={endpaperSpread.number}
			data-tone={endpaperSpread.tone}
			aria-label={endpaperSpread.title}
			data-tts-exclude
			data-pagefind-ignore
		>
			<div class="thought-spread__rail" aria-hidden="true">
				<span>{manifest.issue}</span><span>{endpaperSpread.number}</span><span
					>{endpaperSpread.kicker}</span
				>
			</div>
			<div class="thought-spread__leaves">
				<div class="thought-leaf hm-colophon" data-side="left">
					<div class="thought-leaf__content">
						<section class="hm-consulting" aria-labelledby="hm-consulting-heading">
							<p class="hm-label">Healthcare IT consulting</p>
							<h3 id="hm-consulting-heading">
								Working through a difficult clinical data or interoperability problem?
							</h3>
							<p>
								I advise on HIE and EHR architecture, HL7/FHIR interoperability, clinical data
								migration, terminology, analytics, and AI data readiness.
							</p>
							<nav aria-label="Healthcare IT consulting links">
								<a href={resolve('/consulting')}>See healthcare IT consulting</a>
								<a href={resolve('/healthcare-it-gulf')}>Gulf &amp; Kuwait healthcare IT</a>
							</nav>
						</section>

						<AuthorPanel />
						<WordCloud slug={data.slug} title={data.metadata.title} class="hm-word-cloud" />
					</div>
				</div>

				<div class="thought-leaf hm-index-controls" data-side="right">
					<div class="thought-leaf__content">
						<p class="hm-kicker">Keep the record open</p>
						<p class="hm-endpaper-deck">
							The prose remains ordinary Markdown beneath this one-off folio. Print it, revisit it,
							follow the adjacent record, or send a correction.
						</p>

						{#if postTopics.length > 0}
							<nav class="hm-topics" aria-label="Post topics">
								<p class="hm-label">Topic index</p>
								{#each postTopics as topic (topic.href)}
									<a href={resolve(topic.href as '/blog')}>{topic.label}</a>
								{/each}
							</nav>
						{/if}

						<div class="hm-navigation">
							<PostNavigation newer={data.postNavigation.newer} older={data.postNavigation.older} />
						</div>

						{#if relatedPosts.length > 0}
							<section class="hm-related" aria-labelledby="hm-related-heading">
								<p class="hm-label">Adjacent records</p>
								<h3 id="hm-related-heading">Related reading</h3>
								<div class="hm-related-grid">
									{#each relatedPosts as post, index (post.slug)}
										<a
											href={resolve('/blog/[category]/[slug]', {
												category: post.categorySlug,
												slug: post.slug
											})}
										>
											{#if post.thumbnail}
												<img
													src={post.thumbnail}
													alt={post.thumbnailAlt?.trim() || ''}
													width="1200"
													height="630"
													loading="lazy"
													decoding="async"
												/>
											{/if}
											<span>{String(index + 1).padStart(2, '0')}</span>
											<small>{post.categoryLabel}</small>
											<strong>{post.title}</strong>
											<em>{post.sharedTags.slice(0, 3).join(' · ') || 'More from the archive'}</em>
										</a>
									{/each}
								</div>
							</section>
						{/if}
					</div>
				</div>
			</div>
		</section>
	</article>
</div>
