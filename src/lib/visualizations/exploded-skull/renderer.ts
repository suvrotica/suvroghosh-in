import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BONE_BY_ID, SKULL_BONES, SKULL_BONE_IDS } from './bones';
import { BACKGROUND_THEMES, CAMERA_PRESET_BY_ID, MATERIAL_PRESETS } from './presets';
import { getBoneLabelText } from './state';
import { computeBoneTargetTransform, resolveLabelCollisions } from './transforms';
import type { BoneId, CameraPresetId, ProjectedBoneLabel, SkullViewerState, Vec3 } from './types';

export interface SkullHoverEvent {
	boneId: BoneId | null;
	clientX: number;
	clientY: number;
}

export interface SkullOrientationSnapshot {
	/** Camera-relative column vectors of the skull's anatomical (+X Left, +Y Superior, +Z Anterior) axes. */
	right: Vec3;
	up: Vec3;
	forward: Vec3;
}

export interface SkullRendererCallbacks {
	onLoadProgress?: (ratio: number) => void;
	onLoaded?: (info: { loadedFromGlb: boolean; meshCount: number; triangleCount: number }) => void;
	onLoadError?: (message: string) => void;
	onSelectBone?: (boneId: BoneId | null, additive: boolean) => void;
	onDoubleClickBone?: (boneId: BoneId) => void;
	onHoverBone?: (event: SkullHoverEvent) => void;
	onLabelsUpdate?: (labels: ProjectedBoneLabel[]) => void;
	onOrientationUpdate?: (orientation: SkullOrientationSnapshot) => void;
	onContextLossChange?: (lost: boolean) => void;
}

export interface SkullRendererHandle {
	updateState(nextState: SkullViewerState): void;
	setCameraPreset(presetId: CameraPresetId, instant?: boolean): void;
	zoomStep(factor: number): void;
	fitModel(instant?: boolean): void;
	focusBone(boneId: BoneId, instant?: boolean): void;
	setOrientationView(axis: Vec3, up?: Vec3): void;
	getCameraSnapshot(): { position: Vec3; target: Vec3 };
	setCameraSnapshot(snapshot: { position: Vec3; target: Vec3 }, instant?: boolean): void;
	exportPng(options: {
		includeLabels: boolean;
		labels?: ProjectedBoneLabel[];
	}): Promise<Blob | null>;
	dispose(): void;
}

interface BoneRenderNode {
	id: BoneId;
	group: THREE.Group;
	mesh: THREE.Mesh;
	material: THREE.MeshStandardMaterial;
	ghostMesh: THREE.Mesh | null;
	sutureUniform: { value: number };
	sutureTintUniform: { value: THREE.Color };
	dentitionMeshes: THREE.Mesh[];
	currentPos: THREE.Vector3;
	targetPos: THREE.Vector3;
	currentRotX: number;
	targetRotX: number;
	currentOpacity: number;
	targetOpacity: number;
	targetVisible: boolean;
	warmthOffset: number;
}

interface CameraTransition {
	startTime: number;
	durationMs: number;
	fromPos: THREE.Vector3;
	toPos: THREE.Vector3;
	fromTarget: THREE.Vector3;
	toTarget: THREE.Vector3;
	fromUp: THREE.Vector3;
	toUp: THREE.Vector3;
}

const DEFAULT_MODEL_URL = '/data/exploded-human-skull/human-skull-bp3d.glb';

/** Subtle per-bone osteology tone variation so articulated adjacent bones read crisply. */
const BONE_TONE_BIAS: Partial<Record<BoneId, number>> = {
	frontal: 0.02,
	'parietal-left': 0.0,
	'parietal-right': 0.0,
	occipital: -0.02,
	'temporal-left': -0.03,
	'temporal-right': -0.03,
	sphenoid: -0.045,
	ethmoid: -0.05,
	'maxilla-left': 0.025,
	'maxilla-right': 0.025,
	'zygomatic-left': 0.015,
	'zygomatic-right': 0.015,
	'nasal-left': 0.035,
	'nasal-right': 0.035,
	'lacrimal-left': -0.025,
	'lacrimal-right': -0.025,
	'palatine-left': -0.035,
	'palatine-right': -0.035,
	'inferior-nasal-concha-left': -0.03,
	'inferior-nasal-concha-right': -0.03,
	vomer: -0.02,
	mandible: 0.01,
	hyoid: -0.015
};

function createBoneMicroTexture(): THREE.CanvasTexture | null {
	if (typeof document === 'undefined') return null;
	const size = 256;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	const img = ctx.createImageData(size, size);
	const data = img.data;
	// Deterministic seeded pseudo-noise for subtle cortical Haversian grain
	let seed = 0x51a7c3d1;
	const nextRand = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 4294967296;
	};

	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const idx = (y * size + x) * 4;
			const grain = nextRand() * 24 - 12;
			const wave =
				Math.sin((x / size) * Math.PI * 6 + Math.cos((y / size) * Math.PI * 4) * 1.4) * 7 +
				Math.sin((y / size) * Math.PI * 10) * 4;
			const v = Math.max(0, Math.min(255, Math.round(138 + grain + wave)));
			data[idx] = v;
			data[idx + 1] = v;
			data[idx + 2] = v;
			data[idx + 3] = 255;
		}
	}
	ctx.putImageData(img, 0, 0);

	const tex = new THREE.CanvasTexture(canvas);
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	tex.repeat.set(3, 3);
	tex.needsUpdate = true;
	return tex;
}

