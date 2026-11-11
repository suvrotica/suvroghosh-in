import type { RepairShopGameState, RepairShopSettings } from './types';
import { distance2D } from './world';

export type RepairSfxKind =
	| 'click'
	| 'screw'
	| 'cover'
	| 'connector'
	| 'gear'
	| 'belt'
	| 'film'
	| 'success'
	| 'cutout'
	| 'chime'
	| 'step-oxide'
	| 'step-tarmac'
	| 'step-brick';

/**
 * Instance-owned procedural Web Audio soundscape for The Repair Shop on the Corner.
 * Starts strictly after an explicit player gesture, suspends when muted or tab-hidden,
 * and closes its AudioContext cleanly on route teardown.
 */
export class RepairShopAudio {
	private ctx: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	private fanGain: GainNode | null = null;
	private radioGain: GainNode | null = null;
	private projectorGain: GainNode | null = null;
	private disposed = false;
	private enabled = false;
	private hiddenPaused = false;
	private volume = 0.72;
	private nextClockTickAt = 0;
	private nextRadioNoteAt = 0;
	private nextBirdAt = 0;
	private radioMelodyIndex = 0;

	async enableFromGesture(existingContext?: AudioContext): Promise<boolean> {
		if (this.disposed) return false;
		try {
			if (!this.ctx) {
				const AudioCtor =
					window.AudioContext ??
					(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
				if (!AudioCtor && !existingContext) return false;
				this.ctx = existingContext ?? new AudioCtor();
				this.setupContinuousBed();
			}
			if (this.ctx.state === 'suspended') {
				await this.ctx.resume();
			}
			this.enabled = true;
			this.syncMasterGain();
			return this.ctx.state === 'running';
		} catch {
			return false;
		}
	}

	private setupContinuousBed(): void {
		if (!this.ctx) return;
		const ctx = this.ctx;
		this.masterGain = ctx.createGain();
		this.masterGain.gain.value = 0;
		this.masterGain.connect(ctx.destination);

		// Soft noise buffer for ceiling fan air & projector flutter
		const bufferSize = ctx.sampleRate * 2;
		const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const channel = noiseBuffer.getChannelData(0);
		let lastOut = 0;
		for (let i = 0; i < bufferSize; i += 1) {
			const white = Math.random() * 2 - 1;
			lastOut = (lastOut + 0.03 * white) / 1.03;
			channel[i] = lastOut * 1.8;
		}

		// Ceiling fan gentle lowpass whoosh
		const fanSource = ctx.createBufferSource();
		fanSource.buffer = noiseBuffer;
		fanSource.loop = true;
		const fanFilter = ctx.createBiquadFilter();
		fanFilter.type = 'lowpass';
		fanFilter.frequency.value = 185;
		this.fanGain = ctx.createGain();
		this.fanGain.gain.value = 0;
		fanSource.connect(fanFilter);
		fanFilter.connect(this.fanGain);
		this.fanGain.connect(this.masterGain);
		fanSource.start();

		// Repaired radio warm AM carrier bed
		this.radioGain = ctx.createGain();
		this.radioGain.gain.value = 0;
		this.radioGain.connect(this.masterGain);

		// Projector gentle motor hum
		const projOsc = ctx.createOscillator();
		projOsc.type = 'triangle';
		projOsc.frequency.value = 72;
		const projFilter = ctx.createBiquadFilter();
		projFilter.type = 'lowpass';
		projFilter.frequency.value = 220;
		this.projectorGain = ctx.createGain();
		this.projectorGain.gain.value = 0;
		projOsc.connect(projFilter);
		projFilter.connect(this.projectorGain);
		this.projectorGain.connect(this.masterGain);
		projOsc.start();
	}

	setSettings(settings: RepairShopSettings): void {
		this.enabled = settings.soundEnabled;
		this.volume = Math.max(0, Math.min(1, settings.masterVolume));
		this.syncMasterGain();
	}

	setHidden(hidden: boolean): void {
		this.hiddenPaused = hidden;
		this.syncMasterGain();
		if (!this.ctx || this.disposed) return;
		if (hidden && this.ctx.state === 'running') {
			void this.ctx.suspend().catch(() => undefined);
		} else if (!hidden && this.enabled && this.ctx.state === 'suspended') {
			void this.ctx.resume().catch(() => undefined);
		}
	}

	private syncMasterGain(): void {
		if (!this.ctx || !this.masterGain) return;
		const target = this.enabled && !this.hiddenPaused ? this.volume * 0.45 : 0;
		this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
	}

	updateWorldFrame(state: RepairShopGameState): void {
		if (!this.ctx || !this.enabled || this.hiddenPaused || this.ctx.state !== 'running') return;
		const now = this.ctx.currentTime;

		// 1. Shop ceiling fan proximity
		const shopDist = distance2D(state.playerPos, { x: -1.8, z: -2.0 });
		const inShopFactor = state.mode === 'workbench' ? 0.24 : Math.max(0, 1 - shopDist / 6.5) * 0.2;
		this.fanGain?.gain.setTargetAtTime(inShopFactor, now, 0.12);

		// 2. Radio melody (either on workbench when powered & seated, or at Bapi's tea stall when returned)
		let radioAudibility = 0;
		if (
			state.mode === 'workbench' &&
			state.workbench?.activeJob === 'radio' &&
			state.radio.powerOn &&
			state.radio.batteryClipSeated &&
			state.radio.speakerConnectorSeated
		) {
			radioAudibility = state.radio.stationTuned ? 0.34 : 0.08;
		} else if (state.unlocks.teaStallRadioPlaying && state.mode !== 'screening') {
			const teaDist = distance2D(state.playerPos, { x: 8.0, z: 2.8 });
			radioAudibility = Math.max(0, 1 - teaDist / 9.5) * 0.24;
		}

		if (radioAudibility > 0.02 && now >= this.nextRadioNoteAt) {
			this.playWarmRadioNote(radioAudibility);
			this.nextRadioNoteAt = now + 0.52;
		}

		// 3. Repaired clock tick-tock (on workbench when tested or at Sen Brothers when returned)
		let clockAudibility = 0;
		if (
			state.mode === 'workbench' &&
			state.workbench?.activeJob === 'clock' &&
			state.clock.mechanismTested
		) {
			clockAudibility = 0.25;
		} else if (state.unlocks.shopClockTicking && state.mode !== 'screening') {
			const clockDist = distance2D(state.playerPos, { x: 4.25, z: -0.35 });
			clockAudibility = Math.max(0, 1 - clockDist / 7.5) * 0.2;
		}
		if (clockAudibility > 0.02 && now >= this.nextClockTickAt) {
			this.playClockTick(clockAudibility);
			this.nextClockTickAt = now + 0.5;
		}

		// 4. Projector purr (on workbench when running or in courtyard screening)
		let projLevel = 0;
		if (
			state.mode === 'workbench' &&
			state.workbench?.activeJob === 'projector' &&
			state.projector.powerOn
		) {
			projLevel = 0.16;
		} else if (state.afternoonPhase === 'screening') {
			projLevel = 0.14;
			if (now >= this.nextRadioNoteAt) {
				this.playWarmRadioNote(0.18);
				this.nextRadioNoteAt = now + 0.68;
			}
		}
		this.projectorGain?.gain.setTargetAtTime(projLevel, now, 0.1);

		// 5. Occasional gentle afternoon bird call outdoors
		if (
			state.mode === 'explore' &&
			state.afternoonPhase !== 'screening' &&
			now >= this.nextBirdAt
		) {
			if (this.nextBirdAt > 0) this.playDistantSparrow();
			this.nextBirdAt = now + 6.5 + Math.random() * 5;
		}
	}

	private playWarmRadioNote(level: number): void {
		if (!this.ctx || !this.masterGain) return;
		const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
		const freq = scale[this.radioMelodyIndex % scale.length];
		this.radioMelodyIndex += 1;

		const now = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const bandpass = this.ctx.createBiquadFilter();
		const gain = this.ctx.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(freq, now);
		bandpass.type = 'bandpass';
		bandpass.frequency.value = 950;
		bandpass.Q.value = 1.4;

		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(level * 0.22, now + 0.05);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);

		osc.connect(bandpass);
		bandpass.connect(gain);
		gain.connect(this.masterGain);
		osc.start(now);
		osc.stop(now + 0.48);
	}

