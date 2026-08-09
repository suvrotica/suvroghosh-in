import { afterEach, describe, expect, it } from 'vitest';
import { createOrchestraWorkerClient, type OrchestraWorkerClient } from '../worker/client';
import {
	PORTRAIT_DURATION_SECONDS,
	PORTRAIT_GENERATION_OPTIONS,
	PORTRAIT_POINT_COUNT,
	createPortraitSnapshot,
	requestPortraitCoreScore
} from './portrait';

let client: OrchestraWorkerClient | null = null;

afterEach(() => {
	client?.dispose();
	client = null;
});

describe('portrait causal score', () => {
	it('places the selected attractor and sound world into a stable validated snapshot', () => {
		const snapshot = createPortraitSnapshot({ attractorId: 'rossler', soundWorld: 'radio' });
		expect(snapshot).toMatchObject({
			attractorId: 'rossler',
			soundWorld: 'radio',
			masterSeed: 'langford-1847'
		});
		expect(snapshot.stableStepSize).toBeGreaterThan(0);
		expect(PORTRAIT_GENERATION_OPTIONS).toEqual({
			pointCount: PORTRAIT_POINT_COUNT,
			mobile: true,
			durationSeconds: PORTRAIT_DURATION_SECONDS
		});
		const shared = {
			...snapshot,
			masterSeed: 'shared-phone-seed',
			noiseFamily: 'ridged' as const,
			noiseLens: 'dye' as const,
			noiseInfluence: 0.31,
			timingMode: 'raw' as const
		};
		expect(createPortraitSnapshot({ snapshot: shared })).toEqual(shared);
	});

	it('returns exact core Worker events for that attractor without fabricated feature metrics', async () => {
		const snapshot = createPortraitSnapshot({ attractorId: 'rossler', soundWorld: 'glass' });
		client = createOrchestraWorkerClient({ forceFallback: true });
		const result = await requestPortraitCoreScore(client, snapshot);
		expect(result.snapshot.attractorId).toBe('rossler');
		expect(result.score.length).toBeGreaterThan(0);
		for (const event of result.score) {
			expect(event.id).toContain(':rossler:');
			expect(event).toHaveProperty('simulationStep');
			expect(event).toHaveProperty('simulationTime');
			expect(event).toHaveProperty('sourceFeature');
			// These optional feature metrics are now emitted by core itself. Their presence and bounds
			// prove portrait is consuming core measurements rather than manufacturing audio aliases.
			for (const measured of [
				'height',
				'curvature',
				'stretching',
				'recurrence',
				'density',
				'noise'
			] as const) {
				expect(event[measured]).toBeGreaterThanOrEqual(0);
				expect(event[measured]).toBeLessThanOrEqual(1);
			}
			for (const fabricated of ['kind', 'intensity', 'frequencyHz', 'seed', 'metadata']) {
				expect(event).not.toHaveProperty(fabricated);
			}
		}
	});
});
