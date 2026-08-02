import {
	assertFiniteState,
	assertValidParameters,
	cloneState,
	PENDULUM_STATE_KEYS,
	type LyapunovAccumulator,
	type LyapunovReading,
	type PendulumParameters,
	type PendulumState,
	type PerturbationDimension,
	type PoincareCrossing,
	type PoincareSection
} from './types';

export const TWO_PI = 2 * Math.PI;
export const DEFAULT_POINCARE_SECTION: Readonly<PoincareSection> = Object.freeze({
	angle: 'theta2',
	value: 0,
	direction: 'positive'
});
export const DEFAULT_LYAPUNOV_EVIDENCE_TIME = 2;
const MAX_RENORMALIZATION_DISTANCE = 1e12;

export function energy(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>
): number {
	assertFiniteState(state);
	assertValidParameters(parameters);
	const { theta1, omega1, theta2, omega2 } = state;
	const { m1, m2, l1, l2, g } = parameters;
	const kinetic =
		0.5 * (m1 + m2) * l1 * l1 * omega1 * omega1 +
		0.5 * m2 * l2 * l2 * omega2 * omega2 +
		m2 * l1 * l2 * omega1 * omega2 * Math.cos(theta1 - theta2);
	const potential = -(m1 + m2) * g * l1 * Math.cos(theta1) - m2 * g * l2 * Math.cos(theta2);
	const total = kinetic + potential;
	if (!Number.isFinite(total)) throw new RangeError('Mechanical energy became non-finite.');
	return total;
}

export const mechanicalEnergy = energy;

export function relativeEnergyDifference(
	currentEnergy: number,
	referenceEnergy: number,
	epsilon = 1e-12
): number {
	if (
		!Number.isFinite(currentEnergy) ||
		!Number.isFinite(referenceEnergy) ||
		!Number.isFinite(epsilon) ||
		epsilon <= 0
	) {
		return Number.NaN;
	}
	return Math.abs(currentEnergy - referenceEnergy) / Math.max(Math.abs(referenceEnergy), epsilon);
}

export function relativeEnergyError(
	state: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>,
	referenceEnergy: number,
	epsilon = 1e-12
): number {
	return relativeEnergyDifference(energy(state, parameters), referenceEnergy, epsilon);
}

