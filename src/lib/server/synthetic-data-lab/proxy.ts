import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { json, type Cookies, type RequestEvent } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { streamLabResponse } from './stream';

const COOKIE = 'synthetic-lab-owner';
const MAX_BODY = 512 * 1024;
const MAX_RESPONSE = 64 * 1024 * 1024;
const PRIVATE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, noarchive' };
const previews = createLocalAdmission({
	attempts: 150,
	globalAttempts: 600,
	windowMs: 60000,
	concurrency: 8,
	maxKeys: 2048
});
const jobs = createLocalAdmission({
	attempts: 8,
	globalAttempts: 48,
	windowMs: 60000,
	concurrency: 4,
	maxKeys: 2048
});
const reads = createLocalAdmission({
	attempts: 240,
	globalAttempts: 2000,
	windowMs: 60000,
	concurrency: 32,
	maxKeys: 2048
});

export function labOwner(cookies: Cookies, secure: boolean): string {
	const existing = cookies.get(COOKIE);
	if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
	const owner = randomBytes(32).toString('hex');
	cookies.set(COOKIE, owner, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure,
		maxAge: 3600
	});
	return owner;
}

function allowedPath(path: string, method: string): boolean {
	if (
		method === 'GET' &&
		/^(capabilities|jobs\/[a-zA-Z0-9_-]{1,100}|results\/[a-zA-Z0-9_-]{1,100}(\/rows|\/download)?)$/.test(
			path
		)
	)
		return true;
	return (
		method === 'POST' && /^(validate|preview|jobs|jobs\/[a-zA-Z0-9_-]{1,100}\/cancel)$/.test(path)
	);
}

function fail(message: string, status: number, extra: Record<string, string> = {}) {
	return json({ error: message }, { status, headers: { ...PRIVATE, ...extra } });
}

export async function proxyLab(event: RequestEvent): Promise<Response> {
	const { request, url, cookies, params } = event;
	const path = params.path ?? '';
	if (!allowedPath(path, request.method)) return fail('Unknown synthetic-data operation.', 404);
	if (
		request.headers.get('sec-fetch-site') === 'cross-site' ||
		(request.method === 'POST' && request.headers.get('origin') !== url.origin)
	) {
		return fail('A same-origin request is required.', 403);
	}
	if (
		request.method === 'POST' &&
		request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
	) {
		return fail('Request body must use application/json.', 415);
	}
	const endpoint = env.SYNTHETIC_DATA_API_URL?.trim();
	const token = env.SYNTHETIC_DATA_SERVICE_TOKEN?.trim();
	if (!endpoint || !token || token.length < 24)
		return fail(
			'The simulation service is not configured. Start it with npm run synthetic-data:dev, or configure the private service connection.',
			503
		);
	let base: URL;
	try {
		base = new URL(endpoint);
		const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
		if (
			base.username ||
			base.password ||
			base.search ||
			base.hash ||
			(base.protocol !== 'https:' &&
				!(
					(dev || env.SYNTHETIC_DATA_ALLOW_LOOPBACK === 'true') &&
					local &&
					base.protocol === 'http:'
				))
		)
			throw new Error();
	} catch {
		return fail('The simulation service connection is invalid.', 503);
	}
	let address = 'unknown';
	try {
		address = event.getClientAddress();
	} catch {
		/* Use a shared bounded fallback. */
	}
	const key = createHash('sha256').update(address).digest('hex');
	const guard = path === 'jobs' ? jobs : request.method === 'POST' ? previews : reads;
	const admission = guard(key);
	if (!admission.allowed)
		return fail('Too many simulation requests. Pause briefly and retry.', 429, {
			'Retry-After': String(admission.retryAfterSeconds)
		});
	let streaming = false;
	try {
		let body: string | undefined;
		if (request.method === 'POST') {
			const bytes = await readBoundedBody(request, MAX_BODY, 10000, request.signal);
			let payload: unknown;
			try {
				payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
			} catch {
				return fail('Enter a valid JSON object.', 400);
			}
			if (!payload || typeof payload !== 'object' || Array.isArray(payload))
				return fail('Enter a valid JSON object.', 400);
			if (!path.endsWith('/cancel')) {
				const config = (payload as { config?: unknown }).config;
				if (!config || typeof config !== 'object' || Array.isArray(config))
					return fail('A dataset configuration is required.', 400);
			}
			body = JSON.stringify(payload);
		}
		const upstream = new URL(`${base.pathname.replace(/\/$/, '')}/${path}`, base.origin);
		for (const [name, value] of url.searchParams) {
			if (name === 'offset' && /^\d{1,7}$/.test(value)) upstream.searchParams.set(name, value);
			else if (name === 'limit' && /^\d{1,4}$/.test(value) && +value <= 1000)
				upstream.searchParams.set(name, value);
			else if (name === 'format' && ['csv', 'zip'].includes(value))
				upstream.searchParams.set(name, value);
			else if (
				['safe', 'spreadsheet_safe', 'truth'].includes(name) &&
				['true', 'false'].includes(value)
			)
				upstream.searchParams.set(name, value);
			else if (name === 'table' && /^[A-Za-z0-9_-]{1,64}$/.test(value))
				upstream.searchParams.set(name, value);
			else if (name === 'null_value' && value.length <= 32 && !/[\x00-\x1f]/.test(value))
				upstream.searchParams.set(name, value);
			else return fail('Invalid result-page or export option.', 400);
		}
		const bypass = env.SYNTHETIC_DATA_DEPLOYMENT_BYPASS?.trim();
		const response = await streamLabResponse(
			upstream,
			{
				method: request.method,
				headers: {
					Authorization: `Bearer ${token}`,
					'X-Lab-Owner': labOwner(cookies, url.protocol === 'https:'),
					...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
					...(body ? { 'Content-Type': 'application/json' } : {})
				},
				body,
				redirect: 'error'
			},
			request.signal,
			{
				maxBytes: MAX_RESPONSE,
				timeoutMs: path === 'jobs' ? 150000 : path === 'preview' ? 40000 : 30000,
				release: admission.release
			}
		);
		streaming = true;
		return response;
	} catch (error) {
		if (error instanceof BodyReadError && error.kind === 'too-large')
			return fail('The request or result exceeds the allowed size.', 413);
		if (
			error instanceof BodyReadError ||
			(error instanceof DOMException && error.name === 'AbortError')
		)
			return fail('The simulation request timed out or was cancelled. Try a smaller dataset.', 504);
		return fail(
			'The simulation service is unavailable. Start npm run synthetic-data:dev and retry.',
			503
		);
	} finally {
		if (!streaming) admission.release();
	}
}
