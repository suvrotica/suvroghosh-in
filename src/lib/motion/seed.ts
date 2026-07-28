import type { RouteBiome } from './types';

const FNV_OFFSET_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
const UINT32_RANGE = 0x1_0000_0000;

/**
 * Stable FNV-1a hash over UTF-16 code units. It deliberately avoids clocks,
 * browser APIs, platform encoders, and process-specific state.
 */
export function hashStringToSeed(value: string): number {
	let hash = FNV_OFFSET_32;
	for (let index = 0; index < value.length; index += 1) {
		const codeUnit = value.charCodeAt(index);
		hash ^= codeUnit & 0xff;
		hash = Math.imul(hash, FNV_PRIME_32);
		hash ^= codeUnit >>> 8;
		hash = Math.imul(hash, FNV_PRIME_32);
	}
	return hash >>> 0;
}

function normaliseSeedPath(pathname: string): string {
	const pathOnly = pathname.trim().split(/[?#]/, 1)[0] || '/';
	const withLeadingSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
	const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
	return collapsed === '/' ? collapsed : collapsed.replace(/\/+$/, '');
}

export function createRouteSeed(pathname: string, biome: RouteBiome): number {
	return hashStringToSeed(`${normaliseSeedPath(pathname)}\u001f${biome}`);
}

/**
 * Small deterministic PRNG with a 32-bit state and values in [0, 1).
 */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
	};
}

export function createRouteRandom(pathname: string, biome: RouteBiome): () => number {
	return mulberry32(createRouteSeed(pathname, biome));
}
