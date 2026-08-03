import type {
	EngineLimits,
	FlashType,
	PhaseEvent,
	PlaceableFeatureKind,
	SerializableAtlasState,
	StormPhase,
	TerrainPresetDefinition,
	TerrainPresetId
} from './types';

export const MODEL_VERSION = 'lightning-atlas-1.0.0';
export const SPEED_OF_SOUND_METRES_PER_SECOND = 343;

export const ENGINE_LIMITS: EngineLimits = {
	maximumIterations: 128,
	maximumSegments: 680,
	maximumActiveTips: 18,
	maximumBranchDepth: 4,
	maximumPlacedFeatures: 20,
	maximumStrikeIndex: 999,
	minimumSegmentMetres: 42,
	maximumSegmentMetres: 170
};

export const TERRAIN_PRESETS: readonly TerrainPresetDefinition[] = [
	{
		id: 'monsoon-delta',
		name: 'Monsoon Delta',
		shortName: 'Delta',
		region: 'Lower Gangetic delta study',
		description: 'Flooded fields, distributaries, tree clusters and an isolated water tower.',
		studyNote:
			'Wet ground alters the qualitative current footprint; it is not an attraction bonus.',
		cloudBaseMetres: 980,
		defaultWetness: 0.82,
		accent: '#7dd3c7'
	},
	{
		id: 'himalayan-ridge',
		name: 'Himalayan Ridge',
		shortName: 'Ridge',
		region: 'High-relief ridge study',
		description: 'Steep ridges, deep valleys, exposed summits and clouds crossing the crest.',
		studyNote: 'A lower ridge beneath the charge centre can compete with a taller remote summit.',
		cloudBaseMetres: 2100,
		defaultWetness: 0.42,
		accent: '#cbd5e1'
	},
	{
		id: 'coastal-shelf',
		name: 'Coastal Shelf',
		shortName: 'Coast',
		region: 'Cliff and shelf study',
		description: 'A sloping shelf, wind-cut cliff, lighthouse and sparse coastal settlement.',
		studyNote: 'Land, exposed structures and the water surface all remain possible attachments.',
		cloudBaseMetres: 1250,
		defaultWetness: 0.7,
		accent: '#86c5da'
	},
	{
		id: 'forest-basin',
		name: 'Forest Basin',
		shortName: 'Forest',
		region: 'Canopy and emergent-tree study',
		description: 'Rolling terrain, dense canopy, mist and several isolated emergent trees.',
		studyNote: 'Canopy height and the local prominence of one tree are treated separately.',
		cloudBaseMetres: 1350,
		defaultWetness: 0.64,
		accent: '#8fb996'
	},
	{
		id: 'desert-escarpment',
		name: 'Desert Escarpment',
		shortName: 'Desert',
		region: 'Mesa and dry-channel study',
		description: 'Terraced mesas, dry channels, bare ridges and one isolated utility structure.',
		studyNote: 'Height and isolation dominate more strongly than the modest material proxy.',
		cloudBaseMetres: 2300,
		defaultWetness: 0.12,
		accent: '#d8ad79'
	},
	{
		id: 'urban-plain',
		name: 'Urban Plain',
		shortName: 'City',
		region: 'Dense built-environment study',
		description:
			'Low-rise blocks, towers, rooftop tanks, rods, antennas and transmission structures.',
		studyNote: 'Exposed structures often launch strong streamers, but none is guaranteed to win.',
		cloudBaseMetres: 1450,
		defaultWetness: 0.48,
		accent: '#f3b562'
	},
	{
		id: 'open-ocean',
		name: 'Open Ocean',
		shortName: 'Ocean',
		region: 'Open-water and platform study',
		description: 'A broad sea beneath a rain shaft, with a ship, buoy and offshore platform.',
		studyNote:
			'Surface strikes and structure attachments are distinct; the sea receives no magic bonus.',
		cloudBaseMetres: 1100,
		defaultWetness: 1,
		accent: '#64b5d4'
	},
	{
		id: 'volcanic-island',
		name: 'Volcanic Island',
		shortName: 'Volcano',
		region: 'Experimental ash-plume study',
		description: 'A volcanic cone, crater, surrounding sea and a separately charged ash plume.',
		studyNote: 'Ash-plume electrification differs from ordinary thunderstorm charge separation.',
		cloudBaseMetres: 1850,
		defaultWetness: 0.36,
		accent: '#d08c60',
		experimental: true
	}
] as const;

