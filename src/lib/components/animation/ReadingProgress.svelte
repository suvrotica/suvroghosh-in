<script lang="ts">
	import { onMount } from 'svelte';

	let progress = $state(0);
	let rafId: number | null = null;

	onMount(() => {
		const scroller = document.querySelector('.scrollable-main') as HTMLElement | null;
		if (!scroller) return;

		const update = () => {
			rafId = null;
			const scrollTop = scroller.scrollTop;
			const scrollHeight = scroller.scrollHeight - scroller.clientHeight;
			progress = scrollHeight > 0 ? Math.min(scrollTop / scrollHeight, 1) : 0;
		};

		const onScroll = () => {
			if (rafId === null) {
				rafId = requestAnimationFrame(update);
			}
		};

		scroller.addEventListener('scroll', onScroll, { passive: true });
		update();

		return () => {
			scroller.removeEventListener('scroll', onScroll);
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	});
</script>

<div
	class="reading-progress-bar fixed top-0 left-0 right-0 z-50 h-0.5 bg-gold"
	style="transform: scaleX({progress})"
	aria-hidden="true"
></div>