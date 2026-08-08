import { cellCoordinate, createBZMasks } from './mask';
import { createBZRandom } from './prng';
import { recoveredStateForSetup, schnakenbergEquilibrium } from './reactions';
import { assertValidBZSetup } from './validation';
import type { BZFieldState, BZSetup, ReactionPair } from './types';

export function assertValidBZFieldState(state: Readonly<BZFieldState>): void {
	if (!Number.isInteger(state.size) || state.size < 2)
		throw new RangeError('Field size is invalid.');
	const length = state.size * state.size;
	if (
		state.u.length !== length ||
		state.v.length !== length ||
		state.mask.length !== length ||
		state.domainMask.length !== length
	) {
		throw new RangeError('Field arrays do not match the declared square grid.');
	}
	for (let index = 0; index < length; index += 1) {
		if (state.domainMask[index] > 1 || state.mask[index] > 1) {
			throw new RangeError('Field masks must contain only zero or one.');
		}
		if (state.mask[index] && !state.domainMask[index]) {
			throw new RangeError('The active mask cannot extend outside the immutable domain mask.');
		}
	}
}

export function cloneBZFieldState(state: Readonly<BZFieldState>): BZFieldState {
	assertValidBZFieldState(state);
	return {
		size: state.size,
		u: new Float64Array(state.u),
		v: new Float64Array(state.v),
		domainMask: new Uint8Array(state.domainMask),
		mask: new Uint8Array(state.mask)
	};
}

function modelExcitedState(setup: Readonly<BZSetup>, equilibrium: ReactionPair): ReactionPair {
	return setup.model === 'oregonator'
		? { u: 0.8, v: Math.max(0.012, equilibrium.v * 0.75) }
		: { u: equilibrium.u * 1.16, v: equilibrium.v * 0.94 };
}

function modelRefractoryState(setup: Readonly<BZSetup>, equilibrium: ReactionPair): ReactionPair {
	return setup.model === 'oregonator'
		? { u: Math.max(0.02, equilibrium.u * 1.4), v: 0.28 }
		: { u: equilibrium.u * 0.92, v: equilibrium.v * 1.1 };
}

function writePair(u: Float64Array, v: Float64Array, index: number, pair: ReactionPair): void {
	u[index] = pair.u;
	v[index] = pair.v;
}

export function createInitialBZField(setup: Readonly<BZSetup>): BZFieldState {
	assertValidBZSetup(setup);
	const size = setup.gridSize;
	const length = size * size;
	const u = new Float64Array(length);
	const v = new Float64Array(length);
	const { domainMask, mask } = createBZMasks(setup);
	const equilibrium = recoveredStateForSetup(setup);
	const excited = modelExcitedState(setup, equilibrium);
	const refractory = modelRefractoryState(setup, equilibrium);
	const random = createBZRandom(setup.seed, `initial:${setup.initialCondition}`);
	const scale = setup.geometry === 'circular-dish' ? setup.activeRadius : setup.domainSize / 2;

	for (let index = 0; index < length; index += 1) {
		if (mask[index]) writePair(u, v, index, equilibrium);
	}

	if (setup.initialCondition === 'uniform-equilibrium') {
		return { size, u, v, domainMask, mask };
	}
	if (setup.initialCondition === 'uniform-clock') {
		const phase =
			setup.model === 'oregonator'
				? { u: Math.max(0.08, equilibrium.u * 5), v: Math.max(0.006, equilibrium.v * 0.55) }
				: schnakenbergEquilibrium(setup.parameters);
		for (let index = 0; index < length; index += 1) {
			if (mask[index]) writePair(u, v, index, phase);
		}
		return { size, u, v, domainMask, mask };
	}

	let noiseSumU = 0;
	let noiseSumV = 0;
	let noiseCount = 0;
	const noiseU = new Float64Array(length);
	const noiseV = new Float64Array(length);
	for (let row = 0; row < size; row += 1) {
		const y = cellCoordinate(row, size, setup.domainSize);
		for (let column = 0; column < size; column += 1) {
			const x = cellCoordinate(column, size, setup.domainSize);
			const index = row * size + column;
			if (!mask[index]) continue;
			if (setup.initialCondition === 'target-wave' || setup.initialCondition === 'pacemaker') {
				if (Math.hypot(x, y) <= scale * 0.075) writePair(u, v, index, excited);
			} else if (setup.initialCondition === 'broken-front') {
				const frontX = -0.14 * scale;
				const onSegment = y >= -0.68 * scale && y <= 0.34 * scale;
				if (onSegment && Math.abs(x - frontX) <= 0.035 * scale) {
					writePair(u, v, index, excited);
				} else if (onSegment && x < frontX - 0.035 * scale && x >= frontX - 0.2 * scale) {
					writePair(u, v, index, refractory);
				}
			} else if (setup.initialCondition === 'paired-fronts') {
				const left = -0.4 * scale;
				const right = 0.4 * scale;
				const withinY = Math.abs(y) <= 0.7 * scale;
				if (
					withinY &&
					(Math.abs(x - left) <= 0.035 * scale || Math.abs(x - right) <= 0.035 * scale)
				) {
					writePair(u, v, index, excited);
				} else if (
					withinY &&
					((x < left - 0.035 * scale && x >= left - 0.2 * scale) ||
						(x > right + 0.035 * scale && x <= right + 0.2 * scale))
				) {
					writePair(u, v, index, refractory);
				}
			} else if (
				setup.initialCondition === 'heterogeneity' ||
				setup.initialCondition === 'turing-noise'
			) {
				const amplitude =
					setup.model === 'oregonator'
						? Math.min(equilibrium.u, equilibrium.v) *
							(setup.initialCondition === 'turing-noise' ? 0.2 : 0.1)
						: setup.initialCondition === 'turing-noise'
							? 0.012
							: 0.003;
				const du = (random.next() * 2 - 1) * amplitude;
				const dv = (random.next() * 2 - 1) * amplitude;
				noiseU[index] = du;
				noiseV[index] = dv;
				noiseSumU += du;
				noiseSumV += dv;
				noiseCount += 1;
			}
		}
	}
	if (noiseCount > 0) {
		const meanNoiseU = noiseSumU / noiseCount;
		const meanNoiseV = noiseSumV / noiseCount;
		for (let index = 0; index < length; index += 1) {
			if (!mask[index]) continue;
			u[index] += noiseU[index] - meanNoiseU;
			v[index] += noiseV[index] - meanNoiseV;
		}
	}
	return { size, u, v, domainMask, mask };
}
