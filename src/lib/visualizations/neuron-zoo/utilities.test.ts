import { describe, expect, it } from 'vitest';
import { minMaxEnvelope, minMaxEnvelopeFamily } from './decimate';
import { calculateHodgkinHuxleyEnergyEstimate, integrateInwardSodiumTrace } from './energy';
import { hashNumbers, hashTraceChannels } from './hash';
import { Float64RingBuffer, RingBuffer } from './ringBuffer';
import { rk4Step } from './solvers/rk4';
import {
	exponentialThresholdCrossingTime,
	upwardCrossingFraction,
	upwardCrossingTime
} from './solvers/threshold';

describe('fixed-step numerical helpers', () => {
	it('uses fourth-order Runge–Kutta for a vector ODE', () => {
		const next = rk4Step(Float64Array.of(1), 0, 0.1, (_time, state, output) => {
			output[0] = state[0];
		});
		expect(next[0]).toBeCloseTo(Math.exp(0.1), 6);
	});

	it('estimates linear and exact exponential threshold crossings', () => {
		expect(upwardCrossingFraction(-1, 3, 1)).toBe(0.5);
		expect(upwardCrossingTime(-1, 3, 1, 10, 0.2)).toBeCloseTo(10.1, 14);
		expect(upwardCrossingFraction(2, 3, 1)).toBeNull();
		const crossing = exponentialThresholdCrossingTime(-65, -15, -50, 20, 20);
		expect(crossing).toBeCloseTo(-20 * Math.log((-50 + 15) / (-65 + 15)), 12);
	});
});

describe('bounded buffers and spike-preserving decimation', () => {
	it('keeps only the newest values in generic and numeric ring buffers', () => {
		const generic = new RingBuffer<number>(3);
		for (const value of [1, 2, 3, 4, 5]) generic.push(value);
		expect(generic.toArray()).toEqual([3, 4, 5]);
		expect(generic.at(-1)).toBe(5);

		const numeric = new Float64RingBuffer(2);
		numeric.push(4);
		numeric.push(5);
		numeric.push(6);
		expect(numeric.toFloat64Array()).toEqual(Float64Array.of(5, 6));
	});

	it('retains narrow extrema, endpoints, and chronological order', () => {
		const time = Float64Array.from({ length: 1_000 }, (_, index) => index * 0.1);
		const values = new Float64Array(1_000);
		values[511] = 42;
		values[512] = -17;
		const result = minMaxEnvelope(time, values, 20);
		expect([...result.sourceIndices]).toContain(511);
		expect([...result.sourceIndices]).toContain(512);
		expect(result.sourceIndices[0]).toBe(0);
		expect(result.sourceIndices.at(-1)).toBe(999);
		expect([...result.sourceIndices]).toEqual(
			[...result.sourceIndices].sort((left, right) => left - right)
		);
	});

	it('unions envelope indices for synchronized multi-channel traces', () => {
		const time = Float64Array.from({ length: 100 }, (_, index) => index);
		const first = new Float64Array(100);
		const second = new Float64Array(100);
		first[20] = 10;
		second[80] = -10;
		const family = minMaxEnvelopeFamily(time, { first, second }, 5);
		expect([...family.sourceIndices]).toContain(20);
		expect([...family.sourceIndices]).toContain(80);
		expect(family.channels.first).toHaveLength(family.timeMs.length);
		expect(family.channels.second).toHaveLength(family.timeMs.length);
	});
});

describe('deterministic hashes and sodium-restoration accounting', () => {
	it('hashes Float64 bit patterns and named channels deterministically', () => {
		expect(hashNumbers(Float64Array.of(0, 1, -1))).toMatch(/^[0-9a-f]{16}$/);
		expect(hashNumbers(Float64Array.of(0, 1, -1))).toBe(hashNumbers(Float64Array.of(0, 1, -1)));
		expect(hashNumbers(Float64Array.of(0, 1, -1))).not.toBe(
			hashNumbers(Float64Array.of(0, 1, -1.000_001))
		);
		expect(hashTraceChannels({ b: [2], a: [1] })).toBe(hashTraceChannels({ a: [1], b: [2] }));
	});

	it('integrates only inward sodium and converts baseline-corrected charge', () => {
		expect(integrateInwardSodiumTrace(Float64Array.of(1, -1, -3), 1)).toBeCloseTo(2.5);
		const estimate = calculateHodgkinHuxleyEnergyEstimate(12, 2, 50);
		expect(estimate.excessInwardSodiumChargeNcPerCm2).toBe(10);
		expect(estimate.atpEquivalentMolesPerCm2).toBeGreaterThan(0);
		expect(estimate.atpEquivalentMoleculesPerCm2).toBeGreaterThan(0);
		expect(estimate.chemicalWorkJoulesPerCm2).toBeGreaterThan(0);
		expect(calculateHodgkinHuxleyEnergyEstimate(2, 12).excessInwardSodiumChargeNcPerCm2).toBe(0);
	});
});
