<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import type { ConceptNode, ConceptEdge, NodeCategory, RelationshipType } from './types';
  import { NODES, EDGES } from './graph-data';
  import { CATEGORY_COLORS, CATEGORY_LABELS, RELATIONSHIP_LABELS } from './types';

  let container: HTMLDivElement;
  let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  let g: d3.Selection<SVGGElement, unknown, null, undefined>;
  let simulation: d3.Simulation<ConceptNode, ConceptEdge>;
  let nodes: ConceptNode[] = $state([]);
  let edges: ConceptEdge[] = $state([]);

  let selectedNode = $state<ConceptNode | null>(null);
  let searchQuery = $state('');
  let activeCategories = $state<Set<NodeCategory>>(new Set());
  let tooltip = $state<{ x: number; y: number; node: ConceptNode } | null>(null);

  const width = $state(2400);
  const height = $state(1800);

  function initGraph() {
    if (!container) return;

    nodes = NODES.map(n => ({ ...n }));
    edges = [...EDGES];

    // Initialize all categories as active
    for (const n of nodes) activeCategories.add(n.category);

    svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height].join(' '))
      .style('cursor', 'grab');

    // Background
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#0f1117');

    // Grid pattern for spatial reference
    const defs = svg.append('defs');
    defs.append('pattern')
      .attr('id', 'grid')
      .attr('width', 60)
      .attr('height', 60)
      .attr('patternUnits', 'userSpaceOnUse')
      .append('path')
      .attr('d', 'M 60 0 L 0 0 0 60')
      .attr('fill', 'none')
      .attr('stroke', '#1a1d2e')
      .attr('stroke-width', 0.5);

    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#grid)');

    // Zoom group
    g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    // Initial zoom to show the full graph
    svg.call(zoom.transform, d3.zoomIdentity.translate(100, 80).scale(0.45));

    // Initialize simulation
    simulation = d3.forceSimulation<ConceptNode>(nodes)
      .force('link', d3.forceLink<ConceptNode, ConceptEdge>(edges)
        .id(d => d.id)
        .distance(180)
        .strength(0.4))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(55));

    // Draw edges
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#2a2d3e')
      .attr('stroke-width', 1.2)
      .attr('stroke-opacity', 0.6);

    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (event: MouseEvent, d: ConceptNode) => {
        event.stopPropagation();
        selectNode(d);
      });

    // Node circles
    node.append('circle')
      .attr('r', (d: ConceptNode) => 12 + d.level * 5)
      .attr('fill', (d: ConceptNode) => CATEGORY_COLORS[d.category])
      .attr('fill-opacity', 0.85)
      .attr('stroke', (d: ConceptNode) => d3.color(CATEGORY_COLORS[d.category])!.brighter(1.5).toString())
      .attr('stroke-width', 1.5);

    // Node labels
    node.append('text')
      .text((d: ConceptNode) => d.label)
      .attr('x', (d: ConceptNode) => 18 + d.level * 5)
      .attr('y', 4)
      .attr('font-family', "'Courier Prime', 'IBM Plex Mono', monospace")
      .attr('font-size', (d: ConceptNode) => 10 + d.level * 1.5 + 'px')
      .attr('fill', '#c8ccd4')
      .attr('font-weight', (d: ConceptNode) => d.level >= 2 ? 600 : 400);

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: ConceptNode) => 'translate(' + d.x + ',' + d.y + ')');
    });

    // Click on background to deselect
    svg.on('click', () => {
      selectedNode = null;
      tooltip = null;
    });
  }

  function selectNode(d: ConceptNode) {
    selectedNode = d;
    highlightConnections(d);
  }

  function highlightConnections(d: ConceptNode) {
    const connectedIds = new Set<string>();
    connectedIds.add(d.id);

    for (const edge of edges) {
      if (edge.source === d.id || edge.target === d.id) {
        connectedIds.add(typeof edge.source === 'string' ? edge.source : edge.source.id);
        connectedIds.add(typeof edge.target === 'string' ? edge.target : edge.target.id);
      }
    }

    // Fade all nodes
    g.selectAll('.nodes g').transition().duration(300)
      .attr('opacity', (n: any) => connectedIds.has(n.id) ? 1 : 0.15);

    // Highlight connected edges
    g.selectAll('.links line').transition().duration(300)
      .attr('stroke-opacity', (e: any) =>
        e.source.id === d.id || e.target.id === d.id ? 0.9 : 0.08)
      .attr('stroke-width', (e: any) =>
        e.source.id === d.id || e.target.id === d.id ? 2.5 : 1.2)
      .attr('stroke', (e: any) => {
        if (e.source.id === d.id || e.target.id === d.id) {
          return CATEGORY_COLORS[d.category];
        }
        return '#2a2d3e';
      });
  }

  function clearHighlights() {
    g.selectAll('.nodes g').transition().duration(300).attr('opacity', 1);
    g.selectAll('.links line').transition().duration(300)
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 1.2)
      .attr('stroke', '#2a2d3e');
  }

  function getConnectedEdges(nodeId: string): ConceptEdge[] {
    return edges.filter(e => e.source === nodeId || e.target === nodeId);
  }

  function getConstituentNodes(node: ConceptNode): ConceptNode[] {
    return node.constituents
      .map(id => nodes.find(n => n.id === id))
      .filter(Boolean) as ConceptNode[];
  }

  const filteredNodes = $derived(
    searchQuery
      ? nodes.filter(n =>
          n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.explanation.toLowerCase().includes(searchQuery.toLowerCase()))
      : nodes
  );

  function toggleCategory(cat: NodeCategory) {
    if (activeCategories.has(cat)) {
      activeCategories.delete(cat);
    } else {
      activeCategories.add(cat);
    }
    activeCategories = new Set(activeCategories);
    filterByCategory();
  }

  function filterByCategory() {
    const visibleIds = new Set(
      nodes.filter(n => activeCategories.has(n.category)).map(n => n.id)
    );

    g.selectAll('.nodes g').transition().duration(500)
      .attr('opacity', (n: any) => visibleIds.has(n.id) ? 1 : 0)
      .attr('pointer-events', (n: any) => visibleIds.has(n.id) ? 'auto' : 'none');

    g.selectAll('.links line').transition().duration(500)
      .attr('opacity', (e: any) =>
        visibleIds.has(e.source.id) && visibleIds.has(e.target.id) ? 0.6 : 0);
  }

  onMount(() => {
    initGraph();
    // Let simulation settle
    setTimeout(() => simulation?.stop(), 8000);
  });
