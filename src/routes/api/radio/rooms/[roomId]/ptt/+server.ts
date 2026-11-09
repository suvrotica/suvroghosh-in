import type { RequestHandler } from '@sveltejs/kit';
import { PttActionSchema } from '$lib/radio/types';
import { getRadioServerConfig } from '$lib/server/radio/config';
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

	if (!getRadioServerConfig(event.url).radioModeAvailable) {
		return radioJson({ ok: false, error: 'Live rooms use Conversation mode.' }, 400);
	}

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

		const { action } = parsed.data;
		if (action === 'acquire') {
			const res = await acquirePttLease(roomId, auth.user.id);
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson({ ...res, rooms }, res.ok || res.busy ? 200 : 403);
		}

		if (action === 'heartbeat') {
			const res = heartbeatPttLease(roomId, auth.user.id);
			return radioJson(res, res.ok ? 200 : 409);
		}

		if (action === 'release') {
			const res = await releasePttLease(roomId, auth.user.id);
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson({ ...res, rooms });
		}

		return radioJson({ ok: false, error: 'Unsupported PTT action.' }, 400);
	} finally {
		lease.release();
	}
};
