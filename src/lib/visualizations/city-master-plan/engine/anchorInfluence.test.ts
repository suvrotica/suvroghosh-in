import { describe, expect, it } from 'vitest';
import {
	ANCHORS,
	anchorCells,
	anchorFrontageDirection,
	meetsRequiredSubstrate,
	providesPedestrianFrontage
} from './anchors';
import { ANCHOR_INFLUENCE_RADIUS, anchorWeightMultiplier } from './anchorInfluence';
import { BitSet } from './bitset';
import { createFabricCatalog, createOccupationCatalog } from './catalog';
import { DEFAULT_CITY_CONFIG } from './constants';
import { neighbourIndex } from './directions';
import { weightedCandidateChoice } from './entropy';
import { generateCity } from './generator';
import type { CityConfig, TileVariant } from './types';

describe('anchor substrate and frontage contract', () => {
	it('recognises every authored required substrate, including open and walkable ground', () => {
		for (const anchor of ANCHORS) {
			for (const required of anchor.requiredSubstrate ?? []) {
				expect(
					meetsRequiredSubstrate(anchor, [required]),
					`${anchor.id} should accept ${required}`
				).toBe(true);
			}
			expect(meetsRequiredSubstrate(anchor, ['unrelated-substrate'])).toBe(
				(anchor.requiredSubstrate?.length ?? 0) === 0
			);
		}
	});

	it('treats lanes, open ground, and courtyards as pedestrian frontage', () => {
		expect(providesPedestrianFrontage(['walkable', 'lane'])).toBe(true);
		expect(providesPedestrianFrontage(['open'])).toBe(true);
		expect(providesPedestrianFrontage(['courtyard'])).toBe(true);
		expect(providesPedestrianFrontage(['buildable', 'parcel'])).toBe(false);
		expect(providesPedestrianFrontage(['vehicle-access'])).toBe(false);
	});

	it('keeps generated anchor fabric and frontage inside the same public contract', () => {
		for (const definition of ANCHORS) {
			const result = generateCity(
				config({
					seed: `substrate-contract-${definition.id}`,
					size: 'small',
					anchor: {
						id: definition.id,
						x: 8,
						y: 6,
						rotation: definition.rotations[0]
					}
				})
			);
			for (const cell of anchorCells(result.anchor)) {
				const tile = result.fabricTiles[cell.y * result.width + cell.x];
				expect(
					meetsRequiredSubstrate(definition, tile.tags),
					`${definition.id} landed on ${tile.prototypeId}`
				).toBe(true);
			}
			if (!definition.frontageRequired) continue;
			const anchorIndex = result.anchor.y * result.width + result.anchor.x;
			const frontageIndex = neighbourIndex(
				anchorIndex,
				anchorFrontageDirection(result.anchor),
				result.width,
				result.height
			);
			expect(frontageIndex).toBeGreaterThanOrEqual(0);
			const frontage = result.fabricTiles[frontageIndex];
			if (definition.id === 'garage') {
				expect(frontage.tags, `${definition.id} frontage ${frontage.prototypeId}`).toContain(
					'vehicle-access'
				);
			} else {
				expect(
					providesPedestrianFrontage(frontage.tags),
					`${definition.id} frontage ${frontage.prototypeId}`
				).toBe(true);
			}
		}
	}, 30_000);
});

describe('anchor-local weighted observation', () => {
	it('decays to neutral and gives the sweet shop its authored pedestrian/service nudge', () => {
		const nearLaneJunction = anchorWeightMultiplier(
			'sweet-shop',
			'fabric',
			['walkable', 'lane', 'junction'],
			1
		);
		const nearParcel = anchorWeightMultiplier('sweet-shop', 'fabric', ['buildable', 'parcel'], 1);
		const nearTeaStall = anchorWeightMultiplier(
			'sweet-shop',
			'occupation',
			['service', 'stall', 'tea-stall'],
			1
		);
		expect(nearLaneJunction).toBeGreaterThan(nearParcel);
		expect(nearTeaStall).toBeGreaterThan(1);
		expect(
			anchorWeightMultiplier(
				'sweet-shop',
				'fabric',
				['walkable', 'lane', 'junction'],
				ANCHOR_INFLUENCE_RADIUS + 1
			)
		).toBe(1);
	});

	it('favours open/tree fabric and lowers dense occupation likelihood near a banyan', () => {
		expect(
			anchorWeightMultiplier('banyan-tree', 'fabric', ['open', 'tree-substrate'], 1)
		).toBeGreaterThan(anchorWeightMultiplier('banyan-tree', 'fabric', ['buildable', 'parcel'], 1));
		expect(
			anchorWeightMultiplier('banyan-tree', 'occupation', ['tree', 'open-space'], 1)
		).toBeGreaterThan(1);
		expect(
			anchorWeightMultiplier('banyan-tree', 'occupation', ['occupied', 'building'], 1)
		).toBeLessThan(1);
	});

	it('feeds local scales into deterministic weighted candidate choice', () => {
		const variants = [
			{ ...createFabricCatalog(config())[0], index: 0, weight: 1 },
			{ ...createFabricCatalog(config())[1], index: 1, weight: 1 }
		] satisfies TileVariant[];
		const unweighted = BitSet.from(2, [0, 1]);
		const weighted = unweighted.clone();
		weighted.setObservationWeightScales([4, 1]);

		expect(weightedCandidateChoice(unweighted, variants, 0.6)).toBe(1);
		expect(weightedCandidateChoice(weighted, variants, 0.6)).toBe(0);
		expect(weightedCandidateChoice(weighted.clone(), variants, 0.6)).toBe(0);
	});

	it('defines a non-neutral nearby profile for every public anchor in at least one pass', () => {
		const fabric = createFabricCatalog(config());
		const occupation = createOccupationCatalog(config());
		for (const anchor of ANCHORS) {
			const hasInfluence = [...fabric, ...occupation].some(
				(variant) => anchorWeightMultiplier(anchor.id, variant.pass, variant.tags, 1) !== 1
			);
			expect(hasInfluence, anchor.id).toBe(true);
		}
	});
});

function config(overrides: Partial<CityConfig> = {}): CityConfig {
	return {
		...DEFAULT_CITY_CONFIG,
		...overrides,
		anchor: { ...DEFAULT_CITY_CONFIG.anchor, ...overrides.anchor }
	};
}
