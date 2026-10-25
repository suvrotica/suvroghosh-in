import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamLabResponse } from './stream';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const endpoint = new URL('https://private-service.example/preview');
const limit = 64 * 1024 * 1024;

function open(maxBytes = limit, timeoutMs = 30000, signal = new AbortController().signal) {
	const release = vi.fn();
	return {
		release,
		response: streamLabResponse(endpoint, {}, signal, { maxBytes, timeoutMs, release })
	};
}

describe('Synthetic Data Lab streaming lifecycle', () => {
	it('delivers more than 4.5 MB incrementally without waiting for the body to finish', async () => {
		let source: ReadableStreamDefaultController<Uint8Array>;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					new ReadableStream({
						start(controller) {
							source = controller;
						}
					})
				)
			)
		);
		const { response, release } = open();
		const downstream = (await response).body!.getReader();
		expect(release).not.toHaveBeenCalled();
		let total = 0;
		for (let i = 0; i < 6; i++) {
			source!.enqueue(new Uint8Array(1024 * 1024).fill(i));
			const part = await downstream.read();
			expect(part.value![0]).toBe(i);
			total += part.value!.byteLength;
		}
		expect(total).toBe(6 * 1024 * 1024);
		expect(release).not.toHaveBeenCalled();
		source!.close();
		expect((await downstream.read()).done).toBe(true);
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('enforces actual streamed bytes even when Content-Length understates the result', async () => {
		const cancel = vi.fn();
		let chunks = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					new ReadableStream({
						pull(controller) {
							controller.enqueue(new Uint8Array(1024 * 1024));
							chunks++;
						},
						cancel
					}),
					{ headers: { 'Content-Length': '1' } }
				)
			)
		);
		const { response, release } = open();
		const downstream = (await response).body!.getReader();
		let bytes = 0;
		await expect(
			(async () => {
				while (true) {
					const next = await downstream.read();
					if (next.done) return;
					bytes += next.value.byteLength;
				}
			})()
		).rejects.toMatchObject({ kind: 'too-large' });
		expect(bytes).toBe(limit);
		expect(chunks).toBeGreaterThan(64);
		expect(cancel).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledOnce();
	});

	it('propagates downstream cancellation to fetch and releases admission exactly once', async () => {
		const cancel = vi.fn();
		const fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel })));
		vi.stubGlobal('fetch', fetch);
		const { response, release } = open();
		await (await response).body!.cancel('download cancelled');
		expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
		expect(cancel).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledOnce();
	});

	it('keeps the request abort connected after response headers have returned', async () => {
		const cancel = vi.fn();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
		const abort = new AbortController();
		const { response, release } = open(limit, 30000, abort.signal);
		const downstream = (await response).body!.getReader();
		const pending = downstream.read();
		const rejected = expect(pending).rejects.toMatchObject({ kind: 'aborted' });
		abort.abort();
		await rejected;
		expect(cancel).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledOnce();
	});

	it('keeps its deadline active through body consumption and cancels a stalled stream', async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		const fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel })));
		vi.stubGlobal('fetch', fetch);
		const { response, release } = open(limit, 30000);
		const downstream = (await response).body!.getReader();
		const pending = expect(downstream.read()).rejects.toMatchObject({ kind: 'timeout' });
		await vi.advanceTimersByTimeAsync(30000);
		await pending;
		expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
		expect(cancel).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('settles the deadline even if the upstream fetch ignores abort and discards late responses', async () => {
		vi.useFakeTimers();
		let resolve: (response: Response) => void;
		const fetch = vi.fn().mockImplementation(
			() =>
				new Promise<Response>((done) => {
					resolve = done;
				})
		);
		vi.stubGlobal('fetch', fetch);
		const { response, release } = open(limit, 40000);
		const pending = expect(response).rejects.toMatchObject({ kind: 'timeout' });
		await vi.advanceTimersByTimeAsync(40000);
		await pending;
		const cancel = vi.fn();
		resolve!(new Response(new ReadableStream({ cancel })));
		await Promise.resolve();
		expect(cancel).toHaveBeenCalledOnce();
		expect(release).toHaveBeenCalledOnce();
	});

	it('clears timers and releases admission on upstream stream errors', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					new ReadableStream({
						pull(controller) {
							controller.error(new Error('upstream connection lost'));
						}
					})
				)
			)
		);
		const { response, release } = open();
		await expect((await response).text()).rejects.toThrow('upstream connection lost');
		expect(release).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});
});
