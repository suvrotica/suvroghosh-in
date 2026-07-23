<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import StudioControls from './StudioControls.svelte';
	import {
		customPigment,
		getPigment,
		mixAbsorption
	} from '$lib/visualizations/living-pigment/colors';
	import {
		inferredPressure,
		interpolateStroke,
		sanitizeStrokePoint
	} from '$lib/visualizations/living-pigment/pointer';
	import {
		applyPreset,
		cloneSettings,
		DEFAULT_SETTINGS,
		STUDIO_PRESETS
	} from '$lib/visualizations/living-pigment/presets';
	import {
		paletteForHarmony,
		newRandomSeed,
		SeededRandom,
		surpriseSettings
	} from '$lib/visualizations/living-pigment/random';
	import {
		compressProject,
		createArtworkFilename,
		decodeProject,
		decompressProject,
		encodeProject,
		isShortcutInput,
		preferenceSubset
	} from '$lib/visualizations/living-pigment/project';
	import type { LivingPigmentEngine } from '$lib/visualizations/living-pigment/engine';
	import type {
		BrushInjection,
		EngineDiagnostics,
		SavedProjectMetadata,
		SimulationSettings,
		StrokePoint
	} from '$lib/visualizations/living-pigment/types';

	const uid = $props.id();
	const preferenceKey = 'living-pigment-studio-preferences-v1';
	const modeLabels = { watercolor: 'Watercolor', oil: 'Oil paint', hybrid: 'Living pigment' };
	const overlayDescriptions: Record<SimulationSettings['overlay'], string> = {
		artwork: '',
		moisture: 'Dark brown is dry; bright blue is locally wet.',
		pigment: 'Black has little mobile pigment; orange marks greater pigment density.',
		velocity: 'Hue shows flow direction; brightness shows flow strength.',
		drying: 'Orange remains wet; charcoal has dried.',
		grain: 'Light and dark reveal the procedural hills and valleys of the surface.',
		deposited: 'Brown marks pigment that has settled and become resistant to motion.'
	};
	const maximumQueuedInjections = 512;

	interface QueuedInjection {
		strokeId: number;
		settings: SimulationSettings;
		injection: BrushInjection;
	}

	let laboratory: HTMLElement;
	let canvasHost: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let projectInput: HTMLInputElement;
	let controlsToggle: HTMLButtonElement;
	let controlsPanel: HTMLElement;
	let saveMenuContainer: HTMLDivElement;
	let saveMenuTrigger: HTMLButtonElement;
	let saveMenuPanel = $state<HTMLDivElement>();
	let engine: LivingPigmentEngine | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let intersectionObserver: IntersectionObserver | null = null;
	let motionQuery: MediaQueryList | null = null;
	let layoutQuery: MediaQueryList | null = null;
	let loadingPromise: Promise<void> | null = null;
	let frameId = 0;
	let previousTimestamp = 0;
	let elapsedTime = 0;
	let visible = true;
	let pageVisible = true;
	let mounted = false;
	let activePointerId: number | null = null;
	let lastPoint: StrokePoint | null = null;
	let strokeDistance = 0;
	let strokeNumber = 0;
	let strokePaletteId = DEFAULT_SETTINGS.primaryPigmentId;
	let activeStrokeSettings = cloneSettings();
	let completedStrokeIds = new SvelteSet<number>();
	let injectionQueue: QueuedInjection[] = [];
	let fpsFrames = 0;
	let fpsStartedAt = 0;
	let latestObjectUrl = '';

	let settings = $state<SimulationSettings>(cloneSettings());
	let customColor = $state('#6b4f9b');
	let recentColors = $state<string[]>([]);
	let studioState = $state<'idle' | 'loading' | 'ready' | 'fallback' | 'error'>('idle');
	let status = $state('Preparing the pigment surface…');
	let paused = $state(false);
	let reducedMotion = $state(false);
	let controlsOpen = $state(false);
	let compactLayout = $state(false);
	let saveMenuOpen = $state(false);
	let isFullscreen = $state(false);
	let pressureDetected = $state(false);
	let cursorVisible = $state(false);
	let cursorX = $state(0);
	let cursorY = $state(0);
	let busy = $state(false);
	let undoAvailable = $state(false);
	let redoAvailable = $state(false);
	let developerLog = $state('');
	let diagnostics = $state<EngineDiagnostics>({
		resolution: '—',
		fps: 0,
		textureFormat: 'RGBA8',
		paused: false,
		pressureDetected: false,
		contextLost: false
	});

	let modeLabel = $derived(modeLabels[settings.mode]);
	let simulationStateLabel = $derived(
		studioState === 'ready'
			? paused
				? 'Paused'
				: 'Evolving'
			: studioState === 'idle'
				? 'Not loaded'
				: studioState === 'loading'
					? 'Loading'
					: 'Unavailable'
	);

	$effect(() => {
		if (typeof document === 'undefined' || !compactLayout || !controlsOpen) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		document.body.classList.add('pigment-controls-open');
		return () => {
			document.body.style.overflow = previousOverflow;
			document.body.classList.remove('pigment-controls-open');
		};
	});

	function activePigment(id = settings.primaryPigmentId) {
		return id === 'custom' ? customPigment(customColor) : getPigment(id);
	}

	function addRecentColor(hex: string) {
		recentColors = [
			hex,
			...recentColors.filter((color) => color.toLowerCase() !== hex.toLowerCase())
		].slice(0, 8);
	}

	function chooseStrokePigment() {
		const available = activeStrokeSettings.paletteIds.length
			? activeStrokeSettings.paletteIds
			: [activeStrokeSettings.primaryPigmentId];
		if (activeStrokeSettings.colorMode === 'controlled-random') {
			const random = new SeededRandom(`${activeStrokeSettings.background.seed}-${strokeNumber}`);
			return random.pick(available);
		}
		if (activeStrokeSettings.colorMode === 'shuffle') {
			return available[strokeNumber % available.length];
		}
		return activeStrokeSettings.primaryPigmentId;
	}

	function pigmentForSegment() {
		const first = activePigment(strokePaletteId);
		if (activeStrokeSettings.colorMode !== 'gradient') return first;
		const second = activePigment(activeStrokeSettings.secondaryPigmentId);
		return {
			...first,
			absorption: mixAbsorption(
				first.absorption,
				second.absorption,
				Math.min(1, strokeDistance * 1.7)
			),
			granulation:
				first.granulation + (second.granulation - first.granulation) * Math.min(1, strokeDistance),
			staining: first.staining + (second.staining - first.staining) * Math.min(1, strokeDistance),
			density: first.density + (second.density - first.density) * Math.min(1, strokeDistance)
		};
	}

	function pointFromEvent(event: PointerEvent): StrokePoint {
		const bounds = canvasHost.getBoundingClientRect();
		const x = (event.clientX - bounds.left) / Math.max(1, bounds.width);
		const y = 1 - (event.clientY - bounds.top) / Math.max(1, bounds.height);
		const previous = lastPoint;
		const elapsed = previous ? Math.max(1, event.timeStamp - previous.time) : 16;
		const distance = previous ? Math.hypot(x - previous.x, y - previous.y) : 0;
		const speed = (distance / elapsed) * 1_000;
		const hasPenPressure = event.pointerType === 'pen' && event.pressure > 0;
		if (hasPenPressure) pressureDetected = true;
		return sanitizeStrokePoint({
			x,
			y,
			pressure: hasPenPressure ? event.pressure : inferredPressure(speed),
			tiltX: event.tiltX,
			tiltY: event.tiltY,
			time: event.timeStamp
		});
	}

	function queueSegment(from: StrokePoint, to: StrokePoint) {
		const pigment = pigmentForSegment();
		strokeDistance += Math.hypot(to.x - from.x, to.y - from.y);
		const injection: BrushInjection = {
			from,
			to,
			color: pigment.absorption,
			granulation: pigment.granulation,
			staining: pigment.staining,
			density: pigment.density
		};
		const lastQueued = injectionQueue.at(-1);
		if (injectionQueue.length >= maximumQueuedInjections && lastQueued?.strokeId === strokeNumber) {
			lastQueued.injection = {
				...injection,
				from: lastQueued.injection.from
			};
			return;
		}
		injectionQueue.push({
			strokeId: strokeNumber,
			settings: activeStrokeSettings,
			injection
		});
	}

	function handlePointerDown(event: PointerEvent) {
		if (
			!engine ||
			studioState !== 'ready' ||
			activePointerId !== null ||
			!event.isPrimary ||
			(event.pointerType === 'mouse' && event.button !== 0)
		)
			return;
		event.preventDefault();
		canvas.focus({ preventScroll: true });
		canvas.setPointerCapture(event.pointerId);
		activePointerId = event.pointerId;
		strokeNumber += 1;
		activeStrokeSettings = cloneSettings(settings);
		strokeDistance = 0;
		strokePaletteId = chooseStrokePigment();
		lastPoint = pointFromEvent(event);
		queueSegment(lastPoint, lastPoint);
		cursorVisible = true;
		updateCursor(event);
		if (activeStrokeSettings.brush === 'water') {
			status = 'Water entered the surface and can move nearby pigment again.';
		} else if (activeStrokeSettings.brush === 'lifter') {
			status = 'The pigment lifter began redistributing and removing color.';
		} else if (activeStrokeSettings.brush === 'clear') {
			status = 'True clear began returning this area toward the underlying surface.';
		} else {
			status = `${activePigment(strokePaletteId).name} entered the ${modeLabels[activeStrokeSettings.mode].toLowerCase()} simulation.`;
		}
		schedule();
	}

	function handlePointerMove(event: PointerEvent) {
		updateCursor(event);
		if (event.pointerId !== activePointerId || !lastPoint) return;
		event.preventDefault();
		const coalescedEvents =
			typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
		const coalesced = coalescedEvents.length > 0 ? coalescedEvents : [event];
		for (const sample of coalesced) {
			const next = pointFromEvent(sample);
			const spacing = Math.max(
				0.0025,
				(activeStrokeSettings.brushSize / Math.max(320, canvasHost.clientHeight)) * 0.42
			);
			for (const interpolated of interpolateStroke(lastPoint, next, spacing)) {
				queueSegment(lastPoint, interpolated);
				lastPoint = interpolated;
			}
		}
		schedule();
	}

	function finishPointer(event: PointerEvent) {
		if (event.pointerId !== activePointerId) return;
		event.preventDefault();
		const finishedStrokeId = strokeNumber;
		activePointerId = null;
		lastPoint = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		if (injectionQueue.some((entry) => entry.strokeId === finishedStrokeId)) {
			completedStrokeIds.add(finishedStrokeId);
		} else {
			engine?.commitHistory(true);
			refreshDiagnostics();
		}
		addRecentColor(activePigment(strokePaletteId).hex);
		schedule();
	}

	function discardPendingInput() {
		const pointerId = activePointerId;
		activePointerId = null;
		lastPoint = null;
		if (pointerId !== null && canvas?.hasPointerCapture(pointerId)) {
			canvas.releasePointerCapture(pointerId);
		}
		injectionQueue = [];
		completedStrokeIds.clear();
	}

	function updateCursor(event: PointerEvent) {
		const bounds = canvasHost.getBoundingClientRect();
		cursorX = event.clientX - bounds.left;
		cursorY = event.clientY - bounds.top;
		cursorVisible =
			cursorX >= 0 && cursorY >= 0 && cursorX <= bounds.width && cursorY <= bounds.height;
	}

	function setControlsOpen(open: boolean, restoreFocus = false) {
		controlsOpen = open;
		if (open) {
			saveMenuOpen = false;
			requestAnimationFrame(() => {
				controlsPanel?.querySelector<HTMLButtonElement>('.controls-close')?.focus({
					preventScroll: true
				});
			});
		} else if (restoreFocus) {
			requestAnimationFrame(() => controlsToggle?.focus({ preventScroll: true }));
		}
	}

	function handleControlsKeydown(event: KeyboardEvent) {
		if (!compactLayout) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			setControlsOpen(false, true);
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = Array.from(
			controlsPanel.querySelectorAll<HTMLElement>(
				'button:not([disabled]), select:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => element.offsetParent !== null);
		const first = focusable[0];
		const last = focusable.at(-1);
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function updateSaveMenuPosition() {
		if (!saveMenuOpen || !saveMenuTrigger || !saveMenuPanel) return;
		const gutter = 8;
		const trigger = saveMenuTrigger.getBoundingClientRect();
		const width = Math.max(1, Math.min(288, window.innerWidth - gutter * 2));
		const viewportMaxHeight = Math.max(80, window.innerHeight - gutter * 2);
		const availableBelow = Math.max(0, window.innerHeight - trigger.bottom - gutter * 2);
		const availableAbove = Math.max(0, trigger.top - gutter * 2);
		const preferredHeight = Math.min(saveMenuPanel.scrollHeight || 360, viewportMaxHeight);
		const placeAbove =
			availableBelow < Math.min(240, preferredHeight) && availableAbove > availableBelow;
		const availableHeight = placeAbove ? availableAbove : availableBelow;
		const maxHeight = Math.min(viewportMaxHeight, Math.max(120, availableHeight));
		const left = Math.max(
			gutter,
			Math.min(trigger.right - width, window.innerWidth - width - gutter)
		);
		const top = placeAbove
			? Math.max(gutter, trigger.top - Math.min(preferredHeight, maxHeight) - gutter)
			: Math.min(trigger.bottom + gutter, window.innerHeight - maxHeight - gutter);
		const studioBounds = laboratory.getBoundingClientRect();

		Object.assign(saveMenuPanel.style, {
			left: `${Math.round(left - studioBounds.left)}px`,
			top: `${Math.round(Math.max(gutter, top) - studioBounds.top)}px`,
			width: `${Math.round(width)}px`,
			maxHeight: `${Math.round(maxHeight)}px`
		});
	}

	function setSaveMenuOpen(open: boolean) {
		if (open && (studioState !== 'ready' || busy)) return;
		saveMenuOpen = open;
		if (open) {
			setControlsOpen(false);
			requestAnimationFrame(() => {
				updateSaveMenuPosition();
				saveMenuPanel?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({
					preventScroll: true
				});
			});
		}
	}

	function cancelLoop() {
		if (frameId) cancelAnimationFrame(frameId);
		frameId = 0;
		previousTimestamp = 0;
	}

	function schedule() {
		if (!mounted || !engine || studioState !== 'ready' || !visible || !pageVisible || frameId)
			return;
		if (paused && injectionQueue.length === 0 && completedStrokeIds.size === 0) return;
		frameId = requestAnimationFrame(frame);
	}

	function frame(timestamp: number) {
		frameId = 0;
		if (!engine || !visible || !pageVisible || studioState !== 'ready') return;
		if (!previousTimestamp) previousTimestamp = timestamp;
		const delta = Math.min(1 / 20, Math.max(1 / 240, (timestamp - previousTimestamp) / 1_000));
		previousTimestamp = timestamp;
		elapsedTime += delta;
		const firstQueued = injectionQueue[0];
		const processedStrokeId = firstQueued?.strokeId ?? null;
		const batchSettings = firstQueued?.settings ?? settings;
		const batch: BrushInjection[] = [];
		while (
			batch.length < 8 &&
			processedStrokeId !== null &&
			injectionQueue[0]?.strokeId === processedStrokeId
		) {
			batch.push(injectionQueue.shift()!.injection);
		}
		if (!paused || batch.length > 0) engine.step(batchSettings, batch, delta, elapsedTime);
		if (
			processedStrokeId !== null &&
			completedStrokeIds.has(processedStrokeId) &&
			injectionQueue[0]?.strokeId !== processedStrokeId
		) {
			completedStrokeIds.delete(processedStrokeId);
			engine.commitHistory(true);
			refreshDiagnostics(diagnostics.fps);
		}

		fpsFrames += 1;
		if (!fpsStartedAt) fpsStartedAt = timestamp;
		if (timestamp - fpsStartedAt >= 750) {
			const fps = (fpsFrames * 1_000) / Math.max(1, timestamp - fpsStartedAt);
			fpsFrames = 0;
			fpsStartedAt = timestamp;
			refreshDiagnostics(fps);
		}
		if (!paused || injectionQueue.length > 0 || completedStrokeIds.size > 0) schedule();
	}

	function refreshDiagnostics(fps = diagnostics.fps) {
		if (!engine) return;
		const resolution = engine.simulationResolution;
		undoAvailable = engine.canUndo;
		redoAvailable = engine.canRedo;
		developerLog = engine.diagnosticsLog;
		diagnostics = {
			resolution: `${resolution.width} × ${resolution.height}`,
			fps: Math.round(fps),
			textureFormat: engine.formatLabel,
			paused,
			pressureDetected,
			contextLost: false
		};
	}

	async function beginLoading() {
		if (loadingPromise || engine || !mounted) return loadingPromise;
		studioState = 'loading';
		status = 'Preparing the pigment surface…';
		loadingPromise = (async () => {
			try {
				if (new URLSearchParams(window.location.search).get('webgl') === 'off') {
					throw new Error('WebGL2 was disabled for this compatibility check.');
				}
				const { LivingPigmentEngine } = await import('$lib/visualizations/living-pigment/engine');
				if (!mounted) return;
				engine = new LivingPigmentEngine(canvas, settings, {
					onContextLost: () => {
						cancelLoop();
						discardPendingInput();
						studioState = 'loading';
						paused = true;
						diagnostics = { ...diagnostics, contextLost: true, paused: true };
						status =
							'The graphics context was lost. Painting is paused while the surface recovers.';
					},
					onContextRestored: (recovered) => {
						studioState = 'ready';
						diagnostics = { ...diagnostics, contextLost: false };
						status = recovered
							? 'The graphics context returned and the latest periodic checkpoint was restored.'
							: 'The graphics context returned; the seeded surface was rebuilt.';
						refreshDiagnostics();
					}
				});
				engine.initialize();
				resizeCanvas();
				studioState = 'ready';
				status = reducedMotion
					? 'Ready and paused because reduced motion is preferred. Drawing and single steps still work.'
					: engine.formatLabel === 'RGBA8'
						? 'Ready in reduced texture mode. The GPU did not expose renderable half-float textures.'
						: 'Pigment surface ready. Draw a stroke and let the material answer.';
				refreshDiagnostics();
				schedule();
			} catch (error) {
				studioState = 'fallback';
				status =
					error instanceof Error
						? error.message
						: 'The live pigment surface could not start in this browser.';
			}
		})();
		return loadingPromise;
	}

	function resizeCanvas() {
		if (!engine || !canvasHost) return;
		const bounds = canvasHost.getBoundingClientRect();
		const smallDevice = window.matchMedia('(max-width: 48rem)').matches;
		const density = Math.min(window.devicePixelRatio || 1, smallDevice ? 1.25 : 1.6);
		engine.setDisplaySize(bounds.width, bounds.height, density);
	}

	function persistPreferences() {
		try {
			localStorage.setItem(
				preferenceKey,
				JSON.stringify({ ...preferenceSubset(settings), recentColors, customColor })
			);
		} catch {
			// Preferences are optional; storage denial does not interrupt painting.
		}
	}

	function handleSettings(next: SimulationSettings) {
		const previousQuality = settings.quality;
		settings = cloneSettings(next);
		if (engine && studioState === 'ready') {
			try {
				if (previousQuality !== settings.quality) engine.setQuality(settings.quality);
				else engine.render(settings);
				refreshDiagnostics();
			} catch (error) {
				status = error instanceof Error ? error.message : 'That setting could not be applied.';
			}
		}
		persistPreferences();
		if (!paused) schedule();
	}

	function handleCustomColor(hex: string) {
		customColor = hex;
		addRecentColor(hex);
		persistPreferences();
	}

	function handlePreset(id: string) {
		const preset = STUDIO_PRESETS.find((candidate) => candidate.id === id);
		if (!preset) return;
		discardPendingInput();
		settings = applyPreset(settings, preset);
		engine?.seed(settings, true);
		status = `${preset.name} loaded with its tested surface, palette, and material behavior.`;
		refreshDiagnostics();
		persistPreferences();
		schedule();
	}

	function randomPalette() {
		const seed = newRandomSeed();
		const paletteIds = paletteForHarmony(settings.background.harmony, seed, 5);
		handleSettings({
			...settings,
			primaryPigmentId: paletteIds[0],
			secondaryPigmentId: paletteIds[1],
			paletteIds
		});
		status = 'A constrained palette was chosen from the current color harmony.';
	}

	function surprise() {
		discardPendingInput();
		settings = surpriseSettings(settings, newRandomSeed());
		engine?.seed(settings, true);
		status = 'Surprise settings created a coherent palette, surface, and material response.';
		refreshDiagnostics();
		persistPreferences();
		schedule();
	}

	function applyConfiguredBackground() {
		discardPendingInput();
		engine?.seed(settings, true);
		status = `Background rebuilt from seed ${Math.round(settings.background.seed)}.`;
		refreshDiagnostics();
		schedule();
	}

	function randomBackground() {
		discardPendingInput();
		settings = {
			...settings,
			background: { ...settings.background, seed: newRandomSeed() }
		};
		engine?.seed(settings, true);
		status = `A new evolving background was made with seed ${settings.background.seed}.`;
		refreshDiagnostics();
		persistPreferences();
		schedule();
	}

	function resetControls() {
		const quality = settings.quality;
		settings = { ...cloneSettings(), quality };
		engine?.render(settings);
		status = 'Material controls returned to their balanced defaults; the artwork was preserved.';
		persistPreferences();
		schedule();
	}

	function togglePause() {
		paused = !paused;
		status = paused
			? 'Evolution paused. Drawing and single steps remain available.'
			: 'Evolution resumed.';
		refreshDiagnostics();
		if (paused) cancelLoop();
		else schedule();
	}

	function singleStep() {
		if (!engine) return;
		engine.advanceOneStep(settings);
		status = 'Advanced one simulation step.';
		refreshDiagnostics();
	}

	function dryArtwork() {
		if (!engine) return;
		if (activePointerId !== null || injectionQueue.length > 0) {
			status = 'Finish the current stroke before fixing the pigment into the surface.';
			return;
		}
		engine.dryArtwork(settings);
		status = 'Most mobile moisture was removed and pigment was fixed into the surface.';
		refreshDiagnostics();
	}

	function undo() {
		if (activePointerId !== null || injectionQueue.length > 0) {
			status = 'Finish the current stroke before using undo.';
			return;
		}
		if (engine?.undo(settings)) {
			status = 'Returned to the previous meaningful action.';
			refreshDiagnostics();
		}
	}

	function redo() {
		if (activePointerId !== null || injectionQueue.length > 0) {
			status = 'Finish the current stroke before using redo.';
			return;
		}
		if (engine?.redo(settings)) {
			status = 'Restored the next meaningful action.';
			refreshDiagnostics();
		}
	}

	function clearArtwork() {
		if (
			!engine ||
			!window.confirm('Clear the artwork and return to clean paper? You can undo afterward.')
		)
			return;
		discardPendingInput();
		const clean = {
			...settings,
			background: { ...settings.background, mode: 'clean' as const, moisture: 0, intensity: 0 }
		};
		settings = clean;
		engine.seed(clean, false);
		engine.commitHistory(true);
		status = 'The surface returned to clean paper.';
		refreshDiagnostics();
	}

	function requireSettledArtwork(action: string) {
		if (activePointerId === null && injectionQueue.length === 0 && completedStrokeIds.size === 0)
			return true;
		status = `Finish the current stroke before ${action}.`;
		return false;
	}

	function download(blob: Blob, filename: string) {
		if (latestObjectUrl) URL.revokeObjectURL(latestObjectUrl);
		latestObjectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = latestObjectUrl;
		anchor.download = filename;
		anchor.click();
		window.setTimeout(() => {
			if (latestObjectUrl) URL.revokeObjectURL(latestObjectUrl);
			latestObjectUrl = '';
		}, 2_000);
	}

	async function exportArtwork(format: 'image/png' | 'image/webp' = 'image/png', scale = 1) {
		if (!engine || busy || !requireSettledArtwork('exporting the artwork')) return;
		busy = true;
		status = scale > 1 ? 'Rendering a 2× presentation export…' : 'Rendering the artwork…';
		try {
			const blob = await engine.exportBlob(settings, format, scale);
			const extension = format === 'image/webp' ? 'webp' : 'png';
			download(blob, createArtworkFilename(extension));
			status =
				scale > 1
					? 'Saved a 2× presentation export. It re-renders the same simulation field; it is not a higher-resolution simulation.'
					: `Saved ${extension.toUpperCase()} artwork without the controls.`;
		} catch (error) {
			status = error instanceof Error ? error.message : 'The artwork could not be exported.';
		} finally {
			busy = false;
		}
	}

	async function copyArtwork() {
		if (!engine || busy || !requireSettledArtwork('copying the artwork')) return;
		busy = true;
		try {
			const blob = await engine.exportBlob(settings, 'image/png', 1);
			if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
				throw new Error('Image clipboard access is unavailable; use Export PNG instead.');
			}
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
			status = 'Artwork copied to the clipboard.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'Clipboard access was denied.';
		} finally {
			busy = false;
		}
	}

	async function saveProject() {
		if (!engine || busy || !requireSettledArtwork('saving a project')) return;
		busy = true;
		status = 'Reading the pigment fields for a local project file…';
		try {
			const resolution = engine.simulationResolution;
			const metadata: SavedProjectMetadata = {
				version: 1,
				width: resolution.width,
				height: resolution.height,
				createdAt: new Date().toISOString(),
				settings,
				customColor
			};
			const bytes = encodeProject(metadata, engine.readProjectFields());
			const blob = await compressProject(bytes);
			download(blob, createArtworkFilename('livingpigment'));
			status = 'Project saved locally. No artwork data was uploaded.';
		} catch (error) {
			status = error instanceof Error ? error.message : 'The project file could not be saved.';
		} finally {
			busy = false;
		}
	}

	async function loadProject(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !engine || busy) return;
		busy = true;
		status = 'Opening the local project file…';
		try {
			const bytes = await decompressProject(file);
			const decoded = decodeProject(bytes);
			discardPendingInput();
			const restoredSettings = cloneSettings(decoded.metadata.settings);
			engine.restoreProject(
				decoded.fields,
				decoded.metadata.width,
				decoded.metadata.height,
				restoredSettings
			);
			settings = restoredSettings;
			customColor = decoded.metadata.customColor ?? customColor;
			status = 'Project restored locally and ready to continue.';
			refreshDiagnostics();
			persistPreferences();
			schedule();
		} catch (error) {
			status = error instanceof Error ? error.message : 'The selected project file is corrupt.';
		} finally {
			busy = false;
		}
	}

	async function toggleFullscreen() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await laboratory.requestFullscreen();
		} catch {
			status = 'Fullscreen is not available in this browser.';
		}
	}

	function shortcut(event: KeyboardEvent) {
		if (event.key === 'Escape' && saveMenuOpen) {
			event.preventDefault();
			setSaveMenuOpen(false);
			requestAnimationFrame(() => saveMenuTrigger?.focus({ preventScroll: true }));
			return;
		}
		if (isShortcutInput(event.target) || !laboratory.contains(document.activeElement)) return;
		if (studioState !== 'ready' && event.key.toLowerCase() !== 'f') return;
		const key = event.key.toLowerCase();
		const modifier = event.ctrlKey || event.metaKey;
		if (modifier && key === 'z') {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
		} else if (modifier && key === 'y') {
			event.preventDefault();
			redo();
		} else if (modifier && key === 's') {
			event.preventDefault();
			void exportArtwork('image/png', 1);
		} else if (!modifier && key === ' ') {
			event.preventDefault();
			togglePause();
		} else if (!modifier && key === 'b') {
			handleSettings({ ...settings, brush: 'round' });
		} else if (!modifier && key === 'e') {
			handleSettings({ ...settings, brush: 'lifter' });
		} else if (!modifier && key === 'w') {
			handleSettings({ ...settings, brush: 'water' });
		} else if (!modifier && key === '[') {
			handleSettings({ ...settings, brushSize: Math.max(4, settings.brushSize - 4) });
		} else if (!modifier && key === ']') {
			handleSettings({ ...settings, brushSize: Math.min(140, settings.brushSize + 4) });
		} else if (!modifier && key === 'r') {
			randomBackground();
		} else if (!modifier && key === 'c') {
			clearArtwork();
		} else if (!modifier && key === 'f') {
			void toggleFullscreen();
		}
	}

	onMount(() => {
		mounted = true;
		pageVisible = !document.hidden;
		motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		layoutQuery = window.matchMedia('(max-width: 61.999rem)');
		compactLayout = layoutQuery.matches;
		reducedMotion =
			motionQuery.matches || new URLSearchParams(window.location.search).get('motion') === 'reduce';
		paused = reducedMotion;
		const lowPower =
			window.matchMedia('(max-width: 48rem)').matches ||
			(typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) ||
			('deviceMemory' in navigator && Number(navigator.deviceMemory) <= 4);
		if (lowPower) settings = { ...settings, quality: 'low' };

		try {
			const stored = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
			if (stored.brush && DEFAULT_SETTINGS.brush !== stored.brush) settings.brush = stored.brush;
			if (stored.primaryPigmentId) settings.primaryPigmentId = stored.primaryPigmentId;
			if (stored.colorMode) settings.colorMode = stored.colorMode;
			if (stored.quality && !lowPower) settings.quality = stored.quality;
			if (Array.isArray(stored.recentColors)) recentColors = stored.recentColors.slice(0, 8);
			if (/^#[0-9a-f]{6}$/i.test(stored.customColor)) customColor = stored.customColor;
		} catch {
			// Malformed optional preferences are ignored.
		}

		resizeObserver = new ResizeObserver(resizeCanvas);
		resizeObserver.observe(canvasHost);
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				if (visible) {
					void beginLoading();
					schedule();
				} else cancelLoop();
			},
			{ rootMargin: '280px 0px' }
		);
		intersectionObserver.observe(laboratory);

		const handleVisibility = () => {
			pageVisible = !document.hidden;
			if (pageVisible) schedule();
			else cancelLoop();
		};
		const handleMotion = () => {
			reducedMotion = motionQuery?.matches ?? false;
			if (reducedMotion) {
				paused = true;
				cancelLoop();
				status = 'Evolution paused because reduced motion is preferred.';
			}
		};
		const handleLayout = () => {
			compactLayout = layoutQuery?.matches ?? false;
			if (!compactLayout) controlsOpen = false;
		};
		const handleFullscreen = () => {
			isFullscreen = document.fullscreenElement === laboratory;
			window.setTimeout(resizeCanvas, 80);
		};
		const handleDocumentPointerDown = (event: PointerEvent) => {
			if (
				saveMenuOpen &&
				event.target instanceof Node &&
				!saveMenuContainer?.contains(event.target) &&
				!saveMenuPanel?.contains(event.target)
			) {
				saveMenuOpen = false;
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);
		document.addEventListener('fullscreenchange', handleFullscreen);
		document.addEventListener('pointerdown', handleDocumentPointerDown);
		window.addEventListener('keydown', shortcut);
		window.addEventListener('resize', updateSaveMenuPosition);
		window.addEventListener('scroll', updateSaveMenuPosition, true);
		motionQuery.addEventListener('change', handleMotion);
		layoutQuery.addEventListener('change', handleLayout);

		return () => {
			mounted = false;
			cancelLoop();
			resizeObserver?.disconnect();
			intersectionObserver?.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			document.removeEventListener('fullscreenchange', handleFullscreen);
			document.removeEventListener('pointerdown', handleDocumentPointerDown);
			window.removeEventListener('keydown', shortcut);
			window.removeEventListener('resize', updateSaveMenuPosition);
			window.removeEventListener('scroll', updateSaveMenuPosition, true);
			motionQuery?.removeEventListener('change', handleMotion);
			layoutQuery?.removeEventListener('change', handleLayout);
			if (latestObjectUrl) URL.revokeObjectURL(latestObjectUrl);
			discardPendingInput();
			engine?.destroy();
			engine = null;
		};
	});
