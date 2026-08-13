<script lang="ts">
	import { replaceState as replaceNavigationState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { MatrixAnalysis, RandomMatrixWorkerClient } from '$lib/visualizations/random-matrix';
	import AccessibleMatrixSummary from './AccessibleMatrixSummary.svelte';
	import DirectionMachine from './DirectionMachine.svelte';
	import EnsembleLaboratory from './EnsembleLaboratory.svelte';
	import ExperimentCards from './ExperimentCards.svelte';
	import InstrumentControls from './InstrumentControls.svelte';
	import MatrixMicroscope from './MatrixMicroscope.svelte';
	import SingularValueMountain from './SingularValueMountain.svelte';
	import SpectralSky from './SpectralSky.svelte';
	import StructureDetector from './StructureDetector.svelte';
	import {
		adaptAnalysis,
		adaptNullResult,
		emptyEnsembleSummary,
		fromEngineState,
		toEngineRearrangement,
		toEngineState
	} from './engine-adapter';
	import {
		LENSES,
		PRESET_LABELS,
		formatNumber,
		type ComputePhase,
		type EnsembleSummaryView,
		type ExperimentCard,
		type ExperimentStateView,
		type LensId,
		type MatrixRearrangement,
		type NullEnsembleView,
		type PresetId
	} from './types';

	type EngineModule = typeof import('$lib/visualizations/random-matrix');
	type CopyKind = 'seed' | 'link' | 'none';

	const INITIAL_STATE: ExperimentStateView = {
		seed: 'tramlight-circle-1847',
		preset: 'circular-cloud',
		dimension: 64,
		aspectRatio: 0.75,
		distribution: 'gaussian',
		mean: 0,
		scale: 1,
		normalisation: 'variance-1/n',
		symmetry: 'none',
		sparsity: 0,
		signalType: 'none',
		signalStrength: 0,
		lens: 'spectrum',
		mode: 'single',
		sampleCount: 100,
		theory: true,
		colourScale: 'diverging',
		highContrast: false
	};

	const QUERY_KEYS = [
		'rmv',
		'seed',
		'preset',
		'n',
		'gamma',
		'dist',
		'mean',
		'scale',
		'norm',
		'sym',
		'sparse',
		'signal',
		'strength',
		'lens',
		'mode',
		'samples',
		'theory',
		'colour',
		'contrast',
		'eig',
		'k',
		'rearrange'
	] as const;

	const EXPERIMENT_CARDS: readonly ExperimentCard[] = [
		{
			id: 'grow-the-circle',
			title: 'Let the circle gather',
			prompt: 'Raise n and compare one spectrum with an ensemble.',
			patch: {
				preset: 'circular-cloud',
				dimension: 96,
				lens: 'spectrum',
				mode: 'ensemble',
				sampleCount: 100
			}
		},
		{
			id: 'fix-normalisation',
			title: 'Hold the seed; change the scale',
			prompt: 'Keep every draw fixed and remove the 1/√n normalisation.',
			patch: { normalisation: 'unscaled', lens: 'spectrum' }
		},
		{
			id: 'collapse-to-real',
			title: 'Make symmetry exact',
			prompt: 'Watch complex eigenvalues collapse onto the real axis.',
			patch: { preset: 'wigner-moonrise', symmetry: 'symmetric', lens: 'spectrum' }
		},
		{
			id: 'same-spectrum-face',
			title: 'Same spectrum, different face',
			prompt: 'Compare A with QᵀAQ and audit the numerical discrepancy.',
			patch: { preset: 'same-spectrum', lens: 'matrix' }
		},
		{
			id: 'raise-signal',
			title: 'Lift a signal from noise',
			prompt: 'Increase a rank-one spike, then compare declared null statistics.',
			patch: {
				preset: 'hidden-rank-one',
				signalType: 'rank-one',
				signalStrength: 1.5,
				lens: 'structure'
			}
		},
		{
			id: 'eigen-versus-singular',
			title: 'Eigenvalues are not stretches',
			prompt: 'Use the non-normal trap and compare ρ(A) with σ₁(A).',
			patch: { preset: 'non-normal-trap', lens: 'direction' }
		},
		{
			id: 'universality',
			title: 'Change microscopic noise',
			prompt: 'Swap Gaussian entries for matched Rademacher entries.',
			patch: {
				preset: 'universality-test',
				distribution: 'rademacher',
				lens: 'ensemble',
				mode: 'ensemble'
			}
		},
		{
			id: 'persuade-the-eye',
			title: 'Persuade the eye',
			prompt: 'Change only the colour encoding; the matrix stays fixed.',
			patch: { lens: 'matrix', colourScale: 'sequential' }
		},
		{
			id: 'shuffle-entries',
			title: 'Shuffle the same entries',
			prompt: 'Destroy spatial arrangement while preserving the entry histogram.',
			patch: { lens: 'matrix' },
			rearrangement: 'shuffle'
		}
	];

	let laboratory: HTMLElement;
	let fullscreenTrigger: HTMLButtonElement | null = null;
	let engine: EngineModule | null = null;
	let analysisClient: RandomMatrixWorkerClient | null = null;
	let nullClient: RandomMatrixWorkerClient | null = null;
	let ensembleClient: RandomMatrixWorkerClient | null = null;
	let experimentState: ExperimentStateView = $state({ ...INITIAL_STATE });
	let analysis: MatrixAnalysis | null = $state(null);
	let phase = $state<ComputePhase>('idle');
	let nullPhase = $state<ComputePhase>('idle');
	let nullResult: NullEnsembleView | undefined = $state();
	let ensemble: EnsembleSummaryView = $state(emptyEnsembleSummary(INITIAL_STATE.sampleCount));
	let ensemblePaused = $state(true);
	let ensembleBusy = $state(false);
	let ensembleSpeed = $state(8);
	let selectedEigen = $state(0);
	let reconstructionRank = $state(8);
	let rearrangement: MatrixRearrangement = $state('original');
	let status = $state('The instrument will start when it nears the viewport.');
	let progress = $state(0);
	let initialized = $state(false);
	let initializationStarted = false;
	let offscreen = $state(false);
	let activeExperiment = $state('');
	let previousExperimentState: ExperimentStateView | null = $state(null);
	let previousExperimentRearrangement: MatrixRearrangement = $state('original');
	let copied: CopyKind = $state('none');
	let fullscreen = $state(false);
	let focusMode = $state(false);
	let fullscreenSupported = $state(false);
	let exporting = $state(false);
	let reducedMotion = $state(false);
	let numericalWarning = $state('');
	let deviceMatrixCap = $state(256);
	let deviceLimitNotice = $state('');
	let analysisGeneration = 0;
	let ensembleGeneration = 0;
	let recomputeTimer = 0;
	let ensembleTimer = 0;
	let copyTimer = 0;
	let destroyed = false;

	let view = $derived(analysis ? adaptAnalysis(analysis) : undefined);
	let displayedSymmetric = $derived(
		view ? isExactlySymmetric(view.matrix, view.rows, view.columns) : false
	);
	let activeLens = $derived(LENSES.find((lens) => lens.id === experimentState.lens) ?? LENSES[0]);
	let busy = $derived.by(() => phase === 'loading' || phase === 'working');
	let inExpandedMode = $derived(fullscreen || focusMode);
	let progressLabel = $derived.by(() => {
		if (phase === 'loading') return 'Loading the numerical engine';
		if (phase === 'working') return 'Generating and decomposing the matrix';
		if (phase === 'error') return 'Calculation needs attention';
		return analysis ? 'Calculation complete' : 'Waiting to begin';
	});

	function isCancellation(error: unknown): boolean {
		return error instanceof Error && /Cancelled|Superseded|Disposed/u.test(error.name);
	}

	function matrixDimensionCapForDevice(): number {
		const concurrency = Math.max(1, navigator.hardwareConcurrency || 2);
		const memory = Number(
			(navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? Number.NaN
		);
		const narrow = Math.min(window.innerWidth, window.innerHeight) < 600;
		if (narrow || concurrency <= 2 || (Number.isFinite(memory) && memory <= 2)) return 96;
		if (concurrency <= 4 || (Number.isFinite(memory) && memory <= 4)) return 128;
		return 256;
	}

	function lensNeedsReconstruction(lens: LensId): boolean {
		return lens === 'singular-values';
	}

	function isExactlySymmetric(matrix: Float64Array, rows: number, columns: number): boolean {
		if (rows !== columns || matrix.length !== rows * columns) return false;
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < row; column += 1) {
				if (matrix[row * columns + column] !== matrix[column * columns + row]) return false;
			}
		}
		return true;
	}

	function calculationChanged(patch: Partial<ExperimentStateView>): boolean {
		return [
			'seed',
			'preset',
			'dimension',
			'aspectRatio',
			'distribution',
			'mean',
			'scale',
			'normalisation',
			'symmetry',
			'sparsity',
			'signalType',
			'signalStrength',
			'theory'
		].some((key) => key in patch);
	}

	function normaliseViewState(candidate: ExperimentStateView): ExperimentStateView {
		if (!engine) return candidate;
		const normalized = fromEngineState(engine.normalizeRandomMatrixState(toEngineState(candidate)));
		if (normalized.dimension <= deviceMatrixCap) {
			deviceLimitNotice = '';
			return normalized;
		}
		deviceLimitNotice = `This device profile limits interactive decompositions to n=${deviceMatrixCap}; the requested n=${normalized.dimension} was reduced before computation.`;
		return fromEngineState(
			engine.normalizeRandomMatrixState(
				toEngineState({ ...normalized, dimension: deviceMatrixCap })
			)
		);
	}

	function stateWithPreset(preset: PresetId): ExperimentStateView {
		if (!engine) return { ...experimentState, preset };
		const requested = toEngineState({ ...experimentState, preset });
		return fromEngineState(engine.stateForPreset(requested.preset, toEngineState(experimentState)));
	}

	function changeState(patch: Partial<ExperimentStateView>, commit = false): void {
		let next = { ...experimentState, ...patch };
		if (patch.preset && patch.preset !== experimentState.preset)
			next = { ...stateWithPreset(patch.preset), ...patch };
		next = normaliseViewState(next);
		const needsCalculation = calculationChanged(patch);
		const switchedToReconstruction = patch.lens === 'singular-values' && !view?.reconstruction;
		experimentState = next;
		if (patch.sampleCount !== undefined) {
			ensemble = { ...ensemble, requested: next.sampleCount };
			if (ensemble.completed > next.sampleCount) clearEnsemble(false);
		}
		activeExperiment = '';
		syncUrl();
		if (!needsCalculation && !switchedToReconstruction) return;
		clearNullResult();
		pauseEnsemble('Ensemble accumulation paused because the matrix model changed.', false);
		if (commit) {
			window.clearTimeout(recomputeTimer);
			void runAnalysis();
		} else {
			window.clearTimeout(recomputeTimer);
			recomputeTimer = window.setTimeout(() => void runAnalysis(), 180);
		}
	}

	function selectLens(value: string): void {
		if (!LENSES.some((lens) => lens.id === value)) return;
		changeState({ lens: value as LensId }, true);
	}

	async function initialise(): Promise<void> {
		if (initializationStarted || destroyed || typeof window === 'undefined') return;
		initializationStarted = true;
		phase = 'loading';
		progress = 0.06;
		status = 'Loading the browser numerical engine.';
		try {
			engine = await import('$lib/visualizations/random-matrix');
			if (destroyed) return;
			deviceMatrixCap = matrixDimensionCapForDevice();
			experimentState = normaliseViewState(
				fromEngineState(engine.parseRandomMatrixState(window.location.search))
			);
			selectedEigen = boundedInteger(
				new URL(window.location.href).searchParams.get('eig'),
				0,
				10_000,
				0
			);
			reconstructionRank = boundedInteger(
				new URL(window.location.href).searchParams.get('k'),
				1,
				experimentState.dimension,
				Math.min(8, experimentState.dimension)
			);
			rearrangement = parseRearrangement(
				new URL(window.location.href).searchParams.get('rearrange')
			);
			analysisClient = engine.createRandomMatrixWorkerClient();
			nullClient = engine.createRandomMatrixWorkerClient();
			ensembleClient = engine.createRandomMatrixWorkerClient();
			nullClient.subscribeProgress((update) => {
				if (destroyed) return;
				progress = update.completed / Math.max(1, update.total);
				status = `Null ensemble: ${update.completed} of ${update.total} matrices sampled.`;
			});
			ensemble = emptyEnsembleSummary(experimentState.sampleCount);
			initialized = true;
			progress = 0.12;
			await runAnalysis();
		} catch (error) {
			phase = 'error';
			progress = 0;
			status = error instanceof Error ? error.message : 'The numerical engine could not be loaded.';
		}
	}

	async function runAnalysis(): Promise<void> {
		if (!engine || !analysisClient || destroyed) return;
		const generation = ++analysisGeneration;
		phase = 'working';
		progress = 0.26;
		status = `Computing ${PRESET_LABELS[experimentState.preset]} with seed ${experimentState.seed}.`;
		numericalWarning = '';
		try {
			const result = await analysisClient.analyze({
				state: toEngineState(experimentState),
				sampleIndex: 0,
				rearrangement: toEngineRearrangement(rearrangement),
				...(lensNeedsReconstruction(experimentState.lens) ? { reconstructionRank } : {}),
				includeVectors: false
			});
			if (destroyed || generation !== analysisGeneration) return;
			analysis = result;
			selectedEigen = Math.max(
				0,
				Math.min(selectedEigen, Math.max(0, (result.eigen?.real.length ?? 1) - 1))
			);
			reconstructionRank = Math.max(1, Math.min(reconstructionRank, result.singular.values.length));
			phase = 'ready';
			progress = 1;
			numericalWarning =
				result.warnings.find((warning) => /residual|tolerance|disabled|unstable/iu.test(warning)) ??
				'';
			status = `${result.rows} by ${result.columns} matrix ready. ${result.eigen?.real.length ?? 0} eigenvalues and ${result.singular.values.length} singular values computed.`;
			syncUrl();
		} catch (error) {
			if (destroyed || generation !== analysisGeneration || isCancellation(error)) return;
			phase = 'error';
			progress = 0;
			status = error instanceof Error ? error.message : 'The matrix calculation failed.';
		}
	}

	function changeRearrangement(value: MatrixRearrangement): void {
		rearrangement = value;
		syncUrl();
		clearNullResult();
		pauseEnsemble('Ensemble accumulation paused because the displayed matrix changed.', false);
		void runAnalysis();
	}

	function changeRank(rank: number, commit: boolean): void {
		reconstructionRank = Math.max(
			1,
			Math.min(view?.singular?.values.length ?? experimentState.dimension, Math.round(rank))
		);
		syncUrl();
		window.clearTimeout(recomputeTimer);
		if (commit) void runAnalysis();
		else recomputeTimer = window.setTimeout(() => void runAnalysis(), 160);
	}

	function chooseEigen(index: number): void {
		selectedEigen = Math.max(0, Math.min((view?.eigen?.real.length ?? 1) - 1, index));
		clearNullResult();
		syncUrl();
	}

	function clearNullResult(): void {
		if (nullPhase === 'working') {
			try {
				nullClient?.cancel();
			} catch {
				/* client may already be retiring */
			}
		}
		nullResult = undefined;
		nullPhase = 'idle';
	}

	async function runNullComparison(): Promise<void> {
		if (!nullClient || !engine) return;
		nullPhase = 'working';
		progress = 0;
		status = 'Sampling matrices under the declared null model.';
		try {
			const result = await nullClient.runNullEnsemble({
				state: toEngineState(experimentState),
				sampleCount: Math.min(200, Math.max(40, experimentState.sampleCount)),
				observedSampleIndex: 0,
				selectedEigenIndex: selectedEigen,
				rearrangement: toEngineRearrangement(rearrangement)
			});
			if (destroyed) return;
			nullResult = adaptNullResult(result);
			nullPhase = 'ready';
			progress = 1;
			status = `Null comparison complete with ${result.sampleCount} matrices. Interpret every percentile relative to the displayed null.`;
		} catch (error) {
			if (isCancellation(error) || destroyed) return;
			nullPhase = 'error';
			status = error instanceof Error ? error.message : 'The null comparison failed.';
		}
	}

	function appendEnsembleResult(result: MatrixAnalysis): void {
		const eigenvalues = ensemble.eigenvalues.slice();
		if (result.eigen) {
			for (let index = 0; index < result.eigen.real.length; index += 1) {
				eigenvalues.push({
					real: result.eigen.real[index] ?? 0,
					imaginary: result.eigen.imaginary[index] ?? 0,
					sample: result.sampleIndex
				});
			}
		}
		const boundedEigenvalues = eigenvalues.length > 6_000 ? eigenvalues.slice(-6_000) : eigenvalues;
		ensemble = {
			completed: ensemble.completed + 1,
			requested: experimentState.sampleCount,
			spectralRadii:
				result.summary.spectralRadius === null
					? ensemble.spectralRadii
					: [...ensemble.spectralRadii, result.summary.spectralRadius],
			largestSingularValues: [...ensemble.largestSingularValues, result.singular.values[0] ?? 0],
			eigenvalues: boundedEigenvalues
		};
	}

	async function accumulateEnsemble(generation: number): Promise<void> {
		if (!ensembleClient || ensemblePaused || destroyed || generation !== ensembleGeneration) return;
		if (ensemble.completed >= experimentState.sampleCount) {
			ensemblePaused = true;
			status = `Ensemble complete: ${ensemble.completed} deterministic matrices accumulated.`;
			return;
		}
		if (document.hidden || offscreen) {
			pauseEnsemble('Ensemble paused while the instrument is not visible.', false);
			return;
		}
		ensembleBusy = true;
		const sampleIndex = ensemble.completed;
		status = `Ensemble sample ${sampleIndex + 1} of ${experimentState.sampleCount} is being computed.`;
		try {
			const result = await ensembleClient.analyze({
				state: toEngineState({ ...experimentState, mode: 'ensemble' }),
				sampleIndex,
				rearrangement: 'original',
				includeVectors: false
			});
			if (destroyed || generation !== ensembleGeneration || ensemblePaused) return;
			appendEnsembleResult(result);
			ensembleBusy = false;
			if (ensemble.completed >= experimentState.sampleCount) {
				ensemblePaused = true;
				status = `Ensemble complete: ${ensemble.completed} deterministic matrices accumulated.`;
				return;
			}
			const delay = reducedMotion ? 120 : Math.max(16, 1_000 / ensembleSpeed);
			ensembleTimer = window.setTimeout(() => void accumulateEnsemble(generation), delay);
		} catch (error) {
			ensembleBusy = false;
			if (isCancellation(error) || destroyed || generation !== ensembleGeneration) return;
			ensemblePaused = true;
			status = error instanceof Error ? error.message : 'Ensemble accumulation stopped.';
		}
	}

	function startEnsemble(): void {
		if (!initialized) return;
		if (ensemble.completed >= experimentState.sampleCount) clearEnsemble(false);
		experimentState = normaliseViewState({ ...experimentState, mode: 'ensemble' });
		ensemblePaused = false;
		const generation = ++ensembleGeneration;
		syncUrl();
		void accumulateEnsemble(generation);
	}

	function pauseEnsemble(message = 'Ensemble accumulation paused.', announce = true): void {
		if (ensemblePaused && !ensembleBusy) return;
		ensemblePaused = true;
		ensembleGeneration += 1;
		window.clearTimeout(ensembleTimer);
		if (ensembleBusy) {
			try {
				ensembleClient?.cancel();
			} catch {
				/* ignored during cleanup */
			}
		}
		ensembleBusy = false;
		if (announce) status = message;
	}

	function clearEnsemble(announce = true): void {
		pauseEnsemble('', false);
		ensemble = emptyEnsembleSummary(experimentState.sampleCount);
		if (announce)
			status = 'Ensemble cleared. The same seed will reproduce the same indexed sequence.';
	}

	function replayEnsemble(): void {
		clearEnsemble(false);
		status = 'Replaying the deterministic ensemble from sample index zero.';
		startEnsemble();
	}

	function changeSampleCount(count: number): void {
		changeState({ sampleCount: count, mode: 'ensemble' }, true);
	}

	function changeSpeed(speed: number): void {
		ensembleSpeed = Math.max(1, Math.min(30, speed));
	}

	function reroll(): void {
		const words = new Uint32Array(2);
		if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(words);
		else {
			words[0] = Date.now() >>> 0;
			words[1] = Math.floor(performance.now() * 1_000) >>> 0;
		}
		changeState({ seed: `matrix-${words[0].toString(36)}-${words[1].toString(36)}` }, true);
	}

	async function copyText(value: string, kind: Exclude<CopyKind, 'none'>): Promise<void> {
		try {
			if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
			else {
				const field = document.createElement('textarea');
				field.value = value;
				field.style.position = 'fixed';
				field.style.opacity = '0';
				document.body.append(field);
				field.select();
				document.execCommand('copy');
				field.remove();
			}
			copied = kind;
			status = kind === 'seed' ? 'Seed copied.' : 'Shareable experiment URL copied.';
			window.clearTimeout(copyTimer);
			copyTimer = window.setTimeout(() => (copied = 'none'), 2_000);
		} catch {
			status = 'The browser did not grant clipboard access.';
		}
	}

	function resetExperiment(): void {
		if (!engine) return;
		experimentState = fromEngineState({ ...engine.DEFAULT_RANDOM_MATRIX_STATE });
		selectedEigen = 0;
		reconstructionRank = Math.min(8, experimentState.dimension);
		rearrangement = 'original';
		activeExperiment = '';
		previousExperimentState = null;
		previousExperimentRearrangement = 'original';
		clearNullResult();
		clearEnsemble(false);
		syncUrl();
		void runAnalysis();
	}

	function applyExperiment(card: ExperimentCard): void {
		previousExperimentState = { ...experimentState };
		previousExperimentRearrangement = rearrangement;
		activeExperiment = card.id;
		let next = { ...experimentState };
		if (card.patch.preset && card.patch.preset !== experimentState.preset)
			next = stateWithPreset(card.patch.preset);
		rearrangement = card.rearrangement ?? 'original';
		changeState({ ...next, ...card.patch }, true);
		activeExperiment = card.id;
		status = `${card.title} loaded. ${card.prompt}`;
	}

	function undoExperiment(): void {
		if (!previousExperimentState) return;
		const restore = previousExperimentState;
		const restoreRearrangement = previousExperimentRearrangement;
		previousExperimentState = null;
		previousExperimentRearrangement = 'original';
		activeExperiment = '';
		experimentState = normaliseViewState(restore);
		rearrangement = restoreRearrangement;
		clearNullResult();
		clearEnsemble(false);
		syncUrl();
		void runAnalysis();
	}

	function parseRearrangement(value: string | null): MatrixRearrangement {
		return [
			'original',
			'shuffle',
			'joint-permutation',
			'orthogonal-basis',
			'row-norm',
			'spectral-order'
		].includes(value ?? '')
			? (value as MatrixRearrangement)
			: 'original';
	}

	function boundedInteger(
		value: string | null,
		minimum: number,
		maximum: number,
		fallback: number
	): number {
		const parsed = Number(value);
		return Number.isSafeInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
	}

	function syncUrl(): void {
		if (!engine || typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		for (const key of QUERY_KEYS) url.searchParams.delete(key);
		for (const [key, value] of engine.serializeRandomMatrixState(toEngineState(experimentState)))
			url.searchParams.set(key, value);
		if (selectedEigen > 0) url.searchParams.set('eig', String(selectedEigen));
		if (reconstructionRank !== Math.min(8, experimentState.dimension))
			url.searchParams.set('k', String(reconstructionRank));
		if (rearrangement !== 'original') url.searchParams.set('rearrange', rearrangement);
		const pathSegments = url.pathname.split('/').filter(Boolean);
		const category = pathSegments.at(-2) ?? 'visualizations';
		const slug = pathSegments.at(-1) ?? 'the-matrix-is-random-why-does-it-have-a-shape';
		const resolvedUrl = resolve(
			`/blog/[category]/[slug]?${url.searchParams.toString()}${url.hash}` as `/blog/[category]/[slug]?${string}`,
			{ category, slug }
		);
		replaceNavigationState(resolvedUrl, {});
	}

	function currentShareUrl(): string {
		syncUrl();
		return window.location.href;
	}

	function fullscreenChanged(): void {
		fullscreen = document.fullscreenElement === laboratory;
		if (fullscreen) requestAnimationFrame(() => focusExpandedExit());
		else if (!focusMode) restoreFullscreenFocus();
	}

	function focusExpandedExit(): void {
		laboratory
			.querySelector<HTMLButtonElement>('[data-testid="random-matrix-exit-expanded"]')
			?.focus();
	}

	async function toggleExpanded(trigger: HTMLButtonElement): Promise<void> {
		fullscreenTrigger = trigger;
		if (inExpandedMode) {
			await exitExpanded();
			return;
		}
		if (laboratory.requestFullscreen) {
			try {
				await laboratory.requestFullscreen();
				requestAnimationFrame(() => focusExpandedExit());
				return;
			} catch {
				// Browser policy can reject fullscreen; focus mode is the complete fallback.
			}
		}
		focusMode = true;
		requestAnimationFrame(() => laboratory.focus());
		status = 'Focus mode opened. Press Escape or use Exit focus mode to return.';
	}

	async function exitExpanded(): Promise<void> {
		if (document.fullscreenElement === laboratory) {
			try {
				await document.exitFullscreen();
			} catch {
				/* the browser may already be leaving */
			}
		}
		if (focusMode) {
			focusMode = false;
			restoreFullscreenFocus();
		}
	}

	function restoreFullscreenFocus(): void {
		requestAnimationFrame(() => fullscreenTrigger?.focus());
	}

	function keydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && focusMode) {
			event.preventDefault();
			void exitExpanded();
		}
	}

	async function saveCurrentFigure(): Promise<void> {
		if (!laboratory || exporting) return;
		const panel = laboratory.querySelector(`[data-lens="${experimentState.lens}"]`);
		const surfaces = panel
			? Array.from(panel.querySelectorAll<HTMLElement>('[data-export-surface]')).filter(
					(surface) => surface.getClientRects().length > 0
				)
			: [];
		if (surfaces.length === 0) {
			status = 'This lens has no exportable figure yet.';
			return;
		}
		exporting = true;
		status = `Preparing a PNG of ${activeLens.label}.`;
		try {
			const blobs = await Promise.all(surfaces.map((surface) => surfaceBlob(surface)));
			const validBlobs = blobs.filter((blob): blob is Blob => Boolean(blob));
			const blob =
				validBlobs.length > 1 ? await composeImageBlobs(validBlobs) : (validBlobs[0] ?? null);
			if (!blob) throw new Error('The visible figure could not be rasterised.');
			const href = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = href;
			anchor.download = `random-matrix-${experimentState.lens}-${safeStem(experimentState.seed)}.png`;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(href), 1_000);
			status = 'PNG saved. The seed and model settings remain encoded in the share URL.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'The PNG export failed.';
		} finally {
			exporting = false;
		}
	}

	async function surfaceBlob(surface: HTMLElement): Promise<Blob | null> {
		const directCanvas =
			surface instanceof HTMLCanvasElement
				? surface
				: surface.querySelector<HTMLCanvasElement>('canvas');
		const svg =
			surface instanceof SVGSVGElement ? surface : surface.querySelector<SVGSVGElement>('svg');
		return directCanvas ? canvasBlob(directCanvas) : svg ? svgBlob(svg) : null;
	}

	async function composeImageBlobs(blobs: readonly Blob[]): Promise<Blob | null> {
		const sources = blobs.map((blob) => URL.createObjectURL(blob));
		try {
			const images = await Promise.all(sources.map(loadImage));
			const gap = 24;
			const canvas = document.createElement('canvas');
			canvas.width = Math.min(4_800, images.reduce((sum, image) => sum + image.width, 0) + gap);
			canvas.height = Math.max(...images.map((image) => image.height));
			const context = canvas.getContext('2d');
			if (!context) return null;
			context.fillStyle =
				getComputedStyle(laboratory).getPropertyValue('--rm-paper').trim() || '#f4efe4';
			context.fillRect(0, 0, canvas.width, canvas.height);
			let x = 0;
			for (const image of images) {
				context.drawImage(image, x, 0);
				x += image.width + gap;
			}
			return canvasBlob(canvas);
		} finally {
			for (const source of sources) URL.revokeObjectURL(source);
		}
	}

	function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
		return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	}

	async function svgBlob(svg: SVGSVGElement): Promise<Blob | null> {
		const bounds = svg.getBoundingClientRect();
		const width = Math.max(
			320,
			Math.min(2_400, Math.round(bounds.width * Math.min(2, devicePixelRatio || 1)))
		);
		const height = Math.max(180, Math.round(width * (bounds.height / Math.max(1, bounds.width))));
		const clone = svg.cloneNode(true) as SVGSVGElement;
		inlineSvgStyles(svg, clone);
		clone.setAttribute('width', String(width));
		clone.setAttribute('height', String(height));
		const source = new XMLSerializer().serializeToString(clone);
		const sourceUrl = URL.createObjectURL(
			new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
		);
		try {
			const image = await loadImage(sourceUrl);
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			if (!context) return null;
			context.fillStyle =
				getComputedStyle(laboratory).getPropertyValue('--rm-paper').trim() || '#f4efe4';
			context.fillRect(0, 0, width, height);
			context.drawImage(image, 0, 0, width, height);
			return await canvasBlob(canvas);
		} finally {
			URL.revokeObjectURL(sourceUrl);
		}
	}

	function inlineSvgStyles(source: SVGSVGElement, clone: SVGSVGElement): void {
		const sourceElements = [source, ...Array.from(source.querySelectorAll<SVGElement>('*'))];
		const cloneElements = [clone, ...Array.from(clone.querySelectorAll<SVGElement>('*'))];
		const properties = [
			'fill',
			'stroke',
			'stroke-width',
			'stroke-dasharray',
			'stroke-linecap',
			'opacity',
			'font-family',
			'font-size',
			'font-weight',
			'text-anchor',
			'dominant-baseline'
		];
		for (let index = 0; index < sourceElements.length; index += 1) {
			const computed = getComputedStyle(sourceElements[index]);
			const target = cloneElements[index];
			if (!target) continue;
			for (const property of properties)
				target.style.setProperty(property, computed.getPropertyValue(property));
		}
	}

	function loadImage(source: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () =>
				reject(new Error('The SVG figure could not be decoded for PNG export.'));
			image.src = source;
		});
	}

	function safeStem(value: string): string {
		return (
			value
				.toLowerCase()
				.replace(/[^a-z0-9]+/gu, '-')
				.replace(/^-|-$/gu, '')
				.slice(0, 48) || 'experiment'
		);
	}

	function normalisationLabel(): string {
		if (experimentState.normalisation === 'variance-1/n')
			return `Entries use standard deviation σ/√n and variance σ²/n; here σ=${formatNumber(experimentState.scale, 4)}`;
		if (experimentState.normalisation === 'frobenius')
			return 'The matrix is rescaled to unit Frobenius norm';
		if (experimentState.normalisation === 'spectral-radius')
			return 'The matrix is rescaled to unit spectral radius';
		return 'Entries use their unscaled declared variance';
	}

	function nullDescription(): string {
		return `${PRESET_LABELS[experimentState.preset]}; n=${experimentState.dimension}; ${experimentState.distribution} entries; ${experimentState.symmetry}; ${normalisationLabel().toLowerCase()}; no planted signal.`;
	}

	onMount(() => {
		destroyed = false;
		fullscreenSupported = typeof laboratory?.requestFullscreen === 'function';
		reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const motionChanged = () => {
			reducedMotion = motionQuery.matches;
			if (reducedMotion && !ensemblePaused)
				pauseEnsemble(
					'Ensemble paused because reduced motion is enabled. Resume deliberately to continue.'
				);
		};
		motionQuery.addEventListener('change', motionChanged);
		document.addEventListener('fullscreenchange', fullscreenChanged);
		document.addEventListener('keydown', keydown);
		const visibilityChanged = () => {
			if (document.hidden) pauseEnsemble('Ensemble paused while this tab is hidden.');
		};
		document.addEventListener('visibilitychange', visibilityChanged);

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry) return;
				offscreen = !entry.isIntersecting;
				if (entry.isIntersecting && !initializationStarted) void initialise();
				if (!entry.isIntersecting && initialized && !ensemblePaused)
					pauseEnsemble('Ensemble paused while the instrument is off-screen.');
			},
			{ rootMargin: '420px 0px', threshold: 0.01 }
		);
		observer.observe(laboratory);
		return () => {
			destroyed = true;
			analysisGeneration += 1;
			ensembleGeneration += 1;
			window.clearTimeout(recomputeTimer);
			window.clearTimeout(ensembleTimer);
			window.clearTimeout(copyTimer);
			observer.disconnect();
			motionQuery.removeEventListener('change', motionChanged);
			document.removeEventListener('fullscreenchange', fullscreenChanged);
			document.removeEventListener('keydown', keydown);
			document.removeEventListener('visibilitychange', visibilityChanged);
			analysisClient?.dispose();
			nullClient?.dispose();
			ensembleClient?.dispose();
		};
	});
