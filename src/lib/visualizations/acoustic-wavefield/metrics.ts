import { C0, FS_SIM, RICKER_DELAY_S, type AcousticMetrics, type SpectralPeak } from './types';

const EPS = 1e-12;

function sanitizeSample(v: number): number {
	return Number.isFinite(v) ? v : 0;
}

/**
 * Remove DC offset and apply a 20 ms raised-cosine tail taper so FFT and Web Audio
 * convolution remain free of end-truncation clicks.
 * Non-finite samples (NaN / ±Infinity) are sanitized to 0.
 */
export function cleanRirBuffer(raw: Float32Array, fs: number = FS_SIM): Float32Array {
	const n = raw.length;
	const out = new Float32Array(n);
	if (n === 0) return out;

	let sum = 0;
	for (let i = 0; i < n; i++) {
		const v = sanitizeSample(raw[i]);
		out[i] = v;
		sum += v;
	}
	const mean = sum / n;

	const safeFs = Number.isFinite(fs) && fs > 0 ? fs : FS_SIM;
	const taperLen = Math.min(n, Math.max(1, Math.round(0.02 * safeFs)));
	const taperStart = n - taperLen;
	for (let i = 0; i < n; i++) {
		let val = out[i] - mean;
		if (i >= taperStart) {
			const phase = (i - taperStart) / taperLen;
			val *= 0.5 * (1 + Math.cos(Math.PI * phase));
		}
		out[i] = val;
	}
	return out;
}

/**
 * Detect direct arrival index and time (in ms) from the cleaned RIR.
 * Uses the physical minimum flight bound (dist / c0) plus the causal Ricker onset,
 * then finds the first sample exceeding 1% of max|h|.
 */
export function detectDirectArrival(
	rir: Float32Array,
	fs: number = FS_SIM,
	distMeters: number = 0
): { index: number; ms: number; peakAmplitude: number } {
	const n = rir.length;
	let peakAbs = 0;
	let peakIdx = 0;
	for (let i = 0; i < n; i++) {
		const a = Math.abs(sanitizeSample(rir[i]));
		if (a > peakAbs) {
			peakAbs = a;
			peakIdx = i;
		}
	}
	if (peakAbs <= EPS) {
		return { index: 0, ms: 0, peakAmplitude: 0 };
	}

	// Causal Ricker onset starts rising around ~0.35 * RICKER_DELAY_S;
	// bounding below by distMeters / C0 prevents premature false triggers while capturing lens delays.
	const minTimeS = Math.max(0, distMeters / C0 + 0.35 * RICKER_DELAY_S);
	const minIdx = Math.min(n - 1, Math.max(0, Math.floor(minTimeS * fs)));
	const threshold = 0.01 * peakAbs;

	let arrivalIdx = peakIdx;
	for (let i = minIdx; i < n; i++) {
		if (Math.abs(sanitizeSample(rir[i])) >= threshold) {
			arrivalIdx = i;
			break;
		}
	}
	return {
		index: arrivalIdx,
		ms: (arrivalIdx / fs) * 1000,
		peakAmplitude: peakAbs
	};
}

/**
 * Schroeder backward-integrated energy decay curve in decibels (0 dB down to -120 dB).
 * Strictly non-increasing by construction.
 */
export function computeSchroederCurve(rir: Float32Array): Float32Array {
	const n = rir.length;
	const db = new Float32Array(n);
	if (n === 0) return db;

	const cum = new Float64Array(n);
	let running = 0;
	for (let i = n - 1; i >= 0; i--) {
		const v = sanitizeSample(rir[i]);
		running += v * v;
		cum[i] = running;
	}

	const total = cum[0];
	if (total <= EPS) {
		db.fill(-120);
		return db;
	}

	let prev = 0;
	for (let i = 0; i < n; i++) {
		const ratio = Math.max(cum[i] / total, EPS);
		let val = 10 * Math.log10(ratio);
		if (i > 0 && val > prev) val = prev; // Enforce strict monotonicity against float rounding
		db[i] = val;
		prev = val;
	}
	return db;
}

/**
 * Measure physical RMS energy decay (in dB) from peak 40 ms window to the pre-taper tail
 * [T_rir - 120 ms, T_rir - 25 ms], plus post-peak time span in seconds.
 */
