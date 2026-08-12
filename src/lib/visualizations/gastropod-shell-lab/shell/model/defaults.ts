import { constantLaw } from './growth-law';
import {
	CURRENT_ENGINE_VERSION,
	CURRENT_RECIPE_SCHEMA_VERSION,
	ShellRecipeSchema,
	type ShellRecipe
} from './recipe-schema';

export type DeepPartial<T> = T extends readonly unknown[]
	? T
	: T extends object
		? { [Key in keyof T]?: DeepPartial<T[Key]> }
		: T;

function mergeValue(base: unknown, patch: unknown): unknown {
	if (patch === undefined) return base;
	if (Array.isArray(patch)) return patch.map((value) => mergeValue(undefined, value));
	if (patch !== null && typeof patch === 'object') {
		const patchRecord = patch as Record<string, unknown>;
		const baseRecord =
			base !== null && typeof base === 'object' && !Array.isArray(base)
				? (base as Record<string, unknown>)
				: undefined;
		// A discriminant change replaces the union member instead of retaining
		// fields belonging to the previous member (for example constant.value).
		if (
			typeof patchRecord.type === 'string' &&
			baseRecord &&
			patchRecord.type !== baseRecord.type
		) {
			return Object.fromEntries(
				Object.entries(patchRecord).map(([key, value]) => [key, mergeValue(undefined, value)])
			);
		}
		const baseObject = base !== null && typeof base === 'object' ? base : {};
		const result: Record<string, unknown> = { ...(baseObject as Record<string, unknown>) };
		for (const [key, value] of Object.entries(patch)) {
			result[key] = mergeValue(result[key], value);
		}
		return result;
	}
	return patch;
}

function deepFreeze<T>(value: T): Readonly<T> {
	if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	}
	return value;
}

const radialExponent = Math.log(2.35) / (Math.PI * 2);

const mutableDefault: ShellRecipe = {
	schemaVersion: CURRENT_RECIPE_SCHEMA_VERSION,
	engineVersion: CURRENT_ENGINE_VERSION,
	name: 'Living aperture',
	engine: 'analytic',
	seed: 0x1a2b3c4d,
	coiling: {
		curve: 'logarithmic',
		turns: 5.25,
		whorlExpansion: 2.35,
		archimedeanSpacing: 0.18,
		axisDistance: 1,
		handedness: 1,
		handednessLaw: constantLaw(1),
		axial: {
			mode: 'cone-similar',
			risePerTurn: 0.32,
			coneSpireRatio: 0.78,
			keyframed: constantLaw(0)
		},
		meander: {
			radialAmplitude: 0,
			axialAmplitude: 0,
			cycles: 0,
			phase: 0
		}
	},
	aperture: {
		profile: 'ellipse',
		scale: 0.48,
		scaleExponent: radialExponent,
		aspectRatio: 1.3,
		rotation: 0.08,
		tilt: 0,
		eccentricity: 0,
		superellipseExponent: 2.4,
		polygonSides: 6,
		cornerRoundness: 0.65,
		lobes: 5,
		lobeAmplitude: 0,
		fourier: [],
		drawnProfile: [],
		scaleModulation: constantLaw(1),
		lipFlare: constantLaw(0)
	},
	twist: {
		initialAngle: 0,
		rate: constantLaw(0)
	},
	kinematics: {
		speed: constantLaw(1),
		growthRate: constantLaw(radialExponent),
		curvature1: constantLaw(0.72),
		curvature2: constantLaw(0),
		twistRate: constantLaw(0)
	},
	ornament: {
		ribs: {
			enabled: false,
			onset: constantLaw(1),
			countPerTurn: 12,
			amplitude: 0.06,
			sharpness: 3,
			phase: 0
		},
		cords: {
			enabled: false,
			onset: constantLaw(1),
			count: 6,
			amplitude: 0.035,
			sharpness: 3,
			phase: 0
		},
		nodules: {
			enabled: false,
			onset: constantLaw(1),
			amplitude: 0.08,
			interactionPower: 1
		},
		varices: {
			enabled: false,
			onset: constantLaw(1),
			countPerTurn: 3,
			amplitude: 0.18,
			width: 0.08,
			phase: 0
		},
		spines: {
			enabled: false,
			onset: constantLaw(1),
			countAroundAperture: 3,
			length: 0.35,
			width: 0.11,
			taper: 0.82,
			recurvature: 0,
			phase: 0,
			selectedVarices: []
		},
		buckling: {
			enabled: false,
			onset: constantLaw(1),
			mismatchProxy: 0.2,
			stiffnessProxy: 1,
			domainLength: 1,
			mode: 4,
			amplitude: 0.08
		},
		hierarchy: {
			enabled: false,
			onset: constantLaw(1),
			depth: 0,
			parentChildScale: 0.42,
			insertionBias: 0,
			amplitude: 0.12
		},
		imperfection: {
			enabled: false,
			onset: constantLaw(1),
			amplitude: 0,
			bandLimit: 5,
			timingJitter: 0
		}
	},
	qualityIndependent: {
		normalizationScale: 2,
		protoconchScale: 0.018,
		apexEpsilon: 1e-6,
		adultApertureOpen: true,
		finiteHierarchyCap: 6
	},
	appearance: {
		shellColor: '#e8dcc2',
		growthColor: '#d89a4d',
		overlayColor: '#58c7c8',
		roughness: 0.62,
		metalness: 0,
		microdetail: 0.18,
		background: 'museum-dark'
	},
	camera: {
		view: 'three-quarter',
		position: [3.6, 2.4, 3.8],
		target: [0, 0, 0],
		up: [0, 0, 1],
		zoom: 1
	}
};

/** Immutable canonical starting recipe. Use createDefaultRecipe() for an editable copy. */
export const DEFAULT_SHELL_RECIPE: Readonly<ShellRecipe> = deepFreeze(
	ShellRecipeSchema.parse(mutableDefault)
);

/** Create a validated recipe by applying a recursive patch to the canonical default. */
export function createDefaultRecipe(patch: DeepPartial<ShellRecipe> = {}): ShellRecipe {
	return ShellRecipeSchema.parse(mergeValue(DEFAULT_SHELL_RECIPE, patch));
}

/** Create a validated recipe by applying a patch to any existing recipe. */
export function patchShellRecipe(
	recipe: ShellRecipe,
	patch: DeepPartial<ShellRecipe>
): ShellRecipe {
	return ShellRecipeSchema.parse(mergeValue(recipe, patch));
}
