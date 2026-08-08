import { describe, expect, it } from 'vitest';
import { MODEL_VERSION, createModelParameters, simulateSingle } from '../model';
import {
	NucleusWorkerDisposedError,
	NucleusWorkerSupersededError,
	WeatherNucleusWorkerClient,
	type NucleusWorkerLike
} from './client';
import { MAX_FALLBACK_ENSEMBLE_CHUNK, NucleusWorkerHandler } from './handler';
import {
	NUCLEUS_ENSEMBLE_SIZE,
	NUCLEUS_WORKER_PROTOCOL_VERSION,
	isNucleusWorkerRequest,
	isNucleusWorkerResponse,
	responseTransferables,
	type FocalPairResponse,
	type NucleusWorkerRequest,
	type NucleusWorkerResponse
} from './protocol';

const baseline = createModelParameters({ duration: 10 });
const intervention = createModelParameters({ duration: 10, geometryBias: 1 });

describe('Weather Inside the Nucleus Worker protocol', () => {
	it('accepts only complete protocol-v1 scientific request schemas', () => {
		const valid: NucleusWorkerRequest = {
			protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
			runId: 1,
			type: 'RUN_FOCAL_PAIR',
			seed: 3,
			baseline,
			intervention
		};
		expect(isNucleusWorkerRequest(valid)).toBe(true);
		expect(isNucleusWorkerRequest({ ...valid, protocolVersion: 2 })).toBe(false);
		expect(isNucleusWorkerRequest({ ...valid, runId: 0 })).toBe(false);
		expect(isNucleusWorkerRequest({ ...valid, baseline: { duration: 10 } })).toBe(false);
		expect(isNucleusWorkerRequest({ ...valid, seed: -1 })).toBe(false);
	});

	it('returns full focal traces and transfers every numerical buffer exactly once', async () => {
		const responses: NucleusWorkerResponse[] = [];
		await new NucleusWorkerHandler().handle(
			{
				protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
				runId: 1,
				type: 'RUN_FOCAL_PAIR',
				seed: 3,
				baseline,
				intervention
			},
			(response) => responses.push(response)
		);
		const response = responses[0];
		expect(response.type).toBe('FOCAL_PAIR_RESULT');
		expect(isNucleusWorkerResponse(response)).toBe(true);
		if (response.type !== 'FOCAL_PAIR_RESULT') throw new Error('Missing focal result.');
		expect(response.result.baseline.timeline.time.length).toBeGreaterThan(1);
		expect(response.result.intervention.timeline.time.length).toBeGreaterThan(1);

		const transfer = responseTransferables(response);
		expect(transfer).toHaveLength(32);
		expect(new Set(transfer).size).toBe(transfer.length);
		expect(transfer).toContain(response.result.baseline.timeline.time.buffer);
		expect(transfer).toContain(response.result.intervention.initiationTimes.buffer);

		const clone = structuredClone(response, { transfer });
		expect(response.result.baseline.timeline.time.byteLength).toBe(0);
		expect(isNucleusWorkerResponse(clone)).toBe(true);
	});

	it('cooperatively builds exactly 48 compact matched summaries in capped chunks', async () => {
		let yields = 0;
		const handler = new NucleusWorkerHandler({
			cooperativeEnsemble: true,
			ensembleChunkSize: 99,
			yieldControl: async () => {
				yields += 1;
			}
		});
		const responses: NucleusWorkerResponse[] = [];
		await handler.handle(
			{
				protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
				runId: 2,
				type: 'RUN_MATCHED_ENSEMBLE',
				rootSeed: 91,
				baseline,
				intervention
			},
			(response) => responses.push(response)
		);
		const response = responses[0];
		expect(response.type).toBe('MATCHED_ENSEMBLE_RESULT');
		expect(isNucleusWorkerResponse(response)).toBe(true);
		if (response.type !== 'MATCHED_ENSEMBLE_RESULT') throw new Error('Missing ensemble result.');
		expect(response.result.runCount).toBe(NUCLEUS_ENSEMBLE_SIZE);
		expect(response.result.baseline.burstCounts).toHaveLength(NUCLEUS_ENSEMBLE_SIZE);
		expect(response.result.intervention.firstBurstCensored).toHaveLength(NUCLEUS_ENSEMBLE_SIZE);
		expect('runs' in response.result.baseline).toBe(false);
		expect(yields).toBe(Math.ceil(NUCLEUS_ENSEMBLE_SIZE / MAX_FALLBACK_ENSEMBLE_CHUNK) - 1);
		expect(responseTransferables(response)).toHaveLength(11);
	});
});

