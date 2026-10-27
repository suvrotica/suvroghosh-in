import { StreamingExtractor, analyseAggregates, type ExtractorSnapshot } from './engine';
import {
	analysisSignature,
	atlasDB,
	mergeCounts,
	mergeEvidence,
	storageError,
	type AnalysisCheckpoint,
	type SourceChunk
} from './storage';
import type { AnalysisDelta, WorkerRequest, WorkerResponse } from './types';

const context = self as unknown as {
	postMessage(message: WorkerResponse): void;
	onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
let running: string | undefined;
let cancelled: string | undefined;

async function commitDelta(
	projectId: string,
	delta: AnalysisDelta,
	checkpoint: AnalysisCheckpoint,
	sourceId: string,
	complete: boolean,
	processedBytes: number,
	sourceWords: number
): Promise<void> {
	const db = atlasDB();
	await db.transaction('rw', [db.terms, db.edges, db.checkpoints, db.sources], async () => {
		const oldTerms = await db.terms.bulkGet(delta.terms.map((term) => [projectId, term.id]));
		await db.terms.bulkPut(
			delta.terms.map((term, i) => {
				const old = oldTerms[i];
				return old
					? {
							...old,
							count: old.count + term.count,
							sources: mergeCounts(old.sources, term.sources),
							evidence: mergeEvidence(old.evidence, term.evidence)
						}
					: { ...term, projectId };
			})
		);
		const oldEdges = await db.edges.bulkGet(delta.edges.map((edge) => [projectId, edge.id]));
		await db.edges.bulkPut(
			delta.edges.map((edge, i) => {
				const old = oldEdges[i];
				return old
					? {
							...old,
							count: old.count + edge.count,
							sources: mergeCounts(old.sources, edge.sources),
							evidence: mergeEvidence(old.evidence, edge.evidence)
						}
					: { ...edge, projectId };
			})
		);
		await db.checkpoints.put(checkpoint);
		await db.sources.update(sourceId, {
			words: sourceWords,
			processedBytes,
			status: complete ? 'complete' : 'processing',
			error: undefined
		});
	});
}

async function run(request: Extract<WorkerRequest, { type: 'analyse' }>): Promise<void> {
	const { jobId, projectId, settings } = request;
	const db = atlasDB();
	const send = (message: WorkerResponse) => context.postMessage(message);
	let activeSource: string | undefined;
	try {
		let sources = await db.sources.where('projectId').equals(projectId).toArray();
		if (!sources.length) throw new Error('Add some source text before building a map.');
		if (sources.some((source) => !source.imported))
			throw new Error(
				'An import is incomplete. Remove that source and reselect its original file before analysing.'
			);
		if (sources.some((source) => !source.textAvailable))
			throw new Error(
				'This project was exported without source text. Add the original sources to build a new analysis.'
			);
		const signature = analysisSignature(settings, sources);
		const totalBytes = sources.reduce((sum, source) => sum + source.bytes, 0);
		let checkpoint = await db.checkpoints.get(projectId);
		if (!checkpoint || checkpoint.signature !== signature) {
			checkpoint = {
				projectId,
				signature,
				sourceIndex: 0,
				chunkIndex: 0,
				words: 0,
				sourceWords: 0,
				bytes: 0
			};
			await db.transaction('rw', [db.terms, db.edges, db.checkpoints, db.sources], async () => {
				await db.terms.where('projectId').equals(projectId).delete();
				await db.edges.where('projectId').equals(projectId).delete();
				await db.checkpoints.put(checkpoint!);
				await db.sources
					.where('projectId')
					.equals(projectId)
					.modify({ words: 0, processedBytes: 0, status: 'queued', error: undefined });
			});
		}
		for (let sourceIndex = checkpoint.sourceIndex; sourceIndex < sources.length; sourceIndex++) {
			const source = sources[sourceIndex];
			activeSource = source.id;
			const extractor = new StreamingExtractor(source.id, settings);
			const resume: boolean = checkpoint.sourceIndex === sourceIndex;
			if (resume && checkpoint.extractor)
				extractor.restore(checkpoint.extractor as ExtractorSnapshot);
			let chunkIndex: number = resume ? checkpoint.chunkIndex : 0;
			let sourceWords: number = resume ? checkpoint.sourceWords : 0;
			const bytesBefore = sources
				.slice(0, sourceIndex)
				.reduce((sum, entry) => sum + entry.bytes, 0);
			for (;;) {
				if (cancelled === jobId) {
					await db.sources.update(source.id, { status: 'paused' });
					send({ type: 'cancelled', jobId });
					return;
				}
				const chunk: SourceChunk | undefined = await db.chunks.get([source.id, chunkIndex]);
				const delta = extractor.push(chunk?.text ?? '', !chunk);
				sourceWords += delta.words;
				const processedBytes = chunk
					? Math.min(
							source.bytes,
							Math.floor(
								source.bytes * ((chunk.start + chunk.text.length) / Math.max(1, source.chars))
							)
						)
					: source.bytes;
				checkpoint = {
					projectId,
					signature,
					sourceIndex: chunk ? sourceIndex : sourceIndex + 1,
					chunkIndex: chunk ? chunkIndex + 1 : 0,
					extractor: chunk ? extractor.snapshot() : undefined,
					words: checkpoint.words + delta.words,
					sourceWords: chunk ? sourceWords : 0,
					bytes: bytesBefore + processedBytes
				};
				await commitDelta(
					projectId,
					delta,
					checkpoint,
					source.id,
					!chunk,
					processedBytes,
					sourceWords
				);
				send({
					type: 'progress',
					jobId,
					progress: {
						phase: 'Reading connections',
						bytes: checkpoint.bytes,
						totalBytes,
						words: checkpoint.words,
						sourceName: source.name
					}
				});
				if (!chunk) {
					checkpoint.sourceWords = 0;
					break;
				}
				chunkIndex++;
			}
		}
		if (cancelled === jobId) {
			send({ type: 'cancelled', jobId });
			return;
		}
		send({
			type: 'progress',
			jobId,
			progress: {
				phase: 'Finding topics and research opportunities',
				bytes: totalBytes,
				totalBytes,
				words: checkpoint.words
			}
		});
		// Sources and aggregates are persisted. Global graph algorithms still require
		// memory proportional to the vocabulary/edges; errors never truncate the corpus.
		const terms = await db.terms.where('projectId').equals(projectId).toArray();
		const edges = await db.edges.where('projectId').equals(projectId).toArray();
		sources = await db.sources.where('projectId').equals(projectId).toArray();
		if (cancelled === jobId) {
			send({ type: 'cancelled', jobId });
			return;
		}
		const result = analyseAggregates(terms, edges, sources, settings);
		// Let a cancellation queued during synchronous community detection be handled
		// before publishing the resulting snapshot. The persisted index is resumable.
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		if (cancelled === jobId) {
			send({ type: 'cancelled', jobId });
			return;
		}
		await db.transaction('rw', db.projects, async () => {
			const project = await db.projects.get(projectId);
			if (!project) throw new Error('This atlas was removed while analysis was running.');
			await db.projects.put({ ...project, settings, result, updatedAt: new Date().toISOString() });
		});
		send({ type: 'complete', jobId, result });
	} catch (error) {
		if (activeSource)
			await db.sources.update(activeSource, { status: 'paused' }).catch(() => undefined);
		send({ type: 'error', jobId, message: storageError(error) });
	} finally {
		if (running === jobId) running = undefined;
	}
}

context.onmessage = ({ data }) => {
	if (data.type === 'cancel') {
		cancelled = data.jobId;
		return;
	}
	if (running) {
		context.postMessage({
			type: 'error',
			jobId: data.jobId,
			message: 'An analysis is still running. Pause it before starting another.'
		});
		return;
	}
	running = data.jobId;
	cancelled = undefined;
	if (typeof navigator !== 'undefined' && navigator.locks) {
		void navigator.locks
			.request(`knowledge-gap-atlas:${data.projectId}`, { ifAvailable: true }, async (lock) => {
				if (!lock) {
					running = undefined;
					context.postMessage({
						type: 'error',
						jobId: data.jobId,
						message:
							'This atlas is being analysed in another tab. Pause that analysis before continuing here.'
					});
					return;
				}
				await run(data);
			})
			.catch((error: unknown) => {
				running = undefined;
				context.postMessage({ type: 'error', jobId: data.jobId, message: storageError(error) });
			});
	} else void run(data);
};
