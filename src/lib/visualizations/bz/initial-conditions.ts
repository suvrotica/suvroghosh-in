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

/*
 * Thirty-two measured points on the stable local cycle of the V2 oscillatory
 * Oregonator regime (epsilon=.05, q=.002, f=1.4). They are an initial-condition recipe,
 * never a display lookup: once written, the ordinary PDE advances every cell.
 * Keeping the values explicit also makes the seed checksum independent of a
 * hidden ODE warm-up.
 */
const V2_CYCLE_STATES: readonly ReactionPair[] = Object.freeze([
	{ u: 0.762558033862684, v: 0.129856136634903 },
	{ u: 0.630026935922347, v: 0.215553103296918 },
	{ u: 0.338567572359448, v: 0.257085351556686 },
	{ u: 0.00202484494893515, v: 0.233681889445079 },
	{ u: 0.00202920295032081, v: 0.199430279907851 },
	{ u: 0.0020343177683244, v: 0.170327810615103 },
	{ u: 0.00204036236505491, v: 0.145445019909287 },
	{ u: 0.00204746628110094, v: 0.124303390591049 },
	{ u: 0.00205587499092204, v: 0.106227714536862 },
	{ u: 0.00206577603465883, v: 0.0908703863935225 },
	{ u: 0.00207752191250394, v: 0.0777409407868441 },
	{ u: 0.00209138919752755, v: 0.0665869013955256 },
	{ u: 0.00210789243802397, v: 0.0570520572941996 },
	{ u: 0.0021274498951275, v: 0.0489530758351035 },
	{ u: 0.0021508301555411, v: 0.0420313400261938 },
	{ u: 0.0021786878328734, v: 0.0361538019986903 },
	{ u: 0.00221220919846358, v: 0.0311328387211357 },
	{ u: 0.00225246830863355, v: 0.0268720229359816 },
	{ u: 0.00230121689026757, v: 0.0232459339949673 },
	{ u: 0.00236084283096716, v: 0.0201535045622701 },
	{ u: 0.00243392349765759, v: 0.0175356728832707 },
	{ u: 0.0025250272277765, v: 0.0153094491354456 },
	{ u: 0.00263947338889118, v: 0.0134329661840094 },
	{ u: 0.00278690156492104, v: 0.0118477959091651 },
	{ u: 0.00298068099820642, v: 0.0105259170304464 },
	{ u: 0.00324727872376676, v: 0.00942942220198841 },
	{ u: 0.00363550960237267, v: 0.00854536812901327 },
	{ u: 0.00427277564943711, v: 0.00786330971128421 },
	{ u: 0.00558610660632422, v: 0.00741906566164789 },
	{ u: 0.0102914582259416, v: 0.00741351164831568 },
	{ u: 0.0537540854401814, v: 0.0098860866995029 },
	{ u: 0.433945922736483, v: 0.0382228733532034 }
]);

function cycleStateForPhase(phase: number): ReactionPair {
	const wrapped = ((phase % 1) + 1) % 1;
	const position = wrapped * V2_CYCLE_STATES.length;
	const lower = Math.floor(position) % V2_CYCLE_STATES.length;
	const upper = (lower + 1) % V2_CYCLE_STATES.length;
	const amount = position - Math.floor(position);
	return {
		u: V2_CYCLE_STATES[lower].u * (1 - amount) + V2_CYCLE_STATES[upper].u * amount,
		v: V2_CYCLE_STATES[lower].v * (1 - amount) + V2_CYCLE_STATES[upper].v * amount
	};
}

function vortexPhase(
	x: number,
	y: number,
	centres: readonly (readonly [number, number, number])[]
): number {
	let phase = 0;
	for (const [centreX, centreY, charge] of centres) {
		phase += (charge * Math.atan2(y - centreY, x - centreX)) / (2 * Math.PI);
	}
	return phase;
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
			if (setup.initialCondition === 'target-wave' || setup.initialCondition === 'central-pulse') {
				if (Math.hypot(x, y) <= scale * 0.075) writePair(u, v, index, excited);
			} else if (
				setup.initialCondition === 'pacemaker' ||
				setup.initialCondition === 'periodic-source'
			) {
				// A source is a scheduled intervention, not a painted pulse. These
				// recipes intentionally begin recovered so the preset's event log is
				// the sole cause of every firing, including the first one at step zero.
			} else if (setup.initialCondition === 'broken-front') {
				const frontX = -0.14 * scale;
				const onSegment = y >= -0.68 * scale && y <= 0.34 * scale;
				if (onSegment && Math.abs(x - frontX) <= 0.035 * scale) {
					writePair(u, v, index, excited);
				} else if (onSegment && x < frontX - 0.035 * scale && x >= frontX - 0.2 * scale) {
					writePair(u, v, index, refractory);
				}
			} else if (setup.initialCondition === 'cut-plane-wave') {
				const frontX = -0.24 * scale;
				// The lower end meets the no-flux wall; only the end at y=0 is
				// interior.  This is a prepared broken wave, not spiral-shaped data.
				const onSegment = y >= -0.97 * scale && y <= 0;
				if (onSegment && Math.abs(x - frontX) <= 0.045 * scale) {
					writePair(u, v, index, excited);
				} else if (onSegment && x < frontX - 0.045 * scale && x >= frontX - 0.28 * scale) {
					writePair(u, v, index, refractory);
				}
			} else if (setup.initialCondition === 'plane-wave') {
				const frontX = -0.28 * scale;
				if (Math.abs(x - frontX) <= 0.04 * scale) writePair(u, v, index, excited);
				else if (x < frontX - 0.04 * scale && x >= frontX - 0.24 * scale)
					writePair(u, v, index, refractory);
			} else if (setup.initialCondition === 'phase-quadrants') {
				// A continuous phase-quadrant preparation. Every ray begins at one
				// measured state of the homogeneous local cycle, and the rays meet
				// at one topological defect. No spiral arm is drawn into the field.
				writePair(u, v, index, cycleStateForPhase(vortexPhase(x, y, [[0, 0, 1]])));
			} else if (setup.initialCondition === 'spiral-seed') {
				// A declared phase-vortex seed used only after the two formation
				// preparations have been compared.  The radial phase lag is part of
				// the numerical initial field; subsequent persistence and rotation
				// must still be measured from the evolving PDE state.
				const phase = vortexPhase(x, y, [[0, 0, 1]]) + Math.hypot(x, y) / (scale * 0.62);
				writePair(u, v, index, cycleStateForPhase(phase));
			} else if (setup.initialCondition === 'multi-spiral-seed') {
				const radius = scale * 0.38;
				writePair(
					u,
					v,
					index,
					cycleStateForPhase(
						vortexPhase(x, y, [
							[-radius, -radius * 0.35, 1],
							[radius, -radius * 0.35, 1],
							[0, radius * 0.62, 1]
						])
					)
				);
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
