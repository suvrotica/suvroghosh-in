<script lang="ts">
	import { onMount } from 'svelte';
	import {
		COMPARISON_A_VALUES,
		COMPARISON_K_VALUES,
		DEFAULT_INITIAL_STATE,
		DEFAULT_LOOM_PARAMETERS,
		DEFAULT_SIMULATION_DURATION,
		FIXED_PREDATOR_MAX,
		FIXED_PREY_MAX,
		GUIDED_PROMPTS,
		WORKED_SETTINGS,
		WORKED_SETTING_ORDER,
		buildPhaseRibbonPaths,
		buildTimeSeriesPath,
		computeComparisonGrid,
		mapPhaseToScreen,
		mapTimeValueToScreen,
		sampleTrajectoryAtTime,
		simulatePredatorPreyLoom,
		type GuidedPromptId,
		type InterventionSpec,
		type WorkedSettingId
	} from '$lib/visualizations/the-predator-prey-loom';

	// Base parameters (before mid-run interventions)
	let baseK = $state<number>(WORKED_SETTINGS['k-3.0'].K);
	let baseA = $state<number>(DEFAULT_LOOM_PARAMETERS.a);

	// Current slider controls (reflecting active K and a)
	let controlK = $state<number>(WORKED_SETTINGS['k-3.0'].K);
	let controlA = $state<number>(DEFAULT_LOOM_PARAMETERS.a);

	// Earlier parameter values stored so "Restore earlier conditions" can restore them while keeping current populations
	let earlierParams = $state<{ K: number; a: number } | null>(null);

	// Active interventions applied during the run
	let interventions = $state<InterventionSpec[]>([]);
	let activeWorkedSetting = $state<WorkedSettingId | null>('k-3.0');
	let activePromptId = $state<GuidedPromptId | null>('watch-delay');

	// Cursor and playback state (simulation time is strictly independent of animation frame rate)
	let cursorTime = $state<number>(28.0);
	let isPlaying = $state<boolean>(false);
	let playbackSpeed = $state<number>(6.0); // model-time units per real second
	let prefersReducedMotion = $state<boolean>(false);
	let isVisibleInViewport = $state<boolean>(true);
	let isDocumentVisible = $state<boolean>(true);

	// Scale mode: fixed by default so comparisons and interventions never shift axes silently
	let scaleMode = $state<'fixed' | 'fit'>('fixed');

	let rootElement = $state<HTMLElement | null>(null);
	let timeSvgElement = $state<SVGSVGElement | null>(null);
	let isScrubbingTime = $state<boolean>(false);

	// Primary computed ODE trajectory (deterministic, independent of frame rate)
	const runResult = $derived(
		simulatePredatorPreyLoom({
			parameters: {
				...DEFAULT_LOOM_PARAMETERS,
				K: baseK,
				a: baseA
			},
			initialState: DEFAULT_INITIAL_STATE,
			duration: DEFAULT_SIMULATION_DURATION,
			interventions
		})
	);

	// Precomputed 3x3 comparison grid
	const comparisonGrid = computeComparisonGrid();

	// Effective axis bounds
	const phaseBounds = $derived(
		scaleMode === 'fixed'
			? { maxPrey: FIXED_PREY_MAX, maxPredator: FIXED_PREDATOR_MAX }
			: {
					maxPrey: Math.max(1.2, Number((runResult.maxPrey * 1.15).toFixed(2))),
					maxPredator: Math.max(1.0, Number((runResult.maxPredator * 1.15).toFixed(2)))
				}
	);

	// Sample at the shared cursor time
	const currentSample = $derived(sampleTrajectoryAtTime(runResult.samples, cursorTime));

	// Phase portrait SVG viewport geometry
	const PHASE_SVG_W = 680;
	const PHASE_SVG_H = 440;
	const PHASE_PLOT_BOX = { x: 66, y: 24, width: 586, height: 356 };

	// Split trajectory into subdued older history, brighter recent segment up to cursorTime, and faint future path
	const recentWindowSpan = 22.0;

	const phaseSegmentsOlder = $derived(
		runResult.segments
			.map((seg) => seg.filter((s) => s.time <= Math.max(0, cursorTime - recentWindowSpan)))
			.filter((seg) => seg.length > 1)
			.map((seg) => buildPhaseRibbonPaths(seg, PHASE_PLOT_BOX, phaseBounds, { edgeOffsetPx: 2.0 }))
	);

	const phaseSegmentsRecent = $derived(
		runResult.segments
			.map((seg) =>
				seg.filter(
					(s) => s.time >= Math.max(0, cursorTime - recentWindowSpan) && s.time <= cursorTime + 0.02
				)
			)
			.filter((seg) => seg.length > 1)
			.map((seg) => buildPhaseRibbonPaths(seg, PHASE_PLOT_BOX, phaseBounds, { edgeOffsetPx: 2.3 }))
	);

	const phaseSegmentsFuture = $derived(
		runResult.segments
			.map((seg) => seg.filter((s) => s.time >= cursorTime))
			.filter((seg) => seg.length > 1)
			.map((seg) => buildPhaseRibbonPaths(seg, PHASE_PLOT_BOX, phaseBounds, { edgeOffsetPx: 1.6 }))
	);

	const fullPhaseRibbon = $derived(
		runResult.segments.map((seg) =>
			buildPhaseRibbonPaths(seg, PHASE_PLOT_BOX, phaseBounds, { edgeOffsetPx: 2.2 })
		)
	);

	const phaseBaselinePath = $derived(
		runResult.baselineComparisonSamples
			? buildPhaseRibbonPaths(runResult.baselineComparisonSamples, PHASE_PLOT_BOX, phaseBounds, {
					edgeOffsetPx: 0
				}).centrePath
			: ''
	);

	const cursorPhasePt = $derived(
		mapPhaseToScreen(currentSample.prey, currentSample.predator, PHASE_PLOT_BOX, phaseBounds)
	);

	const startPhasePt = $derived(
		mapPhaseToScreen(
			runResult.initialState.N0,
			runResult.initialState.P0,
			PHASE_PLOT_BOX,
			phaseBounds
		)
	);

	const equilibriumPhasePt = $derived(
		runResult.analysis.coexistencePositive
			? mapPhaseToScreen(
					runResult.analysis.equilibriumPrey,
					runResult.analysis.equilibriumPredator,
					PHASE_PLOT_BOX,
					phaseBounds
				)
			: null
	);

	const lagPreyPhasePt = $derived(
		runResult.measuredLag
			? mapPhaseToScreen(
					runResult.measuredLag.preyPeak.prey,
					runResult.measuredLag.preyPeak.predator,
					PHASE_PLOT_BOX,
					phaseBounds
				)
			: null
	);

	const lagPredatorPhasePt = $derived(
		runResult.measuredLag
			? mapPhaseToScreen(
					runResult.measuredLag.predatorPeak.prey,
					runResult.measuredLag.predatorPeak.predator,
					PHASE_PLOT_BOX,
					phaseBounds
				)
			: null
	);

	// Time-history tracks SVG geometry
	const TIME_SVG_W = 920;
	const TIME_SVG_H = 320;
	const PREY_TRACK_BOX = { x: 68, y: 24, width: 824, height: 112 };
	const PRED_TRACK_BOX = { x: 68, y: 168, width: 824, height: 112 };

	const preyTrackSegments = $derived(
		runResult.segments.map((seg) =>
			buildTimeSeriesPath(
				seg,
				(s) => s.prey,
				runResult.duration,
				phaseBounds.maxPrey,
				PREY_TRACK_BOX
			)
		)
	);

	const predatorTrackSegments = $derived(
		runResult.segments.map((seg) =>
			buildTimeSeriesPath(
				seg,
				(s) => s.predator,
				runResult.duration,
				phaseBounds.maxPredator,
				PRED_TRACK_BOX
			)
		)
	);

	const baselinePreyTrackPath = $derived(
		runResult.baselineComparisonSamples
			? buildTimeSeriesPath(
					runResult.baselineComparisonSamples,
					(s) => s.prey,
					runResult.duration,
					phaseBounds.maxPrey,
					PREY_TRACK_BOX
				)
			: ''
	);

	const baselinePredatorTrackPath = $derived(
		runResult.baselineComparisonSamples
			? buildTimeSeriesPath(
					runResult.baselineComparisonSamples,
					(s) => s.predator,
					runResult.duration,
					phaseBounds.maxPredator,
					PRED_TRACK_BOX
				)
			: ''
	);

	const cursorPreyTrackPt = $derived(
		mapTimeValueToScreen(
			currentSample.time,
			currentSample.prey,
			runResult.duration,
			phaseBounds.maxPrey,
			PREY_TRACK_BOX
		)
	);

	const cursorPredTrackPt = $derived(
		mapTimeValueToScreen(
			currentSample.time,
			currentSample.predator,
			runResult.duration,
			phaseBounds.maxPredator,
			PRED_TRACK_BOX
		)
	);

	const lagPreyTimePt = $derived(
		runResult.measuredLag
			? mapTimeValueToScreen(
					runResult.measuredLag.preyPeak.time,
					runResult.measuredLag.preyPeak.prey,
					runResult.duration,
					phaseBounds.maxPrey,
					PREY_TRACK_BOX
				)
			: null
	);

	const lagPredTimePt = $derived(
		runResult.measuredLag
			? mapTimeValueToScreen(
					runResult.measuredLag.predatorPeak.time,
					runResult.measuredLag.predatorPeak.predator,
					runResult.duration,
					phaseBounds.maxPredator,
					PRED_TRACK_BOX
				)
			: null
	);

	function effectiveInterventionTime(): number {
		// Apply interventions at the selected cursor moment if within [4, duration - 16],
		// otherwise at t = 24 so the resulting change and recovery are clearly visible on the chart.
		if (cursorTime >= 4 && cursorTime <= runResult.duration - 16) {
			return Number(cursorTime.toFixed(1));
		}
		return 24.0;
	}

	function selectWorkedSetting(settingId: WorkedSettingId) {
		const preset = WORKED_SETTINGS[settingId];
		earlierParams = { K: controlK, a: controlA };
		baseK = preset.K;
		baseA = preset.a;
		controlK = preset.K;
		controlA = preset.a;
		interventions = [];
		activeWorkedSetting = settingId;
		activePromptId = 'watch-delay';
		cursorTime = settingId === 'k-1.5' ? 32.0 : 28.0;
	}

	function triggerPlayPause() {
		if (!isPlaying && cursorTime >= runResult.duration - 0.5) {
			cursorTime = 0;
		}
		isPlaying = !isPlaying;
	}

	function restartExample() {
		isPlaying = false;
		const targetK = activeWorkedSetting ? WORKED_SETTINGS[activeWorkedSetting].K : 3.0;
		baseK = targetK;
		baseA = DEFAULT_LOOM_PARAMETERS.a;
		controlK = targetK;
		controlA = DEFAULT_LOOM_PARAMETERS.a;
		earlierParams = null;
		interventions = [];
		cursorTime = 28.0;
	}

	function triggerAddFoodBriefly() {
		const tInt = effectiveInterventionTime();
		earlierParams = { K: currentSample.activeK, a: currentSample.activeA };
		interventions = [
			{
				kind: 'food-pulse',
				time: tInt,
				duration: 10,
				kMultiplier: 1.5
			}
		];
		activeWorkedSetting = null;
		cursorTime = Math.min(runResult.duration, tInt + 18);
	}

	function triggerRemovePredators() {
		const tInt = effectiveInterventionTime();
		earlierParams = { K: currentSample.activeK, a: currentSample.activeA };
		interventions = [
			{
				kind: 'predator-removal',
				time: tInt,
				removalFraction: 0.25
			}
		];
		activePromptId = 'disturb-populations';
		activeWorkedSetting = null;
		cursorTime = Math.min(runResult.duration, tInt + 22);
	}

	function applySustainedFoodChange(nextK: number) {
		const clampedK = Math.max(1.0, Math.min(4.5, Number(nextK.toFixed(2))));
		if (Math.abs(clampedK - controlK) < 1e-4) return;
		const prevK = currentSample.activeK;
		const prevA = currentSample.activeA;
		earlierParams = { K: prevK, a: prevA };
		controlK = clampedK;
		activeWorkedSetting = null;

		const tInt = effectiveInterventionTime();
		interventions = [
			{
				kind: 'sustained-food',
				time: tInt,
				targetK: clampedK,
				previousK: prevK
			}
		];
		cursorTime = Math.min(runResult.duration, tInt + 24);
	}

	function applyHuntingEfficiencyChange(nextA: number) {
		const clampedA = Math.max(0.5, Math.min(1.5, Number(nextA.toFixed(2))));
		if (Math.abs(clampedA - controlA) < 1e-4) return;
		const prevK = currentSample.activeK;
		const prevA = currentSample.activeA;
		earlierParams = { K: prevK, a: prevA };
		controlA = clampedA;
		activeWorkedSetting = null;

		const tInt = effectiveInterventionTime();
		interventions = [
			{
				kind: 'hunting-efficiency',
				time: tInt,
				targetA: clampedA,
				previousA: prevA
			}
		];
		cursorTime = Math.min(runResult.duration, tInt + 24);
	}

	function restoreEarlierConditions() {
		const target = earlierParams ?? { K: 1.5, a: 1.0 };
		// Retain the current populations at cursorTime and restore the earlier parameter values from cursorTime onward
		const lastEventTime =
			interventions.length > 0 ? interventions[interventions.length - 1].time : 20;
		const tRestore =
			cursorTime > lastEventTime + 2
				? Number(cursorTime.toFixed(1))
				: Math.min(runResult.duration - 15, lastEventTime + 18);

		controlK = target.K;
		controlA = target.a;

		const filtered = interventions.filter(
			(i) => i.kind !== 'restore-conditions' && i.time < tRestore
		);
		interventions = [
			...filtered,
			{
				kind: 'restore-conditions',
				time: tRestore,
				targetK: target.K,
				targetA: target.a
			}
		];
		cursorTime = Math.min(runResult.duration, tRestore + 20);
	}

	function runGuidedPrompt(promptId: GuidedPromptId) {
		activePromptId = promptId;
		if (promptId === 'watch-delay') {
			baseK = 3.0;
			baseA = 1.0;
			controlK = 3.0;
			controlA = 1.0;
			interventions = [];
			activeWorkedSetting = 'k-3.0';
			cursorTime = 14.0;
			if (!prefersReducedMotion) {
				cursorTime = 0;
				isPlaying = true;
			}
		} else if (promptId === 'disturb-populations') {
			isPlaying = false;
			baseK = 3.0;
			baseA = 1.0;
			controlK = 3.0;
			controlA = 1.0;
			earlierParams = { K: 3.0, a: 1.0 };
			interventions = [
				{
					kind: 'predator-removal',
					time: 22.0,
					removalFraction: 0.25
				}
			];
			activeWorkedSetting = null;
			cursorTime = 48.0;
		} else if (promptId === 'increase-food') {
			isPlaying = false;
			baseK = 1.5;
			baseA = 1.0;
			controlK = 4.0;
			controlA = 1.0;
			earlierParams = { K: 1.5, a: 1.0 };
			interventions = [
				{
					kind: 'sustained-food',
					time: 24.0,
					targetK: 4.0,
					previousK: 1.5
				}
			];
			activeWorkedSetting = null;
			cursorTime = 52.0;
		}
	}

	function loadComparisonCell(K: number, a: number) {
		isPlaying = false;
		earlierParams = { K: controlK, a: controlA };
		baseK = K;
		baseA = a;
		controlK = K;
		controlA = a;
		interventions = [];
		activeWorkedSetting =
			a === 1.0 && K === 1.5
				? 'k-1.5'
				: a === 1.0 && K === 3.0
					? 'k-3.0'
					: a === 1.0 && K === 4.0
						? 'k-4.0'
						: null;
		cursorTime = 36.0;
	}

	function updateTimeFromPointerEvent(e: PointerEvent) {
		if (!timeSvgElement) return;
		const rect = timeSvgElement.getBoundingClientRect();
		if (rect.width <= 0) return;
		const svgX = ((e.clientX - rect.left) / rect.width) * TIME_SVG_W;
		const ratio = Math.max(0, Math.min(1, (svgX - PREY_TRACK_BOX.x) / PREY_TRACK_BOX.width));
		cursorTime = Number((ratio * runResult.duration).toFixed(2));
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const forcedReduced = params.get('motion') === 'reduce';
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = forcedReduced || mediaQuery.matches;

		const handleMediaChange = (ev: MediaQueryListEvent) => {
			prefersReducedMotion = forcedReduced || ev.matches;
			if (prefersReducedMotion) {
				isPlaying = false;
			}
		};
		mediaQuery.addEventListener('change', handleMediaChange);

		const handleVisibilityChange = () => {
			isDocumentVisible = document.visibilityState === 'visible';
			if (!isDocumentVisible) {
				isPlaying = false;
			}
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);

		let observer: IntersectionObserver | null = null;
		if (rootElement && typeof IntersectionObserver !== 'undefined') {
			observer = new IntersectionObserver(
				(entries) => {
					const entry = entries[0];
					if (entry) {
						isVisibleInViewport = entry.isIntersecting;
						if (!entry.isIntersecting) {
							isPlaying = false;
						}
					}
				},
				{ threshold: 0.05 }
			);
			observer.observe(rootElement);
		}

		let rafId = 0;
		let lastFrameTime = performance.now();

		const tick = (now: number) => {
			const dtRealSec = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
			lastFrameTime = now;

			if (isPlaying && isVisibleInViewport && isDocumentVisible && !isScrubbingTime) {
				const nextT = cursorTime + dtRealSec * playbackSpeed;
				if (nextT >= runResult.duration) {
					cursorTime = runResult.duration;
					isPlaying = false;
				} else {
					cursorTime = Number(nextT.toFixed(2));
				}
			}

			rafId = window.requestAnimationFrame(tick);
		};

		rafId = window.requestAnimationFrame(tick);

		return () => {
			window.cancelAnimationFrame(rafId);
			mediaQuery.removeEventListener('change', handleMediaChange);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			observer?.disconnect();
		};
	});
