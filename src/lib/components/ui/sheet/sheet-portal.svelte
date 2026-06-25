<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/index.js';

	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children: Snippet } & Record<string, any> = $props();
</script>

<DialogPrimitive.Portal {...restProps}>
	{@render children()}
</DialogPrimitive.Portal>
