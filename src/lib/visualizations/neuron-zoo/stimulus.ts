import {
	DEFAULT_DT_MS,
	DEFAULT_DURATION_MS,
	DEFAULT_MODEL_INPUT_GAINS,
	DEFAULT_NOISE_SEED,
	DEFAULT_PAIRED_PULSE_ISI_MS
} from './constants';
import { hashNumbers } from './hash';
import { Mulberry32, normalizeSeed } from './prng';
import type {
	ExperimentPresetId,
	IzhikevichPhenotypeId,
	ModelInputGains,
	SerializedExperimentStateV1,
	StimulusGenerationOptions,
	StimulusPresetId
} from './types';
import { clamp, millisecondsToGridIndex, simulationStepCount } from './units';

export const STIMULUS_PRESETS: ReadonlyArray<{
	id: StimulusPresetId;
	name: string;
	description: string;
}> = Object.freeze([
	{ id: 'quiet', name: 'Quiet', description: 'Zero command for the complete experiment.' },
	{ id: 'single-pulse', name: 'Single pulse', description: '+0.80 from 100 to 110 ms.' },
	{
		id: 'sustained-step',
		name: 'Sustained step',
		description: '+0.55 from 100 to 700 ms.'
	},
	{
		id: 'pulse-train',
		name: 'Pulse train',
		description: 'Six +0.75 pulses, each 10 ms wide.'
	},
	{ id: 'ramp', name: 'Ramp', description: 'Linear 0 to +0.90 ramp from 100 to 600 ms.' },
	{
		id: 'paired-pulse',
		name: 'Paired pulse',
		description: 'Two +0.85 pulses, each 8 ms wide, with adjustable onset interval.'
	},
	{
		id: 'hyperpolarize-release',
		name: 'Hyperpolarize and release',
		description: 'A negative hold followed immediately by a short positive pulse.'
	},
	{
		id: 'seeded-noisy-step',
		name: 'Seeded noisy step',
		description: 'A reproducible low-pass-filtered noisy step from 100 to 700 ms.'
	}
]);

const IZHIKEVICH_PHENOTYPE_IDS = new Set<IzhikevichPhenotypeId>([
	'regular-spiking',
	'intrinsically-bursting',
	'chattering',
	'fast-spiking',
	'low-threshold-spiking'
]);

function fillInterval(
	target: Float64Array,
	dtMs: number,
	startMs: number,
	endMs: number,
	value: number
): void {
	const start = Math.max(0, millisecondsToGridIndex(startMs, dtMs));
	const end = Math.min(target.length, millisecondsToGridIndex(endMs, dtMs));
	for (let index = start; index < end; index += 1) target[index] = value;
}

export function generateStimulus(
	preset: StimulusPresetId,
	options: StimulusGenerationOptions = {}
): Float64Array {
	const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
	const dtMs = options.dtMs ?? DEFAULT_DT_MS;
	const seed = normalizeSeed(options.seed ?? DEFAULT_NOISE_SEED);
	const isiMs = options.isiMs ?? DEFAULT_PAIRED_PULSE_ISI_MS;
	const samples = new Float64Array(simulationStepCount(durationMs, dtMs));

	switch (preset) {
		case 'quiet':
			break;
		case 'single-pulse':
			fillInterval(samples, dtMs, 100, 110, 0.8);
			break;
		case 'sustained-step':
			fillInterval(samples, dtMs, 100, 700, 0.55);
			break;
		case 'pulse-train':
			for (const startMs of [100, 180, 260, 340, 420, 500]) {
				fillInterval(samples, dtMs, startMs, startMs + 10, 0.75);
			}
			break;
		case 'ramp': {
			const start = millisecondsToGridIndex(100, dtMs);
			const end = millisecondsToGridIndex(600, dtMs);
			for (let index = Math.max(0, start); index <= Math.min(end, samples.length - 1); index += 1) {
				samples[index] = (0.9 * (index - start)) / (end - start);
			}
			break;
		}
		case 'paired-pulse':
			if (!Number.isFinite(isiMs) || isiMs < 1 || isiMs > 100) {
				throw new RangeError('Paired-pulse ISI must be between 1 and 100 ms.');
			}
			fillInterval(samples, dtMs, 100, 108, 0.85);
			fillInterval(samples, dtMs, 100 + isiMs, 108 + isiMs, 0.85);
			break;
		case 'hyperpolarize-release':
			fillInterval(samples, dtMs, 100, 300, -0.5);
			fillInterval(samples, dtMs, 300, 320, 0.6);
			break;
		case 'seeded-noisy-step': {
			const random = new Mulberry32(seed);
			const alpha = Math.exp(-dtMs / 2);
			const start = millisecondsToGridIndex(100, dtMs);
			const end = millisecondsToGridIndex(700, dtMs);
			let filtered = 0;
			for (let index = 0; index < samples.length; index += 1) {
				filtered = alpha * filtered + (1 - alpha) * random.signed();
				if (index >= start && index < end) {
					samples[index] = clamp(0.42 + 0.12 * filtered, -1, 1);
				}
			}
			break;
		}
	}

	return samples;
}

