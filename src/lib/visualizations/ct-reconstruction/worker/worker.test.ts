import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ACQUISITION_SETTINGS,
	DEFAULT_RECONSTRUCTION_SETTINGS,
	createPresetPhantom
} from '../index';
import { CTWorkerClient, type WorkerLike } from './client';
import { CTWorkerHandler } from './handler';
import {
	CT_WORKER_PROTOCOL_VERSION,
	isCTWorkerRequest,
	isCTWorkerResponse,
	responseTransferables,
	type CTWorkerRequest,
	type CTWorkerRequestBody,
	type CTWorkerResponse,
	type InitializeScanPayload
} from './protocol';

function payload(): InitializeScanPayload {
	return {
		phantom: createPresetPhantom('simple-circles', 24),
		acquisition: {
			...DEFAULT_ACQUISITION_SETTINGS,
			projectionCount: 12,
			detectorCount: 32,
			noiseEnabled: false,
			metalArtifacts: false,
			rayStepScale: 0.7
		},
		reconstruction: {
			...DEFAULT_RECONSTRUCTION_SETTINGS,
			imageSize: 24
		}
	};
}

function request(jobId: number, requestId: number, body: CTWorkerRequestBody): CTWorkerRequest {
	return {
		protocolVersion: CT_WORKER_PROTOCOL_VERSION,
		jobId,
		requestId,
		...body
	} as CTWorkerRequest;
}

function allFinite(values: Float32Array): boolean {
	for (const value of values) if (!Number.isFinite(value)) return false;
	return true;
}

