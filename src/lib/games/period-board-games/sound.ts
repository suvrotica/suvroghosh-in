export type BoardSound = 'die' | 'move' | 'capture' | 'ladder' | 'snake' | 'win';

export class BoardSoundPlayer {
	#context: AudioContext | null = null;
	#unlocked = false;

	unlock() {
		this.#unlocked = true;
	}

	async play(sound: BoardSound, enabled: boolean) {
		if (!enabled || !this.#unlocked || typeof AudioContext === 'undefined') return;
		this.#context ??= new AudioContext();
		try {
			if (this.#context.state === 'suspended') await this.#context.resume();
		} catch {
			// Browsers may refuse sound from an automated turn before the first
			// user gesture. Keep the context so the next human action can retry.
			return;
		}
		if (this.#context.state !== 'running') return;
		const context = this.#context;
		const now = context.currentTime;
		const gain = context.createGain();
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(sound === 'win' ? 0.13 : 0.06, now + 0.008);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + (sound === 'snake' ? 0.32 : 0.18));
		gain.connect(context.destination);

		const oscillator = context.createOscillator();
		oscillator.type = sound === 'snake' ? 'sawtooth' : sound === 'capture' ? 'square' : 'sine';
		const frequency: Record<BoardSound, number> = {
			die: 150,
			move: 220,
			capture: 105,
			ladder: 360,
			snake: 190,
			win: 520
		};
		oscillator.frequency.setValueAtTime(frequency[sound], now);
		if (sound === 'ladder' || sound === 'win') {
			oscillator.frequency.exponentialRampToValueAtTime(frequency[sound] * 1.7, now + 0.16);
		} else if (sound === 'snake') {
			oscillator.frequency.exponentialRampToValueAtTime(80, now + 0.3);
		}
		oscillator.connect(gain);
		oscillator.start(now);
		oscillator.stop(now + (sound === 'snake' ? 0.34 : 0.2));
	}

	destroy() {
		void this.#context?.close();
		this.#context = null;
	}
}
