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
		createNextSeed,
		CURATED_DEFAULT_SEED,
		CURATED_STUDY_SEEDS,
		DEFAULT_STATE,
		DEFAULT_VIEW_STATE,
		describePaintingAccessible,
		deserializeStateParams,
		exportWholePainting,
		findMatchingPreset,
		KNOB_SPECS,
		loadStateFromStorage,
		MAX_UNDO_HISTORY,
		normalizeSeed,
		normalizeState,
		normalizeViewState,
		PRESET_SPECS,
		ProgressiveColorFieldBuffer,
		saveStateToStorage,
		SECONDARY_KNOB_SPECS,
		serializeStateQuery,
		statesEqual,
		STUDIES,
		STUDY_BY_ID,
		triggerBlobDownload,
		type ColorFieldState,
		type ExportResolution,
		type KnobKey,
		type PaintingModel,
		type PresetId,
		type SecondaryKnobKey,
		type StudyId,
		type ViewMode,
		type ViewState
	} from '$lib/visualizations/color-field-studio';
	import RotarySliderKnob from './RotarySliderKnob.svelte';
	import './color-field-studio.css';

	type PostModule = { default: Component };
	const articleLoaders = import.meta.glob<PostModule>(
		'../../../posts/color-field-painting-color-edges-and-space.md'
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

	setContext('color-field-studio-embedded-article', true);

	type PlaybackPhase = 'painting' | 'paused' | 'complete';

	const KNOB_ENDPOINTS: Readonly<
		Record<KnobKey | SecondaryKnobKey, { readonly minLabel: string; readonly maxLabel: string }>
	> = {
		areaCount: { minLabel: '2 areas', maxLabel: '6 areas' },
		areaSize: { minLabel: '25%', maxLabel: '90%' },
		edgeSoftness: { minLabel: 'Sharp', maxLabel: 'Soft' },
		transparency: { minLabel: 'Opaque', maxLabel: 'Sheer' },
		canvasTexture: { minLabel: 'Smooth', maxLabel: 'Woven' },
		paintingTime: { minLabel: '4 s', maxLabel: '20 s' }
	};

	let rootEl: HTMLDivElement | undefined = $state();
	let stageEl: HTMLDivElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let topStackEl: HTMLElement | undefined = $state();
	let controlsBtnEl: HTMLButtonElement | undefined = $state();
	let inspectBtnEl: HTMLButtonElement | undefined = $state();
	let closeTrayBtnEl: HTMLButtonElement | undefined = $state();
	let readArticleBtnEl: HTMLButtonElement | undefined = $state();
	let returnToPaintingBtnEl: HTMLButtonElement | undefined = $state();
	let exportBtnEl: HTMLButtonElement | undefined = $state();

	let studioState = $state<ColorFieldState>({ ...DEFAULT_STATE });
	let committedState = $state<ColorFieldState>({ ...DEFAULT_STATE });
	let undoStack = $state<ColorFieldState[]>([]);

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

	let playbackPhase = $state<PlaybackPhase>('complete');
	let playbackProgress = $state(1);
	let frameCount = $state(0);
	let liveAnnouncement = $state('');

	let currentModel: PaintingModel = $derived(buildPaintingModel(studioState));
	let committedModel: PaintingModel = $derived(
		statesEqual(studioState, committedState) ? currentModel : buildPaintingModel(committedState)
	);
	let committedDescription = $derived(describePaintingAccessible(committedState, committedModel));
	let passCount = $derived(currentModel.glazePasses.length);
	let activeStudySpec = $derived(STUDY_BY_ID[studioState.studyId]);
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
	let progressiveBuffer: ProgressiveColorFieldBuffer | null = null;
	let bufferCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
	let bufferState: ColorFieldState | null = null;
	let bufferIsLightweight = false;
	let initialMountState: ColorFieldState = { ...DEFAULT_STATE };
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

	function getPreviewDimensions(artW: number, artH: number): { width: number; height: number } {
		const previewScale = Math.min(0.6, 720 / Math.max(1, artW), 480 / Math.max(1, artH));
		return {
			width: Math.max(240, Math.round(artW * previewScale)),
			height: Math.max(160, Math.round(artH * previewScale))
		};
	}

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

	function promoteBufferToFullResolution() {
		if (!progressiveBuffer || !bufferIsLightweight) return;
		progressiveBuffer.resizeArtboard(
			currentModel,
			studioState.artboardWidth,
			studioState.artboardHeight
		);
		bufferIsLightweight = false;
		refreshBufferCanvas();
	}

	function downscaleBufferToPreviewResolution() {
		if (!progressiveBuffer || bufferIsLightweight || progressiveBuffer.isComplete()) return;
		const previewDims = getPreviewDimensions(studioState.artboardWidth, studioState.artboardHeight);
		progressiveBuffer.resizeArtboard(currentModel, previewDims.width, previewDims.height);
		bufferIsLightweight = true;
		refreshBufferCanvas();
	}

	/**
	 * Presents the current frame onto the visible stage canvas:
	 * - Fill/Fit: scales the fixed logical artboard uniformly from the cached backing buffer.
	 * - Inspect surface: crops and draws directly from the full-resolution backing buffer via drawImage
	 *   without regenerating color fields, edges, or grain.
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

	function finishBufferAtFullResolution() {
		if (!progressiveBuffer) return;
		if (bufferIsLightweight) {
			const fullBuf = new ProgressiveColorFieldBuffer(
				currentModel,
				studioState.artboardWidth,
				studioState.artboardHeight
			);
			fullBuf.finishAll();
			progressiveBuffer.dispose();
			progressiveBuffer = fullBuf;
			bufferIsLightweight = false;
		} else {
			progressiveBuffer.finishAll();
		}
		refreshBufferCanvas();
	}

	function startPlaybackLoop() {
		stopAnimationLoop();
		if (typeof requestAnimationFrame !== 'function') {
			finishBufferAtFullResolution();
			playbackProgress = 1;
			playbackPhase = 'complete';
			frameCount += 1;
			presentStage();
			return;
		}

		const tickFrame = (nowMs: number) => {
			if (playbackPhase !== 'painting' || !progressiveBuffer) {
				rafHandle = null;
				lastFrameTimeMs = null;
				return;
			}

			if (typeof document !== 'undefined' && document.hidden) {
				stopAnimationLoop();
				pausedByVisibility = true;
				playbackPhase = 'paused';
				promoteBufferToFullResolution();
				presentStage();
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

			if (nextProgress >= 1 || progressiveBuffer.isComplete()) {
				finishBufferAtFullResolution();
				playbackProgress = 1;
				playbackPhase = 'complete';
				rafHandle = null;
				lastFrameTimeMs = null;
				frameCount += 1;
				presentStage();
				return;
			}

			refreshBufferCanvas();
			frameCount += 1;
			presentStage();

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
			const usePreview =
				options.mode === 'reveal'
					? options.lightweightPreview !== false
					: Boolean(options.lightweightPreview);

			let bufW = model.state.artboardWidth;
			let bufH = model.state.artboardHeight;
			if (usePreview) {
				const previewDims = getPreviewDimensions(
					model.state.artboardWidth,
					model.state.artboardHeight
				);
				bufW = previewDims.width;
				bufH = previewDims.height;
			}

			const nextBuf = new ProgressiveColorFieldBuffer(model, bufW, bufH);
			if (token !== renderToken) {
				nextBuf.dispose();
				return;
			}

			progressiveBuffer?.dispose();
			progressiveBuffer = nextBuf;
			bufferState = { ...model.state };
			bufferIsLightweight = usePreview;
			pausedByVisibility = false;

			if (options.mode === 'reveal') {
				const startAt = options.preserveProgress ?? 0.015;
				playbackProgress = startAt;
				playbackPhase = 'painting';
				progressiveBuffer.advanceTo(startAt);
				refreshBufferCanvas();
				frameCount += 1;
				presentStage();
				startPlaybackLoop();
			} else {
				stopAnimationLoop();
				progressiveBuffer.finishAll();
				playbackProgress = 1;
				playbackPhase = 'complete';
				refreshBufferCanvas();
				frameCount += 1;
				presentStage();
			}
		} catch {
			showStatus('Used compact resolution to fit available browser memory.');
		}
	}

	function syncBrowserHistoryUrl(
		targetState: ColorFieldState,
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

	function pushUndoSnapshot(prev: ColorFieldState, next: ColorFieldState) {
		if (statesEqual(prev, next)) return;
		undoStack = [...undoStack.slice(-(MAX_UNDO_HISTORY - 1)), prev];
	}

	function commitStateChange(
		nextRaw: ColorFieldState,
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
			Boolean(options?.playReveal) &&
			!prefersReducedMotion &&
			activeOverlay === 'painting' &&
			viewState.mode !== 'inspect';
		rebuildPainting({
			mode: shouldPlay ? 'reveal' : 'still',
			lightweightPreview: shouldPlay
		});

		if (options?.announce !== false) {
			liveAnnouncement = describePaintingAccessible(next, m);
		}
	}

	function previewKnobChange(key: KnobKey | SecondaryKnobKey, nextValue: number) {
		if (isRestoringHistory) return;
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
			lightweightPreview: viewState.mode !== 'inspect'
		});
	}

	function commitKnobChange(key: KnobKey | SecondaryKnobKey, nextValue: number) {
		if (isRestoringHistory) return;
		bumpIdleActivity();
		if (key === 'paintingTime') {
			const next = normalizeState({
				...studioState,
				paintingTime: nextValue
			});
			if (next.paintingTime === committedState.paintingTime) {
				studioState = next;
				return;
			}
			pushUndoSnapshot(committedState, next);
			studioState = next;
			committedState = next;
			saveStateToStorage(next);
			syncBrowserHistoryUrl(next, viewState, activeOverlay);
			liveAnnouncement = `Painting reveal duration set to ${next.paintingTime} seconds.`;
			return;
		}

		const nextCandidate = normalizeState({
			...studioState,
			[key]: nextValue
		});
		if (
			statesEqual(nextCandidate, committedState) &&
			(playbackPhase !== 'complete' || !bufferIsLightweight)
		) {
			studioState = nextCandidate;
			return;
		}

		commitStateChange(nextCandidate, { recordUndo: true, playReveal: false, announce: true });
	}

	function flushPendingPreviewCommit() {
		if (isRestoringHistory) return;
		if (!statesEqual(studioState, committedState)) {
			const onlyTimeChanged =
				studioState.paintingTime !== committedState.paintingTime &&
				statesEqual({ ...studioState, paintingTime: committedState.paintingTime }, committedState);
			if (onlyTimeChanged) {
				const next = normalizeState(studioState);
				pushUndoSnapshot(committedState, next);
				studioState = next;
				committedState = next;
				saveStateToStorage(next);
				syncBrowserHistoryUrl(next, viewState, activeOverlay);
				liveAnnouncement = `Painting reveal duration set to ${next.paintingTime} seconds.`;
			} else {
				commitStateChange(studioState, {
					recordUndo: true,
					playReveal: false,
					announce: true
				});
			}
		} else if (playbackPhase === 'complete' && bufferIsLightweight) {
			promoteBufferToFullResolution();
			presentStage();
		}
	}

	function handleSelectStudy(studyId: StudyId) {
		bumpIdleActivity();
		flushPendingPreviewCommit();
		if (studyId === studioState.studyId) return;
		const curatedSeed = CURATED_STUDY_SEEDS[studyId];
		commitStateChange(
			{
				...studioState,
				studyId,
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
				artboard: dims.key,
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
		flushPendingPreviewCommit();
		if (viewState.mode === 'inspect') {
			viewState = normalizeStudioViewState({
				...viewState,
				mode: previousWholeMode
			});
			syncBrowserHistoryUrl(studioState, viewState, activeOverlay);
		}
		rebuildPainting({
			mode: 'reveal',
			lightweightPreview: true
		});
	}

	function handlePauseResume() {
		bumpIdleActivity();
		pausedByVisibility = false;
		flushPendingPreviewCommit();
		if (playbackPhase === 'painting') {
			stopAnimationLoop();
			playbackPhase = 'paused';
			promoteBufferToFullResolution();
			presentStage();
		} else if (playbackPhase === 'paused') {
			if (prefersReducedMotion) {
				handleFinishNow();
			} else {
				downscaleBufferToPreviewResolution();
				playbackPhase = 'painting';
				startPlaybackLoop();
			}
		}
	}

	function handleFinishNow() {
		bumpIdleActivity();
		pausedByVisibility = false;
		flushPendingPreviewCommit();
		stopAnimationLoop();
		if (progressiveBuffer) {
			finishBufferAtFullResolution();
		} else {
			rebuildPainting({ mode: 'still', lightweightPreview: false });
			return;
		}
		playbackProgress = 1;
		playbackPhase = 'complete';
		frameCount += 1;
		presentStage();
	}

	function setViewMode(nextMode: ViewMode, focusFocal = false) {
		bumpIdleActivity();
		exportMenuOpen = false;
		flushPendingPreviewCommit();

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
			promoteBufferToFullResolution();
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

	async function exitInspectMode() {
		if (viewState.mode !== 'inspect') return;
		setViewMode(previousWholeMode, false);
		await tick();
		inspectBtnEl?.focus({ preventScroll: true });
	}

	function recenterInspect() {
		bumpIdleActivity();
		if (viewState.mode !== 'inspect') return;
		flushPendingPreviewCommit();
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
		flushPendingPreviewCommit();
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
		flushPendingPreviewCommit();
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
		flushPendingPreviewCommit();
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
		flushPendingPreviewCommit();
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
		if (!statesEqual(studioState, committedState)) {
			flushPendingPreviewCommit();
		}
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
			...DEFAULT_STATE,
			artboard: dims.key,
			artboardWidth: dims.artboardWidth,
			artboardHeight: dims.artboardHeight
		});
		commitStateChange(resetTarget, {
			recordUndo: true,
			playReveal: false,
			announce: true,
			resetInspectCenterToFocal: true
		});
		showStatus('Reset studio to the default Rothko Nocturne color field composition.');
	}

	async function handleCopyLink() {
		bumpIdleActivity();
		if (typeof window === 'undefined') return;
		flushPendingPreviewCommit();
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
		flushPendingPreviewCommit();
		exportingBusy = true;
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 16));
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
			flushPendingPreviewCommit();
			controlsBtnEl?.focus();
		}
	}

	async function closeControlsTray() {
		bumpIdleActivity();
		trayOpen = false;
		await tick();
		flushPendingPreviewCommit();
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
		flushPendingPreviewCommit();
		if (playbackPhase === 'painting' || pausedByVisibility) {
			wasPlayingBeforeArticle = true;
			pausedByVisibility = false;
			stopAnimationLoop();
			playbackPhase = 'paused';
			promoteBufferToFullResolution();
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
			progressiveBuffer && bufferCanvas && bufferState && statesEqual(bufferState, studioState)
		);
		if (!bufferMatches) {
			wasPlayingBeforeArticle = false;
			pausedByVisibility = false;
			rebuildPainting({
				mode: 'still',
				lightweightPreview: false
			});
		} else if (prefersReducedMotion && playbackPhase !== 'complete') {
			wasPlayingBeforeArticle = false;
			pausedByVisibility = false;
			handleFinishNow();
		} else if (wasPlayingBeforeArticle && playbackPhase === 'paused' && !prefersReducedMotion) {
			wasPlayingBeforeArticle = false;
			if (typeof document !== 'undefined' && document.hidden) {
				pausedByVisibility = true;
				promoteBufferToFullResolution();
				presentStage();
			} else {
				pausedByVisibility = false;
				downscaleBufferToPreviewResolution();
				playbackPhase = 'painting';
				startPlaybackLoop();
			}
		} else {
			if (!progressiveBuffer?.isComplete()) {
				promoteBufferToFullResolution();
			}
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
		if (!href.startsWith('/tools/color-field-studio?')) return;

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

	function formatKnobDisplay(key: KnobKey | SecondaryKnobKey): string {
		const val = studioState[key];
		if (key === 'areaCount') return `${val} areas`;
		if (key === 'paintingTime') return `${val} s`;
		return `${val}%`;
	}

	function handleDocumentPointerDown(event: PointerEvent) {
		bumpIdleActivity();
		if (!exportMenuOpen) return;
		const target = event.target as HTMLElement | null;
		if (!target || !target.closest('.cf-popover-anchor')) {
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
				void exitInspectMode();
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
		if (viewState.mode === 'inspect') {
			presentStage();
		}
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
				if (playbackPhase === 'painting' || pausedByVisibility) {
					stopAnimationLoop();
					wasPlayingBeforeArticle = true;
					pausedByVisibility = false;
					playbackPhase = 'paused';
					promoteBufferToFullResolution();
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
				progressiveBuffer && bufferCanvas && bufferState && statesEqual(bufferState, nextState)
			);

			if (!bufferMatches) {
				wasPlayingBeforeArticle = false;
				pausedByVisibility = false;
				rebuildPainting({
					mode: 'still',
					lightweightPreview: false
				});
			} else if (prefersReducedMotion && playbackPhase !== 'complete') {
				wasPlayingBeforeArticle = false;
				pausedByVisibility = false;
				handleFinishNow();
			} else if (wasPlayingBeforeArticle && playbackPhase === 'paused' && !prefersReducedMotion) {
				wasPlayingBeforeArticle = false;
				if (typeof document !== 'undefined' && document.hidden) {
					pausedByVisibility = true;
					promoteBufferToFullResolution();
					presentStage();
				} else {
					pausedByVisibility = false;
					downscaleBufferToPreviewResolution();
					playbackPhase = 'painting';
					startPlaybackLoop();
				}
			} else {
				if (!progressiveBuffer?.isComplete()) {
					promoteBufferToFullResolution();
				}
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
			if (e.matches && (playbackPhase === 'painting' || playbackPhase === 'paused')) {
				wasPlayingBeforeArticle = false;
				pausedByVisibility = false;
				handleFinishNow();
			}
		};
		reducedMedia.addEventListener('change', onMotionChange);

		// Open shallow tray by default on wide screens; keep collapsed initially on mobile/short viewports.
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
		let initialState: ColorFieldState;
		if (urlParsed.hasExplicitState) {
			initialState = urlParsed.state;
		} else {
			const stored = loadStateFromStorage();
			if (stored) {
				initialState = stored;
			} else {
				const artboard = chooseArtboardForViewport(viewportWidth, viewportHeight);
				initialState = {
					...DEFAULT_STATE,
					artboard: artboard.key,
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
			lightweightPreview: playInitialSequence
		});

		const onFullscreenChange = () => {
			isFullscreen = Boolean(document.fullscreenElement);
		};
		document.addEventListener('fullscreenchange', onFullscreenChange);

		const onVisibilityChange = () => {
			if (document.hidden) {
				if (playbackPhase === 'painting') {
					stopAnimationLoop();
					pausedByVisibility = true;
					playbackPhase = 'paused';
					promoteBufferToFullResolution();
					presentStage();
				}
			} else if (pausedByVisibility && playbackPhase === 'paused' && activeOverlay === 'painting') {
				pausedByVisibility = false;
				if (!prefersReducedMotion) {
					downscaleBufferToPreviewResolution();
					playbackPhase = 'painting';
					startPlaybackLoop();
				} else {
					handleFinishNow();
				}
			} else if (!document.hidden && prefersReducedMotion && playbackPhase !== 'complete') {
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
			progressiveBuffer?.dispose();
			progressiveBuffer = null;
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

<div class="cf-root" class:is-article={activeOverlay === 'article'} bind:this={rootEl}>
	<p id="cf-canvas-description" class="cf-sr-only">{committedDescription}</p>
	<div class="cf-sr-only" aria-live="polite">{liveAnnouncement}</div>

	{#if activeOverlay === 'painting'}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="cf-stage"
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
				class="cf-canvas"
				data-testid="color-field-canvas"
				data-phase={playbackPhase}
				data-frame-count={frameCount}
				data-pass-count={passCount}
				data-view-mode={viewState.mode}
				data-artboard={`${studioState.artboardWidth}x${studioState.artboardHeight}`}
				style={`width:${stagePlacement.cssWidth}px;height:${stagePlacement.cssHeight}px;transform:translate(${stagePlacement.offsetX}px,${stagePlacement.offsetY}px);`}
				aria-label={`${activeStudySpec.label} non-figurative color field painting`}
				aria-describedby="cf-canvas-description"
			>
				{committedDescription}
			</canvas>
		</div>

		<div
			class="cf-hud-shell"
			class:has-tray={trayOpen}
			class:is-inspect={viewState.mode === 'inspect'}
		>
			<header
				class="cf-top-stack"
				class:is-idle={isIdleDimmed}
				class:has-export-open={exportMenuOpen}
				bind:this={topStackEl}
				onfocusin={bumpIdleActivity}
				onscroll={updateExportPopoverPosition}
			>
				<div class="cf-topbar">
					<h1 class="cf-sr-only">
						Color Field Painting — Color, Edges, and Space — Interactive Painting Studio
					</h1>

					{#if !introDismissed}
						<div class="cf-intro-pill">
							<p class="cf-intro-text">
								Shape a few broad color fields, soften their edges, and adjust glaze transparency
								over woven cotton-duck canvas.
							</p>
							<button
								type="button"
								class="cf-intro-dismiss"
								aria-label="Dismiss intro note"
								onclick={() => {
									introDismissed = true;
								}}
							>
								×
							</button>
						</div>
					{/if}

					<div class="cf-toolbar-cluster">
						<div
							class="cf-toolbar"
							role="toolbar"
							aria-label="Painting studio controls"
							onscroll={updateExportPopoverPosition}
						>
							<button type="button" class="cf-btn" onclick={handleNewPainting}>
								New painting
							</button>

							<button type="button" class="cf-btn" onclick={handleReplay}>Replay</button>

							{#if playbackPhase === 'painting' || playbackPhase === 'paused'}
								<button type="button" class="cf-btn cf-btn-playback" onclick={handlePauseResume}>
									{playbackPhase === 'painting' ? 'Pause' : 'Resume'}
								</button>
								<button type="button" class="cf-btn cf-btn-playback" onclick={handleFinishNow}>
									Finish now
								</button>
							{/if}

							<button
								bind:this={controlsBtnEl}
								type="button"
								class="cf-btn"
								aria-expanded={trayOpen}
								aria-controls="cf-controls-tray"
								onclick={toggleControlsTray}
							>
								Controls
							</button>

							<button
								bind:this={inspectBtnEl}
								type="button"
								class="cf-btn"
								class:cf-btn-active={viewState.mode === 'inspect'}
								aria-pressed={viewState.mode === 'inspect'}
								onclick={handleOneActionInspectToggle}
							>
								{viewState.mode === 'inspect' ? 'Whole painting' : 'Inspect surface'}
							</button>

							<div class="cf-popover-anchor">
								<button
									bind:this={exportBtnEl}
									type="button"
									class="cf-btn"
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
										class="cf-popover"
										role="region"
										aria-label="Save finished painting options"
										style={`--cf-popover-top:${exportPopoverTopPx}px;--cf-popover-max-height:${exportPopoverMaxHeightPx}px;`}
									>
										<p class="cf-popover-note">
											Exports the complete finished painting alone on its woven cotton-duck ground —
											no controls, captions, or reticles — even during playback or inspection.
										</p>
										<button
											type="button"
											class="cf-btn cf-popover-option"
											disabled={exportingBusy}
											onclick={() => handleExport(2048)}
										>
											<span>2048 px PNG</span>
											<span>Large · whole painting</span>
										</button>
										<button
											type="button"
											class="cf-btn cf-popover-option"
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
								class="cf-btn"
								aria-pressed={isFullscreen}
								onclick={handleToggleFullscreen}
							>
								{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
							</button>
						</div>

						<button
							bind:this={readArticleBtnEl}
							type="button"
							class="cf-btn cf-btn-secondary"
							onclick={openArticleView}
						>
							Read the essay
						</button>
					</div>
				</div>

				{#if viewState.mode === 'inspect' || statusNotice}
					<div class="cf-subhud-row">
						{#if viewState.mode === 'inspect'}
							<div class="cf-inspect-hud" role="region" aria-label="Surface inspection controls">
								<span class="cf-inspect-copy">
									Inspecting painted buffer close up (no fields altered). Drag or use arrow keys to
									pan.
								</span>
								<div class="cf-inspect-controls">
									<button
										type="button"
										class="cf-btn cf-btn-icon"
										aria-label="Zoom out close-up"
										disabled={viewState.inspectZoom <= 2.0}
										onclick={() => adjustInspectZoom(-0.4)}
									>
										−
									</button>
									<span class="cf-zoom-readout">{viewState.inspectZoom.toFixed(1)}×</span>
									<button
										type="button"
										class="cf-btn cf-btn-icon"
										aria-label="Zoom in close-up"
										disabled={viewState.inspectZoom >= 5.0}
										onclick={() => adjustInspectZoom(0.4)}
									>
										+
									</button>
									<button
										type="button"
										class="cf-btn cf-btn-icon"
										aria-label="Pan inspection left"
										onclick={() => panInspectByFraction(-0.18, 0)}
									>
										←
									</button>
									<button
										type="button"
										class="cf-btn cf-btn-icon"
										aria-label="Pan inspection up"
										onclick={() => panInspectByFraction(0, -0.18)}
									>
										↑
									</button>
									<button
										type="button"
										class="cf-btn cf-btn-icon"
										aria-label="Pan inspection down"
										onclick={() => panInspectByFraction(0, 0.18)}
									>
										↓
									</button>
									<button
										type="button"
										class="cf-btn cf-btn-icon"
										aria-label="Pan inspection right"
										onclick={() => panInspectByFraction(0.18, 0)}
									>
										→
									</button>
									<button type="button" class="cf-btn cf-btn-compact" onclick={recenterInspect}>
										Recenter
									</button>
									<button
										type="button"
										class="cf-btn cf-btn-compact cf-btn-active"
										onclick={() => void exitInspectMode()}
									>
										Return to whole painting
									</button>
								</div>
							</div>
						{/if}

						{#if statusNotice}
							<div class="cf-status-banner" role="status">{statusNotice}</div>
						{/if}
					</div>
				{/if}
			</header>

			{#if trayOpen}
				<section id="cf-controls-tray" class="cf-tray" aria-label="Color field studio controls">
					<div class="cf-tray-header">
						<h2 class="cf-tray-title">Studio Controls</h2>

						<div class="cf-tray-header-actions">
							<span class="cf-meta-badge">
								{activeStudySpec.shortLabel} · {studioState.areaCount} areas · Seed {studioState.seed}
							</span>
							<button
								bind:this={closeTrayBtnEl}
								type="button"
								class="cf-btn cf-btn-compact"
								onclick={closeControlsTray}
							>
								Close controls
							</button>
						</div>
					</div>

					<div class="cf-tray-scroll">
						<div class="cf-knobs-grid">
							{#each KNOB_SPECS as spec (spec.key)}
								<RotarySliderKnob
									id={`cf-knob-${spec.key}`}
									label={spec.label}
									ariaLabel={spec.label}
									value={studioState[spec.key]}
									min={spec.min}
									max={spec.max}
									step={spec.step}
									displayValue={formatKnobDisplay(spec.key)}
									ariaValueText={formatKnobDisplay(spec.key)}
									description={spec.description}
									minLabel={KNOB_ENDPOINTS[spec.key].minLabel}
									maxLabel={KNOB_ENDPOINTS[spec.key].maxLabel}
									onPreview={(val) => previewKnobChange(spec.key, val)}
									onCommit={(val) => commitKnobChange(spec.key, val)}
								/>
							{/each}
						</div>

						<details class="cf-details">
							<summary class="cf-summary">More options</summary>
							<div class="cf-details-body">
								<div class="cf-subsection">
									<span class="cf-field-label">Studies</span>
									<div class="cf-inline-actions" role="group" aria-label="Studies">
										{#each STUDIES as study (study.id)}
											<button
												type="button"
												class="cf-btn cf-btn-compact"
												aria-pressed={studioState.studyId === study.id}
												title={study.description}
												onclick={() => handleSelectStudy(study.id)}
											>
												{study.label}
											</button>
										{/each}
									</div>
									<p class="cf-caption">
										<strong>{activeStudySpec.label}:</strong>
										{activeStudySpec.description}
									</p>
								</div>

								<div class="cf-subsection">
									<span class="cf-field-label">Presets (preserves current seed)</span>
									<div class="cf-inline-actions" role="group" aria-label="Presets">
										{#each PRESET_SPECS as preset (preset.id)}
											<button
												type="button"
												class="cf-btn cf-btn-compact"
												aria-pressed={activePresetId === preset.id}
												title={preset.summary}
												onclick={() => handleApplyPreset(preset.id)}
											>
												{preset.label}
											</button>
										{/each}
									</div>
									{#if activePresetSpec}
										<p class="cf-caption">
											<strong>{activePresetSpec.label}:</strong>
											{activePresetSpec.summary}
										</p>
									{:else}
										<p class="cf-caption">
											Each preset adjusts area count, size, edge softness, transparency, and weave
											without rerolling seed {studioState.seed}.
										</p>
									{/if}
								</div>

								<div class="cf-secondary-knobs">
									{#each SECONDARY_KNOB_SPECS as secSpec (secSpec.key)}
										<RotarySliderKnob
											id={`cf-knob-${secSpec.key}`}
											label={secSpec.label}
											ariaLabel={secSpec.label}
											value={studioState[secSpec.key]}
											min={secSpec.min}
											max={secSpec.max}
											step={secSpec.step}
											displayValue={formatKnobDisplay(secSpec.key)}
											ariaValueText={formatKnobDisplay(secSpec.key)}
											description={secSpec.description}
											minLabel={KNOB_ENDPOINTS[secSpec.key].minLabel}
											maxLabel={KNOB_ENDPOINTS[secSpec.key].maxLabel}
											onPreview={(val) => previewKnobChange(secSpec.key, val)}
											onCommit={(val) => commitKnobChange(secSpec.key, val)}
										/>
									{/each}
								</div>

								<div class="cf-more-grid">
									<div class="cf-field-group">
										<label class="cf-field-label" for="cf-seed-input">Seed</label>
										<form class="cf-seed-form" onsubmit={handleApplySeedForm}>
											<input
												id="cf-seed-input"
												class="cf-seed-input"
												type="text"
												inputmode="numeric"
												bind:value={seedInputText}
												aria-label="Painting seed"
											/>
											<button type="submit" class="cf-btn cf-btn-compact">Apply</button>
										</form>
									</div>

									<div class="cf-field-group">
										<span class="cf-field-label">Canvas framing</span>
										<div class="cf-inline-actions" role="group" aria-label="Canvas framing">
											<button
												type="button"
												class="cf-btn cf-btn-compact"
												aria-pressed={viewState.mode === 'fill'}
												onclick={() => setViewMode('fill', false)}
											>
												Fill screen
											</button>
											<button
												type="button"
												class="cf-btn cf-btn-compact"
												aria-pressed={viewState.mode === 'fit'}
												onclick={() => setViewMode('fit', false)}
											>
												Fit painting
											</button>
										</div>
									</div>

									<div class="cf-field-group">
										<span class="cf-field-label">Session &amp; sharing</span>
										<div class="cf-inline-actions">
											<button
												type="button"
												class="cf-btn cf-btn-compact"
												disabled={undoStack.length === 0}
												onclick={handleUndo}
											>
												Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
											</button>
											<button type="button" class="cf-btn cf-btn-compact" onclick={handleCopyLink}>
												Copy link
											</button>
											<button
												type="button"
												class="cf-btn cf-btn-compact"
												onclick={handleResetSettings}
											>
												Reset settings
											</button>
											<a href={resolve('/blog/visualizations')} class="cf-btn cf-btn-compact">
												All visualizations
											</a>
											<button
												type="button"
												class="cf-btn cf-btn-compact"
												data-privacy-settings
												onclick={openPrivacySettings}
											>
												Privacy &amp; cookies
											</button>
										</div>
									</div>
								</div>

								{#if shareFallbackUrl}
									<div class="cf-field-group">
										<label class="cf-field-label" for="cf-share-url">Copyable painting URL</label>
										<input
											id="cf-share-url"
											class="cf-share-input"
											type="text"
											readonly
											value={shareFallbackUrl}
											onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
										/>
									</div>
								{/if}

								<p class="cf-fineprint">
									Procedural color-field and translucent glaze simulation running locally in your
									browser. Non-figurative studies explore color areas, edge softness, transparency,
									and scale — not empirical data or universal color meanings.
								</p>
							</div>
						</details>
					</div>
				</section>
			{/if}
		</div>
	{:else}
		<div
			class="cf-article-overlay"
			role="region"
			aria-label="Accompanying essay: Color Field Painting — Color, Edges, and Space"
		>
			<div class="cf-article-topbar">
				<button
					bind:this={returnToPaintingBtnEl}
					type="button"
					class="cf-btn cf-btn-active"
					onclick={closeArticleView}
				>
					<span aria-hidden="true">←</span> Return to painting
				</button>
				<span class="cf-article-meta">
					Painting preserved · {activeStudySpec.shortLabel} · Seed {studioState.seed}
				</span>
			</div>

			<article class="cf-article-container">
				<p class="cf-article-kicker">Interactive Essay · Visualizations</p>
				<h1 class="cf-article-h1">Color Field Painting — Color, Edges, and Space</h1>
				<p class="cf-article-byline">By Suvro Ghosh</p>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="cf-article-prose" onclick={handleArticleProseClick}>
					{#if ArticleContent}
						<ArticleContent />
					{:else if articleMissing}
						<div class="cf-article-fallback">
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
