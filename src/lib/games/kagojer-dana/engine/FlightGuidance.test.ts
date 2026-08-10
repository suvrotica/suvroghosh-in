import { describe, expect, it } from 'vitest';
import {
	FlightLessonTracker,
	FlightPhraseTracker,
	type FlightGuidanceSample
} from './FlightGuidance';

function sample(overrides: Partial<FlightGuidanceSample> = {}): FlightGuidanceSample {
	return {
		deltaSeconds: 0.1,
		elapsedSeconds: 0,
		altitudeM: 20,
		airspeedMps: 9,
		verticalSpeedMps: 0,
		headingRadians: 0,
		rollRadians: 0,
		pitchInput: 0,
		bankInput: 0,
		upwardWindMps: 0,
		obstacleDistanceM: 20,
		stalled: false,
		...overrides
	};
}

function repeat(
	count: number,
	tracker: FlightPhraseTracker,
	overrides: Partial<FlightGuidanceSample>
) {
	for (let index = 0; index < count; index += 1) tracker.update(sample(overrides));
}

describe('player-outcome flight sentence', () => {
	it('does not advance merely because time passes', () => {
		const tracker = new FlightPhraseTracker();
		for (let second = 0; second < 120; second += 0.1) {
			tracker.update(sample({ elapsedSeconds: second }));
		}
		expect(tracker.snapshot().beat).toBe('climb');
	});

	it('recognises climb, look, choose, dive, skim and escape in order', () => {
		const tracker = new FlightPhraseTracker();
		tracker.update(sample());
		repeat(16, tracker, { altitudeM: 38, verticalSpeedMps: 1, airspeedMps: 8.5 });
		expect(tracker.snapshot().beat).toBe('look');
		repeat(31, tracker, { altitudeM: 40, verticalSpeedMps: 0, obstacleDistanceM: 20 });
		expect(tracker.snapshot().beat).toBe('choose');
		repeat(8, tracker, { altitudeM: 40, headingRadians: Math.PI / 6, bankInput: 0.5 });
		expect(tracker.snapshot().beat).toBe('dive');
		repeat(8, tracker, { altitudeM: 26, verticalSpeedMps: -2.5, airspeedMps: 10.2 });
		expect(tracker.snapshot().beat).toBe('skim');
		repeat(31, tracker, { altitudeM: 10, verticalSpeedMps: 0, airspeedMps: 9 });
		expect(tracker.snapshot().beat).toBe('escape');
		repeat(16, tracker, { altitudeM: 34, verticalSpeedMps: 1, obstacleDistanceM: 10 });
		expect(tracker.snapshot()).toMatchObject({ beat: 'climb', cycle: 1 });
	});
});

describe('behaviour-gated first-minute lesson', () => {
	it('holds observation, accepts evidence, and times out gently when needed', () => {
		const tracker = new FlightLessonTracker(16);
		expect(tracker.update(sample({ elapsedSeconds: 15.9 }))).toBe('observe');
		expect(tracker.update(sample({ elapsedSeconds: 16 }))).toBe('raise');
		for (let index = 0; index < 6; index += 1) {
			tracker.update(
				sample({ elapsedSeconds: 16 + index / 10, pitchInput: 0.6, airspeedMps: 8.5 })
			);
		}
		expect(tracker.currentStage).toBe('lower');
		tracker.update(sample({ elapsedSeconds: 28 }));
		expect(tracker.currentStage).toBe('bank');
	});
});
