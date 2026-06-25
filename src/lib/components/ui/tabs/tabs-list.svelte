<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { tabsVariants } from './index.js';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: any = $props();
</script>

<TabsPrimitive.List class={cn(tabsVariants(), className)} {...restProps} />
