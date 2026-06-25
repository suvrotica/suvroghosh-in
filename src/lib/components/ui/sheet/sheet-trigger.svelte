<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: any = $props();
</script>

<DialogPrimitive.Trigger class={cn(className)} {...restProps} />
