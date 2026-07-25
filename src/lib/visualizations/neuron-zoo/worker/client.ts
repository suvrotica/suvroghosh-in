import type {
	ModelInputGains,
	ModelParametersById,
	SimulationConfig,
	StimulusGenerationOptions,
	StimulusPresetId
} from '../types';
import {
	isNeuronZooWorkerResponse,
	NEURON_ZOO_PROTOCOL_VERSION,
	type NeuronZooWorkerRequest,
	type NeuronZooWorkerRequestBody,
	type NeuronZooWorkerResponse
} from './protocol';

export interface WorkerLike {
	postMessage(message: NeuronZooWorkerRequest, transfer?: Transferable[]): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	terminate(): void;
}

export type WorkerResponseListener = (response: NeuronZooWorkerResponse) => void;

export class NeuronZooWorkerClient {
	private requestId = 0;
	private runId = 0;
	private latestAcceptedRequestId = 0;
	private disposed = false;
	private listeners = new Set<WorkerResponseListener>();

	constructor(private readonly worker: WorkerLike) {
		worker.addEventListener('message', this.handleMessage);
	}

	subscribe(listener: WorkerResponseListener): () => void {
		this.ensureActive();
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	initialize(config: SimulationConfig): number {
		this.beginNewRun();
		const cloned = cloneConfigForTransfer(config);
		this.send({ type: 'INIT', config: cloned.config }, [
			cloned.config.stimulus.buffer as ArrayBuffer
		]);
		return this.runId;
	}

	setConfig(config: SimulationConfig): number {
		this.beginNewRun();
		const cloned = cloneConfigForTransfer(config);
		this.send({ type: 'SET_CONFIG', config: cloned.config }, [
			cloned.config.stimulus.buffer as ArrayBuffer
		]);
		return this.runId;
	}

	setStimulus(stimulus: Float64Array): number {
		this.beginNewRun();
		const copy = new Float64Array(stimulus);
		this.send({ type: 'SET_STIMULUS', stimulus: copy }, [copy.buffer as ArrayBuffer]);
		return this.runId;
	}

	setPreset(preset: StimulusPresetId, options?: StimulusGenerationOptions): number {
		this.beginNewRun();
		this.send({ type: 'SET_PRESET', preset, options: options ? { ...options } : undefined });
		return this.runId;
	}

	setModelParameters(modelParameters: Partial<ModelParametersById>): number {
		this.beginNewRun();
		this.send({
			type: 'SET_MODEL_PARAMS',
			modelParameters: structuredClone(modelParameters)
		});
		return this.runId;
	}

	setGains(gains: ModelInputGains): number {
		this.beginNewRun();
		this.send({ type: 'SET_GAINS', gains: { ...gains } });
		return this.runId;
	}

	run(): void {
		this.send({ type: 'RUN' });
	}

	pause(): void {
		this.send({ type: 'PAUSE' });
	}

	step(): void {
		this.send({ type: 'STEP' });
	}

	reset(): void {
		this.beginNewRun();
		this.send({ type: 'RESET' });
	}

	replay(): void {
		this.beginNewRun();
		this.send({ type: 'REPLAY' });
	}

	requestSnapshot(): void {
		this.send({ type: 'REQUEST_SNAPSHOT' });
	}

	runBenchmark(repetitions = 7): void {
		this.send({ type: 'RUN_BENCHMARK', repetitions });
	}

	sendMessage(body: NeuronZooWorkerRequestBody, transfer: Transferable[] = []): void {
		if (startsNewRun(body.type)) this.beginNewRun();
		this.send(body, transfer);
	}

	currentRunId(): number {
		return this.runId;
	}

	dispose(): void {
		if (this.disposed) return;
		try {
			this.send({ type: 'DISPOSE' });
		} finally {
			this.disposed = true;
			this.worker.removeEventListener('message', this.handleMessage);
			this.listeners.clear();
			this.worker.terminate();
		}
	}

	private send(body: NeuronZooWorkerRequestBody, transfer: Transferable[] = []): void {
		this.ensureActive();
		this.requestId += 1;
		this.worker.postMessage(
			{
				protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
				requestId: this.requestId,
				runId: this.runId,
				...body
			} as NeuronZooWorkerRequest,
			transfer
		);
	}

	private handleMessage = (event: MessageEvent<unknown>) => {
		if (this.disposed || !isNeuronZooWorkerResponse(event.data)) return;
		if (event.data.runId !== this.runId) return;
		if (
			event.data.requestId > this.requestId ||
			event.data.requestId < this.latestAcceptedRequestId
		) {
			return;
		}
		this.latestAcceptedRequestId = event.data.requestId;
		for (const listener of this.listeners) listener(event.data);
	};

	private beginNewRun(): void {
		this.ensureActive();
		this.runId += 1;
	}

	private ensureActive(): void {
		if (this.disposed) throw new Error('Neuron Zoo Worker client has been disposed.');
	}
}

export function createNeuronZooWorkerClient(): NeuronZooWorkerClient {
	if (typeof Worker === 'undefined') {
		throw new Error('The Neuron Zoo module Worker can only be created in a browser.');
	}
	const worker = new Worker(new URL('./neuronZoo.worker.ts', import.meta.url), {
		type: 'module',
		name: 'neuron-zoo-simulator'
	});
	return new NeuronZooWorkerClient(worker);
}

function cloneConfigForTransfer(config: SimulationConfig): { config: SimulationConfig } {
	return {
		config: {
			...config,
			stimulus: new Float64Array(config.stimulus),
			gains: { ...config.gains },
			modelParameters: config.modelParameters ? structuredClone(config.modelParameters) : undefined
		}
	};
}

function startsNewRun(type: NeuronZooWorkerRequestBody['type']): boolean {
	return (
		type === 'INIT' ||
		type === 'SET_CONFIG' ||
		type === 'SET_STIMULUS' ||
		type === 'SET_PRESET' ||
		type === 'SET_MODEL_PARAMS' ||
		type === 'SET_GAINS' ||
		type === 'RESET' ||
		type === 'REPLAY'
	);
}
