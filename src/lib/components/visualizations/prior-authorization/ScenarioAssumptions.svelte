<script lang="ts">
	import { formatHumanWork, formatMachineTime, formatPatientElapsed } from './format';
	import type { UiAssumption, UiClockSnapshot, UiWallSegment } from './ui-types';

	type Props = {
		assumptions: UiAssumption[];
		portalClock: UiClockSnapshot;
		fhirClock: UiClockSnapshot;
		baselineFhirClock: UiClockSnapshot;
		portalSegments: UiWallSegment[];
		fhirSegments: UiWallSegment[];
	};

	let {
		assumptions,
		portalClock,
		fhirClock,
		baselineFhirClock,
		portalSegments,
		fhirSegments
	}: Props = $props();

	function segmentDuration(minutes: number): string {
		const milliseconds = Math.round(minutes * 60_000);
		return milliseconds < 60_000 ? formatMachineTime(milliseconds) : formatPatientElapsed(minutes);
	}
</script>

<details class="assumptions" data-testid="scenario-assumptions">
	<summary>
		<span>Scenario assumptions</span>
		<small
			>What is exact in the fixture, what is illustrative, and what is only a UI tolerance</small
		>
	</summary>
	<div class="assumption-body">
		<section class="exact" aria-labelledby="exact-fixture-heading">
			<p class="kind">Exact authored integer fixture facts</p>
			<h3 id="exact-fixture-heading">Exact inside this synthetic case—not empirical estimates</h3>
			<ul>
				<li>The FHIR-enabled baseline journey ends after exactly <strong>11 modeled days</strong>.</li>
				<li>One declared transaction takes exactly <strong>400 ms</strong>.</li>
				<li>
					Baseline compiled totals: <strong>{formatHumanWork(
						baselineFhirClock.humanWorkSeconds
					)}</strong> active human work and <strong>{formatMachineTime(
						baselineFhirClock.automatedProcessingMs
					)}</strong> automated
					processing.
				</li>
			</ul>
		</section>

		<section aria-labelledby="illustrative-heading">
			<p class="kind">Illustrative model assumptions</p>
			<h3 id="illustrative-heading">The counterfactual comparison</h3>
			<p>
				Portal/fax and FHIR-enabled paths use the same synthetic patient facts and fictional
				decision policy. Their authored queues, handoffs, re-keying, transport and scheduling
				assumptions produce <strong
					>{formatPatientElapsed(portalClock.patientElapsedMinutes)}</strong
				>
				versus <strong>{formatPatientElapsed(fhirClock.patientElapsedMinutes)}</strong>. These are
				not observed averages or CMS promises.
			</p>
		</section>

		<section class="wall-segment-assumptions" aria-labelledby="wall-segments-heading">
			<p class="kind">Authored wall-time intervals</p>
			<h3 id="wall-segments-heading">What the elapsed bar is made from</h3>
			<p>
				Each interval below is a disjoint, ledger-derived wall-time assumption. Sub-minute automated
				intervals keep their exact millisecond label; staff work remains a separate clock.
			</p>
			{#each [{ label: 'Portal and fax', segments: portalSegments }, { label: 'FHIR-enabled', segments: fhirSegments }] as group}
				<div class="segment-group">
					<h4>{group.label}</h4>
					<ul>
						{#each group.segments as segment (segment.id)}
							<li
								data-wall-category={segment.category}
								data-duration-ms={Math.round(segment.durationMinutes * 60_000)}
							>
								<span>{segment.label}</span><strong
									>{segmentDuration(segment.durationMinutes)}</strong
								>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</section>

		{#if assumptions.length}
			<section aria-labelledby="declared-assumptions-heading">
				<p class="kind">Declared inputs</p>
				<h3 id="declared-assumptions-heading">What the ledger assumes</h3>
				<dl>
					{#each assumptions as assumption (assumption.id)}
						<div>
							<dt>{assumption.label}{assumption.value ? ` · ${assumption.value}` : ''}</dt>
							<dd>{assumption.detail}</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}

		<section aria-labelledby="tolerance-heading">
			<p class="kind">UI and test tolerances</p>
			<h3 id="tolerance-heading">Rendering may have tolerances; bookkeeping does not</h3>
			<p>
				Animation frames, responsive layout and performance checks may use small rendering
				tolerances. They never modify ledger values, clock totals, event order or outcomes. Playback
				speed changes presentation time only.
			</p>
		</section>
	</div>
</details>

<style>
	.assumptions {
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		background: var(--paper-raised);
		color: var(--ink);
	}

	summary {
		display: grid;
		min-height: 3.25rem;
		align-content: center;
		gap: 0.15rem;
		padding: 0.65rem 0.85rem;
		cursor: pointer;
	}

	summary:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	summary span {
		font: 780 0.82rem/1.2 var(--font-sans, sans-serif);
	}

	summary small {
		font: 0.66rem/1.35 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.assumption-body {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border-top: 1px solid var(--rule);
	}

	section {
		padding: 0.9rem;
	}

	section:nth-child(even) {
		border-left: 1px solid var(--rule);
	}

	section:nth-child(n + 3) {
		border-top: 1px solid var(--rule);
	}

	section.exact {
		background: color-mix(in oklab, var(--accent) 8%, var(--paper-raised));
	}

	.kind,
	h3,
	h4,
	p,
	ul,
	dl,
	dt,
	dd {
		margin: 0;
	}

	.kind {
		font: 760 0.61rem/1.25 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--accent);
	}

	h3 {
		margin-top: 0.25rem;
		font: 760 0.93rem/1.25 var(--font-sans, sans-serif);
	}

	h4 {
		font: 750 0.68rem/1.3 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	p,
	li,
	dd {
		font: 0.72rem/1.5 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	section > p:not(.kind),
	ul,
	dl {
		margin-top: 0.55rem;
	}

	ul {
		padding-left: 1.1rem;
	}

	li + li {
		margin-top: 0.28rem;
	}

	.segment-group {
		margin-top: 0.7rem;
	}

	.segment-group ul {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.35rem;
		padding: 0;
		list-style: none;
	}

	.segment-group li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		margin: 0;
		border-top: 1px dotted var(--rule);
		padding-top: 0.25rem;
	}

	.segment-group li strong {
		flex: none;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}

	dl {
		display: grid;
		gap: 0.5rem;
	}

	dt {
		font: 730 0.72rem/1.35 var(--font-sans, sans-serif);
	}

	@media (max-width: 44rem) {
		.assumption-body {
			grid-template-columns: 1fr;
		}

		section:nth-child(even) {
			border-left: 0;
		}

		section + section {
			border-top: 1px solid var(--rule);
		}
	}

	@media (forced-colors: active) {
		.assumptions,
		.assumption-body,
		section {
			border-color: CanvasText;
		}
	}
</style>
