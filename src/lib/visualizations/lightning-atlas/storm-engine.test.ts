import { describe, expect, it } from 'vitest';
import { effectiveThunderArrivalTime } from './audio/thunder';
import { DEFAULT_ATLAS_STATE } from './config';
import { flashDuration, generateLightningFlash } from './leader-generator';
import { StormPlaybackEngine } from './storm-engine';

describe('Lightning Atlas fixed-step playback state machine', () => {
	it('advances in legal phase order independently of render-frame partitions', () => {
		const { flash } = generateLightningFlash({ state: DEFAULT_ATLAS_STATE, strikeIndex: 0 });
		const first = new StormPlaybackEngine();
		const second = new StormPlaybackEngine();
		first.load(flash);
		second.load(flash);
		for (let index = 0; index < 60; index += 1) first.advance(1 / 60);
		for (let index = 0; index < 20; index += 1) second.advance(1 / 20);
		expect(first.snapshot().time).toBeCloseTo(second.snapshot().time, 8);
		expect(first.snapshot().phase).toBe(second.snapshot().phase);
	});

	it('does not advance while paused and resumes the same immutable flash', () => {
		const { flash } = generateLightningFlash({ state: DEFAULT_ATLAS_STATE, strikeIndex: 2 });
		const engine = new StormPlaybackEngine();
		engine.load(flash);
		engine.advance(0.5);
		engine.pause();
		const paused = engine.snapshot();
		engine.advance(10);
		expect(engine.snapshot()).toEqual(paused);
		engine.play();
		engine.advance(0.5);
		expect(engine.snapshot().time).toBeGreaterThan(paused.time);
		expect(flash.channelHash).toMatch(/^[0-9a-f]{8}$/);
	});

	it('steps backward from exact completion to the phase before recharging', () => {
		const { flash } = generateLightningFlash({ state: DEFAULT_ATLAS_STATE, strikeIndex: 3 });
		const engine = new StormPlaybackEngine();
		engine.load(flash, false);
		engine.seek(flashDuration(flash));
		engine.stepPhase(-1);
		expect(engine.snapshot().phase).toBe(flash.phaseEvents.at(-2)?.phase);
		expect(engine.snapshot().phase).not.toBe('charging');
	});

	it.each([0.25, 1, 4])(
		'crosses the stored thunder-arrival timestamp consistently at %sx playback',
		(speed) => {
			const state = {
				...DEFAULT_ATLAS_STATE,
				flashType: 'negative-cg' as const,
				storm: { ...DEFAULT_ATLAS_STATE.storm },
				environment: { ...DEFAULT_ATLAS_STATE.environment },
				stormPosition: { ...DEFAULT_ATLAS_STATE.stormPosition },
				observer: { x: 0.02, z: 0.98 },
				visibleLayers: [...DEFAULT_ATLAS_STATE.visibleLayers],
				placedFeatures: []
			};
			const { flash } = generateLightningFlash({ state, strikeIndex: 1 });
			expect(flashDuration(flash)).toBeGreaterThanOrEqual(flash.thunderArrivalTime);
			const engine = new StormPlaybackEngine();
			engine.load(flash);
			engine.setSpeed(speed);
			let wallTime = 0;
			while (engine.snapshot().time < flash.thunderArrivalTime && wallTime < 180) {
				engine.advance(1 / 60);
				wallTime += 1 / 60;
			}
			expect(engine.snapshot().time).toBeGreaterThanOrEqual(flash.thunderArrivalTime);
			expect(Math.abs(wallTime * speed - flash.thunderArrivalTime)).toBeLessThan(0.09);
		}
	);

	it('compresses both the visible countdown and audio trigger without mutating model time', () => {
		const state = {
			...DEFAULT_ATLAS_STATE,
			flashType: 'negative-cg' as const,
			storm: { ...DEFAULT_ATLAS_STATE.storm },
			environment: { ...DEFAULT_ATLAS_STATE.environment },
			stormPosition: { ...DEFAULT_ATLAS_STATE.stormPosition },
			observer: { x: 0.02, z: 0.98 },
			visibleLayers: [...DEFAULT_ATLAS_STATE.visibleLayers],
			placedFeatures: []
		};
		const { flash } = generateLightningFlash({ state, strikeIndex: 4 });
		const rawArrival = flash.thunderArrivalTime;
		const compressed = effectiveThunderArrivalTime(flash, true);
		expect(compressed).toBeLessThan(rawArrival);
		expect(effectiveThunderArrivalTime(flash, false)).toBe(rawArrival);
		expect(flash.thunderArrivalTime).toBe(rawArrival);
	});
});
