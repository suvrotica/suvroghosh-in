<script lang="ts">
	import { formatNumber, type MatrixAnalysisView } from './types';

	let {
		analysis,
		seed,
		ensembleLabel,
		normalisationLabel
	}: {
		analysis?: MatrixAnalysisView;
		seed: string;
		ensembleLabel: string;
		normalisationLabel: string;
	} = $props();

	let eigenRows = $derived(
		analysis?.eigen
			? Array.from({ length: Math.min(24, analysis.eigen.real.length) }, (_, index) => ({
					index,
					real: analysis.eigen?.real[index] ?? 0,
					imaginary: analysis.eigen?.imaginary[index] ?? 0
				}))
			: []
	);
	let singularRows = $derived(
		analysis?.singular
			? Array.from(analysis.singular.values.slice(0, 24), (value, index) => ({ index, value }))
			: []
	);
	let matrixRows = $derived(sampledMatrixRows());

	function sampledIndexes(length: number, limit: number): readonly number[] {
		if (length <= limit) return Array.from({ length }, (_, index) => index);
		return Array.from({ length: limit }, (_, index) =>
			Math.round((index / Math.max(1, limit - 1)) * (length - 1))
		);
	}

	function sampledMatrixRows(): readonly {
		row: number;
		cells: readonly { column: number; value: number }[];
	}[] {
		if (!analysis) return [];
		const rowIndexes = sampledIndexes(analysis.rows, 10);
		const columnIndexes = sampledIndexes(analysis.columns, 10);
		return rowIndexes.map((row) => ({
			row,
			cells: columnIndexes.map((column) => ({
				column,
				value: analysis.matrix[row * analysis.columns + column] ?? 0
			}))
		}));
	}
</script>

