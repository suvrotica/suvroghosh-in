import {
	BARK_BANDS,
	BARK_UPPER_HZ,
	getLoadedNeuralWeights,
	stepBarkGruInference
} from './neural-weights';
import type {
	AudioMeasurement,
	EnhancementAnalysisResult,
	EnhancementSettings
} from './types';

const EPSILON = 1e-12;

export function linearToDb(linear: number): number {
	return 20 * Math.log10(Math.max(EPSILON, Math.abs(linear)));
}

export function dbToLinear(db: number): number {
	return Math.pow(10, db / 20);
}

interface BiquadCoeffs {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

function designHighPassBiquad(freqHz: number, q: number, sampleRate: number): BiquadCoeffs {
	const w0 = (2 * Math.PI * Math.min(freqHz, sampleRate * 0.45)) / sampleRate;
	const cosW0 = Math.cos(w0);
	const sinW0 = Math.sin(w0);
	const alpha = sinW0 / (2 * q);
	const a0 = 1 + alpha;
	return {
		b0: (1 + cosW0) / 2 / a0,
		b1: -(1 + cosW0) / a0,
		b2: (1 + cosW0) / 2 / a0,
		a1: (-2 * cosW0) / a0,
		a2: (1 - alpha) / a0
	};
}

function designNotchBiquad(freqHz: number, q: number, sampleRate: number): BiquadCoeffs {
	if (freqHz >= sampleRate * 0.47) {
		return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
	}
	const w0 = (2 * Math.PI * freqHz) / sampleRate;
	const cosW0 = Math.cos(w0);
	const sinW0 = Math.sin(w0);
	const alpha = sinW0 / (2 * q);
	const a0 = 1 + alpha;
	return {
		b0: 1 / a0,
		b1: (-2 * cosW0) / a0,
		b2: 1 / a0,
		a1: (-2 * cosW0) / a0,
		a2: (1 - alpha) / a0
	};
}

function designPeakingBiquad(
	freqHz: number,
	q: number,
	gainDb: number,
	sampleRate: number
): BiquadCoeffs {
	if (Math.abs(gainDb) < 0.05 || freqHz >= sampleRate * 0.47) {
		return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
	}
	const A = Math.pow(10, gainDb / 40);
	const w0 = (2 * Math.PI * freqHz) / sampleRate;
	const cosW0 = Math.cos(w0);
	const sinW0 = Math.sin(w0);
	const alpha = sinW0 / (2 * q);
	const a0 = 1 + alpha / A;
	return {
		b0: (1 + alpha * A) / a0,
		b1: (-2 * cosW0) / a0,
		b2: (1 - alpha * A) / a0,
		a1: (-2 * cosW0) / a0,
		a2: (1 - alpha / A) / a0
	};
}

function designHighShelfBiquad(
	freqHz: number,
	slope: number,
	gainDb: number,
	sampleRate: number
): BiquadCoeffs {
	if (Math.abs(gainDb) < 0.05 || freqHz >= sampleRate * 0.47) {
		return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
	}
	const A = Math.pow(10, gainDb / 40);
	const w0 = (2 * Math.PI * freqHz) / sampleRate;
	const cosW0 = Math.cos(w0);
	const sinW0 = Math.sin(w0);
	const alpha = (sinW0 / 2) * Math.sqrt((A + 1 / A) * (1 / slope - 1) + 2);
	const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
	const a0 = A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha;
	return {
		b0: (A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha)) / a0,
		b1: (-2 * A * (A - 1 + (A + 1) * cosW0)) / a0,
		b2: (A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha)) / a0,
		a1: (2 * (A - 1 - (A + 1) * cosW0)) / a0,
		a2: (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha) / a0
	};
}

function designBandPassBiquad(freqHz: number, q: number, sampleRate: number): BiquadCoeffs {
	const w0 = (2 * Math.PI * Math.min(freqHz, sampleRate * 0.45)) / sampleRate;
	const cosW0 = Math.cos(w0);
	const sinW0 = Math.sin(w0);
	const alpha = sinW0 / (2 * q);
	const a0 = 1 + alpha;
	return {
		b0: alpha / a0,
		b1: 0,
		b2: -alpha / a0,
		a1: (-2 * cosW0) / a0,
		a2: (1 - alpha) / a0
	};
}

function applyBiquadInPlace(samples: Float32Array, c: BiquadCoeffs): void {
	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	const { b0, b1, b2, a1, a2 } = c;
	for (let i = 0; i < samples.length; i++) {
		const x0 = samples[i];
		const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
		x2 = x1;
		x1 = x0;
		y2 = y1;
		y1 = y0;
		samples[i] = y0;
	}
}

function applyBiquadCopy(samples: Float32Array, c: BiquadCoeffs): Float32Array {
	const out = new Float32Array(samples);
	applyBiquadInPlace(out, c);
	return out;
}

/**
 * Goertzel single-frequency power detector (normalized mean-square power).
 */
