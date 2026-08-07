import {
	DEFAULT_INVISIBLE_WEATHER_STATE,
	MAX_ARTWORK_COUNT,
	MAX_PATH_DENSITY,
	MAX_PATH_LENGTH,
	MIN_ARTWORK_COUNT,
	MIN_PATH_DENSITY,
	MIN_PATH_LENGTH
} from './defaults';
import { sampleField } from './field';
import { deriveSubseed, hashValue } from './hash';
import { createLayout } from './layouts';
import { choosePalettePair, getPalette, PALETTE_FAMILIES } from './palettes';
import { PRESETS, getPreset } from './presets';
import { SeededRandom } from './prng';
import type {
	AngleMode,
	ArtworkRecipe,
	ExhibitionRecipe,
	InvisibleWeatherState,
	LayoutId,
	MaskKind,
	MotionMode,
	NoiseMode,
	OrientationPreference,
	ThresholdMode
} from './types';

const LAYOUTS = new Set<LayoutId>([
	'quiet-grid',
	'salon-wall',
	'cabinet',
	'triptych',
	'procession'
]);
const ANGLES = new Set<AngleMode>([
	'free',
	'orthogonal',
	'diagonal',
	'hexagonal',
	'alternating',
	'soft'
]);
const THRESHOLDS = new Set<ThresholdMode>(['off', 'river', 'islands', 'delta']);
const MOTIONS = new Set<MotionMode>(['still', 'breathe', 'migrate']);
const NOISE_MODES = new Set<NoiseMode>(['value', 'gradient']);
const ORIENTATIONS = new Set<OrientationPreference>(['auto', 'portrait', 'landscape']);
export const FRAME_FAMILIES = [
	'quiet-wood',
	'oxidised-brass',
	'limewash',
	'white-oak',
	'indigo-black',
	'dark-jute',
	'black-lacquer'
] as const;

export const MASK_FAMILY = [
	'rectangle',
	'arch',
	'oval',
	'stepped-niche',
	'offset-diptych',
	'quadrilateral',
	'split-horizontal',
	'three-window',
	'river-band'
] as const satisfies readonly MaskKind[];

const MASK_POOLS: Readonly<Record<LayoutId, readonly MaskKind[]>> = {
	'quiet-grid': ['rectangle', 'arch', 'oval', 'split-horizontal', 'stepped-niche'],
	'salon-wall': ['rectangle', 'arch', 'oval', 'quadrilateral', 'offset-diptych', 'stepped-niche'],
	cabinet: ['rectangle', 'oval', 'split-horizontal', 'three-window', 'stepped-niche'],
	triptych: ['rectangle', 'arch', 'oval', 'quadrilateral'],
	procession: ['rectangle', 'arch', 'quadrilateral', 'split-horizontal', 'river-band']
};

const LOCAL_ANGLE_GRAMMARS: Readonly<Record<string, readonly AngleMode[]>> = {
	'monsoon-ledger': ['free', 'diagonal', 'free', 'soft', 'diagonal', 'alternating'],
	'orthogonal-arguments': ['orthogonal'],
	'river-between-walls': ['free', 'soft', 'diagonal', 'hexagonal', 'alternating', 'orthogonal'],
	'nine-quiet-rooms': ['free', 'free', 'soft', 'free', 'diagonal', 'free'],
	'salon-after-closing': ['soft', 'free', 'hexagonal', 'soft', 'diagonal', 'alternating'],
	'cabinet-of-crosswinds': ['alternating', 'orthogonal', 'diagonal', 'hexagonal', 'soft'],
	'three-large-silences': ['free', 'soft', 'free']
};

const LOCAL_THRESHOLD_MODES: Readonly<Record<string, readonly ThresholdMode[]>> = {
	'monsoon-ledger': ['river', 'river', 'delta', 'river', 'islands', 'river', 'off'],
	'orthogonal-arguments': ['delta', 'off', 'delta', 'river'],
	'river-between-walls': ['river', 'river', 'delta', 'river'],
	'nine-quiet-rooms': ['river', 'off', 'river', 'river', 'off'],
	'salon-after-closing': ['islands', 'river', 'islands', 'delta'],
	'cabinet-of-crosswinds': ['delta', 'islands', 'delta', 'river'],
	'three-large-silences': ['off']
};

const LOCAL_DEPTH_OFFSETS: Readonly<Record<string, readonly number[]>> = {
	'monsoon-ledger': [0, -1, 0, 1, 0, -1],
	'orthogonal-arguments': [0, 0, 1, -1],
	'river-between-walls': [0, -1, 0, -2],
	'nine-quiet-rooms': [0, 0, 1, -1, 0],
	'salon-after-closing': [0, 1, -1, 0],
	'cabinet-of-crosswinds': [0, -1, -2, 0],
	'three-large-silences': [0, -1, 0]
};

