import { error } from '@sveltejs/kit';
import { BodyReadError, readBoundedBody } from '$lib/server/http/body';

const BODY_TIMEOUT_MS = 10_000;

/** Count actual bytes before JSON/multipart parsing, including chunked and mislabeled bodies. */
export async function readNotesBody(request: Request, maxBytes: number, tooLargeMessage: string) {
	try {
		return await readBoundedBody(request, maxBytes, BODY_TIMEOUT_MS, request.signal);
	} catch (cause) {
		if (cause instanceof BodyReadError) {
			if (cause.kind === 'too-large') throw error(413, { message: tooLargeMessage });
			if (cause.kind === 'timeout') {
				throw error(408, { message: 'The request body took too long to arrive. Please retry.' });
			}
		}
		throw error(400, { message: 'The request body could not be read.' });
	}
}
