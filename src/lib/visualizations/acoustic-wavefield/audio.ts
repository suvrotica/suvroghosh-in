import { resampleRirForAudio } from './metrics';
import { createPrng } from './prng';
import { FS_SIM, type DrySoundKind } from './types';

// Fixed global calibration gain so Anechoic rooms stay quiet/dry and Stone Bathhouses bloom naturally.
// Never auto-normalized per room!
const GLOBAL_RIR_CALIBRATION = 0.085;

export interface RoomAudioEngine {
	ensureUnlocked: () => Promise<boolean>;
	updateRir: (rir: Float32Array, simFs?: number) => void;
	playDrySound: (kind: DrySoundKind) => Promise<void>;
	startContinuousTone: (freqHz: number) => Promise<void>;
	stopContinuousTone: () => void;
	setToneFrequency: (freqHz: number) => void;
	setWetMode: (wet: boolean) => void;
	setMuted: (muted: boolean) => void;
	setGainDb: (db: number) => void;
	stopAll: () => void;
	dispose: () => void;
	isUnlocked: () => boolean;
}

function dbToLinear(db: number): number {
	const clamped = Math.max(-36, Math.min(6, db));
	return Math.pow(10, clamped / 20);
}

/**
 * Synthesize deterministic dry test sounds directly in browser memory (zero external audio files).
 */
function buildDryAudioBuffer(ctx: AudioContext, kind: DrySoundKind): AudioBuffer {
	const sr = ctx.sampleRate;
	const rng = createPrng(9001 + kind.length * 137);

	if (kind === 'clap') {
		const dur = 0.065;
		const len = Math.max(1, Math.round(dur * sr));
		const buf = ctx.createBuffer(1, len, sr);
		const ch = buf.getChannelData(0);
		// Three closely spaced hand-clap microbursts + crisp snap
		const bursts = [0, 0.009, 0.018];
		let lp = 0;
		for (let i = 0; i < len; i++) {
			const t = i / sr;
			let env = 0;
			for (const b of bursts) {
				if (t >= b) {
					env += Math.exp(-(t - b) / 0.0085) * (b === 0 ? 1.0 : 0.65);
				}
			}
			const white = rng() * 2 - 1;
			lp = 0.72 * lp + 0.28 * white;
			const hp = white - 0.55 * lp;
			ch[i] = Math.max(-1, Math.min(1, hp * env * 0.85));
		}
		return buf;
	}

	if (kind === 'pluck') {
		const dur = 0.24;
		const len = Math.max(1, Math.round(dur * sr));
		const buf = ctx.createBuffer(1, len, sr);
		const ch = buf.getChannelData(0);
		const f0 = 220;
		for (let i = 0; i < len; i++) {
			const t = i / sr;
			const attack = Math.min(1, t / 0.002);
			let sum = 0;
			for (let h = 1; h <= 6; h++) {
				const decay = Math.exp(-t * (4.5 + h * 3.8));
				sum += (1 / Math.pow(h, 1.15)) * Math.sin(2 * Math.PI * f0 * h * t) * decay;
			}
			const pickClick = t < 0.006 ? (rng() * 2 - 1) * (1 - t / 0.006) * 0.25 : 0;
			ch[i] = Math.max(-1, Math.min(1, sum * 0.48 * attack + pickClick));
		}
		return buf;
	}

	if (kind === 'rimshot') {
		const dur = 0.085;
		const len = Math.max(1, Math.round(dur * sr));
		const buf = ctx.createBuffer(1, len, sr);
		const ch = buf.getChannelData(0);
		for (let i = 0; i < len; i++) {
			const t = i / sr;
			const woody = Math.sin(2 * Math.PI * 520 * t) * Math.exp(-t / 0.014);
			const ring = Math.sin(2 * Math.PI * 1180 * t) * Math.exp(-t / 0.022) * 0.5;
			const snap = (rng() * 2 - 1) * Math.exp(-t / 0.004) * 0.6;
			ch[i] = Math.max(-1, Math.min(1, (woody + ring + snap) * 0.65));
		}
		return buf;
	}

	// 'vowel': resonant vocal "ah" pulse train
	const dur = 0.28;
	const len = Math.max(1, Math.round(dur * sr));
	const buf = ctx.createBuffer(1, len, sr);
	const ch = buf.getChannelData(0);
	const f0 = 145;
	const formants = [
		{ freq: 720, bw: 90, amp: 1.0 },
		{ freq: 1180, bw: 120, amp: 0.65 },
		{ freq: 2480, bw: 160, amp: 0.25 }
	];
	for (let i = 0; i < len; i++) {
		const t = i / sr;
		const env = Math.min(1, t / 0.015) * Math.exp(-Math.max(0, t - 0.05) / 0.09);
		let sample = 0;
		for (let h = 1; h <= 18; h++) {
			const fh = h * f0;
			let formantGain = 0;
			for (const fm of formants) {
				const d = (fh - fm.freq) / fm.bw;
				formantGain += fm.amp / (1 + d * d);
			}
			sample += (formantGain / (1 + h * 0.2)) * Math.sin(2 * Math.PI * fh * t);
		}
		ch[i] = Math.max(-1, Math.min(1, sample * env * 0.22));
	}
	return buf;
}

