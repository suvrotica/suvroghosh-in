import {
	BZ_DIFFUSION_CAUTION_FRACTION,
	BZ_REACTION_CAUTION_FRACTION,
	BZ_REACTION_UNSAFE_FRACTION,
	BZ_SAFE_LIMITS,
	diffusionTimestepLimit,
	gridSpacing
} from './constants';
import {
	cloneBZFieldState,
	createInitialBZField,
	assertValidBZFieldState
} from './initial-conditions';
import { applyInterventionsAtStep, orderedBZInterventions } from './interventions';
import { reactionForSetup } from './reactions';
import { fivePointLaplacianAtUnchecked } from './stencil';
import { assertValidBZSetup, cloneBZSetup } from './validation';
import type {
	ActiveTerms,
	BZDerivativeTerms,
	BZFieldState,
	BZIntervention,
	BZSetup,
	InterventionApplyResult,
	TimestepAssessment
} from './types';

const ALL_TERMS: Readonly<ActiveTerms> = Object.freeze({ reaction: true, diffusion: true });

export class BZNumericalInstabilityError extends RangeError {
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
		this.name = 'BZNumericalInstabilityError';
		this.index = index;
		this.u = u;
		this.v = v;
	}
}

export interface BZSolverWorkspace {
	readonly size: number;
	readonly k1: BZDerivativeTerms;
	readonly k2: BZDerivativeTerms;
	readonly predictorU: Float64Array;
	readonly predictorV: Float64Array;
	readonly nextU: Float64Array;
	readonly nextV: Float64Array;
}

export interface BZStepOptions {
	readonly rejectUnsafe?: boolean;
	readonly activeTerms?: Readonly<ActiveTerms>;
}

export function createBZDerivativeTerms(length: number): BZDerivativeTerms {
	if (!Number.isSafeInteger(length) || length < 1) {
		throw new RangeError('Derivative term length must be a positive integer.');
	}
	return {
		reactionU: new Float64Array(length),
		reactionV: new Float64Array(length),
		diffusionU: new Float64Array(length),
		diffusionV: new Float64Array(length),
		totalU: new Float64Array(length),
		totalV: new Float64Array(length)
	};
}

export function createBZSolverWorkspace(size: number): BZSolverWorkspace {
	if (!Number.isInteger(size) || size < 2) {
		throw new RangeError('Solver workspace size must be at least two.');
	}
	const length = size * size;
	return {
		size,
		k1: createBZDerivativeTerms(length),
		k2: createBZDerivativeTerms(length),
		predictorU: new Float64Array(length),
		predictorV: new Float64Array(length),
		nextU: new Float64Array(length),
		nextV: new Float64Array(length)
	};
}

function assertTermArrays(terms: Readonly<BZDerivativeTerms>, length: number): void {
	if (
		terms.reactionU.length !== length ||
		terms.reactionV.length !== length ||
		terms.diffusionU.length !== length ||
		terms.diffusionV.length !== length ||
		terms.totalU.length !== length ||
		terms.totalV.length !== length
	) {
		throw new RangeError('Derivative arrays have the wrong length.');
	}
}

function validateActiveTerms(terms: Readonly<ActiveTerms>): void {
	if (typeof terms.reaction !== 'boolean' || typeof terms.diffusion !== 'boolean') {
		throw new TypeError('Active reaction and diffusion flags must be boolean.');
	}
}

export function assessBZTimestep(setup: Readonly<BZSetup>): TimestepAssessment {
	assertValidBZSetup(setup);
	const h = gridSpacing(setup);
	const diffusionLimit = diffusionTimestepLimit(setup);
	const diffusionRatio = Number.isFinite(diffusionLimit) ? setup.timestep / diffusionLimit : 0;
	const reactionScale =
		setup.model === 'oregonator'
			? setup.timestep / setup.parameters.epsilon
			: setup.timestep * setup.parameters.gamma;
	const reasons: string[] = [];
	let state: TimestepAssessment['state'] = 'safe';
	if (diffusionRatio > 1) {
		state = 'unsafe';
		reasons.push('The fixed step exceeds h² / [4 max(Du, Dv)], the explicit diffusion bound.');
	} else if (diffusionRatio >= BZ_DIFFUSION_CAUTION_FRACTION) {
		state = 'caution';
		reasons.push('The fixed step is close to the explicit diffusion bound.');
	}
	if (reactionScale > BZ_REACTION_UNSAFE_FRACTION) {
		state = 'unsafe';
		reasons.push('The fixed step is too large relative to the model reaction timescale.');
	} else if (reactionScale > BZ_REACTION_CAUTION_FRACTION && state !== 'unsafe') {
		state = 'caution';
		reasons.push('The reaction term may need a smaller step than diffusion alone suggests.');
	}
	if (reasons.length === 0) {
		reasons.push(
			'The step is below the diffusion bound and the conservative reaction warning scale.'
		);
	}
	return { state, gridSpacing: h, diffusionLimit, diffusionRatio, reactionScale, reasons };
}

