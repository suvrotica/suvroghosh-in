import { describe, expect, it } from 'vitest';
import { MODEL_CATALOG, rankModels } from './models';
import type { PromptOntology, OntologyNode, OntologyRelation } from './types';
import { analyzePrompt } from './analysis';
import { projectOntology } from './projection';

function ontology(nodes: OntologyNode[] = [], relations: OntologyRelation[] = []): PromptOntology {
	return {
		schemaVersion: 1,
		source: { text: '', revision: 'test' },
		mode: 'local',
		language: 'en',
		nodes,
		relations,
		issues: []
	};
}
function entity(id: string, kind: OntologyNode['kind'] = 'object'): OntologyNode {
	return {
		id,
		label: id,
		kind,
		layer: 'subject',
		provenance: 'explicit',
		evidence: [],
		attributes: []
	};
}
function link(from: string, to: string, kind: OntologyRelation['kind']): OntologyRelation {
	return { id: `${from}-${to}`, from, to, label: kind, kind, provenance: 'explicit', evidence: [] };
}

describe('model eligibility and fit', () => {
	it('has a fixed catalog with separate notation and detail level', () => {
		expect(MODEL_CATALOG).toHaveLength(10);
		expect(new Set(MODEL_CATALOG.map((entry) => entry.id)).size).toBe(10);
		expect(MODEL_CATALOG.find((entry) => entry.id === 'class')).toMatchObject({
			family: 'UML structure',
			level: 'Conceptual / design'
		});
	});
	it('does not invent specialised structure for a creative concept', () => {
		const fits = rankModels(ontology([entity('robot', 'concept')]));
		expect(
			fits
				.filter((fit) => fit.eligible)
				.map((fit) => fit.id)
				.sort()
		).toEqual(['concept', 'mindmap']);
	});
	it('requires supported ordering, messages, and transitions independently', () => {
		const value = ontology([entity('a', 'action'), entity('b', 'action')]);
		expect(rankModels(value).find((fit) => fit.id === 'flowchart')?.eligible).toBe(false);
		value.relations.push(link('a', 'b', 'dependency'));
		expect(rankModels(value).find((fit) => fit.id === 'flowchart')?.eligible).toBe(true);
		expect(rankModels(value).find((fit) => fit.id === 'sequence')?.eligible).toBe(false);
		expect(rankModels(value).find((fit) => fit.id === 'state')?.eligible).toBe(false);
	});
	it('requires both database target and typed columns for a physical view', () => {
		const users = entity('users', 'table');
		users.attributes = [
			{ name: 'id', dataType: 'UUID', primaryKey: true, evidence: [], provenance: 'explicit' }
		];
		const value = ontology([users]);
		expect(rankModels(value).find((fit) => fit.id === 'logical')?.eligible).toBe(true);
		expect(rankModels(value).find((fit) => fit.id === 'physical')?.eligible).toBe(false);
		value.databaseTarget = 'PostgreSQL';
		expect(rankModels(value)[0].id).toBe('physical');
	});
	it('requires a system boundary and actor goal for use cases', () => {
		const value = ontology(
			[entity('customer', 'actor'), entity('order', 'action')],
			[link('customer', 'order', 'association')]
		);
		expect(rankModels(value).find((fit) => fit.id === 'usecase')?.eligible).toBe(false);
		value.nodes.push(entity('shop', 'system'));
		expect(rankModels(value).find((fit) => fit.id === 'usecase')?.eligible).toBe(false);
		value.relations.push(link('shop', 'order', 'contains'));
		expect(rankModels(value).find((fit) => fit.id === 'usecase')?.eligible).toBe(true);
	});
	it('scores only subject connections retained by the concept map', () => {
		const source = analyzePrompt(
			'Write a kind bedtime story about a robot gardener for children aged eight.'
		);
		const fits = rankModels(source);
		expect(projectOntology(source, 'concept').nodes).toHaveLength(1);
		expect(projectOntology(source, 'concept').edges).toHaveLength(0);
		expect(fits.find((fit) => fit.id === 'concept')!.score).toBeLessThan(
			fits.find((fit) => fit.id === 'mindmap')!.score
		);
		expect(fits.find((fit) => fit.id === 'concept')!.reason).toContain(
			'0 supported subject connections'
		);
	});
	it('penalises inferred structure and details omitted from a specialised view', () => {
		const source = ontology(
			[entity('a', 'action'), entity('b', 'action')],
			[link('a', 'b', 'dependency')]
		);
		const originalScore = rankModels(source).find((fit) => fit.id === 'flowchart')!.score;
		source.relations[0].provenance = 'inferred';
		const inferred = rankModels(source).find((fit) => fit.id === 'flowchart')!;
		expect(inferred.eligible).toBe(true);
		expect(inferred.score).toBeLessThan(originalScore);
		expect(inferred.reason).toContain('inferred structure');
		source.nodes.push({ ...entity('tone', 'constraint'), layer: 'instruction' });
		expect(rankModels(source).find((fit) => fit.id === 'flowchart')!.score).toBeLessThan(
			inferred.score
		);
	});
	it('reduces a partial physical model score for missing types and identifiers', () => {
		const users = entity('users', 'table');
		users.attributes = [
			{ name: 'id', dataType: 'UUID', primaryKey: true, provenance: 'explicit', evidence: [] }
		];
		const source = { ...ontology([users]), databaseTarget: 'PostgreSQL' };
		const completeScore = rankModels(source).find((fit) => fit.id === 'physical')!.score;
		users.attributes.push({ name: 'email', provenance: 'explicit', evidence: [] });
		delete users.attributes[0].primaryKey;
		users.attributes[0].name = 'external_reference';
		const partial = rankModels(source).find((fit) => fit.id === 'physical')!;
		expect(partial.eligible).toBe(true);
		expect(partial.score).toBeLessThan(completeScore);
		expect(partial.reason).toContain('missing model details');
	});
	it('does not accept arbitrary relationship endpoints as model-specific evidence', () => {
		const source = ontology(
			[entity('request', 'task'), entity('object', 'object')],
			[
				link('request', 'object', 'dependency'),
				link('request', 'object', 'transition'),
				link('request', 'object', 'message')
			]
		);
		for (const model of ['flowchart', 'sequence', 'state'])
			expect(rankModels(source).find((fit) => fit.id === model)?.eligible).toBe(false);
	});
	it('keeps an empty corrected ontology safe in every projection', () => {
		for (const model of MODEL_CATALOG) {
			const diagram = projectOntology(ontology(), model.id);
			expect(diagram.nodes).toEqual([]);
			expect(diagram.edges).toEqual([]);
			expect(Number.isFinite(diagram.width) && Number.isFinite(diagram.height)).toBe(true);
		}
	});
});
