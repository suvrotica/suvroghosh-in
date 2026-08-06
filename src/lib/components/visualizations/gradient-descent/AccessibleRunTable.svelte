<script lang="ts">
	import { pointX, pointY, type HistoryRecord } from './types';

	type DisplayRow = {
		index: number;
		record: HistoryRecord;
	};

	let {
		history,
		selectedStepIndex = 0,
		parameterLabels = ['θ₀', 'θ₁'],
		maximumRows = 1000,
		onselectstep
	}: {
		history: readonly HistoryRecord[];
		selectedStepIndex?: number;
		parameterLabels?: readonly [string, string] | readonly string[];
		maximumRows?: number;
		onselectstep?: (index: number) => void;
	} = $props();

	const uid = $props.id();
	const tableId = `gradient-run-table-${uid}`;

	function finite(value: number | null | undefined): number | null {
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	}

	function formatNumber(value: number | null | undefined, digits = 6): string {
		const number = finite(value);
		if (number === null) return '—';
		if (number === 0) return '0';
		const magnitude = Math.abs(number);
		if (magnitude >= 10_000 || magnitude < 0.0001) return number.toExponential(4);
		return number.toLocaleString('en-GB', {
			maximumFractionDigits: digits,
			useGrouping: false
		});
	}

	function displayRows(): DisplayRow[] {
		if (history.length <= Math.max(1, maximumRows)) {
			return history.map((record, index) => ({ record, index }));
		}

		const limit = Math.max(3, Math.floor(maximumRows));
		const indexes = [0, history.length - 1];
		const addIndex = (index: number) => {
			if (!indexes.includes(index)) indexes.push(index);
		};
		if (selectedStepIndex >= 0 && selectedStepIndex < history.length) addIndex(selectedStepIndex);

		const interval = (history.length - 1) / (limit - 1);
		for (let slot = 1; slot < limit - 1; slot += 1) {
			addIndex(Math.round(slot * interval));
		}

		return indexes
			.sort((left, right) => left - right)
			.map((index) => ({ index, record: history[index] }));
	}

	function selectStep(index: number): void {
		onselectstep?.(index);
	}

	let rows = $derived(displayRows());
	let isSampled = $derived(rows.length < history.length);
</script>

