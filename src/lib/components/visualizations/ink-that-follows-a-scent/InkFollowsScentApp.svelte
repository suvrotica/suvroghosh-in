<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		CONSTRAINED_PARTICLE_COUNT,
		DEFAULT_SEED,
		DEFAULT_SETTINGS,
		DESKTOP_PARTICLE_COUNT,
		FIXED_TIMESTEP,
		INK_SCENT_PRESETS,
		InkFollowsScentEngine,
		LOGICAL_HEIGHT,
		LOGICAL_WIDTH,
		PRESET_ORDER,
		TRAIL_HEIGHT,
		TRAIL_WIDTH,
		renderRunToRgba,
		type PresetId,
		type ToolMode
	} from '$lib/visualizations/ink-that-follows-a-scent';

	interface Props {
		initialReducedMotion?: boolean;
	}

	let { initialReducedMotion = false }: Props = $props();

	function selectInitialParticleCount(): number {
		if (typeof window === 'undefined') return DESKTOP_PARTICLE_COUNT;
		const narrowViewport = window.innerWidth < 680;
		const lowCores =
			typeof navigator !== 'undefined' &&
			typeof navigator.hardwareConcurrency === 'number' &&
			navigator.hardwareConcurrency <= 4;
		return narrowViewport || lowCores ? CONSTRAINED_PARTICLE_COUNT : DESKTOP_PARTICLE_COUNT;
	}

	const initialParticleCount = selectInitialParticleCount();
	const engine = new InkFollowsScentEngine({
		presetId: 'one-source',
		seed: DEFAULT_SEED,
		particleCount: initialParticleCount
	});

	const startReducedMotion = untrack(() => initialReducedMotion);
	if (startReducedMotion) {
		engine.step(Math.round(12 / FIXED_TIMESTEP));
	}

	const onRgbaBuffer = new Uint8ClampedArray(TRAIL_WIDTH * TRAIL_HEIGHT * 4);
	const offRgbaBuffer = new Uint8ClampedArray(TRAIL_WIDTH * TRAIL_HEIGHT * 4);

	let isRunning = $state<boolean>(!startReducedMotion);
	let reducedMotion = $state<boolean>(startReducedMotion);
	let isVisibleInViewport = $state<boolean>(true);
	let isDocumentVisible = $state<boolean>(true);

	let presetId = $state<PresetId>('one-source');
	let toolMode = $state<ToolMode>('paint');
	let comparisonMode = $state<boolean>(false);
	let sensingEnabled = $state<boolean>(true);
	let showChemical = $state<boolean>(false);

	let sensitivity = $state<number>(DEFAULT_SETTINGS.sensitivity);
	let randomWandering = $state<number>(DEFAULT_SETTINGS.randomWandering);
	let trailDuration = $state<number>(DEFAULT_SETTINGS.trailDuration);
	let brushSize = $state<number>(DEFAULT_SETTINGS.brushSize);

	let simulationTime = $state<number>(engine.simulationTime);
	let stepCount = $state<number>(engine.stepCount);
	let sourceX = $state<number>(engine.field.sourceX);
	let sourceY = $state<number>(engine.field.sourceY);
	let sourceActive = $state<boolean>(engine.field.sourceActive);
	let avgChemicalOn = $state<number>(engine.sensingOnRun.averageChemical);
	let avgChemicalOff = $state<number>(engine.sensingOffRun.averageChemical);

	let liveSwitchBanner = $state<string>('');
	let resetBanner = $state<string>('');
	let politeAnnouncement = $state<string>('Simulation ready.');
	let sourceHandleFocused = $state<boolean>(false);

	let pointerHover = $state<{
		active: boolean;
		xPercent: number;
		yPercent: number;
	}>({
		active: false,
		xPercent: 50,
		yPercent: 50
	});

	let activeStroke: {
		pointerId: number;
		mode: 'paint' | 'erase' | 'source';
		lastX: number;
		lastY: number;
	} | null = null;
	let isDraggingSource = $state<boolean>(false);

	let rootEl: HTMLElement | undefined = $state();
	let sensingOnCanvas: HTMLCanvasElement | undefined = $state();
	let sensingOffCanvas: HTMLCanvasElement | undefined = $state();

	let rafId: number | null = null;
	let lastFrameTimeMs: number | null = null;
	let timeAccumulator = 0;

	const statusText = $derived.by(() => {
		const runState = isRunning ? 'Running' : 'Paused';
		if (comparisonMode) {
			return `${runState} · Paired comparison`;
		}
		return `${runState} · Sensing ${sensingEnabled ? 'on' : 'off'}`;
	});

	const dialAngleDeg = $derived(-135 + (sensitivity / 2.5) * 270);
	const sourceLeftPercent = $derived((sourceX / LOGICAL_WIDTH) * 100);
	const sourceTopPercent = $derived((sourceY / LOGICAL_HEIGHT) * 100);
	const brushWidthPercent = $derived(((brushSize * 2.4) / LOGICAL_WIDTH) * 100);
	const brushHeightPercent = $derived(((brushSize * 2.4) / LOGICAL_HEIGHT) * 100);

	function syncUiFromEngine(): void {
		simulationTime = engine.simulationTime;
		stepCount = engine.stepCount;
		sourceX = engine.field.sourceX;
		sourceY = engine.field.sourceY;
		sourceActive = engine.field.sourceActive;
		avgChemicalOn = engine.sensingOnRun.averageChemical;
		avgChemicalOff = engine.sensingOffRun.averageChemical;
	}

	function blitBufferToCanvas(
		canvas: HTMLCanvasElement | undefined,
		rgba: Uint8ClampedArray
	): void {
		if (!canvas) return;
		if (canvas.width !== TRAIL_WIDTH || canvas.height !== TRAIL_HEIGHT) {
			canvas.width = TRAIL_WIDTH;
			canvas.height = TRAIL_HEIGHT;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const imageData = ctx.createImageData(TRAIL_WIDTH, TRAIL_HEIGHT);
		imageData.data.set(rgba);
		ctx.putImageData(imageData, 0, 0);
	}

	function renderCanvases(): void {
		renderRunToRgba(
			engine.sensingOnRun,
			engine.field,
			{ showChemical, showParticles: true },
			onRgbaBuffer
		);
		blitBufferToCanvas(sensingOnCanvas, onRgbaBuffer);

		if (comparisonMode && sensingOffCanvas) {
			renderRunToRgba(
				engine.sensingOffRun,
				engine.field,
				{ showChemical, showParticles: true },
				offRgbaBuffer
			);
			blitBufferToCanvas(sensingOffCanvas, offRgbaBuffer);
		}
	}

	function stopAnimationLoop(): void {
		if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		lastFrameTimeMs = null;
	}

	function scheduleNextFrame(): void {
		if (rafId !== null || typeof requestAnimationFrame === 'undefined') return;
		if (!isRunning || !isVisibleInViewport || !isDocumentVisible) return;

		rafId = requestAnimationFrame((nowMs) => {
			rafId = null;
			if (!isRunning || !isVisibleInViewport || !isDocumentVisible) {
				lastFrameTimeMs = null;
				return;
			}

			if (lastFrameTimeMs === null) {
				lastFrameTimeMs = nowMs;
			}
			const elapsedSec = Math.min(0.08, Math.max(0, (nowMs - lastFrameTimeMs) / 1000));
			lastFrameTimeMs = nowMs;
			timeAccumulator += elapsedSec;

			let stepsToRun = Math.floor(timeAccumulator / FIXED_TIMESTEP);
			if (stepsToRun > 3) {
				stepsToRun = 3;
				timeAccumulator = 0;
			} else if (stepsToRun > 0) {
				timeAccumulator -= stepsToRun * FIXED_TIMESTEP;
			}

			if (stepsToRun > 0) {
				engine.step(stepsToRun);
				syncUiFromEngine();
				renderCanvases();
			}

			scheduleNextFrame();
		});
	}

	function selectPreset(nextPreset: PresetId): void {
		presetId = nextPreset;
		sensingEnabled = true;
		liveSwitchBanner = '';
		engine.loadPreset(nextPreset);
		if (reducedMotion && !isRunning) {
			engine.step(Math.round(12 / FIXED_TIMESTEP));
		}
		syncUiFromEngine();
		renderCanvases();
		const label = INK_SCENT_PRESETS[nextPreset].label;
		resetBanner = `Reset: started a fresh experiment with ${label}.`;
		politeAnnouncement = resetBanner;
	}

	function togglePause(): void {
		isRunning = !isRunning;
		resetBanner = '';
		if (isRunning) {
			politeAnnouncement = 'Simulation running.';
			lastFrameTimeMs = null;
			timeAccumulator = 0;
			scheduleNextFrame();
		} else {
			politeAnnouncement = 'Simulation paused. Trail fading is frozen.';
			stopAnimationLoop();
			renderCanvases();
		}
	}

	function handleRestart(): void {
		liveSwitchBanner = '';
		engine.restart();
		if (reducedMotion && !isRunning) {
			engine.step(Math.round(12 / FIXED_TIMESTEP));
		}
		syncUiFromEngine();
		renderCanvases();
		resetBanner = 'Restarted from the beginning with the current chemical landscape and settings.';
		politeAnnouncement = resetBanner;
	}

	function handleToggleSensing(): void {
		const next = !sensingEnabled;
		sensingEnabled = next;
		engine.setSensingEnabled(next);
		resetBanner = '';
		if (!next) {
			liveSwitchBanner = 'Sensing is now off. Earlier movement is still visible.';
			politeAnnouncement = liveSwitchBanner;
		} else {
			liveSwitchBanner = '';
			politeAnnouncement = 'Sensing is now on.';
		}
	}

	function handleStartComparison(): void {
		comparisonMode = true;
		sensingEnabled = true;
		liveSwitchBanner = '';
		if (sensitivity <= 0) {
			sensitivity = DEFAULT_SETTINGS.sensitivity;
			engine.updateSettings({ sensitivity });
		}
		engine.startPairedComparison();
		if (reducedMotion && !isRunning) {
			engine.step(Math.round(12 / FIXED_TIMESTEP));
		} else {
			isRunning = true;
		}
		syncUiFromEngine();
		renderCanvases();
		resetBanner = 'Started fresh paired comparison from the same starting positions.';
		politeAnnouncement =
			'Comparison mode active: same starting points, same random nudges, sensing on versus off.';
		if (isRunning) {
			scheduleNextFrame();
		}
	}

	function handleExitComparison(): void {
		comparisonMode = false;
		resetBanner = '';
		renderCanvases();
		politeAnnouncement = 'Returned to single exploration canvas.';
	}

	function handleToggleShowChemical(): void {
		showChemical = !showChemical;
		renderCanvases();
		politeAnnouncement = showChemical
			? 'Chemical concentration overlay visible.'
			: 'Chemical concentration overlay hidden.';
	}

	function handleClearChemical(): void {
		engine.clearChemical();
		syncUiFromEngine();
		renderCanvases();
		resetBanner = 'Cleared chemical landscape. Earlier ink trails remain until they fade.';
		politeAnnouncement = resetBanner;
	}

	function handleClearTrails(): void {
		engine.clearTrails();
		syncUiFromEngine();
		renderCanvases();
		resetBanner = 'Cleared trail drawing. Particle positions and chemical field are preserved.';
		politeAnnouncement = resetBanner;
	}

	function handleSensitivityChange(event: Event): void {
		const next = Number((event.currentTarget as HTMLInputElement).value);
		sensitivity = next;
		engine.updateSettings({ sensitivity: next });
		syncUiFromEngine();
	}

	function handleWanderingChange(event: Event): void {
		const next = Number((event.currentTarget as HTMLInputElement).value);
		randomWandering = next;
		engine.updateSettings({ randomWandering: next });
		syncUiFromEngine();
	}

	function handleTrailDurationChange(event: Event): void {
		const next = Number((event.currentTarget as HTMLInputElement).value);
		trailDuration = next;
		engine.updateSettings({ trailDuration: next });
		syncUiFromEngine();
	}

	function handleBrushSizeChange(event: Event): void {
		const next = Number((event.currentTarget as HTMLInputElement).value);
		brushSize = next;
		engine.updateSettings({ brushSize: next });
	}

	function logicalCoordsFromPointer(
		event: PointerEvent,
		container: HTMLElement
	): { x: number; y: number; xPercent: number; yPercent: number } {
		const rect = container.getBoundingClientRect();
		const width = Math.max(1, rect.width);
		const height = Math.max(1, rect.height);
		const normX = Math.min(1, Math.max(0, (event.clientX - rect.left) / width));
		const normY = Math.min(1, Math.max(0, (event.clientY - rect.top) / height));
		return {
			x: normX * LOGICAL_WIDTH,
			y: normY * LOGICAL_HEIGHT,
			xPercent: normX * 100,
			yPercent: normY * 100
		};
	}

	function handleCanvasPointerDown(event: PointerEvent): void {
		if (event.button !== 0 && event.pointerType === 'mouse') return;
		const frame = event.currentTarget as HTMLElement;
		const coords = logicalCoordsFromPointer(event, frame);
		pointerHover = {
			active: toolMode === 'paint' || toolMode === 'erase',
			xPercent: coords.xPercent,
			yPercent: coords.yPercent
		};

		try {
			frame.setPointerCapture(event.pointerId);
		} catch {
			// Ignore capture errors in synthetic test dispatches
		}

		resetBanner = '';
		if (toolMode === 'move-source') {
			activeStroke = {
				pointerId: event.pointerId,
				mode: 'source',
				lastX: coords.x,
				lastY: coords.y
			};
			isDraggingSource = true;
			engine.moveSource(coords.x, coords.y);
		} else if (toolMode === 'erase') {
			activeStroke = {
				pointerId: event.pointerId,
				mode: 'erase',
				lastX: coords.x,
				lastY: coords.y
			};
			engine.eraseChemical(coords.x, coords.y, coords.x, coords.y, brushSize);
		} else {
			activeStroke = {
				pointerId: event.pointerId,
				mode: 'paint',
				lastX: coords.x,
				lastY: coords.y
			};
			engine.paintChemical(coords.x, coords.y, coords.x, coords.y, brushSize);
		}

		syncUiFromEngine();
		renderCanvases();
	}

	function handleCanvasPointerMove(event: PointerEvent): void {
		const frame = event.currentTarget as HTMLElement;
		const coords = logicalCoordsFromPointer(event, frame);
		pointerHover = {
			active: toolMode === 'paint' || toolMode === 'erase',
			xPercent: coords.xPercent,
			yPercent: coords.yPercent
		};

		if (!activeStroke || activeStroke.pointerId !== event.pointerId) return;

		if (activeStroke.mode === 'source') {
			engine.moveSource(coords.x, coords.y);
		} else if (activeStroke.mode === 'erase') {
			engine.eraseChemical(activeStroke.lastX, activeStroke.lastY, coords.x, coords.y, brushSize);
		} else {
			engine.paintChemical(activeStroke.lastX, activeStroke.lastY, coords.x, coords.y, brushSize);
		}

		activeStroke.lastX = coords.x;
		activeStroke.lastY = coords.y;
		syncUiFromEngine();
		renderCanvases();
	}

	function handleCanvasPointerUp(event: PointerEvent): void {
		if (activeStroke && activeStroke.pointerId === event.pointerId) {
			activeStroke = null;
			isDraggingSource = false;
		}
	}

	function handleCanvasPointerLeave(): void {
		pointerHover = { ...pointerHover, active: false };
	}

	function handleSourceHandlePointerDown(event: PointerEvent): void {
		event.stopPropagation();
		const handle = event.currentTarget as HTMLElement;
		const frame = handle.closest('.ink-scent-canvas-frame') as HTMLElement | null;
		if (!frame) return;

		const coords = logicalCoordsFromPointer(event, frame);
		activeStroke = {
			pointerId: event.pointerId,
			mode: 'source',
			lastX: coords.x,
			lastY: coords.y
		};
		isDraggingSource = true;

		try {
			frame.setPointerCapture(event.pointerId);
		} catch {
			// Ignore capture errors in synthetic test dispatches
		}

		engine.moveSource(coords.x, coords.y);
		syncUiFromEngine();
		renderCanvases();
	}

	function handleSourceHandleKeyDown(event: KeyboardEvent): void {
		const step = event.shiftKey ? 16 : 6;
		let nextX = sourceX;
		let nextY = sourceY;

		if (event.key === 'ArrowLeft') {
			nextX -= step;
		} else if (event.key === 'ArrowRight') {
			nextX += step;
		} else if (event.key === 'ArrowUp') {
			nextY -= step;
		} else if (event.key === 'ArrowDown') {
			nextY += step;
		} else {
			return;
		}

		event.preventDefault();
		engine.moveSource(nextX, nextY);
		syncUiFromEngine();
		renderCanvases();
		politeAnnouncement = `Moved chemical source to (${Math.round(sourceX)}, ${Math.round(sourceY)}).`;
	}

	$effect(() => {
		const showComparison = comparisonMode;
		const showChem = showChemical;
		if (sensingOnCanvas || (showComparison && sensingOffCanvas)) {
			void showChem;
			renderCanvases();
		}
	});

	onMount(() => {
		renderCanvases();

		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const handleMotionChange = (e: MediaQueryListEvent) => {
			reducedMotion = e.matches;
			if (e.matches && isRunning) {
				isRunning = false;
				stopAnimationLoop();
				politeAnnouncement = 'Paused because reduced motion is enabled.';
			}
		};
		mediaQuery.addEventListener('change', handleMotionChange);

		const handleVisibilityChange = () => {
			isDocumentVisible = document.visibilityState === 'visible';
			if (!isDocumentVisible) {
				stopAnimationLoop();
			} else if (isRunning) {
				scheduleNextFrame();
			}
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);

		let intersectionObserver: IntersectionObserver | null = null;
		if (typeof IntersectionObserver !== 'undefined' && rootEl) {
			intersectionObserver = new IntersectionObserver(
				(entries) => {
					const entry = entries[0];
					if (!entry) return;
					isVisibleInViewport = entry.isIntersecting;
					if (!isVisibleInViewport) {
						stopAnimationLoop();
					} else if (isRunning) {
						scheduleNextFrame();
					}
				},
				{ threshold: 0.05 }
			);
			intersectionObserver.observe(rootEl);
		}

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined' && rootEl) {
			resizeObserver = new ResizeObserver(() => {
				// Resizing re-blits the fixed logical/trail buffers without altering the simulation
				renderCanvases();
			});
			resizeObserver.observe(rootEl);
		}

		if (isRunning) {
			scheduleNextFrame();
		}

		return () => {
			stopAnimationLoop();
			mediaQuery.removeEventListener('change', handleMotionChange);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			intersectionObserver?.disconnect();
			resizeObserver?.disconnect();
		};
	});
