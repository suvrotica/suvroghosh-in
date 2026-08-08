import type {
	ActiveTerms,
	BZDisplayState,
	BZFieldMetrics,
	BZFieldState,
	BZIntervention,
	BZPalette,
	BZSetup,
	BZViewMode,
	CalibrationStatus,
	ProbeReading
} from './types';

export const BZ_V2_SCHEMA_VERSION = 2 as const;
export const BZ_V2_ENGINE_VERSION = 'bz-heun-five-point-v2' as const;
export const BZ_V2_DISPLAY_VERSION = 'bz-display-linear-light-v2' as const;
export const BZ_V2_CHECKPOINT_VERSION = 1 as const;

export type BZV2HeroId = 'classic-target-rings' | 'persistent-single-spiral' | 'spiral-garden';
export type BZV2Layer = 'gallery' | 'laboratory' | 'proof';
export type BZV2ValidationStatus = CalibrationStatus | 'modified';
export type BZV2SourceSemantics =
	| 'none'
	| 'finite-initial-perturbation'
	| 'declared-periodic-external-source'
	| 'autonomous-heterogeneous-source';

export type BZV2RangeMode = 'fixed' | 'global' | 'auto';

export interface BZV2FixedRange {
	readonly minimum: number;
	readonly maximum: number;
	readonly units: 'dimensionless' | 'dimensionless-rate' | 'radians';
}

export interface BZV2PhaseCoordinate {
	readonly centreU: number;
	readonly centreV: number;
	readonly scaleU: number;
	readonly scaleV: number;
}

export interface BZFerroinMixV2 {
	readonly recoveryWeight: number;
	readonly activatorLuminanceWeight: number;
	readonly gradientHighlightWeight: number;
}

export interface BZLuminousMixV2 {
	readonly phaseWeight: number;
	readonly recoveryWeight: number;
	readonly frontWeight: number;
}

export interface BZDisplayProfileV2 {
	readonly id: string;
	readonly title: string;
	readonly version: typeof BZ_V2_DISPLAY_VERSION;
	readonly style: 'luminous-composite' | 'ferroin-proxy' | 'phase-spectrum' | 'scientific';
	readonly palette: BZPalette;
	readonly defaultView: BZViewMode;
	readonly rangeMode: BZV2RangeMode;
	readonly ranges: Readonly<
		Partial<
			Record<
				| 'u'
				| 'v'
				| 'reaction-u'
				| 'diffusion-u'
				| 'net-u'
				| 'phase'
				| 'front'
				| 'refractory'
				| 'difference-from-mean',
				BZV2FixedRange
			>
		>
	>;
	readonly phase: BZV2PhaseCoordinate;
	readonly exposure: number;
	readonly bloom: number;
	readonly highlight: number;
	readonly saturation: number;
	readonly frontScale: number;
	readonly contrast: number;
	readonly gamma: number;
	readonly bloomThreshold: number;
	readonly bloomRadius: number;
	readonly ferroinMix: Readonly<BZFerroinMixV2>;
	readonly luminousMix: Readonly<BZLuminousMixV2>;
	readonly interpolation: 'mask-aware-manual-bilinear';
	readonly toneMap: 'aces-fitted';
	readonly outputTransfer: 'srgb';
	readonly disclosure: string;
}

export type BZWarmupPolicyV2 =
	| {
			readonly kind: 'none';
			readonly reason: string;
	  }
	| {
			readonly kind: 'fixed-steps';
			readonly steps: number;
			readonly modelTime: number;
			readonly source: 'cpu-f64-reference' | 'gpu-f32-publication';
	  }
	| {
			readonly kind: 'checkpoint';
			readonly checkpointId: string;
			readonly modelTime: number;
			readonly genesisAvailable: true;
	  };

export interface BZCheckpointDescriptorV2 {
	readonly id: string;
	readonly version: typeof BZ_V2_CHECKPOINT_VERSION;
	readonly path: string;
	readonly encoding: 'bzcp-f32le-v1';
	readonly losslessForStoredRepresentation: true;
	readonly width: number;
	readonly height: number;
	readonly modelStep: number;
	readonly modelTime: number;
	readonly byteLength: number;
	readonly sha256: string;
	readonly fieldSha256F64Reference: string | null;
	readonly setupChecksum: string;
	readonly interventionLogChecksum: string;
	readonly engineVersion: string;
	readonly generatedBy: string;
	readonly generatedAt: string;
}

export interface BZObservationWindowV2 {
	readonly startStep: number;
	readonly endStep: number;
	readonly startTime: number;
	readonly endTime: number;
	readonly sampleEverySteps: number;
}

export interface BZValidationSummaryV2 {
	readonly status: CalibrationStatus;
	readonly headline: string;
	readonly passedCriteria: readonly string[];
	readonly failedCriteria: readonly string[];
	readonly measurements: Readonly<Record<string, number | string | boolean | null>>;
}

export interface BZPresetV2 {
	readonly schemaVersion: typeof BZ_V2_SCHEMA_VERSION;
	readonly id: string;
	readonly title: string;
	readonly shortDescription: string;
	readonly model: BZSetup['model'];
	readonly modelVersion: BZSetup['modelVersion'];
	readonly equationsId: BZSetup['equationsId'];
	readonly setup: BZSetup;
	readonly initialCondition: BZSetup['initialCondition'];
	readonly initialInterventions: readonly BZIntervention[];
	readonly sourceSemantics: BZV2SourceSemantics;
	readonly warmupPolicy: BZWarmupPolicyV2;
	readonly optionalCheckpoint: BZCheckpointDescriptorV2 | null;
	readonly displayProfileId: string;
	readonly calibrationRecordId: string;
	readonly validationStatus: CalibrationStatus;
	readonly validationSummary: BZValidationSummaryV2;
	readonly observationWindow: BZObservationWindowV2;
	readonly reproducibility: {
		readonly seed: string;
		readonly engineVersion: string;
		readonly setupChecksum: string;
		readonly interventionLogChecksum: string;
		readonly command: string;
	};
	readonly articleClaimBoundary: string;
	readonly hero: boolean;
}

