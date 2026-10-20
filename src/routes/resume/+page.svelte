<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import {
		defaultOgImage,
		personId,
		profilePageSchema,
		siteUrl,
		withSiteGraph
	} from '$lib/components/seo/SEO';
	import Yt from '$lib/components/blog/YouTube.svelte';
	import { Button } from '$lib/components/ui/button';
	import { xProfile } from '$lib/config/links';
	import { professionalProjects as projects } from '$lib/content/professional-projects';
	import { resolve } from '$app/paths';

	const resumeProjects = projects.filter((project) => project.showOnResume !== false);

	type SkillGroup = {
		category: string;
		items: string;
	};

	type Experience = {
		title: string;
		company: string;
		period: string;
		details: string[];
		videos?: string[];
	};

	const title = 'Resume & Career History | Suvro Ghosh';
	const canonicalUrl = `${siteUrl}/resume`;
	const keywords = [
		'Healthcare IT Architect',
		'HL7',
		'FHIR',
		'HIE',
		'Clinical Data Systems',
		'SQL',
		'ETL',
		'Healthcare Interoperability',
		'EHR',
		'CDISC',
		'Data Warehousing',
		'Suvro Ghosh',
		'Resume',
		'Healthcare Data Architecture',
		'Digital Health',
		'Health Informatics'
	];
	const description =
		'Suvro Ghosh’s career history in software, healthcare IT, clinical research systems, data warehousing and teaching, with experience, skills, education and publications.';

	const headline = 'Career history in software, research and healthcare IT';

	const locationLine = 'Calcutta, India';

	const executiveSummary = [
		'My earlier work spans systems software, healthcare research, database architecture, clinical trial systems and teaching. It includes U.S. healthcare research environments, VA hospital data, SQL Server data warehouses, ETL pipelines and healthcare analytics.',
		'Much of that work involved turning messy clinical, operational, research and legacy data into structured, auditable systems. This background informs how I build and explain things today.'
	];

	const coreSkills: SkillGroup[] = [
		{
			category: 'Healthcare Interoperability',
			items:
				'HL7, FHIR R4/R5, HIE architecture, EHR/EMR integration, clinical data exchange, identity, consent, provenance, audit, terminology mapping'
		},
		{
			category: 'Healthcare Data Standards',
			items:
				'ICD-9/10/11, CPT, CDISC, SDTM, clinical research data structures, registry data, laboratory, pharmacy, inpatient and outpatient datasets'
		},
		{
			category: 'Clinical Data Architecture',
			items:
				'Healthcare data modeling, relational and dimensional modeling, data dictionaries, data quality, normalization, denormalization, semantic mapping'
		},
		{
			category: 'Data Engineering',
			items:
				'SQL Server, SSIS, ETL pipelines, data warehousing, reporting databases, multi-source reconciliation, legacy data migration'
		},
		{
			category: 'Analytics & Research',
			items:
				'SAS, SPSS, SQL analytics, clinical research datasets, chronic disease studies, nephrology, diabetes, ESRD, outcomes research'
		},
		{
			category: 'Clinical Trials Technology',
			items:
				'CTMS, CDMS, EDC, eCRF design, edit checks, validation logic, database lock, protocol-driven data collection'
		},
		{
			category: 'Applied AI Data Readiness',
			items:
				'Healthcare AI workflow analysis, RAG concepts, vector databases, data substrate evaluation, structured knowledge representation, tool-calling concepts'
		},
		{
			category: 'Programming & Databases',
			items: 'SQL, C, C++, VBA, Perl, MS Access, MySQL, MUMPS-derived data, reporting automation'
		},
		{
			category: 'Systems & Architecture',
			items:
				'SaaS architecture, distributed systems concepts, data governance, workflow modeling, integration strategy, technical documentation'
		},
		{
			category: 'Leadership & Consulting',
			items:
				'Technical founder, stakeholder coordination, requirements analysis, implementation planning, training, client communication, architecture strategy'
		}
	];

	const experiences: Experience[] = [
		{
			title: 'Founder & Principal Healthcare IT Architect',
			company: 'ClinZen LLC / ClinZen Software Pvt Ltd',
			period: '2015 – 2016',
			videos: ['https://youtu.be/FkHa3W4pQME?si=S9mLi5y04An7A--I'],
			details: [
				'Founded and led a healthcare technology venture focused on Health Information Exchange, clinical trial systems, digital workflows, and structured healthcare data platforms.',
				'Architected proprietary HIE and CTMS platforms, translating clinical workflows, patient data, trial protocols, and operational requirements into structured database and application designs.',
				'Designed mobile-enabled clinical data collection tools aligned with CDISC and clinical trial data-management practices for Phase II/III trial workflows.',
				'Led end-to-end system design across architecture, database modeling, validation logic, reporting, user workflows, and data-quality controls.',
				'Worked at the intersection of healthcare interoperability, clinical research systems, SQL databases, workflow design, and AI-ready healthcare data substrates.',
				'Advised on how healthcare data must be structured, governed, and contextualized before analytics, automation, or AI can safely operate on it.'
			]
		},
		{
			title: 'Cloud Solutions Architect',
			company: 'TenZillionClouds Pvt Ltd',
			period: '2016 and 2019',
			videos: [
				'https://youtu.be/GKeXyACNca8?si=LwsE_qHxopgsG4cD',
				'https://youtu.be/BEyub9spGqw?si=tkWpQeq83PsBPlp_'
			],
			details: [
				'Worked on cloud and SaaS architecture thinking for complex business systems where data structure, tenancy, security, and workflow separation were central design concerns.',
				'Explored how cloud-native systems should handle multi-tenant data, reporting, access boundaries, and operational scalability without losing business meaning.',
				'Applied healthcare-grade architectural discipline to broader cloud system design, especially around structured data, governance, and maintainability.'
			]
		},
		{
			title: 'Associate Statistician',
			company: 'University of Texas Health Science Center at San Antonio',
			period: '2010 – 2012',
			details: [
				'Worked on large-scale healthcare data warehouses integrating VA hospital data and national research datasets for clinical and outcomes research.',
				'Built and supported analytical datasets involving diabetes, ESRD, nephropathy, and related chronic disease research areas.',
				'Used SAS, SPSS, SQL, and statistical methods to support research teams, with strong emphasis on variable definition, cohort logic, data provenance, and data quality.',
				'Managed the practical complexity of healthcare data integration across flat files, SAS datasets, relational tables, and operational clinical sources.',
				'Supported analysis where clinical meaning, inclusion criteria, missingness, coding variation, and source-system assumptions were as important as the statistical model itself.'
			]
		},
		{
			title: 'Systems Analyst',
			company: 'UTHSCSA / VA Research Center',
			period: '2002 – 2007',
			details: [
				'Built and maintained research databases sourced from MUMPS-based VA hospital systems, flat files, relational databases, pharmacy records, laboratory data, inpatient data, and outpatient datasets.',
				'Designed ETL pipelines using SQL Server and SSIS to transform operational healthcare data into research-ready structures.',
				'Implemented data cleaning, outlier detection, validation checks, and reconciliation logic for inconsistent real-world clinical datasets.',
				'Supported NIH-funded and VA-linked research projects requiring careful mapping between operational hospital data and research questions.',
				'Worked directly with clinical researchers and operational stakeholders to convert ambiguous data needs into usable database structures and reports.'
			]
		},
		{
			title: 'Senior Database Architect',
			company: 'CF Health Solution',
			period: '2009',
			details: [
				'Migrated loosely structured and legacy data systems into SQL Server relational architectures.',
				'Redesigned schemas, indexing strategies, and ETL workflows to improve reporting, maintainability, and data usability.',
				'Translated undocumented assumptions embedded in legacy workflows into explicit database structures, business rules, and reporting logic.'
			]
		},
		{
			title: 'Business Analyst',
			company: 'Taxicharge, New Zealand',
			period: '2008',
			details: [
				'Built reporting systems from mixed physical and digital operational data sources.',
				'Designed SQL-based reporting pipelines and business-analysis outputs where the main challenge was inconsistent data capture and weak source-system semantics.',
				'Worked across business requirements, data cleanup, reporting, and operational process understanding.'
			]
		},
		{
			title: 'Lecturer',
			company: 'University of Fiji',
			period: '2007 – 2008',
			details: [
				'Taught Operating Systems, Computer Networks, and Network Security.',
				'Developed and delivered technical instruction for undergraduate computing students.',
				'Strengthened ability to explain complex technical systems clearly to mixed-ability audiences, a skill directly useful in healthcare IT training, implementation, and stakeholder communication.'
			]
		},
		{
			title: 'Member of Technical Staff',
			company: 'Surgient Networks, USA',
			period: '2000 – 2002',
			details: [
				'Implemented multi-queue caching algorithms and performance-sensitive systems software.',
				'Worked on high-performance system behavior shaped by constraints, access patterns, and resource management.',
				'Built an early foundation in systems thinking that later informed database architecture, healthcare data pipelines, and integration work.'
			]
		}
	];
