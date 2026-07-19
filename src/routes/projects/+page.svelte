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
	import Yt from '$lib/components/blog/YouTube.svelte';

	let { data }: { data: PageData } = $props();

	const title = 'Projects & Systems Work | Suvro Ghosh';
	const description =
		'Selected healthcare data, research systems, interoperability, interactive visualization, computational notebook, workflow, and independent publishing projects by Suvro Ghosh.';
	const canonicalUrl = `${siteUrl}/projects`;
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	keywords={[
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
			name: 'Projects & Systems Work',
			description,
			url: canonicalUrl,
			about: 'Healthcare, research, and publishing systems built by Suvro Ghosh'
		}),
		breadcrumbSchema([
			{ name: 'Home', url: siteUrl },
			{ name: 'Projects', url: canonicalUrl }
		]),
		{
			'@context': 'https://schema.org',
			'@type': 'ItemList',
			name: 'Selected systems work',
			itemListElement: data.projects.map((project, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				item: {
					'@type': 'CreativeWork',
					name: project.name,
					description: project.detail,
					url: `${canonicalUrl}#${project.id}`
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
			<li aria-current="page" class="font-medium text-neutral-800 dark:text-neutral-200">
				Projects
			</li>
		</ol>
	</nav>

	<header class="border-b border-neutral-300 pb-9 dark:border-neutral-700">
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Professional portfolio
		</p>
		<h1 class="mb-4 text-4xl font-bold text-neutral-950 md:text-6xl dark:text-neutral-50">
			Selected systems work
		</h1>
		<p
			class="mb-0 max-w-3xl text-left text-lg leading-relaxed text-neutral-700 dark:text-neutral-300"
		>
			Healthcare data warehouses, research registries, interoperability and clinical-trial
			platforms, interactive visualizations, computational notebooks, workflow systems, and the
			independent publishing infrastructure behind this site.
		</p>
	</header>

	<aside
		class="my-7 border-l-2 border-neutral-500 py-1 pl-5 text-sm leading-relaxed text-neutral-600 dark:border-neutral-500 dark:text-neutral-400"
		aria-label="Portfolio disclosure"
	>
		Some work involved protected health information, institutional research data, or proprietary
		systems. The summaries below therefore describe responsibilities and system concerns without
		exposing confidential data, client artefacts, or invented performance figures. Linked essays are
		public analysis, not client case studies.
	</aside>

	<nav aria-label="Project index" class="border-y border-neutral-300 py-6 dark:border-neutral-700">
		<p
			class="mb-3 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Project index
		</p>
		<ol class="grid gap-x-6 gap-y-1 sm:grid-cols-2">
			{#each data.projects as project, index (project.id)}
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
		{#each data.projects as project, index (project.id)}
			<section
				id={project.id}
				class="scroll-mt-28 py-10 md:py-14 {project.id === 'visualizations'
					? 'my-6 rounded-2xl border border-cyan-700/40 bg-gradient-to-br from-neutral-950 via-neutral-900 to-cyan-950/80 px-5 text-white shadow-2xl shadow-neutral-950/20 sm:px-7'
					: ''}"
				aria-labelledby={`${project.id}-heading`}
			>
				<div class="grid gap-5 md:grid-cols-[7rem_1fr] md:gap-8">
					<p
						class="mb-0 text-sm font-bold {project.id === 'visualizations'
							? 'text-cyan-300'
							: 'text-neutral-400 dark:text-neutral-500'}"
					>
						{String(index + 1).padStart(2, '0')} / {String(data.projects.length).padStart(2, '0')}
					</p>

					<div class="min-w-0">
						<p
							class="mb-2 text-xs font-bold tracking-[0.12em] uppercase {project.id ===
							'visualizations'
								? 'text-cyan-300'
								: 'text-neutral-500 dark:text-neutral-400'}"
						>
							{project.context}
						</p>
						<h2
							id={`${project.id}-heading`}
							class="mb-4 text-2xl leading-tight font-bold md:text-3xl {project.id ===
							'visualizations'
								? 'text-white'
								: 'text-neutral-950 dark:text-neutral-50'}"
						>
							{project.name}
						</h2>
						<p
							class="mb-6 max-w-3xl text-left leading-relaxed {project.id === 'visualizations'
								? 'text-neutral-200'
								: 'text-neutral-700 dark:text-neutral-300'}"
						>
							{project.detail}
						</p>

						<h3
							class="mb-3 text-xs font-bold tracking-[0.14em] uppercase {project.id ===
							'visualizations'
								? 'text-cyan-300'
								: 'text-neutral-500 dark:text-neutral-400'}"
						>
							Contribution
						</h3>
						<ul
							class="mb-6 space-y-3 text-sm leading-relaxed {project.id === 'visualizations'
								? 'text-neutral-200'
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
									class="rounded-full border px-3 py-1 text-xs font-semibold {project.id ===
									'visualizations'
										? 'border-cyan-800 text-cyan-100'
										: 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'}"
								>
									{discipline}
								</li>
							{/each}
						</ul>

						{#if project.href}
							<a
								href={resolve(project.href as '/blog/visualizations')}
								class="mt-6 inline-flex min-h-11 items-center rounded-md bg-cyan-300 px-4 py-2 text-sm font-bold text-neutral-950 no-underline hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
							>
								Enter the interactive laboratory <span class="ml-1" aria-hidden="true">→</span>
							</a>
						{/if}

						{#if project.relatedPosts.length > 0}
							<div class="mt-7">
								<h3
									class="mb-3 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
								>
									Related public analysis
								</h3>
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
									caption="Public platform overview"
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
		aria-labelledby="project-contact-heading"
	>
		<div>
			<p
				class="mb-2 text-xs font-bold tracking-[0.16em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Work together
			</p>
			<h2
				id="project-contact-heading"
				class="mb-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50"
			>
				Have a difficult systems problem?
			</h2>
			<p class="mb-0 max-w-xl text-left text-sm text-neutral-600 dark:text-neutral-400">
				I am open to healthcare IT architecture, interoperability, clinical-data, advisory, and
				project-based work.
			</p>
		</div>
		<div class="flex shrink-0 flex-wrap gap-3">
			<a
				href={resolve('/contact')}
				class="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white no-underline transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white dark:focus-visible:outline-neutral-300"
				>Contact</a
			>
			<a
				href={resolve('/resume')}
				class="inline-flex min-h-11 items-center rounded-md border border-neutral-400 px-4 py-2 text-sm font-semibold text-neutral-800 no-underline transition-colors hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:outline-neutral-300"
				>View resume</a
			>
		</div>
	</aside>
</article>
