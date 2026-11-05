/** Browser-independent settings, 3D scene presets, camera math and distance estimators for Fractal Trip. */
export type FamilyId =
	| 'mandelbrot'
	| 'julia'
	| 'burning-ship'
	| 'tricorn'
	| 'newton'
	| 'mandelbulb'
	| 'mandelbox';
export type PaletteId = 'copper' | 'opal' | 'ultraviolet' | 'ember' | 'lagoon' | 'ink';
export type Quality = 'auto' | 'saver' | 'balanced' | 'high';
export type Scene3DId = 'copper-reef' | 'folded-cathedral' | 'alien-garden' | 'fractal-canyon';
export type CameraMode = 'free' | 'orbit';
export type Vec3 = readonly [number, number, number];

export interface Complex {
	re: number;
	im: number;
}

export interface Waypoint3D {
	readonly position: Vec3;
	readonly target: Vec3;
	readonly roll?: number;
	readonly fov?: number;
}

export interface Scene3DQualityLimits {
	readonly minIterations: number;
	readonly maxIterations: number;
	readonly minSteps: number;
	readonly maxSteps: number;
	readonly minClearance: number;
}

export interface Scene3DPreset {
	readonly id: Scene3DId;
	readonly name: string;
	readonly badge: string;
	readonly description: string;
	readonly family: 'mandelbulb' | 'mandelbox';
	readonly duration: number;
	readonly geometry: {
		readonly power: number;
		readonly bulbJulia: boolean;
		readonly seedRe: number;
		readonly seedIm: number;
		readonly seedZ: number;
		readonly foldScale: number;
		readonly foldLimit: number;
		readonly minRadius: number;
	};
	readonly material: {
		readonly palette: PaletteId;
		readonly relief: number;
		readonly roughness: number;
		readonly glow: number;
	};
	readonly lighting: {
		readonly lightAngle: number;
		readonly lightElevation: number;
		readonly haze: number;
	};
	readonly cameraStart: {
		readonly position: Vec3;
		readonly target: Vec3;
		readonly roll: number;
		readonly fov: number;
		readonly distance: number;
	};
	readonly path: readonly Waypoint3D[];
	readonly qualityLimits: Scene3DQualityLimits;
}

export interface FractalState {
	version: 1;
	family: FamilyId;
	sceneId: Scene3DId | null;
	power: number;
	seedRe: number;
	seedIm: number;
	seedZ: number;
	bulbJulia: boolean;
	roots: Complex[];
	relaxation: number;
	foldScale: number;
	foldLimit: number;
	minRadius: number;
	palette: PaletteId;
	relief: number;
	roughness: number;
	glow: number;
	lightAngle: number;
	speed: number;
	quality: Quality;
	centerRe: number;
	centerIm: number;
	span: number;
	rotation: number;
	yaw: number;
	pitch: number;
	roll: number;
	fov: number;
	distance: number;
	cameraPos: [number, number, number];
	cameraMode: CameraMode;
	journeyTime: number;
}

export const FAMILIES: readonly {
	id: FamilyId;
	name: string;
	kind: '2d' | '3d';
	description: string;
	formula: string;
}[] = [
	{
		id: 'mandelbulb',
		name: 'Mandelbulb',
		kind: '3d',
		description: 'Fly across three-dimensional ridges, layered growths, spires and deep cavities.',
		formula: 'vₙ₊₁ = sphericalPower(vₙ, p) + c'
	},
	{
		id: 'mandelbox',
		name: 'Mandelbox',
		kind: '3d',
		description:
			'Travel through folded architectural colonnades, vaulted passages and canyon walls.',
		formula: 'vₙ₊₁ = s · sphereFold(boxFold(vₙ)) + c'
	},
	{
		id: 'mandelbrot',
		name: 'Mandelbrot',
		kind: '2d',
		description: 'Zoom into branching coastlines. Power changes the number of lobes.',
		formula: 'zₙ₊₁ = zₙᵖ + c, z₀ = 0'
	},
	{
		id: 'julia',
		name: 'Julia',
		kind: '2d',
		description: 'Move the seed to reshape a whole field of spirals.',
		formula: 'zₙ₊₁ = zₙᵖ + c, z₀ = pixel'
	},
	{
		id: 'burning-ship',
		name: 'Burning Ship',
		kind: '2d',
		description: 'Fold both coordinates into towers and fine ridges.',
		formula: 'zₙ₊₁ = (|Re zₙ| + i|Im zₙ|)ᵖ + c'
	},
	{
		id: 'tricorn',
		name: 'Tricorn',
		kind: '2d',
		description: 'Conjugation turns the familiar boundary into a different family.',
		formula: 'zₙ₊₁ = conjugate(zₙ)ᵖ + c'
	},
	{
		id: 'newton',
		name: 'Newton',
		kind: '2d',
		description: 'Move roots and watch their coloured convergence regions meet.',
		formula: 'zₙ₊₁ = zₙ − λ f(zₙ)/f′(zₙ), f(z) = ∏(z − rⱼ)'
	}
];

export const PALETTES: readonly { id: PaletteId; name: string; colors: readonly string[] }[] = [
	{
		id: 'copper',
		name: 'Copper & cyan',
		colors: ['#071c28', '#177d8e', '#93e5dc', '#c7663b', '#ffdfac']
	},
	{ id: 'opal', name: 'Opal', colors: ['#11162e', '#7692c4', '#d0b8f0', '#b4ecdc', '#fff0ce'] },
	{
		id: 'ultraviolet',
		name: 'Ultraviolet',
		colors: ['#080b27', '#3532a0', '#a64dd8', '#f692cc', '#e5e8ff']
	},
	{ id: 'ember', name: 'Ember', colors: ['#160c14', '#682039', '#c34531', '#f49b4b', '#fff0b5'] },
	{ id: 'lagoon', name: 'Lagoon', colors: ['#061526', '#104a78', '#158f9b', '#78d9bc', '#e5f8d2'] },
	{ id: 'ink', name: 'Ink & gold', colors: ['#080d17', '#25364f', '#617483', '#c3974f', '#fce5a2'] }
];

