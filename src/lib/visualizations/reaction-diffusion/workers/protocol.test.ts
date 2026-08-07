import { describe, expect, it } from 'vitest';
import type { FieldState, GrayScottSetup } from '../types';
import { ReactionDiffusionWorkerClient, type ReactionDiffusionWorkerLike } from './client';
import { ReactionDiffusionWorkerHandler } from './handler';
import {
	REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
	isReactionDiffusionWorkerRequest,
	isReactionDiffusionWorkerResponse,
	reactionDiffusionResponseTransferables,
	type ReactionDiffusionWorkerRequest,
	type ReactionDiffusionWorkerRequestBody,
	type ReactionDiffusionWorkerResponse
} from './protocol';

function setup(overrides: Partial<GrayScottSetup> = {}): GrayScottSetup {
	return {
		feed: 0.0367,
		kill: 0.0649,
		diffusionU: 0.16,
		diffusionV: 0.08,
		timestep: 0.25,
		gridSize: 16,
		domainWidth: 16,
		boundary: 'periodic',
		maskPreset: 'open-square',
		initialCondition: 'central-soft-disk',
		seed: 'protocol-test',
		integrator: 'heun',
		...overrides
	};
}

function request(
	body: ReactionDiffusionWorkerRequestBody,
	requestId = 1,
	generation = 1
): ReactionDiffusionWorkerRequest {
	return {
		protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
		requestId,
		generation,
		...body
	} as ReactionDiffusionWorkerRequest;
}

function finish(handler: ReactionDiffusionWorkerHandler): ReactionDiffusionWorkerResponse[] {
	const responses: ReactionDiffusionWorkerResponse[] = [];
	while (handler.isRunning) responses.push(...handler.processNextChunk());
	return responses;
}

describe('reaction–diffusion CPU Worker protocol', () => {
	it('validates exact typed-array lengths and exposes only snapshot buffers as transferables', () => {
		const malformed = request({
			type: 'RESET',
			setup: setup(),
			state: {
				size: 16,
				u: new Float64Array(255),
				v: new Float64Array(256),
				mask: new Uint8Array(256)
			}
		});
		expect(isReactionDiffusionWorkerRequest(malformed)).toBe(false);

		const handler = new ReactionDiffusionWorkerHandler();
		const response = handler.handle(
			request({ type: 'RESET', setup: setup(), includeState: true })
		)[0];
		expect(response.type).toBe('RESET_COMPLETE');
		expect(isReactionDiffusionWorkerResponse(response)).toBe(true);
		if (response.type !== 'RESET_COMPLETE' || !response.report.state) return;
		expect(reactionDiffusionResponseTransferables(response)).toEqual([
			response.report.state.u.buffer,
			response.report.state.v.buffer,
			response.report.state.mask.buffer
		]);
	});

	it('preserves, rather than sanitizes, a non-finite numerical-failure snapshot', () => {
		const failedState: FieldState = {
			size: 16,
			u: new Float64Array(256).fill(1),
			v: new Float64Array(256),
			mask: new Uint8Array(256).fill(1)
		};
		failedState.v[42] = Number.NaN;
		const response: ReactionDiffusionWorkerResponse = {
			protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
			requestId: 2,
			generation: 1,
			type: 'NUMERICAL_FAILURE',
			report: { step: 7, modelTime: 1.75, metrics: null, state: failedState },
			reason: 'A concentration became non-finite.',
			failureIndex: 42
		};
		expect(isReactionDiffusionWorkerResponse(response)).toBe(true);
		expect(Number.isNaN(response.report.state!.v[42])).toBe(true);
	});

	it('rejects duplicate event sequence numbers at the protocol boundary', () => {
		const event = {
			schemaVersion: 1 as const,
			sequence: 4,
			step: 0,
			kind: 'mask' as const,
			active: false,
			from: [0.2, 0.2] as const,
			to: [0.8, 0.2] as const,
			radius: 0.04
		};
		expect(
			isReactionDiffusionWorkerRequest(
				request({ type: 'STEP', steps: 1, interventions: [event, { ...event }] })
			)
		).toBe(false);
	});

	it('keeps generation barriers and deterministically replays the same fixed steps', () => {
		const handler = new ReactionDiffusionWorkerHandler();
		expect(handler.handle(request({ type: 'RESET', setup: setup() }, 1, 1))[0].type).toBe(
			'RESET_COMPLETE'
		);
		expect(
			handler.handle(
				request({ type: 'STEP', steps: 6, stepsPerChunk: 2, includeState: true }, 2, 1)
			)[0]
		).toMatchObject({ type: 'STARTED', totalSteps: 6 });
		const first = finish(handler).find((response) => response.type === 'STEP_COMPLETE');
		expect(first?.type).toBe('STEP_COMPLETE');

		expect(handler.handle(request({ type: 'RESET', setup: setup() }, 3, 1))[0]).toMatchObject({
			type: 'STALE',
			activeGeneration: 1
		});
		handler.handle(
			request(
				{
					type: 'REPLAY',
					setup: setup(),
					interventions: [],
					targetStep: 6,
					stepsPerChunk: 3,
					includeState: true
				},
				4,
				2
			)
		);
		const replay = finish(handler).find((response) => response.type === 'REPLAY_COMPLETE');
		if (first?.type !== 'STEP_COMPLETE' || replay?.type !== 'REPLAY_COMPLETE') {
			throw new Error('Expected terminal state responses.');
		}
		expect(replay.report.step).toBe(6);
		expect([...replay.report.state!.u]).toEqual([...first.report.state!.u]);
		expect([...replay.report.state!.v]).toEqual([...first.report.state!.v]);
	});
});

