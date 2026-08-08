import { BZ_SAFE_LIMITS } from './constants';
import { cloneBZFieldState, createInitialBZField } from './initial-conditions';
import { applyInterventionsAtStep, orderedBZInterventions } from './interventions';
import { assertValidBZSetup, cloneBZSetup } from './validation';
import { BZNumericalInstabilityError } from './solver';
import type { BZFieldState, BZIntervention, BZSetup } from './types';

export interface BZFastCpuSolverOptions {
	readonly initialState?: Readonly<BZFieldState>;
	readonly interventions?: readonly Readonly<BZIntervention>[];
	readonly initialStep?: number;
}

/**
 * Allocation-free Float64 reference kernel for calibration and the worker
 * fallback.  It evaluates the same Heun/five-point contract as BZCpuSolver but
 * precomputes reflected neighbour indices and fuses derivative/output loops.
 * No value is clipped; the first unsafe corrector value aborts the run.
 */
export class BZFastCpuSolver {
	readonly setup: BZSetup;
	private current: BZFieldState;
	private next: BZFieldState;
	private readonly predictorU: Float64Array;
	private readonly predictorV: Float64Array;
	private readonly k1U: Float64Array;
	private readonly k1V: Float64Array;
	private readonly activeIndices: Uint32Array;
	private readonly north: Uint32Array;
	private readonly south: Uint32Array;
	private readonly east: Uint32Array;
	private readonly west: Uint32Array;
	private readonly spacingSquared: number;
	private eventLog: BZIntervention[];
	stepIndex: number;

	constructor(setup: Readonly<BZSetup>, options: Readonly<BZFastCpuSolverOptions> = {}) {
		assertValidBZSetup(setup);
		this.setup = cloneBZSetup(setup);
		const initial = options.initialState
			? cloneBZFieldState(options.initialState)
			: createInitialBZField(this.setup);
		if (initial.size !== setup.gridSize)
			throw new RangeError('Fast-solver state and setup grids differ.');
		this.current = initial;
		this.next = cloneBZFieldState(initial);
		const length = initial.u.length;
		this.predictorU = new Float64Array(length);
		this.predictorV = new Float64Array(length);
		this.k1U = new Float64Array(length);
		this.k1V = new Float64Array(length);
		const active: number[] = [];
		for (let index = 0; index < length; index += 1) if (initial.mask[index]) active.push(index);
		this.activeIndices = Uint32Array.from(active);
		this.north = new Uint32Array(length);
		this.south = new Uint32Array(length);
		this.east = new Uint32Array(length);
		this.west = new Uint32Array(length);
		this.precomputeNeighbours();
		const spacing = setup.domainSize / setup.gridSize;
		this.spacingSquared = spacing * spacing;
		this.eventLog = orderedBZInterventions(options.interventions ?? []);
		this.stepIndex = options.initialStep ?? 0;
		if (!Number.isSafeInteger(this.stepIndex) || this.stepIndex < 0) {
			throw new RangeError('Fast-solver initial step must be a non-negative safe integer.');
		}
	}

	get state(): Readonly<BZFieldState> {
		return this.current;
	}

	get modelTime(): number {
		return this.stepIndex * this.setup.timestep;
	}

	get interventions(): readonly BZIntervention[] {
		return this.eventLog;
	}

	snapshot(): BZFieldState {
		return cloneBZFieldState(this.current);
	}

	appendIntervention(intervention: Readonly<BZIntervention>): void {
		this.eventLog = orderedBZInterventions([...this.eventLog, intervention]);
	}

	step(count = 1): Readonly<BZFieldState> {
		if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Step count is invalid.');
		for (let iteration = 0; iteration < count; iteration += 1) {
			applyInterventionsAtStep(this.current, this.setup, this.eventLog, this.stepIndex);
			this.stepOnce();
			this.stepIndex += 1;
		}
		return this.current;
	}

	private precomputeNeighbours(): void {
		const size = this.setup.gridSize;
		const periodic = this.setup.boundary === 'periodic' && this.setup.geometry === 'square';
		const mask = this.current.mask;
		for (const index of this.activeIndices) {
			const row = Math.floor(index / size);
			const column = index - row * size;
			const neighbour = (nextRow: number, nextColumn: number): number => {
				if (periodic) {
					nextRow = (nextRow + size) % size;
					nextColumn = (nextColumn + size) % size;
				} else if (nextRow < 0 || nextColumn < 0 || nextRow >= size || nextColumn >= size) {
					return index;
				}
				const candidate = nextRow * size + nextColumn;
				return mask[candidate] ? candidate : index;
			};
			this.north[index] = neighbour(row + 1, column);
			this.south[index] = neighbour(row - 1, column);
			this.east[index] = neighbour(row, column + 1);
			this.west[index] = neighbour(row, column - 1);
		}
	}

	private stepOnce(): void {
		if (this.setup.model === 'oregonator') this.stepOregonator();
		else this.stepSchnakenberg();
	}

