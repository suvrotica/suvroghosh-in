import { computeRegionContactWeights, normalizeBridgeSelection } from './city.ts';
import {
	DEFAULT_INITIAL_INFECTED_REGION_ID,
	DEFAULT_VACCINE_BUDGET,
	INITIAL_INFECTIONS,
	PARAMETER_BOUNDS,
	POPULATION_PER_REGION,
	type BridgeSelection,
	type CityNetwork,
	type ContactEdge,
	type RegionCompartmentCounts,
	type VaccinationStrategyId
} from './types.ts';

export const VACCINATION_STRATEGIES: Readonly<
	Record<
		VaccinationStrategyId,
		{
			id: VaccinationStrategyId;
			label: string;
			rule: string;
			shortSummary: string;
		}
	>
> = Object.freeze({
	even: {
		id: 'even',
		label: 'Spread evenly',
		rule: 'Allocate doses across all regions, proportional to eligible population.',
		shortSummary: 'Every region receives a modest share (~15% at 540 doses).'
	},
	'most-connections': {
		id: 'most-connections',
		label: 'Most connections',
		rule: 'Prioritise regions with the greatest total contact weight.',
		shortSummary: 'Concentrates doses in the highest-degree hub regions across both communities.'
	},
	'around-the-bridge': {
		id: 'around-the-bridge',
		label: 'Around the bridge',
		rule: 'Prioritise the bridge endpoints and their directly connected neighbours.',
		shortSummary: 'Creates a protective barrier at the bridge endpoints and their immediate neighbours.'
	}
});

export const VACCINATION_STRATEGY_ORDER: readonly VaccinationStrategyId[] = Object.freeze([
	'even',
	'most-connections',
	'around-the-bridge'
]);

export function normalizeVaccineBudget(
	budget: number,
	maxEligible: number = 36 * POPULATION_PER_REGION - INITIAL_INFECTIONS
): number {
	if (!Number.isFinite(budget)) return Math.min(DEFAULT_VACCINE_BUDGET, maxEligible);
	const rounded = Math.round(budget);
	return Math.max(
		PARAMETER_BOUNDS.vaccineBudget.min,
		Math.min(maxEligible, Math.min(PARAMETER_BOUNDS.vaccineBudget.max, rounded))
	);
}

/**
 * Returns the baseline pre-vaccination susceptible capacities S_i(0) for all regions,
 * preserving the 5 initial infections in the seeded region.
 */
export function buildInitialEligibleSusceptibles(
	city: CityNetwork,
	initialInfectedRegionId: string = DEFAULT_INITIAL_INFECTED_REGION_ID,
	initialInfections: number = INITIAL_INFECTIONS
): number[] {
	return city.regions.map((region) => {
		const infected =
			region.id === initialInfectedRegionId
				? Math.min(region.population, Math.max(0, Math.round(initialInfections)))
				: 0;
		return region.population - infected;
	});
}

/**
 * Computes shortest unweighted hop distance from the set of source region indices to every region.
 */
export function computeGraphHopDistances(
	regionCount: number,
	edges: readonly ContactEdge[],
	sourceIndices: readonly number[]
): number[] {
	const dist = new Array<number>(regionCount).fill(Infinity);
	const adj: number[][] = Array.from({ length: regionCount }, () => []);
	for (const e of edges) {
		adj[e.sourceIndex].push(e.targetIndex);
		adj[e.targetIndex].push(e.sourceIndex);
	}

	const queue: number[] = [];
	for (const src of sourceIndices) {
		if (src >= 0 && src < regionCount && dist[src] === Infinity) {
			dist[src] = 0;
			queue.push(src);
		}
	}

	while (queue.length > 0) {
		const u = queue.shift()!;
		for (const v of adj[u]) {
			if (dist[v] === Infinity) {
				dist[v] = dist[u] + 1;
				queue.push(v);
			}
		}
	}

	return dist;
}

/**
 * Distributes `budget` integer doses across the subset `tierIndices` using iterative
 * largest-remainder (Hamilton) allocation with strict per-region capacity caps (`capacities[i]`).
 * Returns the number of doses allocated in this tier.
 */
