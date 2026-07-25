<script lang="ts">
	export type BenchmarkRow = {
		name: string;
		stateVariables: number;
		derivativeEvaluations: number;
		medianMs?: number;
		relativeToLif?: number;
	};

	type Props = {
		rawSodiumChargeNcCm2?: number;
		baselineSodiumChargeNcCm2?: number;
		excessSodiumChargeNcCm2?: number;
		atpMolesCm2?: number;
		atpMoleculesCm2?: number;
		chemicalWorkJoulesCm2?: number;
		deltaGAtpKjMol: number;
		benchmarks?: readonly BenchmarkRow[];
		onbenchmark?: () => void;
	};

	let {
		rawSodiumChargeNcCm2,
		baselineSodiumChargeNcCm2,
		excessSodiumChargeNcCm2,
		atpMolesCm2,
		atpMoleculesCm2,
		chemicalWorkJoulesCm2,
		deltaGAtpKjMol,
		benchmarks = [],
		onbenchmark
	}: Props = $props();

	let uid = $props.id();

	function scientific(value: number | undefined, digits = 4) {
		return value === undefined || !Number.isFinite(value)
			? 'unavailable'
			: value.toExponential(digits);
	}

	function decimal(value: number | undefined, digits = 4) {
		return value === undefined || !Number.isFinite(value) ? 'unavailable' : value.toFixed(digits);
	}
</script>

