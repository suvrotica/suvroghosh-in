import { describe, expect, it } from 'vitest';
import { StrangeAttractorAudioEngine } from './audio-engine';

describe('audio activation boundary', () => {
	it('constructs no AudioContext before explicit start()', async () => {
		let factoryCalls = 0;
		const engine = new StrangeAttractorAudioEngine({
			contextFactory() {
				factoryCalls += 1;
				throw new Error('start boundary reached');
			}
		});
		expect(factoryCalls).toBe(0);
		expect(engine.debugSnapshot()).toMatchObject({
			contextConstructed: false,
			muted: false,
			masterVolume: 0.23,
			schedulerIntervalMs: 25,
			schedulerLookaheadSeconds: 0.125
		});
		await expect(engine.start()).rejects.toThrow('start boundary reached');
		expect(factoryCalls).toBe(1);
		await engine.dispose();
	});

	it('stores observation audition ephemerally without constructing audio or mutating the score', async () => {
		const engine = new StrangeAttractorAudioEngine({
			contextFactory() {
				throw new Error('unexpected context');
			}
		});
		const score = Object.freeze([
			Object.freeze({ id: 'event-1', time: 0, type: 'fold' as const, noise: 0.8, pan: 0.4 })
		]);
		const before = JSON.stringify(score);
		engine.setScore(score);
		expect(engine.setObservationView('raw')).toBe('raw');
		expect(engine.debugSnapshot()).toMatchObject({
			contextConstructed: false,
			observationView: 'raw',
			queuedEvents: 1
		});
		expect(engine.setObservationView('noise')).toBe('noise');
		expect(engine.setObservationView('braided')).toBe('braided');
		expect(JSON.stringify(score)).toBe(before);
		await engine.dispose();
		expect(() => engine.setObservationView('raw')).toThrow(/disposed/iu);
	});
});
