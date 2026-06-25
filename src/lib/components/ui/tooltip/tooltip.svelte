<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/index.js';

	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children: Snippet } & Record<string, any> = $props();
</script>

<TooltipPrimitive.Provider>
	<TooltipPrimitive.Root {...restProps}>
		{@render children()}
	</TooltipPrimitive.Root>
</TooltipPrimitive.Provider>
