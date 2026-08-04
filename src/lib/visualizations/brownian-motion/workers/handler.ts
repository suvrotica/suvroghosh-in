import { DensityGridRunner } from '../advanced/density-grid';
import { FirstPassageRunner } from '../advanced/first-passage';
import { FractionalBrownianRunner } from '../advanced/fractional-brownian';
import {
	ADVANCED_WORKER_PROTOCOL_VERSION,
	taskForRequest,
	type AdvancedWorkerRequest,
	type AdvancedWorkerResponse,
	type AdvancedWorkerTask
} from './protocol';

export type AdvancedWorkerEmitter = (response: AdvancedWorkerResponse) => void;

type AdvancedWorkerResponseBody = AdvancedWorkerResponse extends infer Message
	? Message extends AdvancedWorkerResponse
		? Omit<Message, 'protocolVersion' | 'requestId' | 'generation'>
		: never
	: never;

export interface AdvancedWorkerHandlerOptions {
	supportedTasks?: readonly AdvancedWorkerTask[];
	yieldControl?: () => Promise<void>;
	fractionalBatchSize?: number;
	firstPassageBatchSize?: number;
	densityBatchSize?: number;
}

interface ActiveTask {
	generation: number;
	task: AdvancedWorkerTask;
	cancelled: boolean;
}

/** Pure request handler shared by actual Workers and the asynchronous fallback. */
export class AdvancedWorkerHandler {
	private readonly supportedTasks: ReadonlySet<AdvancedWorkerTask>;
	private readonly yieldControl: () => Promise<void>;
	private readonly fractionalBatchSize: number;
	private readonly firstPassageBatchSize: number;
	private readonly densityBatchSize: number;
	private active: ActiveTask | null = null;
	private disposed = false;

	constructor(options: AdvancedWorkerHandlerOptions = {}) {
		this.supportedTasks = new Set(
			options.supportedTasks ?? ['fractional', 'first-passage', 'density']
		);
		this.yieldControl = options.yieldControl ?? yieldToEventLoop;
		this.fractionalBatchSize = positiveBatch(options.fractionalBatchSize ?? 1);
		this.firstPassageBatchSize = positiveBatch(options.firstPassageBatchSize ?? 512);
		this.densityBatchSize = positiveBatch(options.densityBatchSize ?? 16_384);
	}

	async handle(request: AdvancedWorkerRequest, emit: AdvancedWorkerEmitter): Promise<void> {
		if (request.type === 'CANCEL') {
			const cancelledTask =
				this.active?.generation === request.generation ? this.active.task : null;
			if (this.active?.generation === request.generation) this.active.cancelled = true;
			this.active = null;
			emit(this.response(request, { type: 'CANCELLED', task: cancelledTask }));
			return;
		}

		if (request.type === 'DISPOSE') {
			if (this.active) this.active.cancelled = true;
			this.active = null;
			this.disposed = true;
			emit(this.response(request, { type: 'DISPOSED' }));
			return;
		}

		const task = taskForRequest(request);
		if (this.disposed) {
			emit(
				this.response(request, {
					type: 'ERROR',
					task,
					message: 'The advanced Brownian Worker handler has been disposed.'
				})
			);
			return;
		}
		if (!task || !this.supportedTasks.has(task)) {
			emit(
				this.response(request, {
					type: 'ERROR',
					task,
					message: `The ${task ?? 'unknown'} task is not supported by this Worker.`
				})
			);
			return;
		}

		if (this.active) this.active.cancelled = true;
		const token: ActiveTask = { generation: request.generation, task, cancelled: false };
		this.active = token;

		try {
			switch (request.type) {
				case 'GENERATE_FRACTIONAL':
					await this.generateFractional(request, token, emit);
					break;
				case 'RUN_FIRST_PASSAGE':
					await this.runFirstPassage(request, token, emit);
					break;
				case 'MEASURE_DENSITY':
					await this.measureDensity(request, token, emit);
					break;
			}
		} catch (error) {
			if (this.isActive(token)) {
				const message = error instanceof Error ? error.message : String(error);
				emit(
					this.response(request, {
						type: 'ERROR',
						task,
						message: message || 'The advanced Brownian task failed.',
						...(error instanceof Error && error.stack ? { stack: error.stack } : {})
					})
				);
			}
		} finally {
			if (this.active === token) this.active = null;
		}
	}

