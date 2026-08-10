import type { FlightFolioResult } from '../runtime-types';
import {
	generateDistrictRoute,
	hashDistrictSeed,
	normaliseSeed,
	type DistrictId,
	type DistrictRoute,
	type LandmarkId
} from '../world/DistrictGraph';

export type FlightRunMode = 'curated' | 'free';
export type RunAltitudeRegister = 'low' | 'middle' | 'high';
export type RunDirection =
	| 'observe'
	| 'climb'
	| 'look'
	| 'choose'
	| 'dive'
	| 'skim'
	| 'escape'
	| 'land';
export type RunPace = 'quiet' | 'pressure' | 'release' | 'reveal';

export interface RunSection {
	readonly id: string;
	readonly index: number;
	readonly district: DistrictId;
	readonly startsAtSeconds: number;
	readonly endsAtSeconds: number;
	readonly durationSeconds: number;
	readonly entryRegister: RunAltitudeRegister;
	readonly targetRegister: RunAltitudeRegister;
	readonly direction: RunDirection;
	readonly pace: RunPace;
	readonly prompt: string;
	readonly heroLandmark: LandmarkId | null;
	readonly heroRevealAtSeconds: number | null;
	/** A camera may drift only when this is true; input must still cancel the drift immediately. */
	readonly scenicDriftAllowed: boolean;
}

export interface RunDefinition {
	readonly version: 1;
	readonly seed: string;
	readonly mode: FlightRunMode;
	readonly districtRoute: DistrictRoute | null;
	readonly sections: readonly RunSection[];
	readonly durationSeconds: number;
	readonly scoringEnabled: boolean;
	readonly openingObservationSeconds: number;
}

export interface RunCue {
	readonly section: RunSection;
	readonly sectionProgress: number;
	readonly remainingSeconds: number;
	readonly runProgress: number;
}

export type RunDirectorEvent =
	| Readonly<{ type: 'section-entered'; section: RunSection }>
	| Readonly<{ type: 'curated-flight-complete'; atSeconds: number }>;

export interface FolioSample {
	readonly atSeconds: number;
	readonly position: Readonly<{ x: number; y: number; z: number }>;
	readonly altitudeMetres?: number;
	readonly district: string;
	readonly soundscape?: string;
}

export interface ClosestPassageRecord {
	readonly label: string;
	readonly distanceM: number;
}

export interface FinishFolioOptions {
	readonly elapsedSeconds: number;
	readonly score: number;
	readonly landing: string;
	readonly worldSignature: string;
}

export interface FlightFolioRecorderOptions {
	readonly sampleIntervalSeconds?: number;
	readonly maxSamples?: number;
}

const MIN_CURATED_SECONDS = 6 * 60;
const MAX_CURATED_SECONDS = 10 * 60;
const OPENING_OBSERVATION_SECONDS = 16;

const DISTRICT_PROMPTS: Readonly<Record<DistrictId, readonly string[]>> = {
	'north-calcutta': [
		'Borrow the wind rising from the old roofs.',
		'Let the lane show you where the air can pass.'
	],
	kumartuli: [
		'Follow the river light beyond the workshop tarpaulins.',
		'Climb only when the clay-dust wind begins to lift.'
	],
	'college-street': [
		'Read the loose pages before choosing the next descent.',
		'Stay with the shaded arcade until the traffic opens.'
	],
	esplanade: [
		'Keep the bus roofs beneath one wing and the wires in sight.',
		'Escape the pressure knot without forcing the turn.'
	],
	'maidan-victoria': [
		'Give the plane room to breathe above the grass.',
		'Hold the landmark in view; there is no need to hurry.'
	],
	'park-street': [
		'Skim the rain-dark awnings, then leave the neon behind.',
		'Listen for the crosswind around the old façades.'
	],
	hooghly: [
		'Cross the river without losing its breeze.',
		'Let the bridge remain monumental beside the small plane.'
	],
	'new-town': [
		'Climb along the tower edge, not through the glass.',
		'Find the landscaped air beyond the construction wake.'
	]
};

