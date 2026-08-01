<script lang="ts">
	import { getFamilyDefinition } from '$lib/visualizations/fractal-atlas/families';
	import type { FractalFamily } from '$lib/visualizations/fractal-atlas/types';

	type Props = { family: FractalFamily };
	let { family }: Props = $props();
	let definition = $derived(getFamilyDefinition(family));
	let passport = $derived(definition.passport);
</script>

<section class="passport" aria-labelledby="family-passport-heading">
	<div class="passport-heading">
		<p>Family passport</p>
		<h3 id="family-passport-heading">{passport.name}</h3>
		{#if passport.alternativeNames.length}
			<small>Also: {passport.alternativeNames.join(', ')}</small>
		{/if}
	</div>
	<dl>
		<div class="formula">
			<dt>Formula</dt>
			<dd>{passport.formula}</dd>
		</div>
		<div>
			<dt>Computational class</dt>
			<dd>{passport.computationalClass}</dd>
		</div>
		<div>
			<dt>The pixel represents</dt>
			<dd>{passport.pixelRole}</dd>
		</div>
		<div>
			<dt>What stays fixed</dt>
			<dd>{passport.fixedQuantities}</dd>
		</div>
		<div>
			<dt>What changes</dt>
			<dd>{passport.variableQuantities}</dd>
		</div>
		<div>
			<dt>What the colour means</dt>
			<dd>{passport.colorMeaning}</dd>
		</div>
		<div>
			<dt>Typical symmetry</dt>
			<dd>{passport.typicalSymmetry}</dd>
		</div>
		<div>
			<dt>What to try</dt>
			<dd>{passport.suggestedExperiment}</dd>
		</div>
	</dl>
	<details>
		<summary>History and finite-computation note</summary>
		<p>{passport.historicalNote}</p>
		<p><strong>Computer caveat:</strong> {passport.finiteComputationCaveat}</p>
	</details>
	<a href={`#${passport.sectionId}`}>Read the corresponding field note</a>
</section>

<style>
	.passport {
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 0.45rem;
		background: var(--atlas-panel, #11131b);
		padding: 0.85rem;
		color: var(--atlas-text, #f0ece3);
	}

	.passport-heading p {
		margin: 0;
		color: var(--atlas-brass, #d1a65d);
		font: 700 0.62rem/1.2 var(--font-sans);
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0.28rem 0 0;
		color: inherit;
		font: 750 1.12rem/1.2 var(--font-sans);
	}

	small {
		display: block;
		margin-top: 0.18rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.68rem/1.3 var(--font-sans);
	}

	dl {
		display: grid;
		gap: 0;
		margin: 0.8rem 0 0;
	}

	dl div {
		display: grid;
		grid-template-columns: minmax(7rem, 0.75fr) minmax(0, 1.3fr);
		gap: 0.6rem;
		border-top: 1px solid var(--atlas-rule, #353846);
		padding: 0.5rem 0;
	}

	dt {
		color: var(--atlas-muted, #aaa6b5);
		font: 650 0.63rem/1.3 var(--font-sans);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	dd {
		margin: 0;
		font: 0.7rem/1.42 var(--font-sans);
	}

	.formula dd {
		color: #f0d8a6;
		font-family: var(--font-mono);
	}

	details {
		border-top: 1px solid var(--atlas-rule, #353846);
		padding-top: 0.55rem;
	}

	summary {
		min-height: 2.5rem;
		color: inherit;
		font: 650 0.7rem/1.3 var(--font-sans);
		cursor: pointer;
	}

	details p {
		margin: 0.4rem 0;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.68rem/1.45 var(--font-sans);
	}

	.passport > a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		margin-top: 0.35rem;
		color: #d7b773;
		font: 700 0.68rem/1.2 var(--font-sans);
		text-underline-offset: 0.22em;
	}

	@media (max-width: 30rem) {
		dl div {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}
	}

	@media (forced-colors: active) {
		.passport {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
