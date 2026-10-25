import { afterEach, describe, expect, test, vi } from 'vitest';
import { SupabasePublicRepository } from './public-repository';
import { EnquiryStore } from './store';

const sessionHash = 'a'.repeat(64);
const serviceKey = 'test-only-server-service-key';

function workspace() {
	const store = new EnquiryStore(':memory:', () => Date.parse('2026-10-26T09:00:00Z'));
	try {
		store.seed();
		return {
			sessionHash,
			scopeKey: '1'.repeat(64),
			version: 1,
			state: store.exportSnapshot(),
			expiresAt: '2026-10-27T09:00:00Z',
			staffUntil: null,
			nextDueAt: '2026-10-26T09:01:00Z'
		};
	} finally {
		store.close();
	}
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

describe('server-only hosted workspace transport', () => {
	test('a request that was already aborted never starts an RPC fetch', async () => {
		const controller = new AbortController();
		controller.abort();
		const fetcher = vi.fn();
		const repository = new SupabasePublicRepository(
			{ url: 'https://database.example', serviceKey, signal: controller.signal },
			fetcher
		);
		await expect(repository.load(sessionHash)).rejects.toMatchObject({ status: 408 });
		expect(fetcher).not.toHaveBeenCalled();
	});

	test('requires HTTPS and permits HTTP only for an explicitly configured non-Vercel loopback test backend', () => {
		const fetcher = vi.fn();
		vi.stubEnv('VERCEL', '');
		for (const url of [
			'http://example.com',
			'http://127.0.0.1:54331',
			'https://user:pass@example.com',
			'https://example.com?secret=value',
			'https://example.com#fragment'
		]) {
			expect(() => new SupabasePublicRepository({ url, serviceKey }, fetcher)).toThrow();
		}
		expect(
			() =>
				new SupabasePublicRepository(
					{ url: 'http://127.0.0.1:54331', serviceKey, allowLoopback: true },
					fetcher
				)
		).not.toThrow();
		expect(
			() =>
				new SupabasePublicRepository(
					{ url: 'http://other.example', serviceKey, allowLoopback: true },
					fetcher
				)
		).toThrow();
		vi.stubEnv('VERCEL', '1');
		expect(
			() =>
				new SupabasePublicRepository(
					{ url: 'http://127.0.0.1:54331', serviceKey, allowLoopback: true },
					fetcher
				)
		).toThrow();
		expect(fetcher).not.toHaveBeenCalled();
	});

	test('uses bounded private RPC requests and validates the returned workspace envelope', async () => {
		const row = workspace();
		const fetcher = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify(row), { headers: { 'content-type': 'application/json' } })
			);
		const repository = new SupabasePublicRepository(
			{ url: 'https://database.example', serviceKey },
			fetcher
		);
		expect(await repository.load(sessionHash)).toEqual(row);
		const [url, request] = fetcher.mock.calls[0];
		expect(url).toBe('https://database.example/rest/v1/rpc/enquiry_demo_get');
		expect(JSON.parse(request.body)).toEqual({ p_session_hash: sessionHash });
		expect(request).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
		expect(request.signal).toBeInstanceOf(AbortSignal);
		expect(request.headers.authorization).toBe(`Bearer ${serviceKey}`);
	});

	test('provider errors do not expose response bodies, SQL details or credentials', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(new Response('secret SQL table and provider credential', { status: 500 }));
		const repository = new SupabasePublicRepository(
			{ url: 'https://database.example', serviceKey },
			fetcher
		);
		await expect(repository.load(sessionHash)).rejects.toMatchObject({ status: 503 });
		await expect(repository.load(sessionHash)).rejects.not.toThrow(
			/secret SQL|credential|test-only-server/
		);
	});

	test('rejects oversized streamed responses without trusting Content-Length', async () => {
		const cancel = vi.fn();
		const fetcher = vi.fn().mockResolvedValue(
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new Uint8Array(1024 * 1024 + 1));
					},
					cancel
				})
			)
		);
		const repository = new SupabasePublicRepository(
			{ url: 'https://database.example', serviceKey },
			fetcher
		);
		await expect(repository.load(sessionHash)).rejects.toMatchObject({ status: 503 });
		expect(cancel).toHaveBeenCalled();
	});

	test('aborts a stalled provider request at the configured deadline', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | undefined;
		const fetcher = vi.fn((_url, options) => {
			signal = options.signal;
			return new Promise<Response>(() => {});
		});
		const repository = new SupabasePublicRepository(
			{ url: 'https://database.example', serviceKey },
			fetcher as typeof fetch
		);
		const result = repository.load(sessionHash);
		const rejected = expect(result).rejects.toMatchObject({ status: 503 });
		await vi.advanceTimersByTimeAsync(15_001);
		await rejected;
		expect(signal!.aborted).toBe(true);
	});

	test('rejects malformed workspace metadata and unbounded worker batches', async () => {
		const row = workspace();
		for (const patch of [
			{ sessionHash: 'untrusted' },
			{ scopeKey: 'wrong' },
			{ version: -1 },
			{ expiresAt: 'invalid' },
			{ staffUntil: 'invalid' },
			{ state: null }
		]) {
			const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...row, ...patch })));
			const repository = new SupabasePublicRepository(
				{ url: 'https://database.example', serviceKey },
				fetcher
			);
			await expect(repository.load(sessionHash)).rejects.toMatchObject({ status: 503 });
		}
		const fetcher = vi.fn();
		const repository = new SupabasePublicRepository(
			{ url: 'https://database.example', serviceKey },
			fetcher
		);
		await expect(repository.due(0)).rejects.toMatchObject({ status: 503 });
		await expect(repository.due(21)).rejects.toMatchObject({ status: 503 });
		expect(fetcher).not.toHaveBeenCalled();
	});
});
