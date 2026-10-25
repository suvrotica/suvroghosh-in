<script lang="ts">
	import type { Diagram } from '$lib/visualizations/prompt-atlas/types';
	import { edgeLabelPoint, edgePath, nodeFill } from '$lib/visualizations/prompt-atlas/export';
	import { wrapLabel } from '$lib/visualizations/prompt-atlas/projection';

	let {
		diagram,
		selectedId,
		onselect,
		oncollapse
	}: {
		diagram: Diagram;
		selectedId?: string;
		onselect?: (id: string) => void;
		oncollapse?: (id: string) => void;
	} = $props();
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let dragging = $state(false);
	let lastPointer = { x: 0, y: 0 };
	let svg: SVGSVGElement;
	const markerId = $props.id();
	let viewBox = $derived(`${panX} ${panY} ${diagram.width / zoom} ${diagram.height / zoom}`);
	let viewKey = $derived(`${diagram.model}:${diagram.width}:${diagram.height}`);
	$effect(() => {
		void viewKey;
		zoom = 1;
		panX = 0;
		panY = 0;
	});

	function reset() {
		zoom = 1;
		panX = 0;
		panY = 0;
	}
	function changeZoom(amount: number) {
		const maximum = Math.max(6, Math.min(50, diagram.height / 350));
		const next = Math.max(0.5, Math.min(maximum, zoom * amount));
		panX += diagram.width / zoom / 2 - diagram.width / next / 2;
		panY += diagram.height / zoom / 2 - diagram.height / next / 2;
		zoom = next;
	}
	function pointerDown(event: PointerEvent) {
		if ((event.target as Element).closest('[data-atlas-select]')) return;
		dragging = true;
		lastPointer = { x: event.clientX, y: event.clientY };
		svg.setPointerCapture(event.pointerId);
	}
	function pointerMove(event: PointerEvent) {
		if (!dragging) return;
		const bounds = svg.getBoundingClientRect();
		const ratio = Math.max(
			diagram.width / zoom / bounds.width,
			diagram.height / zoom / bounds.height
		);
		panX -= (event.clientX - lastPointer.x) * ratio;
		panY -= (event.clientY - lastPointer.y) * ratio;
		lastPointer = { x: event.clientX, y: event.clientY };
	}
	function select(id: string, sourceId?: string) {
		if (id.startsWith('group:')) oncollapse?.(id);
		else if (sourceId) onselect?.(sourceId);
	}
	function keyboard(event: KeyboardEvent) {
		if ((event.target as Element).closest('[data-atlas-select]')) return;
		const step = 40 / zoom;
		if (event.key === 'ArrowLeft') panX -= step;
		else if (event.key === 'ArrowRight') panX += step;
		else if (event.key === 'ArrowUp') panY -= step;
		else if (event.key === 'ArrowDown') panY += step;
		else if (event.key === '+' || event.key === '=') changeZoom(1.2);
		else if (event.key === '-') changeZoom(1 / 1.2);
		else if (event.key === '0') reset();
		else return;
		event.preventDefault();
	}
</script>

