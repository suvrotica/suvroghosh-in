import * as THREE from 'three';
import {
	createArchedDoorGroup,
	createCatenaryCableMesh,
	createClayCitizenGroup,
	createCrookedBoxMesh,
	createFramedWindowGroup,
	createGableRoofGroup,
	createHangingLanternGroup,
	createSeagullGroup,
	createSuspensionBridgeGroup,
	createWitchHatSpireMesh,
	sculptClayGeometry,
	type DisposerBag
} from './craft-geometry';
import type { CityMaterialLibrary } from './materials';
import { createRng, lerp, sampleCatmullRom } from './prng';
import type { Vec3 } from './types';
import { canalCenterX, tagLandmark, tagSecret, tagWalkable } from './world-terrain';

export interface AnimatedCitizenActor {
	group: THREE.Group;
	loopPoints: Vec3[];
	speed: number;
	phase: number;
}

export interface AnimatedGullActor {
	group: THREE.Group;
	leftWing: THREE.Mesh;
	rightWing: THREE.Mesh;
	center: Vec3;
	radiusX: number;
	radiusZ: number;
	speed: number;
	phase: number;
}

export interface SteamPuffActor {
	mesh: THREE.Mesh;
	origin: Vec3;
	phase: number;
	riseHeight: number;
}

export interface PaperBoatActor {
	group: THREE.Group;
	zProgress: number;
	speed: number;
}

export interface SkyAndLifeHandles {
	group: THREE.Group;
	playerTraveler: THREE.Group;
	playerLanternLight: THREE.PointLight;
	propellerHub: THREE.Group;
	balloonGroup: THREE.Group;
	citizens: AnimatedCitizenActor[];
	gulls: AnimatedGullActor[];
	steamPuffs: SteamPuffActor[];
	paperBoats: PaperBoatActor[];
	starPoints: THREE.Points;
	starMaterial: THREE.PointsMaterial;
}

