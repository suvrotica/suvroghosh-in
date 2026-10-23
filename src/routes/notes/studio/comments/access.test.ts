import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocked = vi.hoisted(() => ({
	configured: vi.fn(),
	resolveUser: vi.fn(),
	env: { NOTES_OWNER_USER_ID: 'owner' } as Record<string, string>
}));

vi.mock('$env/dynamic/private', () => ({ env: mocked.env }));
vi.mock('$lib/server/notes/supabase', () => ({
	notesBackendConfigured: mocked.configured,
	resolveNotesUser: mocked.resolveUser,
	createNotesServerClient: vi.fn()
}));

function event(userId: string | null) {
	const url = new URL('https://suvroghosh.in/notes/studio/comments');
	return {
		url,
		request: new Request(url),
		locals: {
			user: userId ? { id: userId } : null,
			supabase: { auth: { signOut: vi.fn() } }
		},
		setHeaders: vi.fn()
	} as unknown as RequestEvent;
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocked.env.NOTES_OWNER_USER_ID = 'owner';
	mocked.configured.mockReturnValue(true);
	mocked.resolveUser.mockResolvedValue(null);
});

describe('comments moderation page access', () => {
	it('independently redirects readers to the existing owner sign-in', async () => {
		const { load } = await import('./+page.server');
		await expect(load(event(null) as Parameters<typeof load>[0])).rejects.toMatchObject({
			status: 303,
			location: '/notes/sign-in?returnTo=%2Fnotes%2Fstudio%2Fcomments'
		});
	});

	it('rejects authenticated users who are not the configured owner', async () => {
		const { load } = await import('./+page.server');
		const request = event('other');
		await expect(load(request as Parameters<typeof load>[0])).rejects.toMatchObject({
			status: 404
		});
		expect(request.locals.supabase?.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
	});

	it('fails closed when the owner backend is not configured', async () => {
		const { load } = await import('./+page.server');
		mocked.configured.mockReturnValue(false);
		await expect(load(event('owner') as Parameters<typeof load>[0])).rejects.toMatchObject({
			status: 503
		});
	});

	it('returns no private comment data in page load payloads', async () => {
		const { load } = await import('./+page.server');
		await expect(load(event('owner') as Parameters<typeof load>[0])).resolves.toEqual({});
	});
});
