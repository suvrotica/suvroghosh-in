import {
	DEFAULT_ATLAS_STATE,
	ENGINE_LIMITS,
	FEATURE_LABELS,
	STRIKE_SCALE_IDS,
	TERRAIN_PRESET_IDS,
	terrainPreset
} from './config';
import { hashString } from './prng';
import { clamp } from './vectors';
import type {
	AtlasMode,
	CameraPreset,
	DisplayMode,
	FlashTypeChoice,
	LayerId,
	PlacedFeature,
	PlaceableFeatureKind,
	QualityChoice,
	SerializableAtlasState,
	StrikeScale,
	TerrainPresetId
} from './types';

const atlasModes = new Set<AtlasMode>(['live', 'study', 'replay', 'cross-section']);
const displayModes = new Set<DisplayMode>(['night', 'field-map']);
const flashTypes = new Set<FlashTypeChoice>([
	'storm-decides',
	'negative-cg',
	'positive-cg',
	'intra-cloud'
]);
const cameraPresets = new Set<CameraPreset>([
	'overview',
	'observer',
	'attachment',
	'follow',
	'hero',
	'wide'
]);
const strikeScales = new Set<StrikeScale>(STRIKE_SCALE_IDS);
const qualityChoices = new Set<QualityChoice>(['auto', 'low', 'medium', 'high']);
const layerIds = new Set<LayerId>([
	'field',
	'charge',
	'branches',
	'streamers',
	'ground-current',
	'contours'
]);
const placeableKinds = new Set(Object.keys(FEATURE_LABELS) as PlaceableFeatureKind[]);

// v1 links created before morphology was added omitted every value that matched this baseline.
// Keep the complete snapshot here so those links continue to reconstruct the same storm and bolt.
const LEGACY_V1_DEFAULT_ATLAS_STATE: SerializableAtlasState = {
	version: 1,
	seed: 'monsoon-1975',
	terrain: 'monsoon-delta',
	mode: 'live',
	displayMode: 'night',
	flashType: 'storm-decides',
	strikeScale: 'standard',
	stormPosition: { x: 0.56, z: 0.43 },
	storm: {
		chargeStrength: 0.72,
		chargeSeparation: 0.58,
		branching: 0.62,
		leaderPersistence: 0.68,
		cloudBaseMetres: 980,
		lowerPositiveCharge: true
	},
	environment: {
		windSpeed: 12,
		windDirection: 245,
		rainIntensity: 0.72,
		visibility: 0.58,
		surfaceWetness: 0.82,
		conductivityProxy: 0.54,
		timeOfDay: 0.88
	},
	observer: { x: 0.18, z: 0.81 },
	cameraPreset: 'overview',
	visibleLayers: ['branches', 'streamers', 'ground-current'],
	selectedStrikeIndex: 0,
	placedFeatures: [],
	flashSafe: true,
	quality: 'auto'
};

function cloneState(state: SerializableAtlasState): SerializableAtlasState {
	return {
		...state,
		stormPosition: { ...state.stormPosition },
		storm: { ...state.storm },
		environment: { ...state.environment },
		observer: { ...state.observer },
		visibleLayers: [...state.visibleLayers],
		placedFeatures: state.placedFeatures.map((feature) => ({ ...feature }))
	};
}

function cloneDefaultState(): SerializableAtlasState {
	return cloneState(DEFAULT_ATLAS_STATE);
}

function numberParameter(
	params: URLSearchParams,
	name: string,
	fallback: number,
	minimum: number,
	maximum: number
): number {
	const raw = params.get(name);
	if (raw === null || raw.trim() === '') return fallback;
	const value = Number(raw);
	return Number.isFinite(value) ? clamp(value, minimum, maximum) : fallback;
}

function booleanParameter(params: URLSearchParams, name: string, fallback: boolean): boolean {
	const value = params.get(name);
	if (value === null) return fallback;
	if (value === '1' || value === 'true') return true;
	if (value === '0' || value === 'false') return false;
	return fallback;
}

function enumParameter<T extends string>(
	params: URLSearchParams,
	name: string,
	values: ReadonlySet<T>,
	fallback: T
): T {
	const value = params.get(name) as T | null;
	return value !== null && values.has(value) ? value : fallback;
}

