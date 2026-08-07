import { hashString, mixHash } from './hash';
import type { FieldSettings, NoiseMode, Point } from './types';

const GRADIENTS = [
	[1, 1, 0],
	[-1, 1, 0],
	[1, -1, 0],
	[-1, -1, 0],
	[1, 0, 1],
	[-1, 0, 1],
	[1, 0, -1],
	[-1, 0, -1],
	[0, 1, 1],
	[0, -1, 1],
	[0, 1, -1],
	[0, -1, -1]
] as const;

function clamp(value: number, minimum = 0, maximum = 1): number {
	if (!Number.isFinite(value)) return minimum;
	return Math.max(minimum, Math.min(maximum, value));
}

function fade(value: number): number {
	return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(left: number, right: number, amount: number): number {
	return left + (right - left) * amount;
}

function latticeHash(x: number, y: number, z: number, seed: string | number): number {
	let hash = hashString(String(seed));
	hash = mixHash(hash, Math.imul(x, 0x1f123bb5));
	hash = mixHash(hash, Math.imul(y, 0x5f356495));
	return mixHash(hash, Math.imul(z, 0x6c8e9cf5));
}

function trilinear(
	x: number,
	y: number,
	z: number,
	corner: (ix: number, iy: number, iz: number, dx: number, dy: number, dz: number) => number
): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const z0 = Math.floor(z);
	const fx = x - x0;
	const fy = y - y0;
	const fz = z - z0;
	const u = fade(fx);
	const v = fade(fy);
	const w = fade(fz);
	const sample = (dx: 0 | 1, dy: 0 | 1, dz: 0 | 1) =>
		corner(x0 + dx, y0 + dy, z0 + dz, fx - dx, fy - dy, fz - dz);
	const bottomNear = lerp(sample(0, 0, 0), sample(1, 0, 0), u);
	const bottomFar = lerp(sample(0, 1, 0), sample(1, 1, 0), u);
	const topNear = lerp(sample(0, 0, 1), sample(1, 0, 1), u);
	const topFar = lerp(sample(0, 1, 1), sample(1, 1, 1), u);
	return lerp(lerp(bottomNear, bottomFar, v), lerp(topNear, topFar, v), w);
}

/** Coherent lattice value noise, normalized to [0, 1]. */
export function valueNoise3D(x: number, y: number, z: number, seed: string | number = 0): number {
	if (![x, y, z].every(Number.isFinite)) return 0.5;
	return clamp(trilinear(x, y, z, (ix, iy, iz) => latticeHash(ix, iy, iz, seed) / 0xffff_ffff));
}

/** Coherent 3D gradient noise, normalized to [0, 1]. */
export function gradientNoise3D(
	x: number,
	y: number,
	z: number,
	seed: string | number = 0
): number {
	if (![x, y, z].every(Number.isFinite)) return 0.5;
	const value = trilinear(x, y, z, (ix, iy, iz, dx, dy, dz) => {
		const gradient = GRADIENTS[latticeHash(ix, iy, iz, seed) % GRADIENTS.length];
		return (gradient[0] * dx + gradient[1] * dy + gradient[2] * dz) / Math.SQRT2;
	});
	return clamp(value * 0.5 + 0.5);
}

export function coherentNoise3D(
	mode: NoiseMode,
	x: number,
	y: number,
	z: number,
	seed: string | number = 0
): number {
	return mode === 'value' ? valueNoise3D(x, y, z, seed) : gradientNoise3D(x, y, z, seed);
}

export function normalizeFieldSettings(settings: FieldSettings): FieldSettings {
	const depth = Math.round(clamp(settings.depth, 1, 4)) as 1 | 2 | 3 | 4;
	return {
		noiseMode: settings.noiseMode === 'value' ? 'value' : 'gradient',
		depth,
		frequency: clamp(settings.frequency, 0.05, 12),
		warpStrength: clamp(settings.warpStrength, 0, 2),
		timeScale: clamp(settings.timeScale, 0, 2),
		seed: String(settings.seed || 'invisible-weather')
	};
}

/**
 * Samples an ordinary or repeatedly domain-warped coherent field. Depth one is
 * ordinary noise; depths two through four feed decorrelated noise back into
 * the coordinates before the next sample. The result is always finite [0, 1].
 */
export function sampleField(x: number, y: number, z: number, settings: FieldSettings): number {
	if (![x, y, z].every(Number.isFinite)) return 0.5;
	const normalized = normalizeFieldSettings(settings);
	let px = x * normalized.frequency;
	let py = y * normalized.frequency;
	const pz = z * normalized.timeScale;
	let value = coherentNoise3D(normalized.noiseMode, px, py, pz, normalized.seed);

	for (let level = 1; level < normalized.depth; level += 1) {
		const scale = normalized.warpStrength * (1 + level * 0.27);
		const offsetX =
			coherentNoise3D(
				normalized.noiseMode,
				px + 17.31 + level * 3.7,
				py - 8.73,
				pz + level * 2.1,
				`${normalized.seed}:warp-x:${level}`
			) - 0.5;
		const offsetY =
			coherentNoise3D(
				normalized.noiseMode,
				px - 11.17,
				py + 23.41 + level * 2.9,
				pz - level * 1.7,
				`${normalized.seed}:warp-y:${level}`
			) - 0.5;
		px += (offsetX * 2 + (value - 0.5) * 0.45) * scale;
		py += (offsetY * 2 - (value - 0.5) * 0.35) * scale;
		value = coherentNoise3D(
			normalized.noiseMode,
			px,
			py,
			pz + level * 0.41,
			`${normalized.seed}:nested:${level}`
		);
	}
	return clamp(value);
}

export function fieldGradient(
	x: number,
	y: number,
	z: number,
	settings: FieldSettings,
	epsilon = 0.002
): Point {
	const step = clamp(Math.abs(epsilon), 1e-5, 0.05);
	const dx = sampleField(x + step, y, z, settings) - sampleField(x - step, y, z, settings);
	const dy = sampleField(x, y + step, z, settings) - sampleField(x, y - step, z, settings);
	return { x: dx / (2 * step), y: dy / (2 * step) };
}

/** Maps the scalar field to a repeatable directional alphabet before quantization. */
export function fieldAngle(
	x: number,
	y: number,
	z: number,
	settings: FieldSettings,
	turns = 1
): number {
	const safeTurns = clamp(Math.abs(turns), 0.05, 8);
	return sampleField(x, y, z, settings) * Math.PI * 2 * safeTurns - Math.PI;
}
