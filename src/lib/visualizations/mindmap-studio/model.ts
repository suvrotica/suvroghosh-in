import { z } from 'zod';
import type { Evidence, StudioNode, StudioProject } from './types';

export const LIMITS = {
	sources: 8,
	sourceCharacters: 100_000,
	totalCharacters: 200_000,
	nodes: 500,
	edges: 1_500,
	evidencePerItem: 16,
	quoteCharacters: 2_000,
	importBytes: 2 * 1024 * 1024
} as const;

const identifier = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, underscores or hyphens in IDs.');
const status = z.enum(['explicit', 'inferred', 'speculative']);
const safeUrl = z
	.string()
	.max(2_000)
	.refine((value) => {
		try {
			return ['https:', 'http:'].includes(new URL(value).protocol);
		} catch {
			return false;
		}
	}, 'Source links must be complete HTTP or HTTPS URLs.');
const evidenceSchema = z
	.object({
		sourceId: identifier,
		start: z.number().int().nonnegative(),
		end: z.number().int().positive(),
		quote: z.string().min(1).max(LIMITS.quoteCharacters),
		locator: z.string().max(160).optional()
	})
	.strict();
export const sourceSchema = z
	.object({
		id: identifier,
		title: z.string().min(1).max(240),
		kind: z.enum(['text', 'transcript', 'pdf', 'url']),
		text: z.string().min(1).max(LIMITS.sourceCharacters),
		url: safeUrl.optional(),
		scope: z.string().max(1_000).optional()
	})
	.strict();
