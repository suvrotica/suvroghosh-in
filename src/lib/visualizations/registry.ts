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
