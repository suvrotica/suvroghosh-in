import { describe, expect, it } from 'vitest';
import {
	DEFAULT_FHN_EQUILIBRIUM,
	DEFAULT_FITZHUGH_NAGUMO_PARAMETERS,
	createFitzHughNagumoState,
	fitzhughNagumoDerivatives,
	fitzhughNagumoVNullcline,
	fitzhughNagumoWNullcline,
	stepFitzHughNagumo
} from './models/fitzhughNagumo';
import {
	DEFAULT_HODGKIN_HUXLEY_PARAMETERS,
	createHodgkinHuxleyState,
	hodgkinHuxleyCurrents,
	hodgkinHuxleyDerivatives,
	hodgkinHuxleyRates,
	hodgkinHuxleySteadyGates,
	stepHodgkinHuxley,
	vtrap
} from './models/hodgkinHuxley';
import {
	IZHIKEVICH_DEFINITION,
	IZHIKEVICH_PHENOTYPES,
	createIzhikevichState,
	stepIzhikevich
} from './models/izhikevich';
import {
	DEFAULT_LIF_PARAMETERS,
	createLifState,
	lifSubthresholdUpdate,
	stepLif
} from './models/lif';
import {
	MCCULLOCH_PITTS_DEFINITION,
	createMcCullochPittsState,
	stepMcCullochPitts
} from './models/mccullochPitts';
import { STIMULUS_PRESETS, generateStimulus } from './stimulus';
import type { ModelId, StepContext } from './types';

function context(modelId: ModelId, nativeInput: number, stepIndex = 0, dtMs = 0.025): StepContext {
	void modelId;
	return {
		tMs: stepIndex * dtMs,
		dtMs,
		command: 0,
		nativeInput,
		stepIndex
	};
}

describe('McCulloch–Pitts threshold neuron', () => {
	it('implements the stated >= threshold convention and sustained binary output', () => {
		let state = createMcCullochPittsState();
		let result = stepMcCullochPitts(state, context('mcculloch-pitts', 0.499));
		expect(result.state.output).toBe(0);
		expect(result.event).toBeNull();
		result = stepMcCullochPitts(state, context('mcculloch-pitts', 0.5));
		expect(result.state.output).toBe(1);
		expect(result.event?.kind).toBe('binary-rise');
		state = result.state;
		for (let index = 1; index < 100; index += 1) {
			result = stepMcCullochPitts(state, context('mcculloch-pitts', 0.8, index));
			expect(result.state.output).toBe(1);
			expect(result.event).toBeNull();
			state = result.state;
		}
	});

	it('does not claim voltage, gates, refractoriness, or biological energy', () => {
		expect(MCCULLOCH_PITTS_DEFINITION.capabilities).toMatchObject({
			physicalVoltage: false,
			explicitRefractory: false,
			ionGates: false,
			ionicCurrents: false,
			biologicalEnergyEstimate: false
		});
		expect(createMcCullochPittsState()).not.toHaveProperty('voltageMv');
	});
});

describe('leaky integrate-and-fire neuron', () => {
	it('remains at rest without input and matches the analytic subthreshold solution', () => {
		const rest = stepLif(createLifState(), context('lif', 0, 0, 5));
		expect(rest.state.voltageMv).toBe(DEFAULT_LIF_PARAMETERS.leakReversalMv);
		const initial = -60;
		const input = 100;
		const dt = 5;
		const tau = DEFAULT_LIF_PARAMETERS.capacitancePf / DEFAULT_LIF_PARAMETERS.leakConductanceNs;
		const expected =
			DEFAULT_LIF_PARAMETERS.leakReversalMv +
			(initial - DEFAULT_LIF_PARAMETERS.leakReversalMv) * Math.exp(-dt / tau) +
			(input / DEFAULT_LIF_PARAMETERS.leakConductanceNs) * (1 - Math.exp(-dt / tau));
		expect(lifSubthresholdUpdate(initial, input, dt)).toBeCloseTo(expected, 14);

		let approaching = createLifState();
		for (let index = 0; index < 40_000; index += 1) {
			approaching = stepLif(approaching, context('lif', input, index)).state;
		}
		expect(approaching.voltageMv).toBeCloseTo(
			DEFAULT_LIF_PARAMETERS.leakReversalMv + input / DEFAULT_LIF_PARAMETERS.leakConductanceNs,
			10
		);
	});

	it('records a threshold event, resets exactly, and enforces its explicit refractory timer', () => {
		let state = createLifState();
		let firstSpikeTime: number | null = null;
		let spikeState = state;
		for (let index = 0; index < 10_000 && firstSpikeTime === null; index += 1) {
			const result = stepLif(state, context('lif', 500, index));
			state = result.state;
			if (result.event) {
				firstSpikeTime = result.event.timeMs;
				spikeState = state;
			}
		}
		expect(firstSpikeTime).not.toBeNull();
		expect(spikeState.voltageMv).toBe(DEFAULT_LIF_PARAMETERS.resetMv);
		expect(spikeState.refractoryRemainingMs).toBeGreaterThan(0);
		const held = stepLif(spikeState, context('lif', 500, 10_001));
		expect(held.state.voltageMv).toBe(DEFAULT_LIF_PARAMETERS.resetMv);
		expect(held.event).toBeNull();

		state = createLifState();
		const times: number[] = [];
		for (let index = 0; index < 40_000; index += 1) {
			const result = stepLif(state, context('lif', 500, index));
			state = result.state;
			if (result.event) times.push(result.event.timeMs);
		}
		expect(times.length).toBeGreaterThan(1);
		for (let index = 1; index < times.length; index += 1) {
			expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(
				DEFAULT_LIF_PARAMETERS.refractoryMs - 1e-10
			);
		}
	});
});

