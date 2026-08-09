<script lang="ts">
	import { formatDayMinute, formatHumanWork, formatMachineTime, sentenceCase } from './format';
	import type { UiJourneyStep, UiPerspectiveId } from './ui-types';

	type Props = {
		step: UiJourneyStep;
		perspective: UiPerspectiveId;
		identifiers?: {
			patient: string;
			coverage: string;
			coveragePatientReference: string;
			serviceRequest: string;
		};
		fixtureFragment?: string;
		downloadHref?: string;
	};

	let { step, perspective, identifiers, fixtureFragment, downloadHref }: Props = $props();
	let text = $derived(
		perspective === 'patient'
			? step.patientText
			: perspective === 'clinician'
				? step.clinicianText
				: step.architectText
	);

	function uncertainty(): string {
		switch (step.authorizationStatus) {
			case 'approved':
				return 'Approval exists now; scheduling and the authorization-validity window still matter.';
			case 'denied':
				return 'The fictional policy decision is a denial; a new next action is required.';
			case 'expired':
				return 'The approval is no longer valid for the delayed appointment.';
			case 'pending':
			case 'requested':
				return 'The payer’s business decision remains unresolved.';
			default:
				return 'No authorization decision exists yet.';
		}
	}

	function appointmentValidity(): string {
		if (step.finalOutcome === 'scan-completed')
			return 'Yes. The authorization is valid when the modeled scan occurs.';
		if (step.finalOutcome === 'expired' || step.authorizationStatus === 'expired') {
			return 'No. The authorization expires before the modeled appointment.';
		}
		if (step.authorizationStatus === 'approved') {
			return 'Approved now; appointment-date validity is confirmed only after scheduling.';
		}
		return 'Not yet applicable because there is no active approval.';
	}
</script>

<aside
	class="inspector"
	aria-labelledby="event-inspector-heading"
	data-perspective={perspective}
	data-authorization-status={step.authorizationStatus ?? 'not-requested'}
	data-final-outcome={step.finalOutcome ?? 'not-reached'}
	data-event-human-seconds={step.staffEffortSeconds}
	data-event-machine-ms={step.machineProcessingMs}
