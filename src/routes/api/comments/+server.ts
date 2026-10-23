import { error, json, type RequestHandler } from '@sveltejs/kit';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import {
	commentAddress,
	commentFailure,
	commentHeaders,
	readCommentJson,
	requireCommentOrigin
} from '$lib/server/comments/http';
import {
	commentRateKey,
	listPublicComments,
	submitGuestComment
} from '$lib/server/comments/repository';
import { commentId, guestSubmission, parsePage, parsePost } from '$lib/server/comments/validation';

const admit = createLocalAdmission({
	attempts: 60,
	globalAttempts: 600,
	windowMs: 60_000,
	concurrency: 20,
	maxKeys: 2048,
	perKeyConcurrency: 4
});

export const GET: RequestHandler = async (event) => {
	try {
		const slug = parsePost(event.url.searchParams.get('post'));
		const page = parsePage(event.url.searchParams.get('page'));
		const parent = event.url.searchParams.get('parent');
		if (parent && !commentId.safeParse(parent).success) throw error(400, 'Choose a valid thread.');
		const admission = admit(commentAddress(event));
		if (!admission.allowed)
			return json(
				{ message: 'Please wait before loading more comments.' },
				{
					status: 429,
					headers: { ...commentHeaders, 'retry-after': String(admission.retryAfterSeconds) }
				}
			);
		try {
			return json(await listPublicComments(slug, parent || null, page), {
				headers: commentHeaders
			});
		} finally {
			admission.release();
		}
	} catch (cause) {
		return commentFailure(cause);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		requireCommentOrigin(event);
		const admission = admit(commentAddress(event));
		if (!admission.allowed)
			return json(
				{ message: 'Please wait before submitting another comment.' },
				{
					status: 429,
					headers: { ...commentHeaders, 'retry-after': String(admission.retryAfterSeconds) }
				}
			);
		try {
			const parsed = guestSubmission.safeParse(await readCommentJson(event));
			if (!parsed.success)
				throw error(
					400,
					'Enter a name (up to 60 characters) and comment (up to 3,000 characters).'
				);
			if (parsed.data.website) throw error(400, 'The comment could not be submitted.');
			const result = await submitGuestComment(parsed.data, await commentRateKey(event));
			if (result === 'rate_limited')
				return json(
					{ message: 'Too many comments. Please try again in ten minutes.' },
					{ status: 429, headers: { ...commentHeaders, 'retry-after': '600' } }
				);
			if (result === 'invalid_parent') throw error(409, 'This thread is no longer available.');
			if (result !== 'pending') throw error(503, 'The comment could not be saved.');
			return json(
				{ status: 'pending', message: 'Your comment has been received and is awaiting approval.' },
				{ status: 202, headers: commentHeaders }
			);
		} finally {
			admission.release();
		}
	} catch (cause) {
		return commentFailure(cause);
	}
};
