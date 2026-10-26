import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DEFAULT_STATE, PALETTES, normalizeState, seededRandom, type DesignState } from './model';
import { FlowCurve, petalGeometry, ribbonGeometry, tunnelGeometry } from './geometry';

export type StrangeRenderer = ReturnType<typeof createStrangeRenderer>;
type RendererOptions = {
	onQuality?: (label: string) => void;
	onViewChange?: () => void;
	onError?: (message: string) => void;
};

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const background = '#090a0f';

/** This controller is created only after the feature's browser mount. */
export function createStrangeRenderer(
	canvas: HTMLCanvasElement,
	initialState: DesignState,
	options: RendererOptions = {}
) {
	let state = normalizeState(initialState);
	let view = { ...state.view };
	let elapsed = state.time;
	let playing = true;
	let active = true;
	let disposed = false;
	let contextLost = false;
	let capturing = false;
	let frame = 0;
	let lastTime = 0;
	let settling = 0;
	let width = 1;
	let height = 1;
	let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
	let resizeTimer: ReturnType<typeof setTimeout> | undefined;
	let qualityFrames = 0;
	let slowFrames = 0;
	let pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.4 : 1.65);
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(background);
	scene.fog = new THREE.FogExp2(background, 0.018);
	const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: false,
		preserveDrawingBuffer: true,
		powerPreference: 'high-performance'
	});
	renderer.setPixelRatio(pixelRatio);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.82;
	const environment = new RoomEnvironment();
	const pmrem = new THREE.PMREMGenerator(renderer);
	const environmentTarget = pmrem.fromScene(environment, 0.035);
	scene.environment = environmentTarget.texture;
	scene.environmentIntensity = 0.78;
	environment.dispose();
	pmrem.dispose();
	const ambient = new THREE.HemisphereLight('#c7d7ff', '#201122', 0.35);
	scene.add(ambient);
	const key = new THREE.DirectionalLight('#fff5ee', 1.8);
	key.position.set(-3.5, 5, 5);
	scene.add(key);
	const rim = new THREE.DirectionalLight('#b5b7ff', 1.4);
	rim.position.set(3, 1.5, -3);
	scene.add(rim);
	const fill = new THREE.PointLight('#ff85c5', 5, 12, 2);
	fill.position.set(-3, -1, 1);
	scene.add(fill);
	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.2, 1.65);
	composer.addPass(bloom);
	const output = new OutputPass();
	composer.addPass(output);
	const sculpture = new THREE.Group();
	scene.add(sculpture);
	const artwork = new THREE.Group();
	sculpture.add(artwork);
	const uniforms = {
		uTime: { value: elapsed },
		uEnergy: { value: state.energy / 100 },
		uShape: { value: state.shape / 100 },
		uDetail: { value: state.detail / 100 },
		uGlow: { value: state.glow / 100 },
		uPalette0: { value: new THREE.Color() },
		uPalette1: { value: new THREE.Color() },
		uPalette2: { value: new THREE.Color() },
		uPalette3: { value: new THREE.Color() }
	};
	const paletteTarget = [
		new THREE.Color(),
		new THREE.Color(),
		new THREE.Color(),
		new THREE.Color()
	];
	let flowCurves: FlowCurve[] = [];
	let flowPoints: THREE.Points | null = null;
	let tunnelRings: THREE.Mesh[] = [];
	const pointerPositions = new Map<number, { x: number; y: number }>();
	let pinchDistance = 0;
	let dragDistance = 0;

	function setPalette(immediate: boolean) {
		const palette = PALETTES.find((entry) => entry.id === state.palette) ?? PALETTES[0];
		for (let i = 0; i < 4; i++) {
			paletteTarget[i].set(palette.colors[i % palette.colors.length]);
			if (immediate) uniforms[`uPalette${i}` as 'uPalette0'].value.copy(paletteTarget[i]);
		}
		fill.color.copy(paletteTarget[1]);
		rim.color.copy(paletteTarget[2]).lerp(new THREE.Color('#ffffff'), 0.55);
		if (flowPoints) {
			const colors = flowPoints.geometry.getAttribute('color') as THREE.BufferAttribute;
			for (let i = 0; i < colors.count; i++) {
				const color = paletteTarget[i % 4];
				colors.setXYZ(i, color.r, color.g, color.b);
			}
			colors.needsUpdate = true;
		}
	}

	function settleUniforms() {
		uniforms.uEnergy.value = state.energy / 100;
		uniforms.uShape.value = state.shape / 100;
		uniforms.uDetail.value = state.detail / 100;
		uniforms.uGlow.value = state.glow / 100;
		setPalette(true);
	}

	function surface(offset: number, luminous = false) {
		const material = new THREE.MeshPhysicalMaterial({
			color: '#ffffff',
			metalness: luminous ? 0.48 : 0.94,
			roughness: luminous ? 0.25 : 0.2,
			clearcoat: 1,
			clearcoatRoughness: 0.17,
			iridescence: luminous ? 0.35 : 0.55,
			iridescenceIOR: 1.38,
			iridescenceThicknessRange: [130, 420],
			envMapIntensity: 0.85,
			side: THREE.DoubleSide
		});
		material.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, uniforms, { uOffset: { value: offset } });
			shader.vertexShader = `uniform float uTime;
uniform float uEnergy;
uniform float uShape;
varying vec2 matterUV;
varying vec3 matterPosition;
${shader.vertexShader}`;
			shader.vertexShader = shader.vertexShader.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
