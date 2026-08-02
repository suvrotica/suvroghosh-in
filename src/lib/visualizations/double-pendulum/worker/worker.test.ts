import { describe, expect, it } from 'vitest';
import type { AtlasSettings } from '../atlas';
import { AtlasWorkerClient, type AtlasWorkerLike } from './client';
import { AtlasWorkerHandler } from './handler';
import {
	ATLAS_WORKER_PROTOCOL_VERSION,
	atlasResponseTransferables,
	isAtlasWorkerRequest,
	isAtlasWorkerResponse,
	type AtlasWorkerRequest,
	type AtlasWorkerRequestBody,
	type AtlasWorkerResponse
} from './protocol';

function settings(overrides: Partial<AtlasSettings> = {}): AtlasSettings {
	const base: AtlasSettings = {
		bounds: {
			theta1Min: -Math.PI,
			theta1Max: Math.PI,
			theta2Min: -Math.PI,
			theta2Max: Math.PI
		},
		width: 4,
		height: 3,
		parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
		omega1: 0,
		omega2: 0,
		perturbation: { dimension: 'theta1', magnitude: 1e-3 },
		divergenceThreshold: 0.0011,
		maxTime: 0.5,
		dt: 0.005,
		rowsPerChunk: 1
	};
	return {
		...base,
		...overrides,
		bounds: { ...base.bounds, ...overrides.bounds },
		parameters: { ...base.parameters, ...overrides.parameters },
		perturbation: { ...base.perturbation, ...overrides.perturbation }
	};
}

function request(body: AtlasWorkerRequestBody, requestId = 1, generation = 1): AtlasWorkerRequest {
	return {
		protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
		requestId,
		generation,
		...body
	} as AtlasWorkerRequest;
}

function finishAtlas(atlasSettings: AtlasSettings): AtlasWorkerResponse[] {
	const handler = new AtlasWorkerHandler();
	const responses = handler.handle(request({ type: 'START', settings: atlasSettings }));
	while (handler.isRunning) responses.push(...handler.processNextChunk());
	return responses;
}

describe('AtlasWorkerHandler', () => {
	it('publishes deterministic bounded row chunks and a terminal completion', () => {
		const atlasSettings = settings();
		const first = finishAtlas(atlasSettings);
		const replay = finishAtlas(atlasSettings);
		const firstChunks = first.filter((response) => response.type === 'CHUNK');
		const replayChunks = replay.filter((response) => response.type === 'CHUNK');

		expect(first[0]).toMatchObject({ type: 'READY', totalRows: 3, totalCells: 12 });
		expect(firstChunks).toHaveLength(3);
		expect(firstChunks.every((response) => response.chunk.rowCount === 1)).toBe(true);
		expect(firstChunks.at(-1)?.chunk.progress).toBe(1);
		expect(first.at(-1)).toMatchObject({ type: 'COMPLETE', totalRows: 3, totalCells: 12 });
		expect(firstChunks.flatMap((response) => [...response.chunk.horizons])).toEqual(
			replayChunks.flatMap((response) => [...response.chunk.horizons])
		);
		expect(firstChunks.some((response) => response.chunk.capped.some((value) => value === 0))).toBe(
			true
		);
		expect(firstChunks.some((response) => response.chunk.capped.some((value) => value === 1))).toBe(
			true
		);
		expect(first.every(isAtlasWorkerResponse)).toBe(true);
	});

	it('cancels between chunks and rejects stale generations', () => {
		const handler = new AtlasWorkerHandler();
		handler.handle(request({ type: 'START', settings: settings() }, 1, 2));
		expect(handler.processNextChunk()[0]).toMatchObject({
			type: 'CHUNK',
			generation: 2,
			chunk: { completedRows: 1 }
		});

		expect(handler.handle(request({ type: 'CANCEL' }, 2, 1))[0]).toMatchObject({
			type: 'STALE',
			activeGeneration: 2
		});
		expect(handler.isRunning).toBe(true);
		expect(handler.handle(request({ type: 'CANCEL' }, 3, 2))[0]).toMatchObject({
			type: 'CANCELLED',
			completedRows: 1,
			totalRows: 3
		});
		expect(handler.isRunning).toBe(false);
		expect(handler.processNextChunk()).toEqual([]);

		expect(handler.handle(request({ type: 'START', settings: settings() }, 4, 1))[0]).toMatchObject(
			{ type: 'STALE', activeGeneration: 2 }
		);
	});

	it('turns a malformed settings object into a safe error without starting work', () => {
		const malformed = request({ type: 'START', settings: settings() });
		if (malformed.type !== 'START') throw new Error('Expected a START request.');
		(malformed.settings as { width: number }).width = 100_000;
		expect(isAtlasWorkerRequest(malformed)).toBe(false);

		const response = new AtlasWorkerHandler().handle(malformed)[0];
		expect(response).toMatchObject({ type: 'ERROR', generation: 1 });
		if (response.type === 'ERROR') expect(response.message).toMatch(/width/i);
	});
});

