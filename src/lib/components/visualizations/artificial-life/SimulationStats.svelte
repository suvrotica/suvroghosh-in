<script lang="ts">
	import TraitChart from './TraitChart.svelte';
	import type {
		SimulationHistoryPoint,
		SimulationStats,
		TraitDistributions
	} from '$lib/visualizations/artificial-life/types';

	type Props = {
		stats: SimulationStats;
		history: SimulationHistoryPoint[];
		distributions: TraitDistributions;
		compact?: boolean;
	};

	let { stats, history, distributions, compact = false }: Props = $props();

	function number(value: number, digits = 1) {
		return Number.isFinite(value) ? value.toFixed(digits) : '0.0';
	}
</script>

<section aria-labelledby="simulation-statistics-heading" class="min-w-0">
	<div class="mb-3 flex items-end justify-between gap-3">
		<div>
			<p class="m-0 text-[0.68rem] font-bold tracking-[0.16em] text-cyan-300 uppercase">
				Live census
			</p>
			<h3 id="simulation-statistics-heading" class="mt-1 mb-0 text-lg text-white">
				Population telemetry
			</h3>
		</div>
		<p class="m-0 font-mono text-xs text-neutral-400">{number(stats.framesPerSecond, 0)} fps</p>
	</div>

	<dl class="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-neutral-800 sm:grid-cols-4">
		<div class="bg-neutral-950 p-3">
			<dt class="text-[0.68rem] font-bold tracking-wide text-neutral-500 uppercase">Population</dt>
			<dd class="mt-1 mb-0 font-mono text-xl font-bold text-cyan-200">{stats.population}</dd>
		</div>
		<div class="bg-neutral-950 p-3">
			<dt class="text-[0.68rem] font-bold tracking-wide text-neutral-500 uppercase">Births</dt>
			<dd class="mt-1 mb-0 font-mono text-xl font-bold text-emerald-200">{stats.births}</dd>
		</div>
		<div class="bg-neutral-950 p-3">
			<dt class="text-[0.68rem] font-bold tracking-wide text-neutral-500 uppercase">Deaths</dt>
			<dd class="mt-1 mb-0 font-mono text-xl font-bold text-amber-200">{stats.deaths}</dd>
		</div>
		<div class="bg-neutral-950 p-3">
			<dt class="text-[0.68rem] font-bold tracking-wide text-neutral-500 uppercase">Generation</dt>
			<dd class="mt-1 mb-0 font-mono text-xl font-bold text-violet-200">
				{stats.generationEstimate}
			</dd>
		</div>
	</dl>

	{#if !compact}
		<dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 xl:grid-cols-5">
			<div>
				<dt class="text-xs text-neutral-500">Average energy</dt>
				<dd class="mt-1 mb-0 font-mono text-neutral-100">{number(stats.averageEnergy)} E</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Average speed</dt>
				<dd class="mt-1 mb-0 font-mono text-neutral-100">{number(stats.averageSpeed)} u/s</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Average size</dt>
				<dd class="mt-1 mb-0 font-mono text-neutral-100">{number(stats.averageSize)} u</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Average sensing</dt>
				<dd class="mt-1 mb-0 font-mono text-neutral-100">
					{number(stats.averageSensoryRadius)} u
				</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Average mutation</dt>
				<dd class="mt-1 mb-0 font-mono text-neutral-100">
					{number(stats.averageMutationRate * 100)}%
				</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Oldest lineage</dt>
				<dd class="mt-1 mb-0 text-neutral-100">{stats.oldestLineage}</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Dominant phenotype</dt>
				<dd class="mt-1 mb-0 text-neutral-100">{stats.dominantPhenotype}</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Food available</dt>
				<dd class="mt-1 mb-0 font-mono text-neutral-100">{stats.foodAvailability}</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Predators</dt>
				<dd class="mt-1 mb-0 font-mono text-neutral-100">{stats.predatorCount}</dd>
			</div>
			<div>
				<dt class="text-xs text-neutral-500">Simulated time</dt>
				<dd class="mt-1 mb-0 font-mono text-neutral-100">{number(stats.simulationTime, 0)} s</dd>
			</div>
		</dl>

		<div class="mt-5 border-t border-neutral-800 pt-4">
			<TraitChart {history} {distributions} />
		</div>
	{/if}
</section>
