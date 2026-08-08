import { describe, expect, it, vi } from 'vitest';
import {
	contactPropensity,
	createModelParameters,
	DEFAULT_MODEL_PARAMETERS,
	ENSEMBLE_SIZE,
	hazardProbability,
	HIGH_CONTACT_SILENT_SEED,
	INTRO_BURST_SEED,
	MODEL_DEFINITION,
	MODEL_ID,
	MODEL_SEMANTIC_VERSION,
	MODEL_VERSION,
	occupancySteadyState,
	parametersForScenario,
	simulateEnsemble,
	simulateSingle
} from '.';
import type { ModelTimeline, SimulationResult } from './types';

const UNIT_INTERVAL_SERIES: ReadonlyArray<keyof ModelTimeline> = [
	'signalInput',
	'receptorActivity',
	'downstreamActivity',
	'nuclearActivity',
	'occupancy',
	'licensing',
	'contactPropensity'
];

describe('weather-inside-nucleus model contract', () => {
	it('centralizes versioned defaults, ranges, units, and descriptions', () => {
		expect(MODEL_ID).toBe('weather-inside-nucleus-1.0.0');
		expect(MODEL_SEMANTIC_VERSION).toBe('1.0.0');
		expect(MODEL_DEFINITION.version).toBe(MODEL_VERSION);
		expect(MODEL_DEFINITION.method).toBe('hybrid time-stepped stochastic simulation');
		expect(Object.keys(MODEL_DEFINITION.parameters)).toEqual(Object.keys(DEFAULT_MODEL_PARAMETERS));
		for (const definition of Object.values(MODEL_DEFINITION.parameters)) {
			expect(definition.default).toBeGreaterThanOrEqual(definition.minimum);
			expect(definition.default).toBeLessThanOrEqual(definition.maximum);
			expect(definition.unit.length).toBeGreaterThan(0);
			expect(definition.description.length).toBeGreaterThan(12);
		}
		expect(() => createModelParameters({ timestep: Number.NaN })).toThrow(RangeError);
		expect(() => createModelParameters({ geometryBias: -1 })).toThrow(RangeError);
		expect(() => createModelParameters({ timestep: 0.03 })).toThrow(/integer multiples/i);
	});

	it('implements the declared input, occupancy, geometry, and exact hazard equations', () => {
		const baseline = parametersForScenario('baseline');
		const contact = parametersForScenario('contact');
		expect(contactPropensity(baseline.geometryBias, baseline)).toBeCloseTo(0.19781611144141825, 14);
		expect(contactPropensity(contact.geometryBias, contact)).toBeCloseTo(0.6899744811276125, 14);
		expect(occupancySteadyState(0, baseline)).toBe(0);
		expect(occupancySteadyState(0.5, parametersForScenario('mutated'))).toBeLessThan(
			occupancySteadyState(0.5, baseline)
		);
		expect(hazardProbability(0.3, 0.2)).toBeCloseTo(1 - Math.exp(-0.06), 15);
	});

	it('replays every scientific output byte-for-byte and never calls Math.random', () => {
		const ambientRandom = vi.spyOn(Math, 'random');
		try {
			const first = simulateSingle({ seed: 0xdecafbad });
			const replay = simulateSingle({ seed: 0xdecafbad });
			expect(replay).toEqual(first);
			expect(ambientRandom).not.toHaveBeenCalled();
			for (const key of Object.keys(first.timeline) as Array<keyof ModelTimeline>) {
				expect(bytes(first.timeline[key])).toEqual(bytes(replay.timeline[key]));
			}
		} finally {
			ambientRandom.mockRestore();
		}
	});

	it('allows another seed to change a history while preserving every invariant', () => {
		const first = simulateSingle({ seed: 101 });
		const another = simulateSingle({ seed: 102 });
		expect(
			Array.from(another.timeline.contactState).join('') + another.summary.burstCount
		).not.toBe(Array.from(first.timeline.contactState).join('') + first.summary.burstCount);
		expectValidResult(first);
		expectValidResult(another);
	});

	it('keeps intervention semantics isolated to their declared causal links', () => {
		const seed = 20_260_808;
		const baseline = simulateSingle({ seed, parameters: parametersForScenario('baseline') });
		const blocked = simulateSingle({ seed, parameters: parametersForScenario('blocked') });
		const mutated = simulateSingle({ seed, parameters: parametersForScenario('mutated') });
		const contact = simulateSingle({ seed, parameters: parametersForScenario('contact') });
		const lengthened = simulateSingle({
			seed,
			parameters: createModelParameters({ egfDuration: 36 })
		});

		expect(blocked.summary.receptorActivityIntegral).toBe(0);
		expect(blocked.summary.downstreamActivityIntegral).toBe(0);
		expect(baseline.summary.receptorActivityIntegral).toBeGreaterThan(0);
		expect(lengthened.summary.downstreamActivityIntegral).toBeGreaterThan(
			baseline.summary.downstreamActivityIntegral
		);

		expect(mutated.timeline.receptorActivity).toEqual(baseline.timeline.receptorActivity);
		expect(mutated.timeline.downstreamActivity).toEqual(baseline.timeline.downstreamActivity);
		expect(mutated.timeline.nuclearActivity).toEqual(baseline.timeline.nuclearActivity);
		expect(mutated.timeline.contactState).toEqual(baseline.timeline.contactState);
		expect(mutated.summary.occupancyIntegral).toBeLessThan(baseline.summary.occupancyIntegral);

		expect(contact.timeline.receptorActivity).toEqual(baseline.timeline.receptorActivity);
		expect(contact.timeline.downstreamActivity).toEqual(baseline.timeline.downstreamActivity);
		expect(contact.timeline.nuclearActivity).toEqual(baseline.timeline.nuclearActivity);
		expect(contact.timeline.occupancy).toEqual(baseline.timeline.occupancy);
		expect(contact.timeline.contactState).not.toEqual(baseline.timeline.contactState);
	});

	it('makes geometry irrelevant to transcription when occupancy is exactly zero', () => {
		const seed = 3_113;
		const noSignal = createModelParameters({ egfAmplitude: 0, geometryBias: 0 });
		const noSignalHighContact = createModelParameters({ egfAmplitude: 0, geometryBias: 1 });
		const baseline = simulateSingle({ seed, parameters: noSignal });
		const contact = simulateSingle({ seed, parameters: noSignalHighContact });
		expect(baseline.timeline.occupancy.every((value) => value === 0)).toBe(true);
		expect(contact.timeline.promoterState).toEqual(baseline.timeline.promoterState);
		expect(contact.timeline.rnaCount).toEqual(baseline.timeline.rnaCount);
		expect(contact.initiationTimes).toEqual(baseline.initiationTimes);
	});

	it('lets an activated system decay safely through the signaling cascade', () => {
		const result = simulateSingle({
			seed: 7,
			parameters: createModelParameters({ egfAmplitude: 0, receptorBlockade: 1 }),
			initialState: {
				receptorActivity: 1,
				downstreamActivity: 1,
				nuclearActivity: 1,
				occupancy: 1
			}
		});
		const end = result.timeline.time.length - 1;
		expect(result.timeline.receptorActivity[end]).toBeLessThan(0.001);
		expect(result.timeline.downstreamActivity[end]).toBeLessThan(0.02);
		expect(result.timeline.nuclearActivity[end]).toBeLessThan(0.08);
		expect(result.timeline.occupancy[end]).toBeLessThan(0.05);
	});

	it('keeps event/sample order and extreme valid inputs finite and bounded', () => {
		const extreme = simulateSingle({
			seed: 0xffff_ffff,
			parameters: createModelParameters({
				duration: 10,
				timestep: 0.00625,
				sampleInterval: 0.1,
				egfStart: 0,
				egfDuration: 10,
				egfAmplitude: 1,
				receptorActivationRate: 2,
				downstreamActivationRate: 2,
				nuclearActivationRate: 2,
				occupancyRelaxationTime: 0.05,
				geometryBias: 1,
				geometryLogitBaseline: 0,
				geometryLogitGain: 6,
				contactSwitchingRate: 2,
				licensingActivationRate: 2,
				basalPromoterActivationRate: 0.2,
				occupancyPromoterActivationRate: 0.5,
				contactPromoterActivationRate: 0.5,
				transcriptionInitiationRate: 5,
				rnaDegradationRate: 1
			})
		});
		expectValidResult(extreme);
		expect(isMonotonic(extreme.timeline.time)).toBe(true);
		expect(isMonotonic(extreme.contactTransitionTimes)).toBe(true);
		expect(isMonotonic(extreme.burstStartTimes)).toBe(true);
		expect(isMonotonic(extreme.burstEndTimes)).toBe(true);
		expect(isMonotonic(extreme.initiationTimes)).toBe(true);
	});

	it('pins the defining high-contact silence and an authentic 2–4-event intro burst', () => {
		const silent = simulateSingle({
			seed: HIGH_CONTACT_SILENT_SEED,
			parameters: parametersForScenario('contact')
		});
		expect(silent.summary.burstCount).toBe(0);
		expect(silent.summary.initiationCount).toBe(0);
		expect(silent.summary.closeEncounterCount).toBeGreaterThanOrEqual(3);
		expect(silent.summary.nearFraction).toBeGreaterThan(0.55);
		expect(silent.summary.occupancyIntegral).toBeGreaterThan(30);

		const intro = simulateSingle({ seed: INTRO_BURST_SEED });
		expect(intro.summary.burstCount).toBeGreaterThanOrEqual(1);
		expect(intro.summary.initiationCount).toBeGreaterThanOrEqual(2);
		expect(intro.summary.initiationCount).toBeLessThanOrEqual(4);
	});

	it('returns the documented 48-run typed ensemble and retains silent censoring', () => {
		const ensemble = simulateEnsemble({
			rootSeed: HIGH_CONTACT_SILENT_SEED,
			parameters: parametersForScenario('contact')
		});
		expect(ensemble.runs).toHaveLength(ENSEMBLE_SIZE);
		expect(ensemble.seeds).toBeInstanceOf(Uint32Array);
		expect(ensemble.burstCounts).toBeInstanceOf(Uint16Array);
		expect(ensemble.firstBurstTimes).toBeInstanceOf(Float64Array);
		expect(ensemble.firstBurstCensored).toBeInstanceOf(Uint8Array);
		expect(ensemble.seeds[0]).toBe(HIGH_CONTACT_SILENT_SEED);
		expect(ensemble.firstBurstCensored[0]).toBe(1);
		expect(Number.isNaN(ensemble.firstBurstTimes[0])).toBe(true);
		expect(ensemble.summary.silentRunCount).toBeGreaterThan(0);
		expect(ensemble.summary.burstingRunCount + ensemble.summary.silentRunCount).toBe(ENSEMBLE_SIZE);
	});
});

function expectValidResult(result: SimulationResult): void {
	for (const key of UNIT_INTERVAL_SERIES) {
		for (const value of result.timeline[key]) {
			expect(Number.isFinite(value)).toBe(true);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
		}
	}
	for (const value of result.timeline.contactState) expect(value === 0 || value === 1).toBe(true);
	for (const value of result.timeline.promoterState) expect(value === 0 || value === 1).toBe(true);
	for (const value of result.timeline.rnaCount)
		expect(Number.isInteger(value) && value >= 0).toBe(true);
	expect(result.summary.burstCount).toBeGreaterThanOrEqual(0);
	expect(result.summary.initiationCount).toBeGreaterThanOrEqual(0);
}

function bytes(value: ArrayBufferView): Uint8Array {
	return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function isMonotonic(values: ArrayLike<number>): boolean {
	for (let index = 1; index < values.length; index += 1) {
		if (!(values[index] >= values[index - 1])) return false;
	}
	return true;
}
