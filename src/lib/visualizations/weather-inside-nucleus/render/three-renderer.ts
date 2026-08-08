import * as THREE from 'three';
import {
	adaptQuality,
	cappedPixelRatio,
	chooseInitialQuality,
	qualityHintsFromBrowser,
	qualityProfile
} from './quality';
import type {
	NucleusDirectedBeat,
	NucleusInterventionTarget,
	NucleusQualityChoice,
	NucleusQualityTier,
	NucleusRenderer,
	NucleusRendererCallbacks,
	NucleusRendererDiagnostics,
	NucleusRendererOptions,
	NucleusSemanticView,
	NucleusTraceBuffers
} from './types';

const MAX_TERRITORY_SAMPLES = 4_800;
const MAX_SIGNAL_SAMPLES = 320;
const MAX_RNA_INSTANCES = 256;
const MAX_OCCUPANCY_GLYPHS = 12;
const FRAME_SAMPLE_COUNT = 90;
const RNA_EVENT_LIFETIME = 2.4;
const INTRO_RNA_EVENT_LIFETIME = 8;

const LOW_BACKGROUND = new THREE.Color('#050712');
const STANDARD_PALETTE = {
	cell: '#3f7890',
	nucleus: '#72a7c2',
	territories: ['#4f718e', '#67699a', '#427e83', '#785e87', '#4d6781', '#527586'],
	chromatin: '#93a5b5',
	receptor: '#67b7db',
	signal: '#6ce5ff',
	enhancer: '#ed62d0',
	promoter: '#ffd166',
	rna: '#f7fbff',
	occupancy: '#f3c8df',
	directedActivity: '#ffd166',
	nuclearActivity: '#ded6ff'
} as const;
const CONTRAST_PALETTE = {
	cell: '#76d6ff',
	nucleus: '#d1f2ff',
	territories: ['#8ecbff', '#afa4ff', '#6ee6e6', '#ef9cff', '#86b9ff', '#8ce0c8'],
	chromatin: '#edf7ff',
	receptor: '#80e5ff',
	signal: '#b4f4ff',
	enhancer: '#ff8be1',
	promoter: '#ffdc8a',
	rna: '#ffffff',
	occupancy: '#fff2fa',
	directedActivity: '#ffe69e',
	nuclearActivity: '#ffffff'
} as const;

const STANDARD_VIEW_OPACITY = {
	cellEnvelope: { cell: 0.17, nucleus: 0.035, territory: 0.035, locus: 0.035 },
	nucleusEnvelope: { cell: 0.12, nucleus: 0.3, territory: 0.21, locus: 0.07 },
	territories: { cell: 0.09, nucleus: 0.42, territory: 0.64, locus: 0.13 },
	locus: { cell: 0.07, nucleus: 0.2, territory: 0.58, locus: 0.94 }
} as const;

const CONTRAST_VIEW_OPACITY = {
	cellEnvelope: { cell: 0.34, nucleus: 0.09, territory: 0.09, locus: 0.09 },
	nucleusEnvelope: { cell: 0.22, nucleus: 0.5, territory: 0.36, locus: 0.16 },
	territories: { cell: 0.2, nucleus: 0.68, territory: 0.88, locus: 0.28 },
	locus: { cell: 0.18, nucleus: 0.42, territory: 0.82, locus: 0.98 }
} as const;

type CameraPreset = Readonly<{
	target: readonly [number, number, number];
	radius: number;
	yaw: number;
	pitch: number;
	fov: number;
}>;

const CAMERA_PRESETS: Record<NucleusSemanticView, CameraPreset> = {
	cell: {
		target: [-1.2, 0, 0],
		radius: 25,
		yaw: 0.72,
		pitch: 0.26,
		fov: 43
	},
	nucleus: {
		target: [0, 0, 0],
		radius: 13.5,
		yaw: 0.68,
		pitch: 0.24,
		fov: 43
	},
	territory: {
		target: [0.3, 0.1, 0],
		radius: 8.7,
		yaw: 0.58,
		pitch: 0.22,
		fov: 43
	},
	locus: {
		target: [0.95, 0.2, 0.4],
		radius: 4.3,
		yaw: 0.48,
		pitch: 0.18,
		fov: 43
	}
};

const DIRECTED_BOUNDARY_CAMERA: CameraPreset = {
	target: [-10.9, 0.1, 0],
	radius: 5.6,
	yaw: 0.72,
	pitch: 0.14,
	fov: 36
};

const DIRECTED_RELAY_CAMERA: CameraPreset = {
	target: [-6.35, 0.05, 0],
	radius: 8.2,
	yaw: 0.7,
	pitch: 0.16,
	fov: 38
};

const DIRECTED_NUCLEAR_CAMERA: CameraPreset = {
	target: [-3.8, 0.12, 0],
	radius: 7.4,
	yaw: 0.66,
	pitch: 0.16,
	fov: 34
};

/** Panels five through seven deliberately share this exact object and camera matrix. */
const DIRECTED_LOCUS_CAMERA: CameraPreset = {
	target: [0.95, 0.2, 0.4],
	radius: 4.3,
	yaw: 0.48,
	pitch: 0.18,
	fov: 34
};

type DirectedActorMask = Readonly<{
	cellEnvelope: boolean;
	ligand: boolean;
	receptor: boolean;
	relay: boolean;
	nucleusEnvelope: boolean;
	nuclearProxy: boolean;
	territories: boolean;
	locus: boolean;
	contact: boolean;
	rna: boolean;
}>;

function clamp(value: number, minimum = 0, maximum = 1): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(value: number): number {
	const t = clamp(value);
	return t * t * (3 - 2 * t);
}

function criticallyDamped(value: number): number {
	const t = clamp(value);
	const omega = 6;
	const response = 1 - (1 + omega * t) * Math.exp(-omega * t);
	const settled = 1 - (1 + omega) * Math.exp(-omega);
	return clamp(response / settled);
}

function mix(first: number, second: number, amount: number): number {
	return first + (second - first) * clamp(amount);
}

const DIRECTED_ACTOR_MASKS = {
	boundary: {
		cellEnvelope: true,
		ligand: true,
		receptor: true,
		relay: false,
		nucleusEnvelope: false,
		nuclearProxy: false,
		territories: false,
		locus: false,
		contact: false,
		rna: false
	},
	relay: {
		cellEnvelope: true,
		ligand: true,
		receptor: true,
		relay: true,
		nucleusEnvelope: true,
		nuclearProxy: false,
		territories: false,
		locus: false,
		contact: false,
		rna: false
	},
	nuclear: {
		cellEnvelope: false,
		ligand: false,
		receptor: false,
		relay: true,
		nucleusEnvelope: true,
		nuclearProxy: true,
		territories: false,
		locus: false,
		contact: false,
		rna: false
	},
	histories: {
		cellEnvelope: false,
		ligand: false,
		receptor: false,
		relay: false,
		nucleusEnvelope: false,
		nuclearProxy: false,
		territories: true,
		locus: true,
		contact: false,
		rna: false
	},
	silent: {
		cellEnvelope: false,
		ligand: false,
		receptor: false,
		relay: false,
		nucleusEnvelope: false,
		nuclearProxy: false,
		territories: true,
		locus: true,
		contact: true,
		rna: false
	},
	burst: {
		cellEnvelope: false,
		ligand: false,
		receptor: false,
		relay: false,
		nucleusEnvelope: false,
		nuclearProxy: false,
		territories: true,
		locus: true,
		contact: true,
		rna: true
	},
	probability: {
		cellEnvelope: false,
		ligand: false,
		receptor: false,
		relay: false,
		nucleusEnvelope: false,
		nuclearProxy: false,
		territories: false,
		locus: false,
		contact: false,
		rna: false
	}
} as const satisfies Record<Exclude<NucleusDirectedBeat, 'scale-cut'>, DirectedActorMask>;

const SCALE_CUT_NUCLEAR_MASK: DirectedActorMask = {
	...DIRECTED_ACTOR_MASKS.nuclear,
	relay: false,
	nuclearProxy: false,
	territories: false
};
const SCALE_CUT_TERRITORY_MASK: DirectedActorMask = {
	...DIRECTED_ACTOR_MASKS.histories,
	locus: false
};
const SCALE_CUT_LOCUS_MASK: DirectedActorMask = DIRECTED_ACTOR_MASKS.histories;

function directedActorMask(beat: NucleusDirectedBeat, progress: number): DirectedActorMask {
	if (beat !== 'scale-cut') return DIRECTED_ACTOR_MASKS[beat];
	if (progress < 0.35) return SCALE_CUT_NUCLEAR_MASK;
	if (progress < 0.5) return SCALE_CUT_TERRITORY_MASK;
	return SCALE_CUT_LOCUS_MASK;
}

function finiteOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
}

function makeRandom(seed: number): () => number {
	let state = seed >>> 0 || 0x6d2b79f5;
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 4_294_967_296;
	};
}

function hashUnit(index: number, channel: number): number {
	let value = (index ^ Math.imul(channel + 1, 0x9e3779b1)) >>> 0;
	value ^= value >>> 16;
	value = Math.imul(value, 0x7feb352d) >>> 0;
	value ^= value >>> 15;
	value = Math.imul(value, 0x846ca68b) >>> 0;
	value ^= value >>> 16;
	return value / 4_294_967_296;
}