function goertzelPower(samples: Float32Array, targetHz: number, sampleRate: number): number {
	const n = Math.min(samples.length, Math.round(sampleRate * 4));
	if (n < 256 || targetHz >= sampleRate * 0.48) return EPSILON;
	const k = Math.round((n * targetHz) / sampleRate);
	const w = (2 * Math.PI * k) / n;
	const coeff = 2 * Math.cos(w);
	let s1 = 0;
	let s2 = 0;
	for (let i = 0; i < n; i++) {
		const s0 = samples[i] + coeff * s1 - s2;
		s2 = s1;
		s1 = s0;
	}
	const power = (s1 * s1 + s2 * s2 - coeff * s1 * s2) / (n * n * 0.25);
	return Math.max(EPSILON, power);
}

/**
 * Computes ITU-R BS.1770-4 K-weighted integrated loudness (LUFS).
 */
export function computeKWeightedLufs(channelData: Float32Array[], sampleRate: number): number {
	const numSamples = channelData[0]?.length ?? 0;
	if (numSamples === 0 || sampleRate <= 0) return -70;

	// Stage 1: acoustic head-model high-shelf (+4 dB above 1.5 kHz)
	const kShelf = designHighShelfBiquad(1500, 1.0, 4.0, sampleRate);
	// Stage 2: RLB high-pass at 38 Hz
	const kRlb = designHighPassBiquad(38, 0.5, sampleRate);

	const filteredChannels = channelData.map((ch) => {
		const copy = new Float32Array(ch);
		applyBiquadInPlace(copy, kShelf);
		applyBiquadInPlace(copy, kRlb);
		return copy;
	});

	// 400 ms gating blocks with 75% overlap (100 ms step)
	const blockSize = Math.max(64, Math.round(sampleRate * 0.4));
	const hopSize = Math.max(16, Math.round(sampleRate * 0.1));
	const blockPowers: number[] = [];

	if (numSamples <= blockSize) {
		let sumSq = 0;
		for (const ch of filteredChannels) {
			let chSq = 0;
			for (let i = 0; i < ch.length; i++) chSq += ch[i] * ch[i];
			sumSq += chSq / ch.length;
		}
		return Math.max(-70, -0.691 + 10 * Math.log10(Math.max(EPSILON, sumSq)));
	}

	for (let start = 0; start + blockSize <= numSamples; start += hopSize) {
		let blockSum = 0;
		for (const ch of filteredChannels) {
			let chSum = 0;
			for (let i = start; i < start + blockSize; i++) {
				const v = ch[i];
				chSum += v * v;
			}
			blockSum += chSum / blockSize;
		}
		blockPowers.push(blockSum);
	}

	// Absolute gate at -70 LUFS
	const absGatePower = Math.pow(10, (-70 + 0.691) / 10);
	const absGated = blockPowers.filter((p) => p > absGatePower);
	if (absGated.length === 0) return -70;

	const meanAbsPower = absGated.reduce((acc, v) => acc + v, 0) / absGated.length;
	// Relative gate at -10 LU below ungated mean
	const relGatePower = meanAbsPower * Math.pow(10, -10 / 10);
	const relGated = absGated.filter((p) => p >= relGatePower);
	const finalMean =
		(relGated.length > 0 ? relGated : absGated).reduce((acc, v) => acc + v, 0) /
		(relGated.length > 0 ? relGated.length : absGated.length);

	return Math.max(-70, -0.691 + 10 * Math.log10(Math.max(EPSILON, finalMean)));
}

/**
 * Performs comprehensive acoustic analysis on a buffer of audio channels.
 */
