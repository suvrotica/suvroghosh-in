<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { buttonVariants, type ButtonSize, type ButtonVariant } from './index.js';

	type Props = {
		variant?: ButtonVariant;
		size?: ButtonSize;
		href?: string;
		class?: string;
		children: Snippet;
	} & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'class'>;

	let {
		class: className,
		variant = 'default',
		size = 'default',
		href = undefined,
		children,
		...restProps
	}: Props = $props();
</script>

{#if href}
	<a
		{href}
		class={buttonVariants({ variant, size, class: className })}
		{...restProps as HTMLAnchorAttributes}
	>
		{@render children()}
	</a>
{:else}
	<button
		class={buttonVariants({ variant, size, class: className })}
		{...restProps as HTMLButtonAttributes}
	>
		{@render children()}
	</button>
{/if}
