import { describe, expect, it } from 'vitest';
import { mapConnections, mapLabels, mapLayout, rectanglesOverlap } from './layout';
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
	it('keeps search scoped to the active topic, matching the Concepts list', () => {
		const projection = mapLayout(fixture(), 10, 0, [], { search: 'epistemic' });
		expect(projection.searchMatches).toBe(0);
		expect(projection.nodes.every((node) => node.community === 0)).toBe(true);
	});
	it('retains every explicit investigation endpoint even at a smaller display density', () => {
		const projection = mapLayout(fixture(), 1, 0, [], { focused: ['concept-98', 'concept-99'] });
		expect(projection.nodes.map((n) => n.id).sort()).toEqual(['concept-98', 'concept-99']);
		expect(projection.outsideTopic).toBe(2);
	});
});

function largeFixture(): AnalysisResult {
	const result = fixture();
	result.concepts = Array.from({ length: 3600 }, (_, index) => ({
		...result.concepts[0],
		id: `concept-${index}`,
		label: `Protocol concept ${index} with a detailed explanatory heading`,
		community: Math.floor(index / 60),
		score: index < 60 ? 100_000 - index : 3600 - index,
		count: 3600 - index
	}));
	result.topics = Array.from({ length: 60 }, (_, id) => ({
		...result.topics[0],
		id,
		label: `Protocol topic ${id} with a very long, descriptive title`,
		terms: result.concepts.filter((node) => node.community === id).map((node) => node.id)
	}));
	result.totalTerms = result.concepts.length;
	return result;
}

