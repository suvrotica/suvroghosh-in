import { describe, expect, it } from 'vitest';
import { NearMissSystem, type NearMissObservation } from './NearMissSystem';

function obstacle(
	id: string,
	distanceM: number,
	overrides: Partial<NearMissObservation> = {}
): NearMissObservation {
	return {
		id,
		category: 'cornice',
		kind: 'architecture',
		distanceM,
		haloRadiusM: 0.7,
		basePoints: 100,
		...overrides
	};
}

describe('near-miss state machine', () => {
	it('awards only after outside -> halo -> closest approach -> clean exit', () => {
		const system = new NearMissSystem();
		expect(system.update([obstacle('cornice-1', 1.2)], 0)).toEqual([]);
		expect(system.update([obstacle('cornice-1', 0.62)], 0.1)).toMatchObject([
			{ type: 'entered', objectId: 'cornice-1' }
		]);
		expect(system.update([obstacle('cornice-1', 0.09)], 0.2)).toEqual([]);
		const exit = system.update([obstacle('cornice-1', 0.9)], 0.3);
		expect(exit).toMatchObject([
			{ type: 'awarded', objectId: 'cornice-1', closestDistanceM: 0.09 }
		]);
		expect(system.totalScore).toBeGreaterThan(0);
	});

	it('cancels on collision and consumes that object for the flight', () => {
		const system = new NearMissSystem();
		system.update([obstacle('wire-1', 0.4, { category: 'wire', kind: 'wire' })], 1);
		expect(
			system.update(
				[obstacle('wire-1', 0, { category: 'wire', kind: 'wire', collided: true })],
				1.1
			)
		).toMatchObject([{ type: 'cancelled', reason: 'collision' }]);
		expect(system.update([obstacle('wire-1', 0.3)], 2)).toEqual([]);
		expect(system.totalScore).toBe(0);
	});

	it.each(['person', 'animal', 'sacred-site', 'worshipper', 'religious-activity'] as const)(
		'never turns a %s into stunt score, even with scoring explicitly true',
		(kind) => {
			const system = new NearMissSystem();
			system.update([obstacle(`${kind}-1`, 0.05, { kind, scoring: true })], 0);
			expect(system.update([], 0.2)).toEqual([]);
			expect(system.totalScore).toBe(0);
		}
	);

	it('scores an object once and diminishes repeated obstacle categories', () => {
		const system = new NearMissSystem({ categoryDiminishingFactor: 0.5 });
		system.update([obstacle('cornice-a', 0.1)], 0);
		const first = system.update([], 0.2).find((event) => event.type === 'awarded');
		system.update([obstacle('cornice-b', 0.1)], 0.3);
		const second = system.update([], 0.5).find((event) => event.type === 'awarded');

		expect(first?.type === 'awarded' && first.categoryMultiplier).toBe(1);
		expect(second?.type === 'awarded' && second.categoryMultiplier).toBe(0.5);
		expect(second?.type === 'awarded' && second.points).toBeLessThan(
			first?.type === 'awarded' ? first.points : 0
		);
		expect(system.update([obstacle('cornice-a', 0.1)], 1)).toEqual([]);
	});
});
