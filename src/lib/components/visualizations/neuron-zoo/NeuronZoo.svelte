<script lang="ts">
	import { onMount } from 'svelte';
	import AdvancedSettings from './AdvancedSettings.svelte';
	import ComparisonMatrix from './ComparisonMatrix.svelte';
	import DataView, { type DataViewRow } from './DataView.svelte';
	import EnergyInspector, { type BenchmarkRow } from './EnergyInspector.svelte';
	import EquationPanel from './EquationPanel.svelte';
	import HodgkinHuxleyGates from './HodgkinHuxleyGates.svelte';
	import ModelCard from './ModelCard.svelte';
	import PhasePlane from './PhasePlane.svelte';
	import RefractoryInspector, { type RecoveryRow } from './RefractoryInspector.svelte';
	import SpikeRaster from './SpikeRaster.svelte';
	import StimulusEditor from './StimulusEditor.svelte';
	import TracePlot from './TracePlot.svelte';
	import TransportControls from './TransportControls.svelte';
	import {
		ALLOWED_DT_MS,
		ALLOWED_DURATION_MS,
		DEFAULT_DELTA_G_ATP_KJ_PER_MOL,
		DEFAULT_DISPLAY_SAMPLE_INTERVAL_MS,
		DEFAULT_DT_MS,
		DEFAULT_DURATION_MS,
		DEFAULT_FITZHUGH_NAGUMO_PARAMETERS,
		DEFAULT_MODEL_INPUT_GAINS,
		DEFAULT_MODEL_PARAMETERS,
		DEFAULT_NOISE_SEED,
		DEFAULT_PAIRED_PULSE_ISI_MS,
		IZHIKEVICH_PHENOTYPES,
		MODEL_DEFINITIONS,
		MODEL_IDS,
		STIMULUS_PRESETS,
		deserializeExperimentState,
		generateStimulus,
		runSimulation,
		serializeExperimentState,
		simulationStepCount,
		stimulusFromSerializedState,
		type ExperimentPresetId,
		type IzhikevichPhenotypeId,
		type ModelId,
		type ModelInputGains,
		type ModelParametersById,
		type SerializedExperimentStateV1,
		type SimulationConfig,
		type SimulationResult
	} from '$lib/visualizations/neuron-zoo';
	import { NeuronZooWorkerClient } from '$lib/visualizations/neuron-zoo/worker/client';
	import type {
		NeuronZooWorkerResponse,
		WorkerBenchmarkResult
	} from '$lib/visualizations/neuron-zoo/worker/protocol';

	const MODEL_PRESENTATION: Record<
		ModelId,
		{
			color: string;
			dash: readonly number[];
			yMin: number;
			yMax: number;
			primaryChannel: string;
			threshold?: number;
			marker: 'tick' | 'double' | 'triangle' | 'diamond' | 'circle';
		}
	> = {
		'mcculloch-pitts': {
			color: '#e9b44c',
			dash: [2, 5],
			yMin: 0,
			yMax: 1,
			primaryChannel: 'output',
			threshold: 0.5,
			marker: 'tick'
		},
		lif: {
			color: '#73b7c8',
			dash: [8, 5],
			yMin: -80,
			yMax: -40,
			primaryChannel: 'voltageMv',
			threshold: -50,
			marker: 'double'
		},
		izhikevich: {
			color: '#a7c080',
			dash: [1, 5],
			yMin: -90,
			yMax: 35,
			primaryChannel: 'voltageMv',
			threshold: 30,
			marker: 'triangle'
		},
		'fitzhugh-nagumo': {
			color: '#df806f',
			dash: [10, 3, 2, 3],
			yMin: -2.5,
			yMax: 2.5,
			primaryChannel: 'fast',
			threshold: 1,
			marker: 'diamond'
		},
		'hodgkin-huxley': {
			color: '#a78bca',
			dash: [],
			yMin: -90,
			yMax: 60,
			primaryChannel: 'voltageMv',
			threshold: 0,
			marker: 'circle'
		}
	};

	const presetOptions = [
		...STIMULUS_PRESETS.map(({ id, name }) => ({ id, label: name })),
		{ id: 'custom', label: 'Custom / recorded', disabled: true }
	];
	const validPresetIds = new Set<string>(STIMULUS_PRESETS.map(({ id }) => id));

	let laboratory: HTMLElement;
	let bench: HTMLElement;
	let workerClient: NeuronZooWorkerClient | null = null;
	let unsubscribeWorker: (() => void) | null = null;
	let playbackFrame = 0;
	let previousFrameTime = 0;
	let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
	let visible = true;
	let pageVisible = true;
	let pendingResume = false;
	let preserveCursorAfterCompute = false;
	let workerAvailable = $state(true);

	let entered = $state(false);
	let busy = $state(true);
	let playing = $state(false);
	let reducedMotion = $state(false);
	let status = $state('Preparing the deterministic laboratory…');
	let warning = $state('');
	let result = $state<SimulationResult | null>(null);
	let lastValidResult = $state<SimulationResult | null>(null);
	let benchmark = $state<WorkerBenchmarkResult | null>(null);
	let cursorMs = $state(0);
	let speed = $state(1);
	let mode = $state<'draw' | 'inject'>('draw');
	let liveAmplitude = $state<number | null>(null);
	let preset = $state<ExperimentPresetId>('sustained-step');
	let dtMs = $state(DEFAULT_DT_MS);
	let durationMs = $state(DEFAULT_DURATION_MS);
	let seed = $state(DEFAULT_NOISE_SEED);
	let isiMs = $state(DEFAULT_PAIRED_PULSE_ISI_MS);
	let displaySampleMs = $state(DEFAULT_DISPLAY_SAMPLE_INTERVAL_MS);
	let gains = $state<ModelInputGains>({ ...DEFAULT_MODEL_INPUT_GAINS });
	let izhikevichPhenotype = $state<IzhikevichPhenotypeId>('regular-spiking');
	let fhnTimeScaleMs = $state(DEFAULT_FITZHUGH_NAGUMO_PARAMETERS.timeScaleMs);
	let deltaGAtpKjMol = $state(DEFAULT_DELTA_G_ATP_KJ_PER_MOL);
	let waveform = $state<Float64Array>(
		generateStimulus('sustained-step', {
			durationMs: DEFAULT_DURATION_MS,
			dtMs: DEFAULT_DT_MS,
			seed: DEFAULT_NOISE_SEED
		})
	);
	let primaryModel = $state<ModelId>('lif');
	let compareModel = $state<ModelId>('hodgkin-huxley');

	let displayResult = $derived(result ?? lastValidResult);
	let cursorIndex = $derived(sampleIndexForTime(displayResult, cursorMs));
	let currentCommand = $derived(
		displayResult?.displayCommand[cursorIndex] ??
			waveform[
				Math.min(
					waveform.length - 1,
					Math.max(0, Math.round((cursorMs / Math.max(durationMs, 1)) * waveform.length))
				)
			] ??
			0
	);
	let specimens = $derived.by(buildSpecimens);
	let dataRows = $derived.by(buildDataRows);
	let recoveryRows = $derived.by(buildRecoveryRows);
	let fhnPhase = $derived.by(buildFhnPhase);
	let benchmarkRows = $derived.by(buildBenchmarkRows);

	function currentModelParameters(): Partial<ModelParametersById> {
		return {
			izhikevich: { ...IZHIKEVICH_PHENOTYPES[izhikevichPhenotype] },
			'fitzhugh-nagumo': {
				...DEFAULT_MODEL_PARAMETERS['fitzhugh-nagumo'],
				timeScaleMs: fhnTimeScaleMs
			}
		};
	}

	function simulationConfig(): SimulationConfig {
		return {
			dtMs,
			durationMs,
			seed,
			stimulus: new Float64Array(waveform),
			gains: { ...gains },
			modelParameters: currentModelParameters(),
			displaySampleIntervalMs: displaySampleMs
		};
	}

	function buildSpecimens() {
		const izh = IZHIKEVICH_PHENOTYPES[izhikevichPhenotype];
		const fhn = {
			...DEFAULT_MODEL_PARAMETERS['fitzhugh-nagumo'],
			timeScaleMs: fhnTimeScaleMs
		};
		return MODEL_IDS.map((modelId) => {
			const definition = MODEL_DEFINITIONS[modelId];
			const presentation = MODEL_PRESENTATION[modelId];
			const parameters: Record<ModelId, string[]> = {
				'mcculloch-pitts': [
					`gain ${gains['mcculloch-pitts']}`,
					`bias ${DEFAULT_MODEL_PARAMETERS['mcculloch-pitts'].bias}`,
					`threshold ${DEFAULT_MODEL_PARAMETERS['mcculloch-pitts'].threshold}`
				],
				lif: [
					`Cₘ ${DEFAULT_MODEL_PARAMETERS.lif.capacitancePf} pF`,
					`gL ${DEFAULT_MODEL_PARAMETERS.lif.leakConductanceNs} nS`,
					`EL ${DEFAULT_MODEL_PARAMETERS.lif.leakReversalMv} mV`,
					`Vth ${DEFAULT_MODEL_PARAMETERS.lif.thresholdMv} mV`,
					`Vreset ${DEFAULT_MODEL_PARAMETERS.lif.resetMv} mV`,
					`tref ${DEFAULT_MODEL_PARAMETERS.lif.refractoryMs} ms`,
					`input gain ${gains.lif} pA`
				],
				izhikevich: [
					`phenotype ${izhikevichPhenotype.replaceAll('-', ' ')}`,
					`a ${izh.a}`,
					`b ${izh.b}`,
					`c ${izh.c}`,
					`d ${izh.d}`,
					`input gain ${gains.izhikevich} model units`
				],
				'fitzhugh-nagumo': [
					`a ${fhn.a}`,
					`b ${fhn.b}`,
					`ε ${fhn.epsilon}`,
					`TFHN ${fhn.timeScaleMs} ms`,
					`input gain ${gains['fitzhugh-nagumo']}`
				],
				'hodgkin-huxley': [
					`Cₘ ${DEFAULT_MODEL_PARAMETERS['hodgkin-huxley'].capacitanceUfPerCm2} µF/cm²`,
					`ḡNa ${DEFAULT_MODEL_PARAMETERS['hodgkin-huxley'].sodiumConductanceMsPerCm2} mS/cm²`,
					`ḡK ${DEFAULT_MODEL_PARAMETERS['hodgkin-huxley'].potassiumConductanceMsPerCm2} mS/cm²`,
					`gL ${DEFAULT_MODEL_PARAMETERS['hodgkin-huxley'].leakConductanceMsPerCm2} mS/cm²`,
					`input gain ${gains['hodgkin-huxley']} µA/cm²`
				]
			};
			const capabilities = capabilityBadges(modelId);
			return {
				id: modelId,
				abbreviation: definition.display.abbreviation,
				name: definition.display.name,
				year: definition.display.year,
				modelClass: definition.display.modelClass,
				stateVariables:
					definition.display.stateVariables.length === 0
						? 'none beyond binary output'
						: definition.display.stateVariables.join(', '),
				nativeInput: `${gains[modelId]} ${definition.display.inputUnits} × s(t)`,
				primaryLabel: definition.display.primaryOutput,
				primaryUnit: definition.display.primaryUnits,
				yMin: presentation.yMin,
				yMax: presentation.yMax,
				color: presentation.color,
				dash: presentation.dash,
				keeps: definition.display.keeps,
				throwsAway: definition.display.throwsAway,
				equation: definition.display.equationPlainText.join('  |  '),
				parameters: parameters[modelId],
				capabilities
			};
		});
	}

	function capabilityBadges(modelId: ModelId) {
		switch (modelId) {
			case 'mcculloch-pitts':
				return [
					{ label: 'threshold logic', status: 'explicit' as const },
					{ label: 'membrane voltage', status: 'unavailable' as const },
					{ label: 'biological energy', status: 'unavailable' as const }
				];
			case 'lif':
				return [
					{ label: 'passive leak', status: 'explicit' as const },
					{ label: 'reset + timer', status: 'explicit' as const },
					{ label: 'spike waveform', status: 'unavailable' as const }
				];
			case 'izhikevich':
				return [
					{ label: 'adaptation', status: 'phenomenological' as const },
					{ label: 'hybrid reset', status: 'explicit' as const },
					{ label: 'ion gates', status: 'unavailable' as const }
				];
			case 'fitzhugh-nagumo':
				return [
					{ label: 'recovery variable', status: 'explicit' as const },
					{ label: 'refractory recovery', status: 'emergent' as const },
					{ label: 'physical voltage', status: 'unavailable' as const }
				];
			case 'hodgkin-huxley':
				return [
					{ label: 'ion gates', status: 'explicit' as const },
					{ label: 'refractory recovery', status: 'emergent' as const },
					{ label: 'sodium burden', status: 'defined' as const }
				];
		}
	}

	function primaryValues(modelId: ModelId): ArrayLike<number> {
		return (
			displayResult?.traces[modelId].channels[MODEL_PRESENTATION[modelId].primaryChannel] ?? []
		);
	}

	function sampleIndexForTime(nextResult: SimulationResult | null, timeMs: number) {
		if (!nextResult || nextResult.timeMs.length === 0) return 0;
		const fraction = Math.max(0, Math.min(1, timeMs / Math.max(nextResult.durationMs, 1)));
		return Math.round(fraction * (nextResult.timeMs.length - 1));
	}

	function channelValue(modelId: ModelId, channel: string, index = cursorIndex) {
		const value = displayResult?.traces[modelId].channels[channel]?.[index];
		return value !== undefined && Number.isFinite(value) ? value : undefined;
	}

	function buildDataRows(): DataViewRow[] {
		if (!displayResult) return [];
		return MODEL_IDS.map((modelId) => {
			const trace = displayResult!.traces[modelId];
			const current: Record<string, string | number | null | undefined> = {
				'native input': trace.nativeInput[cursorIndex]
			};
			if (modelId === 'mcculloch-pitts') {
				current.output = channelValue(modelId, 'output') === 1 ? 'ON' : 'OFF';
				current['physical voltage'] = 'not represented';
			} else if (modelId === 'lif') {
				current['voltage (mV)'] = channelValue(modelId, 'voltageMv');
				current['refractory remaining (ms)'] = channelValue(modelId, 'refractoryRemainingMs');
			} else if (modelId === 'izhikevich') {
				current['v (phenomenological mV)'] = channelValue(modelId, 'voltageMv');
				current.u = channelValue(modelId, 'recovery');
			} else if (modelId === 'fitzhugh-nagumo') {
				current['v (dimensionless)'] = channelValue(modelId, 'fast');
				current['w (dimensionless)'] = channelValue(modelId, 'recovery');
			} else {
				current['V (mV)'] = channelValue(modelId, 'voltageMv');
				current.m = channelValue(modelId, 'm');
				current.h = channelValue(modelId, 'h');
				current.n = channelValue(modelId, 'n');
				current['INa (µA/cm²)'] = channelValue(modelId, 'sodiumCurrentUaPerCm2');
			}
			return {
				id: modelId,
				label: MODEL_DEFINITIONS[modelId].display.name,
				current,
				metrics: {
					'spike/event count': trace.metrics.spikeCount,
					'first event (ms)': trace.metrics.firstSpikeTimeMs,
					'last event (ms)': trace.metrics.lastSpikeTimeMs,
					minimum: trace.metrics.minimumPrimary,
					maximum: trace.metrics.maximumPrimary
				}
			};
		});
	}

	function buildRecoveryRows(): RecoveryRow[] {
		const secondOnset = 100 + isiMs;
		const secondWindowEnd = secondOnset + 30;
		const secondEvents = (modelId: ModelId) =>
			displayResult?.traces[modelId].events.filter(
				(event) => event.timeMs >= secondOnset && event.timeMs <= secondWindowEnd
			).length ?? 0;
		const secondIndex = sampleIndexForTime(displayResult, secondOnset);
		return [
			{
				id: 'mcculloch-pitts',
				name: 'McCulloch–Pitts',
				kind: 'absent',
				mechanism: 'No internal refractory state in this single logical unit.',
				state:
					channelValue('mcculloch-pitts', 'output', secondIndex) === 1
						? 'binary state ON'
						: 'binary state OFF',
				secondPulse: `${secondEvents('mcculloch-pitts')} new rising edge(s)`
			},
			{
				id: 'lif',
				name: 'LIF',
				kind: 'explicit',
				mechanism: 'A fixed timer holds voltage at reset after an event.',
				state: `${formatNumber(channelValue('lif', 'refractoryRemainingMs', secondIndex))} ms remaining`,
				secondPulse: eventResponse(secondEvents('lif'))
			},
			{
				id: 'izhikevich',
				name: 'Izhikevich',
				kind: 'phenomenological',
				mechanism: 'Reset and the evolving recovery variable u shape readiness.',
				state: `u = ${formatNumber(channelValue('izhikevich', 'recovery', secondIndex))}`,
				secondPulse: eventResponse(secondEvents('izhikevich'))
			},
			{
				id: 'fitzhugh-nagumo',
				name: 'FitzHugh–Nagumo',
				kind: 'emergent',
				mechanism: 'The slow variable w carries the trajectory back through phase space.',
				state: `w = ${formatNumber(channelValue('fitzhugh-nagumo', 'recovery', secondIndex))}`,
				secondPulse: eventResponse(secondEvents('fitzhugh-nagumo'))
			},
			{
				id: 'hodgkin-huxley',
				name: 'Hodgkin–Huxley',
				kind: 'emergent',
				mechanism: 'Sodium availability h and potassium activation n recover continuously.',
				state: `h ${formatNumber(channelValue('hodgkin-huxley', 'h', secondIndex))}, n ${formatNumber(channelValue('hodgkin-huxley', 'n', secondIndex))}`,
				secondPulse: eventResponse(secondEvents('hodgkin-huxley'))
			}
		];
	}

	function eventResponse(count: number) {
		return count > 0 ? `${count} event${count === 1 ? '' : 's'} after onset` : 'no event in 30 ms';
	}

	function buildFhnPhase() {
		const fast = displayResult?.traces['fitzhugh-nagumo'].channels.fast ?? [];
		const recovery = displayResult?.traces['fitzhugh-nagumo'].channels.recovery ?? [];
		const parameters = {
			...DEFAULT_MODEL_PARAMETERS['fitzhugh-nagumo'],
			timeScaleMs: fhnTimeScaleMs
		};
		const input = gains['fitzhugh-nagumo'] * currentCommand;
		const vNullcline: { v: number; w: number }[] = [];
		const wNullcline: { v: number; w: number }[] = [];
		for (let index = 0; index <= 100; index += 1) {
			const v = -2.5 + (5 * index) / 100;
			vNullcline.push({ v, w: v - (v * v * v) / 3 + input });
			wNullcline.push({ v, w: (v + parameters.a) / parameters.b });
		}
		return {
			fast,
			recovery,
			vNullcline,
			wNullcline,
			currentPoint: {
				v: Number(fast[cursorIndex] ?? 0),
				w: Number(recovery[cursorIndex] ?? 0)
			}
		};
	}

	function buildBenchmarkRows(): BenchmarkRow[] {
		const rows: BenchmarkRow[] = MODEL_IDS.map((modelId) => ({
			name: MODEL_DEFINITIONS[modelId].display.name,
			stateVariables: MODEL_DEFINITIONS[modelId].stateVariableCount,
			derivativeEvaluations: MODEL_DEFINITIONS[modelId].derivativeEvaluationsPerStep
		}));
		if (benchmark) {
			rows.push({
				name: 'Five-model combined Worker run',
				stateVariables: MODEL_IDS.reduce(
					(total, modelId) => total + MODEL_DEFINITIONS[modelId].stateVariableCount,
					0
				),
				derivativeEvaluations: MODEL_IDS.reduce(
					(total, modelId) => total + MODEL_DEFINITIONS[modelId].derivativeEvaluationsPerStep,
					0
				),
				medianMs: benchmark.combinedMedianMs
			});
		}
		return rows;
	}

	function formatNumber(value: number | undefined) {
		return value === undefined ? 'unavailable' : value.toFixed(3);
	}

	function handleWorkerResponse(response: NeuronZooWorkerResponse) {
		switch (response.type) {
			case 'READY':
				status = 'Worker ready. Computing the shared experiment…';
				break;
			case 'SNAPSHOT': {
				const nextCursor = preserveCursorAfterCompute
					? Math.min(cursorMs, response.result.durationMs)
					: 0;
				result = response.result;
				lastValidResult = response.result;
				cursorMs = nextCursor;
				busy = false;
				warning = response.result.dtMs === 0.1 ? '0.1 ms is a coarse, accuracy-limited step.' : '';
				status = `Ready. Command ${response.result.commandHash}; ${response.result.stepCount.toLocaleString()} fixed steps.`;
				preserveCursorAfterCompute = false;
				if (pendingResume) {
					pendingResume = false;
					startPlayback();
				}
				break;
			}
			case 'BENCHMARK_RESULT':
				benchmark = response.benchmark;
				status = `Computer-cost benchmark: ${response.benchmark.combinedMedianMs.toFixed(2)} ms median for the five-model run on this device.`;
				break;
			case 'WARNING':
				warning = response.message;
				status = response.message;
				break;
			case 'ERROR':
				busy = false;
				playing = false;
				warning = response.message;
				status = `Simulation paused: ${response.message}`;
				break;
			case 'FRAME':
			case 'METRICS':
				break;
		}
	}

	function compute({
		preserveCursor = false,
		resume = false
	}: { preserveCursor?: boolean; resume?: boolean } = {}) {
		cancelPlayback();
		busy = true;
		warning = dtMs === 0.1 ? '0.1 ms is a coarse, accuracy-limited step.' : '';
		status = 'Computing one shared-clock experiment…';
		preserveCursorAfterCompute = preserveCursor;
		pendingResume = resume;
		updateUrlState();

		if (workerClient) {
			workerClient.setConfig(simulationConfig());
			workerClient.run();
			return;
		}

		try {
			const next = runSimulation(simulationConfig());
			handleWorkerResponse({
				protocolVersion: 1,
				requestId: 0,
				runId: 0,
				type: 'SNAPSHOT',
				result: next
			});
			workerAvailable = false;
			warning =
				'Module Worker unavailable; a bounded synchronous fallback computed this finite run.';
		} catch (error) {
			busy = false;
			playing = false;
			warning = error instanceof Error ? error.message : 'Simulation failed.';
			status = `Simulation paused: ${warning}`;
		}
	}

	function scheduleCompute(options: { preserveCursor?: boolean; resume?: boolean } = {}) {
		if (recomputeTimer) clearTimeout(recomputeTimer);
		recomputeTimer = setTimeout(() => {
			recomputeTimer = null;
			compute(options);
		}, 120);
	}

	function applyPreset(nextPreset: string, nextIsi = isiMs) {
		if (!validPresetIds.has(nextPreset)) return;
		preset = nextPreset as ExperimentPresetId;
		isiMs = nextIsi;
		waveform = generateStimulus(nextPreset as Exclude<ExperimentPresetId, 'custom'>, {
			durationMs,
			dtMs,
			seed,
			isiMs
		});
		compute();
	}

	function handleWaveformChange(next: Float64Array) {
		waveform = next;
		preset = 'custom';
		scheduleCompute();
	}

	function resampleWaveform(source: Float64Array, count: number) {
		if (count === source.length) return new Float64Array(source);
		const target = new Float64Array(count);
		for (let index = 0; index < count; index += 1) {
			const position = (index / Math.max(1, count - 1)) * Math.max(0, source.length - 1);
			const left = Math.floor(position);
			const right = Math.min(source.length - 1, left + 1);
			const fraction = position - left;
			target[index] = (source[left] ?? 0) * (1 - fraction) + (source[right] ?? 0) * fraction;
		}
		return target;
	}

	function applySettings(settings: {
		dtMs?: number;
		durationMs?: number;
		seed?: number;
		gains?: Record<ModelId, number>;
		izhikevichPhenotype?: string;
		fhnTimeScaleMs?: number;
		deltaGAtpKjMol?: number;
		displaySampleMs?: number;
	}) {
		const nextDt = settings.dtMs ?? dtMs;
		const nextDuration = settings.durationMs ?? durationMs;
		const gridChanged = nextDt !== dtMs || nextDuration !== durationMs;
		const nextSeed = settings.seed ?? seed;
		const seedChanged = nextSeed !== seed;

		dtMs = nextDt;
		durationMs = nextDuration;
		seed = nextSeed;
		if (settings.gains) gains = { ...settings.gains };
		if (settings.izhikevichPhenotype && settings.izhikevichPhenotype in IZHIKEVICH_PHENOTYPES) {
			izhikevichPhenotype = settings.izhikevichPhenotype as IzhikevichPhenotypeId;
		}
		if (settings.fhnTimeScaleMs !== undefined) fhnTimeScaleMs = settings.fhnTimeScaleMs;
		if (settings.deltaGAtpKjMol !== undefined) deltaGAtpKjMol = settings.deltaGAtpKjMol;
		if (settings.displaySampleMs !== undefined) displaySampleMs = settings.displaySampleMs;

		if (gridChanged || seedChanged) {
			if (preset === 'custom') {
				waveform = resampleWaveform(waveform, simulationStepCount(durationMs, dtMs));
			} else {
				waveform = generateStimulus(preset, { durationMs, dtMs, seed, isiMs });
			}
		}
		compute();
	}

	function resetGains() {
		gains = { ...DEFAULT_MODEL_INPUT_GAINS };
		compute();
	}

	function startPlayback() {
		if (!displayResult || busy || !visible || !pageVisible) return;
		if (cursorMs >= durationMs) cursorMs = 0;
		playing = true;
		status = 'Playback running on the fixed scientific clock.';
		previousFrameTime = 0;
		if (!playbackFrame) playbackFrame = requestAnimationFrame(playbackTick);
	}

	function cancelPlayback() {
		playing = false;
		if (playbackFrame) cancelAnimationFrame(playbackFrame);
		playbackFrame = 0;
		previousFrameTime = 0;
	}

	function togglePlayback() {
		if (playing) {
			cancelPlayback();
			workerClient?.pause();
			status = `Paused at ${cursorMs.toFixed(2)} ms.`;
		} else startPlayback();
	}

	function playbackTick(timestamp: number) {
		playbackFrame = 0;
		if (!playing || !visible || !pageVisible) return;
		if (previousFrameTime === 0) previousFrameTime = timestamp;
		const elapsed = Math.min(100, Math.max(0, timestamp - previousFrameTime));
		previousFrameTime = timestamp;
		const previousCursor = cursorMs;
		cursorMs = Math.min(durationMs, cursorMs + elapsed * speed);
		recordLiveInjection(previousCursor, cursorMs);
		if (cursorMs >= durationMs) {
			cancelPlayback();
			status = `Experiment complete at ${durationMs.toLocaleString()} ms.`;
			return;
		}
		playbackFrame = requestAnimationFrame(playbackTick);
	}

	function recordLiveInjection(fromMs: number, toMs: number) {
		if (liveAmplitude === null || mode !== 'inject') return;
		const start = Math.max(0, Math.floor(fromMs / dtMs));
		const end = Math.min(waveform.length - 1, Math.ceil(toMs / dtMs));
		const next = new Float64Array(waveform);
		for (let index = start; index <= end; index += 1) next[index] = liveAmplitude;
		waveform = next;
		preset = 'custom';
		scheduleCompute({ preserveCursor: true, resume: true });
	}

	function handleLiveAmplitude(amplitude: number | null) {
		liveAmplitude = amplitude;
		if (amplitude !== null && !playing) startPlayback();
		if (amplitude === null && preset === 'custom') {
			scheduleCompute({ preserveCursor: true, resume: playing });
		}
	}

	function resetPlayback() {
		cancelPlayback();
		cursorMs = 0;
		workerClient?.reset();
		status = 'Reset to the exact initial state. The computed trace is unchanged.';
	}

	function replay() {
		cancelPlayback();
		cursorMs = 0;
		busy = true;
		pendingResume = true;
		preserveCursorAfterCompute = false;
		status = 'Recomputing the same deterministic experiment for replay…';
		if (workerClient) workerClient.replay();
		else compute({ resume: true });
	}

	function stepOnce() {
		cancelPlayback();
		cursorMs = Math.min(durationMs, cursorMs + dtMs);
		workerClient?.step();
		status = `Advanced exactly one internal step to ${cursorMs.toFixed(3)} ms.`;
	}

	function updateCursor(timeMs: number) {
		cursorMs = Math.max(0, Math.min(durationMs, timeMs));
	}

	function chooseComparison(modelId: string) {
		if (!MODEL_IDS.includes(modelId as ModelId)) return;
		const id = modelId as ModelId;
		if (id === primaryModel) return;
		compareModel = id;
	}

	function choosePrimary(modelId: string) {
		if (!MODEL_IDS.includes(modelId as ModelId)) return;
		const id = modelId as ModelId;
		if (id === primaryModel) return;
		const previousPrimary = primaryModel;
		primaryModel = id;
		if (compareModel === id) compareModel = previousPrimary;
	}

	function enterLaboratory() {
		entered = true;
		requestAnimationFrame(() =>
			bench?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
		);
	}

	function pairedPulse(nextIsi = isiMs) {
		applyPreset('paired-pulse', nextIsi);
	}

	function tryDiscovery(id: number) {
		switch (id) {
			case 1:
				applyPreset('sustained-step');
				focusSection('specimen-wall');
				break;
			case 2:
				isiMs = 6;
				pairedPulse(6);
				focusSection('refractory-inspector');
				break;
			case 3:
				applyPreset('hyperpolarize-release');
				break;
			case 4:
				izhikevichPhenotype = 'chattering';
				applySettings({ izhikevichPhenotype: 'chattering' });
				focusSection('detailed-inspectors');
				break;
			case 5:
				applyPreset('single-pulse');
				focusSection('hh-gates');
				break;
		}
	}

	function focusSection(id: string) {
		requestAnimationFrame(() =>
			document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
		);
	}

	function exportExperiment() {
		const state: SerializedExperimentStateV1 = {
			version: 1,
			preset,
			presetParameters: { isiMs },
			seed,
			durationMs,
			dtMs,
			gains: { ...gains },
			phenotypes: { izhikevich: izhikevichPhenotype },
			modelParameters: currentModelParameters(),
			customWaveform: preset === 'custom' ? Array.from(waveform) : undefined
		};
		const blob = new Blob([serializeExperimentState(state)], { type: 'application/json' });
		const href = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = href;
		link.download = `neuron-zoo-${preset}-${Date.now()}.json`;
		link.click();
		URL.revokeObjectURL(href);
		status = 'Versioned experiment JSON exported.';
	}

	async function importExperiment(file: File) {
		try {
			const state = deserializeExperimentState(await file.text());
			preset = state.preset;
			seed = state.seed;
			durationMs = state.durationMs;
			dtMs = state.dtMs;
			gains = { ...state.gains };
			izhikevichPhenotype = state.phenotypes.izhikevich;
			isiMs = state.presetParameters.isiMs ?? DEFAULT_PAIRED_PULSE_ISI_MS;
			fhnTimeScaleMs =
				state.modelParameters?.['fitzhugh-nagumo']?.timeScaleMs ??
				DEFAULT_FITZHUGH_NAGUMO_PARAMETERS.timeScaleMs;
			waveform = stimulusFromSerializedState(state);
			compute();
			status = `Imported version ${state.version} experiment.`;
		} catch (error) {
			warning = error instanceof Error ? error.message : 'Experiment import failed.';
			status = `Import rejected: ${warning}`;
		}
	}

	function runBenchmark() {
		if (workerClient) {
			status = 'Warming and timing several complete five-model Worker runs…';
			workerClient.runBenchmark(7);
		} else {
			warning = 'Computer-cost benchmark requires the module Worker.';
		}
	}

	function updateUrlState() {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (preset === 'custom') {
			for (const key of ['nzPreset', 'nzDt', 'nzDuration', 'nzSeed', 'nzIsi', 'nzIzh', 'nzGains']) {
				url.searchParams.delete(key);
			}
		} else {
			url.searchParams.set('nzPreset', preset);
			url.searchParams.set('nzDt', String(dtMs));
			url.searchParams.set('nzDuration', String(durationMs));
			url.searchParams.set('nzSeed', String(seed));
			url.searchParams.set('nzIsi', String(isiMs));
			url.searchParams.set('nzIzh', izhikevichPhenotype);
			url.searchParams.set('nzGains', MODEL_IDS.map((modelId) => gains[modelId]).join(','));
		}
		window.history.replaceState(window.history.state, '', url);
	}

	function restoreUrlState() {
		const params = new URL(window.location.href).searchParams;
		const numberParameter = (name: string) => {
			const value = params.get(name);
			return value === null ? Number.NaN : Number(value);
		};
		const savedPreset = params.get('nzPreset');
		const savedDt = numberParameter('nzDt');
		const savedDuration = numberParameter('nzDuration');
		const savedSeed = numberParameter('nzSeed');
		const savedIsi = numberParameter('nzIsi');
		const savedPhenotype = params.get('nzIzh');
		const savedGains = params.get('nzGains')?.split(',').map(Number);
		if (savedPreset && validPresetIds.has(savedPreset as never)) {
			preset = savedPreset as Exclude<ExperimentPresetId, 'custom'>;
		}
		if ((ALLOWED_DT_MS as readonly number[]).includes(savedDt)) dtMs = savedDt;
		if ((ALLOWED_DURATION_MS as readonly number[]).includes(savedDuration)) {
			durationMs = savedDuration;
		}
		if (Number.isInteger(savedSeed) && savedSeed >= 0 && savedSeed <= 4_294_967_295) {
			seed = savedSeed;
		}
		if (Number.isFinite(savedIsi) && savedIsi >= 1 && savedIsi <= 100) isiMs = savedIsi;
		if (savedPhenotype && savedPhenotype in IZHIKEVICH_PHENOTYPES) {
			izhikevichPhenotype = savedPhenotype as IzhikevichPhenotypeId;
		}
		if (savedGains?.length === MODEL_IDS.length && savedGains.every(Number.isFinite)) {
			gains = Object.fromEntries(
				MODEL_IDS.map((modelId, index) => [modelId, savedGains[index]])
			) as ModelInputGains;
		}
		if (preset !== 'custom') {
			waveform = generateStimulus(preset, { durationMs, dtMs, seed, isiMs });
		}
	}

	onMount(() => {
		restoreUrlState();
		reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		pageVisible = document.visibilityState === 'visible';

		const visibilityListener = () => {
			pageVisible = document.visibilityState === 'visible';
			if (!pageVisible && playing) {
				cancelPlayback();
				status = 'Playback paused while the page is hidden; no wall-clock catch-up will occur.';
			}
		};
		document.addEventListener('visibilitychange', visibilityListener);

		const intersectionObserver = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
				if (!visible && playing) {
					cancelPlayback();
					status = 'Playback paused while the laboratory is offscreen.';
				}
			},
			{ rootMargin: '120px' }
		);
		intersectionObserver.observe(laboratory);

		try {
			const worker = new Worker(
				new URL('../../../visualizations/neuron-zoo/worker/neuronZoo.worker.ts', import.meta.url),
				{ type: 'module', name: 'neuron-zoo-simulator' }
			);
			workerClient = new NeuronZooWorkerClient(worker);
			unsubscribeWorker = workerClient.subscribe(handleWorkerResponse);
			workerClient.initialize(simulationConfig());
			workerClient.run();
		} catch {
			workerAvailable = false;
			workerClient = null;
			compute();
		}

		return () => {
			cancelPlayback();
			if (recomputeTimer) clearTimeout(recomputeTimer);
			intersectionObserver.disconnect();
			document.removeEventListener('visibilitychange', visibilityListener);
			unsubscribeWorker?.();
			workerClient?.dispose();
			workerClient = null;
		};
	});
