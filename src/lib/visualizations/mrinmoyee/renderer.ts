import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildSculpture } from './sculpture';
import type { AtelierDesign, CameraView, ExportOptions } from './types';

export type RenderQuality = 'auto' | 'high' | 'low';
export interface ViewportOptions {
	quality: RenderQuality;
	presentation: boolean;
	ambientMotion?: boolean;
	reducedMotion: boolean;
}
interface Callbacks {
	oncamera?: (camera: CameraView) => void;
	onselect?: (region: string) => void;
	onbell?: () => void;
	onerror?: (message: string) => void;
}
export interface AtelierRenderer {
	update: (design: AtelierDesign, options: ViewportOptions) => void;
	exportImage: (options: ExportOptions) => Promise<Blob>;
	thumbnail: () => string | undefined;
	ringBell: () => void;
	dispose: () => void;
}

const clamp = THREE.MathUtils.clamp;
const BASE_FOV = 39;
const PORTRAIT_SAFE_ASPECT = 0.9;
const vec = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
const geometryKey = (design: AtelierDesign) => {
	const {
		camera,
		backdrop,
		lamps,
		lampIntensity,
		lightWarmth,
		lightAngle,
		exposure,
		atmosphere,
		bells,
		presetId,
		...geometry
	} = design;
	void camera;
	void backdrop;
	void lamps;
	void lampIntensity;
	void lightWarmth;
	void lightAngle;
	void exposure;
	void atmosphere;
	void bells;
	void presetId;
	return JSON.stringify(geometry);
};

/** Release shared geometries/materials once, including resources introduced by the sculptor. */
function disposeObject(root: THREE.Object3D) {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	root.traverse((object) => {
		if (
			!(
				object instanceof THREE.Mesh ||
				object instanceof THREE.Points ||
				object instanceof THREE.Line
			)
		)
			return;
		geometries.add(object.geometry);
		for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
			materials.add(material);
			for (const value of Object.values(material))
				if (value instanceof THREE.Texture) textures.add(value);
		}
	});
	textures.forEach((texture) => texture.dispose());
	materials.forEach((material) => material.dispose());
	geometries.forEach((geometry) => geometry.dispose());
}

function metallic(colour = '#be8b42', roughness = 0.33) {
	return new THREE.MeshStandardMaterial({ color: colour, metalness: 0.78, roughness });
}
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
	const result = new THREE.Mesh(geometry, material);
	result.position.set(x, y, z);
	result.castShadow = true;
	result.receiveShadow = true;
	return result;
}

function buildBells(): THREE.Group {
	const group = new THREE.Group();
	const brass = metallic('#bc8c48', 0.26);
	const darkBrass = metallic('#74512c', 0.4);
	const profile = [
		new THREE.Vector2(0.055, 0.42),
		new THREE.Vector2(0.11, 0.38),
		new THREE.Vector2(0.14, 0.26),
		new THREE.Vector2(0.19, 0.08),
		new THREE.Vector2(0.28, 0),
		new THREE.Vector2(0.29, -0.045)
	];
	for (const [index, x] of [-3.25, 3.25].entries()) {
		const pivot = new THREE.Group();
		pivot.position.set(x, index ? 8.5 : 8.1, 0.45);
		pivot.userData.bell = true;
		group.add(pivot);
		for (let i = 0; i < 9; i++) {
			const link = mesh(new THREE.TorusGeometry(0.036, 0.011, 5, 10), darkBrass, 0, -i * 0.065, 0);
			link.rotation.y = ((i % 2) * Math.PI) / 2;
			pivot.add(link);
		}
		const shell = mesh(new THREE.LatheGeometry(profile, 32), brass, 0, -1.02, 0);
		shell.material = new THREE.MeshStandardMaterial({
			color: '#bd904d',
			metalness: 0.8,
			roughness: 0.27,
			side: THREE.DoubleSide
		});
		pivot.add(shell);
		const lip = mesh(new THREE.TorusGeometry(0.285, 0.022, 8, 40), brass, 0, -1.055, 0);
		lip.rotation.x = Math.PI / 2;
		pivot.add(lip);
		pivot.add(mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.32, 8), darkBrass, 0, -0.96, 0));
		pivot.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), darkBrass, 0, -1.13, 0));
		const collar = mesh(new THREE.TorusGeometry(0.09, 0.017, 6, 22), brass, 0, -0.64, 0);
		collar.rotation.x = Math.PI / 2;
		pivot.add(collar);
		pivot.traverse((child) => {
			child.userData.bell = true;
		});
	}
	return group;
}

