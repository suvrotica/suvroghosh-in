import { describe, expect, it } from 'vitest';
import { projectOntology } from './projection';
import { analyzePrompt } from './analysis';
import { examples } from './examples';
import type { OntologyNode, PromptOntology } from './types';

const item = (id: string, kind: OntologyNode['kind']): OntologyNode => ({
	id,
	label: id,
	kind,
	layer: 'subject',
	provenance: 'explicit',
	evidence: [],
	attributes: []
});
const value = (): PromptOntology => ({
	schemaVersion: 1,
	source: { text: '', revision: 'test' },
	mode: 'local',
	language: 'en',
	nodes: [item('Customer', 'actor'), item('Service', 'system'), item('Order', 'object')],
	relations: [
		{
			id: 'message1',
			from: 'Customer',
			to: 'Service',
			kind: 'message',
			label: 'submits order',
			provenance: 'explicit',
			evidence: []
		},
		{
			id: 'owns',
			from: 'Customer',
			to: 'Order',
			kind: 'owns',
			label: 'owns',
			cardinality: 'many',
			provenance: 'explicit',
			evidence: []
		}
	],
	issues: []
});

describe('ontology projection', () => {
	it('builds a true tree for mindmaps and retains cross-links in the concept map', () => {
		const source = value();
		const map = projectOntology(source, 'mindmap');
		expect(map.nodes.some((node) => node.id === 'atlas-root')).toBe(true);
		expect(map.edges).toHaveLength(map.nodes.length - 1);
		expect(projectOntology(source, 'concept').edges.some((edge) => edge.id === 'owns')).toBe(true);
	});
	it('collapses only the selected branch, leaving the ontology untouched', () => {
		const source = value();
		const before = JSON.stringify(source);
		const map = projectOntology(source, 'mindmap', new Set(['group:actor']));
		expect(map.nodes.find((node) => node.id === 'Customer')).toBeUndefined();
		expect(map.nodes.find((node) => node.id === 'Service')).toBeDefined();
		expect(JSON.stringify(source)).toBe(before);
	});
	it('lays out sequence participants and horizontal messages distinctly', () => {
		const diagram = projectOntology(value(), 'sequence');
		expect(diagram.nodes.every((node) => node.kind === 'participant')).toBe(true);
		expect(diagram.edges).toHaveLength(1);
		expect(diagram.edges[0].points[0].y).toBe(diagram.edges[0].points[1].y);
		expect(diagram.edges[0].label).toContain('submits order');
	});
	it('keeps a rejected model empty with the missing-evidence explanation', () => {
		const diagram = projectOntology(value(), 'physical');
		expect(diagram.nodes).toEqual([]);
		expect(diagram.notes[0]).toContain('database target');
	});
	it('preserves explicit data types and keys without synthesising others', () => {
		const source = value();
		source.databaseTarget = 'PostgreSQL';
		source.nodes[2].kind = 'table';
		source.nodes[2].attributes = [
			{ name: 'id', dataType: 'UUID', primaryKey: true, provenance: 'explicit', evidence: [] }
		];
		const diagram = projectOntology(source, 'physical');
		expect(diagram.nodes.find((node) => node.id === 'Order')?.lines?.join(' ')).toContain(
			'id: UUID [PK]'
		);
		expect(diagram.nodes.find((node) => node.id === 'Customer')?.lines).toEqual([]);
	});
	it('renders the published examples with distinct, supported projections', () => {
		const expected = {
			workflow: 'flowchart',
			states: 'state',
			ownership: 'conceptual-er',
			database: 'physical',
			sequence: 'sequence',
			usecase: 'usecase'
		} as const;
		for (const [id, model] of Object.entries(expected)) {
			const example = examples.find((candidate) => candidate.id === id)!;
			const ontology = analyzePrompt(example.text);
			const diagram = projectOntology(ontology, model);
			expect(diagram.nodes.length, `${id} must have a working ${model} diagram`).toBeGreaterThan(0);
			expect(
				diagram.edges.every(
					(edge) =>
						diagram.nodes.some((node) => node.id === edge.from) &&
						diagram.nodes.some((node) => node.id === edge.to)
				)
			).toBe(true);
		}
	});
	it('renders guards as decisions and routes workflow branches through them', () => {
		const source = analyzePrompt(examples.find((entry) => entry.id === 'workflow')!.text);
		const diagram = projectOntology(source, 'flowchart');
		const decisions = diagram.nodes.filter((node) => node.shape === 'diamond');
		expect(decisions.map((node) => node.label).sort()).toEqual(['approved', 'declined']);
		for (const decision of decisions) {
			expect(diagram.edges.some((edge) => edge.to === decision.id)).toBe(true);
			expect(diagram.edges.some((edge) => edge.from === decision.id)).toBe(true);
		}
	});
	it('renders explicit foreign keys as table connectors without inventing references', () => {
		const source = analyzePrompt(examples.find((entry) => entry.id === 'database')!.text);
		const diagram = projectOntology(source, 'physical');
		expect(diagram.edges.some((edge) => edge.label.includes('owner_id → users.id'))).toBe(true);
		expect(diagram.edges).toHaveLength(1);
		expect(diagram.edges[0].sourceId).toBe(source.relations[0].id);
	});
	it('keeps one fallback connector for old sessions without canonical foreign-key relations', () => {
		const source = analyzePrompt(examples.find((entry) => entry.id === 'database')!.text);
		source.relations = [];
		for (const model of ['physical', 'logical'] as const) {
			const diagram = projectOntology(source, model);
			expect(diagram.edges.filter((edge) => edge.id.startsWith('fk:'))).toHaveLength(1);
		}
	});
});
