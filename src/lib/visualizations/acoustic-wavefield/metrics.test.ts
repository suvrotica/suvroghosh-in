import { describe, expect, it } from 'vitest';
import {
	computeAcousticMetrics,
	computeClarityC80,
	computeEigenmodeSpectrum,
	computeSchroederCurve,
	estimateRt60,
	resampleRirForAudio
} from './metrics';
import { FS_SIM, RIR_BUFFER_LENGTH } from './types';

describe('acoustic-wavefield metrics', () => {
	it('produces a strictly non-increasing Schroeder decay curve', () => {
		const rir = new Float32Array(RIR_BUFFER_LENGTH);
		for (let i = 0; i < rir.length; i++) {
			const t = i / FS_SIM;
			rir[i] = Math.exp(-3.2 * t) * Math.sin(2 * Math.PI * 260 * t);
		}
		const sch = computeSchroederCurve(rir);
		expect(sch[0]).toBeCloseTo(0, 4);
		for (let i = 1; i < sch.length; i++) {
			expect(sch[i]).toBeLessThanOrEqual(sch[i - 1] + 1e-6);
		}
	});

	it('recovers synthetic exponential RT60 within 2%', () => {
		const targetRt60Sec = 0.45;
		const n = Math.round(2.0 * FS_SIM);
		const rir = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const t = i / FS_SIM;
			rir[i] = Math.exp((-6.90775527898 * t) / targetRt60Sec);
		}
		const sch = computeSchroederCurve(rir);
		const est = estimateRt60(sch, FS_SIM, 0);
		expect(est.method).toBe('T30');
		expect(est.rt60Ms).not.toBeNull();
		const relErr = Math.abs(est.rt60Ms! - targetRt60Sec * 1000) / (targetRt60Sec * 1000);
		expect(relErr).toBeLessThan(0.02);
	});

	it('computes positive C80 for early-dominated impulse and negative C80 for late-dominated tail', () => {
		const n = RIR_BUFFER_LENGTH;
		const earlyDom = new Float32Array(n);
		earlyDom[200] = 1.0;
		earlyDom[500] = 0.4;
		earlyDom[4000] = 0.02;

		const lateDom = new Float32Array(n);
		lateDom[200] = 0.25;
		for (let i = 2000; i < n; i++) {
			lateDom[i] = 0.12 * Math.sin(i * 0.2);
		}

		const cEarly = computeClarityC80(earlyDom, 200, FS_SIM);
		const cLate = computeClarityC80(lateDom, 200, FS_SIM);
		expect(cEarly).not.toBeNull();
		expect(cLate).not.toBeNull();
		expect(cEarly!).toBeGreaterThan(10);
		expect(cLate!).toBeLessThan(-5);
	});

	it('recovers exact pure-tone resonant peak in eigenmode FFT spectrum', () => {
		const targetHz = 315;
		const rir = new Float32Array(RIR_BUFFER_LENGTH);
		for (let i = 100; i < rir.length; i++) {
			const t = i / FS_SIM;
			rir[i] = Math.exp(-1.5 * t) * Math.sin(2 * Math.PI * targetHz * t);
		}
		const spec = computeEigenmodeSpectrum(rir, FS_SIM);
		expect(spec.peakModes.length).toBeGreaterThan(0);
		expect(Math.abs(spec.peakModes[0].freqHz - targetHz)).toBeLessThan(2.5);

		const full = computeAcousticMetrics(rir, FS_SIM, 0);
		expect(full.peakModes.length).toBeGreaterThan(0);
		expect(Math.abs(full.peakModes[0].freqHz - targetHz)).toBeLessThan(2.5);
	});

	it('recovers synthetic 400 ms exponential impulse RT60 within 2%', () => {
		const targetRt60Sec = 0.4;
		const rir = new Float32Array(RIR_BUFFER_LENGTH);
		for (let i = 0; i < rir.length; i++) {
			const t = i / FS_SIM;
			rir[i] = Math.exp((-6.907755 * t) / targetRt60Sec);
		}
		const sch = computeSchroederCurve(rir);
		const est = estimateRt60(sch, FS_SIM, 0, rir);
		expect(est.method).toBe('T30');
		expect(est.rt60Ms).not.toBeNull();
		const relErr = Math.abs(est.rt60Ms! - 400) / 400;
		expect(relErr).toBeLessThan(0.02);
	});

	it('returns rt60Ms === null on constant-amplitude sine ringing (no Schroeder truncation illusion)', () => {
		const sine = new Float32Array(RIR_BUFFER_LENGTH);
		for (let i = 0; i < sine.length; i++) {
			sine[i] = Math.sin((2 * Math.PI * 245 * i) / FS_SIM);
		}
		const metrics = computeAcousticMetrics(sine, FS_SIM, 0);
		expect(metrics.rt60Ms).toBeNull();
		expect(metrics.rt60Method).toBe('open');

		const directEst = estimateRt60(computeSchroederCurve(sine), FS_SIM, 0);
		expect(directEst.rt60Ms).toBeNull();
		expect(directEst.method).toBe('open');
	});

	it('returns rt60Ms === null on slow < 25 dB exponential decay within the capture window', () => {
		const slow = new Float32Array(RIR_BUFFER_LENGTH);
		for (let i = 0; i < slow.length; i++) {
			const t = i / FS_SIM;
			slow[i] = Math.exp(-0.15 * t) * Math.sin((2 * Math.PI * 245 * i) / FS_SIM);
		}
		const metrics = computeAcousticMetrics(slow, FS_SIM, 0);
		expect(metrics.rt60Ms).toBeNull();
		expect(metrics.rt60Method).toBe('open');

		const directEst = estimateRt60(computeSchroederCurve(slow), FS_SIM, 0);
		expect(directEst.rt60Ms).toBeNull();
		expect(directEst.method).toBe('open');
	});

	it('returns rt60Ms === null for a sparse single impulse at the end of the buffer', () => {
		const imp = new Float32Array(RIR_BUFFER_LENGTH);
		imp[RIR_BUFFER_LENGTH - 1] = 1.0;
		const metrics = computeAcousticMetrics(imp, FS_SIM, 0);
		expect(metrics.rt60Ms).toBeNull();
		expect(metrics.rt60Method).toBe('open');
	});

	it('sanitizes NaN and Infinity samples so schroederDb, spectrumDb, and resampled audio remain finite', () => {
		const rir = new Float32Array(RIR_BUFFER_LENGTH);
		for (let i = 0; i < rir.length; i++) {
			const t = i / FS_SIM;
			rir[i] = Math.exp(-6.0 * t) * Math.sin(2 * Math.PI * 300 * t);
		}
		rir[250] = Number.NaN;
		rir[500] = Number.POSITIVE_INFINITY;
		rir[750] = Number.NEGATIVE_INFINITY;

		const metrics = computeAcousticMetrics(rir, FS_SIM, 0);
		expect(metrics.rir.every(Number.isFinite)).toBe(true);
		expect(metrics.schroederDb.every(Number.isFinite)).toBe(true);
		expect(metrics.spectrumDb.every(Number.isFinite)).toBe(true);

		const resampled = resampleRirForAudio(rir, FS_SIM, 48000);
		expect(resampled.length).toBeGreaterThan(0);
		expect(resampled.every(Number.isFinite)).toBe(true);
	});
});
