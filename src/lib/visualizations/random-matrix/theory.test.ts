import { describe, expect, it } from 'vitest';
import { DEFAULT_RANDOM_MATRIX_STATE, THEORY_SAMPLE_COUNT } from './constants';
import { stateForPreset } from './presets';
import {
	circularLawOverlay,
	marchenkoPasturOverlay,
	theoryOverlayForState,
	wignerSemicircleOverlay
} from './theory';
import type { DensityTheoryOverlay, RandomMatrixState } from './types';

function withState(patch: Partial<RandomMatrixState>): RandomMatrixState {
	return { ...DEFAULT_RANDOM_MATRIX_STATE, ...patch };
}

function expectFiniteDensity(overlay: DensityTheoryOverlay): void {
	expect(overlay.x).toHaveLength(THEORY_SAMPLE_COUNT);
	expect(overlay.density).toHaveLength(THEORY_SAMPLE_COUNT);
	expect(overlay.x[0]).toBeCloseTo(overlay.support[0], 14);
	expect(overlay.x.at(-1)).toBeCloseTo(overlay.support[1], 14);
	for (const value of overlay.density) {
		expect(Number.isFinite(value)).toBe(true);
		expect(value).toBeGreaterThanOrEqual(0);
	}
}

describe('random-matrix theory overlays', () => {
	it('scales the circular-law radius for normalized and unscaled entries', () => {
		const normalized = circularLawOverlay(
			withState({ dimension: 25, scale: 2, normalization: 'variance-1/n' })
		);
		const unscaled = circularLawOverlay(
			withState({ dimension: 25, scale: 2, normalization: 'unscaled' })
		);

		expect(normalized).toMatchObject({
			kind: 'circle',
			radius: 2,
			centerReal: 0,
			centerImaginary: 0
		});
		expect(unscaled.radius).toBe(10);
	});

	it('samples the complete rescaled Wigner support with a finite density', () => {
		const overlay = wignerSemicircleOverlay({
			...stateForPreset('wigner-moonrise'),
			scale: 1.5,
			normalization: 'variance-1/n'
		});

		expect(overlay.support[0]).toBe(-3);
		expect(overlay.support[1]).toBe(3);
		expectFiniteDensity(overlay);
		expect(overlay.density[0]).toBeCloseTo(0, 14);
		expect(overlay.density.at(-1)).toBeCloseTo(0, 14);
		expect(overlay.density[Math.floor(THEORY_SAMPLE_COUNT / 2)]).toBeCloseTo(
			1 / (Math.PI * 1.5),
			12
		);

		const unscaled = wignerSemicircleOverlay({
			...stateForPreset('wigner-moonrise'),
			dimension: 25,
			scale: 2,
			normalization: 'unscaled'
		});
		expect(unscaled.support).toEqual([-20, 20]);
		expectFiniteDensity(unscaled);
	});

	it('uses the source-entry variance for Marchenko-Pastur support', () => {
		const unscaledState = {
			...stateForPreset('wishart-ridge'),
			aspectRatio: 0.25,
			scale: 2,
			normalization: 'unscaled' as const
		};
		const unscaled = marchenkoPasturOverlay(unscaledState);
		expect(unscaled.gamma).toBe(0.25);
		expect(unscaled.support[0]).toBeCloseTo(1, 14);
		expect(unscaled.support[1]).toBeCloseTo(9, 14);
		expect(unscaled.atomAtZero).toBe(0);
		expectFiniteDensity(unscaled);

		const normalized = marchenkoPasturOverlay({
			...unscaledState,
			dimension: 100,
			normalization: 'variance-1/n'
		});
		expect(normalized.support[0]).toBeCloseTo(0.01, 14);
		expect(normalized.support[1]).toBeCloseTo(0.09, 14);
		expectFiniteDensity(normalized);
	});

	it('reports the Marchenko-Pastur zero atom when gamma exceeds one', () => {
		const overlay = marchenkoPasturOverlay({
			...stateForPreset('wishart-ridge'),
			aspectRatio: 2,
			scale: 1
		});

		expect(overlay.gamma).toBe(2);
		expect(overlay.atomAtZero).toBeCloseTo(0.5, 14);
		expect(overlay.support[0]).toBeCloseTo((1 - Math.sqrt(2)) ** 2, 14);
		expect(overlay.support[1]).toBeCloseTo((1 + Math.sqrt(2)) ** 2, 14);
		expectFiniteDensity(overlay);
	});

	it('uses the realizable n/m ratio when m must be an integer', () => {
		const overlay = marchenkoPasturOverlay({
			...stateForPreset('wishart-ridge'),
			dimension: 10,
			aspectRatio: 0.73
		});
		expect(overlay.gamma).toBe(10 / 14);
		const root = Math.sqrt(10 / 14);
		expect(overlay.support[0]).toBeCloseTo((1 - root) ** 2, 14);
		expect(overlay.support[1]).toBeCloseTo((1 + root) ** 2, 14);
	});

	it('keeps the gamma-one hard edge finite for plotting', () => {
		const overlay = marchenkoPasturOverlay({
			...stateForPreset('wishart-ridge'),
			aspectRatio: 1
		});

		expect(overlay.support[0]).toBe(0);
		expect(overlay.x[0]).toBe(0);
		expectFiniteDensity(overlay);
	});

	it('selects the law attached to each supported preset', () => {
		expect(theoryOverlayForState(withState({ preset: 'circular-cloud' })).overlay?.kind).toBe(
			'circle'
		);
		expect(theoryOverlayForState(stateForPreset('wigner-moonrise')).overlay?.kind).toBe(
			'semicircle'
		);
		expect(theoryOverlayForState(stateForPreset('wishart-ridge')).overlay?.kind).toBe(
			'marchenko-pastur'
		);
	});

	it('withholds unjustified overlays and explains why', () => {
		expect(theoryOverlayForState(withState({ theory: false }))).toEqual({
			overlay: null,
			warning: null
		});

		const normalized = theoryOverlayForState(withState({ normalization: 'frobenius' }));
		expect(normalized.overlay).toBeNull();
		expect(normalized.warning).toContain('data-dependent');

		const nonzeroMean = theoryOverlayForState(withState({ mean: 0.1 }));
		expect(nonzeroMean.overlay).toBeNull();
		expect(nonzeroMean.warning).toContain('mean-zero');
		expect(theoryOverlayForState(withState({ mean: Number.EPSILON })).overlay).toBeNull();

		const sparse = theoryOverlayForState(withState({ sparsity: 0.5 }));
		expect(sparse.overlay).toBeNull();
		expect(sparse.warning).toContain('sparse');

		const unsupported = theoryOverlayForState({
			...stateForPreset('non-normal-trap'),
			theory: true
		});
		expect(unsupported.overlay).toBeNull();
		expect(unsupported.warning).toContain('No circular-law');
	});
});
