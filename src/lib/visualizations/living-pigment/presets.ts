import type {
	BackgroundSettings,
	BrushDefinition,
	SimulationSettings,
	StudioPreset
} from './types';

export const BRUSHES: readonly BrushDefinition[] = [
	{
		id: 'round',
		name: 'Round brush',
		description: 'A balanced circular brush that adds pigment, moisture, and gentle motion.',
		pigmentScale: 1,
		waterScale: 1,
		flowScale: 0.72
	},
	{
		id: 'wash',
		name: 'Soft wash',
		description: 'A broad, wet footprint for translucent fields and wet-on-wet blooms.',
		pigmentScale: 0.46,
		waterScale: 1.65,
		flowScale: 0.42
	},
	{
		id: 'flat',
		name: 'Flat brush',
		description: 'A directional chisel-shaped mark that follows the stroke angle.',
		pigmentScale: 0.92,
		waterScale: 0.78,
		flowScale: 0.92
	},
	{
		id: 'dry',
		name: 'Dry brush',
		description: 'Broken pigment catches the high points of the paper or canvas grain.',
		pigmentScale: 0.78,
		waterScale: 0.16,
		flowScale: 0.28
	},
	{
		id: 'dropper',
		name: 'Pigment dropper',
		description: 'Places a concentrated wet drop that pushes outward into nearby moisture.',
		pigmentScale: 1.38,
		waterScale: 1.35,
		flowScale: 0.18
	},
	{
		id: 'knife',
		name: 'Palette knife',
		description:
			'Scrapes thick pigment in the stroke direction, leaving ridges and partial mixing.',
		pigmentScale: 1.22,
		waterScale: 0.08,
		flowScale: 1.5
	},
	{
		id: 'water',
		name: 'Water-only brush',
		description:
			'Adds moisture and motion without color, reopening paint that has not fully fixed.',
		pigmentScale: 0,
		waterScale: 1.8,
		flowScale: 0.86
	},
	{
		id: 'lifter',
		name: 'Pigment lifter',
		description: 'Pulls back some mobile and deposited pigment; wet lifting can add water.',
		pigmentScale: 0,
		waterScale: 0.7,
		flowScale: 0.25
	},
	{
		id: 'clear',
		name: 'True clear',
		description: 'Returns an area toward the underlying surface instead of painting it white.',
		pigmentScale: 0,
		waterScale: 0,
		flowScale: 0
	}
];

export const DEFAULT_BACKGROUND: BackgroundSettings = {
	mode: 'atmospheric-wash',
	seed: 20_260_722,
	regions: 5,
	harmony: 'monsoon',
	moisture: 0.58,
	turbulence: 0.28,
	scale: 1,
	symmetry: 0.08,
	intensity: 0.34,
	customColor: '#eee7d8'
};

export const DEFAULT_SETTINGS: SimulationSettings = {
	mode: 'watercolor',
	brush: 'round',
	brushSize: 34,
	pigmentAmount: 0.62,
	transparency: 0.34,
	waterAmount: 0.68,
	diffusion: 0.62,
	surfaceMoisture: 0.34,
	dryingSpeed: 0.38,
	viscosity: 0.22,
	flowStrength: 0.52,
	turbulence: 0.22,
	granulation: 0.58,
	edgeDarkening: 0.66,
	mixingStrength: 0.48,
	textureStrength: 0.58,
	simulationSpeed: 1,
	eraserStrength: 0.72,
	eraserSoftness: 0.64,
	wetLifting: true,
	quality: 'medium',
	overlay: 'artwork',
	colorMode: 'single',
	primaryPigmentId: 'ultramarine',
	secondaryPigmentId: 'burnt-sienna',
	paletteIds: ['ultramarine', 'burnt-sienna', 'yellow-ochre', 'viridian', 'paynes-grey'],
	background: { ...DEFAULT_BACKGROUND }
};

