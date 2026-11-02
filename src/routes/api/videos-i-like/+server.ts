import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';
import { createLocalAdmission } from '$lib/server/http/local-admission';
import { catalogue } from '$lib/visualizations/videos-i-like/catalogue';
import { createGalleryService } from '$lib/server/videos-i-like/service';
import { parseGalleryQuery, viewerCountry } from '$lib/server/videos-i-like/http';

const service = createGalleryService({ catalogue, apiKey: () => env.YOUTUBE_DATA_API_KEY });
const admit = createLocalAdmission({
	attempts: 30,
	globalAttempts: 120,
	windowMs: 60_000,
	concurrency: 8,
	maxKeys: 2048,
	perKeyConcurrency: 2
});
const headers = {
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex, nofollow',
	'x-content-type-options': 'nosniff'
};
const failure = (status: number, message: string) => json({ error: message }, { status, headers });

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (
		request.headers.get('origin') !== url.origin ||
		request.headers.get('sec-fetch-site') === 'cross-site'
	)
		return failure(403, 'A same-origin request is required.');
	if (
		request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
	)
		return failure(415, 'Send the request as JSON.');
	let address = 'unknown';
	try {
		address = getClientAddress();
	} catch {
		/* Share a conservative fallback bucket. */
	}
	const admission = admit(createHash('sha256').update(address).digest('hex'));
	if (!admission.allowed)
		return json(
			{ error: 'Please wait before checking again.' },
			{
				status: 429,
				headers: { ...headers, 'retry-after': String(admission.retryAfterSeconds) }
			}
		);
	try {
		let input: unknown;
		try {
			const body = await readBoundedBody(request, 1024, 3000, request.signal);
			input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
		} catch (error) {
			if (error instanceof BodyReadError)
				return failure(
					error.kind === 'too-large' ? 413 : 408,
					error.kind === 'too-large' ? 'Request body is too large.' : 'Request body timed out.'
				);
			return failure(400, 'Send a valid JSON object.');
		}
		const query = parseGalleryQuery(input, catalogue);
		if (!query) return failure(400, 'Choose a known playlist and a valid page.');
		return json(await service.load(query, viewerCountry(request.headers, url, env)), { headers });
	} catch {
		return failure(503, 'Availability could not be checked. Please try again.');
	} finally {
		admission.release();
	}
};
