<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import SkinComparison from './SkinComparison.svelte';
	import './skin-instrument.css';

	let shell: HTMLElement;
	let App = $state<Component<{ onUnavailable: () => void }> | null>(null);
	let unavailable = $state(false);

	function showSavedExample() {
		unavailable = true;
		App = null;
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('canvas') === 'off' || params.get('fallback') === '1') return;

		let disposed = false;
		let observer: IntersectionObserver | undefined;
		const load = async () => {
			try {
				const { default: Instrument } = await import('./SkinExperiment.svelte');
				if (!disposed) App = Instrument;
			} catch {
				if (!disposed) showSavedExample();
			}
		};

		if (typeof IntersectionObserver === 'function') {
			observer = new IntersectionObserver(
				(entries) => {
					if (!entries.some((entry) => entry.isIntersecting)) return;
					observer?.disconnect();
					void load();
				},
				{ rootMargin: '240px 0px' }
			);
			observer.observe(shell);
		} else {
			void load();
		}

		return () => {
			disposed = true;
			observer?.disconnect();
		};
	});
</script>

<section
	bind:this={shell}
	class="skin-case article-breakout not-prose"
	aria-label="Fixed surface pattern experiment"
	data-testid="skin-instrument"
	data-tts-exclude
>
	<header class="skin-heading">
		<p class="skin-kicker">Surface geometry</p>
		<h2>Does a pattern change when it has less room to form?</h2>
		<p>
			Move Width to see what changes. In the first window, the pattern forms inside the new
			boundary. In the second, a finished pattern is squeezed to fit. The rules and the length stay
			the same.
		</p>
	</header>

	{#if App}
		<div class="skin-screen-only">
			<App onUnavailable={showSavedExample} />
		</div>
		<div class="skin-print-only">
			<SkinComparison />
		</div>
	{:else}
		<div data-testid="skin-static-fallback">
			<SkinComparison />
			{#if unavailable}
				<p class="skin-static-note skin-error" role="status">
					The interactive experiment is unavailable. The saved comparison is shown above.
				</p>
			{:else}
				<p class="skin-static-note">Saved example from the model.</p>
			{/if}
		</div>
	{/if}
</section>
