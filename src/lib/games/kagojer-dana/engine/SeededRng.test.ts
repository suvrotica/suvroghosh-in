import { describe, expect, it } from 'vitest';
import { SeededRng, createSeedStreams, deriveSeed, hashSeed, normalizeSeed } from './SeededRng';

describe('SeededRng', () => {
	it('reproduces a sequence exactly from the same root and namespace', () => {
		const first = new SeededRng('tram-wire-after-rain').fork('wind');
		const second = new SeededRng('tram-wire-after-rain').fork('wind');

		expect(Array.from({ length: 24 }, () => first.next())).toEqual(
			Array.from({ length: 24 }, () => second.next())
		);
		expect(hashSeed('tram-wire-after-rain')).not.toBe(hashSeed('tram-wire-before-rain'));
		expect(deriveSeed('city-7', 'wind')).not.toBe(deriveSeed('city-7', 'traffic'));
	});

	it('keeps sibling streams independent of construction and consumption order', () => {
		const busy = createSeedStreams('city-42', ['world/chunk/17', 'wind', 'birds'] as const);
		const untouched = createSeedStreams('city-42', ['birds', 'wind', 'world/chunk/17'] as const);

		for (let index = 0; index < 1_000; index += 1) busy['world/chunk/17'].next();
		expect(Array.from({ length: 12 }, () => busy.wind.next())).toEqual(
			Array.from({ length: 12 }, () => untouched.wind.next())
		);
		expect(Array.from({ length: 12 }, () => busy.birds.next())).toEqual(
			Array.from({ length: 12 }, () => untouched.birds.next())
		);
	});

	it('makes hierarchical paths independent of how they are assembled', () => {
		const nested = new SeededRng('city-17').fork('world').fork('chunk/17');
		const direct = new SeededRng('city-17').fork('world/chunk/17');
		expect(Array.from({ length: 10 }, () => nested.nextUint32())).toEqual(
			Array.from({ length: 10 }, () => direct.nextUint32())
		);
	});

	it('restores state and clones without sharing subsequent mutation', () => {
		const random = new SeededRng(1988).fork('weather');
		random.next();
		const checkpoint = random.getState();
		const clone = random.clone();
		const expected = [random.next(), random.next(), random.next()];

		random.setState(checkpoint);
		expect([random.next(), random.next(), random.next()]).toEqual(expected);
		expect([clone.next(), clone.next(), clone.next()]).toEqual(expected);
	});

	it('normalizes shareable seeds without browser globals', () => {
		expect(normalizeSeed('  North\u0000   Calcutta  ')).toBe('North Calcutta');
		expect(normalizeSeed('')).toBe('north-calcutta-1847');
		expect(normalizeSeed(Number.NaN)).toBe('north-calcutta-1847');
	});
});
