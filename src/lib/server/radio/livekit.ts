import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { RADIO_LIMITS } from '$lib/radio/types';
import { getRadioServerConfig } from './config';

function toHttpHost(wsUrl: string): string {
	return wsUrl.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
}

export async function issueLiveKitAudioToken(params: {
	roomId: string;
	userId: string;
	displayName: string;
	canPublish: boolean;
	url?: URL;
}): Promise<{ token: string; serverUrl: string; expiresAt: string }> {
	const cfg = getRadioServerConfig(params.url);
	if (!cfg.livekitConfigured || !cfg.livekitUrl || !cfg.livekitApiKey || !cfg.livekitApiSecret) {
		throw new Error('LiveKit is not configured on this server.');
	}

	const ttlSeconds = RADIO_LIMITS.ROOM_TOKEN_TTL_SECONDS;
	const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

	const at = new AccessToken(cfg.livekitApiKey, cfg.livekitApiSecret, {
		identity: params.userId,
		name: params.displayName,
		ttl: `${ttlSeconds}s`
	});

	at.addGrant({
		roomJoin: true,
		room: params.roomId,
		canSubscribe: true,
		canPublish: params.canPublish,
		canPublishData: false,
		// Strictly audio-only: never permit camera or screen-share tracks
		canPublishSources: params.canPublish ? [TrackSource.MICROPHONE] : []
	});

	const token = await at.toJwt();
	return {
		token,
		serverUrl: cfg.livekitUrl,
		expiresAt
	};
}

function getRoomServiceClient(url?: URL): RoomServiceClient | null {
	const cfg = getRadioServerConfig(url);
	if (!cfg.livekitConfigured || !cfg.livekitUrl || !cfg.livekitApiKey || !cfg.livekitApiSecret) {
		return null;
	}
	return new RoomServiceClient(
		toHttpHost(cfg.livekitUrl),
		cfg.livekitApiKey,
		cfg.livekitApiSecret
	);
}

export async function setRemoteParticipantPublishPermission(
	roomId: string,
	userId: string,
	canPublish: boolean,
	url?: URL
): Promise<void> {
	const svc = getRoomServiceClient(url);
	if (!svc) return;
	try {
		await svc.updateParticipant(roomId, userId, undefined, {
			canSubscribe: true,
			canPublish,
			canPublishData: false,
			canPublishSources: canPublish ? [TrackSource.MICROPHONE] : []
		});
	} catch {
		// Participant may not be connected to LiveKit SFU yet
	}
}

export async function removeRemoteParticipantFromSfu(
	roomId: string,
	userId: string,
	url?: URL
): Promise<void> {
	const svc = getRoomServiceClient(url);
	if (!svc) return;
	try {
		await svc.removeParticipant(roomId, userId);
	} catch {
		// Ignore if already disconnected
	}
}

export async function closeRemoteRoomOnSfu(roomId: string, url?: URL): Promise<void> {
	const svc = getRoomServiceClient(url);
	if (!svc) return;
	try {
		await svc.deleteRoom(roomId);
	} catch {
		// Ignore if room does not exist on SFU
	}
}
