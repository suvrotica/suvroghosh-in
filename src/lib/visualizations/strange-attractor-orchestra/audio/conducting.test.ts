import { describe, expect, it } from 'vitest';
import { StrangeAttractorAudioEngine } from './audio-engine';
import {
	CONDUCTING_MAX_MASTER_PAN,
	CONDUCTING_MAX_TONE_GAIN_DB,
	CONDUCTING_MIN_EVENT_KEEP_RATIO,
	conductingKeepsEvent,
	conductingTargets,
	sanitizeConductingState
} from './conducting';
import type { SonicEvent } from './contracts';

describe('ephemeral conducting safety', () => {
	it('bounds pan, brightness and thinning, then resets exactly to baseline', () => {
		const bounded = sanitizeConductingState(50, -50, true);
		expect(bounded).toEqual({ horizontal: 1, vertical: -1, active: true });
		expect(conductingTargets(bounded)).toEqual({
			pan: CONDUCTING_MAX_MASTER_PAN,
			toneGainDb: -CONDUCTING_MAX_TONE_GAIN_DB,
			eventKeepRatio: CONDUCTING_MIN_EVENT_KEEP_RATIO
		});
		expect(sanitizeConductingState(Number.NaN, Number.POSITIVE_INFINITY, false)).toEqual({
			horizontal: 0,
			vertical: 0,
			active: false
		});
		expect(sanitizeConductingState(Number.NaN, Number.POSITIVE_INFINITY, true)).toEqual({
			horizontal: 0,
			vertical: 0,
			active: true
		});
	});

	it('thins deterministically without mutating the canonical score', () => {
		const score: readonly SonicEvent[] = Object.freeze([
			Object.freeze({ id: 'one', time: 0, type: 'fold', duration: 0.3, pan: 0 }),
			Object.freeze({ id: 'two', time: 1, type: 'recurrence', duration: 0.5, pan: 0.2 })
		]);
		const before = JSON.stringify(score);
		const state = sanitizeConductingState(0.4, -1, true);
		const first = Array.from({ length: 64 }, (_, index) =>
			conductingKeepsEvent(score[index % score.length].id, index, state)
		);
		const second = Array.from({ length: 64 }, (_, index) =>
			conductingKeepsEvent(score[index % score.length].id, index, state)
		);
		expect(first).toEqual(second);
		expect(first).toContain(true);
		expect(first).toContain(false);
		expect(JSON.stringify(score)).toBe(before);
	});

	it('does not construct audio early and rejects conducting after cleanup', async () => {
		let factoryCalls = 0;
		const engine = new StrangeAttractorAudioEngine({
			contextFactory() {
				factoryCalls += 1;
				throw new Error('unexpected context');
			}
		});
		engine.setConducting(0.75, 0.5, true);
		expect(factoryCalls).toBe(0);
		expect(engine.debugSnapshot().conducting).toEqual({
			horizontal: 0.75,
			vertical: 0.5,
			active: true
		});
		expect(engine.setConducting(0.75, 0.5, false)).toEqual({
			horizontal: 0,
			vertical: 0,
			active: false
		});
		await engine.dispose();
		expect(() => engine.setConducting(0, 0, true)).toThrow(/disposed/iu);
	});
});
