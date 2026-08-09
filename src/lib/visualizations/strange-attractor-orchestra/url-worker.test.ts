import { describe, expect, it } from 'vitest';
import { generateCoreExperience } from './core';
import type { OrchestraSnapshot } from './types';
import {
	DEFAULT_ORCHESTRA_SNAPSHOT,
	MAX_ORCHESTRA_QUERY_LENGTH,
	parseOrchestraUrlState,
	serializeOrchestraUrlState
} from './url-state';
import { ORCHESTRA_WORKER_PROTOCOL_VERSION } from './versions';
import { createOrchestraWorkerClient, type OrchestraWorkerLike } from './worker/client';
import { OrchestraWorkerHandler } from './worker/handler';
import {
	isOrchestraWorkerRequest,
	isOrchestraWorkerResponse,
	orchestraResponseTransferables,
	type OrchestraWorkerRequest,
	type OrchestraWorkerResponse
} from './worker/protocol';

const lorenzSnapshot: OrchestraSnapshot = {
	...DEFAULT_ORCHESTRA_SNAPSHOT,
	masterSeed: 'worker-regression',
	attractorId: 'lorenz-63',
	stableStepSize: 0.005
};

class SilentWorker implements OrchestraWorkerLike {
	readonly messages: OrchestraWorkerRequest[] = [];
	terminated = false;
	private readonly listeners = new Map<string, Set<EventListener>>();

	postMessage(message: OrchestraWorkerRequest): void {
		this.messages.push(message);
	}

	addEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void {
		const listeners = this.listeners.get(type) ?? new Set<EventListener>();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: 'message' | 'error' | 'messageerror', listener: EventListener): void {
		this.listeners.get(type)?.delete(listener);
	}

	terminate(): void {
		this.terminated = true;
		this.listeners.clear();
	}
}

describe('strict namespaced orchestra URL state', () => {
	it('round-trips every reconstructive field and preserves unrelated query state', () => {
		const snapshot: OrchestraSnapshot = {
			...DEFAULT_ORCHESTRA_SNAPSHOT,
			masterSeed: 'henon-42',
			attractorId: 'henon',
			noiseFamily: 'cellular',
			noiseLens: 'dye',
			noiseInfluence: 0.375,
			soundWorld: 'swarm',
			timingMode: 'raw',
			simulationRate: 1.5,
			stableStepSize: 1
		};
		const serialized = serializeOrchestraUrlState(snapshot, new URLSearchParams('ref=essay'));
		expect(serialized.get('ref')).toBe('essay');
		expect([...serialized.keys()].filter((key) => key.startsWith('sa_')).sort()).toEqual([
			'sa_attractor',
			'sa_influence',
			'sa_initial',
			'sa_integrator',
			'sa_lens',
			'sa_mapping',
			'sa_noise',
			'sa_preset',
			'sa_rate',
			'sa_seed',
			'sa_sound',
			'sa_step',
			'sa_timing',
			'sa_v'
		]);
		const parsed = parseOrchestraUrlState(serialized);
		expect(parsed.issues).toEqual([]);
		expect(parsed.state).toEqual(snapshot);
	});

	it('never serializes ephemeral volume, mute, gesture, quality, frame, or latency state', () => {
		const serialized = serializeOrchestraUrlState(DEFAULT_ORCHESTRA_SNAPSHOT);
		const text = serialized.toString();
		for (const forbidden of [
			'volume',
			'mute',
			'gesture',
			'camera',
			'frame',
			'quality',
			'bluetooth'
		]) {
			expect(text.toLowerCase()).not.toContain(forbidden);
		}
	});

	it('rejects hostile values, unknown enums, unvalidated step sizes, and old versions safely', () => {
		const invalid = parseOrchestraUrlState(
			'?sa_v=1&sa_seed=%3Cscript%3E&sa_attractor=nope&sa_noise=random&sa_lens=explode&sa_influence=Infinity&sa_sound=metal&sa_timing=chaos&sa_rate=99&sa_step=.01&sa_preset=live&sa_initial=random'
		);
		expect(invalid.state).toEqual(DEFAULT_ORCHESTRA_SNAPSHOT);
		expect(invalid.issues.length).toBeGreaterThanOrEqual(10);
		const old = parseOrchestraUrlState('?sa_v=900&sa_seed=ignored');
		expect(old.unsupportedVersion).toBe(true);
		expect(old.state).toEqual(DEFAULT_ORCHESTRA_SNAPSHOT);
		const oldModel = parseOrchestraUrlState(
			'?sa_v=1&sa_integrator=future&sa_mapping=future&sa_seed=ignored'
		);
		expect(oldModel.state).toEqual(DEFAULT_ORCHESTRA_SNAPSHOT);
		expect(oldModel.issues).toHaveLength(2);
	});

	it('rejects oversized query strings without partially applying them', () => {
		const result = parseOrchestraUrlState(`?${'x'.repeat(MAX_ORCHESTRA_QUERY_LENGTH + 1)}`);
		expect(result.state).toEqual(DEFAULT_ORCHESTRA_SNAPSHOT);
		expect(result.issues).toHaveLength(1);
	});

	it('restores the same score from a copied deterministic URL', () => {
		const restored = parseOrchestraUrlState(serializeOrchestraUrlState(lorenzSnapshot)).state;
		const first = generateCoreExperience(lorenzSnapshot, { pointCount: 512 });
		const second = generateCoreExperience(restored, { pointCount: 512 });
		expect(second.scoreHash).toBe(first.scoreHash);
		expect(second.trajectory.rawPositions).toEqual(first.trajectory.rawPositions);
	});
});

