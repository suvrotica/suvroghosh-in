import * as THREE from 'three';
import {
	createCrookedBoxMesh,
	createFoliageClusterGroup,
	createSteppedPathGroup,
	sculptClayGeometry,
	type DisposerBag
} from './craft-geometry';
import type { CityMaterialLibrary } from './materials';
import { WALK_SEGMENTS } from './navigation';
import { clamp, fbm2D, lerp } from './prng';
import type { LandmarkId, SecretId } from './types';

export function tagLandmark<T extends THREE.Object3D>(obj: T, landmarkId: LandmarkId): T {
	obj.userData.landmarkId = landmarkId;
	obj.traverse((child) => {
		child.userData.landmarkId = landmarkId;
	});
	return obj;
}

export function tagSecret<T extends THREE.Object3D>(obj: T, secretId: SecretId): T {
	obj.userData.secretId = secretId;
	obj.traverse((child) => {
		child.userData.secretId = secretId;
	});
	return obj;
}

export function tagWalkable<T extends THREE.Object3D>(obj: T): T {
	obj.userData.walkable = true;
	obj.traverse((child) => {
		child.userData.walkable = true;
	});
	return obj;
}

/**
 * Computes the canal centerline X coordinate as a function of Z (-22..+22).
 */
export function canalCenterX(z: number): number {
	return 1.8 * Math.sin(z * 0.13) + z * 0.11;
}

/**
 * Evaluates base diorama terrain height before architectural structures.
 */
export function sampleBaseTerrainHeight(x: number, z: number): number {
	// North-west coastal harbor cove (sea floor)
	if (x < -5.5 && z < -6.8) {
		const coveDepth = smoothMask(-x - 6.0, 4.5) * smoothMask(-z - 7.0, 4.0);
		// Except around Lighthouse headland (-18.5, -13.5) and Rookery Spire (-10.5, -16.2)
		const dLh = Math.hypot((x + 17.8) / 5.2, (z + 12.8) / 4.6);
		const dRk = Math.hypot((x + 10.5) / 3.8, (z + 15.8) / 3.8);
		const headlandLift = Math.max(3.5 * clamp(1.22 - dLh, 0, 1), 3.2 * clamp(1.18 - dRk, 0, 1));
		if (headlandLift > 0.35) {
			return headlandLift + fbm2D(x * 0.25, z * 0.25, 2, 19) * 0.14;
		}
		return -0.55 * coveDepth + 0.45 * (1 - coveDepth);
	}

	// Central S-curve canal channel
	const cx = canalCenterX(z);
	const distCanal = Math.abs(x - cx);

	// Keep Northern Canal Island (0, -5.4) above water!
	const distIsland = Math.hypot(x - 0.0, z + 5.4);
	if (distIsland < 1.95) {
		return 0.65;
	}

	if (distCanal < 2.25) {
		const bank = clamp((distCanal - 1.55) / 0.7, 0, 1);
		return lerp(-0.52, 0.58, bank * bank);
	}

	// Gentle elevation rise into Teapot Quarter (SW) and Lantern Gorge (NE)
	let base = 0.58;
	if (x < -3 && z > 7) {
		base += 0.24 * clamp((z - 7) / 8, 0, 1);
	}
	if (x > 4 && z < -4) {
		base += 0.35 * clamp((-z - 4) / 10, 0, 1) + 0.25 * clamp((x - 8) / 10, 0, 1);
	}

	base += fbm2D(x * 0.16, z * 0.16, 2, 83) * 0.08;
	return base;
}

function smoothMask(v: number, span: number): number {
	const t = clamp(v / span, 0, 1);
	return t * t * (3 - 2 * t);
}

export interface TerrainBuildResult {
	group: THREE.Group;
	waterMesh: THREE.Mesh;
}

