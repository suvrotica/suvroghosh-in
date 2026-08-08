import { gridSpacing } from './constants';
import { schnakenbergEquilibrium } from './reactions';
import { assertValidBZSetup } from './validation';
import type {
	ComplexValue,
	JacobianReading,
	Matrix2,
	SchnakenbergDispersionReading,
	SchnakenbergParameters,
	SchnakenbergSetup,
	TuringClassification
} from './types';

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

/** Exact reaction-only Jacobian at the Schnakenberg homogeneous equilibrium. */
export function schnakenbergJacobian(
	parameters: Readonly<SchnakenbergParameters>
): JacobianReading {
	const equilibrium = schnakenbergEquilibrium(parameters);
	const { u, v } = equilibrium;
	const { gamma } = parameters;
	if (!Number.isFinite(gamma) || !(gamma > 0)) {
		throw new RangeError('Schnakenberg gamma must be finite and positive.');
	}
	return readJacobian([
		gamma * (-1 + 2 * u * v),
		gamma * u * u,
		-2 * gamma * u * v,
		-gamma * u * u
	]);
}

export interface SchnakenbergDispersionOptions {
	readonly samples?: number;
	readonly maximumWavenumber?: number;
	readonly tolerance?: number;
}

export function scanSchnakenbergDispersion(
	setup: Readonly<SchnakenbergSetup>,
	options: Readonly<SchnakenbergDispersionOptions> = {}
): SchnakenbergDispersionReading {
	assertValidBZSetup(setup);
	const equilibrium = schnakenbergEquilibrium(setup.parameters);
	const jacobian = schnakenbergJacobian(setup.parameters);
	const nyquistWavenumber = Math.PI / gridSpacing(setup);
	const maximumWavenumber = options.maximumWavenumber ?? nyquistWavenumber;
	if (!Number.isFinite(maximumWavenumber) || maximumWavenumber <= 0) {
		throw new RangeError('Maximum dispersion wavenumber must be finite and positive.');
	}
	const samples = Math.max(2, Math.min(4_096, Math.round(options.samples ?? 512)));
	const tolerance = Math.max(0, options.tolerance ?? 1e-10);
	const readings: Array<{ wavenumber: number; growthRate: number }> = [];
	let maximumGrowth = Number.NEGATIVE_INFINITY;
	let fastestWavenumber = 0;
	for (let index = 0; index < samples; index += 1) {
		const wavenumber = (maximumWavenumber * index) / (samples - 1);
		const k2 = wavenumber * wavenumber;
		const growthRate = maximumRealEigenvalue([
			jacobian.matrix[0] - setup.diffusionU * k2,
			jacobian.matrix[1],
			jacobian.matrix[2],
			jacobian.matrix[3] - setup.diffusionV * k2
		]);
		readings.push({ wavenumber, growthRate });
		if (growthRate > maximumGrowth) {
			maximumGrowth = growthRate;
			fastestWavenumber = wavenumber;
		}
	}
	const zeroModeGrowth = readings[0].growthRate;
	let classification: TuringClassification;
	if (zeroModeGrowth > tolerance) {
		classification = 'reaction-unstable';
	} else if (zeroModeGrowth < -tolerance && maximumGrowth > tolerance && fastestWavenumber > 0) {
		classification = 'classical-diffusion-driven';
	} else if (Math.abs(zeroModeGrowth) <= tolerance || Math.abs(maximumGrowth) <= tolerance) {
		classification = 'near-boundary';
	} else {
		classification = 'linearly-stable';
	}
	const fastest =
		classification === 'classical-diffusion-driven' && fastestWavenumber > 0
			? fastestWavenumber
			: null;
	const fundamentalWavenumber = (2 * Math.PI) / setup.domainSize;
	const scanSpacing = maximumWavenumber / (samples - 1);
	const resolved =
		fastest !== null &&
		fastest >= fundamentalWavenumber &&
		fastest <= nyquistWavenumber * 0.8 &&
		fastest < maximumWavenumber - scanSpacing / 2 &&
		maximumWavenumber <= nyquistWavenumber * (1 + 1e-12);
	return {
		equilibrium,
		jacobian,
		classification,
		zeroModeGrowth,
		maximumGrowth,
		fastestWavenumber: fastest,
		predictedWavelength: fastest === null ? null : (2 * Math.PI) / fastest,
		nyquistWavenumber,
		resolved,
		samples: readings
	};
}
