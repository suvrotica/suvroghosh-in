import { describe, expect, it } from 'vitest';
import { BitSet } from './bitset';
import { FABRIC_PROTOTYPES, OCCUPATION_PROTOTYPES, expandPrototypes } from './catalog';
import {
	areVariantsCompatible,
	buildCompatibilityMasks,
	explainVariantCompatibility
} from './compatibility';
import { rotateDirection, rotateEdges } from './directions';
import type { Direction, EdgeSignature } from './types';

describe('tile rotation', () => {
	const asymmetric: [EdgeSignature, EdgeSignature, EdgeSignature, EdgeSignature] = [
		{ passage: 'lane', water: 'dry', drain: 'channel', face: 'entrance', clearance: 1 },
		{ passage: 'road', water: 'bank', drain: 'none', face: 'shopfront', clearance: 2 },
		{ passage: 'foot', water: 'pond', drain: 'culvert', face: 'wall', clearance: 0 },
		{ passage: 'closed', water: 'dry', drain: 'none', face: 'garage-door', clearance: 0 }
	];

	it('moves north to east after one clockwise turn and restores all sockets after four', () => {
		const once = rotateEdges(asymmetric, 1);
		expect(once[1]).toEqual(asymmetric[0]);
		let current = asymmetric;
		for (let turn = 0; turn < 4; turn += 1) current = rotateEdges(current, 1);
		expect(current).toEqual(asymmetric);
	});

	it('rotates entrance/renderer orientation consistently on concrete variants', () => {
		const sweetShop = expandPrototypes(OCCUPATION_PROTOTYPES).filter(
			(variant) => variant.prototypeId === 'sweet-shop'
		);
		expect(sweetShop).toHaveLength(4);
		for (const variant of sweetShop) {
			expect(variant.orientation).toBe(rotateDirection(0, variant.rotation));
			expect(variant.edges[variant.orientation!].face).toBe('shopfront');
			expect(variant.renderer).toBe('sweet-shop');
		}
	});
});

describe('catalogue compatibility', () => {
	const fabric = expandPrototypes(FABRIC_PROTOTYPES);
	const occupation = expandPrototypes(OCCUPATION_PROTOTYPES);

	it('checks the opposite edge and permits authored road/lane transitions', () => {
		const transition = fabric.find(
			(variant) => variant.prototypeId === 'lane-road-transition' && variant.rotation === 0
		)!;
		const lane = fabric.find(
			(variant) => variant.prototypeId === 'lane-straight' && variant.rotation === 0
		)!;
		const road = fabric.find(
			(variant) => variant.prototypeId === 'road-straight' && variant.rotation === 0
		)!;
		const parcel = fabric.find((variant) => variant.prototypeId === 'buildable-parcel')!;
		expect(areVariantsCompatible(transition, lane, 0)).toBe(true);
		expect(areVariantsCompatible(transition, road, 2)).toBe(true);
		expect(explainVariantCompatibility(transition, parcel, 0).compatible).toBe(false);
	});

	it('rejects tram discontinuities and pond interior against unbanked dry ground', () => {
		const tram = fabric.find(
			(variant) => variant.prototypeId === 'tram-road-straight' && variant.rotation === 0
		)!;
		const lane = fabric.find(
			(variant) => variant.prototypeId === 'lane-straight' && variant.rotation === 0
		)!;
		const pond = fabric.find((variant) => variant.prototypeId === 'pond-interior')!;
		const parcel = fabric.find((variant) => variant.prototypeId === 'buildable-parcel')!;
		expect(areVariantsCompatible(tram, lane, 0)).toBe(false);
		expect(areVariantsCompatible(pond, parcel, 0)).toBe(false);
	});

	it('precomputes masks equivalent to pairwise compatibility', () => {
		const masks = buildCompatibilityMasks(fabric);
		for (const direction of [0, 1, 2, 3] as const) {
			for (const first of fabric) {
				const expected = BitSet.from(
					fabric.length,
					fabric
						.filter((second) => areVariantsCompatible(first, second, direction))
						.map((variant) => variant.index)
				);
				expect(masks[direction][first.index].equals(expected)).toBe(true);
			}
		}
	});

	it('leaves every ordinary variant with at least one neighbour in every direction', () => {
		for (const variants of [fabric, occupation]) {
			const masks = buildCompatibilityMasks(variants);
			for (const variant of variants) {
				for (let direction = 0; direction < 4; direction += 1) {
					expect(
						masks[direction as Direction][variant.index].isEmpty(),
						`${variant.id} direction ${direction}`
					).toBe(false);
				}
			}
		}
	});

	it('keeps all requested ordinary feature families reachable in the catalogues', () => {
		const tags = new Set([...fabric, ...occupation].flatMap((variant) => variant.tags));
		for (const tag of [
			'lane',
			'house',
			'pond',
			'drain',
			'garage',
			'tea-stall',
			'temple',
			'tree',
			'tram',
			'pillar',
			'balcony',
			'sand'
		]) {
			if (tag === 'drain') continue; // Infrastructure is a constrained overlay, not a main tile.
			expect(tags.has(tag), tag).toBe(true);
		}
	});
});