</script>

<div class="ink-scent-enclosure" bind:this={rootEl} data-testid="ink-scent-interactive">
	<div class="ink-scent-sr-only" aria-live="polite" aria-atomic="true">
		{politeAnnouncement}
	</div>

	<div class="ink-scent-chassis">
		<!-- Top bar: Presets + illuminated warm status detail -->
		<div class="ink-scent-seam-bar">
			<div class="ink-scent-presets" role="group" aria-label="Experiment presets">
				<span class="ink-scent-group-label">Presets:</span>
				{#each PRESET_ORDER as id (id)}
					<button
						type="button"
						class="ink-scent-btn {presetId === id ? 'active' : ''}"
						aria-pressed={presetId === id}
						data-testid="preset-{id}"
						onclick={() => selectPreset(id)}
					>
						{INK_SCENT_PRESETS[id].label}
					</button>
				{/each}
			</div>

			<div class="ink-scent-status-cluster">
				<span class="ink-scent-light-strip {isRunning ? '' : 'paused'}" aria-hidden="true"></span>
				<div class="ink-scent-status-pill" data-testid="simulation-status">
					<span class="ink-scent-status-dot {isRunning ? '' : 'paused'}" aria-hidden="true"></span>
					<span>{statusText}</span>
					<span aria-hidden="true">·</span>
					<span>t = {simulationTime.toFixed(1)} s</span>
				</div>
			</div>
		</div>

		<div class="ink-scent-workbench">
			<!-- Primary Canvas Column (~3/4 width on desktop, first on mobile) -->
			<div class="ink-scent-stage-col">
				<div class="ink-scent-stage-header">
					<div class="ink-scent-stage-actions">
						<button
							type="button"
							class="ink-scent-btn {comparisonMode ? 'active' : ''}"
							aria-pressed={comparisonMode}
							data-testid="compare-from-same-start-btn"
							onclick={handleStartComparison}
						>
							Compare from same start
						</button>

						{#if comparisonMode}
							<button
								type="button"
								class="ink-scent-btn"
								data-testid="exit-comparison-btn"
								onclick={handleExitComparison}
							>
								Single view
							</button>
						{/if}

						<button
							type="button"
							class="ink-scent-btn {showChemical ? 'active' : ''}"
							aria-pressed={showChemical}
							data-testid="show-chemical-btn"
							onclick={handleToggleShowChemical}
						>
							Show chemical
						</button>
					</div>

					<span style="font-size: 0.8rem; color: var(--ifs-muted);">
						{initialParticleCount.toLocaleString('en-GB')} independent particles · 256 × 192 field
					</span>
				</div>

				{#if comparisonMode}
					<p class="ink-scent-notice" data-testid="comparison-explanation">
						Same starting points. Same random nudges. Sensing on versus off.
					</p>
				{/if}

				{#if !comparisonMode && liveSwitchBanner}
					<p class="ink-scent-notice" data-testid="live-sensing-off-banner">
						{liveSwitchBanner}
					</p>
				{/if}

				{#if resetBanner}
					<p class="ink-scent-notice" data-testid="reset-banner">
						{resetBanner}
					</p>
				{/if}

				<!-- Single or Paired 4:3 Canvas Panels -->
				<div
					class="ink-scent-canvas-grid {comparisonMode ? 'comparison' : ''}"
					data-testid="canvas-grid"
				>
					<!-- Panel 1: Sensing on (or active exploration run) -->
					<div class="ink-scent-canvas-card" data-testid="panel-sensing-on">
						<div class="ink-scent-canvas-card__bar">
							<span>
								{comparisonMode
									? 'Sensing on'
									: sensingEnabled
										? 'Sensing on'
										: 'Sensing off (live)'}
							</span>
							<span class="ink-scent-canvas-card__sub">
								Sensitivity: {comparisonMode || sensingEnabled ? sensitivity.toFixed(1) : '0.0'}
							</span>
						</div>

						<div
							class="ink-scent-canvas-frame {toolMode === 'move-source'
								? 'move-mode'
								: ''} {isDraggingSource ? 'dragging' : ''}"
							role="application"
							aria-label="Interactive chemical field canvas (sensing on)"
							data-testid="primary-canvas-frame"
							onpointerdown={handleCanvasPointerDown}
							onpointermove={handleCanvasPointerMove}
							onpointerup={handleCanvasPointerUp}
							onpointercancel={handleCanvasPointerUp}
							onpointerleave={handleCanvasPointerLeave}
						>
							<canvas
								bind:this={sensingOnCanvas}
								width={TRAIL_WIDTH}
								height={TRAIL_HEIGHT}
								aria-label="Particle trail simulation canvas (sensing on)"
								data-testid="canvas-sensing-on"
							></canvas>

							<button
								type="button"
								class="ink-scent-source-handle {sourceActive ? '' : 'inactive'}"
								style="left: {sourceLeftPercent}%; top: {sourceTopPercent}%;"
								aria-label="Chemical source handle at ({Math.round(sourceX)}, {Math.round(
									sourceY
								)}). Drag or use arrow keys to move the chemical source."
								data-testid="source-handle"
								onpointerdown={handleSourceHandlePointerDown}
								onkeydown={handleSourceHandleKeyDown}
								onfocus={() => {
									sourceHandleFocused = true;
								}}
								onblur={() => {
									sourceHandleFocused = false;
								}}
							>
								<span class="ink-scent-source-handle__ring" aria-hidden="true">
									<span class="ink-scent-source-handle__core"></span>
								</span>
							</button>

							{#if sourceHandleFocused}
								<div class="ink-scent-source-tooltip" data-testid="source-keyboard-hint">
									Use arrow keys to move the chemical source (hold Shift for larger steps).
								</div>
							{/if}

							{#if pointerHover.active && (toolMode === 'paint' || toolMode === 'erase')}
								<div
									class="ink-scent-brush-ring {toolMode === 'erase' ? 'erase' : ''}"
									style="left: {pointerHover.xPercent}%; top: {pointerHover.yPercent}%; width: {brushWidthPercent}%; height: {brushHeightPercent}%;"
									data-testid="brush-outline"
									aria-hidden="true"
								></div>
							{/if}
						</div>
					</div>

					<!-- Panel 2: Sensing off (shown in comparison mode) -->
					{#if comparisonMode}
						<div class="ink-scent-canvas-card" data-testid="panel-sensing-off">
							<div class="ink-scent-canvas-card__bar">
								<span>Sensing off</span>
								<span class="ink-scent-canvas-card__sub">Sensitivity: 0.0</span>
							</div>

							<div
								class="ink-scent-canvas-frame {toolMode === 'move-source'
									? 'move-mode'
									: ''} {isDraggingSource ? 'dragging' : ''}"
								role="application"
								aria-label="Interactive chemical field canvas (sensing off control)"
								data-testid="secondary-canvas-frame"
								onpointerdown={handleCanvasPointerDown}
								onpointermove={handleCanvasPointerMove}
								onpointerup={handleCanvasPointerUp}
								onpointercancel={handleCanvasPointerUp}
								onpointerleave={handleCanvasPointerLeave}
							>
								<canvas
									bind:this={sensingOffCanvas}
									width={TRAIL_WIDTH}
									height={TRAIL_HEIGHT}
									aria-label="Particle trail simulation canvas (sensing off control)"
									data-testid="canvas-sensing-off"
								></canvas>

								<button
									type="button"
									class="ink-scent-source-handle {sourceActive ? '' : 'inactive'}"
									style="left: {sourceLeftPercent}%; top: {sourceTopPercent}%;"
									aria-label="Chemical source handle in sensing-off panel at ({Math.round(
										sourceX
									)}, {Math.round(sourceY)}). Drag or use arrow keys to move."
									onpointerdown={handleSourceHandlePointerDown}
									onkeydown={handleSourceHandleKeyDown}
									onfocus={() => {
										sourceHandleFocused = true;
									}}
									onblur={() => {
										sourceHandleFocused = false;
									}}
								>
									<span class="ink-scent-source-handle__ring" aria-hidden="true">
										<span class="ink-scent-source-handle__core"></span>
									</span>
								</button>

								{#if pointerHover.active && (toolMode === 'paint' || toolMode === 'erase')}
									<div
										class="ink-scent-brush-ring {toolMode === 'erase' ? 'erase' : ''}"
										style="left: {pointerHover.xPercent}%; top: {pointerHover.yPercent}%; width: {brushWidthPercent}%; height: {brushHeightPercent}%;"
										aria-hidden="true"
									></div>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Fixed-scale concentration legend when Show chemical is active -->
				{#if showChemical}
					<div class="ink-scent-field-legend" data-testid="chemical-legend">
						<span>Chemical concentration map (fixed scale across panels)</span>
						<div class="ink-scent-field-legend__scale">
							<span>Low (0.0)</span>
							<span class="ink-scent-field-legend__bar" aria-hidden="true"></span>
							<span>High (1.0)</span>
						</div>
					</div>
				{/if}

				<!-- Single useful measurement below the canvas / comparison -->
				<div class="ink-scent-measurement" data-testid="measurement-panel">
					<div class="ink-scent-measurement__header">
						<h2 class="ink-scent-measurement__title">Average chemical at particle positions</h2>
						<p class="ink-scent-measurement__caption">
							Higher means particles are currently in stronger chemical.
						</p>
					</div>

					<div class="ink-scent-measurement__bars">
						<div class="ink-scent-meter-row">
							<div class="ink-scent-meter-row__label">
								<span>Sensing on</span>
								<strong data-testid="avg-chemical-on">{avgChemicalOn.toFixed(3)}</strong>
							</div>
							<div class="ink-scent-meter-track" aria-hidden="true">
								<div
									class="ink-scent-meter-fill"
									style="width: {Math.min(100, Math.max(0, avgChemicalOn * 100)).toFixed(1)}%;"
								></div>
							</div>
						</div>

						<div class="ink-scent-meter-row">
							<div class="ink-scent-meter-row__label">
								<span>Sensing off</span>
								<strong data-testid="avg-chemical-off">{avgChemicalOff.toFixed(3)}</strong>
							</div>
							<div class="ink-scent-meter-track" aria-hidden="true">
								<div
									class="ink-scent-meter-fill control"
									style="width: {Math.min(100, Math.max(0, avgChemicalOff * 100)).toFixed(1)}%;"
								></div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Compact Control Column -->
			<aside class="ink-scent-controls-col" aria-label="Simulation and drawing controls">
				<!-- Module 1: Main transport & sensing controls -->
				<div class="ink-scent-module">
					<h2 class="ink-scent-module__title">Experiment controls</h2>
					<div class="ink-scent-main-grid">
						<button
							type="button"
							class="ink-scent-btn {isRunning ? 'active' : ''}"
							data-testid="pause-resume-btn"
							onclick={togglePause}
						>
							{isRunning ? 'Pause' : 'Resume'}
						</button>

						<button
							type="button"
							class="ink-scent-btn"
							data-testid="restart-btn"
							onclick={handleRestart}
						>
							Restart
						</button>
					</div>

					{#if !comparisonMode}
						<button
							type="button"
							role="switch"
							class="ink-scent-btn {sensingEnabled ? 'active' : ''}"
							aria-checked={sensingEnabled}
							data-testid="sense-chemical-switch"
							onclick={handleToggleSensing}
						>
							Sense chemical: {sensingEnabled ? 'On' : 'Off'}
						</button>
					{/if}
				</div>

				<!-- Module 2: Drawing tools -->
				<div class="ink-scent-module">
					<h2 class="ink-scent-module__title">Chemical tools</h2>
					<div class="ink-scent-tool-grid" role="group" aria-label="Chemical landscape tools">
						<button
							type="button"
							class="ink-scent-btn {toolMode === 'paint' ? 'active' : ''}"
							aria-pressed={toolMode === 'paint'}
							data-testid="tool-paint"
							onclick={() => {
								toolMode = 'paint';
							}}
						>
							Paint chemical
						</button>

						<button
							type="button"
							class="ink-scent-btn {toolMode === 'erase' ? 'active' : ''}"
							aria-pressed={toolMode === 'erase'}
							data-testid="tool-erase"
							onclick={() => {
								toolMode = 'erase';
							}}
						>
							Erase chemical
						</button>

						<button
							type="button"
							class="ink-scent-btn {toolMode === 'move-source' ? 'active' : ''}"
							aria-pressed={toolMode === 'move-source'}
							data-testid="tool-move-source"
							onclick={() => {
								toolMode = 'move-source';
							}}
						>
							Move source
						</button>
					</div>

					{#if toolMode === 'paint' || toolMode === 'erase'}
						<div class="ink-scent-setting-row" data-testid="brush-size-control">
							<label class="ink-scent-setting-header" for="ink-scent-brush-size">
								<span>Brush size</span>
								<span class="ink-scent-setting-value">{brushSize} units</span>
							</label>
							<input
								id="ink-scent-brush-size"
								type="range"
								class="ink-scent-range"
								min="8"
								max="42"
								step="2"
								value={brushSize}
								oninput={handleBrushSizeChange}
							/>
						</div>
					{/if}
				</div>

				<!-- Module 3: Three adjustable settings (Sensitivity as main brushed-metal control) -->
				<div class="ink-scent-module">
					<h2 class="ink-scent-module__title">Particle &amp; trail settings</h2>

					<!-- Main tactile control: Sensitivity -->
					<div class="ink-scent-dial-card">
						<div class="ink-scent-dial-visual-row">
							<div class="ink-scent-metal-knob" aria-hidden="true">
								<div class="ink-scent-metal-knob__cap">
									<span
										class="ink-scent-metal-knob__marker"
										style="transform: rotate({dialAngleDeg}deg);"
									></span>
								</div>
							</div>
							<div class="ink-scent-dial-copy">
								<label class="ink-scent-setting-header" for="ink-scent-sensitivity">
									<span>Sensitivity</span>
									<span class="ink-scent-setting-value" data-testid="sensitivity-value">
										{sensitivity.toFixed(1)}
									</span>
								</label>
								<p class="ink-scent-setting-hint">How strongly the gradient influences movement.</p>
							</div>
						</div>
						<input
							id="ink-scent-sensitivity"
							type="range"
							class="ink-scent-range"
							min="0"
							max="2.5"
							step="0.1"
							value={sensitivity}
							data-testid="sensitivity-slider"
							oninput={handleSensitivityChange}
						/>
					</div>

					<!-- Setting 2: Random wandering -->
					<div class="ink-scent-setting-row">
						<label class="ink-scent-setting-header" for="ink-scent-wandering">
							<span>Random wandering</span>
							<span class="ink-scent-setting-value" data-testid="wandering-value">
								{randomWandering.toFixed(1)}
							</span>
						</label>
						<p class="ink-scent-setting-hint">The strength of the random component.</p>
						<input
							id="ink-scent-wandering"
							type="range"
							class="ink-scent-range"
							min="0.2"
							max="2.5"
							step="0.1"
							value={randomWandering}
							data-testid="wandering-slider"
							oninput={handleWanderingChange}
						/>
					</div>

					<!-- Setting 3: Trail duration -->
					<div class="ink-scent-setting-row">
						<label class="ink-scent-setting-header" for="ink-scent-trail-duration">
							<span>Trail duration</span>
							<span class="ink-scent-setting-value" data-testid="trail-duration-value">
								{trailDuration} s
							</span>
						</label>
						<p class="ink-scent-setting-hint">How long visible marks remain.</p>
						<input
							id="ink-scent-trail-duration"
							type="range"
							class="ink-scent-range"
							min="4"
							max="30"
							step="1"
							value={trailDuration}
							data-testid="trail-duration-slider"
							oninput={handleTrailDurationChange}
						/>
					</div>
				</div>

				<!-- Module 4: Secondary clearing actions grouped together -->
				<div class="ink-scent-module">
					<h2 class="ink-scent-module__title">Clear</h2>
					<div class="ink-scent-secondary-grid">
						<button
							type="button"
							class="ink-scent-btn"
							data-testid="clear-chemical-btn"
							onclick={handleClearChemical}
						>
							Clear chemical
						</button>

						<button
							type="button"
							class="ink-scent-btn"
							data-testid="clear-trails-btn"
							onclick={handleClearTrails}
						>
							Clear trails
						</button>
					</div>
				</div>
			</aside>
		</div>
	</div>
</div>
