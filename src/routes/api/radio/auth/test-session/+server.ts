import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { allowLocalTestAuth, setRadioSessionCookie } from '$lib/server/radio/auth';
import { upsertRadioAccount } from '$lib/server/radio/store';
import { radioJson, radioWriteAdmission, readRadioJson, requireSameOrigin } from '$lib/server/radio/http';
import type { RadioUser } from '$lib/radio/types';

const TestSessionSchema = z
	.object({
		sub: z.string().trim().min(3).max(96),
		email: z.string().trim().email().max(254),
		displayName: z.string().trim().min(1).max(60)
	})
	.strict();

export const POST: RequestHandler = async (event) => {
	const originError = requireSameOrigin(event);
	if (originError) return originError;

	if (!allowLocalTestAuth(event.url)) {
		return radioJson(
			{
				ok: false,
				code: 'FORBIDDEN',
				error: 'Local test authentication is disabled outside loopback development.'
			},
			403
		);
	}

	const lease = radioWriteAdmission.tryAcquire(event.getClientAddress());
	if (!lease.ok) {
		return radioJson({ ok: false, error: 'Too many requests.' }, 429);
	}

	try {
		const bodyResult = await readRadioJson(event.request);
		if (bodyResult.errorResponse) return bodyResult.errorResponse;

		const parsed = TestSessionSchema.safeParse(bodyResult.data);
		if (!parsed.success) {
			return radioJson({ ok: false, error: 'Invalid test session payload.' }, 400);
		}

		const subClean = parsed.data.sub.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
		const user: RadioUser = {
			id: `usr_${subClean}`,
			googleSub: subClean,
			email: parsed.data.email.toLowerCase(),
			displayName: parsed.data.displayName,
			avatarUrl: null,
			authenticatedAt: new Date().toISOString()
		};

		await upsertRadioAccount(user);
		await setRadioSessionCookie(event, user);

		return radioJson({
			ok: true,
			user
		});
	} finally {
		lease.release();
	}
};
