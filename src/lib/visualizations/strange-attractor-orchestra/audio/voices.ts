import type { AudioObservationView, NoiseColour, SonicEvent, SoundWorldPatch } from './contracts';
import { buildVoicePlan, type AudioVoicePlan } from './mapping';
import { seededNoiseSamples } from './seeded-noise';
import {
	AUDIO_EMERGENCY_RAMP_SECONDS,
	AUDIO_MAX_VOICES,
	AUDIO_MIN_RAMP_SECONDS,
	clamp,
	safeRamp
} from './safety';

export type ScheduledVoiceSnapshot = Readonly<{
	id: string;
	startTime: number;
	stopTime: number;
	pan: number;
	baseFrequencyHz: number;
}>;

export interface ScheduledVoice {
	readonly snapshot: ScheduledVoiceSnapshot;
	setPolyphonyScale(scale: number, at?: number, rampSeconds?: number): void;
	stop(at?: number, rampSeconds?: number): void;
	dispose(): void;
}

type VoiceNodes = Readonly<{
	noise: AudioBufferSourceNode;
	oscillator: OscillatorNode;
	filters: readonly BiquadFilterNode[];
	modalGains: readonly GainNode[];
	oscillatorGain: GainNode;
	sum: GainNode;
	envelope: GainNode;
	polyphonyGain: GainNode;
	panner: StereoPannerNode;
}>;

function createNoiseBuffer(
	context: BaseAudioContext,
	durationSeconds: number,
	colour: NoiseColour,
	seed: string
): AudioBuffer {
	const length = Math.max(1, Math.ceil(context.sampleRate * durationSeconds));
	const buffer = context.createBuffer(1, length, context.sampleRate);
	buffer.copyToChannel(seededNoiseSamples(length, colour, seed), 0);
	return buffer;
}

function disconnectNodes(nodes: VoiceNodes): void {
	for (const node of [
		nodes.noise,
		nodes.oscillator,
		...nodes.filters,
		...nodes.modalGains,
		nodes.oscillatorGain,
		nodes.sum,
		nodes.envelope,
		nodes.polyphonyGain,
		nodes.panner
	]) {
		try {
			node.disconnect();
		} catch {
			// A partially constructed or already-ended voice is safe to disconnect again.
		}
	}
}

