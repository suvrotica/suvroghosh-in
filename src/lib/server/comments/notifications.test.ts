import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	env: {
		VERCEL_ENV: 'production',
		RESEND_API_KEY: 're_test',
		CONTACT_TO_EMAIL: 'owner@example.com',
		CONTACT_FROM_EMAIL: 'notifications@example.com'
	} as Record<string, string>,
	rpc: vi.fn(),
	client: vi.fn(),
	post: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: state.env }));
vi.mock('$lib/server/notes/supabase', () => ({ createNotesAdminClient: state.client }));
vi.mock('$lib/server/content/posts', () => ({ getPublishedPost: state.post }));
vi.mock('./repository', () => ({ commentsRpc: state.rpc }));

const job = {
	comment_id: '10000000-0000-4000-8000-000000000001',
	submission_id: '20000000-0000-4000-8000-000000000001',
	post_slug: 'theFifthWindow',
	created_at: '2026-10-23T12:00:00+00:00',
	lease_token: '30000000-0000-4000-8000-000000000001'
};
const legacyEmailText = `A new reader comment was submitted for approval.

Article: The Fifth Window
Submitted: 2026-10-23T12:00:00.000Z

Review and approve, reject or reply in your moderation board:
https://www.suvroghosh.in/notes/studio/comments

The comment stays hidden until you approve it. Sign in with your existing owner account.
If you have already moderated it, the board shows its current status.`;
const fullContentJob = {
	...job,
	content_version: 2,
	display_name: 'PRIVATE_READER_NAME <&"\' 😀',
	body: 'PRIVATE_COMMENT_TEXT\nA second line with <script>alert("literal text")</script> & Bengali: বাংলা.'
};
const actionJob = {
	...fullContentJob,
	content_version: 3,
	approve_token: 'a1'.repeat(32),
	reject_token: 'b2'.repeat(32),
	action_expires_at: '2026-10-30T12:00:00+00:00'
};
const approveUrl = `https://www.suvroghosh.in/api/comments/moderate?action=approve&token=${actionJob.approve_token}`;
const rejectUrl = `https://www.suvroghosh.in/api/comments/moderate?action=reject&token=${actionJob.reject_token}`;

