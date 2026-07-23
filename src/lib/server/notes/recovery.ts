import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

export const NOTES_RECOVERY_PATH = '/notes/reset-password';

const CANONICAL_NOTES_RECOVERY_URL = `https://www.suvroghosh.in${NOTES_RECOVERY_PATH}`;
const RECOVERY_TOKEN_COOKIE = 'notes-recovery-token';
const RECOVERY_GRANT_COOKIE = 'notes-recovery-grant';
const RECOVERY_COOKIE_PATH = NOTES_RECOVERY_PATH;
const RECOVERY_GRANT_SECONDS = 10 * 60;
const RECOVERY_TOKEN_SECONDS = 10 * 60;
const encoder = new TextEncoder();
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

type RecoveryGrant = {
	v: 1;
	sub: string;
	iat: number;
	exp: number;
	nonce: string;
};

function cookieOptions(event: RequestEvent, maxAge: number) {
	return {
		path: RECOVERY_COOKIE_PATH,
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: !LOCAL_HOSTS.has(event.url.hostname),
		maxAge
	};
}

function base64UrlEncode(value: string | Uint8Array) {
	return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string) {
	return Buffer.from(value, 'base64url');
}

async function recoverySigningKey(secret: string) {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(`notes-password-recovery:${secret}`),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

export function normaliseRecoveryEmail(value: FormDataEntryValue | string | null) {
	return (typeof value === 'string' ? value : '').trim().toLowerCase().slice(0, 321);
}

export function isValidRecoveryEmail(email: string) {
	return (
		email.length >= 3 &&
		email.length <= 320 &&
		!/\s/.test(email) &&
		/^[^@]+@[^@]+\.[^@]+$/.test(email)
	);
}

export function isValidRecoveryTokenHash(value: string | null) {
	return Boolean(
		value && value.length >= 32 && value.length <= 512 && /^[a-z0-9_-]+$/i.test(value)
	);
}

export function validateRecoveryPassword(password: string, confirmation: string) {
	if (password.length < 12) return 'Use at least 12 characters for the new password.';
	if (password.length > 128) return 'Use no more than 128 characters for the new password.';
	if (password !== confirmation) return 'The two password entries do not match.';
	return null;
}

export function safeStudioReturnTo(value: FormDataEntryValue | string | null) {
	const requested = typeof value === 'string' ? value : '';
	try {
		const parsed = new URL(requested, 'https://notes-return.invalid');
		const isLocal = parsed.origin === 'https://notes-return.invalid';
		const isStudio =
			parsed.pathname === '/notes/studio' || parsed.pathname.startsWith('/notes/studio/');
		return isLocal && isStudio ? `${parsed.pathname}${parsed.search}` : '/notes/studio';
	} catch {
		return '/notes/studio';
	}
}

export function notesRecoveryRedirectUrl(requestUrl: URL) {
	if (LOCAL_HOSTS.has(requestUrl.hostname)) {
		return new URL(NOTES_RECOVERY_PATH, requestUrl.origin).toString();
	}
	return CANONICAL_NOTES_RECOVERY_URL;
}

export async function createRecoveryGrant(
	userId: string,
	secret: string,
	now = Date.now(),
	nonce: string = crypto.randomUUID()
) {
	if (!userId || secret.length < 32) return null;
	const issuedAt = Math.floor(now / 1_000);
	const grant: RecoveryGrant = {
		v: 1,
		sub: userId,
		iat: issuedAt,
		exp: issuedAt + RECOVERY_GRANT_SECONDS,
		nonce
	};
	const payload = base64UrlEncode(JSON.stringify(grant));
	const signature = await crypto.subtle.sign(
		'HMAC',
		await recoverySigningKey(secret),
		encoder.encode(payload)
	);
	return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyRecoveryGrant(
	value: string | null,
	userId: string,
	secret: string,
	now = Date.now()
) {
	if (!value || !userId || secret.length < 32) return false;
	const parts = value.split('.');
	if (parts.length !== 2 || !parts[0] || !parts[1]) return false;

	try {
		const validSignature = await crypto.subtle.verify(
			'HMAC',
			await recoverySigningKey(secret),
			base64UrlDecode(parts[1]),
			encoder.encode(parts[0])
		);
		if (!validSignature) return false;
		const parsed = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as Partial<RecoveryGrant>;
		const currentTime = Math.floor(now / 1_000);
		return (
			parsed.v === 1 &&
			parsed.sub === userId &&
			typeof parsed.iat === 'number' &&
			typeof parsed.exp === 'number' &&
			typeof parsed.nonce === 'string' &&
			parsed.nonce.length > 0 &&
			parsed.iat <= currentTime + 60 &&
			parsed.exp === parsed.iat + RECOVERY_GRANT_SECONDS &&
			parsed.exp > currentTime
		);
	} catch {
		return false;
	}
}

export function rememberRecoveryToken(event: RequestEvent, tokenHash: string) {
	event.cookies.set(RECOVERY_TOKEN_COOKIE, tokenHash, cookieOptions(event, RECOVERY_TOKEN_SECONDS));
}

export function readRecoveryToken(event: RequestEvent) {
	const value = event.cookies.get(RECOVERY_TOKEN_COOKIE) ?? null;
	return isValidRecoveryTokenHash(value) ? value : null;
}

export function clearRecoveryToken(event: RequestEvent) {
	event.cookies.delete(RECOVERY_TOKEN_COOKIE, cookieOptions(event, 0));
}

export async function rememberRecoveryGrant(event: RequestEvent, userId: string) {
	const grant = await createRecoveryGrant(userId, env.NOTES_RATE_LIMIT_SALT ?? '');
	if (!grant) return false;
	event.cookies.set(RECOVERY_GRANT_COOKIE, grant, cookieOptions(event, RECOVERY_GRANT_SECONDS));
	return true;
}

export async function hasRecoveryGrant(event: RequestEvent, userId: string) {
	return verifyRecoveryGrant(
		event.cookies.get(RECOVERY_GRANT_COOKIE) ?? null,
		userId,
		env.NOTES_RATE_LIMIT_SALT ?? ''
	);
}

export function clearRecoveryGrant(event: RequestEvent) {
	event.cookies.delete(RECOVERY_GRANT_COOKIE, cookieOptions(event, 0));
}
