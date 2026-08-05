<script lang="ts">
	import {
		pushState as pushNavigationState,
		replaceState as replaceNavigationState
	} from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { SvelteMap, SvelteURL } from 'svelte/reactivity';
	import AccessibleRunTable from './AccessibleRunTable.svelte';
	import MetricsChart from './MetricsChart.svelte';
	import RegressionLandscape from './RegressionLandscape.svelte';
	import StepMicroscope from './StepMicroscope.svelte';
	import TerrainStage from './TerrainStage.svelte';
	import TopographicMap from './TopographicMap.svelte';
	import type { ObjectPoint, SampledGrid, TerrainRun } from './types';
	import {
		classifyLocalHessian,
		directionalLossProfile,
		hessianAt,
		releaseParticleStarts,
		runOptimizerRace,
		type DirectionalProfile,
		type MomentumStabilityCell,
		type MomentumStabilityGrid,
		type OptimizerRaceEntry,
		type ParticleTrajectory,
		type StabilitySweepEntry
	} from '$lib/visualizations/gradient-descent/analysis';
	import { AnalysisWorkerClient } from '$lib/visualizations/gradient-descent/analysis-worker-client';
	import { simulationToCsv, safeExportStem } from '$lib/visualizations/gradient-descent/exports';
	import { sampleGradient } from '$lib/visualizations/gradient-descent/gradients';
	import {
		createLandscape,
		isRegressionLandscape,
		REGRESSION_BASE_POINTS,
		REGRESSION_OUTLIER
	} from '$lib/visualizations/gradient-descent/landscapes';
	import { SeededRandom } from '$lib/visualizations/gradient-descent/prng';
	import {
		GradientDescentSimulation,
		isTerminalStatus
	} from '$lib/visualizations/gradient-descent/simulation';
	import {
		createDefaultExperimentState,
		parseExperimentUrlState,
		serializeExperimentUrlState,
		type ExperimentUrlState
	} from '$lib/visualizations/gradient-descent/url-state';
	import type {
		BasinGrid,
		GradientMode,
		LandscapeDefinition,
		LandscapeId,
		LandscapeSelection,
		OptimizerConfig,
		OptimizerId,
		QuadraticLandscapeDefinition,
		RunStatus,
		SimulationHistoryPoint,
		SimulationSnapshot,
		Vector2
	} from '$lib/visualizations/gradient-descent/types';

	type MobileView = 'terrain' | 'map' | 'microscope' | 'metrics';
	type CameraPreset = 'perspective' | 'topographic' | 'ravine' | 'side';
	type HeightMapping = 'linear' | 'log-compressed';
	type AnalysisState = 'idle' | 'working' | 'complete' | 'error';
	type MetricMode = 'loss' | 'gradientNorm' | 'stepNorm' | 'distance';
	type MetricsXAxis = 'iteration' | 'gradientEvaluations';
	type WeatherRegime = 'converged' | 'slow' | 'oscillatory' | 'hazard' | 'unresolved';
	type ParticleOverlayState = Readonly<{
		gradientField: boolean;
		curvature: boolean;
		hessianVectors: boolean;
		tangentPlane: boolean;
		pathMarkers: boolean;
		crossSection: boolean;
	}>;
	type ToggleControl = readonly [label: string, checked: boolean, update: (value: boolean) => void];
	type PresetId =
		| 'sensible-bowl'
		| 'drunken-ravine'
		| 'momentum-remembers'
		| 'one-step-too-far'
		| 'four-valleys'
		| 'saddle-pretends'
		| 'static-compass'
		| 'line-learns'
		| 'outlier-valley';
	type Props = { initialCommand?: 'begin' | 'open' | null; commandId?: number };

	let { initialCommand = null, commandId = 0 }: Props = $props();
	const gridCache = new SvelteMap<string, SampledGrid>();
	const basinCache = new SvelteMap<string, BasinGrid>();
	const stabilityCache = new SvelteMap<string, readonly StabilitySweepEntry[]>();
	const momentumStabilityCache = new SvelteMap<string, MomentumStabilityGrid>();
	let laboratory: HTMLElement;
	let landscapeId = $state<LandscapeId>('rosenbrock');
	let optimizerId = $state<OptimizerId>('gd');
	let learningRate = $state(0.001);
	let learningRateExponent = $state(-3);
	let momentumBeta = $state(0.9);
	let rmsRho = $state(0.9);
	let adamBeta1 = $state(0.9);
	let adamBeta2 = $state(0.999);
	let epsilon = $state(1e-8);
	let start = $state<Vector2>([-1.2, 1]);
	let seed = $state('descent-1847');
	let speed = $state(12);
	let maximumIterations = $state(2_000);
	let gradientTolerance = $state(1e-7);
	let batchSize = $state<1 | 2 | 4 | 'full'>('full');
	let noiseStrength = $state(0);
	let quadraticLambda1 = $state(1);
	let quadraticLambda2 = $state(14);
	let quadraticRotation = $state(Math.PI / 6);
	let regressionOutlier = $state(false);
	let heightMapping = $state<HeightMapping>('log-compressed');
	let cameraPreset = $state<CameraPreset>('ravine');
	let mobileView = $state<MobileView>('terrain');
	let compactLayout = $state(false);
	let selectedIteration = $state(0);
	let activePreset = $state<PresetId | ''>('');
	let playing = $state(false);
	let reducedMotion = $state(false);
	let offscreen = $state(false);
	let initialized = $state(false);
	let cameraRevision = $state(0);
	let transitionProgress = $state(1);
	let showContours = $state(true);
	let showGradientField = $state(false);
	let showCurrentGradient = $state(true);
	let showUpdateVector = $state(true);
	let showCurvature = $state(true);
	let showHessianVectors = $state(true);
	let showTangentPlane = $state(true);
	let showPathMarkers = $state(true);
	let showCrossSection = $state(true);
	let showBasin = $state(false);
	let showParticles = $state(false);
	let showKnownMinima = $state(true);
	let probe = $state<Vector2 | null>(null);
	let statusAnnouncement = $state('The optimizer is ready.');
	let configurationError = $state('');
	let copiedMessage = $state('');
	let terrainStatus = $state('Preparing the terrain.');
	let advancedOpen = $state(false);
	let analysisOpen = $state(false);
	let metricMode = $state<MetricMode>('loss');
	let metricsXAxis = $state<MetricsXAxis>('gradientEvaluations');
	let metricsLogScale = $state(true);
	let metricsAutoScale = $state(false);

	const initialLandscape = createLandscape('rosenbrock');
	let landscape = $state<LandscapeDefinition>(initialLandscape);
	let grid = $state<SampledGrid | null>(sampleLandscape(initialLandscape));
	let gradientField = $state(buildGradientField(initialLandscape));
	let simulation = new GradientDescentSimulation(makeSimulationConfig());
	let analysisClient: AnalysisWorkerClient | null = null;
	let particleClient: AnalysisWorkerClient | null = null;
	let snapshot = $state<SimulationSnapshot>(simulation.snapshot());
	let basin = $state<BasinGrid | null>(null);
	let basinState = $state<AnalysisState>('idle');
	let basinMessage = $state('No basin survey has been requested.');
	let particleTrajectories = $state<readonly ParticleTrajectory[]>([]);
	let particleStep = $state(0);
	let particlePlaying = $state(false);
	let race = $state<readonly OptimizerRaceEntry[]>([]);
	let raceEvaluationCap = $state(0);
	let raceObservation = $state('');
	let stability = $state<readonly StabilitySweepEntry[]>([]);
	let momentumStability = $state<MomentumStabilityGrid | null>(null);
	let stabilityState = $state<AnalysisState>('idle');
	let stabilityMessage = $state('No learning-rate survey has been requested.');

	let frameId = 0;
	let previousTimestamp = 0;
	let accumulator = 0;
	let particleAccumulator = 0;
	let urlTimer = 0;
	let copyTimer = 0;
	let analysisGeneration = 0;
	let particleGeneration = 0;
	let routeRestoreGeneration = 0;
	let particleOverlayRestore: ParticleOverlayState | null = null;
	let commandFrameId = 0;
	let destroyed = false;
	let pendingBeginCommand = false;

	let selectedIndex = $derived(
		Math.max(0, Math.min(selectedIteration, snapshot.history.length - 1))
	);
	let selectedRecord = $derived(snapshot.history[selectedIndex] ?? null);
	let microscopeTransitionIndex = $derived(selectedIndex + 1);
	let microscopeTransition = $derived(
		microscopeTransitionIndex < snapshot.history.length
			? (snapshot.history[microscopeTransitionIndex] ?? null)
			: null
	);
	let microscopeOrigin = $derived(selectedRecord);
	let currentRecord = $derived(snapshot.history.at(-1) ?? null);
	let displayStatus = $derived(
		configurationError
			? 'Invalid parameter configuration'
			: playing && !isTerminalStatus(snapshot.status)
				? 'Running'
				: snapshot.statusMessage
	);
	let displayTheta = $derived(displayThetaAtSelection());
	let raceRuns = $derived(makeRaceRuns());
	let particleRuns = $derived(makeParticleRuns());
	let overlayRuns = $derived([...raceRuns, ...particleRuns]);
	let particles = $derived(makeParticlePositions());
	let quadraticFacts = $derived(
		landscape.id === 'quadratic' ? (landscape as QuadraticLandscapeDefinition) : null
	);
	let regressionFacts = $derived(isRegressionLandscape(landscape) ? landscape : null);
	let referenceMinimum = $derived(landscape.knownMinima[0]?.theta ?? null);
	let probeLoss = $derived(probe ? rawLossAt(probe) : null);
	let microscopeRecord = $derived(makeMicroscopeRecord(microscopeOrigin, microscopeTransition));
	let microscopeNextPoint = $derived(microscopeTransition?.theta ?? null);
	let microscopeNextLoss = $derived(microscopeTransition?.loss ?? null);
	let selectedProfile = $derived(makeDirectionalProfile(microscopeRecord));
	let selectedCurvature = $derived(makeCurvature(microscopeRecord));
	let microscopeEigensystem = $derived(
		selectedCurvature && (showCurvature || showHessianVectors)
			? {
					values: selectedCurvature.eigenvalues,
					vectors: selectedCurvature.eigenvectors,
					classification: selectedCurvature.classification
				}
			: null
	);
	let microscopeProfile = $derived(
		selectedProfile?.points.map((point) => ({ alpha: point.offset, loss: point.loss })) ?? []
	);
	let microscopeAuxiliaryVectors = $derived(buildAuxiliaryVectors(microscopeTransition));
	let microscopeUncertaintyFan = $derived(buildUncertaintyFan(microscopeRecord));
	let stableMetricYDomain = $derived(metricYDomain());
	let gradientModeLabel = $derived(
		landscapeId === 'regression'
			? batchSize === 'full'
				? 'Full-data gradient'
				: `Minibatch gradient · n=${batchSize}`
			: noiseStrength > 0
				? `Noisy-gradient experiment · σ=${formatNumber(noiseStrength)}`
				: 'Exact analytic gradient'
	);

	const LANDSCAPE_OPTIONS: readonly { id: LandscapeId; label: string }[] = [
		{ id: 'quadratic', label: 'Quadratic bowl' },
		{ id: 'rosenbrock', label: 'Rosenbrock ravine' },
		{ id: 'himmelblau', label: 'Himmelblau’s four valleys' },
		{ id: 'rastrigin', label: 'Rastrigin corrugations' },
		{ id: 'saddle', label: 'Contained saddle' },
		{ id: 'plateau', label: 'Plateau' },
		{ id: 'regression', label: 'Regression as terrain' }
	];
	const MOBILE_VIEWS: readonly MobileView[] = ['terrain', 'map', 'microscope', 'metrics'];
	const OPTIMIZER_OPTIONS: readonly { id: OptimizerId; label: string }[] = [
		{ id: 'gd', label: 'Gradient Descent' },
		{ id: 'momentum', label: 'Momentum' },
		{ id: 'rmsprop', label: 'RMSProp' },
		{ id: 'adam', label: 'Adam' }
	];
	const EXPERIMENT_QUERY_KEYS = new Set([
		'v',
		'landscape',
		'optimizer',
		'lr',
		'x',
		'y',
		'seed',
		'speed',
		'max',
		'tol',
		'l1',
		'l2',
		'angle',
		'outlier',
		'beta',
		'rho',
		'beta1',
		'beta2',
		'eps',
		'batch',
		'noise',
		'gd_v',
		'view',
		'camera',
		'height',
		'preset',
		'basin',
		'flow',
		'race',
		'layers'
	]);
	const PRESETS: readonly { id: PresetId; label: string; question: string }[] = [
		{
			id: 'sensible-bowl',
			label: 'The sensible bowl',
			question: 'What does one ordinary gradient update do?'
		},
		{
			id: 'drunken-ravine',
			label: 'The drunken ravine',
			question: 'Why does poor conditioning make the path zig-zag?'
		},
		{
			id: 'momentum-remembers',
			label: 'Momentum remembers',
			question: 'Which direction survives repeated gradients?'
		},
		{
			id: 'one-step-too-far',
			label: 'One step too far',
			question: 'What happens just beyond the exact stability boundary?'
		},
		{
			id: 'four-valleys',
			label: 'Four valleys, four fates',
			question: 'Which minimum owns each starting point?'
		},
		{
			id: 'saddle-pretends',
			label: 'The saddle that pretends to be finished',
			question: 'Can a tiny gradient certify a minimum?'
		},
		{
			id: 'static-compass',
			label: 'Static in the compass',
			question: 'Can noise change a path without guaranteeing a global answer?'
		},
		{
			id: 'line-learns',
			label: 'The line learns to fit',
			question: 'How does a poor line become a point on an MSE bowl?'
		},
		{
			id: 'outlier-valley',
			label: 'The outlier moves the valley',
			question: 'How does changing one datum move the objective itself?'
		}
	];

	function optimizerConfig(): OptimizerConfig {
		if (optimizerId === 'momentum') {
			return { id: optimizerId, learningRate, beta: momentumBeta };
		}
		if (optimizerId === 'rmsprop') {
			return { id: optimizerId, learningRate, rho: rmsRho, epsilon };
		}
		if (optimizerId === 'adam') {
			return {
				id: optimizerId,
				learningRate,
				beta1: adamBeta1,
				beta2: adamBeta2,
				epsilon
			};
		}
		return { id: 'gd', learningRate };
	}

	function gradientMode(): GradientMode {
		if (landscapeId === 'regression') return { kind: 'minibatch', batchSize };
		if (noiseStrength > 0) return { kind: 'noisy', sigma: noiseStrength };
		return { kind: 'full' };
	}

	function landscapeSelection(): LandscapeSelection {
		if (landscapeId === 'quadratic') {
			const parameters =
				configurationError && landscape.id === 'quadratic'
					? (landscape as QuadraticLandscapeDefinition).parameters
					: {
							lambda1: quadraticLambda1,
							lambda2: quadraticLambda2,
							rotation: quadraticRotation
						};
			return {
				id: 'quadratic',
				quadratic: parameters
			};
		}
		if (landscapeId === 'regression') return { id: 'regression', regressionOutlier };
		return { id: landscapeId };
	}

	function liveMetricRows(): readonly (readonly [string, string])[] {
		return [
			['Iteration', snapshot.iteration.toString()],
			['Gradient evaluations', snapshot.gradientEvaluations.toString()],
			['Raw loss', formatNumber(snapshot.loss, 8)],
			['Full-gradient norm at current θ', formatNumber(exactGradientNorm(snapshot.theta), 7)],
			['Incoming step norm', formatNumber(currentRecord?.stepNorm, 7)],
			[landscape.parameterLabels[0], formatNumber(snapshot.theta[0], 6)],
			[landscape.parameterLabels[1], formatNumber(snapshot.theta[1], 6)],
			['Seed', seed]
		];
	}

	function displayThetaAtSelection(): Vector2 {
		const selected = selectedRecord?.theta ?? snapshot.theta;
		if (
			selectedIndex !== snapshot.history.length - 1 ||
			selectedIndex < 1 ||
			transitionProgress >= 1
		) {
			return selected;
		}
		const previous = snapshot.history[selectedIndex - 1]?.theta;
		if (!previous) return selected;
		return [
			previous[0] + (selected[0] - previous[0]) * transitionProgress,
			previous[1] + (selected[1] - previous[1]) * transitionProgress
		];
	}

	function overlayMask(): string {
		const layers = [
			showContours,
			showGradientField,
			showCurrentGradient,
			showUpdateVector,
			showCurvature,
			showHessianVectors,
			showTangentPlane,
			showPathMarkers,
			showCrossSection,
			showKnownMinima
		];
		return layers
			.reduce((mask, enabled, index) => mask | (enabled ? 1 << index : 0), 0)
			.toString(36);
	}

	function applyOverlayMask(raw: string | null): void {
		const defaults = [true, false, true, true, true, true, true, true, true, true] as const;
		const parsed =
			raw === null || !/^[0-9a-z]+$/iu.test(raw) ? Number.NaN : Number.parseInt(raw, 36);
		const mask = Number.isSafeInteger(parsed) && parsed >= 0 && parsed < 1 << 10 ? parsed : null;
		const enabled = (index: number) =>
			mask === null ? defaults[index] : Boolean(mask & (1 << index));
		showContours = enabled(0);
		showGradientField = enabled(1);
		showCurrentGradient = enabled(2);
		showUpdateVector = enabled(3);
		showCurvature = enabled(4);
		showHessianVectors = enabled(5);
		showTangentPlane = enabled(6);
		showPathMarkers = enabled(7);
		showCrossSection = enabled(8);
		showKnownMinima = enabled(9);
	}

	function metricYDomain(): readonly [number, number] {
		if (metricMode === 'loss') {
			const minimum = grid?.min ?? Math.min(0, snapshot.history[0]?.loss ?? 0);
			const maximum = Math.max(grid?.max ?? 1, snapshot.history[0]?.loss ?? 0, minimum + 1e-9);
			return [minimum, maximum];
		}
		if (metricMode === 'gradientNorm') {
			const maximum = Math.max(
				1e-9,
				...gradientField.map((sample) => Math.hypot(sample.gradient[0], sample.gradient[1]))
			);
			return [0, maximum * 1.08];
		}
		const diagonal = Math.hypot(
			landscape.domain.max[0] - landscape.domain.min[0],
			landscape.domain.max[1] - landscape.domain.min[1]
		);
		return [0, metricMode === 'stepNorm' ? diagonal * 1.25 : diagonal];
	}

	function overlayControls(): readonly ToggleControl[] {
		return [
			['Contours', showContours, (value) => (showContours = value)],
			['Gradient field', showGradientField, (value) => (showGradientField = value)],
			['Current gradient', showCurrentGradient, (value) => (showCurrentGradient = value)],
			['Actual update', showUpdateVector, (value) => (showUpdateVector = value)],
			['Curvature ellipse', showCurvature, (value) => (showCurvature = value)],
			['Hessian eigenvectors', showHessianVectors, (value) => (showHessianVectors = value)],
			['Tangent plane', showTangentPlane, (value) => (showTangentPlane = value)],
			['Path markers', showPathMarkers, (value) => (showPathMarkers = value)],
			['Cross-section', showCrossSection, (value) => (showCrossSection = value)],
			['Known minima', showKnownMinima, (value) => (showKnownMinima = value)]
		];
	}

	function buildAuxiliaryVectors(record: SimulationHistoryPoint | null) {
		const diagnostics = record?.optimizerDiagnostics;
		if (!diagnostics) return [];
		const vectors: { label: string; vector: Vector2; kind: 'memory' | 'estimate' }[] = [];
		if (diagnostics.velocity) {
			vectors.push({ label: 'Momentum velocity vₜ', vector: diagnostics.velocity, kind: 'memory' });
		}
		if (diagnostics.firstMoment) {
			vectors.push({
				label: 'Adam first moment mₜ',
				vector: diagnostics.firstMoment,
				kind: 'memory'
			});
		}
		if (diagnostics.accumulatedSquares) {
			vectors.push({
				label: 'RMSProp squared-gradient state',
				vector: diagnostics.accumulatedSquares,
				kind: 'estimate'
			});
		}
		return vectors;
	}

	function buildUncertaintyFan(record: SimulationHistoryPoint | null): readonly Vector2[] {
		if (!record) return [];
		const mode = gradientMode();
		if (mode.kind === 'full' || (mode.kind === 'minibatch' && mode.batchSize === 'full')) return [];
		const random = new SeededRandom(`${seed}:microscope-fan:${landscapeId}:${record.iteration}`);
		const samples: Vector2[] = [];
		for (let index = 0; index < 9; index += 1) {
			try {
				samples.push(sampleGradient(landscape, record.theta, mode, random).active);
			} catch {
				break;
			}
		}
		return samples;
	}

	function makeMicroscopeRecord(
		origin: SimulationHistoryPoint | null,
		outgoing: SimulationHistoryPoint | null
	): SimulationHistoryPoint | null {
		if (!origin) return null;
		let fullGradient = outgoing?.fullGradient ?? null;
		if (!fullGradient) {
			try {
				fullGradient = landscape.gradient(origin.theta);
			} catch {
				fullGradient = null;
			}
		}
		const mode = gradientMode();
		const exactActive =
			mode.kind === 'full' || (mode.kind === 'minibatch' && mode.batchSize === 'full');
		const activeGradient = outgoing?.gradient ?? (exactActive ? fullGradient : null);
		return {
			...origin,
			gradientEvaluations: outgoing?.gradientEvaluations ?? origin.gradientEvaluations,
			gradient: showCurrentGradient ? activeGradient : null,
			fullGradient,
			update: showUpdateVector ? (outgoing?.update ?? null) : null,
			gradientNorm: activeGradient ? Math.hypot(activeGradient[0], activeGradient[1]) : null,
			stepNorm: outgoing?.stepNorm ?? null,
			optimizerDiagnostics: outgoing?.optimizerDiagnostics ?? null,
			batchIndices: outgoing?.batchIndices ?? null
		};
	}

	function makeSimulationConfig() {
		return {
			landscape,
			start,
			optimizer: optimizerConfig(),
			gradientMode: gradientMode(),
			seed,
			maximumIterations,
			gradientTolerance,
			stepTolerance: 1e-13,
			stallPatience: 10
		};
	}

	function sampleLandscape(definition: LandscapeDefinition, resolution = 84): SampledGrid {
		const cacheKey = `${landscapeCacheKey(definition)}@${resolution}`;
		const cached = gridCache.get(cacheKey);
		if (cached) return cached;
		const width = resolution;
		const height = resolution;
		const values = new Float64Array(width * height);
		const finite: number[] = [];
		for (let row = 0; row < height; row += 1) {
			const y =
				definition.domain.min[1] +
				((definition.domain.max[1] - definition.domain.min[1]) * row) / (height - 1);
			for (let column = 0; column < width; column += 1) {
				const x =
					definition.domain.min[0] +
					((definition.domain.max[0] - definition.domain.min[0]) * column) / (width - 1);
				const value = definition.value([x, y]);
				values[row * width + column] = value;
				if (Number.isFinite(value)) finite.push(value);
			}
		}
		finite.sort((left, right) => left - right);
		const quantile = (fraction: number) =>
			finite[
				Math.max(0, Math.min(finite.length - 1, Math.round((finite.length - 1) * fraction)))
			] ?? 0;
		const sampled = {
			width,
			height,
			values,
			min: quantile(0.01),
			max: Math.max(quantile(0.97), quantile(0.01) + Number.EPSILON)
		};
		gridCache.set(cacheKey, sampled);
		if (gridCache.size > 16) gridCache.delete(gridCache.keys().next().value ?? cacheKey);
		return sampled;
	}

	function landscapeCacheKey(definition: LandscapeDefinition): string {
		if (definition.id === 'quadratic') {
			const quadratic = definition as QuadraticLandscapeDefinition;
			return `quadratic:${quadratic.parameters.lambda1}:${quadratic.parameters.lambda2}:${quadratic.parameters.rotation}`;
		}
		if (isRegressionLandscape(definition)) return `regression:${definition.includesOutlier}`;
		return definition.id;
	}

	function analysisCacheKey(
		kind: 'basin' | 'stability' | 'momentum-stability',
		resolutionOrRates: unknown
	): string {
		return JSON.stringify({
			kind,
			landscape: landscapeSelection(),
			optimizer: optimizerConfig(),
			gradientMode: gradientMode(),
			start,
			seed,
			maximumIterations,
			gradientTolerance,
			resolutionOrRates
		});
	}

	function buildGradientField(definition: LandscapeDefinition) {
		const samples: { point: Vector2; gradient: Vector2 }[] = [];
		const columns = 11;
		const rows = 9;
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const point: Vector2 = [
					definition.domain.min[0] +
						((definition.domain.max[0] - definition.domain.min[0]) * (column + 0.5)) / columns,
					definition.domain.min[1] +
						((definition.domain.max[1] - definition.domain.min[1]) * (row + 0.5)) / rows
				];
				try {
					samples.push({ point, gradient: definition.gradient(point) });
				} catch {
					// A single unavailable display sample does not alter the simulation.
				}
			}
		}
		return samples;
	}

	function rawLossAt(theta: Vector2): number | null {
		try {
			const value = landscape.value(theta);
			return Number.isFinite(value) ? value : null;
		} catch {
			return null;
		}
	}

	function rebuildLandscape(nextId = landscapeId, preserveStart = false): boolean {
		let nextLandscape: LandscapeDefinition;
		try {
			if (nextId === 'quadratic') {
				if (
					!Number.isFinite(quadraticLambda1) ||
					!Number.isFinite(quadraticLambda2) ||
					quadraticLambda1 < 0.05 ||
					quadraticLambda1 > 100 ||
					quadraticLambda2 < 0.05 ||
					quadraticLambda2 > 100 ||
					!Number.isFinite(quadraticRotation) ||
					Math.abs(quadraticRotation) > Math.PI
				) {
					throw new RangeError(
						'Eigenvalues must be between 0.05 and 100, and rotation between −180° and 180°.'
					);
				}
				nextLandscape = createLandscape({
					id: 'quadratic',
					quadratic: {
						lambda1: quadraticLambda1,
						lambda2: quadraticLambda2,
						rotation: quadraticRotation
					}
				});
			} else {
				nextLandscape = createLandscape(
					nextId === 'regression' ? { id: 'regression', regressionOutlier } : nextId
				);
			}
		} catch (cause) {
			configurationError =
				cause instanceof Error ? cause.message : 'The landscape parameters are invalid.';
			playing = false;
			particlePlaying = false;
			restoreParticleOverlays();
			cancelAnimationFrame(frameId);
			statusAnnouncement = `Invalid parameter configuration. ${configurationError} The last valid landscape remains active.`;
			return false;
		}
		configurationError = '';
		landscapeId = nextId;
		landscape = nextLandscape;
		if (!preserveStart) start = [...landscape.defaultStart];
		learningRate = landscape.defaultLearningRate;
		learningRateExponent = Math.log10(learningRate);
		heightMapping = landscape.recommendedHeightMapping;
		cameraPreset =
			nextId === 'rosenbrock' ? 'ravine' : nextId === 'himmelblau' ? 'topographic' : 'perspective';
		cameraRevision += 1;
		batchSize = 'full';
		noiseStrength = 0;
		grid = sampleLandscape(landscape);
		gradientField = buildGradientField(landscape);
		clearAnalyses();
		rebuildSimulation(`Landscape changed to ${landscape.name}.`);
		return true;
	}

	function scientificControlError(): string | null {
		if (!(learningRate >= 1e-6 && learningRate <= 10) || !Number.isFinite(learningRate)) {
			return 'Learning rate η must be finite and between 10⁻⁶ and 10.';
		}
		if (
			!Number.isSafeInteger(maximumIterations) ||
			maximumIterations < 1 ||
			maximumIterations > 10_000
		) {
			return 'Maximum iterations must be a whole number between 1 and 10,000.';
		}
		if (!Number.isFinite(gradientTolerance) || gradientTolerance < 0 || gradientTolerance > 1) {
			return 'Gradient tolerance must be finite and between 0 and 1.';
		}
		if (!seed.trim() || seed.length > 128) return 'Seed must contain 1 to 128 characters.';
		if (!Number.isFinite(noiseStrength) || noiseStrength < 0 || noiseStrength > 20) {
			return 'Noisy-gradient σ must be finite and between 0 and 20.';
		}
		if (optimizerId === 'momentum' && !(momentumBeta >= 0 && momentumBeta <= 0.999)) {
			return 'Momentum β must be finite and between 0 and 0.999.';
		}
		if (optimizerId === 'rmsprop' && !(rmsRho >= 0 && rmsRho <= 0.999)) {
			return 'RMSProp ρ must be finite and between 0 and 0.999.';
		}
		if (optimizerId === 'adam' && !(adamBeta1 >= 0 && adamBeta1 <= 0.999)) {
			return 'Adam β₁ must be finite and between 0 and 0.999.';
		}
		if (optimizerId === 'adam' && !(adamBeta2 >= 0 && adamBeta2 <= 0.9999)) {
			return 'Adam β₂ must be finite and between 0 and 0.9999.';
		}
		if (
			(optimizerId === 'rmsprop' || optimizerId === 'adam') &&
			!(epsilon >= 1e-12 && epsilon <= 0.1)
		) {
			return 'Adaptive-optimizer ε must be finite and between 10⁻¹² and 0.1.';
		}
		return null;
	}

	function rebuildSimulation(message = 'The run was reset with the current controls.') {
		playing = false;
		replayTarget = null;
		particlePlaying = false;
		restoreParticleOverlays();
		cancelAnimationFrame(frameId);
		accumulator = 0;
		transitionProgress = 1;
		previousTimestamp = 0;
		const controlError = scientificControlError();
		if (controlError) {
			configurationError = controlError;
			statusAnnouncement = `Invalid parameter configuration. ${controlError} The last valid run remains displayed.`;
			return;
		}
		const candidate = new GradientDescentSimulation(makeSimulationConfig());
		const candidateSnapshot = candidate.snapshot();
		if (candidateSnapshot.status === 'invalid-configuration') {
			configurationError = candidateSnapshot.statusMessage.replace(
				/^Invalid parameter configuration:\s*/u,
				''
			);
			statusAnnouncement = `${candidateSnapshot.statusMessage}. The last valid run remains displayed.`;
			return;
		}
		configurationError = '';
		simulation = candidate;
		snapshot = candidateSnapshot;
		selectedIteration = 0;
		statusAnnouncement = message;
		scheduleUrlUpdate();
	}

	function clearAnalyses() {
		analysisGeneration += 1;
		particleGeneration += 1;
		analysisClient?.cancel();
		particleClient?.cancel();
		restoreParticleOverlays();
		basin = null;
		basinState = 'idle';
		basinMessage = 'No basin survey has been requested.';
		showBasin = false;
		particleTrajectories = [];
		particleStep = 0;
		showParticles = false;
		race = [];
		raceEvaluationCap = 0;
		raceObservation = '';
		stability = [];
		momentumStability = null;
		stabilityState = 'idle';
		stabilityMessage = 'No learning-rate survey has been requested.';
	}

	function suspendParticleOverlays() {
		if (particleOverlayRestore) return;
		particleOverlayRestore = {
			gradientField: showGradientField,
			curvature: showCurvature,
			hessianVectors: showHessianVectors,
			tangentPlane: showTangentPlane,
			pathMarkers: showPathMarkers,
			crossSection: showCrossSection
		};
		showGradientField = false;
		showCurvature = false;
		showHessianVectors = false;
		showTangentPlane = false;
		showPathMarkers = false;
		showCrossSection = false;
	}

	function restoreParticleOverlays() {
		if (!particleOverlayRestore) return;
		showGradientField = particleOverlayRestore.gradientField;
		showCurvature = particleOverlayRestore.curvature;
		showHessianVectors = particleOverlayRestore.hessianVectors;
		showTangentPlane = particleOverlayRestore.tangentPlane;
		showPathMarkers = particleOverlayRestore.pathMarkers;
		showCrossSection = particleOverlayRestore.crossSection;
		particleOverlayRestore = null;
	}

	function resetRun() {
		playing = false;
		replayTarget = null;
		cancelAnimationFrame(frameId);
		accumulator = 0;
		transitionProgress = 1;
		snapshot = simulation.reset();
		selectedIteration = 0;
		statusAnnouncement = 'Run reset to the declared starting point and seed.';
	}

	function replayRun() {
		const target = {
			iteration: snapshot.iteration,
			gradientEvaluations: snapshot.gradientEvaluations,
			status: snapshot.status
		};
		resetRun();
		if (target.iteration === 0 && target.gradientEvaluations === 0) return;
		replayTarget = target;
		playing = true;
		snapshot = simulation.play();
		statusAnnouncement = `Replaying ${target.iteration} deterministic iterations and ${target.gradientEvaluations} gradient evaluations.`;
		startLoop();
	}

	let replayTarget: { iteration: number; gradientEvaluations: number; status: RunStatus } | null =
		null;

	function singleStep() {
		playing = false;
		replayTarget = null;
		cancelAnimationFrame(frameId);
		if (configurationError) {
			statusAnnouncement = `Invalid parameter configuration. ${configurationError}`;
			return;
		}
		if (isTerminalStatus(snapshot.status)) return;
		snapshot = simulation.step();
		selectedIteration = snapshot.history.length - 1;
		announceTerminalStatus();
	}

	function togglePlayback() {
		if (configurationError) {
			statusAnnouncement = `Invalid parameter configuration. ${configurationError}`;
			return;
		}
		if (playing) {
			playing = false;
			cancelAnimationFrame(frameId);
			snapshot = simulation.pause();
			statusAnnouncement = 'Run paused.';
			return;
		}
		if (isTerminalStatus(snapshot.status)) return;
		playing = true;
		snapshot = simulation.play();
		statusAnnouncement = 'Run started.';
		startLoop();
	}

	function startLoop() {
		cancelAnimationFrame(frameId);
		previousTimestamp = 0;
		frameId = requestAnimationFrame(frame);
	}

	function frame(timestamp: number) {
		if ((!playing && !particlePlaying) || document.hidden || offscreen) return;
		if (previousTimestamp === 0) previousTimestamp = timestamp;
		const deltaSeconds = Math.min(0.2, Math.max(0, (timestamp - previousTimestamp) / 1_000));
		previousTimestamp = timestamp;

		if (playing) {
			accumulator += deltaSeconds * speed;
			const steps = Math.min(180, Math.floor(accumulator));
			if (steps > 0) accumulator -= steps;
			transitionProgress = speed < 1 ? Math.max(0, Math.min(1, accumulator)) : 1;
			for (let index = 0; index < steps; index += 1) {
				snapshot = simulation.step();
				if (
					replayTarget &&
					snapshot.iteration >= replayTarget.iteration &&
					snapshot.gradientEvaluations >= replayTarget.gradientEvaluations
				) {
					const target = replayTarget;
					replayTarget = null;
					playing = false;
					if (!isTerminalStatus(target.status)) snapshot = simulation.pause();
					statusAnnouncement = isTerminalStatus(target.status)
						? `Replay reproduced ${snapshot.statusMessage.toLocaleLowerCase('en')}`
						: 'Replay reached the identical recorded iteration and evaluation count.';
					break;
				}
				if (isTerminalStatus(snapshot.status)) {
					playing = false;
					replayTarget = null;
					announceTerminalStatus();
					break;
				}
			}
			if (steps > 0) {
				selectedIteration = snapshot.history.length - 1;
			}
		}

		if (particlePlaying) {
			particleAccumulator += deltaSeconds * Math.max(4, Math.min(90, speed));
			const advances = Math.floor(particleAccumulator);
			if (advances > 0) {
				particleAccumulator -= advances;
				particleStep += advances;
				const maximum = Math.max(
					0,
					...particleTrajectories.map((trajectory) => trajectory.path.length - 1)
				);
				if (particleStep >= maximum) {
					particleStep = maximum;
					particlePlaying = false;
					restoreParticleOverlays();
					statusAnnouncement = 'The walkers reached their final computed distribution.';
				}
			}
		}

		if (playing || particlePlaying) frameId = requestAnimationFrame(frame);
	}

	function announceTerminalStatus() {
		if (isTerminalStatus(snapshot.status)) {
			statusAnnouncement = snapshot.statusMessage;
		}
	}

	function setStart(point: ObjectPoint) {
		start = [point.x, point.y];
		activePreset = '';
		clearAnalyses();
		rebuildSimulation(`Starting point changed to (${point.x.toFixed(3)}, ${point.y.toFixed(3)}).`);
	}

	function launchBasinStart(point: ObjectPoint) {
		start = [point.x, point.y];
		activePreset = '';
		particleGeneration += 1;
		particleClient?.cancel();
		restoreParticleOverlays();
		particleTrajectories = [];
		particleStep = 0;
		showParticles = false;
		race = [];
		raceEvaluationCap = 0;
		raceObservation = '';
		stability = [];
		momentumStability = null;
		stabilityState = 'idle';
		stabilityMessage = 'No learning-rate survey has been requested.';
		rebuildSimulation(`Basin cell launched from (${point.x.toFixed(3)}, ${point.y.toFixed(3)}).`);
		if (!reducedMotion) {
			playing = true;
			snapshot = simulation.play();
			statusAnnouncement = 'Basin-cell trajectory launched; the survey remains visible.';
			startLoop();
		}
	}

	function setProbe(point: ObjectPoint) {
		probe = [point.x, point.y];
	}

	function probeLossAt(point: ObjectPoint): number | null {
		return rawLossAt([point.x, point.y]);
	}

	function handleTerrainStatus(state: 'loading' | 'ready' | 'fallback' | 'error', message: string) {
		terrainStatus = message;
		if (state === 'fallback' || state === 'error') {
			mobileView = 'map';
			statusAnnouncement = message;
		}
	}

	function updateLearningRate(value: number) {
		if (!(value > 0) || !Number.isFinite(value)) return;
		learningRate = value;
		learningRateExponent = Math.log10(value);
		activePreset = '';
		clearAnalyses();
		rebuildSimulation(`Learning rate changed to ${formatNumber(value)}; the run was reset.`);
	}

	function updateOptimizer(id: OptimizerId) {
		optimizerId = id;
		activePreset = '';
		clearAnalyses();
		rebuildSimulation(`Optimizer changed to ${optimizerLabel(id)}; the run was reset.`);
	}

	function resetScientificControl(message = 'A scientific control changed; the run was reset.') {
		activePreset = '';
		clearAnalyses();
		rebuildSimulation(message);
	}

	function resetCamera() {
		cameraPreset =
			landscapeId === 'rosenbrock'
				? 'ravine'
				: landscapeId === 'himmelblau'
					? 'topographic'
					: 'perspective';
		cameraRevision += 1;
		scheduleUrlUpdate();
		statusAnnouncement = 'The terrain camera returned to this landscape’s recommended view.';
	}

	async function computeBasins() {
		if (configurationError) return;
		if (landscape.knownMinima.length < 2) {
			basinMessage = 'This surface has no declared multiple-minimum basin survey.';
			return;
		}
		const generation = ++analysisGeneration;
		analysisClient?.cancel();
		if (stabilityState === 'working') {
			stabilityState = 'idle';
			stabilityMessage = 'The learning-rate survey was cancelled by a newer analysis.';
		}
		basinState = 'working';
		basinMessage = 'Surveying starting points under a fixed 420-evaluation budget…';
		showBasin = true;
		scheduleUrlUpdate();
		try {
			const compact =
				typeof window !== 'undefined' && window.matchMedia('(max-width: 48rem)').matches;
			const resolution = compact ? 56 : 88;
			const cacheKey = analysisCacheKey('basin', { resolution, budget: 420 });
			const cached = basinCache.get(cacheKey);
			if (cached) {
				basin = cached;
				basinState = 'complete';
				basinMessage = `${cached.width} × ${cached.height} cached starts restored for this exact configuration; each start used a 420-gradient-evaluation cap.`;
				statusAnnouncement = 'Cached basin cartography restored.';
				return;
			}
			if (!analysisClient) analysisClient = new AnalysisWorkerClient();
			const result = await analysisClient.requestBasinGrid({
				landscape: landscapeSelection(),
				optimizer: optimizerConfig(),
				gradientMode: gradientMode(),
				seed,
				width: resolution,
				height: resolution,
				maximumIterations: 420,
				gradientTolerance,
				stepTolerance: 1e-13,
				stallPatience: 10,
				classificationTolerance: 0.24
			});
			if (generation !== analysisGeneration) return;
			basin = result;
			basinCache.set(cacheKey, result);
			if (basinCache.size > 8) basinCache.delete(basinCache.keys().next().value ?? cacheKey);
			basinState = 'complete';
			const unresolved = result.cells.filter((cell) => cell.minimumIndex === null).length;
			basinMessage = `${result.width} × ${result.height} starts classified with a 420-gradient-evaluation cap per start; ${unresolved} remained escaped, divergent or unresolved.`;
			statusAnnouncement = 'Basin cartography complete.';
		} catch (cause) {
			if (generation !== analysisGeneration) return;
			basinState = 'error';
			basinMessage = cause instanceof Error ? cause.message : 'The basin survey failed.';
		}
	}

	async function releaseWalkers() {
		if (configurationError) return;
		const generation = ++particleGeneration;
		particleClient?.cancel();
		restoreParticleOverlays();
		particlePlaying = false;
		statusAnnouncement = 'Computing deterministic walker trajectories.';
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		const compact =
			typeof window !== 'undefined' && window.matchMedia('(max-width: 48rem)').matches;
		const starts = releaseParticleStarts({
			domain: landscape.domain,
			columns: compact ? 7 : 10,
			rows: compact ? 6 : 8,
			jitter: 0.12,
			seed
		});
		try {
			if (!particleClient) particleClient = new AnalysisWorkerClient();
			const trajectories = await particleClient.requestParticleFlow({
				landscape: landscapeSelection(),
				optimizer: optimizerConfig(),
				starts,
				gradientMode: gradientMode(),
				seed,
				maximumIterations: 260,
				gradientTolerance,
				stepTolerance: 1e-13,
				stallPatience: 10,
				classificationTolerance: 0.24
			});
			if (generation !== particleGeneration) return;
			particleTrajectories = trajectories;
			particleStep = reducedMotion
				? Math.max(...trajectories.map((entry) => entry.path.length - 1))
				: 0;
			showParticles = true;
			particlePlaying = !reducedMotion;
			scheduleUrlUpdate();
			if (particlePlaying) suspendParticleOverlays();
			statusAnnouncement = reducedMotion
				? 'Walker final distribution displayed without continuous motion.'
				: 'Many walkers released under the selected optimizer rule.';
			if (particlePlaying) startLoop();
		} catch (cause) {
			if (generation !== particleGeneration) return;
			statusAnnouncement = cause instanceof Error ? cause.message : 'The walker experiment failed.';
		}
	}

	function resetWalkers() {
		restoreParticleOverlays();
		particleStep = reducedMotion
			? Math.max(0, ...particleTrajectories.map((entry) => entry.path.length - 1))
			: 0;
		particlePlaying = particleTrajectories.length > 0 && !reducedMotion;
		if (particlePlaying) suspendParticleOverlays();
		if (particlePlaying) startLoop();
	}

	function toggleWalkers() {
		if (particleTrajectories.length === 0) return;
		particlePlaying = !particlePlaying;
		if (particlePlaying) suspendParticleOverlays();
		else restoreParticleOverlays();
		statusAnnouncement = particlePlaying
			? 'Walker playback resumed without changing any computed trajectory.'
			: 'Walker playback paused; the computed positions are retained.';
		if (particlePlaying) startLoop();
		else if (!playing) cancelAnimationFrame(frameId);
	}

	function pauseWalkers(): void {
		if (!particlePlaying) return;
		particlePlaying = false;
		particleAccumulator = 0;
		restoreParticleOverlays();
	}

	function runRace() {
		if (configurationError) return;
		const base = landscape.defaultLearningRate;
		const configs: readonly OptimizerConfig[] = [
			{ id: 'gd', learningRate: base },
			{ id: 'momentum', learningRate: base * 0.8, beta: 0.9 },
			{ id: 'rmsprop', learningRate: Math.max(base * 0.8, 0.001), rho: 0.9, epsilon: 1e-8 },
			{
				id: 'adam',
				learningRate: Math.max(base * 0.5, 0.001),
				beta1: 0.9,
				beta2: 0.999,
				epsilon: 1e-8
			}
		];
		raceEvaluationCap = Math.min(500, maximumIterations);
		race = runOptimizerRace({
			landscape,
			start,
			optimizers: configs,
			gradientMode: gradientMode(),
			seed,
			gradientEvaluationBudget: raceEvaluationCap,
			gradientTolerance,
			stepTolerance: 1e-13,
			stallPatience: 10,
			classificationTolerance: 0.24
		});
		raceObservation = describeRace(race, raceEvaluationCap);
		statusAnnouncement = 'Optimizer race complete under a common gradient-evaluation budget.';
		scheduleUrlUpdate();
	}

	async function runStabilityMap() {
		if (configurationError) return;
		if (optimizerId === 'momentum') {
			await runMomentumStabilityMap();
			return;
		}
		const generation = ++analysisGeneration;
		analysisClient?.cancel();
		if (basinState === 'working') {
			basinState = 'idle';
			basinMessage = 'The basin survey was cancelled by a newer analysis.';
		}
		stabilityState = 'working';
		momentumStability = null;
		stabilityMessage = 'Scanning learning rates under one fixed start and budget…';
		const centre = Math.log10(Math.max(1e-8, learningRate));
		const exactBoundaryLog =
			optimizerId === 'gd' && quadraticFacts
				? Math.log10(quadraticFacts.stableLearningRateUpperBound)
				: null;
		const lowerLog =
			exactBoundaryLog === null ? centre - 2 : Math.min(centre - 2, exactBoundaryLog - 0.2);
		const upperLog =
			exactBoundaryLog === null ? centre + 2 : Math.max(centre + 2, exactBoundaryLog + 0.2);
		const rates = Array.from(
			{ length: 31 },
			(_, index) => 10 ** (lowerLog + ((upperLog - lowerLog) * index) / 30)
		);
		try {
			const cacheKey = analysisCacheKey('stability', rates);
			const cached = stabilityCache.get(cacheKey);
			if (cached) {
				stability = cached;
				stabilityState = 'complete';
				stabilityMessage = `${cached.length} cached learning-rate trials restored for this exact configuration.`;
				return;
			}
			if (!analysisClient) analysisClient = new AnalysisWorkerClient();
			const results = await analysisClient.requestStabilitySweep({
				landscape: landscapeSelection(),
				start,
				optimizer: optimizerWithoutLearningRate(),
				learningRates: rates,
				gradientMode: gradientMode(),
				seed,
				maximumIterations: Math.min(300, maximumIterations),
				gradientTolerance,
				stepTolerance: 1e-13,
				stallPatience: 10
			});
			if (generation !== analysisGeneration) return;
			stability = results;
			stabilityCache.set(cacheKey, results);
			if (stabilityCache.size > 12) {
				stabilityCache.delete(stabilityCache.keys().next().value ?? cacheKey);
			}
			stabilityState = 'complete';
			stabilityMessage = `${results.length} learning rates tested; select a cell to load it into the laboratory.`;
		} catch (cause) {
			if (generation !== analysisGeneration) return;
			stabilityState = 'error';
			stabilityMessage = cause instanceof Error ? cause.message : 'The stability survey failed.';
		}
	}

	async function runMomentumStabilityMap() {
		if (configurationError) return;
		const generation = ++analysisGeneration;
		analysisClient?.cancel();
		if (basinState === 'working') {
			basinState = 'idle';
			basinMessage = 'The basin survey was cancelled by a newer analysis.';
		}
		stabilityState = 'working';
		stabilityMessage = 'Scanning learning rate and momentum memory in a cancellable worker…';
		const centre = Math.log10(Math.max(1e-8, learningRate));
		const learningRates = Array.from(
			{ length: 23 },
			(_, index) => 10 ** (centre - 2 + (4 * index) / 22)
		);
		const betaValues = Array.from({ length: 17 }, (_, index) => (0.99 * index) / 16);
		const cacheKey = analysisCacheKey('momentum-stability', { learningRates, betaValues });
		try {
			const cached = momentumStabilityCache.get(cacheKey);
			if (cached) {
				momentumStability = cached;
				stability = [];
				stabilityState = 'complete';
				stabilityMessage = `${cached.width} × ${cached.height} cached momentum configurations restored.`;
				return;
			}
			if (!analysisClient) analysisClient = new AnalysisWorkerClient();
			const result = await analysisClient.requestMomentumStabilitySweep({
				landscape: landscapeSelection(),
				start,
				learningRates,
				betaValues,
				gradientMode: gradientMode(),
				seed,
				maximumIterations: Math.min(300, maximumIterations),
				gradientTolerance,
				stepTolerance: 1e-13,
				stallPatience: 10
			});
			if (generation !== analysisGeneration) return;
			momentumStability = result;
			stability = [];
			momentumStabilityCache.set(cacheKey, result);
			if (momentumStabilityCache.size > 8) {
				momentumStabilityCache.delete(momentumStabilityCache.keys().next().value ?? cacheKey);
			}
			stabilityState = 'complete';
			stabilityMessage = `${result.width} learning rates × ${result.height} momentum values tested under the same budget.`;
		} catch (cause) {
			if (generation !== analysisGeneration) return;
			stabilityState = 'error';
			stabilityMessage =
				cause instanceof Error ? cause.message : 'The momentum stability survey failed.';
		}
	}

	function optimizerWithoutLearningRate(): Omit<OptimizerConfig, 'learningRate'> {
		if (optimizerId === 'momentum') return { id: 'momentum', beta: momentumBeta };
		if (optimizerId === 'rmsprop') return { id: 'rmsprop', rho: rmsRho, epsilon };
		if (optimizerId === 'adam') {
			return { id: 'adam', beta1: adamBeta1, beta2: adamBeta2, epsilon };
		}
		return { id: 'gd' };
	}

	function applyStabilityEntry(entry: StabilitySweepEntry) {
		updateLearningRate(entry.learningRate);
		statusAnnouncement = `Loaded learning rate ${formatNumber(entry.learningRate)} from the stability map.`;
	}

	function applyMomentumStabilityEntry(entry: MomentumStabilityCell) {
		learningRate = entry.learningRate;
		learningRateExponent = Math.log10(entry.learningRate);
		momentumBeta = entry.beta;
		activePreset = '';
		rebuildSimulation(
			`Loaded momentum weather cell η=${formatNumber(entry.learningRate)}, β=${formatNumber(entry.beta)}.`
		);
		statusAnnouncement =
			'The selected momentum configuration is loaded; the weather map remains as a comparison reference.';
	}

	function applyPreset(id: PresetId) {
		// A named expedition is a complete, reproducible experiment rather than a partial UI macro.
		seed = `atlas-${id}-v1`;
		speed = 12;
		maximumIterations = 2_000;
		gradientTolerance = 1e-7;
		batchSize = 'full';
		noiseStrength = 0;
		momentumBeta = 0.9;
		rmsRho = 0.9;
		adamBeta1 = 0.9;
		adamBeta2 = 0.999;
		epsilon = 1e-8;
		regressionOutlier = false;
		probe = null;
		showContours = true;
		showGradientField = false;
		showCurrentGradient = true;
		showUpdateVector = true;
		showCurvature = true;
		showHessianVectors = true;
		showTangentPlane = true;
		showPathMarkers = true;
		showCrossSection = true;
		showKnownMinima = true;
		if (id === 'sensible-bowl') {
			quadraticLambda1 = 1;
			quadraticLambda2 = 8;
			quadraticRotation = Math.PI / 7;
			optimizerId = 'gd';
			rebuildLandscape('quadratic');
			learningRate = 0.12;
		} else if (id === 'drunken-ravine' || id === 'momentum-remembers') {
			quadraticLambda1 = 1;
			quadraticLambda2 = 42;
			quadraticRotation = Math.PI / 5;
			optimizerId = id === 'momentum-remembers' ? 'momentum' : 'gd';
			rebuildLandscape('quadratic');
			learningRate = id === 'momentum-remembers' ? 0.035 : 0.042;
		} else if (id === 'one-step-too-far') {
			quadraticLambda1 = 1;
			quadraticLambda2 = 14;
			quadraticRotation = Math.PI / 6;
			optimizerId = 'gd';
			rebuildLandscape('quadratic');
			const boundary = quadraticFacts?.stableLearningRateUpperBound ?? 2 / 14;
			learningRate = boundary * 1.04;
			maximumIterations = 260;
		} else if (id === 'four-valleys') {
			optimizerId = 'gd';
			rebuildLandscape('himmelblau');
			learningRate = 0.01;
			maximumIterations = 1_200;
		} else if (id === 'saddle-pretends') {
			optimizerId = 'gd';
			rebuildLandscape('saddle');
			start = [0.0005, 0.0002];
			learningRate = 0.03;
			maximumIterations = 500;
		} else if (id === 'static-compass') {
			optimizerId = 'gd';
			rebuildLandscape('rastrigin');
			learningRate = 0.008;
			noiseStrength = 1.25;
			maximumIterations = 800;
		} else if (id === 'line-learns' || id === 'outlier-valley') {
			regressionOutlier = id === 'outlier-valley';
			optimizerId = 'gd';
			rebuildLandscape('regression');
			start = [-0.8, 3];
			learningRate = 0.04;
			batchSize = 'full';
			maximumIterations = 1_000;
		}
		learningRateExponent = Math.log10(learningRate);
		rebuildSimulation(`Loaded the complete deterministic preset ${id}.`);
		activePreset = id;
		statusAnnouncement = `Preset selected: ${PRESETS.find((preset) => preset.id === id)?.label}.`;
		scheduleUrlUpdate();
		if (id === 'momentum-remembers') {
			setTimeout(() => {
				if (activePreset === id) runRace();
			}, 0);
		}
		if (id === 'four-valleys') {
			setTimeout(() => {
				if (activePreset !== id) return;
				void computeBasins();
				void releaseWalkers();
			}, 0);
		}
	}

	function makeDirectionalProfile(
		record: SimulationHistoryPoint | null
	): DirectionalProfile | null {
		if (!record) return null;
		const direction =
			record.update ??
			(record.gradient ? ([-record.gradient[0], -record.gradient[1]] as Vector2) : null);
		if (!direction || Math.hypot(direction[0], direction[1]) === 0) return null;
		const span = Math.max(
			landscape.domain.max[0] - landscape.domain.min[0],
			landscape.domain.max[1] - landscape.domain.min[1]
		);
		try {
			return directionalLossProfile({
				landscape,
				theta: record.theta,
				direction,
				radius: Math.max((record.stepNorm ?? 0) * 2.5, span * 0.045),
				samples: 81
			});
		} catch {
			return null;
		}
	}

	function makeCurvature(record: SimulationHistoryPoint | null) {
		if (!record) return null;
		try {
			return {
				hessian: hessianAt(landscape, record.theta),
				...classifyLocalHessian(hessianAt(landscape, record.theta))
			};
		} catch {
			return null;
		}
	}

	function makeRaceRuns(): TerrainRun[] {
		return race.map((entry) => ({
			id: entry.config.id,
			label: optimizerLabel(entry.config.id),
			history: entry.snapshot.history,
			pattern:
				entry.config.id === 'gd'
					? 'solid'
					: entry.config.id === 'momentum'
						? 'dashed'
						: entry.config.id === 'rmsprop'
							? 'dotted'
							: 'dash-dot',
			marker:
				entry.config.id === 'gd'
					? 'circle'
					: entry.config.id === 'momentum'
						? 'triangle'
						: entry.config.id === 'rmsprop'
							? 'square'
							: 'diamond'
		}));
	}

	function makeParticleRuns(): TerrainRun[] {
		if (!showParticles) return [];
		return particleTrajectories.slice(0, 28).map((trajectory) => ({
			id: `walker-${trajectory.id}`,
			label: `Walker ${trajectory.id + 1}`,
			history: trajectory.path.slice(0, Math.max(1, particleStep + 1)).map((theta, index) => ({
				iteration: index,
				gradientEvaluations: index,
				theta,
				loss: landscape.value(theta),
				gradient: null,
				update: null,
				gradientNorm: null,
				stepNorm: null
			})),
			pattern: 'dotted',
			marker: 'circle'
		}));
	}

	function makeParticlePositions() {
		if (!showParticles) return [];
		return particleTrajectories.map((trajectory) => {
			const index = Math.min(particleStep, trajectory.path.length - 1);
			const settled = index >= trajectory.path.length - 1;
			return {
				point: trajectory.path[index] ?? trajectory.start,
				outcome: settled ? trajectory.classification.minimumIndex : null,
				settled
			};
		});
	}

	function describeRace(entries: readonly OptimizerRaceEntry[], evaluationCap: number): string {
		if (entries.length === 0) return '';
		const ordered = [...entries].sort((left, right) => left.snapshot.loss - right.snapshot.loss);
		const best = ordered[0];
		const second = ordered[1];
		const destination = best.destination.minimum?.label
			? ` and finished in ${best.destination.minimum.label.toLocaleLowerCase('en')}`
			: '';
		return `${optimizerLabel(best.config.id)} recorded the lowest final loss under the shared cap of ${evaluationCap} gradient evaluations and used ${best.snapshot.gradientEvaluations}${destination}. ${optimizerLabel(second.config.id)} finished next. These configured results describe this start and budget, not a universal ordering.`;
	}

	function optimizerLabel(id: OptimizerId): string {
		return OPTIMIZER_OPTIONS.find((entry) => entry.id === id)?.label ?? id;
	}

	function optimizerParameterSummary(config: OptimizerConfig): string {
		if (config.id === 'momentum') return `β=${formatNumber(config.beta ?? 0.9)}`;
		if (config.id === 'rmsprop') {
			return `ρ=${formatNumber(config.rho ?? 0.9)}, ε=${formatNumber(config.epsilon ?? 1e-8)}`;
		}
		if (config.id === 'adam') {
			return `β₁=${formatNumber(config.beta1 ?? 0.9)}, β₂=${formatNumber(config.beta2 ?? 0.999)}, ε=${formatNumber(config.epsilon ?? 1e-8)}`;
		}
		return 'No optimizer memory state';
	}

	function exactGradientNorm(theta: Vector2): number | null {
		try {
			return Math.hypot(...landscape.gradient(theta));
		} catch {
			return null;
		}
	}

	function statusLabel(status: RunStatus): string {
		return status.replaceAll('-', ' ');
	}

	function weatherRegime(
		entry: Pick<StabilitySweepEntry, 'status' | 'finalLoss' | 'minimumLoss' | 'isOscillatory'>,
		initialLoss = landscape.value(start)
	): WeatherRegime {
		if (entry.status === 'converged') return 'converged';
		if (
			entry.status === 'escaped-domain' ||
			entry.status === 'numerically-diverged' ||
			entry.status === 'invalid-configuration' ||
			!Number.isFinite(entry.finalLoss)
		) {
			return 'hazard';
		}
		if (entry.isOscillatory) return 'oscillatory';
		const rebound = entry.finalLoss - entry.minimumLoss;
		const materialScale = Math.max(1e-9, Math.abs(initialLoss) * 0.02);
		if (entry.minimumLoss < initialLoss - materialScale && rebound > materialScale) {
			return 'oscillatory';
		}
		if (entry.finalLoss < initialLoss - materialScale) return 'slow';
		return 'unresolved';
	}

	function weatherRegimeLabel(regime: WeatherRegime): string {
		if (regime === 'converged') return 'calm convergence';
		if (regime === 'slow') return 'slow progress within budget';
		if (regime === 'oscillatory') return 'rebounding or oscillatory path';
		if (regime === 'hazard') return 'escaped or numerically hazardous';
		return 'unresolved or no material progress';
	}

	function weatherRegimeSymbol(regime: WeatherRegime): string {
		if (regime === 'converged') return '✓';
		if (regime === 'oscillatory') return '≈';
		if (regime === 'hazard') return '!';
		return '~';
	}

	function weatherRegimeShortLabel(regime: WeatherRegime): string {
		if (regime === 'converged') return 'conv';
		if (regime === 'oscillatory') return 'osc';
		if (regime === 'hazard') return 'haz';
		if (regime === 'slow') return 'slow';
		return 'open';
	}

	function stabilityBoundaryPercent(): number | null {
		if (optimizerId !== 'gd' || !quadraticFacts || stability.length < 2) return null;
		const minimum = Math.log10(stability[0].learningRate);
		const maximum = Math.log10(stability.at(-1)?.learningRate ?? stability[0].learningRate);
		const boundary = Math.log10(quadraticFacts.stableLearningRateUpperBound);
		if (!(maximum > minimum) || boundary < minimum || boundary > maximum) return null;
		return ((boundary - minimum) / (maximum - minimum)) * 100;
	}

	function formatNumber(value: number | null | undefined, digits = 4): string {
		if (value === null || value === undefined || !Number.isFinite(value)) return '—';
		const magnitude = Math.abs(value);
		if ((magnitude > 0 && magnitude < 1e-3) || magnitude >= 1e5) return value.toExponential(3);
		return value.toLocaleString('en-GB', { maximumFractionDigits: digits });
	}

	function currentExperimentState(): ExperimentUrlState {
		return {
			version: 1,
			landscape: landscapeSelection(),
			optimizer: optimizerConfig(),
			start,
			seed,
			speed,
			maximumIterations,
			gradientTolerance,
			gradientMode: gradientMode()
		};
	}

	function scheduleUrlUpdate() {
		if (!initialized || typeof window === 'undefined') return;
		window.clearTimeout(urlTimer);
		urlTimer = window.setTimeout(() => replaceUrl(false), 150);
	}

	function replaceUrl(push: boolean) {
		if (configurationError) {
			statusAnnouncement = `Correct the invalid parameter configuration before copying this experiment. ${configurationError}`;
			return;
		}
		const url = new SvelteURL(window.location.href);
		const scientific = serializeExperimentUrlState(currentExperimentState());
		for (const key of [...url.searchParams.keys()]) {
			if (EXPERIMENT_QUERY_KEYS.has(key)) url.searchParams.delete(key);
		}
		for (const [key, value] of scientific) url.searchParams.set(key, value);
		url.searchParams.set('gd_v', '1');
		url.searchParams.set('view', mobileView);
		url.searchParams.set('camera', cameraPreset);
		url.searchParams.set('height', heightMapping);
		url.searchParams.set('layers', overlayMask());
		if (activePreset) url.searchParams.set('preset', activePreset);
		if (showBasin) url.searchParams.set('basin', '1');
		if (showParticles) url.searchParams.set('flow', '1');
		if (race.length > 0) url.searchParams.set('race', '1');
		const route =
			`${url.pathname}${url.search}${url.hash}` as '/blog/visualizations/gradient-descent-landscapes';
		if (push) pushNavigationState(resolve(route), {});
		else replaceNavigationState(resolve(route), {});
	}

	function applyUrlState(parameters: URLSearchParams) {
		clearAnalyses();
		activePreset = '';
		batchSize = 'full';
		noiseStrength = 0;
		momentumBeta = 0.9;
		rmsRho = 0.9;
		adamBeta1 = 0.9;
		adamBeta2 = 0.999;
		epsilon = 1e-8;
		regressionOutlier = false;
		mobileView = 'terrain';
		configurationError = '';
		applyOverlayMask(parameters.get('layers'));
		const parsed = parseExperimentUrlState(parameters, createDefaultExperimentState('rosenbrock'));
		const state = parsed.state;
		landscapeId = state.landscape.id;
		if (state.landscape.id === 'quadratic' && state.landscape.quadratic) {
			quadraticLambda1 = state.landscape.quadratic.lambda1 ?? 1;
			quadraticLambda2 = state.landscape.quadratic.lambda2 ?? 14;
			quadraticRotation = state.landscape.quadratic.rotation ?? Math.PI / 6;
		}
		if (state.landscape.id === 'regression') {
			regressionOutlier = state.landscape.regressionOutlier ?? false;
		}
		landscape = createLandscape(state.landscape);
		optimizerId = state.optimizer.id;
		learningRate = state.optimizer.learningRate;
		learningRateExponent = Math.log10(learningRate);
		momentumBeta = state.optimizer.beta ?? 0.9;
		rmsRho = state.optimizer.rho ?? 0.9;
		adamBeta1 = state.optimizer.beta1 ?? 0.9;
		adamBeta2 = state.optimizer.beta2 ?? 0.999;
		epsilon = state.optimizer.epsilon ?? 1e-8;
		start = state.start;
		seed = state.seed;
		speed = state.speed;
		maximumIterations = state.maximumIterations;
		gradientTolerance = state.gradientTolerance;
		if (state.gradientMode.kind === 'minibatch') batchSize = state.gradientMode.batchSize;
		if (state.gradientMode.kind === 'noisy') noiseStrength = state.gradientMode.sigma;
		const requestedHeight = parameters.get('height');
		heightMapping =
			requestedHeight === 'linear' || requestedHeight === 'log-compressed'
				? requestedHeight
				: landscape.recommendedHeightMapping;
		cameraPreset =
			landscapeId === 'rosenbrock'
				? 'ravine'
				: landscapeId === 'himmelblau'
					? 'topographic'
					: 'perspective';
		const camera = parameters.get('camera');
		if (
			camera === 'perspective' ||
			camera === 'topographic' ||
			camera === 'ravine' ||
			camera === 'side'
		) {
			cameraPreset = camera;
		}
		cameraRevision += 1;
		const view = parameters.get('view');
		if (view === 'terrain' || view === 'map' || view === 'microscope' || view === 'metrics')
			mobileView = view;
		const preset = parameters.get('preset');
		if (PRESETS.some((entry) => entry.id === preset)) activePreset = preset as PresetId;
		grid = sampleLandscape(landscape);
		gradientField = buildGradientField(landscape);
		simulation = new GradientDescentSimulation(makeSimulationConfig());
		snapshot = simulation.snapshot();
		selectedIteration = 0;
		if (parsed.warnings.length > 0) statusAnnouncement = parsed.warnings.join(' ');
	}

	function restoreUrlComparisons(parameters: URLSearchParams) {
		const generation = ++routeRestoreGeneration;
		if (parameters.get('race') === '1') {
			setTimeout(() => {
				if (generation === routeRestoreGeneration) runRace();
			}, 0);
		}
		if (parameters.get('basin') === '1' && landscape.knownMinima.length > 1) {
			showBasin = true;
			setTimeout(() => {
				if (generation === routeRestoreGeneration) void computeBasins();
			}, 0);
		}
		if (parameters.get('flow') === '1') {
			showParticles = true;
			setTimeout(() => {
				if (generation === routeRestoreGeneration) void releaseWalkers();
			}, 0);
		}
	}

	async function copyExperiment() {
		replaceUrl(true);
		try {
			await navigator.clipboard.writeText(window.location.href);
			showCopied('Experiment link copied.');
		} catch {
			showCopied('Copy is unavailable; the address bar contains this experiment.');
		}
	}

	async function copySummary() {
		const text = plainSummary();
		try {
			await navigator.clipboard.writeText(text);
			showCopied('Plain-text run summary copied.');
		} catch {
			showCopied('Copy is unavailable in this browser.');
		}
	}

	function showCopied(message: string) {
		copiedMessage = message;
		window.clearTimeout(copyTimer);
		copyTimer = window.setTimeout(() => (copiedMessage = ''), 3_000);
	}

	function resetCanonicalArticle() {
		const url = new SvelteURL(window.location.href);
		url.search = '';
		const route =
			`${url.pathname}${url.search}${url.hash}` as '/blog/visualizations/gradient-descent-landscapes';
		pushNavigationState(resolve(route), {});
		showContours = true;
		showGradientField = false;
		showCurrentGradient = true;
		showUpdateVector = true;
		showCurvature = true;
		showHessianVectors = true;
		showTangentPlane = true;
		showPathMarkers = true;
		showCrossSection = true;
		showKnownMinima = true;
		metricMode = 'loss';
		metricsXAxis = 'gradientEvaluations';
		metricsLogScale = true;
		metricsAutoScale = false;
		probe = null;
		applyUrlState(new URLSearchParams());
		statusAnnouncement = 'Canonical article experiment restored.';
	}

	function downloadRunCsv() {
		downloadBlob(
			new Blob([simulationToCsv(snapshot)], { type: 'text/csv;charset=utf-8' }),
			`${safeExportStem(snapshot)}.csv`
		);
	}

	function plainSummary(): string {
		return [
			'The Landscape of Error — run summary',
			`Landscape: ${landscape.name}`,
			`Optimizer: ${optimizerLabel(snapshot.optimizer.id)}`,
			`Learning rate η: ${formatNumber(snapshot.optimizer.learningRate)}`,
			`Optimizer configuration: ${JSON.stringify(snapshot.optimizer)}`,
			`Gradient mode: ${gradientModeLabel}`,
			`Start: (${formatNumber(snapshot.start[0])}, ${formatNumber(snapshot.start[1])})`,
			`Final: (${formatNumber(snapshot.theta[0])}, ${formatNumber(snapshot.theta[1])})`,
			`Raw loss: ${formatNumber(snapshot.loss, 8)}`,
			`Iterations / gradient evaluations: ${snapshot.iteration} / ${snapshot.gradientEvaluations}`,
			`Iteration budget / gradient tolerance: ${maximumIterations} / ${formatNumber(gradientTolerance)}`,
			`Status: ${snapshot.statusMessage}`,
			`Seed: ${snapshot.seed}`
		].join('\n');
	}

	function exportCurrentViewPng() {
		if (!grid) return;
		const canvas = document.createElement('canvas');
		canvas.width = 1_200;
		canvas.height = 630;
		const context = canvas.getContext('2d');
		if (!context) return;
		context.fillStyle = '#0a0d0c';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.fillStyle = '#f5eedf';
		context.font = '700 42px Georgia, serif';
		context.fillText('The Landscape of Error', 56, 68);
		context.fillStyle = '#c79a52';
		context.font = '700 14px Arial, sans-serif';
		context.fillText(
			`${landscape.name.toUpperCase()} · ${optimizerLabel(snapshot.optimizer.id).toUpperCase()}`,
			58,
			96
		);
		const plot = { x: 56, y: 122, width: 850, height: 452 };
		const terrainHost = laboratory.querySelector<HTMLElement>(
			'[data-testid="gradient-terrain-stage"]'
		);
		const terrainCanvas =
			mobileView === 'terrain' && terrainHost?.dataset.renderState === 'ready'
				? terrainHost.querySelector<HTMLCanvasElement>('canvas')
				: null;
		const mapHost = laboratory.querySelector<HTMLElement>(
			'[data-testid="gradient-topographic-map"]'
		);
		const mapCanvases =
			mapHost?.dataset.renderReady === 'true'
				? Array.from(mapHost.querySelectorAll<HTMLCanvasElement>('canvas'))
				: [];
		const drawableCanvases = mapCanvases.filter((source) => source.width > 0 && source.height > 0);
		const exportView = terrainCanvas?.width && terrainCanvas.height ? 'terrain' : 'map';
		const sourceWidth =
			exportView === 'terrain' && terrainCanvas
				? terrainCanvas.width
				: (drawableCanvases[0]?.width ?? grid.width);
		const sourceHeight =
			exportView === 'terrain' && terrainCanvas
				? terrainCanvas.height
				: (drawableCanvases[0]?.height ?? grid.height);
		const containedScale = Math.min(plot.width / sourceWidth, plot.height / sourceHeight);
		const contentPlot = {
			x: plot.x + (plot.width - sourceWidth * containedScale) / 2,
			y: plot.y + (plot.height - sourceHeight * containedScale) / 2,
			width: sourceWidth * containedScale,
			height: sourceHeight * containedScale
		};
		if (exportView === 'terrain' && terrainCanvas) {
			context.drawImage(
				terrainCanvas,
				contentPlot.x,
				contentPlot.y,
				contentPlot.width,
				contentPlot.height
			);
		} else if (drawableCanvases.length > 0) {
			for (const source of drawableCanvases) {
				context.drawImage(
					source,
					contentPlot.x,
					contentPlot.y,
					contentPlot.width,
					contentPlot.height
				);
			}
		} else {
			const range = Math.max(Number.EPSILON, grid.max - grid.min);
			for (let row = 0; row < grid.height; row += 1) {
				for (let column = 0; column < grid.width; column += 1) {
					const raw = Number(grid.values[row * grid.width + column]);
					const normalized = Math.min(1, Math.max(0, (raw - grid.min) / range));
					const lightness = 9 + normalized ** 0.55 * 27;
					context.fillStyle = `hsl(155 ${7 + normalized * 9}% ${lightness}%)`;
					context.fillRect(
						contentPlot.x + (column / grid.width) * contentPlot.width,
						contentPlot.y + ((grid.height - row - 1) / grid.height) * contentPlot.height,
						contentPlot.width / grid.width + 1,
						contentPlot.height / grid.height + 1
					);
				}
			}
		}
		const mapPoint = (theta: Vector2) => ({
			x:
				contentPlot.x +
				((theta[0] - landscape.domain.min[0]) /
					(landscape.domain.max[0] - landscape.domain.min[0])) *
					contentPlot.width,
			y:
				contentPlot.y +
				((landscape.domain.max[1] - theta[1]) /
					(landscape.domain.max[1] - landscape.domain.min[1])) *
					contentPlot.height
		});
		if (exportView === 'map' && drawableCanvases.length === 0) {
			context.beginPath();
			snapshot.history.forEach((point, index) => {
				const mapped = mapPoint(point.theta);
				if (index === 0) context.moveTo(mapped.x, mapped.y);
				else context.lineTo(mapped.x, mapped.y);
			});
			context.strokeStyle = '#efbd60';
			context.lineWidth = 4;
			context.lineJoin = 'round';
			context.stroke();
			const current = mapPoint(snapshot.theta);
			context.beginPath();
			context.arc(current.x, current.y, 7, 0, Math.PI * 2);
			context.fillStyle = '#ffe8ac';
			context.fill();
		}
		context.strokeStyle = '#4d5651';
		context.lineWidth = 1;
		context.strokeRect(contentPlot.x, contentPlot.y, contentPlot.width, contentPlot.height);

		const configuration = snapshot.optimizer;
		const optimizerDetails =
			configuration.id === 'momentum'
				? `β ${formatNumber(configuration.beta ?? 0.9)}`
				: configuration.id === 'rmsprop'
					? `ρ ${formatNumber(configuration.rho ?? 0.9)} · ε ${formatNumber(configuration.epsilon ?? 1e-8)}`
					: configuration.id === 'adam'
						? `β₁ ${formatNumber(configuration.beta1 ?? 0.9)} · β₂ ${formatNumber(configuration.beta2 ?? 0.999)} · ε ${formatNumber(configuration.epsilon ?? 1e-8)}`
						: 'no memory coefficient';
		const comparisonDetails = [
			showContours ? 'contours' : '',
			showGradientField ? 'gradient field' : '',
			showBasin && basin ? 'basin outcomes' : '',
			race.length > 0 ? `${race.length}-optimizer race` : '',
			showParticles && particleTrajectories.length > 0
				? `${particleTrajectories.length} walkers at frame ${particleStep}`
				: ''
		].filter(Boolean);
		const information = [
			`exported view ${exportView}`,
			`η ${formatNumber(snapshot.optimizer.learningRate)} · ${optimizerDetails}`,
			gradientModeLabel,
			`budget ${maximumIterations} · tolerance ${formatNumber(gradientTolerance)}`,
			`iteration ${snapshot.iteration} · ${snapshot.gradientEvaluations} evaluations`,
			`raw loss ${formatNumber(snapshot.loss, 8)}`,
			`status ${snapshot.status}`,
			`seed ${seed}`,
			`display ${heightMapping}; calculations use raw loss`,
			`visible layers ${comparisonDetails.join(', ') || 'primary path only'}`
		];
		context.fillStyle = '#d5cfc2';
		context.font = '13px Courier New, monospace';
		let informationY = 140;
		for (const line of information) {
			const words = line.split(' ');
			let row = '';
			for (const word of words) {
				const candidate = row ? `${row} ${word}` : word;
				if (context.measureText(candidate).width > 220 && row) {
					context.fillText(row, 940, informationY);
					informationY += 19;
					row = word;
				} else row = candidate;
			}
			if (row) context.fillText(row, 940, informationY);
			informationY += 26;
		}
		context.fillStyle = '#f2eadb';
		context.font = '700 22px Georgia, serif';
		context.fillText('SuvroGhosh.IN', 972, 574);
		canvas.toBlob((blob) => {
			if (blob) downloadBlob(blob, `${safeExportStem(snapshot)}-${exportView}.png`);
		}, 'image/png');
	}

	function downloadBlob(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (event.defaultPrevented || !target || !laboratory.contains(target)) return;
		if (
			target.closest(
				'input, select, textarea, button, a, summary, [contenteditable="true"], [role="tab"], [role="button"], [role="slider"]'
			)
		)
			return;
		if (event.key === ' ') {
			event.preventDefault();
			togglePlayback();
		} else if (event.key.toLocaleLowerCase('en') === 'n') {
			event.preventDefault();
			singleStep();
		} else if (event.key.toLocaleLowerCase('en') === 'r') {
			event.preventDefault();
			resetRun();
		}
	}

	function handleTabKeydown(event: KeyboardEvent, index: number) {
		let nextIndex = index;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			nextIndex = (index + 1) % MOBILE_VIEWS.length;
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			nextIndex = (index - 1 + MOBILE_VIEWS.length) % MOBILE_VIEWS.length;
		} else if (event.key === 'Home') {
			nextIndex = 0;
		} else if (event.key === 'End') {
			nextIndex = MOBILE_VIEWS.length - 1;
		} else {
			return;
		}
		event.preventDefault();
		mobileView = MOBILE_VIEWS[nextIndex];
		scheduleUrlUpdate();
		requestAnimationFrame(() => {
			laboratory.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus();
		});
	}

	function startPendingBeginCommand(): void {
		if (!pendingBeginCommand || document.hidden) {
			return;
		}
		const bounds = laboratory.getBoundingClientRect();
		const nearViewport = bounds.bottom >= -180 && bounds.top <= window.innerHeight + 180;
		if (!nearViewport) return;
		pendingBeginCommand = false;
		if (configurationError) {
			statusAnnouncement = 'Correct the invalid configuration before starting the run.';
			return;
		}
		if (isTerminalStatus(snapshot.status)) resetRun();
		if (reducedMotion) {
			statusAnnouncement =
				'Reduced motion is active. Use Single step to inspect the descent without continuous animation.';
			return;
		}
		if (!playing) togglePlayback();
	}

	function cancelCommandFrame(): void {
		if (!commandFrameId) return;
		cancelAnimationFrame(commandFrameId);
		commandFrameId = 0;
	}

	function scheduleCommandFrame(callback: () => void): void {
		cancelCommandFrame();
		commandFrameId = requestAnimationFrame(() => {
			commandFrameId = 0;
			if (!destroyed) callback();
		});
	}

	let lastHandledCommandId = 0;
	$effect(() => {
		const nextCommandId = commandId;
		const command = initialCommand;
		if (!initialized || !command || nextCommandId <= lastHandledCommandId) return;
		lastHandledCommandId = nextCommandId;
		if (command === 'open') {
			pendingBeginCommand = false;
			scheduleCommandFrame(() => {
				advancedOpen = true;
				analysisOpen = true;
				statusAnnouncement = 'Laboratory controls opened from the article introduction.';
			});
			return;
		}
		pendingBeginCommand = true;
		laboratory.scrollIntoView({ behavior: 'auto', block: 'start' });
		scheduleCommandFrame(startPendingBeginCommand);
	});

	onMount(() => {
		destroyed = false;
		analysisClient = new AnalysisWorkerClient();
		particleClient = new AnalysisWorkerClient();
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const layoutQuery = window.matchMedia('(max-width: 52rem)');
		const queryReduced = new URLSearchParams(window.location.search).get('motion') === 'reduce';
		const updateLayout = () => {
			compactLayout = layoutQuery.matches;
		};
		const updateMotion = () => {
			reducedMotion = motionQuery.matches || queryReduced;
			if (reducedMotion) {
				const pausedRun = playing;
				const pausedWalkers = particlePlaying;
				if (pausedRun) {
					playing = false;
					snapshot = simulation.pause();
				}
				pauseWalkers();
				cancelAnimationFrame(frameId);
				if (pausedRun || pausedWalkers) {
					statusAnnouncement =
						'Playback paused because the reduced-motion preference became active.';
				}
			}
		};
		updateLayout();
		updateMotion();
		const parameters = new URLSearchParams(window.location.search);
		if (parameters.has('gd_v') || parameters.has('v') || parameters.has('landscape')) {
			applyUrlState(parameters);
		}
		initialized = true;
		restoreUrlComparisons(parameters);
		const restoreHistoryState = () => {
			const restoredParameters = new URLSearchParams(window.location.search);
			applyUrlState(restoredParameters);
			restoreUrlComparisons(restoredParameters);
			statusAnnouncement = 'Experiment restored from browser history.';
		};

		const visibility = () => {
			if (!document.hidden) {
				startPendingBeginCommand();
				if (playing || particlePlaying) startLoop();
				return;
			}
			const pausedRun = playing;
			const pausedWalkers = particlePlaying;
			if (pausedRun) {
				playing = false;
				snapshot = simulation.pause();
			}
			pauseWalkers();
			if (pausedRun || pausedWalkers) {
				cancelAnimationFrame(frameId);
				statusAnnouncement = pausedWalkers
					? 'Run and walker playback paused because the page became hidden.'
					: 'Run paused because the page became hidden.';
			}
		};
		const observer = new IntersectionObserver(
			(entries) => {
				offscreen = !entries.some((entry) => entry.isIntersecting);
				if (offscreen && (playing || particlePlaying)) {
					const pausedWalkers = particlePlaying;
					if (playing) {
						playing = false;
						snapshot = simulation.pause();
					}
					pauseWalkers();
					cancelAnimationFrame(frameId);
					statusAnnouncement = pausedWalkers
						? 'Playback paused while the laboratory is outside the viewport.'
						: 'Run paused while the laboratory is outside the viewport.';
				} else if (!offscreen && !document.hidden) {
					startPendingBeginCommand();
					if (playing || particlePlaying) startLoop();
				}
			},
			{ rootMargin: '180px 0px' }
		);
		observer.observe(laboratory);
		document.addEventListener('visibilitychange', visibility);
		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('popstate', restoreHistoryState);
		motionQuery.addEventListener('change', updateMotion);
		layoutQuery.addEventListener('change', updateLayout);
		return () => {
			destroyed = true;
			pendingBeginCommand = false;
			analysisGeneration += 1;
			particleGeneration += 1;
			routeRestoreGeneration += 1;
			analysisClient?.terminate();
			analysisClient = null;
			particleClient?.terminate();
			particleClient = null;
			cancelAnimationFrame(frameId);
			cancelCommandFrame();
			window.clearTimeout(urlTimer);
			window.clearTimeout(copyTimer);
			observer.disconnect();
			document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('popstate', restoreHistoryState);
			motionQuery.removeEventListener('change', updateMotion);
			layoutQuery.removeEventListener('change', updateLayout);
		};
	});
