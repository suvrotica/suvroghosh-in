import { describe, expect, it } from 'vitest';
import { AnalysisWorkerClient, type AnalysisWorkerLike } from './analysis-worker-client';
import type { AnalysisWorkerRequest } from './analysis-worker-protocol';

const particlePayload = {
	landscape: { id: 'quadratic' as const },
	optimizer: { id: 'gd' as const, learningRate: 0.1 },
	starts: [
		[-1, 0.5],
		[0.75, -0.25]
	] as const,
	gradientMode: { kind: 'full' as const },
	seed: 'worker-failure-fallback',
	maximumIterations: 6,
	gradientTolerance: 1e-9,
	stepTolerance: 1e-13,
	stallPatience: 10,
	classificationTolerance: 0.2
};

class RuntimeFailingWorker extends EventTarget {
	terminated = false;

	postMessage(message: AnalysisWorkerRequest): void {
		if (message.type === 'cancel') return;
		queueMicrotask(() => this.dispatchEvent(new Event('error')));
	}

	terminate(): void {
		this.terminated = true;
	}
}

describe('analysis worker failure fallback', () => {
	it('uses asynchronous main-thread chunks when worker construction is rejected', async () => {
		const client = new AnalysisWorkerClient(() => {
			throw new DOMException('Blocked by policy', 'SecurityError');
		});
		const result = await client.requestParticleFlow(particlePayload);
		expect(result).toHaveLength(2);
		expect(result.every((entry) => entry.path.length > 1)).toBe(true);
		client.terminate();
	});

	it('replays pending and future work through fallback after a worker runtime error', async () => {
		const worker = new RuntimeFailingWorker();
		const client = new AnalysisWorkerClient(() => worker as unknown as AnalysisWorkerLike);
		const first = await client.requestParticleFlow(particlePayload);
		const second = await client.requestParticleFlow(particlePayload);
		expect(worker.terminated).toBe(true);
		expect(second).toEqual(first);
		client.terminate();
	});
});