describe('Izhikevich neuron', () => {
	it('loads every exact phenotype table entry', () => {
		expect(IZHIKEVICH_PHENOTYPES).toMatchObject({
			'regular-spiking': { a: 0.02, b: 0.2, c: -65, d: 8, cutoffMv: 30 },
			'intrinsically-bursting': { a: 0.02, b: 0.2, c: -55, d: 4, cutoffMv: 30 },
			chattering: { a: 0.02, b: 0.2, c: -50, d: 2, cutoffMv: 30 },
			'fast-spiking': { a: 0.1, b: 0.2, c: -65, d: 2, cutoffMv: 30 },
			'low-threshold-spiking': { a: 0.02, b: 0.25, c: -65, d: 2, cutoffMv: 30 }
		});
		expect(IZHIKEVICH_DEFINITION.defaultParameters).toBe(IZHIKEVICH_PHENOTYPES['regular-spiking']);
	});

	it('applies the hybrid cutoff reset exactly', () => {
		const parameters = IZHIKEVICH_PHENOTYPES['regular-spiking'];
		const state = { modelId: 'izhikevich' as const, voltageMv: 29.9, recovery: -13 };
		const result = stepIzhikevich(state, context('izhikevich', 100));
		const continuous = stepIzhikevich(state, context('izhikevich', 100), {
			...parameters,
			cutoffMv: 50
		});
		expect(result.event?.kind).toBe('threshold-reset');
		expect(result.state.voltageMv).toBe(parameters.c);
		expect(result.state.recovery).toBe(continuous.state.recovery + parameters.d);
	});

	it('remains finite for every exact phenotype and supplied stimulus preset', () => {
		for (const parameters of Object.values(IZHIKEVICH_PHENOTYPES)) {
			for (const { id } of STIMULUS_PRESETS) {
				const stimulus = generateStimulus(id, { seed: 1337 });
				let state = createIzhikevichState(parameters);
				let finite = true;
				for (let index = 0; index < stimulus.length; index += 1) {
					state = stepIzhikevich(
						state,
						context('izhikevich', 15 * stimulus[index], index),
						parameters
					).state;
					finite &&= Number.isFinite(state.voltageMv) && Number.isFinite(state.recovery);
				}
				expect(finite, `${id} should stay finite`).toBe(true);
			}
		}
	});
});