export function buildSkyVillageAndLivingCast(
	bag: DisposerBag,
	mats: CityMaterialLibrary,
	steamEmitters: Vec3[]
): SkyAndLifeHandles {
	const group = new THREE.Group();

	// =========================================================================
	// DISTRICT 6: THE FLOATING VILLAGE ("Cloud-Tether Reach" at Y ~ 6.45)
	// =========================================================================

	// 6A. The Sky-Ship Aerie & Brass Observatory (0.2, 6.45, -8.2)
	const aerieRoot = new THREE.Group();
	aerieRoot.position.set(0.2, 6.45, -8.2);

	// Inverted craggy floating rock island with flat grassy top deck at local y = 0
	const islandRockGeo = bag.track(new THREE.ConeGeometry(3.45, 3.35, 16, 8));
	islandRockGeo.rotateX(Math.PI);
	islandRockGeo.translate(0, -1.68, 0);
	sculptClayGeometry(islandRockGeo, { seed: 801, wobbleAmp: 0.14, aoBottomStrength: 0.35 });
	const islandRock = new THREE.Mesh(islandRockGeo, mats.stoneCliff);
	islandRock.castShadow = true;
	islandRock.receiveShadow = true;
	aerieRoot.add(islandRock);

	const deckTurfGeo = bag.track(new THREE.CylinderGeometry(3.48, 3.35, 0.22, 18));
	sculptClayGeometry(deckTurfGeo, { seed: 802, wobbleAmp: 0.025 });
	const deckTurf = new THREE.Mesh(deckTurfGeo, mats.mossyGrass);
	deckTurf.position.y = -0.05;
	deckTurf.receiveShadow = true;
	tagWalkable(deckTurf);
	aerieRoot.add(deckTurf);

	// Crooked Dusty-Pink & Turquoise Sky Houses + Hammered Copper Observatory Dome!
	const skyHouseA = createCrookedBoxMesh(bag, 1.85, 2.75, 1.75, mats.plasterDustyPink, {
		seed: 805,
		leanX: -0.07,
		wobbleAmp: 0.025
	});
	skyHouseA.position.set(-0.65, 0.02, -1.15);
	aerieRoot.add(skyHouseA);

	const skyRoofA = createWitchHatSpireMesh(bag, 1.45, 1.95, mats.roofSlateBlue, -0.18, 0.1, 8, 807);
	skyRoofA.position.set(-0.65, 2.75, -1.15);
	aerieRoot.add(skyRoofA);

	const obsTower = new THREE.Mesh(
		sculptClayGeometry(bag.track(new THREE.CylinderGeometry(1.02, 1.15, 3.15, 16)), {
			seed: 810,
			wobbleAmp: 0.02
		}),
		mats.plasterCream
	);
	obsTower.position.set(0.95, 1.55, -1.25);
	obsTower.castShadow = true;
	aerieRoot.add(obsTower);

	const copperDome = new THREE.Mesh(
		sculptClayGeometry(
			bag.track(new THREE.SphereGeometry(1.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)),
			{ seed: 812, wobbleAmp: 0.015 }
		),
		mats.metalCopper
	);
	copperDome.position.set(0.95, 3.05, -1.25);
	copperDome.castShadow = true;
	aerieRoot.add(copperDome);

	const telescopeTube = new THREE.Mesh(
		bag.track(new THREE.CylinderGeometry(0.14, 0.18, 1.25, 10)),
		mats.metalBrass
	);
	telescopeTube.rotation.x = 0.75;
	telescopeTube.rotation.z = -0.35;
	telescopeTube.position.set(1.25, 3.85, -0.75);
	aerieRoot.add(telescopeTube);

	for (const [wx, wy, wz] of [
		[-0.65, 1.55, -0.25],
		[0.95, 1.85, -0.12]
	]) {
		const sw = createFramedWindowGroup(bag, 0.68, 0.88, mats, {
			flowerPalette: ['#e85d99', '#7bc4b2'],
			seed: 815 + Math.round(wx * 10)
		});
		sw.position.set(wx, wy, wz);
		aerieRoot.add(sw);
	}

	const aerieDoor = createArchedDoorGroup(
		bag,
		0.76,
		1.52,
		mats.woodBlueDoor,
		mats.stoneTravertine,
		mats,
		818
	);
	aerieDoor.position.set(0.15, 0.04, -0.32);
	aerieRoot.add(aerieDoor);

	// Spinning Brass Wind-Propeller Hub on West Rim!
	const propellerHub = new THREE.Group();
	propellerHub.position.set(-2.35, 1.85, -1.15);
	const bladeGeo = bag.track(new THREE.BoxGeometry(0.18, 1.65, 0.04));
	for (let b = 0; b < 4; b++) {
		const blade = new THREE.Mesh(bladeGeo, mats.metalBrass);
		blade.rotation.z = (b * Math.PI) / 2;
		blade.rotation.y = 0.35;
		propellerHub.add(blade);
	}
	aerieRoot.add(propellerHub);

	// Striped Hot-Air Balloon Envelope tethered above Aerie!
	const balloonGroup = new THREE.Group();
	balloonGroup.position.set(0.15, 7.65, -1.15);
	const envGeo = bag.track(new THREE.SphereGeometry(2.05, 20, 16));
	envGeo.scale(1.0, 1.24, 1.0);
	sculptClayGeometry(envGeo, { seed: 825, taperTop: 0.16, wobbleAmp: 0.02 });
	const envelope = new THREE.Mesh(envGeo, mats.fabricBalloonStripe);
	envelope.castShadow = true;
	balloonGroup.add(envelope);

	for (const [rx, rz] of [
		[-0.9, -0.9],
		[0.9, -0.9],
		[-0.9, 0.9],
		[0.9, 0.9]
	]) {
		const tether = createCatenaryCableMesh(
			bag,
			[rx * 1.35, -1.1, rz * 1.35],
			[rx * 0.65, -4.65, rz * 0.65],
			0.08,
			0.018,
			mats.woodHoney,
			6
		);
		balloonGroup.add(tether);
	}
	aerieRoot.add(balloonGroup);

	// Heavy iron mooring anchor chains down to canal quays!
	for (const [pTop, pBot] of [
		[
			[-2.4, 5.2, -7.2],
			[-4.6, 0.65, -5.8]
		],
		[
			[2.8, 5.2, -7.2],
			[4.5, 0.68, -5.4]
		]
	] as Array<[Vec3, Vec3]>) {
		const chain = createCatenaryCableMesh(bag, pTop, pBot, 0.55, 0.045, mats.metalIron, 14);
		group.add(chain);
	}

	tagLandmark(aerieRoot, 'sky-ship-observatory');

	// SECRET #7: The Cloud-Postman's Cast-Brass Mooring Bell on front sky-dock!
	const bellPost = new THREE.Group();
	bellPost.position.set(-1.3, 0.04, 1.8);
	const postWood = createCrookedBoxMesh(bag, 0.14, 1.15, 0.14, mats.woodDarkCharred, { seed: 830 });
	bellPost.add(postWood);
	const bellCone = new THREE.Mesh(
		bag.track(new THREE.ConeGeometry(0.18, 0.26, 12)),
		mats.metalBrass
	);
	bellCone.position.set(0.18, 0.96, 0);
	bellPost.add(bellCone);
	tagSecret(bellPost, 'cloud-bell');
	aerieRoot.add(bellPost);

	group.add(aerieRoot);

	// 6B. The Cantilevered Sky-Tea Pavilion (3.6, 6.5, -7.2)
	const teaPavRoot = new THREE.Group();
	teaPavRoot.position.set(3.6, 6.5, -7.2);

	const satelliteCragGeo = bag.track(new THREE.ConeGeometry(1.75, 2.1, 12));
	satelliteCragGeo.rotateX(Math.PI);
	satelliteCragGeo.translate(0, -1.05, 0);
	sculptClayGeometry(satelliteCragGeo, { seed: 840, wobbleAmp: 0.09 });
	const satCrag = new THREE.Mesh(satelliteCragGeo, mats.stoneCliff);
	teaPavRoot.add(satCrag);

	const satDeck = createCrookedBoxMesh(bag, 2.65, 0.18, 2.45, mats.woodWarmOak, { seed: 842 });
	satDeck.position.y = -0.12;
	tagWalkable(satDeck);
	teaPavRoot.add(satDeck);

	const pavHouse = createCrookedBoxMesh(bag, 1.65, 2.15, 1.65, mats.plasterSage, {
		seed: 844,
		leanZ: 0.12,
		wobbleAmp: 0.025
	});
	pavHouse.position.set(0.25, 0.04, -0.25);
	teaPavRoot.add(pavHouse);

	const pavRoof = createGableRoofGroup(
		bag,
		2.05,
		0.95,
		2.05,
		mats.plasterDustyPink,
		mats.woodDarkCharred,
		{ seed: 846, upturnEaves: 0.24 }
	);
	pavRoof.position.set(0.25, 2.18, -0.25);
	teaPavRoot.add(pavRoof);

	const underLantern = createHangingLanternGroup(bag, 0.92, 1.15, mats, 848);
	underLantern.position.set(0, -1.85, 0);
	teaPavRoot.add(underLantern);

	tagLandmark(teaPavRoot, 'upside-down-tea-pavilion');
	group.add(teaPavRoot);

	// 6C. The Gossamer Spiral Stair-Tower rising from Northern Canal Island (0.0, 0.65, -5.6) -> Y = 6.48!
	const spiralRoot = new THREE.Group();
	spiralRoot.position.set(0.0, 0.65, -5.6);

	const coreGeo = bag.track(new THREE.CylinderGeometry(0.42, 0.52, 6.1, 12));
	coreGeo.translate(0, 3.05, 0);
	sculptClayGeometry(coreGeo, { seed: 860, wobbleAmp: 0.015 });
	const core = new THREE.Mesh(coreGeo, mats.woodTurquoise);
	core.castShadow = true;
	spiralRoot.add(core);

	const totalSteps = 28;
	for (let i = 0; i <= totalSteps; i++) {
		const u = i / totalSteps;
		const ang = u * Math.PI * 3.2;
		const sy = u * 5.82;
		const tread = createCrookedBoxMesh(bag, 0.95, 0.09, 0.36, mats.woodWarmOak, {
			seed: 865 + i,
			wobbleAmp: 0.006
		});
		tread.position.set(Math.cos(ang) * 0.85, sy, Math.sin(ang) * 0.85);
		tread.rotation.y = -ang;
		tagWalkable(tread);
		spiralRoot.add(tread);
	}

	const spiralCapRoof = createWitchHatSpireMesh(
		bag,
		0.95,
		1.35,
		mats.metalCopper,
		0.08,
		0.08,
		10,
		895
	);
	spiralCapRoof.position.y = 6.1;
	spiralRoot.add(spiralCapRoof);

	tagLandmark(spiralRoot, 'gossamer-stair-tower');
	group.add(spiralRoot);

	// 3 Swaying Rope-and-Lantern Suspension Sky-Bridges!
	const westSkyBridge = createSuspensionBridgeGroup(
		bag,
		[
			[-10.2, 5.62, -14.0],
			[-7.6, 5.75, -12.1],
			[-5.2, 6.02, -10.4],
			[-3.0, 6.46, -8.8]
		],
		1.45,
		mats,
		910
	);
	tagWalkable(westSkyBridge);
	group.add(westSkyBridge);

	const eastSkyBridge = createSuspensionBridgeGroup(
		bag,
		[
			[13.6, 5.82, -12.2],
			[10.2, 5.92, -10.6],
			[6.8, 6.18, -9.0],
			[4.4, 6.5, -7.5]
		],
		1.45,
		mats,
		920
	);
	tagWalkable(eastSkyBridge);
	group.add(eastSkyBridge);

	const dockConnector = createSuspensionBridgeGroup(
		bag,
		[
			[0.0, 6.48, -5.9],
			[0.1, 6.48, -6.9]
		],
		1.6,
		mats,
		930
	);
	tagWalkable(dockConnector);
	group.add(dockConnector);

	const eastDockLink = createSuspensionBridgeGroup(
		bag,
		[
			[2.2, 6.48, -7.6],
			[3.1, 6.5, -7.3]
		],
		1.45,
		mats,
		935
	);
	tagWalkable(eastDockLink);
	group.add(eastDockLink);

	// =========================================================================
	// LIVING MINIATURE CAST: PLAYER TRAVELER, CITIZENS, GULLS, BOATS, STEAM
	// =========================================================================

	// 1. Player's Third-Person Clay Traveler Figurine (carrying a warm lantern!)
	const travelerRig = createClayCitizenGroup(bag, '#3d8fa1', '#e8a838', mats, true, 999);
	const playerTraveler = travelerRig.group;
	playerTraveler.scale.setScalar(1.18);
	const playerLanternLight = new THREE.PointLight('#ffaa44', 1.8, 7.5, 1.8);
	playerLanternLight.position.set(0.22, 0.52, 0.28);
	playerTraveler.add(playerLanternLight);
	group.add(playerTraveler);

	// 2. Wandering Miniature Citizens along neighborhood footpath loops
	const citizenSpecs: Array<{ coat: string; hat: string; speed: number; loop: Vec3[] }> = [
		{
			coat: '#d96b52',
			hat: '#f2d176',
			speed: 0.95,
			loop: [
				[-10.8, 0.64, -1.2],
				[-9.2, 0.62, 1.8],
				[-4.2, 0.62, 1.6],
				[-9.5, 0.65, -2.4],
				[-10.8, 0.64, -1.2]
			]
		},
		{
			coat: '#5a8ab0',
			hat: '#e68c9c',
			speed: 0.85,
			loop: [
				[-10.4, 0.8, 11.4],
				[-12.4, 0.85, 12.4],
				[-9.2, 0.82, 12.8],
				[-7.2, 0.74, 10.6],
				[-10.4, 0.8, 11.4]
			]
		},
		{
			coat: '#e6b83c',
			hat: '#3b6f8c',
			speed: 1.05,
			loop: [
				[4.4, 0.62, 1.8],
				[7.2, 0.65, 3.6],
				[11.2, 0.68, 7.6],
				[12.2, 0.68, 9.4],
				[7.2, 0.65, 3.6],
				[4.4, 0.62, 1.8]
			]
		},
		{
			coat: '#7a9e7e',
			hat: '#cf5640',
			speed: 0.78,
			loop: [
				[6.8, 0.7, -1.6],
				[7.4, 0.75, -3.8],
				[10.8, 1.38, -8.2],
				[7.4, 0.75, -3.8],
				[6.8, 0.7, -1.6]
			]
		},
		{
			coat: '#d87a9c',
			hat: '#f5ecda',
			speed: 0.82,
			loop: [
				[-2.6, 6.46, -8.6],
				[0.2, 6.52, -7.6],
				[3.2, 6.5, -7.3],
				[0.2, 6.52, -7.6],
				[-2.6, 6.46, -8.6]
			]
		},
		{
			coat: '#486b8a',
			hat: '#e09f3e',
			speed: 0.9,
			loop: [
				[-4.0, 0.62, 1.6],
				[0.0, 1.38, 1.6],
				[4.2, 0.62, 1.8],
				[0.0, 1.38, 1.6],
				[-4.0, 0.62, 1.6]
			]
		}
	];

	const citizens: AnimatedCitizenActor[] = citizenSpecs.map((spec, idx) => {
		const c = createClayCitizenGroup(
			bag,
			spec.coat,
			spec.hat,
			mats,
			idx % 2 === 1,
			1020 + idx * 13
		);
		c.group.position.set(...spec.loop[0]);
		group.add(c.group);
		return {
			group: c.group,
			loopPoints: spec.loop,
			speed: spec.speed,
			phase: idx * 0.19
		};
	});

	// 3. Soaring Coastal Seagulls above Cape Whispering Gull & Floating Village
	const gulls: AnimatedGullActor[] = [];
	for (let i = 0; i < 5; i++) {
		const g = createSeagullGroup(bag, mats, true);
		group.add(g.group);
		gulls.push({
			group: g.group,
			leftWing: g.leftWing!,
			rightWing: g.rightWing!,
			center: i < 3 ? [-15.5, 13.5 + i * 1.1, -13.0] : [-1.5, 13.8 + (i - 3) * 1.2, -6.5],
			radiusX: 4.5 + i * 0.8,
			radiusZ: 3.6 + i * 0.6,
			speed: 0.35 + i * 0.06,
			phase: i * 1.25
		});
	}

	// 4. Drifting Folded Paper Boats along the Central Turquoise Canal!
	const paperBoats: PaperBoatActor[] = [];
	for (let i = 0; i < 4; i++) {
		const boatGrp = new THREE.Group();
		const hullGeo = bag.track(new THREE.OctahedronGeometry(0.24, 0));
		hullGeo.scale(0.65, 0.45, 1.55);
		sculptClayGeometry(hullGeo, {
			seed: 1100 + i,
			wobbleAmp: 0.008,
			tintHex: i % 2 === 0 ? '#f7f2e6' : '#f2c166'
		});
		const boatMesh = new THREE.Mesh(hullGeo, mats.clayFoliage);
		boatMesh.position.y = 0.06;
		boatGrp.add(boatMesh);
		group.add(boatGrp);
		paperBoats.push({
			group: boatGrp,
			zProgress: i * 0.25,
			speed: 0.022 + i * 0.003
		});
	}

	// 5. Puffing Sculpted Cotton-Ball Steam Clouds above Teapot Quarter & Chimneys!
	const steamPuffs: SteamPuffActor[] = [];
	for (const [eIdx, origin] of steamEmitters.entries()) {
		for (let p = 0; p < 5; p++) {
			const puffGeo = bag.track(new THREE.IcosahedronGeometry(0.32, 1));
			sculptClayGeometry(puffGeo, { seed: 1200 + eIdx * 11 + p, wobbleAmp: 0.05 });
			const puffMesh = new THREE.Mesh(puffGeo, mats.claySteam);
			puffMesh.position.set(...origin);
			group.add(puffMesh);
			steamPuffs.push({
				mesh: puffMesh,
				origin,
				phase: p / 5 + eIdx * 0.13,
				riseHeight: eIdx === 1 ? 3.2 : 2.1 // Extra lush steam for Grand Blue Kettle!
			});
		}
	}

	// 6. Night Starfield Dome
	const starRng = createRng(2026);
	const starCount = 260;
	const starPositions = new Float32Array(starCount * 3);
	for (let i = 0; i < starCount; i++) {
		const theta = starRng() * Math.PI * 2;
		const phi = Math.acos(lerp(0.12, 0.98, starRng()));
		const rad = 72 + starRng() * 8;
		starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * rad;
		starPositions[i * 3 + 1] = Math.cos(phi) * rad;
		starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * rad;
	}
	const starGeo = bag.track(new THREE.BufferGeometry());
	starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
	const starMaterial = new THREE.PointsMaterial({
		color: '#fff6dc',
		size: 0.55,
		transparent: true,
		opacity: 0.0,
		depthWrite: false
	});
	const starPoints = new THREE.Points(starGeo, starMaterial);
	group.add(starPoints);

	return {
		group,
		playerTraveler,
		playerLanternLight,
		propellerHub,
		balloonGroup,
		citizens,
		gulls,
		steamPuffs,
		paperBoats,
		starPoints,
		starMaterial
	};
}

