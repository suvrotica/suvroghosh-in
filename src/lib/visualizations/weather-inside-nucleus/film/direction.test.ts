import { describe, expect, it } from 'vitest';
import { parametersForScenario, simulateMatchedEnsembles, simulateSingle } from '../model';
import {
	BURST_END_MODEL_TIME,
	BURST_START_MODEL_TIME,
	DIRECTED_BEATS,
	ENSEMBLE_MODEL_WINDOW,
	INITIATION_EVENT_MODEL_TIMES,
	MINIMUM_CAMERA_EVENT_SEPARATION_MS,
	MINIMUM_LABEL_LEAD_MS,
	MINIMUM_LABEL_LINGER_MS,
	PEDAGOGICAL_SEED,
	SEED_0_CONTACT_TRANSITION_MODEL_TIMES,
	SELECTED_SILENT_NEAR_END_MODEL_TIME,
	SELECTED_SILENT_NEAR_INTERVAL_INDEX,
	SELECTED_SILENT_NEAR_START_MODEL_TIME,
	SELECTED_SILENT_NEAR_START_TRANSITION_INDEX,
	TOUR_DURATION_MS,
	type DirectedBeat
} from './direction';

const EXPECTED_DURATIONS = [6_000, 8_000, 7_000, 9_000, 10_000, 11_000, 11_000, 16_000];
const EXPECTED_HOLDS = [4_000, 4_000, 4_000, 4_000, 4_000, 3_500, 4_000, 5_000];

function wordCount(text: string): number {
	return text.trim().split(/\s+/u).length;
}

function modelWindow(beat: DirectedBeat): readonly [number, number] {
	if (beat.model.kind === 'anchor') return [beat.model.modelTime, beat.model.modelTime];
	return beat.model.modelWindow;
}

