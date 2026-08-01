import { describe, expect, it } from 'vitest';
import { iterateJulia, iterateMandelbrot } from '../math';
import { FRACTAL_STATE_VERSION, type FractalFamily, type FractalViewState } from '../types';
import { screenToComplex } from '../viewport';
import { renderCpuFractal } from './cpu';
import {
	evaluatePolynomial,
	findPolynomialRoots,
	MAX_PERTURBATION_SHADER_ITERATIONS,
	pixelToComplex,
	sampleFractalPoint
} from './math';
import { paletteStops, sampleCategoricalPalette } from './palette';
import {
	computeCpuRenderSize,
	computeRenderSize,
	cpuFallbackPixelBudget,
	floatCoordinateGridCollapses,
	MAX_RENDER_DIMENSION,
	progressiveWorkerBudget
} from './quality';
import { fractalFragmentSource, type FractalShaderVariant } from './shaders';

function state(family: FractalFamily = 'mandelbrot'): FractalViewState {
	return {
		version: FRACTAL_STATE_VERSION,
		family,
		plane: family === 'julia' || family === 'phoenix' ? 'dynamical' : 'parameter',
		center: { re: -0.5, im: 0 },
		spanY: 2.8,
		rotation: 0,
		maxIterations: 96,
		bailout: 2,
		exponent: 2,
		juliaC: { re: -0.123, im: 0.745 },
		phoenixP: { re: -0.5, im: 0 },
		phoenixPrevious: { re: 0, im: 0 },
		newtonRelaxation: 1,
		coloring: family === 'newton' ? 'root-basin' : 'smooth',
		paletteId: family === 'newton' ? 'categorical-roots' : 'observatory',
		paletteOffset: 0,
		paletteCycles: 1,
		interiorColor: '#05070D',
		orbitTrap: {
			kind: 'circle',
			position: { re: 0, im: 0 },
			radius: 0.5,
			spacing: 0.5,
			rotation: 0,
			mix: 1
		},
		polynomial: {
			coefficients: [
				{ re: 1, im: 0 },
				{ re: 0, im: 0 },
				{ re: 0, im: 0 },
				{ re: -1, im: 0 }
			]
		},
		seed: 20_260_731,
		renderQuality: 'balanced',
		precisionMode: 'auto',
		flipY: false,
		analyticInteriorTests: true,
		convergenceTolerance: 1e-6
	};
}

