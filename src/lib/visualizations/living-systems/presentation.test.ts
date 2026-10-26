import { describe, expect, it } from 'vitest';
import { FixedClock, screenToWorld, zoomAt } from './presentation';

describe('fixed simulation clock', () => {
	it('advances equally at different display rates', () => {
		const fast = new FixedClock();
		const slow = new FixedClock();
		let a = 0,
			b = 0;
		for (let i = 0; i < 120; i++) a += fast.advance(1000 / 120, 24, 32);
		for (let i = 0; i < 20; i++) b += slow.advance(50, 24, 32);
		expect(a).toBe(b);
		expect(a).toBe(24);
	});
	it('bounds work after a suspended tab and clears partial steps', () => {
		const clock = new FixedClock();
		expect(clock.advance(60_000, 1000, 8)).toBe(8);
		expect(clock.advance(0, 1000, 8)).toBe(0);
		clock.clear();
		expect(clock.advance(50, 10, 8)).toBe(0);
		clock.clear();
		expect(clock.advance(50, 10, 8)).toBe(0);
	});
});

it('keeps pointer painting aligned while zooming', () => {
	const camera = { x: 60, y: 42, zoom: 1 };
	const before = screenToWorld(190, 250, 840, 588, camera);
	const zoomed = zoomAt(camera, 3, 190, 250, 840, 588);
	const after = screenToWorld(190, 250, 840, 588, zoomed);
	expect(after.x).toBeCloseTo(before.x);
	expect(after.y).toBeCloseTo(before.y);
});
