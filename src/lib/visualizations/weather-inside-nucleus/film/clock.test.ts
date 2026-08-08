import { describe, expect, it } from 'vitest';
import {
	createFilmClock,
	MAX_CLOCK_STEP_MS,
	reduceFilmClock,
	sampleDirectedFrame,
	sampleModelTime,
	type FilmClockState
} from './clock';
import {
	BURST_END_MODEL_TIME,
	DIRECTED_BEATS,
	INITIATION_EVENT_MODEL_TIMES,
	SELECTED_SILENT_NEAR_END_MODEL_TIME,
	SELECTED_SILENT_NEAR_START_MODEL_TIME,
	TOUR_DURATION_MS
} from './direction';

function tick(state: FilmClockState, nowMs: number): FilmClockState {
	return reduceFilmClock(state, { type: 'TICK', nowMs });
}

describe('Weather Inside the Nucleus pause-safe film clock', () => {
	it('uses supplied monotonic time, rebases on the first frame, and clamps long stalls', () => {
		let state = createFilmClock();
		expect(Object.isFrozen(state)).toBe(true);
		state = tick(state, 1_000);
		expect(state.beatTimeMs).toBe(0);
		state = tick(state, 1_016);
		expect(state.beatTimeMs).toBe(16);
		state = tick(state, 2_016);
		expect(state.beatTimeMs).toBe(16 + MAX_CLOCK_STEP_MS);
		expect(MAX_CLOCK_STEP_MS).toBe(100);
		expect(() => tick(state, 2_015)).toThrow(/backwards/i);
		expect(() => tick(state, Number.NaN)).toThrow(RangeError);
	});

	it('freezes while paused or hidden and resumes without hidden wall-time debt', () => {
		let state = createFilmClock();
		state = tick(state, 0);
		state = tick(state, 50);
		expect(state.beatTimeMs).toBe(50);

		state = reduceFilmClock(state, { type: 'PAUSE' });
		expect(state.status).toBe('paused');
		state = tick(state, 5_000);
		state = tick(state, 5_050);
		expect(state.beatTimeMs).toBe(50);

		state = reduceFilmClock(state, { type: 'PLAY' });
		state = tick(state, 10_000);
		state = tick(state, 10_040);
		expect(state.beatTimeMs).toBe(90);

		state = reduceFilmClock(state, { type: 'SET_VISIBLE', visible: false });
		state = tick(state, 20_000);
		state = tick(state, 20_100);
		expect(state.beatTimeMs).toBe(90);
		state = reduceFilmClock(state, { type: 'SET_VISIBLE', visible: true });
		state = tick(state, 30_000);
		state = tick(state, 30_025);
		expect(state.beatTimeMs).toBe(115);
	});

	it('makes early Next finish the current beat and held Next begin the following beat', () => {
		let state = createFilmClock({ beatTimeMs: 1_234, seed: 73 });
		state = reduceFilmClock(state, { type: 'NEXT' });
		expect(state).toMatchObject({
			beatIndex: 0,
			beatTimeMs: 6_000,
			status: 'held',
			autoplay: false,
			seed: 73
		});

		state = reduceFilmClock(state, { type: 'NEXT' });
		expect(state).toMatchObject({ beatIndex: 1, beatTimeMs: 0, status: 'running' });

		state = reduceFilmClock(state, { type: 'PREVIOUS' });
		expect(state).toMatchObject({ beatIndex: 0, beatTimeMs: 6_000, status: 'held' });
		expect(state.seed).toBe(73);
	});

	it('replays a beat or tour from its declared entry without changing the seed', () => {
		let state = createFilmClock({ beatIndex: 5, beatTimeMs: 8_000, seed: 0xdecafbad });
		const initialEpoch = state.epoch;
		state = reduceFilmClock(state, { type: 'REPLAY_BEAT' });
		expect(state).toMatchObject({
			beatIndex: 5,
			beatTimeMs: 0,
			status: 'running',
			autoplay: false,
			seed: 0xdecafbad,
			epoch: initialEpoch + 1
		});

		state = reduceFilmClock(state, { type: 'REPLAY_TOUR' });
		expect(state).toMatchObject({
			beatIndex: 0,
			beatTimeMs: 0,
			status: 'running',
			seed: 0xdecafbad,
			epoch: initialEpoch + 2
		});
	});

	it('carries autoplay remainder across beats and stops on the final tableau without looping', () => {
		let state = createFilmClock({ beatTimeMs: 5_990, autoplay: true });
		state = tick(state, 0);
		state = tick(state, 100);
		expect(state).toMatchObject({ beatIndex: 1, beatTimeMs: 90, status: 'running' });

		state = createFilmClock({
			beatIndex: DIRECTED_BEATS.length - 1,
			beatTimeMs: 15_950,
			autoplay: true
		});
		state = tick(state, 0);
		state = tick(state, 100);
		expect(state).toMatchObject({
			beatIndex: DIRECTED_BEATS.length - 1,
			beatTimeMs: 16_000,
			status: 'held',
			autoplay: false
		});
		const finalEpoch = state.epoch;
		state = tick(state, 200);
		expect(state).toMatchObject({ beatIndex: 7, beatTimeMs: 16_000, epoch: finalEpoch });
	});

	it('runs the complete optional autoplay for 78 seconds and then parks', () => {
		let state = createFilmClock({ autoplay: true });
		state = tick(state, 0);
		for (let nowMs = 100; nowMs <= TOUR_DURATION_MS; nowMs += 100) state = tick(state, nowMs);
		expect(state).toMatchObject({
			beatIndex: 7,
			beatTimeMs: 16_000,
			status: 'held',
			autoplay: false
		});
	});

	it('starts autoplay from the beat after a manual hold but never restarts the final hold', () => {
		let state = createFilmClock({ beatTimeMs: 6_000 });
		expect(state.status).toBe('held');
		state = reduceFilmClock(state, { type: 'START_AUTOPLAY' });
		expect(state).toMatchObject({ beatIndex: 1, beatTimeMs: 0, status: 'running', autoplay: true });

		state = createFilmClock({ beatIndex: 7, beatTimeMs: 16_000, autoplay: true });
		state = reduceFilmClock(state, { type: 'START_AUTOPLAY' });
		expect(state).toMatchObject({
			beatIndex: 7,
			beatTimeMs: 16_000,
			status: 'held',
			autoplay: false
		});
	});
});

