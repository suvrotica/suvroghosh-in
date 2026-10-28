import type { UmlDiagramRecord } from '../types';
import { contentRevision } from '../authoring';
import { checkPlantUmlSecurity } from './security';

export const PLANTUML_ENGINE_ID = '@plantuml/core 1.2026.9 (TeaVM + Smetana)';
const RENDER_TIMEOUT_MS = 20_000;
const MAX_PENDING = 32;
let worker: Worker | undefined;
let serial = 0;
type Job = {
	id: number;
	source: string;
	signal?: AbortSignal;
	resolve: (svg: string) => void;
	reject: (e: Error) => void;
	cleanup?: () => void;
};
let active: Job | undefined;
const pending: Job[] = [];
const aborted = () => new DOMException('Rendering cancelled.', 'AbortError');

function resetWorker() {
	worker?.terminate();
	worker = undefined;
}
function finish(error?: Error, svg?: string) {
	const job = active;
	if (!job) return;
	active = undefined;
	job.cleanup?.();
	if (error) job.reject(error);
	else job.resolve(svg!);
	pump();
}
function pump() {
	if (active || !pending.length) return;
	const job = pending.shift()!;
	job.cleanup?.();
	job.cleanup = undefined;
	if (job.signal?.aborted) {
		job.reject(aborted());
		pump();
		return;
	}
	active = job;
	try {
		worker ??= new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
		const timeout = setTimeout(() => {
			resetWorker();
			finish(new Error('Rendering exceeded 20 seconds. Simplify or split this diagram.'));
		}, RENDER_TIMEOUT_MS);
		const cancel = () => {
			resetWorker();
			finish(aborted());
		};
		job.signal?.addEventListener('abort', cancel, { once: true });
		job.cleanup = () => {
			clearTimeout(timeout);
			job.signal?.removeEventListener('abort', cancel);
		};
		worker.onmessage = (event: MessageEvent<{ id: number; svg?: string; error?: string }>) => {
			if (event.data.id !== active?.id) return;
			finish(event.data.error ? new Error(event.data.error) : undefined, event.data.svg);
		};
		worker.onerror = () => {
			resetWorker();
			finish(new Error('The local PlantUML engine failed to load or render. Please retry.'));
		};
		worker.postMessage({ id: job.id, source: job.source });
	} catch (error) {
		resetWorker();
		finish(error instanceof Error ? error : new Error(String(error)));
	}
}

export function renderPlantUmlInBrowser(source: string, signal?: AbortSignal): Promise<string> {
	if (signal?.aborted) return Promise.reject(aborted());
	if (typeof Worker === 'undefined')
		return Promise.reject(
			new Error('Local rendering requires a browser with Web Workers and OffscreenCanvas.')
		);
	const security = checkPlantUmlSecurity(source);
	if (!security.safe)
		return Promise.reject(
			new Error(security.violations.map((v) => `Line ${v.line}: ${v.message}`).join('\n'))
		);
	if (pending.length >= MAX_PENDING)
		return Promise.reject(
			new Error('Render queue is full. Wait for current diagrams or cancel them.')
		);
	return new Promise((resolve, reject) => {
		const job: Job = { id: ++serial, source, signal, resolve, reject };
		const cancelPending = () => {
			const index = pending.indexOf(job);
			if (index < 0) return;
			pending.splice(index, 1);
			job.cleanup?.();
			reject(aborted());
		};
		signal?.addEventListener('abort', cancelPending, { once: true });
		job.cleanup = () => signal?.removeEventListener('abort', cancelPending);
		pending.push(job);
		pump();
	});
}

export function cancelPlantUmlRendering() {
	for (const job of pending.splice(0)) {
		job.cleanup?.();
		job.reject(aborted());
	}
	resetWorker();
	finish(aborted());
}

export async function renderDiagramInBrowser(
	record: UmlDiagramRecord,
	signal?: AbortSignal
): Promise<UmlDiagramRecord> {
	if (!record.sourceCode.trim()) return record;
	const revision = contentRevision(record.sourceCode);
	try {
		const svg = await renderPlantUmlInBrowser(record.sourceCode, signal);
		return {
			...record,
			svg,
			lastValidSvg: svg,
			lastValidSourceCode: record.sourceCode,
			generationStatus: 'generated',
			validationStatus: 'valid',
			renderStatus: 'rendered',
			renderError: undefined,
			sourceRevision: revision,
			renderedSourceRevision: revision,
			rendererId: PLANTUML_ENGINE_ID
		};
	} catch (error) {
		if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw aborted();
		return {
			...record,
			sourceRevision: revision,
			svg: undefined,
			renderStatus: 'error',
			validationStatus: 'invalid',
			renderedSourceRevision: undefined,
			rendererId: PLANTUML_ENGINE_ID,
			renderError: error instanceof Error ? error.message : String(error)
		};
	}
}

export async function renderDiagramsInBrowser(
	records: UmlDiagramRecord[],
	options: {
		signal?: AbortSignal;
		onResult?: (record: UmlDiagramRecord, index: number) => void;
	} = {}
): Promise<UmlDiagramRecord[]> {
	const results: UmlDiagramRecord[] = [];
	for (let index = 0; index < records.length; index++) {
		if (options.signal?.aborted) throw aborted();
		const record = await renderDiagramInBrowser(records[index], options.signal);
		results.push(record);
		options.onResult?.(record, index);
	}
	return results;
}