function lowerBound(values: ArrayLike<number>, target: number): number {
	let low = 0;
	let high = values.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (values[middle] < target) low = middle + 1;
		else high = middle;
	}
	return low;
}

function upperBound(values: ArrayLike<number>, target: number): number {
	let low = 0;
	let high = values.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (values[middle] <= target) low = middle + 1;
		else high = middle;
	}
	return low;
}

function validateTrace(trace: NucleusTraceBuffers): void {
	const sampleCount = trace.sampleTimes.length;
	if (sampleCount === 0) throw new Error('The nucleus trace contains no samples.');
	if (!trace.modelVersion.trim())
		throw new Error('The nucleus trace must identify its model version.');
	if (!Number.isInteger(trace.seed) || trace.seed < 0 || trace.seed > 0xffff_ffff) {
		throw new Error('The nucleus trace seed must be an unsigned 32-bit integer.');
	}
	if (!Number.isFinite(trace.duration) || trace.duration < 0) {
		throw new Error('The nucleus trace duration must be a finite, non-negative number.');
	}
	const aligned: ReadonlyArray<readonly [string, ArrayLike<number>]> = [
		['signalInput', trace.signalInput],
		['receptorActivity', trace.receptorActivity],
		['downstreamActivity', trace.downstreamActivity],
		['nuclearActivity', trace.nuclearActivity],
		['occupancy', trace.occupancy],
		['licensing', trace.licensing],
		['contactPropensity', trace.contactPropensity],
		['contactState', trace.contactState],
		['promoterState', trace.promoterState],
		['rnaCount', trace.rnaCount]
	];
	for (const [name, values] of aligned) {
		if (values.length !== sampleCount) {
			throw new Error(`Trace buffer ${name} has ${values.length} values; expected ${sampleCount}.`);
		}
	}
	let previous = -Infinity;
	for (let index = 0; index < sampleCount; index += 1) {
		const value = trace.sampleTimes[index];
		if (!Number.isFinite(value) || value < previous) {
			throw new Error('Trace sampleTimes must be finite and sorted in ascending order.');
		}
		previous = value;
	}
	const firstSampleTime = trace.sampleTimes[0];
	const lastSampleTime = trace.sampleTimes[sampleCount - 1];
	if (firstSampleTime < 0 || lastSampleTime > trace.duration + 1e-6) {
		throw new Error('Trace sampleTimes must stay inside the declared duration.');
	}
	const normalized: ReadonlyArray<readonly [string, ArrayLike<number>]> = [
		['signalInput', trace.signalInput],
		['receptorActivity', trace.receptorActivity],
		['downstreamActivity', trace.downstreamActivity],
		['nuclearActivity', trace.nuclearActivity],
		['occupancy', trace.occupancy],
		['licensing', trace.licensing],
		['contactPropensity', trace.contactPropensity]
	];
	for (const [name, values] of normalized) {
		for (let index = 0; index < values.length; index += 1) {
			const value = values[index];
			if (!Number.isFinite(value) || value < -1e-6 || value > 1 + 1e-6) {
				throw new Error(`Trace buffer ${name} must contain normalized finite values.`);
			}
		}
	}
	for (let index = 0; index < sampleCount; index += 1) {
		if (trace.contactState[index] > 1 || trace.promoterState[index] > 1) {
			throw new Error('Trace state buffers must contain only binary values.');
		}
	}
	previous = -Infinity;
	for (let index = 0; index < trace.initiationTimes.length; index += 1) {
		const value = trace.initiationTimes[index];
		if (!Number.isFinite(value) || value < previous || value < 0 || value > trace.duration + 1e-6) {
			throw new Error(
				'Trace initiationTimes must be finite, sorted, and inside the declared duration.'
			);
		}
		previous = value;
	}
}

function createFresnelMaterial(color: string, opacity: number): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(color) },
			uOpacity: { value: opacity },
			uPower: { value: 2.4 }
		},
		vertexShader: `
			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;
			void main() {
				vWorldNormal = normalize(mat3(modelMatrix) * normal);
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPosition.xyz;
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform vec3 uColor;
			uniform float uOpacity;
			uniform float uPower;
			varying vec3 vWorldNormal;
			varying vec3 vWorldPosition;
			void main() {
				vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
				float facing = 1.0 - abs(dot(normalize(vWorldNormal), viewDirection));
				#if NUCLEUS_DETAIL == 0
					float edge = facing;
				#elif NUCLEUS_DETAIL == 1
					float edge = pow(facing, uPower);
				#else
					float edge = clamp(pow(facing, uPower) + smoothstep(0.48, 1.0, facing) * 0.14, 0.0, 1.0);
				#endif
				float alpha = uOpacity * (0.12 + edge * 0.88);
				gl_FragColor = vec4(uColor, alpha);
			}
		`,
		defines: { NUCLEUS_DETAIL: 1 },
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		blending: THREE.NormalBlending
	});
}

function shaderOpacity(material: THREE.ShaderMaterial, opacity: number): void {
	material.uniforms.uOpacity.value = clamp(opacity);
}

function shaderColor(material: THREE.ShaderMaterial, color: string): void {
	(material.uniforms.uColor.value as THREE.Color).set(color);
}

function setMaterialOpacity(material: THREE.Material, opacity: number): void {
	material.opacity = clamp(opacity);
	material.visible = material.opacity > 0.001;
}

function disposeScene(scene: THREE.Scene): void {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	scene.traverse((object) => {
		const renderable = object as THREE.Object3D & {
			geometry?: THREE.BufferGeometry;
			material?: THREE.Material | THREE.Material[];
		};
		if (renderable.geometry) geometries.add(renderable.geometry);
		if (renderable.material) {
			const entries = Array.isArray(renderable.material)
				? renderable.material
				: [renderable.material];
			for (const material of entries) materials.add(material);
		}
	});
	for (const material of materials) {
		for (const value of Object.values(material)) {
			if (value instanceof THREE.Texture) textures.add(value);
		}
		if (material instanceof THREE.ShaderMaterial) {
			for (const uniform of Object.values(material.uniforms)) {
				if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
			}
		}
	}
	for (const texture of textures) texture.dispose();
	for (const geometry of geometries) geometry.dispose();
	for (const material of materials) material.dispose();
	scene.clear();
}

function attemptCleanup(cleanup: () => void): void {
	try {
		cleanup();
	} catch {
		// Constructor cleanup is best-effort so every remaining release step still runs.
	}
}

function loseWebGL2Context(context: WebGL2RenderingContext): void {
	attemptCleanup(() => context.getExtension('WEBGL_lose_context')?.loseContext());
}

function disposeAbandonedRenderer(
	renderer: THREE.WebGLRenderer,
	scene: THREE.Scene,
	context: WebGL2RenderingContext
): void {
	attemptCleanup(() => disposeScene(scene));
	attemptCleanup(() => renderer.renderLists.dispose());
	attemptCleanup(() => renderer.dispose());
	attemptCleanup(() => renderer.forceContextLoss());
	loseWebGL2Context(context);
}

export class WebGL2UnavailableError extends Error {
	constructor(message = 'WebGL 2 is unavailable for the three-dimensional nucleus view.') {
		super(message);
		this.name = 'WebGL2UnavailableError';
	}
}

class ThreeNucleusRenderer implements NucleusRenderer {
	readonly canvas: HTMLCanvasElement;

	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(43, 1, 0.05, 80);
	private readonly callbacks: NucleusRendererCallbacks;
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private readonly hitTargets: THREE.Mesh[] = [];
	private readonly frameSamples = new Float32Array(FRAME_SAMPLE_COUNT);
	private readonly cameraTarget = new THREE.Vector3();
	private readonly desiredCameraTarget = new THREE.Vector3();
	private readonly scratchPosition = new THREE.Vector3();
	private readonly scratchScale = new THREE.Vector3();
	private readonly scratchQuaternion = new THREE.Quaternion();
	private readonly scratchMatrix = new THREE.Matrix4();

	private readonly cellGroup = new THREE.Group();
	private readonly nucleusGroup = new THREE.Group();
	private readonly territoryGroup = new THREE.Group();
	private readonly locusGroup = new THREE.Group();
	private readonly signalGroup = new THREE.Group();
	private readonly directedRelayGroup = new THREE.Group();
	private readonly nuclearProxyGroup = new THREE.Group();
	private readonly directedRelayRegions: THREE.Mesh[] = [];
	private readonly directedRelayMaterials: THREE.MeshBasicMaterial[] = [];
	private readonly nuclearProxyMaterials: THREE.MeshBasicMaterial[] = [];
	private readonly cellEnvelopeMaterial: THREE.ShaderMaterial;
	private readonly nucleusEnvelopeMaterial: THREE.ShaderMaterial;
	private readonly territoryGeometry = new THREE.BufferGeometry();
	private readonly territoryMaterial: THREE.PointsMaterial;
	private readonly territoryColors = new Float32Array(MAX_TERRITORY_SAMPLES * 3);
	private readonly signalGeometry = new THREE.BufferGeometry();
	private readonly signalMaterial: THREE.PointsMaterial;
	private readonly chromatinMaterial: THREE.MeshStandardMaterial;
	private readonly receptorMaterial: THREE.MeshStandardMaterial;
	private readonly ligandMaterial: THREE.MeshStandardMaterial;
	private readonly enhancerMaterial: THREE.MeshStandardMaterial;
	private readonly promoterMaterial: THREE.MeshStandardMaterial;
	private readonly occupancyMaterial: THREE.MeshBasicMaterial;
	private readonly contactMaterial: THREE.LineDashedMaterial;
	private readonly contactHaloMaterial: THREE.MeshBasicMaterial;
	private readonly rnaMaterial: THREE.MeshBasicMaterial;
	private readonly occupancyGlyphs: THREE.InstancedMesh;
	private readonly rnaGlyphs: THREE.InstancedMesh;
	private readonly ligand: THREE.Mesh;
	private readonly receptorGroup = new THREE.Group();
	private receptorVisual: THREE.Mesh | null = null;
	private readonly enhancerGroup = new THREE.Group();
	private readonly promoterGroup = new THREE.Group();
	private readonly contactLine: THREE.Line;
	private readonly contactHalo: THREE.Mesh;
	private readonly signalPoints: THREE.Points;
	private cellEnvelope: THREE.Mesh | null = null;
	private nucleusEnvelope: THREE.Mesh | null = null;
	private chromatin: THREE.Mesh | null = null;

