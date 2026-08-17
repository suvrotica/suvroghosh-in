<script lang="ts">
	import { createReadingProgressScheduler } from './reading-progress-scheduler';

	let { ink = 'var(--accent)' }: { ink?: string } = $props();
	let progress = $state(0);

	$effect(() => {
		const update = () => {
			const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
			progress = documentHeight > 0 ? Math.min(Math.max(window.scrollY / documentHeight, 0), 1) : 0;
		};

		const scheduler = createReadingProgressScheduler(update);

		window.addEventListener('scroll', scheduler.schedule, { passive: true });
		window.addEventListener('resize', scheduler.schedule, { passive: true });

		return () => {
			window.removeEventListener('scroll', scheduler.schedule);
			window.removeEventListener('resize', scheduler.schedule);
			scheduler.stop();
		};
	});
</script>

<div
	class="reading-progress-bar fixed inset-x-0 top-0 z-50 h-0.5 print:hidden"
	style="transform: scaleX({progress}); background: {ink}"
	aria-hidden="true"
></div>
