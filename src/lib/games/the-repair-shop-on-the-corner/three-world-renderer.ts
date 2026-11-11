import * as THREE from 'three';
import { drawCourtyardShortFilmFrame } from './film-reel';
import {
	RepairResourceTracker,
	createWorkbenchSceneGroup,
	type WorkbenchRigUpdater
} from './three-repair-objects';
import type { CharacterId, RepairShopGameState, RepairShopSettings, Vec2 } from './types';
import { getAfternoonLighting, getCharacterWorldPosition } from './world';

export type WorldPickResult =
	| { kind: 'interact'; targetId: string }
	| { kind: 'ground'; point: Vec2 }
	| { kind: 'workbench-pick'; pickType: string; pickId: string }
	| null;

export interface RepairShopRendererCallbacks {
	onContextLost?: () => void;
	onContextRestored?: () => void;
}

function tagWorldPick(obj: THREE.Object3D, targetId: string): void {
	obj.traverse((child) => {
		child.userData.worldTargetId = targetId;
	});
}

function makeSignTexture(
	tracker: RepairResourceTracker,
	bgHex: string,
	borderHex: string,
	textHex: string,
	english: string,
	bengali: string
): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.fillStyle = bgHex;
		ctx.fillRect(0, 0, 512, 128);
		ctx.strokeStyle = borderHex;
		ctx.lineWidth = 8;
		ctx.strokeRect(8, 8, 496, 112);
		ctx.fillStyle = textHex;
		ctx.textAlign = 'center';
		ctx.font = 'bold 28px sans-serif';
		ctx.fillText(english, 256, 54);
		ctx.font = '600 28px serif';
		ctx.fillText(bengali, 256, 96);
	}
	const tex = tracker.tex(new THREE.CanvasTexture(canvas));
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

function makeCalendarTexture(tracker: RepairResourceTracker): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 192;
	canvas.height = 256;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.fillStyle = '#f8f2e4';
		ctx.fillRect(0, 0, 192, 256);
		ctx.fillStyle = '#b83227';
		ctx.fillRect(0, 0, 192, 58);
		ctx.fillStyle = '#fff8eb';
		ctx.textAlign = 'center';
		ctx.font = 'bold 18px serif';
		ctx.fillText('শুভ নববর্ষ · 2026', 96, 36);

		ctx.fillStyle = '#2d2520';
		for (let row = 0; row < 5; row += 1) {
			for (let col = 0; col < 6; col += 1) {
				ctx.fillStyle = col === 0 ? '#b83227' : '#3a322b';
				ctx.fillRect(20 + col * 26, 78 + row * 30, 16, 14);
			}
		}
	}
	const tex = tracker.tex(new THREE.CanvasTexture(canvas));
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

function createCharacterFigure(
	tracker: RepairResourceTracker,
	topColor: number,
	bottomColor: number,
	accentColor?: number
): THREE.Group {
	const g = new THREE.Group();
	const skinMat = tracker.mat(new THREE.MeshStandardMaterial({ color: 0xb9825b, roughness: 0.72 }));
	const hairMat = tracker.mat(new THREE.MeshStandardMaterial({ color: 0x1f1a18, roughness: 0.85 }));
	const topMat = tracker.mat(new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.78 }));
	const botMat = tracker.mat(
		new THREE.MeshStandardMaterial({ color: bottomColor, roughness: 0.82 })
	);

	// Lower garment / legs
	const lower = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.19, 0.22, 0.68, 12)),
		botMat
	);
	lower.position.y = 0.34;
	lower.castShadow = true;
	g.add(lower);

	// Torso
	const torso = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.21, 0.19, 0.58, 12)),
		topMat
	);
	torso.position.y = 0.95;
	torso.castShadow = true;
	g.add(torso);

	// Optional shawl / sari pallu / apron accent
	if (accentColor !== undefined) {
		const sash = new THREE.Mesh(
			tracker.geo(new THREE.BoxGeometry(0.44, 0.42, 0.26)),
			tracker.mat(new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.76 }))
		);
		sash.position.set(0, 0.92, 0.02);
		g.add(sash);
	}

	// Shoulders / arms
	for (const sx of [-0.25, 0.25]) {
		const arm = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.06, 0.052, 0.48, 8)),
			topMat
		);
		arm.position.set(sx, 0.94, 0);
		arm.rotation.z = sx < 0 ? 0.12 : -0.12;
		g.add(arm);
	}

	// Head & hair
	const head = new THREE.Mesh(tracker.geo(new THREE.SphereGeometry(0.165, 14, 12)), skinMat);
	head.position.y = 1.42;
	head.castShadow = true;
	g.add(head);

	const hair = new THREE.Mesh(
		tracker.geo(new THREE.SphereGeometry(0.172, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58)),
		hairMat
	);
	hair.position.set(0, 1.44, -0.02);
	hair.rotation.x = -0.2;
	g.add(hair);

	// Subtle nose/front orientation cue
	const nose = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.04, 0.045, 0.06)), skinMat);
	nose.position.set(0, 1.41, 0.155);
	g.add(nose);

	return g;
}

