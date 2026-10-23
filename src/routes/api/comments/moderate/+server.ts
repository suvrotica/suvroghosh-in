import { error, isHttpError, type RequestHandler } from '@sveltejs/kit';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { getPublishedPost } from '$lib/server/content/posts';
import { postPath } from '$lib/content/posts';
import { commentAddress, requireCommentOrigin } from '$lib/server/comments/http';
import {
	EMAIL_ACTION_PATH,
	clearEmailAction,
	consumeEmailAction,
	emailAction,
	emailReplyBody,
	emailToken,
	previewEmailAction,
	publishEmailReply,
	readEmailAction,
	rememberEmailAction,
	requireEmailActionsConfigured,
	type EmailActionGrant
} from '$lib/server/comments/email-actions';

export const prerender = false;
const board = 'https://www.suvroghosh.in/notes/studio/comments';
const admit = createLocalAdmission({
	attempts: 30,
	globalAttempts: 300,
	windowMs: 60_000,
	concurrency: 10,
	perKeyConcurrency: 2,
	maxKeys: 2048
});

const htmlEntities: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => htmlEntities[character]);

function headers(url: URL) {
	return {
		'cache-control': 'private, no-cache, no-store, must-revalidate, max-age=0',
		pragma: 'no-cache',
		expires: '0',
		'x-robots-tag': 'noindex, nofollow, noarchive',
		'x-content-type-options': 'nosniff',
		'referrer-policy': url.search ? 'no-referrer' : 'same-origin'
	};
}

