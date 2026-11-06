import { buildScenarioEdges, normalizeBridgeSelection } from './city.ts';
import { buildOutbreakSeedList, createSeededRng, normalizeSeed } from './random.ts';
import {
	DEFAULT_BATCH_REPETITIONS,
	DEFAULT_EPIDEMIC_PARAMETERS,
	DEFAULT_INITIAL_INFECTED_REGION_ID,
	DEFAULT_VACCINE_BUDGET,
	INITIAL_INFECTIONS,
	PARAMETER_BOUNDS,
	REGIONS_PER_COMMUNITY,
	type AggregatedLinkTransmission,
	type AggregatedLocalInfection,
	type BatchComparisonResult,
	type BatchRunSummaryItem,
	type BridgeScenarioId,
	type BridgeSelection,
	type CityNetwork,
	type ContactEdge,
	type DailySeriesPoint,
	type EpidemicParameters,
	type ExperimentMode,
	type OutbreakEvent,
	type OutbreakEventType,
	type OutbreakSimulationResult,
	type PlaybackWindowEvents,
	type RegionCompartmentCounts,
	type SampledCityState,
	type ScenarioBatchSummary,
	type ScenarioId,
	type VaccinationStrategyId
} from './types.ts';
import {
	VACCINATION_STRATEGIES,
	VACCINATION_STRATEGY_ORDER,
	allocateVaccines,
	buildInitialRegionCounts,
	normalizeVaccineBudget
} from './vaccination.ts';

function clampParam(value: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, value));
}

export function normalizeEpidemicParameters(
	partial?: Partial<EpidemicParameters> | null
): EpidemicParameters {
	return {
		betaLocal: Number(
			clampParam(
				partial?.betaLocal ?? DEFAULT_EPIDEMIC_PARAMETERS.betaLocal,
				PARAMETER_BOUNDS.betaLocal.min,
				PARAMETER_BOUNDS.betaLocal.max,
				DEFAULT_EPIDEMIC_PARAMETERS.betaLocal
			).toFixed(4)
		),
		betaLink: Number(
			clampParam(
				partial?.betaLink ?? DEFAULT_EPIDEMIC_PARAMETERS.betaLink,
				PARAMETER_BOUNDS.betaLink.min,
				PARAMETER_BOUNDS.betaLink.max,
				DEFAULT_EPIDEMIC_PARAMETERS.betaLink
			).toFixed(4)
		),
		infectiousPeriodDays: Number(
			clampParam(
				partial?.infectiousPeriodDays ?? DEFAULT_EPIDEMIC_PARAMETERS.infectiousPeriodDays,
				PARAMETER_BOUNDS.infectiousPeriodDays.min,
				PARAMETER_BOUNDS.infectiousPeriodDays.max,
				DEFAULT_EPIDEMIC_PARAMETERS.infectiousPeriodDays
			).toFixed(2)
		),
		observationDays: Math.round(
			clampParam(
				partial?.observationDays ?? DEFAULT_EPIDEMIC_PARAMETERS.observationDays,
				PARAMETER_BOUNDS.observationDays.min,
				PARAMETER_BOUNDS.observationDays.max,
				DEFAULT_EPIDEMIC_PARAMETERS.observationDays
			)
		),
		outbreakSeed: normalizeSeed(
			partial?.outbreakSeed ?? DEFAULT_EPIDEMIC_PARAMETERS.outbreakSeed,
			DEFAULT_EPIDEMIC_PARAMETERS.outbreakSeed
		)
	};
}

interface ActiveChannel {
	type: OutbreakEventType;
	targetRegionIndex: number;
	sourceRegionIndex: number;
	rate: number;
}

function cloneCounts(counts: readonly RegionCompartmentCounts[]): RegionCompartmentCounts[] {
	return counts.map((c) => ({ S: c.S, I: c.I, R: c.R, V: c.V, N: c.N }));
}

