import { validateOntology } from './validation';
import type { ModelId, PromptOntology } from './types';

export const SESSION_STORAGE_KEY = 'suvro-prompt-atlas-session-v1';
export const MAX_SESSION_BYTES = 512 * 1024;
const modelIds: ModelId[] = [
	'mindmap',
	'concept',
	'flowchart',
	'conceptual-er',
	'logical',
	'physical',
	'class',
	'sequence',
	'state',
	'usecase'
];
export type AtlasSession = {
	format: 'prompt-atlas-session';
	version: 1;
	model: ModelId;
	ontology: PromptOntology;
};

export function createSession(ontology: PromptOntology, model: ModelId): AtlasSession {
	const session: AtlasSession = {
		format: 'prompt-atlas-session',
		version: 1,
		model,
		ontology: validateOntology(ontology)
	};
	// Check the actual pretty-printed export, which is larger than compact local
	// storage. Every session we save or export must fit the same restore boundary.
	if (new TextEncoder().encode(JSON.stringify(session, null, 2)).byteLength > MAX_SESSION_BYTES)
		throw new Error(
			'This session exceeds 512 KiB after formatting. Shorten the prompt or remove details before saving or exporting a restorable session.'
		);
	return session;
}

export function parseSession(text: string): AtlasSession {
	if (new TextEncoder().encode(text).byteLength > MAX_SESSION_BYTES)
		throw new Error('Session is larger than 512 KiB.');
	const value: unknown = JSON.parse(text);
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Choose a Prompt Atlas session JSON file.');
	const session = value as Record<string, unknown>;
	if (
		session.format !== 'prompt-atlas-session' ||
		session.version !== 1 ||
		!modelIds.includes(session.model as ModelId)
	) {
		throw new Error(
			'This is not a supported Prompt Atlas session. A report without source text cannot be restored.'
		);
	}
	return createSession(validateOntology(session.ontology), session.model as ModelId);
}

/** A redacted report is deliberately not an importable session. Evidence quotes
 * and user text are excluded; labels can still contain sensitive information. */
export function createReport(ontology: PromptOntology, model: ModelId) {
	const scrubEvidence = <T extends { evidence: unknown[] }>(item: T) => ({ ...item, evidence: [] });
	return {
		format: 'prompt-atlas-report',
		version: 1,
		model,
		sourceIncluded: false,
		analysisMode: ontology.mode,
		schemaVersion: ontology.schemaVersion,
		...(ontology.databaseTarget ? { databaseTarget: ontology.databaseTarget } : {}),
		nodes: ontology.nodes.map((node) => ({
			...scrubEvidence(node),
			attributes: node.attributes.map(scrubEvidence)
		})),
		relations: ontology.relations.map(scrubEvidence),
		issues: ontology.issues.map(scrubEvidence)
	};
}
