import {
	DIRECTED_BEATS,
	PEDAGOGICAL_SEED,
	type DirectedBeat,
	type DirectedEventCue,
	type DirectedTextCue,
	type ModelTimePlan,
	type ModelWindow
} from './direction';

export const MAX_CLOCK_STEP_MS = 100;

export type FilmClockStatus = 'running' | 'paused' | 'held';

export type FilmClockState = Readonly<{
	beatIndex: number;
	beatTimeMs: number;
	status: FilmClockStatus;
	autoplay: boolean;
	visible: boolean;
	seed: number;
	lastMonotonicMs: number | null;
	epoch: number;
}>;

export type FilmClockAction =
	| Readonly<{ type: 'TICK'; nowMs: number }>
	| Readonly<{ type: 'PAUSE' }>
	| Readonly<{ type: 'PLAY' }>
	| Readonly<{ type: 'SET_VISIBLE'; visible: boolean }>
	| Readonly<{ type: 'NEXT' }>
	| Readonly<{ type: 'PREVIOUS' }>
	| Readonly<{ type: 'REPLAY_BEAT' }>
	| Readonly<{ type: 'REPLAY_TOUR' }>
	| Readonly<{ type: 'START_AUTOPLAY' }>
	| Readonly<{ type: 'STOP_AUTOPLAY' }>;

export type TraceModelSample = Readonly<{
	kind: 'trace';
	modelTime: number;
	boundary: 'at' | 'before' | 'after';
}>;

export type EnsembleModelSample = Readonly<{
	kind: 'ensemble';
	modelWindow: ModelWindow;
}>;

export type DirectedFrameSample = Readonly<{
	beat: DirectedBeat;
	beatIndex: number;
	beatTimeMs: number;
	progress: number;
	status: FilmClockStatus;
	autoplay: boolean;
	visible: boolean;
	seed: number;
	epoch: number;
	inMinimumHold: boolean;
	model: TraceModelSample | EnsembleModelSample;
	activeEvents: readonly DirectedEventCue[];
	visibleTextCues: readonly DirectedTextCue[];
}>;

export type CreateFilmClockOptions = Readonly<{
	beatIndex?: number;
	beatTimeMs?: number;
	status?: FilmClockStatus;
	autoplay?: boolean;
	visible?: boolean;
	seed?: number;
}>;

function finiteNonNegative(value: number, label: string): number {
	if (!Number.isFinite(value) || value < 0)
		throw new RangeError(`${label} must be finite and non-negative.`);
	return value;
}

function beatAt(beats: readonly DirectedBeat[], beatIndex: number): DirectedBeat {
	if (!Number.isInteger(beatIndex) || beatIndex < 0 || beatIndex >= beats.length) {
		throw new RangeError('Film beat index is outside the directed beat list.');
	}
	return beats[beatIndex];
}

function freezeState(state: FilmClockState): FilmClockState {
	return Object.freeze(state);
}

export function createFilmClock(
	options: CreateFilmClockOptions = {},
	beats: readonly DirectedBeat[] = DIRECTED_BEATS
): FilmClockState {
	if (beats.length === 0) throw new RangeError('The choreography requires at least one beat.');
	const beatIndex = options.beatIndex ?? 0;
	const beat = beatAt(beats, beatIndex);
	const requestedTime = finiteNonNegative(options.beatTimeMs ?? 0, 'Beat time');
	const beatTimeMs = Math.min(requestedTime, beat.autoplayDurationMs);
	const requestedStatus = options.status ?? 'running';
	const status = beatTimeMs >= beat.autoplayDurationMs ? 'held' : requestedStatus;
	const finalBeatHeld = beatIndex === beats.length - 1 && status === 'held';
	return freezeState({
		beatIndex,
		beatTimeMs,
		status,
		autoplay: finalBeatHeld ? false : (options.autoplay ?? false),
		visible: options.visible ?? true,
		seed: options.seed ?? PEDAGOGICAL_SEED,
		lastMonotonicMs: null,
		epoch: 0
	});
}

