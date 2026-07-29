export const MOTION_PREFERENCES = ['system', 'still', 'gentle', 'alive'] as const;

export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

export const RESOLVED_MOTIONS = ['still', 'gentle', 'alive'] as const;

export type ResolvedMotion = (typeof RESOLVED_MOTIONS)[number];

export const ROUTE_BIOMES = [
	'home',
	'writing',
	'healthcare',
	'calcutta',
	'lab',
	'notes',
	'quiet',
	'off'
] as const;

export type RouteBiome = (typeof ROUTE_BIOMES)[number];

/**
 * Describes how much of the route may receive atmospheric treatment. `header-only`
 * is intentionally distinct from `quiet`: article bodies must remain still even
 * when their header has a subtle field.
 */
export const MOTION_INTENSITIES = ['off', 'minimal', 'quiet', 'header-only', 'standard'] as const;

export type MotionIntensity = (typeof MOTION_INTENSITIES)[number];

/**
 * `static` keeps the theme-adaptive SSR atmosphere but prevents the Canvas loop.
 * It is used by routes such as the visualizations index that already own a loop.
 */
export const AMBIENT_FIELD_MODES = ['off', 'static', 'animated'] as const;

export type AmbientFieldMode = (typeof AMBIENT_FIELD_MODES)[number];

/**
 * A header-scoped atmosphere stays mounted for the route but pauses its Canvas
 * enhancement after the marked header leaves the viewport.
 */
export const ATMOSPHERE_SCOPES = ['viewport', 'header'] as const;

export type AtmosphereScope = (typeof ATMOSPHERE_SCOPES)[number];

export interface RouteMotionConfig {
	readonly biome: RouteBiome;
	readonly intensity: MotionIntensity;
	readonly ambient: AmbientFieldMode;
	readonly scope?: AtmosphereScope;
}