export class RepairShopThreeRenderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly tracker = new RepairResourceTracker();

	private readonly worldScene = new THREE.Scene();
	private readonly worldCamera = new THREE.PerspectiveCamera(40, 16 / 9, 0.2, 85);

	private readonly benchScene = new THREE.Scene();
	private readonly benchCamera = new THREE.PerspectiveCamera(36, 16 / 9, 0.08, 20);
	private readonly workbenchRig: WorkbenchRigUpdater;

	private readonly raycaster = new THREE.Raycaster();
	private readonly groundMeshes: THREE.Object3D[] = [];
	private readonly worldInteractiveRoots: THREE.Object3D[] = [];

	// Dynamic world references
	private readonly sunLight: THREE.DirectionalLight;
	private readonly hemiLight: THREE.HemisphereLight;
	private readonly shopTaskLight: THREE.PointLight;
	private readonly teaLampLight: THREE.PointLight;
	private readonly courtyardWarmLight: THREE.PointLight;
	private readonly ceilingFanBlades: THREE.Group;
	private readonly walkMarker: THREE.Mesh;
	private readonly playerMesh: THREE.Group;
	private readonly characterMeshes: Record<CharacterId, THREE.Group>;
	private readonly returnedRadioProp: THREE.Group;
	private readonly returnedRadioWaves: THREE.Mesh;
	private readonly returnedClockProp: THREE.Group;
	private readonly returnedClockMinuteHand: THREE.Group;
	private readonly extraCourtyardChairs: THREE.Group;
	private readonly courtyardProjectorProp: THREE.Group;
	private readonly courtyardBeamCone: THREE.Mesh;
	private readonly stringLightBulbsMat: THREE.MeshStandardMaterial;
	private readonly steamPuffs: THREE.Mesh[] = [];

	// Courtyard cloth screen film canvas
	private readonly filmCanvas: HTMLCanvasElement;
	private readonly filmCtx: CanvasRenderingContext2D | null;
	private readonly filmTexture: THREE.CanvasTexture;
	private readonly screenClothMat: THREE.MeshBasicMaterial;
	private lastFilmFrameKey = '';

	private width = 1;
	private height = 1;
	private disposed = false;
	private contextLost = false;
	private camSmoothPos = new THREE.Vector3(-1.2, 6.8, 5.4);
	private camSmoothLook = new THREE.Vector3(-1.2, 0.85, -1.2);
	private camInitialized = false;
	private readonly callbacks: RepairShopRendererCallbacks;

	constructor(canvas: HTMLCanvasElement, callbacks: RepairShopRendererCallbacks = {}) {
		this.canvas = canvas;
		this.callbacks = callbacks;

		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			powerPreference: 'high-performance'
		});
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.06;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

		canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
		canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

		// ====================================================================
		// WORLD SCENE SETUP
		// ====================================================================
		this.worldScene.background = new THREE.Color(0xdbe6ec);
		this.worldScene.fog = new THREE.Fog(0xd8dfd9, 22, 48);

		this.hemiLight = new THREE.HemisphereLight(0xf4ead8, 0x6b5848, 0.88);
		this.worldScene.add(this.hemiLight);

		this.sunLight = new THREE.DirectionalLight(0xfff2d6, 1.55);
		this.sunLight.position.set(8, 14, 9);
		this.sunLight.castShadow = true;
		this.sunLight.shadow.mapSize.set(1024, 1024);
		this.sunLight.shadow.camera.near = 2;
		this.sunLight.shadow.camera.far = 38;
		this.sunLight.shadow.camera.left = -13;
		this.sunLight.shadow.camera.right = 12;
		this.sunLight.shadow.camera.top = 10;
		this.sunLight.shadow.camera.bottom = -10;
		this.sunLight.shadow.bias = -0.0008;
		this.worldScene.add(this.sunLight);

		this.shopTaskLight = new THREE.PointLight(0xffcb7d, 2.2, 6.5, 1.6);
		this.shopTaskLight.position.set(-2.15, 1.85, -3.55);
		this.worldScene.add(this.shopTaskLight);

		this.teaLampLight = new THREE.PointLight(0xffb86b, 1.4, 7.5, 1.6);
		this.teaLampLight.position.set(8.1, 2.15, 2.8);
		this.worldScene.add(this.teaLampLight);

		this.courtyardWarmLight = new THREE.PointLight(0xffca80, 0.6, 10, 1.5);
		this.courtyardWarmLight.position.set(-7.85, 2.8, -1.8);
		this.worldScene.add(this.courtyardWarmLight);

		// Shared Materials
		const oxideFloorMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x7e3b2e, roughness: 0.72 })
		);
		const tarmacMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x635f59, roughness: 0.9 })
		);
		const footpathStoneMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x9c9180, roughness: 0.85 })
		);
		const brickFloorMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x9c553b, roughness: 0.84 })
		);
		const ochrePlasterMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xe3cca6, roughness: 0.82 })
		);
		const pistachioPlasterMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xcbd5bd, roughness: 0.82 })
		);
		const terracottaPlasterMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xc9886b, roughness: 0.82 })
		);
		const dadoGreenMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x36594c, roughness: 0.74 })
		);
		const teakWoodMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x654026, roughness: 0.68 })
		);
		const shutterGreenMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x2a5244, roughness: 0.65 })
		);
		const darkMetalMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x2c3033, metalness: 0.55, roughness: 0.48 })
		);
		const shutterSteelMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x7a8288, metalness: 0.5, roughness: 0.45 })
		);
		const brassWorldMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xc99c42, metalness: 0.7, roughness: 0.32 })
		);
		const terracottaPotMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xb55937, roughness: 0.78 })
		);
		const foliageMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0x3b6e3c, roughness: 0.78 })
		);

		// Base Surround Ground
		const surroundPlane = new THREE.Mesh(
			this.tracker.geo(new THREE.PlaneGeometry(44, 34)),
			this.tracker.mat(new THREE.MeshStandardMaterial({ color: 0x56524c, roughness: 0.95 }))
		);
		surroundPlane.rotation.x = -Math.PI * 0.5;
		surroundPlane.position.set(-1, -0.04, 1);
		surroundPlane.receiveShadow = true;
		this.worldScene.add(surroundPlane);

		// Walkable Lane Surface
		const laneRoad = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(19.6, 0.05, 4.4)),
			tarmacMat
		);
		laneRoad.position.set(-1.0, -0.015, 2.95);
		laneRoad.receiveShadow = true;
		this.worldScene.add(laneRoad);
		this.groundMeshes.push(laneRoad);

		// Shopfront stone plinth / footpath strip along z = 0.85
		const frontKerb = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(17.5, 0.07, 0.7)),
			footpathStoneMat
		);
		frontKerb.position.set(-1.5, 0.0, 0.88);
		frontKerb.receiveShadow = true;
		this.worldScene.add(frontKerb);
		this.groundMeshes.push(frontKerb);

		// ====================================================================
		// 1. REPAIR SHOP INTERIOR (`x: -4.8..0.7, z: -4.5..0.65`)
		// ====================================================================
		const shopFloor = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(5.5, 0.08, 5.2)),
			oxideFloorMat
		);
		shopFloor.position.set(-2.05, 0.01, -1.95);
		shopFloor.receiveShadow = true;
		this.worldScene.add(shopFloor);
		this.groundMeshes.push(shopFloor);

		// Shop back wall, left wall, right party wall, and cutaway front pillars for clear elevated view
		const wallH = 3.1;
		const frontWallH = 2.15;
		for (const [wx, wy, wz, ww, wh, wd, mat] of [
			[-2.05, wallH * 0.5, -4.55, 5.6, wallH, 0.22, ochrePlasterMat], // Back wall
			[-4.8, wallH * 0.5, -1.95, 0.22, wallH, 5.3, ochrePlasterMat], // West party wall
			[0.7, wallH * 0.5, -1.95, 0.22, wallH, 5.3, ochrePlasterMat], // East party wall
			[-3.45, frontWallH * 0.5, 0.62, 2.7, frontWallH, 0.24, ochrePlasterMat], // Front-left cutaway pier
			[0.35, frontWallH * 0.5, 0.62, 0.8, frontWallH, 0.24, ochrePlasterMat], // Front-right cutaway pier
			[-1.05, 1.98, 0.62, 2.15, 0.34, 0.26, ochrePlasterMat], // Doorway lintel
			[-2.05, 0.55, -4.42, 5.3, 1.1, 0.04, dadoGreenMat] // Interior painted dado band
		] as const) {
			const w = new THREE.Mesh(this.tracker.geo(new THREE.BoxGeometry(ww, wh, wd)), mat);
			w.position.set(wx, wy, wz);
			w.castShadow = true;
			w.receiveShadow = true;
			this.worldScene.add(w);
		}

		// Window opening with wrought-iron grille & wooden louvred shutters on shop front-left pier!
		const shopWindowFrame = new THREE.Group();
		shopWindowFrame.position.set(-3.35, 1.18, 0.75);
		const winRecess = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(1.05, 0.94, 0.08)),
			this.tracker.mat(new THREE.MeshStandardMaterial({ color: 0x2a241e, roughness: 0.85 }))
		);
		shopWindowFrame.add(winRecess);
		// Iron grille bars
		for (let gx = -0.4; gx <= 0.41; gx += 0.2) {
			const vBar = new THREE.Mesh(
				this.tracker.geo(new THREE.CylinderGeometry(0.014, 0.014, 0.88, 6)),
				darkMetalMat
			);
			vBar.position.set(gx, 0, 0.05);
			shopWindowFrame.add(vBar);
		}
		for (const gy of [-0.26, 0, 0.26]) {
			const hBar = new THREE.Mesh(
				this.tracker.geo(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 6)),
				darkMetalMat
			);
			hBar.rotation.z = Math.PI * 0.5;
			hBar.position.set(0, gy, 0.05);
			shopWindowFrame.add(hBar);
		}
		// Open wooden window shutters flanking the grille
		for (const sx of [-0.66, 0.66]) {
			const shutter = new THREE.Mesh(
				this.tracker.geo(new THREE.BoxGeometry(0.28, 0.92, 0.04)),
				shutterGreenMat
			);
			shutter.position.set(sx, 0, 0.06);
			shutter.rotation.y = sx < 0 ? 0.25 : -0.25;
			shopWindowFrame.add(shutter);
		}
		this.worldScene.add(shopWindowFrame);

		// Rolled-up Corrugated Metal Shop Shutter above doorway (`x = -1.05, z = 0.74`)
		const rollingShutter = new THREE.Group();
		rollingShutter.position.set(-1.05, 1.92, 0.76);
		const shutterDrum = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.14, 0.14, 2.08, 16)),
			shutterSteelMat
		);
		shutterDrum.rotation.z = Math.PI * 0.5;
		rollingShutter.add(shutterDrum);
		for (let slat = 0; slat < 3; slat += 1) {
			const strip = new THREE.Mesh(
				this.tracker.geo(new THREE.BoxGeometry(2.04, 0.065, 0.04)),
				shutterSteelMat
			);
			strip.position.set(0, -0.12 - slat * 0.068, 0.05);
			rollingShutter.add(strip);
		}
		this.worldScene.add(rollingShutter);

		// Shop Signboard (`CORNER REPAIR WORKS · মেরামতের দোকান`)
		const shopSign = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(3.25, 0.48, 0.08)),
			this.tracker.mat(
				new THREE.MeshStandardMaterial({
					map: makeSignTexture(
						this.tracker,
						'#243d34',
						'#d9a441',
						'#fdf4dc',
						'CORNER REPAIR WORKS',
						'মেরামতের দোকান'
					),
					roughness: 0.55
				})
			)
		);
		shopSign.position.set(-2.15, 2.38, 0.75);
		this.worldScene.add(shopSign);

		// Ceiling crossbeam & 3-blade ceiling fan
		const ceilingBeam = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(5.4, 0.12, 0.16)),
			teakWoodMat
		);
		ceilingBeam.position.set(-2.05, 2.98, -1.85);
		this.worldScene.add(ceilingBeam);

		const fanDownrod = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8)),
			this.tracker.mat(new THREE.MeshStandardMaterial({ color: 0xeae3d2, roughness: 0.5 }))
		);
		fanDownrod.position.set(-1.75, 2.75, -1.85);
		this.worldScene.add(fanDownrod);

		this.ceilingFanBlades = new THREE.Group();
		this.ceilingFanBlades.position.set(-1.75, 2.54, -1.85);
		const fanWhiteMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xf0eadb, roughness: 0.45 })
		);
		const fanHub = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 16)),
			fanWhiteMat
		);
		this.ceilingFanBlades.add(fanHub);
		for (let b = 0; b < 3; b += 1) {
			const blade = new THREE.Mesh(
				this.tracker.geo(new THREE.BoxGeometry(0.68, 0.018, 0.13)),
				fanWhiteMat
			);
			const a = (b * Math.PI * 2) / 3;
			blade.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
			blade.rotation.y = -a;
			this.ceilingFanBlades.add(blade);
		}
		this.worldScene.add(this.ceilingFanBlades);

		// Wooden Workbench + Task Lamp inside shop (`x = -2.15, z = -3.8`)
		const shopWorkbenchGroup = new THREE.Group();
		shopWorkbenchGroup.position.set(-2.15, 0, -3.82);
		const wbTop = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(2.2, 0.1, 0.95)),
			teakWoodMat
		);
		wbTop.position.y = 0.86;
		wbTop.castShadow = true;
		wbTop.receiveShadow = true;
		shopWorkbenchGroup.add(wbTop);
		for (const [lx, lz] of [
			[-0.98, -0.38],
			[0.98, -0.38],
			[-0.98, 0.38],
			[0.98, 0.38]
		]) {
			const leg = new THREE.Mesh(
				this.tracker.geo(new THREE.BoxGeometry(0.1, 0.84, 0.1)),
				teakWoodMat
			);
			leg.position.set(lx, 0.42, lz);
			shopWorkbenchGroup.add(leg);
		}
		const wbMatPad = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(1.15, 0.02, 0.62)),
			shutterGreenMat
		);
		wbMatPad.position.set(0, 0.92, 0.04);
		shopWorkbenchGroup.add(wbMatPad);
		// Articulated task lamp
		const lampStem = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.02, 0.025, 0.56, 8)),
			brassWorldMat
		);
		lampStem.position.set(-0.68, 1.18, -0.22);
		lampStem.rotation.z = -0.24;
		shopWorkbenchGroup.add(lampStem);
		const lampShade = new THREE.Mesh(
			this.tracker.geo(new THREE.ConeGeometry(0.14, 0.18, 14, 1, true)),
			shutterGreenMat
		);
		lampShade.position.set(-0.46, 1.42, -0.1);
		lampShade.rotation.z = -0.35;
		shopWorkbenchGroup.add(lampShade);
		tagWorldPick(shopWorkbenchGroup, 'workbench');
		this.worldScene.add(shopWorkbenchGroup);
		this.worldInteractiveRoots.push(shopWorkbenchGroup);

		// Labelled Spare-Parts Drawers Cabinet (`x = -4.45, z = -2.45`)
		const drawersCabinet = new THREE.Group();
		drawersCabinet.position.set(-4.42, 0, -2.45);
		const cabBody = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.52, 1.55, 1.35)),
			teakWoodMat
		);
		cabBody.position.y = 0.78;
		cabBody.castShadow = true;
		drawersCabinet.add(cabBody);
		const labelPaperMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xf7eed7, roughness: 0.7 })
		);
		for (let row = 0; row < 3; row += 1) {
			for (let col = 0; col < 3; col += 1) {
				const labelCard = new THREE.Mesh(
					this.tracker.geo(new THREE.BoxGeometry(0.02, 0.11, 0.28)),
					labelPaperMat
				);
				labelCard.position.set(0.27, 0.42 + row * 0.36, -0.38 + col * 0.38);
				drawersCabinet.add(labelCard);
			}
		}
		tagWorldPick(drawersCabinet, 'drawers');
		this.worldScene.add(drawersCabinet);
		this.worldInteractiveRoots.push(drawersCabinet);

		// Shop Shelves, Wall Calendar & Front Counter with Newspaper Wrapping
		for (const sy of [1.55, 2.05]) {
			const shelf = new THREE.Mesh(
				this.tracker.geo(new THREE.BoxGeometry(1.3, 0.05, 0.32)),
				teakWoodMat
			);
			shelf.position.set(-0.15, sy, -4.32);
			this.worldScene.add(shelf);
		}
		const calendarMesh = new THREE.Mesh(
			this.tracker.geo(new THREE.PlaneGeometry(0.46, 0.62)),
			this.tracker.mat(new THREE.MeshStandardMaterial({ map: makeCalendarTexture(this.tracker) }))
		);
		calendarMesh.position.set(-1.15, 1.88, -4.41);
		this.worldScene.add(calendarMesh);

		const frontCounter = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.75, 0.88, 1.35)),
			teakWoodMat
		);
		frontCounter.position.set(0.22, 0.44, -1.35);
		frontCounter.castShadow = true;
		this.worldScene.add(frontCounter);

		const newspaperStack = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.42, 0.06, 0.52)),
			this.tracker.mat(new THREE.MeshStandardMaterial({ color: 0xdfd7c5, roughness: 0.88 }))
		);
		newspaperStack.position.set(0.18, 0.91, -1.25);
		newspaperStack.rotation.y = 0.18;
		this.worldScene.add(newspaperStack);

		// ====================================================================
		// 2. SEN BROTHERS STORES — NEIGHBOURING SHOP (`x: 0.9..6.2, z: -3.2..0.62`)
		// ====================================================================
		const senFloor = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(5.3, 0.08, 3.8)),
			oxideFloorMat
		);
		senFloor.position.set(3.55, 0.01, -1.28);
		this.worldScene.add(senFloor);

		for (const [wx, wy, wz, ww, wh, wd] of [
			[3.55, 1.55, -3.15, 5.4, 3.1, 0.22], // Back wall
			[6.2, 1.55, -1.25, 0.22, 3.1, 3.9], // East wall
			[1.45, 1.55, 0.62, 1.2, 3.1, 0.22], // Left pier
			[5.75, 1.55, 0.62, 1.0, 3.1, 0.22], // Right pier
			[3.65, 2.75, 0.62, 3.3, 0.7, 0.24] // Counter opening lintel
		] as const) {
			const w = new THREE.Mesh(
				this.tracker.geo(new THREE.BoxGeometry(ww, wh, wd)),
				pistachioPlasterMat
			);
			w.position.set(wx, wy, wz);
			w.castShadow = true;
			w.receiveShadow = true;
			this.worldScene.add(w);
		}

		// Visible Shop Counter at Sen Brothers (`x = 3.65, z = 0.52`)
		const senCounterMesh = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(3.15, 0.96, 0.62)),
			teakWoodMat
		);
		senCounterMesh.position.set(3.65, 0.48, 0.48);
		senCounterMesh.castShadow = true;
		tagWorldPick(senCounterMesh, 'char:mala');
		this.worldScene.add(senCounterMesh);
		this.worldInteractiveRoots.push(senCounterMesh);

		// Glass jars on Sen Brothers counter
		const glassJarMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xeef6f5, roughness: 0.18, metalness: 0.1 })
		);
		for (const jx of [2.55, 2.88, 4.58]) {
			const jar = new THREE.Mesh(
				this.tracker.geo(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 12)),
				glassJarMat
			);
			jar.position.set(jx, 1.09, 0.48);
			this.worldScene.add(jar);
		}

		const senSign = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(3.4, 0.58, 0.08)),
			this.tracker.mat(
				new THREE.MeshStandardMaterial({
					map: makeSignTexture(
						this.tracker,
						'#5b2c22',
						'#e8c476',
						'#fff4de',
						'SEN BROTHERS STORES',
						'সেন ব্রাদার্স'
					),
					roughness: 0.55
				})
			)
		);
		senSign.position.set(3.65, 3.35, 0.75);
		this.worldScene.add(senSign);

		// Repaired Wind-up Clock prop behind Sen Brothers counter (visible once returned!)
		this.returnedClockProp = new THREE.Group();
		this.returnedClockProp.position.set(3.65, 1.88, -2.96);
		const wcCase = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 24)),
			brassWorldMat
		);
		wcCase.rotation.x = Math.PI * 0.5;
		const wcDial = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.31, 0.31, 0.13, 24)),
			labelPaperMat
		);
		wcDial.rotation.x = Math.PI * 0.5;
		this.returnedClockMinuteHand = new THREE.Group();
		this.returnedClockMinuteHand.position.z = 0.08;
		const wcHand = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.025, 0.23, 0.02)),
			darkMetalMat
		);
		wcHand.position.y = 0.09;
		this.returnedClockMinuteHand.add(wcHand);
		this.returnedClockProp.add(wcCase, wcDial, this.returnedClockMinuteHand);
		this.returnedClockProp.visible = false;
		this.worldScene.add(this.returnedClockProp);

		// ====================================================================
		// 3. BAPI'S TEA STALL (`x: 7.8..9.6, z: 1.6..4.1`)
		// ====================================================================
		const teaStallGroup = new THREE.Group();
		teaStallGroup.position.set(8.55, 0, 2.8);
		const teaCounter = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(1.3, 0.92, 2.3)),
			teakWoodMat
		);
		teaCounter.position.set(0, 0.46, 0);
		teaCounter.castShadow = true;
		teaStallGroup.add(teaCounter);

		// Bamboo posts & blue tarpaulin awning
		for (const [px, pz] of [
			[-0.6, -1.1],
			[0.6, -1.1],
			[-0.6, 1.1],
			[0.6, 1.1]
		]) {
			const post = new THREE.Mesh(
				this.tracker.geo(new THREE.CylinderGeometry(0.045, 0.05, 2.45, 8)),
				teakWoodMat
			);
			post.position.set(px, 1.22, pz);
			teaStallGroup.add(post);
		}
		const tarpRoof = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(1.85, 0.08, 2.75)),
			this.tracker.mat(new THREE.MeshStandardMaterial({ color: 0x2f5e82, roughness: 0.72 }))
		);
		tarpRoof.position.set(-0.08, 2.45, 0);
		tarpRoof.rotation.z = 0.1;
		tarpRoof.castShadow = true;
		teaStallGroup.add(tarpRoof);

		const teaSign = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.06, 0.46, 1.9)),
			this.tracker.mat(
				new THREE.MeshStandardMaterial({
					map: makeSignTexture(
						this.tracker,
						'#e8b954',
						'#4a2b18',
						'#24150c',
						"BAPI'S TEA STALL",
						'বাপির চা'
					),
					roughness: 0.6
				})
			)
		);
		teaSign.position.set(-0.72, 2.18, 0);
		teaStallGroup.add(teaSign);

		// Aluminium Kettle + Tea Glasses + Stacked Clay Bhaar Cups!
		const kettle = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.16, 0.2, 0.26, 14)),
			shutterSteelMat
		);
		kettle.position.set(-0.15, 1.05, 0.55);
		teaStallGroup.add(kettle);

		// Steam puffs above kettle
		const steamMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.42,
				roughness: 1
			})
		);
		for (let s = 0; s < 3; s += 1) {
			const puff = new THREE.Mesh(this.tracker.geo(new THREE.SphereGeometry(0.07, 8, 8)), steamMat);
			puff.position.set(-0.15, 1.3 + s * 0.18, 0.55);
			teaStallGroup.add(puff);
			this.steamPuffs.push(puff);
		}

		// Clay cups (bhaar) stack & tea glasses
		for (let c = 0; c < 5; c += 1) {
			const bhaar = new THREE.Mesh(
				this.tracker.geo(new THREE.CylinderGeometry(0.055, 0.038, 0.09, 10)),
				terracottaPotMat
			);
			bhaar.position.set(-0.32 + (c % 3) * 0.13, 0.97 + Math.floor(c / 3) * 0.08, -0.15);
			teaStallGroup.add(bhaar);
		}
		for (let gIdx = 0; gIdx < 3; gIdx += 1) {
			const glass = new THREE.Mesh(
				this.tracker.geo(new THREE.CylinderGeometry(0.042, 0.036, 0.1, 10)),
				glassJarMat
			);
			glass.position.set(-0.32 + gIdx * 0.12, 0.97, 0.15);
			teaStallGroup.add(glass);
		}

		// Returned Portable Radio on Bapi's Tea Counter!
		this.returnedRadioProp = new THREE.Group();
		this.returnedRadioProp.position.set(-0.22, 1.05, -0.68);
		this.returnedRadioProp.rotation.y = -Math.PI * 0.4;
		const rrBody = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.38, 0.24, 0.14)),
			teakWoodMat
		);
		const rrFace = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.34, 0.2, 0.02)),
			labelPaperMat
		);
		rrFace.position.z = 0.075;
		const rrLed = new THREE.Mesh(
			this.tracker.geo(new THREE.SphereGeometry(0.022, 8, 8)),
			this.tracker.mat(new THREE.MeshStandardMaterial({ color: 0xff3b28, emissive: 0xdc2626 }))
		);
		rrLed.position.set(0.12, 0.05, 0.085);
		this.returnedRadioWaves = new THREE.Mesh(
			this.tracker.geo(new THREE.TorusGeometry(0.18, 0.012, 6, 20, Math.PI * 0.75)),
			this.tracker.mat(
				new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, roughness: 0.3 })
			)
		);
		this.returnedRadioWaves.position.set(0, 0.22, 0);
		this.returnedRadioProp.add(rrBody, rrFace, rrLed, this.returnedRadioWaves);
		this.returnedRadioProp.visible = false;
		teaStallGroup.add(this.returnedRadioProp);

		tagWorldPick(teaStallGroup, 'char:bapi');
		this.worldScene.add(teaStallGroup);
		this.worldInteractiveRoots.push(teaStallGroup);

		// ====================================================================
		// 4. SHARED COURTYARD (`x: -10.5..-5.2, z: -4.5..0.8`)
		// ====================================================================
		const courtyardFloor = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(5.4, 0.08, 5.4)),
			brickFloorMat
		);
		courtyardFloor.position.set(-7.85, 0.01, -1.85);
		courtyardFloor.receiveShadow = true;
		this.worldScene.add(courtyardFloor);
		this.groundMeshes.push(courtyardFloor);

		// Courtyard north wall (holds cloth projection screen facing +Z!), west wall, and front archway
		for (const [wx, wy, wz, ww, wh, wd] of [
			[-7.85, 1.9, -4.55, 5.6, 3.8, 0.24], // North backdrop wall
			[-10.55, 1.75, -1.85, 0.24, 3.5, 5.5], // West wall with balcony plants
			[-9.65, 1.6, 0.62, 1.9, 3.2, 0.26], // Archway left pier
			[-6.05, 1.6, 0.62, 2.0, 3.2, 0.26], // Archway right pier
			[-7.85, 2.85, 0.62, 1.85, 0.72, 0.28] // Archway top lintel
		] as const) {
			const cw = new THREE.Mesh(
				this.tracker.geo(new THREE.BoxGeometry(ww, wh, wd)),
				terracottaPlasterMat
			);
			cw.position.set(wx, wy, wz);
			cw.castShadow = true;
			cw.receiveShadow = true;
			this.worldScene.add(cw);
		}

		// Balcony ledge & terracotta plants overlooking the courtyard & lane
		const balconySlab = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.75, 0.1, 3.4)),
			footpathStoneMat
		);
		balconySlab.position.set(-10.1, 2.35, -1.85);
		this.worldScene.add(balconySlab);
		for (const pz of [-2.9, -1.85, -0.8]) {
			const pot = new THREE.Mesh(
				this.tracker.geo(new THREE.CylinderGeometry(0.14, 0.1, 0.22, 10)),
				terracottaPotMat
			);
			pot.position.set(-9.9, 2.51, pz);
			const bush = new THREE.Mesh(
				this.tracker.geo(new THREE.SphereGeometry(0.22, 10, 8)),
				foliageMat
			);
			bush.position.set(-9.9, 2.75, pz);
			this.worldScene.add(pot, bush);
		}

		// Courtyard Cloth Projection Screen (`x = -7.85, y = 1.72, z = -4.28`, facing +Z!)
		this.filmCanvas = document.createElement('canvas');
		this.filmCanvas.width = 512;
		this.filmCanvas.height = 340;
		this.filmCtx = this.filmCanvas.getContext('2d');
		if (this.filmCtx) {
			this.filmCtx.fillStyle = '#efe6d5';
			this.filmCtx.fillRect(0, 0, 512, 340);
		}
		this.filmTexture = this.tracker.tex(new THREE.CanvasTexture(this.filmCanvas));
		this.filmTexture.colorSpace = THREE.SRGBColorSpace;
		this.screenClothMat = this.tracker.mat(
			new THREE.MeshBasicMaterial({ map: this.filmTexture, color: 0xf4ecdc })
		);

		const screenMesh = new THREE.Mesh(
			this.tracker.geo(new THREE.PlaneGeometry(3.3, 2.15)),
			this.screenClothMat
		);
		screenMesh.position.set(-7.85, 1.82, -4.32);
		this.worldScene.add(screenMesh);

		// Bamboo poles stretching the cloth screen
		for (const px of [-9.58, -6.12]) {
			const pole = new THREE.Mesh(
				this.tracker.geo(new THREE.CylinderGeometry(0.04, 0.045, 2.75, 8)),
				teakWoodMat
			);
			pole.position.set(px, 1.42, -4.3);
			this.worldScene.add(pole);
		}

		// Courtyard Overhead String Lights
		this.stringLightBulbsMat = this.tracker.mat(
			new THREE.MeshStandardMaterial({
				color: 0xfef3c7,
				emissive: 0x000000,
				roughness: 0.35
			})
		);
		for (let b = 0; b < 7; b += 1) {
			const bx = -10.1 + b * 0.75;
			const by = 3.05 - Math.sin((b / 6) * Math.PI) * 0.25;
			const bulb = new THREE.Mesh(
				this.tracker.geo(new THREE.SphereGeometry(0.055, 8, 8)),
				this.stringLightBulbsMat
			);
			bulb.position.set(bx, by, -1.65);
			this.worldScene.add(bulb);
		}

		// Courtyard Wooden Projector Table (`x = -7.85, z = -0.65`)
		const projTableGroup = new THREE.Group();
		projTableGroup.position.set(-7.85, 0, -0.65);
		const ptTop = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.82, 0.07, 0.68)),
			teakWoodMat
		);
		ptTop.position.y = 0.82;
		ptTop.castShadow = true;
		projTableGroup.add(ptTop);
		for (const [lx, lz] of [
			[-0.34, -0.26],
			[0.34, -0.26],
			[-0.34, 0.26],
			[0.34, 0.26]
		]) {
			const leg = new THREE.Mesh(
				this.tracker.geo(new THREE.BoxGeometry(0.06, 0.8, 0.06)),
				teakWoodMat
			);
			leg.position.set(lx, 0.4, lz);
			projTableGroup.add(leg);
		}

		// Returned Projector Prop on Courtyard Table + Volumetric Screening Beam
		this.courtyardProjectorProp = new THREE.Group();
		this.courtyardProjectorProp.position.set(0, 1.05, 0);
		const cpBody = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(0.24, 0.34, 0.34)),
			this.tracker.mat(new THREE.MeshStandardMaterial({ color: 0x355356, roughness: 0.55 }))
		);
		const cpR1 = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16)),
			shutterSteelMat
		);
		cpR1.rotation.z = Math.PI * 0.5;
		cpR1.position.set(0.13, 0.22, 0.08);
		const cpR2 = cpR1.clone();
		cpR2.position.set(0.13, 0.04, -0.14);
		this.courtyardProjectorProp.add(cpBody, cpR1, cpR2);
		this.courtyardProjectorProp.visible = false;
		projTableGroup.add(this.courtyardProjectorProp);

		tagWorldPick(projTableGroup, 'courtyard-screening');
		this.worldScene.add(projTableGroup);
		this.worldInteractiveRoots.push(projTableGroup);

		this.courtyardBeamCone = new THREE.Mesh(
			this.tracker.geo(new THREE.ConeGeometry(1.35, 3.45, 20, 1, true)),
			this.tracker.mat(
				new THREE.MeshBasicMaterial({
					color: 0xffe8a3,
					transparent: true,
					opacity: 0.17,
					side: THREE.DoubleSide,
					depthWrite: false
				})
			)
		);
		this.courtyardBeamCone.rotation.x = Math.PI * 0.5;
		this.courtyardBeamCone.position.set(-7.85, 1.48, -2.52);
		this.courtyardBeamCone.visible = false;
		this.worldScene.add(this.courtyardBeamCone);

		// Courtyard Chairs (2 initial + 4 extra from Mala Sen!)
		const makeChair = (x: number, z: number, mat: THREE.Material) => {
			const ch = new THREE.Group();
			ch.position.set(x, 0, z);
			const seat = new THREE.Mesh(this.tracker.geo(new THREE.BoxGeometry(0.46, 0.05, 0.44)), mat);
			seat.position.y = 0.44;
			const back = new THREE.Mesh(this.tracker.geo(new THREE.BoxGeometry(0.46, 0.44, 0.05)), mat);
			back.position.set(0, 0.66, 0.2); // backrest on +Z so chair faces -Z (toward cloth screen!)
			ch.add(seat, back);
			for (const [lx, lz] of [
				[-0.19, -0.18],
				[0.19, -0.18],
				[-0.19, 0.18],
				[0.19, 0.18]
			]) {
				const l = new THREE.Mesh(this.tracker.geo(new THREE.BoxGeometry(0.045, 0.44, 0.045)), mat);
				l.position.set(lx, 0.22, lz);
				ch.add(l);
			}
			return ch;
		};

		this.worldScene.add(makeChair(-8.9, -2.35, teakWoodMat));
		this.worldScene.add(makeChair(-6.8, -2.35, teakWoodMat));

		this.extraCourtyardChairs = new THREE.Group();
		for (const [cx, cz] of [
			[-8.15, -2.35],
			[-7.5, -2.35],
			[-8.9, -1.6],
			[-6.85, -1.6]
		]) {
			this.extraCourtyardChairs.add(makeChair(cx, cz, shutterGreenMat));
		}
		this.extraCourtyardChairs.visible = false;
		this.worldScene.add(this.extraCourtyardChairs);

		// South Lane Verandah Bench & Municipal Lamp Post
		const laneBench = new THREE.Mesh(
			this.tracker.geo(new THREE.BoxGeometry(1.6, 0.46, 0.52)),
			oxideFloorMat
		);
		laneBench.position.set(-4.2, 0.23, 4.65);
		this.worldScene.add(laneBench);

		const lampPost = new THREE.Mesh(
			this.tracker.geo(new THREE.CylinderGeometry(0.055, 0.08, 3.5, 10)),
			darkMetalMat
		);
		lampPost.position.set(1.4, 1.75, 4.55);
		lampPost.castShadow = true;
		this.worldScene.add(lampPost);

		// Walk Destination Ring Marker
		this.walkMarker = new THREE.Mesh(
			this.tracker.geo(new THREE.RingGeometry(0.18, 0.28, 24)),
			this.tracker.mat(
				new THREE.MeshBasicMaterial({
					color: 0xfbbf24,
					side: THREE.DoubleSide,
					transparent: true,
					opacity: 0.85
				})
			)
		);
		this.walkMarker.rotation.x = -Math.PI * 0.5;
		this.walkMarker.position.y = 0.06;
		this.walkMarker.visible = false;
		this.worldScene.add(this.walkMarker);

		// ====================================================================
		// 5. PLAYER & NEIGHBOUR CHARACTERS
		// ====================================================================
		this.playerMesh = createCharacterFigure(this.tracker, 0x3b6078, 0x2a2723, 0xd4a359);
		this.worldScene.add(this.playerMesh);

		this.characterMeshes = {
			bapi: createCharacterFigure(this.tracker, 0xc87d32, 0xded6c6, 0x9b3428),
			mala: createCharacterFigure(this.tracker, 0xf0e2c8, 0x8b2c2a, 0x8b2c2a),
			ruma: createCharacterFigure(this.tracker, 0x2d4a68, 0xd8ceb8, 0xc28a3e),
			nikhil: createCharacterFigure(this.tracker, 0xf2ece1, 0xdcd4c4),
			sabita: createCharacterFigure(this.tracker, 0xd98a2b, 0x36594c, 0xd98a2b)
		};

		for (const charId of ['bapi', 'mala', 'ruma', 'nikhil', 'sabita'] as const) {
			const mesh = this.characterMeshes[charId];
			tagWorldPick(mesh, `char:${charId}`);
			this.worldScene.add(mesh);
			this.worldInteractiveRoots.push(mesh);
		}

		// ====================================================================
		// WORKBENCH CLOSE-UP SCENE SETUP
		// ====================================================================
		this.benchScene.background = new THREE.Color(0x231b15);
		const benchHemi = new THREE.HemisphereLight(0xffe9c4, 0x3d2c1e, 1.05);
		this.benchScene.add(benchHemi);

		const benchLampSpot = new THREE.DirectionalLight(0xfff1d0, 1.85);
		benchLampSpot.position.set(-1.2, 2.8, 2.1);
		benchLampSpot.castShadow = true;
		benchLampSpot.shadow.mapSize.set(1024, 1024);
		this.benchScene.add(benchLampSpot);

		const benchFill = new THREE.DirectionalLight(0xc8d9e6, 0.55);
		benchFill.position.set(1.8, 1.2, -1.8);
		this.benchScene.add(benchFill);

		this.workbenchRig = createWorkbenchSceneGroup(this.tracker);
		this.benchScene.add(this.workbenchRig.root);
	}

	private handleContextLost = (event: Event): void => {
		event.preventDefault();
		this.contextLost = true;
		this.callbacks.onContextLost?.();
	};

	private handleContextRestored = (): void => {
		this.contextLost = false;
		this.callbacks.onContextRestored?.();
	};

	resize(width: number, height: number): void {
		if (this.disposed) return;
		this.width = Math.max(1, Math.floor(width));
		this.height = Math.max(1, Math.floor(height));
		this.renderer.setSize(this.width, this.height, false);

		const aspect = this.width / this.height;
		this.worldCamera.aspect = aspect;
		// Slightly widen vertical FOV in portrait mode so the lane and workbench fit comfortably!
		this.worldCamera.fov = aspect < 0.85 ? 50 : 40;
		this.worldCamera.updateProjectionMatrix();

		this.benchCamera.aspect = aspect;
		this.benchCamera.fov = aspect < 0.85 ? 46 : 35;
		this.benchCamera.updateProjectionMatrix();
	}

	pickAtClientPoint(
		clientX: number,
		clientY: number,
		mode: RepairShopGameState['mode']
	): WorldPickResult {
		if (this.disposed || this.contextLost) return null;
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;

		const ndc = new THREE.Vector2(
			((clientX - rect.left) / rect.width) * 2 - 1,
			-(((clientY - rect.top) / rect.height) * 2 - 1)
		);

		if (mode === 'workbench') {
			this.raycaster.setFromCamera(ndc, this.benchCamera);
			const hits = this.raycaster.intersectObject(this.workbenchRig.root, true);
			for (const hit of hits) {
				if (!hit.object.visible) continue;
				let cur: THREE.Object3D | null = hit.object;
				let visibleChain = true;
				while (cur) {
					if (!cur.visible) {
						visibleChain = false;
						break;
					}
					cur = cur.parent;
				}
				if (!visibleChain) continue;
				const { pickType, pickId } = hit.object.userData;
				if (typeof pickType === 'string' && typeof pickId === 'string') {
					return { kind: 'workbench-pick', pickType, pickId };
				}
			}
			return null;
		}

		this.raycaster.setFromCamera(ndc, this.worldCamera);
		const interactHits = this.raycaster.intersectObjects(this.worldInteractiveRoots, true);
		for (const hit of interactHits) {
			const targetId = hit.object.userData.worldTargetId;
			if (typeof targetId === 'string') {
				return { kind: 'interact', targetId };
			}
		}

		const groundHits = this.raycaster.intersectObjects(this.groundMeshes, false);
		if (groundHits.length > 0) {
			const pt = groundHits[0].point;
			return { kind: 'ground', point: { x: pt.x, z: pt.z } };
		}
		return null;
	}

	renderFrame(
		state: RepairShopGameState,
		settings: RepairShopSettings,
		elapsedSec: number,
		nudgeAnim: number,
		keySpinAnim: number
	): void {
		if (this.disposed || this.contextLost) return;

		if (state.mode === 'workbench' && state.workbench) {
			const wb = state.workbench;
			this.workbenchRig.update(state, elapsedSec, nudgeAnim, keySpinAnim);

			const dist = 2.48 / Math.max(0.7, Math.min(1.5, wb.zoom));
			const yaw = wb.yawOffset;
			const pitch = Math.max(-0.25, Math.min(0.65, wb.pitchOffset));
			const targetY = wb.activeJob === 'clock' ? 0.08 : -0.02;

			const cx = Math.sin(yaw) * Math.cos(pitch) * dist;
			const cy = targetY + Math.sin(pitch) * dist + 0.14;
			const cz = Math.cos(yaw) * Math.cos(pitch) * dist;

			this.benchCamera.position.set(cx, cy, cz);
			this.benchCamera.lookAt(0, targetY, 0);
			this.renderer.render(this.benchScene, this.benchCamera);
			return;
		}

		// Update Afternoon / Dusk Lighting
		const palette = getAfternoonLighting(state.afternoonPhase);
		(this.worldScene.background as THREE.Color).setHex(palette.skyHex);
		(this.worldScene.fog as THREE.Fog).color.setHex(palette.fogHex);
		this.sunLight.color.setHex(palette.sunHex);
		this.sunLight.intensity = palette.sunIntensity;
		this.sunLight.position.set(...palette.sunDirection);
		this.hemiLight.color.setHex(palette.ambientHex);
		this.hemiLight.intensity = palette.ambientIntensity;
		this.shopTaskLight.intensity = 2.0 * palette.warmLampStrength;
		this.teaLampLight.intensity = 1.35 * palette.warmLampStrength;
		this.courtyardWarmLight.intensity = palette.stringLightsOn ? 2.4 : 0.4;
		this.stringLightBulbsMat.emissive.setHex(palette.stringLightsOn ? 0xf59e0b : 0x000000);

		// Ceiling fan & kettle steam
		if (!settings.reducedMotion) {
			this.ceilingFanBlades.rotation.y = elapsedSec * 3.1;
			for (let i = 0; i < this.steamPuffs.length; i += 1) {
				const puff = this.steamPuffs[i];
				const cycle = (elapsedSec * 0.55 + i * 0.33) % 1;
				puff.position.y = 1.24 + cycle * 0.55;
				puff.scale.setScalar(0.65 + cycle * 0.8);
			}
		}

		// Neighbourhood unlocked props
		this.returnedRadioProp.visible = state.unlocks.teaStallRadioPlaying;
		if (state.unlocks.teaStallRadioPlaying && !settings.reducedMotion) {
			this.returnedRadioWaves.scale.setScalar(0.88 + Math.sin(elapsedSec * 4.5) * 0.14);
		}
		this.returnedClockProp.visible = state.unlocks.shopClockTicking;
		if (state.unlocks.shopClockTicking) {
			this.returnedClockMinuteHand.rotation.z = -elapsedSec * 0.35;
		}
		this.extraCourtyardChairs.visible = state.unlocks.courtyardChairsPlaced;
		this.courtyardProjectorProp.visible = state.unlocks.projectorAtCourtyard;

		// Courtyard film screening animation!
		const filmActive =
			state.afternoonPhase === 'screening' ||
			(state.afternoonPhase === 'afterglow' && state.unlocks.screeningStarted);
		this.courtyardBeamCone.visible = filmActive;
		if (filmActive && this.filmCtx) {
			const bucket = settings.reducedMotion
				? Math.floor(state.screeningElapsedSeconds * 2)
				: Math.floor(state.screeningElapsedSeconds * 18);
			const key = `${bucket}:${settings.reducedMotion ? 1 : 0}`;
			if (key !== this.lastFilmFrameKey) {
				this.lastFilmFrameKey = key;
				drawCourtyardShortFilmFrame(
					this.filmCtx,
					this.filmCanvas.width,
					this.filmCanvas.height,
					state.screeningElapsedSeconds,
					settings.reducedMotion
				);
				this.filmTexture.needsUpdate = true;
			}
		}

		// Player & Character placements
		this.playerMesh.position.set(state.playerPos.x, 0, state.playerPos.z);
		this.playerMesh.rotation.y = state.playerHeading;

		for (const charId of ['bapi', 'mala', 'ruma', 'nikhil', 'sabita'] as const) {
			const info = getCharacterWorldPosition(charId, state);
			const mesh = this.characterMeshes[charId];
			mesh.position.set(info.pos.x, 0, info.pos.z);
			mesh.rotation.y = info.facingRad;
		}

		// Walk destination ring
		if (state.walkTarget) {
			this.walkMarker.visible = true;
			this.walkMarker.position.set(state.walkTarget.x, 0.06, state.walkTarget.z);
		} else {
			this.walkMarker.visible = false;
		}

		// Elevated 3rd-person camera (or warm courtyard framing during screening!)
		let desiredPos: THREE.Vector3;
		let desiredLook: THREE.Vector3;

		if (state.mode === 'screening') {
			desiredPos = new THREE.Vector3(-7.85, 2.35, 0.28);
			desiredLook = new THREE.Vector3(-7.85, 1.55, -3.95);
		} else {
			const px = Math.max(-8.6, Math.min(6.4, state.playerPos.x));
			const pz = state.playerPos.z;
			desiredPos = new THREE.Vector3(px + 0.45, 7.95, pz + 6.55);
			desiredLook = new THREE.Vector3(px + 0.2, 0.65, pz - 0.65);
		}

		if (!this.camInitialized || settings.reducedMotion) {
			this.camSmoothPos.copy(desiredPos);
			this.camSmoothLook.copy(desiredLook);
			this.camInitialized = true;
		} else {
			this.camSmoothPos.lerp(desiredPos, 0.09);
			this.camSmoothLook.lerp(desiredLook, 0.11);
		}

		this.worldCamera.position.copy(this.camSmoothPos);
		this.worldCamera.lookAt(this.camSmoothLook);
		this.renderer.render(this.worldScene, this.worldCamera);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
		this.workbenchRig.dispose();
		this.tracker.dispose();
		this.renderer.dispose();
	}
}
