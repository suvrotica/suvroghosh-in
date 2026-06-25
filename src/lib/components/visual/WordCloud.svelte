<script lang="ts">
	import { onMount } from 'svelte';

	type Tag = {
		text: string;
		href: string;
	};

	type Props = {
		tags: string[];
		searchBase?: string;
	};

	let { tags, searchBase = '/blog?search=' }: Props = $props();

	let container: HTMLElement;
	let revealed = $state(false);

	onMount(() => {
		if (typeof IntersectionObserver === 'undefined') {
			revealed = true;
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						revealed = true;
						observer.disconnect();
					}
				}
			},
			{ threshold: 0.15 }
		);
		if (container) observer.observe(container);
		return () => observer.disconnect();
	});

	const weights = [3, 2, 2.5, 1.5, 2, 1, 2.5, 1.5, 3, 1, 2, 1.5, 2.5, 1, 2];

	let items = $derived(
		tags.map((tag, i) => ({
			text: tag,
			href: `${searchBase}${encodeURIComponent(tag)}`,
			size: weights[i % weights.length]
		}))
	);
</script>

<div bind:this={container} class="word-cloud flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-4">
	{#each items as item, i (item.text)}
		<a
			href={item.href}
			class="word-cloud-item inline-block leading-tight text-neutral-400 hover:text-neutral-200 transition-colors"
			style="font-size: {item.size}rem; animation-delay: {revealed ? i * 60 : 0}ms; opacity: {revealed ? 1 : 0}"
		>
			{item.text}
		</a>
	{/each}
</div>

<style>
	.word-cloud-item {
		animation: word-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	@keyframes word-pop {
		from {
			opacity: 0;
			transform: translateY(0.5rem) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.word-cloud-item {
			animation: none;
		}
	}
</style>