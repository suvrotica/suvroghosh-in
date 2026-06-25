<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils/index.js';

	let {
		class: className,
		open = $bindable(false),
		...restProps
	}: { class?: string; open?: boolean } & Record<string, any> = $props();
</script>

<DialogPrimitive.Root bind:open {...restProps} />
