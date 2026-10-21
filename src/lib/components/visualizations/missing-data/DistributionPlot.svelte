<script lang="ts">
	import type { Experiment } from '$lib/visualizations/missing-data/types';
	let { experiment, column }: { experiment: Experiment; column: number } = $props();
	const bins = 28;
	function histogram(values: Float64Array) {
		const counts = Array<number>(bins).fill(0);
		let n = 0;
		for (let r = 0; r < experiment.data.rows; r++) {
			const value = values[r * experiment.data.cols + column];
			if (Number.isFinite(value)) {
				counts[Math.max(0, Math.min(bins - 1, Math.floor(((value - 2) / 96) * bins)))]++;
				n++;
			}
		}
		return counts.map((count) => (n ? count / n : 0));
	}
	const complete = $derived(histogram(experiment.data.truth));
	const observed = $derived(histogram(experiment.observed.values));
	const filled = $derived(histogram(experiment.completion.values));
	const maximum = $derived(Math.max(0.15, ...complete, ...observed, ...filled));
	function path(counts: number[]) {
		return counts
			.map(
				(count, i) =>
					`${i ? 'L' : 'M'}${25 + ((i + 0.5) / bins) * 500},${128 - (count / maximum) * 108}`
			)
			.join(' ');
	}
</script>

<svg
	class="ms-distribution"
	viewBox="0 0 550 160"
	role="img"
	aria-label="Relative-frequency histograms for the complete, available, and filled values of the selected column"
>
	<title>Where the remaining values gather</title>
	<desc
		>Each line is normalized by its own sample count. Horizontal range two to ninety-eight synthetic
		score points; values beyond this range enter the edge bins. The dotted complete-sample line is a
		simulation-only reference.</desc
	>
	<line x1="25" x2="525" y1="128" y2="128" stroke="#9caeaa" stroke-width=".5" />
	<path d={path(complete)} fill="none" stroke="#6d7976" stroke-width="1.5" stroke-dasharray="4 4" />
	<path d={path(observed)} fill="none" stroke="#bb503b" stroke-width="2.5" />
	{#if experiment.settings.imputation !== 'none'}<path
			d={path(filled)}
			fill="none"
			stroke="#7864a4"
			stroke-width="2.5"
		/>{/if}
	{#each [2, 26, 50, 74, 98] as value (value)}<text
			x={25 + ((value - 2) / 96) * 500}
			y="148"
			text-anchor="middle"
			fill="#485a55"
			font-size="10">{value}</text
		>{/each}
	<text x="25" y="12" fill="#485a55" font-size="9">RELATIVE FREQUENCY / OWN DENOMINATOR</text>
</svg>
