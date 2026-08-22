import { describe, expect, it } from 'vitest';
import { complex } from './complex';
import { parseExpression } from './expression';
import { heightDefinition, probeExpression, sampleHeight, signedSymlog } from './height';
import { domainColoringPreset } from './presets';
import type { EvaluationDiagnostic, HeightSettings } from './types';

const settings = (overrides: Partial<HeightSettings> = {}): HeightSettings => ({
	lens: 'log-magnitude',
	compression: 'linear',
	verticalScale: 1,
	logCap: 8,
	componentScale: 1,
	componentCap: 8,
	...overrides
});

const evaluation = (
	re: number,
	im = 0,
	status: EvaluationDiagnostic['status'] = 'finite'
): EvaluationDiagnostic => ({ value: complex(re, im), status });

describe('landscape height transforms', () => {
	it('defines every selected lens from settings rather than a sampled function value', () => {
		expect(heightDefinition(settings())).toBe(
			'hL(z) = sL · clip(log₂|f(z)|, −K, K), with sL = 1 and K = 8'
		);
		expect(
			heightDefinition(settings({ compression: 'asinh', verticalScale: 1.5, logCap: 4 }))
		).toBe('hL(z) = sL · clip(asinh(log₂|f(z)|), −K, K), with sL = 1.5 and K = 4');
		expect(heightDefinition(settings({ lens: 'phase', verticalScale: 2 }))).toBe(
			'hθ(z) = sθ · Arg f(z) / π, with sθ = 2'
		);
		expect(heightDefinition(settings({ lens: 'flat' }))).toBe('h(z) = 0');
	});

	it('names the component, signed symlog scale, cap, and vertical scale', () => {
		const real = heightDefinition(
			settings({ lens: 'real', componentScale: 0.25, componentCap: 3, verticalScale: 2 })
		);
		const imaginary = heightDefinition(
			settings({ lens: 'imaginary', componentScale: 2, componentCap: 5, verticalScale: 0.75 })
		);

		expect(real).toContain('t = Re f(z)');
		expect(real).toContain('Qₐ(t) = sgn(t) log₂(1 + |t|/a)');
		expect(real).toContain('a = 0.25, sᴄ = 2, and Kᴄ = 3');
		expect(imaginary).toContain('t = Im f(z)');
		expect(imaginary).toContain('a = 2, sᴄ = 0.75, and Kᴄ = 5');
	});

	it('uses exact powers-of-two units with |f| = 1 at sea level', () => {
		const unit = sampleHeight(evaluation(1), settings({ verticalScale: 2 }));
		const high = sampleHeight(evaluation(8), settings({ verticalScale: 2 }));
		const low = sampleHeight(evaluation(1 / 8), settings({ verticalScale: 2 }));

		expect(unit).toMatchObject({ raw: 0, displayed: 0, clipped: 'none' });
		expect(high).toMatchObject({ raw: 3, displayed: 6, clipped: 'none' });
		expect(low).toMatchObject({ raw: -3, displayed: -6, clipped: 'none' });
	});

	it('clips symmetrically after the selected log transform and before vertical scaling', () => {
		const linear = settings({ logCap: 4, verticalScale: 1.5 });
		expect(sampleHeight(evaluation(2 ** 20), linear)).toMatchObject({
			raw: 20,
			displayed: 6,
			clipped: 'high'
		});
		expect(sampleHeight(evaluation(2 ** -20), linear)).toMatchObject({
			raw: -20,
			displayed: -6,
			clipped: 'low'
		});

		const compressed = sampleHeight(
			evaluation(2 ** 4),
			settings({ compression: 'asinh', logCap: 10, verticalScale: 2 })
		);
		expect(compressed.raw).toBe(4);
		expect(compressed.displayed).toBeCloseTo(2 * Math.asinh(4), 12);
		expect(compressed.clipped).toBe('none');
	});

	it('represents known zero and pole limits with finite cap geometry', () => {
		const capped = settings({ logCap: 5, verticalScale: 0.75 });
		expect(sampleHeight(evaluation(0, 0, 'zero'), capped)).toMatchObject({
			raw: null,
			displayed: -3.75,
			clipped: 'low'
		});
		expect(sampleHeight(evaluation(Number.POSITIVE_INFINITY, 0, 'pole'), capped)).toMatchObject({
			raw: null,
			displayed: 3.75,
			clipped: 'high'
		});

		const numericalZero = sampleHeight(evaluation(0), capped);
		expect(numericalZero.raw).toBe(Number.NEGATIVE_INFINITY);
		expect(numericalZero.displayed).toBe(-3.75);
		expect(numericalZero.clipped).toBe('low');
	});

	it('uses an odd base-two symlog for signed component lenses', () => {
		expect(signedSymlog(3, 1)).toBe(2);
		expect(signedSymlog(-3, 1)).toBe(-2);
		expect(signedSymlog(0, 1)).toBe(0);
		expect(signedSymlog(Number.POSITIVE_INFINITY, 1)).toBeNaN();
		expect(signedSymlog(1, 0)).toBeNaN();

		const real = sampleHeight(
			evaluation(-15, 3),
			settings({ lens: 'real', componentScale: 1, componentCap: 3, verticalScale: 2 })
		);
		expect(real).toMatchObject({ raw: -15, displayed: -6, clipped: 'low' });

		const imaginary = sampleHeight(
			evaluation(-15, 3),
			settings({ lens: 'imaginary', componentScale: 1, componentCap: 3, verticalScale: 2 })
		);
		expect(imaginary).toMatchObject({ raw: 3, displayed: 4, clipped: 'none' });
	});

	it('normalises principal phase by pi and refuses undefined non-flat samples', () => {
		const phase = sampleHeight(evaluation(0, -2), settings({ lens: 'phase', verticalScale: 2 }));
		expect(phase.raw).toBeCloseTo(-Math.PI / 2, 12);
		expect(phase.displayed).toBeCloseTo(-1, 12);

		const undefinedReal = sampleHeight(
			evaluation(Number.NaN, Number.NaN, 'undefined'),
			settings({ lens: 'real' })
		);
		expect(undefinedReal).toMatchObject({ raw: null, displayed: null, clipped: 'none' });
		expect(undefinedReal.formula).toContain('t = Re f(z)');

		const flat = sampleHeight(
			evaluation(Number.NaN, Number.NaN, 'undefined'),
			settings({ lens: 'flat' })
		);
		expect(flat).toMatchObject({ raw: 0, displayed: 0, clipped: 'none' });
	});

	it('reports proximity without promoting a nearby finite point to an exact zero limit', () => {
		const preset = domainColoringPreset('identity');
		if (!preset) throw new Error('Missing identity preset.');
		const node = parseExpression(preset.expression);
		const nearby = probeExpression(node, complex(0.01), settings(), preset, preset.features, 0.1);
		const exact = probeExpression(node, complex(0), settings(), preset, preset.features, 0.1);
		expect(nearby.nearFeature?.kind).toBe('zero');
		expect(nearby.status).not.toBe('zero');
		expect(nearby.height.raw).toBeCloseTo(Math.log2(0.01), 12);
		expect(nearby.height.displayed).not.toBeNull();
		expect(nearby.statusDetail).toMatch(/not promoted/i);
		expect(exact.status).toBe('zero');
		expect(exact.height).toMatchObject({ raw: null, clipped: 'low' });
	});
});
