import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY_SAMPLE_INTERVAL_MS, DEFAULT_MODEL_INPUT_GAINS } from './constants';
import { minMaxEnvelope } from './decimate';
import { generateStimulus } from './stimulus';
import { runSimulation, validateSimulationConfig } from './simulation';
import type { ModelId, SimulationConfig, SimulationResult, StimulusPresetId } from './types';

const SEEDED_NOISY_TRACE_HASHES: Record<ModelId, string> = {
	'mcculloch-pitts': 'a6e3ed0a7b83589d',
	lif: '7cbc1170cb5742d9',
	izhikevich: '1cc489ab7441d776',
	'fitzhugh-nagumo': 'a0b4a18fdee774e3',
	'hodgkin-huxley': '3c4df61f8cff7ca3'
};

const SUSTAINED_STEP_TRACE_HASHES: Record<ModelId, string> = {
	'mcculloch-pitts': '66f7ff6303d048cd',
	lif: 'b34d4ff41e623441',
	izhikevich: '1ccb87eac7055796',
	'fitzhugh-nagumo': 'ed62f317e42acb48',
	'hodgkin-huxley': 'adb1f844cbb8657f'
};

function config(
	preset: StimulusPresetId = 'sustained-step',
	dtMs = 0.025,
	durationMs = 1_000,
	displaySampleIntervalMs = DEFAULT_DISPLAY_SAMPLE_INTERVAL_MS
): SimulationConfig {
	return {
		dtMs,
		durationMs,
		seed: 1337,
		stimulus: generateStimulus(preset, { dtMs, durationMs, seed: 1337 }),
		gains: { ...DEFAULT_MODEL_INPUT_GAINS },
		displaySampleIntervalMs
	};
}

function expectFiniteResult(result: SimulationResult): void {
	expect([...result.timeMs].every(Number.isFinite)).toBe(true);
	expect([...result.displayCommand].every(Number.isFinite)).toBe(true);
	for (const trace of Object.values(result.traces)) {
		expect([...trace.nativeInput].every(Number.isFinite)).toBe(true);
		for (const values of Object.values(trace.channels)) {
			expect([...values].every(Number.isFinite)).toBe(true);
		}
		for (const event of trace.events) expect(Number.isFinite(event.timeMs)).toBe(true);
	}
}

describe('one-clock five-model simulation', () => {
	it('feeds one command grid through visible fixed gains and advances every model equally', () => {
		const result = runSimulation(config());
		expect(result.stepCount).toBe(40_000);
		expect(result.timeMs).toHaveLength(10_001);
		expect(result.timeMs[0]).toBe(0);
		expect(result.timeMs.at(-1)).toBe(1_000);
		const indexAt100Ms = 1_000;
		expect(result.timeMs[indexAt100Ms]).toBe(100);
		expect(result.displayCommand[indexAt100Ms]).toBe(0.55);
		for (const [modelId, trace] of Object.entries(result.traces) as Array<
			[ModelId, SimulationResult['traces'][ModelId]]
		>) {
			expect(trace.metrics.steps).toBe(result.stepCount);
			expect(trace.metrics.commandHash).toBe(result.commandHash);
			expect(trace.nativeInput[indexAt100Ms]).toBeCloseTo(
				DEFAULT_MODEL_INPUT_GAINS[modelId] * 0.55,
				14
			);
			let maximumInputError = 0;
			for (let index = 0; index < result.displayCommand.length; index += 1) {
				maximumInputError = Math.max(
					maximumInputError,
					Math.abs(
						trace.nativeInput[index] -
							DEFAULT_MODEL_INPUT_GAINS[modelId] * result.displayCommand[index]
					)
				);
			}
			expect(maximumInputError).toBeLessThan(1e-12);
		}
		expectFiniteResult(result);
	});

	it('replays exactly from the same stimulus, parameters, seed, and fixed step', () => {
		const first = runSimulation(config('seeded-noisy-step'));
		const replay = runSimulation(config('seeded-noisy-step'));
		expect(first.commandHash).toBe('76d1a8d2bcf98646');
		expect(
			Object.fromEntries(
				Object.entries(first.traces).map(([modelId, trace]) => [modelId, trace.hash])
			)
		).toEqual(SEEDED_NOISY_TRACE_HASHES);
		expect(replay.commandHash).toBe(first.commandHash);
		for (const modelId of Object.keys(first.traces) as ModelId[]) {
			expect(replay.traces[modelId].hash).toBe(first.traces[modelId].hash);
			expect(replay.traces[modelId].metrics).toEqual(first.traces[modelId].metrics);
			expect(replay.traces[modelId].events).toEqual(first.traces[modelId].events);
		}
		expect(replay.energy).toEqual(first.energy);
	});

	it('keeps scientific events and metrics independent of display sampling and plot width', () => {
		const fineDisplay = runSimulation(config('single-pulse', 0.025, 1_000, 0.1));
		const coarseDisplay = runSimulation(config('single-pulse', 0.025, 1_000, 0.2));
		expect(coarseDisplay.timeMs.length).toBeLessThan(fineDisplay.timeMs.length);
		for (const modelId of Object.keys(fineDisplay.traces) as ModelId[]) {
			expect(coarseDisplay.traces[modelId].metrics).toEqual(fineDisplay.traces[modelId].metrics);
			expect(coarseDisplay.traces[modelId].events).toEqual(fineDisplay.traces[modelId].events);
		}

		const metricsBefore = structuredClone(fineDisplay.traces['hodgkin-huxley'].metrics);
		const eventsBefore = structuredClone(fineDisplay.traces['hodgkin-huxley'].events);
		const voltage = fineDisplay.traces['hodgkin-huxley'].channels.voltageMv;
		expect(minMaxEnvelope(fineDisplay.timeMs, voltage, 120).values.length).toBeLessThan(
			voltage.length
		);
		expect(fineDisplay.traces['hodgkin-huxley'].metrics).toEqual(metricsBefore);
		expect(fineDisplay.traces['hodgkin-huxley'].events).toEqual(eventsBefore);
	});

	it('reports unavailable energy honestly and baseline-corrects Hodgkin–Huxley', () => {
		const quiet = runSimulation(config('quiet', 0.025, 250));
		for (const modelId of ['mcculloch-pitts', 'lif', 'izhikevich', 'fitzhugh-nagumo'] as const) {
			expect(quiet.energy[modelId]).toMatchObject({
				available: false,
				reason: expect.stringMatching(/not identifiable/i)
			});
		}
		const quietHh = quiet.energy['hodgkin-huxley'];
		expect(quietHh.available).toBe(true);
		if (!quietHh.available) throw new Error('HH energy unexpectedly unavailable.');
		expect(quietHh.rawInwardSodiumChargeNcPerCm2).toBeCloseTo(
			quietHh.baselineInwardSodiumChargeNcPerCm2,
			12
		);
		expect(quietHh.excessInwardSodiumChargeNcPerCm2).toBeCloseTo(0, 12);

		const stimulated = runSimulation(config('single-pulse', 0.025, 250));
		const stimulatedHh = stimulated.energy['hodgkin-huxley'];
		if (!stimulatedHh.available) throw new Error('HH energy unexpectedly unavailable.');
		expect(stimulatedHh.rawInwardSodiumChargeNcPerCm2).toBeGreaterThanOrEqual(
			stimulatedHh.baselineInwardSodiumChargeNcPerCm2
		);
		expect(stimulatedHh.excessInwardSodiumChargeNcPerCm2).toBeGreaterThan(0);
		expect(stimulatedHh.atpEquivalentMoleculesPerCm2).toBeGreaterThan(0);
	});

	it('rejects mismatched grids, out-of-range command samples, and unsafe gains', () => {
		const valid = config('quiet', 0.025, 250);
		expect(validateSimulationConfig(valid)).toEqual([]);
		const invalid = {
			...valid,
			stimulus: Float64Array.of(2),
			gains: { ...valid.gains, lif: 50_000 }
		};
		expect(validateSimulationConfig(invalid).join(' ')).toMatch(/length|sample|gain/i);
		expect(() => runSimulation(invalid)).toThrow(/invalid/i);
	});
});

