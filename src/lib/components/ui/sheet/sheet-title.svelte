<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<h4 class={cn('font-sans text-lg font-semibold text-foreground', className)} {...restProps}></h4>
