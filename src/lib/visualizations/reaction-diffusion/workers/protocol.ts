import type { BrushTarget, FieldMetrics, FieldState, GrayScottSetup, Intervention } from '../types';
import { REACTION_DIFFUSION_SCHEMA_VERSION } from '../types';

export const REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION = 1 as const;

export const REACTION_DIFFUSION_WORKER_LIMITS = Object.freeze({
	minimumGridSize: 4,
	maximumGridSize: 512,
	maximumStepsPerRequest: 20_000,
	maximumStepsPerChunk: 32,
	maximumInterventionsPerRequest: 2_000
});

interface WorkerEnvelope {
	protocolVersion: typeof REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION;
	requestId: number;
	generation: number;
}

export interface CpuSimulationReport {
	readonly step: number;
	readonly modelTime: number;
	readonly metrics: FieldMetrics | null;
	readonly state?: FieldState;
}

export type ReactionDiffusionWorkerRequest =
	| (WorkerEnvelope & {
			type: 'RESET';
			setup: GrayScottSetup;
			state?: FieldState;
			comparisonTarget?: BrushTarget;
			includeState?: boolean;
	  })
	| (WorkerEnvelope & {
			type: 'STEP';
			steps: number;
			interventions?: readonly Intervention[];
			stepsPerChunk?: number;
			includeState?: boolean;
	  })
	| (WorkerEnvelope & {
			type: 'REPLAY';
			setup: GrayScottSetup;
			state?: FieldState;
			interventions: readonly Intervention[];
			targetStep: number;
			stepsPerChunk?: number;
			comparisonTarget?: BrushTarget;
			includeState?: boolean;
	  })
	| (WorkerEnvelope & { type: 'METRICS'; includeState?: boolean })
	| (WorkerEnvelope & { type: 'CANCEL' })
	| (WorkerEnvelope & { type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown
	? Omit<Message, keyof WorkerEnvelope>
	: never;

export type ReactionDiffusionWorkerRequestBody = WithoutEnvelope<ReactionDiffusionWorkerRequest>;

export type ReactionDiffusionWorkerResponse =
	| (WorkerEnvelope & { type: 'RESET_COMPLETE'; report: CpuSimulationReport })
	| (WorkerEnvelope & {
			type: 'STARTED';
			operation: 'step' | 'replay';
			startStep: number;
			totalSteps: number;
	  })
	| (WorkerEnvelope & {
			type: 'PROGRESS';
			operation: 'step' | 'replay';
			completedSteps: number;
			totalSteps: number;
			step: number;
			modelTime: number;
	  })
	| (WorkerEnvelope & { type: 'STEP_COMPLETE'; report: CpuSimulationReport })
	| (WorkerEnvelope & { type: 'REPLAY_COMPLETE'; report: CpuSimulationReport })
	| (WorkerEnvelope & { type: 'METRICS_RESULT'; report: CpuSimulationReport })
	| (WorkerEnvelope & {
			type: 'NUMERICAL_FAILURE';
			report: CpuSimulationReport;
			reason: string;
			failureIndex: number | null;
	  })
	| (WorkerEnvelope & {
			type: 'CANCELLED';
			completedSteps: number;
			totalSteps: number;
	  })
	| (WorkerEnvelope & { type: 'STALE'; activeGeneration: number; message: string })
	| (WorkerEnvelope & { type: 'DISPOSED' })
	| (WorkerEnvelope & { type: 'ERROR'; message: string; stack?: string });

export function isReactionDiffusionWorkerRequest(
	value: unknown
): value is ReactionDiffusionWorkerRequest {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'RESET':
			return (
				isGrayScottSetup(value.setup) &&
				(value.state === undefined || isFieldState(value.state, value.setup.gridSize)) &&
				isOptionalComparisonTarget(value.comparisonTarget) &&
				isOptionalBoolean(value.includeState)
			);
		case 'STEP':
			return (
				isBoundedInteger(value.steps, 0, REACTION_DIFFUSION_WORKER_LIMITS.maximumStepsPerRequest) &&
				isInterventionList(value.interventions) &&
				isOptionalChunkSize(value.stepsPerChunk) &&
				isOptionalBoolean(value.includeState)
			);
		case 'REPLAY':
			return (
				isGrayScottSetup(value.setup) &&
				(value.state === undefined || isFieldState(value.state, value.setup.gridSize)) &&
				isInterventionList(value.interventions, false) &&
				isBoundedInteger(
					value.targetStep,
					0,
					REACTION_DIFFUSION_WORKER_LIMITS.maximumStepsPerRequest
				) &&
				isOptionalChunkSize(value.stepsPerChunk) &&
				isOptionalComparisonTarget(value.comparisonTarget) &&
				isOptionalBoolean(value.includeState)
			);
		case 'METRICS':
			return isOptionalBoolean(value.includeState);
		case 'CANCEL':
		case 'DISPOSE':
			return true;
		default:
			return false;
	}
}

export function isReactionDiffusionWorkerResponse(
	value: unknown
): value is ReactionDiffusionWorkerResponse {
	if (!hasEnvelope(value)) return false;
	switch (value.type) {
		case 'RESET_COMPLETE':
		case 'STEP_COMPLETE':
		case 'REPLAY_COMPLETE':
		case 'METRICS_RESULT':
			return isCpuSimulationReport(value.report);
		case 'STARTED':
			return (
				isOperation(value.operation) &&
				isNonNegativeInteger(value.startStep) &&
				isBoundedInteger(
					value.totalSteps,
					0,
					REACTION_DIFFUSION_WORKER_LIMITS.maximumStepsPerRequest
				)
			);
		case 'PROGRESS':
			return (
				isOperation(value.operation) &&
				isBoundedInteger(
					value.totalSteps,
					0,
					REACTION_DIFFUSION_WORKER_LIMITS.maximumStepsPerRequest
				) &&
				isBoundedInteger(value.completedSteps, 0, value.totalSteps) &&
				isNonNegativeInteger(value.step) &&
				isFiniteNonNegative(value.modelTime)
			);
		case 'NUMERICAL_FAILURE':
			return (
				isCpuSimulationReport(value.report, true) &&
				typeof value.reason === 'string' &&
				value.reason.length > 0 &&
				(value.failureIndex === null || isNonNegativeInteger(value.failureIndex))
			);
		case 'CANCELLED':
			return (
				isBoundedInteger(
					value.totalSteps,
					0,
					REACTION_DIFFUSION_WORKER_LIMITS.maximumStepsPerRequest
				) && isBoundedInteger(value.completedSteps, 0, value.totalSteps)
			);
		case 'STALE':
			return isNonNegativeInteger(value.activeGeneration) && typeof value.message === 'string';
		case 'DISPOSED':
			return true;
		case 'ERROR':
			return (
				typeof value.message === 'string' &&
				value.message.length > 0 &&
				(value.stack === undefined || typeof value.stack === 'string')
			);
		default:
			return false;
	}
}

export function reactionDiffusionRequestTransferables(
	request: ReactionDiffusionWorkerRequest
): Transferable[] {
	if ((request.type === 'RESET' || request.type === 'REPLAY') && request.state) {
		return fieldStateTransferables(request.state);
	}
	return [];
}

export function reactionDiffusionResponseTransferables(
	response: ReactionDiffusionWorkerResponse
): Transferable[] {
	if (
		response.type === 'RESET_COMPLETE' ||
		response.type === 'STEP_COMPLETE' ||
		response.type === 'REPLAY_COMPLETE' ||
		response.type === 'METRICS_RESULT' ||
		response.type === 'NUMERICAL_FAILURE'
	) {
		return response.report.state ? fieldStateTransferables(response.report.state) : [];
	}
	return [];
}

export function cloneFieldStateForTransfer(state: FieldState): FieldState {
	return {
		size: state.size,
		u: state.u.slice(),
		v: state.v.slice(),
		mask: state.mask.slice()
	};
}

export function cloneInterventionsForTransfer(
	interventions: readonly Intervention[]
): Intervention[] {
	return interventions.map((intervention) => ({
		...intervention,
		from: [...intervention.from] as [number, number],
		to: [...intervention.to] as [number, number]
	}));
}

function hasEnvelope(value: unknown): value is WorkerEnvelope & Record<string, unknown> {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		candidate.protocolVersion === REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION &&
		isNonNegativeInteger(candidate.requestId) &&
		isNonNegativeInteger(candidate.generation) &&
		typeof candidate.type === 'string'
	);
}

