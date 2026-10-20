<script lang="ts">
	import { resolve } from '$app/paths';

	type FieldWay = Readonly<{
		id: 'systems' | 'laboratory' | 'writing' | 'calcutta';
		title: string;
		description: string;
		href: string;
		motionLabel: string;
	}>;

	const ways: readonly FieldWay[] = [
		{
			id: 'systems',
			title: 'Work',
			description: 'Software, creative tools, independent experiments, and earlier systems work.',
			href: resolve('/projects'),
			motionLabel: 'Ideas taking shape in working systems'
		},
		{
			id: 'laboratory',
			title: 'Laboratory',
			description: 'Simulations, mathematical models, visualizations, and games.',
			href: resolve('/blog/visualizations'),
			motionLabel: 'Oscillations, phases, waves, and reorganizing geometries'
		},
		{
			id: 'writing',
			title: 'Writing',
			description: 'Essays, satire, fiction, technology, illness, and corruption.',
			href: resolve('/writing'),
			motionLabel: 'Ink, annotations, margins, and fragments of type'
		},
		{
			id: 'calcutta',
			title: 'Calcutta',
			description: 'Place, memory, streets, weather, and ordinary human systems.',
			href: resolve('/topics/[slug]', { slug: 'calcutta' }),
			motionLabel: 'Windows, tram-like paths, haze, and the street grid'
		}
	];
</script>

<section
	class="home-breakout field-ways"
	aria-labelledby="field-ways-heading"
	data-field-ways
	data-scene-section
>
	<header class="field-ways__intro">
		<p class="field-ways__index">Index 01 / Four behaviours</p>
		<h2 id="field-ways-heading">Four ways through the field</h2>
		<p class="field-ways__description">
			Try something I’ve made, follow a scientific idea, read a story, or walk through a city. These
			are different ways into the same curiosity.
		</p>
	</header>

	<nav class="field-ways__navigation" aria-label="Four ways through the Living Index">
		<ol class="field-ways__list">
			{#each ways as way, index (way.id)}
				<li class="field-ways__item" data-field-way={way.id} data-scene-state={way.id}>
					<!-- Each card remains a complete destination when the environmental scene is absent. -->
					<!-- Internal hrefs are resolved in the typed route definition above. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class="field-way-card field-way-card--{way.id}"
						href={way.href}
						data-scene-destination={way.id}
						aria-describedby={`field-way-${way.id}-description`}
					>
						<span class="field-way-card__number" aria-hidden="true">
							{String(index + 1).padStart(2, '0')}
						</span>
						<span class="field-way-card__trace" aria-hidden="true">
							<span></span><span></span><span></span><span></span>
						</span>
						<h3>{way.title}</h3>
						<span id={`field-way-${way.id}-description`} class="field-way-card__description">
							{way.description}
						</span>
						<span class="field-way-card__motion-note">{way.motionLabel}</span>
						<span class="field-way-card__action">
							Enter {way.title} <span aria-hidden="true">→</span>
						</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</li>
			{/each}
		</ol>
	</nav>
</section>
