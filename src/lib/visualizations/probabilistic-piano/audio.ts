import { MIDI_MAX, MIDI_MIN } from './model';

/** This is an original synthesised piano approximation, with no downloaded sound assets. */
export const PIANO_PLAYABLE_VOICES = 20;
export const PIANO_MAX_NODE_VOICES = 24;
export const PIANO_MASTER_GAIN = 0.24;

const ATTACK_SECONDS = 0.006;
const RELEASE_SECONDS = 0.15;
const STEAL_RELEASE_SECONDS = 0.018;
const PARTIALS = [1, 2.003, 3.009, 4.02, 6.04] as const;
const PARTIAL_LEVELS = [1, 0.33, 0.14, 0.07, 0.028] as const;
const FLOOR = 0.00001;

type Partial = { source: OscillatorNode; envelope: GainNode; ended: boolean };
type PianoVoice = {
	id: string;
	startedAt: number;
	held: boolean;
	released: boolean;
	releaseAt: number;
	releaseFrom: number;
	releaseDuration: number;
	output: GainNode;
	partials: Partial[];
	cleaned: boolean;
};

export type PianoAudioOptions = Readonly<{
	/** Dependency injection does not invoke the factory until the explicit enable action. */
	contextFactory?: () => AudioContext;
}>;

function browserAudioContext(): AudioContext {
	if (typeof window === 'undefined')
		throw new Error('Enable sound in a browser to play the piano.');
	const Constructor =
		window.AudioContext ??
		(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Constructor) throw new Error('Web Audio is unavailable; silent playing still works.');
	return new Constructor({ latencyHint: 'interactive' });
}

