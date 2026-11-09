import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackSource } from 'livekit-server-sdk';
import {
	closeRemoteRoomOnSfu,
	issueLiveKitAudioToken,
	removeRemoteParticipantFromSfu,
	setRemoteParticipantPublishPermission
} from '$lib/server/radio/livekit';
import { withRadioState } from '$lib/server/radio/state-context';
import { decodeRadioState, encodeRadioState } from '$lib/server/radio/state-codec';
import {
	acquirePttLease,
	connectParticipant,
	createRadioRoom,
	createRadioStoreState,
	heartbeatPttLease,
	performHostAction,
	recordMediaTokenIssuance,
	releasePttLease,
	requestRoomJoin,
	sweepExpiredRadioTransmissions
} from '$lib/server/radio/store';
import { RADIO_LIMITS, type RadioUser } from './types';

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

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function decodeToken(token: string) {
	return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
}

function fixtureUser(id: string): RadioUser {
	return {
		id,
		googleSub: id,
		email: `${id}@example.test`,
		displayName: id,
		avatarUrl: null,
		authenticatedAt: new Date().toISOString()
	};
}

async function radioRoomFixture() {
	const host = fixtureUser('host');
	const guest = fixtureUser('guest');
	const { room, inviteToken } = await createRadioRoom({
		host,
		name: 'Radio fixture',
		mode: 'radio',
		accessPolicy: 'approval_required'
	});
	await requestRoomJoin({ roomId: room.id, user: guest, inviteToken });
	for (const user of [host, guest]) {
		await connectParticipant({ roomId: room.id, user, joinAsListener: false });
		recordMediaTokenIssuance(room.id, user.id);
	}
	return { roomId: room.id, host, guest };
}

