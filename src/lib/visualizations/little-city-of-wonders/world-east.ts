import * as THREE from 'three';
import {
	createAcUnitGroup,
	createArchedDoorGroup,
	createCatenaryCableMesh,
	createCliffCragMesh,
	createCrookedBoxMesh,
	createFoliageClusterGroup,
	createFramedWindowGroup,
	createGableRoofGroup,
	createHangingLanternGroup,
	createHipRoofMesh,
	createRoundWindowGroup,
	createSteppedPathGroup,
	createUtilityPoleGroup,
	createVendingMachineGroup,
	createWitchHatSpireMesh,
	sculptClayGeometry,
	type DisposerBag
} from './craft-geometry';
import type { CityMaterialLibrary } from './materials';
import { lerp } from './prng';
import type { Vec3 } from './types';
import { sampleBaseTerrainHeight, tagLandmark, tagSecret, tagWalkable } from './world-terrain';

export interface EastDistrictHandles {
	group: THREE.Group;
	swayingLanterns: THREE.Group[];
	steamEmitters: Vec3[];
}

export function buildEastDistricts(
	bag: DisposerBag,
	mats: CityMaterialLibrary
): EastDistrictHandles {
	const group = new THREE.Group();
	const swayingLanterns: THREE.Group[] = [];
	const steamEmitters: Vec3[] = [];

	// =========================================================================
	// DISTRICT 4: THE LANTERN DISTRICT (Apothecary, Crag of Nine Lanterns, Bridge)
	// =========================================================================

	// 4A. The Apothecary of Red Eaves (Ref 5 Hero!) at (9.2, y, -6.0)
	const apoRoot = new THREE.Group();
	const apoY = sampleBaseTerrainHeight(9.2, -6.0);
	apoRoot.position.set(9.2, apoY, -6.0);
	apoRoot.rotation.y = -0.35; // Faces SW toward Red-Eave Alley!

	// Dark aged cedar ground shopfront + crackled cream plaster upper story
	const apoLower = createCrookedBoxMesh(bag, 3.05, 2.55, 2.65, mats.woodDarkCharred, {
		seed: 501,
		wobbleAmp: 0.025
	});
	apoRoot.add(apoLower);

	const apoUpper = createCrookedBoxMesh(bag, 2.75, 2.45, 2.35, mats.plasterCream, {
		seed: 502,
		leanX: -0.05,
		wobbleAmp: 0.028
	});
	apoUpper.position.set(0.12, 2.52, -0.05);
	apoRoot.add(apoUpper);

	// Sweeping upturned vermilion-red pagoda roofs (lower skirt + main upper roof + attic!)
	const apoSkirtRoof = createGableRoofGroup(
		bag,
		3.45,
		0.72,
		3.1,
		mats.roofVermilion,
		mats.woodDarkCharred,
		{ seed: 505, overhang: 0.42, upturnEaves: 0.28, ridgeSag: 0.06 }
	);
	apoSkirtRoof.position.set(0, 2.38, 0);
	apoRoot.add(apoSkirtRoof);

	const apoTopRoof = createGableRoofGroup(
		bag,
		3.15,
		1.15,
		2.75,
		mats.roofVermilion,
		mats.woodDarkCharred,
		{ seed: 506, overhang: 0.48, upturnEaves: 0.36, ridgeSag: 0.08 }
	);
	apoTopRoof.position.set(0.12, 4.92, -0.05);
	apoRoot.add(apoTopRoof);

	// Rooftop herb box + lush green plants + tall banded brick chimney on right!
	const herbBox = createCrookedBoxMesh(bag, 1.15, 0.38, 0.68, mats.woodWarmOak, { seed: 509 });
	herbBox.position.set(-0.2, 6.02, -0.05);
	apoRoot.add(herbBox);
	const rooftopHerbs = createFoliageClusterGroup(
		bag,
		9,
		[0.48, 0.24, 0.28],
		['#4b8542', '#68a656', '#82bd68'],
		mats.clayFoliage,
		510,
		0.15
	);
	rooftopHerbs.position.set(-0.2, 6.45, -0.05);
	apoRoot.add(rooftopHerbs);

	const apoChimney = new THREE.Mesh(
		sculptClayGeometry(bag.track(new THREE.CylinderGeometry(0.28, 0.34, 3.6, 12)), {
			seed: 512,
			wobbleAmp: 0.018
		}),
		mats.plasterPeelingBrick
	);
	apoChimney.position.set(1.42, 4.95, -0.55);
	apoChimney.castShadow = true;
	apoRoot.add(apoChimney);
	steamEmitters.push([10.5, apoY + 6.9, -6.5]);

	// Jade-green corrugated front awning + cluttered shop counter, barrels, crates & pumpkin!
	const jadeAwning = new THREE.Mesh(
		bag.track(new THREE.BoxGeometry(1.45, 0.06, 0.92)),
		mats.roofCorrugatedJade
	);
	jadeAwning.position.set(-0.45, 2.02, 1.62);
	jadeAwning.rotation.x = 0.36;
	apoRoot.add(jadeAwning);

	const counterShelf = createCrookedBoxMesh(bag, 1.72, 0.78, 0.48, mats.woodWarmOak, { seed: 516 });
	counterShelf.position.set(-0.55, 0, 1.48);
	apoRoot.add(counterShelf);

	// Coopered oak barrel + ceramic jars + tiny orange pumpkin!
	for (const [bx, bz] of [
		[1.22, 1.52],
		[-1.48, 1.45]
	]) {
		const barrel = new THREE.Mesh(
			sculptClayGeometry(bag.track(new THREE.CylinderGeometry(0.28, 0.25, 0.68, 12)), {
				seed: 520 + Math.round(bx * 10),
				bellyBulge: 0.16,
				wobbleAmp: 0.008
			}),
			mats.woodWarmOak
		);
		barrel.position.set(bx, 0.34, bz);
		barrel.castShadow = true;
		apoRoot.add(barrel);
	}

	const pumpkin = new THREE.Mesh(
		sculptClayGeometry(bag.track(new THREE.SphereGeometry(0.18, 10, 8)), {
			seed: 524,
			tintHex: '#e86f24',
			wobbleAmp: 0.01
		}),
		mats.clayFoliage
	);
	pumpkin.scale.set(1.15, 0.82, 1.15);
	pumpkin.position.set(0.12, 0.92, 1.52);
	apoRoot.add(pumpkin);

	// Upper & lower shop windows + plank door + hanging eave lantern
	const apoDoor = createArchedDoorGroup(
		bag,
		0.82,
		1.68,
		mats.woodWarmOak,
		mats.woodDarkCharred,
		mats,
		528
	);
	apoDoor.position.set(0.75, 0.02, 1.32);
	apoRoot.add(apoDoor);

	for (const [wx, wy] of [
		[-0.55, 1.35],
		[-0.35, 3.65],
		[0.85, 3.65]
	]) {
		const aw = createFramedWindowGroup(bag, 0.85, 0.98, mats, {
			frameMat: mats.woodDarkCharred,
			seed: 530 + Math.round(wx * 10 + wy)
		});
		aw.position.set(wx, wy, 1.16 + (wy < 2 ? 0.16 : 0));
		apoRoot.add(aw);
	}

	const eaveLantern = createHangingLanternGroup(bag, 0.76, 0.85, mats, 536);
	eaveLantern.position.set(1.88, 2.55, 1.15);
	swayingLanterns.push(eaveLantern);
	apoRoot.add(eaveLantern);

	// Crooked timber utility pole on front-left corner!
	const apoPole = createUtilityPoleGroup(bag, 6.2, mats, { timber: true, seed: 540 });
	apoPole.group.position.set(-2.15, 0, 1.55);
	apoRoot.add(apoPole.group);

	tagLandmark(apoRoot, 'apothecary-red-eaves');

	// SECRET #6: Bioluminescent Jar of Captured Fireflies on the wooden shop counter!
	const fireflyJar = new THREE.Group();
	fireflyJar.position.set(-0.35, 0.94, 1.55);
	const jarGlass = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 10)),
		mats.fireflyJarGlow
	);
	fireflyJar.add(jarGlass);
	const cork = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.09, 0.08, 0.07, 8)),
		mats.woodWarmOak
	);
	cork.position.y = 0.16;
	fireflyJar.add(cork);
	tagSecret(fireflyJar, 'glowing-jar');
	apoRoot.add(fireflyJar);

	group.add(apoRoot);

	// 4B. The Crag of Nine Lanterns (Ref 8 Hero!) at (15.8, 0, -14.5)
	const cragRoot = new THREE.Group();
	cragRoot.position.set(15.8, 0, -14.5);
	cragRoot.rotation.y = -0.55; // Faces SW toward canal & plaza!

	// Twin dark jagged rock pinnacles!
	const mainSpireRock = createCliffCragMesh(
		bag,
		2.85,
		5.85,
		2.65,
		mats.stoneDarkCrag,
		550,
		0.82,
		0.68
	);
	cragRoot.add(mainSpireRock);

	const sideSpireRock = createCliffCragMesh(
		bag,
		1.45,
		7.25,
		1.35,
		mats.stoneDarkCrag,
		555,
		0.85,
		0.45
	);
	sideSpireRock.position.set(2.55, 0.8, 0.35);
	cragRoot.add(sideSpireRock);

	// Stacked dark-timber crooked rookery houses & pointed turrets (Ref 8 silhouette!)
	const cragBlocks: Array<{
		x: number;
		y: number;
		z: number;
		w: number;
		h: number;
		d: number;
		spire?: boolean;
	}> = [
		{ x: -0.35, y: 5.75, z: 0.35, w: 2.35, h: 2.6, d: 2.15 },
		{ x: 0.55, y: 6.05, z: -0.35, w: 1.85, h: 3.4, d: 1.85 },
		{ x: -0.55, y: 8.2, z: -0.1, w: 1.75, h: 3.8, d: 1.75 },
		{ x: -0.45, y: 11.8, z: -0.1, w: 1.35, h: 2.9, d: 1.35, spire: true },
		{ x: 0.75, y: 9.2, z: -0.2, w: 1.4, h: 2.2, d: 1.4, spire: true },
		{ x: 2.55, y: 7.2, z: 0.35, w: 1.45, h: 2.15, d: 1.45, spire: true }
	];

	for (const [idx, blk] of cragBlocks.entries()) {
		const box = createCrookedBoxMesh(bag, blk.w, blk.h, blk.d, mats.woodDarkCharred, {
			seed: 560 + idx * 7,
			leanX: (idx % 2 === 0 ? 1 : -1) * 0.06,
			wobbleAmp: 0.025
		});
		box.position.set(blk.x, blk.y, blk.z);
		cragRoot.add(box);

		if (blk.spire) {
			const sp = createWitchHatSpireMesh(
				bag,
				blk.w * 0.78,
				2.15,
				mats.roofCharcoalShingle,
				0.14,
				-0.1,
				6,
				570 + idx
			);
			sp.position.set(blk.x, blk.y + blk.h - 0.05, blk.z);
			cragRoot.add(sp);
		} else {
			const rf = createGableRoofGroup(
				bag,
				blk.w + 0.15,
				0.88,
				blk.d + 0.15,
				mats.roofCharcoalShingle,
				mats.woodDarkCharred,
				{ seed: 575 + idx, upturnEaves: 0.15 }
			);
			rf.position.set(blk.x, blk.y + blk.h - 0.05, blk.z);
			cragRoot.add(rf);
		}

		// Warm glowing amber windows on front & side of each crooked block!
		for (const faceYaw of [0, Math.PI * 0.5, -Math.PI * 0.5]) {
			const win = createFramedWindowGroup(bag, 0.52, 0.76, mats, {
				frameMat: mats.woodDarkCharred,
				glassMat: mats.windowAmberPane,
				seed: 580 + idx * 11 + Math.round(faceYaw * 10)
			});
			const dist = (faceYaw === 0 ? blk.d : blk.w) * 0.5 + 0.02;
			win.position.set(
				blk.x + Math.sin(faceYaw) * dist,
				blk.y + blk.h * 0.54,
				blk.z + Math.cos(faceYaw) * dist
			);
			win.rotation.y = faceYaw;
			cragRoot.add(win);
		}
	}

	// Bare gnarled winter branches + 9 Chain-Suspended Glowing Amber Lanterns!
	const lanternSpecs: Array<{ pos: Vec3; chain: number; scale: number; secret?: boolean }> = [
		{ pos: [-2.35, 8.6, 0.45], chain: 2.1, scale: 1.05 },
		{ pos: [-1.85, 7.8, 1.35], chain: 2.8, scale: 0.95 },
		{ pos: [2.25, 6.2, 1.45], chain: 2.5, scale: 1.1 },
		{ pos: [3.65, 8.1, 0.55], chain: 1.9, scale: 1.0, secret: true },
		{ pos: [1.55, 5.6, 1.85], chain: 3.1, scale: 0.9 },
		{ pos: [-1.45, 11.2, 0.65], chain: 1.4, scale: 0.85 },
		{ pos: [1.65, 10.6, -0.4], chain: 1.5, scale: 0.85 },
		{ pos: [0.25, 5.9, 2.05], chain: 1.6, scale: 0.9 },
		{ pos: [2.85, 9.4, -0.35], chain: 1.7, scale: 0.88 }
	];

	for (const [idx, sp] of lanternSpecs.entries()) {
		// Supporting horizontal timber bracket / branch
		const beamCurve = new THREE.CatmullRomCurve3([
			new THREE.Vector3(sp.pos[0] * 0.45, sp.pos[1] - 0.25, sp.pos[2] * 0.45),
			new THREE.Vector3(sp.pos[0], sp.pos[1], sp.pos[2])
		]);
		const branchMesh = new THREE.Mesh(
			bag.track(new THREE.TubeGeometry(beamCurve, 6, 0.055, 5, false)),
			mats.woodDarkCharred
		);
		cragRoot.add(branchMesh);

		const ltn = createHangingLanternGroup(bag, sp.scale, sp.chain, mats, 610 + idx * 9);
		ltn.position.set(sp.pos[0], sp.pos[1], sp.pos[2]);
		swayingLanterns.push(ltn);
		cragRoot.add(ltn);

		if (sp.secret) {
			tagSecret(ltn, 'edge-lantern');
		}
	}

	tagLandmark(cragRoot, 'crag-of-nine-lanterns');
	// Re-apply secret tag on the 4th lantern so tagLandmark didn't clear its distinction
	const secretLtn = swayingLanterns[4]; // index 4 in array (1 from apo + index 3 from crag)
	if (secretLtn) tagSecret(secretLtn, 'edge-lantern');

	group.add(cragRoot);

	// 4C. The Crimson Moon-Bridge & Stone Toro Lanterns at (11.2, 0.72, -8.4)
	const moonBridge = new THREE.Group();
	moonBridge.position.set(11.2, 0.72, -8.4);
	moonBridge.rotation.y = 0.65;

	for (let i = 0; i <= 10; i++) {
		const u = i / 10;
		const bz = lerp(-1.85, 1.85, u);
		const by = Math.sin(u * Math.PI) * 0.72;
		const plank = createCrookedBoxMesh(bag, 1.65, 0.1, 0.36, mats.roofVermilion, {
			seed: 640 + i,
			wobbleAmp: 0.008
		});
		plank.position.set(0, by, bz);
		tagWalkable(plank);
		moonBridge.add(plank);

		if (i % 2 === 0) {
			for (const sx of [-0.78, 0.78]) {
				const post = createCrookedBoxMesh(bag, 0.08, 0.58, 0.08, mats.roofVermilion, {
					seed: 655 + i
				});
				post.position.set(sx, by + 0.05, bz);
				moonBridge.add(post);
			}
		}
	}

	// Twin carved stone Toro pedestal lanterns
	for (const tz of [-2.15, 2.15]) {
		const ped = createCrookedBoxMesh(bag, 0.34, 0.78, 0.34, mats.stoneCliff, { seed: 670 });
		ped.position.set(-1.12, 0, tz);
		moonBridge.add(ped);
		const fireBox = new THREE.Mesh(
			bag.track(new THREE.BoxGeometry(0.28, 0.28, 0.28)),
			mats.lanternGlass
		);
		fireBox.position.set(-1.12, 0.92, tz);
		moonBridge.add(fireBox);
		const cap = createHipRoofMesh(bag, 0.52, 0.24, 0.52, mats.stoneCliff, 672, 0.06);
		cap.position.set(-1.12, 1.06, tz);
		moonBridge.add(cap);
	}

	tagLandmark(moonBridge, 'crimson-moon-bridge');
	group.add(moonBridge);

	// =========================================================================
	// DISTRICT 5: THE COLORFUL URBAN QUARTER (Denki-Cho Corner, Maru-Mado, Vinyl)
	// =========================================================================

	// 5A. Ramen & Lemonade Corner Stack (Ref 6 Hero!) at (9.8, y, 4.4)
	const ramenRoot = new THREE.Group();
	const ramenY = sampleBaseTerrainHeight(9.8, 4.4);
	ramenRoot.position.set(9.8, ramenY, 4.4);
	ramenRoot.rotation.y = -2.35; // Faces NW toward Canal Bridge & Street!

	// 3-story saturated mustard-yellow stack + 2.5-story dusty-pink side stack!
	const yellowStack = createCrookedBoxMesh(bag, 2.25, 6.85, 2.25, mats.plasterMustard, {
		seed: 701,
		leanX: -0.04,
		wobbleAmp: 0.025
	});
	yellowStack.position.set(0.55, 0.18, 0);
	ramenRoot.add(yellowStack);

	const pinkStack = createCrookedBoxMesh(bag, 1.55, 4.65, 2.05, mats.plasterDustyPink, {
		seed: 702,
		leanX: 0.05,
		wobbleAmp: 0.025
	});
	pinkStack.position.set(-1.18, 0.18, 0.12);
	ramenRoot.add(pinkStack);

	// Concrete sidewalk plinth + 3 front steps
	const stepPad = createCrookedBoxMesh(bag, 4.2, 0.2, 2.8, mats.stoneTravertine, { seed: 704 });
	stepPad.position.set(-0.2, 0, 0.15);
	ramenRoot.add(stepPad);

	// Hip roof on yellow stack + oxidized teal corrugated awnings!
	const ramenRoof = createHipRoofMesh(bag, 2.4, 0.68, 2.4, mats.roofTerracotta, 706, 0.25);
	ramenRoof.position.set(0.55, 7.02, 0);
	ramenRoot.add(ramenRoof);

	const pinkCapRoof = new THREE.Mesh(
		bag.track(new THREE.BoxGeometry(1.75, 0.09, 2.25)),
		mats.roofCorrugatedTeal
	);
	pinkCapRoof.position.set(-1.18, 4.86, 0.12);
	pinkCapRoof.rotation.z = 0.08;
	ramenRoot.add(pinkCapRoof);

	for (const [ax, ay, az, matAwn] of [
		[-1.18, 2.25, 1.38, mats.roofCorrugatedTeal],
		[0.45, 2.32, 1.38, mats.roofCorrugatedTeal],
		[1.45, 2.22, 1.38, mats.plasterCoral]
	] as const) {
		const awn = new THREE.Mesh(bag.track(new THREE.BoxGeometry(1.25, 0.06, 0.75)), matAwn);
		awn.position.set(ax, ay, az);
		awn.rotation.x = 0.34;
		awn.castShadow = true;
		ramenRoot.add(awn);
	}

	// Red front shop door + white noren curtain + yellow A-frame chalkboard sign!
	const redShopDoor = createCrookedBoxMesh(bag, 0.82, 1.78, 0.08, mats.woodRedDoor, { seed: 710 });
	redShopDoor.position.set(0.35, 0.2, 1.12);
	ramenRoot.add(redShopDoor);

	const noren = createCrookedBoxMesh(bag, 0.72, 0.42, 0.04, mats.plasterCream, { seed: 711 });
	noren.position.set(0.35, 1.56, 1.2);
	ramenRoot.add(noren);

	const aFrame = createCrookedBoxMesh(bag, 0.48, 0.68, 0.28, mats.plasterMustard, {
		seed: 712,
		taperTop: -0.65
	});
	aFrame.position.set(-0.75, 0.2, 1.55);
	ramenRoot.add(aFrame);

	// Exterior AC condenser units + rooftop crossed Yagi TV aerials!
	const ac1 = createAcUnitGroup(bag, mats, 715);
	ac1.position.set(-0.35, 2.85, 1.24);
	ramenRoot.add(ac1);
	const ac2 = createAcUnitGroup(bag, mats, 716);
	ac2.position.set(1.15, 4.95, 1.24);
	ramenRoot.add(ac2);

	for (const antX of [0.1, 0.95]) {
		const mast = new THREE.Mesh(
			bag.track(new THREE.CylinderGeometry(0.02, 0.025, 1.45, 5)),
			mats.metalAgedTin
		);
		mast.position.set(antX, 8.15, 0);
		ramenRoot.add(mast);
		const cross = new THREE.Mesh(
			bag.track(new THREE.BoxGeometry(0.85, 0.025, 0.025)),
			mats.metalAgedTin
		);
		cross.position.set(antX, 8.72, 0);
		cross.rotation.y = antX;
		ramenRoot.add(cross);
	}

	// Upper & rear/side wrap-around windows so all 360° angles glow warmly!
	for (const [wx, wy, wz, ry] of [
		[0.55, 3.65, 1.14, 0],
		[0.55, 5.68, 1.14, 0],
		[-1.18, 3.55, 1.16, 0],
		[0.55, 3.65, -1.14, Math.PI],
		[0.55, 5.68, -1.14, Math.PI],
		[-1.18, 3.15, -0.92, Math.PI],
		[1.69, 4.45, 0, Math.PI * 0.5]
	]) {
		const rw = createFramedWindowGroup(bag, 0.88, 0.95, mats, {
			frameMat: mats.woodDarkCharred,
			flowerPalette: ['#528548', '#f06292'],
			seed: 720 + Math.round(wy * 7 + ry * 3)
		});
		rw.position.set(wx, wy, wz);
		rw.rotation.y = ry;
		ramenRoot.add(rw);
	}

	// Concrete utility pole with vertical glowing Orange Kanji Sign!
	const ramenPole = createUtilityPoleGroup(bag, 7.6, mats, { neonSign: true, seed: 730 });
	ramenPole.group.position.set(2.05, 0, 1.35);
	ramenRoot.add(ramenPole.group);

	tagLandmark(ramenRoot, 'ramen-lemonade-corner');

	// SECRET #4: Bright Orange Drink Vending Machine ("Button #13: Bottled Starlight Soda")!
	const orangeVm = createVendingMachineGroup(bag, true, mats, 735);
	orangeVm.position.set(1.38, 0.2, 1.28);
	tagSecret(orangeVm, 'mystery-vending');
	ramenRoot.add(orangeVm);

	group.add(ramenRoot);

	// 5B. Turquoise Izakaya & Maru-Mado Loft (Ref 7 Hero!) at (15.4, y, 9.8)
	const loftRoot = new THREE.Group();
	const loftY = sampleBaseTerrainHeight(15.4, 9.8);
	loftRoot.position.set(15.4, loftY, 9.8);
	loftRoot.rotation.y = -2.1; // Faces West toward Denki-Cho street!

	// Ground peeling cream plaster + upper two stories in sea-weathered turquoise planks!
	const loftGround = createCrookedBoxMesh(bag, 2.85, 2.45, 2.55, mats.plasterCream, {
		seed: 750,
		wobbleAmp: 0.025
	});
	loftRoot.add(loftGround);

	const loftMid = createCrookedBoxMesh(bag, 2.75, 2.35, 2.45, mats.woodTurquoise, {
		seed: 751,
		leanX: 0.04,
		wobbleAmp: 0.025
	});
	loftMid.position.set(0.05, 2.42, 0);
	loftRoot.add(loftMid);

	const loftTop = createCrookedBoxMesh(bag, 2.85, 2.55, 2.48, mats.woodTurquoise, {
		seed: 752,
		leanX: -0.04,
		wobbleAmp: 0.025
	});
	loftTop.position.set(0, 4.72, 0);
	loftRoot.add(loftTop);

	// Slanted mossy shingle shed roof + parabolic satellite dish!
	const shedRoofGeo = bag.track(new THREE.BoxGeometry(3.35, 0.14, 2.95, 4, 1, 4));
	sculptClayGeometry(shedRoofGeo, { seed: 755, wobbleAmp: 0.02 });
	const shedRoof = new THREE.Mesh(shedRoofGeo, mats.roofCharcoalShingle);
	shedRoof.position.set(0, 7.38, 0);
	shedRoof.rotation.z = -0.18;
	shedRoof.castShadow = true;
	loftRoot.add(shedRoof);

	const roofMoss = createFoliageClusterGroup(
		bag,
		8,
		[1.1, 0.08, 0.9],
		['#5a8248', '#739c58'],
		mats.clayFoliage,
		757,
		0.14
	);
	roofMoss.position.set(-0.2, 7.52, 0);
	loftRoot.add(roofMoss);

	// Parabolic satellite dish on right corner pole!
	const dishPole = createUtilityPoleGroup(bag, 8.1, mats, { timber: false, seed: 760 });
	dishPole.group.position.set(1.85, 0, 1.32);
	const dish = new THREE.Mesh(
		bag.track(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)),
		mats.metalAgedTin
	);
	dish.rotation.x = 1.1;
	dish.rotation.z = 0.4;
	dish.position.set(0, 8.2, 0.15);
	dishPole.group.add(dish);
	loftRoot.add(dishPole.group);

	// Exterior wooden staircase climbing left side to top-floor doorway + Iconic Round Maru-Mado Window!
	const extStairs = createSteppedPathGroup(
		bag,
		[
			[-0.55, 2.45, 1.52],
			[-1.25, 4.72, 1.52]
		],
		0.65,
		mats.woodWarmOak,
		764
	);
	loftRoot.add(extStairs);

	const maruMado = createRoundWindowGroup(bag, 0.42, mats, mats.woodWarmOak, true);
	maruMado.position.set(-0.32, 5.95, 1.25);
	loftRoot.add(maruMado);

	const upperBalconyWin = createFramedWindowGroup(bag, 0.98, 1.22, mats, {
		frameMat: mats.woodWarmOak,
		seed: 768
	});
	upperBalconyWin.position.set(0.75, 5.88, 1.25);
	loftRoot.add(upperBalconyWin);

	const midShopWin = createFramedWindowGroup(bag, 1.05, 1.05, mats, {
		frameMat: mats.woodWarmOak,
		seed: 770
	});
	midShopWin.position.set(0.68, 3.55, 1.24);
	loftRoot.add(midShopWin);

	// Wrap-around glowing windows & hanging lanterns on rear/side of Turquoise Loft too!
	for (const [wx, wy, wz, ry] of [
		[0.45, 5.75, -1.25, Math.PI],
		[-0.55, 3.55, -1.24, Math.PI],
		[0.2, 1.25, -1.28, Math.PI],
		[1.44, 5.75, 0, Math.PI * 0.5],
		[1.4, 3.55, 0, Math.PI * 0.5]
	]) {
		const bw = createFramedWindowGroup(bag, 0.86, 1.0, mats, {
			frameMat: mats.woodWarmOak,
			flowerPalette: ['#4d8546', '#f2be42'],
			seed: 771 + Math.round(wy * 5 + ry * 2)
		});
		bw.position.set(wx, wy, wz);
		bw.rotation.y = ry;
		loftRoot.add(bw);
	}

	// Ground Izakaya warm entrance + teal awning + glowing red & cream paper chōchin lanterns + white vending machine!
	const izaAwning = new THREE.Mesh(
		bag.track(new THREE.BoxGeometry(1.58, 0.07, 0.88)),
		mats.roofCorrugatedTeal
	);
	izaAwning.position.set(0.62, 2.08, 1.58);
	izaAwning.rotation.x = 0.35;
	loftRoot.add(izaAwning);

	const izaDoor = createFramedWindowGroup(bag, 1.12, 1.75, mats, {
		frameMat: mats.woodWarmOak,
		glassMat: mats.windowAmberPane,
		seed: 774
	});
	izaDoor.position.set(0.62, 1.02, 1.28);
	loftRoot.add(izaDoor);

	const redChochin = new THREE.Mesh(
		bag.track(new THREE.SphereGeometry(0.2, 10, 10)),
		mats.paperLanternRed
	);
	redChochin.scale.set(0.85, 1.25, 0.85);
	redChochin.position.set(1.42, 1.72, 1.65);
	loftRoot.add(redChochin);

	const creamChochin = new THREE.Mesh(
		bag.track(new THREE.SphereGeometry(0.18, 10, 10)),
		mats.paperLanternCream
	);
	creamChochin.scale.set(0.85, 1.3, 0.85);
	creamChochin.position.set(-0.08, 1.68, 1.65);
	loftRoot.add(creamChochin);

	const whiteVm = createVendingMachineGroup(bag, false, mats, 778);
	whiteVm.position.set(-0.98, 0.02, 1.36);
	loftRoot.add(whiteVm);

	tagLandmark(loftRoot, 'turquoise-maru-mado-loft');
	group.add(loftRoot);

	// 5C. Vinyl & Tangled-Wire Alley Shop at (9.2, y, 14.2)
	const vinylRoot = new THREE.Group();
	const vinylY = sampleBaseTerrainHeight(9.2, 14.2);
	vinylRoot.position.set(9.2, vinylY, 14.2);
	vinylRoot.rotation.y = 2.75;

	const vinylLower = createCrookedBoxMesh(bag, 2.35, 2.4, 2.15, mats.plasterCoral, {
		seed: 785,
		wobbleAmp: 0.025
	});
	vinylRoot.add(vinylLower);

	const vinylUpper = createCrookedBoxMesh(bag, 2.25, 2.35, 2.05, mats.plasterSage, {
		seed: 786,
		leanZ: 0.05,
		wobbleAmp: 0.025
	});
	vinylUpper.position.y = 2.38;
	vinylRoot.add(vinylUpper);

	const vinylRoof = createGableRoofGroup(
		bag,
		2.45,
		0.88,
		2.25,
		mats.roofCorrugatedTeal,
		mats.woodWarmOak,
		{
			seed: 788
		}
	);
	vinylRoof.position.y = 4.72;
	vinylRoot.add(vinylRoof);

	for (const [wx, wy] of [
		[0, 3.55],
		[-0.55, 1.25]
	]) {
		const vw = createFramedWindowGroup(bag, 0.88, 1.02, mats, {
			shutters: true,
			shutterMat: mats.plasterMustard,
			seed: 790 + wy * 5
		});
		vw.position.set(wx, wy, 1.08);
		vinylRoot.add(vw);
	}
	const vinylDoor = createArchedDoorGroup(
		bag,
		0.78,
		1.62,
		mats.woodBlueDoor,
		mats.stoneTravertine,
		mats,
		795
	);
	vinylDoor.position.set(0.62, 0.02, 1.08);
	vinylRoot.add(vinylDoor);

	const vinylPole = createUtilityPoleGroup(bag, 6.4, mats, { timber: true, seed: 798 });
	vinylPole.group.position.set(-1.65, 0, 1.25);
	vinylRoot.add(vinylPole.group);

	tagLandmark(vinylRoot, 'tangled-wire-vinyl-alley');
	// Also add rear/side glowing windows on Vinyl shop so overview side shines!
	for (const [wy, ry, wz] of [
		[3.55, Math.PI, -1.04],
		[1.25, Math.PI, -1.08]
	]) {
		const rvw = createFramedWindowGroup(bag, 0.85, 0.98, mats, {
			shutters: true,
			shutterMat: mats.plasterMustard,
			flowerPalette: ['#e85d99', '#528548'],
			seed: 799 + wy
		});
		rvw.position.set(0, wy, wz);
		rvw.rotation.y = ry;
		vinylRoot.add(rvw);
	}
	group.add(vinylRoot);

	// Additional snug crooked infill shop-houses giving Denki-Cho & Gorge dense storybook charm!
	for (const [idx, inf] of [
		{
			x: 14.8,
			z: 3.2,
			rot: -1.8,
			w: 2.1,
			h: 4.6,
			d: 1.95,
			mat: mats.plasterOchre,
			roof: mats.roofVermilion
		},
		{
			x: 15.2,
			z: 15.2,
			rot: 2.4,
			w: 2.2,
			h: 4.2,
			d: 2.0,
			mat: mats.plasterDustyPink,
			roof: mats.roofSlateBlue
		},
		{
			x: 14.2,
			z: -3.2,
			rot: -0.9,
			w: 2.0,
			h: 4.8,
			d: 1.9,
			mat: mats.woodDarkCharred,
			roof: mats.roofVermilion
		}
	].entries()) {
		const iy = sampleBaseTerrainHeight(inf.x, inf.z);
		const infGrp = new THREE.Group();
		infGrp.position.set(inf.x, iy, inf.z);
		infGrp.rotation.y = inf.rot;
		const body = createCrookedBoxMesh(bag, inf.w, inf.h, inf.d, inf.mat, {
			seed: 1300 + idx * 11,
			leanX: (idx % 2 === 0 ? 1 : -1) * 0.06,
			wobbleAmp: 0.025
		});
		infGrp.add(body);
		const rf = createGableRoofGroup(
			bag,
			inf.w + 0.2,
			0.95,
			inf.d + 0.2,
			inf.roof,
			mats.woodWarmOak,
			{
				seed: 1305 + idx,
				upturnEaves: 0.18
			}
		);
		rf.position.y = inf.h;
		infGrp.add(rf);
		for (const face of [1, -1] as const) {
			const w = createFramedWindowGroup(bag, 0.72, 0.92, mats, {
				flowerPalette: ['#e85d99', '#6da15a'],
				seed: 1310 + idx * 5 + face
			});
			w.position.set(0, inf.h * 0.62, face * (inf.d * 0.5 + 0.02));
			if (face < 0) w.rotation.y = Math.PI;
			infGrp.add(w);
		}
		group.add(infGrp);
	}

	// =========================================================================
	// OVERHEAD SAGGING CATENARY POWER LINES LINKING DENKI-CHO & RED-EAVE ALLEY!
	// =========================================================================
	const poleTops: Vec3[] = [
		[7.3, apoY + 5.75, -4.2], // Apothecary pole
		[8.6, ramenY + 7.1, 2.8], // Ramen corner pole
		[14.2, loftY + 7.45, 8.2], // Turquoise loft pole
		[10.4, vinylY + 5.95, 13.0] // Vinyl alley pole
	];

	for (let i = 0; i < poleTops.length - 1; i++) {
		const pA = poleTops[i];
		const pB = poleTops[i + 1];
		for (const [off, sag] of [
			[-0.28, 0.65],
			[0.05, 0.88],
			[0.32, 0.52]
		]) {
			const wire = createCatenaryCableMesh(
				bag,
				[pA[0] + off, pA[1], pA[2]],
				[pB[0] + off, pB[1] - 0.35, pB[2]],
				sag,
				0.016,
				mats.metalIron,
				14
			);
			group.add(wire);
		}
	}

	return {
		group,
		swayingLanterns,
		steamEmitters
	};
}