export function analyzeAudioBuffer(
	channelData: Float32Array[],
	sampleRate: number
): AudioMeasurement {
	const ch0 = channelData[0] ?? new Float32Array(0);
	const numSamples = ch0.length;
	const durationSec = sampleRate > 0 ? numSamples / sampleRate : 0;

	if (numSamples === 0 || sampleRate <= 0) {
		return {
			durationSec: 0,
			integratedLufs: -70,
			rmsDbfs: -90,
			peakDbfs: -90,
			noiseFloorDbfs: -90,
			crestFactorDb: 0,
			humFrequencyHz: null,
			humLevelDbfs: -90,
			rumbleLevelDbfs: -90,
			sibilanceRatio: 0,
			clippedSamples: 0,
			silenceRatio: 1
		};
	}

	// Mixdown to mono for spectral / noise-floor detectors while tracking true multi-channel peak & clipping
	const mono = new Float32Array(numSamples);
	const numCh = channelData.length;
	let totalSq = 0;
	let maxPeak = 0;
	let clippedSamples = 0;

	for (let c = 0; c < numCh; c++) {
		const ch = channelData[c];
		for (let i = 0; i < numSamples; i++) {
			const v = ch[i];
			const absV = Math.abs(v);
			if (absV > maxPeak) maxPeak = absV;
			if (absV >= 0.999) clippedSamples++;
			totalSq += v * v;
			mono[i] += v / numCh;
		}
	}

	const rmsLinear = Math.sqrt(totalSq / (numSamples * numCh));
	const rmsDbfs = Math.max(-96, linearToDb(rmsLinear));
	const peakDbfs = Math.max(-96, linearToDb(maxPeak));
	const crestFactorDb = Math.max(0, peakDbfs - rmsDbfs);

	// Short-term 50 ms frame energy analysis for noise floor and silence ratio
	const frameLen = Math.max(64, Math.round(sampleRate * 0.05));
	const frameDbList: number[] = [];
	let silentFrames = 0;
	let totalFrames = 0;

	for (let start = 0; start < numSamples; start += frameLen) {
		const end = Math.min(numSamples, start + frameLen);
		const len = end - start;
		if (len < 16) continue;
		let sum = 0;
		for (let i = start; i < end; i++) {
			sum += mono[i] * mono[i];
		}
		const frameRms = Math.sqrt(sum / len);
		const db = linearToDb(frameRms);
		totalFrames++;
		if (db < -48) silentFrames++;
		if (db > -88) {
			frameDbList.push(db);
		}
	}

	frameDbList.sort((a, b) => a - b);
	const noiseFloorDbfs =
		frameDbList.length > 0
			? frameDbList[Math.min(frameDbList.length - 1, Math.floor(frameDbList.length * 0.15))]
			: -85;
	const silenceRatio = totalFrames > 0 ? silentFrames / totalFrames : 0;

	// Electrical hum detection (50 Hz & 60 Hz fundamental prominence vs immediate flanking bins)
	const p50Fund = goertzelPower(mono, 50, sampleRate);
	const p60Fund = goertzelPower(mono, 60, sampleRate);
	const p50Flank =
		0.5 * (goertzelPower(mono, 43, sampleRate) + goertzelPower(mono, 55, sampleRate));
	const p60Flank =
		0.5 * (goertzelPower(mono, 55, sampleRate) + goertzelPower(mono, 67, sampleRate));

	const db50 = 10 * Math.log10(p50Fund);
	const db60 = 10 * Math.log10(p60Fund);
	const db50Ref = 10 * Math.log10(Math.max(EPSILON, p50Flank));
	const db60Ref = 10 * Math.log10(Math.max(EPSILON, p60Flank));

	let humFrequencyHz: 50 | 60 | null = null;
	let humLevelDbfs = Math.max(-96, Math.max(db50, db60));
	if (db50 - db50Ref >= 6.0 && db50 >= db60 && db50 > -58) {
		humFrequencyHz = 50;
		humLevelDbfs = Math.max(-96, db50);
	} else if (db60 - db60Ref >= 6.0 && db60 > db50 && db60 > -58) {
		humFrequencyHz = 60;
		humLevelDbfs = Math.max(-96, db60);
	}

	// Sub-80 Hz rumble energy measurement
	const hp80 = applyBiquadCopy(mono, designHighPassBiquad(85, 0.707, sampleRate));
	let rumbleEnergy = 0;
	for (let i = 0; i < numSamples; i++) {
		const diff = mono[i] - hp80[i];
		rumbleEnergy += diff * diff;
	}
	const rumbleLevelDbfs = Math.max(-96, linearToDb(Math.sqrt(rumbleEnergy / numSamples)));

	// Sibilance ratio (6.2 kHz band-pass vs 1.2 kHz core voice band-pass)
	const sibBand = applyBiquadCopy(mono, designBandPassBiquad(6200, 1.4, sampleRate));
	const midBand = applyBiquadCopy(mono, designBandPassBiquad(1200, 0.8, sampleRate));
	let sibSq = 0;
	let midSq = 0;
	for (let i = 0; i < numSamples; i++) {
		sibSq += sibBand[i] * sibBand[i];
		midSq += midBand[i] * midBand[i];
	}
	const sibilanceRatio = Number(
		Math.min(2, Math.sqrt(sibSq / Math.max(EPSILON, midSq))).toFixed(3)
	);

	const integratedLufs = computeKWeightedLufs(channelData, sampleRate);

	return {
		durationSec: Number(durationSec.toFixed(3)),
		integratedLufs: Number(integratedLufs.toFixed(2)),
		rmsDbfs: Number(rmsDbfs.toFixed(2)),
		peakDbfs: Number(peakDbfs.toFixed(2)),
		noiseFloorDbfs: Number(noiseFloorDbfs.toFixed(2)),
		crestFactorDb: Number(crestFactorDb.toFixed(2)),
		humFrequencyHz,
		humLevelDbfs: Number(humLevelDbfs.toFixed(2)),
		rumbleLevelDbfs: Number(rumbleLevelDbfs.toFixed(2)),
		sibilanceRatio,
		clippedSamples,
		silenceRatio: Number(silenceRatio.toFixed(3))
	};
}

// Radix-2 in-place Cooley-Tukey FFT for STFT spectral processing
function fftRadix2(real: Float32Array, imag: Float32Array, inverse: boolean): void {
	const n = real.length;
	let j = 0;
	for (let i = 0; i < n; i++) {
		if (i < j) {
			const tr = real[i];
			real[i] = real[j];
			real[j] = tr;
			const ti = imag[i];
			imag[i] = imag[j];
			imag[j] = ti;
		}
		let m = n >> 1;
		while (m >= 1 && j >= m) {
			j -= m;
			m >>= 1;
		}
		j += m;
	}

	const sign = inverse ? 1 : -1;
	for (let len = 2; len <= n; len <<= 1) {
		const half = len >> 1;
		const angle = (sign * 2 * Math.PI) / len;
		const wStepR = Math.cos(angle);
		const wStepI = Math.sin(angle);
		for (let i = 0; i < n; i += len) {
			let wR = 1;
			let wI = 0;
			for (let k = 0; k < half; k++) {
				const evenIdx = i + k;
				const oddIdx = i + k + half;
				const tR = wR * real[oddIdx] - wI * imag[oddIdx];
				const tI = wR * imag[oddIdx] + wI * real[oddIdx];
				real[oddIdx] = real[evenIdx] - tR;
				imag[oddIdx] = imag[evenIdx] - tI;
				real[evenIdx] += tR;
				imag[evenIdx] += tI;
				const nextWR = wR * wStepR - wI * wStepI;
				wI = wR * wStepI + wI * wStepR;
				wR = nextWR;
			}
		}
	}

	if (inverse) {
		for (let i = 0; i < n; i++) {
			real[i] /= n;
			imag[i] /= n;
		}
	}
}

