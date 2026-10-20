<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		absoluteUrl,
		breadcrumbSchema,
		collectionPageSchema,
		personId,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import Yt from '$lib/components/blog/YouTube.svelte';

	let { data }: { data: PageData } = $props();
	let orderedProjects = $derived([
		...data.projects.filter((project) => project.status !== 'Past project'),
		...data.projects.filter((project) => project.status === 'Past project')
	]);
	let firstPastProject = $derived(
		orderedProjects.findIndex((project) => project.status === 'Past project')
	);

	const title = 'Work & Experiments | Suvro Ghosh';
	const description =
		'Independent browser experiments, creative tools, educational demonstrations and publishing work by Suvro Ghosh, followed by selected projects from his healthcare IT career.';
	const canonicalUrl = `${siteUrl}/projects`;
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	keywords={[
		'Independent work',
		'Creative experiments',
		'Living Pigment Studio',
		'Independent publishing',
		'Healthcare IT projects',
		'Clinical data systems',
		'Health information exchange',
		'Clinical trial systems',
		'Healthcare data warehouse',
		'SvelteKit',
		'Mojo notebooks',
		'Interactive visualizations',
		'D3',
		'Observable notebooks',
		'GLSL shaders'
	]}
	schema={withSiteGraph([
		collectionPageSchema({
			name: 'Work & Experiments',
			description,
			url: canonicalUrl,
			about:
				'Independent experiments, creative tools, publishing and past systems work by Suvro Ghosh'
		}),
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Work', url: canonicalUrl }
		]),
		{
			'@context': 'https://schema.org',
			'@type': 'ItemList',
			name: 'Independent experiments and past systems work',
			itemListElement: orderedProjects.map((project, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				item: {
					'@type': 'CreativeWork',
					name: project.name,
					description: project.detail,
					url:
						project.link?.kind === 'external' ? project.link.href : `${canonicalUrl}#${project.id}`,
					...(project.image ? { image: absoluteUrl(project.image.src) } : {}),
					...(project.guide
						? {
								hasPart: {
									'@type': 'WebPage',
									name: `${project.name} guided tour`,
									url: project.guide.href
								}
							}
						: {}),
					creator: { '@id': personId }
				}
			}))
		}
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
			<li aria-current="page" class="font-medium text-neutral-800 dark:text-neutral-200">Work</li>
		</ol>
	</nav>

	<header class="border-b border-neutral-300 pb-9 dark:border-neutral-700">
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Made and explored
		</p>
		<h1 class="mb-4 text-4xl font-bold text-neutral-950 md:text-6xl dark:text-neutral-50">
			Work &amp; experiments
		</h1>
		<p
			class="mb-0 max-w-3xl text-left text-lg leading-relaxed text-neutral-700 dark:text-neutral-300"
		>
			Browser experiments, creative tools, educational demonstrations, and the publishing system
			behind this site. These are things you can explore now; the later section records selected
			work from my healthcare IT career.
		</p>
	</header>

	<aside
		class="my-7 border-l-2 border-neutral-500 py-1 pl-5 text-sm leading-relaxed text-neutral-600 dark:border-neutral-500 dark:text-neutral-400"
		aria-label="Experiment limitations"
	>
		The creative and educational experiments use simplified models with limits explained on each
		page. They are demonstrations for learning and exploration, not validated scientific or medical
		instruments or production services.
	</aside>

	<nav aria-label="Project index" class="border-y border-neutral-300 py-6 dark:border-neutral-700">
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Project index
		</p>
		<ol class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
			{#each orderedProjects as project, index (project.id)}
				<li>
					<a
						href={`#${project.id}`}
						class="group flex min-h-11 items-center gap-3 rounded-sm py-2 text-sm font-semibold text-neutral-700 no-underline transition-colors hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:text-neutral-300 dark:hover:text-white dark:focus-visible:outline-neutral-300"
					>
						<span class="w-6 text-xs text-neutral-400 dark:text-neutral-500">
							{String(index + 1).padStart(2, '0')}
						</span>
						<span class="transition-transform group-hover:translate-x-1">{project.name}</span>
					</a>
				</li>
			{/each}
		</ol>
	</nav>

	<div class="divide-y divide-neutral-300 dark:divide-neutral-700">
		{#each orderedProjects as project, index (project.id)}
			{#if index === 0 || index === firstPastProject}
				<header class="pt-10 pb-4">
					<h2 class="mb-3 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
						{index === firstPastProject
							? 'Selected career history'
							: 'Independent work and experiments'}
					</h2>
					{#if index === firstPastProject}
						<p
							class="mb-0 max-w-3xl text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
						>
							Past work included protected health information, institutional research data and
							proprietary systems. These summaries describe responsibilities without exposing
							confidential data or client artefacts. Linked essays are public analysis, not client
							case studies. ClinZen closed in 2016.
						</p>
					{/if}
				</header>
			{/if}
			<section
				id={project.id}
				class="scroll-mt-28 py-10 md:py-14 {project.featured
					? 'my-6 rounded-2xl border-2 border-rule bg-paper-raised px-5 text-ink shadow-none sm:px-7'
					: ''}"
				aria-labelledby={`${project.id}-heading`}
			>
				<div class="grid gap-5 md:grid-cols-[7rem_1fr] md:gap-8">
					<p
						class="mb-0 text-sm font-bold {project.featured
							? 'text-accent'
							: 'text-neutral-400 dark:text-neutral-500'}"
					>
						{String(index + 1).padStart(2, '0')} / {String(orderedProjects.length).padStart(2, '0')}
					</p>

					<div class="min-w-0">
						{#if project.status}
							<p
								class="mb-3 inline-block rounded-full border border-neutral-400 px-3 py-1 text-xs font-semibold text-neutral-700 dark:border-neutral-600 dark:text-neutral-300"
							>
								{project.status}
							</p>
						{/if}
						{#if project.image}
							<div
								class="mb-7 overflow-hidden rounded-xl border-2 border-rule bg-paper-raised shadow-none"
							>
								<img
									src={project.image.src}
									alt={project.image.alt}
									width={project.image.width}
									height={project.image.height}
									loading="lazy"
									decoding="async"
									class="block h-auto w-full"
								/>
							</div>
						{/if}

						<p
							class="mb-2 text-xs font-bold tracking-[0.12em] uppercase {project.featured
								? 'text-accent'
								: 'text-neutral-500 dark:text-neutral-400'}"
						>
							{project.context}
						</p>
						<h3
							id={`${project.id}-heading`}
							class="mb-4 text-2xl leading-tight font-bold md:text-3xl {project.featured
								? 'text-ink'
								: 'text-neutral-950 dark:text-neutral-50'}"
						>
							{project.name}
						</h3>
						<p
							class="mb-6 max-w-3xl text-left leading-relaxed {project.featured
								? 'text-ink'
								: 'text-neutral-700 dark:text-neutral-300'}"
						>
							{project.detail}
						</p>

						<h4
							class="mb-3 text-xs font-bold tracking-[0.14em] uppercase {project.featured
								? 'text-accent'
								: 'text-neutral-500 dark:text-neutral-400'}"
						>
							Contribution
						</h4>
						<ul
							class="mb-6 space-y-3 text-sm leading-relaxed {project.featured
								? 'text-ink'
								: 'text-neutral-700 dark:text-neutral-300'}"
						>
							{#each project.contributions as contribution (contribution)}
								<li class="grid grid-cols-[1rem_1fr] gap-2">
									<span class="text-neutral-400" aria-hidden="true">—</span>
									<span>{contribution}</span>
								</li>
							{/each}
						</ul>

						<ul class="mb-0 flex flex-wrap gap-2" aria-label="Relevant disciplines">
							{#each project.disciplines as discipline (discipline)}
								<li
									class="rounded-full border px-3 py-1 text-xs font-semibold {project.featured
										? 'border-accent text-accent'
										: 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'}"
								>
									{discipline}
								</li>
							{/each}
						</ul>

						{#if project.link || project.guide}
							<div
								class="mt-6 flex flex-wrap gap-3"
								role="group"
								aria-label={`${project.name} project links`}
							>
								{#if project.link?.kind === 'external'}
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										href={project.link.href}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-2 text-sm font-bold text-accent-foreground no-underline transition-colors hover:bg-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
									>
										{project.link.label} <span class="ml-1" aria-hidden="true">↗</span>
										<span class="sr-only">, opens in a new tab</span>
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{:else if project.link?.kind === 'internal'}
									<a
										href={resolve(project.link.href)}
										class="inline-flex min-h-11 items-center rounded-md bg-accent px-4 py-2 text-sm font-bold text-accent-foreground no-underline transition-colors hover:bg-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
									>
										{project.link.label} <span class="ml-1" aria-hidden="true">→</span>
									</a>
								{/if}

								{#if project.guide}
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										href={project.guide.href}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex min-h-11 items-center rounded-md border-2 border-accent bg-paper-raised px-4 py-2 text-sm font-bold text-accent no-underline transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
									>
										{project.guide.label} <span class="ml-1" aria-hidden="true">↗</span>
										<span class="sr-only">, opens in a new tab</span>
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{/if}
							</div>
						{/if}

						{#if project.relatedPosts.length > 0}
							<div class="mt-7">
								<h4
									class="mb-3 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
								>
									Related public analysis
								</h4>
								<ul class="grid border-y border-neutral-300 sm:grid-cols-2 dark:border-neutral-700">
									{#each project.relatedPosts as post (post.slug)}
										<li
											class="border-b border-neutral-300 last:border-b-0 sm:border-b-0 sm:odd:border-r dark:border-neutral-700"
										>
											<a
												href={resolve('/blog/[category]/[slug]', {
													category: post.categorySlug,
													slug: post.slug
												})}
												class="group block h-full p-4 no-underline transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:hover:bg-neutral-900 dark:focus-visible:outline-neutral-300"
											>
												<span
													class="mb-2 block text-xs font-bold tracking-wide text-neutral-500 uppercase dark:text-neutral-400"
													>{post.categoryLabel}</span
												>
												<span
													class="block leading-snug font-bold text-neutral-950 group-hover:text-neutral-600 dark:text-neutral-50 dark:group-hover:text-neutral-300"
													>{post.title}</span
												>
												<span
													class="mt-2 block text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
												>
													{post.description}
												</span>
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if project.demo}
							<div class="mt-7 max-w-3xl">
								<Yt
									src={project.demo.url}
									title={project.demo.title}
									caption="Historical platform overview · ClinZen closed in 2016"
								/>
							</div>
						{/if}
					</div>
				</div>
			</section>
		{/each}
	</div>

	<aside
		class="flex flex-col gap-5 border-t border-neutral-300 pt-8 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-700"
		aria-labelledby="project-background-heading"
	>
		<div>
			<p
				class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Background and writing
			</p>
			<h2
				id="project-background-heading"
				class="mb-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50"
			>
				Follow the ideas, or explore the history
			</h2>
			<p class="mb-0 max-w-xl text-left text-sm text-neutral-600 dark:text-neutral-400">
				The writing ranges more widely than the work shown here. My résumé keeps the details of past
				roles and experience in one place.
			</p>
		</div>
		<div class="flex shrink-0 flex-wrap gap-3">
			<a
				href={resolve('/writing')}
				class="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white no-underline transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white dark:focus-visible:outline-neutral-300"
				>Read the writing</a
			>
			<a
				href={resolve('/resume')}
				class="inline-flex min-h-11 items-center rounded-md border border-neutral-400 px-4 py-2 text-sm font-semibold text-neutral-800 no-underline transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-300"
				>View resume</a
			>
		</div>
	</aside>
</article>