	private trace: NucleusTraceBuffers | null = null;
	private playbackTime = 0;
	private introActive = false;
	private introProgress = 1;
	private directedBeat: NucleusDirectedBeat | null = null;
	private directedProgress = 0;
	private directedFilmTime = 0;
	private view: NucleusSemanticView = 'cell';
	private introView: NucleusSemanticView = 'cell';
	private selectedTarget: NucleusInterventionTarget | null = null;
	private qualityChoice: NucleusQualityChoice;
	private quality: NucleusQualityTier;
	private motionAllowed: boolean;
	private highContrast: boolean;
	private contextLost = false;
	private disposed = false;
	private elapsed = 0;
	private activeRnaEvents = 0;
	private frameSampleIndex = 0;
	private adaptiveCooldownWindows = 0;

	private desiredYaw = CAMERA_PRESETS.cell.yaw;
	private desiredPitch = CAMERA_PRESETS.cell.pitch;
	private desiredRadius = CAMERA_PRESETS.cell.radius;
	private desiredFov = CAMERA_PRESETS.cell.fov;
	private currentYaw = CAMERA_PRESETS.cell.yaw;
	private currentPitch = CAMERA_PRESETS.cell.pitch;
	private currentRadius = CAMERA_PRESETS.cell.radius;
	private currentFov = CAMERA_PRESETS.cell.fov;
	private cameraNeedsSnap = true;
	private dragging = false;
	private dragPointerId: number | null = null;
	private dragX = 0;
	private dragY = 0;

	private sampleA = 0;
	private sampleB = 0;
	private sampleMix = 0;
	private currentSignalInput = 0;
	private currentReceptorActivity = 0;
	private currentDownstreamActivity = 0;
	private currentNuclearActivity = 0;
	private currentOccupancy = 0;
	private currentLicensing = 0;
	private currentContactPropensity = 0;
	private currentContactState = 0;
	private currentPromoterState = 0;
	private currentRnaCount = 0;

	constructor(canvas: HTMLCanvasElement, options: NucleusRendererOptions = {}) {
		this.canvas = canvas;
		this.callbacks = options.callbacks ?? {};
		this.qualityChoice = options.quality ?? 'auto';
		this.quality = chooseInitialQuality(this.qualityChoice, qualityHintsFromBrowser(this.canvas));
		this.motionAllowed = options.motionAllowed ?? true;
		this.highContrast = options.highContrast ?? false;
		const profile = qualityProfile(this.quality);

		let context: WebGL2RenderingContext | null;
		try {
			context = options.forceWebGL2Unavailable
				? null
				: this.canvas.getContext('webgl2', {
						alpha: false,
						antialias: profile.antialias,
						depth: true,
						stencil: false,
						premultipliedAlpha: false,
						preserveDrawingBuffer: false,
						powerPreference: 'high-performance',
						failIfMajorPerformanceCaveat: true
					});
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : 'Unable to request WebGL 2.';
			this.callbacks.onStatus?.('error', message);
			throw new WebGL2UnavailableError(message);
		}
		if (!context) {
			const error = new WebGL2UnavailableError();
			this.callbacks.onStatus?.('error', error.message);
			throw error;
		}

		try {
			this.renderer = new THREE.WebGLRenderer({
				canvas: this.canvas,
				context,
				alpha: false,
				antialias: profile.antialias,
				preserveDrawingBuffer: false,
				powerPreference: 'high-performance'
			});
		} catch (cause) {
			loseWebGL2Context(context);
			const message = cause instanceof Error ? cause.message : 'Unable to initialise WebGL 2.';
			this.callbacks.onStatus?.('error', message);
			throw new WebGL2UnavailableError(message);
		}

		try {
			this.renderer.outputColorSpace = THREE.SRGBColorSpace;
			this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
			this.renderer.toneMappingExposure = 1.05;
			this.renderer.info.autoReset = true;
			this.scene.background = LOW_BACKGROUND;
			this.scene.fog = new THREE.FogExp2(LOW_BACKGROUND, 0.018);

			this.cellEnvelopeMaterial = createFresnelMaterial(STANDARD_PALETTE.cell, 0.16);
			this.nucleusEnvelopeMaterial = createFresnelMaterial(STANDARD_PALETTE.nucleus, 0.28);
			this.territoryMaterial = new THREE.PointsMaterial({
				size: 0.09,
				vertexColors: true,
				transparent: true,
				opacity: 0.5,
				depthWrite: false,
				sizeAttenuation: true
			});
			this.signalMaterial = new THREE.PointsMaterial({
				color: STANDARD_PALETTE.signal,
				size: 0.16,
				transparent: true,
				opacity: 0,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				sizeAttenuation: true
			});
			this.chromatinMaterial = new THREE.MeshStandardMaterial({
				color: STANDARD_PALETTE.chromatin,
				roughness: 0.7,
				metalness: 0,
				transparent: true,
				opacity: 0.72,
				depthWrite: false
			});
			this.receptorMaterial = new THREE.MeshStandardMaterial({
				color: STANDARD_PALETTE.receptor,
				emissive: STANDARD_PALETTE.receptor,
				emissiveIntensity: 0.2,
				roughness: 0.45
			});
			this.ligandMaterial = new THREE.MeshStandardMaterial({
				color: STANDARD_PALETTE.signal,
				emissive: STANDARD_PALETTE.signal,
				emissiveIntensity: 0.36,
				roughness: 0.38,
				transparent: true
			});
			this.enhancerMaterial = new THREE.MeshStandardMaterial({
				color: STANDARD_PALETTE.enhancer,
				emissive: STANDARD_PALETTE.enhancer,
				emissiveIntensity: 0.3,
				roughness: 0.48,
				transparent: true
			});
			this.promoterMaterial = new THREE.MeshStandardMaterial({
				color: STANDARD_PALETTE.promoter,
				emissive: STANDARD_PALETTE.promoter,
				emissiveIntensity: 0.3,
				roughness: 0.4,
				transparent: true
			});
			this.occupancyMaterial = new THREE.MeshBasicMaterial({
				color: STANDARD_PALETTE.occupancy,
				transparent: true,
				opacity: 0,
				depthWrite: false
			});
			this.contactMaterial = new THREE.LineDashedMaterial({
				color: STANDARD_PALETTE.enhancer,
				dashSize: 0.18,
				gapSize: 0.12,
				transparent: true,
				opacity: 0,
				depthWrite: false
			});
			this.contactHaloMaterial = new THREE.MeshBasicMaterial({
				color: STANDARD_PALETTE.promoter,
				wireframe: true,
				transparent: true,
				opacity: 0,
				depthWrite: false
			});
			this.rnaMaterial = new THREE.MeshBasicMaterial({
				color: STANDARD_PALETTE.rna,
				transparent: true,
				opacity: 0.92,
				depthWrite: false
			});

			this.ligand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), this.ligandMaterial);
			this.occupancyGlyphs = new THREE.InstancedMesh(
				new THREE.OctahedronGeometry(0.11, 0),
				this.occupancyMaterial,
				MAX_OCCUPANCY_GLYPHS
			);
			this.rnaGlyphs = new THREE.InstancedMesh(
				new THREE.SphereGeometry(0.085, 8, 6),
				this.rnaMaterial,
				MAX_RNA_INSTANCES
			);
			// Instance bounds are otherwise cached while the pools are empty during worker startup.
			this.occupancyGlyphs.frustumCulled = false;
			this.rnaGlyphs.frustumCulled = false;
			this.occupancyGlyphs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			this.rnaGlyphs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

			this.buildScene(options.decorativeSeed ?? 0x4e55434c);
			this.buildDirectedActivityRegions();
			this.contactLine = this.createContactLine();
			this.contactHalo = new THREE.Mesh(
				new THREE.TorusGeometry(0.32, 0.025, 6, 24),
				this.contactHaloMaterial
			);
			this.contactHalo.position.set(0.05, 0.1, 0.13);
			this.contactHalo.rotation.set(0.7, 0.1, 0.2);
			this.locusGroup.add(this.contactLine, this.contactHalo, this.occupancyGlyphs, this.rnaGlyphs);