describe('large-corpus overview is a disclosed display projection', () => {
	it('represents multiple topics without letting a dominant topic consume the overview', () => {
		const result = largeFixture();
		const projection = mapLayout(result, 140, null);
		expect(projection.nodes).toHaveLength(140);
		expect(projection.islands).toHaveLength(12);
		expect(projection.totalTopics).toBe(60);
		for (const island of projection.islands)
			expect(
				projection.nodes.filter((node) => node.community === island.id).length
			).toBeGreaterThanOrEqual(3);
		expect(result.concepts).toHaveLength(3600);
		expect(result.topics).toHaveLength(60);
	});
	it('includes every concept and topic in All concepts, including on narrow screens', () => {
		const result = largeFixture();
		const overview = mapLayout(result, 140, null, [], { maxTopics: 4 });
		expect(overview.islands).toHaveLength(4);
		const all = mapLayout(result, 0, null, [], { maxTopics: 4 });
		expect(all.all).toBe(true);
		expect(all.nodes).toHaveLength(3600);
		expect(all.islands).toHaveLength(60);
		expect(new Set(all.nodes.map((node) => node.id)).size).toBe(3600);
	});
	it('keeps a small corpus responsive until All concepts is explicitly selected', () => {
		const result = largeFixture();
		result.concepts = result.concepts.filter((_, index) => index % 60 < 7 && index < 480);
		result.topics = result.topics.slice(0, 8).map((topic) => ({
			...topic,
			terms: result.concepts.filter((node) => node.community === topic.id).map((node) => node.id)
		}));
		const balanced = mapLayout(result, 140, null, [], { maxTopics: 4 });
		expect(balanced.all).toBe(false);
		expect(balanced.islands).toHaveLength(4);
		const all = mapLayout(result, 0, null, [], { maxTopics: 4 });
		expect(all.nodes).toHaveLength(56);
		expect(all.islands).toHaveLength(8);
	});
	it('promotes otherwise omitted search, selected, investigation and pinned topics', () => {
		const result = largeFixture();
		const projection = mapLayout(result, 140, null, ['concept-3420'], {
			selected: 'concept-3599',
			focused: ['concept-3539'],
			search: 'concept 3479 ',
			maxTopics: 4
		});
		for (const id of ['concept-3599', 'concept-3539', 'concept-3479', 'concept-3420'])
			expect(projection.nodes.some((node) => node.id === id)).toBe(true);
		expect(projection.searchMatches).toBe(1);
		expect(projection.visibleMatches).toBe(1);
	});
	it('retains a complete single-topic view and finite geometry', () => {
		const result = largeFixture();
		const projection = mapLayout(result, 140, 59);
		expect(projection.nodes).toHaveLength(60);
		expect(projection.islands).toHaveLength(1);
		for (const node of projection.nodes) {
			expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
			expect(node.r).toBeGreaterThan(0);
		}
	});
	it('places nonoverlapping readable labels even when every displayed node matches a search', () => {
		const projection = mapLayout(largeFixture(), 140, null, [], { maxTopics: 4 });
		const labels = mapLabels(projection, (text, size) => Array.from(text).length * size * 0.55, {
			scale: 0.4,
			search: 'Protocol',
			highlight: projection.nodes[0].id
		});
		expect(labels.some((label) => label.id === projection.nodes[0].id)).toBe(true);
		expect(labels.some((label) => label.kind === 'topic')).toBe(true);
		for (let i = 0; i < labels.length; i++) {
			expect(labels[i].fontSize * 0.4).toBeGreaterThanOrEqual(11);
			for (let j = i + 1; j < labels.length; j++)
				expect(rectanglesOverlap(labels[i], labels[j])).toBe(false);
		}
	});
	it('bounds huge-token label measurement while retaining the original concept', () => {
		const result = fixture();
		result.concepts[0].label = 'x'.repeat(100_000);
		const projection = mapLayout(result, 70, null);
		let longestMeasurement = 0;
		const labels = mapLabels(
			projection,
			(text, size) => {
				longestMeasurement = Math.max(longestMeasurement, text.length);
				return text.length * size * 0.55;
			},
			{ highlight: 'concept-0' }
		);
		expect(longestMeasurement).toBeLessThanOrEqual(513);
		expect(labels.find((label) => label.id === 'concept-0')?.text).toContain('…');
		expect(result.concepts[0].label).toHaveLength(100_000);
	});
	it('keeps type at a readable screen size when zooming into All concepts', () => {
		const result = largeFixture();
		const projection = mapLayout(result, 0, null);
		const labels = mapLabels(projection, (text, size) => text.length * size * 0.55, {
			scale: 0.4,
			zoom: 12,
			highlight: projection.nodes[0].id
		});
		expect(labels.length).toBeGreaterThan(0);
		for (const label of labels) {
			expect(label.fontSize * 0.4 * 12).toBeGreaterThanOrEqual(11);
			expect(label.fontSize * 0.4 * 12).toBeLessThan(14);
		}
	});
});

describe('connection display preserves exploration', () => {
	it('declutters a dense graph while keeping every node connected and all selected-node edges', () => {
		const result = fixture();
		const nodes = mapLayout(result, 25, 0).nodes;
		result.edges = nodes.flatMap((a, i) =>
			nodes.slice(i + 1).map((b, j) => ({
				id: `${a.id}|${b.id}`,
				source: a.id,
				target: b.id,
				count: 100 - j,
				weight: 1 / (j + 1),
				sources: {},
				evidence: []
			}))
		);
		const overview = mapConnections(result.edges, nodes);
		expect(overview.total).toBe(300);
		expect(overview.edges.length).toBeLessThan(100);
		const seen = new Set([nodes[0].id]);
		for (let i = 0; i < nodes.length; i++)
			for (const edge of overview.edges) {
				if (seen.has(edge.source)) seen.add(edge.target);
				if (seen.has(edge.target)) seen.add(edge.source);
			}
		expect(seen.size).toBe(nodes.length);
		const selected = nodes[12].id;
		const focused = mapConnections(result.edges, nodes, selected);
		expect(
			focused.edges.filter((edge) => edge.source === selected || edge.target === selected)
		).toHaveLength(24);
		expect(result.edges).toHaveLength(300);
	});
});
