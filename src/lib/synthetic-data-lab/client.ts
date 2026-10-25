import type { Capabilities, ExperimentConfig, GenerationJob, GenerationResult } from './types';

const base = '/api/synthetic-data-lab';
async function request<T>(path: string, options: RequestInit = {}, attempt = 0): Promise<T> {
	const response = await fetch(`${base}/${path}`, {
		...options,
		headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
	});
	if (response.status === 429 && path === 'preview' && attempt === 0) {
		await response.body?.cancel();
		const seconds = Number(response.headers.get('Retry-After') ?? 1);
		const delay = Math.min(10000, Math.max(500, (Number.isFinite(seconds) ? seconds : 1) * 1000));
		await new Promise<void>((resolve, reject) => {
			const signal = options.signal;
			if (signal?.aborted) {
				reject(new DOMException('Preview cancelled', 'AbortError'));
				return;
			}
			const abort = () => {
				clearTimeout(timer);
				reject(new DOMException('Preview cancelled', 'AbortError'));
			};
			const timer = setTimeout(() => {
				signal?.removeEventListener('abort', abort);
				resolve();
			}, delay);
			signal?.addEventListener('abort', abort, { once: true });
		});
		return request<T>(path, options, attempt + 1);
	}
	if (!response.ok) {
		let message = `The generator returned HTTP ${response.status}.`;
		try {
			const data = await response.json();
			const detail = data.detail ?? data.error ?? data.message;
			message =
				typeof detail === 'string'
					? detail
					: Array.isArray(detail)
						? detail
								.map(
									(d: { msg?: string; message?: string }) => d.msg ?? d.message ?? JSON.stringify(d)
								)
								.join('; ')
						: detail
							? JSON.stringify(detail)
							: message;
		} catch {
			/* Preserve the status explanation if the response was not JSON. */
		}
		throw new Error(message);
	}
	return response.json() as Promise<T>;
}
export const getCapabilities = () => request<Capabilities>('capabilities');
export const previewExperiment = (config: ExperimentConfig, signal?: AbortSignal) =>
	request<GenerationResult>('preview', {
		method: 'POST',
		body: JSON.stringify({ config }),
		signal
	});
export const createJob = (config: ExperimentConfig, signal?: AbortSignal) =>
	request<GenerationJob>('jobs', {
		method: 'POST',
		body: JSON.stringify({ config, idempotency_key: crypto.randomUUID() }),
		signal
	});
export const getJob = (jobId: string) =>
	request<GenerationJob>(`jobs/${encodeURIComponent(jobId)}`);
export const cancelJob = (jobId: string) =>
	request<GenerationJob>(`jobs/${encodeURIComponent(jobId)}/cancel`, {
		method: 'POST',
		body: '{}'
	});
export const getResultTable = (resultId: string, table: string) =>
	request<GenerationResult>(
		`results/${encodeURIComponent(resultId)}?table=${encodeURIComponent(table)}&offset=0&limit=1000`
	);
export const downloadUrl = (
	resultId: string,
	format: 'csv' | 'zip',
	safe = false,
	truth = false,
	table?: string
) =>
	`${base}/results/${encodeURIComponent(resultId)}/download?format=${format}&safe=${safe}&truth=${truth}${table && table !== 'main' ? `&table=${encodeURIComponent(table)}` : ''}`;
export const validateExperiment = (config: ExperimentConfig) =>
	request<{ valid: boolean; errors?: unknown[]; warnings?: unknown[] }>('validate', {
		method: 'POST',
		body: JSON.stringify({ config })
	});

export function saveTextFile(name: string, text: string, type = 'application/json') {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
