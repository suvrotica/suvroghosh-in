import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from '@sveltejs/kit';

const { privateEnv, reserve } = vi.hoisted(() => ({
	privateEnv: {} as Record<string, string>,
	reserve: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$lib/server/tts/quota', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/tts/quota')>()),
	reserveTtsUsage: reserve
}));

beforeEach(() => {
	vi.resetModules();
	for (const key of Object.keys(privateEnv)) delete privateEnv[key];
	Object.assign(privateEnv, {
		CHATTERBOX_TTS_ENDPOINT: 'https://speech.example/tts',
		CHATTERBOX_TTS_ENABLED: 'true',
		CHATTERBOX_TTS_RATE_LIMIT_SALT: 'a'.repeat(32),
		SUPABASE_URL: 'https://database.example',
		SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
	});
	reserve.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function invoke(
	body: BodyInit = JSON.stringify({ text: 'Hello world.' }),
	headers: Record<string, string> = {},
	address = 'client'
) {
	const { POST } = await import('./+server');
	const request = new Request('https://site.example/api/tts/chatterbox', {
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

describe('Chatterbox admission and provider boundaries', () => {
	it.each([
		'CHATTERBOX_TTS_ENABLED',
		'CHATTERBOX_TTS_RATE_LIMIT_SALT',
		'SUPABASE_SERVICE_ROLE_KEY'
	])('fails closed without private configuration %s even when the endpoint is set', async (key) => {
		delete privateEnv[key];
		vi.stubGlobal('fetch', vi.fn());
		const response = await invoke();
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(fetch).not.toHaveBeenCalled();
		expect(reserve).not.toHaveBeenCalled();
	});

	it('does not invoke either backend without a trusted client address', async () => {
		vi.stubGlobal('fetch', vi.fn());
		expect((await invoke(undefined, {}, '')).status).toBe(503);
		expect(fetch).not.toHaveBeenCalled();
		expect(reserve).not.toHaveBeenCalled();
	});

	it('reserves normalized text before generation and denies exhausted shared quotas', async () => {
		reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 150 });
		vi.stubGlobal('fetch', vi.fn());
		const response = await invoke(JSON.stringify({ text: '<p>Hello world.</p>' }));
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('150');
		expect(reserve).toHaveBeenCalledWith(expect.any(Object), 'client', 12, expect.any(AbortSignal));
		expect(fetch).not.toHaveBeenCalled();
	});

	it('fails closed on an unavailable or uncertain quota reservation without retrying', async () => {
		reserve.mockRejectedValue(new Error('private database diagnostic'));
		vi.stubGlobal('fetch', vi.fn());
		const response = await invoke();
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private database');
		expect(reserve).toHaveBeenCalledTimes(1);
		expect(fetch).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalledWith('chatterbox_quota_unavailable');
	});

	it.each([500, 200])(
		'does not disclose or consume raw provider diagnostics for status %i',
		async (status) => {
			const cancel = vi.fn();
			const provider = vi.fn().mockResolvedValue(
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('secret=private-backend-token'));
							controller.close();
						},
						cancel
					}),
					{ status, headers: { 'content-type': 'text/plain' } }
				)
			);
			vi.stubGlobal('fetch', provider);
			const response = await invoke();
			expect(response.status).toBe(502);
			const body = await response.json();
			expect(body).not.toHaveProperty('detail');
			expect(body).not.toHaveProperty('backendStatus');
			expect(JSON.stringify(body)).not.toContain('private-backend-token');
			expect(cancel).toHaveBeenCalled();
			expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
				'private-backend-token'
			);
			expect(reserve).toHaveBeenCalledTimes(1);
			expect(provider).toHaveBeenCalledTimes(1);
		}
	);

	it.each(['null', '[]', '"text"', '{'])(
		'rejects invalid JSON shape %s before provider work',
		async (body) => {
			const fetch = vi.fn();
			vi.stubGlobal('fetch', fetch);
			expect((await invoke(body)).status).toBe(400);
			expect(fetch).not.toHaveBeenCalled();
			expect(reserve).not.toHaveBeenCalled();
		}
	);

	it('rejects foreign origins and non-JSON content without calling the provider', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect((await invoke('{}', { Origin: 'https://other.example' })).status).toBe(403);
		expect((await invoke('{}', { 'Content-Type': 'text/plain' })).status).toBe(415);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('rejects a headerless streamed oversized JSON body and cancels it', async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(65537));
			},
			cancel
		});
		vi.stubGlobal('fetch', vi.fn());
		expect((await invoke(body)).status).toBe(413);
		expect(cancel).toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each(['wav', 'mp3', 'opus'])('preserves %s mapping and audio bytes', async (format) => {
		const provider = vi.fn().mockResolvedValue(
			new Response(new Uint8Array([0, 255, 1]), {
				headers: { 'Content-Type': `audio/${format}` }
			})
		);
		vi.stubGlobal('fetch', provider);
		const response = await invoke(JSON.stringify({ text: 'Hello world.', format }));
		expect(response.status).toBe(200);
		expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255, 1]);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const options = provider.mock.calls[0][1];
		expect(JSON.parse(options.body)).toMatchObject({
			text: 'Hello world.',
			output_format: format,
			voice_mode: 'predefined'
		});
		expect(options.signal).toBeInstanceOf(AbortSignal);
		expect(options.redirect).toBe('error');
	});

	it('rejects excessive provider audio and cancels the upstream stream', async () => {
		const cancel = vi.fn();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(new ReadableStream({ cancel }), {
					headers: { 'Content-Type': 'audio/wav', 'Content-Length': '33554433' }
				})
			)
		);
		expect((await invoke()).status).toBe(502);
		expect(cancel).toHaveBeenCalled();
	});

	it('bounds slow input before JSON parsing', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn());
		const cancel = vi.fn();
		const response = invoke(new ReadableStream({ cancel }));
		await vi.advanceTimersByTimeAsync(10001);
		expect((await response).status).toBe(408);
		expect(cancel).toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('aborts a stalled provider after 120 seconds and releases active admission', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn((_url, options) => {
				signal = options.signal;
				return new Promise(() => {});
			})
		);
		const response = invoke();
		await vi.advanceTimersByTimeAsync(120001);
		expect((await response).status).toBe(502);
		expect(signal?.aborted).toBe(true);
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('audio', { headers: { 'Content-Type': 'audio/wav' } }))
		);
		expect((await invoke()).status).toBe(200);
	});

	it('rejects concurrent work for the same client and applies retry headers', async () => {
		let resolve: (response: Response) => void = () => {};
		const provider = vi.fn(
			() =>
				new Promise<Response>((done) => {
					resolve = done;
				})
		);
		vi.stubGlobal('fetch', provider);
		const first = invoke();
		await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));
		const second = await invoke();
		expect(second.status).toBe(429);
		expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
		resolve(new Response('audio', { headers: { 'Content-Type': 'audio/wav' } }));
		expect((await first).status).toBe(200);
	});
});