	private async generateFractional(
		request: Extract<AdvancedWorkerRequest, { type: 'GENERATE_FRACTIONAL' }>,
		token: ActiveTask,
		emit: AdvancedWorkerEmitter
	): Promise<void> {
		const runner = new FractionalBrownianRunner(request.options);
		this.emitProgress(request, token.task, 0, runner.options.trajectoryCount, emit);
		while (!runner.isComplete()) {
			runner.step(this.fractionalBatchSize);
			if (!this.isActive(token)) return;
			this.emitProgress(
				request,
				token.task,
				runner.completed(),
				runner.options.trajectoryCount,
				emit
			);
			if (!runner.isComplete()) await this.yieldControl();
			if (!this.isActive(token)) return;
		}
		emit(this.response(request, { type: 'FRACTIONAL_RESULT', result: runner.result() }));
	}

	private async runFirstPassage(
		request: Extract<AdvancedWorkerRequest, { type: 'RUN_FIRST_PASSAGE' }>,
		token: ActiveTask,
		emit: AdvancedWorkerEmitter
	): Promise<void> {
		const runner = new FirstPassageRunner(request.options);
		this.emitProgress(request, token.task, 0, runner.options.particleCount, emit);
		while (!runner.isComplete()) {
			runner.step(this.firstPassageBatchSize);
			if (!this.isActive(token)) return;
			this.emitProgress(
				request,
				token.task,
				runner.completed(),
				runner.options.particleCount,
				emit
			);
			if (!runner.isComplete()) await this.yieldControl();
			if (!this.isActive(token)) return;
		}
		emit(this.response(request, { type: 'FIRST_PASSAGE_RESULT', result: runner.result() }));
	}

	private async measureDensity(
		request: Extract<AdvancedWorkerRequest, { type: 'MEASURE_DENSITY' }>,
		token: ActiveTask,
		emit: AdvancedWorkerEmitter
	): Promise<void> {
		const runner = new DensityGridRunner(request.options);
		const total = runner.options.x.length;
		this.emitProgress(request, token.task, 0, total, emit);
		while (!runner.isComplete()) {
			runner.step(this.densityBatchSize);
			if (!this.isActive(token)) return;
			this.emitProgress(request, token.task, runner.completed(), total, emit);
			if (!runner.isComplete()) await this.yieldControl();
			if (!this.isActive(token)) return;
		}
		if (total === 0) this.emitProgress(request, token.task, 0, 0, emit);
		emit(this.response(request, { type: 'DENSITY_RESULT', result: runner.result() }));
	}

	private emitProgress(
		request: AdvancedWorkerRequest,
		task: AdvancedWorkerTask,
		completed: number,
		total: number,
		emit: AdvancedWorkerEmitter
	): void {
		emit(
			this.response(request, {
				type: 'PROGRESS',
				task,
				completed,
				total,
				progress: total === 0 ? 1 : completed / total
			})
		);
	}

	private isActive(token: ActiveTask): boolean {
		return !this.disposed && !token.cancelled && this.active === token;
	}

	private response(
		request: AdvancedWorkerRequest,
		body: AdvancedWorkerResponseBody
	): AdvancedWorkerResponse {
		return {
			protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
			requestId: request.requestId,
			generation: request.generation,
			...body
		} as AdvancedWorkerResponse;
	}
}

function positiveBatch(value: number): number {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new RangeError('Advanced Worker batch sizes must be positive safe integers.');
	}
	return value;
}

function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
