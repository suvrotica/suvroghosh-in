<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils/index.js';

	let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	class={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}
	{...restProps}
></div>
