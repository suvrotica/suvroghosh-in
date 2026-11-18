<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import './little-city-of-wonders.css';
	import StorybookInspector from './StorybookInspector.svelte';
	import {
		LANDMARK_BY_ID,
		MOOD_PRESETS,
		NEIGHBORHOODS,
		NEIGHBORHOOD_BY_ID,
		SECRET_BY_ID,
		SECRET_CURIOSITIES,
		cloneCityState,
		createCitySoundscape,
		createDefaultCityState,
		decodeCityStateFromSearch,
		encodeCityStateToQuery,
		formatClockLabel,
		presetTimeHours,
		readDiscoveredSecrets,
		resolveMoodForTime,
		writeDiscoveredSecrets,
		type CitySoundscapeHandle,
		type CityViewerState,
		type ExplorationMode,
		type HoverPickInfo,
		type LandmarkId,
		type MoodPresetId,
		type NeighborhoodId,
		type ProjectedPin,
		type SecretId
	} from '$lib/visualizations/little-city-of-wonders';
	import type { CityRendererHandle } from '$lib/visualizations/little-city-of-wonders/renderer';

	let shellEl = $state<HTMLElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let rendererHandle = $state<CityRendererHandle | null>(null);
	let soundscape: CitySoundscapeHandle | null = null;

	let viewerState = $state<CityViewerState>(createDefaultCityState());
	let activeTab = $state<'story' | 'buildings' | 'secrets'>('story');
	let webglSupported = $state(true);
	let isReady = $state(false);
	let loadError = $state('');
	let contextLost = $state(false);
	let hideUi = $state(false);
	let isFullscreen = $state(false);
	let fullscreenFallback = $state(false);

	let projectedPins = $state<ProjectedPin[]>([]);
	let hoverInfo = $state<HoverPickInfo>({
		kind: null,
		id: null,
		label: null,
		subtitle: null,
		clientX: 0,
		clientY: 0
	});
	let discoveryBanner = $state('');
	let announcement = $state('');
	let walkerDistrict = $state<NeighborhoodId>('old-town');

	const effectiveFullscreen = $derived(isFullscreen || fullscreenFallback);
	const clockLabel = $derived(formatClockLabel(viewerState.timeHours));

	let urlSyncTimer: number | null = null;
	let toastTimer: number | null = null;

	function announce(msg: string): void {
		announcement = msg;
	}

	function showToast(msg: string): void {
		discoveryBanner = msg;
		if (toastTimer !== null && typeof window !== 'undefined') {
			window.clearTimeout(toastTimer);
		}
		if (typeof window !== 'undefined') {
			toastTimer = window.setTimeout(() => {
				discoveryBanner = '';
			}, 4200);
		}
	}

	function scheduleUrlSync(next: CityViewerState): void {
		if (typeof window === 'undefined') return;
		if (urlSyncTimer !== null) window.clearTimeout(urlSyncTimer);
		urlSyncTimer = window.setTimeout(() => {
			urlSyncTimer = null;
			const query = encodeCityStateToQuery(next);
			const nextUrl = query
				? `${window.location.pathname}?${query}${window.location.hash}`
				: `${window.location.pathname}${window.location.hash}`;
			try {
				window.history.replaceState(null, '', nextUrl);
			} catch {
				// Ignore restricted history environments
			}
		}, 180);
	}

	function commitState(updater: (draft: CityViewerState) => void, announceMsg?: string): void {
		const next = cloneCityState(viewerState);
		updater(next);
		viewerState = next;
		scheduleUrlSync(next);
		if (announceMsg) announce(announceMsg);
	}

	function handleSetMode(mode: ExplorationMode): void {
		soundscape?.playClickTap();
		commitState(
			(s) => {
				s.mode = mode;
			},
			mode === 'diorama'
				? 'Switched to aerial and close-up Diorama orbit mode.'
				: mode === 'third-person'
					? 'Switched to Third-Person miniature traveler walk mode.'
					: 'Switched to First-Person street-level stroll mode.'
		);
	}

	function handleResetOverview(): void {
		soundscape?.playClickTap();
		commitState((s) => {
			s.mode = 'diorama';
			s.activeNeighborhood = 'overview';
			s.selectedLandmarkId = null;
			s.selectedSecretId = null;
		}, 'Reset camera to full miniature city overview.');
		rendererHandle?.flyToOverview();
	}

	function handleSelectNeighborhood(id: NeighborhoodId): void {
		soundscape?.playClickTap();
		const nb = NEIGHBORHOOD_BY_ID[id];
		commitState((s) => {
			s.activeNeighborhood = id;
			s.selectedLandmarkId = null;
			s.selectedSecretId = null;
		}, `Moved to ${nb.name}: ${nb.subtitle}.`);
		rendererHandle?.flyToNeighborhood(id);
	}

	function handleSelectLandmark(id: LandmarkId | null): void {
		soundscape?.playClickTap();
		commitState((s) => {
			s.selectedLandmarkId = id;
			s.selectedSecretId = null;
			if (id) {
				s.activeNeighborhood = LANDMARK_BY_ID[id].neighborhoodId;
			}
		});
		if (id) {
			activeTab = 'story';
			announce(`Inspecting ${LANDMARK_BY_ID[id].name}.`);
		}
	}

	function handleFocusLandmark(id: LandmarkId): void {
		rendererHandle?.focusLandmark(id);
	}

	function handleWalkToLandmark(id: LandmarkId): void {
		soundscape?.playClickTap();
		if (viewerState.mode === 'diorama') {
			commitState((s) => {
				s.mode = 'third-person';
				s.selectedLandmarkId = id;
				s.activeNeighborhood = LANDMARK_BY_ID[id].neighborhoodId;
			});
		}
		rendererHandle?.walkToLandmark(id);
		showToast(`Walking along cobblestone lanes toward ${LANDMARK_BY_ID[id].name}…`);
	}

	function handleVisitSecret(id: SecretId): void {
		soundscape?.playClickTap();
		const sec = SECRET_BY_ID[id];
		if (!viewerState.discoveredSecrets.includes(id)) {
			handleDiscoverSecret(id);
		}
		commitState((s) => {
			s.selectedSecretId = id;
			s.activeNeighborhood = sec.neighborhoodId;
		});
		activeTab = 'story';
		rendererHandle?.walkToSecret(id);
	}

	function handleDiscoverSecret(id: SecretId): void {
		if (viewerState.discoveredSecrets.includes(id)) return;
		const sec = SECRET_BY_ID[id];
		const updated = [...viewerState.discoveredSecrets, id];
		if (typeof window !== 'undefined') {
			writeDiscoveredSecrets(window.localStorage, updated);
		}
		commitState((s) => {
			s.discoveredSecrets = updated;
			s.selectedSecretId = id;
		}, `Discovered hidden curiosity: ${sec.title}!`);
		soundscape?.playDiscoveryChime();
		showToast(`✨ Curiosity Found (${updated.length}/${SECRET_CURIOSITIES.length}): ${sec.title}`);
	}

	function handleSelectMood(mood: MoodPresetId): void {
		soundscape?.playClickTap();
		const hours = presetTimeHours(mood);
		commitState((s) => {
			s.mood = mood;
			s.timeHours = hours;
		}, `Set lighting atmosphere to ${mood}.`);
		soundscape?.setNightFactor(mood === 'lantern-night' || mood === 'blue-hour' ? 0.85 : 0.2);
	}

	function handleSetTimeHours(hours: number): void {
		const mood = resolveMoodForTime(hours);
		commitState((s) => {
			s.timeHours = hours;
			s.mood = mood;
		});
		soundscape?.setNightFactor(mood === 'lantern-night' || mood === 'blue-hour' ? 0.85 : 0.2);
	}

	function handleToggleLabels(): void {
		commitState(
			(s) => {
				s.showLabels = !s.showLabels;
			},
			viewerState.showLabels ? 'Hidden street labels.' : 'Showing street labels.'
		);
	}

	function handleToggleClayCadence(): void {
		soundscape?.playClickTap();
		commitState(
			(s) => {
				s.stopMotionCadence = !s.stopMotionCadence;
			},
			viewerState.stopMotionCadence
				? 'Switched world motion to smooth 60fps.'
				: 'Switched world motion to 12fps clay stop-motion cadence.'
		);
	}

	function handleToggleSound(): void {
		const next = !viewerState.soundEnabled;
		commitState(
			(s) => {
				s.soundEnabled = next;
			},
			next ? 'Enabled miniature coastal and wind-chime soundscape.' : 'Muted soundscape.'
		);
		soundscape?.setEnabled(next);
	}

	function handleExportPostcard(): void {
		if (!rendererHandle || typeof document === 'undefined') return;
		soundscape?.playClickTap();
		const dataUrl = rendererHandle.capturePostcardDataUrl();
		const link = document.createElement('a');
		link.href = dataUrl;
		link.download = `little-city-of-wonders-${viewerState.mood}.png`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		showToast('Saved high-resolution 3D Postcard PNG!');
	}

	async function toggleFullscreen(): Promise<void> {
		if (!shellEl || typeof document === 'undefined') return;
		if (document.fullscreenElement === shellEl) {
			try {
				await document.exitFullscreen();
			} catch {
				fullscreenFallback = false;
			}
			isFullscreen = false;
			return;
		}
		if (fullscreenFallback) {
			fullscreenFallback = false;
			return;
		}
		if (typeof shellEl.requestFullscreen === 'function') {
			try {
				await shellEl.requestFullscreen();
				isFullscreen = true;
				return;
			} catch {
				// Graceful CSS fullscreen fallback when blocked by iframe/headless permissions
			}
		}
		fullscreenFallback = true;
	}

	function onFullscreenChange(): void {
		isFullscreen = typeof document !== 'undefined' && document.fullscreenElement === shellEl;
		if (isFullscreen) fullscreenFallback = false;
	}

	function onGlobalKeyDown(ev: KeyboardEvent): void {
		const target = ev.target;
		if (
			target instanceof HTMLElement &&
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.isContentEditable)
		) {
			return;
		}
		if (ev.key === 'Escape') {
			if (fullscreenFallback) {
				fullscreenFallback = false;
			} else if (viewerState.selectedLandmarkId || viewerState.selectedSecretId) {
				commitState((s) => {
					s.selectedLandmarkId = null;
					s.selectedSecretId = null;
				});
			}
			return;
		}
		if (ev.key === 'h' || ev.key === 'H') {
			hideUi = !hideUi;
		} else if (ev.key === 'l' || ev.key === 'L') {
			handleToggleLabels();
		} else if (ev.key === 'r' || ev.key === 'R') {
			handleResetOverview();
		} else if (ev.key === 'c' || ev.key === 'C') {
			handleToggleClayCadence();
		}
	}

	onMount(() => {
		const initial = decodeCityStateFromSearch(window.location.search);
		const savedSecrets = readDiscoveredSecrets(window.localStorage);
		initial.discoveredSecrets = savedSecrets;
		viewerState = initial;

		soundscape = createCitySoundscape();
		document.addEventListener('fullscreenchange', onFullscreenChange);
		window.addEventListener('keydown', onGlobalKeyDown);

		(async () => {
			try {
				const { checkCityWebGLSupport, createLittleCityRenderer } =
					await import('$lib/visualizations/little-city-of-wonders/renderer');
				if (!checkCityWebGLSupport()) {
					webglSupported = false;
					return;
				}
				if (!canvasEl) return;

				rendererHandle = await createLittleCityRenderer(canvasEl, initial, {
					onReady: ({ meshCount, triangleCount }) => {
						isReady = true;
						announce(
							`Loaded The Little City of Wonders with ${meshCount} handcrafted 3D pieces (${triangleCount.toLocaleString()} triangles).`
						);
					},
					onSelectLandmark: (id) => {
						handleSelectLandmark(id);
					},
					onSelectSecret: (id) => {
						commitState((s) => {
							s.selectedSecretId = id;
						});
						activeTab = 'story';
					},
					onDiscoverSecret: (id) => {
						handleDiscoverSecret(id);
					},
					onHoverPick: (info) => {
						hoverInfo = info;
					},
					onPinsUpdate: (pins) => {
						projectedPins = pins;
					},
					onWalkerMove: (_pos, nearest) => {
						walkerDistrict = nearest;
					},
					onContextLossChange: (lost) => {
						contextLost = lost;
					}
				});
			} catch (err) {
				loadError =
					err instanceof Error ? err.message : 'Unable to initialize 3D miniature city renderer.';
			}
		})();

		return () => {
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			window.removeEventListener('keydown', onGlobalKeyDown);
		};
	});

	$effect(() => {
		const next = viewerState;
		rendererHandle?.updateState(next);
	});

	onDestroy(() => {
		if (urlSyncTimer !== null && typeof window !== 'undefined') window.clearTimeout(urlSyncTimer);
		if (toastTimer !== null && typeof window !== 'undefined') window.clearTimeout(toastTimer);
		rendererHandle?.dispose();
		rendererHandle = null;
		soundscape?.dispose();
		soundscape = null;
	});
