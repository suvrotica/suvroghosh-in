import { describe, expect, it } from 'vitest';
import {
	MaterialId,
	accumulateBackprojection,
	clonePhantom,
	computeMetrics,
	createBlankPhantom,
	createPresetPhantom,
	createProjectionGeometry,
	createProjector,
	fft,
	filterProjection,
	frequencyWeight,
	intensityFromLineIntegral,
	lineIntegralFromIntensity,
	paintCircle,
	paintEllipse,
	phantomToAttenuation,
	projectSinogram,
	reconstructSinogram,
	type AcquisitionSettings,
	type FilterName,
	type Phantom
} from './index';

const FAST_ACQUISITION: Partial<AcquisitionSettings> = {
	projectionCount: 72,
	detectorCount: 64,
	dose: 0.72,
	additionalNoise: 0,
	seed: 13_337,
	noiseEnabled: false,
	missingAngleWidth: 0,
	missingAngleCenter: 90,
	metalArtifacts: false,
	rayStepScale: 0.55,
	beamModel: 'monochromatic'
};

function allFinite(values: ArrayLike<number>): boolean {
	for (let index = 0; index < values.length; index += 1) {
		if (!Number.isFinite(values[index])) return false;
	}
	return true;
}

function rms(values: ArrayLike<number>): number {
	let sum = 0;
	for (let index = 0; index < values.length; index += 1) sum += values[index] ** 2;
	return Math.sqrt(sum / values.length);
}

function rmsDifference(left: ArrayLike<number>, right: ArrayLike<number>): number {
	let sum = 0;
	for (let index = 0; index < left.length; index += 1) sum += (left[index] - right[index]) ** 2;
	return Math.sqrt(sum / left.length);
}

function variance(values: readonly number[]): number {
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	return (
		values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1)
	);
}

function reconstruct(phantom: Phantom, settings: Partial<AcquisitionSettings> = {}) {
	const acquisition = { ...FAST_ACQUISITION, ...settings };
	const projector = createProjector(phantom, acquisition);
	const geometry = createProjectionGeometry(acquisition);
	const sinogram = projectSinogram(projector, geometry);
	return reconstructSinogram(sinogram, {
		imageSize: phantom.size,
		filter: 'shepp-logan',
		cutoff: 1
	});
}

function positiveCentroidX(values: ArrayLike<number>, size: number): number {
	let weightedX = 0;
	let total = 0;
	for (let row = 0; row < size; row += 1) {
		for (let column = 0; column < size; column += 1) {
			const value = Math.max(0, values[row * size + column]);
			const x = ((column + 0.5) * 2) / size - 1;
			weightedX += x * value;
			total += value;
		}
	}
	return total > 0 ? weightedX / total : 0;
}

