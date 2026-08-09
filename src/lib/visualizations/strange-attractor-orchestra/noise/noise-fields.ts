import { createSeededRandom } from '../seeded-random';
import type { NoiseFamily, Vector3 } from '../types';

const CELLULAR_SALT_X = 0x9e3779b9;
const CELLULAR_SALT_Y = 0x85ebca6b;
const CELLULAR_SALT_Z = 0xc2b2ae35;

export interface NoiseSample {
	readonly value01: number;
	readonly gradient01: number;
	readonly curlAngle01: number;
	readonly cellBoundary01: number;
	readonly displacement: Vector3;
}

export interface NoiseField {
	readonly family: NoiseFamily;
	sample(x: number, y: number, z: number, phase: number): NoiseSample;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function fade(value: number): number {
	return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(left: number, right: number, amount: number): number {
	return left + amount * (right - left);
}

function gradient(hash: number, x: number, y: number, z: number): number {
	const h = hash & 15;
	const u = h < 8 ? x : y;
	const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
	return (h & 1 ? -u : u) + (h & 2 ? -v : v);
}

class GradientNoise3D {
	private readonly permutation = new Uint8Array(512);

	constructor(seed: number) {
		const random = createSeededRandom(seed);
		const base = new Uint8Array(256);
		for (let index = 0; index < base.length; index += 1) base[index] = index;
		for (let index = base.length - 1; index > 0; index -= 1) {
			const other = Math.floor(random.next() * (index + 1));
			const value = base[index];
			base[index] = base[other];
			base[other] = value;
		}
		for (let index = 0; index < this.permutation.length; index += 1) {
			this.permutation[index] = base[index & 255];
		}
	}

	noise(x: number, y: number, z: number): number {
		const latticeX = Math.floor(x) & 255;
		const latticeY = Math.floor(y) & 255;
		const latticeZ = Math.floor(z) & 255;
		const localX = x - Math.floor(x);
		const localY = y - Math.floor(y);
		const localZ = z - Math.floor(z);
		const u = fade(localX);
		const v = fade(localY);
		const w = fade(localZ);
		const a = this.permutation[latticeX] + latticeY;
		const aa = this.permutation[a] + latticeZ;
		const ab = this.permutation[a + 1] + latticeZ;
		const b = this.permutation[latticeX + 1] + latticeY;
		const ba = this.permutation[b] + latticeZ;
		const bb = this.permutation[b + 1] + latticeZ;
		return lerp(
			lerp(
				lerp(
					gradient(this.permutation[aa], localX, localY, localZ),
					gradient(this.permutation[ba], localX - 1, localY, localZ),
					u
				),
				lerp(
					gradient(this.permutation[ab], localX, localY - 1, localZ),
					gradient(this.permutation[bb], localX - 1, localY - 1, localZ),
					u
				),
				v
			),
			lerp(
				lerp(
					gradient(this.permutation[aa + 1], localX, localY, localZ - 1),
					gradient(this.permutation[ba + 1], localX - 1, localY, localZ - 1),
					u
				),
				lerp(
					gradient(this.permutation[ab + 1], localX, localY - 1, localZ - 1),
					gradient(this.permutation[bb + 1], localX - 1, localY - 1, localZ - 1),
					u
				),
				v
			),
			w
		);
	}

	fbm(x: number, y: number, z: number, octaves = 4): number {
		let amplitude = 0.5;
		let frequency = 1;
		let total = 0;
		let weight = 0;
		for (let octave = 0; octave < octaves; octave += 1) {
			total += amplitude * this.noise(x * frequency, y * frequency, z * frequency);
			weight += amplitude;
			frequency *= 2;
			amplitude *= 0.5;
		}
		return total / weight;
	}
}

function normalizedVector(x: number, y: number, z: number, magnitude = 1): Vector3 {
	const length = Math.hypot(x, y, z);
	if (!(length > 1e-12)) return [0, 0, 0];
	const scale = magnitude / length;
	return [x * scale, y * scale, z * scale];
}

function scalarGradient(
	field: (x: number, y: number, z: number) => number,
	x: number,
	y: number,
	z: number,
	epsilon = 0.0125
): Vector3 {
	const denominator = 2 * epsilon;
	return [
		(field(x + epsilon, y, z) - field(x - epsilon, y, z)) / denominator,
		(field(x, y + epsilon, z) - field(x, y - epsilon, z)) / denominator,
		(field(x, y, z + epsilon) - field(x, y, z - epsilon)) / denominator
	];
}

class SmoothNoiseField implements NoiseField {
	readonly family = 'smooth' as const;
	private readonly noise: GradientNoise3D;
	constructor(seed: number) {
		this.noise = new GradientNoise3D(seed);
	}

	sample(x: number, y: number, z: number, phase: number): NoiseSample {
		const scalar = (a: number, b: number, c: number): number =>
			this.noise.fbm(a + phase * 0.37, b - phase * 0.19, c + phase * 0.11);
		const value = scalar(x, y, z);
		const [gx, gy, gz] = scalarGradient(scalar, x, y, z);
		const magnitude = Math.hypot(gx, gy, gz);
		return {
			value01: clamp01(0.5 + value * 0.62),
			gradient01: clamp01(Math.tanh(magnitude * 0.65)),
			curlAngle01: clamp01(Math.atan2(gy, gx) / (2 * Math.PI) + 0.5),
			cellBoundary01: 0,
			displacement: normalizedVector(gx, gy, gz, Math.tanh(magnitude * 0.55))
		};
	}
}

class CurlNoiseField implements NoiseField {
	readonly family = 'curl' as const;
	private readonly potentialX: GradientNoise3D;
	private readonly potentialY: GradientNoise3D;
	private readonly potentialZ: GradientNoise3D;
	constructor(seed: number) {
		this.potentialX = new GradientNoise3D(seed ^ 0xa341316c);
		this.potentialY = new GradientNoise3D(seed ^ 0xc8013ea4);
		this.potentialZ = new GradientNoise3D(seed ^ 0xad90777d);
	}

	sample(x: number, y: number, z: number, phase: number): NoiseSample {
		const ax = (a: number, b: number, c: number): number =>
			this.potentialX.fbm(a + phase * 0.11, b, c, 3);
		const ay = (a: number, b: number, c: number): number =>
			this.potentialY.fbm(a, b + phase * 0.13, c, 3);
		const az = (a: number, b: number, c: number): number =>
			this.potentialZ.fbm(a, b, c + phase * 0.17, 3);
		const dax = scalarGradient(ax, x, y, z);
		const day = scalarGradient(ay, x, y, z);
		const daz = scalarGradient(az, x, y, z);
		const curlX = daz[1] - day[2];
		const curlY = dax[2] - daz[0];
		const curlZ = day[0] - dax[1];
		const magnitude = Math.hypot(curlX, curlY, curlZ);
		const boundedMagnitude = Math.tanh(magnitude * 0.7);
		const value = this.potentialX.fbm(x + phase * 0.11, y, z, 3);
		return {
			value01: clamp01(0.5 + value * 0.62),
			gradient01: clamp01(boundedMagnitude),
			curlAngle01: clamp01(Math.atan2(curlY, curlX) / (2 * Math.PI) + 0.5),
			cellBoundary01: 0,
			displacement: normalizedVector(curlX, curlY, curlZ, boundedMagnitude)
		};
	}
}

function hashLattice(seed: number, x: number, y: number, z: number, salt: number): number {
	let value = seed ^ salt;
	value = Math.imul(value ^ Math.imul(x, CELLULAR_SALT_X), 0x27d4eb2d);
	value = Math.imul(value ^ Math.imul(y, CELLULAR_SALT_Y), 0x165667b1);
	value = Math.imul(value ^ Math.imul(z, CELLULAR_SALT_Z), 0x85ebca6b);
	value ^= value >>> 15;
	value = Math.imul(value, 0x2c1b3c6d);
	value ^= value >>> 12;
	return value >>> 0;
}

function latticeUnit(seed: number, x: number, y: number, z: number, salt: number): number {
	return hashLattice(seed, x, y, z, salt) / 0x1_0000_0000;
}

class CellularNoiseField implements NoiseField {
	readonly family = 'cellular' as const;
	constructor(private readonly seed: number) {}

	sample(x: number, y: number, z: number, phase: number): NoiseSample {
		const shiftedX = x + phase * 0.035;
		const shiftedY = y - phase * 0.021;
		const shiftedZ = z + phase * 0.013;
		const baseX = Math.floor(shiftedX);
		const baseY = Math.floor(shiftedY);
		const baseZ = Math.floor(shiftedZ);
		let nearest = Number.POSITIVE_INFINITY;
		let second = Number.POSITIVE_INFINITY;
		let nearestDx = 0;
		let nearestDy = 0;
		let nearestDz = 0;
		for (let dz = -1; dz <= 1; dz += 1) {
			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					const cellX = baseX + dx;
					const cellY = baseY + dy;
					const cellZ = baseZ + dz;
					const featureX = cellX + latticeUnit(this.seed, cellX, cellY, cellZ, 0x68bc21eb);
					const featureY = cellY + latticeUnit(this.seed, cellX, cellY, cellZ, 0x02e5be93);
					const featureZ = cellZ + latticeUnit(this.seed, cellX, cellY, cellZ, 0x967a889b);
					const offsetX = featureX - shiftedX;
					const offsetY = featureY - shiftedY;
					const offsetZ = featureZ - shiftedZ;
					const distance = Math.hypot(offsetX, offsetY, offsetZ);
					if (distance < nearest) {
						second = nearest;
						nearest = distance;
						nearestDx = offsetX;
						nearestDy = offsetY;
						nearestDz = offsetZ;
					} else if (distance < second) {
						second = distance;
					}
				}
			}
		}
		const boundaryDistance = Math.max(0, second - nearest);
		const boundary = Math.exp(-boundaryDistance * 8);
		return {
			value01: clamp01(Math.exp(-nearest * 1.25)),
			gradient01: clamp01(1 - Math.exp(-nearest * 2)),
			curlAngle01: clamp01(Math.atan2(nearestDy, nearestDx) / (2 * Math.PI) + 0.5),
			cellBoundary01: clamp01(boundary),
			displacement: normalizedVector(nearestDx, nearestDy, nearestDz, Math.min(1, nearest))
		};
	}
}

