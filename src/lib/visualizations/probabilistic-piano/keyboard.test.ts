import { describe, expect, it } from 'vitest';
import { BLACK_KEY_COUNT, PIANO_KEYS, WHITE_KEY_COUNT } from './keyboard';

describe('complete acoustic-piano geometry', () => {
	it('contains exactly A0–C8 with 52 white and 36 black keys', () => {
		expect(PIANO_KEYS.map((key) => key.pitch)).toEqual(
			Array.from({ length: 88 }, (_, index) => index + 21)
		);
		expect(WHITE_KEY_COUNT).toBe(52);
		expect(BLACK_KEY_COUNT).toBe(36);
		expect(PIANO_KEYS.filter((key) => !key.black)).toHaveLength(52);
		expect(PIANO_KEYS.filter((key) => key.black)).toHaveLength(36);
		expect(Object.isFrozen(PIANO_KEYS)).toBe(true);
		expect(PIANO_KEYS.every(Object.isFrozen)).toBe(true);
	});
	it('tiles white keys from the partial lowest octave through the last C without gaps', () => {
		const whites = PIANO_KEYS.filter((key) => !key.black);
		expect(whites.slice(0, 3).map((key) => key.pitch)).toEqual([21, 23, 24]);
		for (let index = 0; index < whites.length; index++) {
			expect(whites[index].left).toBeCloseTo((index / 52) * 100, 12);
			expect(whites[index].width).toBeCloseTo(100 / 52, 12);
			if (index > 0)
				expect(whites[index - 1].left + whites[index - 1].width).toBeCloseTo(
					whites[index].left,
					12
				);
		}
		expect(whites.at(-1)!.left + whites.at(-1)!.width).toBeCloseTo(100, 12);
	});
	it('places each black key at its white boundary with the familiar two/three grouping', () => {
		const blackClasses = new Set([1, 3, 6, 8, 10]);
		for (let index = 0; index < PIANO_KEYS.length; index++) {
			const key = PIANO_KEYS[index];
			expect(key.black).toBe(blackClasses.has(key.pitch % 12));
			expect(key.centre).toBeCloseTo(key.left + key.width / 2, 12);
			expect(key.left).toBeGreaterThanOrEqual(0);
			expect(key.left + key.width).toBeLessThanOrEqual(100.000000000001);
			if (!key.black) continue;
			const before = PIANO_KEYS[index - 1];
			const after = PIANO_KEYS[index + 1];
			expect(before.black).toBe(false);
			expect(after.black).toBe(false);
			expect(key.centre).toBeCloseTo(after.left, 12);
			expect(key.width / before.width).toBeCloseTo(0.62, 12);
		}
	});
});
