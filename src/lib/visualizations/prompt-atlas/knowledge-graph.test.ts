import { describe, expect, it } from 'vitest';
import { createKnowledgeGraph } from './knowledge-graph';
import { projectOntology } from './projection';
import type { PromptOntology } from './types';

function fixture(): PromptOntology {
	const text = 'Write about a robot. The robot waters the garden.';
	const span = (quote: string) => {
		const start = text.indexOf(quote);
		return [{ start, end: start + quote.length, quote }];
	};
	return {
		schemaVersion: 1,
		source: { text, revision: 'kg-fixture-1' },
		mode: 'local',
		language: 'en',
		nodes: [
			{
				id: 'task',
				label: 'Write',
				kind: 'task',
				layer: 'instruction',
				provenance: 'explicit',
				evidence: span('Write'),
				attributes: []
			},
			{
				id: 'robot',
				label: 'robot',
				kind: 'actor',
				layer: 'subject',
				provenance: 'explicit',
				evidence: span('robot'),
				attributes: [
					{ name: 'nickname', value: 'Leaf', provenance: 'user-confirmed', evidence: [] }
				]
			},
			{
				id: 'garden',
				label: 'garden',
				kind: 'object',
				layer: 'subject',
				provenance: 'inferred',
				rationale: 'Interpreted the named garden as the object of the watering action.',
				evidence: span('garden'),
				attributes: []
			}
		],
		relations: [
			{
				id: 'about',
				from: 'task',
				to: 'robot',
				label: 'about',
				kind: 'association',
				provenance: 'explicit',
				evidence: span('Write about a robot.')
			},
			{
				id: 'waters',
				from: 'robot',
				to: 'garden',
				label: 'waters',
				kind: 'association',
				provenance: 'explicit',
				evidence: span('The robot waters the garden.')
			}
		],
		issues: []
	};
}

describe('knowledge graph', () => {
	it('projects every layer and relationship without adding semantic edges for groups', () => {
		const source = fixture();
		const graph = projectOntology(source, 'knowledge-graph');
		expect(
			graph.nodes
				.filter((node) => node.sourceId)
				.map((node) => node.sourceId)
				.sort()
		).toEqual(['garden', 'robot', 'task']);
		expect(graph.edges.map((edge) => edge.sourceId).sort()).toEqual(['about', 'waters']);
		expect(graph.nodes.filter((node) => node.kind === 'boundary')).toHaveLength(3);
		expect(projectOntology(source, 'concept').nodes.some((node) => node.sourceId === 'task')).toBe(
			false
		);
	});
	it('routes reciprocal links separately and keeps their labels within the canvas', () => {
		const source = fixture();
		source.relations.push({
			...source.relations[1],
			id: 'watered-by',
			from: 'garden',
			to: 'robot',
			label: 'is watered by',
			provenance: 'inferred',
			rationale: 'An inverse reading of the stated watering relationship.'
		});
		const graph = projectOntology(source, 'knowledge-graph');
		const forwards = graph.edges.find((edge) => edge.sourceId === 'waters')!;
		const backwards = graph.edges.find((edge) => edge.sourceId === 'watered-by')!;
		expect(forwards.points).not.toEqual([...backwards.points].reverse());
		expect(forwards.points[1]).not.toEqual(backwards.points[1]);
		for (const edge of graph.edges)
			for (const point of edge.points) {
				expect(point.x).toBeGreaterThanOrEqual(0);
				expect(point.y).toBeGreaterThanOrEqual(0);
				expect(point.x).toBeLessThanOrEqual(graph.width);
				expect(point.y).toBeLessThanOrEqual(graph.height);
			}
	});
	it('emits stable, resolvable generic relation entities with source omitted by default', async () => {
		const source = fixture();
		const first = await createKnowledgeGraph(source);
		const second = await createKnowledgeGraph(source);
		expect(second).toEqual(first);
		const records = first['@graph'] as Record<string, unknown>[];
		const ids = new Set(records.map((record) => record['@id']));
		expect(records[0].sourceIncluded).toBe(false);
		expect(records[0]).not.toHaveProperty('sourceText');
		for (const record of records) {
			expect(record).not.toHaveProperty('evidence');
			expect(record['@id']).toMatch(/^urn:prompt-atlas:sha256:[a-f0-9]{64}/);
		}
		expect(new Set(records.map((record) => record.provenance).filter(Boolean))).toEqual(
			new Set(['explicit', 'inferred', 'user-confirmed'])
		);
		const relations = records.filter((record) => record['@type'] === 'atlas:Relation');
		expect(relations).toHaveLength(2);
		for (const relation of relations) {
			expect(ids.has((relation.from as Record<string, unknown>)['@id'])).toBe(true);
			expect(ids.has((relation.to as Record<string, unknown>)['@id'])).toBe(true);
		}
		expect(relations.map((relation) => relation.name)).toEqual(['about', 'waters']);
	});
	it('includes exact source and provenance only after explicit source inclusion', async () => {
		const source = fixture();
		const graph = await createKnowledgeGraph(source, true);
		const records = graph['@graph'] as Record<string, unknown>[];
		expect(records[0].sourceText).toBe(source.source.text);
		const relation = records.find((record) => record.name === 'waters')!;
		expect(relation.provenance).toBe('explicit');
		expect(relation.evidence).toEqual(source.relations[1].evidence);
		expect(records.find((record) => record.name === 'nickname')!.provenance).toBe('user-confirmed');
	});
	it('rejects dangling graph references rather than exporting them', async () => {
		const source = fixture();
		source.relations[0].to = 'missing';
		await expect(createKnowledgeGraph(source)).rejects.toThrow();
	});
});
