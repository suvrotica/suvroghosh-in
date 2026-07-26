import {
	incidentPhotonCount,
	intensityFromLineIntegral,
	lineIntegralFromIntensity,
	measureTransmittedCounts
} from './beer-lambert';
import {
	sampleGridBilinear,
	createProjectionGeometry,
	normalizeAcquisitionSettings
} from './geometry';
import { phantomContainsMaterial, phantomToAttenuation, SPECTRUM_WEIGHTS } from './materials';
import { validatePhantom } from './phantom';
import { mixSeed, Mulberry32 } from './prng';
import {
	MaterialId,
	type AcquisitionSettings,
	type Phantom,
	type ProjectionGeometry,
	type ProjectionResult,
	type Sinogram
} from './types';

export interface CTProjector {
	readonly phantom: Phantom;
	readonly settings: Readonly<Required<AcquisitionSettings>>;
	readonly detectorCount: number;
	projectAngle(
		angle: number,
		projectionIndex?: number,
		includeDiagnostics?: boolean
	): ProjectionResult;
}

interface AttenuationBands {
	mono: Float32Array;
	low: Float32Array;
	mid: Float32Array;
	high: Float32Array;
}

function integrateRay(
	grid: Float32Array,
	size: number,
	detectorPosition: number,
	cosine: number,
	sine: number,
	stepScale: number
): number {
	const pixelSize = 2 / size;
	const requestedStep = pixelSize * stepScale;
	const pathLength = Math.SQRT2 * 2;
	const sampleCount = Math.max(1, Math.ceil(pathLength / requestedStep));
	const step = pathLength / sampleCount;
	let total = 0;
	for (let sample = 0; sample < sampleCount; sample += 1) {
		const t = -Math.SQRT2 + (sample + 0.5) * step;
		const x = detectorPosition * cosine - t * sine;
		const y = detectorPosition * sine + t * cosine;
		total += sampleGridBilinear(grid, size, x, y);
	}
	return Math.max(0, total * step);
}

function expectedPolychromaticCounts(
	incidentCounts: number,
	lineIntegrals: readonly [number, number, number]
): number {
	let transmission = 0;
	for (let band = 0; band < 3; band += 1) {
		transmission += SPECTRUM_WEIGHTS[band] * Math.exp(-lineIntegrals[band]);
	}
	return incidentCounts * transmission;
}

export function createProjector(
	phantom: Phantom,
	settings: Partial<AcquisitionSettings> = {}
): CTProjector {
	validatePhantom(phantom);
	const normalized = normalizeAcquisitionSettings(settings);
	const bands: AttenuationBands = {
		mono: phantomToAttenuation(phantom),
		low: phantomToAttenuation(phantom, 0),
		mid: phantomToAttenuation(phantom, 1),
		high: phantomToAttenuation(phantom, 2)
	};
	const hasMetal = phantomContainsMaterial(phantom, MaterialId.Metal);
	const usePolychromaticModel =
		normalized.beamModel === 'polychromatic' || (normalized.metalArtifacts && hasMetal);
	const detectorMin = -Math.SQRT2;
	const detectorSpacing = (Math.SQRT2 * 2) / normalized.detectorCount;
	const incidentCounts = incidentPhotonCount(normalized.dose);

	const project = (
		angle: number,
		projectionIndex = 0,
		includeDiagnostics = true
	): ProjectionResult => {
		if (!Number.isFinite(angle)) throw new RangeError('Projection angle must be finite.');
		const cosine = Math.cos(angle);
		const sine = Math.sin(angle);
		const ideal = new Float32Array(includeDiagnostics ? normalized.detectorCount : 0);
		const measured = new Float32Array(normalized.detectorCount);
		const expectedCounts = new Float32Array(includeDiagnostics ? normalized.detectorCount : 0);
		const observedCounts = new Float32Array(includeDiagnostics ? normalized.detectorCount : 0);
		const random = new Mulberry32(
			mixSeed(normalized.seed, projectionIndex, normalized.detectorCount)
		);

		for (let bin = 0; bin < normalized.detectorCount; bin += 1) {
			const detectorPosition = detectorMin + (bin + 0.5) * detectorSpacing;
			const monoIntegral =
				!usePolychromaticModel || includeDiagnostics
					? integrateRay(
							bands.mono,
							phantom.size,
							detectorPosition,
							cosine,
							sine,
							normalized.rayStepScale
						)
					: 0;
			if (includeDiagnostics) ideal[bin] = monoIntegral;
			let expected: number;
			if (usePolychromaticModel) {
				expected = expectedPolychromaticCounts(incidentCounts, [
					integrateRay(
						bands.low,
						phantom.size,
						detectorPosition,
						cosine,
						sine,
						normalized.rayStepScale
					),
					integrateRay(
						bands.mid,
						phantom.size,
						detectorPosition,
						cosine,
						sine,
						normalized.rayStepScale
					),
					integrateRay(
						bands.high,
						phantom.size,
						detectorPosition,
						cosine,
						sine,
						normalized.rayStepScale
					)
				]);
			} else {
				expected = intensityFromLineIntegral(monoIntegral, incidentCounts);
			}
			if (includeDiagnostics) expectedCounts[bin] = expected;

			if (normalized.noiseEnabled) {
				const measurement = measureTransmittedCounts(
					expected,
					incidentCounts,
					random,
					normalized.additionalNoise
				);
				if (includeDiagnostics) observedCounts[bin] = measurement.observedCounts;
				measured[bin] = measurement.measuredLineIntegral;
			} else {
				if (includeDiagnostics) observedCounts[bin] = expected;
				measured[bin] = lineIntegralFromIntensity(expected, incidentCounts);
			}
		}

		return {
			angle,
			ideal,
			measured,
			expectedCounts,
			observedCounts,
			usedPolychromaticModel: usePolychromaticModel
		};
	};

	return {
		phantom,
		settings: normalized,
		detectorCount: normalized.detectorCount,
		projectAngle: project
	};
}

export function projectAngle(
	projector: CTProjector,
	angle: number,
	projectionIndex = 0,
	includeDiagnostics = true
): ProjectionResult {
	return projector.projectAngle(angle, projectionIndex, includeDiagnostics);
}

export function projectSinogram(
	projector: CTProjector,
	geometry: ProjectionGeometry = createProjectionGeometry(projector.settings)
): Sinogram {
	if (geometry.detectorCount !== projector.detectorCount) {
		throw new RangeError('Projection geometry and projector detector counts differ.');
	}
	const length = geometry.projectionCount * geometry.detectorCount;
	const values = new Float32Array(length);
	const idealValues = new Float32Array(length);
	for (let angleIndex = 0; angleIndex < geometry.projectionCount; angleIndex += 1) {
		if (geometry.acquired[angleIndex] === 0) continue;
		const projection = projector.projectAngle(geometry.angles[angleIndex], angleIndex);
		const offset = angleIndex * geometry.detectorCount;
		values.set(projection.measured, offset);
		idealValues.set(projection.ideal, offset);
	}
	return {
		values,
		idealValues,
		angles: new Float64Array(geometry.angles),
		acquired: new Uint8Array(geometry.acquired),
		projectionCount: geometry.projectionCount,
		detectorCount: geometry.detectorCount,
		detectorMin: geometry.detectorMin,
		detectorMax: geometry.detectorMax,
		detectorSpacing: geometry.detectorSpacing
	};
}
