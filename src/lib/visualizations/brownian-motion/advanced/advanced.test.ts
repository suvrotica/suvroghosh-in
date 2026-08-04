import { describe, expect, it } from 'vitest';
import { measureDensityGrid } from './density-grid';
import { fftInPlace } from './fft';
import {
	analyticalHalfLineFirstPassageDensity,
	analyticalHalfLineSurvival,
	solveFirstPassageEnsemble
} from './first-passage';
import {
	generateFractionalBrownianPaths,
	prepareDaviesHarte,
	type FractionalBrownianPaths
} from './fractional-brownian';

describe('radix-2 FFT', () => {
	it('round-trips complex input under the documented normalisation', () => {
		const real = Float64Array.from(
			{ length: 64 },
			(_, index) => Math.sin(index * 0.37) + 0.1 * Math.cos(index * 1.9)
		);
		const imaginary = Float64Array.from(
			{ length: 64 },
			(_, index) => Math.cos(index * 0.21) - 0.2 * Math.sin(index * 1.3)
		);
		const expectedReal = real.slice();
		const expectedImaginary = imaginary.slice();

		fftInPlace(real, imaginary);
		fftInPlace(real, imaginary, true);

		for (let index = 0; index < real.length; index += 1) {
			expect(real[index]).toBeCloseTo(expectedReal[index], 11);
			expect(imaginary[index]).toBeCloseTo(expectedImaginary[index], 11);
		}
	});

	it('rejects lengths that a radix-2 transform cannot represent', () => {
		expect(() => fftInPlace(new Float64Array(6), new Float64Array(6))).toThrow(/power of two/);
	});
});

describe('Davies–Harte fractional Brownian paths', () => {
	const baseOptions = {
		seed: 'fractional-regression',
		hurst: 0.7,
		scale: 1.4,
		duration: 3,
		pointCount: 513,
		trajectoryCount: 3,
		originX: 2,
		originY: -1
	} as const;

	it('starts at the requested origin, reaches the requested time endpoint, and is deterministic', () => {
		const first = generateFractionalBrownianPaths(baseOptions);
		const replay = generateFractionalBrownianPaths(baseOptions);
		expect(first.times[0]).toBe(0);
		expect(first.times.at(-1)).toBe(3);
		for (let trajectory = 0; trajectory < first.trajectoryCount; trajectory += 1) {
			const offset = trajectory * first.pointCount;
			expect(first.x[offset]).toBe(2);
			expect(first.y[offset]).toBe(-1);
			expect(Number.isFinite(first.x[offset + first.pointCount - 1])).toBe(true);
			expect(Number.isFinite(first.y[offset + first.pointCount - 1])).toBe(true);
		}
		expect(replay.times).toEqual(first.times);
		expect(replay.x).toEqual(first.x);
		expect(replay.y).toEqual(first.y);

		const otherSeed = generateFractionalBrownianPaths({ ...baseOptions, seed: 'different-seed' });
		expect(otherSeed.x).not.toEqual(first.x);
	});

	it('supports arbitrary point counts by taking an exact prefix of a radix-2 embedding', () => {
		const embedding = prepareDaviesHarte(999, 0.63);
		expect(embedding.incrementCount).toBe(999);
		expect(embedding.paddedIncrementCount).toBe(1024);
		expect(embedding.embeddingLength).toBe(2048);
		expect(embedding.eigenvalues.every((value) => value >= 0)).toBe(true);
	});

	it('has antipersistent and persistent lag-one increments on opposite sides of H=1/2', () => {
		const antipersistent = generateFractionalBrownianPaths({
			...baseOptions,
			seed: 'anti-correlation',
			hurst: 0.2,
			duration: 1,
			pointCount: 16_385,
			trajectoryCount: 1,
			originX: 0,
			originY: 0
		});
		const persistent = generateFractionalBrownianPaths({
			...baseOptions,
			seed: 'persistent-correlation',
			hurst: 0.8,
			duration: 1,
			pointCount: 16_385,
			trajectoryCount: 1,
			originX: 0,
			originY: 0
		});
		expect(lagOneIncrementCorrelation(antipersistent)).toBeLessThan(-0.2);
		expect(lagOneIncrementCorrelation(persistent)).toBeGreaterThan(0.3);
	});

	it('recovers qualitative MSD exponents close to 2H over resolved lags', () => {
		for (const [hurst, seed] of [
			[0.3, 'msd-subdiffusive'],
			[0.75, 'msd-superdiffusive']
		] as const) {
			const paths = generateFractionalBrownianPaths({
				seed,
				hurst,
				scale: 1,
				duration: 4,
				pointCount: 2049,
				trajectoryCount: 24
			});
			const slope = estimateMsdSlope(paths, [8, 24, 64, 192, 512]);
			expect(Math.abs(slope - 2 * hurst)).toBeLessThan(0.16);
		}
	});

	it('enforces H strictly inside the unit interval', () => {
		expect(() => generateFractionalBrownianPaths({ ...baseOptions, hurst: 0 })).toThrow(
			/strictly between 0 and 1/
		);
		expect(() => generateFractionalBrownianPaths({ ...baseOptions, hurst: 1 })).toThrow(
			/strictly between 0 and 1/
		);
	});
});