function isGrayScottSetup(value: unknown): value is GrayScottSetup {
	if (!value || typeof value !== 'object') return false;
	const setup = value as Partial<GrayScottSetup>;
	return (
		isFiniteInRange(setup.feed, 0, 0.2) &&
		isFiniteInRange(setup.kill, 0, 0.2) &&
		isFiniteInRange(setup.diffusionU, 0, 10) &&
		isFiniteInRange(setup.diffusionV, 0, 10) &&
		isFiniteInRange(setup.timestep, Number.MIN_VALUE, 20) &&
		isBoundedInteger(
			setup.gridSize,
			REACTION_DIFFUSION_WORKER_LIMITS.minimumGridSize,
			REACTION_DIFFUSION_WORKER_LIMITS.maximumGridSize
		) &&
		isFiniteInRange(setup.domainWidth, 1e-6, 1e6) &&
		(setup.boundary === 'periodic' ||
			setup.boundary === 'no-flux' ||
			setup.boundary === 'reservoir') &&
		(setup.maskPreset === 'open-square' ||
			setup.maskPreset === 'circular-vessel' ||
			setup.maskPreset === 'narrow-channel' ||
			setup.maskPreset === 'annulus' ||
			setup.maskPreset === 'two-chambers' ||
			setup.maskPreset === 'obstacle-field') &&
		(setup.initialCondition === 'central-soft-disk' ||
			setup.initialCondition === 'central-square' ||
			setup.initialCondition === 'ring' ||
			setup.initialCondition === 'horizontal-front' ||
			setup.initialCondition === 'two-spots' ||
			setup.initialCondition === 'noise-patch' ||
			setup.initialCondition === 'sparse-points' ||
			setup.initialCondition === 'blank-feed' ||
			setup.initialCondition === 'hand-painted') &&
		typeof setup.seed === 'string' &&
		setup.seed.length <= 256 &&
		(setup.integrator === 'heun' || setup.integrator === 'euler')
	);
}

