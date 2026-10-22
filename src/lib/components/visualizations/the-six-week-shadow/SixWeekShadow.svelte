<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import { compileScenario, DEFAULT_SETTINGS } from '$lib/visualizations/the-six-week-shadow/model';
	import ShadowScene from './ShadowScene.svelte';
	import './shadow.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	const representative = compileScenario(DEFAULT_SETTINGS);
	const representativeWaiting = representative.tasks
		.filter((task) => task.kind === 'wait')
		.reduce((days, task) => days + task.durationWorkingDays, 0);
	onMount(() => {
		let disposed = false;
		const load = () =>
			void import('./ShadowRuntime.svelte')
				.then((m) => {
					if (!disposed) Runtime = m.default;
				})
				.catch(() => {
					if (!disposed) failed = true;
				});
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					observer.disconnect();
					load();
				}
			},
			{ rootMargin: '450px' }
		);
		observer.observe(host);
		return () => {
			disposed = true;
			observer.disconnect();
		};
	});
</script>

<section
	class="shadow-feature"
	aria-label="The Six-Week Shadow interactive workshop"
	data-tts-exclude
	data-maker-feature="the-six-week-shadow"
	bind:this={host}
>
	{#if Runtime}<Runtime />{:else}
		<div class="shadow-static" data-maker-capture>
			<header class="shadow-masthead">
				<p class="shadow-eyebrow">THE EVERYDAY SYSTEMS LABORATORY / 02</p>
				<h1>A ten-minute idea.<br /><em>A six-week shadow.</em></h1>
				<p>
					It took ten minutes to suggest moving the button. What happens before we can send the next
					batch?
				</p>
			</header>
			<ShadowScene schedule={representative} changed={true} />
			<p class="shadow-static-summary">
				A representative proposed change: <strong
					>{representative.elapsedWorkingDays} elapsed working days</strong
				>
				and
				<strong>{representative.activeEffortPersonDays} person-days of active effort</strong>. Solid
				time bands are work; hatched bands are waiting. Instructions and support can proceed beside
				the main path.
			</p>
		</div>
		<p class="shadow-loading">
			{failed
				? 'The controls could not load. The static scene and article retain the complete fictional example.'
				: 'The workshop controls open as you approach.'}
		</p>
		<noscript
			><p>
				JavaScript enables moving the button and changing the two waits. This static scene shows the
				default fictional batch: {representative.elapsedWorkingDays} working days, including {representativeWaiting}
				days waiting, with {representative.activeEffortPersonDays}
				person-days of effort shared across the assumed people. The full explanation and assumptions follow
				below.
			</p></noscript
		>
	{/if}
</section>
