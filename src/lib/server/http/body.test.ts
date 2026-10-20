import { afterEach, describe, expect, it, vi } from 'vitest';
import { BodyReadError, readBoundedBody, withDeadline } from './body';
import { createLocalAdmission } from './local-admission';

afterEach(() => vi.useRealTimers());

describe('bounded body consumption', () => {
	it.each([undefined, '1'])('enforces actual bytes despite declared length %s', async (length) => {
		const cancel = vi.fn();
		const source = {
			headers: new Headers(length ? { 'content-length': length } : {}),
			body: new ReadableStream<Uint8Array<ArrayBuffer>>({
				start(controller) {
					controller.enqueue(new Uint8Array([1, 2, 3]));
					controller.enqueue(new Uint8Array([4, 5]));
				},
				cancel
			})
		};
		await expect(readBoundedBody(source, 4, 100)).rejects.toMatchObject({ kind: 'too-large' });
		expect(cancel).toHaveBeenCalled();
	});

	it('retains exact bytes at the boundary', async () => {
		const result = await readBoundedBody(new Response(new Uint8Array([0, 255, 3])), 3, 100);
		expect([...result]).toEqual([0, 255, 3]);
	});

	it.each([false, true])(
		'returns at its deadline even when cancellation itself stalls: %s',
		async (stallCancellation) => {
			vi.useFakeTimers();
			const cancel = vi.fn(() => (stallCancellation ? new Promise<void>(() => {}) : undefined));
			const work = readBoundedBody(
				{ headers: new Headers(), body: new ReadableStream({ cancel }) },
				4,
				10
			);
			const rejected = expect(work).rejects.toMatchObject({ kind: 'timeout' });
			await vi.advanceTimersByTimeAsync(11);
			await rejected;
			expect(cancel).toHaveBeenCalled();
		}
	);

	it('cancels reads when the upstream deadline signal aborts', async () => {
		const controller = new AbortController();
		const cancel = vi.fn();
		const work = readBoundedBody(
			{ headers: new Headers(), body: new ReadableStream({ cancel }) },
			4,
			100,
			controller.signal
		);
		const rejected = expect(work).rejects.toBeInstanceOf(BodyReadError);
		controller.abort();
		await rejected;
		expect(cancel).toHaveBeenCalled();
	});

	it('deadlines settle even when an upstream promise ignores cancellation', async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | undefined;
		const work = withDeadline((value) => {
			signal = value;
			return new Promise(() => {});
		}, 10);
		const rejected = expect(work).rejects.toMatchObject({ kind: 'timeout' });
		await vi.advanceTimersByTimeAsync(11);
		await rejected;
		expect(signal?.aborted).toBe(true);
	});
});

describe('bounded process-local admission', () => {
	it('refuses new keys at capacity and reclaims expired entries', () => {
		const admit = createLocalAdmission({
			attempts: 10,
			globalAttempts: 100,
			windowMs: 1000,
			concurrency: 2,
			maxKeys: 1
		});
		const first = admit('one', 0);
		if (!first.allowed) throw new Error('Expected admission');
		first.release();
		expect(admit('two', 1).allowed).toBe(false);
		expect(admit('two', 1001).allowed).toBe(true);
	});

	it('caps active work, releases once, limits attempts and expires old buckets', () => {
		const admit = createLocalAdmission({
			attempts: 2,
			globalAttempts: 3,
			windowMs: 1000,
			concurrency: 2,
			maxKeys: 2
		});
		const first = admit('one', 0);
		const second = admit('two', 0);
		expect(first.allowed && second.allowed).toBe(true);
		expect(admit('one', 1).allowed).toBe(false);
		expect(admit('three', 1).allowed).toBe(false);
		if (!first.allowed || !second.allowed) throw new Error('Expected admission');
		first.release();
		first.release();
		const again = admit('one', 2);
		expect(again.allowed).toBe(true);
		if (again.allowed) again.release();
		second.release();
		expect(admit('one', 3).allowed).toBe(false);
		expect(admit('three', 3).allowed).toBe(false);
		expect(admit('three', 1001).allowed).toBe(true);
	});
});
