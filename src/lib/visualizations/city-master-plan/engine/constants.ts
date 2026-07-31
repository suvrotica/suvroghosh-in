import type {
	AnomalyAppetite,
	BuildingDensity,
	CityConfig,
	CitySizePreset,
	CivicPatience,
	EdgeSignature,
	LandmarkFrequency
} from './types';

export const CITY_GRID_PRESETS: Readonly<
	Record<CitySizePreset, Readonly<{ width: number; height: number }>>
> = {
	small: { width: 18, height: 14 },
	standard: { width: 24, height: 18 },
	large: { width: 32, height: 24 }
};

export const CIVIC_PATIENCE_BUDGETS: Readonly<Record<CivicPatience, number>> = {
	patient: 24,
	familiar: 8,
	impulsive: 1,
	none: 0
};

export const DENSITY_MULTIPLIERS: Readonly<Record<BuildingDensity, number>> = {
	open: 0.68,
	balanced: 1,
	dense: 1.45
};

export const LANDMARK_MULTIPLIERS: Readonly<Record<LandmarkFrequency, number>> = {
	scarce: 0.45,
	balanced: 1,
	frequent: 1.75
};

export const ANOMALY_MULTIPLIERS: Readonly<Record<AnomalyAppetite, number>> = {
	restrained: 0.35,
	balanced: 1,
	enthusiastic: 1.8
};

export const DEFAULT_EDGE: EdgeSignature = Object.freeze({
	passage: 'closed',
	water: 'dry',
	drain: 'none',
	face: 'neutral',
	clearance: 0
});

export const DEFAULT_CITY_CONFIG: CityConfig = Object.freeze({
	generatorVersion: 1,
	seed: 'monsoon-tram-184',
	size: 'standard',
	anchor: Object.freeze({ id: 'sweet-shop', x: 12, y: 9, rotation: 0 }),
	civicPatience: 'familiar',
	minimumGuarantees: false,
	density: 'balanced',
	landmarkFrequency: 'balanced',
	anomalyAppetite: 'balanced',
	tramPreference: 'ordinary'
});

export const HARD_STEP_MULTIPLIER = 24;
export const MAX_EVENT_LOG_LENGTH = 12_000;

export function dimensionsForConfig(config: Pick<CityConfig, 'size'>) {
	return CITY_GRID_PRESETS[config.size];
}
