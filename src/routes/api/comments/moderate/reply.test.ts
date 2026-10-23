import { createHash } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	env: { VERCEL_ENV: 'production' } as Record<string, string>,
	client: vi.fn(),
	rpc: vi.fn(),
	result: vi.fn(),
	post: vi.fn(),
	resolveUser: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$lib/server/notes/supabase', () => ({
	createNotesAdminClient: state.client,
	resolveNotesUser: state.resolveUser
}));
vi.mock('$lib/server/notes/auth', () => ({ getNotesClient: vi.fn() }));
vi.mock('$lib/server/content/posts', () => ({
	getPublishedPost: state.post,
	getPublishedPosts: vi.fn()
}));

const path = '/api/comments/moderate';
const cookieName = 'comment-email-confirmation';
const token = 'c3'.repeat(32);
const tokenHash = createHash('sha256').update(token).digest('hex');
const commentId = '10000000-0000-4000-8000-000000000001';
const rootId = '10000000-0000-4000-8000-000000000002';
const ready = {
	state: 'ready',
	action: 'reply',
	comment_id: commentId,
	post_slug: 'theFifthWindow',
	display_name: 'Reader <&"\' বাংলা 😀',
	body: 'A question <script>alert("reader")</script> & \'quoted\'\n\n  বাংলা 😀',
	expires_at: '2026-10-30T12:00:00+00:00',
	comment_status: 'pending',
	reply_parent_id: commentId,
	reply_is_sibling: false
};
const replied = {
	state: 'replied',
	action: 'reply',
	comment_id: commentId,
	post_slug: 'theFifthWindow',
	reply_id: '20000000-0000-4000-8000-000000000001',
	reply_parent_id: commentId
};

function cookieJar() {
	const values = new Map<string, string>();
	return {
		values,
		get: vi.fn((name: string) => values.get(name)),
		set: vi.fn((name: string, value: string) => values.set(name, value)),
		delete: vi.fn((name: string) => values.delete(name))
	};
}
type Jar = ReturnType<typeof cookieJar>;
type Method = 'GET' | 'HEAD' | 'POST';

function eventFor(
	method: Method,
	jar: Jar,
	body: BodyInit = '',
	query = '',
	headers: Record<string, string> = {}
): RequestEvent {
	const url = new URL(`https://www.suvroghosh.in${path}${query}`);
	const init: RequestInit & { duplex?: 'half' } = {
		method,
		headers: {
			origin: url.origin,
			'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
			...headers
		}
	};
	if (method === 'POST') {
		init.body = body;
		if (body instanceof ReadableStream) init.duplex = 'half';
	}
	return {
		url,
		request: new Request(url, init),
		cookies: jar,
		locals: {},
		getClientAddress: () => 'reply-reader-address'
	} as unknown as RequestEvent;
}

async function invoke(method: Method, event: RequestEvent) {
	const route = await import('./+server');
	return (await route[method](event)) as Response;
}

async function openReply(jar: Jar, secret = token) {
	return invoke('GET', eventFor('GET', jar, '', `?action=reply&token=${secret}`));
}

function grant(jar: Jar) {
	return JSON.parse(jar.values.get(cookieName)!) as { confirmation: string; token: string };
}

function replyForm(jar: Jar, body: string) {
	return new URLSearchParams({
		action: 'reply',
		confirmation: grant(jar).confirmation,
		body
	}).toString();
}

function expectPrivate(response: Response, referrer = 'same-origin') {
	expect(response.headers.get('cache-control')).toBe(
		'private, no-cache, no-store, must-revalidate, max-age=0'
	);
	expect(response.headers.get('pragma')).toBe('no-cache');
	expect(response.headers.get('expires')).toBe('0');
	expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
	expect(response.headers.get('referrer-policy')).toBe(referrer);
	expect(response.headers.get('x-content-type-options')).toBe('nosniff');
}

