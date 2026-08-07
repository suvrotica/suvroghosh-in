<script lang="ts">
	import { onMount, tick } from 'svelte';
	import CounterfactualCompare from './CounterfactualCompare.svelte';
	import NumericalHonesty from './NumericalHonesty.svelte';
	import ReactionDiffusionStage, { type StageFrame } from './ReactionDiffusionStage.svelte';
	import ReactionMicroscope, { type MicroscopeHistorySample } from './ReactionMicroscope.svelte';
	import SpatialSpectrum from './SpatialSpectrum.svelte';
	import StabilityInspector from './StabilityInspector.svelte';
	import {
		DEFAULT_REACTION_DIFFUSION_SETUP,
		MAX_INTERVENTIONS,
		MAX_MEASUREMENT_HISTORY,
		gridSpacing
	} from '$lib/visualizations/reaction-diffusion/constants';
	import {
		assessNumericalStability,
		stepField
	} from '$lib/visualizations/reaction-diffusion/engine';
	import {
		createExperimentRecord,
		experimentMethodsText,
		experimentSummaryText,
		measurementsToCsv,
		serializeExperimentRecord
	} from '$lib/visualizations/reaction-diffusion/exports';
	import { createReactionDiffusionExportCanvas } from '$lib/visualizations/reaction-diffusion/display';
	import {
		calculateChemicalBudget,
		calculateFieldMetrics,
		calculateLocalTermLedger
	} from '$lib/visualizations/reaction-diffusion/metrics';
	import {
		REACTION_DIFFUSION_PRESETS,
		getReactionDiffusionPreset
	} from '$lib/visualizations/reaction-diffusion/presets';
	import { cloneSetup } from '$lib/visualizations/reaction-diffusion/setup';
	import { calculateRadialSpectrum } from '$lib/visualizations/reaction-diffusion/spectrum';
	import {
		findHomogeneousEquilibria,
		scanDispersion
	} from '$lib/visualizations/reaction-diffusion/stability';
	import {
		buildReactionDiffusionShareUrl,
		decodeReactionDiffusionUrlState
	} from '$lib/visualizations/reaction-diffusion/url-state';
	import type {
		BrushShape,
		BrushTarget,
		BrushTool,
		ChemicalBudget,
		DisplayMode,
		FieldMetrics,
		FieldState,
		GrayScottSetup,
		LocalTermLedger,
		MeasurementSample,
		PaletteId,
		SpectrumReading
	} from '$lib/visualizations/reaction-diffusion/types';
	import type { MorphospaceSelection } from './MorphospaceAtlas.svelte';
	import type { SpectrumWorkerClient } from '$lib/visualizations/reaction-diffusion/workers/spectrum-client';
	import type { SpectrumWorkerResponse } from '$lib/visualizations/reaction-diffusion/workers/spectrum-protocol';

	type Panel = 'laboratory' | 'compare' | 'diagnostics' | 'numerics' | 'export';
	type ObservatoryCommand =
		| 'toggle-running'
		| 'reset'
		| 'step'
		| 'radius-down'
		| 'radius-up'
		| 'tool-1'
		| 'tool-2'
		| 'tool-3'
		| 'tool-4'
		| 'cancel';
	type NumericSetupKey =
		| 'feed'
		| 'kill'
		| 'diffusionU'
		| 'diffusionV'
		| 'timestep'
		| 'gridSize'
		| 'domainWidth';
	const MAX_MICROSCOPE_HISTORY = 96;

	let setup = $state<GrayScottSetup>(cloneSetup(DEFAULT_REACTION_DIFFUSION_SETUP));
	let running = $state(false);
	let stepsPerFrame = $state(2);
	let displayMode = $state<DisplayMode>('v');
	let palette = $state<PaletteId>('mineral');
	let selectedPanel = $state<Panel>('laboratory');
	let brushTool = $state<BrushTool>('add-v');
	let brushShape = $state<BrushShape>('soft-disk');
	let brushTarget = $state<BrushTarget>('both');
	let brushRadius = $state(0.045);
	let brushStrength = $state(0.2);
	let brushFalloff = $state(1.5);
	let brushInteractionMode = $state<'inspect' | 'paint'>('inspect');
	let brushApplicationMode = $state<'once' | 'path'>('path');
	let selectedPoint = $state<readonly [number, number]>([0.5, 0.5]);
	let allowUnsafe = $state(false);
	let stage = $state<ReactionDiffusionStage>();
	let comparison = $state<CounterfactualCompare>();
	let frame = $state<StageFrame | null>(null);
	let metrics = $state<FieldMetrics | null>(null);
	let ledger = $state<LocalTermLedger | null>(null);
	let budget = $state<ChemicalBudget | null>(null);
	let spectrum = $state<SpectrumReading | null>(null);
	let spectrumMeasurement = $state<{ step: number; modelTime: number } | null>(null);
	let pendingSpectrumSample: MeasurementSample | null = null;
	let spectrumBusy = $state(false);
	let status = $state('The observatory begins paused so the initial condition can be inspected.');
	let urlIssues = $state<string[]>([]);
	let measurementHistory = $state<MeasurementSample[]>([]);
	let droppedMeasurementSamples = $state(0);
	let microscopeHistory = $state<MicroscopeHistorySample[]>([]);
	let lastMeasurementStep = -1;
	let lastMicroscopeStep = -1;
	let selectedEquilibrium = $state(0);
	let presetId = $state('');
	let spectrumWorker: SpectrumWorkerClient | null = null;
	let unsubscribeSpectrumWorker: (() => void) | null = null;

	let stability = $derived(assessNumericalStability(setup));
	let equilibria = $derived(findHomogeneousEquilibria(setup));
	let dispersionReadings = $derived(
		equilibria.map((equilibrium) => scanDispersion(setup, equilibrium, { samples: 180 }))
	);
	let brush = $derived({
		tool: brushTool,
		shape: brushShape,
		target: brushTarget,
		radius: brushRadius,
		strength: brushStrength,
		falloff: brushFalloff,
		interactionMode: brushInteractionMode,
		applicationMode: brushApplicationMode
	});
	let memoryEstimate = $derived((setup.gridSize * setup.gridSize * 4 * 4 * 5) / 1024 / 1024);
	let fieldDescription = $derived(describeField());

	function describeField() {
		const time = frame?.modelTime.toFixed(1) ?? '0.0';
		const wavelength = spectrum?.trustworthy
			? `${spectrum.dominantWavelength?.toPrecision(4)} model units`
			: 'no trustworthy measured wavelength';
		let trend = 'the selected cell is awaiting a derivative measurement';
		if (ledger) {
			const direction =
				ledger.derivativeV > 0 ? 'gaining' : ledger.derivativeV < 0 ? 'losing' : 'holding';
			const cause =
				Math.abs(ledger.reactionV + ledger.feedRemovalV + ledger.killV) >=
				Math.abs(ledger.diffusionV)
					? 'mainly local reaction and removal'
					: 'mainly diffusion through its neighbours';
			trend = `the selected cell is ${direction} V, ${cause}`;
		}
		return `At model time ${time}, mean V is ${format(metrics?.meanV)} and variance V is ${format(metrics?.varianceV)}. The field has ${wavelength}; ${trend}.`;
	}

	$effect(() => {
		if (stability.state === 'unsafe' && !allowUnsafe && running) {
			running = false;
			status = 'Run paused: opt in explicitly before testing an unsafe diffusion step.';
		}
	});

	$effect(() => {
		setup.feed.toString();
		setup.kill.toString();
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('reaction-diffusion:setup', {
					detail: { feed: setup.feed, kill: setup.kill }
				})
			);
		}
	});

	/** Every setup replacement defines a new numerical experiment and revokes prior unsafe consent. */
	function replaceSetup(next: GrayScottSetup, nextPresetId = '') {
		allowUnsafe = false;
		setup = next;
		presetId = nextPresetId;
	}

	onMount(() => {
		let spectrumWorkerActive = true;
		void import('$lib/visualizations/reaction-diffusion/workers/spectrum-client')
			.then((module) => {
				if (!spectrumWorkerActive) return;
				spectrumWorker = module.createSpectrumWorkerClient();
				unsubscribeSpectrumWorker = spectrumWorker.subscribe(handleSpectrumWorkerResponse);
			})
			.catch(() => {
				// The on-demand canonical main-thread calculation remains available as a last resort.
			});
		const decoded = decodeReactionDiffusionUrlState(
			window.location.href,
			DEFAULT_REACTION_DIFFUSION_SETUP
		);
		const hasSharedState = new URLSearchParams(window.location.search).has('rd_v');
		if (hasSharedState) {
			replaceSetup(decoded.setup);
			clearRunHistories();
			displayMode = decoded.displayMode;
			palette = decoded.palette;
			if (
				['laboratory', 'compare', 'diagnostics', 'numerics', 'export'].includes(
					decoded.selectedPanel
				)
			) {
				selectedPanel = decoded.selectedPanel as Panel;
			}
			urlIssues = [...decoded.issues];
			status = decoded.issues.length
				? 'The shared setup was opened with the adjustments listed below.'
				: 'Versioned setup restored from the address. Hand-painted mature state is not encoded.';
		}
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reducedMotion)
			status = 'Reduced motion is preferred, so the deterministic experiment begins paused.';

		const loadTile = (event: Event) => {
			const detail = (event as CustomEvent<MorphospaceSelection>).detail;
			replaceSetup({ ...setup, feed: detail.feed, kill: detail.kill });
			clearRunHistories();
			selectedPanel = 'laboratory';
			running = false;
			status = `Atlas tile loaded: F=${detail.feed.toFixed(5)}, k=${detail.kill.toFixed(5)}. This laboratory run restarts from its initial condition.`;
			document.getElementById('reaction-diffusion-observatory')?.scrollIntoView({ block: 'start' });
		};
		const compareTile = async (event: Event) => {
			const detail = (event as CustomEvent<MorphospaceSelection>).detail;
			selectedPanel = 'compare';
			await tick();
			comparison?.loadCandidate(detail);
			status =
				'The atlas tile is now counterfactual B, synchronized against the laboratory setup in A.';
			document.getElementById('reaction-diffusion-observatory')?.scrollIntoView({ block: 'start' });
		};
		window.addEventListener('reaction-diffusion:load-tile', loadTile);
		window.addEventListener('reaction-diffusion:compare-tile', compareTile);
		return () => {
			spectrumWorkerActive = false;
			unsubscribeSpectrumWorker?.();
			unsubscribeSpectrumWorker = null;
			spectrumWorker?.dispose();
			spectrumWorker = null;
			window.removeEventListener('reaction-diffusion:load-tile', loadTile);
			window.removeEventListener('reaction-diffusion:compare-tile', compareTile);
		};
	});

	function updateNumber(key: NumericSetupKey, event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(value)) return;
		replaceSetup({ ...setup, [key]: key === 'gridSize' ? Math.round(value) : value });
		clearRunHistories();
		running = false;
		status = 'Physics changed; the field restarted from the named initial condition.';
	}

	function updateEnum(
		key: 'boundary' | 'maskPreset' | 'initialCondition' | 'integrator',
		event: Event
	) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		replaceSetup({ ...setup, [key]: value } as GrayScottSetup);
		clearRunHistories();
		running = false;
		status = 'Experiment geometry or method changed; the exact initial state was rebuilt.';
	}

	function choosePreset(event: Event) {
		const id = (event.currentTarget as HTMLSelectElement).value;
		const preset = getReactionDiffusionPreset(id);
		if (!preset) {
			presetId = '';
			return;
		}
		replaceSetup(cloneSetup(preset), id);
		clearRunHistories();
		running = false;
		status = `${preset.label} loaded. ${preset.conditionalNote}`;
	}

	function toggleRunning() {
		if (stability.state === 'unsafe' && !allowUnsafe) {
			status =
				'This Δt is above the conservative diffusion ceiling. Check the explicit opt-in first.';
			return;
		}
		running = !running;
	}

	function handleStageCommand(command: ObservatoryCommand) {
		if (command === 'toggle-running') toggleRunning();
		else if (command === 'reset') reset();
		else if (command === 'step') stage?.manualStep(1);
		else if (command === 'radius-down') brushRadius = Math.max(0.005, brushRadius - 0.005);
		else if (command === 'radius-up') brushRadius = Math.min(0.18, brushRadius + 0.005);
		else if (command.startsWith('tool-')) {
			const tools: BrushTool[] = ['add-v', 'add-u', 'mixed-pulse', 'restore-feed'];
			brushTool = tools[Math.max(0, Number(command.at(-1)) - 1)] ?? brushTool;
		}
		if (command === 'cancel')
			status = 'Active pointer stroke cancelled; no intervention was recorded.';
	}

	function reset() {
		running = false;
		clearRunHistories();
		stage?.reset();
		status = 'Identical seeded initial state restored; intervention history cleared.';
	}

	function replayInCpuReference() {
		running = false;
		if (stage?.replayInCpuReference?.()) {
			status =
				'Replaying the current setup and step-numbered interventions in the Float64 CPU reference Worker.';
		}
	}

	function handleFrame(next: StageFrame) {
		frame = next;
		if (lastMicroscopeStep >= 0 && next.step < lastMicroscopeStep) {
			clearMicroscopeHistory();
		}
		// A Worker fallback intentionally reduces very large requested grids. Make the
		// effective numerical setup authoritative everywhere (h, μ, telemetry and sharing).
		if (next.field.size !== setup.gridSize) {
			replaceSetup({ ...setup, gridSize: next.field.size });
			status = `The active engine uses ${next.field.size} × ${next.field.size} cells; stability and exported setup now report that effective grid.`;
		}
		const shouldMeasure = next.step === 0 || next.step - lastMeasurementStep >= 12;
		if (!shouldMeasure) return;
		try {
			const measuredSetup = setupForField(next.field);
			metrics = calculateFieldMetrics(next.field);
			// Audit one exact reference step from the sampled field. This supplies a
			// consecutive before/after pair even when the live engine publishes in chunks.
			const auditAfter = stepField(next.field, measuredSetup, { rejectUnsafe: false });
			budget = calculateChemicalBudget(next.field, measuredSetup, auditAfter);
			const maximumResidual = Math.max(
				Math.abs(budget.residualU ?? 0),
				Math.abs(budget.residualV ?? 0)
			);
			if (maximumResidual > 1e-8) {
				status = `Reference budget warning: one-step residual ${maximumResidual.toExponential(3)} exceeds the 1e−8 audit tolerance.`;
			}
			updateLedger(next.field);
			recordSelectedCell(next);
			const measurement: MeasurementSample = {
				...metrics,
				step: next.step,
				modelTime: next.modelTime,
				// A wavelength belongs only to the field on which its FFT was measured.
				// recordSpectrumMeasurement merges that result into the matching step.
				dominantWavelength: null,
				residualU: budget.residualU,
				residualV: budget.residualV,
				comparisonDifference: null
			};
			const nextHistory = [...measurementHistory, measurement];
			if (nextHistory.length > MAX_MEASUREMENT_HISTORY) droppedMeasurementSamples += 1;
			measurementHistory = nextHistory.slice(-MAX_MEASUREMENT_HISTORY);
			lastMeasurementStep = next.step;
		} catch (error) {
			status = `A diagnostic declined the current field: ${error instanceof Error ? error.message : 'invalid data'}`;
		}
	}

	function updateLedger(fieldState = frame?.field) {
		if (!fieldState) return;
		const row = Math.min(
			fieldState.size - 1,
			Math.max(0, Math.floor(selectedPoint[1] * fieldState.size))
		);
		const column = Math.min(
			fieldState.size - 1,
			Math.max(0, Math.floor(selectedPoint[0] * fieldState.size))
		);
		try {
			ledger = calculateLocalTermLedger(fieldState, setupForField(fieldState), row, column);
		} catch {
			ledger = null;
		}
	}

	function selectedCell(fieldState: Readonly<FieldState>, point = selectedPoint) {
		const row = Math.min(fieldState.size - 1, Math.max(0, Math.floor(point[1] * fieldState.size)));
		const column = Math.min(
			fieldState.size - 1,
			Math.max(0, Math.floor(point[0] * fieldState.size))
		);
		return { row, column, index: row * fieldState.size + column };
	}

	function recordSelectedCell(next: StageFrame) {
		const cell = selectedCell(next.field);
		if (!next.field.mask[cell.index]) return;
		const sample: MicroscopeHistorySample = {
			step: next.step,
			modelTime: next.modelTime,
			row: cell.row,
			column: cell.column,
			u: next.field.u[cell.index],
			v: next.field.v[cell.index]
		};
		const latest = microscopeHistory.at(-1);
		if (
			latest &&
			latest.step === sample.step &&
			latest.row === sample.row &&
			latest.column === sample.column
		) {
			microscopeHistory = [...microscopeHistory.slice(0, -1), sample];
		} else {
			microscopeHistory = [...microscopeHistory, sample].slice(-MAX_MICROSCOPE_HISTORY);
		}
		lastMicroscopeStep = next.step;
	}

	function clearMicroscopeHistory() {
		microscopeHistory = [];
		lastMicroscopeStep = -1;
	}

	function clearRunHistories() {
		measurementHistory = [];
		droppedMeasurementSamples = 0;
		lastMeasurementStep = -1;
		clearMicroscopeHistory();
		spectrum = null;
		spectrumMeasurement = null;
		pendingSpectrumSample = null;
		if (spectrumBusy && spectrumWorker) {
			try {
				spectrumWorker.cancel();
			} catch {
				// A failed or already disposed Worker has no stale result left to apply.
			}
		}
		spectrumBusy = false;
	}

	function setupForField(fieldState: Readonly<FieldState>): GrayScottSetup {
		return fieldState.size === setup.gridSize ? setup : { ...setup, gridSize: fieldState.size };
	}

	function choosePoint(point: readonly [number, number]) {
		const previousCell = frame ? selectedCell(frame.field) : null;
		const nextCell = frame ? selectedCell(frame.field, point) : null;
		selectedPoint = point;
		if (
			!previousCell ||
			!nextCell ||
			previousCell.row !== nextCell.row ||
			previousCell.column !== nextCell.column
		) {
			clearMicroscopeHistory();
		}
		updateLedger();
		if (frame) recordSelectedCell(frame);
	}

	function handleStageStatus(message: string, _engine: string, failure: boolean) {
		status = message;
		if (failure) running = false;
	}

	async function measureSpectrum() {
		const current = stage?.snapshot();
		if (!current) {
			status = 'The field is not ready for a spectrum yet.';
			return;
		}
		try {
			pendingSpectrumSample = createSpectrumMeasurementSample(current);
		} catch (error) {
			status = `Spectrum provenance could not be recorded: ${error instanceof Error ? error.message : 'invalid field'}`;
			return;
		}
		spectrumBusy = true;
		await tick();
		if (spectrumWorker) {
			const size = largestPowerOfTwo(current.field.size);
			const inputForWorker = resampleSpectrumInput(
				current.field.v,
				current.field.mask,
				current.field.size,
				size
			);
			spectrumWorker.analyze({
				size,
				domainWidth: setup.domainWidth,
				boundary: setup.boundary,
				field: inputForWorker.field,
				mask: inputForWorker.mask,
				window: 'auto'
			});
			status = `Measuring a ${size} × ${size} two-dimensional FFT in the spectrum Worker.`;
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
		try {
			spectrum = calculateRadialSpectrum(current.field.v, current.field.size, setup.domainWidth, {
				mask: current.field.mask,
				window: setup.boundary === 'periodic' ? 'none' : 'hann'
			});
			recordSpectrumMeasurement(spectrum.dominantWavelength);
			status = spectrum.trustworthy
				? `Measured dominant wavelength ${spectrum.dominantWavelength?.toPrecision(5)} model units at step ${current.step}, model time ${current.modelTime.toPrecision(5)}.`
				: 'Spectrum measured honestly: no non-zero peak passes the prominence and concentration tests.';
		} catch (error) {
			pendingSpectrumSample = null;
			status = `Spectrum calculation failed: ${error instanceof Error ? error.message : 'unknown error'}`;
		} finally {
			spectrumBusy = false;
		}
	}

	function handleSpectrumWorkerResponse(response: SpectrumWorkerResponse) {
		if (response.type === 'SPECTRUM_RESULT') {
			spectrum = {
				bins: Array.from(response.result.q, (q, index) => ({
					q,
					power: response.result.power[index]
				})),
				dominantQ: response.result.dominantQ,
				dominantWavelength: response.result.dominantWavelength,
				domainFraction: response.result.domainFraction,
				prominence: response.result.prominence,
				trustworthy: response.result.trustworthy,
				reason: response.result.reason,
				window: response.result.window
			};
			recordSpectrumMeasurement(spectrum.dominantWavelength);
			spectrumBusy = false;
			status = spectrum.trustworthy
				? `Spectrum Worker measured dominant wavelength ${spectrum.dominantWavelength?.toPrecision(5)} model units at step ${spectrumMeasurement?.step ?? 0}, model time ${spectrumMeasurement?.modelTime.toPrecision(5) ?? '0'}.`
				: 'Spectrum Worker found no non-zero peak that passes the credibility tests; no wavelength was invented.';
		} else if (response.type === 'ERROR') {
			pendingSpectrumSample = null;
			spectrumBusy = false;
			status = `Spectrum Worker declined the field: ${response.message}`;
		} else if (response.type === 'CANCELLED') {
			pendingSpectrumSample = null;
			spectrumBusy = false;
			status = 'Spectrum calculation cancelled.';
		}
	}

	function createSpectrumMeasurementSample(current: StageFrame): MeasurementSample {
		const measuredSetup = setupForField(current.field);
		const measuredMetrics = calculateFieldMetrics(current.field);
		const auditAfter = stepField(current.field, measuredSetup, { rejectUnsafe: false });
		const measuredBudget = calculateChemicalBudget(current.field, measuredSetup, auditAfter);
		return {
			...measuredMetrics,
			step: current.step,
			modelTime: current.modelTime,
			dominantWavelength: null,
			residualU: measuredBudget.residualU,
			residualV: measuredBudget.residualV,
			comparisonDifference: null
		};
	}

	function recordSpectrumMeasurement(dominantWavelength: number | null) {
		const pending = pendingSpectrumSample;
		if (!pending) return;
		const measured = { ...pending, dominantWavelength };
		const existingIndex = measurementHistory.findIndex((sample) => sample.step === measured.step);
		let nextHistory = [...measurementHistory];
		if (existingIndex >= 0) nextHistory[existingIndex] = measured;
		else nextHistory.push(measured);
		nextHistory.sort((first, second) => first.step - second.step);
		if (nextHistory.length > MAX_MEASUREMENT_HISTORY) {
			droppedMeasurementSamples += nextHistory.length - MAX_MEASUREMENT_HISTORY;
			nextHistory = nextHistory.slice(-MAX_MEASUREMENT_HISTORY);
		}
		measurementHistory = nextHistory;
		spectrumMeasurement = { step: measured.step, modelTime: measured.modelTime };
		pendingSpectrumSample = null;
	}

	function largestPowerOfTwo(size: number) {
		let result = 1;
		while (result * 2 <= Math.min(512, size)) result *= 2;
		return Math.max(4, result);
	}

	function resampleSpectrumInput(
		field: Float64Array,
		mask: Uint8Array,
		sourceSize: number,
		targetSize: number
	) {
		if (sourceSize === targetSize) return { field: field.slice(), mask: mask.slice() };
		const outputField = new Float64Array(targetSize * targetSize);
		const outputMask = new Uint8Array(targetSize * targetSize);
		for (let row = 0; row < targetSize; row += 1) {
			const sourceRow = Math.min(
				sourceSize - 1,
				Math.floor(((row + 0.5) * sourceSize) / targetSize)
			);
			for (let column = 0; column < targetSize; column += 1) {
				const sourceColumn = Math.min(
					sourceSize - 1,
					Math.floor(((column + 0.5) * sourceSize) / targetSize)
				);
				const outputIndex = row * targetSize + column;
				const sourceIndex = sourceRow * sourceSize + sourceColumn;
				outputField[outputIndex] = field[sourceIndex];
				outputMask[outputIndex] = mask[sourceIndex];
			}
		}
		return { field: outputField, mask: outputMask };
	}

	function currentRecord() {
		const current = stage?.snapshot();
		if (!current) throw new Error('The field is not ready to export.');
		return createExperimentRecord({
			setup:
				current.field.size === setup.gridSize ? setup : { ...setup, gridSize: current.field.size },
			state: current.field,
			engine: current.engine,
			step: current.step,
			interventions: current.events,
			history: measurementHistory,
			displayMode,
			palette
		});
	}

	function downloadText(filename: string, text: string, type: string) {
		const url = URL.createObjectURL(new Blob([text], { type }));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	function exportJson() {
		try {
			downloadText(
				'reaction-diffusion-experiment.json',
				serializeExperimentRecord(currentRecord()),
				'application/json'
			);
			status = 'Versioned experiment JSON downloaded.';
		} catch (error) {
			status = `JSON export blocked: ${error instanceof Error ? error.message : 'unknown error'}`;
		}
	}

	function exportCsv() {
		try {
			downloadText(
				'reaction-diffusion-measurements.csv',
				measurementsToCsv(measurementHistory),
				'text/csv'
			);
			status = 'Measurement history CSV downloaded.';
		} catch (error) {
			status = `CSV export blocked: ${error instanceof Error ? error.message : 'unknown error'}`;
		}
	}

	async function copyText(text: string, success: string) {
		try {
			await navigator.clipboard.writeText(text);
			status = success;
		} catch {
			status = 'The browser blocked clipboard access. Use the downloadable JSON or CSV instead.';
		}
	}

	function copySummary() {
		try {
			void copyText(
				experimentSummaryText(currentRecord()),
				'Plain-text experiment summary copied.'
			);
		} catch (error) {
			status = `Summary unavailable: ${error instanceof Error ? error.message : 'field not ready'}`;
		}
	}

	function copyMethods() {
		try {
			void copyText(
				experimentMethodsText(currentRecord()),
				'Reproducible methods paragraph copied.'
			);
		} catch (error) {
			status = `Methods unavailable: ${error instanceof Error ? error.message : 'field not ready'}`;
		}
	}

	async function shareSetup(updateAddress = false) {
		try {
			const url = buildReactionDiffusionShareUrl(window.location.href, {
				setup,
				displayMode,
				palette,
				selectedPanel
			});
			if (updateAddress) {
				window.history.replaceState(null, '', url);
				status = 'The address now records the setup only—not the mature hand-painted field.';
			} else
				await copyText(
					url,
					'Versioned setup URL copied. It does not claim to encode the mature field.'
				);
		} catch (error) {
			status = `Setup sharing failed: ${error instanceof Error ? error.message : 'unknown error'}`;
		}
	}

	function exportPng() {
		const current = stage?.snapshot();
		if (!current) {
			status = 'The field is not ready for a PNG.';
			return;
		}
		let canvas: HTMLCanvasElement;
		try {
			const exportSize = Math.max(512, current.field.size);
			canvas = createReactionDiffusionExportCanvas(current.field, setupForField(current.field), {
				mode: displayMode,
				palette,
				diagnosticScale: 12,
				width: exportSize,
				height: exportSize
			});
		} catch (error) {
			status = `PNG render failed: ${error instanceof Error ? error.message : 'export canvas unavailable'}`;
			return;
		}
		canvas.toBlob((blob) => {
			if (!blob) {
				status = 'The browser declined to encode the PNG.';
				return;
			}
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'reaction-diffusion-field.png';
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 0);
			status = 'Current rendered field PNG downloaded.';
		}, 'image/png');
	}

	function updateSeed(event: Event) {
		replaceSetup({
			...setup,
			seed: (event.currentTarget as HTMLInputElement).value.slice(0, 256)
		});
		clearRunHistories();
		running = false;
	}

	function format(value: number | null | undefined, digits = 4) {
		if (value === null || value === undefined || !Number.isFinite(value)) return '—';
		return Math.abs(value) < 1e-4 && value !== 0
			? value.toExponential(2)
			: value.toPrecision(digits);
	}
</script>

<section
	class="observatory"
	id="reaction-diffusion-observatory"
	aria-labelledby="observatory-title"
>
	<header class="masthead">
		<div>
			<p class="eyebrow">Gray–Scott model · fixed-step scientific instrument</p>
			<h2 id="observatory-title">Reaction–Diffusion Observatory</h2>
			<p>
				Two dimensionless concentration fields evolve from explicit equations. Display colour never
				changes the physics, and failed raw states are never made pretty by clamping.
			</p>
		</div>
		<div class="version">
			<span>experiment</span><strong>GS–H2–01</strong><small>schema 1 · five-point Laplacian</small>
		</div>
	</header>

	{#if urlIssues.length}
		<aside class="notice warning" role="status">
			<strong>Shared-setup notes</strong>
			<ul>
				{#each urlIssues as issue (issue)}<li>{issue}</li>{/each}
			</ul>
		</aside>
	{/if}

	<nav class="panel-tabs" aria-label="Observatory instruments">
		{#each [['laboratory', 'Laboratory'], ['compare', 'Compare'], ['diagnostics', 'Diagnostics'], ['numerics', 'Numerical honesty'], ['export', 'Record & export']] as entry (entry[0])}
			<button
				type="button"
				aria-pressed={selectedPanel === entry[0]}
				onclick={() => (selectedPanel = entry[0] as Panel)}>{entry[1]}</button
			>
		{/each}
	</nav>

	<div class="laboratory-grid" hidden={selectedPanel !== 'laboratory'}>
		<div class="field-column">
			<ReactionDiffusionStage
				bind:this={stage}
				{setup}
				{running}
				{stepsPerFrame}
				{displayMode}
				{palette}
				{brush}
				selected={selectedPoint}
				{allowUnsafe}
				description={fieldDescription}
				onframe={handleFrame}
				onstatus={handleStageStatus}
				onselect={choosePoint}
				oncommand={handleStageCommand}
			/>
			<div class="transport" aria-label="Simulation transport controls">
				<button
					type="button"
					class="run"
					onclick={toggleRunning}
					disabled={stability.state === 'unsafe' && !allowUnsafe}
					>{running ? 'Pause' : 'Run'}</button
				>
				<button type="button" onclick={reset}>Reset</button>
				<button type="button" onclick={() => stage?.manualStep(1)}>Single step</button>
				<button type="button" onclick={() => stage?.manualStep(10)}>Step ×10</button>
				<button type="button" onclick={replayInCpuReference}>Replay in CPU reference</button>
				<button
					type="button"
					onclick={() => stage?.undoLastIntervention?.()}
					disabled={!frame?.events.length}>Undo last intervention</button
				>
			</div>
			<details class="shortcuts">
				<summary>Keyboard controls</summary>
				<p>
					With the field focused: Space runs or pauses; R resets; . steps once; arrow keys move the
					selected cell; Enter applies once; [ and ] change brush radius; 1–4 select Add V, Add U,
					Mixed pulse, or Restore feed; Escape cancels an active stroke.
				</p>
			</details>
			<div class="telemetry" aria-label="Live experiment telemetry">
				<div><span>model time</span><strong>{frame?.modelTime.toFixed(2) ?? '0.00'}</strong></div>
				<div><span>step</span><strong>{frame?.step ?? 0}</strong></div>
				<div><span>engine</span><strong>{frame?.engine ?? 'preparing'}</strong></div>
				<div><span>rate</span><strong>{format(frame?.stepsPerSecond, 3)} step/s</strong></div>
				<div><span>mean V</span><strong>{format(metrics?.meanV)}</strong></div>
				<div><span>variance V</span><strong>{format(metrics?.varianceV)}</strong></div>
			</div>
			<details class="run-ledger">
				<summary>
					Current run · {setup.gridSize}² · h {gridSpacing(setup).toPrecision(3)} · μ {stability.mu.toPrecision(
						3
					)}
				</summary>
				<div class="telemetry telemetry-more" aria-label="Complete current-run telemetry">
					<div><span>grid</span><strong>{setup.gridSize} × {setup.gridSize}</strong></div>
					<div><span>domain L</span><strong>{format(setup.domainWidth)} model units</strong></div>
					<div><span>h</span><strong>{gridSpacing(setup).toPrecision(5)}</strong></div>
					<div><span>Δt</span><strong>{setup.timestep.toPrecision(5)}</strong></div>
					<div>
						<span>μ / state</span><strong>{stability.mu.toPrecision(5)} · {stability.state}</strong>
					</div>
					<div><span>boundary</span><strong>{setup.boundary}</strong></div>
					<div><span>seed</span><strong>{setup.seed}</strong></div>
					<div>
						<span>F / k</span><strong>{setup.feed.toFixed(5)} / {setup.kill.toFixed(5)}</strong>
					</div>
					<div>
						<span>Dᵤ / Dᵥ</span><strong
							>{setup.diffusionU.toFixed(4)} / {setup.diffusionV.toFixed(4)}</strong
						>
					</div>
					<div><span>mean U</span><strong>{format(metrics?.meanU)}</strong></div>
					<div><span>mean uv²</span><strong>{format(metrics?.meanReactionRate)}</strong></div>
					<div>
						<span>wavelength</span><strong
							>{spectrum?.dominantWavelength
								? `${format(spectrum.dominantWavelength)} model units`
								: 'none'}</strong
						>
					</div>
					<div>
						<span>equilibrium class</span><strong
							>{dispersionReadings[selectedEquilibrium]?.classification ?? 'none'}</strong
						>
					</div>
					<div>
						<span>events</span><strong>{frame?.events.length ?? 0} / {MAX_INTERVENTIONS}</strong>
					</div>
					<div>
						<span>history</span><strong
							>{measurementHistory.length} retained · {droppedMeasurementSamples} dropped</strong
						>
					</div>
				</div>
			</details>
		</div>

		<aside class="control-deck" aria-label="Reaction–diffusion controls">
			<div class="setup-header">
				<label
					>Calibrated preset
					<select value={presetId} onchange={choosePreset}
						><option value="">Custom setup</option
						>{#each REACTION_DIFFUSION_PRESETS as preset (preset.id)}<option value={preset.id}
								>{preset.label}</option
							>{/each}</select
					>
				</label>
				<label
					>Deterministic seed <input type="text" value={setup.seed} oninput={updateSeed} /></label
				>
			</div>

			<details open>
				<summary>Physics and fixed clock</summary>
				<div class="control-grid">
					<label
						><span>Feed F <output>{setup.feed.toFixed(5)}</output></span><input
							type="range"
							min="0"
							max="0.1"
							step="0.0001"
							value={setup.feed}
							oninput={(event) => updateNumber('feed', event)}
						/><input
							aria-label="Feed F exact value"
							type="number"
							min="0"
							max="0.2"
							step="0.0001"
							value={setup.feed}
							onchange={(event) => updateNumber('feed', event)}
						/></label
					>
					<label
						><span>Kill k <output>{setup.kill.toFixed(5)}</output></span><input
							type="range"
							min="0"
							max="0.08"
							step="0.0001"
							value={setup.kill}
							oninput={(event) => updateNumber('kill', event)}
						/><input
							aria-label="Kill k exact value"
							type="number"
							min="0"
							max="0.2"
							step="0.0001"
							value={setup.kill}
							onchange={(event) => updateNumber('kill', event)}
						/></label
					>
					<label
						><span>D<sub>U</sub> <output>{setup.diffusionU.toFixed(4)}</output></span><input
							type="range"
							min="0"
							max="0.3"
							step="0.002"
							value={setup.diffusionU}
							oninput={(event) => updateNumber('diffusionU', event)}
						/><input
							aria-label="U diffusion exact value"
							type="number"
							min="0"
							max="10"
							step="0.002"
							value={setup.diffusionU}
							onchange={(event) => updateNumber('diffusionU', event)}
						/></label
					>
					<label
						><span>D<sub>V</sub> <output>{setup.diffusionV.toFixed(4)}</output></span><input
							type="range"
							min="0"
							max="0.2"
							step="0.002"
							value={setup.diffusionV}
							oninput={(event) => updateNumber('diffusionV', event)}
						/><input
							aria-label="V diffusion exact value"
							type="number"
							min="0"
							max="10"
							step="0.002"
							value={setup.diffusionV}
							onchange={(event) => updateNumber('diffusionV', event)}
						/></label
					>
					<label
						><span>Δt <output>{setup.timestep.toFixed(4)}</output></span><input
							type="range"
							min="0.01"
							max="2.5"
							step="0.01"
							value={setup.timestep}
							oninput={(event) => updateNumber('timestep', event)}
						/><input
							aria-label="Timestep exact value"
							type="number"
							min="0.0001"
							max="20"
							step="0.01"
							value={setup.timestep}
							onchange={(event) => updateNumber('timestep', event)}
						/></label
					>
					<label
						>Integrator <select
							value={setup.integrator}
							onchange={(event) => updateEnum('integrator', event)}
							><option value="heun">Heun RK2</option><option value="euler">Explicit Euler</option
							></select
						></label
					>
				</div>
				<div class="derived">
					<span
						>D<sub>V</sub>/D<sub>U</sub> = {setup.diffusionU
							? (setup.diffusionV / setup.diffusionU).toFixed(4)
							: 'undefined'}</span
					><span>h = {gridSpacing(setup).toPrecision(4)}</span><span
						>μ = {stability.mu.toPrecision(5)}</span
					>
				</div>
				<div class="stability" data-state={stability.state}>
					<strong>{stability.state}</strong><span
						>{stability.reason} Ceiling μ ≤ {stability.ceiling}.</span
					>
				</div>
				{#if stability.state === 'unsafe'}<label class="unsafe-opt"
						><input
							type="checkbox"
							aria-label="I understand this is an unsafe numerical experiment"
							bind:checked={allowUnsafe}
						/> I understand this is an unsafe numerical experiment; begin paused and do not repair failure.</label
					>{/if}
			</details>

			<details>
				<summary>Domain, boundary, and disturbance</summary>
				<div class="control-grid compact">
					<label
						>Interaction <select bind:value={brushInteractionMode}
							><option value="inspect">Inspect only</option><option value="paint"
								>Paint chemistry</option
							></select
						></label
					>
					<label
						>Application <select
							bind:value={brushApplicationMode}
							disabled={brushInteractionMode === 'inspect'}
							><option value="once">Once per tap</option><option value="path"
								>One path segment per drag</option
							></select
						></label
					>
					<label
						>Resolution <select
							value={setup.gridSize}
							onchange={(event) => updateNumber('gridSize', event)}
							><option value={128}>128 × 128</option><option value={256}>256 × 256</option><option
								value={384}>384 × 384</option
							></select
						></label
					>
					<label
						>Domain width L <input
							type="number"
							min="1"
							max="1024"
							step="1"
							value={setup.domainWidth}
							onchange={(event) => updateNumber('domainWidth', event)}
						/></label
					>
					<label
						>Outer boundary <select
							value={setup.boundary}
							onchange={(event) => updateEnum('boundary', event)}
							><option value="periodic">Periodic seam</option><option value="no-flux"
								>No-flux wall</option
							><option value="reservoir">Feed reservoir U=1,V=0</option></select
						></label
					>
					<label
						>Domain / mask <select
							value={setup.maskPreset}
							onchange={(event) => updateEnum('maskPreset', event)}
							><option value="open-square">Open square</option><option value="circular-vessel"
								>Circular vessel</option
							><option value="narrow-channel">Narrow channel</option><option value="annulus"
								>Annulus</option
							><option value="two-chambers">Two chambers</option><option value="obstacle-field"
								>Obstacle field</option
							></select
						></label
					>
					<label
						>Initial condition <select
							value={setup.initialCondition}
							onchange={(event) => updateEnum('initialCondition', event)}
							><option value="central-soft-disk">Central soft disk</option><option
								value="central-square">Central square</option
							><option value="ring">Ring</option><option value="horizontal-front"
								>Horizontal front</option
							><option value="two-spots">Two separated spots</option><option value="noise-patch"
								>Deterministic noise patch</option
							><option value="sparse-points">Sparse seeded points</option><option value="blank-feed"
								>Blank feed state</option
							><option value="hand-painted">Hand-painted start</option></select
						></label
					>
				</div>
				<p class="small-note">
					L remains independent of N. Changing resolution changes h and therefore the displayed
					stability number.
				</p>
			</details>

			<details>
				<summary>Brush intervention</summary>
				<div class="control-grid compact">
					<label
						>Tool <select bind:value={brushTool}
							><option value="add-v">Add V, consume U</option><option value="add-u"
								>Add U / dilute V</option
							><option value="mixed-pulse">Mixed pulse</option><option value="restore-feed"
								>Restore feed state</option
							><option value="paint-obstacle">Paint obstacle</option><option value="erase-obstacle"
								>Erase obstacle</option
							></select
						></label
					>
					<label
						>Shape <select bind:value={brushShape}
							><option value="soft-disk">Soft disk</option><option value="hard-disk"
								>Hard disk</option
							><option value="ring">Ring</option><option value="line">Line</option></select
						></label
					>
					<label
						>Radius <input
							type="range"
							min="0.005"
							max="0.18"
							step="0.005"
							bind:value={brushRadius}
						/><output>{brushRadius.toFixed(3)} L</output></label
					>
					<label
						>Strength <input
							type="range"
							min="0.01"
							max="0.8"
							step="0.01"
							bind:value={brushStrength}
						/><output>{brushStrength.toFixed(2)}</output></label
					>
					<label
						>Falloff <input
							type="range"
							min="0.2"
							max="4"
							step="0.1"
							bind:value={brushFalloff}
						/><output>{brushFalloff.toFixed(1)}</output></label
					>
				</div>
				<button type="button" class="apply-brush" onclick={() => stage?.applyBrushAtSelection?.()}
					>Apply active brush once at the selected cell</button
				>
				<p class="small-note">
					Inspect mode never changes chemistry. In Paint mode, choose a one-shot tap or a
					deterministic drag segment; the button above / Enter applies once at the selected cell.
					The brush explicitly changes raw concentrations and logs that intervention; repeated
					strokes may leave the nominal display range, and no solver clamp repairs them.
				</p>
			</details>

			<details>
				<summary>Display only</summary>
				<div class="control-grid compact">
					<label
						>Field view <select bind:value={displayMode}
							><option value="v">V concentration</option><option value="u">U concentration</option
							><option value="composite">Two-chemical composite</option><option value="u-minus-v"
								>U − V</option
							><option value="reaction-rate">Reaction rate uv²</option><option value="v-diffusion"
								>V diffusion contribution</option
							><option value="v-derivative">Net ∂v/∂t</option></select
						></label
					>
					<label
						>Palette <select bind:value={palette}
							><option value="mineral">Mineral</option><option value="cividis">Cividis</option
							><option value="high-contrast">High contrast</option><option value="diverging"
								>Signed diverging</option
							></select
						></label
					>
					<label
						>Speed <select bind:value={stepsPerFrame}
							><option value={1}>1 exact step/frame</option><option value={2}
								>2 exact steps/frame</option
							><option value={4}>4 exact steps/frame</option><option value={8}
								>8 exact steps/frame</option
							></select
						></label
					>
				</div>
				<p class="small-note">
					Palette and device-pixel ratio affect pixels only. They never enter the update equations.
				</p>
			</details>
			<p class="memory">
				Estimated GPU working textures: {memoryEstimate.toFixed(1)} MiB before browser overhead. CPU fallback
				is capped to 128².
			</p>
		</aside>
	</div>
	{#if selectedPanel === 'compare'}
		<div class="panel-body"><CounterfactualCompare bind:this={comparison} baseSetup={setup} /></div>
	{:else if selectedPanel === 'diagnostics'}
		<div class="panel-body diagnostics">
			<ReactionMicroscope
				id="reaction-microscope-live"
				{ledger}
				{budget}
				{setup}
				{equilibria}
				history={microscopeHistory}
				title="Live local ledger and global chemical budget"
			/>
			<StabilityInspector
				id="rd-stability-live"
				readings={dispersionReadings}
				selected={selectedEquilibrium}
				onselect={(index) => (selectedEquilibrium = index)}
			/>
			<SpatialSpectrum
				id="rd-spectrum-live"
				reading={spectrum}
				measuredStep={spectrumMeasurement?.step ?? null}
				measuredModelTime={spectrumMeasurement?.modelTime ?? null}
				busy={spectrumBusy}
				onmeasure={measureSpectrum}
			/>
		</div>
	{:else if selectedPanel === 'numerics'}
		<div class="panel-body">
			<NumericalHonesty id="rd-numerical-honesty-live" {setup} />
		</div>
	{:else if selectedPanel === 'export'}
		<div class="panel-body exports">
			<div>
				<p class="eyebrow">Versioned record · portable measurements</p>
				<h3>Record and export</h3>
				<p>
					Exports carry setup, engine contract, model time, measurements, display state, and the
					step-numbered intervention log where applicable.
				</p>
			</div>
			<div class="export-grid">
				<button type="button" onclick={exportJson}
					><strong>Experiment JSON</strong><span>Versioned setup, event log, metrics, history</span
					></button
				>
				<button type="button" onclick={exportCsv}
					><strong>Measurements CSV</strong><span>{measurementHistory.length} time samples</span
					></button
				>
				<button type="button" onclick={exportPng}
					><strong>Rendered PNG</strong><span>Current display; not raw concentrations</span></button
				>
				<button type="button" onclick={copySummary}
					><strong>Copy text summary</strong><span>Readable setup and result</span></button
				>
				<button type="button" onclick={copyMethods}
					><strong>Copy methods paragraph</strong><span
						>Equations, stencil, boundary, integrator</span
					></button
				>
				<button type="button" onclick={() => shareSetup(false)}
					><strong>Copy setup URL</strong><span>Setup only; no mature painted state</span></button
				>
				<button type="button" onclick={() => shareSetup(true)}
					><strong>Update this address</strong><span>Preserves unrelated query parameters</span
					></button
				>
			</div>
			<p class="small-note">
				GPU floating-point results are not guaranteed bit-for-bit across hardware and drivers. A
				deterministic Float64 CPU replay is the reference when stricter reproducibility matters.
			</p>
		</div>
	{/if}

	<footer class="instrument-status" role="status">
		<span data-state={stability.state}></span>
		<p>{status}</p>
	</footer>
</section>

<noscript>
	<figure class="no-js-observatory">
		<img
			src="/images/reaction-diffusion-atlas-field.png"
			alt="Deterministic Gray–Scott V-concentration field of repeated dark-centred reaction fronts generated by the documented CPU model."
		/>
		<figcaption>
			Static model plate: F 0.051, k 0.0585, Dᵤ 0.16, Dᵥ 0.08, periodic boundary, 128² grid, model
			time 500, deterministic 4 × 4 soft-spot disturbance, seed morphospace-common-1. The
			surrounding article contains the equations and interpretation without JavaScript.
		</figcaption>
	</figure>
</noscript>

<style>
	.observatory {
		--ink: var(--essay-ink, #25302e);
		--raised: var(--paper-raised, #fbf7ed);
		--accent: #2f796d;
		--amber: #9a6a2b;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(90rem, calc(100vw - 1rem));
		margin: 2.5rem 0;
		transform: translateX(-50%);
		scroll-margin-top: 5rem;
		border: 1px solid color-mix(in oklab, var(--ink) 24%, transparent);
		border-radius: 1.1rem;
		background: var(--raised);
		box-shadow: 0 2.4rem 7rem rgb(23 31 29 / 0.13);
		color: var(--ink);
		overflow: clip;
	}
	.masthead {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 1rem;
		padding: clamp(1rem, 3vw, 1.8rem);
		border-bottom: 1px solid color-mix(in oklab, currentColor 15%, transparent);
		background: linear-gradient(
			120deg,
			color-mix(in oklab, var(--raised) 96%, #7ca99d),
			var(--raised)
		);
	}
	.masthead > div:first-child {
		max-width: 58rem;
	}
	.eyebrow {
		margin: 0 0 0.35rem;
		color: var(--accent);
		font-size: 0.7rem;
		font-weight: 850;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h2 {
		margin: 0 0 0.55rem;
		font-size: clamp(1.65rem, 4vw, 3rem);
		letter-spacing: -0.025em;
	}
	.masthead p:last-child {
		margin: 0;
		max-width: 55rem;
	}
	.version {
		display: grid;
		align-self: start;
		min-width: 10rem;
		border-left: 3px solid var(--accent);
		padding-left: 0.7rem;
	}
	.version span,
	.version small {
		font-size: 0.65rem;
	}
	.version strong {
		font:
			850 1rem/1.4 ui-monospace,
			monospace;
	}
	.notice {
		margin: 1rem;
		border-left: 4px solid var(--amber);
		background: color-mix(in oklab, var(--amber) 10%, transparent);
		padding: 0.75rem 0.9rem;
		font-size: 0.78rem;
	}
	.notice ul {
		margin-bottom: 0;
	}
	.panel-tabs {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		border-bottom: 1px solid color-mix(in oklab, currentColor 16%, transparent);
		padding: 0.55rem clamp(0.7rem, 2vw, 1.2rem) 0;
		scrollbar-width: thin;
	}
	.panel-tabs button {
		flex: 0 0 auto;
		min-height: 2.9rem;
		border: 0;
		border-bottom: 3px solid transparent;
		border-radius: 0.4rem 0.4rem 0 0;
		background: transparent;
		padding: 0.55rem 0.75rem;
		color: inherit;
		font-weight: 800;
	}
	.panel-tabs button[aria-pressed='true'] {
		border-bottom-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 8%, transparent);
	}
	button,
	input,
	select,
	summary {
		font: inherit;
	}
	button {
		cursor: pointer;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	summary:focus-visible {
		outline: 3px solid #e8b94d;
		outline-offset: 2px;
	}
	.laboratory-grid {
		display: grid;
		gap: 1rem;
		padding: clamp(0.75rem, 2.3vw, 1.5rem);
	}
	.laboratory-grid[hidden] {
		display: none;
	}
	.field-column {
		min-width: 0;
	}
	.transport {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.7rem;
	}
	.transport button {
		min-height: 2.75rem;
		border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
		border-radius: 0.5rem;
		background: var(--paper);
		padding: 0.5rem 0.72rem;
		color: inherit;
		font-size: 0.73rem;
		font-weight: 800;
	}
	.transport .run {
		min-width: 5.5rem;
		border-color: var(--accent);
		background: var(--accent);
		color: white;
	}
	.telemetry {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		margin-top: 0.7rem;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, currentColor 15%, transparent);
		border-radius: 0.55rem;
		background: color-mix(in oklab, currentColor 12%, transparent);
	}
	.telemetry div {
		display: grid;
		gap: 0.18rem;
		background: var(--raised);
		padding: 0.5rem;
	}
	.telemetry span {
		font-size: 0.61rem;
		font-weight: 750;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.telemetry strong {
		font:
			750 0.68rem/1.25 ui-monospace,
			monospace;
		overflow-wrap: anywhere;
	}
	.run-ledger {
		margin-top: 0.55rem;
		border: 1px solid color-mix(in oklab, currentColor 15%, transparent);
		border-radius: 0.55rem;
		padding: 0.55rem 0.65rem;
		font-size: 0.72rem;
	}
	.run-ledger summary {
		cursor: pointer;
		font-weight: 800;
	}
	.telemetry-more {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.control-deck {
		min-width: 0;
	}
	.setup-header {
		display: grid;
		gap: 0.6rem;
		border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
		border-radius: 0.65rem;
		background: color-mix(in oklab, var(--paper) 95%, white);
		padding: 0.7rem;
	}
	.setup-header label,
	.control-grid label {
		display: grid;
		gap: 0.3rem;
		color: color-mix(in oklab, currentColor 86%, transparent);
		font-size: 0.68rem;
		font-weight: 800;
	}
	input,
	select {
		width: 100%;
		min-height: 2.5rem;
		box-sizing: border-box;
		border: 1px solid color-mix(in oklab, currentColor 24%, transparent);
		border-radius: 0.42rem;
		background: var(--paper);
		padding: 0.38rem 0.48rem;
		color: inherit;
	}
	input[type='range'] {
		min-height: 1.4rem;
		padding: 0;
		accent-color: var(--accent);
	}
	input[type='checkbox'] {
		width: 1.2rem;
		min-height: 1.2rem;
		accent-color: #a54d3e;
	}
	.control-deck details {
		border-bottom: 1px solid color-mix(in oklab, currentColor 15%, transparent);
		padding-block: 0.2rem 0.65rem;
	}
	.control-deck summary {
		min-height: 2.8rem;
		cursor: pointer;
		padding-top: 0.75rem;
		font-size: 0.79rem;
		font-weight: 850;
	}
	.control-grid {
		display: grid;
		gap: 0.7rem;
	}
	.control-grid label > span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.control-grid output {
		font:
			750 0.65rem/1 ui-monospace,
			monospace;
	}
	.control-grid label:has(input[type='range']):not(.compact label) {
		grid-template-columns: minmax(0, 1fr) 5.4rem;
	}
	.control-grid label:has(input[type='range']) > span {
		grid-column: 1 / -1;
	}
	.derived {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.7rem;
	}
	.derived span {
		border-radius: 999px;
		background: color-mix(in oklab, var(--accent) 10%, transparent);
		padding: 0.3rem 0.5rem;
		font:
			700 0.63rem/1 ui-monospace,
			monospace;
	}
	.stability {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem;
		margin-top: 0.65rem;
		border-left: 3px solid var(--accent);
		padding: 0.55rem 0.65rem;
		background: color-mix(in oklab, var(--accent) 7%, transparent);
		font-size: 0.7rem;
	}
	.stability strong {
		text-transform: uppercase;
	}
	.stability[data-state='caution'] {
		border-color: var(--amber);
	}
	.stability[data-state='unsafe'] {
		border-color: #a84e3f;
		background: color-mix(in oklab, #a84e3f 8%, transparent);
	}
	.unsafe-opt {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.55rem;
		align-items: start;
		margin-top: 0.6rem;
		border: 1px solid #a84e3f;
		border-radius: 0.45rem;
		padding: 0.55rem;
		font-size: 0.7rem;
		font-weight: 750;
	}
	.small-note,
	.memory {
		margin: 0.65rem 0 0;
		font-size: 0.68rem;
		line-height: 1.45;
		opacity: 0.78;
	}
	.panel-body {
		padding: clamp(0.9rem, 2.5vw, 1.6rem);
	}
	.panel-body :global(.instrument-panel),
	.panel-body :global(.stability-panel),
	.panel-body :global(.spectrum-panel),
	.panel-body :global(.honesty-panel) {
		margin-block: 0 1rem;
	}
	.export-grid {
		display: grid;
		gap: 0.6rem;
		margin-top: 1rem;
	}
	.export-grid button {
		display: grid;
		gap: 0.2rem;
		min-height: 4.2rem;
		border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
		border-radius: 0.6rem;
		background: var(--paper);
		padding: 0.75rem;
		color: inherit;
		text-align: left;
	}
	.export-grid button strong {
		font-size: 0.8rem;
	}
	.export-grid button span {
		font-size: 0.68rem;
		opacity: 0.72;
	}
	.instrument-status {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		border-top: 1px solid color-mix(in oklab, currentColor 15%, transparent);
		background: color-mix(in oklab, var(--paper) 95%, white);
		padding: 0.7rem clamp(0.9rem, 2vw, 1.4rem);
	}
	.instrument-status span {
		flex: 0 0 auto;
		width: 0.58rem;
		height: 0.58rem;
		margin-top: 0.2rem;
		border-radius: 50%;
		background: var(--accent);
	}
	.instrument-status span[data-state='caution'] {
		background: var(--amber);
	}
	.instrument-status span[data-state='unsafe'] {
		background: #a84e3f;
	}
	.instrument-status p {
		margin: 0;
		font-size: 0.72rem;
	}
	.no-js-observatory img {
		max-width: 100%;
	}
	@media (min-width: 48rem) {
		.setup-header,
		.control-grid.compact,
		.export-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (min-width: 64rem) {
		.laboratory-grid {
			grid-template-columns: minmax(0, 1.8fr) minmax(20rem, 0.9fr);
			align-items: start;
		}
		.control-deck {
			max-height: min(74rem, 88vh);
			overflow-y: auto;
			padding-right: 0.25rem;
		}
		.export-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@media (max-width: 38rem) {
		.observatory {
			width: 96vw;
			border-radius: 0.7rem;
		}
		.telemetry {
			grid-template-columns: 1fr 1fr;
		}
		.transport button {
			flex: 1 1 7.5rem;
		}
		.stability {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}
	:global(html[data-theme='night']) .observatory,
	:global(html[data-theme='high-contrast']) .observatory {
		--accent: #8bd3c1;
		--amber: #e0b671;
	}
	:global(html[data-theme='high-contrast']) .observatory {
		border-width: 2px;
	}
</style>
