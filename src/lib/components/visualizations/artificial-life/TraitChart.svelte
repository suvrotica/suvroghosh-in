<script lang="ts">
	import type {
		SimulationHistoryPoint,
		TraitDistributions,
		TraitKey
	} from '$lib/visualizations/artificial-life/types';

	type Props = {
		history: SimulationHistoryPoint[];
		distributions: TraitDistributions;
	};

	let { history, distributions }: Props = $props();
	let selectedTrait = $state<TraitKey>('movementSpeed');
	const width = 320;
	const height = 96;
	const traitLabels: Record<TraitKey, string> = {
		movementSpeed: 'Movement speed',
		bodySize: 'Body size',
		sensoryRadius: 'Sensory radius',
		mutationRate: 'Mutation rate'
	};
	let selectedBins = $derived(distributions[selectedTrait] ?? []);
	let maximumBinCount = $derived(Math.max(1, ...selectedBins.map((bin) => bin.count)));

	function linePath(
		points: SimulationHistoryPoint[],
		value: (point: SimulationHistoryPoint) => number,
		sharedMaximum?: number
	) {
		if (points.length === 0) return '';
		const maximum = sharedMaximum ?? Math.max(1, ...points.map(value));
		return points
			.map((point, index) => {
				const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
				const y = height - (value(point) / maximum) * (height - 8) - 4;
				return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
			})
			.join(' ');
	}

	let eventMaximum = $derived(
		Math.max(1, ...history.flatMap((point) => [point.births, point.deaths]))
	);
	let populationPath = $derived(linePath(history, (point) => point.population));
	let birthsPath = $derived(linePath(history, (point) => point.births, eventMaximum));
	let deathsPath = $derived(linePath(history, (point) => point.deaths, eventMaximum));
	let latestPopulation = $derived(history.at(-1)?.population ?? 0);
	let latestBirths = $derived(history.at(-1)?.births ?? 0);
	let latestDeaths = $derived(history.at(-1)?.deaths ?? 0);
</script>

<div class="grid gap-4 xl:grid-cols-3" aria-label="Live simulation charts">
	<figure class="m-0 min-w-0">
		<figcaption
			class="mb-2 flex items-baseline justify-between gap-3 text-xs font-bold text-neutral-300"
		>
			<span>Population over time</span>
			<span class="font-mono text-cyan-300">{latestPopulation}</span>
		</figcaption>
		<svg
			viewBox={`0 0 ${width} ${height}`}
			class="block w-full rounded-md bg-neutral-950"
			role="img"
			aria-label={`Population history ending at ${latestPopulation} organisms`}
		>
			<title>Population over time</title>
			<desc>The line shows the living population sampled during the current run.</desc>
			<path d={`M 0 ${height - 1} H ${width}`} stroke="#404040" stroke-width="1" />
			{#if populationPath}
				<path
					d={populationPath}
					fill="none"
					stroke="#67e8f9"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}
		</svg>
	</figure>

	<figure class="m-0 min-w-0">
		<figcaption
			class="mb-2 flex items-baseline justify-between gap-3 text-xs font-bold text-neutral-300"
		>
			<span>Cumulative births / deaths</span>
			<span class="font-mono text-neutral-400">{latestBirths} / {latestDeaths}</span>
		</figcaption>
		<svg
			viewBox={`0 0 ${width} ${height}`}
			class="block w-full rounded-md bg-neutral-950"
			role="img"
			aria-label={`Births ${latestBirths}; deaths ${latestDeaths}`}
		>
			<title>Cumulative births and deaths</title>
			<desc>Cyan is cumulative births; amber is cumulative deaths.</desc>
			<path d={`M 0 ${height - 1} H ${width}`} stroke="#404040" stroke-width="1" />
			{#if birthsPath}
				<path d={birthsPath} fill="none" stroke="#67e8f9" stroke-width="2.5" />
			{/if}
			{#if deathsPath}
				<path d={deathsPath} fill="none" stroke="#fbbf24" stroke-width="2.5" />
			{/if}
		</svg>
	</figure>

	<figure class="m-0 min-w-0">
		<figcaption class="mb-2">
			<label class="flex items-center justify-between gap-3 text-xs font-bold text-neutral-300">
				<span>Current trait distribution</span>
				<select
					bind:value={selectedTrait}
					class="min-h-9 max-w-40 rounded border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-100"
					aria-label="Trait shown in the distribution chart"
				>
					{#each Object.entries(traitLabels) as [value, label] (value)}
						<option {value}>{label}</option>
					{/each}
				</select>
			</label>
		</figcaption>
		<svg
			viewBox={`0 0 ${width} ${height}`}
			class="block w-full rounded-md bg-neutral-950"
			role="img"
			aria-label={`${traitLabels[selectedTrait]} distribution across ${selectedBins.length} bins`}
		>
			<title>{traitLabels[selectedTrait]} distribution</title>
			<desc>Each bar counts living organisms whose inherited trait falls in that range.</desc>
			{#each selectedBins as bin, index (bin.from)}
				{@const barWidth = width / Math.max(1, selectedBins.length)}
				{@const barHeight = (bin.count / maximumBinCount) * (height - 8)}
				<rect
					x={index * barWidth + 2}
					y={height - barHeight - 2}
					width={Math.max(1, barWidth - 4)}
					height={barHeight}
					rx="2"
					fill="#86efac"
				>
					<title>{bin.from.toFixed(2)}–{bin.to.toFixed(2)}: {bin.count}</title>
				</rect>
			{/each}
		</svg>
	</figure>
</div>
