import type { VisualizationDefinition, VisualizationSummary } from './types';
import { helloFragmentMetadata } from './experiments/hello-fragment/metadata';
import { rayMarchingMetadata } from './experiments/ray-marching/metadata';

const visualizationLoaders = {
	'hello-fragment': () =>
		import('./experiments/hello-fragment').then((module) => module.helloFragment)
} satisfies Record<string, () => Promise<VisualizationDefinition>>;

const dedicatedShaderLoaders = {
	'ray-marching-cathedral': () =>
		import('./experiments/ray-marching').then((module) => module.rayMarchingCathedral)
};

export type VisualizationId = keyof typeof visualizationLoaders;
export type DedicatedShaderId = keyof typeof dedicatedShaderLoaders;

export const visualizationSummaries = {
	'mindmap-studio': {
		id: 'mindmap-studio',
		title: 'Mindmap Studio: Read Deeply, See the Connections',
		description:
			'Turn articles, transcripts and PDF excerpts into editable mind maps and knowledge graphs, with evidence to follow and ideas to refine.',
		subjects: ['Learning', 'Data Visualization', 'Computer Science'],
		poster: '/images/visualizations/mindmap-studio/social.png',
		posterAlt:
			'Mindmap Studio with a central inquiry branching into six coloured themes and source-linked ideas on warm paper',
		href: '/blog/visualizations/mindmap-studio',
		status: 'published'
	},
	'post-to-uml': {
		id: 'post-to-uml',
		title: 'Post to UML: Draw in UML from Any Text or Article',
		description:
			'Paste an article or load a blog post, generate editable PlantUML code across all 14 concrete UML 2.5 diagram types, and export rendered figures with captions.',
		subjects: ['Computer Science', 'Design', 'Data Visualization'],
		poster: '/images/visualizations/post-to-uml/social.png',
		posterAlt:
			'Post to UML studio showing a five-stage pipeline from article prose to editable PlantUML source, deterministic SVG diagrams across 14 UML types, and blog embeds.',
		href: '/blog/visualizations/post-to-uml',
		status: 'published'
	},
	'knowledge-gap-atlas': {
		id: 'knowledge-gap-atlas',
		title: 'Knowledge Gap Atlas',
		description:
			'Turn essays and research notes into topic islands. Follow the source evidence, compare coverage and collect questions worth investigating, entirely in your browser.',
		subjects: ['Learning', 'Data Visualization', 'Computer Science'],
		poster: '/images/visualizations/knowledge-gap-atlas/social.png',
		posterAlt:
			'Knowledge Gap Atlas showing eight coloured topic islands, 59 concepts and full-input indexing statistics for a city-heat research example',
		href: '/blog/visualizations/knowledge-gap-atlas',
		status: 'published'
	},
	'strange-matter': {
		id: 'strange-matter',
		title: 'Strange Matter: Make Something Impossible',
		description:
			'Make iridescent sculptures, alien blooms and luminous worlds with a few simple controls. Discover, rotate and export your own generative artwork.',
		subjects: ['Generative Art', 'Computer Science', 'Design'],
		poster: '/images/visualizations/strange-matter/poster.png',
		posterAlt:
			'An iridescent folded sculpture suspended in the dark Strange Matter generative art studio',
		href: '/blog/visualizations/strange-matter',
		status: 'published'
	},
	'living-systems': {
		id: 'living-systems',
		title: 'Living Systems: Small Rules, Unexpected Worlds',
		description:
			'Paint a cellular world, follow Langton’s ant, release a drop of dye and discover the statistics behind a wandering crowd.',
		subjects: ['Mathematics', 'Computer Science', 'Scientific Computing', 'Generative Art'],
		poster: '/images/visualizations/living-systems/social.png',
		posterAlt:
			'A scientific instrument showing a cellular simulation beside transport controls and measured population statistics',
		href: '/blog/visualizations/living-systems',
		status: 'published'
	},
	'anatomy-of-an-essay': {
		id: 'anatomy-of-an-essay',
		title: 'The Anatomy of an Essay',
		description:
			'Read an essay as a living body: paragraph organs, sentence ribs, repeated-word neural knots and long-sentence coils.',
		subjects: ['Literature', 'Data Visualization'],
		poster: '/images/visualizations/anatomy-of-an-essay/social.png',
		posterAlt:
			'A literary organism with shaded paragraph chambers, articulated sentence ribs, branching vessels and winding long-sentence coils',
		href: '/blog/visualizations/anatomy-of-an-essay',
		status: 'published'
	},
	'through-a-different-glass': {
		id: 'through-a-different-glass',
		title: 'Through a Different Glass: The Lens and Mirror Lab',
		description:
			'Compare an original image with adjustable lens and mirror distortions. Explore five illustrated samples or process a bounded personal image entirely in your browser.',
		subjects: ['Physics', 'Computer Science', 'Generative Art'],
		poster: '/images/visualizations/through-a-different-glass/poster.png',
		posterAlt:
			'The optical workbench comparing an original calibration grid with adjustable barrel distortion.',
		href: '/blog/visualizations/through-a-different-glass',
		status: 'published'
	},
	'between-a-click-and-a-page': {
		id: 'between-a-click-and-a-page',
		title: 'Between a Click and a Page',
		description:
			'Follow one HTTPS request through DNS, TCP, TLS and a web server. Lose a piece, reuse a connection and see where the waiting goes.',
		subjects: ['Computer Science'],
		poster: '/images/visualizations/between-a-click-and-a-page/social.png',
		posterAlt:
			'A fitted isometric request bench with an address index, connection couplings, transport tracks, receiving trays and a server rack',
		href: '/blog/visualizations/between-a-click-and-a-page',
		status: 'published'
	},
	'prompt-atlas': {
		id: 'prompt-atlas',
		title: 'Prompt Atlas: See the Structure Inside Your Prompt',
		description:
			'Count characters, inspect evidence and uncertainty, and explore your prompt as a mind map, workflow or supported data model in your browser.',
		subjects: ['Computer Science', 'Design', 'Learning'],
		poster: '/images/visualizations/prompt-atlas/social.png',
		posterAlt:
			'Prompt Atlas with a prompt editor, a character count and a branching mind map of the prompt’s task, subject and constraints',
		href: '/blog/visualizations/prompt-atlas',
		status: 'published'
	},
	'a-place-for-every-idea': {
		id: 'a-place-for-every-idea',
		title: 'A Place for Every Idea: Build Your Own Memory Palace',
		description:
			'Turn words or a paragraph into editable scenes along a Calcutta house route, then practise recalling the material before revealing it.',
		subjects: ['Psychology', 'Learning'],
		poster: '/images/visualizations/memory-palace/social.png',
		posterAlt:
			'An isometric Calcutta house with twelve numbered landmarks for a memory palace route',
		href: '/blog/visualizations/a-place-for-every-idea',
		status: 'published'
	},
	'build-one-build-a-thousand': {
		id: 'build-one-build-a-thousand',
		title: 'Build One. Now Build a Thousand.',
		description:
			'Make a wooden phone stand, grow the order and discover the work behind a repeatable promise in a declared teaching model.',
		subjects: ['Design', 'Entrepreneurship'],
		poster: '/images/visualizations/build-one-build-a-thousand/social.png',
		posterAlt:
			'A dimensional wooden phone-stand workshop with cutting, assembly and packing areas, captured from the illustrative model',
		href: '/blog/visualizations/build-one-build-a-thousand',
		status: 'published'
	},
	'the-six-week-shadow': {
		id: 'the-six-week-shadow',
		title: 'The Six-Week Shadow of a Ten-Minute Idea',
		description:
			'Move a fictional lamp button and follow the work, waiting and parallel preparation before a revised batch can leave.',
		subjects: ['Design', 'Entrepreneurship'],
		poster: '/images/visualizations/the-six-week-shadow/social.png',
		posterAlt:
			'A desk lamp and foldout workshop with a ruler showing the modelled work and waiting caused by moving its button',
		href: '/blog/visualizations/the-six-week-shadow',
		status: 'published'
	},
	'the-museum-of-almost': {
		id: 'the-museum-of-almost',
		title: 'The Museum of Almost',
		description:
			'Open four fictional specimen drawers and separate what happened, what might explain it and what can be supported afterwards.',
		subjects: ['Design', 'Entrepreneurship'],
		poster: '/images/visualizations/the-museum-of-almost/social.png',
		posterAlt:
			'A four-drawer specimen cabinet labelled as a demonstration collection of fictional projects and evidence',
		href: '/blog/visualizations/the-museum-of-almost',
		status: 'published'
	},
	'the-patient-between-the-systems': {
		id: 'the-patient-between-the-systems',
		title: 'The Patient Between the Systems',
		description:
			'Follow one fictional patient through OpenHIE identity, terminology, permissions and a shared clinical record, including the points where an honest exchange must stop.',
		subjects: ['Healthcare', 'Computer Science'],
		poster: '/images/visualizations/openhie/openhie-social.png',
		posterAlt:
			'A dimensional exchange instrument with an identity indexing drum, terminology reference wheel, routing turntable and shared-record archive',
		href: '/blog/visualizations/the-patient-between-the-systems',
		status: 'published'
	},
	'the-shape-of-waiting': {
		id: 'the-shape-of-waiting',
		title: 'The Shape of Waiting: An Interactive Queue-Distribution Laboratory',
		description:
			'Change staffing and queue rules, follow the oldest ticket, and compare the same synthetic day through a replayable waiting receipt.',
		subjects: ['Statistics', 'Mathematics', 'Scientific Computing'],
		poster: '/images/visualizations/shape-of-waiting/shape-of-waiting-social.png',
		posterAlt:
			'A warm-paper queue laboratory with a curling line of teal, amber and red waiting tickets beside mean, median and tail-wait readouts',
		href: '/blog/visualizations/the-shape-of-waiting',
		status: 'published'
	},
	'the-music-of-missing-data': {
		id: 'the-music-of-missing-data',
		title: 'The Music of Missing Data: A Missingness-Pattern Explorer',
		description:
			'Change how measurements disappear, compare estimates and clearly marked imputations, and download a reproducible missingness fingerprint.',
		subjects: ['Statistics', 'Scientific Computing', 'Generative Art'],
		poster: '/images/visualizations/missing-data/missing-data-social.png',
		posterAlt:
			'A dropout-over-time fingerprint with a stepped dark frontier across a teal and coral participant-by-visit matrix, labelled 40 per cent missing and seed 1847',
		href: '/blog/visualizations/the-music-of-missing-data',
		status: 'published'
	},
	'the-piano-that-forgives': {
		id: 'the-piano-that-forgives',
		title: 'The Piano That Forgives: Painting Jazz with Probability',
		description:
			'Play an impressionist piano that guides each press towards a nearby jazz possibility, and see the exact probabilities behind every note.',
		subjects: ['Generative Art', 'Mathematics', 'Statistics'],
		poster: '/images/visualizations/probabilistic-piano/piano-social.jpg',
		posterAlt:
			'Painted ivory and violet piano keys floating over a moonlit pond, with nearby notes and their probabilities',
		href: '/blog/visualizations/the-piano-that-forgives',
		status: 'published'
	},
	'the-scale-elevator-from-ion-to-city': {
		id: 'the-scale-elevator-from-ion-to-city',
		title: 'The Scale Elevator — From Ion to City',
		description:
			'Follow oxygen through eleven scales, from a haem iron binding site to a fictional city supply network, and discover why a quantity needs a context.',
		subjects: ['Biology', 'Chemistry', 'Healthcare', 'Scientific Computing'],
		poster: '/images/visualizations/scale-elevator/scale-elevator-social.jpg',
		posterAlt:
			'Eleven illustrated views connect an iron binding site, haemoglobin, a membrane, a cell, tissue, a heart, a person, a bed, a ward, a hospital and a fictional city',
		href: '/blog/visualizations/the-scale-elevator-from-ion-to-city',
		status: 'published'
	},
	'hello-fragment': {
		...helloFragmentMetadata,
		href: '/blog/visualizations/hello-fragment-your-first-shader-from-scratch',
		status: 'published'
	},
	'ray-marching-cathedral': {
		...rayMarchingMetadata,
		href: '/blog/visualizations/ray-marching-fragment-shader-from-scratch',
		status: 'published'
	},
	'reaction-diffusion-atlas': {
		id: 'reaction-diffusion-atlas',
		title: 'The Chemistry That Draws Without a Hand: A Reaction–Diffusion Atlas',
		description:
			'Paint two virtual chemicals, cross the Gray–Scott feed–kill plane, inspect every PDE term, and test whether a pattern deserves belief.',
		subjects: ['Chemistry', 'Mathematics', 'Scientific Computing'],
		poster: '/images/reaction-diffusion-atlas.png',
		posterAlt:
			'A simulated Gray–Scott reaction–diffusion field in which pale spots divide and merge into branching labyrinths beside a small feed–kill parameter map',
		href: '/blog/visualizations/reaction-diffusion-atlas',
		status: 'published'
	},
	'belousov-zhabotinsky-laboratory': {
		id: 'belousov-zhabotinsky-laboratory',
		title: 'The Clock That Escaped Into Space: A Belousov–Zhabotinsky Laboratory',
		description:
			'An interactive WebGL laboratory for chemical clocks, target waves, spiral cores, and the crucial difference between BZ waves and Turing patterns.',
		subjects: ['Chemistry', 'Mathematics', 'Scientific Computing'],
		poster: '/images/visualizations/belousov-zhabotinsky/v2/bz-v2-visualization-card.png',
		posterAlt:
			'A luminous red and violet solver-generated Oregonator spiral curling through a circular dish beside the words Chemical waves with receipts',
		href: '/blog/visualizations/belousov-zhabotinsky-laboratory',
		status: 'published'
	},
	'prior-authorization-machine': {
		id: 'prior-authorization-machine',
		title:
			'The Prior Authorization Machine: a patient, an MRI, and the invisible decisions between them',
		description:
			'Follow one synthetic MRI request through portal, fax, CRD, DTR, PAS, three clocks, and four consequential failure paths.',
		subjects: ['Healthcare', 'Computer Science'],
		poster: '/images/visualizations/prior-authorization-machine.png',
		posterAlt:
			'A split prior-authorization journey for Maya Sen, comparing portal and fax work with a FHIR-enabled route across twelve milestones and three clocks',
		href: '/blog/visualizations/the-prior-authorization-machine',
		status: 'published'
	},
	'human-ai-icu-prediction-laboratory': {
		id: 'human-ai-icu-prediction-laboratory',
		title: 'Human + AI ICU Prediction Laboratory',
		description:
			'A wholly synthetic forecast laboratory showing when clinician–model probability ensembles improve—and when shared error or population shift defeats the average.',
		subjects: ['Healthcare', 'Statistics', 'Machine Learning'],
		poster:
			'/images/visualizations/human-ai-icu-prediction-laboratory/human-ai-icu-prediction-laboratory.webp',
		posterAlt:
			'Graphic labelled Synthetic educational simulation, with a blue circle-marked probability stream and amber square-marked stream entering a weighted mixer, a violet diamond-marked ensemble leaving it, and a small reliability diagonal',
		href: '/blog/visualizations/human-ai-icu-prediction-laboratory',
		status: 'published'
	},
	'the-profile-that-knows-almost-nothing-about-you': {
		id: 'the-profile-that-knows-almost-nothing-about-you',
		title: 'The Profile That Knows Almost Nothing About You',
		description:
			'Expose how broad claims, many guesses, direct echoes, and feedback can manufacture the feeling of personal insight.',
		subjects: ['Statistics'],
		poster:
			'/images/visualizations/barnum-lab/the-profile-that-knows-almost-nothing-about-you.webp',
		posterAlt:
			'An editorial profile card separating into labelled sentence fragments above a backstage assumption ledger',
		href: '/blog/visualizations/the-profile-that-knows-almost-nothing-about-you',
		status: 'published'
	},
	'the-strange-attractor-orchestra': {
		id: 'the-strange-attractor-orchestra',
		title: 'The Strange Attractor Orchestra: When Chaos Learns to Sing',
		description:
			'Strange attractors become audiovisual instruments as deterministic chaos passes through coherent noise and emerges as music in the browser.',
		subjects: ['Mathematics', 'Scientific Computing', 'Generative Art'],
		poster:
			'/images/visualizations/strange-attractor-orchestra/the-strange-attractor-orchestra.png',
		posterAlt:
			'A copper and mineral-cyan Langford attractor braided through a restrained curl-noise field on charcoal, with its faint canonical orbit still visible',
		href: '/blog/visualizations/the-strange-attractor-orchestra',
		status: 'published'
	},
	'the-living-aperture': {
		id: 'the-living-aperture',
		title: 'The Living Aperture: A Gastropod Shell Laboratory',
		description:
			'Grow deterministic shells aperture by aperture, sculpt logarithmic coiling and finite ornament, and inspect the boundary between geometry, kinematics, and reduced mechanics.',
		subjects: ['Biology', 'Mathematics', 'Scientific Computing', 'Generative Art'],
		poster: '/images/visualizations/gastropod-shell-lab/the-living-aperture.png',
		posterAlt:
			'The Living Aperture laboratory showing a cream-coloured variced shell between specimen drawers, a Three.js viewport, and mathematical sculpting controls',
		href: '/blog/visualizations/the-living-aperture',
		status: 'published'
	},
	'fertilization-calcium-clock': {
		id: 'fertilization-calcium-clock',
		title: 'Before You Had a Heartbeat, You Were a Rhythm',
		description:
			'Compare literature-based calcium waves and pulse trains across fertilization studies, with every measurement tied to its evidence and limits.',
		subjects: ['Biology', 'Scientific Computing'],
		poster: '/images/visualizations/fertilization-calcium-clock/fertilization-calcium-clock.svg',
		posterAlt:
			'A schematic calcium wave crossing an egg beside a luminous time-series trace with one large first rise and smaller repeated pulses',
		href: '/blog/visualizations/fertilization-calcium-clock',
		status: 'published'
	},
	'static-equilibrium-illusion': {
		id: 'static-equilibrium-illusion',
		title: 'The Static-Equilibrium Illusion: Life Refuses to Hold Still',
		description:
			'Open a time microscope, perturb delayed feedback, and test an ecological intervention while measurements, models, and disputed inferences remain visibly distinct.',
		subjects: ['Biology', 'Healthcare', 'Mathematics', 'Scientific Computing'],
		poster: '/images/visualizations/static-equilibrium-illusion/static-equilibrium-illusion.svg',
		posterAlt:
			'Editorial diagram in which a perturbed line returns, rings, and opens into a closed orbit beside the title The Static-Equilibrium Illusion',
		href: '/blog/visualizations/static-equilibrium-illusion',
		status: 'published'
	},
	'the-matrix-is-random': {
		id: 'the-matrix-is-random',
		title: 'The Matrix Is Random. Why Does It Have a Shape?',
		description:
			'Generate one seeded matrix, inspect its entries, spectrum and singular values, then watch circles, semicircles, ridges and signals emerge across an ensemble.',
		subjects: ['Mathematics', 'Statistics', 'Scientific Computing'],
		poster: '/images/visualizations/random-matrix-shape/the-matrix-is-random.png',
		posterAlt:
			'An interactive random-matrix instrument showing a blue-and-amber matrix heatmap, a circular cloud of complex eigenvalues and a descending singular-value profile',
		href: '/blog/visualizations/the-matrix-is-random-why-does-it-have-a-shape',
		status: 'published'
	},
	'the-meaning-connection-map': {
		id: 'the-meaning-connection-map',
		title: 'The Meaning & Connection Map: A Visual Encyclopedia of Ideas',
		description:
			'Explore a deeply interconnected map of 50+ ideas — probability, feedback loops, LLMs, Bayesian inference — with plain-English explanations and concrete examples.',
		subjects: ['Epistemology', 'Computer Science', 'Data Science', 'Systems Thinking'],
		poster: '/images/meaning-connection-map.png',
		posterAlt:
			'A dense, readable concept map showing 50+ ideas connected by 100+ labelled relationships against a dark background',
		href: '/blog/visualizations/the-meaning-connection-map',
		status: 'published'
	}
} satisfies Record<string, VisualizationSummary>;

export type RegisteredVisualizationId = keyof typeof visualizationSummaries;

export function isVisualizationId(id: string): id is VisualizationId {
	return id in visualizationLoaders;
}

export function isRegisteredVisualizationId(id: string): id is RegisteredVisualizationId {
	return id in visualizationSummaries;
}

export function isDedicatedShaderId(id: string): id is DedicatedShaderId {
	return id in dedicatedShaderLoaders;
}

export async function loadVisualization(id: string) {
	if (!isVisualizationId(id)) throw new Error(`Unknown visualization: ${id}`);
	return visualizationLoaders[id]();
}

export async function loadDedicatedShader(id: string) {
	if (!isDedicatedShaderId(id)) throw new Error(`Unknown dedicated shader: ${id}`);
	return dedicatedShaderLoaders[id]();
}

export function visualizationSummary(id: string) {
	return isRegisteredVisualizationId(id) ? visualizationSummaries[id] : null;
}
