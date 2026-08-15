<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		LivingIndexController,
		LivingIndexMotion,
		LivingIndexPalette,
		LivingIndexTier
	} from './living-index-scene';

	const nodes = [
		[8, 18, 'system'],
		[19, 34, 'quiet'],
		[29, 14, 'human'],
		[42, 43, 'system'],
		[54, 21, 'quiet'],
		[67, 38, 'human'],
		[79, 16, 'system'],
		[91, 32, 'quiet'],
		[13, 71, 'human'],
		[27, 58, 'quiet'],
		[39, 78, 'system'],
		[52, 63, 'human'],
		[65, 82, 'quiet'],
		[77, 61, 'system'],
		[90, 76, 'human']
	] as const;

	type PublicTier = LivingIndexTier | 'C';
	type NetworkInformation = EventTarget & { saveData?: boolean };
	type NavigatorWithHints = Navigator & {
		connection?: NetworkInformation;
		deviceMemory?: number;
	};
	type IdleWindow = Window & {
		requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
		cancelIdleCallback?: (handle: number) => void;
	};

	let environment: HTMLDivElement;
	let stage: HTMLDivElement;
	let tier: PublicTier = 'C';
	let status = 'fallback';

	function cssHex(styles: CSSStyleDeclaration, property: string, fallback: string): string {
		const value = styles.getPropertyValue(property).trim();
		return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
	}

	function readPalette(): LivingIndexPalette {
		const styles = window.getComputedStyle(environment);
		const night = document.documentElement.dataset.theme === 'night';
		return {
			background: cssHex(styles, '--paper', night ? '#141311' : '#f7f2e7'),
			line: cssHex(styles, '--home-field-line', night ? '#625f58' : '#776e60'),
			node: cssHex(styles, '--home-field-node', night ? '#9ac5b4' : '#405f59'),
			system: cssHex(styles, '--home-system', night ? '#74b7bb' : '#1f7379'),
			human: cssHex(styles, '--home-human', night ? '#d16f4d' : '#b14b32')
		};
	}

	function resolvedMotion(): LivingIndexMotion {
		return document.documentElement.dataset.motion === 'alive' ? 'alive' : 'gentle';
	}

	function chooseTier(
		reducedMotion: MediaQueryList,
		forcedColours: MediaQueryList,
		printing: MediaQueryList,
		coarsePointer: MediaQueryList
	): PublicTier {
		const root = document.documentElement;
		const query = new URLSearchParams(window.location.search);
		const navigatorWithHints = navigator as NavigatorWithHints;
		if (
			query.get('webgl') === 'off' ||
			query.get('scene') === 'static' ||
			root.dataset.motion === 'still' ||
			root.dataset.theme === 'high-contrast' ||
			reducedMotion.matches ||
			forcedColours.matches ||
			printing.matches ||
			navigatorWithHints.connection?.saveData === true
		) {
			return 'C';
		}

		const compact = window.innerWidth <= 820 || coarsePointer.matches;
		const constrainedProcessor = (navigator.hardwareConcurrency || 4) <= 4;
		const constrainedMemory =
			navigatorWithHints.deviceMemory !== undefined && navigatorWithHints.deviceMemory <= 4;
		return compact || constrainedProcessor || constrainedMemory ? 'B' : 'A';
	}

	onMount(() => {
		let controller: LivingIndexController | null = null;
		let cancelled = false;
		let importGeneration = 0;
		let idleHandle = 0;
		let idleUsesTimeout = false;
		let narrativeVisible = true;
		let sceneFailed = false;
		let webgl2Available: boolean | undefined;

		const idleWindow = window as IdleWindow;
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const forcedColours = window.matchMedia('(forced-colors: active)');
		const printing = window.matchMedia('print');
		const coarsePointer = window.matchMedia('(pointer: coarse)');
		const navigatorWithHints = navigator as NavigatorWithHints;

		function clearIdle(): void {
			if (!idleHandle) return;
			if (idleUsesTimeout) window.clearTimeout(idleHandle);
			else idleWindow.cancelIdleCallback?.(idleHandle);
			idleHandle = 0;
		}

		function releaseCanvasContext(canvas: HTMLCanvasElement): void {
			try {
				canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
			} catch {
				// A failed provisional renderer may no longer expose its context.
			}
			canvas.width = 0;
			canvas.height = 0;
			canvas.remove();
		}

		function canCreateWebGL2(): boolean {
			if (webgl2Available !== undefined) return webgl2Available;
			const probe = document.createElement('canvas');
			try {
				const context = probe.getContext('webgl2', {
					alpha: true,
					antialias: false,
					powerPreference: 'low-power'
				});
				webgl2Available = context !== null;
				context?.getExtension('WEBGL_lose_context')?.loseContext();
			} catch {
				webgl2Available = false;
			}
			probe.width = 0;
			probe.height = 0;
			return webgl2Available;
		}

		function destroyScene(nextStatus = 'fallback'): void {
			importGeneration += 1;
			clearIdle();
			const current = controller;
			controller = null;
			try {
				current?.dispose();
			} catch {
				// Continue releasing a partially constructed renderer below.
			}
			for (const leakedCanvas of stage.querySelectorAll('canvas')) {
				releaseCanvasContext(leakedCanvas);
			}
			status = nextStatus;
		}

		async function initialiseScene(generation: number): Promise<void> {
			try {
				if (!canCreateWebGL2()) {
					sceneFailed = true;
					tier = 'C';
					status = 'failed';
					return;
				}
				const module = await import('./living-index-scene');
				if (cancelled || generation !== importGeneration) return;
				const currentTier = chooseTier(reducedMotion, forcedColours, printing, coarsePointer);
				if (currentTier === 'C') {
					tier = 'C';
					status = 'fallback';
					return;
				}
				controller = module.createLivingIndexScene({
					host: stage,
					diagnostics: environment,
					tier: currentTier,
					motion: resolvedMotion(),
					palette: readPalette(),
					onFailure: () => {
						sceneFailed = true;
						destroyScene('failed');
						tier = 'C';
					}
				});
				tier = currentTier;
				status = narrativeVisible && document.visibilityState === 'visible' ? 'running' : 'paused';
				controller.setVisible(narrativeVisible && document.visibilityState === 'visible');
				controller.refreshNarrative();
			} catch {
				if (cancelled || generation !== importGeneration) return;
				sceneFailed = true;
				destroyScene('failed');
				tier = 'C';
			}
		}

		function scheduleInitialisation(): void {
			if (controller || idleHandle) return;
			const generation = ++importGeneration;
			status = 'queued';
			const load = () => {
				idleHandle = 0;
				void initialiseScene(generation);
			};
			if (idleWindow.requestIdleCallback) {
				idleUsesTimeout = false;
				idleHandle = idleWindow.requestIdleCallback(load, { timeout: 900 });
			} else {
				idleUsesTimeout = true;
				idleHandle = window.setTimeout(load, 60);
			}
		}

		function syncPreferences(): void {
			if (cancelled) return;
			if (sceneFailed) {
				tier = 'C';
				status = 'failed';
				return;
			}
			const nextTier = chooseTier(reducedMotion, forcedColours, printing, coarsePointer);
			if (nextTier === 'C') {
				tier = 'C';
				destroyScene('fallback');
				return;
			}

			tier = nextTier;
			if (!controller) {
				scheduleInitialisation();
				return;
			}
			controller.setTier(nextTier);
			controller.setMotion(resolvedMotion());
			controller.setPalette(readPalette());
			controller.setVisible(narrativeVisible && document.visibilityState === 'visible');
		}

		function updateVisibility(): void {
			const nextVisible = narrativeVisible && document.visibilityState === 'visible';
			controller?.setVisible(nextVisible);
			if (controller) status = nextVisible ? 'running' : 'paused';
		}

		const rootObserver = new MutationObserver(syncPreferences);
		rootObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion', 'data-theme']
		});

		const narrativeRoot = document.querySelector<HTMLElement>('[data-living-home]');
		const narrativeObserver =
			typeof IntersectionObserver === 'undefined' || !narrativeRoot
				? null
				: new IntersectionObserver(
						(entries) => {
							narrativeVisible = entries[0]?.isIntersecting ?? true;
							updateVisibility();
						},
						{ rootMargin: '40% 0px 40%', threshold: 0 }
					);
		if (narrativeObserver && narrativeRoot) narrativeObserver.observe(narrativeRoot);

		for (const media of [reducedMotion, forcedColours, printing, coarsePointer]) {
			media.addEventListener('change', syncPreferences);
		}
		document.addEventListener('visibilitychange', updateVisibility);
		window.addEventListener('resize', syncPreferences, { passive: true });
		navigatorWithHints.connection?.addEventListener('change', syncPreferences);
		syncPreferences();

		return () => {
			cancelled = true;
			destroyScene('disposed');
			rootObserver.disconnect();
			narrativeObserver?.disconnect();
			for (const media of [reducedMotion, forcedColours, printing, coarsePointer]) {
				media.removeEventListener('change', syncPreferences);
			}
			document.removeEventListener('visibilitychange', updateVisibility);
			window.removeEventListener('resize', syncPreferences);
			navigatorWithHints.connection?.removeEventListener('change', syncPreferences);
		};
	});