function expectSafeHtml(response: Response, html: string) {
	expectPrivate(response);
	expect(html).not.toContain(token);
	expect(html).not.toContain(tokenHash);
	expect(html).not.toMatch(/<script|<iframe|<img|\sonclick=/i);
	const nonce = html.match(/<style nonce="([^"]+)"/)?.[1];
	expect(nonce).toBeTruthy();
	expect(response.headers.get('content-security-policy')).toBe(
		`default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
	);
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	state.env.VERCEL_ENV = 'production';
	state.client.mockReturnValue({ rpc: state.rpc });
	state.post.mockReturnValue({
		title: 'The <Fifth> & "Window"',
		category: 'Stories',
		slug: 'theFifthWindow'
	});
	state.rpc.mockImplementation((name, parameters) => ({
		abortSignal: (signal: AbortSignal) => state.result(name, parameters, signal)
	}));
	state.result.mockImplementation(async (name) => ({
		data: name === 'preview_post_comment_email_action' ? ready : replied,
		error: null
	}));
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('private email author reply', () => {
	it('keeps an emailed Reply GET and HEAD inert and moves the capability into a private cookie', async () => {
		const jar = cookieJar();
		const response = await openReply(jar);
		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe(path);
		expectPrivate(response, 'no-referrer');
		expect(jar.set).toHaveBeenCalledExactlyOnceWith(cookieName, expect.any(String), {
			path,
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 900
		});
		const previous = jar.values.get(cookieName);
		const head = await invoke('HEAD', eventFor('HEAD', jar, '', `?action=reply&token=${token}`));
		expect(head.status).toBe(200);
		expect(await head.text()).toBe('');
		expect(jar.values.get(cookieName)).toBe(previous);
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it.each([
		{ comment_status: 'pending', reply_is_sibling: false, button: 'Approve and reply' },
		{ comment_status: 'approved', reply_is_sibling: false, button: 'Publish reply' },
		{ comment_status: 'pending', reply_is_sibling: true, button: 'Approve and reply' }
	])(
		'shows an escaped author form for status $comment_status, sibling $reply_is_sibling',
		async (scenario) => {
			state.result.mockResolvedValueOnce({
				data: {
					...ready,
					...scenario,
					reply_parent_id: scenario.reply_is_sibling ? rootId : commentId
				},
				error: null
			});
			const jar = cookieJar();
			await openReply(jar);
			const response = await invoke('GET', eventFor('GET', jar));
			expect(response.status).toBe(200);
			const html = await response.text();
			expectSafeHtml(response, html);
			expect(html).toContain(`>${scenario.button}</button>`);
			expect(html).toContain('<strong>Suvro Ghosh</strong>, with the author badge');
			expect(html).toContain('You do not need to sign in.');
			expect(html).toContain('The &lt;Fifth&gt; &amp; &quot;Window&quot;');
			expect(html).toContain('Reader &lt;&amp;&quot;&#39; বাংলা 😀');
			expect(html).toContain(
				'&lt;script&gt;alert(&quot;reader&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;\n\n  বাংলা 😀'
			);
			expect(html).toContain(`<form method="post" action="${path}">`);
			expect(html).toContain('name="action" value="reply"');
			expect(html).toContain('name="body"');
			expect(html).toContain('2026-10-30T12:00:00.000Z');
			if (scenario.reply_is_sibling)
				expect(html).toContain('alongside it in the same thread, under the original comment');
			expect(state.rpc).toHaveBeenCalledExactlyOnceWith('preview_post_comment_email_action', {
				p_token_hash: tokenHash,
				p_action: 'reply'
			});
			expect(state.resolveUser).not.toHaveBeenCalled();
		}
	);
	it('publishes trimmed plain text by hash only, shows escaped author attribution and article link, and clears its grant', async () => {
		const body = '\u00a0Reply 100% & <ok>\twith tab\r\nnext line\u00a0';
		const jar = cookieJar();
		await openReply(jar);
		const response = await invoke(
			'POST',
			eventFor('POST', jar, replyForm(jar, ` \t\r\n${body} \r\n\t`))
		);
		expect(response.status).toBe(200);
		const html = await response.text();
		expectSafeHtml(response, html);
		expect(html).toContain('Reply published');
		expect(html).toContain('<strong>Suvro Ghosh</strong>');
		expect(html).toContain('\u00a0Reply 100% &amp; &lt;ok&gt;\twith tab\r\nnext line\u00a0');
		expect(html).toContain('href="/blog/stories/theFifthWindow"');
		expect(state.rpc).toHaveBeenCalledExactlyOnceWith('reply_post_comment_email_action', {
			p_token_hash: tokenHash,
			p_body: body
		});
		expect(jar.values.has(cookieName)).toBe(false);
		expect(state.resolveUser).not.toHaveBeenCalled();
	});
	it('accepts all 3000 astral codepoints in a native percent-encoded form larger than 36 KB', async () => {
		const body = '😀'.repeat(3000);
		const jar = cookieJar();
		await openReply(jar);
		const form = replyForm(jar, body);
		expect(Buffer.byteLength(form)).toBeGreaterThan(36_000);
		expect(Buffer.byteLength(form)).toBeLessThan(40 * 1024);
		const response = await invoke('POST', eventFor('POST', jar, form));
		expect(response.status).toBe(200);
		expect(await response.text()).toContain(body);
		expect(state.rpc).toHaveBeenCalledExactlyOnceWith('reply_post_comment_email_action', {
			p_token_hash: tokenHash,
			p_body: body
		});
	});
	it.each([
		'',
		' \t\n\r ',
		'x'.repeat(3001),
		'😀'.repeat(3001),
		'<script>draft</script>\x00',
		'draft\x0b',
		'draft\x0c',
		'draft\x1f',
		'draft\x7f'
	])('keeps an invalid reply draft and grant without querying storage (case %#)', async (body) => {
		const jar = cookieJar();
		await openReply(jar);
		const response = await invoke('POST', eventFor('POST', jar, replyForm(jar, body)));
		expect(response.status).toBe(400);
		const html = await response.text();
		expectSafeHtml(response, html);
		expect(html).toContain('Enter a reply of 1–3,000 characters.');
		expect(html).toContain('<textarea id="reply-body" name="body"');
		expect(html).toContain(
			`<input type="hidden" name="confirmation" value="${grant(jar).confirmation}">`
		);
		expect(jar.values.has(cookieName)).toBe(true);
		expect(state.rpc).not.toHaveBeenCalled();
		if (body.includes('<script>')) expect(html).toContain('&lt;script&gt;draft&lt;/script&gt;');
	});
	it.each(['%C3%28', '%E0%A4%A', '%ED%A0%80', '%'])(
		'rejects malformed percent-encoded UTF-8 %s before publication',
		async (encoded) => {
			const jar = cookieJar();
			await openReply(jar);
			const prefix = new URLSearchParams({
				action: 'reply',
				confirmation: grant(jar).confirmation
			});
			const response = await invoke('POST', eventFor('POST', jar, `${prefix}&body=${encoded}`));
			expect(response.status).toBe(400);
			expectPrivate(response);
			expect(state.rpc).not.toHaveBeenCalled();
			expect(jar.values.has(cookieName)).toBe(true);
		}
	);
	it('rejects raw malformed UTF-8, unexpected fields and queries, wrong action, or duplicate body parameters', async () => {
		const jar = cookieJar();
		await openReply(jar);
		const form = replyForm(jar, 'A valid reply');
		for (const body of [
			form + '&body=second',
			form + '&author=attacker',
			form.replace('action=reply', 'action=approve')
		])
			expect((await invoke('POST', eventFor('POST', jar, body))).status).toBe(409);
		expect((await invoke('POST', eventFor('POST', jar, new Uint8Array([0xc3, 0x28])))).status).toBe(
			400
		);
		expect((await invoke('POST', eventFor('POST', jar, form, '?action=reply'))).status).toBe(400);
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('rejects stale reply tabs after another comment replaces the cookie', async () => {
		const jar = cookieJar();
		await openReply(jar);
		const stale = replyForm(jar, 'A valid reply');
		await openReply(jar, 'd4'.repeat(32));
		const response = await invoke('POST', eventFor('POST', jar, stale));
		expect(response.status).toBe(409);
		expect(grant(jar).token).toBe('d4'.repeat(32));
		expect(state.rpc).not.toHaveBeenCalled();
	});
	const forgedHeaders: Record<string, string>[] = [
		{ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' },
		{ origin: 'null' },
		{ 'sec-fetch-site': 'cross-site' }
	];
	it.each(forgedHeaders)('requires the exact same origin for a reply form %j', async (headers) => {
		const jar = cookieJar();
		await openReply(jar);
		const response = await invoke(
			'POST',
			eventFor('POST', jar, replyForm(jar, 'A reply'), '', headers)
		);
		expect(response.status).toBe(403);
		expectPrivate(response);
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('bounds actual reply stream bytes to 40 KiB despite a false Content-Length', async () => {
		const jar = cookieJar();
		await openReply(jar);
		const cancel = vi.fn();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(40 * 1024 + 1));
			},
			cancel
		});
		const response = await invoke(
			'POST',
			eventFor('POST', jar, stream, '', { 'content-length': '2' })
		);
		expect(response.status).toBe(413);
		expectPrivate(response);
		expect(cancel).toHaveBeenCalled();
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('cancels a stalled reply form after three seconds without consuming the grant', async () => {
		const jar = cookieJar();
		await openReply(jar);
		vi.useFakeTimers();
		const cancel = vi.fn();
		const pending = invoke('POST', eventFor('POST', jar, new ReadableStream({ cancel })));
		await vi.advanceTimersByTimeAsync(3001);
		expect((await pending).status).toBe(408);
		expect(cancel).toHaveBeenCalled();
		expect(jar.values.has(cookieName)).toBe(true);
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('preserves the escaped draft and grant after a five-second uncertain RPC, then retries the identical body and hash safely', async () => {
		const jar = cookieJar();
		await openReply(jar);
		const body = 'PRIVATE_DRAFT </textarea><script>literal</script> & বাংলা 😀';
		const form = replyForm(jar, body);
		vi.useFakeTimers();
		state.result.mockImplementation(() => new Promise(() => {}));
		const pending = invoke('POST', eventFor('POST', jar, form));
		await vi.waitFor(() => expect(state.result).toHaveBeenCalledOnce());
		await vi.advanceTimersByTimeAsync(5001);
		const response = await pending;
		expect(response.status).toBe(408);
		const html = await response.text();
		expectSafeHtml(response, html);
		expect(html).toContain(
			'PRIVATE_DRAFT &lt;/textarea&gt;&lt;script&gt;literal&lt;/script&gt; &amp; বাংলা 😀'
		);
		expect(html).toContain('Retry the same reply');
		expect(html).toContain('<textarea id="reply-body" name="body"');
		expect(jar.values.has(cookieName)).toBe(true);
		expect(state.result.mock.calls[0][2].aborted).toBe(true);
		state.result.mockResolvedValueOnce({ data: replied, error: null });
		expect((await invoke('POST', eventFor('POST', jar, form))).status).toBe(200);
		expect(state.rpc.mock.calls).toEqual([
			['reply_post_comment_email_action', { p_token_hash: tokenHash, p_body: body }],
			['reply_post_comment_email_action', { p_token_hash: tokenHash, p_body: body }]
		]);
		expect(jar.values.has(cookieName)).toBe(false);
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('PRIVATE_DRAFT');
	});
	it.each([
		{ data: null, error: { code: 'XX000', message: 'PRIVATE_PROVIDER_DETAIL' } },
		{ data: { ...replied, action: 'approve' }, error: null },
		{ data: { ...replied, reply_id: 'PRIVATE_INVALID_REPLY_ID' }, error: null }
	])(
		'preserves a draft and grant after malformed or failed publication results without exposing provider details',
		async (result) => {
			state.result.mockResolvedValueOnce(result);
			const jar = cookieJar();
			await openReply(jar);
			const response = await invoke('POST', eventFor('POST', jar, replyForm(jar, 'Draft <&>')));
			expect(response.status).toBe(503);
			const html = await response.text();
			expectSafeHtml(response, html);
			expect(html).toContain('Draft &lt;&amp;&gt;');
			expect(html).toContain('<form method="post"');
			expect(jar.values.has(cookieName)).toBe(true);
			for (const secret of ['PRIVATE_PROVIDER_DETAIL', 'PRIVATE_INVALID_REPLY_ID'])
				expect(html).not.toContain(secret);
			expect(vi.mocked(console.error)).not.toHaveBeenCalled();
		}
	);
	it.each(['invalid', 'expired', 'used', 'unavailable'])(
		'retains a read-only draft but clears the grant after terminal publication state %s',
		async (terminal) => {
			state.result.mockResolvedValueOnce({ data: { state: terminal }, error: null });
			const jar = cookieJar();
			await openReply(jar);
			const response = await invoke(
				'POST',
				eventFor('POST', jar, replyForm(jar, 'Keep </textarea> & <draft>'))
			);
			expect(response.status).toBe(410);
			const html = await response.text();
			expectSafeHtml(response, html);
			expect(html).toContain(
				'<textarea id="saved-reply" rows="8" readonly>Keep &lt;/textarea&gt; &amp; &lt;draft&gt;</textarea>'
			);
			expect(html).not.toContain('<form');
			expect(jar.values.has(cookieName)).toBe(false);
		}
	);
	it.each([
		{ action: 'approve' },
		{ comment_status: 'rejected' },
		{ reply_parent_id: 'invalid' },
		{ reply_is_sibling: undefined }
	])('rejects invalid reply preview DTOs without exposing comment prose', async (invalid) => {
		state.result.mockResolvedValueOnce({ data: { ...ready, ...invalid }, error: null });
		const jar = cookieJar();
		await openReply(jar);
		const response = await invoke('GET', eventFor('GET', jar));
		expect(response.status).toBe(503);
		const html = await response.text();
		expectSafeHtml(response, html);
		expect(html).not.toContain(ready.body);
		expect(html).not.toContain('<form');
	});
	it('returns reply backoff before publishing when the shared admission window is full', async () => {
		vi.useFakeTimers();
		const jar = cookieJar();
		await openReply(jar);
		const form = replyForm(jar, 'A reply');
		for (let index = 0; index < 29; index++)
			expect((await invoke('HEAD', eventFor('HEAD', jar))).status).toBe(200);
		const response = await invoke('POST', eventFor('POST', jar, form));
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('60');
		expectPrivate(response);
		expect(jar.values.has(cookieName)).toBe(true);
		expect(state.rpc).not.toHaveBeenCalled();
	});
});
