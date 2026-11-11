import * as THREE from 'three';
import { drawProjectorTestCard } from './film-reel';
import {
	CLOCK_GEARS,
	CLOCK_GEOMETRY,
	projectorFocusSharpness,
	radioSignalStrength,
	traceClockGearTrain
} from './repairs';
import type { ClockGearId, ProjectorGuideId, RepairShopGameState } from './types';

export class RepairResourceTracker {
	private readonly geometries = new Set<THREE.BufferGeometry>();
	private readonly materials = new Set<THREE.Material>();
	private readonly textures = new Set<THREE.Texture>();

	geo<T extends THREE.BufferGeometry>(g: T): T {
		this.geometries.add(g);
		return g;
	}

	mat<T extends THREE.Material>(m: T): T {
		this.materials.add(m);
		return m;
	}

	tex<T extends THREE.Texture>(t: T): T {
		this.textures.add(t);
		return t;
	}

	dispose(): void {
		for (const t of this.textures) t.dispose();
		for (const m of this.materials) m.dispose();
		for (const g of this.geometries) g.dispose();
		this.textures.clear();
		this.materials.clear();
		this.geometries.clear();
	}
}

function tagInteractive(obj: THREE.Object3D, pickType: string, pickId: string): void {
	obj.traverse((child) => {
		child.userData.pickType = pickType;
		child.userData.pickId = pickId;
	});
}

function createGearMesh(
	tracker: RepairResourceTracker,
	radius: number,
	teeth: number,
	style: 'spoked' | 'holed' | 'solid' | 'barrel',
	colorHex: number
): THREE.Group {
	const group = new THREE.Group();
	const mat = tracker.mat(
		new THREE.MeshStandardMaterial({
			color: colorHex,
			roughness: 0.36,
			metalness: 0.68
		})
	);
	const darkMat = tracker.mat(
		new THREE.MeshStandardMaterial({
			color: 0x221b14,
			roughness: 0.7,
			metalness: 0.2
		})
	);

	const rootRadius = radius * 0.88;
	const thickness = 0.032;

	if (style === 'spoked') {
		const rim = new THREE.Mesh(
			tracker.geo(new THREE.TorusGeometry(rootRadius * 0.86, rootRadius * 0.14, 8, 28)),
			mat
		);
		group.add(rim);
		const hub = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, thickness, 14)),
			mat
		);
		hub.rotation.x = Math.PI * 0.5;
		group.add(hub);
		for (let s = 0; s < 3; s += 1) {
			const spoke = new THREE.Mesh(
				tracker.geo(new THREE.BoxGeometry(rootRadius * 1.65, radius * 0.13, thickness * 0.75)),
				mat
			);
			spoke.rotation.z = (s * Math.PI) / 3;
			group.add(spoke);
		}
	} else if (style === 'holed') {
		const disc = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(rootRadius, rootRadius, thickness, 24)),
			mat
		);
		disc.rotation.x = Math.PI * 0.5;
		group.add(disc);
		for (let h = 0; h < 4; h += 1) {
			const ang = (h * Math.PI) / 2 + Math.PI * 0.25;
			const holeMarker = new THREE.Mesh(
				tracker.geo(new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, thickness * 1.08, 12)),
				darkMat
			);
			holeMarker.rotation.x = Math.PI * 0.5;
			holeMarker.position.set(Math.cos(ang) * radius * 0.48, Math.sin(ang) * radius * 0.48, 0);
			group.add(holeMarker);
		}
	} else {
		const disc = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(rootRadius, rootRadius, thickness, 22)),
			mat
		);
		disc.rotation.x = Math.PI * 0.5;
		group.add(disc);
	}

	const toothGeo = tracker.geo(
		new THREE.BoxGeometry(radius * 0.16, (2 * Math.PI * radius) / (teeth * 2.15), thickness * 0.9)
	);
	for (let i = 0; i < teeth; i += 1) {
		const a = (i / teeth) * Math.PI * 2;
		const tooth = new THREE.Mesh(toothGeo, mat);
		tooth.position.set(
			Math.cos(a) * (rootRadius + radius * 0.05),
			Math.sin(a) * (rootRadius + radius * 0.05),
			0
		);
		tooth.rotation.z = a;
		group.add(tooth);
	}

	return group;
}

export interface WorkbenchRigUpdater {
	root: THREE.Group;
	update(
		state: RepairShopGameState,
		elapsedSec: number,
		nudgeAnim: number,
		keySpinAnim: number
	): void;
	dispose(): void;
}