describe('parallel-beam forward projection', () => {
	it('keeps an all-air phantom at zero with finite projections and reconstructions', () => {
		const phantom = createBlankPhantom(32);
		const projector = createProjector(phantom, {
			...FAST_ACQUISITION,
			projectionCount: 24,
			detectorCount: 40
		});
		const sinogram = projectSinogram(projector, createProjectionGeometry(projector.settings));
		expect(Math.max(...sinogram.values)).toBe(0);
		expect(allFinite(sinogram.values)).toBe(true);
		const result = reconstructSinogram(sinogram, {
			imageSize: 32,
			filter: 'shepp-logan',
			cutoff: 1
		});
		expect(Math.max(...result.backprojection)).toBe(0);
		expect(Math.max(...result.filteredBackprojection)).toBe(0);
		expect(allFinite(result.filteredBackprojection)).toBe(true);
	});

	it('gives a centred uniform circle nearly angle-invariant profiles', () => {
		const phantom = createBlankPhantom(56);
		paintCircle(phantom, {
			centerX: 0,
			centerY: 0,
			radius: 0.58,
			material: MaterialId.SoftTissue
		});
		const projector = createProjector(phantom, {
			...FAST_ACQUISITION,
			detectorCount: 72
		});
		const horizontal = projector.projectAngle(0, 0).ideal;
		const diagonal = projector.projectAngle(Math.PI / 4, 1).ideal;
		const vertical = projector.projectAngle(Math.PI / 2, 2).ideal;
		expect(rmsDifference(horizontal, vertical) / rms(horizontal)).toBeLessThan(0.015);
		expect(rmsDifference(horizontal, diagonal) / rms(horizontal)).toBeLessThan(0.055);
	});

	it('reconstructs asymmetric mirrored objects on the correct side', () => {
		const right = createBlankPhantom(40);
		paintEllipse(right, {
			centerX: 0.34,
			centerY: 0.1,
			radiusX: 0.18,
			radiusY: 0.27,
			rotation: 0.25,
			material: MaterialId.Bone
		});
		const left = createBlankPhantom(40);
		paintEllipse(left, {
			centerX: -0.34,
			centerY: 0.1,
			radiusX: 0.18,
			radiusY: 0.27,
			rotation: -0.25,
			material: MaterialId.Bone
		});
		const rightResult = reconstruct(right);
		const leftResult = reconstruct(left);
		expect(positiveCentroidX(rightResult.filteredBackprojection, right.size)).toBeGreaterThan(0.18);
		expect(positiveCentroidX(leftResult.filteredBackprojection, left.size)).toBeLessThan(-0.18);
	});

	it('round-trips ideal Beer–Lambert line integrals', () => {
		for (const lineIntegral of [0, 0.02, 0.4, 1.5, 4, 9]) {
			const incident = 125_000;
			const intensity = intensityFromLineIntegral(lineIntegral, incident);
			expect(lineIntegralFromIntensity(intensity, incident)).toBeCloseTo(lineIntegral, 12);
		}
	});

	it('replays noisy projections exactly for the same seed', () => {
		const phantom = createPresetPhantom('head', 36);
		const settings = {
			...FAST_ACQUISITION,
			detectorCount: 48,
			dose: 0.2,
			additionalNoise: 0.18,
			noiseEnabled: true
		};
		const first = createProjector(phantom, { ...settings, seed: 99 }).projectAngle(0.37, 7);
		const replay = createProjector(phantom, { ...settings, seed: 99 }).projectAngle(0.37, 7);
		const different = createProjector(phantom, { ...settings, seed: 100 }).projectAngle(0.37, 7);
		expect(first.measured).toEqual(replay.measured);
		expect(first.observedCounts).toEqual(replay.observedCounts);
		expect(first.measured).not.toEqual(different.measured);
	});

	it('produces greater projection variance at lower relative dose', () => {
		const phantom = createBlankPhantom(32);
		paintCircle(phantom, {
			centerX: 0,
			centerY: 0,
			radius: 0.66,
			material: MaterialId.SoftTissue
		});
		const sampleAtDose = (dose: number) =>
			Array.from({ length: 64 }, (_, seed) => {
				const result = createProjector(phantom, {
					...FAST_ACQUISITION,
					detectorCount: 49,
					dose,
					noiseEnabled: true,
					seed
				}).projectAngle(0, 0);
				return result.measured[24];
			});
		const lowDoseVariance = variance(sampleAtDose(0));
		const highDoseVariance = variance(sampleAtDose(1));
		expect(lowDoseVariance).toBeGreaterThan(highDoseVariance * 100);
	});
});

describe('FFT and reconstruction filters', () => {
	it('recovers a complex vector after a forward and inverse radix-2 FFT', () => {
		const real = Float64Array.from(
			{ length: 32 },
			(_, index) => Math.sin(index * 0.37) + Math.cos(index * 0.11)
		);
		const imaginary = Float64Array.from(
			{ length: 32 },
			(_, index) => 0.25 * Math.sin(index * 0.23)
		);
		const originalReal = new Float64Array(real);
		const originalImaginary = new Float64Array(imaginary);
		fft(real, imaginary);
		fft(real, imaginary, true);
		for (let index = 0; index < real.length; index += 1) {
			expect(real[index]).toBeCloseTo(originalReal[index], 11);
			expect(imaginary[index]).toBeCloseTo(originalImaginary[index], 11);
		}
	});

	it('keeps every windowed filter finite across representative cutoffs', () => {
		const profile = Float32Array.from({ length: 65 }, (_, index) => {
			const coordinate = (index - 32) / 11;
			return Math.exp(-coordinate * coordinate) + (index % 7 === 0 ? 0.1 : 0);
		});
		const filters: FilterName[] = ['ramp', 'shepp-logan', 'cosine', 'hann', 'hamming'];
		for (const filter of filters) {
			for (const cutoff of [0.25, 0.5, 1]) {
				const filtered = filterProjection(profile, filter, cutoff, 0.04);
				expect(filtered).toHaveLength(profile.length);
				expect(allFinite(filtered)).toBe(true);
			}
		}
	});

	it('suppresses DC and gives higher ramp weight to higher nonzero frequencies', () => {
		expect(frequencyWeight(0, 'ramp', 1)).toBe(0);
		expect(frequencyWeight(0.7, 'ramp', 1)).toBeGreaterThan(frequencyWeight(0.15, 'ramp', 1));
		expect(frequencyWeight(0.8, 'hann', 0.6)).toBe(0);
	});
});