function allocateWithinTier(
	tierIndices: readonly number[],
	budget: number,
	capacities: readonly number[],
	weights: readonly number[],
	secondaryPriority: readonly number[],
	allocatedOut: number[]
): number {
	let remainingBudget = Math.max(0, Math.round(budget));
	if (remainingBudget === 0 || tierIndices.length === 0) return 0;

	const tierCapacity = tierIndices.reduce(
		(acc, idx) => acc + Math.max(0, capacities[idx] - allocatedOut[idx]),
		0
	);
	if (tierCapacity <= 0) return 0;

	if (remainingBudget >= tierCapacity) {
		for (const idx of tierIndices) {
			const avail = Math.max(0, capacities[idx] - allocatedOut[idx]);
			allocatedOut[idx] += avail;
		}
		return tierCapacity;
	}

	let totalAllocatedHere = 0;

	// Iterative water-filling + largest remainder so capacity caps never lose a single dose
	while (remainingBudget > 0) {
		const active = tierIndices.filter((idx) => capacities[idx] - allocatedOut[idx] > 0);
		if (active.length === 0) break;

		const totalWeight = active.reduce((sum, idx) => sum + Math.max(1e-6, weights[idx]), 0);
		const quotas = active.map((idx) => ({
			idx,
			avail: capacities[idx] - allocatedOut[idx],
			exact: (remainingBudget * Math.max(1e-6, weights[idx])) / totalWeight
		}));

		let floorSum = 0;
		let anyCapped = false;
		for (const q of quotas) {
			const fl = Math.floor(q.exact + 1e-11);
			if (fl >= q.avail) {
				allocatedOut[q.idx] += q.avail;
				remainingBudget -= q.avail;
				totalAllocatedHere += q.avail;
				anyCapped = true;
			} else if (fl > 0) {
				floorSum += fl;
			}
		}

		if (anyCapped) {
			// Re-normalize remaining budget across uncapped active regions
			continue;
		}

		// Apply floors to uncapped regions
		for (const q of quotas) {
			const fl = Math.floor(q.exact + 1e-11);
			if (fl > 0) {
				allocatedOut[q.idx] += fl;
				remainingBudget -= fl;
				totalAllocatedHere += fl;
			}
		}

		if (remainingBudget <= 0) break;

		// Distribute remaining integer doses by descending fractional remainder,
		// then descending secondaryPriority, then ascending canonical region index.
		const candidates = quotas
			.filter((q) => capacities[q.idx] - allocatedOut[q.idx] > 0)
			.map((q) => ({
				idx: q.idx,
				rem: q.exact - Math.floor(q.exact + 1e-11),
				sec: secondaryPriority[q.idx]
			}))
			.sort((a, b) => {
				if (Math.abs(b.rem - a.rem) > 1e-9) return b.rem - a.rem;
				if (Math.abs(b.sec - a.sec) > 1e-9) return b.sec - a.sec;
				return a.idx - b.idx;
			});

		for (let k = 0; k < candidates.length && remainingBudget > 0; k++) {
			const idx = candidates[k].idx;
			allocatedOut[idx] += 1;
			remainingBudget -= 1;
			totalAllocatedHere += 1;
		}
		break;
	}

	return totalAllocatedHere;
}

/**
 * Deterministically allocates integer vaccine doses across the 36 regions at t = 0
 * according to the selected strategy, respecting eligible susceptible capacities S_i(0)
 * and redistributing any overflow until the full feasible budget is allocated.
 */
