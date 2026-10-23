import { timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { commentFailure, commentHeaders } from '$lib/server/comments/http';
import {
	commentEmailConfigured,
	dispatchCommentNotifications
} from '$lib/server/comments/notifications';

export const config = { maxDuration: 60 };
const admit = createLocalAdmission({
	attempts: 2,
	globalAttempts: 2,
	windowMs: 60_000,
	concurrency: 1,
	maxKeys: 1
});

export const POST: RequestHandler = async (event) => {
	try {
		const secret = env.COMMENTS_NOTIFICATION_SECRET;
		if (!secret || secret.length < 32 || !commentEmailConfigured())
			throw error(503, 'Comment email delivery is not configured.');
		const expected = Buffer.from(`Bearer ${secret}`);
		const received = Buffer.from(event.request.headers.get('authorization') || '');
		if (received.length !== expected.length || !timingSafeEqual(received, expected))
			throw error(401, 'Worker authorization is required.');
		// This is a server-to-server worker; cookies and owner sessions cannot authorize it.
		const origin = event.request.headers.get('origin');
		const site = event.request.headers.get('sec-fetch-site');
		if (
			(origin && origin !== event.url.origin) ||
			(site && site !== 'same-origin' && site !== 'none')
		)
			throw error(403, 'Cross-site worker requests are not allowed.');
		if (event.url.search) throw error(400, 'Worker parameters are not supported.');
		if (
			event.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
			'application/json'
		)
			throw error(415, 'Send JSON.');
		const bytes = await readBoundedBody(event.request, 1024, 3000, event.request.signal);
		let payload: unknown;
		try {
			payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
		} catch {
			throw error(400, 'Send an empty JSON object.');
		}
		z.object({}).strict().parse(payload);
		const admission = admit('worker');
		if (!admission.allowed)
			return json(
				{ message: 'The delivery worker is busy. Try again later.' },
				{
					status: 429,
					headers: { ...commentHeaders, 'retry-after': String(admission.retryAfterSeconds) }
				}
			);
		try {
			const report = await dispatchCommentNotifications();
			return json(report, { status: report.failed ? 503 : 200, headers: commentHeaders });
		} finally {
			admission.release();
		}
	} catch (cause) {
		if (cause instanceof BodyReadError)
			return json(
				{ message: 'The worker request could not be read.' },
				{
					status: cause.kind === 'too-large' ? 413 : 408,
					headers: commentHeaders
				}
			);
		if (cause instanceof z.ZodError)
			return json(
				{ message: 'Send an empty JSON object.' },
				{ status: 400, headers: commentHeaders }
			);
		return commentFailure(cause);
	}
};
