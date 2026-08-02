import { derivativesInto } from './physics';
import {
	assertFiniteState,
	assertValidParameters,
	createState,
	type IntegratorKind,
	type PendulumParameters,
	type PendulumState
} from './types';

export interface Rk4Workspace {
	k1: PendulumState;
	k2: PendulumState;
	k3: PendulumState;
	k4: PendulumState;
	temporary: PendulumState;
}

export interface EulerWorkspace {
	derivative: PendulumState;
}

export const DEFAULT_TIMESTEP = 1 / 240;
export const MIN_TIMESTEP = 1 / 20_000;
export const MAX_TIMESTEP = 1 / 10;

export function createRk4Workspace(): Rk4Workspace {
	return {
		k1: createState(),
		k2: createState(),
		k3: createState(),
		k4: createState(),
		temporary: createState()
	};
}

export function createEulerWorkspace(): EulerWorkspace {
	return { derivative: createState() };
}

function assertTimestep(dt: number): void {
	if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_TIMESTEP) {
		throw new RangeError(`Timestep must be finite and in (0, ${MAX_TIMESTEP}] seconds.`);
	}
}

function setLinearCombination(
	out: PendulumState,
	state: Readonly<PendulumState>,
	derivativeState: Readonly<PendulumState>,
	scale: number
): void {
	out.theta1 = state.theta1 + scale * derivativeState.theta1;
	out.omega1 = state.omega1 + scale * derivativeState.omega1;
	out.theta2 = state.theta2 + scale * derivativeState.theta2;
	out.omega2 = state.omega2 + scale * derivativeState.omega2;
}

/** Fixed-step classical RK4 with an optional reusable, allocation-free workspace. */
export function rk4StepInto(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	dt: number,
	out: PendulumState,
	workspace: Rk4Workspace = createRk4Workspace()
): PendulumState {
	assertFiniteState(state);
	assertValidParameters(parameters);
	assertTimestep(dt);

	derivativesInto(state, parameters, workspace.k1);
	setLinearCombination(workspace.temporary, state, workspace.k1, dt / 2);
	derivativesInto(workspace.temporary, parameters, workspace.k2);
	setLinearCombination(workspace.temporary, state, workspace.k2, dt / 2);
	derivativesInto(workspace.temporary, parameters, workspace.k3);
	setLinearCombination(workspace.temporary, state, workspace.k3, dt);
	derivativesInto(workspace.temporary, parameters, workspace.k4);

	out.theta1 =
		state.theta1 +
		(dt / 6) *
			(workspace.k1.theta1 +
				2 * workspace.k2.theta1 +
				2 * workspace.k3.theta1 +
				workspace.k4.theta1);
	out.omega1 =
		state.omega1 +
		(dt / 6) *
			(workspace.k1.omega1 +
				2 * workspace.k2.omega1 +
				2 * workspace.k3.omega1 +
				workspace.k4.omega1);
	out.theta2 =
		state.theta2 +
		(dt / 6) *
			(workspace.k1.theta2 +
				2 * workspace.k2.theta2 +
				2 * workspace.k3.theta2 +
				workspace.k4.theta2);
	out.omega2 =
		state.omega2 +
		(dt / 6) *
			(workspace.k1.omega2 +
				2 * workspace.k2.omega2 +
				2 * workspace.k3.omega2 +
				workspace.k4.omega2);

	assertFiniteState(out, 'RK4 result');
	return out;
}

export function rk4Step(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	dt: number
): PendulumState {
	return rk4StepInto(state, parameters, dt, createState());
}

/** Explicit Euler exists only for the opt-in numerical-error demonstration. */
export function eulerStepInto(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	dt: number,
	out: PendulumState,
	workspace: EulerWorkspace = createEulerWorkspace()
): PendulumState {
	assertFiniteState(state);
	assertValidParameters(parameters);
	assertTimestep(dt);
	derivativesInto(state, parameters, workspace.derivative);
	setLinearCombination(out, state, workspace.derivative, dt);
	assertFiniteState(out, 'Euler result');
	return out;
}

export function eulerStep(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	dt: number
): PendulumState {
	return eulerStepInto(state, parameters, dt, createState());
}

export function integrateStepInto(
	integrator: IntegratorKind,
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	dt: number,
	out: PendulumState,
	workspace?: Rk4Workspace | EulerWorkspace
): PendulumState {
	if (integrator === 'rk4') {
		return rk4StepInto(state, parameters, dt, out, workspace as Rk4Workspace | undefined);
	}
	if (integrator === 'euler') {
		return eulerStepInto(state, parameters, dt, out, workspace as EulerWorkspace | undefined);
	}
	throw new RangeError(`Unknown integrator: ${String(integrator)}.`);
}
