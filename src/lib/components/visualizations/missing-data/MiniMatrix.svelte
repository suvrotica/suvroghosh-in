<script lang="ts">
	import { onMount } from 'svelte';
	import type { Experiment } from '$lib/visualizations/missing-data/types';
	import { matrixColor } from '$lib/visualizations/missing-data/colors';
	let { experiment }: { experiment: Experiment } = $props();
	let canvas: HTMLCanvasElement;
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
	$effect(() => {
		if (!ready || !canvas) return;
		const e = experiment;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.fillStyle = '#101f26';
		ctx.fillRect(0, 0, 640, 240);
		for (let dr = 0; dr < e.data.rows; dr++) {
			const r = e.order[dr];
			for (let c = 0; c < e.data.cols; c++) {
				const i = r * e.data.cols + c;
				if (e.observed.mask[i]) continue;
				ctx.fillStyle = `rgb(${matrixColor(e.observed.values[i]).join(',')})`;
				ctx.fillRect(
					8 + (c * 624) / e.data.cols,
					6 + (dr * 228) / e.data.rows,
					(624 / e.data.cols) * 0.65,
					Math.max(1, (228 / e.data.rows) * 0.64)
				);
			}
		}
	});
</script>

<div
	role="img"
	aria-label={`${experiment.settings.scenario} missingness matrix; ${(experiment.summary.rate * 100).toFixed(1)} percent missing`}
>
	<canvas bind:this={canvas} width="640" height="240" aria-hidden="true"></canvas>
</div>
