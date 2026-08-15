import { describe, expect, it } from 'vitest';
import {
	RAY_MARCHING_MAX_DELTA_MS,
	RAY_MARCHING_SHADER_TIME_WRAP_SECONDS,
	createRayMarchingClock,
	resetRayMarchingClock,
	setRayMarchingClockPlaying,
	setRayMarchingClockSuspended,
	tickRayMarchingClock
} from './clock';

describe('ray-marching animation clock', () => {
	it('rebases on its first frame and clamps abnormally large deltas', () => {
		let clock = createRayMarchingClock();
		clock = tickRayMarchingClock(clock, 1_000);
		expect(clock.elapsedSeconds).toBe(0);
		clock = tickRayMarchingClock(clock, 1_016);
		expect(clock.elapsedSeconds).toBeCloseTo(0.016, 8);
		clock = tickRayMarchingClock(clock, 20_000);
		expect(clock.elapsedSeconds).toBeCloseTo((16 + RAY_MARCHING_MAX_DELTA_MS) / 1_000, 8);
	});

	it('freezes while paused and rebases on play without wall-time debt', () => {
		let clock = createRayMarchingClock();
		clock = tickRayMarchingClock(clock, 0);
		clock = tickRayMarchingClock(clock, 40);
		clock = setRayMarchingClockPlaying(clock, false);
		expect(clock.lastTimestampMs).toBeNull();
		clock = tickRayMarchingClock(clock, 5_000);
		expect(clock.elapsedSeconds).toBeCloseTo(0.04, 8);

		clock = setRayMarchingClockPlaying(clock, true);
		clock = tickRayMarchingClock(clock, 10_000);
		clock = tickRayMarchingClock(clock, 10_025);
		expect(clock.elapsedSeconds).toBeCloseTo(0.065, 8);
	});

	it('resets the timestamp across offscreen, hidden, and restored suspension', () => {
		let clock = createRayMarchingClock();
		clock = tickRayMarchingClock(clock, 100);
		clock = tickRayMarchingClock(clock, 130);
		clock = setRayMarchingClockSuspended(clock, true);
		expect(clock.lastTimestampMs).toBeNull();
		clock = tickRayMarchingClock(clock, 50_000);
		expect(clock.elapsedSeconds).toBeCloseTo(0.03, 8);

		clock = setRayMarchingClockSuspended(clock, false);
		clock = tickRayMarchingClock(clock, 60_000);
		clock = tickRayMarchingClock(clock, 60_020);
		expect(clock.elapsedSeconds).toBeCloseTo(0.05, 8);
	});

	it('wraps shader time while retaining a compact wrap count', () => {
		let clock = createRayMarchingClock({
			elapsedSeconds: RAY_MARCHING_SHADER_TIME_WRAP_SECONDS - 0.01,
			wrapCount: 4
		});
		clock = tickRayMarchingClock(clock, 0);
		clock = tickRayMarchingClock(clock, 50);
		expect(clock.elapsedSeconds).toBeCloseTo(0.04, 8);
		expect(clock.wrapCount).toBe(5);

		const normalised = createRayMarchingClock({
			elapsedSeconds: RAY_MARCHING_SHADER_TIME_WRAP_SECONDS * 2 + 1.25
		});
		expect(normalised.elapsedSeconds).toBe(1.25);
		expect(normalised.wrapCount).toBe(2);
	});

	it('treats a backwards timestamp as a rebase and reset invalidates elapsed state', () => {
		let clock = createRayMarchingClock({ elapsedSeconds: 3, revision: 8 });
		clock = tickRayMarchingClock(clock, 500);
		clock = tickRayMarchingClock(clock, 450);
		expect(clock.elapsedSeconds).toBe(3);
		expect(clock.lastTimestampMs).toBe(450);

		clock = resetRayMarchingClock(clock, { playing: true });
		expect(clock).toMatchObject({
			elapsedSeconds: 0,
			wrapCount: 0,
			lastTimestampMs: null,
			playing: true,
			suspended: false,
			revision: 9
		});
	});
});
