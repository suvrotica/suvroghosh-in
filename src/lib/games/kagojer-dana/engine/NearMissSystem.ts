/** Stateful outside -> halo -> closest approach -> clean exit near-miss scoring. */

export type NearMissTargetKind =
	| 'architecture'
	| 'vehicle'
	| 'wire'
	| 'vegetation'
	| 'water'
	| 'person'
	| 'animal'
	| 'sacred-site'
	| 'worshipper'
	| 'religious-activity'
	| 'other';

export interface NearMissObservation {
	readonly id: string;
	readonly category: string;
	readonly kind: NearMissTargetKind;
	/** Clearance from the plane's swept probes to the obstacle surface, in metres. */
	readonly distanceM: number;
	readonly haloRadiusM?: number;
	readonly basePoints?: number;
	readonly label?: string;
	readonly marginalNote?: string;
	/** Explicit false excludes decorative/non-obstacle geometry. Denied inhabitant kinds always win. */
	readonly scoring?: boolean;
	/** Set from the collision result before this observation is processed. */
	readonly collided?: boolean;
}

export interface NearMissEnteredEvent {
	readonly type: 'entered';
	readonly objectId: string;
	readonly category: string;
	readonly atSeconds: number;
}

export interface NearMissAwardedEvent {
	readonly type: 'awarded';
	readonly objectId: string;
	readonly category: string;
	readonly label: string;
	readonly marginalNote?: string;
	readonly atSeconds: number;
	readonly enteredAtSeconds: number;
	readonly closestDistanceM: number;
	readonly points: number;
	readonly categoryMultiplier: number;
}

export interface NearMissCancelledEvent {
	readonly type: 'cancelled';
	readonly objectId: string;
	readonly category: string;
	readonly atSeconds: number;
	readonly reason: 'collision';
}

export type NearMissEvent = NearMissEnteredEvent | NearMissAwardedEvent | NearMissCancelledEvent;

export interface NearMissSystemOptions {
	readonly defaultHaloRadiusM?: number;
	/** Added to the halo on exit so noisy distance estimates cannot machine-gun transitions. */
	readonly exitHysteresisM?: number;
	readonly categoryDiminishingFactor?: number;
	readonly minimumCategoryMultiplier?: number;
	/** Missing observations normally mean a broad-phase query has moved outside the halo. */
	readonly completeMissingAsExit?: boolean;
}

export interface NearMissDebugSnapshot {
	readonly activeObjectIds: readonly string[];
	readonly resolvedObjectCount: number;
	readonly categoryAwards: Readonly<Record<string, number>>;
	readonly totalScore: number;
}

interface ActivePassage {
	readonly objectId: string;
	readonly category: string;
	readonly kind: NearMissTargetKind;
	readonly haloRadiusM: number;
	readonly basePoints: number;
	readonly label: string;
	readonly marginalNote?: string;
	readonly enteredAtSeconds: number;
	closestDistanceM: number;
}

const NON_SCORING_KINDS = new Set<NearMissTargetKind>([
	'person',
	'animal',
	'sacred-site',
	'worshipper',
	'religious-activity'
]);

