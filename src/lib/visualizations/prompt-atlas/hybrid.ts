import { analyzePrompt } from './analysis';
import { prepareSemanticInput, type SourceFragment } from './compression';
import { validateOntology } from './validation';
import {
	MAX_NODES,
	MAX_RELATIONS,
	type Attribute,
	type Evidence,
	type OntologyIssue,
	type PromptOntology
} from './types';

const instructionKinds = new Set(['task', 'audience', 'output', 'constraint', 'example']);
const normaliseLabel = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const overlaps = (first: Evidence[], second: Evidence[]) =>
	first.some((left) => second.some((right) => left.start < right.end && right.start < left.end));
const escapeExpression = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const directlyNegated = (text: string, claim: string) =>
	new RegExp(`\\b(?:not|no|never|without|avoid)\\b[^.;\\n]{0,35}\\b(?:${claim})\\b`, 'i').test(
		text
	);
const hasNegatedStorageClaim = (attribute: Attribute) => {
	const text = attribute.evidence.map((span) => span.quote).join('\n');
	return (
		(attribute.primaryKey === true && directlyNegated(text, 'primary\\s+key')) ||
		(attribute.unique === true && directlyNegated(text, 'unique')) ||
		(Boolean(attribute.foreignKey) && directlyNegated(text, 'references|foreign\\s+key')) ||
		(Boolean(attribute.dataType) && directlyNegated(text, escapeExpression(attribute.dataType!)))
	);
};

/** Preserve explicit local instruction anchors and storage facts a semantic reader omitted.
 * The semantic graph remains authoritative: existing claims are never rewritten,
 * and subject joins require one exact normalised label match, never fuzzy matching. */
