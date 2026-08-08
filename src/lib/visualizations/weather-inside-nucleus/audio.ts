import type { SimulationResult } from './model';

type BrowserAudioContext = AudioContext;

/**
 * Optional, user-started sonification of an already-computed trace. Audio consumes model events;
 * it never produces or changes them. Every cue is redundant with the timeline and transcript.
 */
export class NucleusSonifier {
	private context: BrowserAudioContext | null = null;
	private activeNodes = new Set<AudioScheduledSourceNode>();
	private master: GainNode | null = null;
	private disposed = false;

	get enabled() {
		return this.context !== null && this.context.state !== 'closed';
	}

	async enable(): Promise<void> {
		if (this.disposed) throw new Error('The model sonifier has been disposed.');
		if (!this.context) {
			const Context =
				window.AudioContext ??
				(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Context) throw new Error('Web Audio is unavailable in this browser.');
			this.context = new Context();
			this.master = this.context.createGain();
			this.master.gain.value = 0.2;
			this.master.connect(this.context.destination);
		}
		if (this.context.state === 'suspended') await this.context.resume();
	}

	async play(trace: SimulationResult): Promise<void> {
		await this.enable();
		this.stop();
		const context = this.context!;
		const master = this.master!;
		const now = context.currentTime + 0.04;
		const audibleDuration = 6;
		const timeScale = audibleDuration / trace.parameters.duration;

		const band = context.createOscillator();
		const bandGain = context.createGain();
		band.type = 'sine';
		band.frequency.value = 138;
		bandGain.gain.setValueAtTime(0.0001, now);
		const values = trace.timeline.nuclearActivity;
		const stride = Math.max(1, Math.floor(values.length / 36));
		for (let index = 0; index < values.length; index += stride) {
			const time = now + (index / Math.max(1, values.length - 1)) * audibleDuration;
			bandGain.gain.linearRampToValueAtTime(0.006 + values[index] * 0.11, time);
		}
		bandGain.gain.linearRampToValueAtTime(0.0001, now + audibleDuration + 0.08);
		band.connect(bandGain).connect(master);
		this.track(band);
		band.start(now);
		band.stop(now + audibleDuration + 0.1);

		for (const burstTime of trace.burstStartTimes) {
			this.scheduleTone(now + burstTime * timeScale, 430, 0.13, 0.055, 'triangle');
		}
		for (const eventTime of trace.initiationTimes) {
			this.scheduleTone(now + eventTime * timeScale, 920, 0.035, 0.027, 'sine');
		}
	}

	stop(): void {
		for (const source of this.activeNodes) {
			try {
				source.stop();
			} catch {
				// A source may already have completed; cleanup remains idempotent.
			}
		}
		this.activeNodes.clear();
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		this.stop();
		this.master?.disconnect();
		this.master = null;
		const context = this.context;
		this.context = null;
		if (context && context.state !== 'closed') await context.close();
	}

	private scheduleTone(
		at: number,
		frequency: number,
		duration: number,
		level: number,
		type: OscillatorType
	) {
		const context = this.context!;
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = type;
		oscillator.frequency.value = frequency;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
		oscillator.connect(gain).connect(this.master!);
		this.track(oscillator);
		oscillator.start(at);
		oscillator.stop(at + duration + 0.01);
	}

	private track(source: AudioScheduledSourceNode) {
		this.activeNodes.add(source);
		source.addEventListener('ended', () => this.activeNodes.delete(source), { once: true });
	}
}
