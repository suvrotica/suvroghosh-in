import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
const mocks = vi.hoisted(() => ({
	rpc: vi.fn(),
	client: vi.fn(),
	ownerClient: vi.fn(),
	post: vi.fn(),
	env: { NOTES_RATE_LIMIT_SALT: 'comments-test-salt-at-least-thirty-two-characters' } as Record<
		string,
		string
	>
}));
vi.mock('$env/dynamic/private', () => ({ env: mocks.env }));
vi.mock('$lib/server/notes/supabase', () => ({ createNotesAdminClient: mocks.client }));
vi.mock('$lib/server/notes/auth', () => ({ getNotesClient: mocks.ownerClient }));
vi.mock('$lib/server/content/posts', () => ({
	getPublishedPost: mocks.post,
	getPublishedPosts: () => []
}));
beforeEach(() => {
	vi.clearAllMocks();
	mocks.env.NOTES_RATE_LIMIT_SALT = 'comments-test-salt-at-least-thirty-two-characters';
	mocks.client.mockReturnValue({ rpc: mocks.rpc });
	mocks.ownerClient.mockReturnValue({ rpc: mocks.rpc });
	mocks.post.mockReturnValue({ slug: 'article-one' });
	mocks.rpc.mockReturnValue({
		abortSignal: vi
			.fn()
			.mockResolvedValue({ data: { comments: [], total: 0, commentCount: 0 }, error: null })
	});
});
describe('comments persistence boundary', () => {
	it('rejects unpublished article identities before database access', async () => {
		const { listPublicComments } = await import('./repository');
		mocks.post.mockReturnValue(null);
		await expect(listPublicComments('unpublished', null, 1)).rejects.toMatchObject({ status: 404 });
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
	it('projects public fields so unexpected database metadata cannot leak', async () => {
		const { listPublicComments } = await import('./repository');
		const row = {
			id: 'id',
			parent_id: null,
			display_name: 'Reader',
			body: 'Published',
			is_author: false,
			created_at: '2026-10-23T00:00:00Z',
			reply_count: 0,
			status: 'approved',
			submission_id: 'private',
			read_at: 'private'
		};
		mocks.rpc.mockReturnValue({
			abortSignal: vi
				.fn()
				.mockResolvedValue({ data: { comments: [row], total: 1, commentCount: 1 }, error: null })
		});
		const result = await listPublicComments('article-one', null, 1);
		expect(result.comments[0]).not.toHaveProperty('status');
		expect(JSON.stringify(result)).not.toContain('private');
	});
	it('uses rotating HMAC abuse keys without storing the client address', async () => {
		const { commentRateKey } = await import('./repository');
		const event = { getClientAddress: () => 'private-test-address' } as unknown as RequestEvent;
		const result = await commentRateKey(event);
		expect(result).toMatch(/^[a-f0-9]{64}$/);
		expect(result).not.toContain('private-test-address');
		mocks.env.NOTES_RATE_LIMIT_SALT = '';
		await expect(commentRateKey(event)).rejects.toMatchObject({ status: 503 });
	});
	it('maps database conflicts without exposing database messages', async () => {
		const { commentsRpc } = await import('./repository');
		mocks.rpc.mockReturnValue({
			abortSignal: vi
				.fn()
				.mockResolvedValue({ error: { code: '23505', message: 'SECRET' }, data: null })
		});
		await expect(
			commentsRpc({ rpc: mocks.rpc } as never, 'reply_to_post_comment')
		).rejects.toMatchObject({ status: 409 });
	});
});
