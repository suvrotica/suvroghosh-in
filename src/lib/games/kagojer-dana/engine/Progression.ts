/**
 * Pure local progression for Kagojer Dana. This module intentionally never reads localStorage or
 * any browser global; the shell owns persistence and passes strings through parse/serialize.
 */

export const KAGOJER_DANA_PROGRESSION_VERSION = 1 as const;
export const KAGOJER_DANA_PROGRESSION_STORAGE_KEY = 'kagojer-dana.progression.v1';
export const LANDMARK_OBSERVATION_UNLOCK_SECONDS = 10;

export type ProgressionRegister = 'low' | 'middle' | 'high';
export type ProgressionUnlockKind = 'weather' | 'time' | 'throw-pattern';

export type ProgressionWeatherVariant = 'afternoon-heat' | 'winter-haze' | 'approaching-monsoon';

export type ProgressionTimeVariant = 'late-afternoon' | 'river-evening' | 'after-rain-morning';

export type ProgressionThrowPattern =
	| 'north-window'
	| 'ghat-hand'
	| 'rooftop-gust'
	| 'courtyard-release'
	| 'maidan-crosswind'
	| 'new-town-terrace';

export type ProgressionUnlockId =
	| `weather:${ProgressionWeatherVariant}`
	| `time:${ProgressionTimeVariant}`
	| `throw:${ProgressionThrowPattern}`;

/** The four named variants whose completion may advance the poetic sequence. */
export type ProgressionCompletableVariant =
	| 'afternoon-heat'
	| 'winter-haze'
	| 'river-evening'
	| 'approaching-monsoon';

export type ProgressionLandingKind =
	| 'ghat'
	| 'rooftop'
	| 'courtyard'
	| 'maidan-edge'
	| 'new-town-terrace'
	| 'other';

export type ProgressionWindKind =
	| 'river-breeze'
	| 'roof-thermal'
	| 'street-thermal'
	| 'traffic-wake'
	| 'other';

export interface ProgressionLandmarkObservation {
	readonly landmarkId: string;
	readonly visibleSeconds: number;
}

export interface ProgressionWindTransfer {
	readonly from: ProgressionWindKind;
	readonly to: ProgressionWindKind;
}

export interface ProgressionLanding {
	readonly kind: ProgressionLandingKind;
	/** Collisions at a location do not unlock its starting throw. */
	readonly graceful: boolean;
}

/** Small controller-facing summary; no simulation log or exact replay is required. */
export interface ProgressionFlightOutcome {
	readonly visitedRegisters: readonly ProgressionRegister[];
	readonly landmarkObservations?: readonly ProgressionLandmarkObservation[];
	readonly windTransfers?: readonly ProgressionWindTransfer[];
	readonly landing?: ProgressionLanding | null;
	readonly completedVariant?: ProgressionCompletableVariant | null;
}

export interface ProgressionState {
	readonly version: typeof KAGOJER_DANA_PROGRESSION_VERSION;
	readonly unlocked: readonly ProgressionUnlockId[];
	readonly completedVariants: readonly ProgressionCompletableVariant[];
	readonly flightCount: number;
}

export interface ProgressionUnlockDefinition {
	readonly id: ProgressionUnlockId;
	readonly kind: ProgressionUnlockKind;
	readonly variant: ProgressionWeatherVariant | ProgressionTimeVariant | ProgressionThrowPattern;
	readonly title: string;
	readonly poeticNote: string;
	readonly initiallyUnlocked: boolean;
}

export interface ProgressionUnlockEvent extends ProgressionUnlockDefinition {
	readonly reason: string;
}

export interface ProgressionUpdate {
	readonly state: ProgressionState;
	readonly newUnlocks: readonly ProgressionUnlockEvent[];
}

