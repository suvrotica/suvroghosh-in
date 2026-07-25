import { describe, expect, it } from 'vitest';
import { DEFAULT_DT_MS, DEFAULT_MODEL_INPUT_GAINS, generateStimulus } from '../index';
import type { SimulationConfig } from '../types';
import { NeuronZooWorkerClient, type WorkerLike } from './client';
import { NeuronZooWorkerHandler } from './handler';
import {
	isNeuronZooWorkerResponse,
	NEURON_ZOO_PROTOCOL_VERSION,
	simulationResultTransferables,
	type NeuronZooWorkerRequest,
	type NeuronZooWorkerRequestBody,
	type NeuronZooWorkerResponse
} from './protocol';

function config(durationMs = 25): SimulationConfig {
	return {
		dtMs: DEFAULT_DT_MS,
		durationMs,
		seed: 1337,
		stimulus: generateStimulus('single-pulse', {
			durationMs,
			dtMs: DEFAULT_DT_MS
		}),
		gains: { ...DEFAULT_MODEL_INPUT_GAINS }
	};
}

function request(
	body: NeuronZooWorkerRequestBody,
	requestId = 1,
	runId = 1
): NeuronZooWorkerRequest {
	return {
		protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
		requestId,
		runId,
		...body
	} as NeuronZooWorkerRequest;
}

