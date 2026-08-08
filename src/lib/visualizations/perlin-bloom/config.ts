import { normalizeSeedText } from './seed';
import type {
	BloomView,
	ConfigRange,
	FlowerConfig,
	NumericConfigKey,
	PresetId,
	QualityLevel,
	TipStyle
} from './types';

export const DEFAULT_SEED = 'outside-1847';

export const PRESET_IDS = Object.freeze([
	'neon-orchid',
	'reactor-lotus',
	'solar-chrysalis',
	'kolkata-after-midnight',
	'ice-signal',
	'blacklight-dahlia',
	'monochrome-laser'
] as const satisfies readonly PresetId[]);

export const BLOOM_VIEWS = Object.freeze([
	'artwork',
	'anatomy'
] as const satisfies readonly BloomView[]);
export const TIP_STYLES = Object.freeze([
	'rounded',
	'pointed',
	'split',
	'recurved',
	'filamented'
] as const satisfies readonly TipStyle[]);
export const QUALITY_LEVELS = Object.freeze([
	'auto',
	'low',
	'high'
] as const satisfies readonly QualityLevel[]);

export const CONFIG_RANGES = Object.freeze({
	petals: {
		min: 3,
		max: 32,
		step: 1,
		label: 'Petals',
		group: 'bloom',
		decimals: 0,
		integer: true
	},
	whorls: {
		min: 1,
		max: 8,
		step: 1,
		label: 'Whorls',
		group: 'bloom',
		decimals: 0,
		integer: true
	},
	bloomScale: {
		min: 0.4,
		max: 1,
		step: 0.01,
		label: 'Bloom scale',
		group: 'bloom',
		decimals: 2
	},
	petalLength: {
		min: 0.3,
		max: 1,
		step: 0.01,
		label: 'Length',
		group: 'bloom',
		decimals: 2
	},
	petalWidth: {
		min: 0.08,
		max: 0.55,
		step: 0.01,
		label: 'Fullness',
		group: 'bloom',
		decimals: 2
	},
	widthProfile: {
		min: 0.5,
		max: 2,
		step: 0.05,
		label: 'Width profile',
		group: 'bloom',
		decimals: 2
	},
	curl: {
		min: -0.65,
		max: 0.65,
		step: 0.01,
		label: 'Curl',
		group: 'bloom',
		decimals: 2
	},
	symmetry: {
		min: 0,
		max: 1,
		step: 0.01,
		label: 'Symmetry',
		group: 'bloom',
		decimals: 2
	},
	asymmetry: {
		min: 0,
		max: 0.6,
		step: 0.01,
		label: 'Asymmetry',
		group: 'bloom',
		decimals: 2
	},
	noiseStrength: {
		min: 0,
		max: 0.6,
		step: 0.01,
		label: 'Wildness',
		group: 'noise',
		decimals: 2
	},
	noiseScale: {
		min: 0.2,
		max: 4,
		step: 0.05,
		label: 'Noise scale',
		group: 'noise',
		decimals: 2
	},
	domainWarp: {
		min: 0,
		max: 1.2,
		step: 0.01,
		label: 'Domain warp',
		group: 'noise',
		decimals: 2
	},
	octaves: {
		min: 1,
		max: 8,
		step: 1,
		label: 'Detail',
		group: 'noise',
		decimals: 0,
		integer: true
	},
	falloff: {
		min: 0.1,
		max: 0.9,
		step: 0.01,
		label: 'Falloff',
		group: 'noise',
		decimals: 2
	},
	noiseDrift: {
		min: 0,
		max: 0.2,
		step: 0.005,
		label: 'Drift',
		group: 'noise',
		decimals: 3
	},
	breath: {
		min: 0,
		max: 0.4,
		step: 0.01,
		label: 'Breath',
		group: 'motion',
		decimals: 2
	},
	rotation: {
		min: -0.08,
		max: 0.08,
		step: 0.001,
		label: 'Rotation',
		group: 'motion',
		decimals: 3
	},
	pointerInfluence: {
		min: 0,
		max: 1,
		step: 0.01,
		label: 'Pointer influence',
		group: 'motion',
		decimals: 2
	},
	trails: {
		min: 0,
		max: 0.65,
		step: 0.01,
		label: 'Trails',
		group: 'motion',
		decimals: 2
	},
	boxSize: {
		min: 0.2,
		max: 0.75,
		step: 0.01,
		label: 'Box size',
		group: 'boundary',
		decimals: 2
	},
	constraint: {
		min: 0,
		max: 1,
		step: 0.01,
		label: 'Constraint',
		group: 'boundary',
		decimals: 2
	},
	ruptureThreshold: {
		min: -0.08,
		max: 0.16,
		step: 0.01,
		label: 'Rupture threshold',
		group: 'boundary',
		decimals: 2
	},
	breakout: {
		min: 0,
		max: 1.25,
		step: 0.01,
		label: 'Breakout energy',
		group: 'boundary',
		decimals: 2
	},
	boxOpacity: {
		min: 0,
		max: 1,
		step: 0.01,
		label: 'Box opacity',
		group: 'boundary',
		decimals: 2
	},
	membraneOpacity: {
		min: 0,
		max: 1,
		step: 0.01,
		label: 'Membrane opacity',
		group: 'light',
		decimals: 2
	},
	veinBrightness: {
		min: 0,
		max: 1,
		step: 0.01,
		label: 'Vein brightness',
		group: 'light',
		decimals: 2
	},
	glow: {
		min: 0,
		max: 1,
		step: 0.01,
		label: 'Glow',
		group: 'light',
		decimals: 2
	},
	grain: {
		min: 0,
		max: 0.2,
		step: 0.005,
		label: 'Grain',
		group: 'light',
		decimals: 3
	},
	pollen: {
		min: 0,
		max: 1,
		step: 0.01,
		label: 'Pollen',
		group: 'light',
		decimals: 2
	}
} satisfies Readonly<Record<NumericConfigKey, ConfigRange>>);