</script>

<section
	bind:this={laboratory}
	class="neuron-zoo article-breakout not-prose"
	aria-labelledby="neuron-zoo-lab-title"
>
	<header class="hero">
		<div class="hero-copy">
			<p class="hero-eyebrow">Interactive computational neuroscience</p>
			<h2 id="neuron-zoo-lab-title">The Neuron Zoo</h2>
			<p class="subtitle">From Leaky Buckets to Hodgkin–Huxley</p>
			<p class="thesis">
				Send exactly the same normalized command into five neuron models and watch what each
				simplification keeps, invents, approximates, or throws overboard.
			</p>
			<div class="hero-actions">
				<button type="button" class="enter" onclick={enterLaboratory}>
					{entered ? 'Return to the stimulus bench' : 'Enter the laboratory'}
				</button>
				<span>One current command. Five levels of biological detail.</span>
			</div>
		</div>
		<div class="hero-specimens" aria-label="Five models in conceptual order">
			{#each specimens as specimen, index (specimen.id)}
				<div style:--model-color={specimen.color}>
					<span>{String(index + 1).padStart(2, '0')}</span>
					<strong>{specimen.abbreviation}</strong>
					<small>{specimen.year}</small>
				</div>
			{/each}
		</div>
	</header>

	<div class="laboratory-body" bind:this={bench}>
		<div class="status-row">
			<p role="status" aria-live="polite">{status}</p>
			<div class="invariants" aria-label="Scientific invariants">
				<span>same s[k]</span>
				<span>one clock</span>
				<span>native axes</span>
				<span>{workerAvailable ? 'module Worker' : 'bounded fallback'}</span>
			</div>
		</div>

		<TransportControls
			{playing}
			{busy}
			timeMs={cursorMs}
			{durationMs}
			{dtMs}
			{speed}
			{preset}
			presets={presetOptions}
			{mode}
			onplaypause={togglePlayback}
			onreset={resetPlayback}
			onreplay={replay}
			onstep={stepOnce}
			onpreset={applyPreset}
			onspeed={(nextSpeed) => (speed = nextSpeed)}
			onmode={(nextMode) => (mode = nextMode)}
		/>

		<StimulusEditor
			{waveform}
			{durationMs}
			{cursorMs}
			{mode}
			disabled={busy}
			onwaveformchange={handleWaveformChange}
			onliveamplitude={handleLiveAmplitude}
		/>

		<div class="shared-contract">
			<div>
				<strong>One source of truth</strong>
				<span>{waveform.length.toLocaleString()} Float64 command samples</span>
			</div>
			<div>
				<strong>Exact fixed clock</strong>
				<span>Δt {dtMs} ms · display {displaySampleMs} ms</span>
			</div>
			<div>
				<strong>Seed</strong>
				<span>{seed.toLocaleString()}</span>
			</div>
			<div>
				<strong>No auto-calibration</strong>
				<span>five visible native gains</span>
			</div>
		</div>

		<section class="discoveries" aria-labelledby="discoveries-heading">
			<div>
				<p class="section-eyebrow">Guided discoveries</p>
				<h3 id="discoveries-heading">Try this</h3>
			</div>
			<div class="discovery-rail">
				<button type="button" onclick={() => tryDiscovery(1)}
					>Hold the same step and compare firing rates.</button
				>
				<button type="button" onclick={() => tryDiscovery(2)}
					>Shorten the paired-pulse interval.</button
				>
				<button type="button" onclick={() => tryDiscovery(3)}
					>Inject a negative current, then release it.</button
				>
				<button type="button" onclick={() => tryDiscovery(4)}
					>Switch the Izhikevich phenotype.</button
				>
				<button type="button" onclick={() => tryDiscovery(5)}
					>Watch sodium inactivation during an HH spike.</button
				>
			</div>
		</section>

		<AdvancedSettings
			{dtMs}
			{durationMs}
			{seed}
			{gains}
			{izhikevichPhenotype}
			{fhnTimeScaleMs}
			{deltaGAtpKjMol}
			{displaySampleMs}
			{warning}
			onchange={applySettings}
			onresetgains={resetGains}
			onexport={exportExperiment}
			onimport={importExperiment}
			onbenchmark={runBenchmark}
		/>

		<section id="specimen-wall" class="specimen-wall" aria-labelledby="specimen-wall-heading">
			<div class="section-heading">
				<div>
					<p class="section-eyebrow">Five mathematical animals</p>
					<h3 id="specimen-wall-heading">The comparison wall</h3>
				</div>
				<div class="mobile-compare">
					<label>
						<span>Primary</span>
						<select
							value={primaryModel}
							onchange={(event) => choosePrimary(event.currentTarget.value)}
						>
							{#each MODEL_IDS as modelId (modelId)}
								<option value={modelId}>{MODEL_DEFINITIONS[modelId].display.name}</option>
							{/each}
						</select>
					</label>
					<label>
						<span>Compare with</span>
						<select
							value={compareModel}
							onchange={(event) => chooseComparison(event.currentTarget.value)}
						>
							{#each MODEL_IDS.filter((modelId) => modelId !== primaryModel) as modelId (modelId)}
								<option value={modelId}>{MODEL_DEFINITIONS[modelId].display.name}</option>
							{/each}
						</select>
					</label>
				</div>
			</div>

			<div class="model-gallery">
				{#each specimens as specimen (specimen.id)}
					<div
						class="gallery-card"
						class:mobile-hidden={specimen.id !== primaryModel && specimen.id !== compareModel}
					>
						<ModelCard
							{specimen}
							values={primaryValues(specimen.id)}
							{durationMs}
							events={displayResult?.traces[specimen.id].events ?? []}
							{cursorMs}
							threshold={MODEL_PRESENTATION[specimen.id].threshold}
							selected={specimen.id === primaryModel || specimen.id === compareModel}
							onselect={chooseComparison}
							oncursor={updateCursor}
						/>
					</div>
				{/each}
			</div>
		</section>

		<section class="scope" aria-labelledby="scope-heading">
			<div class="section-heading">
				<div>
					<p class="section-eyebrow">One horizontal time scale</p>
					<h3 id="scope-heading">Synchronized scope</h3>
				</div>
				<p>The white cursor reports one simulation time across unlike, separately labelled axes.</p>
			</div>

			<TracePlot
				label="Shared normalized command"
				unit="unitless s(t)"
				values={displayResult?.displayCommand ?? waveform}
				{durationMs}
				yMin={-1}
				yMax={1}
				{cursorMs}
				color="#f4d58d"
				dash={[5, 4]}
				oncursor={updateCursor}
			/>

			<div class="scope-traces">
				{#each specimens as specimen (specimen.id)}
					<TracePlot
						label={specimen.name}
						unit={specimen.primaryUnit}
						values={primaryValues(specimen.id)}
						{durationMs}
						yMin={specimen.yMin}
						yMax={specimen.yMax}
						events={displayResult?.traces[specimen.id].events ?? []}
						{cursorMs}
						color={specimen.color}
						dash={specimen.dash}
						threshold={MODEL_PRESENTATION[specimen.id].threshold}
						oncursor={updateCursor}
					/>
				{/each}
			</div>

			<SpikeRaster
				rows={specimens.map((specimen) => ({
					id: specimen.id,
					label: specimen.name,
					events: displayResult?.traces[specimen.id].events ?? [],
					color: specimen.color,
					marker: MODEL_PRESENTATION[specimen.id].marker
				}))}
				{durationMs}
				{cursorMs}
				stepMs={dtMs}
				oncursor={updateCursor}
			/>
		</section>

		<DataView
			timeMs={cursorMs}
			command={currentCommand}
			commandUnit="unitless s(t)"
			rows={dataRows}
			caption="Values at the synchronized time cursor"
		/>

		<section id="detailed-inspectors" class="details-grid" aria-labelledby="details-heading">
			<div class="section-heading full">
				<div>
					<p class="section-eyebrow">Variables behind the primary trace</p>
					<h3 id="details-heading">Detailed inspectors</h3>
				</div>
			</div>

			<article>
				<h4>Izhikevich recovery</h4>
				<TracePlot
					label="Recovery variable u"
					unit="model state"
					values={displayResult?.traces.izhikevich.channels.recovery ?? []}
					{durationMs}
					yMin={-25}
					yMax={25}
					{cursorMs}
					color={MODEL_PRESENTATION.izhikevich.color}
					dash={[2, 5]}
					oncursor={updateCursor}
				/>
				<EquationPanel
					title="Hybrid reset"
					plainText="dv/dt = 0.04v² + 5v + 140 − u + I; du/dt = a(bv − u); at v ≥ 30, v ← c and u ← u + d."
				/>
			</article>

			<article>
				<h4>FitzHugh–Nagumo phase plane</h4>
				<PhasePlane
					v={fhnPhase.fast}
					w={fhnPhase.recovery}
					vNullcline={fhnPhase.vNullcline}
					wNullcline={fhnPhase.wNullcline}
					currentPoint={fhnPhase.currentPoint}
					{durationMs}
					{cursorMs}
					oncursor={updateCursor}
				/>
				<p class="inspector-note">
					The cubic nullcline uses the current command sample; v and w are dimensionless.
				</p>
			</article>

			<article id="hh-gates">
				<h4>Hodgkin–Huxley gates</h4>
				<HodgkinHuxleyGates
					m={displayResult?.traces['hodgkin-huxley'].channels.m ?? []}
					h={displayResult?.traces['hodgkin-huxley'].channels.h ?? []}
					n={displayResult?.traces['hodgkin-huxley'].channels.n ?? []}
					{durationMs}
					{cursorMs}
					oncursor={updateCursor}
				/>
				<div class="current-plots">
					<TracePlot
						label="Sodium current INa"
						unit="µA/cm², outward-positive"
						values={displayResult?.traces['hodgkin-huxley'].channels.sodiumCurrentUaPerCm2 ?? []}
						{durationMs}
						yMin={-800}
						yMax={200}
						{cursorMs}
						color="#73b7c8"
						oncursor={updateCursor}
					/>
					<TracePlot
						label="Potassium current IK"
						unit="µA/cm², outward-positive"
						values={displayResult?.traces['hodgkin-huxley'].channels.potassiumCurrentUaPerCm2 ?? []}
						{durationMs}
						yMin={-100}
						yMax={800}
						{cursorMs}
						color="#e9b44c"
						dash={[8, 4]}
						oncursor={updateCursor}
					/>
				</div>
			</article>
		</section>

		<div id="refractory-inspector">
			<RefractoryInspector
				{isiMs}
				rows={recoveryRows}
				onisi={(nextIsi) => pairedPulse(nextIsi)}
				onactivate={() => pairedPulse()}
			/>
		</div>

		<EnergyInspector
			rawSodiumChargeNcCm2={displayResult?.energy['hodgkin-huxley'].available
				? displayResult.energy['hodgkin-huxley'].rawInwardSodiumChargeNcPerCm2
				: undefined}
			baselineSodiumChargeNcCm2={displayResult?.energy['hodgkin-huxley'].available
				? displayResult.energy['hodgkin-huxley'].baselineInwardSodiumChargeNcPerCm2
				: undefined}
			excessSodiumChargeNcCm2={displayResult?.energy['hodgkin-huxley'].available
				? displayResult.energy['hodgkin-huxley'].excessInwardSodiumChargeNcPerCm2
				: undefined}
			atpMolesCm2={displayResult?.energy['hodgkin-huxley'].available
				? displayResult.energy['hodgkin-huxley'].atpEquivalentMolesPerCm2
				: undefined}
			atpMoleculesCm2={displayResult?.energy['hodgkin-huxley'].available
				? displayResult.energy['hodgkin-huxley'].atpEquivalentMoleculesPerCm2
				: undefined}
			chemicalWorkJoulesCm2={displayResult?.energy['hodgkin-huxley'].available
				? displayResult.energy['hodgkin-huxley'].atpEquivalentMolesPerCm2 * deltaGAtpKjMol * 1000
				: undefined}
			{deltaGAtpKjMol}
			benchmarks={benchmarkRows}
			onbenchmark={runBenchmark}
		/>

		<ComparisonMatrix />

		<footer class="lab-footer">
			<p>Educational single-compartment comparison · not a medical or diagnostic instrument.</p>
			<p>
				The simulator is deterministic, local, and usable after page assets load. It makes no API
				call and requires no model response, chat session, or network service.
			</p>
		</footer>
	</div>
</section>

<style>
	.neuron-zoo {
		--zoo-bg: #07090d;
		--zoo-surface: #0d1118;
		--zoo-rule: #29303a;
		--zoo-text: #edf1f5;
		--zoo-muted: #9aa4b2;
		position: relative;
		width: min(96rem, calc(100vw - 1rem));
		transform: translateX(-50%);
		margin: 3rem 0;
		overflow: hidden;
		border: 1px solid #242b34;
		border-radius: 1rem;
		background: var(--zoo-bg);
		color: var(--zoo-text);
		box-shadow: 0 30px 90px -45px rgb(0 0 0 / 0.95);
	}
	.hero {
		display: grid;
		min-height: min(42rem, 80vh);
		grid-template-columns: minmax(0, 1.15fr) minmax(22rem, 0.85fr);
		align-items: center;
		gap: clamp(2rem, 5vw, 6rem);
		padding: clamp(2rem, 6vw, 7rem);
		background:
			linear-gradient(90deg, rgb(7 9 13 / 1) 0%, rgb(7 9 13 / 0.88) 50%, rgb(7 9 13 / 0.98)),
			radial-gradient(circle at 75% 42%, rgb(115 183 200 / 0.12), transparent 34%);
	}
	.hero-eyebrow,
	.section-eyebrow {
		margin: 0 0 0.6rem;
		color: #f4d58d;
		font-size: 0.7rem;
		font-weight: 850;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.hero h2 {
		max-width: 9ch;
		margin: 0;
		color: #fff;
		font-size: clamp(3.6rem, 9vw, 8rem);
		font-weight: 850;
		letter-spacing: -0.065em;
		line-height: 0.85;
	}
	.subtitle {
		margin: 1.2rem 0 0;
		color: #d9dde4;
		font:
			clamp(1.15rem, 2.5vw, 2rem)/1.25 Georgia,
			'Times New Roman',
			serif;
	}
	.thesis {
		max-width: 44rem;
		margin: 1.5rem 0 0;
		color: #aeb7c4;
		font-size: clamp(0.92rem, 1.5vw, 1.1rem);
		line-height: 1.65;
	}
	.hero-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 2rem;
	}
	.hero-actions span {
		max-width: 19rem;
		color: #8f99a8;
		font-size: 0.72rem;
		line-height: 1.4;
	}
	button,
	select {
		font: inherit;
	}
	.enter {
		min-height: 3rem;
		border: 1px solid #f4d58d;
		border-radius: 0.45rem;
		background: #f4d58d;
		padding: 0.75rem 1rem;
		color: #16130b;
		font-size: 0.8rem;
		font-weight: 850;
		cursor: pointer;
	}
	.enter:focus-visible,
	.discovery-rail button:focus-visible,
	select:focus-visible {
		outline: 3px solid #fff;
		outline-offset: 3px;
	}
	.hero-specimens {
		display: grid;
		gap: 0.65rem;
		border-left: 1px solid #2b323b;
		padding-left: clamp(1rem, 3vw, 2rem);
	}
	.hero-specimens div {
		display: grid;
		grid-template-columns: 2.2rem 3.5rem 1fr;
		align-items: baseline;
		gap: 0.75rem;
		border-bottom: 1px solid #222933;
		padding: 0.75rem 0;
	}
	.hero-specimens span,
	.hero-specimens small {
		color: #707a88;
		font:
			0.65rem/1 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
	}
	.hero-specimens strong {
		color: var(--model-color);
		font:
			850 clamp(1rem, 2vw, 1.55rem)/1 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
	}
	.laboratory-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
		border-top: 1px solid #242b34;
		padding: clamp(0.75rem, 2.5vw, 2rem);
		scroll-margin-top: 1rem;
	}
	.status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.status-row > p {
		margin: 0;
		color: var(--zoo-muted);
		font-size: 0.72rem;
	}
	.invariants {
		display: flex;
		flex-wrap: wrap;
		justify-content: end;
		gap: 0.35rem;
	}
	.invariants span {
		border: 1px solid #303743;
		border-radius: 999px;
		padding: 0.3rem 0.45rem;
		color: #aeb7c4;
		font-size: 0.6rem;
		font-weight: 750;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.shared-contract {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1px;
		overflow: hidden;
		border: 1px solid #29303a;
		border-radius: 0.6rem;
		background: #29303a;
	}
	.shared-contract div {
		display: grid;
		gap: 0.25rem;
		background: #0d1118;
		padding: 0.75rem;
	}
	.shared-contract strong {
		color: #eef1f5;
		font-size: 0.7rem;
	}
	.shared-contract span {
		color: #8f99a8;
		font:
			0.64rem/1.4 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
	}
	.discoveries,
	.section-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}
	.discoveries {
		border-top: 1px solid #29303a;
		border-bottom: 1px solid #29303a;
		padding: 1rem 0;
	}
	.discoveries h3,
	.section-heading h3 {
		margin: 0;
		color: #fff;
		font-size: 1.15rem;
	}
	.discovery-rail {
		display: flex;
		max-width: 75%;
		gap: 0.45rem;
		overflow-x: auto;
		scroll-snap-type: x proximity;
	}
	.discovery-rail button {
		min-height: 2.75rem;
		flex: 0 0 13rem;
		border: 1px solid #343c48;
		border-radius: 0.45rem;
		background: #11161e;
		padding: 0.55rem 0.7rem;
		color: #d6dce4;
		font-size: 0.68rem;
		line-height: 1.35;
		text-align: left;
		cursor: pointer;
		scroll-snap-align: start;
	}
	.section-heading > p {
		max-width: 32rem;
		margin: 0;
		color: #939dab;
		font-size: 0.7rem;
		line-height: 1.5;
	}
	.specimen-wall,
	.scope {
		display: grid;
		gap: 0.9rem;
		scroll-margin-top: 1rem;
	}
	.mobile-compare {
		display: flex;
		gap: 0.6rem;
	}
	.mobile-compare label {
		display: grid;
		gap: 0.25rem;
		color: #8f99a8;
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.mobile-compare select {
		min-height: 2.75rem;
		max-width: 13rem;
		border: 1px solid #343c48;
		border-radius: 0.45rem;
		background: #11161e;
		padding: 0.45rem;
		color: #e4e9ef;
		font-size: 0.68rem;
	}
	.model-gallery {
		display: grid;
		grid-template-columns: repeat(5, minmax(17rem, 1fr));
		gap: 0.65rem;
		overflow-x: auto;
		padding: 0.2rem;
		scroll-snap-type: x proximity;
	}
	.gallery-card {
		display: contents;
	}
	.scope {
		border-top: 1px solid #29303a;
		padding-top: 1.25rem;
	}
	.scope-traces {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.details-grid {
		display: grid;
		grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.35fr);
		gap: 0.7rem;
		scroll-margin-top: 1rem;
	}
	.details-grid .full {
		grid-column: 1 / -1;
	}
	.details-grid > article {
		min-width: 0;
		border: 1px solid #2d3440;
		border-radius: 0.7rem;
		background: #0d1118;
		padding: 0.8rem;
	}
	.details-grid h4 {
		margin: 0 0 0.7rem;
		color: #fff;
		font-size: 0.9rem;
	}
	.current-plots {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.45rem;
		margin-top: 0.55rem;
	}
	.inspector-note {
		margin: 0.5rem 0 0;
		color: #8f99a8;
		font-size: 0.68rem;
		line-height: 1.45;
	}
	.lab-footer {
		display: flex;
		justify-content: space-between;
		gap: 2rem;
		border-top: 1px solid #29303a;
		padding-top: 1rem;
	}
	.lab-footer p {
		max-width: 42rem;
		margin: 0;
		color: #7f8997;
		font-size: 0.67rem;
		line-height: 1.5;
	}
	@media (max-width: 78rem) {
		.hero {
			min-height: auto;
			grid-template-columns: 1fr;
		}
		.hero h2 {
			max-width: none;
		}
		.hero-specimens {
			grid-template-columns: repeat(5, minmax(0, 1fr));
			border-top: 1px solid #2b323b;
			border-left: 0;
			padding-top: 1rem;
			padding-left: 0;
		}
		.hero-specimens div {
			grid-template-columns: 1fr;
		}
		.scope-traces {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.details-grid {
			grid-template-columns: 1fr 1fr;
		}
		.details-grid > article:last-child {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 48rem) {
		.neuron-zoo {
			width: calc(100vw - 0.5rem);
			border-radius: 0.65rem;
		}
		.hero {
			gap: 2.5rem;
			padding: 2.5rem 1rem;
		}
		.hero h2 {
			font-size: clamp(3.7rem, 21vw, 6.4rem);
		}
		.hero-specimens {
			display: flex;
			overflow-x: auto;
		}
		.hero-specimens div {
			min-width: 7rem;
		}
		.hero-actions,
		.status-row,
		.discoveries,
		.section-heading,
		.lab-footer {
			align-items: stretch;
			flex-direction: column;
		}
		.shared-contract {
			grid-template-columns: 1fr 1fr;
		}
		.discovery-rail {
			max-width: none;
		}
		.mobile-compare {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
		.mobile-compare select {
			width: 100%;
			max-width: none;
		}
		.model-gallery {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			overflow: visible;
		}
		.gallery-card {
			display: block;
			min-width: 0;
		}
		.gallery-card.mobile-hidden {
			display: none;
		}
		.scope-traces,
		.details-grid,
		.current-plots {
			grid-template-columns: 1fr;
		}
		.details-grid > article:last-child {
			grid-column: auto;
		}
	}
	@media (max-width: 34rem) {
		.model-gallery {
			grid-template-columns: 1fr;
		}
		.shared-contract {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}
	@media print {
		.neuron-zoo {
			width: 100%;
			transform: none;
			border: 1px solid #666;
			background: #fff;
			color: #111;
			box-shadow: none;
		}
		.hero {
			min-height: auto;
			background: #fff;
		}
		.laboratory-body {
			display: none;
		}
	}
</style>
