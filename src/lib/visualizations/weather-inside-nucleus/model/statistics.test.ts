import { describe, expect, it } from 'vitest';
import { createModelParameters, parametersForScenario, simulateSingle } from '.';
import type { ModelParameters } from './types';

interface Aggregate {
	count: number;
	burstFraction: number;
	meanBurstCount: number;
	meanInitiationCount: number;
	meanNearFraction: number;
	meanCompletedBurstDuration: number | null;
	initiationRateWhileOn: number | null;
}

describe('deterministic ensemble claims', () => {
	it('raises stationary near-state frequency without changing signaling variables', () => {
		const baselineParameters = parametersForScenario('baseline');
		const contactParameters = parametersForScenario('contact');
		const baseline = aggregate(768, baselineParameters);
		const contact = aggregate(768, contactParameters);
		expect(baseline.meanNearFraction).toBeCloseTo(0.19781611144141825, 1);
		expect(contact.meanNearFraction).toBeCloseTo(0.6899744811276125, 1);
		expect(contact.meanNearFraction).toBeGreaterThan(baseline.meanNearFraction + 0.4);

		const oneBaseline = simulateSingle({ seed: 91, parameters: baselineParameters });
		const oneContact = simulateSingle({ seed: 91, parameters: contactParameters });
		expect(oneContact.timeline.receptorActivity).toEqual(oneBaseline.timeline.receptorActivity);
		expect(oneContact.timeline.downstreamActivity).toEqual(oneBaseline.timeline.downstreamActivity);
		expect(oneContact.timeline.nuclearActivity).toEqual(oneBaseline.timeline.nuclearActivity);
		expect(oneContact.timeline.occupancy).toEqual(oneBaseline.timeline.occupancy);
	}, 20_000);

	it('moves burst odds and mean output under permissive occupancy without guaranteeing a burst', () => {
		const baseline = aggregate(2_048, parametersForScenario('baseline'));
		const contact = aggregate(2_048, parametersForScenario('contact'));
		expect(contact.burstFraction).toBeGreaterThan(baseline.burstFraction + 0.2);
		expect(contact.meanBurstCount).toBeGreaterThan(baseline.meanBurstCount + 0.6);
		expect(contact.meanInitiationCount).toBeGreaterThan(baseline.meanInitiationCount + 2);
		expect(contact.burstFraction).toBeLessThan(0.98);
		expect(contact.burstFraction).toBeGreaterThan(0);
	}, 20_000);

	it('binding-site mutation lowers occupancy-linked output without altering upstream or geometry', () => {
		const baseline = aggregate(1_024, parametersForScenario('baseline'));
		const mutation = aggregate(1_024, parametersForScenario('mutated'));
		expect(mutation.burstFraction).toBeLessThan(baseline.burstFraction - 0.25);
		expect(mutation.meanInitiationCount).toBeLessThan(baseline.meanInitiationCount * 0.4);

		const seed = 808;
		const oneBaseline = simulateSingle({ seed, parameters: parametersForScenario('baseline') });
		const oneMutation = simulateSingle({ seed, parameters: parametersForScenario('mutated') });
		expect(oneMutation.timeline.receptorActivity).toEqual(oneBaseline.timeline.receptorActivity);
		expect(oneMutation.timeline.downstreamActivity).toEqual(
			oneBaseline.timeline.downstreamActivity
		);
		expect(oneMutation.timeline.nuclearActivity).toEqual(oneBaseline.timeline.nuclearActivity);
		expect(oneMutation.timeline.contactState).toEqual(oneBaseline.timeline.contactState);
	}, 20_000);

	it('keeps complete burst durations and within-ON initiation rates stable under geometry changes', () => {
		const baseline = aggregate(2_048, parametersForScenario('baseline'));
		const contact = aggregate(2_048, parametersForScenario('contact'));
		if (
			baseline.meanCompletedBurstDuration === null ||
			contact.meanCompletedBurstDuration === null ||
			baseline.initiationRateWhileOn === null ||
			contact.initiationRateWhileOn === null
		) {
			throw new Error('The calibrated ensemble unexpectedly produced no measurable bursts.');
		}
		expect(
			relativeDifference(contact.meanCompletedBurstDuration, baseline.meanCompletedBurstDuration)
		).toBeLessThan(0.08);
		expect(
			relativeDifference(contact.initiationRateWhileOn, baseline.initiationRateWhileOn)
		).toBeLessThan(0.06);
		expect(baseline.initiationRateWhileOn).toBeCloseTo(
			parametersForScenario('baseline').transcriptionInitiationRate,
			1
		);
		expect(contact.initiationRateWhileOn).toBeCloseTo(
			parametersForScenario('contact').transcriptionInitiationRate,
			1
		);
	}, 20_000);

	it('keeps ensemble summaries within a declared two-percent tolerance when dt halves', () => {
		const ordinaryParameters = parametersForScenario('contact');
		const refinedParameters = createModelParameters({
			...ordinaryParameters,
			timestep: ordinaryParameters.timestep / 2
		});
		const ordinary = aggregate(2_048, ordinaryParameters);
		const refined = aggregate(2_048, refinedParameters);
		expect(Math.abs(refined.burstFraction - ordinary.burstFraction)).toBeLessThan(0.02);
		expect(relativeDifference(refined.meanBurstCount, ordinary.meanBurstCount)).toBeLessThan(0.02);
		expect(
			relativeDifference(refined.meanInitiationCount, ordinary.meanInitiationCount)
		).toBeLessThan(0.02);
		expect(relativeDifference(refined.meanNearFraction, ordinary.meanNearFraction)).toBeLessThan(
			0.02
		);
	}, 40_000);
});

function aggregate(count: number, parameters: Readonly<ModelParameters>): Aggregate {
	let bursting = 0;
	let bursts = 0;
	let initiations = 0;
	let nearFraction = 0;
	let completedDuration = 0;
	let completedBursts = 0;
	let promoterOnTime = 0;
	for (let seed = 1; seed <= count; seed += 1) {
		const result = simulateSingle({ seed, parameters });
		const summary = result.summary;
		if (summary.hadBurst) bursting += 1;
		bursts += summary.burstCount;
		initiations += summary.initiationCount;
		nearFraction += summary.nearFraction;
		promoterOnTime += summary.promoterOnTime;
		for (const duration of result.completedBurstDurations) {
			completedDuration += duration;
			completedBursts += 1;
		}
	}
	return {
		count,
		burstFraction: bursting / count,
		meanBurstCount: bursts / count,
		meanInitiationCount: initiations / count,
		meanNearFraction: nearFraction / count,
		meanCompletedBurstDuration: completedBursts > 0 ? completedDuration / completedBursts : null,
		initiationRateWhileOn: promoterOnTime > 0 ? initiations / promoterOnTime : null
	};
}

function relativeDifference(left: number, right: number): number {
	return Math.abs(left - right) / Math.max(Number.EPSILON, Math.abs(right));
}
