import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DisposerBag } from './craft-geometry';
import { computeAtmosphereAtTime } from './lighting';
import {
	LANDMARKS,
	LANDMARK_BY_ID,
	NEIGHBORHOODS,
	NEIGHBORHOOD_BY_ID,
	OVERVIEW_CAMERA,
	SECRET_BY_ID,
	SECRET_CURIOSITIES
} from './lore';
import { createCityMaterials } from './materials';
import { findShortestWalkPath, resolveWalkablePosition, stepWalker } from './navigation';
import { clamp, lerp } from './prng';
import type {
	CameraViewSpec,
	CityViewerState,
	ExplorationMode,
	HoverPickInfo,
	LandmarkId,
	NeighborhoodId,
	ProjectedPin,
	SecretId,
	Vec3,
	WalkerState
} from './types';
import { buildEastDistricts } from './world-east';
import { buildSkyVillageAndLivingCast, updateLivingActors } from './world-sky-and-life';
import { buildDioramaPlinthAndTerrain } from './world-terrain';
import { buildWestDistricts } from './world-west';

export interface CityRendererCallbacks {
	onReady?: (stats: { meshCount: number; triangleCount: number }) => void;
	onSelectLandmark?: (id: LandmarkId | null) => void;
	onSelectSecret?: (id: SecretId) => void;
	onDiscoverSecret?: (id: SecretId) => void;
	onHoverPick?: (info: HoverPickInfo) => void;
	onPinsUpdate?: (pins: ProjectedPin[]) => void;
	onWalkerMove?: (pos: Vec3, nearestDistrict: NeighborhoodId) => void;
	onContextLossChange?: (lost: boolean) => void;
}

export interface CityRendererHandle {
	updateState: (next: CityViewerState) => void;
	flyToOverview: () => void;
	flyToNeighborhood: (id: NeighborhoodId) => void;
	focusLandmark: (id: LandmarkId) => void;
	walkToLandmark: (id: LandmarkId) => void;
	walkToSecret: (id: SecretId) => void;
	zoomStep: (factor: number) => void;
	setVirtualMove: (forward: number, strafe: number) => void;
	capturePostcardDataUrl: () => string;
	dispose: () => void;
}

export function checkCityWebGLSupport(): boolean {
	if (typeof document === 'undefined') return false;
	if (
		typeof window !== 'undefined' &&
		new URLSearchParams(window.location.search).get('webgl') === 'off'
	) {
		return false;
	}
	try {
		const testCanvas = document.createElement('canvas');
		const gl = testCanvas.getContext('webgl2') ?? testCanvas.getContext('webgl');
		if (!gl) return false;
		gl.getExtension('WEBGL_lose_context')?.loseContext();
		return true;
	} catch {
		return false;
	}
}

