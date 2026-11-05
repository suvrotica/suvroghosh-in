import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'static', 'audio', 'binaural-acoustic-soundboard');
const checkOnly = process.argv.includes('--check');

/**
 * Deterministic xorshift32 PRNG for reproducible acoustic micro-loop synthesis.
 */
function createRng(seed) {
	let state = seed >>> 0 || 1;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 4294967296;
	};
}

/**
 * Paul Kellet's 7-element pink noise filter (-3 dB/octave).
 */
function generatePinkNoise(length, rng) {
	const out = new Float32Array(length);
	let b0 = 0;
	let b1 = 0;
	let b2 = 0;
	let b3 = 0;
	let b4 = 0;
	let b5 = 0;
	let b6 = 0;
	for (let i = 0; i < length; i++) {
		const white = rng() * 2 - 1;
		b0 = 0.99886 * b0 + white * 0.0555179;
		b1 = 0.99332 * b1 + white * 0.0750759;
		b2 = 0.969 * b2 + white * 0.153852;
		b3 = 0.8665 * b3 + white * 0.3104856;
		b4 = 0.55 * b4 + white * 0.5329522;
		b5 = -0.7616 * b5 - white * 0.016898;
		out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
		b6 = white * 0.115926;
	}
	return out;
}

/**
 * Second-order biquad filter pass (lowpass, highpass, or bandpass).
 */
function biquadFilter(input, sampleRate, type, freq, q = 0.707) {
	const out = new Float32Array(input.length);
	const omega = (2 * Math.PI * freq) / sampleRate;
	const sin = Math.sin(omega);
	const cos = Math.cos(omega);
	const alpha = sin / (2 * q);

	let b0 = 0;
	let b1 = 0;
	let b2 = 0;
	const a0 = 1 + alpha;
	const a1 = -2 * cos;
	const a2 = 1 - alpha;

	if (type === 'lowpass') {
		b0 = (1 - cos) / 2;
		b1 = 1 - cos;
		b2 = (1 - cos) / 2;
	} else if (type === 'highpass') {
		b0 = (1 + cos) / 2;
		b1 = -(1 + cos);
		b2 = (1 + cos) / 2;
	} else if (type === 'bandpass') {
		b0 = alpha;
		b1 = 0;
		b2 = -alpha;
	}

	const nb0 = b0 / a0;
	const nb1 = b1 / a0;
	const nb2 = b2 / a0;
	const na1 = a1 / a0;
	const na2 = a2 / a0;

	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	// Warm up filter state over the last 2048 samples for periodic continuity
	const warmup = Math.min(2048, input.length);
	for (let i = input.length - warmup; i < input.length; i++) {
		const x = input[i];
		const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
	}
	for (let i = 0; i < input.length; i++) {
		const x = input[i];
		const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
		out[i] = y;
	}
	return out;
}

/**
 * Equal-power raised-cosine loop crossfade: blends the final `fadeSamples` into
 * the beginning of the buffer and returns a shorter, seamlessly wrapping buffer.
 */
function crossfadeLoopStereo(leftRaw, rightRaw, fadeSamples) {
	const outLength = leftRaw.length - fadeSamples;
	const left = new Float32Array(outLength);
	const right = new Float32Array(outLength);

	for (let i = 0; i < outLength; i++) {
		if (i < fadeSamples) {
			const phase = (i / fadeSamples) * (Math.PI * 0.5);
			const headGain = Math.sin(phase);
			const tailGain = Math.cos(phase);
			left[i] = leftRaw[i] * headGain + leftRaw[outLength + i] * tailGain;
			right[i] = rightRaw[i] * headGain + rightRaw[outLength + i] * tailGain;
		} else {
			left[i] = leftRaw[i];
			right[i] = rightRaw[i];
		}
	}
	return { left, right };
}

/**
 * Remove DC offset and normalize stereo buffer to targetPeak.
 */
function normalizeStereo(left, right, targetPeak = 0.72) {
	let meanL = 0;
	let meanR = 0;
	for (let i = 0; i < left.length; i++) {
		meanL += left[i];
		meanR += right[i];
	}
	meanL /= left.length;
	meanR /= right.length;

	let peak = 1e-6;
	for (let i = 0; i < left.length; i++) {
		left[i] -= meanL;
		right[i] -= meanR;
		const absL = Math.abs(left[i]);
		const absR = Math.abs(right[i]);
		if (absL > peak) peak = absL;
		if (absR > peak) peak = absR;
	}
	const scale = targetPeak / peak;
	for (let i = 0; i < left.length; i++) {
		left[i] *= scale;
		right[i] *= scale;
	}
}

/**
 * Synthesize steady window rain: diffuse outdoor rain bed + soft glass resonance +
 * gentle micro-droplet patter against a windowpane, without thunder or harshness.
 */