const testPress = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const withHostedPtt = <T>(action: () => Promise<T>) =>
	withRadioState(createRadioStoreState(), action, true, Date.now() + 60_000);

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

		const payload = decodeToken(token);
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

	it('reserves a publisher seat while the primary Radio connection stays subscribe-only', async () => {
		const fetch = vi.fn(async (_url: URL, _request: RequestInit) =>
			Response.json({ name: 'room-1', maxParticipants: 5 })
		);
		vi.stubGlobal('fetch', fetch);
		const { token } = await withMedia(() =>
			issueLiveKitAudioToken({
				roomId: 'room-1',
				userId: 'guest-1',
				displayName: 'Guest',
				maxParticipants: 4,
				mode: 'radio',
				url
			})
		);
		expect(decodeToken(token)).toMatchObject({
			roomConfig: { maxParticipants: 5 },
			video: { canSubscribe: true, canPublish: false, canPublishData: false }
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

describe('Hosted Push-to-Talk', () => {
	it('restores the publisher and cancelled presses in a separate durable request', async () => {
		const state = createRadioStoreState();
		const watchdogReadyUntilMs = Date.now() + 60_000;
		const cancelled = testPress(1);
		const active = testPress(2);
		const fetch = vi.fn(async (_url: URL, _request: RequestInit) => Response.json({}));
		vi.stubGlobal('fetch', fetch);
		const issued = await withRadioState(
			state,
			async () => {
				const { roomId, host } = await radioRoomFixture();
				await releasePttLease(roomId, host.id, cancelled);
				const result = await acquirePttLease(roomId, host.id, active);
				return { roomId, userId: host.id, publisherId: result.media?.participantId };
			},
			true,
			watchdogReadyUntilMs
		);

		await withRadioState(
			decodeRadioState(encodeRadioState(state)),
			async () => {
				expect((await acquirePttLease(issued.roomId, issued.userId, cancelled)).code).toBe(
					'PTT_PRESS_ENDED'
				);
				expect((await releasePttLease(issued.roomId, issued.userId, active)).ok).toBe(true);
			},
			true,
			watchdogReadyUntilMs
		);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body))).toMatchObject({
			identity: issued.publisherId
		});
	});

	it('issues one scoped publisher, honours early release and leaves a later press intact', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const started = Date.now();
		const fetch = vi.fn(async (_url: URL, _request: RequestInit) => Response.json({}));
		vi.stubGlobal('fetch', fetch);
		await withHostedPtt(async () => {
			const { roomId, host, guest } = await radioRoomFixture();
			const early = testPress(1);
			const firstPress = testPress(2);
			const secondPress = testPress(3);
			await releasePttLease(roomId, host.id, early);
			expect((await acquirePttLease(roomId, host.id, early)).code).toBe('PTT_PRESS_ENDED');

			const first = await acquirePttLease(roomId, host.id, firstPress);
			expect(first.ok).toBe(true);
			const payload = decodeToken(first.media!.token);
			expect(payload.sub).toMatch(/^ptt_/);
			expect(payload.metadata).toBe(host.id);
			expect(payload.exp - payload.nbf).toBeLessThanOrEqual(8);
			expect(payload.video).toMatchObject({
				room: roomId,
				roomJoin: true,
				canSubscribe: false,
				canPublish: true,
				canPublishData: false,
				canUpdateOwnMetadata: false
			});
			expect(payload.video.canPublishSources).toEqual(['microphone']);

			vi.setSystemTime(started + 2_000);
			const retry = await acquirePttLease(roomId, host.id, firstPress);
			expect(retry.media?.participantId).toBe(first.media?.participantId);
			expect(retry.media?.token).toBe(first.media?.token);
			expect(retry.room?.pttLease.expiresAt).toBe(first.room?.pttLease.expiresAt);
			expect((await acquirePttLease(roomId, guest.id, secondPress)).busy).toBe(true);
			await releasePttLease(roomId, host.id, firstPress);
			const second = await acquirePttLease(roomId, host.id, secondPress);
			expect(second.media?.participantId).not.toBe(first.media?.participantId);
			const staleRelease = await releasePttLease(roomId, host.id, firstPress);
			expect(staleRelease.room?.pttLease.publisherId).toBe(second.media?.participantId);
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body))).toMatchObject({
				identity: first.media?.participantId,
				revokeTokenTs: expect.stringMatching(/^\d+$/)
			});
		});
	});

	it('fails closed when the watchdog is cold or an expired publisher cannot be revoked', async () => {
		const fetch = vi.fn(async () =>
			Response.json({ code: 'internal', msg: 'unavailable' }, { status: 500 })
		);
		vi.stubGlobal('fetch', fetch);
		await withMedia(async () => {
			const { roomId, host } = await radioRoomFixture();
			expect((await acquirePttLease(roomId, host.id, testPress(1))).code).toBe(
				'PTT_WATCHDOG_WARMING_UP'
			);
		});
		expect(fetch).not.toHaveBeenCalled();

		vi.useFakeTimers({ toFake: ['Date'] });
		const started = Date.now();
		await withHostedPtt(async () => {
			const { roomId, host, guest } = await radioRoomFixture();
			const first = await acquirePttLease(roomId, host.id, testPress(2));
			expect(first.ok).toBe(true);
			vi.setSystemTime(started + RADIO_LIMITS.PTT_LEASE_TTL_MS + 1);
			expect(await sweepExpiredRadioTransmissions()).toEqual({ revoked: 0, failures: 1 });
			await expect(acquirePttLease(roomId, guest.id, testPress(3))).rejects.toThrow(
				'audio service is unavailable'
			);

			fetch.mockResolvedValue(Response.json({}));
			expect(await sweepExpiredRadioTransmissions()).toEqual({ revoked: 1, failures: 0 });
			expect((await acquirePttLease(roomId, guest.id, testPress(3))).ok).toBe(true);
		});
	});

	it('caps heartbeat renewals and revokes the speaking identity when the host mutes', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const started = Date.now();
		const fetch = vi.fn(async (_url: URL, _request: RequestInit) => Response.json({}));
		vi.stubGlobal('fetch', fetch);
		await withHostedPtt(async () => {
			const { roomId, host, guest } = await radioRoomFixture();
			const press = testPress(1);
			const first = await acquirePttLease(roomId, guest.id, press);
			for (let elapsed = 7_000; elapsed <= 42_000; elapsed += 7_000) {
				vi.setSystemTime(started + elapsed);
				const heartbeat = await heartbeatPttLease(roomId, guest.id, press);
				expect(heartbeat.ok).toBe(true);
				expect(Date.parse(heartbeat.room!.pttLease.expiresAt!)).toBe(
					started + Math.min(elapsed + 8_000, 45_000)
				);
			}
			const muted = await performHostAction({
				roomId,
				actorUserId: host.id,
				payload: { action: 'mute_participant', targetUserId: guest.id }
			});
			expect(muted.room?.pttLease.publisherId).toBeNull();
			expect(
				muted.room?.participants.find((member) => member.userId === guest.id)?.isConnected
			).toBe(true);
			expect((await acquirePttLease(roomId, guest.id, testPress(2))).ok).toBe(false);
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body))).toMatchObject({
				identity: first.media?.participantId
			});
		});
	});
});
