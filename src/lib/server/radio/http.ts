import { json, type RequestEvent } from '@sveltejs/kit';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { RADIO_LIMITS, type RadioUser } from '$lib/radio/types';
import { readRadioSessionUser, clearRadioSessionCookie } from './auth';
import { isAccountRevoked, upsertRadioAccount } from './store';

export const RADIO_PRIVATE_HEADERS: Record<string, string> = {
	'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
	Pragma: 'no-cache',
	Expires: '0',
	'X-Robots-Tag': 'noindex, nofollow, noarchive',
	'Referrer-Policy': 'no-referrer',
	'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()'
};

const rawApiLimiter = createLocalAdmission({
	attempts: 240,
	globalAttempts: 1200,
	windowMs: 60_000,
	concurrency: 32,
	maxKeys: 512,
	perKeyConcurrency: 8
});

const rawWriteLimiter = createLocalAdmission({
	attempts: 90,
	globalAttempts: 600,
	windowMs: 60_000,
	concurrency: 16,
	maxKeys: 512,
	perKeyConcurrency: 4
});

export const radioApiAdmission = {
	tryAcquire(key: string) {
		const res = rawApiLimiter(key);
		return {
			ok: res.allowed,
			release: res.release ?? (() => {})
		};
	}
};

export const radioWriteAdmission = {
	tryAcquire(key: string) {
		const res = rawWriteLimiter(key);
		return {
			ok: res.allowed,
			release: res.release ?? (() => {})
		};
	}
};

export function radioJson(
	data: unknown,
	status = 200,
	extraHeaders?: Record<string, string>
): Response {
	return json(data, {
		status,
		headers: {
			...RADIO_PRIVATE_HEADERS,
			...extraHeaders
		}
	});
}

export function requireSameOrigin(event: RequestEvent): Response | null {
	const origin = event.request.headers.get('origin');
	const secFetchSite = event.request.headers.get('sec-fetch-site');

	if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
		return radioJson({ ok: false, error: 'Cross-site requests are not permitted.' }, 403);
	}
	if (!origin) {
		return radioJson({ ok: false, error: 'Missing Origin header on state-changing request.' }, 403);
	}
	if (origin !== event.url.origin) {
		return radioJson({ ok: false, error: 'Origin mismatch.' }, 403);
	}
	return null;
}

export async function resolveRadioUser(event: RequestEvent): Promise<RadioUser | null> {
	const user = await readRadioSessionUser(event);
	if (!user) return null;
	if (isAccountRevoked(user.id, user.authenticatedAt)) {
		clearRadioSessionCookie(event);
		return null;
	}
	await upsertRadioAccount(user);
	return user;
}

export async function requireRadioUser(
	event: RequestEvent
): Promise<{ user: RadioUser; errorResponse?: never } | { user?: never; errorResponse: Response }> {
	const user = await resolveRadioUser(event);
	if (!user) {
		return {
			errorResponse: radioJson(
				{
					ok: false,
					code: 'UNAUTHENTICATED',
					error: 'Sign in with Google to access COMM-LINK.'
				},
				401
			)
		};
	}
	return { user };
}

export async function readRadioJson<T = unknown>(
	request: Request,
	maxBytes = RADIO_LIMITS.MAX_JSON_BODY_BYTES,
	timeoutMs = RADIO_LIMITS.REQUEST_TIMEOUT_MS
): Promise<{ data: T; errorResponse?: never } | { data?: never; errorResponse: Response }> {
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.toLowerCase().includes('application/json')) {
		return {
			errorResponse: radioJson(
				{
					ok: false,
					code: 'UNSUPPORTED_MEDIA_TYPE',
					error: 'Expected application/json body.'
				},
				415
			)
		};
	}

	try {
		const bytes = await readBoundedBody(request, maxBytes, timeoutMs);
		const raw = new TextDecoder().decode(bytes);
		if (!raw.trim()) {
			return { data: {} as T };
		}
		const parsed = JSON.parse(raw) as T;
		return { data: parsed };
	} catch (error) {
		if (error instanceof BodyReadError) {
			if (error.kind === 'too-large') {
				return {
					errorResponse: radioJson(
						{
							ok: false,
							code: 'PAYLOAD_TOO_LARGE',
							error: 'Request payload exceeds 16 KiB.'
						},
						413
					)
				};
			}
			if (error.kind === 'timeout') {
				return {
					errorResponse: radioJson(
						{
							ok: false,
							code: 'REQUEST_TIMEOUT',
							error: 'Request body timed out.'
						},
						408
					)
				};
			}
		}
		return {
			errorResponse: radioJson(
				{ ok: false, code: 'INVALID_JSON', error: 'Malformed JSON request body.' },
				400
			)
		};
	}
}