function advanceRunningClock(
	state: FilmClockState,
	deltaMs: number,
	beats: readonly DirectedBeat[]
): FilmClockState {
	let beatIndex = state.beatIndex;
	let beatTimeMs = state.beatTimeMs;
	let status = state.status;
	let autoplay = state.autoplay;
	let epoch = state.epoch;
	let remainingMs = deltaMs;

	while (remainingMs > 0 && status === 'running') {
		const beat = beatAt(beats, beatIndex);
		const availableMs = Math.max(0, beat.autoplayDurationMs - beatTimeMs);
		if (remainingMs < availableMs) {
			beatTimeMs += remainingMs;
			break;
		}

		beatTimeMs = beat.autoplayDurationMs;
		remainingMs -= availableMs;
		const finalBeat = beatIndex === beats.length - 1;
		if (!autoplay || finalBeat) {
			status = 'held';
			if (finalBeat) autoplay = false;
			break;
		}

		beatIndex += 1;
		beatTimeMs = 0;
		epoch += 1;
	}

	return freezeState({
		...state,
		beatIndex,
		beatTimeMs,
		status,
		autoplay,
		epoch
	});
}

function tickFilmClock(
	state: FilmClockState,
	nowMs: number,
	beats: readonly DirectedBeat[]
): FilmClockState {
	finiteNonNegative(nowMs, 'Monotonic timestamp');
	if (state.lastMonotonicMs !== null && nowMs < state.lastMonotonicMs) {
		throw new RangeError('Monotonic timestamps cannot move backwards.');
	}

	const lastMonotonicMs = state.lastMonotonicMs;
	const rebased = freezeState({ ...state, lastMonotonicMs: nowMs });
	if (
		lastMonotonicMs === null ||
		!state.visible ||
		state.status !== 'running' ||
		nowMs === lastMonotonicMs
	) {
		return rebased;
	}

	const deltaMs = Math.min(MAX_CLOCK_STEP_MS, nowMs - lastMonotonicMs);
	return advanceRunningClock(rebased, deltaMs, beats);
}

function nextBeat(state: FilmClockState, beats: readonly DirectedBeat[]): FilmClockState {
	const beat = beatAt(beats, state.beatIndex);
	if (state.beatTimeMs < beat.autoplayDurationMs || state.status !== 'held') {
		return freezeState({
			...state,
			beatTimeMs: beat.autoplayDurationMs,
			status: 'held',
			autoplay: false,
			lastMonotonicMs: null,
			epoch: state.epoch + 1
		});
	}

	if (state.beatIndex >= beats.length - 1) {
		return freezeState({ ...state, autoplay: false, lastMonotonicMs: null });
	}

	return freezeState({
		...state,
		beatIndex: state.beatIndex + 1,
		beatTimeMs: 0,
		status: 'running',
		autoplay: false,
		lastMonotonicMs: null,
		epoch: state.epoch + 1
	});
}

function previousBeat(state: FilmClockState, beats: readonly DirectedBeat[]): FilmClockState {
	if (state.beatIndex === 0) {
		return freezeState({ ...state, autoplay: false, lastMonotonicMs: null });
	}
	const beatIndex = state.beatIndex - 1;
	return freezeState({
		...state,
		beatIndex,
		beatTimeMs: beatAt(beats, beatIndex).autoplayDurationMs,
		status: 'held',
		autoplay: false,
		lastMonotonicMs: null,
		epoch: state.epoch + 1
	});
}

function startAutoplay(state: FilmClockState, beats: readonly DirectedBeat[]): FilmClockState {
	const finalBeat = state.beatIndex === beats.length - 1;
	if (finalBeat && state.status === 'held') {
		return freezeState({ ...state, autoplay: false, lastMonotonicMs: null });
	}
	if (state.status === 'held') {
		return freezeState({
			...state,
			beatIndex: state.beatIndex + 1,
			beatTimeMs: 0,
			status: 'running',
			autoplay: true,
			lastMonotonicMs: null,
			epoch: state.epoch + 1
		});
	}
	return freezeState({
		...state,
		status: 'running',
		autoplay: true,
		lastMonotonicMs: null
	});
}

