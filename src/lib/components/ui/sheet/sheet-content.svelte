<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { sheetVariants, type SheetSide } from './index.js';
	import { cn } from '$lib/utils/index.js';

	let { class: className, side = 'right', ...restProps }: any = $props();
</script>

<DialogPrimitive.Content class={cn(sheetVariants({ side }), className)} {...restProps} />
