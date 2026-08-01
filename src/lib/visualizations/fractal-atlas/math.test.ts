import { describe, expect, it } from 'vitest';
import {
	addComplex,
	burningShipStep,
	conjugateComplex,
	divideComplex,
	evaluatePolynomialAndDerivative,
	integerPower,
	iterateEscapeOrbit,
	iterateJulia,
	iterateMandelbrot,
	iterateMultibrot,
	iterateNewton,
	iteratePhoenix,
	magnitudeSquared,
	multiplyComplex,
	rootsOfUnity,
	smoothEscapeIteration,
	subtractComplex,
	tricornStep
} from './math';

describe('Fractal Atlas complex arithmetic', () => {
	it('performs the core arithmetic without mutating operands', () => {
		const left = { re: 3, im: 2 };
		const right = { re: 1, im: -4 };
		expect(addComplex(left, right)).toEqual({ re: 4, im: -2 });
		expect(subtractComplex(left, right)).toEqual({ re: 2, im: 6 });
		expect(multiplyComplex(left, right)).toEqual({ re: 11, im: -10 });
		expect(divideComplex(left, right).re).toBeCloseTo(-5 / 17);
		expect(divideComplex(left, right).im).toBeCloseTo(14 / 17);
		expect(divideComplex({ re: 1, im: 1 }, { re: 1e200, im: 1e200 })).toEqual({
			re: 1e-200,
			im: 0
		});
		expect(conjugateComplex(left)).toEqual({ re: 3, im: -2 });
		expect(magnitudeSquared(left)).toBe(13);
		expect(left).toEqual({ re: 3, im: 2 });
	});

	it('uses exponentiation by squaring for integer powers', () => {
		expect(integerPower({ re: 1, im: 1 }, 3)).toEqual({ re: -2, im: 2 });
		expect(integerPower({ re: 4, im: 0 }, -1)).toEqual({ re: 0.25, im: 0 });
		expect(() => integerPower({ re: 1, im: 0 }, 1.5)).toThrow(RangeError);
		expect(() => integerPower({ re: 1, im: 0 }, Number.MAX_VALUE)).toThrow(RangeError);
	});
});

