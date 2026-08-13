<script lang="ts">
	import '@fontsource-variable/source-serif-4/standard.css';
	import '@fontsource-variable/source-serif-4/wght-italic.css';
	import '@fontsource-variable/noto-serif-bengali/wght.css';
	import robotoLatinUrl from '@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2?url';
	import '../app.css';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import { dev } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import Footer from '$lib/components/layout/Footer.svelte';
	import RouteAtmosphere from '$lib/components/motion/RouteAtmosphere.svelte';
	import { normaliseMotionPreference, resolveMotion } from '$lib/motion/preferences';
	import { resolveRouteMotion, shouldUseViewTransition } from '$lib/motion/route-biomes';
	import type { ResolvedMotion } from '$lib/motion/types';

	type PageDataShellContext = {
		game?: {
			shell?: unknown;
		};
		metadata?: {
			rawThoughtLayout?: unknown;
		};
	};

	function resolveRawThoughtLayout(data: unknown) {
		if (data == null || typeof data !== 'object') return undefined;

		const metadata = (data as PageDataShellContext).metadata;
		return typeof metadata?.rawThoughtLayout === 'string' ? metadata.rawThoughtLayout : undefined;
	}

	let { children } = $props();
	let routeMotion = $derived(resolveRouteMotion(page.url.pathname));
	let routeEssayInk = $derived(
		typeof (page.data as Record<string, unknown>).essayInk === 'string'
			? ((page.data as Record<string, unknown>).essayInk as string)
			: undefined
	);
	let rawThoughtLayout = $derived(resolveRawThoughtLayout(page.data));
	let studioShell = $derived(
		page.url.pathname === '/notes/studio' || page.url.pathname.startsWith('/notes/studio/')
	);
	let immersiveGameShell = $derived(
		page.url.pathname.startsWith('/blog/games/') &&
			(page.data as PageDataShellContext).game?.shell === 'immersive'
	);
	let wideSiteGameShell = $derived(
		page.url.pathname.startsWith('/blog/games/') &&
			(page.data as PageDataShellContext).game?.shell === 'site'
	);

	function resolvedMotion(): ResolvedMotion {
		const value = document.documentElement.dataset.motion;
		return value === 'still' || value === 'alive' ? value : 'gentle';
	}

	onNavigate((navigation) => {
		const from = navigation.from?.url;
		const to = navigation.to?.url;

		if (typeof document.startViewTransition !== 'function') {
			document.documentElement.dataset.viewTransitions = 'unavailable';
			return;
		}

		if (
			navigation.willUnload ||
			!from ||
			!to ||
			!shouldUseViewTransition(from.pathname, to.pathname, resolvedMotion())
		) {
			return;
		}

		return new Promise<void>((navigationMayContinue) => {
			try {
				const transition = document.startViewTransition(async () => {
					navigationMayContinue();
					await navigation.complete;
				});

				void transition.finished.catch(() => {
					// Navigation already owns error handling; animation failure is non-fatal.
				});
			} catch {
				// A partial or failing implementation must never block normal navigation.
				document.documentElement.dataset.viewTransitions = 'unavailable';
				navigationMayContinue();
			}
		});
	});

	$effect(() => {
		document.documentElement.dataset.biome = routeMotion.biome;
	});

	onMount(() => {
		injectAnalytics({ mode: dev ? 'development' : 'production' });
		injectSpeedInsights();

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const enforceSystemMotion = () => {
			const root = document.documentElement;
			const preference = normaliseMotionPreference(root.dataset.motionPreference);
			root.dataset.motion = resolveMotion(preference, reducedMotion.matches);
		};

		document.documentElement.dataset.viewTransitions =
			typeof document.startViewTransition === 'function' ? 'available' : 'unavailable';
		enforceSystemMotion();
		reducedMotion.addEventListener('change', enforceSystemMotion);

		return () => {
			reducedMotion.removeEventListener('change', enforceSystemMotion);
		};
	});
</script>

<svelte:head>
	<link rel="preload" href={robotoLatinUrl} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

{#if studioShell}
	<div class="min-h-dvh">
		<a href="#main-content" class="skip-link">Skip to canvas and studio controls</a>
		<main id="main-content" tabindex="-1" class="min-h-dvh focus:outline-none">
			{@render children()}
		</main>
	</div>
{:else if immersiveGameShell}
	<div class="min-h-svh bg-[#171612]">
		<a href="#main-content" class="skip-link">Skip to game and controls</a>
		<main id="main-content" tabindex="-1" class="min-h-svh focus:outline-none">
			{@render children()}
		</main>
	</div>
{:else if rawThoughtLayout}
	<div class="min-h-dvh" data-raw-thought-layout={rawThoughtLayout}>
		<a href="#main-content" class="skip-link">Skip to essay</a>
		<main id="main-content" tabindex="-1" class="min-h-dvh w-full focus:outline-none">
			{@render children()}
		</main>
	</div>
{:else}
	<div
		class="site-shell flex min-h-dvh flex-col"
		data-biome={routeMotion.biome}
		data-motion-intensity={routeMotion.intensity}
		data-essay-ink={routeEssayInk}
	>
		<a href="#main-content" class="skip-link">Skip to main content</a>

		{#if routeMotion.biome !== 'off'}
			<RouteAtmosphere pathname={page.url.pathname} config={routeMotion} />
		{/if}

		<Header />

		<main id="main-content" tabindex="-1" class="flex-1 scroll-smooth focus:outline-none">
			{#if wideSiteGameShell}
				<div class="w-full min-w-0">
					{@render children()}
				</div>
			{:else}
				<div class="container mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
					{@render children()}
				</div>
			{/if}
		</main>

		<Footer />
	</div>
{/if}
