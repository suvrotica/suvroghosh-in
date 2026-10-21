import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { eligibleAnalyticsPath } from '$lib/server/analytics/paths';
import {
	ANALYTICS_ORIGIN,
	coarseClientDimensions,
	readGeography,
	referrerDimension
} from '$lib/server/analytics/policy';
import { recordAnalyticsPageView } from '$lib/server/analytics/repository';

const payloadSchema = z
	.object({
		v: z.literal(1),
		consent: z.literal(true),
		path: z.string().min(1).max(512),
		referrer: z.string().max(2048).optional()
	})
	.strict();
const privateHeaders = {
	'Cache-Control': 'private, no-store',
	Vary: 'Origin',
	'X-Robots-Tag': 'noindex, nofollow'
};
const admit = createLocalAdmission({
	attempts: 60,
	globalAttempts: 600,
	windowMs: 60000,
	concurrency: 12,
	maxKeys: 2048
});

const response = (status: number, message: string, retryAfter?: number) =>
	json(
		{ message },
		{
			status,
			headers: { ...privateHeaders, ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) }
		}
	);

export const POST: RequestHandler = async (event) => {
	const { request, url } = event;
	if (
		request.headers.get('origin') !== url.origin ||
		request.headers.get('sec-fetch-site') === 'cross-site'
	)
		return response(403, 'A same-origin request is required.');
	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
		return response(415, 'Use application/json.');
	const trusted =
		!dev &&
		env.VERCEL === '1' &&
		env.VERCEL_ENV === 'production' &&
		url.origin === ANALYTICS_ORIGIN;
	// No development/preview writes, even if a caller supplies forged provider headers.
	if (!trusted) return new Response(null, { status: 204, headers: privateHeaders });
	if (!env.NOTES_RATE_LIMIT_SALT || env.NOTES_RATE_LIMIT_SALT.length < 16)
		return response(503, 'Analytics collection is unavailable.');
	let address = 'unknown';
	try {
		address = event.getClientAddress();
	} catch {
		/* Conservative shared fallback bucket. */
	}
	// Rotates every five minutes; never used for reports. Expires after ten minutes and
	// is physically removed by the next ten-minute cleanup run.
	const rateKey = createHmac('sha256', env.NOTES_RATE_LIMIT_SALT)
		.update(`site-analytics:${Math.floor(Date.now() / 300000)}:${address}`)
		.digest('hex');
	const admission = admit(rateKey);
	if (!admission.allowed) return response(429, 'Please slow down.', admission.retryAfterSeconds);
	try {
		let payload: unknown;
		try {
			const bytes = await readBoundedBody(request, 2048, 2000, request.signal);
			payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
		} catch (cause) {
			return response(
				cause instanceof BodyReadError ? (cause.kind === 'too-large' ? 413 : 408) : 400,
				'Invalid or incomplete analytics request.'
			);
		}
		const parsed = payloadSchema.safeParse(payload);
		if (!parsed.success) return response(400, 'Invalid analytics event.');
		const path = eligibleAnalyticsPath(parsed.data.path);
		if (!path) return response(400, 'This page is not eligible for analytics.');
		const result = await recordAnalyticsPageView(
			{
				path,
				...readGeography(request.headers, trusted),
				referrer: referrerDimension(parsed.data.referrer),
				...coarseClientDimensions(request.headers.get('user-agent'))
			},
			rateKey
		);
		if (result === 'rate_limited') return response(429, 'Please slow down.', 60);
		if (result === 'unavailable') return response(503, 'Analytics collection is unavailable.');
		return new Response(null, { status: 204, headers: privateHeaders });
	} finally {
		admission.release();
	}
};
