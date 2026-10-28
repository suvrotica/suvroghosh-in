import { BodyReadError, readBoundedBody, withDeadline } from '$lib/server/http/body';

const REQUEST_TIMEOUT_MS = 15_000;
// Accommodate the 15 MiB stored note document, 2 MB transcript, and JSON metadata.
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/** The SDK consumes JSON/blobs in memory; finish that read within the same transport deadline. */
export function createBoundedNotesFetch(fetcher: typeof fetch = fetch): typeof fetch {
	return (input, init) =>
		withDeadline(async (deadlineSignal) => {
			const signal = AbortSignal.any([
				deadlineSignal,
				...(init?.signal ? [init.signal] : []),
				...(input instanceof Request ? [input.signal] : [])
			]);
			if (signal.aborted) throw new BodyReadError('aborted');
			const response = await fetcher(input, { ...init, signal });
			if (signal.aborted) {
				// A transport can resolve after ignoring cancellation; do not leak its late stream.
				void response.body?.cancel().catch(() => {});
				throw new BodyReadError('aborted');
			}
			const body = await readBoundedBody(response, MAX_RESPONSE_BYTES, REQUEST_TIMEOUT_MS, signal);
			const headers = new Headers(response.headers);
			if (response.body !== null) {
				// fetch has decoded compressed wire bytes; reconstructed bodies use their actual size.
				headers.delete('content-encoding');
				headers.set('content-length', String(body.byteLength));
			}
			return new Response(response.body === null ? null : body, {
				status: response.status,
				statusText: response.statusText,
				headers
			});
		}, REQUEST_TIMEOUT_MS).catch((cause) => {
			// The SDK retries ordinary network errors. Resource-limit failures must not start a
			// fresh transport deadline/retry cycle after this request has already been bounded.
			if (cause instanceof BodyReadError) {
				throw new DOMException(`Notes backend request stopped: ${cause.kind}`, 'AbortError');
			}
			throw cause;
		});
}