describe('WeatherNucleusWorkerClient', () => {
	it('uses monotonic run IDs, rejects superseded work, and ignores stale results', async () => {
		const worker = new FakeWorker();
		const client = new WeatherNucleusWorkerClient(worker);
		const first = client.runFocalPair({ seed: 1, baseline, intervention });
		const firstRejection = expect(first).rejects.toBeInstanceOf(NucleusWorkerSupersededError);
		const second = client.runFocalPair({ seed: 2, baseline, intervention });
		await firstRejection;

		const work = worker.messages.filter(
			(request): request is Extract<NucleusWorkerRequest, { type: 'RUN_FOCAL_PAIR' }> =>
				request.type === 'RUN_FOCAL_PAIR'
		);
		expect(work.map((request) => request.runId)).toEqual([1, 2]);
		let secondResolved = false;
		void second.then(() => {
			secondResolved = true;
		});
		worker.dispatch(focalResponse(work[0].runId, work[0].seed));
		await Promise.resolve();
		expect(secondResolved).toBe(false);
		worker.dispatch(focalResponse(work[1].runId, work[1].seed));
		await expect(second).resolves.toMatchObject({ seed: 2, modelVersion: MODEL_VERSION });
		client.dispose();
	});

	it('recovers an unexpected Worker failure through the cooperative fallback', async () => {
		const worker = new FakeWorker();
		let yields = 0;
		const client = new WeatherNucleusWorkerClient(worker, {
			yieldControl: async () => {
				yields += 1;
			}
		});
		const resultPromise = client.runFocalPair({ seed: 7, baseline, intervention });
		worker.dispatchError();
		const result = await resultPromise;
		expect(result.seed).toBe(7);
		expect(result.baseline.timeline.time.length).toBeGreaterThan(1);
		expect(client.usingFallback()).toBe(true);
		expect(worker.terminationCount).toBe(1);
		expect(yields).toBeGreaterThanOrEqual(2);
		client.dispose();
	});

	it('rejects typed task errors without accepting a replacement result', async () => {
		const worker = new FakeWorker();
		const client = new WeatherNucleusWorkerClient(worker);
		const promise = client.runFocalPair({ seed: 8, baseline, intervention });
		worker.dispatch({
			protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
			runId: client.currentRunId(),
			type: 'ERROR',
			task: 'focal',
			message: 'synthetic failure'
		});
		await expect(promise).rejects.toThrow('synthetic failure');
		client.dispose();
	});

	it('terminates once and cannot resolve or notify after disposal', async () => {
		const worker = new FakeWorker();
		const client = new WeatherNucleusWorkerClient(worker);
		let resolved = 0;
		let rejected = 0;
		const pending = client.runFocalPair({ seed: 9, baseline, intervention });
		void pending.then(
			() => {
				resolved += 1;
			},
			() => {
				rejected += 1;
			}
		);
		const capturedListener = worker.messageListener();
		const runId = client.currentRunId();
		client.dispose();
		client.dispose();
		await expect(pending).rejects.toBeInstanceOf(NucleusWorkerDisposedError);
		capturedListener?.({ data: focalResponse(runId, 9) } as MessageEvent);
		await Promise.resolve();
		expect({ resolved, rejected }).toEqual({ resolved: 0, rejected: 1 });
		expect(worker.terminationCount).toBe(1);
		expect(worker.listenerCount()).toBe(0);
		expect(() => client.runFocalPair({ seed: 10, baseline, intervention })).toThrow(/disposed/i);
	});
});

function focalResponse(runId: number, seed: number): FocalPairResponse {
	return {
		protocolVersion: NUCLEUS_WORKER_PROTOCOL_VERSION,
		runId,
		type: 'FOCAL_PAIR_RESULT',
		result: {
			modelVersion: MODEL_VERSION,
			seed,
			baseline: simulateSingle({ seed, parameters: baseline }),
			intervention: simulateSingle({ seed, parameters: intervention })
		}
	};
}

class FakeWorker implements NucleusWorkerLike {
	readonly messages: NucleusWorkerRequest[] = [];
	terminationCount = 0;
	private readonly listeners = new Map<'message' | 'error' | 'messageerror', Set<EventListener>>([
		['message', new Set()],
		['error', new Set()],
		['messageerror', new Set()]
	]);

	postMessage(message: NucleusWorkerRequest): void {
		this.messages.push(message);
	}

	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void {
		this.listeners.get(type)?.add(listener);
	}

	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void {
		this.listeners.get(type)?.delete(listener);
	}

	terminate(): void {
		this.terminationCount += 1;
	}

	dispatch(response: NucleusWorkerResponse): void {
		const event = { data: response } as MessageEvent<NucleusWorkerResponse>;
		for (const listener of this.listeners.get('message') ?? []) listener(event);
	}

	dispatchError(): void {
		const event = { preventDefault() {} } as Event;
		for (const listener of this.listeners.get('error') ?? []) listener(event);
	}

	messageListener(): EventListener | undefined {
		return this.listeners.get('message')?.values().next().value;
	}

	listenerCount(): number {
		let count = 0;
		for (const listeners of this.listeners.values()) count += listeners.size;
		return count;
	}
}
