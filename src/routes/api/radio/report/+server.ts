import type { RequestHandler } from '@sveltejs/kit';
import { AbuseReportSchema } from '$lib/radio/types';
import { submitAbuseReport } from '$lib/server/radio/store';
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

		const bodyResult = await readRadioJson(event.request);
		if (bodyResult.errorResponse) return bodyResult.errorResponse;

		const parsed = AbuseReportSchema.safeParse(bodyResult.data);
		if (!parsed.success) {
			return radioJson(
				{
					ok: false,
					code: 'VALIDATION_ERROR',
					error: parsed.error.issues[0]?.message || 'Invalid abuse report payload.'
				},
				400
			);
		}

		const report = await submitAbuseReport({
			reporterUserId: auth.user.id,
			roomId: parsed.data.roomId,
			targetUserId: parsed.data.targetUserId,
			reason: parsed.data.reason,
			details: parsed.data.details
		});

		return radioJson(
			{
				ok: true,
				reportId: report.id,
				createdAt: report.createdAt
			},
			201
		);
	} finally {
		lease.release();
	}
};
