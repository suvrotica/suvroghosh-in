import type { z } from 'zod';

export type AnalysisDiagnostic = {
	stage: 'wire-schema' | 'evidence' | 'topology' | 'canonical-schema' | 'unexpected';
	reason:
		| 'invalid_type'
		| 'too_big'
		| 'too_small'
		| 'invalid_format'
		| 'invalid_value'
		| 'invalid_union'
		| 'unrecognized_keys'
		| 'schema_constraint'
		| 'unknown_unit'
		| 'missing_source'
		| 'source_changed'
		| 'missing_explicit_evidence'
		| 'invalid_evidence'
		| 'duplicate_node'
		| 'duplicate_edge'
		| 'invalid_root'
		| 'missing_parent'
		| 'cycle'
		| 'missing_endpoint'
		| 'self_edge'
		| 'duplicate_source'
		| 'duplicate_analysis'
		| 'source_limit'
		| 'coverage'
		| 'project_size'
		| 'missing_rationale'
		| 'normalizer_exception';
	field?: string;
};

const fields: Record<string, readonly string[]> = {
	nodes: [
		'id',
		'parentId',
		'label',
		'description',
		'category',
		'status',
		'unitIds',
		'notes',
		'evidence',
		'reviewed',
		'collapsed',
		'color'
	],
	edges: ['id', 'from', 'to', 'type', 'status', 'unitIds', 'rationale', 'evidence'],
	sources: ['id', 'title', 'kind', 'text', 'url', 'scope'],
	analysis: ['id', 'title', 'body']
};
const rootFields = new Set([
	'schemaVersion',
	'id',
	'title',
	'createdAt',
	'updatedAt',
	'sources',
	'nodes',
	'edges',
	'rootId',
	'analysis',
	'coverage',
	'generation',
	'theme'
]);
const evidenceFields = new Set(['sourceId', 'start', 'end', 'quote', 'locator']);
const index = (value: PropertyKey) =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999;

/** Only known structural paths survive. Unknown keys can contain private source text. */
function safeField(path: PropertyKey[]): string | undefined {
	if (!path.length) return 'document';
	const [root, item, field, subitem, subfield] = path;
	if (typeof root !== 'string' || !rootFields.has(root)) return undefined;
	if (path.length === 1) return root;
	if (root === 'coverage') {
		if (path.length === 2 && ['total', 'completed', 'limitations'].includes(String(item)))
			return path.join('.');
		if (path.length === 3 && item === 'limitations' && index(field)) return path.join('.');
		return undefined;
	}
	if (root === 'generation')
		return path.length === 2 && ['mode', 'model'].includes(String(item))
			? path.join('.')
			: undefined;
	const collection = fields[root];
	if (!collection || !index(item)) return undefined;
	if (path.length === 2) return path.join('.');
	if (typeof field !== 'string' || !collection.includes(field)) return undefined;
	if (path.length === 3) return path.join('.');
	if (field === 'unitIds' && path.length === 4 && index(subitem)) return path.join('.');
	if (field === 'evidence' && index(subitem)) {
		if (path.length === 4) return path.join('.');
		if (path.length === 5 && typeof subfield === 'string' && evidenceFields.has(subfield))
			return path.join('.');
	}
	return undefined;
}

export class AnalysisValidationFailure extends Error {
	constructor(readonly diagnostic: AnalysisDiagnostic) {
		super('Source-grounded map validation failed.');
		this.name = 'AnalysisValidationFailure';
	}
}

export function schemaDiagnostic(
	stage: 'wire-schema' | 'canonical-schema',
	issue: z.core.$ZodIssue
): AnalysisDiagnostic {
	const reasons: Record<string, AnalysisDiagnostic['reason']> = {
		invalid_type: 'invalid_type',
		too_big: 'too_big',
		too_small: 'too_small',
		invalid_format: 'invalid_format',
		invalid_value: 'invalid_value',
		invalid_union: 'invalid_union',
		unrecognized_keys: 'unrecognized_keys'
	};
	const field = safeField(issue.path);
	return {
		stage,
		reason: reasons[issue.code] ?? 'schema_constraint',
		...(field ? { field } : {})
	};
}

/** Match only repository-authored invariant messages; never return the message itself. */
export function canonicalDiagnostic(cause: unknown): AnalysisDiagnostic {
	const message = cause instanceof Error ? cause.message : '';
	const rules: Array<[RegExp, AnalysisDiagnostic['stage'], AnalysisDiagnostic['reason'], string]> =
		[
			[/^Duplicate node ID\./, 'topology', 'duplicate_node', 'nodes'],
			[/^Duplicate relationship ID\./, 'topology', 'duplicate_edge', 'edges'],
			[
				/^The root must name an existing node with no parent\.$/,
				'topology',
				'invalid_root',
				'rootId'
			],
			[/^Node ".*" needs an existing parent\.$/s, 'topology', 'missing_parent', 'nodes'],
			[/^The hierarchy contains a cycle at /, 'topology', 'cycle', 'nodes'],
			[/^Relationship ".*" refers to a missing node\.$/s, 'topology', 'missing_endpoint', 'edges'],
			[/^A relationship must connect two different nodes\.$/, 'topology', 'self_edge', 'edges'],
			[
				/^Explicit node .* needs exact source evidence\./s,
				'evidence',
				'missing_explicit_evidence',
				'nodes'
			],
			[
				/^Explicit relationship .* needs exact source evidence\.$/s,
				'evidence',
				'missing_explicit_evidence',
				'edges'
			],
			[
				/^(?:Node|Relationship) .* refers to a missing source\.$/s,
				'evidence',
				'missing_source',
				'sources'
			],
			[
				/^(?:Node|Relationship) .* has evidence that does not match the exact source text\./s,
				'evidence',
				'invalid_evidence',
				'sources'
			],
			[/^Duplicate source ID\./, 'canonical-schema', 'duplicate_source', 'sources'],
			[/^Duplicate analysis section ID\./, 'canonical-schema', 'duplicate_analysis', 'analysis'],
			[
				/^Combined source text exceeds 200,000 characters\./,
				'canonical-schema',
				'source_limit',
				'sources'
			],
			[
				/^Completed coverage cannot exceed the total source segments\.$/,
				'canonical-schema',
				'coverage',
				'coverage'
			],
			[
				/^Project files must be 2 MiB or smaller\.$/,
				'canonical-schema',
				'project_size',
				'document'
			],
			[
				/^Relationship .* needs a rationale for its interpretation\.$/s,
				'evidence',
				'missing_rationale',
				'edges'
			]
		];
	const match = rules.find(([pattern]) => pattern.test(message));
	return match
		? { stage: match[1], reason: match[2], field: match[3] }
		: { stage: 'unexpected', reason: 'normalizer_exception' };
}

export function analysisDiagnostic(cause: unknown): AnalysisDiagnostic {
	return cause instanceof AnalysisValidationFailure
		? cause.diagnostic
		: { stage: 'unexpected', reason: 'normalizer_exception' };
}
