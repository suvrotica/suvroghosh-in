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
	let fallbackTimer: number | undefined;
	let isVisible = $state(false);

	onMount(() => {
		const reveal = () => {
			isVisible = true;
			observer?.disconnect();
			if (fallbackTimer !== undefined) {
				window.clearTimeout(fallbackTimer);
				fallbackTimer = undefined;
			}
		};

		if (typeof IntersectionObserver === 'undefined') {
			reveal();
			return;
		}

		const scrollRoot = document.getElementById('main-content') as HTMLElement | null;

		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						reveal();
					}
				}
			},
			{ threshold: 0.1, root: scrollRoot, rootMargin: '0px 0px -60px 0px' }
		);

		if (element) observer.observe(element);

		// Fallback: if IntersectionObserver doesn't fire (e.g. no scroll root),
		// make visible after a short delay
		fallbackTimer = window.setTimeout(() => {
			if (!isVisible) reveal();
		}, 500);

		return () => {
			observer?.disconnect();
			if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
		};
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
