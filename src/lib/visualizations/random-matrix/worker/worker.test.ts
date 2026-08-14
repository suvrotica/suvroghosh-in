import { describe, expect, it } from 'vitest';
import { DEFAULT_RANDOM_MATRIX_STATE } from '../constants';
import { randomMatrixParameterFingerprint } from '../fingerprint';
import type { MatrixAnalysis, RandomMatrixState } from '../types';
import {
	RandomMatrixWorkerClient,
	RandomMatrixWorkerDisposedError,
	RandomMatrixWorkerSupersededError,
	type RandomMatrixWorkerLike
} from './client';
import { RandomMatrixWorkerHandler } from './handler';
import {
	RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
	isRandomMatrixWorkerRequest,
	isRandomMatrixWorkerResponse,
	randomMatrixResponseTransferables,
	type RandomMatrixWorkerRequest,
	type RandomMatrixWorkerResponse
} from './protocol';

const input = {
	state: { ...DEFAULT_RANDOM_MATRIX_STATE, dimension: 2 },
	parameterFingerprint: randomMatrixParameterFingerprint({
		...DEFAULT_RANDOM_MATRIX_STATE,
		dimension: 2
	}),
	sampleIndex: 0
};

describe('random-matrix Worker protocol and handler', () => {
	it('validates request envelopes and transfers every result buffer once', async () => {
		const request: RandomMatrixWorkerRequest = {
			protocolVersion: RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
			runId: 1,
			type: 'ANALYZE',
			input
		};
		expect(isRandomMatrixWorkerRequest(request)).toBe(true);
		expect(isRandomMatrixWorkerRequest({ ...request, runId: 0 })).toBe(false);
		expect(
			isRandomMatrixWorkerRequest({
				...request,
				input: { ...input, parameterFingerprint: undefined }
			})
		).toBe(false);
		expect(
			isRandomMatrixWorkerRequest({
				...request,
				input: {
					...input,
					state: { ...input.state, distribution: 'uniform' }
				}
			})
		).toBe(false);
		expect(
			isRandomMatrixWorkerRequest({
				...request,
				input: { ...input, state: { ...input.state, dimension: 1 } }
			})
		).toBe(false);
		const responses: RandomMatrixWorkerResponse[] = [];
		await new RandomMatrixWorkerHandler().handle(request, (response) => responses.push(response));
		expect(responses).toHaveLength(1);
		const response = responses[0];
		expect(response.type).toBe('ANALYSIS_RESULT');
		expect(isRandomMatrixWorkerResponse(response)).toBe(true);
		if (response.type !== 'ANALYSIS_RESULT') return;
		const transfer = randomMatrixResponseTransferables(response);
		expect(new Set(transfer).size).toBe(transfer.length);
		expect(transfer).toContain(response.result.matrix.buffer);
		expect(transfer).toContain(response.result.singular.values.buffer);
		const clone = structuredClone(response, { transfer });
		expect(response.result.matrix.byteLength).toBe(0);
		expect(isRandomMatrixWorkerResponse(clone)).toBe(true);
		clone.result.summary.rowMeans = new Float64Array(1);
		expect(isRandomMatrixWorkerResponse(clone)).toBe(false);
	});

	it('emits monotonic progress for a cooperative null ensemble', async () => {
		const responses: RandomMatrixWorkerResponse[] = [];
		await new RandomMatrixWorkerHandler({ yieldControl: () => Promise.resolve() }).handle(
			{
				protocolVersion: RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
				runId: 2,
				type: 'RUN_NULL_ENSEMBLE',
				input: { state: input.state, sampleCount: 3, metrics: ['blockContrast'] }
			},
			(response) => responses.push(response)
		);
		expect(
			responses
				.filter((response) => response.type === 'NULL_PROGRESS')
				.map((response) => response.progress.completed)
		).toEqual([1, 2, 3]);
		expect(responses.at(-1)?.type).toBe('NULL_ENSEMBLE_RESULT');
	});
});

