import { describe, expect, it } from 'vitest';
import { DEFAULT_ATLAS_STATE } from '../config';
import { generateLightningFlash } from '../leader-generator';
import { thunderText } from './thunder';

describe('Lightning Atlas thunder model', () => {
	it('increases first-arrival delay when the observer is farther from the same channel', () => {
		const nearState = {
			...DEFAULT_ATLAS_STATE,
			flashType: 'negative-cg' as const,
			observer: { ...DEFAULT_ATLAS_STATE.stormPosition },
			storm: { ...DEFAULT_ATLAS_STATE.storm },
			environment: { ...DEFAULT_ATLAS_STATE.environment },
			visibleLayers: [...DEFAULT_ATLAS_STATE.visibleLayers],
			placedFeatures: []
		};
		const farState = { ...nearState, observer: { x: 0.02, z: 0.98 } };
		const near = generateLightningFlash({ state: nearState, strikeIndex: 4 }).flash;
		const far = generateLightningFlash({ state: farState, strikeIndex: 4 }).flash;
		expect(far.channelHash).toBe(near.channelHash);
		expect(far.thunderDelaySeconds).toBeGreaterThan(near.thunderDelaySeconds);
		expect(thunderText(far).length).toBeGreaterThan(12);
	});
});
