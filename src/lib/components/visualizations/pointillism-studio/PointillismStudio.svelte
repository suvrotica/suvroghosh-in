<script lang="ts">
	import { onMount, setContext, tick, type Component } from 'svelte';
	import { openPrivacySettings } from '$lib/privacy/consent';
	import {
		buildPaintingModel,
		chooseArtboardForViewport,
		clearStateFromStorage,
		computeInspectCropRect,
		computeUniformStagePlacement,
		CURATED_SCENE_SEEDS,
		DEFAULT_POINTILLISM_STATE,
		DEFAULT_VIEW_STATE,
		deserializeStateParams,
		exportWholePainting,
		INITIAL_CURATED_SEED,
		KNOB_SPECS,
		loadStateFromStorage,
		MAX_UNDO_HISTORY,
		nextPaintingSeed,
		normalizeSeed,
		normalizeState,
		normalizeViewState,
		ProgressivePaintingBuffer,
		renderPaintingCrop,
		saveStateToStorage,
		SCENE_FAMILIES,
		SECONDARY_KNOB_SPECS,
		serializeStateQuery,
		statesEqual,
		triggerBlobDownload,
		type ExportLongSide,
		type KnobKey,
		type PaintingModel,
		type PointillismState,
		type SceneFamilyId,
		type SecondaryKnobKey,
		type ViewMode,
		type ViewState
	} from '$lib/visualizations/pointillism-studio';
	import RotarySliderKnob from './RotarySliderKnob.svelte';
	import './pointillism-studio.css';

	type PostModule = { default: Component };
	const articleLoaders = import.meta.glob<PostModule>(
		'../../../posts/pointillism-san-antonio-and-texas-in-dots-of-color.md'
	);
	let ArticleContent = $state<Component | null>(null);

	async function ensureArticleLoaded() {
		if (ArticleContent) return;
		const loader = Object.values(articleLoaders)[0];
		if (!loader) return;
		const mod = await loader();
		ArticleContent = mod.default;
	}

	setContext('pointillism-studio-embedded-article', true);

	type PlaybackPhase = 'playing' | 'paused' | 'finished';

	let rootEl: HTMLDivElement | undefined = $state();
	let stageEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let controlsBtnEl: HTMLButtonElement | undefined = $state();
	let closeTrayBtnEl: HTMLButtonElement | undefined = $state();
	let readArticleBtnEl: HTMLButtonElement | undefined = $state();
	let returnToPaintingBtnEl: HTMLButtonElement | undefined = $state();
	let viewMenuBtnEl: HTMLButtonElement | undefined = $state();
	let exportBtnEl: HTMLButtonElement | undefined = $state();

	let studioState = $state<PointillismState>({ ...DEFAULT_POINTILLISM_STATE });
	let committedState = $state<PointillismState>({ ...DEFAULT_POINTILLISM_STATE });
	let undoStack = $state<PointillismState[]>([]);

	let viewState = $state<ViewState>({ ...DEFAULT_VIEW_STATE });
	let previousWholeMode = $state<'fill' | 'fit'>('fill');

	let viewportWidth = $state(1280);
	let viewportHeight = $state(800);
	let prefersReducedMotion = $state(false);
	let isFullscreen = $state(false);
	let isPanningInspect = $state(false);

	let activeOverlay = $state<'painting' | 'article'>('painting');
	let trayOpen = $state(true);
	let viewMenuOpen = $state(false);
	let exportMenuOpen = $state(false);
	let exportingBusy = $state(false);
	let shareFallbackUrl = $state<string | null>(null);
	let statusNotice = $state<string | null>(null);
	let seedInputText = $state(String(INITIAL_CURATED_SEED));

	let playbackPhase = $state<PlaybackPhase>('finished');
	let playbackProgress = $state(1);
	let liveAnnouncement = $state('');

	let currentModel: PaintingModel = $derived(buildPaintingModel(studioState));
	let committedModel: PaintingModel = $derived(buildPaintingModel(committedState));
	let activeFamilySpec = $derived(
		SCENE_FAMILIES.find((f) => f.id === studioState.sceneFamily) ?? SCENE_FAMILIES[0]!
	);

	let stagePlacement = $derived(
		viewState.mode === 'inspect'
			? {
					cssWidth: Math.max(1, viewportWidth),
					cssHeight: Math.max(1, viewportHeight),
					offsetX: 0,
					offsetY: 0,
					scale: 1
				}
			: computeUniformStagePlacement(
					studioState.artboardWidth,
					studioState.artboardHeight,
					viewportWidth,
					viewportHeight,
					viewState.mode
				)
	);

	// Internal mutable renderer state outside Svelte deep reactivity for smooth 60fps painting.
	let progressiveBuffer: ProgressivePaintingBuffer | null = null;
	let backingCanvas: HTMLCanvasElement | null = null;
	let renderToken = 0;
	let rafHandle: number | null = null;
	let lastFrameTimeMs: number | null = null;
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	let mountedReady = false;
	let wasPlayingBeforeArticle = false;
	let stepCounter = 0;

	// Pointer panning state for Inspect-dots mode
	let panPointerId: number | null = null;
	let panStartX = 0;
	let panStartY = 0;
	let panStartCenterX = 0.5;
	let panStartCenterY = 0.5;

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

	function getDpr(): number {
		return typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
			? Math.min(2, Math.max(1, window.devicePixelRatio))
			: 1;
	}

	function syncBackingCanvasFromBuffer() {
		if (typeof document === 'undefined' || !progressiveBuffer) return;
		const { width, height, pixels } = progressiveBuffer;
		if (!backingCanvas) {
			backingCanvas = document.createElement('canvas');
		}
		if (backingCanvas.width !== width || backingCanvas.height !== height) {
			backingCanvas.width = width;
			backingCanvas.height = height;
		}
		const bctx = backingCanvas.getContext('2d', { alpha: false });
		if (!bctx) return;
		const copy = new Uint8ClampedArray(pixels.length);
		copy.set(pixels);
		bctx.putImageData(new ImageData(copy, width, height), 0, 0);
	}

	/**
	 * Presents the current frame onto the visible stage canvas:
	 * - In Fill/Fit modes: scales the fixed logical artboard uniformly with high-quality smoothing
	 *   so resizes never stretch or regenerate marks and scaled-down marks do not shimmer.
	 * - In Inspect mode: renders the magnified logical crop directly from the exact same mark set.
	 */
	function presentStage(lightweightInspect = false) {
		if (!canvasEl) return;
		const dpr = getDpr();

		if (viewState.mode === 'inspect') {
			const maxLong = lightweightInspect ? 720 : 1360;
			const rawW = Math.max(64, viewportWidth * dpr);
			const rawH = Math.max(64, viewportHeight * dpr);
			const longest = Math.max(rawW, rawH);
			const scale = longest > maxLong ? maxLong / longest : 1;
			const outW = Math.max(64, Math.round(rawW * scale));
			const outH = Math.max(64, Math.round(rawH * scale));

			const crop = computeInspectCropRect(
				studioState.artboardWidth,
				studioState.artboardHeight,
				viewState,
				viewportWidth,
				viewportHeight
			);
			const maxMarks = progressiveBuffer
				? progressiveBuffer.getRenderedCount()
				: currentModel.scheduledMarks.length;

			const rgba = renderPaintingCrop(currentModel, crop, outW, outH, maxMarks);
			if (canvasEl.width !== outW || canvasEl.height !== outH) {
				canvasEl.width = outW;
				canvasEl.height = outH;
			}
			const ctx = canvasEl.getContext('2d', { alpha: false });
			if (!ctx) return;
			const copy = new Uint8ClampedArray(rgba.length);
			copy.set(rgba);
			ctx.putImageData(new ImageData(copy, outW, outH), 0, 0);
			return;
		}

		if (!backingCanvas || !progressiveBuffer) return;

		const targetW = Math.min(
			progressiveBuffer.width,
			Math.max(64, Math.round(stagePlacement.cssWidth * dpr))
		);
		const targetH = Math.min(
			progressiveBuffer.height,
			Math.max(64, Math.round(stagePlacement.cssHeight * dpr))
		);

		if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
			canvasEl.width = targetW;
			canvasEl.height = targetH;
		}
		const ctx = canvasEl.getContext('2d', { alpha: false });
		if (!ctx) return;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(backingCanvas, 0, 0, targetW, targetH);
	}

	function startPlaybackLoop() {
		stopAnimationLoop();
		if (typeof requestAnimationFrame !== 'function') {
			if (progressiveBuffer) progressiveBuffer.finishAll();
			playbackProgress = 1;
			playbackPhase = 'finished';
			syncBackingCanvasFromBuffer();
			presentStage(false);
			return;
		}

		const tickFrame = (nowMs: number) => {
			if (playbackPhase !== 'playing' || !progressiveBuffer) {
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

			const duration = Math.max(4, Math.min(20, studioState.paintingTime));
			const nextProgress = Math.min(1, playbackProgress + elapsedSec / duration);
			playbackProgress = nextProgress;
			progressiveBuffer.advanceToProgress(nextProgress);
			syncBackingCanvasFromBuffer();
			presentStage(true);

			if (nextProgress >= 1 || progressiveBuffer.isComplete()) {
				progressiveBuffer.finishAll();
				playbackProgress = 1;
				playbackPhase = 'finished';
				rafHandle = null;
				lastFrameTimeMs = null;
				syncBackingCanvasFromBuffer();
				presentStage(false);
				return;
			}

			rafHandle = requestAnimationFrame(tickFrame);
		};

		rafHandle = requestAnimationFrame(tickFrame);
	}

	function rebuildPainting(options: {
		mode: 'reveal' | 'still';
		lightweightPreview?: boolean;
		preserveProgress?: number;
	}) {
		const token = ++renderToken;
		if (!stageEl || viewportWidth <= 0 || viewportHeight <= 0) return;

		try {
			const model = currentModel;
			const scaleFactor = options.lightweightPreview ? 0.62 : 1.0;
			const bufW = Math.max(240, Math.round(model.state.artboardWidth * scaleFactor));
			const bufH = Math.max(160, Math.round(model.state.artboardHeight * scaleFactor));

			const nextBuf = new ProgressivePaintingBuffer(model, bufW, bufH);
			if (token !== renderToken) return;

			progressiveBuffer = nextBuf;

			if (options.mode === 'reveal') {
				const startAt = options.preserveProgress ?? 0.015;
				playbackProgress = startAt;
				playbackPhase = 'playing';
				progressiveBuffer.advanceToProgress(startAt);
				syncBackingCanvasFromBuffer();
				presentStage(false);
				startPlaybackLoop();
			} else {
				stopAnimationLoop();
				progressiveBuffer.finishAll();
				playbackProgress = 1;
				playbackPhase = 'finished';
				syncBackingCanvasFromBuffer();
				presentStage(Boolean(options.lightweightPreview));
			}
		} catch {
			showStatus('Used compact resolution to fit available browser memory.');
		}
	}

	function syncBrowserHistoryUrl(
		targetState: PointillismState,
		targetView: ViewState,
		overlay: 'painting' | 'article'
	) {
		if (typeof window === 'undefined') return;
		try {
			const query = serializeStateQuery(targetState, {
				overlayView: overlay,
				viewState: targetView
			});
			const nextUrl = `${window.location.pathname}?${query}`;
			window.history.replaceState(window.history.state, '', nextUrl);
		} catch {
			// Ignore history API restrictions in sandboxed environments.
		}
	}

	function pushUndoSnapshot(prev: PointillismState, next: PointillismState) {
		if (statesEqual(prev, next)) return;
		undoStack = [...undoStack.slice(-(MAX_UNDO_HISTORY - 1)), prev];
	}

	function commitStateChange(
		nextRaw: PointillismState,
		options?: {
			recordUndo?: boolean;
			playReveal?: boolean;
			announce?: boolean;
			resetInspectCenterToFocal?: boolean;
		}
	) {
		const next = normalizeState(nextRaw);
		const prevCommitted = committedState;
		if (options?.recordUndo !== false) {
			pushUndoSnapshot(prevCommitted, next);
		}

		studioState = next;
		committedState = next;
		seedInputText = String(next.seed);
		shareFallbackUrl = null;
		saveStateToStorage(next);

		const m = buildPaintingModel(next);
		if (options?.resetInspectCenterToFocal) {
			viewState = normalizeViewState({
				...viewState,
				inspectCenterX: m.scene.focalArea.x,
				inspectCenterY: m.scene.focalArea.y
			});
		}

		syncBrowserHistoryUrl(next, viewState, activeOverlay);

		const shouldPlay =
			Boolean(options?.playReveal) && !prefersReducedMotion && activeOverlay === 'painting';
		rebuildPainting({
			mode: shouldPlay ? 'reveal' : 'still',
			lightweightPreview: false
		});

		if (options?.announce !== false) {
			liveAnnouncement = m.description;
		}
	}

	function previewKnobChange(key: KnobKey | SecondaryKnobKey, nextValue: number) {
		if (key === 'paintingTime') {
			studioState = normalizeState({
				...studioState,
				paintingTime: nextValue
			});
			return;
		}

		studioState = normalizeState({
			...studioState,
			[key]: nextValue
		});
		rebuildPainting({
			mode: 'still',
			lightweightPreview: true
		});
	}

	function commitKnobChange(key: KnobKey | SecondaryKnobKey, nextValue: number) {
		if (key === 'paintingTime') {
			const next = normalizeState({
				...studioState,
				paintingTime: nextValue
			});
			pushUndoSnapshot(committedState, next);
			studioState = next;
			committedState = next;
			saveStateToStorage(next);
			syncBrowserHistoryUrl(next, viewState, activeOverlay);
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

	function handleSelectSceneFamily(familyId: SceneFamilyId) {
		if (familyId === studioState.sceneFamily) return;
		const curatedSeed = CURATED_SCENE_SEEDS[familyId];
		commitStateChange(
			{
				...studioState,
				sceneFamily: familyId,
				seed: curatedSeed
			},
			{
				recordUndo: true,
				playReveal: true,
				announce: true,
				resetInspectCenterToFocal: true
			}
		);
	}

	function handleNewPainting() {
		viewMenuOpen = false;
		exportMenuOpen = false;
		stepCounter += 1;
		const nextSeed = nextPaintingSeed(studioState.seed, stepCounter);
		const dims = chooseArtboardForViewport(viewportWidth, viewportHeight);
		if (viewState.mode === 'inspect') {
			viewState = normalizeViewState({
				...viewState,
				mode: previousWholeMode
			});
		}
		commitStateChange(
			{
				...studioState,
				seed: nextSeed,
				artboardWidth: dims.artboardWidth,
				artboardHeight: dims.artboardHeight
			},
			{
				recordUndo: true,
				playReveal: true,
				announce: true,
				resetInspectCenterToFocal: true
			}
		);
	}

	function handleReplay() {
		viewMenuOpen = false;
		exportMenuOpen = false;
		rebuildPainting({
			mode: 'reveal',
			lightweightPreview: false
		});
	}

	function handlePauseResume() {
		if (playbackPhase === 'playing') {
			stopAnimationLoop();
			playbackPhase = 'paused';
			presentStage(false);
		} else if (playbackPhase === 'paused') {
			playbackPhase = 'playing';
			startPlaybackLoop();
		}
	}

	function handleFinishNow() {
		stopAnimationLoop();
		if (progressiveBuffer) {
			progressiveBuffer.finishAll();
			syncBackingCanvasFromBuffer();
		} else {
			rebuildPainting({ mode: 'still', lightweightPreview: false });
			return;
		}
		playbackProgress = 1;
		playbackPhase = 'finished';
		presentStage(false);
	}

	function setViewMode(nextMode: ViewMode, focusFocal = false) {
		viewMenuOpen = false;
		exportMenuOpen = false;

		if (nextMode === 'inspect') {
			if (viewState.mode !== 'inspect') {
				previousWholeMode = viewState.mode;
			}
			viewState = normalizeViewState({
				...viewState,
				mode: 'inspect',
				inspectCenterX: focusFocal ? currentModel.scene.focalArea.x : viewState.inspectCenterX,
				inspectCenterY: focusFocal ? currentModel.scene.focalArea.y : viewState.inspectCenterY
			});
		} else {
			previousWholeMode = nextMode;
			viewState = normalizeViewState({
				...viewState,
				mode: nextMode
			});
		}

		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage(false);
	}

	function handleOneActionInspectToggle() {
		if (viewState.mode === 'inspect') {
			setViewMode(previousWholeMode, false);
		} else {
			setViewMode('inspect', true);
		}
	}

	function panInspectByFraction(dxFrac: number, dyFrac: number) {
		if (viewState.mode !== 'inspect') return;
		const stepScale = 1 / viewState.inspectZoom;
		viewState = normalizeViewState({
			...viewState,
			inspectCenterX: viewState.inspectCenterX + dxFrac * stepScale,
			inspectCenterY: viewState.inspectCenterY + dyFrac * stepScale
		});
		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage(false);
	}

	function adjustInspectZoom(delta: number) {
		if (viewState.mode !== 'inspect') return;
		viewState = normalizeViewState({
			...viewState,
			inspectZoom: viewState.inspectZoom + delta
		});
		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage(false);
	}

	function handleStagePointerDown(event: PointerEvent) {
		if (viewState.mode !== 'inspect') return;
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		const el = event.currentTarget as HTMLElement;
		el.setPointerCapture(event.pointerId);
		panPointerId = event.pointerId;
		isPanningInspect = true;
		panStartX = event.clientX;
		panStartY = event.clientY;
		panStartCenterX = viewState.inspectCenterX;
		panStartCenterY = viewState.inspectCenterY;
		event.preventDefault();
	}

	function handleStagePointerMove(event: PointerEvent) {
		if (!isPanningInspect || panPointerId !== event.pointerId || viewState.mode !== 'inspect') {
			return;
		}
		const crop = computeInspectCropRect(
			studioState.artboardWidth,
			studioState.artboardHeight,
			viewState,
			viewportWidth,
			viewportHeight
		);
		const dxPx = event.clientX - panStartX;
		const dyPx = event.clientY - panStartY;
		const nextCenterX =
			panStartCenterX - (dxPx / Math.max(1, viewportWidth)) * (crop.width / studioState.artboardWidth);
		const nextCenterY =
			panStartCenterY - (dyPx / Math.max(1, viewportHeight)) * (crop.height / studioState.artboardHeight);

		viewState = normalizeViewState({
			...viewState,
			inspectCenterX: nextCenterX,
			inspectCenterY: nextCenterY
		});
		presentStage(true);
	}

	function handleStagePointerUp(event: PointerEvent) {
		if (!isPanningInspect || panPointerId !== event.pointerId) return;
		const el = event.currentTarget as HTMLElement;
		if (el.hasPointerCapture(event.pointerId)) {
			el.releasePointerCapture(event.pointerId);
		}
		isPanningInspect = false;
		panPointerId = null;
		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage(false);
	}

	function handleStageWheel(event: WheelEvent) {
		if (viewState.mode !== 'inspect') return;
		event.preventDefault();
		const delta = event.deltaY < 0 ? 0.3 : -0.3;
		adjustInspectZoom(delta);
	}

	function handleApplySeedForm(event: SubmitEvent) {
		event.preventDefault();
		const nextSeed = normalizeSeed(seedInputText, studioState.seed);
		commitStateChange(
			{
				...studioState,
				seed: nextSeed
			},
			{
				recordUndo: true,
				playReveal: false,
				announce: true,
				resetInspectCenterToFocal: true
			}
		);
	}

	function handleUndo() {
		if (undoStack.length === 0) return;
		const previous = undoStack[undoStack.length - 1]!;
		undoStack = undoStack.slice(0, -1);
		commitStateChange(previous, {
			recordUndo: false,
			playReveal: false,
			announce: true
		});
		showStatus(`Restored previous painting settings (seed ${previous.seed}).`);
	}

	function handleResetSettings() {
		clearStateFromStorage();
		const dims = chooseArtboardForViewport(viewportWidth, viewportHeight);
		viewState = { ...DEFAULT_VIEW_STATE };
		previousWholeMode = 'fill';
		const resetTarget = normalizeState({
			...DEFAULT_POINTILLISM_STATE,
			artboardWidth:
				dims.artboardWidth === DEFAULT_POINTILLISM_STATE.artboardWidth
					? DEFAULT_POINTILLISM_STATE.artboardWidth
					: dims.artboardWidth,
			artboardHeight:
				dims.artboardHeight === DEFAULT_POINTILLISM_STATE.artboardHeight
					? DEFAULT_POINTILLISM_STATE.artboardHeight
					: dims.artboardHeight
		});
		commitStateChange(resetTarget, {
			recordUndo: true,
			playReveal: false,
			announce: true,
			resetInspectCenterToFocal: true
		});
		showStatus('Reset studio to the default San Antonio river path painting.');
	}

	async function handleCopyLink() {
		if (typeof window === 'undefined') return;
		const query = serializeStateQuery(studioState, { viewState });
		const url = `${window.location.origin}${window.location.pathname}?${query}`;
		try {
			if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
				await navigator.clipboard.writeText(url);
				shareFallbackUrl = null;
				showStatus('Copied reproducible painting link to clipboard.');
				return;
			}
		} catch {
			// Fall through to selectable URL input fallback.
		}
		shareFallbackUrl = url;
		showStatus('Clipboard permission unavailable — copy the link shown below.');
	}

	async function handleExport(longSidePx: ExportLongSide) {
		if (exportingBusy) return;
		exportingBusy = true;
		try {
			const result = await exportWholePainting(studioState, {
				longSidePx,
				model: currentModel
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
		viewMenuOpen = false;
		exportMenuOpen = false;
		wasPlayingBeforeArticle = playbackPhase === 'playing';
		if (wasPlayingBeforeArticle) {
			stopAnimationLoop();
			playbackPhase = 'paused';
		}
		await ensureArticleLoaded();
		activeOverlay = 'article';
		syncBrowserHistoryUrl(studioState, viewState, 'article');
		await tick();
		returnToPaintingBtnEl?.focus();
	}

	async function closeArticleView() {
		activeOverlay = 'painting';
		syncBrowserHistoryUrl(studioState, viewState, 'painting');
		await tick();
		if (wasPlayingBeforeArticle && playbackPhase === 'paused') {
			wasPlayingBeforeArticle = false;
			playbackPhase = 'playing';
			startPlaybackLoop();
		} else {
			presentStage(false);
		}
		readArticleBtnEl?.focus();
	}

	function handleArticleProseClick(event: MouseEvent) {
		const target = (event.target as HTMLElement | null)?.closest('a');
		if (!target) return;
		const href = target.getAttribute('href') ?? '';
		if (!href.startsWith('/tools/pointillism-studio?')) return;

		event.preventDefault();
		const query = href.slice(href.indexOf('?') + 1);
		const parsed = deserializeStateParams(query);
		wasPlayingBeforeArticle = false;
		activeOverlay = 'painting';
		if (parsed.hasExplicitView) {
			viewState = parsed.viewState;
		} else {
			viewState = normalizeViewState({ ...viewState, mode: previousWholeMode });
		}
		commitStateChange(parsed.state, {
			recordUndo: true,
			playReveal: false,
			announce: true
		});
		showStatus(`Loaded example settings (seed ${parsed.state.seed}).`);
	}

	function applyExperimentStep(step: 'inspect' | 'whole' | 'largerDots') {
		if (step === 'inspect') {
			const baseRiver = normalizeState({
				...DEFAULT_POINTILLISM_STATE,
				artboardWidth: studioState.artboardWidth,
				artboardHeight: studioState.artboardHeight
			});
			const m = buildPaintingModel(baseRiver);
			viewState = normalizeViewState({
				mode: 'inspect',
				inspectZoom: 3.4,
				inspectCenterX: m.scene.focalArea.x,
				inspectCenterY: m.scene.focalArea.y
			});
			commitStateChange(baseRiver, { recordUndo: true, playReveal: false, announce: true });
			showStatus('Inspecting close-up: separate oil dabs and primed canvas ground.');
		} else if (step === 'whole') {
			setViewMode('fit', false);
			showStatus('Returned to whole painting: the exact same marks read as shirt, shade, and water.');
		} else {
			setViewMode('fit', false);
			commitStateChange(
				{
					...studioState,
					sceneFamily: 'river-path',
					seed: INITIAL_CURATED_SEED,
					dotSize: 74,
					dotSpacing: 35,
					paletteContrast: 45,
					colorVariation: 40
				},
				{ recordUndo: true, playReveal: false, announce: true }
			);
			showStatus('Enlarged Dot size to 74% while keeping mark centers and scene geometry fixed.');
		}
	}

	function formatKnobDisplay(key: KnobKey | SecondaryKnobKey): string {
		if (key === 'paintingTime') return `${studioState.paintingTime} s`;
		return `${studioState[key]}%`;
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (viewMenuOpen) {
				viewMenuOpen = false;
				viewMenuBtnEl?.focus();
				event.stopPropagation();
				return;
			}
			if (exportMenuOpen) {
				exportMenuOpen = false;
				exportBtnEl?.focus();
				event.stopPropagation();
				return;
			}
			if (activeOverlay === 'article') {
				void closeArticleView();
				event.stopPropagation();
				return;
			}
			if (viewState.mode === 'inspect') {
				setViewMode(previousWholeMode, false);
				event.stopPropagation();
				return;
			}
		}

		if (activeOverlay !== 'painting' || viewState.mode !== 'inspect') return;
		const tag = (event.target as HTMLElement | null)?.tagName ?? '';
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			panInspectByFraction(-0.18, 0);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			panInspectByFraction(0.18, 0);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			panInspectByFraction(0, -0.18);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			panInspectByFraction(0, 0.18);
		} else if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			adjustInspectZoom(0.4);
		} else if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			adjustInspectZoom(-0.4);
		}
	}

	/**
	 * Ordinary window resizing, mobile address-bar resizing, and panel toggling keep the
	 * logical artboard, mark positions, and active mark count completely fixed, uniformly
	 * scaling or letterboxing the existing painting onto the stage.
	 */
	function handleViewportMeasurement(width: number, height: number) {
		if (width < 32 || height < 32) return;
		const changed = Math.abs(width - viewportWidth) >= 2 || Math.abs(height - viewportHeight) >= 2;
		if (!changed) return;

		viewportWidth = width;
		viewportHeight = height;

		if (!mountedReady) return;
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			presentStage(false);
		}, 60);
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

		const urlParsed = deserializeStateParams(window.location.search);
		let initialState: PointillismState;
		if (urlParsed.hasExplicitState) {
			initialState = urlParsed.state;
		} else {
			const stored = loadStateFromStorage();
			initialState = stored ?? { ...DEFAULT_POINTILLISM_STATE };
		}

		const initialModel = buildPaintingModel(initialState);
		if (urlParsed.hasExplicitView) {
			viewState = urlParsed.viewState;
			if (urlParsed.viewState.mode === 'fit') previousWholeMode = 'fit';
		} else {
			viewState = normalizeViewState({
				...DEFAULT_VIEW_STATE,
				inspectCenterX: initialModel.scene.focalArea.x,
				inspectCenterY: initialModel.scene.focalArea.y
			});
		}

		activeOverlay = urlParsed.initialOverlay;
		if (activeOverlay === 'article') {
			void ensureArticleLoaded();
		}

		studioState = initialState;
		committedState = initialState;
		seedInputText = String(initialState.seed);
		liveAnnouncement = initialModel.description;
		mountedReady = true;

		const playInitialSequence =
			!prefersReducedMotion && activeOverlay === 'painting' && viewState.mode !== 'inspect';
		rebuildPainting({
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

<div class="ps-root" bind:this={rootEl}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="ps-stage"
		class:is-inspect={viewState.mode === 'inspect'}
		class:is-panning={isPanningInspect}
		bind:this={stageEl}
		onpointerdown={handleStagePointerDown}
		onpointermove={handleStagePointerMove}
		onpointerup={handleStagePointerUp}
		onpointercancel={handleStagePointerUp}
		onwheel={handleStageWheel}
	>
		<canvas
			bind:this={canvasEl}
			class="ps-canvas"
			data-view-mode={viewState.mode}
			data-artboard={`${studioState.artboardWidth}x${studioState.artboardHeight}`}
			data-active-marks={currentModel.activeCount}
			style={`width:${stagePlacement.cssWidth}px;height:${stagePlacement.cssHeight}px;transform:translate(${stagePlacement.offsetX}px,${stagePlacement.offsetY}px);`}
			aria-label={committedModel.description}
		>
			{committedModel.description}
		</canvas>
	</div>

	<div class="ps-sr-only" aria-live="polite">{liveAnnouncement}</div>

	{#if activeOverlay === 'painting'}
		<header class="ps-topbar">
			<h1 class="ps-sr-only">
				Pointillism: San Antonio and Texas in Dots of Color — Interactive Painting Studio
			</h1>
			<p class="ps-intro-pill">
				Choose a Texas scene. Change the dots and colors. Watch the picture emerge.
			</p>

			<div class="ps-toolbar-cluster">
				<div class="ps-toolbar" role="toolbar" aria-label="Painting studio controls">
					<button type="button" class="ps-btn" onclick={handleNewPainting}>
						New painting
					</button>

					<button type="button" class="ps-btn" onclick={handleReplay}>
						Replay
					</button>

					{#if playbackPhase === 'playing' || playbackPhase === 'paused'}
						<button
							type="button"
							class="ps-btn ps-btn-playback"
							onclick={handlePauseResume}
						>
							{playbackPhase === 'playing' ? 'Pause' : 'Resume'}
						</button>
						<button
							type="button"
							class="ps-btn ps-btn-playback"
							onclick={handleFinishNow}
						>
							Finish now
						</button>
					{/if}

					<button
						type="button"
						class="ps-btn"
						class:ps-btn-active={viewState.mode === 'inspect'}
						aria-pressed={viewState.mode === 'inspect'}
						onclick={handleOneActionInspectToggle}
					>
						{viewState.mode === 'inspect' ? 'Whole painting' : 'Inspect dots'}
					</button>

					<div class="ps-popover-anchor">
						<button
							bind:this={viewMenuBtnEl}
							type="button"
							class="ps-btn"
							aria-expanded={viewMenuOpen}
							aria-haspopup="true"
							onclick={() => {
								exportMenuOpen = false;
								viewMenuOpen = !viewMenuOpen;
							}}
						>
							View
						</button>

						{#if viewMenuOpen}
							<div class="ps-popover" role="region" aria-label="Painting view scale options">
								<p class="ps-popover-note">
									Changing view inspects or frames the existing marks without altering Dot size or
									Dot spacing.
								</p>
								<button
									type="button"
									class="ps-btn ps-popover-option"
									aria-pressed={viewState.mode === 'fill'}
									onclick={() => setViewMode('fill', false)}
								>
									<span>Fill screen</span>
									<span>Edge-to-edge</span>
								</button>
								<button
									type="button"
									class="ps-btn ps-popover-option"
									aria-pressed={viewState.mode === 'fit'}
									onclick={() => setViewMode('fit', false)}
								>
									<span>Fit painting</span>
									<span>All 4 edges</span>
								</button>
								<button
									type="button"
									class="ps-btn ps-popover-option"
									aria-pressed={viewState.mode === 'inspect'}
									onclick={() => setViewMode('inspect', true)}
								>
									<span>Inspect dots</span>
									<span>{viewState.inspectZoom.toFixed(1)}× close-up</span>
								</button>
							</div>
						{/if}
					</div>

					<button
						bind:this={controlsBtnEl}
						type="button"
						class="ps-btn"
						aria-expanded={trayOpen}
						aria-controls="pointillism-controls-tray"
						onclick={toggleControlsTray}
					>
						Controls
					</button>

					<div class="ps-popover-anchor">
						<button
							bind:this={exportBtnEl}
							type="button"
							class="ps-btn"
							aria-expanded={exportMenuOpen}
							aria-haspopup="true"
							onclick={() => {
								viewMenuOpen = false;
								exportMenuOpen = !exportMenuOpen;
							}}
						>
							Save image
						</button>

						{#if exportMenuOpen}
							<div class="ps-popover" role="region" aria-label="Save finished painting options">
								<p class="ps-popover-note">
									Saves the entire finished painting cleanly without controls or watermarks, even
									while zoomed in.
								</p>
								<button
									type="button"
									class="ps-btn ps-popover-option"
									disabled={exportingBusy}
									onclick={() => handleExport(2048)}
								>
									<span>Save whole painting · Large PNG</span>
									<span>2048 px</span>
								</button>
								<button
									type="button"
									class="ps-btn ps-popover-option"
									disabled={exportingBusy}
									onclick={() => handleExport(4096)}
								>
									<span>Save whole painting · Print PNG</span>
									<span>4096 px</span>
								</button>
							</div>
						{/if}
					</div>

					<button
						type="button"
						class="ps-btn"
						aria-pressed={isFullscreen}
						onclick={handleToggleFullscreen}
					>
						{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					</button>
				</div>

				<button
					bind:this={readArticleBtnEl}
					type="button"
					class="ps-btn ps-btn-secondary"
					onclick={openArticleView}
				>
					Read the post
				</button>
			</div>
		</header>

		{#if viewState.mode === 'inspect'}
			<div class="ps-inspect-hud" role="region" aria-label="Surface inspection controls">
				<span class="ps-inspect-copy">
					Inspecting surface marks &amp; linen ground (view only — painting unchanged). Drag or use
					arrow keys to pan.
				</span>
				<div class="ps-inspect-controls">
					<button
						type="button"
						class="ps-btn ps-btn-icon"
						aria-label="Zoom out close-up"
						disabled={viewState.inspectZoom <= 2.0}
						onclick={() => adjustInspectZoom(-0.4)}
					>
						−
					</button>
					<span class="ps-zoom-readout">{viewState.inspectZoom.toFixed(1)}×</span>
					<button
						type="button"
						class="ps-btn ps-btn-icon"
						aria-label="Zoom in close-up"
						disabled={viewState.inspectZoom >= 5.0}
						onclick={() => adjustInspectZoom(0.4)}
					>
						+
					</button>
					<button
						type="button"
						class="ps-btn ps-btn-icon"
						aria-label="Pan inspection left"
						onclick={() => panInspectByFraction(-0.18, 0)}
					>
						←
					</button>
					<button
						type="button"
						class="ps-btn ps-btn-icon"
						aria-label="Pan inspection up"
						onclick={() => panInspectByFraction(0, -0.18)}
					>
						↑
					</button>
					<button
						type="button"
						class="ps-btn ps-btn-icon"
						aria-label="Pan inspection down"
						onclick={() => panInspectByFraction(0, 0.18)}
					>
						↓
					</button>
					<button
						type="button"
						class="ps-btn ps-btn-icon"
						aria-label="Pan inspection right"
						onclick={() => panInspectByFraction(0.18, 0)}
					>
						→
					</button>
					<button
						type="button"
						class="ps-btn ps-btn-compact ps-btn-active"
						onclick={() => setViewMode(previousWholeMode, false)}
					>
						Return to whole painting
					</button>
				</div>
			</div>
		{/if}

		{#if statusNotice}
			<div class="ps-status-banner" role="status">{statusNotice}</div>
		{/if}

		{#if trayOpen}
			<section
				id="pointillism-controls-tray"
				class="ps-tray"
				aria-label="Texas scene selector and Pointillism painting controls"
			>
				<div class="ps-tray-header">
					<div class="ps-scenes-row" role="group" aria-label="Texas scene families">
						<span class="ps-scenes-label">Texas scene</span>
						{#each SCENE_FAMILIES as family (family.id)}
							<button
								type="button"
								class="ps-btn ps-btn-compact"
								aria-pressed={studioState.sceneFamily === family.id}
								title={family.description}
								onclick={() => handleSelectSceneFamily(family.id)}
							>
								{family.shortLabel}
							</button>
						{/each}
					</div>

					<div class="ps-tray-header-actions">
						<span class="ps-meta-badge">
							{currentModel.activeCount.toLocaleString('en-US')} marks · Seed {studioState.seed}
						</span>
						<button
							bind:this={closeTrayBtnEl}
							type="button"
							class="ps-btn ps-btn-compact"
							onclick={closeControlsTray}
						>
							Close controls
						</button>
					</div>
				</div>

				<div class="ps-tray-scroll">
					<p class="ps-scene-caption">
						<strong>{activeFamilySpec.label}:</strong> {activeFamilySpec.description}
					</p>

					<div class="ps-knobs-grid">
						{#each KNOB_SPECS as spec (spec.key)}
							<RotarySliderKnob
								id={`ps-knob-${spec.key}`}
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

					<div class="ps-secondary-row">
						<details class="ps-details">
							<summary class="ps-summary">How separate dots become a place</summary>
							<div class="ps-details-body">
								<p class="ps-experiment-copy">
									Inspect the riverside walkers close up to see separate slate-blue, ochre, cream,
									terracotta, and olive oil dabs with primed linen between them. Step back so they
									merge into shirts, tree shade, and water — then enlarge Dot size to 74% to see the
									marks themselves grow without moving the scene.
								</p>
								<div class="ps-inline-actions">
									<button
										type="button"
										class="ps-btn ps-btn-compact"
										onclick={() => applyExperimentStep('inspect')}
									>
										1. Inspect close up (3.4×)
									</button>
									<button
										type="button"
										class="ps-btn ps-btn-compact"
										onclick={() => applyExperimentStep('whole')}
									>
										2. Step back to whole painting
									</button>
									<button
										type="button"
										class="ps-btn ps-btn-compact"
										onclick={() => applyExperimentStep('largerDots')}
									>
										3. Enlarge Dot size to 74%
									</button>
								</div>
							</div>
						</details>

						<details class="ps-details">
							<summary class="ps-summary">More options</summary>
							<div class="ps-details-body">
								<div class="ps-secondary-knobs">
									<RotarySliderKnob
										id="ps-knob-paintTexture"
										label={SECONDARY_KNOB_SPECS.paintTexture.label}
										value={studioState.paintTexture}
										min={SECONDARY_KNOB_SPECS.paintTexture.min}
										max={SECONDARY_KNOB_SPECS.paintTexture.max}
										step={SECONDARY_KNOB_SPECS.paintTexture.step}
										displayValue={formatKnobDisplay('paintTexture')}
										description={SECONDARY_KNOB_SPECS.paintTexture.description}
										minLabel={SECONDARY_KNOB_SPECS.paintTexture.minLabel}
										maxLabel={SECONDARY_KNOB_SPECS.paintTexture.maxLabel}
										onPreview={(val) => previewKnobChange('paintTexture', val)}
										onCommit={(val) => commitKnobChange('paintTexture', val)}
									/>
									<RotarySliderKnob
										id="ps-knob-paintingTime"
										label={SECONDARY_KNOB_SPECS.paintingTime.label}
										value={studioState.paintingTime}
										min={SECONDARY_KNOB_SPECS.paintingTime.min}
										max={SECONDARY_KNOB_SPECS.paintingTime.max}
										step={SECONDARY_KNOB_SPECS.paintingTime.step}
										displayValue={formatKnobDisplay('paintingTime')}
										description={SECONDARY_KNOB_SPECS.paintingTime.description}
										minLabel={SECONDARY_KNOB_SPECS.paintingTime.minLabel}
										maxLabel={SECONDARY_KNOB_SPECS.paintingTime.maxLabel}
										onPreview={(val) => previewKnobChange('paintingTime', val)}
										onCommit={(val) => commitKnobChange('paintingTime', val)}
									/>
								</div>

								<div class="ps-more-grid">
									<div class="ps-field-group">
										<label class="ps-field-label" for="ps-seed-input">Seed</label>
										<form class="ps-seed-form" onsubmit={handleApplySeedForm}>
											<input
												id="ps-seed-input"
												class="ps-seed-input"
												type="text"
												bind:value={seedInputText}
												aria-label="Painting seed"
											/>
											<button type="submit" class="ps-btn ps-btn-compact">Apply</button>
										</form>
									</div>

									<div class="ps-field-group">
										<span class="ps-field-label">Session &amp; sharing</span>
										<div class="ps-inline-actions">
											<button
												type="button"
												class="ps-btn ps-btn-compact"
												disabled={undoStack.length === 0}
												onclick={handleUndo}
											>
												Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
											</button>
											<button
												type="button"
												class="ps-btn ps-btn-compact"
												onclick={handleCopyLink}
											>
												Copy link
											</button>
											<button
												type="button"
												class="ps-btn ps-btn-compact"
												onclick={handleResetSettings}
											>
												Reset settings
											</button>
											<a href="/blog/visualizations" class="ps-btn ps-btn-compact">
												All visualizations
											</a>
											<button
												type="button"
												class="ps-btn ps-btn-compact"
												data-privacy-settings
												onclick={openPrivacySettings}
											>
												Privacy &amp; cookies
											</button>
										</div>
									</div>
								</div>

								{#if shareFallbackUrl}
									<div class="ps-field-group">
										<label class="ps-field-label" for="ps-share-url">
											Copyable painting URL
										</label>
										<input
											id="ps-share-url"
											class="ps-share-input"
											type="text"
											readonly
											value={shareFallbackUrl}
											onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
										/>
									</div>
								{/if}

								<p class="ps-fineprint">
									Dot size and Dot spacing shape surface coverage together: wider spacing selects
									fewer marks from a stable hierarchy and exposes more primed linen ground, while
									larger dots expand each mark around its fixed center. Interpreted procedural Texas
									scenes — generated locally in your browser without external services.
								</p>
							</div>
						</details>
					</div>
				</div>
			</section>
		{/if}
	{:else}
		<div
			class="ps-article-overlay"
			role="region"
			aria-label="Accompanying essay: Pointillism: San Antonio and Texas in Dots of Color"
		>
			<div class="ps-article-topbar">
				<button
					bind:this={returnToPaintingBtnEl}
					type="button"
					class="ps-btn ps-btn-active"
					onclick={closeArticleView}
				>
					← Return to painting
				</button>
				<span class="ps-article-meta">
					Painting preserved · {activeFamilySpec.shortLabel} · Seed {studioState.seed}
				</span>
			</div>

			<article class="ps-article-container">
				<p class="ps-article-kicker">Interactive Essay · Visualizations</p>
				<h1 class="ps-article-h1">Pointillism: San Antonio and Texas in Dots of Color</h1>
				<p class="ps-article-byline">By Suvro Ghosh · 8 min read</p>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="ps-article-prose" onclick={handleArticleProseClick}>
					{#if ArticleContent}
						<ArticleContent />
					{/if}
				</div>

				<div style="margin-top: 2.5rem;">
					<button type="button" class="ps-btn" onclick={closeArticleView}>
						← Return to painting
					</button>
				</div>
			</article>
		</div>
	{/if}
</div>