export const TERRAIN_PRESET_IDS = TERRAIN_PRESETS.map((preset) => preset.id);

export function terrainPreset(id: TerrainPresetId) {
	return TERRAIN_PRESETS.find((preset) => preset.id === id) ?? TERRAIN_PRESETS[0];
}

export const FEATURE_LABELS: Record<PlaceableFeatureKind, string> = {
	tree: 'Lone tree',
	'tree-cluster': 'Tree cluster',
	'radio-mast': 'Radio mast',
	'lightning-rod': 'Lightning rod',
	'low-building': 'Low building',
	'high-rise': 'High-rise',
	'water-tower': 'Water tower',
	'wind-turbine': 'Wind turbine',
	'transmission-tower': 'Transmission tower',
	lighthouse: 'Lighthouse'
};

export const PLACEABLE_FEATURES = Object.entries(FEATURE_LABELS).map(([id, label]) => ({
	id: id as PlaceableFeatureKind,
	label
}));

export const PHASE_LABELS: Record<StormPhase, string> = {
	charging: 'Charging',
	'cloud-breakdown': 'Cloud breakdown',
	leader: 'Leader descending',
	streamers: 'Streamers rising',
	attachment: 'Attachment',
	'return-stroke': 'Return stroke',
	'in-cloud-pulse': 'In-cloud current pulse',
	'subsequent-stroke': 'Subsequent stroke',
	afterglow: 'Afterglow',
	'thunder-pending': 'Thunder travelling',
	recharging: 'Recharging'
};

const PHASE_DURATIONS: Record<StormPhase, number> = {
	charging: 1.1,
	'cloud-breakdown': 0.55,
	leader: 2.4,
	streamers: 0.75,
	attachment: 0.22,
	'return-stroke': 0.7,
	'in-cloud-pulse': 0.8,
	'subsequent-stroke': 0.55,
	afterglow: 1.35,
	'thunder-pending': 1,
	recharging: 1.1
};

export function createPhaseEvents(
	flashType: FlashType,
	hasSubsequentStroke: boolean,
	thunderDelaySeconds: number,
	segmentCount: number
): PhaseEvent[] {
	const hasAttachment = flashType !== 'intra-cloud';
	const phases: StormPhase[] = ['charging', 'cloud-breakdown', 'leader'];
	if (hasAttachment) phases.push('streamers', 'attachment');
	phases.push(hasAttachment ? 'return-stroke' : 'in-cloud-pulse');
	if (hasSubsequentStroke) phases.push('subsequent-stroke');
	phases.push('afterglow', 'thunder-pending', 'recharging');

	let time = 0;
	let dischargeStart = 0;
	return phases.map((phase) => {
		if (phase === 'return-stroke' || phase === 'in-cloud-pulse') dischargeStart = time;
		const remainingThunderTravel = dischargeStart + thunderDelaySeconds - time;
		const duration =
			phase === 'thunder-pending' ? Math.max(0.2, remainingThunderTravel) : PHASE_DURATIONS[phase];
		const event: PhaseEvent = {
			phase,
			startTime: time,
			endTime: time + duration,
			label:
				phase === 'thunder-pending' && remainingThunderTravel <= 0
					? 'Thunder arrival registered'
					: PHASE_LABELS[phase]
		};
		if (phase === 'leader') event.segmentRange = [0, Math.max(0, segmentCount - 1)];
		time += duration;
		return event;
	});
}

export const DEFAULT_ATLAS_STATE: SerializableAtlasState = {
	version: 1,
	seed: 'monsoon-1975',
	terrain: 'monsoon-delta',
	mode: 'live',
	displayMode: 'night',
	flashType: 'storm-decides',
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
