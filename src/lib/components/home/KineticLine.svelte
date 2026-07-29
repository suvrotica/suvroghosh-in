<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	const statements = [
		'I build clinical data systems.',
		'I write essays and satire.',
		'I make scientific visual experiments.',
		'I map ordinary Calcutta.'
	] as const;

	const initialDelay = 1_100;
	const stepDelay = 1_650;

	let activeIndex = $state(0);
	let phase = $state<'static' | 'running' | 'settled'>('static');

	const cycleStatements: Attachment<HTMLElement> = () => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		let transitionsRemaining = statements.length;
		let remaining = initialDelay;
		let deadline = 0;
		const forcedColours = window.matchMedia('(forced-colors: active)');
		const print = window.matchMedia('print');

		const clearTimer = () => {
			if (timer === null) return;
			clearTimeout(timer);
			timer = null;
		};

		const canCycle = () => {
			const root = document.documentElement;
			return (
				root.dataset.motion !== 'still' &&
				root.dataset.theme !== 'high-contrast' &&
				!forcedColours.matches &&
				!print.matches
			);
		};

		const schedule = (delay: number) => {
			clearTimer();
			remaining = Math.max(0, delay);
			deadline = performance.now() + remaining;
			timer = setTimeout(() => {
				timer = null;
				activeIndex = (activeIndex + 1) % statements.length;
				transitionsRemaining -= 1;

				if (transitionsRemaining === 0) {
					phase = 'settled';
					return;
				}

				remaining = stepDelay;
				schedule(stepDelay);
			}, remaining);
		};

		const pause = () => {
			if (timer !== null) {
				remaining = Math.max(0, deadline - performance.now());
			}
			clearTimer();
		};

		const reset = () => {
			clearTimer();
			activeIndex = 0;
			transitionsRemaining = statements.length;
			remaining = initialDelay;
			phase = 'static';
		};

		const reconcile = () => {
			if (!canCycle()) {
				reset();
				return;
			}

			if (document.hidden) {
				pause();
				return;
			}

			if (phase === 'settled' || timer !== null) return;
			phase = 'running';
			schedule(remaining);
		};

		const handleVisibilityChange = () => {
			if (document.hidden) pause();
			else reconcile();
		};

		const motionObserver =
			typeof MutationObserver === 'undefined' ? null : new MutationObserver(reconcile);
		motionObserver?.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion', 'data-theme']
		});
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('site-motion-change', reconcile);
		forcedColours.addEventListener('change', reconcile);
		print.addEventListener('change', reconcile);
		reconcile();

		return () => {
			clearTimer();
			motionObserver?.disconnect();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('site-motion-change', reconcile);
			forcedColours.removeEventListener('change', reconcile);
			print.removeEventListener('change', reconcile);
		};
	};
</script>

<div
	class="kinetic-line"
	data-kinetic-line
	data-kinetic-state={phase}
	data-kinetic-index={activeIndex}
	{@attach cycleStatements}
>
	<p class="kinetic-line__visible" aria-hidden="true">
		{#each statements as statement, index (statement)}
			<span class:kinetic-line__statement--active={index === activeIndex}>{statement}</span>
		{/each}
	</p>
	<p class="sr-only">
		Suvro builds clinical data systems, writes essays and satire, makes scientific visual
		experiments, and maps ordinary Calcutta.
	</p>
</div>
