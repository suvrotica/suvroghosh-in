<script lang="ts">
	import type { HedgePair } from '..';

	let { pair }: { pair: HedgePair } = $props();
</script>

<section
	id="barnum-hedge-experiment"
	class="hedge-experiment"
	data-testid="barnum-hedge-experiment"
	data-pair-id={pair.id}
	data-core-id={pair.coreId}
	aria-labelledby="hedge-experiment-heading"
>
	<header>
		<p>Experiment 4 · One proposition, one hedge</p>
		<h3 id="hedge-experiment-heading">What changes when “{pair.hedge.trim()}” is added?</h3>
		<span>
			The substantive proposition and ending punctuation stay fixed; only the audited hedge prefix
			is inserted.
		</span>
	</header>

	<div class="variants">
		<section data-treatment="plain">
			<strong>Plain</strong>
			<p>{pair.plain}</p>
		</section>
		<section data-treatment="hedged">
			<strong>Hedged</strong>
			<p>{pair.hedged}</p>
		</section>
	</div>

	<details>
		<summary>Technical equality check</summary>
		<dl>
			<div>
				<dt>Core ID</dt>
				<dd><code>{pair.coreId}</code> on both sides</dd>
			</div>
			<div>
				<dt>Semantic family</dt>
				<dd><code>{pair.semanticFamilyId}</code></dd>
			</div>
			<div>
				<dt>Axis and pole</dt>
				<dd><code>{pair.axis} · {pair.pole}</code></dd>
			</div>
			<div>
				<dt>Only insertion</dt>
				<dd><code>{pair.hedge}</code></dd>
			</div>
		</dl>
	</details>
</section>

<style>
	.hedge-experiment {
		display: grid;
		gap: 0.75rem;
		border: 1px solid var(--barnum-rule);
		border-left: 4px solid var(--barnum-ochre);
		border-radius: 0.5rem;
		background: var(--barnum-raised);
		padding: 0.8rem;
	}

	header p,
	header h3,
	header span,
	.variants p,
	dl,
	dt,
	dd {
		margin: 0;
	}

	header p {
		color: var(--barnum-ochre-text);
		font: 760 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h3 {
		margin-top: 0.12rem;
		font: 800 0.95rem/1.25 var(--barnum-sans);
	}

	header span {
		display: block;
		margin-top: 0.2rem;
		color: var(--barnum-muted);
		font: 0.75rem/1.5 var(--barnum-sans);
	}

	.variants {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.variants section {
		display: grid;
		gap: 0.35rem;
		border: 1px solid var(--barnum-rule);
		border-radius: 0.35rem;
		background: var(--barnum-paper);
		padding: 0.65rem;
	}

	.variants strong {
		font: 760 0.75rem/1.35 var(--barnum-sans);
	}

	.variants p {
		font: 0.9rem/1.5 var(--barnum-serif);
	}

	details {
		border-top: 1px solid var(--barnum-rule);
	}

	details summary {
		min-height: 2.75rem;
		padding-block: 0.7rem;
		font: 760 0.75rem/1.35 var(--barnum-sans);
		cursor: pointer;
	}

	dl {
		display: grid;
		gap: 0.25rem;
		padding-bottom: 0.25rem;
	}

	dl > div {
		display: grid;
		grid-template-columns: minmax(7rem, 0.4fr) minmax(0, 1fr);
		gap: 0.55rem;
	}

	dt,
	dd {
		font: 0.72rem/1.45 var(--barnum-sans);
		overflow-wrap: anywhere;
	}

	dt {
		color: var(--barnum-muted);
		font-weight: 750;
	}

	code {
		font: 0.7rem/1.4 var(--barnum-mono);
	}

	details summary:focus-visible {
		outline: 3px solid var(--barnum-focus);
		outline-offset: 2px;
	}

	@media (max-width: 36rem) {
		.variants,
		dl > div {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.hedge-experiment,
		.variants section,
		details {
			border-color: CanvasText;
		}
	}
</style>