function measurePhysicalDecayDb(
	rir: Float32Array,
	fs: number,
	startIdx: number
): { decayDb: number; postPeakSpanSec: number } {
	const n = rir.length;
	if (n === 0 || !Number.isFinite(fs) || fs <= 0) {
		return { decayDb: 0, postPeakSpanSec: 0 };
	}

	const winLen = Math.max(8, Math.round(0.04 * fs));
	const preTaperEnd = Math.max(1, n - Math.round(0.025 * fs));
	const tailStart = Math.max(0, n - Math.round(0.12 * fs));
	const tailEnd = Math.max(tailStart + 1, preTaperEnd);
	if (preTaperEnd < winLen || tailEnd <= tailStart) {
		return { decayDb: 0, postPeakSpanSec: 0 };
	}

	let tailSum = 0;
	for (let i = tailStart; i < tailEnd; i++) {
		const v = sanitizeSample(rir[i]);
		tailSum += v * v;
	}
	const tailE = tailSum / (tailEnd - tailStart);

	const hop = Math.max(4, Math.floor(winLen / 2));
	const maxStartLimit = preTaperEnd - winLen;
	let maxE = 0;
	let maxWinStart = 0;

	const checkWindow = (wStart: number) => {
		let sum = 0;
		for (let j = 0; j < winLen; j++) {
			const v = sanitizeSample(rir[wStart + j]);
			sum += v * v;
		}
		const e = sum / winLen;
		if (e > maxE) {
			maxE = e;
			maxWinStart = wStart;
		}
	};

	for (let i = 0; i <= maxStartLimit; i += hop) {
		checkWindow(i);
	}
	const clampedStart = Math.max(0, Math.min(maxStartLimit, startIdx));
	checkWindow(clampedStart);

	if (maxE <= EPS * 1e-6) {
		return { decayDb: 0, postPeakSpanSec: 0 };
	}

	const peakCenter = maxWinStart + winLen * 0.5;
	const tailCenter = (tailStart + tailEnd) * 0.5;
	const postPeakSpanSec = (tailCenter - peakCenter) / fs;
	const decayDb = 10 * Math.log10((maxE + 1e-18) / (tailE + 1e-18));
	return { decayDb, postPeakSpanSec };
}

/**
 * Linear least-squares regression on Schroeder curve over [highDb, lowDb] (e.g. [-5, -35] for T30).
 * Rejects curves dominated by finite-buffer truncation cliffs near the end of the buffer.
 */
function regressDecayDb(
	schroederDb: Float32Array,
	fs: number,
	highDb: number,
	lowDb: number,
	startIdx: number = 0
): number | null {
	const n = schroederDb.length;
	const midDb = 0.5 * (highDb + lowDb);
	let iStart = -1;
	let iMid = -1;
	let iEnd = -1;
	for (let i = startIdx; i < n; i++) {
		const y = schroederDb[i];
		if (!Number.isFinite(y)) return null;
		if (iStart === -1 && y <= highDb) iStart = i;
		if (iMid === -1 && y <= midDb) iMid = i;
		if (y <= lowDb) {
			iEnd = i;
			break;
		}
	}
	if (iStart === -1 || iEnd === -1 || iEnd - iStart < 8) return null;

	// Guard against finite-buffer Schroeder truncation illusion (e.g. non-decaying ringing
	// where the curve stays flat until the final ~5% of the buffer and then drops abruptly).
	const avail = Math.max(1, n - startIdx);
	if ((iEnd - startIdx) / avail > 0.94) return null;
	if (iMid !== -1 && iMid > iStart && iEnd > iMid) {
		const dt1 = iMid - iStart;
		const dt2 = iEnd - iMid;
		if (dt1 / dt2 > 3.5) return null;
	}

	const count = iEnd - iStart + 1;
	let sumT = 0;
	let sumY = 0;
	let sumTT = 0;
	let sumTY = 0;
	for (let i = iStart; i <= iEnd; i++) {
		const t = i / fs;
		const y = schroederDb[i];
		sumT += t;
		sumY += y;
		sumTT += t * t;
		sumTY += t * y;
	}
	const denom = count * sumTT - sumT * sumT;
	if (Math.abs(denom) <= EPS) return null;
	const slopeDbPerSec = (count * sumTY - sumT * sumY) / denom;
	if (slopeDbPerSec >= -1e-4) return null;

	const rt60Sec = -60 / slopeDbPerSec;
	if (!Number.isFinite(rt60Sec) || rt60Sec <= 0) return null;
	return rt60Sec * 1000;
}

export function estimateRt60(
	schroederDb: Float32Array,
	fs: number = FS_SIM,
	startIdx: number = 0,
	rir?: Float32Array
): { rt60Ms: number | null; method: 'T30' | 'T20' | 'open' } {
	if (!Number.isFinite(fs) || fs <= 0 || schroederDb.length < Math.round(0.16 * fs)) {
		return { rt60Ms: null, method: 'open' };
	}

	let allowT30 = true;
	if (rir) {
		const phys = measurePhysicalDecayDb(rir, fs, startIdx);
		if (phys.postPeakSpanSec < 0.06 || phys.decayDb < 25) {
			return { rt60Ms: null, method: 'open' };
		}
		if (phys.decayDb < 35) {
			allowT30 = false;
		}
	}

	if (allowT30) {
		const t30 = regressDecayDb(schroederDb, fs, -5, -35, startIdx);
		if (t30 !== null) return { rt60Ms: t30, method: 'T30' };
	}
	const t20 = regressDecayDb(schroederDb, fs, -5, -25, startIdx);
	if (t20 !== null) return { rt60Ms: t20, method: 'T20' };
	return { rt60Ms: null, method: 'open' };
}

