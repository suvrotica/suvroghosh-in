<script lang="ts">
	import type { Snippet } from 'svelte';
	import { badgeVariants, type BadgeVariant } from './index.js';
	import { cn } from '$lib/utils/index.js';

	type Props = {
		variant?: BadgeVariant;
		class?: string;
		href?: string;
		children: Snippet;
		[key: string]: unknown;
	};

	let {
		variant = 'default',
		class: className,
		href = undefined,
		children,
		...restProps
	}: Props = $props();
</script>

{#if href}
	<a class={cn(badgeVariants({ variant }), className)} {href} {...restProps}>
		{@render children()}
	</a>
{:else}
	<span class={cn(badgeVariants({ variant }), className)} {...restProps}>
		{@render children()}
	</span>
{/if}
