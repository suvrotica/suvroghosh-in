import { describe, expect, it } from 'vitest';
import {
	BZ_GPU_TELEMETRY_FINAL_TEXTURE,
	BZ_GPU_TELEMETRY_READ_TEXELS,
	bzGpuTelemetryPyramidSizes,
	deriveBZGpuTelemetryReduction,
	estimateBZGpuTelemetryTextureBytes,
	telemetryInitialFragmentSource,
	telemetryReduceFragmentSource
} from './telemetry';

describe('BZ GPU telemetry reduction contract', () => {
	it('allocates a bounded reusable pyramid ending in one texel', () => {
		expect(bzGpuTelemetryPyramidSizes(256)).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
		expect(bzGpuTelemetryPyramidSizes(257)).toEqual([129, 65, 33, 17, 9, 5, 3, 2, 1]);
		expect(estimateBZGpuTelemetryTextureBytes(256)).toBe(
			[128, 64, 32, 16, 8, 4, 2, 1].reduce((total, size) => total + size * size * 16, 0)
		);
		expect(estimateBZGpuTelemetryTextureBytes(256)).toBeLessThan(256 * 256 * 16);
	});

	it('decodes reduced moments, ranges, health and excitation without a field array', () => {
		const result = deriveBZGpuTelemetryReduction(
			new Float32Array([3, 7 / 3, 14 / 3, 0]),
			new Float32Array([3, 14 / 3, 56 / 3, 0]),
			new Float32Array([1, 4, 2, 8]),
			new Float32Array([3, 8, 0, 0]),
			new Float32Array([1, 0, 0, 0]),
			1_000,
			16
		);
		expect(result.metrics).toMatchObject({
			activeCells: 3,
			minimumU: 1,
			maximumU: 4,
			minimumV: 2,
			maximumV: 8,
			excitedFraction: 1 / 3
		});
		expect(result.metrics.meanU).toBeCloseTo(7 / 3, 6);
		expect(result.metrics.meanV).toBeCloseTo(14 / 3, 6);
		expect(result.metrics.varianceU).toBeCloseTo(14 / 9, 6);
		expect(result.metrics.varianceV).toBeCloseTo(56 / 9, 6);
		expect(result).toMatchObject({
			healthy: true,
			maximumAbsoluteValue: 8,
			materiallyNegativeCells: 0,
			nonFiniteCells: 0,
			reductionPasses: 16,
			reductionReadbacks: BZ_GPU_TELEMETRY_READ_TEXELS,
			finalTexture: BZ_GPU_TELEMETRY_FINAL_TEXTURE
		});
	});

	it('reports numerical failure honestly without clamping its evidence', () => {
		const negative = deriveBZGpuTelemetryReduction(
			[1, 1, 0, 0],
			[1, 2, 0, 0],
			[-0.2, 1.2, 0.1, 2],
			[1, 2, 1, 0],
			[0, 0, 0, 0],
			1_000,
			4
		);
		expect(negative.healthy).toBe(false);
		expect(negative.materiallyNegativeCells).toBe(1);
		expect(negative.metrics.minimumU).toBe(-0.2);
		expect(negative.reason).toMatch(/negative.*no clamp/iu);

		const nonFinite = deriveBZGpuTelemetryReduction(
			[1, 1, 0, 0],
			[1, 2, 0, 0],
			[1, 1, 2, 2],
			[2, 2, 0, 1],
			[0, 0, 0, 0],
			1_000,
			4
		);
		expect(nonFinite.healthy).toBe(false);
		expect(nonFinite.nonFiniteCells).toBe(1);
		expect(nonFinite.reason).toMatch(/non-finite.*no repair/iu);
	});

	it('rejects malformed or empty final reductions rather than inventing metrics', () => {
		expect(() =>
			deriveBZGpuTelemetryReduction(
				[0, 0, 0, 0],
				[0, 0, 0, 0],
				[0, 0, 0, 0],
				[0, 0, 0, 0],
				[0, 0, 0, 0],
				1,
				4
			)
		).toThrow(/no active chemistry cells/iu);
		expect(() =>
			deriveBZGpuTelemetryReduction(
				[Number.NaN, 0, 0, 0],
				[1, 0, 0, 0],
				[0, 0, 0, 0],
				[1, 0, 0, 0],
				[0, 0, 0, 0],
				1,
				4
			)
		).toThrow(/non-finite value/iu);
	});

	it('uses stable aggregate variance and suppresses unresolved uniform-field excitation', () => {
		const uniform = deriveBZGpuTelemetryReduction(
			[49, 0.3, 0, 0],
			[49, 0.7, 0, 0],
			[0.3, 0.3, 0.7, 0.7],
			[49, 0.7, 0, 0],
			[49, 0, 0, 0],
			1_000,
			20
		);
		expect(uniform.metrics.varianceU).toBe(0);
		expect(uniform.excitationVarianceResolved).toBe(false);
		expect(uniform.metrics.excitedFraction).toBe(0);
	});

	it('uses bounded 2×2 texelFetch reductions and honours the active mask', () => {
		expect(telemetryInitialFragmentSource).toContain('texelFetch(uState, coordinate, 0)');
		expect(telemetryInitialFragmentSource).toContain('state.b >= 0.5 && state.a >= 0.5');
		expect(telemetryInitialFragmentSource).toContain('for (int y = 0; y < 2; y += 1)');
		expect(telemetryInitialFragmentSource).toContain('for (int x = 0; x < 2; x += 1)');
		expect(telemetryInitialFragmentSource).toContain('any(isnan(value))');
		expect(telemetryInitialFragmentSource).toContain('any(isinf(value))');
		expect(telemetryInitialFragmentSource).toContain('addStatistic');
		expect(telemetryInitialFragmentSource).toContain('uExcitationEnabled == 1');
		expect(telemetryReduceFragmentSource).toContain('texelFetch(uReduction, coordinate, 0)');
		expect(telemetryReduceFragmentSource).toContain('mergeStatistic');
		expect(telemetryInitialFragmentSource).not.toContain('imageStore');
		expect(telemetryReduceFragmentSource).not.toContain('imageStore');
	});
});