export const STUDIO_PRESETS: readonly StudioPreset[] = [
	{
		id: 'morning-wash',
		name: 'Morning Wash',
		description: 'Transparent cobalt and ochre moving slowly across damp handmade paper.',
		settings: {
			mode: 'watercolor',
			brush: 'wash',
			primaryPigmentId: 'cobalt',
			secondaryPigmentId: 'yellow-ochre',
			paletteIds: ['cobalt', 'yellow-ochre', 'burnt-sienna', 'cerulean'],
			diffusion: 0.7,
			dryingSpeed: 0.34,
			granulation: 0.42,
			background: { mode: 'atmospheric-wash', seed: 10_311, harmony: 'quiet', intensity: 0.28 }
		}
	},
	{
		id: 'monsoon-paper',
		name: 'Monsoon Paper',
		description: 'Humid grey-blue paper with restrained green and rust-colored blooms.',
		settings: {
			mode: 'watercolor',
			primaryPigmentId: 'paynes-grey',
			secondaryPigmentId: 'viridian',
			paletteIds: ['paynes-grey', 'viridian', 'burnt-sienna', 'cobalt'],
			surfaceMoisture: 0.66,
			diffusion: 0.78,
			dryingSpeed: 0.2,
			edgeDarkening: 0.82,
			background: { mode: 'wet-field', seed: 70_719, harmony: 'monsoon', moisture: 0.8 }
		}
	},
	{
		id: 'dry-earth',
		name: 'Dry Earth',
		description: 'Broken ochre, sienna, and umber marks catch a toothy dry surface.',
		settings: {
			mode: 'hybrid',
			brush: 'dry',
			primaryPigmentId: 'yellow-ochre',
			secondaryPigmentId: 'burnt-umber',
			paletteIds: ['yellow-ochre', 'burnt-sienna', 'burnt-umber', 'lamp-black'],
			waterAmount: 0.12,
			diffusion: 0.12,
			dryingSpeed: 0.82,
			viscosity: 0.64,
			granulation: 0.9,
			background: { mode: 'handmade', seed: 41_028, harmony: 'earth', moisture: 0.08 }
		}
	},
	{
		id: 'ultramarine-bloom',
		name: 'Ultramarine Bloom',
		description: 'A strongly granulating blue drop opens into a saturated wet field.',
		settings: {
			mode: 'watercolor',
			brush: 'dropper',
			primaryPigmentId: 'ultramarine',
			paletteIds: ['ultramarine', 'cobalt', 'cerulean', 'paynes-grey'],
			pigmentAmount: 0.82,
			waterAmount: 0.88,
			diffusion: 0.88,
			granulation: 0.94,
			edgeDarkening: 0.86,
			background: { mode: 'wet-field', seed: 90_081, harmony: 'analogous', moisture: 0.86 }
		}
	},
	{
		id: 'oil-and-ash',
		name: 'Oil and Ash',
		description: 'Dense grey, umber, and white dragged across a dark canvas.',
		settings: {
			mode: 'oil',
			brush: 'knife',
			primaryPigmentId: 'paynes-grey',
			secondaryPigmentId: 'titanium-white',
			paletteIds: ['paynes-grey', 'lamp-black', 'burnt-umber', 'titanium-white'],
			waterAmount: 0.08,
			diffusion: 0.14,
			dryingSpeed: 0.12,
			viscosity: 0.9,
			flowStrength: 0.7,
			mixingStrength: 0.28,
			background: { mode: 'dark-ground', seed: 50_050, harmony: 'quiet', intensity: 0.18 }
		}
	},
	{
		id: 'vermilion-current',
		name: 'Vermilion Current',
		description:
			'Cadmium-like red rides a directional current through warm yellow and earth tones.',
		settings: {
			mode: 'hybrid',
			brush: 'flat',
			primaryPigmentId: 'cadmium-red',
			secondaryPigmentId: 'indian-yellow',
			paletteIds: ['cadmium-red', 'indian-yellow', 'burnt-sienna', 'lamp-black'],
			flowStrength: 0.82,
			turbulence: 0.38,
			viscosity: 0.52,
			background: { mode: 'pigment-cloud', seed: 62_116, harmony: 'complementary', intensity: 0.38 }
		}
	},
	{
		id: 'moss-on-stone',
		name: 'Moss on Stone',
		description: 'Granular greens settle between grey and umber paper fibers.',
		settings: {
			mode: 'watercolor',
			primaryPigmentId: 'sap-green',
			secondaryPigmentId: 'burnt-umber',
			paletteIds: ['sap-green', 'viridian', 'burnt-umber', 'paynes-grey', 'yellow-ochre'],
			granulation: 0.86,
			dryingSpeed: 0.46,
			background: { mode: 'handmade', seed: 33_580, harmony: 'earth', intensity: 0.25 }
		}
	},
	{
		id: 'calcutta-rain',
		name: 'Calcutta Rain',
		description: 'Humid greys, washed-wall earth, and oxidized green under a slow monsoon flow.',
		settings: {
			mode: 'hybrid',
			brush: 'wash',
			primaryPigmentId: 'paynes-grey',
			secondaryPigmentId: 'burnt-sienna',
			paletteIds: ['paynes-grey', 'viridian', 'burnt-sienna', 'yellow-ochre', 'cobalt'],
			diffusion: 0.68,
			surfaceMoisture: 0.7,
			dryingSpeed: 0.18,
			turbulence: 0.26,
			background: {
				mode: 'random-pigments',
				seed: 19_770_712,
				harmony: 'monsoon',
				moisture: 0.76,
				intensity: 0.36
			}
		}
	},
	{
		id: 'burnt-sienna-study',
		name: 'Burnt Sienna Study',
		description:
			'One warm earth pigment reveals staining, edge deposits, and layered transparency.',
		settings: {
			mode: 'watercolor',
			primaryPigmentId: 'burnt-sienna',
			secondaryPigmentId: 'burnt-umber',
			paletteIds: ['burnt-sienna', 'burnt-umber', 'yellow-ochre'],
			colorMode: 'single',
			granulation: 0.66,
			edgeDarkening: 0.78,
			background: { mode: 'clean', seed: 10_091, harmony: 'earth', intensity: 0 }
		}
	},
	{
		id: 'quiet-turbulence',
		name: 'Quiet Turbulence',
		description: 'A low-contrast atmospheric field whose motion is visible only at its boundaries.',
		settings: {
			mode: 'hybrid',
			primaryPigmentId: 'cobalt',
			secondaryPigmentId: 'yellow-ochre',
			paletteIds: ['cobalt', 'paynes-grey', 'yellow-ochre', 'titanium-white'],
			pigmentAmount: 0.4,
			transparency: 0.64,
			diffusion: 0.44,
			flowStrength: 0.38,
			turbulence: 0.52,
			background: { mode: 'atmospheric-wash', seed: 91_114, harmony: 'quiet', intensity: 0.24 }
		}
	}
];

export function cloneSettings(settings: SimulationSettings = DEFAULT_SETTINGS): SimulationSettings {
	return {
		...settings,
		paletteIds: [...settings.paletteIds],
		background: { ...settings.background }
	};
}

export function applyPreset(current: SimulationSettings, preset: StudioPreset): SimulationSettings {
	return {
		...current,
		...preset.settings,
		paletteIds: preset.settings.paletteIds
			? [...preset.settings.paletteIds]
			: [...current.paletteIds],
		background: {
			...current.background,
			...(preset.settings.background ?? {})
		}
	};
}

export function validatePreset(preset: StudioPreset) {
	const merged = applyPreset(cloneSettings(), preset);
	const numericValues = [
		merged.brushSize,
		merged.pigmentAmount,
		merged.waterAmount,
		merged.diffusion,
		merged.surfaceMoisture,
		merged.dryingSpeed,
		merged.viscosity,
		merged.flowStrength,
		merged.turbulence,
		merged.granulation,
		merged.edgeDarkening,
		merged.mixingStrength,
		merged.textureStrength,
		merged.background.seed,
		merged.background.regions,
		merged.background.moisture,
		merged.background.intensity
	];
	return numericValues.every(Number.isFinite);
}