/**
 * Clarity C80 in dB: 10 * log10(E_early(0..80ms after t0) / E_late(>80ms)).
 */
export function computeClarityC80(
	rir: Float32Array,
	directIdx: number,
	fs: number = FS_SIM
): number | null {
	const n = rir.length;
	if (n === 0) return null;
	const earlySamples = Math.round(0.08 * fs);
	const splitIdx = Math.min(n, directIdx + earlySamples);

	let earlyE = 0;
	let lateE = 0;
	for (let i = directIdx; i < splitIdx; i++) {
		const v = sanitizeSample(rir[i]);
		earlyE += v * v;
	}
	for (let i = splitIdx; i < n; i++) {
		const v = sanitizeSample(rir[i]);
		lateE += v * v;
	}
	if (earlyE <= EPS && lateE <= EPS) return null;
	return 10 * Math.log10((earlyE + EPS) / (lateE + EPS));
}

/**
 * In-place iterative Cooley-Tukey radix-2 FFT.
 */
export function fftRadix2(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	let j = 0;
	for (let i = 1; i < n; i++) {
		let bit = n >> 1;
		while (j & bit) {
			j ^= bit;
			bit >>= 1;
		}
		j ^= bit;
		if (i < j) {
			const tr = re[i];
			re[i] = re[j];
			re[j] = tr;
			const ti = im[i];
			im[i] = im[j];
			im[j] = ti;
		}
	}

	for (let len = 2; len <= n; len <<= 1) {
		const half = len >> 1;
		const angle = (-2 * Math.PI) / len;
		const wLenCos = Math.cos(angle);
		const wLenSin = Math.sin(angle);
		for (let i = 0; i < n; i += len) {
			let wCos = 1;
			let wSin = 0;
			for (let k = 0; k < half; k++) {
				const even = i + k;
				const odd = even + half;
				const tRe = wCos * re[odd] - wSin * im[odd];
				const tIm = wCos * im[odd] + wSin * re[odd];
				re[odd] = re[even] - tRe;
				im[odd] = im[even] - tIm;
				re[even] += tRe;
				im[even] += tIm;
				const nextCos = wCos * wLenCos - wSin * wLenSin;
				wSin = wCos * wLenSin + wSin * wLenCos;
				wCos = nextCos;
			}
		}
	}
}

/**
 * Zero-padded 16,384-point FFT magnitude spectrum over [minHz, maxHz] with top 5 eigenmode peaks.
 */
export function computeEigenmodeSpectrum(
	rir: Float32Array,
	fs: number = FS_SIM,
	minHz: number = 40,
	maxHz: number = 1100,
	fftSize: number = 16384
): { freqsHz: Float32Array; magDb: Float32Array; peakModes: SpectralPeak[] } {
	const re = new Float64Array(fftSize);
	const im = new Float64Array(fftSize);
	const copyLen = Math.min(rir.length, fftSize);
	for (let i = 0; i < copyLen; i++) {
		re[i] = sanitizeSample(rir[i]);
	}
	fftRadix2(re, im);

	const df = fs / fftSize;
	const kMin = Math.max(1, Math.floor(minHz / df));
	const kMax = Math.min(fftSize / 2 - 1, Math.ceil(maxHz / df));
	const count = Math.max(1, kMax - kMin + 1);

	const mags = new Float64Array(count);
	let maxMag = EPS;
	for (let idx = 0; idx < count; idx++) {
		const k = kMin + idx;
		const m = Math.hypot(re[k], im[k]);
		mags[idx] = m;
		if (m > maxMag) maxMag = m;
	}

	const freqsHz = new Float32Array(count);
	const magDb = new Float32Array(count);
	for (let idx = 0; idx < count; idx++) {
		freqsHz[idx] = (kMin + idx) * df;
		magDb[idx] = 20 * Math.log10(Math.max(mags[idx] / maxMag, 1e-6));
	}

	const candidates: SpectralPeak[] = [];
	const minPeakSeparationBins = Math.max(3, Math.round(14 / df));
	for (let idx = 1; idx < count - 1; idx++) {
		if (magDb[idx] > magDb[idx - 1] && magDb[idx] >= magDb[idx + 1] && magDb[idx] > -32) {
			candidates.push({ freqHz: freqsHz[idx], magDb: magDb[idx] });
		}
	}
	candidates.sort((a, b) => b.magDb - a.magDb);

	const peakModes: SpectralPeak[] = [];
	const minPeakSpacingHz = minPeakSeparationBins * df;
	for (const cand of candidates) {
		if (peakModes.every((p) => Math.abs(p.freqHz - cand.freqHz) >= minPeakSpacingHz)) {
			peakModes.push(cand);
			if (peakModes.length >= 5) break;
		}
	}

	return { freqsHz, magDb, peakModes };
}

