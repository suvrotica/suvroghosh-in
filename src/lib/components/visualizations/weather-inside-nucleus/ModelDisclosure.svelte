<script lang="ts">
	import {
		MODEL_DEFINITION,
		MODEL_SEMANTIC_VERSION,
		PARAMETER_DEFINITIONS
	} from '$lib/visualizations/weather-inside-nucleus/model';

	type Props = {
		open?: boolean;
		onclose?: () => void;
	};

	let { open = false, onclose }: Props = $props();
	let activeNode = $state(0);

	const nodes = [
		{
			label: 'EGF / EGFR activation',
			copy: 'EGF remains extracellular; receptor blockade changes only new activation in this model.'
		},
		{
			label: 'Downstream activity proxy',
			copy: 'Two low-pass activity stages expose delay and duration without reproducing a full signaling network.'
		},
		{
			label: 'Occupancy + contact propensity',
			copy: 'Relative affinity controls occupancy while an independent geometry bias controls stochastic near-state propensity.'
		},
		{
			label: 'Promoter OFF / ON switching',
			copy: 'A phenomenological activation hazard combines basal, occupancy, and transient licensing terms.'
		},
		{
			label: 'RNA initiation',
			copy: 'When the promoter is ON, Poisson initiation events occur at a fixed guided-experience rate.'
		}
	] as const;

	const limitations = [
		'EGF remains outside the cell. The inward light is a downstream activity proxy, not an EGF molecule, electricity, or a physical wave.',
		'The cell → nucleus → locus transition is a semantic scale change, not a literal continuous zoom.',
		'Chromosome territories and chromatin motion are coarse explanatory geometry, not a measured nuclear reconstruction.',
		'Contact propensity is not instantaneous distance and guarantees neither contact nor transcription.',
		'Enhancer proximity is neither universally necessary nor universally sufficient; the relation is locus- and context-dependent.',
		'A binding-site mutation changes one affinity parameter here. A real mutation may have additional effects.',
		'The promoter model omits refractory, paused, multi-step, feedback, and cofactor states.',
		'Parallel pathways, receptor trafficking, cell context, chromatin state, loop extrusion, compartments, cell cycle, allele-specific effects, nuclear mechanics, and measurement uncertainty are omitted.',
		'Interventions establish causality only inside these equations; they do not validate a mechanism in living cells.',
		'Ensemble outputs are model distributions, not biological population predictions without calibration to named data.',
		'Normalized values and model minutes are illustrative; no nanometres, molecule counts, concentrations, or biological timescales are implied.'
	] as const;

	const parameterEntries = Object.entries(PARAMETER_DEFINITIONS);
</script>