export function createRoomAudioEngine(): RoomAudioEngine {
	let ctx: AudioContext | null = null;
	let convolver: ConvolverNode | null = null;
	let wetGain: GainNode | null = null;
	let dryGain: GainNode | null = null;
	let highpass: BiquadFilterNode | null = null;
	let masterGain: GainNode | null = null;
	let limiter: DynamicsCompressorNode | null = null;

	let activeToneOsc: OscillatorNode | null = null;
	let activeToneGain: GainNode | null = null;
	const activeSources = new Set<AudioBufferSourceNode>();

	let unlocked = false;
	let isWet = true;
	let isMuted = false;
	let gainDb = -6;
	let latestRir: Float32Array | null = null;
	let latestRirFs = FS_SIM;
	const dryCache = new Map<DrySoundKind, AudioBuffer>();

	function applyRoutingGains(): void {
		if (!ctx || !wetGain || !dryGain || !masterGain) return;
		const now = ctx.currentTime;
		wetGain.gain.setTargetAtTime(isWet ? 1 : 0, now, 0.015);
		dryGain.gain.setTargetAtTime(isWet ? 0 : 0.65, now, 0.015);
		masterGain.gain.setTargetAtTime(isMuted ? 0 : dbToLinear(gainDb), now, 0.015);
	}

	function uploadRirToConvolver(): void {
		if (!ctx || !convolver || !latestRir || latestRir.length === 0) return;
		const resampled = resampleRirForAudio(latestRir, latestRirFs, ctx.sampleRate);
		if (resampled.length === 0) return;

		const buf = ctx.createBuffer(1, resampled.length, ctx.sampleRate);
		const ch = buf.getChannelData(0);
		for (let i = 0; i < resampled.length; i++) {
			// Fixed global calibration scale: preserves Anechoic vs Bathhouse physical loudness!
			ch[i] = Math.max(-1, Math.min(1, resampled[i] * GLOBAL_RIR_CALIBRATION));
		}
		convolver.buffer = buf;
	}

	async function ensureUnlocked(): Promise<boolean> {
		if (typeof window === 'undefined') return false;
		const AudioCtx =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtx) return false;

		if (!ctx) {
			try {
				ctx = new AudioCtx();
				convolver = ctx.createConvolver();
				// CRITICAL: disable Web Audio automatic RMS normalization to keep physical room loudness true
				convolver.normalize = false;

				wetGain = ctx.createGain();
				dryGain = ctx.createGain();
				highpass = ctx.createBiquadFilter();
				highpass.type = 'highpass';
				highpass.frequency.value = 28;

				masterGain = ctx.createGain();
				limiter = ctx.createDynamicsCompressor();
				limiter.threshold.value = -4;
				limiter.knee.value = 6;
				limiter.ratio.value = 12;
				limiter.attack.value = 0.002;
				limiter.release.value = 0.08;

				convolver.connect(wetGain);
				wetGain.connect(highpass);
				dryGain.connect(highpass);
				highpass.connect(masterGain);
				masterGain.connect(limiter);
				limiter.connect(ctx.destination);

				applyRoutingGains();
				uploadRirToConvolver();
			} catch {
				ctx = null;
				return false;
			}
		}

		if (ctx.state === 'suspended') {
			try {
				// 250 ms timeout guard for headless Chromium without audio output hardware
				await Promise.race([
					ctx.resume(),
					new Promise<void>((resolve) => window.setTimeout(resolve, 250))
				]);
			} catch {
				// Safe fallback
			}
		}
		unlocked = ctx.state === 'running' || ctx.state === 'suspended';
		return true;
	}

	function updateRir(rir: Float32Array, simFs: number = FS_SIM): void {
		latestRir = rir;
		latestRirFs = simFs;
		uploadRirToConvolver();
	}

	async function playDrySound(kind: DrySoundKind): Promise<void> {
		const ok = await ensureUnlocked();
		if (!ok || !ctx || !convolver || !dryGain || isMuted) return;

		let dryBuf = dryCache.get(kind);
		if (!dryBuf) {
			dryBuf = buildDryAudioBuffer(ctx, kind);
			dryCache.set(kind, dryBuf);
		}

		const src = ctx.createBufferSource();
		src.buffer = dryBuf;
		src.connect(convolver);
		src.connect(dryGain);
		activeSources.add(src);
		src.onended = () => {
			activeSources.delete(src);
			try {
				src.disconnect();
			} catch {
				// Ignore already disconnected
			}
		};
		src.start();
	}

	function stopContinuousTone(): void {
		if (activeToneGain && ctx) {
			try {
				activeToneGain.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
			} catch {
				// Ignore
			}
		}
		if (activeToneOsc) {
			const osc = activeToneOsc;
			const gain = activeToneGain;
			activeToneOsc = null;
			activeToneGain = null;
			try {
				osc.stop((ctx?.currentTime ?? 0) + 0.05);
			} catch {
				// Ignore
			}
			window.setTimeout(() => {
				try {
					osc.disconnect();
					gain?.disconnect();
				} catch {
					// Ignore
				}
			}, 70);
		}
	}

	async function startContinuousTone(freqHz: number): Promise<void> {
		const ok = await ensureUnlocked();
		if (!ok || !ctx || !convolver || !dryGain || isMuted) return;
		stopContinuousTone();

		const osc = ctx.createOscillator();
		const oscGain = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.value = Math.max(60, Math.min(1000, freqHz));
		oscGain.gain.setValueAtTime(0, ctx.currentTime);
		oscGain.gain.setTargetAtTime(0.18, ctx.currentTime, 0.025);

		osc.connect(oscGain);
		oscGain.connect(convolver);
		oscGain.connect(dryGain);
		osc.start();

		activeToneOsc = osc;
		activeToneGain = oscGain;
	}

	function setToneFrequency(freqHz: number): void {
		if (activeToneOsc && ctx) {
			activeToneOsc.frequency.setTargetAtTime(
				Math.max(60, Math.min(1000, freqHz)),
				ctx.currentTime,
				0.02
			);
		}
	}

	function setWetMode(wet: boolean): void {
		isWet = wet;
		applyRoutingGains();
	}

	function setMuted(muted: boolean): void {
		isMuted = muted;
		if (muted) stopContinuousTone();
		applyRoutingGains();
	}

	function setGainDb(db: number): void {
		gainDb = db;
		applyRoutingGains();
	}

	function stopAll(): void {
		stopContinuousTone();
		for (const src of activeSources) {
			try {
				src.stop();
				src.disconnect();
			} catch {
				// Ignore
			}
		}
		activeSources.clear();
	}

	function dispose(): void {
		stopAll();
		dryCache.clear();
		if (ctx) {
			try {
				void ctx.close();
			} catch {
				// Ignore
			}
			ctx = null;
		}
		convolver = null;
		wetGain = null;
		dryGain = null;
		highpass = null;
		masterGain = null;
		limiter = null;
		unlocked = false;
	}

	return {
		ensureUnlocked,
		updateRir,
		playDrySound,
		startContinuousTone,
		stopContinuousTone,
		setToneFrequency,
		setWetMode,
		setMuted,
		setGainDb,
		stopAll,
		dispose,
		isUnlocked: () => unlocked
	};
}
