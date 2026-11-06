<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DEFAULT_DISTURBANCE_AMPLITUDE,
		DEFAULT_GRID_SPACING,
		DEFAULT_OBSERVATION_TIME,
		DEFAULT_SEED,
		DEFAULT_TIMESTEP,
		DOMAIN_SHAPES,
		DOMAIN_SHAPE_ORDER,
		FIXED_ACTIVATOR_DIFFUSION,
		FIXED_SIGNAL_SCALE_LIMIT,
		PRESET_ORDER,
		SPOT_STRIPE_PRESETS,
		SpotStripeWorkerClient,
		SynchronisedComparisonEngine,
		analyzeDomainModes,
		configFromPreset,
		renderFieldToRgba,
		solveUniformEquilibrium,
		type ComparisonSnapshot,
		type DomainShapeId,
		type PlaybackSpeed,
		type PresetId,
		type RunStatus,
		type SimulationSnapshot,
		type ViewMode,
		type WorkerResponseMessage
	} from '$lib/visualizations/how-spots-and-stripes-form';
	import './spots-and-stripes.css';

	interface Props {
		initialReducedMotion?: boolean;
	}

	let { initialReducedMotion = false }: Props = $props();

	function buildInitialPreview(): ComparisonSnapshot {
		const engine = new SynchronisedComparisonEngine(configFromPreset('spots'));
		const totalSteps = Math.round(DEFAULT_OBSERVATION_TIME / DEFAULT_TIMESTEP);
		engine.step(totalSteps);
		return engine.snapshot();
	}

	const initialComparison = buildInitialPreview();

	let comparison = $state<ComparisonSnapshot>(initialComparison);
	let status = $state<RunStatus>('preview');
	let presetId = $state<PresetId | 'custom'>('spots');
	let k = $state<number>(SPOT_STRIPE_PRESETS.spots.patternBalance);
	let diffusionRatio = $state<number>(SPOT_STRIPE_PRESETS.spots.inhibitorRatio);
	let domainId = $state<DomainShapeId>('broad-sheet');
	let seed = $state<number>(DEFAULT_SEED);
	let disturbanceAmplitude = $state<number>(DEFAULT_DISTURBANCE_AMPLITUDE);
	let compareEqualSpreading = $state<boolean>(false);
	let viewMode = $state<ViewMode>('activator');
	let pigmentThreshold = $state<number>(0.0);
	let playbackSpeed = $state<PlaybackSpeed>(1);
	let reducedMotion = $state<boolean>(false);
	let isVisibleInViewport = $state<boolean>(true);
	let isDocumentVisible = $state<boolean>(true);
	let restartNotice = $state<string>('');
	let restartCount = $state<number>(0);
	let errorMessage = $state<string | null>(null);
	let viewportWidth = $state<number>(640);

	let rootEl: HTMLElement | undefined = $state();
	let primaryCanvas: HTMLCanvasElement | undefined = $state();
	let equalCanvas: HTMLCanvasElement | undefined = $state();
	let workerClient: SpotStripeWorkerClient | null = null;
	let rafId: number | null = null;

	const domainSpec = $derived(DOMAIN_SHAPES[domainId]);
	const equilibriumS = $derived(solveUniformEquilibrium(k));
	const dvValue = $derived(FIXED_ACTIVATOR_DIFFUSION * diffusionRatio);
	const modeAnalysis = $derived(
		analyzeDomainModes({
			patternBalance: k,
			inhibitorRatio: diffusionRatio,
			shape: domainId
		})
	);

	const comparisonVerdict = $derived.by(() => {
		const diffStd = comparison.different.summary.stdU;
		const eqStd = comparison.equal.summary.stdU;
		const t = comparison.different.modelTime;
		if (t < 0.05) {
			return `Both patches start from the identical seeded disturbance around equilibrium s = ${formatSigned(equilibriumS, 3)} (initial variation σu = ${diffStd.toFixed(4)}). Press Grow from noise or Step to watch the two fields diverge.`;
		}
		if (diffusionRatio <= 1.05) {
			return `Both fields have nearly equal spreading rates (${diffusionRatio}× vs 1×). Without faster inhibitor spreading, local peaks cannot trap themselves and both fields smooth back towards the uniform equilibrium s = ${formatSigned(equilibriumS, 3)}.`;
		}
		if (diffStd > 0.12 && eqStd < 0.015) {
			return `At model time t = ${t.toFixed(1)}, spatial variation in the ${diffusionRatio}× field has grown to σu = ${diffStd.toFixed(3)} (forming high- and low-signal regions), whereas the equal-spreading (1×) field has faded to σu = ${eqStd.toFixed(4)}—an almost uniform surface.`;
		}
		return comparison.verdict;
	});

	const statusLabel = $derived.by(() => {
		if (status === 'error') return 'Error';
		if (status === 'running') return 'Running';
		if (status === 'finished') return 'Finished';
		if (status === 'preview') return 'Paused (computed example)';
		return 'Paused';
	});

	const statusDotClass = $derived.by(() => {
		if (status === 'error') return 'error';
		if (status === 'running') return 'running';
		if (status === 'finished') return 'finished';
		return 'paused';
	});

	function formatSigned(value: number, digits = 3): string {
		if (Math.abs(value) < 1e-9) {
			return (0).toFixed(digits);
		}
		const sign = value > 0 ? '+' : '−';
		return `${sign}${Math.abs(value).toFixed(digits)}`;
	}

	function drawSnapshotToCanvas(
		canvas: HTMLCanvasElement | undefined,
		snapshot: SimulationSnapshot,
		mode: ViewMode,
		threshold: number
	): void {
		if (!canvas) return;
		if (canvas.width !== snapshot.nx || canvas.height !== snapshot.ny) {
			canvas.width = snapshot.nx;
			canvas.height = snapshot.ny;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const rgba = renderFieldToRgba(snapshot, {
			viewMode: mode,
			pigmentThreshold: threshold,
			scaleLimit: FIXED_SIGNAL_SCALE_LIMIT
		});
		const imageData = ctx.createImageData(snapshot.nx, snapshot.ny);
		imageData.data.set(rgba);
		ctx.putImageData(imageData, 0, 0);
	}

	$effect(() => {
		if (initialReducedMotion) {
			reducedMotion = true;
		}
	});

	$effect(() => {
		const current = comparison;
		const currentMode = viewMode;
		const currentThreshold = pigmentThreshold;
		const showEqual = compareEqualSpreading;
		drawSnapshotToCanvas(primaryCanvas, current.different, currentMode, currentThreshold);
		if (showEqual) {
			drawSnapshotToCanvas(equalCanvas, current.equal, currentMode, currentThreshold);
		}
	});

	function stopAnimationLoop(): void {
		if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function scheduleNextFrame(): void {
		if (rafId !== null || typeof requestAnimationFrame === 'undefined') return;
		if (status !== 'running' || !isVisibleInViewport || !isDocumentVisible) return;
		rafId = requestAnimationFrame(() => {
			rafId = null;
			advanceSimulationTick();
		});
	}

	function advanceSimulationTick(): void {
		if (status !== 'running' || !workerClient || workerClient.isBusy) return;
		if (!isVisibleInViewport || !isDocumentVisible) return;

		const baseSteps = 20;
		const stepsToRun = baseSteps * playbackSpeed;
		workerClient.step(stepsToRun);
	}

	function handleWorkerResponse(response: WorkerResponseMessage): void {
		if (response.comparison) {
			comparison = response.comparison;
		}
		const diffSnap = response.comparison?.different ?? response.primary;
		const eqSnap = response.comparison?.equal ?? response.primary;

		if (!diffSnap.summary.finite || !eqSnap.summary.finite) {
			status = 'error';
			errorMessage =
				diffSnap.summary.errorReason ??
				eqSnap.summary.errorReason ??
				'The numerical state exceeded finite bounds. Press Restart to restore the verified equilibrium disturbance.';
			stopAnimationLoop();
			return;
		}

		if (diffSnap.modelTime >= DEFAULT_OBSERVATION_TIME) {
			status = 'finished';
			stopAnimationLoop();
			return;
		}

		if (status === 'running' && isVisibleInViewport && isDocumentVisible) {
			scheduleNextFrame();
		}
	}

	function currentConfig() {
		return {
			presetId,
			patternBalance: k,
			inhibitorRatio: diffusionRatio,
			shape: domainId,
			seed,
			disturbanceAmplitude,
			timestep: DEFAULT_TIMESTEP,
			observationTime: DEFAULT_OBSERVATION_TIME
		};
	}

	function resetSimulationToSeed(options: {
		autoRun: boolean;
		notice: string;
		isRestartCounted?: boolean;
		evolveToObservationTime?: boolean;
	}): void {
		stopAnimationLoop();
		errorMessage = null;
		restartNotice = options.notice;
		if (options.isRestartCounted) {
			restartCount += 1;
		}

		const evolveToEnd = Boolean(options.evolveToObservationTime);
		if (evolveToEnd) {
			status = 'finished';
		} else if (options.autoRun && !reducedMotion) {
			status = 'running';
		} else {
			status = 'paused';
		}

		if (workerClient) {
			workerClient.init({
				config: currentConfig(),
				compareEqualSpreading: true,
				evolveToObservationTime: evolveToEnd
			});
		} else {
			const engine = new SynchronisedComparisonEngine(currentConfig());
			if (evolveToEnd) {
				engine.step(Math.round(DEFAULT_OBSERVATION_TIME / DEFAULT_TIMESTEP));
			}
			comparison = engine.snapshot();
		}

		if (status === 'running') {
			scheduleNextFrame();
		}
	}

	function handleGrowFromNoise(): void {
		stopAnimationLoop();
		errorMessage = null;
		restartNotice = `Growing from tiny seeded disturbances (seed ${seed}) around uniform equilibrium s = ${formatSigned(equilibriumS, 3)}.`;
		status = 'running';
		if (workerClient) {
			workerClient.init({
				config: currentConfig(),
				compareEqualSpreading: true,
				evolveToObservationTime: false
			});
		}
		scheduleNextFrame();
	}

	function handlePauseContinue(): void {
		if (status === 'running') {
			status = 'paused';
			stopAnimationLoop();
			restartNotice = `Paused at model time t = ${comparison.different.modelTime.toFixed(1)}.`;
			return;
		}
		if (status === 'preview' || status === 'finished') {
			handleGrowFromNoise();
			return;
		}
		status = 'running';
		restartNotice = `Continuing evolution from model time t = ${comparison.different.modelTime.toFixed(1)}.`;
		scheduleNextFrame();
	}

	function handleRestart(): void {
		resetSimulationToSeed({
			autoRun: !reducedMotion && status === 'running',
			notice: `Experiment restarted from the same seed (${seed}) at t = 0.0.`,
			isRestartCounted: true
		});
	}

	function handleStepManual(steps = 100): void {
		if (!workerClient || workerClient.isBusy) return;
		stopAnimationLoop();
		errorMessage = null;
		if (status === 'preview') {
			workerClient.init({
				config: currentConfig(),
				compareEqualSpreading: true,
				evolveToObservationTime: false
			});
		}
		status = 'paused';
		workerClient.step(steps);
		restartNotice = `Advanced simulation by ${(steps * DEFAULT_TIMESTEP).toFixed(1)} model time units.`;
	}

	function handleSettleTo60(): void {
		resetSimulationToSeed({
			autoRun: false,
			evolveToObservationTime: true,
			notice: `Computed full run from seed ${seed} to model time t = ${DEFAULT_OBSERVATION_TIME.toFixed(1)}.`
		});
	}

	function handleSelectPreset(nextPresetId: PresetId): void {
		const preset = SPOT_STRIPE_PRESETS[nextPresetId];
		if (!preset) return;
		presetId = nextPresetId;
		k = preset.patternBalance;
		diffusionRatio = preset.inhibitorRatio;
		resetSimulationToSeed({
			autoRun: !reducedMotion,
			notice: `Experiment restarted from the same seed (${seed}) with the ${preset.label} preset (k = ${formatSigned(preset.patternBalance, 3)}, ${preset.inhibitorRatio}×).`,
			isRestartCounted: true
		});
	}

	function handlePatternBalanceChange(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const nextK = Number(target.value);
		if (!Number.isFinite(nextK)) return;
		k = nextK;
		presetId = 'custom';
		resetSimulationToSeed({
			autoRun: !reducedMotion,
			notice: `Experiment restarted from the same seed (${seed}) after changing pattern balance to k = ${formatSigned(nextK, 3)}.`,
			isRestartCounted: true
		});
	}

	function handleDiffusionRatioChange(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const nextRatio = Number(target.value);
		if (!Number.isFinite(nextRatio)) return;
		diffusionRatio = nextRatio;
		presetId = 'custom';
		resetSimulationToSeed({
			autoRun: !reducedMotion,
			notice: `Experiment restarted from the same seed (${seed}) after setting inhibitor spreading rate to ${nextRatio}×.`,
			isRestartCounted: true
		});
	}

	function handleToggleCompareEqual(): void {
		const nextCompare = !compareEqualSpreading;
		compareEqualSpreading = nextCompare;
		if (nextCompare) {
			resetSimulationToSeed({
				autoRun: !reducedMotion,
				notice: `Experiment restarted from small disturbances (seed ${seed}) to compare ${diffusionRatio}× inhibitor spreading with 1× equal spreading.`,
				isRestartCounted: true
			});
		} else {
			restartNotice = `Returned to single-patch view at model time t = ${comparison.different.modelTime.toFixed(1)}.`;
		}
	}

	function handleSelectDomain(nextDomainId: DomainShapeId): void {
		if (domainId === nextDomainId) return;
		domainId = nextDomainId;
		const shape = DOMAIN_SHAPES[nextDomainId];
		resetSimulationToSeed({
			autoRun: !reducedMotion,
			notice: `Experiment restarted from seed ${seed} inside the ${shape.label.toLowerCase()} domain (${shape.physicalWidth} × ${shape.physicalHeight} model units).`,
			isRestartCounted: true
		});
	}

	function handleSeedChange(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const parsed = Math.max(1, Math.min(999999, Math.round(Number(target.value) || DEFAULT_SEED)));
		seed = parsed;
		resetSimulationToSeed({
			autoRun: !reducedMotion,
			notice: `Experiment restarted with deterministic seed ${parsed}.`,
			isRestartCounted: true
		});
	}

	function handleAmplitudeChange(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const parsed = Math.max(
			0.005,
			Math.min(0.1, Number(target.value) || DEFAULT_DISTURBANCE_AMPLITUDE)
		);
		disturbanceAmplitude = parsed;
		resetSimulationToSeed({
			autoRun: !reducedMotion,
			notice: `Experiment restarted from seed ${seed} with disturbance amplitude ±${parsed.toFixed(3)}.`,
			isRestartCounted: true
		});
	}

	function buildSparklinePoints(
		history: ComparisonSnapshot['history'],
		selector: (point: ComparisonSnapshot['history'][number]) => number,
		width: number,
		height: number,
		padLeft: number,
		padRight: number,
		padTop: number,
		padBottom: number,
		maxY: number
	): string {
		if (history.length === 0) return '';
		const plotW = width - padLeft - padRight;
		const plotH = height - padTop - padBottom;
		const maxT = Math.max(
			DEFAULT_OBSERVATION_TIME,
			history[history.length - 1]?.modelTime ?? DEFAULT_OBSERVATION_TIME
		);
		return history
			.map((pt) => {
				const x = padLeft + (Math.min(pt.modelTime, maxT) / maxT) * plotW;
				const yVal = Math.min(maxY, Math.max(0, selector(pt)));
				const y = padTop + plotH - (yVal / maxY) * plotH;
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}

	const chartMaxY = $derived.by(() => {
		let maxVal = 0.6;
		for (const pt of comparison.history) {
			if (pt.differentStdU > maxVal) maxVal = pt.differentStdU;
			if (pt.equalStdU > maxVal) maxVal = pt.equalStdU;
		}
		return Math.ceil(maxVal * 10) / 10;
	});

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		if (params.get('motion') === 'reduce' || mediaQuery.matches || initialReducedMotion) {
			reducedMotion = true;
		}

		const handleMotionChange = (event: MediaQueryListEvent) => {
			if (params.get('motion') !== 'reduce') {
				reducedMotion = event.matches;
			}
			if (reducedMotion && status === 'running') {
				status = 'paused';
				stopAnimationLoop();
			}
		};
		mediaQuery.addEventListener('change', handleMotionChange);

		workerClient = new SpotStripeWorkerClient();
		const unsubscribe = workerClient.subscribe(handleWorkerResponse);

		const handleVisibilityChange = () => {
			isDocumentVisible = document.visibilityState !== 'hidden';
			if (!isDocumentVisible) {
				stopAnimationLoop();
			} else if (status === 'running' && isVisibleInViewport) {
				scheduleNextFrame();
			}
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);

		let intersectionObserver: IntersectionObserver | null = null;
		if (typeof IntersectionObserver !== 'undefined' && rootEl) {
			intersectionObserver = new IntersectionObserver(
				(entries) => {
					const entry = entries[0];
					if (!entry) return;
					isVisibleInViewport = entry.isIntersecting;
					if (!isVisibleInViewport) {
						stopAnimationLoop();
					} else if (status === 'running' && isDocumentVisible) {
						scheduleNextFrame();
					}
				},
				{ threshold: 0.05 }
			);
			intersectionObserver.observe(rootEl);
		}

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined' && rootEl) {
			resizeObserver = new ResizeObserver((entries) => {
				const entry = entries[0];
				if (entry) {
					viewportWidth = Math.round(entry.contentRect.width);
				}
			});
			resizeObserver.observe(rootEl);
		}

		return () => {
			stopAnimationLoop();
			unsubscribe();
			mediaQuery.removeEventListener('change', handleMotionChange);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			intersectionObserver?.disconnect();
			resizeObserver?.disconnect();
			workerClient?.dispose();
			workerClient = null;
		};
	});
</script>

<section
	bind:this={rootEl}
	class="spots-instrument"
	aria-label="How spots and stripes form interactive reaction–diffusion instrument"
	data-testid="spots-and-stripes-instrument"
	data-status={status}
	data-view-mode={viewMode}
	data-domain={domainId}
	data-compare-equal={compareEqualSpreading ? 'true' : 'false'}
	data-model-time={comparison.different.modelTime.toFixed(2)}
	data-restart-count={restartCount}
	data-reduced-motion={reducedMotion ? 'true' : 'false'}
	data-viewport-width={viewportWidth}
>
	<header class="spots-instrument__header">
		<div class="spots-instrument__title-group">
			<span class="spots-instrument__eyebrow">Reaction–diffusion pattern workbench</span>
			<h2 class="spots-instrument__title">
				Two spreading signals: activator <em>u</em> and inhibitor <em>v</em>
			</h2>
		</div>

		<div class="spots-status-pill" role="status" aria-live="polite" data-testid="status-pill">
			<span class="spots-status-dot {statusDotClass}" aria-hidden="true"></span>
			<span>{statusLabel}</span>
			<span aria-hidden="true">·</span>
			<span>t = {comparison.different.modelTime.toFixed(1)}</span>
		</div>
	</header>

	<div class="spots-instrument__grid">
		<!-- Left column on desktop / First on mobile: Simulation surface -->
		<div class="spots-viewport-col">
			<!-- View selectors directly above the canvas -->
			<div class="spots-view-bar">
				<div class="spots-view-tabs" role="group" aria-label="Displayed field">
					<button
						type="button"
						class="spots-view-tab"
						aria-pressed={viewMode === 'activator'}
						data-testid="view-activator"
						onclick={() => {
							viewMode = 'activator';
						}}
					>
						Activator
					</button>
					<button
						type="button"
						class="spots-view-tab"
						aria-pressed={viewMode === 'inhibitor'}
						data-testid="view-inhibitor"
						onclick={() => {
							viewMode = 'inhibitor';
						}}
					>
						Inhibitor
					</button>
					<button
						type="button"
						class="spots-view-tab"
						aria-pressed={viewMode === 'pigment'}
						data-testid="view-pigment"
						onclick={() => {
							viewMode = 'pigment';
						}}
					>
						Pigment
					</button>
				</div>

				{#if viewMode === 'activator' || viewMode === 'inhibitor'}
					<div
						class="spots-scale-bar"
						aria-label="Fixed signed signal scale from -{FIXED_SIGNAL_SCALE_LIMIT.toFixed(1)} to +{FIXED_SIGNAL_SCALE_LIMIT.toFixed(1)}"
						data-testid="field-scale-bar"
					>
						<span>−1.0</span>
						<span
							class="spots-scale-gradient {viewMode === 'activator' ? 'activator' : 'inhibitor'}"
							aria-hidden="true"
						></span>
						<span>0.0</span>
						<span>+1.0</span>
					</div>
				{:else}
					<div class="spots-pigment-legend" data-testid="pigment-scale-bar">
						<span>
							<span class="spots-pigment-swatch low" aria-hidden="true"></span>
							u &lt; {formatSigned(pigmentThreshold, 2)} (Light)
						</span>
						<span>
							<span class="spots-pigment-swatch high" aria-hidden="true"></span>
							u ≥ {formatSigned(pigmentThreshold, 2)} (Dark marking)
						</span>
					</div>
				{/if}
			</div>

			{#if viewMode === 'pigment'}
				<div class="spots-threshold-panel" data-testid="pigment-threshold-panel">
					<div class="spots-slider-header">
						<label class="spots-slider-label" for="pigment-threshold-slider">
							Pigment threshold
						</label>
						<span class="spots-slider-value" data-testid="pigment-threshold-value">
							u = {formatSigned(pigmentThreshold, 2)}
						</span>
					</div>
					<input
						id="pigment-threshold-slider"
						class="spots-range"
						type="range"
						min="-0.60"
						max="0.60"
						step="0.02"
						value={pigmentThreshold}
						data-testid="pigment-threshold-slider"
						oninput={(event) => {
							pigmentThreshold = Number((event.currentTarget as HTMLInputElement).value);
						}}
					/>
					<p class="spots-helper">Changes the display, not the simulation.</p>
				</div>
			{/if}

			{#if status === 'preview'}
				<div class="spots-preview-banner" data-testid="computed-preview-banner">
					<span>Computed example. Press Grow from noise to see how it forms.</span>
					<span>
						Preset: {presetId !== 'custom' ? SPOT_STRIPE_PRESETS[presetId].label : 'Spots'} (t = {comparison.different.modelTime.toFixed(0)})
					</span>
				</div>
			{:else if restartNotice}
				<div class="spots-restart-banner" role="status" aria-live="polite" data-testid="restart-banner">
					{restartNotice}
				</div>
			{/if}

			{#if status === 'error' && errorMessage}
				<div class="spots-error-banner" role="alert" data-testid="error-banner">
					<span>{errorMessage}</span>
					<button type="button" class="spots-btn" onclick={handleRestart}>
						Restart
					</button>
				</div>
			{/if}

			<!-- Recessed simulation viewport -->
			<div class="spots-recessed-frame">
				<div
					class="spots-canvas-grid {compareEqualSpreading ? 'compare-active' : ''}"
					data-testid="canvas-grid"
				>
					<!-- Primary field (Different spreading rates) -->
					<div class="spots-field-card" data-testid="primary-field-card">
						<div class="spots-field-card__header">
							<span class="spots-field-card__title">
								{compareEqualSpreading
									? 'Different spreading rates'
									: `${domainSpec.label} (flat 2D patch)`}
							</span>
							<span class="spots-field-card__meta">
								Dv/Du = {diffusionRatio}× (Du = 0.6, Dv = {dvValue.toFixed(1)})
							</span>
						</div>

						<div class="spots-canvas-stage" data-testid="primary-canvas-stage">
							<canvas
								bind:this={primaryCanvas}
								class="spots-canvas"
								width={comparison.different.nx}
								height={comparison.different.ny}
								style="aspect-ratio: {comparison.different.nx} / {comparison.different.ny}; max-width: {comparison.different.nx === comparison.different.ny ? '460px' : '100%'};"
								aria-label="{compareEqualSpreading ? 'Different spreading rates field' : 'Simulated reaction–diffusion patch'} showing {viewMode} view at model time t = {comparison.different.modelTime.toFixed(1)} with variation σu = {comparison.different.summary.stdU.toFixed(3)}"
								data-testid="primary-canvas"
							></canvas>
						</div>

						<div class="spots-metrics-strip">
							<div class="spots-metric-item">
								<span class="spots-metric-label">Model time</span>
								<span class="spots-metric-val" data-testid="primary-time-val">
									t = {comparison.different.modelTime.toFixed(1)}
								</span>
							</div>
							<div class="spots-metric-item">
								<span class="spots-metric-label">Equilibrium s</span>
								<span class="spots-metric-val" data-testid="equilibrium-val">
									{formatSigned(equilibriumS, 3)}
								</span>
							</div>
							<div class="spots-metric-item">
								<span class="spots-metric-label">Spatial variation (σu)</span>
								<span class="spots-metric-val" data-testid="primary-std-val">
									{comparison.different.summary.stdU.toFixed(3)}
								</span>
							</div>
							<div class="spots-metric-item">
								<span class="spots-metric-label">Range of u</span>
								<span class="spots-metric-val">
									[{formatSigned(comparison.different.summary.minU, 2)}, {formatSigned(comparison.different.summary.maxU, 2)}]
								</span>
							</div>
						</div>
					</div>

					<!-- Synchronised Equal-Spreading comparison field -->
					{#if compareEqualSpreading}
						<div class="spots-field-card" data-testid="equal-field-card">
							<div class="spots-field-card__header">
								<span class="spots-field-card__title">Equal spreading rates</span>
								<span class="spots-field-card__meta">
									1× (Dv = Du = 0.6)
								</span>
							</div>

							<div class="spots-canvas-stage" data-testid="equal-canvas-stage">
								<canvas
									bind:this={equalCanvas}
									class="spots-canvas"
									width={comparison.equal.nx}
									height={comparison.equal.ny}
									style="aspect-ratio: {comparison.equal.nx} / {comparison.equal.ny}; max-width: {comparison.equal.nx === comparison.equal.ny ? '460px' : '100%'};"
									aria-label="Equal spreading rates field (Dv = Du = 0.6) showing {viewMode} view at model time t = {comparison.equal.modelTime.toFixed(1)} with variation σu = {comparison.equal.summary.stdU.toFixed(4)}"
									data-testid="equal-canvas"
								></canvas>
							</div>

							<div class="spots-metrics-strip">
								<div class="spots-metric-item">
									<span class="spots-metric-label">Model time</span>
									<span class="spots-metric-val" data-testid="equal-time-val">
										t = {comparison.equal.modelTime.toFixed(1)}
									</span>
								</div>
								<div class="spots-metric-item">
									<span class="spots-metric-label">Equilibrium s</span>
									<span class="spots-metric-val">
										{formatSigned(equilibriumS, 3)}
									</span>
								</div>
								<div class="spots-metric-item">
									<span class="spots-metric-label">Spatial variation (σu)</span>
									<span class="spots-metric-val" data-testid="equal-std-val">
										{comparison.equal.summary.stdU.toFixed(4)}
									</span>
								</div>
								<div class="spots-metric-item">
									<span class="spots-metric-label">Range of u</span>
									<span class="spots-metric-val">
										[{formatSigned(comparison.equal.summary.minU, 2)}, {formatSigned(comparison.equal.summary.maxU, 2)}]
									</span>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Equal spreading comparison verdict + spatial variation chart -->
			{#if compareEqualSpreading}
				<div class="spots-comparison-summary" data-testid="comparison-summary">
					<p class="spots-comparison-verdict" data-testid="comparison-verdict">
						<strong>Comparison result:</strong> {comparisonVerdict}
					</p>

					<div class="spots-chart-wrap">
						<div class="spots-chart-header">
							<span>
								Spatial variation σu over model time t (standard deviation of activator u across the patch)
							</span>
							<span>Fixed scale: 0 to {chartMaxY.toFixed(1)}</span>
						</div>

						<svg
							class="spots-chart-svg"
							viewBox="0 0 560 148"
							role="img"
							aria-label="Line graph of spatial variation sigma_u over model time comparing different spreading rates against equal spreading rates"
							data-testid="variation-chart"
						>
							<line x1="44" y1="18" x2="536" y2="18" stroke="rgba(241,240,232,0.08)" stroke-width="1" />
							<line x1="44" y1="66" x2="536" y2="66" stroke="rgba(241,240,232,0.08)" stroke-width="1" />
							<line x1="44" y1="114" x2="536" y2="114" stroke="rgba(241,240,232,0.18)" stroke-width="1" />

							<text x="38" y="22" text-anchor="end" fill="#B8C0C3" font-size="11" font-family="monospace">
								{chartMaxY.toFixed(1)}
							</text>
							<text x="38" y="70" text-anchor="end" fill="#B8C0C3" font-size="11" font-family="monospace">
								{(chartMaxY / 2).toFixed(1)}
							</text>
							<text x="38" y="118" text-anchor="end" fill="#B8C0C3" font-size="11" font-family="monospace">
								0.0
							</text>

							<text x="44" y="136" text-anchor="start" fill="#B8C0C3" font-size="11" font-family="monospace">
								t = 0
							</text>
							<text x="290" y="136" text-anchor="middle" fill="#B8C0C3" font-size="11" font-family="monospace">
								t = 30
							</text>
							<text x="536" y="136" text-anchor="end" fill="#B8C0C3" font-size="11" font-family="monospace">
								t = 60
							</text>

							{#if comparison.history.length > 0}
								<polyline
									fill="none"
									stroke="#84A8BC"
									stroke-width="2.2"
									stroke-dasharray="5 3"
									points={buildSparklinePoints(
										comparison.history,
										(pt) => pt.equalStdU,
										560,
										148,
										44,
										24,
										18,
										34,
										chartMaxY
									)}
								/>
								<polyline
									fill="none"
									stroke="#E88B4C"
									stroke-width="2.6"
									points={buildSparklinePoints(
										comparison.history,
										(pt) => pt.differentStdU,
										560,
										148,
										44,
										24,
										18,
										34,
										chartMaxY
									)}
								/>
							{/if}

							<g transform="translate(56, 30)">
								<line x1="0" y1="0" x2="18" y2="0" stroke="#E88B4C" stroke-width="2.8" />
								<text x="24" y="4" fill="#F1F0E8" font-size="11.5" font-weight="600">
									Different spreading rates ({diffusionRatio}×, σu = {comparison.different.summary.stdU.toFixed(3)})
								</text>
							</g>
							<g transform="translate(56, 48)">
								<line x1="0" y1="0" x2="18" y2="0" stroke="#84A8BC" stroke-width="2.2" stroke-dasharray="5 3" />
								<text x="24" y="4" fill="#B8C0C3" font-size="11.5">
									Equal spreading rates (1×, σu = {comparison.equal.summary.stdU.toFixed(4)})
								</text>
							</g>
						</svg>
					</div>
				</div>
			{/if}

			<p class="sr-only" aria-live="polite" data-testid="sr-summary">
				{comparisonVerdict}
			</p>
		</div>

		<!-- Right column on desktop / Second on mobile: Controls -->
		<div class="spots-controls-col">
			<!-- Playback controls -->
			<div class="spots-control-card">
				<span class="spots-control-card__heading">Simulation playback</span>
				<div class="spots-playback-row">
					<button
						type="button"
						class="spots-btn spots-btn--primary"
						data-testid="grow-from-noise-btn"
						onclick={handleGrowFromNoise}
					>
						Grow from noise
					</button>

					<button
						type="button"
						class="spots-btn"
						data-testid="pause-continue-btn"
						onclick={handlePauseContinue}
					>
						{status === 'running' ? 'Pause' : 'Continue'}
					</button>

					<button
						type="button"
						class="spots-btn"
						data-testid="restart-btn"
						onclick={handleRestart}
					>
						Restart
					</button>
				</div>

				<div class="spots-playback-row" style="margin-top: 0.45rem;">
					<button
						type="button"
						class="spots-btn"
						data-testid="step-simulation-btn"
						onclick={() => handleStepManual(100)}
					>
						Step (+1.0 t)
					</button>
					<button
						type="button"
						class="spots-btn"
						data-testid="settle-simulation-btn"
						onclick={handleSettleTo60}
					>
						Settle pattern (t = 60)
					</button>
				</div>
			</div>

			<!-- Verified Presets -->
			<div class="spots-control-card">
				<span class="spots-control-card__heading">Verified presets</span>
				<div class="spots-preset-row" role="group" aria-label="Pattern presets">
					{#each PRESET_ORDER as id (id)}
						{@const preset = SPOT_STRIPE_PRESETS[id]}
						<button
							type="button"
							class="spots-btn"
							aria-pressed={presetId === preset.id}
							data-testid="preset-{preset.id}"
							onclick={() => handleSelectPreset(preset.id)}
						>
							{preset.label}
						</button>
					{/each}
				</div>
				<p class="spots-helper" style="margin-top: 0.45rem;">
					{#if presetId !== 'custom'}
						{SPOT_STRIPE_PRESETS[presetId].description}
					{:else}
						Custom parameter combination (k = {formatSigned(k, 3)}, {diffusionRatio}× inhibitor spreading).
					{/if}
				</p>
			</div>

			<!-- Sliders: Pattern balance & Inhibitor spreading rate -->
			<div class="spots-control-card">
				<div class="spots-slider-group">
					<div class="spots-slider-header">
						<label class="spots-slider-label" for="pattern-balance-slider">
							Pattern balance
						</label>
						<span class="spots-slider-value" data-testid="pattern-balance-value">
							k = {formatSigned(k, 3)}
						</span>
					</div>
					<input
						id="pattern-balance-slider"
						class="spots-range"
						type="range"
						min="-0.100"
						max="0.100"
						step="0.005"
						value={k}
						data-testid="pattern-balance-slider"
						oninput={handlePatternBalanceChange}
					/>
					<p class="spots-helper">
						Changes the balance between high- and low-signal regions.
					</p>
				</div>

				<div class="spots-slider-group" style="margin-top: 1rem;">
					<div class="spots-slider-header">
						<label class="spots-slider-label" for="inhibitor-spreading-slider">
							Inhibitor spreading rate
						</label>
						<span class="spots-slider-value" data-testid="inhibitor-spreading-value">
							{diffusionRatio}×
						</span>
					</div>
					<input
						id="inhibitor-spreading-slider"
						class="spots-range"
						type="range"
						min="1"
						max="20"
						step="0.5"
						value={diffusionRatio}
						data-testid="inhibitor-spreading-slider"
						oninput={handleDiffusionRatioChange}
					/>
					<p class="spots-helper">
						How quickly the inhibitor spreads compared with the activator.
					</p>
				</div>
			</div>

			<!-- Central comparison toggle: Compare equal spreading -->
			<div class="spots-control-card">
				<button
					type="button"
					class="spots-btn spots-compare-toggle"
					aria-pressed={compareEqualSpreading}
					data-testid="compare-equal-toggle"
					onclick={handleToggleCompareEqual}
				>
					<span>Compare equal spreading</span>
					<span class="spots-compare-badge">
						{compareEqualSpreading ? `Active (${diffusionRatio}× vs 1×)` : 'Show 1× control'}
					</span>
				</button>
				<p class="spots-helper" style="margin-top: 0.45rem;">
					Runs a second patch from the exact same initial arrays with equal spreading rates (Dv = Du = 0.6, or 1×).
				</p>
			</div>

			<!-- Optional geometry experiment: Change the shape -->
			<details class="spots-details" data-testid="change-shape-details">
				<summary>Change the shape</summary>
				<div class="spots-details__body">
					<div class="spots-shape-grid" role="group" aria-label="Flat domain geometries">
						{#each DOMAIN_SHAPE_ORDER as shapeId (shapeId)}
							{@const shape = DOMAIN_SHAPES[shapeId]}
							<button
								type="button"
								class="spots-btn spots-shape-btn"
								aria-pressed={domainId === shape.id}
								data-testid="shape-{shape.id}"
								onclick={() => handleSelectDomain(shape.id)}
							>
								<span class="spots-shape-btn__title">
									<span>{shape.label}</span>
									<span class="spots-shape-btn__meta">
										Flat 2D domain · {shape.physicalWidth} × {shape.physicalHeight} units
									</span>
								</span>
								<span class="spots-shape-btn__desc">{shape.shortNote}</span>
							</button>
						{/each}
					</div>
					<p class="spots-helper" style="margin-top: 0.65rem;">
						<strong>No-flux boundaries:</strong> The signals spread inside the patch. They do not cross its edges. All three geometries are flat, two-dimensional domains solved with identical grid spacing (h = {DEFAULT_GRID_SPACING}) and diffusion coefficients.
					</p>
				</div>
			</details>

			<!-- Optional Experiment details disclosure -->
			<details class="spots-details" data-testid="experiment-details">
				<summary>Experiment details</summary>
				<div class="spots-details__body">
					<div class="spots-details-grid">
						<div class="spots-field-row">
							<label for="seed-input">Random seed (deterministic initial noise)</label>
							<input
								id="seed-input"
								class="spots-input-number"
								type="number"
								min="1"
								max="999999"
								step="1"
								value={seed}
								data-testid="seed-input"
								onchange={handleSeedChange}
							/>
						</div>

						<div class="spots-field-row">
							<label for="amplitude-input">Initial disturbance amplitude (±Δu, ±Δv)</label>
							<input
								id="amplitude-input"
								class="spots-input-number"
								type="number"
								min="0.005"
								max="0.100"
								step="0.005"
								value={disturbanceAmplitude}
								data-testid="amplitude-input"
								onchange={handleAmplitudeChange}
							/>
						</div>
					</div>

					<div style="margin-top: 0.75rem;">
						<span class="spots-slider-label" style="display: block; margin-bottom: 0.35rem;">
							Playback speed (steps per frame; fixed Δt = {DEFAULT_TIMESTEP})
						</span>
						<div class="spots-preset-row" role="group" aria-label="Playback speed">
							{#each [1, 2, 4] as speed (speed)}
								<button
									type="button"
									class="spots-btn"
									aria-pressed={playbackSpeed === speed}
									data-testid="speed-{speed}x"
									onclick={() => {
										playbackSpeed = speed as PlaybackSpeed;
									}}
								>
									{speed}×
								</button>
							{/each}
						</div>
					</div>

					<p class="spots-helper" style="margin-top: 0.75rem;">
						<strong>Uniform equilibrium:</strong> Solving s³ + 0.2s = {formatSigned(k, 3)} gives u = v = s = {formatSigned(equilibriumS, 4)}.<br />
						<strong>Linear stability on this domain:</strong> {modeAnalysis.growingModeCount} growing spatial {modeAnalysis.growingModeCount === 1 ? 'mode' : 'modes'} ({modeAnalysis.growingModeCount > 0 ? `peak growth rate λ = +${modeAnalysis.maxGrowthRate.toFixed(3)}` : 'no spatial pattern instability'}). Equal spreading (1×) max growth rate is {modeAnalysis.equalSpreadingMaxGrowthRate.toFixed(3)}.<br />
						<strong>Numerical scheme:</strong> Explicit second-order Heun (RK2) integration on a 5-point finite-difference Laplacian with no-flux Neumann boundaries (grid spacing h = {DEFAULT_GRID_SPACING}, fixed timestep Δt = {DEFAULT_TIMESTEP}).
					</p>
				</div>
			</details>
		</div>
	</div>
</section>
