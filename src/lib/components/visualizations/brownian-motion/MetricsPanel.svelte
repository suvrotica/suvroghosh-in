<script lang="ts">
	import type { MetricSample } from './ui-types';

	type Props = {
		metrics: MetricSample;
		processLabel: string;
	};

	let { metrics, processLabel }: Props = $props();

	function number(value: number | null, digits = 3): string {
		if (value === null || !Number.isFinite(value)) return '—';
		if (Math.abs(value) >= 10_000 || (value !== 0 && Math.abs(value) < 0.001))
			return value.toExponential(2);
		return value.toFixed(digits);
	}

	let summary = $derived(
		`${metrics.particleCount.toLocaleString('en-IN')} particles in ${processLabel} have evolved for ${metrics.simulationTime.toFixed(2)} simulated seconds. Measured MSD is ${number(metrics.meanSquareDisplacement)}${metrics.theoreticalMsd === null ? '.' : `; theoretical MSD is ${number(metrics.theoreticalMsd)}.`}`
	);
</script>

<section class="metrics-panel" aria-labelledby="brownian-measurements-title">
	<h3 id="brownian-measurements-title" class="sr-only">Current laboratory measurements</h3>
	<table>
		<caption class="sr-only">Measured values from the current ensemble</caption>
		<tbody>
			<tr>
				<th scope="row">Particles</th>
				<td>{metrics.particleCount.toLocaleString('en-IN')}</td>
			</tr>
			<tr>
				<th scope="row">Mean position, measured</th>
				<td>({number(metrics.mean?.x ?? null)}, {number(metrics.mean?.y ?? null)})</td>
			</tr>
			<tr>
				<th scope="row">Radial MSD, measured</th>
				<td>{number(metrics.meanSquareDisplacement)}</td>
			</tr>
			<tr>
				<th scope="row">MSD, theoretical</th>
				<td>{number(metrics.theoreticalMsd)}</td>
			</tr>
			<tr>
				<th scope="row">Local exponent, measured</th>
				<td>{number(metrics.measuredExponent, 2)}</td>
			</tr>
			<tr>
				<th scope="row">Surviving</th>
				<td
					>{metrics.aliveCount.toLocaleString('en-IN')} ({number(
						metrics.survivalFraction * 100,
						1
					)}%)</td
				>
			</tr>
		</tbody>
	</table>
	<p class="summary">{summary}</p>
</section>

<style>
	.metrics-panel {
		border-block: 1px solid var(--rule, #c8c1b2);
		background: color-mix(in srgb, var(--paper, #f7f2e8) 92%, var(--lab-accent, #6f7fa8));
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}
	tbody {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
	}
	tr {
		display: grid;
		align-content: center;
		min-width: 0;
		border-right: 1px solid var(--rule, #c8c1b2);
		padding: 0.7rem 0.8rem;
	}
	tr:last-child {
		border-right: 0;
	}
	th {
		color: var(--ink-muted, #68707a);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-align: left;
		text-transform: uppercase;
	}
	td {
		min-width: 0;
		overflow: hidden;
		margin-top: 0.25rem;
		color: var(--ink, #242a32);
		font:
			700 0.85rem 'Courier Prime',
			monospace;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.summary {
		margin: 0;
		border-top: 1px solid var(--rule, #c8c1b2);
		padding: 0.55rem 0.8rem;
		color: var(--ink-muted, #68707a);
		font-size: 0.76rem;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	@media (max-width: 68rem) {
		tbody {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		tr:nth-child(3) {
			border-right: 0;
		}
		tr:nth-child(-n + 3) {
			border-bottom: 1px solid var(--rule, #c8c1b2);
		}
	}
	@media (max-width: 34rem) {
		tbody {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		tr:nth-child(3) {
			border-right: 1px solid var(--rule, #c8c1b2);
		}
		tr:nth-child(even) {
			border-right: 0;
		}
		tr:not(:nth-last-child(-n + 2)) {
			border-bottom: 1px solid var(--rule, #c8c1b2);
		}
	}
</style>