function parseFeatures(value: string | null): PlacedFeature[] {
	if (!value || value.length > 3_200) return [];
	const features: PlacedFeature[] = [];
	const usedIds = new Set<string>();
	for (const [index, encoded] of value.split(';').entries()) {
		if (features.length >= ENGINE_LIMITS.maximumPlacedFeatures) break;
		const [kindValue, xValue, zValue, rotationValue, idValue] = encoded.split('@');
		const kind = kindValue as PlaceableFeatureKind;
		if (!placeableKinds.has(kind)) continue;
		const x = Number(xValue);
		const z = Number(zValue);
		const rotation = Number(rotationValue);
		if (![x, z, rotation].every(Number.isFinite)) continue;
		const requestedId =
			idValue && /^[a-z0-9][a-z0-9-]{0,47}$/.test(idValue)
				? idValue
				: `placed-${hashString(`${encoded}|${index}`).toString(16)}`;
		let id = requestedId;
		let collisionIndex = 1;
		while (usedIds.has(id)) {
			id = `${requestedId.slice(0, 42)}-${collisionIndex}`;
			collisionIndex += 1;
		}
		usedIds.add(id);
		features.push({
			id,
			kind,
			x: clamp(x, 0, 1),
			z: clamp(z, 0, 1),
			rotation: ((rotation % 360) + 360) % 360
		});
	}
	return features;
}

function sourceParams(source: string | URL | URLSearchParams): URLSearchParams {
	if (source instanceof URLSearchParams) return source;
	if (source instanceof URL) return source.searchParams;
	if (source.startsWith('?')) return new URLSearchParams(source.slice(1));
	if (!source.includes('?') && (source.includes('=') || source.includes('&'))) {
		return new URLSearchParams(source);
	}
	try {
		return new URL(source, 'https://example.invalid').searchParams;
	} catch {
		return new URLSearchParams(source);
	}
}

export function parseAtlasState(source: string | URL | URLSearchParams): SerializableAtlasState {
	const params = sourceParams(source);
	const version = params.get('v');
	if (version !== null && version !== '1') return cloneDefaultState();
	const encodedScale = params.get('scale') as StrikeScale | null;
	const isLegacyV1Link = version === '1' && (!encodedScale || !strikeScales.has(encodedScale));
	const state = isLegacyV1Link ? cloneState(LEGACY_V1_DEFAULT_ATLAS_STATE) : cloneDefaultState();
	const terrainValue = params.get('terrain') as TerrainPresetId | null;
	if (terrainValue && TERRAIN_PRESET_IDS.includes(terrainValue)) {
		state.terrain = terrainValue;
		state.storm.cloudBaseMetres = terrainPreset(terrainValue).cloudBaseMetres;
		state.environment.surfaceWetness = terrainPreset(terrainValue).defaultWetness;
	}
	const seed = params.get('seed')?.trim();
	if (seed) state.seed = seed.replace(/[^a-zA-Z0-9._~-]/g, '-').slice(0, 64) || state.seed;
	state.mode = enumParameter(params, 'mode', atlasModes, state.mode);
	state.displayMode = enumParameter(params, 'display', displayModes, state.displayMode);
	state.flashType = enumParameter(params, 'flash', flashTypes, state.flashType);
	state.strikeScale = enumParameter(params, 'scale', strikeScales, state.strikeScale);
	state.cameraPreset = enumParameter(params, 'view', cameraPresets, state.cameraPreset);
	state.quality = enumParameter(params, 'quality', qualityChoices, state.quality);
	state.stormPosition = {
		x: numberParameter(params, 'stormX', state.stormPosition.x, 0, 1),
		z: numberParameter(params, 'stormZ', state.stormPosition.z, 0, 1)
	};
	state.observer = {
		x: numberParameter(params, 'observerX', state.observer.x, 0, 1),
		z: numberParameter(params, 'observerZ', state.observer.z, 0, 1)
	};
	state.storm = {
		chargeStrength: numberParameter(params, 'charge', state.storm.chargeStrength, 0.2, 1),
		chargeSeparation: numberParameter(params, 'separation', state.storm.chargeSeparation, 0.15, 1),
		branching: numberParameter(params, 'branching', state.storm.branching, 0, 1),
		leaderPersistence: numberParameter(
			params,
			'persistence',
			state.storm.leaderPersistence,
			0.1,
			1
		),
		cloudBaseMetres: Math.round(
			numberParameter(params, 'cloudBase', state.storm.cloudBaseMetres / 1_000, 0.45, 4.5) * 1_000
		),
		lowerPositiveCharge: booleanParameter(params, 'lowerPositive', state.storm.lowerPositiveCharge)
	};
	state.environment = {
		windSpeed: numberParameter(params, 'windSpeed', state.environment.windSpeed, 0, 45),
		windDirection: numberParameter(
			params,
			'windDirection',
			state.environment.windDirection,
			0,
			359
		),
		rainIntensity: numberParameter(params, 'rain', state.environment.rainIntensity, 0, 1),
		visibility: numberParameter(params, 'visibility', state.environment.visibility, 0.1, 1),
		surfaceWetness: numberParameter(params, 'wetness', state.environment.surfaceWetness, 0, 1),
		conductivityProxy: numberParameter(
			params,
			'conductivity',
			state.environment.conductivityProxy,
			0,
			1
		),
		timeOfDay: numberParameter(params, 'time', state.environment.timeOfDay, 0, 1)
	};
	const layerValue = params.get('layers');
	if (layerValue !== null) {
		state.visibleLayers =
			layerValue === '' || layerValue === 'none'
				? []
				: Array.from(
						new Set(
							layerValue
								.split(',')
								.filter((layer): layer is LayerId => layerIds.has(layer as LayerId))
						)
					);
	}
	state.selectedStrikeIndex = Math.round(
		numberParameter(
			params,
			'strike',
			state.selectedStrikeIndex,
			0,
			ENGINE_LIMITS.maximumStrikeIndex
		)
	);
	state.placedFeatures = parseFeatures(params.get('features'));
	state.flashSafe = booleanParameter(params, 'flashSafe', state.flashSafe);
	return state;
}

