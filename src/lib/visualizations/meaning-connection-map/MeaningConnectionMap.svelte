<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as d3 from 'd3';
	import type { ConceptNode, ConceptEdge, NodeCategory } from './types';
	import { NODES, EDGES } from './graph-data';
	import {
		connectedMeaningNodeIds,
		createSimulationEdges,
		visibleMeaningNodeIds,
		type SimulationEdge
	} from './simulation';
	import { ownMeaningMapResources } from './lifecycle';
	import { CATEGORY_COLORS, CATEGORY_LABELS, RELATIONSHIP_LABELS } from './types';

	let container: HTMLDivElement;
	let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	let g: d3.Selection<SVGGElement, unknown, null, undefined>;
	let simulation: d3.Simulation<ConceptNode, SimulationEdge>;
	let nodes: ConceptNode[] = $state([]);
	let edges: ConceptEdge[] = $state([]);

	let selectedNode = $state<ConceptNode | null>(null);
	let searchQuery = $state('');
	const activeCategories = new SvelteSet<NodeCategory>(NODES.map((node) => node.category));
	let graphReady = $state(false);
	let navigationInset = $state(72);
	const visibleIds = $derived(visibleMeaningNodeIds(nodes, activeCategories, searchQuery));

	function initGraph() {
		if (!container) return;
		const navigation = document.querySelector<HTMLElement>('.site-header');
		const updateNavigationInset = () => {
			navigationInset = navigation ? Math.max(0, navigation.getBoundingClientRect().bottom) : 0;
		};
		updateNavigationInset();
		const width = Math.max(1, container.clientWidth);
		const height = Math.max(1, container.clientHeight);

		nodes = NODES.map((n) => ({ ...n }));
		edges = [...EDGES];
		const simulationEdges = createSimulationEdges(edges);

		svg = d3
			.select(container)
			.append('svg')
			.attr('width', '100%')
			.attr('height', '100%')
			.attr('viewBox', [0, 0, width, height].join(' '))
			.style('cursor', 'grab');

		// Background
		svg.append('rect').attr('width', width).attr('height', height).attr('fill', '#0f1117');

		// Grid pattern for spatial reference
		const defs = svg.append('defs');
		defs
			.append('pattern')
			.attr('id', 'grid')
			.attr('width', 60)
			.attr('height', 60)
			.attr('patternUnits', 'userSpaceOnUse')
			.append('path')
			.attr('d', 'M 60 0 L 0 0 0 60')
			.attr('fill', 'none')
			.attr('stroke', '#1a1d2e')
			.attr('stroke-width', 0.5);

		svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#grid)');

		// Zoom group
		g = svg.append('g');

		// Zoom behavior
		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.15, 4])
			.on('zoom', (event) => {
				g.attr('transform', event.transform);
			});

		svg.call(zoom);
		// Initial zoom to show the full graph
		svg.call(zoom.transform, d3.zoomIdentity.translate(width * 0.2, height * 0.2).scale(0.6));

		// Initialize simulation
		simulation = d3
			.forceSimulation<ConceptNode>(nodes)
			.force(
				'link',
				d3
					.forceLink<ConceptNode, SimulationEdge>(simulationEdges)
					.id((d) => d.id)
					.distance(180)
					.strength(0.4)
			)
			.force('charge', d3.forceManyBody().strength(-400))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(55));

		// Draw edges
		const link = g
			.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data(simulationEdges)
			.join('line')
			.attr('stroke', '#2a2d3e')
			.attr('stroke-width', 1.2)
			.attr('stroke-opacity', 0.6);

		// Draw nodes
		const node = g
			.append('g')
			.attr('class', 'nodes')
			.selectAll('g')
			.data(nodes)
			.join('g')
			.attr('cursor', 'pointer')
			.attr('role', 'button')
			.attr('aria-label', (d) => d.label)
			.attr('tabindex', 0)
			.on('keydown', (event: KeyboardEvent, d: ConceptNode) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				event.stopPropagation();
				selectNode(d);
			})
			.on('click', (event: MouseEvent, d: ConceptNode) => {
				event.stopPropagation();
				selectNode(d);
			});

		// Node circles
		node
			.append('circle')
			.attr('r', (d: ConceptNode) => 12 + d.level * 5)
			.attr('fill', (d: ConceptNode) => CATEGORY_COLORS[d.category])
			.attr('fill-opacity', 0.85)
			.attr('stroke', (d: ConceptNode) =>
				d3.color(CATEGORY_COLORS[d.category])!.brighter(1.5).toString()
			)
			.attr('stroke-width', 1.5);

		// Node labels
		node
			.append('text')
			.text((d: ConceptNode) => d.label)
			.attr('x', (d: ConceptNode) => 18 + d.level * 5)
			.attr('y', 4)
			.attr('font-family', "'Courier Prime', 'IBM Plex Mono', monospace")
			.attr('font-size', (d: ConceptNode) => 10 + d.level * 1.5 + 'px')
			.attr('fill', '#c8ccd4')
			.attr('font-weight', (d: ConceptNode) => (d.level >= 2 ? 600 : 400));

		// Tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d) => (d.source as ConceptNode).x ?? 0)
				.attr('y1', (d) => (d.source as ConceptNode).y ?? 0)
				.attr('x2', (d) => (d.target as ConceptNode).x ?? 0)
				.attr('y2', (d) => (d.target as ConceptNode).y ?? 0);

			node.attr('transform', (d: ConceptNode) => 'translate(' + d.x + ',' + d.y + ')');
		});

		// Click on background to deselect
		svg.on('click', () => {
			selectedNode = null;
		});

		graphReady = true;
		const resizeObserver = new ResizeObserver(() => {
			svg.attr(
				'viewBox',
				`0 0 ${Math.max(1, container.clientWidth)} ${Math.max(1, container.clientHeight)}`
			);
		});
		resizeObserver.observe(container);
		const navigationObserver = new ResizeObserver(updateNavigationInset);
		if (navigation) navigationObserver.observe(navigation);
		const releaseGraph = ownMeaningMapResources(simulation, svg, () => zoom.on('zoom', null));
		return () => {
			resizeObserver.disconnect();
			navigationObserver.disconnect();
			releaseGraph();
		};
	}

	function selectNode(d: ConceptNode) {
		// A detail-panel link can cross a filtered category. Make that selection explicit.
		activeCategories.add(d.category);
		if (!visibleMeaningNodeIds([d], activeCategories, searchQuery).has(d.id)) searchQuery = '';
		selectedNode = d;
	}

	$effect(() => {
		if (!graphReady) return;
		const visible = visibleIds;
		if (selectedNode && !visible.has(selectedNode.id)) selectedNode = null;
		const selected = selectedNode;
		const connected = selected ? connectedMeaningNodeIds(edges, selected.id) : null;
		// Derive every visual attribute from the same state so filtering and selection cannot
		// restore hidden nodes, leave invisible edges, or strand stale highlights.
		g.selectAll<SVGGElement, ConceptNode>('.nodes g')
			.interrupt()
			.attr('opacity', (n) =>
				!visible.has(n.id) ? 0 : connected && !connected.has(n.id) ? 0.15 : 1
			)
			.attr('pointer-events', (n) => (visible.has(n.id) ? 'auto' : 'none'))
			.attr('tabindex', (n) => (visible.has(n.id) ? 0 : -1))
			.attr('aria-hidden', (n) => (visible.has(n.id) ? null : 'true'))
			.attr('aria-pressed', (n) => String(n.id === selected?.id));
		g.selectAll<SVGLineElement, SimulationEdge>('.links line')
			.interrupt()
			.attr('opacity', (e) =>
				visible.has((e.source as ConceptNode).id) && visible.has((e.target as ConceptNode).id)
					? 1
					: 0
			)
			.attr('stroke-opacity', (e) =>
				!selected
					? 0.6
					: (e.source as ConceptNode).id === selected.id ||
						  (e.target as ConceptNode).id === selected.id
						? 0.9
						: 0.08
			)
			.attr('stroke-width', (e) =>
				selected &&
				((e.source as ConceptNode).id === selected.id ||
					(e.target as ConceptNode).id === selected.id)
					? 2.5
					: 1.2
			)
			.attr('stroke', (e) =>
				selected &&
				((e.source as ConceptNode).id === selected.id ||
					(e.target as ConceptNode).id === selected.id)
					? CATEGORY_COLORS[selected.category]
					: '#2a2d3e'
			);
	});

	function getConnectedEdges(nodeId: string): ConceptEdge[] {
		return edges.filter((e) => e.source === nodeId || e.target === nodeId);
	}

	function getConstituentNodes(node: ConceptNode): ConceptNode[] {
		return node.constituents
			.map((id) => nodes.find((n) => n.id === id))
			.filter(Boolean) as ConceptNode[];
	}

	function toggleCategory(cat: NodeCategory) {
		if (activeCategories.has(cat)) {
			activeCategories.delete(cat);
		} else {
			activeCategories.add(cat);
		}
	}

	onMount(initGraph);
