import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from '@sveltejs/kit';

const { privateEnv } = vi.hoisted(() => ({ privateEnv: { YOUTUBE_DATA_API_KEY: '' } }));
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
beforeEach(() => vi.resetModules());
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function invoke(
	body: BodyInit = '{}',
	headers: Record<string, string> = {},
	address = 'client'
) {
	const { POST } = await import('./+server');
	const request = new Request('https://site.example/api/videos-i-like', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Origin: 'https://site.example', ...headers },
		body,
		...(body instanceof ReadableStream ? { duplex: 'half' } : {})
	});
	return (await POST({
		request,
		url: new URL(request.url),
		getClientAddress: () => address
	} as Parameters<RequestHandler>[0])) as Response;
}

describe('gallery endpoint boundaries', () => {
	it('requires exact origin and JSON before provider work', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect((await invoke('{}', { Origin: 'https://other.example' })).status).toBe(403);
		expect((await invoke('{}', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
		expect((await invoke('{}', { 'Content-Type': 'text/plain' })).status).toBe(415);
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each(['null', '[]', '"value"', '{', '{"id":"arbitrary"}'])(
		'rejects an invalid or arbitrary input %s',
		async (body) => expect((await invoke(body)).status).toBe(400)
	);

	it('limits streamed bodies with no trustworthy length header', async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(1025));
			},
			cancel
		});
		expect((await invoke(body)).status).toBe(413);
		expect(cancel).toHaveBeenCalled();
	});

	it('bounds a stalled input stream and returns private no-store errors', async () => {
		vi.useFakeTimers();
		const response = invoke(new ReadableStream({ start() {} }));
		await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
		await vi.advanceTimersByTimeAsync(3001);
		const result = await response;
		expect(result.status).toBe(408);
		expect(result.headers.get('cache-control')).toBe('private, no-store');
	});

	it('returns honest unknown results without a configured key', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const response = await invoke();
		expect(response.status).toBe(200);
		expect((await response.json()).configuration).toBe('missing-key');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('applies a per-client process-local rate limit even in no-key mode', async () => {
		for (let index = 0; index < 30; index++) expect((await invoke()).status).toBe(200);
		const result = await invoke();
		expect(result.status).toBe(429);
		expect(Number(result.headers.get('retry-after'))).toBeGreaterThan(0);
	});
});
