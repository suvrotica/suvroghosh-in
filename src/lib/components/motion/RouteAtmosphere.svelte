<script lang="ts">
	import { onMount, tick, type Component } from 'svelte';
	import { shouldRunAmbientField } from '$lib/motion/preferences';
	import type { ResolvedMotion, RouteMotionConfig } from '$lib/motion/types';

	type AmbientFieldProps = {
		pathname: string;
		config: RouteMotionConfig;
		motion: ResolvedMotion;
		active?: boolean;
	};

	let {
		pathname,
		config
	}: {
		pathname: string;
		config: RouteMotionConfig;
	} = $props();

	let clientReady = $state(false);
	let documentVisible = $state(true);
	let mediaAllowsDecoration = $state(true);
	let rootAllowsDecoration = $state(true);
	let headerRegionVisible = $state(true);
	let motion = $state<ResolvedMotion>('gentle');
	let CanvasField = $state<Component<AmbientFieldProps> | null>(null);
	let loadingCanvas = false;
	let canvasLoadFailed = false;
	let routePhase = $state<'a' | 'b'>('a');
	let previousPathname = $state<string | null>(null);

	function resolvedMotionFromRoot(): ResolvedMotion {
		const root = document.documentElement;
		const value = root.dataset.motion;
		return value === 'still' || value === 'alive' ? value : 'gentle';
	}

	onMount(() => {
		documentVisible = document.visibilityState === 'visible';

		const forcedColours = window.matchMedia('(forced-colors: active)');
		const print = window.matchMedia('print');
		const syncRootPreferences = () => {
			const root = document.documentElement;
			motion = resolvedMotionFromRoot();
			rootAllowsDecoration = root.dataset.theme !== 'high-contrast';
		};
		const updateMedia = () => {
			mediaAllowsDecoration = !forcedColours.matches && !print.matches;
		};
		const updateVisibility = () => {
			documentVisible = document.visibilityState === 'visible';
		};
		const rootObserver =
			typeof MutationObserver === 'undefined' ? null : new MutationObserver(syncRootPreferences);

		syncRootPreferences();
		updateMedia();
		clientReady = true;
		forcedColours.addEventListener('change', updateMedia);
		print.addEventListener('change', updateMedia);
		document.addEventListener('visibilitychange', updateVisibility);
		rootObserver?.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion', 'data-theme']
		});

		return () => {
			clientReady = false;
			forcedColours.removeEventListener('change', updateMedia);
			print.removeEventListener('change', updateMedia);
			document.removeEventListener('visibilitychange', updateVisibility);
			rootObserver?.disconnect();
		};
	});

	$effect(() => {
		const currentPathname = pathname;
		if (previousPathname === null) {
			previousPathname = currentPathname;
			return;
		}
		if (currentPathname === previousPathname) return;

		previousPathname = currentPathname;
		routePhase = routePhase === 'a' ? 'b' : 'a';
	});

	$effect(() => {
		const currentPath = pathname;
		const headerScoped = config.scope === 'header';
		if (!clientReady || !headerScoped) {
			headerRegionVisible = true;
			return;
		}

		headerRegionVisible = false;
		let cancelled = false;
		let observer: IntersectionObserver | null = null;

		void tick().then(() => {
			if (cancelled || currentPath !== pathname) return;
			const region = document.querySelector<HTMLElement>('[data-route-atmosphere-region]');
			if (!region || typeof IntersectionObserver === 'undefined') {
				return;
			}

			observer = new IntersectionObserver(
				(entries) => {
					headerRegionVisible = entries[0]?.isIntersecting ?? false;
				},
				{ root: null, rootMargin: '80px 0px 0px', threshold: 0 }
			);
			observer.observe(region);
		});

		return () => {
			cancelled = true;
			observer?.disconnect();
		};
	});

	let canvasRouteEligible = $derived(
		clientReady &&
			mediaAllowsDecoration &&
			rootAllowsDecoration &&
			shouldRunAmbientField(config, motion)
	);
	let canvasActive = $derived(canvasRouteEligible && documentVisible && headerRegionVisible);

	$effect(() => {
		if (!canvasActive || CanvasField || loadingCanvas || canvasLoadFailed) return;
		loadingCanvas = true;

		void import('./AmbientField.svelte')
			.then((module) => {
				if (clientReady) CanvasField = module.default;
			})
			.catch(() => {
				// The static SSR atmosphere remains the complete fallback if the chunk fails.
				canvasLoadFailed = true;
			})
			.finally(() => {
				loadingCanvas = false;
			});
	});
</script>

<div
	class="route-atmosphere"
	data-route-atmosphere
	data-biome={config.biome}
	data-intensity={config.intensity}
	data-ambient={config.ambient}
	data-scope={config.scope ?? 'viewport'}
	data-active={headerRegionVisible}
	data-route-phase={routePhase}
	aria-hidden="true"
>
	{#if config.biome !== 'off'}
		<div class="route-atmosphere__wash"></div>
		<div class="route-atmosphere__lines"></div>
		{#if canvasRouteEligible && CanvasField}
			<CanvasField {pathname} {config} {motion} active={canvasActive} />
		{/if}
	{/if}
</div>