</script>

<SEO
	{title}
	{description}
	{canonicalUrl}
	{keywords}
	ogImageUrl={defaultOgImage}
	ogImageAlt="Abstract illustration for Suvro Ghosh’s healthcare IT portfolio"
	schema={withSiteGraph([
		profilePageSchema({ name: title, description, url: canonicalUrl }),
		{
			'@type': 'ScholarlyArticle',
			'@id': 'https://doi.org/10.1097/00115514-200609000-00005',
			headline: 'Task Overlap Among Primary Care Team Members: An Opportunity for System Redesign?',
			url: 'https://doi.org/10.1097/00115514-200609000-00005',
			datePublished: '2006-09-01',
			author: [
				{ '@type': 'Person', name: 'Richard G. Best' },
				{ '@type': 'Person', name: 'Sylvia J. Hysong' },
				{ '@type': 'Person', name: 'Jacqueline A. Pugh' },
				{ '@id': personId },
				{ '@type': 'Person', name: 'Frank I. Moore' }
			],
			isPartOf: {
				'@type': 'Periodical',
				name: 'Journal of Healthcare Management'
			},
			pagination: '295-306'
		}
	])}
/>

<section class="page-enter mx-auto max-w-4xl py-8 md:py-12">
	<header
		class="mb-10 text-center md:text-left"
		data-route-atmosphere-region
		data-route-scene="healthcare"
	>
		<h1
			class="mb-2 text-4xl font-bold tracking-tight text-neutral-900 md:text-5xl dark:text-neutral-100"
		>
			Suvro Ghosh
		</h1>

		<h2 class="mb-4 text-xl font-semibold tracking-wide text-neutral-700 dark:text-neutral-300">
			{headline}
		</h2>

		<p class="mb-6 text-sm font-medium text-neutral-600 dark:text-neutral-400">
			{locationLine}
		</p>

		<div
			class="flex flex-wrap items-center justify-center gap-4 text-sm font-bold text-neutral-600 md:justify-start dark:text-neutral-400"
		>
			<span>Software · Research systems · Data architecture · Teaching</span>
		</div>
		<p class="mt-5 max-w-3xl text-left leading-relaxed text-neutral-700 dark:text-neutral-300">
			This résumé records my professional background. I am now exploring useful ideas as an
			independent entrepreneur, maker and writer. <a
				href={resolve('/projects')}
				class="font-semibold underline underline-offset-4">Explore the work and experiments</a
			>.
		</p>
	</header>

	<div class="card mb-8 bg-neutral-100 dark:bg-neutral-800">
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Career Summary
		</h3>

		<div class="space-y-4 text-lg leading-relaxed text-neutral-800 dark:text-neutral-200">
			{#each executiveSummary as paragraph, i (paragraph)}
				<p class={i === 0 ? 'font-bold' : ''}>{paragraph}</p>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Core Skills
		</h3>

		<div class="grid grid-cols-1 gap-x-6 gap-y-4 text-sm md:grid-cols-2">
			{#each coreSkills as skill (skill.category)}
				<div>
					<h4 class="m-0 mb-1 text-base font-bold text-neutral-900 dark:text-neutral-100">
						{skill.category}
					</h4>
					<p class="m-0 leading-relaxed text-neutral-600 dark:text-neutral-400">
						{skill.items}
					</p>
				</div>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-6 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Professional Experience
		</h3>

		<div class="space-y-10">
			{#each experiences as job (`${job.company}-${job.period}`)}
				<div class="relative border-l-2 border-neutral-300 pl-5 dark:border-neutral-700">
					<div
						class="absolute top-1.5 -left-[5px] h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100"
					></div>

					<div class="mb-3 flex flex-col md:flex-row md:items-baseline md:justify-between">
						<div>
							<h4 class="m-0 text-lg font-bold text-neutral-900 dark:text-neutral-100">
								{job.title}
							</h4>
							<span class="text-sm font-bold text-neutral-600 dark:text-neutral-400">
								{job.company}
							</span>
						</div>

						<div class="mt-1 text-xs font-bold tracking-wider text-neutral-500 uppercase md:mt-0">
							{job.period}
						</div>
					</div>

					<ul class="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
						{#each job.details as detail (detail)}
							<li class="leading-relaxed">• {detail}</li>
						{/each}
					</ul>

					{#if job.videos && job.videos.length > 0}
						<div class="mt-5 flex flex-col gap-6 pb-2">
							{#each job.videos as videoUrl, vIndex (videoUrl)}
								<Yt
									src={videoUrl}
									title={`Overview of ${job.company} - Part ${vIndex + 1}`}
									caption={`Demo / Presentation: ${job.company}`}
								/>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
			<h3 class="m-0 text-2xl font-bold">Key Projects &amp; Research Systems</h3>
			<a
				href={resolve('/projects')}
				class="inline-flex min-h-11 items-center text-sm font-semibold text-neutral-600 underline decoration-neutral-400 underline-offset-4 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white"
			>
				View expanded project notes <span class="ml-1" aria-hidden="true">→</span>
			</a>
		</div>

		<div class="space-y-4 text-sm text-neutral-700 dark:text-neutral-300">
			{#each resumeProjects as project (project.id)}
				<div>
					<h4 class="m-0 mb-1 text-base font-bold text-neutral-900 dark:text-neutral-100">
						{project.name}
					</h4>
					<p class="m-0 leading-relaxed">{project.detail}</p>
				</div>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div class="card">
			<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				Education
			</h3>

			<div class="space-y-5">
				<div>
					<h4 class="m-0 text-base font-bold text-neutral-900 dark:text-neutral-100">
						M.S. Computer Science
					</h4>
					<p class="text-sm text-neutral-600 dark:text-neutral-400">University of Texas, USA</p>
				</div>

				<div>
					<h4 class="m-0 text-base font-bold text-neutral-900 dark:text-neutral-100">
						B.E. Computer Science & Engineering
					</h4>
					<p class="text-sm text-neutral-600 dark:text-neutral-400">Jadavpur University, Kolkata</p>
				</div>
			</div>
		</div>

		<div class="card">
			<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				Publications & Academic Highlights
			</h3>

			<ul class="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
				<li>
					Co-author:
					<a
						href="https://doi.org/10.1097/00115514-200609000-00005"
						target="_blank"
						rel="noopener noreferrer"
						class="font-medium text-neutral-900 underline decoration-neutral-400 underline-offset-4 hover:text-neutral-600 dark:text-neutral-100 dark:hover:text-neutral-300"
					>
						<em
							>Task Overlap Among Primary Care Team Members: An Opportunity for System Redesign?</em
						>
					</a>
					<br />
					<span class="text-xs text-neutral-500">
						Journal of Healthcare Management, 51(5), 295–306 (2006) · DOI
						10.1097/00115514-200609000-00005
					</span>
				</li>

				<li>Multiple abstracts presented at National Kidney Foundation Clinical Meetings</li>
				<li>Full scholarship for M.S. study in the United States</li>
				<li>WBJEE Rank: 87 Engineering, 55 Medical</li>
				<li>
					Experience across USA, India, New Zealand, Fiji, Nepal, UAE, and Kuwait-facing remote work
				</li>
			</ul>
		</div>
	</div>

	<div class="mt-12 flex items-center justify-center gap-4">
		<Button href="mailto:contact@suvroghosh.in" variant="outline" size="icon" aria-label="Email">
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
				/>
			</svg>
		</Button>
		<Button
			href="https://www.linkedin.com/in/suvro-ghosh-78a5aa278"
			target="_blank"
			rel="noopener noreferrer"
			variant="outline"
			size="icon"
			aria-label="LinkedIn"
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"
				/>
			</svg>
		</Button>
		<Button
			href={xProfile.url}
			target="_blank"
			rel="noopener noreferrer"
			variant="outline"
			size="icon"
			aria-label={`X (${xProfile.handle})`}
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"
				/>
			</svg>
		</Button>
	</div>
</section>
