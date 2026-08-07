import type { FieldSettings, InvisibleWeatherState, ThresholdSettings } from './types';

export const MIN_ARTWORK_COUNT = 3;
export const MAX_ARTWORK_COUNT = 15;
export const MIN_PATH_DENSITY = 0.2;
export const MAX_PATH_DENSITY = 2;
export const MIN_PATH_LENGTH = 8;
export const MAX_PATH_LENGTH = 96;

export const DEFAULT_FIELD_SETTINGS: FieldSettings = Object.freeze({
	noiseMode: 'gradient',
	depth: 3,
	frequency: 1.7,
	warpStrength: 0.34,
	timeScale: 0.06,
	seed: 'monsoon-ledger-1847:field'
});

export const DEFAULT_THRESHOLD_SETTINGS: ThresholdSettings = Object.freeze({
	mode: 'river',
	centre: 0.5,
	width: 0.09,
	tail: 0.22
});

export const DEFAULT_INVISIBLE_WEATHER_STATE: InvisibleWeatherState = Object.freeze({
	version: 1,
	seed: 'monsoon-ledger-1847',
	presetId: 'monsoon-ledger',
	layout: 'salon-wall',
	artworkCount: 9,
	paletteId: 'monsoon-ledger',
	noiseMode: 'gradient',
	depth: 3,
	frequency: 1.7,
	warpStrength: 0.34,
	angleMode: 'free',
	softness: 0.42,
	thresholdMode: 'river',
	thresholdWidth: 0.09,
	motion: 'migrate',
	phase: 0,
	frozenPhase: null,
	selectedArtwork: 0,
	pathDensity: 1,
	pathLength: 42,
	multiplier: 1,
	turns: 1.25,
	strokeWidth: 1,
	dualInk: true,
	grain: 0.18,
	shadow: 0.52,
	frameFamily: 'quiet-wood',
	orientation: 'auto',
	speed: 0.55
});

export const DEFAULT_GALLERY_STATE = DEFAULT_INVISIBLE_WEATHER_STATE;

export function cloneGalleryState(
	state: InvisibleWeatherState = DEFAULT_INVISIBLE_WEATHER_STATE
): InvisibleWeatherState {
	return { ...state };
}
