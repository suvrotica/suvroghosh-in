<script lang="ts">
	import { formatDayMinute, formatHumanWork, formatMachineTime } from './format';
	import type { UiLedgerRow, UiPerspectiveId } from './ui-types';

	type Props = {
		rows: UiLedgerRow[];
		perspective: UiPerspectiveId;
		pathwayLabel: string;
		activeStep?: number;
		open?: boolean;
	};

	let { rows, perspective, pathwayLabel, activeStep = -1, open = false }: Props = $props();

	function narrative(row: UiLedgerRow): string {
		if (perspective === 'clinician') return row.clinicianText;
		if (perspective === 'architect') return row.architectText;
		return row.patientText;
	}
</script>

<details class="ledger" {open} data-testid="event-ledger" id="pa-event-ledger">
	<summary>
		<span>Authoritative event ledger</span>
		<small>{pathwayLabel} · {rows.length} canonical events · exact fixture values</small>
	</summary>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="table-wrap"
		role="region"
		tabindex="0"
		data-stage-shortcuts="ignore"
		aria-label={`Scrollable ${pathwayLabel} event ledger`}
	>
		<table>
			<caption>
				Exact modeled event values for the {pathwayLabel} pathway. Wall time, human work and automated
				processing are separate measures.
			</caption>
			<thead>
				<tr>
					<th scope="col">#</th>
					<th scope="col">Modeled time</th>
					<th scope="col">Milestone and event</th>
					<th scope="col">Actor / channel</th>
					<th scope="col">State</th>
					<th scope="col">Human work</th>
					<th scope="col">Automated</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr
						class:current={row.stepIndex === activeStep}
						class:caused={Boolean(row.causedByFailureId)}
					>
						<td>{row.sequence}</td>
						<td>
							<time>{formatDayMinute(row.wallStartMinute)}</time>
							{#if row.wallEndMinute !== row.wallStartMinute}
								<small>to {formatDayMinute(row.wallEndMinute)}</small>
							{/if}
						</td>
						<td>
							<strong>{row.milestone}</strong>
							<span>{narrative(row)}</span>
							{#if row.causedByFailureId}<small>Caused by: {row.causedByFailureId}</small>{/if}
						</td>
						<td><strong>{row.actor}</strong><small>{row.channel}</small></td>
						<td>
							<strong>{row.status}</strong>
							<small
								>Technical: {row.technicalStatus ?? 'not-applicable'} · Business: {row.businessStatus ??
									'not-applicable'}</small
							>
							<small
								>Authorization: {row.authorizationStatus ?? 'not-requested'} · Outcome: {row.finalOutcome ??
									'not-reached'}</small
							>
						</td>
						<td>{formatHumanWork(row.staffEffortSeconds)}</td>
						<td>{formatMachineTime(row.machineProcessingMs)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</details>

<style>
	.ledger {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		overflow: hidden;
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

	summary::marker {
		color: var(--accent);
	}

	summary span {
		font: 780 0.82rem/1.2 var(--font-sans, sans-serif);
	}

	summary small {
		font: 0.66rem/1.35 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.table-wrap {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		max-height: 34rem;
		overflow: auto;
		border-top: 1px solid var(--rule);
		overscroll-behavior: contain;
	}

	.table-wrap:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	table {
		width: 100%;
		min-width: 58rem;
		border-collapse: collapse;
		font: 0.7rem/1.4 var(--font-sans, sans-serif);
	}

	caption {
		padding: 0.75rem;
		text-align: left;
		color: var(--ink-muted);
	}

	th,
	td {
		border-top: 1px solid var(--rule);
		padding: 0.55rem 0.65rem;
		text-align: left;
		vertical-align: top;
	}

	thead th {
		position: sticky;
		z-index: 1;
		top: 0;
		border-top: 0;
		background: var(--paper);
		font: 770 0.62rem/1.25 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	td:first-child,
	td:nth-last-child(-n + 2) {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	td span,
	td small,
	td time {
		display: block;
	}

	td small {
		margin-top: 0.12rem;
		color: var(--ink-muted);
	}

	tr.current {
		box-shadow: inset 4px 0 0 var(--accent);
		background: color-mix(in oklab, var(--accent) 8%, var(--paper));
	}

	tr.caused td:first-child::after {
		display: block;
		margin-top: 0.2rem;
		content: 'break';
		font-size: 0.58rem;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--accent);
	}

	@media (forced-colors: active) {
		.ledger,
		.table-wrap,
		th,
		td {
			border-color: CanvasText;
		}

		tr.current {
			outline: 3px solid Highlight;
			outline-offset: -3px;
		}
	}
</style>
