import { describe, expect, it } from 'vitest';
import { createMuseumLoadQueue } from './museum-loading';

describe('museum texture scheduling', () => {
	it('bounds concurrent loading and skips work for abandoned rooms', async () => {
		const queue = createMuseumLoadQueue(2);
		let active = 0;
		let peak = 0;
		const started: number[] = [];
		const release: Array<() => void> = [];
		let currentRoom = 1;
		const jobs = Array.from({ length: 6 }, (_, index) =>
			queue.run(
				async () => {
					started.push(index);
					peak = Math.max(peak, ++active);
					await new Promise<void>((resolve) => release.push(resolve));
					active -= 1;
				},
				() => currentRoom === 1
			)
		);
		await Promise.resolve();
		expect(started).toEqual([0, 1]);
		currentRoom = 2;
		release.splice(0).forEach((resolve) => resolve());
		await Promise.all(jobs);
		expect(peak).toBe(2);
		expect(started).toEqual([0, 1]);
	});
	it('settles queued work on teardown without starting more downloads', async () => {
		const queue = createMuseumLoadQueue(1);
		let finish!: () => void;
		let extraStarted = false;
		const first = queue.run(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
			() => true
		);
		const second = queue.run(
			async () => {
				extraStarted = true;
			},
			() => true
		);
		await Promise.resolve();
		queue.clear();
		finish();
		await Promise.all([first, second]);
		expect(extraStarted).toBe(false);
	});
});
