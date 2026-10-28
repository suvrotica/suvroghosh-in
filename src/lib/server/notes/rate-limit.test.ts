import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocked = vi.hoisted(() => ({
	env: { NOTES_RATE_LIMIT_SALT: 'test-only-not-a-secret'.repeat(2) },
	rpc: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({ env: mocked.env }));
vi.mock('./supabase', () => ({ createNotesAdminClient: () => ({ rpc: mocked.rpc }) }));
import { consumeOwnerRecoveryLimit, consumeOwnerSignInLimit } from './rate-limit';

const event = (address = '192.0.2.1') => ({ getClientAddress: () => address }) as RequestEvent;
beforeEach(() => {
	mocked.env.NOTES_RATE_LIMIT_SALT = 'test-only-not-a-secret'.repeat(2);
	mocked.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

describe('owner authentication admission', () => {
	it.each(['', 'too-short'])(
		'fails closed before database work when the salt is %j',
		async (salt) => {
			mocked.env.NOTES_RATE_LIMIT_SALT = salt;
			expect(await consumeOwnerSignInLimit(event(), 'owner@example.test')).toMatchObject({
				configured: false,
				allowed: false
			});
			expect(await consumeOwnerRecoveryLimit(event(), 'owner@example.test')).toMatchObject({
				configured: false,
				allowed: false
			});
			expect(mocked.rpc).not.toHaveBeenCalled();
		}
	);

	it('fails closed if either durable admission check fails or denies the attempt', async () => {
		mocked.rpc
			.mockResolvedValueOnce({ data: true, error: null })
			.mockResolvedValueOnce({ data: null, error: { message: 'Unavailable' } });
		expect(await consumeOwnerSignInLimit(event(), 'owner@example.test')).toMatchObject({
			configured: false,
			allowed: false
		});
		mocked.rpc
			.mockResolvedValueOnce({ data: true, error: null })
			.mockResolvedValueOnce({ data: false, error: null });
		expect(await consumeOwnerSignInLimit(event(), 'owner@example.test')).toMatchObject({
			configured: true,
			allowed: false
		});
	});

	it('normalizes the email and stores only opaque keys while retaining the no-global-lockout policy', async () => {
		const first = await consumeOwnerSignInLimit(event(), ' OWNER@EXAMPLE.TEST ');
		const normalized = await consumeOwnerSignInLimit(event(), 'owner@example.test');
		const anotherAddress = await consumeOwnerSignInLimit(event('192.0.2.2'), 'owner@example.test');
		expect(first.accountKey).toMatch(/^[0-9a-f]{64}$/);
		expect(first.accountKey).toBe(normalized.accountKey);
		expect(first.accountKey).not.toBe(anotherAddress.accountKey);
		for (const [, args] of mocked.rpc.mock.calls) {
			expect(args.p_key_hash).toMatch(/^[0-9a-f]{64}$/);
			expect(JSON.stringify(args)).not.toContain('owner@example.test');
		}
	});
});
