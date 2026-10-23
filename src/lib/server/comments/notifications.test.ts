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
