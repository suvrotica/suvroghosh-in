import type { SimulationLinkDatum } from 'd3';
import type { ConceptEdge, ConceptNode, NodeCategory } from './types';

export type SimulationEdge = Omit<ConceptEdge, 'source' | 'target'> &
	SimulationLinkDatum<ConceptNode>;

/** D3 replaces endpoint IDs with nodes; keep that mutation out of the authored graph and UI. */
export function createSimulationEdges(edges: readonly ConceptEdge[]): SimulationEdge[] {
	return edges.map((edge) => ({ ...edge }));
}

/** Search and category filters intersect; selection never makes a filtered node visible. */
export function visibleMeaningNodeIds(
	nodes: readonly ConceptNode[],
	categories: ReadonlySet<NodeCategory>,
	query: string
): Set<string> {
	const term = query.trim().toLowerCase();
	return new Set(
		nodes
			.filter(
				(node) =>
					categories.has(node.category) &&
					(!term || `${node.label} ${node.explanation}`.toLowerCase().includes(term))
			)
			.map((node) => node.id)
	);
}

export function connectedMeaningNodeIds(edges: readonly ConceptEdge[], id: string): Set<string> {
	const connected = new Set([id]);
	for (const edge of edges) {
		if (edge.source === id || edge.target === id) {
			connected.add(edge.source);
			connected.add(edge.target);
		}
	}
	return connected;
}
