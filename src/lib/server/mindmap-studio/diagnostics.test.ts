import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { analysisDiagnostic, schemaDiagnostic, type AnalysisDiagnostic } from './diagnostics';
import { normalizeAnalysis, prepareAnalysis } from './wire';

const privateText = 'PRIVATE SOURCE CONTENT / a confidential model label';
const prepared = () =>
	prepareAnalysis({
		sources: [{ id: 'private-source-id', title: privateText, kind: 'text', text: privateText }],
		focus: '',
		depth: 'overview',
		consent: true
	});
function fixture() {
	return {
		title: privateText,
		nodes: [
			{
				id: 'root',
				parentId: null as string | null,
				label: privateText,
				description: '',
				category: 'topic',
				status: 'explicit',
				unitIds: ['s1u1'],
				notes: ''
			},
			{
				id: 'child',
				parentId: 'root' as string | null,
				label: privateText,
				description: '',
				category: 'claim',
				status: 'explicit',
				unitIds: ['s1u1'],
				notes: ''
			}
		],
		edges: [
			{
				id: 'edge',
				from: 'root',
				to: 'child',
				type: privateText,
				status: 'explicit',
				unitIds: ['s1u1'],
				rationale: 'Source context.'
			}
		],
		analysis: [{ id: 'scope', title: 'Scope', body: privateText }]
	};
}
function diagnostic(value: unknown, context = prepared()) {
	try {
		normalizeAnalysis(value, context);
		throw new Error('Expected validation failure');
	} catch (cause) {
		const result = analysisDiagnostic(cause);
		expect(JSON.stringify(result)).not.toContain(privateText);
		expect(JSON.stringify(result)).not.toContain('private-source-id');
		return result;
	}
}

describe('source-free normalization diagnostics', () => {
	it('reports only an allowlisted structural path for a schema failure', () => {
		const value = fixture();
		Object.assign(value.nodes[0], { notes: { [privateText]: privateText } });
		expect(diagnostic(value)).toEqual({
			stage: 'wire-schema',
			reason: 'invalid_type',
			field: 'nodes.0.notes'
		});
	});
	it('never includes unrecognized keys containing private content', () => {
		const value = fixture();
		Object.assign(value.nodes[0], { [privateText]: privateText });
		expect(diagnostic(value)).toEqual({
			stage: 'wire-schema',
			reason: 'unrecognized_keys',
			field: 'nodes.0'
		});
		const schema = z.record(z.string(), z.number());
		const parsed = schema.safeParse({ [privateText]: privateText });
		if (parsed.success) throw new Error('Expected invalid record');
		expect(schemaDiagnostic('wire-schema', parsed.error.issues[0])).toEqual({
			stage: 'wire-schema',
			reason: 'invalid_type'
		});
	});
	const invariants: Array<{
		name: string;
		mutate: (value: ReturnType<typeof fixture>) => void;
		stage: AnalysisDiagnostic['stage'];
		reason: AnalysisDiagnostic['reason'];
	}> = [
		{
			name: 'duplicate node',
			mutate: (value) => {
				value.nodes[1].id = 'root';
			},
			stage: 'topology',
			reason: 'duplicate_node'
		},
		{
			name: 'duplicate edge',
			mutate: (value) => {
				value.edges.push({ ...value.edges[0] });
			},
			stage: 'topology',
			reason: 'duplicate_edge'
		},
		{
			name: 'missing null-parent root',
			mutate: (value) => {
				value.nodes[0].parentId = 'absent';
			},
			stage: 'topology',
			reason: 'invalid_root'
		},
		{
			name: 'root with parent',
			mutate: (value) => {
				value.nodes[0].parentId = 'child';
			},
			stage: 'topology',
			reason: 'invalid_root'
		},
		{
			name: 'missing parent',
			mutate: (value) => {
				value.nodes[1].parentId = 'absent';
			},
			stage: 'topology',
			reason: 'missing_parent'
		},
		{
			name: 'second null parent',
			mutate: (value) => {
				value.nodes[1].parentId = null;
			},
			stage: 'topology',
			reason: 'invalid_root'
		},
		{
			name: 'cycle',
			mutate: (value) => {
				value.nodes[1].parentId = 'child';
			},
			stage: 'topology',
			reason: 'cycle'
		},
		{
			name: 'missing endpoint',
			mutate: (value) => {
				value.edges[0].to = 'absent';
			},
			stage: 'topology',
			reason: 'missing_endpoint'
		},
		{
			name: 'self edge',
			mutate: (value) => {
				value.edges[0].to = 'root';
			},
			stage: 'topology',
			reason: 'self_edge'
		},
		{
			name: 'unsupported explicit node',
			mutate: (value) => {
				value.nodes[1].unitIds = [];
			},
			stage: 'evidence',
			reason: 'missing_explicit_evidence'
		},
		{
			name: 'unsupported explicit edge',
			mutate: (value) => {
				value.edges[0].unitIds = [];
			},
			stage: 'evidence',
			reason: 'missing_explicit_evidence'
		},
		{
			name: 'unknown source unit',
			mutate: (value) => {
				value.nodes[1].unitIds = ['private-source-id'];
			},
			stage: 'evidence',
			reason: 'unknown_unit'
		},
		{
			name: 'empty inference rationale',
			mutate: (value) => {
				value.edges[0].status = 'inferred';
				value.edges[0].rationale = ' ';
			},
			stage: 'evidence',
			reason: 'missing_rationale'
		},
		{
			name: 'duplicate analysis ID',
			mutate: (value) => {
				value.analysis.push({ ...value.analysis[0] });
			},
			stage: 'canonical-schema',
			reason: 'duplicate_analysis'
		}
	];
	it.each(invariants)(
		'classifies $name without disclosing labels or source identities',
		({ mutate, stage, reason }) => {
			const value = fixture();
			mutate(value);
			expect(diagnostic(value)).toMatchObject({ stage, reason });
		}
	);
	it('distinguishes canonical schema failure from wire shape and topology', () => {
		const context = prepared();
		context.units[0].locator = privateText.repeat(10);
		expect(diagnostic(fixture(), context)).toEqual({
			stage: 'canonical-schema',
			reason: 'too_big',
			field: 'nodes.0.evidence.0.locator'
		});
	});
	it('distinguishes trusted evidence changes from model topology', () => {
		const context = prepared();
		context.input.sources[0].text = 'Changed private source.';
		expect(diagnostic(fixture(), context)).toEqual({ stage: 'evidence', reason: 'source_changed' });
	});
	it('does not expose arbitrary exceptions or trust a forged diagnostic property', () => {
		expect(analysisDiagnostic(new Error(privateText))).toEqual({
			stage: 'unexpected',
			reason: 'normalizer_exception'
		});
		expect(analysisDiagnostic({ diagnostic: { stage: privateText, reason: privateText } })).toEqual(
			{
				stage: 'unexpected',
				reason: 'normalizer_exception'
			}
		);
	});
});
