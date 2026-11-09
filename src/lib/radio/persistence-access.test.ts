import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { withRadioPersistence } from '$lib/server/radio/persistence';
import { currentRadioState } from '$lib/server/radio/state-context';
import { setRadioSessionCookie } from '$lib/server/radio/auth';
import { GET as callback } from '../../routes/api/radio/auth/callback/+server';

const env = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock('$env/dynamic/private', () => ({ env }));

function requestEvent(path: string, cookie?: string): RequestEvent {
	const values = new Map<string, string>(cookie ? [['comm_link_session', cookie]] : []);
	const url = new URL(`https://www.suvroghosh.in${path}`);
	return {
		url,
		request: new Request(url),
		params: {},
		getClientAddress: () => '127.0.0.2',
		cookies: {
			get: (name: string) => values.get(name),
			set: (name: string, value: string) => values.set(name, value),
			delete: (name: string) => values.delete(name)
		}
	} as unknown as RequestEvent;
}

describe('radio authentication before persistence', () => {
	beforeEach(() => {
		Object.assign(env, {
			VERCEL: '1',
			COMM_LINK_CALLS_ENABLED: 'true',
			COMM_LINK_SESSION_SECRET: 'x'.repeat(64),
			GOOGLE_OAUTH_CLIENT_ID: 'fixture',
			GOOGLE_OAUTH_CLIENT_SECRET: 'fixture',
			LIVEKIT_URL: 'wss://fixture.livekit.cloud',
			LIVEKIT_API_KEY: 'fixture',
			LIVEKIT_API_SECRET: 'fixture',
			SUPABASE_URL: 'https://fixture.supabase.co',
			SUPABASE_SERVICE_ROLE_KEY: 'fixture'
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it('does not acquire a database lease for anonymous or fabricated session requests', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		for (const cookie of [undefined, 'forged.payload']) {
			const action = vi.fn(async () => new Response('must not run'));
			const response = await withRadioPersistence(requestEvent('/api/radio/rooms', cookie), action);
			expect(response.status).toBe(401);
			expect(action).not.toHaveBeenCalled();
		}
		expect(fetch).not.toHaveBeenCalled();
	});

	it('keeps anonymous shell and invite-link loads isolated from private room state', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const response = await withRadioPersistence(
			requestEvent('/tools/radio?invite=long-private-invitation'),
			async () => {
				expect(currentRadioState().roomsById.size).toBe(0);
				expect(currentRadioState().invitationsById.size).toBe(0);
				return new Response('Sign in to review your invitation');
			}
		);
		expect(response.ok).toBe(true);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('validates an OAuth callback before allowing it near the database', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		const event = requestEvent('/api/radio/auth/callback?code=untrusted&state=untrusted');
		const response = await withRadioPersistence(event, async () => callback(event));
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toContain('authError=');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('fails closed on a database outage after successful cryptographic authentication', async () => {
		const event = requestEvent('/api/radio/rooms');
		await setRadioSessionCookie(event, {
			id: 'usr_verified',
			googleSub: 'verified',
			email: 'verified@example.com',
			displayName: 'Verified',
			avatarUrl: null,
			authenticatedAt: new Date().toISOString()
		});
		const fetch = vi.fn(async () => {
			throw new Error('database unavailable');
		});
		vi.stubGlobal('fetch', fetch);
		const action = vi.fn(async () => new Response('must not run'));
		const response = await withRadioPersistence(event, action);
		expect(response.status).toBe(503);
		expect(action).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalled();
	});
});
