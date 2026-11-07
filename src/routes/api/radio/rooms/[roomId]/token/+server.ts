import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getRadioServerConfig } from '$lib/server/radio/config';
import { issueLiveKitAudioToken } from '$lib/server/radio/livekit';
import { getRoomDetailForUser } from '$lib/server/radio/store';
import {
	radioJson,
	radioWriteAdmission,
	readRadioJson,
	requireRadioUser,
	requireSameOrigin
} from '$lib/server/radio/http';
import type { RadioMediaTokenResponse } from '$lib/radio/types';

const TokenRequestSchema = z
	.object({
		joinAsListener: z.boolean().default(false)
	})
	.strict();

export const POST: RequestHandler = async (event) => {
	const originError = requireSameOrigin(event);
	if (originError) return originError;

	const lease = radioWriteAdmission.tryAcquire(event.getClientAddress());
	if (!lease.ok) {
		return radioJson({ ok: false, error: 'Too many requests.' }, 429);
	}

	try {
		const auth = await requireRadioUser(event);
		if (auth.errorResponse) return auth.errorResponse;

		const roomId = event.params.roomId;
		if (!roomId) {
			return radioJson({ ok: false, error: 'Missing room ID.' }, 400);
		}

		const bodyResult = await readRadioJson(event.request);
		if (bodyResult.errorResponse) return bodyResult.errorResponse;

		const parsed = TokenRequestSchema.safeParse(bodyResult.data);
		if (!parsed.success) {
			return radioJson({ ok: false, error: 'Invalid token request.' }, 400);
		}

		const room = getRoomDetailForUser(roomId, auth.user.id, auth.user.email);
		if (!room || room.myAdmissionStatus !== 'admitted') {
			return radioJson(
				{
					ok: false,
					code: 'NOT_ADMITTED',
					error: 'You must be an admitted participant of this room to receive a media token.'
				},
				403
			);
		}

		const canPublish = !parsed.data.joinAsListener;
		const config = getRadioServerConfig(event.url);

		if (config.livekitConfigured) {
			const issued = await issueLiveKitAudioToken({
				roomId: room.id,
				userId: auth.user.id,
				displayName: auth.user.displayName,
				canPublish,
				url: event.url
			});

			const response: RadioMediaTokenResponse = {
				transport: 'livekit',
				roomId: room.id,
				participantId: auth.user.id,
				participantName: auth.user.displayName,
				serverUrl: issued.serverUrl,
				token: issued.token,
				expiresAt: issued.expiresAt,
				canPublish,
				iceServers: []
			};

			return radioJson({ ok: true, media: response });
		}

		if (config.loopbackFallbackAllowed) {
			const expiresAt = new Date(Date.now() + 900 * 1000).toISOString();
			const response: RadioMediaTokenResponse = {
				transport: 'loopback-webrtc',
				roomId: room.id,
				participantId: auth.user.id,
				participantName: auth.user.displayName,
				serverUrl: null,
				token: `loopback_${room.id}_${auth.user.id}_${Date.now()}`,
				expiresAt,
				canPublish,
				iceServers: []
			};
			return radioJson({ ok: true, media: response });
		}

		return radioJson(
			{
				ok: false,
				code: 'MEDIA_SERVICE_UNCONFIGURED',
				error:
					'LiveKit SFU credentials (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) are required in production.'
			},
			503
		);
	} finally {
		lease.release();
	}
};
