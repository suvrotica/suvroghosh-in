<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ProfessionalProject } from '$lib/content/professional-projects';

	type WorkSample = Pick<
		ProfessionalProject,
		'id' | 'name' | 'context' | 'detail' | 'status' | 'link'
	>;

	let { projects }: { projects: readonly WorkSample[] } = $props();
</script>

<section
	class="home-breakout work-worlds"
	aria-labelledby="work-worlds-heading"
	data-work-worlds
	data-scene-section
	data-scene-state="work"
>
	<header class="work-worlds__intro">
		<p class="work-worlds__index">Index 02 / Made and explored</p>
		<h2 id="work-worlds-heading">Work you can explore</h2>
		<p class="work-worlds__description">
			A few things I have built: experiments to play with and the publishing system you are reading.
			The creative and educational models explain their assumptions and limits on their own pages.
		</p>
	</header>

	<ul class="work-samples" aria-label="Selected independent work">
		{#each projects as project (project.id)}
			<li>
				<article class="work-sample" aria-labelledby={`work-sample-${project.id}`}>
					<p class="work-sample__status">{project.status ?? project.context}</p>
					<h3 id={`work-sample-${project.id}`}>{project.name}</h3>
					<p class="work-sample__description">{project.detail}</p>
					{#if project.link?.kind === 'internal'}
						<a href={resolve(project.link.href)}>
							{project.link.label} <span aria-hidden="true">→</span>
						</a>
					{:else if project.link?.kind === 'external'}
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a href={project.link.href} target="_blank" rel="noopener noreferrer">
							{project.link.label} <span aria-hidden="true">↗</span>
							<span class="sr-only">, opens in a new tab</span>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}
				</article>
			</li>
		{/each}
	</ul>
	<a class="work-samples__all" href={resolve('/projects')}>
		More work and experiments <span aria-hidden="true">→</span>
	</a>
</section>

<style>
	.work-samples {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		margin: clamp(2rem, 4vw, 3.5rem) 0 0;
		padding: 0;
		list-style: none;
	}

	.work-samples > li {
		min-width: 0;
	}

	.work-sample {
		display: flex;
		height: 100%;
		flex-direction: column;
		align-items: start;
		border: 1px solid var(--rule);
		border-radius: 0.25rem;
		padding: clamp(1.25rem, 2.2vw, 2rem);
		background: var(--home-panel-solid);
		color: var(--ink);
	}

	.work-sample__status {
		margin: 0 0 1rem;
		color: var(--ink-muted);
		font-family: var(--font-sans);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.work-sample h3 {
		margin: 0;
		font-size: clamp(1.5rem, 2.3vw, 2.2rem);
		letter-spacing: -0.035em;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.work-sample__description {
		margin: 1rem 0 1.25rem;
		color: var(--ink-muted);
		font-size: 0.96rem;
		line-height: 1.65;
		text-align: left;
	}

	.work-sample a,
	.work-samples__all {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.4rem;
		color: var(--ink);
		font-family: var(--font-sans);
		font-size: 0.86rem;
		font-weight: 700;
		text-underline-offset: 0.3rem;
	}

	.work-sample a {
		margin-top: auto;
	}

	.work-samples__all {
		margin-top: 1rem;
	}

	.work-sample a:focus-visible,
	.work-samples__all:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 0.25rem;
	}

	@media (min-width: 56rem) {
		.work-samples {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
