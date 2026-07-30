<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import ResourceCatalogue from '$lib/components/resources/ResourceCatalogue.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO {...data.seo} />

<section class="page-enter mx-auto max-w-4xl" data-field-kit-index>
	<header
		class="field-kit-header relative overflow-hidden border-y border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900/75"
		data-route-atmosphere-region
		data-route-scene="writing"
	>
		<div class="grid items-stretch md:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.85fr)]">
			<div class="relative z-10 px-5 py-8 sm:px-8 sm:py-10">
				<p
					class="mb-3 text-xs font-bold tracking-[0.2em] text-neutral-500 uppercase dark:text-neutral-400"
				>
					Resources
				</p>
				<h1
					class="m-0 max-w-xl text-4xl leading-none font-bold tracking-tight text-neutral-950 sm:text-5xl dark:text-neutral-50"
				>
					The Field Kit
				</h1>
				<p
					class="mt-5 mb-0 max-w-2xl text-left text-lg leading-relaxed text-neutral-700 dark:text-neutral-300"
				>
					A practical collection of reusable prompts, word lists, checklists, templates and compact
					reference material.
				</p>
				<p
					class="mt-4 mb-0 max-w-xl text-left text-sm leading-relaxed text-neutral-500 dark:text-neutral-400"
				>
					Built to be copied, adapted, annotated and put back to work.
				</p>
			</div>

			<div
				class="relative min-h-52 border-t border-neutral-300 bg-neutral-200 md:min-h-full md:border-t-0 md:border-l dark:border-neutral-700 dark:bg-neutral-800"
			>
				<img
					src={data.fieldKitImage.src}
					alt={data.fieldKitImage.alt}
					width={data.fieldKitImage.width}
					height={data.fieldKitImage.height}
					loading="eager"
					fetchpriority="high"
					decoding="async"
					class="absolute inset-0 h-full w-full object-cover"
				/>
			</div>
		</div>
	</header>

	<ResourceCatalogue prompts={data.prompts} lists={data.lists} />
</section>

<style>
	.field-kit-header::after {
		position: absolute;
		inset: 0;
		pointer-events: none;
		content: '';
		background-image: radial-gradient(rgb(82 82 82 / 0.14) 0.65px, transparent 0.65px);
		background-size: 16px 16px;
		mask-image: linear-gradient(90deg, black, transparent 70%);
	}
</style>
