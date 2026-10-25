<script lang="ts">
	import type { GenerationResult } from '$lib/synthetic-data-lab/types';
	let {
		result,
		column,
		baseline
	}: { result: GenerationResult | null; column: string; baseline: GenerationResult | null } =
		$props();
	let summary = $derived(result?.stats?.[column]);
	let old = $derived(baseline?.stats?.[column]);
	function number(value: unknown) {
		return typeof value === 'number' && Number.isFinite(value)
			? new Intl.NumberFormat('en', { maximumFractionDigits: 4 }).format(value)
			: '—';
	}
	let measures = $derived([
		{ label: 'Mean', key: 'mean' },
		{ label: 'Std. deviation', key: 'std' },
		{ label: 'Median', key: 'median' },
		{ label: 'Minimum', key: 'min' },
		{ label: 'Maximum', key: 'max' },
		{ label: '5th percentile', key: 'q05' },
		{ label: '95th percentile', key: 'q95' }
	] as const);
	let failures = $derived(result?.validation?.filter((c) => c.status === 'fail') ?? []);
	let warnings = $derived(result?.validation?.filter((c) => c.status === 'warning') ?? []);
</script>

<aside class="summary">
	<div class="panel-head">
		<span>OBSERVED STATISTICS</span><span class="sample-badge">SAMPLE</span>
	</div>
	<h3>{column || 'Choose a column'}</h3>
	<p class="intro">Measured from this generation.</p>
	<div class="measure-list">
		{#each measures as measure}<div class="measure">
				<span>{measure.label}</span>
				<div>
					<strong>{number(summary?.[measure.key])}</strong
					>{#if old && typeof summary?.[measure.key] === 'number' && typeof old[measure.key] === 'number'}<small
							>{Number(summary[measure.key]) - Number(old[measure.key]) >= 0 ? '+' : ''}{number(
								Number(summary[measure.key]) - Number(old[measure.key])
							)}</small
						>{/if}
				</div>
			</div>{/each}
		<div class="measure"><span>Missing</span><strong>{number(summary?.missing ?? 0)}</strong></div>
	</div>
	{#if summary?.theoretical}
		<div class="theoretical">
			<span>POPULATION PARAMETERS</span
			>{#each Object.entries(summary.theoretical) as [key, value]}<div>
					<span>{key.replaceAll('_', ' ')}</span><strong
						>{value === null
							? 'Undefined'
							: typeof value === 'string'
								? value
								: number(value)}</strong
					>
				</div>{/each}
			<p>A sample fluctuates around population values. Some heavy-tail moments are undefined.</p>
		</div>
	{/if}
	<div class:has-errors={failures.length > 0} class="integrity">
		<span class="icon">{failures.length ? '!' : '✓'}</span>
		<div>
			<strong
				>{failures.length
					? `${failures.length} check${failures.length === 1 ? '' : 's'} need attention`
					: result
						? 'Integrity checks passed'
						: 'Waiting for preview'}</strong
			>
			<p>
				{warnings.length
					? `${warnings.length} statistical warning${warnings.length === 1 ? '' : 's'} · see Validate`
					: 'Inspect full diagnostics in Validate.'}
			</p>
		</div>
	</div>
	{#if result}<div class="provenance">
			<span>SEED <strong>{result.config.seed}</strong></span><span
				>ENGINE <strong>{result.engine_version}</strong></span
			><span>RESULT <strong>{result.result_id.slice(0, 8)}</strong></span>
		</div>{/if}
</aside>

<style>
	.summary {
		background: #f8faf5;
		border-left: 1px solid #e0e7df;
		padding: 24px 22px;
		min-width: 0;
	}
	.panel-head {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: center;
		color: #52665b;
		font-size: 9px;
		letter-spacing: 1.1px;
		font-weight: 700;
	}
	.sample-badge {
		border: 1px solid #c9dacf;
		padding: 3px 5px;
		border-radius: 3px;
		font-size: 8px;
		letter-spacing: 0.8px;
		color: #52665b;
	}
	h3 {
		font-size: 20px;
		letter-spacing: -0.6px;
		font-weight: 550;
		color: #243f36;
		margin: 18px 0 4px;
		overflow-wrap: anywhere;
	}
	.intro {
		font-size: 11px;
		color: #52665b;
		margin: 0 0 20px;
	}
	.measure-list {
		display: grid;
		gap: 0;
	}
	.measure {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid #e4eae1;
		padding: 11px 0;
		font-size: 11px;
		color: #52665b;
	}
	.measure strong {
		font-size: 14px;
		color: #2c483d;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.measure > div {
		display: flex;
		align-items: flex-end;
		flex-direction: column;
		gap: 3px;
	}
	.measure small {
		color: #52665b;
		font-size: 9px;
	}
	.theoretical {
		margin-top: 24px;
		font-size: 10px;
		color: #52665b;
	}
	.theoretical > span {
		font-size: 9px;
		letter-spacing: 1px;
		font-weight: 700;
	}
	.theoretical > div {
		display: flex;
		justify-content: space-between;
		padding-top: 10px;
		gap: 10px;
	}
	.theoretical strong {
		text-align: right;
		color: #52665b;
		font-weight: 550;
	}
	.theoretical p {
		font-size: 10px;
		line-height: 1.65;
		color: #52665b;
	}
	.integrity {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-top: 26px;
		padding: 12px;
		background: #eaf2e8;
		border: 1px solid #d5e5d3;
		border-radius: 7px;
	}
	.icon {
		border: 1px solid #91b796;
		border-radius: 50%;
		font-size: 12px;
		color: #52665b;
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}
	.integrity strong {
		font-size: 10px;
		color: #3e6e48;
	}
	.integrity p {
		font-size: 9px;
		line-height: 1.4;
		margin: 3px 0 0;
		color: #52665b;
	}
	.has-errors {
		background: #fbede7;
		border-color: #edcabc;
	}
	.has-errors strong,
	.has-errors .icon {
		color: #52665b;
	}
	.provenance {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 20px;
		font-size: 8px;
		letter-spacing: 0.5px;
		color: #52665b;
	}
	.provenance strong {
		color: #52665b;
		font-weight: 600;
	}
	@media (max-width: 1100px) {
		.summary {
			border-left: 0;
			border-top: 1px solid #e0e7df;
		}
		.measure-list {
			grid-template-columns: repeat(4, 1fr);
			gap: 0 18px;
		}
		.theoretical {
			max-width: 400px;
		}
		.provenance {
			margin-top: 12px;
		}
		.integrity {
			margin-top: 14px;
		}
	}
	@media (max-width: 600px) {
		.measure-list {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
