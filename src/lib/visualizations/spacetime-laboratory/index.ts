export {
	SPACETIME_PRESETS,
	applyPreset,
	decodeStateFromQuery,
	encodeStateToQuery,
	isSpacetimeModel,
	sanitizeState
} from './spacetimeState';

export {
	DEFAULT_DISK,
	DEFAULT_OBSERVER,
	DEFAULT_OVERLAYS,
	DEFAULT_PARAMETERS,
	DEFAULT_SKY,
	DEFAULT_STATE,
	MODEL_IDS,
	QUALITY_PRESETS,
	SPACETIME_MODELS
} from './spacetimeTypes';

export type {
	DiskState,
	ObserverState,
	OverlayKey,
	OverlayState,
	QualityLevel,
	RenderQuality,
	SkyState,
	SpacetimeModel,
	SpacetimeParameters,
	SpacetimePreset,
	SpacetimeState
} from './spacetimeTypes';

export const SPACETIME_LAB_METADATA = {
	id: 'spacetime-laboratory',
	title: 'Spacetime Laboratory',
	description:
		'Nine universes from one equation: trace light through known solutions of the Einstein field equation.',
	poster: '/images/spacetime-laboratory-einstein-equations.webp',
	posterAlt:
		'A black hole lensing a field of stars and galaxies into arcs beside a luminous accretion disk'
} as const;
