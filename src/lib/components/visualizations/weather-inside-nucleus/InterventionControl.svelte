<script lang="ts">
	import type { InterventionId } from '$lib/visualizations/weather-inside-nucleus/experience';
	import { DEFAULT_MODEL_PARAMETERS } from '$lib/visualizations/weather-inside-nucleus/model';

	type InterventionValues = Readonly<{
		block: number;
		duration: number;
		affinity: number;
		contact: number;
	}>;

	type Props = {
		selected?: InterventionId | null;
		values: InterventionValues;
		disabled?: boolean;
		onselect?: (intervention: InterventionId) => void;
		onpreview?: (values: InterventionValues) => void;
		oncommit?: () => void;
	};

	let {
		selected = null,
		values,
		disabled = false,
		onselect,
		onpreview,
		oncommit
	}: Props = $props();

	const interventions: readonly {
		id: InterventionId;
		target: string;
		label: string;
		technical: string;
	}[] = [
		{
			id: 'blocked',
			target: 'Receptor',
			label: 'Block the receptor',
			technical: 'modeled EGFR inhibition'
		},
		{
			id: 'lengthened',
			target: 'Signal',
			label: 'Lengthen the signal',
			technical: 'pulse duration'
		},
		{
			id: 'mutated',
			target: 'Binding site',
			label: 'Weaken the foothold',
			technical: 'binding-site affinity'
		},
		{
			id: 'contact',
			target: 'Chromatin neighborhood',
			label: 'Change how often they meet',
			technical: 'contact propensity'
		}
	];

	function valueFrom(event: Event) {
		return Number((event.currentTarget as HTMLInputElement).value);
	}

	function patch(patchValue: Partial<InterventionValues>) {
		onpreview?.({ ...values, ...patchValue });
	}

	function contactStep(delta: number) {
		patch({ contact: Math.max(0, Math.min(1, Math.round((values.contact + delta) * 20) / 20)) });
	}

	let commitCopy = $derived(
		selected === 'blocked'
			? values.block >= 0.999
				? 'New receptor activation stops at the membrane in this model; existing activity still decays.'
				: `New receptor activation is reduced by ${Math.round(values.block * 100)}%; existing activity still decays.`
			: selected === 'lengthened'
				? 'The downstream activity lasts longer.'
				: selected === 'mutated'
					? 'The factor can arrive, but occupancy becomes less likely.'
					: selected === 'contact'
						? 'The enhancer and promoter meet more often—not always.'
						: ''
	);
	let canCommit = $derived(
		selected === 'blocked'
			? values.block > DEFAULT_MODEL_PARAMETERS.receptorBlockade
			: selected === 'lengthened'
				? values.duration > DEFAULT_MODEL_PARAMETERS.egfDuration
				: selected === 'mutated'
					? values.affinity < DEFAULT_MODEL_PARAMETERS.bindingAffinity
					: selected === 'contact'
						? values.contact > DEFAULT_MODEL_PARAMETERS.geometryBias
						: false
	);
</script>

