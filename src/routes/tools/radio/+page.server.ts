import type { PageServerLoad } from './$types';
import { allowLocalTestAuth } from '$lib/server/radio/auth';
import { buildRadioProviderStatus } from '$lib/server/radio/config';
import { RADIO_PRIVATE_HEADERS, resolveRadioUser } from '$lib/server/radio/http';
import { listAuthorisedRoomsForUser, previewInvitation } from '$lib/server/radio/store';

export const prerender = false;

export const load: PageServerLoad = async (event) => {
	event.setHeaders(RADIO_PRIVATE_HEADERS);

	const urlInvite = event.url.searchParams.get('invite')?.trim() || null;
	if (urlInvite && urlInvite.length >= 16 && urlInvite.length <= 128) {
		event.cookies.set('comm_link_pending_invite', urlInvite, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: event.url.protocol === 'https:',
			maxAge: 1800
		});
	}

	const inviteToken = urlInvite || event.cookies.get('comm_link_pending_invite') || null;
	const pendingInvitation = inviteToken ? previewInvitation(inviteToken) : null;
	const user = await resolveRadioUser(event);
	const provider = buildRadioProviderStatus(event.url);
	const rooms = user ? listAuthorisedRoomsForUser(user.id, user.email) : [];
	const authError = event.url.searchParams.get('authError') || null;

	return {
		user,
		provider,
		allowLocalTestAuth: allowLocalTestAuth(event.url),
		rooms,
		pendingInvitation,
		pendingInviteToken: inviteToken && pendingInvitation?.valid ? inviteToken : null,
		authError
	};
};
