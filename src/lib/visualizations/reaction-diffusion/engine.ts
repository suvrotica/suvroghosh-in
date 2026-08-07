import {
	DIFFUSION_CAUTION_FRACTION,
	DIFFUSION_STABILITY_CEILING,
	NUMERICAL_SAFETY_ABS_LIMIT,
	gridSpacing,
	stabilityNumber
} from './constants';
import { createInitialField, cloneFieldState, assertValidFieldState } from './initial';
import { applyIntervention, orderedInterventions } from './interventions';
import { assertValidSetup, cloneSetup } from './setup';
import { fivePointLaplacianAtUnchecked } from './stencil';
import type {
	BrushTarget,
	FieldState,
	GrayScottSetup,
	Intervention,
	StabilityReading
} from './types';

export interface ReactionDiffusionWorkspace {
	readonly size: number;
	readonly k1u: Float64Array;
	readonly k1v: Float64Array;
	readonly k2u: Float64Array;
	readonly k2v: Float64Array;
	readonly predictorU: Float64Array;
	readonly predictorV: Float64Array;
	readonly nextU: Float64Array;
	readonly nextV: Float64Array;
}

export class NumericalInstabilityError extends RangeError {
	readonly index: number | null;
	readonly u: number | null;
	readonly v: number | null;

	constructor(
		message: string,
		index: number | null = null,
		u: number | null = null,
		v: number | null = null
	) {
		super(message);
		this.name = 'NumericalInstabilityError';
		this.index = index;
		this.u = u;
		this.v = v;
	}
}

export function assessNumericalStability(
	setup: Pick<GrayScottSetup, 'diffusionU' | 'diffusionV' | 'timestep' | 'domainWidth' | 'gridSize'>
): StabilityReading {
	const mu = stabilityNumber(setup);
	if (!Number.isFinite(mu)) {
		return {
			mu,
			ceiling: DIFFUSION_STABILITY_CEILING,
			state: 'unsafe',
			reason: 'The diffusion stability number is non-finite.'
		};
	}
	if (mu > DIFFUSION_STABILITY_CEILING) {
		return {
			mu,
			ceiling: DIFFUSION_STABILITY_CEILING,
			state: 'unsafe',
			reason:
				'The explicit five-point diffusion step exceeds the conservative two-dimensional ceiling.'
		};
	}
	if (mu >= DIFFUSION_STABILITY_CEILING * DIFFUSION_CAUTION_FRACTION) {
		return {
			mu,
			ceiling: DIFFUSION_STABILITY_CEILING,
			state: 'caution',
			reason: 'The diffusion step is close to the explicit stability ceiling.'
		};
	}
	return {
		mu,
		ceiling: DIFFUSION_STABILITY_CEILING,
		state: 'safe',
		reason: 'The diffusion step is below the conservative explicit ceiling.'
	};
}

export function createReactionDiffusionWorkspace(size: number): ReactionDiffusionWorkspace {
	if (!Number.isInteger(size) || size < 2)
		throw new RangeError('Workspace size must be at least two.');
	const length = size * size;
	return {
		size,
		k1u: new Float64Array(length),
		k1v: new Float64Array(length),
		k2u: new Float64Array(length),
		k2v: new Float64Array(length),
		predictorU: new Float64Array(length),
		predictorV: new Float64Array(length),
		nextU: new Float64Array(length),
		nextV: new Float64Array(length)
	};
}

function assertWorkspace(workspace: Readonly<ReactionDiffusionWorkspace>, size: number): void {
	if (workspace.size !== size) throw new RangeError('Workspace and field sizes differ.');
}

function createOutputField(state: Readonly<FieldState>): FieldState {
	return {
		size: state.size,
		u: new Float64Array(state.u.length),
		v: new Float64Array(state.v.length),
		mask: state.mask
	};
}

