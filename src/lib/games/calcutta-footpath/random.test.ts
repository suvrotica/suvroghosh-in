import { describe, expect, it } from 'vitest';
import { SeededRandom, createRandomStreams } from './random';

describe('seeded random', () => {
	it('reproduces the same sequence from the same seed', () => {
		const first = new SeededRandom('tram-lines-after-rain');
		const second = new SeededRandom('tram-lines-after-rain');

		expect(Array.from({ length: 20 }, () => first.next())).toEqual(
			Array.from({ length: 20 }, () => second.next())
		);
		expect(new SeededRandom('another-lane').next()).not.toBe(
			new SeededRandom('tram-lines-after-rain').next()
		);
	});

	it('keeps named subsystem streams independent', () => {
		const busyEnvironment = createRandomStreams('run-42');
		const untouchedEnvironment = createRandomStreams('run-42');

		for (let index = 0; index < 200; index += 1) busyEnvironment.environment.next();

		expect(Array.from({ length: 8 }, () => busyEnvironment.weather.next())).toEqual(
			Array.from({ length: 8 }, () => untouchedEnvironment.weather.next())
		);
	});

	it('derives streams by name rather than construction order', () => {
		const forward = createRandomStreams('order-proof', ['food', 'animals'] as const);
		const reversed = createRandomStreams('order-proof', ['animals', 'food'] as const);

		expect(forward.food.next()).toBe(reversed.food.next());
		expect(forward.animals.next()).toBe(reversed.animals.next());
	});

	it('can restore a simulation stream snapshot exactly', () => {
		const random = new SeededRandom(1988);
		random.next();
		const checkpoint = random.getState();
		const expected = [random.next(), random.next(), random.next()];

		random.setState(checkpoint);
		expect([random.next(), random.next(), random.next()]).toEqual(expected);
	});
});
