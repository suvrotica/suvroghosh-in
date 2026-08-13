import {
	MAX_NONSYMMETRIC_EVD_DIMENSION,
	MAX_SYMMETRIC_EVD_DIMENSION,
	NUMERICAL_WARNING_TOLERANCE
} from './constants';
import {
	computeEigenAnalysis,
	computeSingularAnalysis,
	eigenvalueMatchDistance
} from './decompositions';
import { applyRearrangement, generateMatrix, isExactlySymmetric } from './matrix';
import { createMatrixRandom } from './prng';
import { summarizeMatrix } from './statistics';
import { theoryOverlayForState } from './theory';
import type { MatrixAnalysis, MatrixComputeInput, MatrixRearrangement } from './types';
import { RANDOM_MATRIX_MODEL_VERSION } from './types';
import { normalizeRandomMatrixState } from './url-state';

export function computeRandomMatrix(input: MatrixComputeInput): MatrixAnalysis {
	const state = normalizeRandomMatrixState(input.state);
	const sampleIndex = normalizeSampleIndex(input.sampleIndex);
	const rearrangement = input.rearrangement ?? 'original';
	const generated = generateMatrix(state, sampleIndex);
	const rearranged = applyRearrangement(
		generated.values,
		generated.rows,
		generated.columns,
		rearrangement,
		createMatrixRandom(state, sampleIndex, `rearrangement:${rearrangement}`)
	);
	const matrix = rearranged.values;
	const warnings = [...generated.warnings];
	if (!rearranged.spectrumPreserving) warnings.push(rearranged.label);

	const symmetric =
		generated.rows === generated.columns && isExactlySymmetric(matrix, generated.rows);
	const eigenCap = symmetric ? MAX_SYMMETRIC_EVD_DIMENSION : MAX_NONSYMMETRIC_EVD_DIMENSION;
	const eigen =
		generated.rows === generated.columns && generated.rows <= eigenCap
			? computeEigenAnalysis(matrix, generated.rows, generated.columns, {
					symmetric,
					includeVectors: input.includeVectors
				})
			: undefined;
	if (generated.rows === generated.columns && !eigen) {
		warnings.push(
			`${symmetric ? 'Symmetric' : 'Nonsymmetric'} eigendecomposition is disabled above n=${eigenCap}.`
		);
	}
	const singular = computeSingularAnalysis(matrix, generated.rows, generated.columns, {
		includeVectors: input.includeVectors,
		...(input.reconstructionRank === undefined
			? {}
			: { reconstructionRank: input.reconstructionRank })
	});
	const summary = summarizeMatrix(matrix, generated.rows, generated.columns, eigen, singular);
	const theoryResult = !state.theory
		? { overlay: null, warning: null }
		: rearranged.spectrumPreserving
			? theoryOverlayForState(state)
			: {
					overlay: null,
					warning:
						'The spectral reference is disabled because this display transformation does not preserve eigenvalues.'
				};
	if (theoryResult.warning) warnings.push(theoryResult.warning);
	if (eigen && Math.max(eigen.residual, eigen.maxPairResidual) > NUMERICAL_WARNING_TOLERANCE) {
		warnings.push(
			`Eigenvalue residual ${Math.max(eigen.residual, eigen.maxPairResidual).toExponential(2)} exceeds the ${NUMERICAL_WARNING_TOLERANCE.toExponential(1)} warning tolerance.`
		);
	}
	if (singular.residual > NUMERICAL_WARNING_TOLERANCE) {
		warnings.push(
			`SVD residual ${singular.residual.toExponential(2)} exceeds the ${NUMERICAL_WARNING_TOLERANCE.toExponential(1)} warning tolerance.`
		);
	}

	let comparison: MatrixAnalysis['comparison'];
	if (
		generated.comparison &&
		generated.rows === generated.columns &&
		rearrangement === 'original'
	) {
		const comparisonSymmetric = isExactlySymmetric(generated.comparison, generated.rows);
		const baselineCap = generated.symmetric
			? MAX_SYMMETRIC_EVD_DIMENSION
			: MAX_NONSYMMETRIC_EVD_DIMENSION;
		const comparisonCap = comparisonSymmetric
			? MAX_SYMMETRIC_EVD_DIMENSION
			: MAX_NONSYMMETRIC_EVD_DIMENSION;
		if (generated.rows <= Math.min(baselineCap, comparisonCap)) {
			const baselineEigen =
				rearrangement === 'original' && eigen
					? eigen
					: computeEigenAnalysis(generated.values, generated.rows, generated.columns, {
							symmetric: generated.symmetric
						});
			const comparisonEigen = computeEigenAnalysis(
				generated.comparison,
				generated.rows,
				generated.columns,
				{ symmetric: comparisonSymmetric }
			);
			const maxEigenvalueDelta = eigenvalueMatchDistance(baselineEigen, comparisonEigen);
			comparison = {
				kind: 'same-spectrum',
				matrix: generated.comparison,
				maxEigenvalueDelta
			};
			if (maxEigenvalueDelta > NUMERICAL_WARNING_TOLERANCE) {
				warnings.push(
					`The similarity-transform spectra differ by ${maxEigenvalueDelta.toExponential(2)}, above numerical tolerance.`
				);
			}
		} else {
			warnings.push(
				`Same-spectrum verification is capped at n=${Math.min(baselineCap, comparisonCap)} for these matrix classes.`
			);
		}
	}

	return {
		modelVersion: RANDOM_MATRIX_MODEL_VERSION,
		state,
		sampleIndex,
		rearrangement,
		rows: generated.rows,
		columns: generated.columns,
		matrix,
		...(comparison ? { comparison } : {}),
		...(eigen ? { eigen } : {}),
		singular,
		summary,
		theory: theoryResult.overlay,
		warnings: deduplicate(warnings)
	};
}

export function spectrumPreservedBy(rearrangement: MatrixRearrangement): boolean {
	return (
		rearrangement === 'original' ||
		rearrangement === 'joint-permutation' ||
		rearrangement === 'orthogonal-similarity' ||
		rearrangement === 'spectral-order'
	);
}

function normalizeSampleIndex(value: number | undefined): number {
	if (value === undefined) return 0;
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError('Sample index must be a non-negative safe integer.');
	}
	return value;
}

function deduplicate(values: readonly string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}
