import { MOTION_PREFERENCES, type MotionPreference, type ResolvedMotion } from './types';
import type { RouteMotionConfig } from './types';

export const DEFAULT_MOTION_PREFERENCE: MotionPreference = 'system';

export function isMotionPreference(value: unknown): value is MotionPreference {
	return typeof value === 'string' && MOTION_PREFERENCES.some((preference) => preference === value);
}

export function normaliseMotionPreference(value: unknown): MotionPreference {
	return isMotionPreference(value) ? value : DEFAULT_MOTION_PREFERENCE;
}

export const normalizeMotionPreference = normaliseMotionPreference;

/**
 * Resolves a stored choice without accessing browser globals. The caller supplies
 * the current media-query result so this function remains usable during SSR and in
 * the early document bootstrap.
 */
export function resolveMotion(preference: unknown, prefersReducedMotion: boolean): ResolvedMotion {
	if (prefersReducedMotion) return 'still';

	const normalisedPreference = normaliseMotionPreference(preference);
	if (normalisedPreference === 'still' || normalisedPreference === 'alive') {
		return normalisedPreference;
	}

	return 'gentle';
}

/**
 * Pure eligibility gate for the progressively loaded Canvas renderer. A route may
 * retain its static SSR atmosphere while declining the continuous field.
 */
export function shouldRunAmbientField(
	config: RouteMotionConfig,
	motion: ResolvedMotion,
	documentVisible = true
): boolean {
	return (
		documentVisible &&
		motion !== 'still' &&
		config.biome !== 'off' &&
		config.intensity !== 'off' &&
		config.ambient === 'animated'
	);
}