export interface BZCalibrationCriterionV2 {
	readonly id: string;
	readonly kind: 'prerequisite' | 'validation';
	readonly description: string;
	readonly pass: boolean;
	readonly evidence: Readonly<Record<string, unknown>>;
}

export interface BZConvergenceRecordV2 {
	readonly comparison: string;
	readonly reference: string;
	readonly observable: string;
	readonly relativeDifference: number;
	readonly tolerance: number;
	readonly pass: boolean;
}

export interface BZCalibrationRecordV2 {
	readonly id: string;
	readonly presetId: string;
	readonly status: CalibrationStatus;
	readonly statusReason: string;
	readonly setup: BZSetup;
	readonly interventions: readonly BZIntervention[];
	readonly observationWindow: BZObservationWindowV2;
	readonly sampledTimes: readonly number[];
	readonly metrics: Readonly<Record<string, unknown>>;
	readonly criteria: readonly BZCalibrationCriterionV2[];
	readonly convergence: readonly BZConvergenceRecordV2[];
	readonly cpuGpuParity: Readonly<Record<string, unknown>>;
	readonly displayIndependence: {
		readonly stateChecksumBefore: string;
		readonly stateChecksumAfter: string;
		readonly pass: boolean;
	};
	readonly provenance: Readonly<Record<string, string | number | boolean | null>>;
}

export interface BZAssetRecordV2 {
	readonly id: string;
	readonly path: string;
	readonly width: number;
	readonly height: number;
	readonly stateGrid: number;
	readonly presetId: string;
	readonly checkpointId: string | null;
	readonly view:
		| BZViewMode
		| 'ferroin-proxy'
		| 'luminous-composite'
		| 'phase'
		| 'front'
		| 'refractory';
	readonly displayProfileId: string;
	readonly sha256: string;
	readonly metadataPath: string;
}

export interface BZCalibrationManifestV2 {
	readonly schemaVersion: typeof BZ_V2_SCHEMA_VERSION;
	readonly engineVersion: typeof BZ_V2_ENGINE_VERSION;
	readonly displayVersion: typeof BZ_V2_DISPLAY_VERSION;
	readonly generatedAt: string;
	readonly generatedBy: string;
	readonly literatureBasis: readonly { readonly label: string; readonly url: string }[];
	readonly numericalMethod: string;
	readonly boundaryMethod: string;
	readonly checksumAlgorithms: Readonly<Record<string, string>>;
	readonly search: Readonly<Record<string, unknown>>;
	readonly displayProfiles: readonly BZDisplayProfileV2[];
	readonly presets: readonly BZPresetV2[];
	readonly calibrations: readonly BZCalibrationRecordV2[];
	readonly checkpoints: readonly BZCheckpointDescriptorV2[];
	readonly assets: readonly BZAssetRecordV2[];
	readonly performance: readonly BZPerformanceReportV2[];
	readonly articleClaims: Readonly<Record<string, string>>;
}

/** Small, regularly sampled telemetry. It is deliberately not a field snapshot. */
export interface BZTelemetryFrame {
	readonly kind: 'telemetry';
	readonly step: number;
	readonly modelTime: number;
	readonly sampledAt: number;
	readonly metrics: BZFieldMetrics;
	readonly engine: 'gpu-f32' | 'gpu-f16' | 'cpu-f64';
	readonly telemetryTexture: readonly [number, number];
	readonly fullStateReadbacks: number;
}

/** A bounded one-cell or tiny-neighbourhood read; never aliases ordinary telemetry. */
export interface BZProbeFrame {
	readonly kind: 'probe';
	readonly step: number;
	readonly modelTime: number;
	readonly point: readonly [number, number];
	readonly reading: ProbeReading;
	readonly sampledTexels: number;
}

/** Explicit expensive path used for export, checkpoints, debugging and recovery only. */
export interface BZFullSnapshot {
	readonly kind: 'full-snapshot';
	readonly reason:
		| 'export'
		| 'checkpoint'
		| 'scientific-snapshot'
		| 'debug'
		| 'context-recovery'
		| 'deterministic-replay';
	readonly step: number;
	readonly modelTime: number;
	readonly setup: BZSetup;
	readonly field: BZFieldState;
	readonly interventions: readonly BZIntervention[];
}

export interface BZPerformanceReportV2 {
	readonly browser: string;
	readonly gpu: string;
	readonly stateGrid: number;
	readonly displayResolution: string;
	readonly durationSeconds: number;
	readonly medianFps: number;
	readonly medianStepsPerSecond: number;
	readonly telemetryHz: number;
	readonly fullStateReadbacks: number;
	readonly scientificTextureBytes: number;
	readonly displayTextureBytes: number;
	readonly notes: string;
}

export interface BZV2ExperimentRecord {
	readonly schemaVersion: typeof BZ_V2_SCHEMA_VERSION;
	readonly presetId: string;
	readonly calibrationRecordId: string | null;
	readonly validationStatus: BZV2ValidationStatus;
	readonly appearanceStatus: 'manifest-profile' | 'custom-appearance';
	readonly setup: BZSetup;
	readonly checkpointId: string | null;
	readonly step: number;
	readonly interventions: readonly BZIntervention[];
	readonly activeTerms: ActiveTerms;
	readonly display: BZDisplayState & { readonly profileId: string };
}
