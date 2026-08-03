import { SeededRandom } from '../prng';
import type { LightningFlash } from '../types';

type AudioContextConstructor = typeof AudioContext;

export class ThunderSynth {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private scheduled = new Set<AudioScheduledSourceNode>();
	private enabled = false;
	private volume = 0.45;

	get isEnabled() {
		return this.enabled;
	}

	async enable() {
		if (typeof window === 'undefined') return false;
		const Context = (window.AudioContext ??
			(window as typeof window & { webkitAudioContext?: AudioContextConstructor })
				.webkitAudioContext) as AudioContextConstructor | undefined;
		if (!Context) return false;
		if (!this.context) {
			this.context = new Context({ latencyHint: 'playback' });
			this.master = this.context.createGain();
			this.master.gain.value = this.volume * 0.34;
			this.master.connect(this.context.destination);
		}
		if (this.context.state === 'suspended') await this.context.resume();
		this.enabled = true;
		return true;
	}

	setVolume(value: number) {
		this.volume = Math.min(1, Math.max(0, value));
		if (this.master && this.context) {
			this.master.gain.setTargetAtTime(this.volume * 0.34, this.context.currentTime, 0.03);
		}
	}

	schedule(flash: LightningFlash, delaySeconds = 0) {
		if (!this.enabled || !this.context || !this.master) return;
		this.cancel();
		const startTime = this.context.currentTime + Math.max(0.05, delaySeconds);
		const random = new SeededRandom(`${flash.seed}|thunder-synthesis|${flash.strikeIndex}`);
		const duration = 2.4 + Math.min(4.5, flash.observerDistanceMetres / 1_800);
		const buffer = this.context.createBuffer(
			1,
			Math.ceil(this.context.sampleRate * duration),
			this.context.sampleRate
		);
		const channel = buffer.getChannelData(0);
		let brown = 0;
		const decay = 0.42 + random.fork('decay').nextFloat() * 0.08;
		for (let index = 0; index < channel.length; index += 1) {
			const white = random.nextFloat() * 2 - 1;
			brown = (brown + 0.018 * white) / 1.018;
			const time = index / this.context.sampleRate;
			const envelope = Math.min(1, time * 12) * Math.exp(-time * decay);
			channel[index] = Math.max(-0.85, Math.min(0.85, brown * 3.1 * envelope));
		}

		const rumble = this.context.createBufferSource();
		rumble.buffer = buffer;
		const lowpass = this.context.createBiquadFilter();
		lowpass.type = 'lowpass';
		lowpass.frequency.value = 170 + Math.max(0, 680 - flash.observerDistanceMetres * 0.11);
		const rumbleGain = this.context.createGain();
		rumbleGain.gain.setValueAtTime(0.001, startTime);
		rumbleGain.gain.exponentialRampToValueAtTime(
			0.25 + flash.relativeIntensity * 0.26,
			startTime + 0.045
		);
		rumbleGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
		rumble.connect(lowpass).connect(rumbleGain).connect(this.master);
		this.track(rumble);
		rumble.start(startTime);

		if (flash.observerDistanceMetres < 2_400) {
			const crack = this.context.createOscillator();
			const crackGain = this.context.createGain();
			crack.type = 'sawtooth';
			crack.frequency.setValueAtTime(430, startTime);
			crack.frequency.exponentialRampToValueAtTime(85, startTime + 0.12);
			crackGain.gain.setValueAtTime(0.001, startTime);
			crackGain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.008);
			crackGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);
			crack.connect(crackGain).connect(this.master);
			this.track(crack);
			crack.start(startTime);
			crack.stop(startTime + 0.18);
		}
	}

	cancel() {
		for (const source of this.scheduled) {
			try {
				source.stop();
			} catch {
				// A source that has already ended is harmless.
			}
		}
		this.scheduled.clear();
	}

	async suspend() {
		this.cancel();
		if (this.context?.state === 'running') await this.context.suspend();
	}

	async dispose() {
		this.enabled = false;
		this.cancel();
		this.master?.disconnect();
		this.master = null;
		if (this.context && this.context.state !== 'closed') await this.context.close();
		this.context = null;
	}

	private track(source: AudioScheduledSourceNode) {
		this.scheduled.add(source);
		source.addEventListener('ended', () => this.scheduled.delete(source), { once: true });
	}
}

export function thunderText(flash: LightningFlash): string {
	if (flash.observerDistanceMetres < 1_200) return 'Sharp crack followed by a short, heavy rumble';
	if (flash.observerDistanceMetres < 3_500) return 'Crack rolling into a broad, delayed rumble';
	return 'Long, distant rumble arriving well after the flash';
}

export function effectiveThunderArrivalTime(
	flash: LightningFlash,
	compressedDelay = false
): number {
	if (!compressedDelay) return flash.thunderArrivalTime;
	const dischargeEvent = flash.phaseEvents.find(
		(event) => event.phase === 'return-stroke' || event.phase === 'in-cloud-pulse'
	);
	return (dischargeEvent?.startTime ?? 0) + Math.min(1.25, flash.thunderDelaySeconds * 0.18);
}
