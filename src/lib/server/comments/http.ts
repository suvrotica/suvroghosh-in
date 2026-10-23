import { error, isHttpError, json, type RequestEvent } from '@sveltejs/kit';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';

export const commentHeaders = {
	'cache-control': 'private, no-store',
	'x-robots-tag': 'noindex, nofollow, noarchive',
	'x-content-type-options': 'nosniff'
};

export function requireCommentOrigin(event: RequestEvent) {
	if (
		event.request.headers.get('origin') !== event.url.origin ||
		event.request.headers.get('sec-fetch-site') === 'cross-site'
	)
		throw error(403, 'Cross-site requests are not allowed.');
}

export async function readCommentJson(event: RequestEvent): Promise<unknown> {
	if (
		event.request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
		'application/json'
	)
		throw error(415, 'Send the comment as JSON.');
	try {
		const bytes = await readBoundedBody(event.request, 16_384, 3000, event.request.signal);
		return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch (cause) {
		if (cause instanceof BodyReadError)
			throw error(cause.kind === 'too-large' ? 413 : 408, 'The comment request could not be read.');
		throw error(400, 'Send valid comment data.');
	}
}

export function commentFailure(cause: unknown) {
	if (isHttpError(cause))
		return json({ message: cause.body.message }, { status: cause.status, headers: commentHeaders });
	return json(
		{ message: 'Comments are temporarily unavailable. Please try again.' },
		{ status: 503, headers: commentHeaders }
	);
}

export function commentAddress(event: RequestEvent) {
	try {
		return event.getClientAddress();
	} catch {
		throw error(503, 'Comments are temporarily unavailable. Please try again.');
	}
}
