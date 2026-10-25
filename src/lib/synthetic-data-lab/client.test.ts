import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJob, previewExperiment } from './client';
import { defaultConfig } from './presets';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('Synthetic Data Lab client', () => {
	it('sends full generation with an abort signal and accepts a completed response directly', async () => {
		const completed = {
			job_id: 'hosted-1',
			status: 'completed',
			progress: 1,
			result_id: 'result-1'
		};
		const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(completed)));
		vi.stubGlobal('fetch', fetch);
		const abort = new AbortController();
		expect(await createJob(defaultConfig(), abort.signal)).toEqual(completed);
		expect(fetch).toHaveBeenCalledOnce();
		expect(fetch.mock.calls[0][0]).toBe('/api/synthetic-data-lab/jobs');
		expect(fetch.mock.calls[0][1].signal).toBe(abort.signal);
		const payload = JSON.parse(fetch.mock.calls[0][1].body);
		expect(payload.idempotency_key).toMatch(/^[a-f0-9-]{36}$/);
		expect(payload.config.rows).toBe(defaultConfig().rows);
		expect(fetch.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
	});

	it('allows the browser to abort a pending full generation request without retrying it', async () => {
		const fetch = vi.fn().mockImplementation(
			(_: string, options: RequestInit) =>
				new Promise((_, reject) => {
					options.signal!.addEventListener('abort', () =>
						reject(new DOMException('cancelled', 'AbortError'))
					);
				})
		);
		vi.stubGlobal('fetch', fetch);
		const abort = new AbortController();
		const pending = expect(createJob(defaultConfig(), abort.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
		abort.abort();
		await pending;
		expect(fetch).toHaveBeenCalledOnce();
	});

	it('cancels the 429 response body before retrying a preview', async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(new ReadableStream({ cancel }), {
					status: 429,
					headers: { 'Retry-After': '1' }
				})
			)
			.mockResolvedValueOnce(new Response('{"result_id":"preview-1"}'));
		vi.stubGlobal('fetch', fetch);
		const pending = previewExperiment(defaultConfig());
		await vi.advanceTimersByTimeAsync(0);
		expect(cancel).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1000);
		expect(await pending).toEqual({ result_id: 'preview-1' });
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