export function computeGrayScottRhsInto(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	outU: Float64Array,
	outV: Float64Array
): void {
	assertValidFieldState(state);
	assertValidSetup(setup);
	if (state.size !== setup.gridSize) throw new RangeError('Field and setup grid sizes differ.');
	if (outU.length !== state.u.length || outV.length !== state.v.length) {
		throw new RangeError('Derivative arrays have the wrong length.');
	}
	const size = state.size;
	const spacing = gridSpacing(setup);
	for (let row = 0; row < size; row += 1) {
		for (let column = 0; column < size; column += 1) {
			const index = row * size + column;
			if (!state.mask[index]) {
				outU[index] = 0;
				outV[index] = 0;
				continue;
			}
			const u = state.u[index];
			const v = state.v[index];
			const reaction = u * v * v;
			const laplacianU = fivePointLaplacianAtUnchecked(
				state.u,
				state.mask,
				size,
				row,
				column,
				setup.boundary,
				spacing,
				1
			);
			const laplacianV = fivePointLaplacianAtUnchecked(
				state.v,
				state.mask,
				size,
				row,
				column,
				setup.boundary,
				spacing,
				0
			);
			outU[index] = setup.diffusionU * laplacianU - reaction + setup.feed * (1 - u);
			outV[index] = setup.diffusionV * laplacianV + reaction - setup.feed * v - setup.kill * v;
		}
	}
}

function validateCandidate(u: Float64Array, v: Float64Array, mask: Uint8Array): void {
	for (let index = 0; index < u.length; index += 1) {
		if (!mask[index]) continue;
		if (
			!Number.isFinite(u[index]) ||
			!Number.isFinite(v[index]) ||
			Math.abs(u[index]) > NUMERICAL_SAFETY_ABS_LIMIT ||
			Math.abs(v[index]) > NUMERICAL_SAFETY_ABS_LIMIT
		) {
			throw new NumericalInstabilityError(
				`Numerical evolution failed at cell ${index}; the unmodified state was retained.`,
				index,
				u[index],
				v[index]
			);
		}
	}
}

export interface StepOptions {
	readonly rejectUnsafe?: boolean;
}

export function eulerStepInto(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	output: FieldState,
	workspace: ReactionDiffusionWorkspace = createReactionDiffusionWorkspace(state.size),
	options: Readonly<StepOptions> = {}
): void {
	assertWorkspace(workspace, state.size);
	assertValidFieldState(output);
	if (output.size !== state.size) throw new RangeError('Input and output field sizes differ.');
	if (options.rejectUnsafe !== false && assessNumericalStability(setup).state === 'unsafe') {
		throw new NumericalInstabilityError(
			'The requested timestep exceeds the explicit diffusion stability ceiling.'
		);
	}
	computeGrayScottRhsInto(state, setup, workspace.k1u, workspace.k1v);
	for (let index = 0; index < state.u.length; index += 1) {
		workspace.nextU[index] = state.u[index] + setup.timestep * workspace.k1u[index];
		workspace.nextV[index] = state.v[index] + setup.timestep * workspace.k1v[index];
	}
	validateCandidate(workspace.nextU, workspace.nextV, state.mask);
	output.u.set(workspace.nextU);
	output.v.set(workspace.nextV);
	if (output.mask !== state.mask) output.mask.set(state.mask);
}

export function heunStepInto(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	output: FieldState,
	workspace: ReactionDiffusionWorkspace = createReactionDiffusionWorkspace(state.size),
	options: Readonly<StepOptions> = {}
): void {
	assertWorkspace(workspace, state.size);
	assertValidFieldState(output);
	if (output.size !== state.size) throw new RangeError('Input and output field sizes differ.');
	if (options.rejectUnsafe !== false && assessNumericalStability(setup).state === 'unsafe') {
		throw new NumericalInstabilityError(
			'The requested timestep exceeds the explicit diffusion stability ceiling.'
		);
	}
	computeGrayScottRhsInto(state, setup, workspace.k1u, workspace.k1v);
	for (let index = 0; index < state.u.length; index += 1) {
		workspace.predictorU[index] = state.u[index] + setup.timestep * workspace.k1u[index];
		workspace.predictorV[index] = state.v[index] + setup.timestep * workspace.k1v[index];
	}
	validateCandidate(workspace.predictorU, workspace.predictorV, state.mask);
	const predictor: FieldState = {
		size: state.size,
		u: workspace.predictorU,
		v: workspace.predictorV,
		mask: state.mask
	};
	computeGrayScottRhsInto(predictor, setup, workspace.k2u, workspace.k2v);
	for (let index = 0; index < state.u.length; index += 1) {
		workspace.nextU[index] =
			state.u[index] + (setup.timestep * (workspace.k1u[index] + workspace.k2u[index])) / 2;
		workspace.nextV[index] =
			state.v[index] + (setup.timestep * (workspace.k1v[index] + workspace.k2v[index])) / 2;
	}
	validateCandidate(workspace.nextU, workspace.nextV, state.mask);
	output.u.set(workspace.nextU);
	output.v.set(workspace.nextV);
	if (output.mask !== state.mask) output.mask.set(state.mask);
}

