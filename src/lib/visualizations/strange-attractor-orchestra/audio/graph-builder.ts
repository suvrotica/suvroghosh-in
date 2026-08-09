import type { AudioIntensityMode, SoundWorldPatch } from './contracts';
import {
	conductingTargets,
	INACTIVE_CONDUCTING_STATE,
	sanitizeConductingState,
	type ConductingState
} from './conducting';
import {
	AUDIO_EMERGENCY_RAMP_SECONDS,
	AUDIO_INITIAL_VOLUME,
	AUDIO_POST_COMPRESSOR_MAKEUP_GAIN,
	AUDIO_RESUME_RAMP_SECONDS,
	clamp,
	createSoftClipCurve,
	safeMasterVolume,
	safeRamp
} from './safety';
import {
	AUDIO_PERFORMANCE_TRANSITION_SECONDS,
	audioIntensityTargets,
	safeAudioIntensityMode
} from './performance';

export type WorldBusIndex = 0 | 1;

type EffectPatch = Pick<SoundWorldPatch, 'effectDelaySeconds' | 'effectFeedback' | 'effectWetGain'>;

type EffectState = Readonly<{
	delaySeconds: number;
	feedback: number;
	wetGain: number;
}>;

const DEFAULT_EFFECT_STATE: EffectState = Object.freeze({
	delaySeconds: 0.19,
	feedback: 0.17,
	wetGain: 0.13
});

export type MasterGraphDebugSnapshot = Readonly<{
	activeWorldBus: WorldBusIndex;
	masterVolume: number;
	transportGain: number;
	emergencySilenced: boolean;
	intensityMode: AudioIntensityMode;
	intensityToneGainDb: number;
	makeupGain: number;
	effect: EffectState;
	conducting: ConductingState;
}>;

function cancelAndSet(parameter: AudioParam, value: number, at: number): void {
	parameter.cancelScheduledValues(at);
	parameter.setValueAtTime(value, at);
}

function smoothTarget(
	parameter: AudioParam,
	target: number,
	at: number,
	timeConstant: number
): void {
	parameter.cancelScheduledValues(at);
	parameter.setValueAtTime(parameter.value, at);
	parameter.setTargetAtTime(target, at, timeConstant);
}

function linearTarget(parameter: AudioParam, target: number, at: number, seconds: number): void {
	parameter.cancelScheduledValues(at);
	parameter.setValueAtTime(parameter.value, at);
	if (seconds <= 0) {
		parameter.setValueAtTime(target, at);
		return;
	}
	parameter.linearRampToValueAtTime(target, at + safeRamp(seconds));
}

/**
 * Shared output graph for real-time and OfflineAudioContext rendering.
 *
 * Voices enter one of two world buses. Alternating those buses lets an old patch decay while new
 * events enter the next patch without reconnecting the hearing-safety chain.
 */
export class OrchestraMasterGraph {
	readonly worldBuses: readonly [GainNode, GainNode];
	readonly highPass: BiquadFilterNode;
	readonly conductingTone: BiquadFilterNode;
	readonly intensityTone: BiquadFilterNode;
	readonly mixInput: GainNode;
	readonly dryGain: GainNode;
	readonly effectDelay: DelayNode;
	readonly effectFilter: BiquadFilterNode;
	readonly effectFeedback: GainNode;
	readonly effectWet: GainNode;
	readonly compressor: DynamicsCompressorNode;
	readonly makeup: GainNode;
	readonly softClipper: WaveShaperNode;
	readonly conductingPan: StereoPannerNode;
	readonly transport: GainNode;
	readonly master: GainNode;
	/** Stable post-world-bus input for ephemeral layers such as the guided shot-3 texture. */
	readonly ephemeralInput: GainNode;

	private activeBus: WorldBusIndex = 0;
	private volume: number;
	private emergency = false;
	private conductingState: ConductingState = INACTIVE_CONDUCTING_STATE;
	private intensityMode: AudioIntensityMode = 'standard';
	private effectState: EffectState;
	private disposed = false;

