import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	prepareSemanticWire,
	normalizeSemanticWire,
	type SemanticWireDraft
} from './semantic-wire';
import { MAX_CODE_POINTS } from './types';

const text = 'Write a story about the moon. The moon invoices Tuesday. Keep it kind.';
const metadata = {
	provider: 'Vercel AI Gateway / NVIDIA',
	model: 'nvidia/nemotron-3.5-lightning-free'
};

function draft(): SemanticWireDraft {
	return {
		nodes: [
			{
				id: 'task',
				label: 'Write a story',
				kind: 'task',
				sourceIds: ['s1'],
				provenance: 'explicit',
				rationale: 'The first source unit states the writing task.'
			},
			{
				id: 'moon',
				label: 'moon',
				kind: 'concept',
				sourceIds: ['s1', 's2'],
				provenance: 'explicit',
				rationale: 'The moon is named in both source contexts.'
			},
			{
				id: 'tuesday',
				label: 'Tuesday',
				kind: 'concept',
				sourceIds: ['s2'],
				provenance: 'explicit',
				rationale: 'The second context names Tuesday.'
			},
			{
				id: 'kind',
				label: 'Keep it kind',
				kind: 'constraint',
				sourceIds: ['s3'],
				provenance: 'explicit',
				rationale: 'The last source unit states this constraint.'
			}
		],
		relations: [
			{
				id: 'about',
				from: 'task',
				to: 'moon',
				label: 'about',
				kind: 'association',
				sourceIds: ['s1'],
				provenance: 'explicit',
				rationale: 'The writing task is about the moon.'
			},
			{
				id: 'invoices',
				from: 'moon',
				to: 'tuesday',
				label: 'invoices',
				kind: 'association',
				sourceIds: ['s2'],
				provenance: 'explicit',
				rationale: 'The unusual relationship is stated directly.'
			}
		],
		issues: [
			{ kind: 'ambiguity', description: 'Invoicing a day may be metaphorical.', sourceIds: ['s2'] }
		]
	};
}

function single(sourceIds: string[]): SemanticWireDraft {
	return {
		nodes: [
			{
				id: 'one',
				label: 'Source concept',
				kind: 'concept',
				sourceIds,
				provenance: 'inferred',
				rationale: 'This is an uncertain interpretation of the supplied context.'
			}
		],
		relations: [],
		issues: []
	};
}

