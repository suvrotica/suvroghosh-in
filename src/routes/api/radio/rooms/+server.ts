import type { RequestHandler } from '@sveltejs/kit';
import { CreateRoomSchema } from '$lib/radio/types';
import { createRadioRoom, listAuthorisedRoomsForUser } from '$lib/server/radio/store';
import {
	radioApiAdmission,
	radioJson,
	radioWriteAdmission,
	readRadioJson,
	requireRadioUser,
	requireSameOrigin
} from '$lib/server/radio/http';

export const GET: RequestHandler = async (event) => {
	const lease = radioApiAdmission.tryAcquire(event.getClientAddress());
	if (!lease.ok) {
		return radioJson({ ok: false, error: 'Too many requests.' }, 429);
	}

	try {
		const auth = await requireRadioUser(event);
		if (auth.errorResponse) return auth.errorResponse;

		const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);
		return radioJson({ ok: true, rooms });
	} finally {
		lease.release();
	}
};

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

		const bodyResult = await readRadioJson(event.request);
		if (bodyResult.errorResponse) return bodyResult.errorResponse;

		const parsed = CreateRoomSchema.safeParse(bodyResult.data);
		if (!parsed.success) {
			return radioJson(
				{
					ok: false,
					code: 'VALIDATION_ERROR',
					error: parsed.error.issues[0]?.message || 'Invalid room creation payload.'
				},
				400
			);
		}

		const created = await createRadioRoom({
			host: auth.user,
			name: parsed.data.name,
			mode: parsed.data.mode,
			accessPolicy: parsed.data.accessPolicy,
			maxParticipants: parsed.data.maxParticipants,
			explicitMemberEmails: parsed.data.explicitMemberEmails,
			invitationExpiryHours: parsed.data.invitationExpiryHours
		});

		const rooms = listAuthorisedRoomsForUser(auth.user.id, auth.user.email);

		return radioJson(
			{
				ok: true,
				room: created.room,
				inviteToken: created.inviteToken,
				rooms
			},
			201
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to create room.';
		return radioJson({ ok: false, error: message }, 400);
	} finally {
		lease.release();
	}
};