</script>

<section
	class="lcw-breakout-root article-breakout not-prose"
	class:lcw-elevated={effectiveFullscreen}
	aria-label="Interactive 3D Whimsical Handmade Miniature City — The Little City of Wonders"
>
	<div
		bind:this={shellEl}
		class="lcw-shell"
		class:lcw-fullscreen-fallback={fullscreenFallback}
		data-testid="little-city-of-wonders"
		tabindex="-1"
	>
		<div class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

		<!-- Top Artisan Diorama Plaque Header -->
		<header class="lcw-header">
			<div class="lcw-title-wrap">
				<h1 class="lcw-title">The Little City of Wonders</h1>
				<span class="lcw-subtitle-pill">
					6 Districts · 18 Handcrafted Buildings · {viewerState.discoveredSecrets.length}/8 Secrets
				</span>
			</div>

			<div class="lcw-header-controls">
				<div class="lcw-mode-group" role="group" aria-label="3D exploration mode">
					<button
						type="button"
						class="lcw-mode-btn"
						aria-pressed={viewerState.mode === 'diorama'}
						onclick={() => handleSetMode('diorama')}
					>
						Diorama
					</button>
					<button
						type="button"
						class="lcw-mode-btn"
						aria-pressed={viewerState.mode === 'third-person'}
						onclick={() => handleSetMode('third-person')}
					>
						3rd-Person Walk
					</button>
					<button
						type="button"
						class="lcw-mode-btn"
						aria-pressed={viewerState.mode === 'first-person'}
						onclick={() => handleSetMode('first-person')}
					>
						1st-Person Eye
					</button>
				</div>

				<button
					type="button"
					class="lcw-btn"
					title="Return to full aerial city overview (R)"
					onclick={handleResetOverview}
				>
					Home View
				</button>

				<button
					type="button"
					class="lcw-btn"
					aria-pressed={viewerState.showLabels}
					title="Toggle floating miniature pins (L)"
					onclick={handleToggleLabels}
				>
					Labels
				</button>

				<button
					type="button"
					class="lcw-btn"
					aria-pressed={viewerState.stopMotionCadence}
					title="Toggle 12fps clay stop-motion animation cadence (C)"
					onclick={handleToggleClayCadence}
				>
					Clay 12fps
				</button>

				<button
					type="button"
					class="lcw-btn"
					aria-pressed={viewerState.soundEnabled}
					title="Toggle gentle coastal breeze and wind-chime soundscape"
					onclick={handleToggleSound}
				>
					{viewerState.soundEnabled ? 'Sound: On' : 'Sound: Off'}
				</button>

				<button
					type="button"
					class="lcw-btn"
					title="Save PNG postcard of current 3D view"
					onclick={handleExportPostcard}
				>
					Postcard PNG
				</button>

				<button
					type="button"
					class="lcw-btn"
					aria-pressed={hideUi}
					title="Hide side guide for full-width theater view (H)"
					onclick={() => (hideUi = !hideUi)}
				>
					{hideUi ? 'Show Guide' : 'Theater'}
				</button>

				<button
					type="button"
					class="lcw-btn"
					aria-pressed={effectiveFullscreen}
					title="Toggle fullscreen mode"
					onclick={toggleFullscreen}
				>
					{effectiveFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
				</button>
			</div>
		</header>

		<!-- 6-Neighborhood Quick-Jump Bar -->
		{#if !hideUi}
			<nav class="lcw-district-bar" aria-label="City neighborhoods">
				<button
					type="button"
					class="lcw-district-chip"
					aria-pressed={viewerState.activeNeighborhood === 'overview'}
					onclick={handleResetOverview}
				>
					Aerial Overview
				</button>
				{#each NEIGHBORHOODS as nb (nb.id)}
					<button
						type="button"
						class="lcw-district-chip"
						aria-pressed={viewerState.activeNeighborhood === nb.id}
						onclick={() => handleSelectNeighborhood(nb.id)}
					>
						<span class="lcw-swatch-dot" style="background:{nb.accentHex}"></span>
						{nb.number}. {nb.shortLabel}
					</button>
				{/each}
			</nav>
		{/if}

		<!-- 3D Viewport + Storybook Guide -->
		<div class="lcw-stage-grid" class:lcw-theater={hideUi}>
			<div class="lcw-viewport-wrap" role="region" aria-label="Interactive 3D miniature city">
				{#if !webglSupported}
					<div class="lcw-loading-veil" data-testid="lcw-webgl-fallback">
						<div class="max-w-md space-y-3">
							<img
								src="/images/visualizations/the-little-city-of-wonders/poster.png"
								alt="Aerial view of The Little City of Wonders handcrafted 3D miniature diorama"
								class="mx-auto rounded-lg border border-white/15"
							/>
							<p class="m-0 text-sm text-[#e6decb]">
								WebGL is unavailable in this browser session. Enable hardware acceleration to orbit
								and stroll through all six handcrafted 3D neighborhoods in real time.
							</p>
						</div>
					</div>
				{:else}
					<canvas bind:this={canvasEl} class="lcw-canvas"></canvas>

					{#if !isReady && !loadError}
						<div class="lcw-loading-veil">
							<div class="space-y-2">
								<div class="text-base font-semibold text-[#f7cf8b]">
									Sculpting clay roofs, hanging lanterns &amp; lighting cozy windows…
								</div>
								<div class="text-xs text-[#a89e8c]">Assembling all six miniature neighborhoods</div>
							</div>
						</div>
					{/if}

					{#if loadError || contextLost}
						<div class="lcw-loading-veil">
							<div class="max-w-sm text-sm text-[#f7cf8b]">
								{contextLost
									? 'WebGL context paused by browser — restoring miniature world…'
									: loadError}
							</div>
						</div>
					{/if}

					{#if discoveryBanner}
						<div class="lcw-discovery-toast" role="status">{discoveryBanner}</div>
					{/if}

					<!-- Screen-Projected Interactive Miniature Pins -->
					{#if viewerState.showLabels && !hideUi}
						<div class="lcw-pin-layer">
							{#each projectedPins as pin (pin.id)}
								{#if pin.visible}
									<button
										type="button"
										class="lcw-pin"
										style="left:{pin.x.toFixed(1)}px; top:{pin.y.toFixed(1)}px"
										onclick={() => {
											if (pin.kind === 'neighborhood') {
												handleSelectNeighborhood(pin.id as NeighborhoodId);
											} else if (pin.kind === 'landmark') {
												handleSelectLandmark(pin.id as LandmarkId);
												handleFocusLandmark(pin.id as LandmarkId);
											}
										}}
									>
										<span class="lcw-swatch-dot" style="background:{pin.accentHex}"></span>
										<span>{pin.label}</span>
									</button>
								{/if}
							{/each}
						</div>
					{/if}

					<!-- Viewport Zoom Buttons -->
					<div class="lcw-zoom-stack">
						<button
							type="button"
							class="lcw-icon-btn"
							aria-label="Zoom in"
							title="Zoom in"
							onclick={() => rendererHandle?.zoomStep(0.8)}
						>
							+
						</button>
						<button
							type="button"
							class="lcw-icon-btn"
							aria-label="Zoom out"
							title="Zoom out"
							onclick={() => rendererHandle?.zoomStep(1.25)}
						>
							−
						</button>
					</div>

					<!-- Street-Level Walk Touch/Click D-Pad & Status -->
					{#if viewerState.mode !== 'diorama'}
						<div class="lcw-walk-hud">
							<div class="lcw-dpad" role="group" aria-label="Street movement pad">
								<span></span>
								<button
									type="button"
									class="lcw-dpad-btn"
									aria-label="Walk forward"
									onpointerdown={() => rendererHandle?.setVirtualMove(1, 0)}
									onpointerup={() => rendererHandle?.setVirtualMove(0, 0)}
									onpointerleave={() => rendererHandle?.setVirtualMove(0, 0)}
								>
									↑
								</button>
								<span></span>
								<button
									type="button"
									class="lcw-dpad-btn"
									aria-label="Step left"
									onpointerdown={() => rendererHandle?.setVirtualMove(0, -1)}
									onpointerup={() => rendererHandle?.setVirtualMove(0, 0)}
									onpointerleave={() => rendererHandle?.setVirtualMove(0, 0)}
								>
									←
								</button>
								<button
									type="button"
									class="lcw-dpad-btn"
									aria-label="Step backward"
									onpointerdown={() => rendererHandle?.setVirtualMove(-1, 0)}
									onpointerup={() => rendererHandle?.setVirtualMove(0, 0)}
									onpointerleave={() => rendererHandle?.setVirtualMove(0, 0)}
								>
									↓
								</button>
								<button
									type="button"
									class="lcw-dpad-btn"
									aria-label="Step right"
									onpointerdown={() => rendererHandle?.setVirtualMove(0, 1)}
									onpointerup={() => rendererHandle?.setVirtualMove(0, 0)}
									onpointerleave={() => rendererHandle?.setVirtualMove(0, 0)}
								>
									→
								</button>
							</div>

							<div class="lcw-walk-hint">
								<strong class="text-[#f7cf8b]">
									In {NEIGHBORHOOD_BY_ID[walkerDistrict].shortLabel}
								</strong>
								· Use <code>WASD</code> / Arrows, drag to look around, or click any street, staircase,
								or sky-bridge to stroll there.
							</div>
						</div>
					{/if}
				{/if}
			</div>

			{#if !hideUi}
				<StorybookInspector
					{viewerState}
					{activeTab}
					onTabChange={(t) => (activeTab = t)}
					onSelectNeighborhood={handleSelectNeighborhood}
					onSelectLandmark={handleSelectLandmark}
					onFocusLandmark={handleFocusLandmark}
					onWalkToLandmark={handleWalkToLandmark}
					onVisitSecret={handleVisitSecret}
				/>
			{/if}
		</div>

		<!-- Hover Brass Nameplate Tooltip -->
		{#if hoverInfo.label}
			<div class="lcw-hover-card" style="left:{hoverInfo.clientX}px; top:{hoverInfo.clientY}px">
				<div class="text-xs font-bold text-[#f6efe2]">{hoverInfo.label}</div>
				{#if hoverInfo.subtitle}
					<div class="text-[11px] text-[#d1c7b4]">{hoverInfo.subtitle}</div>
				{/if}
			</div>
		{/if}

		<!-- Bottom Day & Night Lighting Bar -->
		<footer class="lcw-atmosphere-bar">
			<div class="lcw-mood-pills" role="group" aria-label="Lighting mood presets">
				{#each MOOD_PRESETS as mp (mp.id)}
					<button
						type="button"
						class="lcw-btn"
						aria-pressed={viewerState.mood === mp.id}
						title={mp.summary}
						onclick={() => handleSelectMood(mp.id)}
					>
						{mp.shortLabel}
					</button>
				{/each}
			</div>

			<div class="lcw-time-slider-wrap">
				<label for="lcw-time-range" class="text-xs font-semibold text-[#d1c7b4]">
					Time · <span class="text-[#f7cf8b]">{clockLabel}</span>
				</label>
				<input
					id="lcw-time-range"
					type="range"
					min="0"
					max="24"
					step="0.05"
					value={viewerState.timeHours}
					aria-label="Time of day lighting slider"
					class="lcw-time-slider"
					oninput={(e) => handleSetTimeHours(Number((e.currentTarget as HTMLInputElement).value))}
				/>
			</div>

			<div class="text-[11px] text-[#a89e8c]">
				Drag to orbit · Scroll to zoom · Click any building for its story · <code>H</code> theater ·
				<code>R</code> reset
			</div>
		</footer>
	</div>
</section>