	private stepOregonator(): void {
		const dt = this.setup.timestep;
		if (this.setup.model !== 'oregonator')
			throw new Error('Oregonator kernel received another model.');
		const { epsilon, q, f } = this.setup.parameters;
		const currentU = this.current.u;
		const currentV = this.current.v;
		const diffusionUCoefficient = this.setup.diffusionU;
		const diffusionVCoefficient = this.setup.diffusionV;
		for (let activeOffset = 0; activeOffset < this.activeIndices.length; activeOffset += 1) {
			const index = this.activeIndices[activeOffset];
			const u = currentU[index];
			const v = currentV[index];
			const reactionU = (u * (1 - u) - (f * v * (u - q)) / (u + q)) / epsilon;
			const reactionV = u - v;
			const diffusionU = diffusionUCoefficient * this.laplacian(currentU, index);
			const diffusionV =
				diffusionVCoefficient === 0 ? 0 : diffusionVCoefficient * this.laplacian(currentV, index);
			const derivativeU = reactionU + diffusionU;
			const derivativeV = reactionV + diffusionV;
			this.k1U[index] = derivativeU;
			this.k1V[index] = derivativeV;
			this.predictorU[index] = currentU[index] + dt * derivativeU;
			this.predictorV[index] = currentV[index] + dt * derivativeV;
		}

		const nextU = this.next.u;
		const nextV = this.next.v;
		for (let activeOffset = 0; activeOffset < this.activeIndices.length; activeOffset += 1) {
			const index = this.activeIndices[activeOffset];
			const predictorU = this.predictorU[index];
			const predictorV = this.predictorV[index];
			const reactionU =
				(predictorU * (1 - predictorU) - (f * predictorV * (predictorU - q)) / (predictorU + q)) /
				epsilon;
			const reactionV = predictorU - predictorV;
			const derivativeU =
				reactionU + diffusionUCoefficient * this.laplacian(this.predictorU, index);
			const derivativeV =
				reactionV +
				(diffusionVCoefficient === 0
					? 0
					: diffusionVCoefficient * this.laplacian(this.predictorV, index));
			const u = currentU[index] + (dt * (this.k1U[index] + derivativeU)) / 2;
			const v = currentV[index] + (dt * (this.k1V[index] + derivativeV)) / 2;
			if (
				!Number.isFinite(u) ||
				!Number.isFinite(v) ||
				u < -BZ_SAFE_LIMITS.negativeTolerance ||
				v < -BZ_SAFE_LIMITS.negativeTolerance ||
				Math.abs(u) > BZ_SAFE_LIMITS.stateAbsoluteMaximum ||
				Math.abs(v) > BZ_SAFE_LIMITS.stateAbsoluteMaximum
			) {
				throw new BZNumericalInstabilityError(
					`Fast Heun corrector failed numerical safety at active cell ${index}; no state clamp was applied.`,
					index,
					u,
					v
				);
			}
			nextU[index] = u;
			nextV[index] = v;
		}
		[this.current, this.next] = [this.next, this.current];
	}

	private stepSchnakenberg(): void {
		const dt = this.setup.timestep;
		if (this.setup.model !== 'schnakenberg')
			throw new Error('Schnakenberg kernel received another model.');
		const { a, b, gamma } = this.setup.parameters;
		const currentU = this.current.u;
		const currentV = this.current.v;
		for (let activeOffset = 0; activeOffset < this.activeIndices.length; activeOffset += 1) {
			const index = this.activeIndices[activeOffset];
			const u = currentU[index];
			const v = currentV[index];
			const autocatalysis = u * u * v;
			const derivativeU =
				gamma * (a - u + autocatalysis) + this.setup.diffusionU * this.laplacian(currentU, index);
			const derivativeV =
				gamma * (b - autocatalysis) + this.setup.diffusionV * this.laplacian(currentV, index);
			this.k1U[index] = derivativeU;
			this.k1V[index] = derivativeV;
			this.predictorU[index] = u + dt * derivativeU;
			this.predictorV[index] = v + dt * derivativeV;
		}
		const nextU = this.next.u;
		const nextV = this.next.v;
		for (let activeOffset = 0; activeOffset < this.activeIndices.length; activeOffset += 1) {
			const index = this.activeIndices[activeOffset];
			const u = this.predictorU[index];
			const v = this.predictorV[index];
			const autocatalysis = u * u * v;
			const derivativeU =
				gamma * (a - u + autocatalysis) +
				this.setup.diffusionU * this.laplacian(this.predictorU, index);
			const derivativeV =
				gamma * (b - autocatalysis) +
				this.setup.diffusionV * this.laplacian(this.predictorV, index);
			const correctedU = currentU[index] + (dt * (this.k1U[index] + derivativeU)) / 2;
			const correctedV = currentV[index] + (dt * (this.k1V[index] + derivativeV)) / 2;
			this.assertFinite(index, correctedU, correctedV);
			nextU[index] = correctedU;
			nextV[index] = correctedV;
		}
		[this.current, this.next] = [this.next, this.current];
	}

	private laplacian(values: Float64Array, index: number): number {
		return (
			(values[this.south[index]] +
				values[this.north[index]] +
				values[this.west[index]] +
				values[this.east[index]] -
				4 * values[index]) /
			this.spacingSquared
		);
	}

	private assertFinite(index: number, u: number, v: number): void {
		if (
			!Number.isFinite(u) ||
			!Number.isFinite(v) ||
			u < -BZ_SAFE_LIMITS.negativeTolerance ||
			v < -BZ_SAFE_LIMITS.negativeTolerance ||
			Math.abs(u) > BZ_SAFE_LIMITS.stateAbsoluteMaximum ||
			Math.abs(v) > BZ_SAFE_LIMITS.stateAbsoluteMaximum
		) {
			throw new BZNumericalInstabilityError(
				`Fast Heun corrector failed numerical safety at active cell ${index}; no state clamp was applied.`,
				index,
				u,
				v
			);
		}
	}
}
