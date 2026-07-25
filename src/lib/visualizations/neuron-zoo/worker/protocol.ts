import type {
	ModelInputGains,
	ModelParametersById,
	SimulationConfig,
	SimulationResult,
	StimulusGenerationOptions,
	StimulusPresetId
} from '../types';

export const NEURON_ZOO_PROTOCOL_VERSION = 1 as const;

interface MessageEnvelope {
	protocolVersion: typeof NEURON_ZOO_PROTOCOL_VERSION;
	requestId: number;
	runId: number;
}

export type NeuronZooWorkerRequest =
	| (MessageEnvelope & { type: 'INIT'; config: SimulationConfig })
	| (MessageEnvelope & { type: 'SET_CONFIG'; config: SimulationConfig })
	| (MessageEnvelope & { type: 'SET_STIMULUS'; stimulus: Float64Array })
	| (MessageEnvelope & {
			type: 'SET_PRESET';
			preset: StimulusPresetId;
			options?: StimulusGenerationOptions;
	  })
	| (MessageEnvelope & {
			type: 'SET_MODEL_PARAMS';
			modelParameters: Partial<ModelParametersById>;
	  })
	| (MessageEnvelope & { type: 'SET_GAINS'; gains: ModelInputGains })
	| (MessageEnvelope & { type: 'RUN' })
	| (MessageEnvelope & { type: 'PAUSE' })
	| (MessageEnvelope & { type: 'STEP' })
	| (MessageEnvelope & { type: 'RESET' })
	| (MessageEnvelope & { type: 'REPLAY' })
	| (MessageEnvelope & { type: 'REQUEST_SNAPSHOT' })
	| (MessageEnvelope & { type: 'RUN_BENCHMARK'; repetitions?: number })
	| (MessageEnvelope & { type: 'DISPOSE' });

type WithoutEnvelope<Message> = Message extends unknown
	? Omit<Message, keyof MessageEnvelope>
	: never;

export type NeuronZooWorkerRequestBody = WithoutEnvelope<NeuronZooWorkerRequest>;

export interface WorkerFrame {
	stepIndex: number;
	timeMs: number;
	command: number;
	running: boolean;
}

export interface WorkerBenchmarkResult {
	repetitions: number;
	combinedMedianMs: number;
	durationMs: number;
	dtMs: number;
	traceHash: string;
}

export type NeuronZooWorkerResponse =
	| (MessageEnvelope & { type: 'READY' })
	| (MessageEnvelope & { type: 'FRAME'; frame: WorkerFrame })
	| (MessageEnvelope & { type: 'SNAPSHOT'; result: SimulationResult })
	| (MessageEnvelope & {
			type: 'METRICS';
			commandHash: string;
			traceHashes: Record<string, string>;
	  })
	| (MessageEnvelope & { type: 'BENCHMARK_RESULT'; benchmark: WorkerBenchmarkResult })
	| (MessageEnvelope & { type: 'WARNING'; message: string })
	| (MessageEnvelope & { type: 'ERROR'; message: string; stack?: string });

export type NeuronZooWorkerResponseBody = WithoutEnvelope<NeuronZooWorkerResponse>;

export function isNeuronZooWorkerResponse(value: unknown): value is NeuronZooWorkerResponse {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	if (
		candidate.protocolVersion !== NEURON_ZOO_PROTOCOL_VERSION ||
		!isMessageIdentifier(candidate.requestId) ||
		!isMessageIdentifier(candidate.runId)
	) {
		return false;
	}

	switch (candidate.type) {
		case 'READY':
			return true;
		case 'FRAME':
			return isWorkerFrame(candidate.frame);
		case 'SNAPSHOT':
			return isSimulationResult(candidate.result);
		case 'METRICS':
			return typeof candidate.commandHash === 'string' && isStringRecord(candidate.traceHashes);
		case 'BENCHMARK_RESULT':
			return isBenchmarkResult(candidate.benchmark);
		case 'WARNING':
			return typeof candidate.message === 'string';
		case 'ERROR':
			return (
				typeof candidate.message === 'string' &&
				(candidate.stack === undefined || typeof candidate.stack === 'string')
			);
		default:
			return false;
	}
}

export function simulationResultTransferables(result: SimulationResult): ArrayBuffer[] {
	const buffers = new Set<ArrayBuffer>();
	const collect = (array: Float64Array) => {
		if (array.buffer instanceof ArrayBuffer) buffers.add(array.buffer);
	};
	collect(result.timeMs);
	collect(result.displayCommand);
	for (const trace of Object.values(result.traces)) {
		collect(trace.nativeInput);
		for (const channel of Object.values(trace.channels)) collect(channel);
	}
	return [...buffers];
}

function isMessageIdentifier(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isWorkerFrame(value: unknown): value is WorkerFrame {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Record<string, unknown>;
	return (
		Number.isSafeInteger(candidate.stepIndex) &&
		Number(candidate.stepIndex) >= 0 &&
		typeof candidate.timeMs === 'number' &&
		Number.isFinite(candidate.timeMs) &&
		typeof candidate.command === 'number' &&
		Number.isFinite(candidate.command) &&
		typeof candidate.running === 'boolean'
	);
}

function isSimulationResult(value: unknown): value is SimulationResult {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<SimulationResult>;
	return (
		typeof candidate.dtMs === 'number' &&
		Number.isFinite(candidate.dtMs) &&
		typeof candidate.durationMs === 'number' &&
		Number.isFinite(candidate.durationMs) &&
		candidate.timeMs instanceof Float64Array &&
		candidate.displayCommand instanceof Float64Array &&
		typeof candidate.commandHash === 'string' &&
		!!candidate.traces &&
		typeof candidate.traces === 'object'
	);
}

function isStringRecord(value: unknown): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.values(value).every((entry) => typeof entry === 'string');
}

function isBenchmarkResult(value: unknown): value is WorkerBenchmarkResult {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<WorkerBenchmarkResult>;
	return (
		Number.isSafeInteger(candidate.repetitions) &&
		Number(candidate.repetitions) >= 0 &&
		typeof candidate.combinedMedianMs === 'number' &&
		Number.isFinite(candidate.combinedMedianMs) &&
		typeof candidate.durationMs === 'number' &&
		Number.isFinite(candidate.durationMs) &&
		typeof candidate.dtMs === 'number' &&
		Number.isFinite(candidate.dtMs) &&
		typeof candidate.traceHash === 'string'
	);
}
