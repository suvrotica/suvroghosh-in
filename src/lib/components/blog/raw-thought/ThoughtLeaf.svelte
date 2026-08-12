<script lang="ts">
	import type { ThoughtFolioChildren } from './thought-folio-context';

	let { side, label, children }: ThoughtFolioChildren & { side: 'left' | 'right'; label?: string } =
		$props();
</script>

<div class="thought-leaf" data-side={side}>
	<div class="thought-leaf__meta" aria-hidden="true">
		<span>{side === 'left' ? 'L' : 'R'}</span>
		{#if label}<span>{label}</span>{/if}
	</div>
	<div class="thought-leaf__content">
		{@render children()}
	</div>
</div>