describe('RandomMatrixWorkerClient latest-only lifecycle', () => {
	it('hard-restarts for synchronous decomposition cancellation and ignores stale results', async () => {
		const factory = new FakeWorkerFactory();
		const client = new RandomMatrixWorkerClient(() => factory.create());
		const first = client.analyze(input);
		const firstRejected = expect(first).rejects.toBeInstanceOf(RandomMatrixWorkerSupersededError);
		const firstWorker = factory.workers[0];
		const firstRequest = firstWorker.requests[0];
		const second = client.analyze({ ...input, sampleIndex: 1 });
		await firstRejected;
		expect(firstWorker.terminationCount).toBe(1);
		expect(factory.workers).toHaveLength(2);
		const secondWorker = factory.workers[1];
		const secondRequest = secondWorker.requests[0];
		firstWorker.dispatch(analysisResponse(firstRequest.runId, 0));
		let resolved = false;
		void second.then(() => {
			resolved = true;
		});
		await Promise.resolve();
		expect(resolved).toBe(false);
		secondWorker.dispatch(analysisResponse(secondRequest.runId, 1));
		await expect(second).resolves.toMatchObject({ sampleIndex: 1 });
		client.dispose();
	});

	it('cancel terminates and replaces the busy Worker', async () => {
		const factory = new FakeWorkerFactory();
		const client = new RandomMatrixWorkerClient(() => factory.create());
		const pending = client.analyze(input);
		client.cancel();
		await expect(pending).rejects.toThrow(/cancelled/i);
		expect(factory.workers[0].terminationCount).toBe(1);
		expect(factory.workers).toHaveLength(2);
		client.dispose();
	});

	it('disposes idempotently and rejects further calls', async () => {
		const factory = new FakeWorkerFactory();
		const client = new RandomMatrixWorkerClient(() => factory.create());
		const pending = client.analyze(input);
		client.dispose();
		client.dispose();
		await expect(pending).rejects.toBeInstanceOf(RandomMatrixWorkerDisposedError);
		expect(factory.workers[0].terminationCount).toBe(1);
		expect(() => client.analyze(input)).toThrow(RandomMatrixWorkerDisposedError);
	});

	it('rejects and restarts on an active-run terminal response of the wrong kind', async () => {
		const factory = new FakeWorkerFactory();
		const client = new RandomMatrixWorkerClient(() => factory.create());
		const pending = client.analyze(input);
		const worker = factory.workers[0];
		const request = worker.requests[0];
		worker.dispatch({
			protocolVersion: RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
			runId: request.runId,
			type: 'STALE',
			activeRunId: request.runId
		});
		await expect(pending).rejects.toThrow(/incorrectly marked.*stale/i);
		expect(worker.terminationCount).toBe(1);
		expect(factory.workers).toHaveLength(2);
		client.dispose();
	});

	it('rejects a well-formed result fingerprinted for different parameters', async () => {
		const factory = new FakeWorkerFactory();
		const client = new RandomMatrixWorkerClient(() => factory.create());
		const pending = client.analyze(input);
		const worker = factory.workers[0];
		const request = worker.requests[0];
		worker.dispatch(
			analysisResponse(request.runId, 0, { ...input.state, distribution: 'uniform' })
		);
		await expect(pending).rejects.toThrow(/different generative parameters/i);
		expect(worker.terminationCount).toBe(1);
		expect(factory.workers).toHaveLength(2);
		client.dispose();
	});
});

function analysisResponse(
	runId: number,
	sampleIndex: number,
	state: RandomMatrixState = input.state
): RandomMatrixWorkerResponse {
	const analysis: MatrixAnalysis = {
		modelVersion: 'random-matrix-v1',
		parameterFingerprint: randomMatrixParameterFingerprint(state),
		state,
		sampleIndex,
		rearrangement: 'original',
		rows: 2,
		columns: 2,
		matrix: Float64Array.from([1, 0, 0, 1]),
		eigen: {
			real: Float64Array.from([1, 1]),
			imaginary: new Float64Array(2),
			residual: 0,
			maxPairResidual: 0,
			ipr: Float64Array.from([1, 1])
		},
		singular: {
			values: Float64Array.from([1, 1]),
			rank: 2,
			tolerance: 2 * Number.EPSILON,
			condition: 1,
			residual: 0,
			cumulativeEnergy: Float64Array.from([0.5, 1])
		},
		summary: {
			mean: 0.5,
			stddev: 0.5,
			min: 0,
			max: 1,
			frobeniusNorm: Math.SQRT2,
			spectralRadius: 1,
			conditionNumber: 1,
			rank: 2,
			rowMeans: Float64Array.from([0.5, 0.5]),
			columnMeans: Float64Array.from([0.5, 0.5]),
			rowNorms: Float64Array.from([1, 1]),
			columnNorms: Float64Array.from([1, 1])
		},
		theory: null,
		warnings: []
	};
	return {
		protocolVersion: RANDOM_MATRIX_WORKER_PROTOCOL_VERSION,
		runId,
		type: 'ANALYSIS_RESULT',
		result: analysis
	};
}

class FakeWorkerFactory {
	readonly workers: FakeWorker[] = [];

	create(): FakeWorker {
		const worker = new FakeWorker();
		this.workers.push(worker);
		return worker;
	}
}

class FakeWorker extends EventTarget implements RandomMatrixWorkerLike {
	readonly requests: RandomMatrixWorkerRequest[] = [];
	terminationCount = 0;

	postMessage(message: RandomMatrixWorkerRequest): void {
		this.requests.push(message);
	}

	terminate(): void {
		this.terminationCount += 1;
	}

	dispatch(response: RandomMatrixWorkerResponse): void {
		this.dispatchEvent(new MessageEvent('message', { data: response }));
	}
}
