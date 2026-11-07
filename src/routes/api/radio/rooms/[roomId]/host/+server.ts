import type { RequestHandler } from '@sveltejs/kit';
import { HostActionSchema } from '$lib/radio/types';
import { listAuthorisedRoomsForUser, performHostAction } from '$lib/server/radio/store';
import {
	radioJson,
	radioWriteAdmission,
	readRadioJson,
	requireRadioUser,
	requireSameOrigin
} from '$lib/server/radio/http';

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

		const parsed = HostActionSchema.safeParse(bodyResult.data);
		if (!parsed.success) {
			return radioJson(
				{
					ok: false,
					code: 'VALIDATION_ERROR',
					error: parsed.error.issues[0]?.message || 'Invalid host action payload.'
				},
				400
			);
		}

		const res = await performHostAction({
			roomId,
			actorUserId: auth.user.id,
			payload: parsed.data
		});

		const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
		return radioJson({ ...res, rooms }, res.ok ? 200 : 403);
	} finally {
		lease.release();
	}
};
