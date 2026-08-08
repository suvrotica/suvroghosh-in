import { assertValidBZFieldState } from './initial-conditions';
import type { BZFieldMetrics, BZFieldState, HomogenizationReading } from './types';

export function activeAreaMetrics(state: Readonly<BZFieldState>): BZFieldMetrics {
	assertValidBZFieldState(state);
	let activeCells = 0;
	let meanU = 0;
	let meanV = 0;
	let m2U = 0;
	let m2V = 0;
	let minimumU = Number.POSITIVE_INFINITY;
	let maximumU = Number.NEGATIVE_INFINITY;
	let minimumV = Number.POSITIVE_INFINITY;
	let maximumV = Number.NEGATIVE_INFINITY;
	for (let index = 0; index < state.u.length; index += 1) {
		if (!state.mask[index]) continue;
		const u = state.u[index];
		const v = state.v[index];
		if (!Number.isFinite(u) || !Number.isFinite(v)) {
			throw new RangeError('Active-area metrics require finite fields.');
		}
		activeCells += 1;
		const deltaU = u - meanU;
		const deltaV = v - meanV;
		meanU += deltaU / activeCells;
		meanV += deltaV / activeCells;
		m2U += deltaU * (u - meanU);
		m2V += deltaV * (v - meanV);
		minimumU = Math.min(minimumU, u);
		maximumU = Math.max(maximumU, u);
		minimumV = Math.min(minimumV, v);
		maximumV = Math.max(maximumV, v);
	}
	if (activeCells === 0) throw new RangeError('At least one active cell is required.');
	const varianceU = Math.max(0, m2U / activeCells);
	const varianceV = Math.max(0, m2V / activeCells);
	const excitationThreshold = meanU + Math.sqrt(varianceU);
	let excitedCells = 0;
	if (varianceU > 0) {
		for (let index = 0; index < state.u.length; index += 1) {
			if (state.mask[index] && state.u[index] > excitationThreshold) excitedCells += 1;
		}
	}
	return {
		activeCells,
		meanU,
		meanV,
		varianceU,
		varianceV,
		minimumU,
		maximumU,
		minimumV,
		maximumV,
		excitedFraction: excitedCells / activeCells
	};
}

/**
 * Explicitly blends scientific state toward its active-area mean. This is the principal
 * spatial effect of stirring, not a fluid-dynamics model of a spoon, vortex, or meniscus.
 */
export function approximateHomogenization(
	state: BZFieldState,
	fraction: number
): HomogenizationReading {
	if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
		throw new RangeError('Homogenization fraction must lie in [0, 1].');
	}
	const before = activeAreaMetrics(state);
	const retain = 1 - fraction;
	for (let index = 0; index < state.u.length; index += 1) {
		if (!state.mask[index]) continue;
		state.u[index] = before.meanU + (state.u[index] - before.meanU) * retain;
		state.v[index] = before.meanV + (state.v[index] - before.meanV) * retain;
	}
	// Remove the tiny floating-point mean drift without changing inactive cells.
	let intermediate = activeAreaMetrics(state);
	const correctionU = intermediate.meanU - before.meanU;
	const correctionV = intermediate.meanV - before.meanV;
	for (let index = 0; index < state.u.length; index += 1) {
		if (!state.mask[index]) continue;
		state.u[index] -= correctionU;
		state.v[index] -= correctionV;
	}
	intermediate = activeAreaMetrics(state);
	return {
		label: 'Approximate homogenization',
		fraction,
		before,
		after: intermediate,
		meanDriftU: intermediate.meanU - before.meanU,
		meanDriftV: intermediate.meanV - before.meanV
	};
}
