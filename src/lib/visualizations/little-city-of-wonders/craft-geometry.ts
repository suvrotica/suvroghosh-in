import * as THREE from 'three';
import type { CityMaterialLibrary } from './materials';
import { clamp, createRng, fbm3D, hexToRgb01, lerp } from './prng';
import type { Vec3 } from './types';

export interface ClaySculptOptions {
	seed?: number;
	wobbleAmp?: number;
	wobbleFreq?: number;
	leanX?: number;
	leanZ?: number;
	taperTop?: number; // e.g. -0.08 narrows top, +0.08 flares top
	bellyBulge?: number;
	aoBottomStrength?: number;
	tintHex?: string;
}

export class DisposerBag {
	private geometries: THREE.BufferGeometry[] = [];

	track<T extends THREE.BufferGeometry>(geo: T): T {
		this.geometries.push(geo);
		return geo;
	}

	dispose(): void {
		for (const g of this.geometries) g.dispose();
		this.geometries.length = 0;
	}
}

/**
 * Applies tactile stop-motion clay imperfection and per-vertex ambient-occlusion /
 * sun-bleach coloring to any Three.js BufferGeometry.
 */
export function sculptClayGeometry(
	geo: THREE.BufferGeometry,
	opts: ClaySculptOptions = {}
): THREE.BufferGeometry {
	const {
		seed = 42,
		wobbleAmp = 0.035,
		wobbleFreq = 1.35,
		leanX = 0,
		leanZ = 0,
		taperTop = 0,
		bellyBulge = 0,
		aoBottomStrength = 0.24,
		tintHex = '#ffffff'
	} = opts;

	geo.computeBoundingBox();
	const bb = geo.boundingBox!;
	const minY = bb.min.y;
	const maxY = bb.max.y;
	const height = Math.max(maxY - minY, 1e-4);

	const pos = geo.attributes.position as THREE.BufferAttribute;
	const count = pos.count;
	const colors = new Float32Array(count * 3);
	const [tr, tg, tb] = hexToRgb01(tintHex);

	for (let i = 0; i < count; i++) {
		let x = pos.getX(i);
		let y = pos.getY(i);
		let z = pos.getZ(i);

		const h01 = clamp((y - minY) / height, 0, 1);
		const scale = 1 + taperTop * (h01 - 0.5) + bellyBulge * Math.sin(h01 * Math.PI);
		x *= scale;
		z *= scale;

		x += leanX * h01 * height * 0.12;
		z += leanZ * h01 * height * 0.12;

		if (wobbleAmp > 0) {
			const nx = fbm3D(x * wobbleFreq, y * wobbleFreq, z * wobbleFreq, 2, seed);
			const ny = fbm3D(x * wobbleFreq + 13.7, y * wobbleFreq, z * wobbleFreq, 2, seed + 19);
			const nz = fbm3D(x * wobbleFreq, y * wobbleFreq + 29.3, z * wobbleFreq, 2, seed + 37);
			x += nx * wobbleAmp;
			y += ny * wobbleAmp * 0.55;
			z += nz * wobbleAmp;
		}

		pos.setXYZ(i, x, y, z);

		// Per-vertex weathering & ground contact darkening
		const grime = 1 - aoBottomStrength * Math.pow(1 - h01, 2.2);
		const mottle = 0.94 + 0.12 * (0.5 + 0.5 * fbm3D(x * 1.9, y * 1.9, z * 1.9, 2, seed + 71));
		const shade = clamp(grime * mottle, 0.52, 1.08);

		colors[i * 3] = clamp(tr * shade, 0, 1);
		colors[i * 3 + 1] = clamp(tg * shade, 0, 1);
		colors[i * 3 + 2] = clamp(tb * shade, 0, 1);
	}

	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	pos.needsUpdate = true;
	geo.computeVertexNormals();
	return geo;
}

/**
 * Creates a sculpted clay/timber/stucco building volume whose origin is at its bottom center (y = 0).
 */