function isFieldState(
	value: unknown,
	expectedSize?: number,
	requireFiniteConcentrations = true
): value is FieldState {
	if (!value || typeof value !== 'object') return false;
	const state = value as Partial<FieldState>;
	if (
		!isBoundedInteger(
			state.size,
			REACTION_DIFFUSION_WORKER_LIMITS.minimumGridSize,
			REACTION_DIFFUSION_WORKER_LIMITS.maximumGridSize
		) ||
		(expectedSize !== undefined && state.size !== expectedSize) ||
		!(state.u instanceof Float64Array) ||
		!(state.v instanceof Float64Array) ||
		!(state.mask instanceof Uint8Array)
	) {
		return false;
	}
	const length = state.size * state.size;
	return (
		state.u.length === length &&
		state.v.length === length &&
		state.mask.length === length &&
		(!requireFiniteConcentrations ||
			(state.u.every(Number.isFinite) && state.v.every(Number.isFinite))) &&
		state.mask.every((entry) => entry === 0 || entry === 1)
	);
}

function isInterventionList(
	value: unknown,
	optional = true
): value is readonly Intervention[] | undefined {
	if (value === undefined) return optional;
	if (
		!Array.isArray(value) ||
		value.length > REACTION_DIFFUSION_WORKER_LIMITS.maximumInterventionsPerRequest ||
		!value.every(isIntervention)
	) {
		return false;
	}
	return new Set(value.map((intervention) => intervention.sequence)).size === value.length;
}