	constructor(
		private readonly context: BaseAudioContext,
		initialVolume = AUDIO_INITIAL_VOLUME,
		initialEffect?: EffectPatch
	) {
		const busA = context.createGain();
		const busB = context.createGain();
		busA.gain.value = 1;
		busB.gain.value = 0;
		this.worldBuses = [busA, busB];

		this.highPass = context.createBiquadFilter();
		this.highPass.type = 'highpass';
		this.highPass.frequency.value = 30;
		this.highPass.Q.value = 0.72;
		this.conductingTone = context.createBiquadFilter();
		this.conductingTone.type = 'highshelf';
		this.conductingTone.frequency.value = 1_800;
		this.conductingTone.gain.value = 0;
		this.intensityTone = context.createBiquadFilter();
		this.intensityTone.type = 'highshelf';
		this.intensityTone.frequency.value = 1_650;
		this.intensityTone.gain.value = 0;
		this.ephemeralInput = context.createGain();
		this.ephemeralInput.gain.value = 1;
		this.mixInput = context.createGain();
		this.mixInput.gain.value = 1;
		this.dryGain = context.createGain();
		this.dryGain.gain.value = 1;
		this.effectDelay = context.createDelay(1);
		this.effectFilter = context.createBiquadFilter();
		this.effectFilter.type = 'lowpass';
		this.effectFilter.frequency.value = 3_600;
		this.effectFilter.Q.value = 0.62;
		this.effectFeedback = context.createGain();
		this.effectWet = context.createGain();
		this.effectState = initialEffect
			? {
					delaySeconds: clamp(initialEffect.effectDelaySeconds, 0.04, 0.9),
					feedback: clamp(initialEffect.effectFeedback, 0, 0.28),
					wetGain: clamp(initialEffect.effectWetGain, 0, 0.18)
				}
			: DEFAULT_EFFECT_STATE;
		this.effectDelay.delayTime.value = this.effectState.delaySeconds;
		this.effectFeedback.gain.value = this.effectState.feedback;
		this.effectWet.gain.value = this.effectState.wetGain;

		this.compressor = context.createDynamicsCompressor();
		this.compressor.threshold.value = -20;
		this.compressor.knee.value = 18;
		this.compressor.ratio.value = 5;
		this.compressor.attack.value = 0.006;
		this.compressor.release.value = 0.22;
		this.makeup = context.createGain();
		this.makeup.gain.value = AUDIO_POST_COMPRESSOR_MAKEUP_GAIN;

		this.softClipper = context.createWaveShaper();
		this.softClipper.curve = createSoftClipCurve();
		this.softClipper.oversample = '2x';
		this.conductingPan = context.createStereoPanner();
		this.conductingPan.pan.value = 0;

		this.transport = context.createGain();
		this.transport.gain.value = 1;
		this.master = context.createGain();
		this.volume = safeMasterVolume(initialVolume);
		this.master.gain.value = this.volume;

		busA.connect(this.mixInput);
		busB.connect(this.mixInput);
		this.ephemeralInput.connect(this.mixInput);
		this.mixInput.connect(this.dryGain).connect(this.highPass);
		this.mixInput.connect(this.effectDelay);
		this.effectDelay.connect(this.effectFilter);
		this.effectFilter.connect(this.effectWet).connect(this.highPass);
		this.effectFilter.connect(this.effectFeedback).connect(this.effectDelay);
		this.highPass
			.connect(this.conductingTone)
			.connect(this.intensityTone)
			.connect(this.compressor)
			.connect(this.conductingPan)
			.connect(this.makeup)
			.connect(this.softClipper)
			.connect(this.transport)
			.connect(this.master)
			.connect(context.destination);
	}

	get destination(): GainNode {
		this.ensureActive();
		return this.worldBuses[this.activeBus];
	}

	get activeWorldBus(): WorldBusIndex {
		return this.activeBus;
	}

	get masterVolume(): number {
		return this.volume;
	}

	setVolume(value: number, at = this.context.currentTime, rampSeconds = 0.04): number {
		this.ensureActive();
		this.volume = safeMasterVolume(value);
		if (this.emergency) return this.volume;
		const ramp = safeRamp(rampSeconds);
		cancelAndSet(this.master.gain, Math.max(0, this.master.gain.value), at);
		this.master.gain.linearRampToValueAtTime(this.volume, at + ramp);
		return this.volume;
	}