describe('fractal render sizing and coordinates', () => {
	it('keeps spanY vertical and derives the horizontal span from aspect ratio', () => {
		const viewport = state();
		viewport.center = { re: 0, im: 0 };
		viewport.spanY = 2;
		const rightEdge = pixelToComplex(viewport, 199.5, 49.5, 200, 100);
		const topEdge = pixelToComplex(viewport, 99.5, -0.5, 200, 100);
		expect(rightEdge.re).toBeCloseTo(2, 12);
		expect(rightEdge.im).toBeCloseTo(0, 12);
		expect(topEdge.re).toBeCloseTo(0, 12);
		expect(topEdge.im).toBeCloseTo(1, 12);
	});

	it('uses the shared viewport rotation convention', () => {
		const viewport = state();
		viewport.center = { re: 0.25, im: -0.75 };
		viewport.spanY = 3;
		viewport.rotation = Math.PI / 3;
		const pixel = { x: 81, y: 27 };
		const rendered = pixelToComplex(viewport, pixel.x - 0.5, pixel.y - 0.5, 200, 100);
		const shared = screenToComplex(viewport, pixel.x, pixel.y, 200, 100);
		expect(rendered.re).toBeCloseTo(shared.re, 12);
		expect(rendered.im).toBeCloseTo(shared.im, 12);
	});

	it('does not silently widen a deep CPU or PNG viewport', () => {
		const viewport = state();
		viewport.center = { re: 0, im: 0 };
		viewport.spanY = 1e-18;
		const rightEdge = pixelToComplex(viewport, 1.5, 0.5, 2, 2);
		expect(rightEdge.re).toBeGreaterThan(0);
		expect(rightEdge.re).toBeLessThanOrEqual(5e-19);
		expect(Math.abs(rightEdge.im)).toBeLessThanOrEqual(5e-19);
	});

	it('caps both high-quality and preview drawing buffers without changing aspect', () => {
		const full = computeRenderSize(3_840, 2_160, {
			devicePixelRatio: 3,
			quality: 'high',
			maxPixels: 1_000_000
		});
		const preview = computeRenderSize(3_840, 2_160, {
			devicePixelRatio: 3,
			quality: 'high',
			preview: true
		});
		expect(full.pixelCount).toBeLessThanOrEqual(1_000_000);
		expect(full.width / full.height).toBeCloseTo(16 / 9, 2);
		expect(preview.pixelCount).toBeLessThanOrEqual(786_432);
		expect(preview.pixelCount).toBeLessThan(full.pixelCount);
		const battery = computeRenderSize(3_840, 2_160, {
			devicePixelRatio: 3,
			quality: 'battery'
		});
		expect(battery.pixelCount).toBeLessThanOrEqual(393_216);
		expect(battery.pixelCount).toBeLessThan(preview.pixelCount);
	});

	it('treats custom pixel budgets as lower caps, never as unbounded overrides', () => {
		const gpu = computeRenderSize(8_000, 8_000, {
			devicePixelRatio: 3,
			quality: 'high',
			maxPixels: Number.MAX_SAFE_INTEGER
		});
		const cpu = computeCpuRenderSize(8_000, 8_000, {
			maxPixels: Number.MAX_SAFE_INTEGER
		});
		expect(gpu.pixelCount).toBeLessThanOrEqual(4_194_304);
		expect(cpu.pixelCount).toBeLessThanOrEqual(196_608);
	});

	it('caps pathological single-axis dimensions and detects a collapsed float32 grid', () => {
		const extreme = computeRenderSize(10_000_000, 1, { quality: 'high' });
		expect(extreme.width).toBeLessThanOrEqual(MAX_RENDER_DIMENSION);
		expect(extreme.height).toBeLessThanOrEqual(MAX_RENDER_DIMENSION);
		expect(floatCoordinateGridCollapses(-0.743643887, 0.131825904, 2.4e-13, 0, 500)).toBe(true);
		expect(floatCoordinateGridCollapses(-0.5, 0, 2.8, Math.PI / 5, 500)).toBe(false);
	});

	it('gives battery mode smaller CPU and progressive work budgets than draft', () => {
		const batteryPixels = cpuFallbackPixelBudget('battery');
		const draftPixels = cpuFallbackPixelBudget('draft');
		const batteryProgressive = progressiveWorkerBudget('battery');
		const draftProgressive = progressiveWorkerBudget('draft');

		expect(batteryPixels).toBeLessThan(draftPixels);
		expect(batteryProgressive.maxWidth).toBeLessThan(draftProgressive.maxWidth);
		expect(batteryProgressive.densitySampleCap).toBeLessThan(draftProgressive.densitySampleCap);
		expect(batteryProgressive.densityBatchSize).toBeLessThan(draftProgressive.densityBatchSize);
		expect(batteryProgressive.fernPointCap).toBeLessThan(draftProgressive.fernPointCap);
		expect(batteryProgressive.fernBatchSize).toBeLessThan(draftProgressive.fernBatchSize);
	});
});

