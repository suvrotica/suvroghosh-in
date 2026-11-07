import type { RequestHandler } from '@sveltejs/kit';
import { clearRadioSessionCookie } from '$lib/server/radio/auth';
import { deleteUserAccountData } from '$lib/server/radio/store';
import { radioJson, radioWriteAdmission, requireRadioUser, requireSameOrigin } from '$lib/server/radio/http';

export const DELETE: RequestHandler = async (event) => {
	const originError = requireSameOrigin(event);
	if (originError) return originError;

	const lease = radioWriteAdmission.tryAcquire(event.getClientAddress());
	if (!lease.ok) {
		return radioJson({ ok: false, error: 'Too many requests.' }, 429);
	}

	try {
		const auth = await requireRadioUser(event);
		if (auth.errorResponse) return auth.errorResponse;

		const summary = await deleteUserAccountData(auth.user.id);
		clearRadioSessionCookie(event);
		event.cookies.delete('comm_link_pending_invite', { path: '/' });

		return radioJson({
			ok: true,
			deletedRooms: summary.deletedRooms,
			removedMemberships: summary.removedMemberships
		});
	} finally {
		lease.release();
	}
};