function finiteNonNegative(value: number, fallback: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function finiteTime(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

/** People, animals, worshippers, religious activity and sacred sites are never stunt targets. */
export function isNearMissScoringKind(kind: NearMissTargetKind): boolean {
	return !NON_SCORING_KINDS.has(kind);
}

function observationCanScore(observation: NearMissObservation): boolean {
	return observation.scoring !== false && isNearMissScoringKind(observation.kind);
}

export class NearMissSystem {
	readonly defaultHaloRadiusM: number;
	readonly exitHysteresisM: number;
	readonly categoryDiminishingFactor: number;
	readonly minimumCategoryMultiplier: number;
	readonly completeMissingAsExit: boolean;

	private readonly active = new Map<string, ActivePassage>();
	private readonly resolved = new Set<string>();
	private readonly awardsByCategory = new Map<string, number>();
	private score = 0;

	constructor(options: NearMissSystemOptions = {}) {
		this.defaultHaloRadiusM = finiteNonNegative(options.defaultHaloRadiusM ?? 0.7, 0.7);
		this.exitHysteresisM = finiteNonNegative(options.exitHysteresisM ?? 0.08, 0.08);
		this.categoryDiminishingFactor = clamp(
			Number.isFinite(options.categoryDiminishingFactor)
				? Number(options.categoryDiminishingFactor)
				: 0.7,
			0.05,
			1
		);
		this.minimumCategoryMultiplier = clamp(
			Number.isFinite(options.minimumCategoryMultiplier)
				? Number(options.minimumCategoryMultiplier)
				: 0.2,
			0,
			1
		);
		this.completeMissingAsExit = options.completeMissingAsExit ?? true;
	}

	get totalScore(): number {
		return this.score;
	}

	hasResolved(objectId: string): boolean {
		return this.resolved.has(objectId);
	}

	/**
	 * Processes one simulation/broad-phase frame. Awards are returned only on a clean exit; entered
	 * events may drive a restrained halo sound but carry no points.
	 */
	update(
		observations: readonly NearMissObservation[],
		atSeconds: number
	): readonly NearMissEvent[] {
		const now = finiteTime(atSeconds);
		const events: NearMissEvent[] = [];
		const observedIds = new Set<string>();

		for (const observation of observations) {
			if (!observation.id || observedIds.has(observation.id)) continue;
			observedIds.add(observation.id);
			if (this.resolved.has(observation.id)) continue;

			if (observation.collided === true || observation.distanceM < 0) {
				const cancelled = this.cancelCollision(observation.id, now, observation.category);
				if (cancelled) events.push(cancelled);
				continue;
			}

			// Denied targets do not enter the stunt state machine at all. An accidental `scoring: true`
			// can therefore never turn a person, animal or sacred place into a score source.
			if (!observationCanScore(observation)) continue;

			const distanceM = finiteNonNegative(observation.distanceM, Number.POSITIVE_INFINITY);
			const haloRadiusM = Math.max(
				0.01,
				finiteNonNegative(
					observation.haloRadiusM ?? this.defaultHaloRadiusM,
					this.defaultHaloRadiusM
				)
			);
			const existing = this.active.get(observation.id);
			if (!existing) {
				if (distanceM > haloRadiusM) continue;
				this.active.set(observation.id, {
					objectId: observation.id,
					category: observation.category,
					kind: observation.kind,
					haloRadiusM,
					basePoints: Math.max(
						1,
						Math.round(finiteNonNegative(observation.basePoints ?? 100, 100))
					),
					label: observation.label ?? observation.category,
					marginalNote: observation.marginalNote,
					enteredAtSeconds: now,
					closestDistanceM: distanceM
				});
				events.push({
					type: 'entered',
					objectId: observation.id,
					category: observation.category,
					atSeconds: now
				});
				continue;
			}

			existing.closestDistanceM = Math.min(existing.closestDistanceM, distanceM);
			if (distanceM > existing.haloRadiusM + this.exitHysteresisM) {
				events.push(this.award(existing, now));
			}
		}

		if (this.completeMissingAsExit) {
			for (const passage of [...this.active.values()]) {
				if (!observedIds.has(passage.objectId)) events.push(this.award(passage, now));
			}
		}

		return events;
	}

	/** Cancels and consumes an object immediately when CollisionSystem reports contact. */
	cancelCollision(
		objectId: string,
		atSeconds: number,
		fallbackCategory = 'obstacle'
	): NearMissCancelledEvent | null {
		if (!objectId || this.resolved.has(objectId)) return null;
		const passage = this.active.get(objectId);
		this.active.delete(objectId);
		this.resolved.add(objectId);
		return {
			type: 'cancelled',
			objectId,
			category: passage?.category ?? fallbackCategory,
			atSeconds: finiteTime(atSeconds),
			reason: 'collision'
		};
	}

	resetFlight(): void {
		this.active.clear();
		this.resolved.clear();
		this.awardsByCategory.clear();
		this.score = 0;
	}

	debugSnapshot(): NearMissDebugSnapshot {
		return {
			activeObjectIds: [...this.active.keys()].sort(),
			resolvedObjectCount: this.resolved.size,
			categoryAwards: Object.fromEntries(
				[...this.awardsByCategory.entries()].sort(([left], [right]) => left.localeCompare(right))
			),
			totalScore: this.score
		};
	}

	private award(passage: ActivePassage, atSeconds: number): NearMissAwardedEvent {
		this.active.delete(passage.objectId);
		this.resolved.add(passage.objectId);
		const previousCategoryAwards = this.awardsByCategory.get(passage.category) ?? 0;
		const categoryMultiplier = Math.max(
			this.minimumCategoryMultiplier,
			this.categoryDiminishingFactor ** previousCategoryAwards
		);
		const proximity = clamp(1 - passage.closestDistanceM / passage.haloRadiusM, 0, 1);
		const proximityMultiplier = 0.55 + proximity * 0.45;
		const points = Math.max(
			1,
			Math.round(passage.basePoints * proximityMultiplier * categoryMultiplier)
		);
		this.awardsByCategory.set(passage.category, previousCategoryAwards + 1);
		this.score += points;
		return {
			type: 'awarded',
			objectId: passage.objectId,
			category: passage.category,
			label: passage.label,
			marginalNote: passage.marginalNote,
			atSeconds,
			enteredAtSeconds: passage.enteredAtSeconds,
			closestDistanceM: passage.closestDistanceM,
			points,
			categoryMultiplier
		};
	}
}
