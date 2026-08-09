<script lang="ts">
	import { formatHumanWork, formatMachineTime, formatPatientElapsed } from './format';
	import type { UiClockSnapshot } from './ui-types';

	type Props = {
		clock: UiClockSnapshot;
		comparisonClock?: UiClockSnapshot;
		comparisonLabel?: string;
		compact?: boolean;
		zeroState?: boolean;
	};

	let {
		clock,
		comparisonClock,
		comparisonLabel,
		compact = false,
		zeroState = false
	}: Props = $props();

	let readouts = $derived([
		{
			id: 'patient',
			label: 'Patient elapsed',
			value: formatPatientElapsed(clock.patientElapsedMinutes),
			comparison: comparisonClock
				? formatPatientElapsed(comparisonClock.patientElapsedMinutes)
				: undefined,
			detail: 'Wall time: queues, review, rework and scheduling',
			unit: 'wall time'
		},
		{
			id: 'human',
			label: 'Active human work',
			value: formatHumanWork(clock.humanWorkSeconds),
			comparison: comparisonClock ? formatHumanWork(comparisonClock.humanWorkSeconds) : undefined,
			detail: 'Hands-on work across clinical, payer and scheduling roles',
			unit: 'cumulative work'
		},
		{
			id: 'machine',
			label: 'Automated processing',
			value: formatMachineTime(clock.automatedProcessingMs),
			comparison: comparisonClock
				? formatMachineTime(comparisonClock.automatedProcessingMs)
				: undefined,
			detail: 'Declared network and software processing only',
			unit: 'cumulative processing'
		}
	]);
</script>

<section
	class:compact
	class="clock-panel"
	aria-label="Three clocks"
	data-clock-patient-ms={Math.round(clock.patientElapsedMinutes * 60_000)}
	data-clock-human-seconds={Math.round(clock.humanWorkSeconds)}
	data-clock-machine-ms={Math.round(clock.automatedProcessingMs)}
>
	<div class="clock-heading">
		<h2>Three clocks</h2>
		<p>
			{zeroState
				? 'All begin at zero. They will not agree for long.'
				: 'Different quantities; they do not add together.'}
		</p>
	</div>
	<dl>
		{#each readouts as readout}
			<div class={`clock clock-${readout.id}`}>
				<dt>{readout.label}</dt>
				<dd>
					<data
						value={readout.id === 'patient'
							? clock.patientElapsedMinutes
							: readout.id === 'human'
								? clock.humanWorkSeconds
								: clock.automatedProcessingMs}>{readout.value}</data
					>
				</dd>
				{#if readout.comparison}
					<dd class="comparison">
						<span>{comparisonLabel ?? 'Other path'}:</span>
						{readout.comparison}
					</dd>
				{/if}
				<dd class="detail">{readout.detail}</dd>
				<dd class="unit">{readout.unit}</dd>
			</div>
		{/each}
	</dl>
</section>

<style>
	.clock-panel {
		display: grid;
		gap: 0.6rem;
		min-width: 0;
	}

	.clock-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	h2,
	p,
	dl,
	dt,
	dd {
		margin: 0;
	}

	h2 {
		font: 790 0.78rem/1.1 var(--font-sans, sans-serif);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink);
	}

	p {
		font: 0.7rem/1.35 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border: 1px solid var(--rule);
		border-radius: 0.75rem;
		overflow: clip;
		background: var(--paper-raised);
	}

	.clock {
		position: relative;
		display: grid;
		align-content: start;
		min-width: 0;
		gap: 0.2rem;
		border-right: 1px solid var(--rule);
		padding: clamp(0.65rem, 2vw, 1rem);
	}

	.clock:last-child {
		border-right: 0;
	}

	.clock::before {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 3px;
		background: var(--clock-colour, var(--accent));
		content: '';
	}

	.clock-patient {
		--clock-colour: #b66b52;
	}

	.clock-human {
		--clock-colour: #9b7b35;
	}

	.clock-machine {
		--clock-colour: #4a7f8c;
	}

	dt,
	.unit {
		font: 750 0.66rem/1.25 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.055em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	dd > data {
		display: block;
		max-width: 100%;
		overflow: hidden;
		font: 790 clamp(1.15rem, 2.6vw, 2.15rem) / 1.1 var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ink);
	}

	.clock-panel:not(.compact) dd > data {
		overflow: visible;
		text-overflow: clip;
		white-space: normal;
		text-wrap: balance;
	}

	.detail,
	.comparison {
		font: 0.68rem/1.35 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	.comparison {
		min-width: 0;
		overflow-wrap: anywhere;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}

	.comparison span {
		color: var(--ink-muted);
	}

	.unit {
		margin-top: auto;
		padding-top: 0.25rem;
		font-size: 0.58rem;
	}

	.compact .clock-heading {
		display: none;
	}

	.compact dl {
		border-radius: 0.5rem;
	}

	.compact .clock {
		padding: 0.55rem;
	}

	.compact .detail,
	.compact .unit {
		display: none;
	}

	.compact dd > data {
		font-size: clamp(0.88rem, 4vw, 1.15rem);
	}

	@media (max-width: 52rem) {
		.clock-panel:not(.compact) dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.clock-panel:not(.compact) .clock:first-child {
			grid-column: 1 / -1;
			border-right: 0;
			border-bottom: 1px solid var(--rule);
		}

		.clock-panel:not(.compact) dd > data {
			font-size: clamp(1.15rem, 4.5vw, 1.85rem);
		}
	}

	@media (max-width: 42rem) {
		.clock-heading {
			display: grid;
			gap: 0.2rem;
		}

		.clock-panel:not(.compact) dl {
			grid-template-columns: 1fr;
		}

		.clock-panel:not(.compact) .clock {
			grid-column: auto;
			border-right: 0;
			border-bottom: 1px solid var(--rule);
		}

		.clock-panel:not(.compact) .clock:last-child {
			border-bottom: 0;
		}

		.compact dt {
			font-size: 0.56rem;
		}
	}

	@media (forced-colors: active) {
		dl,
		.clock {
			border-color: CanvasText;
		}

		.clock::before {
			background: CanvasText;
		}
	}
</style>
