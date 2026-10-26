import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { generateSplats, PALETTES, type SplatSettings } from './model';
import { splatFragmentShader, splatVertexShader } from './shaders';

type Quality = 'high' | 'medium' | 'low';
export type SplatStats = { fps: number; count: number; quality: string };
export type SplatCallbacks = {
	onStats?: (stats: SplatStats) => void;
	onError?: (message: string) => void;
	onReady?: () => void;
};

const STYLES = ['gaussian', 'anisotropic', 'surfel', 'ink', 'spark', 'hybrid'];
const QUALITY = {
	high: { count: 58_000, dpr: 1.65 },
	medium: { count: 34_000, dpr: 1.35 },
	low: { count: 15_000, dpr: 1 }
} as const;
const BACKGROUNDS = { midnight: '#05070e', ink: '#020305', plum: '#100817' };
const GEOMETRY_KEYS: (keyof SplatSettings)[] = [
	'preset',
	'seed',
	'density',
	'scale',
	'twist',
	'curl',
	'spread',
	'hollow',
	'symmetry'
];

/** Instance-owned, browser-only rendering resources. No global animation loop. */
export class SplatRenderer {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
	private readonly controls: OrbitControls;
	private readonly composer: EffectComposer;
	private readonly bloom: UnrealBloomPass;
	private readonly output: OutputPass;
	private readonly material: THREE.ShaderMaterial;
	private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
	private readonly resizeObserver: ResizeObserver;
	private readonly intersectionObserver: IntersectionObserver;
	private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	private settings: SplatSettings;
	private tier: Quality;
	private frame = 0;
	private disposed = false;
	private contextLost = false;
	private renderFailed = false;
	private intersecting = true;
	private _playing = true;
	private lastFrame = 0;
	private time = 0;
	private statsTime = 0;
	private statsFrames = 0;
	private slowWindows = 0;
	private sampleTime = 0;
	private transitionStart = 0;
	private transitionActive = false;
	private rebuildTimer: ReturnType<typeof setTimeout> | undefined;
	private pendingGeometry = false;
	private count = 0;
	private ready = false;
	private width = 1;
	private height = 1;
	private readonly pointer = new THREE.Vector2(9, 9);
	private readonly backgrounds = {
		midnight: new THREE.Color(BACKGROUNDS.midnight),
		ink: new THREE.Color(BACKGROUNDS.ink),
		plum: new THREE.Color(BACKGROUNDS.plum)
	};

