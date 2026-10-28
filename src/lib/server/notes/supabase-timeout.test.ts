import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocked = vi.hoisted(() => ({ createServerClient: vi.fn(), getUser: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({
	env: { SUPABASE_URL: 'https://db.example.test', SUPABASE_PUBLISHABLE_KEY: 'test-key' }
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocked.createServerClient }));
import { resolveNotesUser } from './supabase';

const event = () =>
	({
		url: new URL('https://www.suvroghosh.in/notes/studio/analytics'),
		locals: { user: null, supabase: null, supabaseResponseHeaders: {} },
		cookies: { getAll: () => [], set: vi.fn() }
	}) as unknown as RequestEvent;

describe('owner identity lookup deadline', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});
	it('aborts a stalled auth lookup after five seconds', async () => {
		vi.useFakeTimers();
		let requestSignal: AbortSignal | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_input, init) =>
					new Promise((_resolve, reject) => {
						requestSignal = init.signal;
						init.signal.addEventListener('abort', () => reject(new Error('aborted')), {
							once: true
						});
					})
			)
		);
		mocked.createServerClient.mockImplementation((_url, _key, options) => ({
			auth: { getUser: () => options.global.fetch('https://db.example.test/auth/v1/user') }
		}));
		const lookup = resolveNotesUser(event());
		const failure = expect(lookup).rejects.toMatchObject({ kind: 'timeout' });
		await vi.advanceTimersByTimeAsync(5000);
		await failure;
		expect(requestSignal?.aborted).toBe(true);
	});
	it('preserves the verified user and independent downstream cancellation after success', async () => {
		vi.useFakeTimers();
		const user = { id: 'owner' };
		mocked.getUser.mockResolvedValue({ data: { user }, error: null });
		mocked.createServerClient.mockReturnValue({ auth: { getUser: mocked.getUser } });
		const current = event();
		expect(await resolveNotesUser(current)).toEqual(user);
		expect(current.locals.user).toEqual(user);
		const fetcher = vi.fn().mockResolvedValue(new Response());
		vi.stubGlobal('fetch', fetcher);
		const configuredFetch = mocked.createServerClient.mock.calls[0][2].global.fetch;
		await vi.advanceTimersByTimeAsync(6000);
		await configuredFetch('https://db.example.test/rest/v1/notes');
		expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
		const controller = new AbortController();
		controller.abort();
		await expect(
			configuredFetch('https://db.example.test/rest/v1/notes', { signal: controller.signal })
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
});
