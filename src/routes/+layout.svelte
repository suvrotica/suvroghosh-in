<script lang="ts">
	import '../app.css';
	import 'katex/dist/katex.min.css';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import { dev } from '$app/environment';
	import { afterNavigate } from '$app/navigation';

	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import Aside from '$lib/components/layout/Aside.svelte';
	import ReadingProgress from '$lib/components/animation/ReadingProgress.svelte';

	let { children } = $props();

	let isMenuOpen = $state(false);

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	afterNavigate(() => {
		isMenuOpen = false;
	});

	injectAnalytics({ mode: dev ? 'development' : 'production' });
	injectSpeedInsights();
</script>

<svelte:head>
	<script>
		// Prevent dark-mode flash: apply stored/system preference before first paint
		(function () {
			try {
				var stored = localStorage.getItem('theme-preference');
				var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				var isDark = stored ? stored === 'dark' : prefersDark;
				if (isDark) document.documentElement.classList.add('dark');
				else document.documentElement.classList.remove('dark');
			} catch (e) {}
		})();
	</script>
</svelte:head>

<ReadingProgress />

<div class="main-layout flex h-screen bg-neutral-200 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-300 font-sans overflow-hidden">
	<div class="sidebar-container hidden lg:block w-72 border-r border-neutral-300 dark:border-neutral-700">
		<Aside />
	</div>

	{#if isMenuOpen}
		<div class="fixed inset-0 z-40 bg-black/50 lg:hidden" onclick={toggleMenu} role="presentation" aria-hidden="true"></div>
		<div class="fixed inset-y-0 left-0 z-50 w-64 bg-neutral-100 dark:bg-neutral-900 shadow-xl transform transition-transform duration-300 lg:hidden">
			<Aside />
		</div>
	{/if}

	<div class="main-content flex-1 flex flex-col min-w-0">
		<Header {isMenuOpen} {toggleMenu} />

		<main class="scrollable-main flex-1 overflow-y-auto scroll-smooth">
			<div class="container max-w-4xl mx-auto px-4 py-8 lg:py-12">
				{@render children()}
			</div>

			<Footer />
		</main>
	</div>
</div>