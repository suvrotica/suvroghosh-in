import type {
	DomainShapeId,
	DomainShapeSpec,
	PresetId,
	SpotStripeConfig,
	SpotStripePreset
} from './types.ts';

export const SPOTS_AND_STRIPES_ENGINE_VERSION = '1.0.0';

export const FIXED_ACTIVATOR_DIFFUSION = 0.6;
export const DEFAULT_GRID_SPACING = 0.8;
export const DEFAULT_TIMESTEP = 0.01;
export const DEFAULT_OBSERVATION_TIME = 60;
export const DEFAULT_SEED = 1952;
export const DEFAULT_DISTURBANCE_AMPLITUDE = 0.03;

export const PATTERN_BALANCE_MIN = -0.1;
export const PATTERN_BALANCE_MAX = 0.1;
export const PATTERN_BALANCE_STEP = 0.005;

export const INHIBITOR_RATIO_MIN = 1;
export const INHIBITOR_RATIO_MAX = 20;
export const INHIBITOR_RATIO_STEP = 0.5;

export const PIGMENT_THRESHOLD_MIN = -0.6;
export const PIGMENT_THRESHOLD_MAX = 0.6;
export const PIGMENT_THRESHOLD_STEP = 0.02;

export const SEED_MIN = 1;
export const SEED_MAX = 999999;

export const FIXED_SIGNAL_SCALE_LIMIT = 1.0;

export const DOMAIN_SHAPES: Record<DomainShapeId, DomainShapeSpec> = {
	'broad-sheet': {
		id: 'broad-sheet',
		label: 'Broad sheet',
		nx: 96,
		ny: 96,
		gridSpacing: DEFAULT_GRID_SPACING,
		physicalWidth: 76.8,
		physicalHeight: 76.8,
		aspectRatio: 1,
		shortNote:
			'Flat 2D square patch (76.8 × 76.8 model units). Wide enough in both directions for spots or branching stripes.',
		boundaryNote: 'The signals spread inside the patch. They do not cross its edges.'
	},
	'narrow-strip': {
		id: 'narrow-strip',
		label: 'Narrow strip',
		nx: 120,
		ny: 24,
		gridSpacing: DEFAULT_GRID_SPACING,
		physicalWidth: 96.0,
		physicalHeight: 19.2,
		aspectRatio: 5,
		shortNote:
			'Flat 2D narrow corridor (96.0 × 19.2 model units) at the same grid spacing. Confinement restricts how many patterns fit across the strip.',
		boundaryNote: 'The signals spread inside the patch. They do not cross its edges.'
	},
	'tapered-patch': {
		id: 'tapered-patch',
		label: 'Tapered patch',
		nx: 120,
		ny: 48,
		gridSpacing: DEFAULT_GRID_SPACING,
		physicalWidth: 96.0,
		physicalHeight: 38.4,
		aspectRatio: 2.5,
		shortNote:
			'Flat 2D wedge (96.0 × 38.4 bounding box) narrowing from 33.6 to 7.7 model units—a flat approximation of a narrowing tail.',
		boundaryNote: 'The signals spread inside the patch. They do not cross its edges.'
	}
};

export const DOMAIN_SHAPE_ORDER: readonly DomainShapeId[] = [
	'broad-sheet',
	'narrow-strip',
	'tapered-patch'
];