beforeEach(() => {
	vi.clearAllMocks();
	state.env.VERCEL_ENV = 'production';
	state.env.RESEND_API_KEY = 're_test';
	state.client.mockReturnValue({});
	state.post.mockReturnValue({ title: 'The Fifth Window' });
	state.rpc.mockImplementation((_client, name) =>
		name === 'claim_post_comment_notifications' ? [job] : true
	);
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: 'email-123' }), {
				headers: { 'content-type': 'application/json' }
			})
		)
	);
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('durable comment approval email delivery', () => {
	it('uses the existing fixed inbox and real Resend SDK with a stable key, abort signal and moderation link', async () => {
		const { dispatchCommentNotifications, COMMENT_MODERATION_URL } =
			await import('./notifications');
		expect(await dispatchCommentNotifications(job.submission_id)).toEqual({
			enabled: true,
			attempted: 1,
			sent: 1,
			failed: 0
		});
		expect(state.rpc).toHaveBeenNthCalledWith(1, {}, 'claim_post_comment_notifications', {
			p_submission_id: job.submission_id,
			p_limit: 1
		});
		const [url, request] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe('https://api.resend.com/emails');
		expect(request?.signal).toBeInstanceOf(AbortSignal);
		expect(new Headers(request?.headers).get('idempotency-key')).toBe(
			`post-comment-approval/${job.comment_id}`
		);
		const email = JSON.parse(String(request?.body));
		expect(email).toMatchObject({
			to: 'owner@example.com',
			from: 'SuvroGhosh.IN Comments <notifications@example.com>'
		});
		expect(email.text).toContain('The Fifth Window');
		expect(email.text).toContain('2026-10-23T12:00:00.000Z');
		expect(email.text).toContain(COMMENT_MODERATION_URL);
		expect(email).not.toHaveProperty('html');
		expect(state.rpc).toHaveBeenLastCalledWith({}, 'finish_post_comment_notification', {
			p_comment_id: job.comment_id,
			p_lease_token: job.lease_token,
			p_sent: true,
			p_provider_id: 'email-123'
		});
	});
	it('preserves the exact original email wire payload and idempotency key for a legacy RPC job', async () => {
		const { dispatchCommentNotifications } = await import('./notifications');
		await dispatchCommentNotifications(job.submission_id);
		const request = vi.mocked(fetch).mock.calls[0][1];
		expect(String(request?.body)).toBe(
			JSON.stringify({
				from: 'SuvroGhosh.IN Comments <notifications@example.com>',
				subject: 'A new comment is waiting for approval | SuvroGhosh.IN',
				text: legacyEmailText,
				to: 'owner@example.com'
			})
		);
		expect(new Headers(request?.headers).get('idempotency-key')).toBe(
			`post-comment-approval/${job.comment_id}`
		);
	});
	it('includes every Unicode codepoint of a maximum-length commenter name and full multiline comment as plain text with fixed headers', async () => {
		const namePrefix = 'সুভ্র <&"\' ';
		const displayName = namePrefix + '😀'.repeat(60 - Array.from(namePrefix).length);
		const bodyPrefix = 'First line\n<script>alert("literal only")</script> & <img src=x>\nবাংলা\n';
		const bodySuffix = '\nEND_OF_FULL_COMMENT_😀';
		const fullBody =
			bodyPrefix + '😀'.repeat(3000 - Array.from(bodyPrefix + bodySuffix).length) + bodySuffix;
		expect(Array.from(displayName)).toHaveLength(60);
		expect(Array.from(fullBody)).toHaveLength(3000);
		expect(fullBody.length).toBeGreaterThan(3000);
		state.rpc.mockResolvedValueOnce([
			{
				...fullContentJob,
				display_name: displayName,
				body: fullBody,
				from: 'attacker@example.com',
				to: 'attacker@example.com',
				reply_to: 'attacker@example.com',
				subject: 'Attacker subject',
				headers: { 'X-Reader': 'attacker' },
				html: '<script>attacker</script>',
				url: 'https://attacker.example'
			}
		]);
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications()).sent).toBe(1);
		const request = vi.mocked(fetch).mock.calls[0][1];
		const email = JSON.parse(String(request?.body));
		expect(email).toEqual({
			from: 'SuvroGhosh.IN Comments <notifications@example.com>',
			to: 'owner@example.com',
			subject: 'A new comment is waiting for approval | SuvroGhosh.IN',
			text: `A new reader comment was submitted for approval.

Article: The Fifth Window
Submitted: 2026-10-23T12:00:00.000Z

Commenter: ${displayName}

Full comment:
${fullBody}

Review and approve, reject or reply in your moderation board:
https://www.suvroghosh.in/notes/studio/comments

The comment stays hidden until you approve it. Sign in with your existing owner account.
If you have already moderated it, the board shows its current status.`
		});
		expect(new Headers(request?.headers).get('idempotency-key')).toBe(
			`post-comment-approval-v2/${job.comment_id}`
		);
		expect(JSON.stringify([...new Headers(request?.headers)])).not.toContain(displayName);
		expect(String(request?.body)).not.toContain('attacker');
	});
	it('preserves the exact version 2 email wire payload and key without adding HTML or action links', async () => {
		state.rpc.mockResolvedValueOnce([{ ...actionJob, content_version: 2 }]);
		const { dispatchCommentNotifications } = await import('./notifications');
		await dispatchCommentNotifications(job.submission_id);
		const request = vi.mocked(fetch).mock.calls[0][1];
		expect(String(request?.body)).toBe(
			JSON.stringify({
				from: 'SuvroGhosh.IN Comments <notifications@example.com>',
				subject: 'A new comment is waiting for approval | SuvroGhosh.IN',
				text: `A new reader comment was submitted for approval.

Article: The Fifth Window
Submitted: 2026-10-23T12:00:00.000Z

Commenter: ${fullContentJob.display_name}

Full comment:
${fullContentJob.body}

Review and approve, reject or reply in your moderation board:
https://www.suvroghosh.in/notes/studio/comments

The comment stays hidden until you approve it. Sign in with your existing owner account.
If you have already moderated it, the board shows its current status.`,
				to: 'owner@example.com'
			})
		);
		expect(new Headers(request?.headers).get('idempotency-key')).toBe(
			`post-comment-approval-v2/${job.comment_id}`
		);
	});
	it.each([
		{ display_name: undefined },
		{ display_name: null },
		{ display_name: '' },
		{ body: undefined },
		{ body: null },
		{ body: '' }
	])('does not send a version 2 notification with missing content: %j', async (missingContent) => {
		state.rpc.mockResolvedValueOnce([{ ...fullContentJob, ...missingContent }]);
		const { dispatchCommentNotifications } = await import('./notifications');
		expect(await dispatchCommentNotifications()).toMatchObject({
			attempted: 0,
			sent: 0,
			failed: 1
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(state.rpc).toHaveBeenCalledTimes(1);
		const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
		expect(logs).not.toContain('PRIVATE_READER_NAME');
		expect(logs).not.toContain('PRIVATE_COMMENT_TEXT');
	});
	it.each(['preview', 'development', ''])(
		'never claims jobs or emails from %s environments',
		async (environment) => {
			state.env.VERCEL_ENV = environment;
			const { dispatchCommentNotifications } = await import('./notifications');
			expect((await dispatchCommentNotifications()).enabled).toBe(false);
			expect(state.rpc).not.toHaveBeenCalled();
			expect(fetch).not.toHaveBeenCalled();
		}
	);
	it('leaves jobs untouched when email configuration is absent', async () => {
		state.env.RESEND_API_KEY = '';
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications()).enabled).toBe(false);
		expect(state.rpc).not.toHaveBeenCalled();
	});
	it('does not resend an acknowledged UUID retry or an already moderated job', async () => {
		state.rpc.mockResolvedValue([]);
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications(job.submission_id)).attempted).toBe(0);
		expect(fetch).not.toHaveBeenCalled();
	});
	it('retries provider rejection without logging its response or losing the job', async () => {
		state.env.RESEND_API_KEY = 're_PRIVATE_API_KEY';
		state.rpc.mockResolvedValueOnce([fullContentJob]);
		vi.mocked(fetch).mockResolvedValue(
			new Response(
				JSON.stringify({ name: 'validation_error', message: 'PRIVATE_PROVIDER_DETAIL' }),
				{ status: 422, headers: { 'content-type': 'application/json' } }
			)
		);
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications()).failed).toBe(1);
		expect(state.rpc).toHaveBeenLastCalledWith(
			{},
			'finish_post_comment_notification',
			expect.objectContaining({ p_sent: false, p_provider_id: null })
		);
		const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
		for (const privateValue of [
			'PRIVATE_PROVIDER_DETAIL',
			'PRIVATE_READER_NAME',
			'PRIVATE_COMMENT_TEXT',
			'PRIVATE_API_KEY'
		])
			expect(logs).not.toContain(privateValue);
	});
	it('aborts a stalled SDK send after five seconds and retries with the same identity', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | null | undefined;
		vi.mocked(fetch).mockImplementation((_url, request) => {
			signal = request?.signal;
			return new Promise(() => {});
		});
		const { dispatchCommentNotifications } = await import('./notifications');
		const first = dispatchCommentNotifications(job.submission_id);
		await vi.advanceTimersByTimeAsync(5001);
		expect((await first).failed).toBe(1);
		expect(signal?.aborted).toBe(true);
		vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'email-123' })));
		expect((await dispatchCommentNotifications(job.submission_id)).sent).toBe(1);
		const keys = vi
			.mocked(fetch)
			.mock.calls.map(([, init]) => new Headers(init?.headers).get('idempotency-key'));
		expect(new Set(keys).size).toBe(1);
	});
	it('keeps the version 2 email body and idempotency key identical across a provider-failure retry', async () => {
		state.rpc.mockImplementation((_client, name) =>
			name === 'claim_post_comment_notifications' ? [fullContentJob] : true
		);
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(JSON.stringify({ name: 'rate_limit_exceeded', message: 'Retry later' }), {
				status: 429,
				headers: { 'content-type': 'application/json' }
			})
		);
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications(job.submission_id)).failed).toBe(1);
		expect((await dispatchCommentNotifications(job.submission_id)).sent).toBe(1);
		expect(fetch).toHaveBeenCalledTimes(2);
		const requests = vi.mocked(fetch).mock.calls.map(([, request]) => request);
		expect(requests[0]?.body).toBe(requests[1]?.body);
		for (const request of requests) {
			expect(new Headers(request?.headers).get('idempotency-key')).toBe(
				`post-comment-approval-v2/${job.comment_id}`
			);
			expect(JSON.parse(String(request?.body)).text).toContain(fullContentJob.body);
		}
		expect(state.rpc).toHaveBeenNthCalledWith(
			2,
			{},
			'finish_post_comment_notification',
			expect.objectContaining({ p_sent: false, p_provider_id: null })
		);
		expect(state.rpc).toHaveBeenLastCalledWith(
			{},
			'finish_post_comment_notification',
			expect.objectContaining({ p_sent: true, p_provider_id: 'email-123' })
		);
	});
	it('retains the lease for recovery if a provider success cannot be acknowledged', async () => {
		state.rpc.mockImplementation((_client, name) =>
			name === 'claim_post_comment_notifications'
				? [job]
				: Promise.reject(new Error('PRIVATE_DATABASE_DETAIL'))
		);
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications()).failed).toBe(1);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
			'PRIVATE_DATABASE_DETAIL'
		);
	});
	it('bounds scheduled claims to five jobs and ignores unexpected content on legacy version 1 jobs', async () => {
		state.rpc.mockResolvedValueOnce([
			{
				...job,
				body: 'PRIVATE_COMMENT_TEXT',
				display_name: 'PRIVATE_READER_NAME',
				to: 'attacker@example.com',
				url: 'https://attacker.example'
			}
		]);
		const { dispatchCommentNotifications } = await import('./notifications');
		await dispatchCommentNotifications();
		expect(state.rpc).toHaveBeenNthCalledWith(1, {}, 'claim_post_comment_notifications', {
			p_submission_id: null,
			p_limit: 5
		});
		const body = String(vi.mocked(fetch).mock.calls[0][1]?.body);
		for (const text of ['PRIVATE_COMMENT_TEXT', 'PRIVATE_READER_NAME', 'attacker'])
			expect(body).not.toContain(text);
	});
	it('settles safely when queue storage fails', async () => {
		state.rpc.mockRejectedValue(new Error('PRIVATE_SECRET'));
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications()).failed).toBe(1);
		expect(fetch).not.toHaveBeenCalled();
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('PRIVATE_SECRET');
	});
});