export interface WaveformPoint {
	index: number;
	amplitude: number;
}

/**
 * Paint an inclusive, deterministic line between two sampled pointer events.
 * The same two endpoints always update exactly the same indices, in either drag direction.
 */
export function paintInterpolatedSegment(
	waveform: Float64Array,
	from: WaveformPoint,
	to: WaveformPoint
): Float64Array {
	if (waveform.length === 0) return waveform.slice();
	const startIndex = Math.round(clamp(from.index, 0, waveform.length - 1));
	const endIndex = Math.round(clamp(to.index, 0, waveform.length - 1));
	const result = waveform.slice();
	const distance = Math.abs(endIndex - startIndex);
	const direction = endIndex >= startIndex ? 1 : -1;
	for (let offset = 0; offset <= distance; offset += 1) {
		const progress = distance === 0 ? 1 : offset / distance;
		const index = startIndex + direction * offset;
		result[index] = clamp(from.amplitude + (to.amplitude - from.amplitude) * progress, -1, 1);
	}
	return result;
}

export function clearWaveform(waveform: ArrayLike<number>): Float64Array {
	return new Float64Array(waveform.length);
}

export function invertWaveform(waveform: ArrayLike<number>): Float64Array {
	return Float64Array.from(waveform, (value) => clamp(-value, -1, 1));
}

/** One non-destructive [1, 2, 1] low-pass pass; endpoints remain unchanged. */
export function smoothWaveformOnce(waveform: ArrayLike<number>): Float64Array {
	const result = Float64Array.from(waveform);
	for (let index = 1; index < waveform.length - 1; index += 1) {
		result[index] = clamp(
			(waveform[index - 1] + 2 * waveform[index] + waveform[index + 1]) / 4,
			-1,
			1
		);
	}
	return result;
}

export function normalizedPointerAmplitude(verticalFraction: number): number {
	return clamp(1 - 2 * verticalFraction, -1, 1);
}

export function pointerTimeToSampleIndex(horizontalFraction: number, sampleCount: number): number {
	if (sampleCount <= 1) return 0;
	return Math.round(clamp(horizontalFraction, 0, 1) * (sampleCount - 1));
}

export class WaveformHistory {
	private undoStack: Float64Array[] = [];
	private redoStack: Float64Array[] = [];
	private current: Float64Array;

	constructor(
		initial: ArrayLike<number>,
		private readonly limit = 32
	) {
		if (!Number.isInteger(limit) || limit < 1)
			throw new RangeError('History limit must be positive.');
		this.current = Float64Array.from(initial);
	}

	value(): Float64Array {
		return this.current.slice();
	}

	commit(next: ArrayLike<number>): Float64Array {
		if (next.length !== this.current.length) throw new RangeError('Waveform length cannot change.');
		this.undoStack.push(this.current);
		if (this.undoStack.length > this.limit) this.undoStack.shift();
		this.current = Float64Array.from(next);
		this.redoStack.length = 0;
		return this.value();
	}

	undo(): Float64Array {
		const previous = this.undoStack.pop();
		if (!previous) return this.value();
		this.redoStack.push(this.current);
		this.current = previous;
		return this.value();
	}

	redo(): Float64Array {
		const next = this.redoStack.pop();
		if (!next) return this.value();
		this.undoStack.push(this.current);
		this.current = next;
		return this.value();
	}
}