function curatedMaskSubset(state: InvisibleWeatherState): readonly MaskKind[] {
	const pool = MASK_POOLS[state.layout];
	const requested = state.layout === 'triptych' ? 3 : state.layout === 'cabinet' ? 4 : 5;
	const random = new SeededRandom(`${state.seed}:${state.layout}:${state.presetId}:mask-curation`);
	const shuffled = random.shuffle(pool);
	const subset = shuffled.slice(0, Math.min(requested, shuffled.length));
	return subset.length > 0 ? subset : ['rectangle'];
}

function presetDefault<T extends keyof InvisibleWeatherState>(
	state: InvisibleWeatherState,
	key: T
): InvisibleWeatherState[T] {
	const presetState = getPreset(state.presetId).state as Partial<InvisibleWeatherState>;
	const presetValue = presetState[key];
	return (presetValue ?? DEFAULT_INVISIBLE_WEATHER_STATE[key]) as InvisibleWeatherState[T];
}

function localAngleMode(state: InvisibleWeatherState, index: number): AngleMode {
	if (state.angleMode !== presetDefault(state, 'angleMode')) return state.angleMode;
	if (state.layout === 'procession') {
		const progression: readonly AngleMode[] = [
			'free',
			'soft',
			'diagonal',
			'hexagonal',
			'alternating',
			'orthogonal'
		];
		return progression[
			Math.round((index / Math.max(1, state.artworkCount - 1)) * (progression.length - 1))
		];
	}
	const family = LOCAL_ANGLE_GRAMMARS[state.presetId] ?? [state.angleMode];
	return family[index % family.length] ?? state.angleMode;
}

function localThresholdMode(state: InvisibleWeatherState, index: number): ThresholdMode {
	if (state.thresholdMode !== presetDefault(state, 'thresholdMode')) return state.thresholdMode;
	const family = LOCAL_THRESHOLD_MODES[state.presetId] ?? [state.thresholdMode];
	return family[index % family.length] ?? state.thresholdMode;
}

function localDepth(state: InvisibleWeatherState, index: number): 1 | 2 | 3 | 4 {
	if (state.depth !== presetDefault(state, 'depth')) return state.depth;
	const offsets = LOCAL_DEPTH_OFFSETS[state.presetId] ?? [0];
	return Math.max(1, Math.min(4, state.depth + (offsets[index % offsets.length] ?? 0))) as
		| 1
		| 2
		| 3
		| 4;
}

function transformedSamplePoint(transform: ArtworkRecipe['localTransform'], x: number, y: number) {
	let localX = (x - 0.5 - transform.offsetX) / transform.scaleX;
	const localY = (y - 0.5 - transform.offsetY) / transform.scaleY;
	if (transform.mirrorX) localX *= -1;
	const cosine = Math.cos(-transform.rotation);
	const sine = Math.sin(-transform.rotation);
	return {
		x: localX * cosine - localY * sine + 0.5,
		y: localX * sine + localY * cosine + 0.5
	};
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(minimum, Math.min(maximum, value))
		: fallback;
}

function boundedString(value: unknown, fallback: string, maximum = 96): string {
	if (typeof value !== 'string') return fallback;
	const normalized = value.trim().slice(0, maximum);
	return normalized || fallback;
}

