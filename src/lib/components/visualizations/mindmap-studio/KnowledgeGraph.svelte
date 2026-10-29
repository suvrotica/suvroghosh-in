<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { StudioProject } from '$lib/visualizations/mindmap-studio/types';
	import {
		layoutKnowledgeGraph,
		graphConnection,
		graphSvg,
		downloadCanvasBlob,
		downloadSvgPng,
		canvasFilename,
		type CanvasCommand,
		type GraphNode
	} from '$lib/visualizations/mindmap-studio/render';

	let {
		project,
		selectedId = null,
		onselect,
		command,
		onerror,
		onedgeselect
	}: {
		project: StudioProject;
		selectedId?: string | null;
		onselect: (id: string) => void;
		command?: CanvasCommand;
		onerror?: (message: string) => void;
		onedgeselect?: (id: string) => void;
	} = $props();
	const componentId = $props.id();
	const uid = componentId.replaceAll(':', '');
	let svg: SVGSVGElement;
	let status = $state('all');
	let relationship = $state('all');
	let source = $state('all');
	let neighbourhood = $state(false);
	let showHierarchy = $state(true);
	let dragging = $state(false);
	let exporting = $state(false);
	let positions = $state<Record<string, { x: number; y: number }>>({});
	let viewport = $state({ x: 0, y: 0, width: 1600, height: 1100 });
	let dragNode: string | null = null;
	let moved = false;
	const pointers = new SvelteMap<number, { x: number; y: number }>();
	let lastPinch = 0;
	let seenCommand = 0;
	let lastProjectId = '';
	const signature = $derived(
		JSON.stringify([
			project.id,
			project.theme,
			project.nodes.map(({ id, parentId, label, category, status, color, evidence, reviewed }) => [
				id,
				parentId,
				label,
				category,
				status,
				color,
				reviewed,
				evidence.map((item) => item.sourceId)
			]),
			project.edges.map(({ id, from, to, type, status }) => [id, from, to, type, status])
		])
	);
	const layout = $derived.by(() => {
		void signature;
		return untrack(() => layoutKnowledgeGraph(project));
	});
	const nodes = $derived(layout.nodes.map((node) => ({ ...node, ...(positions[node.id] ?? {}) })));
	const nodeLookup = $derived(new Map(nodes.map((node) => [node.id, node])));
	const relationships = $derived([...new Set(project.edges.map((edge) => edge.type))].sort());
	const adjacent = $derived.by(() => {
		const ids = new SvelteSet<string>(selectedId ? [selectedId] : []);
		for (const link of layout.links) {
			if (link.from === selectedId) ids.add(link.to);
			if (link.to === selectedId) ids.add(link.from);
		}
		return ids;
	});
	const visibleNodes = $derived(
		nodes.filter(
			(node) =>
				(status === 'all' || node.node.status === status) &&
				(source === 'all' || node.node.evidence.some((item) => item.sourceId === source)) &&
				(!neighbourhood || !selectedId || adjacent.has(node.id))
		)
	);
	const visibleIds = $derived(new Set(visibleNodes.map((node) => node.id)));
	const visibleLinks = $derived(
		layout.links.filter(
			(link) =>
				visibleIds.has(link.from) &&
				visibleIds.has(link.to) &&
				(link.semantic
					? relationship === 'all' || link.edge?.type === relationship
					: showHierarchy) &&
				(status === 'all' || link.status === status)
		)
	);
	const viewBox = $derived(`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`);
	const dark = $derived(project.theme === 'night');

	$effect(() => {
		const id = project.id;
		void layout;
		if (id !== lastProjectId) {
			lastProjectId = id;
			positions = {};
			untrack(() => fit(true));
		}
	});
	$effect(() => {
		if (!command || command.serial === seenCommand) return;
		seenCommand = command.serial;
		const action = command.type;
		untrack(() => {
			if (action === 'fit') fit();
			else if (action === 'zoom-in') zoom(1.2);
			else if (action === 'zoom-out') zoom(1 / 1.2);
			else void exportGraph(action === 'export-png' ? 'png' : 'svg');
		});
	});

	function fit(initial = false) {
		const current = visibleNodes;
		if (!current.length) return;
		const x = Math.min(...current.map((node) => node.x - node.width / 2)) - 70;
		const y = Math.min(...current.map((node) => node.y - node.height / 2)) - 70;
		viewport = {
			x,
			y,
			width: Math.max(...current.map((node) => node.x + node.width / 2)) + 70 - x,
			height: Math.max(...current.map((node) => node.y + node.height / 2)) + 70 - y
		};
		if (initial && svg && svg.clientWidth > 0 && svg.clientWidth < 600) {
			const centre = current.find((node) => node.id === project.rootId) ?? current[0];
			const width = Math.min(viewport.width, svg.clientWidth / 0.65);
			const height = Math.min(viewport.height, svg.clientHeight / 0.65);
			viewport = { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
		}
	}
	function zoom(factor: number, point?: { x: number; y: number }) {
		const width = Math.max(300, Math.min(12_000, viewport.width / factor));
		const ratio = width / viewport.width;
		const anchor = point ?? {
			x: viewport.x + viewport.width / 2,
			y: viewport.y + viewport.height / 2
		};
		viewport = {
			x: anchor.x - (anchor.x - viewport.x) * ratio,
			y: anchor.y - (anchor.y - viewport.y) * ratio,
			width,
			height: viewport.height * ratio
		};
	}
	function svgPoint(event: { clientX: number; clientY: number }) {
		const matrix = svg.getScreenCTM();
		return matrix
			? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
			: { x: 0, y: 0 };
	}
	function pointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		const element = (event.target as Element).closest('[data-node]');
		dragNode = element?.getAttribute('data-node') ?? null;
		if ((event.target as Element).closest('[data-edge]')) return;
		moved = false;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) {
			dragNode = null;
			const [a, b] = [...pointers.values()];
			lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
		}
		dragging = true;
		svg.setPointerCapture(event.pointerId);
	}
	function pointerMove(event: PointerEvent) {
		const previous = pointers.get(event.pointerId);
		if (!previous) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const distance = Math.hypot(a.x - b.x, a.y - b.y);
			if (lastPinch) zoom(distance / lastPinch);
			lastPinch = distance;
			moved = true;
			return;
		}
		const point = svgPoint(event);
		const before = svgPoint({ clientX: previous.x, clientY: previous.y });
		const dx = point.x - before.x,
			dy = point.y - before.y;
		if (Math.abs(event.clientX - previous.x) + Math.abs(event.clientY - previous.y) > 2)
			moved = true;
		if (dragNode) {
			const node = nodeLookup.get(dragNode);
			if (node) positions = { ...positions, [dragNode]: { x: node.x + dx, y: node.y + dy } };
		} else viewport = { ...viewport, x: viewport.x - dx, y: viewport.y - dy };
	}
	function pointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (!pointers.size) {
			if (dragNode && !moved) onselect(dragNode);
			dragging = false;
			dragNode = null;
			lastPinch = 0;
		}
		if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
	}
	function keyboard(event: KeyboardEvent) {
		if ((event.target as Element).closest('[data-node], [data-edge]')) return;
		const step = viewport.width / 16;
		if (event.key === 'ArrowLeft') viewport = { ...viewport, x: viewport.x - step };
		else if (event.key === 'ArrowRight') viewport = { ...viewport, x: viewport.x + step };
		else if (event.key === 'ArrowUp') viewport = { ...viewport, y: viewport.y - step };
		else if (event.key === 'ArrowDown') viewport = { ...viewport, y: viewport.y + step };
		else if (event.key === '+' || event.key === '=') zoom(1.2);
		else if (event.key === '-') zoom(1 / 1.2);
		else if (event.key === '0') fit();
		else return;
		event.preventDefault();
	}
	async function exportGraph(format: 'png' | 'svg') {
		if (exporting) return;
		exporting = true;
		try {
			const markup = graphSvg(project, { ...layout, nodes });
			const filename = canvasFilename(project.title, `knowledge-graph.${format}`);
			if (format === 'svg')
				downloadCanvasBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), filename);
			else await downloadSvgPng(markup, filename);
		} catch (error) {
			onerror?.(error instanceof Error ? error.message : 'Graph export failed.');
		} finally {
			exporting = false;
		}
	}
	function nodeClass(item: GraphNode) {
		return item.id === selectedId
			? 'is-selected'
			: selectedId && !adjacent.has(item.id)
				? 'is-distant'
				: '';
	}
