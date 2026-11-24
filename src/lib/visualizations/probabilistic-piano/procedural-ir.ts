export const REVERB_ROOMS = ['off', 'room', 'studio', 'chamber', 'hall', 'canyon'] as const;
export type ReverbRoom = (typeof REVERB_ROOMS)[number];

export interface ReverbRoomSpec {
	readonly id: ReverbRoom;
	readonly label: string;
	readonly decaySeconds: number;
	readonly preDelayMs: number;
	readonly earlyWindowMs: number;
	readonly earlyReflectionCount: number;
	readonly earlyLevel: number;
	readonly dampingHz: number;
	readonly seed: number;
}

export interface ProceduralIrResult {
	left: Float32Array;
	right: Float32Array;
	sampleRate: number;
}

export const IR_MIN_SAMPLE_RATE = 8000;
export const IR_MAX_SAMPLE_RATE = 192000;
export const IR_DEFAULT_SAMPLE_RATE = 48000;
export const IR_PEAK_CEILING = 0.95;

const LN_1000 = 6.907755278982137;

export const REVERB_ROOM_SPECS: Readonly<Record<ReverbRoom, ReverbRoomSpec>> = Object.freeze({
	off: Object.freeze({
		id: 'off',
		label: 'Off',
		decaySeconds: 0,
		preDelayMs: 0,
		earlyWindowMs: 0,
		earlyReflectionCount: 0,
		earlyLevel: 0,
		dampingHz: 20000,
		seed: 0
	}),
	room: Object.freeze({
		id: 'room',
		label: 'Room',
		decaySeconds: 0.65,
		preDelayMs: 8,
		earlyWindowMs: 35,
		earlyReflectionCount: 6,
		earlyLevel: 0.45,
		dampingHz: 7500,
		seed: 0x13572468
	}),
	studio: Object.freeze({
		id: 'studio',
		label: 'Studio',
		decaySeconds: 1.15,
		preDelayMs: 14,
		earlyWindowMs: 50,
		earlyReflectionCount: 8,
		earlyLevel: 0.4,
		dampingHz: 6000,
		seed: 0x24681357
	}),
	chamber: Object.freeze({
		id: 'chamber',
		label: 'Chamber',
		decaySeconds: 1.85,
		preDelayMs: 22,
		earlyWindowMs: 75,
		earlyReflectionCount: 10,
		earlyLevel: 0.35,
		dampingHz: 4800,
		seed: 0x369cf147
	}),
	hall: Object.freeze({
		id: 'hall',
		label: 'Hall',
		decaySeconds: 2.85,
		preDelayMs: 32,
		earlyWindowMs: 110,
		earlyReflectionCount: 12,
		earlyLevel: 0.3,
		dampingHz: 4200,
		seed: 0x48269a1f
	}),
	canyon: Object.freeze({
		id: 'canyon',
		label: 'Canyon',
		decaySeconds: 4.5,
		preDelayMs: 55,
		earlyWindowMs: 260,
		earlyReflectionCount: 10,
		earlyLevel: 0.42,
		dampingHz: 3000,
		seed: 0x5a7b9c1d
	})
});

function createMulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	};
}

export function clampIrSampleRate(sampleRate: number): number {
	if (!Number.isFinite(sampleRate) || sampleRate <= 0) return IR_DEFAULT_SAMPLE_RATE;
	return Math.round(Math.max(IR_MIN_SAMPLE_RATE, Math.min(IR_MAX_SAMPLE_RATE, sampleRate)));
}

export function generateProceduralIr(room: ReverbRoom, sampleRate: number): ProceduralIrResult {
	const sr = clampIrSampleRate(sampleRate);
	const roomKey: ReverbRoom = Object.prototype.hasOwnProperty.call(REVERB_ROOM_SPECS, room)
		? room
		: 'off';
	const spec = REVERB_ROOM_SPECS[roomKey];

	if (roomKey === 'off' || spec.decaySeconds <= 0) {
		return {
			left: new Float32Array(1),
			right: new Float32Array(1),
			sampleRate: sr
		};
	}

	const preDelaySamples = Math.round((spec.preDelayMs / 1000) * sr);
	const decaySamples = Math.max(1, Math.round(spec.decaySeconds * sr));
	const totalSamples = preDelaySamples + decaySamples;
	const left = new Float32Array(totalSamples);
	const right = new Float32Array(totalSamples);

	const randL = createMulberry32(spec.seed);
	const randR = createMulberry32((spec.seed ^ 0x9e3779b9) >>> 0);

	if (spec.earlyReflectionCount > 0 && spec.earlyWindowMs > 0) {
		const earlyWindowSamples = Math.max(1, Math.round((spec.earlyWindowMs / 1000) * sr));
		const subSpan = Math.max(1, Math.floor(earlyWindowSamples / spec.earlyReflectionCount));
		for (let r = 0; r < spec.earlyReflectionCount; r++) {
			const windowStart =
				preDelaySamples + Math.floor((r / spec.earlyReflectionCount) * earlyWindowSamples);
			const idxL = Math.min(totalSamples - 1, windowStart + Math.floor(randL() * subSpan));
			const idxR = Math.min(totalSamples - 1, windowStart + Math.floor(randR() * subSpan));
			const amp = spec.earlyLevel * Math.pow(0.78, r);
			const signL = r % 2 === 0 ? 1 : -1;
			const signR = (r + (randR() > 0.5 ? 1 : 0)) % 2 === 0 ? 1 : -1;
			const panL = 0.55 + 0.45 * randL();
			const panR = 0.55 + 0.45 * randR();
			left[idxL] += signL * amp * panL;
			right[idxR] += signR * amp * panR;
		}
	}

	const taperSamples = Math.max(1, Math.floor(decaySamples * 0.05));
	const taperStart = totalSamples - taperSamples;
	for (let i = preDelaySamples; i < totalSamples; i++) {
		const t = (i - preDelaySamples) / sr;
		const env = Math.exp((-LN_1000 * t) / spec.decaySeconds);
		const onset = Math.min(1, t / 0.01);
		let taper = 1;
		if (i >= taperStart) {
			const u = (i - taperStart) / taperSamples;
			taper = 0.5 * (1 + Math.cos(Math.PI * u));
		}
		const scale = env * onset * taper;
		left[i] += (randL() + randL() - 1) * scale;
		right[i] += (randR() + randR() - 1) * scale;
	}

	const rc = 1 / (2 * Math.PI * spec.dampingHz);
	const dt = 1 / sr;
	const alpha = dt / (rc + dt);
	let stateL = 0;
	let stateR = 0;
	for (let i = preDelaySamples; i < totalSamples; i++) {
		stateL += alpha * (left[i] - stateL);
		left[i] = stateL;
		stateR += alpha * (right[i] - stateR);
		right[i] = stateR;
	}

	let maxAbs = 0;
	for (let i = preDelaySamples; i < totalSamples; i++) {
		const al = Math.abs(left[i]);
		const ar = Math.abs(right[i]);
		if (al > maxAbs) maxAbs = al;
		if (ar > maxAbs) maxAbs = ar;
	}

	if (maxAbs > 0 && Number.isFinite(maxAbs)) {
		const gain = IR_PEAK_CEILING / maxAbs;
		for (let i = preDelaySamples; i < totalSamples; i++) {
			left[i] *= gain;
			right[i] *= gain;
		}
	}

	return { left, right, sampleRate: sr };
}
