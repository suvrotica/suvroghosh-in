import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoundedNotesFetch } from './bounded-fetch';

afterEach(() => vi.useRealTimers());

describe('Notes Supabase transport deadlines', () => {
	it('aborts and settles a transport that ignores its signal', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | null | undefined;
		const fetcher = createBoundedNotesFetch(async (_input, init) => {
			signal = init?.signal;
			return new Promise(() => {});
		});
		const pending = expect(fetcher('https://db.example/rest/v1/notes')).rejects.toMatchObject({
			name: 'AbortError'
		});
		await vi.advanceTimersByTimeAsync(15_001);
		await pending;
		expect(signal?.aborted).toBe(true);
	});

	it('cancels a stalled JSON response consumed through the installed Supabase SDK', async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		const client = createClient('https://db.example', 'test-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: createBoundedNotesFetch(
					async () =>
						new Response(new ReadableStream({ cancel }), {
							headers: { 'content-type': 'application/json' }
						})
				)
			}
		});
		const pending = Promise.resolve(client.from('notes').select('id'));
		await vi.advanceTimersByTimeAsync(15_001);
		expect((await pending).error).not.toBeNull();
		expect(cancel).toHaveBeenCalled();
	});

	it('preserves SDK JSON, binary bytes, status, headers and empty responses', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				new Response('[{"id":"note"}]', {
					headers: { 'content-type': 'application/json', 'content-range': '0-0/1' }
				})
			)
			.mockResolvedValueOnce(
				new Response(new Uint8Array([0, 255, 2]), {
					headers: {
						'content-type': 'image/webp',
						'content-encoding': 'gzip',
						'content-length': '1'
					}
				})
			)
			.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const bounded = createBoundedNotesFetch(fetcher);
		const client = createClient('https://db.example', 'test-key', {
			auth: { persistSession: false },
			global: { fetch: bounded }
		});
		expect((await client.from('notes').select('id', { count: 'exact' })).data).toEqual([
			{ id: 'note' }
		]);
		const binary = await bounded('https://db.example/storage/v1/object');
		expect([...new Uint8Array(await binary.arrayBuffer())]).toEqual([0, 255, 2]);
		expect(binary.headers.get('content-type')).toBe('image/webp');
		expect(binary.headers.get('content-encoding')).toBeNull();
		expect(binary.headers.get('content-length')).toBe('3');
		expect((await bounded('https://db.example/rest/v1/notes')).status).toBe(204);
	});

	it('cancels a late response when its transport resolves after the deadline', async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		let finish!: (response: Response) => void;
		const bounded = createBoundedNotesFetch(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		const pending = expect(bounded('https://db.example/rest/v1/notes')).rejects.toMatchObject({
			name: 'AbortError'
		});
		await vi.advanceTimersByTimeAsync(15_001);
		await pending;
		finish(new Response(new ReadableStream({ cancel })));
		await vi.advanceTimersByTimeAsync(0);
		expect(cancel).toHaveBeenCalledOnce();
	});

	it('enforces a response byte limit despite a misleading Content-Length', async () => {
		const cancel = vi.fn();
		const fetcher = createBoundedNotesFetch(
			async () =>
				new Response(
					new ReadableStream({
						start: (controller) => controller.enqueue(new Uint8Array(32 * 1024 * 1024 + 1)),
						cancel
					}),
					{ headers: { 'content-length': '1' } }
				)
		);
		await expect(fetcher('https://db.example/rest/v1/notes')).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(cancel).toHaveBeenCalled();
	});

	it('keeps explicit caller cancellation and successful-request deadlines independent', async () => {
		vi.useFakeTimers();
		const signals: Array<AbortSignal | null | undefined> = [];
		const bounded = createBoundedNotesFetch(async (_input, init) => {
			signals.push(init?.signal);
			return new Response('{}');
		});
		await bounded('https://db.example/rest/v1/notes');
		await vi.advanceTimersByTimeAsync(16_000);
		await bounded('https://db.example/rest/v1/notes');
		expect(signals.map((signal) => signal?.aborted)).toEqual([false, false]);
		const controller = new AbortController();
		controller.abort();
		await expect(
			bounded('https://db.example/rest/v1/notes', { signal: controller.signal })
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(signals).toHaveLength(2);
	});
});
