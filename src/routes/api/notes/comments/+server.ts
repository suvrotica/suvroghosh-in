import { error, json, type RequestHandler } from '@sveltejs/kit';
import { COMMENT_STATUSES, type CommentStatus } from '$lib/comments/types';
import { requireNotesOwner } from '$lib/server/notes/auth';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import {
	commentFailure,
	commentHeaders,
	readCommentJson,
	requireCommentOrigin
} from '$lib/server/comments/http';
import {
	moderateComment,
	moderationCounts,
	moderationQueue,
	replyToComment
} from '$lib/server/comments/repository';
import { ownerMutation, parsePage, parsePost } from '$lib/server/comments/validation';

const admit = createLocalAdmission({
	attempts: 90,
	globalAttempts: 120,
	windowMs: 60_000,
	concurrency: 4,
	maxKeys: 8,
	perKeyConcurrency: 4
});

export const GET: RequestHandler = async (event) => {
	try {
		const owner = await requireNotesOwner(event);
		const admission = admit(owner.id);
		if (!admission.allowed) throw error(429, 'Please wait before refreshing comments.');
		try {
			if (event.url.searchParams.get('session') === '1')
				return json({ isOwner: true }, { headers: commentHeaders });
			if (event.url.searchParams.get('counts') === '1')
				return json(await moderationCounts(event), { headers: commentHeaders });
			const status = event.url.searchParams.get('status') ?? 'pending';
			if (status !== 'all' && !COMMENT_STATUSES.includes(status as CommentStatus))
				throw error(400, 'Choose a valid moderation status.');
			const post = event.url.searchParams.get('post');
			const queue = await moderationQueue(
				event,
				status as CommentStatus | 'all',
				post ? parsePost(post) : null,
				parsePage(event.url.searchParams.get('page'))
			);
			return json(queue, {
				headers: {
					...commentHeaders,
					...(event.url.searchParams.get('export') === '1'
						? { 'content-disposition': `attachment; filename="comments-page-${queue.page}.json"` }
						: {})
				}
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
		const owner = await requireNotesOwner(event);
		const admission = admit(owner.id);
		if (!admission.allowed) throw error(429, 'Please wait before managing more comments.');
		try {
			const input = ownerMutation.safeParse(await readCommentJson(event));
			if (!input.success) throw error(400, 'Choose a valid comment action.');
			if (input.data.action === 'reply') {
				const result = await replyToComment(
					event,
					input.data.parentId,
					input.data.body,
					input.data.submissionId
				);
				if (result === 'invalid_parent')
					throw error(409, 'Approve the parent comment before replying.');
				if (result !== 'approved') throw error(503, 'The reply could not be saved.');
				return json({ message: 'Your author reply is published.' }, { headers: commentHeaders });
			}
			const result = await moderateComment(
				event,
				input.data.id,
				input.data.action === 'moderate' ? input.data.status : null
			);
			if (result === 'not_found') throw error(404, 'Comment not found.');
			if (result !== 'updated') throw error(503, 'The comment could not be updated.');
			return json(
				{
					message:
						input.data.action === 'read' ? 'Comment marked as read.' : 'Comment moderation updated.'
				},
				{ headers: commentHeaders }
			);
		} finally {
			admission.release();
		}
	} catch (cause) {
		return commentFailure(cause);
	}
};