export function buildDioramaPlinthAndTerrain(
	bag: DisposerBag,
	mats: CityMaterialLibrary
): TerrainBuildResult {
	const group = new THREE.Group();

	// 1. Carved Walnut Tabletop Diorama Plinth Frame + Brass Corner Brackets
	const plinthW = 49.5;
	const plinthD = 43.5;
	const plinthH = 2.1;

	const baseBox = bag.track(new THREE.BoxGeometry(plinthW, plinthH, plinthD));
	const plinth = new THREE.Mesh(baseBox, mats.woodWalnutPlinth);
	plinth.position.y = -plinthH * 0.5 - 0.35;
	plinth.receiveShadow = true;
	group.add(plinth);

	const stepLipGeo = bag.track(new THREE.BoxGeometry(plinthW + 1.1, 0.45, plinthD + 1.1));
	const stepLip = new THREE.Mesh(stepLipGeo, mats.woodWalnutPlinth);
	stepLip.position.y = -plinthH - 0.22;
	group.add(stepLip);

	// Brass corner plates & front engraved brass nameplate
	for (const sx of [-1, 1] as const) {
		for (const sz of [-1, 1] as const) {
			const plateGeo = bag.track(new THREE.BoxGeometry(1.4, plinthH * 0.86, 1.4));
			const plate = new THREE.Mesh(plateGeo, mats.metalBrass);
			plate.position.set(
				sx * (plinthW * 0.5 - 0.55),
				-plinthH * 0.5 - 0.35,
				sz * (plinthD * 0.5 - 0.55)
			);
			group.add(plate);
		}
	}
	const plaqueGeo = bag.track(new THREE.BoxGeometry(8.5, 0.78, 0.18));
	const plaque = new THREE.Mesh(plaqueGeo, mats.metalBrass);
	plaque.position.set(0, -1.25, plinthD * 0.5 + 0.06);
	group.add(plaque);

	// 2. Sculpted Continuous Diorama Terrain Mesh with Vertex Biome Coloring
	const segX = 88;
	const segZ = 78;
	const terrainGeo = bag.track(new THREE.PlaneGeometry(48, 42, segX, segZ));
	terrainGeo.rotateX(-Math.PI * 0.5);

	const pos = terrainGeo.attributes.position as THREE.BufferAttribute;
	const colors = new Float32Array(pos.count * 3);

	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const z = pos.getZ(i);
		const y = sampleBaseTerrainHeight(x, z);
		pos.setY(i, y);

		// Paint warm cobble stone in urban quarters, mossy green in Teapot/Gorge, coastal sand/stone in NW
		let r: number;
		let g: number;
		let b: number;

		if (y < 0.08) {
			// Submerged canal/harbor sandy stone bed
			r = 0.22;
			g = 0.42;
			b = 0.46;
		} else if (x < -5 && z < -7.5) {
			// Coastal cliff grass & salt-stone
			r = 0.52;
			g = 0.58;
			b = 0.42;
		} else if (x < -3 && z > 8.5) {
			// Kettlewick Green mossy turf around cobble paths
			r = 0.46;
			g = 0.59;
			b = 0.41;
		} else if (x > 5 && z < -6.5) {
			// Lantern gorge mossy slate
			r = 0.36;
			g = 0.44;
			b = 0.36;
		} else if (x > 2 && z >= -2) {
			// Denki-Cho warm urban asphalt/concrete tint
			r = 0.64;
			g = 0.61;
			b = 0.56;
		} else {
			// Old Town warm travertine cobble
			r = 0.72;
			g = 0.66;
			b = 0.56;
		}

		const grain = 0.92 + 0.16 * (0.5 + 0.5 * fbm2D(x * 0.9, z * 0.9, 2, 141));
		colors[i * 3] = clamp(r * grain, 0, 1);
		colors[i * 3 + 1] = clamp(g * grain, 0, 1);
		colors[i * 3 + 2] = clamp(b * grain, 0, 1);
	}
	terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	terrainGeo.computeVertexNormals();

	const terrainMesh = new THREE.Mesh(terrainGeo, mats.stoneCobble);
	terrainMesh.receiveShadow = true;
	terrainMesh.castShadow = true;
	tagWalkable(terrainMesh);
	group.add(terrainMesh);

	// Underside skirt around terrain edge so plinth meets terrain cleanly
	const skirtGeo = bag.track(new THREE.BoxGeometry(48.1, 0.95, 42.1));
	sculptClayGeometry(skirtGeo, { seed: 19, wobbleAmp: 0.02, tintHex: '#6c6356' });
	const skirt = new THREE.Mesh(skirtGeo, mats.stoneCliff);
	skirt.position.y = -0.22;
	group.add(skirt);

	// 3. Translucent Resin Harbor & Canal Water Surface (Y = +0.08)
	const waterGeo = bag.track(new THREE.PlaneGeometry(47.4, 41.4, 48, 42));
	waterGeo.rotateX(-Math.PI * 0.5);
	const waterMesh = new THREE.Mesh(waterGeo, mats.waterSurface);
	waterMesh.position.y = 0.08;
	waterMesh.receiveShadow = true;
	group.add(waterMesh);

	// 4. Stone Canal Quay Curbs along central S-curve
	for (let zi = -19; zi <= 19; zi += 1.5) {
		const cx = canalCenterX(zi);
		const cxNext = canalCenterX(zi + 1.5);
		const yaw = Math.atan2(cxNext - cx, 1.5);
		for (const side of [-1, 1] as const) {
			if (side === -1 && zi < -7.2) continue; // Open to NW Harbor Cove!
			const curb = createCrookedBoxMesh(bag, 0.36, 0.72, 1.62, mats.stoneTravertine, {
				seed: 300 + Math.round(zi * 10) + side,
				wobbleAmp: 0.015
			});
			curb.position.set(cx + side * 2.15, 0.0, zi + 0.75);
			curb.rotation.y = yaw;
			group.add(curb);
		}
	}

	// 5. Walkable Cobblestone Road Ribbons & Stepping Paths
	const walkRoot = new THREE.Group();
	for (const [idx, seg] of WALK_SEGMENTS.entries()) {
		if (seg.kind === 'skywalk' || seg.kind === 'bridge') continue;
		if (seg.kind === 'stair') {
			const stairs = createSteppedPathGroup(
				bag,
				[seg.a, seg.b],
				seg.width * 0.88,
				mats.stoneTravertine,
				1200 + idx * 13
			);
			walkRoot.add(stairs);
			continue;
		}
		const dx = seg.b[0] - seg.a[0];
		const dy = seg.b[1] - seg.a[1];
		const dz = seg.b[2] - seg.a[2];
		const len = Math.hypot(dx, dz);
		if (len < 0.2) continue;
		const roadGeo = bag.track(new THREE.BoxGeometry(seg.width, 0.08, len + 0.4, 2, 1, 4));
		sculptClayGeometry(roadGeo, {
			seed: 1400 + idx,
			wobbleAmp: 0.01,
			tintHex: '#dfd4be'
		});
		const road = new THREE.Mesh(roadGeo, mats.stoneCobble);
		road.position.set(
			(seg.a[0] + seg.b[0]) * 0.5,
			(seg.a[1] + seg.b[1]) * 0.5 - 0.02,
			(seg.a[2] + seg.b[2]) * 0.5
		);
		road.rotation.y = Math.atan2(dx, dz);
		road.rotation.x = -Math.atan2(dy, len);
		road.receiveShadow = true;
		walkRoot.add(road);
	}
	tagWalkable(walkRoot);
	group.add(walkRoot);

	// 6. Central Stone Arch Canal Bridge ("Ponte delle Barchette") + Canal-Mouse's Secret Door!
	const mainBridge = new THREE.Group();
	const archSpan = 4.8;
	for (let i = 0; i <= 14; i++) {
		const u = i / 14;
		const bx = lerp(-2.6, 2.6, u);
		const by = 0.62 + Math.sin(u * Math.PI) * 0.76;
		const deck = createCrookedBoxMesh(bag, 0.46, 0.18, 2.35, mats.stoneTravertine, {
			seed: 1600 + i,
			wobbleAmp: 0.01
		});
		deck.position.set(bx, by - 0.12, 1.65);
		tagWalkable(deck);
		mainBridge.add(deck);

		// Low stone parapets on North and South sides of bridge
		for (const sz of [-1, 1] as const) {
			const wall = createCrookedBoxMesh(bag, 0.44, 0.52, 0.18, mats.stoneTravertine, {
				seed: 1650 + i + sz,
				wobbleAmp: 0.01
			});
			wall.position.set(bx, by, 1.65 + sz * 1.1);
			mainBridge.add(wall);
		}
	}
	const underArchGeo = bag.track(new THREE.TorusGeometry(archSpan * 0.42, 0.28, 8, 20, Math.PI));
	const underArch = new THREE.Mesh(underArchGeo, mats.stoneCliff);
	underArch.position.set(0, 0.18, 1.65);
	mainBridge.add(underArch);

	// SECRET #2: The Canal-Mouse's Tiny Brass Keyhole Door tucked into West Bridge Abutment!
	const mouseDoorGroup = new THREE.Group();
	mouseDoorGroup.position.set(-1.85, 0.62, 0.72);
	const tinyArch = createCrookedBoxMesh(bag, 0.34, 0.42, 0.14, mats.woodRedDoor, {
		seed: 1701,
		wobbleAmp: 0.005
	});
	mouseDoorGroup.add(tinyArch);
	const tinyFrame = bag.track(new THREE.TorusGeometry(0.18, 0.04, 6, 12, Math.PI));
	const tfMesh = new THREE.Mesh(tinyFrame, mats.metalBrass);
	tfMesh.position.set(0, 0.38, 0.05);
	mouseDoorGroup.add(tfMesh);
	const keyhole = new THREE.Mesh(
		bag.track(new THREE.SphereGeometry(0.045, 8, 8)),
		mats.lanternGlass
	);
	keyhole.position.set(0.06, 0.2, 0.08);
	mouseDoorGroup.add(keyhole);
	tagSecret(mouseDoorGroup, 'mouse-door');
	mainBridge.add(mouseDoorGroup);

	group.add(mainBridge);

	// 7. Northern Canal Island & Twin Timber Footbridges (at Z = -5.4)
	const islandGeo = bag.track(new THREE.CylinderGeometry(1.9, 2.25, 0.85, 14));
	sculptClayGeometry(islandGeo, { seed: 1750, wobbleAmp: 0.04, tintHex: '#cfc3ab' });
	const island = new THREE.Mesh(islandGeo, mats.stoneTravertine);
	island.position.set(0.0, 0.26, -5.4);
	island.receiveShadow = true;
	tagWalkable(island);
	group.add(island);

	for (const span of [
		{ x0: -5.4, z0: -6.3, x1: -1.6, z1: -5.5 },
		{ x0: 1.6, z0: -5.4, x1: 4.8, z1: -5.6 },
		{ x0: -0.4, z0: 11.2, x1: 4.2, z1: 11.6 } // Southern Teapot <-> Urban Footbridge!
	]) {
		const steps = 9;
		for (let i = 0; i <= steps; i++) {
			const u = i / steps;
			const bx = lerp(span.x0, span.x1, u);
			const bz = lerp(span.z0, span.z1, u);
			const by = 0.66 + Math.sin(u * Math.PI) * 0.45;
			const plank = createCrookedBoxMesh(bag, 0.42, 0.1, 1.65, mats.woodWarmOak, {
				seed: 1800 + i,
				wobbleAmp: 0.008
			});
			plank.position.set(bx, by, bz);
			plank.rotation.y = Math.atan2(span.z1 - span.z0, span.x1 - span.x0);
			tagWalkable(plank);
			group.add(plank);
		}
	}

	// Perimeter & Neighborhood Miniature Trees, Cherry Blossoms, Streetlamps & Market Stalls!
	const treeSpecs: Array<{ x: number; z: number; scale: number; palette: string[] }> = [
		{ x: -21.2, z: 4.5, scale: 1.25, palette: ['#4d7849', '#669158', '#7ba364', '#d94882'] },
		{ x: -20.2, z: 17.5, scale: 1.3, palette: ['#53824b', '#6e9c5e', '#82b06a'] },
		{ x: -18.8, z: 9.2, scale: 1.1, palette: ['#4a7846', '#679958', '#eb6896'] },
		{ x: -4.2, z: 17.8, scale: 1.15, palette: ['#528249', '#6e9c5c', '#f0c24f'] },
		{ x: -19.2, z: -4.8, scale: 1.15, palette: ['#497545', '#649156', '#d94c84'] },
		{ x: 19.5, z: 15.8, scale: 1.25, palette: ['#4d7849', '#669158', '#eb759e'] },
		{ x: 19.8, z: 4.2, scale: 1.15, palette: ['#55854b', '#73a362', '#f2b84b'] },
		{ x: 20.2, z: -2.2, scale: 1.2, palette: ['#c95538', '#e07a42', '#4c7544'] },
		{ x: 5.2, z: -15.2, scale: 1.2, palette: ['#b84c32', '#d97238', '#486b44'] },
		{ x: 14.5, z: 16.5, scale: 1.05, palette: ['#4d7c49', '#6da15d', '#f08ca8'] },
		{ x: 4.8, z: 16.8, scale: 1.0, palette: ['#528249', '#72a360'] },
		{ x: -13.2, z: 17.6, scale: 1.1, palette: ['#4f7d47', '#6c9c5c', '#e882a0'] }
	];

	for (const [idx, t] of treeSpecs.entries()) {
		const ty = sampleBaseTerrainHeight(t.x, t.z);
		const trunk = createCrookedBoxMesh(
			bag,
			0.24 * t.scale,
			1.35 * t.scale,
			0.24 * t.scale,
			mats.woodDarkCharred,
			{ seed: 1900 + idx, leanX: (idx % 2 === 0 ? 1 : -1) * 0.12 }
		);
		trunk.position.set(t.x, ty, t.z);
		group.add(trunk);

		const crown = createFoliageClusterGroup(
			bag,
			13,
			[0.72 * t.scale, 0.85 * t.scale, 0.72 * t.scale],
			t.palette,
			mats.clayFoliage,
			1950 + idx * 17,
			0.36 * t.scale
		);
		crown.position.set(t.x, ty + 1.65 * t.scale, t.z);
		group.add(crown);
	}

	// Charming Canal-Side Striped Market Stalls & Warm Streetlamps along Quays and Lanes!
	for (const [idx, [sx, sz, rotY]] of [
		[-5.6, 4.6, 0.4],
		[-6.2, -1.6, 1.1],
		[5.6, 6.8, -0.8],
		[5.8, -0.6, -1.2]
	].entries()) {
		const sy = sampleBaseTerrainHeight(sx, sz);
		const stall = new THREE.Group();
		stall.position.set(sx, sy, sz);
		stall.rotation.y = rotY;

		const counter = createCrookedBoxMesh(bag, 1.35, 0.68, 0.75, mats.woodWarmOak, {
			seed: 2100 + idx
		});
		stall.add(counter);

		for (const px of [-0.58, 0.58]) {
			const post = new THREE.Mesh(
				bag.track(new THREE.CylinderGeometry(0.03, 0.03, 1.55, 6)),
				mats.woodDarkCharred
			);
			post.position.set(px, 0.78, -0.25);
			stall.add(post);
		}

		const canopy = new THREE.Mesh(
			bag.track(new THREE.BoxGeometry(1.52, 0.06, 1.05)),
			mats.fabricStripedAwning
		);
		canopy.position.set(0, 1.52, 0);
		canopy.rotation.x = 0.25;
		canopy.castShadow = true;
		stall.add(canopy);
		group.add(stall);
	}

	// Glowing Wrought-Iron Miniature Streetlamps dotting Every Neighborhood!
	for (const [lx, lz] of [
		[-3.6, 2.8],
		[3.6, 2.8],
		[-11.8, 8.8],
		[-7.8, 12.6],
		[8.6, 8.4],
		[12.2, 4.8],
		[6.4, -4.4],
		[-6.8, -5.8]
	]) {
		const ly = sampleBaseTerrainHeight(lx, lz);
		const post = new THREE.Mesh(
			bag.track(new THREE.CylinderGeometry(0.04, 0.07, 2.25, 7)),
			mats.metalIron
		);
		post.position.set(lx, ly + 1.12, lz);
		post.castShadow = true;
		group.add(post);

		const bulb = new THREE.Mesh(
			bag.track(new THREE.SphereGeometry(0.15, 10, 10)),
			mats.lanternGlass
		);
		bulb.position.set(lx, ly + 2.3, lz);
		group.add(bulb);
	}

	return { group, waterMesh };
}
