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
		vi
			.fn()
			.mockResolvedValue(
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
		expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
			'PRIVATE_PROVIDER_DETAIL'
		);
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
	it('bounds each scheduled claim to five jobs and sends no private prose from unexpected fields', async () => {
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