describe('private email moderation action content', () => {
	it('sends action-bound buttons and a full plain-text alternative only to the existing fixed inbox', async () => {
		state.rpc.mockResolvedValueOnce([
			{
				...actionJob,
				from: 'attacker@example.com',
				to: 'attacker@example.com',
				subject: 'Attacker subject',
				headers: { 'X-Reader': 'attacker' },
				html: '<script>attacker</script>',
				approve_url: 'https://attacker.example/approve',
				reject_url: 'https://attacker.example/reject'
			}
		]);
		const { dispatchCommentNotifications, COMMENT_MODERATION_URL } =
			await import('./notifications');
		expect(await dispatchCommentNotifications()).toEqual({
			enabled: true,
			attempted: 1,
			sent: 1,
			failed: 0
		});
		const request = vi.mocked(fetch).mock.calls[0][1];
		const email = JSON.parse(String(request?.body));
		expect(email).toMatchObject({
			from: 'SuvroGhosh.IN Comments <notifications@example.com>',
			to: 'owner@example.com',
			subject: 'A new comment is waiting for approval | SuvroGhosh.IN'
		});
		expect(email.text).toBe(`A new reader comment was submitted for approval.

Article: The Fifth Window
Submitted: 2026-10-23T12:00:00.000Z

Commenter: ${actionJob.display_name}

Full comment:
${actionJob.body}

Choose Approve or Reject, then confirm your choice on the page that opens. No admin sign-in is needed. Opening a link does not change the comment until you confirm.

Approve comment:
${approveUrl}

Reject comment:
${rejectUrl}

These private links expire 7 days after submission, at 2026-10-30T12:00:00.000Z. Once the comment has been handled, neither link can be used. Keep this email private: anyone with an action link can moderate this comment.

Review the current status or reply in your moderation board:
${COMMENT_MODERATION_URL}

The comment stays hidden until you approve it. The moderation board uses your existing owner sign-in.`);
		const links = Array.from(String(email.html).matchAll(/href="([^"]+)"/g), (match) =>
			match[1].replaceAll('&amp;', '&')
		);
		expect(links).toEqual([approveUrl, rejectUrl, COMMENT_MODERATION_URL]);
		for (const [index, action, token] of [
			[0, 'approve', actionJob.approve_token],
			[1, 'reject', actionJob.reject_token]
		] as const) {
			const link = new URL(links[index]);
			expect(link.origin).toBe('https://www.suvroghosh.in');
			expect(link.pathname).toBe('/api/comments/moderate');
			expect([...link.searchParams]).toEqual([
				['action', action],
				['token', token]
			]);
		}
		expect(email.html).toMatch(/>Approve<\/a>/);
		expect(email.html).toMatch(/>Reject<\/a>/);
		expect(email.html).toContain('No admin sign-in is needed.');
		expect(email.html).toContain('2026-10-30T12:00:00.000Z');
		expect(email.html).not.toMatch(/<form|<script|<img|<iframe/i);
		expect(String(request?.body)).not.toContain('attacker');
		expect(new Headers(request?.headers).get('idempotency-key')).toBe(
			`post-comment-approval-v3/${job.comment_id}`
		);
		expect(JSON.stringify([...new Headers(request?.headers)])).not.toContain(
			actionJob.approve_token
		);
	});
	it('escapes reader and article HTML while preserving all 3000 Unicode codepoints and paragraph spacing', async () => {
		const title = 'An <article> & "quoted" \'title\'\r\nSecond line';
		const namePrefix = 'বাংলা <&"\' ';
		const name = namePrefix + '😀'.repeat(60 - Array.from(namePrefix).length);
		const bodyPrefix = '  First paragraph: <script>alert("reader")</script> & \'quoted\'\n\n';
		const bodySuffix = '\n\n  Last paragraph বাংলা 😀';
		const body =
			bodyPrefix + '😀'.repeat(3000 - Array.from(bodyPrefix + bodySuffix).length) + bodySuffix;
		expect(Array.from(name)).toHaveLength(60);
		expect(Array.from(body)).toHaveLength(3000);
		state.post.mockReturnValue({ title });
		state.rpc.mockResolvedValueOnce([{ ...actionJob, display_name: name, body }]);
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications()).sent).toBe(1);
		const email = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
		expect(email.text).toContain(`Commenter: ${name}\n\nFull comment:\n${body}\n`);
		expect(email.html).toContain(
			'An &lt;article&gt; &amp; &quot;quoted&quot; &#39;title&#39;  Second line'
		);
		expect(email.html).toContain('বাংলা &lt;&amp;&quot;&#39; ');
		expect(email.html).toContain(
			'  First paragraph: &lt;script&gt;alert(&quot;reader&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;\n\n'
		);
		expect(email.html).toContain(bodySuffix);
		expect(email.html).toContain('white-space:pre-wrap');
		expect(email.html).not.toContain('<script>');
		const escapedBody = String(email.html).match(/border-radius:4px">([\s\S]*?)<\/div>/)?.[1];
		const decodedBody = escapedBody
			?.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&quot;', '"')
			.replaceAll('&#39;', "'")
			.replaceAll('&amp;', '&');
		expect(decodedBody).toBe(body);
	});
	it.each([
		{ display_name: undefined },
		{ body: null },
		{ approve_token: undefined },
		{ approve_token: null },
		{ approve_token: '' },
		{ approve_token: 'A1'.repeat(32) },
		{ approve_token: 'a'.repeat(63) },
		{ approve_token: 'a'.repeat(65) },
		{ approve_token: 'g1'.repeat(32) },
		{ reject_token: undefined },
		{ reject_token: actionJob.approve_token },
		{ action_expires_at: undefined },
		{ action_expires_at: null },
		{ action_expires_at: 'next week' },
		{ action_expires_at: '2026-10-30' },
		{ content_version: 4 }
	])('fails closed without exposing a malformed action claim: %j', async (invalidContent) => {
		state.rpc.mockResolvedValueOnce([{ ...actionJob, ...invalidContent }]);
		const { dispatchCommentNotifications } = await import('./notifications');
		expect(await dispatchCommentNotifications()).toMatchObject({
			attempted: 0,
			sent: 0,
			failed: 1
		});
		expect(fetch).not.toHaveBeenCalled();
		expect(state.rpc).toHaveBeenCalledTimes(1);
		const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
		for (const value of [
			actionJob.display_name,
			actionJob.body,
			actionJob.approve_token,
			actionJob.reject_token
		])
			expect(logs).not.toContain(value);
	});
	it('keeps the exact v3 payload, capability pair, expiry and provider key after an uncertain acknowledgement', async () => {
		vi.mocked(fetch).mockImplementation(async () => {
			return new Response(JSON.stringify({ id: 'email-123' }), {
				headers: { 'content-type': 'application/json' }
			});
		});
		state.rpc.mockImplementation((_client, name) => {
			if (name === 'claim_post_comment_notifications') return [actionJob];
			return Promise.reject(new Error('PRIVATE_DATABASE_DETAIL'));
		});
		const { dispatchCommentNotifications } = await import('./notifications');
		expect((await dispatchCommentNotifications()).failed).toBe(1);
		// A later retry must retain the original expiry rather than grant another seven days.
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-26T16:00:00Z'));
		state.rpc.mockImplementation((_client, name) =>
			name === 'claim_post_comment_notifications' ? [actionJob] : true
		);
		expect((await dispatchCommentNotifications()).sent).toBe(1);
		const requests = vi.mocked(fetch).mock.calls.map(([, request]) => request);
		expect(requests).toHaveLength(2);
		expect(requests[0]?.body).toBe(requests[1]?.body);
		for (const request of requests) {
			expect(new Headers(request?.headers).get('idempotency-key')).toBe(
				`post-comment-approval-v3/${job.comment_id}`
			);
			const email = JSON.parse(String(request?.body));
			expect(email.text).toContain(approveUrl);
			expect(email.text).toContain(rejectUrl);
			expect(email.text).toContain('2026-10-30T12:00:00.000Z');
		}
		const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
		for (const value of [
			actionJob.approve_token,
			actionJob.reject_token,
			'PRIVATE_DATABASE_DETAIL'
		])
			expect(logs).not.toContain(value);
	});
});
