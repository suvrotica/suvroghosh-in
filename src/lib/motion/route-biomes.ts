import type { ResolvedMotion, RouteMotionConfig } from './types';

export interface RouteMotionMetadata {
	/**
	 * Optional content labels may refine an index route, but never make an article
	 * body animated.
	 */
	readonly category?: string | null;
	readonly topic?: string | null;
	/** A specialist route that already owns its animation or rendering loop. */
	readonly ownsAnimationLoop?: boolean;
	/** A route whose layout deliberately replaces the normal site shell. */
	readonly specialShell?: boolean;
}

export const ROUTE_MOTION_CONFIGS = {
	off: { biome: 'off', intensity: 'off', ambient: 'off' },
	homeStandard: { biome: 'home', intensity: 'standard', ambient: 'animated' },
	homeQuiet: { biome: 'home', intensity: 'quiet', ambient: 'animated' },
	writingStandard: { biome: 'writing', intensity: 'standard', ambient: 'animated' },
	writingQuiet: { biome: 'writing', intensity: 'quiet', ambient: 'animated' },
	articleHeader: { biome: 'quiet', intensity: 'header-only', ambient: 'animated' },
	healthcareStandard: {
		biome: 'healthcare',
		intensity: 'standard',
		ambient: 'animated'
	},
	healthcareQuiet: { biome: 'healthcare', intensity: 'quiet', ambient: 'animated' },
	healthcareMinimal: {
		biome: 'healthcare',
		intensity: 'minimal',
		ambient: 'animated'
	},
	calcuttaStandard: { biome: 'calcutta', intensity: 'standard', ambient: 'animated' },
	labStatic: { biome: 'lab', intensity: 'standard', ambient: 'static' },
	notesQuiet: { biome: 'notes', intensity: 'quiet', ambient: 'animated' },
	quietMinimal: { biome: 'quiet', intensity: 'minimal', ambient: 'animated' }
} as const satisfies Record<string, RouteMotionConfig>;

const CALCUTTA_LABELS = new Set([
	'calcutta',
	'kolkata',
	'calcutta-life',
	'calcutta life',
	'kolkata-life',
	'kolkata life'
]);
const NOTES_NORMAL_SHELL_ROUTES = new Set(['sign-in', 'forgot-password', 'reset-password']);