/**
 * Full acoustic telemetry computation from a raw simulation RIR buffer.
 */
export function computeAcousticMetrics(
	rawRir: Float32Array,
	fs: number = FS_SIM,
	distMeters: number = 0
): AcousticMetrics {
	const rir = cleanRirBuffer(rawRir, fs);
	const arrival = detectDirectArrival(rir, fs, distMeters);
	const schroederDb = computeSchroederCurve(rir);
	const rt = estimateRt60(schroederDb, fs, arrival.index, rir);
	const clarityC80Db = computeClarityC80(rir, arrival.index, fs);
	const spectrum = computeEigenmodeSpectrum(rir, fs);

	return {
		rir,
		sampleRate: fs,
		directArrivalMs: arrival.ms,
		directSampleIndex: arrival.index,
		earlyEndSampleIndex: Math.min(rir.length - 1, arrival.index + Math.round(0.08 * fs)),
		peakAmplitude: arrival.peakAmplitude,
		schroederDb,
		rt60Ms: rt.rt60Ms,
		rt60Method: rt.method,
		clarityC80Db,
		spectrumFreqsHz: spectrum.freqsHz,
		spectrumDb: spectrum.magDb,
		peakModes: spectrum.peakModes
	};
}

/**
 * Normalized cross-correlation rho(a, b) in [-1, 1] for acoustic reciprocity verification.
 */
export function computeReciprocityCorrelation(a: Float32Array, b: Float32Array): number {
	const n = Math.min(a.length, b.length);
	if (n === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < n; i++) {
		const va = sanitizeSample(a[i]);
		const vb = sanitizeSample(b[i]);
		dot += va * vb;
		normA += va * va;
		normB += vb * vb;
	}
	const denom = Math.sqrt(normA * normB);
	if (denom <= EPS) return 0;
	return Math.max(-1, Math.min(1, dot / denom));
}

/**
 * Anti-image resampler from simulation sample rate (10,976 Hz) to Web Audio sampleRate (e.g. 44100 or 48000 Hz)
 * using Catmull-Rom cubic Hermite interpolation followed by a 2nd-order Butterworth low-pass at 4.2 kHz.
 */
export function resampleRirForAudio(rir: Float32Array, srcFs: number, dstFs: number): Float32Array {
	if (
		rir.length === 0 ||
		!Number.isFinite(srcFs) ||
		!Number.isFinite(dstFs) ||
		srcFs <= 0 ||
		dstFs <= 0
	) {
		return new Float32Array(0);
	}
	const ratio = srcFs / dstFs;
	const outLen = Math.max(1, Math.round((rir.length * dstFs) / srcFs));
	const upsampled = new Float32Array(outLen);
	const last = rir.length - 1;

	for (let i = 0; i < outLen; i++) {
		const srcPos = i * ratio;
		const k = Math.floor(srcPos);
		const t = srcPos - k;

		const y0 = sanitizeSample(rir[Math.max(0, k - 1)]);
		const y1 = sanitizeSample(rir[Math.min(last, k)]);
		const y2 = sanitizeSample(rir[Math.min(last, k + 1)]);
		const y3 = sanitizeSample(rir[Math.min(last, k + 2)]);

		const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
		const a1 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
		const a2 = -0.5 * y0 + 0.5 * y2;
		const a3 = y1;

		upsampled[i] = ((a0 * t + a1) * t + a2) * t + a3;
	}

	// 2nd-order Butterworth low-pass at fc = min(4200 Hz, 0.38 * srcFs) to suppress imaging
	const fc = Math.min(4200, 0.38 * srcFs);
	if (dstFs <= 2 * fc) return upsampled;

	const omega = 2 * Math.PI * (fc / dstFs);
	const sinW = Math.sin(omega);
	const cosW = Math.cos(omega);
	const alpha = sinW / Math.SQRT2;

	const b0 = (1 - cosW) / 2;
	const b1 = 1 - cosW;
	const b2 = (1 - cosW) / 2;
	const a0 = 1 + alpha;
	const a1 = -2 * cosW;
	const a2 = 1 - alpha;

	const nb0 = b0 / a0;
	const nb1 = b1 / a0;
	const nb2 = b2 / a0;
	const na1 = a1 / a0;
	const na2 = a2 / a0;

	const filtered = new Float32Array(outLen);
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < outLen; i++) {
		const x0 = upsampled[i];
		const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
		filtered[i] = y0;
		x2 = x1;
		x1 = x0;
		y2 = y1;
		y1 = y0;
	}
	return filtered;
}
