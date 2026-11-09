import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import * as client from 'openid-client';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { RadioUser } from '$lib/radio/types';
import { getRadioServerConfig, isLoopbackHostname } from './config';

const SESSION_COOKIE_NAME = 'comm_link_session';
const OIDC_FLOW_COOKIE_NAME = 'comm_link_oidc_flow';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const OIDC_FLOW_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

function base64UrlEncode(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64url');
}

function base64UrlDecode(str: string): Uint8Array {
	return new Uint8Array(Buffer.from(str, 'base64url'));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
	const enc = new TextEncoder();
	return crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

async function signPayload(payload: unknown, secret: string): Promise<string> {
	const json = JSON.stringify(payload);
	const bodyB64 = Buffer.from(json, 'utf8').toString('base64url');
	const key = await importHmacKey(secret);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyB64));
	return `${bodyB64}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function verifySignedPayload<T>(token: string, secret: string): Promise<T | null> {
	const parts = token.split('.');
	if (parts.length !== 2) return null;
	const [bodyB64, sigB64] = parts;
	if (!bodyB64 || !sigB64) return null;

	try {
		const key = await importHmacKey(secret);
		const sigBytes = base64UrlDecode(sigB64);
		const valid = await crypto.subtle.verify(
			'HMAC',
			key,
			sigBytes as BufferSource,
			new TextEncoder().encode(bodyB64)
		);
		if (!valid) return null;
		const json = Buffer.from(bodyB64, 'base64url').toString('utf8');
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}

interface SignedSessionRecord {
	user: RadioUser;
	exp: number;
	verifiedMailbox: true;
}

interface OidcFlowState {
	state: string;
	nonce: string;
	codeVerifier: string;
	returnTo: string;
	exp: number;
}

function cookieSecurity(url: URL): boolean {
	return url.protocol === 'https:' && !isLoopbackHostname(url.hostname);
}

export async function setRadioSessionCookie(event: RequestEvent, user: RadioUser): Promise<void> {
	const cfg = getRadioServerConfig(event.url);
	if (!cfg.sessionSecret) throw new Error('COMM-LINK sessions are unavailable.');
	const record: SignedSessionRecord = {
		user,
		exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
		verifiedMailbox: true
	};
	const signed = await signPayload(record, cfg.sessionSecret);
	event.cookies.set(SESSION_COOKIE_NAME, signed, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: cookieSecurity(event.url),
		maxAge: SESSION_MAX_AGE_SECONDS
	});
}

export function clearRadioSessionCookie(event: RequestEvent): void {
	event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	event.cookies.delete(OIDC_FLOW_COOKIE_NAME, { path: '/' });
}

export async function readRadioSessionUser(event: RequestEvent): Promise<RadioUser | null> {
	const raw = event.cookies.get(SESSION_COOKIE_NAME);
	if (!raw) return null;
	const cfg = getRadioServerConfig(event.url);
	if (!cfg.sessionSecret) return null;
	const record = await verifySignedPayload<SignedSessionRecord>(raw, cfg.sessionSecret);
	if (!record || !Number.isSafeInteger(record.exp) || !record.user || record.verifiedMailbox !== true) {
		return null;
	}
	const nowMs = Date.now();
	const authenticatedAt = Date.parse(record.user.authenticatedAt);
	if (
		record.exp < Math.floor(nowMs / 1000) ||
		!Number.isFinite(authenticatedAt) ||
		authenticatedAt > nowMs + 60_000 ||
		authenticatedAt < nowMs - SESSION_MAX_AGE_SECONDS * 1000
	) {
		event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
		return null;
	}
	return record.user;
}

/**
 * Initiates the official Google OpenID Connect flow requesting ONLY:
 * `openid`, `email`, and `profile`
 * Protected with PKCE (S256), `state`, and `nonce`.
 */
export async function createGoogleAuthorizationRedirect(
	event: RequestEvent,
	returnTo = '/tools/radio'
): Promise<string> {
	const cfg = getRadioServerConfig(event.url);
	if (!cfg.googleConfigured || !cfg.googleClientId || !cfg.googleRedirectUri || !cfg.sessionSecret) {
		throw new Error('Google OAuth is not configured on this server.');
	}

	const state = client.randomState();
	const nonce = client.randomNonce();
	const codeVerifier = client.randomPKCECodeVerifier();
	const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

	const safeReturnTo =
		returnTo.startsWith('/tools/radio') && !returnTo.startsWith('//')
			? returnTo
			: '/tools/radio';

	const flowState: OidcFlowState = {
		state,
		nonce,
		codeVerifier,
		returnTo: safeReturnTo,
		exp: Math.floor(Date.now() / 1000) + OIDC_FLOW_MAX_AGE_SECONDS
	};

	const signedFlow = await signPayload(flowState, cfg.sessionSecret);
	event.cookies.set(OIDC_FLOW_COOKIE_NAME, signedFlow, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: cookieSecurity(event.url),
		maxAge: OIDC_FLOW_MAX_AGE_SECONDS
	});

	const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
	authUrl.searchParams.set('client_id', cfg.googleClientId);
	authUrl.searchParams.set('redirect_uri', cfg.googleRedirectUri);
	authUrl.searchParams.set('response_type', 'code');
	// Request strictly minimal scopes: openid, email, profile
	authUrl.searchParams.set('scope', 'openid email profile');
	authUrl.searchParams.set('state', state);
	authUrl.searchParams.set('nonce', nonce);
	authUrl.searchParams.set('code_challenge', codeChallenge);
	authUrl.searchParams.set('code_challenge_method', 'S256');
	authUrl.searchParams.set('prompt', 'select_account');

	return authUrl.toString();
}

export async function completeGoogleAuthorizationCallback(
	event: RequestEvent
): Promise<{ user: RadioUser; returnTo: string }> {
	const cfg = getRadioServerConfig(event.url);
	if (
		!cfg.googleConfigured ||
		!cfg.googleClientId ||
		!cfg.googleClientSecret ||
		!cfg.googleRedirectUri ||
		!cfg.sessionSecret
	) {
		throw new Error('Google OAuth is not configured on this server.');
	}

	const rawFlow = event.cookies.get(OIDC_FLOW_COOKIE_NAME);
	event.cookies.delete(OIDC_FLOW_COOKIE_NAME, { path: '/' });
	if (!rawFlow) {
		throw new Error('Missing or expired OAuth state cookie. Please try signing in again.');
	}

	const flow = await verifySignedPayload<OidcFlowState>(rawFlow, cfg.sessionSecret);
	if (!flow || flow.exp < Math.floor(Date.now() / 1000)) {
		throw new Error('OAuth sign-in flow expired. Please try again.');
	}

	const code = event.url.searchParams.get('code');
	const returnedState = event.url.searchParams.get('state');
	if (!code || !returnedState || returnedState !== flow.state) {
		throw new Error('Invalid OAuth callback state.');
	}

	const tokenParams = new URLSearchParams({
		code,
		client_id: cfg.googleClientId,
		client_secret: cfg.googleClientSecret,
		redirect_uri: cfg.googleRedirectUri,
		grant_type: 'authorization_code',
		code_verifier: flow.codeVerifier
	});

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8000);
	let tokenRes: Response;
	try {
		tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: tokenParams.toString(),
			signal: controller.signal
		});
	} finally {
		clearTimeout(timer);
	}

	if (!tokenRes.ok) {
		throw new Error('Failed to exchange Google OAuth authorization code.');
	}

	const tokenData = (await tokenRes.json()) as { id_token?: string };
	if (!tokenData.id_token) {
		throw new Error('Google OAuth response did not include an OpenID Connect id_token.');
	}

	const { payload } = await jwtVerify(tokenData.id_token, GOOGLE_JWKS, {
		issuer: ['https://accounts.google.com', 'accounts.google.com'],
		audience: cfg.googleClientId,
		requiredClaims: ['exp', 'iat', 'sub']
	});

	if (!payload.sub || typeof payload.sub !== 'string') {
		throw new Error('Google ID token missing stable subject identifier (sub).');
	}

	if (payload.nonce !== flow.nonce) {
		throw new Error('Google ID token nonce mismatch.');
	}

	const email =
		typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
	if (
		!email ||
		payload.email_verified !== true ||
		(!email.endsWith('@gmail.com') && !(typeof payload.hd === 'string' && payload.hd))
	) {
		throw new Error('Sign in with a verified Gmail or Google Workspace account.');
	}

	const rawName =
		typeof payload.name === 'string' && payload.name.trim()
			? payload.name.trim()
			: email.split('@')[0] || 'Operator';
	const displayName = rawName.slice(0, 48);
	const avatarUrl =
		typeof payload.picture === 'string' && payload.picture.startsWith('https://')
			? payload.picture
			: null;

	const user: RadioUser = {
		id: `usr_${payload.sub}`,
		googleSub: payload.sub,
		email,
		displayName,
		avatarUrl,
		authenticatedAt: new Date().toISOString()
	};

	return {
		user,
		returnTo: flow.returnTo || '/tools/radio'
	};
}

export function allowLocalTestAuth(url: URL): boolean {
	const isVercel = env.VERCEL === '1' || process.env.VERCEL === '1';
	if (isVercel) return false;
	return isLoopbackHostname(url.hostname) && env.COMM_LINK_ALLOW_LOCAL_TEST_AUTH !== '0';
}
