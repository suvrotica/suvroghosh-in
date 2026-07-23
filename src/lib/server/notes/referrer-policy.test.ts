import { describe, expect, it } from 'vitest';
import { notesAuthReferrerPolicy } from './referrer-policy';

describe('notes auth referrer policy', () => {
	it('hides the referrer while a recovery token remains in the URL', () => {
		expect(
			notesAuthReferrerPolicy(
				new URL(`https://www.suvroghosh.in/notes/reset-password?token_hash=${'a'.repeat(64)}`)
			)
		).toBe('no-referrer');
	});

	it('hides the referrer on the auth callback route', () => {
		expect(
			notesAuthReferrerPolicy(
				new URL('https://www.suvroghosh.in/notes/auth?code=temporary-auth-code')
			)
		).toBe('no-referrer');
	});

	it.each([
		'/notes/sign-in',
		'/notes/forgot-password',
		'/notes/reset-password',
		'/notes/reset-password?invalid=1'
	])('allows same-origin form metadata on clean auth page %s', (pathname) => {
		expect(notesAuthReferrerPolicy(new URL(pathname, 'https://www.suvroghosh.in'))).toBe(
			'same-origin'
		);
	});
});
