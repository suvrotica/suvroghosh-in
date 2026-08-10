import { describe, expect, it } from 'vitest';
import { CHUNKS_PER_DISTRICT, CURATED_BENGALI_SIGNS, generateDistrictChunk } from './AssetGrammar';
import { collisionShapesForChunk } from './CollisionGrammar';
import { generateDistrictRoute } from './DistrictGraph';

describe('deterministic district asset grammar', () => {
	it('reproduces principal architecture and chunk signatures from the same seed', () => {
		const route = generateDistrictRoute('paper-over-college-street');
		const first = generateDistrictChunk(route, 4, { quality: 'balanced' });
		const second = generateDistrictChunk(route, 4, { quality: 'balanced' });
		expect(second).toEqual(first);
		expect(second.signature).toBe(first.signature);
		expect(
			first.buildings.every((building) => building.size.every((dimension) => dimension > 0))
		).toBe(true);
	});

	it('changes optional density by quality without moving retained principal buildings', () => {
		const route = generateDistrictRoute('independent-detail-streams');
		const high = generateDistrictChunk(route, 2, { quality: 'high' });
		const battery = generateDistrictChunk(route, 2, { quality: 'battery' });
		expect(high.buildings.length).toBeGreaterThan(battery.buildings.length);
		expect(high.buildings.slice(0, battery.buildings.length)).toEqual(battery.buildings);
	});

	it('only uses curated Bengali and never substitutes Devanagari', () => {
		const curated = new Set(Object.values(CURATED_BENGALI_SIGNS));
		const route = generateDistrictRoute('sign-reader');
		const signs = route.modules.flatMap(
			(_module, routeIndex) =>
				generateDistrictChunk(route, routeIndex * CHUNKS_PER_DISTRICT, { quality: 'high' }).signs
		);
		expect(signs.length).toBeGreaterThan(10);
		for (const sign of signs) {
			expect(curated.has(sign.bengali)).toBe(true);
			expect(sign.bengali).toMatch(/[\u0980-\u09ff]/u);
			expect(sign.bengali).not.toMatch(/[\u0900-\u097f]/u);
		}
	});

	it('keeps expressive people and habitat-specific animals out of stunt scoring', () => {
		const route = generateDistrictRoute('ordinary-private-business');
		for (let routeIndex = 0; routeIndex < 8; routeIndex += 1) {
			const chunk = generateDistrictChunk(route, routeIndex * CHUNKS_PER_DISTRICT, {
				quality: 'high'
			});
			expect(chunk.activities.every((activity) => activity.isScoringObstacle === false)).toBe(true);
			expect(chunk.animals.every((animal) => animal.isScoringObstacle === false)).toBe(true);
			expect(
				collisionShapesForChunk(chunk).some((collider) => collider.id.includes(':activity:'))
			).toBe(false);
			expect(
				collisionShapesForChunk(chunk).some((collider) => collider.id.includes(':animal:'))
			).toBe(false);
			if (chunk.routeNode.district !== 'hooghly' && chunk.routeNode.district !== 'new-town') {
				expect(chunk.animals.some((animal) => ['egret', 'pond-heron'].includes(animal.kind))).toBe(
					false
				);
			}
		}
	});

	it('places each hero only in its district middle chunk', () => {
		const route = generateDistrictRoute('truthful-landmark-placement');
		for (let routeIndex = 0; routeIndex < route.modules.length; routeIndex += 1) {
			const node = route.modules[routeIndex];
			const opening = generateDistrictChunk(route, routeIndex * CHUNKS_PER_DISTRICT);
			const reveal = generateDistrictChunk(route, routeIndex * CHUNKS_PER_DISTRICT + 1);
			expect(opening.landmarks.some((landmark) => landmark.prominence === 'hero')).toBe(false);
			expect(reveal.landmarks.find((landmark) => landmark.prominence === 'hero')?.id ?? null).toBe(
				node.heroLandmark
			);
		}
	});

	it('exposes thin bridge stays and the elevated Gate ring as capsule colliders', () => {
		const route = generateDistrictRoute('কলকাতা');
		const colliders = route.modules.flatMap((_node, routeIndex) =>
			collisionShapesForChunk(
				generateDistrictChunk(route, routeIndex * CHUNKS_PER_DISTRICT + 1, {
					quality: 'balanced'
				})
			)
		);
		const stays = colliders.filter((collider) => collider.id.includes(':vidyasagar-setu:stay:'));
		const gateRing = colliders.filter((collider) =>
			collider.id.includes(':biswa-bangla-gate:ring:')
		);
		expect(stays.length).toBe(48);
		expect(stays.every((collider) => collider.shape === 'capsule')).toBe(true);
		expect(gateRing).toHaveLength(12);
		expect(gateRing.every((collider) => collider.shape === 'capsule')).toBe(true);
		expect(new Set(colliders.map((collider) => collider.id)).size).toBe(colliders.length);
	});
});
