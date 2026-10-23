import { env } from '$env/dynamic/private';
import { Resend } from 'resend';
import { z } from 'zod';
import { withDeadline } from '$lib/server/http/body';
import { createNotesAdminClient } from '$lib/server/notes/supabase';
import { getPublishedPost } from '$lib/server/content/posts';
import { commentsRpc } from './repository';

export const COMMENT_MODERATION_URL = 'https://www.suvroghosh.in/notes/studio/comments';
const notification = z.object({
	comment_id: z.string().uuid(),
	submission_id: z.string().uuid(),
	post_slug: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),
	created_at: z.string().datetime({ offset: true }),
	lease_token: z.string().uuid()
});

export function commentEmailConfigured() {
	// Preview deployments share no permission to deliver production notifications.
	return env.VERCEL_ENV === 'production' && Boolean(env.RESEND_API_KEY);
}

/** Jobs are inserted in the comment transaction, never reconstructed from browser input. */
export async function dispatchCommentNotifications(submissionId: string | null = null) {
	const report = { enabled: commentEmailConfigured(), attempted: 0, sent: 0, failed: 0 };
	if (!report.enabled) return report;
	try {
		const client = createNotesAdminClient();
		if (!client) throw new Error('Notification storage is not configured.');
		const jobs = z
			.array(notification)
			.max(5)
			.parse(
				await commentsRpc(client, 'claim_post_comment_notifications', {
					p_submission_id: submissionId,
					p_limit: submissionId ? 1 : 5
				})
			);
		const resend = new Resend(env.RESEND_API_KEY);
		for (const job of jobs) {
			report.attempted += 1;
			let providerId: string | null = null;
			try {
				const title = (getPublishedPost(job.post_slug)?.title || 'An article on SuvroGhosh.IN')
					.replace(/[\r\n]/g, ' ')
					.slice(0, 240);
				const delivered = await withDeadline((signal) => {
					const options = {
						idempotencyKey: `post-comment-approval/${job.comment_id}`,
						headers: {},
						signal
					};
					return resend.emails.send(
						{
							from: `SuvroGhosh.IN Comments <${env.CONTACT_FROM_EMAIL || 'noreply@suvroghosh.in'}>`,
							to: env.CONTACT_TO_EMAIL || 'contact@suvroghosh.in',
							subject: 'A new comment is waiting for approval | SuvroGhosh.IN',
							text: [
								'A new reader comment was submitted for approval.',
								'',
								`Article: ${title}`,
								`Submitted: ${new Date(job.created_at).toISOString()}`,
								'',
								'Review and approve, reject or reply in your moderation board:',
								COMMENT_MODERATION_URL,
								'',
								'The comment stays hidden until you approve it. Sign in with your existing owner account.',
								'If you have already moderated it, the board shows its current status.'
							].join('\n')
						},
						options
					);
				}, 5000);
				if (delivered.error || !delivered.data?.id) throw new Error('Email was not accepted.');
				providerId = delivered.data.id;
			} catch {
				// No comment prose, addresses, credentials or provider response text in logs.
				console.error('Comment approval email delivery failed; its durable job will retry.');
			}
			try {
				const saved = await commentsRpc<boolean>(client, 'finish_post_comment_notification', {
					p_comment_id: job.comment_id,
					p_lease_token: job.lease_token,
					p_sent: providerId !== null,
					p_provider_id: providerId
				});
				if (saved && providerId) report.sent += 1;
				else report.failed += 1;
			} catch {
				report.failed += 1;
				console.error('Comment email acknowledgement failed; its lease will expire for retry.');
			}
		}
	} catch {
		report.failed += 1;
		console.error(
			'Comment email queue is unavailable; saved comments remain in the approval queue.'
		);
	}
	return report;
}