</script>

<section bind:this={laboratory} class="observatory" aria-labelledby="laboratory-title">
	<header class="masthead">
		<div>
			<p class="eyebrow">Gradient descent observatory · shared state v1</p>
			<h2 id="laboratory-title">The topographic laboratory</h2>
			<p class="deck">
				Every panel below reads the same iterate, raw loss and seeded optimizer state.
			</p>
		</div>
		<div class="status-stack">
			<span
				class:terminal={isTerminalStatus(snapshot.status) || Boolean(configurationError)}
				class="status-badge">{displayStatus}</span
			>
			<span>{gradientModeLabel}</span>
		</div>
	</header>

	<div class="instrument-bar" aria-label="Primary simulation controls">
		<div class="transport">
			<button
				type="button"
				class="primary"
				onclick={togglePlayback}
				disabled={isTerminalStatus(snapshot.status) || Boolean(configurationError)}
			>
				{playing ? 'Pause' : 'Play'}
			</button>
			<button
				type="button"
				onclick={singleStep}
				disabled={playing || isTerminalStatus(snapshot.status) || Boolean(configurationError)}
				>Single step</button
			>
			<button type="button" onclick={resetRun}>Reset</button>
			<button type="button" onclick={replayRun} disabled={snapshot.iteration === 0}>Replay</button>
		</div>
		<label>
			<span>Landscape</span>
			<select
				value={landscapeId}
				disabled={Boolean(configurationError)}
				onchange={(event) => rebuildLandscape(event.currentTarget.value as LandscapeId)}
			>
				{#each LANDSCAPE_OPTIONS as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Optimizer</span>
			<select
				value={optimizerId}
				disabled={Boolean(configurationError)}
				onchange={(event) => updateOptimizer(event.currentTarget.value as OptimizerId)}
			>
				{#each OPTIMIZER_OPTIONS as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		</label>
		<label class="learning-rate">
			<span>Learning rate η <output>{formatNumber(learningRate)}</output></span>
			<input
				type="range"
				min="-6"
				max="1"
				step="0.01"
				value={learningRateExponent}
				oninput={(event) => updateLearningRate(10 ** Number(event.currentTarget.value))}
			/>
		</label>
		<label>
			<span>Iterations per second</span>
			<select bind:value={speed} onchange={() => scheduleUrlUpdate()}>
				{#each [0.5, 1, 2, 5, 12, 30, 60, 120] as rate (rate)}
					<option value={rate}>{rate}</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="mobile-tabs" role="tablist" aria-label="Laboratory view">
		{#each MOBILE_VIEWS as view, index (view)}
			<button
				type="button"
				role="tab"
				id={`gradient-tab-${view}`}
				aria-selected={mobileView === view}
				aria-controls={`panel-${view}`}
				tabindex={mobileView === view ? 0 : -1}
				onkeydown={(event) => handleTabKeydown(event, index)}
				onclick={() => {
					mobileView = view as MobileView;
					scheduleUrlUpdate();
				}}
			>
				{view[0].toUpperCase() + view.slice(1)}
			</button>
		{/each}
	</div>

	<div class="stage-grid">
		<section
			id="panel-terrain"
			role={compactLayout ? 'tabpanel' : 'region'}
			aria-labelledby={compactLayout ? 'gradient-tab-terrain' : 'terrain-panel-title'}
			class:mobile-hidden={mobileView !== 'terrain'}
			class="terrain-panel"
			aria-label="Three-dimensional terrain panel"
		>
			<div class="panel-heading">
				<div>
					<span>01</span>
					<h3 id="terrain-panel-title">Terrain</h3>
				</div>
				<p>
					{heightMapping === 'log-compressed'
						? 'Display height: log₁p(max(0, L − robust sampled minimum)); calculations use unshifted raw loss.'
						: 'Display height: linear normalization over the robust sampled range; calculations use raw loss.'}
				</p>
			</div>
			<div class="terrain-frame">
				<TerrainStage
					{grid}
					domain={landscape.domain}
					history={snapshot.history}
					runs={overlayRuns}
					currentStepIndex={selectedIteration}
					{transitionProgress}
					parameterLabels={landscape.parameterLabels}
					{heightMapping}
					{cameraPreset}
					{cameraRevision}
					quality="balanced"
					paused={!playing && !particlePlaying}
					{reducedMotion}
					autoRotate={!initialized && !reducedMotion}
					onstatus={handleTerrainStatus}
					onselectstep={(index) => (selectedIteration = index)}
				/>
			</div>
			<p class="panel-status">{terrainStatus}</p>
		</section>

		<section
			id="panel-map"
			role={compactLayout ? 'tabpanel' : 'region'}
			aria-labelledby={compactLayout ? 'gradient-tab-map' : 'map-panel-title'}
			class:mobile-hidden={mobileView !== 'map'}
			class="map-panel"
			aria-label="Topographic map panel"
		>
			<div class="panel-heading">
				<div>
					<span>02</span>
					<h3 id="map-panel-title">Map</h3>
				</div>
				<p>Click or drag to set the start. Shift-click probes raw loss.</p>
			</div>
			<div class="map-frame">
				<TopographicMap
					{grid}
					domain={landscape.domain}
					history={snapshot.history}
					runs={overlayRuns}
					currentStepIndex={selectedIteration}
					{transitionProgress}
					{start}
					defaultStart={landscape.defaultStart}
					{probe}
					knownMinima={showKnownMinima ? landscape.knownMinima : []}
					{gradientField}
					{basin}
					{particles}
					parameterLabels={landscape.parameterLabels}
					{showContours}
					{showGradientField}
					{showBasin}
					{showParticles}
					{showPathMarkers}
					fieldDirection="descent"
					onstartchange={setStart}
					onbasinlaunch={launchBasinStart}
					onprobe={setProbe}
					lossAt={probeLossAt}
					onselectstep={(index) => (selectedIteration = index)}
				/>
			</div>
			<output class="probe-readout" aria-live="polite">
				{probe
					? `Probe ${landscape.parameterLabels[0]}=${formatNumber(probe[0], 7)}, ${landscape.parameterLabels[1]}=${formatNumber(probe[1], 7)} · raw loss ${formatNumber(probeLoss, 9)}`
					: 'Shift-click or press Enter on the map to probe exact raw mathematical loss.'}
			</output>
		</section>

		<dl class="metrics-strip" aria-label="Live run metrics">
			{#each liveMetricRows() as metric (metric[0])}
				<div>
					<dt>{metric[0]}</dt>
					<dd>{metric[1]}</dd>
				</div>
			{/each}
		</dl>
	</div>

	<div class="configuration-row">
		<details bind:open={advancedOpen}>
			<summary>Advanced settings</summary>
			<div class="advanced-grid">
				<label
					><span>Seed</span><input
						bind:value={seed}
						maxlength="128"
						onchange={() => resetScientificControl('Seed changed; the run was reset.')}
					/></label
				>
				<label
					><span>Maximum iterations</span><input
						type="number"
						min="1"
						max="10000"
						step="1"
						bind:value={maximumIterations}
						onchange={() => resetScientificControl()}
					/></label
				>
				<label
					><span>Gradient tolerance</span><input
						type="number"
						min="0"
						max="1"
						step="0.0000001"
						bind:value={gradientTolerance}
						onchange={() => resetScientificControl()}
					/></label
				>
				<label
					><span>Height mapping</span><select
						bind:value={heightMapping}
						onchange={() => {
							scheduleUrlUpdate();
						}}
						><option value="linear">Linear</option><option value="log-compressed"
							>Log-compressed</option
						></select
					></label
				>
				<label
					><span>Camera preset</span><select
						bind:value={cameraPreset}
						onchange={() => scheduleUrlUpdate()}
						><option value="perspective">Survey view</option><option value="ravine"
							>Valley-floor view</option
						><option value="topographic">Topographic view</option><option value="side"
							>Side view</option
						></select
					></label
				>
				<button type="button" class="compact-action" onclick={resetCamera}>Reset camera</button>

				{#if optimizerId === 'momentum'}
					<label
						><span>Momentum β</span><input
							type="number"
							min="0"
							max="0.999"
							step="0.01"
							bind:value={momentumBeta}
							onchange={() => resetScientificControl()}
						/></label
					>
				{:else if optimizerId === 'rmsprop'}
					<label
						><span>RMSProp ρ</span><input
							type="number"
							min="0"
							max="0.999"
							step="0.01"
							bind:value={rmsRho}
							onchange={() => resetScientificControl()}
						/></label
					>
					<label
						><span>Epsilon ε</span><input
							type="number"
							min="1e-12"
							max="0.1"
							step="1e-8"
							bind:value={epsilon}
							onchange={() => resetScientificControl()}
						/></label
					>
				{:else if optimizerId === 'adam'}
					<label
						><span>Adam β₁</span><input
							type="number"
							min="0"
							max="0.999"
							step="0.01"
							bind:value={adamBeta1}
							onchange={() => resetScientificControl()}
						/></label
					>
					<label
						><span>Adam β₂</span><input
							type="number"
							min="0"
							max="0.9999"
							step="0.001"
							bind:value={adamBeta2}
							onchange={() => resetScientificControl()}
						/></label
					>
					<label
						><span>Epsilon ε</span><input
							type="number"
							min="1e-12"
							max="0.1"
							step="1e-8"
							bind:value={epsilon}
							onchange={() => resetScientificControl()}
						/></label
					>
				{/if}

				{#if landscapeId === 'regression'}
					<label
						><span>Batch size</span><select
							bind:value={batchSize}
							onchange={() => resetScientificControl()}
							><option value="full">Full batch</option><option value={4}>4</option><option value={2}
								>2</option
							><option value={1}>1</option></select
						></label
					>
					<label class="check"
						><input
							type="checkbox"
							bind:checked={regressionOutlier}
							onchange={() => rebuildLandscape('regression', true)}
						/><span>Include controlled outlier</span></label
					>
				{:else}
					<label
						><span>Noisy-gradient σ</span><input
							type="number"
							min="0"
							max="20"
							step="0.05"
							bind:value={noiseStrength}
							onchange={() => resetScientificControl()}
						/></label
					>
				{/if}

				{#if landscapeId === 'quadratic'}
					<label
						><span>λ₁</span><input
							type="number"
							min="0.05"
							max="100"
							step="0.05"
							bind:value={quadraticLambda1}
							aria-invalid={configurationError ? 'true' : undefined}
							aria-describedby={configurationError ? 'scientific-configuration-error' : undefined}
							onchange={() => rebuildLandscape('quadratic', true)}
						/></label
					>
					<label
						><span>λ₂</span><input
							type="number"
							min="0.05"
							max="100"
							step="0.05"
							bind:value={quadraticLambda2}
							aria-invalid={configurationError ? 'true' : undefined}
							aria-describedby={configurationError ? 'scientific-configuration-error' : undefined}
							onchange={() => rebuildLandscape('quadratic', true)}
						/></label
					>
					<label
						><span>Rotation (degrees)</span><input
							type="number"
							min="-180"
							max="180"
							step="1"
							value={(quadraticRotation * 180) / Math.PI}
							aria-invalid={configurationError ? 'true' : undefined}
							aria-describedby={configurationError ? 'scientific-configuration-error' : undefined}
							onchange={(event) => {
								quadraticRotation = (Number(event.currentTarget.value) * Math.PI) / 180;
								rebuildLandscape('quadratic', true);
							}}
						/></label
					>
				{/if}
			</div>
			{#if configurationError}
				<p id="scientific-configuration-error" class="configuration-error" role="alert">
					<strong>Invalid parameter configuration.</strong>
					{configurationError} The last valid landscape remains displayed.
				</p>
			{/if}

			<fieldset class="overlay-fieldset">
				<legend>Analysis overlays</legend>
				{#each overlayControls() as overlay (overlay[0])}
					<label class="check"
						><input
							type="checkbox"
							checked={overlay[1]}
							onchange={(event) => {
								overlay[2](event.currentTarget.checked);
								scheduleUrlUpdate();
							}}
						/><span>{overlay[0]}</span></label
					>
				{/each}
			</fieldset>
		</details>

		<details bind:open={analysisOpen}>
			<summary>Cartography and comparisons</summary>
			<div class="analysis-actions">
				<button
					type="button"
					onclick={() => void computeBasins()}
					disabled={Boolean(configurationError) ||
						basinState === 'working' ||
						landscape.knownMinima.length < 2}>Map basins of attraction</button
				>
				<button
					type="button"
					onclick={() => void releaseWalkers()}
					disabled={Boolean(configurationError)}>Release many walkers</button
				>
				<button type="button" onclick={toggleWalkers} disabled={particleTrajectories.length === 0}
					>{particlePlaying ? 'Pause walkers' : 'Resume walkers'}</button
				>
				<button type="button" onclick={resetWalkers} disabled={particleTrajectories.length === 0}
					>Replay walkers</button
				>
				<button type="button" onclick={runRace} disabled={Boolean(configurationError)}
					>Run optimizer race</button
				>
				<button
					type="button"
					onclick={() => void runStabilityMap()}
					disabled={Boolean(configurationError) || stabilityState === 'working'}
					>Scan learning-rate weather</button
				>
			</div>
			<p class="analysis-message" aria-live="polite">
				{basinState === 'working'
					? basinMessage
					: stabilityState === 'working'
						? stabilityMessage
						: basinMessage}
			</p>
			{#if basinState === 'working' || stabilityState === 'working'}
				<progress
					class="analysis-progress"
					aria-label={basinState === 'working'
						? 'Basin calculation in progress'
						: 'Parameter stability calculation in progress'}
				></progress>
			{/if}
		</details>
	</div>

	{#if regressionFacts}
		<section class="regression-section" aria-label="Synchronized regression experiment">
			<RegressionLandscape
				points={[...REGRESSION_BASE_POINTS, REGRESSION_OUTLIER]}
				theta={displayTheta}
				parameterDomain={regressionFacts.domain}
				{grid}
				history={snapshot.history}
				optimum={regressionFacts.knownMinima[0]?.theta ?? null}
				parameterLabels={regressionFacts.parameterLabels}
				outlierEnabled={regressionOutlier}
				onoutliertoggle={(enabled) => {
					regressionOutlier = enabled;
					rebuildLandscape('regression', true);
				}}
				onthetachange={setStart}
			/>
		</section>
	{/if}

	{#if quadraticFacts && optimizerId === 'gd'}
		<section class="quadratic-gauge" aria-labelledby="quadratic-gauge-title">
			<div>
				<p class="eyebrow">
					Exact only for vanilla fixed-step GD on this positive-definite quadratic
				</p>
				<h3 id="quadratic-gauge-title">Vanilla-GD learning-rate stability</h3>
			</div>
			<div class="gauge-track">
				<span
					style={`width: ${Math.min(100, (learningRate / quadraticFacts.stableLearningRateUpperBound) * 100)}%`}
				></span><i
					style={`left: ${Math.min(100, (quadraticFacts.optimalFixedLearningRate / quadraticFacts.stableLearningRateUpperBound) * 100)}%`}
				></i>
			</div>
			<dl>
				<div>
					<dt>λmin</dt>
					<dd>{formatNumber(quadraticFacts.lambdaMin)}</dd>
				</div>
				<div>
					<dt>λmax</dt>
					<dd>{formatNumber(quadraticFacts.lambdaMax)}</dd>
				</div>
				<div>
					<dt>Condition κ</dt>
					<dd>{formatNumber(quadraticFacts.conditionNumber)}</dd>
				</div>
				<div>
					<dt>Stable vanilla-GD interval</dt>
					<dd>0 &lt; η &lt; {formatNumber(quadraticFacts.stableLearningRateUpperBound)}</dd>
				</div>
				<div>
					<dt>Commonly optimal fixed vanilla-GD η*</dt>
					<dd>{formatNumber(quadraticFacts.optimalFixedLearningRate)}</dd>
				</div>
			</dl>
		</section>
	{/if}

	{#if race.length > 0}
		<section class="race-section" aria-labelledby="race-title">
			<div class="section-heading">
				<p class="eyebrow">Same start · cap {raceEvaluationCap} evaluations · same stopping rule</p>
				<h3 id="race-title">Optimizer race</h3>
			</div>
			<div class="race-grid">
				{#each race as entry (entry.config.id)}
					<article data-optimizer={entry.config.id}>
						<h4>{optimizerLabel(entry.config.id)}</h4>
						<p class="race-pattern">
							{entry.config.id === 'gd'
								? '● solid'
								: entry.config.id === 'momentum'
									? '▲ dashed'
									: entry.config.id === 'rmsprop'
										? '■ dotted'
										: '◆ dash-dot'}
						</p>
						<dl>
							<div>
								<dt>η</dt>
								<dd>{formatNumber(entry.config.learningRate)}</dd>
							</div>
							<div>
								<dt>Configured state</dt>
								<dd>{optimizerParameterSummary(entry.config)}</dd>
							</div>
							<div>
								<dt>Final loss</dt>
								<dd>{formatNumber(entry.snapshot.loss, 8)}</dd>
							</div>
							<div>
								<dt>Lowest loss</dt>
								<dd>
									{formatNumber(Math.min(...entry.snapshot.history.map((point) => point.loss)), 8)}
								</dd>
							</div>
							<div>
								<dt>Evaluations / shared cap</dt>
								<dd>{entry.snapshot.gradientEvaluations} / {raceEvaluationCap}</dd>
							</div>
							<div>
								<dt>Final full-gradient norm</dt>
								<dd>{formatNumber(exactGradientNorm(entry.snapshot.theta), 8)}</dd>
							</div>
							<div>
								<dt>Status</dt>
								<dd>{statusLabel(entry.snapshot.status)}</dd>
							</div>
							<div>
								<dt>Destination</dt>
								<dd>{entry.destination.minimum?.label ?? 'Unresolved or no declared basin'}</dd>
							</div>
						</dl>
					</article>
				{/each}
			</div>
			<p class="observation">{raceObservation}</p>
		</section>
	{/if}

	{#if momentumStability}
		<section class="weather-section" aria-labelledby="momentum-weather-title">
			<div class="section-heading">
				<p class="eyebrow">Same surface · start · seed · budget · stopping rule</p>
				<h3 id="momentum-weather-title">Momentum parameter weather map</h3>
			</div>
			<p class="weather-instruction">
				Learning rate η runs logarithmically from left to right; momentum memory β increases from
				top to bottom. Select a cell to load both values. Each cell prints final loss; symbols
				supplement colour: ✓ converged, ≈ rebounding or oscillatory, ~ slow or unresolved, ! escaped
				or divergent. The ruled row and column form the current-configuration crosshair.
			</p>
			<div class="momentum-weather-scroll">
				<div
					class="momentum-weather-grid"
					style={`grid-template-columns: 3.5rem repeat(${momentumStability.width}, minmax(2.8rem, 1fr));`}
					aria-label="Momentum learning-rate and beta stability results"
				>
					<span class="weather-corner">β \ η</span>
					{#each momentumStability.learningRates as rate, column (rate)}
						<span class:label-skip={column % 4 !== 0} class="eta-label"
							>{column % 4 === 0 ? formatNumber(rate, 1) : '·'}</span
						>
					{/each}
					{#each momentumStability.betaValues as beta, row (beta)}
						<span class="beta-label">{formatNumber(beta, 2)}</span>
						{#each momentumStability.cells.slice(row * momentumStability.width, (row + 1) * momentumStability.width) as entry (`${entry.beta}-${entry.learningRate}`)}
							<button
								type="button"
								data-status={entry.status}
								data-regime={weatherRegime(entry, momentumStability.initialLoss)}
								class:current={Math.abs(Math.log(entry.learningRate / learningRate)) < 0.05 &&
									Math.abs(entry.beta - momentumBeta) < 0.035}
								aria-label={`Load η ${formatNumber(entry.learningRate)} and β ${formatNumber(entry.beta)}: ${weatherRegimeLabel(weatherRegime(entry, momentumStability.initialLoss))}, ${statusLabel(entry.status)}, final loss ${formatNumber(entry.finalLoss)}`}
								title={`η ${formatNumber(entry.learningRate)} · β ${formatNumber(entry.beta)} · ${weatherRegimeLabel(weatherRegime(entry, momentumStability.initialLoss))} · ${statusLabel(entry.status)} · final loss ${formatNumber(entry.finalLoss)}`}
								onclick={() => applyMomentumStabilityEntry(entry)}
								><span class="cell-loss">{formatNumber(entry.finalLoss, 1)}</span></button
							>
						{/each}
					{/each}
				</div>
			</div>
			<p class="analysis-message">{stabilityMessage}</p>
		</section>
	{:else if stability.length > 0}
		<section class="weather-section" aria-labelledby="weather-title">
			<div class="section-heading">
				<p class="eyebrow">Specific to this surface, start, seed and budget</p>
				<h3 id="weather-title">Parameter weather map</h3>
			</div>
			<p class="weather-instruction">
				Each column prints η and final loss. Symbols and patterns supplement colour: ✓ converged, ≈
				oscillatory, ! hazardous, ~ slow or unresolved. The ruled column marks the current
				configuration.
			</p>
			<div class="weather-map-scroll">
				<div class="weather-map-plot">
					{#if stabilityBoundaryPercent() !== null}
						<span
							class="exact-boundary"
							style={`left: ${stabilityBoundaryPercent()}%`}
							role="img"
							aria-label={`Exact vanilla-GD quadratic stability boundary η equals ${formatNumber(quadraticFacts?.stableLearningRateUpperBound)}`}
							><span aria-hidden="true">2 / λmax</span></span
						>
					{/if}
					<div class="weather-map" aria-label="Learning rate stability results">
						{#each stability as entry (entry.learningRate)}
							<button
								type="button"
								class:current={Math.abs(Math.log(entry.learningRate / learningRate)) < 0.02}
								data-status={entry.status}
								data-regime={weatherRegime(entry)}
								aria-label={`Load learning rate ${formatNumber(entry.learningRate)}: ${weatherRegimeLabel(weatherRegime(entry))}, ${statusLabel(entry.status)}, final loss ${formatNumber(entry.finalLoss)}`}
								title={`η ${formatNumber(entry.learningRate)} · ${weatherRegimeLabel(weatherRegime(entry))} · ${statusLabel(entry.status)} · final loss ${formatNumber(entry.finalLoss)}`}
								onclick={() => applyStabilityEntry(entry)}
								><span class="weather-symbol" aria-hidden="true"
									>{weatherRegimeSymbol(weatherRegime(entry))}</span
								><span class="weather-short">{weatherRegimeShortLabel(weatherRegime(entry))}</span
								><span class="weather-rate">η {formatNumber(entry.learningRate, 2)}</span><span
									class="weather-loss">L {formatNumber(entry.finalLoss, 2)}</span
								></button
							>
						{/each}
					</div>
				</div>
			</div>
			<p class="analysis-message">
				{stabilityMessage}{quadraticFacts && optimizerId === 'gd'
					? ` Exact vanilla-GD quadratic boundary: η = ${formatNumber(quadraticFacts.stableLearningRateUpperBound)}.`
					: ''}
			</p>
		</section>
	{/if}

	<section
		id="panel-microscope"
		role={compactLayout ? 'tabpanel' : 'region'}
		aria-labelledby={compactLayout ? 'gradient-tab-microscope' : 'microscope-title'}
		class:mobile-hidden={mobileView !== 'microscope'}
		class="microscope-shell"
	>
		<div class="section-heading">
			<p class="eyebrow">Selected iterate {selectedRecord?.iteration ?? 0}</p>
			<h3 id="microscope-title">Step microscope</h3>
		</div>
		<StepMicroscope
			record={microscopeRecord}
			nextPoint={microscopeNextPoint}
			nextLoss={microscopeNextLoss}
			eigensystem={microscopeEigensystem}
			profile={microscopeProfile}
			profileDirectionLabel="actual optimizer update"
			parameterLabels={landscape.parameterLabels}
			auxiliaryVectors={microscopeAuxiliaryVectors}
			uncertaintyFan={microscopeUncertaintyFan}
			stationaryGradientTolerance={gradientTolerance}
			{showTangentPlane}
			showProfile={showCrossSection}
			gradientEstimateLabel={landscapeId === 'regression' && batchSize !== 'full'
				? 'Current seeded minibatch gradient ĝ'
				: noiseStrength > 0
					? 'Current seeded noisy gradient ĝ'
					: 'Exact analytic gradient ∇L'}
		/>
	</section>

	<section
		id="panel-metrics"
		role={compactLayout ? 'tabpanel' : 'region'}
		aria-labelledby={compactLayout ? 'gradient-tab-metrics' : 'history-title'}
		class:mobile-hidden={mobileView !== 'metrics'}
		class="history-shell"
	>
		<div class="section-heading">
			<p class="eyebrow">Horizontal axis · gradient evaluations</p>
			<h3 id="history-title">Loss and step history</h3>
		</div>
		<div class="metric-selector" aria-label="History metric">
			{#each [['loss', 'Raw loss'], ['gradientNorm', 'Outgoing gradient norm'], ['stepNorm', 'Outgoing step norm'], ['distance', 'Distance to known minimum']] as option (option[0])}
				<button
					type="button"
					class:active={metricMode === option[0]}
					onclick={() => (metricMode = option[0] as MetricMode)}>{option[1]}</button
				>
			{/each}
			<label>
				<span>Horizontal axis</span>
				<select bind:value={metricsXAxis}>
					<option value="gradientEvaluations">Gradient evaluations</option>
					<option value="iteration">Iteration</option>
				</select>
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={metricsLogScale} />
				<span>Logarithmic vertical display</span>
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={metricsAutoScale} />
				<span>Auto-scale axes</span>
			</label>
		</div>
		<MetricsChart
			history={snapshot.history}
			runs={raceRuns}
			selectedStepIndex={selectedIteration}
			{transitionProgress}
			metric={metricMode}
			referencePoint={referenceMinimum}
			knownMinima={landscape.knownMinima}
			xAxis={metricsXAxis}
			logScale={metricsLogScale}
			xDomain={metricsAutoScale ? null : [0, maximumIterations]}
			yDomain={metricsAutoScale ? null : stableMetricYDomain}
			onselectstep={(index) => (selectedIteration = index)}
		/>
		<div class="history-layout">
			<div class="exports">
				<button type="button" onclick={downloadRunCsv}>Export run as CSV</button><button
					type="button"
					disabled={Boolean(configurationError)}
					onclick={exportCurrentViewPng}>Export current terrain or map view as PNG</button
				><button type="button" onclick={() => void copySummary()}>Copy run summary</button><button
					type="button"
					onclick={() => void copyExperiment()}>Copy this experiment</button
				><button type="button" onclick={resetCanonicalArticle}>Reset to canonical article</button>
				<p aria-live="polite">{copiedMessage}</p>
			</div>
		</div>
		<AccessibleRunTable
			history={snapshot.history}
			selectedStepIndex={selectedIteration}
			parameterLabels={landscape.parameterLabels}
			maximumRows={600}
			onselectstep={(index) => (selectedIteration = index)}
		/>
	</section>

	<section class="preset-section" aria-labelledby="preset-title">
		<div class="section-heading">
			<p class="eyebrow">Deterministic field expeditions</p>
			<h3 id="preset-title">Try this</h3>
		</div>
		<div class="preset-grid">
			{#each PRESETS as preset (preset.id)}<button
					type="button"
					class:active={activePreset === preset.id}
					onclick={() => applyPreset(preset.id)}
					><strong>{preset.label}</strong><span>{preset.question}</span></button
				>{/each}
		</div>
	</section>

	<p class="live-summary" role="status" aria-live="polite">{statusAnnouncement}</p>
	<footer class="truth-footer">
		<p>
			<strong>Visual truth:</strong> the marker is a parameter vector updated by a discrete algorithm.
			It is not a ball, gravity is never simulated, and playback speed never changes the iterates.
		</p>
		<p>
			Shortcuts outside controls: <kbd>Space</kbd> play/pause · <kbd>N</kbd> single step ·
			<kbd>R</kbd> reset.
		</p>
	</footer>
</section>

<style>
	.observatory {
		--obs-bg: #0b0e0d;
		--obs-panel: #111513;
		--obs-panel-raised: #171b19;
		--obs-rule: #3b413d;
		--obs-rule-bright: #62685f;
		--obs-text: #f1eadc;
		--obs-muted: #aaa99f;
		--obs-gold: #c79a52;
		--obs-cyan: #82b8b0;
		box-sizing: border-box;
		overflow: clip;
		border: 1px solid #343833;
		border-radius: 0.75rem;
		background:
			linear-gradient(rgb(255 255 255 / 0.018) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.012) 1px, transparent 1px), var(--obs-bg);
		background-size: 26px 26px;
		box-shadow: 0 2rem 5rem rgb(7 8 7 / 30%);
		color: var(--obs-text);
		font-family: var(--font-sans);
	}

	.observatory :global(*) {
		box-sizing: border-box;
	}
	.observatory button,
	.observatory input,
	.observatory select {
		font: inherit;
	}
	.masthead {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;
		border-bottom: 1px solid var(--obs-rule);
		padding: 1.2rem 1.35rem;
		background: rgb(9 12 11 / 88%);
	}
	.eyebrow {
		margin: 0 0 0.35rem;
		color: #d9ad62;
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.masthead h2,
	.section-heading h3,
	.quadratic-gauge h3 {
		margin: 0;
		color: #fff8e9;
		font-weight: 760;
		letter-spacing: -0.035em;
	}
	.masthead h2 {
		font-size: clamp(1.6rem, 3vw, 2.65rem);
	}
	.deck {
		max-width: 62ch;
		margin: 0.45rem 0 0;
		color: var(--obs-muted);
		font: 0.85rem/1.5 var(--font-serif);
	}
	.status-stack {
		display: grid;
		justify-items: end;
		gap: 0.45rem;
		color: var(--obs-muted);
		font: 0.68rem/1.3 var(--font-mono);
		text-align: right;
	}
	.status-badge {
		border: 1px solid #5f756c;
		border-radius: 999px;
		background: #14201b;
		padding: 0.38rem 0.6rem;
		color: #b8ddd1;
		font-weight: 700;
	}
	.status-badge.terminal {
		border-color: #9b704d;
		background: #2b1c13;
		color: #efc49b;
	}
	.configuration-error {
		grid-column: 1 / -1;
		margin: 0.3rem 0 0;
		border-left: 3px solid #d98b63;
		background: #2a1812;
		padding: 0.65rem 0.75rem;
		color: #ffd0bb;
		font: 0.76rem/1.5 var(--font-sans);
	}
	.instrument-bar {
		display: grid;
		grid-template-columns: auto minmax(10rem, 1fr) minmax(10rem, 1fr) minmax(13rem, 1.6fr) minmax(
				8rem,
				0.8fr
			);
		gap: 0.75rem;
		align-items: end;
		border-bottom: 1px solid var(--obs-rule);
		padding: 0.9rem 1rem;
		background: #101412;
	}
	.transport {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid var(--obs-rule-bright);
		border-radius: 0.32rem;
		background: #1a1f1c;
		padding: 0.58rem 0.72rem;
		color: var(--obs-text);
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: #c39a57;
		background: #242a26;
	}
	button.primary {
		border-color: #d4ab64;
		background: var(--obs-gold);
		color: #18130c;
		font-weight: 800;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible,
	summary:focus-visible {
		outline: 3px solid #f8deaa;
		outline-offset: 2px;
	}
	label {
		display: grid;
		gap: 0.35rem;
		color: var(--obs-muted);
		font-size: 0.68rem;
	}
	label > span {
		font-weight: 700;
		letter-spacing: 0.035em;
	}
	select,
	input:not([type='checkbox'], [type='range']) {
		min-height: 2.75rem;
		width: 100%;
		border: 1px solid var(--obs-rule);
		border-radius: 0.3rem;
		background: #0e1210;
		padding: 0.55rem 0.62rem;
		color: var(--obs-text);
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--obs-gold);
	}
	.learning-rate output {
		float: right;
		color: #f0d49f;
		font-family: var(--font-mono);
	}
	.mobile-tabs {
		display: none;
	}
	.stage-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(22rem, 0.88fr);
		grid-template-areas: 'terrain map' 'metrics metrics';
		gap: 0.75rem;
		padding: 0.75rem;
	}
	.terrain-panel {
		grid-area: terrain;
	}
	.map-panel {
		grid-area: map;
	}
	.terrain-panel,
	.map-panel {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--obs-rule);
		border-radius: 0.5rem;
		background: var(--obs-panel);
	}
	.panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 3rem;
		border-bottom: 1px solid var(--obs-rule);
		padding: 0.55rem 0.7rem;
	}
	.panel-heading > div {
		display: flex;
		align-items: baseline;
		gap: 0.55rem;
	}
	.panel-heading span {
		color: var(--obs-gold);
		font: 0.64rem/1 var(--font-mono);
	}
	.panel-heading h3 {
		margin: 0;
		color: #f4eddf;
		font-size: 0.9rem;
	}
	.panel-heading p,
	.panel-status {
		margin: 0;
		color: var(--obs-muted);
		font: 0.62rem/1.35 var(--font-mono);
	}
	.terrain-frame {
		height: clamp(27rem, 48vw, 43rem);
	}
	.map-frame {
		height: clamp(27rem, 48vw, 43rem);
	}
	.panel-status {
		border-top: 1px solid var(--obs-rule);
		padding: 0.45rem 0.7rem;
	}
	.probe-readout {
		display: block;
		min-height: 2rem;
		border-top: 1px solid var(--obs-rule);
		padding: 0.45rem 0.7rem;
		color: #c9d8d2;
		font: 0.62rem/1.4 var(--font-mono);
	}
	.metrics-strip {
		grid-area: metrics;
		display: grid;
		grid-template-columns: repeat(8, minmax(7rem, 1fr));
		overflow-x: auto;
		border: 1px solid var(--obs-rule);
		border-radius: 0.5rem;
		background: #0e1210;
	}
	.metrics-strip > div {
		min-width: 7rem;
		border-right: 1px solid var(--obs-rule);
		padding: 0.65rem;
	}
	.metrics-strip dt,
	dl dt {
		color: var(--obs-muted);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.metrics-strip dd,
	dl dd {
		margin: 0.25rem 0 0;
		color: #f4eddf;
		font: 0.76rem/1.25 var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.configuration-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		padding: 0 0.75rem 0.75rem;
	}
	details {
		border: 1px solid var(--obs-rule);
		border-radius: 0.45rem;
		background: var(--obs-panel);
	}
	summary {
		min-height: 2.9rem;
		padding: 0.8rem 0.9rem;
		color: #efe7d9;
		font-size: 0.78rem;
		font-weight: 750;
		cursor: pointer;
	}
	.advanced-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		border-top: 1px solid var(--obs-rule);
		padding: 0.85rem;
	}
	.check {
		display: flex;
		min-height: 2.75rem;
		flex-direction: row;
		align-items: center;
		gap: 0.45rem;
	}
	.check input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--obs-gold);
	}
	.overlay-fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin: 0 0.85rem 0.85rem;
		border: 1px solid var(--obs-rule);
		padding: 0.65rem;
	}
	.overlay-fieldset legend {
		color: var(--obs-muted);
		font-size: 0.66rem;
	}
	.analysis-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		border-top: 1px solid var(--obs-rule);
		padding: 0.8rem;
	}
	.analysis-message {
		margin: 0;
		padding: 0 0.85rem 0.8rem;
		color: var(--obs-muted);
		font-size: 0.72rem;
		line-height: 1.5;
	}
	.analysis-progress {
		display: block;
		width: calc(100% - 1.7rem);
		height: 0.45rem;
		margin: 0 0.85rem 0.85rem;
		accent-color: var(--obs-gold);
	}
	.quadratic-gauge,
	.regression-section,
	.race-section,
	.weather-section,
	.microscope-shell,
	.history-shell,
	.preset-section {
		margin: 0 0.75rem 0.75rem;
		border: 1px solid var(--obs-rule);
		border-radius: 0.5rem;
		background: var(--obs-panel);
		padding: 1rem;
	}
	.section-heading {
		margin-bottom: 0.9rem;
	}
	.section-heading h3,
	.quadratic-gauge h3 {
		font-size: clamp(1.2rem, 2vw, 1.7rem);
	}
	.gauge-track {
		position: relative;
		height: 0.55rem;
		margin: 1rem 0;
		border-radius: 999px;
		background: #3c2519;
	}
	.gauge-track span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #56897f, #d8b368, #c76849);
	}
	.gauge-track i {
		position: absolute;
		top: -0.35rem;
		width: 2px;
		height: 1.25rem;
		background: #fff2cb;
	}
	.quadratic-gauge dl,
	.race-grid dl {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.65rem;
		margin: 0;
	}
	.quadratic-gauge dl > div,
	.race-grid dl > div {
		border-left: 2px solid #46504a;
		padding-left: 0.55rem;
	}
	.race-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.65rem;
	}
	.race-grid article {
		border: 1px solid var(--obs-rule);
		border-radius: 0.4rem;
		background: #0e1210;
		padding: 0.8rem;
	}
	.race-grid h4 {
		margin: 0;
		color: #f2eadc;
	}
	.race-grid dl {
		grid-template-columns: 1fr;
	}
	.race-pattern {
		color: var(--obs-gold);
		font: 0.7rem/1.2 var(--font-mono);
	}
	.observation {
		margin: 0.85rem 0 0;
		border-left: 3px solid var(--obs-gold);
		padding-left: 0.8rem;
		color: #d2ccbf;
		font: 0.85rem/1.6 var(--font-serif);
	}
	.weather-map-scroll {
		overflow-x: auto;
		padding-top: 1.35rem;
	}
	.weather-map-plot {
		position: relative;
		min-width: 84rem;
	}
	.weather-map {
		display: grid;
		grid-template-columns: repeat(31, minmax(0, 1fr));
		gap: 2px;
	}
	.weather-map button {
		position: relative;
		display: grid;
		min-width: 0;
		min-height: 4.5rem;
		gap: 0.15rem;
		place-content: center;
		padding: 0.2rem 0.1rem;
	}
	.weather-map button[data-status='converged'] {
		background: #234b43;
	}
	.weather-map button[data-status='iteration-limit'],
	.weather-map button[data-status='stalled'] {
		background: #5c4a25;
	}
	.weather-map button[data-status='escaped-domain'],
	.weather-map button[data-status='numerically-diverged'] {
		background: #693528;
	}
	.weather-map button[data-regime='oscillatory'] {
		background: repeating-linear-gradient(135deg, #6b5524 0 5px, #3e482f 5px 10px);
	}
	.weather-map button[data-regime='unresolved'] {
		background: repeating-linear-gradient(45deg, #4a4d49 0 3px, #5d5142 3px 6px);
	}
	.weather-map button.current {
		z-index: 2;
		box-shadow: inset 0 0 0 3px #fff2c8;
	}
	.weather-map span {
		font: 0.55rem/1 var(--font-mono);
	}
	.weather-map .weather-symbol {
		color: #fff4d7;
		font-size: 0.82rem;
		font-weight: 800;
	}
	.weather-map .weather-short {
		color: #eee4d0;
		font-size: 0.48rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.weather-rate,
	.weather-loss {
		display: block;
		writing-mode: vertical-rl;
	}
	.weather-loss {
		color: #fff2d3;
	}
	.exact-boundary {
		position: absolute;
		z-index: 4;
		top: -1.2rem;
		bottom: 0;
		width: 0;
		border-left: 2px dashed #f2d28a;
		pointer-events: none;
	}
	.exact-boundary span {
		position: absolute;
		top: 0;
		left: 0.2rem;
		width: max-content;
		color: #f2d28a;
		font: 0.58rem/1 var(--font-mono);
	}
	.weather-instruction {
		max-width: 78ch;
		color: var(--obs-muted);
		font: 0.72rem/1.55 var(--font-sans);
	}
	.momentum-weather-scroll {
		overflow-x: auto;
		padding-bottom: 0.35rem;
	}
	.momentum-weather-grid {
		display: grid;
		min-width: 72rem;
		gap: 2px;
		align-items: stretch;
	}
	.momentum-weather-grid > span {
		display: grid;
		min-height: 1.35rem;
		place-items: center;
		color: #aaa99f;
		font: 0.52rem/1 var(--font-mono);
	}
	.momentum-weather-grid button {
		position: relative;
		min-width: 2.8rem;
		min-height: 2.75rem;
		border: 1px solid #4d5651;
		border-radius: 0.12rem;
		background: #3f4d46;
		padding: 0;
	}
	.momentum-weather-grid button::after {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #f7edda;
		align-items: start;
		padding-top: 0.28rem;
		font: 700 0.65rem/1 var(--font-mono);
		content: '~';
	}
	.momentum-weather-grid button[data-regime='converged'] {
		background: #295b4e;
	}
	.momentum-weather-grid button[data-regime='converged']::after {
		content: '✓';
	}
	.momentum-weather-grid button[data-regime='oscillatory'] {
		background: repeating-linear-gradient(135deg, #6e5826 0 4px, #3c4933 4px 8px);
	}
	.momentum-weather-grid button[data-regime='oscillatory']::after {
		content: '≈';
	}
	.momentum-weather-grid button[data-regime='hazard'] {
		background: repeating-linear-gradient(135deg, #71382c 0 4px, #4b2822 4px 8px);
	}
	.momentum-weather-grid button[data-regime='hazard']::after {
		content: '!';
	}
	.momentum-weather-grid button.current {
		z-index: 1;
		overflow: visible;
		box-shadow: 0 0 0 2px #fff1c8;
	}
	.momentum-weather-grid button.current::before {
		position: absolute;
		z-index: 0;
		top: 50%;
		left: 50%;
		width: 200vw;
		height: 200vh;
		transform: translate(-50%, -50%);
		background:
			linear-gradient(
				to bottom,
				transparent calc(50% - 0.5px),
				rgb(255 242 200 / 48%) 50%,
				transparent calc(50% + 0.5px)
			),
			linear-gradient(
				to right,
				transparent calc(50% - 0.5px),
				rgb(255 242 200 / 48%) 50%,
				transparent calc(50% + 0.5px)
			);
		content: '';
		pointer-events: none;
	}
	.cell-loss {
		position: absolute;
		z-index: 2;
		right: 0.1rem;
		bottom: 0.14rem;
		left: 0.1rem;
		overflow: hidden;
		color: #fff0cb;
		font: 0.58rem/1 var(--font-mono);
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.history-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 14rem;
		gap: 0.8rem;
	}
	.metric-selector {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.7rem;
	}
	.metric-selector button.active {
		border-color: #e1b968;
		background: #3a2b18;
		color: #fff0c9;
	}
	.exports {
		display: grid;
		align-content: start;
		gap: 0.45rem;
	}
	.exports p {
		min-height: 1.4rem;
		margin: 0;
		color: #b7d8cf;
		font-size: 0.68rem;
	}
	.preset-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.preset-grid button {
		display: grid;
		min-height: 6rem;
		gap: 0.35rem;
		align-content: start;
		text-align: left;
	}
	.preset-grid button.active {
		border-color: #d3aa63;
		background: #2a2518;
	}
	.preset-grid strong {
		color: #f3eadb;
		font-size: 0.76rem;
	}
	.preset-grid span {
		color: var(--obs-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}
	.live-summary {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.truth-footer {
		display: flex;
		justify-content: space-between;
		gap: 2rem;
		border-top: 1px solid var(--obs-rule);
		background: #0e1210;
		padding: 0.85rem 1rem;
		color: var(--obs-muted);
		font-size: 0.68rem;
		line-height: 1.5;
	}
	.truth-footer p {
		max-width: 70ch;
		margin: 0;
	}
	kbd {
		border: 1px solid #60655f;
		border-radius: 0.2rem;
		background: #181c1a;
		padding: 0.08rem 0.28rem;
		color: #eee7d8;
		font-family: var(--font-mono);
	}

	@media (max-width: 76rem) {
		.instrument-bar {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.transport,
		.learning-rate {
			grid-column: 1 / -1;
		}
		.stage-grid {
			grid-template-columns: minmax(0, 1.25fr) minmax(20rem, 0.9fr);
		}
		.metrics-strip {
			grid-template-columns: repeat(4, minmax(8rem, 1fr));
		}
		.race-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 52rem) {
		.observatory {
			border-radius: 0.45rem;
		}
		.masthead {
			display: grid;
			gap: 0.8rem;
		}
		.status-stack {
			justify-items: start;
			text-align: left;
		}
		.mobile-tabs {
			position: sticky;
			top: 0;
			z-index: 8;
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			border-block: 1px solid var(--obs-rule);
			background: #0b0e0d;
			padding: 0.35rem;
		}
		.mobile-tabs button {
			min-width: 0;
			min-height: 2.75rem;
			padding: 0.35rem;
			font-size: 0.68rem;
		}
		.mobile-tabs button[aria-selected='true'] {
			border-color: #d3aa63;
			background: #292419;
			color: #ffe3ad;
		}
		.stage-grid {
			display: block;
			padding: 0.45rem;
		}
		.terrain-panel,
		.map-panel {
			margin: 0;
		}
		.mobile-hidden {
			display: none !important;
		}
		.terrain-frame,
		.map-frame {
			height: min(70vh, 38rem);
			min-height: 27rem;
		}
		.metrics-strip {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			margin-top: 0.45rem;
		}
		.configuration-row {
			grid-template-columns: 1fr;
			padding: 0 0.45rem 0.45rem;
		}
		.advanced-grid {
			grid-template-columns: 1fr 1fr;
		}
		.quadratic-gauge,
		.race-section,
		.weather-section,
		.microscope-shell,
		.history-shell,
		.preset-section {
			margin: 0 0.45rem 0.45rem;
			padding: 0.75rem;
		}
		.history-layout {
			grid-template-columns: 1fr;
		}
		.quadratic-gauge dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.preset-grid {
			grid-template-columns: 1fr 1fr;
		}
		.weather-map-plot {
			min-width: 78rem;
		}
		.truth-footer {
			display: grid;
			gap: 0.6rem;
		}
	}

	@media (max-width: 34rem) {
		.instrument-bar,
		.advanced-grid {
			grid-template-columns: 1fr;
		}
		.instrument-bar > *,
		.transport,
		.learning-rate {
			grid-column: auto;
		}
		.transport {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
		.panel-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.25rem;
		}
		.race-grid,
		.preset-grid {
			grid-template-columns: 1fr;
		}
		.terrain-frame,
		.map-frame {
			height: 31rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.observatory *,
		.observatory *::before,
		.observatory *::after {
			scroll-behavior: auto !important;
			transition-duration: 0.001ms !important;
			animation-duration: 0.001ms !important;
			animation-iteration-count: 1 !important;
		}
	}

	@media (forced-colors: active) {
		.observatory {
			border: 3px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}
		.observatory button,
		.observatory input,
		.observatory select,
		.observatory details,
		.terrain-panel,
		.map-panel {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
