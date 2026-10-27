import Dexie, { type Table } from 'dexie';
import {
	DEFAULT_SETTINGS,
	type AnalysisSettings,
	type AtlasProgress,
	type AtlasProject,
	type EdgeAggregate,
	type EvidenceRef,
	type ImportSource,
	type SourceRecord,
	type TermAggregate
} from './types';

export const SOURCE_CHUNK_CHARS = 16_384;
export type SourceChunk = {
	sourceId: string;
	projectId: string;
	index: number;
	start: number;
	text: string;
};
export type StoredSource = SourceRecord & {
	imported: boolean;
	importedBytes: number;
	textAvailable: boolean;
};
export type StoredTerm = TermAggregate & { projectId: string };
export type StoredEdge = EdgeAggregate & { projectId: string };
export type AnalysisCheckpoint = {
	projectId: string;
	signature: string;
	sourceIndex: number;
	chunkIndex: number;
	extractor?: unknown;
	words: number;
	sourceWords: number;
	bytes: number;
};

class AtlasDatabase extends Dexie {
	projects!: Table<AtlasProject, string>;
	sources!: Table<StoredSource, string>;
	chunks!: Table<SourceChunk, [string, number]>;
	terms!: Table<StoredTerm, [string, string]>;
	edges!: Table<StoredEdge, [string, string]>;
	checkpoints!: Table<AnalysisCheckpoint, string>;
	constructor() {
		super('suvro-knowledge-gap-atlas');
		this.version(1).stores({
			projects: 'id, updatedAt',
			sources: 'id, projectId',
			chunks: '[sourceId+index], [sourceId+start], sourceId, projectId',
			terms: '[projectId+id], projectId',
			edges: '[projectId+id], projectId',
			checkpoints: 'projectId'
		});
	}
}

let instance: AtlasDatabase | undefined;
export function atlasDB(): AtlasDatabase {
	instance ??= new AtlasDatabase();
	return instance;
}

export function createId(): string {
	return crypto.randomUUID();
}
export async function createProject(name = 'Untitled atlas'): Promise<AtlasProject> {
	const now = new Date().toISOString();
	const project: AtlasProject = {
		id: createId(),
		name,
		createdAt: now,
		updatedAt: now,
		settings: structuredClone(DEFAULT_SETTINGS),
		questions: [],
		dismissed: [],
		pins: [],
		topicNames: {}
	};
	await atlasDB().projects.put(project);
	return project;
}
export async function listProjects(): Promise<AtlasProject[]> {
	return atlasDB().projects.orderBy('updatedAt').reverse().toArray();
}
export async function getProject(id: string): Promise<AtlasProject | undefined> {
	return atlasDB().projects.get(id);
}
export async function saveProject(project: AtlasProject): Promise<void> {
	const db = atlasDB();
	await db.transaction('rw', [db.projects, db.sources], async () => {
		const current = await db.projects.get(project.id);
		if (!current)
			throw new Error('This atlas was removed in another tab. Create a new atlas to continue.');
		const sources = await db.sources.where('projectId').equals(project.id).toArray();
		const signature = sourceSignature(sources);
		const matches = (result: AtlasProject['result']) =>
			Boolean(result && sourceSignature(result.sources) === signature);
		const result = matches(project.result)
			? project.result
			: matches(current.result)
				? current.result
				: undefined;
		await db.projects.put({
			...structuredClone(project),
			result: result ? structuredClone(result) : undefined,
			updatedAt: new Date().toISOString()
		});
	});
}