</script>

<div
	class="fixed inset-x-0 bottom-0 flex flex-col overflow-hidden bg-[#0f1117] font-mono"
	style:top={`${navigationInset}px`}
	data-meaning-map
>
	<!-- Top bar -->
	<header
		class="z-10 flex flex-shrink-0 flex-wrap items-center gap-4 border-b border-[#1a1d2e] bg-[#0f1117]/95 px-6 py-3 backdrop-blur-sm"
	>
		<div class="text-sm tracking-wider text-[#6b7280] uppercase">Meaning &amp; Connection Map</div>
		<div class="flex-1"></div>

		<!-- Category filters -->
		<div class="flex flex-wrap gap-1.5">
			{#each Object.entries(CATEGORY_LABELS) as [cat, label] (cat)}
				<button
					class="cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors"
					aria-pressed={activeCategories.has(cat as NodeCategory)}
					style="border-color: {CATEGORY_COLORS[cat as NodeCategory]}40; {activeCategories.has(
						cat as NodeCategory
					)
						? 'background:' +
							CATEGORY_COLORS[cat as NodeCategory] +
							'25; color:' +
							CATEGORY_COLORS[cat as NodeCategory]
						: 'background:transparent; color:#6b7280'}"
					onclick={() => toggleCategory(cat as NodeCategory)}
				>
					{label}
				</button>
			{/each}
		</div>

		<!-- Search -->
		<input
			type="text"
			placeholder="Search concepts..."
			aria-label="Search concepts"
			bind:value={searchQuery}
			class="w-56 rounded border border-[#2a2d3e] bg-[#1a1d2e] px-3 py-1.5 text-xs text-[#c8ccd4] placeholder-[#4b5563] focus:border-[#4a6fa5] focus:outline-none"
		/>
		<span class="text-xs text-[#9ca3af]" role="status"
			>{visibleIds.size} of {nodes.length} concepts shown</span
		>
	</header>

	<div class="relative flex flex-1 overflow-hidden">
		<!-- Main graph canvas -->
		<div bind:this={container} class="flex-1 overflow-hidden"></div>

		<!-- Side panel -->
		{#if selectedNode}
			<aside
				class="absolute inset-y-0 right-0 z-10 flex w-full max-w-96 flex-shrink-0 flex-col gap-4 overflow-y-auto border-1 border-[#1a1d2e] bg-[#13151e] p-5 md:relative md:w-96"
			>
				<button
					class="cursor-pointer self-end text-xs text-[#6b7280] hover:text-[#c8ccd4]"
					onclick={() => {
						selectedNode = null;
					}}
				>
					× Close
				</button>

				<!-- Concept header -->
				<div>
					<div class="mb-2 flex items-center gap-2">
						<span
							class="inline-block h-3 w-3 rounded-full"
							style="background: {CATEGORY_COLORS[selectedNode.category]}"
						></span>
						<span class="text-xs tracking-wider text-[#6b7280] uppercase">
							{CATEGORY_LABELS[selectedNode.category]}
						</span>
						<span class="text-xs text-[#4b5563]">
							Level {selectedNode.level}
						</span>
					</div>
					<h2 class="mb-1 text-lg font-bold text-[#e5e7eb]">
						{selectedNode.label}
					</h2>
				</div>

				<!-- Explanation -->
				<div class="border-t border-[#1a1d2e] pt-3">
					<h3 class="mb-1.5 text-xs tracking-wider text-[#6b7280] uppercase">What It Means</h3>
					<p class="text-sm leading-relaxed text-[#b0b5c0]">
						{selectedNode.explanation}
					</p>
				</div>

				<!-- Example -->
				<div>
					<h3 class="mb-1.5 text-xs tracking-wider text-[#6b7280] uppercase">Concrete Example</h3>
					<p class="text-sm leading-relaxed text-[#9ca3af] italic">
						{selectedNode.example}
					</p>
				</div>

				<!-- Significance -->
				<div>
					<h3 class="mb-1.5 text-xs tracking-wider text-[#6b7280] uppercase">Why It Matters</h3>
					<p class="text-sm leading-relaxed text-[#b0b5c0]">
						{selectedNode.significance}
					</p>
				</div>

				<!-- Constituents -->
				{#if getConstituentNodes(selectedNode).length > 0}
					<div class="border-t border-[#1a1d2e] pt-3">
						<h3 class="mb-2 text-xs tracking-wider text-[#6b7280] uppercase">Made Of</h3>
						<div class="flex flex-col gap-1">
							{#each getConstituentNodes(selectedNode) as child (child.id)}
								<button
									class="flex cursor-pointer items-center gap-1.5 text-left text-xs text-[#c8ccd4] hover:text-white hover:underline"
									onclick={() => selectNode(child)}
								>
									<span class="text-[#4b5563]">→</span>
									{child.label}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Connections -->
				{#if getConnectedEdges(selectedNode.id).length > 0}
					<div class="border-t border-[#1a1d2e] pt-3">
						<h3 class="mb-2 text-xs tracking-wider text-[#6b7280] uppercase">Connections</h3>
						<div class="flex flex-col gap-2">
							{#each getConnectedEdges(selectedNode.id) as edge (`${edge.source}:${edge.target}:${edge.relationship}`)}
								{@const otherId = edge.source === selectedNode.id ? edge.target : edge.source}
								{@const otherNode = nodes.find((n) => n.id === otherId)}
								{#if otherNode}
									<div class="rounded bg-[#1a1d2e] p-2 text-xs">
										<div class="mb-1 flex items-center gap-1.5">
											<span class="text-[10px] tracking-wider text-[#9abce9] uppercase">
												{nodes.find((n) => n.id === edge.source)?.label}
												{RELATIONSHIP_LABELS[edge.relationship]}
												{nodes.find((n) => n.id === edge.target)?.label}
											</span>
											<span class="text-[#4b5563]">→</span>
											<button
												class="cursor-pointer text-left text-[#c8ccd4] hover:text-white hover:underline"
												onclick={() => selectNode(otherNode)}
											>
												{otherNode.label}
											</button>
										</div>
										<p class="leading-relaxed text-[#9ca3af]">
											{edge.explanation}
										</p>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			</aside>
		{:else}
			<!-- Empty state -->
			<div class="absolute bottom-8 left-8 max-w-sm text-xs text-[#4b5563]">
				<p class="mb-1">
					Click any node to explore what it means, how it connects, and what it's made of.
				</p>
				<p>Scroll to zoom · Drag to pan · Use category filters above to explore domains.</p>
			</div>
		{/if}
	</div>
</div>

<style>
	:global([data-meaning-map] .nodes g:focus-visible) {
		outline: none;
	}
	:global([data-meaning-map] .nodes g:focus-visible circle) {
		stroke: #ffffff;
		stroke-width: 4;
	}
</style>
