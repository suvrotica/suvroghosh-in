export type FlightPhraseBeat = 'climb' | 'look' | 'choose' | 'dive' | 'skim' | 'escape';
export type FlightLessonStage = 'observe' | 'raise' | 'lower' | 'bank' | 'read-air' | 'complete';

export interface FlightGuidanceSample {
	readonly deltaSeconds: number;
	readonly elapsedSeconds: number;
	readonly altitudeM: number;
	readonly airspeedMps: number;
	readonly verticalSpeedMps: number;
	readonly headingRadians: number;
	readonly rollRadians: number;
	readonly pitchInput: number;
	readonly bankInput: number;
	readonly upwardWindMps: number;
	readonly obstacleDistanceM: number;
	readonly stalled: boolean;
}

export interface FlightPhraseSnapshot {
	readonly beat: FlightPhraseBeat;
	readonly cycle: number;
	readonly label: string;
}

const PHRASE: readonly FlightPhraseBeat[] = [
	'climb',
	'look',
	'choose',
	'dive',
	'skim',
	'escape'
] as const;

const PHRASE_LABELS: Readonly<Record<FlightPhraseBeat, string>> = {
	climb: 'Climb — borrow rising air',
	look: 'Look — let the city become legible',
	choose: 'Choose — bank toward an open line',
	dive: 'Dive — trade height for speed',
	skim: 'Skim — hold the low line cleanly',
	escape: 'Escape — clear the pressure and climb again'
};

const LESSON_LABELS: Readonly<Record<FlightLessonStage, string>> = {
	observe: 'Watch the laundry, tea steam and crow feathers. A gust is finding the page.',
	raise: 'Raise the nose briefly. Notice how height spends speed.',
	lower: 'Lower the nose gently. Speed returns without an engine.',
	bank: 'Bank into an open turn. The wing gives away some vertical lift.',
	'read-air': 'Read smoke, cloth, birds and loose paper; rising air can be borrowed.',
	complete: 'You do not command the wind. Choose a line and borrow it.'
};

function clampDelta(deltaSeconds: number): number {
	return Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0;
}

