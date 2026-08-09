import type { NoiseColour } from './contracts';

export function hashString32(value: string | number): number {
	const text = String(value);
	let hash = 2_166_136_261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return hash >>> 0;
}

export class AudioSeededRandom {
	private state: number;

	constructor(readonly seed: string | number) {
		this.state = hashString32(seed) || 0x6d2b79f5;
	}

	next(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	}

	signed(): number {
		return this.next() * 2 - 1;
	}

	fork(label: string | number): AudioSeededRandom {
		return new AudioSeededRandom(`${this.seed}|${label}`);
	}
}

/** Deterministic excitation with conservative headroom for a resonant filter bank. */
export function fillSeededNoise<TBuffer extends ArrayBufferLike>(
	target: Float32Array<TBuffer>,
	colour: NoiseColour,
	seed: string | number
): Float32Array<TBuffer> {
	const random = new AudioSeededRandom(seed);
	let pink0 = 0;
	let pink1 = 0;
	let pink2 = 0;
	let brown = 0;
	let previousWhite = 0;
	let peak = 0;

	for (let index = 0; index < target.length; index += 1) {
		const white = random.signed();
		let sample = white;
		if (colour === 'pink') {
			pink0 = 0.99765 * pink0 + white * 0.099046;
			pink1 = 0.963 * pink1 + white * 0.2965164;
			pink2 = 0.57 * pink2 + white * 1.0526913;
			sample = pink0 + pink1 + pink2 + white * 0.1848;
		} else if (colour === 'brown') {
			brown = (brown + white * 0.018) / 1.018;
			sample = brown * 3.2;
		} else if (colour === 'violet') {
			sample = (white - previousWhite) * 0.72;
			previousWhite = white;
		}
		target[index] = sample;
		peak = Math.max(peak, Math.abs(sample));
	}

	const gain = peak > 0 ? 0.72 / peak : 0;
	for (let index = 0; index < target.length; index += 1) target[index] *= gain;
	return target;
}

export function seededNoiseSamples(
	length: number,
	colour: NoiseColour,
	seed: string | number
): Float32Array<ArrayBuffer> {
	return fillSeededNoise(new Float32Array(Math.max(1, Math.floor(length))), colour, seed);
}
