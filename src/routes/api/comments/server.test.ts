import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	submit: vi.fn(),
	rate: vi.fn(),
	dispatch: vi.fn()
}));
vi.mock('$lib/server/comments/repository', () => ({
	listPublicComments: mocks.list,
	submitGuestComment: mocks.submit,
	commentRateKey: mocks.rate
}));
vi.mock('$lib/server/comments/notifications', () => ({
	dispatchCommentNotifications: mocks.dispatch
}));

const id = '10000000-0000-4000-8000-000000000001';
const payload = {
	postSlug: 'test-article',
	parentId: null,
	name: 'Reader',
	body: 'A thoughtful question.',
	submissionId: id,
	website: ''
};

async function invoke(
	method: 'GET' | 'POST',
	body: BodyInit = JSON.stringify(payload),
	query = '?post=test-article',
	headers: Record<string, string> = {}
) {
	const { GET, POST } = await import('./+server');
	const url = new URL(`https://www.suvroghosh.in/api/comments${query}`);
	const request = new Request(url, {
		method,
		headers: { origin: url.origin, 'content-type': 'application/json', ...headers },
		...(method === 'POST'
			? { body, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) }
			: {})
	});
	return (await (method === 'POST' ? POST : GET)({
		request,
		url,
		getClientAddress: () => 'test-address'
	} as Parameters<RequestHandler>[0])) as Response;
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.submit.mockResolvedValue('pending');
	mocks.dispatch.mockResolvedValue({ enabled: true, attempted: 1, sent: 1, failed: 0 });
	mocks.rate.mockResolvedValue('a'.repeat(64));
	mocks.list.mockResolvedValue({ comments: [], total: 0, commentCount: 0, page: 1, pageSize: 20 });
});
afterEach(() => vi.useRealTimers());

