import { z } from 'zod';
import {
	atlasDB,
	createId,
	deleteProject,
	getProject,
	readEvidence,
	type SourceChunk,
	type StoredSource
} from './storage';
import type { AnalysisResult, AtlasProject, SourceRecord } from './types';

const finite = z.number().finite();
const count = finite.nonnegative();
const integer = count.int().safe();
const dictionary = <T extends z.ZodType>(value: T) =>
	z.record(
		z
			.string()
			.refine(
				(key) => !['__proto__', 'prototype', 'constructor'].includes(key),
				'Unsafe object key'
			),
		value
	);
const evidence = z
	.object({ sourceId: z.string(), start: integer, end: integer })
	.refine((ref) => ref.end >= ref.start, 'Invalid evidence offsets');
const settings = z.object({
	window: integer.min(1).max(100),
	minCount: integer.min(1),
	resolution: finite.positive().max(100),
	excluded: z.array(z.string()),
	aliases: dictionary(z.string()),
	seed: integer
});
const source = z.object({
	id: z.string(),
	projectId: z.string(),
	name: z.string(),
	role: z.enum(['target', 'reference']),
	bytes: integer,
	chars: integer,
	words: integer,
	processedBytes: integer,
	status: z.enum(['queued', 'processing', 'complete', 'paused', 'error']),
	error: z.string().optional(),
	hash: z.string().optional()
});
const concept = z.object({
	id: z.string(),
	label: z.string(),
	count,
	sources: dictionary(count),
	evidence: z.array(evidence),
	phrase: z.boolean(),
	score: finite,
	degree: count,
	community: integer,
	targetCount: count,
	referenceCount: count
});
const edge = z.object({
	id: z.string(),
	source: z.string(),
	target: z.string(),
	count,
	sources: dictionary(count),
	evidence: z.array(evidence),
	weight: finite
});
const topic = z.object({
	id: integer,
	label: z.string(),
	terms: z.array(z.string()),
	count,
	sources: dictionary(count),
	targetCount: count,
	referenceCount: count
});
const finding = z.object({
	id: z.string(),
	kind: z.enum(['gap', 'bridge', 'fragile', 'peripheral', 'coverage', 'concentration']),
	title: z.string(),
	explanation: z.string(),
	question: z.string(),
	concepts: z.array(z.string()),
	topics: z.array(integer),
	evidence: z.array(evidence),
	priority: finite,
	factors: z.object({ relevance: finite, deficit: finite, support: finite }),
	caveat: z.string()
});
const question = z.object({
	id: z.string(),
	text: z.string(),
	note: z.string(),
	status: z.enum(['investigate', 'addressed', 'dismissed']),
	findingId: z.string().optional(),
	evidence: z.array(evidence)
});
const projectHeader = z.object({
	id: z.string(),
	name: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	settings,
	dismissed: z.array(z.string()),
	pins: z.array(z.string()),
	topicNames: dictionary(z.string())
});
const resultHeader = z.object({
	version: z.literal(1),
	settings,
	words: count,
	totalTerms: count,
	totalEdges: count,
	analysedAt: z.string(),
	scope: z.string()
});

export const exportRecordSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('atlas'),
		format: z.literal('knowledge-gap-atlas'),
		version: z.literal(1),
		includeSources: z.boolean(),
		project: projectHeader
	}),
	z.object({
		type: z.literal('source'),
		source,
		imported: z.boolean(),
		importedBytes: integer,
		textAvailable: z.boolean()
	}),
	z.object({
		type: z.literal('chunk'),
		sourceId: z.string(),
		index: integer,
		start: integer,
		text: z.string()
	}),
	z.object({ type: z.literal('question'), question }),
	z.object({ type: z.literal('result'), result: resultHeader }),
	z.object({ type: z.literal('concept'), concept }),
	z.object({ type: z.literal('edge'), edge }),
	z.object({ type: z.literal('topic'), topic }),
	z.object({ type: z.literal('finding'), finding }),
	z.object({
		type: z.literal('end'),
		format: z.literal('knowledge-gap-atlas'),
		version: z.literal(1)
	})
]);
type ExportRecord = z.infer<typeof exportRecordSchema>;