function buildLamps(): THREE.Group {
	const lamps = new THREE.Group();
	const brass = metallic('#bd853b', 0.32);
	const wick = new THREE.MeshStandardMaterial({ color: '#352621', roughness: 1 });
	for (const x of [-2.8, 2.8]) {
		const lamp = new THREE.Group();
		lamp.position.set(x, 0, 1.45);
		lamp.add(mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.09, 32), brass, 0, 0.06));
		lamp.add(mesh(new THREE.CylinderGeometry(0.045, 0.09, 0.5, 20), brass, 0, 0.32));
		lamp.add(mesh(new THREE.SphereGeometry(0.1, 16, 10), brass, 0, 0.5));
		const dish = mesh(
			new THREE.SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
			brass,
			0,
			0.62
		);
		dish.rotation.x = Math.PI;
		dish.scale.y = 0.35;
		lamp.add(dish);
		const ring = mesh(new THREE.TorusGeometry(0.28, 0.018, 6, 30), brass, 0, 0.62);
		ring.rotation.x = Math.PI / 2;
		lamp.add(ring);
		for (let i = 0; i < 5; i++) {
			const angle = (i / 5) * Math.PI * 2;
			const px = Math.cos(angle) * 0.22;
			const pz = Math.sin(angle) * 0.22;
			lamp.add(mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.07, 6), wick, px, 0.65, pz));
			const flame = mesh(
				new THREE.SphereGeometry(0.035, 10, 8),
				new THREE.MeshBasicMaterial({ color: '#ffe8a6', transparent: true, opacity: 0.94 }),
				px,
				0.735,
				pz
			);
			flame.scale.set(0.7, 2.3, 0.7);
			flame.userData.flame = true;
			lamp.add(flame);
		}
		const glow = new THREE.PointLight('#ffad40', 7, 6, 2);
		glow.position.set(0, 0.9, 0);
		lamp.add(glow);
		lamps.add(lamp);
	}
	return lamps;
}

function buildAtmosphere(): THREE.Group {
	const group = new THREE.Group();
	const textureCanvas = document.createElement('canvas');
	textureCanvas.width = textureCanvas.height = 64;
	const context = textureCanvas.getContext('2d');
	if (context) {
		const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
		gradient.addColorStop(0, '#ffffff');
		gradient.addColorStop(0.25, '#ffffffba');
		gradient.addColorStop(1, '#ffffff00');
		context.fillStyle = gradient;
		context.fillRect(0, 0, 64, 64);
	}
	const softPoint = new THREE.CanvasTexture(textureCanvas);
	const count = 95;
	const positions = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		// A stable constellation: moving the lights never reshuffles the artwork.
		positions[i * 3] = Math.sin(i * 12.32) * 4.2;
		positions[i * 3 + 1] = 0.5 + ((i * 0.6180339) % 1) * 8;
		positions[i * 3 + 2] = -1.5 + Math.cos(i * 17.91) * 2.5;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	const dust = new THREE.Points(
		geometry,
		new THREE.PointsMaterial({
			color: '#f1c783',
			size: 0.045,
			map: softPoint,
			transparent: true,
			opacity: 0.3,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		})
	);
	dust.userData.opacityScale = 0.42;
	dust.userData.dust = true;
	group.add(dust);
	const brass = metallic('#8b673b', 0.5);
	const stick = new THREE.MeshStandardMaterial({ color: '#3b241b', roughness: 1 });
	for (const x of [-2.2, 2.2]) {
		group.add(mesh(new THREE.CylinderGeometry(0.18, 0.1, 0.14, 20), brass, x, 0.12, -0.35));
		for (const offset of [-0.04, 0, 0.04]) {
			const incense = mesh(
				new THREE.CylinderGeometry(0.006, 0.006, 0.55, 5),
				stick,
				x + offset,
				0.4,
				-0.35
			);
			incense.rotation.z = offset * -3;
			group.add(incense);
		}
		const smokePositions = new Float32Array(21 * 3);
		for (let i = 0; i < 21; i++) {
			smokePositions[i * 3] = x + Math.sin(i * 0.38) * (0.02 + i * 0.005);
			smokePositions[i * 3 + 1] = 0.72 + i * 0.08;
			smokePositions[i * 3 + 2] = -0.35 + Math.sin(i * 0.55) * 0.06;
		}
		const smokeGeometry = new THREE.BufferGeometry();
		smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
		const smoke = new THREE.Points(
			smokeGeometry,
			new THREE.PointsMaterial({
				color: '#d5c9bb',
				size: 0.27,
				map: softPoint,
				transparent: true,
				opacity: 0.04,
				depthWrite: false
			})
		);
		smoke.userData.opacityScale = 0.065;
		group.add(smoke);
	}
	return group;
}

