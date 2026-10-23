import { env } from '$env/dynamic/private';
import { error, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { createNotesAdminClient } from '$lib/server/notes/supabase';
import { commentsRpc } from './repository';

export const EMAIL_ACTION_PATH = '/api/comments/moderate';
export const EMAIL_ACTION_COOKIE = 'comment-email-confirmation';
const moderationAction = z.enum(['approve', 'reject']);
export const emailAction = z.enum(['approve', 'reject', 'reply']);
export const emailToken = z.string().regex(/^[a-f0-9]{64}$/);
const grantSchema = z
	.object({ action: emailAction, token: emailToken, confirmation: z.string().uuid() })
	.strict();
export type EmailActionGrant = z.infer<typeof grantSchema>;
const unavailableState = z.enum(['invalid', 'expired', 'used', 'unavailable']);
const textWithin = (maximum: number) =>
	z.string().refine((value) => Array.from(value).length > 0 && Array.from(value).length <= maximum);
const readyPreview = z.object({
	state: z.literal('ready'),
	comment_id: z.string().uuid(),
	post_slug: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),
	display_name: textWithin(60),
	body: textWithin(3000),
	expires_at: z.string().datetime({ offset: true })
});
const previewSchema = z.union([
	readyPreview.extend({ action: moderationAction }),
	readyPreview.extend({
		action: z.literal('reply'),
		comment_status: z.enum(['pending', 'approved']),
		reply_parent_id: z.string().uuid(),
		reply_is_sibling: z.boolean()
	}),
	z.object({ state: unavailableState })
]);
const consumeSchema = z.union([
	z.object({
		state: z.literal('updated'),
		action: moderationAction,
		comment_id: z.string().uuid(),
		post_slug: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/)
	}),
	z.object({ state: unavailableState })
]);
const replySchema = z.union([
	z.object({
		state: z.literal('replied'),
		action: z.literal('reply'),
		comment_id: z.string().uuid(),
		post_slug: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/),
		reply_id: z.string().uuid(),
		reply_parent_id: z.string().uuid()
	}),
	z.object({ state: unavailableState })
]);

// Match PostgreSQL's btrim(body, E' \\t\\n\\r') and 3,000-codepoint limit.
export const emailReplyBody = z
	.string()
	.transform((value) => value.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, ''))
	.refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= 3000)
	.refine((value) =>
		Array.from(value).every((character) => {
			const code = character.charCodeAt(0);
			return code !== 127 && (code >= 32 || [9, 10, 13].includes(code));
		})
	);

export function requireEmailActionsConfigured() {
	// A copied email URL must not let a preview deployment mutate production comments.
	if (env.VERCEL_ENV !== 'production')
		throw error(503, 'Email moderation is available on the live website.');
}

export function rememberEmailAction(
	event: RequestEvent,
	action: EmailActionGrant['action'],
	token: string
) {
	const grant: EmailActionGrant = { action, token, confirmation: crypto.randomUUID() };
	event.cookies.set(EMAIL_ACTION_COOKIE, JSON.stringify(grant), {
		path: EMAIL_ACTION_PATH,
		httpOnly: true,
		secure: event.url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 15 * 60
	});
}

export function readEmailAction(event: RequestEvent): EmailActionGrant | null {
	try {
		const parsed = grantSchema.safeParse(
			JSON.parse(event.cookies.get(EMAIL_ACTION_COOKIE) || 'null')
		);
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export function clearEmailAction(event: RequestEvent) {
	event.cookies.delete(EMAIL_ACTION_COOKIE, { path: EMAIL_ACTION_PATH });
}

async function tokenHash(token: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function actionRpc(
	grant: EmailActionGrant,
	name: string,
	parameters: Record<string, unknown> = { p_action: grant.action }
) {
	requireEmailActionsConfigured();
	const client = createNotesAdminClient();
	if (!client) throw error(503, 'Email moderation is temporarily unavailable.');
	return commentsRpc<unknown>(client, name, {
		p_token_hash: await tokenHash(grant.token),
		...parameters
	});
}

export async function previewEmailAction(grant: EmailActionGrant) {
	const result = previewSchema.parse(await actionRpc(grant, 'preview_post_comment_email_action'));
	if (result.state === 'ready' && result.action !== grant.action)
		throw error(503, 'Email moderation is temporarily unavailable.');
	return result;
}

export async function consumeEmailAction(grant: EmailActionGrant) {
	if (grant.action === 'reply') throw error(400, 'Use the reply form.');
	const result = consumeSchema.parse(await actionRpc(grant, 'consume_post_comment_email_action'));
	if (result.state === 'updated' && result.action !== grant.action)
		throw error(503, 'Email moderation is temporarily unavailable.');
	return result;
}

export async function publishEmailReply(grant: EmailActionGrant, body: string) {
	if (grant.action !== 'reply') throw error(400, 'Use the reply link.');
	return replySchema.parse(
		await actionRpc(grant, 'reply_post_comment_email_action', { p_body: body })
	);
}