describe('typed Worker protocol, transferables, and fallback', () => {
	it('validates requests and refuses unsafe payloads', () => {
		const request: OrchestraWorkerRequest = {
			protocolVersion: ORCHESTRA_WORKER_PROTOCOL_VERSION,
			requestId: 1,
			generation: 1,
			type: 'GENERATE',
			snapshot: lorenzSnapshot,
			pointCount: 128
		};
		expect(isOrchestraWorkerRequest(request)).toBe(true);
		expect(isOrchestraWorkerRequest({ ...request, pointCount: 2 })).toBe(false);
		expect(isOrchestraWorkerRequest({ ...request, diagnosticPointCount: 127 })).toBe(false);
		expect(isOrchestraWorkerRequest({ ...request, lyapunovDuration: Number.NaN })).toBe(false);
		expect(isOrchestraWorkerRequest({ ...request, includeDiagnostics: 'yes' })).toBe(false);
		expect(
			isOrchestraWorkerRequest({
				...request,
				snapshot: { ...lorenzSnapshot, stableStepSize: 0.5 }
			})
		).toBe(false);
		expect(isOrchestraWorkerRequest({ ...request, protocolVersion: 99 })).toBe(false);
	});

	it('emits progressive phases and a transferable typed-array result', async () => {
		const handler = new OrchestraWorkerHandler();
		const responses: OrchestraWorkerResponse[] = [];
		await handler.handle(
			{
				protocolVersion: ORCHESTRA_WORKER_PROTOCOL_VERSION,
				requestId: 1,
				generation: 1,
				type: 'GENERATE',
				snapshot: lorenzSnapshot,
				pointCount: 128,
				includeDiagnostics: true,
				diagnosticPointCount: 128,
				lyapunovDuration: 2
			},
			(response) => responses.push(response)
		);
		expect(responses.every(isOrchestraWorkerResponse)).toBe(true);
		const phases = responses
			.filter(
				(response): response is Extract<OrchestraWorkerResponse, { type: 'PROGRESS' }> =>
					response.type === 'PROGRESS'
			)
			.map(({ progress }) => progress.phase);
		for (const phase of [
			'burn-in',
			'calibration',
			'trajectory',
			'weather',
			'features',
			'diagnostics'
		]) {
			expect(phases).toContain(phase);
		}
		const result = responses.find(
			(response): response is Extract<OrchestraWorkerResponse, { type: 'RESULT' }> =>
				response.type === 'RESULT'
		);
		expect(result).toBeDefined();
		expect(result?.result.diagnostics?.stepComparison.status).toBe('available');
		expect(result!.result.score.length).toBeGreaterThan(0);
		expect(
			isOrchestraWorkerResponse({
				...result!,
				result: {
					...result!.result,
					score: [
						{ ...result!.result.score[0], stretching: 1.01 },
						...result!.result.score.slice(1)
					]
				}
			})
		).toBe(false);
		expect(
			isOrchestraWorkerResponse({
				...result!,
				result: {
					...result!.result,
					diagnostics: {
						...result!.result.diagnostics!,
						finiteTimeLyapunov: {
							...result!.result.diagnostics!.finiteTimeLyapunov,
							value: Number.POSITIVE_INFINITY
						}
					}
				}
			})
		).toBe(false);
		const transferables = orchestraResponseTransferables(result!);
		expect(transferables.length).toBeGreaterThan(15);
		expect(new Set(transferables).size).toBe(transferables.length);
		expect(transferables.every((buffer) => buffer instanceof ArrayBuffer)).toBe(true);
	});

	it('runs through the cooperative in-process fallback in Node', async () => {
		const client = createOrchestraWorkerClient({ forceFallback: true });
		const progress: string[] = [];
		const unsubscribe = client.subscribeProgress(({ phase }) => progress.push(phase));
		try {
			const result = await client.generate(lorenzSnapshot, { pointCount: 192 });
			expect(result.trajectory.pointCount).toBe(192);
			expect(result.scoreHash).toMatch(/^[0-9a-f]{8}$/u);
			expect(progress).toContain('trajectory');
			expect(progress).toContain('features');
		} finally {
			unsubscribe();
			client.dispose();
		}
	}, 30_000);

	it('hard-terminates superseded dedicated work and lazily replaces its Worker', async () => {
		const workers: SilentWorker[] = [];
		const client = createOrchestraWorkerClient({
			workerFactory: () => {
				const worker = new SilentWorker();
				workers.push(worker);
				return worker;
			}
		});
		const first = client.generate(lorenzSnapshot, { pointCount: 192 });
		const firstError = first.catch((error: unknown) => error);
		const second = client.generate(lorenzSnapshot, { pointCount: 256 });
		const secondError = second.catch((error: unknown) => error);
		expect(await firstError).toMatchObject({ message: expect.stringMatching(/superseded/iu) });
		expect(workers).toHaveLength(2);
		expect(workers[0].terminated).toBe(true);
		expect(workers[1].messages.at(-1)).toMatchObject({ type: 'GENERATE', pointCount: 256 });

		client.cancel();
		expect(await secondError).toMatchObject({ message: expect.stringMatching(/cancelled/iu) });
		expect(workers[1].terminated).toBe(true);
		client.dispose();
		expect(workers).toHaveLength(2);
	});

	it('supports explicit cancellation and deterministic disposal responses', async () => {
		const handler = new OrchestraWorkerHandler({
			yieldControl: () => Promise.resolve()
		});
		const cancelled: OrchestraWorkerResponse[] = [];
		await handler.handle(
			{
				protocolVersion: ORCHESTRA_WORKER_PROTOCOL_VERSION,
				requestId: 2,
				generation: 4,
				type: 'CANCEL'
			},
			(response) => cancelled.push(response)
		);
		expect(cancelled).toEqual([expect.objectContaining({ type: 'CANCELLED', generation: 4 })]);
		const disposed: OrchestraWorkerResponse[] = [];
		await handler.handle(
			{
				protocolVersion: ORCHESTRA_WORKER_PROTOCOL_VERSION,
				requestId: 3,
				generation: 4,
				type: 'DISPOSE'
			},
			(response) => disposed.push(response)
		);
		expect(disposed).toEqual([expect.objectContaining({ type: 'DISPOSED' })]);
	});
});
