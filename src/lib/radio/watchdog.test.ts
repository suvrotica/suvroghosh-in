import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { POST } from '../../routes/api/internal/radio-watchdog/+server';
import { createRadioStoreState, createRadioRoom } from '$lib/server/radio/store';
import { decodeRadioState, encodeRadioState } from '$lib/server/radio/state-codec';
import { radioWatchdogReadyForRequest, withRadioState } from '$lib/server/radio/state-context';

const fixtures = vi.hoisted(() => ({ env: {} as Record<string, string>, sweep: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: fixtures.env }));
vi.mock('$lib/server/radio/store', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/radio/store')>()),
	sweepExpiredRadioTransmissions: fixtures.sweep
}));

const secret = 'fixture-watchdog-secret-with-at-least-32-characters';
const dispatchId = '1d116d12-a830-4a44-b83f-c63022de19a7';
const canonicalUrl = 'https://www.suvroghosh.in/api/internal/radio-watchdog';
const expiry = () => Math.floor(Date.now() / 1000) + 25;
function proof(id: string, expiresAt: number, url = canonicalUrl, method = 'POST') {
	return `Bearer ${createHmac('sha256', secret)
		.update(`comm-link-watchdog:v1\n${id}\n${expiresAt}\n${method}\n${url}`)
		.digest('hex')}`;
}
function event(
	body = JSON.stringify({ dispatchId, expiresAt: expiry() }),
	authorization?: string
): RequestEvent {
	const url = new URL(canonicalUrl);
	let payload;
	try {
		payload = JSON.parse(body);
	} catch {
		payload = { dispatchId, expiresAt: expiry() };
	}
	authorization ??= proof(payload.dispatchId, payload.expiresAt);
	return {
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { authorization, 'content-type': 'application/json' },
			body
		})
	} as RequestEvent;
}