function page(url: URL, title: string, content: string, status = 200, extra = {}) {
	const nonce = crypto.randomUUID();
	return new Response(
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${escape(title)} | SuvroGhosh.IN</title><style nonce="${nonce}">
		:root{color-scheme:light dark;font:17px/1.65 system-ui,sans-serif;background:#f6f4ee;color:#21271f}body{margin:0;padding:clamp(20px,5vw,64px)}main{max-width:680px;margin:0 auto;background:#fffdf8;border:1px solid #d6d8cd;border-radius:16px;padding:clamp(24px,5vw,48px)}.eyebrow{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:#58634f}h1{font-family:Georgia,serif;font-size:clamp(2rem,6vw,3rem);line-height:1.15;margin:16px 0 24px}h2{font-size:1rem;margin:24px 0 4px}.comment{white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #a5b39d;padding:8px 0 8px 20px}.meta{color:#58634f;font-size:.88rem}.actions{display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-top:28px}button{font:inherit;font-weight:600;padding:12px 24px;border:1px solid #284a3c;background:#284a3c;color:#fff;border-radius:8px;cursor:pointer}a{color:#284a3c;text-underline-offset:4px}.reject{background:#7e392c;border-color:#7e392c}label{display:block;font-weight:600;margin-top:24px}textarea{box-sizing:border-box;display:block;width:100%;font:inherit;line-height:1.5;padding:12px;margin-top:8px;border:1px solid #81927c;border-radius:8px;resize:vertical;background:#fffdf8;color:inherit}textarea:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #718a61;outline-offset:3px}.notice{padding:12px 16px;border:1px solid #a46b47;border-radius:8px}@media(prefers-color-scheme:dark){:root{background:#171c18;color:#e8ebe3}main,textarea{background:#202720;border-color:#53604f}.meta,.eyebrow{color:#bec9b6}a{color:#bad4c0}}
		</style></head><body><main><p class="eyebrow">SuvroGhosh.IN · Private comment moderation</p><h1>${escape(title)}</h1>${content}</main></body></html>`,
		{
			status,
			headers: {
				...headers(url),
				'content-type': 'text/html; charset=utf-8',
				'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
				...extra
			}
		}
	);
}

function unavailable(url: URL, state: string) {
	const message =
		state === 'used'
			? 'This email action has already been used. It cannot make another change.'
			: state === 'expired'
				? 'This email link has expired. You can still moderate the comment in your board.'
				: 'This link is unavailable or the comment has already been moderated. Open the original email again, or use your moderation board.';
	return page(
		url,
		'This link is no longer available',
		`<p>${message}</p><p><a href="${board}">Open moderation board</a></p>`,
		410
	);
}

type ReplyPreview = Extract<Awaited<ReturnType<typeof previewEmailAction>>, { action: 'reply' }>;

function replyPage(
	url: URL,
	grant: EmailActionGrant,
	draft = '',
	preview?: ReplyPreview,
	notice = '',
	status = 200
) {
	const pending = !preview || preview.comment_status === 'pending';
	const title = preview
		? getPublishedPost(preview.post_slug)?.title || 'A comment on SuvroGhosh.IN'
		: '';
	return page(
		url,
		'Write your reply',
		`${notice ? `<p class="notice" role="alert">${escape(notice)}</p>` : ''}<p>Your response will appear as <strong>Suvro Ghosh</strong>, with the author badge. You do not need to sign in.</p>${preview ? `<h2>${escape(title)}</h2><p class="meta">Comment by ${escape(preview.display_name)}</p><p class="comment">${escape(preview.body)}</p>${preview.reply_is_sibling ? '<p class="meta">This comment is already a reply. Your response will appear alongside it in the same thread, under the original comment.</p>' : ''}` : ''}<form method="post" action="${EMAIL_ACTION_PATH}"><input type="hidden" name="action" value="reply"><input type="hidden" name="confirmation" value="${grant.confirmation}"><label for="reply-body">Your reply</label><textarea id="reply-body" name="body" rows="8" required aria-describedby="reply-guidance">${escape(draft)}</textarea><p class="meta" id="reply-guidance">Use plain text, up to 3,000 characters. ${pending ? 'Publishing your reply also approves this comment if it is still waiting for approval.' : 'This comment is already approved.'} The original thread must remain approved.</p><div class="actions"><button type="submit">${pending ? 'Approve and reply' : 'Publish reply'}</button><a href="${board}">Use moderation board</a></div></form><p class="meta">${preview ? `This private reply link expires ${escape(new Date(preview.expires_at).toISOString())}. ` : ''}One reply can be published from this email. You can close this page without publishing. Keep a copy of a draft you want to save; this form does not store drafts.</p>`,
		status
	);
}

function failure(url: URL, cause: unknown) {
	const status = isHttpError(cause)
		? cause.status
		: cause instanceof BodyReadError
			? cause.kind === 'too-large'
				? 413
				: 408
			: 503;
	const message =
		status === 403
			? 'Open the action from your original email and confirm on this website.'
			: status === 400 || status === 409 || status === 415
				? 'That confirmation did not match this page. Reopen the action from your original email.'
				: status === 413
					? 'The confirmation request was too large.'
					: 'The request could not be confirmed. You can retry this page or use your moderation board to check the current status.';
	return page(
		url,
		'Please try again',
		`<p>${message}</p><p><a href="${board}">Open moderation board</a></p>`,
		status
	);
}

const guarded =
	(handler: RequestHandler): RequestHandler =>
	async (event) => {
		let release: (() => void) | undefined;
		try {
			requireEmailActionsConfigured();
			const admission = admit(commentAddress(event));
			if (!admission.allowed)
				return page(
					event.url,
					'Please wait a moment',
					'<p>Too many requests. Try again shortly.</p>',
					429,
					{
						'retry-after': String(admission.retryAfterSeconds)
					}
				);
			release = admission.release;
			return await handler(event);
		} catch (cause) {
			// Never log or echo capability values, cookies, request URLs or reader prose.
			return failure(event.url, cause);
		} finally {
			release?.();
		}
	};

export const HEAD: RequestHandler = guarded(
	async (event) => new Response(null, { headers: headers(event.url) })
);

export const GET: RequestHandler = guarded(async (event) => {
	if (event.url.search) {
		const entries = [...event.url.searchParams];
		const action = emailAction.safeParse(event.url.searchParams.get('action'));
		const token = emailToken.safeParse(event.url.searchParams.get('token'));
		clearEmailAction(event);
		if (entries.length === 2 && action.success && token.success)
			rememberEmailAction(event, action.data, token.data);
		return new Response(null, {
			status: 303,
			headers: { ...headers(event.url), location: EMAIL_ACTION_PATH }
		});
	}
	const grant = readEmailAction(event);
	if (!grant) return unavailable(event.url, 'invalid');
	const preview = await previewEmailAction(grant);
	if (preview.state !== 'ready') {
		clearEmailAction(event);
		return unavailable(event.url, preview.state);
	}
	if (preview.action === 'reply') return replyPage(event.url, grant, '', preview);
	const verb = grant.action === 'approve' ? 'Approve' : 'Reject';
	const title = getPublishedPost(preview.post_slug)?.title || 'A comment on SuvroGhosh.IN';
	return page(
		event.url,
		`${verb} this comment?`,
		`<p>Confirm your choice below. You do not need to sign in.</p><h2>${escape(title)}</h2><p class="meta">Comment by ${escape(preview.display_name)}</p><p class="comment">${escape(preview.body)}</p><p class="meta">${grant.action === 'approve' ? 'Approving allows this comment to appear when its article and parent thread are visible.' : 'Rejecting keeps this comment off the public page.'} This choice applies only to this comment.</p><form method="post" action="${EMAIL_ACTION_PATH}"><input type="hidden" name="action" value="${grant.action}"><input type="hidden" name="confirmation" value="${grant.confirmation}"><div class="actions"><button class="${grant.action === 'reject' ? 'reject' : 'approve'}" type="submit">${verb} comment</button><a href="${board}">Use moderation board</a></div></form><p class="meta">Email action links expire ${escape(new Date(preview.expires_at).toISOString())}. You can close this page without changing the comment.</p>`
	);
});

export const POST: RequestHandler = guarded(async (event) => {
	requireCommentOrigin(event);
	if (event.url.search) throw error(400, 'Use the clean confirmation page.');
	if (
		event.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
		'application/x-www-form-urlencoded'
	)
		throw error(415, 'Use the confirmation form.');
	const grant = readEmailAction(event);
	// 3,000 four-byte codepoints need up to 36,000 bytes after native form encoding.
	const limit = grant?.action === 'reply' ? 40 * 1024 : 1024;
	const bytes = await readBoundedBody(event.request, limit, 3000, event.request.signal);
	let form: URLSearchParams;
	try {
		const encoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		decodeURIComponent(encoded); // Reject malformed percent-encoded UTF-8 as well.
		form = new URLSearchParams(encoded);
	} catch {
		throw error(400, 'Invalid confirmation.');
	}
	const entries = [...form];
	if (!grant) return unavailable(event.url, 'invalid');
	if (
		entries.length !== (grant.action === 'reply' ? 3 : 2) ||
		form.get('action') !== grant.action ||
		form.get('confirmation') !== grant.confirmation ||
		(grant.action === 'reply' && !form.has('body'))
	)
		throw error(409, 'Reopen this email action.');
	if (grant.action === 'reply') {
		const draft = form.get('body')!;
		const body = emailReplyBody.safeParse(draft);
		if (!body.success)
			return replyPage(
				event.url,
				grant,
				draft,
				undefined,
				'Enter a reply of 1–3,000 characters. Use plain text without control characters.',
				400
			);
		try {
			const result = await publishEmailReply(grant, body.data);
			if (result.state !== 'replied') {
				clearEmailAction(event);
				return page(
					event.url,
					'This reply link is no longer available',
					'<p>The link has expired, was already used, or the comment or its thread has been moderated. Nothing new was published by this request. Copy your draft below before leaving.</p><label for="saved-reply">Your draft</label><textarea id="saved-reply" rows="8" readonly>' +
						escape(draft) +
						`</textarea><p><a href="${board}">Open moderation board</a></p>`,
					410
				);
			}
			clearEmailAction(event);
			const post = getPublishedPost(result.post_slug);
			const article = post && typeof post.category === 'string' ? postPath(post) : null;
			return page(
				event.url,
				'Reply published',
				`<p>Your reply is published as <strong>Suvro Ghosh</strong>. The reader's comment is approved. Both remain visible while the original thread is approved.</p><p class="comment">${escape(body.data)}</p><p>This email cannot publish another reply. You can close this page.</p>${article ? `<p><a href="${escape(article)}">View article</a></p>` : ''}<p><a href="${board}">Open moderation board</a></p>`
			);
		} catch (cause) {
			// Keep the draft and grant after an uncertain RPC result. The stored per-token
			// submission identity makes an identical retry safe without publishing twice.
			const status = isHttpError(cause) ? cause.status : cause instanceof BodyReadError ? 408 : 503;
			return replyPage(
				event.url,
				grant,
				draft,
				undefined,
				status === 409
					? 'This email has already published a different reply. Copy this draft and check the moderation board.'
					: 'We could not confirm publication. Your draft is below. Retry the same reply to check or finish publishing it safely, or copy it before leaving.',
				status
			);
		}
	}
	const result = await consumeEmailAction(grant);
	clearEmailAction(event);
	if (result.state !== 'updated') return unavailable(event.url, result.state);
	const approved = result.action === 'approve';
	return page(
		event.url,
		approved ? 'Comment approved' : 'Comment rejected',
		`<p>${approved ? 'The comment is approved. It can appear when its article and parent thread are visible.' : 'The comment has been rejected and stays off the public page.'}</p><p>The Approve and Reject links in this email are now finished. ${approved ? 'If your email includes a Reply button, you can still use it until it expires or the comment is moderated again. ' : ''}You can close this page.</p><p><a href="${board}">Open moderation board</a></p>`
	);
});
