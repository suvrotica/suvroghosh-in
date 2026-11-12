<script lang="ts">
	import { onMount, setContext, tick, type Component } from 'svelte';
	import {
		applyPreset,
		buildCompositionModel,
		buildPaintTimeline,
		clearStateFromStorage,
		createNextSeed,
		DEFAULT_MONDRIAN_STATE,
		deserializeStateParams,
		exportPainting,
		findMatchingPreset,
		INITIAL_CURATED_SEED,
		KNOB_SPECS,
		loadStateFromStorage,
		MAX_UNDO_HISTORY,
		MONDRIAN_PRESETS,
		normalizeAspectRatio,
		normalizeSeed,
		normalizeState,
		prepareMaterial,
		renderPainting,
		saveStateToStorage,
		serializeStateQuery,
		statesEqual,
		triggerBlobDownload,
		type ColorEmphasis,
		type CompositionModel,
		type ExportLongSide,
		type MondrianState,
		type PreparedPainting,
		type PresetId
	} from '$lib/visualizations/mondrian-studio';
	import RotarySliderKnob from './RotarySliderKnob.svelte';
	import './mondrian-studio.css';

	type PostModule = { default: Component };
	const articleLoaders = import.meta.glob<PostModule>(
		'../../../posts/piet-mondrian-a-pioneer-of-abstract-art.md'
	);
	let ArticleContent = $state<Component | null>(null);

	async function ensureArticleLoaded() {
		if (ArticleContent) return;
		const loader = Object.values(articleLoaders)[0];
		if (!loader) return;
		const mod = await loader();
		ArticleContent = mod.default;
	}

	setContext('mondrian-studio-embedded-article', true);

	type PlaybackPhase = 'playing' | 'paused' | 'finished';

	let rootEl: HTMLDivElement | undefined = $state();
	let stageEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let controlsBtnEl: HTMLButtonElement | undefined = $state();
	let closeTrayBtnEl: HTMLButtonElement | undefined = $state();
	let readArticleBtnEl: HTMLButtonElement | undefined = $state();
	let returnToPaintingBtnEl: HTMLButtonElement | undefined = $state();
	let exportBtnEl: HTMLButtonElement | undefined = $state();

	let studioState = $state<MondrianState>({ ...DEFAULT_MONDRIAN_STATE });
	let committedState = $state<MondrianState>({ ...DEFAULT_MONDRIAN_STATE });
	let undoStack = $state<MondrianState[]>([]);
	let savedOriginalRatio = $state<number | null>(null);

	let viewportWidth = $state(1280);
	let viewportHeight = $state(800);
	let prefersReducedMotion = $state(false);
	let isFullscreen = $state(false);

	let activeView = $state<'painting' | 'article'>('painting');
	let trayOpen = $state(true);
	let exportMenuOpen = $state(false);
	let exportingBusy = $state(false);
	let shareFallbackUrl = $state<string | null>(null);
	let statusNotice = $state<string | null>(null);
	let seedInputText = $state(String(INITIAL_CURATED_SEED));

	let playbackPhase = $state<PlaybackPhase>('finished');
	let playbackProgress = $state(1);
	let liveAnnouncement = $state('');

	let currentModel: CompositionModel = $derived(buildCompositionModel(studioState));
	let committedModel: CompositionModel = $derived(buildCompositionModel(committedState));
	let activePresetId: PresetId | null = $derived(findMatchingPreset(studioState));

	let hasDistinctSavedRatio = $derived(
		savedOriginalRatio !== null && Math.abs(savedOriginalRatio - studioState.aspectRatio) >= 0.04
	);

	// Internal mutable renderer state (kept outside Svelte deep reactivity for zero-overhead 60fps painting).
	let preparedBuffer: PreparedPainting | null = null;
	let frameRgba: Uint8ClampedArray | null = null;
	let renderToken = 0;
	let rafHandle: number | null = null;
	let lastFrameTimeMs: number | null = null;
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	let mountedReady = false;
	let wasPlayingBeforeArticle = false;

	function showStatus(msg: string, durationMs = 4200) {
		statusNotice = msg;
		if (statusTimer) clearTimeout(statusTimer);
		statusTimer = setTimeout(() => {
			statusNotice = null;
		}, durationMs);
	}

	function stopAnimationLoop() {
		if (rafHandle !== null && typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(rafHandle);
			rafHandle = null;
		}
		lastFrameTimeMs = null;
	}

	function computeRenderDimensions(previewLightweight: boolean): { width: number; height: number } {
		const cssW = Math.max(64, viewportWidth);
		const cssH = Math.max(64, viewportHeight);
		const dpr =
			typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
				? Math.min(2, Math.max(1, window.devicePixelRatio))
				: 1;
		const isSmallScreen = Math.min(cssW, cssH) < 600;
		const maxLongSide = previewLightweight ? 740 : isSmallScreen ? 1160 : 1640;

		const rawW = cssW * dpr;
		const rawH = cssH * dpr;
		const longest = Math.max(rawW, rawH);
		const scale = longest > maxLongSide ? maxLongSide / longest : 1;
		return {
			width: Math.max(64, Math.round(rawW * scale)),
			height: Math.max(64, Math.round(rawH * scale))
		};
	}

	function blitPreparedAtProgress(progress: number) {
		if (!canvasEl || !preparedBuffer) return;
		const { width, height } = preparedBuffer;
		if (canvasEl.width !== width || canvasEl.height !== height) {
			canvasEl.width = width;
			canvasEl.height = height;
		}
		const ctx = canvasEl.getContext('2d', { alpha: false });
		if (!ctx) return;

		if (!frameRgba || frameRgba.length !== preparedBuffer.finishedRgba.length) {
			frameRgba = new Uint8ClampedArray(preparedBuffer.finishedRgba.length);
		}
		renderPainting(preparedBuffer, progress, frameRgba);
		const imgData = new ImageData(
			new Uint8ClampedArray(frameRgba.buffer as ArrayBuffer, frameRgba.byteOffset, frameRgba.byteLength),
			width,
			height
		);
		ctx.putImageData(imgData, 0, 0);
	}

	function startPlaybackLoop() {
		stopAnimationLoop();
		if (typeof requestAnimationFrame !== 'function') {
			playbackProgress = 1;
			playbackPhase = 'finished';
			blitPreparedAtProgress(1);
			return;
		}

		const tickFrame = (nowMs: number) => {
			if (playbackPhase !== 'playing' || !preparedBuffer) {
				rafHandle = null;
				lastFrameTimeMs = null;
				return;
			}

			if (typeof document !== 'undefined' && document.hidden) {
				lastFrameTimeMs = null;
				rafHandle = requestAnimationFrame(tickFrame);
				return;
			}

			if (lastFrameTimeMs === null) {
				lastFrameTimeMs = nowMs;
			}
			const elapsedSec = Math.max(0, Math.min(0.25, (nowMs - lastFrameTimeMs) / 1000));
			lastFrameTimeMs = nowMs;

			const duration = Math.max(3, Math.min(18, studioState.paintingTime));
			const nextProgress = Math.min(1, playbackProgress + elapsedSec / duration);
			playbackProgress = nextProgress;
			blitPreparedAtProgress(nextProgress);

			if (nextProgress >= 1) {
				playbackPhase = 'finished';
				rafHandle = null;
				lastFrameTimeMs = null;
				return;
			}

			rafHandle = requestAnimationFrame(tickFrame);
		};

		rafHandle = requestAnimationFrame(tickFrame);
	}

	function rebuildAndRender(options: {
		mode: 'reveal' | 'still';
		lightweightPreview?: boolean;
		preserveProgress?: number;
	}) {
		const token = ++renderToken;
		if (!stageEl || viewportWidth <= 0 || viewportHeight <= 0) return;

		const dims = computeRenderDimensions(Boolean(options.lightweightPreview));
		try {
			const model = currentModel;
			const timeline = buildPaintTimeline(model.layout, model.colors, studioState.paintingTime);
			const nextPrepared = prepareMaterial({
				layout: model.layout,
				colors: model.colors,
				timeline,
				paintTexture: studioState.paintTexture,
				width: dims.width,
				height: dims.height
			});

			// Guard against stale work if another action incremented renderToken.
			if (token !== renderToken) return;

			preparedBuffer = nextPrepared;

			if (options.mode === 'reveal') {
				const startAt = options.preserveProgress ?? 0.015;
				playbackProgress = startAt;
				playbackPhase = 'playing';
				blitPreparedAtProgress(startAt);
				startPlaybackLoop();
			} else {
				stopAnimationLoop();
				playbackProgress = 1;
				playbackPhase = 'finished';
				blitPreparedAtProgress(1);
			}
		} catch {
			// Allocation fallback: retain last valid preparedBuffer if available or retry compact size.
			if (preparedBuffer) {
				blitPreparedAtProgress(1);
			}
			showStatus('Used compact canvas resolution to fit available browser memory.');
		}
	}

	function syncBrowserHistoryUrl(targetState: MondrianState, view: 'painting' | 'article') {
		if (typeof window === 'undefined') return;
		try {
			const query = serializeStateQuery(targetState, { view });
			const nextUrl = `${window.location.pathname}?${query}`;
			window.history.replaceState(window.history.state, '', nextUrl);
		} catch {
			// Ignore history API errors in sandboxed frames.
		}
	}

	function pushUndoSnapshot(prev: MondrianState, next: MondrianState) {
		if (statesEqual(prev, next)) return;
		undoStack = [...undoStack.slice(-(MAX_UNDO_HISTORY - 1)), prev];
	}

	function commitStateChange(
		nextRaw: MondrianState,
		options?: {
			recordUndo?: boolean;
			playReveal?: boolean;
			announce?: boolean;
		}
	) {
		const next = normalizeState({
			...nextRaw,
			aspectRatio: studioState.aspectRatio
		});
		const prevCommitted = committedState;
		if (options?.recordUndo !== false) {
			pushUndoSnapshot(prevCommitted, next);
		}

		studioState = next;
		committedState = next;
		seedInputText = String(next.seed);
		shareFallbackUrl = null;
		saveStateToStorage(next);
		syncBrowserHistoryUrl(next, activeView);

		const shouldPlay = Boolean(options?.playReveal) && !prefersReducedMotion && activeView === 'painting';
		rebuildAndRender({
			mode: shouldPlay ? 'reveal' : 'still',
			lightweightPreview: false
		});

		if (options?.announce !== false) {
			const m = buildCompositionModel(next);
			liveAnnouncement = m.description;
		}
	}

	function previewKnobChange<K extends 'panels' | 'unevenSpacing' | 'colorArea' | 'lineWidth' | 'paintTexture' | 'paintingTime'>(
		key: K,
		nextValue: number
	) {
		if (key === 'paintingTime') {
			// Changing Painting time mid-playback rescales remaining reveal smoothly without cancelling!
			studioState = normalizeState({
				...studioState,
				paintingTime: nextValue
			});
			return;
		}

		// Structural or material knob change during playback cancels reveal cleanly and shows responsive preview.
		studioState = normalizeState({
			...studioState,
			[key]: nextValue
		});
		rebuildAndRender({
			mode: 'still',
			lightweightPreview: true
		});
	}

	function commitKnobChange<K extends 'panels' | 'unevenSpacing' | 'colorArea' | 'lineWidth' | 'paintTexture' | 'paintingTime'>(
		key: K,
		nextValue: number
	) {
		if (key === 'paintingTime') {
			const next = normalizeState({
				...studioState,
				paintingTime: nextValue
			});
			pushUndoSnapshot(committedState, next);
			studioState = next;
			committedState = next;
			saveStateToStorage(next);
			syncBrowserHistoryUrl(next, activeView);
			return;
		}

		commitStateChange(
			{
				...studioState,
				[key]: nextValue
			},
			{ recordUndo: true, playReveal: false, announce: true }
		);
	}

	function handleNewPainting() {
		exportMenuOpen = false;
		const nextSeed = createNextSeed(studioState.seed, Date.now() + renderToken * 7919);
		commitStateChange(
			{
				...studioState,
				seed: nextSeed
			},
			{ recordUndo: true, playReveal: true, announce: true }
		);
	}

	function handleReplay() {
		exportMenuOpen = false;
		if (!preparedBuffer) {
			rebuildAndRender({ mode: 'reveal', lightweightPreview: false });
			return;
		}
		playbackProgress = 0.012;
		playbackPhase = 'playing';
		blitPreparedAtProgress(0.012);
		startPlaybackLoop();
	}

	function handlePauseResume() {
		if (playbackPhase === 'playing') {
			stopAnimationLoop();
			playbackPhase = 'paused';
		} else if (playbackPhase === 'paused') {
			playbackPhase = 'playing';
			startPlaybackLoop();
		}
	}

	function handleFinishNow() {
		stopAnimationLoop();
		playbackProgress = 1;
		playbackPhase = 'finished';
		blitPreparedAtProgress(1);
	}

	function handleSelectPreset(presetId: PresetId) {
		const next = applyPreset(studioState, presetId);
		commitStateChange(next, { recordUndo: true, playReveal: false, announce: true });
	}

	function handleSelectEmphasis(emphasis: ColorEmphasis) {
		commitStateChange(
			{
				...studioState,
				colorEmphasis: emphasis
			},
			{ recordUndo: true, playReveal: false, announce: true }
		);
	}

	function handleApplySeedForm(event: SubmitEvent) {
		event.preventDefault();
		const nextSeed = normalizeSeed(seedInputText, studioState.seed);
		commitStateChange(
			{
				...studioState,
				seed: nextSeed
			},
			{ recordUndo: true, playReveal: false, announce: true }
		);
	}

	function handleUndo() {
		if (undoStack.length === 0) return;
		const previous = undoStack[undoStack.length - 1]!;
		undoStack = undoStack.slice(0, -1);
		commitStateChange(
			{
				...previous,
				aspectRatio: studioState.aspectRatio
			},
			{ recordUndo: false, playReveal: false, announce: true }
		);
		showStatus(`Restored previous composition (seed ${previous.seed}).`);
	}

	function handleResetSettings() {
		clearStateFromStorage();
		savedOriginalRatio = null;
		const resetTarget = normalizeState({
			...DEFAULT_MONDRIAN_STATE,
			aspectRatio: studioState.aspectRatio
		});
		commitStateChange(resetTarget, { recordUndo: true, playReveal: false, announce: true });
		showStatus('Reset composition to default seed and Balanced settings.');
	}

	async function handleCopyLink() {
		if (typeof window === 'undefined') return;
		const query = serializeStateQuery(studioState);
		const url = `${window.location.origin}${window.location.pathname}?${query}`;
		try {
			if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
				await navigator.clipboard.writeText(url);
				shareFallbackUrl = null;
				showStatus('Copied reproducible painting link to clipboard.');
				return;
			}
		} catch {
			// Fall through to visible input fallback.
		}
		shareFallbackUrl = url;
		showStatus('Clipboard permission unavailable — copy the link shown below.');
	}

	async function handleExport(longSidePx: ExportLongSide, useSavedRatio = false) {
		if (exportingBusy) return;
		exportingBusy = true;
		const ratio =
			useSavedRatio && savedOriginalRatio !== null ? savedOriginalRatio : studioState.aspectRatio;
		try {
			const result = await exportPainting(studioState, {
				longSidePx,
				aspectRatio: ratio
			});
			triggerBlobDownload(result.blob, result.filename);
			exportMenuOpen = false;
			showStatus(result.statusMessage);
		} catch {
			showStatus('Unable to export PNG at that size on this device. Try the 2048 px option.');
		} finally {
			exportingBusy = false;
		}
	}

	async function handleToggleFullscreen() {
		if (typeof document === 'undefined' || !rootEl) return;
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
			} else if (typeof rootEl.requestFullscreen === 'function') {
				await rootEl.requestFullscreen();
			} else {
				showStatus('Browser fullscreen is not supported here; full-window view remains active.');
			}
		} catch {
			showStatus('Fullscreen request was declined; retaining full-window painting view.');
		}
	}

	async function toggleControlsTray() {
		const nextOpen = !trayOpen;
		trayOpen = nextOpen;
		await tick();
		if (nextOpen) {
			closeTrayBtnEl?.focus();
		} else {
			controlsBtnEl?.focus();
		}
	}

	async function closeControlsTray() {
		trayOpen = false;
		await tick();
		controlsBtnEl?.focus();
	}

	async function openArticleView() {
		exportMenuOpen = false;
		wasPlayingBeforeArticle = playbackPhase === 'playing';
		if (wasPlayingBeforeArticle) {
			stopAnimationLoop();
			playbackPhase = 'paused';
		}
		await ensureArticleLoaded();
		activeView = 'article';
		syncBrowserHistoryUrl(studioState, 'article');
		await tick();
		returnToPaintingBtnEl?.focus();
	}

	async function closeArticleView() {
		activeView = 'painting';
		syncBrowserHistoryUrl(studioState, 'painting');
		await tick();
		if (wasPlayingBeforeArticle && playbackPhase === 'paused') {
			wasPlayingBeforeArticle = false;
			playbackPhase = 'playing';
			startPlaybackLoop();
		}
		readArticleBtnEl?.focus();
	}

	function handleArticleProseClick(event: MouseEvent) {
		const target = (event.target as HTMLElement | null)?.closest('a');
		if (!target) return;
		const href = target.getAttribute('href') ?? '';
		if (!href.startsWith('/tools/mondrian-studio?')) return;

		event.preventDefault();
		const query = href.slice(href.indexOf('?') + 1);
		const parsed = deserializeStateParams(query);
		wasPlayingBeforeArticle = false;
		activeView = 'painting';
		commitStateChange(parsed.state, { recordUndo: true, playReveal: false, announce: true });
		showStatus(`Applied worked example settings on seed ${parsed.state.seed}.`);
	}

	function applyGuidedStep(step: 'step30' | 'step15' | 'stepBold') {
		if (step === 'step30') {
			commitStateChange(
				{
					...DEFAULT_MONDRIAN_STATE,
					seed: INITIAL_CURATED_SEED,
					colorArea: 30,
					aspectRatio: studioState.aspectRatio
				},
				{ recordUndo: true, playReveal: false, announce: true }
			);
		} else if (step === 'step15') {
			commitStateChange(
				{
					...studioState,
					seed: INITIAL_CURATED_SEED,
					panels: 14,
					unevenSpacing: 65,
					colorArea: 15,
					lineWidth: 0.7
				},
				{ recordUndo: true, playReveal: false, announce: true }
			);
		} else {
			commitStateChange(
				{
					...studioState,
					seed: INITIAL_CURATED_SEED,
					panels: 14,
					unevenSpacing: 65,
					colorArea: 15,
					lineWidth: 1.15
				},
				{ recordUndo: true, playReveal: false, announce: true }
			);
		}
	}

	function formatKnobDisplay(
		key: 'panels' | 'unevenSpacing' | 'colorArea' | 'lineWidth' | 'paintTexture' | 'paintingTime'
	): string {
		if (key === 'panels') return String(studioState.panels);
		if (key === 'unevenSpacing') return `${studioState.unevenSpacing}%`;
		if (key === 'colorArea') {
			const target = studioState.colorArea;
			const actual = currentModel.colors.actualColorAreaPct;
			if (Math.abs(actual - target) < 0.05) {
				return `${target}%`;
			}
			return `Target ${target}% · Actual ${actual}%`;
		}
		if (key === 'lineWidth') return `${studioState.lineWidth.toFixed(2)}%`;
		if (key === 'paintTexture') return `${studioState.paintTexture}%`;
		return `${studioState.paintingTime}s`;
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (exportMenuOpen) {
				exportMenuOpen = false;
				exportBtnEl?.focus();
				event.stopPropagation();
				return;
			}
			if (activeView === 'article') {
				void closeArticleView();
				event.stopPropagation();
			}
		}
	}

	function handleViewportMeasurement(width: number, height: number) {
		if (width < 32 || height < 32) return;
		const changed = Math.abs(width - viewportWidth) >= 2 || Math.abs(height - viewportHeight) >= 2;
		if (!changed) return;

		viewportWidth = width;
		viewportHeight = height;
		const nextRatio = normalizeAspectRatio(width / height, studioState.aspectRatio);
		studioState = normalizeState({
			...studioState,
			aspectRatio: nextRatio
		});
		committedState = normalizeState({
			...committedState,
			aspectRatio: nextRatio
		});

		if (!mountedReady) return;
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (playbackPhase === 'playing') {
				rebuildAndRender({
					mode: 'reveal',
					lightweightPreview: false,
					preserveProgress: playbackProgress
				});
			} else if (playbackPhase === 'paused') {
				const savedProg = playbackProgress;
				rebuildAndRender({ mode: 'still', lightweightPreview: false });
				playbackProgress = savedProg;
				playbackPhase = 'paused';
				blitPreparedAtProgress(savedProg);
			} else {
				rebuildAndRender({ mode: 'still', lightweightPreview: false });
			}
		}, 90);
	}

	onMount(() => {
		const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = reducedMedia.matches;
		const onMotionChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		reducedMedia.addEventListener('change', onMotionChange);

		// Open shallow tray by default on wide screens; keep closed initially on phones so artwork leads.
		trayOpen = window.innerWidth >= 820 && window.innerHeight >= 560;

		const rect = stageEl?.getBoundingClientRect();
		if (rect && rect.width >= 32 && rect.height >= 32) {
			viewportWidth = Math.round(rect.width);
			viewportHeight = Math.round(rect.height);
		} else {
			viewportWidth = Math.max(320, window.innerWidth);
			viewportHeight = Math.max(320, window.innerHeight);
		}
		const liveViewportRatio = normalizeAspectRatio(viewportWidth / viewportHeight, 1.5);

		// Hydrate from URL query first, otherwise localStorage, otherwise curated initial seed.
		const urlParsed = deserializeStateParams(window.location.search);
		let initialState: MondrianState;
		if (urlParsed.hasExplicitState) {
			savedOriginalRatio = urlParsed.savedAspectRatio;
			initialState = normalizeState({
				...urlParsed.state,
				aspectRatio: liveViewportRatio
			});
		} else {
			const stored = loadStateFromStorage();
			if (stored) {
				savedOriginalRatio = stored.savedAspectRatio;
				initialState = normalizeState({
					...stored.state,
					aspectRatio: liveViewportRatio
				});
			} else {
				initialState = normalizeState({
					...DEFAULT_MONDRIAN_STATE,
					aspectRatio: liveViewportRatio
				});
			}
		}

		activeView = urlParsed.initialView;
		if (activeView === 'article') {
			void ensureArticleLoaded();
		}
		studioState = initialState;
		committedState = initialState;
		seedInputText = String(initialState.seed);
		liveAnnouncement = buildCompositionModel(initialState).description;
		mountedReady = true;

		const playInitialSequence = !prefersReducedMotion && activeView === 'painting';
		rebuildAndRender({
			mode: playInitialSequence ? 'reveal' : 'still',
			lightweightPreview: false
		});

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			handleViewportMeasurement(
				Math.round(entry.contentRect.width),
				Math.round(entry.contentRect.height)
			);
		});
		if (stageEl) observer.observe(stageEl);

		const onFullscreenChange = () => {
			isFullscreen = Boolean(document.fullscreenElement);
		};
		document.addEventListener('fullscreenchange', onFullscreenChange);

		const onVisibilityChange = () => {
			if (document.hidden) {
				lastFrameTimeMs = null;
			}
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			stopAnimationLoop();
			if (statusTimer) clearTimeout(statusTimer);
			if (resizeTimer) clearTimeout(resizeTimer);
			observer.disconnect();
			reducedMedia.removeEventListener('change', onMotionChange);
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="ms-root" bind:this={rootEl}>
	<div class="ms-stage" bind:this={stageEl}>
		<canvas
			bind:this={canvasEl}
			class="ms-canvas"
			aria-label={committedModel.description}
		>{committedModel.description}</canvas>
	</div>

	<div class="ms-sr-only" aria-live="polite">{liveAnnouncement}</div>

	{#if activeView === 'painting'}
		<header class="ms-topbar">
			<h1 class="ms-sr-only">
				Piet Mondrian: A Pioneer of Abstract Art — Interactive Painting Studio
			</h1>
			<p class="ms-intro-pill">
				Change the spacing, color, and paint. Watch a new composition take shape.
			</p>

			<div class="ms-toolbar-cluster">
				<div class="ms-toolbar" role="toolbar" aria-label="Painting studio controls">
					<button type="button" class="ms-btn" onclick={handleNewPainting}>
						New painting
					</button>

					<button type="button" class="ms-btn" onclick={handleReplay}>
						Replay
					</button>

					{#if playbackPhase === 'playing' || playbackPhase === 'paused'}
						<button
							type="button"
							class="ms-btn ms-btn-playback"
							onclick={handlePauseResume}
						>
							{playbackPhase === 'playing' ? 'Pause' : 'Resume'}
						</button>
						<button
							type="button"
							class="ms-btn ms-btn-playback"
							onclick={handleFinishNow}
						>
							Finish now
						</button>
					{/if}

					<button
						bind:this={controlsBtnEl}
						type="button"
						class="ms-btn"
						aria-expanded={trayOpen}
						aria-controls="mondrian-controls-tray"
						onclick={toggleControlsTray}
					>
						Controls
					</button>

					<div class="ms-export-anchor">
						<button
							bind:this={exportBtnEl}
							type="button"
							class="ms-btn"
							aria-expanded={exportMenuOpen}
							aria-haspopup="true"
							onclick={() => (exportMenuOpen = !exportMenuOpen)}
						>
							Save image
						</button>

						{#if exportMenuOpen}
							<div class="ms-export-popover" role="region" aria-label="Save finished painting options">
								<p class="ms-export-note">
									Saves the finished painting alone as a clean PNG without interface controls.
								</p>
								<button
									type="button"
									class="ms-btn ms-export-option"
									disabled={exportingBusy}
									onclick={() => handleExport(2048, false)}
								>
									<span>Save PNG · Standard</span>
									<span>2048 px</span>
								</button>
								<button
									type="button"
									class="ms-btn ms-export-option"
									disabled={exportingBusy}
									onclick={() => handleExport(4096, false)}
								>
									<span>Save PNG · High-res</span>
									<span>4096 px</span>
								</button>
								{#if hasDistinctSavedRatio && savedOriginalRatio !== null}
									<button
										type="button"
										class="ms-btn ms-export-option"
										disabled={exportingBusy}
										onclick={() => handleExport(2048, true)}
									>
										<span>Original saved ratio ({savedOriginalRatio.toFixed(2)}:1)</span>
										<span>2048 px</span>
									</button>
								{/if}
							</div>
						{/if}
					</div>

					<button
						type="button"
						class="ms-btn"
						aria-pressed={isFullscreen}
						onclick={handleToggleFullscreen}
					>
						{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					</button>
				</div>

				<button
					bind:this={readArticleBtnEl}
					type="button"
					class="ms-btn ms-btn-secondary"
					onclick={openArticleView}
				>
					Read about Mondrian
				</button>
			</div>
		</header>

		{#if statusNotice}
			<div class="ms-status-banner" role="status">{statusNotice}</div>
		{/if}

		{#if trayOpen}
			<section
				id="mondrian-controls-tray"
				class="ms-tray"
				aria-label="Composition and paint controls"
			>
				<div class="ms-tray-header">
					<div class="ms-presets-row" role="group" aria-label="Presets">
						<span class="ms-presets-label">Presets</span>
						{#each MONDRIAN_PRESETS as preset (preset.id)}
							<button
								type="button"
								class="ms-btn ms-btn-compact"
								aria-pressed={activePresetId === preset.id}
								title={preset.description}
								onclick={() => handleSelectPreset(preset.id)}
							>
								{preset.label}
							</button>
						{/each}
					</div>

					<div class="ms-tray-header-actions">
						<span class="ms-seed-badge">Seed {studioState.seed}</span>
						<button
							bind:this={closeTrayBtnEl}
							type="button"
							class="ms-btn ms-btn-compact"
							onclick={closeControlsTray}
						>
							Close controls
						</button>
					</div>
				</div>

				<div class="ms-tray-scroll">
					{#if activePresetId}
						{@const activePreset = MONDRIAN_PRESETS.find((p) => p.id === activePresetId)}
						{#if activePreset}
							<p class="ms-preset-caption">
								<strong>{activePreset.label}:</strong> {activePreset.description}
							</p>
						{/if}
					{/if}

					<div class="ms-knobs-grid">
						{#each KNOB_SPECS as spec (spec.key)}
							<RotarySliderKnob
								id={`ms-knob-${spec.key}`}
								label={spec.label}
								value={studioState[spec.key]}
								min={spec.min}
								max={spec.max}
								step={spec.step}
								displayValue={formatKnobDisplay(spec.key)}
								description={spec.description}
								minLabel={spec.minLabel}
								maxLabel={spec.maxLabel}
								onPreview={(val) => previewKnobChange(spec.key, val)}
								onCommit={(val) => commitKnobChange(spec.key, val)}
							/>
						{/each}
					</div>

					<div class="ms-secondary-row">
						<details class="ms-details">
							<summary class="ms-summary">Try a quick visual experiment</summary>
							<div class="ms-details-body">
								<p class="ms-experiment-copy">
									Keep seed 100779 fixed. Reduce Color area from 30% (actual 30.5%) to 15%
									(actual 15.9%) — notice how the warm-white areas reshape the balance. Then
									increase Line width to 1.15% without moving the layout.
								</p>
								<div class="ms-inline-actions">
									<button
										type="button"
										class="ms-btn ms-btn-compact"
										onclick={() => applyGuidedStep('step30')}
									>
										1. 30% color (30.5% actual)
									</button>
									<button
										type="button"
										class="ms-btn ms-btn-compact"
										onclick={() => applyGuidedStep('step15')}
									>
										2. 15% color (15.9% actual)
									</button>
									<button
										type="button"
										class="ms-btn ms-btn-compact"
										onclick={() => applyGuidedStep('stepBold')}
									>
										3. Line width 1.15%
									</button>
								</div>
							</div>
						</details>

						<details class="ms-details">
							<summary class="ms-summary">More options</summary>
							<div class="ms-details-body">
								<div class="ms-more-grid">
									<div class="ms-field-group">
										<label class="ms-field-label" for="ms-seed-input">Seed</label>
										<form class="ms-seed-form" onsubmit={handleApplySeedForm}>
											<input
												id="ms-seed-input"
												class="ms-seed-input"
												type="text"
												bind:value={seedInputText}
												aria-label="Composition seed"
											/>
											<button type="submit" class="ms-btn ms-btn-compact">Apply</button>
										</form>
									</div>

									<div class="ms-field-group" role="group" aria-label="Color emphasis">
										<span class="ms-field-label">Color emphasis</span>
										<div class="ms-emphasis-group">
											{#each [
												{ id: 'balanced', label: 'Balanced' },
												{ id: 'red', label: 'More red' },
												{ id: 'yellow', label: 'More yellow' },
												{ id: 'blue', label: 'More blue' }
											] as item (item.id)}
												<button
													type="button"
													class="ms-btn ms-btn-compact"
													aria-pressed={studioState.colorEmphasis === item.id}
													onclick={() => handleSelectEmphasis(item.id as ColorEmphasis)}
												>
													{item.label}
												</button>
											{/each}
										</div>
									</div>

									<div class="ms-field-group">
										<span class="ms-field-label">Session & sharing</span>
										<div class="ms-inline-actions">
											<button
												type="button"
												class="ms-btn ms-btn-compact"
												disabled={undoStack.length === 0}
												onclick={handleUndo}
											>
												Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
											</button>
											<button
												type="button"
												class="ms-btn ms-btn-compact"
												onclick={handleCopyLink}
											>
												Copy link
											</button>
											<button
												type="button"
												class="ms-btn ms-btn-compact"
												onclick={handleResetSettings}
											>
												Reset settings
											</button>
											<a href="/blog/visualizations" class="ms-btn ms-btn-compact">
												All visualizations
											</a>
										</div>
									</div>
								</div>

								{#if shareFallbackUrl}
									<div class="ms-field-group">
										<label class="ms-field-label" for="ms-share-url">
											Copyable composition URL
										</label>
										<input
											id="ms-share-url"
											class="ms-share-input"
											type="text"
											readonly
											value={shareFallbackUrl}
											onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
										/>
									</div>
								{/if}

								{#if currentModel.layout.limitNotice.clamped && currentModel.layout.limitNotice.reason}
									<p class="ms-fineprint">{currentModel.layout.limitNotice.reason}</p>
								{/if}

								<p class="ms-fineprint">
									Color area measures selected panel area before black boundaries are painted,
									keeping coverage stable when Line width changes. Contemporary algorithmic
									interpretation — not an archival Mondrian work.
								</p>
							</div>
						</details>
					</div>
				</div>
			</section>
		{/if}
	{:else}
		<div
			class="ms-article-overlay"
			role="region"
			aria-label="Accompanying essay: Piet Mondrian: A Pioneer of Abstract Art"
		>
			<div class="ms-article-topbar">
				<button
					bind:this={returnToPaintingBtnEl}
					type="button"
					class="ms-btn ms-btn-active"
					onclick={closeArticleView}
				>
					← Return to painting
				</button>
				<span class="ms-article-meta">
					Current painting preserved · Seed {studioState.seed} · {studioState.panels} panels
				</span>
			</div>

			<article class="ms-article-container">
				<p class="ms-article-kicker">Interactive Essay · Visualizations</p>
				<h1 class="ms-article-h1">Piet Mondrian: A Pioneer of Abstract Art</h1>
				<p class="ms-article-byline">By Suvro Ghosh · 7 min read</p>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="ms-article-prose" onclick={handleArticleProseClick}>
					{#if ArticleContent}
						<ArticleContent />
					{/if}
				</div>

				<div style="margin-top: 2.5rem;">
					<button type="button" class="ms-btn" onclick={closeArticleView}>
						← Return to painting
					</button>
				</div>
			</article>
		</div>
	{/if}
</div>