/** The worker holds this same lock. Never nest this helper for one project. */
export async function withProjectMutation<T>(
	projectId: string,
	action: () => Promise<T>
): Promise<T> {
	if (typeof navigator !== 'undefined' && navigator.locks) {
		return navigator.locks.request(
			`knowledge-gap-atlas:${projectId}`,
			{ ifAvailable: true },
			async (lock) => {
				if (!lock)
					throw new Error(
						'This atlas is busy in another tab. Pause its analysis or wait for its source changes to finish, then try again.'
					);
				return action();
			}
		);
	}
	return action();
}
export async function listSources(projectId: string): Promise<SourceRecord[]> {
	return atlasDB().sources.where('projectId').equals(projectId).toArray();
}
export async function deleteProject(projectId: string): Promise<void> {
	return withProjectMutation(projectId, () => deleteProjectUnlocked(projectId));
}
async function deleteProjectUnlocked(projectId: string): Promise<void> {
	const db = atlasDB();
	await db.transaction(
		'rw',
		[db.projects, db.sources, db.chunks, db.terms, db.edges, db.checkpoints],
		async () => {
			await Promise.all([
				db.projects.delete(projectId),
				db.sources.where('projectId').equals(projectId).delete(),
				db.chunks.where('projectId').equals(projectId).delete(),
				db.terms.where('projectId').equals(projectId).delete(),
				db.edges.where('projectId').equals(projectId).delete(),
				db.checkpoints.delete(projectId)
			]);
		}
	);
}
export async function invalidateAnalysis(projectId: string): Promise<void> {
	return withProjectMutation(projectId, () => invalidateAnalysisUnlocked(projectId));
}
async function invalidateAnalysisUnlocked(projectId: string): Promise<void> {
	const db = atlasDB();
	await db.transaction('rw', [db.projects, db.terms, db.edges, db.checkpoints], async () => {
		await Promise.all([
			db.terms.where('projectId').equals(projectId).delete(),
			db.edges.where('projectId').equals(projectId).delete(),
			db.checkpoints.delete(projectId)
		]);
		await db.projects.update(projectId, { result: undefined, updatedAt: new Date().toISOString() });
	});
}
export async function removeSource(projectId: string, sourceId: string): Promise<void> {
	return withProjectMutation(projectId, () => removeSourceUnlocked(projectId, sourceId));
}
async function removeSourceUnlocked(projectId: string, sourceId: string): Promise<void> {
	const db = atlasDB();
	const source = await db.sources.get(sourceId);
	if (source?.projectId !== projectId)
		throw new Error('This source does not belong to this atlas.');
	await db.transaction('rw', [db.sources, db.chunks], async () => {
		await db.chunks.where('sourceId').equals(sourceId).delete();
		await db.sources.delete(sourceId);
	});
	await invalidateAnalysisUnlocked(projectId);
}

export function abortIfRequested(signal?: AbortSignal): void {
	if (signal?.aborted)
		throw new DOMException(
			'Import paused. Reselect the incomplete file to import it again.',
			'AbortError'
		);
}

/** UTF-16 chunks preserve the original text exactly; the extractor carries split code points. */
export function* splitText(text: string, size = SOURCE_CHUNK_CHARS): Generator<string> {
	if (!Number.isSafeInteger(size) || size < 1) throw new Error('Invalid chunk size.');
	for (let start = 0; start < text.length; start += size) yield text.slice(start, start + size);
}

export function utf8ByteLength(text: string): number {
	let bytes = 0;
	for (let i = 0; i < text.length; i++) {
		const code = text.codePointAt(i)!;
		if (code <= 0x7f) bytes++;
		else if (code <= 0x7ff) bytes += 2;
		else if (code <= 0xffff) bytes += 3;
		else {
			bytes += 4;
			i++;
		}
	}
	return bytes;
}