export const projectSchema = z
	.object({
		schemaVersion: z.literal(1),
		id: identifier,
		title: z.string().min(1).max(240),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
		sources: z.array(sourceSchema).max(LIMITS.sources),
		nodes: z
			.array(
				z
					.object({
						id: identifier,
						parentId: identifier.nullable(),
						label: z.string().min(1).max(240),
						description: z.string().max(8_000),
						category: z.string().min(1).max(80),
						status,
						evidence: z.array(evidenceSchema).max(LIMITS.evidencePerItem),
						notes: z.string().max(8_000),
						reviewed: z.boolean(),
						collapsed: z.boolean(),
						color: z
							.string()
							.regex(/^#[0-9a-fA-F]{6}$/)
							.optional()
					})
					.strict()
			)
			.min(1)
			.max(LIMITS.nodes),
		edges: z
			.array(
				z
					.object({
						id: identifier,
						from: identifier,
						to: identifier,
						type: z.string().min(1).max(80),
						status,
						evidence: z.array(evidenceSchema).max(LIMITS.evidencePerItem),
						rationale: z.string().max(4_000)
					})
					.strict()
			)
			.max(LIMITS.edges),
		rootId: identifier,
		analysis: z
			.array(
				z
					.object({
						id: identifier,
						title: z.string().min(1).max(240),
						body: z.string().max(20_000)
					})
					.strict()
			)
			.max(24),
		coverage: z
			.object({
				total: z.number().int().nonnegative().max(200_000),
				completed: z.number().int().nonnegative().max(200_000),
				limitations: z.array(z.string().max(2_000)).max(50)
			})
			.strict(),
		generation: z
			.object({
				mode: z.enum(['example', 'manual', 'local', 'ai', 'import']),
				model: z.string().max(200).optional()
			})
			.strict(),
		theme: z.enum(['paper', 'night'])
	})
	.strict();

export function newId(prefix = 'item'): string {
	return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`;
}

export function createBlankProject(): StudioProject {
	const now = new Date().toISOString();
	return {
		schemaVersion: 1,
		id: newId('map'),
		title: 'An idea worth exploring',
		createdAt: now,
		updatedAt: now,
		sources: [],
		rootId: 'root',
		nodes: [
			{
				id: 'root',
				parentId: null,
				label: 'An idea worth exploring',
				description: '',
				category: 'topic',
				status: 'inferred',
				evidence: [],
				notes: '',
				reviewed: false,
				collapsed: false
			}
		],
		edges: [],
		analysis: [],
		coverage: { total: 0, completed: 0, limitations: [] },
		generation: { mode: 'manual' },
		theme: 'paper'
	};
}

export function validateProject(input: unknown): StudioProject {
	let value = input;
	if (typeof input === 'string') {
		if (new TextEncoder().encode(input).byteLength > LIMITS.importBytes)
			throw new Error('Project files must be 2 MiB or smaller.');
		try {
			value = JSON.parse(input);
		} catch {
			throw new Error('This file is not valid JSON. Choose an editable Mindmap Studio project.');
		}
	}
	const parsed = projectSchema.safeParse(value);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new Error(`Invalid project at ${issue.path.join('.') || 'document'}: ${issue.message}`);
	}
	const project = parsed.data as StudioProject;
	if (new TextEncoder().encode(JSON.stringify(project)).byteLength > LIMITS.importBytes)
		throw new Error('Project files must be 2 MiB or smaller.');
	const unique = (ids: string[], kind: string) => {
		if (new Set(ids).size !== ids.length)
			throw new Error(`Duplicate ${kind} ID. Every ${kind} needs a unique ID.`);
	};
	unique(
		project.sources.map((source) => source.id),
		'source'
	);
	unique(
		project.nodes.map((node) => node.id),
		'node'
	);
	unique(
		project.edges.map((edge) => edge.id),
		'relationship'
	);
	unique(
		project.analysis.map((section) => section.id),
		'analysis section'
	);
	if (project.sources.reduce((sum, source) => sum + source.text.length, 0) > LIMITS.totalCharacters)
		throw new Error(
			'Combined source text exceeds 200,000 characters. Split this project into smaller sources.'
		);
	if (project.coverage.completed > project.coverage.total)
		throw new Error('Completed coverage cannot exceed the total source segments.');
	const sources = new Map(project.sources.map((source) => [source.id, source]));
	const nodes = new Map(project.nodes.map((node) => [node.id, node]));
	const root = nodes.get(project.rootId);
	if (!root || root.parentId !== null)
		throw new Error('The root must name an existing node with no parent.');
	const checkEvidence = (evidence: Evidence[], owner: string) => {
		for (const item of evidence) {
			const source = sources.get(item.sourceId);
			if (!source) throw new Error(`${owner} refers to a missing source.`);
			if (
				item.start >= item.end ||
				item.end > source.text.length ||
				source.text.slice(item.start, item.end) !== item.quote
			)
				throw new Error(
					`${owner} has evidence that does not match the exact source text. Check its UTF-16 start and end positions.`
				);
		}
	};
	for (const node of project.nodes) {
		if (node.id !== root.id && (!node.parentId || !nodes.has(node.parentId)))
			throw new Error(`Node "${node.label}" needs an existing parent.`);
		const visited = new Set<string>();
		let cursor: StudioNode | undefined = node;
		while (cursor) {
			if (visited.has(cursor.id))
				throw new Error(`The hierarchy contains a cycle at "${node.label}".`);
			visited.add(cursor.id);
			cursor = cursor.parentId ? nodes.get(cursor.parentId) : undefined;
		}
		if (node.status === 'explicit' && !node.evidence.length)
			throw new Error(
				`Explicit node "${node.label}" needs exact source evidence. Use inferred or speculative for your own ideas.`
			);
		checkEvidence(node.evidence, `Node "${node.label}"`);
	}
	for (const edge of project.edges) {
		if (!nodes.has(edge.from) || !nodes.has(edge.to))
			throw new Error(`Relationship "${edge.type}" refers to a missing node.`);
		if (edge.from === edge.to) throw new Error('A relationship must connect two different nodes.');
		if (edge.status === 'explicit' && !edge.evidence.length)
			throw new Error(`Explicit relationship "${edge.type}" needs exact source evidence.`);
		if (edge.status !== 'explicit' && !edge.rationale.trim())
			throw new Error(`Relationship "${edge.type}" needs a rationale for its interpretation.`);
		checkEvidence(edge.evidence, `Relationship "${edge.type}"`);
	}
	return project;
}

function changed(project: StudioProject): StudioProject {
	return { ...project, updatedAt: new Date().toISOString() };
}

export function addNode(
	project: StudioProject,
	parentId: string,
	label = 'New idea'
): StudioProject {
	const next = structuredClone(project);
	next.nodes.push({
		id: newId('node'),
		parentId,
		label,
		description: '',
		category: 'concept',
		status: 'inferred',
		evidence: [],
		notes: '',
		reviewed: false,
		collapsed: false
	});
	return validateProject(changed(next));
}

export function deleteNode(project: StudioProject, nodeId: string): StudioProject {
	if (project.rootId === nodeId)
		throw new Error('The central topic cannot be deleted. Start a new map to clear the project.');
	if (!project.nodes.some((node) => node.id === nodeId))
		throw new Error('This node no longer exists.');
	const remove = new Set([nodeId]);
	let added = true;
	while (added) {
		added = false;
		for (const node of project.nodes)
			if (node.parentId && remove.has(node.parentId) && !remove.has(node.id)) {
				remove.add(node.id);
				added = true;
			}
	}
	return validateProject(
		changed({
			...project,
			nodes: project.nodes.filter((node) => !remove.has(node.id)),
			edges: project.edges.filter((edge) => !remove.has(edge.from) && !remove.has(edge.to))
		})
	);
}

export function moveNode(project: StudioProject, nodeId: string, parentId: string): StudioProject {
	if (nodeId === project.rootId)
		throw new Error('The central topic cannot be moved inside another branch.');
	if (!project.nodes.some((node) => node.id === nodeId))
		throw new Error('This node no longer exists.');
	return validateProject(
		changed({
			...project,
			nodes: project.nodes.map((node) => (node.id === nodeId ? { ...node, parentId } : node))
		})
	);
}