{#if open}
	<section
		class="model-disclosure"
		aria-labelledby="wn-model-heading"
		data-testid="nucleus-model-disclosure"
	>
		<div class="heading-row">
			<div>
				<p>How is this modeled?</p>
				<h2 id="wn-model-heading">One declared chain, several missing worlds</h2>
			</div>
			<button type="button" onclick={() => onclose?.()}>Close model</button>
		</div>
		<p class="model-label">
			Synthetic demonstration locus · model {MODEL_SEMANTIC_VERSION} · {MODEL_DEFINITION.method}
		</p>

		<div class="causal-chain" role="list" aria-label="Modeled causal chain">
			{#each nodes as node, index (node.label)}
				<button
					type="button"
					class:active={activeNode === index}
					aria-pressed={activeNode === index}
					onclick={() => (activeNode = index)}
				>
					<span>{index + 1}</span>{node.label}
				</button>
				{#if index < nodes.length - 1}<i aria-hidden="true">→</i>{/if}
			{/each}
		</div>
		<p class="node-copy">{nodes[activeNode].copy}</p>

		<div class="model-depth">
			<details>
				<summary>Equations and numerical method</summary>
				<p>
					Continuous variables use exact affine relaxation over a fixed step. A discrete hazard
					<code>k</code> becomes <code>1 − exp(−kΔt)</code>; initiations use Poisson sampling and
					degradation uses binomial sampling. This is a hybrid time-stepped stochastic simulation,
					not exact Gillespie.
				</p>
				<p>
					The page article records every equation in full. The Worker and both renderers consume
					this same versioned kernel; neither camera nor particle system can create a scientific
					event.
				</p>
			</details>
			<details>
				<summary>Canonical parameter definition</summary>
				<div class="parameter-table-wrap">
					<table>
						<caption
							>Defaults, safe ranges, units, and descriptions read from the model’s single typed
							definition.</caption
						>
						<thead
							><tr
								><th scope="col">Parameter</th><th scope="col">Default</th><th scope="col">Range</th
								><th scope="col">Unit</th><th scope="col">Meaning</th></tr
							></thead
						>
						<tbody>
							{#each parameterEntries as [name, definition] (name)}
								<tr
									><th scope="row"><code>{name}</code></th><td>{definition.default}</td><td
										>{definition.minimum}–{definition.maximum}</td
									><td>{definition.unit}</td><td>{definition.description}</td></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			</details>
			<details open>
				<summary>Complete limitations</summary>
				<ul>
					{#each limitations as limitation (limitation)}<li>{limitation}</li>{/each}
				</ul>
			</details>
		</div>
	</section>
{/if}

<style>
	.model-disclosure {
		border-top: 1px solid #41445c;
		background: #0a0c18;
		padding: clamp(1rem, 3vw, 2rem);
		color: #eae8f2;
	}

	.heading-row {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
	}

	.heading-row p {
		margin: 0;
		color: #8ddff2;
		font: 750 0.65rem/1.2 var(--font-sans, sans-serif);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0.4rem 0 0;
		font: 780 clamp(1.35rem, 3vw, 2.25rem) / 1.05 var(--font-sans, sans-serif);
		letter-spacing: -0.035em;
	}

	button,
	summary {
		cursor: pointer;
	}

	.heading-row > button {
		min-height: 2.75rem;
		border: 1px solid #6c7088;
		border-radius: 0.35rem;
		background: #121527;
		padding: 0.5rem 0.75rem;
		color: #efedf7;
		font: 700 0.72rem/1.2 var(--font-sans, sans-serif);
	}

	.model-label {
		margin: 0.8rem 0 0;
		color: #9fa2b6;
		font:
			0.67rem/1.45 ui-monospace,
			monospace;
	}

	.causal-chain {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 1rem;
		overflow-x: auto;
		padding-bottom: 0.4rem;
	}

	.causal-chain button {
		display: inline-flex;
		min-width: max-content;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid #464a62;
		border-radius: 999px;
		background: #111426;
		padding: 0.45rem 0.7rem;
		color: #c7c7d7;
		font: 700 0.7rem/1.2 var(--font-sans, sans-serif);
	}

	.causal-chain button.active {
		border-color: #6ce5ff;
		color: #f5f4fb;
	}

	.causal-chain button span {
		display: grid;
		width: 1.25rem;
		height: 1.25rem;
		place-items: center;
		border-radius: 999px;
		background: #242a44;
		font-family: ui-monospace, monospace;
	}

	.causal-chain i {
		color: #777b91;
		font-style: normal;
	}

	.node-copy {
		max-width: 70ch;
		margin: 0.55rem 0 0;
		border-left: 3px solid #ed62d0;
		padding: 0.55rem 0.7rem;
		color: #d3d1df;
		font: 0.8rem/1.5 var(--font-sans, sans-serif);
	}

	.model-depth {
		display: grid;
		gap: 0.6rem;
		margin-top: 1rem;
	}

	details {
		border: 1px solid #363a50;
		border-radius: 0.4rem;
		background: #0d1020;
		padding: 0.75rem;
	}

	summary {
		min-height: 2rem;
		color: #f0edf7;
		font: 730 0.8rem/1.4 var(--font-sans, sans-serif);
	}

	details p,
	details li {
		color: #b8b8ca;
		font: 0.76rem/1.55 var(--font-sans, sans-serif);
	}

	details ul {
		margin-bottom: 0;
		padding-left: 1.25rem;
	}

	.parameter-table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		min-width: 800px;
		border-collapse: collapse;
		font: 0.68rem/1.4 var(--font-sans, sans-serif);
	}

	caption {
		padding: 0.6rem 0;
		color: #a9aabd;
		text-align: left;
	}

	th,
	td {
		border-top: 1px solid #35384c;
		padding: 0.5rem;
		text-align: left;
		vertical-align: top;
	}

	code {
		color: #ffd166;
	}

	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid #f7fbff;
		outline-offset: 3px;
	}

	@media (forced-colors: active) {
		.model-disclosure,
		details,
		.causal-chain button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
