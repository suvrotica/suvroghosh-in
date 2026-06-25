<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: any = $props();
</script>

<TooltipPrimitive.Trigger class={cn(className)} {...restProps} />