function synthesizeRainWindow(sampleRate = 16000) {
	const durationSec = 7.5;
	const fadeSec = 1.25;
	const totalSamples = Math.round((durationSec + fadeSec) * sampleRate);
	const fadeSamples = Math.round(fadeSec * sampleRate);
	const rng = createRng(0x5241494e);

	const pinkL = generatePinkNoise(totalSamples, rng);
	const pinkR = generatePinkNoise(totalSamples, rng);

	// Outdoor steady sheet rain filtered through window glass
	const bedL = biquadFilter(
		biquadFilter(pinkL, sampleRate, 'highpass', 190, 0.65),
		sampleRate,
		'lowpass',
		3600,
		0.7
	);
	const bedR = biquadFilter(
		biquadFilter(pinkR, sampleRate, 'highpass', 190, 0.65),
		sampleRate,
		'lowpass',
		3600,
		0.7
	);

	// Warm wooden sill / glass pane body resonance around 520 Hz and 1180 Hz
	const bodyL = biquadFilter(pinkL, sampleRate, 'bandpass', 520, 1.4);
	const bodyR = biquadFilter(pinkR, sampleRate, 'bandpass', 540, 1.4);
	const shimmerL = biquadFilter(pinkL, sampleRate, 'bandpass', 1350, 1.1);
	const shimmerR = biquadFilter(pinkR, sampleRate, 'bandpass', 1310, 1.1);

	const rawL = new Float32Array(totalSamples);
	const rawR = new Float32Array(totalSamples);
	const outLength = totalSamples - fadeSamples;

	for (let i = 0; i < totalSamples; i++) {
		// Gentle periodic breeze density modulation locked to the output loop period
		const loopPhase = (2 * Math.PI * (i % outLength)) / outLength;
		const breezeL = 1 + 0.055 * Math.sin(loopPhase) + 0.03 * Math.cos(2 * loopPhase + 0.7);
		const breezeR = 1 + 0.055 * Math.sin(loopPhase + 0.6) + 0.03 * Math.cos(2 * loopPhase + 1.4);
		rawL[i] = (bedL[i] * 0.58 + bodyL[i] * 0.34 + shimmerL[i] * 0.22) * breezeL;
		rawR[i] = (bedR[i] * 0.58 + bodyR[i] * 0.34 + shimmerR[i] * 0.22) * breezeR;
	}

	// Add dense, soft microscopic droplet impacts on glass (no sharp clicks)
	const dropletCount = 1900;
	for (let d = 0; d < dropletCount; d++) {
		const start = Math.floor(rng() * (totalSamples - 160));
		const pan = 0.18 + rng() * 0.64;
		const freq = 780 + rng() * 1650;
		const decayMs = 2.2 + rng() * 4.2;
		const decaySamples = Math.max(24, Math.floor((decayMs / 1000) * sampleRate));
		const amp = (0.008 + rng() * 0.015) * (1 - (freq - 780) / 3600);
		const gainL = Math.cos(pan * Math.PI * 0.5) * amp;
		const gainR = Math.sin(pan * Math.PI * 0.5) * amp;

		for (let k = 0; k < decaySamples && start + k < totalSamples; k++) {
			const env = Math.sin((Math.PI * k) / Math.min(decaySamples, 14)) * Math.exp((-3.8 * k) / decaySamples);
			const sample = Math.sin((2 * Math.PI * freq * k) / sampleRate) * env;
			rawL[start + k] += sample * gainL;
			rawR[start + k] += sample * gainR;
		}
	}

	// Final softening lowpass so droplets blend naturally into the window acoustic field
	const softL = biquadFilter(rawL, sampleRate, 'lowpass', 3900, 0.707);
	const softR = biquadFilter(rawR, sampleRate, 'lowpass', 3900, 0.707);
	const { left, right } = crossfadeLoopStereo(softL, softR, fadeSamples);
	normalizeStereo(left, right, 0.68);
	return { left, right, sampleRate };
}

/**
 * Synthesize subdued distant city ambience: warm horizon rumble and diffuse nocturnal
 * urban air wash heard from afar, with zero intelligible speech or sudden horns.
 */