export function normalizeGalleryState(
	input: Partial<InvisibleWeatherState> | null | undefined
): InvisibleWeatherState {
	const fallback = DEFAULT_INVISIBLE_WEATHER_STATE;
	const source = input ?? {};
	const layout = LAYOUTS.has(source.layout as LayoutId)
		? (source.layout as LayoutId)
		: fallback.layout;
	let artworkCount = Math.round(
		finite(source.artworkCount, fallback.artworkCount, MIN_ARTWORK_COUNT, MAX_ARTWORK_COUNT)
	);
	if (layout === 'triptych') artworkCount = 3;
	const paletteId = PALETTE_FAMILIES.some((palette) => palette.id === source.paletteId)
		? (source.paletteId as string)
		: fallback.paletteId;
	const presetId = PRESETS.some((preset) => preset.id === source.presetId)
		? (source.presetId as string)
		: fallback.presetId;
	const selectedArtwork = Math.round(
		finite(source.selectedArtwork, fallback.selectedArtwork, 0, artworkCount - 1)
	);
	const frozenPhase =
		source.frozenPhase === null || source.frozenPhase === undefined
			? null
			: finite(source.frozenPhase, 0, 0, 1_000_000);
	return {
		version: 1,
		seed: boundedString(source.seed, fallback.seed),
		presetId,
		layout,
		artworkCount,
		paletteId,
		noiseMode: NOISE_MODES.has(source.noiseMode as NoiseMode)
			? (source.noiseMode as NoiseMode)
			: fallback.noiseMode,
		depth: Math.round(finite(source.depth, fallback.depth, 1, 4)) as 1 | 2 | 3 | 4,
		frequency: finite(source.frequency, fallback.frequency, 0.05, 12),
		warpStrength: finite(source.warpStrength, fallback.warpStrength, 0, 2),
		angleMode: ANGLES.has(source.angleMode as AngleMode)
			? (source.angleMode as AngleMode)
			: fallback.angleMode,
		softness: finite(source.softness, fallback.softness, 0, 1),
		thresholdMode: THRESHOLDS.has(source.thresholdMode as ThresholdMode)
			? (source.thresholdMode as ThresholdMode)
			: fallback.thresholdMode,
		thresholdWidth: finite(source.thresholdWidth, fallback.thresholdWidth, 0.005, 0.35),
		motion: MOTIONS.has(source.motion as MotionMode)
			? (source.motion as MotionMode)
			: fallback.motion,
		phase: finite(source.phase, fallback.phase, 0, 1_000_000),
		frozenPhase,
		selectedArtwork,
		pathDensity: finite(
			source.pathDensity,
			fallback.pathDensity,
			MIN_PATH_DENSITY,
			MAX_PATH_DENSITY
		),
		pathLength: Math.round(
			finite(source.pathLength, fallback.pathLength, MIN_PATH_LENGTH, MAX_PATH_LENGTH)
		),
		multiplier: finite(source.multiplier, fallback.multiplier, 0.25, 4),
		turns: finite(source.turns, fallback.turns, 0.1, 8),
		strokeWidth: finite(source.strokeWidth, fallback.strokeWidth, 0.25, 4),
		dualInk: typeof source.dualInk === 'boolean' ? source.dualInk : fallback.dualInk,
		grain: finite(source.grain, fallback.grain, 0, 1),
		shadow: finite(source.shadow, fallback.shadow, 0, 1),
		frameFamily: FRAME_FAMILIES.includes(source.frameFamily as (typeof FRAME_FAMILIES)[number])
			? (source.frameFamily as string)
			: fallback.frameFamily,
		orientation: ORIENTATIONS.has(source.orientation as OrientationPreference)
			? (source.orientation as OrientationPreference)
			: fallback.orientation,
		speed: finite(source.speed, fallback.speed, 0, 4)
	};
}

export function stateForPreset(id: string, seed?: string): InvisibleWeatherState {
	const preset = getPreset(id);
	return normalizeGalleryState({
		...DEFAULT_INVISIBLE_WEATHER_STATE,
		...preset.state,
		presetId: preset.id,
		seed: seed ?? DEFAULT_INVISIBLE_WEATHER_STATE.seed,
		selectedArtwork: 0,
		phase: 0,
		frozenPhase: null
	});
}

export const applyPreset = stateForPreset;

export function structuralGalleryState(
	state: InvisibleWeatherState
): Omit<InvisibleWeatherState, 'selectedArtwork' | 'phase'> {
	const structural = normalizeGalleryState(state);
	Reflect.deleteProperty(structural, 'selectedArtwork');
	Reflect.deleteProperty(structural, 'phase');
	return structural;
}

