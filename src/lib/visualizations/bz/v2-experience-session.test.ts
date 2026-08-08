import { describe, expect, it } from 'vitest';
import type { BZPresetV2 } from './v2-types';
import { createBZV2SharedSessionSnapshot } from '$lib/components/visualizations/bz/v2-experience-model';

const metrics = {
	activeCells: 1024,
	meanU: 0.12,
	meanV: 0.08,
	varianceU: 0.03,
	varianceV: 0.02,
	minimumU: 0.01,
	maximumU: 0.82,
	minimumV: 0.02,
	maximumV: 0.31,
	excitedFraction: 0.24
} as const;

describe('V2 shared experience session', () => {
	it('publishes a bounded frame summary without numerical field arrays', () => {
		const preset = {
			id: 'persistent-single-spiral',
			validationStatus: 'validated'
		} as unknown as BZPresetV2;
		const snapshot = createBZV2SharedSessionSnapshot({
			heroId: 'persistent-single-spiral',
			preset,
			runOrigin: 'checkpoint',
			running: true,
			ready: true,
			busy: false,
			failure: false,
			latestFrame: { step: 28_000, modelTime: 14, engine: 'gpu-f32', metrics }
		});

		expect(snapshot).toMatchObject({
			heroId: 'persistent-single-spiral',
			presetId: 'persistent-single-spiral',
			validationStatus: 'validated',
			runOrigin: 'checkpoint',
			running: true,
			latestFrame: { step: 28_000, modelTime: 14, engine: 'gpu-f32', metrics }
		});
		expect(snapshot.latestFrame).not.toHaveProperty('field');
		expect(snapshot.latestFrame).not.toHaveProperty('interventions');
	});

	it('keeps an honest missing/pending state before the Gallery engine publishes', () => {
		expect(
			createBZV2SharedSessionSnapshot({
				heroId: 'classic-target-rings',
				preset: null,
				runOrigin: 'checkpoint',
				running: false,
				ready: false,
				busy: true,
				failure: false,
				latestFrame: null
			})
		).toEqual({
			heroId: 'classic-target-rings',
			presetId: null,
			validationStatus: 'missing',
			runOrigin: 'checkpoint',
			running: false,
			ready: false,
			busy: true,
			failure: false,
			latestFrame: null
		});
	});
});