	setConducting(
		horizontal: number,
		vertical: number,
		active: boolean,
		at = this.context.currentTime
	): ConductingState {
		this.ensureActive();
		this.conductingState = sanitizeConductingState(horizontal, vertical, active);
		const targets = conductingTargets(this.conductingState);
		// Pointer updates respond quickly; release uses a longer exponential ease to baseline.
		const timeConstant = this.conductingState.active ? 0.035 : 0.075;
		smoothTarget(this.conductingPan.pan, targets.pan, at, timeConstant);
		smoothTarget(this.conductingTone.gain, targets.toneGainDb, at, timeConstant);
		return this.conductingState;
	}

	setIntensityMode(
		value: AudioIntensityMode,
		at = this.context.currentTime,
		transitionSeconds = AUDIO_PERFORMANCE_TRANSITION_SECONDS
	): AudioIntensityMode {
		this.ensureActive();
		this.intensityMode = safeAudioIntensityMode(value);
		const target = audioIntensityTargets(this.intensityMode).brightnessShelfDb;
		this.intensityTone.gain.cancelScheduledValues(at);
		this.intensityTone.gain.setValueAtTime(this.intensityTone.gain.value, at);
		if (transitionSeconds <= 0) {
			this.intensityTone.gain.setValueAtTime(target, at);
		} else {
			this.intensityTone.gain.linearRampToValueAtTime(target, at + safeRamp(transitionSeconds));
		}
		return this.intensityMode;
	}

	setEffectPatch(
		patch: EffectPatch,
		at = this.context.currentTime,
		transitionSeconds = AUDIO_PERFORMANCE_TRANSITION_SECONDS
	): EffectState {
		this.ensureActive();
		this.effectState = {
			delaySeconds: clamp(patch.effectDelaySeconds, 0.04, 0.9),
			feedback: clamp(patch.effectFeedback, 0, 0.28),
			wetGain: clamp(patch.effectWetGain, 0, 0.18)
		};
		linearTarget(this.effectDelay.delayTime, this.effectState.delaySeconds, at, transitionSeconds);
		linearTarget(
			this.effectFeedback.gain,
			this.emergency ? 0 : this.effectState.feedback,
			at,
			transitionSeconds
		);
		linearTarget(
			this.effectWet.gain,
			this.emergency ? 0 : this.effectState.wetGain,
			at,
			transitionSeconds
		);
		return this.effectState;
	}

	/** Returns the bus into which all newly scheduled voices should connect. */
	crossfadeWorld(
		patch: Pick<SoundWorldPatch, 'transitionSeconds'>,
		at = this.context.currentTime
	): GainNode {
		this.ensureActive();
		const previous = this.activeBus;
		const next: WorldBusIndex = previous === 0 ? 1 : 0;
		const duration = safeRamp(patch.transitionSeconds, 0.45);
		const oldGain = this.worldBuses[previous].gain;
		const newGain = this.worldBuses[next].gain;

		cancelAndSet(oldGain, Math.max(0, Math.min(1, oldGain.value)), at);
		cancelAndSet(newGain, 0, at);
		// A paired cosine curve would need many automation points. These conservative ramps retain
		// overlap without summing two full-scale buses at the midpoint.
		oldGain.linearRampToValueAtTime(0, at + duration);
		newGain.linearRampToValueAtTime(0.82, at + duration * 0.5);
		newGain.linearRampToValueAtTime(1, at + duration);
		this.activeBus = next;
		return this.worldBuses[next];
	}

	setTransportAudible(audible: boolean, at = this.context.currentTime, rampSeconds?: number): void {
		this.ensureActive();
		if (this.emergency && audible) return;
		const duration = safeRamp(
			rampSeconds ?? (audible ? AUDIO_RESUME_RAMP_SECONDS : 0.035),
			audible ? AUDIO_RESUME_RAMP_SECONDS : 0.035
		);
		cancelAndSet(this.transport.gain, Math.max(0, Math.min(1, this.transport.gain.value)), at);
		this.transport.gain.linearRampToValueAtTime(audible ? 1 : 0, at + duration);
	}