describe('Weather Inside the Nucleus directed film contract', () => {
	it('pins eight chapters to the exact 78-second autoplay allocation', () => {
		expect(DIRECTED_BEATS).toHaveLength(8);
		expect(DIRECTED_BEATS.map((beat) => beat.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(DIRECTED_BEATS.map((beat) => beat.autoplayDurationMs)).toEqual(EXPECTED_DURATIONS);
		expect(DIRECTED_BEATS.map((beat) => beat.minimumHoldMs)).toEqual(EXPECTED_HOLDS);
		expect(DIRECTED_BEATS.reduce((total, beat) => total + beat.autoplayDurationMs, 0)).toBe(
			TOUR_DURATION_MS
		);
		expect(TOUR_DURATION_MS).toBe(78_000);
		expect(PEDAGOGICAL_SEED).toBe(0);
	});

	it('gives every beat one explicit claim and a stable final tableau', () => {
		const claims = DIRECTED_BEATS.map((beat) => beat.newClaim);
		expect(new Set(claims).size).toBe(DIRECTED_BEATS.length);
		for (const beat of DIRECTED_BEATS) {
			expect(beat.newClaim.trim().length).toBeGreaterThan(24);
			expect(beat.accessibleSummary.trim().length).toBeGreaterThan(36);
			expect(beat.pauseTableau.description.trim().length).toBeGreaterThan(36);
			expect(beat.pauseTableau.visibleActors).toEqual(
				expect.arrayContaining(beat.visibleActors.filter((actor) => actor !== 'scale-card'))
			);
			expect(beat.timing.explanatoryHoldMs[1]).toBe(beat.autoplayDurationMs);
			expect(
				beat.timing.explanatoryHoldMs[1] - beat.timing.explanatoryHoldMs[0]
			).toBeGreaterThanOrEqual(beat.minimumHoldMs);
			expect(wordCount(beat.caption)).toBeLessThanOrEqual(12);
		}
	});

	it('pins the required model anchors and windows', () => {
		expect(modelWindow(DIRECTED_BEATS[0])).toEqual([3.5, 3.5]);
		expect(modelWindow(DIRECTED_BEATS[1])).toEqual([3.5, 5.5]);
		expect(modelWindow(DIRECTED_BEATS[2])).toEqual([5.5, 9]);
		expect(modelWindow(DIRECTED_BEATS[3])).toEqual([9, 9]);
		expect(modelWindow(DIRECTED_BEATS[4])).toEqual([9, 9.75]);
		expect(modelWindow(DIRECTED_BEATS[4])[1]).toBeLessThan(
			SEED_0_CONTACT_TRANSITION_MODEL_TIMES[0]
		);
		expect(modelWindow(DIRECTED_BEATS[5])).toEqual([
			SELECTED_SILENT_NEAR_START_MODEL_TIME,
			SELECTED_SILENT_NEAR_END_MODEL_TIME
		]);
		expect(modelWindow(DIRECTED_BEATS[6])).toEqual([24.65, BURST_END_MODEL_TIME]);
		expect(modelWindow(DIRECTED_BEATS[7])).toEqual(ENSEMBLE_MODEL_WINDOW);

		expect(SEED_0_CONTACT_TRANSITION_MODEL_TIMES).toEqual([
			9.9266879215, 12.8353867666, 13.0616583243, 19.9229721234
		]);
		expect(SELECTED_SILENT_NEAR_INTERVAL_INDEX).toBe(1);
		expect(SELECTED_SILENT_NEAR_START_TRANSITION_INDEX).toBe(2);
		expect(SELECTED_SILENT_NEAR_START_MODEL_TIME).toBe(13.0616583243);
		expect(SELECTED_SILENT_NEAR_END_MODEL_TIME).toBe(19.9229721234);
		expect(
			SEED_0_CONTACT_TRANSITION_MODEL_TIMES.slice(
				SELECTED_SILENT_NEAR_START_TRANSITION_INDEX,
				SELECTED_SILENT_NEAR_START_TRANSITION_INDEX + 2
			)
		).toEqual([SELECTED_SILENT_NEAR_START_MODEL_TIME, SELECTED_SILENT_NEAR_END_MODEL_TIME]);
		expect(BURST_START_MODEL_TIME).toBe(24.8093746775);
		expect(BURST_END_MODEL_TIME).toBe(27.6782023014);
		expect(INITIATION_EVENT_MODEL_TIMES).toEqual([24.9461097944, 25.7179468874, 26.3428133612]);
		expect(ENSEMBLE_MODEL_WINDOW).toEqual([0, 60]);
	});

	it('derives the directed silent encounter and burst from the real seed-0 kernel trace', () => {
		const trace = simulateSingle({ seed: PEDAGOGICAL_SEED });
		const orderedTransitions = Array.from(trace.contactTransitionTimes).slice(
			0,
			SEED_0_CONTACT_TRANSITION_MODEL_TIMES.length
		);
		for (const [index, transitionTime] of SEED_0_CONTACT_TRANSITION_MODEL_TIMES.entries()) {
			expect(orderedTransitions[index]).toBeCloseTo(transitionTime, 9);
		}
		expect(trace.burstStartTimes[0]).toBeCloseTo(BURST_START_MODEL_TIME, 9);
		expect(trace.burstEndTimes[0]).toBeCloseTo(BURST_END_MODEL_TIME, 9);
		expect(Array.from(trace.initiationTimes)).toHaveLength(INITIATION_EVENT_MODEL_TIMES.length);
		for (const [index, eventTime] of INITIATION_EVENT_MODEL_TIMES.entries()) {
			expect(trace.initiationTimes[index]).toBeCloseTo(eventTime, 9);
		}
		expect(trace.burstStartTimes[0]).toBeGreaterThan(SELECTED_SILENT_NEAR_END_MODEL_TIME);
		expect(trace.initiationTimes.every((time) => time > SELECTED_SILENT_NEAR_END_MODEL_TIME)).toBe(
			true
		);
	});

	it('pins the matched 48-history evidence stated in the final beat', () => {
		const matched = simulateMatchedEnsembles({
			rootSeed: PEDAGOGICAL_SEED,
			count: 48,
			baseline: parametersForScenario('baseline'),
			intervention: parametersForScenario('contact')
		});
		expect(matched.baseline.summary).toMatchObject({
			runCount: 48,
			burstingRunCount: 26,
			silentRunCount: 22
		});
		expect(matched.intervention.summary).toMatchObject({
			runCount: 48,
			burstingRunCount: 41,
			silentRunCount: 7
		});
		expect(Array.from(matched.seeds)).toEqual(Array.from(matched.baseline.seeds));
		expect(Array.from(matched.seeds)).toEqual(Array.from(matched.intervention.seeds));
	});

	it('keeps Beat 6 close and OFF, then uses one overt same-seed time cut for Beat 7', () => {
		const silent = DIRECTED_BEATS[5];
		const burst = DIRECTED_BEATS[6];
		expect(silent.model.kind).toBe('piecewise');
		expect(silent.pauseTableau.model).toEqual({
			kind: 'trace',
			modelTime: SELECTED_SILENT_NEAR_END_MODEL_TIME,
			boundary: 'before'
		});
		expect(silent.visibleActors).toContain('promoter-state');
		expect(silent.visibleActors).toContain('initiation-trace');
		expect(silent.visibleActors).not.toContain('initiation-event');

		expect(burst.model.kind).toBe('piecewise');
		if (burst.model.kind !== 'piecewise') throw new Error('Beat 7 must remain piecewise.');
		expect(burst.model.entryModelTime).toBe(SELECTED_SILENT_NEAR_END_MODEL_TIME);
		expect(burst.model.timeCut).toEqual({
			atMs: 1_000,
			fromModelTime: SELECTED_SILENT_NEAR_END_MODEL_TIME,
			toModelTime: 24.65,
			label: 'later in the same history · seed 0'
		});
		expect(
			burst.events.filter((event) => event.kind === 'initiation').map((event) => event.modelTime)
		).toEqual(INITIATION_EVENT_MODEL_TIMES);
	});

	it('keeps all cue windows bounded and all piecewise model segments contiguous', () => {
		for (const beat of DIRECTED_BEATS) {
			for (const cue of [...beat.events, ...beat.textCues]) {
				expect(cue.atMs).toBeGreaterThanOrEqual(0);
				expect(cue.untilMs).toBeGreaterThanOrEqual(cue.atMs);
				expect(cue.untilMs).toBeLessThanOrEqual(beat.autoplayDurationMs);
			}
			if (beat.model.kind !== 'piecewise') continue;
			expect(beat.model.segments[0].filmWindowMs[0]).toBe(0);
			expect(beat.model.segments.at(-1)?.filmWindowMs[1]).toBe(beat.autoplayDurationMs);
			for (let index = 1; index < beat.model.segments.length; index += 1) {
				expect(beat.model.segments[index].filmWindowMs[0]).toBe(
					beat.model.segments[index - 1].filmWindowMs[1]
				);
			}
		}
	});

	it('separates every camera move from the first causal action by at least 600 ms', () => {
		for (const beat of DIRECTED_BEATS) {
			const move = beat.camera.move;
			if (!move) continue;
			const durationMs = move.windowMs[1] - move.windowMs[0];
			expect(durationMs).toBeGreaterThanOrEqual(1_400);
			expect(durationMs).toBeLessThanOrEqual(2_500);
			expect(move.maximumAngularSpeedDegreesPerSecond).toBeLessThanOrEqual(12);
			expect(beat.timing.actionMs[0] - move.windowMs[1]).toBeGreaterThanOrEqual(
				MINIMUM_CAMERA_EVENT_SEPARATION_MS
			);
		}
	});

	it('gives directed labels at least 500 ms lead and 1.5 seconds linger', () => {
		for (const beat of DIRECTED_BEATS) {
			for (const textCue of beat.textCues) {
				if (!textCue.precedesEventId) continue;
				const event = beat.events.find((candidate) => candidate.id === textCue.precedesEventId);
				expect(event, `${beat.id}:${textCue.id} target event`).toBeDefined();
				if (!event) continue;
				expect(event.atMs - textCue.atMs).toBeGreaterThanOrEqual(MINIMUM_LABEL_LEAD_MS);
				expect(textCue.untilMs - event.untilMs).toBeGreaterThanOrEqual(MINIMUM_LABEL_LINGER_MS);
			}
		}
	});

	it('keeps direct captions concise and runtime direction data immutable', () => {
		expect(Object.isFrozen(DIRECTED_BEATS)).toBe(true);
		for (const beat of DIRECTED_BEATS) {
			expect(Object.isFrozen(beat)).toBe(true);
			expect(Object.isFrozen(beat.events)).toBe(true);
			expect(Object.isFrozen(beat.pauseTableau)).toBe(true);
			for (const textCue of beat.textCues.filter((cue) => cue.kind === 'caption')) {
				expect(wordCount(textCue.text), `${beat.id}:${textCue.id}`).toBeLessThanOrEqual(12);
			}
		}
	});
});
