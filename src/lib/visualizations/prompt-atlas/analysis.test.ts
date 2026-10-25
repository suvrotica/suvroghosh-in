import { describe, expect, it } from 'vitest';
import { analyzePrompt } from './analysis';
import { examples } from './examples';
import { MAX_CODE_POINTS, MAX_NODES } from './types';
import { validateOntology } from './validation';
import { rankModels } from './models';
import { projectOntology } from './projection';

describe('Prompt Atlas local ontology', () => {
	it('has an honest empty result and deterministic source revisions', () => {
		expect(analyzePrompt('').nodes).toEqual([]);
		expect(analyzePrompt('a thought')).toEqual(analyzePrompt('a thought'));
		expect(analyzePrompt('a thought').mode).toBe('local');
	});
	it('separates the creative instruction from subject and requested output', () => {
		const result = analyzePrompt(
			'Write a kind bedtime story about a robot gardener for children aged eight.'
		);
		expect(result.nodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'task', layer: 'instruction' }),
				expect.objectContaining({ kind: 'output', label: 'story', layer: 'instruction' }),
				expect.objectContaining({ label: 'robot gardener', kind: 'concept', layer: 'subject' }),
				expect.objectContaining({ kind: 'audience', label: 'children aged eight' })
			])
		);
		expect(result.nodes).toContainEqual(
			expect.objectContaining({ kind: 'constraint', label: 'kind' })
		);
		expect(result.nodes.some((node) => node.kind === 'table' || node.kind === 'state')).toBe(false);
		expect(result.relations.some((edge) => edge.kind === 'message')).toBe(false);
	});
	it('extracts supported workflow and preserves the missing alternative', () => {
		const result = analyzePrompt(
			'Customer submits an order. Then the service validates payment. If approved, the warehouse ships the order.'
		);
		expect(result.nodes.filter((node) => node.kind === 'action')).toHaveLength(3);
		expect(result.relations.some((edge) => edge.kind === 'dependency')).toBe(true);
		expect(
			result.relations.some((edge) => edge.kind === 'condition' && edge.guard === 'approved')
		).toBe(true);
		expect(result.issues.some((issue) => /alternative outcome/i.test(issue.description))).toBe(
			true
		);
		expect(result.nodes.map((node) => node.label).join(' ')).not.toMatch(
			/stripe|paypal|payment gateway/i
		);
	});
	it('does not manufacture execution order from a list of sentences', () => {
		const result = analyzePrompt(
			'Customer submits an order. Service validates payment. Warehouse ships the order.'
		);
		expect(result.relations.filter((edge) => edge.kind === 'dependency')).toHaveLength(0);
		expect(result.issues.some((issue) => /order is not explicit/i.test(issue.description))).toBe(
			true
		);
	});
	it('represents only explicitly named states and transitions', () => {
		const result = analyzePrompt(
			'Draft becomes Reviewed on approval. Reviewed becomes Published on release.'
		);
		expect(result.nodes.filter((node) => node.kind === 'state').map((node) => node.label)).toEqual([
			'Draft',
			'Reviewed',
			'Published'
		]);
		expect(
			result.relations.filter((edge) => edge.kind === 'transition').map((edge) => edge.label)
		).toEqual(['approval', 'release']);
	});
	it('preserves ownership cardinality without making database columns', () => {
		const result = analyzePrompt('Users can own many projects; each project has one owner.');
		const ownership = result.relations.find((edge) => edge.kind === 'owns');
		expect(ownership?.cardinality).toMatch(/one owner.*many.*minimum unspecified/);
		expect(result.nodes.flatMap((node) => node.attributes)).toHaveLength(0);
		expect(result.databaseTarget).toBeUndefined();
	});
	it('reads physical types and constraints only from explicit schema vocabulary', () => {
		const result = analyzePrompt(
			'PostgreSQL: users have UUID id primary key and unique email text.'
		);
		expect(result.databaseTarget).toBe('PostgreSQL');
		expect(result.nodes.find((node) => node.kind === 'table')?.attributes).toEqual([
			expect.objectContaining({ name: 'id', dataType: 'UUID', primaryKey: true }),
			expect.objectContaining({ name: 'email', dataType: 'text', unique: true })
		]);
	});
	it('keeps foreign key references intact and does not guess omitted types', () => {
		const result = analyzePrompt(
			'PostgreSQL: projects have UUID id primary key and owner_id UUID references users.id.'
		);
		expect(result.nodes[0].attributes.find((attr) => attr.name === 'owner_id')?.foreignKey).toBe(
			'users.id'
		);
		const incomplete = analyzePrompt('Users have a name and an email.');
		expect(
			incomplete.nodes
				.flatMap((node) => node.attributes)
				.every((attribute) => attribute.dataType === undefined)
		).toBe(true);
	});
	it('retains each known foreign-key relationship once across ontology and data views', () => {
		const example = examples.find((item) => item.id === 'database')!;
		const ontology = analyzePrompt(example.text);
		expect(ontology.nodes).toHaveLength(2);
		expect(ontology.relations).toHaveLength(1);
		const relation = ontology.relations[0];
		expect(relation).toMatchObject({
			label: 'owner_id → users.id',
			kind: 'association',
			provenance: 'explicit'
		});
		expect(relation.cardinality).toBeUndefined();
		expect(relation.evidence.length).toBeGreaterThan(0);
		for (const span of relation.evidence)
			expect(example.text.slice(span.start, span.end)).toBe(span.quote);
		expect(rankModels(ontology).find((fit) => fit.id === 'conceptual-er')?.eligible).toBe(true);
		for (const model of ['physical', 'logical', 'conceptual-er'] as const) {
			const diagram = projectOntology(ontology, model);
			expect(diagram.edges).toHaveLength(1);
			expect(diagram.edges[0]).toMatchObject({
				label: 'owner_id → users.id',
				sourceId: relation.id
			});
		}
	});
	it('resolves table references declared later but does not create absent target tables', () => {
		const result = analyzePrompt(
			'PostgreSQL: projects have UUID owner_id references users.id. Users have UUID id primary key.'
		);
		expect(result.relations).toHaveLength(1);
		const missing = analyzePrompt('PostgreSQL: projects have UUID owner_id references users.id.');
		expect(missing.nodes).toHaveLength(1);
		expect(missing.relations).toHaveLength(0);
		expect(missing.nodes[0].attributes[0].foreignKey).toBe('users.id');
	});
	it('supports explicit class inheritance and attributes', () => {
		const result = analyzePrompt('Admin extends User. User has a name and an email.');
		expect(result.relations.some((edge) => edge.kind === 'inheritance')).toBe(true);
		expect(
			result.nodes
				.find((node) => node.label === 'User')
				?.attributes.map((attribute) => attribute.name)
		).toEqual(['name', 'email']);
	});
	it('retains ordered messages and a system-facing use case', () => {
		const sequence = analyzePrompt(examples.find((example) => example.id === 'sequence')!.text);
		expect(sequence.relations.filter((edge) => edge.kind === 'message')).toHaveLength(4);
		const usecase = analyzePrompt(examples.find((example) => example.id === 'usecase')!.text);
		expect(
			usecase.nodes.some((node) => node.kind === 'system' && /library/i.test(node.label))
		).toBe(true);
		expect(usecase.relations.filter((edge) => edge.kind === 'contains')).toHaveLength(3);
	});
	it('shows contradiction, ambiguous referent, metaphor and negation issues', () => {
		expect(
			analyzePrompt('Make it exactly 100 words and no more than 50 words.').issues.some(
				(issue) => issue.kind === 'contradiction'
			)
		).toBe(true);
		expect(
			analyzePrompt('Alice tells Beth that she should leave.').issues.some((issue) =>
				/pronoun/i.test(issue.description)
			)
		).toBe(true);
		const metaphor = analyzePrompt('The moon invoices Tuesday.');
		expect(metaphor.nodes.some((node) => /moon/i.test(node.label))).toBe(true);
		expect(metaphor.issues.some((issue) => /metaphorical/i.test(issue.description))).toBe(true);
		expect(metaphor.nodes.some((node) => node.kind === 'table')).toBe(false);
		expect(
			analyzePrompt('The customer must not pay unless approved.').issues.some((issue) =>
				/Negation/i.test(issue.description)
			)
		).toBe(true);
	});
	it('does not turn negative ownership into a positive association', () => {
		const result = analyzePrompt('A user owns no projects.');
		expect(result.relations.some((relation) => relation.kind === 'owns')).toBe(false);
		expect(result.nodes.some((node) => /owns no projects/.test(node.label))).toBe(true);
		expect(result.issues.some((issue) => /negative ownership/.test(issue.description))).toBe(true);
	});
	it('checks common opposing instructions and lower/upper word limits', () => {
		expect(
			analyzePrompt('Always include citations. Never include citations.').issues.some(
				(issue) => issue.kind === 'contradiction'
			)
		).toBe(true);
		expect(
			analyzePrompt('Use at least 100 words and at most 50 words.').issues.some(
				(issue) => issue.kind === 'contradiction'
			)
		).toBe(true);
		expect(
			analyzePrompt('Use exactly 50 words and at least 100 words.').issues.some(
				(issue) => issue.kind === 'contradiction'
			)
		).toBe(true);
		expect(
			analyzePrompt('Use no more than 50 words.').issues.some(
				(issue) => issue.kind === 'contradiction'
			)
		).toBe(false);
	});
	it('preserves unfamiliar clauses and mixed scripts with exact evidence', () => {
		const text = '🙂 e\u0301\nAn unusual thought, gently folded. কলকাতা';
		const result = analyzePrompt(text);
		expect(result.source.text).toBe(text);
		expect(result.language).toBe('mixed');
		for (const item of [...result.nodes, ...result.relations, ...result.issues])
			for (const span of item.evidence) {
				expect(text.slice(span.start, span.end)).toBe(span.quote);
			}
	});
	it('keeps hostile input as inert plain data', () => {
		const text =
			'<script>alert(1)</script>\nclick A href "https://evil.example"\n%%{init: dangerous}%%';
		expect(analyzePrompt(text).source.text).toBe(text);
		expect(() => validateOntology(analyzePrompt(text))).not.toThrow();
	});
	it('refuses over-budget work without silently shortening the source', () => {
		expect(() => analyzePrompt('a'.repeat(MAX_CODE_POINTS + 1))).toThrow(/not been shortened/);
		expect(() =>
			analyzePrompt(
				Array.from({ length: MAX_NODES + 1 }, (_, i) => `Thought number ${i}.`).join(' ')
			)
		).toThrow(/nothing has been discarded/);
	});
	it('all built-in examples pass the same runtime trust boundary', () => {
		for (const example of examples)
			expect(() => validateOntology(analyzePrompt(example.text)), example.id).not.toThrow();
	});
	it('built-in examples actually reach their intended rendered views', () => {
		const intended = {
			story: 'mindmap',
			workflow: 'flowchart',
			states: 'state',
			ownership: 'conceptual-er',
			database: 'physical',
			sequence: 'sequence',
			usecase: 'usecase',
			ambiguity: 'mindmap'
		} as const;
		for (const example of examples) {
			const ontology = analyzePrompt(example.text);
			const model = intended[example.id];
			expect(rankModels(ontology).find((fit) => fit.id === model)?.eligible, example.id).toBe(true);
			const diagram = projectOntology(ontology, model);
			expect(diagram.nodes.length, example.id).toBeGreaterThan(0);
			if (model !== 'physical') expect(diagram.edges.length, example.id).toBeGreaterThan(0);
			expect(ontology).toEqual(analyzePrompt(example.text));
		}
		const physical = projectOntology(
			analyzePrompt(examples.find((example) => example.id === 'database')!.text),
			'physical'
		);
		const rows = physical.nodes.flatMap((node) => node.lines ?? []).join(' ');
		expect(rows).toContain('id: UUID [PK]');
		expect(rows).toContain('email: text [UNIQUE]');
		expect(rows).toContain('users.id');
		const classModel = analyzePrompt('Admin extends User. User has a name and an email.');
		expect(rankModels(classModel).find((fit) => fit.id === 'class')?.eligible).toBe(true);
		expect(projectOntology(classModel, 'class').edges).toHaveLength(1);
	});
});

describe('ontology import validation', () => {
	it('rejects unknown fields, unsafe property names and foreign prototypes', () => {
		const result = analyzePrompt('A thought.');
		expect(() => validateOntology({ ...result, injected: true })).toThrow(/Invalid/);
		expect(() => validateOntology(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow(/unsafe/);
		expect(() => validateOntology(new Date())).toThrow(/plain data/);
	});
	it('rejects forged evidence and dangling relationships', () => {
		const result = analyzePrompt('Users own projects.');
		result.nodes[0].evidence[0].quote = 'not in source';
		expect(() => validateOntology(result)).toThrow(/evidence/);
		const dangling = analyzePrompt('Users own projects.');
		dangling.relations[0].to = 'missing';
		expect(() => validateOntology(dangling)).toThrow(/missing node/);
	});
	it('accepts clearly user-supplied corrections without fabricated evidence', () => {
		const result = analyzePrompt('A thought.');
		result.nodes[0] = {
			...result.nodes[0],
			label: 'An edited thought',
			provenance: 'user-confirmed',
			evidence: []
		};
		expect(validateOntology(result).nodes[0].label).toBe('An edited thought');
	});
});