describe('NeuronZooWorkerHandler', () => {
	it('initializes, steps exactly one dt, pauses, resets, and produces a snapshot', () => {
		const handler = new NeuronZooWorkerHandler();
		const simulationConfig = config();
		expect(handler.handle(request({ type: 'INIT', config: simulationConfig }))[0].type).toBe(
			'READY'
		);

		const step = handler.handle(request({ type: 'STEP' }, 2))[0];
		expect(step.type).toBe('FRAME');
		if (step.type === 'FRAME') {
			expect(step.frame.stepIndex).toBe(1);
			expect(step.frame.timeMs).toBe(DEFAULT_DT_MS);
			expect(step.requestId).toBe(2);
			expect(step.runId).toBe(1);
		}

		const secondStep = handler.handle(request({ type: 'STEP' }, 3))[0];
		if (secondStep.type === 'FRAME') {
			expect(secondStep.frame.stepIndex).toBe(2);
			expect(secondStep.frame.timeMs).toBe(2 * DEFAULT_DT_MS);
		}

		const paused = handler.handle(request({ type: 'PAUSE' }, 4))[0];
		expect(paused.type).toBe('FRAME');
		if (paused.type === 'FRAME') expect(paused.frame.running).toBe(false);

		const reset = handler.handle(request({ type: 'RESET' }, 5))[0];
		if (reset.type === 'FRAME') expect(reset.frame.stepIndex).toBe(0);

		const run = handler.handle(request({ type: 'RUN' }, 6));
		const snapshot = run.find((message) => message.type === 'SNAPSHOT');
		expect(snapshot?.type).toBe('SNAPSHOT');
		if (snapshot?.type === 'SNAPSHOT') {
			expect(snapshot.result.durationMs).toBe(simulationConfig.durationMs);
			expect(snapshot.result.stepCount).toBe(simulationConfig.durationMs / DEFAULT_DT_MS);
			expect(snapshot.requestId).toBe(6);
			expect(snapshot.runId).toBe(1);
		}
	});

	it('returns a surfaced error before initialization', () => {
		const response = new NeuronZooWorkerHandler().handle(request({ type: 'RUN' }, 4, 9))[0];
		expect(response.type).toBe('ERROR');
		if (response.type === 'ERROR') {
			expect(response.message).toMatch(/not been initialized/i);
			expect(response.requestId).toBe(4);
			expect(response.runId).toBe(9);
		}
	});

	it('surfaces protocol and simulation errors with the originating identifiers', () => {
		const handler = new NeuronZooWorkerHandler();
		const wrongVersion = {
			...request({ type: 'RUN' }, 17, 23),
			protocolVersion: 999
		} as unknown as NeuronZooWorkerRequest;
		const protocolError = handler.handle(wrongVersion)[0];
		expect(protocolError).toMatchObject({
			type: 'ERROR',
			requestId: 17,
			runId: 23
		});
		if (protocolError.type === 'ERROR') {
			expect(protocolError.message).toMatch(/protocol version/i);
		}

		const invalidConfig = config();
		invalidConfig.dtMs = 1;
		handler.handle(request({ type: 'INIT', config: invalidConfig }, 18, 24));
		const simulationError = handler.handle(request({ type: 'RUN' }, 19, 24))[0];
		expect(simulationError).toMatchObject({
			type: 'ERROR',
			requestId: 19,
			runId: 24
		});
		if (simulationError.type === 'ERROR') {
			expect(simulationError.message).toMatch(/invalid neuron zoo simulation config/i);
		}
	});

	it('treats disposal as terminal and surfaces later requests as errors', () => {
		const handler = new NeuronZooWorkerHandler();
		handler.handle(request({ type: 'INIT', config: config() }));
		const disposal = handler.handle(request({ type: 'DISPOSE' }, 2, 3))[0];
		expect(disposal).toMatchObject({ type: 'FRAME', requestId: 2, runId: 3 });

		const afterDisposal = handler.handle(request({ type: 'STEP' }, 3, 3))[0];
		expect(afterDisposal).toMatchObject({ type: 'ERROR', requestId: 3, runId: 3 });
		if (afterDisposal.type === 'ERROR') {
			expect(afterDisposal.message).toMatch(/disposed/i);
		}
	});

	it('collects every unique substantial snapshot buffer for transfer', () => {
		const handler = new NeuronZooWorkerHandler();
		handler.handle(request({ type: 'INIT', config: config(5) }));
		const snapshot = handler
			.handle(request({ type: 'RUN' }, 2))
			.find((response) => response.type === 'SNAPSHOT');
		expect(snapshot?.type).toBe('SNAPSHOT');
		if (snapshot?.type !== 'SNAPSHOT') return;

		const transferables = simulationResultTransferables(snapshot.result);
		expect(transferables.length).toBeGreaterThan(10);
		expect(new Set(transferables).size).toBe(transferables.length);
		expect(transferables).toContain(snapshot.result.timeMs.buffer);
		expect(transferables).toContain(snapshot.result.displayCommand.buffer);
		for (const trace of Object.values(snapshot.result.traces)) {
			expect(transferables).toContain(trace.nativeInput.buffer);
			for (const channel of Object.values(trace.channels)) {
				expect(transferables).toContain(channel.buffer);
			}
		}

		const transferredClone = structuredClone(snapshot.result, {
			transfer: transferables
		});
		expect(snapshot.result.timeMs.byteLength).toBe(0);
		expect(transferredClone.timeMs.byteLength).toBeGreaterThan(0);
	});
});

class FakeWorker implements WorkerLike {
	messages: NeuronZooWorkerRequest[] = [];
	transfers: Transferable[][] = [];
	terminated = false;
	terminationCount = 0;
	private listener?: (event: MessageEvent<unknown>) => void;

	postMessage(message: NeuronZooWorkerRequest, transfer: Transferable[] = []) {
		this.messages.push(message);
		this.transfers.push(transfer);
	}

	addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
		this.listener = listener;
	}

	removeEventListener() {
		this.listener = undefined;
	}

	terminate() {
		this.terminated = true;
		this.terminationCount += 1;
	}

	emit(response: unknown) {
		this.listener?.({ data: response } as MessageEvent<unknown>);
	}
}

