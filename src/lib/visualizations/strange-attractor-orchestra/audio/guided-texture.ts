import type { AudioIntensityMode } from './contracts';
import { AUDIO_PERFORMANCE_TRANSITION_SECONDS, audioIntensityTargets } from './performance';
import { seededNoiseSamples } from './seeded-noise';
import { safeRamp } from './safety';

export type GuidedTextureDebugSnapshot = Readonly<{
	active: boolean;
	targetGain: number;
}>;

function rampParameter(parameter: AudioParam, target: number, at: number, seconds: number): void {
	parameter.cancelScheduledValues(at);
	parameter.setValueAtTime(parameter.value, at);
	if (seconds <= 0) {
		parameter.setValueAtTime(target, at);
		return;
	}
	parameter.linearRampToValueAtTime(target, at + safeRamp(seconds));
}

function createSeamSoftenedNoise(context: BaseAudioContext, seed: string | number): AudioBuffer {
	const length = Math.max(1, Math.round(context.sampleRate * 4));
	const samples = seededNoiseSamples(length, 'pink', `${seed}|guided-intro-texture`);
	const seamLength = Math.min(2_048, Math.floor(length / 8));
	for (let index = 0; index < seamLength; index += 1) {
		const mix = (index + 1) / seamLength;
		const tailIndex = length - seamLength + index;
		samples[tailIndex] = samples[tailIndex] * (1 - mix) + samples[index] * mix;
	}
	const buffer = context.createBuffer(1, length, context.sampleRate);
	buffer.copyToChannel(samples, 0);
	return buffer;
}

/** One low-level, filtered, continuously looping texture used only by guided shot 3. */
export class GuidedIntroTextureLayer {
	private readonly source: AudioBufferSourceNode;
	private readonly filter: BiquadFilterNode;
	private readonly gain: GainNode;
	private active = false;
	private targetGain = 0;
	private disposed = false;

	constructor(
		private readonly context: BaseAudioContext,
		destination: AudioNode,
		seed: string | number
	) {
		this.source = context.createBufferSource();
		this.source.buffer = createSeamSoftenedNoise(context, seed);
		this.source.loop = true;
		this.filter = context.createBiquadFilter();
		this.filter.type = 'bandpass';
		this.filter.frequency.value = 520;
		this.filter.Q.value = 0.82;
		this.gain = context.createGain();
		this.gain.gain.value = 0;
		this.source.connect(this.filter).connect(this.gain).connect(destination);
		this.source.start();
	}

	setState(
		active: boolean,
		intensity: AudioIntensityMode,
		at = this.context.currentTime,
		transitionSeconds = AUDIO_PERFORMANCE_TRANSITION_SECONDS
	): void {
		if (this.disposed) return;
		const targets = audioIntensityTargets(intensity);
		this.active = active;
		this.targetGain = active ? targets.textureGain : 0;
		rampParameter(this.gain.gain, this.targetGain, at, transitionSeconds);
		rampParameter(this.filter.frequency, targets.textureFrequencyHz, at, transitionSeconds);
		rampParameter(this.filter.Q, targets.textureQ, at, transitionSeconds);
	}

	debugSnapshot(): GuidedTextureDebugSnapshot {
		return { active: this.active, targetGain: this.targetGain };
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		try {
			this.source.stop();
		} catch {
			// The source may already have ended during context teardown.
		}
		for (const node of [this.source, this.filter, this.gain]) {
			try {
				node.disconnect();
			} catch {
				// Teardown is intentionally idempotent.
			}
		}
	}
}
