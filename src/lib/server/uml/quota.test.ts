import { describe, expect, it, vi } from 'vitest';
import { getUmlAiAvailability, getUmlServerConfig, type UmlServerConfig } from './config';
import { reserveUmlUsage, umlOwnerQuotaHash } from './quota';

const config: UmlServerConfig = {
	enabled: true,
	model: 'test/model',
	credentialAvailable: true,
	ownerConfigured: true,
	salt: '0123456789abcdef0123456789abcdef',
	supabaseUrl: 'https://test.supabase.co',
	supabaseKey: 'test-key'
};

describe('UML configuration and shared quota', () => {
	it('does not inherit another feature enable flag', () => {
		expect(getUmlServerConfig({ PROMPT_ATLAS_AI_ENABLED: 'true' }).enabled).toBe(false);
	});
	it('fails closed without owner authorization, shared credentials, or a strong salt', () => {
		for (const change of [
			{ ownerConfigured: false },
			{ salt: 'short' },
			{ supabaseKey: '' },
			{ credentialAvailable: false }
		]) {
			expect(getUmlAiAvailability({ ...config, ...change }).available).toBe(false);
		}
		expect(getUmlAiAvailability(config).available).toBe(true);
	});
	it('uses a stable owner/hour HMAC without retaining owner identity', async () => {
		const now = new Date('2026-10-28T10:30:00Z');
		const hash = await umlOwnerQuotaHash('owner-id', config.salt, now);
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
		expect(await umlOwnerQuotaHash('owner-id', config.salt, new Date('2026-10-28T10:59:00Z'))).toBe(
			hash
		);
		expect(
			await umlOwnerQuotaHash('owner-id', config.salt, new Date('2026-10-28T11:00:00Z'))
		).not.toBe(hash);
	});
	it('reserves in the existing atomic shared daily pool using only an owner HMAC', async () => {
		const fetcher = vi.fn<typeof fetch>(
			async () => new Response(JSON.stringify({ allowed: true, retryAfterSeconds: 0 }))
		);
		await expect(
			reserveUmlUsage(config, 'owner-id', new AbortController().signal, fetcher)
		).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
		const [url, init] = fetcher.mock.calls[0];
		expect(url).toBe('https://test.supabase.co/rest/v1/rpc/reserve_prompt_atlas_usage');
		const payload = JSON.parse(String(init?.body));
		expect(payload).toMatchObject({ daily_request_limit: 50, hourly_client_limit: 5 });
		expect(payload.client_hash).toMatch(/^[a-f0-9]{64}$/);
		expect(String(init?.body)).not.toContain('owner-id');
	});
	it('fails closed on missing RPC or malformed shared quota output', async () => {
		for (const response of [
			new Response('{}', { status: 404 }),
			new Response('{"allowed":true}')
		]) {
			await expect(
				reserveUmlUsage(config, 'owner', new AbortController().signal, async () => response)
			).rejects.toMatchObject({ code: 'quota_unavailable' });
		}
	});
});
