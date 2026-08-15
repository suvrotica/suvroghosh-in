import type { RayMarchingQualityChoice, RayMarchingQualityTier } from './types';

export type RayMarchingQualityProfile = Readonly<{
	tier: RayMarchingQualityTier;
	label: 'High' | 'Balanced' | 'Saver';
	mainSteps: number;
	shadowSteps: number;
	aoSamples: number;
	maxFramebufferPixels: number;
	devicePixelRatioCap: number;
}>;

export const RAY_MARCHING_QUALITY_PROFILES = Object.freeze({
	high: Object.freeze({
		tier: 'high',
		label: 'High',
		mainSteps: 96,
		shadowSteps: 24,
		aoSamples: 5,
		maxFramebufferPixels: 1_350_000,
		devicePixelRatioCap: 1.5
	}),
	balanced: Object.freeze({
		tier: 'balanced',
		label: 'Balanced',
		mainSteps: 72,
		shadowSteps: 14,
		aoSamples: 4,
		maxFramebufferPixels: 720_000,
		devicePixelRatioCap: 1.25
	}),
	saver: Object.freeze({
		tier: 'saver',
		label: 'Saver',
		mainSteps: 48,
		shadowSteps: 0,
		aoSamples: 0,
		maxFramebufferPixels: 360_000,
		devicePixelRatioCap: 1
	})
} as const satisfies Record<RayMarchingQualityTier, RayMarchingQualityProfile>);

export type RayMarchingQualityHints = Readonly<{
	width: number;
	height: number;
	devicePixelRatio: number;
	hardwareConcurrency?: number;
	deviceMemory?: number;
	coarsePointer?: boolean;
	saveData?: boolean;
}>;

export type RayMarchingFramebufferSize = Readonly<{
	cssWidth: number;
	cssHeight: number;
	backingWidth: number;
	backingHeight: number;
	pixelRatio: number;
	pixelCount: number;
	limitedByBudget: boolean;
}>;

export const AUTO_QUALITY_WARMUP_MS = 900;
export const AUTO_QUALITY_POOR_FRAME_MS = 28;
export const AUTO_QUALITY_POOR_WINDOW_MS = 2_400;
export const AUTO_QUALITY_COOLDOWN_MS = 8_000;
export const AUTO_QUALITY_LONG_FRAME_MS = 180;
const MAX_COUNTED_FRAME_MS = 50;

export type QualityFramePhase = 'active' | 'resume' | 'compile' | 'resize' | 'hidden';

export type QualityFrameObservation = Readonly<{
	nowMs: number;
	frameMs: number;
	phase?: QualityFramePhase;
}>;

export type QualityObservationIgnoredReason =
	| 'explicit-choice'
	| 'resume'
	| 'compile'
	| 'resize'
	| 'hidden'
	| 'long-frame'
	| 'invalid-frame'
	| 'non-monotonic';

export type RayMarchingQualityMonitor = Readonly<{
	choice: RayMarchingQualityChoice;
	tier: RayMarchingQualityTier;
	warmupActiveMs: number;
	poorActiveMs: number;
	cooldownUntilMs: number;
	lastObservationMs: number | null;
	downgradeCount: number;
}>;

export type QualityMonitorUpdate = Readonly<{
	state: RayMarchingQualityMonitor;
	downgradedFrom: RayMarchingQualityTier | null;
	downgradedTo: RayMarchingQualityTier | null;
	ignoredReason: QualityObservationIgnoredReason | null;
}>;