export const SPOT_STRIPE_PRESETS: Record<PresetId, SpotStripePreset> = {
	spots: {
		id: 'spots',
		label: 'Spots',
		patternBalance: -0.075,
		inhibitorRatio: 15,
		diffusionU: FIXED_ACTIVATOR_DIFFUSION,
		diffusionV: FIXED_ACTIVATOR_DIFFUSION * 15,
		shape: 'broad-sheet',
		seed: DEFAULT_SEED,
		disturbanceAmplitude: DEFAULT_DISTURBANCE_AMPLITUDE,
		timestep: DEFAULT_TIMESTEP,
		observationTime: DEFAULT_OBSERVATION_TIME,
		defaultPigmentThreshold: 0.0,
		description:
			'Negative pattern balance (k = −0.075) shifts the equilibrium below zero so isolated high-activator peaks form round spots on a low-signal background.',
		balanceNote: 'High-signal islands on a low-signal background.'
	},
	stripes: {
		id: 'stripes',
		label: 'Stripes',
		patternBalance: 0.0,
		inhibitorRatio: 15,
		diffusionU: FIXED_ACTIVATOR_DIFFUSION,
		diffusionV: FIXED_ACTIVATOR_DIFFUSION * 15,
		shape: 'broad-sheet',
		seed: DEFAULT_SEED,
		disturbanceAmplitude: DEFAULT_DISTURBANCE_AMPLITUDE,
		timestep: DEFAULT_TIMESTEP,
		observationTime: DEFAULT_OBSERVATION_TIME,
		defaultPigmentThreshold: 0.0,
		description:
			'Symmetric pattern balance (k = 0.000) treats positive and negative excursions equally so high- and low-signal regions connect into labyrinthine stripes.',
		balanceNote: 'High- and low-signal regions share the surface evenly.'
	},
	'inverse-spots': {
		id: 'inverse-spots',
		label: 'Inverse spots',
		patternBalance: 0.075,
		inhibitorRatio: 15,
		diffusionU: FIXED_ACTIVATOR_DIFFUSION,
		diffusionV: FIXED_ACTIVATOR_DIFFUSION * 15,
		shape: 'broad-sheet',
		seed: DEFAULT_SEED,
		disturbanceAmplitude: DEFAULT_DISTURBANCE_AMPLITUDE,
		timestep: DEFAULT_TIMESTEP,
		observationTime: DEFAULT_OBSERVATION_TIME,
		defaultPigmentThreshold: 0.0,
		description:
			'Positive pattern balance (k = +0.075) shifts the equilibrium above zero so isolated low-signal pockets form inside a continuous high-signal coat.',
		balanceNote: 'Low-signal pockets inside a high-signal background.'
	}
};

export const PRESET_ORDER: readonly PresetId[] = ['spots', 'stripes', 'inverse-spots'];

export function configFromPreset(
	presetId: PresetId,
	overrides: Partial<SpotStripeConfig> = {}
): SpotStripeConfig {
	const preset = SPOT_STRIPE_PRESETS[presetId];
	return normalizeSpotStripeConfig({
		presetId: preset.id,
		patternBalance: preset.patternBalance,
		inhibitorRatio: preset.inhibitorRatio,
		shape: preset.shape,
		seed: preset.seed,
		disturbanceAmplitude: preset.disturbanceAmplitude,
		timestep: preset.timestep,
		observationTime: preset.observationTime,
		...overrides
	});
}

export function clampNumber(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, value));
}

export function matchingPresetId(
	patternBalance: number,
	inhibitorRatio: number
): PresetId | 'custom' {
	for (const id of PRESET_ORDER) {
		const preset = SPOT_STRIPE_PRESETS[id];
		if (
			Math.abs(preset.patternBalance - patternBalance) < 1e-6 &&
			Math.abs(preset.inhibitorRatio - inhibitorRatio) < 1e-6
		) {
			return id;
		}
	}
	return 'custom';
}

export function normalizeSpotStripeConfig(input: Partial<SpotStripeConfig>): SpotStripeConfig {
	const base = SPOT_STRIPE_PRESETS.spots;
	const patternBalance = Number(
		clampNumber(
			input.patternBalance ?? base.patternBalance,
			PATTERN_BALANCE_MIN,
			PATTERN_BALANCE_MAX,
			base.patternBalance
		).toFixed(4)
	);
	const inhibitorRatio = Number(
		clampNumber(
			input.inhibitorRatio ?? base.inhibitorRatio,
			INHIBITOR_RATIO_MIN,
			INHIBITOR_RATIO_MAX,
			base.inhibitorRatio
		).toFixed(2)
	);
	const shape: DomainShapeId =
		input.shape && input.shape in DOMAIN_SHAPES ? input.shape : base.shape;
	const rawSeed = Math.round(
		clampNumber(input.seed ?? base.seed, SEED_MIN, SEED_MAX, base.seed)
	);
	const disturbanceAmplitude = clampNumber(
		input.disturbanceAmplitude ?? base.disturbanceAmplitude,
		0.001,
		0.15,
		base.disturbanceAmplitude
	);
	const timestep = clampNumber(input.timestep ?? base.timestep, 0.001, 0.02, base.timestep);
	const observationTime = clampNumber(
		input.observationTime ?? base.observationTime,
		10,
		120,
		base.observationTime
	);
	const presetId = matchingPresetId(patternBalance, inhibitorRatio);
	return {
		presetId,
		patternBalance,
		inhibitorRatio,
		shape,
		seed: rawSeed,
		disturbanceAmplitude,
		timestep,
		observationTime
	};
}
