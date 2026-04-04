<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';

	const title = 'Resume | Suvro Ghosh | Healthcare IT Architect';
	const description = 'Senior Healthcare IT Architect, Data Scientist, and Computer Science Engineer with 20+ years of global experience across the US, India, and New Zealand.';

	const coreSkills = [
		'Healthcare IT Architecture',
		'Clinical Trials & Data Analytics',
		'Machine Learning & AI',
		'HL7 / FHIR / CDISC',
		'SQL Server & Database Engineering',
		'Data Mining & Statistical Modeling',
		'Business Intelligence (Tableau, SPSS, Excel)',
		'Healthcare Interoperability',
		'System Design & Performance Optimization'
	];

	const experiences = [
		{
			title: 'Consultant / Freelance Data Scientist',
			location: 'India',
			period: '2014 – 2026',
			bullets: [
				'Delivered data analytics and machine learning solutions across healthcare, pharma, and financial sectors.',
				'Developed business logic models and predictive analytics frameworks.',
				'Led independent consulting engagements for international clients.'
			]
		},
		{
			title: 'Statistician',
			company: 'Veterans Administration',
			location: 'San Antonio, USA',
			period: '2010 – 2014',
			bullets: [
				'Designed statistical models and reporting frameworks for healthcare data.',
				'Performed data mining and performance analytics.',
				'Supported clinical and operational decision-making.'
			]
		},
		{
			title: 'Systems Analyst',
			company: 'UTHSCSA',
			location: 'San Antonio, USA',
			period: '2002 – 2008',
			bullets: [
				'Maintained large-scale relational databases for healthcare research.',
				'Built and optimized data systems for clinical studies.',
				'Worked on integrating biological data with computing models.'
			]
		},
		{
			title: 'Senior DBA',
			company: 'Taxicharge',
			location: 'New Zealand',
			period: '2009 – 2010',
			bullets: [
				'Managed SQL Server infrastructure and reporting systems.',
				'Ensured database performance and reliability.'
			]
		},
		{
			title: 'Lecturer – Computer Science',
			company: 'University of Fiji',
			location: 'Fiji',
			period: '2008 – 2009',
			bullets: [
				'Taught Database Management Systems (DBMS).',
				'Delivered academic instruction in computer science fundamentals.'
			]
		},
		{
			title: 'Member of Technical Staff',
			company: 'Surgient Networks',
			location: 'Austin, USA',
			period: '2000 – 2002',
			bullets: [
				'Worked on caching simulation and request-shaping algorithms.',
				'Applied statistical models such as Zipf distribution.'
			]
		}
	];
</script>

<SEO {title} {description} />

<section class="mx-auto max-w-4xl py-8">
	<header class="mb-10 text-center md:text-left">
		<h1 class="mb-2 text-4xl font-bold md:text-5xl">Suvro Ghosh</h1>
		<h2 class="text-gold mb-4 text-xl font-medium tracking-wide uppercase">Senior Healthcare IT Architect & Data Scientist</h2>
		
		<div class="flex flex-wrap items-center justify-center gap-4 text-sm font-bold text-neutral-600 dark:text-neutral-400 md:justify-start">
			<span class="flex items-center gap-1">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
				Kolkata, India
			</span>
			<span>|</span>
			<a href="https://www.linkedin.com/in/suvro-ghosh-78a5aa278" target="_blank" rel="noopener noreferrer" class="hover:text-gold transition-colors flex items-center gap-1">
				<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
					<path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
				</svg>
				Connect on LinkedIn
			</a>
		</div>
	</header>

	<div class="card mb-8">
		<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Professional Summary</h3>
		<p class="text-neutral-700 dark:text-neutral-300">
			Senior Healthcare IT Architect, Data Scientist, and Computer Science Engineer with 20+ years of international experience across the US, India, and New Zealand. Proven expertise in healthcare analytics, clinical trial systems, database architecture, and digital health transformation.
		</p>
		<ul class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-neutral-700 dark:text-neutral-300 list-disc list-inside">
			<li>US healthcare systems and regulatory frameworks</li>
			<li>Clinical data modeling and statistical analysis</li>
			<li>Healthcare interoperability (HL7, FHIR, CDISC)</li>
			<li>Machine learning and data mining</li>
			<li>Enterprise system architecture and scalability</li>
		</ul>
	</div>

	<div class="card mb-8">
		<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Core Skills</h3>
		<div class="flex flex-wrap gap-2">
			{#each coreSkills as skill}
				<span class="rounded-full bg-neutral-200 dark:bg-neutral-800 px-3 py-1 text-xs font-bold tracking-wide text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700">
					{skill}
				</span>
			{/each}
		</div>
	</div>

	<div class="card mb-8">
		<h3 class="mb-6 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Professional Experience</h3>
		<div class="space-y-8">
			{#each experiences as job}
				<div class="relative pl-4 border-l-2 border-neutral-300 dark:border-neutral-700">
					<div class="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-neutral-900 dark:bg-neutral-100"></div>
					<div class="flex flex-col md:flex-row md:items-start md:justify-between mb-2">
						<div>
							<h4 class="text-lg font-bold text-neutral-900 dark:text-neutral-100 m-0">{job.title}</h4>
							{#if job.company}
								<span class="text-sm font-bold text-neutral-600 dark:text-neutral-400">{job.company}</span>
							{/if}
						</div>
						<div class="text-left md:text-right text-xs font-bold uppercase tracking-wider text-neutral-500 mt-1 md:mt-0">
							<div>{job.period}</div>
							<div>{job.location}</div>
						</div>
					</div>
					<ul class="list-disc list-inside space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
						{#each job.bullets as bullet}
							<li>{bullet}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
		<div class="card">
			<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Education</h3>
			<div class="space-y-4">
				<div>
					<h4 class="font-bold text-neutral-900 dark:text-neutral-100 m-0 text-base">Master of Science in Computer Science</h4>
					<p class="text-sm text-neutral-600 dark:text-neutral-400">University of Texas at San Antonio, USA</p>
				</div>
				<div>
					<h4 class="font-bold text-neutral-900 dark:text-neutral-100 m-0 text-base">Bachelor of Engineering (Computer Science)</h4>
					<p class="text-sm text-neutral-600 dark:text-neutral-400">Jadavpur University, India</p>
				</div>
			</div>
		</div>

		<div class="card">
			<h3 class="mb-4 text-2xl font-bold border-b border-neutral-300 dark:border-neutral-700 pb-2">Technical Stack</h3>
			<ul class="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
				<li><strong class="text-neutral-900 dark:text-neutral-100">Languages:</strong> C, C++, Java, SQL, SAS, VBA</li>
				<li><strong class="text-neutral-900 dark:text-neutral-100">Tools:</strong> Tableau, SPSS, Excel, Crystal Reports</li>
				<li><strong class="text-neutral-900 dark:text-neutral-100">Domains:</strong> Healthcare IT, Machine Learning, Data Analytics</li>
			</ul>
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