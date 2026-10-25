import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicModeEnabled, publicRepository } from '$lib/server/enquiry-demo/public-runtime';
import { publicWorkerPass } from '$lib/server/enquiry-demo/public-worker';
import { readBoundedBody, withDeadline } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';

export const config = { maxDuration: 60 };
const headers = {
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex, nofollow, noarchive'
};
const answer = (body: unknown, status = 200) => json(body, { status, headers });
const digest = (value: string) => createHash('sha256').update(value).digest();
const admission = createLocalAdmission({
	attempts: 2,
	globalAttempts: 3,
	windowMs: 60_000,
	concurrency: 1,
	maxKeys: 4
});

export const POST: RequestHandler = async (event) => {
	const secret = process.env.ENQUIRY_DEMO_WORKER_SECRET || '';
	const provided = event.request.headers.get('authorization') || '';
	if (
		secret.length < 32 ||
		provided.length > 300 ||
		!timingSafeEqual(digest(provided), digest(`Bearer ${secret}`))
	)
		return answer({ message: 'Worker access denied.' }, 401);
	if (!publicModeEnabled(event.url))
		return answer({ message: 'The hosted demonstration is disabled.' }, 404);
	const ticket = admission('worker');
	if (!ticket.allowed)
		return answer({ message: 'A worker pass is already running. Please try later.' }, 429);
	try {
		const bytes = await readBoundedBody(event.request, 1024, 5_000, event.request.signal);
		if (bytes.length) {
			if (event.request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
				return answer({ message: 'Use an empty JSON object for a worker pass.' }, 415);
			try {
				const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
				if (
					!value ||
					typeof value !== 'object' ||
					Array.isArray(value) ||
					Object.keys(value).length
				)
					return answer({ message: 'Use an empty JSON object for a worker pass.' }, 400);
			} catch {
				return answer({ message: 'Use an empty JSON object for a worker pass.' }, 400);
			}
		}
		return await withDeadline(async (deadlineSignal) => {
			const signal = AbortSignal.any([deadlineSignal, event.request.signal]);
			const repository = publicRepository(signal);
			const expired = await repository.removeExpired();
			const due = await repository.due(10);
			let processed = 0,
				reminders = 0,
				recovered = 0;
			const began = Date.now();
			for (const workspace of due) {
				if (Date.now() - began > 25_000) break;
				// Re-load under each revision check; a stale due listing never grants authority.
				try {
					const result = await publicWorkerPass(workspace.sessionHash, false, signal);
					processed += result.processed;
					reminders += result.reminders;
					recovered += result.recovered;
				} catch {
					/* A competing worker, expired workspace or retryable storage error stays recoverable. */
				}
			}
			return answer({ processed, reminders, recovered, expired });
		}, 45_000);
	} catch {
		return answer(
			{
				message: 'The worker could not finish this pass. Saved jobs remain available for recovery.'
			},
			503
		);
	} finally {
		ticket.release();
	}
};
