import { describe, expect, it } from 'vitest';
import { forceLink, forceSimulation } from 'd3';
import { EDGES, NODES } from './graph-data';
import { RELATIONSHIP_LABELS, type ConceptNode } from './types';
import { createSimulationEdges, type SimulationEdge } from './simulation';

describe('meaning-map graph and simulation', () => {
  it('defines a label for every authored relationship, including detects', () => {
    for (const edge of EDGES) expect(RELATIONSHIP_LABELS[edge.relationship]).toBeTruthy();
    expect(RELATIONSHIP_LABELS.detects).toBe('detects');
  });
  it('references existing nodes at both endpoints', () => {
    const ids = new Set(NODES.map(node => node.id));
    for (const edge of EDGES) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });
  it('keeps authored IDs and connection lookup intact after D3 initializes and ticks', () => {
    const before = EDGES.map(edge => ({ ...edge }));
    const links = createSimulationEdges(EDGES);
    const simulation = forceSimulation<ConceptNode>(NODES.map(node => ({ ...node }))).stop();
    try {
      simulation.force('link', forceLink<ConceptNode, SimulationEdge>(links).id(node => node.id));
      simulation.tick(2);
      expect(EDGES).toEqual(before);
      expect(links[0]).not.toBe(EDGES[0]);
      expect(typeof links[0].source).toBe('object');
      expect(typeof links[0].target).toBe('object');
      const connected = EDGES.filter(edge => edge.source === 'cross-validation' || edge.target === 'cross-validation');
      expect(connected.some(edge => edge.target === 'overfitting' && edge.relationship === 'detects')).toBe(true);
      const second = createSimulationEdges(EDGES);
      expect(second).toEqual(before);
      expect(second[0]).not.toBe(links[0]);
    } finally {
      simulation.stop();
    }
  });
});
