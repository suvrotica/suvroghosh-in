<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl, personSchema } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import { Button } from '$lib/components/ui/button';

	const title = 'Gulf & Kuwait Healthcare IT Consultant | Suvro Ghosh';
	const description =
		'Healthcare IT consulting for Kuwait and Gulf region: EMR/EHR, HL7/FHIR interoperability, ICD-10, terminology mapping, clinical data warehouses, and implementation support.';
	const canonicalUrl = siteUrl + '/healthcare-it-gulf';

	const areas = [
		{
			title: 'Ministry-Level Healthcare Systems',
			desc: 'Supporting large-scale healthcare system modernization, data architecture, interoperability planning, and governance frameworks.'
		},
		{
			title: 'Hospital Information Systems',
			desc: 'EMR/EHR implementation support, clinical workflow alignment, data migration, and system integration guidance.'
		},
		{
			title: 'Interoperability and HL7/FHIR',
			desc: 'HL7 v2, FHIR R4/R5, clinical data exchange architecture, and integration design across hospital and ministry systems.'
		},
		{
			title: 'ICD-10 and Terminology Mapping',
			desc: 'ICD-10, ICD-11, SNOMED CT, LOINC, RxNorm, ATC, and other terminology systems for clinical coding, reporting, and analytics.'
		},
		{
			title: 'Clinical Data Warehouses',
			desc: 'SQL Server data warehousing, ETL pipelines, reporting databases, and multi-source clinical data integration.'
		},
		{
			title: 'Reporting and Dashboards',
			desc: 'Healthcare analytics, operational reporting, clinical KPI dashboards, and data quality monitoring.'
		},
		{
			title: 'Governance and Auditability',
			desc: 'Data governance frameworks, provenance tracking, consent management, and audit-ready healthcare data systems.'
		},
		{
			title: 'Vendor Coordination and Implementation Rescue',
			desc: 'Vendor oversight, implementation review, identifying what is broken, and helping stalled projects course-correct.'
		}
	];
</script>

<SEO {title} {description} {canonicalUrl} schema={personSchema} />

<section class="page-enter mx-auto max-w-4xl py-8 md:py-12">
	<header class="mb-10">
		<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-5xl dark:text-neutral-100">
			Gulf &amp; Kuwait Healthcare IT
		</h1>
		<p class="text-lg leading-relaxed text-neutral-700 dark:text-neutral-300">
			Open to Kuwait, Gulf, remote, hybrid, advisory, consulting, and project-based healthcare IT
			work.
		</p>
		<p class="mt-4 text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
			I am interested in Gulf healthcare IT opportunities and can support healthcare systems,
			vendors, and implementation teams across EMR/EHR programs, interoperability, clinical data
			architecture, terminology mapping, data warehousing, reporting, and governance.
		</p>
	</header>

	<ScrollReveal>
		<div class="card mb-8">
			<h2 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				Where I Can Help
			</h2>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				{#each areas as area (area.title)}
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

	<ScrollReveal>
		<div class="card mb-8 border-l-4 border-l-neutral-800 dark:border-l-neutral-200">
			<h2 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				Relevant Background
			</h2>
			<p class="mb-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				15+ years across U.S. healthcare research environments, VA hospital data systems,
				EHR-derived datasets, HL7/FHIR-style interoperability, SQL Server data warehouses, ETL
				pipelines, clinical trial systems, and healthcare analytics. Based in Calcutta, India, with
				experience across USA, India, New Zealand, Fiji, Nepal, UAE, and Kuwait-facing remote work.
			</p>
			<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				Strong fit for UAE, Saudi Arabia, Qatar, Kuwait, and regional healthcare modernization
				programs needing senior EHR, HIE, data, interoperability, and implementation experience.
			</p>
		</div>
	</ScrollReveal>

	<div class="flex flex-wrap gap-3">
		<Button href="/resume" size="lg">View Resume</Button>
		<Button href="/consulting" variant="outline" size="lg">Healthcare IT Consulting</Button>
		<Button href="/contact" variant="ghost" size="lg">Contact</Button>
	</div>
</section>