	private playClockTick(level: number): void {
		if (!this.ctx || !this.masterGain) return;
		const now = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(this.radioMelodyIndex % 2 === 0 ? 1320 : 1080, now);
		gain.gain.setValueAtTime(level * 0.16, now);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
		osc.connect(gain);
		gain.connect(this.masterGain);
		osc.start(now);
		osc.stop(now + 0.04);
		this.radioMelodyIndex += 1;
	}

	private playDistantSparrow(): void {
		if (!this.ctx || !this.masterGain) return;
		const now = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(2450, now);
		osc.frequency.exponentialRampToValueAtTime(2950, now + 0.06);
		osc.frequency.exponentialRampToValueAtTime(2300, now + 0.13);
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.035, now + 0.03);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
		osc.connect(gain);
		gain.connect(this.masterGain);
		osc.start(now);
		osc.stop(now + 0.16);
	}

	playSfx(kind: RepairSfxKind): void {
		if (!this.ctx || !this.masterGain || !this.enabled || this.hiddenPaused) return;
		if (this.ctx.state !== 'running') return;
		const now = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		osc.connect(gain);
		gain.connect(this.masterGain);

		switch (kind) {
			case 'screw':
				osc.type = 'triangle';
				osc.frequency.setValueAtTime(520, now);
				osc.frequency.linearRampToValueAtTime(680, now + 0.09);
				gain.gain.setValueAtTime(0.14, now);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
				osc.start(now);
				osc.stop(now + 0.12);
				break;
			case 'connector':
				osc.type = 'square';
				osc.frequency.setValueAtTime(880, now);
				osc.frequency.setValueAtTime(1180, now + 0.03);
				gain.gain.setValueAtTime(0.1, now);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
				osc.start(now);
				osc.stop(now + 0.09);
				break;
			case 'cutout':
				osc.type = 'sawtooth';
				osc.frequency.setValueAtTime(340, now);
				osc.frequency.exponentialRampToValueAtTime(110, now + 0.16);
				gain.gain.setValueAtTime(0.12, now);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
				osc.start(now);
				osc.stop(now + 0.19);
				break;
			case 'gear':
				osc.type = 'sine';
				osc.frequency.setValueAtTime(740, now);
				osc.frequency.exponentialRampToValueAtTime(980, now + 0.06);
				gain.gain.setValueAtTime(0.14, now);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
				osc.start(now);
				osc.stop(now + 0.09);
				break;
			case 'chime':
			case 'success':
				osc.type = 'sine';
				osc.frequency.setValueAtTime(523.25, now);
				osc.frequency.setValueAtTime(659.25, now + 0.11);
				osc.frequency.setValueAtTime(783.99, now + 0.22);
				gain.gain.setValueAtTime(0.16, now);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
				osc.start(now);
				osc.stop(now + 0.56);
				break;
			case 'step-oxide':
			case 'step-tarmac':
			case 'step-brick': {
				const baseFreq = kind === 'step-oxide' ? 145 : kind === 'step-brick' ? 190 : 165;
				osc.type = 'sine';
				osc.frequency.setValueAtTime(baseFreq, now);
				osc.frequency.exponentialRampToValueAtTime(65, now + 0.05);
				gain.gain.setValueAtTime(0.07, now);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
				osc.start(now);
				osc.stop(now + 0.06);
				break;
			}
			default:
				osc.type = 'triangle';
				osc.frequency.setValueAtTime(440, now);
				gain.gain.setValueAtTime(0.1, now);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
				osc.start(now);
				osc.stop(now + 0.08);
				break;
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.enabled = false;
		const ctx = this.ctx;
		this.ctx = null;
		this.masterGain = null;
		this.fanGain = null;
		this.radioGain = null;
		this.projectorGain = null;
		if (ctx && ctx.state !== 'closed') {
			void ctx.close().catch(() => undefined);
		}
	}
}
