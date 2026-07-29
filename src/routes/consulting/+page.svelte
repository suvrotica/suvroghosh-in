<script lang="ts">
	import { resolve } from '$app/paths';
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl, withSiteGraph } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const title = 'Healthcare IT Consulting | Suvro Ghosh';
	const description =
		'Clinical data systems, interoperability, HIE, EHR data, HL7/FHIR, SQL/ETL, and AI-ready healthcare architecture consulting by Suvro Ghosh.';
	const canonicalUrl = siteUrl + '/consulting';

	const services = [
		{
			title: 'Healthcare Data Architecture',
			desc: 'Data modeling, relational and dimensional design, data dictionaries, quality frameworks, and semantic mapping for clinical and operational datasets.'
		},
		{
			title: 'HL7/FHIR and Interoperability',
			desc: 'HL7 v2, FHIR R4/R5, integration architecture, clinical data exchange, identity, consent, provenance, and terminology mapping across systems.'
		},
		{
			title: 'HIE / EHR / EMR Implementation Support',
			desc: 'Health information exchange design, EHR/EMR data integration, migration planning, and workflow-aligned implementation guidance.'
		},
		{
			title: 'Clinical Data Migration and Normalization',
			desc: 'Legacy data migration, cross-system reconciliation, cleaning, validation, and normalization of inconsistent real-world clinical data.'
		},
		{
			title: 'SQL Server / ETL / Reporting',
			desc: 'SQL Server data warehousing, SSIS ETL pipelines, reporting databases, and multi-source data integration for healthcare analytics.'
		},
		{
			title: 'Terminology Mapping',
			desc: 'ICD-9/10/11, CPT, LOINC, SNOMED CT, RxNorm, ATC, and CDISC mapping across clinical, research, and operational contexts.'
		},
		{
			title: 'Healthcare AI Data-Readiness',
			desc: 'Data substrate evaluation, workflow mapping, structured knowledge representation, and risk-aware implementation planning before AI deployment.'
		},
		{
			title: 'Vendor Oversight and Project Rescue',
			desc: 'Reviewing vendor claims, examining implementation reality, identifying what is broken, and helping teams course-correct on stalled healthcare IT projects.'
		}
	];

	const bestFit = [
		'Healthcare interoperability and HL7/FHIR architecture',
		'HIE implementation and EHR/EMR data integration',
		'Clinical data engineering and migration',
		'Healthcare data warehouse and reporting design',
		'Clinical trial data systems and validation logic',
		'Healthcare AI data-readiness assessment',
		'ABDM and FHIR readiness for Indian healthtech',
		'Vendor oversight and project rescue'
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
			Healthcare IT Consulting
		</h1>
		<p class="text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
			Clinical data systems, interoperability, HIE, EHR data, HL7/FHIR, SQL/ETL, and AI-ready
			healthcare architecture.
		</p>
		<p class="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
			I am useful where healthcare software claims, clinical workflows, messy data, vendors, and
			implementation reality need to be examined carefully. I help turn healthcare IT plans into
			inspectable systems: data models, interfaces, workflows, reports, governance, and
			implementation reality.
		</p>
	</header>

	<ScrollReveal>
		<div class="card mb-8">
			<h2 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				What I Help With
			</h2>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				{#each services as service (service.title)}
					<div>
						<h3 class="mb-1 text-lg font-bold text-neutral-900 dark:text-neutral-100">
							{service.title}
						</h3>
						<p class="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
							{service.desc}
						</p>
					</div>
				{/each}
			</div>
		</div>
	</ScrollReveal>

	<ScrollReveal>
		<div class="card mb-8">
			<h2 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				Best-Fit Projects
			</h2>
			<ul class="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
				{#each bestFit as item (item)}
					<li class="leading-relaxed">&bull; {item}</li>
				{/each}
			</ul>
		</div>
	</ScrollReveal>

	<ScrollReveal>
		<div class="card mb-8 border-l-4 border-l-neutral-800 dark:border-l-neutral-200">
			<h2 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				Why My Background Fits Messy Healthcare Data Projects
			</h2>
			<p class="mb-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				Healthcare AI, analytics, and digital health projects usually fail before the model,
				dashboard, or application begins. They fail in the data substrate: identity, terminology,
				workflows, missing context, legacy systems, broken mappings, inconsistent definitions, and
				silent semantic loss.
			</p>
			<p class="mb-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				My work sits at that layer. I help healthcare teams understand what their data actually
				represents, how it moves across systems, what breaks during transformation, and what must be
				fixed before analytics or AI can be trusted.
			</p>
			<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				I bring a rare combination of computer science, U.S. healthcare data experience, clinical
				research systems, database architecture, ETL, interoperability thinking, and the practical
				patience required to work with real healthcare systems rather than imaginary clean-room
				diagrams.
			</p>
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
		<Button href="/resume" size="lg">View Resume</Button>
		<Button href="/projects" variant="outline" size="lg">Selected Projects</Button>
		<Button href="/healthcare-it-gulf" variant="outline" size="lg"
			>Gulf / Kuwait Opportunities</Button
		>
		<Button href="/contact" variant="ghost" size="lg">Contact</Button>
	</div>
</section>
