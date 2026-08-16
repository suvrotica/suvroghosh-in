import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultRecipe } from '../shell/model/defaults';
import { GeometryBroker } from './geometry-broker';

class MockWorker {
	static instances: MockWorker[] = [];
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	postMessage = vi.fn();
	terminate = vi.fn();

	constructor() {
		MockWorker.instances.push(this);
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	MockWorker.instances = [];
});

describe('GeometryBroker', () => {
	it('discards a fatally failed worker and services the next request with a fresh worker', async () => {
		vi.stubGlobal('Worker', MockWorker);
		const statuses: string[] = [];
		const broker = new GeometryBroker((status) => statuses.push(status));
		const options = { resolution: { growthRings: 16, apertureSamples: 8 } };

		const first = broker.request(createDefaultRecipe(), options);
		expect(MockWorker.instances).toHaveLength(1);
		MockWorker.instances[0].onerror?.({ message: 'worker crashed' } as ErrorEvent);

		await expect(first).rejects.toThrow('worker crashed');
		expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce();
		expect(broker.hasWorker).toBe(false);

		const second = broker.request(createDefaultRecipe(), options);
		expect(MockWorker.instances).toHaveLength(2);
		MockWorker.instances[1].onmessage?.({
			data: {
				type: 'result',
				requestId: 2,
				result: {},
				durationMs: 4
			}
		} as MessageEvent);

		await expect(second).resolves.toMatchObject({ requestId: 2, durationMs: 4 });
		expect(statuses).toEqual(['working', 'error', 'working', 'idle']);
		broker.dispose();
	});
});
