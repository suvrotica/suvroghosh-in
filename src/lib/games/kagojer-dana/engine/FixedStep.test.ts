import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_CATCH_UP_STEPS, FIXED_STEP_SECONDS, FixedStep } from './FixedStep';

describe('FixedStep', () => {
	it('accumulates render deltas into exact 1/120 second ticks', () => {
		const clock = new FixedStep();
		const ticks: number[] = [];
		const first = clock.advance(FIXED_STEP_SECONDS * 0.5, (tick) =>
			ticks.push(tick.simulationTime)
		);
		const second = clock.advance(FIXED_STEP_SECONDS * 0.5, (tick) =>
			ticks.push(tick.simulationTime)
		);

		expect(first.steps).toBe(0);
		expect(first.alpha).toBeCloseTo(0.5, 12);
		expect(second.steps).toBe(1);
		expect(second.alpha).toBe(0);
		expect(ticks).toEqual([FIXED_STEP_SECONDS]);
	});

	it('caps catch-up work and reports discarded stalled-frame time', () => {
		const clock = new FixedStep();
		let callbacks = 0;
		const result = clock.advance(2, () => {
			callbacks += 1;
		});

		expect(result.steps).toBe(DEFAULT_MAX_CATCH_UP_STEPS);
		expect(callbacks).toBe(DEFAULT_MAX_CATCH_UP_STEPS);
		expect(result.droppedSeconds).toBeCloseTo(
			2 - DEFAULT_MAX_CATCH_UP_STEPS * FIXED_STEP_SECONDS,
			12
		);
		expect(result.alpha).toBe(0);
	});

	it('clears fractional time when a hidden tab resumes', () => {
		const clock = new FixedStep();
		clock.advance(FIXED_STEP_SECONDS * 0.75, () => undefined);
		clock.setSuspended(true);
		const hidden = clock.advance(30, () => {
			throw new Error('A suspended clock must not tick.');
		});
		clock.setSuspended(false);
		const resumed = clock.advance(FIXED_STEP_SECONDS * 0.5, () => undefined);

		expect(hidden.steps).toBe(0);
		expect(hidden.droppedSeconds).toBe(30);
		expect(resumed.steps).toBe(0);
		expect(resumed.alpha).toBeCloseTo(0.5, 12);
	});

	it('preserves deterministic time across different render-frame partitions', () => {
		const first = new FixedStep();
		const second = new FixedStep();
		const firstTicks: number[] = [];
		const secondTicks: number[] = [];
		for (let index = 0; index < 60; index += 1) {
			first.advance(1 / 60, (tick) => firstTicks.push(tick.stepIndex));
		}
		for (let index = 0; index < 40; index += 1) {
			second.advance(1 / 40, (tick) => secondTicks.push(tick.stepIndex));
		}

		expect(firstTicks).toEqual(secondTicks);
		expect(first.simulationTime).toBe(1);
	});
});
