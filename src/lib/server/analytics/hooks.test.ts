import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
vi.mock('$lib/server/notes/supabase', () => ({
	resolveNotesUser: vi.fn().mockRejectedValue(new Error('provider unavailable'))
}));
import { handle } from '../../../hooks.server';

describe('private workspace authentication failure', () => {
	it('returns private no-store errors before the report or export can run', async () => {
		for (const path of ['/notes/studio/analytics', '/notes/studio/analytics/export']) {
			const resolve = vi.fn();
			const response = await handle({
				event: { url: new URL(`https://www.suvroghosh.in${path}`), locals: {} } as RequestEvent,
				resolve
			} as unknown as Parameters<typeof handle>[0]);
			expect(response.status).toBe(503);
			expect(response.headers.get('cache-control')).toContain('no-store');
			expect(response.headers.get('x-robots-tag')).toContain('noindex');
			expect(resolve).not.toHaveBeenCalled();
		}
	});
});