</script>

<div
	bind:this={environment}
	class="living-index-environment"
	data-living-index-scene
	data-scene-tier={tier}
	data-scene-status={status}
	aria-hidden="true"
>
	<div bind:this={stage} class="living-index-stage">
		<div class="living-index-fallback" data-living-index-fallback>
			<span class="living-index-fallback__wash"></span>
			<span class="living-index-fallback__contour living-index-fallback__contour--a"></span>
			<span class="living-index-fallback__contour living-index-fallback__contour--b"></span>
			<span class="living-index-fallback__contour living-index-fallback__contour--c"></span>
			<span class="living-index-fallback__route living-index-fallback__route--a"></span>
			<span class="living-index-fallback__route living-index-fallback__route--b"></span>
			<span class="living-index-fallback__route living-index-fallback__route--c"></span>
			{#each nodes as node, index (`${node[0]}-${node[1]}-${index}`)}
				<span
					class="living-index-fallback__node living-index-fallback__node--{node[2]}"
					style={`--node-x: ${node[0]}%; --node-y: ${node[1]}%;`}
				></span>
			{/each}
			<span class="living-index-fallback__coordinate living-index-fallback__coordinate--north"
				>22.5726 N</span
			>
			<span class="living-index-fallback__coordinate living-index-fallback__coordinate--east"
				>88.3639 E</span
			>
		</div>
	</div>
</div>