function unit(value: number, fallback = 0): number {
	return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

/**
 * Per-instrument owned Web Audio. Construction is inert, including during SSR.
 * Twenty playable voices plus four short stealing/release tails bound graph resources.
 * A burst that fills every tail slot is refused until a tail ends; no delayed-note queue exists.
 */
export class PianoAudio {
	private readonly contextFactory: () => AudioContext;
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private readonly voices = new Map<string, PianoVoice>();
	private serial = 0;
	private volume = 0.65;
	private muted = false;
	private sustain = false;
	private enabled = false;
	private disposed = false;
	private generation = 0;

	constructor(options: PianoAudioOptions = {}) {
		this.contextFactory = options.contextFactory ?? browserAudioContext;
	}

	get ready(): boolean {
		return !this.disposed && this.enabled && this.context?.state === 'running';
	}

	/** Includes release tails, rather than pretending disconnected ownership means no audio nodes. */
	get activeCount(): number {
		return this.voices.size;
	}

	/** Transport schedulers read this clock; frame/performance clocks do not schedule sound. */
	get currentTime(): number {
		return this.context?.currentTime ?? 0;
	}

	hasVoice(id: string): boolean {
		const voice = this.voices.get(id);
		return Boolean(voice && !voice.released && this.currentTime < voice.releaseAt);
	}

	/** Call directly inside a user gesture: context construction occurs before the first await. */
	async enable(): Promise<void> {
		if (this.disposed) throw new Error('This piano has been disposed.');
		const generation = ++this.generation;
		if (!this.context) {
			this.context = this.contextFactory();
			this.master = this.context.createGain();
			this.master.gain.value = 0;
			this.master.connect(this.context.destination);
		}
		const context = this.context;
		if (context.state === 'closed') throw new Error('The piano audio context is closed.');
		try {
			if (context.state !== 'running') await context.resume();
		} catch (error) {
			if (this.disposed || generation !== this.generation) return;
			this.enabled = false;
			throw error;
		}
		if (this.disposed || generation !== this.generation) return;
		if (context.state !== 'running') {
			this.enabled = false;
			throw new Error('Sound is still suspended. Try Enable sound again.');
		}
		this.enabled = true;
		this.updateMaster();
	}

	/** Returns an empty ID for silent mode, invalid pitches, zero velocity or momentary capacity. */
	noteOn(pitch: number, velocity = 0.75): string {
		return this.createVoice(pitch, velocity, this.currentTime);
	}

	/** Bounded audio-clock lookahead for optional accompaniment; there is no delayed timer queue. */
	scheduleNote(pitch: number, velocity: number, at: number, duration: number): string {
		if (!Number.isFinite(at) || !Number.isFinite(duration)) return '';
		const start = Math.max(this.currentTime, Math.min(this.currentTime + 0.25, at));
		return this.createVoice(pitch, velocity, start, Math.max(0.03, Math.min(4, duration)));
	}

	private createVoice(pitch: number, velocity: number, at: number, duration?: number): string {
		if (!this.ready || !this.context || !this.master) return '';
		if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) return '';
		const strength = unit(velocity);
		if (strength === 0 || this.voices.size >= PIANO_MAX_NODE_VOICES) return '';
		const available = [...this.voices.values()].filter(
			(voice) => !voice.released && this.currentTime < voice.releaseAt
		);
		if (available.length >= PIANO_PLAYABLE_VOICES) {
			// Prefer releasing an already pedal-held voice, then the oldest still-held voice.
			const oldest = available.find((voice) => !voice.held) ?? available[0];
			this.releaseVoice(oldest, STEAL_RELEASE_SECONDS);
		}
		const context = this.context;
		const now = at;
		const output = context.createGain();
		output.gain.value = 1;
		output.connect(this.master);
		const voice: PianoVoice = {
			id: `piano-${++this.serial}`,
			startedAt: now,
			held: true,
			released: false,
			releaseAt: duration === undefined ? Infinity : now + duration,
			releaseFrom: 1,
			releaseDuration: duration === undefined ? 0 : RELEASE_SECONDS,
			output,
			partials: [],
			cleaned: false
		};
		if (duration !== undefined) {
			output.gain.setValueAtTime(1, now + duration);
			output.gain.linearRampToValueAtTime(0, now + duration + RELEASE_SECONDS);
		}
		this.voices.set(voice.id, voice);
		const frequency = 440 * 2 ** ((pitch - 69) / 12);
		// Bass strings ring longer; the short, less brilliant treble stays clear at C8.
		const register = unit((pitch - MIDI_MIN) / (MIDI_MAX - MIDI_MIN));
		const decay = 5.4 - register * 3;
		for (let index = 0; index < PARTIALS.length; index++) {
			// Skip inaudible/aliased harmonics outside Nyquist at extreme MIDI inputs.
			const partialFrequency = frequency * PARTIALS[index];
			if (partialFrequency >= context.sampleRate * 0.46) continue;
			const source = context.createOscillator();
			const envelope = context.createGain();
			const brightness = index === 0 ? 1 : (0.5 + strength * 0.5) * (1 - register * 0.4);
			const peak = 0.12 * strength ** 1.35 * PARTIAL_LEVELS[index] * brightness;
			const duration = decay / (1 + index * 0.5);
			source.type = 'sine';
			source.frequency.setValueAtTime(partialFrequency, now);
			envelope.gain.setValueAtTime(0, now);
			envelope.gain.linearRampToValueAtTime(peak, now + ATTACK_SECONDS);
			envelope.gain.exponentialRampToValueAtTime(Math.max(FLOOR, peak * 0.38), now + 0.17);
			envelope.gain.exponentialRampToValueAtTime(FLOOR, now + duration);
			source.connect(envelope);
			envelope.connect(output);
			const partial = { source, envelope, ended: false };
			voice.partials.push(partial);
			source.onended = () => {
				if (partial.ended || voice.cleaned) return;
				partial.ended = true;
				source.disconnect();
				envelope.disconnect();
				if (voice.partials.every((part) => part.ended)) this.cleanupVoice(voice);
			};
			source.start(now);
			source.stop(Math.min(now + duration + 0.025, voice.releaseAt + RELEASE_SECONDS + 0.002));
		}
		if (voice.partials.length === 0) {
			this.cleanupVoice(voice);
			return '';
		}
		return voice.id;
	}

	noteOff(id: string): void {
		const voice = this.voices.get(id);
		if (!voice || voice.released) return;
		voice.held = false;
		if (!this.sustain) this.releaseVoice(voice, RELEASE_SECONDS);
	}

	setSustain(value: boolean): void {
		this.sustain = Boolean(value);
		if (!this.sustain) {
			for (const voice of this.voices.values())
				if (!voice.held && !voice.released) this.releaseVoice(voice, RELEASE_SECONDS);
		}
	}

	setVolume(value: number): void {
		this.volume = unit(value);
		this.updateMaster();
	}

	setMuted(value: boolean): void {
		this.muted = Boolean(value);
		this.updateMaster();
	}

	/** Keeps an already enabled instrument playable, while invalidating unfinished activation. */
	stopAll(): void {
		this.generation++;
		this.sustain = false;
		for (const voice of this.voices.values()) this.releaseVoice(voice, STEAL_RELEASE_SECONDS);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.enabled = false;
		this.generation++;
		this.sustain = false;
		for (const voice of this.voices.values()) this.cleanupVoice(voice);
		this.master?.disconnect();
		this.master = null;
		const context = this.context;
		this.context = null;
		if (context && context.state !== 'closed') void context.close().catch(() => {});
	}

	private updateMaster(): void {
		if (!this.master || !this.context || this.disposed) return;
		const gain = this.enabled && !this.muted ? this.volume * PIANO_MASTER_GAIN : 0;
		this.master.gain.setTargetAtTime(gain, this.context.currentTime, 0.012);
	}

	private releaseVoice(voice: PianoVoice, duration: number): void {
		if (voice.cleaned || !this.context) return;
		if (this.context.state !== 'running' || voice.startedAt > this.context.currentTime) {
			this.cleanupVoice(voice);
			return;
		}
		const now = this.context.currentTime;
		const currentGain =
			now >= voice.releaseAt
				? voice.releaseFrom * Math.max(0, 1 - (now - voice.releaseAt) / voice.releaseDuration)
				: 1;
		voice.held = false;
		voice.released = true;
		voice.releaseAt = now;
		voice.releaseFrom = currentGain;
		voice.releaseDuration = duration;
		voice.output.gain.cancelScheduledValues(now);
		voice.output.gain.setValueAtTime(currentGain, now);
		voice.output.gain.linearRampToValueAtTime(0, now + duration);
		for (const partial of voice.partials) {
			if (!partial.ended) partial.source.stop(now + duration + 0.002);
		}
	}

	private cleanupVoice(voice: PianoVoice): void {
		if (voice.cleaned) return;
		voice.cleaned = true;
		for (const partial of voice.partials) {
			partial.source.onended = null;
			if (!partial.ended) {
				try {
					partial.source.stop();
				} catch {
					// The source may already have ended before its queued onended callback.
				}
				partial.source.disconnect();
				partial.envelope.disconnect();
			}
			partial.ended = true;
		}
		voice.output.disconnect();
		this.voices.delete(voice.id);
	}
}
