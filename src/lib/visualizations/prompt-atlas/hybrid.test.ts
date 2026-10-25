import { describe, expect, it, vi } from 'vitest';
import * as localReader from './analysis';
import { prepareSemanticInput, splitSourceUnits } from './compression';
import { preserveInstructionLayer } from './hybrid';
import { rankModels } from './models';
import { MAX_NODES, MAX_RELATIONS, type PromptOntology } from './types';
import { validateOntology } from './validation';

const text =
	'Write a kind bedtime story about the moon invoicing Tuesday for children aged eight. Keep it under 500 words.';
function semantic(source = text): PromptOntology {
	const evidence = (quote: string) => {
		const start = source.indexOf(quote);
		return [{ start, end: start + quote.length, quote }];
	};
	return {
		schemaVersion: 1,
		source: { text: source, revision: 'semantic-test' },
		mode: 'semantic',
		language: 'en',
		analysisMetadata: { provider: 'test-free-provider', model: 'test-free-model' },
		nodes: [
			{
				id: 'moon',
				label: 'Moon',
				kind: 'concept',
				layer: 'subject',
				provenance: 'explicit',
				evidence: evidence('moon'),
				attributes: []
			},
			{
				id: 'tuesday',
				label: 'Tuesday',
				kind: 'concept',
				layer: 'subject',
				provenance: 'explicit',
				evidence: evidence('Tuesday'),
				attributes: []
			}
		],
		relations: [
			{
				id: 'poetic-relation',
				from: 'moon',
				to: 'tuesday',
				label: 'poetically invoices',
				kind: 'association',
				provenance: 'inferred',
				rationale: 'The unusual wording may be a metaphor.',
				evidence: evidence('moon invoicing Tuesday')
			}
		],
		issues: [
			{
				id: 'interpretation',
				kind: 'ambiguity',
				description: 'The metaphor remains open to interpretation.',
				evidence: evidence('moon invoicing Tuesday')
			}
		]
	};
}

function thinSubjectGraph(source: string): PromptOntology {
	const local = localReader.analyzePrompt(source);
	const nodes = local.nodes
		.filter((node) => node.layer === 'subject')
		.map((node) => ({
			...node,
			attributes: []
		}));
	const ids = new Set(nodes.map((node) => node.id));
	return {
		schemaVersion: 1,
		source: { text: source, revision: 'thin-semantic-test' },
		mode: 'semantic',
		language: 'en',
		analysisMetadata: { provider: 'free-test', model: 'thin-kg-test' },
		...(local.compression ? { compression: local.compression } : {}),
		nodes,
		relations: local.relations
			.filter((relation) => ids.has(relation.from) && ids.has(relation.to))
			.map((relation) => {
				const { guard: _guard, cardinality: _cardinality, ...thin } = relation;
				return thin;
			}),
		issues: []
	};
}