export function createWorkbenchSceneGroup(tracker: RepairResourceTracker): WorkbenchRigUpdater {
	const root = new THREE.Group();

	// Bench surface, green cutting/repair mat, brass tray, and warm task lamp head
	const benchTop = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(3.2, 0.12, 1.9)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x6f472b, roughness: 0.78 }))
	);
	benchTop.position.set(0, -0.46, 0);
	benchTop.receiveShadow = true;
	root.add(benchTop);

	const repairMat = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(1.75, 0.016, 1.15)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x2f5a48, roughness: 0.85 }))
	);
	repairMat.position.set(-0.08, -0.395, 0.02);
	repairMat.receiveShadow = true;
	root.add(repairMat);

	// Wooden & brass parts tray on the right side of the bench
	const trayGroup = new THREE.Group();
	trayGroup.position.set(0.86, -0.37, 0.18);
	const trayBase = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.56, 0.03, 0.68)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x9c7248, roughness: 0.65 }))
	);
	trayGroup.add(trayBase);
	const rimMat = tracker.mat(new THREE.MeshStandardMaterial({ color: 0x5c3c20, roughness: 0.7 }));
	for (const [rx, rz, rw, rd] of [
		[0, -0.325, 0.56, 0.03],
		[0, 0.325, 0.56, 0.03],
		[-0.265, 0, 0.03, 0.68],
		[0.265, 0, 0.03, 0.68]
	] as const) {
		const wall = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(rw, 0.06, rd)), rimMat);
		wall.position.set(rx, 0.03, rz);
		trayGroup.add(wall);
	}
	tagInteractive(trayGroup, 'clock-slot', 'tray');
	root.add(trayGroup);

	//Bench tool prop (brass flathead screwdriver & tweezers resting neatly at front left)
	const screwdriverHandle = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.028, 0.024, 0.18, 10)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x9b3b26, roughness: 0.5 }))
	);
	screwdriverHandle.rotation.z = Math.PI * 0.48;
	screwdriverHandle.rotation.y = 0.22;
	screwdriverHandle.position.set(-0.68, -0.365, 0.42);
	root.add(screwdriverHandle);
	const screwdriverShaft = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 8)),
		tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xc9c5ba, metalness: 0.75, roughness: 0.3 })
		)
	);
	screwdriverShaft.rotation.z = Math.PI * 0.48;
	screwdriverShaft.rotation.y = 0.22;
	screwdriverShaft.position.set(-0.52, -0.365, 0.38);
	root.add(screwdriverShaft);

	//Selection / diagnostic highlight ring
	const highlightRing = new THREE.Mesh(
		tracker.geo(new THREE.TorusGeometry(0.11, 0.012, 8, 28)),
		tracker.mat(
			new THREE.MeshStandardMaterial({
				color: 0xffbf47,
				emissive: 0xd97706,
				emissiveIntensity: 0.75,
				roughness: 0.3
			})
		)
	);
	highlightRing.visible = false;
	root.add(highlightRing);

	// ========================================================================
	// 1. PORTABLE BATTERY RADIO RIG
	// ========================================================================
	const radioGroup = new THREE.Group();
	root.add(radioGroup);

	const walnutMat = tracker.mat(
		new THREE.MeshStandardMaterial({ color: 0x5c3822, roughness: 0.62 })
	);
	const creamMat = tracker.mat(
		new THREE.MeshStandardMaterial({ color: 0xeadcc3, roughness: 0.52 })
	);
	const chromeMat = tracker.mat(
		new THREE.MeshStandardMaterial({ color: 0xd8d6cf, metalness: 0.82, roughness: 0.22 })
	);
	const brassMat = tracker.mat(
		new THREE.MeshStandardMaterial({ color: 0xc99c42, metalness: 0.72, roughness: 0.32 })
	);

	// Hollow chassis frame so inside components are genuinely recessed
	const chassisShell = new THREE.Group();
	radioGroup.add(chassisShell);

	// Top, bottom, left, right walnut walls + front cream baffle
	const rW = 0.94;
	const rH = 0.58;
	const rD = 0.3;
	for (const [px, py, pz, bw, bh, bd, m] of [
		[0, rH * 0.5 - 0.025, 0, rW, 0.05, rD, walnutMat],
		[0, -rH * 0.5 + 0.025, 0, rW, 0.05, rD, walnutMat],
		[-rW * 0.5 + 0.03, 0, 0, 0.06, rH, rD, walnutMat],
		[rW * 0.5 - 0.03, 0, 0, 0.06, rH, rD, walnutMat],
		[0, 0, rD * 0.5 - 0.025, rW - 0.08, rH - 0.08, 0.05, creamMat]
	] as const) {
		const part = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(bw, bh, bd)), m);
		part.position.set(px, py, pz);
		part.castShadow = true;
		part.receiveShadow = true;
		chassisShell.add(part);
	}

	// Chrome handle & aerial
	const handleBar = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.68, 0.028, 0.035)),
		chromeMat
	);
	handleBar.position.set(0, rH * 0.5 + 0.09, 0);
	chassisShell.add(handleBar);
	for (const hx of [-0.32, 0.32]) {
		const post = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8)),
			chromeMat
		);
		post.position.set(hx, rH * 0.5 + 0.045, 0);
		chassisShell.add(post);
	}
	const aerial = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.008, 0.013, 0.42, 8)),
		chromeMat
	);
	aerial.position.set(-0.36, rH * 0.5 + 0.18, -0.05);
	aerial.rotation.z = -0.28;
	chassisShell.add(aerial);

	// Front speaker grille slats, tuning scale window, dial needle, power LED, and knobs
	const grillePlate = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.46, 0.36, 0.018)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x352b23, roughness: 0.8 }))
	);
	grillePlate.position.set(-0.16, -0.03, rD * 0.5 + 0.005);
	chassisShell.add(grillePlate);

	const scaleBand = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.78, 0.09, 0.02)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x262019, roughness: 0.35 }))
	);
	scaleBand.position.set(0, 0.19, rD * 0.5 + 0.006);
	chassisShell.add(scaleBand);

	const radioDialNeedle = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.016, 0.078, 0.026)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0xd94832, emissive: 0x7c1d10 }))
	);
	radioDialNeedle.position.set(0, 0.19, rD * 0.5 + 0.012);
	chassisShell.add(radioDialNeedle);

	const radioLedMat = tracker.mat(
		new THREE.MeshStandardMaterial({
			color: 0x5c1914,
			emissive: 0x000000,
			roughness: 0.28
		})
	);
	const radioPowerLed = new THREE.Mesh(
		tracker.geo(new THREE.SphereGeometry(0.024, 12, 12)),
		radioLedMat
	);
	radioPowerLed.position.set(0.34, 0.05, rD * 0.5 + 0.012);
	tagInteractive(radioPowerLed, 'radio-action', 'toggle-power');
	chassisShell.add(radioPowerLed);

	const tuningKnob = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.062, 0.068, 0.045, 20)),
		brassMat
	);
	tuningKnob.rotation.x = Math.PI * 0.5;
	tuningKnob.position.set(0.24, -0.09, rD * 0.5 + 0.024);
	chassisShell.add(tuningKnob);

	// Visual sound-wave arcs above radio (crucial non-audio cue for muted play!)
	const soundWaveGroup = new THREE.Group();
	soundWaveGroup.position.set(-0.15, rH * 0.5 + 0.18, 0.06);
	const waveMat = tracker.mat(
		new THREE.MeshStandardMaterial({
			color: 0xfbbf24,
			emissive: 0xd97706,
			emissiveIntensity: 0.65,
			roughness: 0.3
		})
	);
	for (let w = 0; w < 3; w += 1) {
		const arc = new THREE.Mesh(
			tracker.geo(new THREE.TorusGeometry(0.07 + w * 0.055, 0.008, 6, 20, Math.PI * 0.75)),
			waveMat
		);
		arc.rotation.z = Math.PI * 0.12;
		soundWaveGroup.add(arc);
	}
	radioGroup.add(soundWaveGroup);

	// Internal Radio Components (visible when back cover is open)
	const radioInternals = new THREE.Group();
	radioGroup.add(radioInternals);

	// 1) Power board (top-left of rear view)
	const powerBoard = new THREE.Group();
	powerBoard.position.set(-0.22, 0.11, 0.02);
	const pcb = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.32, 0.17, 0.02)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x3b6e4c, roughness: 0.65 }))
	);
	powerBoard.add(pcb);
	for (const cx of [-0.09, 0, 0.09]) {
		const cap = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.022, 0.022, 0.055, 10)),
			tracker.mat(new THREE.MeshStandardMaterial({ color: 0x2c4b70, roughness: 0.45 }))
		);
		cap.rotation.x = Math.PI * 0.5;
		cap.position.set(cx, 0.02, -0.03);
		powerBoard.add(cap);
	}
	tagInteractive(powerBoard, 'radio-part', 'power-board');
	radioInternals.add(powerBoard);

	// 2) Variable tuning capacitor (bottom-left of rear view)
	const tuningCapGroup = new THREE.Group();
	tuningCapGroup.position.set(-0.24, -0.1, 0.01);
	const capFrame = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.18, 0.14, 0.09)), chromeMat);
	tuningCapGroup.add(capFrame);
	const capVanes = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 12, 1, false, 0, Math.PI)),
		brassMat
	);
	capVanes.position.set(0.03, 0.02, -0.04);
	tuningCapGroup.add(capVanes);
	tagInteractive(tuningCapGroup, 'radio-part', 'tuning-capacitor');
	radioInternals.add(tuningCapGroup);

	// 3) Dual D-cell battery pack (bottom-right of rear view)
	const batteryGroup = new THREE.Group();
	const batCradle = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.36, 0.16, 0.08)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x262320, roughness: 0.8 }))
	);
	batteryGroup.add(batCradle);
	const cellMat = tracker.mat(new THREE.MeshStandardMaterial({ color: 0x28597a, roughness: 0.42 }));
	for (const by of [-0.036, 0.036]) {
		const cell = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.032, 0.032, 0.3, 14)),
			cellMat
		);
		cell.rotation.z = Math.PI * 0.5;
		cell.position.set(0, by, -0.025);
		batteryGroup.add(cell);
	}
	tagInteractive(batteryGroup, 'radio-part', 'battery-pack');
	radioGroup.add(batteryGroup);

	// 4) Speaker magnet, cone, and the loose spade connector (top-right of rear view — behind front speaker!)
	const speakerCluster = new THREE.Group();
	speakerCluster.position.set(0.18, 0.06, 0.05);
	const speakerCone = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.06, 0.15, 0.07, 20)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x2f2b28, roughness: 0.88 }))
	);
	speakerCone.rotation.x = Math.PI * 0.5;
	speakerCluster.add(speakerCone);
	const speakerMagnet = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.068, 0.068, 0.055, 16)),
		chromeMat
	);
	speakerMagnet.rotation.x = Math.PI * 0.5;
	speakerMagnet.position.z = -0.05;
	speakerCluster.add(speakerMagnet);

	// Fixed terminal tab on speaker frame
	const terminalTab = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.07, 0.035, 0.02)),
		brassMat
	);
	terminalTab.position.set(-0.08, -0.08, -0.055);
	speakerCluster.add(terminalTab);

	// Movable brass spade connector + red/black twisted lead
	const speakerConnectorMesh = new THREE.Group();
	const lug = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.075, 0.042, 0.028)),
		tracker.mat(
			new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.65, roughness: 0.28 })
		)
	);
	speakerConnectorMesh.add(lug);
	const wireLead = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 8)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0xb93829, roughness: 0.6 }))
	);
	wireLead.rotation.z = 1.2;
	wireLead.position.set(-0.1, 0.04, -0.01);
	speakerConnectorMesh.add(wireLead);
	tagInteractive(speakerConnectorMesh, 'radio-part', 'speaker-connector');
	speakerCluster.add(speakerConnectorMesh);
	radioInternals.add(speakerCluster);

	// Vented Radio Back Cover + 2 Brass Screws
	const radioBackCover = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(rW - 0.06, rH - 0.06, 0.028)),
		creamMat
	);
	tagInteractive(radioBackCover, 'radio-part', 'back-cover');
	radioGroup.add(radioBackCover);

	const radioScrews: THREE.Mesh[] = [];
	for (let i = 0; i < 2; i += 1) {
		const screw = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.024, 0.024, 0.032, 12)),
			brassMat
		);
		screw.rotation.x = Math.PI * 0.5;
		tagInteractive(screw, 'radio-part', 'back-screws');
		radioScrews.push(screw);
		root.add(screw);
	}

	// ========================================================================
	// 2. WIND-UP CLOCK RIG
	// ========================================================================
	const clockGroup = new THREE.Group();
	root.add(clockGroup);

	const clockGreenMat = tracker.mat(
		new THREE.MeshStandardMaterial({ color: 0x27473c, roughness: 0.48, metalness: 0.18 })
	);
	const clockBody = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.58, 0.58, 0.24, 32, 1, true)),
		clockGreenMat
	);
	clockBody.rotation.x = Math.PI * 0.5;
	clockBody.castShadow = true;
	clockGroup.add(clockBody);

	// Wooden base plinth of clock
	const clockFoot = new THREE.Mesh(tracker.geo(new THREE.BoxGeometry(0.86, 0.09, 0.3)), walnutMat);
	clockFoot.position.set(0, -0.55, 0);
	clockFoot.castShadow = true;
	clockGroup.add(clockFoot);

	// Front dial & brass bezel (z > 0)
	const frontBezel = new THREE.Mesh(
		tracker.geo(new THREE.TorusGeometry(0.56, 0.038, 12, 36)),
		brassMat
	);
	frontBezel.position.z = 0.12;
	clockGroup.add(frontBezel);

	const dialFace = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 32)),
		creamMat
	);
	dialFace.rotation.x = Math.PI * 0.5;
	dialFace.position.z = 0.105;
	clockGroup.add(dialFace);

	// 12 hour markers on dial face
	const inkMat = tracker.mat(new THREE.MeshStandardMaterial({ color: 0x1e1915, roughness: 0.7 }));
	for (let h = 0; h < 12; h += 1) {
		const a = (h / 12) * Math.PI * 2;
		const major = h % 3 === 0;
		const tick = new THREE.Mesh(
			tracker.geo(new THREE.BoxGeometry(major ? 0.032 : 0.016, major ? 0.09 : 0.055, 0.012)),
			inkMat
		);
		tick.position.set(Math.sin(a) * 0.44, Math.cos(a) * 0.44, 0.12);
		tick.rotation.z = -a;
		clockGroup.add(tick);
	}

	const hourHandPivot = new THREE.Group();
	hourHandPivot.position.z = 0.132;
	const hourHandMesh = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.032, 0.27, 0.012)),
		inkMat
	);
	hourHandMesh.position.y = 0.11;
	hourHandPivot.add(hourHandMesh);
	clockGroup.add(hourHandPivot);

	const minuteHandPivot = new THREE.Group();
	minuteHandPivot.position.z = 0.142;
	const minuteHandMesh = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.022, 0.39, 0.012)),
		inkMat
	);
	minuteHandMesh.position.y = 0.17;
	minuteHandPivot.add(minuteHandMesh);
	clockGroup.add(minuteHandPivot);

	const centerCap = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 12)),
		brassMat
	);
	centerCap.rotation.x = Math.PI * 0.5;
	centerCap.position.z = 0.148;
	clockGroup.add(centerCap);

	// Rear movement recess plate (viewed from back: rotate group or mirror X so left-to-right matches CLOCK_GEOMETRY!)
	// Note: when viewing the back of the clock (`yawOffset ≈ Math.PI`), camera looks toward +Z from -Z.
	// In that camera view, +X in world space appears on the LEFT unless negated. Let's mount the movement in a
	// rear-facing subgroup (`rotation.y = Math.PI`, `position.z = -0.04`) so local +X is viewer's RIGHT and local -X is viewer's LEFT!
	const clockRearMovement = new THREE.Group();
	clockRearMovement.rotation.y = Math.PI;
	clockRearMovement.position.z = -0.02;
	clockGroup.add(clockRearMovement);

	const movementPlate = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 32)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x3b3024, roughness: 0.72 }))
	);
	movementPlate.rotation.x = Math.PI * 0.5;
	movementPlate.position.z = -0.02;
	clockRearMovement.add(movementPlate);

	// Fixed Mainspring Barrel Gear & Winding Key
	const mainspringMesh = createGearMesh(
		tracker,
		CLOCK_GEOMETRY.mainspring.radius,
		CLOCK_GEOMETRY.mainspring.teeth,
		'barrel',
		0xb8862d
	);
	mainspringMesh.position.set(CLOCK_GEOMETRY.mainspring.x, CLOCK_GEOMETRY.mainspring.y, 0.025);
	tagInteractive(mainspringMesh, 'clock-action', 'turn-input');
	clockRearMovement.add(mainspringMesh);

	// Fixed Hands Driven Wheel
	const handsWheelMesh = createGearMesh(
		tracker,
		CLOCK_GEOMETRY.hands.radius,
		CLOCK_GEOMETRY.hands.teeth,
		'solid',
		0xd4a94e
	);
	handsWheelMesh.position.set(CLOCK_GEOMETRY.hands.x, CLOCK_GEOMETRY.hands.y, 0.025);
	clockRearMovement.add(handsWheelMesh);

	// Three clickable fixed arbors (shaft-1, shaft-2, shaft-3)
	for (const shaftId of ['shaft-1', 'shaft-2', 'shaft-3'] as const) {
		const info = CLOCK_GEOMETRY[shaftId];
		const arborGroup = new THREE.Group();
		arborGroup.position.set(info.x, info.y, 0.02);
		const pin = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.024, 0.024, 0.09, 12)),
			chromeMat
		);
		pin.rotation.x = Math.PI * 0.5;
		arborGroup.add(pin);
		const collar = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.052, 0.052, 0.018, 16)),
			tracker.mat(new THREE.MeshStandardMaterial({ color: 0x7c6242, roughness: 0.5 }))
		);
		collar.rotation.x = Math.PI * 0.5;
		collar.position.z = -0.015;
		arborGroup.add(collar);
		tagInteractive(arborGroup, 'clock-slot', shaftId);
		clockRearMovement.add(arborGroup);
	}

	// Three movable brass gears
	const clockGearMeshes: Record<ClockGearId, THREE.Group> = {
		'gear-large': createGearMesh(
			tracker,
			CLOCK_GEARS['gear-large'].radius,
			CLOCK_GEARS['gear-large'].teeth,
			'spoked',
			0xdab048
		),
		'gear-medium': createGearMesh(
			tracker,
			CLOCK_GEARS['gear-medium'].radius,
			CLOCK_GEARS['gear-medium'].teeth,
			'holed',
			0xc9963b
		),
		'gear-small': createGearMesh(
			tracker,
			CLOCK_GEARS['gear-small'].radius,
			CLOCK_GEARS['gear-small'].teeth,
			'solid',
			0xe2be62
		)
	};
	for (const gearId of ['gear-large', 'gear-medium', 'gear-small'] as const) {
		tagInteractive(clockGearMeshes[gearId], 'clock-gear', gearId);
		root.add(clockGearMeshes[gearId]);
	}

	// Removable Brass Back Plate + 2 Knurled Thumbscrews
	const clockBackPlate = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.56, 0.56, 0.024, 32)),
		brassMat
	);
	clockBackPlate.rotation.x = Math.PI * 0.5;
	tagInteractive(clockBackPlate, 'clock-part', 'back-plate');
	root.add(clockBackPlate);

	const clockScrews: THREE.Mesh[] = [];
	for (let i = 0; i < 2; i += 1) {
		const thumb = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.036, 0.028, 0.045, 14)),
			brassMat
		);
		thumb.rotation.x = Math.PI * 0.5;
		tagInteractive(thumb, 'clock-part', 'thumbscrews');
		clockScrews.push(thumb);
		root.add(thumb);
	}

	// ========================================================================
	// 3. SMALL FILM PROJECTOR RIG
	// ========================================================================
	const projectorGroup = new THREE.Group();
	root.add(projectorGroup);

	const tealCastMat = tracker.mat(
		new THREE.MeshStandardMaterial({ color: 0x355356, roughness: 0.55, metalness: 0.25 })
	);
	const darkCastMat = tracker.mat(
		new THREE.MeshStandardMaterial({ color: 0x262b2d, roughness: 0.65, metalness: 0.3 })
	);

	// Projector main upright housing (front view faces +Z so side compartment faces viewer directly!)
	const projBase = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.84, 0.09, 0.42)),
		darkCastMat
	);
	projBase.position.set(-0.18, -0.34, 0);
	projBase.castShadow = true;
	projectorGroup.add(projBase);

	const projTower = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.64, 0.62, 0.26)),
		tealCastMat
	);
	projTower.position.set(-0.18, 0.01, -0.04);
	projTower.castShadow = true;
	projectorGroup.add(projTower);

	// Lamp housing on back-left of tower with warm glow window
	const lampGlowMat = tracker.mat(
		new THREE.MeshStandardMaterial({
			color: 0x5c4a32,
			emissive: 0x000000,
			roughness: 0.35
		})
	);
	const lampHouse = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.24, 0.28, 0.12)),
		lampGlowMat
	);
	lampHouse.position.set(-0.28, 0.09, 0.11);
	tagInteractive(lampHouse, 'projector-part', 'lamp-housing');
	projectorGroup.add(lampHouse);

	// Supply spool (top-left arm) & Take-up spool (lower-right arm)
	const createReelMesh = () => {
		const g = new THREE.Group();
		const flangeGeo = tracker.geo(new THREE.CylinderGeometry(0.21, 0.21, 0.012, 24));
		const f1 = new THREE.Mesh(flangeGeo, chromeMat);
		f1.rotation.x = Math.PI * 0.5;
		f1.position.z = 0.022;
		const f2 = new THREE.Mesh(flangeGeo, chromeMat);
		f2.rotation.x = Math.PI * 0.5;
		f2.position.z = -0.022;
		const core = new THREE.Mesh(
			tracker.geo(new THREE.CylinderGeometry(0.13, 0.13, 0.036, 20)),
			tracker.mat(new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.6 }))
		);
		core.rotation.x = Math.PI * 0.5;
		g.add(f1, f2, core);
		return g;
	};

	const supplyReel = createReelMesh();
	supplyReel.position.set(-0.42, 0.46, 0.12);
	projectorGroup.add(supplyReel);

	const takeupReel = createReelMesh();
	takeupReel.position.set(0.14, -0.1, 0.12);
	tagInteractive(takeupReel, 'projector-guide', 'takeup-spool');
	projectorGroup.add(takeupReel);

	// Lower Motor Pulley & Reel Drive Pulley + Belt
	const motorPulley = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 16)),
		brassMat
	);
	motorPulley.rotation.x = Math.PI * 0.5;
	motorPulley.position.set(-0.34, -0.19, 0.12);
	projectorGroup.add(motorPulley);

	const drivenPulley = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.062, 0.062, 0.04, 16)),
		brassMat
	);
	drivenPulley.rotation.x = Math.PI * 0.5;
	drivenPulley.position.set(-0.04, -0.17, 0.12);
	projectorGroup.add(drivenPulley);

	const wornBeltMesh = new THREE.Mesh(
		tracker.geo(new THREE.TorusGeometry(0.19, 0.013, 8, 28)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x6e4f3a, roughness: 0.92 }))
	);
	wornBeltMesh.scale.set(1.08, 0.46, 1);
	wornBeltMesh.position.set(-0.19, -0.205, 0.12);
	tagInteractive(wornBeltMesh, 'projector-part', 'drive-belt');
	projectorGroup.add(wornBeltMesh);

	const tautBeltMesh = new THREE.Mesh(
		tracker.geo(new THREE.TorusGeometry(0.185, 0.015, 8, 28)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.72 }))
	);
	tautBeltMesh.scale.set(1.04, 0.34, 1);
	tautBeltMesh.position.set(-0.19, -0.18, 0.12);
	tagInteractive(tautBeltMesh, 'projector-part', 'drive-belt');
	projectorGroup.add(tautBeltMesh);

	const spareBeltTrayMesh = new THREE.Mesh(
		tracker.geo(new THREE.TorusGeometry(0.11, 0.014, 8, 24)),
		tracker.mat(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.72 }))
	);
	spareBeltTrayMesh.rotation.x = Math.PI * 0.5;
	spareBeltTrayMesh.position.set(0.86, -0.33, 0.24);
	tagInteractive(spareBeltTrayMesh, 'projector-action', 'fit-belt');
	root.add(spareBeltTrayMesh);

	// The 4 intermediate film routing guides (plus takeupReel as 5th)
	const guidePositions: Record<ProjectorGuideId, THREE.Vector3> = {
		'top-roller': new THREE.Vector3(-0.14, 0.26, 0.13),
		'film-gate': new THREE.Vector3(-0.08, 0.1, 0.13),
		'sprocket-wheel': new THREE.Vector3(-0.11, -0.04, 0.13),
		'snubber-roller': new THREE.Vector3(-0.01, -0.13, 0.13),
		'takeup-spool': new THREE.Vector3(0.14, -0.1, 0.13)
	};

	const topRollerMesh = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 14)),
		brassMat
	);
	topRollerMesh.rotation.x = Math.PI * 0.5;
	topRollerMesh.position.copy(guidePositions['top-roller']);
	tagInteractive(topRollerMesh, 'projector-guide', 'top-roller');
	projectorGroup.add(topRollerMesh);

	const filmGateMesh = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.055, 0.13, 0.05)),
		chromeMat
	);
	filmGateMesh.position.copy(guidePositions['film-gate']);
	tagInteractive(filmGateMesh, 'projector-guide', 'film-gate');
	projectorGroup.add(filmGateMesh);

	const sprocketMesh = createGearMesh(tracker, 0.045, 12, 'solid', 0xc99c42);
	sprocketMesh.position.copy(guidePositions['sprocket-wheel']);
	tagInteractive(sprocketMesh, 'projector-guide', 'sprocket-wheel');
	projectorGroup.add(sprocketMesh);

	const snubberMesh = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 14)),
		chromeMat
	);
	snubberMesh.rotation.x = Math.PI * 0.5;
	snubberMesh.position.copy(guidePositions['snubber-roller']);
	tagInteractive(snubberMesh, 'projector-guide', 'snubber-roller');
	projectorGroup.add(snubberMesh);

	// Dynamic 3D Film Ribbon Line/Tube
	const filmLineMat = tracker.mat(
		new THREE.MeshStandardMaterial({
			color: 0x8b4513,
			emissive: 0x381906,
			roughness: 0.45
		})
	);
	let currentFilmMesh: THREE.Mesh | null = null;
	let currentFilmKey = '';

	// Knurled Brass Projection Lens Barrel (points right toward +X bench focus target!)
	const focusBarrelMesh = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.048, 0.054, 0.17, 18)),
		brassMat
	);
	focusBarrelMesh.rotation.z = Math.PI * 0.5;
	focusBarrelMesh.position.set(0.18, 0.1, 0.08);
	tagInteractive(focusBarrelMesh, 'projector-part', 'focus-barrel');
	projectorGroup.add(focusBarrelMesh);

	// Hinged Side Cover
	const projSideCover = new THREE.Mesh(
		tracker.geo(new THREE.BoxGeometry(0.54, 0.54, 0.03)),
		tealCastMat
	);
	tagInteractive(projSideCover, 'projector-part', 'side-cover');
	projectorGroup.add(projSideCover);

	// 3D Bench Focus Test Card Stand (at right side of projector beam)
	const testCardCanvas = document.createElement('canvas');
	testCardCanvas.width = 320;
	testCardCanvas.height = 240;
	const testCardCtx = testCardCanvas.getContext('2d');
	const testCardTex = tracker.tex(new THREE.CanvasTexture(testCardCanvas));
	testCardTex.colorSpace = THREE.SRGBColorSpace;

	const testCardStand = new THREE.Group();
	testCardStand.position.set(0.68, 0.06, 0.06);
	const cardBoard = new THREE.Mesh(
		tracker.geo(new THREE.PlaneGeometry(0.46, 0.34)),
		tracker.mat(new THREE.MeshBasicMaterial({ map: testCardTex, side: THREE.DoubleSide }))
	);
	cardBoard.rotation.y = -Math.PI * 0.38;
	testCardStand.add(cardBoard);
	const cardPost = new THREE.Mesh(
		tracker.geo(new THREE.CylinderGeometry(0.015, 0.018, 0.42, 8)),
		walnutMat
	);
	cardPost.position.y = -0.24;
	testCardStand.add(cardPost);
	projectorGroup.add(testCardStand);

	// Soft volumetric light cone from lens to test card
	const benchBeamCone = new THREE.Mesh(
		tracker.geo(new THREE.ConeGeometry(0.18, 0.46, 16, 1, true)),
		tracker.mat(
			new THREE.MeshBasicMaterial({
				color: 0xffe9a8,
				transparent: true,
				opacity: 0.22,
				side: THREE.DoubleSide,
				depthWrite: false
			})
		)
	);
	benchBeamCone.rotation.z = Math.PI * 0.5;
	benchBeamCone.position.set(0.44, 0.1, 0.07);
	projectorGroup.add(benchBeamCone);

	let lastCardSignature = '';

	return {
		root,
		update(state: RepairShopGameState, elapsedSec: number, nudgeAnim: number, keySpinAnim: number) {
			const job = state.workbench?.activeJob ?? 'radio';
			radioGroup.visible = job === 'radio';
			clockGroup.visible = job === 'clock';
			projectorGroup.visible = job === 'projector';
			highlightRing.visible = false;

			// Radio screws visibility
			for (const s of radioScrews) s.visible = job === 'radio';
			clockBackPlate.visible = job === 'clock';
			for (const s of clockScrews) s.visible = job === 'clock';
			for (const gId of ['gear-large', 'gear-medium', 'gear-small'] as const) {
				clockGearMeshes[gId].visible = job === 'clock';
			}
			spareBeltTrayMesh.visible =
				job === 'projector' &&
				state.unlocks.spareBeltInDrawer &&
				state.projector.beltState !== 'spare_fitted';

			if (job === 'radio') {
				const r = state.radio;
				const tiltAngle = Math.sin(nudgeAnim * Math.PI * 2) * 0.14 * (nudgeAnim > 0 ? 1 : 0);
				radioGroup.position.set(-0.08, -0.08, 0);
				radioGroup.rotation.z = tiltAngle;

				// LED stays steady when battery is seated & powered on!
				const powered = r.powerOn && r.batteryClipSeated;
				radioLedMat.color.setHex(powered ? 0xff4530 : 0x5c1914);
				radioLedMat.emissive.setHex(powered ? 0xdc2626 : 0x000000);

				// Visual sound waves: cut out during tilt if speakerConnectorSeated is false!
				const cutOutNow = !r.speakerConnectorSeated && (nudgeAnim > 0.12 || !r.powerOn);
				soundWaveGroup.visible =
					powered && (r.speakerConnectorSeated || (nudgeAnim > 0 && nudgeAnim <= 0.18));
				if (soundWaveGroup.visible && !cutOutNow) {
					const sig = radioSignalStrength(r);
					soundWaveGroup.scale.setScalar(0.75 + sig * 0.4 + Math.sin(elapsedSec * 5) * 0.04);
				} else if (cutOutNow) {
					soundWaveGroup.visible = false;
				}

				// Dial needle & capacitor vanes follow tuningDial
				radioDialNeedle.position.x = -0.34 + (r.tuningDial / 100) * 0.68;
				capVanes.rotation.y = (r.tuningDial / 100) * Math.PI * 0.85;

				// Back cover & screws
				if (r.coverOpen) {
					radioBackCover.position.set(0.94, -0.26, -0.18);
					radioBackCover.rotation.set(Math.PI * 0.46, 0, 0.15);
					radioBackCover.scale.setScalar(0.52);
				} else {
					radioBackCover.position.set(0, 0, -rD * 0.5 + 0.014);
					radioBackCover.rotation.set(0, 0, 0);
					radioBackCover.scale.setScalar(1);
				}

				for (let i = 0; i < 2; i += 1) {
					const inTray = i < r.screwsRemoved;
					if (inTray) {
						radioScrews[i].position.set(0.78 + i * 0.14, -0.34, -0.06);
						radioScrews[i].rotation.set(0, 0, 0.4);
					} else {
						radioScrews[i].position.set(i === 0 ? -0.36 : 0.36, -0.08, -rD * 0.5 - 0.08);
						radioScrews[i].rotation.set(Math.PI * 0.5, 0, 0);
					}
				}

				// Battery cradle position
				if (r.batteryClipSeated) {
					batteryGroup.position.set(0.18, -0.13, 0.02);
					batteryGroup.scale.setScalar(1);
				} else {
					batteryGroup.position.set(0.86, -0.32, 0.18);
					batteryGroup.scale.setScalar(0.72);
				}

				// Speaker connector seated vs visibly loose!
				if (r.speakerConnectorSeated) {
					speakerConnectorMesh.position.set(-0.08, -0.08, -0.065);
					speakerConnectorMesh.rotation.set(0, 0, 0);
				} else {
					speakerConnectorMesh.position.set(-0.03, -0.125, -0.095);
					speakerConnectorMesh.rotation.set(0.18, -0.22, 0.52);
				}

				if (r.coverOpen && r.selectedPart === 'speaker-connector') {
					highlightRing.visible = true;
					highlightRing.position.set(0.11, -0.1, -0.04);
					highlightRing.rotation.set(0, 0, 0);
				}
			} else if (job === 'clock') {
				const c = state.clock;
				clockGroup.position.set(-0.1, 0.12, 0);

				// Hands angle from handsMinutes
				const mins = c.handsMinutes + (c.mechanismTested ? (elapsedSec * 0.5) % 1 : 0);
				minuteHandPivot.rotation.z = -((mins % 60) / 60) * Math.PI * 2;
				hourHandPivot.rotation.z = -((mins % 720) / 720) * Math.PI * 2;

				// Back plate & thumbscrews
				if (c.backOpen) {
					clockBackPlate.position.set(-0.92, -0.34, 0.12);
					clockBackPlate.rotation.set(Math.PI * 0.5, 0, 0);
					clockBackPlate.scale.setScalar(0.55);
				} else {
					clockBackPlate.position.set(-0.1, 0.12, -0.13);
					clockBackPlate.rotation.set(Math.PI * 0.5, 0, 0);
					clockBackPlate.scale.setScalar(1);
				}

				for (let i = 0; i < 2; i += 1) {
					if (i < c.screwsRemoved) {
						clockScrews[i].position.set(0.76 + i * 0.16, -0.34, -0.12);
						clockScrews[i].rotation.set(0, 0, 0);
					} else {
						clockScrews[i].position.set(-0.1 + (i === 0 ? -0.42 : 0.42), 0.12, -0.155);
						clockScrews[i].rotation.set(Math.PI * 0.5, 0, 0);
					}
				}

				const trace = traceClockGearTrain(c.gearPlacements);
				const spinActive = trace.reachesHands || keySpinAnim > 0;
				const baseAngle = trace.reachesHands ? elapsedSec * 1.15 : keySpinAnim * Math.PI * 1.6;

				if (spinActive && trace.spinningNodes.includes('mainspring')) {
					mainspringMesh.rotation.z = baseAngle;
				}

				let trayIdx = 0;
				for (const gId of ['gear-large', 'gear-medium', 'gear-small'] as const) {
					const mesh = clockGearMeshes[gId];
					const slot = c.gearPlacements[gId];
					if (slot === 'tray') {
						mesh.position.set(0.86, -0.33, -0.02 + trayIdx * 0.22);
						mesh.rotation.set(-Math.PI * 0.5, 0, 0);
						mesh.scale.setScalar(0.68);
						trayIdx += 1;
					} else {
						// Convert clockRearMovement local coords (rotated Y by PI around clockGroup at (-0.1, 0.12, -0.02))
						const sInfo = CLOCK_GEOMETRY[slot];
						mesh.position.set(-0.1 - sInfo.x, 0.12 + sInfo.y, -0.052);
						mesh.rotation.set(0, Math.PI, 0);
						mesh.scale.setScalar(1);

						if (spinActive && trace.spinningNodes.includes(slot)) {
							const sign = slot === 'shaft-2' ? 1 : -1;
							const ratio = CLOCK_GEOMETRY.mainspring.teeth / CLOCK_GEARS[gId].teeth;
							mesh.rotation.z = sign * baseAngle * ratio;
						}
					}
				}

				if (spinActive && trace.spinningNodes.includes('hands')) {
					handsWheelMesh.rotation.z = baseAngle * (18 / 15);
				}

				if (c.backOpen && c.selectedGearForPlacement) {
					const selSlot = c.gearPlacements[c.selectedGearForPlacement];
					const targetMesh = clockGearMeshes[c.selectedGearForPlacement];
					highlightRing.visible = true;
					highlightRing.position.copy(targetMesh.position);
					highlightRing.rotation.set(selSlot === 'tray' ? Math.PI * 0.5 : 0, 0, 0);
				}
			} else {
				// PROJECTOR
				const p = state.projector;
				projectorGroup.position.set(-0.1, -0.04, 0);

				// Side cover hinge
				if (p.coverOpen) {
					projSideCover.position.set(-0.56, 0.01, -0.18);
					projSideCover.rotation.set(0, -Math.PI * 0.72, 0);
				} else {
					projSideCover.position.set(-0.18, 0.01, 0.145);
					projSideCover.rotation.set(0, 0, 0);
				}

				wornBeltMesh.visible = p.beltState === 'worn';
				tautBeltMesh.visible = p.beltState === 'spare_fitted';

				const running =
					(p.powerOn && p.poweredTransportVerified) || (keySpinAnim > 0 && p.manualCheckPassed);
				const motorSpin = p.powerOn || keySpinAnim > 0;
				if (motorSpin) {
					motorPulley.rotation.y = elapsedSec * 6;
				}
				if (running) {
					drivenPulley.rotation.y = elapsedSec * 4.5;
					supplyReel.rotation.z = -elapsedSec * 1.6;
					takeupReel.rotation.z = -elapsedSec * 1.9;
					sprocketMesh.rotation.z = -elapsedSec * 3.8;
				}

				// Lamp & beam cone
				lampGlowMat.emissive.setHex(p.powerOn ? 0xf59e0b : 0x000000);
				benchBeamCone.visible = p.powerOn;

				// Focus barrel extension
				focusBarrelMesh.position.x = 0.15 + (p.focusDial / 100) * 0.065;

				// Update 3D film strip ribbon when route changes
				const filmKey = p.threadedGuides.join('>');
				if (filmKey !== currentFilmKey) {
					currentFilmKey = filmKey;
					if (currentFilmMesh) {
						projectorGroup.remove(currentFilmMesh);
						currentFilmMesh.geometry.dispose();
						currentFilmMesh = null;
					}
					const pts: THREE.Vector3[] = [new THREE.Vector3(-0.42, 0.34, 0.13)];
					for (const gId of p.threadedGuides) {
						pts.push(guidePositions[gId].clone());
					}
					if (pts.length >= 2) {
						const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.18);
						const tubeGeo = new THREE.TubeGeometry(curve, pts.length * 10, 0.011, 6, false);
						currentFilmMesh = new THREE.Mesh(tubeGeo, filmLineMat);
						projectorGroup.add(currentFilmMesh);
					}
				}

				// Redraw bench focus test card texture only when sharpness or power changes
				const sharpness = projectorFocusSharpness(p.focusDial);
				const cardSig = `${p.powerOn ? 1 : 0}:${sharpness.toFixed(3)}`;
				if (cardSig !== lastCardSignature && testCardCtx) {
					lastCardSignature = cardSig;
					drawProjectorTestCard(
						testCardCtx,
						testCardCanvas.width,
						testCardCanvas.height,
						sharpness,
						p.powerOn
					);
					testCardTex.needsUpdate = true;
				}
			}
		},
		dispose() {
			if (currentFilmMesh) {
				currentFilmMesh.geometry.dispose();
				currentFilmMesh = null;
			}
		}
	};
}
