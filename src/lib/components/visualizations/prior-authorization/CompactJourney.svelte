<script lang="ts">
	import AccessibleEventLedger from './AccessibleEventLedger.svelte';
	import EventInspector from './EventInspector.svelte';
	import FailurePanel from './FailurePanel.svelte';
	import PerspectiveSelector from './PerspectiveSelector.svelte';
	import StaticPoster from './StaticPoster.svelte';
	import ThreeClocks from './ThreeClocks.svelte';
	import { fixtureFragmentForStep } from './fixture-fragment';
	import type { UiFailure, UiPathwayId, UiPerspectiveId, UiRun, UiStepStatus } from './ui-types';

	type Props = {
		run: UiRun;
		portalRun: UiRun;
		fhirRun: UiRun;
		failures: UiFailure[];
		pathway: UiPathwayId;
		perspective: UiPerspectiveId;
		failureId: string;
		stepIndex: number;
		enhanced?: boolean;
		started?: boolean;
		onpathwaychange?: (pathway: UiPathwayId) => void;
		onperspectivechange?: (perspective: UiPerspectiveId) => void;
		onfailurechange?: (failureId: string) => void;
		onstepchange?: (step: number) => void;
		onprevious?: () => void;
		onnext?: () => void;
		onopenfull?: () => void;
	};

	let {
		run,
		portalRun,
		fhirRun,
		failures,
		pathway,
		perspective,
		failureId,
		stepIndex,
		enhanced = false,
		started = false,
		onpathwaychange,
		onperspectivechange,
		onfailurechange,
		onstepchange,
		onprevious,
		onnext,
		onopenfull
	}: Props = $props();

	let safeStepIndex = $derived(Math.max(0, Math.min(stepIndex, run.steps.length - 1)));
	let activeStep = $derived(run.steps[safeStepIndex] ?? run.steps[0]);
	let activeClock = $derived(activeStep?.clock ?? run.clock);
	let fixtureFragment = $derived(fixtureFragmentForStep(pathway, activeStep));
	let progressionIndices = $derived(
		run.steps.filter((step) => step.status !== 'bypassed').map((step) => step.index)
	);
	let previousProgressionIndex = $derived(
		[...progressionIndices].reverse().find((index) => index < safeStepIndex)
	);
	let nextProgressionIndex = $derived(progressionIndices.find((index) => index > safeStepIndex));

	function cardStatus(index: number, declared: UiStepStatus): UiStepStatus {
		if (index === safeStepIndex) {
			return declared === 'failed' ||
				declared === 'pended' ||
				declared === 'expired' ||
				declared === 'bypassed'
				? declared
				: 'active';
		}
		if (index > safeStepIndex) return declared === 'bypassed' ? 'bypassed' : 'upcoming';
		if (index < safeStepIndex && declared === 'upcoming') return 'completed';
		return declared;
	}

	function perspectiveText(step: UiRun['steps'][number]): string {
		if (perspective === 'clinician') return step.clinicianText;
		if (perspective === 'architect') return step.architectText;
		return step.patientText;
	}
</script>

<section
	class="compact-journey"
	data-testid="compact-journey"
	data-path={pathway}
	data-perspective={perspective}
	data-failure={failureId}
	data-step={safeStepIndex}
	data-started={started ? 'true' : 'false'}
	data-authorization-status={run.authorizationStatus}
	data-final-outcome={run.outcome}
	id="pa-text-journey"
	aria-labelledby="compact-journey-heading"