</script>

<section
	bind:this={laboratory}
	class="random-matrix-instrument article-breakout not-prose"
	class:high-contrast={experimentState.highContrast}
	class:focus-mode={focusMode}
	data-phase={phase}
	data-ready={phase === 'ready' ? 'true' : 'false'}
	data-testid="random-matrix-instrument"
	tabindex="-1"
	aria-labelledby="random-matrix-instrument-heading"
>
	<div class="focus-toolbar" aria-hidden={!inExpandedMode}>
		<div><span>RANDOM MATRIX LABORATORY</span><strong>{activeLens.label}</strong></div>
		<div class="focus-progress">
			<span>{progressLabel}</span><progress max="1" value={progress}></progress>
		</div>
		<Button
			data-testid="random-matrix-exit-expanded"
			class="rm-action exit-action min-h-11"
			variant="outline"
			onclick={() => exitExpanded()}>{fullscreen ? 'Exit fullscreen' : 'Exit focus mode'}</Button
		>
	</div>

	<header class="instrument-header">
		<div>
			<p class="kicker">INTERACTIVE MATHEMATICS · SEEDED EXPERIMENT</p>
			<h2 id="random-matrix-instrument-heading">
				One random matrix. Six ways to ask what shape it has.
			</h2>
			<p class="deck">
				The heatmap shows entries in one basis. The other lenses ask about collective statistics,
				invariant algebra, stretching, dynamics, and declared null models.
			</p>
		</div>
		<div class="header-actions">
			<Button
				data-testid="random-matrix-save-png"
				class="rm-action min-h-11"
				variant="outline"
				disabled={!analysis || exporting || experimentState.lens === 'structure'}
				onclick={saveCurrentFigure}>{exporting ? 'Saving…' : 'Save PNG'}</Button
			>
			<Button
				data-testid="random-matrix-share-url"
				class="rm-action min-h-11"
				variant="outline"
				disabled={!initialized}
				onclick={() => copyText(currentShareUrl(), 'link')}
				>{copied === 'link' ? 'Link copied' : 'Copy experiment URL'}</Button
			>
			<Button
				data-testid="random-matrix-toggle-expanded"
				class="rm-action min-h-11"
				onclick={(event) => toggleExpanded(event.currentTarget as HTMLButtonElement)}
				>{inExpandedMode
					? 'Exit laboratory'
					: fullscreenSupported
						? 'Fullscreen'
						: 'Focus mode'}</Button
			>
		</div>
	</header>

	<div class="instrument-status">
		<div><span>{progressLabel}</span><output>{Math.round(progress * 100)}%</output></div>
		<progress max="1" value={progress}>{Math.round(progress * 100)}%</progress>
		<p aria-live="polite" aria-atomic="true">{status}</p>
		{#if deviceLimitNotice}<p class="device-limit-notice">{deviceLimitNotice}</p>{/if}
	</div>

	<div class="fact-strip" aria-label="Current matrix experiment summary">
		<div><span>Preset</span><strong>{PRESET_LABELS[experimentState.preset]}</strong></div>
		<div>
			<span>Object</span><strong
				>{analysis
					? `${analysis.rows} × ${analysis.columns}`
					: `n = ${experimentState.dimension}`}</strong
			>
		</div>
		<div>
			<span>Entries</span><strong
				>{experimentState.distribution} · μ {formatNumber(experimentState.mean, 3)} · σ {formatNumber(
					experimentState.scale,
					3
				)}</strong
			>
		</div>
		<div><span>Normalisation</span><strong>{experimentState.normalisation}</strong></div>
		<div><span>Seed</span><strong>{experimentState.seed}</strong></div>
		{#if numericalWarning}<div class="warning">
				<span>Numerical or model warning</span><strong>{numericalWarning}</strong>
			</div>{/if}
	</div>

	<Tabs.Root class="rm-tabs" value={experimentState.lens} onValueChange={selectLens}>
		<div class="tabs-scroll" role="region" aria-label="Scrollable matrix lenses">
			<Tabs.List class="rm-tabs-list">
				{#each LENSES as lens, index (lens.id)}
					<Tabs.Trigger
						data-testid={`random-matrix-lens-${lens.id}`}
						class="rm-tab-trigger"
						value={lens.id}
						><span>{String(index + 1).padStart(2, '0')}</span>{lens.shortLabel}</Tabs.Trigger
					>
				{/each}
			</Tabs.List>
		</div>

		<div class="instrument-body">
			<main class="stage" aria-busy={busy}>
				{#if !view}
					<div class="loading-stage">
						<div class="placeholder-grid" aria-hidden="true"></div>
						<strong
							>{phase === 'error'
								? 'The numerical engine did not start.'
								: 'Preparing a deterministic matrix locally.'}</strong
						>
						<p>
							{phase === 'error'
								? status
								: 'The article remains server-rendered while the browser loads a Worker and numerical routines near this viewport.'}
						</p>
						{#if phase === 'error'}<button
								type="button"
								onclick={() => {
									initializationStarted = false;
									void initialise();
								}}>Try again</button
							>{/if}
					</div>
				{:else}
					<Tabs.Content class="rm-tab-content" value="matrix" data-lens="matrix">
						<MatrixMicroscope
							matrix={view.matrix}
							rows={view.rows}
							columns={view.columns}
							colourScale={experimentState.colourScale}
							highContrast={experimentState.highContrast}
							{rearrangement}
							comparisonMatrix={view.comparisonMatrix}
							comparisonEigenError={view.comparisonEigenError}
							onrearrangementchange={changeRearrangement}
						/>
					</Tabs.Content>
					<Tabs.Content class="rm-tab-content" value="spectrum" data-lens="spectrum">
						<SpectralSky
							eigen={view.eigen}
							theory={view.theory}
							theoryVisible={experimentState.theory}
							symmetric={displayedSymmetric}
							ensemblePoints={experimentState.mode === 'ensemble' ? ensemble.eigenvalues : []}
							highContrast={experimentState.highContrast}
							selectedIndex={selectedEigen}
							onselect={chooseEigen}
						/>
					</Tabs.Content>
					<Tabs.Content class="rm-tab-content" value="singular-values" data-lens="singular-values">
						<SingularValueMountain
							singular={view.singular}
							rows={view.rows}
							columns={view.columns}
							reconstruction={view.reconstruction}
							reconstructionRank={view.reconstructionRank ?? reconstructionRank}
							reconstructionError={view.reconstructionError}
							colourScale={experimentState.colourScale}
							highContrast={experimentState.highContrast}
							onrankchange={changeRank}
						/>
					</Tabs.Content>
					<Tabs.Content class="rm-tab-content" value="direction" data-lens="direction">
						<DirectionMachine
							matrix={view.matrix}
							rows={view.rows}
							columns={view.columns}
							eigen={view.eigen}
							singular={view.singular}
							spectralRadius={view.summary.spectralRadius}
							highContrast={experimentState.highContrast}
						/>
					</Tabs.Content>
					<Tabs.Content class="rm-tab-content" value="structure" data-lens="structure">
						<StructureDetector
							signalType={experimentState.signalType}
							signalStrength={experimentState.signalStrength}
							{nullResult}
							phase={nullPhase}
							nullDescription={nullDescription()}
							onsignalchange={(signalType) => changeState({ signalType }, true)}
							onstrengthchange={(signalStrength, commit) => changeState({ signalStrength }, commit)}
							onrun={runNullComparison}
						/>
					</Tabs.Content>
					<Tabs.Content class="rm-tab-content" value="ensemble" data-lens="ensemble">
						<EnsembleLaboratory
							summary={ensemble}
							paused={ensemblePaused}
							busy={ensembleBusy}
							targetSamples={experimentState.sampleCount}
							speed={ensembleSpeed}
							onsamplecountchange={changeSampleCount}
							onspeedchange={changeSpeed}
							onstart={startEnsemble}
							onpause={() => pauseEnsemble()}
							onresume={startEnsemble}
							onclear={() => clearEnsemble()}
							onreplay={replayEnsemble}
						/>
					</Tabs.Content>
				{/if}
			</main>

			<InstrumentControls
				state={experimentState}
				disabled={!initialized}
				{busy}
				onchange={changeState}
				onreroll={reroll}
				oncopyseed={() => copyText(experimentState.seed, 'seed')}
				onreset={resetExperiment}
			/>
		</div>
	</Tabs.Root>

	<ExperimentCards
		cards={EXPERIMENT_CARDS}
		active={activeExperiment}
		canUndo={Boolean(previousExperimentState)}
		onapply={applyExperiment}
		onundo={undoExperiment}
	/>
	<AccessibleMatrixSummary
		analysis={view}
		seed={experimentState.seed}
		ensembleLabel={PRESET_LABELS[experimentState.preset]}
		normalisationLabel={normalisationLabel()}
	/>

	<footer class="instrument-footer">
		<p>
			<strong>Scientific boundary.</strong> One matrix is a realization, not a law. Theoretical overlays
			are finite-size comparisons to asymptotic results under stated assumptions. Display transformations
			can manufacture apparent structure.
		</p>
		<p>
			<strong>Numerical boundary.</strong> Decompositions use double precision in an isolated Worker,
			bounded dimensions, residual checks, cancellation, and latest-result guards. Pseudorandom output
			is algorithmic and reproducible.
		</p>
	</footer>

	<noscript>
		<p class="noscript">
			JavaScript is disabled. The surrounding article still explains the experiment, but generating
			and decomposing a seeded matrix requires a local browser Worker. The default experiment uses
			an n × n IID real matrix with entry variance 1/n; its finite eigenvalue cloud is compared with
			the circular law only as a large-n reference.
		</p>
	</noscript>
</section>

<style>
	.random-matrix-instrument {
		--rm-sans: Inter, ui-sans-serif, system-ui, sans-serif;
		--rm-mono: 'Courier Prime', ui-monospace, monospace;
		--rm-paper: var(--paper, #f4efe4);
		--rm-surface: var(--paper-raised, #f8f4eb);
		--rm-plot-paper: color-mix(in srgb, var(--paper, #f4efe4) 96%, var(--ink, #202623));
		--rm-ink: var(--ink, #202623);
		--rm-muted: var(--ink-muted, #626c67);
		--rm-rule: var(--rule, #c8c1b5);
		--rm-control: var(--control-border, #9f988b);
		--rm-accent: var(--accent, #866125);
		--rm-accent-ink: var(--accent-foreground, #fffdf7);
		--rm-focus: var(--focus, #2f72bc);
		--rm-point: #2c7180;
		--rm-density: #437f99;
		--rm-theory: #8064a8;
		--rm-selected: #c86a32;
		--rm-warning: #a14935;
		--rm-ordinary: #327052;
		--rm-radius: 0.45rem;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		container-name: random-matrix-lab;
		container-type: inline-size;
		box-sizing: border-box;
		width: min(96rem, calc(100vw - 1rem));
		max-width: none;
		margin: 2.25rem 0 2.75rem;
		transform: translateX(-50%);
		overflow: hidden;
		border: 1px solid var(--rm-rule);
		border-radius: 0.8rem;
		background: var(--rm-paper);
		color: var(--rm-ink);
		font-family: var(--rm-sans);
		box-shadow: 0 1.2rem 3rem color-mix(in srgb, var(--rm-ink) 10%, transparent);
	}
	.random-matrix-instrument.high-contrast {
		--rm-point: #00535c;
		--rm-density: #005c75;
		--rm-theory: #5b2688;
		--rm-selected: #a43b00;
		--rm-warning: #8d230f;
		--rm-ordinary: #00572f;
		--rm-rule: color-mix(in srgb, var(--rm-ink) 62%, var(--rm-paper));
	}
	.instrument-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.2rem;
		border-bottom: 1px solid var(--rm-rule);
		background: var(--rm-surface);
		padding: 1rem 1.1rem;
	}
	.instrument-header p,
	.instrument-header h2,
	.instrument-status p,
	.instrument-footer p,
	.loading-stage p,
	.noscript {
		margin: 0;
	}
	.kicker {
		color: var(--rm-accent);
		font: 800 0.6875rem var(--rm-mono);
		letter-spacing: 0.11em;
	}
	.instrument-header h2 {
		max-width: 55rem;
		margin-top: 0.2rem;
		font-size: clamp(1.25rem, 2.2vw, 2rem);
		line-height: 1.12;
	}
	.deck {
		max-width: 62rem;
		margin-top: 0.32rem !important;
		color: var(--rm-muted);
		font-family: var(--font-article-body, Georgia, serif);
		font-size: 0.83rem;
		line-height: 1.45;
	}
	.header-actions {
		display: flex;
		flex: none;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.4rem;
	}
	:global(.random-matrix-instrument .rm-action) {
		min-height: 2.75rem;
		border-color: var(--rm-control);
		background: var(--rm-paper);
		color: var(--rm-ink);
		box-shadow: none;
		font-size: 0.75rem;
		font-weight: 800;
	}
	:global(.random-matrix-instrument .rm-action:hover:not(:disabled)) {
		border-color: var(--rm-accent);
		color: var(--rm-accent);
	}
	:global(.random-matrix-instrument .rm-action:not([data-variant='outline']):last-child),
	:global(.random-matrix-instrument .header-actions .rm-action:last-child) {
		border-color: var(--rm-accent);
		background: var(--rm-accent);
		color: var(--rm-accent-ink);
	}
	.instrument-status {
		display: grid;
		grid-template-columns: minmax(11rem, 0.65fr) minmax(8rem, 0.35fr) minmax(20rem, 1fr);
		align-items: center;
		gap: 0.8rem;
		border-bottom: 1px solid var(--rm-rule);
		padding: 0.55rem 0.8rem;
		background: color-mix(in srgb, var(--rm-surface) 92%, var(--rm-accent));
		font-size: 0.72rem;
	}
	.instrument-status > div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-family: var(--rm-mono);
		font-weight: 750;
	}
	.instrument-status output,
	.instrument-status p {
		color: var(--rm-muted);
	}
	.instrument-status progress {
		width: 100%;
		height: 0.6rem;
		accent-color: var(--rm-accent);
	}
	.fact-strip {
		display: grid;
		grid-template-columns: 1.1fr 0.55fr 1.2fr 0.9fr 1.1fr;
		border-bottom: 1px solid var(--rm-rule);
		background: var(--rm-surface);
	}
	.fact-strip > div {
		min-width: 0;
		border-right: 1px solid var(--rm-rule);
		padding: 0.5rem 0.65rem;
	}
	.fact-strip > div:last-child {
		border-right: 0;
	}
	.fact-strip span,
	.fact-strip strong {
		display: block;
	}
	.fact-strip span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		letter-spacing: 0.045em;
		text-transform: uppercase;
	}
	.fact-strip strong {
		overflow: hidden;
		margin-top: 0.15rem;
		font: 700 0.6875rem var(--rm-mono);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fact-strip .warning {
		grid-column: 1 / -1;
		border-top: 1px solid var(--rm-rule);
		border-right: 0;
		background: color-mix(in srgb, var(--rm-warning) 7%, transparent);
	}
	.fact-strip .warning strong {
		overflow: visible;
		color: var(--rm-warning);
		line-height: 1.4;
		text-overflow: clip;
		white-space: normal;
	}
	.tabs-scroll {
		max-width: 100%;
		overflow-x: auto;
		border-bottom: 1px solid var(--rm-rule);
		background: var(--rm-paper);
		overscroll-behavior-inline: contain;
	}
	:global(.random-matrix-instrument .rm-tabs-list) {
		display: inline-flex;
		width: max-content;
		min-width: 100%;
		height: auto;
		min-height: 3.15rem;
		justify-content: flex-start;
		gap: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
	}
	:global(.random-matrix-instrument .rm-tab-trigger) {
		display: inline-flex;
		min-height: 3.15rem;
		gap: 0.4rem;
		border-right: 1px solid var(--rm-rule);
		border-radius: 0;
		padding: 0.55rem 0.8rem;
		color: var(--rm-muted);
		font-size: 0.75rem;
		font-weight: 780;
	}
	:global(.random-matrix-instrument .rm-tab-trigger span) {
		font: 650 0.6875rem var(--rm-mono);
	}
	:global(.random-matrix-instrument .rm-tab-trigger[data-state='active']) {
		box-shadow: inset 0 -3px 0 var(--rm-accent);
		background: color-mix(in srgb, var(--rm-accent) 7%, var(--rm-paper));
		color: var(--rm-ink);
	}
	.instrument-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(19rem, 23rem);
		gap: 0.75rem;
		min-width: 0;
		padding: 0.75rem;
	}
	.stage {
		min-width: 0;
		align-self: start;
	}
	:global(.random-matrix-instrument .rm-tab-content) {
		min-width: 0;
		margin: 0;
		border: 1px solid var(--rm-rule);
		border-radius: var(--rm-radius);
		background: var(--rm-surface);
		padding: 0.8rem;
	}
	.loading-stage {
		display: grid;
		min-height: 32rem;
		place-content: center;
		justify-items: center;
		border: 1px solid var(--rm-rule);
		border-radius: var(--rm-radius);
		background: var(--rm-surface);
		padding: 1rem;
		text-align: center;
	}
	.placeholder-grid {
		width: min(20rem, 72vw);
		aspect-ratio: 1;
		margin-bottom: 1rem;
		border: 1px solid var(--rm-rule);
		background-image:
			linear-gradient(var(--rm-rule) 1px, transparent 1px),
			linear-gradient(90deg, var(--rm-rule) 1px, transparent 1px);
		background-size: 12.5% 12.5%;
		opacity: 0.55;
	}
	.loading-stage strong {
		font-size: 0.9rem;
	}
	.loading-stage p {
		max-width: 36rem;
		margin-top: 0.3rem;
		color: var(--rm-muted);
		font-size: 0.74rem;
		line-height: 1.48;
	}
	.loading-stage button {
		min-height: 2.75rem;
		margin-top: 0.7rem;
		border: 1px solid var(--rm-accent);
		border-radius: 0.38rem;
		background: var(--rm-accent);
		padding: 0.45rem 0.8rem;
		color: var(--rm-accent-ink);
		font: 800 0.75rem var(--rm-sans);
		cursor: pointer;
	}
	.instrument-footer {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		border-top: 1px solid var(--rm-rule);
		background: var(--rm-surface);
		padding: 0.75rem 0.8rem;
	}
	.instrument-footer p,
	.noscript {
		color: var(--rm-muted);
		font-size: 0.7rem;
		line-height: 1.48;
	}
	.instrument-footer strong {
		color: var(--rm-ink);
	}
	.noscript {
		border-top: 1px solid var(--rm-rule);
		padding: 0.75rem 0.8rem;
	}
	.focus-toolbar {
		display: none;
	}
	.random-matrix-instrument:fullscreen,
	.random-matrix-instrument.focus-mode {
		left: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		width: 100vw;
		height: 100dvh;
		max-height: none;
		margin: 0;
		transform: none;
		overflow: hidden;
		border: 0;
		border-radius: 0;
		padding: 0 0 env(safe-area-inset-bottom);
		background: var(--rm-paper);
	}
	.random-matrix-instrument.focus-mode {
		position: fixed;
		z-index: 1000;
		inset: 0;
	}
	.random-matrix-instrument:fullscreen .focus-toolbar,
	.random-matrix-instrument.focus-mode .focus-toolbar {
		display: grid;
		grid-template-columns: minmax(12rem, 0.7fr) minmax(12rem, 1fr) auto;
		align-items: center;
		gap: 0.8rem;
		border-bottom: 1px solid var(--rm-rule);
		background: var(--rm-surface);
		padding: calc(0.5rem + env(safe-area-inset-top)) 0.7rem 0.5rem;
	}
	.focus-toolbar > div:first-child {
		display: grid;
		gap: 0.1rem;
	}
	.focus-toolbar > div:first-child span {
		color: var(--rm-accent);
		font: 750 0.6875rem var(--rm-mono);
		letter-spacing: 0.08em;
	}
	.focus-toolbar > div:first-child strong {
		font-size: 0.8rem;
	}
	.focus-progress {
		display: grid;
		gap: 0.25rem;
		color: var(--rm-muted);
		font-size: 0.6875rem;
	}
	.focus-progress progress {
		width: 100%;
		accent-color: var(--rm-accent);
	}
	.random-matrix-instrument:fullscreen > :not(.focus-toolbar),
	.random-matrix-instrument.focus-mode > :not(.focus-toolbar) {
		min-height: 0;
	}
	.random-matrix-instrument:fullscreen .instrument-header,
	.random-matrix-instrument:fullscreen .instrument-status,
	.random-matrix-instrument:fullscreen .fact-strip,
	.random-matrix-instrument:fullscreen > :global(.experiment-cards),
	.random-matrix-instrument:fullscreen > :global(.accessible-summary),
	.random-matrix-instrument:fullscreen .instrument-footer,
	.random-matrix-instrument.focus-mode .instrument-header,
	.random-matrix-instrument.focus-mode .instrument-status,
	.random-matrix-instrument.focus-mode .fact-strip,
	.random-matrix-instrument.focus-mode > :global(.experiment-cards),
	.random-matrix-instrument.focus-mode > :global(.accessible-summary),
	.random-matrix-instrument.focus-mode .instrument-footer {
		display: none;
	}
	.random-matrix-instrument:fullscreen :global(.rm-tabs),
	.random-matrix-instrument.focus-mode :global(.rm-tabs) {
		min-height: 0;
		overflow: hidden;
	}
	.random-matrix-instrument:fullscreen .instrument-body,
	.random-matrix-instrument.focus-mode .instrument-body {
		height: calc(100dvh - 7.1rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
		min-height: 0;
		overflow: hidden;
	}
	.random-matrix-instrument:fullscreen .stage,
	.random-matrix-instrument.focus-mode .stage,
	.random-matrix-instrument:fullscreen :global(.rm-tab-content),
	.random-matrix-instrument.focus-mode :global(.rm-tab-content) {
		height: 100%;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.random-matrix-instrument:fullscreen :global(.instrument-controls),
	.random-matrix-instrument.focus-mode :global(.instrument-controls) {
		max-height: 100%;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	@container random-matrix-lab (max-width: 74rem) {
		.instrument-body {
			grid-template-columns: minmax(0, 1fr);
		}
		.instrument-status {
			grid-template-columns: minmax(12rem, 0.7fr) minmax(8rem, 0.3fr);
		}
		.instrument-status p {
			grid-column: 1 / -1;
		}
		.fact-strip {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.fact-strip > div:nth-child(3) {
			border-right: 0;
		}
		.fact-strip > div:nth-child(-n + 3) {
			border-bottom: 1px solid var(--rm-rule);
		}
	}
	@media (max-width: 52rem) {
		.instrument-header {
			flex-direction: column;
		}
		.header-actions {
			width: 100%;
			justify-content: stretch;
		}
		:global(.random-matrix-instrument .header-actions .rm-action) {
			flex: 1 1 10rem;
		}
		.instrument-footer {
			grid-template-columns: minmax(0, 1fr);
		}
		.random-matrix-instrument:fullscreen .focus-toolbar,
		.random-matrix-instrument.focus-mode .focus-toolbar {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.focus-progress {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.random-matrix-instrument:fullscreen .instrument-body,
		.random-matrix-instrument.focus-mode .instrument-body {
			display: block;
			height: calc(100dvh - 9.9rem - env(safe-area-inset-top) - env(safe-area-inset-bottom));
			overflow-y: auto;
		}
		.random-matrix-instrument:fullscreen :global(.instrument-controls),
		.random-matrix-instrument.focus-mode :global(.instrument-controls) {
			margin-top: 0.7rem;
			max-height: none;
		}
	}
	@media (max-width: 40rem) {
		.random-matrix-instrument {
			width: calc(100vw - 0.5rem);
			margin-block: 1.5rem 2rem;
			border-radius: 0.55rem;
		}
		.instrument-header,
		.instrument-body {
			padding: 0.6rem;
		}
		.header-actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.header-actions :global(.rm-action:last-child) {
			grid-column: 1 / -1;
		}
		.instrument-status {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.35rem;
		}
		.instrument-status p {
			grid-column: 1;
		}
		.fact-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.fact-strip > div,
		.fact-strip > div:nth-child(3) {
			border-right: 1px solid var(--rm-rule);
			border-bottom: 1px solid var(--rm-rule);
		}
		.fact-strip > div:nth-child(even) {
			border-right: 0;
		}
		.fact-strip > div:last-child {
			border-bottom: 0;
		}
		:global(.random-matrix-instrument .rm-tab-trigger) {
			min-height: 2.75rem;
			padding-inline: 0.65rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.random-matrix-instrument *,
		.random-matrix-instrument *::before,
		.random-matrix-instrument *::after {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}
	@media (forced-colors: active) {
		.random-matrix-instrument,
		.instrument-header,
		.instrument-status,
		.fact-strip,
		.fact-strip > div,
		.tabs-scroll,
		.instrument-footer,
		.focus-toolbar {
			border-color: CanvasText;
		}
		:global(.random-matrix-instrument .rm-action) {
			border-color: ButtonText;
			background: ButtonFace;
			color: ButtonText;
		}
		:global(.random-matrix-instrument .rm-tab-trigger[data-state='active']) {
			outline: 2px solid Highlight;
			outline-offset: -2px;
		}
	}
	@media print {
		.random-matrix-instrument {
			left: 0;
			width: 100%;
			margin: 1rem 0;
			transform: none;
			box-shadow: none;
		}
		.header-actions,
		.tabs-scroll,
		:global(.instrument-controls),
		:global(.experiment-cards) {
			display: none !important;
		}
		.instrument-body {
			display: block;
		}
	}
</style>
