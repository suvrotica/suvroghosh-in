import { describe, expect, it } from 'vitest';
import {
	DEFAULT_STATE,
	FAMILIES,
	MAX_ENCODED_STATE_LENGTH,
	MIN_SPAN,
	PALETTES,
	PRESETS,
	decodeState,
	defaultForFamily,
	encodeState,
	iterate2D,
	minimumSpan,
	normalizeState,
	paletteRGB,
	panView,
	pointAt,
	regularRoots,
	varyState,
	zoomAt
} from './model';

describe('Fractal Trip bounded model', () => {
	it('keeps independent mutable roots for each new view', () => {
		const first = defaultForFamily('newton');
		first.roots[0].re = -2;
		expect(defaultForFamily('newton').roots[0].re).toBe(1);
		expect(DEFAULT_STATE.roots[0].re).toBe(1);
	});

	it('rejects nonnumeric and nonfinite values, while clamping finite input', () => {
		const state = normalizeState({
			version: 1,
			family: 'mandelbulb',
			power: 99,
			seedRe: Infinity,
			seedIm: '-1.2',
			seedZ: -99,
			bulbJulia: 'false',
			span: -1,
			speed: NaN,
			foldScale: 0,
			foldLimit: 500,
			minRadius: -7,
			quality: 'unbounded',
			palette: '<script>',
			pitch: 50,
			distance: 0,
			roots: Array.from({ length: 10000 }, () => ({ re: 0, im: 0 }))
		});
		expect(state.power).toBe(10);
		expect(state.seedRe).toBe(defaultForFamily('mandelbulb').seedRe);
		expect(state.seedIm).toBe(defaultForFamily('mandelbulb').seedIm);
		expect(state.seedZ).toBe(-2);
		expect(state.bulbJulia).toBe(false);
		expect(state.span).toBe(MIN_SPAN);
		expect(state.foldScale).toBe(-1.2);
		expect(state.foldLimit).toBe(1.5);
		expect(state.minRadius).toBe(0.2);
		expect(state.pitch).toBe(0.95);
		expect(state.distance).toBe(1.5);
		expect(state.roots).toHaveLength(3);
		expect(state.quality).toBe('auto');
		expect(PALETTES.some(({ id }) => id === state.palette)).toBe(true);
	});

	it('limits planar power, root counts and root coordinates', () => {
		const state = normalizeState({
			family: 'newton',
			power: 40,
			relaxation: -1,
			roots: [{ re: 4, im: -3 }, { re: NaN, im: 0 }, null]
		});
		expect(state.power).toBe(8);
		expect(state.relaxation).toBe(0.25);
		expect(state.roots[0]).toEqual({ re: 2, im: -2 });
		expect(state.roots[1].re).toBeCloseTo(-0.5);
		expect(regularRoots(Infinity)).toHaveLength(3);
		expect(regularRoots(1000)).toHaveLength(6);
	});

	it('round-trips all family settings through a bounded URL-safe state', () => {
		for (const family of FAMILIES) {
			const state = normalizeState({
				...defaultForFamily(family.id),
				roots: regularRoots(6),
				rotation: 1.2,
				journeyTime: 24
			});
			const encoded = encodeState(state);
			expect(encoded.length).toBeLessThan(MAX_ENCODED_STATE_LENGTH);
			expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
			expect(decodeState(encoded)).toEqual(state);
		}
	});

	it('rejects malformed, oversized and unsupported links', () => {
		for (const encoded of [
			null,
			'',
			'?bad',
			'!!!',
			'a',
			'x'.repeat(MAX_ENCODED_STATE_LENGTH + 1),
			btoa('null'),
			btoa('{}'),
			btoa(JSON.stringify({ version: 2, family: 'julia' })).replace(/=+$/, ''),
			btoa(JSON.stringify({ version: 1, family: 'unknown' })).replace(/=+$/, '')
		]) {
			expect(decodeState(encoded)).toBeNull();
		}
		expect(normalizeState({ version: 999, family: 'newton' })).toEqual(
			defaultForFamily('mandelbrot')
		);
	});

	it('does not carry unrecognised fields into runtime state', () => {
		const state = normalizeState(
			JSON.parse('{"family":"julia","shader":"bad","__proto__":{"polluted":true}}')
		);
		expect(Object.keys(state)).not.toContain('shader');
		expect(Object.keys(state)).not.toContain('__proto__');
		expect('polluted' in state).toBe(false);
	});

	it('supplies five finite colours for every palette', () => {
		for (const palette of PALETTES) {
			const values = paletteRGB(palette.id);
			expect(values).toHaveLength(5);
			for (const channel of values.flat()) {
				expect(channel).toBeGreaterThanOrEqual(0);
				expect(channel).toBeLessThanOrEqual(1);
			}
		}
	});

	it('keeps presets and deterministic variations within supported settings', () => {
		for (const preset of PRESETS) {
			expect(normalizeState(preset.state)).toEqual(preset.state);
			const varied = varyState(preset.state, () => 0.75);
			expect(varied.family).toBe(preset.family);
			expect(varied).toEqual(varyState(preset.state, () => 0.75));
			expect(varied).toEqual(normalizeState(varied));
		}
	});
});

