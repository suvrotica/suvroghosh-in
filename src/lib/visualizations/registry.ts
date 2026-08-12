import type { VisualizationDefinition, VisualizationSummary } from './types';
import { helloFragmentMetadata } from './experiments/hello-fragment/metadata';

const visualizationLoaders = {
	'hello-fragment': () =>
		import('./experiments/hello-fragment').then((module) => module.helloFragment)
} satisfies Record<string, () => Promise<VisualizationDefinition>>;

export type VisualizationId = keyof typeof visualizationLoaders;

export const visualizationSummaries = {
	'hello-fragment': {
		...helloFragmentMetadata,
		href: '/blog/visualizations/hello-fragment-your-first-shader-from-scratch',
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
	}
} satisfies Record<string, VisualizationSummary>;

export type RegisteredVisualizationId = keyof typeof visualizationSummaries;

export function isVisualizationId(id: string): id is VisualizationId {
	return id in visualizationLoaders;
}

export function isRegisteredVisualizationId(id: string): id is RegisteredVisualizationId {
	return id in visualizationSummaries;
}

export async function loadVisualization(id: string) {
	if (!isVisualizationId(id)) throw new Error(`Unknown visualization: ${id}`);
	return visualizationLoaders[id]();
}

export function visualizationSummary(id: string) {
	return isRegisteredVisualizationId(id) ? visualizationSummaries[id] : null;
}