function synthesizeDistantCity(sampleRate = 16000) {
	const durationSec = 8.0;
	const fadeSec = 1.4;
	const totalSamples = Math.round((durationSec + fadeSec) * sampleRate);
	const fadeSamples = Math.round(fadeSec * sampleRate);
	const rng = createRng(0x43495459);

	const pinkL = generatePinkNoise(totalSamples, rng);
	const pinkR = generatePinkNoise(totalSamples, rng);

	// Deep urban horizon rumble (70-185 Hz)
	const rumbleL = biquadFilter(
		biquadFilter(pinkL, sampleRate, 'highpass', 58, 0.7),
		sampleRate,
		'lowpass',
		175,
		0.85
	);
	const rumbleR = biquadFilter(
		biquadFilter(pinkR, sampleRate, 'highpass', 58, 0.7),
		sampleRate,
		'lowpass',
		175,
		0.85
	);

	// Distant street canyon resonance (220-520 Hz)
	const canyonL = biquadFilter(pinkL, sampleRate, 'bandpass', 310, 1.3);
	const canyonR = biquadFilter(pinkR, sampleRate, 'bandpass', 335, 1.3);

	// High atmospheric air wash (580-1250 Hz, attenuated by distance)
	const airL = biquadFilter(pinkL, sampleRate, 'bandpass', 760, 1.5);
	const airR = biquadFilter(pinkR, sampleRate, 'bandpass', 720, 1.5);

	const rawL = new Float32Array(totalSamples);
	const rawR = new Float32Array(totalSamples);
	const outLength = totalSamples - fadeSamples;

	for (let i = 0; i < totalSamples; i++) {
		const t = i / sampleRate;
		const loopPhase = (2 * Math.PI * (i % outLength)) / outLength;
		// Slow, unhurried distant traffic ebb and flow locked to the loop period
		const swellL = 1 + 0.08 * Math.sin(loopPhase + 0.2) + 0.04 * Math.sin(2 * loopPhase + 1.1);
		const swellR = 1 + 0.08 * Math.sin(loopPhase + 1.5) + 0.04 * Math.sin(2 * loopPhase + 2.3);
		// Faint distant transformer / avenue hum harmonics
		const hum =
			0.008 * Math.sin(2 * Math.PI * 100 * t) + 0.004 * Math.sin(2 * Math.PI * 150 * t + 0.4);

		rawL[i] = (rumbleL[i] * 0.62 + canyonL[i] * 0.36 + airL[i] * 0.16) * swellL + hum;
		rawR[i] = (rumbleR[i] * 0.62 + canyonR[i] * 0.36 + airR[i] * 0.16) * swellR + hum;
	}

	const filteredL = biquadFilter(rawL, sampleRate, 'lowpass', 1450, 0.707);
	const filteredR = biquadFilter(rawR, sampleRate, 'lowpass', 1450, 0.707);
	const { left, right } = crossfadeLoopStereo(filteredL, filteredR, fadeSamples);
	normalizeStereo(left, right, 0.64);
	return { left, right, sampleRate };
}

/**
 * Encode stereo Float32Arrays into a standard 16-bit PCM RIFF WAVE Buffer.
 */
function encodeWav16Stereo(left, right, sampleRate) {
	const numSamples = left.length;
	const numChannels = 2;
	const bytesPerSample = 2;
	const dataSize = numSamples * numChannels * bytesPerSample;
	const buffer = Buffer.alloc(44 + dataSize);

	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write('WAVE', 8);
	buffer.write('fmt ', 12);
	buffer.writeUInt32LE(16, 16); // PCM chunk size
	buffer.writeUInt16LE(1, 20); // PCM format
	buffer.writeUInt16LE(numChannels, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
	buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
	buffer.writeUInt16LE(bytesPerSample * 8, 34);
	buffer.write('data', 36);
	buffer.writeUInt32LE(dataSize, 40);

	let offset = 44;
	for (let i = 0; i < numSamples; i++) {
		const sL = Math.max(-1, Math.min(1, left[i]));
		const sR = Math.max(-1, Math.min(1, right[i]));
		buffer.writeInt16LE(Math.round(sL * 32767), offset);
		buffer.writeInt16LE(Math.round(sR * 32767), offset + 2);
		offset += 4;
	}
	return buffer;
}

const specs = [
	{
		filename: 'rain-window.wav',
		synthesize: synthesizeRainWindow
	},
	{
		filename: 'distant-city.wav',
		synthesize: synthesizeDistantCity
	}
];

fs.mkdirSync(outDir, { recursive: true });

for (const spec of specs) {
	const { left, right, sampleRate } = spec.synthesize();
	const wavBytes = encodeWav16Stereo(left, right, sampleRate);
	const hash = crypto.createHash('sha256').update(wavBytes).digest('hex');
	const targetPath = path.join(outDir, spec.filename);

	if (checkOnly) {
		if (!fs.existsSync(targetPath)) {
			throw new Error(`Missing audio asset: ${targetPath}`);
		}
		const existingHash = crypto
			.createHash('sha256')
			.update(fs.readFileSync(targetPath))
			.digest('hex');
		if (existingHash !== hash) {
			throw new Error(
				`Audio asset mismatch for ${spec.filename}: expected ${hash}, got ${existingHash}`
			);
		}
		console.log(`Verified ${spec.filename} (${wavBytes.byteLength} bytes, sha256=${hash.slice(0, 12)})`);
	} else {
		fs.writeFileSync(targetPath, wavBytes);
		console.log(`Generated ${spec.filename} (${wavBytes.byteLength} bytes, sha256=${hash})`);
	}
}
