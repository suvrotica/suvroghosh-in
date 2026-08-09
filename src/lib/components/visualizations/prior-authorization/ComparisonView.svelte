<script lang="ts">
	import ThreeClocks from './ThreeClocks.svelte';
	import { formatHumanWork, formatMachineTime, formatPatientElapsed } from './format';
	import type { UiPerspectiveId, UiRun, UiStepStatus } from './ui-types';

	type Props = {
		portalRun: UiRun;
		fhirRun: UiRun;
		activeStep: number;
		perspective: UiPerspectiveId;
		onstepchange?: (step: number) => void;
	};

	let { portalRun, fhirRun, activeStep, perspective, onstepchange }: Props = $props();
	let patientDelta = $derived(
		portalRun.clock.patientElapsedMinutes - fhirRun.clock.patientElapsedMinutes
	);
	let humanDelta = $derived(portalRun.clock.humanWorkSeconds - fhirRun.clock.humanWorkSeconds);
	let machineDelta = $derived(
		fhirRun.clock.automatedProcessingMs - portalRun.clock.automatedProcessingMs
	);
	let roleRows = $derived([
		{
			label: 'Provider-side workflow',
			portal: portalRun.clock.providerWorkSeconds ?? 0,
			fhir: fhirRun.clock.providerWorkSeconds ?? 0
		},
		{
			label: 'Payer work',
			portal: portalRun.clock.payerWorkSeconds ?? 0,
			fhir: fhirRun.clock.payerWorkSeconds ?? 0
		},
		{
			label: 'Scheduling work',
			portal: portalRun.clock.schedulingWorkSeconds ?? 0,
			fhir: fhirRun.clock.schedulingWorkSeconds ?? 0
		}
	]);

	function soonerSentence(deltaMinutes: number): string {
		if (deltaMinutes === 0) return 'Both pathways have the same modeled wall time.';
		const faster = deltaMinutes > 0 ? 'FHIR-enabled' : 'Portal and fax';
		return `${faster} finishes ${formatPatientElapsed(Math.abs(deltaMinutes))} sooner.`;
	}

	function humanSentence(deltaSeconds: number): string {
		if (deltaSeconds === 0) return 'Both pathways declare the same active human work.';
		const lower = deltaSeconds > 0 ? 'FHIR-enabled' : 'Portal and fax';
		return `${lower} uses ${formatHumanWork(Math.abs(deltaSeconds))} less active human work.`;
	}

	function machineSentence(deltaMs: number): string {
		if (deltaMs === 0) return 'Both pathways declare the same automated processing.';
		const higher = deltaMs > 0 ? 'FHIR-enabled' : 'Portal and fax';
		return `${higher} declares ${formatMachineTime(Math.abs(deltaMs))} more automated processing.`;
	}

	function textFor(run: UiRun, index: number): string {
		const step = run.steps[index];
		if (!step) return '';
		if (perspective === 'clinician') return step.clinicianText;
		if (perspective === 'architect') return step.architectText;
		return step.patientText;
	}

	function displayStatus(status: UiStepStatus, index: number): UiStepStatus {
		if (index === activeStep && !['failed', 'pended', 'expired', 'bypassed'].includes(status))
			return 'active';
		if (index > activeStep) return status === 'bypassed' ? 'bypassed' : 'upcoming';
		return status;
	}
</script>

