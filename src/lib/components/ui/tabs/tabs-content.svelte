<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { tabsContentVariants } from './index.js';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: any = $props();
</script>

<TabsPrimitive.Content class={cn(tabsContentVariants(), className)} {...restProps} />
