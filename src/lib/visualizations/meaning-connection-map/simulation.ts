import type { SimulationLinkDatum } from 'd3';
import type { ConceptEdge, ConceptNode } from './types';

export type SimulationEdge = Omit<ConceptEdge, 'source' | 'target'> & SimulationLinkDatum<ConceptNode>;

/** D3 replaces endpoint IDs with nodes; keep that mutation out of the authored graph and UI. */
export function createSimulationEdges(edges: readonly ConceptEdge[]): SimulationEdge[] {
  return edges.map(edge => ({ ...edge }));
}