function validateNumericalState(
	u: Float64Array,
	v: Float64Array,
	mask: Uint8Array,
	stage: string
): void {
	for (let index = 0; index < u.length; index += 1) {
		if (!mask[index]) continue;
		const currentU = u[index];
		const currentV = v[index];
		if (
			!Number.isFinite(currentU) ||
			!Number.isFinite(currentV) ||
			Math.abs(currentU) > BZ_SAFE_LIMITS.stateAbsoluteMaximum ||
			Math.abs(currentV) > BZ_SAFE_LIMITS.stateAbsoluteMaximum ||
			currentU < -BZ_SAFE_LIMITS.negativeTolerance ||
			currentV < -BZ_SAFE_LIMITS.negativeTolerance
		) {
			throw new BZNumericalInstabilityError(
				`${stage} failed numerical safety at active cell ${index}; no cosmetic state clamp was applied.`,
				index,
				currentU,
				currentV
			);
		}
	}
}

export function computeBZDerivativeTermsInto(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	output: BZDerivativeTerms,
	activeTerms: Readonly<ActiveTerms> = ALL_TERMS
): void {
	assertValidBZFieldState(state);
	assertValidBZSetup(setup);
	validateActiveTerms(activeTerms);
	if (state.size !== setup.gridSize) throw new RangeError('Field and setup grid sizes differ.');
	assertTermArrays(output, state.u.length);
	validateNumericalState(state.u, state.v, state.mask, 'Input state');
	const h = gridSpacing(setup);
	for (let row = 0; row < state.size; row += 1) {
		for (let column = 0; column < state.size; column += 1) {
			const index = row * state.size + column;
			if (!state.mask[index]) {
				output.reactionU[index] = 0;
				output.reactionV[index] = 0;
				output.diffusionU[index] = 0;
				output.diffusionV[index] = 0;
				output.totalU[index] = 0;
				output.totalV[index] = 0;
				continue;
			}
			let reactionU = 0;
			let reactionV = 0;
			if (activeTerms.reaction) {
				const reaction = reactionForSetup(state.u[index], state.v[index], setup);
				reactionU = reaction.u;
				reactionV = reaction.v;
			}
			let diffusionU = 0;
			let diffusionV = 0;
			if (activeTerms.diffusion) {
				diffusionU =
					setup.diffusionU *
					fivePointLaplacianAtUnchecked(
						state.u,
						state.mask,
						state.size,
						row,
						column,
						setup.boundary,
						h
					);
				diffusionV =
					setup.diffusionV *
					fivePointLaplacianAtUnchecked(
						state.v,
						state.mask,
						state.size,
						row,
						column,
						setup.boundary,
						h
					);
			}
			output.reactionU[index] = reactionU;
			output.reactionV[index] = reactionV;
			output.diffusionU[index] = diffusionU;
			output.diffusionV[index] = diffusionV;
			output.totalU[index] = reactionU + diffusionU;
			output.totalV[index] = reactionV + diffusionV;
		}
	}
}

export function computeBZDerivativeTerms(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	activeTerms: Readonly<ActiveTerms> = ALL_TERMS
): BZDerivativeTerms {
	const output = createBZDerivativeTerms(state.u.length);
	computeBZDerivativeTermsInto(state, setup, output, activeTerms);
	return output;
}

function assertStepTarget(
	state: Readonly<BZFieldState>,
	output: Readonly<BZFieldState>,
	workspace: Readonly<BZSolverWorkspace>
): void {
	assertValidBZFieldState(output);
	if (output.size !== state.size) throw new RangeError('Input and output field sizes differ.');
	if (workspace.size !== state.size) throw new RangeError('Workspace and field sizes differ.');
}

