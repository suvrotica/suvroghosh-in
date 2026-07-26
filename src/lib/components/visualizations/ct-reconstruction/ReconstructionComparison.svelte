<script lang="ts">
	import type { ReconstructionMetrics } from '$lib/visualizations/ct-reconstruction';
	import ReconstructionView from './ReconstructionView.svelte';

	type Props = {
		groundTruth: Float32Array;
		backprojection?: Float32Array | null;
		filteredBackprojection?: Float32Array | null;
		size: number;
		filterLabel: string;
		partial?: boolean;
		progress?: number;
		backprojectionMetrics?: ReconstructionMetrics | null;
		filteredMetrics?: ReconstructionMetrics | null;
		autoWindow?: boolean;
		windowCenter?: number;
		windowWidth?: number;
		zoom?: number;
	};

	let {
		groundTruth,
		backprojection = null,
		filteredBackprojection = null,
		size,
		filterLabel,
		partial = false,
		progress = 0,
		backprojectionMetrics = null,
		filteredMetrics = null,
		autoWindow = true,
		windowCenter = 0.5,
		windowWidth = 1,
		zoom = 1
	}: Props = $props();

	function scaleInvariantDifference(
		truth: Float32Array,
		estimate: Float32Array | null
	): Float32Array | null {
		if (!estimate || estimate.length !== truth.length) return null;
		let dot = 0;
		let energy = 0;
		for (let index = 0; index < truth.length; index += 1) {
			const value = estimate[index];
			if (!Number.isFinite(value)) continue;
			dot += truth[index] * value;
			energy += value * value;
		}
		const scale = energy > 1e-12 ? dot / energy : 0;
		const difference = new Float32Array(truth.length);
		for (let index = 0; index < truth.length; index += 1) {
			difference[index] = estimate[index] * scale - truth[index];
		}
		return difference;
	}

	let difference = $derived(scaleInvariantDifference(groundTruth, filteredBackprojection));

	function metric(value: number | undefined, digits = 3) {
		return value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
	}
</script>

<section class="comparison" aria-labelledby="ct-reconstruction-heading">
	<div class="comparison-heading">
		<div>
			<p>Same sinogram, two operations</p>
			<h3 id="ct-reconstruction-heading">Reconstruction comparison</h3>
		</div>
		<span>{filterLabel}</span>
	</div>

	<div class="image-grid">
		<ReconstructionView
			title="Ground-truth phantom"
			description="The hidden attenuation map. A real scanner never receives this answer image."
			values={groundTruth}
			{size}
			{autoWindow}
			{windowCenter}
			{windowWidth}
			{zoom}
			valueLabel="Synthetic reference attenuation map."
		/>
		<ReconstructionView
			title="Ordinary back-projection"
			description="Each detector value is spread along its complete ray, so the object emerges inside a broad blur."
			values={backprojection}
			{size}
			{partial}
			{progress}
			{autoWindow}
			{windowCenter}
			{windowWidth}
			{zoom}
			valueLabel={backprojection
				? `${Math.round(progress * 100)} percent of the scan represented.`
				: 'No back-projection yet.'}
		/>
		<ReconstructionView
			title="Filtered back-projection"
			description={`${filterLabel} alters each detector profile before it is spread backwards, restoring edge information.`}
			values={filteredBackprojection}
			{size}
			{partial}
			{progress}
			{autoWindow}
			{windowCenter}
			{windowWidth}
			{zoom}
			valueLabel={filteredBackprojection
				? `${Math.round(progress * 100)} percent of the scan represented using ${filterLabel}.`
				: 'No filtered reconstruction yet.'}
		/>
		<ReconstructionView
			title="Filtered error"
			description="A signed, scale-aligned difference from the known synthetic phantom. Green is near zero; red and blue have opposite signs."
			values={difference}
			{size}
			mode="difference"
			{partial}
			{progress}
			valueLabel={difference
				? 'Signed scale-invariant difference from the synthetic reference.'
				: 'No difference image yet.'}
		/>
	</div>

	<details class="comparison-help">
		<summary>How to compare these images</summary>
		<p>
			Follow the same edge through all four panels. Ordinary back-projection spreads it broadly;
			filtering restores sharper transitions but also amplifies inconsistent or noisy measurements.
			The signed error panel is available only because this synthetic experiment knows the answer.
		</p>
	</details>

	<div class="metrics" aria-label="Synthetic reconstruction quality metrics">
		<div>
			<span>Method</span><span>scale-invariant RMSE</span><span>MAE</span><span>correlation</span>
		</div>
		<div>
			<strong>Ordinary BP</strong>
			<output>{metric(backprojectionMetrics?.scaleInvariantRmse)}</output>
			<output>{metric(backprojectionMetrics?.mae)}</output>
			<output>{metric(backprojectionMetrics?.correlation)}</output>
		</div>
		<div>
			<strong>{filterLabel}</strong>
			<output>{metric(filteredMetrics?.scaleInvariantRmse)}</output>
			<output>{metric(filteredMetrics?.mae)}</output>
			<output>{metric(filteredMetrics?.correlation)}</output>
		</div>
		<p>
			These compare with a known synthetic answer inside the field of view. They are teaching
			metrics, not clinical image-quality or diagnostic scores.
		</p>
	</div>
</section>

<style>
	.comparison {
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-soft);
		color: var(--ink);
	}
	.comparison-heading {
		display: flex;
		min-height: 3.65rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.8rem;
	}
	.comparison-heading p,
	.comparison-heading h3,
	.metrics p {
		margin: 0;
	}
	.comparison-heading p {
		margin-bottom: 0.15rem;
		font-family: ui-monospace, monospace;
		font-size: 0.61rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.comparison-heading h3 {
		font-size: 1rem;
	}
	.comparison-heading > span {
		border: 1px solid var(--control-border);
		border-radius: 999px;
		padding: 0.24rem 0.45rem;
		font-family: ui-monospace, monospace;
		font-size: 0.64rem;
		color: var(--ink-muted);
	}
	.image-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		padding: 0 0.65rem 0.65rem;
	}
	.metrics {
		display: grid;
		gap: 0.2rem;
		border-top: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.7rem 0.8rem;
		font-family: ui-monospace, monospace;
		font-size: 0.66rem;
	}
	.comparison-help {
		border-top: 1px solid var(--rule);
		background: var(--paper-raised);
		padding: 0.6rem 0.8rem;
		font-size: 0.72rem;
	}
	.comparison-help summary {
		min-height: 2rem;
		cursor: pointer;
		font-weight: 700;
	}
	.comparison-help p {
		margin: 0;
		padding: 0.35rem 0 0.25rem;
		line-height: 1.5;
		color: var(--ink-muted);
	}
	.metrics > div {
		display: grid;
		grid-template-columns: minmax(7rem, 1.4fr) repeat(3, minmax(4rem, 1fr));
		gap: 0.5rem;
		align-items: baseline;
	}
	.metrics > div:first-child {
		padding-bottom: 0.3rem;
		color: var(--ink-muted);
	}
	.metrics output {
		color: var(--ink);
	}
	.metrics p {
		margin-top: 0.4rem;
		font-family: inherit;
		font-size: 0.62rem;
		line-height: 1.45;
		color: var(--ink-muted);
	}
	@media (max-width: 620px) {
		.image-grid {
			grid-template-columns: 1fr;
		}
		.metrics {
			overflow-x: auto;
		}
		.metrics > div {
			min-width: 30rem;
		}
	}
</style>