export function paletteRGB(id: PaletteId): readonly (readonly [number, number, number])[] {
	const palette = PALETTES.find((entry) => entry.id === id) ?? PALETTES[0];
	return palette.colors.map(
		(hex) =>
			[
				parseInt(hex.slice(1, 3), 16) / 255,
				parseInt(hex.slice(3, 5), 16) / 255,
				parseInt(hex.slice(5, 7), 16) / 255
			] as const
	);
}

/** Hard state floor. minimumSpan additionally respects the actual float pixel grid. */
export const MIN_SPAN = 1e-4;
export const MAX_SPAN = 8;
export const MAX_ENCODED_STATE_LENGTH = 8192;
const TAU = 2 * Math.PI;

export function regularRoots(count: number): Complex[] {
	const n = Math.max(3, Math.min(6, Math.round(Number.isFinite(count) ? count : 3)));
	return Array.from({ length: n }, (_, index) => ({
		re: Math.cos((index * 2 * Math.PI) / n),
		im: Math.sin((index * 2 * Math.PI) / n)
	}));
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(min, Math.min(max, value))
		: fallback;
}

function angle(value: unknown, fallback: number): number {
	const result = finite(value, fallback, -1e6, 1e6);
	if (result >= 0 && result < TAU) return result;
	return ((result % TAU) + TAU) % TAU;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Convert a 3D look vector into yaw and pitch angles compatible with the shader basis. */
export function anglesFromDirection(forward: Vec3): { yaw: number; pitch: number } {
	const length = Math.hypot(forward[0], forward[1], forward[2]) || 1;
	const fx = forward[0] / length;
	const fy = forward[1] / length;
	const fz = forward[2] / length;
	const pitch = Math.max(-0.95, Math.min(0.95, Math.asin(Math.max(-1, Math.min(1, -fy)))));
	const yaw = angle(Math.atan2(-fx, -fz), 0);
	return { yaw, pitch };
}

/** Compute an orbit camera position from yaw, pitch and distance around an optional pivot. */
export function orbitPosition(
	yaw: number,
	pitch: number,
	distance: number,
	pivot: Vec3 = [0, 0, 0]
): [number, number, number] {
	const cp = Math.cos(pitch);
	return [
		pivot[0] + distance * cp * Math.sin(yaw),
		pivot[1] + distance * Math.sin(pitch),
		pivot[2] + distance * cp * Math.cos(yaw)
	];
}

/** Four deliberately composed, geometry-validated 3D fractal scenes. */
export const SCENES_3D: readonly Scene3DPreset[] = [
	{
		id: 'copper-reef',
		name: 'Copper Reef',
		badge: 'Mandelbulb · Power 8',
		description:
			'Mandelbulb ridges, layered growths and deep equatorial cavities in warm copper, cream and restrained gold.',
		family: 'mandelbulb',
		duration: 84,
		geometry: {
			power: 8,
			bulbJulia: false,
			seedRe: 0.2,
			seedIm: 0.1,
			seedZ: -0.2,
			foldScale: -1.8,
			foldLimit: 1.0,
			minRadius: 0.5
		},
		material: {
			palette: 'copper',
			relief: 0.86,
			roughness: 0.34,
			glow: 0.18
		},
		lighting: {
			lightAngle: 2.35,
			lightElevation: 0.68,
			haze: 0.022
		},
		cameraStart: {
			position: [0.68, 0.34, 1.02],
			target: [-0.14, 0.06, 0.22],
			roll: 0,
			fov: 54,
			distance: 1.6
		},
		path: [
			{ position: [0.68, 0.34, 1.02], target: [-0.14, 0.06, 0.22], roll: 0.0, fov: 54 },
			{ position: [0.28, 0.55, 1.1], target: [-0.28, 0.14, 0.16], roll: 0.05, fov: 52 },
			{ position: [-0.24, 0.58, 1.08], target: [-0.34, 0.04, 0.1], roll: 0.03, fov: 51 },
			{ position: [-0.72, 0.36, 0.98], target: [-0.2, -0.14, 0.14], roll: -0.04, fov: 54 },
			{ position: [-0.92, -0.06, 0.86], target: [0.06, -0.18, 0.16], roll: -0.06, fov: 50 },
			{ position: [-0.62, -0.42, 1.0], target: [0.22, -0.1, 0.2], roll: -0.02, fov: 53 },
			{ position: [0.04, -0.5, 1.12], target: [0.26, 0.04, 0.22], roll: 0.04, fov: 55 },
			{ position: [0.62, -0.18, 1.08], target: [0.1, 0.12, 0.24], roll: 0.02, fov: 54 }
		],
		qualityLimits: {
			minIterations: 12,
			maxIterations: 18,
			minSteps: 72,
			maxSteps: 136,
			minClearance: 0.045
		}
	},
	{
		id: 'folded-cathedral',
		name: 'Folded Cathedral',
		badge: 'Mandelbox · Architectural',
		description:
			'Carved Mandelbox passages, buttresses and nested architectural vaults revealed by grazing gold and slate light.',
		family: 'mandelbox',
		duration: 92,
		geometry: {
			power: 8,
			bulbJulia: false,
			seedRe: 0,
			seedIm: 0,
			seedZ: 0,
			foldScale: -1.75,
			foldLimit: 0.88,
			minRadius: 0.45
		},
		material: {
			palette: 'ink',
			relief: 0.78,
			roughness: 0.3,
			glow: 0.14
		},
		lighting: {
			lightAngle: 1.85,
			lightElevation: 0.54,
			haze: 0.019
		},
		cameraStart: {
			position: [1.24, 0.46, 1.94],
			target: [-0.35, 0.12, 0.55],
			roll: 0,
			fov: 56,
			distance: 2.15
		},
		path: [
			{ position: [1.24, 0.46, 1.94], target: [-0.35, 0.12, 0.55], roll: 0.0, fov: 56 },
			{ position: [0.4, 0.82, 1.86], target: [-0.55, 0.08, 0.45], roll: 0.04, fov: 54 },
			{ position: [-0.54, 0.76, 1.88], target: [-0.4, -0.25, 0.45], roll: 0.02, fov: 53 },
			{ position: [-1.28, 0.26, 1.96], target: [0.15, -0.35, 0.55], roll: -0.04, fov: 56 },
			{ position: [-1.22, -0.5, 1.98], target: [0.45, -0.15, 0.55], roll: -0.05, fov: 55 },
			{ position: [-0.36, -0.8, 1.86], target: [0.48, 0.22, 0.45], roll: -0.02, fov: 52 },
			{ position: [0.6, -0.7, 1.88], target: [0.15, 0.38, 0.48], roll: 0.03, fov: 54 },
			{ position: [1.3, -0.12, 2.0], target: [-0.18, 0.25, 0.55], roll: 0.02, fov: 56 }
		],
		qualityLimits: {
			minIterations: 12,
			maxIterations: 17,
			minSteps: 76,
			maxSteps: 140,
			minClearance: 0.045
		}
	},
	{
		id: 'alien-garden',
		name: 'Alien Garden',
		badge: '3D Julia · Branching',
		description:
			'A fixed three-dimensional Julia configuration with separated coral-like tendrils and strong foreground-to-background parallax.',
		family: 'mandelbulb',
		duration: 80,
		geometry: {
			power: 7,
			bulbJulia: true,
			seedRe: -0.22,
			seedIm: 0.64,
			seedZ: -0.26,
			foldScale: -1.8,
			foldLimit: 1.0,
			minRadius: 0.5
		},
		material: {
			palette: 'lagoon',
			relief: 0.82,
			roughness: 0.36,
			glow: 0.22
		},
		lighting: {
			lightAngle: 2.75,
			lightElevation: 0.72,
			haze: 0.024
		},
		cameraStart: {
			position: [0.8, 0.38, 0.98],
			target: [-0.16, 0.1, 0.04],
			roll: 0,
			fov: 54,
			distance: 1.6
		},
		path: [
			{ position: [0.8, 0.38, 0.98], target: [-0.16, 0.1, 0.04], roll: 0.0, fov: 54 },
			{ position: [0.26, 0.72, 0.96], target: [-0.24, 0.04, -0.08], roll: 0.06, fov: 52 },
			{ position: [-0.4, 0.64, 0.98], target: [-0.14, -0.14, -0.04], roll: 0.02, fov: 52 },
			{ position: [-0.88, 0.2, 0.88], target: [0.1, -0.16, 0.04], roll: -0.05, fov: 50 },
			{ position: [-0.76, -0.38, 0.96], target: [0.18, -0.04, 0.08], roll: -0.04, fov: 53 },
			{ position: [-0.18, -0.7, 0.98], target: [0.14, 0.14, 0.04], roll: 0.02, fov: 54 },
			{ position: [0.48, -0.54, 0.96], target: [-0.04, 0.16, -0.04], roll: 0.05, fov: 53 },
			{ position: [0.9, -0.06, 0.94], target: [-0.12, 0.14, 0.02], roll: 0.02, fov: 54 }
		],
		qualityLimits: {
			minIterations: 12,
			maxIterations: 18,
			minSteps: 72,
			maxSteps: 136,
			minClearance: 0.045
		}
	},
	{
		id: 'fractal-canyon',
		name: 'Fractal Canyon',
		badge: 'Mandelbox · Deep Gorge',
		description:
			'A close lengthwise flight along stratified canyon walls, sheer folds and deep terraced chasms.',
		family: 'mandelbox',
		duration: 88,
		geometry: {
			power: 8,
			bulbJulia: false,
			seedRe: 0,
			seedIm: 0,
			seedZ: 0,
			foldScale: -2.18,
			foldLimit: 0.96,
			minRadius: 0.26
		},
		material: {
			palette: 'ember',
			relief: 0.9,
			roughness: 0.4,
			glow: 0.16
		},
		lighting: {
			lightAngle: 0.85,
			lightElevation: 0.48,
			haze: 0.021
		},
		cameraStart: {
			position: [2.08, 1.32, 0.42],
			target: [0.45, -0.35, 0.55],
			roll: 0,
			fov: 58,
			distance: 2.34
		},
		path: [
			{ position: [2.08, 1.32, 0.42], target: [0.45, -0.35, 0.55], roll: 0.0, fov: 58 },
			{ position: [2.04, 0.48, 0.72], target: [0.38, -0.65, 0.15], roll: -0.05, fov: 56 },
			{ position: [2.06, -0.48, 0.64], target: [0.42, -0.55, -0.38], roll: -0.03, fov: 55 },
			{ position: [2.14, -1.32, 0.22], target: [0.48, 0.15, -0.52], roll: 0.04, fov: 58 },
			{ position: [2.16, -1.24, -0.48], target: [0.46, 0.58, -0.18], roll: 0.06, fov: 57 },
			{ position: [2.04, -0.38, -0.68], target: [0.4, 0.62, 0.35], roll: 0.02, fov: 54 },
			{ position: [2.06, 0.56, -0.54], target: [0.42, 0.18, 0.52], roll: -0.04, fov: 56 },
			{ position: [2.16, 1.38, -0.1], target: [0.46, -0.22, 0.48], roll: -0.02, fov: 58 }
		],
		qualityLimits: {
			minIterations: 12,
			maxIterations: 17,
			minSteps: 76,
			maxSteps: 140,
			minClearance: 0.05
		}
	}
];

export function scenePreset(id: Scene3DId): Scene3DPreset {
	return SCENES_3D.find((scene) => scene.id === id) ?? SCENES_3D[0];
}

const BASE_PLANAR_DEFAULTS = {
	centerRe: -0.743643887,
	centerIm: 0.131825904,
	span: 0.018,
	rotation: 0
} as const;

export function sceneToState(id: Scene3DId): FractalState {
	const scene = scenePreset(id);
	const dir: Vec3 = [
		scene.cameraStart.target[0] - scene.cameraStart.position[0],
		scene.cameraStart.target[1] - scene.cameraStart.position[1],
		scene.cameraStart.target[2] - scene.cameraStart.position[2]
	];
	const { yaw, pitch } = anglesFromDirection(dir);
	return {
		version: 1,
		family: scene.family,
		sceneId: scene.id,
		power: scene.geometry.power,
		seedRe: scene.geometry.seedRe,
		seedIm: scene.geometry.seedIm,
		seedZ: scene.geometry.seedZ,
		bulbJulia: scene.geometry.bulbJulia,
		roots: regularRoots(3),
		relaxation: 1,
		foldScale: scene.geometry.foldScale,
		foldLimit: scene.geometry.foldLimit,
		minRadius: scene.geometry.minRadius,
		palette: scene.material.palette,
		relief: scene.material.relief,
		roughness: scene.material.roughness,
		glow: scene.material.glow,
		lightAngle: scene.lighting.lightAngle,
		speed: 1,
		quality: 'auto',
		centerRe: BASE_PLANAR_DEFAULTS.centerRe,
		centerIm: BASE_PLANAR_DEFAULTS.centerIm,
		span: BASE_PLANAR_DEFAULTS.span,
		rotation: BASE_PLANAR_DEFAULTS.rotation,
		yaw,
		pitch,
		roll: scene.cameraStart.roll,
		fov: scene.cameraStart.fov,
		distance: scene.cameraStart.distance,
		cameraPos: [
			scene.cameraStart.position[0],
			scene.cameraStart.position[1],
			scene.cameraStart.position[2]
		],
		cameraMode: 'free',
		journeyTime: 0
	};
}

/** Open immediately on the flagship 3D Copper Reef composition on a fresh visit. */
export const DEFAULT_STATE: FractalState = sceneToState('copper-reef');

export function defaultForFamily(family: FamilyId): FractalState {
	if (family === 'mandelbulb') return sceneToState('copper-reef');
	if (family === 'mandelbox') return sceneToState('folded-cathedral');
	const base: FractalState = {
		...sceneToState('copper-reef'),
		family,
		sceneId: null,
		power: 2,
		seedRe: -0.8,
		seedIm: 0.156,
		seedZ: 0,
		bulbJulia: false,
		roots: regularRoots(3),
		relaxation: 1,
		foldScale: -1.8,
		foldLimit: 1,
		minRadius: 0.5,
		palette: 'copper',
		relief: 0.62,
		roughness: 0.4,
		glow: 0.15,
		lightAngle: 2.3,
		yaw: 0.4,
		pitch: 0.2,
		roll: 0,
		fov: 54,
		distance: 4.1,
		cameraPos: orbitPosition(0.4, 0.2, 4.1),
		cameraMode: 'orbit'
	};
	switch (family) {
		case 'julia':
			return { ...base, centerRe: 0, centerIm: 0, span: 3.2, palette: 'opal' };
		case 'burning-ship':
			return { ...base, centerRe: -1.76, centerIm: -0.035, span: 0.18, palette: 'ember' };
		case 'tricorn':
			return { ...base, centerRe: -0.25, centerIm: 0, span: 3.3, palette: 'ultraviolet' };
		case 'newton':
			return { ...base, centerRe: 0, centerIm: 0, span: 3.2, palette: 'lagoon', relief: 0.35 };
		default:
			return base;
	}
}

const families = new Set<string>(FAMILIES.map(({ id }) => id));
const palettes = new Set<string>(PALETTES.map(({ id }) => id));
const qualities = new Set<string>(['auto', 'saver', 'balanced', 'high']);
const sceneIds = new Set<string>(SCENES_3D.map(({ id }) => id));
const cameraModes = new Set<string>(['free', 'orbit']);

/** Copy only finite, bounded, known fields; URL data can never supply executable code. */
export function normalizeState(input: unknown): FractalState {
	if (!isRecord(input) || (input.version !== undefined && input.version !== 1)) {
		return sceneToState('copper-reef');
	}
	const family =
		typeof input.family === 'string' && families.has(input.family)
			? (input.family as FamilyId)
			: DEFAULT_STATE.family;
	const is3D = family === 'mandelbulb' || family === 'mandelbox';
	const requestedSceneId =
		is3D && typeof input.sceneId === 'string' && sceneIds.has(input.sceneId)
			? (input.sceneId as Scene3DId)
			: null;
	const state =
		requestedSceneId && scenePreset(requestedSceneId).family === family
			? sceneToState(requestedSceneId)
			: defaultForFamily(family);
	if (input.sceneId === null) state.sceneId = null;

	state.power = Math.round(finite(input.power, state.power, 2, family === 'mandelbulb' ? 10 : 8));
	state.seedRe = finite(input.seedRe, state.seedRe, -2, 2);
	state.seedIm = finite(input.seedIm, state.seedIm, -2, 2);
	state.seedZ = finite(input.seedZ, state.seedZ, -2, 2);
	state.bulbJulia = typeof input.bulbJulia === 'boolean' ? input.bulbJulia : state.bulbJulia;
	if (Array.isArray(input.roots) && input.roots.length >= 3 && input.roots.length <= 6) {
		const fallback = regularRoots(input.roots.length);
		state.roots = input.roots.map((value, index) =>
			isRecord(value)
				? {
						re: finite(value.re, fallback[index].re, -2, 2),
						im: finite(value.im, fallback[index].im, -2, 2)
					}
				: fallback[index]
		);
	}
	state.relaxation = finite(input.relaxation, state.relaxation, 0.25, 1.5);
	state.foldScale = finite(input.foldScale, state.foldScale, -2.5, -1.2);
	state.foldLimit = finite(input.foldLimit, state.foldLimit, 0.5, 1.5);
	state.minRadius = finite(input.minRadius, state.minRadius, 0.2, 0.8);
	state.palette =
		typeof input.palette === 'string' && palettes.has(input.palette)
			? (input.palette as PaletteId)
			: state.palette;
	state.relief = finite(input.relief, state.relief, 0, 1.5);
	state.roughness = finite(input.roughness, state.roughness, 0.1, 1);
	state.glow = finite(input.glow, state.glow, 0, 1);
	state.lightAngle = angle(input.lightAngle, state.lightAngle);
	state.speed = finite(input.speed, state.speed, 0.1, 2.0);
	state.quality =
		typeof input.quality === 'string' && qualities.has(input.quality)
			? (input.quality as Quality)
			: state.quality;
	state.centerRe = finite(input.centerRe, state.centerRe, -4, 4);
	state.centerIm = finite(input.centerIm, state.centerIm, -4, 4);
	state.span = finite(input.span, state.span, MIN_SPAN, MAX_SPAN);
	state.rotation = angle(input.rotation, state.rotation);
	state.yaw = angle(input.yaw, state.yaw);
	state.pitch = finite(input.pitch, state.pitch, -0.95, 0.95);
	state.roll = finite(input.roll, state.roll, -0.6, 0.6);
	state.fov = finite(input.fov, state.fov, 32, 78);
	state.distance = finite(input.distance, state.distance, 1.5, 8);
	state.cameraMode =
		typeof input.cameraMode === 'string' && cameraModes.has(input.cameraMode)
			? (input.cameraMode as CameraMode)
			: state.cameraMode;
	if (Array.isArray(input.cameraPos) && input.cameraPos.length === 3) {
		state.cameraPos = [
			finite(input.cameraPos[0], state.cameraPos[0], -10, 10),
			finite(input.cameraPos[1], state.cameraPos[1], -10, 10),
			finite(input.cameraPos[2], state.cameraPos[2], -10, 10)
		];
	} else if (input.yaw !== undefined || input.pitch !== undefined || input.distance !== undefined) {
		// Legacy v1 state without explicit cameraPos: derive orbit position looking at origin.
		state.cameraPos = orbitPosition(state.yaw, state.pitch, state.distance);
		if (input.cameraMode === undefined) state.cameraMode = 'orbit';
	}
	state.journeyTime = finite(input.journeyTime, state.journeyTime, 0, 3600);
	return state;
}

export function encodeState(state: FractalState): string {
	// Normalization leaves only ASCII keys, identifiers, booleans and numbers.
	return btoa(JSON.stringify(normalizeState(state)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}

export function decodeState(value: string | null): FractalState | null {
	if (!value || value.length > MAX_ENCODED_STATE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value))
		return null;
	try {
		const raw: unknown = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
		if (
			!isRecord(raw) ||
			raw.version !== 1 ||
			typeof raw.family !== 'string' ||
			!families.has(raw.family)
		)
			return null;
		return normalizeState(raw);
	} catch {
		return null;
	}
}

/** Orthonormal 3D camera basis for both GPU ray generation and CPU frustum clearance checks. */
export function cameraBasis(state: FractalState): {
	position: [number, number, number];
	forward: [number, number, number];
	right: [number, number, number];
	up: [number, number, number];
	fovScale: number;
} {
	const cp = Math.cos(state.pitch);
	const forward: [number, number, number] = [
		-cp * Math.sin(state.yaw),
		-Math.sin(state.pitch),
		-cp * Math.cos(state.yaw)
	];
	const fLen = Math.hypot(forward[0], forward[1], forward[2]) || 1;
	forward[0] /= fLen;
	forward[1] /= fLen;
	forward[2] /= fLen;

	// Cross(forward, worldUp=[0,1,0]) = [-forward.z, 0, forward.x]
	let rx = -forward[2];
	let ry = 0;
	let rz = forward[0];
	const rLen = Math.hypot(rx, ry, rz) || 1;
	rx /= rLen;
	rz /= rLen;

	// Cross(right, forward)
	let ux = ry * forward[2] - rz * forward[1];
	let uy = rz * forward[0] - rx * forward[2];
	let uz = rx * forward[1] - ry * forward[0];
	const uLen = Math.hypot(ux, uy, uz) || 1;
	ux /= uLen;
	uy /= uLen;
	uz /= uLen;

	if (Math.abs(state.roll) > 1e-5) {
		const cr = Math.cos(state.roll);
		const sr = Math.sin(state.roll);
		const nrx = rx * cr + ux * sr;
		const nry = ry * cr + uy * sr;
		const nrz = rz * cr + uz * sr;
		ux = ux * cr - rx * sr;
		uy = uy * cr - ry * sr;
		uz = uz * cr - rz * sr;
		rx = nrx;
		ry = nry;
		rz = nrz;
	}

	const fovScale = 1 / Math.tan((finite(state.fov, 54, 32, 78) * Math.PI) / 360);
	return {
		position: [...state.cameraPos],
		forward,
		right: [rx, ry, rz],
		up: [ux, uy, uz],
		fovScale
	};
}

/** CPU reference for 3D Mandelbulb / 3D Julia / Mandelbox distance estimation and path validation. */
export function estimateDistance3D(
	state: FractalState,
	point: Vec3,
	maxIterations = 16
): { distance: number; orbit: number; escaped: boolean } {
	const limit = Math.max(4, Math.min(24, Math.round(maxIterations)));
	let zx = point[0];
	let zy = point[1];
	let zz = point[2];
	let dr = 1.0;
	let orbit = 1e5;

	if (state.family === 'mandelbulb') {
		const cx = state.bulbJulia ? state.seedRe : point[0];
		const cy = state.bulbJulia ? state.seedIm : point[1];
		const cz = state.bulbJulia ? state.seedZ : point[2];
		const power = Math.round(finite(state.power, 8, 2, 10));
		for (let i = 0; i < limit; i++) {
			const r = Math.hypot(zx, zy, zz);
			orbit = Math.min(orbit, Math.hypot(zx, zy));
			if (r > 8.0) break;
			const safeR = Math.max(r, 1e-6);
			const theta = Math.acos(Math.max(-1, Math.min(1, zz / safeR))) * power;
			const phi = Math.atan2(zy, zx) * power;
			const rp = Math.pow(safeR, power - 1);
			dr = rp * power * dr + (state.bulbJulia ? 0.0 : 1.0);
			const zr = rp * safeR;
			const sinTheta = Math.sin(theta);
			zx = zr * sinTheta * Math.cos(phi) + cx;
			zy = zr * sinTheta * Math.sin(phi) + cy;
			zz = zr * Math.cos(theta) + cz;
		}
		const finalR = Math.max(Math.hypot(zx, zy, zz), 1e-6);
		const escaped = finalR > 2.0;
		const distance = escaped
			? Math.max(0, (0.5 * Math.log(finalR) * finalR) / Math.max(dr, 1e-6))
			: 0;
		return { distance, orbit, escaped };
	}

	const foldLimit = finite(state.foldLimit, 1.0, 0.5, 1.5);
	const foldScale = finite(state.foldScale, -1.8, -2.5, -1.2);
	const minRadius = finite(state.minRadius, 0.5, 0.2, 0.8);
	const minR2 = minRadius * minRadius;
	for (let i = 0; i < limit; i++) {
		zx = Math.max(-foldLimit, Math.min(foldLimit, zx)) * 2 - zx;
		zy = Math.max(-foldLimit, Math.min(foldLimit, zy)) * 2 - zy;
		zz = Math.max(-foldLimit, Math.min(foldLimit, zz)) * 2 - zz;
		const r2 = zx * zx + zy * zy + zz * zz;
		const factor = r2 < minR2 ? 1 / minR2 : r2 < 1 ? 1 / Math.max(r2, 1e-6) : 1;
		zx *= factor;
		zy *= factor;
		zz *= factor;
		dr *= factor;
		zx = zx * foldScale + point[0];
		zy = zy * foldScale + point[1];
		zz = zz * foldScale + point[2];
		dr = dr * Math.abs(foldScale) + 1;
		orbit = Math.min(orbit, Math.hypot(zx, zy, zz));
	}
	const r = Math.hypot(zx, zy, zz);
	const distance = r / Math.max(Math.abs(dr), 1e-6);
	return { distance, orbit, escaped: r > 1.5 && distance > 0.008 };
}

/** Check conservative clearance around the camera and its near-plane frustum footprint. */
export function checkCameraClearance(
	state: FractalState,
	aspect = 16 / 9,
	nearDist = 0.022
): { minDistance: number; centerDistance: number; escaped: boolean; clear: boolean } {
	const basis = cameraBasis(state);
	const ratio = finite(aspect, 16 / 9, 0.25, 4);
	const halfH = nearDist / basis.fovScale;
	const halfW = halfH * ratio;
	const center = estimateDistance3D(state, basis.position);
	let minDistance = center.distance;
	let escaped = center.escaped;

	for (const sx of [-1, 0, 1]) {
		for (const sy of [-1, 0, 1]) {
			const corner: Vec3 = [
				basis.position[0] +
					basis.forward[0] * nearDist +
					basis.right[0] * (sx * halfW) +
					basis.up[0] * (sy * halfH),
				basis.position[1] +
					basis.forward[1] * nearDist +
					basis.right[1] * (sx * halfW) +
					basis.up[1] * (sy * halfH),
				basis.position[2] +
					basis.forward[2] * nearDist +
					basis.right[2] * (sx * halfW) +
					basis.up[2] * (sy * halfH)
			];
			const sample = estimateDistance3D(state, corner);
			minDistance = Math.min(minDistance, sample.distance);
			if (!sample.escaped) escaped = false;
		}
	}
	return {
		minDistance,
		centerDistance: center.distance,
		escaped,
		clear: escaped && minDistance >= 0.022
	};
}

/** Rotate 3D camera orientation in place (free-look). */
export function lookCamera3D(state: FractalState, dYaw: number, dPitch: number): FractalState {
	const base = normalizeState(state);
	return normalizeState({
		...base,
		cameraMode: 'free',
		yaw: angle(base.yaw + finite(dYaw, 0, -TAU, TAU), base.yaw),
		pitch: finite(base.pitch + finite(dPitch, 0, -2, 2), base.pitch, -0.95, 0.95)
	});
}

/** Orbit 3D camera around the current look focus point. */
export function orbitCamera3D(
	state: FractalState,
	dYaw: number,
	dPitch: number,
	distanceFactor = 1
): FractalState {
	const base = normalizeState(state);
	const basis = cameraBasis(base);
	const pivot: Vec3 = [
		Math.max(-2.5, Math.min(2.5, basis.position[0] + basis.forward[0] * base.distance)),
		Math.max(-2.5, Math.min(2.5, basis.position[1] + basis.forward[1] * base.distance)),
		Math.max(-2.5, Math.min(2.5, basis.position[2] + basis.forward[2] * base.distance))
	];
	const nextYaw = angle(base.yaw + finite(dYaw, 0, -TAU, TAU), base.yaw);
	const nextPitch = finite(base.pitch + finite(dPitch, 0, -2, 2), base.pitch, -0.95, 0.95);
	const nextDistance = finite(
		base.distance * finite(distanceFactor, 1, 0.5, 2),
		base.distance,
		1.5,
		8
	);
	const candidatePos = orbitPosition(nextYaw, nextPitch, nextDistance, pivot);
	const candidate = normalizeState({
		...base,
		cameraMode: 'orbit',
		yaw: nextYaw,
		pitch: nextPitch,
		distance: nextDistance,
		cameraPos: candidatePos
	});
	// Maintain conservative clearance if orbiting close to a surface.
	const check = estimateDistance3D(candidate, candidate.cameraPos);
	if (check.distance < 0.028) {
		const safeDist = Math.min(8, nextDistance + 0.08);
		return normalizeState({
			...candidate,
			distance: safeDist,
			cameraPos: orbitPosition(nextYaw, nextPitch, safeDist, pivot)
		});
	}
	return candidate;
}

/** Translate 3D camera in free-flight along its local forward, right and up axes with clearance protection. */
export function moveCamera3D(
	state: FractalState,
	forwardDelta: number,
	rightDelta: number,
	upDelta: number
): FractalState {
	const base = normalizeState(state);
	const basis = cameraBasis(base);
	const currentDe = estimateDistance3D(base, basis.position).distance;
	const scale = Math.max(0.06, Math.min(1.0, currentDe * 1.15));
	const f = finite(forwardDelta, 0, -2, 2) * scale;
	const r = finite(rightDelta, 0, -2, 2) * scale;
	const u = finite(upDelta, 0, -2, 2) * scale;
	const nextPos: [number, number, number] = [
		basis.position[0] + basis.forward[0] * f + basis.right[0] * r + basis.up[0] * u,
		basis.position[1] + basis.forward[1] * f + basis.right[1] * r + basis.up[1] * u,
		basis.position[2] + basis.forward[2] * f + basis.right[2] * r + basis.up[2] * u
	];
	const nextDe = estimateDistance3D(base, nextPos).distance;
	if (nextDe < 0.022 && nextDe < currentDe) {
		return base;
	}
	return normalizeState({
		...base,
		cameraMode: 'free',
		cameraPos: nextPos
	});
}

/** Conservative spacing for a highp float shader, separate from the serialisation floor. */
export function minimumSpan(state: FractalState, renderHeight = 720): number {
	const height = finite(renderHeight, 720, 1, 4096);
	const magnitude = Math.max(1, Math.abs(state.centerRe), Math.abs(state.centerIm));
	return Math.max(MIN_SPAN, 4 * 2 ** -23 * magnitude * height);
}

export function pointAt(
	state: FractalState,
	xNormalized: number,
	yNormalized: number,
	aspect: number
): Complex {
	const ratio = finite(aspect, 1, 0.1, 10);
	const x = (finite(xNormalized, 0.5, 0, 1) - 0.5) * state.span * ratio;
	const y = (0.5 - finite(yNormalized, 0.5, 0, 1)) * state.span;
	const cosine = Math.cos(state.rotation);
	const sine = Math.sin(state.rotation);
	return { re: state.centerRe + x * cosine - y * sine, im: state.centerIm + x * sine + y * cosine };
}

/** factor < 1 zooms in, preserving the complex point under a top-left-origin pointer. */
export function zoomAt(
	state: FractalState,
	xNormalized: number,
	yNormalized: number,
	factor: number,
	aspect: number
): FractalState {
	const base = normalizeState(state);
	const before = pointAt(base, xNormalized, yNormalized, aspect);
	const next = {
		...base,
		span: finite(base.span * finite(factor, 1, 0.05, 20), base.span, MIN_SPAN, MAX_SPAN)
	};
	const after = pointAt(next, xNormalized, yNormalized, aspect);
	return normalizeState({
		...next,
		centerRe: next.centerRe + before.re - after.re,
		centerIm: next.centerIm + before.im - after.im
	});
}

/** Positive deltas are the pointer's screen movement: the picture follows the hand. */
export function panView(
	state: FractalState,
	dxNormalized: number,
	dyNormalized: number,
	aspect: number
): FractalState {
	const base = normalizeState(state);
	const ratio = finite(aspect, 1, 0.1, 10);
	const x = finite(dxNormalized, 0, -2, 2) * base.span * ratio;
	const y = -finite(dyNormalized, 0, -2, 2) * base.span;
	return normalizeState({
		...base,
		centerRe: base.centerRe - x * Math.cos(base.rotation) + y * Math.sin(base.rotation),
		centerIm: base.centerIm - x * Math.sin(base.rotation) - y * Math.cos(base.rotation)
	});
}

export const PRESETS: readonly {
	id: string;
	name: string;
	description: string;
	family: FamilyId;
	state: FractalState;
}[] = [
	...SCENES_3D.map((scene) => ({
		id: scene.id,
		name: scene.name,
		description: scene.description,
		family: scene.family,
		state: sceneToState(scene.id)
	})),
	{
		id: 'copper-coast',
		name: 'Copper coast',
		description: 'Fine Mandelbrot filaments in copper and cyan.',
		family: 'mandelbrot',
		state: defaultForFamily('mandelbrot')
	},
	{
		id: 'whole-set',
		name: 'The whole set',
		description: 'Start with the familiar Mandelbrot outline.',
		family: 'mandelbrot',
		state: { ...defaultForFamily('mandelbrot'), centerRe: -0.5, centerIm: 0, span: 2.8 }
	},
	{
		id: 'cubic',
		name: 'Cubic',
		description: 'A cubic Multibrot with a different arrangement of lobes.',
		family: 'mandelbrot',
		state: {
			...defaultForFamily('mandelbrot'),
			power: 3,
			centerRe: 0,
			centerIm: 0,
			span: 3,
			palette: 'ultraviolet'
		}
	},
	{
		id: 'julia-lace',
		name: 'Julia lace',
		description: 'A fixed seed makes branching Julia forms.',
		family: 'julia',
		state: defaultForFamily('julia')
	},
	{
		id: 'ember-ridges',
		name: 'Ember ridges',
		description: 'Explore the folded edge of the Burning Ship.',
		family: 'burning-ship',
		state: defaultForFamily('burning-ship')
	},
	{
		id: 'tricorn',
		name: 'Three corners',
		description: 'The conjugate quadratic family.',
		family: 'tricorn',
		state: defaultForFamily('tricorn')
	},
	{
		id: 'root-garden',
		name: 'Root garden',
		description: 'Three roots divide the plane into coloured basins.',
		family: 'newton',
		state: defaultForFamily('newton')
	}
];

/** Stay near curated settings; mutation never changes the selected equation family. */
export function varyState(state: FractalState, random: () => number = Math.random): FractalState {
	const base = normalizeState(state);
	const sample = () => finite(random(), 0.5, 0, 0.999999);
	const next = {
		...base,
		palette: PALETTES[Math.floor(sample() * PALETTES.length)].id,
		lightAngle: sample() * TAU,
		relief: 0.3 + sample() * 0.65
	};
	if (base.family === 'julia') {
		const seeds = [
			[-0.8, 0.156],
			[-0.7269, 0.1889],
			[-0.4, 0.6],
			[0.285, 0.01]
		];
		const seed = seeds[Math.floor(sample() * seeds.length)];
		next.seedRe = seed[0];
		next.seedIm = seed[1];
		next.centerRe = 0;
		next.centerIm = 0;
		next.span = 3.2;
	} else if (base.family === 'newton') {
		next.roots = regularRoots(3 + Math.floor(sample() * 4));
		next.relaxation = 0.8 + sample() * 0.35;
	} else if (base.family === 'mandelbulb') {
		next.power = 5 + Math.floor(sample() * 5);
		next.lightAngle = sample() * TAU;
	} else if (base.family === 'mandelbox') {
		next.foldScale = -1.7 - sample() * 0.45;
		next.minRadius = 0.28 + sample() * 0.22;
		next.lightAngle = sample() * TAU;
	} else {
		next.rotation = sample() * TAU;
	}
	return normalizeState(next);
}

function multiply(a: Complex, b: Complex): Complex {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function integerPower(z: Complex, power: number): Complex {
	let result: Complex = { re: 1, im: 0 };
	for (let i = 0; i < power; i++) result = multiply(result, z);
	return result;
}

/** Small CPU reference for tests and meaningful numerical checks, never a full-frame renderer. */
export function iterate2D(
	state: FractalState,
	point: Complex,
	limit = 128
): {
	value: Complex;
	iterations: number;
	escaped: boolean;
	converged: boolean;
	rootIndex: number | null;
} {
	const settings = normalizeState(state);
	const maximum = Math.round(finite(limit, 128, 1, 4096));
	let z =
		settings.family === 'julia' || settings.family === 'newton' ? { ...point } : { re: 0, im: 0 };
	const c = settings.family === 'julia' ? { re: settings.seedRe, im: settings.seedIm } : point;
	if (settings.family === 'mandelbulb' || settings.family === 'mandelbox')
		throw new Error('iterate2D requires a planar family.');
	for (let iteration = 0; iteration < maximum; iteration++) {
		if (settings.family === 'newton') {
			const rootIndex = settings.roots.findIndex(
				(root) => Math.hypot(z.re - root.re, z.im - root.im) < 1e-6
			);
			if (rootIndex !== -1)
				return { value: z, iterations: iteration, escaped: false, converged: true, rootIndex };
			let f: Complex = { re: 1, im: 0 };
			let derivative: Complex = { re: 0, im: 0 };
			for (const root of settings.roots) {
				const factor = { re: z.re - root.re, im: z.im - root.im };
				const product = multiply(derivative, factor);
				derivative = { re: product.re + f.re, im: product.im + f.im };
				f = multiply(f, factor);
			}
			const denominator = derivative.re ** 2 + derivative.im ** 2;
			if (denominator < 1e-20)
				return {
					value: z,
					iterations: iteration,
					escaped: false,
					converged: false,
					rootIndex: null
				};
			z = {
				re:
					z.re -
					(settings.relaxation * (f.re * derivative.re + f.im * derivative.im)) / denominator,
				im:
					z.im - (settings.relaxation * (f.im * derivative.re - f.re * derivative.im)) / denominator
			};
		} else {
			if (settings.family === 'burning-ship') z = { re: Math.abs(z.re), im: Math.abs(z.im) };
			if (settings.family === 'tricorn') z = { re: z.re, im: -z.im };
			const powered = integerPower(z, settings.power);
			z = { re: powered.re + c.re, im: powered.im + c.im };
		}
		if (!Number.isFinite(z.re) || !Number.isFinite(z.im) || z.re ** 2 + z.im ** 2 > 256) {
			return {
				value: z,
				iterations: iteration + 1,
				escaped: true,
				converged: false,
				rootIndex: null
			};
		}
	}
	return { value: z, iterations: maximum, escaped: false, converged: false, rootIndex: null };
}