class RidgedNoiseField implements NoiseField {
	readonly family = 'ridged' as const;
	private readonly noise: GradientNoise3D;
	constructor(seed: number) {
		this.noise = new GradientNoise3D(seed);
	}

	private ridge(x: number, y: number, z: number, phase: number): number {
		let amplitude = 0.58;
		let frequency = 1;
		let total = 0;
		let weight = 0;
		let previous = 1;
		for (let octave = 0; octave < 4; octave += 1) {
			const sample = this.noise.noise(
				x * frequency + phase * 0.09,
				y * frequency - phase * 0.05,
				z * frequency + phase * 0.03
			);
			const ridge = (1 - Math.abs(sample)) ** 2;
			total += ridge * amplitude * previous;
			weight += amplitude;
			previous = clamp01(ridge * 1.7);
			amplitude *= 0.5;
			frequency *= 2;
		}
		return clamp01(total / weight);
	}

	sample(x: number, y: number, z: number, phase: number): NoiseSample {
		const scalar = (a: number, b: number, c: number): number => this.ridge(a, b, c, phase);
		const value = scalar(x, y, z);
		const [gx, gy, gz] = scalarGradient(scalar, x, y, z, 0.009);
		const magnitude = Math.hypot(gx, gy, gz);
		return {
			value01: value,
			gradient01: clamp01(Math.tanh(magnitude * 0.45)),
			curlAngle01: clamp01(Math.atan2(gy, gx) / (2 * Math.PI) + 0.5),
			cellBoundary01: 0,
			displacement: normalizedVector(gx, gy, gz, Math.tanh(magnitude * 0.35))
		};
	}
}

export function createNoiseField(family: NoiseFamily, seed: number): NoiseField {
	switch (family) {
		case 'smooth':
			return new SmoothNoiseField(seed);
		case 'curl':
			return new CurlNoiseField(seed);
		case 'cellular':
			return new CellularNoiseField(seed);
		case 'ridged':
			return new RidgedNoiseField(seed);
	}
}

export function isNoiseFamily(value: unknown): value is NoiseFamily {
	return value === 'smooth' || value === 'curl' || value === 'cellular' || value === 'ridged';
}