function pathOnly(pathname: string): string {
	const input = pathname.trim();

	if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
		try {
			return new URL(input).pathname;
		} catch {
			// Fall through to treating malformed input as a pathname.
		}
	}

	return input.split(/[?#]/, 1)[0] || '/';
}

export function normalisePathname(pathname: string): string {
	const path = pathOnly(pathname);
	const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
	const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
	return collapsed === '/' ? collapsed : collapsed.replace(/\/+$/, '');
}

function segmentsFor(pathname: string): string[] {
	return normalisePathname(pathname).split('/').filter(Boolean);
}

function hasExactSegments(segments: readonly string[], ...expected: readonly string[]): boolean {
	return (
		segments.length === expected.length &&
		expected.every((segment, index) => segments[index] === segment)
	);
}

function normaliseLabel(value: string | null | undefined): string {
	return value?.trim().toLocaleLowerCase('en-US') ?? '';
}

function isCalcuttaLabel(value: string | null | undefined): boolean {
	return CALCUTTA_LABELS.has(normaliseLabel(value));
}

/**
 * Maps a route to the single normal-shell atmosphere contract. Segment matching
 * avoids prefix collisions such as `/blog/gamesmanship` or `/start-here-now`.
 */
export function resolveRouteMotion(
	pathname: string,
	metadata: RouteMotionMetadata = {}
): RouteMotionConfig {
	const segments = segmentsFor(pathname);
	const [first, second, third] = segments;

	if (metadata.specialShell || metadata.ownsAnimationLoop) {
		return ROUTE_MOTION_CONFIGS.off;
	}

	// Specialist experiences take precedence over every general blog/notes rule.
	if (
		(first === 'notes' && second === 'studio') ||
		(first === 'blog' && second === 'games') ||
		(first === 'images' && second === 'sketches') ||
		(first === 'blog' && second === 'visualizations' && segments.length > 2)
	) {
		return ROUTE_MOTION_CONFIGS.off;
	}

	// The index owns an Artificial Life loop, so its lab atmosphere remains static.
	if (hasExactSegments(segments, 'blog', 'visualizations')) {
		return ROUTE_MOTION_CONFIGS.labStatic;
	}

	if (segments.length === 0) return ROUTE_MOTION_CONFIGS.homeStandard;
	if (hasExactSegments(segments, 'start-here')) return ROUTE_MOTION_CONFIGS.homeQuiet;
	if (hasExactSegments(segments, 'writing')) return ROUTE_MOTION_CONFIGS.writingStandard;

	if (hasExactSegments(segments, 'projects')) return ROUTE_MOTION_CONFIGS.healthcareQuiet;
	if (hasExactSegments(segments, 'consulting')) {
		return ROUTE_MOTION_CONFIGS.healthcareStandard;
	}
	if (hasExactSegments(segments, 'healthcare-it-gulf')) {
		return ROUTE_MOTION_CONFIGS.healthcareQuiet;
	}
	if (hasExactSegments(segments, 'resume')) return ROUTE_MOTION_CONFIGS.healthcareMinimal;
	if (hasExactSegments(segments, 'contact')) return ROUTE_MOTION_CONFIGS.quietMinimal;

	if (hasExactSegments(segments, 'notes')) return ROUTE_MOTION_CONFIGS.notesQuiet;
	if (
		first === 'notes' &&
		segments.length === 2 &&
		second !== undefined &&
		NOTES_NORMAL_SHELL_ROUTES.has(second)
	) {
		return ROUTE_MOTION_CONFIGS.notesQuiet;
	}
	// Any other public note route owns a drawing canvas.
	if (first === 'notes' && segments.length > 1) return ROUTE_MOTION_CONFIGS.off;

	if (first === 'topics') {
		if (isCalcuttaLabel(second) || isCalcuttaLabel(metadata.topic)) {
			return ROUTE_MOTION_CONFIGS.calcuttaStandard;
		}
		return ROUTE_MOTION_CONFIGS.writingStandard;
	}

	if (first === 'blog') {
		if (segments.length === 1) return ROUTE_MOTION_CONFIGS.writingQuiet;

		if (second === 'archive') return ROUTE_MOTION_CONFIGS.writingStandard;

		if (second === 'topics') {
			if (isCalcuttaLabel(third) || isCalcuttaLabel(metadata.topic)) {
				return ROUTE_MOTION_CONFIGS.calcuttaStandard;
			}
			return ROUTE_MOTION_CONFIGS.writingStandard;
		}

		// Two segments identify a category index; three identify an article.
		if (segments.length === 2) {
			if (isCalcuttaLabel(second) || isCalcuttaLabel(metadata.category)) {
				return ROUTE_MOTION_CONFIGS.calcuttaStandard;
			}
			return ROUTE_MOTION_CONFIGS.writingStandard;
		}

		return ROUTE_MOTION_CONFIGS.articleHeader;
	}

	return ROUTE_MOTION_CONFIGS.quietMinimal;
}

export const resolveRouteBiome = resolveRouteMotion;

export function isViewTransitionRoute(
	pathname: string,
	metadata: RouteMotionMetadata = {}
): boolean {
	const config = resolveRouteMotion(pathname, metadata);
	return config.biome !== 'off' && config.ambient !== 'static';
}

export function shouldUseViewTransition(
	fromPathname: string,
	toPathname: string,
	motion: ResolvedMotion,
	fromMetadata: RouteMotionMetadata = {},
	toMetadata: RouteMotionMetadata = {}
): boolean {
	return (
		motion !== 'still' &&
		normalisePathname(fromPathname) !== normalisePathname(toPathname) &&
		isViewTransitionRoute(fromPathname, fromMetadata) &&
		isViewTransitionRoute(toPathname, toMetadata)
	);
}
