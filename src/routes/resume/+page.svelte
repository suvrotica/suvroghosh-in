<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import Yt from '$lib/components/blog/YouTube.svelte';

	const title = 'Suvro Ghosh | Senior Healthcare IT Architect & AI Data Specialist';
	const description = 'Senior Healthcare IT Architect and former Health-Tech Founder with 15+ years engineering clinical data systems (HL7, FHIR, CDISC) and preparing healthcare data substrates for Applied AI.';

	const executiveSummary = [
		"Senior Healthcare IT Architect and former Health-Tech Founder with 15+ years of experience engineering clinical data systems (HL7, FHIR, CDISC).",
		"Having bootstrapped proprietary HIE and CTMS platforms, I specialize in the critical intersection of Applied AI and healthcare data substrates.",
		"I partner with global organizations to architect robust data models that prevent expensive AI failures, ensuring complex clinical data is structured, meaningful, and AI-ready."
	];

	const corePhilosophy = [
		"I’ve spent over 15 years working across US healthcare systems, VA research environments, and clinical data platforms where the core problem was never just scale or performance. It was meaning—what the data actually represents, and how much of that survives once you start moving it around.",
		"Most of that work has involved EHR-derived data, HL7 pipelines, CDISC-based clinical trial systems, and research datasets stitched together from very different sources. Storage is rarely the constraint. Representation is where things either hold or break.",
		"Working in those systems, you see quickly that what looks like a data problem is usually a modeling problem, and what looks like integration is often just translation with loss."
	];

	const coreSkills = [
		{ category: 'Applied AI & Orchestration', items: 'Agentic Workflows, MCP (Model Context Protocol), RAG, Vector Databases, Tool Calling' },
		{ category: 'Healthcare Data Systems', items: 'HL7, FHIR R4/R5, CPT, ICD-9/10/11, CDISC, SDTM' },
		{ category: 'Data Engineering', items: 'SQL Server, SSIS (ETL), Data Warehousing, Data Governance' },
		{ category: 'Clinical Trials', items: 'CDMS, EDC, eCRF Design, Data Validation' },
		{ category: 'Analytics', items: 'SAS, SPSS, SQL Analytics' },
		{ category: 'Programming', items: 'C, C++, VBA, Perl' },
		{ category: 'Databases', items: 'SQL Server, MS Access, MySQL' },
		{ category: 'Architecture', items: 'Data Modeling (Relational, Dimensional, Hybrid), Interoperability' },
		{ category: 'Cloud & Systems', items: 'SaaS, Distributed Systems (conceptual)' },
		{ category: 'Leadership', items: 'Technical Founder, Architecture Strategy, Stakeholder Coordination' }
	];

	const experiences = [
		{
			title: 'Founder & Principal IT Architect',
			company: 'ClinZen LLC / ClinZen Software Pvt Ltd',
			period: '2015 – Present',
			videos: ['https://youtu.be/FkHa3W4pQME?si=S9mLi5y04An7A--I'],
			details: [
				'Bootstrapped and architected proprietary Health Information Exchange (HIE) and Clinical Trial Management System (CTMS) platforms, bridging the gap between legacy clinical data and Applied AI readiness.',
				'Designed mobile-enabled clinical data tools aligned with CDISC standards, accelerating trial execution and ensuring strict regulatory compliance for Phase II/III trials.',
				'Led full lifecycle development: system architecture → data modeling → validation logic → database lock, ensuring data integrity and analytical usability under conflicting constraints.',
				'Operated as an independent architect partnering with healthcare clients to navigate interoperability challenges and translate clinical workflows into structured, scalable semantics.'
			]
		},
		{
			title: 'Cloud Solutions Architect',
			company: 'TenZillionClouds Pvt Ltd',
			period: 'Early 2016 and 2019',
			videos: [
				'https://youtu.be/GKeXyACNca8?si=LwsE_qHxopgsG4cD',
				'https://youtu.be/BEyub9spGqw?si=tkWpQeq83PsBPlp_'
			],
			details: [
				'Focused on cloud-native thinking in environments where legacy assumptions still dominate.',
				'Explored SaaS architectures for complex systems where multi-tenancy introduces not just scaling concerns, but semantic isolation problems.'
			]
		},
		{
			title: 'Associate Statistician',
			company: 'University of Texas Health Science Center (UTHSCSA)',
			period: '2010 – 2012',
			details: [
				'Worked on large-scale healthcare data warehouses integrating VA hospital data and national datasets. The challenge was not ingestion. It was reconciliation.',
				'Flat files, SAS datasets, relational tables—each internally consistent, none aligned. Built pipelines that transformed data, knowing that every transformation introduces loss.',
				'Performed statistical analysis across diabetes, ESRD, and nephropathy studies, where variable definition often mattered more than the analysis itself.'
			]
		},
		{
			title: 'Systems Analyst',
			company: 'UTHSCSA / VA Research Center',
			period: '2002 – 2007',
			details: [
				'Built and maintained research databases sourced from MUMPS-based VA systems, flat files, and relational structures.',
				'Designed ETL pipelines using SSIS where "integration" meant negotiating between incompatible representations.',
				'Implemented outlier detection not as a statistical afterthought, but as a structural necessity due to inconsistencies in operational data.',
				'Supported datasets spanning inpatient, outpatient, pharmacy, and laboratory domains, each with its own implicit ontology.'
			]
		},
		{
			title: 'Senior Database Architect',
			company: 'CF Health Solution',
			period: '2009',
			details: [
				'Migrated unstructured systems into relational SQL Server architectures.',
				'Redesigned schemas, indexing strategies, and ETL workflows.',
				'The technical work was straightforward. The challenge was translating assumptions embedded in legacy data into explicit structure.'
			]
		},
		{
			title: 'Business Analyst',
			company: 'Taxicharge (New Zealand)',
			period: '2008',
			details: [
				'Built reporting systems from mixed physical and digital data sources.',
				'Designed SQL-based reporting pipelines, where the primary constraint was not tooling, but the absence of consistent data semantics.'
			]
		},
		{
			title: 'Lecturer',
			company: 'University of Fiji',
			period: '2007 – 2008',
			details: [
				'Taught Operating Systems, Computer Networks, and Network Security.',
				'Explaining systems forces clarity. Most production systems lack that clarity.'
			]
		},
		{
			title: 'Member of Technical Staff',
			company: 'Surgient Networks (USA)',
			period: '2000 – 2002',
			details: [
				'Implemented multi-queue caching algorithms for high-performance systems.',
				'Early exposure to the idea that system behavior is shaped less by code and more by constraints and access patterns.'
			]
		}
	];

	const projects = [
		'Built VA hospital research data warehouse integrating multi-source clinical data where denormalization and normalization had to coexist.',
		'Designed registry system for NIH-funded FIND study, balancing protocol-driven structure with real-world data variability.',
		'Developed Functional Job Analysis (FJA) system used in hospital operations research, modeling human workflows as structured data.',
		'Created meta-analysis platform enabling synthesis of heterogeneous research outputs, where consensus required alignment beyond schema.'
	];

	const aiFocus = [
		"AI in healthcare doesn’t work on raw reality. It works on representations—data shaped by EHR systems, clinical workflows, billing logic, and whatever standardization layer sits on top.",
		"If those representations are off, AI doesn’t fix them. It just scales whatever is already there.",
		"HL7 messages move events, but not always enough context.\nFHIR improves structure, but ambiguity doesn’t go away.\nCDISC enforces consistency, but that’s not the same as meaning.",
		"So the outcome is usually predictable. Models end up inheriting the same limitations that exist in the data.",
		"It’s not really an intelligence problem. It’s a problem of how reality gets specified in the first place.",
		"Applying AI here isn’t just about models. It’s about understanding how data is modeled, transformed, and constrained before it ever reaches a model.",
		"That’s the layer I’m interested in working on, because that’s where most of the leverage actually is."
	];
