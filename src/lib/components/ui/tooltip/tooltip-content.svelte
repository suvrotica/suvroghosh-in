<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import { tooltipVariants } from './index.js';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: any = $props();
</script>

<TooltipPrimitive.Content class={cn(tooltipVariants(), className)} {...restProps} />
