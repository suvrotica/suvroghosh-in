import type { FieldState, GrayScottSetup, Intervention } from '../types';
import { orderedInterventions } from '../interventions';
import { ReferenceGrayScottSimulation } from './reference-kernel';
import {
	REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
	isReactionDiffusionWorkerRequest,
	type CpuSimulationReport,
	type ReactionDiffusionWorkerRequest,
	type ReactionDiffusionWorkerResponse
} from './protocol';

interface ActiveTask {
	readonly requestId: number;
	readonly generation: number;
	readonly operation: 'step' | 'replay';
	readonly totalSteps: number;
	readonly stepsPerChunk: number;
	readonly interventionsByStep: ReadonlyMap<number, readonly Intervention[]>;
	readonly includeState: boolean;
	completedSteps: number;
}

/** Platform-independent, bounded scheduler used by both the real Worker and unit tests. */
export class ReactionDiffusionWorkerHandler {
	private disposed = false;
	private latestGeneration = 0;
	private simulation: ReferenceGrayScottSimulation | null = null;
	private activeTask: ActiveTask | null = null;

	get isRunning(): boolean {
		return this.activeTask !== null;
	}

	get activeGeneration(): number {
		return this.latestGeneration;
	}

	abortActive(): void {
		this.activeTask = null;
	}

	handle(request: ReactionDiffusionWorkerRequest): ReactionDiffusionWorkerResponse[] {
		if (!isReactionDiffusionWorkerRequest(request)) {
			return [errorResponse(request, new Error('Malformed reaction–diffusion Worker request.'))];
		}
		try {
			if (this.disposed && request.type !== 'DISPOSE') {
				throw new Error('The reaction–diffusion CPU Worker has been disposed.');
			}
			switch (request.type) {
				case 'RESET':
					return this.reset(request);
				case 'STEP':
					return this.startStep(request);
				case 'REPLAY':
					return this.startReplay(request);
				case 'METRICS':
					return this.metrics(request);
				case 'CANCEL':
					return this.cancel(request);
				case 'DISPOSE':
					this.activeTask = null;
					this.simulation = null;
					this.disposed = true;
					return [{ ...envelope(request), type: 'DISPOSED' }];
			}
		} catch (error) {
			this.activeTask = null;
			return [errorResponse(request, error)];
		}
	}

	processNextChunk(): ReactionDiffusionWorkerResponse[] {
		const task = this.activeTask;
		const simulation = this.simulation;
		if (!task || !simulation || this.disposed) return [];

		try {
			const target = Math.min(task.totalSteps, task.completedSteps + task.stepsPerChunk);
			while (task.completedSteps < target) {
				const inspection = simulation.step(
					task.interventionsByStep.get(simulation.stepIndex) ?? []
				);
				task.completedSteps += 1;
				if (!inspection.healthy) {
					this.activeTask = null;
					return [
						{
							...taskEnvelope(task),
							type: 'NUMERICAL_FAILURE',
							report: report(simulation, task.includeState),
							reason: inspection.reason,
							failureIndex: inspection.index
						}
					];
				}
			}

			const responses: ReactionDiffusionWorkerResponse[] = [
				{
					...taskEnvelope(task),
					type: 'PROGRESS',
					operation: task.operation,
					completedSteps: task.completedSteps,
					totalSteps: task.totalSteps,
					step: simulation.stepIndex,
					modelTime: simulation.modelTime
				}
			];
			if (task.completedSteps >= task.totalSteps) {
				this.activeTask = null;
				responses.push({
					...taskEnvelope(task),
					type: task.operation === 'step' ? 'STEP_COMPLETE' : 'REPLAY_COMPLETE',
					report: report(simulation, task.includeState)
				});
			}
			return responses;
		} catch (error) {
			this.activeTask = null;
			return [taskErrorResponse(task, error)];
		}
	}

	private reset(
		request: Extract<ReactionDiffusionWorkerRequest, { type: 'RESET' }>
	): ReactionDiffusionWorkerResponse[] {
		if (request.generation <= this.latestGeneration)
			return [staleResponse(request, this.latestGeneration)];
		this.latestGeneration = request.generation;
		this.activeTask = null;
		this.simulation = new ReferenceGrayScottSimulation(
			snapshotSetup(request.setup),
			request.state ? cloneState(request.state) : undefined,
			request.comparisonTarget
		);
		return [
			{
				...envelope(request),
				type: 'RESET_COMPLETE',
				report: report(this.simulation, request.includeState ?? false)
			}
		];
	}

	private startStep(
		request: Extract<ReactionDiffusionWorkerRequest, { type: 'STEP' }>
	): ReactionDiffusionWorkerResponse[] {
		if (request.generation !== this.latestGeneration)
			return [staleResponse(request, this.latestGeneration)];
		if (!this.simulation) throw new Error('Reset the CPU reference simulation before stepping it.');
		if (this.activeTask) throw new Error('A CPU simulation request is already running.');
		this.activeTask = {
			requestId: request.requestId,
			generation: request.generation,
			operation: 'step',
			totalSteps: request.steps,
			stepsPerChunk: request.stepsPerChunk ?? 2,
			interventionsByStep: groupInterventions(request.interventions ?? []),
			includeState: request.includeState ?? false,
			completedSteps: 0
		};
		return this.startedResponses(this.activeTask, this.simulation);
	}