describe('FitzHugh–Nagumo neuron', () => {
	it('starts at the verified default equilibrium and satisfies both nullclines', () => {
		const state = createFitzHughNagumoState();
		expect(state.fast).toBeCloseTo(DEFAULT_FHN_EQUILIBRIUM.fast, 13);
		expect(state.recovery).toBeCloseTo(DEFAULT_FHN_EQUILIBRIUM.recovery, 13);
		const [dv, dw] = fitzhughNagumoDerivatives(state.fast, state.recovery, 0);
		expect(dv).toBeCloseTo(0, 13);
		expect(dw).toBeCloseTo(0, 13);
		expect(fitzhughNagumoVNullcline(state.fast, 0)).toBeCloseTo(state.recovery, 13);
		expect(fitzhughNagumoWNullcline(state.fast)).toBeCloseTo(state.recovery, 13);
	});

	it('stays at equilibrium without input and records only upward events without reset', () => {
		let quiet = createFitzHughNagumoState();
		for (let index = 0; index < 4_000; index += 1) {
			quiet = stepFitzHughNagumo(quiet, context('fitzhugh-nagumo', 0, index)).state;
		}
		expect(quiet.fast).toBeCloseTo(DEFAULT_FHN_EQUILIBRIUM.fast, 10);

		let driven = createFitzHughNagumoState();
		let eventVoltage: number | null = null;
		for (let index = 0; index < 20_000 && eventVoltage === null; index += 1) {
			const result = stepFitzHughNagumo(
				driven,
				context('fitzhugh-nagumo', 0.8, index),
				DEFAULT_FITZHUGH_NAGUMO_PARAMETERS
			);
			driven = result.state;
			if (result.event) eventVoltage = driven.fast;
		}
		expect(eventVoltage).not.toBeNull();
		expect(eventVoltage!).toBeGreaterThanOrEqual(DEFAULT_FITZHUGH_NAGUMO_PARAMETERS.eventThreshold);
		expect(eventVoltage).not.toBe(DEFAULT_FHN_EQUILIBRIUM.fast);
	});

	it('remains finite across every supplied stimulus preset', () => {
		for (const { id } of STIMULUS_PRESETS) {
			const stimulus = generateStimulus(id, { seed: 1337 });
			let state = createFitzHughNagumoState();
			let finite = true;
			for (let index = 0; index < stimulus.length; index += 1) {
				state = stepFitzHughNagumo(
					state,
					context('fitzhugh-nagumo', 0.8 * stimulus[index], index)
				).state;
				finite &&= Number.isFinite(state.fast) && Number.isFinite(state.recovery);
			}
			expect(finite, `${id} should stay finite`).toBe(true);
		}
	});
});

describe('Hodgkin–Huxley neuron', () => {
	it('initializes canonical steady gates at -65 mV', () => {
		const gates = hodgkinHuxleySteadyGates(-65);
		expect(gates.m).toBeCloseTo(0.052_932_485_257_249_6, 14);
		expect(gates.h).toBeCloseTo(0.596_120_753_508_46, 14);
		expect(gates.n).toBeCloseTo(0.317_676_914_060_697, 14);
		expect(createHodgkinHuxleyState()).toMatchObject(gates);
	});

	it('handles both removable rate singularities and their neighborhoods', () => {
		expect(vtrap(0, 10)).toBe(10);
		for (const voltage of [-55.000_001, -55, -54.999_999, -40.000_001, -40, -39.999_999]) {
			const rates = hodgkinHuxleyRates(voltage);
			expect(Object.values(rates).every(Number.isFinite)).toBe(true);
		}
		expect(hodgkinHuxleyRates(-40).alphaM).toBeCloseTo(1, 14);
		expect(hodgkinHuxleyRates(-55).alphaN).toBeCloseTo(0.1, 14);
	});

	it('keeps zero-input rest and gates stable for at least 100 ms', () => {
		let state = createHodgkinHuxleyState();
		for (let index = 0; index < 4_000; index += 1) {
			state = stepHodgkinHuxley(state, context('hodgkin-huxley', 0, index)).state;
			expect(state.m).toBeGreaterThanOrEqual(0);
			expect(state.m).toBeLessThanOrEqual(1);
			expect(state.h).toBeGreaterThanOrEqual(0);
			expect(state.h).toBeLessThanOrEqual(1);
			expect(state.n).toBeGreaterThanOrEqual(0);
			expect(state.n).toBeLessThanOrEqual(1);
		}
		expect(Math.abs(state.voltageMv + 65)).toBeLessThan(0.02);
	});

	it('uses one outward-positive current sign convention and generates, rather than resets, a spike', () => {
		const initial = createHodgkinHuxleyState();
		const currents = hodgkinHuxleyCurrents(initial);
		const derivatives = hodgkinHuxleyDerivatives(initial, 0);
		expect(derivatives[0]).toBeCloseTo(
			-currents.sodiumUaPerCm2 - currents.potassiumUaPerCm2 - currents.leakUaPerCm2,
			14
		);

		let state = initial;
		let eventSeen = false;
		let peak = state.voltageMv;
		let minimumSodium = currents.sodiumUaPerCm2;
		for (let index = 0; index < 8_000; index += 1) {
			const input = index >= 400 && index < 1_200 ? 20 : 0;
			const result = stepHodgkinHuxley(state, context('hodgkin-huxley', input, index));
			state = result.state;
			peak = Math.max(peak, state.voltageMv);
			minimumSodium = Math.min(minimumSodium, result.currents.sodiumUaPerCm2);
			if (result.event) eventSeen = true;
		}
		expect(eventSeen).toBe(true);
		expect(peak).toBeGreaterThan(20);
		expect(minimumSodium).toBeLessThan(0);
		expect(state.voltageMv).not.toBe(DEFAULT_HODGKIN_HUXLEY_PARAMETERS.initialVoltageMv);
	});
});
