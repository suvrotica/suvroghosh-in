import type { VisualizationDefinition } from './types';
import { helloFragmentMetadata } from './experiments/hello-fragment/metadata';

const visualizationLoaders = {
	'hello-fragment': () =>
		import('./experiments/hello-fragment').then((module) => module.helloFragment)
} satisfies Record<string, () => Promise<VisualizationDefinition>>;

export type VisualizationId = keyof typeof visualizationLoaders;

export const visualizationSummaries = {
	'hello-fragment': helloFragmentMetadata
} satisfies Record<VisualizationId, typeof helloFragmentMetadata>;

export function isVisualizationId(id: string): id is VisualizationId {
	return id in visualizationLoaders;
}

export async function loadVisualization(id: string) {
	if (!isVisualizationId(id)) throw new Error(`Unknown visualization: ${id}`);
	return visualizationLoaders[id]();
}

export function visualizationSummary(id: string) {
	return isVisualizationId(id) ? visualizationSummaries[id] : null;
}