<section class="intervention-control" aria-labelledby="wn-intervention-heading">
	<h2 id="wn-intervention-heading">Where will you intervene?</h2>
	<p>Choose one causal link. The guided comparison keeps every other declared parameter fixed.</p>
	<div class="target-list" role="list">
		{#each interventions as intervention, index (intervention.id)}
			<button
				type="button"
				class:selected={selected === intervention.id}
				aria-pressed={selected === intervention.id}
				{disabled}
				onclick={() => onselect?.(intervention.id)}
			>
				<span class="number">{index + 1}</span>
				<span
					><small>{intervention.target}</small><strong>{intervention.label}</strong><em
						>{intervention.technical}</em
					></span
				>
			</button>
		{/each}
	</div>

	{#if selected}
		<div class="active-control">
			{#if selected === 'blocked'}
				<label for="wn-receptor-block"
					><span>Receptor blockade</span><output>{Math.round(values.block * 100)}%</output></label
				>
				<input
					id="wn-receptor-block"
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={values.block}
					oninput={(event) => patch({ block: valueFrom(event) })}
				/>
				<small>Full blockade prevents new activation; activity already present still decays.</small>
			{:else if selected === 'lengthened'}
				<label for="wn-signal-duration"
					><span>Pulse duration</span><output>{values.duration.toFixed(0)} model min</output></label
				>
				<input
					id="wn-signal-duration"
					type="range"
					min="18"
					max="48"
					step="1"
					value={values.duration}
					oninput={(event) => patch({ duration: valueFrom(event) })}
				/>
				<small
					>Duration changes integrated activity, not a ligand count or a biological clock.</small
				>
			{:else if selected === 'mutated'}
				<label for="wn-site-affinity"
					><span>Relative motif affinity</span><output>{values.affinity.toFixed(2)}</output></label
				>
				<input
					id="wn-site-affinity"
					type="range"
					min="0.1"
					max="1"
					step="0.05"
					value={values.affinity}
					oninput={(event) => patch({ affinity: valueFrom(event) })}
				/>
				<small>This changes one affinity parameter. A real mutation could have other effects.</small
				>
			{:else}
				<div class="contact-buttons">
					<button type="button" onclick={() => contactStep(-0.1)}>Lower contact propensity</button>
					<button type="button" onclick={() => contactStep(0.1)}>Raise contact propensity</button>
				</div>
				<label for="wn-contact-bias"
					><span>Normalized geometry bias</span><output>{values.contact.toFixed(2)}</output></label
				>
				<input
					id="wn-contact-bias"
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={values.contact}
					oninput={(event) => patch({ contact: valueFrom(event) })}
				/>
				<small
					>This changes a model parameter, not a literal laboratory action or commanded distance.</small
				>
			{/if}

			<p class="consequence">{commitCopy}</p>
			{#if !canCommit}
				<p class="no-op">
					Move the control away from baseline before committing a causal comparison.
				</p>
			{/if}
			<button
				class="commit"
				type="button"
				disabled={disabled || !canCommit}
				onclick={() => oncommit?.()}>Commit this intervention</button
			>
		</div>
	{/if}
</section>

<style>
	.intervention-control {
		margin: 0;
		border-top: 1px solid rgb(158 156 199 / 28%);
		background: #090b19;
		padding: clamp(1rem, 2.5vw, 1.6rem);
		color: #e9e7f3;
	}

	h2 {
		margin: 0;
		color: #f7f3ff;
		font: 760 clamp(1.25rem, 2.4vw, 1.7rem) / 1.1 var(--font-sans, sans-serif);
	}

	p {
		max-width: 64ch;
		margin: 0.45rem 0 0;
		color: #b5b5c9;
		font: 0.82rem/1.5 var(--font-sans, sans-serif);
	}

	.target-list {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
		margin-top: 1rem;
	}

	.target-list > button {
		display: grid;
		min-height: 6.5rem;
		grid-template-columns: auto 1fr;
		gap: 0.55rem;
		align-items: start;
		border: 1px solid #3d4057;
		border-radius: 0.45rem;
		background: #0c0e1e;
		padding: 0.7rem;
		color: #e8e7f3;
		text-align: left;
		cursor: pointer;
	}

	.target-list > button:hover,
	.target-list > button.selected {
		border-color: #6ce5ff;
		background: #10162a;
	}

	.target-list .number {
		display: grid;
		width: 1.55rem;
		height: 1.55rem;
		place-items: center;
		border: 1px solid #757993;
		border-radius: 999px;
		font:
			700 0.7rem/1 ui-monospace,
			monospace;
	}

	.target-list small,
	.target-list strong,
	.target-list em {
		display: block;
	}

	.target-list small {
		color: #9296ad;
		font: 700 0.62rem/1.2 var(--font-sans, sans-serif);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.target-list strong {
		margin-top: 0.3rem;
		font: 720 0.78rem/1.25 var(--font-sans, sans-serif);
	}

	.target-list em {
		margin-top: 0.25rem;
		color: #aeb1c4;
		font: normal 0.68rem/1.3 var(--font-sans, sans-serif);
	}

	.active-control {
		max-width: 47rem;
		margin-top: 0.8rem;
		border-left: 3px solid #ed62d0;
		background: #0d0f21;
		padding: 0.9rem;
	}

	.active-control label {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: #eceaf5;
		font: 700 0.78rem/1.3 var(--font-sans, sans-serif);
	}

	.active-control output {
		color: #ffd166;
		font-family: ui-monospace, monospace;
		font-variant-numeric: tabular-nums;
	}

	.active-control input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		accent-color: #ed62d0;
	}

	.active-control > small {
		display: block;
		color: #9fa2b8;
		font: 0.7rem/1.45 var(--font-sans, sans-serif);
	}

	.contact-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.8rem;
	}

	.contact-buttons button,
	.commit {
		min-height: 2.75rem;
		border: 1px solid #62667f;
		border-radius: 0.35rem;
		background: #15182b;
		padding: 0.55rem 0.75rem;
		color: #eeedf5;
		font: 700 0.72rem/1.2 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	.consequence {
		color: #d5d4e1;
		font-weight: 650;
	}

	.no-op {
		color: #ffd9a0;
		font-weight: 650;
	}

	.commit {
		margin-top: 0.75rem;
		border-color: #ffd166;
		background: #ffd166;
		color: #17130b;
	}

	button:focus-visible,
	input:focus-visible {
		outline: 3px solid #f7fbff;
		outline-offset: 3px;
	}

	@media (max-width: 760px) {
		.target-list {
			grid-template-columns: 1fr 1fr;
		}
	}

	@media (max-width: 420px) {
		.target-list,
		.contact-buttons {
			grid-template-columns: 1fr;
		}

		.target-list > button {
			min-height: 4.5rem;
		}
	}

	@media (forced-colors: active) {
		.intervention-control,
		.target-list > button,
		.active-control {
			background: Canvas;
			color: CanvasText;
		}

		.target-list > button,
		.contact-buttons button,
		.commit {
			border: 2px solid ButtonText;
		}
	}
</style>
