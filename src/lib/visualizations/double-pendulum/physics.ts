import {
	assertFiniteState,
	assertValidParameters,
	type BobPositions,
	type PendulumParameters,
	type PendulumState
} from './types';

const MIN_DENOMINATOR = 1e-15;

/**
 * Exact derivatives for the ideal, frictionless planar double pendulum.
 * Angles are measured from downward vertical and all quantities use SI units.
 */
export function derivativesInto(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	out: PendulumState
): PendulumState {
	assertFiniteState(state);
	assertValidParameters(parameters);

	const { theta1, omega1, theta2, omega2 } = state;
	const { m1, m2, l1, l2, g } = parameters;
	const delta = theta1 - theta2;
	const sinTheta1 = Math.sin(theta1);
	const sinTheta1MinusTwoTheta2 = Math.sin(theta1 - 2 * theta2);
	const sinDelta = Math.sin(delta);
	const cosDelta = Math.cos(delta);
	const shared = 2 * m1 + m2 - m2 * Math.cos(2 * delta);
	const denominator1 = l1 * shared;
	const denominator2 = l2 * shared;

	if (
		!Number.isFinite(shared) ||
		Math.abs(denominator1) < MIN_DENOMINATOR ||
		Math.abs(denominator2) < MIN_DENOMINATOR
	) {
		throw new RangeError('Double-pendulum equations reached a singular denominator.');
	}

	out.theta1 = omega1;
	const acceleration1 =
		(-g * (2 * m1 + m2) * sinTheta1 -
			m2 * g * sinTheta1MinusTwoTheta2 -
			2 * m2 * sinDelta * (omega2 * omega2 * l2 + omega1 * omega1 * l1 * cosDelta)) /
		denominator1;
	out.omega1 = acceleration1 === 0 ? 0 : acceleration1;
	out.theta2 = omega2;
	const acceleration2 =
		(2 *
			sinDelta *
			(omega1 * omega1 * l1 * (m1 + m2) +
				g * (m1 + m2) * Math.cos(theta1) +
				omega2 * omega2 * l2 * m2 * cosDelta)) /
		denominator2;
	out.omega2 = acceleration2 === 0 ? 0 : acceleration2;

	assertFiniteState(out, 'Double-pendulum derivative');
	return out;
}

export function derivatives(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>
): PendulumState {
	return derivativesInto(state, parameters, {
		theta1: 0,
		omega1: 0,
		theta2: 0,
		omega2: 0
	});
}

export const derivative = derivatives;
export const derivativeInto = derivativesInto;

export function bobPositionsInto(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	out: BobPositions
): BobPositions {
	assertFiniteState(state);
	assertValidParameters(parameters);
	const x1 = parameters.l1 * Math.sin(state.theta1);
	const y1 = parameters.l1 * Math.cos(state.theta1);
	out.x1 = x1;
	out.y1 = y1;
	out.x2 = x1 + parameters.l2 * Math.sin(state.theta2);
	out.y2 = y1 + parameters.l2 * Math.cos(state.theta2);
	return out;
}

export function bobPositions(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>
): BobPositions {
	return bobPositionsInto(state, parameters, { x1: 0, y1: 0, x2: 0, y2: 0 });
}

export function lowerBobPositionInto(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	out: { x: number; y: number }
): { x: number; y: number } {
	assertFiniteState(state);
	assertValidParameters(parameters);
	out.x = parameters.l1 * Math.sin(state.theta1) + parameters.l2 * Math.sin(state.theta2);
	out.y = parameters.l1 * Math.cos(state.theta1) + parameters.l2 * Math.cos(state.theta2);
	return out;
}

export function lowerBobPosition(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>
): { x: number; y: number } {
	return lowerBobPositionInto(state, parameters, { x: 0, y: 0 });
}