export function allocateVaccines(options: {
	city: CityNetwork;
	edges: readonly ContactEdge[];
	bridge: BridgeSelection;
	strategy: VaccinationStrategyId;
	budget: number;
	initialInfectedRegionId?: string;
	initialInfections?: number;
}): number[] {
	const {
		city,
		edges,
		bridge,
		strategy,
		initialInfectedRegionId = DEFAULT_INITIAL_INFECTED_REGION_ID,
		initialInfections = INITIAL_INFECTIONS
	} = options;

	const capacities = buildInitialEligibleSusceptibles(
		city,
		initialInfectedRegionId,
		initialInfections
	);
	const totalCapacity = capacities.reduce((a, b) => a + b, 0);
	const targetBudget = Math.max(0, Math.min(totalCapacity, Math.round(options.budget)));

	const allocated = new Array<number>(city.regions.length).fill(0);
	if (targetBudget === 0) return allocated;

	const contactWeights = computeRegionContactWeights(city.regions.length, edges);
	const cleanBridge = normalizeBridgeSelection(city, bridge);
	const regA = city.regionById.get(cleanBridge.regionAId)!;
	const regB = city.regionById.get(cleanBridge.regionBId)!;
	const bridgeDist = computeGraphHopDistances(city.regions.length, edges, [
		regA.index,
		regB.index
	]);

	if (strategy === 'even') {
		const allIndices = city.regions.map((r) => r.index);
		// Proportional to eligible susceptible population S_i(0); ties broken by contact weight then index
		allocateWithinTier(
			allIndices,
			targetBudget,
			capacities,
			capacities,
			contactWeights,
			allocated
		);
		return allocated;
	}

	if (strategy === 'most-connections') {
		// Group regions into descending tiers of total contact weight W_i
		const uniqueWeights = Array.from(new Set(contactWeights)).sort((a, b) => b - a);
		let remaining = targetBudget;
		// Secondary priority inside equal-weight tier: closer to bridge (-bridgeDist), then index
		const negBridgeDist = bridgeDist.map((d) => (Number.isFinite(d) ? -d : -999));

		for (const w of uniqueWeights) {
			if (remaining <= 0) break;
			const tier = city.regions
				.filter((r) => Math.abs(contactWeights[r.index] - w) < 1e-9)
				.map((r) => r.index);
			const used = allocateWithinTier(
				tier,
				remaining,
				capacities,
				capacities,
				negBridgeDist,
				allocated
			);
			remaining -= used;
		}
		return allocated;
	}

	// strategy === 'around-the-bridge'
	// Priority group 1: bridge endpoints (d = 0, relative weight 1.5) and their directly connected
	// neighbours (d = 1, relative weight 1.0).
	// Subsequent overflow tiers: d = 2, 3, ... by graph hop distance from the bridge.
	const bridgeZoneIndices = city.regions
		.filter((r) => bridgeDist[r.index] <= 1)
		.map((r) => r.index);
	const bridgeZoneWeights = capacities.map((cap, idx) =>
		bridgeDist[idx] === 0 ? cap * 1.5 : bridgeDist[idx] === 1 ? cap * 1.0 : cap
	);
	const bridgeZonePriority = city.regions.map((r) =>
		bridgeDist[r.index] === 0 ? 1000 + contactWeights[r.index] : contactWeights[r.index]
	);

	let remaining = targetBudget;
	if (bridgeZoneIndices.length > 0 && remaining > 0) {
		const used = allocateWithinTier(
			bridgeZoneIndices,
			remaining,
			capacities,
			bridgeZoneWeights,
			bridgeZonePriority,
			allocated
		);
		remaining -= used;
	}

	const overflowDists = Array.from(new Set(bridgeDist.filter((d) => d >= 2))).sort(
		(a, b) => a - b
	);
	for (const d of overflowDists) {
		if (remaining <= 0) break;
		const tier = city.regions
			.filter((r) => bridgeDist[r.index] === d)
			.map((r) => r.index);
		const shellWeights = capacities.map(
			(cap, idx) => cap * Math.max(1, contactWeights[idx])
		);
		const used = allocateWithinTier(
			tier,
			remaining,
			capacities,
			shellWeights,
			contactWeights,
			allocated
		);
		remaining -= used;
	}

	return allocated;
}

/**
 * Builds the t = 0 compartment counts (S_i, I_i, R_i, V_i, N_i) for all 36 regions.
 */
export function buildInitialRegionCounts(options: {
	city: CityNetwork;
	vaccinatedPerRegion?: readonly number[];
	initialInfectedRegionId?: string;
	initialInfections?: number;
}): RegionCompartmentCounts[] {
	const {
		city,
		vaccinatedPerRegion,
		initialInfectedRegionId = DEFAULT_INITIAL_INFECTED_REGION_ID,
		initialInfections = INITIAL_INFECTIONS
	} = options;

	return city.regions.map((region, idx) => {
		const N = region.population;
		const I =
			region.id === initialInfectedRegionId
				? Math.min(N, Math.max(0, Math.round(initialInfections)))
				: 0;
		const maxEligibleS = N - I;
		const rawV = vaccinatedPerRegion ? Math.round(vaccinatedPerRegion[idx] ?? 0) : 0;
		const V = Math.max(0, Math.min(maxEligibleS, rawV));
		const S = N - I - V;
		const R = 0;
		return { S, I, R, V, N };
	});
}
