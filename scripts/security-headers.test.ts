import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const auth = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('$lib/server/notes/supabase', () => ({ resolveNotesUser: auth.resolve }));
import { handle } from '../src/hooks.server';

function request(path: string) {
	return { url: new URL(`https://www.suvroghosh.in${path}`), locals: {} } as RequestEvent;
}

beforeEach(() => {
	auth.resolve.mockReset();
});

describe('security response boundaries', () => {
	it.each(['//attacker.example', '//attacker.example/notes/studio'])(
		'rejects authority-like paths before routing: %s',
		async (path) => {
			const resolve = vi.fn(async () => new Response('routed'));
			const response = await handle({ event: request(path), resolve } as Parameters<
				typeof handle
			>[0]);
			expect(response.status).toBe(400);
			expect(response.headers.get('cache-control')).toContain('no-store');
			expect(response.headers.get('x-content-type-options')).toBe('nosniff');
			expect(resolve).not.toHaveBeenCalled();
			expect(auth.resolve).not.toHaveBeenCalled();
		}
	);

	it.each([
		'/notes/studio',
		'/notes/sign-in',
		'/notes/forgot-password',
		'/notes/reset-password',
		'/notes/auth/callback',
		'/api/notes/id/document',
		'/api/comments/moderate',
		'/api/prompt-atlas'
	])('keeps %s private even when its handler supplies a public cache header', async (path) => {
		const response = await handle({
			event: request(path),
			resolve: async () =>
				new Response('private', { headers: { 'cache-control': 'public, max-age=3600' } })
		} as Parameters<typeof handle>[0]);
		expect(response.headers.get('cache-control')).toContain('private');
		expect(response.headers.get('cache-control')).toContain('no-store');
		expect(response.headers.get('x-robots-tag')).toContain('noindex');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('x-frame-options')).toBe('DENY');
	});

	it.each(['/notes/studio', '/api/notes/id/assets', '/notes/sign-in'])(
		'fails closed when identity lookup fails for %s',
		async (path) => {
			auth.resolve.mockRejectedValue(new Error('sensitive provider detail'));
			const resolve = vi.fn();
			const response = await handle({ event: request(path), resolve } as unknown as Parameters<
				typeof handle
			>[0]);
			expect(response.status).toBe(503);
			expect(response.headers.get('cache-control')).toContain('no-store');
			expect(await response.text()).not.toContain('sensitive provider detail');
			expect(resolve).not.toHaveBeenCalled();
		}
	);

	it.each([
		'/blog/security/example',
		'/rss.xml',
		'/sitemap.xml',
		'/images/example.webp',
		'/notes/public-note'
	])('preserves public caching and crawlability for %s', async (path) => {
		const response = await handle({
			event: request(path),
			resolve: async () =>
				new Response('public', { headers: { 'cache-control': 'public, max-age=60' } })
		} as Parameters<typeof handle>[0]);
		expect(response.headers.get('cache-control')).toBe('public, max-age=60');
		expect(response.headers.get('x-robots-tag')).toBeNull();
		expect(auth.resolve).not.toHaveBeenCalled();
	});

	it('prevents moderation capability URLs from leaking a referrer', async () => {
		const response = await handle({
			event: request('/api/comments/moderate?token=fixture-secret'),
			resolve: async () => new Response('confirm')
		} as Parameters<typeof handle>[0]);
		expect(response.headers.get('referrer-policy')).toBe('no-referrer');
	});
});
