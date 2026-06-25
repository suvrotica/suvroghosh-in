<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/index.js';

	type Props = {
		value?: number;
		max?: number;
		class?: string;
	} & HTMLAttributes<HTMLDivElement>;

	let { value = 0, max = 100, class: className, ...restProps }: Props = $props();
	let percentage = $derived(Math.min(100, Math.round((value / max) * 100)));
</script>

<div
	class={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
	{...restProps}
>
	<div
		class="h-full rounded-full bg-primary transition-all duration-300 ease-linear"
		style="width: {percentage}%"
	></div>
</div>
