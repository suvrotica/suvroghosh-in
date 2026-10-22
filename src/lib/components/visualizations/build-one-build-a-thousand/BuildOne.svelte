<script lang="ts">
	import { onMount, type Component } from 'svelte';
	import {
		calculateWorkshop,
		DEFAULT_INPUT
	} from '$lib/visualizations/build-one-build-a-thousand/model';
	import WorkshopScene from './WorkshopScene.svelte';
	import './workshop.css';
	let host: HTMLElement;
	let Runtime = $state<Component | null>(null);
	let failed = $state(false);
	const initial = calculateWorkshop(DEFAULT_INPUT);
	const originalThousand = calculateWorkshop({ ...DEFAULT_INPUT, quantity: 1000 });
	onMount(() => {
		let disposed = false;
		const load = () => {
			void import('./WorkshopRuntime.svelte')
				.then((module) => {
					if (!disposed) Runtime = module.default;
				})
				.catch(() => {
					if (!disposed) failed = true;
				});
		};
		if (!('IntersectionObserver' in window)) load();
		else {
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.at(-1)?.isIntersecting) {
						observer.disconnect();
						load();
					}
				},
				{ rootMargin: '400px' }
			);
			observer.observe(host);
			return () => {
				disposed = true;
				observer.disconnect();
			};
		}
		return () => {
			disposed = true;
		};
	});
</script>

<section
	class="bott-lab not-prose"
	aria-label="Build One. Now Build a Thousand interactive workshop"
	data-maker-feature="build-one-build-a-thousand"
	data-tts-exclude
	bind:this={host}
>
	<header class="bott-masthead">
		<div class="bott-edition">
			<span>THE MAKER'S COLLECTION / 01</span><span>ONE OBJECT. A DIFFERENT OBLIGATION.</span>
		</div>
		<h1>Build one.<br />Now build <em>a thousand.</em></h1>
		<p>You made one. Someone wants a thousand. What changes?</p>
	</header>
	{#if Runtime}<Runtime />{:else}<div class="bott-fallback">
			<WorkshopScene snapshot={initial} />
			<p>
				<strong
					>One stand: {initial.handsOnMinutes} minutes of hands-on work. Ready to send: working day {initial.readyToSendDay}.</strong
				>
				Invented teaching assumptions for one maker. With every decision off, {originalThousand.input.quantity.toLocaleString(
					'en-GB'
				)} stands need {originalThousand.handsOnMinutes.toLocaleString('en-GB')} hands-on minutes and
				are ready to send on working day {originalThousand.readyToSendDay}, including {originalThousand.materialWaitDays}
				working days waiting for material.
			</p>
			<p>
				{failed
					? 'The workshop could not load. Reload to try again; the article and representative scene remain readable.'
					: 'The interactive workshop opens as you approach.'}
			</p>
			<noscript
				><p>
					JavaScript enables quantity changes and workshop inspection. The scene, caption and full
					model account below remain available without it.
				</p></noscript
			>
		</div>{/if}
</section>
