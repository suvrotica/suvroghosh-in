<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import './acoustic-wavefield.css';
	import {
		C0,
		clearWavefield,
		computeAcousticMetrics,
		computeReciprocityCorrelation,
		createDefaultUrlState,
		createRoomAudioEngine,
		createSimulation,
		decodeStateFromQuery,
		DEFAULT_CAMERA,
		DX,
		encodeStateToQuery,
		FS_SIM,
		getPresetById,
		PRESETS,
		rebuildMaterialProperties,
		resetPreset,
		RIR_BUFFER_LENGTH,
		scatterChladniParticles,
		snapBeaconsToAir,
		stepSimulation,
		triggerExcitation,
		type AcousticMetrics,
		type BrushTool,
		type CameraState,
		type ChamberUrlState,
		type DrySoundKind,
		type PerimeterMode,
		type PresetId,
		type RoomAudioEngine,
		type SimulationState,
		type StudioTheme,
		type ViewMode,
		type WavePalette
	} from '$lib/visualizations/acoustic-wavefield';
	import TelemetryDrawer from './TelemetryDrawer.svelte';
	import WavefieldViewport from './WavefieldViewport.svelte';

	const initialUrl = createDefaultUrlState();
	const simState = createSimulation(initialUrl.presetId, {
		perimeter: initialUrl.perimeter,
		toneHz: initialUrl.toneHz,
		chladniEnabled: initialUrl.chladni
	});

	let presetId = $state<PresetId>(initialUrl.presetId);
	let perimeter = $state<PerimeterMode>(initialUrl.perimeter);
	let viewMode = $state<ViewMode>(initialUrl.view);
	let theme = $state<StudioTheme>(initialUrl.theme);
	let palette = $state<WavePalette>(initialUrl.palette);
	let camera = $state<CameraState>({ ...DEFAULT_CAMERA });
	let chladniEnabled = $state<boolean>(initialUrl.chladni);
	let toneHz = $state<number>(initialUrl.toneHz);
	let brushTool = $state<BrushTool>('orbit');
	let brushRadius = $state<number>(2);
	let speedMultiplier = $state<1 | 2>(1);

	let isPlaying = $state<boolean>(true);
	let tonePlaying = $state<boolean>(false);
	let sweepActive = $state<boolean>(false);
	let renderRevision = $state<number>(0);

	let audioEnabled = $state<boolean>(false);
	let audioMuted = $state<boolean>(false);
	let audioWet = $state<boolean>(true);
	let audioGainDb = $state<number>(-6);

	let metrics = $state<AcousticMetrics | null>(null);
	let previousRir = $state<Float32Array | null>(null);
	let reciprocityRho = $state<number | null>(null);
	let capturingRir = $state<boolean>(false);
	let pendingReciprocityCompare = false;

	let isFullscreen = $state<boolean>(false);
	let fullscreenFallback = $state<boolean>(false);
	let announcement = $state<string>('');
	let shareFeedback = $state<string>('');

	let shellEl = $state<HTMLElement | null>(null);
	let viewportComp = $state<WavefieldViewport | null>(null);

	let rafId: number | null = null;
	let lastFrameMs = 0;
	let geometryVersion = 0;
	let lastRequestedKey = '';
	let urlTimer: number | null = null;
	let rirWorker: Worker | null = null;
	let rirGeneration = 0;
	let fallbackCaptureTimer: number | null = null;
	let audioEngine: RoomAudioEngine | null = null;

	function buildRirRequestKey(): string {
		return `${geometryVersion}|${perimeter}|${simState.source.x},${simState.source.y}|${simState.listener.x},${simState.listener.y}`;
	}

	const activePreset = $derived(getPresetById(presetId));
	const effectiveFullscreen = $derived(isFullscreen || fullscreenFallback);
	const wavelengthMeters = $derived((C0 / Math.max(1, toneHz)).toFixed(2));
	const legendColors = $derived(
		palette === 'spectrum'
			? { pos: '#facc15', neg: '#6366f1' }
			: palette === 'thermal'
				? { pos: '#fb923c', neg: '#8b5cf6' }
				: { pos: '#ff7b24', neg: '#00d9ff' }
	);

	function applyCameraPreset(next: Partial<CameraState>, label: string): void {
		if (viewMode !== 'relief') {
			viewMode = 'relief';
			scheduleUrlSync();
		}
		camera = { ...DEFAULT_CAMERA, ...next };
		renderRevision += 1;
		announce(`Camera set to ${label}.`);
	}

	function handleSelectPalette(next: WavePalette, label: string): void {
		palette = next;
		renderRevision += 1;
		scheduleUrlSync();
		announce(`Wave color palette set to ${label}.`);
	}

	function announce(text: string): void {
		announcement = text;
	}

	function scheduleUrlSync(): void {
		if (typeof window === 'undefined') return;
		if (urlTimer !== null) window.clearTimeout(urlTimer);
		urlTimer = window.setTimeout(() => {
			urlTimer = null;
			const urlState: ChamberUrlState = {
				presetId,
				sx: simState.source.x,
				sy: simState.source.y,
				lx: simState.listener.x,
				ly: simState.listener.y,
				view: viewMode,
				perimeter,
				chladni: chladniEnabled,
				toneHz,
				theme,
				palette
			};
			const query = encodeStateToQuery(urlState, window.location.search);
			const nextUrl = query
				? `${window.location.pathname}?${query}${window.location.hash}`
				: `${window.location.pathname}${window.location.hash}`;
			try {
				window.history.replaceState(null, '', nextUrl);
			} catch {
				// Ignore restricted history API
			}
		}, 180);
	}

	function handleRirCaptured(result: AcousticMetrics, gen: number): void {
		if (gen !== rirGeneration) return;
		capturingRir = false;
		if (pendingReciprocityCompare && previousRir) {
			reciprocityRho = computeReciprocityCorrelation(previousRir, result.rir);
			pendingReciprocityCompare = false;
			announce(
				`Reciprocity verified: correlation ρ = ${reciprocityRho.toFixed(4)} between S→L and L→S.`
			);
		}
		metrics = result;
		audioEngine?.updateRir(result.rir, result.sampleRate);
	}

	function startChunkedRirFallback(gen: number): void {
		if (fallbackCaptureTimer !== null) {
			window.clearTimeout(fallbackCaptureTimer);
			fallbackCaptureTimer = null;
		}
		const fallbackSim: SimulationState = createSimulation(presetId, {
			perimeter,
			source: simState.source,
			listener: simState.listener,
			toneHz,
			chladniEnabled: false
		});
		fallbackSim.material.set(simState.material);
		rebuildMaterialProperties(fallbackSim);
		triggerExcitation(fallbackSim, 'clap', true);

		let done = 0;
		const total = RIR_BUFFER_LENGTH;

		const runChunk = () => {
			if (gen !== rirGeneration) return;
			const start = performance.now();
			while (done < total && performance.now() - start < 7.5) {
				const stepBatch = Math.min(180, total - done);
				stepSimulation(fallbackSim, stepBatch, false);
				done += stepBatch;
			}
			if (done < total) {
				fallbackCaptureTimer = window.setTimeout(runChunk, 0);
			} else {
				const distM = Math.hypot(
					(fallbackSim.listener.x - fallbackSim.source.x) * DX,
					(fallbackSim.listener.y - fallbackSim.source.y) * DX
				);
				const computed = computeAcousticMetrics(fallbackSim.liveRir, FS_SIM, distM);
				handleRirCaptured(computed, gen);
			}
		};
		fallbackCaptureTimer = window.setTimeout(runChunk, 0);
	}

	function spawnRirWorker(): Worker | null {
		if (typeof Worker === 'undefined') return null;
		if (rirWorker) {
			rirWorker.terminate();
			rirWorker = null;
		}
		try {
			const w = new Worker(
				new URL(
					'../../../visualizations/acoustic-wavefield/rir-capture.worker.ts',
					import.meta.url
				),
				{ type: 'module' }
			);
			w.onmessage = (event) => {
				handleRirCaptured(event.data.metrics, event.data.id);
			};
			w.onerror = () => {
				w.terminate();
				if (rirWorker === w) rirWorker = null;
				startChunkedRirFallback(rirGeneration);
			};
			rirWorker = w;
			return w;
		} catch {
			rirWorker = null;
			return null;
		}
	}

	function requestFullRirCapture(): void {
		if (typeof window === 'undefined') return;
		lastRequestedKey = buildRirRequestKey();
		const wasBusy = capturingRir;
		rirGeneration += 1;
		const gen = rirGeneration;
		capturingRir = true;

		if (wasBusy && rirWorker) {
			// Immediately cancel obsolete in-flight worker computation instead of queueing behind it
			spawnRirWorker();
		} else if (!rirWorker) {
			spawnRirWorker();
		}

		if (rirWorker) {
			const matCopy = new Uint8Array(simState.material);
			rirWorker.postMessage(
				{
					id: gen,
					material: matCopy,
					perimeter,
					source: { ...simState.source },
					listener: { ...simState.listener }
				},
				[matCopy.buffer]
			);
			return;
		}
		startChunkedRirFallback(gen);
	}

	function stopVisualLoop(): void {
		if (rafId !== null && typeof window !== 'undefined') {
			window.cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function startVisualLoop(): void {
		if (typeof window === 'undefined') return;
		if (rafId !== null) return;
		const tick = (now: number) => {
			if (!isPlaying) {
				rafId = null;
				return;
			}
			if (capturingRir && lastFrameMs !== 0 && now - lastFrameMs < 80) {
				rafId = window.requestAnimationFrame(tick);
				return;
			}
			const baseSubsteps = speedMultiplier === 2 ? 12 : 6;
			const elapsedMs =
				lastFrameMs === 0 ? 16.67 : Math.min(90, Math.max(16.67, now - lastFrameMs));
			lastFrameMs = now;
			const substeps = capturingRir
				? Math.min(24, Math.max(baseSubsteps, Math.round((elapsedMs / 16.67) * baseSubsteps)))
				: baseSubsteps;
			stepSimulation(simState, substeps, chladniEnabled);
			if (sweepActive && !simState.excitationActive) {
				sweepActive = false;
			}
			viewportComp?.drawFrame();
			rafId = window.requestAnimationFrame(tick);
		};
		rafId = window.requestAnimationFrame(tick);
	}

	function handleClap(): void {
		tonePlaying = false;
		sweepActive = false;
		audioEngine?.stopContinuousTone();
		triggerExcitation(simState, 'clap', false);
		lastFrameMs = 0;
		isPlaying = true;
		startVisualLoop();
		const currentKey = buildRirRequestKey();
		if (currentKey !== lastRequestedKey || (!capturingRir && metrics === null)) {
			requestFullRirCapture();
		}
		if (audioEnabled && !audioMuted) {
			void audioEngine?.playDrySound('clap');
		}
		announce('Fired acoustic clap impulse in the chamber.');
	}

	function handleToggleTone(): void {
		if (tonePlaying) {
			tonePlaying = false;
			simState.excitationActive = false;
			audioEngine?.stopContinuousTone();
			announce('Stopped continuous tone.');
			return;
		}
		sweepActive = false;
		tonePlaying = true;
		simState.toneHz = toneHz;
		triggerExcitation(simState, 'tone', false);
		lastFrameMs = 0;
		isPlaying = true;
		startVisualLoop();
		if (audioEnabled && !audioMuted) {
			void audioEngine?.startContinuousTone(toneHz);
		}
		announce(`Continuous standing-wave tone running at ${toneHz} Hz.`);
	}

	function handleToneFreqChange(nextHz: number): void {
		toneHz = nextHz;
		simState.toneHz = nextHz;
		audioEngine?.setToneFrequency(nextHz);
		scheduleUrlSync();
	}

	function handleSweep(): void {
		tonePlaying = false;
		audioEngine?.stopContinuousTone();
		sweepActive = true;
		triggerExcitation(simState, 'sweep', true);
		lastFrameMs = 0;
		isPlaying = true;
		startVisualLoop();
		announce('Running exponential eigenmode chirp sweep from 80 Hz to 850 Hz.');
	}

	function handleTogglePlay(): void {
		isPlaying = !isPlaying;
		if (isPlaying) {
			lastFrameMs = 0;
			startVisualLoop();
			announce('Simulation resumed.');
		} else {
			stopVisualLoop();
			viewportComp?.drawFrame();
			announce('Simulation paused.');
		}
	}

	function handleClearWaves(): void {
		tonePlaying = false;
		sweepActive = false;
		audioEngine?.stopAll();
		clearWavefield(simState);
		lastFrameMs = 0;
		renderRevision += 1;
		announce('Cleared wavefield energy.');
	}

	function handleSelectPreset(nextId: PresetId): void {
		tonePlaying = false;
		sweepActive = false;
		audioEngine?.stopAll();
		previousRir = null;
		reciprocityRho = null;
		pendingReciprocityCompare = false;

		resetPreset(simState, nextId);
		geometryVersion += 1;
		presetId = simState.presetId;
		perimeter = simState.perimeter;
		toneHz = simState.toneHz;
		simState.chladniEnabled = chladniEnabled;

		triggerExcitation(simState, 'clap', true);
		lastFrameMs = 0;
		isPlaying = true;
		startVisualLoop();
		renderRevision += 1;
		requestFullRirCapture();
		scheduleUrlSync();
		announce(`Loaded ${getPresetById(nextId).name}.`);
	}

	function handleResetRoom(): void {
		handleSelectPreset(presetId);
	}

	function handleClearSketches(): void {
		const p = getPresetById(presetId);
		p.buildGeometry(simState.material);
		snapBeaconsToAir(simState);
		rebuildMaterialProperties(simState);
		geometryVersion += 1;
		previousRir = null;
		reciprocityRho = null;
		lastFrameMs = 0;
		renderRevision += 1;
		requestFullRirCapture();
		scheduleUrlSync();
		announce('Restored room geometry to preset walls.');
	}

	function handleSwapSourceAndProbe(): void {
		if (metrics?.rir) {
			previousRir = new Float32Array(metrics.rir);
			pendingReciprocityCompare = true;
		}
		const prevS = { ...simState.source };
		simState.source = { ...simState.listener };
		simState.listener = prevS;
		triggerExcitation(simState, 'clap', true);
		lastFrameMs = 0;
		isPlaying = true;
		startVisualLoop();
		renderRevision += 1;
		requestFullRirCapture();
		scheduleUrlSync();
		announce('Swapped Emitter S and Listener L to test acoustic reciprocity.');
	}

	function handleTogglePerimeter(nextPerim: PerimeterMode): void {
		perimeter = nextPerim;
		simState.perimeter = nextPerim;
		rebuildMaterialProperties(simState);
		previousRir = null;
		reciprocityRho = null;
		lastFrameMs = 0;
		renderRevision += 1;
		requestFullRirCapture();
		scheduleUrlSync();
	}

	function handleToggleChladni(): void {
		chladniEnabled = !chladniEnabled;
		simState.chladniEnabled = chladniEnabled;
		renderRevision += 1;
		scheduleUrlSync();
	}

	function handleScatterSand(): void {
		scatterChladniParticles(simState, (simState.stepCount + 1337) >>> 0);
		renderRevision += 1;
		announce('Rescattered Chladni sand grains uniformly across open air.');
	}

	async function handleEnableAudio(): Promise<void> {
		if (!audioEngine) audioEngine = createRoomAudioEngine();
		if (audioEnabled) {
			audioEngine.stopAll();
			audioEnabled = false;
			announce('Room convolution audio disabled.');
			return;
		}
		const ok = await audioEngine.ensureUnlocked();
		audioEnabled = ok;
		if (ok && metrics) {
			audioEngine.updateRir(metrics.rir, metrics.sampleRate);
			audioEngine.setWetMode(audioWet);
			audioEngine.setMuted(audioMuted);
			audioEngine.setGainDb(audioGainDb);
		}
		announce(ok ? 'Room convolution audio enabled.' : 'Web Audio unavailable in this environment.');
	}

	async function handleAuditionDrySound(kind: DrySoundKind): Promise<void> {
		if (!audioEngine) audioEngine = createRoomAudioEngine();
		if (!audioEnabled) {
			const ok = await audioEngine.ensureUnlocked();
			audioEnabled = ok;
			if (ok && metrics) {
				audioEngine.updateRir(metrics.rir, metrics.sampleRate);
			}
		}
		audioEngine.setWetMode(audioWet);
		audioEngine.setMuted(audioMuted);
		audioEngine.setGainDb(audioGainDb);
		await audioEngine.playDrySound(kind);
	}

	function handleToggleMute(): void {
		audioMuted = !audioMuted;
		audioEngine?.setMuted(audioMuted);
	}

	function handleToggleWet(): void {
		audioWet = !audioWet;
		audioEngine?.setWetMode(audioWet);
	}

	function handleGainChange(db: number): void {
		audioGainDb = db;
		audioEngine?.setGainDb(db);
	}

	function handleSelectModeHz(hz: number): void {
		handleToneFreqChange(Math.max(60, Math.min(1000, hz)));
		if (!tonePlaying) {
			handleToggleTone();
		}
	}

	async function handleCopyShareLink(): Promise<void> {
		if (typeof window === 'undefined') return;
		scheduleUrlSync();
		const url = window.location.href;
		try {
			await navigator.clipboard?.writeText(url);
			shareFeedback = 'Copied!';
		} catch {
			shareFeedback = 'Link ready in address bar';
		}
		window.setTimeout(() => {
			shareFeedback = '';
		}, 2000);
	}

	async function handleToggleFullscreen(): Promise<void> {
		if (!shellEl || typeof document === 'undefined') return;
		if (document.fullscreenElement === shellEl) {
			await document.exitFullscreen().catch(() => {});
			isFullscreen = false;
			fullscreenFallback = false;
			announce('Exited fullscreen chamber view.');
			return;
		}
		if (fullscreenFallback) {
			fullscreenFallback = false;
			announce('Exited fullscreen chamber view.');
			return;
		}
		try {
			if (typeof shellEl.requestFullscreen !== 'function') {
				throw new Error('Fullscreen API unavailable');
			}
			await shellEl.requestFullscreen();
			isFullscreen = true;
		} catch {
			fullscreenFallback = true;
			announce('Entered fullscreen chamber view. Press Escape or Exit Fullscreen to return.');
		}
	}

	$effect(() => {
		if (!fullscreenFallback || typeof document === 'undefined') return;
		const onEscapeKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			fullscreenFallback = false;
			announce('Exited fullscreen chamber view.');
		};
		document.addEventListener('keydown', onEscapeKeyDown);
		return () => {
			document.removeEventListener('keydown', onEscapeKeyDown);
		};
	});

	onMount(() => {
		const decoded = decodeStateFromQuery(window.location.search);
		presetId = decoded.presetId;
		perimeter = decoded.perimeter;
		viewMode = decoded.view;
		theme = decoded.theme;
		palette = decoded.palette;
		chladniEnabled = decoded.chladni;
		toneHz = decoded.toneHz;

		resetPreset(simState, decoded.presetId);
		geometryVersion += 1;
		simState.perimeter = decoded.perimeter;
		simState.source = { x: decoded.sx, y: decoded.sy };
		simState.listener = { x: decoded.lx, y: decoded.ly };
		snapBeaconsToAir(simState);
		const beaconsSnapped =
			simState.source.x !== decoded.sx ||
			simState.source.y !== decoded.sy ||
			simState.listener.x !== decoded.lx ||
			simState.listener.y !== decoded.ly;
		simState.toneHz = decoded.toneHz;
		simState.chladniEnabled = decoded.chladni;
		rebuildMaterialProperties(simState);
		if (beaconsSnapped) {
			scheduleUrlSync();
		}

		spawnRirWorker();

		const reduced =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			document.documentElement.dataset.motion === 'still';

		triggerExcitation(simState, 'clap', true);
		lastFrameMs = 0;
		renderRevision += 1;
		if (reduced) {
			// Advance deterministically to mid-propagation snapshot without looping animation
			stepSimulation(simState, 220, chladniEnabled);
			isPlaying = false;
		} else {
			isPlaying = true;
			startVisualLoop();
		}
		requestFullRirCapture();

		const onFsChange = () => {
			isFullscreen = document.fullscreenElement === shellEl;
		};
		const onVisChange = () => {
			if (document.hidden) {
				if (tonePlaying || sweepActive) {
					simState.excitationActive = false;
				}
				tonePlaying = false;
				sweepActive = false;
				audioEngine?.stopContinuousTone();
			}
		};
		document.addEventListener('fullscreenchange', onFsChange);
		document.addEventListener('visibilitychange', onVisChange);

		return () => {
			document.removeEventListener('fullscreenchange', onFsChange);
			document.removeEventListener('visibilitychange', onVisChange);
		};
	});

	onDestroy(() => {
		stopVisualLoop();
		if (urlTimer !== null && typeof window !== 'undefined') window.clearTimeout(urlTimer);
		if (fallbackCaptureTimer !== null && typeof window !== 'undefined') {
			window.clearTimeout(fallbackCaptureTimer);
		}
		rirWorker?.terminate();
		rirWorker = null;
		audioEngine?.dispose();
		audioEngine = null;
	});
</script>

<div
	class="awc-breakout-root article-breakout not-prose"
	class:awc-elevated={effectiveFullscreen}
	data-tts-exclude
	data-testid="acoustic-wavefield-chamber"
>
	<section
		class="awc-shell"
		class:awc-fullscreen-fallback={fullscreenFallback}
		bind:this={shellEl}
		data-studio-theme={theme}
	>
		<header class="awc-header">
			<div class="awc-title-block">
				<div class="awc-title-row">
					<h1 class="awc-title">The Room That Remembers Every Clap</h1>
					<span class="awc-status-pill" data-testid="awc-grid-pill">
						14.0 × 9.0 m · 224×144 FDTD · 10.98 kHz
					</span>
				</div>
				<p class="awc-subtitle">
					2D Acoustic Wavefield, Chladni Nodal Cymatics &amp; Real-Time Room-Impulse Convolution Lab
					· Updated <time datetime="2026-11-21">21 November 2026</time>
				</p>
			</div>

			<div class="awc-header-actions">
				<button
					type="button"
					class="awc-btn"
					onclick={() => {
						theme = theme === 'dark' ? 'light' : 'dark';
						scheduleUrlSync();
					}}
				>
					{theme === 'dark' ? 'Light Studio' : 'Dark Chamber'}
				</button>
				<button type="button" class="awc-btn" onclick={handleCopyShareLink}>
					{shareFeedback || 'Copy Share Link'}
				</button>
				<button
					type="button"
					class="awc-btn"
					data-testid="awc-fullscreen-btn"
					aria-pressed={effectiveFullscreen}
					onclick={handleToggleFullscreen}
				>
					{effectiveFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
				</button>
			</div>
		</header>

		<div class="awc-preset-bar">
			<div class="awc-preset-select-wrap">
				<label class="awc-field-label" for="awc-preset-select">Architectural Preset</label>
				<select
					id="awc-preset-select"
					class="awc-select"
					data-testid="awc-preset-select"
					value={presetId}
					onchange={(e) => handleSelectPreset(e.currentTarget.value as PresetId)}
				>
					{#each PRESETS as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>
			<p class="awc-takeaway" data-testid="awc-preset-takeaway">
				<strong>{activePreset.name}:</strong>
				{activePreset.takeaway}
			</p>
		</div>

		<div class="awc-main-grid">
			<div class="awc-viewport-col">
				<div class="awc-transport-bar">
					<div class="awc-btn-group">
						<button
							type="button"
							class="awc-btn awc-btn-primary"
							data-testid="awc-clap-btn"
							onclick={handleClap}
						>
							Clap
						</button>
						<button
							type="button"
							class="awc-btn"
							aria-pressed={tonePlaying}
							data-testid="awc-tone-btn"
							onclick={handleToggleTone}
						>
							{tonePlaying ? 'Stop Tone' : 'Continuous Tone'}
						</button>
						<button type="button" class="awc-btn" aria-pressed={sweepActive} onclick={handleSweep}>
							Eigenmode Sweep
						</button>
						<button
							type="button"
							class="awc-btn"
							aria-pressed={isPlaying}
							onclick={handleTogglePlay}
						>
							{isPlaying ? 'Pause' : 'Play'}
						</button>
						<button type="button" class="awc-btn" onclick={handleClearWaves}>Clear Waves</button>
						<button type="button" class="awc-btn" onclick={handleResetRoom}>Reset Room</button>
					</div>

					<div class="awc-btn-group">
						<button
							type="button"
							class="awc-btn"
							data-testid="awc-swap-btn"
							onclick={handleSwapSourceAndProbe}
						>
							Swap Source ↔ Probe
						</button>
						<button
							type="button"
							class="awc-btn"
							aria-pressed={speedMultiplier === 2}
							onclick={() => (speedMultiplier = speedMultiplier === 1 ? 2 : 1)}
						>
							{speedMultiplier}× Speed
						</button>
					</div>
				</div>

				<WavefieldViewport
					bind:this={viewportComp}
					{simState}
					{viewMode}
					{theme}
					{palette}
					{camera}
					{brushTool}
					{brushRadius}
					{renderRevision}
					onCameraChange={(next) => {
						camera = next;
					}}
					onBeaconMoved={() => {
						previousRir = null;
						reciprocityRho = null;
						lastFrameMs = 0;
						requestFullRirCapture();
						scheduleUrlSync();
					}}
					onGeometryChanged={() => {
						geometryVersion += 1;
						previousRir = null;
						reciprocityRho = null;
						lastFrameMs = 0;
						requestFullRirCapture();
					}}
					onKeyboardClap={handleClap}
					onTogglePlay={handleTogglePlay}
					onAnnouncement={announce}
				/>

				<div class="awc-stage-legend">
					<div class="awc-legend-items">
						<span class="awc-swatch">
							<span class="awc-dot" style={`background:${legendColors.pos};`}></span> +p Compression
						</span>
						<span class="awc-swatch">
							<span class="awc-dot" style={`background:${legendColors.neg};`}></span> −p Rarefaction
						</span>
						<span class="awc-swatch">
							<span class="awc-dot" style="background:#fb7185;"></span> S Emitter
						</span>
						<span class="awc-swatch">
							<span class="awc-dot" style="background:#34d399;"></span> L Microphone
						</span>
						{#if chladniEnabled}
							<span class="awc-swatch">
								<span class="awc-dot" style="background:#fff0c2;border:1px solid #64748b;"></span>
								Chladni Sand
							</span>
						{/if}
					</div>
					<span>
						Drag chamber to tilt &amp; rotate · Right/Shift-drag to pan · Drag S/L beacons · Space
						to Clap
					</span>
				</div>
			</div>

			<aside class="awc-dock" aria-label="Chamber controls, brushes, and audio deck">
				<div class="awc-dock-body">
					<!-- View, Color & 3D Camera -->
					<section class="awc-panel-section">
						<div class="awc-section-head">
							<h2 class="awc-section-title">View, Color &amp; 3D Angle</h2>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-cam-reset"
								onclick={() => applyCameraPreset(DEFAULT_CAMERA, 'default 3/4 view')}
							>
								Reset View
							</button>
						</div>
						<div class="awc-btn-group">
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={viewMode === 'relief'}
								onclick={() => {
									viewMode = 'relief';
									scheduleUrlSync();
								}}
							>
								2.5D Relief
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={viewMode === 'interferometer'}
								onclick={() => {
									viewMode = 'interferometer';
									scheduleUrlSync();
								}}
							>
								2D Top-Down
							</button>
						</div>

						<div class="awc-btn-group" role="group" aria-label="Wave color palette">
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-palette-vivid"
								aria-pressed={palette === 'vivid'}
								onclick={() => handleSelectPalette('vivid', 'Coral / Cyan')}
							>
								Coral / Cyan
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-palette-spectrum"
								aria-pressed={palette === 'spectrum'}
								onclick={() => handleSelectPalette('spectrum', 'Iridescent')}
							>
								Iridescent
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-palette-thermal"
								aria-pressed={palette === 'thermal'}
								onclick={() => handleSelectPalette('thermal', 'Thermal')}
							>
								Thermal
							</button>
						</div>

						<div class="awc-btn-group" role="group" aria-label="3D camera angle presets">
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-cam-threequarter"
								onclick={() =>
									applyCameraPreset({ yawDeg: 0, pitchDeg: 52, zoom: 1.0 }, '3/4 view')}
							>
								3/4 View
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-cam-grazing"
								onclick={() =>
									applyCameraPreset({ yawDeg: -24, pitchDeg: 22, zoom: 1.15 }, 'low grazing angle')}
							>
								Low Grazing
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-cam-side"
								onclick={() =>
									applyCameraPreset({ yawDeg: 42, pitchDeg: 34, zoom: 1.08 }, 'angled side view')}
							>
								Side Spin
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-cam-top"
								onclick={() =>
									applyCameraPreset({ yawDeg: 0, pitchDeg: 86, zoom: 1.0 }, 'overhead angle')}
							>
								Top
							</button>
						</div>

						<div class="awc-slider-row">
							<label for="awc-tilt-slider">Tilt</label>
							<input
								id="awc-tilt-slider"
								class="awc-range"
								data-testid="awc-tilt-slider"
								type="range"
								min="16"
								max="88"
								step="1"
								value={Math.round(camera.pitchDeg)}
								oninput={(e) => {
									if (viewMode !== 'relief') viewMode = 'relief';
									camera = { ...camera, pitchDeg: Number(e.currentTarget.value) };
								}}
							/>
							<span class="awc-mono">{Math.round(camera.pitchDeg)}°</span>
						</div>

						<div class="awc-slider-row">
							<label for="awc-yaw-slider">Spin</label>
							<input
								id="awc-yaw-slider"
								class="awc-range"
								data-testid="awc-yaw-slider"
								type="range"
								min="-180"
								max="180"
								step="2"
								value={Math.round(camera.yawDeg)}
								oninput={(e) => {
									if (viewMode !== 'relief') viewMode = 'relief';
									camera = { ...camera, yawDeg: Number(e.currentTarget.value) };
								}}
							/>
							<span class="awc-mono">{Math.round(camera.yawDeg)}°</span>
						</div>

						<div class="awc-slider-row">
							<label for="awc-zoom-slider">Zoom</label>
							<input
								id="awc-zoom-slider"
								class="awc-range"
								data-testid="awc-zoom-slider"
								type="range"
								min="0.7"
								max="2.2"
								step="0.05"
								value={camera.zoom}
								oninput={(e) => {
									if (viewMode !== 'relief') viewMode = 'relief';
									camera = { ...camera, zoom: Number(e.currentTarget.value) };
								}}
							/>
							<span class="awc-mono">{camera.zoom.toFixed(2)}×</span>
						</div>

						<div class="awc-btn-group">
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={chladniEnabled}
								data-testid="awc-chladni-toggle"
								onclick={handleToggleChladni}
							>
								Chladni Sand: {chladniEnabled ? 'On' : 'Off'}
							</button>
							<button type="button" class="awc-btn awc-btn-xs" onclick={handleScatterSand}>
								Scatter Sand
							</button>
						</div>
						<div class="awc-btn-group">
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={perimeter === 'rigid'}
								onclick={() => handleTogglePerimeter('rigid')}
							>
								Rigid Vault
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={perimeter === 'open'}
								onclick={() => handleTogglePerimeter('open')}
							>
								Open Absorbing (PML)
							</button>
						</div>
					</section>

					<!-- Continuous Tone Slider -->
					<section class="awc-panel-section">
						<div class="awc-section-head">
							<h2 class="awc-section-title">Standing-Wave Pitch</h2>
							<span class="awc-mono" style="font-size:0.75rem;">
								{toneHz} Hz · λ = {wavelengthMeters} m
							</span>
						</div>
						<div class="awc-slider-row">
							<label for="awc-tone-slider">Freq</label>
							<input
								id="awc-tone-slider"
								class="awc-range"
								type="range"
								min="60"
								max="1000"
								step="5"
								value={toneHz}
								oninput={(e) => handleToneFreqChange(Number(e.currentTarget.value))}
							/>
							<span class="awc-mono">{toneHz} Hz</span>
						</div>
					</section>

					<!-- Material Brush Dock -->
					<section class="awc-panel-section">
						<div class="awc-section-head">
							<h2 class="awc-section-title">Architect's Material Brush</h2>
							<button type="button" class="awc-btn awc-btn-xs" onclick={handleClearSketches}>
								Clear Sketches
							</button>
						</div>
						<div class="awc-tool-grid">
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-tool-orbit"
								aria-pressed={brushTool === 'orbit'}
								onclick={() => (brushTool = 'orbit')}
							>
								Orbit / Move S·L
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={brushTool === 'move'}
								onclick={() => (brushTool = 'move')}
							>
								Move Beacons (S / L)
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={brushTool === 'wall'}
								onclick={() => (brushTool = 'wall')}
							>
								Stone Wall
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={brushTool === 'absorber'}
								onclick={() => (brushTool = 'absorber')}
							>
								Porous Foam
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={brushTool === 'diffuser'}
								onclick={() => (brushTool = 'diffuser')}
							>
								Slotted Diffuser
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={brushTool === 'lens'}
								onclick={() => (brushTool = 'lens')}
							>
								Slow-Air Lens
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={brushTool === 'resonator'}
								data-testid="awc-tool-helmholtz"
								onclick={() => (brushTool = 'resonator')}
							>
								Helmholtz Cavity
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={brushTool === 'air'}
								onclick={() => (brushTool = 'air')}
							>
								Air (Eraser)
							</button>
						</div>
						<div class="awc-btn-group">
							<span class="awc-field-label" style="margin-right:0.25rem;">Radius:</span>
							{#each [1, 2, 4] as r (r)}
								<button
									type="button"
									class="awc-btn awc-btn-xs"
									aria-pressed={brushRadius === r}
									onclick={() => (brushRadius = r)}
								>
									{r} cell{r > 1 ? 's' : ''}
								</button>
							{/each}
						</div>
					</section>

					<!-- Audition Audio Deck -->
					<section class="awc-panel-section">
						<div class="awc-section-head">
							<h2 class="awc-section-title">Room Convolution Audition</h2>
						</div>
						<div class="awc-btn-group">
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={audioEnabled}
								data-testid="awc-enable-audio"
								onclick={handleEnableAudio}
							>
								{audioEnabled ? 'Audio Ready' : 'Enable Room Audio'}
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={audioMuted}
								onclick={handleToggleMute}
							>
								{audioMuted ? 'Unmute' : 'Mute'}
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								aria-pressed={!audioWet}
								onclick={handleToggleWet}
							>
								{audioWet ? 'Room Wet' : 'Dry Source'}
							</button>
						</div>

						<div class="awc-audio-grid">
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-audition-clap"
								onclick={() => handleAuditionDrySound('clap')}
							>
								Audition Clap
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								data-testid="awc-audition-pluck"
								onclick={() => handleAuditionDrySound('pluck')}
							>
								Dry Pluck
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								onclick={() => handleAuditionDrySound('rimshot')}
							>
								Rimshot
							</button>
							<button
								type="button"
								class="awc-btn awc-btn-xs"
								onclick={() => handleAuditionDrySound('vowel')}
							>
								Vowel Pulse
							</button>
						</div>

						<div class="awc-slider-row">
							<label for="awc-gain-slider">Level</label>
							<input
								id="awc-gain-slider"
								class="awc-range"
								type="range"
								min="-18"
								max="0"
								step="1"
								value={audioGainDb}
								oninput={(e) => handleGainChange(Number(e.currentTarget.value))}
							/>
							<span class="awc-mono">{audioGainDb} dB</span>
						</div>
					</section>
				</div>
			</aside>
		</div>

		<TelemetryDrawer
			{metrics}
			{previousRir}
			{reciprocityRho}
			capturing={capturingRir}
			onSelectModeHz={handleSelectModeHz}
		/>

		<div class="awc-sr-only" aria-live="polite">{announcement}</div>
	</section>
</div>