function summarizeDailyPoint(
	day: number,
	counts: readonly RegionCompartmentCounts[]
): DailySeriesPoint {
	let totalS = 0;
	let totalI = 0;
	let totalR = 0;
	let totalV = 0;
	let communityAI = 0;
	let communityBI = 0;
	let communityACumulativeInfected = 0;
	let communityBCumulativeInfected = 0;

	for (let i = 0; i < counts.length; i++) {
		const c = counts[i];
		totalS += c.S;
		totalI += c.I;
		totalR += c.R;
		totalV += c.V;
		const cum = c.I + c.R;
		if (i < REGIONS_PER_COMMUNITY) {
			communityAI += c.I;
			communityACumulativeInfected += cum;
		} else {
			communityBI += c.I;
			communityBCumulativeInfected += cum;
		}
	}

	return {
		day,
		totalS,
		totalI,
		totalR,
		totalV,
		cumulativeInfected: totalI + totalR,
		communityAI,
		communityBI,
		communityACumulativeInfected,
		communityBCumulativeInfected
	};
}

/**
 * Simulates one stochastic SIRV outbreak on the regional contact network using
 * Gillespie's direct method with separate event channels:
 * - Local infection in i: beta_local * S_i * I_i / N_i
 * - Infection in i from j: beta_link * w_ij * S_i * I_j / N_j
 * - Recovery in i: gamma * I_i
 */
