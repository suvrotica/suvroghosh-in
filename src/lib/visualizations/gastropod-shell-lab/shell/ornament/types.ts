import type { OrnamentConfiguration } from '../model/recipe-schema';

export interface OrnamentContext {
	/** Normalized developmental age. */
	age: number;
	/** Analytic growth angle in radians. */
	theta: number;
	/** Number of turns in the complete history. */
	totalTurns: number;
	/** Periodic aperture coordinate in radians. */
	u: number;
	/** Exact ring-builder sample index, when evaluation comes from a sampled mesh. */
	apertureIndex?: number;
	apertureSamples: number;
	growthSamples: number;
	seed: number;
}

export interface OrnamentSignal {
	/** Unitless field before its authored amplitude is applied. */
	normalized: number;
	/** Signed displacement in local aperture-radius units. */
	displacement: number;
}

export interface OrnamentEvaluation {
	radialDisplacement: number;
	instabilityProxy: number;
	components: {
		ribs: number;
		cords: number;
		nodules: number;
		varices: number;
		spines: number;
		buckling: number;
		hierarchy: number;
		imperfection: number;
	};
}

export type RibsConfiguration = OrnamentConfiguration['ribs'];
export type CordsConfiguration = OrnamentConfiguration['cords'];
export type NodulesConfiguration = OrnamentConfiguration['nodules'];
export type VaricesConfiguration = OrnamentConfiguration['varices'];
export type SpinesConfiguration = OrnamentConfiguration['spines'];
export type BucklingConfiguration = OrnamentConfiguration['buckling'];
export type HierarchyConfiguration = OrnamentConfiguration['hierarchy'];
export type ImperfectionConfiguration = OrnamentConfiguration['imperfection'];
