export const ART_MODES = ['watercolor', 'oil', 'hybrid'] as const;
export type ArtMode = (typeof ART_MODES)[number];

export const BRUSH_TYPES = [
	'round',
	'wash',
	'flat',
	'dry',
	'dropper',
	'knife',
	'water',
	'lifter',
	'clear'
] as const;
export type BrushType = (typeof BRUSH_TYPES)[number];

export const BACKGROUND_MODES = [
	'clean',
	'handmade',
	'canvas',
	'wet-field',
	'pigment-cloud',
	'atmospheric-wash',
	'random-pigments',
	'dark-ground',
	'custom'
] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

export const COLOR_MODES = ['single', 'gradient', 'controlled-random', 'shuffle'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const PHYSICS_OVERLAYS = [
	'artwork',
	'moisture',
	'pigment',
	'velocity',
	'drying',
	'grain',
	'deposited'
] as const;
export type PhysicsOverlay = (typeof PHYSICS_OVERLAYS)[number];

export type ColorHarmony = 'analogous' | 'earth' | 'monsoon' | 'complementary' | 'quiet';

export interface PigmentProperties {
	id: string;
	name: string;
	hex: `#${string}`;
	absorption: readonly [number, number, number];
	diffusion: number;
	granulation: number;
	staining: number;
	density: number;
}

export interface BrushDefinition {
	id: BrushType;
	name: string;
	description: string;
	pigmentScale: number;
	waterScale: number;
	flowScale: number;
}

export interface BackgroundSettings {
	mode: BackgroundMode;
	seed: number;
	regions: number;
	harmony: ColorHarmony;
	moisture: number;
	turbulence: number;
	scale: number;
	symmetry: number;
	intensity: number;
	customColor: `#${string}`;
}

export interface SimulationSettings {
	mode: ArtMode;
	brush: BrushType;
	brushSize: number;
	pigmentAmount: number;
	transparency: number;
	waterAmount: number;
	diffusion: number;
	surfaceMoisture: number;
	dryingSpeed: number;
	viscosity: number;
	flowStrength: number;
	turbulence: number;
	granulation: number;
	edgeDarkening: number;
	mixingStrength: number;
	textureStrength: number;
	simulationSpeed: number;
	eraserStrength: number;
	eraserSoftness: number;
	wetLifting: boolean;
	quality: QualityLevel;
	overlay: PhysicsOverlay;
	colorMode: ColorMode;
	primaryPigmentId: string;
	secondaryPigmentId: string;
	paletteIds: string[];
	background: BackgroundSettings;
}

export interface StudioPreset {
	id: string;
	name: string;
	description: string;
	settings: Partial<Omit<SimulationSettings, 'background'>> & {
		background?: Partial<BackgroundSettings>;
	};
}

export interface StrokePoint {
	x: number;
	y: number;
	pressure: number;
	tiltX: number;
	tiltY: number;
	time: number;
}

export interface BrushInjection {
	from: StrokePoint;
	to: StrokePoint;
	color: readonly [number, number, number];
	granulation: number;
	staining: number;
	density: number;
}

export interface EngineDiagnostics {
	resolution: string;
	fps: number;
	textureFormat: 'RGBA16F' | 'RGBA8';
	paused: boolean;
	pressureDetected: boolean;
	contextLost: boolean;
}

export interface ProjectFieldData {
	state: Uint8Array;
	deposit: Uint8Array;
	flow: Uint8Array;
}

export interface SavedProjectMetadata {
	version: 1;
	width: number;
	height: number;
	createdAt: string;
	settings: SimulationSettings;
	customColor?: string;
}

export interface DecodedProject {
	metadata: SavedProjectMetadata;
	fields: ProjectFieldData;
}
