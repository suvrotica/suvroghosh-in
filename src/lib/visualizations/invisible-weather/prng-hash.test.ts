import { describe, expect, it } from 'vitest';
import { deriveSubseed, hashValue, stableStringify } from './hash';
import { SeededRandom } from './prng';

describe('Invisible Weather hashing and seeded randomness', () => {
	it('repeats sequences and distinguishes ordinary seed changes', () => {
		const first = new SeededRandom('monsoon-ledger-1847');
		const second = new SeededRandom('monsoon-ledger-1847');
		const other = new SeededRandom('monsoon-ledger-1848');
		const expected = Array.from({ length: 64 }, () => first.nextFloat());
		expect(Array.from({ length: 64 }, () => second.nextFloat())).toEqual(expected);
		expect(Array.from({ length: 64 }, () => other.nextFloat())).not.toEqual(expected);
		expect(expected.every((value) => Number.isFinite(value) && value >= 0 && value < 1)).toBe(true);
	});

	it('derives stable labelled sub-seeds independently of parent consumption', () => {
		const parent = new SeededRandom('shared-weather');
		const expected = Array.from({ length: 12 }, () => parent.fork('work-3').nextFloat());
		for (let index = 0; index < 1_000; index += 1) parent.nextFloat();
		expect(Array.from({ length: 12 }, () => parent.fork('work-3').nextFloat())).toEqual(expected);
		expect(deriveSubseed('weather', 'work-3')).not.toBe(deriveSubseed('weather', 'work-4'));
	});

	it('hashes canonical object structure rather than insertion order', () => {
		const first = { seed: 'rain', controls: { depth: 3, warp: 0.4 }, values: [1, 2, 3] };
		const second = { values: [1, 2, 3], controls: { warp: 0.4, depth: 3 }, seed: 'rain' };
		expect(stableStringify(first)).toBe(stableStringify(second));
		expect(hashValue(first)).toBe(hashValue(second));
		expect(hashValue({ ...first, seed: 'wind' })).not.toBe(hashValue(first));
	});
});