describe('independent radio expiry endpoint', () => {
	beforeEach(() => {
		Object.assign(fixtures.env, {
			VERCEL: '1',
			VERCEL_ENV: 'production',
			COMM_LINK_WATCHDOG_SECRET: `${secret}\n`,
			LIVEKIT_URL: 'wss://fixture.livekit.cloud',
			LIVEKIT_API_KEY: 'fixture',
			LIVEKIT_API_SECRET: 'fixture',
			SUPABASE_URL: 'https://fixture.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'fixture'
		});
		fixtures.sweep.mockReset();
		fixtures.sweep.mockResolvedValue({ revoked: 1, failures: 0 });
	});
	afterEach(() => vi.unstubAllGlobals());

	it('rejects unauthorized, oversized, or caller-expanded requests before any database work', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect((await POST(event(undefined, 'Bearer invalid'))).status).toBe(401);
		expect((await POST(event('x'.repeat(129)))).status).toBe(413);
		expect(
			(
				await POST(
					event(JSON.stringify({ dispatchId, expiresAt: expiry(), roomId: 'private-room' }))
				)
			).status
		).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
		expect(fixtures.sweep).not.toHaveBeenCalled();
	});

	it('rejects raw keys, tampered proofs, expired or overly distant expiry and wrong purpose before DB work', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const expiresAt = expiry();
		const body = JSON.stringify({ dispatchId, expiresAt });
		expect((await POST(event(body, `Bearer ${secret}`))).status).toBe(401);
		expect((await POST(event(body, `Bearer ${'0'.repeat(64)}`))).status).toBe(401);
		expect((await POST(event(body, proof(dispatchId, expiresAt + 1)))).status).toBe(401);
		expect(
			(await POST(event(body, proof('12345678-1234-4234-8234-123456789abc', expiresAt)))).status
		).toBe(401);
		expect(
			(await POST(event(body, proof(dispatchId, expiresAt, canonicalUrl, 'GET')))).status
		).toBe(401);
		expect(
			(await POST(event(body, proof(dispatchId, expiresAt, 'https://example.com/worker')))).status
		).toBe(401);
		for (const invalidExpiry of [
			Math.floor(Date.now() / 1000) - 1,
			Math.floor(Date.now() / 1000) + 31
		]) {
			expect(
				(await POST(event(JSON.stringify({ dispatchId, expiresAt: invalidExpiry })))).status
			).toBe(401);
		}
		expect(fetch).not.toHaveBeenCalled();
		expect(fixtures.sweep).not.toHaveBeenCalled();
	});

	it('ignores duplicate or expired dispatch IDs without touching room state', async () => {
		const fetch = vi.fn(async () => Response.json(false));
		vi.stubGlobal('fetch', fetch);
		const response = await POST(event());
		expect(await response.json()).toEqual({ ok: true, skipped: true });
		expect(fetch).toHaveBeenCalledOnce();
		expect(fixtures.sweep).not.toHaveBeenCalled();
	});

	it('acknowledges healthy execution only after its fenced state commit', async () => {
		const calls: { name: string; body: Record<string, unknown> }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: URL, request: RequestInit) => {
				const name = url.pathname.split('/').at(-1)!;
				calls.push({ name, body: JSON.parse(String(request.body)) });
				if (name === 'comm_link_state_acquire')
					return Response.json({
						acquired: true,
						version: 0,
						snapshot: encodeRadioState(createRadioStoreState()),
						watchdogReadyUntilMs: 0
					});
				return Response.json(true);
			})
		);
		const response = await POST(event());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, revoked: 1, failures: 0 });
		expect(calls.findIndex((call) => call.name === 'comm_link_state_commit')).toBeLessThan(
			calls.findIndex((call) => call.name === 'comm_link_watchdog_finish')
		);
		expect(calls.at(-1)?.body.p_success).toBe(true);
	});

	it('commits partial cleanup but marks readiness unhealthy so failed expiry remains retryable', async () => {
		fixtures.sweep.mockResolvedValue({ revoked: 1, failures: 1 });
		const calls: { name: string; body: Record<string, unknown> }[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: URL, request: RequestInit) => {
				const name = url.pathname.split('/').at(-1)!;
				calls.push({ name, body: JSON.parse(String(request.body)) });
				if (name === 'comm_link_state_acquire')
					return Response.json({
						acquired: true,
						version: 1,
						snapshot: encodeRadioState(createRadioStoreState())
					});
				return Response.json(true);
			})
		);
		const response = await POST(event());
		expect(response.status).toBe(503);
		expect(calls.some((call) => call.name === 'comm_link_state_commit')).toBe(true);
		expect(calls.at(-1)?.body.p_success).toBe(false);
	});

	it('expires hosted readiness at the supplied SQL deadline and never infers it outside a request', async () => {
		expect(radioWatchdogReadyForRequest()).toBe(false);
		await withRadioState(
			createRadioStoreState(),
			async () => expect(radioWatchdogReadyForRequest()).toBe(false),
			true,
			Date.now() - 1
		);
		await withRadioState(
			createRadioStoreState(),
			async () => expect(radioWatchdogReadyForRequest()).toBe(true),
			true,
			Date.now() + 5000
		);
	});

	it('round-trips the one-time publisher identity and bounded press history through persistence', async () => {
		const state = createRadioStoreState();
		await withRadioState(state, async () => {
			const { room } = await createRadioRoom({
				host: {
					id: 'usr_one',
					googleSub: 'one',
					email: 'one@example.com',
					displayName: 'One',
					avatarUrl: null,
					authenticatedAt: new Date().toISOString()
				},
				name: 'Radio',
				mode: 'radio',
				accessPolicy: 'approval_required'
			});
			const stored = state.roomsById.get(room.id)!;
			stored.pttLease = {
				holderUserId: 'usr_one',
				holderName: 'One',
				acquiredAtMs: Date.now(),
				expiresAtMs: Date.now() + 8000,
				pressId: 'press_one',
				publisherId: 'ptt_publisher_one'
			};
			stored.recentPttPresses = [
				{ userId: 'usr_one', pressId: 'press_old', expiresAtMs: Date.now() + 60_000 }
			];
			const restored = decodeRadioState(encodeRadioState(state)).roomsById.get(room.id)!;
			expect(restored.pttLease.publisherId).toBe('ptt_publisher_one');
			expect(restored.recentPttPresses).toEqual(stored.recentPttPresses);
			stored.recentPttPresses = Array.from({ length: 193 }, () => stored.recentPttPresses![0]);
			expect(() => encodeRadioState(state)).toThrow();
		});
	});
});