export function createCrookedBoxMesh(
	bag: DisposerBag,
	w: number,
	h: number,
	d: number,
	mat: THREE.Material,
	opts: ClaySculptOptions = {}
): THREE.Mesh {
	const segX = Math.max(3, Math.round(w * 2));
	const segY = Math.max(4, Math.round(h * 2));
	const segZ = Math.max(3, Math.round(d * 2));
	const geo = bag.track(new THREE.BoxGeometry(w, h, d, segX, segY, segZ));
	geo.translate(0, h * 0.5, 0);
	sculptClayGeometry(geo, opts);
	const mesh = new THREE.Mesh(geo, mat);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

export interface GableRoofOptions {
	seed?: number;
	overhang?: number;
	ridgeSag?: number;
	upturnEaves?: number; // > 0 creates East-Asian pagoda roof flare!
	thickness?: number;
}

/**
 * Hand-built volumetric pitched gable / pagoda roof with ridge cap & thickness.
 * Origin at base of roof (y = 0), ridge runs along X axis.
 */
export function createGableRoofGroup(
	bag: DisposerBag,
	w: number,
	rise: number,
	d: number,
	matRoof: THREE.Material,
	matTrim: THREE.Material,
	opts: GableRoofOptions = {}
): THREE.Group {
	const { seed = 88, overhang = 0.28, ridgeSag = 0.08, upturnEaves = 0, thickness = 0.12 } = opts;

	const group = new THREE.Group();
	const spanX = w + overhang * 2;
	const halfZ = d * 0.5 + overhang;

	// Build custom sloped roof slab for front (+Z) and back (-Z) slopes
	for (const side of [-1, 1] as const) {
		const segU = 10;
		const segV = 8;
		const plane = bag.track(new THREE.BoxGeometry(spanX, thickness, halfZ * 1.18, segU, 1, segV));
		const pos = plane.attributes.position as THREE.BufferAttribute;

		for (let i = 0; i < pos.count; i++) {
			const px = pos.getX(i);
			const py = pos.getY(i);
			const pz = pos.getZ(i); // -halfLen .. +halfLen

			const uNorm = px / (spanX * 0.5); // -1..+1 along ridge
			const v01 = clamp((pz + halfZ * 0.59) / (halfZ * 1.18), 0, 1); // 0 at ridge, 1 at outer eave

			const sagMid = -ridgeSag * (1 - uNorm * uNorm);
			const cornerFlare = upturnEaves * Math.pow(v01, 1.8) * (0.35 + 0.65 * uNorm * uNorm);
			const slopeY = lerp(rise, 0, v01) + sagMid + cornerFlare;
			const worldZ = side * v01 * halfZ;
			const wobble = 0.02 * fbm3D(px * 1.8, slopeY * 1.8, worldZ * 1.8, 2, seed + side * 13);

			pos.setXYZ(i, px, slopeY + py + wobble, worldZ);
		}
		sculptClayGeometry(plane, { seed: seed + side * 7, wobbleAmp: 0.012, aoBottomStrength: 0.18 });
		const slopeMesh = new THREE.Mesh(plane, matRoof);
		slopeMesh.castShadow = true;
		slopeMesh.receiveShadow = true;
		group.add(slopeMesh);
	}

	// Sculpted ridge cap beam
	const ridgeGeo = bag.track(new THREE.CylinderGeometry(0.09, 0.1, spanX * 1.02, 8, 8, false));
	ridgeGeo.rotateZ(Math.PI * 0.5);
	const rPos = ridgeGeo.attributes.position as THREE.BufferAttribute;
	for (let i = 0; i < rPos.count; i++) {
		const rx = rPos.getX(i);
		const uNorm = rx / (spanX * 0.5);
		const sagMid = -ridgeSag * (1 - uNorm * uNorm);
		const flare = upturnEaves * 0.45 * uNorm * uNorm;
		rPos.setY(i, rPos.getY(i) + rise + thickness * 0.55 + sagMid + flare);
	}
	sculptClayGeometry(ridgeGeo, { seed: seed + 33, wobbleAmp: 0.01 });
	const ridgeMesh = new THREE.Mesh(ridgeGeo, matTrim);
	ridgeMesh.castShadow = true;
	group.add(ridgeMesh);

	return group;
}

/**
 * Mediterranean / Cottage 4-sided hipped clay roof with gentle sagged eaves.
 */
export function createHipRoofMesh(
	bag: DisposerBag,
	w: number,
	rise: number,
	d: number,
	matRoof: THREE.Material,
	seed = 55,
	overhang = 0.3
): THREE.Mesh {
	const radius = Math.hypot(w + overhang * 2, d + overhang * 2) * 0.5;
	const geo = bag.track(new THREE.ConeGeometry(radius, rise, 4, 8));
	geo.rotateY(Math.PI * 0.25);
	geo.scale(
		(w + overhang * 2) / (radius * Math.SQRT2),
		1,
		(d + overhang * 2) / (radius * Math.SQRT2)
	);
	geo.translate(0, rise * 0.5, 0);

	// Slight concave clay curve
	const pos = geo.attributes.position as THREE.BufferAttribute;
	for (let i = 0; i < pos.count; i++) {
		const y = pos.getY(i);
		const h01 = clamp(y / rise, 0, 1);
		const sag = -0.08 * Math.sin(h01 * Math.PI);
		pos.setY(i, y + sag);
	}
	sculptClayGeometry(geo, { seed, wobbleAmp: 0.022, aoBottomStrength: 0.2 });
	const mesh = new THREE.Mesh(geo, matRoof);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

/**
 * Crooked storybook witch-hat conical / octagonal fantasy turret spire (Ref 2 & Ref 8).
 */
export function createWitchHatSpireMesh(
	bag: DisposerBag,
	radius: number,
	height: number,
	matRoof: THREE.Material,
	bendX = 0.22,
	bendZ = -0.14,
	sides = 8,
	seed = 99
): THREE.Mesh {
	const geo = bag.track(new THREE.ConeGeometry(radius, height, sides, 12));
	geo.translate(0, height * 0.5, 0);
	const pos = geo.attributes.position as THREE.BufferAttribute;

	for (let i = 0; i < pos.count; i++) {
		let x = pos.getX(i);
		const y = pos.getY(i);
		let z = pos.getZ(i);
		const h01 = clamp(y / height, 0, 1);
		// Bell flare near bottom + whimsical bend near tip
		const bell = 1 + 0.26 * Math.pow(1 - h01, 2.5);
		x = x * bell + bendX * Math.pow(h01, 2.1);
		z = z * bell + bendZ * Math.pow(h01, 2.1);
		pos.setXYZ(i, x, y, z);
	}

	sculptClayGeometry(geo, { seed, wobbleAmp: 0.02, aoBottomStrength: 0.22 });
	const mesh = new THREE.Mesh(geo, matRoof);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

/**
 * Hand-carved coastal boulder or gorge rock pinnacle with a flat top shelf at y = height.
 */
export function createCliffCragMesh(
	bag: DisposerBag,
	rx: number,
	height: number,
	rz: number,
	matStone: THREE.Material,
	seed = 202,
	topTaper = 0.78,
	bottomTaper = 1.08
): THREE.Mesh {
	const geo = bag.track(new THREE.CylinderGeometry(topTaper, bottomTaper, height, 18, 12));
	geo.scale(rx, 1, rz);
	geo.translate(0, height * 0.5, 0);

	const pos = geo.attributes.position as THREE.BufferAttribute;
	for (let i = 0; i < pos.count; i++) {
		let x = pos.getX(i);
		let y = pos.getY(i);
		let z = pos.getZ(i);
		const h01 = clamp(y / height, 0, 1);

		// Keep the very top flat plateau walkable/buildable while craggy on flanks
		const flankMask = h01 > 0.96 ? 0.12 : 1.0;
		const strata = Math.sin(y * 2.6 + fbm3D(x * 0.4, y * 0.4, z * 0.4, 2, seed) * 2.0) * 0.14;
		const crag = fbm3D(x * 0.45, y * 0.38, z * 0.45, 3, seed + 17) * 0.42;

		x += (crag + strata) * flankMask * (x >= 0 ? 1 : -1) * 0.55;
		z += (crag - strata * 0.6) * flankMask * (z >= 0 ? 1 : -1) * 0.55;
		if (h01 < 0.95) {
			y += fbm3D(x * 0.6, y * 0.6, z * 0.6, 2, seed + 41) * 0.18;
		}
		pos.setXYZ(i, x, y, z);
	}

	sculptClayGeometry(geo, { seed: seed + 5, wobbleAmp: 0.03, aoBottomStrength: 0.34 });
	const mesh = new THREE.Mesh(geo, matStone);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	return mesh;
}

/**
 * Framed glowing window unit with projecting stone/wood sill and optional flowerbox.
 * Faces +Z from local z = 0.
 */
export function createFramedWindowGroup(
	bag: DisposerBag,
	w: number,
	h: number,
	mats: CityMaterialLibrary,
	opts: {
		frameMat?: THREE.Material;
		glassMat?: THREE.Material;
		flowerPalette?: string[];
		shutters?: boolean;
		shutterMat?: THREE.Material;
		cornice?: boolean;
		seed?: number;
	} = {}
): THREE.Group {
	const {
		frameMat = mats.woodWarmOak,
		glassMat = mats.windowWarmMullion,
		flowerPalette,
		shutters = false,
		shutterMat = mats.plasterSage,
		cornice = false,
		seed = 301
	} = opts;

	const group = new THREE.Group();

	// Outer casing
	const casingGeo = bag.track(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.08));
	sculptClayGeometry(casingGeo, { seed, wobbleAmp: 0.006 });
	const casing = new THREE.Mesh(casingGeo, frameMat);
	casing.position.z = 0.02;
	casing.castShadow = true;
	group.add(casing);

	// Glowing glass pane
	const paneGeo = bag.track(new THREE.PlaneGeometry(w - 0.04, h - 0.04));
	const pane = new THREE.Mesh(paneGeo, glassMat);
	pane.position.z = 0.066;
	group.add(pane);

	// Projecting sill
	const sillGeo = bag.track(new THREE.BoxGeometry(w + 0.24, 0.09, 0.18));
	sculptClayGeometry(sillGeo, { seed: seed + 3, wobbleAmp: 0.006 });
	const sill = new THREE.Mesh(sillGeo, mats.stoneTravertine);
	sill.position.set(0, -h * 0.5 - 0.05, 0.07);
	sill.castShadow = true;
	group.add(sill);

	if (cornice) {
		const cornGeo = bag.track(new THREE.BoxGeometry(w + 0.3, 0.12, 0.22));
		sculptClayGeometry(cornGeo, { seed: seed + 9, wobbleAmp: 0.008 });
		const corn = new THREE.Mesh(cornGeo, mats.stoneTravertine);
		corn.position.set(0, h * 0.5 + 0.08, 0.09);
		corn.castShadow = true;
		group.add(corn);
	}

	if (shutters) {
		for (const side of [-1, 1] as const) {
			const shGeo = bag.track(new THREE.BoxGeometry(w * 0.44, h, 0.04));
			sculptClayGeometry(shGeo, { seed: seed + side * 11, wobbleAmp: 0.005 });
			const sh = new THREE.Mesh(shGeo, shutterMat);
			sh.position.set(side * (w * 0.5 + w * 0.22), 0, 0.06);
			sh.rotation.y = side * -0.22;
			sh.castShadow = true;
			group.add(sh);
		}
	}

	if (flowerPalette && flowerPalette.length > 0) {
		const boxGeo = bag.track(new THREE.BoxGeometry(w * 0.92, 0.16, 0.18));
		sculptClayGeometry(boxGeo, { seed: seed + 15, wobbleAmp: 0.008 });
		const box = new THREE.Mesh(boxGeo, mats.ceramicTerracotta);
		box.position.set(0, -h * 0.5 + 0.04, 0.14);
		box.castShadow = true;
		group.add(box);

		const blooms = createFoliageClusterGroup(
			bag,
			7,
			[w * 0.42, 0.12, 0.12],
			['#4d7843', '#5f8d50', ...flowerPalette],
			mats.clayFoliage,
			seed + 23,
			0.09
		);
		blooms.position.set(0, -h * 0.5 + 0.15, 0.16);
		group.add(blooms);
	}

	return group;
}

/**
 * Circular glowing porthole or Japanese maru-mado round window (Ref 3 & Ref 7).
 */
export function createRoundWindowGroup(
	bag: DisposerBag,
	radius: number,
	mats: CityMaterialLibrary,
	frameMat?: THREE.Material,
	crossbars = true
): THREE.Group {
	const group = new THREE.Group();
	const ringGeo = bag.track(new THREE.TorusGeometry(radius, 0.055, 8, 20));
	const ring = new THREE.Mesh(ringGeo, frameMat ?? mats.metalBrass);
	ring.position.z = 0.04;
	ring.castShadow = true;
	group.add(ring);

	const glassGeo = bag.track(new THREE.CircleGeometry(radius * 0.94, 20));
	const glass = new THREE.Mesh(glassGeo, mats.windowAmberPane);
	glass.position.z = 0.035;
	group.add(glass);

	if (crossbars) {
		const barH = bag.track(new THREE.BoxGeometry(radius * 1.85, 0.035, 0.03));
		const barV = bag.track(new THREE.BoxGeometry(0.035, radius * 1.85, 0.03));
		const m1 = new THREE.Mesh(barH, frameMat ?? mats.woodWarmOak);
		const m2 = new THREE.Mesh(barV, frameMat ?? mats.woodWarmOak);
		m1.position.z = 0.055;
		m2.position.z = 0.055;
		group.add(m1, m2);
	}
	return group;
}

/**
 * Arched wooden cottage/townhouse doorway with stone keystone surround.
 * Origin at bottom center (y = 0), faces +Z.
 */
export function createArchedDoorGroup(
	bag: DisposerBag,
	w: number,
	h: number,
	doorMat: THREE.Material,
	stoneMat: THREE.Material,
	mats: CityMaterialLibrary,
	seed = 404
): THREE.Group {
	const group = new THREE.Group();
	const straightH = h - w * 0.5;

	// Stone piers + arch ring
	for (const side of [-1, 1] as const) {
		const pier = createCrookedBoxMesh(bag, 0.16, straightH, 0.16, stoneMat, {
			seed: seed + side,
			wobbleAmp: 0.008
		});
		pier.position.set(side * (w * 0.5 + 0.06), 0, 0.03);
		group.add(pier);
	}

	const archGeo = bag.track(new THREE.TorusGeometry(w * 0.5 + 0.06, 0.09, 8, 16, Math.PI));
	sculptClayGeometry(archGeo, { seed: seed + 9, wobbleAmp: 0.008 });
	const arch = new THREE.Mesh(archGeo, stoneMat);
	arch.position.set(0, straightH, 0.04);
	arch.castShadow = true;
	group.add(arch);

	// Door leaf
	const leaf = createCrookedBoxMesh(bag, w, straightH, 0.07, doorMat, {
		seed: seed + 17,
		wobbleAmp: 0.006
	});
	leaf.position.set(0, 0, 0.01);
	group.add(leaf);

	const topCapGeo = bag.track(
		new THREE.CylinderGeometry(w * 0.5, w * 0.5, 0.07, 16, 1, false, 0, Math.PI)
	);
	topCapGeo.rotateZ(Math.PI * 0.5);
	topCapGeo.rotateY(Math.PI * 0.5);
	const topCap = new THREE.Mesh(topCapGeo, doorMat);
	topCap.position.set(0, straightH, 0.01);
	group.add(topCap);

	// Tiny brass handle
	const knobGeo = bag.track(new THREE.SphereGeometry(0.04, 8, 8));
	const knob = new THREE.Mesh(knobGeo, mats.metalBrass);
	knob.position.set(w * 0.28, h * 0.45, 0.065);
	group.add(knob);

	return group;
}

/**
 * Wrought-iron balcony with carved stone corbels and cascading bougainvillea / greenery!
 */
export function createWroughtBalconyGroup(
	bag: DisposerBag,
	w: number,
	d: number,
	mats: CityMaterialLibrary,
	flowerColors: string[] = ['#d63a7c', '#e85d99', '#48753e', '#5d8f4f'],
	seed = 505
): THREE.Group {
	const group = new THREE.Group();

	// Stone slab + brackets
	const slab = createCrookedBoxMesh(bag, w, 0.12, d, mats.stoneTravertine, {
		seed,
		wobbleAmp: 0.008
	});
	slab.position.set(0, -0.12, d * 0.5);
	group.add(slab);

	for (const sx of [-w * 0.36, w * 0.36]) {
		const corbel = createCrookedBoxMesh(bag, 0.14, 0.28, d * 0.72, mats.stoneTravertine, {
			seed: seed + 3,
			taperTop: 0.35,
			wobbleAmp: 0.008
		});
		corbel.position.set(sx, -0.38, d * 0.36);
		group.add(corbel);
	}

	// Wrought-iron railing
	const railH = 0.56;
	const postGeo = bag.track(new THREE.CylinderGeometry(0.018, 0.018, railH, 6));
	const spindles = Math.max(5, Math.round(w * 5));
	for (let i = 0; i <= spindles; i++) {
		const px = lerp(-w * 0.47, w * 0.47, i / spindles);
		const post = new THREE.Mesh(postGeo, mats.metalIron);
		post.position.set(px, railH * 0.5, d - 0.04);
		group.add(post);
	}
	for (const side of [-1, 1] as const) {
		for (let j = 1; j <= 3; j++) {
			const post = new THREE.Mesh(postGeo, mats.metalIron);
			post.position.set(side * w * 0.47, railH * 0.5, (j / 4) * (d - 0.04));
			group.add(post);
		}
	}

	const topBarF = bag.track(new THREE.BoxGeometry(w, 0.035, 0.035));
	const railFront = new THREE.Mesh(topBarF, mats.metalIron);
	railFront.position.set(0, railH, d - 0.04);
	group.add(railFront);

	const topBarS = bag.track(new THREE.BoxGeometry(0.035, 0.035, d));
	for (const side of [-1, 1] as const) {
		const railSide = new THREE.Mesh(topBarS, mats.metalIron);
		railSide.position.set(side * w * 0.47, railH, d * 0.5);
		group.add(railSide);
	}

	// Overflowing bougainvillea / trailing flower cascade
	const cascade = createFoliageClusterGroup(
		bag,
		16,
		[w * 0.48, 0.36, 0.24],
		flowerColors,
		mats.clayFoliage,
		seed + 29,
		0.13
	);
	cascade.position.set(w * 0.16, railH * 0.55, d + 0.02);
	group.add(cascade);

	return group;
}

/**
 * Lumpy stop-motion clay foliage / blossom tufts with per-puff vertex color tinting!
 */
export function createFoliageClusterGroup(
	bag: DisposerBag,
	count: number,
	spread: Vec3,
	palette: string[],
	matFoliage: THREE.Material,
	seed: number,
	baseRadius = 0.22
): THREE.Group {
	const group = new THREE.Group();
	const rng = createRng(seed);

	for (let i = 0; i < count; i++) {
		const r = baseRadius * (0.65 + rng() * 0.7);
		const puffGeo = bag.track(new THREE.IcosahedronGeometry(r, 1));
		const hex = palette[Math.floor(rng() * palette.length)];
		sculptClayGeometry(puffGeo, {
			seed: seed + i * 17,
			wobbleAmp: r * 0.22,
			wobbleFreq: 3.2,
			aoBottomStrength: 0.26,
			tintHex: hex
		});
		const puff = new THREE.Mesh(puffGeo, matFoliage);
		puff.position.set(
			(rng() - 0.5) * 2 * spread[0],
			(rng() - 0.5) * 2 * spread[1],
			(rng() - 0.5) * 2 * spread[2]
		);
		puff.castShadow = true;
		puff.receiveShadow = true;
		group.add(puff);
	}
	return group;
}

/**
 * Chain-suspended wrought-iron & amber glass street lantern (Ref 4, Ref 5, Ref 8).
 * Origin at top suspension hook (y = 0), hangs downward to -chainLength.
 */
export function createHangingLanternGroup(
	bag: DisposerBag,
	scale: number,
	chainLength: number,
	mats: CityMaterialLibrary,
	seed = 606
): THREE.Group {
	const group = new THREE.Group();

	if (chainLength > 0.05) {
		const links = Math.max(2, Math.round(chainLength / (0.16 * scale)));
		const linkGeo = bag.track(new THREE.TorusGeometry(0.045 * scale, 0.014 * scale, 5, 8));
		for (let i = 0; i < links; i++) {
			const link = new THREE.Mesh(linkGeo, mats.metalIron);
			link.position.y = -((i + 0.5) / links) * chainLength;
			if (i % 2 === 1) link.rotation.y = Math.PI * 0.5;
			group.add(link);
		}
	}

	const bodyY = -chainLength - 0.28 * scale;
	const capGeo = bag.track(new THREE.ConeGeometry(0.24 * scale, 0.2 * scale, 6));
	sculptClayGeometry(capGeo, { seed, wobbleAmp: 0.008 * scale });
	const cap = new THREE.Mesh(capGeo, mats.metalIron);
	cap.position.y = bodyY + 0.22 * scale;
	cap.castShadow = true;
	group.add(cap);

	const glassGeo = bag.track(
		new THREE.CylinderGeometry(0.17 * scale, 0.13 * scale, 0.32 * scale, 6)
	);
	const glass = new THREE.Mesh(glassGeo, mats.lanternGlass);
	glass.position.y = bodyY;
	group.add(glass);

	const baseGeo = bag.track(new THREE.ConeGeometry(0.13 * scale, 0.12 * scale, 6));
	baseGeo.rotateX(Math.PI);
	const base = new THREE.Mesh(baseGeo, mats.metalIron);
	base.position.y = bodyY - 0.21 * scale;
	group.add(base);

	return group;
}

/**
 * Sagging catenary power wire, rope, or heavy mooring chain between two 3D points.
 */
export function createCatenaryCableMesh(
	bag: DisposerBag,
	p0: Vec3,
	p1: Vec3,
	sag: number,
	radius: number,
	mat: THREE.Material,
	segments = 14
): THREE.Mesh {
	const curvePts: THREE.Vector3[] = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		const x = lerp(p0[0], p1[0], t);
		const z = lerp(p0[2], p1[2], t);
		const y = lerp(p0[1], p1[1], t) - Math.sin(t * Math.PI) * sag;
		curvePts.push(new THREE.Vector3(x, y, z));
	}
	const curve = new THREE.CatmullRomCurve3(curvePts);
	const geo = bag.track(new THREE.TubeGeometry(curve, segments, radius, 5, false));
	const mesh = new THREE.Mesh(geo, mat);
	mesh.castShadow = radius > 0.03;
	return mesh;
}

/**
 * Hand-laid stone or timber steps along a 3D polyline.
 */
export function createSteppedPathGroup(
	bag: DisposerBag,
	points: Vec3[],
	stepWidth: number,
	matStep: THREE.Material,
	seed = 707
): THREE.Group {
	const group = new THREE.Group();
	const rng = createRng(seed);

	for (let s = 0; s < points.length - 1; s++) {
		const a = points[s];
		const b = points[s + 1];
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const dz = b[2] - a[2];
		const horizLen = Math.hypot(dx, dz);
		const dist = Math.hypot(horizLen, dy);
		const steps = Math.max(3, Math.round(dist / 0.36));
		const yaw = Math.atan2(dx, dz);

		for (let i = 0; i <= steps; i++) {
			const t = i / steps;
			const sx = lerp(a[0], b[0], t);
			const sy = lerp(a[1], b[1], t);
			const sz = lerp(a[2], b[2], t);

			const slabGeo = bag.track(
				new THREE.BoxGeometry(stepWidth * (0.94 + rng() * 0.12), 0.16, 0.42, 3, 1, 2)
			);
			sculptClayGeometry(slabGeo, {
				seed: seed + s * 41 + i * 7,
				wobbleAmp: 0.015,
				aoBottomStrength: 0.22
			});
			const slab = new THREE.Mesh(slabGeo, matStep);
			slab.position.set(sx, sy - 0.06, sz);
			slab.rotation.y = yaw + (rng() - 0.5) * 0.08;
			slab.castShadow = true;
			slab.receiveShadow = true;
			group.add(slab);
		}
	}
	return group;
}

/**
 * Swaying wooden-plank and rope suspension sky-bridge with warm string lanterns!
 */
export function createSuspensionBridgeGroup(
	bag: DisposerBag,
	points: Vec3[],
	width: number,
	mats: CityMaterialLibrary,
	seed = 808
): THREE.Group {
	const group = new THREE.Group();
	const rng = createRng(seed);
	const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
	const length = curve.getLength();
	const plankCount = Math.max(8, Math.round(length / 0.42));

	const leftRailPts: Vec3[] = [];
	const rightRailPts: Vec3[] = [];

	for (let i = 0; i <= plankCount; i++) {
		const t = i / plankCount;
		const pt = curve.getPoint(t);
		const tan = curve.getTangent(t);
		const yaw = Math.atan2(tan.x, tan.z);
		const sideX = Math.cos(yaw);
		const sideZ = -Math.sin(yaw);

		const plankGeo = bag.track(new THREE.BoxGeometry(width, 0.075, 0.32, 3, 1, 1));
		sculptClayGeometry(plankGeo, { seed: seed + i * 5, wobbleAmp: 0.008 });
		const plank = new THREE.Mesh(plankGeo, mats.woodWarmOak);
		plank.position.set(pt.x, pt.y - 0.04, pt.z);
		plank.rotation.y = yaw + (rng() - 0.5) * 0.05;
		plank.castShadow = true;
		plank.receiveShadow = true;
		group.add(plank);

		const railDip = 0.82 - Math.sin(t * Math.PI) * 0.16;
		leftRailPts.push([pt.x - sideX * width * 0.52, pt.y + railDip, pt.z - sideZ * width * 0.52]);
		rightRailPts.push([pt.x + sideX * width * 0.52, pt.y + railDip, pt.z + sideZ * width * 0.52]);

		if (i % 3 === 0) {
			for (const sgn of [-1, 1] as const) {
				const postGeo = bag.track(new THREE.CylinderGeometry(0.03, 0.035, railDip + 0.1, 6));
				const post = new THREE.Mesh(postGeo, mats.woodDarkCharred);
				post.position.set(
					pt.x + sgn * sideX * width * 0.52,
					pt.y + railDip * 0.5,
					pt.z + sgn * sideZ * width * 0.52
				);
				group.add(post);
			}
		}

		if (i > 0 && i < plankCount && i % 5 === 0) {
			const sgn = i % 10 === 0 ? 1 : -1;
			const bulbGeo = bag.track(new THREE.SphereGeometry(0.085, 8, 8));
			const bulb = new THREE.Mesh(bulbGeo, mats.lanternGlass);
			bulb.position.set(
				pt.x + sgn * sideX * width * 0.52,
				pt.y + railDip + 0.08,
				pt.z + sgn * sideZ * width * 0.52
			);
			group.add(bulb);
		}
	}

	// Twin handrail ropes
	for (const railPts of [leftRailPts, rightRailPts]) {
		const rCurve = new THREE.CatmullRomCurve3(
			railPts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
		);
		const ropeGeo = bag.track(new THREE.TubeGeometry(rCurve, plankCount, 0.032, 6, false));
		const rope = new THREE.Mesh(ropeGeo, mats.woodHoney);
		rope.castShadow = true;
		group.add(rope);
	}

	return group;
}

/**
 * Miniature Japanese drink vending machine (Ref 6 orange & Ref 7 white!).
 */
export function createVendingMachineGroup(
	bag: DisposerBag,
	isOrange: boolean,
	mats: CityMaterialLibrary,
	seed = 901
): THREE.Group {
	const group = new THREE.Group();
	const bodyMat = isOrange ? mats.vendingOrangeBody : mats.vendingWhiteBody;

	const body = createCrookedBoxMesh(bag, 0.72, 1.48, 0.48, bodyMat, {
		seed,
		wobbleAmp: 0.008
	});
	group.add(body);

	const displayGeo = bag.track(new THREE.PlaneGeometry(0.56, 0.72));
	const display = new THREE.Mesh(displayGeo, mats.vendingDisplayGlow);
	display.position.set(0, 0.96, 0.246);
	group.add(display);

	const slotGeo = bag.track(new THREE.BoxGeometry(0.48, 0.2, 0.04));
	const slot = new THREE.Mesh(slotGeo, mats.metalIron);
	slot.position.set(0, 0.26, 0.24);
	group.add(slot);

	return group;
}

/**
 * Crooked utility pole with crossarms, pole transformer, and optional glowing vertical sign.
 */
export function createUtilityPoleGroup(
	bag: DisposerBag,
	height: number,
	mats: CityMaterialLibrary,
	opts: { timber?: boolean; neonSign?: boolean; seed?: number } = {}
): { group: THREE.Group; wireAnchors: Vec3[] } {
	const { timber = false, neonSign = false, seed = 950 } = opts;
	const group = new THREE.Group();

	const poleGeo = bag.track(new THREE.CylinderGeometry(0.08, 0.13, height, 8, 8));
	poleGeo.translate(0, height * 0.5, 0);
	sculptClayGeometry(poleGeo, {
		seed,
		wobbleAmp: 0.015,
		leanX: 0.08
	});
	const pole = new THREE.Mesh(poleGeo, timber ? mats.woodDarkCharred : mats.stoneTravertine);
	pole.castShadow = true;
	group.add(pole);

	// Crossarms
	const anchors: Vec3[] = [];
	for (const [idx, armY] of [height - 0.55, height - 1.25].entries()) {
		const armW = idx === 0 ? 1.25 : 0.95;
		const armGeo = bag.track(new THREE.BoxGeometry(armW, 0.07, 0.07));
		const arm = new THREE.Mesh(armGeo, mats.woodDarkCharred);
		arm.position.set(0, armY, 0);
		group.add(arm);
		anchors.push([-armW * 0.45, armY, 0], [armW * 0.45, armY, 0]);
	}

	// Cylindrical transformer bucket
	const transGeo = bag.track(new THREE.CylinderGeometry(0.18, 0.17, 0.52, 10));
	const trans = new THREE.Mesh(transGeo, mats.metalAgedTin);
	trans.position.set(0.22, height - 1.9, 0.12);
	trans.castShadow = true;
	group.add(trans);

	if (neonSign) {
		const signBoxGeo = bag.track(new THREE.BoxGeometry(0.52, 1.38, 0.16));
		const signBox = new THREE.Mesh(signBoxGeo, mats.neonOrangeKanji);
		signBox.position.set(0.46, height - 3.2, 0);
		signBox.castShadow = true;
		group.add(signBox);
	}

	return { group, wireAnchors: anchors };
}

/**
 * Exterior AC condenser unit with fan grille & copper pipe!
 */
export function createAcUnitGroup(
	bag: DisposerBag,
	mats: CityMaterialLibrary,
	seed = 977
): THREE.Group {
	const group = new THREE.Group();
	const box = createCrookedBoxMesh(bag, 0.64, 0.46, 0.28, mats.vendingWhiteBody, {
		seed,
		wobbleAmp: 0.006
	});
	group.add(box);

	const fanGeo = bag.track(new THREE.CircleGeometry(0.16, 14));
	const fan = new THREE.Mesh(fanGeo, mats.metalIron);
	fan.position.set(-0.1, 0.23, 0.145);
	group.add(fan);
	return group;
}

/**
 * Tiny sculpted sitting cat with an animatable curved tail pivot!
 */
export function createMiniatureCatGroup(
	bag: DisposerBag,
	matCat: THREE.Material
): { group: THREE.Group; tailPivot: THREE.Group } {
	const group = new THREE.Group();

	const bodyGeo = bag.track(new THREE.SphereGeometry(0.13, 10, 8));
	bodyGeo.scale(0.85, 1.25, 0.9);
	const body = new THREE.Mesh(bodyGeo, matCat);
	body.position.y = 0.15;
	body.castShadow = true;
	group.add(body);

	const headGeo = bag.track(new THREE.SphereGeometry(0.095, 10, 8));
	const head = new THREE.Mesh(headGeo, matCat);
	head.position.set(0, 0.33, 0.04);
	head.castShadow = true;
	group.add(head);

	const earGeo = bag.track(new THREE.ConeGeometry(0.038, 0.08, 4));
	for (const side of [-1, 1] as const) {
		const ear = new THREE.Mesh(earGeo, matCat);
		ear.position.set(side * 0.055, 0.42, 0.04);
		ear.rotation.z = side * -0.2;
		group.add(ear);
	}

	const tailPivot = new THREE.Group();
	tailPivot.position.set(0, 0.08, -0.09);
	const tailCurve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(0, 0, 0),
		new THREE.Vector3(0.05, 0.1, -0.1),
		new THREE.Vector3(0.09, 0.24, -0.06)
	]);
	const tailGeo = bag.track(new THREE.TubeGeometry(tailCurve, 8, 0.022, 6, false));
	const tail = new THREE.Mesh(tailGeo, matCat);
	tailPivot.add(tail);
	group.add(tailPivot);

	return { group, tailPivot };
}

