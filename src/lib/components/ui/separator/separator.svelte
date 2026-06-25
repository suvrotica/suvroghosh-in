<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/index.js';

	type Props = {
		orientation?: 'horizontal' | 'vertical';
		class?: string;
	} & HTMLAttributes<HTMLDivElement>;

	let { orientation = 'horizontal', class: className, ...restProps }: Props = $props();
</script>

<div
	role="separator"
	aria-orientation={orientation}
	class={cn(
		'shrink-0 bg-border',
		orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
		className
	)}
	{...restProps}
></div>
