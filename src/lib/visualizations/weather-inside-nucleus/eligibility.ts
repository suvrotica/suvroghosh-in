export const STAGE_MINIMUM_WIDTH = 900;
export const STAGE_MINIMUM_HEIGHT = 600;
export const STAGE_MINIMUM_ASPECT_RATIO = 4 / 3;

export type StageEligibilityMode =
	| 'static-viewport'
	| 'static-save-data'
	| 'static-failure'
	| 'reduced-stills'
	| 'eligible';

export type StageEligibilityResult = Readonly<{
	mode: StageEligibilityMode;
}>;

export type StageEligibilityInput = Readonly<{
	/** CSS-pixel layout viewport width. Omit during SSR. */
	width?: number;
	/** CSS-pixel layout viewport height. Omit during SSR. */
	height?: number;
	saveData?: boolean;
	/** A deliberate user action; it never overrides viewport or failure gates. */
	explicitSaveDataOverride?: boolean;
	/** Set after WebGL context loss, failed warm-up, or another session-level stage failure. */
	sessionFailure?: boolean;
	prefersReducedMotion?: boolean;
	stillSetting?: boolean;
}>;

export type WebGL2Probe = () => boolean;

type StageOneDecision =
	| Readonly<{ kind: 'resolved'; result: StageEligibilityResult }>
	| Readonly<{ kind: 'probe-webgl2' }>;

/**
 * Resolves every policy gate that must run before WebGL is even queried. Missing viewport values
 * deliberately produce the SSR/static result.
 */
export function evaluateStagePrerequisites(input: StageEligibilityInput): StageOneDecision {
	if (!isEligibleViewport(input.width, input.height)) {
		return resolved('static-viewport');
	}

	if (input.saveData === true && input.explicitSaveDataOverride !== true) {
		return resolved('static-save-data');
	}

	if (input.sessionFailure === true) {
		return resolved('static-failure');
	}

	if (input.prefersReducedMotion === true || input.stillSetting === true) {
		return resolved('reduced-stills');
	}

	return { kind: 'probe-webgl2' };
}

/**
 * Applies the two-stage policy. The supplied probe is called exactly once only after all static
 * and manual-stills gates pass. Probe failure and exceptions become the recoverable static mode.
 */
export function evaluateStageEligibility(
	input: StageEligibilityInput,
	probeWebGL2: WebGL2Probe
): StageEligibilityResult {
	const stageOne = evaluateStagePrerequisites(input);
	if (stageOne.kind === 'resolved') return stageOne.result;

	try {
		return { mode: probeWebGL2() ? 'eligible' : 'static-failure' };
	} catch {
		return { mode: 'static-failure' };
	}
}

export function isEligibleViewport(width: number | undefined, height: number | undefined): boolean {
	return (
		Number.isFinite(width) &&
		Number.isFinite(height) &&
		width! >= STAGE_MINIMUM_WIDTH &&
		height! >= STAGE_MINIMUM_HEIGHT &&
		width! / height! >= STAGE_MINIMUM_ASPECT_RATIO
	);
}

function resolved(mode: StageEligibilityMode): StageOneDecision {
	return { kind: 'resolved', result: { mode } };
}
