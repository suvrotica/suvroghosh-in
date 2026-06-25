<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: any = $props();
</script>

<TabsPrimitive.Root class={cn('flex flex-col', className)} {...restProps} />
