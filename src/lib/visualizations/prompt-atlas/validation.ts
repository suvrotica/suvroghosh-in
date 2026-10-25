import { z } from 'zod';
import { MAX_CODE_POINTS, MAX_NODES, MAX_RELATIONS, type PromptOntology } from './types';

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,95}$/);
const provenance = z.enum(['explicit', 'inferred', 'user-confirmed']);
const evidence = z.strictObject({
	start: z
		.number()
		.int()
		.min(0)
		.max(MAX_CODE_POINTS * 2),
	end: z
		.number()
		.int()
		.min(1)
		.max(MAX_CODE_POINTS * 2),
	quote: z
		.string()
		.min(1)
		.max(MAX_CODE_POINTS * 2)
});
const evidenceList = z.array(evidence).max(16);
const attribute = z.strictObject({
	name: z.string().min(1).max(200),
	value: z.string().max(1000).optional(),
	dataType: z.string().max(100).optional(),
	primaryKey: z.boolean().optional(),
	unique: z.boolean().optional(),
	foreignKey: z.string().max(200).optional(),
	provenance,
	evidence: evidenceList,
	rationale: z.string().max(1000).optional()
});
const ontologySchema = z.strictObject({
	schemaVersion: z.literal(1),
	source: z.strictObject({
		text: z.string().max(MAX_CODE_POINTS * 2),
		revision: z.string().min(1).max(100)
	}),
	mode: z.enum(['local', 'semantic']),
	analysisMetadata: z
		.strictObject({
			provider: z.string().trim().min(1).max(80),
			model: z.string().trim().min(1).max(160)
		})
		.optional(),
	compression: z
		.strictObject({
			originalCodePoints: z.number().int().min(0).max(MAX_CODE_POINTS),
			analysedCodePoints: z.number().int().min(0).max(MAX_CODE_POINTS),
			omittedCodePoints: z.number().int().min(0).max(MAX_CODE_POINTS),
			duplicateCodePoints: z.number().int().min(0).max(MAX_CODE_POINTS),
			fragmentCount: z.number().int().min(0).max(1000),
			applied: z.boolean()
		})
		.optional(),
	language: z.enum(['en', 'mixed', 'unknown']),
	nodes: z
		.array(
			z.strictObject({
				id,
				label: z.string().min(1).max(500),
				kind: z.enum([
					'task',
					'audience',
					'output',
					'constraint',
					'example',
					'actor',
					'object',
					'concept',
					'system',
					'action',
					'state',
					'table'
				]),
				layer: z.enum(['instruction', 'subject']),
				provenance,
				evidence: evidenceList,
				rationale: z.string().max(1000).optional(),
				attributes: z.array(attribute).max(100)
			})
		)
		.max(MAX_NODES),
	relations: z
		.array(
			z.strictObject({
				id,
				from: id,
				to: id,
				label: z.string().min(1).max(2000),
				kind: z.enum([
					'association',
					'dependency',
					'transition',
					'message',
					'owns',
					'inheritance',
					'contains',
					'condition'
				]),
				provenance,
				evidence: evidenceList,
				rationale: z.string().max(1000).optional(),
				guard: z.string().max(1000).optional(),
				cardinality: z.string().max(200).optional()
			})
		)
		.max(MAX_RELATIONS),
	issues: z
		.array(
			z.strictObject({
				id,
				kind: z.enum(['ambiguity', 'contradiction', 'missing-detail', 'limit', 'unsupported']),
				description: z.string().min(1).max(2000),
				evidence: evidenceList,
				alternatives: z.array(z.string().max(1000)).max(8).optional(),
				resolved: z.boolean().optional()
			})
		)
		.max(200),
	databaseTarget: z.string().max(100).optional()
});

function rejectUnsafeKeys(value: unknown, depth = 0): void {
	if (depth > 20) throw new Error('The session is nested too deeply.');
	if (!value || typeof value !== 'object') return;
	const prototype = Object.getPrototypeOf(value);
	if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
		throw new Error('The session must contain plain data objects.');
	}
	for (const [key, child] of Object.entries(value)) {
		if (['__proto__', 'prototype', 'constructor'].includes(key))
			throw new Error('The session contains an unsafe property.');
		rejectUnsafeKeys(child, depth + 1);
	}
}

/** Shared trust boundary for analysis results and imported, user-edited sessions. */
export function validateOntology(value: unknown): PromptOntology {
	rejectUnsafeKeys(value);
	const parsed = ontologySchema.safeParse(value);
	if (!parsed.success)
		throw new Error(
			`Invalid Prompt Atlas session: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`
		);
	const result = parsed.data;
	if (Array.from(result.source.text).length > MAX_CODE_POINTS)
		throw new Error(
			`Analysis supports at most ${MAX_CODE_POINTS.toLocaleString('en')} code points.`
		);
	if (result.compression) {
		const coverage = result.compression;
		if (
			coverage.originalCodePoints !== Array.from(result.source.text).length ||
			coverage.analysedCodePoints + coverage.omittedCodePoints !== coverage.originalCodePoints ||
			coverage.duplicateCodePoints > coverage.omittedCodePoints
		)
			throw new Error('Compression coverage does not match the original prompt.');
		if (
			!coverage.applied &&
			(coverage.omittedCodePoints !== 0 || coverage.duplicateCodePoints !== 0)
		)
			throw new Error('Uncompressed analysis cannot claim omitted text.');
	}
	const identifiers = [...result.nodes, ...result.relations, ...result.issues].map(
		(item) => item.id
	);
	if (new Set(identifiers).size !== identifiers.length)
		throw new Error('Every node, relationship and issue must have a unique identifier.');
	const nodeIds = new Set(result.nodes.map((node) => node.id));
	for (const relation of result.relations) {
		if (!nodeIds.has(relation.from) || !nodeIds.has(relation.to))
			throw new Error('A relationship refers to a missing node.');
	}
	const claims = [
		...result.nodes,
		...result.relations,
		...result.nodes.flatMap((node) => node.attributes)
	];
	for (const claim of claims) {
		if (claim.provenance !== 'user-confirmed' && !claim.evidence.length)
			throw new Error('Extracted claims need source evidence.');
		if (result.mode === 'semantic' && claim.provenance === 'inferred' && !claim.rationale?.trim())
			throw new Error('Inferred semantic claims need a brief rationale.');
	}
	for (const item of [...claims, ...result.issues]) {
		for (const span of item.evidence) {
			if (span.end <= span.start || result.source.text.slice(span.start, span.end) !== span.quote) {
				throw new Error('Source evidence does not match the original prompt.');
			}
		}
	}
	return result;
}
