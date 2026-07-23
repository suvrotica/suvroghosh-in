import { describe, expect, it } from 'vitest';
import {
	createRecoveryGrant,
	isValidRecoveryEmail,
	isValidRecoveryTokenHash,
	normaliseRecoveryEmail,
	notesRecoveryRedirectUrl,
	safeStudioReturnTo,
	validateRecoveryPassword,
	verifyRecoveryGrant
} from './recovery';

describe('notes password recovery input handling', () => {
	it('normalises owner email without accepting oversized values', () => {
		expect(normaliseRecoveryEmail('  Owner@Example.COM  ')).toBe('owner@example.com');
		const oversized = normaliseRecoveryEmail(`${'a'.repeat(310)}@example.com`);
		expect(oversized).toHaveLength(321);
		expect(isValidRecoveryEmail(oversized)).toBe(false);
	});

	it.each(['owner@example.com', 'first.last+notes@example.co.uk'])(
		'accepts a syntactically valid email: %s',
		(email) => {
			expect(isValidRecoveryEmail(email)).toBe(true);
		}
	);

	it.each(['', 'owner', '@example.com', 'owner@localhost', 'owner @example.com'])(
		'rejects a malformed email: %s',
		(email) => {
			expect(isValidRecoveryEmail(email)).toBe(false);
		}
	);

	it('accepts only bounded URL-safe token hashes', () => {
		expect(isValidRecoveryTokenHash('a'.repeat(64))).toBe(true);
		expect(isValidRecoveryTokenHash('a'.repeat(31))).toBe(false);
		expect(isValidRecoveryTokenHash('a'.repeat(513))).toBe(false);
		expect(isValidRecoveryTokenHash(`${'a'.repeat(63)}.`)).toBe(false);
		expect(isValidRecoveryTokenHash(null)).toBe(false);
	});

	it('requires matching passwords between 12 and 128 characters', () => {
		expect(validateRecoveryPassword('short', 'short')).toContain('12');
		expect(validateRecoveryPassword('a'.repeat(129), 'a'.repeat(129))).toContain('128');
		expect(validateRecoveryPassword('correct horse', 'different passphrase')).toContain('match');
		expect(validateRecoveryPassword('correct horse', 'correct horse')).toBeNull();
	});

	it('allows only the studio route as a post-login destination', () => {
		expect(safeStudioReturnTo('/notes/studio')).toBe('/notes/studio');
		expect(safeStudioReturnTo('/notes/studio/123?mode=edit')).toBe('/notes/studio/123?mode=edit');
		expect(safeStudioReturnTo('/notes/studioevil')).toBe('/notes/studio');
		expect(safeStudioReturnTo('//evil.example/notes/studio')).toBe('/notes/studio');
		expect(safeStudioReturnTo('https://evil.example/notes/studio')).toBe('/notes/studio');
	});

	it('uses a fixed production reset destination and permits explicit localhost development', () => {
		expect(notesRecoveryRedirectUrl(new URL('https://host-header.example/request'))).toBe(
			'https://www.suvroghosh.in/notes/reset-password'
		);
		expect(notesRecoveryRedirectUrl(new URL('http://localhost:5173/request'))).toBe(
			'http://localhost:5173/notes/reset-password'
		);
	});
});

describe('notes password recovery grant', () => {
	const ownerId = '00000000-0000-0000-0000-000000000001';
	const secret = 'a'.repeat(64);
	const now = Date.UTC(2026, 6, 23, 12);

	it('accepts a signed grant for the exact owner before expiry', async () => {
		const grant = await createRecoveryGrant(ownerId, secret, now, 'test-nonce');
		expect(grant).not.toBeNull();
		expect(await verifyRecoveryGrant(grant, ownerId, secret, now + 9 * 60 * 1_000)).toBe(true);
	});

	it('rejects expired, wrong-owner, wrong-secret, and tampered grants', async () => {
		const grant = await createRecoveryGrant(ownerId, secret, now, 'test-nonce');
		expect(grant).not.toBeNull();
		expect(await verifyRecoveryGrant(grant, ownerId, secret, now + 10 * 60 * 1_000)).toBe(false);
		expect(await verifyRecoveryGrant(grant, crypto.randomUUID(), secret, now)).toBe(false);
		expect(await verifyRecoveryGrant(grant, ownerId, 'b'.repeat(64), now)).toBe(false);
		expect(await verifyRecoveryGrant(`${grant}x`, ownerId, secret, now)).toBe(false);
	});

	it('refuses to issue or verify grants with a short secret', async () => {
		expect(await createRecoveryGrant(ownerId, 'too-short', now)).toBeNull();
		expect(await verifyRecoveryGrant('anything', ownerId, 'too-short', now)).toBe(false);
	});
});
