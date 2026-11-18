import { createRng } from './prng';

export interface CitySoundscapeHandle {
	setEnabled: (enabled: boolean) => void;
	setNightFactor: (night01: number) => void;
	playClickTap: () => void;
	playDiscoveryChime: () => void;
	dispose: () => void;
}

/**
 * Lightweight, zero-network procedural Web Audio miniature diorama ambience:
 * gentle filtered coastal breeze/surf + soft pentatonic wooden wind-chimes + tactile taps.
 */
export function createCitySoundscape(): CitySoundscapeHandle {
	let ctx: AudioContext | null = null;
	let masterGain: GainNode | null = null;
	let surfGain: GainNode | null = null;
	let noiseSource: AudioBufferSourceNode | null = null;
	let chimeTimer: number | null = null;
	let enabled = false;
	let nightFactor = 0.3;

	function ensureContext(): AudioContext | null {
		if (ctx) return ctx;
		if (typeof window === 'undefined') return null;
		const AudioCtor =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtor) return null;

		try {
			ctx = new AudioCtor();
			masterGain = ctx.createGain();
			masterGain.gain.value = 0.0;
			masterGain.connect(ctx.destination);

			// Soft pink-filtered ocean / wind bed
			const bufferSize = ctx.sampleRate * 3;
			const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
			const data = noiseBuffer.getChannelData(0);
			const rng = createRng(20261118);
			let b0 = 0,
				b1 = 0,
				b2 = 0;
			for (let i = 0; i < bufferSize; i++) {
				const white = rng() * 2 - 1;
				b0 = 0.997 * b0 + white * 0.029;
				b1 = 0.985 * b1 + white * 0.032;
				b2 = 0.95 * b2 + white * 0.048;
				data[i] = (b0 + b1 + b2) * 0.22;
			}

			noiseSource = ctx.createBufferSource();
			noiseSource.buffer = noiseBuffer;
			noiseSource.loop = true;

			const lowpass = ctx.createBiquadFilter();
			lowpass.type = 'lowpass';
			lowpass.frequency.value = 420;

			surfGain = ctx.createGain();
			surfGain.gain.value = 0.14;

			noiseSource.connect(lowpass);
			lowpass.connect(surfGain);
			surfGain.connect(masterGain);
			noiseSource.start();
			return ctx;
		} catch {
			return null;
		}
	}

	function triggerSoftChime(freq: number, dur = 1.1, gainLevel = 0.045): void {
		if (!enabled || !ctx || !masterGain || ctx.state !== 'running') return;
		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const g = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(freq, now);
		g.gain.setValueAtTime(0.0001, now);
		g.gain.exponentialRampToValueAtTime(gainLevel, now + 0.02);
		g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
		osc.connect(g);
		g.connect(masterGain);
		osc.start(now);
		osc.stop(now + dur + 0.05);
	}

	const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
	let noteCursor = 0;

	function startChimeLoop(): void {
		if (chimeTimer !== null || typeof window === 'undefined') return;
		chimeTimer = window.setInterval(() => {
			if (!enabled) return;
			const freq = pentatonic[noteCursor % pentatonic.length];
			noteCursor = (noteCursor + 2 + (noteCursor % 3)) % pentatonic.length;
			triggerSoftChime(freq * (nightFactor > 0.6 ? 0.5 : 1), 1.4, 0.03);
		}, 3400);
	}

	function setEnabled(next: boolean): void {
		enabled = next;
		if (next) {
			const c = ensureContext();
			if (c && c.state === 'suspended') {
				c.resume().catch(() => {});
			}
			if (c && masterGain) {
				masterGain.gain.setTargetAtTime(0.55, c.currentTime, 0.25);
			}
			startChimeLoop();
		} else if (ctx && masterGain) {
			masterGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.15);
		}
	}

	function setNightFactor(night01: number): void {
		nightFactor = night01;
	}

	function playClickTap(): void {
		if (!enabled) return;
		triggerSoftChime(659.25, 0.18, 0.055);
	}

	function playDiscoveryChime(): void {
		if (!enabled) return;
		triggerSoftChime(523.25, 0.55, 0.06);
		if (typeof window !== 'undefined') {
			window.setTimeout(() => triggerSoftChime(659.25, 0.65, 0.06), 110);
			window.setTimeout(() => triggerSoftChime(783.99, 0.9, 0.065), 220);
		}
	}

	function dispose(): void {
		enabled = false;
		if (chimeTimer !== null && typeof window !== 'undefined') {
			window.clearInterval(chimeTimer);
			chimeTimer = null;
		}
		try {
			noiseSource?.stop();
		} catch {
			// Ignore already-stopped source
		}
		if (ctx) {
			ctx.close().catch(() => {});
			ctx = null;
		}
	}

	return {
		setEnabled,
		setNightFactor,
		playClickTap,
		playDiscoveryChime,
		dispose
	};
}
