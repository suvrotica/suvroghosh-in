import { describe, expect, it, vi } from 'vitest';
import { MAX_CODE_POINTS, type PromptOntology } from '$lib/visualizations/prompt-atlas/types';
import { SEMANTIC_MAX_BYTES, type SemanticConfig } from './config';
import { createSemanticHandlers, semanticClientHash, SemanticFailure } from './service';

const origin = 'https://atlas.example.test';
const url = new URL(`${origin}/api/prompt-atlas/analyze`);
const config: SemanticConfig = {
	enabled: true,
	credentialAvailable: true,
	salt: 'test-only-hmac-salt-with-at-least-thirty-two-characters',
	supabaseUrl: 'https://quota.example.test',
	supabaseKey: 'test-only-service-key'
};

function ontology(text = 'A short prompt'): PromptOntology {
	return {
		schemaVersion: 1,
		source: { text, revision: 'test' },
		mode: 'semantic',
		analysisMetadata: { provider: 'Test free provider', model: 'test/free-model' },
		language: 'en',
		nodes: [],
		relations: [],
		issues: []
	};
}

function setup(overrides: Partial<SemanticConfig> = {}) {
	const verifyFreeRoute = vi.fn(async (_signal: AbortSignal) => {});
	const reserve = vi.fn(async (_hash: string, _signal: AbortSignal) => ({
		allowed: true,
		retryAfterSeconds: 0
	}));
	const generate = vi.fn(async (text: string, _signal: AbortSignal) => ontology(text));
	const dependencies = vi.fn(() => ({ verifyFreeRoute, reserve, generate }));
	const handlers = createSemanticHandlers(() => ({ ...config, ...overrides }), dependencies);
	return { ...handlers, verifyFreeRoute, reserve, generate, dependencies };
}

function event(
	body: BodyInit = JSON.stringify({ text: 'A short prompt', consent: true }),
	headers: Record<string, string> = {},
	address = '203.0.113.1',
	signal?: AbortSignal
) {
	const request = new Request(url, {
		method: 'POST',
		headers: { origin, 'content-type': 'application/json', ...headers },
		body,
		signal,
		...(body instanceof ReadableStream ? { duplex: 'half' } : {})
	} as RequestInit);
	return { request, url, getClientAddress: () => address };
}

function getEvent(address = '203.0.113.1') {
	return { request: new Request(url), url, getClientAddress: () => address };
}

function expectPrivate(response: Response) {
	expect(response.headers.get('cache-control')).toContain('private');
	expect(response.headers.get('cache-control')).toContain('no-store');
	expect(response.headers.get('x-robots-tag')).toContain('noindex');
}

