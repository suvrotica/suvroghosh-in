import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getRadioServerConfig } from '$lib/server/radio/config';
import { issueLiveKitAudioToken } from '$lib/server/radio/livekit';
import {
	getMediaTokenNotBefore,
	getRoomDetailForUser,
	recordMediaTokenIssuance
} from '$lib/server/radio/store';
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
		if (!room || room.myAdmissionStatus !== 'admitted' || !room.myParticipant?.isConnected) {
			return radioJson(
				{
					ok: false,
					code: 'NOT_ADMITTED',
					error: 'Connect as an admitted participant before requesting room audio.'
				},
				403
			);
		}

		const config = getRadioServerConfig(event.url);

		if (
			config.callsEnabled &&
			!config.loopbackFallbackAllowed &&
			config.livekitConfigured &&
			(room.mode === 'conversation' || config.radioModeAvailable)
		) {
			const embargoMs = getMediaTokenNotBefore(roomId, auth.user.id) - Date.now();
			if (embargoMs > 0) {
				return radioJson({ ok: false, error: 'Please retry connecting in a moment.' }, 409, {
					'Retry-After': String(Math.ceil(embargoMs / 1_000))
				});
			}
			let issued: Awaited<ReturnType<typeof issueLiveKitAudioToken>>;
			try {
				issued = await issueLiveKitAudioToken({
					roomId: room.id,
					userId: auth.user.id,
					displayName: auth.user.displayName,
					maxParticipants: room.maxParticipants,
					mode: room.mode,
					url: event.url
				});
			} catch {
				return radioJson(
					{ ok: false, error: 'The audio service is unavailable. Please try again.' },
					503
				);
			}

			recordMediaTokenIssuance(roomId, auth.user.id);
			const response: RadioMediaTokenResponse = {
				transport: 'livekit',
				roomId: room.id,
				participantId: auth.user.id,
				participantName: auth.user.displayName,
				serverUrl: issued.serverUrl,
				token: issued.token,
				expiresAt: issued.expiresAt,
				canPublish: false,
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
				canPublish: !parsed.data.joinAsListener && !room.myParticipant.isListenerOnly,
				iceServers: []
			};
			return radioJson({ ok: true, media: response });
		}

		return radioJson(
			{
				ok: false,
				code: 'MEDIA_SERVICE_UNCONFIGURED',
				error: 'Live calls are not available for this room.'
			},
			503
		);
	} finally {
		lease.release();
	}
};
