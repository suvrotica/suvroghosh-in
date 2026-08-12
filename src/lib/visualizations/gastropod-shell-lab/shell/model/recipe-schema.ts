import { z } from 'zod';
import { GrowthLawSchema } from './growth-law';

export const CURRENT_RECIPE_SCHEMA_VERSION = 2 as const;
export const CURRENT_ENGINE_VERSION = 'living-aperture-1';

const finiteNumber = z.number().finite();
const angle = finiteNumber.min(-Math.PI * 16).max(Math.PI * 16);

export const AxialConfigurationSchema = z
	.object({
		mode: z.enum(['planispiral', 'lecture-lift', 'cone-similar', 'keyframed']),
		risePerTurn: finiteNumber.min(-12).max(12),
		coneSpireRatio: finiteNumber.min(-6).max(6),
		keyframed: GrowthLawSchema
	})
	.strict();

export const CoilingConfigurationSchema = z
	.object({
		curve: z.enum(['logarithmic', 'archimedean']),
		turns: finiteNumber.min(0.25).max(40),
		whorlExpansion: finiteNumber.min(0.25).max(50),
		archimedeanSpacing: finiteNumber.min(0.001).max(8),
		axisDistance: finiteNumber.min(0.01).max(8),
		handedness: z.union([z.literal(-1), z.literal(1)]),
		handednessLaw: GrowthLawSchema,
		axial: AxialConfigurationSchema,
		meander: z
			.object({
				radialAmplitude: finiteNumber.min(0).max(4),
				axialAmplitude: finiteNumber.min(0).max(4),
				cycles: finiteNumber.min(0).max(64),
				phase: angle
			})
			.strict()
	})
	.strict();

export const FourierTermSchema = z
	.object({
		harmonic: z.number().int().min(1).max(64),
		cos: finiteNumber.min(-1).max(1),
		sin: finiteNumber.min(-1).max(1)
	})
	.strict();

export const DrawnProfilePointSchema = z
	.object({
		angle: finiteNumber.min(0).max(Math.PI * 2),
		radius: finiteNumber.min(0.001).max(8)
	})
	.strict();

export const ApertureConfigurationSchema = z
	.object({
		profile: z.enum([
			'circle',
			'ellipse',
			'superellipse',
			'rounded-polygon',
			'fourier',
			'lobed',
			'drawn'
		]),
		scale: finiteNumber.min(0.001).max(4),
		scaleExponent: finiteNumber.min(-1).max(1),
		aspectRatio: finiteNumber.min(0.05).max(12),
		rotation: angle,
		tilt: finiteNumber.min(-Math.PI / 2).max(Math.PI / 2),
		eccentricity: finiteNumber.min(-0.95).max(0.95),
		superellipseExponent: finiteNumber.min(0.2).max(16),
		polygonSides: z.number().int().min(3).max(32),
		cornerRoundness: finiteNumber.min(0).max(1),
		lobes: z.number().int().min(1).max(64),
		lobeAmplitude: finiteNumber.min(-0.95).max(0.95),
		fourier: z.array(FourierTermSchema).max(32),
		drawnProfile: z.array(DrawnProfilePointSchema).max(256),
		scaleModulation: GrowthLawSchema,
		lipFlare: GrowthLawSchema
	})
	.strict();

export const TwistConfigurationSchema = z
	.object({
		initialAngle: angle,
		rate: GrowthLawSchema
	})
	.strict();

export const KinematicConfigurationSchema = z
	.object({
		speed: GrowthLawSchema,
		growthRate: GrowthLawSchema,
		curvature1: GrowthLawSchema,
		curvature2: GrowthLawSchema,
		twistRate: GrowthLawSchema
	})
	.strict();

const OrnamentEnvelopeSchema = z
	.object({
		enabled: z.boolean(),
		onset: GrowthLawSchema
	})
	.strict();