export const PROGRESSION_UNLOCK_CATALOG = Object.freeze([
	{
		id: 'weather:afternoon-heat',
		kind: 'weather',
		variant: 'afternoon-heat',
		title: 'Afternoon heat',
		poeticNote: 'Warm roofs loosen the first patient columns of air.',
		initiallyUnlocked: true
	},
	{
		id: 'time:late-afternoon',
		kind: 'time',
		variant: 'late-afternoon',
		title: 'Late afternoon',
		poeticNote: 'The original throw begins while the long light still reaches the lane.',
		initiallyUnlocked: true
	},
	{
		id: 'throw:north-window',
		kind: 'throw-pattern',
		variant: 'north-window',
		title: 'The north window',
		poeticNote: 'Ruled paper waits beside laundry, tea steam and a listening crow.',
		initiallyUnlocked: true
	},
	{
		id: 'weather:winter-haze',
		kind: 'weather',
		variant: 'winter-haze',
		title: 'Winter haze',
		poeticNote: 'The far city returns as graphite softened beneath tracing paper.',
		initiallyUnlocked: false
	},
	{
		id: 'time:river-evening',
		kind: 'time',
		variant: 'river-evening',
		title: 'River evening',
		poeticNote: 'The Hooghly keeps a little light after the streets have spent theirs.',
		initiallyUnlocked: false
	},
	{
		id: 'weather:approaching-monsoon',
		kind: 'weather',
		variant: 'approaching-monsoon',
		title: 'Rain waiting beyond the bridge',
		poeticNote: 'A dark page of weather turns slowly toward the city.',
		initiallyUnlocked: false
	},
	{
		id: 'time:after-rain-morning',
		kind: 'time',
		variant: 'after-rain-morning',
		title: 'The morning after rain',
		poeticNote: 'Every parapet holds a thin new sky.',
		initiallyUnlocked: false
	},
	{
		id: 'throw:ghat-hand',
		kind: 'throw-pattern',
		variant: 'ghat-hand',
		title: 'A hand at the ghat',
		poeticNote: 'The next flight begins above wet steps and flower-bright water.',
		initiallyUnlocked: false
	},
	{
		id: 'throw:rooftop-gust',
		kind: 'throw-pattern',
		variant: 'rooftop-gust',
		title: 'The rooftop gust',
		poeticNote: 'A parapet releases the fold exactly when the washing lifts.',
		initiallyUnlocked: false
	},
	{
		id: 'throw:courtyard-release',
		kind: 'throw-pattern',
		variant: 'courtyard-release',
		title: 'Courtyard release',
		poeticNote: 'The small square of sky sends the plane back between the roofs.',
		initiallyUnlocked: false
	},
	{
		id: 'throw:maidan-crosswind',
		kind: 'throw-pattern',
		variant: 'maidan-crosswind',
		title: 'Maidan crosswind',
		poeticNote: 'Open grass gives the throw no wall to blame.',
		initiallyUnlocked: false
	},
	{
		id: 'throw:new-town-terrace',
		kind: 'throw-pattern',
		variant: 'new-town-terrace',
		title: 'New Town terrace',
		poeticNote: 'Glass, cranes and young trees wait beneath a stubborn paper wing.',
		initiallyUnlocked: false
	}
] as const satisfies readonly ProgressionUnlockDefinition[]);

const CATALOG_BY_ID = new Map<ProgressionUnlockId, ProgressionUnlockDefinition>(
	PROGRESSION_UNLOCK_CATALOG.map((definition) => [definition.id, definition])
);

const CATALOG_ORDER = new Map<ProgressionUnlockId, number>(
	PROGRESSION_UNLOCK_CATALOG.map((definition, index) => [definition.id, index])
);

const COMPLETABLE_VARIANTS = new Set<ProgressionCompletableVariant>([
	'afternoon-heat',
	'winter-haze',
	'river-evening',
	'approaching-monsoon'
]);

const LANDING_UNLOCKS: Readonly<Partial<Record<ProgressionLandingKind, ProgressionUnlockId>>> = {
	ghat: 'throw:ghat-hand',
	rooftop: 'throw:rooftop-gust',
	courtyard: 'throw:courtyard-release',
	'maidan-edge': 'throw:maidan-crosswind',
	'new-town-terrace': 'throw:new-town-terrace'
};

