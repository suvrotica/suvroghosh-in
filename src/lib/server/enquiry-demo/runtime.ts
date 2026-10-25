import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Cookies } from '@sveltejs/kit';
import { EnquiryStore } from './store';

const COOKIE = 'enquiry_demo_staff';
const SESSION_MS = 8 * 60 * 60 * 1000;
const stores = new Map<string, EnquiryStore>();
const authStores = new Map<string, DatabaseSync>();
const digest = (value: string) => createHash('sha256').update(value).digest();

export function demoEnabled(url: URL): boolean {
	return (
		process.env.ENQUIRY_DEMO_ENABLED === '1' &&
		!process.env.VERCEL &&
		['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
	);
}

export function databasePath(): string {
	return resolve(process.env.ENQUIRY_DEMO_DB || '.data/enquiry-demo/enquiries.sqlite');
}

export function demoStore(): EnquiryStore {
	const path = databasePath();
	let store = stores.get(path);
	if (!store) {
		mkdirSync(dirname(path), { recursive: true });
		store = new EnquiryStore(path);
		store.seed();
		stores.set(path, store);
	}
	return store;
}

function authStore(): DatabaseSync {
	const path = `${databasePath()}.auth.sqlite`;
	let db = authStores.get(path);
	if (!db) {
		mkdirSync(dirname(path), { recursive: true });
		db = new DatabaseSync(path);
		db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
			CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)`);
		authStores.set(path, db);
	}
	return db;
}

function configuredPassword(): string | null {
	if (process.env.ENQUIRY_DEMO_PASSWORD) {
		return process.env.ENQUIRY_DEMO_PASSWORD.length >= 16
			? process.env.ENQUIRY_DEMO_PASSWORD
			: null;
	}
	try {
		const value: unknown = JSON.parse(
			readFileSync(resolve('.data/enquiry-demo/access.json'), 'utf8')
		);
		if (
			value &&
			typeof value === 'object' &&
			'password' in value &&
			typeof value.password === 'string' &&
			value.password.length >= 16
		)
			return value.password;
	} catch {
		/* Setup has not been run. Authentication fails closed. */
	}
	return null;
}

export function authenticated(cookies: Cookies): boolean {
	const token = cookies.get(COOKIE);
	if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
	const db = authStore();
	db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
	return Boolean(
		db
			.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires > ?')
			.get(digest(token).toString('hex'), Date.now())
	);
}

export function login(password: unknown, cookies: Cookies, secure: boolean): boolean {
	const expected = configuredPassword();
	if (
		!expected ||
		typeof password !== 'string' ||
		password.length > 256 ||
		!timingSafeEqual(digest(password), digest(expected))
	)
		return false;
	const db = authStore();
	db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
	const oldToken = cookies.get(COOKIE);
	if (oldToken)
		db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(oldToken).toString('hex'));
	const token = randomBytes(32).toString('hex');
	db.prepare('INSERT INTO sessions (token_hash, expires) VALUES (?, ?)').run(
		digest(token).toString('hex'),
		Date.now() + SESSION_MS
	);
	cookies.set(COOKIE, token, {
		path: '/demos/customer-enquiries',
		httpOnly: true,
		sameSite: 'strict',
		secure,
		maxAge: SESSION_MS / 1000
	});
	return true;
}

export function logout(cookies: Cookies): void {
	const token = cookies.get(COOKIE);
	if (token)
		authStore()
			.prepare('DELETE FROM sessions WHERE token_hash = ?')
			.run(digest(token).toString('hex'));
	cookies.delete(COOKIE, { path: '/demos/customer-enquiries' });
}
