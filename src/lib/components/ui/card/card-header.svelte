<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={cn('flex flex-col space-y-1.5 p-6', className)} {...restProps}></div>
