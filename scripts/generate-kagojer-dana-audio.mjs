import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'static', 'games', 'kagojer-dana', 'audio', 'calcutta-bed.wav');
const SAMPLE_RATE = 32_000;
const DURATION_SECONDS = 24;
const CHANNELS = 2;
const FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS;

let rngState = 0x4b44414e;
function randomSigned() {
	rngState ^= rngState << 13;
	rngState ^= rngState >>> 17;
	rngState ^= rngState << 5;
	return ((rngState >>> 0) / 0xffff_ffff) * 2 - 1;
}

function smoothWindow(time, start, duration) {
	if (time <= start || time >= start + duration) return 0;
	const phase = (time - start) / duration;
	return Math.sin(Math.PI * phase) ** 2;
}

function synthesize() {
	const left = new Float32Array(FRAME_COUNT);
	const right = new Float32Array(FRAME_COUNT);
	let rumble = 0;
	let hissSlow = 0;
	let hissFast = 0;
	let air = 0;

	for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
		const time = frame / SAMPLE_RATE;
		const noise = randomSigned();
		rumble += (noise - rumble) * 0.0022;
		hissSlow += (noise - hissSlow) * 0.012;
		hissFast += (noise - hissFast) * 0.11;
		air += (noise - air) * 0.00055;

		const dawnPulse = 0.72 + 0.16 * Math.sin((time / DURATION_SECONDS) * Math.PI * 2);
		const tyres = (hissFast - hissSlow) * (0.042 + 0.025 * Math.sin(time * 0.31) ** 2);
		const city = rumble * 0.34 + air * 0.2 + tyres;
		const river = Math.sin(time * 1.7 + Math.sin(time * 0.13) * 0.7) * 0.008;

		let eventsLeft = 0;
		let eventsRight = 0;
		for (const [start, pan] of [
			[4.1, -0.62],
			[12.3, 0.48],
			[20.1, -0.18]
		]) {
			const envelope = smoothWindow(time, start, 0.78);
			if (!envelope) continue;
			const local = time - start;
			const horn =
				(Math.sin(local * Math.PI * 2 * 278) + 0.42 * Math.sin(local * Math.PI * 2 * 417)) *
				envelope *
				0.018;
			eventsLeft += horn * Math.sqrt((1 - pan) * 0.5);
			eventsRight += horn * Math.sqrt((1 + pan) * 0.5);
		}

		const ferryEnvelope = smoothWindow(time, 16.25, 2.45);
		const ferryLocal = time - 16.25;
		const ferry =
			ferryEnvelope *
			(0.016 * Math.sin(ferryLocal * Math.PI * 2 * 92) +
				0.009 * Math.sin(ferryLocal * Math.PI * 2 * 138));

		const bellEnvelope = smoothWindow(time, 8.3, 0.72);
		const bellLocal = time - 8.3;
		const bell =
			bellEnvelope *
			Math.exp(-Math.max(0, bellLocal) * 3.2) *
			(0.018 * Math.sin(bellLocal * Math.PI * 2 * 820) +
				0.009 * Math.sin(bellLocal * Math.PI * 2 * 1_275));

		const baseLeft = city * dawnPulse + river + ferry * 0.72 + bell * 0.55 + eventsLeft;
		const baseRight = city * (1.02 - dawnPulse * 0.03) - river + ferry + bell + eventsRight;
		left[frame] = Math.tanh(baseLeft * 1.8) * 0.72;
		right[frame] = Math.tanh(baseRight * 1.8) * 0.72;
	}

	const crossfadeFrames = Math.floor(SAMPLE_RATE * 1.5);
	for (let index = 0; index < crossfadeFrames; index += 1) {
		const amount = index / Math.max(1, crossfadeFrames - 1);
		const tail = FRAME_COUNT - crossfadeFrames + index;
		left[tail] = left[tail] * (1 - amount) + left[index] * amount;
		right[tail] = right[tail] * (1 - amount) + right[index] * amount;
	}
	return { left, right };
}

function encodeWav({ left, right }) {
	const bytesPerSample = 2;
	const dataBytes = FRAME_COUNT * CHANNELS * bytesPerSample;
	const buffer = Buffer.allocUnsafe(44 + dataBytes);
	buffer.write('RIFF', 0, 'ascii');
	buffer.writeUInt32LE(36 + dataBytes, 4);
	buffer.write('WAVE', 8, 'ascii');
	buffer.write('fmt ', 12, 'ascii');
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(CHANNELS, 22);
	buffer.writeUInt32LE(SAMPLE_RATE, 24);
	buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
	buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32);
	buffer.writeUInt16LE(bytesPerSample * 8, 34);
	buffer.write('data', 36, 'ascii');
	buffer.writeUInt32LE(dataBytes, 40);

	let offset = 44;
	for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
		for (const value of [left[frame], right[frame]]) {
			const sample = Math.max(-1, Math.min(1, value));
			buffer.writeInt16LE(Math.round(sample * 32_767), offset);
			offset += 2;
		}
	}
	return buffer;
}

async function main() {
	const wav = encodeWav(synthesize());
	await mkdir(path.dirname(OUTPUT), { recursive: true });
	await writeFile(OUTPUT, wav);
	const digest = createHash('sha256')
		.update(await readFile(OUTPUT))
		.digest('hex');
	console.log(
		`Rendered ${path.relative(ROOT, OUTPUT)} (${DURATION_SECONDS}s, ${(wav.length / 1_048_576).toFixed(2)} MiB, sha256 ${digest}).`
	);
}

await main();
