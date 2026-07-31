import { describe, expect, it } from 'vitest';
import { BitSet } from './bitset';

describe('BitSet', () => {
	it('supports compact mutation, cloning, equality, iteration, and singleton lookup', () => {
		const set = BitSet.from(70, [0, 1, 31, 32, 63, 69]);
		expect(set.count()).toBe(6);
		expect(set.toArray()).toEqual([0, 1, 31, 32, 63, 69]);
		expect(set.has(32)).toBe(true);
		expect(set.remove(32)).toBe(true);
		expect(set.remove(32)).toBe(false);

		const clone = set.clone();
		expect(clone.equals(set)).toBe(true);
		clone.intersect(BitSet.from(70, [69]));
		expect(clone.isSingleton()).toBe(true);
		expect(clone.singletonIndex()).toBe(69);
		expect(set.equals(clone)).toBe(false);
	});

	it('keeps unused high bits clear for full sets of non-word-aligned sizes', () => {
		for (const size of [0, 1, 31, 32, 33, 65]) {
			const set = BitSet.full(size);
			expect(set.count()).toBe(size);
			expect(set.toArray()).toEqual(Array.from({ length: size }, (_, index) => index));
		}
	});

	it('reports whether intersections and unions actually changed the set', () => {
		const set = BitSet.from(8, [1, 2]);
		expect(set.union(BitSet.from(8, [2, 3]))).toBe(true);
		expect(set.toArray()).toEqual([1, 2, 3]);
		expect(set.union(BitSet.from(8, [1]))).toBe(false);
		expect(set.intersect(BitSet.from(8, [1, 3]))).toBe(true);
		expect(set.toArray()).toEqual([1, 3]);
	});
});
