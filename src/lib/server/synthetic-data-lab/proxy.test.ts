import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { privateEnv, appEnv } = vi.hoisted(() => ({
	appEnv: { dev: true },
	privateEnv: {
		SYNTHETIC_DATA_API_URL: 'http://127.0.0.1:8765',
		SYNTHETIC_DATA_SERVICE_TOKEN: 'unit-test-service-token-32-characters',
		SYNTHETIC_DATA_ALLOW_LOOPBACK: 'false',
		SYNTHETIC_DATA_DEPLOYMENT_BYPASS: ''
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: privateEnv }));
vi.mock('$app/environment', () => appEnv);

beforeEach(() => {
	vi.resetModules();
	appEnv.dev = true;
	privateEnv.SYNTHETIC_DATA_API_URL = 'http://127.0.0.1:8765';
	privateEnv.SYNTHETIC_DATA_ALLOW_LOOPBACK = 'false';
	privateEnv.SYNTHETIC_DATA_DEPLOYMENT_BYPASS = '';
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function invoke(
	path = 'preview',
	body: BodyInit | undefined = JSON.stringify({ config: { rows: 10 } }),
	options: {
		method?: string;
		origin?: string;
		cookie?: string;
		query?: string;
		headers?: Record<string, string>;
		signal?: AbortSignal;
	} = {}
) {
	const { proxyLab } = await import('./proxy');
	const method = options.method ?? 'POST';
	const request = new Request(
		`https://site.example/api/synthetic-data-lab/${path}${options.query ?? ''}`,
		{
			method,
			signal: options.signal,
			headers: {
				'Content-Type': 'application/json',
				Origin: options.origin ?? 'https://site.example',
				...options.headers
			},
			...(method !== 'GET'
				? { body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) }
				: {})
		}
	);
	const set = vi.fn();
	const response = await proxyLab({
		request,
		url: new URL(request.url),
		params: { path },
		cookies: { get: () => options.cookie, set },
		getClientAddress: () => 'client'
	} as unknown as RequestEvent);
	return { response, set };
}

describe('Synthetic Data Lab proxy', () => {
	it('requires explicit local-preview opt-in for loopback HTTP outside development', async () => {
		appEnv.dev = false;
		const provider = vi.fn().mockResolvedValue(new Response('{}'));
		vi.stubGlobal('fetch', provider);
		expect((await invoke()).response.status).toBe(503);
		expect(provider).not.toHaveBeenCalled();
		privateEnv.SYNTHETIC_DATA_ALLOW_LOOPBACK = 'true';
		const success = (await invoke()).response;
		expect(success.status).toBe(200);
		await success.text();
	});
	it('rejects remote cleartext services even with the local-preview opt-in', async () => {
		privateEnv.SYNTHETIC_DATA_ALLOW_LOOPBACK = 'true';
		privateEnv.SYNTHETIC_DATA_API_URL = 'http://service.example';
		const provider = vi.fn();
		vi.stubGlobal('fetch', provider);
		expect((await invoke()).response.status).toBe(503);
		expect(provider).not.toHaveBeenCalled();
	});
	it('requires same-origin JSON and rejects arbitrary upstream paths', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect(
			(await invoke('preview', '{}', { origin: 'https://other.example' })).response.status
		).toBe(403);
		expect((await invoke('../health')).response.status).toBe(404);
		expect(
			(await invoke('preview', '{}', { headers: { 'Content-Type': 'text/plain' } })).response.status
		).toBe(415);
		expect(fetch).not.toHaveBeenCalled();
	});
	it.each(['null', '[]', '{', '{}', '{"config":[]}'])('rejects invalid body %s', async (body) => {
		vi.stubGlobal('fetch', vi.fn());
		expect((await invoke('preview', body)).response.status).toBe(400);
	});
	it('enforces actual streamed body bytes', async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(524289));
			},
			cancel
		});
		vi.stubGlobal('fetch', vi.fn());
		expect((await invoke('preview', body)).response.status).toBe(413);
		expect(cancel).toHaveBeenCalled();
	});
	it('adds trusted service/owner headers and private cache controls', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValue(
				new Response('{"row_count":10}', { headers: { 'Content-Type': 'application/json' } })
			);
		vi.stubGlobal('fetch', fetch);
		const owner = 'a'.repeat(64);
		const { response } = await invoke('preview', undefined, { cookie: owner });
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(fetch.mock.calls[0][1].headers).toMatchObject({
			Authorization: `Bearer ${privateEnv.SYNTHETIC_DATA_SERVICE_TOKEN}`,
			'X-Lab-Owner': owner
		});
		expect(await response.text()).not.toContain(privateEnv.SYNTHETIC_DATA_SERVICE_TOKEN);
	});
	it('creates an HttpOnly session capability instead of accepting a forged owner header', async () => {
		const fetch = vi.fn().mockResolvedValue(new Response('{}'));
		vi.stubGlobal('fetch', fetch);
		const { set, response } = await invoke('preview', undefined, {
			cookie: 'forged',
			headers: { 'X-Lab-Owner': 'forged' }
		});
		expect(set).toHaveBeenCalledWith(
			'synthetic-lab-owner',
			expect.stringMatching(/^[a-f0-9]{64}$/),
			expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' })
		);
		expect(fetch.mock.calls[0][1].headers['X-Lab-Owner']).not.toBe('forged');
		await response.text();
	});
	it('preserves immutable CSV bytes and safe export query options', async () => {
		const csv = 'x,label\r\n-1,"a,b"\r\n';
		const fetch = vi.fn().mockResolvedValue(
			new Response(csv, {
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': 'attachment; filename="dataset.csv"'
				}
			})
		);
		vi.stubGlobal('fetch', fetch);
		const { response } = await invoke('results/result_1/download', undefined, {
			method: 'GET',
			query: '?format=csv&safe=false'
		});
		expect(await response.text()).toBe(csv);
		expect(String(fetch.mock.calls[0][0])).toBe(
			'http://127.0.0.1:8765/results/result_1/download?format=csv&safe=false'
		);
	});
	it('bounds upstream output and cancels an oversized response stream', async () => {
		const cancel = vi.fn();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(new ReadableStream({ cancel }), {
					headers: { 'Content-Length': String(64 * 1024 * 1024 + 1) }
				})
			)
		);
		expect((await invoke()).response.status).toBe(413);
		expect(cancel).toHaveBeenCalled();
	});
	it('rejects unrecognized export parameters before an upstream request', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect(
			(
				await invoke('results/one/download', undefined, {
					method: 'GET',
					query: '?url=https://other.example'
				})
			).response.status
		).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
	});
	it('forwards deployment bypass only to the private service and sanitizes returned headers', async () => {
		privateEnv.SYNTHETIC_DATA_DEPLOYMENT_BYPASS = 'private-platform-bypass';
		const fetch = vi.fn().mockResolvedValue(
			new Response('{}', {
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer should-never-reach-browser',
					'X-Lab-Owner': 'private-owner',
					'X-Vercel-Protection-Bypass': 'private-platform-bypass',
					'Set-Cookie': 'private-backend-cookie=yes',
					'Content-Length': '2'
				}
			})
		);
		vi.stubGlobal('fetch', fetch);
		const { response } = await invoke('preview', undefined, {
			headers: { 'X-Vercel-Protection-Bypass': 'browser-forgery', Authorization: 'browser-forgery' }
		});
		expect(fetch.mock.calls[0][1].headers).toMatchObject({
			'x-vercel-protection-bypass': 'private-platform-bypass',
			Authorization: `Bearer ${privateEnv.SYNTHETIC_DATA_SERVICE_TOKEN}`
		});
		for (const name of [
			'authorization',
			'x-lab-owner',
			'x-vercel-protection-bypass',
			'set-cookie',
			'content-length'
		])
			expect(response.headers.has(name)).toBe(false);
		expect(await response.text()).toBe('{}');
	});
	it('holds admission until stream completion and releases it after download cancellation', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(() => Promise.resolve(new Response(new ReadableStream())))
		);
		const first = await invoke('results/one/download', undefined, { method: 'GET' });
		expect(
			(await invoke('results/one/download', undefined, { method: 'GET' })).response.status
		).toBe(429);
		await first.response.body!.cancel();
		const next = await invoke('results/one/download', undefined, { method: 'GET' });
		expect(next.response.status).toBe(200);
		await next.response.body!.cancel();
	});
	it.each([
		['jobs', 150000],
		['preview', 40000],
		['validate', 30000]
	] as const)(
		'uses a %s operation deadline of %i ms before response headers',
		async (path, duration) => {
			vi.useFakeTimers();
			let started = 0;
			const fetch = vi.fn().mockImplementation(() => {
				started = Date.now();
				return new Promise(() => {});
			});
			vi.stubGlobal('fetch', fetch);
			const pending = invoke(path);
			await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
			await vi.advanceTimersByTimeAsync(duration - 1 - (Date.now() - started));
			expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
			await vi.advanceTimersByTimeAsync(1);
			expect((await pending).response.status).toBe(504);
			expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
		}
	);
});
