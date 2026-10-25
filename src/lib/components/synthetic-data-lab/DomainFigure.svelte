<script lang="ts">
	import RelationshipChart from './RelationshipChart.svelte';
	import type { GenerationResult } from '$lib/synthetic-data-lab/types';
	let {
		result,
		secondaryData = {}
	}: {
		result: GenerationResult;
		secondaryData?: Record<
			string,
			{
				columns: GenerationResult['columns'];
				rows: Record<string, import('$lib/synthetic-data-lab/types').Cell>[];
				row_count: number;
			}
		>;
	} = $props();
	let type = $derived(result.domain?.type ?? result.config.domain?.type);
	let nodes = $derived(result.rows.filter((r) => r.node_id).slice(0, 300));
	let positions = $derived(
		new Map(
			nodes.map((node, i) => [
				String(node.node_id),
				{
					x:
						350 +
						Math.cos((i / nodes.length) * Math.PI * 2 - Math.PI / 2) *
							Math.min(112 + (i % 7) * 2, 140),
					y:
						153 +
						Math.sin((i / nodes.length) * Math.PI * 2 - Math.PI / 2) *
							Math.min(112 + (i % 7) * 2, 140)
				}
			])
		)
	);
	let edges = $derived(
		(secondaryData.edges?.rows ?? [])
			.filter((e) => positions.has(String(e.source)) && positions.has(String(e.target)))
			.slice(0, 1000)
	);
	let km = $derived(result.domain?.kaplan_meier ?? []);
</script>

{#if type}<div class="domain-figure">
		<div class="figure-title">
			<strong
				>{type === 'survival'
					? 'Survival after censoring'
					: type === 'spatial'
						? 'Clusters in coordinate space'
						: type === 'graph'
							? 'The generated network'
							: type === 'longitudinal'
								? 'Repeated observations'
								: type === 'causal'
									? 'The specified causal mechanism'
									: 'Parent–child structure'}</strong
			><span>{type.toUpperCase()} MODEL</span>
		</div>
		{#if type === 'survival'}<RelationshipChart
				xValues={km.map((p) => p.time)}
				yValues={km.map((p) => p.survival)}
				xName="observed time"
				yName="Kaplan–Meier survival"
				mode="line"
			/>
		{:else if type === 'spatial'}<RelationshipChart
				xValues={result.rows.map((r) => Number(r.spatial_x))}
				yValues={result.rows.map((r) => Number(r.spatial_y))}
				xName="spatial_x"
				yName="spatial_y"
			/>
		{:else if type === 'longitudinal'}<RelationshipChart
				xValues={result.rows.map((r) => Number(r.visit))}
				yValues={result.rows.map((r) => Number(r.measurement))}
				xName="visit"
				yName="measurement"
				colorValues={result.rows.map((r) => r.entity_id)}
			/>
		{:else if type === 'causal'}<RelationshipChart
				xValues={result.rows.map((r) => Number(r.treatment))}
				yValues={result.rows.map((r) => Number(r.response))}
				xName="treatment"
				yName="response"
			/>
		{:else if type === 'relational'}<RelationshipChart
				xValues={result.rows.map((r) => Number(r[result.config.variables[0].name]))}
				yValues={result.rows.map((r) => Number(r.child_count))}
				xName={result.config.variables[0].name}
				yName="child_count"
			/>
		{:else if type === 'graph'}<svg
				viewBox="0 0 700 310"
				role="img"
				aria-label={`Generated network display of ${nodes.length} nodes and ${edges.length} edges. Circular placement is for display only.`}
				><desc
					>Each line is an actual generated edge. Nodes are placed in deterministic circular
					positions for readability, not learned coordinates.</desc
				>{#each edges as edge}{@const a = positions.get(String(edge.source))!}{@const b =
						positions.get(String(edge.target))!}<line
						x1={a.x}
						y1={a.y}
						x2={b.x}
						y2={b.y}
						stroke="#087f80"
						opacity=".07"
						stroke-width=".8"
					/>{/each}{#each nodes as node}{@const p = positions.get(String(node.node_id))!}<circle
						cx={p.x}
						cy={p.y}
						r={Math.min(5, 2 + Number(node.degree ?? 0) / 20)}
						fill="#087f80"
						stroke="#fffef9"
						stroke-width=".6"><title>{node.node_id} · degree {node.degree}</title></circle
					>{/each}<text x="18" y="292" font-size="10" fill="#52665b"
					>{nodes.length} displayed nodes · {edges.length.toLocaleString()} displayed edges · circular
					layout</text
				></svg
			>{/if}
		{#if result.domain?.assumptions?.length}<p>{result.domain.assumptions.join(' · ')}</p>{/if}
	</div>{/if}

<style>
	.domain-figure {
		padding: 17px 15px 12px;
		border: 1px solid #dae7d1;
		background: #f7faf1;
		border-radius: 6px;
		margin-bottom: 23px;
	}
	.figure-title {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		align-items: center;
		margin-bottom: 12px;
	}
	.figure-title strong {
		font-size: 11px;
		font-weight: 550;
		color: #52665b;
	}
	.figure-title span {
		font-size: 8px;
		letter-spacing: 0.8px;
		color: #52665b;
	}
	.domain-figure > p {
		font-size: 9px;
		color: #52665b;
		line-height: 1.7;
		margin: 10px 2px 0;
	}
	.domain-figure > svg {
		display: block;
		width: 100%;
		max-height: 310px;
	}
	@media (max-width: 500px) {
		.domain-figure {
			padding: 12px;
		}
		.figure-title strong {
			font-size: 10px;
		}
		.figure-title span {
			font-size: 7px;
		}
	}
</style>