function buildBackdrop(kind: AtelierDesign['backdrop']): THREE.Group {
	const group = new THREE.Group();
	const colours = { charcoal: '#0d0b09', atelier: '#514338', indigo: '#121b31', pandal: '#261927' };
	const wall = new THREE.MeshStandardMaterial({
		color: colours[kind],
		roughness: 0.95,
		metalness: 0.08
	});
	const backWall = mesh(new THREE.BoxGeometry(28, 18, 0.3), wall, 0, 7, -4.5);
	backWall.receiveShadow = false;
	group.add(backWall);
	const floor = mesh(
		new THREE.CylinderGeometry(18, 18, 0.1, 80),
		new THREE.MeshStandardMaterial({
			color: kind === 'atelier' ? '#3f3025' : '#0a0908',
			roughness: 0.58,
			metalness: 0.18
		}),
		0,
		-0.08,
		0
	);
	group.add(floor);
	const arch = new THREE.Group();
	const rim = metallic(kind === 'indigo' ? '#888895' : '#856137', 0.6);
	const radius = kind === 'pandal' ? 4.4 : 4.7;
	for (const r of [radius, radius + 0.1]) {
		const semicircle = mesh(new THREE.TorusGeometry(r, 0.025, 6, 90, Math.PI), rim, 0, 3.1, -4.24);
		arch.add(semicircle);
	}
	for (const x of [-radius, radius])
		arch.add(mesh(new THREE.BoxGeometry(0.035, 5, 0.035), rim, x, 0.6, -4.24));
	if (kind === 'atelier') {
		const timber = new THREE.MeshStandardMaterial({ color: '#362719', roughness: 0.97 });
		for (const x of [-6, -3, 0, 3, 6])
			group.add(mesh(new THREE.BoxGeometry(0.14, 14, 0.12), timber, x, 6.8, -4.2));
		for (const y of [1, 4, 7, 10])
			group.add(mesh(new THREE.BoxGeometry(16, 0.12, 0.12), timber, 0, y, -4.18));
	} else {
		group.add(arch);
		if (kind === 'pandal') {
			for (let i = 0; i < 25; i++) {
				const a = (Math.PI * i) / 24;
				const petal = mesh(
					new THREE.SphereGeometry(0.14, 10, 8),
					rim,
					Math.cos(a) * 4.16,
					3.1 + Math.sin(a) * 4.16,
					-4.18
				);
				petal.scale.set(0.6, 1.7, 0.3);
				petal.rotation.z = a - Math.PI / 2;
				group.add(petal);
			}
		}
	}
	return group;
}