export function heunBZStepInto(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	output: BZFieldState,
	workspace: BZSolverWorkspace = createBZSolverWorkspace(state.size),
	options: Readonly<BZStepOptions> = {}
): void {
	assertValidBZFieldState(state);
	assertValidBZSetup(setup);
	assertStepTarget(state, output, workspace);
	const assessment = assessBZTimestep(setup);
	if (options.rejectUnsafe !== false && assessment.state === 'unsafe') {
		throw new BZNumericalInstabilityError(
			`The fixed timestep was rejected: ${assessment.reasons.join(' ')}`
		);
	}
	const activeTerms = options.activeTerms ?? ALL_TERMS;
	computeBZDerivativeTermsInto(state, setup, workspace.k1, activeTerms);
	for (let index = 0; index < state.u.length; index += 1) {
		workspace.predictorU[index] = state.u[index] + setup.timestep * workspace.k1.totalU[index];
		workspace.predictorV[index] = state.v[index] + setup.timestep * workspace.k1.totalV[index];
	}
	validateNumericalState(workspace.predictorU, workspace.predictorV, state.mask, 'Heun predictor');
	const predictor: BZFieldState = {
		size: state.size,
		u: workspace.predictorU,
		v: workspace.predictorV,
		domainMask: state.domainMask,
		mask: state.mask
	};
	computeBZDerivativeTermsInto(predictor, setup, workspace.k2, activeTerms);
	for (let index = 0; index < state.u.length; index += 1) {
		workspace.nextU[index] =
			state.u[index] +
			(setup.timestep * (workspace.k1.totalU[index] + workspace.k2.totalU[index])) / 2;
		workspace.nextV[index] =
			state.v[index] +
			(setup.timestep * (workspace.k1.totalV[index] + workspace.k2.totalV[index])) / 2;
	}
	validateNumericalState(workspace.nextU, workspace.nextV, state.mask, 'Heun corrector');
	output.u.set(workspace.nextU);
	output.v.set(workspace.nextV);
	if (output.mask !== state.mask) output.mask.set(state.mask);
	if (output.domainMask !== state.domainMask) output.domainMask.set(state.domainMask);
}

export function heunBZStep(
	state: Readonly<BZFieldState>,
	setup: Readonly<BZSetup>,
	options: Readonly<BZStepOptions> = {}
): BZFieldState {
	const output = cloneBZFieldState(state);
	heunBZStepInto(state, setup, output, createBZSolverWorkspace(state.size), options);
	return output;
}

export interface BZCpuSolverOptions extends BZStepOptions {
	readonly interventions?: readonly Readonly<BZIntervention>[];
}

export class BZCpuSolver {
	readonly setup: BZSetup;
	private current: BZFieldState;
	private next: BZFieldState;
	private readonly workspace: BZSolverWorkspace;
	private eventLog: BZIntervention[];
	private readonly rejectUnsafe: boolean;
	private readonly activeTerms: Readonly<ActiveTerms>;
	private latestResults: readonly InterventionApplyResult[] = [];
	stepIndex = 0;

	constructor(setup: Readonly<BZSetup>, options: Readonly<BZCpuSolverOptions> = {}) {
		assertValidBZSetup(setup);
		this.setup = cloneBZSetup(setup);
		this.current = createInitialBZField(this.setup);
		this.next = cloneBZFieldState(this.current);
		this.workspace = createBZSolverWorkspace(this.setup.gridSize);
		this.eventLog = orderedBZInterventions(options.interventions ?? []);
		this.rejectUnsafe = options.rejectUnsafe !== false;
		this.activeTerms = options.activeTerms ?? ALL_TERMS;
		validateActiveTerms(this.activeTerms);
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

	get lastInterventionResults(): readonly InterventionApplyResult[] {
		return this.latestResults;
	}

	snapshot(): BZFieldState {
		return cloneBZFieldState(this.current);
	}

	reset(): void {
		this.current = createInitialBZField(this.setup);
		this.next = cloneBZFieldState(this.current);
		this.stepIndex = 0;
		this.latestResults = [];
	}

	replaceInterventions(events: readonly Readonly<BZIntervention>[]): void {
		if (this.stepIndex !== 0) throw new Error('Reset before replacing the intervention log.');
		this.eventLog = orderedBZInterventions(events);
	}

	appendIntervention(event: Readonly<BZIntervention>): void {
		if (event.step < this.stepIndex && event.kind !== 'pacemaker') {
			throw new RangeError('Cannot append a completed single-step intervention.');
		}
		this.eventLog = orderedBZInterventions([...this.eventLog, event]);
	}

	step(count = 1): Readonly<BZFieldState> {
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError('Step count must be a non-negative safe integer.');
		}
		for (let iteration = 0; iteration < count; iteration += 1) {
			this.latestResults = applyInterventionsAtStep(
				this.current,
				this.setup,
				this.eventLog,
				this.stepIndex
			);
			heunBZStepInto(this.current, this.setup, this.next, this.workspace, {
				rejectUnsafe: this.rejectUnsafe,
				activeTerms: this.activeTerms
			});
			[this.current, this.next] = [this.next, this.current];
			this.stepIndex += 1;
		}
		return this.current;
	}
}
