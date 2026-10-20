export class BodyReadError extends Error {
	constructor(public readonly kind: 'too-large' | 'timeout' | 'aborted') {
		super(`Body read failed: ${kind}`);
		this.name = 'BodyReadError';
	}
}

/** Bound bytes as they arrive, including bodies with no or misleading Content-Length. */
export async function readBoundedBody(
	source: Pick<Request, 'body' | 'headers'>,
	maxBytes: number,
	timeoutMs: number,
	signal?: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> {
	const reader = source.body?.getReader();
	if (!reader) return new Uint8Array();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let abort: (() => void) | undefined;
	const cancel = () => {
		void reader.cancel().catch(() => {});
	};
	const interrupted = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new BodyReadError('timeout'));
			cancel();
		}, timeoutMs);
		abort = () => {
			reject(new BodyReadError('aborted'));
			cancel();
		};
		signal?.addEventListener('abort', abort, { once: true });
		if (signal?.aborted) abort();
	});
	// An already-aborted signal may reject before the first stream read is attempted.
	void interrupted.catch(() => {});
	try {
		const declaredLength = Number(source.headers.get('content-length'));
		if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
			throw new BodyReadError('too-large');
		}
		const chunks: Uint8Array[] = [];
		let length = 0;
		while (true) {
			if (signal?.aborted) throw new BodyReadError('aborted');
			const { done, value } = await Promise.race([reader.read(), interrupted]);
			if (done) break;
			length += value.byteLength;
			if (length > maxBytes) throw new BodyReadError('too-large');
			chunks.push(value);
		}
		const output = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			output.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return output;
	} catch (error) {
		cancel();
		throw error;
	} finally {
		clearTimeout(timer);
		if (abort) signal?.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}

/** Abort the underlying work and settle the caller even if a provider ignores its signal. */
export async function withDeadline<T>(
	operation: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number
): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new BodyReadError('timeout'));
			controller.abort();
		}, timeoutMs);
	});
	try {
		return await Promise.race([operation(controller.signal), deadline]);
	} finally {
		clearTimeout(timer);
	}
}
