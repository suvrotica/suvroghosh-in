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
	import { Sheet, SheetContent } from '$lib/components/ui/sheet';

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

<ReadingProgress />

<div
	class="main-layout flex h-screen overflow-hidden bg-neutral-200 font-sans text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
>
	<div
		class="sidebar-container hidden w-72 border-r border-neutral-300 lg:block dark:border-neutral-700"
	>
		<Aside />
	</div>

	<Sheet bind:open={isMenuOpen}>
		<SheetContent side="left" class="w-64 p-0 lg:hidden">
			<Aside />
		</SheetContent>
	</Sheet>

	<div class="main-content flex min-w-0 flex-1 flex-col">
		<Header {isMenuOpen} {toggleMenu} />

		<main class="scrollable-main flex-1 overflow-y-auto scroll-smooth">
			<div class="container mx-auto max-w-4xl px-4 py-8 lg:py-12">
				{@render children()}
			</div>

			<Footer />
		</main>
	</div>
</div>
