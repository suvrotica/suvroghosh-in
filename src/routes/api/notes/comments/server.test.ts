import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from '@sveltejs/kit';
const mocks = vi.hoisted(() => ({
	queue: vi.fn(),
	counts: vi.fn(),
	moderate: vi.fn(),
	reply: vi.fn(),
	configured: vi.fn(),
	resolve: vi.fn(),
	env: { NOTES_OWNER_USER_ID: 'owner' }
}));
vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/server/notes/supabase', () => ({
	notesBackendConfigured: mocks.configured,
	resolveNotesUser: mocks.resolve,
	createNotesServerClient: vi.fn()
}));
vi.mock('$lib/server/comments/repository', () => ({
	moderationQueue: mocks.queue,
	moderationCounts: mocks.counts,
	moderateComment: mocks.moderate,
	replyToComment: mocks.reply
}));
const id = '10000000-0000-4000-8000-000000000001';
async function invoke(
	user: string | null = 'owner',
	method: 'GET' | 'POST' = 'GET',
	payload: unknown = {},
	query = '',
	origin = 'https://www.suvroghosh.in'
) {
	const { GET, POST } = await import('./+server');
	const url = new URL(`https://www.suvroghosh.in/api/notes/comments${query}`);
	const request = new Request(url, {
		method,
		headers: { origin, 'content-type': 'application/json' },
		...(method === 'POST' ? { body: JSON.stringify(payload) } : {})
	});
	const event = {
		request,
		url,
		locals: { user: user ? { id: user } : null, supabase: { auth: { signOut: vi.fn() } } }
	} as unknown as Parameters<RequestHandler>[0];
	return (await (method === 'POST' ? POST : GET)(event)) as Response;
}
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.configured.mockReturnValue(true);
	mocks.resolve.mockResolvedValue(null);
	mocks.queue.mockResolvedValue({
		comments: [],
		total: 0,
		pending: 2,
		unread: 3,
		page: 1,
		pageSize: 20,
		articles: []
	});
	mocks.counts.mockResolvedValue({ pending: 2, unread: 3 });
	mocks.moderate.mockResolvedValue('updated');
	mocks.reply.mockResolvedValue('approved');
});
describe('configured-owner moderation boundary', () => {
	it('admits simultaneous badge and queue refreshes for the same owner', async () => {
		let release: () => void = () => {};
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		mocks.counts.mockImplementation(async () => {
			await pending;
			return { pending: 2, unread: 3 };
		});
		mocks.queue.mockImplementation(async () => {
			await pending;
			return { comments: [], total: 0, page: 1, pending: 2, unread: 3 };
		});
		const counts = invoke('owner', 'GET', {}, '?counts=1');
		const queue = invoke('owner', 'GET', {}, '?status=pending');
		await vi.waitFor(() => expect(mocks.queue).toHaveBeenCalled());
		release();
		expect((await counts).status).toBe(200);
		expect((await queue).status).toBe(200);
	});
	it.each([
		[null, 401],
		['other', 404]
	] as const)('rejects %s on every read and mutation', async (user, status) => {
		for (const query of ['', '?counts=1', '?session=1', '?export=1']) {
			const response = await invoke(user, 'GET', {}, query);
			expect(response.status).toBe(status);
			expect(response.headers.get('cache-control')).toContain('private');
			expect(response.headers.get('x-robots-tag')).toContain('noindex');
		}
		expect(
			(await invoke(user, 'POST', { action: 'moderate', id, status: 'approved' })).status
		).toBe(status);
		expect(mocks.queue).not.toHaveBeenCalled();
		expect(mocks.moderate).not.toHaveBeenCalled();
		expect(mocks.counts).not.toHaveBeenCalled();
	});
	it('serves counts and bounded page exports only to the owner', async () => {
		expect(await (await invoke('owner', 'GET', {}, '?counts=1')).json()).toEqual({
			pending: 2,
			unread: 3
		});
		const response = await invoke('owner', 'GET', {}, '?export=1&status=hidden&page=2');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-disposition')).toContain('attachment');
		expect(mocks.queue.mock.calls[0].slice(1)).toEqual(['hidden', null, 2]);
	});
	it('keeps moderation and author roles server-controlled', async () => {
		expect(
			(await invoke('owner', 'POST', { action: 'moderate', id, status: 'approved' })).status
		).toBe(200);
		expect(mocks.moderate.mock.calls[0].slice(1)).toEqual([id, 'approved']);
		expect(
			(
				await invoke('owner', 'POST', {
					action: 'reply',
					parentId: id,
					body: 'Thanks!',
					submissionId: id
				})
			).status
		).toBe(200);
		expect(mocks.reply.mock.calls[0].slice(1)).toEqual([id, 'Thanks!', id]);
		expect(
			(
				await invoke('owner', 'POST', {
					action: 'reply',
					parentId: id,
					body: 'Thanks!',
					submissionId: id,
					is_author: true
				})
			).status
		).toBe(400);
	});
	it('rejects cross-site moderation and malformed filters', async () => {
		expect(
			(await invoke('owner', 'POST', { action: 'read', id }, '', 'https://evil.example')).status
		).toBe(403);
		for (const query of ['?status=deleted', '?page=-1', '?post=../private'])
			expect((await invoke('owner', 'GET', {}, query)).status).toBe(400);
		expect(mocks.moderate).not.toHaveBeenCalled();
		expect(mocks.queue).not.toHaveBeenCalled();
	});
	it('reports reply conflicts and missing comments without publishing success', async () => {
		mocks.reply.mockResolvedValue('invalid_parent');
		expect(
			(
				await invoke('owner', 'POST', {
					action: 'reply',
					parentId: id,
					body: 'Thanks',
					submissionId: id
				})
			).status
		).toBe(409);
		mocks.moderate.mockResolvedValue('not_found');
		expect((await invoke('owner', 'POST', { action: 'read', id })).status).toBe(404);
	});
	it('does not leak storage errors into private exports', async () => {
		mocks.queue.mockRejectedValue(new Error('SECRET_DATABASE_VALUE'));
		const response = await invoke('owner', 'GET', {}, '?export=1');
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('SECRET_DATABASE_VALUE');
	});
});
