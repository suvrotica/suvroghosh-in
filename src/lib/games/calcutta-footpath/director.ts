import { clamp } from './metrics';

export type DirectorBlockerKind =
	| 'pedestrian'
	| 'vehicle'
	| 'stall-customer'
	| 'cow'
	| 'temporary-obstacle'
	| 'fixed';

export interface DirectorBlocker {
	id: string;
	kind: DirectorBlockerKind;
	releasable?: boolean;
	releasePriority?: number;
}

export interface DirectorObservation {
	nowMs: number;
	routeFair: boolean;
	availableEscapeWidth: number;
	requiredEscapeWidth: number;
	blockers: readonly DirectorBlocker[];
	recentCollisions: number;
	playerSpeed: number;
	stamina: number;
	morale: number;
	timeSinceMeaningfulHazardMs: number;
	currentDensity: number;
	timeSinceFoodMs: number;
	progress: number;
	previousFailedRuns: number;
}

export interface DirectorState {
	blockedSinceMs: number | null;
	lastInterventionAtMs: number | null;
	interventions: number;
}

export type DirectorReleaseMethod =
	| 'move-agent'
	| 'pause-agent'
	| 'dismiss-customer'
	| 'nudge-cow'
	| 'retract-obstacle'
	| 'open-squeeze-gap';

export interface DirectorReleaseAction {
	type: 'release-deadlock';
	method: DirectorReleaseMethod;
	targetId: string | null;
	durationMs: number;
	reason: 'procedural-deadlock';
}

export interface DirectorDecision {
	state: DirectorState;
	release: DirectorReleaseAction | null;
	pressure: number;
	warningTimeMultiplier: number;
	foodSpawnMultiplier: number;
}

export interface DirectorOptions {
	deadlockReleaseDelayMs: number;
	interventionCooldownMs: number;
	releaseDurationMs: number;
}

export const DEFAULT_DIRECTOR_OPTIONS: Readonly<DirectorOptions> = {
	deadlockReleaseDelayMs: 750,
	interventionCooldownMs: 2_500,
	releaseDurationMs: 1_800
};

const BLOCKER_RELEASE_RANK: Readonly<Record<DirectorBlockerKind, number>> = {
	'stall-customer': 0,
	pedestrian: 1,
	vehicle: 2,
	cow: 3,
	'temporary-obstacle': 4,
	fixed: 100
};

function validTime(value: number): number {
	if (!Number.isFinite(value)) throw new RangeError('Director time must be finite.');
	return Math.max(0, value);
}