<div class="atlas-diagram" data-testid="atlas-diagram" data-model={diagram.model}>
	<div class="diagram-toolbar">
		<span>{diagram.title}</span>
		<div class="zoom-controls" aria-label="Diagram view controls">
			<button type="button" onclick={() => changeZoom(1 / 1.2)} aria-label="Zoom out">−</button>
			<output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
			<button type="button" onclick={() => changeZoom(1.2)} aria-label="Zoom in">+</button>
			<button type="button" onclick={reset}>Fit to view</button>
		</div>
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (This interactive SVG implements the documented keyboard pan/zoom controls and focusable nodes.) -->
	<svg
		bind:this={svg}
		{viewBox}
		class:dragging
		role="application"
		tabindex="0"
		aria-label={`${diagram.title}. Use arrow keys to pan, plus and minus to zoom, zero to fit. Tab to inspect items.`}
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={() => (dragging = false)}
		onpointercancel={() => (dragging = false)}
		onkeydown={keyboard}
	>
		<title>{diagram.title}</title>
		<desc
			>Solid outlines show explicit information, dashed outlines show inferences, and thick purple
			outlines show user-confirmed information.</desc
		>
		<defs>
			<marker
				id={markerId}
				markerWidth="8"
				markerHeight="8"
				refX="7"
				refY="4"
				orient="auto"
				markerUnits="strokeWidth"><path d="M0 0 L8 4 L0 8 Z" fill="#79918a" /></marker
			>
		</defs>
		{#each diagram.nodes.filter((node) => node.kind === 'boundary') as boundary (boundary.id)}
			<rect
				class="system-boundary"
				x={boundary.x}
				y={boundary.y}
				width={boundary.width}
				height={boundary.height}
				rx="10"
			/>
			<text class="boundary-label" x={boundary.x + 16} y={boundary.y + 28}>{boundary.label}</text>
		{/each}
		{#if diagram.model === 'sequence'}
			{#each diagram.nodes as participant (participant.id)}
				<path
					class="lifeline"
					d={`M${participant.x + participant.width / 2} ${participant.y + participant.height} V${diagram.height - 30}`}
				/>
			{/each}
		{/if}
		{#each diagram.edges as edge (edge.id)}
			{@const point = edgeLabelPoint(edge)}
			<g
				class="edge-selection"
				data-atlas-select={edge.id}
				role="button"
				tabindex={edge.sourceId ? 0 : -1}
				aria-label={`${edge.label || 'Branch connection'}. ${edge.provenance}. Activate to inspect the source.`}
				onclick={() => edge.sourceId && onselect?.(edge.sourceId)}
				onkeydown={(event) => {
					if ((event.key === 'Enter' || event.key === ' ') && edge.sourceId) {
						event.preventDefault();
						onselect?.(edge.sourceId);
					}
				}}
			>
				<path
					class="relation"
					class:inferred={edge.provenance === 'inferred'}
					class:confirmed={edge.provenance === 'user-confirmed'}
					class:chosen={selectedId === edge.sourceId}
					d={edgePath(edge, diagram.model)}
					marker-end={['mindmap', 'usecase'].includes(diagram.model)
						? undefined
						: `url(#${markerId})`}
				/>
				{#if edge.sourceId}<path class="relation-hit-area" d={edgePath(edge, diagram.model)} />{/if}
				{#if edge.label}
					<text class="edge-label" x={point.x} y={point.y} text-anchor="middle"
						>{#each wrapLabel(edge.label, 38) as label, index}<tspan x={point.x} dy={index ? 15 : 0}
								>{label}</tspan
							>{/each}</text
					>
				{/if}
			</g>
		{/each}
		{#each diagram.nodes.filter((node) => node.kind !== 'boundary') as node (node.id)}
			{@const labels = wrapLabel(node.label)}
			{@const labelY =
				node.shape === 'actor'
					? node.y + 100
					: node.lines?.length
						? node.y + 24
						: node.y + node.height / 2 - ((labels.length - 1) * 17) / 2 + 4}
			<g
				class="ontology-node"
				class:inferred={node.provenance === 'inferred'}
				class:confirmed={node.provenance === 'user-confirmed'}
				class:chosen={selectedId === node.sourceId}
				class:root={node.kind === 'root'}
				data-atlas-select={node.id}
				role="button"
				tabindex={node.sourceId || node.id.startsWith('group:') ? 0 : -1}
				aria-label={`${node.label}. ${node.provenance}.${node.id.startsWith('group:') ? ' Activate to collapse or expand this branch.' : ' Activate to inspect the source.'}`}
				onclick={() => select(node.id, node.sourceId)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						select(node.id, node.sourceId);
					}
				}}
			>
				<title>{node.label} · {node.provenance}</title>
				{#if node.shape === 'diamond'}
					<polygon
						fill={nodeFill(node)}
						points={`${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width / 2},${node.y + node.height} ${node.x},${node.y + node.height / 2}`}
					/>
				{:else if node.shape === 'ellipse'}
					<ellipse
						fill={nodeFill(node)}
						cx={node.x + node.width / 2}
						cy={node.y + node.height / 2}
						rx={node.width / 2}
						ry={node.height / 2}
					/>
				{:else if node.shape === 'actor'}
					<circle cx={node.x + node.width / 2} cy={node.y + 15} r="12" fill="none" />
					<path
						class="actor-body"
						d={`M${node.x + node.width / 2} ${node.y + 27} v30 m-23 -16 h46 m-23 16 l-20 25 m20 -25 l20 25`}
					/>
				{:else}
					<rect
						fill={nodeFill(node)}
						x={node.x}
						y={node.y}
						width={node.width}
						height={node.height}
						rx={node.shape === 'rounded' ? 16 : 5}
					/>
				{/if}
				<text class="node-label" x={node.x + node.width / 2} y={labelY} text-anchor="middle">
					{#each labels as label, index}<tspan x={node.x + node.width / 2} dy={index ? 17 : 0}
							>{label}</tspan
						>{/each}
				</text>
				{#if node.lines?.length}
					{@const dividerY = node.y + 32 + (labels.length - 1) * 17}
					<path class="compartment" d={`M${node.x} ${dividerY} h${node.width}`} />
					{#each node.lines as line, index}<text
							class="attribute-label"
							x={node.x + 12}
							y={dividerY + 23 + index * 18}>{line}</text
						>{/each}
				{/if}
			</g>
		{/each}
	</svg>
	<p class="diagram-hint">
		Drag the background to pan. Use the zoom controls or focus the drawing for keyboard controls.
	</p>
</div>

<style>
	.atlas-diagram {
		overflow: hidden;
		border: 1px solid #cbd2c4;
		border-radius: 14px;
		background: #f4f2ea;
		color: #182e32;
	}
	.diagram-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 13px 16px;
		border-bottom: 1px solid #d8dccf;
		background: #eaece2;
		font-size: 13px;
		font-weight: 700;
	}
	.zoom-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 7px;
	}
	.zoom-controls button {
		min-width: 36px;
		min-height: 36px;
		padding: 6px 9px;
		border: 1px solid #b9c8bd;
		border-radius: 6px;
		background: white;
		color: #182e32;
		font: inherit;
		cursor: pointer;
	}
	.zoom-controls button:focus-visible {
		outline: 3px solid #14635c;
		outline-offset: 2px;
	}
	.zoom-controls output {
		min-width: 42px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	svg {
		display: block;
		width: 100%;
		min-height: 340px;
		height: min(62vh, 620px);
		background-image: radial-gradient(#c8d1c5 0.7px, transparent 0.7px);
		background-size: 18px 18px;
		touch-action: pan-y;
		cursor: grab;
	}
	svg.dragging {
		cursor: grabbing;
	}
	svg:focus-visible {
		outline: 3px solid #14635c;
		outline-offset: -4px;
	}
	.relation {
		fill: none;
		stroke: #79918a;
		stroke-width: 1.7;
	}
	.inferred.relation {
		stroke-dasharray: 6 4;
		stroke: #896131;
	}
	.confirmed.relation {
		stroke: #6753a1;
		stroke-width: 3;
	}
	.relation.chosen {
		stroke: #14635c;
		stroke-width: 3;
	}
	.edge-label {
		fill: #182e32;
		font:
			11px system-ui,
			sans-serif;
		paint-order: stroke;
		stroke: #f4f2ea;
		stroke-width: 5px;
		stroke-linejoin: round;
		pointer-events: none;
	}
	.edge-selection {
		outline: none;
		cursor: pointer;
	}
	.edge-selection:focus-visible .relation {
		stroke: #14635c;
		stroke-width: 3;
	}
	.relation-hit-area {
		fill: none;
		stroke: transparent;
		stroke-width: 14;
	}
	.ontology-node {
		cursor: pointer;
		outline: none;
	}
	.ontology-node :is(rect, polygon, ellipse, circle, path) {
		stroke: #79918a;
		stroke-width: 1.6;
	}
	.ontology-node.inferred :is(rect, polygon, ellipse, circle, path) {
		stroke: #896131;
		stroke-dasharray: 5 4;
	}
	.ontology-node.confirmed :is(rect, polygon, ellipse, circle, path) {
		stroke: #6753a1;
		stroke-width: 3;
	}
	.ontology-node.chosen :is(rect, polygon, ellipse, circle, path),
	.ontology-node:focus-visible :is(rect, polygon, ellipse, circle, path) {
		stroke: #14635c;
		stroke-width: 3;
		filter: drop-shadow(0 2px 3px #182e3222);
	}
	.node-label {
		fill: #182e32;
		font:
			600 12px system-ui,
			sans-serif;
		pointer-events: none;
	}
	.root .node-label {
		fill: white;
	}
	.attribute-label {
		fill: #182e32;
		font:
			11px ui-monospace,
			monospace;
		pointer-events: none;
	}
	.compartment {
		fill: none;
	}
	.actor-body {
		fill: none;
	}
	.lifeline {
		fill: none;
		stroke: #79918a;
		stroke-dasharray: 5 5;
	}
	.system-boundary {
		fill: #eaece2;
		stroke: #79918a;
	}
	.boundary-label {
		fill: #182e32;
		font:
			600 13px system-ui,
			sans-serif;
	}
	.diagram-hint {
		margin: 0;
		padding: 10px 16px 4px;
		font-size: 11px;
		line-height: 1.5;
		color: #536764;
	}
	@media (max-width: 600px) {
		svg {
			height: 390px;
			min-height: 300px;
		}
		.diagram-toolbar {
			padding: 11px;
		}
	}
</style>