export async function createLittleCityRenderer(
	canvas: HTMLCanvasElement,
	initialState: CityViewerState,
	callbacks: CityRendererCallbacks = {}
): Promise<CityRendererHandle> {
	const bag = new DisposerBag();
	const mats = createCityMaterials();

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		powerPreference: 'high-performance',
		preserveDrawingBuffer: false
	});
	const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.75) : 1;
	renderer.setPixelRatio(dpr);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.06;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

	const scene = new THREE.Scene();
	const fog = new THREE.FogExp2('#d8b493', 0.0062);
	scene.fog = fog;

	// Sky Gradient Dome Shader
	const skyUniforms = {
		uTopColor: { value: new THREE.Color('#486fa3') },
		uHorizonColor: { value: new THREE.Color('#f0b882') }
	};
	const skyMat = new THREE.ShaderMaterial({
		uniforms: skyUniforms,
		side: THREE.BackSide,
		depthWrite: false,
		vertexShader: `
			varying vec3 vWorldPosition;
			void main() {
				vec4 worldPos = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPos.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPos;
			}
		`,
		fragmentShader: `
			uniform vec3 uTopColor;
			uniform vec3 uHorizonColor;
			varying vec3 vWorldPosition;
			void main() {
				float h = normalize(vWorldPosition + vec3(0.0, 10.0, 0.0)).y;
				float t = pow(clamp(h, 0.0, 1.0), 0.62);
				gl_FragColor = vec4(mix(uHorizonColor, uTopColor, t), 1.0);
			}
		`
	});
	const skyGeo = bag.track(new THREE.SphereGeometry(92, 24, 16));
	const skyDome = new THREE.Mesh(skyGeo, skyMat);
	scene.add(skyDome);

	// Studio Stop-Motion Lighting Rig
	const hemiLight = new THREE.HemisphereLight('#efb88b', '#5c4333', 0.92);
	scene.add(hemiLight);

	const sunLight = new THREE.DirectionalLight('#ffbe73', 2.05);
	sunLight.position.set(-22, 34, 24);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.set(2048, 2048);
	sunLight.shadow.camera.near = 6;
	sunLight.shadow.camera.far = 96;
	sunLight.shadow.camera.left = -28;
	sunLight.shadow.camera.right = 28;
	sunLight.shadow.camera.top = 26;
	sunLight.shadow.camera.bottom = -26;
	sunLight.shadow.bias = -0.0005;
	sunLight.shadow.normalBias = 0.025;
	scene.add(sunLight);

	const rimLight = new THREE.DirectionalLight('#ffd296', 0.52);
	rimLight.position.set(24, 16, -24);
	scene.add(rimLight);

	// Warm District Lantern Accent Point Lights (brighten dynamically at dusk/night!)
	const districtGlowLights: Array<{ light: THREE.PointLight; baseIntensity: number }> = [
		{ light: new THREE.PointLight('#ffaa48', 1.4, 14, 1.8), baseIntensity: 1.8 }, // Old Town Piazza
		{ light: new THREE.PointLight('#ffbe55', 1.6, 18, 1.6), baseIntensity: 2.3 }, // Lighthouse Cupola
		{ light: new THREE.PointLight('#ffad4c', 1.3, 14, 1.8), baseIntensity: 1.7 }, // Teapot Quarter
		{ light: new THREE.PointLight('#ff9d38', 1.8, 17, 1.7), baseIntensity: 2.5 }, // Umbra Crag Lanterns
		{ light: new THREE.PointLight('#ff8438', 1.5, 15, 1.8), baseIntensity: 2.0 }, // Denki-Cho Neon
		{ light: new THREE.PointLight('#ffc266', 1.4, 15, 1.8), baseIntensity: 1.8 } // Floating Village
	];
	districtGlowLights[0].light.position.set(-8.2, 3.6, 1.5);
	districtGlowLights[1].light.position.set(-19.1, 11.1, -13.5);
	districtGlowLights[2].light.position.set(-12.5, 4.4, 13.5);
	districtGlowLights[3].light.position.set(14.6, 8.2, -13.2);
	districtGlowLights[4].light.position.set(9.8, 4.2, 5.2);
	districtGlowLights[5].light.position.set(0.5, 8.2, -7.6);
	for (const d of districtGlowLights) scene.add(d.light);

	// Build the Entire Handcrafted Miniature City!
	const cityRoot = new THREE.Group();
	const terrainRes = buildDioramaPlinthAndTerrain(bag, mats);
	const westRes = buildWestDistricts(bag, mats);
	const eastRes = buildEastDistricts(bag, mats);
	const allSteamEmitters = [...westRes.steamEmitters, ...eastRes.steamEmitters];
	const skyLifeRes = buildSkyVillageAndLivingCast(bag, mats, allSteamEmitters);

	cityRoot.add(terrainRes.group, westRes.group, eastRes.group, skyLifeRes.group);
	scene.add(cityRoot);

	// Subtle Glowing Destination Ring for Click-to-Walk!
	const walkMarkerGeo = bag.track(new THREE.RingGeometry(0.24, 0.38, 24));
	walkMarkerGeo.rotateX(-Math.PI * 0.5);
	const walkMarkerMat = new THREE.MeshBasicMaterial({
		color: '#ffd269',
		transparent: true,
		opacity: 0.85,
		side: THREE.DoubleSide
	});
	const walkMarker = new THREE.Mesh(walkMarkerGeo, walkMarkerMat);
	walkMarker.visible = false;
	scene.add(walkMarker);

	// Collect pickable meshes & compute exact world coordinates of the 8 secret curiosities!
	scene.updateMatrixWorld(true);
	const pickableMeshes: THREE.Object3D[] = [];
	const secretWorldPositions = new Map<SecretId, Vec3>();
	let meshCount = 0;
	let triangleCount = 0;

	cityRoot.traverse((obj) => {
		if ((obj as THREE.Mesh).isMesh) {
			meshCount++;
			const g = (obj as THREE.Mesh).geometry;
			if (g.index) triangleCount += g.index.count / 3;
			else if (g.attributes.position) triangleCount += g.attributes.position.count / 3;

			if (obj.userData.landmarkId || obj.userData.secretId || obj.userData.walkable) {
				pickableMeshes.push(obj);
			}
		}
		if (obj.userData.secretId && !secretWorldPositions.has(obj.userData.secretId)) {
			const wp = new THREE.Vector3();
			obj.getWorldPosition(wp);
			secretWorldPositions.set(obj.userData.secretId as SecretId, [wp.x, wp.y, wp.z]);
		}
	});

	// Camera & OrbitControls Setup
	const camera = new THREE.PerspectiveCamera(
		OVERVIEW_CAMERA.fov ?? 42,
		Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight),
		0.15,
		190
	);
	camera.position.set(...OVERVIEW_CAMERA.position);

	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.075;
	controls.minDistance = 3.2;
	controls.maxDistance = 58;
	controls.maxPolarAngle = Math.PI * 0.485;
	controls.minPolarAngle = 0.14;
	controls.target.set(...OVERVIEW_CAMERA.target);
	controls.update();

	// State, Camera Flight Tween, & Walker Physics
	let currentState: CityViewerState = {
		...initialState,
		discoveredSecrets: [...initialState.discoveredSecrets]
	};
	const discoveredSet = new Set<SecretId>(currentState.discoveredSecrets);

	const walker: WalkerState = {
		position: [...NEIGHBORHOOD_BY_ID['old-town'].walkSpawn],
		headingRad: NEIGHBORHOOD_BY_ID['old-town'].walkHeadingRad,
		speed: 0,
		stridePhase: 0,
		activePath: [],
		targetLandmarkId: null
	};

	let fpYaw = walker.headingRad + Math.PI;
	let fpPitch = 0.04;
	let tpOrbitYawOffset = 0;
	let tpDistance = 6.2;
	let tpHeight = 2.9;

	interface CameraTween {
		fromPos: THREE.Vector3;
		toPos: THREE.Vector3;
		fromTarget: THREE.Vector3;
		toTarget: THREE.Vector3;
		elapsed: number;
		duration: number;
	}
	let activeTween: CameraTween | null = null;

	function startCameraTween(spec: CameraViewSpec, duration = 0.95): void {
		const reduced =
			typeof document !== 'undefined' && document.documentElement.dataset.motion === 'still';
		if (reduced) {
			camera.position.set(...spec.position);
			controls.target.set(...spec.target);
			controls.update();
			activeTween = null;
			return;
		}
		activeTween = {
			fromPos: camera.position.clone(),
			toPos: new THREE.Vector3(...spec.position),
			fromTarget: controls.target.clone(),
			toTarget: new THREE.Vector3(...spec.target),
			elapsed: 0,
			duration
		};
	}

	function applyAtmosphere(hours: number): void {
		const sample = computeAtmosphereAtTime(hours);
		skyUniforms.uTopColor.value.set(sample.skyTopHex);
		skyUniforms.uHorizonColor.value.set(sample.skyHorizonHex);
		fog.color.set(sample.fogHex);
		fog.density = sample.fogDensity;

		sunLight.position.set(...sample.sunPosition);
		sunLight.color.set(sample.sunColorHex);
		sunLight.intensity = sample.sunIntensity;

		hemiLight.color.set(sample.hemiSkyHex);
		hemiLight.groundColor.set(sample.hemiGroundHex);
		hemiLight.intensity = sample.hemiIntensity;

		rimLight.color.set(sample.rimColorHex);
		rimLight.intensity = sample.rimIntensity;

		skyLifeRes.starMaterial.opacity = sample.starOpacity;
		for (const d of districtGlowLights) {
			d.light.intensity = d.baseIntensity * sample.lanternGlow;
		}
		skyLifeRes.playerLanternLight.intensity = 0.45 + sample.lanternGlow * 1.65;

		mats.updateTimeGlow(
			sample.windowGlow,
			sample.lanternGlow,
			sample.waterDeepHex,
			sample.waterShallowHex
		);
	}

	function syncModeCameraSetup(prevMode: ExplorationMode, nextMode: ExplorationMode): void {
		if (prevMode === nextMode) return;
		activeTween = null;

		if (nextMode === 'diorama') {
			controls.enabled = true;
			skyLifeRes.playerTraveler.visible = true;
			camera.fov = 42;
			camera.updateProjectionMatrix();
			// Pull back gracefully from current spot
			const wp = walker.position;
			startCameraTween(
				{
					position: [wp[0] + 12, wp[1] + 9.5, wp[2] + 13],
					target: [wp[0], wp[1] + 2.2, wp[2]]
				},
				0.85
			);
		} else if (nextMode === 'third-person') {
			controls.enabled = false;
			skyLifeRes.playerTraveler.visible = true;
			camera.fov = 48;
			camera.updateProjectionMatrix();
			tpOrbitYawOffset = 0;
		} else if (nextMode === 'first-person') {
			controls.enabled = false;
			skyLifeRes.playerTraveler.visible = false;
			camera.fov = 62;
			camera.updateProjectionMatrix();
			fpYaw = walker.headingRad + Math.PI;
			fpPitch = 0.06;
		}
	}

	// Input Tracking: Keyboard WASD/Arrows + Pointer Look/Click + Virtual Touch Pad
	const pressedKeys = new Set<string>();
	let virtualForward = 0;
	let virtualStrafe = 0;

	function isTypingInField(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
	}

	function onKeyDown(ev: KeyboardEvent): void {
		if (isTypingInField(ev.target)) return;
		const code = ev.code;
		if (
			code === 'KeyW' ||
			code === 'KeyA' ||
			code === 'KeyS' ||
			code === 'KeyD' ||
			code === 'ArrowUp' ||
			code === 'ArrowDown' ||
			code === 'ArrowLeft' ||
			code === 'ArrowRight' ||
			code === 'ShiftLeft' ||
			code === 'ShiftRight'
		) {
			pressedKeys.add(code);
			if (currentState.mode !== 'diorama' && code.startsWith('Arrow')) {
				ev.preventDefault();
			}
		}
	}

	function onKeyUp(ev: KeyboardEvent): void {
		pressedKeys.delete(ev.code);
	}

	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('keyup', onKeyUp);

	// Pointer Raycasting & Drag Look for 3rd/1st Person Modes
	const raycaster = new THREE.Raycaster();
	const pointerNdc = new THREE.Vector2();
	let pointerDownPos: { x: number; y: number; time: number } | null = null;
	let isDraggingLook = false;
	let lastDragX = 0;
	let lastDragY = 0;

	function updateNdc(clientX: number, clientY: number): void {
		const rect = canvas.getBoundingClientRect();
		pointerNdc.x = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
		pointerNdc.y = -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
	}

	function pickScene(clientX: number, clientY: number) {
		updateNdc(clientX, clientY);
		raycaster.setFromCamera(pointerNdc, camera);
		const hits = raycaster.intersectObjects(pickableMeshes, false);
		for (const hit of hits) {
			const ud = hit.object.userData;
			if (ud.secretId) {
				return { kind: 'secret' as const, id: ud.secretId as SecretId, point: hit.point };
			}
			if (ud.landmarkId) {
				return { kind: 'landmark' as const, id: ud.landmarkId as LandmarkId, point: hit.point };
			}
			if (ud.walkable) {
				return { kind: 'street' as const, id: 'street', point: hit.point };
			}
		}
		return null;
	}

	function onPointerDown(ev: PointerEvent): void {
		activeTween = null;
		pointerDownPos = { x: ev.clientX, y: ev.clientY, time: performance.now() };
		if (currentState.mode !== 'diorama') {
			isDraggingLook = true;
			lastDragX = ev.clientX;
			lastDragY = ev.clientY;
		}
	}

	let lastHoverBroadcast = 0;
	function onPointerMove(ev: PointerEvent): void {
		if (isDraggingLook && currentState.mode !== 'diorama') {
			const dx = ev.clientX - lastDragX;
			const dy = ev.clientY - lastDragY;
			lastDragX = ev.clientX;
			lastDragY = ev.clientY;
			if (currentState.mode === 'first-person') {
				fpYaw -= dx * 0.0045;
				fpPitch = clamp(fpPitch - dy * 0.0038, -0.75, 1.05);
			} else if (currentState.mode === 'third-person') {
				tpOrbitYawOffset -= dx * 0.0055;
				tpHeight = clamp(tpHeight + dy * 0.018, 1.25, 7.5);
			}
			return;
		}

		const now = performance.now();
		if (now - lastHoverBroadcast < 45) return;
		lastHoverBroadcast = now;

		const hit = pickScene(ev.clientX, ev.clientY);
		if (!hit) {
			canvas.style.cursor = currentState.mode === 'diorama' ? 'grab' : 'crosshair';
			callbacks.onHoverPick?.({
				kind: null,
				id: null,
				label: null,
				subtitle: null,
				clientX: ev.clientX,
				clientY: ev.clientY
			});
			return;
		}

		if (hit.kind === 'secret') {
			const sec = SECRET_BY_ID[hit.id];
			canvas.style.cursor = 'pointer';
			callbacks.onHoverPick?.({
				kind: 'secret',
				id: sec.id,
				label: `✨ ${sec.title}`,
				subtitle: 'Hidden Curiosity — Click to inspect',
				clientX: ev.clientX,
				clientY: ev.clientY
			});
		} else if (hit.kind === 'landmark') {
			const lm = LANDMARK_BY_ID[hit.id];
			canvas.style.cursor = 'pointer';
			callbacks.onHoverPick?.({
				kind: 'landmark',
				id: lm.id,
				label: lm.name,
				subtitle: lm.subtitle,
				clientX: ev.clientX,
				clientY: ev.clientY
			});
		} else {
			canvas.style.cursor = currentState.mode !== 'diorama' ? 'pointer' : 'grab';
			callbacks.onHoverPick?.({
				kind: 'street',
				id: 'street',
				label: currentState.mode !== 'diorama' ? 'Walk here' : null,
				subtitle: null,
				clientX: ev.clientX,
				clientY: ev.clientY
			});
		}
	}

	function triggerDiscoverSecret(secId: SecretId): void {
		if (!discoveredSet.has(secId)) {
			discoveredSet.add(secId);
			callbacks.onDiscoverSecret?.(secId);
		}
	}

	function onPointerUp(ev: PointerEvent): void {
		isDraggingLook = false;
		if (!pointerDownPos) return;
		const dist = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
		const elapsed = performance.now() - pointerDownPos.time;
		pointerDownPos = null;
		if (dist > 6 || elapsed > 550) return;

		const hit = pickScene(ev.clientX, ev.clientY);
		if (!hit) return;

		if (hit.kind === 'secret') {
			triggerDiscoverSecret(hit.id);
			callbacks.onSelectSecret?.(hit.id);
			return;
		}

		if (hit.kind === 'landmark') {
			callbacks.onSelectLandmark?.(hit.id);
			if (currentState.mode === 'diorama') {
				focusLandmark(hit.id);
			}
			return;
		}

		if (hit.kind === 'street' && currentState.mode !== 'diorama') {
			const goal: Vec3 = [hit.point.x, hit.point.y, hit.point.z];
			const path = findShortestWalkPath(walker.position, goal);
			walker.activePath = path;
			const finalPt = path[path.length - 1] ?? goal;
			walkMarker.position.set(finalPt[0], finalPt[1] + 0.05, finalPt[2]);
			walkMarker.visible = true;
		}
	}

	function onWheel(ev: WheelEvent): void {
		if (currentState.mode === 'third-person') {
			ev.preventDefault();
			tpDistance = clamp(tpDistance + Math.sign(ev.deltaY) * 0.55, 2.8, 13.5);
		}
	}

	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointermove', onPointerMove);
	window.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('wheel', onWheel, { passive: false });

	// WebGL context loss safety
	function onContextLost(e: Event): void {
		e.preventDefault();
		callbacks.onContextLossChange?.(true);
	}
	function onContextRestored(): void {
		callbacks.onContextLossChange?.(false);
	}
	canvas.addEventListener('webglcontextlost', onContextLost);
	canvas.addEventListener('webglcontextrestored', onContextRestored);

	// Resize handling
	function syncSize(): void {
		const w = Math.max(1, canvas.clientWidth);
		const h = Math.max(1, canvas.clientHeight);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setSize(w, h, false);
	}
	syncSize();
	const resizeObserver = new ResizeObserver(() => syncSize());
	resizeObserver.observe(canvas);

	// Initial state setup
	applyAtmosphere(currentState.timeHours);
	if (currentState.selectedLandmarkId) {
		const lm = LANDMARK_BY_ID[currentState.selectedLandmarkId];
		camera.position.set(
			lm.focusTarget[0] + lm.cameraOffset[0],
			lm.focusTarget[1] + lm.cameraOffset[1],
			lm.focusTarget[2] + lm.cameraOffset[2]
		);
		controls.target.set(...lm.focusTarget);
		controls.update();
	} else if (currentState.activeNeighborhood !== 'overview') {
		const nb = NEIGHBORHOOD_BY_ID[currentState.activeNeighborhood];
		camera.position.set(...nb.camera.position);
		controls.target.set(...nb.camera.target);
		controls.update();
		walker.position = [...nb.walkSpawn];
		walker.headingRad = nb.walkHeadingRad;
	}
	if (currentState.mode !== 'diorama') {
		syncModeCameraSetup('diorama', currentState.mode);
	}

	// 2D Projected Labels / Pins Updater
	const projVec = new THREE.Vector3();
	let lastPinEmit = 0;

	function emitProjectedPins(nowMs: number): void {
		if (!currentState.showLabels) {
			if (nowMs - lastPinEmit > 200) {
				lastPinEmit = nowMs;
				callbacks.onPinsUpdate?.([]);
			}
			return;
		}
		if (nowMs - lastPinEmit < 55) return;
		lastPinEmit = nowMs;

		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (w <= 0 || h <= 0) return;

		const pins: ProjectedPin[] = [];
		const camDistToCenter = camera.position.length();

		// Show Neighborhood banners when zoomed out in Diorama, or Landmark pins when closer / walking!
		const showLandmarkPins = camDistToCenter < 29 || currentState.mode !== 'diorama';

		if (!showLandmarkPins) {
			for (const nb of NEIGHBORHOODS) {
				projVec.set(...nb.labelAnchor);
				const dist = camera.position.distanceTo(projVec);
				projVec.project(camera);
				const visible =
					projVec.z > -1 &&
					projVec.z < 1 &&
					projVec.x > -0.95 &&
					projVec.x < 0.95 &&
					projVec.y > -0.92 &&
					projVec.y < 0.92;
				pins.push({
					id: nb.id,
					kind: 'neighborhood',
					label: `${nb.number}. ${nb.name}`,
					sublabel: nb.subtitle,
					accentHex: nb.accentHex,
					x: (projVec.x * 0.5 + 0.5) * w,
					y: (-projVec.y * 0.5 + 0.5) * h,
					visible,
					distance: dist
				});
			}
		} else {
			for (const lm of LANDMARKS) {
				projVec.set(...lm.labelAnchor);
				const dist = camera.position.distanceTo(projVec);
				if (dist > 26) continue;
				projVec.project(camera);
				const visible =
					projVec.z > -1 &&
					projVec.z < 1 &&
					projVec.x > -0.92 &&
					projVec.x < 0.92 &&
					projVec.y > -0.9 &&
					projVec.y < 0.9;
				if (!visible) continue;
				const nb = NEIGHBORHOOD_BY_ID[lm.neighborhoodId];
				pins.push({
					id: lm.id,
					kind: 'landmark',
					label: lm.name,
					accentHex: nb.accentHex,
					x: (projVec.x * 0.5 + 0.5) * w,
					y: (-projVec.y * 0.5 + 0.5) * h,
					visible: true,
					distance: dist
				});
			}
		}

		pins.sort((a, b) => a.distance - b.distance);
		callbacks.onPinsUpdate?.(pins.slice(0, 8));
	}

	// Main Real-Time Animation Loop
	let rafId = 0;
	let disposed = false;
	let prevFrameMs = performance.now();
	let simClock = 0;

	function resolveNearestNeighborhood(pos: Vec3): NeighborhoodId {
		if (pos[1] > 5.95 && Math.abs(pos[0]) < 5.5) return 'floating-village';
		let best: NeighborhoodId = 'old-town';
		let bestD = Infinity;
		for (const nb of NEIGHBORHOODS) {
			const dx = pos[0] - nb.walkSpawn[0];
			const dy = (pos[1] - nb.walkSpawn[1]) * 1.8;
			const dz = pos[2] - nb.walkSpawn[2];
			const d = Math.hypot(dx, dy, dz);
			if (d < bestD) {
				bestD = d;
				best = nb.id;
			}
		}
		return best;
	}

	function tick(nowMs: number): void {
		if (disposed) return;
		rafId = window.requestAnimationFrame(tick);

		const dt = Math.min(0.05, Math.max(0.001, (nowMs - prevFrameMs) / 1000));
		prevFrameMs = nowMs;

		const motionStill =
			typeof document !== 'undefined' && document.documentElement.dataset.motion === 'still';
		if (!motionStill) {
			simClock += dt;
		}

		// Optional 12 fps stop-motion cadence quantization for world actors!
		const actorTime = currentState.stopMotionCadence ? Math.floor(simClock * 12) / 12 : simClock;
		updateLivingActors(actorTime, {
			catTails: westRes.catTails,
			lighthouseRotor: westRes.lighthouseRotor,
			bobbingBoat: westRes.bobbingBoat,
			swayingLanterns: eastRes.swayingLanterns,
			skyLife: skyLifeRes
		});

		// Camera Tween or Exploration Movement
		if (activeTween && currentState.mode === 'diorama') {
			activeTween.elapsed += dt;
			const u = clamp(activeTween.elapsed / activeTween.duration, 0, 1);
			const ease = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
			camera.position.lerpVectors(activeTween.fromPos, activeTween.toPos, ease);
			controls.target.lerpVectors(activeTween.fromTarget, activeTween.toTarget, ease);
			if (u >= 1) activeTween = null;
			controls.update();
		} else if (currentState.mode === 'diorama') {
			controls.target.x = clamp(controls.target.x, -22, 22);
			controls.target.y = clamp(controls.target.y, -0.5, 14.5);
			controls.target.z = clamp(controls.target.z, -19, 19);
			controls.update();
		} else {
			// Gather manual WASD / Arrow / Touch input
			let fwd = virtualForward;
			let str = virtualStrafe;
			if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) fwd += 1;
			if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) fwd -= 1;
			if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) str += 1;
			if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) str -= 1;
			const sprint = pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight');

			const activeYaw =
				currentState.mode === 'first-person'
					? fpYaw
					: walker.headingRad + Math.PI + tpOrbitYawOffset;

			stepWalker(
				walker,
				{
					forward: clamp(fwd, -1, 1),
					strafe: clamp(str, -1, 1),
					cameraYawRad: activeYaw,
					sprint
				},
				dt
			);

			if (walker.activePath.length === 0) {
				walkMarker.visible = false;
			} else {
				walkMarker.scale.setScalar(0.88 + Math.sin(simClock * 5) * 0.12);
			}

			// Check proximity secret curiosity discoveries while walking!
			for (const sec of SECRET_CURIOSITIES) {
				if (discoveredSet.has(sec.id)) continue;
				const wp = secretWorldPositions.get(sec.id) ?? sec.position;
				const d = Math.hypot(
					walker.position[0] - wp[0],
					walker.position[1] - wp[1],
					walker.position[2] - wp[2]
				);
				if (d <= sec.triggerRadius) {
					triggerDiscoverSecret(sec.id);
				}
			}

			callbacks.onWalkerMove?.(walker.position, resolveNearestNeighborhood(walker.position));

			if (currentState.mode === 'third-person') {
				const strideHop =
					walker.speed > 0.15 ? Math.abs(Math.sin(walker.stridePhase * 2.2)) * 0.08 : 0;
				skyLifeRes.playerTraveler.position.set(
					walker.position[0],
					walker.position[1] + strideHop,
					walker.position[2]
				);
				skyLifeRes.playerTraveler.rotation.y = walker.headingRad;

				const camAngle = walker.headingRad + Math.PI + tpOrbitYawOffset;
				const desiredCamX = walker.position[0] + Math.sin(camAngle) * tpDistance;
				const desiredCamZ = walker.position[2] + Math.cos(camAngle) * tpDistance;
				const desiredCamY = walker.position[1] + tpHeight;

				camera.position.set(
					lerp(camera.position.x, desiredCamX, clamp(dt * 8.5, 0, 1)),
					lerp(camera.position.y, desiredCamY, clamp(dt * 8.5, 0, 1)),
					lerp(camera.position.z, desiredCamZ, clamp(dt * 8.5, 0, 1))
				);
				camera.lookAt(walker.position[0], walker.position[1] + 1.05, walker.position[2]);
			} else {
				// First-Person Eye-Level Stroll!
				const headBob = walker.speed > 0.15 ? Math.sin(walker.stridePhase * 2.4) * 0.035 : 0;
				const eyeX = walker.position[0];
				const eyeY = walker.position[1] + 0.86 + headBob;
				const eyeZ = walker.position[2];
				camera.position.set(eyeX, eyeY, eyeZ);

				const lookDist = 6;
				const lookX = eyeX - Math.sin(fpYaw) * Math.cos(fpPitch) * lookDist;
				const lookY = eyeY + Math.sin(fpPitch) * lookDist;
				const lookZ = eyeZ - Math.cos(fpYaw) * Math.cos(fpPitch) * lookDist;
				camera.lookAt(lookX, lookY, lookZ);
			}
		}

		// Keep traveler figurine placed nicely even in Diorama mode so user can spot their miniature explorer!
		if (currentState.mode === 'diorama') {
			skyLifeRes.playerTraveler.position.set(...walker.position);
			skyLifeRes.playerTraveler.rotation.y = walker.headingRad;
		}

		renderer.render(scene, camera);
		emitProjectedPins(nowMs);
	}

	// Render one immediate synchronous frame before scheduling RAF so screenshots & tests are instant!
	updateLivingActors(0, {
		catTails: westRes.catTails,
		lighthouseRotor: westRes.lighthouseRotor,
		bobbingBoat: westRes.bobbingBoat,
		swayingLanterns: eastRes.swayingLanterns,
		skyLife: skyLifeRes
	});
	renderer.render(scene, camera);
	callbacks.onReady?.({ meshCount, triangleCount: Math.round(triangleCount) });
	rafId = window.requestAnimationFrame(tick);

	// Public Control API
	function updateState(next: CityViewerState): void {
		const prev = currentState;
		currentState = {
			...next,
			discoveredSecrets: [...next.discoveredSecrets]
		};
		for (const s of currentState.discoveredSecrets) discoveredSet.add(s);

		if (Math.abs(prev.timeHours - next.timeHours) > 0.002) {
			applyAtmosphere(next.timeHours);
		}
		if (prev.mode !== next.mode) {
			syncModeCameraSetup(prev.mode, next.mode);
		}
	}

	function flyToOverview(): void {
		if (currentState.mode === 'diorama') {
			startCameraTween(OVERVIEW_CAMERA, 1.0);
		}
	}

	function flyToNeighborhood(id: NeighborhoodId): void {
		const nb = NEIGHBORHOOD_BY_ID[id];
		if (!nb) return;
		walker.activePath = [];
		walkMarker.visible = false;
		walker.position = resolveWalkablePosition(nb.walkSpawn[0], nb.walkSpawn[2], nb.walkSpawn[1]);
		walker.headingRad = nb.walkHeadingRad;
		fpYaw = nb.walkHeadingRad + Math.PI;
		if (currentState.mode === 'diorama') {
			startCameraTween(nb.camera, 0.95);
		}
	}

	function focusLandmark(id: LandmarkId): void {
		const lm = LANDMARK_BY_ID[id];
		if (!lm) return;
		if (currentState.mode === 'diorama') {
			startCameraTween(
				{
					position: [
						lm.focusTarget[0] + lm.cameraOffset[0],
						lm.focusTarget[1] + lm.cameraOffset[1],
						lm.focusTarget[2] + lm.cameraOffset[2]
					],
					target: lm.focusTarget
				},
				0.9
			);
		} else {
			walkToLandmark(id);
		}
	}

	function walkToLandmark(id: LandmarkId): void {
		const lm = LANDMARK_BY_ID[id];
		if (!lm) return;
		const path = findShortestWalkPath(walker.position, lm.walkEntrance);
		walker.activePath = path;
		walker.targetLandmarkId = id;
		const finalPt = path[path.length - 1] ?? lm.walkEntrance;
		walkMarker.position.set(finalPt[0], finalPt[1] + 0.05, finalPt[2]);
		walkMarker.visible = true;
	}

	function walkToSecret(id: SecretId): void {
		const wp = secretWorldPositions.get(id) ?? SECRET_BY_ID[id].position;
		if (currentState.mode === 'diorama') {
			startCameraTween(
				{
					position: [wp[0] + 4.5, wp[1] + 2.4, wp[2] + 4.8],
					target: wp
				},
				0.85
			);
		} else {
			const path = findShortestWalkPath(walker.position, wp);
			walker.activePath = path;
		}
	}

	function zoomStep(factor: number): void {
		if (currentState.mode === 'diorama') {
			const offset = camera.position.clone().sub(controls.target);
			const nextLen = clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
			offset.setLength(nextLen);
			camera.position.copy(controls.target).add(offset);
			controls.update();
		} else if (currentState.mode === 'third-person') {
			tpDistance = clamp(tpDistance * factor, 2.8, 13.5);
		}
	}

	function setVirtualMove(forward: number, strafe: number): void {
		virtualForward = clamp(forward, -1, 1);
		virtualStrafe = clamp(strafe, -1, 1);
	}

	function capturePostcardDataUrl(): string {
		renderer.render(scene, camera);
		return canvas.toDataURL('image/png');
	}

	function dispose(): void {
		if (disposed) return;
		disposed = true;
		window.cancelAnimationFrame(rafId);
		resizeObserver.disconnect();
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('keyup', onKeyUp);
		canvas.removeEventListener('pointerdown', onPointerDown);
		canvas.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		canvas.removeEventListener('wheel', onWheel);
		canvas.removeEventListener('webglcontextlost', onContextLost);
		canvas.removeEventListener('webglcontextrestored', onContextRestored);
		controls.dispose();
		skyMat.dispose();
		walkMarkerMat.dispose();
		skyLifeRes.starMaterial.dispose();
		bag.dispose();
		mats.dispose();
		renderer.dispose();
	}

	return {
		updateState,
		flyToOverview,
		flyToNeighborhood,
		focusLandmark,
		walkToLandmark,
		walkToSecret,
		zoomStep,
		setVirtualMove,
		capturePostcardDataUrl,
		dispose
	};
}
