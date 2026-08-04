<script lang="ts">
	import { onMount } from 'svelte';
	import DiagnosticChart from './DiagnosticChart.svelte';
	import EquationCard from './EquationCard.svelte';
	import ExportMenu from './ExportMenu.svelte';
	import LaboratoryControls from './LaboratoryControls.svelte';
	import MetricsPanel from './MetricsPanel.svelte';
	import PresetStories from './PresetStories.svelte';
	import ProcessSelector from './ProcessSelector.svelte';
	import SimulationStage from './SimulationStage.svelte';
	import type {
		CameraState,
		ChartPoint,
		DiagnosticId,
		HistogramBin,
		LaboratoryControl,
		MetricSample,
		ObstacleOverlay,
		PotentialOverlay,
		ProcessChoice,
		ProcessFamily,
		StoryPresetChoice,
		TheoryOverlay
	} from './ui-types';
	import {
		BROWNIAN_EXPERIMENT_URL_VERSION,
		BrownianSimulation,
		MODEL_PRESETS,
		MODEL_REGISTRY,
		PROCESS_IDS,
		ParticleState,
		TrajectoryBuffer,
		boltzmannWeight,
		calculateSimulationMetrics,
		cleanBrownianExperimentUrl,
		decodeBrownianExperimentUrl,
		encodeBrownianExperimentUrl,
		firstPassageDensity,
		potentialAndGradient,
		type BoundaryCondition,
		type FirstPassageParameters,
		type InitialCondition,
		type PotentialDiffusionParameters,
		type ProcessId,
		type ProcessModel,
		type SimulationMetrics,
		type TheoryPrediction,
		type ValidationIssue
	} from '$lib/visualizations/brownian-motion';
	import type { FractionalBrownianPaths } from '$lib/visualizations/brownian-motion/advanced';
	import type { FirstPassageResult } from '$lib/visualizations/brownian-motion/advanced';
	import {
		createEnsembleWorkerClient,
		createFractionalWorkerClient,
		type AdvancedWorkerClient,
		type AdvancedWorkerResponse
	} from '$lib/visualizations/brownian-motion/workers';

	type ControlValue = string | number | boolean;
	type AnyParameters = Record<string, unknown>;
	type WorkerState = 'idle' | 'working' | 'complete' | 'error';

	interface MetricHistoryPoint {
		readonly time: number;
		readonly msd: number | null;
		readonly theoreticalMsd: number | null;
		readonly survival: number;
		readonly theoreticalSurvival: number | null;
	}

	interface GenericDefinition {
		readonly id: ProcessId;
		readonly label: string;
		readonly category: 'core' | 'conditioned' | 'active' | 'mathematical-cousin' | 'arrival';
		readonly description: string;
		readonly plainInterpretation: string;
		readonly equation: { readonly plain: string; readonly latex: string };
		readonly whatToWatch: string;
		readonly compatibleDiagnostics: readonly string[];
		readonly controls: readonly {
			readonly key: string;
			readonly label: string;
			readonly kind: 'number' | 'integer' | 'angle' | 'boolean' | 'select' | 'obstacles';
			readonly unit?: string;
			readonly minimum?: number;
			readonly maximum?: number;
			readonly step?: number;
			readonly options?: readonly {
				readonly label: string;
				readonly value: string | number | boolean;
			}[];
		}[];
		readonly defaultParameters: AnyParameters;
		readonly trajectoryGenerator?: boolean;
		readonly create?: (parameters: AnyParameters) => ProcessModel<object>;
		readonly theory?: (
			parameters: AnyParameters,
			request: { time: number; initialCondition?: InitialCondition }
		) => TheoryPrediction;
		readonly validate: (parameters: AnyParameters, timestep?: number) => readonly ValidationIssue[];
	}

	interface StoryPreset extends StoryPresetChoice {
		readonly modelPresetId: string;
	}

	interface LevyDisplacementStatistics {
		readonly firstQuartile: number;
		readonly median: number;
		readonly thirdQuartile: number;
		readonly interquartileRange: number;
		readonly clippedCount: number;
		readonly sampleCount: number;
	}

	const SIMULATION_VERSION = 1 as const;
	const DEFAULT_SEED = 'indecision-1827';
	const DEFAULT_TIMESTEP = 1 / 120;
	const EMPTY_METRICS: SimulationMetrics = {
		simulationTime: 0,
		particleCount: 1,
		aliveCount: 1,
		absorbedCount: 0,
		survivalFraction: 1,
		mean: { x: 0, y: 0 },
		variance: { x: 0, y: 0 },
		covarianceXY: 0,
		meanSquareDisplacement: 0,
		meanSquareDisplacementByAxis: { x: 0, y: 0 },
		rootMeanSquareDisplacement: 0
	};
	const SHORT_LABELS: Readonly<Record<ProcessId, string>> = {
		'random-walk': 'Walk',
		'free-brownian': 'Free',
		'drift-diffusion': 'Drift',
		'anisotropic-diffusion': 'Tensor D',
		'ornstein-uhlenbeck': 'OU trap',
		'underdamped-langevin': 'Inertial',
		'potential-diffusion': 'Landscape',
		'active-brownian': 'Active',
		'brownian-bridge': 'Bridge',
		'fractional-brownian': 'fBM',
		'geometric-brownian': 'GBM',
		'levy-flight': 'Lévy',
		'first-passage': 'Arrival'
	};

	function definitionFor(id: ProcessId): GenericDefinition {
		return MODEL_REGISTRY[id] as unknown as GenericDefinition;
	}

	function familyFor(id: ProcessId): ProcessFamily {
		const category = definitionFor(id).category;
		if (category === 'conditioned') return 'conditioned';
		if (category === 'active') return 'active';
		if (category === 'mathematical-cousin') return 'cousin';
		if (category === 'arrival') return 'arrival';
		return 'brownian';
	}

	const PROCESS_CHOICES: readonly ProcessChoice[] = PROCESS_IDS.map((id) => {
		const definition = definitionFor(id);
		return {
			id,
			label: definition.label,
			shortLabel: SHORT_LABELS[id],
			family: familyFor(id),
			description: definition.description,
			equation: definition.equation.plain,
			interpretation: definition.plainInterpretation,
			whatToWatch: definition.whatToWatch
		};
	});

	const STORY_PRESETS: readonly StoryPreset[] = [
		{
			id: 'first-anecdote',
			label: 'The first anecdote',
			description: 'One seeded path before the ensemble reveals the law.',
			processId: 'free-brownian',
			seed: DEFAULT_SEED,
			modelPresetId: 'one-indecisive-particle'
		},
		{
			id: 'thousand-histories',
			label: 'A thousand invisible histories',
			description: 'The Gaussian cloud and four-D-t law emerge from a crowd.',
			processId: 'free-brownian',
			seed: 'ensemble-1905',
			modelPresetId: 'thousand-histories'
		},
		{
			id: 'colloidal-water',
			label: 'A bead in water',
			description: 'Use Stokes–Einstein units with explicit temperature, viscosity, and radius.',
			processId: 'free-brownian',
			seed: 'colloid-1905',
			modelPresetId: 'colloidal-bead-water'
		},
		{
			id: 'shrink-steps',
			label: 'Shrink the steps',
			description: 'Approach the Brownian scaling limit from a lattice walk.',
			processId: 'random-walk',
			seed: 'donsker-1951',
			modelPresetId: 'tiny-steps-same-diffusion'
		},
		{
			id: 'river-current',
			label: 'The river has a current',
			description: 'The mean moves while the centred variance keeps diffusing.',
			processId: 'drift-diffusion',
			seed: 'river-current',
			modelPresetId: 'gentle-current'
		},
		{
			id: 'layered-material',
			label: 'A layered material',
			description: 'A rotated covariance ellipse exposes directional diffusion.',
			processId: 'anisotropic-diffusion',
			seed: 'layers-42',
			modelPresetId: 'rotated-layers'
		},
		{
			id: 'optical-trap',
			label: 'Held by invisible tweezers',
			description: 'A harmonic restoring force makes the variance saturate.',
			processId: 'ornstein-uhlenbeck',
			seed: 'trap-perrin',
			modelPresetId: 'strong-trap'
		},
		{
			id: 'barrier',
			label: 'The hesitant barrier crossing',
			description: 'Thermal noise occasionally carries a particle between wells.',
			processId: 'potential-diffusion',
			seed: 'double-well-17',
			modelPresetId: 'rare-barrier-crossing'
		},
		{
			id: 'somewhere',
			label: 'A particle with somewhere to be',
			description: 'Propulsion creates persistence without equilibrium drift.',
			processId: 'active-brownian',
			seed: 'swimmer-73',
			modelPresetId: 'persistent-swimmer'
		},
		{
			id: 'home-six',
			label: 'Home by six',
			description: 'A random middle is conditioned to hit an appointed endpoint.',
			processId: 'brownian-bridge',
			seed: 'home-by-six',
			modelPresetId: 'return-origin'
		},
		{
			id: 'memory',
			label: 'Noise with a memory',
			description: 'Change H to make increments oppose or reinforce one another.',
			processId: 'fractional-brownian',
			seed: 'mandelbrot-ness',
			modelPresetId: 'persistent'
		},
		{
			id: 'wall-wins',
			label: 'The wall eventually wins',
			description: 'Watch survival fall as first arrivals accumulate.',
			processId: 'first-passage',
			seed: 'redner-wall',
			modelPresetId: 'near-wall'
		},
		{
			id: 'rare-jump',
			label: 'One enormous step',
			description: 'A heavy-tailed Lévy flight breaks the ordinary-MSD intuition.',
			processId: 'levy-flight',
			seed: 'levy-1937',
			modelPresetId: 'cauchy-jumps'
		}
	];

	function cloneParameters(id: ProcessId): AnyParameters {
		return JSON.parse(JSON.stringify(definitionFor(id).defaultParameters)) as AnyParameters;
	}

	function cloneBoundary(value: BoundaryCondition): BoundaryCondition {
		return value.mode === 'unbounded'
			? { mode: 'unbounded' }
			: { mode: value.mode, bounds: { ...value.bounds } };
	}

	function boundedNumber(
		value: unknown,
		minimum: number,
		maximum: number,
		fallback: number
	): number {
		const parsed = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
	}

	let laboratory: HTMLElement;
	let seed = $state(DEFAULT_SEED);
	let seedDraft = $state(DEFAULT_SEED);
	let processId = $state<ProcessId>('free-brownian');
	let parameters = $state<AnyParameters>(cloneParameters('free-brownian'));
	let initialCondition = $state<InitialCondition>({ x: 0, y: 0, spread: 0 });
	let boundary = $state<BoundaryCondition>({ mode: 'unbounded' });
	let particleCount = $state(1);
	let timestep = $state(DEFAULT_TIMESTEP);
	let speed = $state(1);
	let trailLength = $state(720);
	let trailOpacity = $state(0.78);
	let particleSize = $state(3.6);
	let showDensity = $state(false);
	let showTheory = $state(true);
	let showPaths = $state(true);
	let showParticles = $state(true);
	let camera = $state<CameraState>({ centreX: 0, centreY: 0, zoom: 1, autoFit: true });
	let selectedPreset = $state('one-indecisive-particle');
	let selectedStory = $state('first-anecdote');
	let physicalUnits = $state(false);
	let activeDiagnostic = $state<DiagnosticId>('trajectory');
	let playing = $state(true);
	let reducedMotion = $state(false);
	let offscreen = $state(false);
	let initialized = $state(false);
	let disposed = $state(false);
	let revision = $state(0);
	let metrics = $state<SimulationMetrics>(EMPTY_METRICS);
	let metricHistory = $state<MetricHistoryPoint[]>([]);
	let status = $state('Calibrating independent random streams.');
	let workerState = $state<WorkerState>('idle');
	let workerKind = $state<'none' | 'fractional' | 'first-passage' | 'density'>('none');
	let workerProgress = $state(0);
	let debugEnabled = $state(false);
	let renderFrameCount = $state(0);
	let lastStepMilliseconds = $state(0);
	let lastRenderMilliseconds = $state(0);
	let lastInterpolationAlpha = $state(0);
	let fractionalResult = $state<FractionalBrownianPaths | null>(null);
	let firstPassageResult = $state<FirstPassageResult | null>(null);
	let firstPassageMaxTime = $state(8);
	let fractionalState = $state(new ParticleState(1));
	let fractionalTrajectories = $state(new TrajectoryBuffer(1, 720, 1));
	let fractionalIndex = $state(0);
	let fractionalAccumulator = 0;
	let canvas: HTMLCanvasElement | null = null;
	let simulation = $state(createRuntimeSimulation('free-brownian'));

	let frameId = 0;
	let previousTimestamp = 0;
	let lastPublish = 0;
	let lastAnnouncement = 0;
	let urlTimer = 0;
	let intersectionObserver: IntersectionObserver | null = null;
	let motionObserver: MutationObserver | null = null;
	let fractionalClient: AdvancedWorkerClient | null = null;
	let ensembleClient: AdvancedWorkerClient | null = null;
	let unsubscribeFractional: (() => void) | null = null;
	let unsubscribeEnsemble: (() => void) | null = null;

	let definition = $derived(definitionFor(processId));
	let displayState = $derived(
		processId === 'fractional-brownian' ? fractionalState : simulation.state
	);
	let displayTrajectories = $derived(
		processId === 'fractional-brownian' ? fractionalTrajectories : simulation.trajectories
	);
	let theoryPrediction = $derived(predictTheory());
	let theoryOverlay = $derived(makeTheoryOverlay(theoryPrediction));
	let potentialOverlay = $derived(makePotentialOverlay());
	let obstacleOverlays = $derived(makeObstacleOverlays());
	let metricSample = $derived(makeMetricSample());
	let controls = $derived(makeControls());
	let controlValues = $derived(makeControlValues());
	let availableDiagnostics = $derived(makeAvailableDiagnostics());
	let chartMeasured = $derived(makeMeasuredSeries());
	let chartTheory = $derived(makeTheorySeries());
	let chartScatter = $derived(makeScatter());
	let chartHistogram = $derived(makeHistogram());
	let levyStatistics = $derived(makeLevyDisplacementStatistics());
	let numericalWarning = $derived(makeNumericalWarning());
	let chartLabelState = $derived(chartLabels());
	let introductoryState = $derived(processId === 'free-brownian' && particleCount === 1);

	function createRuntimeSimulation(id: ProcessId): BrownianSimulation {
		const selected = definitionFor(id);
		if (!selected.create) {
			const fallback = definitionFor('free-brownian');
			return new BrownianSimulation({
				seed,
				particleCount: 1,
				timestep,
				speed,
				model: fallback.create?.(cloneParameters('free-brownian')) as ProcessModel<object>,
				initialCondition,
				boundary: { mode: 'unbounded' },
				trajectory: { capacity: trailLength, sampleEverySteps: 2, trackedParticleCount: 1 }
			});
		}
		return new BrownianSimulation({
			seed,
			particleCount,
			timestep,
			speed,
			model: selected.create(parameters),
			initialCondition,
			boundary,
			maxFrameDelta: 0.2,
			maxStepsPerFrame: 180,
			trajectory: {
				capacity: trailLength,
				sampleEverySteps: Math.max(1, Math.round(1 / Math.max(1, timestep * 60))),
				trackedParticleCount: Math.min(particleCount, particleCount === 1 ? 1 : 96)
			}
		});
	}

	function predictTheory(): TheoryPrediction | null {
		if (!definition.theory) return null;
		try {
			return definition.theory(parameters, { time: metrics.simulationTime, initialCondition });
		} catch {
			return null;
		}
	}

	function makeTheoryOverlay(prediction: TheoryPrediction | null): TheoryOverlay | null {
		if (!prediction?.variance) return null;
		return {
			meanX: prediction.mean?.x ?? 0,
			meanY: prediction.mean?.y ?? 0,
			varianceX: prediction.variance.x,
			varianceY: prediction.variance.y,
			covarianceXY: prediction.covarianceXY ?? 0,
			label: `${definition.label} analytical covariance`
		};
	}

	function makePotentialOverlay(): PotentialOverlay | null {
		if (processId !== 'potential-diffusion') return null;
		return {
			landscape: String(parameters.landscape) as PotentialOverlay['landscape'],
			centerX: Number(parameters.centerX),
			centerY: Number(parameters.centerY),
			stiffness: Number(parameters.stiffness),
			transverseStiffness: Number(parameters.transverseStiffness),
			barrierHeight: Number(parameters.barrierHeight),
			wellSeparation: Number(parameters.wellSeparation),
			period: Number(parameters.period),
			tilt: Number(parameters.tilt ?? 0)
		};
	}

	function makeObstacleOverlays(): readonly ObstacleOverlay[] {
		const value = parameters.obstacles;
		if (!Array.isArray(value)) return [];
		return value.filter((item): item is ObstacleOverlay => {
			if (!item || typeof item !== 'object') return false;
			const candidate = item as Record<string, unknown>;
			return [candidate.x, candidate.y, candidate.radius].every(
				(entry) => typeof entry === 'number' && Number.isFinite(entry)
			);
		});
	}

	function diffusionForStage(): number {
		if (typeof parameters.diffusion === 'number') return Math.max(0, parameters.diffusion);
		if (typeof parameters.translationalDiffusion === 'number')
			return Math.max(0, parameters.translationalDiffusion);
		if (typeof parameters.thermalEnergy === 'number' && typeof parameters.mobility === 'number')
			return Math.max(0, parameters.thermalEnergy * parameters.mobility);
		if (typeof parameters.scale === 'number') return Math.max(0.001, parameters.scale ** 2 / 2);
		return 0.7;
	}

	function stokesEinsteinDiffusion(
		temperatureKelvin: number,
		viscosityPascalSeconds: number,
		radiusMetres: number
	): number {
		const boltzmann = 1.380649e-23;
		const squareMetresPerSecond =
			(boltzmann * temperatureKelvin) / (6 * Math.PI * viscosityPascalSeconds * radiusMetres);
		return squareMetresPerSecond * 1e12;
	}

	function loadPhysicalPreset(): void {
		physicalUnits = true;
		const temperatureKelvin = 298.15;
		const viscosityPas = 0.00089;
		const radiusMetres = 0.5e-6;
		parameters = {
			diffusion: stokesEinsteinDiffusion(temperatureKelvin, viscosityPas, radiusMetres),
			temperatureKelvin,
			viscosityPas,
			radiusMetres
		};
		initialCondition = { x: 0, y: 0, spread: 0 };
		boundary = { mode: 'unbounded' };
		particleCount = 1000;
		selectedPreset = 'colloidal-bead-water';
		resetRun(
			'Physical-units preset loaded. Stokes–Einstein D was computed in SI and displayed in square micrometres per second.'
		);
	}

	function makeMetricSample(): MetricSample {
		return {
			...metrics,
			theoreticalMsd:
				theoryPrediction?.finiteMeanSquareDisplacement === false
					? null
					: (theoryPrediction?.meanSquareDisplacement ?? null),
			theoreticalMeanX: theoryPrediction?.mean?.x ?? null,
			theoreticalMeanY: theoryPrediction?.mean?.y ?? null,
			measuredExponent: localExponent()
		};
	}

	function localExponent(): number | null {
		const valid = metricHistory.filter((point) => point.time > 0 && (point.msd ?? 0) > 0);
		if (valid.length < 4) return null;
		const earlier = valid[Math.max(0, valid.length - 10)];
		const later = valid[valid.length - 1];
		if (earlier.msd === null || later.msd === null || later.time === earlier.time) return null;
		return Math.log(later.msd / earlier.msd) / Math.log(later.time / earlier.time);
	}

	function numericBounds(
		key: string,
		value: number
	): { minimum: number; maximum: number; step: number } {
		const table: Record<string, [number, number, number]> = {
			diffusion: [0, 3, 0.01],
			majorDiffusion: [0.01, 3, 0.01],
			minorDiffusion: [0.01, 3, 0.01],
			driftX: [-3, 3, 0.02],
			driftY: [-3, 3, 0.02],
			restoringRate: [0.05, 4, 0.01],
			equilibriumX: [-5, 5, 0.1],
			equilibriumY: [-5, 5, 0.1],
			mass: [0.05, 5, 0.01],
			drag: [0.05, 6, 0.01],
			thermalEnergy: [0, 4, 0.01],
			mobility: [0.05, 3, 0.01],
			barrierHeight: [0, 8, 0.05],
			propulsionSpeed: [0, 5, 0.02],
			translationalDiffusion: [0, 2, 0.01],
			rotationalDiffusion: [0.01, 4, 0.01],
			duration: [0.5, 12, 0.1],
			startX: [-6, 6, 0.1],
			startY: [-6, 6, 0.1],
			endX: [-6, 6, 0.1],
			endY: [-6, 6, 0.1],
			hurst: [0.05, 0.95, 0.01],
			scale: [0.01, 3, 0.01],
			points: [129, 8193, 128],
			initialValue: [0.01, 8, 0.01],
			growthRate: [-1, 1, 0.01],
			volatility: [0, 1.5, 0.01],
			stability: [1.05, 1.95, 0.01],
			wallX: [-5, 5, 0.1],
			startDistance: [0.05, 6, 0.05],
			stepLength: [0.01, 2, 0.01],
			timePerStep: [0.0001, 1, 0.0001],
			coarseGraining: [1, 32, 1]
		};
		const selected = table[key];
		return selected
			? { minimum: selected[0], maximum: selected[1], step: selected[2] }
			: {
					minimum: Math.min(-10, value * 0.1),
					maximum: Math.max(10, value * 3),
					step: Math.abs(value) < 1 ? 0.01 : 0.1
				};
	}

	function firstPassageHorizonLimit(): number {
		const maximumSteps = 1_000_000;
		const maximumParticleSteps = 250_000_000;
		const count = Math.max(1, Math.round(particleCount));
		return Math.max(
			0.25,
			Math.min(60, maximumSteps * timestep, (maximumParticleSteps * timestep) / count)
		);
	}

	function effectiveFirstPassageMaxTime(): number {
		return boundedNumber(
			firstPassageMaxTime,
			0.25,
			firstPassageHorizonLimit(),
			Math.min(8, firstPassageHorizonLimit())
		);
	}

	function makeControls(): LaboratoryControl[] {
		const modelControls: LaboratoryControl[] = [];
		for (const [index, control] of definition.controls.entries()) {
			if (physicalUnits && processId === 'free-brownian' && control.key === 'diffusion') continue;
			if (control.key === 'trajectories') continue;
			if (control.kind === 'obstacles') {
				modelControls.push({
					key: 'obstaclesEnabled',
					label: 'Circular obstacles',
					help: 'Adds deterministic excluded regions with segment-safe reflection.',
					kind: 'toggle',
					section: 'advanced',
					locked: true,
					resetsSimulation: true
				});
				continue;
			}
			if (control.kind === 'boolean') {
				modelControls.push({
					key: control.key,
					label: control.label,
					help: definition.whatToWatch,
					kind: 'toggle',
					section: index < 3 ? 'physical' : 'advanced',
					locked: true,
					resetsSimulation: true
				});
				continue;
			}
			if (control.kind === 'select') {
				modelControls.push({
					key: control.key,
					label: control.label,
					help: definition.plainInterpretation,
					kind: 'select',
					options: (control.options ?? []).map((option) => ({
						label: option.label,
						value: String(option.value)
					})),
					section: index < 3 ? 'physical' : 'advanced',
					locked: true,
					resetsSimulation: true
				});
				continue;
			}
			const value = Number(parameters[control.key] ?? 0);
			const bounds = numericBounds(control.key, value);
			modelControls.push({
				key: control.key,
				label: control.label,
				help: definition.whatToWatch,
				kind: control.kind === 'angle' ? 'range' : index < 3 ? 'range' : 'number',
				minimum: control.minimum ?? bounds.minimum,
				maximum: control.maximum ?? bounds.maximum,
				step: control.step ?? bounds.step,
				unit: control.unit,
				section: index < 3 ? 'physical' : 'advanced',
				locked: true,
				resetsSimulation: true
			});
		}
		if (physicalUnits && processId === 'free-brownian') {
			modelControls.unshift(
				{
					key: 'physicalTemperature',
					label: 'Water temperature',
					help: 'Absolute temperature used in the Stokes–Einstein relation.',
					kind: 'range',
					minimum: 273.15,
					maximum: 373.15,
					step: 0.5,
					unit: 'K',
					section: 'physical',
					locked: true,
					resetsSimulation: true
				},
				{
					key: 'physicalViscosity',
					label: 'Dynamic viscosity',
					help: 'Displayed in millipascal-seconds and converted to pascal-seconds internally.',
					kind: 'range',
					minimum: 0.2,
					maximum: 5,
					step: 0.01,
					unit: 'mPa·s',
					section: 'physical',
					locked: true,
					resetsSimulation: true
				},
				{
					key: 'physicalRadius',
					label: 'Particle radius',
					help: 'A spherical bead radius, converted from micrometres to metres internally.',
					kind: 'range',
					minimum: 0.05,
					maximum: 2,
					step: 0.01,
					unit: 'µm',
					section: 'physical',
					locked: true,
					resetsSimulation: true
				}
			);
		}
		if (processId === 'first-passage') {
			modelControls.push({
				key: 'firstPassageMaxTime',
				label: 'Observation horizon',
				help: 'Worker ensemble maximum time. Histories still alive here are reported as right-censored.',
				kind: 'number',
				minimum: 0.25,
				maximum: firstPassageHorizonLimit(),
				step: 0.25,
				unit: 's',
				section: 'physical',
				resetsSimulation: true
			});
		}
		return [
			...modelControls,
			{
				key: 'particleCount',
				label: processId === 'fractional-brownian' ? 'Trajectories' : 'Particles',
				help: 'Independent histories reveal ensemble statistics. Large values use bounded rendering.',
				kind: 'number',
				minimum: 1,
				maximum: processId === 'fractional-brownian' ? 256 : 20000,
				step: 1,
				section: 'physical',
				locked: true,
				resetsSimulation: true
			},
			{
				key: 'speed',
				label: 'Simulation speed',
				help: 'Changes wall-clock playback, never the physical timestep.',
				kind: 'range',
				minimum: 0.25,
				maximum: 4,
				step: 0.25,
				section: 'physical'
			},
			{
				key: 'timestep',
				label: 'Numerical timestep',
				help: 'A fixed physics increment independent of display refresh.',
				kind: 'number',
				minimum: 0.0001,
				maximum: 0.05,
				step: 0.0001,
				unit: 's',
				section: 'advanced',
				locked: true,
				resetsSimulation: true
			},
			{
				key: 'boundaryMode',
				label: 'Boundary',
				help: 'Periodic MSD uses unwrapped coordinates; reflecting walls handle overshoot.',
				kind: 'select',
				options: [
					{ value: 'unbounded', label: 'Unbounded' },
					{ value: 'reflecting', label: 'Reflecting box' },
					{ value: 'periodic', label: 'Periodic box' },
					{ value: 'absorbing', label: 'Absorbing box' }
				],
				section: 'advanced',
				locked: true,
				resetsSimulation: true
			},
			{
				key: 'trailLength',
				label: 'Trail samples',
				help: 'A bounded ring buffer limits memory use.',
				kind: 'number',
				minimum: 60,
				maximum: 2400,
				step: 60,
				section: 'advanced',
				resetsSimulation: true
			},
			{
				key: 'trailOpacity',
				label: 'Trail persistence',
				help: 'Purely visual; it cannot perturb the random streams.',
				kind: 'range',
				minimum: 0,
				maximum: 1,
				step: 0.05,
				section: 'appearance'
			},
			{
				key: 'particleSize',
				label: 'Particle size',
				help: 'Screen-space radius only.',
				kind: 'range',
				minimum: 1.5,
				maximum: 8,
				step: 0.25,
				section: 'appearance'
			},
			{
				key: 'showDensity',
				label: 'Measured density',
				help: 'A grid estimated from the current ensemble.',
				kind: 'toggle',
				section: 'appearance'
			},
			{
				key: 'showTheory',
				label: 'Theoretical overlay',
				help: 'Dashed predictions use the current physical parameters.',
				kind: 'toggle',
				section: 'appearance'
			},
			{
				key: 'showPaths',
				label: 'Trajectory paths',
				help: 'Fading samples from the bounded history.',
				kind: 'toggle',
				section: 'appearance'
			},
			{
				key: 'showParticles',
				label: 'Particle marks',
				help: 'Hide marks while retaining measured data.',
				kind: 'toggle',
				section: 'appearance'
			},
			{
				key: 'cameraX',
				label: 'Camera centre x',
				help: 'Equivalent keyboard control for stage dragging.',
				kind: 'number',
				minimum: -100,
				maximum: 100,
				step: 0.1,
				section: 'camera'
			},
			{
				key: 'cameraY',
				label: 'Camera centre y',
				help: 'Equivalent keyboard control for stage dragging.',
				kind: 'number',
				minimum: -100,
				maximum: 100,
				step: 0.1,
				section: 'camera'
			},
			{
				key: 'cameraZoom',
				label: 'Camera zoom',
				help: 'Use plus/minus on the focused stage as a shortcut.',
				kind: 'range',
				minimum: 0.25,
				maximum: 12,
				step: 0.05,
				section: 'camera'
			},
			{
				key: 'autoFit',
				label: 'Auto-fit camera',
				help: 'Tracks the growing measured and theoretical cloud.',
				kind: 'toggle',
				section: 'camera'
			}
		];
	}

	function makeControlValues(): Record<string, ControlValue> {
		const values: Record<string, ControlValue> = {};
		for (const [key, value] of Object.entries(parameters)) {
			if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
				values[key] = value;
		}
		return {
			...values,
			physicalTemperature: Number(parameters.temperatureKelvin ?? 298.15),
			physicalViscosity: Number(parameters.viscosityPas ?? 0.00089) * 1000,
			physicalRadius: Number(parameters.radiusMetres ?? 0.5e-6) * 1e6,
			firstPassageMaxTime: effectiveFirstPassageMaxTime(),
			obstaclesEnabled: obstacleOverlays.length > 0,
			particleCount:
				processId === 'fractional-brownian'
					? Number(parameters.trajectories ?? particleCount)
					: particleCount,
			speed,
			timestep,
			boundaryMode: boundary.mode,
			trailLength,
			trailOpacity,
			particleSize,
			showDensity,
			showTheory,
			showPaths,
			showParticles,
			cameraX: camera.centreX,
			cameraY: camera.centreY,
			cameraZoom: camera.zoom,
			autoFit: camera.autoFit
		};
	}

	function makeAvailableDiagnostics(): DiagnosticId[] {
		const compatible = definition.compatibleDiagnostics;
		const result: DiagnosticId[] = ['trajectory'];
		if (compatible.some((item) => item.includes('distribution') || item === 'density'))
			result.push('distribution');
		if (
			compatible.some((item) => item.includes('mean-square') || item.includes('exponent')) &&
			theoryPrediction?.finiteMeanSquareDisplacement !== false
		)
			result.push('msd');
		if (compatible.some((item) => item.includes('autocorrelation'))) result.push('autocorrelation');
		if (compatible.includes('phase-space')) result.push('phase-space');
		if (compatible.some((item) => item.includes('first-passage') || item.includes('arrival-time')))
			result.push('first-passage');
		return result;
	}

	function makeMeasuredSeries(): ChartPoint[] {
		if (activeDiagnostic === 'first-passage' && firstPassageResult)
			return Array.from(firstPassageResult.times, (time, index) => ({
				x: time,
				y: firstPassageResult?.empiricalSurvival[index] ?? 0
			}));
		if (activeDiagnostic === 'autocorrelation') return autocorrelationSeries(false);
		if (activeDiagnostic === 'trajectory') {
			const trail = displayTrajectories.particleTrail(0);
			return Array.from(trail.times, (time, index) => ({ x: time, y: trail.x[index] }));
		}
		return metricHistory
			.filter((point) => point.msd !== null)
			.map((point) => ({
				x: point.time,
				y: activeDiagnostic === 'msd' ? (point.msd ?? 0) : point.survival
			}));
	}

	function makeTheorySeries(): ChartPoint[] {
		if (!showTheory) return [];
		if (activeDiagnostic === 'first-passage' && firstPassageResult)
			return Array.from(firstPassageResult.times, (time, index) => ({
				x: time,
				y: firstPassageResult?.analyticalSurvival[index] ?? 0
			}));
		if (activeDiagnostic === 'autocorrelation') return autocorrelationSeries(true);
		if (activeDiagnostic === 'msd')
			return metricHistory
				.filter((point) => point.theoreticalMsd !== null)
				.map((point) => ({ x: point.time, y: point.theoreticalMsd ?? 0 }));
		return [];
	}

	function makeScatter(): ChartPoint[] {
		if (activeDiagnostic !== 'phase-space') return [];
		const output: ChartPoint[] = [];
		const stride = Math.max(1, Math.ceil(displayState.count / 600));
		for (let index = 0; index < displayState.count; index += stride) {
			if (displayState.alive[index])
				output.push({ x: displayState.x[index], y: displayState.velocityX[index] });
		}
		return output;
	}

	function makeHistogram(): HistogramBin[] {
		if (activeDiagnostic !== 'distribution') return [];
		if (processId === 'first-passage') return makeFirstPassageArrivalHistogram();
		const values = processId === 'levy-flight' ? makeLevyIncrementSamples() : livingXPositions();
		if (values.length === 0) return [];
		values.sort((a, b) => a - b);
		const robustLevyBounds = processId === 'levy-flight' && values.length >= 8;
		const minimum = robustLevyBounds ? sortedQuantile(values, 0.01) : values[0];
		const maximum = robustLevyBounds ? sortedQuantile(values, 0.99) : values[values.length - 1];
		const padding = robustLevyBounds ? 0 : Math.max(0.1, (maximum - minimum) * 0.04);
		const degeneratePadding = maximum === minimum ? Math.max(0.1, Math.abs(minimum) * 0.04) : 0;
		const lower = minimum - padding - degeneratePadding;
		const upper = maximum + padding + degeneratePadding;
		const binWidth = (upper - lower) / 28;
		const counts = new Uint32Array(28);
		for (const value of values)
			counts[Math.min(27, Math.max(0, Math.floor((value - lower) / binWidth)))] += 1;
		const bins: HistogramBin[] = Array.from(counts, (count, index) => {
			const start = lower + index * binWidth;
			const end = start + binWidth;
			const centre = (start + end) / 2;
			const expected = theoreticalBinCount(centre, binWidth, values.length);
			return {
				minimum: start,
				maximum: end,
				count,
				...(expected === null ? {} : { theoreticalDensity: expected })
			};
		});
		return processId === 'potential-diffusion'
			? addNormalizedBoltzmannOverlay(bins, values.length)
			: bins;
	}

	function livingXPositions(): number[] {
		const values: number[] = [];
		for (let index = 0; index < displayState.count; index += 1)
			if (displayState.alive[index]) values.push(displayState.x[index]);
		return values;
	}

	function makeLevyIncrementSamples(): number[] {
		const values: number[] = [];
		const tracked = Math.min(16, displayTrajectories.trackedParticleCount);
		for (let particle = 0; particle < tracked; particle += 1) {
			const trail = displayTrajectories.particleTrail(particle);
			const firstSample = Math.max(1, trail.x.length - 256);
			for (let sample = firstSample; sample < trail.x.length; sample += 1) {
				if (!trail.alive[sample - 1] || !trail.alive[sample]) continue;
				const increment = trail.x[sample] - trail.x[sample - 1];
				if (Number.isFinite(increment)) values.push(increment);
			}
		}
		return values;
	}

	function makeFirstPassageArrivalHistogram(): HistogramBin[] {
		const result = firstPassageResult;
		if (!result) return [];
		const binCount = 28;
		const lower = 0;
		const upper = result.options.maxTime;
		const binWidth = upper / binCount;
		const counts = new Uint32Array(binCount);
		for (const arrival of result.firstPassageTimes) {
			if (!Number.isFinite(arrival)) continue;
			counts[Math.min(binCount - 1, Math.max(0, Math.floor(arrival / binWidth)))] += 1;
		}
		const theoryParameters = parameters as unknown as FirstPassageParameters;
		return Array.from(counts, (count, index) => {
			const start = lower + index * binWidth;
			const end = start + binWidth;
			const centre = (start + end) / 2;
			const expected = showTheory
				? firstPassageDensity(theoryParameters, centre) * binWidth * result.options.particleCount
				: null;
			return {
				minimum: start,
				maximum: end,
				count,
				...(expected === null ? {} : { theoreticalDensity: expected })
			};
		});
	}

	function addNormalizedBoltzmannOverlay(
		bins: readonly HistogramBin[],
		count: number
	): HistogramBin[] {
		if (!showTheory || bins.length === 0) return [...bins];
		const potentialParameters = parameters as unknown as PotentialDiffusionParameters;
		const y = potentialParameters.centerY;
		let weights = bins.map((bin) =>
			boltzmannWeight(potentialParameters, (bin.minimum + bin.maximum) / 2, y)
		);
		let normalization = weights.reduce(
			(sum, weight) => sum + (Number.isFinite(weight) ? weight : 0),
			0
		);

		if (!Number.isFinite(normalization) || normalization <= 0) {
			const energies = bins.map(
				(bin) =>
					potentialAndGradient(potentialParameters, (bin.minimum + bin.maximum) / 2, y).potential
			);
			const minimumEnergy = Math.min(...energies);
			weights = energies.map((energy) =>
				potentialParameters.thermalEnergy > 0
					? Math.exp(-(energy - minimumEnergy) / potentialParameters.thermalEnergy)
					: Math.abs(energy - minimumEnergy) <= 1e-9
						? 1
						: 0
			);
			normalization = weights.reduce((sum, weight) => sum + weight, 0);
		}

		if (!Number.isFinite(normalization) || normalization <= 0) return [...bins];
		return bins.map((bin, index) => ({
			...bin,
			theoreticalDensity: (count * weights[index]) / normalization
		}));
	}

	function sortedQuantile(values: readonly number[], probability: number): number {
		if (values.length === 0) return Number.NaN;
		const position = Math.max(0, Math.min(1, probability)) * (values.length - 1);
		const lowerIndex = Math.floor(position);
		const upperIndex = Math.ceil(position);
		const fraction = position - lowerIndex;
		return values[lowerIndex] * (1 - fraction) + values[upperIndex] * fraction;
	}

	function makeLevyDisplacementStatistics(): LevyDisplacementStatistics | null {
		if (processId !== 'levy-flight') return null;
		const radial: number[] = [];
		const incrementSamples = makeLevyIncrementSamples();
		for (let index = 0; index < displayState.count; index += 1) {
			if (!displayState.alive[index]) continue;
			const deltaX = displayState.unwrappedX[index] - displayState.originUnwrappedX[index];
			const deltaY = displayState.unwrappedY[index] - displayState.originUnwrappedY[index];
			radial.push(Math.hypot(deltaX, deltaY));
		}
		if (radial.length === 0) return null;
		radial.sort((a, b) => a - b);
		incrementSamples.sort((a, b) => a - b);
		const firstQuartile = sortedQuantile(radial, 0.25);
		const thirdQuartile = sortedQuantile(radial, 0.75);
		const lowerBound = sortedQuantile(incrementSamples, 0.01);
		const upperBound = sortedQuantile(incrementSamples, 0.99);
		return {
			firstQuartile,
			median: sortedQuantile(radial, 0.5),
			thirdQuartile,
			interquartileRange: thirdQuartile - firstQuartile,
			clippedCount: incrementSamples.filter((value) => value < lowerBound || value > upperBound)
				.length,
			sampleCount: incrementSamples.length
		};
	}

	function theoreticalBinCount(x: number, width: number, count: number): number | null {
		if (!showTheory || metrics.simulationTime <= 0) return null;
		if (processId === 'geometric-brownian') {
			const initial = Number(parameters.initialValue);
			const growth = Number(parameters.growthRate);
			const volatility = Number(parameters.volatility);
			if (x <= 0 || volatility <= 0) return 0;
			const sigma = volatility * Math.sqrt(metrics.simulationTime);
			const meanLog = Math.log(initial) + (growth - volatility ** 2 / 2) * metrics.simulationTime;
			const density =
				Math.exp(-((Math.log(x) - meanLog) ** 2) / (2 * sigma ** 2)) /
				(x * sigma * Math.sqrt(2 * Math.PI));
			return density * width * count;
		}
		if (
			!theoryPrediction?.variance ||
			theoryPrediction.variance.x <= 0 ||
			processId === 'levy-flight'
		)
			return null;
		const mean = theoryPrediction.mean?.x ?? 0;
		const variance = theoryPrediction.variance.x;
		const density =
			Math.exp(-((x - mean) ** 2) / (2 * variance)) / Math.sqrt(2 * Math.PI * variance);
		return density * width * count;
	}

	function autocorrelationSeries(theoretical: boolean): ChartPoint[] {
		const trail = displayTrajectories.particleTrail(0);
		if (trail.x.length < 8) return [];
		const increments = new Float64Array(trail.x.length - 1);
		for (let index = 0; index < increments.length; index += 1)
			increments[index] = trail.x[index + 1] - trail.x[index];
		const variance = increments.reduce((sum, value) => sum + value * value, 0) / increments.length;
		const output: ChartPoint[] = [];
		const maxLag = Math.min(48, Math.floor(increments.length / 3));
		for (let lag = 0; lag <= maxLag; lag += 1) {
			if (theoretical) {
				let value = lag === 0 ? 1 : 0;
				if (processId === 'fractional-brownian') {
					const h = Number(parameters.hurst);
					value = 0.5 * ((lag + 1) ** (2 * h) - 2 * lag ** (2 * h) + Math.abs(lag - 1) ** (2 * h));
				} else if (processId === 'active-brownian')
					value = Math.exp(-Number(parameters.rotationalDiffusion) * lag * timestep);
				output.push({ x: lag, y: value });
			} else {
				let covariance = 0;
				for (let index = 0; index < increments.length - lag; index += 1)
					covariance += increments[index] * increments[index + lag];
				output.push({
					x: lag,
					y: variance > 0 ? covariance / ((increments.length - lag) * variance) : 0
				});
			}
		}
		return output;
	}

	function makeNumericalWarning(): string {
		try {
			const issues = definition.validate(parameters, timestep);
			return issues
				.map((issue) => `${issue.severity === 'error' ? 'Unsafe' : 'Caution'}: ${issue.message}`)
				.join(' ');
		} catch (error) {
			return error instanceof Error ? error.message : 'The selected parameters are invalid.';
		}
	}

	function formatStatistic(value: number): string {
		if (!Number.isFinite(value)) return '—';
		if (Math.abs(value) >= 10_000 || (value !== 0 && Math.abs(value) < 0.001))
			return value.toExponential(2);
		return value.toLocaleString('en-IN', { maximumFractionDigits: 4 });
	}

	function chartLabels(): { x: string; y: string; summary: string; logarithmic: boolean } {
		if (activeDiagnostic === 'distribution' && processId === 'first-passage')
			return {
				x: 'arrival time t',
				y: 'arrivals per bin',
				summary: `Bars contain finite first-arrival times through T = ${firstPassageResult?.options.maxTime.toFixed(2) ?? effectiveFirstPassageMaxTime().toFixed(2)} s; the dashed curve is the unconditional analytical arrival density times the full ensemble. Survivors are right-censored, not placed in a final bin.`,
				logarithmic: false
			};
		if (activeDiagnostic === 'distribution' && processId === 'potential-diffusion') {
			const landscape = String(parameters.landscape);
			return {
				x: 'x position',
				y: 'particle count',
				summary:
					landscape === 'tilted-periodic'
						? 'Bars are measured counts. Dashed is the normalized exp[-U/(kBT)] reference over the plotted window; the tilt drives a current, so this reference is not a stationary law.'
						: landscape === 'periodic'
							? 'Bars are measured counts. Dashed is the stationary Boltzmann profile p_eq ∝ exp[-U/(kBT)], normalized over the plotted periodic window rather than the unbounded line.'
							: 'Bars are measured counts. Dashed is the stationary Boltzmann distribution p_eq = Z^-1 exp[-U/(kBT)], numerically normalized over the plotted x range.',
				logarithmic: false
			};
		}
		if (activeDiagnostic === 'distribution' && processId === 'levy-flight')
			return {
				x: 'tracked Δx increment',
				y: 'increment count',
				summary: levyStatistics
					? `Heavy-tail view uses the latest stored Δx increments from up to 16 tracked histories and their 1st–99th percentile range; ${levyStatistics.clippedCount.toLocaleString('en-IN')} of ${levyStatistics.sampleCount.toLocaleString('en-IN')} increments outside it are accumulated in the two edge bins.`
					: 'Heavy-tail view uses tracked Δx increments and robust percentile bounds; extreme values are accumulated in the edge bins.',
				logarithmic: false
			};
		if (activeDiagnostic === 'distribution')
			return {
				x: 'x position',
				y: 'particle count',
				summary:
					'Bars are measured ensemble counts; the dashed curve is the parameter-matched analytical prediction when available.',
				logarithmic: false
			};
		if (activeDiagnostic === 'msd')
			return {
				x: 'time t',
				y: 'MSD',
				summary:
					theoryPrediction?.finiteMeanSquareDisplacement === false
						? 'This process has no ordinary finite theoretical MSD; use robust displacement statistics instead.'
						: 'Solid is measured ensemble mean-square displacement; dashed is the model prediction.',
				logarithmic: true
			};
		if (activeDiagnostic === 'autocorrelation')
			return {
				x: 'lag',
				y: 'correlation',
				summary:
					'Measured increment correlation is solid. A dashed correlation law appears when the model supplies one.',
				logarithmic: false
			};
		if (activeDiagnostic === 'phase-space')
			return {
				x: 'position x',
				y: 'velocity vx',
				summary:
					'Each dot is a measured particle state; velocity is meaningful here because this model retains inertia.',
				logarithmic: false
			};
		if (activeDiagnostic === 'first-passage')
			return {
				x: 'time t',
				y: 'survival fraction',
				summary:
					'Solid is the measured surviving fraction; dashed is the half-line analytical survival probability.',
				logarithmic: false
			};
		return {
			x: 'time t',
			y: 'x position',
			summary:
				'The stage is the spatial trajectory view; this chart reports the measured x-coordinate of the first tracked history.',
			logarithmic: false
		};
	}

	function currentFrameState(): 'disposed' | 'hidden' | 'offscreen' | 'running' | 'paused' {
		if (disposed) return 'disposed';
		if (typeof document !== 'undefined' && document.hidden) return 'hidden';
		if (offscreen) return 'offscreen';
		return playing ? 'running' : 'paused';
	}

	function cancelLoop(): void {
		if (frameId) cancelAnimationFrame(frameId);
		frameId = 0;
		previousTimestamp = 0;
	}

	function schedule(): void {
		if (frameId || !playing || offscreen || document.hidden || disposed) return;
		if (processId === 'fractional-brownian' && !fractionalResult) return;
		frameId = requestAnimationFrame(frame);
	}

	function frame(timestamp: number): void {
		frameId = 0;
		if (!playing || offscreen || document.hidden || disposed) return;
		if (previousTimestamp === 0) previousTimestamp = timestamp;
		const elapsed = Math.max(0, Math.min(0.2, (timestamp - previousTimestamp) / 1000));
		previousTimestamp = timestamp;
		const stepStarted = performance.now();
		if (processId === 'fractional-brownian') {
			advanceFractional(elapsed * speed);
			if (fractionalResult) {
				const fractionalTimestep = fractionalResult.duration / (fractionalResult.pointCount - 1);
				lastInterpolationAlpha = fractionalAccumulator / fractionalTimestep;
			}
		} else {
			const result = simulation.advanceFrame(elapsed);
			lastInterpolationAlpha = result.interpolationAlpha;
			if (result.droppedWallTime > 0.01)
				status =
					'Playback was capped after a slow frame; the fixed numerical timestep was not changed.';
		}
		lastStepMilliseconds = performance.now() - stepStarted;
		renderFrameCount += 1;
		publish(timestamp);
		schedule();
	}

	function advanceFractional(elapsed: number, singleStep = false): void {
		if (!fractionalResult) return;
		const pointTimestep = fractionalResult.duration / (fractionalResult.pointCount - 1);
		fractionalAccumulator += singleStep ? pointTimestep : elapsed;
		let steps = 0;
		while (
			fractionalAccumulator >= pointTimestep &&
			fractionalIndex < fractionalResult.pointCount - 1 &&
			steps < 180
		) {
			fractionalAccumulator -= pointTimestep;
			fractionalIndex += 1;
			steps += 1;
			loadFractionalPoint(fractionalIndex);
		}
		if (fractionalIndex >= fractionalResult.pointCount - 1) {
			playing = false;
			status =
				'The pre-generated fractional path reached its finite duration. Reset replays it exactly.';
		}
	}

	function loadFractionalPoint(point: number): void {
		if (!fractionalResult) return;
		for (let particle = 0; particle < fractionalResult.trajectoryCount; particle += 1) {
			const source = particle * fractionalResult.pointCount + point;
			fractionalState.x[particle] = fractionalResult.x[source];
			fractionalState.y[particle] = fractionalResult.y[source];
			fractionalState.unwrappedX[particle] = fractionalResult.x[source];
			fractionalState.unwrappedY[particle] = fractionalResult.y[source];
		}
		const time = fractionalResult.times[point];
		fractionalTrajectories.push(time, fractionalState);
		metrics = calculateSimulationMetrics(fractionalState, { mode: 'unbounded' }, time);
		revision += 1;
	}

	function publish(timestamp = performance.now(), announce = false): void {
		if (!announce && timestamp - lastPublish < 100) return;
		if (processId !== 'fractional-brownian') metrics = simulation.metrics();
		const prediction = predictTheory();
		metricHistory = [
			...metricHistory,
			{
				time: metrics.simulationTime,
				msd: metrics.meanSquareDisplacement,
				theoreticalMsd:
					prediction?.finiteMeanSquareDisplacement === false
						? null
						: (prediction?.meanSquareDisplacement ?? null),
				survival: metrics.survivalFraction,
				theoreticalSurvival: prediction?.survivalProbability ?? null
			}
		].slice(-600);
		revision += 1;
		lastPublish = timestamp;
		if (announce || timestamp - lastAnnouncement > 1400) lastAnnouncement = timestamp;
	}

	function togglePlayback(): void {
		playing = !playing;
		status = playing ? 'Fixed-timestep playback is running.' : 'Simulation paused for inspection.';
		if (playing) schedule();
		else cancelLoop();
		publish(performance.now(), true);
	}

	function singleStep(): void {
		playing = false;
		cancelLoop();
		if (processId === 'fractional-brownian') {
			if (!fractionalResult)
				status = 'The fractional Worker is still preparing this deterministic path.';
			else advanceFractional(0, true);
		} else simulation.step(1);
		status = `Advanced exactly one ${processId === 'fractional-brownian' && fractionalResult ? (fractionalResult.duration / (fractionalResult.pointCount - 1)).toPrecision(4) : timestep.toPrecision(4)}-second physics step.`;
		publish(performance.now(), true);
	}

	function resetRun(message = 'Reset with the same seed.'): void {
		cancelLoop();
		fractionalClient?.cancel();
		ensembleClient?.cancel();
		workerState = 'idle';
		workerKind = 'none';
		workerProgress = 0;
		fractionalResult = null;
		firstPassageResult = null;
		fractionalIndex = 0;
		fractionalAccumulator = 0;
		metricHistory = [];
		lastPublish = 0;
		lastAnnouncement = 0;
		renderFrameCount = 0;
		lastStepMilliseconds = 0;
		lastRenderMilliseconds = 0;
		lastInterpolationAlpha = 0;
		if (processId === 'fractional-brownian') prepareFractional();
		else {
			simulation = createRuntimeSimulation(processId);
			metrics = simulation.metrics();
			if (processId === 'first-passage') prepareFirstPassage();
		}
		revision += 1;
		status = message;
		queueUrlUpdate(false);
		if (playing) schedule();
	}

	function prepareFractional(): void {
		const count = Math.round(boundedNumber(parameters.trajectories ?? particleCount, 1, 256, 1));
		particleCount = count;
		fractionalState = new ParticleState(count);
		fractionalState.alive.fill(1);
		fractionalTrajectories = new TrajectoryBuffer(
			count,
			Math.min(trailLength, 2400),
			Math.min(count, 96)
		);
		fractionalTrajectories.push(0, fractionalState);
		metrics = calculateSimulationMetrics(fractionalState, { mode: 'unbounded' }, 0);
		if (!fractionalClient) {
			fractionalClient = createFractionalWorkerClient();
			unsubscribeFractional = fractionalClient.subscribe(handleWorkerResponse);
		}
		workerKind = 'fractional';
		workerState = 'working';
		workerProgress = 0;
		fractionalClient.generateFractional({
			seed,
			hurst: Number(parameters.hurst),
			scale: Number(parameters.scale),
			duration: Number(parameters.duration),
			pointCount: Math.round(Number(parameters.points)),
			trajectoryCount: count
		});
	}

	function prepareFirstPassage(): void {
		if (!ensembleClient) {
			ensembleClient = createEnsembleWorkerClient();
			unsubscribeEnsemble = ensembleClient.subscribe(handleWorkerResponse);
		}
		workerKind = 'first-passage';
		workerState = 'working';
		workerProgress = 0;
		firstPassageMaxTime = effectiveFirstPassageMaxTime();
		ensembleClient.runFirstPassage({
			seed,
			particleCount: Math.max(1, Math.min(20000, particleCount)),
			startDistance: Number(parameters.startDistance),
			diffusion: Number(parameters.diffusion),
			timestep,
			maxTime: firstPassageMaxTime,
			historySampleEverySteps: Math.max(1, Math.round(0.025 / timestep)),
			bridgeCorrection: Boolean(parameters.bridgeCorrection)
		});
	}

	function handleWorkerResponse(response: AdvancedWorkerResponse): void {
		if (response.type === 'PROGRESS') {
			workerProgress = response.progress;
			workerState = 'working';
			status = `${response.task === 'fractional' ? 'Fractional path' : 'Ensemble'} calculation ${Math.round(response.progress * 100)}% complete.`;
		} else if (response.type === 'FRACTIONAL_RESULT') {
			fractionalResult = response.result;
			workerState = 'complete';
			workerProgress = 1;
			loadFractionalPoint(0);
			status = `Davies–Harte path ready${fractionalClient?.usesWorker() ? ' in a Worker' : ' through the asynchronous fallback'}.`;
			if (playing) schedule();
		} else if (response.type === 'FIRST_PASSAGE_RESULT') {
			firstPassageResult = response.result;
			workerState = 'complete';
			workerProgress = 1;
			status = `First-passage ensemble ready; ${response.result.absorbedCount.toLocaleString('en-IN')} arrivals measured.`;
		} else if (response.type === 'ERROR') {
			workerState = 'error';
			status = `Numerical calculation stopped visibly: ${response.message}`;
		}
	}

	function selectProcess(id: string): void {
		if (!PROCESS_IDS.includes(id as ProcessId) || id === processId) return;
		if (processId === 'fractional-brownian') {
			unsubscribeFractional?.();
			unsubscribeFractional = null;
			fractionalClient?.dispose();
			fractionalClient = null;
		}
		if (processId === 'first-passage') {
			unsubscribeEnsemble?.();
			unsubscribeEnsemble = null;
			ensembleClient?.dispose();
			ensembleClient = null;
		}
		processId = id as ProcessId;
		physicalUnits = false;
		parameters = cloneParameters(processId);
		initialCondition = { x: 0, y: 0, spread: 0 };
		boundary = { mode: 'unbounded' };
		selectedPreset = MODEL_PRESETS[processId][0]?.id ?? '';
		selectedStory = '';
		activeDiagnostic = 'trajectory';
		camera = { centreX: 0, centreY: 0, zoom: 1, autoFit: true };
		if (processId === 'first-passage') particleCount = Math.max(1000, particleCount);
		if (processId === 'fractional-brownian') particleCount = Number(parameters.trajectories ?? 1);
		resetRun(
			`${definitionFor(processId).label} loaded with an independent labelled random stream.`
		);
	}

	function applyModelPreset(id: string, pushHistory = false): void {
		if (processId === 'free-brownian' && id === 'colloidal-bead-water') {
			loadPhysicalPreset();
			if (pushHistory) writeUrl(true);
			return;
		}
		const preset = MODEL_PRESETS[processId].find((candidate) => candidate.id === id) as
			| {
					id: string;
					parameters: AnyParameters;
					initialCondition?: InitialCondition;
					boundary?: BoundaryCondition;
					particleCount?: number;
					timestep?: number;
					speed?: number;
			  }
			| undefined;
		if (!preset) return;
		physicalUnits = false;
		selectedPreset = preset.id;
		parameters = JSON.parse(JSON.stringify(preset.parameters)) as AnyParameters;
		initialCondition = preset.initialCondition
			? { ...preset.initialCondition }
			: { x: 0, y: 0, spread: 0 };
		boundary = preset.boundary ? cloneBoundary(preset.boundary) : { mode: 'unbounded' };
		if (preset.particleCount !== undefined) particleCount = preset.particleCount;
		else if (processId === 'fractional-brownian')
			particleCount = Number(parameters.trajectories ?? 1);
		if (preset.timestep !== undefined) timestep = preset.timestep;
		if (preset.speed !== undefined) speed = preset.speed;
		resetRun(`Preset ${preset.id} loaded. ${definition.whatToWatch}`);
		if (pushHistory) writeUrl(true);
	}

	function loadStory(id: string): void {
		const story = STORY_PRESETS.find((candidate) => candidate.id === id);
		if (!story) return;
		if (processId === 'fractional-brownian' && story.processId !== processId) {
			unsubscribeFractional?.();
			unsubscribeFractional = null;
			fractionalClient?.dispose();
			fractionalClient = null;
		}
		if (processId === 'first-passage' && story.processId !== processId) {
			unsubscribeEnsemble?.();
			unsubscribeEnsemble = null;
			ensembleClient?.dispose();
			ensembleClient = null;
		}
		processId = story.processId as ProcessId;
		seed = story.seed;
		seedDraft = seed;
		parameters = cloneParameters(processId);
		selectedStory = story.id;
		selectedPreset = story.modelPresetId;
		particleCount =
			story.id === 'thousand-histories'
				? 1000
				: processId === 'first-passage'
					? 4000
					: Number(parameters.trajectories ?? 1);
		if (story.modelPresetId === 'colloidal-bead-water') {
			loadPhysicalPreset();
			writeUrl(true);
		} else applyModelPreset(story.modelPresetId, true);
	}

	function changeControl(key: string, value: ControlValue, resetsSimulation: boolean): void {
		const changesPhysicalPreset =
			key === 'physicalTemperature' || key === 'physicalViscosity' || key === 'physicalRadius';
		if (changesPhysicalPreset) {
			const temperatureKelvin =
				key === 'physicalTemperature' ? Number(value) : Number(parameters.temperatureKelvin);
			const viscosityPas =
				key === 'physicalViscosity' ? Number(value) * 1e-3 : Number(parameters.viscosityPas);
			const radiusMetres =
				key === 'physicalRadius' ? Number(value) * 1e-6 : Number(parameters.radiusMetres);
			parameters = {
				...parameters,
				temperatureKelvin,
				viscosityPas,
				radiusMetres,
				diffusion: stokesEinsteinDiffusion(temperatureKelvin, viscosityPas, radiusMetres)
			};
		} else if (key === 'firstPassageMaxTime') {
			firstPassageMaxTime = boundedNumber(
				value,
				0.25,
				firstPassageHorizonLimit(),
				firstPassageMaxTime
			);
		} else if (key in parameters || definition.controls.some((control) => control.key === key)) {
			const current = parameters[key];
			const converted =
				typeof current === 'number'
					? Number(value)
					: typeof current === 'boolean'
						? Boolean(value)
						: value;
			parameters = { ...parameters, [key]: converted };
			if (key === 'trajectories') particleCount = Math.round(Number(converted));
		} else if (key === 'obstaclesEnabled') {
			parameters = {
				...parameters,
				obstacles: value
					? [
							{ x: -1.3, y: 0.2, radius: 0.75 },
							{ x: 1.15, y: -0.45, radius: 0.62 }
						]
					: []
			};
		} else if (key === 'particleCount') {
			particleCount = Math.round(
				boundedNumber(value, 1, processId === 'fractional-brownian' ? 256 : 20000, particleCount)
			);
			if (processId === 'fractional-brownian')
				parameters = { ...parameters, trajectories: particleCount };
		} else if (key === 'speed') {
			speed = Number(value);
			simulation.setSpeed(speed);
		} else if (key === 'timestep') timestep = boundedNumber(value, 0.0001, 0.05, timestep);
		else if (key === 'boundaryMode')
			boundary =
				value === 'unbounded'
					? { mode: 'unbounded' }
					: {
							mode: value as 'reflecting' | 'periodic' | 'absorbing',
							bounds: { minX: -6, maxX: 6, minY: -4, maxY: 4 }
						};
		else if (key === 'trailLength') trailLength = Math.round(Number(value));
		else if (key === 'trailOpacity') trailOpacity = Number(value);
		else if (key === 'particleSize') particleSize = Number(value);
		else if (key === 'showDensity') showDensity = Boolean(value);
		else if (key === 'showTheory') showTheory = Boolean(value);
		else if (key === 'showPaths') showPaths = Boolean(value);
		else if (key === 'showParticles') showParticles = Boolean(value);
		else if (key === 'cameraX') camera = { ...camera, centreX: Number(value), autoFit: false };
		else if (key === 'cameraY') camera = { ...camera, centreY: Number(value), autoFit: false };
		else if (key === 'cameraZoom') camera = { ...camera, zoom: Number(value), autoFit: false };
		else if (key === 'autoFit')
			camera = {
				...camera,
				autoFit: Boolean(value),
				...(value ? { centreX: 0, centreY: 0, zoom: 1 } : {})
			};
		if (!changesPhysicalPreset) selectedPreset = '';
		selectedStory = '';
		if (resetsSimulation)
			resetRun(`${key} changed; the run restarted because its physics changed.`);
		else queueUrlUpdate(false);
	}

	function addParticles(): void {
		particleCount = 1000;
		showDensity = true;
		resetRun('Nine hundred and ninety-nine independent histories joined the first particle.');
	}

	function applySeed(): void {
		seed = seedDraft.trim().slice(0, 64) || DEFAULT_SEED;
		seedDraft = seed;
		resetRun(`Seed ${seed} applied; the path sequence is reproducible.`);
	}

	function newSeed(): void {
		const values = new Uint32Array(2);
		crypto.getRandomValues(values);
		seed = `cloud-${values[0].toString(36)}-${values[1].toString(36)}`;
		seedDraft = seed;
		resetRun(`New seed ${seed} generated.`);
	}

	function selectDiagnostic(id: DiagnosticId): void {
		activeDiagnostic = id;
		queueUrlUpdate(false);
	}

	function queueUrlUpdate(push: boolean): void {
		if (!initialized) return;
		window.clearTimeout(urlTimer);
		urlTimer = window.setTimeout(() => writeUrl(push), 220);
	}

	function experimentUrl(): URL {
		const url = encodeBrownianExperimentUrl(window.location.href, {
			version: BROWNIAN_EXPERIMENT_URL_VERSION,
			processId,
			seed,
			timestep,
			particleCount,
			observationHorizon:
				processId === 'first-passage' ? effectiveFirstPassageMaxTime() : undefined,
			parameters,
			initialCondition,
			boundaryMode: boundary.mode,
			boundaryBounds: boundary.mode === 'unbounded' ? undefined : boundary.bounds,
			diagnostic: activeDiagnostic,
			preset: selectedPreset || undefined,
			physicalUnits,
			physicalValues: {
				temperatureKelvin: Number(parameters.temperatureKelvin ?? 298.15),
				viscosityPas: Number(parameters.viscosityPas ?? 0.00089),
				radiusMetres: Number(parameters.radiusMetres ?? 0.5e-6)
			},
			camera
		});
		url.hash = 'brownian-lab-title';
		return url;
	}

	function writeUrl(push: boolean): void {
		const url = experimentUrl();
		if (push) history.pushState(history.state, '', url);
		else history.replaceState(history.state, '', url);
	}

	function restoreUrl(): boolean {
		const restored = decodeBrownianExperimentUrl(window.location.href);
		if (!restored) return false;
		const previousProcess = processId;
		processId = restored.processId;
		parameters = { ...restored.parameters };
		initialCondition = { ...restored.initialCondition };
		seed = restored.seed;
		seedDraft = seed;
		timestep = restored.timestep;
		particleCount = restored.particleCount;
		if (processId === 'first-passage')
			firstPassageMaxTime = restored.observationHorizon ?? firstPassageMaxTime;
		boundary =
			restored.boundaryMode !== 'unbounded'
				? {
						mode: restored.boundaryMode,
						bounds: restored.boundaryBounds
							? { ...restored.boundaryBounds }
							: { minX: -6, maxX: 6, minY: -4, maxY: 4 }
					}
				: { mode: 'unbounded' };
		activeDiagnostic = restored.diagnostic;
		selectedPreset = restored.preset ?? '';
		physicalUnits = restored.physicalUnits && processId === 'free-brownian';
		if (physicalUnits) {
			const { temperatureKelvin, viscosityPas, radiusMetres } = restored.physicalValues;
			parameters = {
				...parameters,
				temperatureKelvin,
				viscosityPas,
				radiusMetres,
				diffusion: stokesEinsteinDiffusion(temperatureKelvin, viscosityPas, radiusMetres)
			};
		}
		camera = { ...restored.camera };
		if (previousProcess === 'fractional-brownian' && processId !== previousProcess) {
			unsubscribeFractional?.();
			unsubscribeFractional = null;
			fractionalClient?.dispose();
			fractionalClient = null;
		}
		if (previousProcess === 'first-passage' && processId !== previousProcess) {
			unsubscribeEnsemble?.();
			unsubscribeEnsemble = null;
			ensembleClient?.dispose();
			ensembleClient = null;
		}
		return true;
	}

	async function copyLink(markdown = false): Promise<void> {
		writeUrl(true);
		const url = experimentUrl().toString();
		await navigator.clipboard.writeText(
			markdown ? `[${definition.label} experiment](${url})` : url
		);
		status = markdown ? 'Markdown experiment link copied.' : 'Versioned experiment URL copied.';
	}

	function resetCleanUrl(): void {
		const url = cleanBrownianExperimentUrl(window.location.href);
		url.hash = 'brownian-lab-title';
		history.pushState(history.state, '', url);
		status = 'Brownian query parameters removed from the address.';
	}

	function download(name: string, blob: Blob): void {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = name;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function experimentRecord(includeTrajectory = true): Record<string, unknown> {
		const sampleCount = Math.min(displayTrajectories.length, 400);
		const stride = Math.max(1, Math.ceil(displayTrajectories.length / Math.max(1, sampleCount)));
		const trajectory: unknown[] = [];
		if (includeTrajectory)
			for (let sampleIndex = 0; sampleIndex < displayTrajectories.length; sampleIndex += stride) {
				const sample = displayTrajectories.sampleAt(sampleIndex);
				if (sample)
					trajectory.push({
						time: sample.time,
						x: Array.from(sample.x),
						y: Array.from(sample.y),
						alive: Array.from(sample.alive)
					});
			}
		return {
			schemaVersion: 1,
			simulationVersion: SIMULATION_VERSION,
			processId,
			seed,
			parameters,
			boundary,
			timestep,
			simulatedDuration: metrics.simulationTime,
			unitSystem: physicalUnits
				? 'micrometres, seconds, kelvin, pascal-seconds; Stokes–Einstein inputs retained in SI'
				: 'dimensionless laboratory units',
			particleCount: displayState.count,
			measurementDefinitions: {
				meanSquareDisplacement:
					'ensemble mean of squared unwrapped displacement from each particle origin',
				variance: 'population central second moment over living particles',
				survival: 'living particles divided by initial particles'
			},
			exportedAt: new Date().toISOString(),
			sampledTrajectory: trajectory
		};
	}

	async function exportPng(): Promise<void> {
		if (!canvas) throw new Error('The stage is not ready for a snapshot.');
		const header = 64;
		const output = document.createElement('canvas');
		output.width = canvas.width;
		output.height = canvas.height + header * Math.min(devicePixelRatio || 1, 2);
		const context = output.getContext('2d');
		if (!context) throw new Error('The browser could not prepare a PNG context.');
		context.fillStyle = '#f4f0e6';
		context.fillRect(0, 0, output.width, output.height);
		context.fillStyle = '#242a32';
		context.font = `${18 * Math.min(devicePixelRatio || 1, 2)}px system-ui`;
		context.fillText(
			`${definition.label} · seed ${seed} · t=${metrics.simulationTime.toFixed(3)} s`,
			18,
			38 * Math.min(devicePixelRatio || 1, 2)
		);
		context.drawImage(canvas, 0, header * Math.min(devicePixelRatio || 1, 2));
		const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
		if (!blob) throw new Error('The browser could not encode the PNG snapshot.');
		download(`brownian-${processId}-${seed}.png`, blob);
	}

	function exportTrajectoryCsv(): void {
		const rows = [
			`# schema_version=1`,
			`# simulation_version=${SIMULATION_VERSION}`,
			`# process_id=${processId}`,
			`# seed=${seed}`,
			'run_id,particle_id,time,x,y,unwrapped_x,unwrapped_y,vx,vy,orientation,alive,first_passage_time'
		];
		const total = displayTrajectories.length * displayTrajectories.trackedParticleCount;
		const sampleStride = Math.max(1, Math.ceil(total / 200000));
		for (
			let sampleIndex = 0;
			sampleIndex < displayTrajectories.length;
			sampleIndex += sampleStride
		) {
			const sample = displayTrajectories.sampleAt(sampleIndex);
			if (!sample) continue;
			for (let particle = 0; particle < sample.x.length; particle += 1)
				rows.push(
					`0,${particle},${sample.time},${sample.x[particle]},${sample.y[particle]},${sample.x[particle]},${sample.y[particle]},,,,,${sample.alive[particle]},`
				);
		}
		download(
			`brownian-${processId}-trajectory.csv`,
			new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
		);
	}

	function exportMetricsCsv(): void {
		const rows = [
			`# process_id=${processId}`,
			`# seed=${seed}`,
			'time,measured_msd,theoretical_msd,measured_survival,theoretical_survival'
		];
		for (const point of metricHistory)
			rows.push(
				[
					point.time,
					point.msd ?? '',
					point.theoreticalMsd ?? '',
					point.survival,
					point.theoreticalSurvival ?? ''
				].join(',')
			);
		download(
			`brownian-${processId}-metrics.csv`,
			new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
		);
	}

	function nanCount(): number {
		let count = 0;
		for (let index = 0; index < displayState.count; index += 1) {
			if (!Number.isFinite(displayState.x[index])) count += 1;
			if (!Number.isFinite(displayState.y[index])) count += 1;
		}
		return count;
	}

	function currentWorldBounds(): string {
		if (boundary.mode !== 'unbounded') {
			return `${boundary.bounds.minX}, ${boundary.bounds.maxX} × ${boundary.bounds.minY}, ${boundary.bounds.maxY}`;
		}
		let extent = 0;
		for (
			let index = 0;
			index < displayState.count;
			index += Math.max(1, Math.floor(displayState.count / 2000))
		) {
			extent = Math.max(extent, Math.abs(displayState.x[index]), Math.abs(displayState.y[index]));
		}
		return `auto-fit ±${Math.max(3, extent).toFixed(3)}`;
	}

	function exportJson(): void {
		download(
			`brownian-${processId}-experiment.json`,
			new Blob([JSON.stringify(experimentRecord(), null, 2)], { type: 'application/json' })
		);
	}

	async function copySummary(): Promise<void> {
		const prediction = theoryPrediction?.meanSquareDisplacement;
		const text = `${definition.label}; seed ${seed}; ${displayState.count} particles; fixed dt ${timestep}; simulated time ${metrics.simulationTime.toFixed(4)}; measured MSD ${metrics.meanSquareDisplacement?.toPrecision(5) ?? 'undefined'}; theoretical MSD ${prediction?.toPrecision(5) ?? 'not finite/not available'}.`;
		await navigator.clipboard.writeText(text);
		status = 'Plain-language experiment summary copied.';
	}

	onMount(() => {
		const restored = restoreUrl();
		debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotion = () => {
			const next =
				motionQuery.matches ||
				document.documentElement.dataset.motion === 'still' ||
				new URLSearchParams(window.location.search).get('motion') === 'reduce';
			reducedMotion = next;
			if (next && playing) {
				playing = false;
				cancelLoop();
				status = 'Reduced motion is active; the laboratory begins paused.';
			}
		};
		const visibility = () => {
			if (document.hidden) cancelLoop();
			else if (playing) schedule();
		};
		let restoringHistory = false;
		const restoreHistoryEntry = () => {
			if (restoringHistory) return;
			restoringHistory = true;
			try {
				if (restoreUrl())
					resetRun('Experiment restored from browser history with validated versioned state.');
				else status = 'This history entry has no valid Brownian experiment state.';
			} catch (error) {
				status = `Browser-history state was rejected safely: ${error instanceof Error ? error.message : 'invalid experiment state'}.`;
			} finally {
				restoringHistory = false;
			}
		};
		updateMotion();
		motionQuery.addEventListener('change', updateMotion);
		window.addEventListener('site-motion-change', updateMotion);
		window.addEventListener('popstate', restoreHistoryEntry);
		motionObserver = new MutationObserver(updateMotion);
		motionObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		document.addEventListener('visibilitychange', visibility);
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				offscreen = !entries.some((entry) => entry.isIntersecting);
				if (offscreen) cancelLoop();
				else if (playing) schedule();
			},
			{ rootMargin: '160px 0px', threshold: 0.01 }
		);
		intersectionObserver.observe(laboratory);
		initialized = true;
		resetRun(
			restored
				? 'Experiment restored from a validated versioned URL.'
				: 'Laboratory ready. Rendering and physics use separate clocks.'
		);
		return () => {
			disposed = true;
			cancelLoop();
			window.clearTimeout(urlTimer);
			intersectionObserver?.disconnect();
			motionObserver?.disconnect();
			motionQuery.removeEventListener('change', updateMotion);
			window.removeEventListener('site-motion-change', updateMotion);
			window.removeEventListener('popstate', restoreHistoryEntry);
			document.removeEventListener('visibilitychange', visibility);
			unsubscribeFractional?.();
			unsubscribeEnsemble?.();
			fractionalClient?.dispose();
			ensembleClient?.dispose();
		};
	});
