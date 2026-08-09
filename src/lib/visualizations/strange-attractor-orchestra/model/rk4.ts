import type { DerivativeFunction } from './systems';

export interface Rk4Workspace {
	readonly k1: Float64Array;
	readonly k2: Float64Array;
	readonly k3: Float64Array;
	readonly k4: Float64Array;
	readonly temporary: Float64Array;
}

export function createRk4Workspace(dimension: number): Rk4Workspace {
	if (!Number.isSafeInteger(dimension) || dimension < 1) {
		throw new RangeError('RK4 dimension must be a positive safe integer.');
	}
	return {
		k1: new Float64Array(dimension),
		k2: new Float64Array(dimension),
		k3: new Float64Array(dimension),
		k4: new Float64Array(dimension),
		temporary: new Float64Array(dimension)
	};
}

/** Advances one fixed RK4 step in place and returns the largest evaluated derivative. */
export function rk4StepInPlace(
	state: Float64Array,
	stepSize: number,
	parameters: Readonly<Record<string, number>>,
	derivative: DerivativeFunction,
	workspace: Rk4Workspace
): number {
	if (!Number.isFinite(stepSize) || stepSize <= 0) {
		throw new RangeError('RK4 step size must be finite and positive.');
	}
	const { k1, k2, k3, k4, temporary } = workspace;
	if ([k1, k2, k3, k4, temporary].some((array) => array.length !== state.length)) {
		throw new RangeError('RK4 workspace dimension does not match the state.');
	}
	derivative(state, parameters, k1);
	for (let index = 0; index < state.length; index += 1) {
		temporary[index] = state[index] + (stepSize * k1[index]) / 2;
	}
	derivative(temporary, parameters, k2);
	for (let index = 0; index < state.length; index += 1) {
		temporary[index] = state[index] + (stepSize * k2[index]) / 2;
	}
	derivative(temporary, parameters, k3);
	for (let index = 0; index < state.length; index += 1) {
		temporary[index] = state[index] + stepSize * k3[index];
	}
	derivative(temporary, parameters, k4);

	let maximumDerivative = 0;
	for (let index = 0; index < state.length; index += 1) {
		maximumDerivative = Math.max(
			maximumDerivative,
			Math.abs(k1[index]),
			Math.abs(k2[index]),
			Math.abs(k3[index]),
			Math.abs(k4[index])
		);
		state[index] += (stepSize / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]);
	}
	return maximumDerivative;
}
