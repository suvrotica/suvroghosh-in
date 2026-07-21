<script lang="ts">
	import { resolve } from '$app/paths';
	import ArtificialLifeLab from './artificial-life/ArtificialLifeLab.svelte';
	import type { BlogPostSummary } from '$lib/content/posts';
	import { visualizationSummaries } from '$lib/visualizations/registry';

	type Props = {
		posts: BlogPostSummary[];
		totalResults: number;
	};

	let { posts, totalResults }: Props = $props();
	const postSubjects: Record<string, readonly string[]> = {
		'hello-fragment-your-first-shader-from-scratch':
			visualizationSummaries['hello-fragment'].subjects,
		'hello-observable-your-first-living-d3-visualization': ['Mathematics'],
		'artificial-life-lab-evolve-a-digital-ecosystem-in-your-browser': [
			'Biology',
			'Computer Science'
		],
		'monte-carlo-laboratory': ['Mathematics', 'Statistics', 'Scientific Computing']
	};
	const subjects = [
		'All',
		'Physics',
		'Chemistry',
		'Biology',
		'Mathematics',
		'Statistics',
		'Algorithms',
		'Computer Science',
		'Machine Learning',
		'Scientific Computing'
	] as const;
	const upcoming = [
		{
			title: 'Double-pendulum chaos',
			subject: 'Physics',
			detail: 'Release two almost-identical pendulums and watch predictability split apart.'
		},
		{
			title: 'Gradient descent landscapes',
			subject: 'Machine Learning',
			detail: 'Move a starting point and follow an optimiser down a changing loss surface.'
		},
		{
			title: 'Reaction–diffusion patterns',
			subject: 'Chemistry',
			detail: 'Seed two virtual chemicals and grow spots, stripes, and travelling fronts.'
		}
	] as const;

	let selectedSubject = $state<(typeof subjects)[number]>('All');
	let visiblePosts = $derived(
		selectedSubject === 'All'
			? posts
			: posts.filter((post) =>
					[...(post.tags ?? []), ...(postSubjects[post.slug] ?? [])].some(
						(tag) => tag.toLocaleLowerCase('en') === selectedSubject.toLocaleLowerCase('en')
					)
				)
	);
</script>