</script>

<section
	bind:this={laboratory}
	class="brownian-lab article-breakout not-prose"
	aria-labelledby="brownian-lab-title"
	data-testid="brownian-motion-lab"
	data-hydrated={initialized}
	data-process={processId}
	data-running={playing}
	data-particle-count={displayState.count}
	data-frame-state={currentFrameState()}
	data-simulation-time={metrics.simulationTime.toFixed(6)}
	data-step-count={processId === 'fractional-brownian'
		? fractionalIndex
		: simulation.clock.stepIndex}
	data-worker-kind={workerKind}
	data-worker-state={workerState}
>
	<header class="lab-header">
		<div>
			<p class="eyebrow">A Brownian Motion Laboratory · browser-local · deterministic</p>
			<h2 id="brownian-lab-title">The Particle That Could Not Make Up Its Mind</h2>
			<p class="deck">One path is gossip. A crowd keeps accounts.</p>
		</div>
		<div class="clock" aria-label="Simulation clock">
			<span>simulated time</span>
			<strong>{metrics.simulationTime.toFixed(3)} s</strong>
			<small
				>fixed Δt {processId === 'fractional-brownian' && fractionalResult
					? (fractionalResult.duration / (fractionalResult.pointCount - 1)).toPrecision(3)
					: timestep.toPrecision(3)}</small
			>
		</div>
	</header>

	{#if !introductoryState}
		<ProcessSelector processes={PROCESS_CHOICES} selected={processId} onselect={selectProcess} />
	{/if}

	<div class="primary-controls" aria-label="Primary simulation controls">
		<button type="button" class="primary" onclick={togglePlayback}
			>{playing ? 'Pause' : 'Play'}</button
		>
		<button type="button" onclick={() => resetRun()}>Reset</button>
		<button type="button" onclick={newSeed}>New seed</button>
		{#if !introductoryState}
			<button type="button" onclick={singleStep}>Step</button>
			<button type="button" onclick={() => copyLink(false)}>Copy experiment URL</button>
			<div class="preset-picker">
				<label for="brownian-model-preset">Model preset</label>
				<select
					id="brownian-model-preset"
					value={selectedPreset}
					onchange={(event) =>
						applyModelPreset((event.currentTarget as HTMLSelectElement).value, true)}
				>
					<option value="">Custom parameters</option>
					{#if processId === 'free-brownian'}
						<option value="colloidal-bead-water">Colloidal bead in water</option>
					{/if}
					{#each MODEL_PRESETS[processId] as preset (preset.id)}<option value={preset.id}
							>{preset.label}</option
						>{/each}
				</select>
			</div>
			<ExportMenu
				onpng={exportPng}
				ontrajectorycsv={exportTrajectoryCsv}
				onmetricscsv={exportMetricsCsv}
				onjson={exportJson}
				onsummary={copySummary}
			/>
		{/if}
	</div>

	{#if workerState === 'working'}
		<div class="worker-progress" data-worker-kind={workerKind} data-worker-state={workerState}>
			<span
				>{workerKind === 'fractional'
					? 'Generating correlated path'
					: 'Measuring arrival ensemble'}</span
			>
			<progress max="1" value={workerProgress}>{Math.round(workerProgress * 100)}%</progress>
			<strong>{Math.round(workerProgress * 100)}%</strong>
		</div>
	{/if}

	<div
		id="brownian-process-panel"
		class="instrument-grid"
		class:intro={introductoryState}
		role="tabpanel"
		aria-labelledby={introductoryState ? undefined : `brownian-process-tab-${processId}`}
		aria-label={introductoryState ? 'Free Brownian motion simulation' : undefined}
	>
		<div class="stage-column">
			<SimulationStage
				particles={displayState}
				{metrics}
				trajectories={displayTrajectories}
				{revision}
				diffusion={diffusionForStage()}
				{boundary}
				{particleSize}
				{trailOpacity}
				{showTheory}
				{showParticles}
				{showPaths}
				{showDensity}
				showVelocity={processId === 'active-brownian' || processId === 'underdamped-langevin'}
				{camera}
				oncamera={(next) => {
					camera = next;
					queueUrlUpdate(false);
				}}
				theory={theoryOverlay}
				potential={potentialOverlay}
				obstacles={obstacleOverlays}
				onrender={(duration) => (lastRenderMilliseconds = duration)}
				registerCanvas={(next) => (canvas = next)}
			/>
			{#if particleCount === 1 && processId === 'free-brownian'}
				<div class="ensemble-invitation">
					<div>
						<strong>One particle looks confused. Add 999 more.</strong><span
							>Add independent copies to reveal the distribution and its law.</span
						>
					</div>
					<button type="button" onclick={addParticles}>Add 999 more particles</button>
				</div>
			{/if}
		</div>
		{#if !introductoryState}
			<div class="side-column">
				<EquationCard
					label={definition.label}
					equation={definition.equation.plain}
					interpretation={definition.plainInterpretation}
					watch={definition.whatToWatch}
				/>
				{#if physicalUnits}
					<aside class="physical-card" aria-label="Stokes–Einstein physical-units assumptions">
						<p class="physical-label">PHYSICAL-UNITS PRESET</p>
						<strong>D = {Number(parameters.diffusion).toFixed(3)} µm²/s</strong>
						<code>D = kBT / (6πηa)</code>
						<p>
							SI calculation; displayed in square micrometres per second. Assumes a spherical,
							dilute, noninteracting bead at thermal equilibrium, low Reynolds number, a continuum
							fluid, and no nearby-wall correction. The random kicks are an effective model, not a
							molecule collision count.
						</p>
					</aside>
				{/if}
				<LaboratoryControls
					{controls}
					values={controlValues}
					onchange={changeControl}
					{numericalWarning}
				/>
				<div class="seed-card">
					<label for="brownian-seed">Reproducibility seed</label>
					<div>
						<input id="brownian-seed" bind:value={seedDraft} maxlength="64" /><button
							type="button"
							onclick={applySeed}>Apply</button
						>
					</div>
					<p>Changing colour, camera, or particle size never consumes a random value.</p>
				</div>
			</div>
		{/if}
	</div>

	{#if !introductoryState}
		<MetricsPanel metrics={metricSample} processLabel={definition.label} />

		{#if processId === 'first-passage'}
			<aside
				class="scientific-summary first-passage-summary"
				aria-label="First-passage censored ensemble summary"
				data-testid="first-passage-summary"
			>
				<div class="summary-heading">
					<p>FIRST-PASSAGE ENSEMBLE</p>
					<strong>Arrivals observed only through a finite horizon</strong>
				</div>
				{#if firstPassageResult}
					<div class="summary-stat-grid">
						<div>
							<span>Ensemble actually sampled</span>
							<strong>{firstPassageResult.options.particleCount.toLocaleString('en-IN')}</strong>
						</div>
						<div>
							<span>Absorbed by T</span>
							<strong
								>{firstPassageResult.absorbedCount.toLocaleString('en-IN')} ({(
									(firstPassageResult.absorbedCount / firstPassageResult.options.particleCount) *
									100
								).toFixed(1)}%)</strong
							>
						</div>
						<div>
							<span>Surviving at T</span>
							<strong
								>{firstPassageResult.survivingCount.toLocaleString('en-IN')} ({(
									(firstPassageResult.survivingCount / firstPassageResult.options.particleCount) *
									100
								).toFixed(1)}%)</strong
							>
						</div>
						<div>
							<span>Observed unconditional median</span>
							<strong
								>{firstPassageResult.medianArrivalTime === null
									? `Not reached by ${formatStatistic(firstPassageResult.options.maxTime)} s`
									: `${formatStatistic(firstPassageResult.medianArrivalTime)} s`}</strong
							>
						</div>
					</div>
					<p class="scope-note">
						T = {formatStatistic(firstPassageResult.options.maxTime)} s. Only finite arrival times enter
						the arrival histogram; the {firstPassageResult.survivingCount.toLocaleString('en-IN')} surviving
						histories are right-censored at T. The median is reported only if at least half of the full
						ensemble arrived.
					</p>
				{:else}
					<p class="scope-note">
						Sampling the displayed {particleCount.toLocaleString('en-IN')} histories through T =
						{formatStatistic(effectiveFirstPassageMaxTime())} s. Any history still alive then will be
						right-censored.
					</p>
				{/if}
			</aside>
		{/if}

		{#if processId === 'potential-diffusion'}
			<aside
				class="scientific-summary boltzmann-summary"
				aria-label="Boltzmann distribution theory"
				data-testid="boltzmann-summary"
			>
				<div class="summary-heading">
					<p>BOLTZMANN REFERENCE</p>
					<strong
						>{String(parameters.landscape) === 'tilted-periodic'
							? 'Window-normalized reference; the tilt prevents equilibrium'
							: 'Stationary normalized Boltzmann distribution'}</strong
					>
				</div>
				<code>p_eq(x) = Z⁻¹ exp[−U(x, y₀)/(kBT)]</code>
				<p class="scope-note">
					The dashed distribution uses the exact simulated potential and is numerically normalized
					over the plotted x range.
					{#if String(parameters.landscape) === 'periodic'}
						This is a periodic-window normalization, because the repeated unbounded landscape has no
						finite global Z.
					{:else if String(parameters.landscape) === 'tilted-periodic'}
						It is a Gibbs-shaped reference only: the nonzero tilt drives probability current, so it
						must not be read as a stationary distribution.
					{/if}
				</p>
			</aside>
		{/if}

		{#if processId === 'levy-flight' && levyStatistics}
			<aside
				class="scientific-summary levy-summary"
				aria-label="Robust Lévy displacement summary"
				data-testid="levy-robust-summary"
			>
				<div class="summary-heading">
					<p>ROBUST RADIAL DISPLACEMENT</p>
					<strong>Median and interquartile range resist the rare largest jumps</strong>
				</div>
				<div class="summary-stat-grid levy-stats">
					<div><span>Q1</span><strong>{formatStatistic(levyStatistics.firstQuartile)}</strong></div>
					<div><span>Median</span><strong>{formatStatistic(levyStatistics.median)}</strong></div>
					<div><span>Q3</span><strong>{formatStatistic(levyStatistics.thirdQuartile)}</strong></div>
					<div>
						<span>IQR</span><strong>{formatStatistic(levyStatistics.interquartileRange)}</strong>
					</div>
				</div>
				<p class="scope-note">
					{#if Number(parameters.stability) < 2}
						At α = {formatStatistic(Number(parameters.stability))}, the population variance and
						ordinary theoretical MSD are undefined. The distribution chart therefore uses robust
						1st–99th percentile bounds and discloses clipped tails.
					{:else}
						At α = 2 this stable-law endpoint is Gaussian and has finite variance; the same robust
						summary is retained for comparison.
					{/if}
				</p>
			</aside>
		{/if}

		<DiagnosticChart
			available={availableDiagnostics}
			active={availableDiagnostics.includes(activeDiagnostic) ? activeDiagnostic : 'trajectory'}
			onselect={selectDiagnostic}
			measured={chartMeasured}
			theoretical={chartTheory}
			scatter={chartScatter}
			histogram={chartHistogram}
			xLabel={chartLabelState.x}
			yLabel={chartLabelState.y}
			summary={chartLabelState.summary}
			logarithmic={chartLabelState.logarithmic}
		/>

		<div class="share-strip">
			<button type="button" onclick={() => copyLink(true)}>Copy Markdown link</button>
			<button type="button" onclick={resetCleanUrl}>Clean URL</button>
			<button
				type="button"
				onclick={() => (camera = { centreX: 0, centreY: 0, zoom: 1, autoFit: true })}
				>Reset camera</button
			>
			<span
				>{reducedMotion
					? 'Reduced motion: paused by default.'
					: 'Animation pauses off-screen and on hidden tabs.'}</span
			>
		</div>

		{#if debugEnabled}
			<details class="debug-panel" open>
				<summary>Development diagnostics · debug=1</summary>
				<dl>
					<div>
						<dt>Random stream state</dt>
						<dd>
							{seed} · labelled model streams · next physics step {processId ===
							'fractional-brownian'
								? fractionalIndex + 1
								: simulation.clock.stepIndex + 1}
						</dd>
					</div>
					<div>
						<dt>Physics step / render frame</dt>
						<dd>
							{processId === 'fractional-brownian' ? fractionalIndex : simulation.clock.stepIndex} / {renderFrameCount}
						</dd>
					</div>
					<div>
						<dt>Accumulator</dt>
						<dd>{lastInterpolationAlpha.toFixed(4)} Δt</dd>
					</div>
					<div>
						<dt>Array lengths</dt>
						<dd>
							x,y = {displayState.x.length}; tracked history = {displayTrajectories.length} × {displayTrajectories.trackedParticleCount}
						</dd>
					</div>
					<div>
						<dt>Worker</dt>
						<dd>{workerKind} · {workerState} · {(workerProgress * 100).toFixed(1)}%</dd>
					</div>
					<div>
						<dt>Last stepping / rendering</dt>
						<dd>{lastStepMilliseconds.toFixed(3)} ms / {lastRenderMilliseconds.toFixed(3)} ms</dd>
					</div>
					<div>
						<dt>NaN counter</dt>
						<dd>{nanCount()}</dd>
					</div>
					<div>
						<dt>World bounds</dt>
						<dd>{currentWorldBounds()}</dd>
					</div>
					<div>
						<dt>Theoretical MSD</dt>
						<dd>
							{theoryPrediction?.meanSquareDisplacement?.toPrecision(6) ??
								'not finite / unavailable'}
						</dd>
					</div>
					<div>
						<dt>Measured MSD</dt>
						<dd>{metrics.meanSquareDisplacement?.toPrecision(6) ?? 'undefined'}</dd>
					</div>
					<div>
						<dt>Measured − theory</dt>
						<dd>
							{metrics.meanSquareDisplacement !== null &&
							theoryPrediction?.meanSquareDisplacement !== undefined
								? (
										metrics.meanSquareDisplacement - theoryPrediction.meanSquareDisplacement
									).toPrecision(6)
								: 'unavailable'}
						</dd>
					</div>
				</dl>
			</details>
		{/if}

		<PresetStories presets={STORY_PRESETS} selected={selectedStory} onselect={loadStory} />
	{/if}
	<p class="status-line" role="status">{status}</p>
</section>

<style>
	.brownian-lab {
		--lab-accent: #6f7fa8;
		--lab-rust: #9b5f48;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		box-sizing: border-box;
		width: min(96rem, calc(100vw - 1rem));
		margin: 2.5rem 0;
		transform: translateX(-50%);
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.75rem;
		background: var(--paper-raised, #f6f2e8);
		box-shadow: 0 1.5rem 4rem color-mix(in srgb, var(--ink, #222) 15%, transparent);
		color: var(--ink, #242a32);
		font-family: Roboto, system-ui, sans-serif;
	}
	.lab-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.75rem 0.75rem 0 0;
		background: color-mix(in srgb, var(--paper, #f3eee2) 92%, var(--lab-accent));
		padding: 1.1rem 1.3rem;
	}
	.eyebrow {
		margin: 0;
		color: var(--lab-rust);
		font:
			700 0.68rem 'Courier Prime',
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.lab-header h2 {
		margin: 0.25rem 0 0;
		font-size: clamp(1.35rem, 2.5vw, 2.3rem);
		line-height: 1.1;
	}
	.deck {
		margin: 0.4rem 0 0;
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
	}
	.clock {
		min-width: 9.5rem;
		border-left: 1px solid var(--rule, #c8c1b2);
		padding-left: 1rem;
		text-align: right;
	}
	.clock span,
	.clock small {
		display: block;
		color: var(--ink-muted, #68707a);
		font-size: 0.64rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.clock strong {
		display: block;
		margin: 0.2rem 0;
		font:
			700 1.08rem 'Courier Prime',
			monospace;
	}
	.primary-controls {
		display: flex;
		align-items: end;
		gap: 0.5rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.7rem 0.9rem;
		background: var(--paper-soft, #ece6da);
	}
	button,
	input,
	select {
		font: inherit;
	}
	button,
	.preset-picker select {
		min-height: 2.75rem;
		border: 1px solid var(--rule, #aaa293);
		border-radius: 0.35rem;
		background: var(--paper, #f7f2e8);
		padding: 0.5rem 0.75rem;
		color: var(--ink, #242a32);
		font-weight: 700;
		cursor: pointer;
	}
	button.primary,
	.ensemble-invitation button {
		border-color: color-mix(in srgb, var(--lab-accent) 70%, var(--ink));
		background: var(--lab-accent);
		color: white;
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--lab-accent) 72%, white);
		outline-offset: 2px;
	}
	.preset-picker {
		display: grid;
		min-width: 12rem;
		margin-left: auto;
		gap: 0.15rem;
	}
	.preset-picker label {
		color: var(--ink-muted, #68707a);
		font-size: 0.62rem;
		font-weight: 700;
	}
	.preset-picker select {
		width: 100%;
		min-height: 2.75rem;
		padding-block: 0.3rem;
		font-size: 0.72rem;
	}
	.worker-progress {
		display: grid;
		grid-template-columns: auto minmax(8rem, 1fr) auto;
		align-items: center;
		gap: 0.7rem;
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.55rem 0.9rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.72rem;
	}
	.worker-progress progress {
		width: 100%;
		accent-color: var(--lab-accent);
	}
	.instrument-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(19rem, 27rem);
		gap: 0.8rem;
		padding: 0.8rem;
	}
	.instrument-grid.intro {
		grid-template-columns: minmax(0, 1fr);
	}
	.stage-column,
	.side-column {
		display: grid;
		min-width: 0;
		align-content: start;
		gap: 0.7rem;
	}
	.ensemble-invitation {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border: 1px solid var(--lab-rust);
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--lab-rust) 7%, var(--paper));
		padding: 0.75rem;
	}
	.ensemble-invitation strong,
	.ensemble-invitation span {
		display: block;
	}
	.ensemble-invitation span {
		margin-top: 0.2rem;
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.8rem;
	}
	.seed-card {
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.35rem;
		padding: 0.75rem;
	}
	.physical-card {
		border: 1px solid var(--lab-accent);
		border-left-width: 4px;
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--lab-accent) 7%, var(--paper));
		padding: 0.75rem;
	}
	.physical-card .physical-label {
		margin: 0;
		color: var(--lab-rust);
		font:
			700 0.62rem 'Courier Prime',
			monospace;
		letter-spacing: 0.08em;
	}
	.physical-card strong,
	.physical-card code {
		display: block;
		margin-top: 0.35rem;
		font-family: 'Courier Prime', monospace;
	}
	.physical-card p:last-child {
		margin: 0.5rem 0 0;
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.72rem;
		line-height: 1.45;
	}
	.seed-card > label {
		display: block;
		margin-bottom: 0.35rem;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.seed-card > div {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.4rem;
	}
	.seed-card input {
		min-width: 0;
		border: 1px solid var(--rule, #aaa293);
		border-radius: 0.3rem;
		background: var(--paper, #fff);
		padding: 0.55rem 0.65rem;
		color: var(--ink, #242a32);
		font-family: 'Courier Prime', monospace;
	}
	.seed-card p {
		margin: 0.45rem 0 0;
		color: var(--ink-muted, #68707a);
		font-size: 0.65rem;
	}
	.scientific-summary {
		display: grid;
		grid-template-columns: minmax(13rem, 0.7fr) minmax(0, 1.3fr);
		gap: 0.75rem 1rem;
		border-top: 1px solid var(--rule, #c8c1b2);
		background: color-mix(in srgb, var(--paper, #f7f2e8) 94%, var(--lab-accent));
		padding: 0.75rem 0.9rem;
	}
	.scientific-summary .summary-heading p {
		margin: 0;
		color: var(--lab-rust);
		font:
			700 0.62rem 'Courier Prime',
			monospace;
		letter-spacing: 0.09em;
	}
	.scientific-summary .summary-heading strong {
		display: block;
		margin-top: 0.25rem;
		font-family: 'Source Serif 4', Georgia, serif;
		line-height: 1.25;
	}
	.scientific-summary code {
		align-self: center;
		font:
			700 0.82rem 'Courier Prime',
			monospace;
	}
	.summary-stat-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		grid-column: 1 / -1;
		border: 1px solid var(--rule, #c8c1b2);
		border-radius: 0.3rem;
	}
	.summary-stat-grid > div {
		min-width: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
		padding: 0.55rem 0.65rem;
	}
	.summary-stat-grid > div:last-child {
		border-right: 0;
	}
	.summary-stat-grid span,
	.summary-stat-grid strong {
		display: block;
	}
	.summary-stat-grid span {
		color: var(--ink-muted, #68707a);
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.summary-stat-grid strong {
		margin-top: 0.2rem;
		font:
			700 0.78rem 'Courier Prime',
			monospace;
	}
	.scope-note {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--ink-muted, #68707a);
		font-family: 'Source Serif 4', Georgia, serif;
		font-size: 0.75rem;
		line-height: 1.45;
	}
	.share-strip {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border-top: 1px solid var(--rule, #c8c1b2);
		padding: 0.55rem 0.8rem;
	}
	.share-strip button {
		min-height: 2.75rem;
		font-size: 0.72rem;
	}
	.share-strip span {
		margin-left: auto;
		color: var(--ink-muted, #68707a);
		font-size: 0.7rem;
	}
	.debug-panel {
		border-top: 1px solid var(--rule, #c8c1b2);
		background: color-mix(in srgb, var(--ink, #242a32) 4%, var(--paper));
		font-family: 'Courier Prime', monospace;
	}
	.debug-panel summary {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		padding: 0 0.8rem;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.debug-panel dl {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0;
		border-top: 1px solid var(--rule, #c8c1b2);
	}
	.debug-panel dl div {
		min-width: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
		border-bottom: 1px solid var(--rule, #c8c1b2);
		padding: 0.55rem 0.7rem;
	}
	.debug-panel dt {
		color: var(--ink-muted, #68707a);
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.debug-panel dd {
		overflow-wrap: anywhere;
		margin: 0.2rem 0 0;
		font-size: 0.68rem;
	}
	.status-line {
		margin: 0;
		border-top: 1px solid var(--rule, #c8c1b2);
		border-radius: 0 0 0.75rem 0.75rem;
		padding: 0.65rem 0.9rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.76rem;
	}
	@media (max-width: 70rem) {
		.instrument-grid {
			grid-template-columns: 1fr;
		}
		.side-column {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.side-column :global(.controls),
		.side-column .seed-card {
			grid-column: 1 / -1;
		}
		.primary-controls {
			flex-wrap: wrap;
		}
		.preset-picker {
			margin-left: 0;
		}
		.debug-panel dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 44rem) {
		.brownian-lab {
			width: calc(100vw - 0.5rem);
			margin-block: 1.5rem;
			border-radius: 0.5rem;
		}
		.lab-header {
			gap: 0.65rem;
			padding: 0.85rem;
		}
		.deck {
			display: none;
		}
		.clock {
			min-width: 7rem;
		}
		.primary-controls {
			position: sticky;
			z-index: 8;
			bottom: 0;
			align-items: stretch;
			padding: 0.5rem;
		}
		.primary-controls > button {
			flex: 1 1 auto;
		}
		.primary-controls > button:nth-of-type(n + 4) {
			display: none;
		}
		.preset-picker {
			width: 100%;
		}
		.instrument-grid {
			gap: 0.5rem;
			padding: 0.4rem;
		}
		.side-column {
			grid-template-columns: 1fr;
		}
		.ensemble-invitation {
			align-items: stretch;
			flex-direction: column;
		}
		.share-strip {
			flex-wrap: wrap;
		}
		.share-strip button {
			min-height: 2.75rem;
			flex: 1;
		}
		.share-strip span {
			width: 100%;
			margin: 0;
		}
		.scientific-summary {
			grid-template-columns: 1fr;
		}
		.summary-stat-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.summary-stat-grid > div:nth-child(2) {
			border-right: 0;
		}
		.summary-stat-grid > div:nth-child(-n + 2) {
			border-bottom: 1px solid var(--rule, #c8c1b2);
		}
		.debug-panel dl {
			grid-template-columns: 1fr;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.brownian-lab * {
			scroll-behavior: auto !important;
			transition: none !important;
		}
	}
</style>