/** Browser-only renderer, imported after mount by AtelierViewport. No global browser state. */
export function createAtelierRenderer(
	canvas: HTMLCanvasElement,
	initial: AtelierDesign,
	initialOptions: ViewportOptions,
	callbacks: Callbacks = {}
): AtelierRenderer {
	let disposed = false;
	let contextLost = false;
	let visible = true;
	let frame = 0;
	let bellUntil = 0;
	let bellStart = 0;
	let lastTime = 0;
	let lastCameraReport = 0;
	let width = 1;
	let height = 1;
	let options = { ...initialOptions };
	let design = structuredClone(initial);
	const disposers: (() => void)[] = [];
	function registerDisposal(cleanup: () => void): () => void {
		let active = true;
		const release = () => {
			if (!active) return;
			active = false;
			cleanup();
		};
		disposers.push(release);
		return release;
	}
	function dispose() {
		if (disposed) return;
		disposed = true;
		canvas.dataset.disposed = 'true';
		cancelAnimationFrame(frame);
		while (disposers.length) {
			try {
				disposers.pop()?.();
			} catch {
				/* A lost graphics context must not prevent the remaining cleanup. */
			}
		}
	}
	canvas.dataset.renderCount = '0';
	canvas.dataset.disposed = 'false';
	let quality: 'high' | 'low' =
		options.quality === 'low' ||
		(options.quality === 'auto' && (window.devicePixelRatio > 2 || window.innerWidth < 700))
			? 'low'
			: 'high';
	const renderer = new THREE.WebGLRenderer({
		canvas,
		alpha: true,
		antialias: quality === 'high',
		powerPreference: 'default',
		preserveDrawingBuffer: true
	});
	registerDisposal(() => renderer.forceContextLoss());
	registerDisposal(() => renderer.dispose());
	registerDisposal(() => renderer.renderLists.dispose());
	try {
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.shadowMap.enabled = quality === 'high';
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.setPixelRatio(
			Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1.25)
		);
		const scene = new THREE.Scene();
		registerDisposal(() => disposeObject(scene));
		scene.background = new THREE.Color('#100f0e');
		const environmentScene = new RoomEnvironment();
		const disposeEnvironmentScene = registerDisposal(() => environmentScene.dispose());
		const pmrem = new THREE.PMREMGenerator(renderer);
		const disposePmrem = registerDisposal(() => pmrem.dispose());
		const environment = pmrem.fromScene(environmentScene, 0.05);
		registerDisposal(() => environment.dispose());
		scene.environment = environment.texture;
		scene.environmentIntensity = 0.28;
		disposeEnvironmentScene();
		disposePmrem();
		const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 90);
		camera.position.fromArray(design.camera.position);
		const controls = new OrbitControls(camera, canvas);
		registerDisposal(() => controls.dispose());
		controls.target.fromArray(design.camera.target);
		controls.enableDamping = false;
		controls.minDistance = 2.5;
		controls.maxDistance = 27;
		controls.maxPolarAngle = Math.PI * 0.53;
		controls.minPolarAngle = Math.PI * 0.12;
		controls.enablePan = true;
		controls.panSpeed = 0.65;
		controls.rotateSpeed = 0.62;
		controls.zoomSpeed = 0.8;
		controls.update();
		const hemi = new THREE.HemisphereLight('#e4d6bd', '#28202c', 0.75);
		scene.add(hemi);
		const key = new THREE.DirectionalLight('#ffe0ad', 2.6);
		registerDisposal(() => key.shadow.dispose());
		key.position.set(-4, 8, 7);
		key.castShadow = quality === 'high';
		key.shadow.mapSize.set(1024, 1024);
		key.shadow.camera.left = -7;
		key.shadow.camera.right = 7;
		key.shadow.camera.top = 9;
		key.shadow.camera.bottom = -3;
		key.shadow.camera.near = 0.5;
		key.shadow.camera.far = 30;
		key.shadow.normalBias = 0.035;
		key.shadow.radius = 3;
		key.shadow.bias = -0.0002;
		key.target.position.set(0, 4, 0);
		scene.add(key, key.target);
		const fill = new THREE.DirectionalLight('#bbc9eb', 0.8);
		fill.position.set(5, 5, 5);
		scene.add(fill);
		const rim = new THREE.DirectionalLight('#e1ac6c', 1.8);
		rim.position.set(1, 7, -3);
		scene.add(rim);
		let sculpture = buildSculpture(design, quality);
		let sculptureQuality = quality;
		scene.add(sculpture);
		let lastGeometry = geometryKey(design);
		let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
		let pendingSculpture: { design: AtelierDesign; quality: 'high' | 'low'; key: string } | null =
			null;
		registerDisposal(() => {
			clearTimeout(rebuildTimer);
			pendingSculpture = null;
		});
		let backdrop = buildBackdrop(design.backdrop);
		scene.add(backdrop);
		const bells = buildBells();
		scene.add(bells);
		const lamps = buildLamps();
		scene.add(lamps);
		const atmosphere = buildAtmosphere();
		scene.add(atmosphere);
		const raycaster = new THREE.Raycaster();
		let pointerDown = [0, 0];
		let lastCamera = '';
		function renderScene(view: THREE.Camera = camera) {
			renderer.render(scene, view);
			canvas.dataset.renderCount = String(Number(canvas.dataset.renderCount || 0) + 1);
		}
		function flushSculpture() {
			if (!pendingSculpture || disposed) return;
			clearTimeout(rebuildTimer);
			rebuildTimer = undefined;
			const pending = pendingSculpture;
			pendingSculpture = null;
			const replacement = buildSculpture(pending.design, pending.quality);
			scene.remove(sculpture);
			disposeObject(sculpture);
			sculpture = replacement;
			scene.add(sculpture);
			lastGeometry = pending.key;
			sculptureQuality = pending.quality;
			requestRender();
		}

		function emitCamera() {
			const value: CameraView = { position: vec(camera.position), target: vec(controls.target) };
			const token = JSON.stringify(value);
			if (token === lastCamera) return;
			lastCamera = token;
			design.camera = value;
			callbacks.oncamera?.(value);
		}
		function requestRender() {
			if (!disposed && !contextLost && visible && !document.hidden && !frame)
				frame = requestAnimationFrame(render);
		}
		function render(time: number) {
			frame = 0;
			if (disposed || contextLost || !visible || document.hidden) return;
			const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
			lastTime = time;
			if (options.presentation && !options.reducedMotion) {
				const offset = camera.position.clone().sub(controls.target);
				offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, delta * 0.035);
				camera.position.copy(controls.target).add(offset);
				camera.lookAt(controls.target);
				if (time - lastCameraReport > 450) {
					lastCameraReport = time;
					emitCamera();
				}
			}
			if (time < bellUntil && !options.reducedMotion) {
				const elapsed = (time - bellStart) / 1000;
				bells.children.forEach((bell, index) => {
					bell.rotation.z = Math.sin(elapsed * 9 + index * 0.4) * 0.22 * Math.exp(-elapsed * 1.1);
				});
			} else
				bells.children.forEach((bell) => {
					bell.rotation.z = 0;
				});
			if (options.ambientMotion && !options.reducedMotion) {
				atmosphere.children.forEach((object) => {
					if (object.userData.dust) object.rotation.y += delta * 0.025;
				});
				lamps.traverse((object) => {
					if (object.userData.flame)
						object.scale.y = 2.3 + Math.sin(time * 0.005 + object.position.x * 12) * 0.12;
				});
			}
			renderScene();
			if (
				((options.presentation || options.ambientMotion) && !options.reducedMotion) ||
				time < bellUntil
			)
				requestRender();
		}
		function resize() {
			if (disposed) return;
			const box = canvas.parentElement?.getBoundingClientRect();
			const nextWidth = Math.max(1, Math.round(box?.width || canvas.clientWidth || 900));
			const nextHeight = Math.max(1, Math.round(box?.height || canvas.clientHeight || 700));
			if (nextWidth !== width || nextHeight !== height)
				renderer.setSize(nextWidth, nextHeight, false);
			width = nextWidth;
			height = nextHeight;
			camera.aspect = width / height;
			// A narrow phone stage keeps the same breadth of the sculpture and its bells.
			camera.fov = THREE.MathUtils.radToDeg(
				2 *
					Math.atan(
						Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) *
							Math.max(1, PORTRAIT_SAFE_ASPECT / camera.aspect)
					)
			);
			camera.updateProjectionMatrix();
			requestRender();
		}
		function update(next: AtelierDesign, nextOptions: ViewportOptions) {
			if (disposed) return;
			const requestedQuality =
				nextOptions.quality === 'low' ||
				(nextOptions.quality === 'auto' && (window.devicePixelRatio > 2 || window.innerWidth < 700))
					? 'low'
					: 'high';
			const nextGeometry = geometryKey(next);
			if (nextGeometry !== lastGeometry || requestedQuality !== sculptureQuality) {
				pendingSculpture = {
					design: structuredClone(next),
					quality: requestedQuality,
					key: nextGeometry
				};
				clearTimeout(rebuildTimer);
				rebuildTimer = setTimeout(() => {
					try {
						flushSculpture();
					} catch {
						callbacks.onerror?.(
							'This device could not finish the sculpture. Try the lighter quality setting, then retry.'
						);
					}
				}, 150);
			} else if (pendingSculpture) {
				pendingSculpture = null;
				clearTimeout(rebuildTimer);
			}
			if (design.backdrop !== next.backdrop) {
				scene.remove(backdrop);
				disposeObject(backdrop);
				backdrop = buildBackdrop(next.backdrop);
				scene.add(backdrop);
			}
			quality = requestedQuality;
			options = { ...nextOptions };
			if (options.reducedMotion) bellUntil = 0;
			const nextPosition = new THREE.Vector3().fromArray(next.camera.position);
			const nextTarget = new THREE.Vector3().fromArray(next.camera.target);
			if (
				camera.position.distanceToSquared(nextPosition) > 0.000001 ||
				controls.target.distanceToSquared(nextTarget) > 0.000001
			) {
				camera.position.copy(nextPosition);
				controls.target.copy(nextTarget);
				controls.update();
			}
			design = structuredClone(next);
			const warmth = clamp(next.lightWarmth, 0, 1);
			key.color.copy(new THREE.Color('#dce6ff').lerp(new THREE.Color('#ffd196'), warmth));
			fill.color.copy(new THREE.Color('#cad5ff').lerp(new THREE.Color('#ede1d0'), warmth * 0.7));
			const angle = THREE.MathUtils.degToRad(clamp(next.lightAngle, -90, 90));
			key.position.set(Math.sin(angle) * 7, 7.8, Math.cos(angle) * 5 + 2);
			renderer.toneMappingExposure = next.exposure;
			renderer.shadowMap.enabled = quality === 'high';
			key.castShadow = quality === 'high';
			const desiredPixelRatio = Math.min(
				window.devicePixelRatio || 1,
				quality === 'high' ? 1.75 : 1.25
			);
			if (Math.abs(renderer.getPixelRatio() - desiredPixelRatio) > 0.001)
				renderer.setPixelRatio(desiredPixelRatio);
			bells.visible = next.bells;
			lamps.visible = next.lamps;
			lamps.traverse((object) => {
				if (object instanceof THREE.PointLight) object.intensity = 12 * next.lampIntensity;
				if (object.userData.flame) object.visible = next.lampIntensity > 0.005;
			});
			atmosphere.visible = next.atmosphere > 0;
			atmosphere.traverse((object) => {
				if (object instanceof THREE.Points)
					(object.material as THREE.PointsMaterial).opacity =
						next.atmosphere * (object.userData.opacityScale ?? 0.2);
			});
			const background = {
				charcoal: '#100f0d',
				atelier: '#30271f',
				indigo: '#090e1c',
				pandal: '#1b111b'
			};
			scene.background = new THREE.Color(background[next.backdrop]);
			resize();
		}
		function ringBell() {
			if (!design.bells || disposed) return;
			bellStart = performance.now();
			bellUntil = options.reducedMotion ? 0 : bellStart + 4200;
			callbacks.onbell?.();
			requestRender();
		}
		function onControlChange() {
			emitCamera();
			requestRender();
		}
		function onPointerDown(event: PointerEvent) {
			pointerDown = [event.clientX, event.clientY];
		}
		function onPointerUp(event: PointerEvent) {
			if (Math.hypot(event.clientX - pointerDown[0], event.clientY - pointerDown[1]) > 7) return;
			const bounds = canvas.getBoundingClientRect();
			raycaster.setFromCamera(
				new THREE.Vector2(
					((event.clientX - bounds.left) / bounds.width) * 2 - 1,
					(-(event.clientY - bounds.top) / bounds.height) * 2 + 1
				),
				camera
			);
			const hit = raycaster.intersectObjects(
				[sculpture, ...(bells.visible ? [bells] : [])],
				true
			)[0];
			if (!hit) return;
			let object: THREE.Object3D | null = hit.object;
			while (object) {
				if (object.userData.bell) {
					ringBell();
					return;
				}
				if (typeof object.userData.region === 'string') {
					callbacks.onselect?.(object.userData.region);
					return;
				}
				object = object.parent;
			}
		}
		function onKey(event: KeyboardEvent) {
			const offset = camera.position.clone().sub(controls.target);
			if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
				offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, event.key === 'ArrowLeft' ? -0.1 : 0.1);
			else if (event.key === '+' || event.key === '=') offset.multiplyScalar(0.92);
			else if (event.key === '-' || event.key === '_') offset.multiplyScalar(1.08);
			else return;
			event.preventDefault();
			offset.setLength(clamp(offset.length(), controls.minDistance, controls.maxDistance));
			camera.position.copy(controls.target).add(offset);
			controls.update();
			emitCamera();
			requestRender();
		}
		function onVisibility() {
			lastTime = 0;
			if (document.hidden) {
				cancelAnimationFrame(frame);
				frame = 0;
			} else requestRender();
		}
		function onContextLost(event: Event) {
			event.preventDefault();
			contextLost = true;
			cancelAnimationFrame(frame);
			frame = 0;
			callbacks.onerror?.(
				'The graphics connection was interrupted. Your design is safe; retry the interactive view.'
			);
		}
		const observer = new ResizeObserver(resize);
		registerDisposal(() => observer.disconnect());
		observer.observe(canvas.parentElement || canvas);
		const intersection = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				lastTime = 0;
				if (visible) requestRender();
				else {
					cancelAnimationFrame(frame);
					frame = 0;
				}
			},
			{ rootMargin: '100px' }
		);
		registerDisposal(() => intersection.disconnect());
		intersection.observe(canvas);
		registerDisposal(() => controls.removeEventListener('change', onControlChange));
		controls.addEventListener('change', onControlChange);
		registerDisposal(() => canvas.removeEventListener('pointerdown', onPointerDown));
		canvas.addEventListener('pointerdown', onPointerDown);
		registerDisposal(() => canvas.removeEventListener('pointerup', onPointerUp));
		canvas.addEventListener('pointerup', onPointerUp);
		registerDisposal(() => canvas.removeEventListener('keydown', onKey));
		canvas.addEventListener('keydown', onKey);
		registerDisposal(() => canvas.removeEventListener('webglcontextlost', onContextLost));
		canvas.addEventListener('webglcontextlost', onContextLost);
		registerDisposal(() => document.removeEventListener('visibilitychange', onVisibility));
		document.addEventListener('visibilitychange', onVisibility);
		update(initial, initialOptions);

		async function exportImage(exportOptions: ExportOptions): Promise<Blob> {
			if (disposed || contextLost)
				throw new Error('Restore the interactive view before exporting your design.');
			flushSculpture();
			const { width: exportWidth, height: exportHeight } = exportOptions;
			if (
				!Number.isInteger(exportWidth) ||
				!Number.isInteger(exportHeight) ||
				exportWidth < 64 ||
				exportHeight < 64 ||
				exportWidth > 4096 ||
				exportHeight > 4096 ||
				exportWidth * exportHeight > 16777216
			)
				throw new Error('Choose an export between 64 and 4096 pixels on each side.');
			const maxSize = renderer.capabilities.maxTextureSize;
			if (exportWidth > maxSize || exportHeight > maxSize)
				throw new Error(`This device supports images up to ${maxSize} pixels on each side.`);
			const exportCamera = camera.clone();
			exportCamera.aspect = exportWidth / exportHeight;
			// Expand the shorter dimension; changing the output shape never crops the chosen view.
			if (exportCamera.aspect < camera.aspect)
				exportCamera.fov = THREE.MathUtils.radToDeg(
					2 *
						Math.atan(
							(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) /
								exportCamera.aspect
						)
				);
			exportCamera.updateProjectionMatrix();
			const oldBackground = scene.background;
			const visibility = [backdrop.visible, atmosphere.visible];
			const pixelRatio = renderer.getPixelRatio();
			const output = document.createElement('canvas');
			output.width = exportWidth;
			output.height = exportHeight;
			const context = output.getContext('2d');
			if (!context) throw new Error('This browser could not create the export image.');
			try {
				if (exportOptions.transparent) {
					scene.background = null;
					backdrop.visible = false;
					atmosphere.visible = false;
				}
				renderer.setPixelRatio(1);
				renderer.setSize(exportWidth, exportHeight, false);
				renderer.setClearAlpha(exportOptions.transparent ? 0 : 1);
				renderScene(exportCamera);
				context.drawImage(canvas, 0, 0);
				const padding = Math.round(exportWidth * 0.045);
				if (exportOptions.title || exportOptions.signature) {
					context.textBaseline = 'bottom';
					context.shadowColor = 'rgba(0,0,0,.65)';
					context.shadowBlur = exportWidth * 0.006;
					context.fillStyle = '#f6e5c2';
					if (exportOptions.title) {
						context.font = `400 ${Math.round(exportWidth * 0.027)}px Georgia, serif`;
						context.fillText(
							exportOptions.title.slice(0, 90),
							padding,
							exportHeight - padding,
							exportWidth - padding * 2
						);
					}
					if (exportOptions.signature) {
						context.textAlign = 'right';
						context.font = `400 ${Math.round(exportWidth * 0.013)}px Georgia, serif`;
						context.fillText(
							exportOptions.signature.slice(0, 90),
							exportWidth - padding,
							exportHeight - padding * (exportOptions.title ? 0.35 : 1),
							exportWidth - padding * 2
						);
					}
				}
			} finally {
				scene.background = oldBackground;
				backdrop.visible = visibility[0];
				atmosphere.visible = visibility[1];
				renderer.setPixelRatio(pixelRatio);
				renderer.setSize(width, height, false);
				renderer.setClearAlpha(1);
				renderScene();
			}
			return new Promise<Blob>((resolve, reject) =>
				output.toBlob(
					(blob) =>
						blob
							? resolve(blob)
							: reject(new Error('The browser could not encode this image. Try a smaller size.')),
					'image/png'
				)
			);
		}
		return {
			update,
			exportImage,
			ringBell,
			thumbnail() {
				if (disposed || contextLost) return undefined;
				try {
					flushSculpture();
					renderScene();
					const thumbnail = document.createElement('canvas');
					const thumbnailScale = Math.min(320 / width, 320 / height);
					thumbnail.width = Math.max(1, Math.round(width * thumbnailScale));
					thumbnail.height = Math.max(1, Math.round(height * thumbnailScale));
					const context = thumbnail.getContext('2d');
					if (!context) return undefined;
					context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
					return thumbnail.toDataURL('image/jpeg', 0.76);
				} catch {
					return undefined;
				}
			},
			dispose
		};
	} catch (error) {
		dispose();
		throw error;
	}
}
