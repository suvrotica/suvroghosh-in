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
const token = 'a1'.repeat(32);
const otherToken = 'b2'.repeat(32);
const tokenHash = createHash('sha256').update(token).digest('hex');
const commentId = '10000000-0000-4000-8000-000000000001';
const ready = {
	state: 'ready',
	action: 'approve',
	comment_id: commentId,
	post_slug: 'theFifthWindow',
	display_name: 'PRIVATE_READER_NAME <&"\' বাংলা 😀',
	body: 'PRIVATE_READER_BODY <script>alert("reader")</script> & \'quoted\'\n\n  Final paragraph বাংলা 😀',
	expires_at: '2026-10-30T12:00:00+00:00'
};
const updated = {
	state: 'updated',
	action: 'approve',
	comment_id: commentId,
	post_slug: 'theFifthWindow'
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
	query = '',
	body: BodyInit = '',
	headers: Record<string, string> = {},
	address = 'reader-address'
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
		getClientAddress: () => address
	} as unknown as RequestEvent;
}

async function invoke(method: Method, event: RequestEvent) {
	const route = await import('./+server');
	return (await route[method](event)) as Response;
}

async function openAction(jar: Jar, action = 'approve', secret = token) {
	return invoke('GET', eventFor('GET', jar, `?action=${action}&token=${secret}`));
}

function grant(jar: Jar) {
	return JSON.parse(jar.values.get(cookieName)!) as {
		action: string;
		token: string;
		confirmation: string;
	};
}

function formFor(jar: Jar) {
	const stored = grant(jar);
	return new URLSearchParams({
		action: stored.action,
		confirmation: stored.confirmation
	}).toString();
}

