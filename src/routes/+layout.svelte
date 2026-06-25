<script lang="ts">
	import '../app.css';
	import 'katex/dist/katex.min.css';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import { dev } from '$app/environment';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import ReadingProgress from '$lib/components/animation/ReadingProgress.svelte';

	let { children } = $props();

	injectAnalytics({ mode: dev ? 'development' : 'production' });
	injectSpeedInsights();
</script>

<ReadingProgress />

<a href="#main-content" class="skip-link">Skip to main content</a>

<Header />

<main id="main-content" class="scrollable-main flex-1 overflow-y-auto scroll-smooth">
	<div class="container mx-auto max-w-4xl px-4 py-8 lg:py-12">
		{@render children()}
	</div>
	<Footer />
</main>