</script>

<div class="studio-graph" class:night={dark} data-testid="studio-knowledge-graph">
	<div class="graph-filters">
		<label
			><span>Evidence</span><select aria-label="Filter graph evidence" bind:value={status}
				><option value="all">All statuses</option><option value="explicit">Explicit</option><option
					value="inferred">Inferred</option
				><option value="speculative">Speculative</option></select
			></label
		>
		<label
			><span>Relation</span><select
				aria-label="Filter graph relationships"
				bind:value={relationship}
				><option value="all">All relationships</option>{#each relationships as type (type)}<option
						value={type}>{type.replaceAll('_', ' ')}</option
					>{/each}</select
			></label
		>
		{#if project.sources.length > 1}<label
				><span>Source</span><select aria-label="Filter graph source" bind:value={source}
					><option value="all">All sources</option>{#each project.sources as item (item.id)}<option
							value={item.id}>{item.title}</option
						>{/each}</select
				></label
			>{/if}
		<label class="check"
			><input type="checkbox" bind:checked={showHierarchy} /> Topic structure</label
		>
		<button
			type="button"
			class:active={neighbourhood}
			aria-pressed={neighbourhood}
			disabled={!selectedId}
			onclick={() => {
				neighbourhood = !neighbourhood;
			}}>Neighbourhood</button
		>
	</div>
	<div class="graph-stage">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The application viewport provides arrow-key panning and explicit node buttons.) -->
		<svg
			bind:this={svg}
			{viewBox}
			role="application"
			tabindex="0"
			aria-label="Knowledge graph. Drag the background to pan. Use plus and minus to zoom, zero to fit. Tab to a concept or relationship and press Enter to inspect it."
			class:dragging
			onpointerdown={pointerDown}
			onpointermove={pointerMove}
			onpointerup={pointerUp}
			onpointercancel={pointerUp}
			onkeydown={keyboard}
			onwheel={(event) => {
				event.preventDefault();
				if (event.ctrlKey || event.metaKey) zoom(Math.exp(-event.deltaY * 0.005), svgPoint(event));
				else
					viewport = {
						...viewport,
						x: viewport.x + (event.deltaX * viewport.width) / svg.clientWidth,
						y: viewport.y + (event.deltaY * viewport.height) / svg.clientHeight
					};
			}}
		>
			<title>{project.title} — knowledge graph</title>
			<desc
				>Coloured cards share a theme. Thin grey lines show topic structure. Labelled arrows show
				relationships: solid is explicit, dashed is inferred, dotted is speculative.</desc
			>
			<defs>
				<pattern id={`${uid}-grid`} width="32" height="32" patternUnits="userSpaceOnUse"
					><circle cx="1" cy="1" r="0.8" fill={dark ? '#405047' : '#d8d1c1'} /></pattern
				>
				<marker
					id={`${uid}-arrow`}
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill={dark ? '#bbc8bd' : '#7d8279'} /></marker
				>
			</defs>
			<rect
				x={viewport.x}
				y={viewport.y}
				width={viewport.width}
				height={viewport.height}
				fill={`url(#${uid}-grid)`}
			/>
			{#each visibleLinks as link (link.id)}
				{@const from = nodeLookup.get(link.from)!}
				{@const to = nodeLookup.get(link.to)!}
				{@const geometry = graphConnection(from, to, link.semantic)}
				<g
					class="graph-link"
					class:semantic={link.semantic}
					class:muted={selectedId !== null && link.from !== selectedId && link.to !== selectedId}
				>
					<path
						d={geometry.path}
						stroke={link.semantic ? from.colour : dark ? '#536157' : '#cec8ba'}
						stroke-width={link.semantic ? 2 : 1.4}
						fill="none"
						marker-end={link.semantic ? `url(#${uid}-arrow)` : undefined}
						stroke-dasharray={link.status === 'inferred'
							? '7 5'
							: link.status === 'speculative'
								? '2 5'
								: undefined}
					/>
					{#if link.semantic}
						<g
							data-edge={link.id}
							class="relation-label"
							role="button"
							tabindex="0"
							aria-label={`${from.node.label} ${link.label} ${to.node.label}. ${link.status}. Inspect relationship.`}
							onclick={() => onedgeselect?.(link.id)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									onedgeselect?.(link.id);
								}
							}}
						>
							<rect
								x={geometry.x - link.label.length * 3.6 - 8}
								y={geometry.y - 11}
								width={link.label.length * 7.2 + 16}
								height="22"
								rx="7"
							/>
							<text x={geometry.x} y={geometry.y + 4} text-anchor="middle">{link.label}</text>
						</g>
					{/if}
				</g>
			{/each}
			{#each visibleNodes as item (item.id)}
				<g
					class={`graph-node ${nodeClass(item)}`}
					class:root={item.id === project.rootId}
					transform={`translate(${item.x - item.width / 2} ${item.y - item.height / 2})`}
					data-node={item.id}
					role="button"
					tabindex="0"
					aria-pressed={item.id === selectedId}
					aria-label={`${item.node.label}. ${item.node.category}. ${item.node.status}. Inspect concept.`}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							onselect(item.id);
						}
					}}
				>
					<rect
						class="node-shadow"
						y="4"
						width={item.width}
						height={item.height}
						rx={item.id === project.rootId ? 18 : 12}
					/>
					<rect
						class="node-card"
						width={item.width}
						height={item.height}
						rx={item.id === project.rootId ? 18 : 12}
						stroke={item.colour}
						stroke-dasharray={item.node.status === 'inferred'
							? '6 4'
							: item.node.status === 'speculative'
								? '2 4'
								: undefined}
					/>
					<rect x="0" y="17" width="3" height={item.height - 34} rx="1.5" fill={item.colour} />
					<text class="node-category" x="16" y="20"
						>{item.id === project.rootId
							? 'CENTRAL IDEA'
							: item.node.category.toUpperCase().slice(0, 24)}</text
					>
					{#each item.lines as line, index (index)}<text
							class="node-label"
							x="16"
							y={42 + index * 21}>{line}</text
						>{/each}
					{#if item.node.reviewed}<circle cx={item.width - 13} cy="15" r="3" fill={item.colour}
							><title>Reviewed</title></circle
						>{/if}
				</g>
			{/each}
		</svg>
		{#if !visibleNodes.length}<div class="graph-empty">
				No concepts match these filters. Choose another evidence status or source.
			</div>{/if}
		<div class="graph-note" aria-live="polite">
			{exporting
				? 'Preparing image…'
				: `${visibleNodes.length} concepts · ${visibleLinks.filter((link) => link.semantic).length} relationships`}
		</div>
		<div class="graph-navigation" aria-label="Graph navigation">
			<button type="button" aria-label="Zoom graph out" onclick={() => zoom(1 / 1.2)}>−</button
			><button type="button" onclick={() => fit()}>Fit graph</button><button
				type="button"
				aria-label="Zoom graph in"
				onclick={() => zoom(1.2)}>+</button
			>
		</div>
	</div>
</div>

<style>
	.studio-graph {
		--g-paper: #f7f2e7;
		--g-surface: #fdfaf3;
		--g-ink: #2b241c;
		--g-muted: #655e52;
		--g-rule: #ded7c9;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 600px;
		color: var(--g-ink);
		background: var(--g-paper);
	}
	.studio-graph.night {
		--g-paper: #202724;
		--g-surface: #29342f;
		--g-ink: #f2ecdf;
		--g-muted: #c1c6bc;
		--g-rule: #46534b;
	}
	.graph-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--g-rule);
		background: var(--g-surface);
		font: 12px var(--font-sans, sans-serif);
	}
	.graph-filters label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.graph-filters label > span {
		color: var(--g-muted);
	}
	.graph-filters select {
		max-width: 160px;
		border: 1px solid var(--g-rule);
		border-radius: 7px;
		padding: 7px 24px 7px 8px;
		font: inherit;
		background: var(--g-paper);
		color: inherit;
	}
	.graph-filters .check {
		margin-left: auto;
	}
	.check input {
		accent-color: #46775f;
		width: 15px;
		height: 15px;
	}
	button {
		color: inherit;
		font: inherit;
		cursor: pointer;
		border: 1px solid var(--g-rule);
		background: var(--g-surface);
		border-radius: 7px;
		padding: 8px 10px;
	}
	button:hover,
	button.active {
		background: var(--g-paper);
		border-color: #6c8a75;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 2px solid #548065;
		outline-offset: 3px;
	}
	.graph-stage {
		position: relative;
		flex: 1;
		min-height: 530px;
		overflow: hidden;
	}
	svg {
		width: 100%;
		height: 100%;
		min-height: 530px;
		display: block;
		position: absolute;
		inset: 0;
		touch-action: none;
		user-select: none;
		cursor: grab;
	}
	svg.dragging {
		cursor: grabbing;
	}
	svg:focus-visible {
		outline: 2px solid #548065;
		outline-offset: -4px;
	}
	.graph-node {
		cursor: grab;
		outline: none;
	}
	.graph-node.is-distant {
		opacity: 0.78;
	}
	.node-shadow {
		fill: #1c30200b;
	}
	.node-card {
		fill: var(--g-surface);
		stroke-width: 1.3;
	}
	.graph-node.root .node-card {
		fill: #355f50;
		stroke-width: 2;
	}
	.night .graph-node.root .node-card {
		fill: #436e5c;
	}
	.graph-node.is-selected .node-card,
	.graph-node:focus-visible .node-card {
		stroke-width: 3;
		filter: drop-shadow(0 0 6px #47775a33);
	}
	.graph-node:hover .node-card {
		stroke-width: 2;
	}
	.node-category {
		fill: var(--g-muted);
		font: 10px var(--font-sans, Arial, sans-serif);
		letter-spacing: 1.2px;
	}
	.node-label {
		fill: var(--g-ink);
		font: 500 16px var(--font-sans, Arial, sans-serif);
	}
	.root .node-label {
		fill: #fffaf0;
		font-weight: 600;
	}
	.root .node-category {
		fill: #e4eee6;
	}
	.graph-link.muted {
		opacity: 0.65;
	}
	.relation-label {
		cursor: pointer;
		outline: none;
	}
	.relation-label rect {
		fill: var(--g-paper);
	}
	.relation-label text {
		fill: var(--g-muted);
		font: 12px var(--font-sans, Arial, sans-serif);
	}
	.relation-label:hover rect,
	.relation-label:focus-visible rect {
		stroke: #68806f;
		stroke-width: 1.5;
	}
	.graph-note {
		position: absolute;
		bottom: 16px;
		left: 16px;
		color: var(--g-muted);
		font: 11px var(--font-mono, monospace);
		background: var(--g-paper);
		padding: 6px 8px;
		border-radius: 5px;
		pointer-events: none;
	}
	.graph-navigation {
		position: absolute;
		right: 16px;
		bottom: 16px;
		display: flex;
		gap: 5px;
		font: 12px var(--font-sans, sans-serif);
	}
	.graph-navigation button:first-child,
	.graph-navigation button:last-child {
		min-width: 36px;
		font-size: 18px;
		line-height: 1;
	}
	.graph-empty {
		position: absolute;
		top: 40%;
		left: 15%;
		right: 15%;
		text-align: center;
		padding: 20px;
		background: var(--g-surface);
		border: 1px solid var(--g-rule);
		border-radius: 12px;
		font: 15px/1.5 var(--font-sans, sans-serif);
	}
	@media (max-width: 600px) {
		.studio-graph {
			min-height: 580px;
		}
		.graph-filters {
			gap: 8px;
			padding: 10px;
		}
		.graph-filters label > span {
			display: none;
		}
		.graph-filters .check {
			margin-left: 0;
			font-size: 11px;
		}
		.graph-filters select {
			max-width: 135px;
		}
		.graph-stage,
		svg {
			min-height: 460px;
		}
		.graph-note {
			bottom: 62px;
			left: 8px;
		}
		.graph-navigation {
			right: 10px;
			bottom: 12px;
		}
		.graph-navigation button {
			min-height: 44px;
		}
	}
	@media (prefers-contrast: more) {
		.graph-node.is-distant,
		.graph-link.muted {
			opacity: 0.85;
		}
		.node-card {
			stroke-width: 2;
		}
	}
	:global([data-theme='high-contrast']) .studio-graph {
		--g-paper: #fff;
		--g-surface: #fff;
		--g-ink: #000;
		--g-muted: #222;
		--g-rule: #000;
	}
	:global([data-theme='high-contrast']) .graph-node.is-distant,
	:global([data-theme='high-contrast']) .graph-link.muted {
		opacity: 1;
	}
	:global([data-theme='high-contrast']) .node-card {
		stroke: #000;
		stroke-width: 2;
	}
</style>
