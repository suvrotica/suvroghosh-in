export const ORCHESTRA_SUBSEED_LABELS = [
	'trajectory',
	'noise-field',
	'audio-excitation',
	'visual-decoration'
] as const;

export type OrchestraSubseedLabel = (typeof ORCHESTRA_SUBSEED_LABELS)[number];

/** Stable UTF-16 FNV-1a hash. This is a reproducibility primitive, not cryptography. */
export function hashSeed(value: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function createSubseed(masterSeed: string, label: OrchestraSubseedLabel | string): number {
	return hashSeed(`${masterSeed}:${label}`);
}

export interface SeededRandom {
	next(): number;
	nextUint32(): number;
	signed(): number;
	clone(): SeededRandom;
}

/** Mulberry32 with an explicit immutable initial seed and cloneable state. */
export function createSeededRandom(seed: number | string): SeededRandom {
	const initial = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
	let state = initial;
	const api: SeededRandom = {
		nextUint32(): number {
			state = (state + 0x6d2b79f5) >>> 0;
			let value = state;
			value = Math.imul(value ^ (value >>> 15), value | 1);
			value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
			return (value ^ (value >>> 14)) >>> 0;
		},
		next(): number {
			return api.nextUint32() / 0x1_0000_0000;
		},
		signed(): number {
			return api.next() * 2 - 1;
		},
		clone(): SeededRandom {
			return createSeededRandomFromState(state);
		}
	};
	return api;
}

function createSeededRandomFromState(currentState: number): SeededRandom {
	let state = currentState >>> 0;
	const api: SeededRandom = {
		nextUint32(): number {
			state = (state + 0x6d2b79f5) >>> 0;
			let value = state;
			value = Math.imul(value ^ (value >>> 15), value | 1);
			value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
			return (value ^ (value >>> 14)) >>> 0;
		},
		next(): number {
			return api.nextUint32() / 0x1_0000_0000;
		},
		signed(): number {
			return api.next() * 2 - 1;
		},
		clone(): SeededRandom {
			return createSeededRandomFromState(state);
		}
	};
	return api;
}

export function deriveOrchestraSubseeds(
	masterSeed: string
): Readonly<Record<OrchestraSubseedLabel, number>> {
	return Object.freeze({
		trajectory: createSubseed(masterSeed, 'trajectory'),
		'noise-field': createSubseed(masterSeed, 'noise-field'),
		'audio-excitation': createSubseed(masterSeed, 'audio-excitation'),
		'visual-decoration': createSubseed(masterSeed, 'visual-decoration')
	});
}