describe('back-projection and reconstruction quality', () => {
	it('back-projects a central detector impulse along the expected vertical line', () => {
		const size = 31;
		const target = new Float32Array(size * size);
		const projection = new Float32Array(65);
		projection[32] = 1;
		accumulateBackprojection(target, projection, { size, angle: 0 });
		let verticalEnergy = 0;
		let horizontalEnergy = 0;
		const center = Math.floor(size / 2);
		for (let index = 0; index < size; index += 1) {
			verticalEnergy += target[index * size + center];
			horizontalEnergy += target[center * size + index];
		}
		expect(verticalEnergy).toBeGreaterThan(horizontalEnergy * 8);
		expect(target[center * size + center]).toBeGreaterThan(0.95);
	});

	it('makes filtered back-projection substantially closer than ordinary smearing', () => {
		const phantom = createPresetPhantom('simple-circles', 42);
		const result = reconstruct(phantom, {
			projectionCount: 90,
			detectorCount: 72
		});
		const reference = phantomToAttenuation(phantom);
		const ordinary = computeMetrics(reference, result.backprojection);
		const filtered = computeMetrics(reference, result.filteredBackprojection);
		expect(filtered.scaleInvariantRmse).toBeLessThan(ordinary.scaleInvariantRmse * 0.72);
		expect(filtered.correlation).toBeGreaterThan(ordinary.correlation + 0.07);
	});

	it('makes a missing angular sector measurably worse and directionally different', () => {
		const phantom = createPresetPhantom('hidden-lesion', 40);
		const full = reconstruct(phantom, {
			projectionCount: 90,
			detectorCount: 72,
			missingAngleWidth: 0
		});
		const missing = reconstruct(phantom, {
			projectionCount: 90,
			detectorCount: 72,
			missingAngleWidth: 70,
			missingAngleCenter: 25
		});
		const reference = phantomToAttenuation(phantom);
		const fullMetrics = computeMetrics(reference, full.filteredBackprojection);
		const missingMetrics = computeMetrics(reference, missing.filteredBackprojection);
		expect(missingMetrics.scaleInvariantRmse).toBeGreaterThan(
			fullMetrics.scaleInvariantRmse * 1.08
		);
		expect(
			rmsDifference(full.filteredBackprojection, missing.filteredBackprojection) /
				rms(full.filteredBackprojection)
		).toBeGreaterThan(0.12);
		expect(missing.acquiredProjectionCount).toBeLessThan(full.acquiredProjectionCount);
	});

	it('changes measured projections through the three-band metal model', () => {
		const phantom = createPresetPhantom('metal', 44);
		const base = {
			...FAST_ACQUISITION,
			detectorCount: 65,
			noiseEnabled: false,
			beamModel: 'monochromatic' as const
		};
		const mono = createProjector(phantom, {
			...base,
			metalArtifacts: false
		}).projectAngle(0.52, 0);
		const metal = createProjector(phantom, {
			...base,
			metalArtifacts: true
		}).projectAngle(0.52, 0);
		expect(mono.usedPolychromaticModel).toBe(false);
		expect(metal.usedPolychromaticModel).toBe(true);
		expect(rmsDifference(mono.measured, metal.measured)).toBeGreaterThan(0.01);
		expect(allFinite(metal.measured)).toBe(true);
	});

	it('produces genuinely photon-starved rays in the low-dose metal experiment', () => {
		const phantom = createPresetPhantom('metal', 44);
		const projector = createProjector(phantom, {
			...FAST_ACQUISITION,
			detectorCount: 65,
			dose: 0,
			noiseEnabled: false,
			metalArtifacts: true
		});
		let minimumExpectedCounts = Number.POSITIVE_INFINITY;
		for (let angleIndex = 0; angleIndex < 18; angleIndex += 1) {
			const projection = projector.projectAngle((angleIndex * Math.PI) / 18, angleIndex);
			for (const count of projection.expectedCounts) {
				minimumExpectedCounts = Math.min(minimumExpectedCounts, count);
			}
		}
		expect(minimumExpectedCounts).toBeLessThan(150);
	});

	it('can omit diagnostic arrays on the Worker hot path', () => {
		const phantom = createPresetPhantom('metal', 32);
		const projection = createProjector(phantom, {
			...FAST_ACQUISITION,
			detectorCount: 48,
			metalArtifacts: true
		}).projectAngle(0.4, 2, false);
		expect(projection.measured).toHaveLength(48);
		expect(projection.ideal).toHaveLength(0);
		expect(projection.expectedCounts).toHaveLength(0);
		expect(projection.observedCounts).toHaveLength(0);
		expect(allFinite(projection.measured)).toBe(true);
	});
});

describe('phantom editing isolation', () => {
	it('clones typed phantom state without shared buffers', () => {
		const original = createPresetPhantom('simple-circles', 24);
		const copy = clonePhantom(original);
		paintCircle(copy, {
			centerX: 0.7,
			centerY: 0.7,
			radius: 0.1,
			material: MaterialId.Metal
		});
		expect(copy.materials).not.toBe(original.materials);
		expect(copy.density).not.toBe(original.density);
		expect(copy.materials).not.toEqual(original.materials);
	});
});