function scheduleVoice(
	context: BaseAudioContext,
	destination: AudioNode,
	plan: AudioVoicePlan,
	patch: SoundWorldPatch,
	audioTime: number,
	polyphonyScale: number,
	onEnded: () => void
): ScheduledVoice {
	const start = Math.max(0, audioTime);
	const duration = Math.max(
		plan.durationSeconds,
		plan.attackSeconds + plan.holdSeconds + plan.releaseSeconds
	);
	const stopTime = start + duration;
	const noise = context.createBufferSource();
	noise.buffer = createNoiseBuffer(
		context,
		Math.min(duration, plan.excitationSeconds),
		patch.noiseColour,
		plan.noiseSeed
	);
	const sum = context.createGain();
	const modalTotal = Math.max(
		0.0001,
		plan.modalGains.reduce((total, gain) => total + Math.max(0, gain), 0)
	);
	const filters = plan.modalFrequenciesHz.map((frequency, index) => {
		const filter = context.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = frequency;
		filter.Q.value = patch.resonanceQ;
		const gain = context.createGain();
		gain.gain.value = (plan.modalGains[index] / modalTotal) * plan.noiseGain;
		noise.connect(filter).connect(gain).connect(sum);
		return { filter, gain };
	});

	const oscillator = context.createOscillator();
	oscillator.type = patch.id === 'magnetic' ? 'triangle' : patch.id === 'radio' ? 'sine' : 'sine';
	oscillator.frequency.value = plan.baseFrequencyHz;
	oscillator.detune.value = plan.detuneCents;
	const oscillatorGain = context.createGain();
	oscillatorGain.gain.value = plan.oscillatorGain;
	oscillator.connect(oscillatorGain).connect(sum);

	const envelope = context.createGain();
	const peak = clamp(patch.voiceGain * (0.3 + plan.intensity * 0.7), 0.0001, 0.18);
	const attackEnd = start + plan.attackSeconds;
	const releaseStart = Math.max(attackEnd, stopTime - plan.releaseSeconds);
	envelope.gain.setValueAtTime(0.0001, start);
	envelope.gain.exponentialRampToValueAtTime(peak, attackEnd);
	envelope.gain.setValueAtTime(peak, Math.min(releaseStart, attackEnd + plan.holdSeconds));
	envelope.gain.setValueAtTime(peak, releaseStart);
	envelope.gain.exponentialRampToValueAtTime(0.0001, stopTime);

	const panner = context.createStereoPanner();
	panner.pan.setValueAtTime(plan.pan, start);
	const polyphonyGain = context.createGain();
	const initialPolyphonyScale = clamp(polyphonyScale, 1 / Math.sqrt(AUDIO_MAX_VOICES), 1);
	polyphonyGain.gain.setValueAtTime(initialPolyphonyScale, start);
	sum.connect(envelope).connect(polyphonyGain).connect(panner).connect(destination);

	const nodes: VoiceNodes = {
		noise,
		oscillator,
		filters: filters.map(({ filter }) => filter),
		modalGains: filters.map(({ gain }) => gain),
		oscillatorGain,
		sum,
		envelope,
		polyphonyGain,
		panner
	};
	let disposed = false;
	let ended = false;
	const finish = () => {
		if (ended) return;
		ended = true;
		disconnectNodes(nodes);
		onEnded();
	};
	oscillator.addEventListener('ended', finish, { once: true });
	noise.start(start);
	noise.stop(Math.min(stopTime, start + plan.excitationSeconds));
	oscillator.start(start);
	oscillator.stop(stopTime + 0.01);

	return {
		snapshot: {
			id: plan.id,
			startTime: start,
			stopTime,
			pan: plan.pan,
			baseFrequencyHz: plan.baseFrequencyHz
		},
		setPolyphonyScale(scale, at = context.currentTime, rampSeconds = 0.012) {
			if (disposed || ended) return;
			const when = Math.max(0, at);
			const target = clamp(scale, 1 / Math.sqrt(AUDIO_MAX_VOICES), 1);
			const ramp = safeRamp(rampSeconds, 0.012);
			polyphonyGain.gain.cancelScheduledValues(when);
			polyphonyGain.gain.setValueAtTime(
				clamp(polyphonyGain.gain.value, 1 / Math.sqrt(AUDIO_MAX_VOICES), 1),
				when
			);
			polyphonyGain.gain.linearRampToValueAtTime(target, when + ramp);
		},
		stop(at = context.currentTime, rampSeconds = 0.02) {
			if (disposed || ended) return;
			const when = Math.max(0, at);
			const ramp = safeRamp(rampSeconds, 0.02);
			envelope.gain.cancelScheduledValues(when);
			envelope.gain.setValueAtTime(Math.max(0.0001, Math.min(peak, envelope.gain.value)), when);
			envelope.gain.exponentialRampToValueAtTime(0.0001, when + ramp);
			for (const source of [noise, oscillator]) {
				try {
					source.stop(when + ramp + AUDIO_MIN_RAMP_SECONDS);
				} catch {
					// stop() may have been scheduled already; the envelope still performs the ramp.
				}
			}
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			try {
				noise.stop();
			} catch {
				// Already ended.
			}
			try {
				oscillator.stop();
			} catch {
				// Already ended.
			}
			finish();
		}
	};
}

export type VoicePoolDebugSnapshot = Readonly<{
	activeVoices: number;
	peakVoices: number;
	totalScheduled: number;
	polyphonyGainScale: number;
	voices: readonly ScheduledVoiceSnapshot[];
}>;

/** Owns every scheduled source and enforces the configured (never above six) voice ceiling. */
export class OrchestraVoicePool {
	private readonly voices = new Set<ScheduledVoice>();
	private readonly ownedVoices = new Set<ScheduledVoice>();
	private peakVoices = 0;
	private totalScheduled = 0;
	private disposed = false;

	constructor(
		private readonly context: BaseAudioContext,
		private destination: AudioNode,
		private readonly maxVoices = AUDIO_MAX_VOICES
	) {}

	setDestination(destination: AudioNode): void {
		this.ensureActive();
		this.destination = destination;
	}

	schedule(
		event: SonicEvent,
		patch: SoundWorldPatch,
		masterSeed: string | number,
		audioTime: number,
		eventIndex: number,
		observationView: AudioObservationView = 'braided'
	): ScheduledVoice {
		return this.schedulePlan(
			buildVoicePlan(event, patch, masterSeed, eventIndex, observationView),
			patch,
			audioTime
		);
	}