function finitePositive(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteDimension(value: number): number {
	return Math.max(1, Math.round(finitePositive(value, 1)));
}

export function rayMarchingQualityProfile(tier: RayMarchingQualityTier): RayMarchingQualityProfile {
	return RAY_MARCHING_QUALITY_PROFILES[tier];
}

/**
 * Produces the tier-specific GLSL variant from one inspectable fragment template. Integer feature
 * switches let the GLSL preprocessor remove Saver shadow/AO work instead of merely skipping it at
 * runtime.
 */
export function buildFragmentSource(template: string, tier: RayMarchingQualityTier): string {
	const profile = rayMarchingQualityProfile(tier);
	const replacements = {
		__MAIN_STEPS__: String(profile.mainSteps),
		__SHADOW_STEPS__: String(profile.shadowSteps),
		__AO_SAMPLES__: String(profile.aoSamples),
		__ENABLE_SHADOWS__: profile.shadowSteps > 0 ? '1' : '0',
		__ENABLE_AO__: profile.aoSamples > 0 ? '1' : '0'
	} as const;

	let source = template;
	for (const [token, replacement] of Object.entries(replacements)) {
		source = source.split(token).join(replacement);
	}
	return source;
}

export function chooseInitialRayMarchingQuality(
	choice: RayMarchingQualityChoice,
	hints: RayMarchingQualityHints
): RayMarchingQualityTier {
	if (choice !== 'auto') return choice;

	const shortEdge = Math.min(finiteDimension(hints.width), finiteDimension(hints.height));
	const stronglyConstrained =
		hints.saveData === true ||
		(hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4) ||
		(hints.deviceMemory !== undefined && hints.deviceMemory <= 4) ||
		(hints.coarsePointer === true && shortEdge <= 480);

	// Auto deliberately never selects High. High is an informed, explicit visitor choice.
	return stronglyConstrained ? 'saver' : 'balanced';
}

/**
 * Resolves the CSS surface and its independent drawing-buffer dimensions. The result preserves
 * orientation and aspect while respecting both the tier DPR cap and its absolute pixel budget.
 */
export function resolveRayMarchingFramebufferSize(
	cssWidthInput: number,
	cssHeightInput: number,
	devicePixelRatioInput: number,
	tier: RayMarchingQualityTier
): RayMarchingFramebufferSize {
	const cssWidth = finiteDimension(cssWidthInput);
	const cssHeight = finiteDimension(cssHeightInput);
	const profile = rayMarchingQualityProfile(tier);
	const devicePixelRatio = finitePositive(devicePixelRatioInput, 1);
	const requestedPixelRatio = Math.min(devicePixelRatio, profile.devicePixelRatioCap);
	const cssPixels = cssWidth * cssHeight;
	const budgetPixelRatio = Math.sqrt(profile.maxFramebufferPixels / cssPixels);
	const pixelRatio = Math.max(
		1 / Math.max(cssWidth, cssHeight),
		Math.min(requestedPixelRatio, budgetPixelRatio)
	);
	const backingWidth = Math.max(1, Math.floor(cssWidth * pixelRatio));
	const backingHeight = Math.max(1, Math.floor(cssHeight * pixelRatio));
	const pixelCount = backingWidth * backingHeight;

	return Object.freeze({
		cssWidth,
		cssHeight,
		backingWidth,
		backingHeight,
		pixelRatio,
		pixelCount,
		limitedByBudget: budgetPixelRatio < requestedPixelRatio
	});
}

export function nextLowerRayMarchingQuality(tier: RayMarchingQualityTier): RayMarchingQualityTier {
	return tier === 'high' ? 'balanced' : 'saver';
}

export function createRayMarchingQualityMonitor(options: {
	choice?: RayMarchingQualityChoice;
	hints: RayMarchingQualityHints;
	initialTier?: RayMarchingQualityTier;
	nowMs?: number;
}): RayMarchingQualityMonitor {
	const choice = options.choice ?? 'auto';
	const selectedTier = chooseInitialRayMarchingQuality(choice, options.hints);
	const tier = choice === 'auto' && options.initialTier ? options.initialTier : selectedTier;
	const nowMs = Number.isFinite(options.nowMs) && (options.nowMs ?? 0) >= 0 ? options.nowMs! : 0;

	return Object.freeze({
		choice,
		tier,
		warmupActiveMs: 0,
		poorActiveMs: 0,
		cooldownUntilMs: nowMs,
		lastObservationMs: null,
		downgradeCount: 0
	});
}

function ignoredUpdate(
	state: RayMarchingQualityMonitor,
	observation: QualityFrameObservation,
	reason: QualityObservationIgnoredReason
): QualityMonitorUpdate {
	const validNow = Number.isFinite(observation.nowMs) && observation.nowMs >= 0;
	return Object.freeze({
		state: Object.freeze({
			...state,
			poorActiveMs: 0,
			lastObservationMs: validNow ? observation.nowMs : null
		}),
		downgradedFrom: null,
		downgradedTo: null,
		ignoredReason: reason
	});
}

/**
 * Records one representative active frame. Compilation, resize, visibility and resume frames are
 * explicit discontinuities: they reset the persistence window and never influence adaptation.
 */
export function observeRayMarchingQualityFrame(
	state: RayMarchingQualityMonitor,
	observation: QualityFrameObservation
): QualityMonitorUpdate {
	const phase = observation.phase ?? 'active';
	if (state.choice !== 'auto') return ignoredUpdate(state, observation, 'explicit-choice');
	if (phase !== 'active') return ignoredUpdate(state, observation, phase);
	if (
		!Number.isFinite(observation.nowMs) ||
		observation.nowMs < 0 ||
		!Number.isFinite(observation.frameMs) ||
		observation.frameMs <= 0
	) {
		return ignoredUpdate(state, observation, 'invalid-frame');
	}
	if (state.lastObservationMs !== null && observation.nowMs < state.lastObservationMs) {
		return ignoredUpdate(state, observation, 'non-monotonic');
	}
	if (observation.frameMs >= AUTO_QUALITY_LONG_FRAME_MS) {
		return ignoredUpdate(state, observation, 'long-frame');
	}

	const countedFrameMs = Math.min(observation.frameMs, MAX_COUNTED_FRAME_MS);
	if (state.warmupActiveMs < AUTO_QUALITY_WARMUP_MS) {
		return Object.freeze({
			state: Object.freeze({
				...state,
				warmupActiveMs: Math.min(AUTO_QUALITY_WARMUP_MS, state.warmupActiveMs + countedFrameMs),
				poorActiveMs: 0,
				lastObservationMs: observation.nowMs
			}),
			downgradedFrom: null,
			downgradedTo: null,
			ignoredReason: null
		});
	}

	if (observation.nowMs < state.cooldownUntilMs) {
		return Object.freeze({
			state: Object.freeze({
				...state,
				poorActiveMs: 0,
				lastObservationMs: observation.nowMs
			}),
			downgradedFrom: null,
			downgradedTo: null,
			ignoredReason: null
		});
	}

	const poorActiveMs =
		observation.frameMs >= AUTO_QUALITY_POOR_FRAME_MS ? state.poorActiveMs + countedFrameMs : 0;
	const shouldDowngrade = poorActiveMs >= AUTO_QUALITY_POOR_WINDOW_MS && state.tier !== 'saver';
	const tier = shouldDowngrade ? nextLowerRayMarchingQuality(state.tier) : state.tier;

	return Object.freeze({
		state: Object.freeze({
			...state,
			tier,
			poorActiveMs: shouldDowngrade ? 0 : poorActiveMs,
			cooldownUntilMs: shouldDowngrade
				? observation.nowMs + AUTO_QUALITY_COOLDOWN_MS
				: state.cooldownUntilMs,
			lastObservationMs: observation.nowMs,
			downgradeCount: state.downgradeCount + (shouldDowngrade ? 1 : 0)
		}),
		downgradedFrom: shouldDowngrade ? state.tier : null,
		downgradedTo: shouldDowngrade ? tier : null,
		ignoredReason: null
	});
}