describe('free semantic-analysis endpoint', () => {
	it('checks the free route, reserves shared quota, then generates once', async () => {
		const handlers = setup();
		const order: string[] = [];
		handlers.verifyFreeRoute.mockImplementation(async () => {
			order.push('free');
		});
		handlers.reserve.mockImplementation(async () => {
			order.push('quota');
			return { allowed: true, retryAfterSeconds: 0 };
		});
		handlers.generate.mockImplementation(async (text) => {
			order.push('generate');
			return ontology(text);
		});
		const response = await handlers.POST(event());
		expect(response.status).toBe(200);
		expect(order).toEqual(['free', 'quota', 'generate']);
		expect(handlers.generate).toHaveBeenCalledTimes(1);
		expect((await response.json()).ontology.mode).toBe('semantic');
		expect(handlers.reserve.mock.calls[0][0]).toMatch(/^[a-f0-9]{64}$/);
		expect(handlers.reserve.mock.calls[0][0]).not.toContain('203.0.113.1');
		expectPrivate(response);
	});

	it.each(['https://different.example.test', 'null', ''])(
		'enforces an exact Origin before provider work: %s',
		async (submittedOrigin) => {
			const handlers = setup();
			const response = await handlers.POST(event(undefined, { origin: submittedOrigin }));
			expect(response.status).toBe(403);
			expect(handlers.dependencies).not.toHaveBeenCalled();
			expectPrivate(response);
		}
	);

	it('rejects a missing Origin and a forged content type', async () => {
		const handlers = setup();
		const missing = event();
		missing.request.headers.delete('origin');
		expect((await handlers.POST(missing)).status).toBe(403);
		expect((await handlers.POST(event(undefined, { 'content-type': 'text/plain' }))).status).toBe(
			415
		);
		expect(handlers.dependencies).not.toHaveBeenCalled();
	});

	it.each([
		{ text: 'A short prompt' },
		{ text: 'A short prompt', consent: false },
		{ text: '   ', consent: true },
		{ text: '', consent: true },
		{ text: 42, consent: true },
		{ text: 'A short prompt', consent: true, model: 'paid/fallback' }
	])('requires explicit consent and a strict input schema: %j', async (input) => {
		const handlers = setup();
		const response = await handlers.POST(event(JSON.stringify(input)));
		expect(response.status).toBe(400);
		expect(handlers.verifyFreeRoute).not.toHaveBeenCalled();
		expect(handlers.reserve).not.toHaveBeenCalled();
		expect(handlers.generate).not.toHaveBeenCalled();
	});

	it('rejects malformed UTF-8 and malformed JSON without exposing their contents', async () => {
		for (const input of [new Uint8Array([0xc3, 0x28]), '{broken-private-prompt']) {
			const handlers = setup();
			const response = await handlers.POST(event(input));
			expect(response.status).toBe(400);
			expect(await response.text()).not.toContain('broken-private-prompt');
			expect(handlers.reserve).not.toHaveBeenCalled();
		}
	});

	it.each([undefined, '1'])(
		'enforces streamed bytes even with absent or misleading Content-Length: %s',
		async (length) => {
			const handlers = setup();
			const cancel = vi.fn();
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array(SEMANTIC_MAX_BYTES));
					controller.enqueue(new Uint8Array([1]));
				},
				cancel
			});
			const response = await handlers.POST(event(body, length ? { 'content-length': length } : {}));
			expect(response.status).toBe(413);
			expect(cancel).toHaveBeenCalled();
			expect(handlers.verifyFreeRoute).not.toHaveBeenCalled();
			expect(handlers.generate).not.toHaveBeenCalled();
			expectPrivate(response);
		}
	);

	it('accepts the full configured Unicode code-point limit without trimming the source', async () => {
		const handlers = setup();
		const text = '🙂'.repeat(MAX_CODE_POINTS - 2) + '  ';
		const response = await handlers.POST(event(JSON.stringify({ text, consent: true })));
		expect(response.status).toBe(200);
		expect(handlers.generate.mock.calls[0][0]).toBe(text);
		const tooLong = await setup().POST(
			event(JSON.stringify({ text: 'a'.repeat(MAX_CODE_POINTS + 1), consent: true }))
		);
		expect(tooLong.status).toBe(400);
	});

	it.each([
		{ enabled: false },
		{ credentialAvailable: false },
		{ salt: 'short' },
		{ supabaseUrl: '' },
		{ supabaseKey: '' }
	])(
		'fails closed before provider work when configuration is unavailable: %j',
		async (override) => {
			const handlers = setup(override);
			const response = await handlers.POST(event());
			expect(response.status).toBe(503);
			expect(handlers.dependencies).not.toHaveBeenCalled();
			expectPrivate(response);
		}
	);

	it('refuses generation when zero-price eligibility cannot be verified', async () => {
		const handlers = setup();
		handlers.verifyFreeRoute.mockRejectedValue(
			new SemanticFailure('not_free', 'The free model cannot be verified.')
		);
		const response = await handlers.POST(event());
		expect(response.status).toBe(503);
		expect(handlers.reserve).not.toHaveBeenCalled();
		expect(handlers.generate).not.toHaveBeenCalled();
	});

	it('fails closed on a missing or failed shared quota store', async () => {
		const handlers = setup();
		handlers.reserve.mockRejectedValue(new Error('private database details and secret token'));
		const response = await handlers.POST(event());
		expect(response.status).toBe(503);
		expect(handlers.generate).not.toHaveBeenCalled();
		expect(await response.text()).not.toMatch(/private database|secret token/);
	});

	it('returns an exhausted quota with Retry-After and no provider request', async () => {
		const handlers = setup();
		handlers.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 345 });
		const response = await handlers.POST(event());
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('345');
		expect((await response.json()).code).toBe('rate_limited');
		expect(handlers.generate).not.toHaveBeenCalled();
		expectPrivate(response);
	});

	it('caps simultaneous work for the same client and releases the permit after failure', async () => {
		const handlers = setup();
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let finish!: () => void;
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		handlers.generate.mockImplementationOnce(async () => {
			entered();
			await gate;
			throw new Error('provider internals');
		});
		const first = handlers.POST(event());
		await started;
		try {
			const second = await handlers.POST(event());
			expect(second.status).toBe(429);
			expect(handlers.generate).toHaveBeenCalledTimes(1);
		} finally {
			finish();
		}
		expect((await first).status).toBe(503);
		expect((await handlers.POST(event())).status).toBe(200);
	});

	it('caps active work across distinct clients on this process', async () => {
		const handlers = setup();
		let count = 0;
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let finish!: () => void;
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		handlers.generate.mockImplementation(async (text) => {
			count++;
			if (count === 4) entered();
			await gate;
			return ontology(text);
		});
		const pending = Array.from({ length: 4 }, (_, index) =>
			handlers.POST(event(undefined, {}, `203.0.113.${index + 1}`))
		);
		await started;
		try {
			expect((await handlers.POST(event(undefined, {}, '203.0.113.99'))).status).toBe(429);
			expect(handlers.generate).toHaveBeenCalledTimes(4);
		} finally {
			finish();
		}
		expect((await Promise.all(pending)).every((response) => response.status === 200)).toBe(true);
	});

	it('propagates cancellation and never begins generation after an aborted preflight', async () => {
		const handlers = setup();
		const controller = new AbortController();
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let finish!: () => void;
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		handlers.verifyFreeRoute.mockImplementation(async (signal) => {
			entered();
			await gate;
			expect(signal.aborted).toBe(true);
		});
		const pending = handlers.POST(event(undefined, {}, '203.0.113.1', controller.signal));
		await started;
		controller.abort();
		finish();
		const response = await pending;
		expect(response.status).toBe(504);
		expect(handlers.reserve).not.toHaveBeenCalled();
		expect(handlers.generate).not.toHaveBeenCalled();
		expectPrivate(response);
	});

	it('sanitises unexpected provider errors and does not retry a generation', async () => {
		const handlers = setup();
		handlers.generate.mockRejectedValue(new Error('API_SECRET-private-prompt-provider-debug'));
		const response = await handlers.POST(event());
		expect(response.status).toBe(503);
		expect(await response.text()).not.toMatch(/API_SECRET|private-prompt|provider-debug/);
		expect(handlers.reserve).toHaveBeenCalledTimes(1);
		expect(handlers.generate).toHaveBeenCalledTimes(1);
		expectPrivate(response);
	});

	it('rechecks free pricing on POST even after a successful cached availability check', async () => {
		const handlers = setup();
		expect((await (await handlers.GET(getEvent())).json()).available).toBe(true);
		handlers.verifyFreeRoute.mockRejectedValueOnce(new Error('price changed'));
		const response = await handlers.POST(event());
		expect(response.status).toBe(503);
		expect(handlers.verifyFreeRoute).toHaveBeenCalledTimes(2);
		expect(handlers.reserve).not.toHaveBeenCalled();
		expect(handlers.generate).not.toHaveBeenCalled();
	});

	it('recomputes the hourly durable identity after a preflight crossing a UTC hour', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date('2026-10-25T12:59:59Z'));
			const handlers = setup();
			handlers.verifyFreeRoute.mockImplementation(async () => {
				vi.setSystemTime(new Date('2026-10-25T13:00:01Z'));
			});
			const response = await handlers.POST(event());
			expect(response.status).toBe(200);
			expect(handlers.reserve.mock.calls[0][0]).toBe(
				await semanticClientHash('203.0.113.1', config.salt, new Date('2026-10-25T13:00:01Z'))
			);
			expect(handlers.reserve.mock.calls[0][0]).not.toBe(
				await semanticClientHash('203.0.113.1', config.salt, new Date('2026-10-25T12:59:59Z'))
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('discards a generated interpretation when the reader cancels before its completion', async () => {
		const handlers = setup();
		const controller = new AbortController();
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		let finish!: () => void;
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		handlers.generate.mockImplementation(async (text, signal) => {
			entered();
			await gate;
			expect(signal.aborted).toBe(true);
			return ontology(text);
		});
		const pending = handlers.POST(event(undefined, {}, '203.0.113.1', controller.signal));
		await started;
		controller.abort();
		finish();
		const response = await pending;
		expect(response.status).toBe(504);
		expect(await response.text()).not.toContain('ontology');
		expectPrivate(response);
	});

	it('exposes only bounded availability metadata on GET without reserving quota', async () => {
		const handlers = setup();
		const first = await handlers.GET(getEvent());
		const second = await handlers.GET(getEvent('203.0.113.2'));
		expect((await first.json()).available).toBe(true);
		expect((await second.json()).freeOnly).toBe(true);
		expect(handlers.verifyFreeRoute).toHaveBeenCalledTimes(1);
		expect(handlers.reserve).not.toHaveBeenCalled();
		expect(handlers.generate).not.toHaveBeenCalled();
		expectPrivate(first);
		expectPrivate(second);
	});

	it('reports unavailable rather than leaking status-check errors', async () => {
		const handlers = setup();
		handlers.verifyFreeRoute.mockRejectedValue(new Error('secret internal free-route lookup'));
		const response = await handlers.GET(getEvent());
		const body = await response.json();
		expect(body.available).toBe(false);
		expect(JSON.stringify(body)).not.toContain('secret internal');
		expect(handlers.reserve).not.toHaveBeenCalled();
	});
});

describe('ephemeral per-client quota identity', () => {
	it('is deterministic within a UTC hour and rotates at the next UTC hour', async () => {
		const before = new Date('2026-10-25T12:59:59.000Z');
		const first = await semanticClientHash('203.0.113.7', config.salt, before);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(
			await semanticClientHash('203.0.113.7', config.salt, new Date('2026-10-25T12:00:00.000Z'))
		).toBe(first);
		expect(
			await semanticClientHash('203.0.113.7', config.salt, new Date('2026-10-25T13:00:00.000Z'))
		).not.toBe(first);
		expect(await semanticClientHash('203.0.113.8', config.salt, before)).not.toBe(first);
		expect(
			await semanticClientHash('203.0.113.7', 'another-salt-at-least-thirty-two-characters', before)
		).not.toBe(first);
	});
	it('refuses missing identity or an insufficient private salt', async () => {
		await expect(semanticClientHash('', config.salt)).rejects.toBeInstanceOf(SemanticFailure);
		await expect(semanticClientHash('a'.repeat(257), config.salt)).rejects.toBeInstanceOf(
			SemanticFailure
		);
		await expect(semanticClientHash('203.0.113.7', 'short')).rejects.toBeInstanceOf(
			SemanticFailure
		);
	});
});