describe('CPU escape-time and Newton sampling', () => {
	it('distinguishes bounded and escaping Mandelbrot and Julia points', () => {
		const mandelbrot = state('mandelbrot');
		expect(sampleFractalPoint(mandelbrot, { re: 0, im: 0 }).status).toBe('bounded');
		expect(sampleFractalPoint(mandelbrot, { re: 2, im: 0 }).status).toBe('escaped');

		const julia = state('julia');
		julia.juliaC = { re: 0, im: 0 };
		expect(['bounded', 'periodic']).toContain(sampleFractalPoint(julia, { re: 0, im: 0 }).status);
		expect(sampleFractalPoint(julia, { re: 2, im: 0 }).status).toBe('escaped');
	});

	it('matches inspector escape counts and smoothing, including an already-escaped z₀', () => {
		const mandelbrot = state('mandelbrot');
		const renderedMandelbrot = sampleFractalPoint(mandelbrot, { re: 2, im: 0 });
		const inspectedMandelbrot = iterateMandelbrot(
			{ re: 2, im: 0 },
			{ maxIterations: mandelbrot.maxIterations, bailout: mandelbrot.bailout }
		);
		expect(renderedMandelbrot.iterations).toBe(inspectedMandelbrot.iterations);
		expect(renderedMandelbrot.smoothIteration).toBeCloseTo(
			inspectedMandelbrot.smoothIteration!,
			12
		);

		const julia = state('julia');
		const renderedJulia = sampleFractalPoint(julia, { re: 3, im: 0 });
		const inspectedJulia = iterateJulia({ re: 3, im: 0 }, julia.juliaC, {
			maxIterations: julia.maxIterations,
			bailout: julia.bailout
		});
		expect(renderedJulia.iterations).toBe(0);
		expect(renderedJulia.iterations).toBe(inspectedJulia.iterations);
		expect(renderedJulia.smoothIteration).toBeCloseTo(inspectedJulia.smoothIteration!, 12);
	});

	it('measures escape-family traps from the first iterate and colours finite non-escapes', () => {
		const mandelbrot = state('mandelbrot');
		mandelbrot.coloring = 'orbit-trap';
		mandelbrot.analyticInteriorTests = true;
		mandelbrot.orbitTrap = {
			kind: 'point',
			position: { re: 0, im: 0 },
			radius: 0.5,
			spacing: 0.5,
			rotation: 0,
			mix: 1
		};
		const escaping = sampleFractalPoint(mandelbrot, { re: 1, im: 0 }, 8);
		expect(escaping.trapDistance).toBeCloseTo(1, 12);

		mandelbrot.center = { re: 0, im: 0 };
		mandelbrot.spanY = 0.01;
		mandelbrot.orbitTrap.kind = 'circle';
		const frame = renderCpuFractal(mandelbrot, 1, 1, { maxPixels: 1, maxIterations: 8 });
		expect([...frame.data.slice(0, 3)]).not.toEqual([5, 7, 13]);
	});

	it('finds and classifies all roots of z cubed minus one', () => {
		const newton = state('newton');
		const roots = findPolynomialRoots(newton.polynomial);
		expect(roots).toHaveLength(3);
		for (const root of roots) {
			const residual = evaluatePolynomial(newton.polynomial!.coefficients, root).value;
			expect(Math.hypot(residual.re, residual.im)).toBeLessThan(1e-8);
		}
		const sample = sampleFractalPoint(newton, { re: 1.1, im: 0.1 }, 64, roots);
		expect(sample.status).toBe('converged');
		expect(sample.rootIndex).toBeGreaterThanOrEqual(0);
	});

	it('honours the Phoenix initial memory and Newton relaxation controls', () => {
		const phoenix = state('phoenix');
		phoenix.juliaC = { re: 0, im: 0 };
		phoenix.phoenixP = { re: -0.5, im: 0 };
		phoenix.phoenixPrevious = { re: 0, im: 0 };
		const zeroMemory = sampleFractalPoint(phoenix, { re: 0, im: 0 }, 1);
		phoenix.phoenixPrevious = { re: 1, im: 0 };
		const remembered = sampleFractalPoint(phoenix, { re: 0, im: 0 }, 1);
		expect(zeroMemory.magnitude).toBe(0);
		expect(remembered.magnitude).toBeCloseTo(0.5, 12);

		const newton = state('newton');
		newton.newtonRelaxation = 1;
		const ordinary = sampleFractalPoint(newton, { re: 2, im: 0 }, 1);
		newton.newtonRelaxation = 0.5;
		const damped = sampleFractalPoint(newton, { re: 2, im: 0 }, 1);
		expect(ordinary.magnitude).not.toBeCloseTo(damped.magnitude, 12);
	});

	it('samples Newton root colours categorically and reports the uncapped CPU request', () => {
		const stops = paletteStops('categorical-roots');
		expect(sampleCategoricalPalette(stops, 1)).toEqual({
			r: 230 / 255,
			g: 159 / 255,
			b: 0
		});
		const mandelbrot = state('mandelbrot');
		mandelbrot.maxIterations = 20_000;
		const frame = renderCpuFractal(mandelbrot, 16, 16, { maxPixels: 256 });
		expect(frame.requestedIterations).toBe(20_000);
		expect(frame.iterations).toBeLessThanOrEqual(2_048);
	});

	it('renders every GPU family through a strictly bounded Canvas fallback frame', () => {
		const families: FractalFamily[] = [
			'mandelbrot',
			'julia',
			'multibrot',
			'burning-ship',
			'tricorn',
			'phoenix',
			'custom-map',
			'newton'
		];
		for (const family of families) {
			const frame = renderCpuFractal(state(family), 64, 40, {
				maxPixels: 1_024,
				maxIterations: 48
			});
			expect(frame.pixelCount).toBeLessThanOrEqual(1_024);
			expect(frame.data).toHaveLength(frame.pixelCount * 4);
			expect(frame.iterations).toBeLessThanOrEqual(48);
			expect(frame.data.every((channel, index) => index % 4 !== 3 || channel === 255)).toBe(true);
		}
	});

	it('uses a bounded two-pass CDF for histogram-equalised escape colouring', () => {
		const histogramState = state('mandelbrot');
		histogramState.coloring = 'histogram';
		histogramState.maxIterations = 80;
		const histogram = renderCpuFractal(histogramState, 72, 48, {
			maxPixels: 3_456,
			maxIterations: 80
		});
		const smoothState = { ...histogramState, coloring: 'smooth' as const };
		const smooth = renderCpuFractal(smoothState, 72, 48, {
			maxPixels: 3_456,
			maxIterations: 80
		});
		expect(histogram.pixelCount).toBeLessThanOrEqual(3_456);
		expect(histogram.data.some((channel, index) => channel !== smooth.data[index])).toBe(true);
		expect(histogram.data.every((channel, index) => index % 4 !== 3 || channel === 255)).toBe(true);
	});
});

