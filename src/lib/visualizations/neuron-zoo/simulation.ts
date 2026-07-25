import {
	DEFAULT_DISPLAY_SAMPLE_INTERVAL_MS,
	DEFAULT_MODEL_INPUT_GAINS,
	MODEL_INPUT_GAIN_RANGES
} from './constants';
import {
	calculateHodgkinHuxleyEnergyEstimate,
	integrateInwardSodiumStep,
	unavailableBiologicalEnergy
} from './energy';
import { hashNumbers, hashTraceChannels } from './hash';
import { ModelMetricAccumulator } from './metrics';
import {
	createFitzHughNagumoState,
	stepFitzHughNagumo,
	validateFitzHughNagumoParameters
} from './models/fitzhughNagumo';
import {
	createHodgkinHuxleyState,
	hodgkinHuxleyCurrents,
	stepHodgkinHuxley,
	validateHodgkinHuxleyParameters
} from './models/hodgkinHuxley';
import {
	createIzhikevichState,
	stepIzhikevich,
	validateIzhikevichParameters
} from './models/izhikevich';
import { createLifState, stepLif, validateLifParameters } from './models/lif';
import {
	createMcCullochPittsState,
	stepMcCullochPitts,
	validateMcCullochPittsParameters
} from './models/mccullochPitts';
import { resolveModelParameters } from './models/registry';
import type {
	FitzHughNagumoState,
	HodgkinHuxleyParameters,
	HodgkinHuxleyState,
	IzhikevichState,
	LifState,
	McCullochPittsState,
	ModelId,
	ModelInputGains,
	ModelParametersById,
	ModelTrace,
	SimulationConfig,
	SimulationResult,
	SpikeEvent,
	StepContext
} from './types';
import { displaySampleStride, simulationStepCount } from './units';

function validationMessagesForParameters(parameters: ModelParametersById): string[] {
	return [
		...validateMcCullochPittsParameters(parameters['mcculloch-pitts']),
		...validateLifParameters(parameters.lif),
		...validateIzhikevichParameters(parameters.izhikevich),
		...validateFitzHughNagumoParameters(parameters['fitzhugh-nagumo']),
		...validateHodgkinHuxleyParameters(parameters['hodgkin-huxley'])
	];
}

export function validateSimulationConfig(config: SimulationConfig): string[] {
	const errors: string[] = [];
	if (!Number.isFinite(config.dtMs) || config.dtMs < 0.005 || config.dtMs > 0.1) {
		errors.push('Simulation dt must be finite and within [0.005, 0.1] ms.');
	}
	if (!Number.isFinite(config.durationMs) || config.durationMs <= 0 || config.durationMs > 2_000) {
		errors.push('Simulation duration must be finite and within (0, 2000] ms.');
	}
	let expectedSteps = -1;
	try {
		expectedSteps = simulationStepCount(config.durationMs, config.dtMs);
	} catch (error) {
		errors.push(error instanceof Error ? error.message : 'Simulation grid is invalid.');
	}
	if (!(config.stimulus instanceof Float64Array)) {
		errors.push('Canonical stimulus must be a Float64Array.');
	} else {
		if (expectedSteps >= 0 && config.stimulus.length !== expectedSteps) {
			errors.push('Canonical stimulus length must equal duration divided by dt.');
		}
		for (let index = 0; index < config.stimulus.length; index += 1) {
			const value = config.stimulus[index];
			if (!Number.isFinite(value) || value < -1 || value > 1) {
				errors.push(`Stimulus sample ${index} must be finite and within [-1, 1].`);
				break;
			}
		}
	}
	for (const modelId of Object.keys(DEFAULT_MODEL_INPUT_GAINS) as ModelId[]) {
		const gain = config.gains?.[modelId];
		const [minimum, maximum] = MODEL_INPUT_GAIN_RANGES[modelId];
		if (!Number.isFinite(gain) || gain < minimum || gain > maximum) {
			errors.push(`${modelId} input gain must be within [${minimum}, ${maximum}].`);
		}
	}
	try {
		const interval = config.displaySampleIntervalMs ?? DEFAULT_DISPLAY_SAMPLE_INTERVAL_MS;
		if (interval < config.dtMs) errors.push('Display interval cannot be smaller than dt.');
		else displaySampleStride(config.dtMs, interval);
	} catch (error) {
		errors.push(error instanceof Error ? error.message : 'Display interval is invalid.');
	}
	errors.push(...validationMessagesForParameters(resolveModelParameters(config.modelParameters)));
	return errors;
}

