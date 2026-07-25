export type OdeDerivative = (
	t: number,
	state: Readonly<Float64Array>,
	output: Float64Array
) => void;

export interface Rk4Workspace {
	k1: Float64Array;
	k2: Float64Array;
	k3: Float64Array;
	k4: Float64Array;
	temporary: Float64Array;
}

export function createRk4Workspace(dimension: number): Rk4Workspace {
	if (!Number.isInteger(dimension) || dimension < 1) {
		throw new RangeError('RK4 dimension must be a positive integer.');
	}
	return {
		k1: new Float64Array(dimension),
		k2: new Float64Array(dimension),
		k3: new Float64Array(dimension),
		k4: new Float64Array(dimension),
		temporary: new Float64Array(dimension)
	};
}

/**
 * Fixed-step classical RK4. Callers may reuse both output and workspace so the
 * integration loop performs no array allocation.
 */
export function rk4StepInto(
	state: Readonly<Float64Array>,
	t: number,
	dt: number,
	derivative: OdeDerivative,
	output: Float64Array,
	workspace: Rk4Workspace
): Float64Array {
	const dimension = state.length;
	if (output.length !== dimension)
		throw new RangeError('RK4 output dimension does not match state.');
	for (const buffer of [
		workspace.k1,
		workspace.k2,
		workspace.k3,
		workspace.k4,
		workspace.temporary
	]) {
		if (buffer.length !== dimension)
			throw new RangeError('RK4 workspace dimension does not match state.');
	}
	if (!Number.isFinite(t) || !Number.isFinite(dt) || dt <= 0) {
		throw new RangeError('RK4 time and positive step must be finite.');
	}

	derivative(t, state, workspace.k1);
	for (let index = 0; index < dimension; index += 1) {
		workspace.temporary[index] = state[index] + (dt * workspace.k1[index]) / 2;
	}
	derivative(t + dt / 2, workspace.temporary, workspace.k2);
	for (let index = 0; index < dimension; index += 1) {
		workspace.temporary[index] = state[index] + (dt * workspace.k2[index]) / 2;
	}
	derivative(t + dt / 2, workspace.temporary, workspace.k3);
	for (let index = 0; index < dimension; index += 1) {
		workspace.temporary[index] = state[index] + dt * workspace.k3[index];
	}
	derivative(t + dt, workspace.temporary, workspace.k4);
	for (let index = 0; index < dimension; index += 1) {
		output[index] =
			state[index] +
			(dt / 6) *
				(workspace.k1[index] +
					2 * workspace.k2[index] +
					2 * workspace.k3[index] +
					workspace.k4[index]);
		if (!Number.isFinite(output[index])) {
			throw new RangeError(`RK4 produced a non-finite state at component ${index}.`);
		}
	}
	return output;
}

export function rk4Step(
	state: Readonly<Float64Array>,
	t: number,
	dt: number,
	derivative: OdeDerivative
): Float64Array {
	const output = new Float64Array(state.length);
	return rk4StepInto(state, t, dt, derivative, output, createRk4Workspace(state.length));
}
