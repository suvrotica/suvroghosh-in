import { describe, expect, it } from 'vitest';
import { SeededRandom, deterministicSequence, normalizeSeed } from './prng';

describe('seeded PRNG', () => {
	it('matches the engine-version reference vector', () => {
		const generator = new SeededRandom(42);
		expect(Array.from({ length: 8 }, () => generator.nextUint32())).toEqual([
			660444221, 3652823732, 77672526, 910233633, 2297337756, 3786072677, 3123505064, 1891482476
		]);
	});

	it('repeats the same sequence for the same numeric or text seed', () => {
		expect(deterministicSequence(123456, 128)).toEqual(deterministicSequence(123456, 128));
		expect(deterministicSequence('murex', 128)).toEqual(deterministicSequence('murex', 128));
		expect(deterministicSequence(123456, 16)).not.toEqual(deterministicSequence(123457, 16));
		expect(normalizeSeed('murex')).toBe(normalizeSeed('murex'));
	});

	it('restores exact output from a state snapshot', () => {
		const first = new SeededRandom(42);
		for (let index = 0; index < 7; index += 1) first.next();
		const snapshot = first.snapshot();
		const expected = Array.from({ length: 24 }, () => first.nextUint32());
		const restored = new SeededRandom(42, snapshot);
		expect(Array.from({ length: 24 }, () => restored.nextUint32())).toEqual(expected);
	});

	it('keeps helpers deterministic and within their requested bounds', () => {
		const a = new SeededRandom(0x5eed);
		const b = new SeededRandom(0x5eed);
		const sequenceA = Array.from({ length: 100 }, () => [
			a.integer(-4, 9),
			a.range(2, 3),
			a.chance(0.3),
			a.normal()
		]);
		const sequenceB = Array.from({ length: 100 }, () => [
			b.integer(-4, 9),
			b.range(2, 3),
			b.chance(0.3),
			b.normal()
		]);
		expect(sequenceA).toEqual(sequenceB);
		for (const [integer, ranged] of sequenceA) {
			expect(integer as number).toBeGreaterThanOrEqual(-4);
			expect(integer as number).toBeLessThan(9);
			expect(ranged as number).toBeGreaterThanOrEqual(2);
			expect(ranged as number).toBeLessThan(3);
		}
	});

	it('forks named streams independently of parent consumption', () => {
		const first = new SeededRandom(77);
		const before = first.fork('spines').nextUint32();
		for (let index = 0; index < 50; index += 1) first.next();
		expect(first.fork('spines').nextUint32()).toBe(before);
		expect(first.fork('ribs').nextUint32()).not.toBe(before);
	});
});
