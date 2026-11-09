import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackSource } from 'livekit-server-sdk';
import {
	closeRemoteRoomOnSfu,
	issueLiveKitAudioToken,
	removeRemoteParticipantFromSfu,
	setRemoteParticipantPublishPermission
} from '$lib/server/radio/livekit';
import { withRadioState } from '$lib/server/radio/state-context';
import { createRadioStoreState } from '$lib/server/radio/store';

vi.mock('$lib/server/radio/config', () => ({
	getRadioServerConfig: () => ({
		livekitConfigured: true,
		livekitUrl: 'wss://radio-test.livekit.cloud',
		livekitApiKey: 'radio-test-key',
		livekitApiSecret: 'radio-test-secret'
	})
}));

const url = new URL('https://example.test/tools/radio');
const issueToken = () =>
	issueLiveKitAudioToken({
		roomId: 'room-1',
		userId: 'guest-1',
		displayName: 'Guest',
		maxParticipants: 4,
		url
	});
const withMedia = <T>(action: () => Promise<T>) =>
	withRadioState(createRadioStoreState(), action, true);

afterEach(() => vi.unstubAllGlobals());

describe('LiveKit authorization', () => {
	it('applies the provider room cap and issues a short subscribe-only token', async () => {
		const fetch = vi.fn(async (_url: URL, _request: RequestInit) =>
			Response.json({ name: 'room-1', maxParticipants: 4 })
		);
		vi.stubGlobal('fetch', fetch);

		const { token } = await withMedia(issueToken);
		const [endpoint, request] = fetch.mock.calls[0]!;
		expect(endpoint.pathname).toMatch(/\/CreateRoom$/);
		expect(JSON.parse(String(request.body))).toMatchObject({ name: 'room-1', maxParticipants: 4 });

		const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
		expect(payload.sub).toBe('guest-1');
		expect(payload.exp - payload.nbf).toBeLessThanOrEqual(60);
		expect(payload.roomConfig).toMatchObject({ maxParticipants: 4, departureTimeout: 630 });
		expect(payload.video).toEqual({
			roomJoin: true,
			room: 'room-1',
			canSubscribe: true,
			canPublish: false,
			canPublishData: false,
			canUpdateOwnMetadata: false
		});
	});

	it('refuses to issue a token without a verified room cap', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ name: 'room-1', maxParticipants: 0 }))
		);
		await expect(withMedia(issueToken)).rejects.toThrow('audio service is unavailable');
	});

	it('never contacts the provider for a loopback fixture even if credentials are configured', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await withRadioState(createRadioStoreState(), async () => {
			await setRemoteParticipantPublishPermission('room-1', 'guest-1', true);
			await expect(issueToken()).rejects.toThrow('audio service is unavailable');
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('allows only the microphone source and strictly revokes a removed identity', async () => {
		const fetch = vi.fn(async (url: URL, _request: RequestInit) =>
			url.pathname.endsWith('/UpdateParticipant')
				? Response.json({ identity: 'guest-1', permission: { canPublish: true } })
				: Response.json({})
		);
		vi.stubGlobal('fetch', fetch);

		const cutoff = await withMedia(async () => {
			await setRemoteParticipantPublishPermission('room-1', 'guest-1', true);
			return removeRemoteParticipantFromSfu('room-1', 'guest-1');
		});

		const [update, remove] = fetch.mock.calls;
		expect(update?.[0].pathname).toMatch(/\/UpdateParticipant$/);
		const grant = JSON.parse(String(update?.[1].body)).permission;
		expect(grant).toMatchObject({ canPublish: true, canSubscribe: true });
		// Proto3 omits false booleans in its JSON representation.
		expect(grant.canPublishData).not.toBe(true);
		expect(grant.canPublishSources).toEqual([TrackSource[TrackSource.MICROPHONE]]);
		expect(remove?.[0].pathname).toMatch(/\/RemoveParticipant$/);
		expect(JSON.parse(String(remove?.[1].body))).toMatchObject({
			room: 'room-1',
			identity: 'guest-1',
			revokeTokenTs: String(cutoff / 1_000)
		});
	});

	it('reports failed media revocation and leaves deletion for a retry', async () => {
		const fetch = vi.fn(async (url: URL) => {
			if (url.pathname.endsWith('/ListParticipants')) return Response.json({ participants: [] });
			return Response.json({ code: 'internal', msg: 'unavailable' }, { status: 500 });
		});
		vi.stubGlobal('fetch', fetch);
		await expect(withMedia(() => closeRemoteRoomOnSfu('room-1', ['guest-1']))).rejects.toThrow(
			'audio service is unavailable'
		);
		expect(fetch.mock.calls.map(([url]) => url.pathname.split('/').at(-1))).toEqual([
			'ListParticipants',
			'RemoveParticipant'
		]);
	});

	it('does not assume a missing-room response revoked a previously issued token', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({ code: 'not_found', msg: 'room not found' }, { status: 404 })
			)
		);
		await expect(
			withMedia(() => removeRemoteParticipantFromSfu('room-1', 'guest-1'))
		).rejects.toThrow('audio service is unavailable');
	});
});
