import { describe, expect, it, vi } from 'vitest';
import {
	clampIrSampleRate,
	generateProceduralIr,
	IR_DEFAULT_SAMPLE_RATE,
	IR_MAX_SAMPLE_RATE,
	IR_MIN_SAMPLE_RATE,
	IR_PEAK_CEILING,
	REVERB_ROOM_SPECS,
	REVERB_ROOMS,
	type ReverbRoom
} from './procedural-ir';

function rms(samples: Float32Array): number {
	if (samples.length === 0) return 0;
	let sum = 0;
	for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
	return Math.sqrt(sum / samples.length);
}

function pearsonCorrelation(a: Float32Array, b: Float32Array): number {
	const n = Math.min(a.length, b.length);
	let meanA = 0;
	let meanB = 0;
	for (let i = 0; i < n; i++) {
		meanA += a[i];
		meanB += b[i];
	}
	meanA /= n;
	meanB /= n;
	let num = 0;
	let denA = 0;
	let denB = 0;
	for (let i = 0; i < n; i++) {
		const da = a[i] - meanA;
		const db = b[i] - meanB;
		num += da * db;
		denA += da * da;
		denB += db * db;
	}
	const den = Math.sqrt(denA * denB);
	return den === 0 ? 0 : num / den;
}

function meanAbsFirstDiffRatio(samples: Float32Array): number {
	const r = rms(samples);
	if (r === 0 || samples.length < 2) return 0;
	let diff = 0;
	for (let i = 1; i < samples.length; i++) diff += Math.abs(samples[i] - samples[i - 1]);
	return diff / (samples.length - 1) / r;
}

function expectFloatArraysBitIdentical(a: Float32Array, b: Float32Array): void {
	expect(a.length).toBe(b.length);
	let mismatches = 0;
	for (let i = 0; i < a.length; i++) {
		if (!Object.is(a[i], b[i])) mismatches++;
	}
	expect(mismatches).toBe(0);
}

describe('procedural stereo impulse response generator', () => {
	it('runs cleanly in Node without browser globals or Math.random', () => {
		expect(typeof window).toBe('undefined');
		expect(typeof AudioBuffer).toBe('undefined');
		const random = vi.spyOn(Math, 'random').mockImplementation(() => {
			throw new Error('Math.random forbidden in procedural-ir');
		});
		try {
			const ir = generateProceduralIr('hall', 48000);
			expect(ir.left.length).toBeGreaterThan(1000);
		} finally {
			random.mockRestore();
		}
	});

	it('clamps invalid and out-of-range sample rates cleanly', () => {
		expect(clampIrSampleRate(100)).toBe(IR_MIN_SAMPLE_RATE);
		expect(clampIrSampleRate(4000)).toBe(IR_MIN_SAMPLE_RATE);
		expect(clampIrSampleRate(44100.4)).toBe(44100);
		expect(clampIrSampleRate(500000)).toBe(IR_MAX_SAMPLE_RATE);
		expect(clampIrSampleRate(NaN)).toBe(IR_DEFAULT_SAMPLE_RATE);
		expect(clampIrSampleRate(Infinity)).toBe(IR_DEFAULT_SAMPLE_RATE);
		expect(clampIrSampleRate(-48000)).toBe(IR_DEFAULT_SAMPLE_RATE);
	});

	it('produces bit-for-bit deterministic output for every room', () => {
		for (const room of REVERB_ROOMS) {
			const first = generateProceduralIr(room, 48000);
			const second = generateProceduralIr(room, 48000);
			expect(first.sampleRate).toBe(48000);
			expectFloatArraysBitIdentical(first.left, second.left);
			expectFloatArraysBitIdentical(first.right, second.right);
		}
	});

	it('returns a safe 1-sample silent buffer for off and unknown rooms', () => {
		const off = generateProceduralIr('off', 44100);
		expect(off.sampleRate).toBe(44100);
		expect(off.left).toHaveLength(1);
		expect(off.right).toHaveLength(1);
		expect(off.left[0]).toBe(0);
		expect(off.right[0]).toBe(0);

		const unknown = generateProceduralIr('mars' as ReverbRoom, 48000);
		expect(unknown.left).toHaveLength(1);
		expect(unknown.right).toHaveLength(1);
		expect(unknown.left[0]).toBe(0);
		expect(unknown.right[0]).toBe(0);
	});

	it('stays strictly finite and normalized within [-1, 1] across rooms and sample rates', () => {
		for (const room of REVERB_ROOMS) {
			for (const sr of [8000, 44100, 48000, 96000]) {
				const ir = generateProceduralIr(room, sr);
				expect(ir.sampleRate).toBe(sr);
				expect(ir.left.length).toBe(ir.right.length);
				let maxAbs = 0;
				let invalidCount = 0;
				for (let i = 0; i < ir.left.length; i++) {
					const l = ir.left[i];
					const r = ir.right[i];
					if (!Number.isFinite(l) || !Number.isFinite(r) || l < -1 || l > 1 || r < -1 || r > 1) {
						invalidCount++;
					}
					const al = Math.abs(l);
					const ar = Math.abs(r);
					if (al > maxAbs) maxAbs = al;
					if (ar > maxAbs) maxAbs = ar;
				}
				expect(invalidCount).toBe(0);
				if (room !== 'off') {
					expect(maxAbs).toBeCloseTo(IR_PEAK_CEILING, 5);
				}
			}
		}
	});

	it('exhibits expected room length ordering, pre-delay silence, decay, stereo decorrelation, and HF damping', () => {
		const sr = 48000;
		const generated = new Map(REVERB_ROOMS.map((room) => [room, generateProceduralIr(room, sr)]));

		// Monotonic length ordering
		for (let i = 1; i < REVERB_ROOMS.length; i++) {
			const prev = generated.get(REVERB_ROOMS[i - 1])!;
			const curr = generated.get(REVERB_ROOMS[i])!;
			expect(curr.left.length).toBeGreaterThan(prev.left.length);
		}

		// Pre-delay silence and exponential decay for active rooms
		for (const room of REVERB_ROOMS.filter((r) => r !== 'off')) {
			const ir = generated.get(room)!;
			const spec = REVERB_ROOM_SPECS[room];
			const preDelaySamples = Math.round((spec.preDelayMs / 1000) * sr);
			for (let i = 0; i < preDelaySamples; i++) {
				expect(ir.left[i]).toBe(0);
				expect(ir.right[i]).toBe(0);
			}
			const tail = ir.left.subarray(preDelaySamples);
			const quarter = Math.floor(tail.length / 4);
			const headRms = rms(tail.subarray(0, quarter));
			const endRms = rms(tail.subarray(tail.length - quarter));
			expect(headRms).toBeGreaterThan(endRms * 5);

			const rmsL = rms(ir.left);
			const rmsR = rms(ir.right);
			expect(rmsL / rmsR).toBeGreaterThan(0.7);
			expect(rmsL / rmsR).toBeLessThan(1.3);
			expect(Math.abs(pearsonCorrelation(ir.left, ir.right))).toBeLessThan(0.25);
		}

		// Stronger HF damping in canyon (3000 Hz) than room (7500 Hz)
		const roomIr = generated.get('room')!;
		const canyonIr = generated.get('canyon')!;
		expect(meanAbsFirstDiffRatio(canyonIr.left)).toBeLessThan(meanAbsFirstDiffRatio(roomIr.left));
	});
});