export function parseExportRecord(line: string): ExportRecord {
	const value: unknown = JSON.parse(line, (key, entry: unknown) => {
		if (['__proto__', 'prototype', 'constructor'].includes(key))
			throw new Error('Unsafe object key in imported atlas.');
		return entry;
	});
	return exportRecordSchema.parse(value);
}

export async function* projectRecords(
	projectId: string,
	includeSources: boolean
): AsyncGenerator<string> {
	const db = atlasDB();
	const project = await getProject(projectId);
	if (!project) throw new Error('Atlas not found.');
	const { result, questions, ...metadata } = project;
	const line = (record: ExportRecord) => `${JSON.stringify(record)}\n`;
	yield line({
		type: 'atlas',
		format: 'knowledge-gap-atlas',
		version: 1,
		includeSources,
		project: metadata
	});
	const sources = await db.sources.where('projectId').equals(projectId).toArray();
	for (const entry of sources) {
		yield line({
			type: 'source',
			source: source.parse(entry),
			imported: entry.imported,
			importedBytes: entry.importedBytes,
			textAvailable: includeSources && entry.textAvailable
		});
		if (includeSources && entry.textAvailable) {
			let index = 0;
			for (;;) {
				const chunk = await db.chunks.get([entry.id, index++]);
				if (!chunk) break;
				yield line({
					type: 'chunk',
					sourceId: entry.id,
					index: chunk.index,
					start: chunk.start,
					text: chunk.text
				});
			}
		}
	}
	for (const entry of questions) yield line({ type: 'question', question: entry });
	if (result) {
		const { concepts, edges, topics, findings } = result;
		const header = {
			version: result.version,
			settings: result.settings,
			words: result.words,
			totalTerms: result.totalTerms,
			totalEdges: result.totalEdges,
			analysedAt: result.analysedAt,
			scope: result.scope
		};
		yield line({ type: 'result', result: header });
		for (const entry of concepts) yield line({ type: 'concept', concept: entry });
		for (const entry of edges) yield line({ type: 'edge', edge: entry });
		for (const entry of topics) yield line({ type: 'topic', topic: entry });
		for (const entry of findings) yield line({ type: 'finding', finding: entry });
	}
	yield line({ type: 'end', format: 'knowledge-gap-atlas', version: 1 });
}

export function safeFilename(value: string): string {
	return (
		value
			.normalize('NFKC')
			.replace(/[^\p{L}\p{N}._-]+/gu, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 100) || 'knowledge-gap-atlas'
	);
}

export function downloadText(
	text: string,
	filename: string,
	mime = 'text/plain;charset=utf-8'
): void {
	downloadBlob(new Blob([text], { type: mime }), filename);
}
function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type SavePickerWindow = Window & {
	showSaveFilePicker?: (options: {
		suggestedName: string;
		types: { description: string; accept: Record<string, string[]> }[];
	}) => Promise<{
		createWritable(): Promise<{
			write(chunk: string): Promise<void>;
			close(): Promise<void>;
			abort(): Promise<void>;
		}>;
	}>;
};

/** Stream to disk when available; fallback parts are independently bounded at 8 MiB. */
export async function exportProject(
	projectId: string,
	includeSources = false
): Promise<{ parts: number; streamed: boolean }> {
	const project = await getProject(projectId);
	if (!project) throw new Error('Atlas not found.');
	const name = safeFilename(project.name);
	const picker = (window as SavePickerWindow).showSaveFilePicker;
	if (picker) {
		const handle = await picker.call(window, {
			suggestedName: `${name}.atlas.ndjson`,
			types: [
				{
					description: 'Knowledge Gap Atlas project',
					accept: { 'application/x-ndjson': ['.ndjson'] }
				}
			]
		});
		const writer = await handle.createWritable();
		try {
			for await (const record of projectRecords(projectId, includeSources))
				await writer.write(record);
			await writer.close();
		} catch (error) {
			await writer.abort().catch(() => undefined);
			throw error;
		}
		return { parts: 1, streamed: true };
	}
	const encoder = new TextEncoder();
	let parts: string[] = [];
	let bytes = 0;
	let number = 0;
	const flush = () => {
		if (!parts.length) return;
		downloadBlob(
			new Blob(parts, { type: 'application/x-ndjson' }),
			`${name}.part-${String(++number).padStart(4, '0')}.atlas.ndjson`
		);
		parts = [];
		bytes = 0;
	};
	for await (const record of projectRecords(projectId, includeSources)) {
		const size = encoder.encode(record).byteLength;
		if (bytes && bytes + size > 8 * 1024 * 1024) flush();
		parts.push(record);
		bytes += size;
	}
	flush();
	return { parts: number, streamed: false };
}

