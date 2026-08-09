import type { OrchestraQualityTier, OrchestraSurfaceSize } from './types';

export type OrchestraQualityProfile = Readonly<{
	tier: OrchestraQualityTier;
	dprCap: number;
	maxVisiblePoints: number;
	trailFraction: number;
	maxEventPulses: number;
	maxDensitySamples: number;
	maxRecurrenceRings: number;
	densityHaze: boolean;
	wakeParticleBudget: number;
	contourResolution: number;
}>;

export type OrchestraQualityHints = Readonly<{
	width: number;
	height: number;
	devicePixelRatio: number;
	hardwareConcurrency?: number;
	deviceMemory?: number;
	saveData?: boolean;
}>;

export type OrchestraDegradationStep = Readonly<{
	order: number;
	id:
		| 'density-haze'
		| 'pixel-ratio'
		| 'trail-length'
		| 'wake-particles'
		| 'noise-contours'
		| 'visible-points'
		| 'canvas-fallback';
	label: string;
	preservesTrajectory: true;
	preservesScore: true;
}>;

export const ORCHESTRA_MAX_DPR = 1.5;
export const ORCHESTRA_HARD_POINT_CAP = 80_000;
export const ORCHESTRA_HARD_EVENT_CAP = 256;

export const ORCHESTRA_QUALITY_PROFILES = Object.freeze({
	low: Object.freeze({
		tier: 'low',
		dprCap: 1,
		maxVisiblePoints: 18_000,
		trailFraction: 0.52,
		maxEventPulses: 48,
		maxDensitySamples: 0,
		maxRecurrenceRings: 48,
		densityHaze: false,
		wakeParticleBudget: 96,
		contourResolution: 0
	}),
	medium: Object.freeze({
		tier: 'medium',
		dprCap: 1.25,
		maxVisiblePoints: 36_000,
		trailFraction: 0.78,
		maxEventPulses: 96,
		maxDensitySamples: 640,
		maxRecurrenceRings: 96,
		densityHaze: true,
		wakeParticleBudget: 256,
		contourResolution: 48
	}),
	high: Object.freeze({
		tier: 'high',
		dprCap: ORCHESTRA_MAX_DPR,
		maxVisiblePoints: 60_000,
		trailFraction: 1,
		maxEventPulses: 160,
		maxDensitySamples: 1_200,
		maxRecurrenceRings: 160,
		densityHaze: true,
		wakeParticleBudget: 512,
		contourResolution: 72
	})
} as const satisfies Record<OrchestraQualityTier, OrchestraQualityProfile>);

/**
 * Renderer-only degradation order. Every step explicitly preserves the immutable trajectory and
 * deterministic score; a host may expose this list in performance diagnostics.
 */
export const ORCHESTRA_DEGRADATION_ORDER = Object.freeze([
	{
		order: 1,
		id: 'density-haze',
		label: 'Reduce or disable density haze',
		preservesTrajectory: true,
		preservesScore: true
	},
	{
		order: 2,
		id: 'pixel-ratio',
		label: 'Reduce device-pixel ratio',
		preservesTrajectory: true,
		preservesScore: true
	},
	{
		order: 3,
		id: 'trail-length',
		label: 'Shorten the visible history',
		preservesTrajectory: true,
		preservesScore: true
	},
	{
		order: 4,
		id: 'wake-particles',
		label: 'Reduce weather-wake particles',
		preservesTrajectory: true,
		preservesScore: true
	},
	{
		order: 5,
		id: 'noise-contours',
		label: 'Reduce or disable noise contours',
		preservesTrajectory: true,
		preservesScore: true
	},
	{
		order: 6,
		id: 'visible-points',
		label: 'Reduce visible trajectory points',
		preservesTrajectory: true,
		preservesScore: true
	},
	{
		order: 7,
		id: 'canvas-fallback',
		label: 'Use the Canvas 2D fallback',
		preservesTrajectory: true,
		preservesScore: true
	}
] as const satisfies readonly OrchestraDegradationStep[]);

export function qualityProfile(tier: OrchestraQualityTier): OrchestraQualityProfile {
	return ORCHESTRA_QUALITY_PROFILES[tier];
}

/** Uniform deterministic sampling keeps wake marks within the renderer-only quality budget. */
export function wakeSampleStride(visiblePointCount: number, tier: OrchestraQualityTier): number {
	const count = Number.isFinite(visiblePointCount) ? Math.max(0, Math.floor(visiblePointCount)) : 0;
	return Math.max(1, Math.ceil(count / Math.max(1, qualityProfile(tier).wakeParticleBudget)));
}

export function cappedPixelRatio(devicePixelRatio: number, tier: OrchestraQualityTier): number {
	const finiteRatio = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
	return Math.min(ORCHESTRA_MAX_DPR, qualityProfile(tier).dprCap, Math.max(1, finiteRatio));
}

export function surfaceSize(
	cssWidth: number,
	cssHeight: number,
	devicePixelRatio: number,
	tier: OrchestraQualityTier
): OrchestraSurfaceSize {
	const width = Math.max(1, Math.round(Number.isFinite(cssWidth) ? cssWidth : 1));
	const height = Math.max(1, Math.round(Number.isFinite(cssHeight) ? cssHeight : 1));
	const pixelRatio = cappedPixelRatio(devicePixelRatio, tier);
	return {
		cssWidth: width,
		cssHeight: height,
		pixelWidth: Math.max(1, Math.round(width * pixelRatio)),
		pixelHeight: Math.max(1, Math.round(height * pixelRatio)),
		pixelRatio
	};
}

export function chooseInitialQuality(
	choice: OrchestraQualityTier | 'auto',
	hints: OrchestraQualityHints
): OrchestraQualityTier {
	if (choice !== 'auto') return choice;
	const shortEdge = Math.min(hints.width, hints.height);
	if (
		hints.saveData === true ||
		shortEdge <= 640 ||
		(hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4) ||
		(hints.deviceMemory !== undefined && hints.deviceMemory <= 4)
	) {
		return 'low';
	}
	if (
		hints.width >= 1_100 &&
		hints.height >= 700 &&
		(hints.hardwareConcurrency === undefined || hints.hardwareConcurrency >= 8) &&
		(hints.deviceMemory === undefined || hints.deviceMemory >= 8) &&
		hints.devicePixelRatio <= 2.5
	) {
		return 'high';
	}
	return 'medium';
}

export function nextLowerQuality(tier: OrchestraQualityTier): OrchestraQualityTier {
	return tier === 'high' ? 'medium' : 'low';
}

/** One-tier-at-a-time hysteresis prevents renderer pressure from changing the scientific stream. */
export function adaptQuality(
	current: OrchestraQualityTier,
	averageFrameMs: number,
	hints: OrchestraQualityHints
): OrchestraQualityTier {
	if (!Number.isFinite(averageFrameMs) || averageFrameMs <= 0) return current;
	if (averageFrameMs >= 23) return nextLowerQuality(current);
	const constrained = chooseInitialQuality('auto', hints) === 'low';
	if (constrained) return current === 'high' ? 'medium' : current;
	if (averageFrameMs <= 14.5 && current === 'low') return 'medium';
	if (averageFrameMs <= 15.5 && current === 'medium') return 'high';
	return current;
}