	private startReplay(
		request: Extract<ReactionDiffusionWorkerRequest, { type: 'REPLAY' }>
	): ReactionDiffusionWorkerResponse[] {
		if (request.generation <= this.latestGeneration)
			return [staleResponse(request, this.latestGeneration)];
		this.latestGeneration = request.generation;
		this.simulation = new ReferenceGrayScottSimulation(
			snapshotSetup(request.setup),
			request.state ? cloneState(request.state) : undefined,
			request.comparisonTarget
		);
		this.activeTask = {
			requestId: request.requestId,
			generation: request.generation,
			operation: 'replay',
			totalSteps: request.targetStep,
			stepsPerChunk: request.stepsPerChunk ?? 2,
			interventionsByStep: groupInterventions(request.interventions),
			includeState: request.includeState ?? false,
			completedSteps: 0
		};
		return this.startedResponses(this.activeTask, this.simulation);
	}

	private metrics(
		request: Extract<ReactionDiffusionWorkerRequest, { type: 'METRICS' }>
	): ReactionDiffusionWorkerResponse[] {
		if (request.generation !== this.latestGeneration)
			return [staleResponse(request, this.latestGeneration)];
		if (!this.simulation)
			throw new Error('Reset the CPU reference simulation before requesting metrics.');
		return [
			{
				...envelope(request),
				type: 'METRICS_RESULT',
				report: report(this.simulation, request.includeState ?? false)
			}
		];
	}

	private cancel(
		request: Extract<ReactionDiffusionWorkerRequest, { type: 'CANCEL' }>
	): ReactionDiffusionWorkerResponse[] {
		if (request.generation !== this.latestGeneration)
			return [staleResponse(request, this.latestGeneration)];
		const completedSteps = this.activeTask?.completedSteps ?? 0;
		const totalSteps = this.activeTask?.totalSteps ?? 0;
		this.activeTask = null;
		return [{ ...envelope(request), type: 'CANCELLED', completedSteps, totalSteps }];
	}

	private startedResponses(
		task: ActiveTask,
		simulation: ReferenceGrayScottSimulation
	): ReactionDiffusionWorkerResponse[] {
		const started: ReactionDiffusionWorkerResponse = {
			...taskEnvelope(task),
			type: 'STARTED',
			operation: task.operation,
			startStep: simulation.stepIndex,
			totalSteps: task.totalSteps
		};
		if (task.totalSteps > 0) return [started];
		this.activeTask = null;
		return [
			started,
			{
				...taskEnvelope(task),
				type: task.operation === 'step' ? 'STEP_COMPLETE' : 'REPLAY_COMPLETE',
				report: report(simulation, task.includeState)
			}
		];
	}
}

function report(
	simulation: ReferenceGrayScottSimulation,
	includeState: boolean
): CpuSimulationReport {
	return {
		step: simulation.stepIndex,
		modelTime: simulation.modelTime,
		metrics: simulation.metrics(),
		...(includeState ? { state: simulation.snapshot() } : {})
	};
}

function snapshotSetup(setup: GrayScottSetup): GrayScottSetup {
	return { ...setup };
}

function cloneState(state: FieldState): FieldState {
	return { size: state.size, u: state.u.slice(), v: state.v.slice(), mask: state.mask.slice() };
}

function groupInterventions(
	interventions: readonly Intervention[]
): ReadonlyMap<number, readonly Intervention[]> {
	const groups = new Map<number, Intervention[]>();
	for (const intervention of orderedInterventions(interventions)) {
		const group = groups.get(intervention.step) ?? [];
		group.push(intervention);
		groups.set(intervention.step, group);
	}
	return groups;
}

function envelope(request: ReactionDiffusionWorkerRequest) {
	return {
		protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
		requestId: request.requestId,
		generation: request.generation
	} as const;
}

function taskEnvelope(task: ActiveTask) {
	return {
		protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
		requestId: task.requestId,
		generation: task.generation
	} as const;
}

function staleResponse(
	request: ReactionDiffusionWorkerRequest,
	activeGeneration: number
): ReactionDiffusionWorkerResponse {
	return {
		...envelope(request),
		type: 'STALE',
		activeGeneration,
		message: `Generation ${request.generation} cannot overwrite active generation ${activeGeneration}.`
	};
}

function errorResponse(
	request: Pick<ReactionDiffusionWorkerRequest, 'requestId' | 'generation'>,
	error: unknown
): ReactionDiffusionWorkerResponse {
	return {
		protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
		requestId: Number.isSafeInteger(request.requestId) ? request.requestId : 0,
		generation: Number.isSafeInteger(request.generation) ? request.generation : 0,
		type: 'ERROR',
		message: error instanceof Error ? error.message : 'Unknown reaction–diffusion Worker error.',
		...(error instanceof Error && error.stack ? { stack: error.stack } : {})
	};
}

function taskErrorResponse(task: ActiveTask, error: unknown): ReactionDiffusionWorkerResponse {
	return {
		...taskEnvelope(task),
		type: 'ERROR',
		message: error instanceof Error ? error.message : 'Unknown CPU integration error.',
		...(error instanceof Error && error.stack ? { stack: error.stack } : {})
	};
}