</script>

<SEO {title} {description} />

<section class="mx-auto max-w-4xl py-8 md:py-12">
	<header class="mb-10 text-center md:text-left">
		<h1 class="mb-2 text-4xl font-bold md:text-5xl tracking-tight text-neutral-900 dark:text-neutral-100">Suvro Ghosh</h1>
		<h2 class="text-neutral-600 dark:text-neutral-400 mb-6 text-xl font-medium tracking-wide">Senior Healthcare IT Architect & AI Data Specialist</h2>
		
		<div class="flex flex-wrap items-center justify-center gap-4 text-sm font-bold text-neutral-600 dark:text-neutral-400 md:justify-start">
			<span class="flex items-center gap-1">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
				Open to Relocation (US/EU/Gulf) / Remote
			</span>
			<span class="hidden md:inline">|</span>
			<a href="https://www.linkedin.com/in/suvro-ghosh-78a5aa278" target="_blank" rel="noopener noreferrer" class="hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors flex items-center gap-1">
				<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
					<path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
				</svg>
				Connect on LinkedIn
			</a>
		</div>
	</header>

	<div class="card mb-8 bg-neutral-100 dark:bg-neutral-800">
		<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Executive Summary</h3>
		<div class="space-y-4 text-neutral-800 dark:text-neutral-200 leading-relaxed text-lg">
			{#each executiveSummary as paragraph, i}
				<p class={i === 0 ? "font-bold" : ""}>
					{paragraph}
				</p>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Core Philosophy</h3>
		<div class="space-y-4 text-neutral-700 dark:text-neutral-300 leading-relaxed italic">
			{#each corePhilosophy as paragraph}
				<p>{paragraph}</p>
			{/each}
		</div>
	</div>

	<div class="card mb-8 border-l-4 border-l-neutral-800 dark:border-l-neutral-200 bg-neutral-200/50 dark:bg-neutral-800/80">
		<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Current Focus: AI in Healthcare</h3>
		<div class="space-y-4 text-neutral-800 dark:text-neutral-200">
			{#each aiFocus as paragraph}
				<p class="whitespace-pre-line leading-relaxed">{paragraph}</p>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Core Skills</h3>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6 text-sm">
			{#each coreSkills as skill}
				<div class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
					<span class="font-bold text-neutral-900 dark:text-neutral-100 whitespace-nowrap">{skill.category}:</span>
					<span class="text-neutral-600 dark:text-neutral-400">{skill.items}</span>
				</div>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-6 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Professional Experience</h3>
		<div class="space-y-10">
			{#each experiences as job}
				<div class="relative pl-5 border-l-2 border-neutral-300 dark:border-neutral-700">
					<div class="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100"></div>
					<div class="flex flex-col md:flex-row md:items-baseline md:justify-between mb-3">
						<div>
							<h4 class="text-lg font-bold text-neutral-900 dark:text-neutral-100 m-0">{job.title}</h4>
							<span class="text-sm font-bold text-neutral-600 dark:text-neutral-400">{job.company}</span>
						</div>
						<div class="text-xs font-bold uppercase tracking-wider text-neutral-500 mt-1 md:mt-0">
							{job.period}
						</div>
					</div>
					<div class="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
						{#each job.details as detail}
							<p class="leading-relaxed">{detail}</p>
						{/each}
						
						{#if job.videos && job.videos.length > 0}
							<div class="mt-4 flex flex-col gap-6 pb-2">
								{#each job.videos as videoUrl, vIndex}
									<Yt src={videoUrl} title={`Overview of ${job.company} - Part ${vIndex + 1}`} caption={`Demo/Presentation: ${job.company}`} />
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Key Projects & Research</h3>
		<ul class="space-y-3 text-sm text-neutral-700 dark:text-neutral-300 list-disc list-inside">
			{#each projects as project}
				<li class="leading-relaxed"><span class="ml-[-0.5rem]">{project}</span></li>
			{/each}
		</ul>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
		<div class="card">
			<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Education</h3>
			<div class="space-y-5">
				<div>
					<h4 class="font-bold text-neutral-900 dark:text-neutral-100 m-0 text-base">M.S. Computer Science</h4>
					<p class="text-sm text-neutral-600 dark:text-neutral-400">University of Texas, USA</p>
				</div>
				<div>
					<h4 class="font-bold text-neutral-900 dark:text-neutral-100 m-0 text-base">B.E. Computer Science & Engineering</h4>
					<p class="text-sm text-neutral-600 dark:text-neutral-400">Jadavpur University, Kolkata</p>
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-8">
			<div class="card flex-1">
				<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Publications</h3>
				<ul class="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
					<li>
						Co-author: <em class="text-neutral-900 dark:text-neutral-100 font-medium">Task Overlap Among Primary Care Team Members</em> 
						<br/><span class="text-xs text-neutral-500">(Journal of Healthcare Management)</span>
					</li>
					<li>Multiple abstracts presented at National Kidney Foundation Clinical Meetings</li>
				</ul>
			</div>

			<div class="card flex-1">
				<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Additional Highlights</h3>
				<ul class="space-y-2 text-sm text-neutral-700 dark:text-neutral-300 list-disc list-inside">
					<li>Full scholarship for MS in the United States</li>
					<li>WBJEE Rank: 87 (Engineering) 55 (Medical)</li>
					<li>Experience across USA, India, New Zealand, Fiji, Nepal</li>
				</ul>
			</div>
		</div>
	</div>
	
	<div class="mt-12 text-center">
		<a href="https://www.linkedin.com/in/suvro-ghosh-78a5aa278" target="_blank" rel="noopener noreferrer" class="btn-primary inline-flex items-center gap-2 px-8 py-3 text-lg">
			<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
			</svg>
			Message on LinkedIn
		</a>
	</div>
</section>
