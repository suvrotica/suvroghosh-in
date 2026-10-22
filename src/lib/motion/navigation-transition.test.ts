import { describe, expect, it, vi } from 'vitest';
import { runNavigationTransition } from './navigation-transition';

type Transition = Pick<ViewTransition, 'ready' | 'updateCallbackDone' | 'finished'>;

function deferred() {
	let resolve!: () => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<void>((fulfil, fail) => {
		resolve = fulfil;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function pendingTransition(): Transition {
	return {
		ready: deferred().promise,
		updateCallbackDone: deferred().promise,
		finished: deferred().promise
	};
}

// Allow the runner to surface unhandled rejections rather than masking them with test catches.
const rejectionCheckpoint = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('optional navigation transitions', () => {
	it('captures the old frame, releases navigation in the callback, then waits for its commit', async () => {
		const complete = deferred();
		const failed = vi.fn();
		const events: string[] = [];
		let update!: () => Promise<void>;
		const gate = runNavigationTransition(
			(callback) => {
				events.push('old frame');
				update = callback;
				return pendingTransition();
			},
			complete.promise,
			failed
		);
		void gate.then(() => events.push('navigation released'));
		await Promise.resolve();
		expect(events).toEqual(['old frame']);

		const updated = update();
		let updateFinished = false;
		void updated.then(() => {
			updateFinished = true;
		});
		await gate;
		expect(events).toEqual(['old frame', 'navigation released']);
		expect(updateFinished).toBe(false);

		complete.resolve();
		await updated;
		expect(updateFinished).toBe(true);
		expect(failed).not.toHaveBeenCalled();
	});

	it('releases navigation when ready rejects before the update callback runs', async () => {
		const transition = pendingTransition();
		const failed = vi.fn();
		const gate = runNavigationTransition(
			() => ({ ...transition, ready: Promise.reject(new Error('Transition was skipped')) }),
			deferred().promise,
			failed
		);
		await expect(gate).resolves.toBeUndefined();
		await rejectionCheckpoint();
		expect(failed).not.toHaveBeenCalled();
	});

	it('handles an aborted navigation even when the update callback never runs', async () => {
		const failed = vi.fn();
		const gate = runNavigationTransition(
			() => pendingTransition(),
			Promise.reject(new Error('navigation aborted')),
			failed
		);
		await expect(gate).resolves.toBeUndefined();
		await rejectionCheckpoint();
		expect(failed).not.toHaveBeenCalled();
	});

	it('lets an already-started update finish quietly when its navigation is aborted', async () => {
		const complete = deferred();
		const failed = vi.fn();
		let updated!: Promise<void>;
		const gate = runNavigationTransition(
			(update) => {
				updated = update();
				return pendingTransition();
			},
			complete.promise,
			failed
		);
		await gate;
		complete.reject(new Error('navigation aborted'));
		await updated;
		await rejectionCheckpoint();
		expect(failed).not.toHaveBeenCalled();
	});

	it.each(['updateCallbackDone', 'finished'] as const)(
		'handles an independent %s rejection and releases the gate',
		async (phase) => {
			const failed = vi.fn();
			await runNavigationTransition(
				() => ({ ...pendingTransition(), [phase]: Promise.reject(new Error('Skipped')) }),
				deferred().promise,
				failed
			);
			await rejectionCheckpoint();
			expect(failed).not.toHaveBeenCalled();
		}
	);

	it('also releases the gate if the transition finishes without invoking its callback', async () => {
		const failed = vi.fn();
		await runNavigationTransition(
			() => ({ ...pendingTransition(), finished: Promise.resolve() }),
			deferred().promise,
			failed
		);
		expect(failed).not.toHaveBeenCalled();
	});

	it('falls back after a synchronous start failure while observing navigation cancellation', async () => {
		const failed = vi.fn();
		await runNavigationTransition(
			() => {
				throw new Error('View transitions are unavailable');
			},
			Promise.reject(new Error('navigation aborted')),
			failed
		);
		await rejectionCheckpoint();
		expect(failed).toHaveBeenCalledOnce();
	});

	it('falls back for a partial API and still observes its other lifecycle rejections', async () => {
		const failed = vi.fn();
		await runNavigationTransition(
			() =>
				({
					ready: undefined,
					updateCallbackDone: Promise.reject(new Error('Update failed')),
					finished: Promise.reject(new Error('Transition failed'))
				}) as unknown as Transition,
			deferred().promise,
			failed
		);
		await rejectionCheckpoint();
		expect(failed).toHaveBeenCalledOnce();
	});
});