describe('half-line first passage', () => {
	it('matches the absorbing Brownian survival benchmark within seeded ensemble uncertainty', () => {
		const result = solveFirstPassageEnsemble({
			seed: 'first-passage-benchmark',
			particleCount: 20_000,
			startDistance: 1,
			diffusion: 1,
			timestep: 0.005,
			maxTime: 1,
			historySampleEverySteps: 20,
			bridgeCorrection: true
		});
		for (let index = 1; index < result.times.length; index += 1) {
			expect(
				Math.abs(result.empiricalSurvival[index] - result.analyticalSurvival[index])
			).toBeLessThan(0.02);
		}
		expect(result.absorbedCount + result.survivingCount).toBe(20_000);
		expect(
			Array.from(result.firstPassageTimes).some(
				(time) => Number.isFinite(time) && Math.abs(time / 0.005 - Math.round(time / 0.005)) > 1e-6
			)
		).toBe(true);
	});

	it('exposes the analytical survival and density with the correct edge cases', () => {
		expect(analyticalHalfLineSurvival(0, 1, 1)).toBe(1);
		expect(analyticalHalfLineSurvival(1, 1, 1)).toBeCloseTo(0.520499878, 6);
		expect(analyticalHalfLineFirstPassageDensity(0, 1, 1)).toBe(0);
		expect(analyticalHalfLineFirstPassageDensity(1, 1, 1)).toBeCloseTo(
			Math.exp(-0.25) / Math.sqrt(4 * Math.PI),
			12
		);
	});
});

describe('measured density grids', () => {
	it('counts in-bounds positions exactly, includes maximum edges, and normalises by area', () => {
		const result = measureDensityGrid({
			x: Float64Array.of(0, 0.2, 0.8, 1, -0.01, 0.7),
			y: Float64Array.of(0, 0.2, 0.8, 1, 0.5, 1.01),
			gridWidth: 2,
			gridHeight: 2,
			minX: 0,
			maxX: 1,
			minY: 0,
			maxY: 1
		});
		expect(Array.from(result.counts)).toEqual([2, 0, 0, 2]);
		expect(result.includedCount).toBe(4);
		expect(result.outsideCount).toBe(2);
		expect(result.maxCount).toBe(2);
		const integral =
			result.probabilityDensity.reduce((sum, density) => sum + density, 0) *
			result.cellWidth *
			result.cellHeight;
		expect(integral).toBeCloseTo(1, 6);
	});
});

function lagOneIncrementCorrelation(paths: FractionalBrownianPaths): number {
	const increments = new Float64Array(paths.pointCount - 1);
	for (let index = 0; index < increments.length; index += 1) {
		increments[index] = paths.x[index + 1] - paths.x[index];
	}
	let numerator = 0;
	let variance = 0;
	for (let index = 0; index < increments.length - 1; index += 1) {
		numerator += increments[index] * increments[index + 1];
		variance += increments[index] ** 2;
	}
	return numerator / variance;
}

function estimateMsdSlope(paths: FractionalBrownianPaths, lags: readonly number[]): number {
	const logTimes: number[] = [];
	const logMsd: number[] = [];
	const timestep = paths.duration / (paths.pointCount - 1);
	for (const lag of lags) {
		let sum = 0;
		let count = 0;
		for (let trajectory = 0; trajectory < paths.trajectoryCount; trajectory += 1) {
			const offset = trajectory * paths.pointCount;
			for (let point = 0; point + lag < paths.pointCount; point += lag) {
				const dx = paths.x[offset + point + lag] - paths.x[offset + point];
				const dy = paths.y[offset + point + lag] - paths.y[offset + point];
				sum += dx * dx + dy * dy;
				count += 1;
			}
		}
		logTimes.push(Math.log(lag * timestep));
		logMsd.push(Math.log(sum / count));
	}
	const meanX = logTimes.reduce((sum, value) => sum + value, 0) / logTimes.length;
	const meanY = logMsd.reduce((sum, value) => sum + value, 0) / logMsd.length;
	let numerator = 0;
	let denominator = 0;
	for (let index = 0; index < logTimes.length; index += 1) {
		numerator += (logTimes[index] - meanX) * (logMsd[index] - meanY);
		denominator += (logTimes[index] - meanX) ** 2;
	}
	return numerator / denominator;
}
