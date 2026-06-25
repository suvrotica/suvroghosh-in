<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={cn('p-6 pt-0', className)} {...restProps}></div>
