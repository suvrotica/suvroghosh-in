<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import ObservatoryPanel, { type PlotPoint } from './ObservatoryPanel.svelte';
	import PendulumStage, { type StageFrame, type TrailPoint } from './PendulumStage.svelte';
	import PredictionHorizonAtlas from './PredictionHorizonAtlas.svelte';
	import SeparationChart from './SeparationChart.svelte';
	import {
		accumulateBenettinGrowth,
		bobPositions,
		cloneState,
		copyTextLocally,
		copyStateInto,
		createEulerWorkspace,
		createPerturbedState,
		createRk4Workspace,
		createStateExport,
		detectPoincareCrossing,
		downloadBlob,
		energy,
		eulerStepInto,
		isFiniteState,
		lowerBobSeparation,
		lyapunovReading,
		relativeEnergyDifference,
		renormalizeShadow,
		rk4StepInto,
		scaledPhaseDistance,
		snapshotFilename,
		stateFilename,
		wrapAngle,
		type LyapunovAccumulator,
		type PendulumConfiguration,
		type PendulumParameters,
		type PendulumPresetId,
		type PendulumState,
		type PerturbationDimension
	} from '$lib/visualizations/double-pendulum';
	import {
		DEFAULT_PRESET_ID,
		PENDULUM_PRESETS,
		applyPreset,
		createDefaultConfiguration,
		getPreset
	} from '$lib/visualizations/double-pendulum/presets';
	import { parseUrlState, serializeUrlState } from '$lib/visualizations/double-pendulum/url-state';

	type PrincipalMode = 'lab' | 'shadow' | 'atlas' | 'phase-space';
	type ShadowView = 'overlay' | 'split' | 'trails';
	type PhaseView = 'theta1-omega1' | 'theta2-omega2' | 'theta1-theta2';
	type StateKey = keyof PendulumState;
	type ParameterKey = keyof PendulumParameters;
	type ThresholdKey = '0.001' | '0.01' | '0.1' | '1';
	type ThresholdTimes = Record<ThresholdKey, number | null>;
	type PhaseSample = PendulumState & { time: number };

	const MODE_TABS: readonly { id: PrincipalMode; label: string; short: string }[] = [
		{ id: 'lab', label: 'Pendulum Lab', short: 'Lab' },
		{ id: 'shadow', label: 'Shadow Futures', short: 'Shadows' },
		{ id: 'atlas', label: 'Prediction Horizon Atlas', short: 'Atlas' },
		{ id: 'phase-space', label: 'Phase-Space Observatory', short: 'Phase space' }
	];
	const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4] as const;
	const THRESHOLDS = [0.001, 0.01, 0.1, 1] as const;
	const MAX_CATCH_UP_STEPS = 40;
	const MAX_FRAME_DELTA = 0.1;
	const TRAIL_SAMPLE_EVERY = 4;
	const HISTORY_SAMPLE_EVERY = 12;
	const HISTORY_LIMIT = 2_000;
	const HISTORY_TRIM = 160;
	const LYAPUNOV_INTERVAL = 0.5;
	const PARAMETER_BOUNDS: Readonly<Record<ParameterKey, readonly [number, number]>> = {
		m1: [0.1, 5],
		m2: [0.1, 5],
		l1: [0.25, 2.5],
		l2: [0.25, 2.5],
		g: [0.5, 20]
	};
	let defaultConfiguration = createDefaultConfiguration();
	const initialStateSnapshot = cloneState(defaultConfiguration.initialState);
	const initialParametersSnapshot = { ...defaultConfiguration.parameters };
	const initialPerturbationDimension = defaultConfiguration.perturbationDimension;
	const initialPerturbationMagnitude = defaultConfiguration.perturbationMagnitude;
	let activeMode = $state<PrincipalMode>('lab');
	let selectedPreset = $state<PendulumPresetId>(DEFAULT_PRESET_ID);
	let setupState = $state<PendulumState>(cloneState(initialStateSnapshot));
	let parameters = $state<PendulumParameters>({ ...initialParametersSnapshot });
	let timestep = $state(defaultConfiguration.timestep);
	let simulationSpeed = $state(defaultConfiguration.speed);
	let trailLength = $state(defaultConfiguration.trailLength);
	let showTrails = $state(true);
	let showGuides = $state(true);
	let showLabels = $state(true);
	let playing = $state(true);
	let initialized = $state(false);
	let reducedMotion = $state(false);
	let offscreen = $state(false);
	let throttled = $state(false);
	let statusMessage = $state('The laboratory is initializing.');
	let errorMessage = $state('');
	let activePresetLabel = $state(getPreset(DEFAULT_PRESET_ID).label);
	let shadowView = $state<ShadowView>('overlay');
	let perturbationDimension = $state<PerturbationDimension>(initialPerturbationDimension);
	let perturbationMagnitude = $state(initialPerturbationMagnitude);
	let phaseView = $state<PhaseView>('theta1-omega1');
	let lyingIntegrator = $state(false);
	let controlsOpen = $state(true);
	let numericalHonestyOpen = $state(false);
	let helpOpen = $state(false);
	let copiedMessage = $state('');
	let wallClockTime = $state(0);
	let displayedTime = $state(0);
	let displayedState = $state<PendulumState>(cloneState(initialStateSnapshot));
	let displayedEnergyError = $state(0);
	let displayedLyingRk4EnergyError = $state(0);
	let displayedLyingEulerEnergyError = $state(0);
	let displayedPhaseDistance = $state(0);
	let displayedPhysicalDistance = $state(0);
	let displayedLyapunov: ReturnType<typeof lyapunovReading> = $state(
		lyapunovReading({ accumulatedLogGrowth: 0, elapsedTime: 0, renormalizations: 0 })
	);
	let displayedThresholds = $state<ThresholdTimes>(emptyThresholds());
	let metricsRevision = $state(0);
	let shadowHasHistory = $state(false);
	let atlasSelection = $state<{ theta1: number; theta2: number } | null>(null);
	let atlasConfiguration = $state({ ...defaultConfiguration.atlas });
	let pendulumCapture: () => HTMLCanvasElement | null = () => null;
	let atlasCapture: () => HTMLCanvasElement | null = () => null;
	let observatoryCapture: () => HTMLCanvasElement | null = () => null;
	let separationCapture: () => HTMLCanvasElement | null = () => null;
	let atlasDataCapture: () => string | null = () => null;
	let rootElement = $state<HTMLElement>();
	let lyingChart = $state<HTMLCanvasElement>();

	let primary = cloneState(initialStateSnapshot);
	let primaryNext = cloneState(initialStateSnapshot);
	let shadow = createPerturbedState(
		initialStateSnapshot,
		initialPerturbationDimension,
		initialPerturbationMagnitude
	);
	let shadowNext = cloneState(shadow);
	let lyapunovShadow = createLyapunovShadow(initialStateSnapshot);
	let lyapunovShadowNext = cloneState(lyapunovShadow);
	let lyingRk4 = cloneState(initialStateSnapshot);
	let lyingRk4Next = cloneState(initialStateSnapshot);
	let lyingEuler = cloneState(initialStateSnapshot);
	let lyingEulerNext = cloneState(initialStateSnapshot);
	let previousPrimary = cloneState(initialStateSnapshot);
	let simulationTime = 0;
	let lyingTime = 0;
	let runtimeWallClockTime = 0;
	let accumulator = 0;
	let frameId = 0;
	let lastFrameTime = 0;
	let lastMetricsPublish = 0;
	let stepCount = 0;
	let primaryEnergyBaseline = energy(primary, initialParametersSnapshot);
	let lyingRk4EnergyBaseline = primaryEnergyBaseline;
	let lyingEulerEnergyBaseline = primaryEnergyBaseline;
	let lastShadowPhysicalDistance = lowerBobSeparation(primary, shadow, initialParametersSnapshot);
	let thresholdTimes: ThresholdTimes = emptyThresholds();
	let lyapunovAccumulator: LyapunovAccumulator = {
		accumulatedLogGrowth: 0,
		elapsedTime: 0,
		renormalizations: 0
	};
	let lyapunovIntervalElapsed = 0;
	let resumeAfterDrag = false;
	let dragStartState: PendulumState | null = null;
	let urlTimer: ReturnType<typeof setTimeout> | null = null;
	let labIntersectionObserver: IntersectionObserver | null = null;
	let motionPreferenceObserver: MutationObserver | null = null;

	const primaryWorkspace = createRk4Workspace();
	const shadowWorkspace = createRk4Workspace();
	const lyapunovWorkspace = createRk4Workspace();
	const lyingRk4Workspace = createRk4Workspace();
	const lyingEulerWorkspace = createEulerWorkspace();

	const primaryTrail: TrailPoint[] = [];
	const shadowTrail: TrailPoint[] = [];
	const lyingRk4Trail: TrailPoint[] = [];
	const lyingEulerTrail: TrailPoint[] = [];
	const phaseHistory: PhaseSample[] = [];
	const poincareHistory: PlotPoint[] = [];
	const energyHistory: PlotPoint[] = [];
	const separationHistory: PlotPoint[] = [];
	const lyingRk4EnergyHistory: PlotPoint[] = [];
	const lyingEulerEnergyHistory: PlotPoint[] = [];

	let phasePlotPoints = $derived.by((): PlotPoint[] => {
		metricsRevision.toString();
		return phaseHistory.map((sample) =>
			phaseView === 'theta1-omega1'
				? { x: wrapAngle(sample.theta1), y: sample.omega1 }
				: phaseView === 'theta2-omega2'
					? { x: wrapAngle(sample.theta2), y: sample.omega2 }
					: { x: wrapAngle(sample.theta1), y: wrapAngle(sample.theta2) }
		);
	});
	let perturbationHuman = $derived(
		perturbationDimension.startsWith('theta')
			? `${perturbationMagnitude.toExponential(1)} rad ≈ ${((perturbationMagnitude * 180) / Math.PI).toExponential(2)}°`
			: `${perturbationMagnitude.toExponential(1)} rad/s`
	);
	let activePresetDescription = $derived(
		selectedPreset === 'custom'
			? 'The instrument now preserves your custom release state.'
			: getPreset(selectedPreset).description
	);
	let simulationStatus = $derived(
		errorMessage
			? `Simulation stopped: ${errorMessage}`
			: offscreen
				? 'Paused because the instrument is offscreen.'
				: throttled
					? 'Wall-clock catch-up was discarded to preserve the fixed timestep.'
					: playing
						? `Running at ${simulationSpeed}× simulated speed.`
						: 'Paused.'
	);

	$effect(() => {
		metricsRevision.toString();
		if (lyingIntegrator && lyingChart) drawLyingEnergyChart();
	});

	onMount(() => {
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const queryReduced = new URLSearchParams(window.location.search).get('motion') === 'reduce';
		const updateMotionPreference = () => {
			const next =
				queryReduced || motionQuery.matches || document.documentElement.dataset.motion === 'still';
			if (next === reducedMotion) return;
			reducedMotion = next;
			if (next) pause('Reduced motion is active; animation paused.');
		};
		updateMotionPreference();
		if (reducedMotion) playing = false;

		const parsed = parseUrlState(window.location.search, defaultConfiguration);
		if (window.location.search && hasPendulumQuery(window.location.search)) {
			applyConfiguration(parsed.configuration, false);
			if (parsed.issues.length > 0) {
				statusMessage = `Shared setup loaded with ${parsed.issues.length} safe correction${parsed.issues.length === 1 ? '' : 's'}.`;
			}
		}
		initialized = true;
		statusMessage = reducedMotion
			? 'Reduced motion is active; the laboratory begins paused.'
			: statusMessage === 'The laboratory is initializing.'
				? 'Pendulum Lab ready. Drag a mass or press Play.'
				: statusMessage;
		publishMetrics(true);
		if (playing) startLoop();

		motionQuery.addEventListener('change', updateMotionPreference);
		window.addEventListener('site-motion-change', updateMotionPreference);
		motionPreferenceObserver = new MutationObserver(updateMotionPreference);
		motionPreferenceObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion']
		});
		document.addEventListener('visibilitychange', handleDocumentVisibility);
		labIntersectionObserver = new IntersectionObserver(
			(entries) => handleLabVisibility(entries.some((entry) => entry.isIntersecting)),
			{ rootMargin: '180px 0px', threshold: 0.01 }
		);
		if (rootElement) labIntersectionObserver.observe(rootElement);
		return () => {
			cancelAnimationFrame(frameId);
			if (urlTimer) clearTimeout(urlTimer);
			labIntersectionObserver?.disconnect();
			motionPreferenceObserver?.disconnect();
			motionQuery.removeEventListener('change', updateMotionPreference);
			window.removeEventListener('site-motion-change', updateMotionPreference);
			document.removeEventListener('visibilitychange', handleDocumentVisibility);
		};
	});

	function hasPendulumQuery(search: string) {
		const params = new URLSearchParams(search);
		return [
			'v',
			'version',
			'mode',
			'preset',
			'th1',
			'theta1',
			'om1',
			'omega1',
			'th2',
			'theta2',
			'om2',
			'omega2',
			'm1',
			'm2',
			'l1',
			'l2',
			'g',
			'int',
			'integrator',
			'dt',
			'timestep',
			'speed',
			'trail',
			'trailLength',
			'pdim',
			'perturbationDimension',
			'eps',
			'perturbationMagnitude',
			'a1min',
			'a1max',
			'a2min',
			'a2max',
			'ares',
			'aom1',
			'aom2',
			'apdim',
			'aeps',
			'ath',
			'acap',
			'adt',
			'sel1',
			'sel2'
		].some((key) => params.has(key));
	}

	function emptyThresholds(): ThresholdTimes {
		return { '0.001': null, '0.01': null, '0.1': null, '1': null };
	}

	function createLyapunovShadow(state: Readonly<PendulumState>) {
		const raw = createPerturbedState(state, perturbationDimension, perturbationMagnitude);
		return renormalizeShadow(state, raw, perturbationMagnitude, parameters) ?? raw;
	}

	function trimBounded<T>(values: T[], limit: number, trim = 64) {
		if (values.length > limit + trim) values.splice(0, trim);
	}

	function appendTrail(values: TrailPoint[], state: PendulumState) {
		const position = bobPositions(state, parameters);
		values.push({ x: position.x2, y: position.y2 });
		trimBounded(values, Math.max(24, trailLength), Math.min(128, Math.max(24, trailLength)));
	}

	function swapPrimary() {
		const temporary = primary;
		primary = primaryNext;
		primaryNext = temporary;
	}

	function swapShadow() {
		const temporary = shadow;
		shadow = shadowNext;
		shadowNext = temporary;
	}

	function swapLyapunovShadow() {
		const temporary = lyapunovShadow;
		lyapunovShadow = lyapunovShadowNext;
		lyapunovShadowNext = temporary;
	}

	function swapLyingRk4() {
		const temporary = lyingRk4;
		lyingRk4 = lyingRk4Next;
		lyingRk4Next = temporary;
	}

	function swapLyingEuler() {
		const temporary = lyingEuler;
		lyingEuler = lyingEulerNext;
		lyingEulerNext = temporary;
	}

	function startLoop() {
		if (!initialized || !playing || offscreen || document.hidden || activeMode === 'atlas') return;
		cancelAnimationFrame(frameId);
		lastFrameTime = performance.now();
		const loop = (now: number) => {
			frameId = 0;
			if (!playing || offscreen || document.hidden || activeMode === 'atlas') return;
			const realDelta = Math.min(MAX_FRAME_DELTA, Math.max(0, (now - lastFrameTime) / 1_000));
			lastFrameTime = now;
			runtimeWallClockTime += realDelta;
			accumulator += realDelta * simulationSpeed;
			let steps = 0;
			try {
				while (accumulator >= timestep && steps < MAX_CATCH_UP_STEPS) {
					stepSimulation(timestep);
					accumulator -= timestep;
					steps += 1;
				}
				if (accumulator >= timestep) {
					accumulator %= timestep;
					throttled = true;
				} else if (throttled) throttled = false;
			} catch (cause) {
				failSimulation(cause);
				return;
			}
			if (now - lastMetricsPublish >= 90) {
				lastMetricsPublish = now;
				publishMetrics();
			}
			frameId = requestAnimationFrame(loop);
		};
		frameId = requestAnimationFrame(loop);
	}

	function stepSimulation(dt: number) {
		if (lyingIntegrator) {
			stepLyingIntegrator(dt);
			return;
		}
		copyStateInto(primary, previousPrimary);
		rk4StepInto(primary, parameters, dt, primaryNext, primaryWorkspace);
		swapPrimary();
		simulationTime += dt;
		stepCount += 1;

		const crossing = detectPoincareCrossing(previousPrimary, primary);
		if (crossing) {
			poincareHistory.push({ x: wrapAngle(crossing.theta1), y: crossing.omega1 });
			trimBounded(poincareHistory, HISTORY_LIMIT, HISTORY_TRIM);
		}

		if (activeMode === 'shadow') {
			rk4StepInto(shadow, parameters, dt, shadowNext, shadowWorkspace);
			swapShadow();
			rk4StepInto(lyapunovShadow, parameters, dt, lyapunovShadowNext, lyapunovWorkspace);
			swapLyapunovShadow();
			lyapunovIntervalElapsed += dt;
			const physicalDistance = lowerBobSeparation(primary, shadow, parameters);
			for (const threshold of THRESHOLDS) {
				const key = String(threshold) as ThresholdKey;
				if (thresholdTimes[key] === null && physicalDistance >= threshold) {
					const intervalStart = simulationTime - dt;
					const growth = physicalDistance - lastShadowPhysicalDistance;
					const crossingFraction =
						growth > 0
							? Math.max(0, Math.min(1, (threshold - lastShadowPhysicalDistance) / growth))
							: 1;
					thresholdTimes[key] = intervalStart + crossingFraction * dt;
				}
			}
			lastShadowPhysicalDistance = physicalDistance;
			if (lyapunovIntervalElapsed >= LYAPUNOV_INTERVAL) {
				const distance = scaledPhaseDistance(primary, lyapunovShadow, parameters);
				const renormalized = renormalizeShadow(
					primary,
					lyapunovShadow,
					perturbationMagnitude,
					parameters,
					lyapunovShadowNext
				);
				if (
					renormalized &&
					accumulateBenettinGrowth(
						lyapunovAccumulator,
						distance,
						perturbationMagnitude,
						lyapunovIntervalElapsed
					)
				) {
					const temporary = lyapunovShadow;
					lyapunovShadow = lyapunovShadowNext;
					lyapunovShadowNext = temporary;
				}
				lyapunovIntervalElapsed = 0;
			}
		}

		if (stepCount % TRAIL_SAMPLE_EVERY === 0) {
			appendTrail(primaryTrail, primary);
			if (activeMode === 'shadow') appendTrail(shadowTrail, shadow);
		}
		if (stepCount % HISTORY_SAMPLE_EVERY === 0) sampleHistories();
	}

	function stepLyingIntegrator(dt: number) {
		rk4StepInto(lyingRk4, parameters, dt, lyingRk4Next, lyingRk4Workspace);
		eulerStepInto(lyingEuler, parameters, dt, lyingEulerNext, lyingEulerWorkspace);
		swapLyingRk4();
		swapLyingEuler();
		if (!isFiniteState(lyingRk4) || !isFiniteState(lyingEuler)) {
			throw new Error('One numerical method became non-finite; the comparison has been stopped.');
		}
		lyingTime += dt;
		stepCount += 1;
		if (stepCount % TRAIL_SAMPLE_EVERY === 0) {
			appendTrail(lyingRk4Trail, lyingRk4);
			appendTrail(lyingEulerTrail, lyingEuler);
		}
		if (stepCount % HISTORY_SAMPLE_EVERY === 0) {
			lyingRk4EnergyHistory.push({
				x: lyingTime,
				y: relativeEnergyDifference(energy(lyingRk4, parameters), lyingRk4EnergyBaseline)
			});
			lyingEulerEnergyHistory.push({
				x: lyingTime,
				y: relativeEnergyDifference(energy(lyingEuler, parameters), lyingEulerEnergyBaseline)
			});
			trimBounded(lyingRk4EnergyHistory, HISTORY_LIMIT, HISTORY_TRIM);
			trimBounded(lyingEulerEnergyHistory, HISTORY_LIMIT, HISTORY_TRIM);
		}
	}

	function sampleHistories() {
		phaseHistory.push({ ...primary, time: simulationTime });
		energyHistory.push({
			x: simulationTime,
			y: relativeEnergyDifference(energy(primary, parameters), primaryEnergyBaseline)
		});
		trimBounded(phaseHistory, HISTORY_LIMIT, HISTORY_TRIM);
		trimBounded(energyHistory, HISTORY_LIMIT, HISTORY_TRIM);
		if (activeMode === 'shadow') {
			separationHistory.push({
				x: simulationTime,
				y: lowerBobSeparation(primary, shadow, parameters)
			});
			trimBounded(separationHistory, HISTORY_LIMIT, HISTORY_TRIM);
		}
	}

	function publishMetrics(force = false) {
		const state = lyingIntegrator ? lyingRk4 : primary;
		wallClockTime = runtimeWallClockTime;
		displayedTime = lyingIntegrator ? lyingTime : simulationTime;
		displayedState = cloneState(state);
		displayedEnergyError = relativeEnergyDifference(
			energy(state, parameters),
			lyingIntegrator ? lyingRk4EnergyBaseline : primaryEnergyBaseline
		);
		if (lyingIntegrator) {
			displayedLyingRk4EnergyError = relativeEnergyDifference(
				energy(lyingRk4, parameters),
				lyingRk4EnergyBaseline
			);
			displayedLyingEulerEnergyError = relativeEnergyDifference(
				energy(lyingEuler, parameters),
				lyingEulerEnergyBaseline
			);
		}
		if (activeMode === 'shadow') {
			displayedPhaseDistance = scaledPhaseDistance(primary, shadow, parameters);
			displayedPhysicalDistance = lowerBobSeparation(primary, shadow, parameters);
			displayedLyapunov = lyapunovReading(lyapunovAccumulator);
			displayedThresholds = { ...thresholdTimes };
			shadowHasHistory = separationHistory.length > 0;
		}
		metricsRevision += 1;
		if (force && lyingIntegrator) queueMicrotask(drawLyingEnergyChart);
	}

	function resetRuntime(announcement = 'Simulation reset to the selected setup.') {
		cancelAnimationFrame(frameId);
		frameId = 0;
		primary = cloneState(setupState);
		primaryNext = cloneState(setupState);
		shadow = createPerturbedState(setupState, perturbationDimension, perturbationMagnitude);
		shadowNext = cloneState(shadow);
		lyapunovShadow = createLyapunovShadow(setupState);
		lyapunovShadowNext = cloneState(lyapunovShadow);
		lyingRk4 = cloneState(setupState);
		lyingRk4Next = cloneState(setupState);
		lyingEuler = cloneState(setupState);
		lyingEulerNext = cloneState(setupState);
		copyStateInto(setupState, previousPrimary);
		simulationTime = 0;
		lyingTime = 0;
		runtimeWallClockTime = 0;
		wallClockTime = 0;
		accumulator = 0;
		stepCount = 0;
		thresholdTimes = emptyThresholds();
		lastShadowPhysicalDistance = lowerBobSeparation(primary, shadow, parameters);
		for (const threshold of THRESHOLDS) {
			if (lastShadowPhysicalDistance >= threshold) {
				thresholdTimes[String(threshold) as ThresholdKey] = 0;
			}
		}
		lyapunovAccumulator = { accumulatedLogGrowth: 0, elapsedTime: 0, renormalizations: 0 };
		lyapunovIntervalElapsed = 0;
		primaryEnergyBaseline = energy(primary, parameters);
		lyingRk4EnergyBaseline = energy(lyingRk4, parameters);
		lyingEulerEnergyBaseline = energy(lyingEuler, parameters);
		for (const collection of [
			primaryTrail,
			shadowTrail,
			lyingRk4Trail,
			lyingEulerTrail,
			phaseHistory,
			poincareHistory,
			energyHistory,
			separationHistory,
			lyingRk4EnergyHistory,
			lyingEulerEnergyHistory
		])
			collection.length = 0;
		shadowHasHistory = false;
		errorMessage = '';
		statusMessage = announcement;
		publishMetrics(true);
		if (playing) startLoop();
	}

	function failSimulation(cause: unknown) {
		playing = false;
		cancelAnimationFrame(frameId);
		frameId = 0;
		errorMessage =
			cause instanceof Error ? cause.message : 'The simulation produced a non-finite state.';
		statusMessage = 'Simulation stopped safely. Reset or choose another preset.';
		publishMetrics(true);
	}

	function togglePlay() {
		if (activeMode === 'atlas') return;
		if (playing) pause('Simulation paused.');
		else {
			errorMessage = '';
			playing = true;
			statusMessage = 'Simulation running.';
			metricsRevision += 1;
			startLoop();
		}
	}

	function pause(message = 'Simulation paused.') {
		playing = false;
		cancelAnimationFrame(frameId);
		frameId = 0;
		statusMessage = message;
		metricsRevision += 1;
	}

	function singleStep() {
		if (playing || activeMode === 'atlas') return;
		try {
			stepSimulation(timestep);
			statusMessage = lyingIntegrator
				? `Advanced RK4 and explicit Euler by exactly ${formatTimestep(timestep)}.`
				: `Advanced exactly one ${formatTimestep(timestep)} RK4 step.`;
			publishMetrics(true);
		} catch (cause) {
			failSimulation(cause);
		}
	}

	function clearTrails() {
		for (const collection of [primaryTrail, shadowTrail, lyingRk4Trail, lyingEulerTrail]) {
			collection.length = 0;
		}
		statusMessage = 'Trails cleared; the current physical state was preserved.';
		metricsRevision += 1;
	}

	function redrawStage() {
		metricsRevision += 1;
	}

	function trailConfigurationChanged() {
		const requested = Number(trailLength);
		trailLength = Number.isFinite(requested)
			? Math.max(120, Math.min(4_800, Math.round(requested / 120) * 120))
			: defaultConfiguration.trailLength;
		for (const collection of [primaryTrail, shadowTrail, lyingRk4Trail, lyingEulerTrail]) {
			if (collection.length > trailLength) collection.splice(0, collection.length - trailLength);
		}
		redrawStage();
		scheduleUrlUpdate();
	}

	function selectPreset(id: PendulumPresetId) {
		const next = applyPreset(buildConfiguration(false), id);
		selectedPreset = next.preset;
		activePresetLabel = getPreset(next.preset).label;
		setupState = cloneState(next.initialState);
		parameters = { ...next.parameters };
		timestep = next.timestep;
		resetRuntime(`${activePresetLabel} loaded.`);
		scheduleUrlUpdate();
	}

	function markCustom() {
		selectedPreset = 'custom';
		activePresetLabel = 'Custom';
	}

	function changeState(key: StateKey, value: number, degrees = false) {
		if (!Number.isFinite(value)) return;
		const bounded = degrees
			? Math.max(-180, Math.min(180, value))
			: Math.max(-20, Math.min(20, value));
		const next = degrees ? (bounded * Math.PI) / 180 : bounded;
		setupState = { ...setupState, [key]: next };
		markCustom();
		resetRuntime(
			'Custom release state applied. Angular velocities reset only when you drag a mass.'
		);
		scheduleUrlUpdate();
	}

	function changeParameter(key: ParameterKey, value: number) {
		if (!Number.isFinite(value)) return;
		const [minimum, maximum] = PARAMETER_BOUNDS[key];
		const bounded = Math.max(minimum, Math.min(maximum, value));
		parameters = { ...parameters, [key]: bounded };
		markCustom();
		resetRuntime(
			'Physical parameter changed; angles and velocities were preserved and the energy baseline reset.'
		);
		scheduleUrlUpdate();
	}

	function changePerturbationDimension(value: PerturbationDimension) {
		perturbationDimension = value;
		resetRuntime(`Shadow perturbation moved to ${formatDimension(value)}.`);
		scheduleUrlUpdate();
	}

	function changePerturbationExponent(exponent: number) {
		perturbationMagnitude = 10 ** Math.max(-12, Math.min(-2, exponent));
		resetRuntime(`Shadow perturbation set to ${perturbationMagnitude.toExponential(1)}.`);
		scheduleUrlUpdate();
	}

	function previewPerturbationExponent(exponent: number) {
		if (!Number.isFinite(exponent)) return;
		perturbationMagnitude = 10 ** Math.max(-12, Math.min(-2, exponent));
	}

	function setMode(mode: PrincipalMode) {
		if (activeMode === mode) return;
		const leavingAtlas = activeMode === 'atlas';
		activeMode = mode;
		lyingIntegrator = false;
		if (mode === 'atlas') {
			if (!atlasSelection) {
				atlasSelection = {
					theta1: Math.max(
						atlasConfiguration.theta1Min,
						Math.min(atlasConfiguration.theta1Max, setupState.theta1)
					),
					theta2: Math.max(
						atlasConfiguration.theta2Min,
						Math.min(atlasConfiguration.theta2Max, setupState.theta2)
					)
				};
				atlasConfiguration = {
					...atlasConfiguration,
					selectedTheta1: atlasSelection.theta1,
					selectedTheta2: atlasSelection.theta2
				};
			}
			setupState = {
				theta1: atlasSelection.theta1,
				omega1: atlasConfiguration.fixedOmega1,
				theta2: atlasSelection.theta2,
				omega2: atlasConfiguration.fixedOmega2
			};
			pause('Primary simulation paused while the atlas performs its own experiments.');
		} else if (leavingAtlas) {
			perturbationDimension = atlasConfiguration.perturbationDimension;
			perturbationMagnitude = atlasConfiguration.perturbationMagnitude;
			resetRuntime(
				`Selected atlas setup loaded into ${MODE_TABS.find((tab) => tab.id === mode)?.label ?? 'the laboratory'}.`
			);
		} else if (mode === 'shadow')
			resetRuntime('Shadow Futures reset to the selected controlled perturbation.');
		else {
			statusMessage = `${MODE_TABS.find((tab) => tab.id === mode)?.label ?? 'Mode'} selected.`;
			metricsRevision += 1;
			if (playing) startLoop();
		}
		scheduleUrlUpdate();
	}

	function handleTabKey(event: KeyboardEvent, index: number) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		let next = index;
		if (event.key === 'ArrowLeft') next = (index - 1 + MODE_TABS.length) % MODE_TABS.length;
		if (event.key === 'ArrowRight') next = (index + 1) % MODE_TABS.length;
		if (event.key === 'Home') next = 0;
		if (event.key === 'End') next = MODE_TABS.length - 1;
		setMode(MODE_TABS[next].id);
		queueMicrotask(() =>
			rootElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
		);
		event.preventDefault();
	}

	function handleLabKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (
			!target ||
			!rootElement?.contains(target) ||
			target instanceof HTMLInputElement ||
			target instanceof HTMLSelectElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLButtonElement ||
			target?.isContentEditable
		)
			return;
		if (event.key === ' ') togglePlay();
		else if (event.key.toLowerCase() === 'r') resetRuntime();
		else if (event.key.toLowerCase() === 's') singleStep();
		else if (event.key.toLowerCase() === 'c') clearTrails();
		else if (/^[1-4]$/.test(event.key)) setMode(MODE_TABS[Number(event.key) - 1].id);
		else if (event.key === 'Escape' && lyingIntegrator) toggleLyingIntegrator(false);
		else return;
		event.preventDefault();
	}

	function getStageFrame(): StageFrame {
		if (lyingIntegrator) {
			return {
				parameters,
				trajectories: [
					{
						state: lyingRk4,
						trail: lyingRk4Trail,
						label: 'RK4 · physical simulator',
						kind: 'primary'
					},
					{
						state: lyingEuler,
						trail: lyingEulerTrail,
						label: 'Euler · intentionally bad',
						kind: 'euler'
					}
				],
				view: 'split',
				animate: playing && !offscreen,
				showTrails,
				showGuides,
				showLabels: true,
				directManipulation: false
			};
		}
		const trajectories: StageFrame['trajectories'] = [
			{ state: primary, trail: primaryTrail, label: 'Primary future · solid', kind: 'primary' }
		];
		if (activeMode === 'shadow') {
			trajectories.push({
				state: shadow,
				trail: shadowTrail,
				label: 'Shadow future · dashed',
				kind: 'shadow'
			});
		}
		return {
			parameters,
			trajectories,
			view: activeMode === 'shadow' ? shadowView : 'overlay',
			animate: playing && !offscreen,
			showTrails,
			showGuides,
			showLabels,
			directManipulation: activeMode === 'lab'
		};
	}

	function handleStageDrag(
		target: 'upper' | 'lower',
		angle: number,
		phase: 'start' | 'move' | 'end' | 'cancel'
	) {
		if (phase === 'start') {
			dragStartState = cloneState(primary);
			resumeAfterDrag = playing;
			pause('Dragging pauses the clock. Release creates a new state from rest.');
		}
		if (phase === 'cancel') {
			if (dragStartState) {
				primary = cloneState(dragStartState);
				primaryNext = cloneState(dragStartState);
			}
			dragStartState = null;
			statusMessage = 'Drag cancelled; the previous physical state was restored.';
			publishMetrics(true);
			if (resumeAfterDrag && !reducedMotion) {
				playing = true;
				startLoop();
			}
			resumeAfterDrag = false;
			return;
		}
		if (target === 'upper') primary.theta1 = angle;
		else primary.theta2 = angle;
		primary.omega1 = 0;
		primary.omega2 = 0;
		metricsRevision += 1;
		if (phase === 'end') {
			setupState = cloneState(primary);
			markCustom();
			resetRuntime('New release-from-rest state created from the dragged mass.');
			if (resumeAfterDrag && !reducedMotion) {
				playing = true;
				startLoop();
			}
			resumeAfterDrag = false;
			dragStartState = null;
			scheduleUrlUpdate();
		}
	}

	function handleLabVisibility(visible: boolean) {
		if (offscreen === !visible) return;
		offscreen = !visible;
		if (!visible) {
			cancelAnimationFrame(frameId);
			frameId = 0;
			statusMessage = 'Simulation throttled: the laboratory moved offscreen.';
		} else if (playing) {
			statusMessage =
				'Laboratory visible; fixed-step simulation resumed without wall-clock catch-up.';
			accumulator = 0;
			startLoop();
		}
		metricsRevision += 1;
	}

	function handleDocumentVisibility() {
		if (document.hidden) {
			cancelAnimationFrame(frameId);
			frameId = 0;
			statusMessage = 'Simulation paused while this tab is hidden.';
		} else if (playing && !offscreen && activeMode !== 'atlas') {
			accumulator = 0;
			statusMessage = 'Tab visible; simulation resumed without attempting to catch up.';
			startLoop();
		}
		metricsRevision += 1;
	}

	function toggleLyingIntegrator(next = !lyingIntegrator) {
		lyingIntegrator = next;
		if (next) {
			activeMode = 'lab';
			resetRuntime('The Lying Integrator is armed. Euler is intentionally being used badly.');
		} else {
			resetRuntime('Returned to the physical RK4 simulator; the Euler state was discarded.');
		}
	}

	function handleAtlasSelection(theta1: number, theta2: number) {
		atlasSelection = { theta1, theta2 };
		atlasConfiguration = { ...atlasConfiguration, selectedTheta1: theta1, selectedTheta2: theta2 };
		setupState = {
			theta1,
			omega1: atlasConfiguration.fixedOmega1,
			theta2,
			omega2: atlasConfiguration.fixedOmega2
		};
		markCustom();
		scheduleUrlUpdate();
	}

	function handleAtlasSettings(next: typeof atlasConfiguration) {
		atlasConfiguration = {
			...next,
			selectedTheta1: atlasSelection?.theta1,
			selectedTheta2: atlasSelection?.theta2
		};
		if (atlasSelection) {
			setupState = {
				theta1: atlasSelection.theta1,
				omega1: next.fixedOmega1,
				theta2: atlasSelection.theta2,
				omega2: next.fixedOmega2
			};
		}
		scheduleUrlUpdate();
	}

	function handleAtlasParameters(next: PendulumParameters) {
		parameters = { ...next };
		markCustom();
		scheduleUrlUpdate();
	}

	function watchAtlasPoint(theta1: number, theta2: number, atlasParameters: PendulumParameters) {
		setupState = {
			theta1,
			omega1: atlasConfiguration.fixedOmega1,
			theta2,
			omega2: atlasConfiguration.fixedOmega2
		};
		parameters = { ...atlasParameters };
		perturbationDimension = atlasConfiguration.perturbationDimension;
		perturbationMagnitude = atlasConfiguration.perturbationMagnitude;
		markCustom();
		activeMode = 'shadow';
		playing = !reducedMotion;
		resetRuntime('Atlas point loaded into Shadow Futures. Both systems obey the same equations.');
		scheduleUrlUpdate();
	}

	function buildConfiguration(useCurrent: boolean): PendulumConfiguration {
		return {
			mode: lyingIntegrator ? 'lying-integrator' : activeMode,
			preset: useCurrent ? 'custom' : selectedPreset,
			initialState: cloneState(useCurrent ? (lyingIntegrator ? lyingRk4 : primary) : setupState),
			parameters: { ...parameters },
			integrator: 'rk4',
			timestep,
			speed: simulationSpeed,
			trailLength,
			perturbationDimension,
			perturbationMagnitude,
			atlas: {
				...atlasConfiguration,
				selectedTheta1: atlasSelection?.theta1,
				selectedTheta2: atlasSelection?.theta2
			}
		};
	}

	function applyConfiguration(configuration: PendulumConfiguration, updateUrl = true) {
		lyingIntegrator = configuration.mode === 'lying-integrator';
		activeMode = lyingIntegrator
			? 'lab'
			: MODE_TABS.some((tab) => tab.id === configuration.mode)
				? (configuration.mode as PrincipalMode)
				: 'lab';
		selectedPreset = configuration.preset;
		activePresetLabel =
			configuration.preset === 'custom' ? 'Custom' : getPreset(configuration.preset).label;
		setupState = cloneState(configuration.initialState);
		parameters = { ...configuration.parameters };
		timestep = configuration.timestep;
		simulationSpeed = configuration.speed;
		trailLength = Math.max(120, Math.min(4_800, configuration.trailLength));
		perturbationDimension = configuration.perturbationDimension;
		perturbationMagnitude = configuration.perturbationMagnitude;
		atlasConfiguration = { ...configuration.atlas };
		atlasSelection =
			configuration.atlas.selectedTheta1 !== undefined &&
			configuration.atlas.selectedTheta2 !== undefined
				? { theta1: configuration.atlas.selectedTheta1, theta2: configuration.atlas.selectedTheta2 }
				: null;
		if (activeMode === 'atlas' && atlasSelection) {
			setupState = {
				theta1: atlasSelection.theta1,
				omega1: configuration.atlas.fixedOmega1,
				theta2: atlasSelection.theta2,
				omega2: configuration.atlas.fixedOmega2
			};
		}
		resetRuntime('Reproducible setup loaded.');
		if (activeMode === 'atlas')
			pause('Shared atlas setup loaded; primary simulation remains paused.');
		if (updateUrl) scheduleUrlUpdate();
	}

	function scheduleUrlUpdate() {
		if (!initialized) return;
		if (urlTimer) clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const url = new SvelteURL(window.location.href);
			url.search = serializeUrlState(buildConfiguration(false)).toString();
			history.replaceState(history.state, '', url);
			urlTimer = null;
		}, 300);
	}

	async function share(useCurrent: boolean) {
		const url = new SvelteURL(window.location.href);
		url.search = serializeUrlState(buildConfiguration(useCurrent)).toString();
		try {
			await navigator.clipboard.writeText(url.toString());
			copiedMessage = useCurrent
				? 'Current instant copied. The link begins a new simulation from this state.'
				: 'Setup link copied.';
		} catch {
			window.prompt('Copy this link:', url.toString());
			copiedMessage = 'Copy the displayed link to share this setup.';
		}
		statusMessage = copiedMessage;
		setTimeout(() => (copiedMessage = ''), 3_000);
	}

	function downloadPng() {
		const source = activeVisualizationCapture();
		if (!source) {
			statusMessage = 'PNG export is unavailable until the active visualization has rendered.';
			return;
		}
		try {
			const footerState =
				activeMode === 'atlas' && atlasSelection
					? { ...setupState, theta1: atlasSelection.theta1, theta2: atlasSelection.theta2 }
					: lyingIntegrator
						? lyingRk4
						: primary;
			const footerTimestep = activeMode === 'atlas' ? atlasConfiguration.timestep : timestep;
			const footerTime = activeMode === 'atlas' ? 0 : lyingIntegrator ? lyingTime : simulationTime;
			const footerHeight = 92;
			const output = document.createElement('canvas');
			output.width = source.width;
			output.height = source.height + footerHeight;
			const ctx = output.getContext('2d');
			if (!ctx) throw new Error('Canvas export context unavailable.');
			ctx.drawImage(source, 0, 0);
			ctx.fillStyle = '#081015';
			ctx.fillRect(0, source.height, output.width, footerHeight);
			ctx.fillStyle = '#f4eee4';
			ctx.font = '600 24px ui-sans-serif, sans-serif';
			ctx.fillText('The Machine That Misplaces Tomorrow', 28, source.height + 36);
			ctx.fillStyle = '#aebdc2';
			ctx.font = '18px ui-monospace, monospace';
			ctx.fillText(
				`θ₁ ${toDegrees(footerState.theta1).toFixed(2)}° · θ₂ ${toDegrees(footerState.theta2).toFixed(2)}° · ${activeMode === 'atlas' ? 'prediction horizon atlas' : `t ${footerTime.toFixed(2)} s`} · RK4 ${formatTimestep(footerTimestep)}`,
				28,
				source.height + 69
			);
			output.toBlob((blob) => {
				if (!blob) {
					statusMessage = 'PNG export failed because this browser could not encode the frame.';
					return;
				}
				downloadBlob(blob, snapshotName('png'));
				statusMessage = 'High-resolution visualization PNG downloaded.';
			}, 'image/png');
		} catch (cause) {
			statusMessage =
				cause instanceof Error ? `PNG export failed: ${cause.message}` : 'PNG export failed.';
		}
	}

	function activeVisualizationCapture() {
		if (activeMode === 'atlas') return atlasCapture();
		if (activeMode === 'phase-space') return observatoryCapture();
		if (activeMode === 'shadow') return composeCanvases([pendulumCapture(), separationCapture()]);
		if (lyingIntegrator) return composeCanvases([pendulumCapture(), lyingChart ?? null]);
		return pendulumCapture();
	}

	function composeCanvases(sources: Array<HTMLCanvasElement | null>) {
		const available = sources.filter((source): source is HTMLCanvasElement => source !== null);
		if (available.length === 0) return null;
		if (available.length === 1) return available[0];
		const gap = 24;
		const output = document.createElement('canvas');
		output.width = Math.max(...available.map((source) => source.width));
		output.height = available.reduce((sum, source) => sum + source.height, 0) + gap;
		const context = output.getContext('2d');
		if (!context) return null;
		context.fillStyle = '#081015';
		context.fillRect(0, 0, output.width, output.height);
		let y = 0;
		for (const source of available) {
			context.drawImage(source, Math.round((output.width - source.width) / 2), y);
			y += source.height + gap;
		}
		return output;
	}

	function downloadState() {
		try {
			const atlasActive = activeMode === 'atlas';
			const exportState = atlasActive ? setupState : lyingIntegrator ? lyingRk4 : primary;
			const exportTime = atlasActive ? 0 : lyingIntegrator ? lyingTime : simulationTime;
			const exportTimestep = atlasActive ? atlasConfiguration.timestep : timestep;
			const exportEnergy = energy(exportState, parameters);
			const documentState = createStateExport({
				parameters,
				initialState: setupState,
				currentState: exportState,
				simulationTime: exportTime,
				integrator: 'rk4',
				timestep: exportTimestep,
				mode: lyingIntegrator ? 'lying-integrator' : activeMode,
				preset: selectedPreset,
				experimentSettings: {
					simulatorVersion: 1,
					wallClockTime: atlasActive ? 0 : wallClockTime,
					shadowState: activeMode === 'shadow' ? cloneState(shadow) : null,
					perturbation: { dimension: perturbationDimension, magnitude: perturbationMagnitude },
					atlas: { ...atlasConfiguration },
					energy: {
						baseline: atlasActive
							? exportEnergy
							: lyingIntegrator
								? lyingRk4EnergyBaseline
								: primaryEnergyBaseline,
						relativeError: atlasActive ? 0 : displayedEnergyError
					},
					comparedIntegrator: lyingIntegrator ? 'intentionally-bad-explicit-euler' : undefined,
					comparedState: lyingIntegrator ? cloneState(lyingEuler) : undefined,
					comparedSimulationTime: lyingIntegrator ? lyingTime : undefined,
					comparedEnergy: lyingIntegrator
						? {
								baseline: lyingEulerEnergyBaseline,
								relativeError: relativeEnergyDifference(
									energy(lyingEuler, parameters),
									lyingEulerEnergyBaseline
								)
							}
						: undefined
				}
			});
			downloadBlob(
				new Blob([JSON.stringify(documentState, null, 2)], { type: 'application/json' }),
				stateFilename(setupState)
			);
			statusMessage = 'Schema-versioned simulation state downloaded as JSON.';
		} catch (cause) {
			statusMessage =
				cause instanceof Error ? `State export failed: ${cause.message}` : 'State export failed.';
		}
	}

	async function copyData() {
		let count = 0;
		let csv: string;
		if (activeMode === 'atlas') {
			const atlasCsv = atlasDataCapture();
			if (!atlasCsv) {
				statusMessage = 'Generate an atlas before copying its bounded cell data.';
				return;
			}
			csv = atlasCsv;
			count = Math.max(0, atlasCsv.split('\n').length - 1);
		} else if (lyingIntegrator) {
			const sourceLength = Math.max(lyingRk4EnergyHistory.length, lyingEulerEnergyHistory.length);
			count = Math.min(HISTORY_LIMIT, sourceLength);
			csv = [
				'simulated_time_s,rk4_relative_energy_error,euler_relative_energy_error',
				...Array.from({ length: count }, (_, index) => {
					const sourceIndex =
						sourceLength <= count || count <= 1
							? index
							: Math.round((index * (sourceLength - 1)) / (count - 1));
					const rk4Point = lyingRk4EnergyHistory[sourceIndex];
					const eulerPoint = lyingEulerEnergyHistory[sourceIndex];
					return `${rk4Point?.x ?? eulerPoint?.x ?? 0},${rk4Point?.y ?? ''},${eulerPoint?.y ?? ''}`;
				})
			].join('\n');
		} else {
			const series = [
				{ name: `phase-${phaseView}`, points: phasePlotPoints },
				{ name: 'poincare-theta1-omega1', points: poincareHistory },
				{ name: 'energy-time-relative-error', points: energyHistory },
				{ name: 'separation-time-metres', points: separationHistory }
			].filter((entry) => entry.points.length > 0);
			if (series.length === 0) {
				statusMessage = 'Run the pendulum before copying sampled chart data.';
				return;
			}
			const rows = ['series,source_index,x,y'];
			const perSeriesBudget = Math.max(2, Math.floor(HISTORY_LIMIT / series.length));
			for (const entry of series) {
				const outputLength = Math.min(perSeriesBudget, entry.points.length);
				for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
					const sourceIndex =
						entry.points.length <= outputLength || outputLength <= 1
							? outputIndex
							: Math.round((outputIndex * (entry.points.length - 1)) / (outputLength - 1));
					const point = entry.points[sourceIndex];
					rows.push(`${entry.name},${sourceIndex},${point.x},${point.y}`);
				}
			}
			count = rows.length - 1;
			csv = rows.join('\n');
		}
		try {
			await copyTextLocally(csv);
			statusMessage = `Copied ${count.toLocaleString('en')} bounded ${activeMode === 'atlas' ? 'atlas cells' : 'chart samples'} as CSV.`;
		} catch {
			try {
				downloadBlob(new Blob([csv], { type: 'text/csv' }), snapshotName('csv'));
				statusMessage = 'Clipboard unavailable; chart samples downloaded as CSV instead.';
			} catch (cause) {
				statusMessage =
					cause instanceof Error
						? `Data export failed: ${cause.message}`
						: 'Data export failed in this browser.';
			}
		}
	}

	function snapshotName(extension: 'png' | 'json' | 'csv') {
		return snapshotFilename(setupState, extension);
	}

	function drawLyingEnergyChart() {
		if (!lyingChart) return;
		const rect = lyingChart.getBoundingClientRect();
		const width = Math.max(280, rect.width);
		const height = Math.max(180, rect.height);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const pixelWidth = Math.round(width * dpr);
		const pixelHeight = Math.round(height * dpr);
		if (lyingChart.width !== pixelWidth || lyingChart.height !== pixelHeight) {
			lyingChart.width = pixelWidth;
			lyingChart.height = pixelHeight;
		}
		const ctx = lyingChart.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#081015';
		ctx.fillRect(0, 0, width, height);
		const margin = 34;
		const maxX = Math.max(1, lyingTime);
		const values = [...lyingRk4EnergyHistory, ...lyingEulerEnergyHistory].map((point) =>
			Math.log10(Math.max(1e-16, point.y))
		);
		const minY = Math.min(-12, ...values);
		const maxY = Math.max(-4, ...values);
		ctx.strokeStyle = '#2d414a';
		for (let index = 0; index <= 4; index += 1) {
			const y = margin + ((height - margin * 2) * index) / 4;
			ctx.beginPath();
			ctx.moveTo(margin, y);
			ctx.lineTo(width - margin, y);
			ctx.stroke();
		}
		const drawSeries = (points: PlotPoint[], color: string, dashed: boolean) => {
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.8;
			ctx.setLineDash(dashed ? [5, 4] : []);
			ctx.beginPath();
			points.forEach((point, index) => {
				const x = margin + (point.x / maxX) * (width - margin * 2);
				const log = Math.log10(Math.max(1e-16, point.y));
				const y =
					height - margin - ((log - minY) / Math.max(1e-9, maxY - minY)) * (height - margin * 2);
				if (index === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.stroke();
		};
		drawSeries(lyingRk4EnergyHistory, '#e2764b', false);
		drawSeries(lyingEulerEnergyHistory, '#e8b65b', true);
		ctx.setLineDash([]);
		ctx.fillStyle = '#afbec3';
		ctx.font = '11px ui-monospace, monospace';
		ctx.fillText('relative energy error (log scale)', margin, 16);
		ctx.fillStyle = '#e2764b';
		ctx.fillText('RK4 solid', margin, height - 9);
		ctx.fillStyle = '#e8b65b';
		ctx.fillText('Euler dashed', margin + 82, height - 9);
	}

	function formatDimension(value: PerturbationDimension) {
		return value === 'theta1' ? 'θ₁' : value === 'theta2' ? 'θ₂' : value === 'omega1' ? 'ω₁' : 'ω₂';
	}

	function toDegrees(value: number) {
		return (value * 180) / Math.PI;
	}

	function formatNumber(value: number, digits = 3) {
		if (!Number.isFinite(value)) return '—';
		if (value === 0) return '0';
		if (Math.abs(value) < 0.001 || Math.abs(value) >= 10_000) return value.toExponential(2);
		return Number(value.toPrecision(digits)).toString();
	}

	function formatEnergyError(value: number) {
		return value === 0
			? '0'
			: value < 0.001
				? value.toExponential(2)
				: `${(value * 100).toPrecision(3)}%`;
	}

	function formatDistance(value: number) {
		if (value < 0.001) return `${formatNumber(value * 1_000_000)} µm`;
		if (value < 1) return `${formatNumber(value * 100)} cm`;
		return `${formatNumber(value)} m`;
	}

	function formatTimestep(value: number) {
		return `1/${Math.round(1 / value)} s`;
	}

	function thresholdLabel(value: (typeof THRESHOLDS)[number]) {
		return value === 0.001 ? '1 mm' : value === 0.01 ? '1 cm' : value === 0.1 ? '10 cm' : '1 m';
	}
</script>

<svelte:window onkeydown={handleLabKey} />

<section
	bind:this={rootElement}
	class="double-pendulum-lab article-breakout not-prose"
	aria-labelledby="double-pendulum-lab-title"
>
	<p class="loading" class:hidden={initialized}>Calibrating rods, clocks, and numerical honesty…</p>
	<header class="lab-header">
		<div>
			<p class="eyebrow">Interactive · deterministic mechanics</p>
			<h2 id="double-pendulum-lab-title">The Pendulum Laboratory</h2>
			<p>Two rods, four state numbers, one lawful machine. Computed locally in your browser.</p>
		</div>
		<div class="header-actions">
			<button
				type="button"
				onclick={() => (controlsOpen = !controlsOpen)}
				aria-expanded={controlsOpen}
			>
				{controlsOpen ? 'Hide controls' : 'Show controls'}
			</button>
			<button type="button" onclick={() => (helpOpen = !helpOpen)} aria-expanded={helpOpen}
				>Shortcuts</button
			>
		</div>
	</header>

	<div class="mode-tabs" role="tablist" aria-label="Double-pendulum laboratory modes">
		{#each MODE_TABS as tab, index (tab.id)}
			<button
				id={`double-pendulum-tab-${tab.id}`}
				type="button"
				role="tab"
				aria-controls="double-pendulum-active-panel"
				aria-selected={activeMode === tab.id}
				tabindex={activeMode === tab.id ? 0 : -1}
				class:active={activeMode === tab.id}
				onclick={() => setMode(tab.id)}
				onkeydown={(event) => handleTabKey(event, index)}
			>
				<span class="wide-label">{tab.label}</span><span class="short-label">{tab.short}</span>
			</button>
		{/each}
	</div>

	{#if helpOpen}
		<div class="help-panel">
			<strong>Keyboard shortcuts</strong>
			<p>
				With the mechanism or atlas focused: <kbd>Space</kbd> play/pause · <kbd>R</kbd> reset ·
				<kbd>S</kbd> one fixed step ·
				<kbd>C</kbd>
				clear trails · <kbd>1–4</kbd> switch modes · <kbd>Esc</kbd> close the numerical experiment.
			</p>
		</div>
	{/if}

	<div
		class="mode-content"
		id="double-pendulum-active-panel"
		role="tabpanel"
		aria-labelledby={`double-pendulum-tab-${activeMode}`}
		tabindex="0"
	>
		{#if activeMode === 'atlas'}
			<PredictionHorizonAtlas
				{parameters}
				initialSelection={atlasSelection}
				onselection={handleAtlasSelection}
				onwatch={watchAtlasPoint}
				initialConfiguration={atlasConfiguration}
				onsettings={handleAtlasSettings}
				onparameters={handleAtlasParameters}
				oncapture={(capture) => (atlasCapture = capture)}
				oncopycapture={(capture) => (atlasDataCapture = capture)}
			/>
		{:else}
			<div class="stage-grid" class:controls-hidden={!controlsOpen}>
				<div class="stage-column">
					<PendulumStage
						getframe={getStageFrame}
						revision={metricsRevision}
						ondrag={handleStageDrag}
						oncapture={(capture) => (pendulumCapture = capture)}
					/>
					<div class="transport" aria-label="Playback controls">
						<button class="primary-action" type="button" onclick={togglePlay}
							>{playing ? 'Pause' : 'Play'}</button
						>
						<button type="button" onclick={() => resetRuntime()}>Reset</button>
						<button type="button" onclick={singleStep} disabled={playing}>Single step</button>
						<button type="button" onclick={clearTrails}>Clear trails</button>
						<label class="compact-field"
							><span>Speed</span><select bind:value={simulationSpeed} onchange={scheduleUrlUpdate}
								>{#each SPEEDS as value (value)}<option {value}>{value}×</option>{/each}</select
							></label
						>
					</div>
					<div class="instrument-readouts" aria-label="Current instrument readings">
						<div><span>Simulated time</span><strong>{displayedTime.toFixed(2)} s</strong></div>
						<div><span>Wall-clock active</span><strong>{wallClockTime.toFixed(1)} s</strong></div>
						<div>
							<span>Energy error</span><strong>{formatEnergyError(displayedEnergyError)}</strong>
						</div>
						<div>
							<span>Integrator</span><strong
								>{lyingIntegrator
									? `RK4 + explicit Euler · ${formatTimestep(timestep)}`
									: `RK4 · ${formatTimestep(timestep)}`}</strong
							>
						</div>
						<div>
							<span>θ₁ / θ₂ now</span><strong
								>{toDegrees(displayedState.theta1).toFixed(1)}° / {toDegrees(
									displayedState.theta2
								).toFixed(1)}°</strong
							>
						</div>
						<div><span>Engine</span><strong>{simulationStatus}</strong></div>
					</div>
				</div>

				{#if controlsOpen}
					<aside class="controls" aria-label="Pendulum controls">
						<label class="field"
							><span>Preset <output>{activePresetLabel}</output></span><select
								value={selectedPreset}
								onchange={(event) => selectPreset(event.currentTarget.value as PendulumPresetId)}
								>{#each PENDULUM_PRESETS as preset (preset.id)}<option value={preset.id}
										>{preset.label}</option
									>{/each}</select
							></label
						>
						<p class="field-note">{activePresetDescription}</p>

						<details open>
							<summary>Release state</summary>
							<div class="control-stack">
								<label class="paired-field"
									><span
										>Upper angle θ₁ <output>{toDegrees(setupState.theta1).toFixed(3)}°</output
										></span
									><input
										type="range"
										min="-180"
										max="180"
										step="0.1"
										value={toDegrees(setupState.theta1)}
										oninput={(event) =>
											changeState('theta1', event.currentTarget.valueAsNumber, true)}
									/><input
										aria-label="Upper angle in degrees"
										type="number"
										min="-180"
										max="180"
										step="0.001"
										value={toDegrees(setupState.theta1)}
										onchange={(event) =>
											changeState('theta1', event.currentTarget.valueAsNumber, true)}
									/></label
								>
								<label class="paired-field"
									><span
										>Lower angle θ₂ <output>{toDegrees(setupState.theta2).toFixed(3)}°</output
										></span
									><input
										type="range"
										min="-180"
										max="180"
										step="0.1"
										value={toDegrees(setupState.theta2)}
										oninput={(event) =>
											changeState('theta2', event.currentTarget.valueAsNumber, true)}
									/><input
										aria-label="Lower angle in degrees"
										type="number"
										min="-180"
										max="180"
										step="0.001"
										value={toDegrees(setupState.theta2)}
										onchange={(event) =>
											changeState('theta2', event.currentTarget.valueAsNumber, true)}
									/></label
								>
								<label class="paired-field"
									><span
										>Upper angular velocity ω₁ <output
											>{formatNumber(setupState.omega1)} rad/s</output
										></span
									><input
										type="range"
										min="-8"
										max="8"
										step="0.01"
										value={setupState.omega1}
										oninput={(event) => changeState('omega1', event.currentTarget.valueAsNumber)}
									/><input
										aria-label="Upper angular velocity in radians per second"
										type="number"
										min="-20"
										max="20"
										step="0.001"
										value={setupState.omega1}
										onchange={(event) => changeState('omega1', event.currentTarget.valueAsNumber)}
									/></label
								>
								<label class="paired-field"
									><span
										>Lower angular velocity ω₂ <output
											>{formatNumber(setupState.omega2)} rad/s</output
										></span
									><input
										type="range"
										min="-8"
										max="8"
										step="0.01"
										value={setupState.omega2}
										oninput={(event) => changeState('omega2', event.currentTarget.valueAsNumber)}
									/><input
										aria-label="Lower angular velocity in radians per second"
										type="number"
										min="-20"
										max="20"
										step="0.001"
										value={setupState.omega2}
										onchange={(event) => changeState('omega2', event.currentTarget.valueAsNumber)}
									/></label
								>
							</div>
							<p class="field-note">
								Dragging either mass creates a new release-from-rest state: both angular velocities
								become zero.
							</p>
						</details>

						<details>
							<summary>Masses, rods, and gravity</summary>
							<div class="control-stack">
								{#each [{ key: 'm1' as const, label: 'Upper mass m₁', min: 0.1, max: 5, step: 0.05, unit: 'kg' }, { key: 'm2' as const, label: 'Lower mass m₂', min: 0.1, max: 5, step: 0.05, unit: 'kg' }, { key: 'l1' as const, label: 'Upper rod l₁', min: 0.25, max: 2.5, step: 0.01, unit: 'm' }, { key: 'l2' as const, label: 'Lower rod l₂', min: 0.25, max: 2.5, step: 0.01, unit: 'm' }, { key: 'g' as const, label: 'Gravity g', min: 0.5, max: 20, step: 0.01, unit: 'm/s²' }] as field (field.key)}
									<label class="paired-field"
										><span
											>{field.label}
											<output>{formatNumber(parameters[field.key])} {field.unit}</output></span
										><input
											type="range"
											min={field.min}
											max={field.max}
											step={field.step}
											value={parameters[field.key]}
											oninput={(event) =>
												changeParameter(field.key, event.currentTarget.valueAsNumber)}
										/><input
											aria-label={`${field.label} in ${field.unit}`}
											type="number"
											min={field.min}
											max={field.max}
											step={field.step}
											value={parameters[field.key]}
											onchange={(event) =>
												changeParameter(field.key, event.currentTarget.valueAsNumber)}
										/></label
									>
								{/each}
							</div>
							<p class="field-note">
								A physical-parameter change preserves the release state and starts a new energy
								ledger.
							</p>
						</details>

						<details>
							<summary>Display and timestep</summary>
							<div class="check-grid">
								<label
									><input type="checkbox" bind:checked={showTrails} onchange={redrawStage} /> Trails</label
								>
								<label
									><input type="checkbox" bind:checked={showGuides} onchange={redrawStage} /> Angle guides</label
								>
								<label
									><input type="checkbox" bind:checked={showLabels} onchange={redrawStage} /> Labels</label
								>
							</div>
							<label class="paired-field"
								><span>Trail samples <output>{trailLength}</output></span><input
									type="range"
									min="120"
									max="4800"
									step="120"
									bind:value={trailLength}
									onchange={trailConfigurationChanged}
								/><input
									aria-label="Trail sample limit"
									type="number"
									min="120"
									max="4800"
									step="120"
									bind:value={trailLength}
									onchange={trailConfigurationChanged}
								/></label
							>
							<label class="field"
								><span>Internal timestep</span><select
									bind:value={timestep}
									onchange={() => {
										resetRuntime('Internal timestep changed; deterministic history restarted.');
										scheduleUrlUpdate();
									}}
									><option value={1 / 120}>1/120 s</option><option value={1 / 240}
										>1/240 s · default</option
									><option value={1 / 360}>1/360 s</option><option value={1 / 480}>1/480 s</option
									></select
								></label
							>
						</details>
					</aside>
				{/if}
			</div>

			{#if activeMode === 'shadow' && !lyingIntegrator}
				<section class="mode-panel shadow-panel" aria-labelledby="shadow-panel-title">
					<header>
						<div>
							<p class="eyebrow">Same equations · nearly the same beginning</p>
							<h3 id="shadow-panel-title">Shadow Futures</h3>
						</div>
						<button
							type="button"
							onclick={() => resetRuntime('Replay the divorce: both original futures restarted.')}
							>Replay the divorce</button
						>
					</header>
					<div class="shadow-controls">
						<label
							><span>Perturb</span><select
								value={perturbationDimension}
								onchange={(event) =>
									changePerturbationDimension(event.currentTarget.value as PerturbationDimension)}
								><option value="theta1">Upper angle θ₁</option><option value="theta2"
									>Lower angle θ₂</option
								><option value="omega1">Upper velocity ω₁</option><option value="omega2"
									>Lower velocity ω₂</option
								></select
							></label
						>
						<label
							><span>Magnitude <output>{perturbationHuman}</output></span><input
								aria-label="Logarithmic perturbation exponent"
								type="range"
								min="-12"
								max="-2"
								step="0.25"
								value={Math.log10(perturbationMagnitude)}
								oninput={(event) => previewPerturbationExponent(event.currentTarget.valueAsNumber)}
								onchange={(event) => changePerturbationExponent(event.currentTarget.valueAsNumber)}
							/></label
						>
						<label
							><span>View</span><select bind:value={shadowView} onchange={redrawStage}
								><option value="overlay">Overlay</option><option value="split">Split</option><option
									value="trails">Trails only</option
								></select
							></label
						>
					</div>
					<div class="shadow-readouts">
						<div>
							<span>Scaled phase-state distance</span><strong
								>{formatNumber(displayedPhaseDistance, 4)}</strong
							>
						</div>
						<div>
							<span>Lower-bob separation</span><strong
								>{formatDistance(displayedPhysicalDistance)}</strong
							>
						</div>
						<div>
							<span>Finite-time Lyapunov estimate</span><strong
								>{displayedLyapunov.status === 'available'
									? `${formatNumber(displayedLyapunov.estimate ?? 0)} s⁻¹`
									: displayedLyapunov.status === 'not-enough-evidence'
										? 'Not enough evidence yet'
										: displayedLyapunov.status === 'non-positive'
											? 'Non-positive over this interval'
											: 'Unavailable'}</strong
							>{#if displayedLyapunov.eFoldingTime}<small
									>e-folding time ≈ {formatNumber(displayedLyapunov.eFoldingTime)} s</small
								>{/if}
						</div>
					</div>
					<div class="threshold-grid" aria-label="First threshold crossing times">
						{#each THRESHOLDS as threshold (threshold)}<div>
								<span>{thresholdLabel(threshold)}</span><strong
									>{displayedThresholds[String(threshold) as ThresholdKey] === null
										? 'Not yet'
										: `${displayedThresholds[String(threshold) as ThresholdKey]?.toFixed(2)} s`}</strong
								>
							</div>{/each}
					</div>
					<SeparationChart
						points={separationHistory}
						revision={metricsRevision}
						oncapture={(capture) => (separationCapture = capture)}
					/>
					<details>
						<summary>How to read the finite-time estimate</summary>
						<p>
							The Benettin-style estimate repeatedly returns a hidden comparison trajectory to the
							selected dimensionless separation. Its value depends on this state, duration, scaling
							convention, timestep, and integrator; it is not a universal “chaos score”.
						</p>
					</details>
				</section>
			{/if}

			{#if activeMode === 'phase-space' && !lyingIntegrator}
				<ObservatoryPanel
					phasePoints={phasePlotPoints}
					poincarePoints={poincareHistory}
					energyPoints={energyHistory}
					separationPoints={separationHistory}
					{phaseView}
					shadowAvailable={shadowHasHistory}
					revision={metricsRevision}
					onphaseview={(view) => (phaseView = view)}
					oncopydata={copyData}
					oncapture={(capture) => (observatoryCapture = capture)}
				/>
			{/if}

			{#if lyingIntegrator}
				<section class="mode-panel lying-panel" aria-labelledby="lying-title">
					<header>
						<div>
							<p class="eyebrow warning">Opt-in numerical experiment</p>
							<h3 id="lying-title">The Lying Integrator</h3>
						</div>
						<button type="button" onclick={() => toggleLyingIntegrator(false)}
							>Return to physical lab</button
						>
					</header>
					<p class="warning-copy">
						<strong>Euler is intentionally being used badly.</strong> Its distorted trajectory is not
						evidence about the physical pendulum. Chaos is real. Numerical incompetence is also real.
						They should not be allowed to borrow one another’s trousers.
					</p>
					<div class="lying-readouts">
						<div>
							<span>RK4 energy error</span><strong
								>{formatEnergyError(displayedLyingRk4EnergyError)}</strong
							>
						</div>
						<div>
							<span>Euler energy error</span><strong
								>{formatEnergyError(displayedLyingEulerEnergyError)}</strong
							>
						</div>
						<button
							type="button"
							onclick={() =>
								resetRuntime('The numerical comparison restarted from the same state.')}
							>Reset comparison</button
						>
					</div>
					<canvas
						bind:this={lyingChart}
						aria-label="Logarithmic energy-error comparison. RK4 is a solid copper line and explicit Euler is a dashed amber line."
					></canvas>
				</section>
			{/if}
		{/if}
	</div>

	<section class="lower-instruments">
		<details bind:open={numericalHonestyOpen}>
			<summary>Numerical Honesty</summary>
			<p>
				A browser simulates another dynamical system laid over the physical one. A poor method or
				oversized step can invent energy, destroy it, or manufacture behaviour that belongs to the
				algorithm rather than the pendulum.
			</p>
			{#if !lyingIntegrator}<button type="button" onclick={() => toggleLyingIntegrator(true)}
					>Open The Lying Integrator</button
				>{/if}
		</details>
		<div class="export-actions" aria-label="Share and export">
			<button type="button" onclick={() => share(false)}>Share setup</button>
			<button type="button" onclick={() => share(true)}>Share this instant</button>
			<button type="button" onclick={downloadPng}>Download PNG</button>
			<button type="button" onclick={downloadState}>Download state</button>
			<button type="button" onclick={copyData}>Copy data</button>
		</div>
	</section>

	<p class="live-status" role="status">{statusMessage}</p>
</section>

<style>
	.double-pendulum-lab {
		--dp-bg: #081015;
		--dp-panel: #101b20;
		--dp-panel-2: #132229;
		--dp-line: #334a54;
		--dp-ink: #f4eee4;
		--dp-muted: #9eb0b6;
		--dp-copper: #df764d;
		--dp-cool: #92d8ca;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(92rem, calc(100vw - 1rem));
		margin: 2.5rem 0;
		transform: translateX(-50%);
		border: 1px solid #2e4149;
		border-radius: 1rem;
		background: var(--dp-bg);
		box-shadow: 0 30px 80px -42px rgb(0 0 0 / 0.9);
		color: var(--dp-ink);
		overflow: hidden;
	}
	.double-pendulum-lab:focus-visible {
		outline: 3px solid var(--dp-cool);
		outline-offset: 4px;
	}
	.loading {
		position: static;
		margin: 0;
		border-bottom: 1px solid var(--dp-line);
		background: var(--dp-panel);
		padding: 0.65rem 1rem;
		color: var(--dp-muted);
		text-align: center;
	}
	.loading.hidden {
		display: none;
	}
	.lab-header,
	.mode-panel header,
	.lower-instruments,
	.lying-readouts,
	.transport,
	.header-actions,
	.shadow-controls {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.lab-header {
		justify-content: space-between;
		padding: clamp(1rem, 3vw, 1.6rem);
		border-bottom: 1px solid var(--dp-line);
		background: linear-gradient(135deg, #111d22, #0a1216);
	}
	.lab-header h2,
	.lab-header p,
	.mode-panel h3,
	.mode-panel p,
	.field-note,
	.live-status {
		margin: 0;
	}
	.lab-header h2 {
		color: var(--dp-ink) !important;
		font-size: clamp(1.35rem, 3vw, 2rem);
		font-weight: 500;
		letter-spacing: -0.025em;
	}
	.lab-header > div > p:last-child {
		max-width: 52rem;
		color: var(--dp-muted);
		font-size: 0.82rem;
	}
	.eyebrow {
		color: var(--dp-copper) !important;
		font-size: 0.68rem !important;
		font-weight: 700;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.header-actions {
		justify-content: flex-end;
	}
	button,
	select,
	input[type='number'] {
		min-height: 2.75rem;
		border: 1px solid #455e68;
		border-radius: 0.42rem;
		background: var(--dp-panel-2);
		color: var(--dp-ink);
		font: inherit;
	}
	button {
		cursor: pointer;
		padding: 0.55rem 0.78rem;
	}
	button:hover:not(:disabled) {
		border-color: #80969f;
		background: #182b33;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	button:focus-visible,
	select:focus-visible,
	input:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--dp-cool);
		outline-offset: 2px;
	}
	.primary-action {
		border-color: #ef956d;
		background: #7b3427;
	}
	.mode-tabs {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		border-bottom: 1px solid var(--dp-line);
	}
	.mode-tabs button {
		min-width: 0;
		border: 0;
		border-right: 1px solid var(--dp-line);
		border-radius: 0;
		background: #0c171c;
		color: #9fb0b5;
	}
	.mode-tabs button:last-child {
		border-right: 0;
	}
	.mode-tabs button.active {
		box-shadow: inset 0 -3px var(--dp-copper);
		background: #17252b;
		color: var(--dp-ink);
	}
	.short-label {
		display: none;
	}
	.help-panel {
		border-bottom: 1px solid var(--dp-line);
		background: #111d22;
		padding: 0.8rem 1rem;
		color: var(--dp-muted);
		font-size: 0.75rem;
	}
	.help-panel p {
		margin: 0.3rem 0 0;
	}
	kbd {
		border: 1px solid #516872;
		border-bottom-width: 2px;
		border-radius: 0.25rem;
		background: #0b1418;
		padding: 0.1rem 0.3rem;
		color: var(--dp-ink);
	}
	.stage-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 23rem);
	}
	.stage-grid.controls-hidden {
		grid-template-columns: 1fr;
	}
	.stage-column {
		min-width: 0;
	}
	.controls {
		max-height: 50rem;
		border-left: 1px solid var(--dp-line);
		background: var(--dp-panel);
		padding: 1rem;
		overflow-y: auto;
		scrollbar-color: #526872 #101b20;
	}
	.transport {
		border-top: 1px solid var(--dp-line);
		border-bottom: 1px solid var(--dp-line);
		padding: 0.7rem;
	}
	.transport .compact-field {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-left: auto;
		color: var(--dp-muted);
		font-size: 0.7rem;
	}
	.transport select {
		min-height: 2.6rem;
		padding: 0.4rem 1.8rem 0.4rem 0.55rem;
	}
	.instrument-readouts,
	.shadow-readouts,
	.threshold-grid,
	.lying-readouts {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
	}
	.instrument-readouts > div,
	.shadow-readouts > div,
	.threshold-grid > div,
	.lying-readouts > div {
		display: grid;
		gap: 0.22rem;
		min-width: 0;
		border-right: 1px solid var(--dp-line);
		background: #0c171c;
		padding: 0.7rem 0.8rem;
	}
	.instrument-readouts span,
	.shadow-readouts span,
	.threshold-grid span,
	.lying-readouts span {
		color: var(--dp-muted);
		font-size: 0.64rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.instrument-readouts strong,
	.shadow-readouts strong,
	.threshold-grid strong,
	.lying-readouts strong {
		font-family: ui-monospace, monospace;
		font-size: 0.76rem;
		font-weight: 500;
		overflow-wrap: anywhere;
	}
	.field,
	.paired-field,
	.shadow-controls label {
		display: grid;
		gap: 0.36rem;
		margin: 0.65rem 0;
		color: #c1cdd0;
		font-size: 0.72rem;
	}
	.field > span,
	.paired-field > span,
	.shadow-controls label > span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	output {
		color: var(--dp-ink);
		font-family: ui-monospace, monospace;
	}
	select,
	input[type='number'] {
		width: 100%;
		padding: 0.48rem 0.65rem;
	}
	input[type='range'] {
		width: 100%;
		min-height: 2rem;
		accent-color: var(--dp-copper);
	}
	.paired-field {
		grid-template-columns: minmax(0, 1fr) 5.7rem;
		align-items: center;
	}
	.paired-field > span {
		grid-column: 1 / -1;
	}
	.field-note {
		color: var(--dp-muted);
		font-size: 0.68rem;
		line-height: 1.45;
	}
	details {
		border-top: 1px solid var(--dp-line);
		padding: 0.75rem 0;
	}
	summary {
		cursor: pointer;
		color: #e8dfd2;
		font-size: 0.78rem;
		font-weight: 600;
	}
	.check-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.45rem;
		margin: 0.7rem 0;
	}
	.check-grid label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.75rem;
		font-size: 0.7rem;
	}
	.mode-panel {
		border-top: 1px solid var(--dp-line);
		background: #0d171c;
		padding: clamp(1rem, 3vw, 1.5rem);
	}
	.mode-panel header {
		justify-content: space-between;
	}
	.mode-panel h3 {
		color: var(--dp-ink) !important;
		font-size: clamp(1.15rem, 2.7vw, 1.55rem);
		font-weight: 500;
	}
	.shadow-controls {
		align-items: end;
		margin: 0.8rem 0;
	}
	.shadow-controls label {
		flex: 1 1 13rem;
		margin: 0;
	}
	.shadow-readouts {
		grid-template-columns: repeat(3, 1fr);
	}
	.shadow-readouts small {
		color: var(--dp-muted);
		font-size: 0.65rem;
	}
	.threshold-grid {
		grid-template-columns: repeat(4, 1fr);
		margin-top: 0.7rem;
	}
	.warning {
		color: #efad65 !important;
	}
	.warning-copy {
		margin: 0.8rem 0 !important;
		border-left: 3px solid #d89049;
		background: #211910;
		padding: 0.75rem;
		color: #ead7bd;
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.lying-readouts {
		grid-template-columns: repeat(3, 1fr);
	}
	.lying-panel canvas {
		display: block;
		width: 100%;
		height: 13rem;
		margin-top: 0.8rem;
		border: 1px solid var(--dp-line);
		background: var(--dp-bg);
	}
	.lower-instruments {
		align-items: stretch;
		justify-content: space-between;
		border-top: 1px solid var(--dp-line);
		background: #0b1418;
		padding: 0.8rem 1rem;
	}
	.lower-instruments details {
		flex: 1 1 28rem;
		border: 0;
		padding: 0.3rem 0;
	}
	.lower-instruments details p {
		max-width: 52rem;
		color: var(--dp-muted);
		font-size: 0.73rem;
		line-height: 1.5;
	}
	.export-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.45rem;
		flex: 2 1 40rem;
		flex-wrap: wrap;
	}
	.live-status {
		min-height: 2rem;
		border-top: 1px solid var(--dp-line);
		padding: 0.55rem 1rem;
		color: #adc0c6;
		font-size: 0.7rem;
	}
	@media (max-width: 980px) {
		.stage-grid {
			grid-template-columns: 1fr;
		}
		.controls {
			max-height: none;
			border-top: 1px solid var(--dp-line);
			border-left: 0;
			overflow: visible;
		}
		.instrument-readouts {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@media (max-width: 640px) {
		.double-pendulum-lab {
			width: calc(100vw - 1.5rem);
			border-radius: 0.7rem;
		}
		.lab-header {
			align-items: flex-start;
		}
		.header-actions {
			width: 100%;
			justify-content: flex-start;
		}
		.mode-tabs button {
			padding-inline: 0.35rem;
			font-size: 0.72rem;
		}
		.wide-label {
			display: none;
		}
		.short-label {
			display: inline;
		}
		.transport {
			align-items: stretch;
		}
		.transport button {
			flex: 1 1 calc(50% - 0.5rem);
		}
		.transport .compact-field {
			width: 100%;
			margin-left: 0;
		}
		.instrument-readouts,
		.shadow-readouts,
		.threshold-grid,
		.lying-readouts {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.paired-field {
			grid-template-columns: minmax(0, 1fr) 5.3rem;
		}
		.check-grid {
			grid-template-columns: 1fr;
		}
		.export-actions {
			justify-content: stretch;
		}
		.export-actions button {
			flex: 1 1 9rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
			transition: none !important;
		}
	}
</style>