describe('CT Worker handler', () => {
	it('initializes typed geometry and advances a truthful projection batch', () => {
		const handler = new CTWorkerHandler();
		const ready = handler.handle(request(1, 1, { type: 'INITIALIZE', payload: payload() }));
		expect(ready.type).toBe('READY');
		if (ready.type !== 'READY') return;
		expect(ready.projectionCount).toBe(12);
		expect(ready.detectorCount).toBe(32);
		expect(ready.imageSize).toBe(24);
		expect(ready.actualProjectionCount).toBe(12);

		const batch = handler.handle(
			request(1, 2, { type: 'PROCESS_BATCH', batchSize: 2, includePreview: true })
		);
		expect(batch.type).toBe('BATCH');
		if (batch.type !== 'BATCH') return;
		expect(batch.rowIndices).toEqual(Uint16Array.from([0, 1]));
		expect(batch.rowValues).toHaveLength(64);
		expect(batch.currentProjection).toHaveLength(32);
		expect(batch.acquiredProjectionCount).toBe(2);
		expect(batch.progress).toBeCloseTo(2 / 12, 8);
		expect(batch.complete).toBe(false);
		expect(batch.backprojection).toBeInstanceOf(Float32Array);
		expect(batch.filteredBackprojection).toBeInstanceOf(Float32Array);
		if (!batch.backprojection || !batch.filteredBackprojection) return;
		expect(allFinite(batch.backprojection)).toBe(true);
		expect(allFinite(batch.filteredBackprojection)).toBe(true);
	});

	it('omits intermediate previews unless requested but always previews completion', () => {
		const handler = new CTWorkerHandler();
		handler.handle(request(5, 1, { type: 'INITIALIZE', payload: payload() }));
		const intermediate = handler.handle(request(5, 2, { type: 'PROCESS_BATCH', batchSize: 2 }));
		expect(intermediate.type).toBe('BATCH');
		if (intermediate.type !== 'BATCH') return;
		expect(intermediate.complete).toBe(false);
		expect(intermediate.backprojection).toBeUndefined();
		expect(intermediate.filteredBackprojection).toBeUndefined();
		expect(isCTWorkerResponse(intermediate)).toBe(true);
		expect(responseTransferables(intermediate)).toHaveLength(3);

		const completing = handler.handle(request(5, 3, { type: 'PROCESS_BATCH', batchSize: 12 }));
		expect(completing.type).toBe('BATCH');
		if (completing.type !== 'BATCH') return;
		expect(completing.complete).toBe(true);
		expect(completing.backprojection).toBeInstanceOf(Float32Array);
		expect(completing.filteredBackprojection).toBeInstanceOf(Float32Array);
		expect(completing.metrics).toBeDefined();
		expect(isCTWorkerResponse(completing)).toBe(true);
		expect(responseTransferables(completing)).toHaveLength(5);
	});

	it('rejects stale compute requests without advancing the active job', () => {
		const handler = new CTWorkerHandler();
		handler.handle(request(6, 1, { type: 'INITIALIZE', payload: payload() }));
		handler.handle(request(7, 2, { type: 'INITIALIZE', payload: payload() }));

		const staleBatch = handler.handle(request(6, 3, { type: 'PROCESS_BATCH', batchSize: 1 }));
		expect(staleBatch.type).toBe('ERROR');
		if (staleBatch.type === 'ERROR') expect(staleBatch.message).toMatch(/stale/i);

		const staleReconstruction = handler.handle(
			request(6, 4, {
				type: 'RECONSTRUCT',
				reconstruction: { filter: 'hann', cutoff: 0.5, imageSize: 24 }
			})
		);
		expect(staleReconstruction.type).toBe('ERROR');

		const activeBatch = handler.handle(request(7, 5, { type: 'PROCESS_BATCH', batchSize: 1 }));
		expect(activeBatch.type).toBe('BATCH');
		if (activeBatch.type !== 'BATCH') return;
		expect(activeBatch.acquiredProjectionCount).toBe(1);
		expect(activeBatch.rowIndices).toEqual(Uint16Array.from([0]));
	});

	it('finishes a scan with separate BP/FBP metrics inside the field of view', () => {
		const handler = new CTWorkerHandler();
		handler.handle(request(2, 1, { type: 'INITIALIZE', payload: payload() }));
		const batch = handler.handle(request(2, 2, { type: 'PROCESS_BATCH', batchSize: 12 }));
		expect(batch.type).toBe('BATCH');
		if (batch.type !== 'BATCH') return;
		expect(batch.complete).toBe(true);
		expect(batch.progress).toBe(1);
		expect(batch.metrics).toBeDefined();
		expect(batch.metrics?.filteredBackprojection.scaleInvariantRmse).toBeLessThan(
			batch.metrics?.backprojection.scaleInvariantRmse ?? 0
		);
	});

	it('reuses acquired rows when only the reconstruction filter changes', () => {
		const handler = new CTWorkerHandler();
		handler.handle(request(3, 1, { type: 'INITIALIZE', payload: payload() }));
		const completed = handler.handle(request(3, 2, { type: 'PROCESS_BATCH', batchSize: 12 }));
		expect(completed.type).toBe('BATCH');
		if (completed.type !== 'BATCH') return;
		const reconstructed = handler.handle(
			request(3, 3, {
				type: 'RECONSTRUCT',
				reconstruction: { filter: 'hann', cutoff: 0.65, imageSize: 24 }
			})
		);
		expect(reconstructed.type).toBe('RECONSTRUCTED');
		if (reconstructed.type !== 'RECONSTRUCTED') return;
		expect(reconstructed.acquiredProjectionCount).toBe(12);
		expect(reconstructed.progress).toBe(1);
		expect(reconstructed.backprojection).toEqual(completed.backprojection);
		expect(reconstructed.filteredBackprojection).not.toEqual(completed.filteredBackprojection);
		expect(reconstructed.metrics).toBeDefined();
	});

	it('keeps omitted angles absent while normalizing actual progress', () => {
		const missingPayload = payload();
		missingPayload.acquisition.missingAngleWidth = 60;
		missingPayload.acquisition.missingAngleCenter = 90;
		const handler = new CTWorkerHandler();
		const ready = handler.handle(request(4, 1, { type: 'INITIALIZE', payload: missingPayload }));
		expect(ready.type).toBe('READY');
		if (ready.type !== 'READY') return;
		expect(ready.actualProjectionCount).toBeLessThan(ready.projectionCount);
		const batch = handler.handle(
			request(4, 2, { type: 'PROCESS_BATCH', batchSize: ready.actualProjectionCount })
		);
		expect(batch.type).toBe('BATCH');
		if (batch.type !== 'BATCH') return;
		expect(batch.complete).toBe(true);
		expect(batch.rowIndices).toHaveLength(ready.actualProjectionCount);
		expect(batch.progress).toBe(1);
	});
});

class FakeWorker implements WorkerLike {
	readonly posted: CTWorkerRequest[] = [];
	terminated = 0;
	private listeners = new Map<'message' | 'error' | 'messageerror', EventListener>();

	postMessage(message: CTWorkerRequest): void {
		this.posted.push(message);
	}

	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void {
		this.listeners.set(type, listener);
	}

	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void {
		if (this.listeners.get(type) === listener) this.listeners.delete(type);
	}

	terminate(): void {
		this.terminated += 1;
	}

	emit(response: CTWorkerResponse): void {
		this.listeners.get('message')?.({ data: response } as MessageEvent<unknown>);
	}

	emitError(message: string): void {
		this.listeners.get('error')?.({
			message,
			error: new Error(message),
			preventDefault() {}
		} as unknown as Event);
	}

	emitMessageError(): void {
		this.listeners.get('messageerror')?.({
			preventDefault() {}
		} as unknown as Event);
	}

	listenerCount(): number {
		return this.listeners.size;
	}
}

