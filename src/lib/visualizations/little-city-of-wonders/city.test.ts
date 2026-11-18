import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DisposerBag, createCrookedBoxMesh, sculptClayGeometry } from './craft-geometry';
import {
	LANDMARKS,
	LANDMARK_BY_ID,
	MOOD_PRESETS,
	NEIGHBORHOODS,
	NEIGHBORHOOD_BY_ID,
	SECRET_CURIOSITIES,
	computeAtmosphereAtTime,
	createDefaultCityState,
	createRng,
	decodeCityStateFromSearch,
	encodeCityStateToQuery,
	fbm3D,
	findShortestWalkPath,
	formatClockLabel,
	readDiscoveredSecrets,
	resolveWalkablePosition,
	stepWalker,
	writeDiscoveredSecrets,
	type WalkerState
} from './index';

describe('The Little City of Wonders — World Model, Navigation & Craft Geometry', () => {
	it('defines all 6 distinct neighborhoods, 18 handcrafted landmarks, and 8 curiosities', () => {
		expect(NEIGHBORHOODS).toHaveLength(6);
		expect(LANDMARKS).toHaveLength(18);
		expect(SECRET_CURIOSITIES).toHaveLength(8);
		expect(MOOD_PRESETS).toHaveLength(4);

		for (const nb of NEIGHBORHOODS) {
			const count = LANDMARKS.filter((lm) => lm.neighborhoodId === nb.id).length;
			expect(count).toBe(3);
			expect(nb.paletteSwatches.length).toBeGreaterThanOrEqual(4);
		}

		for (const lm of LANDMARKS) {
			expect(NEIGHBORHOOD_BY_ID[lm.neighborhoodId]).toBeDefined();
			expect(lm.story.length).toBeGreaterThan(40);
			expect(lm.residentNote.length).toBeGreaterThan(25);
			expect(lm.materials.length).toBeGreaterThanOrEqual(3);
		}
	});

	it('maintains deterministic PRNG and 3D fractal noise across runs', () => {
		const r1 = createRng(4242);
		const r2 = createRng(4242);
		for (let i = 0; i < 20; i++) {
			expect(r1()).toBe(r2());
		}
		expect(fbm3D(1.25, 3.4, -2.1, 3, 77)).toBe(fbm3D(1.25, 3.4, -2.1, 3, 77));
	});

	it('connects every neighborhood on foot, including ascending from street level to the Floating Village', () => {
		const start = NEIGHBORHOOD_BY_ID['old-town'].walkSpawn;

		for (const nb of NEIGHBORHOODS) {
			const path = findShortestWalkPath(start, nb.walkSpawn);
			expect(path.length).toBeGreaterThanOrEqual(1);
			const end = path[path.length - 1];
			expect(Math.hypot(end[0] - nb.walkSpawn[0], end[2] - nb.walkSpawn[2])).toBeLessThan(1.8);
		}

		// Specifically verify vertical ascent from Old Town (~0.62m) up to Floating Village (~6.48m)
		const skyPath = findShortestWalkPath(start, NEIGHBORHOOD_BY_ID['floating-village'].walkSpawn);
		expect(skyPath.length).toBeGreaterThanOrEqual(4);
		expect(skyPath[skyPath.length - 1][1]).toBeGreaterThan(6.0);
	});

	it('preserves vertical layer separation between canal quays and overhead sky-bridges', () => {
		const groundResolved = resolveWalkablePosition(0.0, -5.8, 0.68);
		expect(groundResolved[1]).toBeLessThan(2.5);

		const skyResolved = resolveWalkablePosition(0.1, -6.8, 6.48);
		expect(skyResolved[1]).toBeGreaterThan(5.8);
	});

	it('advances walker smoothly along A* paths and manual WASD inputs', () => {
		const walker: WalkerState = {
			position: [...NEIGHBORHOOD_BY_ID['old-town'].walkSpawn],
			headingRad: 0,
			speed: 0,
			stridePhase: 0,
			activePath: findShortestWalkPath(
				NEIGHBORHOOD_BY_ID['old-town'].walkSpawn,
				LANDMARK_BY_ID['ramen-lemonade-corner'].walkEntrance
			),
			targetLandmarkId: 'ramen-lemonade-corner'
		};

		const initialX = walker.position[0];
		for (let step = 0; step < 60; step++) {
			stepWalker(walker, { forward: 0, strafe: 0, cameraYawRad: 0 }, 0.05);
		}
		expect(walker.position[0]).not.toBe(initialX);
		expect(walker.speed).toBeGreaterThan(0);

		// Manual input overrides active A* path
		stepWalker(walker, { forward: 1, strafe: 0, cameraYawRad: 0.5 }, 0.05);
		expect(walker.activePath).toHaveLength(0);
	});

	it('computes smooth 24-hour day-to-night lighting and increases window/lantern glow at night', () => {
		const morning = computeAtmosphereAtTime(9.25);
		const golden = computeAtmosphereAtTime(16.75);
		const midnight = computeAtmosphereAtTime(22.5);

		expect(morning.sunIntensity).toBeGreaterThan(golden.sunIntensity * 0.9);
		expect(midnight.windowGlow).toBeGreaterThan(morning.windowGlow * 3);
		expect(midnight.lanternGlow).toBeGreaterThan(morning.lanternGlow * 4);
		expect(midnight.starOpacity).toBeGreaterThan(0.8);
		expect(morning.starOpacity).toBe(0);
		expect(formatClockLabel(16.75)).toBe('4:45 PM');
	});

	it('round-trips viewer URL state and localStorage curiosity stampbook safely', () => {
		const s = createDefaultCityState();
		s.mode = 'third-person';
		s.activeNeighborhood = 'teapot-quarter';
		s.selectedLandmarkId = 'grand-blue-kettle';
		s.timeHours = 22.5;
		s.stopMotionCadence = true;

		const query = encodeCityStateToQuery(s);
		const decoded = decodeCityStateFromSearch(`?${query}`);
		expect(decoded.mode).toBe('third-person');
		expect(decoded.activeNeighborhood).toBe('teapot-quarter');
		expect(decoded.selectedLandmarkId).toBe('grand-blue-kettle');
		expect(decoded.mood).toBe('lantern-night');
		expect(decoded.stopMotionCadence).toBe(true);

		const mem = new Map<string, string>();
		const fakeStorage = {
			getItem: (k: string) => mem.get(k) ?? null,
			setItem: (k: string, v: string) => {
				mem.set(k, v);
			}
		};
		writeDiscoveredSecrets(fakeStorage, ['black-cat', 'spout-teacup']);
		expect(readDiscoveredSecrets(fakeStorage)).toEqual(['black-cat', 'spout-teacup']);
	});

	it('sculpts clay geometry with valid vertex colors and finite normals', () => {
		const bag = new DisposerBag();
		const mat = new THREE.MeshBasicMaterial();
		const mesh = createCrookedBoxMesh(bag, 2.4, 5.2, 2.1, mat, {
			seed: 101,
			leanX: 0.06,
			wobbleAmp: 0.03,
			tintHex: '#efe5d2'
		});
		const pos = mesh.geometry.attributes.position;
		const col = mesh.geometry.attributes.color;
		const nrm = mesh.geometry.attributes.normal;
		expect(col).toBeDefined();
		expect(col.count).toBe(pos.count);

		for (let i = 0; i < pos.count; i++) {
			expect(Number.isFinite(pos.getX(i))).toBe(true);
			expect(Number.isFinite(nrm.getY(i))).toBe(true);
			expect(col.getX(i)).toBeGreaterThanOrEqual(0);
			expect(col.getX(i)).toBeLessThanOrEqual(1);
		}

		const sphere = sculptClayGeometry(bag.track(new THREE.SphereGeometry(1, 8, 8)), { seed: 7 });
		expect(sphere.attributes.color.count).toBeGreaterThan(0);

		bag.dispose();
		mat.dispose();
	});
});
