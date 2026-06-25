<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p class={cn('text-sm text-muted-foreground', className)} {...restProps}></p>
