<script lang="ts">
	import { resolve } from '$app/paths';
	import PatientMachineTrace from './PatientMachineTrace.svelte';

	export type FeaturedSeriesPart = Readonly<{
		slug: string;
		categorySlug: string;
		categoryLabel: string;
		title: string;
		description?: string;
		date: string;
		readingTime?: string;
		thumbnail: string;
		imageWidth: number;
		imageHeight: number;
		part: number;
		chapter?: string;
		interactiveFirst: boolean;
	}>;

	export type FeaturedSeries = Readonly<{
		id: string;
		title: string;
		eyebrow: string;
		description: string;
		parts: readonly FeaturedSeriesPart[];
	}>;

	let { series }: { series: FeaturedSeries } = $props();

	function formatPartNumber(part: number) {
		return String(part).padStart(2, '0');
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(new Date(value));
	}

	function splitArticleTitle(title: string) {
		const separatorIndex = title.indexOf(':');
		if (separatorIndex === -1) return { title, subtitle: '' };

		return {
			title: title.slice(0, separatorIndex).trim(),
			subtitle: title.slice(separatorIndex + 1).trim()
		};
	}
</script>

<section
	class="home-breakout featured-series"
	aria-labelledby="featured-series-heading"
	data-featured-series={series.id}
	data-scene-section
	data-scene-state="patient"
>
	<div class="featured-series__intro">
		<div class="featured-series__intro-copy">
			<p class="featured-series__index">Index 02 / A human signal</p>
			<p class="featured-series__eyebrow">{series.eyebrow}</p>
			<h2 id="featured-series-heading">{series.title}</h2>
			<p class="featured-series__description">{series.description}</p>
		</div>
		<div class="featured-series__summary" aria-label="Published series installments">
			<strong class="featured-series__count">{formatPartNumber(series.parts.length)}</strong>
			<span>{series.parts.length === 1 ? 'installment published' : 'installments published'}</span>
		</div>
	</div>

	<div class="featured-series__hinge">
		<PatientMachineTrace />

		<ol class="featured-series__list" aria-label={`${series.title} installments`} data-series-list>
			{#each series.parts as part (part.slug)}
				{@const displayTitle = splitArticleTitle(part.title)}
				<li class="featured-series__item" data-series-part={part.part}>
					<a
						class="featured-series__card"
						href={resolve('/blog/[category]/[slug]', {
							category: part.categorySlug,
							slug: part.slug
						})}
					>
						<figure class="featured-series__media" aria-hidden="true">
							<img
								class="featured-series__image"
								src={part.thumbnail}
								alt=""
								width={part.imageWidth}
								height={part.imageHeight}
								loading="lazy"
								decoding="async"
							/>
						</figure>

						<div class="featured-series__content">
							<p class="featured-series__part">
								<span>Part {formatPartNumber(part.part)}</span>
								{#if part.chapter}
									<span aria-hidden="true">·</span>
									<span>{part.chapter}</span>
								{/if}
							</p>
							<h3 class="featured-series__title">{displayTitle.title}</h3>
							{#if displayTitle.subtitle}
								<p class="featured-series__subtitle">{displayTitle.subtitle}</p>
								{#if part.description}
									<p class="featured-series__part-description">{part.description}</p>
								{/if}
							{:else if part.description}
								<p class="featured-series__subtitle">{part.description}</p>
							{/if}
							<p class="featured-series__meta">
								<span
									>{part.interactiveFirst ? 'Interactive visual essay' : part.categoryLabel}</span
								>
								{#if part.readingTime}
									<span aria-hidden="true">·</span>
									<span>{part.readingTime}</span>
								{/if}
								<span aria-hidden="true">·</span>
								<time datetime={part.date}>{formatDate(part.date)}</time>
							</p>
							<span class="featured-series__cta">
								Enter Part {part.part} <span aria-hidden="true">→</span>
							</span>
						</div>
					</a>
				</li>
			{/each}
		</ol>
	</div>

	<p class="featured-series__status">
		The route is an editorial metaphor, not a clinical workflow model. New parts will join this
		index as they are published.
	</p>
</section>
