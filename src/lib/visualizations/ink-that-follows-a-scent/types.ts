export const INK_FOLLOWS_SCENT_ENGINE_VERSION = '1.0.0';

export const LOGICAL_WIDTH = 256;
export const LOGICAL_HEIGHT = 192;

export const TRAIL_WIDTH = 512;
export const TRAIL_HEIGHT = 384;

export const FIXED_TIMESTEP = 1 / 60;

export const DESKTOP_PARTICLE_COUNT = 5000;
export const CONSTRAINED_PARTICLE_COUNT = 2400;

export const DEFAULT_SEED = 2026;

export const DEFAULT_SOURCE_X = 158;
export const DEFAULT_SOURCE_Y = 96;
export const DEFAULT_SOURCE_SIGMA = 44;
export const DEFAULT_SOURCE_AMPLITUDE = 0.92;

/**
 * Maximum drift velocity in logical units per simulation second.
 * Bounds particle movement if a visitor paints an unusually steep gradient
 * while preserving gradient magnitude everywhere below the cap.
 */
export const MAX_DRIFT_SPEED = 48;

/**
 * Conversion factors from readable UI settings to physical model units:
 * - sensitivity setting 1.0 -> chi = 360 logical units^2 / s
 * - randomWandering setting 1.0 -> D = 80 logical units^2 / s
 */
export const SENSITIVITY_SCALE = 360;
export const DIFFUSION_SCALE = 80;

export type PresetId = 'one-source' | 'curved-line';
export type ToolMode = 'paint' | 'erase' | 'move-source';

export interface SimulationSettings {
	/** Gradient response strength (UI scale 0.0 to 2.5, default 1.2). */
	sensitivity: number;
	/** Random wandering strength D (UI scale 0.2 to 2.5, default 1.0). */
	randomWandering: number;
	/** Trail fading time constant in simulation seconds (4 to 30, default 14). */
	trailDuration: number;
	/** Brush radius in logical domain units (8 to 42, default 22). */
	brushSize: number;
}

export interface PresetDefinition {
	id: PresetId;
	label: string;
	shortDescription: string;
	defaultSettings: SimulationSettings;
	sourceActive: boolean;
	sourceX: number;
	sourceY: number;
}

export interface EngineConfig {
	presetId?: PresetId;
	seed?: number;
	particleCount?: number;
	timestep?: number;
	settings?: Partial<SimulationSettings>;
	sensingEnabled?: boolean;
}

export type SimulationEditEvent =
	| {
			step: number;
			type: 'paint';
			x0: number;
			y0: number;
			x1: number;
			y1: number;
			radius: number;
			strength?: number;
	  }
	| {
			step: number;
			type: 'erase';
			x0: number;
			y0: number;
			x1: number;
			y1: number;
			radius: number;
			strength?: number;
	  }
	| {
			step: number;
			type: 'move-source';
			x: number;
			y: number;
	  }
	| {
			step: number;
			type: 'clear-chemical';
	  }
	| {
			step: number;
			type: 'clear-trails';
	  }
	| {
			step: number;
			type: 'set-sensing';
			enabled: boolean;
	  }
	| {
			step: number;
			type: 'set-settings';
			settings: Partial<SimulationSettings>;
	  };

export interface RunTelemetry {
	averageChemical: number;
	uphillStepFraction: number;
	maxTrailIntensity: number;
	meanTrailIntensity: number;
}

export interface RunSnapshot {
	particleCount: number;
	px: Float32Array;
	py: Float32Array;
	trailBuffer: Float32Array;
	trailWidth: number;
	trailHeight: number;
	sensitivity: number;
	telemetry: RunTelemetry;
}

export interface ChemicalFieldSnapshot {
	width: number;
	height: number;
	combinedGrid: Float32Array;
	paintedGrid: Float32Array;
	gradX: Float32Array;
	gradY: Float32Array;
	sourceActive: boolean;
	sourceX: number;
	sourceY: number;
	maxConcentration: number;
}

export interface PairedEngineSnapshot {
	seed: number;
	stepCount: number;
	simulationTime: number;
	timestep: number;
	presetId: PresetId;
	sensingEnabled: boolean;
	settings: SimulationSettings;
	field: ChemicalFieldSnapshot;
	sensingOn: RunSnapshot;
	sensingOff: RunSnapshot;
}

export interface DisplayOptions {
	showChemical?: boolean;
	showParticles?: boolean;
}
