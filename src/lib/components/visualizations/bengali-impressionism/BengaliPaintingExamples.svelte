<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { EXAMPLES } from '$lib/visualizations/bengali-impressionism/examples';
	import {
		STUDIO_PATH,
		stateFromQuery,
		stateQuery
	} from '$lib/visualizations/bengali-impressionism/studio-state';

	let { gallery = false }: { gallery?: boolean } = $props();
	let returnTo = $state(STUDIO_PATH);
	let returnLink = $state<HTMLAnchorElement>();

	afterNavigate(({ to }) => {
		const painting = to && stateFromQuery(to.url.searchParams);
		returnTo = painting
			? STUDIO_PATH + '?' + stateQuery(painting, true) + '&focus=post'
			: STUDIO_PATH;
		if (painting && !gallery) returnLink?.focus({ preventScroll: true });
	});
</script>

{#if gallery}
	<section aria-labelledby="generated-paintings-heading">
		<h2 id="generated-paintings-heading">Generated examples</h2>
		<div class="examples">
			{#each EXAMPLES as example (example.file)}
				<figure>
					<a href={STUDIO_PATH + '?' + stateQuery(example.state, true)}>
						<img
							src={'/images/visualizations/bengali-impressionism/' + example.file + '.webp'}
							alt={example.alt}
							width="1200"
							height="800"
							loading="lazy"
						/>
						{example.title}
					</a>
					<figcaption>
						Seed <code>{example.state.seed}</code> · Brush size {example.state.brushSize}%
					</figcaption>
				</figure>
			{/each}
		</div>
		<p data-tts-exclude><a href={returnTo}>← Return to the painting</a></p>
	</section>
{:else}
	<p data-tts-exclude><a bind:this={returnLink} href={returnTo}>← Return to the painting</a></p>
{/if}

<style>
	.examples {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0 1.2rem;
	}
	.examples figure {
		min-width: 0;
	}
	.examples img {
		width: 100%;
		height: auto;
		margin: 0 0 0.55rem;
	}
	.examples figcaption {
		margin-top: 0.25rem;
	}
	@media (max-width: 540px) {
		.examples {
			grid-template-columns: 1fr;
		}
	}
</style>