describe('Fractal Trip pointer coordinates and finite precision', () => {
	it('anchors zoom under the pointer even when rotated', () => {
		const state = { ...defaultForFamily('julia'), rotation: Math.PI / 3 };
		const before = pointAt(state, 0.2, 0.7, 16 / 9);
		const next = zoomAt(state, 0.2, 0.7, 0.4, 16 / 9);
		const after = pointAt(next, 0.2, 0.7, 16 / 9);
		expect(after.re).toBeCloseTo(before.re, 12);
		expect(after.im).toBeCloseTo(before.im, 12);
		expect(next.span).toBeCloseTo(state.span * 0.4);
	});

	it('makes a dragged image follow the pointer', () => {
		const state = defaultForFamily('julia');
		const next = panView(state, 0.1, 0.2, 2);
		expect(next.centerRe).toBeCloseTo(-0.64);
		expect(next.centerIm).toBeCloseTo(0.64);
		const before = pointAt(state, 0.5, 0.5, 2);
		const after = pointAt(next, 0.6, 0.7, 2);
		expect(after.re).toBeCloseTo(before.re, 12);
		expect(after.im).toBeCloseTo(before.im, 12);
	});

	it('bounds impossible navigation and makes float spacing explicit', () => {
		let state = defaultForFamily('mandelbrot');
		for (let i = 0; i < 30; i++) state = zoomAt(state, 0.5, 0.5, 0.1, 1);
		expect(state.span).toBe(MIN_SPAN);
		expect(minimumSpan(state, 1080)).toBeGreaterThan(MIN_SPAN);
		expect(minimumSpan({ ...state, centerRe: 3 }, 1080)).toBeGreaterThan(minimumSpan(state, 1080));
		const badGesture = zoomAt(state, NaN, Infinity, NaN, NaN);
		expect(Number.isFinite(badGesture.centerRe)).toBe(true);
		expect(Number.isFinite(badGesture.centerIm)).toBe(true);
	});
});

describe('Fractal Trip numerical reference', () => {
	it('keeps known bounded Mandelbrot orbits and detects an escaping one', () => {
		const state = defaultForFamily('mandelbrot');
		expect(iterate2D(state, { re: 0, im: 0 }, 64).escaped).toBe(false);
		expect(iterate2D(state, { re: -1, im: 0 }, 64).value).toEqual({ re: 0, im: 0 });
		expect(iterate2D(state, { re: 2, im: 0 }, 64).escaped).toBe(true);
	});

	it('uses the pixel as Julia initial value and the seed as its fixed parameter', () => {
		const state = { ...defaultForFamily('julia'), seedRe: 0, seedIm: 0 };
		expect(iterate2D(state, { re: 0.5, im: 0 }, 1).value.re).toBeCloseTo(0.25);
		expect(iterate2D(state, { re: 2, im: 0 }, 32).escaped).toBe(true);
	});

	it('conjugates and folds before exponentiation', () => {
		const point = { re: -0.5, im: 0.5 };
		const tricorn = iterate2D(defaultForFamily('tricorn'), point, 2);
		const ship = iterate2D(defaultForFamily('burning-ship'), point, 2);
		expect(tricorn.value.re).toBeCloseTo(-0.5);
		expect(tricorn.value.im).toBeCloseTo(1);
		expect(ship.value.re).toBeCloseTo(-0.5);
		expect(ship.value.im).toBeCloseTo(1);
		const ordinary = iterate2D(defaultForFamily('mandelbrot'), point, 2);
		expect(ordinary.value.im).toBeCloseTo(0);
	});

	it('respects integer power and Newton roots and handles zero derivatives', () => {
		const cubic = { ...defaultForFamily('julia'), power: 3, seedRe: 0, seedIm: 0 };
		expect(iterate2D(cubic, { re: 0, im: 1 }, 1).value).toEqual({ re: 0, im: -1 });
		const newton = defaultForFamily('newton');
		expect(iterate2D(newton, { re: 1, im: 0 }).rootIndex).toBe(0);
		expect(iterate2D(newton, { re: 1.2, im: 0.1 }).converged).toBe(true);
		const singular = iterate2D(newton, { re: 0, im: 0 });
		expect(singular.converged).toBe(false);
		expect(Number.isFinite(singular.value.re)).toBe(true);
		expect(() => iterate2D(defaultForFamily('mandelbulb'), { re: 0, im: 0 })).toThrow();
	});
});
