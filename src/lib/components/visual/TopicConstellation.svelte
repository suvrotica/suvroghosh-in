<script lang="ts">
	type Props = {
		class?: string;
	};

	let { class: className = '' }: Props = $props();

	const nodes = [
		{ id: 'healthcare-it', label: 'Healthcare IT', x: 150, y: 80 },
		{ id: 'healthcare-ai', label: 'Healthcare AI', x: 350, y: 50 },
		{ id: 'public-health', label: 'Public Health', x: 550, y: 90 },
		{ id: 'systems-thinking', label: 'Systems Thinking', x: 100, y: 200 },
		{ id: 'mental-models', label: 'Mental Models', x: 300, y: 180 },
		{ id: 'political-economy', label: 'Political Economy', x: 500, y: 220 },
		{ id: 'food-culture', label: 'Food & Culture', x: 200, y: 310 },
		{ id: 'history-science', label: 'History of Science', x: 420, y: 290 }
	];

	const edges = [
		[0, 1], [1, 2], [0, 3], [1, 4], [2, 5],
		[3, 4], [4, 5], [3, 6], [4, 7], [5, 7],
		[0, 4], [1, 5], [6, 7]
	];

	const nodeRadius = 5;
</script>

<svg
	viewBox="0 0 600 360"
	class="w-full h-auto {className}"
	fill="none"
	aria-hidden="true"
	preserveAspectRatio="xMidYMid meet"
>
	{#each edges as [from, to], i}
		<line
			x1={nodes[from].x}
			y1={nodes[from].y}
			x2={nodes[to].x}
			y2={nodes[to].y}
			class="constellation-line"
			style="animation-delay: {i * 120}ms"
		/>
	{/each}

	{#each nodes as node, i}
		<circle
			cx={node.x}
			cy={node.y}
			r={nodeRadius}
			class="constellation-node"
			style="animation-delay: {i * 200}ms"
		/>
		<circle
			cx={node.x}
			cy={node.y}
			r={nodeRadius + 4}
			fill="none"
			stroke="var(--color-accent)"
			stroke-width="0.5"
			opacity="0.3"
		/>
		<text
			x={node.x}
			y={node.y - 12}
			class="constellation-label"
		>
			{node.label}
		</text>
	{/each}
</svg>