/**
 * Sculpted coastal seagull (perched or soaring).
 */
export function createSeagullGroup(
	bag: DisposerBag,
	mats: CityMaterialLibrary,
	soaring = false
): { group: THREE.Group; leftWing?: THREE.Mesh; rightWing?: THREE.Mesh } {
	const group = new THREE.Group();
	const bodyGeo = bag.track(new THREE.SphereGeometry(0.11, 8, 8));
	bodyGeo.scale(0.75, 0.8, 1.45);
	const body = new THREE.Mesh(bodyGeo, mats.gullWhite);
	body.position.y = soaring ? 0 : 0.12;
	body.castShadow = true;
	group.add(body);

	const beakGeo = bag.track(new THREE.ConeGeometry(0.028, 0.1, 6));
	beakGeo.rotateX(Math.PI * 0.5);
	const beak = new THREE.Mesh(beakGeo, mats.vendingOrangeBody);
	beak.position.set(0, soaring ? 0.03 : 0.16, 0.19);
	group.add(beak);

	if (soaring) {
		const wingGeo = bag.track(new THREE.BoxGeometry(0.36, 0.02, 0.14));
		wingGeo.translate(0.18, 0, 0);
		const rightWing = new THREE.Mesh(wingGeo, mats.gullWhite);
		const leftGeo = bag.track(new THREE.BoxGeometry(0.36, 0.02, 0.14));
		leftGeo.translate(-0.18, 0, 0);
		const leftWing = new THREE.Mesh(leftGeo, mats.gullWhite);
		group.add(leftWing, rightWing);
		return { group, leftWing, rightWing };
	}

	return { group };
}