describe('CT Worker client generations', () => {
	it('ignores obsolete job results after a rapid restart', () => {
		const worker = new FakeWorker();
		const client = new CTWorkerClient(worker);
		const received: CTWorkerResponse[] = [];
		client.subscribe((response) => received.push(response));
		const firstJob = client.initialize(payload());
		const secondJob = client.initialize(payload());
		expect(secondJob).toBe(firstJob + 1);

		const readyBase = {
			protocolVersion: CT_WORKER_PROTOCOL_VERSION,
			requestId: worker.posted[0].requestId,
			projectionCount: 12,
			detectorCount: 32,
			imageSize: 24,
			actualProjectionCount: 12,
			angles: new Float64Array(12),
			acquiredMask: new Uint8Array(12).fill(1)
		} as const;
		worker.emit({ ...readyBase, type: 'READY', jobId: firstJob });
		expect(received).toHaveLength(0);
		worker.emit({
			...readyBase,
			type: 'READY',
			requestId: worker.posted[1].requestId,
			jobId: secondJob
		});
		expect(received).toHaveLength(1);
	});

	it('increments the generation on cancellation and disposes exactly once', () => {
		const worker = new FakeWorker();
		const client = new CTWorkerClient(worker);
		const initialized = client.initialize(payload());
		expect(client.cancel()).toBe(initialized + 1);
		expect(worker.posted.at(-1)?.type).toBe('CANCEL');
		client.dispose();
		client.dispose();
		expect(worker.terminated).toBe(1);
		expect(worker.listenerCount()).toBe(0);
		expect(() => client.processBatch()).toThrow(/disposed/);
	});

	it('forwards explicit preview requests through the client protocol', () => {
		const worker = new FakeWorker();
		const client = new CTWorkerClient(worker);
		client.initialize(payload());
		client.processBatch(4, true);
		expect(worker.posted.at(-1)).toMatchObject({
			type: 'PROCESS_BATCH',
			batchSize: 4,
			includePreview: true
		});
		client.dispose();
	});

	it('surfaces Worker errors and message deserialization failures to listeners', () => {
		const worker = new FakeWorker();
		const client = new CTWorkerClient(worker);
		const received: CTWorkerResponse[] = [];
		client.subscribe((response) => received.push(response));
		const jobId = client.initialize(payload());

		worker.emitError('Projection Worker crashed.');
		worker.emitMessageError();

		expect(received).toHaveLength(2);
		expect(received[0]).toMatchObject({
			type: 'ERROR',
			jobId,
			message: 'Projection Worker crashed.'
		});
		expect(received[1]).toMatchObject({
			type: 'ERROR',
			jobId,
			message: 'The CT reconstruction Worker could not deserialize a message.'
		});
		client.dispose();
	});
});

describe('CT Worker protocol guards', () => {
	it('rejects malformed requests and responses', () => {
		expect(
			isCTWorkerRequest({
				protocolVersion: CT_WORKER_PROTOCOL_VERSION,
				requestId: 1,
				jobId: 1,
				type: 'PROCESS_BATCH',
				batchSize: 0
			})
		).toBe(false);
		expect(
			isCTWorkerRequest({
				protocolVersion: CT_WORKER_PROTOCOL_VERSION,
				requestId: 1,
				jobId: 1,
				type: 'PROCESS_BATCH',
				batchSize: 1,
				includePreview: 'yes'
			})
		).toBe(false);
		expect(
			isCTWorkerResponse({
				protocolVersion: CT_WORKER_PROTOCOL_VERSION,
				requestId: 1,
				jobId: 1,
				type: 'BATCH',
				rowIndices: [],
				rowValues: []
			})
		).toBe(false);
		expect(
			isCTWorkerResponse({
				protocolVersion: CT_WORKER_PROTOCOL_VERSION,
				requestId: 1,
				jobId: 1,
				type: 'BATCH',
				rowIndices: new Uint16Array(0),
				rowValues: new Float32Array(0),
				currentProjection: new Float32Array(0),
				currentAngleIndex: -1,
				currentAngle: 0,
				revealedThroughAngleIndex: -1,
				acquiredProjectionCount: 0,
				actualProjectionCount: 0,
				progress: 1,
				complete: true
			})
		).toBe(false);
		expect(
			isCTWorkerResponse({
				protocolVersion: CT_WORKER_PROTOCOL_VERSION,
				requestId: 1,
				jobId: 1,
				type: 'BATCH',
				rowIndices: new Uint16Array(0),
				rowValues: new Float32Array(0),
				currentProjection: new Float32Array(0),
				currentAngleIndex: -1,
				currentAngle: 0,
				revealedThroughAngleIndex: -1,
				acquiredProjectionCount: 0,
				actualProjectionCount: 1,
				progress: 0,
				backprojection: 'not a preview',
				complete: false
			})
		).toBe(false);
	});
});
