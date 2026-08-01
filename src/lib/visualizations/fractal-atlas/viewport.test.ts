import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
	boundedGridValues,
	complexToScreen,
	decimalComplexToScreen,
	estimateViewportPrecision,
	panViewport,
	screenToComplex,
	screenToDecimalComplex,
	viewportBounds,
	zoomToRectangle,
	zoomViewport
} from './viewport';
import type { FractalViewport } from './types';

const viewport: FractalViewport = {
	center: { re: -0.5, im: 0.25 },
	spanY: 2,
	rotation: 0
};

describe('Fractal Atlas viewport transforms', () => {
	it('maps the canvas centre and aspect-correct corners', () => {
		expect(screenToComplex(viewport, 400, 200, 800, 400)).toEqual(viewport.center);
		expect(screenToComplex(viewport, 0, 0, 800, 400)).toEqual({ re: -2.5, im: 1.25 });
		expect(screenToComplex(viewport, 800, 400, 800, 400)).toEqual({
			re: 1.5,
			im: -0.75
		});
	});

	it('round-trips rotated complex and screen coordinates', () => {
		const rotated = { ...viewport, rotation: Math.PI / 5 };
		const source = { x: 213.5, y: 97.25 };
		const value = screenToComplex(rotated, source.x, source.y, 640, 360);
		const restored = complexToScreen(rotated, value, 640, 360);
		expect(restored.x).toBeCloseTo(source.x, 10);
		expect(restored.y).toBeCloseTo(source.y, 10);
	});

	it('keeps the cursor-anchored complex coordinate fixed during zoom', () => {
		const before = screenToComplex(viewport, 123, 275, 800, 400);
		const zoomed = zoomViewport(viewport, 123, 275, 800, 400, 0.25);
		const after = screenToComplex(zoomed, 123, 275, 800, 400);
		expect(after.re).toBeCloseTo(before.re, 13);
		expect(after.im).toBeCloseTo(before.im, 13);
		expect(zoomed.spanY).toBe(0.5);
	});

	it('propagates decimal-string centres after Number pan and zoom have collapsed', () => {
		const deep: FractalViewport = {
			center: { re: 1, im: 1 },
			centerDecimal: {
				re: '1.0000000000000000000000000000000000001',
				im: '0.9999999999999999999999999999999999999'
			},
			spanY: 1e-25,
			rotation: 0
		};
		const panned = panViewport(deep, 100, 0, 1_000, 1_000);
		expect(panned.center.re).toBe(1);
		expect(panned.centerDecimal?.re).not.toBe(deep.centerDecimal?.re);
		expect(new Decimal(panned.centerDecimal!.re).minus(deep.centerDecimal!.re).toString()).toBe(
			'-1e-26'
		);

		const zoomed = zoomViewport(deep, 750, 500, 1_000, 1_000, 0.5);
		expect(zoomed.center.re).toBe(1);
		expect(new Decimal(zoomed.centerDecimal!.re).minus(deep.centerDecimal!.re).toString()).toBe(
			'1.25e-26'
		);
	});

	it('keeps deep left and right screen probes distinct and round-trippable below a Number ULP', () => {
		const deep: FractalViewport = {
			center: { re: -0.743643887037151, im: 0.13182590420533 },
			centerDecimal: {
				re: '-0.74364388703715100792301305236157',
				im: '0.13182590420532999943598128774412'
			},
			spanY: 1e-18,
			rotation: Math.PI / 11
		};
		const left = screenToDecimalComplex(deep, 410, 500, 1_000, 1_000);
		const right = screenToDecimalComplex(deep, 590, 500, 1_000, 1_000);

		expect(left.re).not.toBe(right.re);
		expect(Number(left.re)).toBe(Number(right.re));
		expect(decimalComplexToScreen(deep, left, 1_000, 1_000).x).toBeCloseTo(410, 8);
		expect(decimalComplexToScreen(deep, left, 1_000, 1_000).y).toBeCloseTo(500, 8);
		expect(decimalComplexToScreen(deep, right, 1_000, 1_000).x).toBeCloseTo(590, 8);
		expect(decimalComplexToScreen(deep, right, 1_000, 1_000).y).toBeCloseTo(500, 8);
	});

	it('bounds grid generation when an absolute coordinate cannot absorb the requested step', () => {
		const collapsed = boundedGridValues(-0.7436438870371515, -0.7436438870371505, 1e-18);
		expect(collapsed.length).toBeLessThanOrEqual(1);

		const ordinary = boundedGridValues(-1, 1, 0.5);
		expect(ordinary).toEqual([-1, -0.5, 0, 0.5, 1]);
	});

	it('pans with screen drag direction and fits rectangular zooms', () => {
		const panned = panViewport(viewport, 100, -50, 800, 400);
		expect(panned.center.re).toBe(-1);
		expect(panned.center.im).toBe(0);

		const zoomed = zoomToRectangle(viewport, { x: 200, y: 100 }, { x: 600, y: 300 }, 800, 400);
		expect(zoomed.center).toEqual(viewport.center);
		expect(zoomed.spanY).toBe(1);
	});

	it('returns enclosing bounds for rotation and detects Number-coordinate collapse', () => {
		const bounds = viewportBounds(
			{ center: { re: 0, im: 0 }, spanY: 2, rotation: Math.PI / 4 },
			200,
			200
		);
		expect(bounds.minRe).toBeCloseTo(-Math.SQRT2);
		expect(bounds.maxRe).toBeCloseTo(Math.SQRT2);

		const precision = estimateViewportPrecision(
			{ center: { re: 1, im: 1 }, spanY: 1e-15, rotation: 0 },
			1000,
			1000
		);
		expect(precision.collapsedX).toBe(true);
		expect(precision.collapsedY).toBe(true);
	});
});
