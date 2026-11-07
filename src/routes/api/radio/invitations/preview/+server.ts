import type { RequestHandler } from '@sveltejs/kit';
import { PreviewInvitationSchema } from '$lib/radio/types';
import { previewInvitation } from '$lib/server/radio/store';
import {
	radioJson,
	radioWriteAdmission,
	readRadioJson,
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
		const bodyResult = await readRadioJson(event.request);
		if (bodyResult.errorResponse) return bodyResult.errorResponse;

		const parsed = PreviewInvitationSchema.safeParse(bodyResult.data);
		if (!parsed.success) {
			return radioJson({ ok: false, error: 'Invalid invitation token format.' }, 400);
		}

		const preview = previewInvitation(parsed.data.inviteToken);
		if (preview.valid) {
			event.cookies.set('comm_link_pending_invite', parsed.data.inviteToken, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: event.url.protocol === 'https:',
				maxAge: 1800
			});
		}

		return radioJson({
			ok: true,
			preview
		});
	} finally {
		lease.release();
	}
};
