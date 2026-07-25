import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_INPUT_GAINS } from './constants';
import { hashNumbers } from './hash';
import {
	STIMULUS_PRESETS,
	WaveformHistory,
	clearWaveform,
	deserializeExperimentState,
	generateStimulus,
	invertWaveform,
	normalizedPointerAmplitude,
	paintInterpolatedSegment,
	pointerTimeToSampleIndex,
	serializeExperimentState,
	smoothWaveformOnce,
	stimulusFromSerializedState
} from './stimulus';
import type { SerializedExperimentStateV1 } from './types';

const DT_MS = 0.025;

function at(waveform: Float64Array, timeMs: number): number {
	return waveform[Math.round(timeMs / DT_MS)];
}

describe('canonical deterministic stimulus presets', () => {
	it('pins the canonical hash of every default preset', () => {
		const hashes = Object.fromEntries(
			STIMULUS_PRESETS.map(({ id }) => [id, hashNumbers(generateStimulus(id))])
		);
		expect(hashes).toEqual({
			quiet: 'ade7648bc5c8c0d9',
			'single-pulse': '51d31b514d8025f9',
			'sustained-step': 'ac78464ee5436a59',
			'pulse-train': '0abdfd9ca722b6d9',
			ramp: '2fb3e16a89e284ad',
			'paired-pulse': 'c349fdb870ffd4d9',
			'hyperpolarize-release': 'ddd098c451c514d9',
			'seeded-noisy-step': '76d1a8d2bcf98646'
		});
	});

	it('uses one sample per fixed interval and exact end-exclusive pulse boundaries', () => {
		const single = generateStimulus('single-pulse');
		expect(single).toHaveLength(40_000);
		expect(at(single, 99.975)).toBe(0);
		expect(at(single, 100)).toBe(0.8);
		expect(at(single, 109.975)).toBe(0.8);
		expect(at(single, 110)).toBe(0);

		const sustained = generateStimulus('sustained-step');
		expect(at(sustained, 99.975)).toBe(0);
		expect(at(sustained, 100)).toBe(0.55);
		expect(at(sustained, 699.975)).toBe(0.55);
		expect(at(sustained, 700)).toBe(0);
	});

	it('generates the exact pulse train, ramp, paired pulse, and release protocol', () => {
		const train = generateStimulus('pulse-train');
		for (const start of [100, 180, 260, 340, 420, 500]) {
			expect(at(train, start)).toBe(0.75);
			expect(at(train, start + 9.975)).toBe(0.75);
			expect(at(train, start + 10)).toBe(0);
		}

		const ramp = generateStimulus('ramp');
		expect(at(ramp, 99.975)).toBe(0);
		expect(at(ramp, 100)).toBe(0);
		expect(at(ramp, 350)).toBeCloseTo(0.45, 14);
		expect(at(ramp, 600)).toBeCloseTo(0.9, 14);
		expect(at(ramp, 600.025)).toBe(0);

		const paired = generateStimulus('paired-pulse');
		expect(at(paired, 100)).toBe(0.85);
		expect(at(paired, 107.975)).toBe(0.85);
		expect(at(paired, 108)).toBe(0);
		expect(at(paired, 112)).toBe(0.85);
		expect(at(paired, 120)).toBe(0);

		const release = generateStimulus('hyperpolarize-release');
		expect(at(release, 100)).toBe(-0.5);
		expect(at(release, 299.975)).toBe(-0.5);
		expect(at(release, 300)).toBe(0.6);
		expect(at(release, 319.975)).toBe(0.6);
		expect(at(release, 320)).toBe(0);
	});

	it('replays filtered noise exactly for one seed and changes it for another', () => {
		const first = generateStimulus('seeded-noisy-step', { seed: 1337 });
		const replay = generateStimulus('seeded-noisy-step', { seed: 1337 });
		const different = generateStimulus('seeded-noisy-step', { seed: 1338 });
		expect(first).toEqual(replay);
		expect(hashNumbers(first)).toBe('76d1a8d2bcf98646');
		expect(hashNumbers(replay)).toBe('76d1a8d2bcf98646');
		expect(hashNumbers(first)).not.toBe(hashNumbers(different));
		expect([...first].every((value) => value >= -1 && value <= 1)).toBe(true);
		expect(first.slice(0, Math.round(100 / DT_MS)).every((value) => value === 0)).toBe(true);
		expect(first.slice(Math.round(700 / DT_MS)).every((value) => value === 0)).toBe(true);
	});
});

describe('waveform editing and serialization', () => {
	it('fills missed pointer indices by deterministic linear interpolation in either direction', () => {
		const blank = new Float64Array(8);
		const forward = paintInterpolatedSegment(
			blank,
			{ index: 2, amplitude: -0.5 },
			{ index: 6, amplitude: 0.5 }
		);
		const backward = paintInterpolatedSegment(
			blank,
			{ index: 6, amplitude: 0.5 },
			{ index: 2, amplitude: -0.5 }
		);
		expect([...forward]).toEqual([0, 0, -0.5, -0.25, 0, 0.25, 0.5, 0]);
		expect(backward).toEqual(forward);
		expect(blank).toEqual(new Float64Array(8));
	});

	it('provides bounded clear, invert, smooth, pointer mapping, undo, and redo helpers', () => {
		const waveform = Float64Array.from([0, 1, -1, 0]);
		expect(clearWaveform(waveform)).toEqual(new Float64Array(4));
		expect([...invertWaveform(waveform)]).toEqual([-0, -1, 1, -0]);
		expect([...smoothWaveformOnce(waveform)]).toEqual([0, 0.25, -0.25, 0]);
		expect(normalizedPointerAmplitude(0)).toBe(1);
		expect(normalizedPointerAmplitude(0.5)).toBe(0);
		expect(normalizedPointerAmplitude(1)).toBe(-1);
		expect(pointerTimeToSampleIndex(0.5, 11)).toBe(5);

		const history = new WaveformHistory(waveform, 2);
		history.commit(invertWaveform(waveform));
		expect(history.undo()).toEqual(waveform);
		expect(history.redo()).toEqual(invertWaveform(waveform));
	});

	it('round-trips a versioned custom experiment and detects waveform tampering', () => {
		const custom = Array.from({ length: 10 }, (_, index) => index / 10 - 0.5);
		const state: SerializedExperimentStateV1 = {
			version: 1,
			preset: 'custom',
			presetParameters: { isiMs: 12 },
			seed: 1337,
			durationMs: 1,
			dtMs: 0.1,
			gains: { ...DEFAULT_MODEL_INPUT_GAINS },
			phenotypes: { izhikevich: 'regular-spiking' },
			customWaveform: custom
		};
		const serialized = serializeExperimentState(state);
		const restored = deserializeExperimentState(serialized);
		expect(restored).toMatchObject({
			version: 1,
			preset: 'custom',
			seed: 1337,
			durationMs: 1,
			dtMs: 0.1
		});
		expect(stimulusFromSerializedState(restored)).toEqual(Float64Array.from(custom));

		const tampered = JSON.parse(serialized) as SerializedExperimentStateV1;
		tampered.customWaveform![4] = 0.99;
		expect(() => deserializeExperimentState(JSON.stringify(tampered))).toThrow(/hash/i);

		const invalidPhenotype = JSON.parse(serialized) as SerializedExperimentStateV1;
		invalidPhenotype.phenotypes.izhikevich = 'unknown' as never;
		expect(() => deserializeExperimentState(JSON.stringify(invalidPhenotype))).toThrow(
			/phenotype/i
		);
	});
});