describe('hybrid instruction preservation', () => {
	it('adds supported instructions to an unusual semantic subject graph without changing the AI claims', () => {
		const input = semantic();
		const before = structuredClone(input);
		const result = preserveInstructionLayer(input);
		expect(input).toEqual(before);
		expect(result.nodes.slice(0, input.nodes.length)).toEqual(input.nodes);
		expect(result.relations.slice(0, input.relations.length)).toEqual(input.relations);
		expect(result.issues).toEqual(input.issues);
		expect(result).toMatchObject({
			source: input.source,
			mode: 'semantic',
			analysisMetadata: input.analysisMetadata
		});
		expect(result.nodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'task', layer: 'instruction', provenance: 'explicit' }),
				expect.objectContaining({ kind: 'output', label: 'story' }),
				expect.objectContaining({ kind: 'audience', label: 'children aged eight' }),
				expect.objectContaining({ kind: 'constraint', label: 'kind' }),
				expect.objectContaining({ kind: 'constraint', label: 'Keep it under 500 words' })
			])
		);
		expect(result.nodes.filter((node) => node.layer === 'subject')).toEqual(input.nodes);
		for (const claim of [...result.nodes, ...result.relations])
			for (const span of claim.evidence) expect(text.slice(span.start, span.end)).toBe(span.quote);
		expect(validateOntology(result)).toEqual(result);
	});
	it('maps overlapping semantic instruction claims and remains idempotent instead of adding duplicates', () => {
		const input = semantic();
		input.nodes.push({
			id: 'ai-task',
			label: 'Write a bedtime story',
			kind: 'task',
			layer: 'instruction',
			provenance: 'explicit',
			evidence: [{ start: 0, end: 5, quote: 'Write' }],
			attributes: []
		});
		const result = preserveInstructionLayer(input);
		expect(result.nodes.filter((node) => node.kind === 'task')).toEqual([input.nodes[2]]);
		expect(preserveInstructionLayer(result)).toEqual(result);
	});
	it('joins subject endpoints only on a unique exact normalised label, never a fuzzy match', () => {
		const source = 'Write a story about a robot gardener for children.';
		const evidence = [
			{
				start: source.indexOf('robot gardener'),
				end: source.indexOf('robot gardener') + 'robot gardener'.length,
				quote: 'robot gardener'
			}
		];
		const input: PromptOntology = {
			schemaVersion: 1,
			source: { text: source, revision: 'test' },
			mode: 'semantic',
			language: 'en',
			nodes: [
				{
					id: 'robot',
					label: 'ROBOT   GARDENER',
					kind: 'object',
					layer: 'subject',
					provenance: 'explicit',
					evidence,
					attributes: []
				}
			],
			relations: [],
			issues: []
		};
		const exact = preserveInstructionLayer(input);
		expect(
			exact.relations.some((relation) => relation.to === 'robot' && relation.label === 'about')
		).toBe(true);
		input.nodes[0].label = 'Robot';
		expect(
			preserveInstructionLayer(input).relations.some((relation) => relation.to === 'robot')
		).toBe(false);
	});
	it('keeps source/mode/coverage and adds only claims grounded in the inspected deterministic excerpts', () => {
		const source = `Write a story about the moon invoicing Tuesday.\n${Array.from({ length: 1000 }, (_, index) => `Quiet observation ${index} drifts through the garden.\n`).join('')}Keep it under 500 words.`;
		const prepared = prepareSemanticInput(source);
		const input = semantic(source);
		input.compression = prepared.compression;
		const result = preserveInstructionLayer(input);
		expect(result.compression).toEqual(input.compression);
		expect(result.source).toEqual(input.source);
		const added = [
			...result.nodes.slice(input.nodes.length),
			...result.relations.slice(input.relations.length)
		];
		expect(added.length).toBeGreaterThan(0);
		for (const claim of added)
			for (const span of claim.evidence)
				expect(
					prepared.fragments!.some(
						(fragment) =>
							fragment.start <= span.start && span.end <= fragment.start + fragment.text.length
					)
				).toBe(true);
	});
	it('preserves a valid AI graph when the local reader fails, with a truthful bounded issue', () => {
		const spy = vi.spyOn(localReader, 'analyzePrompt').mockImplementationOnce(() => {
			throw new Error('private implementation detail');
		});
		try {
			const input = semantic();
			const result = preserveInstructionLayer(input);
			expect(result.nodes).toEqual(input.nodes);
			expect(result.relations).toEqual(input.relations);
			expect(result.issues).toHaveLength(input.issues.length + 1);
			expect(result.issues.at(-1)?.description).toContain('could not complete');
			expect(JSON.stringify(result)).not.toContain('private implementation detail');
		} finally {
			spy.mockRestore();
		}
	});
	it('respects graph capacities and records one honest limit issue', () => {
		const input = semantic();
		while (input.nodes.length < MAX_NODES)
			input.nodes.push({
				...input.nodes[0],
				id: `existing-${input.nodes.length}`,
				label: `Existing concept ${input.nodes.length}`
			});
		const result = preserveInstructionLayer(input);
		expect(result.nodes).toEqual(input.nodes);
		expect(result.issues.filter((issue) => issue.kind === 'limit')).toHaveLength(1);
		const edgeFull = semantic();
		while (edgeFull.relations.length < MAX_RELATIONS)
			edgeFull.relations.push({
				...edgeFull.relations[0],
				id: `existing-edge-${edgeFull.relations.length}`,
				label: `Existing relation ${edgeFull.relations.length}`
			});
		const edges = preserveInstructionLayer(edgeFull);
		expect(edges.relations).toEqual(edgeFull.relations);
		expect(edges.issues.filter((issue) => issue.kind === 'limit')).toHaveLength(1);
	});
	it('retains explicit local storage facts on uniquely exact subject matches without rewriting AI claims', () => {
		const source =
			'PostgreSQL: users have UUID id primary key and unique email text. Projects have UUID id primary key and owner_id UUID references users.id.';
		const input = thinSubjectGraph(source);
		for (const node of input.nodes) node.kind = 'concept';
		const before = structuredClone(input);
		const result = preserveInstructionLayer(input);
		expect(input).toEqual(before);
		expect(result.databaseTarget).toBe('PostgreSQL');
		expect(result.nodes.map((node) => ({ ...node, attributes: [] }))).toEqual(input.nodes);
		expect(result.relations).toEqual(input.relations);
		expect(result.nodes.find((node) => node.label === 'users')?.attributes).toEqual([
			expect.objectContaining({
				name: 'id',
				dataType: 'UUID',
				primaryKey: true,
				provenance: 'explicit'
			}),
			expect.objectContaining({
				name: 'email',
				dataType: 'text',
				unique: true,
				provenance: 'explicit'
			})
		]);
		expect(result.nodes.find((node) => /^projects$/i.test(node.label))?.attributes).toContainEqual(
			expect.objectContaining({ name: 'owner_id', dataType: 'UUID', foreignKey: 'users.id' })
		);
		expect(rankModels(result).find((model) => model.id === 'physical')?.eligible).toBe(true);
		for (const attribute of result.nodes.flatMap((node) => node.attributes))
			for (const span of attribute.evidence)
				expect(source.slice(span.start, span.end)).toBe(span.quote);
		expect(preserveInstructionLayer(result)).toEqual(result);
	});
	it('skips ambiguous or fuzzy attribute joins and preserves pre-existing attributes and target', () => {
		const source = 'PostgreSQL: users have UUID id primary key and unique email text.';
		const input = thinSubjectGraph(source);
		const originalAttribute = {
			name: 'ID',
			dataType: 'text',
			provenance: 'user-confirmed' as const,
			evidence: []
		};
		input.nodes[0].attributes = [originalAttribute];
		input.databaseTarget = 'SQLite';
		const result = preserveInstructionLayer(input);
		expect(result.nodes[0].attributes[0]).toEqual(originalAttribute);
		expect(
			result.nodes[0].attributes.filter((attribute) => /^id$/i.test(attribute.name))
		).toHaveLength(1);
		expect(result.databaseTarget).toBe('SQLite');
		input.nodes[0].attributes = [];
		input.nodes.push({ ...input.nodes[0], id: 'duplicate-users', attributes: [] });
		expect(preserveInstructionLayer(input).nodes.flatMap((node) => node.attributes)).toEqual([]);
		input.nodes = [input.nodes[0]];
		input.nodes[0].label = 'user';
		expect(preserveInstructionLayer(input).nodes[0].attributes).toEqual([]);
	});
	it('does not promote directly negated storage tokens or database names into positive physical facts', () => {
		const source =
			'Never use PostgreSQL. Users have email text, not unique. Projects have UUID id not a primary key.';
		const result = preserveInstructionLayer(thinSubjectGraph(source));
		expect(result.databaseTarget).toBeUndefined();
		expect(
			result.nodes
				.flatMap((node) => node.attributes)
				.some((attribute) => attribute.unique || attribute.primaryKey)
		).toBe(false);
		expect(rankModels(result).find((model) => model.id === 'physical')?.eligible).toBe(false);
	});
	it('adds guard and cardinality only to unambiguous exact endpoint-and-kind matches', () => {
		const source =
			'Users can own many projects; each project has one owner. Customer submits an order. If approved, service validates payment.';
		const input = thinSubjectGraph(source);
		const result = preserveInstructionLayer(input);
		const ownership = result.relations.find((relation) => relation.kind === 'owns');
		expect(ownership?.cardinality).toMatch(/one owner.*many/);
		expect(result.relations.some((relation) => relation.guard === 'approved')).toBe(true);
		expect(
			result.relations.map(
				({ guard: _guard, cardinality: _cardinality, evidence: _evidence, ...relation }) => relation
			)
		).toEqual(input.relations.map(({ evidence: _evidence, ...relation }) => relation));
		const owns = input.relations.find((relation) => relation.kind === 'owns')!;
		input.relations.push({ ...owns, id: 'ambiguous-owning-edge', label: 'another interpretation' });
		expect(
			preserveInstructionLayer(input)
				.relations.filter((relation) => relation.kind === 'owns')
				.every((relation) => relation.cardinality === undefined)
		).toBe(true);
		input.relations.pop();
		owns.cardinality = 'user-specified relationship';
		expect(
			preserveInstructionLayer(input).relations.find((relation) => relation.id === owns.id)
				?.cardinality
		).toBe('user-specified relationship');
	});
	it('retains physical facts across touching atomic source units without bridging omitted text', () => {
		const source = `PostgreSQL: users have UUID id primary key and ${Array.from({ length: 40 }, (_, index) => `column${index} text`).join(', ')}.`;
		const input = thinSubjectGraph(source);
		const fragments = splitSourceUnits(source);
		const before = structuredClone(fragments);
		expect(fragments.length).toBeGreaterThan(1);
		const result = preserveInstructionLayer(input, fragments);
		expect(fragments).toEqual(before);
		expect(result.nodes[0].attributes).toHaveLength(41);
		expect(rankModels(result).find((model) => model.id === 'physical')?.eligible).toBe(true);
		const gap = 250;
		const omitted = preserveInstructionLayer(input, [
			{ id: 'before', start: 0, text: source.slice(0, gap) },
			{ id: 'after', start: gap + 1, text: source.slice(gap + 1) }
		]);
		expect(omitted.nodes[0].attributes).toEqual([]);
		expect(rankModels(omitted).find((model) => model.id === 'physical')?.eligible).toBe(false);
	});
	it('uses supplied inspected fragments even for an uncompressed prompt within the default budget', () => {
		const source = 'PostgreSQL: users have UUID id primary key. Write a story.';
		const input = thinSubjectGraph(source);
		expect(preserveInstructionLayer(input).nodes[0].attributes).toHaveLength(1);
		const text = 'Write a story.';
		const result = preserveInstructionLayer(input, [
			{ id: 's1', text, start: source.indexOf(text) }
		]);
		expect(result.compression).toBeUndefined();
		expect(result.nodes.flatMap((node) => node.attributes)).toEqual([]);
		expect(result.databaseTarget).toBeUndefined();
		expect(result.nodes.some((node) => node.kind === 'task')).toBe(true);
	});
	it('rejects mismatched, overlapping and code-point-splitting inspected fragments', () => {
		const input = semantic();
		expect(() =>
			preserveInstructionLayer(input, [{ id: 's1', start: 0, text: 'fabricated' }])
		).toThrow('do not match');
		expect(() =>
			preserveInstructionLayer(input, [
				{ id: 's1', start: 0, text: 'Write' },
				{ id: 's2', start: 2, text: 'ite' }
			])
		).toThrow('do not match');
		const emoji = semantic('🙂 moon invoicing Tuesday');
		expect(() =>
			preserveInstructionLayer(emoji, [{ id: 's1', start: 1, text: emoji.source.text.slice(1) }])
		).toThrow('do not match');
	});
	it('does not add local facts whose supporting evidence falls outside inspected semantic coverage', () => {
		let source = `Write a story.\n${Array.from({ length: 1000 }, (_, index) => `Quiet observation ${index} crosses the garden.\n`).join('')}Never invent a database.`;
		const initial = prepareSemanticInput(source);
		const gap = initial
			.fragments!.map((fragment, index, fragments) => ({
				start: index ? fragments[index - 1].start + fragments[index - 1].text.length : 0,
				end: fragment.start
			}))
			.find((candidate) => candidate.end - candidate.start >= 10)!;
		source = source.slice(0, gap.start) + 'PostgreSQL' + source.slice(gap.start + 10);
		const prepared = prepareSemanticInput(source);
		const span = { start: gap.start, end: gap.start + 10, quote: 'PostgreSQL' };
		expect(
			prepared.fragments!.every(
				(fragment) =>
					span.end <= fragment.start || fragment.start + fragment.text.length <= span.start
			)
		).toBe(true);
		const input = thinSubjectGraph(source);
		input.nodes = [
			{
				id: 'users',
				label: 'users',
				kind: 'concept',
				layer: 'subject',
				provenance: 'explicit',
				evidence: [span],
				attributes: []
			}
		];
		input.relations = [];
		const local = {
			...input,
			mode: 'local' as const,
			databaseTarget: 'PostgreSQL',
			nodes: [
				{
					...input.nodes[0],
					attributes: [
						{ name: 'id', dataType: 'UUID', provenance: 'explicit' as const, evidence: [span] }
					]
				}
			]
		};
		const spy = vi.spyOn(localReader, 'analyzePrompt').mockReturnValueOnce(local);
		try {
			const result = preserveInstructionLayer(input);
			expect(result.nodes[0].attributes).toEqual([]);
			expect(result.databaseTarget).toBeUndefined();
		} finally {
			spy.mockRestore();
		}
	});
});