function isIntervention(value: unknown): value is Intervention {
	if (!value || typeof value !== 'object') return false;
	const intervention = value as Partial<Intervention>;
	if (
		intervention.schemaVersion !== REACTION_DIFFUSION_SCHEMA_VERSION ||
		!isNonNegativeInteger(intervention.sequence) ||
		!isNonNegativeInteger(intervention.step) ||
		!isPoint(intervention.from) ||
		!isPoint(intervention.to) ||
		!isFiniteInRange(intervention.radius, 0, 2)
	) {
		return false;
	}
	if (intervention.kind === 'mask') return typeof intervention.active === 'boolean';
	return (
		intervention.kind === 'brush' &&
		(intervention.tool === 'add-v' ||
			intervention.tool === 'add-u' ||
			intervention.tool === 'mixed-pulse' ||
			intervention.tool === 'restore-feed' ||
			intervention.tool === 'paint-obstacle' ||
			intervention.tool === 'erase-obstacle') &&
		(intervention.shape === 'soft-disk' ||
			intervention.shape === 'hard-disk' ||
			intervention.shape === 'ring' ||
			intervention.shape === 'line') &&
		(intervention.target === 'both' ||
			intervention.target === 'a' ||
			intervention.target === 'b') &&
		isFiniteInRange(intervention.strength, -100, 100) &&
		isFiniteInRange(intervention.falloff, 0, 8)
	);
}

function isCpuSimulationReport(
	value: unknown,
	allowNonFiniteFailureState = false
): value is CpuSimulationReport {
	if (!value || typeof value !== 'object') return false;
	const report = value as Partial<CpuSimulationReport>;
	return (
		isNonNegativeInteger(report.step) &&
		isFiniteNonNegative(report.modelTime) &&
		(report.metrics === null || isFieldMetrics(report.metrics)) &&
		(report.state === undefined ||
			isFieldState(report.state, undefined, !allowNonFiniteFailureState))
	);
}

function isFieldMetrics(value: unknown): value is FieldMetrics {
	if (!value || typeof value !== 'object') return false;
	const metrics = value as Partial<FieldMetrics>;
	return (
		isFiniteNumber(metrics.meanU) &&
		isFiniteNumber(metrics.meanV) &&
		isFiniteNumber(metrics.varianceV) &&
		isFiniteNumber(metrics.meanReactionRate) &&
		isFiniteNumber(metrics.minimumU) &&
		isFiniteNumber(metrics.maximumU) &&
		isFiniteNumber(metrics.minimumV) &&
		isFiniteNumber(metrics.maximumV) &&
		isNonNegativeInteger(metrics.activeCells)
	);
}

function fieldStateTransferables(state: FieldState): Transferable[] {
	const buffers = [state.u.buffer, state.v.buffer, state.mask.buffer];
	return buffers.filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
}

function isPoint(value: unknown): value is readonly [number, number] {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		value.every((coordinate) => isFiniteInRange(coordinate, 0, 1))
	);
}

function isOperation(value: unknown): value is 'step' | 'replay' {
	return value === 'step' || value === 'replay';
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
	return value === undefined || typeof value === 'boolean';
}

function isOptionalComparisonTarget(value: unknown): value is BrushTarget | undefined {
	return value === undefined || value === 'both' || value === 'a' || value === 'b';
}

function isOptionalChunkSize(value: unknown): value is number | undefined {
	return (
		value === undefined ||
		isBoundedInteger(value, 1, REACTION_DIFFUSION_WORKER_LIMITS.maximumStepsPerChunk)
	);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isFiniteNonNegative(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0;
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
	return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function isNonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
	return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