function catalogSort(left: ProgressionUnlockId, right: ProgressionUnlockId): number {
	return (
		(CATALOG_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
		(CATALOG_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
	);
}

function variantSort(
	left: ProgressionCompletableVariant,
	right: ProgressionCompletableVariant
): number {
	const order: readonly ProgressionCompletableVariant[] = [
		'afternoon-heat',
		'winter-haze',
		'river-evening',
		'approaching-monsoon'
	];
	return order.indexOf(left) - order.indexOf(right);
}

function frozenState(
	unlocked: Iterable<ProgressionUnlockId>,
	completedVariants: Iterable<ProgressionCompletableVariant>,
	flightCount: number
): ProgressionState {
	const unlockedSet = new Set<ProgressionUnlockId>(
		PROGRESSION_UNLOCK_CATALOG.filter((definition) => definition.initiallyUnlocked).map(
			(definition) => definition.id
		)
	);
	for (const id of unlocked) {
		if (CATALOG_BY_ID.has(id)) unlockedSet.add(id);
	}
	const completedSet = new Set<ProgressionCompletableVariant>();
	for (const variant of completedVariants) {
		if (COMPLETABLE_VARIANTS.has(variant)) completedSet.add(variant);
	}
	return Object.freeze({
		version: KAGOJER_DANA_PROGRESSION_VERSION,
		unlocked: Object.freeze([...unlockedSet].sort(catalogSort)),
		completedVariants: Object.freeze([...completedSet].sort(variantSort)),
		flightCount: Math.max(
			0,
			Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number.isFinite(flightCount) ? flightCount : 0))
		)
	});
}

