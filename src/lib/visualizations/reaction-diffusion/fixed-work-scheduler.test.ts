import { describe, expect, it } from 'vitest';
import { scheduleFixedWork } from './fixed-work-scheduler';

function scheduledWork(framesPerSecond: number, workPerSecond: number) {
	let carry = 0;
	let work = 0;
	for (let frame = 0; frame < framesPerSecond; frame += 1) {
		const slice = scheduleFixedWork(carry, 1 / framesPerSecond, workPerSecond);
		carry = slice.carry;
		work += slice.work;
	}
	return { carry, work };
}

describe('fixed-work scheduler', () => {
	it('requests the same one-second model work at common monitor refresh rates', () => {
		for (const refreshRate of [30, 60, 90, 120, 144, 240]) {
			expect(scheduledWork(refreshRate, 120).work).toBe(120);
		}
	});

	it('carries fractional work instead of forcing one step per animation frame', () => {
		const slice = scheduleFixedWork(0, 1 / 240, 60);
		expect(slice).toEqual({ carry: 0.25, work: 0 });
	});

	it('bounds delayed-frame catch-up work and retained debt', () => {
		expect(scheduleFixedWork(200, 10, 120, 8, 16)).toEqual({ carry: 8, work: 8 });
	});

	it('rejects invalid scheduling bounds', () => {
		expect(() => scheduleFixedWork(0, 1 / 60, 60, 0)).toThrow(/finite, positive bounds/iu);
	});
});