export async function createSkullRenderer(
	canvas: HTMLCanvasElement,
	initialState: SkullViewerState,
	callbacks: SkullRendererCallbacks = {},
	modelUrl = DEFAULT_MODEL_URL
): Promise<SkullRendererHandle> {
	let state = initialState;
	let disposed = false;
	let contextLost = false;
	let hoveredBoneId: BoneId | null = null;
	let rafId = 0;
	let lastFrameTime = performance.now();
	let dirtyLabels = true;

	const prefersReducedMotion =
		typeof window !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

	const width = Math.max(canvas.clientWidth || canvas.parentElement?.clientWidth || 800, 100);
	const height = Math.max(canvas.clientHeight || canvas.parentElement?.clientHeight || 600, 100);

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
		powerPreference: 'high-performance',
		preserveDrawingBuffer: false
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.setSize(width, height, false);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.06;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;

	const scene = new THREE.Scene();
	const pmrem = new THREE.PMREMGenerator(renderer);
	const envScene = new RoomEnvironment();
	const envTarget = pmrem.fromScene(envScene, 0.04);
	scene.environment = envTarget.texture;
	scene.environmentIntensity = 0.42;

	const camera = new THREE.PerspectiveCamera(34, width / height, 0.08, 60);
	const initCam = CAMERA_PRESET_BY_ID[state.cameraPreset] ?? CAMERA_PRESET_BY_ID['three-quarter'];
	camera.position.set(
		initCam.direction[0] * initCam.distance,
		initCam.direction[1] * initCam.distance,
		initCam.direction[2] * initCam.distance
	);
	camera.up.set(...initCam.up);

	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.rotateSpeed = 0.78;
	controls.zoomSpeed = 0.92;
	controls.panSpeed = 0.75;
	controls.minDistance = 1.5;
	controls.maxDistance = 14.5;
	controls.target.set(0, -0.14, 0);
	controls.touches = {
		ONE: THREE.TOUCH.ROTATE,
		TWO: THREE.TOUCH.DOLLY_PAN
	};
	controls.autoRotate = state.rotation.autoRotate;
	controls.autoRotateSpeed = state.rotation.autoRotateSpeed * 2.2;
	controls.update();

	// Calibrated 3-point museum showcase lighting
	const hemiLight = new THREE.HemisphereLight('#f8f2e4', '#262b38', 0.46);
	scene.add(hemiLight);

	const keyLight = new THREE.DirectionalLight('#fff5e4', 2.05);
	keyLight.position.set(4.2, 5.4, 4.8);
	keyLight.castShadow = true;
	keyLight.shadow.mapSize.set(1024, 1024);
	keyLight.shadow.camera.near = 0.5;
	keyLight.shadow.camera.far = 16;
	const shadowExtent = 2.6;
	keyLight.shadow.camera.left = -shadowExtent;
	keyLight.shadow.camera.right = shadowExtent;
	keyLight.shadow.camera.top = shadowExtent;
	keyLight.shadow.camera.bottom = -shadowExtent;
	keyLight.shadow.bias = -0.0005;
	scene.add(keyLight);

	const fillLight = new THREE.DirectionalLight('#bfd4f2', 0.82);
	fillLight.position.set(-4.6, 1.4, 2.2);
	scene.add(fillLight);

	const rimLight = new THREE.DirectionalLight('#f2dec2', 1.15);
	rimLight.position.set(-1.6, 3.6, -5.2);
	scene.add(rimLight);

	const basalBounceLight = new THREE.DirectionalLight('#d8cab0', 0.48);
	basalBounceLight.position.set(0.5, -4.5, 1.8);
	scene.add(basalBounceLight);

	// Coordinate grid + subtle museum scale reference below the skull
	const gridHelper = new THREE.GridHelper(6.4, 16, '#5c5243', '#272a33');
	gridHelper.position.y = -1.62;
	gridHelper.visible = state.display.showCoordinateGrid;
	scene.add(gridHelper);

	const skullRootPivot = new THREE.Group();
	skullRootPivot.name = 'SkullSpecimenPivot';
	scene.add(skullRootPivot);

	const ghostGroup = new THREE.Group();
	ghostGroup.name = 'AssembledGhostReference';
	ghostGroup.visible = state.appearance.showGhostReference;
	skullRootPivot.add(ghostGroup);

	// Dynamic Beauchene brass filament lines connecting each bone's assembled centroid to its exploded centroid
	const filamentPositions = new Float32Array(SKULL_BONE_IDS.length * 6);
	const filamentGeometry = new THREE.BufferGeometry();
	filamentGeometry.setAttribute('position', new THREE.BufferAttribute(filamentPositions, 3));
	const filamentMaterial = new THREE.LineBasicMaterial({
		color: '#d4a359',
		transparent: true,
		opacity: 0.48,
		depthWrite: false
	});
	const armatureFilaments = new THREE.LineSegments(filamentGeometry, filamentMaterial);
	armatureFilaments.frustumCulled = false;
	armatureFilaments.visible = state.appearance.showArmatureFilaments;
	skullRootPivot.add(armatureFilaments);

	const bumpTexture = createBoneMicroTexture();

	const enamelMaterial = new THREE.MeshStandardMaterial({
		color: '#f2ede0',
		roughness: 0.28,
		metalness: 0.03,
		bumpMap: bumpTexture,
		bumpScale: 0.0025
	});

	const ghostMaterial = new THREE.MeshStandardMaterial({
		color: '#a8b3c6',
		roughness: 0.7,
		metalness: 0.0,
		transparent: true,
		opacity: 0.13,
		depthWrite: false,
		wireframe: false
	});

	const boneNodes = new Map<BoneId, BoneRenderNode>();
	const raycastTargets: THREE.Object3D[] = [];
	let cameraTransition: CameraTransition | null = null;
	const targetSpecimenEuler = new THREE.Euler(0, 0, 0, 'XYZ');
	const currentSpecimenQuat = new THREE.Quaternion();
	const targetSpecimenQuat = new THREE.Quaternion();

	let loadedMeshCount = 0;
	let loadedTriangleCount = 0;

	function applySutureShader(
		mat: THREE.MeshStandardMaterial,
		sutureUniform: { value: number },
		sutureTintUniform: { value: THREE.Color }
	): void {
		mat.customProgramCacheKey = () => 'bp3d-skull-suture-v1';
		mat.onBeforeCompile = (shader) => {
			shader.uniforms.uSutureStrength = sutureUniform;
			shader.uniforms.uSutureTint = sutureTintUniform;
			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					`#include <common>
attribute float _suture;
varying float vSuture;`
				)
				.replace(
					'#include <color_vertex>',
					`#include <color_vertex>
vSuture = _suture;`
				);
			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <common>',
					`#include <common>
varying float vSuture;
uniform float uSutureStrength;
uniform vec3 uSutureTint;`
				)
				.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
float sutureMask = clamp(vSuture * uSutureStrength, 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, uSutureTint, sutureMask * 0.52);`
				);
		};
	}

	function createBoneMaterial(boneId: BoneId, hasSutureAttr: boolean) {
		const sutureUniform = { value: state.appearance.showSutures ? 1.0 : 0.0 };
		const sutureTintUniform = { value: new THREE.Color('#4a3825') };
		const material = new THREE.MeshStandardMaterial({
			color: state.appearance.boneColor,
			roughness: state.appearance.roughness,
			metalness: 0.02,
			bumpMap: bumpTexture,
			bumpScale: 0.0055
		});
		if (hasSutureAttr) {
			applySutureShader(material, sutureUniform, sutureTintUniform);
		}
		return {
			material,
			sutureUniform,
			sutureTintUniform,
			warmthOffset: BONE_TONE_BIAS[boneId] ?? 0
		};
	}

	function registerMeshTree(rootObject: THREE.Object3D): void {
		const objectsByName = new Map<string, THREE.Object3D>();
		rootObject.traverse((child) => {
			if (child.name) {
				objectsByName.set(child.name, child);
			}
		});

		for (const bone of SKULL_BONES) {
			const gltfNode = objectsByName.get(bone.id);
			if (!gltfNode) continue;

			let boneMesh: THREE.Mesh | null = null;
			const dentitionMeshes: THREE.Mesh[] = [];

			// Identify main bone mesh vs attached child dentition meshes
			if ((gltfNode as THREE.Mesh).isMesh) {
				boneMesh = gltfNode as THREE.Mesh;
			}
			gltfNode.traverse((desc) => {
				if (desc === gltfNode) return;
				if ((desc as THREE.Mesh).isMesh) {
					if (desc.name.startsWith('dentition-')) {
						dentitionMeshes.push(desc as THREE.Mesh);
					} else if (!boneMesh) {
						boneMesh = desc as THREE.Mesh;
					}
				}
			});

			if (!boneMesh) continue;

			const hasSuture = Boolean(boneMesh.geometry.getAttribute('_suture'));
			const { material, sutureUniform, sutureTintUniform, warmthOffset } = createBoneMaterial(
				bone.id,
				hasSuture
			);

			boneMesh.material = material;
			boneMesh.castShadow = true;
			boneMesh.receiveShadow = true;
			boneMesh.userData.boneId = bone.id;
			raycastTargets.push(boneMesh);

			loadedMeshCount += 1;
			const triAttr = boneMesh.geometry.index;
			loadedTriangleCount += triAttr
				? Math.floor(triAttr.count / 3)
				: Math.floor(boneMesh.geometry.attributes.position.count / 3);

			const group = new THREE.Group();
			group.name = `BoneGroup_${bone.id}`;
			skullRootPivot.add(group);

			// Move node under our dedicated animation pivot while preserving children (dentition!)
			group.add(gltfNode);

			for (const dMesh of dentitionMeshes) {
				dMesh.material = enamelMaterial.clone();
				dMesh.castShadow = true;
				dMesh.receiveShadow = true;
				dMesh.userData.boneId = bone.id;
				dMesh.userData.isDentition = true;
				raycastTargets.push(dMesh);
				loadedMeshCount += 1;
				const dIdx = dMesh.geometry.index;
				loadedTriangleCount += dIdx ? Math.floor(dIdx.count / 3) : 0;
			}

			// Lightweight reference ghost seated permanently at assembled position
			const ghostMesh = new THREE.Mesh(boneMesh.geometry, ghostMaterial);
			ghostMesh.raycast = () => undefined;
			ghostMesh.renderOrder = 2;
			ghostGroup.add(ghostMesh);

			boneNodes.set(bone.id, {
				id: bone.id,
				group,
				mesh: boneMesh,
				material,
				ghostMesh,
				sutureUniform,
				sutureTintUniform,
				dentitionMeshes,
				currentPos: new THREE.Vector3(),
				targetPos: new THREE.Vector3(),
				currentRotX: 0,
				targetRotX: 0,
				currentOpacity: 1,
				targetOpacity: 1,
				targetVisible: true,
				warmthOffset
			});
		}
	}

	function syncAppearanceAndTargets(snapImmediately = false): void {
		const baseColor = new THREE.Color(state.appearance.boneColor);
		const presetMeta = MATERIAL_PRESETS.find((m) => m.id === state.appearance.materialPreset);
		const metalness = presetMeta?.metalness ?? 0.02;
		const roughness = state.appearance.roughness;
		const bgMeta = BACKGROUND_THEMES.find((b) => b.id === state.appearance.backgroundTheme);
		const sutureDarkColor = bgMeta?.isLight
			? new THREE.Color('#3b2c1d')
			: new THREE.Color('#3e2c1a');

		gridHelper.visible = state.display.showCoordinateGrid;
		ghostGroup.visible = state.appearance.showGhostReference && !state.compareAssembled;
		armatureFilaments.visible =
			state.appearance.showArmatureFilaments &&
			!state.compareAssembled &&
			state.globalExplosion > 0.005;

		controls.autoRotate = state.rotation.autoRotate;
		controls.autoRotateSpeed = state.rotation.autoRotateSpeed * 2.2;

		targetSpecimenEuler.set(
			THREE.MathUtils.degToRad(state.rotation.xDeg),
			THREE.MathUtils.degToRad(state.rotation.yDeg),
			THREE.MathUtils.degToRad(state.rotation.zDeg),
			'XYZ'
		);
		targetSpecimenQuat.setFromEuler(targetSpecimenEuler);
		if (snapImmediately || prefersReducedMotion) {
			currentSpecimenQuat.copy(targetSpecimenQuat);
			skullRootPivot.quaternion.copy(currentSpecimenQuat);
		}

		const selectedSet = new Set(state.selectedBoneIds);
		const anySelected = selectedSet.size > 0;

		for (const bone of SKULL_BONES) {
			const node = boneNodes.get(bone.id);
			if (!node) continue;

			const computed = computeBoneTargetTransform(bone, state);
			node.targetPos.set(computed.position[0], computed.position[1], computed.position[2]);
			node.targetRotX = computed.rotationRad[0];
			node.targetVisible = computed.visible;
			node.targetOpacity = computed.opacity;

			if (snapImmediately || prefersReducedMotion) {
				node.currentPos.copy(node.targetPos);
				node.currentRotX = node.targetRotX;
				node.currentOpacity = node.targetOpacity;
				node.group.position.copy(node.currentPos);
				node.group.rotation.x = node.currentRotX;
				node.group.visible = node.targetVisible;
			} else if (node.targetVisible) {
				node.group.visible = true;
			}

			const isSelected = selectedSet.has(bone.id);
			const isHovered = hoveredBoneId === bone.id;

			// Compute calibrated bone hue/lightness offset so adjacent bones stay subtly distinguishable
			const matColor = baseColor.clone();
			const hsl = { h: 0, s: 0, l: 0 };
			matColor.getHSL(hsl);
			const dimmedBySelection = anySelected && !isSelected && !isHovered;
			const lightShift = isSelected
				? 0.045
				: isHovered
					? 0.03
					: dimmedBySelection
						? node.warmthOffset - 0.035
						: node.warmthOffset;
			matColor.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + lightShift, 0.08, 0.96));

			node.material.color.copy(matColor);
			node.material.roughness = roughness;
			node.material.metalness = metalness;
			node.material.wireframe = state.appearance.wireframe;
			node.sutureUniform.value = state.appearance.showSutures ? 1.0 : 0.0;
			node.sutureTintUniform.value.copy(sutureDarkColor);

			if (isSelected) {
				node.material.emissive.set('#d8913b');
				node.material.emissiveIntensity = 0.36;
			} else if (isHovered) {
				node.material.emissive.set('#dfa556');
				node.material.emissiveIntensity = 0.22;
			} else {
				node.material.emissive.set('#000000');
				node.material.emissiveIntensity = 0;
			}

			for (const dMesh of node.dentitionMeshes) {
				dMesh.visible = state.appearance.showDentition;
				const dMat = dMesh.material as THREE.MeshStandardMaterial;
				dMat.wireframe = state.appearance.wireframe;
				dMat.emissive.copy(node.material.emissive);
				dMat.emissiveIntensity = node.material.emissiveIntensity * 0.7;
			}
		}

		requestRender();
	}

	function updateFilamentGeometry(): void {
		if (!armatureFilaments.visible) return;
		const posAttr = filamentGeometry.getAttribute('position') as THREE.BufferAttribute;
		let ptr = 0;
		for (const bone of SKULL_BONES) {
			const node = boneNodes.get(bone.id);
			const [ax, ay, az] = bone.anatomicalPosition;
			if (!node || !node.group.visible) {
				posAttr.setXYZ(ptr, 0, 0, 0);
				posAttr.setXYZ(ptr + 1, 0, 0, 0);
			} else {
				posAttr.setXYZ(ptr, ax, ay, az);
				posAttr.setXYZ(
					ptr + 1,
					ax + node.currentPos.x,
					ay + node.currentPos.y,
					az + node.currentPos.z
				);
			}
			ptr += 2;
		}
		posAttr.needsUpdate = true;
	}

	const projVec = new THREE.Vector3();
	const matWorldProj = new THREE.Matrix4();
	const axisRightVec = new THREE.Vector3();
	const axisUpVec = new THREE.Vector3();
	const axisForwardVec = new THREE.Vector3();
	const invViewRot = new THREE.Matrix4();

	function emitOrientationSnapshot(): void {
		if (!callbacks.onOrientationUpdate) return;
		// Transform anatomical basis vectors (+X Left, +Y Superior, +Z Anterior) into camera view space
		invViewRot.extractRotation(camera.matrixWorldInverse);
		matWorldProj.extractRotation(skullRootPivot.matrixWorld);
		const combined = invViewRot.multiply(matWorldProj);
		axisRightVec.set(1, 0, 0).applyMatrix4(combined).normalize();
		axisUpVec.set(0, 1, 0).applyMatrix4(combined).normalize();
		axisForwardVec.set(0, 0, 1).applyMatrix4(combined).normalize();
		callbacks.onOrientationUpdate({
			right: [axisRightVec.x, axisRightVec.y, axisRightVec.z],
			up: [axisUpVec.x, axisUpVec.y, axisUpVec.z],
			forward: [axisForwardVec.x, axisForwardVec.y, axisForwardVec.z]
		});
	}

	function computeAndEmitLabels(): ProjectedBoneLabel[] {
		const vw = canvas.clientWidth || width;
		const vh = canvas.clientHeight || height;
		if (!state.display.showLabels) {
			callbacks.onLabelsUpdate?.([]);
			return [];
		}
		const selectedSet = new Set(state.selectedBoneIds);
		const rawLabels: ProjectedBoneLabel[] = [];

		for (const bone of SKULL_BONES) {
			const node = boneNodes.get(bone.id);
			if (!node || !node.group.visible) continue;

			const isSelected = selectedSet.has(bone.id);
			const isHovered = hoveredBoneId === bone.id;
			if (
				state.display.labelDensity === 'selected-and-key' &&
				!isSelected &&
				!isHovered &&
				!bone.isMajorLandmark
			) {
				continue;
			}

			projVec.set(...bone.anatomicalPosition);
			node.group.localToWorld(projVec);
			projVec.project(camera);

			// Skip behind camera
			if (projVec.z > 1 || projVec.z < -1) continue;

			const sx = (projVec.x * 0.5 + 0.5) * vw;
			const sy = (-projVec.y * 0.5 + 0.5) * vh;
			if (sx < -40 || sx > vw + 40 || sy < -40 || sy > vh + 40) continue;

			const tr = computeBoneTargetTransform(bone, state);
			rawLabels.push({
				boneId: bone.id,
				label: getBoneLabelText(bone.id, state.display.showBoneNames),
				shortName: bone.shortName,
				category: bone.category,
				side: bone.side,
				anchorX: sx,
				anchorY: sy,
				labelX: sx,
				labelY: sy,
				depth: projVec.z,
				selected: isSelected,
				hovered: isHovered,
				displacementMm: tr.displacementMm
			});
		}

		const resolved = resolveLabelCollisions(rawLabels, vw, vh);
		callbacks.onLabelsUpdate?.(resolved);
		return resolved;
	}

	function stepAnimations(dtSec: number): boolean {
		let moving = false;
		const speed = Math.max(0.25, Math.min(2.5, state.animationSpeed));
		const alpha = prefersReducedMotion ? 1 : 1 - Math.exp(-9.5 * speed * dtSec);

		// Specimen rotation quaternion
		if (currentSpecimenQuat.angleTo(targetSpecimenQuat) > 0.0008) {
			currentSpecimenQuat.slerp(targetSpecimenQuat, alpha);
			skullRootPivot.quaternion.copy(currentSpecimenQuat);
			moving = true;
		} else if (!currentSpecimenQuat.equals(targetSpecimenQuat)) {
			currentSpecimenQuat.copy(targetSpecimenQuat);
			skullRootPivot.quaternion.copy(currentSpecimenQuat);
		}

		for (const node of boneNodes.values()) {
			const posDist = node.currentPos.distanceTo(node.targetPos);
			if (posDist > 0.0005) {
				node.currentPos.lerp(node.targetPos, alpha);
				node.group.position.copy(node.currentPos);
				moving = true;
			} else if (!node.currentPos.equals(node.targetPos)) {
				node.currentPos.copy(node.targetPos);
				node.group.position.copy(node.currentPos);
			}

			const rotDiff = Math.abs(node.targetRotX - node.currentRotX);
			if (rotDiff > 0.0005) {
				node.currentRotX += (node.targetRotX - node.currentRotX) * alpha;
				node.group.rotation.x = node.currentRotX;
				moving = true;
			} else if (node.currentRotX !== node.targetRotX) {
				node.currentRotX = node.targetRotX;
				node.group.rotation.x = node.targetRotX;
			}

			const effectiveTargetOp = node.targetVisible ? node.targetOpacity : 0;
			const opDiff = Math.abs(effectiveTargetOp - node.currentOpacity);
			if (opDiff > 0.005) {
				node.currentOpacity += (effectiveTargetOp - node.currentOpacity) * alpha;
				moving = true;
			} else {
				node.currentOpacity = effectiveTargetOp;
			}

			const shouldTrans = node.currentOpacity < 0.99;
			if (node.material.transparent !== shouldTrans) {
				node.material.transparent = shouldTrans;
				node.material.depthWrite = !shouldTrans;
				node.material.needsUpdate = true;
			}
			node.material.opacity = node.currentOpacity;

			for (const dMesh of node.dentitionMeshes) {
				const dMat = dMesh.material as THREE.MeshStandardMaterial;
				if (dMat.transparent !== shouldTrans) {
					dMat.transparent = shouldTrans;
					dMat.depthWrite = !shouldTrans;
					dMat.needsUpdate = true;
				}
				dMat.opacity = node.currentOpacity;
			}

			if (!node.targetVisible && node.currentOpacity <= 0.02) {
				node.group.visible = false;
			} else if (node.targetVisible) {
				node.group.visible = true;
			}
		}

		// Camera preset transition
		if (cameraTransition) {
			const elapsed = performance.now() - cameraTransition.startTime;
			const rawT = Math.min(1, elapsed / cameraTransition.durationMs);
			const easeT = prefersReducedMotion ? 1 : 1 - Math.pow(1 - rawT, 3);
			camera.position.lerpVectors(cameraTransition.fromPos, cameraTransition.toPos, easeT);
			controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, easeT);
			camera.up.lerpVectors(cameraTransition.fromUp, cameraTransition.toUp, easeT).normalize();
			controls.update();
			moving = true;
			if (rawT >= 1) {
				cameraTransition = null;
			}
		}

		return moving;
	}

	function renderLoop(): void {
		rafId = 0;
		if (disposed || contextLost) return;

		const now = performance.now();
		const dtSec = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
		lastFrameTime = now;

		const controlsMoved = controls.update();
		const animMoved = stepAnimations(dtSec);

		skullRootPivot.updateMatrixWorld(true);
		updateFilamentGeometry();

		renderer.render(scene, camera);

		if (dirtyLabels || controlsMoved || animMoved || state.rotation.autoRotate) {
			dirtyLabels = false;
			emitOrientationSnapshot();
			computeAndEmitLabels();
		}

		const stillActive =
			controlsMoved || animMoved || Boolean(cameraTransition) || state.rotation.autoRotate;

		if (stillActive) {
			rafId = window.requestAnimationFrame(renderLoop);
		}
	}

	function requestRender(withLabels = true): void {
		if (disposed || contextLost) return;
		if (withLabels) dirtyLabels = true;
		if (rafId === 0) {
			lastFrameTime = performance.now();
			rafId = window.requestAnimationFrame(renderLoop);
		}
	}

	// Cancel programmatic camera transition when user interacts directly
	const onControlsStart = () => {
		cameraTransition = null;
		requestRender();
	};
	const onControlsChange = () => {
		requestRender();
	};
	controls.addEventListener('start', onControlsStart);
	controls.addEventListener('change', onControlsChange);

	// Pointer raycasting for hover, click selection, and double-click/double-tap isolation/focus
	const raycaster = new THREE.Raycaster();
	const pointerNdc = new THREE.Vector2();
	let pointerDownPos = { x: 0, y: 0, time: 0 };
	let lastTap = { boneId: null as BoneId | null, time: 0 };

	function pickBoneAtClient(clientX: number, clientY: number): BoneId | null {
		if (raycastTargets.length === 0) return null;
		const rect = canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
		pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(pointerNdc, camera);
		const hits = raycaster.intersectObjects(raycastTargets, false);
		for (const hit of hits) {
			// Skip hidden meshes or hidden bone groups
			let cur: THREE.Object3D | null = hit.object;
			let visible = true;
			while (cur) {
				if (!cur.visible) {
					visible = false;
					break;
				}
				cur = cur.parent;
			}
			if (!visible) continue;
			const boneId = hit.object.userData.boneId as BoneId | undefined;
			if (boneId && BONE_BY_ID[boneId]) {
				return boneId;
			}
		}
		return null;
	}

	const onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0 && e.pointerType === 'mouse') return;
		pointerDownPos = { x: e.clientX, y: e.clientY, time: performance.now() };
	};

	const onPointerMove = (e: PointerEvent) => {
		if (e.pointerType !== 'mouse') return;
		const boneId = pickBoneAtClient(e.clientX, e.clientY);
		if (boneId !== hoveredBoneId) {
			hoveredBoneId = boneId;
			syncAppearanceAndTargets(false);
		}
		canvas.style.cursor = boneId ? 'pointer' : 'grab';
		callbacks.onHoverBone?.({
			boneId,
			clientX: e.clientX,
			clientY: e.clientY
		});
	};

	const onPointerLeave = () => {
		if (hoveredBoneId !== null) {
			hoveredBoneId = null;
			syncAppearanceAndTargets(false);
		}
		callbacks.onHoverBone?.({ boneId: null, clientX: 0, clientY: 0 });
	};

	const onPointerUp = (e: PointerEvent) => {
		if (e.button !== 0 && e.pointerType === 'mouse') return;
		const movedDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
		if (movedDist > 7) return;

		const boneId = pickBoneAtClient(e.clientX, e.clientY);
		const additive = e.shiftKey || e.ctrlKey || e.metaKey;
		callbacks.onSelectBone?.(boneId, additive);

		const now = performance.now();
		if (boneId && lastTap.boneId === boneId && now - lastTap.time < 340) {
			callbacks.onDoubleClickBone?.(boneId);
			lastTap = { boneId: null, time: 0 };
		} else {
			lastTap = { boneId, time: now };
		}
	};

	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('pointerleave', onPointerLeave);
	canvas.addEventListener('pointerup', onPointerUp);

	// WebGL Context Loss & Restoration handling
	const onContextLost = (e: Event) => {
		e.preventDefault();
		contextLost = true;
		if (rafId !== 0) {
			window.cancelAnimationFrame(rafId);
			rafId = 0;
		}
		callbacks.onContextLossChange?.(true);
	};
	const onContextRestored = () => {
		contextLost = false;
		callbacks.onContextLossChange?.(false);
		syncAppearanceAndTargets(true);
		requestRender(true);
	};
	canvas.addEventListener('webglcontextlost', onContextLost);
	canvas.addEventListener('webglcontextrestored', onContextRestored);

	// Responsive container resize observer
	let lastObsW = width;
	let lastObsH = height;
	const resizeObserver = new ResizeObserver((entries) => {
		if (disposed) return;
		for (const entry of entries) {
			const w = Math.max(Math.round(entry.contentRect.width), 64);
			const h = Math.max(Math.round(entry.contentRect.height), 64);
			if (w !== lastObsW || h !== lastObsH) {
				lastObsW = w;
				lastObsH = h;
				camera.aspect = w / h;
				camera.updateProjectionMatrix();
				renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
				renderer.setSize(w, h, false);
				requestRender(true);
			}
		}
	});
	if (canvas.parentElement) {
		resizeObserver.observe(canvas.parentElement);
	}

	function startCameraTransition(
		toPos: THREE.Vector3,
		toTarget: THREE.Vector3,
		toUp: THREE.Vector3,
		instant = false
	): void {
		if (instant || prefersReducedMotion) {
			cameraTransition = null;
			camera.position.copy(toPos);
			controls.target.copy(toTarget);
			camera.up.copy(toUp).normalize();
			controls.update();
			requestRender(true);
			return;
		}
		cameraTransition = {
			startTime: performance.now(),
			durationMs: 420,
			fromPos: camera.position.clone(),
			toPos,
			fromTarget: controls.target.clone(),
			toTarget,
			fromUp: camera.up.clone().normalize(),
			toUp: toUp.clone().normalize()
		};
		requestRender(true);
	}

	// Load segmented anatomical BodyParts3D GLB mesh
	try {
		const loader = new GLTFLoader();
		const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
			loader.load(
				modelUrl,
				(result) => resolve(result),
				(xhr) => {
					if (xhr.total > 0) {
						callbacks.onLoadProgress?.(Math.min(1, xhr.loaded / xhr.total));
					}
				},
				(err) => reject(err)
			);
		});
		if (!disposed) {
			registerMeshTree(gltf.scene);
			syncAppearanceAndTargets(true);
			skullRootPivot.updateMatrixWorld(true);
			updateFilamentGeometry();
			renderer.render(scene, camera);
			emitOrientationSnapshot();
			computeAndEmitLabels();
			callbacks.onLoaded?.({
				loadedFromGlb: true,
				meshCount: loadedMeshCount,
				triangleCount: loadedTriangleCount
			});
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		callbacks.onLoadError?.(`Unable to load anatomical skull asset: ${msg}`);
	}

	const handle: SkullRendererHandle = {
		updateState(nextState: SkullViewerState): void {
			if (disposed) return;
			state = nextState;
			syncAppearanceAndTargets(false);
			requestRender(true);
		},

		setCameraPreset(presetId: CameraPresetId, instant = false): void {
			if (disposed) return;
			const cam = CAMERA_PRESET_BY_ID[presetId];
			if (!cam) return;
			const dir = new THREE.Vector3(...cam.direction).normalize();
			// Scale camera distance gently with global explosion so 100% exploded skull stays cleanly framed
			const expFactor = state.compareAssembled ? 0 : state.globalExplosion;
			const framedDistance = cam.distance * (1 + expFactor * 0.36);
			const toPos = dir.multiplyScalar(framedDistance);
			const toUp = new THREE.Vector3(...cam.up).normalize();
			startCameraTransition(toPos, new THREE.Vector3(0, -0.14, 0), toUp, instant);
		},

		setOrientationView(axis: Vec3, up?: Vec3): void {
			if (disposed) return;
			const dir = new THREE.Vector3(...axis).normalize();
			const safeUp: Vec3 = up
				? up
				: Math.abs(dir.y) > 0.92
					? [0, 0, dir.y > 0 ? -1 : 1]
					: [0, 1, 0];
			// Transform into specimen world orientation so clicking an anatomical gizmo face aligns cleanly
			dir.applyQuaternion(currentSpecimenQuat);
			const currentDist = Math.max(2.2, camera.position.distanceTo(controls.target));
			const toPos = controls.target.clone().add(dir.multiplyScalar(currentDist));
			const toUp = new THREE.Vector3(...safeUp).applyQuaternion(currentSpecimenQuat).normalize();
			startCameraTransition(toPos, controls.target.clone(), toUp, false);
		},

		zoomStep(factor: number): void {
			if (disposed) return;
			const offset = camera.position.clone().sub(controls.target);
			const nextLen = THREE.MathUtils.clamp(
				offset.length() * factor,
				controls.minDistance,
				controls.maxDistance
			);
			offset.setLength(nextLen);
			startCameraTransition(
				controls.target.clone().add(offset),
				controls.target.clone(),
				camera.up.clone(),
				false
			);
		},

		fitModel(instant = false): void {
			if (disposed) return;
			const box = new THREE.Box3();
			let hasVisible = false;
			for (const node of boneNodes.values()) {
				if (!node.group.visible) continue;
				const subBox = new THREE.Box3().setFromObject(node.group);
				if (!subBox.isEmpty()) {
					box.union(subBox);
					hasVisible = true;
				}
			}
			if (!hasVisible || box.isEmpty()) {
				handle.setCameraPreset('three-quarter', instant);
				return;
			}
			const center = box.getCenter(new THREE.Vector3());
			const size = box.getSize(new THREE.Vector3());
			const maxDim = Math.max(size.x, size.y, size.z, 0.5);
			const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
			const dist = THREE.MathUtils.clamp((maxDim / (2 * Math.tan(halfFov))) * 1.48, 2.0, 12.5);
			const dir = camera.position.clone().sub(controls.target).normalize();
			if (dir.lengthSq() < 1e-4) dir.set(0.62, 0.22, 0.75).normalize();
			startCameraTransition(
				center.clone().add(dir.multiplyScalar(dist)),
				center,
				camera.up.clone(),
				instant
			);
		},

		focusBone(boneId: BoneId, instant = false): void {
			if (disposed) return;
			const node = boneNodes.get(boneId);
			if (!node) return;
			node.group.updateMatrixWorld(true);
			const box = new THREE.Box3().setFromObject(node.group);
			if (box.isEmpty()) return;
			const center = box.getCenter(new THREE.Vector3());
			const size = box.getSize(new THREE.Vector3());
			const maxDim = Math.max(size.x, size.y, size.z, 0.35);
			const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
			const dist = THREE.MathUtils.clamp((maxDim / (2 * Math.tan(halfFov))) * 2.1, 1.75, 8.5);
			// Aim from current view direction or anatomical outward vector if frontal view
			const dir = camera.position.clone().sub(controls.target).normalize();
			if (dir.lengthSq() < 1e-4) {
				const meta = BONE_BY_ID[boneId];
				dir.set(...meta.explosionDirection).normalize();
			}
			const nextUp = Math.abs(dir.y) > 0.92 ? camera.up.clone() : new THREE.Vector3(0, 1, 0);
			startCameraTransition(center.clone().add(dir.multiplyScalar(dist)), center, nextUp, instant);
		},

		getCameraSnapshot(): { position: Vec3; target: Vec3 } {
			return {
				position: [camera.position.x, camera.position.y, camera.position.z],
				target: [controls.target.x, controls.target.y, controls.target.z]
			};
		},

		setCameraSnapshot(snapshot: { position: Vec3; target: Vec3 }, instant = false): void {
			if (disposed) return;
			startCameraTransition(
				new THREE.Vector3(...snapshot.position),
				new THREE.Vector3(...snapshot.target),
				new THREE.Vector3(0, 1, 0),
				instant
			);
		},

		async exportPng(options: {
			includeLabels: boolean;
			labels?: ProjectedBoneLabel[];
		}): Promise<Blob | null> {
			if (disposed || contextLost) return null;
			// Force fresh immediate render before reading WebGL drawing buffer
			skullRootPivot.updateMatrixWorld(true);
			updateFilamentGeometry();
			renderer.render(scene, camera);

			const w = canvas.width || width;
			const h = canvas.height || height;
			const outCanvas = document.createElement('canvas');
			outCanvas.width = w;
			outCanvas.height = h;
			const ctx = outCanvas.getContext('2d');
			if (!ctx) return null;

			const bg =
				BACKGROUND_THEMES.find((b) => b.id === state.appearance.backgroundTheme) ??
				BACKGROUND_THEMES[0];
			const grad = ctx.createRadialGradient(
				w * 0.5,
				h * 0.45,
				w * 0.06,
				w * 0.5,
				h * 0.5,
				w * 0.72
			);
			grad.addColorStop(0, bg.radialCenter);
			grad.addColorStop(1, bg.hex);
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, w, h);

			ctx.drawImage(canvas, 0, 0, w, h);

			const dpr = w / Math.max(1, canvas.clientWidth || w);
			if (options.includeLabels) {
				const labels = options.labels ?? computeAndEmitLabels();
				ctx.save();
				ctx.scale(dpr, dpr);
				ctx.font = '500 12px Inter, system-ui, sans-serif';
				for (const item of labels) {
					ctx.strokeStyle = item.selected
						? 'rgba(223, 165, 86, 0.9)'
						: bg.isLight
							? 'rgba(30, 32, 36, 0.55)'
							: 'rgba(233, 226, 210, 0.52)';
					ctx.lineWidth = item.selected ? 1.5 : 1;
					ctx.beginPath();
					ctx.moveTo(item.anchorX, item.anchorY);
					ctx.lineTo(item.labelX, item.labelY);
					ctx.stroke();

					ctx.fillStyle = item.selected ? '#dfa556' : bg.isLight ? '#23201b' : '#e9e2d2';
					ctx.beginPath();
					ctx.arc(item.anchorX, item.anchorY, 2.5, 0, Math.PI * 2);
					ctx.fill();

					const tw = ctx.measureText(item.label).width;
					const bw = tw + 14;
					const bh = 20;
					ctx.fillStyle = bg.isLight ? 'rgba(248, 244, 236, 0.92)' : 'rgba(15, 17, 22, 0.88)';
					ctx.strokeStyle = item.selected
						? 'rgba(223, 165, 86, 0.85)'
						: bg.isLight
							? 'rgba(60, 50, 38, 0.25)'
							: 'rgba(233, 226, 210, 0.22)';
					ctx.lineWidth = 1;
					ctx.beginPath();
					ctx.roundRect(item.labelX - bw / 2, item.labelY - bh / 2, bw, bh, 4);
					ctx.fill();
					ctx.stroke();

					ctx.fillStyle = item.selected ? '#dfa556' : bg.isLight ? '#1d1b18' : '#efeae0';
					ctx.textAlign = 'center';
					ctx.textBaseline = 'middle';
					ctx.fillText(item.label, item.labelX, item.labelY + 0.5);
				}
				ctx.restore();
			}

			// Museum specimen plaque footer
			ctx.save();
			ctx.scale(dpr, dpr);
			const ch = canvas.clientHeight || h;
			ctx.font = '500 11px Inter, system-ui, sans-serif';
			ctx.fillStyle = bg.isLight ? 'rgba(28, 24, 20, 0.7)' : 'rgba(233, 226, 210, 0.65)';
			ctx.textAlign = 'left';
			ctx.fillText(
				`Exploded Human Skull Exhibit · Separation ${Math.round((state.compareAssembled ? 0 : state.globalExplosion) * 100)}% · BodyParts3D (CC BY 4.0)`,
				18,
				ch - 16
			);
			ctx.restore();

			return await new Promise<Blob | null>((resolve) => {
				outCanvas.toBlob((blob) => resolve(blob), 'image/png');
			});
		},

		dispose(): void {
			if (disposed) return;
			disposed = true;
			if (rafId !== 0) {
				window.cancelAnimationFrame(rafId);
				rafId = 0;
			}
			resizeObserver.disconnect();
			controls.removeEventListener('start', onControlsStart);
			controls.removeEventListener('change', onControlsChange);
			controls.dispose();

			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerleave', onPointerLeave);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('webglcontextlost', onContextLost);
			canvas.removeEventListener('webglcontextrestored', onContextRestored);

			for (const node of boneNodes.values()) {
				node.mesh.geometry.dispose();
				node.material.dispose();
				for (const dm of node.dentitionMeshes) {
					dm.geometry.dispose();
					(dm.material as THREE.Material).dispose();
				}
			}
			boneNodes.clear();
			filamentGeometry.dispose();
			filamentMaterial.dispose();
			enamelMaterial.dispose();
			ghostMaterial.dispose();
			bumpTexture?.dispose();
			envTarget.dispose();
			envScene.dispose?.();
			pmrem.dispose();
			renderer.dispose();
		}
	};

	return handle;
}