describe('escape-family orbits', () => {
	it('records whether a pixel supplied c or z₀ for every dual-plane family', () => {
		for (const family of ['multibrot', 'burning-ship', 'tricorn'] as const) {
			const parameter = iterateEscapeOrbit({
				family,
				plane: 'parameter',
				pixel: { re: -0.25, im: 0.5 },
				bailout: 7,
				maxIterations: 1,
				periodicity: false
			});
			expect(parameter).toMatchObject({
				plane: 'parameter',
				pixel: { re: -0.25, im: 0.5 },
				c: { re: -0.25, im: 0.5 },
				bailout: 7
			});
			expect(parameter.orbit[0].value).toEqual({ re: 0, im: 0 });

			const dynamical = iterateEscapeOrbit({
				family,
				plane: 'dynamical',
				pixel: { re: 0.25, im: -0.5 },
				c: { re: -0.7, im: 0.2 },
				maxIterations: 1,
				periodicity: false
			});
			expect(dynamical).toMatchObject({
				plane: 'dynamical',
				pixel: { re: 0.25, im: -0.5 },
				c: { re: -0.7, im: 0.2 }
			});
			expect(dynamical.orbit[0].value).toEqual({ re: 0.25, im: -0.5 });
		}
	});

	it('keeps c = 0 at the quadratic fixed point', () => {
		const result = iterateMandelbrot({ re: 0, im: 0 }, { maxIterations: 20 });
		expect(result.plane).toBe('parameter');
		expect(result.c).toEqual({ re: 0, im: 0 });
		expect(result.status).toBe('periodic');
		expect(result.period).toBe(1);
		expect(result.periodDetection).toMatchObject({
			enabled: true,
			transientIterations: 8,
			requiredMatchingCycles: 3,
			matchingCycles: 3
		});
		expect(result.orbit.slice(0, 2).map((point) => point.value)).toEqual([
			{ re: 0, im: 0 },
			{ re: 0, im: 0 }
		]);
	});

	it('records the finite c = -1 period-two sequence accurately', () => {
		const result = iterateMandelbrot({ re: -1, im: 0 }, { maxIterations: 20 });
		expect(result.status).toBe('periodic');
		expect(result.period).toBe(2);
		expect(result.periodDetection?.matchingCycles).toBe(3);
		expect(result.orbit.slice(0, 4).map((point) => point.value)).toEqual([
			{ re: 0, im: 0 },
			{ re: -1, im: 0 },
			{ re: 0, im: 0 },
			{ re: -1, im: 0 }
		]);
	});

	it('honours the period detector transient, tolerance, and matching-cycle requirement', () => {
		const result = iterateMandelbrot(
			{ re: -1, im: 0 },
			{
				maxIterations: 20,
				periodicityTransient: 2,
				periodicityMatchingCycles: 2,
				periodicityTolerance: 1e-10
			}
		);
		expect(result.status).toBe('periodic');
		expect(result.period).toBe(2);
		expect(result.periodDetection).toEqual({
			enabled: true,
			tolerance: 1e-10,
			transientIterations: 2,
			requiredMatchingCycles: 2,
			matchingCycles: 2
		});

		const disabled = iterateMandelbrot({ re: 0, im: 0 }, { maxIterations: 12, periodicity: false });
		expect(disabled.status).toBe('max-iterations');
		expect(disabled.periodDetection).toMatchObject({ enabled: false, matchingCycles: 0 });
	});

	it('confirms complete matching cycles in the Decimal quadratic path', () => {
		const result = iterateEscapeOrbit({
			family: 'mandelbrot',
			plane: 'parameter',
			pixel: { re: -1, im: 0 },
			pixelDecimal: { re: '-1.0000000000000000000000000000', im: '0' },
			maxIterations: 20
		});
		expect(result.status).toBe('periodic');
		expect(result.period).toBe(2);
		expect(result.periodDetection?.matchingCycles).toBe(3);
		expect(result.valueDecimal).toBeDefined();
	});

	it('detects rapid escape and produces a finite smooth count', () => {
		const result = iterateMandelbrot(
			{ re: 2, im: 0 },
			{ maxIterations: 20, periodicity: false, maxRecordedPoints: 1 }
		);
		expect(result.status).toBe('escaped');
		expect(result.iterations).toBe(2);
		expect(result.value).toEqual({ re: 6, im: 0 });
		expect(result.maximumMagnitude).toBe(6);
		expect(result.smoothIteration).toSatisfy(Number.isFinite);
		expect(smoothEscapeIteration(2, 6, 2)).toSatisfy(Number.isFinite);
	});

	it('distinguishes Julia starting points for c = 0', () => {
		const inside = iterateJulia(
			{ re: 0.5, im: 0 },
			{ re: 0, im: 0 },
			{ maxIterations: 20, periodicity: false }
		);
		const outside = iterateJulia(
			{ re: 1.1, im: 0 },
			{ re: 0, im: 0 },
			{ maxIterations: 20, periodicity: false }
		);
		expect(inside.status).toBe('max-iterations');
		expect(outside.status).toBe('escaped');
	});

	it('keeps selected Mandelbrot parameters distinct below the Number ULP', () => {
		const firstExact = { re: '-0.7436438870371510001', im: '0.131825904205330001' };
		const secondExact = { re: '-0.7436438870371510002', im: '0.131825904205330001' };
		expect(Number(firstExact.re)).toBe(Number(secondExact.re));

		const pixelShadow = { re: Number(firstExact.re), im: Number(firstExact.im) };
		const first = iterateEscapeOrbit({
			family: 'mandelbrot',
			plane: 'parameter',
			pixel: pixelShadow,
			pixelDecimal: firstExact,
			maxIterations: 2,
			bailout: 100,
			periodicity: false
		});
		const second = iterateEscapeOrbit({
			family: 'mandelbrot',
			plane: 'parameter',
			pixel: pixelShadow,
			pixelDecimal: secondExact,
			maxIterations: 2,
			bailout: 100,
			periodicity: false
		});

		expect(first.pixel).toEqual(second.pixel);
		expect(first.pixelDecimal).toEqual(firstExact);
		expect(second.pixelDecimal).toEqual(secondExact);
		expect(first.cDecimal).toEqual(firstExact);
		expect(second.cDecimal).toEqual(secondExact);
		expect(first.orbit[2].valueDecimal?.re).not.toBe(second.orbit[2].valueDecimal?.re);
		expect(first.valueDecimal).not.toEqual(second.valueDecimal);
		expect(first.decimalPrecision).toBeGreaterThanOrEqual(64);
	});

	it('uses an exact Julia parameter even when its Number shadow is unchanged', () => {
		const firstC = { re: '-0.8000000000000000001', im: '0.1560000000000000001' };
		const secondC = { re: '-0.8000000000000000002', im: '0.1560000000000000001' };
		expect(Number(firstC.re)).toBe(Number(secondC.re));
		const cShadow = { re: Number(firstC.re), im: Number(firstC.im) };
		const common = {
			family: 'julia' as const,
			plane: 'dynamical' as const,
			pixel: { re: 0, im: 0 },
			pixelDecimal: { re: '0', im: '0' },
			c: cShadow,
			maxIterations: 1,
			bailout: 100,
			periodicity: false
		};
		const first = iterateEscapeOrbit({ ...common, cDecimal: firstC });
		const second = iterateEscapeOrbit({ ...common, cDecimal: secondC });

		expect(first.c).toEqual(second.c);
		expect(first.cDecimal).toEqual(firstC);
		expect(second.cDecimal).toEqual(secondC);
		expect(first.orbit[1].valueDecimal).toEqual(firstC);
		expect(second.orbit[1].valueDecimal).toEqual(secondC);
		expect(first.value).toEqual(second.value);
		expect(first.valueDecimal).not.toEqual(second.valueDecimal);

		const firstStart = { re: '0.12345678901234567001', im: '0' };
		const secondStart = { re: '0.12345678901234567002', im: '0' };
		expect(Number(firstStart.re)).toBe(Number(secondStart.re));
		const startShadow = { re: Number(firstStart.re), im: 0 };
		const firstStartOrbit = iterateEscapeOrbit({
			...common,
			pixel: startShadow,
			pixelDecimal: firstStart,
			c: { re: 0, im: 0 },
			cDecimal: { re: '0', im: '0' }
		});
		const secondStartOrbit = iterateEscapeOrbit({
			...common,
			pixel: startShadow,
			pixelDecimal: secondStart,
			c: { re: 0, im: 0 },
			cDecimal: { re: '0', im: '0' }
		});
		expect(firstStartOrbit.pixel).toEqual(secondStartOrbit.pixel);
		expect(firstStartOrbit.orbit[0].valueDecimal).toEqual(firstStart);
		expect(secondStartOrbit.orbit[0].valueDecimal).toEqual(secondStart);
		expect(firstStartOrbit.valueDecimal).not.toEqual(secondStartOrbit.valueDecimal);
	});

	it('applies the Multibrot degree, Burning Ship fold, and Tricorn conjugation in order', () => {
		const cubic = iterateMultibrot({ re: 0, im: 0 }, 3, {
			start: { re: 1, im: 1 },
			maxIterations: 1,
			bailout: 100,
			periodicity: false
		});
		expect(cubic.value).toEqual({ re: -2, im: 2 });
		expect(burningShipStep({ re: -1, im: -2 }, { re: 0, im: 0 })).toEqual({
			re: -3,
			im: 4
		});
		expect(tricornStep({ re: 1, im: 2 }, { re: 0, im: 0 })).toEqual({
			re: -3,
			im: -4
		});
	});

	it('updates Phoenix memory only after using the previous iterate', () => {
		const result = iteratePhoenix(
			{ re: 1, im: 0 },
			{ re: 0, im: 0 },
			{ re: 0.5, im: 0 },
			{ maxIterations: 2, bailout: 100, periodicity: false }
		);
		expect(result.orbit.map((point) => point.value.re)).toEqual([1, 1, 1.5]);
		expect(result.orbit[1].previous).toEqual({ re: 1, im: 0 });
		expect(result.orbit[2].previous).toEqual({ re: 1, im: 0 });
	});

	it('checks the full two-step Phoenix state before declaring a period', () => {
		const result = iteratePhoenix(
			{ re: 0, im: 0 },
			{ re: -1, im: 0 },
			{ re: 1, im: 0 },
			{
				previous: { re: 1, im: 0 },
				maxIterations: 3,
				bailout: 100
			}
		);
		expect(result.value).toEqual({ re: 0, im: 0 });
		expect(result.status).toBe('max-iterations');
	});
});

