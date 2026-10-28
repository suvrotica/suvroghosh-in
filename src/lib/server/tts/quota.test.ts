import { afterEach, describe, expect, it, vi } from 'vitest';
import { reserveTtsUsage, ttsClientHash, ttsQuotaConfig } from './quota';

const env = {
	CHATTERBOX_TTS_ENABLED: 'true',
	CHATTERBOX_TTS_ENDPOINT: 'https://speech.example/tts',
	CHATTERBOX_TTS_RATE_LIMIT_SALT: 'a'.repeat(32),
	SUPABASE_URL: 'https://database.example',
	SUPABASE_SERVICE_ROLE_KEY: 'test-service-secret'
};
const config = ttsQuotaConfig(env)!;
const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());

describe('TTS shared admission', () => {
	it('requires explicit enablement, protected transport, and a dedicated nontrivial salt', () => {
		expect(ttsQuotaConfig(env)).toEqual({
			supabaseUrl: 'https://database.example',
			supabaseKey: 'test-service-secret',
			salt: 'a'.repeat(32)
		});
		for (const [key, value] of [
			['CHATTERBOX_TTS_ENABLED', 'false'],
			['CHATTERBOX_TTS_RATE_LIMIT_SALT', 'short'],
			['CHATTERBOX_TTS_ENDPOINT', 'http://speech.example/tts'],
			['CHATTERBOX_TTS_ENDPOINT', 'https://user:password@speech.example/tts'],
			['SUPABASE_URL', 'https://database.example/wrong-path'],
			['SUPABASE_URL', 'http://database.example'],
			['SUPABASE_SERVICE_ROLE_KEY', '']
		])
			expect(ttsQuotaConfig({ ...env, [key]: value })).toBeNull();
		expect(
			ttsQuotaConfig({ ...env, CHATTERBOX_TTS_ENDPOINT: 'http://127.0.0.1:8000/tts' })
		).not.toBeNull();
	});

	it('uses a daily rotating feature-specific keyed hash and rejects missing identities', () => {
		const now = new Date('2026-10-28T12:00:00Z');
		const hash = ttsClientHash('192.0.2.1', config.salt, now);
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		expect(ttsClientHash('192.0.2.1', config.salt, now)).toBe(hash);
		expect(ttsClientHash('192.0.2.2', config.salt, now)).not.toBe(hash);
		expect(ttsClientHash('192.0.2.1', 'b'.repeat(32), now)).not.toBe(hash);
		expect(ttsClientHash('192.0.2.1', config.salt, new Date('2026-10-29T00:00:00Z'))).not.toBe(
			hash
		);
		expect(() => ttsClientHash('', config.salt, now)).toThrow();
	});

	it('sends only a hash and normalized size to the fixed service-only RPC', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(Response.json({ allowed: true, retryAfterSeconds: 0 }));
		expect(await reserveTtsUsage(config, '192.0.2.1', 30, signal(), fetcher)).toEqual({
			allowed: true,
			retryAfterSeconds: 0
		});
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://database.example/rest/v1/rpc/reserve_chatterbox_usage');
		expect(init.redirect).toBe('error');
		expect(init.cache).toBe('no-store');
		expect(init.headers.authorization).toBe('Bearer test-service-secret');
		expect(JSON.parse(init.body)).toEqual({
			client_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
			text_characters: 30
		});
		expect(init.body).not.toContain('192.0.2.1');
	});

	it.each([
		null,
		[],
		{},
		{ allowed: 'true', retryAfterSeconds: 0 },
		{ allowed: true, retryAfterSeconds: 10 },
		{ allowed: false, retryAfterSeconds: 0 },
		{ allowed: false, retryAfterSeconds: 86401 }
	])('refuses malformed quota receipts %#', async (value) => {
		const fetcher = vi.fn().mockResolvedValue(Response.json(value));
		await expect(reserveTtsUsage(config, 'client', 30, signal(), fetcher)).rejects.toThrow();
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('returns valid denials without retries', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(Response.json({ allowed: false, retryAfterSeconds: 150 }));
		expect(await reserveTtsUsage(config, 'client', 30, signal(), fetcher)).toEqual({
			allowed: false,
			retryAfterSeconds: 150
		});
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('bounds quota response bytes and cancels unexpected error bodies', async () => {
		for (const status of [200, 503]) {
			const cancel = vi.fn();
			const fetcher = vi.fn().mockResolvedValue(
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new Uint8Array(4097));
						},
						cancel
					}),
					{ status }
				)
			);
			await expect(reserveTtsUsage(config, 'client', 30, signal(), fetcher)).rejects.toThrow();
			expect(cancel).toHaveBeenCalled();
		}
	});

	it('settles a stalled quota call at five seconds and aborts its transport without retrying', async () => {
		vi.useFakeTimers();
		let transportSignal: AbortSignal | undefined;
		const fetcher = vi.fn((_url, init) => {
			transportSignal = init.signal;
			return new Promise<Response>(() => {});
		});
		const reservation = reserveTtsUsage(config, 'client', 30, signal(), fetcher);
		const rejected = expect(reservation).rejects.toThrow('timeout');
		await vi.advanceTimersByTimeAsync(5001);
		await rejected;
		expect(transportSignal?.aborted).toBe(true);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('does no transport work for an aborted request or invalid text size', async () => {
		const controller = new AbortController();
		controller.abort();
		const fetcher = vi.fn();
		await expect(
			reserveTtsUsage(config, 'client', 30, controller.signal, fetcher)
		).rejects.toThrow();
		await expect(reserveTtsUsage(config, 'client', 3001, signal(), fetcher)).rejects.toThrow();
		expect(fetcher).not.toHaveBeenCalled();
	});
});