export function createDefaultProgressionState(): ProgressionState {
	return frozenState([], [], 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Sanitises untrusted persisted data, drops unknown IDs, and restores required defaults. */
export function normaliseProgressionState(value: unknown): ProgressionState {
	if (!isRecord(value) || value.version !== KAGOJER_DANA_PROGRESSION_VERSION) {
		return createDefaultProgressionState();
	}
	const unlocked = Array.isArray(value.unlocked)
		? value.unlocked.filter(
				(id): id is ProgressionUnlockId =>
					typeof id === 'string' && CATALOG_BY_ID.has(id as ProgressionUnlockId)
			)
		: [];
	const completed = Array.isArray(value.completedVariants)
		? value.completedVariants.filter(
				(variant): variant is ProgressionCompletableVariant =>
					typeof variant === 'string' &&
					COMPLETABLE_VARIANTS.has(variant as ProgressionCompletableVariant)
			)
		: [];
	return frozenState(unlocked, completed, Number(value.flightCount));
}

export function parseProgressionState(raw: string | null | undefined): ProgressionState {
	if (!raw) return createDefaultProgressionState();
	try {
		return normaliseProgressionState(JSON.parse(raw));
	} catch {
		return createDefaultProgressionState();
	}
}

/** Stable property and catalog ordering makes snapshots, sync merges and diagnostics reproducible. */
export function serializeProgressionState(state: ProgressionState): string {
	const normalised = normaliseProgressionState(state);
	return JSON.stringify({
		version: normalised.version,
		unlocked: normalised.unlocked,
		completedVariants: normalised.completedVariants,
		flightCount: normalised.flightCount
	});
}

/** Snapshot merge is commutative/idempotent: unions unlocks/completions and keeps the larger count. */
export function mergeProgressionStates(...states: readonly ProgressionState[]): ProgressionState {
	if (states.length === 0) return createDefaultProgressionState();
	const normalised = states.map(normaliseProgressionState);
	return frozenState(
		normalised.flatMap((state) => state.unlocked),
		normalised.flatMap((state) => state.completedVariants),
		Math.max(...normalised.map((state) => state.flightCount))
	);
}

export function getProgressionUnlockDefinition(
	id: ProgressionUnlockId
): ProgressionUnlockDefinition {
	return CATALOG_BY_ID.get(id) ?? CATALOG_BY_ID.get('throw:north-window')!;
}

function hasAllRegisters(outcome: ProgressionFlightOutcome): boolean {
	const registers = new Set(outcome.visitedRegisters);
	return registers.has('low') && registers.has('middle') && registers.has('high');
}

function observedLandmarkPatiently(outcome: ProgressionFlightOutcome): boolean {
	return (outcome.landmarkObservations ?? []).some(
		(observation) =>
			observation.landmarkId.trim().length > 0 &&
			Number.isFinite(observation.visibleSeconds) &&
			observation.visibleSeconds >= LANDMARK_OBSERVATION_UNLOCK_SECONDS
	);
}

function borrowedRiverIntoRoof(outcome: ProgressionFlightOutcome): boolean {
	return (outcome.windTransfers ?? []).some(
		(transfer) => transfer.from === 'river-breeze' && transfer.to === 'roof-thermal'
	);
}

interface CandidateUnlock {
	readonly id: ProgressionUnlockId;
	readonly reason: string;
}

function candidateUnlocks(
	state: ProgressionState,
	outcome: ProgressionFlightOutcome
): readonly CandidateUnlock[] {
	const completed = new Set(state.completedVariants);
	if (outcome.completedVariant && COMPLETABLE_VARIANTS.has(outcome.completedVariant)) {
		completed.add(outcome.completedVariant);
	}
	const candidates: CandidateUnlock[] = [];

	if (hasAllRegisters(outcome) || completed.has('afternoon-heat')) {
		candidates.push({
			id: 'weather:winter-haze',
			reason: hasAllRegisters(outcome)
				? 'The plane crossed street, roof and sky in one unbroken sentence.'
				: 'Afternoon heat was carried to its last quiet current.'
		});
	}
	if (observedLandmarkPatiently(outcome) || completed.has('winter-haze')) {
		candidates.push({
			id: 'time:river-evening',
			reason: observedLandmarkPatiently(outcome)
				? 'A landmark was allowed to remain a place, not merely an obstacle.'
				: 'Winter haze was followed until the distant city disappeared.'
		});
	}
	if (borrowedRiverIntoRoof(outcome) || completed.has('river-evening')) {
		candidates.push({
			id: 'weather:approaching-monsoon',
			reason: borrowedRiverIntoRoof(outcome)
				? 'The river breeze was carried into the wind climbing from the roofs.'
				: 'The river evening was flown until its final reflected light.'
		});
	}
	if (completed.has('approaching-monsoon')) {
		candidates.push({
			id: 'time:after-rain-morning',
			reason: 'The approaching rain was met without asking the sky to hurry.'
		});
	}

	const landing = outcome.landing;
	if (landing?.graceful) {
		const id = LANDING_UNLOCKS[landing.kind];
		if (id) {
			const landingReason: Readonly<Partial<Record<ProgressionLandingKind, string>>> = {
				ghat: 'The paper came down beside the river and was lifted by another hand.',
				rooftop: 'The rooftop kept the plane gently enough to offer it back.',
				courtyard: 'The courtyard returned the fold to its small square of sky.',
				'maidan-edge': 'The grass accepted the landing without closing the horizon.',
				'new-town-terrace': 'The terrace held the paper above glass, cranes and young trees.'
			};
			candidates.push({
				id,
				reason: landingReason[landing.kind] ?? 'The city returned the paper gently to the wind.'
			});
		}
	}
	return candidates;
}

/** Returns only newly earned unlocks in fixed catalog order; it never mutates the supplied state. */
export function deriveProgressionUnlocks(
	state: ProgressionState,
	outcome: ProgressionFlightOutcome
): readonly ProgressionUnlockEvent[] {
	const normalised = normaliseProgressionState(state);
	const alreadyUnlocked = new Set(normalised.unlocked);
	const reasonById = new Map<ProgressionUnlockId, string>();
	for (const candidate of candidateUnlocks(normalised, outcome)) {
		if (!alreadyUnlocked.has(candidate.id) && !reasonById.has(candidate.id)) {
			reasonById.set(candidate.id, candidate.reason);
		}
	}
	return [...reasonById.entries()]
		.sort(([left], [right]) => catalogSort(left, right))
		.map(([id, reason]) => ({ ...getProgressionUnlockDefinition(id), reason }));
}

/** Applies one completed flight, increments the snapshot count, and returns poetic unlock events. */
export function applyFlightProgression(
	state: ProgressionState,
	outcome: ProgressionFlightOutcome
): ProgressionUpdate {
	const normalised = normaliseProgressionState(state);
	const newUnlocks = deriveProgressionUnlocks(normalised, outcome);
	const completed = [...normalised.completedVariants];
	if (outcome.completedVariant && COMPLETABLE_VARIANTS.has(outcome.completedVariant)) {
		completed.push(outcome.completedVariant);
	}
	return Object.freeze({
		state: frozenState(
			[...normalised.unlocked, ...newUnlocks.map((unlock) => unlock.id)],
			completed,
			normalised.flightCount + 1
		),
		newUnlocks: Object.freeze(newUnlocks)
	});
}