function angleDistance(left: number, right: number): number {
	return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

/**
 * Advances only from measured flight outcomes. It never writes controls or state, so the
 * sentence remains an invitation rather than an autopilot or checkpoint sequence.
 */
export class FlightPhraseTracker {
	private beatIndex = 0;
	private cycle = 0;
	private dwellSeconds = 0;
	private entryAltitudeM = 0;
	private entryAirspeedMps = 0;
	private entryHeadingRadians = 0;
	private initialized = false;

	update(sample: FlightGuidanceSample): FlightPhraseSnapshot {
		if (!this.initialized) {
			this.initialized = true;
			this.captureEntry(sample);
		}
		const beat = PHRASE[this.beatIndex];
		const condition = this.conditionFor(beat, sample);
		this.dwellSeconds = condition ? this.dwellSeconds + clampDelta(sample.deltaSeconds) : 0;
		if (this.dwellSeconds >= this.requiredDwell(beat)) {
			this.beatIndex = (this.beatIndex + 1) % PHRASE.length;
			if (this.beatIndex === 0) this.cycle += 1;
			this.dwellSeconds = 0;
			this.captureEntry(sample);
		}
		return this.snapshot();
	}

	snapshot(): FlightPhraseSnapshot {
		const beat = PHRASE[this.beatIndex];
		return { beat, cycle: this.cycle, label: PHRASE_LABELS[beat] };
	}

	reset(sample?: FlightGuidanceSample): void {
		this.beatIndex = 0;
		this.cycle = 0;
		this.dwellSeconds = 0;
		this.initialized = sample !== undefined;
		if (sample) this.captureEntry(sample);
	}

	private conditionFor(beat: FlightPhraseBeat, sample: FlightGuidanceSample): boolean {
		if (sample.stalled) return false;
		switch (beat) {
			case 'climb':
				return (
					sample.altitudeM >= this.entryAltitudeM + 16 &&
					sample.verticalSpeedMps > 0.45 &&
					sample.airspeedMps >= 5.8
				);
			case 'look':
				return (
					Math.abs(sample.verticalSpeedMps) < 1.5 &&
					Math.abs(sample.rollRadians) < 0.28 &&
					Math.abs(sample.bankInput) < 0.16 &&
					sample.obstacleDistanceM > 8
				);
			case 'choose':
				return (
					Math.abs(sample.bankInput) > 0.18 &&
					angleDistance(sample.headingRadians, this.entryHeadingRadians) >= Math.PI / 9 &&
					sample.airspeedMps >= 6
				);
			case 'dive':
				return sample.verticalSpeedMps < -1.5 && sample.airspeedMps >= this.entryAirspeedMps + 0.8;
			case 'skim':
				return (
					sample.altitudeM >= 2 &&
					sample.altitudeM < 28 &&
					sample.airspeedMps >= 6.5 &&
					sample.obstacleDistanceM > 1.2
				);
			case 'escape':
				return (
					sample.altitudeM >= 30 && sample.verticalSpeedMps > 0.45 && sample.obstacleDistanceM > 5
				);
		}
	}

	private requiredDwell(beat: FlightPhraseBeat): number {
		switch (beat) {
			case 'look':
			case 'skim':
				return 3;
			case 'choose':
			case 'dive':
				return 0.75;
			default:
				return 1.5;
		}
	}

	private captureEntry(sample: FlightGuidanceSample): void {
		this.entryAltitudeM = sample.altitudeM;
		this.entryAirspeedMps = sample.airspeedMps;
		this.entryHeadingRadians = sample.headingRadians;
	}
}

/** Behaviour-gated one-minute lesson with forgiving timeouts. */
export class FlightLessonTracker {
	private stage: FlightLessonStage = 'observe';
	private stageStartedAtSeconds = 0;
	private dwellSeconds = 0;
	private baselineAirspeedMps = 0;
	private baselineHeadingRadians = 0;

	constructor(private readonly observationSeconds = 16) {}

	update(sample: FlightGuidanceSample): FlightLessonStage {
		if (this.stage === 'complete') return this.stage;
		if (this.stage === 'observe') {
			if (sample.elapsedSeconds >= this.observationSeconds) this.advance(sample);
			return this.stage;
		}

		const demonstrated = this.demonstrated(sample);
		this.dwellSeconds = demonstrated ? this.dwellSeconds + clampDelta(sample.deltaSeconds) : 0;
		const timedOut = sample.elapsedSeconds - this.stageStartedAtSeconds >= 11;
		if (this.dwellSeconds >= 0.55 || timedOut) this.advance(sample);
		return this.stage;
	}

	get currentStage(): FlightLessonStage {
		return this.stage;
	}

	get label(): string {
		return LESSON_LABELS[this.stage];
	}

	private demonstrated(sample: FlightGuidanceSample): boolean {
		switch (this.stage) {
			case 'raise':
				return sample.pitchInput > 0.2 && sample.airspeedMps <= this.baselineAirspeedMps - 0.25;
			case 'lower':
				return sample.pitchInput < -0.2 && sample.airspeedMps >= this.baselineAirspeedMps + 0.25;
			case 'bank':
				return (
					Math.abs(sample.bankInput) > 0.2 &&
					angleDistance(sample.headingRadians, this.baselineHeadingRadians) >= Math.PI / 24
				);
			case 'read-air':
				return sample.upwardWindMps >= 0.45 && sample.verticalSpeedMps > -0.4;
			case 'observe':
			case 'complete':
				return false;
		}
	}

	private advance(sample: FlightGuidanceSample): void {
		const order: readonly FlightLessonStage[] = [
			'observe',
			'raise',
			'lower',
			'bank',
			'read-air',
			'complete'
		];
		this.stage = order[Math.min(order.length - 1, order.indexOf(this.stage) + 1)];
		this.stageStartedAtSeconds = sample.elapsedSeconds;
		this.dwellSeconds = 0;
		this.baselineAirspeedMps = sample.airspeedMps;
		this.baselineHeadingRadians = sample.headingRadians;
	}
}
