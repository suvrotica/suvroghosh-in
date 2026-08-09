import type { AttractorId } from '../types';

export type DerivativeFunction = (
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
) => void;

export function lorenz63Derivative(
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const [x, y, z] = state;
	const sigma = parameters.sigma;
	const rho = parameters.rho;
	const beta = parameters.beta;
	out[0] = sigma * (y - x);
	out[1] = x * (rho - z) - y;
	out[2] = x * y - beta * z;
}

export function rosslerDerivative(
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const [x, y, z] = state;
	out[0] = -y - z;
	out[1] = x + parameters.a * y;
	out[2] = parameters.b + z * (x - parameters.c);
}

export function thomasDerivative(
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const [x, y, z] = state;
	const b = parameters.b;
	out[0] = Math.sin(y) - b * x;
	out[1] = Math.sin(z) - b * y;
	out[2] = Math.sin(x) - b * z;
}

export function sprottBDerivative(
	state: Float64Array,
	_parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const [x, y, z] = state;
	out[0] = y * z;
	out[1] = x - y;
	out[2] = 1 - x * y;
}

export function langfordDerivative(
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const [x, y, z] = state;
	const { a, b, c, d, e, f } = parameters;
	const radialSquared = x * x + y * y;
	out[0] = (z - b) * x - d * y;
	out[1] = d * x + (z - b) * y;
	out[2] = c + a * z - (z * z * z) / 3 - radialSquared * (1 + e * z) + f * z * x ** 3;
}

export function rucklidgeDerivative(
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const [x, y, z] = state;
	out[0] = -parameters.kappa * x + parameters.lambda * y - y * z;
	out[1] = x;
	out[2] = -z + y * y;
}

export function chuaNonlinearity(x: number, m0: number, m1: number): number {
	return m1 * x + ((m0 - m1) / 2) * (Math.abs(x + 1) - Math.abs(x - 1));
}

export function chuaDerivative(
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const [x, y, z] = state;
	const h = chuaNonlinearity(x, parameters.m0, parameters.m1);
	out[0] = parameters.alpha * (y - x - h);
	out[1] = x - y + z;
	out[2] = -parameters.beta * y;
}

export function rabinovichFabrikantDerivative(
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const [x, y, z] = state;
	const { a, b } = parameters;
	out[0] = y * (z - 1 + x * x) + a * x;
	out[1] = x * (3 * z + 1 - x * x) + a * y;
	out[2] = -2 * z * (b + x * y);
}

export const CONTINUOUS_DERIVATIVES: Readonly<Partial<Record<AttractorId, DerivativeFunction>>> =
	Object.freeze({
		'lorenz-63': lorenz63Derivative,
		rossler: rosslerDerivative,
		thomas: thomasDerivative,
		'sprott-b': sprottBDerivative,
		langford: langfordDerivative,
		rucklidge: rucklidgeDerivative,
		chua: chuaDerivative,
		'rabinovich-fabrikant': rabinovichFabrikantDerivative
	});

export function henonMapStep(
	state: Float64Array,
	parameters: Readonly<Record<string, number>>,
	out: Float64Array
): void {
	const x = state[0];
	const y = state[1];
	out[0] = 1 - parameters.a * x * x + y;
	out[1] = parameters.b * x;
}

export function mackeyGlassDerivative(
	current: number,
	delayed: number,
	parameters: Readonly<Record<string, number>>
): number {
	return (parameters.beta * delayed) / (1 + delayed ** parameters.n) - parameters.gamma * current;
}

export function exactDivergence(
	id: AttractorId,
	state: readonly number[],
	parameters: Readonly<Record<string, number>>
): number | null {
	switch (id) {
		case 'lorenz-63':
			return -(parameters.sigma + 1 + parameters.beta);
		case 'rossler':
			return parameters.a + state[0] - parameters.c;
		case 'thomas':
			return -3 * parameters.b;
		case 'sprott-b':
			return -1;
		case 'langford': {
			const [x, y, z] = state;
			return (
				2 * (z - parameters.b) +
				parameters.a -
				z * z -
				parameters.e * (x * x + y * y) +
				parameters.f * x ** 3
			);
		}
		case 'rucklidge':
			return -(parameters.kappa + 1);
		case 'chua': {
			const slope = Math.abs(state[0]) < 1 ? parameters.m0 : parameters.m1;
			return parameters.alpha * (-1 - slope) - 1;
		}
		case 'rabinovich-fabrikant':
			return 2 * parameters.a - 2 * parameters.b;
		default:
			return null;
	}
}
