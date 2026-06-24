<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteUrl } from '$lib/components/seo/SEO';
	import Yt from '$lib/components/blog/YouTube.svelte';

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

	const title = 'Suvro Ghosh | Senior Healthcare IT & Interoperability Architect';
	const canonicalUrl = `{siteUrl}/resume`;
	const keywords = [
		'Healthcare IT Architect', 'HL7', 'FHIR', 'HIE', 'Clinical Data Systems', 'SQL', 'ETL',
		'Healthcare Interoperability', 'EHR', 'CDISC', 'Data Warehousing', 'Suvro Ghosh', 'Resume',
		'Healthcare Data Architecture', 'Digital Health', 'Health Informatics'
	];
	const description =
		'Senior Healthcare IT Architect with 15+ years of U.S. healthcare data, EHR, HIE, HL7, FHIR, CDISC, SQL, ETL, clinical research, and health data architecture experience.';

	const headline =
		'Senior Healthcare IT Architect | HL7 / FHIR / HIE | Clinical Data Systems | SQL / ETL | AI-Ready Healthcare Data';

	const locationLine =
		'Kolkata, India | Open to Remote, Hybrid, Contract, Consulting, and Gulf Healthcare IT Opportunities';

	const executiveSummary = [
		'Senior Healthcare IT and clinical data systems architect with 15+ years of experience across U.S. healthcare research environments, VA hospital data, EHR-derived datasets, HL7-style integration problems, clinical trial systems, SQL Server data warehouses, ETL pipelines, and healthcare analytics.',
		'I specialize in the difficult middle layer of healthcare technology: turning messy clinical, operational, research, and legacy data into structured, interoperable, auditable, and usable systems.',
		'Best fit for senior roles in healthcare interoperability, HL7/FHIR architecture, HIE implementation, clinical data engineering, EHR/EMR data migration, health informatics, healthcare analytics, AI data-readiness, and digital health consulting.'
	];

	const positioning = [
		'Healthcare AI, analytics, and digital health projects usually fail before the model, dashboard, or application begins. They fail in the data substrate: identity, terminology, workflows, missing context, legacy systems, broken mappings, inconsistent definitions, and silent semantic loss.',
		'My work sits at that layer. I help healthcare teams understand what their data actually represents, how it moves across systems, what breaks during transformation, and what must be fixed before analytics or AI can be trusted.',
		'I bring a rare combination of computer science, U.S. healthcare data experience, clinical research systems, database architecture, ETL, interoperability thinking, and the practical patience required to work with real healthcare systems rather than imaginary clean-room diagrams.'
	];

	const targetRoles = [
		'Healthcare IT / Digital Health Consultant',
		'Interoperability / HL7 / FHIR Specialist',
		'HIE / EHR / EMR Implementation Consultant',
		'Clinical Systems Analyst',
		'Healthcare Data Architect / Analyst',
		'Health Informatics Specialist',
		'Healthcare AI Workflow & Data-Readiness Consultant',
		'Healthcare IT Project / Program Consultant',
		'Clinical Trial Data Systems Consultant',
		'Healthcare IT Trainer / Advisor'
	];

	const targetMarkets = [
		'UAE, Saudi Arabia, Qatar, Kuwait, and wider Gulf healthcare modernization programs',
		'Remote work with U.S., U.K., EU, Singapore, and India-based digital health vendors',
		'India ABDM, FHIR, HIE, hospital digitization, and healthtech implementation projects',
		'Healthcare vendors needing domain-aware SQL, data modeling, workflow, and interoperability support'
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
			items:
				'SQL, C, C++, VBA, Perl, MS Access, MySQL, MUMPS-derived data, reporting automation'
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
			period: '2015 – Present',
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

	const projects = [
		{
			name: 'VA Hospital Research Data Warehouse',
			detail:
				'Built and supported healthcare research data warehouses integrating VA hospital data, national datasets, and multi-domain clinical sources.'
		},
		{
			name: 'NIH-Funded FIND Study Registry',
			detail:
				'Designed registry structures for nephrology and chronic disease research, balancing protocol-driven data collection with real-world clinical variability.'
		},
		{
			name: 'Functional Job Analysis System',
			detail:
				'Developed a system for hospital operations research by modeling human work, task overlap, and workflow structure as analyzable data.'
		},
		{
			name: 'Clinical Trial Data Systems',
			detail:
				'Designed CTMS/CDMS/eCRF components, validation logic, and clinical trial data workflows aligned with structured research-data requirements.'
		},
		{
			name: 'Meta-Analysis Platform',
			detail:
				'Created a platform for synthesizing heterogeneous research outputs where data alignment, definition consistency, and comparability were core challenges.'
		}
	];

	const consultingServices = [
		'EHR / EMR / HIE implementation advisory',
		'HL7 / FHIR data mapping and interoperability review',
		'ABDM / FHIR readiness support for Indian healthtech vendors',
		'Healthcare SQL data warehouse and reporting architecture',
		'Clinical trial data system design and validation logic',
		'Healthcare data quality audits and dashboard prototypes',
		'AI-readiness assessment for healthcare data and workflows',
		'Healthcare IT training for clinical, administrative, and vendor teams'
	];

	const professionalDevelopment = [
		'Practical FHIR R4/R5 implementation examples and healthcare interoperability portfolio',
		'ABDM, HIE, EHR/EMR integration, consent, identity, provenance, audit, and terminology workflows',
		'Healthcare SQL data modeling, ETL, data-quality review, and reporting/dashboard prototypes',
		'Healthcare AI data-readiness: workflow mapping, data-substrate review, and risk-aware implementation planning',
		'Privacy, security, and governance awareness for healthcare data environments, including HIPAA, GDPR, and ISO 27001 concepts'
	];

	const marketFit = [
		{
			region: 'Gulf',
			fit:
				'Strong fit for UAE, Saudi Arabia, Qatar, Kuwait, and regional healthcare modernization programs needing senior EHR, HIE, data, interoperability, and implementation experience.'
		},
		{
			region: 'India',
			fit:
				'Strong fit for ABDM, FHIR, healthtech, hospital digitization, clinical data, and implementation consulting without visa friction.'
		},
		{
			region: 'Remote International',
			fit:
				'Strong fit for contract work with healthtech vendors needing SQL, FHIR, healthcare data modeling, clinical workflow, and interoperability support.'
		},
		{
			region: 'U.S. / U.K. / EU',
			fit:
				'Best pursued through remote, vendor, consulting, or specialist interoperability roles rather than generic relocation-first job searches.'
		}
	];
</script>

<SEO {title} {description} {canonicalUrl} {keywords} />

<section class="mx-auto max-w-4xl py-8 md:py-12">
	<header class="mb-10 text-center md:text-left">
		<h1 class="mb-2 text-4xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 md:text-5xl">
			Suvro Ghosh
		</h1>

		<h2 class="mb-4 text-xl font-semibold tracking-wide text-neutral-700 dark:text-neutral-300">
			{headline}
		</h2>

		<p class="mb-6 text-sm font-medium text-neutral-600 dark:text-neutral-400">
			{locationLine}
		</p>

		<div class="flex flex-wrap items-center justify-center gap-4 text-sm font-bold text-neutral-600 dark:text-neutral-400 md:justify-start">
			<a
				href="https://www.linkedin.com/in/suvro-ghosh-78a5aa278"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
			>
				<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
				</svg>
				Connect on LinkedIn
			</a>

			<span class="hidden md:inline">|</span>

			<span>Healthcare IT · Interoperability · Clinical Data · AI-Ready Data Systems</span>
		</div>
	</header>

	<div class="card mb-8 bg-neutral-100 dark:bg-neutral-800">
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Executive Summary
		</h3>

		<div class="space-y-4 text-lg leading-relaxed text-neutral-800 dark:text-neutral-200">
			{#each executiveSummary as paragraph, i}
				<p class={i === 0 ? 'font-bold' : ''}>{paragraph}</p>
			{/each}
		</div>
	</div>

	<div class="card mb-8 border-l-4 border-l-neutral-800 bg-neutral-200/50 dark:border-l-neutral-200 dark:bg-neutral-800/80">
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Professional Positioning
		</h3>

		<div class="space-y-4 text-neutral-800 dark:text-neutral-200">
			{#each positioning as paragraph}
				<p class="leading-relaxed">{paragraph}</p>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Best-Fit Roles
		</h3>

		<div class="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
			{#each targetRoles as role}
				<div class="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 font-semibold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
					{role}
				</div>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Target Markets
		</h3>

		<ul class="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
			{#each targetMarkets as market}
				<li class="leading-relaxed">• {market}</li>
			{/each}
		</ul>
	</div>

	<div class="card mb-8">
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Core Skills
		</h3>

		<div class="grid grid-cols-1 gap-x-6 gap-y-4 text-sm md:grid-cols-2">
			{#each coreSkills as skill}
				<div>
					<h4 class="m-0 mb-1 font-bold text-neutral-900 dark:text-neutral-100">
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
			{#each experiences as job}
				<div class="relative border-l-2 border-neutral-300 pl-5 dark:border-neutral-700">
					<div class="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100"></div>

					<div class="mb-3 flex flex-col md:flex-row md:items-baseline md:justify-between">
						<div>
							<h4 class="m-0 text-lg font-bold text-neutral-900 dark:text-neutral-100">
								{job.title}
							</h4>
							<span class="text-sm font-bold text-neutral-600 dark:text-neutral-400">
								{job.company}
							</span>
						</div>

						<div class="mt-1 text-xs font-bold uppercase tracking-wider text-neutral-500 md:mt-0">
							{job.period}
						</div>
					</div>

					<ul class="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
						{#each job.details as detail}
							<li class="leading-relaxed">• {detail}</li>
						{/each}
					</ul>

					{#if job.videos && job.videos.length > 0}
						<div class="mt-5 flex flex-col gap-6 pb-2">
							{#each job.videos as videoUrl, vIndex}
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
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Key Projects & Research Systems
		</h3>

		<div class="space-y-4 text-sm text-neutral-700 dark:text-neutral-300">
			{#each projects as project}
				<div>
					<h4 class="m-0 mb-1 font-bold text-neutral-900 dark:text-neutral-100">
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
				Consulting Services
			</h3>

			<ul class="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
				{#each consultingServices as service}
					<li class="leading-relaxed">• {service}</li>
				{/each}
			</ul>
		</div>

		<div class="card">
			<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
				Professional Development Focus
			</h3>

			<p class="mb-3 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				Current focus areas for strengthening international healthcare IT, interoperability, analytics, and digital health consulting work:
			</p>

			<ul class="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
				{#each professionalDevelopment as item}
					<li class="leading-relaxed">• {item}</li>
				{/each}
			</ul>
		</div>
	</div>

	<div class="card my-8">
		<h3 class="mb-4 border-b border-neutral-300 pb-2 text-2xl font-bold dark:border-neutral-700">
			Market Fit
		</h3>

		<div class="space-y-4 text-sm text-neutral-700 dark:text-neutral-300">
			{#each marketFit as market}
				<div>
					<h4 class="m-0 mb-1 font-bold text-neutral-900 dark:text-neutral-100">
						{market.region}
					</h4>
					<p class="m-0 leading-relaxed">{market.fit}</p>
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
					<p class="text-sm text-neutral-600 dark:text-neutral-400">
						University of Texas, USA
					</p>
				</div>

				<div>
					<h4 class="m-0 text-base font-bold text-neutral-900 dark:text-neutral-100">
						B.E. Computer Science & Engineering
					</h4>
					<p class="text-sm text-neutral-600 dark:text-neutral-400">
						Jadavpur University, Kolkata
					</p>
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
					<em class="font-medium text-neutral-900 dark:text-neutral-100">
						Task Overlap Among Primary Care Team Members
					</em>
					<br />
					<span class="text-xs text-neutral-500">Journal of Healthcare Management</span>
				</li>

				<li>Multiple abstracts presented at National Kidney Foundation Clinical Meetings</li>
				<li>Full scholarship for M.S. study in the United States</li>
				<li>WBJEE Rank: 87 Engineering, 55 Medical</li>
				<li>Experience across USA, India, New Zealand, Fiji, Nepal, UAE, and Kuwait-facing remote work</li>
			</ul>
		</div>
	</div>

	<div class="mt-12 text-center">
		<a
			href="https://www.linkedin.com/in/suvro-ghosh-78a5aa278"
			target="_blank"
			rel="noopener noreferrer"
			class="btn-primary inline-flex items-center gap-2 px-8 py-3 text-lg"
		>
			<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
			</svg>
			Message on LinkedIn
		</a>
	</div>
</section>