<details class="accessible-summary">
	<summary>
		<span>Accessible data and numerical summary</span>
		<span
			>{analysis
				? `${analysis.rows} × ${analysis.columns} matrix`
				: 'Waiting for the first result'}</span
		>
	</summary>

	{#if !analysis}
		<p class="empty">
			The numerical tables will appear after the browser worker finishes the first seeded
			experiment.
		</p>
	{:else}
		<p class="summary-note">
			Seed <code>{seed}</code>. {ensembleLabel}. {normalisationLabel}. The sampled entry table below
			is a labelled text alternative, not a replacement for downloading the full matrix. At most 24
			eigenvalues and singular values are shown to keep keyboard navigation practical.
		</p>

		<div class="stat-grid">
			<div><span>Rows × columns</span><strong>{analysis.rows} × {analysis.columns}</strong></div>
			<div><span>Entry mean</span><strong>{formatNumber(analysis.summary.mean, 7)}</strong></div>
			<div>
				<span>Entry standard deviation</span><strong
					>{formatNumber(analysis.summary.standardDeviation, 7)}</strong
				>
			</div>
			<div>
				<span>Minimum / maximum</span><strong
					>{formatNumber(analysis.summary.minimum, 6)} / {formatNumber(
						analysis.summary.maximum,
						6
					)}</strong
				>
			</div>
			<div>
				<span>Frobenius norm</span><strong>{formatNumber(analysis.summary.frobeniusNorm, 7)}</strong
				>
			</div>
			<div>
				<span>Spectral radius</span><strong
					>{formatNumber(analysis.summary.spectralRadius, 7)}</strong
				>
			</div>
			<div><span>Numerical rank</span><strong>{analysis.singular?.rank ?? '—'}</strong></div>
			<div>
				<span>Condition number</span><strong>{formatNumber(analysis.singular?.condition, 7)}</strong
				>
			</div>
			<div>
				<span>Eigen residual</span><strong>{formatNumber(analysis.eigen?.residual, 3)}</strong>
			</div>
			<div>
				<span>SVD residual</span><strong>{formatNumber(analysis.singular?.residual, 3)}</strong>
			</div>
		</div>

		<div class="tables-grid">
			<div class="table-block">
				<h4>Sampled matrix entries</h4>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Labelled native scroll region needs a keyboard focus stop.) -->
				<div
					class="table-wrap"
					role="region"
					tabindex="0"
					aria-label="Scrollable sampled matrix entries"
				>
					<table>
						<caption>Evenly sampled rows and columns from matrix A</caption>
						<thead
							><tr
								><th scope="col">row \ column</th
								>{#each matrixRows[0]?.cells ?? [] as cell (cell.column)}<th scope="col"
										>{cell.column}</th
									>{/each}</tr
							></thead
						>
						<tbody>
							{#each matrixRows as row (row.row)}
								<tr
									><th scope="row">{row.row}</th>{#each row.cells as cell (cell.column)}<td
											>{formatNumber(cell.value, 5)}</td
										>{/each}</tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<div class="table-block">
				<h4>Eigenvalue sample</h4>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Labelled native scroll region needs a keyboard focus stop.) -->
				<div class="table-wrap" role="region" tabindex="0" aria-label="Scrollable eigenvalue table">
					<table>
						<caption
							>First {eigenRows.length} computed eigenvalues with complex parts retained</caption
						>
						<thead
							><tr
								><th scope="col">index</th><th scope="col">real</th><th scope="col">imaginary</th
								><th scope="col">magnitude</th><th scope="col">angle</th></tr
							></thead
						>
						<tbody
							>{#each eigenRows as row (row.index)}<tr
									><th scope="row">{row.index + 1}</th><td>{formatNumber(row.real, 7)}</td><td
										>{formatNumber(row.imaginary, 7)}</td
									><td>{formatNumber(Math.hypot(row.real, row.imaginary), 7)}</td><td
										>{formatNumber(Math.atan2(row.imaginary, row.real), 6)}</td
									></tr
								>{/each}</tbody
						>
					</table>
				</div>
			</div>

			<div class="table-block">
				<h4>Singular-value sample</h4>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Labelled native scroll region needs a keyboard focus stop.) -->
				<div
					class="table-wrap"
					role="region"
					tabindex="0"
					aria-label="Scrollable singular value table"
				>
					<table>
						<caption>First {singularRows.length} singular values in descending order</caption>
						<thead
							><tr
								><th scope="col">rank index</th><th scope="col">σ</th><th scope="col"
									>cumulative energy</th
								></tr
							></thead
						>
						<tbody
							>{#each singularRows as row (row.index)}<tr
									><th scope="row">{row.index + 1}</th><td>{formatNumber(row.value, 7)}</td><td
										>{analysis.singular?.cumulativeEnergy
											? `${formatNumber((analysis.singular.cumulativeEnergy[row.index] ?? 0) * 100, 5)}%`
											: '—'}</td
									></tr
								>{/each}</tbody
						>
					</table>
				</div>
			</div>
		</div>

		{#if analysis.warnings.length > 0}
			<div class="warnings" role="note">
				<strong>Numerical and model warnings</strong>
				<ul>
					{#each analysis.warnings as warning (warning)}<li>{warning}</li>{/each}
				</ul>
			</div>
		{/if}
	{/if}
</details>

<style>
	.accessible-summary {
		border-top: 1px solid var(--rm-rule);
		background: var(--rm-surface);
	}
	summary {
		display: flex;
		min-height: 3rem;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.8rem;
		font-size: 0.78rem;
		font-weight: 750;
		cursor: pointer;
	}
	summary span:last-child,
	.summary-note,
	.empty {
		color: var(--rm-muted);
		font-size: 0.7rem;
		font-weight: 500;
	}
	.summary-note,
	.empty {
		margin: 0;
		padding: 0.75rem 0.8rem 0;
		line-height: 1.5;
	}
	.summary-note code {
		color: var(--rm-ink);
	}
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		margin: 0.75rem 0.8rem 0;
		border: 1px solid var(--rm-rule);
		border-radius: 0.4rem;
	}
	.stat-grid > div {
		min-width: 0;
		border-right: 1px solid var(--rm-rule);
		border-bottom: 1px solid var(--rm-rule);
		padding: 0.5rem;
	}
	.stat-grid > div:nth-child(5n) {
		border-right: 0;
	}
	.stat-grid > div:nth-last-child(-n + 5) {
		border-bottom: 0;
	}
	.stat-grid span,
	.stat-grid strong {
		display: block;
	}
	.stat-grid span {
		color: var(--rm-muted);
		font-size: 0.6875rem;
		line-height: 1.3;
		text-transform: uppercase;
	}
	.stat-grid strong {
		overflow-wrap: anywhere;
		margin-top: 0.16rem;
		font: 700 0.6875rem var(--rm-mono);
	}
	.tables-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) repeat(2, minmax(14rem, 0.75fr));
		gap: 0.65rem;
		padding: 0.75rem 0.8rem;
	}
	.table-block {
		min-width: 0;
	}
	h4 {
		margin: 0 0 0.35rem;
		font-size: 0.72rem;
	}
	.table-wrap {
		max-width: 100%;
		max-height: 21rem;
		overflow: auto;
		border: 1px solid var(--rm-rule);
		border-radius: 0.35rem;
		overscroll-behavior: contain;
	}
	.table-wrap:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--rm-focus);
		outline-offset: 2px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font: 0.6875rem var(--rm-mono);
		font-variant-numeric: tabular-nums;
	}
	caption {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	th,
	td {
		border-right: 1px solid var(--rm-rule);
		border-bottom: 1px solid var(--rm-rule);
		padding: 0.38rem 0.45rem;
		text-align: right;
		white-space: nowrap;
	}
	thead th {
		position: sticky;
		z-index: 2;
		top: 0;
		background: var(--rm-surface);
		color: var(--rm-muted);
		font-size: 0.6875rem;
		text-transform: uppercase;
	}
	thead th:first-child,
	tbody th {
		position: sticky;
		z-index: 1;
		left: 0;
		background: var(--rm-surface);
		text-align: left;
	}
	thead th:first-child {
		z-index: 3;
	}
	.warnings {
		margin: 0 0.8rem 0.8rem;
		border-left: 3px solid var(--rm-warning);
		background: color-mix(in srgb, var(--rm-warning) 6%, var(--rm-paper));
		padding: 0.6rem 0.7rem;
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.warnings ul {
		margin: 0.3rem 0 0;
		padding-left: 1.15rem;
	}
	@media (max-width: 68rem) {
		.tables-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 48rem) {
		.stat-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.stat-grid > div,
		.stat-grid > div:nth-child(5n),
		.stat-grid > div:nth-last-child(-n + 5) {
			border-right: 1px solid var(--rm-rule);
			border-bottom: 1px solid var(--rm-rule);
		}
		.stat-grid > div:nth-child(even) {
			border-right: 0;
		}
		.stat-grid > div:nth-last-child(-n + 2) {
			border-bottom: 0;
		}
	}
	@media (max-width: 34rem) {
		summary {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.15rem;
		}
		.stat-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.stat-grid > div,
		.stat-grid > div:nth-child(5n),
		.stat-grid > div:nth-child(even) {
			border-right: 0;
			border-bottom: 1px solid var(--rm-rule);
		}
		.stat-grid > div:last-child {
			border-bottom: 0;
		}
	}
	@media (forced-colors: active) {
		.accessible-summary,
		.stat-grid,
		.stat-grid > div,
		.table-wrap,
		th,
		td {
			border-color: CanvasText;
		}
	}
</style>