			this.signalPoints = new THREE.Points(this.signalGeometry, this.signalMaterial);
			this.signalGroup.add(this.signalPoints);
			this.scene.add(
				this.cellGroup,
				this.nucleusGroup,
				this.territoryGroup,
				this.locusGroup,
				this.signalGroup,
				this.directedRelayGroup,
				this.nuclearProxyGroup
			);
			this.directedRelayGroup.visible = false;
			this.nuclearProxyGroup.visible = false;
			this.installLights();
			this.installHitTargets();
			this.applyPalette();
			this.applyQuality(this.quality, 'initial', 0);
			this.applyCameraPreset('cell', true);
			this.resize();

			this.canvas.addEventListener('pointerdown', this.onPointerDown);
			window.addEventListener('pointermove', this.onPointerMove);
			window.addEventListener('pointerup', this.onPointerUp);
			window.addEventListener('pointercancel', this.onPointerUp);
			this.canvas.addEventListener('lostpointercapture', this.onLostPointerCapture);
			this.canvas.addEventListener('webglcontextlost', this.onContextLost);
			this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
			this.callbacks.onStatus?.('ready');
		} catch (cause) {
			disposeAbandonedRenderer(this.renderer, this.scene, context);
			attemptCleanup(() => this.removeEventListeners());
			const message = cause instanceof Error ? cause.message : 'Unable to initialise WebGL 2.';
			this.callbacks.onStatus?.('error', message);
			throw cause instanceof Error ? cause : new Error(message);
		}
	}

	private buildScene(decorativeSeed: number): void {
		const cellGeometry = new THREE.SphereGeometry(
			10,
			48,
			28,
			0.12,
			Math.PI * 1.7,
			0.18,
			Math.PI - 0.36
		);
		const cellEnvelope = new THREE.Mesh(cellGeometry, this.cellEnvelopeMaterial);
		this.cellEnvelope = cellEnvelope;
		cellEnvelope.position.x = -1.3;
		cellEnvelope.scale.set(1.18, 0.93, 1);
		cellEnvelope.renderOrder = 1;
		this.cellGroup.add(cellEnvelope);

		const nucleusEnvelope = new THREE.Mesh(
			new THREE.SphereGeometry(5, 48, 32),
			this.nucleusEnvelopeMaterial
		);
		this.nucleusEnvelope = nucleusEnvelope;
		nucleusEnvelope.scale.set(1, 0.92, 0.96);
		nucleusEnvelope.renderOrder = 2;
		this.nucleusGroup.add(nucleusEnvelope);

		const receptor = new THREE.Mesh(
			new THREE.CylinderGeometry(0.24, 0.31, 1.05, 10),
			this.receptorMaterial
		);
		receptor.rotation.z = Math.PI / 2;
		this.receptorVisual = receptor;
		this.receptorGroup.position.set(-10.9, 0.1, 0);
		this.receptorGroup.add(receptor);
		this.cellGroup.add(this.receptorGroup);
		this.ligand.position.set(-13.4, 0.1, 0);
		this.cellGroup.add(this.ligand);

		this.buildTerritories(decorativeSeed);
		this.buildSignalField();
		this.buildLocus();
	}

	private buildTerritories(seed: number): void {
		const positions = new Float32Array(MAX_TERRITORY_SAMPLES * 3);
		const centers: ReadonlyArray<readonly [number, number, number]> = [
			[-1.85, 1.35, 0.3],
			[1.55, 1.2, -0.85],
			[-1.45, -1.35, -0.9],
			[1.75, -1.15, 0.6],
			[0, 0.25, 1.65],
			[0.2, -0.25, -1.8]
		];
		const random = makeRandom(seed);
		for (let index = 0; index < MAX_TERRITORY_SAMPLES; index += 1) {
			const center = centers[index % centers.length];
			const z = random() * 2 - 1;
			const angle = random() * Math.PI * 2;
			const radius = Math.cbrt(random()) * Math.sqrt(Math.max(0, 1 - z * z));
			const offset = index * 3;
			positions[offset] = center[0] + Math.cos(angle) * radius * 1.5;
			positions[offset + 1] = center[1] + z * 1.25;
			positions[offset + 2] = center[2] + Math.sin(angle) * radius * 1.25;
		}
		this.territoryGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.territoryGeometry.setAttribute(
			'color',
			new THREE.BufferAttribute(this.territoryColors, 3)
		);
		this.territoryGeometry.computeBoundingSphere();
		this.territoryGroup.add(new THREE.Points(this.territoryGeometry, this.territoryMaterial));
	}

	private buildSignalField(): void {
		const positions = new Float32Array(MAX_SIGNAL_SAMPLES * 3);
		for (let index = 0; index < MAX_SIGNAL_SAMPLES; index += 1) {
			const progress = index / (MAX_SIGNAL_SAMPLES - 1);
			const offset = index * 3;
			positions[offset] = -10.6 + progress * 10.2;
			positions[offset + 1] = Math.sin(progress * Math.PI * 5) * (0.22 + progress * 0.18);
			positions[offset + 2] = Math.cos(progress * Math.PI * 4) * (0.18 + progress * 0.14);
		}
		this.signalGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.signalGeometry.computeBoundingSphere();
	}

	private buildDirectedActivityRegions(): void {
		const relayGeometry = new THREE.SphereGeometry(0.52, 16, 12);
		const relayPositions: ReadonlyArray<readonly [number, number, number]> = [
			[-9.35, 0.24, 0.12],
			[-7.65, -0.26, 0.28],
			[-5.95, 0.34, -0.16],
			[-4.55, -0.12, 0.08]
		];
		for (let index = 0; index < relayPositions.length; index += 1) {
			const material = new THREE.MeshBasicMaterial({
				color: STANDARD_PALETTE.directedActivity,
				transparent: true,
				opacity: 0,
				depthWrite: false,
				blending: THREE.AdditiveBlending
			});
			const region = new THREE.Mesh(relayGeometry, material);
			region.position.set(...relayPositions[index]);
			region.scale.set(1 + index * 0.08, 0.54 + index * 0.04, 0.78);
			region.visible = false;
			this.directedRelayMaterials.push(material);
			this.directedRelayRegions.push(region);
			this.directedRelayGroup.add(region);
		}

		const nuclearGeometry = new THREE.SphereGeometry(0.7, 18, 12);
		const nuclearOffsets: ReadonlyArray<readonly [number, number, number]> = [
			[-3.45, 0.28, 0.08],
			[-3.0, -0.12, -0.2],
			[-2.72, 0.36, 0.18]
		];
		for (let index = 0; index < nuclearOffsets.length; index += 1) {
			const material = new THREE.MeshBasicMaterial({
				color: STANDARD_PALETTE.nuclearActivity,
				transparent: true,
				opacity: 0,
				depthWrite: false,
				blending: THREE.AdditiveBlending
			});
			const region = new THREE.Mesh(nuclearGeometry, material);
			region.position.set(...nuclearOffsets[index]);
			region.scale.set(1.1 + index * 0.15, 0.72, 0.86);
			region.visible = false;
			this.nuclearProxyMaterials.push(material);
			this.nuclearProxyGroup.add(region);
		}
	}

	private buildLocus(): void {
		this.locusGroup.position.set(0.95, 0.2, 0.4);
		const curve = new THREE.CatmullRomCurve3([
			new THREE.Vector3(-2.1, -0.3, -0.2),
			new THREE.Vector3(-1.5, 0.25, 0.15),
			new THREE.Vector3(-0.85, -0.1, 0.22),
			new THREE.Vector3(-0.25, 0.28, -0.08),
			new THREE.Vector3(0.35, -0.18, 0.12),
			new THREE.Vector3(1.05, 0.1, 0.18),
			new THREE.Vector3(1.8, -0.18, -0.1),
			new THREE.Vector3(2.25, 0.16, 0.08)
		]);
		const chromatin = new THREE.Mesh(
			new THREE.TubeGeometry(curve, 96, 0.075, 6, false),
			this.chromatinMaterial
		);
		this.chromatin = chromatin;
		this.locusGroup.add(chromatin);

		this.enhancerGroup.position.set(-1.05, 0.04, 0.22);
		const enhancerTriangle = new THREE.Mesh(
			new THREE.CircleGeometry(0.34, 3),
			this.enhancerMaterial
		);
		enhancerTriangle.rotation.y = -0.4;
		const lobeGeometry = new THREE.SphereGeometry(0.18, 10, 8);
		const lobeA = new THREE.Mesh(lobeGeometry, this.enhancerMaterial);
		const lobeB = new THREE.Mesh(lobeGeometry, this.enhancerMaterial);
		lobeA.position.set(-0.25, 0.23, 0.02);
		lobeB.position.set(0.25, 0.23, -0.02);
		this.enhancerGroup.add(enhancerTriangle, lobeA, lobeB);

		this.promoterGroup.position.set(1.08, 0.02, 0.17);
		const promoter = new THREE.Mesh(
			new THREE.TorusGeometry(0.29, 0.075, 8, 24),
			this.promoterMaterial
		);
		promoter.rotation.y = 0.4;
		this.promoterGroup.add(promoter);
		this.locusGroup.add(this.enhancerGroup, this.promoterGroup);
	}

	private createContactLine(): THREE.Line {
		const geometry = new THREE.BufferGeometry().setFromPoints([
			new THREE.Vector3(-0.8, 0.18, 0.24),
			new THREE.Vector3(-0.36, 0.42, 0.28),
			new THREE.Vector3(0.08, 0.53, 0.29),
			new THREE.Vector3(0.53, 0.4, 0.24),
			new THREE.Vector3(0.86, 0.16, 0.18)
		]);
		const line = new THREE.Line(geometry, this.contactMaterial);
		line.computeLineDistances();
		return line;
	}

	private installLights(): void {
		const ambient = new THREE.HemisphereLight('#a9d7ed', '#171323', 1.2);
		const key = new THREE.DirectionalLight('#e5f4ff', 2.1);
		key.position.set(8, 12, 7);
		const locus = new THREE.PointLight('#dc4a9b', 1.6, 8, 2);
		locus.position.set(0.5, 1.7, 2.2);
		this.scene.add(ambient, key, locus);
	}

	private installHitTargets(): void {
		const material = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0,
			depthWrite: false,
			colorWrite: false
		});
		const create = (
			target: NucleusInterventionTarget,
			position: readonly [number, number, number],
			radius: number,
			parent: THREE.Object3D = this.scene
		) => {
			const hit = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), material);
			hit.position.set(...position);
			hit.userData.interventionTarget = target;
			hit.renderOrder = -1;
			parent.add(hit);
			this.hitTargets.push(hit);
		};
		create('receptor', [-10.9, 0.1, 0], 0.75);
		create('signal', [-5.2, 0, 0], 1.05);
		create('binding-site', [-1.05, 0.16, 0.22], 0.62, this.locusGroup);
		create('contact', [0.05, 0.34, 0.24], 0.8, this.locusGroup);
	}

	setTrace(trace: NucleusTraceBuffers | null): void {
		if (this.disposed) return;
		if (trace) validateTrace(trace);
		this.trace = trace;
		if (trace) this.playbackTime = clamp(this.playbackTime, 0, trace.duration);
		this.updateTraceSamples();
		this.updateScientificPresentation();
	}

	setPlaybackTime(modelTime: number): void {
		if (this.disposed) return;
		const maximum = this.trace?.duration ?? Number.MAX_SAFE_INTEGER;
		this.playbackTime = clamp(finiteOr(modelTime, 0), 0, maximum);
		this.updateTraceSamples();
		this.updateScientificPresentation();
	}

	setIntro(active: boolean, normalizedProgress: number): void {
		if (this.disposed) return;
		const wasActive = this.introActive;
		this.introActive = active;
		this.introProgress = clamp(finiteOr(normalizedProgress, 0));
		if (!this.directedBeat) {
			if (this.introActive) this.updateIntroView(!wasActive);
			else if (wasActive) this.applyCameraPreset(this.view, !this.motionAllowed);
		}
		this.updateScientificPresentation();
	}

	setDirectedPresentation(
		beat: NucleusDirectedBeat | null,
		normalizedProgress: number,
		filmTime: number
	): void {
		if (this.disposed) return;
		const previous = this.directedBeat;
		this.directedBeat = beat;
		this.directedProgress = clamp(finiteOr(normalizedProgress, 0));
		this.directedFilmTime = Math.max(0, finiteOr(filmTime, 0));
		if (beat) {
			this.dragging = false;
			if (this.dragPointerId !== null && this.canvas.hasPointerCapture?.(this.dragPointerId)) {
				this.canvas.releasePointerCapture?.(this.dragPointerId);
			}
			this.dragPointerId = null;
		} else if (previous) {
			this.scene.visible = true;
			if (this.introActive) this.updateIntroView(true);
			else this.applyCameraPreset(this.view, true);
		}
		if ((previous === null) !== (beat === null)) this.applyPalette();
		this.updateScientificPresentation();
	}

	setView(view: NucleusSemanticView, options: { snap?: boolean } = {}): void {
		if (this.disposed) return;
		this.view = view;
		if (!this.introActive && !this.directedBeat)
			this.applyCameraPreset(view, options.snap === true);
		this.updateScientificPresentation();
	}

	setMotionAllowed(allowed: boolean): void {
		if (this.disposed || this.motionAllowed === allowed) return;
		this.motionAllowed = allowed;
		if (!allowed) this.cameraNeedsSnap = true;
		if (this.introActive && !this.directedBeat) this.updateIntroView(true);
		this.updateScientificPresentation();
	}

	setHighContrast(enabled: boolean): void {
		if (this.disposed || this.highContrast === enabled) return;
		this.highContrast = enabled;
		this.applyPalette();
		this.updateScientificPresentation();
	}

	setSelectedTarget(target: NucleusInterventionTarget | null): void {
		if (this.disposed) return;
		this.selectedTarget = target;
		this.updateSelectionPresentation();
	}

	setQuality(choice: NucleusQualityChoice): void {
		if (this.disposed) return;
		this.qualityChoice = choice;
		const next = chooseInitialQuality(choice, qualityHintsFromBrowser(this.canvas));
		this.frameSampleIndex = 0;
		this.adaptiveCooldownWindows = 0;
		if (next !== this.quality) this.applyQuality(next, 'explicit', 0);
	}

	resize(): void {
		if (this.disposed) return;
		const width = Math.max(1, Math.round(this.canvas.clientWidth || this.canvas.width || 1));
		const height = Math.max(1, Math.round(this.canvas.clientHeight || this.canvas.height || 1));
		const ratio = cappedPixelRatio(window.devicePixelRatio || 1, this.quality);
		this.renderer.setPixelRatio(ratio);
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	render(deltaSeconds: number): void {
		if (this.disposed || this.contextLost) return;
		const startedAt = performance.now();
		const delta = clamp(finiteOr(deltaSeconds, 0), 0, 0.1);
		if (this.motionAllowed && !this.directedBeat) this.elapsed += delta;
		if (this.introActive && !this.directedBeat) this.updateIntroView();
		this.updateTraceSamples();
		this.updateScientificPresentation();
		if (this.directedBeat) this.updateDirectedCamera();
		else this.updateCamera();
		this.updateAmbientPresentation();
		this.renderer.render(this.scene, this.camera);
		if (deltaSeconds > 0) {
			this.trackFrameTime(
				Math.max(performance.now() - startedAt, clamp(deltaSeconds, 0, 0.1) * 1_000)
			);
		}
	}

	pickTarget(clientX: number, clientY: number): NucleusInterventionTarget | null {
		if (this.disposed || this.contextLost || this.directedBeat) return null;
		const bounds = this.canvas.getBoundingClientRect();
		if (bounds.width <= 0 || bounds.height <= 0) return null;
		this.pointer.set(
			((clientX - bounds.left) / bounds.width) * 2 - 1,
			-((clientY - bounds.top) / bounds.height) * 2 + 1
		);
		this.raycaster.setFromCamera(this.pointer, this.camera);
		const hit = this.raycaster.intersectObjects(this.hitTargets, false)[0];
		return (
			(hit?.object.userData.interventionTarget as NucleusInterventionTarget | undefined) ?? null
		);
	}

	captureCanvas(): HTMLCanvasElement {
		if (!this.disposed && !this.contextLost) {
			if (this.directedBeat) this.updateDirectedCamera();
			else this.updateCamera(true);
			this.renderer.render(this.scene, this.camera);
		}
		return this.canvas;
	}

	getDiagnostics(): NucleusRendererDiagnostics {
		const render = this.renderer.info.render;
		return {
			quality: this.quality,
			pixelRatio: this.renderer.getPixelRatio(),
			drawCalls: render.calls,
			triangles: render.triangles,
			points: render.points,
			geometries: this.renderer.info.memory.geometries,
			textures: this.renderer.info.memory.textures,
			activeRnaEvents: this.activeRnaEvents,
			contextLost: this.contextLost
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.dragging = false;
		if (this.dragPointerId !== null && this.canvas.hasPointerCapture?.(this.dragPointerId)) {
			this.canvas.releasePointerCapture?.(this.dragPointerId);
		}
		this.dragPointerId = null;
		this.removeEventListeners();
		this.trace = null;
		disposeScene(this.scene);
		this.renderer.renderLists.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}

	private removeEventListeners(): void {
		this.canvas.removeEventListener('pointerdown', this.onPointerDown);
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', this.onPointerMove);
			window.removeEventListener('pointerup', this.onPointerUp);
			window.removeEventListener('pointercancel', this.onPointerUp);
		}
		this.canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture);
		this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
	}

	private updateTraceSamples(): void {
		const trace = this.trace;
		if (!trace) {
			this.sampleA = 0;
			this.sampleB = 0;
			this.sampleMix = 0;
			this.currentSignalInput = 0;
			this.currentReceptorActivity = 0;
			this.currentDownstreamActivity = 0;
			this.currentNuclearActivity = 0;
			this.currentOccupancy = 0;
			this.currentLicensing = 0;
			this.currentContactPropensity = 0;
			this.currentContactState = 0;
			this.currentPromoterState = 0;
			this.currentRnaCount = 0;
			return;
		}
		const times = trace.sampleTimes;
		const after = upperBound(times, this.playbackTime);
		this.sampleA = clamp(after - 1, 0, times.length - 1);
		this.sampleB = Math.min(times.length - 1, this.sampleA + 1);
		const span = times[this.sampleB] - times[this.sampleA];
		this.sampleMix = span > 0 ? clamp((this.playbackTime - times[this.sampleA]) / span) : 0;
		this.currentSignalInput = this.sampleContinuous(trace.signalInput);
		this.currentReceptorActivity = this.sampleContinuous(trace.receptorActivity);
		this.currentDownstreamActivity = this.sampleContinuous(trace.downstreamActivity);
		this.currentNuclearActivity = this.sampleContinuous(trace.nuclearActivity);
		this.currentOccupancy = this.sampleContinuous(trace.occupancy);
		this.currentLicensing = this.sampleContinuous(trace.licensing);
		this.currentContactPropensity = this.sampleContinuous(trace.contactPropensity);
		this.currentContactState = trace.contactState[this.sampleA] > 0 ? 1 : 0;
		this.currentPromoterState = trace.promoterState[this.sampleA] > 0 ? 1 : 0;
		this.currentRnaCount = finiteOr(trace.rnaCount[this.sampleA], 0);
	}

	private sampleContinuous(values: ArrayLike<number>): number {
		const first = finiteOr(values[this.sampleA], 0);
		const second = finiteOr(values[this.sampleB], first);
		return clamp(first + (second - first) * this.sampleMix);
	}

	private updateScientificPresentation(): void {
		if (this.directedBeat) {
			this.updateDirectedScientificPresentation(this.directedBeat);
			return;
		}
		this.restoreLegacyActorVisibility();
		const activeView = this.introActive ? this.introView : this.view;
		const progress = this.introActive ? this.introPresentationProgress() : 1;
		const nucleusReveal = this.introActive ? smoothstep((progress - 0.483) / 0.217) : 1;
		const territoryReveal = this.introActive ? smoothstep((progress - 0.64) / 0.21) : 1;
		const locusReveal = this.introActive ? smoothstep((progress - 0.7) / 0.15) : 1;
		const eventReveal = this.introActive ? smoothstep((progress - 0.85) / 0.15) : 1;

		const opacities = this.highContrast ? CONTRAST_VIEW_OPACITY : STANDARD_VIEW_OPACITY;
		const cellOpacity = opacities.cellEnvelope[activeView];
		const nucleusOpacity = opacities.nucleusEnvelope[activeView];
		const territoryOpacity = opacities.territories[activeView];
		const locusOpacity = opacities.locus[activeView];

		shaderOpacity(this.cellEnvelopeMaterial, cellOpacity);
		shaderOpacity(this.nucleusEnvelopeMaterial, nucleusOpacity * nucleusReveal);
		setMaterialOpacity(this.territoryMaterial, territoryOpacity * territoryReveal);
		setMaterialOpacity(this.chromatinMaterial, locusOpacity * locusReveal);

		const receptorBrightness = 0.16 + this.currentReceptorActivity * 1.25;
		this.receptorMaterial.emissiveIntensity = receptorBrightness;
		this.ligandMaterial.opacity = this.currentSignalInput;
		this.ligandMaterial.visible = this.currentSignalInput > 0.001;
		this.receptorVisual?.scale.set(
			1 + this.currentReceptorActivity * 0.12,
			1 + this.currentReceptorActivity * 0.24,
			1 + this.currentReceptorActivity * 0.12
		);
		const licensingBrightness = 0.15 + this.currentLicensing * 1.2;
		this.enhancerMaterial.emissiveIntensity = licensingBrightness;
		this.enhancerMaterial.opacity = clamp(locusOpacity * locusReveal + 0.05);
		this.enhancerMaterial.visible = this.enhancerMaterial.opacity > 0.001;
		this.promoterMaterial.emissiveIntensity = 0.15 + this.currentPromoterState * 1.45;
		this.promoterMaterial.opacity = clamp(locusOpacity * locusReveal + 0.05);
		this.promoterMaterial.visible = this.promoterMaterial.opacity > 0.001;

		const introSignalFront = this.introActive ? smoothstep((progress - 0.25) / 0.233) : 1;
		// The inward field is the compressed downstream-activity proxy, never extracellular EGF.
		const signalActivity = this.currentDownstreamActivity;
		const signalLimit = qualityProfile(this.quality).signalSamples;
		this.signalGeometry.setDrawRange(0, Math.floor(signalLimit * introSignalFront));
		setMaterialOpacity(
			this.signalMaterial,
			signalActivity * (this.highContrast ? 1 : 0.86) * introSignalFront
		);

		const dockProgress = this.introActive ? smoothstep((progress - 0.083) / 0.167) : 1;
		this.ligand.position.x = -13.4 + dockProgress * 2.08;
		this.ligand.position.y = 0.1 + Math.sin(dockProgress * Math.PI) * 0.28;

		const occupancyCount =
			this.currentOccupancy <= 0.015
				? 0
				: Math.min(MAX_OCCUPANCY_GLYPHS, Math.max(1, Math.round(this.currentOccupancy * 12)));
		this.occupancyGlyphs.count = occupancyCount;
		setMaterialOpacity(
			this.occupancyMaterial,
			(0.22 + this.currentOccupancy * 0.75) * locusReveal * eventReveal
		);
		for (let index = 0; index < occupancyCount; index += 1) {
			const angle = (index / Math.max(1, occupancyCount)) * Math.PI * 2;
			this.scratchPosition.set(
				-1.05 + Math.cos(angle) * 0.34,
				0.25 + Math.sin(angle * 2) * 0.11,
				0.22 + Math.sin(angle) * 0.28
			);
			const scale = 0.72 + this.currentOccupancy * 0.5;
			this.scratchScale.setScalar(scale);
			this.scratchMatrix.compose(this.scratchPosition, this.scratchQuaternion, this.scratchScale);
			this.occupancyGlyphs.setMatrixAt(index, this.scratchMatrix);
		}
		if (occupancyCount > 0) this.occupancyGlyphs.instanceMatrix.needsUpdate = true;

		const contactOpacity =
			(0.1 + this.currentContactPropensity * 0.64 + this.currentContactState * 0.18) *
			locusReveal *
			eventReveal;
		setMaterialOpacity(this.contactMaterial, contactOpacity);
		setMaterialOpacity(
			this.contactHaloMaterial,
			(0.05 + this.currentContactPropensity * 0.34 + this.currentContactState * 0.28) *
				locusReveal *
				eventReveal
		);
		this.updateRnaEvents(locusReveal * eventReveal);
		this.updateSelectionPresentation();
	}

	private restoreLegacyActorVisibility(): void {
		this.scene.visible = true;
		this.cellGroup.visible = true;
		this.nucleusGroup.visible = true;
		this.territoryGroup.visible = true;
		this.locusGroup.visible = true;
		this.signalGroup.visible = true;
		this.directedRelayGroup.visible = false;
		this.nuclearProxyGroup.visible = false;
		if (this.cellEnvelope) this.cellEnvelope.visible = true;
		if (this.nucleusEnvelope) this.nucleusEnvelope.visible = true;
		if (this.chromatin) {
			this.chromatin.visible = true;
			this.chromatin.rotation.set(0, 0, 0);
		}
		this.ligand.visible = true;
		this.receptorGroup.visible = true;
		this.enhancerGroup.visible = true;
		this.promoterGroup.visible = true;
		this.contactLine.visible = true;
		this.contactHalo.visible = true;
		this.occupancyGlyphs.visible = true;
		this.rnaGlyphs.visible = true;
		this.enhancerGroup.position.x = -1.05;
	}

	private updateDirectedScientificPresentation(beat: NucleusDirectedBeat): void {
		const progress = this.directedProgress;
		const mask = directedActorMask(beat, progress);
		this.scene.visible = beat !== 'probability';
		this.signalGroup.visible = false;
		this.directedRelayGroup.visible = mask.relay;
		this.nuclearProxyGroup.visible = mask.nuclearProxy;
		this.cellGroup.visible = mask.cellEnvelope || mask.ligand || mask.receptor;
		this.nucleusGroup.visible = mask.nucleusEnvelope;
		this.territoryGroup.visible = mask.territories;
		this.locusGroup.visible = mask.locus;
		if (this.cellEnvelope) this.cellEnvelope.visible = mask.cellEnvelope;
		if (this.nucleusEnvelope) this.nucleusEnvelope.visible = mask.nucleusEnvelope;
		if (this.chromatin) this.chromatin.visible = mask.locus;
		this.ligand.visible = mask.ligand;
		this.receptorGroup.visible = mask.receptor;
		this.enhancerGroup.visible = mask.locus;
		this.promoterGroup.visible = mask.locus;
		this.contactLine.visible = mask.contact;
		this.contactHalo.visible = mask.contact;
		this.occupancyGlyphs.visible = false;
		this.rnaGlyphs.visible = mask.rna;

		if (beat === 'probability') {
			this.rnaGlyphs.count = 0;
			this.activeRnaEvents = 0;
			return;
		}

		const contrast = this.highContrast ? 1 : 0.82;
		shaderOpacity(this.cellEnvelopeMaterial, mask.cellEnvelope ? 0.28 * contrast : 0);
		shaderOpacity(
			this.nucleusEnvelopeMaterial,
			mask.nucleusEnvelope ? (beat === 'nuclear' ? 0.4 : 0.18) * contrast : 0
		);
		setMaterialOpacity(
			this.territoryMaterial,
			mask.territories ? (beat === 'nuclear' ? 0.18 : 0.13) * contrast : 0
		);
		setMaterialOpacity(this.chromatinMaterial, mask.locus ? 0.72 * contrast : 0);
		if (this.chromatin) {
			const historyEmphasis =
				beat === 'histories' && this.motionAllowed
					? smoothstep((progress - 0.25) / 0.04) * (1 - smoothstep((progress - 0.35) / 0.05))
					: 0;
			this.chromatin.rotation.z = historyEmphasis * 0.025;
		}

		setMaterialOpacity(this.ligandMaterial, mask.ligand ? 0.94 : 0);
		this.ligand.position.set(-11.32, 0.1, 0);
		const receptorActivity = Math.max(0.12, this.currentReceptorActivity);
		const receptorEmphasis =
			beat === 'boundary'
				? smoothstep((progress - 0.267) / 0.025) * (1 - smoothstep((progress - 0.3) / 0.035))
				: 0;
		this.receptorMaterial.emissiveIntensity = mask.receptor
			? 0.22 + receptorActivity * 1.45 + receptorEmphasis * 0.48
			: 0;
		this.receptorVisual?.scale.set(
			1 + receptorActivity * 0.1 + receptorEmphasis * 0.05,
			1 + receptorActivity * 0.2 + receptorEmphasis * 0.1,
			1 + receptorActivity * 0.1 + receptorEmphasis * 0.05
		);

		const relayActivity = this.currentDownstreamActivity;
		for (let index = 0; index < this.directedRelayRegions.length; index += 1) {
			const region = this.directedRelayRegions[index];
			const material = this.directedRelayMaterials[index];
			const onset = 0.35 + index * 0.035;
			const attack = beat === 'relay' ? smoothstep((progress - onset) / 0.04) : 1;
			const settle =
				beat === 'relay' ? 1 - smoothstep((progress - onset - 0.09) / 0.08) * 0.55 : 0.3;
			const opacity = mask.relay ? relayActivity * attack * settle * 0.62 : 0;
			region.visible = opacity > 0.002;
			setMaterialOpacity(material, opacity);
		}

		const nuclearAttack = smoothstep((progress - 0.357) / 0.072);
		const nuclearOpacity = mask.nuclearProxy
			? this.currentNuclearActivity * nuclearAttack * 0.46
			: 0;
		for (let index = 0; index < this.nuclearProxyMaterials.length; index += 1) {
			const material = this.nuclearProxyMaterials[index];
			setMaterialOpacity(material, nuclearOpacity * (0.82 - index * 0.12));
			const region = this.nuclearProxyGroup.children[index];
			if (region) region.visible = nuclearOpacity > 0.002;
		}

		const locusOpacity = mask.locus ? 0.94 : 0;
		this.enhancerMaterial.emissiveIntensity = 0.18 + this.currentLicensing * 0.9;
		setMaterialOpacity(this.enhancerMaterial, locusOpacity);
		this.promoterMaterial.emissiveIntensity = 0.14 + this.currentPromoterState * 1.45;
		setMaterialOpacity(this.promoterMaterial, locusOpacity);
		this.occupancyGlyphs.count = 0;
		setMaterialOpacity(this.occupancyMaterial, 0);

		// Near/far placement follows only the selected trace's discrete contact state. Propensity never
		// becomes a distance or a renderer-authored chromatin movement.
		this.enhancerGroup.position.x =
			(beat === 'silent' || beat === 'burst') && this.currentContactState ? -0.12 : -1.05;
		const contactOpacity = mask.contact
			? 0.14 + this.currentContactPropensity * 0.42 + this.currentContactState * 0.18
			: 0;
		setMaterialOpacity(this.contactMaterial, contactOpacity);
		setMaterialOpacity(this.contactHaloMaterial, mask.contact ? contactOpacity * 0.62 : 0);
		this.updateRnaEvents(mask.rna ? 1 : 0);
		this.updateSelectionPresentation();
	}

	private updateRnaEvents(reveal: number): void {
		const events = this.trace?.initiationTimes;
		if (!events || reveal <= 0.001) {
			this.rnaGlyphs.count = 0;
			this.activeRnaEvents = 0;
			return;
		}
		const eventLifetime =
			this.introActive && !this.directedBeat ? INTRO_RNA_EVENT_LIFETIME : RNA_EVENT_LIFETIME;
		const first = lowerBound(events, this.playbackTime - eventLifetime);
		const after = upperBound(events, this.playbackTime);
		const capacity = qualityProfile(this.quality).rnaPoolSize;
		const start = Math.max(first, after - capacity);
		const count = Math.min(capacity, Math.max(0, after - start));
		this.rnaGlyphs.count = count;
		this.activeRnaEvents = count;
		setMaterialOpacity(
			this.rnaMaterial,
			reveal * (0.58 + Math.min(1, this.currentRnaCount / 8) * 0.36)
		);
		for (let instance = 0; instance < count; instance += 1) {
			const eventIndex = start + instance;
			const age = clamp((this.playbackTime - events[eventIndex]) / eventLifetime);
			const angle = hashUnit(eventIndex, 0) * Math.PI * 2;
			const localRadius = 0.04 + hashUnit(eventIndex, 1) * 0.09;
			this.scratchPosition.set(
				1.08 + Math.cos(angle) * localRadius,
				0.1 + (hashUnit(eventIndex, 2) - 0.5) * 0.1,
				0.17 + Math.sin(angle) * localRadius
			);
			const pulse = this.motionAllowed ? Math.sin(age * Math.PI) : 0.7;
			this.scratchScale.setScalar(0.65 + pulse * 0.55);
			this.scratchMatrix.compose(this.scratchPosition, this.scratchQuaternion, this.scratchScale);
			this.rnaGlyphs.setMatrixAt(instance, this.scratchMatrix);
		}
		if (count > 0) this.rnaGlyphs.instanceMatrix.needsUpdate = true;
	}

	private updateSelectionPresentation(): void {
		if (this.directedBeat) {
			this.enhancerGroup.scale.setScalar(1);
			this.promoterGroup.scale.setScalar(1);
			this.signalPoints.scale.setScalar(1);
			this.receptorGroup.scale.setScalar(1);
			this.ligand.scale.setScalar(1);
			this.contactHalo.scale.setScalar(0.76 + this.currentContactPropensity * 0.55);
			return;
		}
		const pulse = this.motionAllowed ? 1 + Math.sin(this.elapsed * 2.2) * 0.035 : 1.035;
		this.enhancerGroup.scale.setScalar(this.selectedTarget === 'binding-site' ? 1.16 * pulse : 1);
		this.promoterGroup.scale.setScalar(1);
		this.signalPoints.scale.setScalar(this.selectedTarget === 'signal' ? 1.04 * pulse : 1);
		this.receptorGroup.scale.setScalar(this.selectedTarget === 'receptor' ? 1.16 * pulse : 1);
		this.ligand.scale.setScalar(1);
		const contactScale = 0.76 + this.currentContactPropensity * 0.55;
		this.contactHalo.scale.setScalar(
			this.selectedTarget === 'contact' ? contactScale * 1.22 * pulse : contactScale
		);
	}

	private updateAmbientPresentation(): void {
		if (this.directedBeat) {
			// Every directed beat is a fixed scientific tableau; actor motion comes only from explicit
			// beat presentation updates, never ambient chromosome drift.
			this.territoryGroup.rotation.y = 0;
			this.signalPoints.rotation.x = 0;
			return;
		}
		if (!this.motionAllowed) return;
		this.territoryGroup.rotation.y = Math.sin(this.elapsed * 0.085) * 0.018;
		this.signalPoints.rotation.x = Math.sin(this.elapsed * 0.31) * 0.012;
	}

	private updateIntroView(force = false): void {
		const progress = this.introPresentationProgress();
		const next: NucleusSemanticView =
			progress < 0.483
				? 'cell'
				: progress < 0.7
					? 'nucleus'
					: progress < 0.85
						? 'territory'
						: 'locus';
		if (!force && next === this.introView) return;
		this.introView = next;
		this.applyCameraPreset(next, true);
	}

	private introPresentationProgress(): number {
		if (this.motionAllowed) return this.introProgress;
		if (this.introProgress < 1 / 3) return 0.2;
		if (this.introProgress < 2 / 3) return 0.62;
		return 1;
	}

	private applyCameraPreset(view: NucleusSemanticView, snap: boolean): void {
		const preset = CAMERA_PRESETS[view];
		this.desiredCameraTarget.set(...preset.target);
		this.desiredYaw = preset.yaw;
		this.desiredPitch = preset.pitch;
		this.desiredRadius = preset.radius;
		this.desiredFov = preset.fov;
		if (snap || !this.motionAllowed) this.cameraNeedsSnap = true;
	}

	private updateDirectedCamera(): void {
		const beat = this.directedBeat;
		if (!beat) return;
		if (beat === 'boundary') {
			this.setDirectedCameraSample(DIRECTED_BOUNDARY_CAMERA, DIRECTED_BOUNDARY_CAMERA, 1);
			return;
		}
		if (beat === 'relay') {
			const amount = criticallyDamped(this.directedProgress / 0.2125);
			this.setDirectedCameraSample(DIRECTED_BOUNDARY_CAMERA, DIRECTED_RELAY_CAMERA, amount);
			return;
		}
		if (beat === 'nuclear') {
			const amount = criticallyDamped(this.directedProgress / 0.2);
			this.setDirectedCameraSample(DIRECTED_RELAY_CAMERA, DIRECTED_NUCLEAR_CAMERA, amount);
			return;
		}
		if (beat === 'scale-cut' && this.directedProgress < 0.35) {
			this.setDirectedCameraSample(DIRECTED_NUCLEAR_CAMERA, DIRECTED_NUCLEAR_CAMERA, 1);
			return;
		}
		// The scale cut is hard at 0.5, and histories/silent/burst share this literal matrix.
		this.setDirectedCameraSample(DIRECTED_LOCUS_CAMERA, DIRECTED_LOCUS_CAMERA, 1);
	}

	private setDirectedCameraSample(first: CameraPreset, second: CameraPreset, amount: number): void {
		const t = clamp(amount);
		this.cameraTarget.set(
			mix(first.target[0], second.target[0], t),
			mix(first.target[1], second.target[1], t),
			mix(first.target[2], second.target[2], t)
		);
		this.currentYaw = mix(first.yaw, second.yaw, t);
		this.currentPitch = mix(first.pitch, second.pitch, t);
		this.currentRadius = mix(first.radius, second.radius, t);
		this.currentFov = mix(first.fov, second.fov, t);
		this.positionCamera();
	}

	private updateCamera(forceSnap = false): void {
		const snap = forceSnap || this.cameraNeedsSnap || !this.motionAllowed;
		const interpolation = snap ? 1 : 0.085;
		this.cameraTarget.lerp(this.desiredCameraTarget, interpolation);
		this.currentYaw += (this.desiredYaw - this.currentYaw) * interpolation;
		this.currentPitch += (this.desiredPitch - this.currentPitch) * interpolation;
		this.currentRadius += (this.desiredRadius - this.currentRadius) * interpolation;
		this.currentFov += (this.desiredFov - this.currentFov) * interpolation;
		this.positionCamera();
		this.cameraNeedsSnap = false;
	}

	private positionCamera(): void {
		const cosine = Math.cos(this.currentPitch);
		this.camera.position.set(
			this.cameraTarget.x + Math.cos(this.currentYaw) * cosine * this.currentRadius,
			this.cameraTarget.y + Math.sin(this.currentPitch) * this.currentRadius,
			this.cameraTarget.z + Math.sin(this.currentYaw) * cosine * this.currentRadius
		);
		this.camera.lookAt(this.cameraTarget);
		if (Math.abs(this.camera.fov - this.currentFov) > 1e-5) {
			this.camera.fov = this.currentFov;
			this.camera.updateProjectionMatrix();
		}
	}

	private applyPalette(): void {
		const palette = this.highContrast ? CONTRAST_PALETTE : STANDARD_PALETTE;
		const receptorColor = this.directedBeat ? palette.directedActivity : palette.receptor;
		shaderColor(this.cellEnvelopeMaterial, palette.cell);
		shaderColor(this.nucleusEnvelopeMaterial, palette.nucleus);
		this.chromatinMaterial.color.set(palette.chromatin);
		this.receptorMaterial.color.set(receptorColor);
		this.receptorMaterial.emissive.set(receptorColor);
		this.ligandMaterial.color.set(palette.signal);
		this.ligandMaterial.emissive.set(palette.signal);
		this.signalMaterial.color.set(palette.signal);
		this.enhancerMaterial.color.set(palette.enhancer);
		this.enhancerMaterial.emissive.set(palette.enhancer);
		this.promoterMaterial.color.set(palette.promoter);
		this.promoterMaterial.emissive.set(palette.promoter);
		this.occupancyMaterial.color.set(palette.occupancy);
		this.contactMaterial.color.set(palette.enhancer);
		this.contactHaloMaterial.color.set(palette.promoter);
		this.rnaMaterial.color.set(palette.rna);
		for (const material of this.directedRelayMaterials) {
			material.color.set(palette.directedActivity);
		}
		for (const material of this.nuclearProxyMaterials) {
			material.color.set(palette.nuclearActivity);
		}
		for (let index = 0; index < MAX_TERRITORY_SAMPLES; index += 1) {
			const color = new THREE.Color(palette.territories[index % palette.territories.length]);
			const offset = index * 3;
			this.territoryColors[offset] = color.r;
			this.territoryColors[offset + 1] = color.g;
			this.territoryColors[offset + 2] = color.b;
		}
		const attribute = this.territoryGeometry.getAttribute('color');
		if (attribute) attribute.needsUpdate = true;
		this.territoryMaterial.size = this.highContrast ? 0.11 : 0.09;
	}

	private applyQuality(
		quality: NucleusQualityTier,
		reason: 'initial' | 'explicit' | 'adaptive',
		averageFrameMs: number
	): void {
		this.quality = quality;
		const profile = qualityProfile(quality);
		this.territoryGeometry.setDrawRange(0, profile.territorySamples);
		this.signalGeometry.setDrawRange(0, profile.signalSamples);
		this.territoryMaterial.size =
			(this.highContrast ? 0.11 : 0.09) * (profile.shaderDetail === 0 ? 1.12 : 1);
		this.signalMaterial.size =
			profile.shaderDetail === 2 ? 0.17 : profile.shaderDetail === 1 ? 0.16 : 0.18;
		const fresnelPower = profile.shaderDetail === 2 ? 2.8 : profile.shaderDetail === 1 ? 2.4 : 2;
		for (const material of [this.cellEnvelopeMaterial, this.nucleusEnvelopeMaterial]) {
			material.uniforms.uPower.value = fresnelPower;
			if (material.defines?.NUCLEUS_DETAIL !== profile.shaderDetail) {
				material.defines = { ...material.defines, NUCLEUS_DETAIL: profile.shaderDetail };
				material.needsUpdate = true;
			}
		}
		this.resize();
		this.callbacks.onQualityChange?.({ quality, averageFrameMs, reason });
	}

	private trackFrameTime(frameMs: number): void {
		if (this.qualityChoice !== 'auto' || !Number.isFinite(frameMs)) return;
		this.frameSamples[this.frameSampleIndex] = frameMs;
		this.frameSampleIndex += 1;
		if (this.frameSampleIndex < FRAME_SAMPLE_COUNT) return;
		let total = 0;
		for (let index = 0; index < FRAME_SAMPLE_COUNT; index += 1) total += this.frameSamples[index];
		const average = total / FRAME_SAMPLE_COUNT;
		this.frameSampleIndex = 0;
		if (this.adaptiveCooldownWindows > 0) {
			this.adaptiveCooldownWindows -= 1;
			return;
		}
		const next = adaptQuality(this.quality, average, qualityHintsFromBrowser(this.canvas));
		if (next !== this.quality) {
			this.adaptiveCooldownWindows = 3;
			this.applyQuality(next, 'adaptive', average);
		}
	}

	private activePreset(): CameraPreset {
		return CAMERA_PRESETS[this.introActive ? this.introView : this.view];
	}

	private onPointerDown = (event: PointerEvent): void => {
		if (this.disposed || this.introActive || this.directedBeat || event.button !== 0) return;
		this.dragging = true;
		this.dragPointerId = event.pointerId;
		this.dragX = event.clientX;
		this.dragY = event.clientY;
		this.canvas.setPointerCapture?.(event.pointerId);
	};

	private onPointerMove = (event: PointerEvent): void => {
		if (!this.dragging || event.pointerId !== this.dragPointerId) return;
		const deltaX = event.clientX - this.dragX;
		const deltaY = event.clientY - this.dragY;
		this.dragX = event.clientX;
		this.dragY = event.clientY;
		const preset = this.activePreset();
		this.desiredYaw = clamp(this.desiredYaw - deltaX * 0.006, preset.yaw - 0.82, preset.yaw + 0.82);
		this.desiredPitch = clamp(
			this.desiredPitch + deltaY * 0.0045,
			Math.max(0.06, preset.pitch - 0.44),
			Math.min(1.16, preset.pitch + 0.58)
		);
		this.callbacks.onManualCamera?.();
	};

	private onPointerUp = (event: PointerEvent): void => {
		if (this.dragPointerId !== null && event.pointerId !== this.dragPointerId) return;
		this.dragging = false;
		this.dragPointerId = null;
	};

	private onLostPointerCapture = (): void => {
		this.dragging = false;
		this.dragPointerId = null;
	};

	private onContextLost = (event: Event): void => {
		event.preventDefault();
		if (this.disposed) return;
		this.contextLost = true;
		this.callbacks.onStatus?.(
			'context-lost',
			'The WebGL 2 context was interrupted. Switch to the analytical view while it recovers.'
		);
	};

	private onContextRestored = (): void => {
		if (this.disposed) return;
		this.contextLost = false;
		this.cameraNeedsSnap = true;
		this.resize();
		this.updateScientificPresentation();
		this.callbacks.onStatus?.('ready', 'The three-dimensional nucleus view has been restored.');
	};
}

export function createNucleusRenderer(
	canvas: HTMLCanvasElement,
	options: NucleusRendererOptions = {}
): NucleusRenderer {
	return new ThreeNucleusRenderer(canvas, options);
}
