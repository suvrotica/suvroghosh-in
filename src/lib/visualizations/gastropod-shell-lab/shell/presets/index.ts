import { ShellRecipeSchema, type ShellRecipe } from '../model/recipe-schema';
import { COMPARATIVE_PRESETS } from './comparative';
import { EXPERIMENT_PRESETS } from './experiments';
import { GASTROPOD_PRESETS } from './gastropods';
import type { PresetShelf, ShellPreset } from './types';

export * from './comparative';
export * from './experiments';
export * from './gastropods';
export * from './types';

export const ALL_PRESETS: readonly ShellPreset[] = [
	...GASTROPOD_PRESETS,
	...COMPARATIVE_PRESETS,
	...EXPERIMENT_PRESETS
];

const PRESET_BY_ID = new Map(ALL_PRESETS.map((preset) => [preset.id, preset]));
if (PRESET_BY_ID.size !== ALL_PRESETS.length) {
	throw new Error('Preset identifiers must be unique.');
}

export function getPresetById(id: string): ShellPreset | undefined {
	return PRESET_BY_ID.get(id);
}

export function requirePreset(id: string): ShellPreset {
	const preset = getPresetById(id);
	if (!preset) throw new RangeError(`Unknown shell preset: ${id}`);
	return preset;
}

export function presetsOnShelf(shelf: PresetShelf): readonly ShellPreset[] {
	return ALL_PRESETS.filter((preset) => preset.shelf === shelf);
}

/** Return a mutable, validated recipe copy suitable for selection/reset state. */
export function clonePresetRecipe(id: string): ShellRecipe {
	return ShellRecipeSchema.parse(requirePreset(id).recipe);
}
