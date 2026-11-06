import { describe, expect, it } from 'vitest';
import {
	DEFAULT_BRIDGE_A_ID,
	DEFAULT_BRIDGE_B_ID,
	DEFAULT_CITY_SEED,
	DEFAULT_EPIDEMIC_PARAMETERS,
	DEFAULT_INITIAL_INFECTED_REGION_ID,
	DEFAULT_OUTBREAK_SEED,
	DEFAULT_VACCINE_BUDGET,
	EpidemicMosaicWorkerClient,
	INITIAL_INFECTIONS,
	POPULATION_PER_REGION,
	REGIONS_PER_COMMUNITY,
	TOTAL_CITY_POPULATION,
	TOTAL_REGIONS,
	VACCINATION_STRATEGY_ORDER,
	allocateVaccines,
	buildInitialRegionCounts,
	buildOutbreakSeedList,
	buildScenarioEdges,
	compareBridgeScenarios,
	compareVaccinationStrategies,
	computePolygonPopulationBands,
	generateCityNetwork,
	getPlaybackWindowEvents,
	runBatchComparison,
	sampleCityStateAtTime,
	simulateOutbreak,
	type BatchWorkerLike,
	type BatchWorkerRequest,
	type BatchWorkerResponse
} from './index.ts';

describe('The Epidemic Mosaic pure model, geometry, and vaccination domain', () => {
	const city = generateCityNetwork(DEFAULT_CITY_SEED);

	it('generates a reproducible 36-region Voronoi city split into two connected 18-region communities', () => {
		const cityAgain = generateCityNetwork(DEFAULT_CITY_SEED);
		expect(city.regions).toHaveLength(TOTAL_REGIONS);
		expect(city.regions.map((r) => r.id)).toEqual(cityAgain.regions.map((r) => r.id));
		expect(city.regions.map((r) => r.svgPath)).toEqual(cityAgain.regions.map((r) => r.svgPath));

		const commA = city.regions.filter((r) => r.community === 'A');
		const commB = city.regions.filter((r) => r.community === 'B');
		expect(commA).toHaveLength(REGIONS_PER_COMMUNITY);
		expect(commB).toHaveLength(REGIONS_PER_COMMUNITY);

		const totalPop = city.regions.reduce((s, r) => s + r.population, 0);
		expect(totalPop).toBe(TOTAL_CITY_POPULATION);

		// No tiny slivers: every polygon has substantial area
		for (const region of city.regions) {
			expect(region.polygonArea).toBeGreaterThan(2500);
			expect(region.polygon.length).toBeGreaterThanOrEqual(3);
		}

		// Verify zero base edges cross between Community A and Community B
		for (const edge of city.baseEdges) {
			const regS = city.regions[edge.sourceIndex];
			const regT = city.regions[edge.targetIndex];
			expect(regS.community).toBe(regT.community);
		}

		// Verify both Community A and Community B are internally connected
		const checkConnected = (comm: 'A' | 'B') => {
			const memberIndices = city.regions
				.filter((r) => r.community === comm)
				.map((r) => r.index);
			const visited = new Set<number>([memberIndices[0]]);
			const queue = [memberIndices[0]];
			while (queue.length > 0) {
				const u = queue.shift()!;
				for (const e of city.baseEdges) {
					if (e.sourceIndex === u && !visited.has(e.targetIndex)) {
						visited.add(e.targetIndex);
						queue.push(e.targetIndex);
					} else if (e.targetIndex === u && !visited.has(e.sourceIndex)) {
						visited.add(e.sourceIndex);
						queue.push(e.sourceIndex);
					}
				}
			}
			expect(visited.size).toBe(REGIONS_PER_COMMUNITY);
		};
		checkConnected('A');
		checkConnected('B');

		// Verify neighbouring polygons with NO direct contact connection exist
		const [touchA, touchB] = city.exampleTouchingDisconnectedPair;
		const regTouchA = city.regionById.get(touchA)!;
		const regTouchB = city.regionById.get(touchB)!;
		expect(regTouchA.borderNeighbourIndices).toContain(regTouchB.index);
		const hasDirectEdge = city.baseEdges.some(
			(e) =>
				(e.sourceId === touchA && e.targetId === touchB) ||
				(e.sourceId === touchB && e.targetId === touchA)
		);
		expect(hasDirectEdge).toBe(false);

		// Verify visually distant polygons joined by a direct connection exist
		const [distA, distB] = city.exampleDistantConnectedPair;
		const regDistA = city.regionById.get(distA)!;
		const regDistB = city.regionById.get(distB)!;
		expect(regDistA.borderNeighbourIndices).not.toContain(regDistB.index);
		const longEdge = city.baseEdges.find(
			(e) =>
				(e.sourceId === distA && e.targetId === distB) ||
				(e.sourceId === distB && e.targetId === distA)
		);
		expect(longEdge).toBeDefined();
		expect(longEdge!.sharesPolygonBorder).toBe(false);
		expect(longEdge!.euclideanDistance).toBeGreaterThan(120);
	});

	it('computes area-proportional horizontal colour bands for irregular Voronoi polygons', () => {
		const counts = { S: 42, V: 18, R: 25, I: 15, N: 100 };
		for (const region of city.regions) {
			const bands = computePolygonPopulationBands(region, counts);
			expect(bands).toHaveLength(4);
			const sumArea = bands.reduce((acc, b) => acc + b.area, 0);
			expect(sumArea).toBeCloseTo(region.polygonArea, 2);

			for (const band of bands) {
				const areaFraction = band.area / region.polygonArea;
				expect(areaFraction).toBeCloseTo(band.fraction, 4);
			}
		}
	});

	it('preserves nonnegative integer counts, population conservation, and excludes vaccinated from recovered and cumulative infected', () => {
		const comp = compareVaccinationStrategies({
			city,
			bridge: { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID },
			vaccineBudget: DEFAULT_VACCINE_BUDGET,
			parameters: DEFAULT_EPIDEMIC_PARAMETERS
		});

		for (const strategyId of VACCINATION_STRATEGY_ORDER) {
			const res = comp.results[strategyId];
			for (const dayPt of res.dailySeries) {
				expect(dayPt.totalS + dayPt.totalI + dayPt.totalR + dayPt.totalV).toBe(
					TOTAL_CITY_POPULATION
				);
				expect(dayPt.totalV).toBe(DEFAULT_VACCINE_BUDGET);
				// Cumulative infected equals I + R and excludes V
				expect(dayPt.cumulativeInfected).toBe(dayPt.totalI + dayPt.totalR);
			}

			for (const rc of res.finalCounts) {
				expect(Number.isInteger(rc.S) && rc.S >= 0).toBe(true);
				expect(Number.isInteger(rc.I) && rc.I >= 0).toBe(true);
				expect(Number.isInteger(rc.R) && rc.R >= 0).toBe(true);
				expect(Number.isInteger(rc.V) && rc.V >= 0).toBe(true);
				expect(rc.S + rc.I + rc.R + rc.V).toBe(POPULATION_PER_REGION);
			}

			expect(res.totalInfectedByEnd).toBe(
				res.finalCounts.reduce((s, c) => s + c.I + c.R, 0)
			);
		}
	});

	it('produces no infection when initial infectious count is zero', () => {
		const initialCounts = buildInitialRegionCounts({
			city,
			initialInfectedRegionId: DEFAULT_INITIAL_INFECTED_REGION_ID,
			initialInfections: 0
		});
		const edges = buildScenarioEdges(city, {
			regionAId: DEFAULT_BRIDGE_A_ID,
			regionBId: DEFAULT_BRIDGE_B_ID
		});
		const res = simulateOutbreak({
			city,
			edges,
			initialCounts,
			parameters: DEFAULT_EPIDEMIC_PARAMETERS
		});

		expect(res.events).toHaveLength(0);
		expect(res.totalInfectedByEnd).toBe(0);
		expect(res.peakInfectious).toBe(0);
		expect(res.endedByExtinction).toBe(true);
	});

	it('produces no transmission between disconnected components (Community B remains untouched without bridge)', () => {
		const batch = runBatchComparison({
			city,
			experimentMode: 'bridge',
			bridge: { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID },
			parameters: DEFAULT_EPIDEMIC_PARAMETERS,
			repetitions: 20
		});

		const withoutSummary = batch.scenarios.find((s) => s.scenarioId === 'without-bridge')!;
		const withSummary = batch.scenarios.find((s) => s.scenarioId === 'with-bridge')!;

		expect(withoutSummary.communityBReachedCount).toBe(0);
		for (const run of withoutSummary.runs) {
			expect(run.communityBReached).toBe(false);
			expect(run.communityBInfectedByEnd).toBe(0);
		}

		// With the bridge, infection reaches Community B in multiple runs and raises median infections
		expect(withSummary.communityBReachedCount).toBeGreaterThan(10);
		expect(withSummary.medianInfectedByEnd).toBeGreaterThan(
			withoutSummary.medianInfectedByEnd + 400
		);
	});

	it('produces no cross-region transmission when the link coefficient betaLink is zero', () => {
		const pair = compareBridgeScenarios({
			city,
			bridge: { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID },
			parameters: { ...DEFAULT_EPIDEMIC_PARAMETERS, betaLink: 0 }
		});

		const seededIndex = city.regionById.get(DEFAULT_INITIAL_INFECTED_REGION_ID)!.index;
		for (const ev of pair.withBridge.events) {
			expect(ev.type).not.toBe('link-infection');
			expect(ev.targetRegionIndex).toBe(seededIndex);
		}

		for (let i = 0; i < TOTAL_REGIONS; i++) {
			if (i === seededIndex) {
				expect(
					pair.withBridge.finalCounts[i].I + pair.withBridge.finalCounts[i].R
				).toBeGreaterThanOrEqual(INITIAL_INFECTIONS);
			} else {
				expect(pair.withBridge.finalCounts[i].I).toBe(0);
				expect(pair.withBridge.finalCounts[i].R).toBe(0);
				expect(pair.withBridge.finalCounts[i].S).toBe(POPULATION_PER_REGION);
			}
		}
	});

	it('adds exactly one undirected contact edge in the bridge scenario and preserves existing edges and weights', () => {
		const withoutEdges = buildScenarioEdges(city, null);
		const withEdges = buildScenarioEdges(city, {
			regionAId: DEFAULT_BRIDGE_A_ID,
			regionBId: DEFAULT_BRIDGE_B_ID
		});

		expect(withEdges.length).toBe(withoutEdges.length + 1);
		expect(withEdges.slice(0, withoutEdges.length)).toEqual(withoutEdges);

		const bridgeEdge = withEdges[withEdges.length - 1];
		expect(bridgeEdge.isBridge).toBe(true);
		expect(bridgeEdge.sourceId).toBe(DEFAULT_BRIDGE_A_ID);
		expect(bridgeEdge.targetId).toBe(DEFAULT_BRIDGE_B_ID);
		expect(bridgeEdge.weight).toBe(1);
	});

	it('returns identical results for identical seeds and configurations', () => {
		const first = compareBridgeScenarios({
			city,
			bridge: { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID },
			parameters: { ...DEFAULT_EPIDEMIC_PARAMETERS, outbreakSeed: DEFAULT_OUTBREAK_SEED }
		});
		const second = compareBridgeScenarios({
			city,
			bridge: { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID },
			parameters: { ...DEFAULT_EPIDEMIC_PARAMETERS, outbreakSeed: DEFAULT_OUTBREAK_SEED }
		});

		expect(first.withoutBridge.events).toEqual(second.withoutBridge.events);
		expect(first.withBridge.events).toEqual(second.withBridge.events);
		expect(first.withBridge.dailySeries).toEqual(second.withBridge.dailySeries);
	});

	it('allocates identical integer vaccination budgets across strategies with deterministic tie-breaking and overflow handling', () => {
		const edges = buildScenarioEdges(city, {
			regionAId: DEFAULT_BRIDGE_A_ID,
			regionBId: DEFAULT_BRIDGE_B_ID
		});
		const bridge = { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID };

		for (const budget of [0, 73, 200, 540, 1250, 3595, 5000]) {
			const expectedFeasible = Math.min(budget, TOTAL_CITY_POPULATION - INITIAL_INFECTIONS);
			for (const strategy of VACCINATION_STRATEGY_ORDER) {
				const alloc1 = allocateVaccines({ city, edges, bridge, strategy, budget });
				const alloc2 = allocateVaccines({ city, edges, bridge, strategy, budget });
				expect(alloc1).toEqual(alloc2);
				expect(alloc1.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);

				// Seeded region has 5 initial infections, so max eligible S is 95
				const seededIdx = city.regionById.get(DEFAULT_INITIAL_INFECTED_REGION_ID)!.index;
				expect(alloc1[seededIdx]).toBeLessThanOrEqual(
					POPULATION_PER_REGION - INITIAL_INFECTIONS
				);
				for (let i = 0; i < TOTAL_REGIONS; i++) {
					if (i !== seededIdx) {
						expect(alloc1[i]).toBeLessThanOrEqual(POPULATION_PER_REGION);
					}
				}

				const sumDoses = alloc1.reduce((a, b) => a + b, 0);
				expect(sumDoses).toBe(expectedFeasible);
			}
		}

		// Verify Around the bridge at 540 doses prioritises both bridge endpoints (91 doses each) and their 6 direct neighbours
		const aroundBridge540 = allocateVaccines({
			city,
			edges,
			bridge,
			strategy: 'around-the-bridge',
			budget: 540
		});
		const idxA = city.regionById.get(DEFAULT_BRIDGE_A_ID)!.index;
		const idxB = city.regionById.get(DEFAULT_BRIDGE_B_ID)!.index;
		expect(aroundBridge540[idxA]).toBe(91);
		expect(aroundBridge540[idxB]).toBe(91);
	});

	it('backs transmission highlights strictly with recorded events and keeps results unchanged across playback/sampling speeds', () => {
		const pair = compareBridgeScenarios({
			city,
			bridge: { regionAId: DEFAULT_BRIDGE_A_ID, regionBId: DEFAULT_BRIDGE_B_ID },
			parameters: DEFAULT_EPIDEMIC_PARAMETERS
		});
		const run = pair.withBridge;

		// Sampling at steps of 0.5 days vs 5.0 days produces the exact same day-120 state and total new infections
		let totalFromFineSteps = 0;
		for (let t = 0; t < 120; t += 0.5) {
			const win = getPlaybackWindowEvents(city, run, t, t + 0.5);
			totalFromFineSteps += win.totalNewInfections;
			for (const lt of win.linkTransmissions) {
				const matchingRecorded = run.events.filter(
					(ev) =>
						ev.type === 'link-infection' &&
						ev.time > t &&
						ev.time <= t + 0.5 &&
						ev.sourceRegionIndex === lt.sourceRegionIndex &&
						ev.targetRegionIndex === lt.targetRegionIndex
				);
				expect(matchingRecorded.length).toBe(lt.count);
			}
		}

		let totalFromCoarseSteps = 0;
		for (let t = 0; t < 120; t += 5) {
			const win = getPlaybackWindowEvents(city, run, t, t + 5);
			totalFromCoarseSteps += win.totalNewInfections;
		}

		const recordedNewInfections = run.events.filter(
			(ev) => ev.type === 'local-infection' || ev.type === 'link-infection'
		).length;

		expect(totalFromFineSteps).toBe(recordedNewInfections);
		expect(totalFromCoarseSteps).toBe(recordedNewInfections);

		const stateAt120 = sampleCityStateAtTime(run, 120);
		expect(stateAt120.cumulativeInfected).toBe(run.totalInfectedByEnd);
		expect(stateAt120.regionCounts).toEqual(run.finalCounts);
	});

	it('reuses the stored outbreak-seed list across batches and supports worker cancellation and stale-result rejection', () => {
		const seeds = buildOutbreakSeedList(DEFAULT_OUTBREAK_SEED, 20);
		expect(seeds).toHaveLength(20);
		expect(seeds[0]).toBe(DEFAULT_OUTBREAK_SEED);

		const postedRequests: BatchWorkerRequest[] = [];
		const listeners: Array<(event: MessageEvent<BatchWorkerResponse>) => void> = [];
		let terminated = false;

		const fakeWorker: BatchWorkerLike = {
			postMessage(msg) {
				postedRequests.push(msg);
			},
			addEventListener(_type, listener) {
				listeners.push(listener);
			},
			removeEventListener() {
				listeners.length = 0;
			},
			terminate() {
				terminated = true;
			}
		};

		const client = new EpidemicMosaicWorkerClient(() => fakeWorker);
		const completedResults: unknown[] = [];
		let cancelledCount = 0;

		const gen1 = client.startBatch(
			{ experimentMode: 'bridge', repetitions: 20 },
			{
				onComplete: (r) => completedResults.push(r),
				onCancelled: () => {
					cancelledCount += 1;
				}
			}
		);
		expect(client.isRunning).toBe(true);
		expect(postedRequests).toHaveLength(1);

		client.cancel();
		expect(client.isRunning).toBe(false);
		expect(cancelledCount).toBe(1);

		// Late response from cancelled generation is ignored
		listeners[0]?.({
			data: {
				type: 'BATCH_COMPLETE',
				generationId: gen1,
				result: {
					experimentMode: 'bridge',
					repetitions: 20,
					observationDays: 120,
					baseOutbreakSeed: 2026,
					seedsUsed: seeds,
					scenarios: []
				}
			}
		} as unknown as MessageEvent<BatchWorkerResponse>);
		expect(completedResults).toHaveLength(0);

		client.dispose();
		expect(terminated).toBe(true);
	});
});