matterUV = uv;
float breathing = sin(position.y * 2.7 + uTime * 0.68) * sin(position.x * 2.2 - uTime * 0.37);
transformed += normal * breathing * uEnergy * 0.065;
matterPosition = transformed;`
			);
			shader.fragmentShader = `uniform float uTime;
uniform float uEnergy;
uniform float uShape;
uniform float uDetail;
uniform float uGlow;
uniform float uOffset;
uniform vec3 uPalette0;
uniform vec3 uPalette1;
uniform vec3 uPalette2;
uniform vec3 uPalette3;
varying vec2 matterUV;
varying vec3 matterPosition;
vec3 matterPalette(float t) {
  float f = fract(t) * 4.0;
  if (f < 1.0) return mix(uPalette0,uPalette1,smoothstep(0.0,1.0,f));
  if (f < 2.0) return mix(uPalette1,uPalette2,smoothstep(0.0,1.0,f-1.0));
  if (f < 3.0) return mix(uPalette2,uPalette3,smoothstep(0.0,1.0,f-2.0));
  return mix(uPalette3,uPalette0,smoothstep(0.0,1.0,f-3.0));
}
${shader.fragmentShader}`;
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <color_fragment>',
				`#include <color_fragment>
float pigment = matterUV.x * (1.3 + uShape * 0.8) + matterUV.y * 0.32 + uOffset + sin(matterPosition.y * 1.7 + uTime * 0.12) * 0.09;
vec3 spectral = pow(matterPalette(pigment), vec3(2.0));
float ribs = 0.91 + 0.09 * sin(matterUV.x * (160.0 + uDetail * 230.0) * 6.28318);
diffuseColor.rgb = spectral * ribs;
`
			);
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <emissivemap_fragment>',
				`#include <emissivemap_fragment>
float edgeLight = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
totalEmissiveRadiance += spectral * (${luminous ? '0.34 + uGlow * 1.2' : '0.025 + uGlow * 0.1'}) + spectral * edgeLight * uGlow * ${luminous ? '0.7' : '0.25'};`
			);
			// Folded sheets contain grazing, nearly degenerate triangles. Contain any
			// non-finite specular result before it can contaminate the HDR bloom pyramid.
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <opaque_fragment>',
				`outgoingLight.r = outgoingLight.r >= 0.0 ? min(outgoingLight.r, 32.0) : 0.0;
