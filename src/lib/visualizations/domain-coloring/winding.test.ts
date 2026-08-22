import { describe, expect, it } from 'vitest';
import { parseExpression } from './expression';
import { domainColoringPreset } from './presets';
import type { DomainColoringPreset, LoopGeometry } from './types';
import { estimateWinding } from './winding';

const circle = (radius: number, re = 0, im = 0): LoopGeometry => ({
	center: { re, im },
	radius
});

function preset(id: string): DomainColoringPreset {
	const result = domainColoringPreset(id);
	if (!result) throw new Error(`Missing test preset ${id}.`);
	return result;
}

function converged(id: string, loop: LoopGeometry) {
	const selected = preset(id);
	const result = estimateWinding(parseExpression(selected.expression), loop, {
		preset: selected,
		minimumSamples: 32,
		maximumSamples: 512
	});
	if (!result.ok) throw new Error(`Expected a converged winding, got ${result.reason}.`);
	return result;
}

describe('convergent winding estimates', () => {
	it('counts a polynomial zero and a reciprocal pole with orientation', () => {
		const identity = converged('identity', circle(1));
		expect(identity.winding).toBeCloseTo(1, 10);
		expect(identity.integer).toBe(1);
		expect(identity.interpretation).toBe('zeros-minus-poles');
		expect(identity.samples).toBeGreaterThan(32);

		const reciprocal = converged('reciprocal', circle(1));
		expect(reciprocal.winding).toBeCloseTo(-1, 10);
		expect(reciprocal.integer).toBe(-1);
		expect(reciprocal.interpretation).toBe('zeros-minus-poles');
	});

	it('recovers all three roots of z cubed minus one and excludes them on a smaller loop', () => {
		const outside = converged('roots-of-unity', circle(1.5));
		expect(outside.winding).toBeCloseTo(3, 10);
		expect(outside.integer).toBe(3);

		const inside = converged('roots-of-unity', circle(0.5));
		expect(inside.winding).toBeCloseTo(0, 10);
		expect(inside.integer).toBe(0);
	});

	it('counts one zero of the balanced rational map without enclosing a pole', () => {
		const result = converged('rational-map', circle(0.4, 1, 0));
		expect(result.winding).toBeCloseTo(1, 10);
		expect(result.integer).toBe(1);
		expect(result.interpretation).toBe('zeros-minus-poles');
	});

	it('does not promote an antiholomorphic output winding to the argument principle', () => {
		const result = converged('conjugate', circle(1));
		expect(result.integer).toBe(-1);
		expect(result.interpretation).toBe('output-winding');
		expect(result.detail).toMatch(/no meromorphic/i);
	});
});

describe('winding refusal paths', () => {
	it('refuses a loop that crosses a declared principal branch cut', () => {
		const logarithm = preset('logarithm');
		const result = estimateWinding(parseExpression(logarithm.expression), circle(1), {
			preset: logarithm,
			minimumSamples: 32,
			maximumSamples: 128
		});
		expect(result).toMatchObject({ ok: false, reason: 'branch-cut' });
	});

	it('refuses a zero or pole sampled on the path', () => {
		const result = estimateWinding(parseExpression('1 / (z - 1)'), circle(1), {
			minimumSamples: 32,
			maximumSamples: 128
		});
		expect(result).toMatchObject({ ok: false, reason: 'invalid-sample' });
	});

	it('refuses numerically near-zero output and loops outside evaluated bounds', () => {
		const identity = parseExpression('z');
		expect(
			estimateWinding(identity, circle(1e-8), {
				minimumSamples: 16,
				maximumSamples: 64,
				minimumModulus: 1e-6
			})
		).toMatchObject({ ok: false, reason: 'near-zero' });

		expect(
			estimateWinding(identity, circle(2), {
				bounds: { minRe: -1, maxRe: 1, minIm: -1, maxIm: 1 }
			})
		).toMatchObject({ ok: false, reason: 'outside-domain', samples: 0 });
	});

	it('reports under-resolution rather than returning an aliased integer', () => {
		const result = estimateWinding(parseExpression('z^20'), circle(1), {
			minimumSamples: 16,
			maximumSamples: 16,
			maximumPhaseStep: Math.PI / 4
		});
		expect(result).toMatchObject({ ok: false, reason: 'under-resolved', samples: 0 });
		if (!result.ok) expect(result.detail).toMatch(/explicit algebraic winding bound/i);
	});

	it('uses recursive midpoint chord error even when the leaf phase-step limit is permissive', () => {
		const result = estimateWinding(parseExpression('exp(5*log(z))'), circle(1), {
			minimumSamples: 16,
			maximumSamples: 16,
			maximumPhaseStep: Math.PI
		});
		expect(result).toMatchObject({ ok: false, reason: 'under-resolved', samples: 16 });
		if (!result.ok) expect(result.detail).toMatch(/midpoint/i);
	});

	it('breaks exact dyadic aliases with a coprime audit grid and refuses beyond its budget', () => {
		const recovered = estimateWinding(parseExpression('z^256'), circle(1), {
			minimumSamples: 64,
			maximumSamples: 4_096
		});
		expect(recovered).toMatchObject({ ok: true, integer: 256, samples: 4_096 });

		const refused = estimateWinding(parseExpression('z^256'), circle(1), {
			minimumSamples: 64,
			maximumSamples: 256
		});
		expect(refused).toMatchObject({ ok: false, reason: 'under-resolved', samples: 0 });
		if (!refused.ok) expect(refused.detail).toMatch(/explicit algebraic winding bound/i);

		const enormous = estimateWinding(parseExpression('z^551665920'), circle(1));
		expect(enormous).toMatchObject({ ok: false, reason: 'under-resolved', samples: 0 });
	});
});
