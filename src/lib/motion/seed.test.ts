import { describe, expect, it } from 'vitest';
import { createRouteRandom, createRouteSeed, hashStringToSeed, mulberry32 } from './seed';

describe('stable motion seeds', () => {
	it('hashes identical text to the same unsigned seed', () => {
		expect(hashStringToSeed('Calcutta / কলকাতা')).toBe(hashStringToSeed('Calcutta / কলকাতা'));
		expect(hashStringToSeed('Calcutta')).not.toBe(hashStringToSeed('calcutta'));
		expect(hashStringToSeed('Calcutta / কলকাতা')).toBeGreaterThanOrEqual(0);
		expect(hashStringToSeed('Calcutta / কলকাতা')).toBeLessThanOrEqual(0xffff_ffff);
	});

	it('combines a normalized pathname and biome', () => {
		expect(createRouteSeed('/writing', 'writing')).toBe(createRouteSeed('/writing/', 'writing'));
		expect(createRouteSeed('/writing?preview=1', 'writing')).toBe(
			createRouteSeed('/writing', 'writing')
		);
		expect(createRouteSeed('/writing', 'writing')).not.toBe(createRouteSeed('/writing', 'home'));
		expect(createRouteSeed('/writing', 'writing')).not.toBe(
			createRouteSeed('/projects', 'writing')
		);
	});
});

describe('mulberry32', () => {
	it('repeats the same sequence for the same seed', () => {
		const first = mulberry32(0xdecafbad);
		const second = mulberry32(0xdecafbad);

		expect(Array.from({ length: 12 }, first)).toEqual(Array.from({ length: 12 }, second));
	});

	it('returns values in the half-open unit interval', () => {
		const random = mulberry32(1);
		for (let index = 0; index < 1_000; index += 1) {
			const value = random();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it('creates stable per-route streams', () => {
		const first = createRouteRandom('/topics/calcutta', 'calcutta');
		const second = createRouteRandom('/topics/calcutta', 'calcutta');
		const other = createRouteRandom('/topics/calcutta', 'writing');

		const firstSequence = Array.from({ length: 8 }, first);
		expect(firstSequence).toEqual(Array.from({ length: 8 }, second));
		expect(firstSequence).not.toEqual(Array.from({ length: 8 }, other));
	});
});
