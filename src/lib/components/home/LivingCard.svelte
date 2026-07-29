<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { livingCard } from '$lib/attachments/living-card';

	type Props = {
		href: string;
		variant?: 'path' | 'signal';
		class?: string;
		children: Snippet;
	} & Omit<HTMLAnchorAttributes, 'children' | 'class' | 'href'>;

	let { href, variant = 'path', class: className = '', children, ...restProps }: Props = $props();
</script>

<!-- href is resolved at the route call site before it reaches this semantic primitive. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	{href}
	class="living-card living-card--{variant} {className}"
	data-living-card
	data-living-card-variant={variant}
	{@attach livingCard}
	{...restProps}
>
	<span class="living-card__underlay" aria-hidden="true"></span>
	<div class="living-card__content">
		{@render children()}
	</div>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
