import { describe, expect, it } from 'vitest';
import {
	addDoubleSingle,
	doubleSingleComplexToNumber,
	doubleSingleCoordinateGridCollapses,
	doubleSingleToNumber,
	multiplyComplexDoubleSingle,
	multiplyDoubleSingle,
	splitComplexDoubleSingle,
	splitDecimalDoubleSingle,
	splitDoubleSingle
} from './double-single';

describe('double-single arithmetic', () => {
	it('preserves a viewport offset that a single float32 coordinate loses', () => {
		const center = Math.fround(-0.743643887037151);
		const offset = 2.5e-9;
		expect(Math.fround(center + offset)).toBe(center);

		// The viewport centre itself is split from its JavaScript double. This is
		// exactly what the renderer uploads as hi/lo uniforms.
		const preciseCenter = splitDoubleSingle(-0.743643887037151);
		const represented = doubleSingleToNumber(
			addDoubleSingle(preciseCenter, splitDoubleSingle(offset))
		);
		expect(represented).not.toBe(doubleSingleToNumber(splitDoubleSingle(-0.743643887037151)));
		expect(represented).toBeCloseTo(-0.743643887037151 + offset, 14);
	});

	it('uses compensated products for real and complex multiplication', () => {
		const a = splitDoubleSingle(1.0000001192092896);
		const b = splitDoubleSingle(0.9999999403953552);
		const product = doubleSingleToNumber(multiplyDoubleSingle(a, b));
		expect(Math.abs(product - 1.0000000596046377)).toBeLessThan(2e-14);

		const complex = doubleSingleComplexToNumber(
			multiplyComplexDoubleSingle(
				splitComplexDoubleSingle(0.743643887037151, -0.13182590420533),
				splitComplexDoubleSingle(-0.371, 0.219)
			)
		);
		expect(complex.re).toBeCloseTo(-0.24702200906981575, 13);
		expect(complex.im).toBeCloseTo(0.21176542172131352, 13);
	});

	it('keeps a two-dimensional pixel grid after float32 has collapsed', () => {
		expect(
			doubleSingleCoordinateGridCollapses(-0.743643887037151, 0.13182590420533, 2.4e-10, 0, 500)
		).toBe(false);
		expect(
			doubleSingleCoordinateGridCollapses(-0.743643887037151, 0.13182590420533, 2.4e-17, 0, 500)
		).toBe(true);
	});

	it('uses the authoritative decimal string ahead of its compatibility fallback', () => {
		const exact = splitDecimalDoubleSingle('-0.74364388703715100792301305236157', 0);

		expect(exact.hi).not.toBe(0);
		expect(doubleSingleToNumber(exact)).toBeCloseTo(-0.743643887037151, 14);
		expect(splitDecimalDoubleSingle('not-a-number', 0.25)).toEqual(splitDoubleSingle(0.25));
	});
});