class FakeWorker implements AtlasWorkerLike {
	readonly messages: AtlasWorkerRequest[] = [];
	terminated = false;
	terminationCount = 0;
	private readonly listeners = new Map<string, Set<EventListener>>();

	postMessage(message: AtlasWorkerRequest): void {
		this.messages.push(message);
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
		this.terminationCount += 1;
	}

	dispatch(response: unknown): void {
		const event = { data: response } as MessageEvent<unknown>;
		for (const listener of this.listeners.get('message') ?? []) listener(event);
	}

	dispatchError(message: string): void {
		const event = {
			message,
			preventDefault: () => undefined
		} as unknown as ErrorEvent;
		for (const listener of this.listeners.get('error') ?? []) listener(event);
	}
}

describe('AtlasWorkerClient', () => {
	it('snapshots inputs and filters stale generations and pre-cancel chunks', () => {
		const worker = new FakeWorker();
		const client = new AtlasWorkerClient(worker);
		const received: AtlasWorkerResponse[] = [];
		client.subscribe((response) => received.push(response));

		const source = settings();
		expect(client.start(source)).toBe(1);
		source.parameters.g = 1.62;
		const firstPosted = worker.messages[0];
		expect(firstPosted.type).toBe('START');
		if (firstPosted.type === 'START') expect(firstPosted.settings.parameters.g).toBe(9.81);

		expect(client.start(settings({ omega1: 0.1 }))).toBe(2);
		worker.dispatch(readyResponse(1, 1));
		worker.dispatch(readyResponse(2, 2));
		expect(received).toHaveLength(1);
		expect(received[0]).toMatchObject({ type: 'READY', generation: 2 });

		const cancelRequestId = client.cancel();
		worker.dispatch(completeResponse(2, 2));
		worker.dispatch({
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			requestId: cancelRequestId,
			generation: 2,
			type: 'CANCELLED',
			completedRows: 1,
			totalRows: 3
		});
		expect(received.map((response) => response.type)).toEqual(['READY', 'CANCELLED']);
		client.dispose();
	});

	it('surfaces runtime failure and terminates exactly once on disposal', () => {
		const worker = new FakeWorker();
		const client = new AtlasWorkerClient(worker);
		const received: AtlasWorkerResponse[] = [];
		client.subscribe((response) => received.push(response));
		client.start(settings());
		worker.dispatchError('Module graph failed to load');
		expect(received.at(-1)).toMatchObject({
			type: 'ERROR',
			message: 'Module graph failed to load'
		});

		client.dispose();
		client.dispose();
		expect(worker.messages.at(-1)?.type).toBe('DISPOSE');
		expect(worker.terminated).toBe(true);
		expect(worker.terminationCount).toBe(1);
		expect(() => client.start(settings())).toThrow(/disposed/i);
	});
});

describe('atlas Worker protocol guards', () => {
	it('rejects malformed typed chunks and returns only their two buffers as transferables', () => {
		const malformed = {
			protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
			requestId: 1,
			generation: 1,
			type: 'CHUNK',
			chunk: {
				rowStart: 0,
				rowCount: 1,
				width: 4,
				totalRows: 3,
				completedRows: 1,
				progress: 1 / 3,
				horizons: new Float32Array(3),
				capped: new Uint8Array(4)
			}
		};
		expect(isAtlasWorkerResponse(malformed)).toBe(false);

		const chunk = finishAtlas(settings()).find((response) => response.type === 'CHUNK');
		expect(chunk?.type).toBe('CHUNK');
		if (chunk?.type !== 'CHUNK') return;
		expect(atlasResponseTransferables(chunk)).toEqual([
			chunk.chunk.horizons.buffer,
			chunk.chunk.capped.buffer
		]);
	});
});

function readyResponse(requestId: number, generation: number): AtlasWorkerResponse {
	return {
		protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
		requestId,
		generation,
		type: 'READY',
		cacheKey: `job-${generation}`,
		totalRows: 3,
		totalCells: 12
	};
}

function completeResponse(requestId: number, generation: number): AtlasWorkerResponse {
	return {
		protocolVersion: ATLAS_WORKER_PROTOCOL_VERSION,
		requestId,
		generation,
		type: 'COMPLETE',
		cacheKey: `job-${generation}`,
		totalRows: 3,
		totalCells: 12
	};
}
