import { describe, expect, it } from 'vitest';
import { GUIDED_TRIALS } from '../presets';
import { DEFAULT_CITY_CONFIG } from './constants';
import { neighbourIndex } from './directions';
import { generateCity } from './generator';
import type { Direction } from './types';

describe('city quality invariants', () => {
	it('keeps the canonical city metrics within meaningful ranges', () => {
		const result = generateCity(DEFAULT_CITY_CONFIG);

		expect(result.municipalPatches.length).toBeGreaterThan(0);
		expect(result.municipalPatches.length).toBeLessThanOrEqual(
			Math.ceil(result.width * result.height * 0.05)
		);
		expect(result.analysis.occupiedDensity).toBeGreaterThanOrEqual(0);
		expect(result.analysis.occupiedDensity).toBeLessThanOrEqual(1);
		expect(result.analysis.routeObstructions).toBeLessThanOrEqual(
			Math.ceil(result.analysis.walkable.cellCount * 0.1)
		);
		expect(result.analysis.drainage.segmentCount).toBeGreaterThanOrEqual(20);
		expect(result.analysis.drainage.segmentCount).toBeLessThanOrEqual(
			Math.ceil(result.width * result.height * 0.4)
		);
		expect(
			result.analysis.drainage.connectedToOutlet / result.analysis.drainage.segmentCount
		).toBeGreaterThanOrEqual(0.75);
		expect(result.analysis.drainage.uphill).toBeLessThanOrEqual(
			Math.ceil(result.analysis.drainage.segmentCount * 0.25)
		);

		const patchCells = new Set(
			result.municipalPatches.map((patch) => `${patch.pass}:${patch.cell.x},${patch.cell.y}`)
		);
		expect(patchCells.size).toBe(result.municipalPatches.length);
	});

	it('records the signature tram-versus-garage anomaly', () => {
		const trial = GUIDED_TRIALS.find((candidate) => candidate.id === 'tram-versus-garage');
		expect(trial).toBeDefined();
		const result = generateCity(trial!.config);
		const collisions = result.municipalPatches.filter(
			(patch) => patch.anomalyType === 'tram-through-garage'
		);

		expect(collisions).toHaveLength(1);
		const collision = collisions[0];
		const index = collision.cell.y * result.width + collision.cell.x;
		expect(result.occupationTiles[index].tags).toContain('garage');
		expect(
			Array.from({ length: 4 }, (_, direction) =>
				neighbourIndex(index, direction as Direction, result.width, result.height)
			).some((neighbour) => neighbour >= 0 && result.fabricTiles[neighbour].tags.includes('tram'))
		).toBe(true);
		expect(collision.demandedEdges.some((edge) => edge.passage === 'tram')).toBe(true);
	});
});