function deterministicUnit(seed: string, namespace: string): number {
	return hashDistrictSeed(seed, namespace) / 4_294_967_296;
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

const FLIGHT_SENTENCE: readonly Readonly<{
	direction: Exclude<RunDirection, 'observe' | 'land'>;
	targetRegister: RunAltitudeRegister;
}>[] = [
	{ direction: 'climb', targetRegister: 'high' },
	{ direction: 'look', targetRegister: 'high' },
	{ direction: 'choose', targetRegister: 'high' },
	{ direction: 'dive', targetRegister: 'low' },
	{ direction: 'skim', targetRegister: 'low' },
	{ direction: 'escape', targetRegister: 'middle' }
] as const;

function paceForSection(
	district: DistrictId,
	direction: RunDirection,
	heroLandmark: LandmarkId | null
): RunPace {
	if (heroLandmark) return 'reveal';
	if (district === 'esplanade' || direction === 'skim') return 'pressure';
	if (direction === 'look' || direction === 'land' || district === 'maidan-victoria') {
		return 'release';
	}
	return 'quiet';
}

export function createCuratedRunDefinition(rootSeed: string | number): RunDefinition {
	const seed = normaliseSeed(rootSeed);
	const districtRoute = generateDistrictRoute(seed);
	const routeDurationSeconds = districtRoute.modules.reduce(
		(sum, module) => sum + module.durationSeconds,
		0
	);
	// The spatial grammar owns district cadence: each route module is exactly three 96 m chunks.
	// Retain its authored 26–39 s rhythm instead of stretching a handful of districts over the
	// whole clock. The one-second cap correction is deterministic and keeps every module in range.
	const desiredDurationSeconds = clamp(
		OPENING_OBSERVATION_SECONDS + routeDurationSeconds,
		MIN_CURATED_SECONDS,
		MAX_CURATED_SECONDS
	);
	const durations = districtRoute.modules.map((module) => module.durationSeconds);
	let correction =
		OPENING_OBSERVATION_SECONDS +
		durations.reduce((sum, duration) => sum + duration, 0) -
		desiredDurationSeconds;
	for (let index = durations.length - 1; index >= 0 && correction > 0; index -= 1) {
		const removable = Math.min(correction, durations[index] - 20);
		durations[index] -= removable;
		correction -= removable;
	}
	let cursor = OPENING_OBSERVATION_SECONDS;
	let previousRegister: RunAltitudeRegister = 'low';
	const opening: RunSection = {
		id: 'opening-observation',
		index: 0,
		district: districtRoute.modules[0]?.district ?? 'north-calcutta',
		startsAtSeconds: 0,
		endsAtSeconds: OPENING_OBSERVATION_SECONDS,
		durationSeconds: OPENING_OBSERVATION_SECONDS,
		entryRegister: 'low',
		targetRegister: 'low',
		direction: 'observe',
		pace: 'quiet',
		prompt: 'Watch the laundry, steam and feathers disclose the approaching gust.',
		heroLandmark: null,
		heroRevealAtSeconds: null,
		scenicDriftAllowed: false
	};
	const routeSections = districtRoute.modules.map((module, moduleIndex): RunSection => {
		const index = moduleIndex + 1;
		const duration = durations[moduleIndex];
		const sentenceBeat = FLIGHT_SENTENCE[moduleIndex % FLIGHT_SENTENCE.length];
		const last = moduleIndex === districtRoute.modules.length - 1;
		const direction: RunDirection = last ? 'land' : sentenceBeat.direction;
		const targetRegister: RunAltitudeRegister = last ? 'low' : sentenceBeat.targetRegister;
		const promptChoices = DISTRICT_PROMPTS[module.district];
		const prompt =
			promptChoices[
				Math.floor(deterministicUnit(seed, `run/prompt/${moduleIndex}`) * promptChoices.length)
			];
		const startsAtSeconds = cursor;
		const endsAtSeconds = cursor + duration;
		const heroRevealAtSeconds =
			module.heroLandmark === null
				? null
				: Math.min(endsAtSeconds - 8, startsAtSeconds + Math.max(8, module.revealAtSeconds ?? 10));
		const pace = paceForSection(module.district, direction, module.heroLandmark);
		const section: RunSection = {
			id: `${index}-${module.district}`,
			index,
			district: module.district,
			startsAtSeconds,
			endsAtSeconds,
			durationSeconds: endsAtSeconds - startsAtSeconds,
			entryRegister: previousRegister,
			targetRegister,
			direction,
			pace,
			prompt,
			heroLandmark: module.heroLandmark,
			heroRevealAtSeconds,
			scenicDriftAllowed: pace === 'release' || pace === 'reveal'
		};
		cursor = endsAtSeconds;
		previousRegister = targetRegister;
		return section;
	});
	const sections = [opening, ...routeSections];

	return Object.freeze({
		version: 1,
		seed,
		mode: 'curated',
		districtRoute,
		sections: Object.freeze(sections),
		durationSeconds: Math.min(MAX_CURATED_SECONDS, cursor),
		scoringEnabled: true,
		openingObservationSeconds: OPENING_OBSERVATION_SECONDS
	});
}

/** No-score free flight is available before completing the curated run. */
export function createFreeFlightRunDefinition(rootSeed: string | number): RunDefinition {
	return Object.freeze({
		version: 1,
		seed: normaliseSeed(rootSeed),
		mode: 'free',
		districtRoute: null,
		sections: Object.freeze([]),
		durationSeconds: Number.POSITIVE_INFINITY,
		scoringEnabled: false,
		openingObservationSeconds: 0
	});
}

export function altitudeRegisterLabel(register: RunAltitudeRegister): string {
	switch (register) {
		case 'low':
			return 'Low city';
		case 'middle':
			return 'Roofline and river air';
		case 'high':
			return 'Soaring city';
	}
}

export class RunDirector {
	readonly definition: RunDefinition;
	private lastSectionIndex = -1;
	private completed = false;

	constructor(rootSeed: string | number, mode: FlightRunMode = 'curated') {
		this.definition =
			mode === 'free'
				? createFreeFlightRunDefinition(rootSeed)
				: createCuratedRunDefinition(rootSeed);
	}

	currentCue(elapsedSeconds: number): RunCue | null {
		if (this.definition.mode === 'free') return null;
		const elapsed = clamp(
			Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0,
			0,
			this.definition.durationSeconds
		);
		const section =
			this.definition.sections.find(
				(candidate) => elapsed >= candidate.startsAtSeconds && elapsed < candidate.endsAtSeconds
			) ?? this.definition.sections[this.definition.sections.length - 1];
		if (!section) return null;
		return {
			section,
			sectionProgress: clamp(
				(elapsed - section.startsAtSeconds) / Math.max(0.001, section.durationSeconds),
				0,
				1
			),
			remainingSeconds: Math.max(0, section.endsAtSeconds - elapsed),
			runProgress: clamp(elapsed / this.definition.durationSeconds, 0, 1)
		};
	}

	/** Emits sparse authored transitions; it never modifies controls, physics or camera state. */
	update(elapsedSeconds: number): readonly RunDirectorEvent[] {
		if (this.definition.mode === 'free') return [];
		const cue = this.currentCue(elapsedSeconds);
		const events: RunDirectorEvent[] = [];
		if (cue && cue.section.index !== this.lastSectionIndex) {
			this.lastSectionIndex = cue.section.index;
			events.push({ type: 'section-entered', section: cue.section });
		}
		if (!this.completed && elapsedSeconds >= this.definition.durationSeconds) {
			this.completed = true;
			events.push({ type: 'curated-flight-complete', atSeconds: this.definition.durationSeconds });
		}
		return events;
	}

	reset(): void {
		this.lastSectionIndex = -1;
		this.completed = false;
	}
}

/** Allocation-bounded recorder for the end-of-flight charcoal folio. */
export class FlightFolioRecorder {
	readonly seed: string;
	readonly mode: FlightRunMode;
	readonly sampleIntervalSeconds: number;
	readonly maxSamples: number;

	private readonly path: FlightFolioResult['path'][number][] = [];
	private readonly altitudeProfile: FlightFolioResult['altitudeProfile'][number][] = [];
	private readonly windsBorrowed = new Set<string>();
	private readonly districts = new Set<string>();
	private readonly soundscapes = new Set<string>();
	private readonly landmarks = new Set<string>();
	private closest: ClosestPassageRecord | null = null;
	private lastSampleSeconds = Number.NEGATIVE_INFINITY;

	constructor(
		rootSeed: string | number,
		mode: FlightRunMode,
		options: FlightFolioRecorderOptions = {}
	) {
		this.seed = normaliseSeed(rootSeed);
		this.mode = mode;
		this.sampleIntervalSeconds = Math.max(
			0.1,
			Number.isFinite(options.sampleIntervalSeconds) ? Number(options.sampleIntervalSeconds) : 0.5
		);
		this.maxSamples = Math.max(
			64,
			Math.floor(Number.isFinite(options.maxSamples) ? Number(options.maxSamples) : 1_200)
		);
	}

	recordSample(sample: FolioSample, force = false): boolean {
		const atSeconds = Number.isFinite(sample.atSeconds) ? Math.max(0, sample.atSeconds) : 0;
		if (!force && atSeconds - this.lastSampleSeconds < this.sampleIntervalSeconds) return false;
		this.lastSampleSeconds = atSeconds;
		this.path.push({
			x: Number.isFinite(sample.position.x) ? sample.position.x : 0,
			y: Number.isFinite(sample.position.y) ? sample.position.y : 0,
			z: Number.isFinite(sample.position.z) ? sample.position.z : 0,
			atSeconds,
			district: sample.district
		});
		this.altitudeProfile.push({
			atSeconds,
			altitudeMetres: Number.isFinite(sample.altitudeMetres)
				? Math.max(0, Number(sample.altitudeMetres))
				: Math.max(0, sample.position.y)
		});
		if (sample.district) this.districts.add(sample.district);
		if (sample.soundscape) this.soundscapes.add(sample.soundscape);
		this.compactIfNeeded();
		return true;
	}

	recordBorrowedWind(label: string): void {
		if (label.trim()) this.windsBorrowed.add(label.trim());
	}

	recordLandmarkSeen(label: string): void {
		if (label.trim()) this.landmarks.add(label.trim());
	}

	recordCleanPassage(passage: ClosestPassageRecord): void {
		if (!passage.label.trim() || !Number.isFinite(passage.distanceM) || passage.distanceM < 0)
			return;
		if (!this.closest || passage.distanceM < this.closest.distanceM) {
			this.closest = { label: passage.label.trim(), distanceM: passage.distanceM };
		}
	}

	finish(options: FinishFolioOptions): FlightFolioResult {
		const elapsedSeconds = Number.isFinite(options.elapsedSeconds)
			? Math.max(0, options.elapsedSeconds)
			: 0;
		const score = this.mode === 'free' ? 0 : Math.max(0, Math.round(options.score));
		return {
			seed: this.seed,
			mode: this.mode,
			elapsedSeconds,
			score,
			path: this.path.map((point) => ({ ...point })),
			altitudeProfile: this.altitudeProfile.map((point) => ({ ...point })),
			windsBorrowed: [...this.windsBorrowed],
			closestPassage: this.closest
				? `${this.closest.label} — ${this.closest.distanceM.toFixed(2)} m`
				: 'No clean close passage recorded',
			districts: [...this.districts],
			soundscapes: [...this.soundscapes],
			landmarks: [...this.landmarks],
			landing: options.landing,
			worldSignature: options.worldSignature
		};
	}

	private compactIfNeeded(): void {
		if (this.path.length <= this.maxSamples) return;
		// Keep the first/last shape while halving interior density. Deterministic compaction means an
		// unusually long New Wind flight remains bounded without affecting the simulated route.
		const keep = (index: number, length: number) =>
			index === 0 || index === length - 1 || index % 2 === 0;
		const pathLength = this.path.length;
		const altitudeLength = this.altitudeProfile.length;
		const compactedPath = this.path.filter((_, index) => keep(index, pathLength));
		const compactedAltitude = this.altitudeProfile.filter((_, index) =>
			keep(index, altitudeLength)
		);
		this.path.splice(0, this.path.length, ...compactedPath);
		this.altitudeProfile.splice(0, this.altitudeProfile.length, ...compactedAltitude);
	}
}
