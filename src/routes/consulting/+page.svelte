<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl, withSiteGraph } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = 'Services & Partnerships | Suvro Ghosh';
	const description =
		'Software and data help from Calcutta for Gulf firms. Connect systems, reduce manual work and test useful AI ideas. Start with one small paid project.';
	const canonicalUrl = siteUrl + '/consulting';

	const areasOfExperience = [
		{
			title: 'Healthcare Data Architecture',
			desc: 'Data modeling, relational and dimensional design, data dictionaries, quality frameworks, and semantic mapping for clinical and operational datasets.'
		},
		{
			title: 'HL7/FHIR and Interoperability',
			desc: 'HL7 v2, FHIR R4/R5, integration architecture, clinical data exchange, identity, consent, provenance, and terminology mapping across systems.'
		},
		{
			title: 'HIE and Clinical Trial Systems',
			desc: 'Database and application design for health information exchange, protocol-driven data collection, validation and clinical research workflows.'
		},
		{
			title: 'Clinical Data Migration and Normalization',
			desc: 'Legacy data migration, cross-system reconciliation, cleaning, validation, and normalization of inconsistent real-world clinical data.'
		},
		{
			title: 'SQL Server / ETL / Reporting',
			desc: 'SQL Server data warehousing, SSIS ETL pipelines, reporting databases, and multi-source data integration for healthcare analytics.'
		}
	];

	function formatDate(value: string) {
		return new Date(value).toLocaleDateString('en-IN', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<SEO {title} {description} {canonicalUrl} schema={withSiteGraph()} />

<section class="page-enter mx-auto max-w-4xl py-8 md:py-12">
	<header class="mb-10" data-route-scene="healthcare">
		<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-5xl dark:text-neutral-100">
			Services &amp; partnerships
		</h1>
		<p class="text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
			I’m Suvro Ghosh, an independent maker based in Calcutta. I build my own projects and help
			businesses with software and data work.
		</p>
		<p class="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
			I’m looking to work with Gulf-based firms that have clients but need help with the technical
			work. You handle the client relationship. I help plan and do the work from India.
		</p>
	</header>

	<section class="card mb-8" aria-labelledby="services-heading">
		<h2 id="services-heading" class="mb-4 text-2xl font-bold">What I can help with</h2>
		<ul
			class="list-disc space-y-4 pl-5 text-base leading-relaxed text-neutral-700 dark:text-neutral-300"
		>
			<li>
				<strong>Connect software:</strong> help systems share data and check that it arrives correctly.
			</li>
			<li><strong>Organise data:</strong> clean, move and check data, and build useful reports.</li>
			<li>
				<strong>Reduce manual work:</strong> build tools for repeated tasks and make errors easier to
				spot.
			</li>
			<li>
				<strong>Use AI where it helps:</strong> start with a small test and check the results before relying
				on it.
			</li>
			<li>
				<strong>Work with healthcare data:</strong> help with older systems, research data and sharing
				information between systems.
			</li>
			<li>
				<strong>Improve basic security:</strong> review who can access what and fix agreed settings. This
				is not a security certification or a specialist security test.
			</li>
		</ul>
		<p class="mt-6 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
			I check that I can do the work before agreeing to it. If another specialist is needed, we
			agree their work and cost first.
		</p>
	</section>

	<section class="card mb-8" aria-labelledby="partnership-heading">
		<h2 id="partnership-heading" class="mb-4 text-2xl font-bold">How we start</h2>
		<div class="space-y-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
			<p>
				Start with one small paid project. Agree the work, price, dates and how we will check the
				result. Part payment upfront.
			</p>
			<p>
				You manage the client and the sale. I help plan and do the agreed technical work. You speak
				directly with me, not an account manager.
			</p>
			<p>
				We can agree a fixed fee for my work or a share of the project margin. Put the costs and
				payment dates in writing. Any later support or changes are agreed separately.
			</p>
		</div>
	</section>

	<section class="mb-10" aria-labelledby="requirement-heading">
		<h2 id="requirement-heading" class="mb-4 text-2xl font-bold">Tell me what needs doing</h2>
		<p class="mb-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
			What does your client need? What software do they use? What is not working, and when is it
			needed? A short outline is enough to start.
		</p>
		<p class="mb-6 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
			Do not send patient records, passwords or private client data through the form. We will agree
			how to handle any needed access or data later.
		</p>
		<div class="flex flex-wrap gap-3">
			<Button href="/contact" size="lg">Tell me about the work</Button>
			<Button href="/resume" variant="outline" size="lg">My background</Button>
		</div>
	</section>

	<section class="mb-8" aria-labelledby="background-heading">
		<h2 id="background-heading" class="mb-4 text-2xl font-bold">Background and writing</h2>
		<p class="mb-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
			My earlier work includes U.S. healthcare research, software and data systems. The resume
			records that history. ClinZen ended in 2016.
		</p>
		<p class="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
			The articles below explain how I think about technical problems. They are not client case
			studies. My interactive projects are labelled to show what they do and do not demonstrate.
		</p>
	</section>

	<ScrollReveal>
		<div class="card mb-8">
			<h2 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				Areas of experience
			</h2>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				{#each areasOfExperience as area (area.title)}
					<div>
						<h3 class="mb-1 text-lg font-bold text-neutral-900 dark:text-neutral-100">
							{area.title}
						</h3>
						<p class="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
							{area.desc}
						</p>
					</div>
				{/each}
			</div>
		</div>
	</ScrollReveal>

	<section
		class="mb-9 border-y border-neutral-300 py-8 dark:border-neutral-700"
		aria-labelledby="selected-analysis-heading"
	>
		<header class="mb-6 max-w-3xl">
			<p
				class="mb-2 text-xs font-bold tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400"
			>
				Public analysis
			</p>
			<h2
				id="selected-analysis-heading"
				class="mb-3 scroll-mt-24 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50"
			>
				Selected healthcare systems analysis
			</h2>
			<p class="m-0 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
				These are public technical analyses, not client case studies. They show how I reason about
				interoperability, legacy clinical systems, analytics, and AI-ready healthcare data.
			</p>
		</header>

		<ol
			class="grid gap-px overflow-hidden border border-neutral-300 bg-neutral-300 sm:grid-cols-2 dark:border-neutral-700 dark:bg-neutral-700"
		>
			{#each data.selectedAnalysis as post (post.slug)}
				<li class="min-w-0 bg-white dark:bg-neutral-900">
					<a
						href={resolve('/blog/[category]/[slug]', {
							category: post.categorySlug,
							slug: post.slug
						})}
						class="group flex h-full min-h-52 flex-col p-5 no-underline transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:outline-none focus-visible:ring-inset dark:hover:bg-neutral-800/70 dark:focus-visible:ring-neutral-300"
					>
						<div class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
							<span
								class="text-xs font-bold tracking-[0.1em] text-neutral-500 uppercase dark:text-neutral-400"
							>
								{post.focus}
							</span>
							<span class="text-neutral-400" aria-hidden="true">·</span>
							<time class="text-xs text-neutral-500 dark:text-neutral-400" datetime={post.date}
								>{formatDate(post.date)}</time
							>
						</div>
						<h3
							class="mb-2 text-lg leading-snug font-bold text-neutral-950 transition-colors group-hover:text-neutral-600 dark:text-neutral-50 dark:group-hover:text-neutral-300"
						>
							{post.title}
						</h3>
						<p class="m-0 text-left text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
							{post.description}
						</p>
						<span class="mt-auto pt-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
							Read analysis <span aria-hidden="true">→</span>
						</span>
					</a>
				</li>
			{/each}
		</ol>

		<a
			href={resolve('/blog/[category]', { category: 'healthcare-it' })}
			class="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-neutral-700 underline decoration-neutral-400 underline-offset-4 transition-colors hover:text-neutral-950 hover:decoration-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-neutral-300 dark:decoration-neutral-600 dark:hover:text-white dark:hover:decoration-neutral-300 dark:focus-visible:ring-neutral-300 dark:focus-visible:ring-offset-neutral-950"
		>
			Browse all Healthcare IT writing <span class="ml-1" aria-hidden="true">→</span>
		</a>
	</section>

	<div class="flex flex-wrap gap-3">
		<Button href="/resume" size="lg">Career history</Button>
		<Button href="/projects" variant="outline" size="lg">Work &amp; experiments</Button>
		<Button href="/writing" variant="ghost" size="lg">More writing</Button>
	</div>
</section>
