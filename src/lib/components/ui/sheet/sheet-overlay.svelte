<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: any = $props();
</script>

<DialogPrimitive.Overlay
	class={cn(
		'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in',
		className
	)}
	{...restProps}
/>