>
	<div class="compact-heading">
		<div>
			<p>Portrait and text route</p>
			<h2 id="compact-journey-heading">Follow Maya without the wide diagram</h2>
		</div>
		{#if enhanced && started && onopenfull}
			<button type="button" class="open-full" onclick={onopenfull}>Open full diagram</button>
		{/if}
	</div>

	<StaticPoster {pathway} portalClock={portalRun.clock} fhirClock={fhirRun.clock} />
	{#if enhanced && !started}
		<p class="locked-note" role="status">
			The text journey is ready but inert. Choose a pathway above, then select “Begin the journey”.
		</p>
	{/if}

	<div class="compact-controls">
		<div class="path-tabs" role="group" aria-label="Pathway">
			<button
				type="button"
				aria-pressed={pathway === 'portal-fax'}
				disabled={!enhanced || !started}
				onclick={() => onpathwaychange?.('portal-fax')}>Portal and fax</button
			>
			<button
				type="button"
				aria-pressed={pathway === 'fhir-enabled'}
				disabled={!enhanced || !started}
				onclick={() => onpathwaychange?.('fhir-enabled')}>FHIR-enabled</button
			>
		</div>
		<PerspectiveSelector
			value={perspective}
			name="pa-perspective-compact"
			disabled={!enhanced || !started}
			onchange={onperspectivechange}
		/>
	</div>

	<ThreeClocks clock={activeClock} compact />

	<nav class="previous-next" aria-label="Compact journey milestones">
		<button
			type="button"
			disabled={!enhanced || !started || previousProgressionIndex === undefined}
			onclick={() =>
				onprevious
					? onprevious()
					: previousProgressionIndex !== undefined && onstepchange?.(previousProgressionIndex)}
			>Previous</button
		>
		<span
			><strong>{safeStepIndex + 1} / {run.steps.length}</strong><small>{activeStep?.label}</small
			></span
		>
		<button
			type="button"
			disabled={!enhanced || !started || nextProgressionIndex === undefined}
			onclick={() =>
				onnext
					? onnext()
					: nextProgressionIndex !== undefined && onstepchange?.(nextProgressionIndex)}>Next</button
		>
	</nav>

	<ol class="milestones">
		{#each run.steps as step, index (step.id)}
			{@const status = cardStatus(index, step.status)}
			<li
				class={`status-${status}`}
				class:current={index === safeStepIndex}
				data-milestone-id={step.id}
				data-step-index={index}
			>
				<button
					type="button"
					disabled={!enhanced || !started}
					aria-current={index === safeStepIndex ? 'step' : undefined}
					onclick={() => onstepchange?.(index)}
				>
					<span class="number">{String(index + 1).padStart(2, '0')}</span>
					<span class="card-copy">
						<small>{step.actor} · {status}</small>
						<strong>{step.label}</strong>
						{#if index === safeStepIndex}<span>{perspectiveText(step)}</span>{/if}
					</span>
					<span class="shape" aria-hidden="true"></span>
				</button>
			</li>
		{/each}
	</ol>

	{#if activeStep}
		<EventInspector
			step={activeStep}
			{perspective}
			identifiers={run.identifiers}
			{fixtureFragment}
			downloadHref={fixtureFragment
				? '/data/prior-authorization/maya-lumbar-mri-fhir-r4.json'
				: undefined}
		/>
	{/if}

	<FailurePanel
		{failures}
		value={failureId}
		disabled={!enhanced || !started}
		onchange={onfailurechange}
	/>

	<AccessibleEventLedger
		rows={run.ledger}
		{perspective}
		pathwayLabel={run.pathwayLabel}
		activeStep={safeStepIndex}
		open={!enhanced}
	/>
</section>

<style>
	.compact-journey {
		display: grid;
		gap: 1rem;
		width: 100%;
		max-width: 48rem;
		margin-inline: auto;
		box-sizing: border-box;
		color: var(--ink);
	}

	.compact-journey > * {
		min-width: 0;
	}

	.compact-heading,
	.compact-controls,
	.previous-next {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
	}

	.compact-heading p,
	.compact-heading h2,
	.locked-note {
		margin: 0;
	}

	.compact-heading p {
		font: 760 0.61rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.compact-heading h2 {
		margin-top: 0.2rem;
		font: 770 clamp(1.35rem, 5vw, 2rem) / 1.05 var(--font-sans, sans-serif);
		letter-spacing: -0.025em;
	}

	.locked-note {
		border-left: 4px solid var(--accent);
		background: var(--paper-raised);
		padding: 0.6rem 0.7rem;
		font: 0.7rem/1.4 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.open-full,
	.path-tabs button,
	.previous-next button {
		min-height: 2.75rem;
		border: 1px solid var(--rule);
		border-radius: 0.5rem;
		background: var(--paper-raised);
		padding: 0.55rem 0.7rem;
		font: 740 0.72rem/1 var(--font-sans, sans-serif);
		color: var(--ink);
		cursor: pointer;
	}

	.open-full {
		border-color: var(--accent);
		color: var(--accent);
	}

	.path-tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		min-width: min(100%, 21rem);
		border: 1px solid var(--rule);
		border-radius: 999px;
		padding: 0.18rem;
	}

	.path-tabs button {
		border: 0;
		border-radius: 999px;
		background: transparent;
	}

	.path-tabs button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-foreground);
	}

	.previous-next {
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: 0.45rem;
	}

	.previous-next span {
		display: grid;
		justify-items: center;
		gap: 0.08rem;
		min-width: 0;
		text-align: center;
	}

	.previous-next strong {
		font: 780 0.7rem/1.2 var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.previous-next small {
		overflow: hidden;
		font: 0.66rem/1.25 var(--font-sans, sans-serif);
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink-muted);
	}

	.previous-next button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.milestones {
		position: relative;
		display: grid;
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.milestones::before {
		position: absolute;
		top: 1rem;
		bottom: 1rem;
		left: 1.72rem;
		width: 1px;
		background: var(--rule);
		content: '';
	}

	.milestones li {
		position: relative;
		z-index: 1;
	}

	.milestones button {
		display: grid;
		grid-template-columns: 2.2rem minmax(0, 1fr) auto;
		width: 100%;
		min-height: 4.2rem;
		align-items: center;
		gap: 0.65rem;
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: 0.6rem 0.7rem;
		text-align: left;
		color: var(--ink);
		cursor: pointer;
	}

	.milestones li.current button {
		border-color: var(--accent);
		box-shadow: inset 4px 0 0 var(--accent);
	}

	.number {
		display: grid;
		width: 2rem;
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid currentColor;
		border-radius: 50%;
		background: var(--paper);
		font: 780 0.66rem/1 var(--font-mono, ui-monospace, monospace);
	}

	.card-copy {
		display: grid;
		gap: 0.12rem;
	}

	.card-copy small {
		font: 720 0.56rem/1.25 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.045em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.card-copy strong {
		font: 750 0.82rem/1.25 var(--font-sans, sans-serif);
	}

	.card-copy > span {
		margin-top: 0.18rem;
		font: 0.71rem/1.45 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.shape {
		display: block;
		width: 0.8rem;
		aspect-ratio: 1;
		border: 2px solid var(--ink-muted);
		border-radius: 50%;
	}

	.status-completed .shape {
		border-radius: 0;
		background: var(--ink-muted);
	}

	.status-active .shape {
		border-color: var(--accent);
		border-width: 4px;
	}

	.status-bypassed .shape {
		border-style: dashed;
	}

	.status-pended .shape {
		border-color: #8a672c;
		border-style: dashed;
		border-radius: 0;
	}

	.status-failed .shape,
	.status-expired .shape {
		transform: rotate(45deg);
		border-color: #9f4a43;
		border-radius: 0;
	}

	button:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	@media (max-width: 42rem) {
		.compact-controls {
			display: grid;
		}

		.path-tabs,
		.compact-controls :global(.perspective-selector) {
			width: 100%;
		}
	}

	@media (max-width: 30rem) {
		.compact-heading {
			align-items: start;
			flex-direction: column;
		}

		.open-full {
			width: 100%;
		}
	}

	@media (forced-colors: active) {
		.open-full,
		.path-tabs,
		.path-tabs button,
		.previous-next,
		.previous-next button,
		.milestones button,
		.number,
		.shape {
			border-color: CanvasText;
		}

		.path-tabs button[aria-pressed='true'],
		.milestones li.current button {
			outline: 3px solid Highlight;
			outline-offset: -3px;
		}
	}
</style>
