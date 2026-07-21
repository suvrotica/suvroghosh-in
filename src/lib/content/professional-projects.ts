export type ProfessionalProject = {
	id:
		| 'va-research-data-warehouse'
		| 'find-study-registry'
		| 'hie-clinical-trial-platforms'
		| 'functional-job-analysis'
		| 'meta-analysis-platform'
		| 'mojollm-notebooks'
		| 'visualizations'
		| 'editorial-publishing-system';
	name: string;
	context: string;
	detail: string;
	contributions: readonly string[];
	disciplines: readonly string[];
	relatedPostSlugs: readonly string[];
	href?: string;
	demo?: {
		url: string;
		title: string;
	};
};

export const professionalProjects: readonly ProfessionalProject[] = [
	{
		id: 'va-research-data-warehouse',
		name: 'VA Hospital Research Data Warehouse',
		context: 'Healthcare research systems · UTHSCSA / VA Research Center',
		detail:
			'Built and supported healthcare research data warehouses integrating VA hospital data, national datasets, and multi-domain clinical sources.',
		contributions: [
			'Worked across MUMPS-derived hospital data, flat files, relational databases, pharmacy, laboratory, inpatient, and outpatient sources.',
			'Designed SQL Server and SSIS transformations that turned operational healthcare data into research-ready structures.',
			'Implemented cleaning, outlier detection, validation, reconciliation, and provenance-aware data preparation.'
		],
		disciplines: ['Clinical data', 'SQL Server', 'SSIS / ETL', 'Data quality'],
		relatedPostSlugs: ['va-healthcare-data-systems-mumps-to-sql']
	},
	{
		id: 'find-study-registry',
		name: 'NIH-Funded FIND Study Registry',
		context: 'Nephrology and chronic-disease research',
		detail:
			'Designed registry structures for nephrology and chronic-disease research, balancing protocol-driven data collection with real-world clinical variability.',
		contributions: [
			'Structured research data around diabetes, ESRD, nephropathy, and related chronic-disease questions.',
			'Balanced formal study definitions with missingness, coding variation, and inconsistent operational source data.',
			'Supported research teams where cohort logic and clinical meaning mattered as much as the statistical model.'
		],
		disciplines: ['Research registry', 'Clinical analytics', 'Cohort logic', 'Data provenance'],
		relatedPostSlugs: [
			'find-study-diabetes-kidney-family-tree',
			'confounding-factors-healthcare-it-analytics'
		]
	},
	{
		id: 'hie-clinical-trial-platforms',
		name: 'HIE and Clinical Trial Data Platforms',
		context: 'Healthcare interoperability and clinical research · ClinZen',
		detail:
			'Architected proprietary HIE and CTMS platforms that translated clinical workflows, patient data, trial protocols, and operational requirements into structured systems.',
		contributions: [
			'Designed database and application structures across interoperability, clinical-trial, and digital workflow requirements.',
			'Created mobile-enabled clinical data collection tools aligned with CDISC practices and Phase II/III trial workflows.',
			'Led architecture, data modelling, validation logic, reporting, user workflows, and data-quality controls.'
		],
		disciplines: ['HIE', 'CTMS / CDMS', 'eCRF', 'Clinical workflows'],
		relatedPostSlugs: [
			'hie-first-principles-openhie',
			'fhir-the-universal-language-of-health-data'
		],
		demo: {
			url: 'https://youtu.be/FkHa3W4pQME?si=S9mLi5y04An7A--I',
			title: 'ClinZen platform overview'
		}
	},
	{
		id: 'functional-job-analysis',
		name: 'Functional Job Analysis System',
		context: 'Hospital operations research',
		detail:
			'Developed a system for hospital operations research by modelling human work, task overlap, and workflow structure as analysable data.',
		contributions: [
			'Translated descriptions of hospital work into explicit, structured information.',
			'Modelled tasks, overlap, and workflow relationships so operational patterns could be examined systematically.'
		],
		disciplines: ['Workflow modelling', 'Requirements analysis', 'Structured data'],
		relatedPostSlugs: []
	},
	{
		id: 'meta-analysis-platform',
		name: 'Meta-Analysis Platform',
		context: 'Research synthesis systems',
		detail:
			'Created a platform for synthesising heterogeneous research outputs where data alignment, definition consistency, and comparability were core challenges.',
		contributions: [
			'Structured unlike research outputs so their definitions and results could be compared.',
			'Made alignment decisions and comparability constraints explicit instead of hiding them inside reports.'
		],
		disciplines: ['Research data', 'Semantic alignment', 'Data modelling'],
		relatedPostSlugs: []
	},
	{
		id: 'mojollm-notebooks',
		name: 'mojoLLM Computational Notebooks',
		context: 'Mojo · Machine learning education · Literate programming',
		detail:
			'A growing collection of Python-style, browser-readable notebooks that use Mojo to build machine-learning ideas from first principles.',
		contributions: [
			'Added a reproducible Jupyter-to-HTML publishing pipeline with isolated, responsive notebook embeds for any Markdown essay.',
			'Established a first-class mojoLLM category so notebook essays remain browsable as a distinct body of project work.',
			'Created a from-scratch notebook sequence that moves from one perceptron to an XOR network of three trained perceptrons.'
		],
		disciplines: ['Mojo', 'Jupyter', 'Machine learning', 'Literate programming'],
		relatedPostSlugs: ['perceptron-from-scratch-in-mojo', 'xor-with-multiple-perceptrons-in-mojo']
	},
	{
		id: 'visualizations',
		name: 'Visualizations Interactive Laboratory',
		context: 'Ongoing laboratory · Science and computing education',
		detail:
			'An interactive laboratory for exploring physics, chemistry, biology, mathematics, statistics, algorithms, computer science, machine learning, and scientific computing through reactive notebooks, simulations, generative graphics, and GPU shaders.',
		contributions: [
			'Built a lazy, server-safe p5.js and WebGL framework for interactive experiments inside ordinary Markdown posts.',
			'Added native Observable runtime and D3 notebook cells with responsive SVG, reactive controls, accessible descriptions, reduced-motion defaults, and deterministic cleanup.',
			'Engineered a seeded artificial-life system with inherited genomes, bounded mutation, explicit energy accounting, predator pressure, fixed-step simulation, and reproducible presets.',
			'Built a WebGL2 Monte Carlo instrument with seeded pseudorandom, stratified, and Halton sampling, bounded GPU point storage, confidence estimates, and an accessible logarithmic convergence chart.',
			'Designed accessible controls, touch and keyboard interaction, reduced-motion behaviour, static fallbacks, and isolated multi-sketch lifecycle management.',
			'Publishes first-principles lessons with live output and executable source across D3, Observable notebooks, p5.js, GLSL, Canvas, SVG, and WebGL.'
		],
		disciplines: [
			'Artificial life',
			'Evolutionary modelling',
			'Monte Carlo simulation',
			'Statistics',
			'TypeScript',
			'D3',
			'Canvas',
			'WebGL'
		],
		relatedPostSlugs: [
			'hello-fragment-your-first-shader-from-scratch',
			'hello-observable-your-first-living-d3-visualization',
			'artificial-life-lab-evolve-a-digital-ecosystem-in-your-browser',
			'monte-carlo-laboratory'
		],
		href: '/blog/visualizations'
	},
	{
		id: 'editorial-publishing-system',
		name: 'SuvroGhosh.IN Editorial Publishing System',
		context: 'Independent publishing · Editorial infrastructure',
		detail:
			'Designed and maintain the static-first SvelteKit publishing system behind this site and its large long-form archive.',
		contributions: [
			'Built an mdsvex publishing pipeline with Pagefind search, archive facets, topic pages, reading paths, RSS, and structured metadata.',
			'Added accessible article navigation, themes, text-to-speech, reading progress, tables of contents, and resilient media handling.',
			'Automated incremental post tagging, word-cloud generation, search indexing, image optimisation, and content validation during builds.'
		],
		disciplines: ['SvelteKit', 'Information architecture', 'Accessibility', 'Build automation'],
		relatedPostSlugs: []
	}
];