function validateGains(gains: unknown): ModelInputGains {
	if (!gains || typeof gains !== 'object') throw new TypeError('Experiment gains are missing.');
	const record = gains as Record<string, unknown>;
	const result = { ...DEFAULT_MODEL_INPUT_GAINS };
	for (const modelId of Object.keys(DEFAULT_MODEL_INPUT_GAINS) as Array<keyof ModelInputGains>) {
		const value = record[modelId];
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			throw new TypeError(`Experiment gain for ${modelId} must be finite.`);
		}
		result[modelId] = value;
	}
	return result;
}

export function serializeExperimentState(state: SerializedExperimentStateV1): string {
	const normalized: SerializedExperimentStateV1 = {
		...state,
		version: 1,
		seed: normalizeSeed(state.seed),
		gains: validateGains(state.gains),
		customWaveform: state.customWaveform?.map((value) => clamp(value, -1, 1))
	};
	if (normalized.customWaveform) {
		normalized.customWaveformHash = hashNumbers(normalized.customWaveform);
	}
	return JSON.stringify(normalized);
}

export function deserializeExperimentState(serialized: string): SerializedExperimentStateV1 {
	const value: unknown = JSON.parse(serialized);
	if (!value || typeof value !== 'object')
		throw new TypeError('Experiment JSON must be an object.');
	const candidate = value as Partial<SerializedExperimentStateV1>;
	if (candidate.version !== 1) throw new TypeError('Unsupported Neuron Zoo experiment version.');
	if (typeof candidate.preset !== 'string') throw new TypeError('Experiment preset is missing.');
	const preset = candidate.preset as ExperimentPresetId;
	const validPresets = new Set<ExperimentPresetId>([
		...STIMULUS_PRESETS.map(({ id }) => id),
		'custom'
	]);
	if (!validPresets.has(preset))
		throw new TypeError(`Unknown stimulus preset: ${candidate.preset}.`);
	if (
		typeof candidate.durationMs !== 'number' ||
		!Number.isFinite(candidate.durationMs) ||
		typeof candidate.dtMs !== 'number' ||
		!Number.isFinite(candidate.dtMs) ||
		typeof candidate.seed !== 'number' ||
		!Number.isFinite(candidate.seed)
	) {
		throw new TypeError('Experiment duration, time step, and seed must be finite numbers.');
	}
	const count = simulationStepCount(candidate.durationMs, candidate.dtMs);
	const customWaveform = candidate.customWaveform;
	if (preset === 'custom') {
		if (!Array.isArray(customWaveform) || customWaveform.length !== count) {
			throw new RangeError('Custom waveform length must match duration divided by time step.');
		}
		for (const value of customWaveform) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 1) {
				throw new RangeError('Custom waveform samples must be finite and within [-1, 1].');
			}
		}
		if (
			candidate.customWaveformHash &&
			hashNumbers(customWaveform) !== candidate.customWaveformHash
		) {
			throw new Error('Custom waveform hash does not match its samples.');
		}
	}
	const phenotype = candidate.phenotypes?.izhikevich ?? 'regular-spiking';
	if (!IZHIKEVICH_PHENOTYPE_IDS.has(phenotype)) {
		throw new TypeError(`Unknown Izhikevich phenotype: ${phenotype}.`);
	}
	return {
		version: 1,
		preset,
		presetParameters: candidate.presetParameters ?? {},
		seed: normalizeSeed(candidate.seed),
		durationMs: candidate.durationMs,
		dtMs: candidate.dtMs,
		gains: validateGains(candidate.gains),
		phenotypes: { izhikevich: phenotype },
		modelParameters: candidate.modelParameters,
		customWaveform: customWaveform ? [...customWaveform] : undefined,
		customWaveformHash: candidate.customWaveformHash
	};
}

export function stimulusFromSerializedState(state: SerializedExperimentStateV1): Float64Array {
	if (state.preset === 'custom') {
		if (!state.customWaveform) throw new TypeError('Custom experiment has no waveform.');
		return Float64Array.from(state.customWaveform);
	}
	return generateStimulus(state.preset, {
		durationMs: state.durationMs,
		dtMs: state.dtMs,
		seed: state.seed,
		isiMs: state.presetParameters.isiMs
	});
}