function displaySteps(stepCount: number, stride: number): Uint32Array {
	const values = [0];
	for (let step = stride; step < stepCount; step += stride) values.push(step);
	if (values.at(-1) !== stepCount) values.push(stepCount);
	return Uint32Array.from(values);
}

function createTraceChannels(
	names: readonly string[],
	count: number
): Record<string, Float64Array> {
	return Object.fromEntries(names.map((name) => [name, new Float64Array(count)]));
}

function nativeInput(gains: ModelInputGains, modelId: ModelId, command: number): number {
	return gains[modelId] * command;
}

function createContext(
	modelId: ModelId,
	command: number,
	config: SimulationConfig,
	stepIndex: number
): StepContext {
	return {
		tMs: stepIndex * config.dtMs,
		dtMs: config.dtMs,
		command,
		nativeInput: nativeInput(config.gains, modelId, command),
		stepIndex
	};
}

export function simulateHodgkinHuxleyBaselineCharge(
	dtMs: number,
	stepCount: number,
	parameters: HodgkinHuxleyParameters
): number {
	let state = createHodgkinHuxleyState(parameters);
	let previousCurrent = hodgkinHuxleyCurrents(state, parameters).sodiumUaPerCm2;
	let chargeNcPerCm2 = 0;
	for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
		const result = stepHodgkinHuxley(
			state,
			{
				tMs: stepIndex * dtMs,
				dtMs,
				command: 0,
				nativeInput: 0,
				stepIndex
			},
			parameters
		);
		chargeNcPerCm2 += integrateInwardSodiumStep(
			previousCurrent,
			result.currents.sodiumUaPerCm2,
			dtMs
		);
		previousCurrent = result.currents.sodiumUaPerCm2;
		state = result.state;
	}
	return chargeNcPerCm2;
}