describe('public moderated comment boundary', () => {
	it.each([
		'theFifthWindow',
		'the-Return-of-the-Sweets',
		'the-AI-Alignment-and-Human-Learning-Calcutta'
	])(
		'preserves the published legacy identifier %s for reads and pending submissions',
		async (postSlug) => {
			const response = await invoke('GET', '', `?post=${postSlug}`);
			expect(response.status).toBe(200);
			expect(mocks.list).toHaveBeenCalledWith(postSlug, null, 1);
			const submission = { ...payload, postSlug };
			const pending = await invoke('POST', JSON.stringify(submission));
			expect(pending.status).toBe(202);
			expect(await pending.json()).toMatchObject({ status: 'pending' });
			expect(mocks.submit).toHaveBeenCalledWith(submission, 'a'.repeat(64));
		}
	);
	it.each(['theFifthWindow/private', 'theFifthWindow.md', 'The Fifth Window', 'ThéFifthWindow'])(
		'rejects unsafe legacy-like article identifier %s for both reads and submissions',
		async (postSlug) => {
			expect((await invoke('GET', '', `?post=${encodeURIComponent(postSlug)}`)).status).toBe(400);
			expect((await invoke('POST', JSON.stringify({ ...payload, postSlug }))).status).toBe(400);
			expect(mocks.list).not.toHaveBeenCalled();
			expect(mocks.submit).not.toHaveBeenCalled();
			expect(mocks.dispatch).not.toHaveBeenCalled();
		}
	);
	it('saves guest input as pending and never echoes a private comment', async () => {
		const response = await invoke('POST');
		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({
			status: 'pending',
			message: 'Your comment has been received and is awaiting approval.'
		});
		expect(mocks.submit).toHaveBeenCalledWith(payload, 'a'.repeat(64));
		expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith(id);
		expect(mocks.submit.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.dispatch.mock.invocationCallOrder[0]
		);
		expect(response.headers.get('cache-control')).toContain('no-store');
	});
	it('keeps a saved comment pending when the email service reports a caught delivery failure', async () => {
		mocks.dispatch.mockResolvedValueOnce({ enabled: true, attempted: 1, sent: 0, failed: 1 });
		const response = await invoke('POST');
		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({
			status: 'pending',
			message: 'Your comment has been received and is awaiting approval.'
		});
		expect(mocks.submit).toHaveBeenCalledTimes(1);
		expect(mocks.dispatch).toHaveBeenCalledExactlyOnceWith(id);
	});
	it('rejects forged owner and moderation fields', async () => {
		for (const extra of [
			{ is_author: true },
			{ status: 'approved' },
			{ owner: true },
			{ email: 'private@example.com' }
		])
			expect((await invoke('POST', JSON.stringify({ ...payload, ...extra }))).status).toBe(400);
		expect(mocks.submit).not.toHaveBeenCalled();
		expect(mocks.dispatch).not.toHaveBeenCalled();
	});
	it('requires the exact origin even if a spoofed fetch-site header says same-origin', async () => {
		expect(
			(
				await invoke('POST', '{}', '', {
					origin: 'https://evil.example',
					'sec-fetch-site': 'same-origin'
				})
			).status
		).toBe(403);
		expect((await invoke('POST', '{}', '', { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
		expect((await invoke('POST', '{}', '', { origin: 'null' })).status).toBe(403);
		expect(mocks.submit).not.toHaveBeenCalled();
	});
	it('bounds actual streamed bytes rather than trusting Content-Length', async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(17_000));
				controller.close();
			}
		});
		expect((await invoke('POST', stream, '', { 'content-length': '2' })).status).toBe(413);
		expect(mocks.submit).not.toHaveBeenCalled();
	});
	it('cancels a stalled submission body', async () => {
		const { POST } = await import('./+server');
		vi.useFakeTimers();
		const cancel = vi.fn();
		const url = new URL('https://www.suvroghosh.in/api/comments');
		const request = new Request(url, {
			method: 'POST',
			headers: { origin: url.origin, 'content-type': 'application/json' },
			body: new ReadableStream({ cancel }),
			duplex: 'half'
		} as RequestInit);
		const pending = POST({
			request,
			url,
			getClientAddress: () => 'stalled'
		} as Parameters<RequestHandler>[0]);
		await vi.advanceTimersByTimeAsync(3100);
		expect(((await pending) as Response).status).toBe(408);
		expect(cancel).toHaveBeenCalled();
	});
	it('validates content type, malformed JSON, lengths, parent IDs and honeypot', async () => {
		expect((await invoke('POST', '{}', '', { 'content-type': 'text/plain' })).status).toBe(415);
		expect((await invoke('POST', '{')).status).toBe(400);
		for (const extra of [
			{ name: ' ' },
			{ name: 'x'.repeat(61) },
			{ body: 'x'.repeat(3001) },
			{ body: '\u0000' },
			{ parentId: 'bad' },
			{ website: 'spam' }
		])
			expect((await invoke('POST', JSON.stringify({ ...payload, ...extra }))).status).toBe(400);
		expect(mocks.submit).not.toHaveBeenCalled();
	});
	it('maps durable rate limits and concurrent hidden-parent changes to safe responses', async () => {
		mocks.submit.mockResolvedValueOnce('rate_limited');
		const limited = await invoke('POST');
		expect(limited.status).toBe(429);
		expect(limited.headers.get('retry-after')).toBe('600');
		mocks.submit.mockResolvedValueOnce('invalid_parent');
		expect((await invoke('POST')).status).toBe(409);
		expect(mocks.dispatch).not.toHaveBeenCalled();
	});
	it('does not start email delivery when comment persistence fails', async () => {
		mocks.submit.mockRejectedValueOnce(new Error('private storage failure'));
		expect((await invoke('POST')).status).toBe(503);
		expect(mocks.dispatch).not.toHaveBeenCalled();
	});
	it('never exposes provider secrets when storage fails', async () => {
		mocks.list.mockRejectedValue(new Error('connection contains PRIVATE_SECRET'));
		const response = await invoke('GET');
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('PRIVATE_SECRET');
		expect(response.headers.get('cache-control')).toContain('no-store');
	});
	it('validates public pagination and thread selectors before querying', async () => {
		for (const query of [
			'?post=../private',
			'?post=test-article&page=0',
			'?post=test-article&page=5001',
			'?post=test-article&parent=bad'
		])
			expect((await invoke('GET', '', query)).status).toBe(400);
		expect(mocks.list).not.toHaveBeenCalled();
		expect((await invoke('GET', '', `?post=test-article&page=2&parent=${id}`)).status).toBe(200);
		expect(mocks.list).toHaveBeenCalledWith('test-article', id, 2);
	});
	it('bounds repeated read requests', async () => {
		for (let n = 0; n < 60; n++) expect((await invoke('GET')).status).toBe(200);
		expect((await invoke('GET')).status).toBe(429);
		expect(mocks.list).toHaveBeenCalledTimes(60);
		expect(mocks.dispatch).not.toHaveBeenCalled();
	});
});
