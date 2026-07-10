<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl, personSchema } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import { Button } from '$lib/components/ui/button';

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
</script>

<SEO {title} {description} {canonicalUrl} schema={personSchema} />

<section class="page-enter mx-auto max-w-4xl py-8 md:py-12">
	<header class="mb-10">
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

	<div class="flex flex-wrap gap-3">
		<Button href="/resume" size="lg">View Resume</Button>
		<Button href="/healthcare-it-gulf" variant="outline" size="lg"
			>Gulf / Kuwait Opportunities</Button
		>
		<Button href="/contact" variant="ghost" size="lg">Contact</Button>
	</div>
</section>
