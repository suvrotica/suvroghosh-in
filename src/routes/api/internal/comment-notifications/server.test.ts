import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	env: {
		COMMENTS_NOTIFICATION_SECRET: 'worker-secret-with-at-least-32-characters',
		VERCEL_ENV: 'production',
		RESEND_API_KEY: 'private-provider-key'
	},
	configured: vi.fn(),
	dispatch: vi.fn(),
	timingSafeEqual: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/server/comments/notifications', () => ({
	commentEmailConfigured: mocks.configured,
	dispatchCommentNotifications: mocks.dispatch
}));
vi.mock('node:crypto', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:crypto')>();
	return {
		...actual,
		timingSafeEqual: (left: NodeJS.ArrayBufferView, right: NodeJS.ArrayBufferView) => {
			mocks.timingSafeEqual(left, right);
			return actual.timingSafeEqual(left, right);
		}
	};
});

const report = { enabled: true, attempted: 1, sent: 1, failed: 0 };

async function invoke({
	body = '{}',
	query = '',
	headers = {}
}: {
	body?: BodyInit;
	query?: string;
	headers?: Record<string, string>;
} = {}) {
	const { POST } = await import('./+server');
	const url = new URL(`https://www.suvroghosh.in/api/internal/comment-notifications${query}`);
	const request = new Request(url, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${mocks.env.COMMENTS_NOTIFICATION_SECRET}`,
			'content-type': 'application/json',
			...headers
		},
		body,
		...(body instanceof ReadableStream ? { duplex: 'half' } : {})
	} as RequestInit);
	return (await POST({ request, url } as Parameters<RequestHandler>[0])) as Response;
}

function expectPrivateHeaders(response: Response) {
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
	expect(response.headers.get('x-content-type-options')).toBe('nosniff');
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	Object.assign(mocks.env, {
		COMMENTS_NOTIFICATION_SECRET: 'worker-secret-with-at-least-32-characters',
		VERCEL_ENV: 'production',
		RESEND_API_KEY: 'private-provider-key'
	});
	mocks.configured.mockImplementation(
		() => mocks.env.VERCEL_ENV === 'production' && Boolean(mocks.env.RESEND_API_KEY)
	);
	mocks.dispatch.mockResolvedValue({ ...report });
});
afterEach(() => vi.useRealTimers());

describe('private comment notification delivery worker', () => {
	it.each(['', 'short'])(
		'fails closed for an absent or short worker secret (%s)',
		async (secret) => {
			mocks.env.COMMENTS_NOTIFICATION_SECRET = secret;
			const response = await invoke();
			expect(response.status).toBe(503);
			expectPrivateHeaders(response);
			expect(mocks.dispatch).not.toHaveBeenCalled();
			expect(mocks.timingSafeEqual).not.toHaveBeenCalled();
		}
	);
	it.each(['preview', 'development'])(
		'does not allow delivery in a %s deployment',
		async (environment) => {
			mocks.env.VERCEL_ENV = environment;
			expect((await invoke()).status).toBe(503);
			expect(mocks.dispatch).not.toHaveBeenCalled();
		}
	);
	it('fails closed when the email provider is not configured', async () => {
		mocks.env.RESEND_API_KEY = '';
		expect((await invoke()).status).toBe(503);
		expect(mocks.dispatch).not.toHaveBeenCalled();
	});
	it.each(['', 'Bearer short', 'Basic owner-session-cookie'])(
		'requires worker authorization instead of an owner session (%s)',
		async (authorization) => {
			const response = await invoke({ headers: { authorization, cookie: 'owner=signed-in' } });
			expect(response.status).toBe(401);
			expectPrivateHeaders(response);
			expect(mocks.timingSafeEqual).not.toHaveBeenCalled();
			expect(mocks.dispatch).not.toHaveBeenCalled();
		}
	);
	it('compares equal-length bearer tokens with the actual constant-time primitive', async () => {
		const expected = `Bearer ${mocks.env.COMMENTS_NOTIFICATION_SECRET}`;
		const incorrect = `${expected.slice(0, -1)}!`;
		expect((await invoke({ headers: { authorization: incorrect } })).status).toBe(401);
		expect(mocks.timingSafeEqual).toHaveBeenCalledWith(
			Buffer.from(incorrect),
			Buffer.from(expected)
		);
		expect(mocks.dispatch).not.toHaveBeenCalled();
		expect((await invoke()).status).toBe(200);
		expect(mocks.timingSafeEqual).toHaveBeenCalledTimes(2);
	});
	it.each<Record<string, string>>([
		{ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' },
		{ origin: 'null' },
		{ 'sec-fetch-site': 'cross-site' },
		{ 'sec-fetch-site': 'same-site' }
	])('rejects browser cross-origin signals even with a valid bearer: %o', async (headers) => {
		const response = await invoke({ headers });
		expect(response.status).toBe(403);
		expectPrivateHeaders(response);
		expect(mocks.dispatch).not.toHaveBeenCalled();
	});
	it.each<Record<string, string>>([
		{},
		{ origin: 'https://www.suvroghosh.in', 'sec-fetch-site': 'same-origin' },
		{ 'sec-fetch-site': 'none' }
	])(
		'allows the authenticated server worker with supported origin signals: %o',
		async (headers) => {
			const response = await invoke({ headers });
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(report);
			expectPrivateHeaders(response);
			expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith();
		}
	);
	it.each(['?post=private', '?submissionId=10000000-0000-4000-8000-000000000001'])(
		'rejects query parameters before running delivery (%s)',
		async (query) => {
			expect((await invoke({ query })).status).toBe(400);
			expect(mocks.dispatch).not.toHaveBeenCalled();
		}
	);
	it.each(['', '{', 'null', '[]', '"secret"', '{"post":"test-article"}', '{"limit":1}'])(
		'accepts only an empty JSON object (%s)',
		async (body) => {
			expect((await invoke({ body })).status).toBe(400);
			expect(mocks.dispatch).not.toHaveBeenCalled();
		}
	);
	it('requires JSON content type while allowing a charset parameter', async () => {
		expect((await invoke({ headers: { 'content-type': 'text/plain' } })).status).toBe(415);
		expect(mocks.dispatch).not.toHaveBeenCalled();
		expect(
			(await invoke({ headers: { 'content-type': 'application/json; charset=utf-8' } })).status
		).toBe(200);
	});
	it('limits actual streamed bytes to 1 KiB despite a misleading Content-Length', async () => {
		const cancel = vi.fn();
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(512).fill(32));
				controller.enqueue(new Uint8Array(513).fill(32));
			},
			cancel
		});
		const response = await invoke({ body, headers: { 'content-length': '2' } });
		expect(response.status).toBe(413);
		expectPrivateHeaders(response);
		expect(cancel).toHaveBeenCalled();
		expect(mocks.dispatch).not.toHaveBeenCalled();
	});
	it('accepts an empty JSON object at the exact 1 KiB boundary', async () => {
		const body = `${' '.repeat(1022)}{}`;
		expect(new TextEncoder().encode(body)).toHaveLength(1024);
		expect((await invoke({ body })).status).toBe(200);
	});
	it('cancels a stalled request body after three seconds', async () => {
		// Import before installing fake timers so module loading cannot hide the deadline.
		await import('./+server');
		vi.useFakeTimers();
		const cancel = vi.fn();
		const pending = invoke({ body: new ReadableStream({ cancel }) });
		await vi.advanceTimersByTimeAsync(2999);
		expect(mocks.dispatch).not.toHaveBeenCalled();
		expect(cancel).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		const response = await pending;
		expect(response.status).toBe(408);
		expectPrivateHeaders(response);
		expect(cancel).toHaveBeenCalled();
		expect(mocks.dispatch).not.toHaveBeenCalled();
	});
	it('permits two runs per minute and admits another only after the window expires', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-23T00:00:00Z'));
		expect((await invoke()).status).toBe(200);
		expect((await invoke()).status).toBe(200);
		const limited = await invoke();
		expect(limited.status).toBe(429);
		expect(limited.headers.get('retry-after')).toBe('60');
		expectPrivateHeaders(limited);
		expect(mocks.dispatch).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(60_000);
		expect((await invoke()).status).toBe(200);
		expect(mocks.dispatch).toHaveBeenCalledTimes(3);
	});
	it('allows only one concurrent delivery and releases admission when it finishes', async () => {
		let finish!: (value: typeof report) => void;
		mocks.dispatch.mockImplementationOnce(
			() => new Promise<typeof report>((resolve) => (finish = resolve))
		);
		const running = invoke();
		await vi.waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1));
		const blocked = await invoke();
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get('retry-after')).toBe('1');
		expect(mocks.dispatch).toHaveBeenCalledTimes(1);
		finish({ ...report });
		expect((await running).status).toBe(200);
		expect((await invoke()).status).toBe(200);
	});
	it('returns only bounded delivery counters and reports a failed delivery as retryable', async () => {
		const failed = { enabled: true, attempted: 2, sent: 1, failed: 1 };
		mocks.dispatch.mockResolvedValueOnce(failed);
		const response = await invoke();
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual(failed);
		expectPrivateHeaders(response);
	});
	it('does not expose provider details and releases admission if dispatch unexpectedly throws', async () => {
		mocks.dispatch.mockRejectedValueOnce(
			new Error('PRIVATE_SECRET private-provider-key contact-inbox@example.com comment prose')
		);
		const response = await invoke();
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			message: 'Comments are temporarily unavailable. Please try again.'
		});
		expectPrivateHeaders(response);
		expect((await invoke()).status).toBe(200);
	});
});
