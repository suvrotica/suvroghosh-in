import { describe, expect, it } from 'vitest';
import { measureDensityGrid, type DensityGridOptions } from '../advanced/density-grid';
import { solveFirstPassageEnsemble } from '../advanced/first-passage';
import { generateFractionalBrownianPaths } from '../advanced/fractional-brownian';
import { AdvancedWorkerClient, type AdvancedWorkerLike } from './client';
import { AdvancedWorkerHandler } from './handler';
import {
	ADVANCED_WORKER_PROTOCOL_VERSION,
	isAdvancedWorkerRequest,
	isAdvancedWorkerResponse,
	responseTransferables,
	type AdvancedWorkerRequest,
	type AdvancedWorkerResponse
} from './protocol';

const fractionalOptions = {
	seed: 'worker-main-agreement',
	hurst: 0.67,
	scale: 0.8,
	duration: 2,
	pointCount: 129,
	trajectoryCount: 2
} as const;

const firstPassageOptions = {
	seed: 'worker-first-passage',
	particleCount: 200,
	startDistance: 1,
	diffusion: 0.7,
	timestep: 0.02,
	maxTime: 0.5,
	historySampleEverySteps: 5,
	bridgeCorrection: true
} as const;

const densityOptions: DensityGridOptions = {
	x: Float64Array.of(-1, -0.5, 0, 0.25, 1),
	y: Float64Array.of(-1, 0.5, 0, -0.25, 1),
	gridWidth: 4,
	gridHeight: 4,
	minX: -1,
	maxX: 1,
	minY: -1,
	maxY: 1
};

describe('advanced Worker protocol and handler', () => {
	it('rejects malformed requests at runtime', () => {
		expect(isAdvancedWorkerRequest(null)).toBe(false);
		expect(
			isAdvancedWorkerRequest({
				protocolVersion: 99,
				requestId: 1,
				generation: 1,
				type: 'GENERATE_FRACTIONAL',
				options: fractionalOptions
			})
		).toBe(false);
		expect(
			isAdvancedWorkerRequest({
				protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
				requestId: 1,
				generation: 1,
				type: 'GENERATE_FRACTIONAL',
				options: { ...fractionalOptions, hurst: 1 }
			})
		).toBe(false);
	});

	it('agrees bit-for-bit with all three main-thread numerical implementations', async () => {
		const handler = new AdvancedWorkerHandler({
			yieldControl: () => Promise.resolve(),
			fractionalBatchSize: 1,
			firstPassageBatchSize: 17,
			densityBatchSize: 2
		});

		const fractionalResponses: AdvancedWorkerResponse[] = [];
		await handler.handle(request(1, 1, 'GENERATE_FRACTIONAL', fractionalOptions), (response) =>
			fractionalResponses.push(response)
		);
		const fractionalResponse = fractionalResponses.find(
			(response) => response.type === 'FRACTIONAL_RESULT'
		);
		expect(fractionalResponse?.type).toBe('FRACTIONAL_RESULT');
		if (fractionalResponse?.type !== 'FRACTIONAL_RESULT') throw new Error('Missing result.');
		expect(fractionalResponse.result).toEqual(generateFractionalBrownianPaths(fractionalOptions));
		expect(isAdvancedWorkerResponse(fractionalResponse)).toBe(true);

		const firstPassageResponses: AdvancedWorkerResponse[] = [];
		await handler.handle(request(2, 2, 'RUN_FIRST_PASSAGE', firstPassageOptions), (response) =>
			firstPassageResponses.push(response)
		);
		const firstPassageResponse = firstPassageResponses.find(
			(response) => response.type === 'FIRST_PASSAGE_RESULT'
		);
		expect(firstPassageResponse?.type).toBe('FIRST_PASSAGE_RESULT');
		if (firstPassageResponse?.type !== 'FIRST_PASSAGE_RESULT') throw new Error('Missing result.');
		expect(firstPassageResponse.result).toEqual(solveFirstPassageEnsemble(firstPassageOptions));
		expect(isAdvancedWorkerResponse(firstPassageResponse)).toBe(true);

		const densityResponses: AdvancedWorkerResponse[] = [];
		await handler.handle(request(3, 3, 'MEASURE_DENSITY', densityOptions), (response) =>
			densityResponses.push(response)
		);
		const densityResponse = densityResponses.find((response) => response.type === 'DENSITY_RESULT');
		expect(densityResponse?.type).toBe('DENSITY_RESULT');
		if (densityResponse?.type !== 'DENSITY_RESULT') throw new Error('Missing result.');
		expect(densityResponse.result).toEqual(measureDensityGrid(densityOptions));
		expect(isAdvancedWorkerResponse(densityResponse)).toBe(true);
	});

	it('returns every numerical result buffer as a unique transferable', () => {
		const result = generateFractionalBrownianPaths(fractionalOptions);
		const response: AdvancedWorkerResponse = {
			protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
			requestId: 1,
			generation: 1,
			type: 'FRACTIONAL_RESULT',
			result
		};
		const buffers = responseTransferables(response);
		expect(buffers).toHaveLength(3);
		expect(new Set(buffers).size).toBe(3);
		expect(buffers).toContain(result.times.buffer);
		expect(buffers).toContain(result.x.buffer);
		expect(buffers).toContain(result.y.buffer);
	});

	it('cooperatively cancels an in-flight batched calculation', async () => {
		const gate = deferred();
		const handler = new AdvancedWorkerHandler({
			yieldControl: () => gate.promise,
			firstPassageBatchSize: 1
		});
		const responses: AdvancedWorkerResponse[] = [];
		const running = handler.handle(
			request(1, 7, 'RUN_FIRST_PASSAGE', firstPassageOptions),
			(response) => responses.push(response)
		);
		await handler.handle(
			{
				protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
				requestId: 2,
				generation: 7,
				type: 'CANCEL'
			},
			(response) => responses.push(response)
		);
		gate.resolve();
		await running;

		expect(responses.some((response) => response.type === 'CANCELLED')).toBe(true);
		expect(responses.some((response) => response.type === 'FIRST_PASSAGE_RESULT')).toBe(false);
	});
});