export const OrnamentConfigurationSchema = z
	.object({
		ribs: OrnamentEnvelopeSchema.extend({
			countPerTurn: finiteNumber.min(0).max(240),
			amplitude: finiteNumber.min(0).max(2),
			sharpness: finiteNumber.min(0.25).max(64),
			phase: angle
		}).strict(),
		cords: OrnamentEnvelopeSchema.extend({
			count: z.number().int().min(0).max(128),
			amplitude: finiteNumber.min(0).max(1),
			sharpness: finiteNumber.min(0.25).max(64),
			phase: angle
		}).strict(),
		nodules: OrnamentEnvelopeSchema.extend({
			amplitude: finiteNumber.min(0).max(2),
			interactionPower: finiteNumber.min(0.25).max(8)
		}).strict(),
		varices: OrnamentEnvelopeSchema.extend({
			countPerTurn: finiteNumber.min(0).max(24),
			amplitude: finiteNumber.min(0).max(3),
			width: finiteNumber.min(0.001).max(1),
			phase: angle
		}).strict(),
		spines: OrnamentEnvelopeSchema.extend({
			countAroundAperture: z.number().int().min(0).max(64),
			length: finiteNumber.min(0).max(8),
			width: finiteNumber.min(0.001).max(1),
			taper: finiteNumber.min(0).max(1),
			recurvature: finiteNumber.min(-2).max(2),
			phase: angle,
			selectedVarices: z.array(z.number().int().min(0).max(128)).max(32)
		}).strict(),
		buckling: OrnamentEnvelopeSchema.extend({
			mismatchProxy: finiteNumber.min(0).max(20),
			stiffnessProxy: finiteNumber.min(0.001).max(100),
			domainLength: finiteNumber.min(0.001).max(100),
			mode: z.number().int().min(0).max(64),
			amplitude: finiteNumber.min(0).max(2)
		}).strict(),
		hierarchy: OrnamentEnvelopeSchema.extend({
			depth: z.number().int().min(0).max(6),
			parentChildScale: finiteNumber.min(0.02).max(0.98),
			insertionBias: finiteNumber.min(-1).max(1),
			amplitude: finiteNumber.min(0).max(3)
		}).strict(),
		imperfection: OrnamentEnvelopeSchema.extend({
			amplitude: finiteNumber.min(0).max(0.75),
			bandLimit: z.number().int().min(1).max(64),
			timingJitter: finiteNumber.min(0).max(0.5)
		}).strict()
	})
	.strict();

export const QualityIndependentSettingsSchema = z
	.object({
		normalizationScale: finiteNumber.min(0.01).max(100),
		protoconchScale: finiteNumber.min(0.0001).max(0.5),
		apexEpsilon: finiteNumber.min(1e-9).max(0.01),
		adultApertureOpen: z.literal(true),
		finiteHierarchyCap: z.literal(6)
	})
	.strict();

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a six-digit hexadecimal colour.');

export const AppearanceConfigurationSchema = z
	.object({
		shellColor: hexColor,
		growthColor: hexColor,
		overlayColor: hexColor,
		roughness: finiteNumber.min(0).max(1),
		metalness: finiteNumber.min(0).max(1),
		microdetail: finiteNumber.min(0).max(1),
		background: z.enum(['museum-dark', 'warm-light', 'transparent'])
	})
	.strict();

export const CameraHintSchema = z
	.object({
		view: z.enum(['aperture', 'apex', 'side', 'top', 'three-quarter', 'character']),
		position: z.tuple([finiteNumber, finiteNumber, finiteNumber]),
		target: z.tuple([finiteNumber, finiteNumber, finiteNumber]),
		up: z.tuple([finiteNumber, finiteNumber, finiteNumber]),
		zoom: finiteNumber.min(0.1).max(10)
	})
	.strict();

export const PresetAncestrySchema = z
	.object({
		presetId: z.string().min(1).max(96),
		presetTitle: z.string().min(1).max(128),
		modified: z.boolean()
	})
	.strict();

export const ShellRecipeSchema = z
	.object({
		schemaVersion: z.literal(CURRENT_RECIPE_SCHEMA_VERSION),
		engineVersion: z.string().min(1).max(64),
		name: z.string().min(1).max(120),
		engine: z.enum(['analytic', 'accretion']),
		seed: z.number().int().min(0).max(0xffffffff),
		coiling: CoilingConfigurationSchema,
		aperture: ApertureConfigurationSchema,
		twist: TwistConfigurationSchema,
		kinematics: KinematicConfigurationSchema,
		ornament: OrnamentConfigurationSchema,
		qualityIndependent: QualityIndependentSettingsSchema,
		appearance: AppearanceConfigurationSchema,
		ancestry: PresetAncestrySchema.optional(),
		camera: CameraHintSchema.optional()
	})
	.strict();

export type ShellRecipe = z.infer<typeof ShellRecipeSchema>;
export type AxialConfiguration = z.infer<typeof AxialConfigurationSchema>;
export type CoilingConfiguration = z.infer<typeof CoilingConfigurationSchema>;
export type ApertureConfiguration = z.infer<typeof ApertureConfigurationSchema>;
export type TwistConfiguration = z.infer<typeof TwistConfigurationSchema>;
export type KinematicConfiguration = z.infer<typeof KinematicConfigurationSchema>;
export type OrnamentConfiguration = z.infer<typeof OrnamentConfigurationSchema>;
export type QualityIndependentSettings = z.infer<typeof QualityIndependentSettingsSchema>;
export type AppearanceConfiguration = z.infer<typeof AppearanceConfigurationSchema>;
export type CameraHint = z.infer<typeof CameraHintSchema>;
export type PresetAncestry = z.infer<typeof PresetAncestrySchema>;

export function parseShellRecipe(input: unknown): ShellRecipe {
	return ShellRecipeSchema.parse(input);
}

export function safeParseShellRecipe(input: unknown) {
	return ShellRecipeSchema.safeParse(input);
}

export function radialExpansionExponent(recipe: ShellRecipe): number {
	return Math.log(recipe.coiling.whorlExpansion) / (Math.PI * 2);
}
