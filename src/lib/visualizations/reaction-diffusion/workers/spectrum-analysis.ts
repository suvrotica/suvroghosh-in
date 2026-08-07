import { calculateRadialSpectrum } from '../spectrum';
import type { SpectrumAnalysisInput, SpectrumWorkerResult } from './spectrum-protocol';

/**
 * Worker adapter around the canonical radix-2 FFT/radial-binning implementation.
 * Typed output arrays are used so the chart payload transfers without cloning.
 */
export function analyzeSpatialSpectrum(input: SpectrumAnalysisInput): SpectrumWorkerResult {
	const field = input.field instanceof Float64Array ? input.field : Float64Array.from(input.field);
	let fieldMean = 0;
	let activeCellCount = 0;
	for (let index = 0; index < field.length; index += 1) {
		if (input.mask && input.mask[index] === 0) continue;
		fieldMean += field[index];
		activeCellCount += 1;
	}
	fieldMean = activeCellCount > 0 ? fieldMean / activeCellCount : 0;
	let fieldVariance = 0;
	for (let index = 0; index < field.length; index += 1) {
		if (input.mask && input.mask[index] === 0) continue;
		fieldVariance += (field[index] - fieldMean) ** 2;
	}
	fieldVariance = activeCellCount > 0 ? fieldVariance / activeCellCount : 0;

	const window =
		input.window === 'hann' || (input.window !== 'none' && input.boundary !== 'periodic')
			? 'hann'
			: 'none';
	const reading = calculateRadialSpectrum(field, input.size, input.domainWidth, {
		mask: input.mask,
		subtractMean: true,
		window,
		minimumProminence: input.minimumProminence
	});
	const q = Float64Array.from(reading.bins, (bin) => bin.q);
	const power = Float64Array.from(reading.bins, (bin) => bin.power);
	return {
		q,
		power,
		binWidth: q.length > 1 ? q[1] - q[0] : (2 * Math.PI) / input.domainWidth,
		fieldMean,
		fieldVariance,
		dominantQ: reading.dominantQ,
		dominantWavelength: reading.dominantWavelength,
		domainFraction: reading.domainFraction,
		prominence: reading.prominence,
		trustworthy: reading.trustworthy,
		reason:
			!reading.trustworthy && fieldVariance <= 1e-16
				? 'No trustworthy dominant wavelength is present: the field is spatially constant.'
				: reading.reason,
		window
	};
}