/** Signed shortest difference a − b in the half-open interval [−π, π). */
export function wrappedAngleDifference(a: number, b: number): number {
	if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
	const difference = a - b;
	if (difference >= -Math.PI && difference < Math.PI) {
		return Object.is(difference, -0) ? 0 : difference;
	}
	const wrapped = ((((difference + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
	return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function wrapAngle(angle: number): number {
	return wrappedAngleDifference(angle, 0);
}

export function characteristicTime(parameters: Readonly<PendulumParameters>): number {
	assertValidParameters(parameters);
	return Math.sqrt((parameters.l1 + parameters.l2) / (2 * parameters.g));
}

export function scaledPhaseDistance(
	a: Readonly<PendulumState>,
	b: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>
): number {
	assertFiniteState(a);
	assertFiniteState(b);
	const tau = characteristicTime(parameters);
	const deltaTheta1 = wrappedAngleDifference(a.theta1, b.theta1);
	const deltaTheta2 = wrappedAngleDifference(a.theta2, b.theta2);
	const deltaOmega1 = tau * (a.omega1 - b.omega1);
	const deltaOmega2 = tau * (a.omega2 - b.omega2);
	return Math.hypot(deltaTheta1, deltaTheta2, deltaOmega1, deltaOmega2);
}

/** Lower-bob separation in metres, calculated without temporary objects. */
export function lowerBobSeparation(
	a: Readonly<PendulumState>,
	b: Readonly<PendulumState>,
	parameters: Readonly<PendulumParameters>
): number {
	assertFiniteState(a);
	assertFiniteState(b);
	assertValidParameters(parameters);
	const ax = parameters.l1 * Math.sin(a.theta1) + parameters.l2 * Math.sin(a.theta2);
	const ay = parameters.l1 * Math.cos(a.theta1) + parameters.l2 * Math.cos(a.theta2);
	const bx = parameters.l1 * Math.sin(b.theta1) + parameters.l2 * Math.sin(b.theta2);
	const by = parameters.l1 * Math.cos(b.theta1) + parameters.l2 * Math.cos(b.theta2);
	return Math.hypot(ax - bx, ay - by);
}

export function createPerturbedState(
	state: Readonly<PendulumState>,
	dimension: PerturbationDimension,
	magnitude: number,
	out: PendulumState = cloneState(state)
): PendulumState {
	assertFiniteState(state);
	if (!Number.isFinite(magnitude)) throw new RangeError('Perturbation must be finite.');
	if (!PENDULUM_STATE_KEYS.includes(dimension)) {
		throw new RangeError('Perturbation dimension must name a pendulum state component.');
	}
	out.theta1 = state.theta1;
	out.omega1 = state.omega1;
	out.theta2 = state.theta2;
	out.omega2 = state.omega2;
	out[dimension] += magnitude;
	assertFiniteState(out, 'Perturbed state');
	return out;
}

/**
 * Benettin renormalization in the dimensionally scaled phase metric. The same
 * scalar rescales all raw components because the metric is homogeneous.
 */
export function renormalizeShadow(
	primary: Readonly<PendulumState>,
	shadow: Readonly<PendulumState>,
	epsilon: number,
	parameters: Readonly<PendulumParameters>,
	out: PendulumState = cloneState(shadow)
): PendulumState | null {
	assertFiniteState(primary);
	assertFiniteState(shadow);
	assertValidParameters(parameters);
	if (!Number.isFinite(epsilon) || epsilon <= 0) return null;
	if (out === primary) return null;

	const deltaTheta1 = wrappedAngleDifference(shadow.theta1, primary.theta1);
	const deltaTheta2 = wrappedAngleDifference(shadow.theta2, primary.theta2);
	const deltaOmega1 = shadow.omega1 - primary.omega1;
	const deltaOmega2 = shadow.omega2 - primary.omega2;
	const distance = scaledPhaseDistance(primary, shadow, parameters);
	if (
		!Number.isFinite(distance) ||
		distance <= Number.EPSILON ||
		distance > MAX_RENORMALIZATION_DISTANCE
	) {
		return null;
	}

	const scale = epsilon / distance;
	out.theta1 = primary.theta1 + deltaTheta1 * scale;
	out.omega1 = primary.omega1 + deltaOmega1 * scale;
	out.theta2 = primary.theta2 + deltaTheta2 * scale;
	out.omega2 = primary.omega2 + deltaOmega2 * scale;
	return Number.isFinite(scale) && Number.isFinite(scaledPhaseDistance(primary, out, parameters))
		? out
		: null;
}

export function accumulateBenettinGrowth(
	accumulator: LyapunovAccumulator,
	distance: number,
	epsilon: number,
	interval: number
): boolean {
	if (
		!Number.isFinite(accumulator.accumulatedLogGrowth) ||
		!Number.isFinite(accumulator.elapsedTime) ||
		accumulator.elapsedTime < 0 ||
		!Number.isSafeInteger(accumulator.renormalizations) ||
		accumulator.renormalizations < 0 ||
		!Number.isFinite(distance) ||
		distance <= 0 ||
		distance > MAX_RENORMALIZATION_DISTANCE ||
		!Number.isFinite(epsilon) ||
		epsilon <= 0 ||
		!Number.isFinite(interval) ||
		interval <= 0
	) {
		return false;
	}
	const growth = Math.log(distance / epsilon);
	if (!Number.isFinite(growth)) return false;
	const nextGrowth = accumulator.accumulatedLogGrowth + growth;
	const nextElapsedTime = accumulator.elapsedTime + interval;
	const nextRenormalizations = accumulator.renormalizations + 1;
	if (
		!Number.isFinite(nextGrowth) ||
		!Number.isFinite(nextElapsedTime) ||
		!Number.isSafeInteger(nextRenormalizations)
	) {
		return false;
	}
	accumulator.accumulatedLogGrowth = nextGrowth;
	accumulator.elapsedTime = nextElapsedTime;
	accumulator.renormalizations = nextRenormalizations;
	return true;
}

export function lyapunovReading(
	accumulator: Readonly<LyapunovAccumulator>,
	minimumEvidenceTime = DEFAULT_LYAPUNOV_EVIDENCE_TIME
): LyapunovReading {
	const base = { ...accumulator };
	const evidenceTime =
		Number.isFinite(minimumEvidenceTime) && minimumEvidenceTime >= 0
			? minimumEvidenceTime
			: DEFAULT_LYAPUNOV_EVIDENCE_TIME;
	if (
		!Number.isFinite(accumulator.accumulatedLogGrowth) ||
		!Number.isFinite(accumulator.elapsedTime) ||
		accumulator.elapsedTime < 0 ||
		!Number.isInteger(accumulator.renormalizations) ||
		accumulator.renormalizations < 0
	) {
		return { ...base, estimate: null, eFoldingTime: null, status: 'invalid' };
	}
	if (accumulator.elapsedTime < evidenceTime || accumulator.renormalizations < 2) {
		return { ...base, estimate: null, eFoldingTime: null, status: 'not-enough-evidence' };
	}
	const estimate = accumulator.accumulatedLogGrowth / accumulator.elapsedTime;
	if (!Number.isFinite(estimate)) {
		return { ...base, estimate: null, eFoldingTime: null, status: 'invalid' };
	}
	if (estimate <= 0) {
		return { ...base, estimate, eFoldingTime: null, status: 'non-positive' };
	}
	return { ...base, estimate, eFoldingTime: 1 / estimate, status: 'available' };
}

function crossingCoordinate(
	start: number,
	end: number,
	value: number,
	direction: PoincareSection['direction']
): { crossing: number; fraction: number; direction: 'positive' | 'negative' } | null {
	const delta = end - start;
	if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > Math.PI) return null;
	const actualDirection = delta > 0 ? 'positive' : 'negative';
	if (direction !== 'either' && direction !== actualDirection) return null;

	let crossing: number;
	if (delta > 0) {
		crossing = value + TWO_PI * (Math.floor((start - value) / TWO_PI) + 1);
		if (!(start < crossing && crossing <= end)) return null;
	} else {
		crossing = value + TWO_PI * (Math.ceil((start - value) / TWO_PI) - 1);
		if (!(end <= crossing && crossing < start)) return null;
	}
	return { crossing, fraction: (crossing - start) / delta, direction: actualDirection };
}

function interpolateLinear(a: number, b: number, fraction: number): number {
	return a + (b - a) * fraction;
}

function interpolateAngle(a: number, b: number, fraction: number): number {
	const rawDelta = b - a;
	const delta = Math.abs(rawDelta) <= Math.PI ? rawDelta : wrappedAngleDifference(b, a);
	return a + delta * fraction;
}

/** Detect and linearly interpolate a periodic Poincaré-section crossing. */
export function detectPoincareCrossing(
	previous: Readonly<PendulumState>,
	current: Readonly<PendulumState>,
	section: Readonly<PoincareSection> = DEFAULT_POINCARE_SECTION
): PoincareCrossing | null {
	assertFiniteState(previous, 'Previous Poincaré state');
	assertFiniteState(current, 'Current Poincaré state');
	if (!Number.isFinite(section.value)) return null;
	const start = previous[section.angle];
	const end = current[section.angle];
	const hit = crossingCoordinate(start, end, section.value, section.direction);
	if (!hit) return null;
	const result: PoincareCrossing = {
		theta1: interpolateAngle(previous.theta1, current.theta1, hit.fraction),
		omega1: interpolateLinear(previous.omega1, current.omega1, hit.fraction),
		theta2: interpolateAngle(previous.theta2, current.theta2, hit.fraction),
		omega2: interpolateLinear(previous.omega2, current.omega2, hit.fraction),
		fraction: hit.fraction,
		direction: hit.direction
	};
	result[section.angle] = hit.crossing;
	const crossingVelocity = section.angle === 'theta1' ? result.omega1 : result.omega2;
	if (
		(hit.direction === 'positive' && crossingVelocity <= 0) ||
		(hit.direction === 'negative' && crossingVelocity >= 0)
	) {
		return null;
	}
	return result;
}

export const interpolatePoincareCrossing = detectPoincareCrossing;
