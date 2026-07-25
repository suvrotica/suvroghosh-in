import type { MetricDelta } from './metrics';

export const COLLISION_SEVERITIES = ['minor', 'moderate', 'severe', 'decisive'] as const;
export type CollisionSeverity = (typeof COLLISION_SEVERITIES)[number];

export interface CollisionState {
	immuneUntilMs: number;
	lastCollisionAtMs: number | null;
	lastSourceId: string | null;
	acceptedCollisions: number;
	suppressedCollisions: number;
}

export interface CollisionEvent {
	atMs: number;
	sourceId: string;
	severity: CollisionSeverity;
	ignoresImmunity?: boolean;
	graceMs?: number;
}

export interface CollisionConsequences {
	metricDelta: MetricDelta;
	slowdownMs: number;
	controlImpairmentMs: number;
	pushback: number;
	stumble: boolean;
	fatal: boolean;
}

export interface CollisionResolution {
	applied: boolean;
	reason: 'applied' | 'immune';
	state: CollisionState;
	consequences: CollisionConsequences | null;
}

export const DEFAULT_COLLISION_GRACE_MS: Readonly<Record<CollisionSeverity, number>> = {
	minor: 900,
	moderate: 1_200,
	severe: 1_500,
	decisive: 1_500
};

export const COLLISION_CONSEQUENCES: Readonly<
	Record<CollisionSeverity, Readonly<CollisionConsequences>>
> = {
	minor: {
		metricDelta: { stamina: -4, morale: -3 },
		slowdownMs: 350,
		controlImpairmentMs: 0,
		pushback: 2,
		stumble: false,
		fatal: false
	},
	moderate: {
		metricDelta: { stamina: -14, morale: -9 },
		slowdownMs: 800,
		controlImpairmentMs: 650,
		pushback: 10,
		stumble: true,
		fatal: false
	},
	severe: {
		metricDelta: { stamina: -30, morale: -20 },
		slowdownMs: 1_200,
		controlImpairmentMs: 1_100,
		pushback: 22,
		stumble: true,
		fatal: false
	},
	decisive: {
		metricDelta: { stamina: -100 },
		slowdownMs: 0,
		controlImpairmentMs: 0,
		pushback: 0,
		stumble: true,
		fatal: true
	}
};

export function createCollisionState(): CollisionState {
	return {
		immuneUntilMs: 0,
		lastCollisionAtMs: null,
		lastSourceId: null,
		acceptedCollisions: 0,
		suppressedCollisions: 0
	};
}

function validTime(atMs: number): number {
	if (!Number.isFinite(atMs)) throw new RangeError('Collision time must be finite.');
	return Math.max(0, atMs);
}

export function canReceiveCollision(state: CollisionState, atMs: number): boolean {
	return validTime(atMs) >= state.immuneUntilMs;
}

export function resolveCollision(
	state: CollisionState,
	event: CollisionEvent
): CollisionResolution {
	const atMs = validTime(event.atMs);
	if (!event.ignoresImmunity && !canReceiveCollision(state, atMs)) {
		return {
			applied: false,
			reason: 'immune',
			state: {
				...state,
				suppressedCollisions: state.suppressedCollisions + 1
			},
			consequences: null
		};
	}

	const requestedGrace = event.graceMs ?? DEFAULT_COLLISION_GRACE_MS[event.severity];
	const graceMs = Number.isFinite(requestedGrace) ? Math.max(0, requestedGrace) : 0;
	return {
		applied: true,
		reason: 'applied',
		state: {
			...state,
			immuneUntilMs: atMs + graceMs,
			lastCollisionAtMs: atMs,
			lastSourceId: event.sourceId,
			acceptedCollisions: state.acceptedCollisions + 1
		},
		consequences: {
			...COLLISION_CONSEQUENCES[event.severity],
			metricDelta: { ...COLLISION_CONSEQUENCES[event.severity].metricDelta }
		}
	};
}
