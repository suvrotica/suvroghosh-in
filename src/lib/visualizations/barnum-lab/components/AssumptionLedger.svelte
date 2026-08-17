<script lang="ts">
	import type { LedgerGroup, LedgerRow } from './ui-types';

	const GROUPS: readonly { id: LedgerGroup; label: string; note: string }[] = [
		{
			id: 'demo-defaults',
			label: 'Demo starting values',
			note: 'Prefilled by the page and not yet confirmed.'
		},
		{
			id: 'selected',
			label: 'You explicitly selected',
			note: 'Choices you touched or confirmed.'
		},
		{
			id: 'unknowns',
			label: 'The machine has not learned',
			note: 'No observation or validated personality model supplies these facts.'
		}
	];

	let {
		rows,
		revealed = false
	}: {
		rows: readonly LedgerRow[];
		revealed?: boolean;
	} = $props();

	function rowsFor(group: LedgerGroup): readonly LedgerRow[] {
		return rows.filter((row) => row.group === group);
	}
</script>

<section class="ledger" aria-labelledby="barnum-ledger-heading" data-testid="assumption-ledger">
	<header>
		<div>
			<p class="eyebrow">Evidence ledger · always visible first</p>
			<h2 id="barnum-ledger-heading">Assumptions in play</h2>
		</div>
		<p class="privacy-chip"><span aria-hidden="true"></span>Current tab memory only</p>
	</header>

	<div class="wide-ledger" aria-label="Assumptions in play">
		{#each GROUPS as group (group.id)}
			<section aria-labelledby={`ledger-${group.id}`}>
				<div class="group-heading">
					<h3 id={`ledger-${group.id}`}>{group.label}</h3>
					<p>{group.note}</p>
				</div>
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th scope="col">Current item</th>
								<th scope="col">Value</th>
								<th scope="col">Origin</th>
								<th scope="col">Permitted use</th>
							</tr>
						</thead>
						<tbody>
							{#each rowsFor(group.id) as row (row.id)}
								<tr>
									<th scope="row">{row.label}</th>
									<td>{row.value}</td>
									<td>{row.origin}</td>
									<td>{revealed && row.useAfterReveal ? row.useAfterReveal : row.permittedUse}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/each}
	</div>

	<div class="narrow-ledger">
		{#each GROUPS as group (group.id)}
			<section aria-labelledby={`ledger-mobile-${group.id}`}>
				<div class="group-heading">
					<h3 id={`ledger-mobile-${group.id}`}>{group.label}</h3>
					<p>{group.note}</p>
				</div>
				<dl>
					{#each rowsFor(group.id) as row (row.id)}
						<div>
							<dt>{row.label}</dt>
							<dd class="value">{row.value}</dd>
							<dd><strong>Origin:</strong> {row.origin}</dd>
							<dd>
								<strong>Use:</strong>
								{revealed && row.useAfterReveal ? row.useAfterReveal : row.permittedUse}
							</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/each}
	</div>

	<p class="unknown-line">
		The machine still does not know your character, motives, intelligence, health, relationships,
		history, beliefs, or private behavior.
	</p>
</section>

<style>
	.ledger {
		border: 1px solid var(--barnum-rule);
		border-top: 4px solid var(--barnum-ink);
		border-radius: 0.6rem;
		background: var(--barnum-raised);
		color: var(--barnum-ink);
		overflow: hidden;
	}

	.ledger > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.78rem clamp(0.7rem, 2cqi, 1.1rem);
	}

	.ledger p,
	.ledger h2,
	.ledger h3,
	.ledger dl,
	.ledger dt,
	.ledger dd {
		margin: 0;
	}

	.eyebrow {
		color: var(--barnum-vermilion-text);
		font: 780 0.7rem/1.2 var(--barnum-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h2 {
		margin-top: 0.1rem !important;
		font: 820 clamp(1rem, 2.2cqi, 1.28rem) / 1.1 var(--barnum-sans);
		letter-spacing: -0.02em;
	}

	.privacy-chip {
		display: flex;
		min-height: 2rem;
		align-items: center;
		gap: 0.38rem;
		border: 1px solid var(--barnum-control);
		border-radius: 999px;
		padding: 0.35rem 0.55rem;
		color: var(--barnum-muted);
		font: 700 0.72rem/1.25 var(--barnum-sans);
	}

	.privacy-chip span {
		width: 0.5rem;
		height: 0.5rem;
		border: 1px solid currentColor;
		border-radius: 50%;
		background: var(--barnum-blue);
	}

	.wide-ledger > section,
	.narrow-ledger > section {
		border-top: 1px solid var(--barnum-rule);
	}

	.group-heading {
		display: grid;
		grid-template-columns: minmax(12rem, 0.7fr) minmax(0, 1.3fr);
		gap: 0.75rem;
		align-items: baseline;
		background: var(--barnum-soft);
		padding: 0.42rem clamp(0.7rem, 2cqi, 1.1rem);
	}

	.group-heading h3 {
		font: 780 0.78rem/1.25 var(--barnum-sans);
	}

	.group-heading p {
		color: var(--barnum-muted);
		font: 0.72rem/1.4 var(--barnum-sans);
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}

	th,
	td {
		border-top: 1px dotted var(--barnum-rule);
		padding: 0.46rem clamp(0.7rem, 2cqi, 1.1rem);
		font: 0.75rem/1.45 var(--barnum-sans);
		text-align: left;
		vertical-align: top;
		overflow-wrap: anywhere;
	}

	thead th {
		border-top: 0;
		color: var(--barnum-muted);
		font: 750 0.7rem/1.25 var(--barnum-mono);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	tbody th {
		font-weight: 760;
	}

	th:nth-child(1),
	td:nth-child(1) {
		width: 18%;
	}

	th:nth-child(2),
	td:nth-child(2) {
		width: 20%;
	}

	th:nth-child(3),
	td:nth-child(3) {
		width: 24%;
	}

	.narrow-ledger {
		display: none;
	}

	.unknown-line {
		border-top: 1px solid var(--barnum-rule);
		padding: 0.7rem clamp(0.7rem, 2cqi, 1.1rem);
		font: 730 0.75rem/1.5 var(--barnum-sans);
	}

	@container barnum-lab (max-width: 43rem) {
		.ledger > header {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.55rem;
		}

		.wide-ledger {
			display: none;
		}

		.narrow-ledger {
			display: block;
		}

		.group-heading {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}

		dl {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.45rem;
			padding: 0.55rem;
		}

		dl > div {
			min-width: 0;
			border: 1px solid var(--barnum-rule);
			border-radius: 0.35rem;
			padding: 0.58rem;
		}

		dt {
			font: 760 0.75rem/1.3 var(--barnum-sans);
		}

		dd {
			margin-top: 0.28rem !important;
			color: var(--barnum-muted);
			font: 0.72rem/1.45 var(--barnum-sans);
		}

		dd.value {
			color: var(--barnum-ink);
			font: 700 0.7rem/1.3 var(--barnum-sans);
		}
	}

	@container barnum-lab (max-width: 25rem) {
		dl {
			grid-template-columns: 1fr;
		}
	}

	@media (forced-colors: active) {
		.ledger,
		.wide-ledger > section,
		.narrow-ledger > section,
		.group-heading,
		th,
		td,
		dl > div,
		.unknown-line {
			border-color: CanvasText;
		}

		.privacy-chip span {
			background: Highlight;
		}
	}
</style>
