import { BodyReadError } from '$lib/server/http/body';

/** Keep the upstream request, admission and deadline alive until the response is consumed. */
export async function streamLabResponse(
	url: URL,
	options: RequestInit,
	requestSignal: AbortSignal,
	optionsLimit: { maxBytes: number; timeoutMs: number; release: () => void }
): Promise<Response> {
	const abort = new AbortController();
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
	let output: ReadableStreamDefaultController<Uint8Array> | undefined;
	let finished = false;
	let received = 0;
	let rejectStopped: (reason: unknown) => void = () => {};
	const stopped = new Promise<never>((_, reject) => (rejectStopped = reject));
	void stopped.catch(() => {});
	const cleanup = () => {
		clearTimeout(timer);
		requestSignal.removeEventListener('abort', onRequestAbort);
		optionsLimit.release();
	};
	const stop = (reason: unknown) => {
		if (finished) return;
		finished = true;
		abort.abort(reason);
		if (reader) {
			const upstreamReader = reader;
			void upstreamReader
				.cancel(reason)
				.finally(() => upstreamReader.releaseLock())
				.catch(() => {});
		}
		output?.error(reason);
		rejectStopped(reason);
		cleanup();
	};
	const onRequestAbort = () => stop(new BodyReadError('aborted'));
	const timer = setTimeout(() => stop(new BodyReadError('timeout')), optionsLimit.timeoutMs);
	requestSignal.addEventListener('abort', onRequestAbort, { once: true });
	try {
		if (requestSignal.aborted) onRequestAbort();
		const pending = fetch(url, { ...options, signal: abort.signal });
		// A provider which ignores abort may resolve after the deadline; discard its body too.
		void pending.then(
			(response) => {
				if (finished) void response.body?.cancel().catch(() => {});
			},
			() => {}
		);
		const response = await Promise.race([pending, stopped]);
		const declared = response.headers.get('content-length');
		if (declared && /^\d+$/.test(declared) && Number(declared) > optionsLimit.maxBytes) {
			void response.body?.cancel().catch(() => {});
			throw new BodyReadError('too-large');
		}
		const headers = new Headers({
			'Cache-Control': 'private, no-store',
			'X-Robots-Tag': 'noindex, noarchive',
			'X-Content-Type-Options': 'nosniff'
		});
		const type = response.headers.get('content-type') ?? 'application/json';
		headers.set(
			'Content-Type',
			/^(application\/(json|zip|octet-stream)|text\/csv)(?:;|$)/i.test(type)
				? type
				: 'text/plain; charset=utf-8'
		);
		const disposition = response.headers.get('content-disposition');
		if (disposition && disposition.length <= 1024 && !/[\x00-\x1f\x7f]/.test(disposition))
			headers.set('Content-Disposition', disposition);
		const retry = response.headers.get('retry-after');
		if (retry && /^\d{1,6}$/.test(retry)) headers.set('Retry-After', retry);
		if (!response.body) {
			finished = true;
			cleanup();
			return new Response(null, { status: response.status, headers });
		}
		reader = response.body.getReader();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				output = controller;
			},
			async pull(controller) {
				try {
					const next = await reader!.read();
					if (finished) return;
					if (next.done) {
						finished = true;
						controller.close();
						reader!.releaseLock();
						cleanup();
						return;
					}
					received += next.value.byteLength;
					if (received > optionsLimit.maxBytes) throw new BodyReadError('too-large');
					controller.enqueue(next.value);
				} catch (error) {
					stop(error);
				}
			},
			cancel(reason) {
				// The downstream stream is already cancelled, so do not error its controller.
				output = undefined;
				stop(reason ?? new BodyReadError('aborted'));
			}
		});
		return new Response(body, { status: response.status, headers });
	} catch (error) {
		stop(error);
		throw error;
	}
}