export function simulateOutbreak(options: {
	city: CityNetwork;
	edges: readonly ContactEdge[];
	initialCounts: readonly RegionCompartmentCounts[];
	parameters?: Partial<EpidemicParameters>;
	scenarioId?: ScenarioId;
	scenarioLabel?: string;
	bridge?: BridgeSelection | null;
	vaccineStrategy?: VaccinationStrategyId | null;
	vaccineBudget?: number;
}): OutbreakSimulationResult {
	const params = normalizeEpidemicParameters(options.parameters);
	const {
		city,
		edges,
		scenarioId = 'without-bridge',
		scenarioLabel = 'Without bridge',
		bridge = null,
		vaccineStrategy = null,
		vaccineBudget = 0
	} = options;

	const regionCount = city.regions.length;
	const initialCounts = cloneCounts(options.initialCounts);
	const workingCounts = cloneCounts(options.initialCounts);

	// Build sorted adjacency list so channel ordering is strictly deterministic
	const adjMap = new Map<number, Map<number, number>>();
	for (let i = 0; i < regionCount; i++) {
		adjMap.set(i, new Map<number, number>());
	}
	for (const e of edges) {
		if (e.weight <= 0 || e.sourceIndex === e.targetIndex) continue;
		const u = e.sourceIndex;
		const v = e.targetIndex;
		const mapU = adjMap.get(u)!;
		const mapV = adjMap.get(v)!;
		mapU.set(v, (mapU.get(v) ?? 0) + e.weight);
		mapV.set(u, (mapV.get(u) ?? 0) + e.weight);
	}

	const neighbors: Array<Array<{ neighborIndex: number; weight: number }>> = [];
	for (let i = 0; i < regionCount; i++) {
		const entries = Array.from(adjMap.get(i)!.entries())
			.map(([neighborIndex, weight]) => ({ neighborIndex, weight }))
			.sort((a, b) => a.neighborIndex - b.neighborIndex);
		neighbors.push(entries);
	}

	const rng = createSeededRng(params.outbreakSeed);
	const betaLocal = params.betaLocal;
	const betaLink = params.betaLink;
	const gamma = params.infectiousPeriodDays > 0 ? 1 / params.infectiousPeriodDays : 0;
	const maxTime = params.observationDays;

	const events: OutbreakEvent[] = [];
	let currentTime = 0;
	let currentTotalI = workingCounts.reduce((sum, c) => sum + c.I, 0);
	let peakInfectious = currentTotalI;
	let peakInfectiousDay = 0;
	let endedByExtinction = currentTotalI === 0;
	let lastEventDay = 0;

	const maxPossibleEvents = regionCount * 250; // Upper safety bound (actual max is <= 2 * 3,600 = 7,200)
	const channels: ActiveChannel[] = [];

	for (let step = 0; step < maxPossibleEvents; step++) {
		if (currentTotalI <= 0) {
			endedByExtinction = true;
			break;
		}

		channels.length = 0;
		let totalRate = 0;

		for (let i = 0; i < regionCount; i++) {
			const ci = workingCounts[i];
			const Si = ci.S;
			const Ii = ci.I;
			const Ni = ci.N;

			if (Si > 0 && Ni > 0) {
				// 1. Local infection channel in region i
				if (Ii > 0 && betaLocal > 0) {
					const rLocal = (betaLocal * Si * Ii) / Ni;
					if (rLocal > 0) {
						channels.push({
							type: 'local-infection',
							targetRegionIndex: i,
							sourceRegionIndex: i,
							rate: rLocal
						});
						totalRate += rLocal;
					}
				}

				// 2. Link infection channels in region i from connected neighbours j
				if (betaLink > 0) {
					const nbrs = neighbors[i];
					for (let k = 0; k < nbrs.length; k++) {
						const { neighborIndex: j, weight: wij } = nbrs[k];
						const cj = workingCounts[j];
						if (cj.I > 0 && cj.N > 0 && wij > 0) {
							const rLink = (betaLink * wij * Si * cj.I) / cj.N;
							if (rLink > 0) {
								channels.push({
									type: 'link-infection',
									targetRegionIndex: i,
									sourceRegionIndex: j,
									rate: rLink
								});
								totalRate += rLink;
							}
						}
					}
				}
			}

			// 3. Recovery channel in region i
			if (Ii > 0 && gamma > 0) {
				const rRec = gamma * Ii;
				if (rRec > 0) {
					channels.push({
						type: 'recovery',
						targetRegionIndex: i,
						sourceRegionIndex: i,
						rate: rRec
					});
					totalRate += rRec;
				}
			}
		}

		if (totalRate <= 0 || channels.length === 0) {
			endedByExtinction = currentTotalI === 0;
			break;
		}

		const u1 = rng();
		const dt = -Math.log(u1) / totalRate;
		const nextTime = currentTime + dt;

		if (nextTime > maxTime) {
			// Observation window ends before the next event
			endedByExtinction = false;
			break;
		}

		const u2 = rng();
		const threshold = u2 * totalRate;
		let cumulative = 0;
		let chosen = channels[channels.length - 1];
		for (let cIdx = 0; cIdx < channels.length; cIdx++) {
			cumulative += channels[cIdx].rate;
			if (threshold < cumulative) {
				chosen = channels[cIdx];
				break;
			}
		}

		currentTime = nextTime;
		lastEventDay = currentTime;

		const targetCounts = workingCounts[chosen.targetRegionIndex];
		if (chosen.type === 'local-infection' || chosen.type === 'link-infection') {
			targetCounts.S -= 1;
			targetCounts.I += 1;
			currentTotalI += 1;
			if (currentTotalI > peakInfectious) {
				peakInfectious = currentTotalI;
				peakInfectiousDay = currentTime;
			}
		} else {
			targetCounts.I -= 1;
			targetCounts.R += 1;
			currentTotalI -= 1;
		}

		events.push({
			step: events.length,
			time: currentTime,
			type: chosen.type,
			targetRegionIndex: chosen.targetRegionIndex,
			sourceRegionIndex: chosen.sourceRegionIndex
		});

		if (currentTotalI <= 0) {
			endedByExtinction = true;
			break;
		}
	}

	// Build daily series by replaying events across integer days 0..maxTime
	const replayCounts = cloneCounts(initialCounts);
	const dailySeries: DailySeriesPoint[] = [];
	let evCursor = 0;

	for (let day = 0; day <= maxTime; day++) {
		while (evCursor < events.length && events[evCursor].time <= day + 1e-12) {
			const ev = events[evCursor];
			const rc = replayCounts[ev.targetRegionIndex];
			if (ev.type === 'local-infection' || ev.type === 'link-infection') {
				rc.S -= 1;
				rc.I += 1;
			} else {
				rc.I -= 1;
				rc.R += 1;
			}
			evCursor++;
		}
		dailySeries.push(summarizeDailyPoint(day, replayCounts));
	}

	const finalPoint = dailySeries[dailySeries.length - 1];

	return {
		scenarioId,
		scenarioLabel,
		outbreakSeed: params.outbreakSeed,
		parameters: params,
		bridge: bridge ? { ...bridge } : null,
		vaccineStrategy,
		vaccineBudget,
		initialCounts,
		finalCounts: workingCounts,
		events,
		dailySeries,
		endedByExtinction,
		lastEventDay,
		totalInfectedByEnd: finalPoint.cumulativeInfected,
		peakInfectious,
		peakInfectiousDay,
		communityBReached: finalPoint.communityBCumulativeInfected > 0,
		communityAInfectedByEnd: finalPoint.communityACumulativeInfected,
		communityBInfectedByEnd: finalPoint.communityBCumulativeInfected
	};
}

