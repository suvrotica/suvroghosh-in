/** Browser-independent signal settings and calculations. No claimed source-resolution metadata. */
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_Q = Math.SQRT2;
export const RESPONSE_FREQUENCIES = Array.from({ length: 64 }, (_, i) => 20 * 1000 ** (i / 63));
export const SPECTRUM_FREQUENCIES = Array.from(
	{ length: 48 },
	(_, i) => 30 * (18000 / 30) ** (i / 47)
);

export interface AudioSettings {
	eq: number[];
	trimDb: number;
	width: number;
	balance: number;
	mono: boolean;
	volume: number;
	bypass: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
	eq: EQ_FREQUENCIES.map(() => 0),
	trimDb: 0,
	width: 1,
	balance: 0,
	mono: false,
	volume: 70,
	bypass: false
};

export const EQ_PRESETS = [
	{ id: 'neutral', label: 'Neutral', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
	{ id: 'bass', label: 'Gentle bass', gains: [1, 2, 2, 1, 0, 0, 0, 0, 0, 0] },
	{ id: 'voice', label: 'Clear vocals', gains: [-2, -2, -1, 0, 1, 2, 2, 1, 0, -1] },
	{ id: 'soft', label: 'Softer treble', gains: [0, 0, 0, 0, 0, 0, -1, -2, -3, -3] }
] as const;

export function clamp(value: number, min: number, max: number, fallback = min): number {
	return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function dbToGain(db: number): number {
	return 10 ** (clamp(db, -160, 120, 0) / 20);
}

export function gainToDb(gain: number): number {
	return 20 * Math.log10(Math.max(1e-8, Number.isFinite(gain) ? Math.abs(gain) : 0));
}

export function normalizeAudioSettings(value: unknown = {}): AudioSettings {
	const input =
		value !== null && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const eq = Array.isArray(input.eq) ? input.eq : [];
	const number = (candidate: unknown, min: number, max: number, fallback: number) =>
		clamp(typeof candidate === 'number' ? candidate : fallback, min, max, fallback);
	return {
		eq: EQ_FREQUENCIES.map((_, i) => number(eq[i], -6, 6, 0)),
		trimDb: number(input.trimDb, -18, 6, 0),
		width: number(input.width, 0, 1.25, 1),
		balance: number(input.balance, -1, 1, 0),
		mono: input.mono === true,
		volume: number(input.volume, 0, 100, 70),
		bypass: input.bypass === true
	};
}

/** L' = ll L + lr R, R' = rl L + rr R. Mid = (L+R)/2; Side = (L-R)/2. */
export function stereoMatrix(width: number, balance = 0, mono = false) {
	const w = mono ? 0 : clamp(width, 0, 1.25, 1);
	const b = clamp(balance, -1, 1, 0);
	const same = (1 + w) / 2;
	const cross = (1 - w) / 2;
	const left = 1 - Math.max(0, b);
	const right = 1 + Math.min(0, b);
	return { ll: same * left, lr: cross * left, rl: cross * right, rr: same * right };
}

/** RBJ peaking-EQ response, matching the native BiquadFilterNode's peaking type. */
export function eqResponseDb(
	eq: readonly number[],
	sampleRate: number,
	frequencies = RESPONSE_FREQUENCIES
): number[] {
	const rate = Math.max(8000, sampleRate);
	return frequencies.map((frequency) => {
		if (frequency >= rate / 2) return 0;
		const w = (2 * Math.PI * frequency) / rate;
		const cos1 = Math.cos(w);
		const sin1 = Math.sin(w);
		const cos2 = Math.cos(2 * w);
		const sin2 = Math.sin(2 * w);
		let result = 0;
		EQ_FREQUENCIES.forEach((center, i) => {
			const gain = clamp(eq[i] ?? 0, -6, 6, 0);
			if (gain === 0) return;
			const a = 10 ** (gain / 40);
			const w0 = (2 * Math.PI * Math.min(center, rate * 0.49)) / rate;
			const alpha = Math.sin(w0) / (2 * EQ_Q);
			const b0 = 1 + alpha * a;
			const b1 = -2 * Math.cos(w0);
			const b2 = 1 - alpha * a;
			const a0 = 1 + alpha / a;
			const a1 = b1;
			const a2 = 1 - alpha / a;
			const numerator = (b0 + b1 * cos1 + b2 * cos2) ** 2 + (b1 * sin1 + b2 * sin2) ** 2;
			const denominator = (a0 + a1 * cos1 + a2 * cos2) ** 2 + (a1 * sin1 + a2 * sin2) ** 2;
			result += 10 * Math.log10(Math.max(1e-16, numerator / denominator));
		});
		return result;
	});
}

/** Sampled EQ response + worst-case matrix gain + 1 dB margin; not a true-peak limiter. */
export function headroomDb(settings: AudioSettings, sampleRate = 48000): number {
	const s = normalizeAudioSettings(settings);
	if (s.bypass) return 0;
	const frequencies = [
		...EQ_FREQUENCIES,
		...Array.from({ length: 256 }, (_, i) => 10 * ((sampleRate * 0.499) / 10) ** (i / 255))
	];
	const eqBoost = Math.max(0, ...eqResponseDb(s.eq, sampleRate, frequencies));
	const matrixBoost = gainToDb(Math.max(1, s.mono ? 1 : s.width));
	const boost = eqBoost + matrixBoost + s.trimDb;
	return boost > 0.0001 ? -(boost + 1) : 0;
}

export function measureSamples(samples: Float32Array): { peak: number; rms: number } {
	let peak = 0;
	let sum = 0;
	for (const sample of samples) {
		const value = Number.isFinite(sample) ? sample : 0;
		peak = Math.max(peak, Math.abs(value));
		sum += value * value;
	}
	return { peak, rms: samples.length ? Math.sqrt(sum / samples.length) : 0 };
}

/** Original, deterministic twelve-second stereo phrase. Created locally; nothing is fetched. */
export function createDemoWav(): Blob {
	const rate = 44100;
	const frames = 12 * rate;
	const buffer = new ArrayBuffer(44 + frames * 4);
	const view = new DataView(buffer);
	const writeText = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};
	writeText(0, 'RIFF');
	view.setUint32(4, buffer.byteLength - 8, true);
	writeText(8, 'WAVEfmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 2, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 4, true);
	view.setUint16(32, 4, true);
	view.setUint16(34, 16, true);
	writeText(36, 'data');
	view.setUint32(40, frames * 4, true);
	const notes = [60, 67, 64, 71, 69, 64, 72, 67, 62, 69, 65, 74, 71, 67, 64, 62];
	for (let i = 0; i < frames; i++) {
		const t = i / rate;
		const beat = Math.floor(t / 0.375);
		const within = t % 0.375;
		const frequency = 440 * 2 ** ((notes[beat % notes.length] - 69) / 12);
		const envelope = Math.min(1, within / 0.012) * Math.exp(-within * 7);
		const phase = 2 * Math.PI * frequency * t;
		const lead =
			envelope * (Math.sin(phase) + 0.22 * Math.sin(2 * phase) + 0.07 * Math.sin(3 * phase)) * 0.22;
		const bassFrequency = beat % 16 < 8 ? 130.8128 : 146.8324;
		const bass = Math.sin(2 * Math.PI * bassFrequency * t) * 0.1;
		const fade = Math.min(1, t / 0.08, (12 - t) / 0.3);
		const pan = 0.3 * Math.sin(beat * 1.7);
		const left = fade * (lead * (1 - pan) + bass);
		const right = fade * (lead * (1 + pan) + bass);
		view.setInt16(44 + i * 4, Math.round(clamp(left, -1, 1) * 32767), true);
		view.setInt16(46 + i * 4, Math.round(clamp(right, -1, 1) * 32767), true);
	}
	return new Blob([buffer], { type: 'audio/wav' });
}
