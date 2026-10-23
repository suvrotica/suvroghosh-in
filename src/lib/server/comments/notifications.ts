import { env } from '$env/dynamic/private';
import { Resend } from 'resend';
import { z } from 'zod';
import { withDeadline } from '$lib/server/http/body';
import { createNotesAdminClient } from '$lib/server/notes/supabase';
import { getPublishedPost } from '$lib/server/content/posts';
import { commentsRpc } from './repository';

export const COMMENT_MODERATION_URL = 'https://www.suvroghosh.in/notes/studio/comments';
const notification = z
	.object({
		comment_id: z.string().uuid(),
		submission_id: z.string().uuid(),
		post_slug: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),
		created_at: z.string().datetime({ offset: true }),
		lease_token: z.string().uuid(),
		// Missing fields are the original RPC contract during an app-first rollout.
		content_version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
		display_name: z
			.string()
			.refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= 60)
			.nullish(),
		body: z
			.string()
			.refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= 3000)
			.nullish(),
		approve_token: z
			.string()
			.regex(/^[a-f0-9]{64}$/)
			.nullish(),
		reject_token: z
			.string()
			.regex(/^[a-f0-9]{64}$/)
			.nullish(),
		reply_token: z
			.string()
			.regex(/^[a-f0-9]{64}$/)
			.nullish(),
		action_expires_at: z.string().datetime({ offset: true }).nullish()
	})
	.superRefine((job, context) => {
		if (job.content_version >= 2 && (!job.display_name || !job.body))
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Full comment notification content is missing.'
			});
		if (
			job.content_version >= 3 &&
			(!job.approve_token ||
				!job.reject_token ||
				job.approve_token === job.reject_token ||
				!job.action_expires_at)
		)
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Email moderation actions are missing or invalid.'
			});
		if (
			job.content_version === 4 &&
			(!job.reply_token ||
				job.reply_token === job.approve_token ||
				job.reply_token === job.reject_token)
		)
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'The email reply action is missing or invalid.'
			});
	});

function escapeHtml(value: string) {
	const entities: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;'
	};
	return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function notificationContent(job: z.infer<typeof notification>, title: string) {
	const introduction = [
		'A new reader comment was submitted for approval.',
		'',
		`Article: ${title}`,
		`Submitted: ${new Date(job.created_at).toISOString()}`,
		''
	];
	const content =
		job.content_version >= 2
			? [`Commenter: ${job.display_name}`, '', 'Full comment:', job.body!, '']
			: [];
	if (job.content_version < 3)
		return {
			text: [
				...introduction,
				...content,
				'Review and approve, reject or reply in your moderation board:',
				COMMENT_MODERATION_URL,
				'',
				'The comment stays hidden until you approve it. Sign in with your existing owner account.',
				'If you have already moderated it, the board shows its current status.'
			].join('\n')
		};

	// The database fixes these private capabilities and their expiry when the job is enqueued.
	// Never reconstruct them or refresh their expiry during an uncertain provider retry.
	const approveUrl = `https://www.suvroghosh.in/api/comments/moderate?action=approve&token=${job.approve_token}`;
	const rejectUrl = `https://www.suvroghosh.in/api/comments/moderate?action=reject&token=${job.reject_token}`;
	const replyUrl = `https://www.suvroghosh.in/api/comments/moderate?action=reply&token=${job.reply_token}`;
	const expires = new Date(job.action_expires_at!).toISOString();
	const confirmation =
		job.content_version === 4
			? 'Choose Approve, Reject or Reply, then confirm on the page that opens. No admin sign-in is needed. Reply opens an author-reply form: use Approve and reply for a pending comment, or Publish reply after approving it from this email. Opening a link does not change the comment.'
			: 'Choose Approve or Reject, then confirm your choice on the page that opens. No admin sign-in is needed. Opening a link does not change the comment until you confirm.';
	const expiry =
		job.content_version === 4
			? `These private links expire 7 days after submission, at ${expires}. Reply can publish one author reply and remains available after using Approve in this email. Reject or an explicit status change in the moderation board closes Reply. Keep this email private: anyone with a link can moderate or reply to this comment.`
			: `These private links expire 7 days after submission, at ${expires}. Once the comment has been handled, neither link can be used. Keep this email private: anyone with an action link can moderate this comment.`;
	return {
		text: [
			...introduction,
			...content,
			confirmation,
			'',
			'Approve comment:',
			approveUrl,
			'',
			'Reject comment:',
			rejectUrl,
			'',
			...(job.content_version === 4 ? ['Reply to comment:', replyUrl, ''] : []),
			expiry,
			'',
			'Review the current status or reply in your moderation board:',
			COMMENT_MODERATION_URL,
			'',
			'The comment stays hidden until you approve it. The moderation board uses your existing owner sign-in.'
		].join('\n'),
		html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Comment awaiting approval</title></head>
<body style="margin:0;background:#f5f5f5;color:#202020;font-family:Arial,sans-serif;line-height:1.6">
<main style="max-width:640px;margin:24px auto;padding:24px;background:#fff;border:1px solid #ddd;border-radius:8px">
<h1 style="font-size:22px;line-height:1.3;margin:0 0 20px">A new comment is waiting for approval</h1>
<p><strong>Article:</strong> ${escapeHtml(title)}<br><strong>Submitted:</strong> ${escapeHtml(new Date(job.created_at).toISOString())}</p>
<p><strong>Commenter:</strong> ${escapeHtml(job.display_name!)}</p>
<h2 style="font-size:16px;margin:24px 0 8px">Full comment</h2>
<div style="white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px">${escapeHtml(job.body!)}</div>
<p>${confirmation}</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr>
<td style="padding-right:12px"><a href="${escapeHtml(approveUrl)}" style="display:inline-block;background:#166534;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold">Approve</a></td>
<td><a href="${escapeHtml(rejectUrl)}" style="display:inline-block;background:#991b1b;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold">Reject</a></td>${job.content_version === 4 ? `\n</tr><tr><td colspan="2" style="padding-top:12px"><a href="${escapeHtml(replyUrl)}" style="display:inline-block;background:#1e40af;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold">Reply</a></td>` : ''}
</tr></table>
<p style="font-size:14px">${expiry}</p>
<p>The comment stays hidden until you approve it.</p>
<p><a href="${COMMENT_MODERATION_URL}">Open your moderation board</a> to see its current status or reply. The board uses your existing owner sign-in.</p>
</main></body></html>`
	};
}

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
						idempotencyKey: `${job.content_version >= 2 ? `post-comment-approval-v${job.content_version}` : 'post-comment-approval'}/${job.comment_id}`,
						headers: {},
						signal
					};
					return resend.emails.send(
						{
							from: `SuvroGhosh.IN Comments <${env.CONTACT_FROM_EMAIL || 'noreply@suvroghosh.in'}>`,
							to: env.CONTACT_TO_EMAIL || 'contact@suvroghosh.in',
							subject: 'A new comment is waiting for approval | SuvroGhosh.IN',
							...notificationContent(job, title)
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