export function runSimulation(config: SimulationConfig): SimulationResult {
	const validationErrors = validateSimulationConfig(config);
	if (validationErrors.length > 0) {
		throw new RangeError(`Invalid Neuron Zoo simulation config: ${validationErrors.join(' ')}`);
	}
	const parameters = resolveModelParameters(config.modelParameters);
	const stepCount = simulationStepCount(config.durationMs, config.dtMs);
	const displaySampleIntervalMs =
		config.displaySampleIntervalMs ?? DEFAULT_DISPLAY_SAMPLE_INTERVAL_MS;
	const stride = displaySampleStride(config.dtMs, displaySampleIntervalMs);
	const sampledSteps = displaySteps(stepCount, stride);
	const displayCount = sampledSteps.length;
	const timeMs = new Float64Array(displayCount);
	const displayCommand = new Float64Array(displayCount);
	const commandHash = hashNumbers(config.stimulus);

	let mpState: McCullochPittsState = createMcCullochPittsState();
	let lifState: LifState = createLifState(parameters.lif);
	let izhState: IzhikevichState = createIzhikevichState(parameters.izhikevich);
	let fhnState: FitzHughNagumoState = createFitzHughNagumoState(parameters['fitzhugh-nagumo']);
	let hhState: HodgkinHuxleyState = createHodgkinHuxleyState(parameters['hodgkin-huxley']);
	let hhCurrents = hodgkinHuxleyCurrents(hhState, parameters['hodgkin-huxley']);

	const nativeInputs = Object.fromEntries(
		(Object.keys(DEFAULT_MODEL_INPUT_GAINS) as ModelId[]).map((modelId) => [
			modelId,
			new Float64Array(displayCount)
		])
	) as Record<ModelId, Float64Array>;
	const channels: Record<ModelId, Record<string, Float64Array>> = {
		'mcculloch-pitts': createTraceChannels(['output', 'thresholdDrive'], displayCount),
		lif: createTraceChannels(['voltageMv', 'refractoryRemainingMs'], displayCount),
		izhikevich: createTraceChannels(['voltageMv', 'recovery'], displayCount),
		'fitzhugh-nagumo': createTraceChannels(['fast', 'recovery'], displayCount),
		'hodgkin-huxley': createTraceChannels(
			[
				'voltageMv',
				'm',
				'h',
				'n',
				'sodiumCurrentUaPerCm2',
				'potassiumCurrentUaPerCm2',
				'leakCurrentUaPerCm2',
				'sodiumConductanceMsPerCm2',
				'potassiumConductanceMsPerCm2'
			],
			displayCount
		)
	};
	const events = Object.fromEntries(
		(Object.keys(DEFAULT_MODEL_INPUT_GAINS) as ModelId[]).map((modelId) => [
			modelId,
			[] as SpikeEvent[]
		])
	) as Record<ModelId, SpikeEvent[]>;
	const metricAccumulators: Record<ModelId, ModelMetricAccumulator> = {
		'mcculloch-pitts': new ModelMetricAccumulator('mcculloch-pitts', mpState.output),
		lif: new ModelMetricAccumulator('lif', lifState.voltageMv),
		izhikevich: new ModelMetricAccumulator('izhikevich', izhState.voltageMv),
		'fitzhugh-nagumo': new ModelMetricAccumulator('fitzhugh-nagumo', fhnState.fast),
		'hodgkin-huxley': new ModelMetricAccumulator('hodgkin-huxley', hhState.voltageMv, hhState)
	};

	function recordDisplay(displayIndex: number, completedStep: number): void {
		timeMs[displayIndex] = completedStep * config.dtMs;
		const commandIndex = Math.min(completedStep, stepCount - 1);
		const command = config.stimulus[commandIndex];
		displayCommand[displayIndex] = command;
		for (const modelId of Object.keys(DEFAULT_MODEL_INPUT_GAINS) as ModelId[]) {
			nativeInputs[modelId][displayIndex] = nativeInput(config.gains, modelId, command);
		}
		channels['mcculloch-pitts'].output[displayIndex] = mpState.output;
		channels['mcculloch-pitts'].thresholdDrive[displayIndex] =
			nativeInputs['mcculloch-pitts'][displayIndex] + parameters['mcculloch-pitts'].bias;
		channels.lif.voltageMv[displayIndex] = lifState.voltageMv;
		channels.lif.refractoryRemainingMs[displayIndex] = lifState.refractoryRemainingMs;
		channels.izhikevich.voltageMv[displayIndex] = izhState.voltageMv;
		channels.izhikevich.recovery[displayIndex] = izhState.recovery;
		channels['fitzhugh-nagumo'].fast[displayIndex] = fhnState.fast;
		channels['fitzhugh-nagumo'].recovery[displayIndex] = fhnState.recovery;
		channels['hodgkin-huxley'].voltageMv[displayIndex] = hhState.voltageMv;
		channels['hodgkin-huxley'].m[displayIndex] = hhState.m;
		channels['hodgkin-huxley'].h[displayIndex] = hhState.h;
		channels['hodgkin-huxley'].n[displayIndex] = hhState.n;
		channels['hodgkin-huxley'].sodiumCurrentUaPerCm2[displayIndex] = hhCurrents.sodiumUaPerCm2;
		channels['hodgkin-huxley'].potassiumCurrentUaPerCm2[displayIndex] =
			hhCurrents.potassiumUaPerCm2;
		channels['hodgkin-huxley'].leakCurrentUaPerCm2[displayIndex] = hhCurrents.leakUaPerCm2;
		channels['hodgkin-huxley'].sodiumConductanceMsPerCm2[displayIndex] =
			hhCurrents.sodiumConductanceMsPerCm2;
		channels['hodgkin-huxley'].potassiumConductanceMsPerCm2[displayIndex] =
			hhCurrents.potassiumConductanceMsPerCm2;
	}

	recordDisplay(0, 0);
	let nextDisplayIndex = 1;
	let rawInwardSodiumChargeNcPerCm2 = 0;
	let previousSodiumCurrentUaPerCm2 = hhCurrents.sodiumUaPerCm2;

	for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
		const command = config.stimulus[stepIndex];
		const mpStep = stepMcCullochPitts(
			mpState,
			createContext('mcculloch-pitts', command, config, stepIndex),
			parameters['mcculloch-pitts']
		);
		mpState = mpStep.state;
		if (mpStep.event) events['mcculloch-pitts'].push(mpStep.event);
		metricAccumulators['mcculloch-pitts'].observe(mpState.output, mpStep.event);

		const lifStep = stepLif(
			lifState,
			createContext('lif', command, config, stepIndex),
			parameters.lif
		);
		lifState = lifStep.state;
		if (lifStep.event) events.lif.push(lifStep.event);
		metricAccumulators.lif.observe(lifState.voltageMv, lifStep.event);

		const izhStep = stepIzhikevich(
			izhState,
			createContext('izhikevich', command, config, stepIndex),
			parameters.izhikevich
		);
		izhState = izhStep.state;
		if (izhStep.event) events.izhikevich.push(izhStep.event);
		metricAccumulators.izhikevich.observe(izhState.voltageMv, izhStep.event);

		const fhnStep = stepFitzHughNagumo(
			fhnState,
			createContext('fitzhugh-nagumo', command, config, stepIndex),
			parameters['fitzhugh-nagumo']
		);
		fhnState = fhnStep.state;
		if (fhnStep.event) events['fitzhugh-nagumo'].push(fhnStep.event);
		metricAccumulators['fitzhugh-nagumo'].observe(fhnState.fast, fhnStep.event);

		const hhStep = stepHodgkinHuxley(
			hhState,
			createContext('hodgkin-huxley', command, config, stepIndex),
			parameters['hodgkin-huxley']
		);
		hhState = hhStep.state;
		hhCurrents = hhStep.currents;
		rawInwardSodiumChargeNcPerCm2 += integrateInwardSodiumStep(
			previousSodiumCurrentUaPerCm2,
			hhCurrents.sodiumUaPerCm2,
			config.dtMs
		);
		previousSodiumCurrentUaPerCm2 = hhCurrents.sodiumUaPerCm2;
		if (hhStep.event) events['hodgkin-huxley'].push(hhStep.event);
		metricAccumulators['hodgkin-huxley'].observe(hhState.voltageMv, hhStep.event, hhState);

		const completedStep = stepIndex + 1;
		if (
			nextDisplayIndex < sampledSteps.length &&
			completedStep === sampledSteps[nextDisplayIndex]
		) {
			recordDisplay(nextDisplayIndex, completedStep);
			nextDisplayIndex += 1;
		}
	}

	const traces = {} as Record<ModelId, ModelTrace>;
	for (const modelId of Object.keys(DEFAULT_MODEL_INPUT_GAINS) as ModelId[]) {
		const traceChannels = channels[modelId];
		traces[modelId] = {
			modelId,
			nativeInput: nativeInputs[modelId],
			channels: traceChannels,
			events: events[modelId],
			metrics: metricAccumulators[modelId].finish(commandHash),
			hash: hashTraceChannels({ nativeInput: nativeInputs[modelId], ...traceChannels })
		};
	}

	const baselineInwardSodiumChargeNcPerCm2 = simulateHodgkinHuxleyBaselineCharge(
		config.dtMs,
		stepCount,
		parameters['hodgkin-huxley']
	);
	return {
		dtMs: config.dtMs,
		durationMs: config.durationMs,
		stepCount,
		displaySampleIntervalMs,
		timeMs,
		displayCommand,
		commandHash,
		traces,
		energy: {
			'mcculloch-pitts': unavailableBiologicalEnergy('mcculloch-pitts'),
			lif: unavailableBiologicalEnergy('lif'),
			izhikevich: unavailableBiologicalEnergy('izhikevich'),
			'fitzhugh-nagumo': unavailableBiologicalEnergy('fitzhugh-nagumo'),
			'hodgkin-huxley': calculateHodgkinHuxleyEnergyEstimate(
				rawInwardSodiumChargeNcPerCm2,
				baselineInwardSodiumChargeNcPerCm2
			)
		}
	};
}

export const runExperiment = runSimulation;