export const NUMERIC_CONFIG_KEYS = Object.freeze(Object.keys(CONFIG_RANGES) as NumericConfigKey[]);

export const DEFAULT_FLOWER_CONFIG: FlowerConfig = Object.freeze({
	seed: DEFAULT_SEED,
	preset: 'neon-orchid',
	palette: 'neon-orchid',
	view: 'artwork',
	petals: 11,
	whorls: 4,
	bloomScale: 0.78,
	petalLength: 0.72,
	petalWidth: 0.34,
	widthProfile: 1.15,
	curl: 0.18,
	symmetry: 0.84,
	asymmetry: 0.14,
	tipStyle: 'recurved',
	noiseStrength: 0.17,
	noiseScale: 1.35,
	domainWarp: 0.42,
	octaves: 4,
	falloff: 0.52,
	noiseDrift: 0.055,
	breath: 0.12,
	rotation: 0.008,
	pointerInfluence: 0.32,
	trails: 0.1,
	/** Half-size of the square in normalized flower-local coordinates. */
	boxSize: 0.46,
	constraint: 0.62,
	ruptureThreshold: 0,
	breakout: 0.76,
	boxOpacity: 0.43,
	boundaryPhysics: true,
	boxVisible: true,
	membraneOpacity: 0.42,
	veinBrightness: 0.7,
	glow: 0.68,
	grain: 0.04,
	pollen: 0.38,
	quality: 'auto',
	motionEnabled: true
});

export const DEFAULT_CONFIG = DEFAULT_FLOWER_CONFIG;

const presetIds = new Set<PresetId>(PRESET_IDS);
const bloomViews = new Set<BloomView>(BLOOM_VIEWS);
const tipStyles = new Set<TipStyle>(TIP_STYLES);
const qualityLevels = new Set<QualityLevel>(QUALITY_LEVELS);

function numericValue(
	input: Readonly<Record<string, unknown>>,
	key: NumericConfigKey,
	fallback: number
): number {
	const raw = input[key];
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
	const range: ConfigRange = CONFIG_RANGES[key];
	const value = range.integer ? Math.round(raw) : raw;
	return Math.max(range.min, Math.min(range.max, value));
}

function enumValue<T extends string>(value: unknown, allowed: ReadonlySet<T>, fallback: T): T {
	return typeof value === 'string' && allowed.has(value as T) ? (value as T) : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

export function normalizeFlowerConfig(
	input: Partial<Record<keyof FlowerConfig, unknown>> | null | undefined,
	fallback: Readonly<FlowerConfig> = DEFAULT_FLOWER_CONFIG
): FlowerConfig {
	const source = (input ?? {}) as Readonly<Record<string, unknown>>;
	const normalized = { ...fallback };
	for (const key of NUMERIC_CONFIG_KEYS) {
		(normalized[key] as number) = numericValue(source, key, fallback[key]);
	}
	normalized.seed = normalizeSeedText(source.seed, fallback.seed);
	normalized.preset = enumValue(source.preset, presetIds, fallback.preset);
	normalized.palette = enumValue(source.palette, presetIds, fallback.palette);
	normalized.view = enumValue(source.view, bloomViews, fallback.view);
	normalized.tipStyle = enumValue(source.tipStyle, tipStyles, fallback.tipStyle);
	normalized.quality = enumValue(source.quality, qualityLevels, fallback.quality);
	normalized.boundaryPhysics = booleanValue(source.boundaryPhysics, fallback.boundaryPhysics);
	normalized.boxVisible = booleanValue(source.boxVisible, fallback.boxVisible);
	normalized.motionEnabled = booleanValue(source.motionEnabled, fallback.motionEnabled);
	return normalized;
}

export const normalizeConfig = normalizeFlowerConfig;

export function cloneFlowerConfig(
	config: Readonly<FlowerConfig> = DEFAULT_FLOWER_CONFIG
): FlowerConfig {
	return { ...config };
}

export function formatConfigValue(key: NumericConfigKey, value: number): string {
	const normalized = numericValue({ [key]: value }, key, DEFAULT_FLOWER_CONFIG[key]);
	return normalized.toFixed(CONFIG_RANGES[key].decimals);
}