/**
 * Samples the exact regional counts and summary statistics at any continuous playback time t in [0, observationDays].
 * Playback speed, pausing, or UI inspection only calls this pure reader without mutating the simulated run.
 */
export function sampleCityStateAtTime(
	result: OutbreakSimulationResult,
	timeDays: number
): SampledCityState {
	const clampedDay = Math.max(0, Math.min(result.parameters.observationDays, timeDays));
	const regionCounts = cloneCounts(result.initialCounts);

	for (let i = 0; i < result.events.length; i++) {
		const ev = result.events[i];
		if (ev.time > clampedDay + 1e-12) break;
		const rc = regionCounts[ev.targetRegionIndex];
		if (ev.type === 'local-infection' || ev.type === 'link-infection') {
			rc.S -= 1;
			rc.I += 1;
		} else {
			rc.I -= 1;
			rc.R += 1;
		}
	}

	const summary = summarizeDailyPoint(clampedDay, regionCounts);
	const isEnded =
		clampedDay >= result.parameters.observationDays ||
		(result.endedByExtinction && clampedDay >= result.lastEventDay);

	return {
		day: clampedDay,
		regionCounts,
		totalS: summary.totalS,
		totalI: summary.totalI,
		totalR: summary.totalR,
		totalV: summary.totalV,
		cumulativeInfected: summary.cumulativeInfected,
		communityAI: summary.communityAI,
		communityBI: summary.communityBI,
		communityACumulativeInfected: summary.communityACumulativeInfected,
		communityBCumulativeInfected: summary.communityBCumulativeInfected,
		isEnded
	};
}

/**
 * Extracts and aggregates recorded transmission events in the interval (fromDay, toDay].
 * Guarantees that visual link pulses and local region highlights are 100% backed by recorded model events.
 */
export function getPlaybackWindowEvents(
	city: CityNetwork,
	result: OutbreakSimulationResult,
	fromDay: number,
	toDay: number
): PlaybackWindowEvents {
	if (toDay <= fromDay) {
		return { linkTransmissions: [], localInfections: [], totalNewInfections: 0 };
	}

	const linkMap = new Map<string, AggregatedLinkTransmission>();
	const localMap = new Map<number, AggregatedLocalInfection>();
	let totalNewInfections = 0;

	for (let i = 0; i < result.events.length; i++) {
		const ev = result.events[i];
		if (ev.time <= fromDay) continue;
		if (ev.time > toDay) break;

		if (ev.type === 'link-infection') {
			totalNewInfections += 1;
			const srcReg = city.regions[ev.sourceRegionIndex];
			const tgtReg = city.regions[ev.targetRegionIndex];
			const dirKey = `${srcReg.id}->${tgtReg.id}`;
			const a = Math.min(ev.sourceRegionIndex, ev.targetRegionIndex);
			const b = Math.max(ev.sourceRegionIndex, ev.targetRegionIndex);
			const edgeId = `${city.regions[a].id}--${city.regions[b].id}`;
			const existing = linkMap.get(dirKey);
			if (existing) {
				existing.count += 1;
				existing.latestTime = ev.time;
			} else {
				linkMap.set(dirKey, {
					edgeId,
					sourceRegionIndex: ev.sourceRegionIndex,
					targetRegionIndex: ev.targetRegionIndex,
					sourceId: srcReg.id,
					targetId: tgtReg.id,
					count: 1,
					latestTime: ev.time
				});
			}
		} else if (ev.type === 'local-infection') {
			totalNewInfections += 1;
			const reg = city.regions[ev.targetRegionIndex];
			const existing = localMap.get(ev.targetRegionIndex);
			if (existing) {
				existing.count += 1;
				existing.latestTime = ev.time;
			} else {
				localMap.set(ev.targetRegionIndex, {
					regionIndex: ev.targetRegionIndex,
					regionId: reg.id,
					count: 1,
					latestTime: ev.time
				});
			}
		}
	}

	return {
		linkTransmissions: Array.from(linkMap.values()),
		localInfections: Array.from(localMap.values()),
		totalNewInfections
	};
}