>
	<div class="inspector-heading">
		<div>
			<p>{perspective} lens · milestone {step.index + 1}</p>
			<h2 id="event-inspector-heading">{step.label}</h2>
		</div>
		<span class={`state state-${step.status}`}>{step.status}</span>
	</div>

	<p class="narrative">{text}</p>
	{#if perspective !== 'patient'}
		<div
			class="lifecycle-status"
			aria-label="Technical, business, authorization and outcome status"
		>
			<span
				><small>Technical</small><strong
					>{sentenceCase(step.technicalStatus ?? 'not-applicable')}</strong
				></span
			>
			<span
				><small>Business</small><strong
					>{sentenceCase(step.businessStatus ?? 'not-applicable')}</strong
				></span
			>
			<span
				><small>Authorization</small><strong
					>{sentenceCase(step.authorizationStatus ?? 'not-requested')}</strong
				></span
			>
			<span
				><small>Final outcome</small><strong
					>{step.finalOutcome ? sentenceCase(step.finalOutcome) : 'Not reached'}</strong
				></span
			>
		</div>
	{/if}

	{#if perspective === 'patient'}
		<dl class="patient-details">
			<div>
				<dt>Current status</dt>
				<dd>{sentenceCase(step.authorizationStatus ?? step.status)}</dd>
			</div>
			<div>
				<dt>Wait so far</dt>
				<dd>{formatDayMinute(step.clock.patientElapsedMinutes)}</dd>
			</div>
			<div>
				<dt>What uncertainty remains</dt>
				<dd>{uncertainty()}</dd>
			</div>
			<div>
				<dt>What happens next</dt>
				<dd>
					{step.index >= 11
						? 'The modeled journey has reached its outcome.'
						: 'The request moves to the next declared milestone.'}
				</dd>
			</div>
			<div>
				<dt>Approval valid at appointment?</dt>
				<dd>{appointmentValidity()}</dd>
			</div>
		</dl>
	{:else if perspective === 'clinician'}
		<dl class="clinician-details">
			<div>
				<dt>Actor</dt>
				<dd>{step.actor}</dd>
			</div>
			<div>
				<dt>Channel</dt>
				<dd>{step.channel ?? 'Internal workflow'}</dd>
			</div>
			<div>
				<dt>Hands-on work so far</dt>
				<dd>{formatHumanWork(step.clock.humanWorkSeconds)}</dd>
			</div>
			<div>
				<dt>Evidence references</dt>
				<dd>{step.evidenceRefs.join(', ') || 'No new evidence at this milestone'}</dd>
			</div>
		</dl>
	{:else}
		<div class="architect-details">
			<div class="status-grid">
				<span><small>Actor / endpoint</small><strong>{step.actor}</strong></span>
				<span><small>Channel</small><strong>{step.channel ?? 'internal'}</strong></span>
			</div>
			{#if identifiers}
				<dl class="identifier-continuity">
					<div>
						<dt>Patient identifier</dt>
						<dd>{identifiers.patient}</dd>
					</div>
					<div>
						<dt>Coverage assertion</dt>
						<dd>{identifiers.coverage}</dd>
					</div>
					<div>
						<dt>Coverage → patient continuity</dt>
						<dd>{identifiers.coveragePatientReference}</dd>
					</div>
					<div>
						<dt>Service request</dt>
						<dd>{identifiers.serviceRequest}</dd>
					</div>
				</dl>
			{/if}
			<div class="chips" aria-label="Healthcare resources and standards">
				{#each step.resourceRefs as resource}<span>{resource}</span>{/each}
				{#each step.standardRefs as standard}<span class="standard">{standard}</span>{/each}
			</div>
			<div class="chips evidence" aria-label="Evidence references">
				{#each step.evidenceRefs as evidence}<span>{evidence}</span>{/each}
				{#if !step.evidenceRefs.length}<span>No new evidence reference</span>{/if}
			</div>
			<p class="duration">
				Declared event duration: <strong>{formatMachineTime(step.machineProcessingMs)}</strong>
				automated processing and <strong>{formatHumanWork(step.staffEffortSeconds)}</strong> human work.
				Cumulative totals remain in the three clocks.
			</p>
			{#if fixtureFragment}
				<details class="fixture">
					<summary>View canonical synthetic fixture fragment</summary>
					<pre><code>{fixtureFragment}</code></pre>
					{#if downloadHref}<a href={downloadHref} download>Download full synthetic fixture</a>{/if}
				</details>
			{/if}
			<details class="x12-branch">
				<summary>Optional FHIR-only ↔ FHIR + X12 bridge</summary>
				<p>
					Under the CMS-0057-F enforcement-discretion pathway, an all-FHIR exchange may omit X12
					278. An intermediary bridge remains a possible architecture, not a mandatory tunnel.
				</p>
			</details>
		</div>
	{/if}
</aside>

<style>
	.inspector {
		display: grid;
		align-content: start;
		gap: 0.75rem;
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-raised);
		padding: 0.85rem;
		color: var(--ink);
	}

	.inspector-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.7rem;
	}

	.inspector-heading p,
	.inspector-heading h2,
	.narrative,
	.duration,
	.x12-branch p,
	dl,
	dt,
	dd {
		margin: 0;
	}

	.inspector-heading p {
		font: 750 0.58rem/1.25 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.inspector-heading h2 {
		margin-top: 0.2rem;
		font: 770 1.05rem/1.15 var(--font-sans, sans-serif);
	}

	.state {
		flex: none;
		border: 1px solid currentColor;
		border-radius: 999px;
		padding: 0.35rem 0.48rem;
		font: 800 0.56rem/1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.state-active {
		border-style: double;
		color: var(--accent);
	}

	.state-failed,
	.state-expired {
		border-radius: 0.2rem;
		color: var(--accent);
	}

	.state-pended {
		border-style: dashed;
		color: var(--accent);
	}

	.narrative {
		border-left: 3px solid var(--accent);
		padding-left: 0.65rem;
		font: 680 0.86rem/1.5 var(--font-serif, serif);
	}

	.patient-details,
	.clinician-details,
	.status-grid,
	.lifecycle-status,
	.identifier-continuity {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.patient-details > div,
	.clinician-details > div,
	.status-grid span,
	.lifecycle-status span,
	.identifier-continuity > div {
		display: grid;
		gap: 0.12rem;
		border-top: 1px solid var(--rule);
		padding-top: 0.45rem;
	}

	dt,
	.status-grid small,
	.lifecycle-status small {
		font: 730 0.57rem/1.25 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	dd,
	.status-grid strong,
	.lifecycle-status strong,
	.duration,
	.x12-branch p {
		font: 0.7rem/1.45 var(--font-sans, sans-serif);
	}

	.architect-details {
		display: grid;
		gap: 0.65rem;
	}

	.lifecycle-status {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.identifier-continuity {
		grid-template-columns: 1fr;
	}

	.identifier-continuity dd {
		overflow-wrap: anywhere;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.62rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.chips span {
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: var(--paper);
		padding: 0.28rem 0.42rem;
		font: 730 0.57rem/1 var(--font-mono, ui-monospace, monospace);
	}

	.chips span.standard {
		border-style: dashed;
		color: var(--accent);
	}

	.chips.evidence span {
		border-style: dotted;
	}

	.fixture,
	.x12-branch {
		border: 1px solid var(--rule);
		border-radius: 0.5rem;
		background: var(--paper);
	}

	.fixture summary,
	.x12-branch summary {
		min-height: 2.75rem;
		padding: 0.65rem;
		font: 730 0.67rem/1.35 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	summary:focus-visible,
	a:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	pre {
		max-height: 18rem;
		margin: 0;
		overflow: auto;
		border-top: 1px solid var(--rule);
		background: color-mix(in oklab, var(--ink) 94%, var(--paper));
		padding: 0.7rem;
		color: var(--paper);
		font: 0.63rem/1.5 var(--font-mono, ui-monospace, monospace);
		tab-size: 2;
	}

	.fixture a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		margin: 0.55rem;
		font: 730 0.65rem/1 var(--font-sans, sans-serif);
		color: var(--accent);
	}

	.x12-branch p {
		border-top: 1px solid var(--rule);
		padding: 0.65rem;
		color: var(--ink-muted);
	}

	@media (max-width: 30rem) {
		.patient-details,
		.clinician-details,
		.status-grid,
		.lifecycle-status {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.inspector,
		.state,
		.patient-details > div,
		.clinician-details > div,
		.status-grid span,
		.lifecycle-status span,
		.identifier-continuity > div,
		.chips span,
		.fixture,
		.x12-branch,
		pre {
			border-color: CanvasText;
		}
	}
</style>