function repairClippedPeaksInPlace(samples: Float32Array): void {
	const n = samples.length;
	const clipThreshold = 0.985;
	let i = 0;
	while (i < n) {
		if (Math.abs(samples[i]) >= clipThreshold) {
			const start = i;
			while (i < n && Math.abs(samples[i]) >= clipThreshold) i++;
			const end = i - 1;
			const runLen = end - start + 1;
			if (runLen >= 2 && runLen <= 48 && start >= 2 && end + 2 < n) {
				const y0 = samples[start - 1];
				const y1 = samples[end + 1];
				const m0 = samples[start - 1] - samples[start - 2];
				const m1 = samples[end + 2] - samples[end + 1];
				for (let k = 0; k < runLen; k++) {
					const t = (k + 1) / (runLen + 1);
					const arch = Math.sin(Math.PI * t) * 0.08 * Math.sign(samples[start]);
					samples[start + k] = (1 - t) * y0 + t * y1 + (m0 - m1) * 0.1 * t * (1 - t) + arch;
				}
			}
		} else {
			i++;
		}
	}
}

function suppressClicksInPlace(samples: Float32Array): void {
	const n = samples.length;
	if (n < 16) return;
	for (let i = 2; i < n - 2; i++) {
		const center = samples[i];
		const neighborMean = 0.25 * (samples[i - 2] + samples[i - 1] + samples[i + 1] + samples[i + 2]);
		const localSpread =
			0.25 *
			(Math.abs(samples[i - 1] - samples[i - 2]) +
				Math.abs(samples[i + 1] - samples[i - 1]) +
				Math.abs(samples[i + 2] - samples[i + 1])) +
			1e-4;
		if (Math.abs(center - neighborMean) > 6.5 * localSpread && Math.abs(center) > 0.12) {
			samples[i] = neighborMean;
		}
	}
}

/**
 * STFT spectral noise suppression + optional Bark-GRU local neural speech mask + optional late-echo reduction.
 */
