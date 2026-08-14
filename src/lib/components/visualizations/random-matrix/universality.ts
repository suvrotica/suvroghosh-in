import type { MatrixAnalysis } from '$lib/visualizations/random-matrix';
import type {
	EnsemblePointView,
	EnsembleSummaryView,
	ExperimentStateView,
	MatrixDistribution,
	UniversalityComparisonView
} from './types';

export const UNIVERSALITY_DISTRIBUTIONS = [
	{ id: 'gaussian', label: 'Gaussian' },
	{ id: 'uniform', label: 'Uniform' },
	{ id: 'rademacher', label: 'Rademacher' }
] as const satisfies readonly { id: MatrixDistribution; label: string }[];

export function emptyUniversalityComparison(
	state: Pick<ExperimentStateView, 'dimension' | 'mean' | 'scale' | 'normalisation' | 'sampleCount'>
): UniversalityComparisonView {
	const empty = (): EnsembleSummaryView => ({
		completed: 0,
		requested: state.sampleCount,
		spectralRadii: [],
		largestSingularValues: [],
		eigenvalues: []
	});
	return {
		dimension: state.dimension,
		mean: state.mean,
		scale: state.scale,
		normalisation: state.normalisation,
		distributions: {
			gaussian: empty(),
			uniform: empty(),
			rademacher: empty()
		}
	};
}

export function appendUniversalityAnalysis(
	comparison: UniversalityComparisonView,
	distribution: MatrixDistribution,
	analysis: MatrixAnalysis,
	maximumRetainedEigenvalues = 6_000
): UniversalityComparisonView {
	const current = comparison.distributions[distribution];
	const eigenvalues: EnsemblePointView[] = [...current.eigenvalues];
	if (analysis.eigen) {
		for (let index = 0; index < analysis.eigen.real.length; index += 1) {
			eigenvalues.push({
				real: analysis.eigen.real[index] ?? 0,
				imaginary: analysis.eigen.imaginary[index] ?? 0,
				sample: analysis.sampleIndex
			});
		}
	}
	const boundedEigenvalues =
		eigenvalues.length > maximumRetainedEigenvalues
			? eigenvalues.slice(-maximumRetainedEigenvalues)
			: eigenvalues;
	const updated: EnsembleSummaryView = {
		completed: current.completed + 1,
		requested: current.requested,
		spectralRadii:
			analysis.summary.spectralRadius === null
				? current.spectralRadii
				: [...current.spectralRadii, analysis.summary.spectralRadius],
		largestSingularValues: [...current.largestSingularValues, analysis.singular.values[0] ?? 0],
		eigenvalues: boundedEigenvalues
	};
	return {
		...comparison,
		distributions: { ...comparison.distributions, [distribution]: updated }
	};
}

export function universalityEntryVariance(comparison: UniversalityComparisonView): number | null {
	const sourceVariance = comparison.scale * comparison.scale;
	if (comparison.normalisation === 'variance-1/n') {
		return sourceVariance / Math.max(1, comparison.dimension);
	}
	if (comparison.normalisation === 'unscaled') return sourceVariance;
	return null;
}

export function universalitySharedRadius(comparison: UniversalityComparisonView): number {
	let radius = 0;
	for (const { id } of UNIVERSALITY_DISTRIBUTIONS) {
		for (const point of comparison.distributions[id].eigenvalues) {
			radius = Math.max(radius, Math.hypot(point.real, point.imaginary));
		}
	}
	return Math.max(1, radius) * 1.12;
}