describe('directed model-time sampling', () => {
	it('samples anchors and linear beat windows without an independent model clock', () => {
		expect(sampleModelTime(DIRECTED_BEATS[0], 4_000)).toBe(3.5);
		expect(sampleModelTime(DIRECTED_BEATS[1], 0)).toBe(3.5);
		expect(sampleModelTime(DIRECTED_BEATS[1], 2_800)).toBe(3.5);
		expect(sampleModelTime(DIRECTED_BEATS[1], 3_300)).toBe(4.5);
		expect(sampleModelTime(DIRECTED_BEATS[1], 3_800)).toBe(5.5);
		expect(sampleModelTime(DIRECTED_BEATS[1], 8_000)).toBe(5.5);
		expect(sampleModelTime(DIRECTED_BEATS[7], 12_000)).toBeNull();
	});

	it('crosses the exact near-state event inside Beat 6 and holds the strict pre-transition tableau', () => {
		const beat = DIRECTED_BEATS[5];
		const nearEvent = beat.events.find((event) => event.id === 'contact-enters-near');
		expect(nearEvent).toBeDefined();
		if (!nearEvent) return;
		expect(sampleModelTime(beat, nearEvent.atMs)).toBeCloseTo(
			SELECTED_SILENT_NEAR_START_MODEL_TIME,
			10
		);
		expect(sampleModelTime(beat, 11_000)).toBe(SELECTED_SILENT_NEAR_END_MODEL_TIME);

		for (const beatTimeMs of [7_500, 8_000, 10_999, 11_000]) {
			const held = createFilmClock({ beatIndex: 5, beatTimeMs, status: 'paused' });
			const frame = sampleDirectedFrame(held);
			expect(frame.inMinimumHold).toBe(true);
			expect(frame.model).toEqual({
				kind: 'trace',
				modelTime: SELECTED_SILENT_NEAR_END_MODEL_TIME,
				boundary: 'before'
			});
		}
	});

	it('makes the Beat 7 time cut explicit and samples every real initiation time', () => {
		const beat = DIRECTED_BEATS[6];
		expect(sampleModelTime(beat, 999)).toBe(SELECTED_SILENT_NEAR_END_MODEL_TIME);
		expect(sampleModelTime(beat, 1_000)).toBe(24.65);

		const initiationEvents = beat.events.filter((event) => event.kind === 'initiation');
		expect(initiationEvents.map((event) => event.modelTime)).toEqual(INITIATION_EVENT_MODEL_TIMES);
		for (const event of initiationEvents) {
			expect(sampleModelTime(beat, event.atMs)).toBeCloseTo(event.modelTime as number, 10);
		}
		expect(sampleModelTime(beat, 7_000)).toBe(BURST_END_MODEL_TIME);
		expect(sampleModelTime(beat, 11_000)).toBe(BURST_END_MODEL_TIME);
	});

	it('returns renderer-ready cues and an ensemble scope without a fictitious point time', () => {
		const burstState = createFilmClock({ beatIndex: 6, beatTimeMs: 4_150, status: 'paused' });
		const burstFrame = sampleDirectedFrame(burstState);
		expect(burstFrame.visibleTextCues.map((cue) => cue.id)).toContain('initiation-label');
		expect(burstFrame.activeEvents.some((event) => event.kind === 'initiation')).toBe(true);

		const ensembleState = createFilmClock({ beatIndex: 7, beatTimeMs: 16_000 });
		const ensembleFrame = sampleDirectedFrame(ensembleState);
		expect(ensembleFrame.model).toEqual({ kind: 'ensemble', modelWindow: [0, 60] });
		expect(ensembleFrame.inMinimumHold).toBe(true);
	});
});
