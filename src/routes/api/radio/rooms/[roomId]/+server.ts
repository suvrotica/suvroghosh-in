import type { RequestHandler } from '@sveltejs/kit';
import { getRoomDetailForUser, listAuthorisedRoomsForUser } from '$lib/server/radio/store';
import { radioApiAdmission, radioJson, requireRadioUser } from '$lib/server/radio/http';

export const GET: RequestHandler = async (event) => {
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

		const room = getRoomDetailForUser(roomId, auth.user.id, auth.user.email);
		if (!room) {
			return radioJson(
				{
					ok: false,
					code: 'ROOM_NOT_AUTHORISED',
					error: 'You are not authorised to view or join this room.'
				},
				403
			);
		}

		const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
		return radioJson({
			ok: true,
			room,
			rooms
		});
	} finally {
		lease.release();
	}
};
