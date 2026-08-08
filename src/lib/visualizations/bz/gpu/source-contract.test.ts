import { describe, expect, it } from 'vitest';
import { BZ_PALETTE_INDEX, BZ_VIEW_MODE_INDEX } from './renderer';
import {
	interventionFragmentSource,
	mixFragmentSource,
	oregonatorCorrectorFragmentSource,
	oregonatorPredictorFragmentSource,
	schnakenbergCorrectorFragmentSource,
	schnakenbergPredictorFragmentSource
} from './shaders';

const predictors = [oregonatorPredictorFragmentSource, schnakenbergPredictorFragmentSource];
const correctors = [oregonatorCorrectorFragmentSource, schnakenbergCorrectorFragmentSource];
const computeShaders = [...predictors, ...correctors];

describe('BZ GPU shader source contract', () => {
	it('keeps every model stage on the explicit five-point h-squared stencil', () => {
		for (const source of computeShaders) {
			expect(source).toContain('north + south + east + west - 4.0 * centre.rg');
			expect(source).toContain('/ uSpacingSquared');
			expect(source).toContain('sampleValue.b < 0.5 ? centre : sampleValue');
			expect(source).toContain('uPeriodic == 0');
			expect(source).toContain('neighbour = wrapCoordinate(neighbour)');
		}
	});

	it('uses a genuine unclamped Heun predictor and correction for both models', () => {
		for (const source of predictors) {
			expect(source).toContain('centre.rg + uTimestep * rightHandSide');
			expect(source).not.toContain('clamp(centre.rg');
		}
		for (const source of correctors) {
			expect(source).toContain('0.5 * uTimestep * (k1 + k2)');
			expect(source).not.toContain('clamp(original.rg');
		}
	});

	it('contains the declared Oregonator and Schnakenberg reaction terms', () => {
		for (const source of [oregonatorPredictorFragmentSource, oregonatorCorrectorFragmentSource]) {
			expect(source).toContain('uF * centre.g * (centre.r - uQ) / (centre.r + uQ)');
			expect(source).toContain('reactionV = centre.r - centre.g');
		}
		for (const source of [
			schnakenbergPredictorFragmentSource,
			schnakenbergCorrectorFragmentSource
		]) {
			expect(source).toContain('uGamma * (uA - centre.r + autocatalysis)');
			expect(source).toContain('uGamma * (uB - autocatalysis)');
		}
	});

	it('keeps the two mask channels intact in intervention and mixing passes', () => {
		expect(interventionFragmentSource).toContain('value.a < 0.5');
		expect(interventionFragmentSource).toContain('value.b = 0.0');
		expect(mixFragmentSource).toContain('value.b >= 0.5 && value.a >= 0.5');
		expect(mixFragmentSource).toContain('mix(value.rg, uActiveMean, uFraction)');
	});

	it('exhaustively maps the public display unions', () => {
		expect(Object.keys(BZ_VIEW_MODE_INDEX).sort()).toEqual(
			[
				'difference-from-mean',
				'diffusion-u',
				'dish',
				'mask',
				'net-u',
				'reaction-u',
				'u',
				'v'
			].sort()
		);
		expect(Object.keys(BZ_PALETTE_INDEX).sort()).toEqual(
			['cerium', 'ferroin', 'high-contrast', 'phase-spectrum', 'scientific'].sort()
		);
	});
});