export async function addSources(
	projectId: string,
	inputs: ImportSource[],
	onProgress?: (progress: AtlasProgress) => void,
	signal?: AbortSignal
): Promise<void> {
	return withProjectMutation(projectId, () =>
		addSourcesUnlocked(projectId, inputs, onProgress, signal)
	);
}
async function addSourcesUnlocked(
	projectId: string,
	inputs: ImportSource[],
	onProgress?: (progress: AtlasProgress) => void,
	signal?: AbortSignal
): Promise<void> {
	const db = atlasDB();
	if (!(await db.projects.get(projectId))) throw new Error('This atlas could not be found.');
	const encoder = new TextEncoder();
	const totalBytes = inputs.reduce(
		(sum, input) => sum + (input.file?.size ?? utf8ByteLength(input.text ?? '')),
		0
	);
	let finishedBytes = 0;
	await invalidateAnalysisUnlocked(projectId);
	for (const input of inputs) {
		abortIfRequested(signal);
		const id = createId();
		const bytes = input.file?.size ?? utf8ByteLength(input.text ?? '');
		const source: StoredSource = {
			id,
			projectId,
			name: input.name || 'Untitled source',
			role: input.role,
			bytes,
			chars: 0,
			words: 0,
			processedBytes: 0,
			status: 'queued',
			imported: false,
			importedBytes: 0,
			textAvailable: true
		};
		await db.sources.add(source);
		let index = 0;
		let hash = 2166136261;
		const store = async (text: string) => {
			for (const part of splitText(text)) {
				abortIfRequested(signal);
				for (let i = 0; i < part.length; i++) hash = Math.imul(hash ^ part.charCodeAt(i), 16777619);
				const chunk: SourceChunk = {
					projectId,
					sourceId: id,
					index,
					start: source.chars,
					text: part
				};
				await db.transaction('rw', [db.chunks, db.sources], async () => {
					await db.chunks.add(chunk);
					await db.sources.update(id, {
						chars: source.chars + part.length,
						importedBytes: source.importedBytes
					});
				});
				source.chars += part.length;
				index++;
			}
		};
		try {
			if (input.file) {
				const reader = input.file.stream().getReader();
				const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
				try {
					for (;;) {
						abortIfRequested(signal);
						const { value, done } = await reader.read();
						if (done) break;
						source.importedBytes += value.byteLength;
						await store(decoder.decode(value, { stream: true }));
						onProgress?.({
							phase: 'Saving source text locally',
							bytes: finishedBytes + source.importedBytes,
							totalBytes,
							words: 0,
							sourceName: source.name
						});
					}
					await store(decoder.decode());
				} finally {
					await reader.cancel().catch(() => undefined);
					reader.releaseLock();
				}
			} else {
				for (const part of splitText(input.text ?? '')) {
					source.importedBytes = Math.min(
						bytes,
						source.importedBytes + encoder.encode(part).byteLength
					);
					await store(part);
					onProgress?.({
						phase: 'Saving source text locally',
						bytes: finishedBytes + source.importedBytes,
						totalBytes,
						words: 0,
						sourceName: source.name
					});
				}
			}
			await db.sources.update(id, {
				imported: true,
				importedBytes: bytes,
				chars: source.chars,
				hash: `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
			});
			finishedBytes += bytes;
		} catch (error) {
			await db.sources
				.update(id, {
					status: 'error',
					error: `Import incomplete: ${storageError(error)} Remove this source and reselect the original file to retry.`
				})
				.catch(() => undefined);
			throw error;
		}
	}
	await db.projects.update(projectId, { updatedAt: new Date().toISOString() });
}

export function storageError(error: unknown): string {
	if (error instanceof Error && /quota/i.test(`${error.name} ${error.message}`))
		return 'This browser has run out of local storage. Your committed data is preserved. Export an atlas or remove an old project, then retry.';
	return error instanceof Error
		? error.message
		: 'The operation could not finish. Your committed source text is preserved.';
}

export async function readSourcePage(
	projectId: string,
	sourceId: string,
	start = 0,
	length = 4000
): Promise<{ text: string; totalChars: number; start: number }> {
	const db = atlasDB();
	const source = await db.sources.get(sourceId);
	if (!source || source.projectId !== projectId) throw new Error('Source not found in this atlas.');
	if (!source.textAvailable)
		throw new Error(
			'Source text was not included in this project export. The analysis and research plan are still available.'
		);
	start = Math.min(source.chars, Math.max(0, Math.floor(start)));
	length = Math.max(0, Math.floor(length));
	const first = await db.chunks
		.where('[sourceId+start]')
		.between([sourceId, 0], [sourceId, start], true, true)
		.last();
	let index = first?.index ?? 0;
	let text = '';
	const end = Math.min(source.chars, start + length);
	while (text.length < end - start) {
		const chunk = await db.chunks.get([sourceId, index++]);
		if (!chunk || chunk.start >= end) break;
		text += chunk.text.slice(Math.max(0, start - chunk.start), Math.max(0, end - chunk.start));
	}
	return { text, totalChars: source.chars, start };
}

export async function readEvidence(
	projectId: string,
	ref: EvidenceRef,
	context = 160
): Promise<{ text: string; start: number; end: number; sourceName: string; clipped: boolean }> {
	const source = await atlasDB().sources.get(ref.sourceId);
	if (!source || source.projectId !== projectId)
		throw new Error('The source for this evidence is unavailable.');
	const window = evidenceWindow(ref, source.chars, context);
	const page = await readSourcePage(projectId, ref.sourceId, window.sourceStart, window.length);
	return {
		text: page.text,
		start: Math.min(page.text.length, ref.start - window.sourceStart),
		end: Math.min(page.text.length, ref.end - window.sourceStart),
		sourceName: source.name,
		clipped: window.clipped
	};
}

export const EVIDENCE_PREVIEW_CHARS = 4000;
export function evidenceWindow(
	ref: EvidenceRef,
	totalChars: number,
	context = 160
): { sourceStart: number; length: number; clipped: boolean } {
	if (
		!Number.isSafeInteger(ref.start) ||
		!Number.isSafeInteger(ref.end) ||
		ref.start < 0 ||
		ref.end < ref.start ||
		ref.end > totalChars
	)
		throw new Error('The evidence reference is outside its original source.');
	const margin = Number.isFinite(context) ? Math.max(0, Math.min(1000, Math.floor(context))) : 160;
	const sourceStart = Math.max(0, ref.start - margin);
	const requestedEnd = Math.min(totalChars, ref.end + margin);
	const end = Math.min(requestedEnd, sourceStart + EVIDENCE_PREVIEW_CHARS);
	return { sourceStart, length: end - sourceStart, clipped: end < requestedEnd };
}

/** Sort identifiers so portable project import order cannot invalidate a valid result. */
export function sourceSignature(sources: SourceRecord[]): string {
	return JSON.stringify(
		sources
			.map(({ id, hash, chars, bytes, role }) => ({ id, hash, chars, bytes, role }))
			.sort((a, b) => a.id.localeCompare(b.id))
	);
}

export function analysisSignature(settings: AnalysisSettings, sources: SourceRecord[]): string {
	return JSON.stringify({
		settings,
		sources: sources.map(({ id, hash, chars, role }) => ({ id, hash, chars, role }))
	});
}

/** Keep representative spans for every source; findings choose a smaller diverse view. */
export function mergeEvidence(a: EvidenceRef[], b: EvidenceRef[], perSource = 6): EvidenceRef[] {
	const bySource = new Map<string, EvidenceRef[]>();
	for (const ref of [...a, ...b]) {
		let samples = bySource.get(ref.sourceId);
		if (!samples) {
			samples = [];
			bySource.set(ref.sourceId, samples);
		}
		if (
			samples.length < perSource &&
			!samples.some((entry) => entry.start === ref.start && entry.end === ref.end)
		)
			samples.push(ref);
	}
	return [...bySource.values()].flat();
}

export function mergeCounts(
	a: Record<string, number>,
	b: Record<string, number>
): Record<string, number> {
	const result: Record<string, number> = Object.assign(Object.create(null), a);
	for (const [key, value] of Object.entries(b)) result[key] = (result[key] ?? 0) + value;
	return result;
}