<details class="run-table" data-testid="gradient-accessible-run-table">
	<summary>
		<span>Iteration data</span>
		<span class="summary-count">{history.length.toLocaleString('en-GB')} stored iterates</span>
	</summary>

	{#if history.length === 0}
		<p class="empty">Run the optimiser to populate the trajectory table.</p>
	{:else}
		<p class="table-note" id={`${tableId}-note`}>
			{#if isSampled}
				Showing {rows.length.toLocaleString('en-GB')} evenly spaced rows from
				{history.length.toLocaleString('en-GB')} stored iterates, including the selected iterate.
			{:else}
				Every stored optimiser iterate is shown. Select an iteration to inspect it in the charts.
			{/if}
			The work columns separate optimizer updates, active gradients, data rows, and additional
			full-gradient diagnostics. Gradient and update values on row t describe the transition from θ<sub>t−1</sub> to θ<sub
				>t</sub
			>, not a gradient evaluated at the destination. Iteration zero has no incoming transition. A
			terminal full-gradient norm, when present, is the separate evaluation made at the destination
			without committing another step.
		</p>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex (A labelled native scroll region must be focusable.) -->
		<div
			class="table-wrap"
			role="region"
			tabindex="0"
			aria-label="Scrollable optimiser trajectory; use the arrow keys to reveal additional columns"
		>
			<table aria-describedby={`${tableId}-note`}>
				<caption class="sr-only">
					Stored optimiser iterates with separate work counters, destination parameters, raw loss, and
					incoming-transition diagnostics. On row t, the gradient was evaluated at theta t minus one
					and the update arrived at theta t. Iteration zero has no incoming transition. This table
					does not assign a termination status to individual iterates. The terminal full-gradient
					norm is from a separate evaluation at the retained destination.
				</caption>
				<thead>
					<tr>
						<th scope="col">Optimizer update</th>
						<th scope="col">Active-gradient computations</th>
						<th scope="col">Active-gradient examples</th>
						<th scope="col">Additional full-gradient computations</th>
						<th scope="col">Diagnostic examples</th>
						<th scope="col">{parameterLabels[0] ?? 'θ₀'}</th>
						<th scope="col">{parameterLabels[1] ?? 'θ₁'}</th>
						<th scope="col">Loss</th>
						<th scope="col">Incoming gradient norm</th>
						<th scope="col">Incoming step norm</th>
						<th scope="col">Terminal full-gradient norm</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.index)}
						<tr class:selected={row.index === selectedStepIndex}>
							<th scope="row">
								<button
									type="button"
									class="step-button"
									aria-current={row.index === selectedStepIndex ? 'step' : undefined}
									onclick={() => selectStep(row.index)}
								>
									{row.record.iteration}
								</button>
							</th>
							<td>{row.record.activeGradientComputations ?? row.record.gradientEvaluations}</td>
							<td>{row.record.activeGradientExamplesProcessed ?? '—'}</td>
							<td>{row.record.additionalFullGradientComputations ?? 0}</td>
							<td>{row.record.diagnosticExamplesProcessed ?? '—'}</td>
							<td>{formatNumber(pointX(row.record.theta))}</td>
							<td>{formatNumber(pointY(row.record.theta))}</td>
							<td>{formatNumber(row.record.loss)}</td>
							<td>{formatNumber(row.record.gradientNorm)}</td>
							<td>{formatNumber(row.record.stepNorm)}</td>
							<td>{formatNumber(row.record.terminalEvaluation?.fullGradientNorm)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</details>

<style>
	.run-table {
		border-block: 1px solid color-mix(in srgb, var(--border-color, #8b9a93) 34%, transparent);
		color: var(--text-color, #e8eee9);
	}

	summary {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 0;
		font-weight: 650;
		cursor: pointer;
	}

	.summary-count,
	.table-note,
	.empty {
		color: var(--muted-text-color, #a9b7b0);
		font-size: 0.8rem;
		font-weight: 450;
	}

	.table-note,
	.empty {
		margin: 0 0 0.75rem;
		line-height: 1.55;
	}

	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
		overscroll-behavior-inline: contain;
	}

	.table-wrap:focus-visible {
		outline: 2px solid var(--accent-color, #ff9e45);
		outline-offset: 3px;
	}

	table {
		width: 100%;
		min-width: 84rem;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
		font-size: 0.78rem;
	}

	th,
	td {
		padding: 0.5rem 0.55rem;
		border-bottom: 1px solid color-mix(in srgb, var(--border-color, #8b9a93) 20%, transparent);
		text-align: right;
		white-space: nowrap;
	}

	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--surface-color, #101715);
		color: var(--muted-text-color, #a9b7b0);
		font-size: 0.7rem;
		font-weight: 650;
		letter-spacing: 0.035em;
		text-transform: uppercase;
	}

	thead th:first-child,
	tbody th {
		text-align: left;
	}

	tbody th {
		font-weight: 600;
	}

	tbody tr.selected {
		background: color-mix(in srgb, var(--accent-color, #ff9e45) 10%, transparent);
	}

	.step-button {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 0;
		border-bottom: 1px solid transparent;
		padding: 0.35rem 0.25rem;
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: inherit;
		cursor: pointer;
	}

	.step-button:hover {
		border-bottom-color: currentColor;
	}

	.step-button[aria-current='step'] {
		color: var(--accent-color, #ff9e45);
	}

	.step-button:focus-visible {
		outline: 2px solid var(--accent-color, #ff9e45);
		outline-offset: 3px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (forced-colors: active) {
		.run-table,
		th,
		td {
			border-color: CanvasText;
		}

		tbody tr.selected {
			outline: 2px solid Highlight;
			outline-offset: -2px;
		}

		.step-button[aria-current='step'] {
			color: LinkText;
		}
	}

	@media (max-width: 40rem) {
		summary {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.15rem;
		}
	}
</style>