	constructor(
		private readonly canvas: HTMLCanvasElement,
		settings: SplatSettings,
		private readonly callbacks: SplatCallbacks = {}
	) {
		if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
			throw new Error('WebGL is disabled in this URL. Remove webgl=off to open the live studio.');
		}
		this.settings = { ...settings };
		this.tier = this.initialTier(settings.quality);
		this._playing =
			!this.motionQuery.matches && document.documentElement.dataset.motion !== 'still';
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: false,
			alpha: false,
			powerPreference: 'high-performance',
			preserveDrawingBuffer: true
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[this.tier].dpr));
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMappingExposure = settings.exposure;
		this.renderer.debug.onShaderError = () => {
			throw new Error(
				'Your browser could not compile the 3D artwork shaders. Try reloading with graphics acceleration enabled.'
			);
		};
		this.camera.position.set(0, 0.25, settings.distance);
		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.07;
		this.controls.enablePan = false;
		this.controls.minDistance = 3.5;
		this.controls.maxDistance = 14;
		this.controls.rotateSpeed = 0.55;
		this.controls.zoomSpeed = 0.7;
		this.controls.addEventListener('change', this.onControlsChange);
		this.controls.addEventListener('start', this.onControlsStart);
		this.controls.addEventListener('end', this.onControlsEnd);
		this.material = this.createMaterial();
		this.mesh = new THREE.Mesh(new THREE.InstancedBufferGeometry(), this.material);
		this.mesh.frustumCulled = false;
		this.scene.add(this.mesh);
		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), settings.bloom * 0.55, 0.5, 0.22);
		this.composer.addPass(this.bloom);
		this.output = new OutputPass();
		this.composer.addPass(this.output);
		this.rebuildGeometry(false);
		this.updateUniforms();
		this.resizeObserver = new ResizeObserver(this.resize);
		this.resizeObserver.observe(canvas);
		this.intersectionObserver = new IntersectionObserver((entries) => {
			this.intersecting = entries[0]?.isIntersecting ?? true;
			if (this.intersecting) this.requestFrame();
			else this.stopFrame();
		});
		this.intersectionObserver.observe(canvas);
		document.addEventListener('visibilitychange', this.onVisibility);
		canvas.addEventListener('pointermove', this.onPointerMove);
		canvas.addEventListener('pointerleave', this.onPointerLeave);
		canvas.addEventListener('keydown', this.onKeyDown);
		canvas.addEventListener('webglcontextlost', this.onContextLost);
		canvas.addEventListener('webglcontextrestored', this.onContextRestored);
		this.motionQuery.addEventListener('change', this.onMotionChange);
		this.resize();
	}

	get playing() {
		return this._playing;
	}

	get diagnostics() {
		return {
			count: this.count,
			quality: this.tier,
			playing: this._playing,
			time: this.time,
			frameScheduled: this.frame !== 0,
			geometries: this.renderer.info.memory.geometries,
			textures: this.renderer.info.memory.textures,
			programs: this.renderer.info.programs?.length ?? 0
		};
	}

	private initialTier(quality: SplatSettings['quality']): Quality {
		if (quality !== 'auto') return quality;
		return window.innerWidth < 700 || (navigator.hardwareConcurrency || 4) < 6 ? 'low' : 'medium';
	}

	private createMaterial() {
		return new THREE.ShaderMaterial({
			vertexShader: splatVertexShader,
			fragmentShader: splatFragmentShader,
			uniforms: {
				uTime: { value: 0 },
				uTransition: { value: 1 },
				uSize: { value: 1 },
				uFlow: { value: 0.6 },
				uTurbulence: { value: 0.3 },
				uBreathing: { value: 0.2 },
				uElongation: { value: 2 },
				uOrientation: { value: 0.2 },
				uStyle: { value: 5 },
				uPointerEnabled: { value: 0 },
				uPointer: { value: this.pointer },
				uPalette: { value: Array.from({ length: 5 }, () => new THREE.Color()) },
				uOpacity: { value: 0.7 },
				uSoftness: { value: 0.8 },
				uGlow: { value: 0.6 },
				uHue: { value: 0 },
				uSaturation: { value: 1 },
				uGradient: { value: 1 },
				uColorBy: { value: 0 }
			},
			transparent: true,
			depthTest: false,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.DoubleSide,
			toneMapped: false
		});
	}

	private rebuildGeometry(animate = true) {
		if (this.disposed) return;
		const targetCount = Math.round(QUALITY[this.tier].count * this.settings.density);
		const data = generateSplats(this.settings, targetCount);
		const previous = this.mesh.geometry.getAttribute('iCenter') as
			| THREE.InstancedBufferAttribute
			| undefined;
		const geometry = new THREE.InstancedBufferGeometry();
		geometry.setIndex([0, 1, 2, 2, 1, 3]);
		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3)
		);
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
		geometry.setAttribute('iCenter', new THREE.InstancedBufferAttribute(data.positions, 3));
		const previousPositions =
			animate && previous?.count === targetCount
				? new Float32Array(previous.array)
				: data.positions;
		geometry.setAttribute('iPrevious', new THREE.InstancedBufferAttribute(previousPositions, 3));
		geometry.setAttribute('iTangent', new THREE.InstancedBufferAttribute(data.tangents, 3));
		geometry.setAttribute('iCoordinate', new THREE.InstancedBufferAttribute(data.coordinates, 1));
		geometry.setAttribute('iRandom', new THREE.InstancedBufferAttribute(data.randoms, 1));
		geometry.instanceCount = targetCount;
		this.mesh.geometry.dispose();
		this.mesh.geometry = geometry;
		this.count = targetCount;
		this.pendingGeometry = false;
		this.transitionStart = performance.now();
		this.transitionActive =
			animate && previousPositions !== data.positions && !this.motionQuery.matches;
		this.material.uniforms.uTransition.value = this.transitionActive ? 0 : 1;
		this.callbacks.onStats?.({ fps: 0, count: this.count, quality: this.tier });
		this.requestFrame();
	}

	private updateUniforms() {
		const s = this.settings;
		const u = this.material.uniforms;
		for (const [key, value] of Object.entries({
			uSize: s.size,
			uFlow: s.flow,
			uTurbulence: s.turbulence,
			uBreathing: s.breathing,
			uElongation: s.elongation,
			uOrientation: s.orientation,
			uStyle: STYLES.indexOf(s.style),
			uOpacity: s.opacity,
			uSoftness: s.softness,
			uGlow: s.glow,
			uHue: THREE.MathUtils.degToRad(s.hue),
			uSaturation: s.saturation,
			uGradient: s.gradient,
			uColorBy: ['position', 'depth', 'flow'].indexOf(s.colorBy),
			uPointerEnabled: s.pointer ? 1 : 0
		}))
			u[key].value = value;
		const palette = PALETTES.find((p) => p.id === s.palette) ?? PALETTES[0];
		palette.colors.forEach((color, index) => (u.uPalette.value[index] as THREE.Color).set(color));
		this.renderer.toneMappingExposure = s.exposure;
		this.bloom.strength = s.bloom * (0.4 + s.glow * 0.18);
		this.bloom.radius = 0.6;
		// RenderPass clears once before renderer.render. A scene background then
		// forces the clear again in the active linear HDR target's colour space;
		// an external setClearColor can leave a default-framebuffer sRGB clear.
		this.scene.background = this.backgrounds[s.background];
	}

	update(settings: SplatSettings) {
		if (this.disposed) return;
		const geometryChanged = GEOMETRY_KEYS.some((key) => settings[key] !== this.settings[key]);
		const qualityChanged = settings.quality !== this.settings.quality;
		const distanceChanged = settings.distance !== this.settings.distance;
		this.settings = { ...settings };
		if (qualityChanged) {
			this.tier = this.initialTier(settings.quality);
			this.slowWindows = 0;
			this.setResolution();
		}
		if (distanceChanged) {
			const direction = this.camera.position.clone().sub(this.controls.target).normalize();
			this.camera.position.copy(this.controls.target).addScaledVector(direction, settings.distance);
			this.controls.update();
		}
		if (geometryChanged || qualityChanged) {
			this.pendingGeometry = true;
			clearTimeout(this.rebuildTimer);
			this.rebuildTimer = setTimeout(() => this.rebuildGeometry(), 95);
		}
		this.updateUniforms();
		this.requestFrame();
	}

	setPlaying(playing: boolean) {
		this._playing = playing;
		this.lastFrame = 0;
		this.statsTime = 0;
		this.statsFrames = 0;
		this.slowWindows = 0;
		this.requestFrame();
	}

	resetCamera() {
		this.controls.target.set(0, 0, 0);
		this.camera.position.set(0, 0.25, this.settings.distance);
		this.mesh.rotation.set(0, 0, 0);
		this.controls.update();
		this.requestFrame();
	}

	async exportPNG(): Promise<Blob> {
		if (this.disposed || this.contextLost || this.renderFailed)
			throw new Error('The graphics view is unavailable. Reload and try again.');
		if (this.pendingGeometry) {
			clearTimeout(this.rebuildTimer);
			this.rebuildGeometry(false);
		}
		this.composer.render();
		return new Promise((resolve, reject) => {
			this.canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be created.'))),
				'image/png'
			);
		});
	}

	private setResolution() {
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[this.tier].dpr));
		this.renderer.setSize(this.width, this.height, false);
		this.composer.setPixelRatio(this.renderer.getPixelRatio());
		this.composer.setSize(this.width, this.height);
	}

	private readonly resize = () => {
		if (this.disposed) return;
		const rect = this.canvas.getBoundingClientRect();
		this.width = Math.max(1, Math.round(rect.width));
		this.height = Math.max(1, Math.round(rect.height));
		this.camera.aspect = this.width / this.height;
		const baseFov = window.innerWidth >= 760 ? 34 : 40;
		// Preserve a 35-degree horizontal window in portrait/immersive views.
		// This prevents a taller canvas from cropping the sculpture's sides.
		const horizontalFit = THREE.MathUtils.radToDeg(
			2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(17.5)) / this.camera.aspect)
		);
		this.camera.fov = Math.max(baseFov, horizontalFit);
		this.camera.updateProjectionMatrix();
		this.setResolution();
		this.requestFrame();
	};

	private idleUntil = 0;
	private interacting = false;
	private readonly onControlsStart = () => {
		this.interacting = true;
		this.requestFrame();
	};
	private readonly onControlsEnd = () => {
		this.interacting = false;
		this.idleUntil = performance.now() + 1800;
	};
	private readonly onControlsChange = () => {
		this.requestFrame();
	};
	private readonly onPointerMove = (event: PointerEvent) => {
		const rect = this.canvas.getBoundingClientRect();
		const frustumHalfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		this.pointer.set(
			(((event.clientX - rect.left) / rect.width) * 2 - 1) * frustumHalfHeight * this.camera.aspect,
			(1 - ((event.clientY - rect.top) / rect.height) * 2) * frustumHalfHeight
		);
		if (this.settings.pointer) this.requestFrame();
	};
	private readonly onPointerLeave = () => {
		this.pointer.set(9, 9);
		this.requestFrame();
	};
	private readonly onKeyDown = (event: KeyboardEvent) => {
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const key = event.key;
		if (
			!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'].includes(key)
		)
			return;
		event.preventDefault();
		this.idleUntil = performance.now() + 1800;
		if (key === 'Home') {
			this.resetCamera();
			return;
		}
		const offset = this.camera.position.clone().sub(this.controls.target);
		const spherical = new THREE.Spherical().setFromVector3(offset);
		const step = event.shiftKey ? 0.18 : 0.09;
		if (key === 'ArrowLeft') spherical.theta -= step;
		if (key === 'ArrowRight') spherical.theta += step;
		if (key === 'ArrowUp') spherical.phi -= step;
		if (key === 'ArrowDown') spherical.phi += step;
		if (key === '+' || key === '=') spherical.radius *= 0.91;
		if (key === '-' || key === '_') spherical.radius *= 1.1;
		spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.05, Math.PI - 0.05);
		spherical.radius = THREE.MathUtils.clamp(
			spherical.radius,
			this.controls.minDistance,
			this.controls.maxDistance
		);
		this.camera.position
			.copy(this.controls.target)
			.add(new THREE.Vector3().setFromSpherical(spherical));
		this.controls.update();
		this.requestFrame();
	};
	private readonly onVisibility = () => {
		if (document.hidden) this.stopFrame();
		else this.requestFrame();
	};
	private readonly onMotionChange = () => {
		if (this.motionQuery.matches) this.setPlaying(false);
	};
	private readonly onContextLost = (event: Event) => {
		event.preventDefault();
		this.contextLost = true;
		this.ready = false;
		this.stopFrame();
		this.callbacks.onError?.(
			'The graphics connection was interrupted. The studio will resume when it is restored.'
		);
	};
	private readonly onContextRestored = () => {
		if (this.disposed) return;
		this.contextLost = false;
		this.renderFailed = false;
		this.material.needsUpdate = true;
		this.setResolution();
		this.requestFrame();
	};

	private requestFrame() {
		if (
			!this.frame &&
			!this.disposed &&
			!this.contextLost &&
			!this.renderFailed &&
			!document.hidden &&
			this.intersecting
		) {
			this.frame = requestAnimationFrame(this.tick);
		}
	}
	private stopFrame() {
		cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.lastFrame = 0;
		this.statsTime = 0;
		this.statsFrames = 0;
	}
	private readonly tick = (now: number) => {
		this.frame = 0;
		if (
			this.disposed ||
			this.contextLost ||
			this.renderFailed ||
			document.hidden ||
			!this.intersecting
		)
			return;
		const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
		this.lastFrame = now;
		if (this._playing) {
			this.time += dt * this.settings.speed;
			if (!this.interacting && now > this.idleUntil)
				this.mesh.rotation.y += dt * this.settings.rotation;
		}
		this.material.uniforms.uTime.value = this.time;
		if (this.transitionActive) {
			const progress = Math.min(1, (now - this.transitionStart) / 950);
			this.material.uniforms.uTransition.value = progress;
			this.transitionActive = progress < 1;
		}
		const controlsChanged = this.controls.update();
		try {
			this.composer.render();
			if (!this.ready) {
				this.ready = true;
				this.callbacks.onReady?.();
			}
		} catch (error) {
			this._playing = false;
			this.renderFailed = true;
			this.stopFrame();
			this.callbacks.onError?.(
				error instanceof Error ? error.message : 'The scene could not be rendered.'
			);
			return;
		}
		if (this._playing) this.recordPerformance(now);
		if (this._playing || controlsChanged || this.transitionActive || this.interacting)
			this.requestFrame();
	};

	private recordPerformance(now: number) {
		if (!this.statsTime) {
			this.statsTime = now;
			this.sampleTime = now;
		}
		this.statsFrames++;
		const elapsed = now - this.statsTime;
		if (elapsed < 1500) return;
		const fps = Math.round((this.statsFrames * 1000) / elapsed);
		this.callbacks.onStats?.({ fps, count: this.count, quality: this.tier });
		if (this.settings.quality === 'auto' && now - this.sampleTime > 4500) {
			this.slowWindows = fps < 28 ? this.slowWindows + 1 : 0;
			if (this.slowWindows >= 2 && this.tier !== 'low') {
				this.tier = this.tier === 'high' ? 'medium' : 'low';
				this.slowWindows = 0;
				this.setResolution();
				this.rebuildGeometry(false);
			}
		}
		this.statsTime = now;
		this.statsFrames = 0;
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.stopFrame();
		clearTimeout(this.rebuildTimer);
		this.resizeObserver.disconnect();
		this.intersectionObserver.disconnect();
		document.removeEventListener('visibilitychange', this.onVisibility);
		this.canvas.removeEventListener('pointermove', this.onPointerMove);
		this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
		this.canvas.removeEventListener('keydown', this.onKeyDown);
		this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
		this.motionQuery.removeEventListener('change', this.onMotionChange);
		this.controls.removeEventListener('change', this.onControlsChange);
		this.controls.removeEventListener('start', this.onControlsStart);
		this.controls.removeEventListener('end', this.onControlsEnd);
		this.controls.dispose();
		this.mesh.geometry.dispose();
		this.material.dispose();
		this.bloom.dispose();
		this.output.dispose();
		this.composer.dispose();
		this.scene.clear();
		this.renderer.dispose();
	}
}
