<script lang="ts">
	import '@fontsource-variable/source-serif-4/standard.css';
	import '@fontsource-variable/source-serif-4/wght-italic.css';
	import '@fontsource-variable/noto-serif-bengali/wght.css';
	import robotoLatinUrl from '@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2?url';
	import '../app.css';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import { dev } from '$app/environment';
	import { onMount } from 'svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';

	let { children } = $props();

	onMount(() => {
		injectAnalytics({ mode: dev ? 'development' : 'production' });
		injectSpeedInsights();
	});
</script>

<svelte:head>
	<link rel="preload" href={robotoLatinUrl} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<a href="#main-content" class="skip-link">Skip to main content</a>

	<Header />

	<main id="main-content" tabindex="-1" class="flex-1 scroll-smooth focus:outline-none">
		<div class="container mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
			{@render children()}
		</div>
	</main>

	<Footer />
</div>