/**
 * Runs Experiment 1 ("Add a bridge"): compares `Without bridge` and `With one bridge`
 * from day zero with identical geometry, populations, initial infections, parameters, and outbreak seed.
 */
export function compareBridgeScenarios(options: {
	city: CityNetwork;
	bridge?: Partial<BridgeSelection> | null;
	parameters?: Partial<EpidemicParameters>;
	initialInfectedRegionId?: string;
	initialInfections?: number;
}): {
	bridge: BridgeSelection;
	withoutBridge: OutbreakSimulationResult;
	withBridge: OutbreakSimulationResult;
	withoutBridgeEdges: ContactEdge[];
	withBridgeEdges: ContactEdge[];
} {
	const {
		city,
		initialInfectedRegionId = DEFAULT_INITIAL_INFECTED_REGION_ID,
		initialInfections = INITIAL_INFECTIONS
	} = options;
	const params = normalizeEpidemicParameters(options.parameters);
	const cleanBridge = normalizeBridgeSelection(city, options.bridge);

	const initialCounts = buildInitialRegionCounts({
		city,
		initialInfectedRegionId,
		initialInfections
	});

	const withoutBridgeEdges = buildScenarioEdges(city, null);
	const withBridgeEdges = buildScenarioEdges(city, cleanBridge);

	const withoutBridge = simulateOutbreak({
		city,
		edges: withoutBridgeEdges,
		initialCounts,
		parameters: params,
		scenarioId: 'without-bridge',
		scenarioLabel: 'Without bridge',
		bridge: null,
		vaccineStrategy: null,
		vaccineBudget: 0
	});

	const withBridge = simulateOutbreak({
		city,
		edges: withBridgeEdges,
		initialCounts,
		parameters: params,
		scenarioId: 'with-bridge',
		scenarioLabel: 'With one bridge',
		bridge: cleanBridge,
		vaccineStrategy: null,
		vaccineBudget: 0
	});

	return {
		bridge: cleanBridge,
		withoutBridge,
		withBridge,
		withoutBridgeEdges,
		withBridgeEdges
	};
}

/**
 * Runs Experiment 2 ("Place the same vaccines"): holds the bridge-connected network fixed
 * and compares `Spread evenly`, `Most connections`, and `Around the bridge` with the exact same dose budget.
 */
