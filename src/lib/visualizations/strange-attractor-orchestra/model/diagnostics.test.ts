import { describe, expect, it } from 'vitest';
import { generateCoreExperience } from '../core';
import type {
	OrchestraSnapshot,
	ReturnTimeDistributionDiagnostic,
	StepScalarComparisonDiagnostic,
	Vector3
} from '../types';
import { DEFAULT_ORCHESTRA_SNAPSHOT } from '../url-state';
import {
	compareRegisteredStepWithHalfStep,
	computeScientificDiagnostics,
	estimateFiniteTimeLargestLyapunov,
	timeAveragedDivergence
} from './diagnostics';
import { ATTRACTOR_REGISTRY, getAttractorDefinition } from './registry';
import { generateTrajectory } from './trajectory';

function expectFiniteVector(values: Vector3): void {
	for (const value of values) expect(Number.isFinite(value)).toBe(true);
}

function expectPositiveVector(values: Vector3): void {
	expectFiniteVector(values);
	for (const value of values) expect(value).toBeGreaterThan(0);
}

function expectUnitVector(values: Vector3): void {
	expectFiniteVector(values);
	for (const value of values) {
		expect(value).toBeGreaterThanOrEqual(0);
		expect(value).toBeLessThanOrEqual(1);
	}
}

function expectReturnTimeSummary(summary: ReturnTimeDistributionDiagnostic): void {
	expect(Number.isSafeInteger(summary.count)).toBe(true);
	expect(summary.count).toBeGreaterThan(0);
	expect(summary.lowerQuantile).toBeGreaterThan(0);
	expect(summary.median).toBeGreaterThanOrEqual(summary.lowerQuantile);
	expect(summary.upperQuantile).toBeGreaterThanOrEqual(summary.median);
	expect(summary.interquantileRange).toBeCloseTo(summary.upperQuantile - summary.lowerQuantile, 12);
}

function expectScalarComparisonBounds(comparison: StepScalarComparisonDiagnostic): void {
	if (comparison.status === 'not-applicable') {
		expect(comparison.registeredValue).toBeNull();
		expect(comparison.halfStepValue).toBeNull();
		expect(comparison.absoluteDelta).toBeNull();
		return;
	}
	expect(['available', 'warming-up']).toContain(comparison.status);
	expect(Number.isFinite(comparison.registeredValue)).toBe(true);
	expect(Number.isFinite(comparison.halfStepValue)).toBe(true);
	expect(Number.isFinite(comparison.absoluteDelta)).toBe(true);
	expect(comparison.absoluteDelta).toBeGreaterThanOrEqual(0);
}