describe('WebGL2 shader variants', () => {
	it('compile from small family variants with bounded loops and selected state uniforms', () => {
		const variants: FractalShaderVariant[] = [
			'escape',
			'burning-ship',
			'tricorn',
			'phoenix',
			'custom-map',
			'newton',
			'quadratic-double-single',
			'quadratic-perturbation'
		];
		for (const variant of variants) {
			const source = fractalFragmentSource(variant);
			expect(source.startsWith('#version 300 es')).toBe(true);
			expect(source).toContain(
				`const int MAX_ITERATIONS = ${
					variant === 'quadratic-perturbation' ? MAX_PERTURBATION_SHADER_ITERATIONS : 2_048
				}`
			);
			expect(source).toContain('uniform float u_spanY');
			expect(source).toContain('uniform int u_colorMode');
			expect(source).toContain('uniform float u_paletteCycles');
			expect(source).toContain('uniform float u_distanceLightAngle');
			expect(source).toContain('uniform float u_distanceLightStrength');
			expect(source).toContain('vec3 categoricalPalette');
			expect(source).not.toContain('while (');
		}
	});

	it('keeps hi/lo extended orbits and a lightweight relative perturbation loop', () => {
		const extended = fractalFragmentSource('quadratic-double-single');
		expect(extended).toContain('DS dsMultiply(DS a, DS b)');
		expect(extended).toContain('z = dsComplexAdd(dsComplexMultiply(oldZ, oldZ), c)');
		expect(extended).toContain('uniform vec2 u_centerHi');
		expect(extended).toContain('uniform vec2 u_centerLo');
		expect(extended).toContain('uniform vec2 u_spanYPair');
		expect(extended).not.toContain('DSComplex z = parameterPlane ?');
		expect(extended).not.toContain('DSComplex c = parameterPlane ?');

		const perturbation = fractalFragmentSource('quadratic-perturbation');
		expect(perturbation).toContain('uniform highp sampler2D u_referenceOrbit');
		expect(perturbation).toContain('complexMultiply(referenceBefore.xy, delta)');
		expect(perturbation).toContain('complexMultiply(referenceBefore.zw, delta)');
		expect(perturbation).toContain('complexMultiply(delta, delta) + deltaC');
		expect(perturbation).not.toContain('struct DSComplex');
		expect(perturbation).not.toContain('directQuadratic(');
		expect(perturbation).toContain('fragmentColor = vec4(1.0, 0.16, 0.72, 1.0)');
		expect(perturbation).toContain('uniform highp sampler2D u_referenceMetadata');
		expect(perturbation).toContain('referenceLength(tileIndex)');
		expect(perturbation).not.toContain('uniform vec4 u_referencePoints[16]');
		expect(perturbation).not.toContain('uniform int u_referenceLengths[16]');
		expect(perturbation).not.toContain('DSComplex delta = parameterPlane ?');
		expect(perturbation).not.toContain('DSComplex deltaC = parameterPlane ?');
	});
});
