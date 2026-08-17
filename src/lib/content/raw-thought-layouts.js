// @ts-check

/**
 * Standalone article layouts that are allowed to suppress the ordinary site shell.
 * Keep this registry as the single source of truth for runtime and build-time validation.
 */
export const SUPPORTED_RAW_THOUGHT_LAYOUTS = /** @type {const} */ ([
	'ai-plumbing-field-manual',
	'healthcare-human-margin'
]);

/** @typedef {(typeof SUPPORTED_RAW_THOUGHT_LAYOUTS)[number]} RawThoughtLayout */

/**
 * @param {unknown} value
 * @returns {value is RawThoughtLayout}
 */
export function isRawThoughtLayout(value) {
	return (
		typeof value === 'string' &&
		SUPPORTED_RAW_THOUGHT_LAYOUTS.includes(/** @type {RawThoughtLayout} */ (value))
	);
}