<div class="visualizations-landing page-enter mx-auto max-w-6xl pb-8">
	<section
		class="relative overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-10 text-white shadow-2xl shadow-neutral-950/20 sm:px-8 sm:py-14 md:px-12"
	>
		<div class="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true">
			<div class="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl"></div>
			<div
				class="absolute -right-16 -bottom-28 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl"
			></div>
			<div class="visualization-grid absolute inset-0 opacity-20"></div>
		</div>
		<div class="relative max-w-4xl">
			<a
				href={resolve('/blog')}
				class="mb-7 inline-flex min-h-11 items-center text-sm font-bold text-neutral-300 underline decoration-neutral-500 underline-offset-4 hover:text-white"
			>
				<span aria-hidden="true">←</span>&nbsp;All writing
			</a>
			<p class="mb-3 text-xs font-bold tracking-[0.2em] !text-cyan-300 uppercase">
				Interactive science gallery
			</p>
			<h1
				class="mb-5 text-4xl leading-none font-black tracking-tight !text-white sm:text-6xl md:text-7xl"
			>
				Visualizations
			</h1>
			<p class="mb-0 max-w-3xl text-left text-lg leading-relaxed !text-neutral-200 sm:text-xl">
				An interactive laboratory for exploring science, mathematics, statistics, algorithms,
				computer science, and machine learning with D3, Observable notebooks, p5.js, Canvas, SVG,
				GLSL, and WebGL.
			</p>
		</div>
	</section>

	<section class="mt-10" aria-labelledby="featured-experiment-heading">
		<div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p
					class="mb-1 text-xs font-bold tracking-[0.15em] text-neutral-500 uppercase dark:text-neutral-400"
				>
					Now exhibiting
				</p>
				<h2
					id="featured-experiment-heading"
					class="m-0 text-2xl text-neutral-950 sm:text-3xl dark:text-white"
				>
					An ecosystem that writes its own history
				</h2>
			</div>
			<p class="m-0 text-left text-sm text-neutral-600 dark:text-neutral-400">
				Change resources and inheritance; watch selection emerge.
			</p>
		</div>

		<ArtificialLifeLab
			title="Evolving Microbe Garden — gallery preview"
			compact={true}
			controls={false}
			caption="The complete exhibit adds scientific presets, 13 numeric controls, trait distributions, and an annotated source walkthrough."
		/>
	</section>

	<section class="mt-14" aria-labelledby="published-experiments-heading">
		<div class="mb-5 border-b border-neutral-300 pb-5 dark:border-neutral-700">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p
						class="mb-1 text-xs font-bold tracking-[0.15em] text-neutral-500 uppercase dark:text-neutral-400"
					>
						The collection
					</p>
					<h2
						id="published-experiments-heading"
						class="m-0 text-2xl text-neutral-950 sm:text-3xl dark:text-white"
					>
						Published experiments
					</h2>
				</div>
				<p class="m-0 text-left text-sm text-neutral-600 dark:text-neutral-400">
					{totalResults}
					{totalResults === 1 ? 'exhibit' : 'exhibits'} and growing
				</p>
			</div>
		</div>

		<div class="mb-7 flex flex-wrap gap-2" aria-label="Filter experiments by subject">
			{#each subjects as subject (subject)}
				<button
					type="button"
					onclick={() => (selectedSubject = subject)}
					aria-pressed={selectedSubject === subject}
					class="min-h-11 rounded-full border px-4 py-2 text-sm font-bold {selectedSubject ===
					subject
						? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950'
						: 'border-neutral-300 bg-neutral-100 text-neutral-700 hover:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'}"
				>
					{subject}
				</button>
			{/each}
		</div>

		{#if visiblePosts.length > 0}
			<div class="grid gap-5 sm:grid-cols-2">
				{#each visiblePosts as post (post.slug)}
					<a
						href={resolve('/blog/[category]/[slug]', {
							category: post.categorySlug ?? 'visualizations',
							slug: post.slug
						})}
						class="group overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100 no-underline shadow-sm transition-transform hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-visible:outline-neutral-300"
					>
						<div class="aspect-video overflow-hidden bg-neutral-950">
							{#if post.thumbnail}
								<img
									src={post.thumbnail}
									alt={post.thumbnailAlt ?? ''}
									class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none"
									loading="lazy"
								/>
							{:else}
								<div
									class="visualization-card-placeholder grid h-full place-items-center p-6 text-center"
									role="img"
									aria-label={`Interactive preview placeholder for ${post.title}`}
								>
									<div>
										<span
											class="mb-2 block font-mono text-xs tracking-[0.2em] text-cyan-300 uppercase"
											>Live notebook</span
										>
										<strong class="block text-xl text-white">Observable × D3</strong>
									</div>
								</div>
							{/if}
						</div>
						<div class="p-5">
							{#if post.series?.length}
								<p
									class="mb-2 text-xs font-bold tracking-[0.12em] text-cyan-700 uppercase dark:text-cyan-300"
								>
									{post.series.join(' · ')}
								</p>
							{/if}
							<div class="mb-3 flex flex-wrap gap-2">
								{#each [...(postSubjects[post.slug] ?? []), ...(post.tags ?? [])]
									.filter((tag, index, values) => subjects.includes(tag as (typeof subjects)[number]) && values.indexOf(tag) === index)
									.slice(0, 2) as tag (tag)}
									<span
										class="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-bold text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
										>{tag}</span
									>
								{/each}
							</div>
							<h3
								class="m-0 text-xl leading-snug text-neutral-950 group-hover:text-neutral-600 dark:text-white dark:group-hover:text-neutral-300"
							>
								{post.title}
							</h3>
							<p
								class="mt-3 mb-0 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
							>
								{post.description}
							</p>
							<span
								class="mt-5 inline-flex text-sm font-bold text-neutral-800 dark:text-neutral-200"
								>Enter exhibit <span
									class="ml-1 transition-transform group-hover:translate-x-1"
									aria-hidden="true">→</span
								></span
							>
						</div>
					</a>
				{/each}
			</div>
		{:else}
			<p
				class="rounded-xl border border-dashed border-neutral-400 p-7 text-center text-neutral-600 dark:border-neutral-600 dark:text-neutral-400"
			>
				No {selectedSubject} exhibit has opened yet. The backlog is ready; the gallery is growing one
				careful experiment at a time.
			</p>
		{/if}
	</section>

	<section
		class="mt-16 border-t border-neutral-300 pt-10 dark:border-neutral-700"
		aria-labelledby="coming-soon-heading"
	>
		<p
			class="mb-1 text-xs font-bold tracking-[0.15em] text-neutral-500 uppercase dark:text-neutral-400"
		>
			Behind the next doors
		</p>
		<h2
			id="coming-soon-heading"
			class="mt-0 mb-6 text-2xl text-neutral-950 sm:text-3xl dark:text-white"
		>
			Experiments in preparation
		</h2>
		<div class="grid gap-4 md:grid-cols-3">
			{#each upcoming as exhibit, index (exhibit.title)}
				<article
					class="relative overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100 p-5 dark:border-neutral-700 dark:bg-neutral-900"
				>
					<span class="absolute top-4 right-4 font-mono text-xs text-neutral-400">0{index + 2}</span
					>
					<p
						class="mb-3 text-xs font-bold tracking-wide text-neutral-500 uppercase dark:text-neutral-400"
					>
						{exhibit.subject}
					</p>
					<h3 class="mt-0 mb-3 pr-8 text-lg text-neutral-950 dark:text-white">{exhibit.title}</h3>
					<p class="m-0 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
						{exhibit.detail}
					</p>
				</article>
			{/each}
		</div>
	</section>
</div>

<style>
	.visualization-grid {
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.18) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.18) 1px, transparent 1px);
		background-size: 3rem 3rem;
		mask-image: radial-gradient(circle at 35% 45%, black, transparent 78%);
	}

	.visualization-card-placeholder {
		background-image:
			linear-gradient(rgba(34, 211, 238, 0.12) 1px, transparent 1px),
			linear-gradient(90deg, rgba(34, 211, 238, 0.12) 1px, transparent 1px),
			radial-gradient(circle at 50% 55%, rgba(217, 70, 239, 0.28), transparent 48%);
		background-size:
			2rem 2rem,
			2rem 2rem,
			auto;
	}
</style>
