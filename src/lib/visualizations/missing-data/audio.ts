import type { Experiment } from './types';
import { normalizeScore } from './colors';

interface Voice {
	oscillator: OscillatorNode;
	envelope: GainNode;
}

/**
 * A bounded local score. Call enable() only from the reader's explicit gesture.
 * Columns have fixed pentatonic pitches; standardised values change velocity.
 */
export class MissingAudio {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private voices = new Set<Voice>();
	private volume = 0.28;
	private disposed = false;

	async enable(): Promise<void> {
		if (this.disposed) return;
		if (!this.context) {
			if (typeof AudioContext === 'undefined') {
				throw new Error('This browser does not provide Web Audio.');
			}
			this.context = new AudioContext();
			this.master = this.context.createGain();
			this.master.gain.value = this.volume;
			this.master.connect(this.context.destination);
		}
		if (this.context.state === 'suspended') await this.context.resume();
	}

	setVolume(value: number): void {
		this.volume = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
		if (this.context && this.master) {
			this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025);
		}
	}

	/** row is a DISPLAYED row index, matching the matrix playhead. */
	playRow(experiment: Experiment, row: number, auditionImputed: boolean): void {
		const context = this.context;
		if (!context || context.state !== 'running' || !this.master || this.disposed) return;
		this.stop();
		if (!Number.isInteger(row) || row < 0 || row >= experiment.order.length) return;
		const { data, observed, completion, order } = experiment;
		const originalRow = order[row];
		const count = Math.min(8, data.cols);
		const pentatonic = [0, 2, 4, 7, 9];
		// The preceding voices finish their short release before this row begins.
		const start = context.currentTime + 0.016;
		for (let slot = 0; slot < count; slot++) {
			const column = count === 1 ? 0 : Math.round((slot * (data.cols - 1)) / (count - 1));
			const index = originalRow * data.cols + column;
			const missing = observed.mask[index] === 1;
			const filled = missing && Number.isFinite(completion.values[index]);
			if (missing && (!filled || !auditionImputed)) continue;
			const value = missing ? completion.values[index] : observed.values[index];
			if (!Number.isFinite(value)) continue;
			const oscillator = context.createOscillator();
			const envelope = context.createGain();
			const voice = { oscillator, envelope };
			this.voices.add(voice);
			// Original column identity, not display order, fixes the musical role.
			const midi =
				48 + pentatonic[column % pentatonic.length] + 12 * Math.min(2, Math.floor(column / 5));
			oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
			oscillator.type = filled ? 'sine' : 'triangle';
			const velocity = 0.012 + ((Math.max(-3, Math.min(3, normalizeScore(value))) + 3) / 6) * 0.036;
			envelope.gain.setValueAtTime(0, start);
			envelope.gain.linearRampToValueAtTime(velocity, start + 0.018);
			envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
			envelope.gain.linearRampToValueAtTime(0, start + 0.18);
			oscillator.connect(envelope);
			envelope.connect(this.master);
			oscillator.onended = () => {
				oscillator.disconnect();
				envelope.disconnect();
				this.voices.delete(voice);
			};
			oscillator.start(start);
			oscillator.stop(start + 0.185);
		}
	}

	stop(): void {
		if (!this.context) return;
		const now = this.context.currentTime;
		for (const { oscillator, envelope } of this.voices) {
			envelope.gain.cancelScheduledValues(now);
			envelope.gain.setTargetAtTime(0, now, 0.003);
			try {
				oscillator.stop(now + 0.012);
			} catch {
				// An already-ended source may have been collected between callbacks.
			}
		}
		this.voices.clear();
	}

	suspend(): void {
		this.stop();
		if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.stop();
		this.master?.disconnect();
		if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
		this.context = null;
		this.master = null;
	}
}
