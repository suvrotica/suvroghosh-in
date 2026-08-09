<script lang="ts">
	import { getWorldPreset } from '$lib/visualizations/chitin-engine/presets';
	import type { CreaturePhenotype, ExhibitState } from '$lib/visualizations/chitin-engine/types';

	type Props = {
		phenotype: CreaturePhenotype;
		state: ExhibitState;
		selectedSegment?: number;
	};

	let { phenotype, state, selectedSegment = -1 }: Props = $props();
	let world = $derived(getWorldPreset(state.genome.world));
	let selectedPlate = $derived(
		selectedSegment >= 0 ? phenotype.plates[selectedSegment] : undefined
	);
</script>

<aside class="readout" aria-label="Accessible specimen report" data-testid="chitin-readout">
	<div class="identity">
		<div>
			<p class="eyebrow">Specimen record</p>
			<h3>{phenotype.informalName}</h3>
		</div>
		<code>{phenotype.archiveDesignation}</code>
	</div>

	<div class="dual-record">
		<section aria-labelledby="archive-note-heading">
			<p class="record-label fiction" id="archive-note-heading">Archive fiction</p>
			<p>{phenotype.habitatNote}</p>
		</section>
		<section aria-labelledby="mechanism-note-heading">
			<p class="record-label mechanism" id="mechanism-note-heading">Actual mechanism</p>
			<p>{phenotype.proceduralSummary}</p>
		</section>
	</div>

	<dl class="facts">
		<div>
			<dt>Seed</dt>
			<dd><code>{state.genome.seed}</code></dd>
		</div>
		<div>
			<dt>Body plan</dt>
			<dd>{state.genome.bodyPlan.replaceAll('-', ' ')}</dd>
		</div>
		<div>
			<dt>Discipline</dt>
			<dd>{state.genome.discipline.replaceAll('-', ' ')}</dd>
		</div>
		<div>
			<dt>Regions / plates</dt>
			<dd>{state.genome.bodyRegions} / {phenotype.plates.length}</dd>
		</div>
		<div>
			<dt>Walking appendages</dt>
			<dd>{phenotype.limbs.filter((limb) => limb.kind !== 'grasping').length}</dd>
		</div>
		<div>
			<dt>Visible lenses</dt>
			<dd>{phenotype.eyes.length}</dd>
		</div>
		<div>
			<dt>Material</dt>
			<dd>{state.genome.material.replaceAll('-', ' ')}</dd>
		</div>
		<div>
			<dt>Gait</dt>
			<dd>{state.genome.gait.replaceAll('-', ' ')}</dd>
		</div>
		<div>
			<dt>World</dt>
			<dd>{world.name} at {Math.round(state.genome.worldInfluence * 100)}%</dd>
		</div>
		<div>
			<dt>View</dt>
			<dd>{state.view}</dd>
		</div>
	</dl>

	{#if selectedPlate}
		<section class="selection" aria-live="polite">
			<p class="record-label mechanism">Selected anatomy</p>
			<p>
				Plate {selectedPlate.segmentIndex + 1}, region {selectedPlate.region + 1}. Its local frame
				inherits the axial tangent and normal; appendage sockets remain attached to this frame.
			</p>
		</section>
	{/if}

	<p class="disclaimer">
		World transforms are speculative visual heuristics. This page does not report an organism,
		predict evolution, or simulate genetics, physiology, muscles, ecology, or extraterrestrial life.
	</p>
</aside>

<style>
	.readout {
		display: grid;
		gap: 1rem;
		padding: 1.1rem;
		border: 1px solid color-mix(in srgb, var(--chitin-accent, #b8ff3d) 24%, transparent);
		border-radius: 1.1rem;
		background: color-mix(in srgb, #070713 94%, transparent);
		color: #d8d9e6;
		font: 0.82rem/1.55 var(--font-sans, system-ui, sans-serif);
	}

	.identity,
	.dual-record,
	.facts {
		display: grid;
		gap: 0.75rem;
	}

	.identity {
		grid-template-columns: 1fr auto;
		align-items: start;
	}

	.eyebrow,
	.record-label {
		margin: 0 0 0.25rem;
		font: 700 0.64rem/1.2 var(--font-mono, monospace);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.eyebrow {
		color: #8b8da4;
	}
	.fiction {
		color: #d5a5ff;
	}
	.mechanism {
		color: var(--chitin-accent, #b8ff3d);
	}

	h3,
	p,
	dl,
	dd {
		margin: 0;
	}

	h3 {
		color: white;
		font: 650 clamp(1.05rem, 2vw, 1.35rem)/1.15 var(--font-sans, system-ui, sans-serif);
	}

	code {
		color: #d8ff91;
		font-family: var(--font-mono, monospace);
		font-size: 0.78rem;
	}

	.dual-record {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.dual-record section,
	.selection {
		padding: 0.8rem;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 0.75rem;
		background: rgb(255 255 255 / 2.5%);
	}

	.facts {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.facts div {
		display: grid;
		grid-template-columns: minmax(6.5rem, 0.8fr) 1fr;
		gap: 0.5rem;
		padding-block: 0.35rem;
		border-bottom: 1px solid rgb(255 255 255 / 6%);
	}

	dt {
		color: #8f92a5;
	}
	dd {
		color: #eef0f6;
		text-transform: capitalize;
	}

	.disclaimer {
		color: #a9abb8;
		font-size: 0.75rem;
	}

	@media (max-width: 42rem) {
		.dual-record,
		.facts {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.readout,
		.dual-record section,
		.selection {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
		.fiction,
		.mechanism,
		code {
			color: LinkText;
		}
	}
</style>