<section class="comparison" aria-labelledby="comparison-heading" data-testid="pathway-comparison">
	<div class="comparison-heading">
		<div>
			<p>Controlled counterfactual</p>
			<h2 id="comparison-heading">Same patient. Same policy. Different plumbing.</h2>
		</div>
		<span>Aligned by conceptual milestone—not by percentage or normalized time</span>
	</div>

	<section class="delta-summary" aria-labelledby="comparison-deltas-heading">
		<h3 id="comparison-deltas-heading">What changes in this controlled comparison</h3>
		<ul>
			<li data-patient-delta-minutes={patientDelta}>{soonerSentence(patientDelta)}</li>
			<li data-human-delta-seconds={humanDelta}>{humanSentence(humanDelta)}</li>
			<li data-machine-delta-ms={machineDelta}>{machineSentence(machineDelta)}</li>
		</ul>
	</section>

	<div class="clock-comparison">
		<div>
			<h3>Portal and fax</h3>
			<ThreeClocks clock={portalRun.clock} compact />
		</div>
		<div>
			<h3>FHIR-enabled</h3>
			<ThreeClocks clock={fhirRun.clock} compact />
		</div>
	</div>

	<section class="role-breakdown" aria-labelledby="role-breakdown-heading">
		<div>
			<h3 id="role-breakdown-heading">Active human work by role</h3>
			<p>These role totals are ledger projections; they are not added to patient wall time.</p>
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (A labelled native scroll region must be keyboard-focusable.) -->
		<div
			class="role-table-scroll"
			role="region"
			aria-label="Human work by role and pathway"
			tabindex="0"
		>
			<table class="role-table">
				<thead>
					<tr>
						<th scope="col">Role</th>
						<th scope="col">Portal / fax</th>
						<th scope="col">FHIR-enabled</th>
						<th scope="col">Difference</th>
					</tr>
				</thead>
				<tbody>
					{#each roleRows as role}
						{@const difference = role.portal - role.fhir}
						<tr>
							<th scope="row">{role.label}</th>
							<td>{formatHumanWork(role.portal)}</td>
							<td>{formatHumanWork(role.fhir)}</td>
							<td>
								{difference === 0
									? 'same'
									: `${formatHumanWork(Math.abs(difference))} ${difference > 0 ? 'less on FHIR' : 'more on FHIR'}`}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<div class="aligned-paths">
		<div class="path-labels" aria-hidden="true">
			<span>Portal / fax</span>
			<span>FHIR-enabled</span>
		</div>
		<ol>
			{#each portalRun.steps as portalStep, index (portalStep.id)}
				{@const fhirStep = fhirRun.steps[index]}
				{@const portalStatus = displayStatus(portalStep.status, index)}
				{@const fhirStatus = displayStatus(fhirStep?.status ?? 'upcoming', index)}
				<li class:current={index === activeStep} data-compare-milestone={portalStep.id}>
					<button
						type="button"
						aria-current={index === activeStep ? 'step' : undefined}
						onclick={() => onstepchange?.(index)}
					>
						<span class="step-label"
							><small>{String(index + 1).padStart(2, '0')}</small><strong>{portalStep.label}</strong
							></span
						>
						<span class={`route route-${portalStatus}`}>
							<i aria-hidden="true"></i>
							<span><strong>{portalStatus}</strong><small>{textFor(portalRun, index)}</small></span>
						</span>
						<span class={`route route-${fhirStatus}`}>
							<i aria-hidden="true"></i>
							<span><strong>{fhirStatus}</strong><small>{textFor(fhirRun, index)}</small></span>
						</span>
					</button>
				</li>
			{/each}
		</ol>
	</div>

	<p class="conclusion">
		The electronic route moved information with less re-keying. It did not change the evidence
		requirement, the reviewer’s judgment, or the imaging calendar.
	</p>
</section>

<style>
	.comparison {
		display: grid;
		gap: 0.75rem;
		color: var(--ink);
	}

	.comparison-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.comparison-heading p,
	.comparison-heading h2,
	.comparison-heading > span,
	.clock-comparison h3,
	.delta-summary h3,
	.delta-summary ul,
	.role-breakdown h3,
	.role-breakdown p,
	.conclusion {
		margin: 0;
	}

	.comparison-heading p {
		font: 750 0.6rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.comparison-heading h2 {
		margin-top: 0.2rem;
		font: 780 clamp(1.3rem, 3vw, 2.1rem) / 1.05 var(--font-sans, sans-serif);
		letter-spacing: -0.025em;
	}

	.comparison-heading > span {
		max-width: 25rem;
		font: 0.67rem/1.4 var(--font-sans, sans-serif);
		text-align: right;
		color: var(--ink-muted);
	}

	.delta-summary,
	.role-breakdown {
		border: 1px solid var(--rule);
		border-radius: 0.65rem;
		background: var(--paper-raised);
		padding: 0.7rem;
	}

	.delta-summary h3,
	.role-breakdown h3 {
		font: 760 0.75rem/1.25 var(--font-sans, sans-serif);
	}

	.delta-summary ul {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.45rem;
		padding: 0;
		list-style: none;
	}

	.delta-summary li {
		border-left: 3px solid var(--accent);
		padding: 0.4rem 0.5rem;
		font: 680 0.72rem/1.4 var(--font-sans, sans-serif);
	}

	.clock-comparison {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.clock-comparison > div {
		display: grid;
		gap: 0.35rem;
	}

	.clock-comparison h3 {
		font: 750 0.66rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.role-breakdown {
		display: grid;
		gap: 0.55rem;
	}

	.role-breakdown p {
		margin-top: 0.15rem;
		font: 0.65rem/1.4 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.role-table {
		width: 100%;
		border: 1px solid var(--rule);
		border-collapse: separate;
		border-spacing: 0;
		border-radius: 0.45rem;
		overflow: hidden;
		table-layout: fixed;
	}

	.role-table-scroll {
		overflow-x: auto;
		overscroll-behavior-inline: contain;
	}

	.role-table-scroll:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.role-table th:first-child {
		width: 31%;
	}

	.role-table tbody tr + tr > * {
		border-top: 1px solid var(--rule);
	}

	.role-table th,
	.role-table td {
		min-width: 0;
		padding: 0.45rem 0.5rem;
		font: 0.65rem/1.3 var(--font-sans, sans-serif);
		text-align: left;
		vertical-align: top;
		overflow-wrap: anywhere;
	}

	.role-table th + th,
	.role-table th + td,
	.role-table td + td {
		border-left: 1px solid var(--rule);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.role-table thead {
		background: var(--paper);
		color: var(--ink-muted);
	}

	.role-table thead th {
		font-size: 0.57rem;
		font-weight: 760;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.aligned-paths {
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		overflow: clip;
		background: var(--paper-raised);
	}

	.path-labels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		margin-left: min(18rem, 29%);
		border-bottom: 1px solid var(--rule);
		background: var(--paper);
	}

	.path-labels span {
		padding: 0.5rem;
		font: 760 0.58rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.06em;
		text-align: center;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.path-labels span + span {
		border-left: 1px solid var(--rule);
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.aligned-paths li + li {
		border-top: 1px solid var(--rule);
	}

	.aligned-paths li.current {
		box-shadow: inset 4px 0 0 var(--accent);
	}

	.aligned-paths li button {
		display: grid;
		grid-template-columns: minmax(10rem, 0.82fr) repeat(2, minmax(0, 1fr));
		width: 100%;
		min-height: 4.3rem;
		align-items: stretch;
		border: 0;
		background: transparent;
		padding: 0;
		text-align: left;
		color: var(--ink);
		cursor: pointer;
	}

	.aligned-paths li button:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: -3px;
	}

	.step-label,
	.route {
		display: grid;
		align-content: center;
		padding: 0.5rem 0.65rem;
	}

	.step-label {
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
	}

	.step-label small {
		font: 760 0.6rem/1 var(--font-mono, ui-monospace, monospace);
		color: var(--ink-muted);
	}

	.step-label strong {
		font: 740 0.72rem/1.25 var(--font-sans, sans-serif);
	}

	.route {
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.4rem;
		border-left: 1px solid var(--rule);
	}

	.route > i {
		display: block;
		width: 0.65rem;
		height: 0.65rem;
		align-self: center;
		border: 2px solid var(--ink-muted);
		border-radius: 50%;
	}

	.route > span {
		display: grid;
		gap: 0.1rem;
	}

	.route strong {
		font: 760 0.55rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.route small {
		display: -webkit-box;
		overflow: hidden;
		font: 0.62rem/1.3 var(--font-sans, sans-serif);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		color: var(--ink-muted);
	}

	.route-active > i {
		border-color: var(--accent);
		border-width: 4px;
	}

	.route-completed > i {
		border-radius: 0;
		background: var(--ink-muted);
	}

	.route-pended > i {
		border-color: #8a672c;
		border-style: dashed;
		border-radius: 0;
	}

	.route-bypassed {
		opacity: 0.58;
	}

	.route-bypassed > i {
		border-style: dashed;
	}

	.route-failed > i,
	.route-expired > i {
		transform: rotate(45deg);
		border-color: #9f4a43;
		border-radius: 0;
	}

	.conclusion {
		border-left: 4px solid var(--accent);
		background: var(--paper-raised);
		padding: 0.75rem;
		font: 680 0.82rem/1.45 var(--font-serif, serif);
	}

	@media (max-width: 56rem) {
		.comparison-heading {
			display: grid;
		}

		.comparison-heading > span {
			text-align: left;
		}

		.clock-comparison {
			grid-template-columns: 1fr;
		}

		.delta-summary ul {
			grid-template-columns: 1fr;
		}

		.role-table {
			min-width: 38rem;
		}
	}

	@media (forced-colors: active) {
		.aligned-paths,
		.delta-summary,
		.role-breakdown,
		.role-table,
		.role-table th,
		.role-table td,
		.path-labels,
		.path-labels span,
		.aligned-paths li,
		.route,
		.route > i {
			border-color: CanvasText;
		}

		.aligned-paths li.current {
			outline: 3px solid Highlight;
			outline-offset: -3px;
		}
	}
</style>