describe('NeuronZooWorkerClient', () => {
	it('transfers a cloned stimulus and ignores stale run messages', () => {
		const worker = new FakeWorker();
		const client = new NeuronZooWorkerClient(worker);
		const original = config();
		const responses: NeuronZooWorkerResponse[] = [];
		client.subscribe((response) => responses.push(response));
		const firstRun = client.initialize(original);
		const init = worker.messages[0];
		expect(init.type).toBe('INIT');
		expect(worker.transfers[0]).toHaveLength(1);
		if (init.type === 'INIT') {
			expect(init.config.stimulus).not.toBe(original.stimulus);
			expect(init.config.stimulus).toEqual(original.stimulus);
			expect(init.config.gains).not.toBe(original.gains);
			expect(worker.transfers[0]).toEqual([init.config.stimulus.buffer]);
			const transferredFirstSample = init.config.stimulus[0];
			original.stimulus[0] = transferredFirstSample === 1 ? 0 : 1;
			expect(init.config.stimulus[0]).toBe(transferredFirstSample);
		}
		expect(original.stimulus.byteLength).toBeGreaterThan(0);

		client.reset();
		worker.emit({
			protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
			requestId: 1,
			runId: firstRun,
			type: 'READY'
		});
		expect(responses).toHaveLength(0);

		worker.emit({
			protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
			requestId: 2,
			runId: client.currentRunId(),
			type: 'READY'
		});
		expect(responses).toHaveLength(1);
	});

	it('suppresses out-of-order and malformed responses without dropping siblings', () => {
		const worker = new FakeWorker();
		const client = new NeuronZooWorkerClient(worker);
		const responses: NeuronZooWorkerResponse[] = [];
		client.subscribe((response) => responses.push(response));
		const runId = client.initialize(config());
		client.run();

		worker.emit({
			protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
			requestId: 2,
			runId,
			type: 'METRICS',
			commandHash: 'command',
			traceHashes: {}
		});
		worker.emit({
			protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
			requestId: 2,
			runId,
			type: 'WARNING',
			message: 'same-request sibling'
		});
		worker.emit({
			protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
			requestId: 1,
			runId,
			type: 'READY'
		});
		worker.emit({
			protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
			requestId: 99,
			runId,
			type: 'READY'
		});
		worker.emit({
			protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
			requestId: 2,
			runId,
			type: 'NOT_A_RESPONSE'
		});

		expect(responses.map((response) => response.type)).toEqual(['METRICS', 'WARNING']);
	});

	it('increments the run for every state-invalidating typed command', () => {
		const worker = new FakeWorker();
		const client = new NeuronZooWorkerClient(worker);
		expect(client.initialize(config())).toBe(1);
		expect(client.setPreset('quiet')).toBe(2);
		expect(client.setModelParameters({})).toBe(3);
		expect(client.setGains({ ...DEFAULT_MODEL_INPUT_GAINS })).toBe(4);
		expect(client.setStimulus(new Float64Array(config().stimulus))).toBe(5);
		expect(client.setConfig(config())).toBe(6);
		client.sendMessage({ type: 'RESET' });
		expect(client.currentRunId()).toBe(7);

		expect(worker.messages.map((message) => message.runId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(worker.messages.map((message) => message.requestId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it('sends DISPOSE and terminates exactly once', () => {
		const worker = new FakeWorker();
		const client = new NeuronZooWorkerClient(worker);
		client.dispose();
		client.dispose();
		expect(worker.messages.at(-1)?.type).toBe('DISPOSE');
		expect(worker.terminated).toBe(true);
		expect(worker.terminationCount).toBe(1);
		expect(() => client.run()).toThrow(/disposed/i);
		expect(() => client.subscribe(() => undefined)).toThrow(/disposed/i);
	});
});

describe('Worker protocol guards', () => {
	it('accepts only recognized, structurally valid responses', () => {
		expect(
			isNeuronZooWorkerResponse({
				protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
				requestId: 1,
				runId: 1,
				type: 'READY'
			})
		).toBe(true);
		expect(
			isNeuronZooWorkerResponse({
				protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
				requestId: 1,
				runId: 1,
				type: 'FRAME',
				frame: { stepIndex: -1, timeMs: 0, command: 0, running: false }
			})
		).toBe(false);
		expect(
			isNeuronZooWorkerResponse({
				protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
				requestId: 1,
				runId: 1,
				type: 'UNKNOWN'
			})
		).toBe(false);
	});
});
