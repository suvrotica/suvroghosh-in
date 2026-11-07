import type { RequestHandler } from '@sveltejs/kit';
import { clearRadioSessionCookie, readRadioSessionUser } from '$lib/server/radio/auth';
import { disconnectUserFromAllRooms } from '$lib/server/radio/store';
import { radioJson, radioWriteAdmission, requireSameOrigin } from '$lib/server/radio/http';

export const POST: RequestHandler = async (event) => {
	const originError = requireSameOrigin(event);
	if (originError) return originError;

	const lease = radioWriteAdmission.tryAcquire(event.getClientAddress());
	if (!lease.ok) {
		return radioJson({ ok: false, error: 'Too many requests.' }, 429);
	}

	try {
		const user = await readRadioSessionUser(event);
		if (user) {
			await disconnectUserFromAllRooms(user.id);
		}
		clearRadioSessionCookie(event);
		event.cookies.delete('comm_link_pending_invite', { path: '/' });
		return radioJson({ ok: true });
	} finally {
		lease.release();
	}
};