describe('AdvancedWorkerClient', () => {
	it('filters stale generations and preserves only the newest result', () => {
		const worker = new FakeWorker();
		const client = new AdvancedWorkerClient('fractional', worker);
		const accepted: AdvancedWorkerResponse[] = [];
		client.subscribe((response) => accepted.push(response));

		client.generateFractional({ ...fractionalOptions, seed: 'old' });
		client.generateFractional({ ...fractionalOptions, seed: 'new' });
		const oldRequest = worker.messages[0];
		const newRequest = worker.messages[1];
		worker.dispatch({
			protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
			requestId: oldRequest.requestId,
			generation: oldRequest.generation,
			type: 'FRACTIONAL_RESULT',
			result: generateFractionalBrownianPaths({ ...fractionalOptions, seed: 'old' })
		});
		worker.dispatch({
			protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
			requestId: newRequest.requestId,
			generation: newRequest.generation,
			type: 'FRACTIONAL_RESULT',
			result: generateFractionalBrownianPaths({ ...fractionalOptions, seed: 'new' })
		});

		expect(accepted.filter((response) => response.type === 'FRACTIONAL_RESULT')).toHaveLength(1);
		expect(client.currentGeneration()).toBe(2);
	});

	it('transfers density snapshots without detaching simulation-owned arrays', () => {
		const worker = new FakeWorker();
		const client = new AdvancedWorkerClient('ensemble', worker);
		const sourceX = densityOptions.x.slice();
		const sourceY = densityOptions.y.slice();
		client.measureDensity({ ...densityOptions, x: sourceX, y: sourceY });

		const posted = worker.messages[0];
		expect(posted.type).toBe('MEASURE_DENSITY');
		if (posted.type !== 'MEASURE_DENSITY') throw new Error('Wrong request.');
		expect(posted.options.x).not.toBe(sourceX);
		expect(posted.options.y).not.toBe(sourceY);
		expect(worker.transfers[0]).toEqual([posted.options.x.buffer, posted.options.y.buffer]);
		expect(sourceX.byteLength).toBeGreaterThan(0);
		expect(sourceY.byteLength).toBeGreaterThan(0);
	});

	it('removes listeners, terminates exactly once, and rejects work after disposal', () => {
		const worker = new FakeWorker();
		const client = new AdvancedWorkerClient('ensemble', worker);
		client.dispose();
		client.dispose();
		expect(worker.terminationCount).toBe(1);
		expect(worker.listenerCount()).toBe(0);
		expect(() => client.runFirstPassage(firstPassageOptions)).toThrow(/disposed/);
	});

	it('cancels scheduled fallback work before it consumes the main thread', async () => {
		const gate = deferred();
		const client = new AdvancedWorkerClient('fractional', null, () => gate.promise);
		const accepted: AdvancedWorkerResponse[] = [];
		client.subscribe((response) => accepted.push(response));
		client.generateFractional(fractionalOptions);
		client.cancel();
		gate.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(accepted.some((response) => response.type === 'CANCELLED')).toBe(true);
		expect(accepted.some((response) => response.type === 'FRACTIONAL_RESULT')).toBe(false);
		client.dispose();
	});
});

function request<
	Type extends 'GENERATE_FRACTIONAL' | 'RUN_FIRST_PASSAGE' | 'MEASURE_DENSITY',
	Options
>(requestId: number, generation: number, type: Type, options: Options): AdvancedWorkerRequest {
	return {
		protocolVersion: ADVANCED_WORKER_PROTOCOL_VERSION,
		requestId,
		generation,
		type,
		options
	} as AdvancedWorkerRequest;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((fulfil) => {
		resolve = fulfil;
	});
	return { promise, resolve };
}

class FakeWorker implements AdvancedWorkerLike {
	readonly messages: AdvancedWorkerRequest[] = [];
	readonly transfers: Transferable[][] = [];
	terminationCount = 0;
	private readonly listeners = new Map<'message' | 'error' | 'messageerror', Set<EventListener>>([
		['message', new Set()],
		['error', new Set()],
		['messageerror', new Set()]
	]);

	postMessage(message: AdvancedWorkerRequest, transfer: Transferable[] = []): void {
		this.messages.push(message);
		this.transfers.push(transfer);
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

	dispatch(response: AdvancedWorkerResponse): void {
		const event = { data: response } as MessageEvent<AdvancedWorkerResponse>;
		for (const listener of this.listeners.get('message') ?? []) listener(event);
	}

	listenerCount(): number {
		let count = 0;
		for (const listeners of this.listeners.values()) count += listeners.size;
		return count;
	}
}
