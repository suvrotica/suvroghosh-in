<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteSEO, withSiteGraph } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { substackLinks } from '$lib/config/links';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(value));
	}
</script>

<SEO {...siteSEO} schema={withSiteGraph()} />

<section class="page-enter mb-12">
	<div class="border-y border-rule py-10 md:py-14">
		<div>
			<p class="mb-3 text-sm font-semibold tracking-widest text-neutral-400 uppercase">
				Healthcare IT &middot; Interoperability &middot; Applied AI &middot; Calcutta
			</p>
			<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-6xl dark:text-neutral-100">
				Suvro Ghosh
			</h1>
			<p class="mb-4 text-xl font-semibold text-neutral-700 md:text-2xl dark:text-neutral-300">
				Healthcare IT Architect &amp; Clinical Data Systems Consultant
			</p>
			<p
				class="max-w-2xl text-base leading-relaxed text-neutral-700 md:text-lg dark:text-neutral-300"
			>
				I work on healthcare data systems, interoperability, clinical data architecture, and
				AI-ready health information infrastructure. I also write essays and satire on technology,
				illness, corruption, society, and ordinary life in Calcutta.
			</p>

			<div class="mt-8 flex flex-wrap gap-x-2 gap-y-3">
				<Button href="/resume" size="lg" class="px-6">View Resume</Button>
				<Button href="/projects" variant="outline" size="lg" class="px-6">Projects</Button>
				<Button href="/consulting" variant="outline" size="lg" class="px-6"
					>Healthcare IT Consulting</Button
				>
				<Button href="/writing" variant="outline" size="lg" class="px-6">Writings</Button>
				<Button href="/contact" variant="ghost" size="lg" class="px-6">Contact</Button>
			</div>
		</div>
	</div>
</section>

<section
	class="mb-10 flex flex-col gap-5 border-y border-neutral-300 py-6 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-700"
	aria-labelledby="start-here-heading"
>
	<div>
		<p
			class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			New to the site?
		</p>
		<h2
			id="start-here-heading"
			class="mb-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50"
		>
			Not sure where to begin?
		</h2>
		<p class="mb-0 max-w-2xl text-left text-sm text-neutral-600 dark:text-neutral-400">
			Follow five short reading paths through the essays, healthcare systems work, science,
			Calcutta, and fiction.
		</p>
	</div>
	<a
		href={resolve('/start-here')}
		class="inline-flex min-h-11 shrink-0 items-center rounded-md border border-neutral-400 px-4 py-2 text-sm font-semibold text-neutral-800 no-underline transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-300"
	>
		Explore the reading paths <span class="ml-2" aria-hidden="true">→</span>
	</a>
</section>

<ScrollReveal>
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div class="card">
			<h2 class="mb-2 text-xl font-bold text-neutral-900 dark:text-neutral-100">Professional</h2>
			<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				Healthcare IT, HL7/FHIR, HIE, clinical data systems, SQL/ETL, health informatics, and
				AI-ready healthcare data architecture. Open to Gulf, remote, hybrid, consulting, and
				advisory opportunities.
			</p>
			<div class="mt-4 flex flex-wrap gap-2">
				<a
					href={resolve('/projects')}
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>Projects</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href={resolve('/resume')}
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>Resume</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href={resolve('/consulting')}
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>Consulting</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href={resolve('/healthcare-it-gulf')}
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>Gulf / Kuwait</a
				>
			</div>
		</div>

		<div class="card">
			<h2 class="mb-2 text-xl font-bold text-neutral-900 dark:text-neutral-100">Writing</h2>
			<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				Essays, satire, fiction, sketches, and reflections on technology, illness, corruption,
				social decay, and Calcutta life. Personal, analytical, sometimes comic, sometimes dark, and
				intentionally human.
			</p>
			<div class="mt-4 flex flex-wrap gap-2">
				<a
					href={resolve('/writing')}
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>Writings</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href={resolve('/blog')}
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>All Posts</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href={resolve('/images')}
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>Images</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href={resolve('/blog/topics/[topic]', { topic: 'music' })}
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>Music</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href={substackLinks.subscribe}
					target="_blank"
					rel="noopener noreferrer"
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
					>Newsletter<span class="sr-only">, opens in a new tab</span></a
				>
			</div>
		</div>
	</div>
</ScrollReveal>

<section
	class="mt-14 border-t border-neutral-300 pt-8 dark:border-neutral-700"
	aria-labelledby="recent-writing-heading"
>
	<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p
				class="mb-2 text-xs font-bold tracking-widest text-neutral-500 uppercase dark:text-neutral-400"
			>
				Recently published
			</p>
			<h2
				id="recent-writing-heading"
				class="m-0 text-2xl text-neutral-900 md:text-3xl dark:text-neutral-100"
			>
				Latest from the library
			</h2>
		</div>
		<a
			href={resolve('/blog')}
			class="w-fit text-sm font-semibold text-neutral-700 underline decoration-neutral-400 underline-offset-4 hover:text-neutral-500 dark:text-neutral-300 dark:hover:text-neutral-100"
		>
			Browse all writing <span aria-hidden="true">→</span>
		</a>
	</div>

	<ol
		class="grid list-none grid-cols-1 border-t border-neutral-300 p-0 sm:grid-cols-2 dark:border-neutral-700"
	>
		{#each data.recentPosts as post (post.slug)}
			<li
				class="border-b border-neutral-300 sm:odd:pr-6 sm:even:border-l sm:even:pl-6 dark:border-neutral-700"
			>
				<a
					href={resolve('/blog/[category]/[slug]', {
						category: post.categorySlug,
						slug: post.slug
					})}
					class="group block py-6 no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-600 dark:focus-visible:outline-neutral-300"
				>
					<div
						class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-wide text-neutral-500 dark:text-neutral-400"
					>
						<span class="font-semibold uppercase">{post.sectionLabel}</span>
						<span aria-hidden="true">·</span>
						<time datetime={post.date}>{formatDate(post.date)}</time>
					</div>
					<h3
						class="m-0 text-xl leading-snug text-neutral-900 transition-colors group-hover:text-neutral-500 dark:text-neutral-100 dark:group-hover:text-neutral-300"
					>
						{post.title}
					</h3>
					{#if post.description}
						<p
							class="mt-2 mb-0 line-clamp-2 text-left text-sm text-neutral-600 dark:text-neutral-400"
						>
							{post.description}
						</p>
					{/if}
				</a>
			</li>
		{/each}
	</ol>
</section>
