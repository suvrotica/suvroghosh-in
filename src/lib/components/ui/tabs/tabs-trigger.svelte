<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { tabsTriggerVariants } from './index.js';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: any = $props();
</script>

<TabsPrimitive.Trigger class={cn('', className)} {...restProps} />