export function stepFieldInto(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	output: FieldState,
	workspace: ReactionDiffusionWorkspace = createReactionDiffusionWorkspace(state.size),
	options: Readonly<StepOptions> = {}
): void {
	if (output.size !== state.size) throw new RangeError('Input and output field sizes differ.');
	if (setup.integrator === 'euler') eulerStepInto(state, setup, output, workspace, options);
	else heunStepInto(state, setup, output, workspace, options);
}

export function stepField(
	state: Readonly<FieldState>,
	setup: Readonly<GrayScottSetup>,
	options: Readonly<StepOptions> = {}
): FieldState {
	const output = cloneFieldState(state);
	stepFieldInto(state, setup, output, createReactionDiffusionWorkspace(state.size), options);
	return output;
}

export interface CpuEngineOptions extends StepOptions {
	readonly interventions?: readonly Readonly<Intervention>[];
	readonly target?: BrushTarget;
}

export class ReactionDiffusionCpuEngine {
	readonly setup: GrayScottSetup;
	readonly target: BrushTarget;
	private current: FieldState;
	private next: FieldState;
	private readonly workspace: ReactionDiffusionWorkspace;
	private eventLog: Intervention[];
	private eventCursor = 0;
	private readonly rejectUnsafe: boolean;
	stepIndex = 0;

	constructor(setup: Readonly<GrayScottSetup>, options: Readonly<CpuEngineOptions> = {}) {
		assertValidSetup(setup);
		this.setup = cloneSetup(setup);
		this.target = options.target ?? 'both';
		this.rejectUnsafe = options.rejectUnsafe !== false;
		this.current = createInitialField(this.setup);
		this.next = createOutputField(this.current);
		this.workspace = createReactionDiffusionWorkspace(this.setup.gridSize);
		this.eventLog = orderedInterventions(options.interventions ?? []);
	}

	get state(): Readonly<FieldState> {
		return this.current;
	}

	get modelTime(): number {
		return this.stepIndex * this.setup.timestep;
	}

	get interventions(): readonly Intervention[] {
		return this.eventLog;
	}

	snapshot(): FieldState {
		return cloneFieldState(this.current);
	}

	reset(): void {
		this.current = createInitialField(this.setup);
		this.next = createOutputField(this.current);
		this.stepIndex = 0;
		this.eventCursor = 0;
	}

	replaceInterventions(events: readonly Readonly<Intervention>[]): void {
		if (this.stepIndex !== 0)
			throw new Error('Reset the engine before replacing its intervention log.');
		this.eventLog = orderedInterventions(events);
		this.eventCursor = 0;
	}

	appendIntervention(event: Readonly<Intervention>): void {
		if (event.step < this.stepIndex)
			throw new RangeError('Cannot append an intervention in the past.');
		this.eventLog = orderedInterventions([...this.eventLog, event]);
		this.eventCursor = this.eventLog.findIndex((candidate) => candidate.step >= this.stepIndex);
		if (this.eventCursor < 0) this.eventCursor = this.eventLog.length;
	}

	private applyScheduledInterventions(): void {
		while (
			this.eventCursor < this.eventLog.length &&
			this.eventLog[this.eventCursor].step === this.stepIndex
		) {
			applyIntervention(this.current, this.eventLog[this.eventCursor], this.target);
			this.eventCursor += 1;
		}
	}

	step(count = 1): Readonly<FieldState> {
		if (!Number.isSafeInteger(count) || count < 0)
			throw new RangeError('Step count must be non-negative.');
		for (let iteration = 0; iteration < count; iteration += 1) {
			this.applyScheduledInterventions();
			stepFieldInto(this.current, this.setup, this.next, this.workspace, {
				rejectUnsafe: this.rejectUnsafe
			});
			[this.current, this.next] = [this.next, this.current];
			this.stepIndex += 1;
		}
		return this.current;
	}
}
