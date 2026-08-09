<script lang="ts">
	import { linkHorizontal } from 'd3-shape';
	import { createWorkflowLayout, type WorkflowEdge } from '$lib/visualizations/prior-authorization';
	import type { UiJourneyStep, UiStepStatus } from './ui-types';

	type Props = {
		steps: UiJourneyStep[];
		activeStep: number;
		pathwayLabel: string;
		reducedMotion?: boolean;
	};

	let { steps, activeStep, pathwayLabel, reducedMotion = false }: Props = $props();

	const width = 1320;
	const height = 570;
	const nodeWidth = 96;
	const nodeHeight = 58;
	const workflowLayout = createWorkflowLayout(width, height);
	const workflowPath = linkHorizontal();

	let nodes = $derived(
		workflowLayout.nodes.flatMap((layoutNode) => {
			const step = steps.find((candidate) => candidate.id === layoutNode.id);
			return step ? [{ ...step, ...layoutNode }] : [];
		})
	);

	let edges = $derived(
		workflowLayout.edges.flatMap((edge) => {
			const source = nodes.find((node) => node.id === edge.from);
			const target = nodes.find((node) => node.id === edge.to);
			if (!source || !target) return [];
			return [
				{
					...edge,
					path:
						workflowPath({
							source: [source.x, source.y] as [number, number],
							target: [target.x, target.y] as [number, number]
						}) ?? '',
					sourceIndex: source.index,
					targetIndex: target.index,
					state: edgeStatus(source.index, target.index, edge.branch)
				}
			];
		})
	);

	let activeNode = $derived(nodes.find((node) => node.index === activeStep));
	let token = $derived(activeNode?.status === 'bypassed' ? undefined : activeNode);

	function nodeStatus(step: UiJourneyStep, index: number): UiStepStatus {
		if (index === activeStep) {
			if (
				step.status === 'failed' ||
				step.status === 'pended' ||
				step.status === 'expired' ||
				step.status === 'bypassed'
			)
				return step.status;
			return 'active';
		}
		if (index > activeStep) return step.status === 'bypassed' ? 'bypassed' : 'upcoming';
		if (index < activeStep && step.status === 'upcoming') return 'completed';
		return step.status;
	}

	function edgeStatus(
		sourceIndex: number,
		targetIndex: number,
		branch: WorkflowEdge['branch']
	): 'upcoming' | 'completed' | 'active' | 'bypassed' | 'failed' {
		const source = steps[sourceIndex];
		const target = steps[targetIndex];
		const optionalRouteBypassed = [steps[8], steps[9]].every(
			(step) => !step || step.status === 'bypassed'
		);
		if (branch === 'bypass' && !optionalRouteBypassed) return 'bypassed';
		const branchBypassed =
			branch === 'optional-more-information' &&
			(source?.status === 'bypassed' || target?.status === 'bypassed');
		if (branchBypassed) return 'bypassed';
		if (targetIndex > activeStep) return 'upcoming';
		if (target?.status === 'failed' || target?.status === 'expired') return 'failed';
		if (targetIndex === activeStep) return 'active';
		if (targetIndex < activeStep) return 'completed';
		return 'upcoming';
	}

	function wrapLabel(label: string): [string, string?] {
		const words = label.split(' ');
		if (label.length < 20 || words.length < 3) return [label];
		const midpoint = Math.ceil(words.length / 2);
		return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
	}
</script>