describe('thin semantic provider wire', () => {
	it('sends exact bounded source units and an enum-backed native schema', () => {
		const prepared = prepareSemanticWire(text);
		expect(prepared.fragments.map((fragment) => fragment.text).join('')).toBe(text);
		expect(prepared.fragments.map((fragment) => fragment.id)).toEqual(['s1', 's2', 's3']);
		for (const fragment of prepared.fragments) {
			expect(Array.from(fragment.text).length).toBeLessThanOrEqual(512);
			expect(text.slice(fragment.start, fragment.start + fragment.text.length)).toBe(fragment.text);
		}
		const schema = z.toJSONSchema(prepared.schema, { target: 'draft-07' }) as Record<string, any>;
		expect(schema.required).toEqual(['nodes', 'relations', 'issues']);
		expect(schema.additionalProperties).toBe(false);
		expect(schema.properties.nodes).toMatchObject({ minItems: 1, maxItems: 60 });
		expect(schema.properties.relations.maxItems).toBe(100);
		expect(schema.properties.issues.maxItems).toBe(20);
		expect(schema.properties.nodes.items.required).toEqual([
			'id',
			'label',
			'kind',
			'sourceIds',
			'provenance',
			'rationale'
		]);
		expect(schema.properties.nodes.items.properties.sourceIds).toMatchObject({
			minItems: 1,
			maxItems: 2,
			items: { enum: ['s1', 's2', 's3'] }
		});
		expect(prepared.system.endsWith(JSON.stringify(schema))).toBe(true);
		expect(prepared.prompt).toContain(
			JSON.stringify(prepared.fragments.map(({ id, text }) => ({ id, text })))
		);
		expect(prepared.prompt).not.toContain('UTF-16 start');
	});
	it('derives layers, evidence, language and provider identity without accepting model bookkeeping', () => {
		const prepared = prepareSemanticWire(text);
		const result = normalizeSemanticWire(draft(), text, metadata, prepared);
		expect(result.source.text).toBe(text);
		expect(result.source.revision).toMatch(/^wire-/);
		expect(result.mode).toBe('semantic');
		expect(result.analysisMetadata).toEqual(metadata);
		expect(result.language).toBe('en');
		expect(result.nodes.find((node) => node.id === 'task')!.layer).toBe('instruction');
		expect(result.nodes.find((node) => node.id === 'kind')!.layer).toBe('instruction');
		expect(result.nodes.find((node) => node.id === 'moon')!.layer).toBe('subject');
		for (const node of result.nodes) expect(node.attributes).toEqual([]);
		expect(result).not.toHaveProperty('databaseTarget');
		for (const relation of result.relations) {
			expect(relation).not.toHaveProperty('guard');
			expect(relation).not.toHaveProperty('cardinality');
		}
		for (const item of [...result.nodes, ...result.relations, ...result.issues])
			for (const evidence of item.evidence)
				expect(text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
		expect(result.issues.some((issue) => issue.kind === 'limit')).toBe(false);
	});
	it('preserves original UTF-16 positions for Unicode and repeated source text', () => {
		const source = '😀 Look.\n😀 Look.\nThe moon waits.';
		const prepared = prepareSemanticWire(source);
		const result = normalizeSemanticWire(single(['s2']), source, metadata, prepared);
		const span = result.nodes[0].evidence[0];
		expect(span.start).toBe(prepared.fragments[1].start);
		expect(span.quote).toBe(prepared.fragments[1].text);
		expect(source.slice(span.start, span.end)).toBe(span.quote);
		expect(span.end - span.start).toBe(span.quote.length);
	});
	it('rejects source IDs that were never supplied', () => {
		const value = draft();
		value.nodes[0].sourceIds = ['invented'];
		expect(() => normalizeSemanticWire(value, text, metadata, prepareSemanticWire(text))).toThrow(
			'Invalid semantic graph'
		);
	});
	it('rejects repeated source references within a claim', () => {
		const value = draft();
		value.nodes[0].sourceIds = ['s1', 's1'];
		expect(() => normalizeSemanticWire(value, text, metadata, prepareSemanticWire(text))).toThrow(
			'repeats a source'
		);
	});
	it('rejects dangling references and duplicate identifiers', () => {
		const value = draft();
		value.relations[0].to = 'missing';
		expect(() => normalizeSemanticWire(value, text, metadata, prepareSemanticWire(text))).toThrow(
			'missing node'
		);
		value.relations[0].to = 'moon';
		value.relations[0].id = 'task';
		expect(() => normalizeSemanticWire(value, text, metadata, prepareSemanticWire(text))).toThrow(
			'unique identifier'
		);
	});
	it('rejects duplicate nodes and duplicate relationships', () => {
		const value = draft();
		value.nodes.push({ ...value.nodes[1], id: 'other-moon' });
		expect(() => normalizeSemanticWire(value, text, metadata, prepareSemanticWire(text))).toThrow(
			'duplicate nodes'
		);
		value.nodes.pop();
		value.relations.push({ ...value.relations[0], id: 'other-about' });
		expect(() => normalizeSemanticWire(value, text, metadata, prepareSemanticWire(text))).toThrow(
			'duplicate relationships'
		);
	});
	it.each(['explicit', 'inferred'] as const)(
		'requires a nonempty rationale for %s claims',
		(provenance) => {
			const value = draft();
			value.nodes[0].provenance = provenance;
			value.nodes[0].rationale = ' ';
			expect(() => normalizeSemanticWire(value, text, metadata, prepareSemanticWire(text))).toThrow(
				'Invalid semantic graph'
			);
		}
	);
	it('rejects user-confirmed provenance and invented physical/source/layer fields', () => {
		const prepared = prepareSemanticWire(text);
		for (const added of [
			{ layer: 'subject' },
			{ attributes: [{ name: 'id', dataType: 'UUID' }] },
			{ evidence: [{ quote: 'forged', start: 0, end: 6 }] },
			{ provenance: 'user-confirmed' }
		]) {
			const value = draft();
			Object.assign(value.nodes[0], added);
			expect(() => normalizeSemanticWire(value, text, metadata, prepared)).toThrow(
				'Invalid semantic graph'
			);
		}
		expect(() =>
			normalizeSemanticWire({ ...draft(), databaseTarget: 'PostgreSQL' }, text, metadata, prepared)
		).toThrow('Invalid semantic graph');
	});
	it('rejects tampered prepared context and coverage instead of trusting copied offsets', () => {
		const prepared = prepareSemanticWire(text);
		const wrongOffset = { ...prepared, fragments: prepared.fragments.map((unit) => ({ ...unit })) };
		wrongOffset.fragments[0].start += 1;
		expect(() => normalizeSemanticWire(draft(), text, metadata, wrongOffset)).toThrow(
			'does not match'
		);
		const wrongCoverage = {
			...prepared,
			compression: { ...prepared.compression, omittedCodePoints: 1 }
		};
		expect(() => normalizeSemanticWire(draft(), text, metadata, wrongCoverage)).toThrow(
			'does not match'
		);
	});
	it('keeps the complete long source while disclosing selected-context coverage', () => {
		const source = text + '\n' + 'Keep every original character.\n'.repeat(1500);
		const prepared = prepareSemanticWire(source);
		const result = normalizeSemanticWire(
			single([prepared.fragments[0].id]),
			source,
			metadata,
			prepared
		);
		expect(result.source.text).toBe(source);
		expect(result.compression).toEqual(prepared.compression);
		expect(result.compression!.omittedCodePoints).toBeGreaterThan(0);
		expect(result.issues.some((issue) => issue.kind === 'limit')).toBe(true);
		for (const fragment of prepared.fragments)
			expect(source.slice(fragment.start, fragment.start + fragment.text.length)).toBe(
				fragment.text
			);
	});
	it('downgrades relationships whose own or endpoint context crosses omitted source', () => {
		const source =
			'Moon waits.\nTuesday listens.\nKeep it kind.\n' +
			'Repeated context stays unknown.\n'.repeat(1000) +
			'Moon invoices Tuesday.\n';
		const prepared = prepareSemanticWire(source);
		const first = prepared.fragments[0].id;
		const last = prepared.fragments.at(-1)!.id;
		expect(prepared.compression.omittedCodePoints).toBeGreaterThan(0);
		for (const citeGapDirectly of [true, false]) {
			const value = draft();
			value.nodes = value.nodes.slice(1, 3);
			value.nodes[0].sourceIds = [first];
			value.nodes[1].sourceIds = [last];
			value.relations = [
				{ ...value.relations[1], sourceIds: citeGapDirectly ? [first, last] : [first] }
			];
			value.issues = [];
			const result = normalizeSemanticWire(value, source, metadata, prepared);
			expect(result.relations[0].provenance).toBe('inferred');
			expect(result.relations[0].rationale).toContain(
				'This connection spans omitted source context; confirm it.'
			);
		}
	});
	it('preserves explicit relationships supported by one common contiguous coverage component', () => {
		const source =
			'Moon waits.\nTuesday listens.\nKeep it kind.\n' +
			'Repeated context stays unknown.\n'.repeat(1000) +
			'Moon invoices Tuesday.\n';
		for (const sourceText of [source, text]) {
			const prepared = prepareSemanticWire(sourceText);
			const first = prepared.fragments[0].id;
			const third = prepared.fragments[2].id;
			const last = prepared.fragments.at(-1)!.id;
			const value = draft();
			value.nodes = value.nodes.slice(1, 3);
			value.nodes[0].sourceIds = [first, last];
			value.nodes[1].sourceIds = [third];
			value.relations = [{ ...value.relations[1], sourceIds: [first, third] }];
			value.issues = [];
			const result = normalizeSemanticWire(value, sourceText, metadata, prepared);
			expect(result.relations[0].provenance).toBe('explicit');
			expect(result.relations[0].rationale).not.toContain('omitted source context');
		}
	});
	it('bounds dense non-adjacent source IDs by reducing context with truthful omissions', () => {
		const source = Array.from({ length: 3000 }, (_, index) => `Item${index}.\nRepeat.\n`).join('');
		const prepared = prepareSemanticWire(source);
		expect(prepared.fragments.length).toBeLessThanOrEqual(1000);
		expect(prepared.compression.analysedCodePoints).toBeLessThan(24_000);
		expect(prepared.compression.originalCodePoints).toBe(Array.from(source).length);
		expect(prepared.compression.analysedCodePoints + prepared.compression.omittedCodePoints).toBe(
			prepared.compression.originalCodePoints
		);
		for (const fragment of prepared.fragments) {
			expect(Array.from(fragment.text).length).toBeLessThanOrEqual(512);
			expect(source.slice(fragment.start, fragment.start + fragment.text.length)).toBe(
				fragment.text
			);
		}
		const result = normalizeSemanticWire(
			single([prepared.fragments[0].id]),
			source,
			metadata,
			prepared
		);
		expect(result.issues.some((issue) => issue.kind === 'limit')).toBe(true);
	});
	it('generates issue IDs that cannot collide with model IDs', () => {
		const value = draft();
		value.nodes[0].id = 'wire-issue-1';
		value.relations[0].from = 'wire-issue-1';
		const result = normalizeSemanticWire(value, text, metadata, prepareSemanticWire(text));
		const ids = [...result.nodes, ...result.relations, ...result.issues].map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
	it('enforces model graph bounds and the shared source limit', () => {
		const prepared = prepareSemanticWire(text);
		const value = draft();
		value.nodes = Array.from({ length: 61 }, (_, index) => ({
			...value.nodes[0],
			id: `node-${index}`
		}));
		expect(prepared.schema.safeParse(value).success).toBe(false);
		expect(() => prepareSemanticWire(' ')).toThrow('nonempty');
		expect(() => prepareSemanticWire('a'.repeat(MAX_CODE_POINTS + 1))).toThrow('safety limit');
	});
});
