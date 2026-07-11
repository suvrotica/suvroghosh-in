<script lang="ts">
	import '../app.css';
	import 'katex/dist/katex.min.css';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import { dev } from '$app/environment';
	import { onMount } from 'svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import ReadingProgress from '$lib/components/animation/ReadingProgress.svelte';

	let { children } = $props();

	onMount(() => {
		injectAnalytics({ mode: dev ? 'development' : 'production' });
		injectSpeedInsights();
	});
</script>

<ReadingProgress />

<div class="flex min-h-dvh flex-col">
	<a href="#main-content" class="skip-link">Skip to main content</a>

	<Header />

	<main id="main-content" tabindex="-1" class="flex-1 scroll-smooth focus:outline-none">
		<div class="container mx-auto max-w-4xl px-4 py-8 lg:py-12">
			{@render children()}
		</div>
	</main>

	<Footer />
</div>