export async function* readLines(file: Blob): AsyncGenerator<string> {
	const reader = file.stream().getReader();
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let pending = '';
	try {
		for (;;) {
			const { value, done } = await reader.read();
			pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
			let newline: number;
			while ((newline = pending.indexOf('\n')) !== -1) {
				const line = pending.slice(0, newline).replace(/\r$/, '');
				pending = pending.slice(newline + 1);
				if (line.trim()) yield line;
			}
			if (done) break;
		}
		if (pending.trim()) yield pending;
	} finally {
		await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}

export async function importProject(input: File | File[]): Promise<AtlasProject> {
	const files = (Array.isArray(input) ? input : [input])
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	const db = atlasDB();
	let project: AtlasProject | undefined;
	let includeSources = false;
	let ended = false;
	const sourceMap = new Map<string, string>();
	const importedSources = new Map<string, StoredSource>();
	const chunkPositions = new Map<string, { index: number; chars: number }>();
	const mapRef = (ref: z.infer<typeof evidence>) => {
		const sourceId = sourceMap.get(ref.sourceId);
		const entry = importedSources.get(ref.sourceId);
		if (!sourceId || !entry || ref.end > entry.chars)
			throw new Error('An evidence reference points outside its source.');
		return { ...ref, sourceId };
	};
	const mapSources = (counts: Record<string, number>) => {
		const result: Record<string, number> = Object.create(null);
		for (const [id, value] of Object.entries(counts)) {
			const mapped = sourceMap.get(id);
			if (!mapped) throw new Error('An analysis record refers to an unknown source.');
			result[mapped] = value;
		}
		return result;
	};
	try {
		for (const file of files)
			for await (const line of readLines(file)) {
				const record = parseExportRecord(line);
				if (ended) throw new Error('Unexpected records after the end of this atlas.');
				if (record.type === 'atlas') {
					if (project) throw new Error('Select parts of one atlas at a time.');
					includeSources = record.includeSources;
					project = {
						...record.project,
						id: createId(),
						name: `${record.project.name} (imported)`,
						updatedAt: new Date().toISOString(),
						questions: []
					};
					await db.projects.add(project);
					continue;
				}
				if (!project)
					throw new Error('Missing atlas header. Select every exported part, including part 0001.');
				switch (record.type) {
					case 'source': {
						if (sourceMap.has(record.source.id)) throw new Error('Duplicate source identifier.');
						const id = createId();
						const entry: StoredSource = {
							...record.source,
							id,
							projectId: project.id,
							imported: record.imported,
							importedBytes: record.importedBytes,
							textAvailable: includeSources && record.textAvailable
						};
						sourceMap.set(record.source.id, id);
						importedSources.set(record.source.id, entry);
						await db.sources.add(entry);
						break;
					}
					case 'chunk': {
						const id = sourceMap.get(record.sourceId);
						if (!includeSources || !id) throw new Error('Unexpected source-text record.');
						const previous = chunkPositions.get(record.sourceId) ?? { index: 0, chars: 0 };
						if (record.index !== previous.index || record.start !== previous.chars)
							throw new Error('Source chunks are missing, duplicated, or out of order.');
						const chunk: SourceChunk = {
							projectId: project.id,
							sourceId: id,
							index: record.index,
							start: record.start,
							text: record.text
						};
						await db.chunks.add(chunk);
						chunkPositions.set(record.sourceId, {
							index: previous.index + 1,
							chars: previous.chars + record.text.length
						});
						break;
					}
					case 'question':
						project.questions.push({
							...record.question,
							evidence: record.question.evidence.map(mapRef)
						});
						break;
					case 'result': {
						if (project.result) throw new Error('Duplicate analysis header.');
						project.result = {
							...record.result,
							sources: [...importedSources.values()],
							concepts: [],
							edges: [],
							topics: [],
							findings: []
						};
						break;
					}
					case 'concept': {
						if (!project.result) throw new Error('Missing analysis header.');
						project.result.concepts.push({
							...record.concept,
							sources: mapSources(record.concept.sources),
							evidence: record.concept.evidence.map(mapRef)
						});
						break;
					}
					case 'edge': {
						if (!project.result) throw new Error('Missing analysis header.');
						project.result.edges.push({
							...record.edge,
							sources: mapSources(record.edge.sources),
							evidence: record.edge.evidence.map(mapRef)
						});
						break;
					}
					case 'topic': {
						if (!project.result) throw new Error('Missing analysis header.');
						project.result.topics.push({
							...record.topic,
							sources: mapSources(record.topic.sources)
						});
						break;
					}
					case 'finding': {
						if (!project.result) throw new Error('Missing analysis header.');
						project.result.findings.push({
							...record.finding,
							evidence: record.finding.evidence.map(mapRef)
						});
						break;
					}
					case 'end':
						ended = true;
						break;
				}
			}
		if (!project || !ended)
			throw new Error('The export is incomplete. Select every exported part and try again.');
		if (includeSources)
			for (const [oldId, entry] of importedSources) {
				if (entry.textAvailable && (chunkPositions.get(oldId)?.chars ?? 0) !== entry.chars)
					throw new Error(`Source text is incomplete for ${entry.name}.`);
			}
		validateResultReferences(project.result);
		await db.projects.put(project);
		return project;
	} catch (error) {
		if (project) await deleteProject(project.id).catch(() => undefined);
		throw error;
	}
}

export function validateResultReferences(result?: AnalysisResult): void {
	if (!result) return;
	const concepts = new Set(result.concepts.map((entry) => entry.id));
	const topics = new Set(result.topics.map((entry) => entry.id));
	if (concepts.size !== result.concepts.length || topics.size !== result.topics.length)
		throw new Error('Duplicate concepts or topics in the analysis.');
	if (new Set(result.edges.map((entry) => entry.id)).size !== result.edges.length)
		throw new Error('Duplicate relationships in the analysis.');
	if (
		result.concepts.some((entry) => !topics.has(entry.community)) ||
		result.edges.some((entry) => !concepts.has(entry.source) || !concepts.has(entry.target)) ||
		result.topics.some((entry) => entry.terms.some((id) => !concepts.has(id))) ||
		result.findings.some(
			(entry) =>
				entry.concepts.some((id) => !concepts.has(id)) || entry.topics.some((id) => !topics.has(id))
		)
	)
		throw new Error('An analysis relationship refers to a missing concept or topic.');
}

export function csvCell(value: unknown): string {
	let text = String(value ?? '');
	if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
	return `"${text.replace(/"/g, '""')}"`;
}
export function buildConceptCsv(result: AnalysisResult): string {
	return [
		['concept', 'topic', 'occurrences', 'documents', 'target', 'reference', 'specificity'],
		...result.concepts.map((entry) => [
			entry.label,
			result.topics.find((t) => t.id === entry.community)?.label ?? entry.community,
			entry.count,
			Object.keys(entry.sources).length,
			entry.targetCount,
			entry.referenceCount,
			entry.score
		])
	]
		.map((row) => row.map(csvCell).join(','))
		.join('\r\n');
}
export function buildEdgeCsv(result: AnalysisResult): string {
	const labels = new Map(result.concepts.map((entry) => [entry.id, entry.label]));
	return [
		['source', 'target', 'cooccurrences', 'documents', 'association_strength', 'relationship'],
		...result.edges.map((entry) => [
			labels.get(entry.source) ?? entry.source,
			labels.get(entry.target) ?? entry.target,
			entry.count,
			Object.keys(entry.sources).length,
			entry.weight,
			'observed co-occurrence'
		])
	]
		.map((row) => row.map(csvCell).join(','))
		.join('\r\n');
}
export function exportTables(result: AnalysisResult): void {
	downloadText(buildConceptCsv(result), 'atlas-concepts.csv', 'text/csv;charset=utf-8');
	downloadText(buildEdgeCsv(result), 'atlas-relationships.csv', 'text/csv;charset=utf-8');
}

function plainMarkdown(text: string): string {
	return text.replace(/[\\`*_{}[\]<>#|]/g, '\\$&');
}
function evidenceLabel(
	ref: { sourceId: string; start: number; end: number },
	sources: SourceRecord[]
): string {
	return `${sources.find((entry) => entry.id === ref.sourceId)?.name ?? 'Source'} · UTF-16 offsets ${ref.start}–${ref.end}`;
}
export function buildReport(project: AtlasProject): string {
	const result = project.result;
	const lines = [
		`# ${plainMarkdown(project.name)}`,
		'',
		'Created with Knowledge Gap Atlas · browser-local algorithmic analysis',
		'',
		'## Research plan',
		''
	];
	for (const [i, entry] of project.questions.entries()) {
		lines.push(
			`### ${i + 1}. ${plainMarkdown(entry.text)}`,
			'',
			`Status: ${entry.status}`,
			'',
			plainMarkdown(entry.note),
			''
		);
		for (const ref of entry.evidence)
			lines.push(`- ${plainMarkdown(evidenceLabel(ref, result?.sources ?? []))}`);
		lines.push('');
	}
	if (!project.questions.length) lines.push('No research questions saved yet.', '');
	if (result) {
		lines.push(
			'## Analysis',
			'',
			`${result.words.toLocaleString()} words · ${result.concepts.length.toLocaleString()} concepts · ${result.topics.length} topics`,
			'',
			plainMarkdown(result.scope),
			'',
			'## Findings',
			''
		);
		for (const entry of result.findings.filter(
			(finding) => !project.dismissed.includes(finding.id)
		)) {
			lines.push(
				`### ${plainMarkdown(entry.title)}`,
				'',
				plainMarkdown(entry.explanation),
				'',
				`Investigate: ${plainMarkdown(entry.question)}`,
				'',
				`Limit: ${plainMarkdown(entry.caveat)}`,
				''
			);
			for (const ref of entry.evidence)
				lines.push(`- ${plainMarkdown(evidenceLabel(ref, result.sources))}`);
			lines.push('');
		}
		lines.push(
			'## Reproducibility',
			'',
			`Engine: Knowledge Gap Atlas ${result.version}`,
			`Analysed: ${result.analysedAt}`,
			'',
			'```json',
			JSON.stringify(result.settings, null, 2),
			'```',
			'',
			'## Sources',
			''
		);
		for (const entry of result.sources)
			lines.push(
				`- ${plainMarkdown(entry.name)} (${entry.role}, ${entry.words} words, ${entry.hash ?? 'no fingerprint'})`
			);
	}
	lines.push(
		'',
		'## Interpretation',
		'',
		'Findings describe this supplied corpus under its extraction settings. Co-occurrence is not causation. A heuristic priority is not a probability or a measure of truth. Browser storage depends on this device; keep an exported backup.',
		''
	);
	return lines.join('\n');
}

export async function exportReport(project: AtlasProject, includeExcerpts = false): Promise<void> {
	let report = buildReport(project);
	if (includeExcerpts) {
		report += '\n## Saved source excerpts\n\n';
		for (const question of project.questions)
			for (const ref of question.evidence) {
				try {
					const entry = await readEvidence(project.id, ref, 80);
					report += `### ${plainMarkdown(question.text)}\n\n${plainMarkdown(entry.sourceName)}\n\n${entry.text
						.split('\n')
						.map((line) => `> ${plainMarkdown(line)}`)
						.join('\n')}\n\n`;
					if (entry.clipped)
						report += `Excerpt shortened for display. The complete passage remains in the original source at UTF-16 offsets ${ref.start}–${ref.end}; open that source in the atlas to continue reading.\n\n`;
				} catch {
					report += 'Source excerpt unavailable in this export.\n\n';
				}
			}
	}
	downloadText(report, `${safeFilename(project.name)}-research.md`, 'text/markdown;charset=utf-8');
}
