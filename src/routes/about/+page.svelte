<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		breadcrumbSchema,
		profilePageSchema,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import { youtubeProfile } from '$lib/config/links';

	const title = 'About Suvro Ghosh | Independent Entrepreneur, Maker & Writer';
	const description =
		'Independent entrepreneur, maker and writer in Calcutta. Exploring useful ideas through software and hands-on experiments, with an interest in electronics and physical products.';
	const canonicalUrl = `${siteUrl}/about`;
	const linkClass =
		'inline-flex min-h-11 items-center rounded-sm font-semibold text-neutral-900 underline decoration-neutral-400 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 dark:text-neutral-100';
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	schema={withSiteGraph([
		profilePageSchema({ name: title, description, url: canonicalUrl }),
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'About', url: canonicalUrl }
		])
	])}
/>

<article class="page-enter mx-auto max-w-3xl py-4 md:py-8">
	<header class="border-b border-neutral-300 pb-8 dark:border-neutral-700">
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			About
		</p>
		<h1 class="mb-5 text-4xl font-bold text-neutral-950 md:text-6xl dark:text-neutral-50">
			Suvro Ghosh
		</h1>
		<p class="max-w-2xl text-left text-xl leading-relaxed text-neutral-800 dark:text-neutral-200">
			I’m an independent entrepreneur, maker and writer in Calcutta, exploring what I might build
			next.
		</p>
		<p class="mb-0 max-w-2xl text-left leading-relaxed text-neutral-700 dark:text-neutral-300">
			Software is where much of the work on this site takes shape today. My curiosity also extends
			to electronics, home-assembled devices and physical products. Those are directions to explore;
			the work collected here shows what I’ve actually made so far.
		</p>
	</header>

	<section
		class="border-b border-neutral-300 py-8 dark:border-neutral-700"
		aria-labelledby="about-making"
	>
		<h2 id="about-making" class="mb-4 text-2xl font-bold">Making ideas tangible</h2>
		<p class="text-left leading-relaxed">
			I like questions that become clearer when you can try something: change a parameter, draw a
			line, follow a record through a system, or watch a model respond. The browser experiments here
			are ways of investigating and explaining ideas. Their assumptions and limits are part of the
			work.
		</p>
		<p class="text-left leading-relaxed">
			The visualization library and Living Pigment Studio are creative and technical explorations.
			I’m still exploring where this work might lead, without a fixed industry or final product in
			mind.
		</p>
		<a href={resolve('/projects')} class={linkClass}
			>Explore the work <span class="ml-2" aria-hidden="true">→</span></a
		>
	</section>

	<section
		class="border-b border-neutral-300 py-8 dark:border-neutral-700"
		aria-labelledby="about-writing"
	>
		<h2 id="about-writing" class="mb-4 text-2xl font-bold">Writing is part of the work</h2>
		<p class="text-left leading-relaxed">
			This is also a home for essays, fiction, satire, scientific explanations, images and music.
			Technology, public systems and ordinary life in Calcutta meet here, sometimes comfortably and
			sometimes with an argument. The writing follows its own questions.
		</p>
		<nav class="flex flex-wrap gap-x-6 gap-y-1" aria-label="Writing and videos">
			<a href={resolve('/writing')} class={linkClass}>Read the writing</a>
			<a href={resolve('/start-here')} class={linkClass}>Follow a reading path</a>
			<!-- The verified channel is an external destination. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a href={youtubeProfile.url} target="_blank" rel="noopener noreferrer" class={linkClass}>
				Watch on YouTube <span class="ml-1" aria-hidden="true">↗</span><span class="sr-only"
					>, opens in a new tab</span
				>
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</nav>
	</section>

	<section class="py-8" aria-labelledby="about-background">
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Earlier experience
		</p>
		<h2 id="about-background" class="mb-4 text-2xl font-bold">Where I’m coming from</h2>
		<p class="text-left leading-relaxed">
			My earlier career involved healthcare IT, research databases, clinical data and software
			architecture. It taught me to look closely at how systems behave when real people and
			inconsistent information meet. ClinZen, the healthcare technology venture I founded, closed in
			2016.
		</p>
		<p class="text-left leading-relaxed">
			That experience informs my approach. My current interests range more widely, and this site
			leaves room for them to develop.
		</p>
		<nav class="flex flex-wrap gap-x-6 gap-y-1" aria-label="Career history and correspondence">
			<a href={resolve('/resume')} class={linkClass}>Résumé and career history</a>
			<a href={resolve('/contact')} class={linkClass}>Get in touch</a>
		</nav>
	</section>
</article>