	emergencySilence(at = this.context.currentTime): void {
		if (this.disposed) return;
		this.emergency = true;
		for (const bus of this.worldBuses) {
			cancelAndSet(bus.gain, Math.max(0, Math.min(1, bus.gain.value)), at);
			bus.gain.linearRampToValueAtTime(0, at + AUDIO_EMERGENCY_RAMP_SECONDS);
		}
		cancelAndSet(this.transport.gain, Math.max(0, this.transport.gain.value), at);
		this.transport.gain.linearRampToValueAtTime(0, at + AUDIO_EMERGENCY_RAMP_SECONDS);
		cancelAndSet(this.master.gain, Math.max(0, this.master.gain.value), at);
		this.master.gain.linearRampToValueAtTime(0, at + AUDIO_EMERGENCY_RAMP_SECONDS);
		linearTarget(this.effectFeedback.gain, 0, at, AUDIO_EMERGENCY_RAMP_SECONDS);
		linearTarget(this.effectWet.gain, 0, at, AUDIO_EMERGENCY_RAMP_SECONDS);
	}

	clearEmergencySilence(at = this.context.currentTime): void {
		this.ensureActive();
		this.emergency = false;
		const inactive: WorldBusIndex = this.activeBus === 0 ? 1 : 0;
		cancelAndSet(this.worldBuses[inactive].gain, 0, at);
		cancelAndSet(this.worldBuses[this.activeBus].gain, 0, at);
		this.worldBuses[this.activeBus].gain.linearRampToValueAtTime(1, at + AUDIO_RESUME_RAMP_SECONDS);
		cancelAndSet(this.transport.gain, 0, at);
		this.transport.gain.linearRampToValueAtTime(1, at + AUDIO_RESUME_RAMP_SECONDS);
		cancelAndSet(this.master.gain, 0, at);
		this.master.gain.linearRampToValueAtTime(this.volume, at + AUDIO_RESUME_RAMP_SECONDS);
		linearTarget(
			this.effectFeedback.gain,
			this.effectState.feedback,
			at,
			AUDIO_RESUME_RAMP_SECONDS
		);
		linearTarget(this.effectWet.gain, this.effectState.wetGain, at, AUDIO_RESUME_RAMP_SECONDS);
	}

	debugSnapshot(): MasterGraphDebugSnapshot {
		return {
			activeWorldBus: this.activeBus,
			masterVolume: this.volume,
			transportGain: this.transport.gain.value,
			emergencySilenced: this.emergency,
			intensityMode: this.intensityMode,
			intensityToneGainDb: audioIntensityTargets(this.intensityMode).brightnessShelfDb,
			makeupGain: AUDIO_POST_COMPRESSOR_MAKEUP_GAIN,
			effect: this.effectState,
			conducting: this.conductingState
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		try {
			cancelAndSet(this.conductingPan.pan, 0, this.context.currentTime);
			cancelAndSet(this.conductingTone.gain, 0, this.context.currentTime);
		} catch {
			// Offline contexts may already have completed their automation timeline.
		}
		this.conductingState = INACTIVE_CONDUCTING_STATE;
		for (const node of [
			...this.worldBuses,
			this.highPass,
			this.conductingTone,
			this.intensityTone,
			this.mixInput,
			this.dryGain,
			this.effectDelay,
			this.effectFilter,
			this.effectFeedback,
			this.effectWet,
			this.compressor,
			this.makeup,
			this.softClipper,
			this.conductingPan,
			this.transport,
			this.master,
			this.ephemeralInput
		]) {
			try {
				node.disconnect();
			} catch {
				// Disconnection is intentionally idempotent across route and HMR teardown.
			}
		}
	}

	private ensureActive(): void {
		if (this.disposed) throw new Error('The orchestra audio graph has been disposed.');
	}
}

export function createOrchestraMasterGraph(
	context: BaseAudioContext,
	volume = AUDIO_INITIAL_VOLUME,
	initialEffect?: EffectPatch
): OrchestraMasterGraph {
	return new OrchestraMasterGraph(context, volume, initialEffect);
}
