import * as THREE from 'three';
import {
	createArchedDoorGroup,
	createCliffCragMesh,
	createCrookedBoxMesh,
	createFoliageClusterGroup,
	createFramedWindowGroup,
	createGableRoofGroup,
	createHangingLanternGroup,
	createHipRoofMesh,
	createMiniatureCatGroup,
	createRoundWindowGroup,
	createSeagullGroup,
	createSteppedPathGroup,
	createWitchHatSpireMesh,
	createWroughtBalconyGroup,
	sculptClayGeometry,
	type DisposerBag
} from './craft-geometry';
import type { CityMaterialLibrary } from './materials';
import type { Vec3 } from './types';
import { sampleBaseTerrainHeight, tagLandmark, tagSecret } from './world-terrain';

export interface WestDistrictHandles {
	group: THREE.Group;
	catTails: THREE.Group[];
	lighthouseRotor: THREE.Group;
	bobbingBoat: THREE.Group;
	steamEmitters: Vec3[];
}

export function buildWestDistricts(
	bag: DisposerBag,
	mats: CityMaterialLibrary
): WestDistrictHandles {
	const group = new THREE.Group();
	const catTails: THREE.Group[] = [];
	const steamEmitters: Vec3[] = [];

	// =========================================================================
	// DISTRICT 1: THE OLD TOWN (Casa del Gatto Nero, Baker's Arch, Piazza)
	// =========================================================================

	// 1A. Casa del Gatto Nero (Ref 1 Hero!) at (-14.5, y, -1.8), facing East (+X -> rotateY +PI/2)
	const casaRoot = new THREE.Group();
	const casaY = sampleBaseTerrainHeight(-14.5, -1.8);
	casaRoot.position.set(-14.5, casaY, -1.8);
	casaRoot.rotation.y = Math.PI * 0.5; // Front (+Z local) faces East toward Piazza!

	// Tall 4-story peeling plaster + brick tower on left, 3-story stepped wing on right
	const mainTower = createCrookedBoxMesh(bag, 2.35, 7.6, 2.45, mats.plasterPeelingBrick, {
		seed: 101,
		wobbleAmp: 0.032,
		leanX: 0.04,
		taperTop: -0.04
	});
	mainTower.position.set(-0.75, 0, 0);
	casaRoot.add(mainTower);

	const sideWing = createCrookedBoxMesh(bag, 2.1, 5.1, 2.25, mats.plasterPeelingBrick, {
		seed: 102,
		wobbleAmp: 0.03,
		leanX: -0.05
	});
	sideWing.position.set(1.15, 0, 0.08);
	casaRoot.add(sideWing);

	// Molded stone cornices between stories
	for (const cy of [2.5, 5.05, 7.52]) {
		const cornice = createCrookedBoxMesh(bag, 2.58, 0.14, 2.66, mats.stoneTravertine, {
			seed: 110 + Math.round(cy * 10),
			wobbleAmp: 0.01
		});
		cornice.position.set(-0.75, cy, 0);
		casaRoot.add(cornice);
	}

	// Terracotta hip roof + brick chimney on main tower
	const casaRoof = createHipRoofMesh(bag, 2.45, 1.15, 2.55, mats.roofTerracotta, 115, 0.28);
	casaRoof.position.set(-0.75, 7.6, 0);
	casaRoot.add(casaRoof);

	const chimney = createCrookedBoxMesh(bag, 0.46, 1.05, 0.42, mats.plasterPeelingBrick, {
		seed: 118,
		wobbleAmp: 0.012
	});
	chimney.position.set(-0.4, 8.35, -0.35);
	casaRoot.add(chimney);
	steamEmitters.push([-14.85, casaY + 9.45, -1.4]);

	// Sloped terracotta lean-to roof + wire rooftop pergola on side wing!
	const leanRoof = createGableRoofGroup(
		bag,
		2.15,
		0.58,
		2.3,
		mats.roofTerracotta,
		mats.stoneTravertine,
		{
			seed: 121,
			ridgeSag: 0.05
		}
	);
	leanRoof.position.set(1.15, 5.1, 0.08);
	casaRoot.add(leanRoof);

	// Tiny wrought-iron pergola above side roof with potted ferns
	for (const px of [0.55, 1.65]) {
		const pPost = new THREE.Mesh(
			bag.track(new THREE.CylinderGeometry(0.02, 0.02, 1.25, 6)),
			mats.metalIron
		);
		pPost.position.set(px, 6.1, 0.65);
		casaRoot.add(pPost);
	}
	const pergPlants = createFoliageClusterGroup(
		bag,
		8,
		[0.55, 0.22, 0.35],
		['#4d7c42', '#689c54', '#d64780'],
		mats.clayFoliage,
		125,
		0.14
	);
	pergPlants.position.set(1.1, 5.85, 0.45);
	casaRoot.add(pergPlants);

	// Arched cellar timber door on ground right + winding exterior staircase!
	const cellarDoor = createArchedDoorGroup(
		bag,
		0.86,
		1.65,
		mats.woodWarmOak,
		mats.stoneTravertine,
		mats,
		130
	);
	cellarDoor.position.set(1.2, 0.02, 1.21);
	casaRoot.add(cellarDoor);

	const casaStairs = createSteppedPathGroup(
		bag,
		[
			[-1.25, 0.08, 1.95],
			[-0.15, 0.92, 1.75],
			[0.85, 1.98, 1.55]
		],
		0.78,
		mats.woodWarmOak,
		134
	);
	casaRoot.add(casaStairs);

	// Second-floor arched loggia entrance + 2 overflowing bougainvillea balconies!
	const upperDoor = createArchedDoorGroup(
		bag,
		0.84,
		1.72,
		mats.woodWarmOak,
		mats.stoneTravertine,
		mats,
		138
	);
	upperDoor.position.set(1.15, 2.05, 1.21);
	casaRoot.add(upperDoor);

	const midBalcony = createWroughtBalconyGroup(
		bag,
		2.15,
		0.72,
		mats,
		['#d9387a', '#eb5c96', '#c22b68', '#4d7a42'],
		142
	);
	midBalcony.position.set(1.15, 3.85, 1.2);
	casaRoot.add(midBalcony);

	const topBalcony = createWroughtBalconyGroup(
		bag,
		1.45,
		0.64,
		mats,
		['#538246', '#6da15a', '#e8689a'],
		145
	);
	topBalcony.position.set(-0.75, 5.25, 1.23);
	casaRoot.add(topBalcony);

	// Iconic Mustard-Yellow Parlor Window + Ground Window with Cornice & PIPPO THE BLACK CAT!
	const yellowWin = createFramedWindowGroup(bag, 0.86, 1.28, mats, {
		frameMat: mats.plasterMustard,
		flowerPalette: ['#528244', '#6b9c56'],
		cornice: true,
		seed: 150
	});
	yellowWin.position.set(-0.75, 3.92, 1.24);
	casaRoot.add(yellowWin);

	const lowerWin = createFramedWindowGroup(bag, 0.84, 1.26, mats, {
		frameMat: mats.woodDarkCharred,
		flowerPalette: ['#e0628f'],
		cornice: true,
		seed: 155
	});
	lowerWin.position.set(-0.75, 1.78, 1.24);
	casaRoot.add(lowerWin);

	const topWin = createFramedWindowGroup(bag, 0.82, 1.38, mats, {
		frameMat: mats.woodRedDoor,
		cornice: true,
		seed: 158
	});
	topWin.position.set(-0.75, 6.22, 1.24);
	casaRoot.add(topWin);

	// Side windows so every facade has volumetric detail
	for (const sy of [1.8, 4.0, 6.2]) {
		const sw = createFramedWindowGroup(bag, 0.68, 1.1, mats, {
			flowerPalette: ['#4d7c42', '#d94882'],
			seed: 160 + sy * 5
		});
		sw.position.set(-1.94, sy, 0);
		sw.rotation.y = -Math.PI * 0.5;
		casaRoot.add(sw);
	}

	tagLandmark(casaRoot, 'casa-del-gatto-nero');

	// SECRET #1: Pippo the Black Cat perched on the lower window cornice!
	const pippo = createMiniatureCatGroup(bag, mats.catBlack);
	pippo.group.position.set(-0.72, 2.52, 1.34);
	pippo.group.rotation.y = 0.25;
	pippo.group.scale.setScalar(1.35);
	tagSecret(pippo.group, 'black-cat');
	catTails.push(pippo.tailPivot);
	casaRoot.add(pippo.group);

	group.add(casaRoot);

	// 1B. The Crooked Clock & Baker's Arch spanning the North Lane (-9.5, y, -4.4)
	const archHouseRoot = new THREE.Group();
	const archY = sampleBaseTerrainHeight(-9.5, -4.4);
	archHouseRoot.position.set(-9.5, archY, -4.4);

	const westHouse = createCrookedBoxMesh(bag, 2.25, 5.4, 2.55, mats.plasterDustyPink, {
		seed: 201,
		leanX: 0.08,
		wobbleAmp: 0.028
	});
	westHouse.position.set(-2.05, 0, 0);
	archHouseRoot.add(westHouse);

	const westRoof = createGableRoofGroup(
		bag,
		2.35,
		1.05,
		2.65,
		mats.roofTerracotta,
		mats.stoneTravertine,
		{
			seed: 202,
			ridgeSag: 0.09
		}
	);
	westRoof.position.set(-2.05, 5.4, 0);
	archHouseRoot.add(westRoof);

	const eastHouse = createCrookedBoxMesh(bag, 2.25, 4.9, 2.55, mats.plasterOchre, {
		seed: 205,
		leanX: -0.08,
		wobbleAmp: 0.028
	});
	eastHouse.position.set(2.05, 0, 0);
	archHouseRoot.add(eastHouse);

	const eastRoof = createHipRoofMesh(bag, 2.35, 1.0, 2.65, mats.roofTerracotta, 206, 0.26);
	eastRoof.position.set(2.05, 4.9, 0);
	archHouseRoot.add(eastRoof);

	// Overhead bridge room + vaulted stone archway (clear height 2.55m for walkers!)
	const bridgeRoom = createCrookedBoxMesh(bag, 2.1, 1.85, 2.05, mats.plasterCream, {
		seed: 210,
		wobbleAmp: 0.02
	});
	bridgeRoom.position.set(0, 2.65, 0);
	archHouseRoot.add(bridgeRoom);

	const bridgeRoof = createGableRoofGroup(
		bag,
		2.2,
		0.65,
		2.15,
		mats.roofTerracotta,
		mats.stoneTravertine,
		{
			seed: 212
		}
	);
	bridgeRoof.position.set(0, 4.5, 0);
	archHouseRoot.add(bridgeRoof);

	const stoneVaultGeo = bag.track(new THREE.TorusGeometry(1.02, 0.16, 8, 16, Math.PI));
	for (const vz of [-0.95, 0.95]) {
		const vMesh = new THREE.Mesh(stoneVaultGeo, mats.stoneTravertine);
		vMesh.position.set(0, 1.68, vz);
		archHouseRoot.add(vMesh);
	}

	// Off-kilter brass clock face on bridge room south facade
	const clockPlate = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 18)),
		mats.plasterCream
	);
	clockPlate.rotation.x = Math.PI * 0.5;
	clockPlate.position.set(0, 3.55, 1.05);
	archHouseRoot.add(clockPlate);
	const clockRim = new THREE.Mesh(
		bag.track(new THREE.TorusGeometry(0.46, 0.05, 8, 18)),
		mats.metalBrass
	);
	clockRim.position.set(0, 3.55, 1.08);
	archHouseRoot.add(clockRim);

	// Striped café awning + tiny bistro tables on south piazza side
	const awningGeo = bag.track(new THREE.BoxGeometry(2.1, 0.06, 1.05));
	const awning = new THREE.Mesh(awningGeo, mats.fabricStripedAwning);
	awning.position.set(2.05, 2.15, 1.65);
	awning.rotation.x = 0.34;
	awning.castShadow = true;
	archHouseRoot.add(awning);

	for (const tx of [1.55, 2.55]) {
		const tblTop = new THREE.Mesh(
			bag.track(new THREE.CylinderGeometry(0.32, 0.3, 0.05, 12)),
			mats.ceramicCream
		);
		tblTop.position.set(tx, 0.66, 1.95);
		tblTop.castShadow = true;
		archHouseRoot.add(tblTop);
		const tblPed = new THREE.Mesh(
			bag.track(new THREE.CylinderGeometry(0.04, 0.12, 0.64, 8)),
			mats.metalIron
		);
		tblPed.position.set(tx, 0.32, 1.95);
		archHouseRoot.add(tblPed);
	}

	for (const [wx, wy] of [
		[-2.05, 3.6],
		[-2.05, 1.8],
		[2.05, 3.5]
	]) {
		const win = createFramedWindowGroup(bag, 0.78, 1.12, mats, {
			shutters: true,
			flowerPalette: ['#e65c8a', '#f2c14e'],
			seed: 220 + Math.round(wx * 10 + wy)
		});
		win.position.set(wx, wy, 1.28);
		archHouseRoot.add(win);
	}

	tagLandmark(archHouseRoot, 'crooked-clock-arch');
	group.add(archHouseRoot);

	// 1C. Fountain of the Paper Boats (-7.8, y, 1.8) + Leaning Bicycle + 3-Globe Lamp
	const fountainRoot = new THREE.Group();
	const ftnY = sampleBaseTerrainHeight(-7.8, 1.8);
	fountainRoot.position.set(-7.8, ftnY, 1.8);

	const basinOuter = new THREE.Mesh(
		sculptClayGeometry(bag.track(new THREE.CylinderGeometry(1.18, 1.08, 0.56, 8)), {
			seed: 240,
			wobbleAmp: 0.015
		}),
		mats.stoneTravertine
	);
	basinOuter.position.y = 0.28;
	basinOuter.castShadow = true;
	basinOuter.receiveShadow = true;
	fountainRoot.add(basinOuter);

	const ftnWater = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(1.02, 1.02, 0.06, 8)),
		mats.waterSurface
	);
	ftnWater.position.y = 0.52;
	fountainRoot.add(ftnWater);

	const centerPillar = new THREE.Mesh(
		sculptClayGeometry(bag.track(new THREE.CylinderGeometry(0.18, 0.28, 1.45, 8)), {
			seed: 242,
			wobbleAmp: 0.01
		}),
		mats.stoneTravertine
	);
	centerPillar.position.y = 0.74;
	centerPillar.castShadow = true;
	fountainRoot.add(centerPillar);

	const topBowl = new THREE.Mesh(
		bag.track(new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)),
		mats.stoneTravertine
	);
	topBowl.position.y = 1.45;
	fountainRoot.add(topBowl);

	// Wrought-iron 3-globe piazza streetlamp + miniature turquoise bicycle!
	const lampPost = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.05, 0.09, 2.95, 8)),
		mats.metalIron
	);
	lampPost.position.set(1.48, 1.48, -0.55);
	lampPost.castShadow = true;
	fountainRoot.add(lampPost);

	for (const [gx, gz] of [
		[0, 0],
		[-0.28, 0.16],
		[0.28, -0.16]
	]) {
		const globe = new THREE.Mesh(
			bag.track(new THREE.SphereGeometry(0.16, 10, 10)),
			mats.lanternGlass
		);
		globe.position.set(1.48 + gx, 2.98 + (gx === 0 ? 0.14 : 0), -0.55 + gz);
		fountainRoot.add(globe);
	}

	// Tiny sculpted bicycle leaning beside lamp
	const bike = new THREE.Group();
	bike.position.set(1.25, 0.24, -0.35);
	bike.rotation.z = 0.16;
	bike.rotation.y = 0.5;
	const wheelGeo = bag.track(new THREE.TorusGeometry(0.22, 0.025, 6, 16));
	for (const wx of [-0.32, 0.32]) {
		const w = new THREE.Mesh(wheelGeo, mats.metalIron);
		w.position.x = wx;
		bike.add(w);
	}
	const frameBar = new THREE.Mesh(
		bag.track(new THREE.BoxGeometry(0.62, 0.035, 0.035)),
		mats.woodTurquoise
	);
	frameBar.position.y = 0.14;
	bike.add(frameBar);
	fountainRoot.add(bike);

	tagLandmark(fountainRoot, 'fountain-paper-boats');
	group.add(fountainRoot);

	// =========================================================================
	// DISTRICT 2: THE LIGHTHOUSE DISTRICT (Keeper's Lighthouse, Rookery, Pier)
	// =========================================================================

	// 2A. Keeper's Cottage Lighthouse (Ref 3 Hero!) at (-18.5, y, -13.5)
	const lhRoot = new THREE.Group();
	const lhBaseY = sampleBaseTerrainHeight(-18.5, -13.5);
	lhRoot.position.set(-18.5, lhBaseY, -13.5);
	lhRoot.rotation.y = 0.55; // Faces SE toward harbor & city!

	// Conical two-tone tower: slate-blue base + cream upper plaster
	const lhLowerGeo = bag.track(new THREE.CylinderGeometry(1.38, 1.72, 3.1, 18, 6));
	lhLowerGeo.translate(0, 1.55, 0);
	sculptClayGeometry(lhLowerGeo, { seed: 301, wobbleAmp: 0.028 });
	const lhLower = new THREE.Mesh(lhLowerGeo, mats.plasterWeatheredBlue);
	lhLower.position.set(-0.75, 0, 0);
	lhLower.castShadow = true;
	lhLower.receiveShadow = true;
	lhRoot.add(lhLower);

	const lhUpperGeo = bag.track(new THREE.CylinderGeometry(1.08, 1.38, 3.7, 18, 8));
	lhUpperGeo.translate(0, 1.85, 0);
	sculptClayGeometry(lhUpperGeo, { seed: 302, wobbleAmp: 0.028 });
	const lhUpper = new THREE.Mesh(lhUpperGeo, mats.plasterCream);
	lhUpper.position.set(-0.75, 3.08, 0);
	lhUpper.castShadow = true;
	lhUpper.receiveShadow = true;
	lhRoot.add(lhUpper);

	// Gallery walkway + iron railing + glowing Fresnel lantern room + slate cupola!
	const gallerySlab = new THREE.Mesh(
		sculptClayGeometry(bag.track(new THREE.CylinderGeometry(1.48, 1.15, 0.28, 18)), {
			seed: 305,
			wobbleAmp: 0.012
		}),
		mats.roofSlateBlue
	);
	gallerySlab.position.set(-0.75, 6.85, 0);
	gallerySlab.castShadow = true;
	lhRoot.add(gallerySlab);

	const galleryRail = new THREE.Mesh(
		bag.track(new THREE.TorusGeometry(1.38, 0.032, 6, 22)),
		mats.metalIron
	);
	galleryRail.rotation.x = Math.PI * 0.5;
	galleryRail.position.set(-0.75, 7.36, 0);
	lhRoot.add(galleryRail);

	const lanternCage = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.92, 0.96, 1.25, 14)),
		mats.lanternGlass
	);
	lanternCage.position.set(-0.75, 7.62, 0);
	lhRoot.add(lanternCage);

	// Revolving golden Fresnel beam rotor!
	const lighthouseRotor = new THREE.Group();
	lighthouseRotor.position.set(-0.75, 7.65, 0);
	const beamConeGeo = bag.track(new THREE.ConeGeometry(2.2, 13.5, 16, 1, true));
	beamConeGeo.translate(0, -6.75, 0);
	beamConeGeo.rotateX(-Math.PI * 0.5);
	const beamA = new THREE.Mesh(beamConeGeo, mats.lighthouseBeamMat);
	const beamB = new THREE.Mesh(beamConeGeo, mats.lighthouseBeamMat);
	beamB.rotation.y = Math.PI;
	lighthouseRotor.add(beamA, beamB);
	lhRoot.add(lighthouseRotor);

	const cupolaDome = new THREE.Mesh(
		sculptClayGeometry(
			bag.track(new THREE.SphereGeometry(1.04, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)),
			{ seed: 309, wobbleAmp: 0.015 }
		),
		mats.roofSlateBlue
	);
	cupolaDome.position.set(-0.75, 8.2, 0);
	cupolaDome.castShadow = true;
	lhRoot.add(cupolaDome);

	const finial = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.025, 0.04, 0.85, 6)),
		mats.metalIron
	);
	finial.position.set(-0.75, 9.45, 0);
	lhRoot.add(finial);

	// Fused crooked 2-story slate-roofed residential cottage wing on right!
	const lhWing1 = createCrookedBoxMesh(bag, 1.95, 3.4, 2.05, mats.plasterCream, {
		seed: 312,
		leanX: 0.07,
		wobbleAmp: 0.025
	});
	lhWing1.position.set(0.95, 0, 0.15);
	lhRoot.add(lhWing1);

	const lhWingUpper = createCrookedBoxMesh(bag, 1.75, 2.05, 1.85, mats.plasterCream, {
		seed: 314,
		leanX: 0.1,
		wobbleAmp: 0.025
	});
	lhWingUpper.position.set(1.22, 3.2, 0.25);
	lhRoot.add(lhWingUpper);

	const lhWingRoof = createGableRoofGroup(
		bag,
		1.95,
		1.18,
		2.0,
		mats.roofSlateBlue,
		mats.woodDarkCharred,
		{
			seed: 316,
			ridgeSag: 0.1
		}
	);
	lhWingRoof.position.set(1.22, 5.2, 0.25);
	lhRoot.add(lhWingRoof);

	// Curved lower slate porch roof with Ship's Wheel ornament + Blue wooden door + 5 stone steps!
	const porchRoof = createGableRoofGroup(
		bag,
		1.75,
		0.55,
		1.1,
		mats.roofSlateBlue,
		mats.woodDarkCharred,
		{
			seed: 318
		}
	);
	porchRoof.position.set(0.35, 2.05, 1.25);
	lhRoot.add(porchRoof);

	const shipWheel = new THREE.Mesh(
		bag.track(new THREE.TorusGeometry(0.24, 0.035, 6, 12)),
		mats.woodWarmOak
	);
	shipWheel.position.set(0.55, 2.42, 1.62);
	shipWheel.rotation.x = -0.5;
	lhRoot.add(shipWheel);

	const lhDoor = createArchedDoorGroup(
		bag,
		0.78,
		1.62,
		mats.woodBlueDoor,
		mats.stoneCliff,
		mats,
		320
	);
	lhDoor.position.set(0.35, 0.18, 1.18);
	lhRoot.add(lhDoor);

	const lhFrontSteps = createSteppedPathGroup(
		bag,
		[
			[0.35, -0.22, 2.25],
			[0.35, 0.18, 1.32]
		],
		1.05,
		mats.stoneCliff,
		322
	);
	lhRoot.add(lhFrontSteps);

	// Brass porthole windows + arched lighthouse window
	for (const [px, py, pz] of [
		[0.72, 3.85, 1.2],
		[1.35, 1.05, 1.2]
	]) {
		const port = createRoundWindowGroup(bag, 0.28, mats, mats.metalBrass, true);
		port.position.set(px, py, pz);
		lhRoot.add(port);
	}
	const tallGableWin = createFramedWindowGroup(bag, 0.65, 1.22, mats, {
		frameMat: mats.roofSlateBlue,
		seed: 326
	});
	tallGableWin.position.set(1.55, 4.15, 1.18);
	lhRoot.add(tallGableWin);

	// Perched white seagulls on gallery & cottage ridge + wooden coastal signpost!
	const gull1 = createSeagullGroup(bag, mats, false);
	gull1.group.position.set(-1.95, 7.38, 0.35);
	gull1.group.rotation.y = 0.8;
	lhRoot.add(gull1.group);

	const gull2 = createSeagullGroup(bag, mats, false);
	gull2.group.position.set(1.22, 6.42, 0.25);
	gull2.group.rotation.y = -0.6;
	lhRoot.add(gull2.group);

	const signPost = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.05, 0.06, 1.65, 6)),
		mats.woodWarmOak
	);
	signPost.position.set(-2.25, 0.8, 1.85);
	lhRoot.add(signPost);
	const signArrow = createCrookedBoxMesh(bag, 0.88, 0.22, 0.06, mats.woodHoney, { seed: 330 });
	signArrow.position.set(-2.25, 1.38, 1.85);
	lhRoot.add(signArrow);
	const gull3 = createSeagullGroup(bag, mats, false);
	gull3.group.position.set(-2.25, 1.62, 1.85);
	lhRoot.add(gull3.group);

	tagLandmark(lhRoot, 'keepers-cottage-lighthouse');
	group.add(lhRoot);

	// 2B. The Windward Rookery Spire (Ref 2 Hero!) at (-10.5, 0, -16.2)
	const rookeryRoot = new THREE.Group();
	rookeryRoot.position.set(-10.5, 0, -16.2);

	const boulder = createCliffCragMesh(bag, 2.95, 5.65, 2.85, mats.stoneCliff, 350, 0.78, 1.15);
	rookeryRoot.add(boulder);

	// Slender cream stone medieval tower rising from boulder plateau (y = 5.6)
	const spireShaft = createCrookedBoxMesh(bag, 1.95, 6.6, 1.95, mats.plasterCream, {
		seed: 355,
		wobbleAmp: 0.03,
		leanX: -0.04,
		taperTop: -0.08
	});
	spireShaft.position.set(0, 5.55, -0.2);
	rookeryRoot.add(spireShaft);

	// Blue slate crooked witch-hat roof + fluttering amber pennant!
	const witchSpire = createWitchHatSpireMesh(
		bag,
		1.58,
		3.15,
		mats.roofSlateBlue,
		0.24,
		0.12,
		8,
		360
	);
	witchSpire.position.set(0, 12.1, -0.2);
	rookeryRoot.add(witchSpire);

	const pennantPole = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.02, 0.03, 1.1, 6)),
		mats.metalIron
	);
	pennantPole.position.set(0.24, 15.45, -0.08);
	rookeryRoot.add(pennantPole);
	const pennantFlag = new THREE.Mesh(
		bag.track(new THREE.ConeGeometry(0.18, 0.95, 4)),
		mats.plasterOchre
	);
	pennantFlag.rotation.z = -Math.PI * 0.5;
	pennantFlag.position.set(0.72, 15.82, -0.08);
	rookeryRoot.add(pennantFlag);

	// Cantilevered honey-oak timber cabin & balcony clinging to tower flank + tiny red gatehouse!
	const cabin = createCrookedBoxMesh(bag, 1.45, 1.55, 1.35, mats.woodHoney, {
		seed: 365,
		wobbleAmp: 0.02
	});
	cabin.position.set(1.18, 8.65, 0.15);
	rookeryRoot.add(cabin);

	const cabinRoof = createGableRoofGroup(
		bag,
		1.55,
		0.72,
		1.45,
		mats.roofSlateBlue,
		mats.woodDarkCharred,
		{
			seed: 367
		}
	);
	cabinRoof.position.set(1.18, 10.2, 0.15);
	rookeryRoot.add(cabinRoof);

	const gatehouse = createCrookedBoxMesh(bag, 1.25, 1.38, 1.15, mats.plasterOchre, {
		seed: 370,
		wobbleAmp: 0.02
	});
	gatehouse.position.set(-0.65, 5.58, 1.05);
	rookeryRoot.add(gatehouse);
	const gateRoof = createGableRoofGroup(
		bag,
		1.35,
		0.62,
		1.25,
		mats.roofTerracotta,
		mats.woodWarmOak,
		{
			seed: 372
		}
	);
	gateRoof.position.set(-0.65, 6.95, 1.05);
	rookeryRoot.add(gateRoof);

	for (const wy of [7.2, 9.8, 11.1]) {
		const rw = createFramedWindowGroup(bag, 0.55, 0.95, mats, { seed: 375 + wy * 3 });
		rw.position.set(-0.2, wy, 0.8);
		rookeryRoot.add(rw);
	}

	// Dramatic windswept copper-autumn tree leaning out from behind boulder!
	const treeCurve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(1.2, 5.4, -0.8),
		new THREE.Vector3(2.3, 7.6, -1.1),
		new THREE.Vector3(3.4, 9.8, -0.9),
		new THREE.Vector3(4.1, 11.4, -0.5)
	]);
	const trunkGeo = bag.track(new THREE.TubeGeometry(treeCurve, 14, 0.18, 7, false));
	const autumnTrunk = new THREE.Mesh(trunkGeo, mats.woodDarkCharred);
	autumnTrunk.castShadow = true;
	rookeryRoot.add(autumnTrunk);

	const autumnCanopy = createFoliageClusterGroup(
		bag,
		22,
		[1.95, 0.95, 1.55],
		['#c95e28', '#d97834', '#b04820', '#e39642'],
		mats.clayFoliage,
		380,
		0.42
	);
	autumnCanopy.position.set(3.85, 11.8, -0.55);
	rookeryRoot.add(autumnCanopy);

	tagLandmark(rookeryRoot, 'windward-rookery-spire');

	// SECRET #5: The Barn Owl's Brass Spyglass on the cantilevered cabin balcony!
	const spyglass = new THREE.Group();
	spyglass.position.set(1.62, 9.55, 0.88);
	const tube = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.05, 0.08, 0.55, 8)),
		mats.metalBrass
	);
	tube.rotation.x = Math.PI * 0.38;
	tube.rotation.z = -0.3;
	spyglass.add(tube);
	tagSecret(spyglass, 'owl-telescope');
	rookeryRoot.add(spyglass);

	group.add(rookeryRoot);

	// 2C. Mussel Pier & Harbor Boathouse (-15.5, 0.55, -7.8) + Bobbing Dory!
	const pierRoot = new THREE.Group();
	pierRoot.position.set(-15.5, 0.55, -7.8);

	const deck = createCrookedBoxMesh(bag, 3.6, 0.14, 1.85, mats.woodWarmOak, {
		seed: 390,
		wobbleAmp: 0.012
	});
	deck.position.set(-0.6, 0, -0.6);
	pierRoot.add(deck);

	for (const px of [-2.1, -0.6, 0.9]) {
		for (const pz of [-1.35, 0.15]) {
			const post = new THREE.Mesh(
				bag.track(new THREE.CylinderGeometry(0.1, 0.11, 1.45, 7)),
				mats.woodDarkCharred
			);
			post.position.set(px, -0.45, pz);
			pierRoot.add(post);
		}
	}

	const boathouse = createCrookedBoxMesh(bag, 1.75, 1.85, 1.65, mats.plasterWeatheredBlue, {
		seed: 394,
		wobbleAmp: 0.02
	});
	boathouse.position.set(1.15, 0.05, 0.45);
	pierRoot.add(boathouse);
	const bhRoof = createGableRoofGroup(bag, 1.85, 0.78, 1.75, mats.roofSlateBlue, mats.woodWarmOak, {
		seed: 396
	});
	bhRoof.position.set(1.15, 1.9, 0.45);
	pierRoot.add(bhRoof);

	const bobbingBoat = new THREE.Group();
	bobbingBoat.position.set(-2.45, -0.42, -1.65);
	const hullGeo = bag.track(new THREE.CylinderGeometry(0.45, 0.28, 1.55, 8, 1, false, 0, Math.PI));
	hullGeo.rotateZ(Math.PI * 0.5);
	hullGeo.rotateY(0.35);
	sculptClayGeometry(hullGeo, { seed: 399, wobbleAmp: 0.015, tintHex: '#cf533e' });
	const hull = new THREE.Mesh(hullGeo, mats.clayFoliage);
	hull.castShadow = true;
	bobbingBoat.add(hull);
	pierRoot.add(bobbingBoat);

	tagLandmark(pierRoot, 'mussel-pier-boathouse');
	group.add(pierRoot);

	// =========================================================================
	// DISTRICT 3: THE TEAPOT QUARTER (Grand Blue Kettle, Patisserie, Conservatory)
	// =========================================================================

	// 3A. The Grand Blue Kettle Residence (Ref 4 Hero!) at (-15.2, y, 13.2)
	const kettleRoot = new THREE.Group();
	const kettleY = sampleBaseTerrainHeight(-15.2, 13.2);
	kettleRoot.position.set(-15.2, kettleY, 13.2);
	kettleRoot.rotation.y = 0.65;

	// Lathe-sculpted plump teapot belly!
	const bellyProfile = [
		new THREE.Vector2(0.0, 0.0),
		new THREE.Vector2(2.15, 0.05),
		new THREE.Vector2(2.45, 1.45),
		new THREE.Vector2(2.38, 3.1),
		new THREE.Vector2(1.98, 4.65),
		new THREE.Vector2(1.62, 5.55),
		new THREE.Vector2(1.72, 5.72),
		new THREE.Vector2(0.0, 5.75)
	];
	const bellyGeo = bag.track(new THREE.LatheGeometry(bellyProfile, 24));
	sculptClayGeometry(bellyGeo, { seed: 401, wobbleAmp: 0.032, aoBottomStrength: 0.24 });
	const bellyMesh = new THREE.Mesh(bellyGeo, mats.ceramicSlateBlue);
	bellyMesh.castShadow = true;
	bellyMesh.receiveShadow = true;
	kettleRoot.add(bellyMesh);

	// Stepped domed teapot lid + knob chimney!
	const lidGeo = bag.track(
		new THREE.SphereGeometry(1.58, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)
	);
	sculptClayGeometry(lidGeo, { seed: 405, wobbleAmp: 0.02 });
	const lidMesh = new THREE.Mesh(lidGeo, mats.ceramicSlateBlue);
	lidMesh.position.y = 5.45;
	lidMesh.castShadow = true;
	kettleRoot.add(lidMesh);

	const lidKnob = new THREE.Mesh(
		sculptClayGeometry(bag.track(new THREE.CylinderGeometry(0.42, 0.34, 0.52, 14)), {
			seed: 407,
			wobbleAmp: 0.012
		}),
		mats.ceramicSlateBlue
	);
	lidKnob.position.y = 6.95;
	lidKnob.castShadow = true;
	kettleRoot.add(lidKnob);
	steamEmitters.push([-15.2, kettleY + 7.45, 13.2]);

	// Sweeping curved pouring spout on -X + hanging chain lantern!
	const spoutCurve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(-1.85, 3.35, 0),
		new THREE.Vector3(-2.75, 4.45, 0),
		new THREE.Vector3(-3.35, 5.85, 0),
		new THREE.Vector3(-3.65, 6.45, 0)
	]);
	const spoutGeo = bag.track(new THREE.TubeGeometry(spoutCurve, 14, 0.38, 12, false));
	sculptClayGeometry(spoutGeo, { seed: 410, wobbleAmp: 0.015, taperTop: -0.28 });
	const spoutMesh = new THREE.Mesh(spoutGeo, mats.ceramicSlateBlue);
	spoutMesh.castShadow = true;
	kettleRoot.add(spoutMesh);

	const spoutLantern = createHangingLanternGroup(bag, 0.88, 1.35, mats, 412);
	spoutLantern.position.set(-3.55, 6.32, 0);
	kettleRoot.add(spoutLantern);

	// Sweeping C-handle on +X wrapped with climbing greenery!
	const handleCurve = new THREE.CatmullRomCurve3([
		new THREE.Vector3(1.85, 4.85, 0),
		new THREE.Vector3(3.25, 4.35, 0),
		new THREE.Vector3(3.35, 2.55, 0),
		new THREE.Vector3(2.15, 1.55, 0)
	]);
	const handleGeo = bag.track(new THREE.TubeGeometry(handleCurve, 16, 0.24, 10, false));
	sculptClayGeometry(handleGeo, { seed: 415, wobbleAmp: 0.015 });
	const handleMesh = new THREE.Mesh(handleGeo, mats.ceramicSlateBlue);
	handleMesh.castShadow = true;
	kettleRoot.add(handleMesh);

	// Recessed glowing mullioned windows + arched front door on kettle belly!
	for (const [ang, wy] of [
		[0.18, 3.05],
		[-0.55, 4.15],
		[0.85, 2.65]
	]) {
		const kw = createFramedWindowGroup(bag, 0.92, 1.15, mats, {
			frameMat: mats.ceramicSlateBlue,
			cornice: true,
			seed: 420 + Math.round(wy * 10)
		});
		const r = 2.26;
		kw.position.set(Math.sin(ang) * r, wy, Math.cos(ang) * r);
		kw.rotation.y = ang;
		kettleRoot.add(kw);
	}

	const kettleDoor = createArchedDoorGroup(
		bag,
		0.92,
		1.78,
		mats.woodWarmOak,
		mats.stoneTravertine,
		mats,
		428
	);
	kettleDoor.position.set(0.55, 0.02, 2.22);
	kettleDoor.rotation.y = 0.24;
	kettleRoot.add(kettleDoor);

	tagLandmark(kettleRoot, 'grand-blue-kettle');

	// SECRET #3: Tiny Porcelain Teacup balanced on the spout lip!
	const teacupSecret = new THREE.Group();
	teacupSecret.position.set(-3.68, 6.68, 0);
	const cupMesh = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.18, 0.11, 0.22, 12)),
		mats.ceramicCream
	);
	teacupSecret.add(cupMesh);
	const saucerMesh = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.26, 0.22, 0.04, 12)),
		mats.plasterCoral
	);
	saucerMesh.position.y = -0.11;
	teacupSecret.add(saucerMesh);
	tagSecret(teacupSecret, 'spout-teacup');
	kettleRoot.add(teacupSecret);

	group.add(kettleRoot);

	// 3B. Copper-Lid Espresso Tower & Terracotta Mug Patisserie (Ref 4 Ensemble!) at (-9.2, y, 15.4)
	const patisserieRoot = new THREE.Group();
	const patY = sampleBaseTerrainHeight(-9.2, 15.4);
	patisserieRoot.position.set(-9.2, patY, 15.4);
	patisserieRoot.rotation.y = Math.PI; // Faces North toward Kettlewick Green!

	// Tall cream stoneware coffee-pot tower + copper lid
	const coffeeTowerGeo = bag.track(new THREE.CylinderGeometry(1.18, 1.42, 5.8, 18, 8));
	coffeeTowerGeo.translate(0, 2.9, 0);
	sculptClayGeometry(coffeeTowerGeo, { seed: 440, wobbleAmp: 0.025 });
	const coffeeTower = new THREE.Mesh(coffeeTowerGeo, mats.ceramicCream);
	coffeeTower.position.set(1.15, 0, -0.35);
	coffeeTower.castShadow = true;
	patisserieRoot.add(coffeeTower);

	const copperLid = new THREE.Mesh(
		sculptClayGeometry(
			bag.track(new THREE.SphereGeometry(1.32, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)),
			{ seed: 442, wobbleAmp: 0.015 }
		),
		mats.metalCopper
	);
	copperLid.position.set(1.15, 5.65, -0.35);
	copperLid.castShadow = true;
	patisserieRoot.add(copperLid);

	// Glazed terracotta ceramic mug cottage with curved ear-handle!
	const mugGeo = bag.track(new THREE.CylinderGeometry(1.02, 1.12, 3.45, 16, 6));
	mugGeo.translate(0, 1.72, 0);
	sculptClayGeometry(mugGeo, { seed: 445, wobbleAmp: 0.022 });
	const mugHouse = new THREE.Mesh(mugGeo, mats.ceramicTerracotta);
	mugHouse.position.set(-0.65, 0, 0.55);
	mugHouse.castShadow = true;
	patisserieRoot.add(mugHouse);

	const mugLid = new THREE.Mesh(
		bag.track(new THREE.SphereGeometry(1.08, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.4)),
		mats.metalCopper
	);
	mugLid.position.set(-0.65, 3.38, 0.55);
	patisserieRoot.add(mugLid);

	const mugHandle = new THREE.Mesh(
		bag.track(new THREE.TorusGeometry(0.68, 0.14, 8, 14, Math.PI)),
		mats.ceramicTerracotta
	);
	mugHandle.rotation.z = -Math.PI * 0.5;
	mugHandle.position.set(-1.62, 1.85, 0.55);
	patisserieRoot.add(mugHandle);

	// Crooked butter-yellow tile-roofed bakery cottage beside them
	const yellowCottage = createCrookedBoxMesh(bag, 1.95, 3.65, 1.95, mats.plasterMustard, {
		seed: 450,
		leanX: -0.07,
		wobbleAmp: 0.025
	});
	yellowCottage.position.set(-2.35, 0, -0.25);
	patisserieRoot.add(yellowCottage);

	const ycRoof = createGableRoofGroup(
		bag,
		2.05,
		0.98,
		2.05,
		mats.roofTerracotta,
		mats.woodWarmOak,
		{
			seed: 452,
			ridgeSag: 0.08
		}
	);
	ycRoof.position.set(-2.35, 3.65, -0.25);
	patisserieRoot.add(ycRoof);
	steamEmitters.push([-6.85, patY + 5.1, 15.65]);

	for (const [wx, wy, wz] of [
		[1.15, 4.15, 0.85],
		[-0.65, 2.05, 1.58],
		[-2.35, 2.25, 0.74]
	]) {
		const pw = createFramedWindowGroup(bag, 0.72, 0.95, mats, {
			shutters: true,
			seed: 455 + wx * 7
		});
		pw.position.set(wx, wy, wz);
		patisserieRoot.add(pw);
	}

	const patDoor = createArchedDoorGroup(
		bag,
		0.76,
		1.52,
		mats.woodBlueDoor,
		mats.stoneTravertine,
		mats,
		460
	);
	patDoor.position.set(-0.65, 0.02, 1.64);
	patisserieRoot.add(patDoor);

	tagLandmark(patisserieRoot, 'copper-espresso-patisserie');
	group.add(patisserieRoot);

	// 3C. The Chamomile Sugar-Bowl Conservatory at (-5.2, y, 11.4) + Ginger Cat!
	const consRoot = new THREE.Group();
	const consY = sampleBaseTerrainHeight(-5.2, 11.4);
	consRoot.position.set(-5.2, consY, 11.4);
	consRoot.rotation.y = -1.9;

	const bowlGeo = bag.track(new THREE.CylinderGeometry(1.48, 1.25, 2.35, 14, 5));
	bowlGeo.translate(0, 1.18, 0);
	sculptClayGeometry(bowlGeo, { seed: 470, bellyBulge: 0.14, wobbleAmp: 0.02 });
	const bowl = new THREE.Mesh(bowlGeo, mats.ceramicCeladon);
	bowl.castShadow = true;
	consRoot.add(bowl);

	const glassDome = new THREE.Mesh(
		bag.track(new THREE.SphereGeometry(1.42, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
		mats.lanternGlass
	);
	glassDome.position.y = 2.32;
	consRoot.add(glassDome);

	const consDoor = createArchedDoorGroup(
		bag,
		0.78,
		1.55,
		mats.woodWarmOak,
		mats.stoneTravertine,
		mats,
		474
	);
	consDoor.position.set(0, 0.02, 1.38);
	consRoot.add(consDoor);

	const gingerCat = createMiniatureCatGroup(bag, mats.catGinger);
	gingerCat.group.position.set(0.85, 0.02, 1.55);
	gingerCat.group.rotation.y = 0.5;
	catTails.push(gingerCat.tailPivot);
	consRoot.add(gingerCat.group);

	tagLandmark(consRoot, 'chamomile-conservatory');
	group.add(consRoot);

	// Additional cozy backdrop cottage bridging Old Town & Kettlewick Lane (-15.5, y, 5.8)
	const linkCottage = new THREE.Group();
	const lcY = sampleBaseTerrainHeight(-15.5, 5.8);
	linkCottage.position.set(-15.5, lcY, 5.8);
	linkCottage.rotation.y = 1.25;
	const lcBody = createCrookedBoxMesh(bag, 2.1, 3.8, 1.9, mats.plasterSage, {
		seed: 485,
		leanZ: 0.06,
		wobbleAmp: 0.025
	});
	linkCottage.add(lcBody);
	const lcRoof = createGableRoofGroup(
		bag,
		2.2,
		1.05,
		2.0,
		mats.roofTerracotta,
		mats.stoneTravertine,
		{
			seed: 486
		}
	);
	lcRoof.position.y = 3.8;
	linkCottage.add(lcRoof);
	const lcWin = createFramedWindowGroup(bag, 0.78, 1.05, mats, {
		flowerPalette: ['#e85d99', '#ffd166'],
		shutters: true,
		seed: 488
	});
	lcWin.position.set(0, 2.35, 0.96);
	linkCottage.add(lcWin);
	group.add(linkCottage);

	return {
		group,
		catTails,
		lighthouseRotor,
		bobbingBoat,
		steamEmitters
	};
}