export function preserveInstructionLayer(
	semanticOntology: PromptOntology,
	inspectedFragments?: SourceFragment[]
): PromptOntology {
	const result = validateOntology(semanticOntology);
	if (result.mode !== 'semantic') return result;
	if (inspectedFragments) {
		if (inspectedFragments.length > 1000)
			throw new Error('Inspected source fragments exceed the excerpt limit.');
		const ids = new Set<string>();
		let previousEnd = 0;
		const source = result.source.text;
		const splitsCodePoint = (offset: number) =>
			offset > 0 &&
			offset < source.length &&
			/[\uD800-\uDBFF]/u.test(source[offset - 1]) &&
			/[\uDC00-\uDFFF]/u.test(source[offset]);
		for (const fragment of inspectedFragments) {
			const end = fragment.start + fragment.text.length;
			if (
				!/^[a-zA-Z][a-zA-Z0-9_-]{0,95}$/.test(fragment.id) ||
				ids.has(fragment.id) ||
				!Number.isInteger(fragment.start) ||
				fragment.start < previousEnd ||
				!fragment.text ||
				end > source.length ||
				splitsCodePoint(fragment.start) ||
				splitsCodePoint(end) ||
				source.slice(fragment.start, end) !== fragment.text
			)
				throw new Error('Inspected source fragments do not match the original prompt.');
			ids.add(fragment.id);
			previousEnd = end;
		}
	}
	const usedIds = new Set(
		[...result.nodes, ...result.relations, ...result.issues].map((item) => item.id)
	);
	function identifier(base: string) {
		const stem = `hybrid-${base}`.slice(0, 88);
		let candidate = stem;
		let suffix = 1;
		while (usedIds.has(candidate)) candidate = `${stem}-${suffix++}`;
		usedIds.add(candidate);
		return candidate;
	}
	function addIssue(kind: OntologyIssue['kind'], description: string) {
		if (result.issues.some((issue) => issue.description === description)) return;
		// Fresh semantic drafts have at most 60 issues. Never delete an existing
		// claim from an imported full-capacity graph merely to add a diagnostic.
		if (result.issues.length >= 200) return;
		result.issues.push({ id: identifier('instruction-check'), kind, description, evidence: [] });
	}
	let local: PromptOntology;
	try {
		local = analyzePrompt(result.source.text);
	} catch {
		addIssue(
			'unsupported',
			'The local instruction check could not complete. The valid AI interpretation has been preserved without additional instruction anchors.'
		);
		return validateOntology(result);
	}
	const prepared =
		inspectedFragments === undefined && result.compression?.applied
			? prepareSemanticInput(result.source.text)
			: undefined;
	const fragments = inspectedFragments ?? prepared?.fragments;
	if (result.compression?.applied && !fragments) {
		addIssue(
			'limit',
			'Local instruction anchors were not added because the inspected semantic excerpt boundaries could not be reproduced safely. The AI interpretation is preserved.'
		);
		return validateOntology(result);
	}
	// Atomic provider source IDs stay separate. Coverage is their exact union:
	// a local quote may cross touching units, but never an omitted source gap.
	const coverage = fragments?.reduce<{ start: number; end: number }[]>((ranges, fragment) => {
		const previous = ranges.at(-1);
		const end = fragment.start + fragment.text.length;
		if (previous?.end === fragment.start) previous.end = end;
		else ranges.push({ start: fragment.start, end });
		return ranges;
	}, []);
	const evidenceWithinCoverage = (evidence: Evidence[]) =>
		coverage
			? evidence.filter((span) =>
					coverage.some((range) => range.start <= span.start && span.end <= range.end)
				)
			: evidence;
	const mapping = new Map<string, string>();
	const localById = new Map(local.nodes.map((node) => [node.id, node]));
	let limited = false;
	for (const node of local.nodes) {
		if (!instructionKinds.has(node.kind) || node.provenance !== 'explicit') continue;
		const evidence = evidenceWithinCoverage(node.evidence);
		if (!evidence.length) continue;
		const existing = result.nodes.find(
			(candidate) =>
				candidate.layer === 'instruction' &&
				candidate.kind === node.kind &&
				overlaps(evidence, candidate.evidence)
		);
		if (existing) {
			mapping.set(node.id, existing.id);
			continue;
		}
		if (result.nodes.length >= MAX_NODES) {
			limited = true;
			continue;
		}
		const id = identifier(node.id);
		result.nodes.push({
			...node,
			id,
			evidence,
			rationale: [
				node.rationale,
				'Retained by the deterministic local instruction check from explicit source text.'
			]
				.filter(Boolean)
				.join(' ')
		});
		mapping.set(node.id, id);
	}
	const subjects = local.nodes.filter((candidate) => candidate.layer === 'subject');
	for (const node of subjects) {
		const label = normaliseLabel(node.label);
		if (subjects.filter((candidate) => normaliseLabel(candidate.label) === label).length !== 1)
			continue;
		const matches = result.nodes.filter(
			(candidate) => candidate.layer === 'subject' && normaliseLabel(candidate.label) === label
		);
		if (matches.length !== 1) continue;
		const existing = matches[0];
		mapping.set(node.id, existing.id);
		for (const attribute of node.attributes) {
			if (attribute.provenance !== 'explicit' || hasNegatedStorageClaim(attribute)) continue;
			const evidence = evidenceWithinCoverage(attribute.evidence);
			if (!evidence.length || evidence.length !== attribute.evidence.length) continue;
			// An existing attribute is a complete AI or user claim. Retain it as-is
			// rather than merge conflicting values, storage types or provenance.
			if (
				existing.attributes.some(
					(candidate) => normaliseLabel(candidate.name) === normaliseLabel(attribute.name)
				)
			)
				continue;
			if (existing.attributes.length >= 100) {
				limited = true;
				continue;
			}
			existing.attributes.push({
				...attribute,
				evidence,
				rationale: [
					attribute.rationale,
					'Retained by the deterministic local reader from explicit source text.'
				]
					.filter(Boolean)
					.join(' ')
			});
		}
	}
	if (!result.databaseTarget && local.databaseTarget) {
		const target = local.databaseTarget;
		const expression = new RegExp(escapeExpression(target), 'gi');
		const inspectedTarget = [...result.source.text.matchAll(expression)].some((match) => {
			const before = result.source.text.slice(Math.max(0, match.index - 80), match.index);
			const after = result.source.text.slice(
				match.index + match[0].length,
				match.index + match[0].length + 50
			);
			if (directlyNegated(before + match[0], escapeExpression(target))) return false;
			if (/^\s+(?:(?:must|should|will|is|be|to)\s+)*(?:not|never)\b/i.test(after)) return false;
			return (
				evidenceWithinCoverage([
					{ start: match.index, end: match.index + match[0].length, quote: match[0] }
				]).length > 0
			);
		});
		if (inspectedTarget) result.databaseTarget = target;
	}
	const relationKey = (from: string, to: string, kind: string) => JSON.stringify([from, to, kind]);
	const localRelationsByKey = new Map<string, typeof local.relations>();
	for (const relation of local.relations) {
		const from = mapping.get(relation.from);
		const to = mapping.get(relation.to);
		if (!from || !to) continue;
		const key = relationKey(from, to, relation.kind);
		localRelationsByKey.set(key, [...(localRelationsByKey.get(key) ?? []), relation]);
	}
	for (const relation of result.relations) {
		const key = relationKey(relation.from, relation.to, relation.kind);
		const matches = localRelationsByKey.get(key);
		if (!matches || matches.length !== 1 || matches[0].provenance !== 'explicit') continue;
		if (
			result.relations.filter(
				(candidate) => relationKey(candidate.from, candidate.to, candidate.kind) === key
			).length !== 1
		)
			continue;
		const localRelation = matches[0];
		const guard = relation.guard === undefined ? localRelation.guard : undefined;
		const cardinality = relation.cardinality === undefined ? localRelation.cardinality : undefined;
		if (guard === undefined && cardinality === undefined) continue;
		const evidence = evidenceWithinCoverage(localRelation.evidence);
		if (!evidence.length || evidence.length !== localRelation.evidence.length) continue;
		const additions = evidence.filter(
			(span) =>
				!relation.evidence.some(
					(existing) => existing.start === span.start && existing.end === span.end
				)
		);
		if (relation.evidence.length + additions.length > 16) {
			limited = true;
			continue;
		}
		if (guard !== undefined) relation.guard = guard;
		if (cardinality !== undefined) relation.cardinality = cardinality;
		relation.evidence.push(...additions);
	}
	for (const relation of local.relations) {
		if (relation.provenance !== 'explicit') continue;
		if (
			!instructionKinds.has(localById.get(relation.from)?.kind ?? '') &&
			!instructionKinds.has(localById.get(relation.to)?.kind ?? '')
		)
			continue;
		const from = mapping.get(relation.from);
		const to = mapping.get(relation.to);
		if (!from || !to) continue;
		const evidence = evidenceWithinCoverage(relation.evidence);
		if (!evidence.length) continue;
		// Preserve the AI's existing account of a directed connection rather than
		// add a second wording or notation for the same instruction relationship.
		if (result.relations.some((candidate) => candidate.from === from && candidate.to === to))
			continue;
		if (result.relations.length >= MAX_RELATIONS) {
			limited = true;
			continue;
		}
		result.relations.push({ ...relation, id: identifier(relation.id), from, to, evidence });
	}
	if (limited)
		addIssue(
			'limit',
			'The graph reached an item, relationship, attribute or evidence capacity. Some explicit local facts could not be added; their original text remains available.'
		);
	return validateOntology(result);
}
