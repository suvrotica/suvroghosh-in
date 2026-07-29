<script lang="ts">
	import { generateSignalGlyph, SIGNAL_GLYPH_VIEW_BOX } from '$lib/motion/signal-glyph';

	let { slug, category }: { slug: string; category: string } = $props();

	let glyph = $derived(generateSignalGlyph(slug, category));
</script>

<svg
	class="signal-glyph"
	viewBox={SIGNAL_GLYPH_VIEW_BOX}
	preserveAspectRatio="xMidYMid meet"
	aria-hidden="true"
	focusable="false"
	data-signal-glyph={glyph.variant}
>
	<path class="signal-glyph__secondary" d={glyph.secondaryPath}></path>
	<path class="signal-glyph__primary" d={glyph.primaryPath} pathLength="1"></path>
	{#each glyph.nodes as node, index (`${node.x}-${node.y}-${index}`)}
		<circle class="signal-glyph__node" cx={node.x} cy={node.y} r={node.r}></circle>
	{/each}
</svg>
