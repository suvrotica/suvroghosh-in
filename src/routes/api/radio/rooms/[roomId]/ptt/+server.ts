import type { RequestHandler } from '@sveltejs/kit';
import { PttActionSchema } from '$lib/radio/types';
import { getRadioServerConfig } from '$lib/server/radio/config';
import { RadioMediaServiceError } from '$lib/server/radio/livekit';
import {
	acquirePttLease,
	heartbeatPttLease,
	listAuthorisedRoomsForUser,
	releasePttLease
} from '$lib/server/radio/store';
import {
	radioApiAdmission,
	radioJson,
	readRadioJson,
	requireRadioUser,
	requireSameOrigin
} from '$lib/server/radio/http';

export const POST: RequestHandler = async (event) => {
	const originError = requireSameOrigin(event);
	if (originError) return originError;

	const lease = radioApiAdmission.tryAcquire(event.getClientAddress());
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

		const parsed = PttActionSchema.safeParse(bodyResult.data);
		if (!parsed.success) {
			return radioJson({ ok: false, error: 'Invalid PTT action.' }, 400);
		}

		const { action, pressId } = parsed.data;
		const config = getRadioServerConfig(event.url);
		if (action !== 'release' && !config.radioModeAvailable) {
			return radioJson({ ok: false, error: 'Hosted Push-to-Talk is currently unavailable.' }, 503);
		}
		const hosted = !config.loopbackFallbackAllowed;
		if (hosted && !pressId) {
			return radioJson({ ok: false, error: 'A speaking press ID is required.' }, 400);
		}

		if (action === 'acquire') {
			const res = await acquirePttLease(roomId, auth.user.id, pressId);
			if (res.code === 'PTT_WATCHDOG_WARMING_UP') {
				return radioJson(res, 503, { 'Retry-After': '1' });
			}
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson(
				{ ...res, rooms },
				res.ok || res.busy || res.code === 'PTT_PRESS_ENDED' ? 200 : 403
			);
		}

		if (action === 'heartbeat') {
			const res = await heartbeatPttLease(roomId, auth.user.id, pressId);
			return radioJson(res, res.ok || hosted ? 200 : 409);
		}

		if (action === 'release') {
			const res = await releasePttLease(roomId, auth.user.id, pressId);
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson({ ...res, rooms });
		}

		return radioJson({ ok: false, error: 'Unsupported PTT action.' }, 400);
	} catch (error) {
		if (error instanceof RadioMediaServiceError) {
			return radioJson({ ok: false, error: error.message }, 503);
		}
		throw error;
	} finally {
		lease.release();
	}
};
