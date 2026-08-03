import { describe, expect, it } from 'vitest';
import { SeededRandom } from './prng';

describe('Lightning Atlas seeded randomness', () => {
	it('repeats the same sequence for string and integer seeds', () => {
		for (const seed of ['monsoon-1975', 1975]) {
			const first = new SeededRandom(seed);
			const second = new SeededRandom(seed);
			expect(Array.from({ length: 32 }, () => first.nextFloat())).toEqual(
				Array.from({ length: 32 }, () => second.nextFloat())
			);
		}
	});

	it('keeps labelled streams independent of parent consumption', () => {
		const first = new SeededRandom('storm');
		const expected = Array.from({ length: 12 }, () => first.fork('leader').nextFloat());
		const second = new SeededRandom('storm');
		for (let index = 0; index < 1_000; index += 1) second.nextFloat();
		const actual = Array.from({ length: 12 }, () => second.fork('leader').nextFloat());
		expect(actual).toEqual(expected);
		expect(first.fork('leader').nextFloat()).not.toBe(first.fork('rain').nextFloat());
	});

	it('returns bounded integers, normals and weighted choices', () => {
		const random = new SeededRandom('bounded');
		for (let index = 0; index < 100; index += 1) {
			expect(random.nextInt(3, 7)).toBeGreaterThanOrEqual(3);
			expect(random.nextInt(3, 7)).toBeLessThanOrEqual(7);
			expect(Number.isFinite(random.normal())).toBe(true);
			expect(random.weightedIndex([0, 0, 4, 0])).toBe(2);
		}
	});
});
