<script lang="ts">
	import { formatHumanWork, formatMachineTime, formatPatientElapsed } from './format';
	import type { UiClockSnapshot, UiPathwayId } from './ui-types';

	type Props = {
		pathway?: UiPathwayId;
		portalClock: UiClockSnapshot;
		fhirClock: UiClockSnapshot;
	};

	let { pathway = 'portal-fax', portalClock, fhirClock }: Props = $props();
	let selectedClock = $derived(pathway === 'portal-fax' ? portalClock : fhirClock);
</script>

<figure class="poster" data-testid="prior-authorization-poster" aria-labelledby="pa-poster-caption">
	<div class="poster-title">
		<p>One synthetic MRI request</p>
		<h2>The transaction and the wait</h2>
	</div>
	<div class="panels" aria-hidden="true">
		<div class="panel panel-order">
			<span>01</span>
			<div class="maya-mark">MS</div>
			<strong>MRI ordered</strong>
			<small>Three clocks start</small>
		</div>
		<div class="panel panel-route">
			<span>02</span>
			<div class="route-lines"><i></i><i></i><i></i></div>
			<strong>Requirements and evidence</strong>
			<small>Same patient · same fictional policy</small>
		</div>
		<div class="panel panel-response">
			<span>03</span>
			<div class="response-stamp">2xx ≠ approved</div>
			<strong>The API answered</strong>
			<small>The business decision may still be pended</small>
		</div>
		<div class="panel panel-scan">
			<span>04</span>
			<div class="scan-shape"><i></i></div>
			<strong>Approved is not performed</strong>
			<small>Scheduling remains part of Maya’s wall time</small>
		</div>
	</div>
	<div class="poster-totals">
		<div>
			<span>Portal and fax</span>
			<strong>{formatPatientElapsed(portalClock.patientElapsedMinutes)}</strong>
			<small
				>{formatHumanWork(portalClock.humanWorkSeconds)} human · {formatMachineTime(
					portalClock.automatedProcessingMs
				)} automated</small
			>
		</div>
		<div class="fhir-total">
			<span>FHIR-enabled</span>
			<strong>{formatPatientElapsed(fhirClock.patientElapsedMinutes)}</strong>
			<small
				>{formatHumanWork(fhirClock.humanWorkSeconds)} human · {formatMachineTime(
					fhirClock.automatedProcessingMs
				)} automated</small
			>
		</div>
	</div>
	<p class="selected-summary">
		Selected route: <strong>{pathway === 'portal-fax' ? 'Portal and fax' : 'FHIR-enabled'}</strong>
		· total modeled patient elapsed:
		<strong>{formatPatientElapsed(selectedClock.patientElapsedMinutes)}</strong>.
	</p>
	<figcaption id="pa-poster-caption">
		Maya Sen is fictional. This four-panel summary follows one synthetic lumbar MRI order through
		requirements, evidence, authorization and scheduling. In the authored FHIR-enabled fixture, one
		declared transaction takes exactly 400 ms and the journey takes exactly 11 modeled days; these
		are scenario facts, not measured averages.
	</figcaption>
</figure>

<style>
	.poster {
		margin: 0;
		border: 1px solid var(--rule);
		border-radius: 0.9rem;
		overflow: clip;
		background: var(--paper-raised);
		box-shadow: var(--shadow-overlay);
		color: var(--ink);
	}

	.poster-title {
		border-bottom: 1px solid var(--rule);
		padding: 1rem;
	}

	.poster-title p,
	.poster-title h2,
	figcaption,
	.selected-summary {
		margin: 0;
	}

	.poster-title p,
	.poster-totals span,
	.panel > span {
		font: 760 0.63rem/1.25 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.poster-title h2 {
		margin-top: 0.25rem;
		font: 780 clamp(1.7rem, 5vw, 3.6rem) / 0.95 var(--font-sans, sans-serif);
		letter-spacing: -0.045em;
	}

	.panels {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		background: var(--rule);
		gap: 1px;
	}

	.panel {
		display: grid;
		min-height: clamp(10rem, 26vw, 17rem);
		align-content: space-between;
		gap: 0.6rem;
		background: var(--paper);
		padding: clamp(0.75rem, 3vw, 1.4rem);
	}

	.panel strong {
		align-self: end;
		font: 760 clamp(1rem, 2.5vw, 1.5rem) / 1.08 var(--font-sans, sans-serif);
		letter-spacing: -0.02em;
	}

	.panel small {
		font: 0.7rem/1.4 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.maya-mark {
		display: grid;
		width: 3.2rem;
		aspect-ratio: 1;
		place-items: center;
		justify-self: center;
		border: 2px solid var(--ink);
		border-radius: 50%;
		font: 800 0.75rem/1 var(--font-mono, ui-monospace, monospace);
		box-shadow: 0.3rem 0.3rem 0 color-mix(in oklab, var(--accent) 38%, transparent);
	}

	.route-lines {
		display: grid;
		gap: 0.7rem;
		width: 78%;
		justify-self: center;
	}

	.route-lines i {
		display: block;
		height: 0.65rem;
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: repeating-linear-gradient(90deg, var(--accent) 0 22%, transparent 22% 29%);
	}

	.route-lines i:nth-child(2) {
		margin-inline: 12%;
		background: repeating-linear-gradient(90deg, var(--ink-muted) 0 12%, transparent 12% 20%);
	}

	.response-stamp {
		justify-self: center;
		transform: rotate(-3deg);
		border: 3px double var(--ink);
		padding: 0.65rem;
		font: 820 clamp(0.8rem, 2.5vw, 1.15rem) / 1 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.scan-shape {
		display: grid;
		width: 5rem;
		aspect-ratio: 1.6;
		place-items: center;
		justify-self: center;
		border: 0.55rem solid var(--ink-muted);
		border-radius: 50%;
	}

	.scan-shape i {
		display: block;
		width: 45%;
		height: 130%;
		border-radius: 999px;
		background: color-mix(in oklab, var(--accent) 28%, var(--paper));
	}

	.poster-totals {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
	}

	.poster-totals > div {
		display: grid;
		gap: 0.25rem;
		padding: 0.9rem 1rem;
	}

	.poster-totals > div + div {
		border-left: 1px solid var(--rule);
	}

	.poster-totals strong {
		font: 790 clamp(1rem, 3vw, 1.55rem) / 1.1 var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.poster-totals small {
		font: 0.67rem/1.35 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.fhir-total {
		box-shadow: inset 0 3px 0 var(--accent);
	}

	figcaption,
	.selected-summary {
		padding: 0.8rem 1rem;
		font: 0.72rem/1.5 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.selected-summary {
		border-top: 1px dashed var(--rule);
		color: var(--ink);
	}

	@media (max-width: 36rem) {
		.panel {
			min-height: 9.5rem;
		}

		.poster-totals {
			grid-template-columns: 1fr;
		}

		.poster-totals > div + div {
			border-top: 1px solid var(--rule);
			border-left: 0;
		}
	}

	@media (forced-colors: active) {
		.poster,
		.poster-title,
		.poster-totals,
		.poster-totals > div,
		figcaption,
		.selected-summary,
		.panel,
		.maya-mark,
		.response-stamp,
		.scan-shape {
			border-color: CanvasText;
		}
	}
</style>