function expectPrivate(response: Response, referrer = 'same-origin') {
	expect(response.headers.get('cache-control')).toBe(
		'private, no-cache, no-store, must-revalidate, max-age=0'
	);
	expect(response.headers.get('pragma')).toBe('no-cache');
	expect(response.headers.get('expires')).toBe('0');
	expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
	expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	expect(response.headers.get('referrer-policy')).toBe(referrer);
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	state.env.VERCEL_ENV = 'production';
	state.client.mockReturnValue({ rpc: state.rpc });
	state.post.mockReturnValue({ title: 'The <Fifth> & "Window"' });
	state.rpc.mockImplementation((name, parameters) => ({
		abortSignal: (signal: AbortSignal) => state.result(name, parameters, signal)
	}));
	state.result.mockImplementation(async (name) => ({
		data: name === 'preview_post_comment_email_action' ? ready : updated,
		error: null
	}));
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('private inbox moderation confirmation', () => {
	it('moves a valid email capability to a private fifteen-minute cookie and redirects without querying storage', async () => {
		const jar = cookieJar();
		const response = await openAction(jar);
		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe(path);
		expect(await response.text()).toBe('');
		expectPrivate(response, 'no-referrer');
		expect(jar.set).toHaveBeenCalledExactlyOnceWith(cookieName, expect.any(String), {
			path,
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			maxAge: 900
		});
		expect(grant(jar)).toEqual({
			action: 'approve',
			token,
			confirmation: expect.stringMatching(/^[a-f0-9-]{36}$/)
		});
		expect(state.rpc).not.toHaveBeenCalled();
		expect(state.resolveUser).not.toHaveBeenCalled();
	});
	it.each([
		'?action=approve',
		`?action=approve&token=${token}&extra=1`,
		`?action=approve&action=reject&token=${token}`,
		`?action=delete&token=${token}`,
		`?action=approve&token=${token.toUpperCase()}`,
		'?action=reject&token=too-short'
	])(
		'clears any previous grant for malformed secret query %s without querying storage',
		async (query) => {
			const jar = cookieJar();
			await openAction(jar);
			jar.set.mockClear();
			const response = await invoke('GET', eventFor('GET', jar, query));
			expect(response.status).toBe(303);
			expect(response.headers.get('location')).toBe(path);
			expect(jar.values.has(cookieName)).toBe(false);
			expect(jar.set).not.toHaveBeenCalled();
			expect(state.rpc).not.toHaveBeenCalled();
		}
	);
	it('keeps HEAD inert even when an email query or a valid confirmation cookie is present', async () => {
		const jar = cookieJar();
		await openAction(jar);
		const previous = jar.values.get(cookieName);
		jar.set.mockClear();
		jar.delete.mockClear();
		for (const query of ['', `?action=reject&token=${otherToken}`]) {
			const response = await invoke('HEAD', eventFor('HEAD', jar, query));
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('');
			expectPrivate(response, query ? 'no-referrer' : 'same-origin');
		}
		expect(jar.values.get(cookieName)).toBe(previous);
		expect(jar.set).not.toHaveBeenCalled();
		expect(jar.delete).not.toHaveBeenCalled();
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('previews by token hash only and escapes the full comment in a script-free, nonce-protected native form', async () => {
		const jar = cookieJar();
		await openAction(jar);
		const response = await invoke('GET', eventFor('GET', jar));
		expect(response.status).toBe(200);
		expectPrivate(response);
		expect(state.rpc).toHaveBeenCalledExactlyOnceWith('preview_post_comment_email_action', {
			p_action: 'approve',
			p_token_hash: tokenHash
		});
		expect(state.result.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
		const html = await response.text();
		expect(html).toContain('Approve this comment?');
		expect(html).toContain('The &lt;Fifth&gt; &amp; &quot;Window&quot;');
		expect(html).toContain('PRIVATE_READER_NAME &lt;&amp;&quot;&#39; বাংলা 😀');
		expect(html).toContain(
			'PRIVATE_READER_BODY &lt;script&gt;alert(&quot;reader&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;\n\n  Final paragraph বাংলা 😀'
		);
		expect(html).toContain('white-space:pre-wrap');
		expect(html).toContain(`<form method="post" action="${path}">`);
		expect(html).toContain(`name="confirmation" value="${grant(jar).confirmation}"`);
		expect(html).toContain('name="action" value="approve"');
		expect(html).toContain('2026-10-30T12:00:00.000Z');
		expect(html).not.toContain(token);
		expect(html).not.toContain(tokenHash);
		expect(html).not.toMatch(/<script|<iframe|<img|\sonclick=/i);
		const nonce = html.match(/<style nonce="([^"]+)"/)?.[1];
		expect(nonce).toBeTruthy();
		expect(response.headers.get('content-security-policy')).toBe(
			`default-src 'none'; style-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`
		);
		expect(state.resolveUser).not.toHaveBeenCalled();
	});
	it('preserves every codepoint of the maximum legal name and full three-thousand-codepoint comment on the preview', async () => {
		const name = '😀'.repeat(60);
		const body = `First paragraph\n\n${'😀'.repeat(3000 - Array.from('First paragraph\n\n\n\nEnd বাংলা').length)}\n\nEnd বাংলা`;
		expect(Array.from(body)).toHaveLength(3000);
		state.result.mockResolvedValueOnce({
			data: { ...ready, display_name: name, body },
			error: null
		});
		const jar = cookieJar();
		await openAction(jar);
		const html = await (await invoke('GET', eventFor('GET', jar))).text();
		expect(html).toContain(name);
		expect(html).toContain(body);
	});
	it.each([
		'not-json',
		'null',
		JSON.stringify({ action: 'approve', token }),
		JSON.stringify({ action: 'approve', token, confirmation: 'invalid' })
	])(
		'denies a missing or malformed confirmation cookie %s without querying storage',
		async (value) => {
			const jar = cookieJar();
			jar.values.set(cookieName, value);
			const response = await invoke('GET', eventFor('GET', jar));
			expect(response.status).toBe(410);
			expectPrivate(response);
			expect(state.rpc).not.toHaveBeenCalled();
		}
	);
	it.each(['invalid', 'expired', 'used', 'unavailable'])(
		'shows safe terminal preview state %s and clears the private grant without consuming it',
		async (terminal) => {
			state.result.mockResolvedValueOnce({ data: { state: terminal }, error: null });
			const jar = cookieJar();
			await openAction(jar);
			const response = await invoke('GET', eventFor('GET', jar));
			expect(response.status).toBe(410);
			expectPrivate(response);
			expect(jar.values.has(cookieName)).toBe(false);
			expect(state.rpc.mock.calls.map(([name]) => name)).toEqual([
				'preview_post_comment_email_action'
			]);
			expect(await response.text()).not.toContain(token);
		}
	);
	it.each(['approve', 'reject'])(
		'consumes a matching native %s confirmation once and does not require an owner login',
		async (action) => {
			state.result.mockResolvedValueOnce({ data: { ...updated, action }, error: null });
			const jar = cookieJar();
			await openAction(jar, action);
			const form = formFor(jar);
			const response = await invoke('POST', eventFor('POST', jar, '', form));
			expect(response.status).toBe(200);
			expectPrivate(response);
			expect(await response.text()).toContain(
				action === 'approve' ? 'Comment approved' : 'Comment rejected'
			);
			expect(state.rpc).toHaveBeenCalledExactlyOnceWith('consume_post_comment_email_action', {
				p_action: action,
				p_token_hash: tokenHash
			});
			expect(jar.values.has(cookieName)).toBe(false);
			expect((await invoke('POST', eventFor('POST', jar, '', form))).status).toBe(410);
			expect(state.rpc).toHaveBeenCalledTimes(1);
			expect(state.resolveUser).not.toHaveBeenCalled();
		}
	);
	it.each(['approve', 'reject'])(
		'refuses an old confirmation tab after a different comment or %s action replaces its cookie',
		async (newAction) => {
			const jar = cookieJar();
			await openAction(jar);
			const staleForm = formFor(jar);
			const oldConfirmation = grant(jar).confirmation;
			await openAction(jar, newAction, otherToken);
			expect(grant(jar).confirmation).not.toBe(oldConfirmation);
			const response = await invoke('POST', eventFor('POST', jar, '', staleForm));
			expect(response.status).toBe(409);
			expectPrivate(response);
			expect(state.rpc).not.toHaveBeenCalled();
			expect(grant(jar).token).toBe(otherToken);
		}
	);
	const forgedFormHeaders: Record<string, string>[] = [
		{ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' },
		{ origin: 'null' },
		{ origin: '' },
		{ 'sec-fetch-site': 'cross-site' }
	];
	it.each(forgedFormHeaders)(
		'rejects a forged form origin %j before reading or consuming a capability',
		async (headers) => {
			const jar = cookieJar();
			await openAction(jar);
			const response = await invoke('POST', eventFor('POST', jar, '', formFor(jar), headers));
			expect(response.status).toBe(403);
			expectPrivate(response);
			expect(state.rpc).not.toHaveBeenCalled();
		}
	);
	it.each(['application/json', 'text/plain', 'multipart/form-data'])(
		'rejects content type %s instead of interpreting it as a confirmation form',
		async (contentType) => {
			const jar = cookieJar();
			await openAction(jar);
			const response = await invoke(
				'POST',
				eventFor('POST', jar, '', formFor(jar), { 'content-type': contentType })
			);
			expect(response.status).toBe(415);
			expect(state.rpc).not.toHaveBeenCalled();
		}
	);
	it('rejects query-bearing posts, extra or duplicated form fields, wrong actions, and invalid UTF-8 without storage work', async () => {
		const jar = cookieJar();
		await openAction(jar);
		const valid = formFor(jar);
		for (const body of [
			valid + '&extra=1',
			valid + '&action=approve',
			valid.replace('action=approve', 'action=reject'),
			''
		]) {
			expect((await invoke('POST', eventFor('POST', jar, '', body))).status).toBe(409);
		}
		expect((await invoke('POST', eventFor('POST', jar, '?action=approve', valid))).status).toBe(
			400
		);
		expect(
			(await invoke('POST', eventFor('POST', jar, '', new Uint8Array([0xc3, 0x28])))).status
		).toBe(400);
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('enforces the actual streamed 1024-byte form limit despite a false Content-Length', async () => {
		const jar = cookieJar();
		await openAction(jar);
		const cancel = vi.fn();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(1025));
			},
			cancel
		});
		const response = await invoke(
			'POST',
			eventFor('POST', jar, '', stream, { 'content-length': '2' })
		);
		expect(response.status).toBe(413);
		expectPrivate(response);
		expect(cancel).toHaveBeenCalled();
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('cancels an unreadable confirmation stream after three seconds and preserves its grant', async () => {
		const jar = cookieJar();
		await openAction(jar);
		vi.useFakeTimers();
		const cancel = vi.fn();
		const pending = invoke('POST', eventFor('POST', jar, '', new ReadableStream({ cancel })));
		await vi.advanceTimersByTimeAsync(3001);
		const response = await pending;
		expect(response.status).toBe(408);
		expect(cancel).toHaveBeenCalled();
		expect(jar.values.has(cookieName)).toBe(true);
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('bounds a provider that ignores its abort signal and returns no private error detail', async () => {
		const jar = cookieJar();
		await openAction(jar);
		vi.useFakeTimers();
		state.result.mockImplementation(() => new Promise(() => {}));
		const pending = invoke('GET', eventFor('GET', jar));
		await vi.waitFor(() => expect(state.result).toHaveBeenCalledOnce());
		await vi.advanceTimersByTimeAsync(5001);
		const response = await pending;
		expect(response.status).toBe(408);
		expectPrivate(response);
		expect(state.result.mock.calls[0][2].aborted).toBe(true);
		expect(await response.text()).not.toContain(token);
	});
	it.each([
		{ data: null, error: { code: 'XX000', message: 'PRIVATE_PROVIDER_ERROR' } },
		{ data: { ...ready, action: 'reject' }, error: null },
		{ data: { ...ready, body: 'PRIVATE_INVALID_PROSE'.repeat(300) }, error: null }
	])(
		'fails closed for provider or malformed preview results without echoing private data',
		async (result) => {
			state.result.mockResolvedValueOnce(result);
			const jar = cookieJar();
			await openAction(jar);
			const response = await invoke('GET', eventFor('GET', jar));
			expect(response.status).toBe(503);
			expectPrivate(response);
			const html = await response.text();
			for (const secret of [
				token,
				tokenHash,
				'PRIVATE_PROVIDER_ERROR',
				'PRIVATE_INVALID_PROSE',
				ready.body
			])
				expect(html).not.toContain(secret);
			expect(state.rpc).toHaveBeenCalledOnce();
		}
	);
	it.each(['expired', 'used'])(
		'safely handles an atomic consume losing a race to state %s and clears the cookie',
		async (terminal) => {
			state.result.mockResolvedValueOnce({ data: { state: terminal }, error: null });
			const jar = cookieJar();
			await openAction(jar);
			const response = await invoke('POST', eventFor('POST', jar, '', formFor(jar)));
			expect(response.status).toBe(410);
			expectPrivate(response);
			expect(jar.values.has(cookieName)).toBe(false);
			expect(state.rpc.mock.calls.map(([name]) => name)).toEqual([
				'consume_post_comment_email_action'
			]);
		}
	);
	it.each(['preview', 'development', ''])(
		'disables all email-action methods in the %s environment before storing or querying a grant',
		async (environment) => {
			state.env.VERCEL_ENV = environment;
			const jar = cookieJar();
			for (const method of ['GET', 'HEAD', 'POST'] as const) {
				const response = await invoke(
					method,
					eventFor(method, jar, `?action=approve&token=${token}`)
				);
				expect(response.status).toBe(503);
				expectPrivate(response, 'no-referrer');
			}
			expect(jar.set).not.toHaveBeenCalled();
			expect(state.rpc).not.toHaveBeenCalled();
		}
	);
	it('returns bounded rate-limit backoff and admits a new request after the window expires', async () => {
		vi.useFakeTimers();
		const jar = cookieJar();
		for (let index = 0; index < 30; index++)
			expect((await invoke('HEAD', eventFor('HEAD', jar))).status).toBe(200);
		const limited = await invoke('HEAD', eventFor('HEAD', jar));
		expect(limited.status).toBe(429);
		expect(limited.headers.get('retry-after')).toBe('60');
		expectPrivate(limited);
		await vi.advanceTimersByTimeAsync(60_001);
		expect((await invoke('HEAD', eventFor('HEAD', jar))).status).toBe(200);
		expect(state.rpc).not.toHaveBeenCalled();
	});
});

describe('email moderation response protection through the site hook', () => {
	it.each(['', `?action=approve&token=${token}`])(
		'keeps action responses private and preserves the correct referrer policy for query %s without an owner session',
		async (query) => {
			const { handle } = await import('../../../../hooks.server');
			const event = eventFor('GET', cookieJar(), query);
			const resolve = vi.fn(
				async () =>
					new Response('Private action response', {
						headers: { 'cache-control': 'public, max-age=3600', 'referrer-policy': 'unsafe-url' }
					})
			);
			const response = await handle({ event, resolve } as Parameters<typeof handle>[0]);
			expectPrivate(response, query ? 'no-referrer' : 'same-origin');
			expect(response.headers.get('x-frame-options')).toBe('DENY');
			expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
			expect(state.resolveUser).not.toHaveBeenCalled();
			expect(resolve).toHaveBeenCalledOnce();
		}
	);
});
