import { describe, expect, it } from 'vitest';
import {
	FlightFolioRecorder,
	RunDirector,
	createCuratedRunDefinition,
	createFreeFlightRunDefinition
} from './RunDirector';

describe('curated and free-flight direction', () => {
	it('builds a deterministic continuous six-to-ten-minute first flight across all registers', () => {
		const first = createCuratedRunDefinition('monsoon-window');
		const again = createCuratedRunDefinition('monsoon-window');
		expect(first).toEqual(again);
		expect(first.durationSeconds).toBeGreaterThanOrEqual(360);
		expect(first.durationSeconds).toBeLessThanOrEqual(600);
		expect(new Set(first.sections.map((section) => section.targetRegister))).toEqual(
			new Set(['low', 'middle', 'high'])
		);
		expect(first.sections[0].startsAtSeconds).toBe(0);
		expect(first.sections[0].durationSeconds).toBeGreaterThanOrEqual(12);
		expect(first.sections[0].durationSeconds).toBeLessThanOrEqual(20);
		expect(first.sections.slice(1).every((section) => section.durationSeconds >= 20)).toBe(true);
		expect(first.sections.slice(1).every((section) => section.durationSeconds <= 45)).toBe(true);
		expect(first.sections.slice(1).map((section) => section.district)).toEqual(
			first.districtRoute?.modules.map((module) => module.district)
		);
		const directions = new Set(first.sections.map((section) => section.direction));
		for (const direction of [
			'observe',
			'climb',
			'look',
			'choose',
			'dive',
			'skim',
			'escape',
			'land'
		] as const) {
			expect(directions.has(direction)).toBe(true);
		}
		for (let index = 1; index < first.sections.length; index += 1) {
			expect(first.sections[index].startsAtSeconds).toBe(first.sections[index - 1].endsAtSeconds);
		}
	});

	it('keeps cadence and duration bounded across seeds', () => {
		for (let index = 0; index < 100; index += 1) {
			const run = createCuratedRunDefinition(`cadence-${index}`);
			expect(run.durationSeconds).toBeGreaterThanOrEqual(360);
			expect(run.durationSeconds).toBeLessThanOrEqual(600);
			for (const section of run.sections.slice(1)) {
				expect(section.durationSeconds).toBeGreaterThanOrEqual(20);
				expect(section.durationSeconds).toBeLessThanOrEqual(45);
			}
		}
	});

	it('emits sparse section transitions without taking control', () => {
		const director = new RunDirector('tram-wire');
		const firstCue = director.currentCue(0);
		expect(firstCue?.section.direction).toBe('observe');
		expect(director.update(0)).toMatchObject([{ type: 'section-entered' }]);
		expect(director.update(1)).toEqual([]);
		const nextTime = firstCue?.section.endsAtSeconds ?? 0;
		expect(director.update(nextTime)).toMatchObject([{ type: 'section-entered' }]);
	});

	it('offers no-score free flight immediately', () => {
		const free = createFreeFlightRunDefinition('river-breeze');
		expect(free.mode).toBe('free');
		expect(free.scoringEnabled).toBe(false);
		expect(free.sections).toEqual([]);
		expect(free.durationSeconds).toBe(Number.POSITIVE_INFINITY);
	});
});

describe('flight folio data helper', () => {
	it('records bounded path, altitude and unique observations, with free-flight score suppressed', () => {
		const folio = new FlightFolioRecorder('river-breeze', 'free', {
			sampleIntervalSeconds: 0.5
		});
		expect(
			folio.recordSample({
				atSeconds: 0,
				position: { x: 0, y: 18, z: 0 },
				district: 'North Calcutta',
				soundscape: 'low city'
			})
		).toBe(true);
		expect(
			folio.recordSample({
				atSeconds: 0.2,
				position: { x: 1, y: 19, z: 1 },
				district: 'North Calcutta'
			})
		).toBe(false);
		folio.recordBorrowedWind('River breeze');
		folio.recordBorrowedWind('River breeze');
		folio.recordLandmarkSeen('Howrah Bridge');
		folio.recordCleanPassage({ label: 'Tram wire', distanceM: 0.12 });
		const result = folio.finish({
			elapsedSeconds: 90,
			score: 900,
			landing: 'A rooftop in North Calcutta',
			worldSignature: 'abc123'
		});

		expect(result.score).toBe(0);
		expect(result.path).toHaveLength(1);
		expect(result.windsBorrowed).toEqual(['River breeze']);
		expect(result.landmarks).toEqual(['Howrah Bridge']);
		expect(result.closestPassage).toContain('0.12 m');
	});
});