function applySpectralDenoiseInPlace(
	samples: Float32Array,
	sampleRate: number,
	options: {
		strength: number; // 0..1
		useNeural: boolean;
		preserveSpeechFormants: boolean;
		echoReduction: boolean;
		shouldCancel?: () => boolean;
	}
): void {
	const n = samples.length;
	if (n < 512 || options.strength <= 0.01) return;

	const fftSize = 512;
	const hopSize = 256; // 50% overlap Hann window satisfies COLA
	const numBins = (fftSize >> 1) + 1;
	const totalFrames = Math.max(1, Math.floor((n - fftSize) / hopSize) + 1);

	const hann = new Float32Array(fftSize);
	for (let i = 0; i < fftSize; i++) {
		hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / fftSize));
	}

	// Map each FFT bin to its corresponding Bark band [0..23]
	const binToBark = new Uint8Array(numBins);
	for (let b = 0; b < numBins; b++) {
		const freq = (b * sampleRate) / fftSize;
		let bark = BARK_BANDS - 1;
		for (let k = 0; k < BARK_BANDS; k++) {
			if (freq <= BARK_UPPER_HZ[k]) {
				bark = k;
				break;
			}
		}
		binToBark[b] = bark;
	}

	// Pass 1: Estimate stationary noise power spectrum using quietest 20% of frames
	const frameEnergies = new Float32Array(totalFrames);
	const real = new Float32Array(fftSize);
	const imag = new Float32Array(fftSize);

	for (let f = 0; f < totalFrames; f++) {
		const start = f * hopSize;
		let e = 0;
		for (let i = 0; i < fftSize; i++) {
			const v = samples[start + i] ?? 0;
			e += v * v;
		}
		frameEnergies[f] = e / fftSize;
	}

	const sortedEnergies = Float32Array.from(frameEnergies).sort();
	const activeNonZero = sortedEnergies.filter((e) => e > 1e-9);
	const noiseThreshold =
		activeNonZero.length > 0
			? activeNonZero[Math.min(activeNonZero.length - 1, Math.floor(activeNonZero.length * 0.22))]
			: 1e-6;

	const noisePower = new Float32Array(numBins);
	let noiseFrameCount = 0;

	for (let f = 0; f < totalFrames; f++) {
		if (frameEnergies[f] <= noiseThreshold * 1.35 && frameEnergies[f] > 1e-10) {
			const start = f * hopSize;
			for (let i = 0; i < fftSize; i++) {
				real[i] = (samples[start + i] ?? 0) * hann[i];
				imag[i] = 0;
			}
			fftRadix2(real, imag, false);
			for (let b = 0; b < numBins; b++) {
				noisePower[b] += real[b] * real[b] + imag[b] * imag[b];
			}
			noiseFrameCount++;
		}
	}

	if (noiseFrameCount > 0) {
		for (let b = 0; b < numBins; b++) {
			noisePower[b] /= noiseFrameCount;
		}
	} else {
		for (let b = 0; b < numBins; b++) {
			noisePower[b] = 1e-6;
		}
	}

	// Pass 2: Ephraim-Malah decision-directed Wiener filter + optional Bark-GRU neural speech gain mask
	const outSamples = new Float32Array(n);
	const windowNorm = new Float32Array(n);
	const prevPostPower = new Float32Array(numBins);
	const prevGain = new Float32Array(numBins).fill(1);
	const reverbTailPower = new Float32Array(numBins);

	const neuralWeights = options.useNeural ? getLoadedNeuralWeights() : null;
	const gruHidden = new Float32Array(BARK_BANDS);
	const barkLogEnergy = new Float32Array(BARK_BANDS);
	const prevBarkLogEnergy = new Float32Array(BARK_BANDS);
	const barkFlux = new Float32Array(BARK_BANDS);
	const barkMask = new Float32Array(BARK_BANDS).fill(1);

	const overSubtraction = 1.0 + options.strength * (options.useNeural ? 2.4 : 1.85);
	const spectralFloor = Math.max(
		0.035,
		dbToLinear(-8 - options.strength * (options.useNeural ? 18 : 14))
	);

	for (let f = 0; f < totalFrames; f++) {
		if (f % 64 === 0 && options.shouldCancel?.()) return;

		const start = f * hopSize;
		for (let i = 0; i < fftSize; i++) {
			real[i] = (samples[start + i] ?? 0) * hann[i];
			imag[i] = 0;
		}
		fftRadix2(real, imag, false);

		// Compute Bark-band features if Neural Speech Engine is active
		if (neuralWeights) {
			const bandPower = new Float32Array(BARK_BANDS);
			const bandNoise = new Float32Array(BARK_BANDS);
			const bandCounts = new Uint16Array(BARK_BANDS);

			for (let b = 0; b < numBins; b++) {
				const bark = binToBark[b];
				const p = real[b] * real[b] + imag[b] * imag[b];
				bandPower[bark] += p;
				bandNoise[bark] += noisePower[b];
				bandCounts[bark]++;
			}

			for (let k = 0; k < BARK_BANDS; k++) {
				const snrDb =
					10 * Math.log10(Math.max(EPSILON, bandPower[k]) / Math.max(EPSILON, bandNoise[k]));
				const normE = Math.max(-1.5, Math.min(2.5, (snrDb - 3.0) / 10.0));
				barkLogEnergy[k] = normE;
				barkFlux[k] = Math.min(2.0, Math.abs(normE - prevBarkLogEnergy[k]) * 2.5);
				prevBarkLogEnergy[k] = normE;
			}

			stepBarkGruInference(neuralWeights, barkLogEnergy, barkFlux, gruHidden, barkMask);
		}

		for (let b = 0; b < numBins; b++) {
			const magSq = real[b] * real[b] + imag[b] * imag[b];
			const nPow = Math.max(EPSILON, noisePower[b] * overSubtraction);

			// Decision-directed a-priori SNR (alpha = 0.92 for smooth musical-noise-free decay)
			const postSnr = Math.max(0, magSq / nPow - 1);
			const priorSnr =
				0.92 * ((prevGain[b] * prevGain[b] * prevPostPower[b]) / nPow) + 0.08 * postSnr;
			let wienerGain = priorSnr / (1 + priorSnr);

			if (neuralWeights) {
				const bark = binToBark[b];
				const neuralGain = spectralFloor + (1 - spectralFloor) * barkMask[bark];
				wienerGain = wienerGain * (1 - 0.55 * options.strength) + neuralGain * (0.55 * options.strength);
			}

			if (options.echoReduction) {
				reverbTailPower[b] = 0.86 * reverbTailPower[b] + 0.14 * magSq;
				const directToReverb = magSq / Math.max(EPSILON, reverbTailPower[b] * 0.45);
				const dereverbGain = Math.min(1, Math.max(0.35, directToReverb / (1 + directToReverb)));
				wienerGain *= dereverbGain;
			}

			// Formant protection in 300 Hz - 3.4 kHz so voice character and accent stay natural
			const freq = (b * sampleRate) / fftSize;
			const formantFloor =
				options.preserveSpeechFormants && freq >= 250 && freq <= 3400
					? Math.max(spectralFloor, 0.14)
					: spectralFloor;

			const finalGain = Math.max(formantFloor, Math.min(1, wienerGain));
			prevGain[b] = finalGain;
			prevPostPower[b] = magSq;

			real[b] *= finalGain;
			imag[b] *= finalGain;
			if (b > 0 && b < numBins - 1) {
				const mirror = fftSize - b;
				real[mirror] *= finalGain;
				imag[mirror] *= finalGain;
			}
		}

		fftRadix2(real, imag, true);
		for (let i = 0; i < fftSize; i++) {
			const idx = start + i;
			if (idx < n) {
				const w = hann[i];
				outSamples[idx] += real[i] * w;
				windowNorm[idx] += w * w;
			}
		}
	}

	for (let i = 0; i < n; i++) {
		if (windowNorm[i] > 1e-4) {
			samples[i] = outSamples[i] / windowNorm[i];
		}
	}
}