describe('fixed-step convergence', () => {
	it('keeps representative spike timing, peaks, gates, and sodium charge close when dt halves', () => {
		const ordinary = runSimulation(config('sustained-step', 0.025, 1_000));
		const refined = runSimulation(config('sustained-step', 0.0125, 1_000));
		expect(ordinary.commandHash).toBe('ac78464ee5436a59');
		expect(
			Object.fromEntries(
				Object.entries(ordinary.traces).map(([modelId, trace]) => [modelId, trace.hash])
			)
		).toEqual(SUSTAINED_STEP_TRACE_HASHES);
		const ordinaryHh = ordinary.traces['hodgkin-huxley'].metrics;
		const refinedHh = refined.traces['hodgkin-huxley'].metrics;
		expect(refinedHh.spikeCount).toBe(ordinaryHh.spikeCount);
		expect(
			Math.abs((refinedHh.firstSpikeTimeMs ?? 0) - (ordinaryHh.firstSpikeTimeMs ?? 0))
		).toBeLessThan(0.15);
		expect(Math.abs(refinedHh.maximumPrimary - ordinaryHh.maximumPrimary)).toBeLessThan(0.5);
		for (const gate of ['m', 'h', 'n'] as const) {
			expect(
				Math.abs(refinedHh.gateExtrema![gate][0] - ordinaryHh.gateExtrema![gate][0])
			).toBeLessThan(0.01);
			expect(
				Math.abs(refinedHh.gateExtrema![gate][1] - ordinaryHh.gateExtrema![gate][1])
			).toBeLessThan(0.01);
		}
		const ordinaryEnergy = ordinary.energy['hodgkin-huxley'];
		const refinedEnergy = refined.energy['hodgkin-huxley'];
		if (!ordinaryEnergy.available || !refinedEnergy.available) {
			throw new Error('HH energy unexpectedly unavailable.');
		}
		const relativeChargeDifference =
			Math.abs(
				refinedEnergy.excessInwardSodiumChargeNcPerCm2 -
					ordinaryEnergy.excessInwardSodiumChargeNcPerCm2
			) / ordinaryEnergy.excessInwardSodiumChargeNcPerCm2;
		expect(relativeChargeDifference).toBeLessThan(0.02);
	});

	it('keeps quiet resting drift converged when dt halves', () => {
		const ordinary = runSimulation(config('quiet', 0.025, 250));
		const refined = runSimulation(config('quiet', 0.0125, 250));
		for (const modelId of ['lif', 'fitzhugh-nagumo', 'hodgkin-huxley'] as const) {
			expect(
				Math.abs(
					refined.traces[modelId].metrics.restingDrift -
						ordinary.traces[modelId].metrics.restingDrift
				)
			).toBeLessThan(0.001);
		}
	});
});
