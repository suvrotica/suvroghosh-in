<script lang="ts">
	import SEO from '$lib/components/seo/SEO.svelte';
	import { siteSEO, personSchema, websiteSchema } from '$lib/components/seo/SEO';
	import ScrollReveal from '$lib/components/animation/ScrollReveal.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<SEO
	{...siteSEO}
	schema={{
		'@context': 'https://schema.org',
		'@graph': [personSchema, websiteSchema]
	}}
/>

<section class="page-enter mb-12">
	<div
		class="relative overflow-hidden rounded-xl border border-neutral-300 bg-gradient-to-br from-neutral-100 to-neutral-200 p-8 md:p-12 dark:border-neutral-700 dark:from-neutral-800/60 dark:to-neutral-900"
	>
		<div
			class="absolute top-0 right-0 -mt-16 -mr-16 h-48 w-48 rounded-full bg-neutral-400/5 blur-3xl"
			aria-hidden="true"
		></div>

		<div class="relative">
			<p class="mb-3 text-sm font-semibold tracking-widest text-neutral-400 uppercase">
				Healthcare IT &middot; Interoperability &middot; Applied AI &middot; Calcutta
			</p>
			<h1 class="mb-4 text-4xl font-bold text-neutral-900 md:text-6xl dark:text-neutral-100">
				Suvro Ghosh
			</h1>
			<p class="mb-4 text-xl font-semibold text-neutral-700 md:text-2xl dark:text-neutral-300">
				Healthcare IT Architect &amp; Clinical Data Systems Consultant
			</p>
			<p
				class="max-w-2xl text-base leading-relaxed text-neutral-700 md:text-lg dark:text-neutral-300"
			>
				I work on healthcare data systems, interoperability, clinical data architecture, and
				AI-ready health information infrastructure. I also write essays and satire on technology,
				illness, corruption, society, and ordinary life in Calcutta.
			</p>

			<div class="mt-8 flex flex-wrap gap-3">
				<Button href="/resume" size="lg">View Resume</Button>
				<Button href="/consulting" variant="outline" size="lg">Healthcare IT Consulting</Button>
				<Button href="/writing" variant="outline" size="lg">Writing &amp; Essays</Button>
				<Button href="/contact" variant="ghost" size="lg">Contact</Button>
			</div>
		</div>
	</div>
</section>

<ScrollReveal>
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
		<div class="card">
			<h2 class="mb-2 text-xl font-bold text-neutral-900 dark:text-neutral-100">Professional</h2>
			<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				Healthcare IT, HL7/FHIR, HIE, clinical data systems, SQL/ETL, health informatics, and
				AI-ready healthcare data architecture. Open to Gulf, remote, hybrid, consulting, and
				advisory opportunities.
			</p>
			<div class="mt-4 flex flex-wrap gap-2">
				<a
					href="/resume"
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-400 dark:text-neutral-400"
					>Resume</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href="/consulting"
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-400 dark:text-neutral-400"
					>Consulting</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href="/healthcare-it-gulf"
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-400 dark:text-neutral-400"
					>Gulf / Kuwait</a
				>
			</div>
		</div>

		<div class="card">
			<h2 class="mb-2 text-xl font-bold text-neutral-900 dark:text-neutral-100">Writing</h2>
			<p class="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
				Essays, satire, fiction, sketches, and reflections on technology, illness, corruption,
				social decay, and Calcutta life. Personal, analytical, sometimes comic, sometimes dark, and
				intentionally human.
			</p>
			<div class="mt-4 flex flex-wrap gap-2">
				<a
					href="/writing"
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-400 dark:text-neutral-400"
					>Writing &amp; Essays</a
				>
				<span class="text-neutral-400">&middot;</span>
				<a
					href="/blog"
					class="text-sm font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-400 dark:text-neutral-400"
					>All Posts</a
				>
			</div>
		</div>
	</div>
</ScrollReveal>

<style>
	:global(#main-content > footer) {
		margin-top: 0;
	}
</style>
