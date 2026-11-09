import type { RequestHandler } from '@sveltejs/kit';
import { allowLocalTestAuth } from '$lib/server/radio/auth';
import { buildRadioProviderStatus } from '$lib/server/radio/config';
import { listAuthorisedRoomsForUser, previewInvitation } from '$lib/server/radio/store';
import { radioApiAdmission, radioJson, resolveRadioUser } from '$lib/server/radio/http';

export const GET: RequestHandler = async (event) => {
	const lease = radioApiAdmission.tryAcquire(event.getClientAddress());
	if (!lease.ok) {
		return radioJson({ ok: false, error: 'Too many requests.' }, 429);
	}

	try {
		const user = await resolveRadioUser(event);
		const provider = buildRadioProviderStatus(event.url);
		const inviteParam =
			event.url.searchParams.get('invite') || event.cookies.get('comm_link_pending_invite') || null;

		const pendingInvitation = user && inviteParam ? previewInvitation(inviteParam) : null;
		const rooms = user ? listAuthorisedRoomsForUser(user.id, user.email) : [];

		return radioJson({
			ok: true,
			user,
			provider,
			allowLocalTestAuth: allowLocalTestAuth(event.url),
			rooms,
			pendingInvitation,
			pendingInviteToken: inviteParam && pendingInvitation?.valid ? inviteParam : null
		});
	} finally {
		lease.release();
	}
};
