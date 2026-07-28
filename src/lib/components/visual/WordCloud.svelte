<script lang="ts">
	import { base } from '$app/paths';
	import type { Attachment } from 'svelte/attachments';

	type Props = {
		slug: string;
		title: string;
		class?: string;
	};

	let { slug, title, class: className = '' }: Props = $props();
	let missingSlug = $state<string | null>(null);

	const imageSrc = $derived(`${base}/wordcloud/${encodeURIComponent(slug)}.svg`);
	const visible = $derived(Boolean(slug) && missingSlug !== slug);

	const watchImageFailure: Attachment<HTMLImageElement> = (image) => {
		const hideMissingImage = () => {
			missingSlug = slug;
		};

		image.addEventListener('error', hideMissingImage);

		if (image.complete && image.naturalWidth === 0) {
			hideMissingImage();
		}

		return () => image.removeEventListener('error', hideMissingImage);
	};
</script>

{#if visible}
	<section class={`word-cloud ${className}`.trim()} aria-labelledby="word-cloud-heading">
		<h2 id="word-cloud-heading">Word Cloud</h2>
		<figure>
			<img
				src={imageSrc}
				alt={`Word cloud for ${title}`}
				loading="lazy"
				decoding="async"
				{@attach watchImageFailure}
			/>
		</figure>
	</section>
{/if}

<style>
	.word-cloud {
		margin-block: 2rem 0;
	}

	.word-cloud h2 {
		margin: 0 0 1.5rem;
		text-align: center;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: uppercase;
		color: rgb(23 23 23);
	}

	.word-cloud figure {
		margin: 0;
		border-radius: 0.5rem;
		border: 1px solid rgba(115, 115, 115, 0.22);
		background: #101114;
		box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
		overflow: hidden;
	}

	.word-cloud img {
		display: block;
		width: 100%;
		max-width: 100%;
		height: auto;
		aspect-ratio: 16 / 9;
		object-fit: cover;
	}

	:global(.dark) .word-cloud h2 {
		color: rgb(245 245 245);
	}

	:global(.dark) .word-cloud figure {
		border-color: rgba(245, 245, 245, 0.16);
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.44);
	}

	@media (max-width: 640px) {
		.word-cloud {
			margin-block-start: 1.5rem;
		}
	}
</style>