/**
 * Split-band dynamic de-esser: attenuates only harsh high-frequency sibilance bursts (4.8–9.0 kHz)
 * without dulling normal voiced speech.
 */
function applyDynamicDeEsserInPlace(
	samples: Float32Array,
	sampleRate: number,
	strength: number // 0..1
): void {
	if (strength <= 0.02 || sampleRate < 12000) return;

	const sibilanceBand = applyBiquadCopy(samples, designBandPassBiquad(6400, 1.35, sampleRate));
	const attack = Math.exp(-1 / (sampleRate * 0.002));
	const release = Math.exp(-1 / (sampleRate * 0.035));
	const threshold = dbToLinear(-23 + (1 - strength) * 6);
	let env = 0;

	for (let i = 0; i < samples.length; i++) {
		const sib = sibilanceBand[i];
		const absSib = Math.abs(sib);
		env = absSib > env ? attack * env + (1 - attack) * absSib : release * env + (1 - release) * absSib;
		if (env > threshold) {
			const overRatio = threshold / Math.max(EPSILON, env);
			const reduction = Math.max(0.35, Math.pow(overRatio, 0.65 * strength));
			// Subtract part of the sibilant band
			samples[i] -= sib * (1 - reduction);
		}
	}
}

/**
 * Noise-gated soft-knee dynamic compressor and upward leveler.
 * Makes quiet speech easy to hear while preventing background noise pumping during pauses.
 */
function applyDynamicLevelerInPlace(
	samples: Float32Array,
	sampleRate: number,
	strength: number, // 0..1
	noiseGateDbfs: number,
	ratio: number
): void {
	if (strength <= 0.02) return;

	const attack = Math.exp(-1 / (sampleRate * 0.008));
	const release = Math.exp(-1 / (sampleRate * 0.14));
	const gateLinear = dbToLinear(Math.max(-58, noiseGateDbfs + 5.5));
	const compThresholdDb = -20;
	let env = 0;

	for (let i = 0; i < samples.length; i++) {
		const x = samples[i];
		const absX = Math.abs(x);
		env = absX > env ? attack * env + (1 - attack) * absX : release * env + (1 - release) * absX;

		let gainDb = 0;
		const envDb = linearToDb(env);

		if (envDb > compThresholdDb) {
			// Downward compression on loud peaks
			const overDb = envDb - compThresholdDb;
			gainDb = -overDb * (1 - 1 / ratio) * strength;
		} else if (env > gateLinear && envDb < compThresholdDb - 2) {
			// Gentle upward leveling for quiet phrases above the noise floor
			const underDb = Math.min(10, compThresholdDb - 2 - envDb);
			gainDb = underDb * 0.36 * strength;
		}

		samples[i] = x * dbToLinear(gainDb);
	}
}

/**
 * Lookahead brickwall peak limiter preventing any new clipping above ceilingDbfs (-1.0 dBFS).
 */
function applyPeakLimiterInPlace(
	channelData: Float32Array[],
	sampleRate: number,
	ceilingDbfs = -1.0
): void {
	const ceiling = dbToLinear(ceilingDbfs);
	const numSamples = channelData[0]?.length ?? 0;
	if (numSamples === 0) return;

	const lookahead = Math.max(8, Math.round(sampleRate * 0.003)); // 3 ms lookahead
	const release = Math.exp(-1 / (sampleRate * 0.06));
	let gain = 1.0;

	for (let i = 0; i < numSamples; i++) {
		let maxWindowPeak = 0;
		const end = Math.min(numSamples, i + lookahead);
		for (let c = 0; c < channelData.length; c++) {
			const ch = channelData[c];
			for (let k = i; k < end; k += 4) {
				const a = Math.abs(ch[k]);
				if (a > maxWindowPeak) maxWindowPeak = a;
			}
			const curr = Math.abs(ch[i]);
			if (curr > maxWindowPeak) maxWindowPeak = curr;
		}

		const targetGain = maxWindowPeak > ceiling ? ceiling / maxWindowPeak : 1.0;
		if (targetGain < gain) {
			gain = targetGain;
		} else {
			gain = release * gain + (1 - release) * targetGain;
		}

		for (let c = 0; c < channelData.length; c++) {
			const v = channelData[c][i] * gain;
			channelData[c][i] = Math.max(-ceiling, Math.min(ceiling, v));
		}
	}
}

/**
 * Extracts a representative 10-second preview segment from a recording so users can
 * audition enhancement settings quickly before rendering a long recording.
 */
export function extractRepresentativePreview(
	channelData: Float32Array[],
	sampleRate: number,
	maxPreviewSec = 10
): { previewChannels: Float32Array[]; startSec: number; endSec: number } {
	const numSamples = channelData[0]?.length ?? 0;
	const maxSamples = Math.round(maxPreviewSec * sampleRate);
	if (numSamples <= maxSamples || sampleRate <= 0) {
		return {
			previewChannels: channelData.map((ch) => new Float32Array(ch)),
			startSec: 0,
			endSec: sampleRate > 0 ? numSamples / sampleRate : 0
		};
	}

	// Pick the 10-second window with the richest speech/signal activity
	const ch0 = channelData[0];
	const step = Math.max(1, Math.round(sampleRate * 1.0));
	let bestStart = 0;
	let bestEnergy = -1;

	for (let start = 0; start + maxSamples <= numSamples; start += step) {
		let energy = 0;
		for (let i = start; i < start + maxSamples; i += 32) {
			energy += ch0[i] * ch0[i];
		}
		if (energy > bestEnergy) {
			bestEnergy = energy;
			bestStart = start;
		}
	}

	return {
		previewChannels: channelData.map((ch) => ch.slice(bestStart, bestStart + maxSamples)),
		startSec: Number((bestStart / sampleRate).toFixed(2)),
		endSec: Number(((bestStart + maxSamples) / sampleRate).toFixed(2))
	};
}

