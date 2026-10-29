import { z } from 'zod';
import { LIMITS, projectSchema, validateProject } from './model';
import type { StudioProject } from './types';

export function exportProject(project: StudioProject): string {
	const validated = validateProject(project);
	const pretty = JSON.stringify(validated, null, 2);
	return new TextEncoder().encode(pretty).byteLength <= LIMITS.importBytes
		? pretty
		: JSON.stringify(validated);
}

function markdown(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/([\\`*_[\]{}])/g, '\\$1');
}

export function exportMarkdown(input: StudioProject): string {
	const project = validateProject(input);
	const sources = new Map(project.sources.map((source) => [source.id, source]));
	const result = [
		`# ${markdown(project.title)}`,
		'',
		`Mode: ${project.generation.mode}. Source coverage: ${project.coverage.completed}/${project.coverage.total} segments.`,
		'',
		'## Mind map',
		''
	];
	const walk = (parent: string | null, depth: number) => {
		for (const node of project.nodes.filter((item) => item.parentId === parent)) {
			result.push(`${'  '.repeat(depth)}- **${markdown(node.label)}** [${node.status}]`);
			if (node.description)
				result.push(`${'  '.repeat(depth + 1)}${markdown(node.description).replace(/\n/g, ' ')}`);
			for (const evidence of node.evidence)
				result.push(
					`${'  '.repeat(depth + 1)}Source: ${markdown(sources.get(evidence.sourceId)?.title ?? evidence.sourceId)}, ${markdown(evidence.locator ?? `characters ${evidence.start}–${evidence.end}`)}.`
				);
			walk(node.id, depth + 1);
		}
	};
	walk(null, 0);
	result.push('', '## Relationships', '');
	for (const edge of project.edges) {
		const from = project.nodes.find((node) => node.id === edge.from)!;
		const to = project.nodes.find((node) => node.id === edge.to)!;
		result.push(
			`- ${markdown(from.label)} → **${markdown(edge.type)}** → ${markdown(to.label)} [${edge.status}]${edge.rationale ? `: ${markdown(edge.rationale)}` : ''}`
		);
	}
	for (const section of project.analysis)
		result.push('', `## ${markdown(section.title)}`, '', markdown(section.body));
	if (project.coverage.limitations.length)
		result.push(
			'',
			'## Limitations',
			'',
			...project.coverage.limitations.map((item) => `- ${markdown(item)}`)
		);
	result.push(
		'',
		'This report contains extracted source content, and descriptions may repeat source passages. Complete source bodies and private notes are included only in the editable project export.',
		''
	);
	return result.join('\n');
}

function mermaidLabel(value: string): string {
	return value
		.replace(/&/g, '#amp;')
		.replace(/"/g, '#quot;')
		.replace(/</g, '#60;')
		.replace(/>/g, '#62;')
		.replace(/\[/g, '#91;')
		.replace(/\]/g, '#93;')
		.replace(/[\r\n\t]/g, ' ')
		.replace(/`/g, '#96;');
}

export function exportMermaidMindmap(input: StudioProject): string {
	const project = validateProject(input);
	const ids = new Map(project.nodes.map((node, index) => [node.id, `n${index}`]));
	const lines = ['mindmap'];
	const walk = (parentId: string | null, depth: number) => {
		for (const node of project.nodes.filter((item) => item.parentId === parentId)) {
			lines.push(`${'  '.repeat(depth + 1)}${ids.get(node.id)}["${mermaidLabel(node.label)}"]`);
			walk(node.id, depth + 1);
		}
	};
	walk(null, 0);
	return lines.join('\n');
}

export function exportMermaidGraph(input: StudioProject): string {
	const project = validateProject(input);
	const ids = new Map(project.nodes.map((node, index) => [node.id, `n${index}`]));
	return [
		'flowchart LR',
		...project.nodes.map((node) => `  ${ids.get(node.id)}["${mermaidLabel(node.label)}"]`),
		...project.edges.map(
			(edge) =>
				`  ${ids.get(edge.from)} ${edge.status === 'explicit' ? '-->' : '-.->'}|"${mermaidLabel(`${edge.type} · ${edge.status}`)}"| ${ids.get(edge.to)}`
		)
	].join('\n');
}

/** Deliberately not an editable project: no source bodies, quotations, notes or original URLs. */
export function createPublicSnapshot(input: StudioProject) {
	const project = validateProject(input);
	return {
		format: 'mindmap-studio-public' as const,
		schemaVersion: 1 as const,
		title: project.title,
		rootId: project.rootId,
		theme: project.theme,
		nodes: project.nodes.map(
			({ id, parentId, label, description, category, status, collapsed, color }) => ({
				id,
				parentId,
				label,
				description,
				category,
				status,
				collapsed,
				...(color ? { color } : {})
			})
		),
		edges: project.edges.map(({ id, from, to, type, status, rationale }) => ({
			id,
			from,
			to,
			type,
			status,
			rationale
		})),
		coverage: { total: project.coverage.total, completed: project.coverage.completed },
		notice:
			'Source bodies, exact evidence, private notes and source URLs are omitted. Labels, descriptions and relationship rationales still contain extracted or authored content. Review before sharing.'
	};
}

export function exportPublicSnapshot(project: StudioProject): string {
	return JSON.stringify(createPublicSnapshot(project), null, 2);
}

export const publicSnapshotSchema = z
	.object({
		format: z.literal('mindmap-studio-public'),
		schemaVersion: z.literal(1),
		title: projectSchema.shape.title,
		rootId: projectSchema.shape.rootId,
		theme: projectSchema.shape.theme,
		nodes: z
			.array(
				projectSchema.shape.nodes.element.omit({ evidence: true, notes: true, reviewed: true })
			)
			.min(1)
			.max(LIMITS.nodes),
		edges: z.array(projectSchema.shape.edges.element.omit({ evidence: true })).max(LIMITS.edges),
		coverage: projectSchema.shape.coverage.omit({ limitations: true }),
		notice: z.string().max(1_000)
	})
	.strict();
export type PublicSnapshot = z.infer<typeof publicSnapshotSchema>;

/** Validate public data independently; omitted evidence must never be fabricated for display. */
export function validatePublicSnapshot(input: unknown): PublicSnapshot {
	let value = input;
	if (typeof value === 'string') {
		if (new TextEncoder().encode(value).byteLength > LIMITS.importBytes)
			throw new Error('Published maps must be 2 MiB or smaller.');
		try {
			value = JSON.parse(value);
		} catch {
			throw new Error('The published map is not valid JSON.');
		}
	}
	const parsed = publicSnapshotSchema.safeParse(value);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new Error(
			`Invalid published map at ${issue.path.join('.') || 'document'}: ${issue.message}`
		);
	}
	const snapshot = parsed.data;
	if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > LIMITS.importBytes)
		throw new Error('Published maps must be 2 MiB or smaller.');
	const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
	if (nodes.size !== snapshot.nodes.length)
		throw new Error('The published map has duplicate node IDs.');
	if (new Set(snapshot.edges.map((edge) => edge.id)).size !== snapshot.edges.length)
		throw new Error('The published map has duplicate relationship IDs.');
	const root = nodes.get(snapshot.rootId);
	if (!root || root.parentId !== null)
		throw new Error('The published map has no valid central topic.');
	for (const node of snapshot.nodes) {
		if (node.id !== root.id && (!node.parentId || !nodes.has(node.parentId)))
			throw new Error('A published branch has a missing parent.');
		const seen = new Set<string>();
		let current: typeof node | undefined = node;
		while (current) {
			if (seen.has(current.id)) throw new Error('The published map hierarchy contains a cycle.');
			seen.add(current.id);
			current = current.parentId ? nodes.get(current.parentId) : undefined;
		}
	}
	for (const edge of snapshot.edges)
		if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to)
			throw new Error('A published relationship has invalid endpoints.');
	if (snapshot.coverage.completed > snapshot.coverage.total)
		throw new Error('Published source coverage is inconsistent.');
	return snapshot;
}

/** Renderer-only projection. Its marker intentionally makes editable project validation fail. */
export function snapshotForDisplay(
	input: PublicSnapshot
): StudioProject & { readonlySnapshot: true } {
	const snapshot = validatePublicSnapshot(input);
	return {
		readonlySnapshot: true,
		schemaVersion: 1,
		id: 'published-mindmap',
		title: snapshot.title,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		sources: [],
		rootId: snapshot.rootId,
		theme: snapshot.theme,
		nodes: snapshot.nodes.map((node) => ({
			...node,
			parentId: node.parentId ?? null,
			evidence: [],
			notes: '',
			reviewed: false
		})),
		edges: snapshot.edges.map((edge) => ({ ...edge, evidence: [] })),
		analysis: [],
		coverage: {
			...snapshot.coverage,
			limitations: [
				'The public snapshot omits original source text and evidence excerpts. Status labels are the author’s classifications.'
			]
		},
		generation: { mode: 'import' }
	};
}
