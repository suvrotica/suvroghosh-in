import type { BZSetup, OregonatorParameters, ReactionPair, SchnakenbergParameters } from './types';

export class OregonatorDenominatorError extends RangeError {
	readonly u: number;
	readonly q: number;

	constructor(u: number, q: number) {
		super(
			'The Oregonator denominator u + q is singular or numerically indistinguishable from zero.'
		);
		this.name = 'OregonatorDenominatorError';
		this.u = u;
		this.q = q;
	}
}

function finiteInputs(values: readonly number[], label: string): void {
	if (!values.every(Number.isFinite)) throw new RangeError(`${label} inputs must be finite.`);
}

/**
 * Dimensionless Tyson–Fife two-variable Oregonator reaction term:
 * du/dt = [u(1-u) - f v (u-q)/(u+q)] / epsilon; dv/dt = u-v.
 */
export function oregonatorReaction(
	u: number,
	v: number,
	parameters: Readonly<OregonatorParameters>
): ReactionPair {
	const { epsilon, q, f } = parameters;
	finiteInputs([u, v, epsilon, q, f], 'Oregonator');
	if (!(epsilon > 0) || !(q > 0)) {
		throw new RangeError('Oregonator epsilon and q must be positive.');
	}
	const denominator = u + q;
	const singularTolerance = 16 * Number.EPSILON * Math.max(1, Math.abs(u), Math.abs(q));
	if (Math.abs(denominator) <= singularTolerance) throw new OregonatorDenominatorError(u, q);
	return {
		u: (u * (1 - u) - (f * v * (u - q)) / denominator) / epsilon,
		v: u - v
	};
}

/** Schnakenberg reaction term: gamma(a-u+u²v), gamma(b-u²v). */
export function schnakenbergReaction(
	u: number,
	v: number,
	parameters: Readonly<SchnakenbergParameters>
): ReactionPair {
	const { a, b, gamma } = parameters;
	finiteInputs([u, v, a, b, gamma], 'Schnakenberg');
	if (a < 0 || b < 0 || !(gamma > 0)) {
		throw new RangeError('Schnakenberg a and b must be non-negative and gamma positive.');
	}
	const autocatalysis = u * u * v;
	return {
		u: gamma * (a - u + autocatalysis),
		v: gamma * (b - autocatalysis)
	};
}

export function reactionForSetup(u: number, v: number, setup: Readonly<BZSetup>): ReactionPair {
	return setup.model === 'oregonator'
		? oregonatorReaction(u, v, setup.parameters)
		: schnakenbergReaction(u, v, setup.parameters);
}

export function schnakenbergEquilibrium(
	parameters: Pick<SchnakenbergParameters, 'a' | 'b'>
): ReactionPair {
	finiteInputs([parameters.a, parameters.b], 'Schnakenberg equilibrium');
	const u = parameters.a + parameters.b;
	if (!(u > 0)) throw new RangeError('Schnakenberg equilibrium requires a + b > 0.');
	return { u, v: parameters.b / (u * u) };
}

/** The positive non-zero homogeneous Oregonator equilibrium; (0, 0) is the other one. */
export function oregonatorRecoveredEquilibrium(
	parameters: Pick<OregonatorParameters, 'q' | 'f'>
): ReactionPair {
	finiteInputs([parameters.q, parameters.f], 'Oregonator equilibrium');
	if (!(parameters.q > 0) || parameters.f < 0) {
		throw new RangeError('Oregonator equilibrium requires q > 0 and f >= 0.');
	}
	const linear = 1 - parameters.q - parameters.f;
	const discriminant = linear * linear + 4 * parameters.q * (1 + parameters.f);
	const u = (linear + Math.sqrt(discriminant)) / 2;
	return { u, v: u };
}

export function recoveredStateForSetup(setup: Readonly<BZSetup>): ReactionPair {
	return setup.model === 'oregonator'
		? oregonatorRecoveredEquilibrium(setup.parameters)
		: schnakenbergEquilibrium(setup.parameters);
}
