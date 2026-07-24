import { describe, expect, it } from 'vitest';
import { complex, evaluateExpression } from './complex';
import { domainColor, hueFromPhase } from './color';
import { expressionToGlsl, parseExpression } from './expression';
import { DOMAIN_COLORING_PRESETS } from './presets';
import { panViewport, screenToComplex, viewportBounds, zoomViewport } from './viewport';

describe('domain-colouring expression language', () => {
	it('evaluates the identity at representative complex values', () => {
		const identity = parseExpression('z');
		expect(evaluateExpression(identity, complex(1))).toEqual(complex(1));
		expect(evaluateExpression(identity, complex(0, 1))).toEqual(complex(0, 1));
	});

	it('keeps exponentiation right-associative and unary minus outside a power', () => {
		expect(evaluateExpression(parseExpression('2^3^2'), complex(0)).re).toBe(512);
		expect(evaluateExpression(parseExpression('-z^2'), complex(2)).re).toBe(-4);
		expect(evaluateExpression(parseExpression('z^-2'), complex(2)).re).toBeCloseTo(0.25);
	});

	it('handles division by zero deliberately without throwing', () => {
		const result = evaluateExpression(parseExpression('1 / z'), complex(0));
		expect(Number.isFinite(result.re) && Number.isFinite(result.im)).toBe(false);
	});

	it('finds the known zeros of the roots-of-unity preset', () => {
		const expression = parseExpression('z^3 - 1');
		for (const root of [
			complex(1),
			complex(-0.5, Math.sqrt(3) / 2),
			complex(-0.5, -Math.sqrt(3) / 2)
		]) {
			const value = evaluateExpression(expression, root);
			expect(Math.hypot(value.re, value.im)).toBeLessThan(1e-12);
		}
	});

	it('supports every documented preset and emits only generated GLSL calls', () => {
		for (const preset of DOMAIN_COLORING_PRESETS) {
			const glsl = expressionToGlsl(parseExpression(preset.expression));
			expect(glsl.length).toBeGreaterThan(0);
			expect(glsl).not.toMatch(/[;{}]/);
		}
	});

	it('rejects unsafe or unsupported notation with reader-facing feedback', () => {
		expect(() => parseExpression('window.alert(1)')).toThrow(/not part|not available/i);
		expect(() => parseExpression('2z')).toThrow(/operator/i);
		expect(() => parseExpression('sinh(z)')).toThrow(/not available/i);
	});
});

describe('domain colour mapping', () => {
	it('wraps phase continuously at negative and positive pi', () => {
		const epsilon = 1e-9;
		expect(hueFromPhase(Math.PI - epsilon)).toBeCloseTo(hueFromPhase(-Math.PI + epsilon), 8);
	});

	it('distinguishes zeros, poles, and undefined values without throwing', () => {
		expect(domainColor(complex(0)).kind).toBe('zero');
		expect(domainColor(complex(1e20)).kind).toBe('pole');
		expect(domainColor(complex(Number.POSITIVE_INFINITY)).kind).toBe('undefined');
	});
});

describe('complex-plane viewport', () => {
	const viewport = { centerRe: 0, centerIm: 0, spanIm: 4 };

	it('preserves equal real and imaginary scale on a rectangular canvas', () => {
		const bounds = viewportBounds(viewport, 800, 400);
		expect(bounds.maxRe - bounds.minRe).toBe(8);
		expect(bounds.maxIm - bounds.minIm).toBe(4);
	});

	it('keeps the complex point under the cursor fixed while zooming', () => {
		const cursor = { x: 630, y: 90 };
		const before = screenToComplex(viewport, cursor.x, cursor.y, 800, 400);
		const zoomed = zoomViewport(viewport, cursor.x, cursor.y, 800, 400, 0.4);
		const after = screenToComplex(zoomed, cursor.x, cursor.y, 800, 400);
		expect(after.re).toBeCloseTo(before.re);
		expect(after.im).toBeCloseTo(before.im);
	});

	it('converts screen dragging into a stable plane translation', () => {
		const panned = panViewport(viewport, 100, -50, 800, 400);
		expect(panned.centerRe).toBe(-1);
		expect(panned.centerIm).toBe(-0.5);
	});
});