	schedulePlan(plan: AudioVoicePlan, patch: SoundWorldPatch, audioTime: number): ScheduledVoice {
		this.ensureActive();
		// Use the event's scheduled time rather than currentTime here. OfflineAudioContext keeps
		// currentTime at zero while its complete score is assembled, but the configured voice ceiling is
		// an overlap limit on the score timeline, not a limit on the number of retained source nodes.
		this.prune(audioTime);
		let safeAudioTime = audioTime;
		while (this.voices.size >= this.maxVoices) {
			const victim = [...this.voices].sort(
				(first, second) => first.snapshot.stopTime - second.snapshot.stopTime
			)[0];
			if (!victim) break;
			const retirementAt = Math.max(
				this.context.currentTime,
				Math.min(safeAudioTime, victim.snapshot.stopTime)
			);
			victim.stop(retirementAt, 0.012);
			this.voices.delete(victim);
			// The replacement begins after the victim's short ramp, so no more than the configured cap are
			// simultaneously audible even though the retiring nodes remain alive for cleanup.
			safeAudioTime = Math.max(safeAudioTime, retirementAt + 0.018);
		}

		const nextPolyphonyScale = 1 / Math.sqrt(Math.max(1, this.voices.size + 1));
		for (const activeVoice of this.voices) {
			activeVoice.setPolyphonyScale(nextPolyphonyScale, safeAudioTime);
		}
		const voice = scheduleVoice(
			this.context,
			this.destination,
			plan,
			patch,
			safeAudioTime,
			nextPolyphonyScale,
			() => {
				this.voices.delete(voice);
				this.ownedVoices.delete(voice);
				this.updatePolyphonyScale(this.context.currentTime);
			}
		);
		this.voices.add(voice);
		this.ownedVoices.add(voice);
		this.totalScheduled += 1;
		this.peakVoices = Math.max(this.peakVoices, this.voices.size);
		return voice;
	}

	cancelAfter(audioTime: number): number {
		let cancelled = 0;
		for (const voice of [...this.ownedVoices]) {
			if (voice.snapshot.startTime < audioTime) continue;
			voice.stop(Math.max(this.context.currentTime, audioTime - AUDIO_MIN_RAMP_SECONDS), 0.01);
			this.voices.delete(voice);
			cancelled += 1;
		}
		this.updatePolyphonyScale(this.context.currentTime);
		return cancelled;
	}

	stopAll(at = this.context.currentTime, rampSeconds = 0.025): void {
		for (const voice of [...this.ownedVoices]) voice.stop(at, rampSeconds);
	}

	emergencyStop(at = this.context.currentTime): void {
		this.stopAll(at, AUDIO_EMERGENCY_RAMP_SECONDS);
	}

	prune(at = this.context.currentTime): void {
		for (const voice of [...this.voices]) {
			if (voice.snapshot.stopTime + 0.05 >= at) continue;
			this.voices.delete(voice);
		}
	}

	debugSnapshot(): VoicePoolDebugSnapshot {
		this.prune(this.context.currentTime);
		return {
			activeVoices: this.voices.size,
			peakVoices: this.peakVoices,
			totalScheduled: this.totalScheduled,
			polyphonyGainScale: 1 / Math.sqrt(Math.max(1, this.voices.size)),
			voices: [...this.voices].map((voice) => voice.snapshot)
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const voice of [...this.ownedVoices]) voice.dispose();
		this.voices.clear();
		this.ownedVoices.clear();
	}

	private ensureActive(): void {
		if (this.disposed) throw new Error('The orchestra voice pool has been disposed.');
	}

	private updatePolyphonyScale(at: number): void {
		const target = 1 / Math.sqrt(Math.max(1, this.voices.size));
		for (const voice of this.voices) voice.setPolyphonyScale(target, at);
	}
}

/** The one event-to-node path shared by the real-time and offline renderers. */
export function scheduleSonicEvent(
	pool: OrchestraVoicePool,
	event: SonicEvent,
	patch: SoundWorldPatch,
	masterSeed: string | number,
	audioTime: number,
	eventIndex: number,
	observationView: AudioObservationView = 'braided'
): ScheduledVoice {
	return pool.schedule(event, patch, masterSeed, audioTime, eventIndex, observationView);
}
