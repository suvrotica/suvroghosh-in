import aRecordCrossesTownImage from '$lib/assets/projects/a-record-crosses-town.svg';

export type ProjectLink =
	| {
			kind: 'internal';
			href: '/blog/visualizations' | '/blog/visualizations/human-ai-icu-prediction-laboratory';
			label: string;
	  }
	| {
			kind: 'external';
			href: `https://${string}`;
			label: string;
	  };

export type ProjectImage = {
	src: string;
	alt: string;
	width: number;
	height: number;
};

export type ProjectGuide = {
	href: `https://${string}`;
	label: string;
};

export type ProfessionalProject = {
	id:
		| 'va-research-data-warehouse'
		| 'find-study-registry'
		| 'hie-clinical-trial-platforms'
		| 'a-record-crosses-town'
		| 'human-ai-icu-prediction-laboratory'
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
	link?: ProjectLink;
	guide?: ProjectGuide;
	image?: ProjectImage;
	featured?: boolean;
	showOnResume?: boolean;
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
		id: 'a-record-crosses-town',
		name: 'A Record Crosses Town',
		context: 'Independent interactive systems explainer · OpenHIE-inspired · wholly synthetic',
		detail:
			'A standalone, fully prerendered exhibit that follows one wholly synthetic encounter through identity, trust, routing, terminology, shared clinical storage, supply, finance, aggregate reporting, deterministic failure, and bounded recovery.',
		contributions: [
			'Built a typed deterministic simulation with an original semantic architecture map and inspectable payload, difference, lineage, audit, and provenance views.',
			'Authored twelve failure presets that stop at explicit system boundaries, preserve failed evidence, apply bounded recovery, and replay with stable idempotency semantics.',
			'Mapped technical claims to official primary sources while keeping every fixture synthetic and every authority store separate.'
		],
		disciplines: [
			'SvelteKit',
			'TypeScript',
			'HIE architecture',
			'OpenHIE-inspired',
			'Data provenance',
			'Accessibility'
		],
		relatedPostSlugs: [
			'hie-first-principles-openhie',
			'fhir-the-universal-language-of-health-data'
		],
		link: {
			kind: 'external',
			href: 'https://record.suvroghosh.in/',
			label: 'Open the standalone exhibit'
		},
		guide: {
			href: 'https://record.suvroghosh.in/guide/',
			label: 'Use the 15-minute guided tour'
		},
		image: {
			src: aRecordCrossesTownImage,
			alt: 'A blue synthetic record route crosses a black-lined, high-contrast white exchange map of separate identity, terminology, clinical, supply, aggregate, and finance services.',
			width: 1600,
			height: 1000
		},
		featured: true,
		showOnResume: false
	},
	{
		id: 'human-ai-icu-prediction-laboratory',
		name: 'Human + AI ICU Prediction Laboratory',
		context:
			'Independent clinical-prediction explainer · wholly synthetic · educational, not clinical',
		detail:
			'A deterministic interactive laboratory showing when clinician–model probability ensembles improve prediction—and when shared error or population shift defeats the average.',
		contributions: [
			'Built a deterministic synthetic-cohort laboratory comparing clinician, model, and weighted-ensemble probability forecasts for one declared binary ICU outcome.',
			'Exposed discrimination, calibration, shared residual dependence, individual and pooled Brier scores, reliability diagrams, and casewise error overlap using the same reproducible cohort.',
			'Authored four failure-oriented presets, including shared hospital artifacts and deployment prevalence shift, with explicit educational boundaries and no patient-level claims.'
		],
		disciplines: [
			'Clinical prediction',
			'Human–AI collaboration',
			'Probability',
			'Calibration',
			'Brier score',
			'SvelteKit',
			'TypeScript',
			'Accessibility'
		],
		relatedPostSlugs: ['human-ai-icu-prediction-laboratory'],
		link: {
			kind: 'internal',
			href: '/blog/visualizations/human-ai-icu-prediction-laboratory',
			label: 'Open the synthetic laboratory →'
		},
		image: {
			src: '/images/visualizations/human-ai-icu-prediction-laboratory/human-ai-icu-prediction-laboratory.webp',
			alt: 'Graphic labelled Synthetic educational simulation, with blue and amber probability streams entering a weighted mixer and a violet ensemble stream leaving it beside a reliability diagonal.',
			width: 1600,
			height: 900
		},
		featured: true,
		showOnResume: false
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
			'Created a WebGL2 living-pigment studio with ping-pong texture fields for mobile and deposited pigment, local moisture, velocity, granulation, staining, bounded GPU history, and local artwork/project export.',
			'Built a safe domain-colouring explorer that compiles a constrained complex-expression syntax tree into demand-rendered WebGL, with logarithmic contours, branch-aware functions, and aspect-correct pan and zoom.',
			'Created a deterministic living-aperture laboratory with analytic and accretive shell engines, transported frames, finite structural ornament, ring-prefix growth history, Web Workers, scientific guardrails, and Three.js export.',
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
			'WebGL',
			'Generative art',
			'GPU simulation',
			'Complex analysis',
			'Mathematical morphology'
		],
		relatedPostSlugs: [
			'hello-fragment-your-first-shader-from-scratch',
			'hello-observable-your-first-living-d3-visualization',
			'artificial-life-lab-evolve-a-digital-ecosystem-in-your-browser',
			'monte-carlo-laboratory',
			'create-art-living-pigment-studio',
			'domain-coloring-complex-functions-explorer',
			'the-living-aperture'
		],
		link: {
			kind: 'internal',
			href: '/blog/visualizations',
			label: 'Enter the interactive laboratory'
		},
		featured: true
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
