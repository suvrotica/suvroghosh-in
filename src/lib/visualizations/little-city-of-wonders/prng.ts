import type { Vec3 } from './types';

/**
 * Deterministic Mulberry32 PRNG — keeps every clay bulge, shingle tint,
 * and cobble angle reproducible across SSR, tests, and browser sessions.
 */
export function createRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function hashCoords(x: number, y: number, z = 0, seed = 1337): number {
	let h =
		seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
	return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
	return v < min ? min : v > max ? max : v;
}

export function valueNoise2D(x: number, y: number, seed = 42): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = smoothstep(x - xi);
	const yf = smoothstep(y - yi);

	const n00 = hashCoords(xi, yi, 0, seed);
	const n10 = hashCoords(xi + 1, yi, 0, seed);
	const n01 = hashCoords(xi, yi + 1, 0, seed);
	const n11 = hashCoords(xi + 1, yi + 1, 0, seed);

	return lerp(lerp(n00, n10, xf), lerp(n01, n11, xf), yf) * 2 - 1;
}

export function valueNoise3D(x: number, y: number, z: number, seed = 42): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const zi = Math.floor(z);
	const xf = smoothstep(x - xi);
	const yf = smoothstep(y - yi);
	const zf = smoothstep(z - zi);

	const c000 = hashCoords(xi, yi, zi, seed);
	const c100 = hashCoords(xi + 1, yi, zi, seed);
	const c010 = hashCoords(xi, yi + 1, zi, seed);
	const c110 = hashCoords(xi + 1, yi + 1, zi, seed);
	const c001 = hashCoords(xi, yi, zi + 1, seed);
	const c101 = hashCoords(xi + 1, yi, zi + 1, seed);
	const c011 = hashCoords(xi, yi + 1, zi + 1, seed);
	const c111 = hashCoords(xi + 1, yi + 1, zi + 1, seed);

	const x00 = lerp(c000, c100, xf);
	const x10 = lerp(c010, c110, xf);
	const x01 = lerp(c001, c101, xf);
	const x11 = lerp(c011, c111, xf);

	return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf) * 2 - 1;
}

export function fbm2D(x: number, y: number, octaves = 3, seed = 42): number {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += amp * valueNoise2D(x * freq, y * freq, seed + i * 97);
		norm += amp;
		amp *= 0.5;
		freq *= 2.03;
	}
	return norm > 0 ? sum / norm : 0;
}

export function fbm3D(x: number, y: number, z: number, octaves = 3, seed = 42): number {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += amp * valueNoise3D(x * freq, y * freq, z * freq, seed + i * 131);
		norm += amp;
		amp *= 0.5;
		freq *= 2.07;
	}
	return norm > 0 ? sum / norm : 0;
}

export function hexToRgb01(hex: string): [number, number, number] {
	const clean = hex.replace('#', '');
	const num = parseInt(clean, 16);
	return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

export function rgb01ToHex(r: number, g: number, b: number): string {
	const ri = Math.round(clamp(r, 0, 1) * 255);
	const gi = Math.round(clamp(g, 0, 1) * 255);
	const bi = Math.round(clamp(b, 0, 1) * 255);
	return `#${((1 << 24) | (ri << 16) | (gi << 8) | bi).toString(16).slice(1)}`;
}

export function lerpHex(hexA: string, hexB: string, t: number): string {
	const [ar, ag, ab] = hexToRgb01(hexA);
	const [br, bg, bb] = hexToRgb01(hexB);
	return rgb01ToHex(lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t));
}

export function sampleCatmullRom(points: Vec3[], t01: number): Vec3 {
	if (points.length === 0) return [0, 0, 0];
	if (points.length === 1) return [...points[0]];
	const scaled = clamp(t01, 0, 1) * (points.length - 1);
	const idx = Math.min(Math.floor(scaled), points.length - 2);
	const u = scaled - idx;

	const p0 = points[Math.max(0, idx - 1)];
	const p1 = points[idx];
	const p2 = points[idx + 1];
	const p3 = points[Math.min(points.length - 1, idx + 2)];

	const u2 = u * u;
	const u3 = u2 * u;

	const out: Vec3 = [0, 0, 0];
	for (let c = 0; c < 3; c++) {
		out[c] =
			0.5 *
			(2 * p1[c] +
				(-p0[c] + p2[c]) * u +
				(2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 +
				(-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
	}
	return out;
}
