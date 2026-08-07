import { gridSpacing } from './constants';
import type {
	ComplexValue,
	DispersionReading,
	DispersionSample,
	GrayScottSetup,
	HomogeneousEquilibrium,
	JacobianReading,
	StabilityClassification
} from './types';

export type Matrix2 = readonly [number, number, number, number];
export type MatrixStability = 'stable' | 'unstable' | 'near-boundary';

function assertFiniteMatrix(matrix: Matrix2): void {
	if (!matrix.every(Number.isFinite)) throw new RangeError('Matrix entries must be finite.');
}

export function eigenvalues2x2(matrix: Matrix2): readonly [ComplexValue, ComplexValue] {
	assertFiniteMatrix(matrix);
	const [a, b, c, d] = matrix;
	const trace = a + d;
	const determinant = a * d - b * c;
	const discriminant = trace * trace - 4 * determinant;
	if (discriminant >= 0) {
		const root = Math.sqrt(discriminant);
		return [
			{ real: (trace + root) / 2, imaginary: 0 },
			{ real: (trace - root) / 2, imaginary: 0 }
		];
	}
	const imaginary = Math.sqrt(-discriminant) / 2;
	return [
		{ real: trace / 2, imaginary },
		{ real: trace / 2, imaginary: -imaginary }
	];
}

export function readJacobian(matrix: Matrix2): JacobianReading {
	assertFiniteMatrix(matrix);
	const [a, b, c, d] = matrix;
	return {
		matrix: [a, b, c, d],
		trace: a + d,
		determinant: a * d - b * c,
		eigenvalues: eigenvalues2x2(matrix)
	};
}

export function maximumRealEigenvalue(matrix: Matrix2): number {
	const eigenvalues = eigenvalues2x2(matrix);
	return Math.max(eigenvalues[0].real, eigenvalues[1].real);
}

export function classifyMatrixStability(matrix: Matrix2, tolerance = 1e-10): MatrixStability {
	const growth = maximumRealEigenvalue(matrix);
	if (growth > tolerance) return 'unstable';
	if (growth < -tolerance) return 'stable';
	return 'near-boundary';
}

export function findHomogeneousEquilibria(
	setup: Pick<GrayScottSetup, 'feed' | 'kill'>
): readonly HomogeneousEquilibrium[] {
	if (
		!Number.isFinite(setup.feed) ||
		!Number.isFinite(setup.kill) ||
		setup.feed < 0 ||
		setup.kill < 0
	) {
		throw new RangeError('Feed and kill must be finite and non-negative.');
	}
	const equilibria: HomogeneousEquilibrium[] = [{ id: 'feed', u: 1, v: 0 }];
	if (setup.feed === 0) return equilibria;
	const discriminant = 1 - (4 * (setup.feed + setup.kill) ** 2) / setup.feed;
	if (discriminant < -1e-14) return equilibria;
	const root = Math.sqrt(Math.max(0, discriminant));
	const candidates = [
		{ id: 'lower' as const, u: (1 - root) / 2 },
		{ id: 'upper' as const, u: (1 + root) / 2 }
	];
	for (const candidate of candidates) {
		if (candidate.u <= 0) continue;
		equilibria.push({
			id: candidate.id,
			u: candidate.u,
			v: (setup.feed + setup.kill) / candidate.u
		});
	}
	return equilibria;
}

export function reactionJacobian(
	equilibrium: Pick<HomogeneousEquilibrium, 'u' | 'v'>,
	setup: Pick<GrayScottSetup, 'feed' | 'kill'>
): JacobianReading {
	const { u, v } = equilibrium;
	if (![u, v, setup.feed, setup.kill].every(Number.isFinite)) {
		throw new RangeError('Jacobian inputs must be finite.');
	}
	return readJacobian([
		-v * v - setup.feed,
		-2 * u * v,
		v * v,
		2 * u * v - setup.feed - setup.kill
	]);
}

export interface DispersionOptions {
	readonly samples?: number;
	readonly qMaximum?: number;
	readonly tolerance?: number;
}

export interface MatrixDispersionResult {
	readonly classification: StabilityClassification;
	readonly qZeroGrowthRate: number;
	readonly maximumGrowthRate: number;
	readonly fastestQ: number | null;
	readonly samples: readonly DispersionSample[];
}

export function scanMatrixDispersion(
	matrix: Matrix2,
	diffusionU: number,
	diffusionV: number,
	options: Readonly<Required<Pick<DispersionOptions, 'qMaximum'>> & DispersionOptions>
): MatrixDispersionResult {
	assertFiniteMatrix(matrix);
	if (![diffusionU, diffusionV, options.qMaximum].every(Number.isFinite)) {
		throw new RangeError('Dispersion inputs must be finite.');
	}
	if (diffusionU < 0 || diffusionV < 0 || options.qMaximum <= 0) {
		throw new RangeError('Dispersion coefficients must be non-negative and q maximum positive.');
	}
	const sampleCount = Math.max(2, Math.min(4_096, Math.round(options.samples ?? 256)));
	const tolerance = Math.max(0, options.tolerance ?? 1e-10);
	const samples: DispersionSample[] = [];
	let maximumGrowthRate = Number.NEGATIVE_INFINITY;
	let fastestQ: number | null = null;
	for (let index = 0; index < sampleCount; index += 1) {
		const q = (options.qMaximum * index) / (sampleCount - 1);
		const q2 = q * q;
		const growthRate = maximumRealEigenvalue([
			matrix[0] - diffusionU * q2,
			matrix[1],
			matrix[2],
			matrix[3] - diffusionV * q2
		]);
		samples.push({ q, growthRate });
		if (growthRate > maximumGrowthRate) {
			maximumGrowthRate = growthRate;
			fastestQ = q;
		}
	}
	const qZeroGrowthRate = samples[0].growthRate;
	let classification: StabilityClassification;
	if (qZeroGrowthRate > tolerance) classification = 'reaction-unstable';
	else if (maximumGrowthRate > tolerance && qZeroGrowthRate < -tolerance) {
		classification = 'classical-diffusion-driven';
	} else if (Math.abs(qZeroGrowthRate) <= tolerance || Math.abs(maximumGrowthRate) <= tolerance) {
		classification = 'near-boundary';
	} else {
		classification = 'linearly-stable';
	}
	if (classification !== 'classical-diffusion-driven' || fastestQ === 0) fastestQ = null;
	return { classification, qZeroGrowthRate, maximumGrowthRate, fastestQ, samples };
}

export function scanDispersion(
	setup: Readonly<GrayScottSetup>,
	equilibrium: Readonly<HomogeneousEquilibrium>,
	options: Readonly<DispersionOptions> = {}
): DispersionReading {
	const jacobian = reactionJacobian(equilibrium, setup);
	const qMaximum = options.qMaximum ?? Math.PI / gridSpacing(setup);
	const result = scanMatrixDispersion(jacobian.matrix, setup.diffusionU, setup.diffusionV, {
		...options,
		qMaximum
	});
	const fastestQ =
		result.fastestQ !== null && result.fastestQ > 0 && result.maximumGrowthRate > 0
			? result.fastestQ
			: null;
	return {
		equilibrium: { ...equilibrium },
		jacobian,
		classification: result.classification,
		qZeroGrowthRate: result.qZeroGrowthRate,
		maximumGrowthRate: result.maximumGrowthRate,
		fastestQ,
		linearWavelength: fastestQ === null ? null : (2 * Math.PI) / fastestQ,
		samples: result.samples
	};
}
