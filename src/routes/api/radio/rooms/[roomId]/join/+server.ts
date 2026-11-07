import type { RequestHandler } from '@sveltejs/kit';
import { JoinRoomSchema } from '$lib/radio/types';
import {
	acknowledgeUnmuteRequest,
	connectParticipant,
	heartbeatParticipant,
	leaveRoom,
	listAuthorisedRoomsForUser,
	requestRoomJoin,
	setParticipantMute
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

		const parsed = JoinRoomSchema.safeParse(bodyResult.data);
		if (!parsed.success) {
			return radioJson(
				{
					ok: false,
					code: 'VALIDATION_ERROR',
					error: parsed.error.issues[0]?.message || 'Invalid room join action.'
				},
				400
			);
		}

		const payload = parsed.data;

		if (payload.action === 'request_join') {
			const res = await requestRoomJoin({
				roomId,
				user: auth.user,
				inviteToken: payload.inviteToken ?? null,
				joinAsListener: payload.joinAsListener
			});
			if (res.ok && payload.inviteToken) {
				event.cookies.delete('comm_link_pending_invite', { path: '/' });
			}
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson({ ...res, rooms }, res.ok ? 200 : 403);
		}

		if (payload.action === 'connect') {
			const res = await connectParticipant({
				roomId,
				user: auth.user,
				joinAsListener: payload.joinAsListener
			});
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson({ ...res, rooms }, res.ok ? 200 : 403);
		}

		if (payload.action === 'leave') {
			const res = await leaveRoom(roomId, auth.user.id);
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson({ ...res, rooms });
		}

		if (payload.action === 'heartbeat') {
			const res = heartbeatParticipant(roomId, auth.user.id, Boolean(payload.isSpeaking));
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson({ ...res, rooms }, res.ok ? 200 : 403);
		}

		if (payload.action === 'set_mute') {
			const res = await setParticipantMute(roomId, auth.user.id, payload.muted ?? true);
			const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
			return radioJson({ ...res, rooms }, res.ok ? 200 : 403);
		}

		if (payload.action === 'acknowledge_unmute_request') {
			const res = acknowledgeUnmuteRequest(roomId, auth.user.id);
			return radioJson(res, res.ok ? 200 : 403);
		}

		return radioJson({ ok: false, error: 'Unsupported action.' }, 400);
	} finally {
		lease.release();
	}
};
