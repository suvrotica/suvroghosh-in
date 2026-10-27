import { describe, expect, it } from 'vitest';
import { mapLayout } from './layout';
import { DEFAULT_SETTINGS, type AnalysisResult } from './types';

function fixture(): AnalysisResult {
	const concepts = Array.from({ length: 100 }, (_, index) => ({
		id: `concept-${index}`,
		label: index === 99 ? 'epistemic bridge' : `Concept ${index}`,
		count: 200 - index,
		sources: {},
		evidence: [],
		phrase: false,
		score: 200 - index,
		degree: 0,
		community: index < 50 ? 0 : 1,
		targetCount: 200 - index,
		referenceCount: 0
	}));
	return {
		version: 1,
		concepts,
		edges: [],
		findings: [],
		settings: DEFAULT_SETTINGS,
		words: 1000,
		totalTerms: 100,
		totalEdges: 0,
		analysedAt: '',
		scope: '',
		sources: [],
		topics: [0, 1].map((id) => ({
			id,
			label: `Topic ${id}`,
			terms: concepts.filter((n) => n.community === id).map((n) => n.id),
			count: 100,
			sources: {},
			targetCount: 100,
			referenceCount: 0
		}))
	};
}

describe('map projection keeps requested evidence visible', () => {
	it('promotes a low-ranked search result without modifying analytical counts', () => {
		const result = fixture();
		expect(mapLayout(result, 10, null).nodes.some((n) => n.id === 'concept-99')).toBe(false);
		const projection = mapLayout(result, 10, null, [], { search: 'EPISTEMIC' });
		expect(projection.nodes.some((n) => n.id === 'concept-99')).toBe(true);
		expect(projection.nodes).toHaveLength(10);
		expect(result.concepts).toHaveLength(100);
		expect(result.concepts[0].id).toBe('concept-0');
	});
	it('keeps a selected concept visible across an existing topic filter', () => {
		const projection = mapLayout(fixture(), 10, 0, [], { selected: 'concept-99' });
		expect(projection.nodes.some((n) => n.id === 'concept-99')).toBe(true);
		expect(projection.outsideTopic).toBe(1);
	});
	it('retains every explicit investigation endpoint even at a smaller display density', () => {
		const projection = mapLayout(fixture(), 1, 0, [], { focused: ['concept-98', 'concept-99'] });
		expect(projection.nodes.map((n) => n.id).sort()).toEqual(['concept-98', 'concept-99']);
		expect(projection.outsideTopic).toBe(2);
	});
});