function nonNegative(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function compareIds(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function releaseMethod(kind: DirectorBlockerKind): DirectorReleaseMethod {
	switch (kind) {
		case 'pedestrian':
			return 'move-agent';
		case 'vehicle':
			return 'pause-agent';
		case 'stall-customer':
			return 'dismiss-customer';
		case 'cow':
			return 'nudge-cow';
		case 'temporary-obstacle':
			return 'retract-obstacle';
		case 'fixed':
			return 'open-squeeze-gap';
	}
}

function selectBlocker(blockers: readonly DirectorBlocker[]): DirectorBlocker | null {
	return (
		blockers
			.filter((blocker) => blocker.releasable !== false && blocker.kind !== 'fixed')
			.sort((left, right) => {
				const leftPriority =
					typeof left.releasePriority === 'number' && Number.isFinite(left.releasePriority)
						? left.releasePriority
						: BLOCKER_RELEASE_RANK[left.kind];
				const rightPriority =
					typeof right.releasePriority === 'number' && Number.isFinite(right.releasePriority)
						? right.releasePriority
						: BLOCKER_RELEASE_RANK[right.kind];
				return leftPriority - rightPriority || compareIds(left.id, right.id);
			})[0] ?? null
	);
}

function pressureFor(observation: DirectorObservation): number {
	let pressure = 0.86 + clamp(observation.progress, 0, 1) * 0.28;
	pressure -= Math.min(0.27, nonNegative(observation.recentCollisions) * 0.075);
	if (observation.stamina < 35) pressure -= (35 - Math.max(0, observation.stamina)) * 0.006;
	if (observation.morale < 35) pressure -= (35 - Math.max(0, observation.morale)) * 0.006;
	if (observation.currentDensity > 0.72) {
		pressure -= Math.min(0.18, (observation.currentDensity - 0.72) * 0.55);
	}
	if (observation.timeSinceMeaningfulHazardMs > 9_000) pressure += 0.14;
	if (observation.playerSpeed < 0.1 && observation.timeSinceMeaningfulHazardMs < 3_000) {
		pressure -= 0.08;
	}
	pressure -= Math.min(0.16, nonNegative(observation.previousFailedRuns) * 0.035);
	return clamp(pressure, 0.55, 1.35);
}

export function createDirectorState(): DirectorState {
	return {
		blockedSinceMs: null,
		lastInterventionAtMs: null,
		interventions: 0
	};
}

export function createDirectorObservation(
	overrides: Partial<DirectorObservation> = {}
): DirectorObservation {
	return {
		nowMs: 0,
		routeFair: true,
		availableEscapeWidth: 64,
		requiredEscapeWidth: 48,
		blockers: [],
		recentCollisions: 0,
		playerSpeed: 1,
		stamina: 100,
		morale: 82,
		timeSinceMeaningfulHazardMs: 0,
		currentDensity: 0.35,
		timeSinceFoodMs: 0,
		progress: 0,
		previousFailedRuns: 0,
		...overrides
	};
}

export function updateDirector(
	currentState: DirectorState,
	observation: DirectorObservation,
	options: Readonly<DirectorOptions> = DEFAULT_DIRECTOR_OPTIONS
): DirectorDecision {
	const nowMs = validTime(observation.nowMs);
	const deadlocked =
		!observation.routeFair ||
		nonNegative(observation.availableEscapeWidth) <
			Math.max(0, nonNegative(observation.requiredEscapeWidth));
	const blockedSinceMs = deadlocked ? (currentState.blockedSinceMs ?? nowMs) : null;
	const blockedDurationMs = blockedSinceMs === null ? 0 : nowMs - blockedSinceMs;
	const cooldownElapsed =
		currentState.lastInterventionAtMs === null ||
		nowMs - currentState.lastInterventionAtMs >= Math.max(0, options.interventionCooldownMs);

	let release: DirectorReleaseAction | null = null;
	let state: DirectorState = { ...currentState, blockedSinceMs };
	if (
		deadlocked &&
		blockedDurationMs >= Math.max(0, options.deadlockReleaseDelayMs) &&
		cooldownElapsed
	) {
		const blocker = selectBlocker(observation.blockers);
		release = {
			type: 'release-deadlock',
			method: blocker ? releaseMethod(blocker.kind) : 'open-squeeze-gap',
			targetId: blocker?.id ?? null,
			durationMs: Math.max(0, options.releaseDurationMs),
			reason: 'procedural-deadlock'
		};
		state = {
			blockedSinceMs: null,
			lastInterventionAtMs: nowMs,
			interventions: currentState.interventions + 1
		};
	}

	const failureAssist = Math.min(4, nonNegative(observation.previousFailedRuns));
	const lowMetricAssist = Math.max(0, 40 - Math.min(observation.stamina, observation.morale)) / 100;
	const foodNeed =
		observation.timeSinceFoodMs > 45_000 || observation.stamina < 35 || observation.morale < 35;

	return {
		state,
		release,
		pressure: pressureFor(observation),
		warningTimeMultiplier: 1 + failureAssist * 0.05 + lowMetricAssist,
		foodSpawnMultiplier: foodNeed ? 1.2 + failureAssist * 0.08 : 1 + failureAssist * 0.04
	};
}
