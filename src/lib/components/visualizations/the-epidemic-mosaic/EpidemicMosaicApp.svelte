<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DEFAULT_BATCH_REPETITIONS,
		DEFAULT_BRIDGE_A_ID,
		DEFAULT_BRIDGE_B_ID,
		DEFAULT_CITY_SEED,
		DEFAULT_EPIDEMIC_PARAMETERS,
		DEFAULT_INITIAL_INFECTED_REGION_ID,
		DEFAULT_VACCINE_BUDGET,
		EpidemicMosaicWorkerClient,
		INITIAL_INFECTIONS,
		LOGICAL_HEIGHT,
		LOGICAL_WIDTH,
		PARAMETER_BOUNDS,
		TOTAL_CITY_POPULATION,
		VACCINATION_STRATEGIES,
		VACCINATION_STRATEGY_ORDER,
		buildScenarioEdges,
		compareBridgeScenarios,
		compareVaccinationStrategies,
		computePolygonPopulationBands,
		generateCityNetwork,
		getConnectedNeighbourIndices,
		getPlaybackWindowEvents,
		normalizeBridgeSelection,
		normalizeEpidemicParameters,
		normalizeVaccineBudget,
		runBatchComparison,
		sampleCityStateAtTime,
		type BatchComparisonResult,
		type BridgeSelection,
		type CityNetwork,
		type ContactEdge,
		type EpidemicParameters,
		type ExperimentMode,
		type HorizontalColourBand,
		type OutbreakSimulationResult,
		type PlaybackWindowEvents,
		type RegionCompartmentCounts,
		type SampledCityState,
		type ScenarioId
	} from '$lib/visualizations/the-epidemic-mosaic';

	const city: CityNetwork = generateCityNetwork(DEFAULT_CITY_SEED);
	const communityARegions = city.regions.filter((r) => r.community === 'A');
	const communityBRegions = city.regions.filter((r) => r.community === 'B');

	let experimentMode = $state<ExperimentMode>('bridge');
	let activeBridge = $state<BridgeSelection>({
		regionAId: DEFAULT_BRIDGE_A_ID,
		regionBId: DEFAULT_BRIDGE_B_ID
	});
	let proposedBridge = $state<BridgeSelection>({
		regionAId: DEFAULT_BRIDGE_A_ID,
		regionBId: DEFAULT_BRIDGE_B_ID
	});
	let mapBridgePickActive = $state(false);
	let mapPickNextCommunity = $state<'A' | 'B'>('A');

	let vaccineBudget = $state<number>(DEFAULT_VACCINE_BUDGET);
	let parameters = $state<EpidemicParameters>({ ...DEFAULT_EPIDEMIC_PARAMETERS });

	let selectedRegionId = $state<string>(DEFAULT_INITIAL_INFECTED_REGION_ID);
	let mobileScenarioId = $state<ScenarioId>('with-bridge');

	let currentDay = $state<number>(0);
	let previousWindowStartDay = $state<number>(0);
	let isPlaying = $state<boolean>(false);
	let playbackSpeed = $state<1 | 4 | 10>(1);
	let statusBanner = $state<string>(
		'Ready at day 0.0. The comparison runs the same starting city with and without the proposed bridge (A6 · Foundry Quay ↔ B3 · Canal Basin).'
	);

	let prefersReducedMotion = $state<boolean>(false);
	let isDocumentHidden = $state<boolean>(false);
	let isOffscreen = $state<boolean>(false);

	let batchRunning = $state<boolean>(false);
	let batchCompletedRuns = $state<number>(DEFAULT_BATCH_REPETITIONS);
	let batchTotalRuns = $state<number>(DEFAULT_BATCH_REPETITIONS);

	// Synchronously compute initial 20-run batch so the dot plot is immediately readable
	let batchResult = $state<BatchComparisonResult>(
		runBatchComparison({
			city,
			experimentMode: 'bridge',
			bridge: { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID },
			vaccineBudget: DEFAULT_VACCINE_BUDGET,
			parameters: DEFAULT_EPIDEMIC_PARAMETERS,
			repetitions: DEFAULT_BATCH_REPETITIONS
		})
	);

	let rootElement: HTMLElement | undefined = $state();
	let workerClient: EpidemicMosaicWorkerClient | null = null;
	let rafHandle: number | null = null;
	let lastFrameTimestamp: number | null = null;

	// Derived simulations for Experiment 1 (Bridge) and Experiment 2 (Vaccination)
	const bridgeComparison = $derived(
		compareBridgeScenarios({
			city,
			bridge: activeBridge,
			parameters,
			initialInfectedRegionId: DEFAULT_INITIAL_INFECTED_REGION_ID,
			initialInfections: INITIAL_INFECTIONS
		})
	);

	const vaccinationComparison = $derived(
		compareVaccinationStrategies({
			city,
			bridge: activeBridge,
			vaccineBudget,
			parameters,
			initialInfectedRegionId: DEFAULT_INITIAL_INFECTED_REGION_ID,
			initialInfections: INITIAL_INFECTIONS
		})
	);

	interface ScenarioViewCard {
		id: ScenarioId;
		label: string;
		subtitle: string;
		badge: string;
		lineColor: string;
		lineDash: string;
		edges: ContactEdge[];
		result: OutbreakSimulationResult;
		sampled: SampledCityState;
		windowEvents: PlaybackWindowEvents;
		bandsByRegion: HorizontalColourBand[][];
	}

	const playbackWindowSpan = $derived(
		isPlaying
			? Math.max(0.8, playbackSpeed * 0.55)
			: currentDay > 0
				? Math.max(1.0, playbackSpeed * 0.65)
				: 0
	);

	const activeScenarioCards = $derived.by((): ScenarioViewCard[] => {
		const winFrom = Math.max(0, currentDay - playbackWindowSpan);
		const winTo = currentDay;

		if (experimentMode === 'bridge') {
			const withoutSampled = sampleCityStateAtTime(bridgeComparison.withoutBridge, currentDay);
			const withSampled = sampleCityStateAtTime(bridgeComparison.withBridge, currentDay);

			const withoutEvents = getPlaybackWindowEvents(
				city,
				bridgeComparison.withoutBridge,
				winFrom,
				winTo
			);
			const withEvents = getPlaybackWindowEvents(
				city,
				bridgeComparison.withBridge,
				winFrom,
				winTo
			);

			return [
				{
					id: 'without-bridge',
					label: 'Without bridge',
					subtitle: 'Two disconnected communities (no contact crosses the seam)',
					badge: '0 cross-community links',
					lineColor: '#7ec8e3',
					lineDash: '6 4',
					edges: bridgeComparison.withoutBridgeEdges,
					result: bridgeComparison.withoutBridge,
					sampled: withoutSampled,
					windowEvents: withoutEvents,
					bandsByRegion: city.regions.map((reg, idx) =>
						computePolygonPopulationBands(reg, withoutSampled.regionCounts[idx])
					)
				},
				{
					id: 'with-bridge',
					label: 'With one bridge',
					subtitle: `Bridge added: ${city.regionById.get(activeBridge.regionAId)?.shortLabel} ↔ ${city.regionById.get(activeBridge.regionBId)?.shortLabel}`,
					badge: `${city.regionById.get(activeBridge.regionAId)?.shortLabel} ↔ ${city.regionById.get(activeBridge.regionBId)?.shortLabel}`,
					lineColor: '#ffaa4c',
					lineDash: 'none',
					edges: bridgeComparison.withBridgeEdges,
					result: bridgeComparison.withBridge,
					sampled: withSampled,
					windowEvents: withEvents,
					bandsByRegion: city.regions.map((reg, idx) =>
						computePolygonPopulationBands(reg, withSampled.regionCounts[idx])
					)
				}
			];
		}

		const palette: Record<
			'even' | 'most-connections' | 'around-the-bridge',
			{ color: string; dash: string }
		> = {
			even: { color: '#7ec8e3', dash: '7 4' },
			'most-connections': { color: '#ffaa4c', dash: 'none' },
			'around-the-bridge': { color: '#4ce0b3', dash: '2.5 3.5' }
		};

		return VACCINATION_STRATEGY_ORDER.map((strategyId) => {
			const meta = VACCINATION_STRATEGIES[strategyId];
			const res = vaccinationComparison.results[strategyId];
			const sampled = sampleCityStateAtTime(res, currentDay);
			const windowEvents = getPlaybackWindowEvents(city, res, winFrom, winTo);
			const style = palette[strategyId];

			return {
				id: strategyId,
				label: meta.label,
				subtitle: meta.rule,
				badge: `${res.vaccineBudget} doses (${((res.vaccineBudget / TOTAL_CITY_POPULATION) * 100).toFixed(1)}%)`,
				lineColor: style.color,
				lineDash: style.dash,
				edges: vaccinationComparison.edges,
				result: res,
				sampled,
				windowEvents,
				bandsByRegion: city.regions.map((reg, idx) =>
					computePolygonPopulationBands(reg, sampled.regionCounts[idx])
				)
			};
		});
	});

	const hasPendingBridgeChange = $derived(
		proposedBridge.regionAId !== activeBridge.regionAId ||
			proposedBridge.regionBId !== activeBridge.regionBId
	);

	const proposedBridgeRegions = $derived({
		regA: city.regionById.get(proposedBridge.regionAId) ?? city.regionById.get(DEFAULT_BRIDGE_A_ID)!,
		regB: city.regionById.get(proposedBridge.regionBId) ?? city.regionById.get(DEFAULT_BRIDGE_B_ID)!
	});

	const activeBridgeRegions = $derived({
		regA: city.regionById.get(activeBridge.regionAId) ?? city.regionById.get(DEFAULT_BRIDGE_A_ID)!,
		regB: city.regionById.get(activeBridge.regionBId) ?? city.regionById.get(DEFAULT_BRIDGE_B_ID)!
	});

	// Selected region inspector details
	const selectedRegion = $derived(
		city.regionById.get(selectedRegionId) ??
			city.regionById.get(DEFAULT_INITIAL_INFECTED_REGION_ID)!
	);

	const primaryInspectorScenario = $derived(
		activeScenarioCards.find((c) => c.id === mobileScenarioId) ??
			activeScenarioCards[activeScenarioCards.length - 1]
	);

	const selectedRegionCounts = $derived<RegionCompartmentCounts>(
		primaryInspectorScenario.sampled.regionCounts[selectedRegion.index]
	);

	const selectedRegionEdgesWithBridge = $derived(
		buildScenarioEdges(city, activeBridge)
	);

	const selectedRegionNeighbourIndices = $derived(
		getConnectedNeighbourIndices(selectedRegion.index, selectedRegionEdgesWithBridge)
	);

	const selectedRegionNeighbours = $derived(
		selectedRegionNeighbourIndices.map((idx) => city.regions[idx])
	);

	// Time series chart scaling
	const chartMaxInfectious = $derived.by(() => {
		let maxI = 40;
		for (const card of activeScenarioCards) {
			if (card.result.peakInfectious > maxI) {
				maxI = card.result.peakInfectious;
			}
		}
		return Math.ceil((maxI * 1.12) / 50) * 50;
	});

	const vaccineBudgetPercentage = $derived(
		((vaccineBudget / TOTAL_CITY_POPULATION) * 100).toFixed(1)
	);

	function stopAnimationLoop() {
		isPlaying = false;
		if (rafHandle !== null && typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(rafHandle);
			rafHandle = null;
		}
		lastFrameTimestamp = null;
	}

	function tickAnimation(timestamp: number) {
		if (!isPlaying || isDocumentHidden || isOffscreen) {
			stopAnimationLoop();
			return;
		}
		if (lastFrameTimestamp === null) {
			lastFrameTimestamp = timestamp;
		}
		const dtSeconds = Math.min(0.1, Math.max(0, (timestamp - lastFrameTimestamp) / 1000));
		lastFrameTimestamp = timestamp;

		// 1x playback = 8 simulated days per real second (~15s for 120 days)
		const baseDaysPerSecond = 8;
		const advanceDays = dtSeconds * baseDaysPerSecond * playbackSpeed;
		const nextDay = Math.min(parameters.observationDays, currentDay + advanceDays);

		previousWindowStartDay = currentDay;
		currentDay = Number(nextDay.toFixed(2));

		const allFinished = activeScenarioCards.every((c) => c.sampled.isEnded);
		if (currentDay >= parameters.observationDays || allFinished) {
			if (allFinished && currentDay < parameters.observationDays) {
				const maxLastDay = Math.max(...activeScenarioCards.map((c) => c.result.lastEventDay));
				currentDay = Number(
					Math.min(parameters.observationDays, Math.max(currentDay, Math.ceil(maxLastDay))).toFixed(
						1
					)
				);
			} else {
				currentDay = parameters.observationDays;
			}
			stopAnimationLoop();
			statusBanner = `Simulation finished at day ${currentDay.toFixed(1)}. Inspect any region or run 20 repetitions below.`;
			return;
		}

		rafHandle = requestAnimationFrame(tickAnimation);
	}

	function togglePlayPause() {
		if (isPlaying) {
			stopAnimationLoop();
			statusBanner = `Paused at day ${currentDay.toFixed(1)}.`;
			return;
		}

		if (
			currentDay >= parameters.observationDays ||
			activeScenarioCards.every((c) => c.sampled.isEnded)
		) {
			currentDay = 0;
			previousWindowStartDay = 0;
		}

		isPlaying = true;
		lastFrameTimestamp = null;
		statusBanner =
			experimentMode === 'bridge'
				? `Running side-by-side comparison (${activeBridgeRegions.regA.shortLabel} ↔ ${activeBridgeRegions.regB.shortLabel}) at ${playbackSpeed}× speed.`
				: `Running equal-budget vaccination comparison (${vaccineBudget} doses · ${vaccineBudgetPercentage}%) at ${playbackSpeed}× speed.`;

		if (typeof requestAnimationFrame !== 'undefined') {
			rafHandle = requestAnimationFrame(tickAnimation);
		}
	}

	function resetPlayback(announcement?: string) {
		stopAnimationLoop();
		currentDay = 0;
		previousWindowStartDay = 0;
		statusBanner =
			announcement ??
			`Reset to day 0.0. Five initial infections start in ${city.regionById.get(DEFAULT_INITIAL_INFECTED_REGION_ID)?.fullName}.`;
	}

	function setExperimentMode(nextMode: ExperimentMode) {
		if (experimentMode === nextMode) return;
		experimentMode = nextMode;
		mapBridgePickActive = false;
		if (nextMode === 'bridge') {
			mobileScenarioId = 'with-bridge';
		} else {
			mobileScenarioId = 'around-the-bridge';
		}
		resetPlayback(
			nextMode === 'bridge'
				? `Switched to Experiment 1 (Add a bridge). Comparison reset to day 0.0.`
				: `Switched to Experiment 2 (Place the same vaccines · ${vaccineBudget} doses / ${vaccineBudgetPercentage}%). Comparison reset to day 0.0.`
		);
		triggerBatchRecompute(nextMode, activeBridge, vaccineBudget, parameters);
	}

	function applyBridgeSelection(nextBridge: BridgeSelection, sourceLabel: string) {
		const clean = normalizeBridgeSelection(city, nextBridge);
		proposedBridge = { ...clean };
		activeBridge = { ...clean };
		mapBridgePickActive = false;
		const regA = city.regionById.get(clean.regionAId)!;
		const regB = city.regionById.get(clean.regionBId)!;
		resetPlayback(
			`${sourceLabel}: Bridge set to ${regA.fullName} ↔ ${regB.fullName}. Both scenarios have been reset to day 0.0.`
		);
		triggerBatchRecompute(experimentMode, clean, vaccineBudget, parameters);
	}

	function handleSelectBridgeA(regionAId: string) {
		const next = normalizeBridgeSelection(city, {
			regionAId,
			regionBId: proposedBridge.regionBId
		});
		applyBridgeSelection(next, 'Bridge updated');
	}

	function handleSelectBridgeB(regionBId: string) {
		const next = normalizeBridgeSelection(city, {
			regionAId: proposedBridge.regionAId,
			regionBId
		});
		applyBridgeSelection(next, 'Bridge updated');
	}

	function restoreDefaultBridge() {
		applyBridgeSelection(
			{ regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID },
			'Restored default bridge'
		);
	}

	function handlePolygonSelect(regionId: string) {
		selectedRegionId = regionId;
		const reg = city.regionById.get(regionId);
		if (!reg) return;

		if (experimentMode === 'bridge' && mapBridgePickActive) {
			if (reg.community === 'A') {
				proposedBridge = {
					regionAId: reg.id,
					regionBId: proposedBridge.regionBId
				};
				mapPickNextCommunity = 'B';
				statusBanner = `Proposed Community A bridge endpoint: ${reg.fullName}. Now select a region in Community B or click Apply proposed bridge.`;
			} else {
				proposedBridge = {
					regionAId: proposedBridge.regionAId,
					regionBId: reg.id
				};
				mapPickNextCommunity = 'A';
				statusBanner = `Proposed bridge preview: ${city.regionById.get(proposedBridge.regionAId)?.fullName} ↔ ${reg.fullName}. Click Apply proposed bridge to reset and compare.`;
			}
		}
	}

	function handleVaccineBudgetChange(rawBudget: number) {
		const normalized = normalizeVaccineBudget(rawBudget);
		vaccineBudget = normalized;
		const pct = ((normalized / TOTAL_CITY_POPULATION) * 100).toFixed(1);
		resetPlayback(
			`Vaccine budget set to ${normalized} doses (${pct}% of city). All three strategies reset to day 0.0.`
		);
		triggerBatchRecompute(experimentMode, activeBridge, normalized, parameters);
	}

	function updateParameter<K extends keyof EpidemicParameters>(key: K, rawVal: number) {
		const nextParams = normalizeEpidemicParameters({
			...parameters,
			[key]: rawVal
		});
		parameters = nextParams;
		resetPlayback(`Updated model parameter (${key}). Comparison reset to day 0.0.`);
		triggerBatchRecompute(experimentMode, activeBridge, vaccineBudget, nextParams);
	}

	function triggerBatchRecompute(
		mode: ExperimentMode = experimentMode,
		bridge: BridgeSelection = activeBridge,
		budget: number = vaccineBudget,
		params: EpidemicParameters = parameters
	) {
		if (!workerClient) {
			batchResult = runBatchComparison({
				city,
				experimentMode: mode,
				bridge,
				vaccineBudget: budget,
				parameters: params,
				repetitions: DEFAULT_BATCH_REPETITIONS
			});
			batchRunning = false;
			batchCompletedRuns = DEFAULT_BATCH_REPETITIONS;
			return;
		}

		batchRunning = true;
		batchCompletedRuns = 0;
		batchTotalRuns = DEFAULT_BATCH_REPETITIONS;

		workerClient.startBatch(
			{
				citySeed: city.citySeed,
				experimentMode: mode,
				bridge: {
					regionAId: bridge.regionAId,
					regionBId: bridge.regionBId
				},
				vaccineBudget: budget,
				parameters: { ...params },
				repetitions: DEFAULT_BATCH_REPETITIONS
			},
			{
				onProgress: (completed, total) => {
					batchCompletedRuns = completed;
					batchTotalRuns = total;
				},
				onComplete: (result) => {
					batchResult = result;
					batchRunning = false;
					batchCompletedRuns = result.repetitions;
				},
				onCancelled: () => {
					batchRunning = false;
				}
			}
		);
	}

	function cancelBatch() {
		workerClient?.cancel();
		batchRunning = false;
		statusBanner = 'Cancelled 20-run batch calculation.';
	}

	function compartmentFill(compartment: 'S' | 'V' | 'R' | 'I'): string {
		switch (compartment) {
			case 'S':
				return 'var(--em-comp-s)';
			case 'V':
				return 'url(#em-vaccinated-pattern)';
			case 'R':
				return 'var(--em-comp-r)';
			case 'I':
				return 'var(--em-comp-i)';
		}
	}

	function buildTimeSeriesPath(
		result: OutbreakSimulationResult,
		maxDay: number,
		width: number,
		height: number,
		padLeft: number,
		padRight: number,
		padTop: number,
		padBottom: number
	): string {
		const plotW = width - padLeft - padRight;
		const plotH = height - padTop - padBottom;
		const obsDays = Math.max(1, result.parameters.observationDays);
		const yMax = Math.max(10, chartMaxInfectious);

		const points: string[] = [];
		for (const pt of result.dailySeries) {
			if (pt.day > maxDay + 0.5) break;
			const x = padLeft + (pt.day / obsDays) * plotW;
			const y = padTop + plotH - (Math.min(yMax, pt.totalI) / yMax) * plotH;
			points.push(`${points.length === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
		}
		return points.join(' ');
	}

	onMount(() => {
		workerClient = new EpidemicMosaicWorkerClient();

		const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
		if (mq) {
			prefersReducedMotion = mq.matches;
			const onMotionChange = (ev: MediaQueryListEvent) => {
				prefersReducedMotion = ev.matches;
			};
			mq.addEventListener?.('change', onMotionChange);
		}

		const onVisibilityChange = () => {
			isDocumentHidden = document.hidden;
			if (document.hidden && isPlaying) {
				stopAnimationLoop();
				statusBanner = `Paused automatically while tab was in the background (day ${currentDay.toFixed(1)}).`;
			}
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		let observer: IntersectionObserver | null = null;
		if (typeof IntersectionObserver !== 'undefined' && rootElement) {
			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						isOffscreen = !entry.isIntersecting;
						if (!entry.isIntersecting && isPlaying) {
							stopAnimationLoop();
						}
					}
				},
				{ threshold: 0.05 }
			);
			observer.observe(rootElement);
		}

		return () => {
			stopAnimationLoop();
			document.removeEventListener('visibilitychange', onVisibilityChange);
			observer?.disconnect();
			workerClient?.dispose();
			workerClient = null;
		};
	});
</script>

<div class="em-workbench" bind:this={rootElement} data-testid="epidemic-mosaic-workbench">
	<!-- Primary Control Deck -->
	<section class="em-panel" aria-label="Simulation controls">
		<div class="em-toolbar">
			<!-- Experiment Switch -->
			<div class="em-toolbar__group">
				<span class="em-toolbar__label">Experiment</span>
				<div class="em-segmented" role="group" aria-label="Choose experiment">
					<button
						type="button"
						class="em-btn em-btn--segmented"
						aria-pressed={experimentMode === 'bridge'}
						data-testid="mode-bridge-btn"
						onclick={() => setExperimentMode('bridge')}
					>
						1. Add a bridge
					</button>
					<button
						type="button"
						class="em-btn em-btn--segmented"
						aria-pressed={experimentMode === 'vaccination'}
						data-testid="mode-vaccination-btn"
						onclick={() => setExperimentMode('vaccination')}
					>
						2. Place the same vaccines
					</button>
				</div>
			</div>

			<!-- Transport Controls -->
			<div class="em-toolbar__group">
				<button
					type="button"
					class="em-btn em-btn--primary"
					data-testid="run-pause-btn"
					onclick={togglePlayPause}
				>
					<span
						class="em-status-dot {isPlaying ? 'em-status-dot--active' : 'em-status-dot--amber'}"
						aria-hidden="true"
					></span>
					{#if isPlaying}
						Pause
					{:else if currentDay <= 0}
						Run comparison
					{:else if currentDay >= parameters.observationDays || activeScenarioCards.every((c) => c.sampled.isEnded)}
						Replay comparison
					{:else}
						Resume comparison
					{/if}
				</button>

				<button
					type="button"
					class="em-btn"
					data-testid="reset-btn"
					onclick={() => resetPlayback()}
				>
					Reset (Day 0)
				</button>
			</div>

			<!-- Playback Speed -->
			<div class="em-toolbar__group">
				<span class="em-toolbar__label">Speed</span>
				<div class="em-segmented" role="group" aria-label="Playback speed">
					{#each [1, 4, 10] as spd (spd)}
						<button
							type="button"
							class="em-btn em-btn--segmented"
							aria-pressed={playbackSpeed === spd}
							data-testid={`speed-${spd}x`}
							onclick={() => {
								playbackSpeed = spd as 1 | 4 | 10;
							}}
						>
							{spd}×
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Contextual Experiment Control -->
		{#if experimentMode === 'bridge'}
			<div class="em-experiment-config" data-testid="bridge-experiment-controls">
				<div class="em-experiment-config__row">
					<div class="em-field-group">
						<div class="em-field">
							<label for="em-bridge-select-a">Community A bridge region</label>
							<select
								id="em-bridge-select-a"
								class="em-select"
								data-testid="bridge-select-a"
								value={proposedBridge.regionAId}
								onchange={(e) => handleSelectBridgeA((e.currentTarget as HTMLSelectElement).value)}
							>
								{#each communityARegions as reg (reg.id)}
									<option value={reg.id}>{reg.fullName}</option>
								{/each}
							</select>
						</div>

						<div class="em-field">
							<label for="em-bridge-select-b">Community B bridge region</label>
							<select
								id="em-bridge-select-b"
								class="em-select"
								data-testid="bridge-select-b"
								value={proposedBridge.regionBId}
								onchange={(e) => handleSelectBridgeB((e.currentTarget as HTMLSelectElement).value)}
							>
								{#each communityBRegions as reg (reg.id)}
									<option value={reg.id}>{reg.fullName}</option>
								{/each}
							</select>
						</div>

						<button
							type="button"
							class="em-btn"
							aria-pressed={mapBridgePickActive}
							data-testid="pick-bridge-map-btn"
							onclick={() => {
								mapBridgePickActive = !mapBridgePickActive;
								if (mapBridgePickActive) {
									statusBanner =
										'Map bridge selector active: click one region in Community A and one in Community B to preview a proposed bridge.';
								}
							}}
						>
							{mapBridgePickActive ? 'Finish map selection' : 'Pick bridge on map'}
						</button>

						{#if hasPendingBridgeChange}
							<button
								type="button"
								class="em-btn em-btn--primary"
								data-testid="apply-bridge-btn"
								onclick={() => applyBridgeSelection(proposedBridge, 'Applied proposed bridge')}
							>
								Apply proposed bridge ({proposedBridgeRegions.regA.shortLabel} ↔ {proposedBridgeRegions.regB.shortLabel})
							</button>
						{/if}

						<button
							type="button"
							class="em-btn"
							data-testid="restore-default-bridge-btn"
							disabled={activeBridge.regionAId === DEFAULT_BRIDGE_A_ID &&
								activeBridge.regionBId === DEFAULT_BRIDGE_B_ID &&
								!hasPendingBridgeChange}
							onclick={restoreDefaultBridge}
						>
							Restore default bridge
						</button>
					</div>
				</div>

				<p class="em-experiment-config__explain">
					<strong>The bridge adds contact between these regions. Existing contacts stay the same.</strong>
					In the disconnected scenario, Community B must remain uninfected. In the connected scenario,
					infection may reach it, but that outcome is not guaranteed. Line length does not affect transmission
					strength.
				</p>
			</div>
		{:else}
			<div class="em-experiment-config" data-testid="vaccination-experiment-controls">
				<div class="em-experiment-config__row">
					<div class="em-field-group">
						<div class="em-field">
							<label for="em-vaccine-budget-slider">
								Shared vaccine budget:
								<strong data-testid="vaccine-budget-readout">
									{vaccineBudget} doses ({vaccineBudgetPercentage}% of city)
								</strong>
							</label>
							<div class="em-range-wrap">
								<input
									id="em-vaccine-budget-slider"
									type="range"
									class="em-range"
									data-testid="vaccine-budget-slider"
									min={PARAMETER_BOUNDS.vaccineBudget.min}
									max={PARAMETER_BOUNDS.vaccineBudget.max}
									step={PARAMETER_BOUNDS.vaccineBudget.step}
									value={vaccineBudget}
									oninput={(e) =>
										handleVaccineBudgetChange(Number((e.currentTarget as HTMLInputElement).value))}
								/>
								<input
									type="number"
									class="em-input"
									style="width: 96px;"
									aria-label="Vaccine budget in doses"
									data-testid="vaccine-budget-input"
									min={PARAMETER_BOUNDS.vaccineBudget.min}
									max={PARAMETER_BOUNDS.vaccineBudget.max}
									step={PARAMETER_BOUNDS.vaccineBudget.step}
									value={vaccineBudget}
									onchange={(e) =>
										handleVaccineBudgetChange(Number((e.currentTarget as HTMLInputElement).value))}
								/>
							</div>
						</div>
					</div>

					<p class="em-experiment-config__explain">
						<strong>Vaccination gives immediate, complete protection in this model.</strong>
						Doses are placed at day zero among susceptible people only, while the 5 initial infections in
						{city.regionById.get(DEFAULT_INITIAL_INFECTED_REGION_ID)?.fullName} and the bridge ({activeBridgeRegions.regA.shortLabel}
						↔ {activeBridgeRegions.regB.shortLabel}) remain fixed across all three strategies.
					</p>
				</div>
			</div>
		{/if}
	</section>

	<!-- Live Status & Reset Banner -->
	<div class="em-banner" role="status" aria-live="polite" data-testid="status-banner">
		<span>{statusBanner}</span>
		<span style="font-family: ui-monospace, monospace; white-space: nowrap;">
			Day <strong>{currentDay.toFixed(1)}</strong> / {parameters.observationDays}
		</span>
	</div>

	<!-- Colour & Network Legend -->
	<div class="em-legend" aria-label="Compartment and network legend">
		<div class="em-legend__items">
			<span class="em-legend__item">
				<span class="em-Swatch em-Swatch--s" aria-hidden="true"></span>
				Susceptible (S)
			</span>
			<span class="em-legend__item">
				<span class="em-Swatch em-Swatch--i" aria-hidden="true"></span>
				Infectious (I)
			</span>
			<span class="em-legend__item">
				<span class="em-Swatch em-Swatch--r" aria-hidden="true"></span>
				Recovered (R)
			</span>
			<span class="em-legend__item">
				<span class="em-Swatch em-Swatch--v" aria-hidden="true"></span>
				Vaccinated (V · hatched)
			</span>
		</div>
		<span>
			Band <strong>areas</strong> inside each polygon match population fractions. At {playbackSpeed}×
			speed, one link pulse may aggregate several recorded transmissions.
		</span>
	</div>

	<!-- Narrow-Screen Scenario Switcher -->
	<div class="em-mobile-switcher" data-testid="mobile-scenario-switcher">
		<span class="em-toolbar__label">Visible city on narrow screen:</span>
		<div class="em-segmented" role="group" aria-label="Select scenario city to view">
			{#each activeScenarioCards as card (card.id)}
				<button
					type="button"
					class="em-btn em-btn--segmented"
					aria-pressed={mobileScenarioId === card.id}
					data-testid={`mobile-switch-${card.id}`}
					onclick={() => {
						mobileScenarioId = card.id;
					}}
				>
					{card.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Shared SVG Pattern Definitions -->
	<svg width="0" height="0" style="position: absolute; pointer-events: none;" aria-hidden="true">
		<defs>
			<pattern
				id="em-vaccinated-pattern"
				width="8"
				height="8"
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(-45)"
			>
				<rect width="8" height="8" fill="#8b72be" />
				<line x1="0" y1="0" x2="0" y2="8" stroke="#e4daf6" stroke-width="3.2" />
			</pattern>
		</defs>
	</svg>

	<!-- Synchronised City Mosaic Comparison Grid -->
	<div
		class="em-cities-grid--{experimentMode}"
		data-testid="city-comparison-grid"
	>
		{#each activeScenarioCards as card (card.id)}
			{@const isMobileHidden = mobileScenarioId !== card.id}
			{@const linkPulseByEdgeId = new Map(
				card.windowEvents.linkTransmissions.map((lt) => [lt.edgeId, lt])
			)}
			{@const localPulseByRegionIdx = new Map(
				card.windowEvents.localInfections.map((li) => [li.regionIndex, li])
			)}

			<article
				class="em-city-card {isMobileHidden ? 'em-city-card--hidden-mobile' : ''}"
				data-testid={`city-card-${card.id}`}
			>
				<header class="em-city-card__header">
					<h3 class="em-city-card__title">
						<span
							style="width: 10px; height: 10px; border-radius: 50%; background: {card.lineColor}; display: inline-block;"
							aria-hidden="true"
						></span>
						{card.label}
					</h3>
					<span class="em-city-card__badge">{card.badge}</span>
				</header>

				<div class="em-city-card__metrics" data-testid={`city-metrics-${card.id}`}>
					<span>
						Infectious now: <strong>{card.sampled.totalI}</strong>
					</span>
					<span>
						Infected so far: <strong>{card.sampled.cumulativeInfected}</strong>
					</span>
					<span>
						Comm. B infected: <strong>{card.sampled.communityBCumulativeInfected}</strong>
					</span>
					{#if experimentMode === 'vaccination'}
						<span>
							Vaccinated: <strong>{card.sampled.totalV}</strong>
						</span>
					{/if}
				</div>

				<svg
					viewBox="0 0 {LOGICAL_WIDTH} {LOGICAL_HEIGHT}"
					class="em-svg-stage"
					role="img"
					aria-label="{card.label} city mosaic at day {currentDay.toFixed(1)}"
					data-testid={`city-svg-${card.id}`}
				>
					<!-- Subtle Community Labels -->
					<text
						x="22"
						y="24"
						fill="#bac4c8"
						font-size="11.5"
						font-weight="700"
						letter-spacing="0.06em"
					>
						COMMUNITY A (18 REGIONS)
					</text>
					<text
						x={LOGICAL_WIDTH - 22}
						y="24"
						text-anchor="end"
						fill="#bac4c8"
						font-size="11.5"
						font-weight="700"
						letter-spacing="0.06em"
					>
						COMMUNITY B (18 REGIONS)
					</text>

					<!-- Layer 1: Voronoi Polygons & Area-Proportional Horizontal Bands -->
					<g data-layer="polygons">
						{#each city.regions as region, rIdx (region.id)}
							{@const bands = card.bandsByRegion[rIdx]}
							{@const isSelected = region.id === selectedRegionId}
							{@const isConnectedToSelected = selectedRegionNeighbourIndices.includes(rIdx)}
							{@const localPulse = localPulseByRegionIdx.get(rIdx)}

							<g
								class="em-polygon-hit"
								role="button"
								tabindex="0"
								aria-label="{region.fullName}, Community {region.community}: S {card.sampled.regionCounts[rIdx].S}, I {card.sampled.regionCounts[rIdx].I}, R {card.sampled.regionCounts[rIdx].R}, V {card.sampled.regionCounts[rIdx].V}"
								data-testid={`polygon-${card.id}-${region.id}`}
								data-region-id={region.id}
								onclick={() => handlePolygonSelect(region.id)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										handlePolygonSelect(region.id);
									}
								}}
							>
								<!-- Base Polygon Fill -->
								<path d={region.svgPath} fill="#25333d" />

								<!-- Clipped Horizontal Area-Proportional Bands -->
								{#each bands as band (band.compartment)}
									<path
										d={band.svgPath}
										fill={compartmentFill(band.compartment)}
										data-compartment={band.compartment}
									/>
								{/each}

								<!-- Stained-Glass Lead Border -->
								<path
									d={region.svgPath}
									fill="none"
									stroke={isSelected
										? '#ffffff'
										: isConnectedToSelected
											? '#ffd099'
											: '#101416'}
									stroke-width={isSelected ? 2.6 : isConnectedToSelected ? 1.85 : 1.35}
									stroke-linejoin="round"
								/>

								<!-- Subtle Inner Highlight When Local Transmission Occurs -->
								{#if localPulse}
									<path
										d={region.svgPath}
										fill="none"
										stroke="#ffbe73"
										stroke-width="2.1"
										stroke-opacity="0.85"
										pointer-events="none"
									/>
								{/if}
							</g>
						{/each}
					</g>

					<!-- Layer 2: Restrained Community Boundary Seam -->
					<g data-layer="community-seam" pointer-events="none">
						{#each city.communitySeamSegments as [p1, p2], sIdx (sIdx)}
							<line
								x1={p1[0]}
								y1={p1[1]}
								x2={p2[0]}
								y2={p2[1]}
								stroke="#0a0d0e"
								stroke-width="4.2"
								stroke-linecap="round"
							/>
							<line
								x1={p1[0]}
								y1={p1[1]}
								x2={p2[0]}
								y2={p2[1]}
								stroke="#6b7c85"
								stroke-width="1.35"
								stroke-dasharray="4 4"
								stroke-linecap="round"
							/>
						{/each}
					</g>

					<!-- Layer 3: Explicit Contact Network Edges -->
					<g data-layer="contact-edges" pointer-events="none">
						{#each card.edges as edge (edge.id)}
							{@const src = city.regions[edge.sourceIndex]}
							{@const tgt = city.regions[edge.targetIndex]}
							{@const touchesSelected =
								edge.sourceIndex === selectedRegion.index ||
								edge.targetIndex === selectedRegion.index}
							{@const pulse = linkPulseByEdgeId.get(edge.id)}

							<!-- Dark Casing for Readability Across Polygon Borders -->
							<line
								x1={src.centroid[0]}
								y1={src.centroid[1]}
								x2={tgt.centroid[0]}
								y2={tgt.centroid[1]}
								stroke="#0b0f12"
								stroke-width={edge.isBridge ? 5.2 : touchesSelected || pulse ? 3.8 : 2.5}
								stroke-linecap="round"
								opacity="0.85"
							/>

							<!-- Visible Contact Link -->
							<line
								x1={src.centroid[0]}
								y1={src.centroid[1]}
								x2={tgt.centroid[0]}
								y2={tgt.centroid[1]}
								stroke={pulse
									? '#ffd480'
									: edge.isBridge
										? '#ffaa4c'
										: touchesSelected
											? '#f3f1e9'
											: 'rgba(218, 228, 232, 0.44)'}
								stroke-width={pulse ? 3.1 : edge.isBridge ? 2.8 : touchesSelected ? 2.1 : 1.15}
								stroke-linecap="round"
								data-edge-id={edge.id}
								data-is-bridge={edge.isBridge ? 'true' : 'false'}
							/>

							<!-- Recorded Link Transmission Direction & Aggregated Count -->
							{#if pulse}
								{@const pSrc = city.regions[pulse.sourceRegionIndex]}
								{@const pTgt = city.regions[pulse.targetRegionIndex]}
								{@const mx = pSrc.centroid[0] * 0.38 + pTgt.centroid[0] * 0.62}
								{@const my = pSrc.centroid[1] * 0.38 + pTgt.centroid[1] * 0.62}
								<circle
									cx={mx}
									cy={my}
									r={pulse.count > 1 ? 6.5 : 4.2}
									fill="#ffaa4c"
									stroke="#101416"
									stroke-width="1.4"
								/>
								{#if pulse.count > 1}
									<text
										x={mx}
										y={my + 3}
										text-anchor="middle"
										font-size="8.2"
										font-weight="800"
										fill="#101416"
									>
										{pulse.count}
									</text>
								{/if}
							{/if}
						{/each}

						<!-- Clearly Marked Proposed Bridge Preview on "Without bridge" or when picking a new bridge -->
						{#if card.id === 'without-bridge' || hasPendingBridgeChange}
							{@const pA = proposedBridgeRegions.regA}
							{@const pB = proposedBridgeRegions.regB}
							<line
								x1={pA.centroid[0]}
								y1={pA.centroid[1]}
								x2={pB.centroid[0]}
								y2={pB.centroid[1]}
								stroke="#101416"
								stroke-width="4.4"
								stroke-dasharray="6 5"
								stroke-linecap="round"
								opacity="0.85"
							/>
							<line
								x1={pA.centroid[0]}
								y1={pA.centroid[1]}
								x2={pB.centroid[0]}
								y2={pB.centroid[1]}
								stroke="#ffaa4c"
								stroke-width="2.2"
								stroke-dasharray="6 5"
								stroke-linecap="round"
								opacity={card.id === 'without-bridge' ? 0.72 : 0.95}
								data-testid={`proposed-bridge-line-${card.id}`}
							/>
						{/if}
					</g>

					<!-- Layer 4: Explicit Junction Endpoint Rings & Short Region Codes -->
					<g data-layer="endpoints" pointer-events="none">
						{#each city.regions as region, rIdx (region.id)}
							{@const isInitialSeed = region.id === DEFAULT_INITIAL_INFECTED_REGION_ID}
							{@const isBridgeEndpoint =
								region.id === activeBridge.regionAId ||
								region.id === activeBridge.regionBId ||
								region.id === proposedBridge.regionAId ||
								region.id === proposedBridge.regionBId}
							{@const isSelected = region.id === selectedRegionId}

							<circle
								cx={region.centroid[0]}
								cy={region.centroid[1]}
								r={isSelected || isBridgeEndpoint || isInitialSeed ? 4.4 : 2.9}
								fill={isInitialSeed
									? '#ffaa4c'
									: isBridgeEndpoint
										? '#f3f1e9'
										: '#182227'}
								stroke="#0d1113"
								stroke-width="1.35"
							/>

							{#if isSelected || isBridgeEndpoint || isInitialSeed || card.sampled.regionCounts[rIdx].V >= 45}
								<text
									x={region.centroid[0]}
									y={region.centroid[1] - 7}
									text-anchor="middle"
									fill="#f3f1e9"
									stroke="#0d1113"
									stroke-width="2.8"
									paint-order="stroke"
									font-size="9.5"
									font-weight="700"
								>
									{region.shortLabel}
								</text>
							{/if}
						{/each}
					</g>
				</svg>

				{#if prefersReducedMotion && card.windowEvents.totalNewInfections > 0}
					<p class="em-experiment-config__explain" style="font-size: 0.79rem;">
						Recorded in latest interval: {card.windowEvents.totalNewInfections} new infections ({card
							.windowEvents.linkTransmissions.length} active cross-region links).
					</p>
				{/if}
			</article>
		{/each}
	</div>

	<!-- Always-Visible Scenario Summary Strip (Visible on both desktop and mobile) -->
	<section
		class="em-summary-strip"
		aria-label="Scenario comparison summary"
		data-testid="scenario-summaries"
	>
		{#each activeScenarioCards as card (card.id)}
			<div class="em-summary-card" data-testid={`summary-card-${card.id}`}>
				<div class="em-summary-card__top">
					<span>{card.label}</span>
					<span style="font-size: 0.78rem; color: var(--em-text-secondary);">
						By day {parameters.observationDays}: <strong>{card.result.totalInfectedByEnd}</strong> infected
					</span>
				</div>
				<div class="em-summary-card__stats">
					<span>Now I: <strong>{card.sampled.totalI}</strong></span>
					<span>So far (I+R): <strong>{card.sampled.cumulativeInfected}</strong></span>
					<span>Peak I: <strong>{card.result.peakInfectious}</strong></span>
					<span>
						Comm. B: <strong>{card.result.communityBReached ? `${card.result.communityBInfectedByEnd} infected` : 'Uninfected (0)'}</strong>
					</span>
				</div>
			</div>
		{/each}
	</section>

	<!-- Region Detail Panel + Main Time-Series Chart -->
	<div class="em-lower-grid">
		<!-- Compact Region Inspector Panel -->
		<section
			class="em-panel"
			aria-label="Selected region detail"
			data-testid="region-detail-panel"
		>
			<div class="em-detail-header">
				<div>
					<h3 class="em-detail-title" data-testid="selected-region-heading">
						{selectedRegion.fullName}
					</h3>
					<span style="font-size: 0.82rem; color: var(--em-text-secondary);">
						Community {selectedRegion.community} · Population {selectedRegion.population} ·
						<strong data-testid="selected-region-degree">
							{selectedRegionNeighbours.length} direct connections
						</strong>
					</span>
				</div>

				<div class="em-field">
					<label for="em-region-inspector-select">Inspect region</label>
					<select
						id="em-region-inspector-select"
						class="em-select"
						data-testid="region-inspector-select"
						value={selectedRegionId}
						onchange={(e) => handlePolygonSelect((e.currentTarget as HTMLSelectElement).value)}
					>
						<optgroup label="Community A (West)">
							{#each communityARegions as reg (reg.id)}
								<option value={reg.id}>{reg.fullName}</option>
							{/each}
						</optgroup>
						<optgroup label="Community B (East)">
							{#each communityBRegions as reg (reg.id)}
								<option value={reg.id}>{reg.fullName}</option>
							{/each}
						</optgroup>
					</select>
				</div>
			</div>

			<!-- Labelled Population Bar with Exact Values for each active scenario -->
			{#each activeScenarioCards as card (card.id)}
				{@const rc = card.sampled.regionCounts[selectedRegion.index]}
				<div class="em-pop-bar-wrap" data-testid={`region-pop-bar-${card.id}`}>
					<div
						style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--em-text-secondary);"
					>
						<strong>{card.label} (Day {currentDay.toFixed(1)})</strong>
						<span>Total: {rc.N} people</span>
					</div>
					<div
						class="em-pop-bar"
						role="img"
						aria-label="{card.label} population bar for {selectedRegion.fullName}: Susceptible {rc.S}, Vaccinated {rc.V}, Recovered {rc.R}, Infectious {rc.I}"
					>
						<div class="em-pop-bar__seg--s" style="width: {rc.S}%;"></div>
						<div class="em-pop-bar__seg--v" style="width: {rc.V}%;"></div>
						<div class="em-pop-bar__seg--r" style="width: {rc.R}%;"></div>
						<div class="em-pop-bar__seg--i" style="width: {rc.I}%;"></div>
					</div>
					<div class="em-pop-counts">
						<span>Susceptible (S): <strong>{rc.S}</strong></span>
						<span>Infectious (I): <strong>{rc.I}</strong></span>
						<span>Recovered (R): <strong>{rc.R}</strong></span>
						<span>Vaccinated (V): <strong>{rc.V}</strong></span>
					</div>
				</div>
			{/each}

			<p class="em-experiment-config__explain" style="margin-top: 0.65rem; font-size: 0.83rem;">
				<strong>Direct contact links ({selectedRegionNeighbours.length}):</strong>
				{selectedRegionNeighbours.map((n) => n.fullName).join(', ')}.
				{#if selectedRegion.id === 'A05'}
					<br />
					<em>Note on geometry vs network:</em> A5 · Market Cross physically borders
					<strong>A2 · Old Wharf</strong> and <strong>A8 · St Jude's</strong> without any contact line,
					yet has a direct long-range connection to <strong>A16 · South Downs</strong>.
				{/if}
			</p>
		</section>

		<!-- Main Time-Series Chart: People Infectious Over Time -->
		<section
			class="em-panel"
			aria-label="People infectious over time"
			data-testid="infectious-time-series-chart"
		>
			<div class="em-detail-header">
				<div>
					<h3 class="em-detail-title">People infectious over time</h3>
					<span style="font-size: 0.82rem; color: var(--em-text-secondary);">
						Same scale across scenarios · Axes in Days and People
					</span>
				</div>

				<div class="em-field-group" data-testid="playback-summary" style="font-size: 0.82rem;">
					<span>
						Day: <strong>{currentDay.toFixed(1)}</strong>
					</span>
					{#each activeScenarioCards as card (card.id)}
						<span style="color: {card.lineColor};">
							{card.label}: <strong>{card.sampled.totalI}</strong> now ({card.sampled
								.cumulativeInfected} total)
						</span>
					{/each}
				</div>
			</div>

			{#snippet timeSeriesSvg()}
				{@const svgW = 540}
				{@const svgH = 225}
				{@const padL = 46}
				{@const padR = 18}
				{@const padT = 16}
				{@const padB = 34}
				{@const plotW = svgW - padL - padR}
				{@const plotH = svgH - padT - padB}
				{@const curX =
					padL + (Math.min(parameters.observationDays, currentDay) / parameters.observationDays) * plotW}

				<svg
					viewBox="0 0 {svgW} {svgH}"
					class="em-chart-svg"
					role="img"
					aria-label="Line chart of people infectious over time in days"
				>
					<!-- Horizontal Grid Lines & Y-Axis Ticks (People) -->
					{#each [0, 0.25, 0.5, 0.75, 1] as frac (frac)}
						{@const val = Math.round(chartMaxInfectious * frac)}
						{@const y = padT + plotH - frac * plotH}
						<line
							x1={padL}
							y1={y}
							x2={svgW - padR}
							y2={y}
							stroke="#252f34"
							stroke-width="1"
						/>
						<text
							x={padL - 7}
							y={y + 3.5}
							text-anchor="end"
							fill="#bac4c8"
							font-size="10"
						>
							{val}
						</text>
					{/each}

					<!-- X-Axis Ticks (Days) -->
					{#each [0, 0.25, 0.5, 0.75, 1] as frac (frac)}
						{@const dayTick = Math.round(parameters.observationDays * frac)}
						{@const x = padL + frac * plotW}
						<line
							x1={x}
							y1={padT + plotH}
							x2={x}
							y2={padT + plotH + 4}
							stroke="#4b5a63"
							stroke-width="1"
						/>
						<text
							x={x}
							y={svgH - 12}
							text-anchor="middle"
							fill="#bac4c8"
							font-size="10"
						>
							Day {dayTick}
						</text>
					{/each}

					<!-- Axis Titles -->
					<text
						x="13"
						y={padT + plotH / 2}
						text-anchor="middle"
						fill="#bac4c8"
						font-size="10"
						transform="rotate(-90, 13, {padT + plotH / 2})"
					>
						People infectious
					</text>

					<!-- Full-run faint preview curves -->
					{#each activeScenarioCards as card (card.id)}
						<path
							d={buildTimeSeriesPath(
								card.result,
								parameters.observationDays,
								svgW,
								svgH,
								padL,
								padR,
								padT,
								padB
							)}
							fill="none"
							stroke={card.lineColor}
							stroke-width="1.35"
							stroke-dasharray={card.lineDash === 'none' ? undefined : card.lineDash}
							opacity="0.32"
						/>
					{/each}

					<!-- Active curves up to currentDay -->
					{#each activeScenarioCards as card (card.id)}
						<path
							d={buildTimeSeriesPath(
								card.result,
								Math.max(1, currentDay),
								svgW,
								svgH,
								padL,
								padR,
								padT,
								padB
							)}
							fill="none"
							stroke={card.lineColor}
							stroke-width="2.6"
							stroke-dasharray={card.lineDash === 'none' ? undefined : card.lineDash}
						/>
					{/each}

					<!-- Current Day Vertical Cursor -->
					<line
						x1={curX}
						y1={padT}
						x2={curX}
						y2={padT + plotH}
						stroke="#f3f1e9"
						stroke-width="1.2"
						stroke-dasharray="3 3"
					/>
				</svg>
			{/snippet}

			{@render timeSeriesSvg()}

			<!-- Interactive Time Scrubber -->
			<div
				style="display: flex; align-items: center; gap: 0.75rem; margin-top: 0.55rem; font-size: 0.82rem; color: var(--em-text-secondary);"
			>
				<label for="em-day-scrubber" style="white-space: nowrap;">Scrub day:</label>
				<input
					id="em-day-scrubber"
					type="range"
					class="em-range"
					style="flex: 1; width: auto;"
					data-testid="day-scrubber"
					min="0"
					max={parameters.observationDays}
					step="0.5"
					value={currentDay}
					oninput={(e) => {
						stopAnimationLoop();
						const next = Number((e.currentTarget as HTMLInputElement).value);
						previousWindowStartDay = Math.max(0, next - 1);
						currentDay = next;
					}}
				/>
			</div>
		</section>
	</div>

	<!-- 20-Run Batch Comparison Panel (Variation Between Runs) -->
	<section
		class="em-panel"
		aria-label="Repeated runs comparison"
		data-testid="batch-comparison-panel"
	>
		<div class="em-detail-header">
			<div>
				<h3 class="em-detail-title">
					Variation between runs ({batchResult.repetitions} repetitions · {batchResult.observationDays}
					days)
				</h3>
				<p class="em-experiment-config__explain" style="font-size: 0.84rem;">
					Because transmission is stochastic, one simulation can die out early while another spreads
					widely. Each dot below is one complete run using a stored outbreak seed; vertical bars mark the
					median. Early extinctions are retained.
				</p>
			</div>

			<div class="em-toolbar__group">
				{#if batchRunning}
					<span
						style="font-size: 0.83rem; font-family: ui-monospace, monospace;"
						data-testid="batch-progress"
					>
						Running {batchCompletedRuns} / {batchTotalRuns}…
					</span>
					<button
						type="button"
						class="em-btn"
						data-testid="cancel-batch-btn"
						onclick={cancelBatch}
					>
						Cancel
					</button>
				{:else}
					<button
						type="button"
						class="em-btn"
						data-testid="repeat-20-btn"
						onclick={() => triggerBatchRecompute()}
					>
						Repeat 20 times
					</button>
				{/if}
			</div>
		</div>

		<!-- Dot Plot of People Infected by End of Observation Window -->
		{#snippet batchDotPlot()}
			{@const dotW = 680}
			{@const rowH = 44}
			{@const padL = 165}
			{@const padR = 28}
			{@const padT = 18}
			{@const padB = 28}
			{@const dotH = padT + batchResult.scenarios.length * rowH + padB}
			{@const plotW = dotW - padL - padR}

			<svg
				viewBox="0 0 {dotW} {dotH}"
				class="em-chart-svg"
				role="img"
				aria-label="Dot plot showing people infected by day {batchResult.observationDays} across {batchResult.repetitions} stochastic runs"
				data-testid="batch-dot-plot-svg"
			>
				{#each [0, 900, 1800, 2700, 3600] as tick (tick)}
					{@const x = padL + (tick / TOTAL_CITY_POPULATION) * plotW}
					<line
						x1={x}
						y1={padT - 4}
						x2={x}
						y2={dotH - padB}
						stroke="#252f34"
						stroke-width="1"
					/>
					<text
						x={x}
						y={dotH - 8}
						text-anchor="middle"
						fill="#bac4c8"
						font-size="10"
					>
						{tick} people
					</text>
				{/each}

				{#each batchResult.scenarios as scen, sIdx (scen.scenarioId)}
					{@const cy = padT + sIdx * rowH + rowH * 0.5}
					{@const medX = padL + (scen.medianInfectedByEnd / TOTAL_CITY_POPULATION) * plotW}

					<text
						x={padL - 12}
						y={cy + 4}
						text-anchor="end"
						fill="#f3f1e9"
						font-size="11.5"
						font-weight="700"
					>
						{scen.scenarioLabel}
					</text>

					<line
						x1={padL}
						y1={cy}
						x2={dotW - padR}
						y2={cy}
						stroke="#2c373d"
						stroke-width="1.5"
					/>

					{#each scen.runs as run (run.runIndex)}
						{@const rx = padL + (run.totalInfectedByEnd / TOTAL_CITY_POPULATION) * plotW}
						{@const jitterY = ((run.runIndex % 5) - 2) * 2.6}
						<circle
							cx={rx}
							cy={cy + jitterY}
							r="4.2"
							fill={run.communityBReached ? '#ffaa4c' : '#7ec8e3'}
							fill-opacity="0.78"
							stroke="#101416"
							stroke-width="1"
						>
							<title>
								Run #{run.runIndex} (seed {run.outbreakSeed}): {run.totalInfectedByEnd} infected, peak {run.peakInfectious}
							</title>
						</circle>
					{/each}

					<!-- Median Marker Line -->
					<line
						x1={medX}
						y1={cy - 12}
						x2={medX}
						y2={cy + 12}
						stroke="#ffffff"
						stroke-width="2.8"
					/>
				{/each}
			</svg>
		{/snippet}

		{@render batchDotPlot()}

		<!-- Explicit Batch Summary Table -->
		<div style="overflow-x: auto;">
			<table class="em-batch-table" data-testid="batch-summary-table">
				<thead>
					<tr>
						<th>Scenario</th>
						<th>People infected by day {batchResult.observationDays} (median · range)</th>
						<th>Peak infectious at once (median · range)</th>
						<th>Runs where Community B was reached</th>
						<th>Early extinctions</th>
					</tr>
				</thead>
				<tbody>
					{#each batchResult.scenarios as scen (scen.scenarioId)}
						<tr data-testid={`batch-row-${scen.scenarioId}`}>
							<td><strong>{scen.scenarioLabel}</strong></td>
							<td>
								<strong>{scen.medianInfectedByEnd}</strong>
								({scen.minInfectedByEnd}–{scen.maxInfectedByEnd})
							</td>
							<td>
								<strong>{scen.medianPeakInfectious}</strong>
								({scen.minPeakInfectious}–{scen.maxPeakInfectious})
							</td>
							<td>
								<strong>{scen.communityBReachedCount} / {scen.repetitions}</strong>
							</td>
							<td>{scen.earlyExtinctionCount} / {scen.repetitions}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<!-- Secondary Disclosure: Model Details & Parameter Inputs -->
	<details class="em-disclosure" data-testid="model-details-disclosure">
		<summary>
			<span>Model details, stochastic equations &amp; parameter controls</span>
			<span style="font-size: 0.82rem; color: var(--em-text-secondary);">
				Gillespie direct method · Seed {parameters.outbreakSeed}
			</span>
		</summary>

		<div class="em-disclosure__body">
			<div class="em-disclosure__params">
				<div class="em-field">
					<label for="em-param-beta-local">
						Within-region transmission (β<sub>local</sub>, per day):
						<strong>{parameters.betaLocal.toFixed(2)}</strong>
					</label>
					<input
						id="em-param-beta-local"
						type="number"
						class="em-input"
						data-testid="param-beta-local"
						min={PARAMETER_BOUNDS.betaLocal.min}
						max={PARAMETER_BOUNDS.betaLocal.max}
						step={PARAMETER_BOUNDS.betaLocal.step}
						value={parameters.betaLocal}
						onchange={(e) =>
							updateParameter('betaLocal', Number((e.currentTarget as HTMLInputElement).value))}
					/>
				</div>

				<div class="em-field">
					<label for="em-param-beta-link">
						Connection transmission (β<sub>link</sub>, per day):
						<strong>{parameters.betaLink.toFixed(3)}</strong>
					</label>
					<input
						id="em-param-beta-link"
						type="number"
						class="em-input"
						data-testid="param-beta-link"
						min={PARAMETER_BOUNDS.betaLink.min}
						max={PARAMETER_BOUNDS.betaLink.max}
						step={PARAMETER_BOUNDS.betaLink.step}
						value={parameters.betaLink}
						onchange={(e) =>
							updateParameter('betaLink', Number((e.currentTarget as HTMLInputElement).value))}
					/>
				</div>

				<div class="em-field">
					<label for="em-param-infectious-period">
						Mean infectious period (1/γ, days):
						<strong>{parameters.infectiousPeriodDays}</strong>
					</label>
					<input
						id="em-param-infectious-period"
						type="number"
						class="em-input"
						data-testid="param-infectious-period"
						min={PARAMETER_BOUNDS.infectiousPeriodDays.min}
						max={PARAMETER_BOUNDS.infectiousPeriodDays.max}
						step={PARAMETER_BOUNDS.infectiousPeriodDays.step}
						value={parameters.infectiousPeriodDays}
						onchange={(e) =>
							updateParameter(
								'infectiousPeriodDays',
								Number((e.currentTarget as HTMLInputElement).value)
							)}
					/>
				</div>

				<div class="em-field">
					<label for="em-param-obs-days">
						Observation window (days):
						<strong>{parameters.observationDays}</strong>
					</label>
					<input
						id="em-param-obs-days"
						type="number"
						class="em-input"
						data-testid="param-observation-days"
						min={PARAMETER_BOUNDS.observationDays.min}
						max={PARAMETER_BOUNDS.observationDays.max}
						step={PARAMETER_BOUNDS.observationDays.step}
						value={parameters.observationDays}
						onchange={(e) =>
							updateParameter(
								'observationDays',
								Number((e.currentTarget as HTMLInputElement).value)
							)}
					/>
				</div>

				<div class="em-field">
					<label for="em-param-seed">
						Outbreak random seed:
						<strong>{parameters.outbreakSeed}</strong>
					</label>
					<input
						id="em-param-seed"
						type="number"
						class="em-input"
						data-testid="param-outbreak-seed"
						min={PARAMETER_BOUNDS.outbreakSeed.min}
						max={PARAMETER_BOUNDS.outbreakSeed.max}
						step="1"
						value={parameters.outbreakSeed}
						onchange={(e) =>
							updateParameter('outbreakSeed', Number((e.currentTarget as HTMLInputElement).value))}
					/>
				</div>
			</div>

			<p style="margin: 0;">
				<strong>Continuous-time Markov chain (Gillespie direct method):</strong> Each region
				<code>i</code> tracks integer counts <code>S_i + I_i + R_i + V_i = N_i = 100</code>. Each
				susceptible resident experiences infection hazard
				<code>λ_i = β_local (I_i / N_i) + β_link Σ w_ij (I_j / N_j)</code>, and each infectious
				resident recovers at rate <code>γ = 1 / (infectious period)</code>. Adding a bridge inserts
				one undirected edge of weight <code>w_AB = 1</code> without normalising existing contact weights.
			</p>

			<p style="margin: 0;">
				<strong>Deterministic equal-budget vaccine allocation:</strong> All three strategies allocate
				integer doses at <code>t = 0</code> among eligible susceptible people only (preserving the 5
				initial infections in A5 · Market Cross). Fractional quotas are rounded using largest-remainder
				(Hamilton) allocation with explicit per-region capacity caps and overflow redistribution:
				<em>Spread evenly</em> allocates proportionally to eligible population;
				<em>Most connections</em> fills regions in descending tiers of total contact weight; and
				<em>Around the bridge</em> prioritises the two bridge endpoints (1.5× weight) and their directly
				connected one-hop neighbours (1.0× weight) before overflowing outward by graph hop distance.
			</p>

			<p style="margin: 0; font-size: 0.85rem;">
				<strong>References:</strong> Inspired by
				<a
					href="https://link.springer.com/chapter/10.1007/978-0-387-22437-4_10"
					target="_blank"
					rel="noopener noreferrer"
					style="color: var(--em-text-main);"
				>
					J. D. Murray, <em>Mathematical Biology I: An Introduction</em>, Chapter 10 (Dynamics of Infectious Diseases)
				</a>
				and L. J. S. Allen (2017),
				<a
					href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6002090/"
					target="_blank"
					rel="noopener noreferrer"
					style="color: var(--em-text-main);"
				>
					<em>A primer on stochastic epidemic models: Formulation, numerical simulation, and analysis</em>
				</a>.
			</p>
		</div>
	</details>
</div>