describe('polynomial and Newton arithmetic', () => {
	const cubicMinusOne = [
		{ re: 1, im: 0 },
		{ re: 0, im: 0 },
		{ re: 0, im: 0 },
		{ re: -1, im: 0 }
	];

	it('evaluates a polynomial and derivative together with Horner arithmetic', () => {
		const result = evaluatePolynomialAndDerivative(cubicMinusOne, { re: 2, im: 0 });
		expect(result.value).toEqual({ re: 7, im: 0 });
		expect(result.derivative).toEqual({ re: 12, im: 0 });
	});

	it('converges to and classifies a known cube root of unity', () => {
		const roots = rootsOfUnity(3);
		const result = iterateNewton({ re: 0.8, im: 0.2 }, cubicMinusOne, {
			roots,
			maxIterations: 40
		});
		expect(result.status).toBe('converged');
		expect(result.rootIndex).toBe(0);
		expect(result.value.re).toBeCloseTo(1, 8);
		expect(result.value.im).toBeCloseTo(0, 8);
		expect(result.residual).toBeLessThanOrEqual(1e-8);
		expect(result.orbit[0]).toMatchObject({
			nearestRootIndex: 0
		});
		expect(result.orbit[0].residual).toBeGreaterThan(result.orbit.at(-1)?.residual ?? 0);
		expect(result.orbit[0].nearestRootDistance).toBeGreaterThan(
			result.orbit.at(-1)?.nearestRootDistance ?? 0
		);
		expect(
			result.orbit.every(
				(point) =>
					point.derivativeMagnitude !== undefined && Number.isFinite(point.derivativeMagnitude)
			)
		).toBe(true);
		expect(
			result.orbit.every((point) => point.residual !== undefined && Number.isFinite(point.residual))
		).toBe(true);
	});

	it('records hand-checkable Newton diagnostics on every iterate', () => {
		const result = iterateNewton({ re: 2, im: 0 }, cubicMinusOne, {
			maxIterations: 20
		});
		expect(result.orbit[0]).toMatchObject({
			value: { re: 2, im: 0 },
			residual: 7,
			derivativeMagnitude: 12,
			nearestRootIndex: 0,
			nearestRootDistance: 1
		});
		expect(result.orbit.at(-1)?.nearestRootIndex).toBe(result.rootIndex);
		expect(result.orbit.at(-1)?.nearestRootDistance).toBeLessThan(1e-5);
	});

	it('infers every root marker for the structured zᵈ − 1 polynomial', () => {
		const result = iterateNewton({ re: 0.8, im: 0.2 }, cubicMinusOne, {
			maxIterations: 40,
			convergenceTolerance: 1e-10
		});
		expect(result.roots).toHaveLength(3);
		expect(result.rootIndex).toBe(0);
		expect(result.root).toEqual({ re: 1, im: 0 });
		expect(result.convergenceTolerance).toBe(1e-10);
	});

	it('reports a zero derivative without propagating NaN', () => {
		const result = iterateNewton({ re: 0, im: 0 }, cubicMinusOne);
		expect(result.status).toBe('derivative-zero');
		expect(result.value).toEqual({ re: 0, im: 0 });
		expect(result.residual).toBe(1);
		expect(result.orbit[0]).toMatchObject({
			residual: 1,
			derivativeMagnitude: 0
		});
	});
});
