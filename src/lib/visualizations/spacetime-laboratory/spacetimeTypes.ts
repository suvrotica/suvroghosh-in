export type SpacetimeModel =
	| 'minkowski'
	| 'weak-field'
	| 'schwarzschild'
	| 'kerr'
	| 'reissner-nordstrom'
	| 'flrw'
	| 'de-sitter'
	| 'anti-de-sitter'
	| 'gravitational-wave';

export const SPACETIME_MODELS: readonly SpacetimeModel[] = [
	'minkowski',
	'weak-field',
	'schwarzschild',
	'kerr',
	'reissner-nordstrom',
	'flrw',
	'de-sitter',
	'anti-de-sitter',
	'gravitational-wave'
];

/** Integer ids mirror the u_mode uniform in the shader suite. */
export const MODEL_IDS: Record<SpacetimeModel, number> = {
	minkowski: 0,
	'weak-field': 1,
	schwarzschild: 2,
	kerr: 3,
	'reissner-nordstrom': 4,
	flrw: 5,
	'de-sitter': 6,
	'anti-de-sitter': 7,
	'gravitational-wave': 8
};

export type Vec3 = [number, number, number];

export interface ObserverState {
	/** Distance from the centre of the scene, in scene units (Schwarzschild radii where relevant). */
	distance: number;
	/** Camera orbit azimuth, degrees. */
	azimuthDeg: number;
	/** Camera orbit inclination above the equatorial plane, degrees. */
	elevationDeg: number;
	/** Vertical field of view, degrees. */
	fieldOfViewDeg: number;
	/** Observer proper time accumulated in the lab, seconds of simulation time. */
	properTime: number;
}

export interface RenderQuality {
	resolutionScale: number;
	integrationSteps: number;
	adaptiveSteps: boolean;
	diskSamples: number;
}

export type QualityLevel = 'low' | 'medium' | 'high' | 'research';

export const QUALITY_PRESETS: Record<QualityLevel, RenderQuality> = {
	low: { resolutionScale: 0.55, integrationSteps: 56, adaptiveSteps: true, diskSamples: 1 },
	medium: { resolutionScale: 0.75, integrationSteps: 96, adaptiveSteps: true, diskSamples: 1 },
	high: { resolutionScale: 1, integrationSteps: 144, adaptiveSteps: true, diskSamples: 2 },
	research: { resolutionScale: 1, integrationSteps: 224, adaptiveSteps: true, diskSamples: 3 }
};

export type OverlayKey =
	| 'grid'
	| 'photonPaths'
	| 'horizon'
	| 'photonSphere'
	| 'isco'
	| 'ergosphere'
	| 'redshiftMap'
	| 'labels';

export type OverlayState = Record<OverlayKey, boolean>;

export interface SkyState {
	starDensity: number;
	galaxies: boolean;
	milkyWay: boolean;
	cmb: boolean;
	seed: number;
}

export interface DiskState {
	innerRadius: number;
	outerRadius: number;
	temperature: number;
	beaming: boolean;
}

export type TimeScaleMode = 'physical' | 'exaggerated';

export interface SpacetimeParameters {
	/** Black-hole mass in solar masses (compact-object modes). */
	massSolar: number;
	/** Weak-field mass expressed as a compactness GM/(rc^2) at the reference radius. */
	weakCompactness: number;
	weakExaggeration: number;
	weakMode: TimeScaleMode;
	/** Kerr dimensionless spin a/M in [0, 1]; near-extremal cap 0.998. */
	kerrSpin: number;
	/** Reissner–Nordstrom normalized charge Q/Q_extremal in [0, 1]. */
	rnCharge: number;
	flrwCurvature: -1 | 0 | 1;
	omegaMatter: number;
	omegaRadiation: number;
	omegaLambda: number;
	/** Hubble constant in km/s/Mpc for display; internally normalized. */
	hubble: number;
	flrwTime: number;
	flrwSpeed: number;
	flrwView: 'comoving' | 'proper';
	/** de Sitter mode Hubble rate, normalized. */
	lambdaH0: number;
	/** anti-de-Sitter curvature scale L, normalized. */
	adSLength: number;
	gwPolarization: 'plus' | 'cross';
	gwAmplitude: number;
	gwFrequency: number;
	gwPhase: number;
	gwChirp: boolean;
	gwScale: TimeScaleMode;
	gwRing: boolean;
	gwArms: boolean;
	/** Educational exaggeration multiplier applied on top of physical strain. */
	gwExaggeration: number;
}

export interface SpacetimeState {
	model: SpacetimeModel;
	compare: boolean;
	compareModel: SpacetimeModel;
	compareSplit: number;
	params: SpacetimeParameters;
	observer: ObserverState;
	overlays: OverlayState;
	sky: SkyState;
	disk: DiskState;
	quality: QualityLevel;
	playing: boolean;
	simulationSpeed: number;
	showLabels: boolean;
}

export interface SpacetimePreset {
	id: string;
	label: string;
	description: string;
	state: Partial<SpacetimeState> & { model?: SpacetimeModel };
}

export const DEFAULT_PARAMETERS: SpacetimeParameters = {
	massSolar: 4.3e6,
	weakCompactness: 0.06,
	weakExaggeration: 1,
	weakMode: 'exaggerated',
	kerrSpin: 0.7,
	rnCharge: 0.6,
	flrwCurvature: 0,
	omegaMatter: 0.31,
	omegaRadiation: 9e-5,
	omegaLambda: 0.69,
	hubble: 70,
	flrwTime: 0,
	flrwSpeed: 0.35,
	flrwView: 'comoving',
	lambdaH0: 0.55,
	adSLength: 0.55,
	gwPolarization: 'plus',
	gwAmplitude: 0.55,
	gwFrequency: 0.5,
	gwPhase: 0,
	gwChirp: false,
	gwScale: 'exaggerated',
	gwRing: true,
	gwArms: true,
	gwExaggeration: 1e21
};

export const DEFAULT_OBSERVER: ObserverState = {
	distance: 10,
	azimuthDeg: 90,
	elevationDeg: 20,
	fieldOfViewDeg: 58,
	properTime: 0
};

export const DEFAULT_OVERLAYS: OverlayState = {
	grid: true,
	photonPaths: false,
	horizon: true,
	photonSphere: false,
	isco: false,
	ergosphere: false,
	redshiftMap: false,
	labels: true
};

export const DEFAULT_SKY: SkyState = {
	starDensity: 1,
	galaxies: true,
	milkyWay: true,
	cmb: false,
	seed: 1337
};

export const DEFAULT_DISK: DiskState = {
	innerRadius: 3.2,
	outerRadius: 14,
	temperature: 1,
	beaming: true
};

export const DEFAULT_STATE: SpacetimeState = {
	model: 'minkowski',
	compare: false,
	compareModel: 'schwarzschild',
	compareSplit: 0.5,
	params: DEFAULT_PARAMETERS,
	observer: DEFAULT_OBSERVER,
	overlays: DEFAULT_OVERLAYS,
	sky: DEFAULT_SKY,
	disk: DEFAULT_DISK,
	quality: 'medium',
	playing: true,
	simulationSpeed: 1,
	showLabels: true
};
