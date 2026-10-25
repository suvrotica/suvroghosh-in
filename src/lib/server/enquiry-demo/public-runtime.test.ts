import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Cookies, RequestEvent } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({ create: vi.fn(), read: vi.fn(), run: vi.fn() }));
vi.mock('./public-workspaces', () => ({
	STAFF_TTL_MS: 8 * 3_600_000,
	PublicWorkspaces: class {
		create = mocks.create;
		read = mocks.read;
		run = mocks.run;
	}
}));

import {
	publicModeEnabled,
	sandboxInfo,
	sessionHash,
	staffActive,
	startPublicSession,
	WORKSPACE_COOKIE
} from './public-runtime';
import type { PublicWorkspace } from './public-repository';

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv('VERCEL', '');
	vi.stubEnv('ENQUIRY_DEMO_PUBLIC_ENABLED', '1');
	vi.stubEnv('ENQUIRY_DEMO_ALLOW_TEST_BACKEND', '');
	vi.stubEnv('SUPABASE_URL', 'https://database.example');
	vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-server-key');
	vi.stubEnv('NOTES_RATE_LIMIT_SALT', 'test-only-rate-salt-with-at-least-thirty-two-characters');
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe('public visitor capabilities', () => {
	test('plain HTTP can be enabled only for a non-Vercel loopback test deployment', () => {
		expect(publicModeEnabled(new URL('https://demo.example/demos/customer-enquiries'))).toBe(true);
		expect(publicModeEnabled(new URL('http://demo.example/demos/customer-enquiries'))).toBe(false);
		expect(publicModeEnabled(new URL('http://127.0.0.1:4331/demos/customer-enquiries'))).toBe(
			false
		);
		vi.stubEnv('ENQUIRY_DEMO_ALLOW_TEST_BACKEND', '1');
		expect(publicModeEnabled(new URL('http://127.0.0.1:4331/demos/customer-enquiries'))).toBe(true);
		expect(publicModeEnabled(new URL('http://demo.example/demos/customer-enquiries'))).toBe(false);
		vi.stubEnv('VERCEL', '1');
		expect(publicModeEnabled(new URL('http://127.0.0.1:4331/demos/customer-enquiries'))).toBe(
			false
		);
		vi.stubEnv('ENQUIRY_DEMO_PUBLIC_ENABLED', '');
		expect(publicModeEnabled(new URL('https://demo.example/demos/customer-enquiries'))).toBe(false);
	});

	test('only a valid workspace cookie is hashed; a local staff cookie never grants public access', () => {
		const raw = 'a'.repeat(64);
		const cookies = {
			get: vi.fn((name: string) => (name === WORKSPACE_COOKIE ? raw : undefined))
		} as unknown as Cookies;
		expect(sessionHash(cookies)).toBe(createHash('sha256').update(raw).digest('hex'));
		expect(sessionHash(cookies)).not.toBe(raw);
		for (const value of [undefined, '', 'not-a-token', 'A'.repeat(64), 'a'.repeat(63)]) {
			const invalid = {
				get: (name: string) => (name === WORKSPACE_COOKIE ? value : raw)
			} as unknown as Cookies;
			expect(() => sessionHash(invalid)).toThrow();
		}
	});

	test('public sandbox metadata does not serialize the capability hash, snapshot or staff grant', () => {
		const row = {
			sessionHash: 'a'.repeat(64),
			scopeKey: '1'.repeat(64),
			expiresAt: '2026-10-27T09:00:00Z',
			staffUntil: '2026-10-26T17:00:00Z',
			version: 1,
			state: { private: 'server-only' },
			nextDueAt: null
		} as unknown as PublicWorkspace;
		expect(sandboxInfo(row)).toEqual({ scopeKey: row.scopeKey, expiresAt: row.expiresAt });
		vi.useFakeTimers();
		vi.setSystemTime(new Date(row.staffUntil!));
		expect(staffActive(row)).toBe(false);
	});

	test('new HTTPS sessions use a random HttpOnly secure capability and never return its value to JavaScript', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-26T09:00:00Z'));
		mocks.create.mockImplementation(async (hash: string, scope: string) => ({
			sessionHash: hash,
			scopeKey: scope,
			expiresAt: '2026-10-27T09:00:00Z',
			staffUntil: null
		}));
		const cookies = { get: vi.fn(() => undefined), set: vi.fn(), delete: vi.fn() };
		const event = {
			cookies,
			url: new URL('https://demo.example/demos/customer-enquiries/api'),
			getClientAddress: () => 'test-client'
		} as unknown as RequestEvent;
		const result = await startPublicSession(event);
		const [name, token, options] = cookies.set.mock.calls[0];
		expect(name).toBe(WORKSPACE_COOKIE);
		expect(token).toMatch(/^[a-f0-9]{64}$/);
		expect(options).toMatchObject({
			path: '/demos/customer-enquiries',
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 24 * 3600
		});
		expect(mocks.create.mock.calls[0][0]).toBe(createHash('sha256').update(token).digest('hex'));
		expect(JSON.stringify(result)).not.toContain(token);
		expect(result.authenticated).toBe(false);
	});
});
