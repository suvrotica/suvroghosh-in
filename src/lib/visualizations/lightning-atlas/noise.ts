import { hashString } from './prng';

const smooth = (value: number) => value * value * (3 - 2 * value);
const interpolate = (a: number, b: number, amount: number) => a + (b - a) * amount;

function lattice(seed: number, x: number, y: number): number {
	let value = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
	value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
	value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
	return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295;
}

export class Noise2D {
	private readonly seed: number;

	constructor(seed: string) {
		this.seed = hashString(seed);
	}

	value(x: number, y: number): number {
		const x0 = Math.floor(x);
		const y0 = Math.floor(y);
		const tx = smooth(x - x0);
		const ty = smooth(y - y0);
		const a = interpolate(lattice(this.seed, x0, y0), lattice(this.seed, x0 + 1, y0), tx);
		const b = interpolate(lattice(this.seed, x0, y0 + 1), lattice(this.seed, x0 + 1, y0 + 1), tx);
		return interpolate(a, b, ty) * 2 - 1;
	}

	fbm(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
		let frequency = 1;
		let amplitude = 1;
		let total = 0;
		let normalizer = 0;
		for (let octave = 0; octave < octaves; octave += 1) {
			total += this.value(x * frequency, y * frequency) * amplitude;
			normalizer += amplitude;
			frequency *= lacunarity;
			amplitude *= gain;
		}
		return normalizer === 0 ? 0 : total / normalizer;
	}

	ridged(x: number, y: number, octaves = 5): number {
		let frequency = 1;
		let amplitude = 0.55;
		let total = 0;
		let normalizer = 0;
		for (let octave = 0; octave < octaves; octave += 1) {
			const ridge = 1 - Math.abs(this.value(x * frequency, y * frequency));
			total += ridge * ridge * amplitude;
			normalizer += amplitude;
			frequency *= 2.05;
			amplitude *= 0.54;
		}
		return normalizer === 0 ? 0 : total / normalizer;
	}

	warped(x: number, y: number, amount = 0.45): number {
		const dx = this.fbm(x + 17.2, y - 9.1, 3);
		const dy = this.fbm(x - 5.7, y + 23.4, 3);
		return this.fbm(x + dx * amount, y + dy * amount, 5);
	}
}
