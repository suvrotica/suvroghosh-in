export type GameSound =
	| 'warning'
	| 'horn'
	| 'bell'
	| 'bark'
	| 'splash'
	| 'tea'
	| 'snack'
	| 'bump'
	| 'stumble'
	| 'cow'
	| 'rain-start'
	| 'victory'
	| 'loss'
	| 'ominous';

type BrowserAudioContext = AudioContext & {
	resume(): Promise<void>;
};

/**
 * A deliberately small procedural sound palette. It owns one AudioContext, creates it only
 * after user intent, and disconnects every short-lived node after playback.
 */
export class CalcuttaAudio {
	private context: BrowserAudioContext | null = null;
	private master: GainNode | null = null;
	private rainSource: AudioBufferSourceNode | null = null;
	private rainGain: GainNode | null = null;
	private enabled = false;
	private destroyed = false;

	async setEnabled(enabled: boolean): Promise<void> {
		if (this.destroyed) return;
		this.enabled = enabled;
		if (!enabled) {
			if (this.master) this.master.gain.setTargetAtTime(0, this.master.context.currentTime, 0.03);
			return;
		}

		const context = this.ensureContext();
		if (!context) return;
		if (context.state === 'suspended') await context.resume().catch(() => undefined);
		this.master?.gain.setTargetAtTime(0.28, context.currentTime, 0.035);
	}

	private ensureContext(): BrowserAudioContext | null {
		if (this.context) return this.context;
		if (typeof window === 'undefined') return null;
		const AudioContextConstructor =
			window.AudioContext ??
			(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioContextConstructor) return null;

		const context = new AudioContextConstructor() as BrowserAudioContext;
		const master = context.createGain();
		master.gain.value = this.enabled ? 0.28 : 0;
		master.connect(context.destination);
		this.context = context;
		this.master = master;
		return context;
	}

	private tone(
		frequency: number,
		duration: number,
		options: {
			endFrequency?: number;
			type?: OscillatorType;
			gain?: number;
			delay?: number;
		} = {}
	): void {
		if (!this.enabled || this.destroyed) return;
		const context = this.ensureContext();
		const master = this.master;
		if (!context || !master) return;

		const now = context.currentTime + (options.delay ?? 0);
		const oscillator = context.createOscillator();
		const envelope = context.createGain();
		oscillator.type = options.type ?? 'sine';
		oscillator.frequency.setValueAtTime(frequency, now);
		if (options.endFrequency) {
			oscillator.frequency.exponentialRampToValueAtTime(
				Math.max(20, options.endFrequency),
				now + duration
			);
		}
		envelope.gain.setValueAtTime(0.0001, now);
		envelope.gain.exponentialRampToValueAtTime(options.gain ?? 0.22, now + 0.012);
		envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
		oscillator.connect(envelope);
		envelope.connect(master);
		oscillator.start(now);
		oscillator.stop(now + duration + 0.02);
		oscillator.addEventListener(
			'ended',
			() => {
				oscillator.disconnect();
				envelope.disconnect();
			},
			{ once: true }
		);
	}

	play(sound: GameSound): void {
		switch (sound) {
			case 'warning':
				this.tone(720, 0.08, { endFrequency: 560, type: 'square', gain: 0.12 });
				break;
			case 'horn':
				this.tone(238, 0.22, { type: 'sawtooth', gain: 0.2 });
				this.tone(287, 0.2, { type: 'square', gain: 0.1, delay: 0.035 });
				break;
			case 'bell':
				this.tone(1_120, 0.38, { endFrequency: 740, gain: 0.12 });
				this.tone(1_650, 0.28, { endFrequency: 940, gain: 0.08, delay: 0.05 });
				break;
			case 'bark':
				this.tone(190, 0.11, { endFrequency: 105, type: 'sawtooth', gain: 0.17 });
				this.tone(170, 0.09, { endFrequency: 92, type: 'square', gain: 0.12, delay: 0.13 });
				break;
			case 'splash':
				this.tone(165, 0.32, { endFrequency: 48, type: 'triangle', gain: 0.12 });
				this.tone(760, 0.18, { endFrequency: 130, gain: 0.07 });
				break;
			case 'tea':
				this.tone(1_850, 0.42, { endFrequency: 1_220, gain: 0.1 });
				this.tone(2_340, 0.3, { endFrequency: 1_620, gain: 0.07, delay: 0.07 });
				break;
			case 'snack':
				this.tone(540, 0.14, { endFrequency: 760, gain: 0.1 });
				this.tone(760, 0.18, { endFrequency: 980, gain: 0.08, delay: 0.09 });
				break;
			case 'bump':
				this.tone(96, 0.18, { endFrequency: 54, type: 'triangle', gain: 0.2 });
				break;
			case 'stumble':
				this.tone(140, 0.34, { endFrequency: 42, type: 'sawtooth', gain: 0.17 });
				break;
			case 'cow':
				this.tone(104, 0.52, { endFrequency: 82, type: 'sawtooth', gain: 0.14 });
				break;
			case 'rain-start':
				this.tone(420, 0.7, { endFrequency: 110, type: 'triangle', gain: 0.06 });
				break;
			case 'victory':
				[392, 523, 659, 784].forEach((frequency, index) =>
					this.tone(frequency, 0.38, { gain: 0.12, delay: index * 0.12 })
				);
				break;
			case 'loss':
				this.tone(280, 0.8, { endFrequency: 72, type: 'triangle', gain: 0.16 });
				break;
			case 'ominous':
				this.tone(64, 1.25, { endFrequency: 48, type: 'sawtooth', gain: 0.1 });
				this.tone(67, 1.2, { endFrequency: 45, type: 'triangle', gain: 0.07 });
				break;
		}
	}

	setRain(active: boolean): void {
		if (this.destroyed || !this.enabled) {
			if (!active) this.stopRain();
			return;
		}
		if (active && !this.rainSource) {
			const context = this.ensureContext();
			const master = this.master;
			if (!context || !master) return;
			const frames = Math.max(1, Math.floor(context.sampleRate * 2));
			const buffer = context.createBuffer(1, frames, context.sampleRate);
			const channel = buffer.getChannelData(0);
			let previous = 0;
			for (let index = 0; index < frames; index += 1) {
				const white = Math.random() * 2 - 1;
				previous = previous * 0.96 + white * 0.04;
				channel[index] = previous * 0.55;
			}
			const source = context.createBufferSource();
			const gain = context.createGain();
			const filter = context.createBiquadFilter();
			source.buffer = buffer;
			source.loop = true;
			filter.type = 'highpass';
			filter.frequency.value = 680;
			gain.gain.value = 0.08;
			source.connect(filter);
			filter.connect(gain);
			gain.connect(master);
			source.start();
			this.rainSource = source;
			this.rainGain = gain;
		} else if (!active) {
			this.stopRain();
		}
	}

	private stopRain(): void {
		if (this.rainSource) {
			try {
				this.rainSource.stop();
			} catch {
				// It may already have stopped during page teardown.
			}
			this.rainSource.disconnect();
			this.rainSource = null;
		}
		this.rainGain?.disconnect();
		this.rainGain = null;
	}

	async destroy(): Promise<void> {
		this.destroyed = true;
		this.stopRain();
		const context = this.context;
		this.master?.disconnect();
		this.master = null;
		this.context = null;
		if (context && context.state !== 'closed') await context.close().catch(() => undefined);
	}
}
