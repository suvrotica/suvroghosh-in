import { describe, expect, it, vi } from 'vitest';
import {
	MAX_SEED_LENGTH,
	SeededRandom,
	deriveBloomSeeds,
	deriveSeed,
	friendlySeedFromEntropy,
	generateFriendlySeed,
	hashString32,
	normalizeSeedText
} from './seed';

describe('Perlin Bloom seed utilities', () => {
	it('keeps the 32-bit hash and labelled seed derivation stable', () => {
		expect(hashString32('')).toBe(0x811c9dc5);
		expect(hashString32('a')).toBe(0xe40c292c);
		expect(hashString32('outside-1847')).toBe(hashString32('outside-1847'));
		expect(deriveSeed('outside-1847', 'noise')).not.toBe(deriveSeed('outside-1847', 'particles'));
		expect(deriveBloomSeeds('outside-1847')).toEqual(deriveBloomSeeds('outside-1847'));
	});

	it('repeats PRNG streams and keeps labelled forks independent of parent consumption', () => {
		const first = new SeededRandom('orchid-4821');
		const second = new SeededRandom('orchid-4821');
		const expected = Array.from({ length: 64 }, () => first.nextFloat());
		expect(Array.from({ length: 64 }, () => second.nextFloat())).toEqual(expected);
		expect(expected.every((value) => value >= 0 && value < 1)).toBe(true);

		const parent = new SeededRandom('forked-bloom');
		const forkBeforeConsumption = parent.fork('veins');
		const forkExpected = Array.from({ length: 8 }, () => forkBeforeConsumption.nextFloat());
		for (let index = 0; index < 500; index += 1) parent.nextFloat();
		const forkAfterConsumption = parent.fork('veins');
		expect(Array.from({ length: 8 }, () => forkAfterConsumption.nextFloat())).toEqual(forkExpected);
	});

	it('creates friendly seeds solely from supplied or cryptographic entropy', () => {
		const bytes = Uint8Array.from({ length: 16 }, (_, index) => index * 13);
		const expected = friendlySeedFromEntropy(bytes);
		expect(expected).toMatch(/^[a-z]+-\d{4}$/u);
		const getRandomValues = vi.fn((target: Uint8Array) => {
			target.set(bytes);
			return target;
		});
		expect(generateFriendlySeed({ getRandomValues })).toBe(expected);
		expect(getRandomValues).toHaveBeenCalledOnce();
	});

	it('normalizes control text and caps seeds by Unicode character', () => {
		expect(normalizeSeedText('  monsoon\n  1937  ')).toBe('monsoon 1937');
		expect(normalizeSeedText('orchid\u202Emarker\u200Bseed')).toBe('orchid marker seed');
		const longSeed = '🪷'.repeat(MAX_SEED_LENGTH + 20);
		expect(Array.from(normalizeSeedText(longSeed)).length).toBe(MAX_SEED_LENGTH);
		expect(normalizeSeedText('   ')).toBe('outside-1847');
	});
});