</script>

<div class="fixed inset-0 bg-[#0f1117] flex flex-col font-mono overflow-hidden" data-meaning-map>
  <!-- Top bar -->
  <header class="flex-shrink-0 border-b border-[#1a1d2e] px-6 py-3 flex items-center gap-4 bg-[#0f1117]/95 backdrop-blur-sm z-10">
    <div class="text-sm text-[#6b7280] tracking-wider uppercase">
      Meaning &amp; Connection Map
    </div>
    <div class="flex-1"></div>

    <!-- Category filters -->
    <div class="flex gap-1.5 flex-wrap">
      {#each Object.entries(CATEGORY_LABELS) as [cat, label]}
        <button
          class="text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer"
          style="border-color: {CATEGORY_COLORS[cat as NodeCategory]}40; {activeCategories.has(cat as NodeCategory) ? 'background:' + CATEGORY_COLORS[cat as NodeCategory] + '25; color:' + CATEGORY_COLORS[cat as NodeCategory] : 'background:transparent; color:#6b7280'}"
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
      bind:value={searchQuery}
      class="text-xs bg-[#1a1d2e] border border-[#2a2d3e] rounded px-3 py-1.5 text-[#c8ccd4] placeholder-[#4b5563] focus:outline-none focus:border-[#4a6fa5] w-56"
    />
  </header>

  <div class="flex-1 flex overflow-hidden relative">
    <!-- Main graph canvas -->
    <div bind:this={container} class="flex-1 overflow-hidden"></div>

    <!-- Side panel -->
    {#if selectedNode}
      <aside class="w-96 flex-shrink-0 border-1 border-[#1a1d2e] bg-[#13151e] overflow-y-auto p-5 flex flex-col gap-4">
        <button
          class="self-end text-[#6b7280] hover:text-[#c8ccd4] text-xs cursor-pointer"
          onclick={() => { selectedNode = null; clearHighlights(); }}
        >
          × Close
        </button>

        <!-- Concept header -->
        <div>
          <div class="flex items-center gap-2 mb-2">
            <span
              class="inline-block w-3 h-3 rounded-full"
              style="background: {CATEGORY_COLORS[selectedNode.category]}"
            ></span>
            <span class="text-xs text-[#6b7280] uppercase tracking-wider">
              {CATEGORY_LABELS[selectedNode.category]}
            </span>
            <span class="text-xs text-[#4b5563]">
              Level {selectedNode.level}
            </span>
          </div>
          <h2 class="text-lg font-bold text-[#e5e7eb] mb-1">
            {selectedNode.label}
          </h2>
        </div>

        <!-- Explanation -->
        <div class="border-t border-[#1a1d2e] pt-3">
          <h3 class="text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">What It Means</h3>
          <p class="text-sm text-[#b0b5c0] leading-relaxed">
            {selectedNode.explanation}
          </p>
        </div>

        <!-- Example -->
        <div>
          <h3 class="text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Concrete Example</h3>
          <p class="text-sm text-[#9ca3af] leading-relaxed italic">
            {selectedNode.example}
          </p>
        </div>

        <!-- Significance -->
        <div>
          <h3 class="text-xs text-[#6b7280] uppercase tracking-wider mb-1.5">Why It Matters</h3>
          <p class="text-sm text-[#b0b5c0] leading-relaxed">
            {selectedNode.significance}
          </p>
        </div>

        <!-- Constituents -->
        {#if getConstituentNodes(selectedNode).length > 0}
          <div class="border-t border-[#1a1d2e] pt-3">
            <h3 class="text-xs text-[#6b7280] uppercase tracking-wider mb-2">Made Of</h3>
            <div class="flex flex-col gap-1">
              {#each getConstituentNodes(selectedNode) as child}
                <button
                  class="text-xs text-[#c8ccd4] hover:text-white hover:underline text-left cursor-pointer flex items-center gap-1.5"
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
            <h3 class="text-xs text-[#6b7280] uppercase tracking-wider mb-2">Connections</h3>
            <div class="flex flex-col gap-2">
              {#each getConnectedEdges(selectedNode.id) as edge}
                {@const otherId = edge.source === selectedNode.id ? edge.target : edge.source}
                {@const otherNode = nodes.find(n => n.id === otherId)}
                {#if otherNode}
                  <div class="text-xs bg-[#1a1d2e] rounded p-2">
                    <div class="flex items-center gap-1.5 mb-1">
                      <span class="text-[#4a6fa5] uppercase text-[10px] tracking-wider">
                        {RELATIONSHIP_LABELS[edge.relationship]}
                      </span>
                      <span class="text-[#4b5563]">→</span>
                      <button
                        class="text-[#c8ccd4] hover:text-white hover:underline text-left cursor-pointer"
                        onclick={() => selectNode(otherNode)}
                      >
                        {otherNode.label}
                      </button>
                    </div>
                    <p class="text-[#9ca3af] leading-relaxed">
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
      <div class="absolute bottom-8 left-8 text-xs text-[#4b5563] max-w-sm">
        <p class="mb-1">Click any node to explore what it means, how it connects, and what it's made of.</p>
        <p>Scroll to zoom · Drag to pan · Use category filters above to explore domains.</p>
      </div>
    {/if}
  </div>
</div>
