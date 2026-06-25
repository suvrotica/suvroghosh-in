<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		delay?: number;
		class?: string;
		tag?: keyof HTMLElementTagNameMap;
		children: import('svelte').Snippet;
	};

	let { delay = 0, class: className = '', tag = 'div', children }: Props = $props();

	let element: HTMLElement;
	let observer: IntersectionObserver | null = null;
	let isVisible = $state(false);

	onMount(() => {
		if (typeof IntersectionObserver === 'undefined') {
			isVisible = true;
			return;
		}

		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						isVisible = true;
						observer?.disconnect();
					}
				}
			},
			{ threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
		);

		if (element) observer.observe(element);

		return () => observer?.disconnect();
	});
</script>

<svelte:element
	this={tag}
	bind:this={element}
	class="reveal {className}"
	class:is-visible={isVisible}
	style="--reveal-delay: {delay}ms"
>
	{@render children()}
</svelte:element>