outgoingLight.g = outgoingLight.g >= 0.0 ? min(outgoingLight.g, 32.0) : 0.0;
outgoingLight.b = outgoingLight.b >= 0.0 ? min(outgoingLight.b, 32.0) : 0.0;
#include <opaque_fragment>`
			);
		};
		material.customProgramCacheKey = () => `matter-surface-${luminous}`;
		return material;
	}

	function disposeObject(root: THREE.Object3D) {
		const materials = new Set<THREE.Material>();
		root.traverse((object) => {
			const mesh = object as THREE.Mesh;
			mesh.geometry?.dispose();
			if (mesh.material) {
				for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
					materials.add(material);
			}
		});
		materials.forEach((material) => material.dispose());
		root.clear();
	}

	function build() {
		disposeObject(artwork);
		flowCurves = [];
		flowPoints = null;
		tunnelRings = [];
		const random = seededRandom(state.seed);
		const phase = random() * TAU;
		artwork.scale.setScalar(1);
		artwork.rotation.set(0, 0, 0);
		if (state.world === 'liquid') {
			const body = new THREE.Mesh(ribbonGeometry(state, phase * 0.15), surface(phase / TAU));
			artwork.add(body);
			const filament = new THREE.Mesh(
				ribbonGeometry(state, phase * 0.15 + 0.15, true),
				surface(0.35)
			);
			filament.scale.setScalar(1.08);
			artwork.add(filament);
			artwork.rotation.set(-0.28, 0.5, -0.16);
		} else if (state.world === 'bloom') {
			for (let layer = 0; layer < 2; layer++) {
				const count = layer === 0 ? 12 : 9;
				for (let i = 0; i < count; i++) {
					const theta = (i / count) * TAU + layer * 0.23 + phase * 0.1;
					artwork.add(
						new THREE.Mesh(petalGeometry(state, theta, layer), surface(i / count + layer * 0.2))
					);
				}
			}
			const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 3), surface(0.3, true));
			heart.position.z = 0.72;
			artwork.add(heart);
			artwork.rotation.x = -0.12;
		} else if (state.world === 'current') {
			const count = 18 + Math.round(state.detail * 0.24);
			for (let i = 0; i < count; i++) {
				const curve = new FlowCurve((i / count) * TAU + phase, state.shape, i);
				flowCurves.push(curve);
				artwork.add(
					new THREE.Mesh(
						new THREE.TubeGeometry(curve, 180, 0.005 + (i % 4) * 0.0018, 5, true),
						surface(i / count, true)
					)
				);
			}
			const countPoints = count * 14;
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute(
				'position',
				new THREE.Float32BufferAttribute(new Float32Array(countPoints * 3), 3)
			);
			const colours = new Float32Array(countPoints * 3);
			for (let i = 0; i < countPoints; i++) paletteTarget[i % 4].toArray(colours, i * 3);
			geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
			flowPoints = new THREE.Points(
				geometry,
				new THREE.PointsMaterial({
					size: 0.028,
					vertexColors: true,
					transparent: true,
					opacity: 0.88,
					blending: THREE.AdditiveBlending,
					depthWrite: false,
					map: particleMap
				})
			);
			artwork.add(flowPoints);
			artwork.rotation.set(0.4, 0.2, -0.1);
		} else {
			for (let i = 0; i < 28; i++) {
				const mesh = new THREE.Mesh(tunnelGeometry(state, i * 0.19), surface(i / 21, true));
				tunnelRings.push(mesh);
				artwork.add(mesh);
			}
		}
		settling = 35;
		requestFrame();
	}

	function particleTexture() {
		const size = 32;
		const bytes = new Uint8Array(size * size * 4);
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) {
				const radius = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
				const offset = (y * size + x) * 4;
				bytes[offset] = bytes[offset + 1] = bytes[offset + 2] = 255;
				bytes[offset + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 2.5) * 255);
			}
		const texture = new THREE.DataTexture(bytes, size, size);
		texture.needsUpdate = true;
		return texture;
	}

	const particleMap = particleTexture();
	const dustRandom = seededRandom(14062);
	const dustVertices = new Float32Array(140 * 3);
	for (let i = 0; i < 140; i++) {
		dustVertices[i * 3] = (dustRandom() - 0.5) * 14;
		dustVertices[i * 3 + 1] = (dustRandom() - 0.5) * 9;
		dustVertices[i * 3 + 2] = -3 - dustRandom() * 5;
	}
	const dustGeometry = new THREE.BufferGeometry();
	dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustVertices, 3));
	const dustMaterial = new THREE.PointsMaterial({
		color: '#a6b2d6',
		size: 0.016,
		transparent: true,
		opacity: 0.23,
		map: particleMap,
		depthWrite: false
	});
	const dust = new THREE.Points(dustGeometry, dustMaterial);
	scene.add(dust);

	function positionCamera() {
		const distance = view.distance * Math.max(1, 0.98 / camera.aspect);
		camera.position.set(
			Math.sin(view.yaw) * Math.cos(view.pitch) * distance,
			Math.sin(view.pitch) * distance,
			Math.cos(view.yaw) * Math.cos(view.pitch) * distance
		);
		camera.lookAt(0, 0, 0);
	}

	function render(delta = 1 / 60) {
		const lerp = 1 - Math.exp(-delta * 9);
		uniforms.uEnergy.value = THREE.MathUtils.lerp(uniforms.uEnergy.value, state.energy / 100, lerp);
		uniforms.uShape.value = THREE.MathUtils.lerp(uniforms.uShape.value, state.shape / 100, lerp);
		uniforms.uDetail.value = THREE.MathUtils.lerp(uniforms.uDetail.value, state.detail / 100, lerp);
		uniforms.uGlow.value = THREE.MathUtils.lerp(uniforms.uGlow.value, state.glow / 100, lerp);
		uniforms.uTime.value = elapsed;
		for (let i = 0; i < 4; i++)
			uniforms[`uPalette${i}` as 'uPalette0'].value.lerp(paletteTarget[i], lerp);
		bloom.strength = 0.06 + uniforms.uGlow.value * 0.38;
		bloom.radius = 0.2;
		positionCamera();
		if (state.world === 'tunnel') {
			sculpture.rotation.set(
				0.02 * Math.sin(elapsed * 0.1),
				0.025 * Math.cos(elapsed * 0.1),
				elapsed * 0.018
			);
			for (let i = 0; i < tunnelRings.length; i++) {
				const depth = (i / tunnelRings.length + elapsed * 0.022) % 1;
				const ring = tunnelRings[i];
				ring.position.set(
					0.18 * Math.sin(depth * 5 + elapsed * 0.15),
					0.18 * Math.cos(depth * 5),
					2 - depth * 17
				);
				ring.rotation.z = depth * (2.4 + state.shape * 0.025) + elapsed * 0.08;
				ring.scale.setScalar(1 + Math.sin(depth * Math.PI) * 0.12);
			}
		} else {
			sculpture.rotation.set(
				Math.sin(elapsed * 0.13) * 0.1,
				elapsed * 0.12,
				Math.sin(elapsed * 0.09) * 0.07
			);
			sculpture.position.y = (Math.sin(elapsed * 0.32) * 0.035 * state.energy) / 100;
		}
		if (flowPoints) {
			const positions = flowPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
			const point = new THREE.Vector3();
			for (let i = 0; i < positions.count; i++) {
				const curve = flowCurves[i % flowCurves.length];
				curve.getPoint(
					(elapsed * (0.035 + state.energy * 0.0007) +
						Math.floor(i / flowCurves.length) / 14 +
						(i % 7) * 0.01) %
						1,
					point
				);
				positions.setXYZ(i, point.x, point.y, point.z);
			}
			positions.needsUpdate = true;
		}
		composer.render();
	}

	function animate(now: number) {
		frame = 0;
		if (disposed || !active || contextLost || capturing) return;
		const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.06) : 1 / 60;
		if (playing) elapsed += delta * (state.speed / 100) * 2;
		if (lastTime && playing && settling <= 0) {
			qualityFrames++;
			if (now - lastTime > 42) slowFrames++;
			if (qualityFrames >= 110) {
				if (slowFrames > 60 && pixelRatio > 1.05) {
					pixelRatio = Math.max(1, pixelRatio - 0.3);
					renderer.setPixelRatio(pixelRatio);
					composer.setPixelRatio(pixelRatio);
					options.onQuality?.('Adaptive');
				}
				qualityFrames = 0;
				slowFrames = 0;
			}
		}
		lastTime = now;
		render(delta);
		settling--;
		if ((playing && state.speed > 0) || settling > 0) requestFrame();
	}

	function requestFrame() {
		if (!frame && !disposed && active && !contextLost && !capturing)
			frame = requestAnimationFrame(animate);
	}

	function redraw() {
		settling = 35;
		requestFrame();
	}

	function resize() {
		if (disposed || capturing) return;
		const rect = canvas.getBoundingClientRect();
		width = Math.max(1, Math.round(rect.width));
		height = Math.max(1, Math.round(rect.height));
		renderer.setSize(width, height, false);
		composer.setSize(width, height);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		redraw();
	}
	const resizeObserver = new ResizeObserver(() => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(resize, 50);
	});
	resizeObserver.observe(canvas);

	function pointerDown(event: PointerEvent) {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
		canvas.setPointerCapture(event.pointerId);
		dragDistance = 0;
		if (pointerPositions.size === 2) {
			const [a, b] = [...pointerPositions.values()];
			pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
		}
		canvas.style.cursor = 'grabbing';
	}
	function pointerMove(event: PointerEvent) {
		const previous = pointerPositions.get(event.pointerId);
		if (!previous) return;
		const dx = event.clientX - previous.x;
		const dy = event.clientY - previous.y;
		pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointerPositions.size === 2) {
			const [a, b] = [...pointerPositions.values()];
			const nextDistance = Math.hypot(a.x - b.x, a.y - b.y);
			if (pinchDistance > 0)
				view.distance = clamp((view.distance * pinchDistance) / Math.max(1, nextDistance), 3.6, 12);
			pinchDistance = nextDistance;
		} else {
			view.yaw -= dx * 0.006;
			view.pitch = clamp(view.pitch + dy * 0.006, -1.25, 1.25);
		}
		dragDistance += Math.abs(dx) + Math.abs(dy);
		redraw();
	}
	function pointerUp(event: PointerEvent) {
		pointerPositions.delete(event.pointerId);
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		canvas.style.cursor = 'grab';
		if (dragDistance > 1) options.onViewChange?.();
	}
	function wheel(event: WheelEvent) {
		if (!canvas.matches(':focus') && !event.ctrlKey) return;
		event.preventDefault();
		view.distance = clamp(view.distance * Math.exp(event.deltaY * 0.001), 3.6, 12);
		redraw();
		options.onViewChange?.();
	}
	function keydown(event: KeyboardEvent) {
		const handled = [
			'ArrowLeft',
			'ArrowRight',
			'ArrowUp',
			'ArrowDown',
			'+',
			'-',
			'=',
			'0'
		].includes(event.key);
		if (!handled) return;
		event.preventDefault();
		if (event.key === 'ArrowLeft') view.yaw += 0.12;
		if (event.key === 'ArrowRight') view.yaw -= 0.12;
		if (event.key === 'ArrowUp') view.pitch = clamp(view.pitch + 0.1, -1.25, 1.25);
		if (event.key === 'ArrowDown') view.pitch = clamp(view.pitch - 0.1, -1.25, 1.25);
		if (event.key === '+' || event.key === '=')
			view.distance = clamp(view.distance - 0.25, 3.6, 12);
		if (event.key === '-') view.distance = clamp(view.distance + 0.25, 3.6, 12);
		if (event.key === '0') view = { ...DEFAULT_STATE.view };
		redraw();
		options.onViewChange?.();
	}
	function lost(event: Event) {
		event.preventDefault();
		contextLost = true;
		cancelAnimationFrame(frame);
		frame = 0;
		options.onError?.(
			'The graphics context was interrupted. Reload the studio to restore the sculpture.'
		);
	}
	canvas.addEventListener('pointerdown', pointerDown);
	canvas.addEventListener('pointermove', pointerMove);
	canvas.addEventListener('pointerup', pointerUp);
	canvas.addEventListener('pointercancel', pointerUp);
	canvas.addEventListener('wheel', wheel, { passive: false });
	canvas.addEventListener('keydown', keydown);
	canvas.addEventListener('webglcontextlost', lost);
	canvas.style.cursor = 'grab';
	setPalette(true);
	build();
	resize();
	options.onQuality?.('High');

	return {
		update(nextState: DesignState, restore = false) {
			if (disposed) return;
			const rebuild =
				nextState.world !== state.world ||
				nextState.seed !== state.seed ||
				nextState.shape !== state.shape ||
				nextState.detail !== state.detail;
			const changedWorld = nextState.world !== state.world;
			state = normalizeState(nextState);
			if (restore) {
				view = { ...state.view };
				elapsed = state.time;
			} else if (changedWorld) elapsed = 0;
			setPalette(restore);
			if (rebuild) {
				clearTimeout(rebuildTimer);
				rebuildTimer = setTimeout(
					() => {
						rebuildTimer = undefined;
						build();
					},
					changedWorld || restore ? 0 : 100
				);
			}
			redraw();
		},
		setPlaying(next: boolean) {
			playing = next;
			lastTime = 0;
			if (next) requestFrame();
			else redraw();
		},
		setActive(next: boolean) {
			active = next;
			lastTime = 0;
			if (next) redraw();
			else {
				cancelAnimationFrame(frame);
				frame = 0;
			}
		},
		resetCamera() {
			view = { ...DEFAULT_STATE.view };
			redraw();
			options.onViewChange?.();
		},
		snapshot() {
			// Equivalent wrapped angles survive the public state's validation after
			// any number of manual camera rotations.
			const yaw = ((((view.yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
			return { view: { ...view, yaw }, time: elapsed };
		},
		async capture(exportWidth: number, exportHeight: number): Promise<Blob> {
			if (disposed || contextLost) throw new Error('The graphics renderer is unavailable.');
			if (capturing) throw new Error('An image export is already running.');
			if (
				!Number.isFinite(exportWidth) ||
				!Number.isFinite(exportHeight) ||
				exportWidth < 1 ||
				exportHeight < 1 ||
				exportWidth > 4096 ||
				exportHeight > 4096 ||
				exportWidth * exportHeight > 9_000_000
			)
				throw new Error('Choose an export size up to 4096 pixels and 9 megapixels.');
			// Export the requested design even when Save follows a slider change
			// before its bounded geometry rebuild or colour transition has finished.
			if (rebuildTimer !== undefined) {
				clearTimeout(rebuildTimer);
				rebuildTimer = undefined;
				build();
			}
			settleUniforms();
			capturing = true;
			cancelAnimationFrame(frame);
			frame = 0;
			try {
				renderer.setPixelRatio(1);
				composer.setPixelRatio(1);
				renderer.setSize(Math.round(exportWidth), Math.round(exportHeight), false);
				composer.setSize(Math.round(exportWidth), Math.round(exportHeight));
				camera.aspect = exportWidth / exportHeight;
				camera.updateProjectionMatrix();
				render(0);
				return await new Promise<Blob>((resolve, reject) =>
					canvas.toBlob(
						(blob) =>
							blob
								? resolve(blob)
								: reject(new Error('The image could not be encoded. Try a smaller size.')),
						'image/png'
					)
				);
			} finally {
				capturing = false;
				if (!disposed && !contextLost) {
					renderer.setPixelRatio(pixelRatio);
					composer.setPixelRatio(pixelRatio);
					// The viewport can resize while asynchronous PNG encoding runs.
					resize();
					lastTime = 0;
					redraw();
				}
			}
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			cancelAnimationFrame(frame);
			clearTimeout(rebuildTimer);
			clearTimeout(resizeTimer);
			resizeObserver.disconnect();
			canvas.removeEventListener('pointerdown', pointerDown);
			canvas.removeEventListener('pointermove', pointerMove);
			canvas.removeEventListener('pointerup', pointerUp);
			canvas.removeEventListener('pointercancel', pointerUp);
			canvas.removeEventListener('wheel', wheel);
			canvas.removeEventListener('keydown', keydown);
			canvas.removeEventListener('webglcontextlost', lost);
			disposeObject(artwork);
			dustGeometry.dispose();
			dustMaterial.dispose();
			particleMap.dispose();
			environmentTarget.dispose();
			composer.passes.forEach((pass) => pass.dispose());
			composer.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
		}
	};
}
