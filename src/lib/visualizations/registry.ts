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
