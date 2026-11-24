/** A physical input owns one frozen output, even when several inputs choose the same pitch. */
export type InputVoice = Readonly<{
	inputId: string;
	voiceId: string;
	pitch: number;
}>;

export type VoiceBindTarget = Readonly<{
	voiceId: string;
	pitch: number;
}>;

/** Browser-independent ownership; correction is deliberately absent from note-off. */
export class VoiceLedger {
	private readonly voices = new Map<string, InputVoice>();

	get size(): number {
		return this.voices.size;
	}

	get(inputId: string): InputVoice | undefined {
		return this.voices.get(inputId);
	}

	bind(inputId: string, voiceId: string, pitch: number): InputVoice {
		if (!inputId || !Number.isInteger(pitch) || pitch < 0 || pitch > 127)
			throw new Error('An input needs an ID and a MIDI pitch from 0 to 127.');
		if (this.voices.has(inputId))
			throw new Error('Release this input before binding another voice.');
		const voice = Object.freeze({ inputId, voiceId, pitch });
		this.voices.set(inputId, voice);
		return voice;
	}

	release(inputId: string): InputVoice | undefined {
		const voice = this.voices.get(inputId);
		this.voices.delete(inputId);
		return voice;
	}

	entries(): InputVoice[] {
		return [...this.voices.values()];
	}

	clear(): InputVoice[] {
		const previous = this.entries();
		this.voices.clear();
		return previous;
	}

	/** Remove stolen/finished voices from the held-key display. Silent IDs may be kept by callers. */
	prune(hasVoice: (voiceId: string) => boolean): InputVoice[] {
		const removed: InputVoice[] = [];
		for (const [inputId, voice] of this.voices) {
			if (!hasVoice(voice.voiceId)) {
				this.voices.delete(inputId);
				removed.push(voice);
			}
		}
		return removed;
	}

	bindChord(baseId: string, notes: readonly VoiceBindTarget[]): InputVoice[] {
		if (!baseId) throw new Error('An input needs an ID and a MIDI pitch from 0 to 127.');
		if (notes.length === 0) throw new Error('Choose at least one note to bind a chord.');
		const pending: InputVoice[] = [];
		for (let index = 0; index < notes.length; index++) {
			const item = notes[index];
			if (!item || !Number.isInteger(item.pitch) || item.pitch < 0 || item.pitch > 127)
				throw new Error('An input needs an ID and a MIDI pitch from 0 to 127.');
			const inputId = `${baseId}-${index}`;
			if (this.voices.has(inputId))
				throw new Error('Release this input before binding another voice.');
			pending.push(Object.freeze({ inputId, voiceId: item.voiceId, pitch: item.pitch }));
		}
		for (const voice of pending) this.voices.set(voice.inputId, voice);
		return pending;
	}

	releaseChord(baseId: string): InputVoice[] {
		if (!baseId) return [];
		const prefix = `${baseId}-`;
		const removed: InputVoice[] = [];
		for (const [inputId, voice] of this.voices) {
			if (!inputId.startsWith(prefix)) continue;
			const suffix = inputId.slice(prefix.length);
			if (/^\d+$/.test(suffix)) {
				this.voices.delete(inputId);
				removed.push(voice);
			}
		}
		return removed;
	}

	getPrefix(prefix: string): InputVoice[] {
		if (!prefix) return [];
		return [...this.voices.values()].filter((voice) => voice.inputId.startsWith(prefix));
	}

	releasePrefix(prefix: string): InputVoice[] {
		if (!prefix) return [];
		const removed: InputVoice[] = [];
		for (const [inputId, voice] of this.voices) {
			if (inputId.startsWith(prefix)) {
				this.voices.delete(inputId);
				removed.push(voice);
			}
		}
		return removed;
	}
}
