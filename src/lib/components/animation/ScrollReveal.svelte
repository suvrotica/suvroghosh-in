<script lang="ts">
	import { clampRevealDelay, reveal } from '$lib/attachments/reveal';

	type Props = {
		delay?: number;
		class?: string;
		tag?: keyof HTMLElementTagNameMap;
		children: import('svelte').Snippet;
	};

	let { delay = 0, class: className = '', tag = 'div', children }: Props = $props();

	let revealDelay = $derived(clampRevealDelay(delay));
</script>

<svelte:element
	this={tag}
	class="reveal {className}"
	style="--reveal-delay: {revealDelay}ms"
	{@attach reveal}
>
	{@render children()}
</svelte:element>
