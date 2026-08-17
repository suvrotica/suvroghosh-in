import { describe, expect, it, vi } from 'vitest';
import { createReadingProgressScheduler } from '$lib/components/animation/reading-progress-scheduler';

function mockAnimationFrames() {
	let nextId = 1;
	const callbacks = new Map<number, FrameRequestCallback>();
	const cancelled: number[] = [];

	const request = vi.fn((callback: FrameRequestCallback) => {
		const id = nextId++;
		callbacks.set(id, callback);
		return id;
	});
	const cancel = vi.fn((id: number) => {
		cancelled.push(id);
		callbacks.delete(id);
	});
	const runNext = () => {
		const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
		if (!next) throw new Error('No animation frame is pending.');
		const [id, callback] = next;
		callbacks.delete(id);
		callback(id * 16);
		return id;
	};

	return { request, cancel, runNext, callbacks, cancelled };
}

describe('reading-progress event scheduling', () => {
	it('does not measure on mount and coalesces event-driven updates into one animation frame', () => {
		const frames = mockAnimationFrames();
		let scrollPosition = 120;
		const readScrollHeight = vi.fn(() => 2_000);
		const measurements: number[] = [];
		const scheduler = createReadingProgressScheduler(
			() => {
				readScrollHeight();
				measurements.push(scrollPosition);
			},
			frames.request,
			frames.cancel
		);

		expect(readScrollHeight).not.toHaveBeenCalled();
		expect(frames.request).not.toHaveBeenCalled();
		expect(frames.callbacks.size).toBe(0);

		scheduler.schedule();
		scheduler.schedule();
		expect(frames.callbacks.size).toBe(1);

		scrollPosition = 480;
		frames.runNext();
		expect(readScrollHeight).toHaveBeenCalledOnce();
		expect(measurements).toEqual([480]);

		scheduler.schedule();
		scheduler.schedule();
		expect(frames.callbacks.size).toBe(1);
		frames.runNext();
		expect(readScrollHeight).toHaveBeenCalledTimes(2);
	});

	it('cancels a pending event update on teardown and ignores later events', () => {
		const frames = mockAnimationFrames();
		const measure = vi.fn();
		const scheduler = createReadingProgressScheduler(measure, frames.request, frames.cancel);

		scheduler.schedule();
		const updateFrameId = [...frames.callbacks.keys()][0];
		scheduler.stop();

		expect(frames.cancelled).toEqual([updateFrameId]);
		expect(frames.callbacks.size).toBe(0);
		scheduler.schedule();
		expect(frames.request).toHaveBeenCalledOnce();
		expect(measure).not.toHaveBeenCalled();
	});
});