const rounded = (value: number, digits = 3) => Number(value.toFixed(digits)).toString();

function setIfChanged(
	params: URLSearchParams,
	name: string,
	value: string | number | boolean,
	fallback: string | number | boolean
) {
	if (value !== fallback) params.set(name, String(value));
}

function encodeFeatures(features: readonly PlacedFeature[]): string {
	return features
		.slice(0, ENGINE_LIMITS.maximumPlacedFeatures)
		.map(
			(feature) =>
				`${feature.kind}@${feature.x.toString()}@${feature.z.toString()}@${feature.rotation.toString()}@${feature.id
					.toLocaleLowerCase('en')
					.replace(/[^a-z0-9-]/g, '')
					.slice(0, 48)}`
		)
		.join(';');
}

export function serializeAtlasState(state: SerializableAtlasState): URLSearchParams {
	const params = new URLSearchParams();
	const selectedTerrain = terrainPreset(state.terrain);
	params.set('v', '1');
	setIfChanged(params, 'seed', state.seed, DEFAULT_ATLAS_STATE.seed);
	setIfChanged(params, 'terrain', state.terrain, DEFAULT_ATLAS_STATE.terrain);
	setIfChanged(params, 'mode', state.mode, DEFAULT_ATLAS_STATE.mode);
	setIfChanged(params, 'display', state.displayMode, DEFAULT_ATLAS_STATE.displayMode);
	setIfChanged(params, 'flash', state.flashType, DEFAULT_ATLAS_STATE.flashType);
	// Always encode morphology so newly shared v1 links are distinguishable from pre-1.1 links.
	params.set('scale', state.strikeScale);
	setIfChanged(
		params,
		'stormX',
		rounded(state.stormPosition.x),
		rounded(DEFAULT_ATLAS_STATE.stormPosition.x)
	);
	setIfChanged(
		params,
		'stormZ',
		rounded(state.stormPosition.z),
		rounded(DEFAULT_ATLAS_STATE.stormPosition.z)
	);
	setIfChanged(
		params,
		'charge',
		rounded(state.storm.chargeStrength),
		rounded(DEFAULT_ATLAS_STATE.storm.chargeStrength)
	);
	setIfChanged(
		params,
		'separation',
		rounded(state.storm.chargeSeparation),
		rounded(DEFAULT_ATLAS_STATE.storm.chargeSeparation)
	);
	setIfChanged(
		params,
		'branching',
		rounded(state.storm.branching),
		rounded(DEFAULT_ATLAS_STATE.storm.branching)
	);
	setIfChanged(
		params,
		'persistence',
		rounded(state.storm.leaderPersistence),
		rounded(DEFAULT_ATLAS_STATE.storm.leaderPersistence)
	);
	setIfChanged(
		params,
		'cloudBase',
		rounded(state.storm.cloudBaseMetres / 1_000),
		rounded(selectedTerrain.cloudBaseMetres / 1_000)
	);
	setIfChanged(
		params,
		'lowerPositive',
		state.storm.lowerPositiveCharge ? 1 : 0,
		DEFAULT_ATLAS_STATE.storm.lowerPositiveCharge ? 1 : 0
	);
	setIfChanged(
		params,
		'windSpeed',
		rounded(state.environment.windSpeed, 1),
		rounded(DEFAULT_ATLAS_STATE.environment.windSpeed, 1)
	);
	setIfChanged(
		params,
		'windDirection',
		rounded(state.environment.windDirection, 0),
		rounded(DEFAULT_ATLAS_STATE.environment.windDirection, 0)
	);
	setIfChanged(
		params,
		'rain',
		rounded(state.environment.rainIntensity),
		rounded(DEFAULT_ATLAS_STATE.environment.rainIntensity)
	);
	setIfChanged(
		params,
		'visibility',
		rounded(state.environment.visibility),
		rounded(DEFAULT_ATLAS_STATE.environment.visibility)
	);
	setIfChanged(
		params,
		'wetness',
		rounded(state.environment.surfaceWetness),
		rounded(selectedTerrain.defaultWetness)
	);
	setIfChanged(
		params,
		'conductivity',
		rounded(state.environment.conductivityProxy),
		rounded(DEFAULT_ATLAS_STATE.environment.conductivityProxy)
	);
	setIfChanged(
		params,
		'time',
		rounded(state.environment.timeOfDay),
		rounded(DEFAULT_ATLAS_STATE.environment.timeOfDay)
	);
	setIfChanged(
		params,
		'observerX',
		rounded(state.observer.x),
		rounded(DEFAULT_ATLAS_STATE.observer.x)
	);
	setIfChanged(
		params,
		'observerZ',
		rounded(state.observer.z),
		rounded(DEFAULT_ATLAS_STATE.observer.z)
	);
	setIfChanged(
		params,
		'strike',
		state.selectedStrikeIndex,
		DEFAULT_ATLAS_STATE.selectedStrikeIndex
	);
	// Always encode the camera so newly shared links are distinguishable from pre-1.1 links.
	params.set('view', state.cameraPreset);
	setIfChanged(params, 'quality', state.quality, DEFAULT_ATLAS_STATE.quality);
	setIfChanged(params, 'flashSafe', state.flashSafe ? 1 : 0, DEFAULT_ATLAS_STATE.flashSafe ? 1 : 0);
	if (state.visibleLayers.join(',') !== DEFAULT_ATLAS_STATE.visibleLayers.join(',')) {
		params.set('layers', state.visibleLayers.length ? state.visibleLayers.join(',') : 'none');
	}
	if (state.placedFeatures.length) params.set('features', encodeFeatures(state.placedFeatures));
	return params;
}

export function atlasStateQuery(state: SerializableAtlasState): string {
	const query = serializeAtlasState(state).toString();
	return query ? `?${query}` : '';
}

export function settingsText(state: SerializableAtlasState): string {
	return [
		'Lightning Atlas model settings',
		`Seed: ${state.seed}`,
		`Terrain: ${terrainPreset(state.terrain).name}`,
		`Mode: ${state.mode}`,
		`Flash choice: ${state.flashType}`,
		`Strike scale: ${state.strikeScale}`,
		`Storm position: ${rounded(state.stormPosition.x)}, ${rounded(state.stormPosition.z)}`,
		`Cloud base: ${(state.storm.cloudBaseMetres / 1_000).toFixed(2)} km`,
		`Relative charge: ${state.storm.chargeStrength.toFixed(2)}`,
		`Branching: ${state.storm.branching.toFixed(2)}`,
		`Surface wetness: ${state.environment.surfaceWetness.toFixed(2)}`,
		`Observer position: ${rounded(state.observer.x)}, ${rounded(state.observer.z)}`,
		`Placed features: ${state.placedFeatures.length}`,
		'All electrical values are normalised model proxies.'
	].join('\n');
}