/**
 * Handcrafted clay stop-motion citizen / player traveler figurine!
 */
export function createClayCitizenGroup(
	bag: DisposerBag,
	coatHex: string,
	hatHex: string,
	mats: CityMaterialLibrary,
	withLantern = false,
	seed = 111
): { group: THREE.Group; lanternLightAnchor?: THREE.Object3D } {
	const group = new THREE.Group();

	const coatGeo = bag.track(new THREE.ConeGeometry(0.2, 0.52, 10));
	coatGeo.translate(0, 0.3, 0);
	sculptClayGeometry(coatGeo, { seed, wobbleAmp: 0.01, tintHex: coatHex });
	const coat = new THREE.Mesh(coatGeo, mats.clayFoliage);
	coat.castShadow = true;
	group.add(coat);

	const headGeo = bag.track(new THREE.SphereGeometry(0.115, 10, 10));
	sculptClayGeometry(headGeo, { seed: seed + 3, wobbleAmp: 0.005, tintHex: '#f2d2b6' });
	const head = new THREE.Mesh(headGeo, mats.clayFoliage);
	head.position.y = 0.64;
	head.castShadow = true;
	group.add(head);

	// Scarf
	const scarfGeo = bag.track(new THREE.TorusGeometry(0.1, 0.032, 6, 12));
	scarfGeo.rotateX(Math.PI * 0.5);
	sculptClayGeometry(scarfGeo, { seed: seed + 5, wobbleAmp: 0.004, tintHex: '#e05a47' });
	const scarf = new THREE.Mesh(scarfGeo, mats.clayFoliage);
	scarf.position.y = 0.54;
	group.add(scarf);

	// Storybook pointed / brimmed hat
	const hatGeo = bag.track(new THREE.ConeGeometry(0.15, 0.22, 10));
	hatGeo.translate(0, 0.11, 0);
	sculptClayGeometry(hatGeo, { seed: seed + 9, wobbleAmp: 0.008, tintHex: hatHex });
	const hat = new THREE.Mesh(hatGeo, mats.clayFoliage);
	hat.position.y = 0.71;
	hat.rotation.z = -0.12;
	hat.castShadow = true;
	group.add(hat);

	if (withLantern) {
		const armGeo = bag.track(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6));
		armGeo.rotateX(Math.PI * 0.42);
		const arm = new THREE.Mesh(armGeo, mats.woodWarmOak);
		arm.position.set(0.16, 0.44, 0.14);
		group.add(arm);

		const miniLantern = createHangingLanternGroup(bag, 0.36, 0.06, mats, seed + 21);
		miniLantern.position.set(0.18, 0.46, 0.25);
		group.add(miniLantern);
		return { group, lanternLightAnchor: miniLantern };
	}

	return { group };
}