describe('bounded scientific diagnostics', () => {
	it.each(ATTRACTOR_REGISTRY)(
		'computes an equal-cadence h/h² distribution comparison for $name when applicable',
		(definition) => {
			const comparison = compareRegisteredStepWithHalfStep(definition);
			expect(comparison.label).toBe('Fixed-step h versus h/2 statistical comparison');
			if (definition.integrator === 'direct-map') {
				expect(comparison).toEqual(
					expect.objectContaining({
						status: 'not-applicable',
						registeredStep: null,
						comparisonStep: null,
						coordinateMeanDelta01: null,
						coordinateRobustRange: null,
						poincareSection: null,
						registeredReturnTimes: null,
						halfStepReturnTimes: null,
						timeAveragedDivergenceComparison: null,
						finiteTimeLyapunovComparison: null
					})
				);
				return;
			}
			expect(comparison.status).toBe('available');
			expect(comparison.registeredStep).toBe(definition.stepSize);
			expect(comparison.comparisonStep).toBe((definition.stepSize ?? 0) / 2);
			expect(comparison.pointCount).toBe(4_096);
			expect(comparison.coordinateMeanDelta01).not.toBeNull();
			expect(comparison.coordinateDeviationRatio).not.toBeNull();
			expectUnitVector(comparison.coordinateMeanDelta01!);
			expectPositiveVector(comparison.coordinateDeviationRatio!);
			expect(comparison.coordinateRobustRange).not.toBeNull();
			const robustRange = comparison.coordinateRobustRange!;
			for (let axis = 0; axis < 3; axis += 1) {
				expect(robustRange.registeredLower[axis]).toBeLessThanOrEqual(
					robustRange.registeredUpper[axis]
				);
				expect(robustRange.halfStepLower[axis]).toBeLessThanOrEqual(
					robustRange.halfStepUpper[axis]
				);
			}
			expectUnitVector(robustRange.endpointDelta01);
			expectPositiveVector(robustRange.spanRatio);
			expect(comparison.occupancyTotalVariation).toBeGreaterThanOrEqual(0);
			expect(comparison.occupancyTotalVariation).toBeLessThanOrEqual(1);
			expect(comparison.poincareSection).not.toBeNull();
			const section = comparison.poincareSection!;
			expect(Number.isSafeInteger(section.registeredEventCount)).toBe(true);
			expect(Number.isSafeInteger(section.halfStepEventCount)).toBe(true);
			expect(section.registeredEventCount).toBeGreaterThanOrEqual(0);
			expect(section.halfStepEventCount).toBeGreaterThanOrEqual(0);
			expect(section.registeredEventCount).toBeLessThanOrEqual(comparison.pointCount);
			expect(section.halfStepEventCount).toBeLessThanOrEqual(comparison.pointCount);
			for (const distance of [section.valueTotalVariation, section.intervalTotalVariation]) {
				if (distance === null) continue;
				expect(Number.isFinite(distance)).toBe(true);
				expect(distance).toBeGreaterThanOrEqual(0);
				expect(distance).toBeLessThanOrEqual(1);
			}
			if (comparison.registeredReturnTimes) {
				expectReturnTimeSummary(comparison.registeredReturnTimes);
				expect(comparison.registeredReturnTimes.count).toBe(
					Math.max(0, section.registeredEventCount - 1)
				);
			}
			if (comparison.halfStepReturnTimes) {
				expectReturnTimeSummary(comparison.halfStepReturnTimes);
				expect(comparison.halfStepReturnTimes.count).toBe(
					Math.max(0, section.halfStepEventCount - 1)
				);
			}
			if (comparison.returnIntervalMedianRatio !== null) {
				expect(Number.isFinite(comparison.returnIntervalMedianRatio)).toBe(true);
				expect(comparison.returnIntervalMedianRatio).toBeGreaterThan(0);
			}
			if (comparison.returnIntervalInterquantileRangeRatio !== null) {
				expect(Number.isFinite(comparison.returnIntervalInterquantileRangeRatio)).toBe(true);
				expect(comparison.returnIntervalInterquantileRangeRatio).toBeGreaterThan(0);
			}
			expect(comparison.timeAveragedDivergenceComparison).not.toBeNull();
			expectScalarComparisonBounds(comparison.timeAveragedDivergenceComparison!);
			expect(comparison.finiteTimeLyapunovComparison).not.toBeNull();
			expectScalarComparisonBounds(comparison.finiteTimeLyapunovComparison!);
			expect(comparison.note).toContain('equal observation cadence');
			expect(comparison.note).toContain('equal simulated burn-in and calibration');
			expect(comparison.note).toContain('not mathematical convergence');
		},
		60_000
	);

	it('compares populated section values, return-time distributions, divergence, and FTLE', () => {
		const comparison = compareRegisteredStepWithHalfStep('lorenz-63');
		expect(comparison.poincareSection).toEqual(
			expect.objectContaining({
				registeredEventCount: expect.any(Number),
				halfStepEventCount: expect.any(Number),
				valueTotalVariation: expect.any(Number),
				intervalTotalVariation: expect.any(Number)
			})
		);
		expect(comparison.registeredReturnTimes).not.toBeNull();
		expect(comparison.halfStepReturnTimes).not.toBeNull();
		expect(comparison.returnIntervalMedianRatio).toBeGreaterThan(0);
		expect(comparison.returnIntervalInterquantileRangeRatio).toBeGreaterThan(0);
		expect(comparison.timeAveragedDivergenceComparison).toMatchObject({
			status: 'available',
			registeredValue: expect.any(Number),
			halfStepValue: expect.any(Number),
			absoluteDelta: expect.any(Number)
		});
		expect(comparison.timeAveragedDivergenceComparison?.absoluteDelta).toBeCloseTo(0, 12);
		expect(comparison.finiteTimeLyapunovComparison?.registeredValue).not.toBeNull();
		expect(comparison.finiteTimeLyapunovComparison?.halfStepValue).not.toBeNull();
	}, 30_000);

	it('is exactly deterministic for every additive h/h² statistic', () => {
		const options = { stepComparisonPointCount: 512, lyapunovDuration: 2 } as const;
		const first = compareRegisteredStepWithHalfStep('rossler', options);
		const second = compareRegisteredStepWithHalfStep('rossler', options);
		expect(second).toEqual(first);
	}, 30_000);

	it.each(ATTRACTOR_REGISTRY)(
		'reports a labelled finite-time estimate (or an explicit non-applicability) for $name',
		(definition) => {
			const estimate = estimateFiniteTimeLargestLyapunov(definition);
			expect(estimate.label).toBe('Finite-time largest Lyapunov estimate');
			if (definition.integrator === 'delay-rk4') {
				expect(estimate.status).toBe('not-applicable');
				expect(estimate.value).toBeNull();
				expect(estimate.note).toContain('infinite-dimensional delay history');
				return;
			}
			expect(['available', 'warming-up']).toContain(estimate.status);
			expect(estimate.value).not.toBeNull();
			expect(Number.isFinite(estimate.value)).toBe(true);
			expect(Math.abs(estimate.value!)).toBeLessThanOrEqual(100);
			expect(estimate.simulatedDuration).toBeGreaterThan(0);
			expect(estimate.renormalizations).toBeGreaterThanOrEqual(20);
			if (definition.integrator === 'direct-map') {
				expect(estimate.note).toContain('per iteration');
			} else {
				expect(estimate.note).toContain('not a proof');
			}
		},
		60_000
	);

	it('recovers the canonical Hénon exponent range and a positive post-transient RF estimate', () => {
		const henon = estimateFiniteTimeLargestLyapunov('henon');
		expect(henon.status).toBe('available');
		expect(henon.value).toBeGreaterThan(0.38);
		expect(henon.value).toBeLessThan(0.46);

		const rf = estimateFiniteTimeLargestLyapunov('rabinovich-fabrikant');
		expect(rf.value).toBeGreaterThan(0.05);
		expect(rf.simulatedDuration).toBeGreaterThanOrEqual(10);
	}, 30_000);

	it.each(ATTRACTOR_REGISTRY)(
		'time-averages the exact registered divergence identity for $name',
		(definition) => {
			const trajectory = generateTrajectory(definition, { pointCount: 192 });
			const average = timeAveragedDivergence(definition, trajectory);
			if (definition.integrator === 'direct-map' || definition.integrator === 'delay-rk4') {
				expect(average).toBeNull();
			} else if (definition.divergenceCheck?.kind === 'constant') {
				expect(average).toBeCloseTo(definition.divergenceCheck.expected!, 10);
			} else {
				expect(Number.isFinite(average)).toBe(true);
			}
		},
		30_000
	);

	it('is deterministic, opt-in, and leaves the causal score unchanged', () => {
		const snapshot: OrchestraSnapshot = {
			...DEFAULT_ORCHESTRA_SNAPSHOT,
			masterSeed: 'diagnostic-regression'
		};
		const progress: string[] = [];
		const ordinary = generateCoreExperience(snapshot, { pointCount: 256 });
		const first = generateCoreExperience(snapshot, {
			pointCount: 256,
			includeDiagnostics: true,
			diagnosticPointCount: 128,
			lyapunovDuration: 2,
			onProgress: ({ phase }) => progress.push(phase)
		});
		const second = computeScientificDiagnostics(
			getAttractorDefinition(snapshot.attractorId),
			first.trajectory,
			{ stepComparisonPointCount: 128, lyapunovDuration: 2 }
		);
		expect(ordinary.diagnostics).toBeUndefined();
		expect(first.diagnostics).toEqual(second);
		expect(first.scoreHash).toBe(ordinary.scoreHash);
		expect(first.score).toEqual(ordinary.score);
		expect(progress).toContain('diagnostics');
	});

	it('honours a pre-aborted signal instead of disguising cancellation as a failed diagnostic', () => {
		const controller = new AbortController();
		controller.abort();
		expect(() =>
			compareRegisteredStepWithHalfStep('lorenz-63', { signal: controller.signal })
		).toThrow(/cancelled/u);
		expect(() =>
			estimateFiniteTimeLargestLyapunov('lorenz-63', { signal: controller.signal })
		).toThrow(/cancelled/u);
	});
});
