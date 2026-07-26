import { Mulberry32, samplePoisson } from './prng';

const MINIMUM_COUNT = 0.5;
const MINIMUM_TRANSMISSION = 1e-12;

export function intensityFromLineIntegral(lineIntegral: number, incidentIntensity: number): number {
	if (!Number.isFinite(lineIntegral) || lineIntegral < 0) {
		throw new RangeError('Line integral must be finite and non-negative.');
	}
	if (!Number.isFinite(incidentIntensity) || incidentIntensity <= 0) {
		throw new RangeError('Incident intensity must be finite and positive.');
	}
	return incidentIntensity * Math.exp(-lineIntegral);
}

export function lineIntegralFromIntensity(intensity: number, incidentIntensity: number): number {
	if (!Number.isFinite(intensity) || intensity < 0) {
		throw new RangeError('Measured intensity must be finite and non-negative.');
	}
	if (!Number.isFinite(incidentIntensity) || incidentIntensity <= 0) {
		throw new RangeError('Incident intensity must be finite and positive.');
	}
	const result = -Math.log(Math.max(MINIMUM_TRANSMISSION, intensity / incidentIntensity));
	return Object.is(result, -0) ? 0 : result;
}

/** Map the educational [0,1] dose slider to a broad but bounded photon-count range. */
export function incidentPhotonCount(relativeDose: number): number {
	const clamped = Math.max(0, Math.min(1, Number.isFinite(relativeDose) ? relativeDose : 0));
	return 3_000 * 1000 ** clamped;
}

export interface PhotonMeasurement {
	expectedCounts: number;
	observedCounts: number;
	measuredLineIntegral: number;
}

export function measureTransmittedCounts(
	expectedCounts: number,
	incidentCounts: number,
	random: Mulberry32,
	additionalNoise = 0
): PhotonMeasurement {
	if (!Number.isFinite(expectedCounts) || expectedCounts < 0) {
		throw new RangeError('Expected photon count must be finite and non-negative.');
	}
	if (!Number.isFinite(incidentCounts) || incidentCounts <= 0) {
		throw new RangeError('Incident photon count must be finite and positive.');
	}
	const poissonCounts = samplePoisson(expectedCounts, random);
	const noiseControl = Math.max(
		0,
		Math.min(1, Number.isFinite(additionalNoise) ? additionalNoise : 0)
	);
	const readoutSigma = noiseControl * 4 * Math.sqrt(incidentCounts);
	const observedCounts = Math.max(
		MINIMUM_COUNT,
		poissonCounts + (readoutSigma > 0 ? random.normal() * readoutSigma : 0)
	);
	return {
		expectedCounts,
		observedCounts,
		measuredLineIntegral: lineIntegralFromIntensity(observedCounts, incidentCounts)
	};
}
