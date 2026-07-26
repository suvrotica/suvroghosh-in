export const DEFAULT_GRID_SIZE = 192;
export const DETECTOR_HALF_SPAN = Math.SQRT2;

export enum MaterialId {
	Air = 0,
	SoftTissue = 1,
	Bone = 2,
	LesionLow = 3,
	LesionHigh = 4,
	Metal = 5
}

export type PhantomPresetId =
	| 'simple-circles'
	| 'head'
	| 'lungs'
	| 'abdomen'
	| 'hidden-lesion'
	| 'sparse'
	| 'metal'
	| 'blank';

export type BeamModel = 'monochromatic' | 'polychromatic';
export type FilterName = 'ramp' | 'shepp-logan' | 'cosine' | 'hann' | 'hamming';

/**
 * A square synthetic attenuation phantom. Pixels are stored row-major with
 * y = +1 at row zero and y = -1 at the final row.
 */
export interface Phantom {
	size: number;
	materials: Uint8Array;
	density: Float32Array;
	revision: number;
}

export interface AcquisitionSettings {
	projectionCount: number;
	detectorCount: number;
	/** Relative educational dose control in [0, 1], not a clinical dose unit. */
	dose: number;
	/** Additional electronic-noise control in [0, 1]. */
	additionalNoise: number;
	seed: number;
	missingAngleWidth: number;
	missingAngleCenter: number;
	metalArtifacts: boolean;
	noiseEnabled?: boolean;
	/** Ray-march step expressed as a fraction of one phantom pixel. */
	rayStepScale?: number;
	beamModel?: BeamModel;
}

export interface ReconstructionSettings {
	filter: FilterName;
	/** Fraction of Nyquist retained by the reconstruction filter, in (0, 1]. */
	cutoff: number;
	imageSize?: number;
}

export const DEFAULT_ACQUISITION_SETTINGS: Readonly<Required<AcquisitionSettings>> = Object.freeze({
	projectionCount: 180,
	detectorCount: 256,
	dose: 0.72,
	additionalNoise: 0,
	seed: 20_260_726,
	noiseEnabled: true,
	missingAngleWidth: 0,
	missingAngleCenter: 90,
	rayStepScale: 0.5,
	beamModel: 'monochromatic',
	metalArtifacts: true
});

export const DEFAULT_RECONSTRUCTION_SETTINGS: Readonly<ReconstructionSettings> = Object.freeze({
	imageSize: DEFAULT_GRID_SIZE,
	filter: 'shepp-logan',
	cutoff: 1
});

export interface ProjectionGeometry {
	angles: Float64Array;
	cosines: Float64Array;
	sines: Float64Array;
	detectorPositions: Float64Array;
	acquired: Uint8Array;
	projectionCount: number;
	detectorCount: number;
	detectorMin: number;
	detectorMax: number;
	detectorSpacing: number;
}

export interface ProjectionResult {
	angle: number;
	/** Empty when a caller explicitly disables forward-model diagnostics. */
	ideal: Float32Array;
	measured: Float32Array;
	/** Empty when a caller explicitly disables forward-model diagnostics. */
	expectedCounts: Float32Array;
	/** Empty when a caller explicitly disables forward-model diagnostics. */
	observedCounts: Float32Array;
	usedPolychromaticModel: boolean;
}

export interface Sinogram {
	values: Float32Array;
	idealValues: Float32Array;
	angles: Float64Array;
	acquired: Uint8Array;
	projectionCount: number;
	detectorCount: number;
	detectorMin: number;
	detectorMax: number;
	detectorSpacing: number;
}

export interface ReconstructionResult {
	size: number;
	backprojection: Float32Array;
	filteredBackprojection: Float32Array;
	filteredSinogram: Float32Array;
	acquiredProjectionCount: number;
}

export interface ReconstructionMetrics {
	rmse: number;
	normalizedRmse: number;
	scaleInvariantRmse: number;
	mae: number;
	correlation: number;
	peakSignalToNoiseRatio: number;
}

export interface CirclePaint {
	centerX: number;
	centerY: number;
	radius: number;
	material: MaterialId;
	density?: number;
}

export interface EllipsePaint {
	centerX: number;
	centerY: number;
	radiusX: number;
	radiusY: number;
	rotation?: number;
	material: MaterialId;
	density?: number;
}

export interface BrushSegmentPaint {
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
	radius: number;
	material: MaterialId;
	density?: number;
}
