<script lang="ts">
	import { onMount, setContext, tick, type Component } from 'svelte';
	import { resolve } from '$app/paths';
	import { openPrivacySettings } from '$lib/privacy/consent';
	import {
		applyPreset,
		buildPaintingModel,
		chooseArtboardForViewport,
		clearStateFromStorage,
		computeInspectCropRect,
		computeUniformStagePlacement,
		CURATED_DEFAULT_SEED,
		CURATED_STUDY_SEEDS,
		DEFAULT_DRIP_STATE,
		DEFAULT_VIEW_STATE,
		describePaintingAccessible,
		deserializeStateParams,
		EXPERIMENT_CONFIG,
		exportWholePainting,
		findMatchingPreset,
		KNOB_SPECS,
		loadStateFromStorage,
		MAX_UNDO_HISTORY,
		createNextSeed,
		normalizeSeed,
		normalizeState,
		normalizeViewState,
		PRESET_SPECS,
		ProgressiveDripBuffer,
		saveStateToStorage,
		SECONDARY_KNOB_SPECS,
		serializeStateQuery,
		statesEqual,
		STUDY_LIST,
		STUDY_SPECS,
		triggerBlobDownload,
		type DripPaintingState,
		type ExportResolution,
		type KnobKey,
		type PaintingModel,
		type PresetId,
		type SecondaryKnobKey,
		type StudyId,
		type ViewMode,
		type ViewState
	} from '$lib/visualizations/drip-painting-studio';
	import RotarySliderKnob from './RotarySliderKnob.svelte';
	import './drip-painting-studio.css';

	type PostModule = { default: Component };
	const articleLoaders = import.meta.glob<PostModule>(
		'../../../posts/abstract-expressionist-drip-painting-corruption-in-india.md'
	);
	let ArticleContent = $state<Component | null>(null);
	let articleMissing = $state(false);

	async function ensureArticleLoaded() {
		if (ArticleContent) return;
		const loader = Object.values(articleLoaders)[0];
		if (!loader) {
			articleMissing = true;
			return;
		}
		articleMissing = false;
		const mod = await loader();
		ArticleContent = mod.default;
	}

	setContext('drip-painting-studio-embedded-article', true);

	type PlaybackPhase = 'playing' | 'paused' | 'finished';

	let rootEl: HTMLDivElement | undefined = $state();
	let stageEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let topStackEl: HTMLElement | undefined = $state();
	let controlsBtnEl: HTMLButtonElement | undefined = $state();
	let closeTrayBtnEl: HTMLButtonElement | undefined = $state();
	let readArticleBtnEl: HTMLButtonElement | undefined = $state();
	let returnToPaintingBtnEl: HTMLButtonElement | undefined = $state();
	let exportBtnEl: HTMLButtonElement | undefined = $state();

	let studioState = $state<DripPaintingState>({ ...DEFAULT_DRIP_STATE });
	let committedState = $state<DripPaintingState>({ ...DEFAULT_DRIP_STATE });
	let undoStack = $state<DripPaintingState[]>([]);

	let viewState = $state<ViewState>({ ...DEFAULT_VIEW_STATE });
	let previousWholeMode = $state<'fill' | 'fit'>('fill');

	/**
	 * Keep inspectCenterX / inspectCenterY quantized to the exact 3-decimal precision
	 * emitted by serializeStateParams (`ix` / `iy`) so `popstate` and fresh URL loads
	 * restore the identical inspect crop with zero rounding shift.
	 */
	function normalizeStudioViewState(raw?: Partial<Record<keyof ViewState, unknown>>): ViewState {
		const normalized = normalizeViewState(raw);
		return {
			...normalized,
			inspectCenterX: Number(normalized.inspectCenterX.toFixed(3)),
			inspectCenterY: Number(normalized.inspectCenterY.toFixed(3))
		};
	}

	let viewportWidth = $state(1280);
	let viewportHeight = $state(800);
	let prefersReducedMotion = $state(false);
	let isFullscreen = $state(false);
	let isPanningInspect = $state(false);
	let isIdleDimmed = $state(false);
	let introDismissed = $state(false);

	let activeOverlay = $state<'painting' | 'article'>('painting');
	let trayOpen = $state(true);
	let exportMenuOpen = $state(false);
	let exportPopoverTopPx = $state(64);
	let exportPopoverMaxHeightPx = $state(280);
	let exportingBusy = $state(false);
	let shareFallbackUrl = $state<string | null>(null);
	let statusNotice = $state<string | null>(null);
	let seedInputText = $state(String(CURATED_DEFAULT_SEED));

	let playbackPhase = $state<PlaybackPhase>('finished');
	let playbackProgress = $state(1);
	let liveAnnouncement = $state('');

	let currentModel: PaintingModel = $derived(buildPaintingModel(studioState));
	let committedModel: PaintingModel = $derived(
		statesEqual(studioState, committedState) ? currentModel : buildPaintingModel(committedState)
	);
	let committedDescription = $derived(describePaintingAccessible(committedState, committedModel));
	let activeStudySpec = $derived(STUDY_SPECS[studioState.study]);
	let activePresetId = $derived(findMatchingPreset(studioState));
	let activePresetSpec = $derived(
		activePresetId ? (PRESET_SPECS.find((p) => p.id === activePresetId) ?? null) : null
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
					viewportWidth,
					viewportHeight,
					studioState.artboardWidth,
					studioState.artboardHeight,
					viewState.mode === 'fit' ? 'fit' : 'fill'
				)
	);

	// Renderer state kept outside Svelte deep reactivity for smooth 60fps painting and exact-buffer inspection.
	let progressiveBuffer: ProgressiveDripBuffer | null = null;
	let bufferCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
	let bufferState: DripPaintingState | null = null;
	let bufferIsLightweight = false;
	let initialMountState: DripPaintingState = { ...DEFAULT_DRIP_STATE };
	let isRestoringHistory = false;
	let historyNavToken = 0;
	let renderToken = 0;
	let rafHandle: number | null = null;
	let lastFrameTimeMs: number | null = null;
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let mountedReady = false;
	let pausedByVisibility = false;
	let wasPlayingBeforeArticle = false;
	let stepCounter = 0;

	// Pointer panning state for Inspect surface mode
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

	function bumpIdleActivity() {
		isIdleDimmed = false;
		if (idleTimer) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
		if (
			trayOpen ||
			exportMenuOpen ||
			activeOverlay !== 'painting' ||
			prefersReducedMotion ||
			playbackPhase === 'paused'
		) {
			return;
		}
		idleTimer = setTimeout(() => {
			if (
				trayOpen ||
				exportMenuOpen ||
				activeOverlay !== 'painting' ||
				prefersReducedMotion ||
				playbackPhase === 'paused'
			) {
				return;
			}
			if (
				typeof document !== 'undefined' &&
				topStackEl &&
				document.activeElement &&
				topStackEl.contains(document.activeElement)
			) {
				return;
			}
			isIdleDimmed = true;
		}, 4500);
	}

	$effect(() => {
		const _deps = [trayOpen, exportMenuOpen, activeOverlay, prefersReducedMotion, playbackPhase];
		void _deps;
		bumpIdleActivity();
	});

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

	function refreshBufferCanvas() {
		bufferCanvas = progressiveBuffer ? progressiveBuffer.getCanvas() : null;
	}

	/**
	 * Presents the current frame onto the visible stage canvas:
	 * - Fill/Fit: scales the fixed logical artboard uniformly from the cached backing buffer.
	 * - Inspect surface: crops and draws directly from the exact existing backing buffer via drawImage
	 *   without generating new strands, moving droplets, or altering thickness.
	 */
	function presentStage() {
		if (!canvasEl || !progressiveBuffer || !bufferCanvas) return;
		const dpr = getDpr();

		if (viewState.mode === 'inspect') {
			const outW = Math.max(64, Math.min(2400, Math.round(viewportWidth * dpr)));
			const outH = Math.max(64, Math.min(2400, Math.round(viewportHeight * dpr)));
			const crop = computeInspectCropRect(
				{
					artboardWidth: studioState.artboardWidth,
					artboardHeight: studioState.artboardHeight
				},
				viewState.inspectZoom,
				viewState.inspectCenterX,
				viewState.inspectCenterY,
				viewportWidth,
				viewportHeight
			);

			const scaleX = progressiveBuffer.width / Math.max(1, studioState.artboardWidth);
			const scaleY = progressiveBuffer.height / Math.max(1, studioState.artboardHeight);
			const sx = Math.max(0, crop.x * scaleX);
			const sy = Math.max(0, crop.y * scaleY);
			const sw = Math.max(1, Math.min(progressiveBuffer.width - sx, crop.width * scaleX));
			const sh = Math.max(1, Math.min(progressiveBuffer.height - sy, crop.height * scaleY));

			if (canvasEl.width !== outW || canvasEl.height !== outH) {
				canvasEl.width = outW;
				canvasEl.height = outH;
			}
			const ctx = canvasEl.getContext('2d', { alpha: false });
			if (!ctx) return;
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(bufferCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
			return;
		}

		const ratioScale = Math.min(
			1,
			(stagePlacement.cssWidth * dpr) / Math.max(1, progressiveBuffer.width)
		);
		const targetW = Math.max(64, Math.round(progressiveBuffer.width * ratioScale));
		const targetH = Math.max(64, Math.round(progressiveBuffer.height * ratioScale));

		if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
			canvasEl.width = targetW;
			canvasEl.height = targetH;
		}
		const ctx = canvasEl.getContext('2d', { alpha: false });
		if (!ctx) return;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bufferCanvas, 0, 0, targetW, targetH);
	}

	function startPlaybackLoop() {
		stopAnimationLoop();
		if (typeof requestAnimationFrame !== 'function') {
			if (progressiveBuffer) progressiveBuffer.finishAll();
			playbackProgress = 1;
			playbackPhase = 'finished';
			refreshBufferCanvas();
			presentStage();
			return;
		}

		const tickFrame = (nowMs: number) => {
			if (playbackPhase !== 'playing' || !progressiveBuffer) {
				rafHandle = null;
				lastFrameTimeMs = null;
				return;
			}

			if (typeof document !== 'undefined' && document.hidden) {
				stopAnimationLoop();
				pausedByVisibility = true;
				playbackPhase = 'paused';
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
			progressiveBuffer.advanceTo(nextProgress);
			refreshBufferCanvas();
			presentStage();

			if (nextProgress >= 1 || progressiveBuffer.isComplete()) {
				progressiveBuffer.finishAll();
				playbackProgress = 1;
				playbackPhase = 'finished';
				rafHandle = null;
				lastFrameTimeMs = null;
				refreshBufferCanvas();
				presentStage();
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
		if (viewportWidth <= 0 || viewportHeight <= 0) return;

		try {
			const model = currentModel;
			const scaleFactor = options.lightweightPreview ? 0.62 : 1.0;
			const bufW = Math.max(240, Math.round(model.state.artboardWidth * scaleFactor));
			const bufH = Math.max(160, Math.round(model.state.artboardHeight * scaleFactor));

			const nextBuf = new ProgressiveDripBuffer(model, bufW, bufH);
			if (token !== renderToken) return;

			progressiveBuffer = nextBuf;
			bufferState = { ...model.state };
			bufferIsLightweight = Boolean(options.lightweightPreview);
			pausedByVisibility = false;

			if (options.mode === 'reveal') {
				const startAt = options.preserveProgress ?? 0.015;
				playbackProgress = startAt;
				playbackPhase = 'playing';
				progressiveBuffer.advanceTo(startAt);
				refreshBufferCanvas();
				presentStage();
				startPlaybackLoop();
			} else {
				stopAnimationLoop();
				progressiveBuffer.finishAll();
				playbackProgress = 1;
				playbackPhase = 'finished';
				refreshBufferCanvas();
				presentStage();
			}
		} catch {
			showStatus('Used compact resolution to fit available browser memory.');
		}
	}

	function syncBrowserHistoryUrl(
		targetState: DripPaintingState,
		targetView: ViewState,
		overlay: 'painting' | 'article',
		mode: 'replace' | 'push' = 'replace'
	) {
		if (typeof window === 'undefined' || isRestoringHistory) return;
		try {
			const query = serializeStateQuery(targetState, {
				overlayView: overlay,
				viewState: targetView
			});
			const nextUrl = `${window.location.pathname}?${query}`;
			const currentUrl = `${window.location.pathname}${window.location.search}`;
			if (nextUrl === currentUrl) return;
			if (mode === 'push') {
				window.history.pushState(window.history.state, '', nextUrl);
			} else {
				window.history.replaceState(window.history.state, '', nextUrl);
			}
		} catch {
			// Ignore history API restrictions in sandboxed environments.
		}
	}

	function pushUndoSnapshot(prev: DripPaintingState, next: DripPaintingState) {
		if (statesEqual(prev, next)) return;
		undoStack = [...undoStack.slice(-(MAX_UNDO_HISTORY - 1)), prev];
	}

	function commitStateChange(
		nextRaw: DripPaintingState,
		options?: {
			recordUndo?: boolean;
			playReveal?: boolean;
			announce?: boolean;
			resetInspectCenterToFocal?: boolean;
			historyMode?: 'replace' | 'push' | 'none';
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
			viewState = normalizeStudioViewState({
				...viewState,
				inspectCenterX: m.focalPoint.x,
				inspectCenterY: m.focalPoint.y
			});
		}

		if (options?.historyMode !== 'none') {
			syncBrowserHistoryUrl(
				next,
				viewState,
				activeOverlay,
				options?.historyMode === 'push' ? 'push' : 'replace'
			);
		}

		const shouldPlay =
			Boolean(options?.playReveal) && !prefersReducedMotion && activeOverlay === 'painting';
		rebuildPainting({
			mode: shouldPlay ? 'reveal' : 'still',
			lightweightPreview: false
		});

		if (options?.announce !== false) {
			liveAnnouncement = describePaintingAccessible(next, m);
		}
	}

	function previewKnobChange(key: KnobKey | SecondaryKnobKey, nextValue: number) {
		bumpIdleActivity();
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
		bumpIdleActivity();
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
			liveAnnouncement = `Painting reveal duration set to ${next.paintingTime} seconds.`;
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

	function handleSelectStudy(studyId: StudyId) {
		bumpIdleActivity();
		if (studyId === studioState.study) return;
		const curatedSeed = CURATED_STUDY_SEEDS[studyId];
		commitStateChange(
			{
				...studioState,
				study: studyId,
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

	function handleApplyPreset(presetId: PresetId) {
		bumpIdleActivity();
		const next = applyPreset(studioState, presetId);
		const spec = PRESET_SPECS.find((p) => p.id === presetId);
		commitStateChange(next, {
			recordUndo: true,
			playReveal: false,
			announce: true
		});
		if (spec) {
			showStatus(`Applied preset "${spec.label}" on seed ${next.seed}.`);
		}
	}

	function handleNewPainting() {
		bumpIdleActivity();
		exportMenuOpen = false;
		stepCounter += 1;
		const nextSeed = createNextSeed(studioState.seed, stepCounter);
		const dims = chooseArtboardForViewport(viewportWidth, viewportHeight);
		if (viewState.mode === 'inspect') {
			viewState = normalizeStudioViewState({
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
		bumpIdleActivity();
		exportMenuOpen = false;
		if (viewState.mode === 'inspect') {
			viewState = normalizeStudioViewState({
				...viewState,
				mode: previousWholeMode
			});
			syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		}
		rebuildPainting({
			mode: 'reveal',
			lightweightPreview: false
		});
	}

	function handlePauseResume() {
		bumpIdleActivity();
		pausedByVisibility = false;
		if (playbackPhase === 'playing') {
			stopAnimationLoop();
			playbackPhase = 'paused';
			presentStage();
		} else if (playbackPhase === 'paused') {
			if (prefersReducedMotion) {
				handleFinishNow();
			} else {
				playbackPhase = 'playing';
				startPlaybackLoop();
			}
		}
	}

	function handleFinishNow() {
		bumpIdleActivity();
		pausedByVisibility = false;
		stopAnimationLoop();
		if (progressiveBuffer) {
			progressiveBuffer.finishAll();
			refreshBufferCanvas();
		} else {
			rebuildPainting({ mode: 'still', lightweightPreview: false });
			return;
		}
		playbackProgress = 1;
		playbackPhase = 'finished';
		presentStage();
	}

	function setViewMode(nextMode: ViewMode, focusFocal = false) {
		bumpIdleActivity();
		exportMenuOpen = false;

		if (nextMode === 'inspect') {
			if (viewState.mode !== 'inspect') {
				previousWholeMode = viewState.mode;
			}
			viewState = normalizeStudioViewState({
				...viewState,
				mode: 'inspect',
				inspectCenterX: focusFocal ? currentModel.focalPoint.x : viewState.inspectCenterX,
				inspectCenterY: focusFocal ? currentModel.focalPoint.y : viewState.inspectCenterY
			});
		} else {
			previousWholeMode = nextMode;
			viewState = normalizeStudioViewState({
				...viewState,
				mode: nextMode
			});
		}

		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage();
	}

	function handleOneActionInspectToggle() {
		if (viewState.mode === 'inspect') {
			setViewMode(previousWholeMode, false);
		} else {
			setViewMode('inspect', true);
		}
	}

	function recenterInspect() {
		bumpIdleActivity();
		if (viewState.mode !== 'inspect') return;
		viewState = normalizeStudioViewState({
			...viewState,
			inspectZoom: DEFAULT_VIEW_STATE.inspectZoom,
			inspectCenterX: currentModel.focalPoint.x,
			inspectCenterY: currentModel.focalPoint.y
		});
		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage();
	}

	function panInspectByFraction(dxFrac: number, dyFrac: number) {
		bumpIdleActivity();
		if (viewState.mode !== 'inspect') return;
		const stepScale = 1 / viewState.inspectZoom;
		viewState = normalizeStudioViewState({
			...viewState,
			inspectCenterX: viewState.inspectCenterX + dxFrac * stepScale,
			inspectCenterY: viewState.inspectCenterY + dyFrac * stepScale
		});
		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage();
	}

	function adjustInspectZoom(delta: number) {
		bumpIdleActivity();
		if (viewState.mode !== 'inspect') return;
		viewState = normalizeStudioViewState({
			...viewState,
			inspectZoom: viewState.inspectZoom + delta
		});
		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage();
	}

	function handleStagePointerDown(event: PointerEvent) {
		bumpIdleActivity();
		if (viewState.mode !== 'inspect') return;
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		const el = event.currentTarget as HTMLElement;
		try {
			el.setPointerCapture(event.pointerId);
		} catch {
			// Ignore capture errors on synthetic or non-active pointers.
		}
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
			{
				artboardWidth: studioState.artboardWidth,
				artboardHeight: studioState.artboardHeight
			},
			viewState.inspectZoom,
			panStartCenterX,
			panStartCenterY,
			viewportWidth,
			viewportHeight
		);
		const dxPx = event.clientX - panStartX;
		const dyPx = event.clientY - panStartY;
		const nextCenterX =
			panStartCenterX -
			(dxPx / Math.max(1, viewportWidth)) * (crop.width / studioState.artboardWidth);
		const nextCenterY =
			panStartCenterY -
			(dyPx / Math.max(1, viewportHeight)) * (crop.height / studioState.artboardHeight);

		viewState = normalizeStudioViewState({
			...viewState,
			inspectCenterX: nextCenterX,
			inspectCenterY: nextCenterY
		});
		presentStage();
	}

	function handleStagePointerUp(event: PointerEvent) {
		if (!isPanningInspect || panPointerId !== event.pointerId) return;
		const el = event.currentTarget as HTMLElement;
		try {
			if (el.hasPointerCapture(event.pointerId)) {
				el.releasePointerCapture(event.pointerId);
			}
		} catch {
			// Ignore capture release errors on synthetic or cancelled pointers.
		}
		isPanningInspect = false;
		panPointerId = null;
		viewState = normalizeStudioViewState(viewState);
		syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		presentStage();
	}

	function handleStageWheel(event: WheelEvent) {
		if (viewState.mode !== 'inspect') return;
		event.preventDefault();
		const delta = event.deltaY < 0 ? 0.3 : -0.3;
		adjustInspectZoom(delta);
	}

	function handleApplySeedForm(event: SubmitEvent) {
		event.preventDefault();
		bumpIdleActivity();
		const nextSeed = normalizeSeed(seedInputText, studioState.seed);
		if (nextSeed === studioState.seed) {
			seedInputText = String(studioState.seed);
			return;
		}
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
		bumpIdleActivity();
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
		bumpIdleActivity();
		clearStateFromStorage();
		const dims = chooseArtboardForViewport(viewportWidth, viewportHeight);
		viewState = normalizeStudioViewState(DEFAULT_VIEW_STATE);
		previousWholeMode = 'fill';
		const resetTarget = normalizeState({
			...DEFAULT_DRIP_STATE,
			artboardWidth:
				dims.artboardWidth === DEFAULT_DRIP_STATE.artboardWidth
					? DEFAULT_DRIP_STATE.artboardWidth
					: dims.artboardWidth,
			artboardHeight:
				dims.artboardHeight === DEFAULT_DRIP_STATE.artboardHeight
					? DEFAULT_DRIP_STATE.artboardHeight
					: dims.artboardHeight
		});
		commitStateChange(resetTarget, {
			recordUndo: true,
			playReveal: false,
			announce: true,
			resetInspectCenterToFocal: true
		});
		showStatus('Reset studio to the default Pending File drip composition.');
	}

	async function handleCopyLink() {
		bumpIdleActivity();
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

	function updateExportPopoverPosition() {
		if (typeof window === 'undefined' || !exportMenuOpen || !exportBtnEl) return;
		const rect = exportBtnEl.getBoundingClientRect();
		const vh = Math.max(240, window.innerHeight || viewportHeight);
		const rawTop = Math.ceil(rect.bottom + 6);
		const clampedTop = Math.max(8, Math.min(rawTop, Math.max(8, vh - 120)));
		exportPopoverTopPx = clampedTop;
		exportPopoverMaxHeightPx = Math.max(112, vh - clampedTop - 8);
	}

	$effect(() => {
		if (!exportMenuOpen || activeOverlay !== 'painting') return;
		const _deps = [
			viewportWidth,
			viewportHeight,
			introDismissed,
			trayOpen,
			viewState.mode,
			playbackPhase,
			statusNotice
		];
		void _deps;
		void tick().then(() => {
			updateExportPopoverPosition();
		});
	});

	async function handleExport(longSidePx: ExportResolution) {
		bumpIdleActivity();
		if (exportingBusy) return;
		exportingBusy = true;
		await new Promise((resolve) => setTimeout(resolve, 16));
		try {
			const result = await exportWholePainting(studioState, longSidePx, {
				model: currentModel
			});
			triggerBlobDownload(result.blob, result.filename);
			exportMenuOpen = false;
			showStatus(result.statusMessage, result.fallbackApplied ? 6500 : 4200);
			await tick();
			if (activeOverlay === 'painting') {
				exportBtnEl?.focus({ preventScroll: true });
			}
		} catch {
			showStatus('Unable to export PNG at that size on this device. Try the 2048 px option.');
		} finally {
			exportingBusy = false;
		}
	}

	async function handleToggleFullscreen() {
		bumpIdleActivity();
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
		bumpIdleActivity();
		exportMenuOpen = false;
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
		bumpIdleActivity();
		trayOpen = false;
		await tick();
		controlsBtnEl?.focus();
	}

	async function openArticleView() {
		if (isRestoringHistory) return;
		const navToken = ++historyNavToken;
		bumpIdleActivity();
		exportMenuOpen = false;
		if (resizeTimer) {
			clearTimeout(resizeTimer);
			resizeTimer = null;
		}
		if (playbackPhase === 'playing' || pausedByVisibility) {
			wasPlayingBeforeArticle = true;
			pausedByVisibility = false;
			stopAnimationLoop();
			playbackPhase = 'paused';
		}
		await ensureArticleLoaded();
		if (navToken !== historyNavToken || isRestoringHistory) return;
		activeOverlay = 'article';
		syncBrowserHistoryUrl(studioState, viewState, 'article', 'push');
		await tick();
		if (navToken !== historyNavToken || isRestoringHistory) return;
		window.scrollTo(0, 0);
		returnToPaintingBtnEl?.focus({ preventScroll: true });
	}

	async function closeArticleView() {
		if (isRestoringHistory) return;
		const navToken = ++historyNavToken;
		activeOverlay = 'painting';
		syncBrowserHistoryUrl(studioState, viewState, 'painting', 'push');
		await tick();
		if (navToken !== historyNavToken || isRestoringHistory) return;
		window.scrollTo(0, 0);
		syncStageViewportFromDom();
		const bufferMatches = Boolean(
			progressiveBuffer &&
			bufferCanvas &&
			!bufferIsLightweight &&
			bufferState &&
			statesEqual(bufferState, studioState)
		);
		if (!bufferMatches) {
			wasPlayingBeforeArticle = false;
			pausedByVisibility = false;
			rebuildPainting({
				mode: 'still',
				lightweightPreview: false
			});
		} else if (prefersReducedMotion && playbackPhase !== 'finished') {
			wasPlayingBeforeArticle = false;
			pausedByVisibility = false;
			handleFinishNow();
		} else if (wasPlayingBeforeArticle && playbackPhase === 'paused' && !prefersReducedMotion) {
			wasPlayingBeforeArticle = false;
			if (typeof document !== 'undefined' && document.hidden) {
				pausedByVisibility = true;
				presentStage();
			} else {
				pausedByVisibility = false;
				playbackPhase = 'playing';
				startPlaybackLoop();
			}
		} else {
			presentStage();
		}
		readArticleBtnEl?.focus({ preventScroll: true });
	}

	async function handleArticleProseClick(event: MouseEvent) {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}
		const target = (event.target as HTMLElement | null)?.closest('a');
		if (!target) return;
		const href = target.getAttribute('href') ?? '';
		if (!href.startsWith('/tools/drip-painting-studio?')) return;

		event.preventDefault();
		if (isRestoringHistory) return;
		const navToken = ++historyNavToken;
		const query = href.slice(href.indexOf('?') + 1);
		const parsed = deserializeStateParams(query);
		wasPlayingBeforeArticle = false;
		activeOverlay = 'painting';
		if (parsed.hasExplicitView) {
			viewState = normalizeStudioViewState(parsed.viewState);
			if (viewState.mode === 'fit' || viewState.mode === 'fill') {
				previousWholeMode = viewState.mode;
			}
		} else {
			viewState = normalizeStudioViewState({ ...viewState, mode: previousWholeMode });
		}
		await tick();
		if (navToken !== historyNavToken || isRestoringHistory) return;
		window.scrollTo(0, 0);
		syncStageViewportFromDom();
		commitStateChange(parsed.state, {
			recordUndo: true,
			playReveal: false,
			announce: true,
			historyMode: 'push'
		});
		showStatus(`Loaded example settings (seed ${parsed.state.seed}).`);
		readArticleBtnEl?.focus({ preventScroll: true });
	}

	function applyExperimentStep(step: 'thin' | 'heavy' | 'buried') {
		bumpIdleActivity();
		const targetBase =
			step === 'thin'
				? EXPERIMENT_CONFIG.thin
				: step === 'heavy'
					? EXPERIMENT_CONFIG.heavy
					: EXPERIMENT_CONFIG.buried;
		const next = normalizeState({
			...targetBase,
			paintingTime: studioState.paintingTime,
			artboardWidth: studioState.artboardWidth,
			artboardHeight: studioState.artboardHeight
		});
		commitStateChange(next, {
			recordUndo: true,
			playReveal: false,
			announce: true,
			resetInspectCenterToFocal: true
		});
		if (step === 'thin') {
			showStatus('Experiment step 1: Thin flow (20%) on Pending File seed 729104.');
		} else if (step === 'heavy') {
			showStatus('Experiment step 2: Heavy flow (80%) along identical movement paths.');
		} else {
			showStatus(
				'Experiment step 3: 36 passes across 6 layers burying lower threads under ridges.'
			);
		}
	}

	function formatKnobDisplay(key: KnobKey | SecondaryKnobKey): string {
		const val = studioState[key];
		if (key === 'paintFlow' || key === 'sweepWidth' || key === 'paintTexture') return `${val}%`;
		if (key === 'paintingTime') return `${val} s`;
		if (key === 'passes') return `${val} passes`;
		return `${val} layers`;
	}

	function handleDocumentPointerDown(event: PointerEvent) {
		bumpIdleActivity();
		if (!exportMenuOpen) return;
		const target = event.target as HTMLElement | null;
		if (!target || !target.closest('.dp-popover-anchor')) {
			exportMenuOpen = false;
		}
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (
			event.defaultPrevented ||
			(typeof document !== 'undefined' && document.querySelector('dialog[open]') !== null)
		) {
			return;
		}
		bumpIdleActivity();
		if (event.key === 'Escape') {
			if (exportMenuOpen) {
				exportMenuOpen = false;
				exportBtnEl?.focus();
				event.stopPropagation();
				return;
			}
			if (typeof document !== 'undefined' && document.fullscreenElement) {
				isFullscreen = false;
				void (async () => {
					try {
						if (typeof document.exitFullscreen === 'function') {
							await document.exitFullscreen();
						}
						isFullscreen = false;
					} catch {
						isFullscreen = Boolean(document.fullscreenElement);
					}
				})();
				event.stopPropagation();
				return;
			}
			if (activeOverlay === 'article') {
				void closeArticleView();
				event.stopPropagation();
				return;
			}
			if (trayOpen) {
				void closeControlsTray();
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

	function syncStageViewportFromDom() {
		const rect = stageEl?.getBoundingClientRect();
		if (!rect || rect.width < 32 || rect.height < 32) return;
		const width = Math.round(rect.width);
		const height = Math.round(rect.height);
		if (Math.abs(width - viewportWidth) >= 2 || Math.abs(height - viewportHeight) >= 2) {
			viewportWidth = width;
			viewportHeight = height;
		}
	}

	function handleViewportMeasurement(width: number, height: number) {
		if (activeOverlay !== 'painting') return;
		if (width < 32 || height < 32) return;
		const changed = Math.abs(width - viewportWidth) >= 2 || Math.abs(height - viewportHeight) >= 2;
		if (!changed) return;

		viewportWidth = width;
		viewportHeight = height;

		if (!mountedReady) return;
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (activeOverlay === 'painting') {
				presentStage();
			}
		}, 60);
	}

	async function handlePopState() {
		if (typeof window === 'undefined') return;
		const navToken = ++historyNavToken;
		const prevOverlay = activeOverlay;

		exportMenuOpen = false;
		shareFallbackUrl = null;
		isPanningInspect = false;
		panPointerId = null;
		bumpIdleActivity();

		const parsed = deserializeStateParams(window.location.search, initialMountState);
		const nextState = parsed.state;
		const nextOverlay = parsed.initialOverlay;
		const targetModel = buildPaintingModel(nextState);
		const nextView = parsed.hasExplicitView
			? normalizeStudioViewState(parsed.viewState)
			: normalizeStudioViewState({
					...DEFAULT_VIEW_STATE,
					inspectCenterX: targetModel.focalPoint.x,
					inspectCenterY: targetModel.focalPoint.y
				});

		isRestoringHistory = true;
		try {
			if (nextOverlay === 'article') {
				if (resizeTimer) {
					clearTimeout(resizeTimer);
					resizeTimer = null;
				}
				if (playbackPhase === 'playing' || pausedByVisibility) {
					stopAnimationLoop();
					wasPlayingBeforeArticle = true;
					pausedByVisibility = false;
					playbackPhase = 'paused';
				}
				await ensureArticleLoaded();
				if (navToken !== historyNavToken) return;

				studioState = nextState;
				committedState = nextState;
				seedInputText = String(nextState.seed);
				saveStateToStorage(nextState);
				viewState = nextView;
				if (nextView.mode === 'fit' || nextView.mode === 'fill') {
					previousWholeMode = nextView.mode;
				}
				activeOverlay = 'article';

				await tick();
				if (navToken !== historyNavToken) return;
				window.scrollTo(0, 0);
				liveAnnouncement = describePaintingAccessible(nextState, targetModel);
				if (prevOverlay !== 'article') {
					returnToPaintingBtnEl?.focus({ preventScroll: true });
				}
				return;
			}

			studioState = nextState;
			committedState = nextState;
			seedInputText = String(nextState.seed);
			saveStateToStorage(nextState);
			viewState = nextView;
			if (nextView.mode === 'fit' || nextView.mode === 'fill') {
				previousWholeMode = nextView.mode;
			}
			activeOverlay = 'painting';

			await tick();
			if (navToken !== historyNavToken) return;

			window.scrollTo(0, 0);
			syncStageViewportFromDom();

			const bufferMatches = Boolean(
				progressiveBuffer &&
				bufferCanvas &&
				!bufferIsLightweight &&
				bufferState &&
				statesEqual(bufferState, nextState)
			);

			if (!bufferMatches) {
				wasPlayingBeforeArticle = false;
				pausedByVisibility = false;
				rebuildPainting({
					mode: 'still',
					lightweightPreview: false
				});
			} else if (prefersReducedMotion && playbackPhase !== 'finished') {
				wasPlayingBeforeArticle = false;
				pausedByVisibility = false;
				handleFinishNow();
			} else if (wasPlayingBeforeArticle && playbackPhase === 'paused' && !prefersReducedMotion) {
				wasPlayingBeforeArticle = false;
				if (typeof document !== 'undefined' && document.hidden) {
					pausedByVisibility = true;
					presentStage();
				} else {
					pausedByVisibility = false;
					playbackPhase = 'playing';
					startPlaybackLoop();
				}
			} else {
				presentStage();
			}

			liveAnnouncement = describePaintingAccessible(nextState, targetModel);
			if (prevOverlay === 'article') {
				readArticleBtnEl?.focus({ preventScroll: true });
			}
		} finally {
			if (navToken === historyNavToken) {
				isRestoringHistory = false;
			}
		}
	}

	$effect(() => {
		const el = stageEl;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			handleViewportMeasurement(
				Math.round(entry.contentRect.width),
				Math.round(entry.contentRect.height)
			);
		});
		observer.observe(el);
		return () => {
			observer.disconnect();
		};
	});

	onMount(() => {
		const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = reducedMedia.matches;
		const onMotionChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
			if (e.matches && (playbackPhase === 'playing' || playbackPhase === 'paused')) {
				wasPlayingBeforeArticle = false;
				pausedByVisibility = false;
				handleFinishNow();
			}
		};
		reducedMedia.addEventListener('change', onMotionChange);

		// Open shallow tray by default on wide screens; keep closed initially on phones so canvas leads.
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
		let initialState: DripPaintingState;
		if (urlParsed.hasExplicitState) {
			initialState = urlParsed.state;
		} else {
			const stored = loadStateFromStorage();
			if (stored) {
				initialState = stored;
			} else {
				const artboard = chooseArtboardForViewport(viewportWidth, viewportHeight);
				initialState = {
					...DEFAULT_DRIP_STATE,
					artboardWidth: artboard.artboardWidth,
					artboardHeight: artboard.artboardHeight
				};
			}
		}

		const initialModel = buildPaintingModel(initialState);
		if (urlParsed.hasExplicitView) {
			viewState = normalizeStudioViewState(urlParsed.viewState);
			if (viewState.mode === 'fit') previousWholeMode = 'fit';
		} else {
			viewState = normalizeStudioViewState({
				...DEFAULT_VIEW_STATE,
				inspectCenterX: initialModel.focalPoint.x,
				inspectCenterY: initialModel.focalPoint.y
			});
		}

		activeOverlay = urlParsed.initialOverlay;
		if (activeOverlay === 'article') {
			void ensureArticleLoaded();
		}

		initialMountState = { ...initialState };
		studioState = initialState;
		committedState = initialState;
		seedInputText = String(initialState.seed);
		liveAnnouncement = describePaintingAccessible(initialState, initialModel);
		syncBrowserHistoryUrl(initialState, viewState, activeOverlay, 'replace');
		mountedReady = true;

		const playInitialSequence =
			!prefersReducedMotion && activeOverlay === 'painting' && viewState.mode !== 'inspect';
		rebuildPainting({
			mode: playInitialSequence ? 'reveal' : 'still',
			lightweightPreview: false
		});

		const onFullscreenChange = () => {
			isFullscreen = Boolean(document.fullscreenElement);
		};
		document.addEventListener('fullscreenchange', onFullscreenChange);

		const onVisibilityChange = () => {
			if (document.hidden) {
				if (playbackPhase === 'playing') {
					stopAnimationLoop();
					pausedByVisibility = true;
					playbackPhase = 'paused';
				}
			} else if (pausedByVisibility && playbackPhase === 'paused' && activeOverlay === 'painting') {
				pausedByVisibility = false;
				if (!prefersReducedMotion) {
					playbackPhase = 'playing';
					startPlaybackLoop();
				} else {
					handleFinishNow();
				}
			} else if (!document.hidden && prefersReducedMotion && playbackPhase !== 'finished') {
				pausedByVisibility = false;
				wasPlayingBeforeArticle = false;
				handleFinishNow();
			}
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		document.addEventListener('pointerdown', handleDocumentPointerDown);
		const onPopState = () => {
			void handlePopState();
		};
		window.addEventListener('popstate', onPopState);
		window.addEventListener('resize', updateExportPopoverPosition);

		bumpIdleActivity();

		return () => {
			stopAnimationLoop();
			if (statusTimer) clearTimeout(statusTimer);
			if (resizeTimer) clearTimeout(resizeTimer);
			if (idleTimer) clearTimeout(idleTimer);
			reducedMedia.removeEventListener('change', onMotionChange);
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			document.removeEventListener('pointerdown', handleDocumentPointerDown);
			window.removeEventListener('popstate', onPopState);
			window.removeEventListener('resize', updateExportPopoverPosition);
		};
	});
</script>

<svelte:window onkeydown={handleGlobalKeydown} onpointermove={bumpIdleActivity} />

<div class="dp-root" class:is-article={activeOverlay === 'article'} bind:this={rootEl}>
	<p id="drip-canvas-description" class="dp-sr-only">{committedDescription}</p>
	<div class="dp-sr-only" aria-live="polite">{liveAnnouncement}</div>

	{#if activeOverlay === 'painting'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="dp-stage"
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
				class="dp-canvas"
				data-testid="drip-canvas"
				data-view-mode={viewState.mode}
				data-artboard={`${studioState.artboardWidth}x${studioState.artboardHeight}`}
				data-playback={playbackPhase}
				style={`width:${stagePlacement.cssWidth}px;height:${stagePlacement.cssHeight}px;transform:translate(${stagePlacement.offsetX}px,${stagePlacement.offsetY}px);`}
				aria-label={`${activeStudySpec.label} non-figurative drip painting`}
				aria-describedby="drip-canvas-description"
			>
				{committedDescription}
			</canvas>
		</div>

		<div
			class="dp-hud-shell"
			class:has-tray={trayOpen}
			class:is-inspect={viewState.mode === 'inspect'}
		>
			<header
				class="dp-top-stack"
				class:is-idle={isIdleDimmed}
				class:has-export-open={exportMenuOpen}
				bind:this={topStackEl}
				onfocusin={bumpIdleActivity}
				onscroll={updateExportPopoverPosition}
			>
				<div class="dp-topbar">
					<h1 class="dp-sr-only">
						Abstract Expressionist Drip Painting: Corruption in India — Interactive Painting Studio
					</h1>

					{#if !introDismissed}
						<div class="dp-intro-pill">
							<p class="dp-intro-text">
								Hold the path steady. Change the flow, passes, sweep, and layers—and watch single
								gestures tangle into an opaque web.
							</p>
							<button
								type="button"
								class="dp-intro-dismiss"
								aria-label="Dismiss intro note"
								onclick={() => {
									introDismissed = true;
								}}
							>
								×
							</button>
						</div>
					{/if}

					<div class="dp-toolbar-cluster">
						<div
							class="dp-toolbar"
							role="toolbar"
							aria-label="Painting studio controls"
							onscroll={updateExportPopoverPosition}
						>
							<button type="button" class="dp-btn" onclick={handleNewPainting}>
								New painting
							</button>

							<button type="button" class="dp-btn" onclick={handleReplay}>Replay</button>

							{#if playbackPhase === 'playing' || playbackPhase === 'paused'}
								<button type="button" class="dp-btn dp-btn-playback" onclick={handlePauseResume}>
									{playbackPhase === 'playing' ? 'Pause' : 'Resume'}
								</button>
								<button type="button" class="dp-btn dp-btn-playback" onclick={handleFinishNow}>
									Finish now
								</button>
							{/if}

							<button
								bind:this={controlsBtnEl}
								type="button"
								class="dp-btn"
								aria-expanded={trayOpen}
								aria-controls="drip-controls-tray"
								onclick={toggleControlsTray}
							>
								Controls
							</button>

							<button
								type="button"
								class="dp-btn"
								class:dp-btn-active={viewState.mode === 'inspect'}
								aria-pressed={viewState.mode === 'inspect'}
								onclick={handleOneActionInspectToggle}
							>
								{viewState.mode === 'inspect' ? 'Whole painting' : 'Inspect surface'}
							</button>

							<div class="dp-popover-anchor">
								<button
									bind:this={exportBtnEl}
									type="button"
									class="dp-btn"
									aria-expanded={exportMenuOpen}
									aria-haspopup="true"
									onclick={() => {
										bumpIdleActivity();
										exportMenuOpen = !exportMenuOpen;
										if (exportMenuOpen) {
											updateExportPopoverPosition();
										}
									}}
								>
									Save image
								</button>

								{#if exportMenuOpen}
									<div
										class="dp-popover"
										role="region"
										aria-label="Save finished painting options"
										style={`--dp-popover-top:${exportPopoverTopPx}px;--dp-popover-max-height:${exportPopoverMaxHeightPx}px;`}
									>
										<p class="dp-popover-note">
											Exports the complete finished painting alone on its woven cotton-duck ground —
											no controls, captions, or reticles — even during playback or inspection.
										</p>
										<button
											type="button"
											class="dp-btn dp-popover-option"
											disabled={exportingBusy}
											onclick={() => handleExport(2048)}
										>
											<span>2048 px PNG</span>
											<span>Large · whole painting</span>
										</button>
										<button
											type="button"
											class="dp-btn dp-popover-option"
											disabled={exportingBusy}
											onclick={() => handleExport(4096)}
										>
											<span>4096 px PNG</span>
											<span>Print · whole painting</span>
										</button>
									</div>
								{/if}
							</div>

							<button
								type="button"
								class="dp-btn"
								aria-pressed={isFullscreen}
								onclick={handleToggleFullscreen}
							>
								{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
							</button>
						</div>

						<button
							bind:this={readArticleBtnEl}
							type="button"
							class="dp-btn dp-btn-secondary"
							onclick={openArticleView}
						>
							Read the essay
						</button>
					</div>
				</div>

				{#if viewState.mode === 'inspect' || statusNotice}
					<div class="dp-subhud-row">
						{#if viewState.mode === 'inspect'}
							<div class="dp-inspect-hud" role="region" aria-label="Surface inspection controls">
								<span class="dp-inspect-copy">
									Inspecting painted buffer close up (no marks altered). Drag or use arrow keys to
									pan.
								</span>
								<div class="dp-inspect-controls">
									<button
										type="button"
										class="dp-btn dp-btn-icon"
										aria-label="Zoom out close-up"
										disabled={viewState.inspectZoom <= 2.0}
										onclick={() => adjustInspectZoom(-0.4)}
									>
										−
									</button>
									<span class="dp-zoom-readout">{viewState.inspectZoom.toFixed(1)}×</span>
									<button
										type="button"
										class="dp-btn dp-btn-icon"
										aria-label="Zoom in close-up"
										disabled={viewState.inspectZoom >= 5.0}
										onclick={() => adjustInspectZoom(0.4)}
									>
										+
									</button>
									<button
										type="button"
										class="dp-btn dp-btn-icon"
										aria-label="Pan inspection left"
										onclick={() => panInspectByFraction(-0.18, 0)}
									>
										←
									</button>
									<button
										type="button"
										class="dp-btn dp-btn-icon"
										aria-label="Pan inspection up"
										onclick={() => panInspectByFraction(0, -0.18)}
									>
										↑
									</button>
									<button
										type="button"
										class="dp-btn dp-btn-icon"
										aria-label="Pan inspection down"
										onclick={() => panInspectByFraction(0, 0.18)}
									>
										↓
									</button>
									<button
										type="button"
										class="dp-btn dp-btn-icon"
										aria-label="Pan inspection right"
										onclick={() => panInspectByFraction(0.18, 0)}
									>
										→
									</button>
									<button type="button" class="dp-btn dp-btn-compact" onclick={recenterInspect}>
										Recenter
									</button>
									<button
										type="button"
										class="dp-btn dp-btn-compact dp-btn-active"
										onclick={() => setViewMode(previousWholeMode, false)}
									>
										Return to whole painting
									</button>
								</div>
							</div>
						{/if}

						{#if statusNotice}
							<div class="dp-status-banner" role="status">{statusNotice}</div>
						{/if}
					</div>
				{/if}
			</header>

			{#if trayOpen}
				<section id="drip-controls-tray" class="dp-tray" aria-label="Drip painting studio controls">
					<div class="dp-tray-header">
						<h2 class="dp-tray-title">Studio Controls</h2>

						<div class="dp-tray-header-actions">
							<span class="dp-meta-badge">
								{activeStudySpec.shortLabel} · {studioState.passes} passes · Seed {studioState.seed}
							</span>
							<button
								bind:this={closeTrayBtnEl}
								type="button"
								class="dp-btn dp-btn-compact"
								onclick={closeControlsTray}
							>
								Close controls
							</button>
						</div>
					</div>

					<div class="dp-tray-scroll">
						<div class="dp-knobs-grid">
							{#each KNOB_SPECS as spec (spec.key)}
								<RotarySliderKnob
									id={`dp-knob-${spec.key}`}
									label={spec.label}
									ariaLabel={spec.label}
									value={studioState[spec.key]}
									min={spec.min}
									max={spec.max}
									step={spec.step}
									displayValue={formatKnobDisplay(spec.key)}
									ariaValueText={formatKnobDisplay(spec.key)}
									description={spec.description}
									minLabel={spec.minLabel}
									maxLabel={spec.maxLabel}
									onPreview={(val) => previewKnobChange(spec.key, val)}
									onCommit={(val) => commitKnobChange(spec.key, val)}
								/>
							{/each}
						</div>

						<details class="dp-details">
							<summary class="dp-summary">More options</summary>
							<div class="dp-details-body">
								<div class="dp-subsection">
									<span class="dp-field-label">Study</span>
									<div class="dp-inline-actions" role="group" aria-label="Study">
										{#each STUDY_LIST as study (study.id)}
											<button
												type="button"
												class="dp-btn dp-btn-compact"
												aria-pressed={studioState.study === study.id}
												title={study.description}
												onclick={() => handleSelectStudy(study.id)}
											>
												{study.label}
											</button>
										{/each}
									</div>
									<p class="dp-caption">
										<strong>{activeStudySpec.label}:</strong>
										{activeStudySpec.description}
									</p>
								</div>

								<div class="dp-subsection">
									<span class="dp-field-label">Presets (preserves current seed)</span>
									<div class="dp-inline-actions" role="group" aria-label="Presets">
										{#each PRESET_SPECS as preset (preset.id)}
											<button
												type="button"
												class="dp-btn dp-btn-compact"
												aria-pressed={activePresetId === preset.id}
												title={preset.description}
												onclick={() => handleApplyPreset(preset.id)}
											>
												{preset.label}
											</button>
										{/each}
									</div>
									{#if activePresetSpec}
										<p class="dp-caption">
											<strong>{activePresetSpec.label}:</strong>
											{activePresetSpec.description}
										</p>
									{:else}
										<p class="dp-caption">
											Each preset loads a distinct flow, pass, sweep, and layer balance without
											rerolling seed {studioState.seed}.
										</p>
									{/if}
								</div>

								<div class="dp-subsection">
									<span class="dp-field-label">Pending File flow experiment (seed 729104)</span>
									<div
										class="dp-inline-actions"
										role="group"
										aria-label="Pending File visual experiment"
									>
										<button
											type="button"
											class="dp-btn dp-btn-compact"
											onclick={() => applyExperimentStep('thin')}
										>
											1. Thin flow (20%)
										</button>
										<button
											type="button"
											class="dp-btn dp-btn-compact"
											onclick={() => applyExperimentStep('heavy')}
										>
											2. Heavy flow (80%)
										</button>
										<button
											type="button"
											class="dp-btn dp-btn-compact"
											onclick={() => applyExperimentStep('buried')}
										>
											3. Buried layers (36 passes, 6 layers)
										</button>
									</div>
									<p class="dp-caption">
										Hold the path steady at 16 passes and 4 layers while stepping flow from 20% to
										80%, then expand to 36 passes and 6 layers to watch opaque whitewash ridges bury
										earlier threads.
									</p>
								</div>

								<div class="dp-secondary-knobs">
									{#each SECONDARY_KNOB_SPECS as secSpec (secSpec.key)}
										<RotarySliderKnob
											id={`dp-knob-${secSpec.key}`}
											label={secSpec.label}
											ariaLabel={secSpec.label}
											value={studioState[secSpec.key]}
											min={secSpec.min}
											max={secSpec.max}
											step={secSpec.step}
											displayValue={formatKnobDisplay(secSpec.key)}
											ariaValueText={formatKnobDisplay(secSpec.key)}
											description={secSpec.description}
											minLabel={secSpec.minLabel}
											maxLabel={secSpec.maxLabel}
											onPreview={(val) => previewKnobChange(secSpec.key, val)}
											onCommit={(val) => commitKnobChange(secSpec.key, val)}
										/>
									{/each}
								</div>

								<div class="dp-more-grid">
									<div class="dp-field-group">
										<label class="dp-field-label" for="dp-seed-input">Seed</label>
										<form class="dp-seed-form" onsubmit={handleApplySeedForm}>
											<input
												id="dp-seed-input"
												class="dp-seed-input"
												type="text"
												inputmode="numeric"
												bind:value={seedInputText}
												aria-label="Painting seed"
											/>
											<button type="submit" class="dp-btn dp-btn-compact">Apply</button>
										</form>
									</div>

									<div class="dp-field-group">
										<span class="dp-field-label">Canvas framing</span>
										<div class="dp-inline-actions" role="group" aria-label="Canvas framing">
											<button
												type="button"
												class="dp-btn dp-btn-compact"
												aria-pressed={viewState.mode === 'fill'}
												onclick={() => setViewMode('fill', false)}
											>
												Fill screen
											</button>
											<button
												type="button"
												class="dp-btn dp-btn-compact"
												aria-pressed={viewState.mode === 'fit'}
												onclick={() => setViewMode('fit', false)}
											>
												Fit painting
											</button>
										</div>
									</div>

									<div class="dp-field-group">
										<span class="dp-field-label">Session &amp; sharing</span>
										<div class="dp-inline-actions">
											<button
												type="button"
												class="dp-btn dp-btn-compact"
												disabled={undoStack.length === 0}
												onclick={handleUndo}
											>
												Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
											</button>
											<button type="button" class="dp-btn dp-btn-compact" onclick={handleCopyLink}>
												Copy link
											</button>
											<button
												type="button"
												class="dp-btn dp-btn-compact"
												onclick={handleResetSettings}
											>
												Reset settings
											</button>
											<a href={resolve('/blog/visualizations')} class="dp-btn dp-btn-compact">
												All visualizations
											</a>
											<button
												type="button"
												class="dp-btn dp-btn-compact"
												data-privacy-settings
												onclick={openPrivacySettings}
											>
												Privacy &amp; cookies
											</button>
										</div>
									</div>
								</div>

								{#if shareFallbackUrl}
									<div class="dp-field-group">
										<label class="dp-field-label" for="dp-share-url">Copyable painting URL</label>
										<input
											id="dp-share-url"
											class="dp-share-input"
											type="text"
											readonly
											value={shareFallbackUrl}
											onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
										/>
									</div>
								{/if}

								<p class="dp-fineprint">
									Procedural enamel-on-cloth simulation running locally in your browser.
									Non-figurative studies explore gesture, chance, and layer accumulation — not
									empirical data or statistical scores.
								</p>
							</div>
						</details>
					</div>
				</section>
			{/if}
		</div>
	{:else}
		<div
			class="dp-article-overlay"
			role="region"
			aria-label="Accompanying essay: Abstract Expressionist Drip Painting: Corruption in India — Gesture, Chance, and Control"
		>
			<div class="dp-article-topbar">
				<button
					bind:this={returnToPaintingBtnEl}
					type="button"
					class="dp-btn dp-btn-active"
					onclick={closeArticleView}
				>
					<span aria-hidden="true">←</span> Return to painting
				</button>
				<span class="dp-article-meta">
					Painting preserved · {activeStudySpec.shortLabel} · Seed {studioState.seed}
				</span>
			</div>

			<article class="dp-article-container">
				<p class="dp-article-kicker">Interactive Essay · Visualizations</p>
				<h1 class="dp-article-h1">
					Abstract Expressionist Drip Painting: Corruption in India — Gesture, Chance, and Control
				</h1>
				<p class="dp-article-byline">By Suvro Ghosh</p>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="dp-article-prose" onclick={handleArticleProseClick}>
					{#if ArticleContent}
						<ArticleContent />
					{:else if articleMissing}
						<div class="dp-article-fallback">
							<p>
								The companion essay is being prepared and will appear here once published. Your
								painting, seed, and inspection state remain preserved — select
								<strong>Return to painting</strong> above to continue working on the canvas.
							</p>
						</div>
					{/if}
				</div>
			</article>
		</div>
	{/if}
</div>