function artworkRecipe(
	state: InvisibleWeatherState,
	index: number,
	sharedFieldSeed: string,
	sharedSecondaryFieldSeed: string,
	maskSubset: readonly MaskKind[]
): ArtworkRecipe {
	const depth = localDepth(state, index);
	const angleMode = localAngleMode(state, index);
	const thresholdMode = localThresholdMode(state, index);
	const fieldFamily = `${state.noiseMode}-depth-${depth}-${angleMode}-${thresholdMode}`;
	const seed = deriveSubseed(
		state.seed,
		`v${state.version}:${state.layout}:${fieldFamily}:artwork-${index + 1}`
	);
	const random = new SeededRandom(seed);
	const palette = getPalette(state.paletteId);
	const { ground, pair } = choosePalettePair(palette, `${seed}:palette`);
	const mask = maskSubset[index % maskSubset.length] ?? 'rectangle';
	const transformRandom = random.fork('transform');
	const localTransform = {
		rotation: transformRandom.float(-0.22, 0.22),
		scaleX: transformRandom.float(0.78, 1.24),
		scaleY: transformRandom.float(0.78, 1.24),
		offsetX: transformRandom.float(-0.12, 0.12),
		offsetY: transformRandom.float(-0.12, 0.12),
		mirrorX: transformRandom.boolean(0.35)
	};
	const secondaryTransformRandom = random.fork('secondary-transform');
	const secondaryTransform = {
		rotation: secondaryTransformRandom.float(-0.3, 0.3),
		scaleX: secondaryTransformRandom.float(0.72, 1.3),
		scaleY: secondaryTransformRandom.float(0.72, 1.3),
		offsetX: secondaryTransformRandom.float(-0.18, 0.18),
		offsetY: secondaryTransformRandom.float(-0.18, 0.18),
		mirrorX: secondaryTransformRandom.boolean(0.5)
	};
	const field = {
		noiseMode: state.noiseMode,
		depth,
		frequency: state.frequency,
		warpStrength: state.warpStrength,
		timeScale: 0.06,
		seed: sharedFieldSeed
	} as const;
	const secondaryField = {
		noiseMode: state.noiseMode,
		depth: Math.max(1, Math.min(4, depth + (index % 3 === 0 ? 1 : 0))) as 1 | 2 | 3 | 4,
		frequency: Math.max(0.05, Math.min(12, state.frequency * 1.13)),
		warpStrength: Math.max(0, Math.min(2, state.warpStrength * 0.82 + 0.06)),
		timeScale: 0.06,
		seed: sharedSecondaryFieldSeed
	} as const;
	const pathCount = Math.max(24, Math.round(72 * state.pathDensity * random.float(0.84, 1.16)));
	const thresholdWidth = Math.max(
		0.005,
		Math.min(0.35, state.thresholdWidth * random.float(0.78, 1.22))
	);
	const partial: Omit<ArtworkRecipe, 'geometrySamples'> = {
		id: `weather-work-${index + 1}`,
		index,
		seed,
		field,
		secondaryField,
		angleMode,
		softness: state.softness,
		threshold: {
			mode: thresholdMode,
			centre: 0.5,
			width: thresholdWidth,
			tail: Math.max(0.08, Math.min(0.4, 0.22 + random.float(-0.035, 0.035)))
		},
		mask,
		paletteId: palette.id,
		groundId: ground.id,
		ground: ground.colour,
		primaryInk: pair.primary,
		secondaryInk: state.dualInk && thresholdMode !== 'off' ? pair.secondary : undefined,
		pathDensity: state.pathDensity,
		pathLength: state.pathLength,
		pathCount,
		lineWidth: state.strokeWidth * random.float(0.86, 1.14),
		multiplier: state.multiplier,
		turns: state.turns,
		dualInk: state.dualInk,
		grain: state.grain,
		shadow: state.shadow,
		frameFamily: state.frameFamily,
		speed: 1,
		phaseOffset: 0,
		localTransform,
		secondaryTransform
	};
	const samplePoints = [
		[0.17, 0.21],
		[0.38, 0.72],
		[0.53, 0.46],
		[0.74, 0.27],
		[0.82, 0.79]
	] as const;
	const geometrySamples = samplePoints.map(([x, y]) => {
		const local = transformedSamplePoint(localTransform, x, y);
		return Number(sampleField(local.x, local.y, 0, field).toFixed(8));
	});
	return { ...partial, geometrySamples };
}

export function createExhibitionRecipe(
	input: Partial<InvisibleWeatherState> | InvisibleWeatherState
): ExhibitionRecipe {
	const state = normalizeGalleryState(input);
	const sharedFieldSeed = deriveSubseed(state.seed, 'shared-weather-field');
	const sharedSecondaryFieldSeed = deriveSubseed(state.seed, 'shared-secondary-weather-field');
	const masks = curatedMaskSubset(state);
	const artworks = Array.from({ length: state.artworkCount }, (_, index) =>
		artworkRecipe(state, index, sharedFieldSeed, sharedSecondaryFieldSeed, masks)
	);
	const base = {
		schemaVersion: 1 as const,
		seed: state.seed,
		presetId: state.presetId,
		layout: state.layout,
		artworkCount: state.artworkCount,
		paletteId: state.paletteId,
		motion: state.motion,
		frozenPhase: state.frozenPhase,
		grain: state.grain,
		shadow: state.shadow,
		frameFamily: state.frameFamily,
		orientation: state.orientation,
		speed: state.speed,
		artworks,
		landscapeFrames: createLayout(state.layout, state.artworkCount, 'landscape', state.seed),
		portraitFrames: createLayout(state.layout, state.artworkCount, 'portrait', state.seed)
	};
	return { ...base, recipeHash: hashValue(base) };
}

export const createRecipe = createExhibitionRecipe;

export function recipeHash(
	input: ExhibitionRecipe | Partial<InvisibleWeatherState> | InvisibleWeatherState
): string {
	if ('recipeHash' in input && typeof input.recipeHash === 'string') return input.recipeHash;
	return createExhibitionRecipe(input).recipeHash;
}