</script>

<section
	bind:this={laboratory}
	class="living-pigment-studio article-breakout not-prose relative my-10 w-[min(94rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-stone-500 bg-stone-950 text-stone-100 shadow-2xl shadow-black/30"
	aria-labelledby={`${uid}-title`}
>
	<header class="studio-header">
		<div class="title-block">
			<p>Interactive shader studio · local and private</p>
			<h2 id={`${uid}-title`}>Living Pigment Studio</h2>
		</div>
		<div class="toolbar" aria-label="Artwork actions">
			<button
				type="button"
				class="primary"
				onclick={togglePause}
				disabled={studioState !== 'ready'}
			>
				{paused ? 'Resume' : 'Pause'}
			</button>
			<button type="button" onclick={singleStep} disabled={studioState !== 'ready'}>Step</button>
			<button type="button" onclick={undo} disabled={!undoAvailable}>Undo</button>
			<button type="button" onclick={redo} disabled={!redoAvailable}>Redo</button>
			<button type="button" onclick={dryArtwork} disabled={studioState !== 'ready'}
				>Dry artwork</button
			>
			<button type="button" onclick={randomBackground} disabled={studioState !== 'ready'}
				>Random background</button
			>
			<div class="save-menu" bind:this={saveMenuContainer} role="group" aria-label="Artwork saving">
				<button
					bind:this={saveMenuTrigger}
					type="button"
					aria-expanded={saveMenuOpen}
					aria-controls={`${uid}-save-menu-panel`}
					disabled={busy || studioState !== 'ready'}
					onclick={() => setSaveMenuOpen(!saveMenuOpen)}
				>
					Save artwork
				</button>
			</div>
			<button type="button" onclick={clearArtwork} disabled={studioState !== 'ready'}>Clear</button>
			<button type="button" onclick={toggleFullscreen}
				>{isFullscreen ? 'Exit full screen' : 'Fullscreen'}</button
			>
			<button
				bind:this={controlsToggle}
				type="button"
				class="controls-toggle"
				onclick={() => setControlsOpen(!controlsOpen)}
				aria-expanded={controlsOpen}
				aria-controls={`${uid}-controls-panel`}
			>
				{controlsOpen ? 'Hide controls' : 'Controls'}
			</button>
		</div>
	</header>

	{#if saveMenuOpen}
		<div
			bind:this={saveMenuPanel}
			id={`${uid}-save-menu-panel`}
			class="save-menu-panel"
			role="group"
			aria-label="Save and export options"
		>
			<button
				type="button"
				onclick={() => exportArtwork('image/png', 1)}
				disabled={busy || studioState !== 'ready'}>Export PNG</button
			>
			<button
				type="button"
				onclick={() => exportArtwork('image/png', 2)}
				disabled={busy || studioState !== 'ready'}>Export 2× PNG</button
			>
			<button
				type="button"
				onclick={() => exportArtwork('image/webp', 1)}
				disabled={busy || studioState !== 'ready'}>Export WebP</button
			>
			<button type="button" onclick={copyArtwork} disabled={busy || studioState !== 'ready'}
				>Copy image</button
			>
			<button type="button" onclick={saveProject} disabled={busy || studioState !== 'ready'}
				>Save project</button
			>
			<button
				type="button"
				onclick={() => projectInput.click()}
				disabled={busy || studioState !== 'ready'}>Load project</button
			>
			<p>Files stay on this device. Nothing is uploaded.</p>
		</div>
	{/if}

	<input
		bind:this={projectInput}
		type="file"
		accept=".livingpigment,.gz,application/octet-stream,application/gzip"
		class="sr-only"
		disabled={busy || studioState !== 'ready'}
		onchange={loadProject}
		aria-label="Load a Living Pigment Studio project file"
	/>

	<div class="studio-grid">
		<div class="canvas-column">
			<div bind:this={canvasHost} class="canvas-host">
				<img
					src="/images/create-art-living-pigment-studio.webp"
					alt=""
					class:visible={studioState !== 'ready'}
					class="poster"
				/>
				<canvas
					bind:this={canvas}
					class:inactive={studioState !== 'ready'}
					tabindex={studioState === 'ready' ? 0 : -1}
					aria-hidden={studioState === 'ready' ? undefined : 'true'}
					aria-label="Living pigment painting surface"
					aria-describedby={`${uid}-canvas-instructions`}
					onpointerdown={handlePointerDown}
					onpointermove={handlePointerMove}
					onpointerenter={updateCursor}
					onpointerleave={() => activePointerId === null && (cursorVisible = false)}
					onpointerup={finishPointer}
					onpointercancel={finishPointer}
					onlostpointercapture={finishPointer}
				>
					The live painting surface requires WebGL2 and pointing input.
				</canvas>
				{#if cursorVisible && studioState === 'ready'}
					<div
						class="brush-cursor"
						style={`left:${cursorX}px;top:${cursorY}px;width:${settings.brushSize * 2}px;height:${settings.brushSize * 2}px`}
						aria-hidden="true"
					></div>
				{/if}
				{#if studioState === 'idle' || studioState === 'loading'}
					<div class="loading-state">
						<div class="loading-swatch" aria-hidden="true"></div>
						<p>
							{diagnostics.contextLost
								? 'Restoring the pigment surface after a graphics interruption…'
								: 'Preparing the pigment surface…'}
						</p>
						{#if studioState === 'idle'}
							<button type="button" onclick={beginLoading}>Load interactive studio</button>
						{/if}
					</div>
				{:else if studioState === 'fallback' || studioState === 'error'}
					<div class="fallback-state" role="status">
						<strong>Live pigment is unavailable</strong>
						<p>{status} The complete article and static artwork remain available.</p>
						<button type="button" onclick={() => location.reload()}>Try again</button>
					</div>
				{/if}
				{#if settings.overlay !== 'artwork' && studioState === 'ready'}
					<div class="overlay-legend">
						<strong>Physics view: {settings.overlay}</strong>
						<span>{overlayDescriptions[settings.overlay]}</span>
					</div>
				{/if}
				<noscript>
					<p class="noscript-message">
						JavaScript is disabled. The article and poster remain readable, but the live painting
						surface cannot run.
					</p>
				</noscript>
			</div>

			<p id={`${uid}-canvas-instructions`} class="canvas-instructions">
				Draw with a mouse, finger, trackpad, or stylus. The canvas requires pointing input. Press
				Space to pause; B selects the round brush, E the lifter, W the water brush, brackets resize
				the brush, and modifier-Z controls undo.
			</p>

			<div class="status-strip" aria-label="Studio status">
				<span><b>Mode</b> {modeLabel}</span>
				<span><b>Simulation</b> {diagnostics.resolution}</span>
				<span><b>FPS</b> {diagnostics.fps || '—'}</span>
				<span><b>State</b> {simulationStateLabel}</span>
				<span><b>Pressure</b> {pressureDetected ? 'Detected' : 'Default'}</span>
			</div>

			<p class="live-status" aria-live="polite">{status}</p>

			<details class="performance-panel">
				<summary>Info and performance</summary>
				<div>
					<p>
						Three ping-pong fields run at {diagnostics.resolution} in {diagnostics.textureFormat}.
						The display canvas resizes independently, so normal layout changes preserve the artwork.
					</p>
					<p>
						Reduced motion starts paused. Hidden and offscreen studios stop requesting frames. High
						quality uses more GPU memory; Low is intended for battery-limited devices.
					</p>
					{#if developerLog}
						<details>
							<summary>Developer diagnostics</summary>
							<pre>{developerLog}</pre>
						</details>
					{/if}
				</div>
			</details>
		</div>

		{#if controlsOpen && compactLayout}
			<button
				type="button"
				class="controls-backdrop"
				tabindex="-1"
				aria-label="Close studio controls"
				onclick={() => setControlsOpen(false, true)}
			></button>
		{/if}

		<aside
			bind:this={controlsPanel}
			id={`${uid}-controls-panel`}
			class:open={controlsOpen}
			class="controls-column"
			role={compactLayout ? 'dialog' : undefined}
			aria-modal={compactLayout && controlsOpen ? 'true' : undefined}
			aria-labelledby={compactLayout ? `${uid}-mobile-controls-title` : undefined}
			onkeydown={handleControlsKeydown}
		>
			<div class="mobile-controls-header">
				<strong id={`${uid}-mobile-controls-title`}>Studio controls</strong>
				<button type="button" class="controls-close" onclick={() => setControlsOpen(false, true)}>
					Close
				</button>
			</div>
			<StudioControls
				{settings}
				presets={STUDIO_PRESETS}
				{customColor}
				{recentColors}
				onsettings={handleSettings}
				oncustomcolor={handleCustomColor}
				onpreset={handlePreset}
				onrandompalette={randomPalette}
				onsurprise={surprise}
				onnewbackground={applyConfiguredBackground}
				onresetcontrols={resetControls}
			/>
		</aside>
	</div>
</section>

<style>
	.living-pigment-studio {
		--studio-paper: #eee6d9;
		--studio-ink: #2c2824;
		--studio-border: #8b7968;
		margin-left: max(-47rem, calc(-50vw + 0.5rem));
	}

	.studio-header {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid #5f544b;
		background: linear-gradient(135deg, #29241f, #181614 72%);
	}

	.title-block p {
		margin: 0 0 0.2rem;
		color: #d7bd9f;
		font-size: 0.66rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.title-block h2 {
		margin: 0;
		color: #fffaf2;
		font-size: clamp(1.1rem, 2vw, 1.55rem);
		line-height: 1.1;
	}

	.toolbar {
		display: flex;
		gap: 0.4rem;
		overflow-x: auto;
		padding-bottom: 0.15rem;
	}

	.toolbar button,
	.save-menu-panel button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		white-space: nowrap;
		border: 1px solid #6f6359;
		border-radius: 0.55rem;
		background: #342f2a;
		padding: 0.5rem 0.72rem;
		color: #f6eee3;
		font-size: 0.76rem;
		font-weight: 750;
		cursor: pointer;
	}

	.toolbar button:hover,
	.save-menu-panel button:hover {
		background: #473f37;
	}

	.toolbar button:focus-visible,
	.save-menu-panel button:focus-visible,
	.canvas-host canvas:focus-visible {
		outline: 2px solid #f3d3a6;
		outline-offset: 2px;
	}

	.toolbar button:disabled,
	.save-menu-panel button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.toolbar .primary {
		border-color: #d2ae80;
		background: #80563d;
	}

	.save-menu {
		position: relative;
		flex: none;
	}

	.save-menu-panel {
		position: absolute;
		z-index: 60;
		display: grid;
		width: min(18rem, calc(100vw - 2rem));
		box-sizing: border-box;
		gap: 0.4rem;
		overflow: auto;
		overscroll-behavior: contain;
		border: 1px solid #78695c;
		border-radius: 0.75rem;
		background: #221f1c;
		padding: 0.6rem;
		box-shadow: 0 1rem 2rem #0008;
	}

	.save-menu-panel button {
		width: 100%;
	}

	.save-menu-panel p {
		margin: 0.3rem;
		color: #cfc2b5;
		font-size: 0.7rem;
		line-height: 1.45;
	}

	.studio-grid {
		display: grid;
		background: #191715;
	}

	.canvas-column {
		min-width: 0;
		padding: 0.6rem;
	}

	.canvas-host {
		position: relative;
		min-height: clamp(24rem, 68vh, 54rem);
		overflow: hidden;
		border: 1px solid #77695d;
		border-radius: 0.8rem;
		background: #e8dfce;
		box-shadow: inset 0 0 3rem #604e3526;
		user-select: none;
	}

	.canvas-host canvas,
	.poster {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.canvas-host canvas {
		z-index: 2;
		touch-action: none;
		cursor: none;
	}

	.canvas-host canvas.inactive {
		opacity: 0;
		pointer-events: none;
	}

	.poster {
		z-index: 1;
		opacity: 0;
		transition: opacity 180ms ease;
	}

	.poster.visible {
		opacity: 1;
	}

	.brush-cursor {
		position: absolute;
		z-index: 6;
		pointer-events: none;
		border: 1px solid #fff;
		border-radius: 999px;
		box-shadow: 0 0 0 1px #201810b3;
		transform: translate(-50%, -50%);
	}

	.loading-state,
	.fallback-state {
		position: absolute;
		z-index: 8;
		inset: 0;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 0.7rem;
		background: #201b17a8;
		padding: 1rem;
		text-align: center;
		backdrop-filter: blur(3px);
	}

	.loading-state p,
	.fallback-state p {
		max-width: 30rem;
		margin: 0;
		color: #fff6e9;
		font-size: 0.9rem;
		line-height: 1.55;
	}

	.loading-state button,
	.fallback-state button {
		min-height: 2.75rem;
		border: 1px solid #f2d6b5;
		border-radius: 999px;
		background: #2d261fdd;
		padding: 0.55rem 1rem;
		color: white;
		font-weight: 750;
	}

	.loading-swatch {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 50% 44% 58% 41%;
		background: radial-gradient(circle at 35% 30%, #6689a7, #45576d 45%, #9c5c42 72%);
		box-shadow: 1.3rem 0.8rem 1.2rem #c3925766;
	}

	.overlay-legend {
		position: absolute;
		z-index: 7;
		right: 0.75rem;
		bottom: 0.75rem;
		display: grid;
		max-width: min(23rem, calc(100% - 1.5rem));
		gap: 0.15rem;
		border: 1px solid #ffffff4d;
		border-radius: 0.55rem;
		background: #181512dd;
		padding: 0.55rem 0.7rem;
		color: #f9eee0;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	.noscript-message {
		position: absolute;
		z-index: 10;
		inset-inline: 0;
		bottom: 0;
		margin: 0;
		background: #191512ed;
		padding: 0.8rem;
		color: #fff;
	}

	.canvas-instructions,
	.live-status {
		margin: 0;
		padding: 0.55rem 0.2rem 0;
		color: #c8bdb2;
		font-size: 0.72rem;
		line-height: 1.55;
	}

	.status-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.9rem;
		margin-top: 0.55rem;
		border-block: 1px solid #4e4640;
		padding: 0.55rem 0.2rem;
		color: #d9cec2;
		font-size: 0.68rem;
	}

	.status-strip b {
		margin-right: 0.2rem;
		color: #fff7eb;
	}

	.performance-panel {
		margin-top: 0.65rem;
		border: 1px solid #4d4640;
		border-radius: 0.55rem;
		background: #211e1b;
		color: #d5c9bd;
		font-size: 0.72rem;
	}

	.performance-panel summary {
		min-height: 2.75rem;
		padding: 0.75rem;
		font-weight: 750;
		cursor: pointer;
	}

	.performance-panel > div {
		padding: 0 0.75rem 0.75rem;
	}

	.performance-panel p {
		margin: 0 0 0.5rem;
		line-height: 1.5;
	}

	.performance-panel pre {
		max-height: 12rem;
		overflow: auto;
		white-space: pre-wrap;
	}

	.controls-column {
		display: none;
		background: var(--studio-paper);
		color: var(--studio-ink);
	}

	.controls-column.open {
		display: block;
		position: fixed;
		z-index: 51;
		right: max(0.5rem, env(safe-area-inset-right));
		bottom: max(0.5rem, env(safe-area-inset-bottom));
		left: max(0.5rem, env(safe-area-inset-left));
		max-height: min(82dvh, 48rem);
		overflow: auto;
		overscroll-behavior: contain;
		border: 1px solid #8b7968;
		border-radius: 0.9rem;
		box-shadow: 0 1.5rem 4rem #0009;
	}

	.controls-backdrop {
		position: fixed;
		z-index: 50;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: #100d0a99;
		backdrop-filter: blur(2px);
		cursor: pointer;
	}

	/* A zero-distance reveal transform still becomes the containing block for fixed children. */
	:global(body.pigment-controls-open .page-enter),
	:global(body.pigment-controls-open .reveal) {
		animation: none !important;
		transform: none !important;
	}

	.mobile-controls-header {
		position: sticky;
		z-index: 3;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid #b9aa96;
		background: #e6dac9;
		padding: 0.65rem 0.8rem;
		color: #29241e;
	}

	.mobile-controls-header strong {
		font-size: 0.82rem;
	}

	.controls-close {
		min-height: 2.75rem;
		border: 1px solid #8c7963;
		border-radius: 0.55rem;
		background: #fffaf2;
		padding: 0.45rem 0.8rem;
		color: #352d25;
		font-size: 0.72rem;
		font-weight: 800;
		cursor: pointer;
	}

	.living-pigment-studio:fullscreen {
		left: 0;
		width: 100vw;
		height: 100vh;
		margin: 0;
		border: 0;
		border-radius: 0;
	}

	.living-pigment-studio:fullscreen .studio-grid {
		height: calc(100vh - 6rem);
	}

	.living-pigment-studio:fullscreen .canvas-host {
		height: calc(100vh - 13rem);
		min-height: 20rem;
	}

	@media (min-width: 62rem) {
		.studio-header {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.toolbar {
			justify-content: flex-end;
		}

		.controls-toggle {
			display: none !important;
		}

		.studio-grid {
			grid-template-columns: minmax(0, 1fr) minmax(19rem, 23rem);
		}

		.controls-column,
		.controls-column.open {
			display: block;
			position: static;
			z-index: auto;
			inset: auto;
			max-height: calc(100vh - 9rem);
			overflow: auto;
			border: 0;
			border-radius: 0;
			border-top: 0;
			border-left: 1px solid #65594f;
			box-shadow: none;
		}

		.controls-backdrop,
		.mobile-controls-header {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.poster {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.living-pigment-studio,
		.canvas-host,
		.toolbar button {
			border-color: CanvasText;
		}

		.brush-cursor {
			border: 2px solid Highlight;
		}
	}
</style>