export function compareVaccinationStrategies(options: {
	city: CityNetwork;
	bridge?: Partial<BridgeSelection> | null;
	vaccineBudget?: number;
	parameters?: Partial<EpidemicParameters>;
	initialInfectedRegionId?: string;
	initialInfections?: number;
}): {
	bridge: BridgeSelection;
	vaccineBudget: number;
	edges: ContactEdge[];
	allocations: Record<VaccinationStrategyId, number[]>;
	results: Record<VaccinationStrategyId, OutbreakSimulationResult>;
} {
	const {
		city,
		initialInfectedRegionId = DEFAULT_INITIAL_INFECTED_REGION_ID,
		initialInfections = INITIAL_INFECTIONS
	} = options;
	const params = normalizeEpidemicParameters(options.parameters);
	const cleanBridge = normalizeBridgeSelection(city, options.bridge);
	const budget = normalizeVaccineBudget(options.vaccineBudget ?? DEFAULT_VACCINE_BUDGET);
	const edges = buildScenarioEdges(city, cleanBridge);

	const allocations = {} as Record<VaccinationStrategyId, number[]>;
	const results = {} as Record<VaccinationStrategyId, OutbreakSimulationResult>;

	for (const strategyId of VACCINATION_STRATEGY_ORDER) {
		const meta = VACCINATION_STRATEGIES[strategyId];
		const doses = allocateVaccines({
			city,
			edges,
			bridge: cleanBridge,
			strategy: strategyId,
			budget,
			initialInfectedRegionId,
			initialInfections
		});
		allocations[strategyId] = doses;

		const initialCounts = buildInitialRegionCounts({
			city,
			vaccinatedPerRegion: doses,
			initialInfectedRegionId,
			initialInfections
		});

		results[strategyId] = simulateOutbreak({
			city,
			edges,
			initialCounts,
			parameters: params,
			scenarioId: strategyId,
			scenarioLabel: meta.label,
			bridge: cleanBridge,
			vaccineStrategy: strategyId,
			vaccineBudget: doses.reduce((a, b) => a + b, 0)
		});
	}

	return {
		bridge: cleanBridge,
		vaccineBudget: budget,
		edges,
		allocations,
		results
	};
}

export function computeMedian(values: readonly number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) {
		return sorted[mid];
	}
	return 0.5 * (sorted[mid - 1] + sorted[mid]);
}

export function summarizeScenarioBatch(
	scenarioId: ScenarioId,
	scenarioLabel: string,
	observationDays: number,
	runs: BatchRunSummaryItem[]
): ScenarioBatchSummary {
	const infectedList = runs.map((r) => r.totalInfectedByEnd);
	const peakList = runs.map((r) => r.peakInfectious);

	return {
		scenarioId,
		scenarioLabel,
		repetitions: runs.length,
		observationDays,
		runs,
		medianInfectedByEnd: computeMedian(infectedList),
		minInfectedByEnd: infectedList.length > 0 ? Math.min(...infectedList) : 0,
		maxInfectedByEnd: infectedList.length > 0 ? Math.max(...infectedList) : 0,
		medianPeakInfectious: computeMedian(peakList),
		minPeakInfectious: peakList.length > 0 ? Math.min(...peakList) : 0,
		maxPeakInfectious: peakList.length > 0 ? Math.max(...peakList) : 0,
		communityBReachedCount: runs.filter((r) => r.communityBReached).length,
		earlyExtinctionCount: runs.filter((r) => r.endedByExtinction).length
	};
}

/**
 * Runs a batch of `repetitions` (default 20) simulations across all compared scenarios
 * reusing the exact same stored outbreak-seed list. Retains all zero-spread and early-extinction runs.
 */
