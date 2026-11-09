import {
	AccessToken,
	RoomConfiguration,
	RoomServiceClient,
	ServerError,
	TrackSource
} from 'livekit-server-sdk';
import { RADIO_LIMITS } from '$lib/radio/types';
import { getRadioServerConfig } from './config';
import { markRadioRoomClosed, radioMediaEnabledForRequest } from './state-context';

// LiveKit Cloud refreshes connected participants' tokens for up to ten minutes.
const ROOM_DEPARTURE_TIMEOUT_SECONDS = 630;
const REVOCATION_CLOCK_SKEW_SECONDS = 3;

export class RadioMediaServiceError extends Error {
	constructor() {
		super('The audio service is unavailable. Please try again.');
		this.name = 'RadioMediaServiceError';
	}
}

function getRoomServiceClient(url?: URL, requestTimeout = 6): RoomServiceClient | null {
	if (!radioMediaEnabledForRequest()) return null;
	const cfg = getRadioServerConfig(url);
	if (!cfg.livekitConfigured || !cfg.livekitUrl || !cfg.livekitApiKey || !cfg.livekitApiSecret) {
		throw new RadioMediaServiceError();
	}
	const endpoint = new URL(cfg.livekitUrl);
	endpoint.protocol = 'https:';
	return new RoomServiceClient(endpoint.origin, cfg.livekitApiKey, cfg.livekitApiSecret, {
		requestTimeout,
		failover: false
	});
}

function isMissingRemoteRoomOrParticipant(error: unknown): boolean {
	return error instanceof ServerError && error.status === 404 && error.code === 'not_found';
}

export async function issueLiveKitAudioToken(params: {
	roomId: string;
	userId: string;
	displayName: string;
	maxParticipants: number;
	url: URL;
}): Promise<{ token: string; serverUrl: string; expiresAt: string }> {
	const cfg = getRadioServerConfig(params.url);
	// The first room in a cold LiveKit project can need longer than a control update.
	const svc = getRoomServiceClient(params.url, 9);
	if (!svc || !cfg.livekitUrl || !cfg.livekitApiKey || !cfg.livekitApiSecret) {
		throw new RadioMediaServiceError();
	}

	try {
		const roomConfig = {
			name: params.roomId,
			maxParticipants: params.maxParticipants,
			emptyTimeout: RADIO_LIMITS.ROOM_TOKEN_TTL_SECONDS + 30,
			departureTimeout: ROOM_DEPARTURE_TIMEOUT_SECONDS
		};
		const room = await svc.createRoom(roomConfig);
		if (room.name !== params.roomId || room.maxParticipants !== params.maxParticipants) {
			throw new RadioMediaServiceError();
		}

		const at = new AccessToken(cfg.livekitApiKey, cfg.livekitApiSecret, {
			identity: params.userId,
			name: params.displayName,
			ttl: RADIO_LIMITS.ROOM_TOKEN_TTL_SECONDS
		});
		at.roomConfig = new RoomConfiguration(roomConfig);
		at.addGrant({
			roomJoin: true,
			room: params.roomId,
			canSubscribe: true,
			canPublish: false,
			canPublishData: false,
			canUpdateOwnMetadata: false
		});
		const token = await at.toJwt();
		return {
			token,
			serverUrl: cfg.livekitUrl,
			expiresAt: new Date(Date.now() + RADIO_LIMITS.ROOM_TOKEN_TTL_SECONDS * 1_000).toISOString()
		};
	} catch {
		throw new RadioMediaServiceError();
	}
}

export async function setRemoteParticipantPublishPermission(
	roomId: string,
	userId: string,
	canPublish: boolean
): Promise<void> {
	const svc = getRoomServiceClient();
	if (!svc) return;
	try {
		const participant = await svc.updateParticipant(roomId, userId, {
			permission: {
				canSubscribe: true,
				canPublish,
				canPublishData: false,
				canUpdateMetadata: false,
				canPublishSources: canPublish ? [TrackSource.MICROPHONE] : []
			}
		});
		if (participant.identity !== userId || participant.permission?.canPublish !== canPublish) {
			throw new RadioMediaServiceError();
		}
	} catch (error) {
		if (!canPublish && isMissingRemoteRoomOrParticipant(error)) return;
		throw new RadioMediaServiceError();
	}
}

async function revokeParticipant(
	svc: RoomServiceClient,
	roomId: string,
	userId: string,
	cutoff: number
): Promise<void> {
	await svc.removeParticipant(roomId, userId, { revokeTokenTs: BigInt(cutoff) });
}

function revocationCutoffSeconds(): number {
	return Math.floor(Date.now() / 1_000) + REVOCATION_CLOCK_SKEW_SECONDS;
}

export async function removeRemoteParticipantFromSfu(
	roomId: string,
	userId: string
): Promise<number> {
	const svc = getRoomServiceClient();
	if (!svc) return 0;
	try {
		const cutoff = revocationCutoffSeconds();
		await revokeParticipant(svc, roomId, userId, cutoff);
		return cutoff * 1_000;
	} catch {
		// A strict Cloud revoke should succeed even if the participant has disconnected.
		// An unexpected missing-room response is not evidence of token revocation.
		throw new RadioMediaServiceError();
	}
}

export async function closeRemoteRoomOnSfu(
	roomId: string,
	knownParticipantIds: Iterable<string> = []
): Promise<void> {
	const svc = getRoomServiceClient();
	if (!svc) {
		markRadioRoomClosed(roomId);
		return;
	}
	try {
		const ids = new Set(knownParticipantIds);
		try {
			for (const participant of await svc.listParticipants(roomId)) {
				ids.add(participant.identity);
			}
		} catch (error) {
			if (!isMissingRemoteRoomOrParticipant(error)) throw error;
		}
		const cutoff = revocationCutoffSeconds();
		await Promise.all(Array.from(ids, (id) => revokeParticipant(svc, roomId, id, cutoff)));
		try {
			await svc.deleteRoom(roomId);
		} catch (error) {
			if (!isMissingRemoteRoomOrParticipant(error)) throw error;
		}
		markRadioRoomClosed(roomId);
	} catch {
		throw new RadioMediaServiceError();
	}
}