<figure class:reduced-motion={reducedMotion} class="workflow-figure">
	<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="workflow-title workflow-desc">
		<title id="workflow-title">Twelve-state prior authorization journey: {pathwayLabel}</title>
		<desc id="workflow-desc"
			>A stable four-lane process diagram. Maya’s MRI order moves through requirements, evidence,
			submission, technical receipt, payer review, decision and scheduling. More-information and
			resubmission form an optional branch. The synchronized HTML ledger is the authoritative
			nonvisual representation.</desc
		>
		<defs>
			<pattern
				id="pa-hatch"
				width="6"
				height="6"
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)"
			>
				<line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="2" />
			</pattern>
			<marker
				id="pa-arrow"
				viewBox="0 0 10 10"
				refX="8"
				refY="5"
				markerWidth="5"
				markerHeight="5"
				orient="auto-start-reverse"
			>
				<path d="M 0 0 L 10 5 L 0 10 z" />
			</marker>
		</defs>

		{#each workflowLayout.lanes as lane}
			<g class="lane">
				<line x1="20" x2={width - 20} y1={lane.y} y2={lane.y} />
				<text x="24" y={lane.y - 42}>{lane.label}</text>
			</g>
		{/each}

		<g class="edges" aria-hidden="true">
			{#each edges as edge (edge.id)}
				<path
					class={`edge edge-${edge.branch} edge-${edge.state}`}
					d={edge.path}
					marker-end="url(#pa-arrow)"
				/>
			{/each}
		</g>

		<g class="nodes" aria-hidden="true">
			{#each nodes as node, index (node.id)}
				{@const status = nodeStatus(node, index)}
				{@const labelLines = wrapLabel(node.shortLabel || node.label)}
				<g
					class={`node node-${status}`}
					transform={`translate(${node.x - nodeWidth / 2}, ${node.y - nodeHeight / 2})`}
					data-milestone-id={node.id}
				>
					<rect
						width={nodeWidth}
						height={nodeHeight}
						rx={status === 'failed' || status === 'expired' ? 3 : 13}
					/>
					<text class="node-number" x="9" y="15">{String(index + 1).padStart(2, '0')}</text>
					<text
						class="node-label"
						x={nodeWidth / 2}
						y={labelLines[1] ? 31 : 36}
						text-anchor="middle"
					>
						<tspan x={nodeWidth / 2}>{labelLines[0]}</tspan>
						{#if labelLines[1]}<tspan x={nodeWidth / 2} dy="13">{labelLines[1]}</tspan>{/if}
					</text>
					<path
						class="status-shape"
						d={status === 'failed' || status === 'expired'
							? 'M99 9l9 9m0-9l-9 9'
							: status === 'pended'
								? 'M100 9h8v8h-8z'
								: 'M100 13h8'}
					/>
				</g>
			{/each}
		</g>

		{#if token}
			<g class="token" style={`--token-x:${token.x}px; --token-y:${token.y}px`} aria-hidden="true">
				<circle r="11" />
				<circle r="4" />
			</g>
		{/if}

		<g class="maya-anchor" aria-hidden="true">
			<circle cx="46" cy="531" r="18" />
			<text x="46" y="535" text-anchor="middle">MS</text>
			<text x="72" y="528">Maya is still here.</text>
			<text class="maya-status" x="72" y="543">The patient experiences the whole wall clock.</text>
		</g>
	</svg>
	<figcaption>
		Equal-weight lines show valid routing, not volume. Dashed lines are the optional
		more-information loop. Shapes and state words supplement colour.
	</figcaption>
</figure>

<style>
	.workflow-figure {
		margin: 0;
		min-width: 0;
		border: 1px solid var(--rule);
		border-radius: 0.8rem;
		overflow: clip;
		background: var(--paper);
		color: var(--ink);
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		min-height: 26rem;
		font-family: var(--font-sans, sans-serif);
	}

	.lane line {
		stroke: var(--rule);
		stroke-width: 1;
		stroke-dasharray: 2 8;
	}

	.lane text {
		fill: var(--ink-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 730;
		letter-spacing: 1.1px;
		text-transform: uppercase;
	}

	.edge {
		fill: none;
		stroke: var(--rule);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.edge-optional-more-information,
	.edge-bypass,
	.edge-bypassed {
		stroke-dasharray: 5 5;
	}

	.edge-completed {
		stroke: var(--ink-muted);
	}

	.edge-active {
		stroke: var(--accent);
		stroke-width: 3;
	}

	.edge-failed {
		stroke: #9f4a43;
		stroke-dasharray: 2 4;
	}

	:global(#pa-arrow path) {
		fill: context-stroke;
	}

	.node rect {
		fill: var(--paper-raised);
		stroke: var(--rule);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.node-completed rect {
		stroke: var(--ink-muted);
	}

	.node-active rect {
		stroke: var(--accent);
		stroke-width: 3;
	}

	.node-bypassed rect {
		stroke-dasharray: 4 3;
		opacity: 0.58;
	}

	.node-pended rect {
		stroke: #8a672c;
		stroke-width: 2.5;
		stroke-dasharray: 7 3;
	}

	.node-failed rect,
	.node-expired rect {
		fill: color-mix(in oklab, #9f4a43 8%, var(--paper-raised));
		stroke: #9f4a43;
		stroke-width: 2.5;
	}

	.node-number {
		fill: var(--ink-muted);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 9px;
		font-weight: 760;
	}

	.node-label {
		fill: var(--ink);
		font-size: 10px;
		font-weight: 730;
	}

	.status-shape {
		fill: none;
		stroke: var(--ink-muted);
		stroke-width: 1.5;
	}

	.node-active .status-shape {
		stroke: var(--accent);
	}

	.node-failed .status-shape,
	.node-expired .status-shape {
		stroke: #9f4a43;
	}

	.token {
		transform: translate(var(--token-x), var(--token-y));
		animation: token-tableau 560ms cubic-bezier(0.22, 0.74, 0.25, 1);
		transition: transform 700ms cubic-bezier(0.22, 0.74, 0.25, 1);
	}

	@keyframes token-tableau {
		0% {
			opacity: 0.25;
			transform: translate(var(--token-x), var(--token-y)) scale(0.55);
		}
		65% {
			opacity: 1;
			transform: translate(var(--token-x), var(--token-y)) scale(1.25);
		}
		100% {
			transform: translate(var(--token-x), var(--token-y)) scale(1);
		}
	}

	.token circle:first-child {
		fill: var(--paper);
		stroke: var(--accent);
		stroke-width: 4;
	}

	.token circle:last-child {
		fill: var(--accent);
	}

	.reduced-motion .token {
		animation: none;
		transition: none;
	}

	.maya-anchor circle {
		fill: var(--paper-raised);
		stroke: var(--ink);
		stroke-width: 2;
	}

	.maya-anchor text {
		fill: var(--ink);
		font-size: 11px;
		font-weight: 760;
	}

	.maya-anchor text:first-of-type {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 9px;
	}

	.maya-anchor .maya-status {
		fill: var(--ink-muted);
		font-size: 9px;
		font-weight: 500;
	}

	figcaption {
		border-top: 1px solid var(--rule);
		padding: 0.6rem 0.75rem;
		font: 0.66rem/1.4 var(--font-sans, sans-serif);
		color: var(--ink-muted);
	}

	@media (forced-colors: active) {
		.workflow-figure {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		svg {
			background: Canvas;
			color: CanvasText;
			forced-color-adjust: none;
		}

		.node rect,
		.maya-anchor circle,
		.token circle:first-child {
			fill: Canvas;
			stroke: CanvasText;
		}

		.node-active rect,
		.edge-active,
		.token circle:first-child {
			stroke: Highlight;
		}

		.node-pended rect {
			fill: Canvas;
			stroke: CanvasText;
		}

		.node-failed rect,
		.node-expired rect {
			fill: Canvas;
			stroke: CanvasText;
			stroke-dasharray: 2 2;
		}

		.node-bypassed rect {
			opacity: 1;
		}

		.edge,
		.lane line,
		.status-shape {
			stroke: CanvasText;
		}

		.edge-active,
		.node-active .status-shape {
			stroke: Highlight;
		}

		.node-number,
		.node-label,
		.lane text,
		.maya-anchor text,
		.maya-anchor .maya-status {
			fill: CanvasText;
		}

		.token circle:last-child {
			fill: Highlight;
		}

		figcaption {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
