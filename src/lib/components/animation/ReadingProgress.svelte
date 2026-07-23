<script lang="ts">
	let { ink = 'var(--accent)' }: { ink?: string } = $props();
	let progress = $state(0);

	$effect(() => {
		let rafId: number | null = null;

		const update = () => {
			rafId = null;
			const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
			progress = documentHeight > 0 ? Math.min(Math.max(window.scrollY / documentHeight, 0), 1) : 0;
		};

		const scheduleUpdate = () => {
			if (rafId === null) rafId = requestAnimationFrame(update);
		};

		window.addEventListener('scroll', scheduleUpdate, { passive: true });
		window.addEventListener('resize', scheduleUpdate, { passive: true });
		update();

		return () => {
			window.removeEventListener('scroll', scheduleUpdate);
			window.removeEventListener('resize', scheduleUpdate);
			if (rafId !== null) cancelAnimationFrame(rafId);
		};
	});
</script>

<div
	class="reading-progress-bar fixed inset-x-0 top-0 z-50 h-0.5 print:hidden"
	style="transform: scaleX({progress}); background: {ink}"
	aria-hidden="true"
></div>
