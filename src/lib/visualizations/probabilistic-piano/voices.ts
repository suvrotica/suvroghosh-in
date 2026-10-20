/** A physical input owns one frozen output, even when several inputs choose the same pitch. */
export type InputVoice = Readonly<{
	inputId: string;
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
}