class FakeWorker implements ReactionDiffusionWorkerLike {
	readonly messages: ReactionDiffusionWorkerRequest[] = [];
	readonly transfers: Transferable[][] = [];
	terminated = false;
	private readonly listeners = new Map<string, Set<EventListener>>();

	postMessage(message: ReactionDiffusionWorkerRequest, transfer: Transferable[] = []): void {
		this.messages.push(message);
		this.transfers.push(transfer);
	}

	addEventListener(type: string, listener: EventListener): void {
		const listeners = this.listeners.get(type) ?? new Set<EventListener>();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: EventListener): void {
		this.listeners.get(type)?.delete(listener);
	}

	terminate(): void {
		this.terminated = true;
	}

	dispatch(response: unknown): void {
		const event = { data: response } as MessageEvent<unknown>;
		for (const listener of this.listeners.get('message') ?? []) listener(event);
	}
}

describe('ReactionDiffusionWorkerClient', () => {
	it('copies transferred input and filters stale generation responses', () => {
		const worker = new FakeWorker();
		const client = new ReactionDiffusionWorkerClient(worker);
		const received: ReactionDiffusionWorkerResponse[] = [];
		client.subscribe((response) => received.push(response));
		const source: FieldState = {
			size: 16,
			u: new Float64Array(256).fill(1),
			v: new Float64Array(256),
			mask: new Uint8Array(256).fill(1)
		};
		client.reset(setup(), { state: source });
		const posted = worker.messages[0];
		expect(posted.type).toBe('RESET');
		if (posted.type !== 'RESET' || !posted.state) return;
		expect(posted.state.u.buffer).not.toBe(source.u.buffer);
		expect(worker.transfers[0]).toContain(posted.state.u.buffer);

		client.reset(setup({ seed: 'new-generation' }));
		worker.dispatch(errorResponse(1, 1));
		worker.dispatch(errorResponse(2, 2));
		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({ type: 'ERROR', generation: 2 });
		client.dispose();
		expect(worker.terminated).toBe(true);
	});
});

function errorResponse(requestId: number, generation: number): ReactionDiffusionWorkerResponse {
	return {
		protocolVersion: REACTION_DIFFUSION_WORKER_PROTOCOL_VERSION,
		requestId,
		generation,
		type: 'ERROR',
		message: 'synthetic failure'
	};
}
