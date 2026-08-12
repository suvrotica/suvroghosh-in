import { z } from 'zod';
import { createDefaultRecipe, type DeepPartial } from './defaults';
import {
	CURRENT_ENGINE_VERSION,
	CURRENT_RECIPE_SCHEMA_VERSION,
	ShellRecipeSchema,
	type ShellRecipe
} from './recipe-schema';

const LegacyRecipeV1Schema = z
	.object({
		schemaVersion: z.literal(1).optional(),
		engineVersion: z.string().optional(),
		name: z.string().optional(),
		engine: z.enum(['analytic', 'accretion']).optional(),
		model: z.enum(['analytic', 'accretion']).optional(),
		seed: z.number().int().optional(),
		turns: z.number().finite().optional(),
		whorlExpansion: z.number().finite().optional(),
		axialMode: z.enum(['planispiral', 'lecture-lift', 'cone-similar', 'keyframed']).optional(),
		risePerTurn: z.number().finite().optional(),
		coneSpireRatio: z.number().finite().optional(),
		handedness: z.union([z.literal(-1), z.literal(1)]).optional(),
		apertureProfile: z
			.enum(['circle', 'ellipse', 'superellipse', 'rounded-polygon', 'fourier', 'lobed', 'drawn'])
			.optional(),
		apertureSize: z.number().finite().optional(),
		apertureAspect: z.number().finite().optional(),
		apertureGrowthRate: z.number().finite().optional(),
		ribs: z.number().finite().optional(),
		varices: z.number().finite().optional(),
		spines: z.number().finite().optional(),
		hierarchyDepth: z.number().int().optional(),
		parameters: z.record(z.string(), z.unknown()).optional()
	})
	.passthrough();

export type LegacyRecipeV1 = z.infer<typeof LegacyRecipeV1Schema>;

export interface MigrationReport {
	fromVersion: number;
	toVersion: typeof CURRENT_RECIPE_SCHEMA_VERSION;
	steps: string[];
	recipe: ShellRecipe;
}

export class RecipeMigrationError extends Error {
	constructor(
		message: string,
		readonly sourceVersion?: number
	) {
		super(message);
		this.name = 'RecipeMigrationError';
	}
}

function finiteFrom(source: Record<string, unknown>, key: string): number | undefined {
	const value = source[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringFrom(source: Record<string, unknown>, key: string): string | undefined {
	const value = source[key];
	return typeof value === 'string' ? value : undefined;
}

/** Migrate the deliberately small flat v1 prototype into the complete v2 contract. */
export function migrateV1ToV2(input: unknown): ShellRecipe {
	const legacy = LegacyRecipeV1Schema.parse(input);
	const nested = legacy.parameters ?? {};
	const source = { ...nested, ...legacy } as Record<string, unknown>;
	const whorlExpansion = finiteFrom(source, 'whorlExpansion');
	const derivedExponent =
		whorlExpansion !== undefined && whorlExpansion > 0
			? Math.log(whorlExpansion) / (Math.PI * 2)
			: undefined;
	const apertureGrowthRate = finiteFrom(source, 'apertureGrowthRate') ?? derivedExponent;
	const handedness = source.handedness === -1 ? -1 : source.handedness === 1 ? 1 : undefined;
	const axialMode = ['planispiral', 'lecture-lift', 'cone-similar', 'keyframed'].includes(
		String(source.axialMode)
	)
		? (source.axialMode as 'planispiral' | 'lecture-lift' | 'cone-similar' | 'keyframed')
		: undefined;
	const apertureProfile = [
		'circle',
		'ellipse',
		'superellipse',
		'rounded-polygon',
		'fourier',
		'lobed',
		'drawn'
	].includes(String(source.apertureProfile))
		? (source.apertureProfile as ShellRecipe['aperture']['profile'])
		: undefined;
	const ribs = finiteFrom(source, 'ribs');
	const varices = finiteFrom(source, 'varices');
	const spines = finiteFrom(source, 'spines');
	const hierarchyDepth = finiteFrom(source, 'hierarchyDepth');
	const seedValue = finiteFrom(source, 'seed');

	const patch: DeepPartial<ShellRecipe> = {
		schemaVersion: CURRENT_RECIPE_SCHEMA_VERSION,
		engineVersion: stringFrom(source, 'engineVersion') ?? CURRENT_ENGINE_VERSION,
		name: stringFrom(source, 'name') ?? 'Migrated shell',
		engine:
			source.engine === 'accretion' || source.model === 'accretion' ? 'accretion' : 'analytic',
		seed: seedValue === undefined ? undefined : Math.trunc(seedValue) >>> 0,
		coiling: {
			turns: finiteFrom(source, 'turns'),
			whorlExpansion,
			handedness,
			// The law is a multiplier on the canonical static sign. A value of +1
			// preserves either dextral or sinistral handedness.
			handednessLaw: handedness === undefined ? undefined : { type: 'constant', value: 1 },
			axial: {
				mode: axialMode,
				risePerTurn: finiteFrom(source, 'risePerTurn'),
				coneSpireRatio: finiteFrom(source, 'coneSpireRatio')
			}
		},
		aperture: {
			profile: apertureProfile,
			scale: finiteFrom(source, 'apertureSize'),
			aspectRatio: finiteFrom(source, 'apertureAspect'),
			scaleExponent: apertureGrowthRate
		},
		ornament: {
			ribs: {
				enabled: ribs === undefined ? undefined : ribs > 0,
				countPerTurn: ribs
			},
			varices: {
				enabled: varices === undefined ? undefined : varices > 0,
				countPerTurn: varices
			},
			spines: {
				enabled: spines === undefined ? undefined : spines > 0,
				length: spines
			},
			hierarchy: {
				enabled: hierarchyDepth === undefined ? undefined : hierarchyDepth > 0,
				depth: hierarchyDepth
			}
		}
	};

	return createDefaultRecipe(patch);
}

export const RECIPE_MIGRATIONS = {
	1: migrateV1ToV2
} as const;

export function recipeSchemaVersion(input: unknown): number {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		throw new RecipeMigrationError('A shell recipe must be a JSON object.');
	}
	const rawVersion = (input as Record<string, unknown>).schemaVersion;
	if (rawVersion === undefined) return 1;
	if (!Number.isInteger(rawVersion) || (rawVersion as number) < 1) {
		throw new RecipeMigrationError('Recipe schemaVersion must be a positive integer.');
	}
	return rawVersion as number;
}

export function migrateShellRecipeWithReport(input: unknown): MigrationReport {
	const fromVersion = recipeSchemaVersion(input);
	if (fromVersion > CURRENT_RECIPE_SCHEMA_VERSION) {
		throw new RecipeMigrationError(
			`Recipe schema version ${fromVersion} is newer than supported version ${CURRENT_RECIPE_SCHEMA_VERSION}.`,
			fromVersion
		);
	}
	if (fromVersion === CURRENT_RECIPE_SCHEMA_VERSION) {
		return {
			fromVersion,
			toVersion: CURRENT_RECIPE_SCHEMA_VERSION,
			steps: [],
			recipe: ShellRecipeSchema.parse(input)
		};
	}
	if (fromVersion === 1) {
		return {
			fromVersion,
			toVersion: CURRENT_RECIPE_SCHEMA_VERSION,
			steps: ['v1 flat prototype → v2 complete deterministic recipe'],
			recipe: migrateV1ToV2(input)
		};
	}
	throw new RecipeMigrationError(
		`No migration is registered for version ${fromVersion}.`,
		fromVersion
	);
}

export function migrateShellRecipe(input: unknown): ShellRecipe {
	return migrateShellRecipeWithReport(input).recipe;
}
