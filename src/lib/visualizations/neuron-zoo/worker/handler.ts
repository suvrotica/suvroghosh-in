import { MODEL_IDS, type SimulationConfig } from '../types';
import { generateStimulus } from '../stimulus';
import { runSimulation } from '../simulation';
import {
	NEURON_ZOO_PROTOCOL_VERSION,
	type NeuronZooWorkerRequest,
	type NeuronZooWorkerResponse,
	type NeuronZooWorkerResponseBody,
	type WorkerBenchmarkResult
} from './protocol';

export class NeuronZooWorkerHandler {
	private config: SimulationConfig | null = null;
	private currentStep = 0;
	private running = false;
	private disposed = false;

	handle(request: NeuronZooWorkerRequest): NeuronZooWorkerResponse[] {
		if (request.protocolVersion !== NEURON_ZOO_PROTOCOL_VERSION) {
			return [this.error(request, 'Unsupported Neuron Zoo Worker protocol version.')];
		}
		if (this.disposed) {
			return [this.error(request, 'Neuron Zoo Worker has been disposed.')];
		}

		try {
			switch (request.type) {
				case 'INIT':
					this.disposed = false;
					this.config = cloneConfig(request.config);
					this.currentStep = 0;
					this.running = false;
					return [this.response(request, { type: 'READY' })];
				case 'SET_CONFIG':
					this.requireConfig();
					this.config = cloneConfig(request.config);
					this.currentStep = 0;
					this.running = false;
					return [this.frame(request)];
				case 'SET_STIMULUS':
					this.requireConfig().stimulus = new Float64Array(request.stimulus);
					this.currentStep = 0;
					this.running = false;
					return [this.frame(request)];
				case 'SET_PRESET': {
					const config = this.requireConfig();
					config.stimulus = generateStimulus(request.preset, {
						durationMs: config.durationMs,
						dtMs: config.dtMs,
						seed: config.seed,
						...request.options
					});
					this.currentStep = 0;
					this.running = false;
					return [this.frame(request)];
				}
				case 'SET_MODEL_PARAMS': {
					const config = this.requireConfig();
					config.modelParameters = {
						...config.modelParameters,
						...structuredClone(request.modelParameters)
					};
					this.currentStep = 0;
					this.running = false;
					return [this.frame(request)];
				}
				case 'SET_GAINS':
					this.requireConfig().gains = { ...request.gains };
					this.currentStep = 0;
					this.running = false;
					return [this.frame(request)];
				case 'RUN':
					return this.run(request, false);
				case 'REPLAY':
					this.currentStep = 0;
					return this.run(request, true);
				case 'REQUEST_SNAPSHOT':
					return this.run(request, false);
				case 'PAUSE':
					this.running = false;
					return [this.frame(request)];
				case 'STEP': {
					const config = this.requireConfig();
					this.running = false;
					this.currentStep = Math.min(config.stimulus.length, this.currentStep + 1);
					return [this.frame(request)];
				}
				case 'RESET':
					this.currentStep = 0;
					this.running = false;
					return [this.frame(request)];
				case 'RUN_BENCHMARK':
					return [
						this.response(request, {
							type: 'BENCHMARK_RESULT',
							benchmark: this.benchmark(request.repetitions)
						})
					];
				case 'DISPOSE':
					this.config = null;
					this.currentStep = 0;
					this.running = false;
					this.disposed = true;
					return [this.frame(request)];
			}
		} catch (error) {
			return [
				this.error(
					request,
					error instanceof Error ? error.message : 'Unknown Neuron Zoo Worker error.',
					error instanceof Error ? error.stack : undefined
				)
			];
		}
	}

	private run(request: NeuronZooWorkerRequest, replay: boolean): NeuronZooWorkerResponse[] {
		const config = this.requireConfig();
		if (replay) this.currentStep = 0;
		this.running = true;
		const result = runSimulation(config);
		this.currentStep = result.stepCount;
		this.running = false;
		const traceHashes = Object.fromEntries(
			MODEL_IDS.map((modelId) => [modelId, result.traces[modelId].hash])
		);
		return [
			this.response(request, { type: 'SNAPSHOT', result }),
			this.response(request, {
				type: 'METRICS',
				commandHash: result.commandHash,
				traceHashes
			})
		];
	}

	private benchmark(repetitions = 7): WorkerBenchmarkResult {
		const config = this.requireConfig();
		const requestedRepetitions = Number.isFinite(repetitions) ? Math.floor(repetitions) : 7;
		const safeRepetitions = Math.max(3, Math.min(15, requestedRepetitions));
		runSimulation(config);
		const timings: number[] = [];
		let traceHash = '';
		for (let index = 0; index < safeRepetitions; index += 1) {
			const start = performance.now();
			const result = runSimulation(config);
			timings.push(performance.now() - start);
			traceHash = MODEL_IDS.map((modelId) => result.traces[modelId].hash).join(':');
		}
		timings.sort((a, b) => a - b);
		return {
			repetitions: safeRepetitions,
			combinedMedianMs: timings[Math.floor(timings.length / 2)],
			durationMs: config.durationMs,
			dtMs: config.dtMs,
			traceHash
		};
	}

	private frame(request: NeuronZooWorkerRequest): NeuronZooWorkerResponse {
		const config = this.config;
		const index = config
			? Math.min(Math.max(0, this.currentStep), Math.max(0, config.stimulus.length - 1))
			: 0;
		return this.response(request, {
			type: 'FRAME',
			frame: {
				stepIndex: this.currentStep,
				timeMs: config ? this.currentStep * config.dtMs : 0,
				command: config?.stimulus[index] ?? 0,
				running: this.running
			}
		});
	}

	private requireConfig(): SimulationConfig {
		if (!this.config) throw new Error('Neuron Zoo Worker has not been initialized.');
		return this.config;
	}

	private response(
		request: NeuronZooWorkerRequest,
		body: NeuronZooWorkerResponseBody
	): NeuronZooWorkerResponse {
		return {
			protocolVersion: NEURON_ZOO_PROTOCOL_VERSION,
			requestId: request.requestId,
			runId: request.runId,
			...body
		} as NeuronZooWorkerResponse;
	}

	private error(
		request: NeuronZooWorkerRequest,
		message: string,
		stack?: string
	): NeuronZooWorkerResponse {
		return this.response(request, { type: 'ERROR', message, stack });
	}
}

function cloneConfig(config: SimulationConfig): SimulationConfig {
	return {
		...config,
		stimulus: new Float64Array(config.stimulus),
		gains: { ...config.gains },
		modelParameters: config.modelParameters
			? {
					...config.modelParameters,
					'mcculloch-pitts': config.modelParameters['mcculloch-pitts']
						? { ...config.modelParameters['mcculloch-pitts'] }
						: undefined,
					lif: config.modelParameters.lif ? { ...config.modelParameters.lif } : undefined,
					izhikevich: config.modelParameters.izhikevich
						? { ...config.modelParameters.izhikevich }
						: undefined,
					'fitzhugh-nagumo': config.modelParameters['fitzhugh-nagumo']
						? { ...config.modelParameters['fitzhugh-nagumo'] }
						: undefined,
					'hodgkin-huxley': config.modelParameters['hodgkin-huxley']
						? { ...config.modelParameters['hodgkin-huxley'] }
						: undefined
				}
			: undefined
	};
}