/**
 * Updates all miniature animated actors at timestamp `animTime` (in seconds).
 * Supports both smooth 60fps and authentic 12fps clay stop-motion quantized cadence!
 */
export function updateLivingActors(
	simTime: number,
	handles: {
		catTails: THREE.Group[];
		lighthouseRotor: THREE.Group;
		bobbingBoat: THREE.Group;
		swayingLanterns: THREE.Group[];
		skyLife: SkyAndLifeHandles;
	}
): void {
	const { catTails, lighthouseRotor, bobbingBoat, swayingLanterns, skyLife } = handles;

	// Revolving Lighthouse Fresnel beam
	lighthouseRotor.rotation.y = simTime * 0.55;

	// Harbor dory gentle sea swell
	bobbingBoat.position.y = -0.42 + Math.sin(simTime * 1.7) * 0.06;
	bobbingBoat.rotation.z = Math.sin(simTime * 1.3) * 0.07;

	// Cat tails flicking lazily
	for (let i = 0; i < catTails.length; i++) {
		catTails[i].rotation.x = Math.sin(simTime * 2.2 + i * 1.7) * 0.25;
		catTails[i].rotation.z = Math.cos(simTime * 1.6 + i) * 0.18;
	}

	// Chain-hung lanterns swaying gently in the breeze
	for (let i = 0; i < swayingLanterns.length; i++) {
		swayingLanterns[i].rotation.z = Math.sin(simTime * 1.35 + i * 0.9) * 0.065;
		swayingLanterns[i].rotation.x = Math.cos(simTime * 1.1 + i * 1.2) * 0.045;
	}

	// Floating Village wind propellers & hot-air balloon bob
	skyLife.propellerHub.rotation.z = simTime * 1.9;
	skyLife.balloonGroup.position.y = 7.65 + Math.sin(simTime * 0.9) * 0.18;

	// Wandering clay citizens along neighborhood paths
	for (const cit of skyLife.citizens) {
		const u = (simTime * cit.speed * 0.045 + cit.phase) % 1;
		const pos = sampleCatmullRom(cit.loopPoints, u);
		const ahead = sampleCatmullRom(cit.loopPoints, (u + 0.015) % 1);
		const hop = Math.abs(Math.sin(simTime * 6.5 + cit.phase * 10)) * 0.05;
		cit.group.position.set(pos[0], pos[1] + hop, pos[2]);
		cit.group.rotation.y = Math.atan2(ahead[0] - pos[0], ahead[2] - pos[2]);
	}

	// Soaring coastal gulls
	for (const gull of skyLife.gulls) {
		const ang = simTime * gull.speed + gull.phase;
		const x = gull.center[0] + Math.cos(ang) * gull.radiusX;
		const z = gull.center[2] + Math.sin(ang) * gull.radiusZ;
		const y = gull.center[1] + Math.sin(ang * 2.0) * 0.45;
		gull.group.position.set(x, y, z);
		gull.group.rotation.y = Math.atan2(-Math.sin(ang) * gull.radiusX, Math.cos(ang) * gull.radiusZ);
		const flap = Math.sin(simTime * 5.2 + gull.phase) * 0.42;
		gull.leftWing.rotation.z = flap;
		gull.rightWing.rotation.z = -flap;
	}

	// Drifting canal paper boats (skipping the Northern Canal Island at Z = -5.4 by staying Z in [-3.2..+18.5])
	for (const boat of skyLife.paperBoats) {
		const u = (boat.zProgress + simTime * boat.speed) % 1;
		const z = lerp(-2.8, 18.2, u);
		const x = canalCenterX(z) + Math.sin(z * 0.6 + boat.zProgress * 6) * 0.45;
		boat.group.position.set(x, 0.09 + Math.sin(simTime * 2.4 + u * 8) * 0.02, z);
		boat.group.rotation.y = Math.atan2(canalCenterX(z + 0.5) - canalCenterX(z), 0.5);
	}

	// Rising & expanding cotton-ball teapot steam puffs
	for (const puff of skyLife.steamPuffs) {
		const u = (simTime * 0.28 + puff.phase) % 1;
		const driftX = Math.sin(u * 4.2 + puff.phase * 8) * 0.38 + u * 0.45;
		const driftZ = Math.cos(u * 3.5 + puff.phase * 5) * 0.28;
		puff.mesh.position.set(
			puff.origin[0] + driftX,
			puff.origin[1] + u * puff.riseHeight,
			puff.origin[2] + driftZ
		);
		const scale = (0.45 + u * 1.25) * Math.sin(u * Math.PI);
		puff.mesh.scale.setScalar(Math.max(0.01, scale));
	}
}
