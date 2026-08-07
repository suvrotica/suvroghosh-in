import { NUMERICAL_SAFETY_ABS_LIMIT } from '../constants';
import {
	NumericalInstabilityError,
	createReactionDiffusionWorkspace,
	stepFieldInto,
	type ReactionDiffusionWorkspace
} from '../engine';
import { assertValidFieldState, cloneFieldState, createInitialField } from '../initial';
import { applyIntervention, orderedInterventions } from '../interventions';
import { calculateFieldMetrics } from '../metrics';
import { assertValidSetup, cloneSetup } from '../setup';
import type { BrushTarget, FieldMetrics, FieldState, GrayScottSetup, Intervention } from '../types';

/** Identifies the shared site initializer used by Worker reset/replay. */
export const REACTION_DIFFUSION_REFERENCE_PRNG_ID = 'shared-seeded-random-v1' as const;

export interface CpuNumericalInspection {
	readonly healthy: boolean;
	readonly index: number | null;
	readonly maximumAbsoluteValue: number;
	readonly reason: string;
}

/**
 * Thin stateful adapter over the canonical Float64 model. Keeping Worker
 * scheduling here while delegating initialization, interventions, stencil, and
 * integration to shared modules prevents a second scientific implementation
 * from drifting away from the reference engine.
 */
export class ReferenceGrayScottSimulation {
	readonly comparisonTarget: BrushTarget;
	private readonly setupValue: GrayScottSetup;
	private readonly workspace: ReactionDiffusionWorkspace;
	private current: FieldState;
	private next: FieldState;
	private stepValue = 0;

	constructor(
		setup: GrayScottSetup,
		state: FieldState = createInitialField(setup),
		comparisonTarget: BrushTarget = 'both'
	) {
		assertValidSetup(setup);
		assertValidFieldState(state);
		if (state.size !== setup.gridSize)
			throw new RangeError('CPU field size must match setup.gridSize.');
		this.setupValue = cloneSetup(setup);
		this.comparisonTarget = comparisonTarget;
		this.current = cloneFieldState(state);
		this.next = createOutputField(state);
		this.workspace = createReactionDiffusionWorkspace(state.size);
	}

	get setup(): GrayScottSetup {
		return cloneSetup(this.setupValue);
	}

	get stepIndex(): number {
		return this.stepValue;
	}

	get modelTime(): number {
		return this.stepValue * this.setupValue.timestep;
	}

	step(interventions: readonly Intervention[] = []): CpuNumericalInspection {
		for (const intervention of orderedInterventions(interventions)) {
			if (intervention.step !== this.stepValue) continue;
			applyIntervention(this.current, intervention, this.comparisonTarget);
		}

		try {
			// Unsafe experiments are allowed to run, but the canonical stepper still
			// rejects non-finite/out-of-range candidates without clamping them.
			stepFieldInto(this.current, this.setupValue, this.next, this.workspace, {
				rejectUnsafe: false
			});
			[this.current, this.next] = [this.next, this.current];
			this.stepValue += 1;
			return this.inspectNumerics();
		} catch (error) {
			if (error instanceof NumericalInstabilityError) {
				return {
					healthy: false,
					index: error.index,
					maximumAbsoluteValue: Math.max(Math.abs(error.u ?? 0), Math.abs(error.v ?? 0)),
					reason: error.message
				};
			}
			throw error;
		}
	}

	snapshot(): FieldState {
		return cloneFieldState(this.current);
	}

	metrics(): FieldMetrics | null {
		try {
			return calculateFieldMetrics(this.current);
		} catch (error) {
			if (error instanceof RangeError) return null;
			throw error;
		}
	}

	inspectNumerics(absoluteLimit = NUMERICAL_SAFETY_ABS_LIMIT): CpuNumericalInspection {
		let maximumAbsoluteValue = 0;
		for (let index = 0; index < this.current.u.length; index += 1) {
			if (this.current.mask[index] === 0) continue;
			const u = this.current.u[index];
			const v = this.current.v[index];
			if (!Number.isFinite(u) || !Number.isFinite(v)) {
				return {
					healthy: false,
					index,
					maximumAbsoluteValue: Number.POSITIVE_INFINITY,
					reason: 'A concentration became non-finite; the reference solver did not repair it.'
				};
			}
			maximumAbsoluteValue = Math.max(maximumAbsoluteValue, Math.abs(u), Math.abs(v));
			if (maximumAbsoluteValue > absoluteLimit) {
				return {
					healthy: false,
					index,
					maximumAbsoluteValue,
					reason: `A concentration exceeded the documented safety magnitude ${absoluteLimit}; the reference solver did not clamp it.`
				};
			}
		}
		return {
			healthy: true,
			index: null,
			maximumAbsoluteValue,
			reason:
				'All active-cell concentrations are finite and within the diagnostic safety magnitude.'
		};
	}
}

/** Backward-compatible Worker helper; delegates to the canonical deterministic initializer. */
export function createDeterministicField(setup: GrayScottSetup): FieldState {
	return createInitialField(setup);
}

function createOutputField(state: Readonly<FieldState>): FieldState {
	return {
		size: state.size,
		u: new Float64Array(state.u.length),
		v: new Float64Array(state.v.length),
		mask: new Uint8Array(state.mask)
	};
}