</script>

<div class="ppl-cabinet-frame" bind:this={rootElement} data-testid="predator-prey-loom-app">
	<div class="ppl-chassis">
		<!-- Top instrument bar: status light, worked settings, transport actions -->
		<div class="ppl-seam-bar">
			<div class="ppl-status-module">
				<span
					class="ppl-status-light {runResult.behaviourClass === 'persistent-cycle'
						? 'ppl-status-light--cycle'
						: 'ppl-status-light--settles'}"
					aria-hidden="true"
				></span>
				<span class="ppl-status-badge" data-testid="status-badge">
					{#if runResult.behaviourClass === 'settles'}
						Steady coexistence regime · K = {currentSample.activeK.toFixed(2)} &lt; K_crit = {runResult.analysis.kCritical.toFixed(
							2
						)}
					{:else if runResult.behaviourClass === 'still-settling'}
						Slowly settling regime · K = {currentSample.activeK.toFixed(2)} &lt; K_crit = {runResult.analysis.kCritical.toFixed(
							2
						)}
					{:else}
						Persistent cycle regime · K = {currentSample.activeK.toFixed(2)} &gt; K_crit = {runResult.analysis.kCritical.toFixed(
							2
						)}
					{/if}
				</span>
			</div>

			<div class="ppl-worked-presets" role="group" aria-label="Worked food availability settings">
				<span class="ppl-section-kicker">Worked settings:</span>
				{#each WORKED_SETTING_ORDER as settingId (settingId)}
					{@const preset = WORKED_SETTINGS[settingId]}
					<button
						type="button"
						class="ppl-btn {activeWorkedSetting === settingId ? 'ppl-btn--active' : ''}"
						data-testid={`preset-${settingId}`}
						onclick={() => selectWorkedSetting(settingId)}
					>
						{preset.shortLabel}
					</button>
				{/each}
			</div>

			<div class="ppl-worked-presets" role="group" aria-label="Simulation playback controls">
				<button
					type="button"
					class="ppl-btn ppl-btn--primary"
					data-testid="btn-play-pause"
					onclick={triggerPlayPause}
				>
					{isPlaying ? 'Pause' : 'Play example'}
				</button>
				<button
					type="button"
					class="ppl-btn"
					data-testid="btn-restart-example"
					onclick={restartExample}
				>
					Restart example
				</button>
				<button
					type="button"
					class="ppl-btn"
					data-testid="btn-restore-conditions"
					disabled={!earlierParams && interventions.length === 0}
					onclick={restoreEarlierConditions}
					title="Restore earlier parameter values while retaining the current populations"
				>
					Restore earlier conditions
				</button>
			</div>
		</div>

		<!-- Upper deck: Main Phase Portrait + Controls/Prompts -->
		<div class="ppl-upper-deck">
			<!-- Left column: Main Phase Portrait -->
			<div class="ppl-module" data-testid="phase-portrait-module">
				<div class="ppl-module__header">
					<div>
						<h2 class="ppl-module__title">
							Phase portrait: Prey and predator populations together
						</h2>
						<p class="ppl-module__subtitle">
							Each point records the prey population and predator population at the same moment.
						</p>
					</div>

					<button
						type="button"
						class="ppl-btn"
						style="min-height: 36px; padding: 0.25rem 0.65rem; font-size: 0.78rem;"
						data-testid="btn-toggle-scale"
						onclick={() => (scaleMode = scaleMode === 'fixed' ? 'fit' : 'fixed')}
					>
						{scaleMode === 'fixed'
							? `Scale: Fixed (0–${FIXED_PREY_MAX} N, 0–${FIXED_PREDATOR_MAX} P)`
							: `Scale: Fit to run (0–${phaseBounds.maxPrey} N, 0–${phaseBounds.maxPredator} P)`}
					</button>
				</div>

				<svg
					class="ppl-svg-stage"
					viewBox={`0 0 ${PHASE_SVG_W} ${PHASE_SVG_H}`}
					role="img"
					aria-label={`Phase portrait plotting Prey population on the horizontal axis (0 to ${phaseBounds.maxPrey}) and Predator population on the vertical axis (0 to ${phaseBounds.maxPredator}). Selected moment t = ${currentSample.time.toFixed(1)}: Prey = ${currentSample.prey.toFixed(2)}, Predators = ${currentSample.predator.toFixed(2)}.`}
					data-testid="phase-portrait-svg"
				>
					<!-- Subdued grid lines -->
					{#each [0, 0.25, 0.5, 0.75, 1] as frac (frac)}
						{@const gx = PHASE_PLOT_BOX.x + frac * PHASE_PLOT_BOX.width}
						{@const gy = PHASE_PLOT_BOX.y + (1 - frac) * PHASE_PLOT_BOX.height}
						{@const nTick = (frac * phaseBounds.maxPrey).toFixed(1)}
						{@const pTick = (frac * phaseBounds.maxPredator).toFixed(1)}
						<line
							x1={gx}
							y1={PHASE_PLOT_BOX.y}
							x2={gx}
							y2={PHASE_PLOT_BOX.y + PHASE_PLOT_BOX.height}
							stroke="rgba(180, 191, 188, 0.11)"
							stroke-width="1"
						/>
						<line
							x1={PHASE_PLOT_BOX.x}
							y1={gy}
							x2={PHASE_PLOT_BOX.x + PHASE_PLOT_BOX.width}
							y2={gy}
							stroke="rgba(180, 191, 188, 0.11)"
							stroke-width="1"
						/>
						<text
							x={gx}
							y={PHASE_PLOT_BOX.y + PHASE_PLOT_BOX.height + 20}
							text-anchor="middle"
							fill="#B4BFBC"
							font-family="IBM Plex Mono, monospace"
							font-size="11.5"
						>
							{nTick}
						</text>
						<text
							x={PHASE_PLOT_BOX.x - 10}
							y={gy + 4}
							text-anchor="end"
							fill="#B4BFBC"
							font-family="IBM Plex Mono, monospace"
							font-size="11.5"
						>
							{pTick}
						</text>
					{/each}

					<!-- Plot frame -->
					<rect
						x={PHASE_PLOT_BOX.x}
						y={PHASE_PLOT_BOX.y}
						width={PHASE_PLOT_BOX.width}
						height={PHASE_PLOT_BOX.height}
						fill="none"
						stroke="#2E393F"
						stroke-width="1.5"
					/>

					<!-- Axis titles -->
					<text
						x={PHASE_PLOT_BOX.x + PHASE_PLOT_BOX.width / 2}
						y={PHASE_SVG_H - 12}
						text-anchor="middle"
						fill="#EDF1EE"
						font-size="13"
						font-weight="700"
					>
						Prey population (illustrative density N) → Right means more prey
					</text>
					<text
						x="18"
						y={PHASE_PLOT_BOX.y + PHASE_PLOT_BOX.height / 2}
						text-anchor="middle"
						transform={`rotate(-90 18 ${PHASE_PLOT_BOX.y + PHASE_PLOT_BOX.height / 2})`}
						fill="#EDF1EE"
						font-size="13"
						font-weight="700"
					>
						Predator population (density P) → Up means more predators
					</text>

					<!-- Faint "Without this change" comparison trajectory -->
					{#if phaseBaselinePath}
						<path
							d={phaseBaselinePath}
							fill="none"
							stroke="#B4BFBC"
							stroke-width="1.8"
							stroke-dasharray="6 5"
							opacity="0.55"
							data-testid="phase-baseline-comparison"
						/>
					{/if}

					<!-- Future trajectory beyond cursor (faint guide so full path is always inspectable) -->
					{#each phaseSegmentsFuture as seg, idx (idx)}
						<path
							d={seg.preyEdgePath}
							fill="none"
							stroke="#6EE7B1"
							stroke-width="1.1"
							opacity="0.14"
						/>
						<path
							d={seg.predatorEdgePath}
							fill="none"
							stroke="#FFB15C"
							stroke-width="1.1"
							opacity="0.14"
						/>
						<path
							d={seg.centrePath}
							fill="none"
							stroke="#EDF1EE"
							stroke-width="1.2"
							stroke-dasharray="3 4"
							opacity="0.24"
						/>
					{/each}

					<!-- Subdued older history -->
					{#each phaseSegmentsOlder as seg, idx (idx)}
						<path
							d={seg.preyEdgePath}
							fill="none"
							stroke="#6EE7B1"
							stroke-width="1.4"
							opacity="0.32"
						/>
						<path
							d={seg.predatorEdgePath}
							fill="none"
							stroke="#FFB15C"
							stroke-width="1.4"
							opacity="0.32"
						/>
						<path
							d={seg.centrePath}
							fill="none"
							stroke="#EDF1EE"
							stroke-width="1.5"
							opacity="0.44"
						/>
					{/each}

					<!-- Brighter recent segment leading into selected moment -->
					{#each phaseSegmentsRecent as seg, idx (idx)}
						<path
							d={seg.preyEdgePath}
							fill="none"
							stroke="#6EE7B1"
							stroke-width="1.8"
							opacity="0.82"
						/>
						<path
							d={seg.predatorEdgePath}
							fill="none"
							stroke="#FFB15C"
							stroke-width="1.8"
							opacity="0.82"
						/>
						<path
							d={seg.centrePath}
							fill="none"
							stroke="#EDF1EE"
							stroke-width="2.1"
							opacity="0.96"
						/>
					{/each}

					<!-- Sparse direction arrows along trajectory -->
					{#each fullPhaseRibbon as seg, sIdx (sIdx)}
						{#each seg.arrows as arrow, aIdx (`${sIdx}-${aIdx}`)}
							<g
								transform={`translate(${arrow.x.toFixed(2)} ${arrow.y.toFixed(2)}) rotate(${arrow.angleDeg.toFixed(1)})`}
								opacity={arrow.time <= cursorTime ? '0.92' : '0.42'}
							>
								<path
									d="M -5 -4 L 5 0 L -5 4 Z"
									fill="#EDF1EE"
									stroke="#10171A"
									stroke-width="0.9"
								/>
							</g>
						{/each}
					{/each}

					<!-- Discontinuous jump markers (e.g., Remove 25% of predators) -->
					{#each runResult.jumpMarkers as jump, jIdx (jIdx)}
						{@const fromPt = mapPhaseToScreen(
							jump.fromPrey,
							jump.fromPredator,
							PHASE_PLOT_BOX,
							phaseBounds
						)}
						{@const toPt = mapPhaseToScreen(
							jump.toPrey,
							jump.toPredator,
							PHASE_PLOT_BOX,
							phaseBounds
						)}
						<g data-testid="phase-jump-marker">
							<line
								x1={fromPt.x}
								y1={fromPt.y}
								x2={toPt.x}
								y2={toPt.y}
								stroke="#FFB15C"
								stroke-width="2.2"
								stroke-dasharray="4 3"
							/>
							<circle
								cx={fromPt.x}
								cy={fromPt.y}
								r="4.2"
								fill="#10171A"
								stroke="#FFB15C"
								stroke-width="2"
							/>
							<polygon
								points={`${toPt.x},${toPt.y} ${toPt.x - 4.5},${toPt.y - 7.5} ${toPt.x + 4.5},${toPt.y - 7.5}`}
								fill="#FFB15C"
							/>
							<rect
								x={Math.min(PHASE_PLOT_BOX.x + PHASE_PLOT_BOX.width - 148, toPt.x + 8)}
								y={(fromPt.y + toPt.y) / 2 - 11}
								width="142"
								height="20"
								rx="4"
								fill="rgba(16, 23, 26, 0.92)"
								stroke="#FFB15C"
								stroke-width="1"
							/>
							<text
								x={Math.min(PHASE_PLOT_BOX.x + PHASE_PLOT_BOX.width - 148, toPt.x + 8) + 71}
								y={(fromPt.y + toPt.y) / 2 + 3}
								text-anchor="middle"
								fill="#FFB15C"
								font-family="IBM Plex Mono, monospace"
								font-size="10.5"
								font-weight="700"
							>
								−25% predators (jump)
							</text>
						</g>
					{/each}

					<!-- Continuous intervention markers on phase portrait (e.g., food pulse start/end, K change) -->
					{#each runResult.eventMarkers.filter((m) => m.kind !== 'predator-removal') as marker (marker.id)}
						{@const mPt = mapPhaseToScreen(
							marker.preyAtEvent,
							marker.predatorAtEvent,
							PHASE_PLOT_BOX,
							phaseBounds
						)}
						<g data-testid={`phase-event-${marker.kind}`}>
							<circle
								cx={mPt.x}
								cy={mPt.y}
								r="5"
								fill="#10171A"
								stroke="#EDF1EE"
								stroke-width="2"
							/>
							<text
								x={Math.min(
									PHASE_PLOT_BOX.x + PHASE_PLOT_BOX.width - 65,
									Math.max(PHASE_PLOT_BOX.x + 55, mPt.x)
								)}
								y={Math.max(PHASE_PLOT_BOX.y + 16, mPt.y - 9)}
								text-anchor="middle"
								fill="#EDF1EE"
								font-family="IBM Plex Mono, monospace"
								font-size="10.5"
								font-weight="700"
							>
								{marker.shortLabel}
							</text>
						</g>
					{/each}

					<!-- Coexistence equilibrium crosshair (N*, P*) -->
					{#if equilibriumPhasePt}
						<g opacity="0.82">
							<line
								x1={equilibriumPhasePt.x - 7}
								y1={equilibriumPhasePt.y}
								x2={equilibriumPhasePt.x + 7}
								y2={equilibriumPhasePt.y}
								stroke="#B4BFBC"
								stroke-width="1.4"
							/>
							<line
								x1={equilibriumPhasePt.x}
								y1={equilibriumPhasePt.y - 7}
								x2={equilibriumPhasePt.x}
								y2={equilibriumPhasePt.y + 7}
								stroke="#B4BFBC"
								stroke-width="1.4"
							/>
							<circle
								cx={equilibriumPhasePt.x}
								cy={equilibriumPhasePt.y}
								r="3.5"
								fill={runResult.analysis.isEquilibriumStable ? '#6EE7B1' : '#10171A'}
								stroke="#B4BFBC"
								stroke-width="1.4"
							/>
						</g>
					{/if}

					<!-- Highlighted Prey Peak and Predator Peak linked from time-history tracks -->
					{#if lagPreyPhasePt && runResult.measuredLag}
						<g data-testid="phase-prey-peak-marker">
							<circle
								cx={lagPreyPhasePt.x}
								cy={lagPreyPhasePt.y}
								r="6"
								fill="#6EE7B1"
								stroke="#10171A"
								stroke-width="2"
							/>
							<rect
								x={Math.min(PHASE_PLOT_BOX.x + PHASE_PLOT_BOX.width - 118, lagPreyPhasePt.x + 8)}
								y={Math.max(PHASE_PLOT_BOX.y + 6, lagPreyPhasePt.y - 10)}
								width="112"
								height="20"
								rx="4"
								fill="rgba(16, 23, 26, 0.92)"
								stroke="#6EE7B1"
								stroke-width="1"
							/>
							<text
								x={Math.min(PHASE_PLOT_BOX.x + PHASE_PLOT_BOX.width - 118, lagPreyPhasePt.x + 8) +
									56}
								y={Math.max(PHASE_PLOT_BOX.y + 6, lagPreyPhasePt.y - 10) + 14}
								text-anchor="middle"
								fill="#6EE7B1"
								font-family="IBM Plex Mono, monospace"
								font-size="10.5"
								font-weight="700"
							>
								Prey peak (t={runResult.measuredLag.preyPeak.time.toFixed(1)})
							</text>
						</g>
					{/if}

					{#if lagPredatorPhasePt && runResult.measuredLag}
						<g data-testid="phase-predator-peak-marker">
							<rect
								x={lagPredatorPhasePt.x - 5}
								y={lagPredatorPhasePt.y - 5}
								width="10"
								height="10"
								transform={`rotate(45 ${lagPredatorPhasePt.x} ${lagPredatorPhasePt.y})`}
								fill="#FFB15C"
								stroke="#10171A"
								stroke-width="2"
							/>
							<rect
								x={Math.max(PHASE_PLOT_BOX.x + 6, lagPredatorPhasePt.x - 66)}
								y={Math.max(PHASE_PLOT_BOX.y + 4, lagPredatorPhasePt.y - 28)}
								width="132"
								height="20"
								rx="4"
								fill="rgba(16, 23, 26, 0.92)"
								stroke="#FFB15C"
								stroke-width="1"
							/>
							<text
								x={Math.max(PHASE_PLOT_BOX.x + 6, lagPredatorPhasePt.x - 66) + 66}
								y={Math.max(PHASE_PLOT_BOX.y + 4, lagPredatorPhasePt.y - 28) + 14}
								text-anchor="middle"
								fill="#FFB15C"
								font-family="IBM Plex Mono, monospace"
								font-size="10.5"
								font-weight="700"
							>
								Predator peak (t={runResult.measuredLag.predatorPeak.time.toFixed(1)})
							</text>
						</g>
					{/if}

					<!-- Starting state marker (t = 0) -->
					<circle
						cx={startPhasePt.x}
						cy={startPhasePt.y}
						r="4.2"
						fill="#10171A"
						stroke="#EDF1EE"
						stroke-width="1.8"
					/>
					<text
						x={startPhasePt.x + 8}
						y={startPhasePt.y + 14}
						fill="#B4BFBC"
						font-family="IBM Plex Mono, monospace"
						font-size="10.5"
					>
						Start (t=0)
					</text>

					<!-- Selected moment marker on phase portrait -->
					<g data-testid="phase-selected-moment-marker">
						<circle
							cx={cursorPhasePt.x}
							cy={cursorPhasePt.y}
							r="10"
							fill="rgba(237, 241, 238, 0.16)"
						/>
						<circle
							cx={cursorPhasePt.x}
							cy={cursorPhasePt.y}
							r="5.5"
							fill="#EDF1EE"
							stroke="#10171A"
							stroke-width="2"
						/>
					</g>
				</svg>

				<div class="ppl-caption-bar">
					<p class="ppl-caption-bar__Main" data-testid="phase-portrait-caption">
						Right means more prey. Up means more predators. Follow the arrows to see what changes
						next.
					</p>
					<p class="ppl-caption-bar__Note">
						The ribbon represents one joint trajectory; its constant-width green and amber edges
						have no quantitative meaning.
					</p>
				</div>

				<!-- Computed explanation banner right beside/under phase portrait -->
				<div
					class="ppl-outcome-readout {runResult.behaviourClass === 'persistent-cycle'
						? ''
						: 'ppl-outcome-readout--settles'}"
					data-testid="computed-outcome-readout"
				>
					<p class="ppl-outcome-readout__headline" data-testid="computed-headline">
						{runResult.computedHeadline}
					</p>
					<p class="ppl-outcome-readout__detail">
						{runResult.computedDetail}
					</p>
					<p class="ppl-outcome-readout__recovery" data-testid="recovery-explanation">
						{runResult.recoverySentence}
					</p>
				</div>
			</div>

			<!-- Right column: Worked Example Prompts & Primary Interactions -->
			<div class="ppl-control-column">
				<!-- Worked Example Sequence (Section 8) -->
				<div class="ppl-module">
					<div class="ppl-module__header">
						<h2 class="ppl-module__title">Follow the worked example</h2>
						<span class="ppl-section-kicker">3-step sequence</span>
					</div>

					<div class="ppl-prompts-list">
						{#each GUIDED_PROMPTS as prompt (prompt.id)}
							<div
								class="ppl-prompt-card {activePromptId === prompt.id
									? 'ppl-prompt-card--active'
									: ''}"
							>
								<div class="ppl-prompt-card__top">
									<p class="ppl-prompt-card__title">
										{prompt.stepNumber}. {prompt.title}
									</p>
									<button
										type="button"
										class="ppl-btn"
										style="min-height: 36px; padding: 0.25rem 0.65rem; font-size: 0.78rem;"
										data-testid={`prompt-btn-${prompt.id}`}
										onclick={() => runGuidedPrompt(prompt.id)}
									>
										{prompt.actionLabel}
									</button>
								</div>
								<p class="ppl-prompt-card__desc">{prompt.instruction}</p>
							</div>
						{/each}
					</div>
				</div>

				<!-- Primary Interactions (Section 6) -->
				<div class="ppl-module" data-testid="interactions-panel">
					<div class="ppl-module__header">
						<h2 class="ppl-module__title">Interventions &amp; conditions</h2>
						<span class="ppl-section-kicker">At t = {effectiveInterventionTime().toFixed(1)}</span>
					</div>

					<div class="ppl-action-grid" style="margin-bottom: 0.75rem;">
						<div class="ppl-control-group">
							<button
								type="button"
								class="ppl-btn ppl-btn--prey-action"
								style="width: 100%; justify-content: space-between;"
								data-testid="btn-add-food-briefly"
								onclick={triggerAddFoodBriefly}
							>
								<span>Add food briefly</span>
								<span
									style="font-family: var(--ppl-font-mono); font-size: 0.78rem; color: var(--ppl-prey);"
									>+50% K for 10 units</span
								>
							</button>
							<p class="ppl-control-hint">
								Raises prey carrying capacity by 50% for 10 model-time units, then restores its
								previous value. Food availability is represented by how much prey the environment
								can support; there is no separate simulated food population.
							</p>
						</div>

						<div class="ppl-control-group">
							<button
								type="button"
								class="ppl-btn ppl-btn--predator-action"
								style="width: 100%; justify-content: space-between;"
								data-testid="btn-remove-predators"
								onclick={triggerRemovePredators}
							>
								<span>Remove 25% of predators</span>
								<span
									style="font-family: var(--ppl-font-mono); font-size: 0.78rem; color: var(--ppl-predator);"
									>One-time −25% P</span
								>
							</button>
							<p class="ppl-control-hint">
								Applies a one-time reduction to the current predator population and continues the
								simulation. The removed predators are not returned later; subsequent recovery comes
								from population growth.
							</p>
						</div>
					</div>

					<!-- Sustained Food available (K) slider -->
					<div class="ppl-control-group" style="margin-bottom: 0.65rem;">
						<div class="ppl-control-label-row">
							<label class="ppl-control-label" for="ppl-food-slider">
								Food available (sustained K)
							</label>
							<span
								style="font-family: var(--ppl-font-mono); font-size: 0.82rem; color: var(--ppl-prey);"
							>
								K = {controlK.toFixed(2)}
							</span>
						</div>
						<div class="ppl-control-input-row">
							<input
								id="ppl-food-slider"
								class="ppl-slider"
								type="range"
								min="1.0"
								max="4.5"
								step="0.1"
								value={controlK}
								aria-label="Food available (sustained carrying capacity K)"
								data-testid="slider-food-available"
								oninput={(e) => applySustainedFoodChange(Number(e.currentTarget.value))}
							/>
							<input
								class="ppl-num-input"
								type="number"
								min="1.0"
								max="4.5"
								step="0.1"
								value={controlK}
								aria-label="Food available numeric value"
								data-testid="input-food-available"
								onchange={(e) => applySustainedFoodChange(Number(e.currentTarget.value))}
							/>
						</div>
						<p class="ppl-control-hint">
							Sustained change in how much prey the environment can support, continuing from the
							current populations (distinct from the temporary 10-unit food pulse).
						</p>
					</div>

					<!-- Hunting efficiency (a) slider -->
					<div class="ppl-control-group">
						<div class="ppl-control-label-row">
							<label class="ppl-control-label" for="ppl-hunting-slider">
								Hunting efficiency (a)
							</label>
							<span
								style="font-family: var(--ppl-font-mono); font-size: 0.82rem; color: var(--ppl-predator);"
							>
								a = {controlA.toFixed(2)}
							</span>
						</div>
						<div class="ppl-control-input-row">
							<input
								id="ppl-hunting-slider"
								class="ppl-slider"
								type="range"
								min="0.5"
								max="1.5"
								step="0.05"
								value={controlA}
								aria-label="Hunting efficiency (parameter a)"
								data-testid="slider-hunting-efficiency"
								oninput={(e) => applyHuntingEfficiencyChange(Number(e.currentTarget.value))}
							/>
							<input
								class="ppl-num-input"
								type="number"
								min="0.5"
								max="1.5"
								step="0.05"
								value={controlA}
								aria-label="Hunting efficiency numeric value"
								data-testid="input-hunting-efficiency"
								onchange={(e) => applyHuntingEfficiencyChange(Number(e.currentTarget.value))}
							/>
						</div>
						<p class="ppl-control-hint">
							Controls how effectively predators find and attack prey. Higher hunting efficiency
							lowers the steady prey density (<em>N</em>*) and lowers the enrichment threshold (<em
								>K</em
							><sub>crit</sub>) at which steady coexistence destabilises into cycles.
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Lower deck: Aligned Time-History Tracks ("The two strands of the loom") -->
		<div class="ppl-module ppl-loom-deck" data-testid="time-history-module">
			<div class="ppl-module__header">
				<div>
					<h2 class="ppl-module__title">
						Population histories over time: The two strands of the loom
					</h2>
					<p class="ppl-module__subtitle">
						Shared time axis (0 to {runResult.duration} model-time units). Drag the cursor or use the
						Time control to inspect corresponding values on both strands and the phase ribbon.
					</p>
				</div>
				<span
					class="ppl-status-badge"
					style="font-size: 0.76rem;"
					data-testid="scale-difference-notice"
				>
					Vertical scales differ: Prey 0–{phaseBounds.maxPrey} · Predators 0–{phaseBounds.maxPredator}
				</span>
			</div>

			<!-- Concise text summary of the selected moment and experiment -->
			<div class="ppl-readout-strip" data-testid="selected-moment-summary">
				<span class="ppl-readout-pill">
					<strong>Time:</strong>
					<span>t = {currentSample.time.toFixed(1)} model-time units</span>
				</span>
				<span class="ppl-readout-pill">
					<span class="ppl-swatch-prey" aria-hidden="true"></span>
					<strong>Prey (●):</strong>
					<span style="color: var(--ppl-prey);"
						>{currentSample.prey.toFixed(2)} illustrative density</span
					>
				</span>
				<span class="ppl-readout-pill">
					<span class="ppl-swatch-predator" aria-hidden="true"></span>
					<strong>Predators (◆):</strong>
					<span style="color: var(--ppl-predator);"
						>{currentSample.predator.toFixed(2)} illustrative density</span
					>
				</span>
				{#if runResult.measuredLag}
					<span class="ppl-readout-pill" data-testid="measured-lag-readout">
						<strong>Predators peak later:</strong>
						<span style="color: var(--ppl-predator);">
							+{runResult.measuredLag.lagTime.toFixed(2)} time units after prey peak
						</span>
					</span>
				{/if}
			</div>

			<!-- Accessible Time Scrubber Control -->
			<div
				class="ppl-control-input-row"
				style="margin-bottom: 0.7rem; padding: 0.35rem 0.65rem; background: rgba(28, 35, 39, 0.6); border-radius: 8px;"
			>
				<label class="ppl-control-label" for="ppl-time-slider" style="min-width: 7.5rem;">
					Time cursor (t):
				</label>
				<input
					id="ppl-time-slider"
					class="ppl-slider"
					type="range"
					min="0"
					max={runResult.duration}
					step="0.2"
					value={cursorTime}
					aria-label="Selected moment in model-time units"
					data-testid="slider-time-cursor"
					oninput={(e) => {
						isPlaying = false;
						cursorTime = Number(e.currentTarget.value);
					}}
				/>
				<input
					class="ppl-num-input"
					type="number"
					min="0"
					max={runResult.duration}
					step="0.5"
					value={cursorTime}
					aria-label="Time numeric value in model-time units"
					data-testid="input-time-cursor"
					onchange={(e) => {
						isPlaying = false;
						cursorTime = Math.max(
							0,
							Math.min(runResult.duration, Number(e.currentTarget.value) || 0)
						);
					}}
				/>
			</div>

			<!-- Two aligned time-history tracks SVG -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<svg
				bind:this={timeSvgElement}
				class="ppl-svg-stage"
				viewBox={`0 0 ${TIME_SVG_W} ${TIME_SVG_H}`}
				role="img"
				aria-label={`Aligned time-history tracks for Prey (top, mint green, scale 0 to ${phaseBounds.maxPrey}) and Predators (bottom, warm amber, scale 0 to ${phaseBounds.maxPredator}) across 0 to ${runResult.duration} model-time units.`}
				data-testid="time-history-svg"
				onpointerdown={(e) => {
					isPlaying = false;
					isScrubbingTime = true;
					e.currentTarget.setPointerCapture(e.pointerId);
					updateTimeFromPointerEvent(e);
				}}
				onpointermove={(e) => {
					if (isScrubbingTime) updateTimeFromPointerEvent(e);
				}}
				onpointerup={() => {
					isScrubbingTime = false;
				}}
				onpointercancel={() => {
					isScrubbingTime = false;
				}}
			>
				<!-- Occasional fine vertical warp guides connecting corresponding times across both tracks -->
				{#each [0, 10, 20, 30, 40, 50, 60, 70, 80] as tGuide (tGuide)}
					{@const gx = PREY_TRACK_BOX.x + (tGuide / runResult.duration) * PREY_TRACK_BOX.width}
					<line
						x1={gx}
						y1={PREY_TRACK_BOX.y}
						x2={gx}
						y2={PRED_TRACK_BOX.y + PRED_TRACK_BOX.height}
						stroke="rgba(180, 191, 188, 0.12)"
						stroke-width="1"
					/>
					<text
						x={gx}
						y={PRED_TRACK_BOX.y + PRED_TRACK_BOX.height + 20}
						text-anchor="middle"
						fill="#B4BFBC"
						font-family="IBM Plex Mono, monospace"
						font-size="11"
					>
						{tGuide}
					</text>
				{/each}

				<!-- Top Track: Prey (N) -->
				<rect
					x={PREY_TRACK_BOX.x}
					y={PREY_TRACK_BOX.y}
					width={PREY_TRACK_BOX.width}
					height={PREY_TRACK_BOX.height}
					fill="rgba(110, 231, 177, 0.02)"
					stroke="#2E393F"
					stroke-width="1.2"
				/>
				{#each [0, 0.5, 1] as vFrac (vFrac)}
					{@const gy = PREY_TRACK_BOX.y + (1 - vFrac) * PREY_TRACK_BOX.height}
					<line
						x1={PREY_TRACK_BOX.x}
						y1={gy}
						x2={PREY_TRACK_BOX.x + PREY_TRACK_BOX.width}
						y2={gy}
						stroke="rgba(180, 191, 188, 0.08)"
					/>
					<text
						x={PREY_TRACK_BOX.x - 8}
						y={gy + 4}
						text-anchor="end"
						fill="#6EE7B1"
						font-family="IBM Plex Mono, monospace"
						font-size="10.5"
					>
						{(vFrac * phaseBounds.maxPrey).toFixed(1)}
					</text>
				{/each}
				<text
					x={PREY_TRACK_BOX.x + 10}
					y={PREY_TRACK_BOX.y + 16}
					fill="#6EE7B1"
					font-size="12"
					font-weight="700"
				>
					Prey (● density 0–{phaseBounds.maxPrey})
				</text>

				<!-- Bottom Track: Predators (P) -->
				<rect
					x={PRED_TRACK_BOX.x}
					y={PRED_TRACK_BOX.y}
					width={PRED_TRACK_BOX.width}
					height={PRED_TRACK_BOX.height}
					fill="rgba(255, 177, 92, 0.02)"
					stroke="#2E393F"
					stroke-width="1.2"
				/>
				{#each [0, 0.5, 1] as vFrac (vFrac)}
					{@const gy = PRED_TRACK_BOX.y + (1 - vFrac) * PRED_TRACK_BOX.height}
					<line
						x1={PRED_TRACK_BOX.x}
						y1={gy}
						x2={PRED_TRACK_BOX.x + PRED_TRACK_BOX.width}
						y2={gy}
						stroke="rgba(180, 191, 188, 0.08)"
					/>
					<text
						x={PRED_TRACK_BOX.x - 8}
						y={gy + 4}
						text-anchor="end"
						fill="#FFB15C"
						font-family="IBM Plex Mono, monospace"
						font-size="10.5"
					>
						{(vFrac * phaseBounds.maxPredator).toFixed(1)}
					</text>
				{/each}
				<text
					x={PRED_TRACK_BOX.x + 10}
					y={PRED_TRACK_BOX.y + 16}
					fill="#FFB15C"
					font-size="12"
					font-weight="700"
				>
					Predators (◆ density 0–{phaseBounds.maxPredator})
				</text>

				<!-- Shared Time Axis title -->
				<text
					x={PREY_TRACK_BOX.x + PREY_TRACK_BOX.width / 2}
					y={TIME_SVG_H - 4}
					text-anchor="middle"
					fill="#EDF1EE"
					font-size="12.5"
					font-weight="700"
				>
					Time (model-time units)
				</text>

				<!-- Food pulse shaded window if active -->
				{#each runResult.eventMarkers.filter((m) => m.kind === 'food-pulse' && m.endTime !== undefined) as pulse (pulse.id)}
					{@const xStart =
						PREY_TRACK_BOX.x + (pulse.time / runResult.duration) * PREY_TRACK_BOX.width}
					{@const xEnd =
						PREY_TRACK_BOX.x +
						((pulse.endTime ?? pulse.time) / runResult.duration) * PREY_TRACK_BOX.width}
					<rect
						x={xStart}
						y={PREY_TRACK_BOX.y}
						width={Math.max(2, xEnd - xStart)}
						height={PRED_TRACK_BOX.y + PRED_TRACK_BOX.height - PREY_TRACK_BOX.y}
						fill="rgba(110, 231, 177, 0.09)"
						stroke="#6EE7B1"
						stroke-dasharray="3 3"
						stroke-width="1"
						data-testid="time-pulse-band"
					/>
					<text
						x={(xStart + xEnd) / 2}
						y={PREY_TRACK_BOX.y + PREY_TRACK_BOX.height + 16}
						text-anchor="middle"
						fill="#6EE7B1"
						font-family="IBM Plex Mono, monospace"
						font-size="10.5"
						font-weight="700"
					>
						+50% food pulse ({pulse.time.toFixed(0)}–{(pulse.endTime ?? pulse.time).toFixed(0)})
					</text>
				{/each}

				<!-- Other intervention vertical markers on time tracks -->
				{#each runResult.eventMarkers as ev (ev.id)}
					{@const ex = PREY_TRACK_BOX.x + (ev.time / runResult.duration) * PREY_TRACK_BOX.width}
					<line
						x1={ex}
						y1={PREY_TRACK_BOX.y}
						x2={ex}
						y2={PRED_TRACK_BOX.y + PRED_TRACK_BOX.height}
						stroke="#EDF1EE"
						stroke-width="1.2"
						stroke-dasharray="4 3"
						opacity="0.7"
					/>
				{/each}

				<!-- Faint "Without this change" baseline comparison traces on both tracks -->
				{#if baselinePreyTrackPath}
					<path
						d={baselinePreyTrackPath}
						fill="none"
						stroke="#B4BFBC"
						stroke-width="1.6"
						stroke-dasharray="5 4"
						opacity="0.6"
						data-testid="time-baseline-prey"
					/>
				{/if}
				{#if baselinePredatorTrackPath}
					<path
						d={baselinePredatorTrackPath}
						fill="none"
						stroke="#B4BFBC"
						stroke-width="1.6"
						stroke-dasharray="5 4"
						opacity="0.6"
						data-testid="time-baseline-predator"
					/>
				{/if}

				<!-- Prey and Predator time-history traces -->
				{#each preyTrackSegments as segPath, idx (idx)}
					<path d={segPath} fill="none" stroke="#6EE7B1" stroke-width="2.3" />
				{/each}
				{#each predatorTrackSegments as segPath, idx (idx)}
					<path d={segPath} fill="none" stroke="#FFB15C" stroke-width="2.3" />
				{/each}

				<!-- Predator one-time removal jump connector on Predator track -->
				{#each runResult.jumpMarkers as jump, jIdx (jIdx)}
					{@const fromPt = mapTimeValueToScreen(
						jump.time,
						jump.fromPredator,
						runResult.duration,
						phaseBounds.maxPredator,
						PRED_TRACK_BOX
					)}
					{@const toPt = mapTimeValueToScreen(
						jump.time,
						jump.toPredator,
						runResult.duration,
						phaseBounds.maxPredator,
						PRED_TRACK_BOX
					)}
					<g data-testid="time-predator-jump-marker">
						<line
							x1={fromPt.x}
							y1={fromPt.y}
							x2={toPt.x}
							y2={toPt.y}
							stroke="#FFB15C"
							stroke-width="2.2"
							stroke-dasharray="3 2"
						/>
						<circle
							cx={fromPt.x}
							cy={fromPt.y}
							r="3.8"
							fill="#10171A"
							stroke="#FFB15C"
							stroke-width="2"
						/>
						<circle cx={toPt.x} cy={toPt.y} r="3.8" fill="#FFB15C" />
						<text
							x={Math.min(PRED_TRACK_BOX.x + PRED_TRACK_BOX.width - 70, toPt.x + 8)}
							y={(fromPt.y + toPt.y) / 2 + 4}
							fill="#FFB15C"
							font-family="IBM Plex Mono, monospace"
							font-size="10.5"
							font-weight="700"
						>
							−25% jump
						</text>
					</g>
				{/each}

				<!-- Highlighted Prey peak, Predator peak, and measured lag interval between them -->
				{#if runResult.measuredLag && lagPreyTimePt && lagPredTimePt}
					{@const midLagX = (lagPreyTimePt.x + lagPredTimePt.x) / 2}
					{@const bannerY = PREY_TRACK_BOX.y + PREY_TRACK_BOX.height + 6}
					<g data-testid="time-measured-lag-annotation">
						<rect
							x={lagPreyTimePt.x}
							y={PREY_TRACK_BOX.y}
							width={Math.max(2, lagPredTimePt.x - lagPreyTimePt.x)}
							height={PRED_TRACK_BOX.y + PRED_TRACK_BOX.height - PREY_TRACK_BOX.y}
							fill="rgba(255, 177, 92, 0.08)"
						/>
						<line
							x1={lagPreyTimePt.x}
							y1={lagPreyTimePt.y}
							x2={lagPreyTimePt.x}
							y2={PRED_TRACK_BOX.y + PRED_TRACK_BOX.height}
							stroke="#6EE7B1"
							stroke-width="1.3"
							stroke-dasharray="3 3"
						/>
						<line
							x1={lagPredTimePt.x}
							y1={PREY_TRACK_BOX.y}
							x2={lagPredTimePt.x}
							y2={lagPredTimePt.y}
							stroke="#FFB15C"
							stroke-width="1.3"
							stroke-dasharray="3 3"
						/>
						<circle
							cx={lagPreyTimePt.x}
							cy={lagPreyTimePt.y}
							r="5.2"
							fill="#6EE7B1"
							stroke="#10171A"
							stroke-width="1.8"
						/>
						<rect
							x={lagPredTimePt.x - 4.5}
							y={lagPredTimePt.y - 4.5}
							width="9"
							height="9"
							transform={`rotate(45 ${lagPredTimePt.x} ${lagPredTimePt.y})`}
							fill="#FFB15C"
							stroke="#10171A"
							stroke-width="1.8"
						/>
						<!-- Lag connector bracket between the two tracks -->
						<line
							x1={lagPreyTimePt.x}
							y1={bannerY + 10}
							x2={lagPredTimePt.x}
							y2={bannerY + 10}
							stroke="#FFB15C"
							stroke-width="2"
						/>
						<rect
							x={midLagX - 108}
							y={bannerY - 1}
							width="216"
							height="20"
							rx="4"
							fill="#10171A"
							stroke="#FFB15C"
							stroke-width="1"
						/>
						<text
							x={midLagX}
							y={bannerY + 13}
							text-anchor="middle"
							fill="#FFB15C"
							font-family="IBM Plex Mono, monospace"
							font-size="10.5"
							font-weight="700"
						>
							Predators peak later (+{runResult.measuredLag.lagTime.toFixed(1)} units)
						</text>
					</g>
				{/if}

				<!-- Shared Cursor linking both tracks to the phase portrait -->
				<g data-testid="time-shared-cursor">
					<line
						x1={cursorPreyTrackPt.x}
						y1={PREY_TRACK_BOX.y}
						x2={cursorPreyTrackPt.x}
						y2={PRED_TRACK_BOX.y + PRED_TRACK_BOX.height}
						stroke="#EDF1EE"
						stroke-width="1.8"
					/>
					<circle
						cx={cursorPreyTrackPt.x}
						cy={cursorPreyTrackPt.y}
						r="5.5"
						fill="#6EE7B1"
						stroke="#10171A"
						stroke-width="2"
					/>
					<rect
						x={cursorPredTrackPt.x - 5}
						y={cursorPredTrackPt.y - 5}
						width="10"
						height="10"
						transform={`rotate(45 ${cursorPredTrackPt.x} ${cursorPredTrackPt.y})`}
						fill="#FFB15C"
						stroke="#10171A"
						stroke-width="2"
					/>
				</g>
			</svg>
		</div>

		<!-- Expandable 3x3 Comparison Grid (Section 9) -->
		<details class="ppl-collapsible" open data-testid="compare-conditions-section">
			<summary class="ppl-collapsible__summary">
				<span>Compare conditions: Which combinations settle down, and which keep cycling?</span>
				<span class="ppl-section-kicker">3 × 3 grid (click any panel to load)</span>
			</summary>
			<div class="ppl-collapsible__body">
				<p style="margin: 0 0 0.65rem; font-size: 0.86rem; color: var(--ppl-text-secondary);">
					Every panel below runs from the same starting populations (<em>N</em><sub>0</sub> = 1.0,
					<em>P</em><sub>0</sub> = 0.6) for <em>T</em> = 120 model-time units on identical axes (<em
						>N</em
					>
					∈ [0, 3.6], <em>P</em> ∈ [0, 2.4]). Columns increase <strong>Food available</strong> (<em
						>K</em
					>
					= 1.5, 3, 4); rows increase <strong>Hunting efficiency</strong> (<em>a</em> = 0.75, 1,
					1.25). Analytical Jacobian checks are combined with the numerical run so slow convergence
					near a stability boundary (such as <em>a</em> = 0.75, <em>K</em> = 3, where <em>K</em><sub
						>crit</sub
					>
					≈ 3.11) is distinguished from a persistent cycle.
				</p>

				<div class="ppl-comparison-grid" role="group" aria-label="3 by 3 condition comparison grid">
					{#each comparisonGrid as row (row[0].a)}
						{#each row as cell (`${cell.a}-${cell.K}`)}
							{@const miniBox = { x: 26, y: 12, width: 184, height: 108 }}
							{@const miniRibbon = buildPhaseRibbonPaths(
								cell.run.samples,
								miniBox,
								{ maxPrey: FIXED_PREY_MAX, maxPredator: FIXED_PREDATOR_MAX },
								{ edgeOffsetPx: 1.4, arrowSpacingPx: 95, decimateEvery: 4 }
							)}
							{@const miniEq = mapPhaseToScreen(
								cell.run.analysis.equilibriumPrey,
								cell.run.analysis.equilibriumPredator,
								miniBox,
								{ maxPrey: FIXED_PREY_MAX, maxPredator: FIXED_PREDATOR_MAX }
							)}
							{@const isSelected =
								Math.abs(controlK - cell.K) < 0.02 &&
								Math.abs(controlA - cell.a) < 0.02 &&
								interventions.length === 0}
							<button
								type="button"
								class="ppl-grid-card {isSelected ? 'ppl-grid-card--selected' : ''}"
								data-testid={`comparison-cell-a${cell.a}-k${cell.K}`}
								onclick={() => loadComparisonCell(cell.K, cell.a)}
							>
								<div class="ppl-grid-card__top">
									<span class="ppl-grid-card__coords">
										Food K = {cell.K} · Hunting a = {cell.a}
									</span>
									<span class="ppl-grid-card__badge ppl-grid-card__badge--{cell.behaviourClass}">
										{cell.badgeLabel}
									</span>
								</div>

								<svg
									viewBox="0 0 220 132"
									style="width: 100%; height: auto; background: #10171A; border: 1px solid #2E393F; border-radius: 6px;"
									aria-hidden="true"
								>
									<rect
										x={miniBox.x}
										y={miniBox.y}
										width={miniBox.width}
										height={miniBox.height}
										fill="none"
										stroke="#263137"
									/>
									<path
										d={miniRibbon.preyEdgePath}
										fill="none"
										stroke="#6EE7B1"
										stroke-width="1.1"
										opacity="0.55"
									/>
									<path
										d={miniRibbon.predatorEdgePath}
										fill="none"
										stroke="#FFB15C"
										stroke-width="1.1"
										opacity="0.55"
									/>
									<path
										d={miniRibbon.centrePath}
										fill="none"
										stroke="#EDF1EE"
										stroke-width="1.35"
									/>
									<circle
										cx={miniEq.x}
										cy={miniEq.y}
										r="3"
										fill={cell.run.analysis.isEquilibriumStable ? '#6EE7B1' : '#10171A'}
										stroke="#FFB15C"
										stroke-width="1.2"
									/>
								</svg>

								<p class="ppl-grid-card__note">{cell.stabilityNote}</p>
							</button>
						{/each}
					{/each}
				</div>
			</div>
		</details>

		<!-- Expandable How the model works section (Section 7) -->
		<details class="ppl-collapsible" data-testid="how-model-works-section">
			<summary class="ppl-collapsible__summary">
				<span>How the model works: Rosenzweig–MacArthur equations &amp; stability threshold</span>
				<span class="ppl-section-kicker">Equations &amp; parameters</span>
			</summary>
			<div class="ppl-collapsible__body">
				<p style="margin: 0 0 0.5rem; color: var(--ppl-text-secondary);">
					The visualisation solves the autonomous two-variable <strong>Rosenzweig–MacArthur</strong>
					predator–prey model with logistic prey growth and a saturating (Holling type II) predation rate:
				</p>

				<div class="ppl-math-block">
					<div>dN / dt = r · N · (1 − N / K) − (a · N · P) / (1 + a · h · N)</div>
					<div style="margin-top: 0.35rem;">
						dP / dt = e · (a · N · P) / (1 + a · h · N) − m · P
					</div>
				</div>

				<p style="margin: 0.55rem 0; color: var(--ppl-text-secondary); font-size: 0.85rem;">
					Coexistence equilibrium occurs at <code>N* = m / (a · (e − m · h))</code> and
					<code>P* = (r / a) · (1 − N* / K) · (1 + a · h · N*)</code>. It loses stability via a Hopf
					bifurcation at the critical carrying capacity
					<code>K<sub>crit</sub> = (e + m · h) / (a · h · (e − m · h))</code>. For the starting
					configuration (<em>r</em> = 1, <em>h</em> = 1, <em>e</em> = 0.5, <em>m</em> = 0.2,
					<em>a</em> = 1), <code>N* = 2/3 ≈ 0.67</code> and
					<code>K<sub>crit</sub> = 7/3 ≈ 2.33</code>: below 7/3 trajectories spiral into steady
					coexistence; above 7/3 they approach a stable repeating cycle (the paradox of enrichment).
				</p>

				<table class="ppl-param-table">
					<thead>
						<tr>
							<th>Symbol</th>
							<th>Parameter</th>
							<th>Starting value</th>
							<th>Role in the model</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><code>N(0), P(0)</code></td>
							<td>Initial prey &amp; predators</td>
							<td><code>1.0, 0.6</code></td>
							<td>Starting illustrative population densities at <em>t</em> = 0.</td>
						</tr>
						<tr>
							<td><code>K</code></td>
							<td>Food available (carrying capacity)</td>
							<td><code>1.5 / 3.0 / 4.0</code></td>
							<td>Maximum prey density supported by the environment in the absence of predators.</td
							>
						</tr>
						<tr>
							<td><code>a</code></td>
							<td>Hunting efficiency</td>
							<td><code>1.0</code></td>
							<td>Search and attack efficiency per predator per model-time unit.</td>
						</tr>
						<tr>
							<td><code>h</code></td>
							<td>Handling time</td>
							<td><code>1.0</code></td>
							<td
								>Time spent pursuing and digesting each unit of prey, causing predation to saturate.</td
							>
						</tr>
						<tr>
							<td><code>r</code></td>
							<td>Prey growth rate</td>
							<td><code>1.0</code></td>
							<td>Intrinsic per-capita growth rate of prey at low density.</td>
						</tr>
						<tr>
							<td><code>e</code></td>
							<td>Conversion efficiency</td>
							<td><code>0.5</code></td>
							<td>Proportion of consumed prey biomass converted into new predator density.</td>
						</tr>
						<tr>
							<td><code>m</code></td>
							<td>Predator mortality</td>
							<td><code>0.2</code></td>
							<td>Per-capita predator decline rate in the absence of prey.</td>
						</tr>
					</tbody>
				</table>

				<p style="margin: 0.7rem 0 0; font-size: 0.82rem; color: var(--ppl-text-secondary);">
					<strong>Modelling scope:</strong> Populations are continuous illustrative densities rather
					than discrete counts of individual animals, and low troughs in a deterministic ODE do not
					by themselves establish extinction, which in real ecosystems also depends on demographic
					chance, spatial refuges, and alternative food sources. References:
					<a
						href="https://link.springer.com/book/10.1007/b98868"
						target="_blank"
						rel="noopener noreferrer"
						style="color: var(--ppl-text);">J. D. Murray, Mathematical Biology I (Chapter 3)</a
					>;
					<a
						href="https://pubmed.ncbi.nlm.nih.gov/5538935/"
						target="_blank"
						rel="noopener noreferrer"
						style="color: var(--ppl-text);">M. L. Rosenzweig (1971), Paradox of Enrichment</a
					>;
					<a
						href="https://pmc.ncbi.nlm.nih.gov/articles/PMC7848735/"
						target="_blank"
						rel="noopener noreferrer"
						style="color: var(--ppl-text)">Rosenzweig–MacArthur stability analysis (PMC7848735)</a
					>.
				</p>
			</div>
		</details>
	</div>
</div>