<section class="energy" aria-labelledby="{uid}-heading">
	<div class="heading">
		<div>
			<p class="eyebrow">What can be counted honestly?</p>
			<h3 id="{uid}-heading">Ion restoration is not computer cost</h3>
		</div>
		<span class="hh-only">Hodgkin–Huxley only</span>
	</div>

	<div class="headline-grid">
		<div>
			<span>Excess inward Na⁺ charge</span>
			<strong>{decimal(excessSodiumChargeNcCm2)} nC/cm²</strong>
			<small>stimulated run minus equal-duration quiet baseline</small>
		</div>
		<div>
			<span>ATP-equivalent burden</span>
			<strong>{scientific(atpMoleculesCm2)} molecules/cm²</strong>
			<small>three sodium ions restored per ATP hydrolysed</small>
		</div>
		<div>
			<span>ATP-equivalent amount</span>
			<strong>{scientific(atpMolesCm2)} mol/cm²</strong>
			<small>using F = 96485.33212 C/mol</small>
		</div>
	</div>

	<details>
		<summary>Raw charge and optional chemical-work assumption</summary>
		<dl>
			<div>
				<dt>Raw stimulated inward sodium</dt>
				<dd>{decimal(rawSodiumChargeNcCm2)} nC/cm²</dd>
			</div>
			<div>
				<dt>Quiet shadow baseline</dt>
				<dd>{decimal(baselineSodiumChargeNcCm2)} nC/cm²</dd>
			</div>
			<div>
				<dt>Assumed ΔG ATP</dt>
				<dd>{deltaGAtpKjMol} kJ/mol</dd>
			</div>
			<div>
				<dt>Secondary chemical-work estimate</dt>
				<dd>{scientific(chemicalWorkJoulesCm2)} J/cm²</dd>
			</div>
		</dl>
	</details>

	<div class="unavailable">
		<strong>Reduced models</strong>
		<p>
			Biological energy: not identifiable from the McCulloch–Pitts, LIF, Izhikevich, or
			FitzHugh–Nagumo state equations. The answer is not zero.
		</p>
	</div>

	<div class="caveat">
		<strong>Interpretation boundary</strong>
		<p>
			This is an ATP-equivalent sodium-restoration estimate, not total neuronal metabolism. It omits
			membrane area and geometry, synapses, calcium, transmitter cycling, glia, protein turnover,
			and maintenance beyond the chosen baseline. The membrane is canonical squid giant axon, not a
			complete human neuron.
		</p>
	</div>

	<section class="computer-cost" aria-labelledby="{uid}-computer-heading">
		<div class="heading">
			<div>
				<p class="eyebrow">Separate measurement</p>
				<h4 id="{uid}-computer-heading">Computer execution cost</h4>
			</div>
			{#if onbenchmark}
				<button type="button" onclick={onbenchmark}>Run warmed median benchmark</button>
			{/if}
		</div>

		{#if benchmarks.length > 0}
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th scope="col">Model</th>
							<th scope="col">States</th>
							<th scope="col">Derivative evaluations/step</th>
							<th scope="col">Median run, ms</th>
							<th scope="col">Relative to LIF</th>
						</tr>
					</thead>
					<tbody>
						{#each benchmarks as row (row.name)}
							<tr>
								<th scope="row">{row.name}</th>
								<td>{row.stateVariables}</td>
								<td>{row.derivativeEvaluations}</td>
								<td>{decimal(row.medianMs, 2)}</td>
								<td
									>{row.relativeToLif === undefined
										? 'unavailable'
										: `${row.relativeToLif.toFixed(2)}×`}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="benchmark-empty">
				No benchmark has been run. Timing is device-specific and is never presented as biological
				energy.
			</p>
		{/if}
	</section>
</section>

<style>
	.energy {
		display: grid;
		gap: 1rem;
		border: 1px solid #2d3440;
		border-radius: 0.75rem;
		background: #0d1118;
		padding: 1rem;
	}
	.heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}
	.eyebrow {
		margin: 0 0 0.2rem;
		color: #9b87c7;
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h3,
	h4 {
		margin: 0;
		color: #fff;
	}
	h3 {
		font-size: 1.05rem;
	}
	h4 {
		font-size: 0.9rem;
	}
	.hh-only {
		border: 1px solid #8069a7;
		border-radius: 999px;
		padding: 0.35rem 0.55rem;
		color: #cab9eb;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.headline-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
	}
	.headline-grid > div {
		display: grid;
		gap: 0.25rem;
		border-top: 2px solid #9b87c7;
		background: #121720;
		padding: 0.75rem;
	}
	.headline-grid span,
	dt {
		color: #8e98a7;
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.headline-grid strong {
		color: #f3effa;
		font:
			800 0.85rem/1.3 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
		overflow-wrap: anywhere;
	}
	.headline-grid small {
		color: #8e98a7;
		font-size: 0.62rem;
		line-height: 1.4;
	}
	details,
	.unavailable,
	.caveat,
	.computer-cost {
		border: 1px solid #29313c;
		border-radius: 0.55rem;
		background: #10151d;
	}
	summary {
		min-height: 2.75rem;
		cursor: pointer;
		padding: 0.75rem;
		color: #e4e8ef;
		font-size: 0.75rem;
		font-weight: 800;
	}
	summary:focus-visible,
	button:focus-visible {
		outline: 3px solid #cab9eb;
		outline-offset: 3px;
	}
	dl {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0;
		border-top: 1px solid #29313c;
		padding: 0.75rem;
	}
	dd {
		margin: 0.2rem 0 0;
		color: #e3e7ed;
		font:
			0.72rem/1.4 ui-monospace,
			SFMono-Regular,
			Consolas,
			monospace;
		overflow-wrap: anywhere;
	}
	.unavailable,
	.caveat {
		padding: 0.75rem;
	}
	.unavailable strong,
	.caveat strong {
		color: #e9edf3;
		font-size: 0.75rem;
	}
	.unavailable p,
	.caveat p,
	.benchmark-empty {
		margin: 0.3rem 0 0;
		color: #a7b0bd;
		font-size: 0.7rem;
		line-height: 1.5;
	}
	.computer-cost {
		padding: 0.75rem;
	}
	button {
		min-height: 2.75rem;
		border: 1px solid #8069a7;
		border-radius: 0.45rem;
		background: #201a2b;
		padding: 0.5rem 0.65rem;
		color: #e9ddff;
		font: inherit;
		font-size: 0.68rem;
		font-weight: 800;
		cursor: pointer;
	}
	.table-wrap {
		overflow-x: auto;
		margin-top: 0.7rem;
	}
	table {
		width: 100%;
		min-width: 42rem;
		border-collapse: collapse;
		color: #d9dfe7;
		font-size: 0.68rem;
	}
	th,
	td {
		border-bottom: 1px solid #29313c;
		padding: 0.55rem;
		text-align: left;
	}
	thead th {
		color: #909aa8;
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	tbody th {
		color: #fff;
	}
	@media (max-width: 48rem) {
		.headline-grid,
		dl {
			grid-template-columns: 1fr;
		}
		.heading {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
