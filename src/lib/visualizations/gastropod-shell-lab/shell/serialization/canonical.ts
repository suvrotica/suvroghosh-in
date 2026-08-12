import { migrateShellRecipe } from '../model/migrations';
import { ShellRecipeSchema, type ShellRecipe } from '../model/recipe-schema';

type CanonicalJson =
	| null
	| boolean
	| number
	| string
	| CanonicalJson[]
	| { [key: string]: CanonicalJson };

function canonicalize(value: unknown): CanonicalJson {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
	if (typeof value === 'number') {
		if (!Number.isFinite(value))
			throw new TypeError('Canonical JSON cannot contain NaN or Infinity.');
		return Object.is(value, -0) ? 0 : value;
	}
	if (Array.isArray(value)) return value.map(canonicalize);
	if (typeof value === 'object') {
		const result: Record<string, CanonicalJson> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			const child = (value as Record<string, unknown>)[key];
			if (child !== undefined) result[key] = canonicalize(child);
		}
		return result;
	}
	throw new TypeError(`Canonical JSON cannot contain ${typeof value}.`);
}

export function canonicalJson(value: unknown, indentation?: number): string {
	return JSON.stringify(canonicalize(value), null, indentation);
}

export function serializeShellRecipe(recipe: ShellRecipe, pretty = true): string {
	const parsed = ShellRecipeSchema.parse(recipe);
	return canonicalJson(parsed, pretty ? 2 : undefined);
}

export function deserializeShellRecipe(json: string): ShellRecipe {
	let input: unknown;
	try {
		input = JSON.parse(json);
	} catch (error) {
		throw new SyntaxError(
			`The shell recipe is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
	return migrateShellRecipe(input);
}