export function runBatchComparison(options: {
	city: CityNetwork;
	experimentMode: ExperimentMode;
	bridge?: Partial<BridgeSelection> | null;
	vaccineBudget?: number;
	parameters?: Partial<EpidemicParameters>;
	repetitions?: number;
	onProgress?: (completedRuns: number, totalRuns: number) => void;
}): BatchComparisonResult {
	const { city, experimentMode, onProgress } = options;
	const baseParams = normalizeEpidemicParameters(options.parameters);
	const repetitions = Math.max(
		1,
		Math.min(100, Math.round(options.repetitions ?? DEFAULT_BATCH_REPETITIONS))
	);
	const seedsUsed = buildOutbreakSeedList(baseParams.outbreakSeed, repetitions);

	if (experimentMode === 'bridge') {
		const withoutRuns: BatchRunSummaryItem[] = [];
		const withRuns: BatchRunSummaryItem[] = [];

		for (let i = 0; i < repetitions; i++) {
			const seed = seedsUsed[i];
			const pair = compareBridgeScenarios({
				city,
				bridge: options.bridge,
				parameters: { ...baseParams, outbreakSeed: seed }
			});

			withoutRuns.push({
				runIndex: i + 1,
				outbreakSeed: seed,
				totalInfectedByEnd: pair.withoutBridge.totalInfectedByEnd,
				peakInfectious: pair.withoutBridge.peakInfectious,
				peakInfectiousDay: Number(pair.withoutBridge.peakInfectiousDay.toFixed(1)),
				communityBReached: pair.withoutBridge.communityBReached,
				communityAInfectedByEnd: pair.withoutBridge.communityAInfectedByEnd,
				communityBInfectedByEnd: pair.withoutBridge.communityBInfectedByEnd,
				endedByExtinction: pair.withoutBridge.endedByExtinction
			});

			withRuns.push({
				runIndex: i + 1,
				outbreakSeed: seed,
				totalInfectedByEnd: pair.withBridge.totalInfectedByEnd,
				peakInfectious: pair.withBridge.peakInfectious,
				peakInfectiousDay: Number(pair.withBridge.peakInfectiousDay.toFixed(1)),
				communityBReached: pair.withBridge.communityBReached,
				communityAInfectedByEnd: pair.withBridge.communityAInfectedByEnd,
				communityBInfectedByEnd: pair.withBridge.communityBInfectedByEnd,
				endedByExtinction: pair.withBridge.endedByExtinction
			});

			onProgress?.(i + 1, repetitions);
		}

		const scenarios: ScenarioBatchSummary[] = [
			summarizeScenarioBatch(
				'without-bridge' as BridgeScenarioId,
				'Without bridge',
				baseParams.observationDays,
				withoutRuns
			),
			summarizeScenarioBatch(
				'with-bridge' as BridgeScenarioId,
				'With one bridge',
				baseParams.observationDays,
				withRuns
			)
		];

		return {
			experimentMode: 'bridge',
			repetitions,
			observationDays: baseParams.observationDays,
			baseOutbreakSeed: baseParams.outbreakSeed,
			seedsUsed,
			scenarios
		};
	}

	// experimentMode === 'vaccination'
	const runsByStrategy: Record<VaccinationStrategyId, BatchRunSummaryItem[]> = {
		even: [],
		'most-connections': [],
		'around-the-bridge': []
	};

	for (let i = 0; i < repetitions; i++) {
		const seed = seedsUsed[i];
		const comp = compareVaccinationStrategies({
			city,
			bridge: options.bridge,
			vaccineBudget: options.vaccineBudget,
			parameters: { ...baseParams, outbreakSeed: seed }
		});

		for (const strategyId of VACCINATION_STRATEGY_ORDER) {
			const res = comp.results[strategyId];
			runsByStrategy[strategyId].push({
				runIndex: i + 1,
				outbreakSeed: seed,
				totalInfectedByEnd: res.totalInfectedByEnd,
				peakInfectious: res.peakInfectious,
				peakInfectiousDay: Number(res.peakInfectiousDay.toFixed(1)),
				communityBReached: res.communityBReached,
				communityAInfectedByEnd: res.communityAInfectedByEnd,
				communityBInfectedByEnd: res.communityBInfectedByEnd,
				endedByExtinction: res.endedByExtinction
			});
		}

		onProgress?.(i + 1, repetitions);
	}

	const scenarios: ScenarioBatchSummary[] = VACCINATION_STRATEGY_ORDER.map((strategyId) =>
		summarizeScenarioBatch(
			strategyId,
			VACCINATION_STRATEGIES[strategyId].label,
			baseParams.observationDays,
			runsByStrategy[strategyId]
		)
	);

	return {
		experimentMode: 'vaccination',
		repetitions,
		observationDays: baseParams.observationDays,
		baseOutbreakSeed: baseParams.outbreakSeed,
		seedsUsed,
		scenarios
	};
}
