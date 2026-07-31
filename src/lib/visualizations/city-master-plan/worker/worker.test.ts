import { describe, expect, it } from 'vitest';
import { DEFAULT_CITY_CONFIG } from '../engine/constants';
import type { CityWorkerLike } from './client';
import { CityWorkerClient } from './client';
import { CityWorkerHandler } from './handler';
import {
	CITY_WORKER_PROTOCOL_VERSION,
	isCityWorkerResponse,
	type CityWorkerRequest,
	type CityWorkerResponse
} from './protocol';

class FakeWorker implements CityWorkerLike {
	readonly messages: CityWorkerRequest[] = [];
	private listeners = new Map<string, Set<EventListener>>();

	postMessage(message: CityWorkerRequest): void {
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

	terminate(): void {}

	dispatch(response: CityWorkerResponse): void {
		const event = { data: response } as MessageEvent;
		for (const listener of this.listeners.get('message') ?? []) listener(event);
	}
}

describe('city Worker protocol', () => {
	it('batches progress to bounded messages and preserves the complete result log', () => {
		const handler = new CityWorkerHandler();
		const progress: CityWorkerResponse[] = [];
		const response = handler.handle(
			{
				protocolVersion: CITY_WORKER_PROTOCOL_VERSION,
				requestId: 1,
				jobId: 1,
				type: 'GENERATE',
				config: {
					...DEFAULT_CITY_CONFIG,
					size: 'small',
					anchor: { ...DEFAULT_CITY_CONFIG.anchor, x: 8, y: 6 }
				}
			},
			(message) => progress.push(message)
		);
		expect(response.type).toBe('COMPLETE');
		expect(progress.length).toBeGreaterThan(1);
		expect(progress.every((message) => isCityWorkerResponse(message))).toBe(true);
		expect(
			progress.every(
				(message) =>
					message.type !== 'PROGRESS' || (message.events.length >= 1 && message.events.length <= 64)
			)
		).toBe(true);
		if (response.type === 'COMPLETE') {
			const flattened = progress.flatMap((message) =>
				message.type === 'PROGRESS' ? message.events : []
			);
			expect(flattened).toEqual(response.result.events);
		}
	});

	it('ignores stale job responses after a new generation or cancellation', () => {
		const worker = new FakeWorker();
		const client = new CityWorkerClient(worker);
		const received: CityWorkerResponse[] = [];
		client.subscribe((response) => received.push(response));
		const firstJob = client.generate({
			...DEFAULT_CITY_CONFIG,
			anchor: { ...DEFAULT_CITY_CONFIG.anchor }
		});
		const secondJob = client.generate({
			...DEFAULT_CITY_CONFIG,
			seed: 'new-job',
			anchor: { ...DEFAULT_CITY_CONFIG.anchor }
		});
		expect(secondJob).toBe(firstJob + 1);
		worker.dispatch({
			protocolVersion: 1,
			requestId: 1,
			jobId: firstJob,
			type: 'CANCELLED'
		});
		worker.dispatch({
			protocolVersion: 1,
			requestId: 2,
			jobId: secondJob,
			type: 'CANCELLED'
		});
		expect(received).toHaveLength(1);
		expect(received[0].jobId).toBe(secondJob);

		const cancelJob = client.cancel();
		worker.dispatch({
			protocolVersion: 1,
			requestId: 2,
			jobId: secondJob,
			type: 'CANCELLED'
		});
		worker.dispatch({
			protocolVersion: 1,
			requestId: 3,
			jobId: cancelJob,
			type: 'CANCELLED'
		});
		expect(received.at(-1)?.jobId).toBe(cancelJob);
		client.dispose();
	});
});