export function reduceFilmClock(
	state: FilmClockState,
	action: FilmClockAction,
	beats: readonly DirectedBeat[] = DIRECTED_BEATS
): FilmClockState {
	beatAt(beats, state.beatIndex);
	switch (action.type) {
		case 'TICK':
			return tickFilmClock(state, action.nowMs, beats);
		case 'PAUSE':
			return state.status === 'running'
				? freezeState({ ...state, status: 'paused', lastMonotonicMs: null })
				: state;
		case 'PLAY':
			return state.status === 'paused'
				? freezeState({ ...state, status: 'running', lastMonotonicMs: null })
				: state;
		case 'SET_VISIBLE':
			return action.visible === state.visible
				? state
				: freezeState({ ...state, visible: action.visible, lastMonotonicMs: null });
		case 'NEXT':
			return nextBeat(state, beats);
		case 'PREVIOUS':
			return previousBeat(state, beats);
		case 'REPLAY_BEAT':
			return freezeState({
				...state,
				beatTimeMs: 0,
				status: 'running',
				autoplay: false,
				lastMonotonicMs: null,
				epoch: state.epoch + 1
			});
		case 'REPLAY_TOUR':
			return freezeState({
				...state,
				beatIndex: 0,
				beatTimeMs: 0,
				status: 'running',
				autoplay: false,
				lastMonotonicMs: null,
				epoch: state.epoch + 1
			});
		case 'START_AUTOPLAY':
			return startAutoplay(state, beats);
		case 'STOP_AUTOPLAY':
			return state.autoplay
				? freezeState({ ...state, autoplay: false, lastMonotonicMs: null })
				: state;
	}
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function sampleWindow(
	filmTimeMs: number,
	filmWindowMs: readonly [number, number],
	modelWindow: ModelWindow,
	interpolation: 'hold' | 'linear' = 'linear'
): number {
	if (interpolation === 'hold' || filmWindowMs[0] === filmWindowMs[1]) return modelWindow[0];
	const progress = clamp(
		(filmTimeMs - filmWindowMs[0]) / (filmWindowMs[1] - filmWindowMs[0]),
		0,
		1
	);
	return modelWindow[0] + progress * (modelWindow[1] - modelWindow[0]);
}

function samplePiecewise(plan: Extract<ModelTimePlan, { kind: 'piecewise' }>, filmTimeMs: number) {
	for (let index = plan.segments.length - 1; index >= 0; index -= 1) {
		const segment = plan.segments[index];
		if (filmTimeMs >= segment.filmWindowMs[0]) {
			return sampleWindow(
				filmTimeMs,
				segment.filmWindowMs,
				segment.modelWindow,
				segment.interpolation
			);
		}
	}
	return plan.entryModelTime;
}

/**
 * Purely samples the immutable model trace requested by a directed film frame. The simulation
 * never advances this value independently and an ensemble beat deliberately has no point time.
 */
export function sampleModelTime(beat: DirectedBeat, filmTimeMs: number): number | null {
	const clampedFilmTime = clamp(
		finiteNonNegative(filmTimeMs, 'Film time'),
		0,
		beat.autoplayDurationMs
	);
	switch (beat.model.kind) {
		case 'anchor':
			return beat.model.modelTime;
		case 'window':
			return sampleWindow(clampedFilmTime, beat.model.filmWindowMs, beat.model.modelWindow);
		case 'piecewise':
			return samplePiecewise(beat.model, clampedFilmTime);
		case 'ensemble':
			return null;
	}
}

export function sampleDirectedFrame(
	state: FilmClockState,
	beats: readonly DirectedBeat[] = DIRECTED_BEATS
): DirectedFrameSample {
	const beat = beatAt(beats, state.beatIndex);
	const beatTimeMs = clamp(state.beatTimeMs, 0, beat.autoplayDurationMs);
	const modelTime = sampleModelTime(beat, beatTimeMs);
	const pauseModel = beat.pauseTableau.model;
	const inMinimumHold = beatTimeMs >= beat.autoplayDurationMs - beat.minimumHoldMs;
	const model: TraceModelSample | EnsembleModelSample =
		beat.model.kind === 'ensemble'
			? { kind: 'ensemble', modelWindow: beat.model.modelWindow }
			: {
					kind: 'trace',
					modelTime:
						inMinimumHold && pauseModel.kind === 'trace'
							? pauseModel.modelTime
							: (modelTime as number),
					boundary: inMinimumHold && pauseModel.kind === 'trace' ? pauseModel.boundary : 'at'
				};

	return Object.freeze({
		beat,
		beatIndex: state.beatIndex,
		beatTimeMs,
		progress: beatTimeMs / beat.autoplayDurationMs,
		status: state.status,
		autoplay: state.autoplay,
		visible: state.visible,
		seed: state.seed,
		epoch: state.epoch,
		inMinimumHold,
		model,
		activeEvents: Object.freeze(
			beat.events.filter((cue) => cue.atMs <= beatTimeMs && beatTimeMs <= cue.untilMs)
		),
		visibleTextCues: Object.freeze(
			beat.textCues.filter((cue) => cue.atMs <= beatTimeMs && beatTimeMs <= cue.untilMs)
		)
	});
}