export interface EnhanceAudioOutput {
	enhancedChannels: Float32Array[];
	analysis: EnhancementAnalysisResult;
	matchedLoudnessGainDb: number;
	matchedLoudnessGainLinear: number;
}

/**
 * Runs the complete non-destructive automatic sound improvement pipeline on a copy of `channelData`.
 */
export function enhanceAudioBuffer(
	channelData: Float32Array[],
	sampleRate: number,
	settings: EnhancementSettings,
	options?: {
		onProgress?: (fraction: number) => void;
		shouldCancel?: () => boolean;
	}
): EnhanceAudioOutput {
	const before = analyzeAudioBuffer(channelData, sampleRate);

	// Always copy input so the original recording remains strictly immutable
	const processed = channelData.map((ch) => new Float32Array(ch));

	if (!settings.enabled || settings.amount <= 0 || (processed[0]?.length ?? 0) === 0) {
		options?.onProgress?.(1);
		return {
			enhancedChannels: processed,
			analysis: {
				before,
				after: before,
				summary: 'Original sound preserved (Enhancement is off).',
				changeNotes: ['Original audio untouched.']
			},
			matchedLoudnessGainDb: 0,
			matchedLoudnessGainLinear: 1
		};
	}

	const masterScale = Math.max(0, Math.min(1, settings.amount / 100));
	const nrStrength = Math.max(0, Math.min(1, (settings.noiseReduction / 100) * masterScale * 1.25));
	const clarityStrength = Math.max(
		0,
		Math.min(1, (settings.voiceClarity / 100) * masterScale * 1.25)
	);
	const harshnessStrength = Math.max(
		0,
		Math.min(1, (settings.harshness / 100) * masterScale * 1.25)
	);
	const consistencyStrength = Math.max(
		0,
		Math.min(1, (settings.volumeConsistency / 100) * masterScale * 1.25)
	);

	const changeNotes: string[] = [];
	options?.onProgress?.(0.1);

	for (let c = 0; c < processed.length; c++) {
		const ch = processed[c];

		// 1. Optional Clipping & Click repair
		if (settings.clipRepair && before.clippedSamples > 0) {
			repairClippedPeaksInPlace(ch);
		}
		if (settings.deClick) {
			suppressClicksInPlace(ch);
		}

		// 2. Low-frequency rumble high-pass filter tailored to mode
		const hpfCutoff =
			settings.mode === 'speech'
				? 65 + Math.round(25 * nrStrength) // 65–90 Hz for speech
				: settings.mode === 'ambience'
					? 42
					: 30; // 30 Hz sub-sonic only for music
		applyBiquadInPlace(ch, designHighPassBiquad(hpfCutoff, 0.707, sampleRate));

		// 3. Targeted electrical-hum removal when detected (or when humRemoval is active and hum exists)
		const humHz = before.humFrequencyHz;
		if (settings.humRemoval && humHz !== null) {
			for (let harmonic = 1; harmonic <= 4; harmonic++) {
				const f = humHz * harmonic;
				if (f < sampleRate * 0.45) {
					applyBiquadInPlace(ch, designNotchBiquad(f, 18 + harmonic * 4, sampleRate));
				}
			}
		}

		options?.onProgress?.(0.25 + (c / processed.length) * 0.35);

		// 4. Spectral fan / background noise reduction + optional Bark-GRU neural speech model
		if (settings.mode === 'speech') {
			applySpectralDenoiseInPlace(ch, sampleRate, {
				strength: nrStrength,
				useNeural: settings.engine === 'neural',
				preserveSpeechFormants: true,
				echoReduction: settings.echoReduction,
				shouldCancel: options?.shouldCancel
			});
		} else if (settings.mode === 'music') {
			// Music mode: very gentle noise-floor hush only, never strip instruments
			applySpectralDenoiseInPlace(ch, sampleRate, {
				strength: nrStrength * 0.28,
				useNeural: false,
				preserveSpeechFormants: false,
				echoReduction: settings.echoReduction,
				shouldCancel: options?.shouldCancel
			});
		} else {
			// Ambience mode: light stationary hiss reduction while preserving environmental texture
			applySpectralDenoiseInPlace(ch, sampleRate, {
				strength: nrStrength * 0.42,
				useNeural: false,
				preserveSpeechFormants: false,
				echoReduction: settings.echoReduction,
				shouldCancel: options?.shouldCancel
			});
		}

		// 5. Gentle tonal correction (Dynamic EQ)
		if (settings.mode === 'speech') {
			// Trim boxy/fan low-mid mud around 250 Hz and lift vocal intelligibility around 2.5 kHz
			applyBiquadInPlace(ch, designPeakingBiquad(250, 1.1, -2.6 * clarityStrength, sampleRate));
			applyBiquadInPlace(ch, designPeakingBiquad(2450, 0.95, 3.8 * clarityStrength, sampleRate));
			applyBiquadInPlace(ch, designHighShelfBiquad(6800, 0.8, 1.2 * clarityStrength, sampleRate));
		} else if (settings.mode === 'music') {
			applyBiquadInPlace(ch, designPeakingBiquad(110, 0.8, 1.4 * clarityStrength, sampleRate));
			applyBiquadInPlace(ch, designPeakingBiquad(3200, 0.85, 1.6 * clarityStrength, sampleRate));
		} else {
			applyBiquadInPlace(ch, designPeakingBiquad(320, 1.0, -1.2 * clarityStrength, sampleRate));
		}

		// 6. De-essing when needed
		if (harshnessStrength > 0.05 && (before.sibilanceRatio > 0.14 || settings.mode === 'speech')) {
			applyDynamicDeEsserInPlace(ch, sampleRate, harshnessStrength);
		}

		// 7. Dynamic compression to reduce distracting volume differences
		const compRatio = settings.mode === 'speech' ? 3.2 : settings.mode === 'music' ? 1.8 : 2.0;
		applyDynamicLevelerInPlace(
			ch,
			sampleRate,
			consistencyStrength,
			before.noiseFloorDbfs - 6,
			compRatio
		);
	}

	options?.onProgress?.(0.8);

	// 8. Loudness adjustment + Peak limiting (-1.0 dBFS ceiling)
	const preLimiterLufs = computeKWeightedLufs(processed, sampleRate);
	const targetLufs =
		settings.mode === 'speech' ? -16.0 : settings.mode === 'music' ? -14.0 : -18.0;
	const rawMakeupDb =
		preLimiterLufs > -60 ? (targetLufs - preLimiterLufs) * (0.4 + 0.6 * consistencyStrength) : 0;
	const makeupGainDb = Math.max(-10, Math.min(18, rawMakeupDb));
	const makeupLinear = dbToLinear(makeupGainDb);

	if (Math.abs(makeupGainDb) > 0.1) {
		for (const ch of processed) {
			for (let i = 0; i < ch.length; i++) {
				ch[i] *= makeupLinear;
			}
		}
	}

	applyPeakLimiterInPlace(processed, sampleRate, -1.0);

	const after = analyzeAudioBuffer(processed, sampleRate);

	// Build concrete, human-readable explanations of what changed
	const noiseDropDb = Number((before.noiseFloorDbfs - after.noiseFloorDbfs - makeupGainDb).toFixed(1));
	if (nrStrength > 0.05 && noiseDropDb > 1.0) {
		const engineLabel =
			settings.engine === 'neural' && settings.mode === 'speech'
				? 'local neural speech mask + spectral filter'
				: 'spectral noise suppression';
		changeNotes.push(
			`Reduced steady background noise floor by ${Math.max(1.5, noiseDropDb).toFixed(1)} dB (${engineLabel}).`
		);
	}

	const rumbleDropDb = Number((before.rumbleLevelDbfs - after.rumbleLevelDbfs - makeupGainDb).toFixed(1));
	if (rumbleDropDb > 1.5) {
		changeNotes.push(`Attenuated low-frequency fan/desk rumble by ${rumbleDropDb.toFixed(1)} dB.`);
	}

	if (settings.humRemoval && before.humFrequencyHz !== null) {
		changeNotes.push(
			`Removed ${before.humFrequencyHz} Hz electrical mains hum and harmonics.`
		);
	}

	if (clarityStrength > 0.05) {
		if (settings.mode === 'speech') {
			changeNotes.push(
				'Shaped vocal presence (+2.5 kHz clarity lift, -250 Hz mud cut) while preserving speaker timbre.'
			);
		} else if (settings.mode === 'music') {
			changeNotes.push('Applied gentle tonal balance while keeping natural musical dynamics.');
		} else {
			changeNotes.push('Balanced ambient midrange without narrowing environmental space.');
		}
	}

	if (harshnessStrength > 0.05 && after.sibilanceRatio < before.sibilanceRatio) {
		changeNotes.push('Smoothed harsh sibilance peaks with split-band de-essing.');
	}

	if (consistencyStrength > 0.05) {
		changeNotes.push(
			`Balanced volume dynamics and adjusted loudness from ${before.integratedLufs.toFixed(1)} to ${after.integratedLufs.toFixed(1)} LUFS (peak limited at ${after.peakDbfs.toFixed(1)} dBFS).`
		);
	}

	if (changeNotes.length === 0) {
		changeNotes.push('Applied gentle peak protection and tonal balance.');
	}

	// Matched-loudness gain to apply to the original when toggling "Hear original" in matched mode
	const matchedLoudnessGainDb = Math.max(
		-18,
		Math.min(18, Number((after.integratedLufs - before.integratedLufs).toFixed(2)))
	);

	options?.onProgress?.(1);

	return {
		enhancedChannels: processed,
		analysis: {
			before,
			after,
			summary: changeNotes.slice(0, 2).join(' '),
			changeNotes
		},
		matchedLoudnessGainDb,
		matchedLoudnessGainLinear: dbToLinear(matchedLoudnessGainDb)
	};
}
