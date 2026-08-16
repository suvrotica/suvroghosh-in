import { describe, expect, it } from 'vitest';
import {
	ECOSYSTEM_PRESET,
	coexistencePoint,
	ecosystemDerivatives,
	findFirstSharkOvershoot,
	forkEcosystemIntervention,
	lotkaVolterraInvariant,
	simulateEcosystem
} from './ecosystem';

describe('Lotka–Volterra teaching model', () => {
	it('computes the requested coexistence point and zero derivatives there', () => {
		const equilibrium = coexistencePoint(ECOSYSTEM_PRESET);
		expect(equilibrium.sharks).toBe(15);
		expect(equilibrium.tuna).toBeCloseTo(13.3333333333, 10);
		const derivative = ecosystemDerivatives(equilibrium, ECOSYSTEM_PRESET);
		expect(derivative.sharks).toBeCloseTo(0, 12);
		expect(derivative.tuna).toBeCloseTo(0, 12);
	});

	it('is deterministic, finite and positive under RK4', () => {
		const first = simulateEcosystem(ECOSYSTEM_PRESET);
		const second = simulateEcosystem(ECOSYSTEM_PRESET);
		expect(first).toEqual(second);
		expect(
			first.every((sample) => Number.isFinite(sample.tuna) && Number.isFinite(sample.sharks))
		).toBe(true);
		expect(first.every((sample) => sample.tuna > 0 && sample.sharks > 0)).toBe(true);
		const atOne = first[Math.round(1 / ECOSYSTEM_PRESET.dt)];
		expect(atOne.tuna).toBeCloseTo(23.4688270627, 8);
		expect(atOne.sharks).toBeCloseTo(35.7992251053, 8);
	});

	it('conserves the ideal model invariant to RK4 tolerance', () => {
		const parameters = { ...ECOSYSTEM_PRESET, duration: 80 };
		const samples = simulateEcosystem(parameters);
		const initial = lotkaVolterraInvariant(samples[0], parameters);
		const maximumDrift = Math.max(
			...samples.map((sample) => Math.abs(lotkaVolterraInvariant(sample, parameters) - initial))
		);
		expect(maximumDrift).toBeLessThan(1e-7);
	});

	it('forks without mutating the baseline and verifies the later shark overshoot', () => {
		const baseline = simulateEcosystem(ECOSYSTEM_PRESET);
		const snapshot = structuredClone(baseline);
		const fork = forkEcosystemIntervention(
			ECOSYSTEM_PRESET,
			{ kind: 'sharks', time: 5, amount: 10 },
			baseline
		);
		expect(baseline).toEqual(snapshot);
		const atFive = fork.baseline[fork.interventionIndex];
		const branchStart = fork.intervention[fork.interventionIndex];
		expect(atFive.tuna).toBeCloseTo(2.20771709585, 8);
		expect(atFive.sharks).toBeCloseTo(16.3792834171, 8);
		expect(branchStart.sharks).toBeCloseTo(6.3792834171, 8);
		const overshoot = findFirstSharkOvershoot(fork);
		expect(overshoot).not.toBeNull();
		expect(overshoot!.time).toBeGreaterThanOrEqual(14.15);
		expect(overshoot!.time).toBeLessThanOrEqual(14.17);
		expect(overshoot!.interventionSharks).toBeGreaterThan(45.47);
		expect(overshoot!.excess).toBeGreaterThan(30);
	});

	it('rejects an intervention that would remove an entire population', () => {
		expect(() =>
			forkEcosystemIntervention(ECOSYSTEM_PRESET, { kind: 'sharks', time: 5, amount: 20 })
		).toThrow(RangeError);
	});

	it('keeps the ten-shark challenge valid across every exposed control extreme', () => {
		for (const sharks0 of [18, 22]) {
			for (const tuna0 of [35, 45]) {
				const parameters = { ...ECOSYSTEM_PRESET, sharks0, tuna0 };
				const baseline = simulateEcosystem(parameters);
				const exposedWindow = baseline.slice(
					Math.round(4 / parameters.dt),
					Math.round(6 / parameters.dt) + 1
				);
				expect(Math.min(...exposedWindow.map((sample) => sample.sharks))).toBeGreaterThan(10);
				for (const time of [4, 6]) {
					expect(() =>
						forkEcosystemIntervention(parameters, { kind: 'sharks', time, amount: 10 }, baseline)
					).not.toThrow();
				}
			}
		}
	});
});
