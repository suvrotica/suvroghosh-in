import type { ShellRecipe } from '../model/recipe-schema';
import type { ApertureValidation } from '../math/aperture';
import type { IntersectionEstimate } from '../mesh/intersections';
import type { MeshDiagnostics, MeshPacket } from '../mesh/types';

export type ShellEngineInput = ShellRecipe;

export interface MeshResolution {
	growthRings: number;
	apertureSamples: number;
}

export interface GenerateOptions {
	/** The revealed age; geometry remains the byte-identical adult history. */
	age?: number;
	normalize?: boolean;
	capApex?: boolean;
}

/** Raw arrays only: this object may cross the worker boundary unchanged. */
export interface RingHistory {
	ringCount: number;
	samplesPerRing: number;
	centers: Float64Array;
	scales: Float64Array;
	ages: Float64Array;
	thetas: Float64Array;
	tangents: Float64Array;
	frameE1: Float64Array;
	frameE2: Float64Array;
	/** Ring-major positions; the mesh's first ringCount × samples vertices are this exact array. */
	ringPositions: Float32Array;
	/** Per-vertex false-colour field; a reduced instability proxy, never measured stress. */
	instabilityProxy: Float32Array;
}

export interface RingPrefix {
	age: number;
	visibleRingCount: number;
	visibleRingVertexCount: number;
	indexCount: number;
}

export interface ShellClassification {
	engine: 'analytic' | 'accretion';
	curve: 'logarithmic' | 'archimedean' | 'local-kinematic';
	radialApertureSimilarity: 'exact-geometric-similarity' | 'allometric' | 'not-applicable';
	spatialSimilarity:
		| 'strict-underlying-base-law'
		| 'top-view-only'
		| 'not-self-similar'
		| 'local-kinematic';
	/** Classification of the underlying, uncapped base growth law. */
	similarity: 'exact-self-similar' | 'top-view-self-similar' | 'allometric' | 'generalized';
	label: string;
	reason: string;
	appliesTo: 'underlying-base-growth-law';
	strictlySelfSimilarIn3d: boolean;
	/** Finite caps, truncation, ontogenetic modulation, and episodic ornament are excluded. */
	finiteRenderedShellStrictlySimilar: false;
}

/**
 * Shell-level overlap assessment. Ring-envelope candidates alone are common in
 * ordinary enveloping whorls, so `likely` is true only when the broad phase and
 * an independent recipe-domain risk heuristic agree.
 */
export interface ShellIntersectionAssessment extends IntersectionEstimate {
	/** Raw count from the conservative ring-envelope broad phase. */
	envelopeCandidatePairCount: number;
	envelopeCandidateFound: boolean;
	parameterRisk: boolean;
}

export interface GenerationDiagnostics {
	valid: boolean;
	errors: string[];
	warnings: string[];
	aperture: ApertureValidation;
	mesh: MeshDiagnostics;
	intersectionEstimate: ShellIntersectionAssessment;
}

/** Fully deterministic for one engine version, recipe, and fixed resolution. */
export interface ShellGenerationResult {
	mesh: MeshPacket;
	history: RingHistory;
	diagnostics: GenerationDiagnostics;
	classification: ShellClassification;
	reveal: RingPrefix;
	resolution: MeshResolution;
}

export const FIXED_TEST_RESOLUTION: Readonly<MeshResolution> = Object.freeze({
	growthRings: 72,
	apertureSamples: 32
});

export const PREVIEW_RESOLUTION: Readonly<MeshResolution> = Object.freeze({
	growthRings: 320,
	apertureSamples: 64
});

export const BALANCED_RESOLUTION: Readonly<MeshResolution> = Object.freeze({
	growthRings: 640,
	apertureSamples: 96
});
