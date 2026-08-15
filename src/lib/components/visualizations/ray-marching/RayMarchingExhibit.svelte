<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { track } from '@vercel/analytics';
	import RayMarchingCanvas from './RayMarchingCanvas.svelte';
	import RayMarchingSourceExplorer from './RayMarchingSourceExplorer.svelte';
	import { rayMarchingMetadata } from '$lib/visualizations/experiments/ray-marching/metadata';
	import { rayMarchingStages } from '$lib/visualizations/experiments/ray-marching/stages';
	import {
		chooseInitialRayMarchingQuality,
		RAY_MARCHING_QUALITY_PROFILES,
		type RayMarchingQualityHints
	} from '$lib/visualizations/experiments/ray-marching/quality';
	import {
		createRayMarchingState,
		resetRayMarchingState,
		restartRayMarchingMotion
	} from '$lib/visualizations/experiments/ray-marching/state';
	import {
		buildRayMarchingShareUrl,
		parseRayMarchingShareState
	} from '$lib/visualizations/experiments/ray-marching/url-state';
	import type { RayMarchingRenderSnapshot } from '$lib/visualizations/experiments/ray-marching/sketch';
	import type {
		RayMarchingCamera,
		RayMarchingDebugView,
		RayMarchingExperienceState,
		RayMarchingPalette,
		RayMarchingQualityChoice,
		RayMarchingQualityTier,
		RayMarchingStageId
	} from '$lib/visualizations/experiments/ray-marching/types';

	type LifecycleState =
		| 'poster'
		| 'initializing'
		| 'ready'
		| 'paused'
		| 'reduced-motion-paused'
		| 'offscreen-suspended'
		| 'context-lost'
		| 'unavailable'
		| 'shader-error';

	type ConnectionWithHints = {
		saveData?: boolean;
		addEventListener?: (type: 'change', listener: () => void) => void;
		removeEventListener?: (type: 'change', listener: () => void) => void;
	};

	type NavigatorWithHints = Navigator & {
		connection?: ConnectionWithHints;
		deviceMemory?: number;
	};

	const uid = $props.id();
	const canonicalPath = '/blog/visualizations/ray-marching-fragment-shader-from-scratch';
	const qualityLabels: Record<RayMarchingQualityChoice, string> = {
		auto: 'Auto',
		high: 'High',
		balanced: 'Balanced',
		saver: 'Saver'
	};
	const debugLabels: Record<RayMarchingDebugView, string> = {
		beauty: 'Beauty',
		'march-cost': 'March cost',
		normals: 'Normals',
		'distance-bands': 'Distance bands'
	};
	const paletteLabels: Record<RayMarchingPalette, string> = {
		cathedral: 'Cathedral',
		'blue-hour': 'Blue hour',
		'amber-archive': 'Amber archive'
	};

	let shell: HTMLElement;
	let frame: HTMLDivElement;
	let sceneState = $state<RayMarchingExperienceState>(createRayMarchingState());
	let lifecycle = $state<LifecycleState>('poster');
	let statusMessage = $state('Static Cathedral poster. The interactive shader has not loaded yet.');
	let loadRequested = $state(false);
	let ready = $state(false);
	let reducedMotion = $state(false);
	let saveData = $state(false);
	let offscreen = $state(false);
	let documentHidden = $state(false);
	let nativeFullscreen = $state(false);
	let cssExpanded = $state(false);
	let generation = $state(0);
	let restartToken = $state(0);
	let pulseToken = $state(0);
	let pulseStatic = $state(false);
	let qualityTier = $state<RayMarchingQualityTier>('balanced');
	let qualityHints = $state<RayMarchingQualityHints>({
		width: 1280,
		height: 720,
		devicePixelRatio: 1
	});
	let forcedWebglOff = $state(false);
	let captureMode = $state(false);
	let pendingPulse = false;
	let motionExplicitlyAllowed = false;
	let fullscreenTrigger: HTMLButtonElement | null = null;
	let previousBodyOverflow = '';
	let copyStatus = $state('');
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	let currentStage = $derived(rayMarchingStages[sceneState.stage - 1]);
	let expanded = $derived(nativeFullscreen || cssExpanded);
	let suspended = $derived(ready && (documentHidden || offscreen));
	let snapshot = $derived.by(
		(): RayMarchingRenderSnapshot => ({
			stage: sceneState.stage,
			debugView: sceneState.debugView,
			palette: sceneState.palette,
			fogAmount: sceneState.fogAmount,
			pulseSpeed: sceneState.pulseSpeed,
			focalLength: sceneState.focalLength,
			camera: sceneState.camera,
			playing: sceneState.playing,
			suspended,
			qualityChoice: sceneState.quality,
			qualityTier
		})
	);
	let posterVisible = $derived(
		!ready ||
			lifecycle === 'context-lost' ||
			lifecycle === 'shader-error' ||
			lifecycle === 'unavailable'
	);

	function safeTrack(name: string, properties?: Record<string, string | number | boolean>) {
		try {
			track(name, properties);
		} catch {
			// Measurement is deliberately non-essential; the local exhibit always works without it.
		}
	}

	function replaceState(patch: Partial<RayMarchingExperienceState>) {
		sceneState = createRayMarchingState({ ...sceneState, ...patch });
	}

	function describeReadyState(message?: string) {
		if (suspended) {
			lifecycle = 'offscreen-suspended';
			statusMessage =
				'Rendering is suspended while the exhibit is offscreen or the page is hidden.';
		} else if (!sceneState.playing) {
			lifecycle = reducedMotion ? 'reduced-motion-paused' : 'paused';
			statusMessage = message ?? (reducedMotion ? 'Ready, paused for reduced motion.' : 'Paused.');
		} else {
			lifecycle = 'ready';
			statusMessage = message ?? 'Ready. The Cathedral shader is running.';
		}
	}

	function requestLoad() {
		if (forcedWebglOff) {
			lifecycle = 'unavailable';
			statusMessage =
				'Fallback: WebGL is disabled for this visit. The complete poster and article remain available.';
			return;
		}
		if (loadRequested && lifecycle !== 'shader-error' && lifecycle !== 'context-lost') return;
		loadRequested = true;
		ready = false;
		lifecycle = 'initializing';
		statusMessage = 'Loading p5 and preparing the WebGL shader…';
	}

	function retry() {
		if (forcedWebglOff) return;
		generation += 1;
		loadRequested = true;
		ready = false;
		lifecycle = 'initializing';
		statusMessage = 'Retrying the WebGL shader…';
	}

	function handleSketchStatus(
		status: 'initializing' | 'first-frame' | 'context-lost' | 'shader-error',
		message: string
	) {
		statusMessage = message;
		if (status === 'context-lost') {
			ready = false;
			lifecycle = 'context-lost';
			safeTrack('ray_marching_fallback_shown', { reason: 'context-lost' });
		} else if (status === 'shader-error') {
			ready = false;
			lifecycle = /webgl|context/iu.test(message) ? 'unavailable' : 'shader-error';
			statusMessage = `${lifecycle === 'unavailable' ? 'Fallback' : 'Shader error'}: ${message}`;
			safeTrack('ray_marching_fallback_shown', { reason: lifecycle });
		} else {
			lifecycle = 'initializing';
		}
	}

	function handleReady() {
		ready = true;
		describeReadyState('Ready. The first visible GPU frame replaced the poster.');
		safeTrack('ray_marching_loaded', { tier: qualityTier });
		if (pendingPulse || captureMode) {
			pendingPulse = false;
			pulseStatic = captureMode || !sceneState.playing;
			pulseToken += 1;
		}
	}

	function handleContextRestored() {
		statusMessage = 'WebGL returned. Rebuilding every GPU resource…';
		lifecycle = 'initializing';
		ready = false;
		generation += 1;
	}

	function handleQualityDowngrade(from: RayMarchingQualityTier, to: RayMarchingQualityTier) {
		if (sceneState.quality !== 'auto' || qualityTier === to) return;
		qualityTier = to;
		statusMessage = `Quality changed from ${qualityLabels[from]} to ${qualityLabels[to]} after sustained slow frames.`;
		safeTrack('ray_marching_quality_changed', { from, to });
	}

	function selectStage(stage: RayMarchingStageId) {
		replaceState({ stage, mode: 'build', playing: false });
		const message = `Build stage ${stage} of 8: ${rayMarchingStages[stage - 1].title}.`;
		if (!loadRequested || !ready) requestLoad();
		else describeReadyState(message);
		safeTrack('ray_marching_stage_selected', { stage });
	}

	function explore() {
		replaceState({ stage: 8, mode: 'explore' });
		if (ready) describeReadyState('Explore mode: the finished Cathedral is selected.');
		else statusMessage = 'Explore mode: the finished Cathedral is selected.';
	}

	function buildIt() {
		selectStage(1);
	}

	function togglePlayback() {
		if (sceneState.stage !== 8) {
			statusMessage = 'Motion is available in Explore mode and completed stage 8.';
			return;
		}
		if (!loadRequested || !ready) {
			motionExplicitlyAllowed = true;
			replaceState({ playing: true });
			requestLoad();
			return;
		}
		const playing = !sceneState.playing;
		if (playing) motionExplicitlyAllowed = true;
		replaceState({ playing });
		describeReadyState(playing ? 'Ready. Motion started.' : 'Paused.');
	}

	function pulse() {
		if (sceneState.stage !== 8) {
			statusMessage = 'Pulse is available in Explore mode and completed stage 8.';
			return;
		}
		safeTrack('ray_marching_pulse_used', { control: 'button-or-key' });
		if (!loadRequested || !ready) {
			pendingPulse = true;
			requestLoad();
			return;
		}
		pulseStatic = !sceneState.playing || reducedMotion;
		pulseToken += 1;
	}

	function restartMotion() {
		if (sceneState.stage !== 8) {
			statusMessage = 'Motion is available in Explore mode and completed stage 8.';
			return;
		}
		motionExplicitlyAllowed = true;
		sceneState = restartRayMarchingMotion(sceneState);
		restartToken += 1;
		if (!loadRequested || !ready) requestLoad();
		else
			describeReadyState('Motion restarted at deterministic time zero; scene settings were kept.');
	}

	function resetAll() {
		sceneState = resetRayMarchingState(sceneState);
		pendingPulse = false;
		pulseStatic = false;
		if (reducedMotion) {
			motionExplicitlyAllowed = false;
			replaceState({ playing: false });
		}
		qualityTier = chooseInitialRayMarchingQuality('auto', qualityHints);
		restartToken += 1;
		if (ready)
			describeReadyState('All scene, camera, quality, palette, and motion settings were reset.');
		else statusMessage = 'All scene, camera, quality, palette, and motion settings were reset.';
	}

	function updateCamera(camera: RayMarchingCamera) {
		replaceState({ camera });
	}

	function updateQuality(choice: RayMarchingQualityChoice) {
		replaceState({ quality: choice });
		qualityTier = chooseInitialRayMarchingQuality(choice, qualityHints);
		statusMessage = `Quality set to ${qualityLabels[choice]}${choice === 'auto' ? `; currently ${qualityLabels[qualityTier]}` : ''}.`;
	}

	async function copySceneLink() {
		const shareUrl = buildRayMarchingShareUrl(
			`${window.location.origin}${canonicalPath}`,
			sceneState
		);
		try {
			await navigator.clipboard.writeText(shareUrl);
			copyStatus = 'Scene link copied.';
			safeTrack('ray_marching_scene_link_copied');
		} catch {
			copyStatus =
				'Could not copy automatically; the address bar still has the canonical article URL.';
		}
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copyStatus = ''), 2600);
	}

	async function openSource() {
		if (document.fullscreenElement === shell) {
			fullscreenTrigger = null;
			await document.exitFullscreen();
		} else if (cssExpanded) {
			fullscreenTrigger = null;
			leaveCssExpanded(false);
		}
		await tick();
		const details = shell.querySelector<HTMLDetailsElement>('.source-explorer');
		if (!details) return;
		details.open = true;
		details.querySelector<HTMLElement>('summary')?.focus({ preventScroll: false });
	}

	function restoreFullscreenFocus() {
		const target = fullscreenTrigger;
		fullscreenTrigger = null;
		requestAnimationFrame(() => target?.focus({ preventScroll: true }));
	}

	function leaveCssExpanded(shouldRestoreFocus = true) {
		if (!cssExpanded) return;
		cssExpanded = false;
		document.body.style.overflow = previousBodyOverflow;
		if (shouldRestoreFocus) restoreFullscreenFocus();
	}

	async function toggleFullscreen(event: MouseEvent) {
		fullscreenTrigger = event.currentTarget as HTMLButtonElement;
		if (document.fullscreenElement === shell) {
			await document.exitFullscreen();
			return;
		}
		if (cssExpanded) {
			leaveCssExpanded();
			return;
		}

		try {
			if (!shell.requestFullscreen) throw new Error('Fullscreen API unavailable');
			await shell.requestFullscreen();
		} catch {
			previousBodyOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			cssExpanded = true;
			statusMessage = 'Expanded view opened. Press Escape or Exit expanded view to return.';
			safeTrack('ray_marching_fullscreen_entered', { mode: 'expanded-fallback' });
		}
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		forcedWebglOff = params.get('webgl') === 'off';
		captureMode = params.get('capture') === '1';
		const parsedShare = parseRayMarchingShareState(params);
		sceneState = createRayMarchingState({
			...sceneState,
			stage: parsedShare.state.stage,
			mode: parsedShare.state.stage === 8 ? 'explore' : 'build',
			debugView: parsedShare.state.debugView,
			palette: parsedShare.state.palette,
			camera: { yaw: parsedShare.state.yaw, pitch: parsedShare.state.pitch }
		});

		const nav = navigator as NavigatorWithHints;
		const connection = nav.connection;
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const coarseQuery = window.matchMedia('(pointer: coarse)');
		const updateEnvironment = () => {
			const enteredReducedMotion = motionQuery.matches && !reducedMotion;
			reducedMotion = motionQuery.matches;
			saveData = connection?.saveData === true;
			qualityHints = {
				width: Math.max(1, Math.round(frame?.clientWidth || window.innerWidth)),
				height: Math.max(1, Math.round(frame?.clientHeight || window.innerHeight)),
				devicePixelRatio: window.devicePixelRatio || 1,
				hardwareConcurrency: navigator.hardwareConcurrency,
				deviceMemory: nav.deviceMemory,
				coarsePointer: coarseQuery.matches,
				saveData
			};
			if (sceneState.quality === 'auto') {
				const suggestedTier = chooseInitialRayMarchingQuality('auto', qualityHints);
				const isDowngrade =
					qualityTier === 'high' || (qualityTier === 'balanced' && suggestedTier === 'saver');
				// Once loading starts, automatic environment hints may only remove work.
				if (!loadRequested || isDowngrade) qualityTier = suggestedTier;
			}
			if (enteredReducedMotion) {
				motionExplicitlyAllowed = false;
				restartToken += 1;
			}
			if (reducedMotion && !motionExplicitlyAllowed) {
				replaceState({ playing: false });
				if (ready) describeReadyState();
			}
		};
		updateEnvironment();

		if (captureMode) {
			replaceState({ playing: false, stage: parsedShare.state.stage });
			requestLoad();
		} else if (forcedWebglOff) {
			lifecycle = 'unavailable';
			statusMessage =
				'Fallback: WebGL is disabled for this visit. Showing the complete static version.';
			safeTrack('ray_marching_fallback_shown', { reason: 'query-disabled' });
		}

		const loadObserver = new IntersectionObserver(
			(entries) => {
				if (
					entries.some((entry) => entry.isIntersecting) &&
					!reducedMotion &&
					!saveData &&
					!forcedWebglOff
				) {
					requestLoad();
					loadObserver.disconnect();
				}
			},
			{ rootMargin: '360px 0px' }
		);
		loadObserver.observe(shell);

		const visibilityObserver = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				offscreen = entry ? entry.intersectionRatio < 0.03 : false;
				if (ready) describeReadyState();
			},
			{ threshold: 0.03 }
		);
		visibilityObserver.observe(frame);

		const handleVisibility = () => {
			documentHidden = document.hidden;
			if (ready) describeReadyState();
		};
		const handleFullscreenChange = () => {
			const wasFullscreen = nativeFullscreen;
			nativeFullscreen = document.fullscreenElement === shell;
			if (nativeFullscreen && !wasFullscreen) {
				statusMessage = 'Fullscreen view opened. Press Escape to return.';
				safeTrack('ray_marching_fullscreen_entered', { mode: 'native' });
			} else if (!nativeFullscreen && wasFullscreen) {
				restoreFullscreenFocus();
			}
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && cssExpanded) leaveCssExpanded();
		};

		documentHidden = document.hidden;
		document.addEventListener('visibilitychange', handleVisibility);
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		document.addEventListener('keydown', handleEscape);
		motionQuery.addEventListener('change', updateEnvironment);
		coarseQuery.addEventListener('change', updateEnvironment);
		connection?.addEventListener?.('change', updateEnvironment);

		return () => {
			loadObserver.disconnect();
			visibilityObserver.disconnect();
			document.removeEventListener('visibilitychange', handleVisibility);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('keydown', handleEscape);
			motionQuery.removeEventListener('change', updateEnvironment);
			coarseQuery.removeEventListener('change', updateEnvironment);
			connection?.removeEventListener?.('change', updateEnvironment);
			if (copyTimer) clearTimeout(copyTimer);
			if (cssExpanded) document.body.style.overflow = previousBodyOverflow;
		};
	});
</script>

<figure
	bind:this={shell}
	class:is-expanded={expanded}
	class="cathedral-exhibit not-prose my-10 overflow-hidden rounded-2xl border border-cyan-100/15 bg-[#030812] text-slate-100 shadow-[0_30px_90px_rgba(2,8,23,0.38)]"
	aria-labelledby={`${uid}-title`}
	aria-describedby={`${uid}-description ${uid}-caption`}
	data-ray-marching-state={lifecycle}
>
	<header class="exhibit-header">
		<div class="min-w-0">
			<p class="eyebrow">Live experiment · one WebGL canvas</p>
			<h2 id={`${uid}-title`}>{rayMarchingMetadata.title}</h2>
			<p class="deck">{rayMarchingMetadata.deck}</p>
		</div>
		<p id={`${uid}-status`} class="visible-status" aria-live="polite" aria-atomic="true">
			<span class="status-dot" aria-hidden="true"></span>{statusMessage}
		</p>
	</header>

	<p id={`${uid}-description`} class="sr-only">{rayMarchingMetadata.posterAlt}</p>

	<div bind:this={frame} class="stage-frame">
		<img
			src={rayMarchingMetadata.poster}
			alt={rayMarchingMetadata.posterAlt}
			width="1600"
			height="900"
			loading="eager"
			fetchpriority="high"
			class:poster-hidden={!posterVisible}
			class="poster"
		/>

		{#if loadRequested && !forcedWebglOff}
			<RayMarchingCanvas
				{snapshot}
				{qualityHints}
				load={loadRequested}
				{generation}
				{expanded}
				interactive={ready}
				{reducedMotion}
				{restartToken}
				{pulseToken}
				{pulseStatic}
				onstatus={handleSketchStatus}
				onready={handleReady}
				oncontextrestored={handleContextRestored}
				onqualitydowngrade={handleQualityDowngrade}
				oncamera={updateCamera}
				onpulse={pulse}
				ontoggleplayback={togglePlayback}
			/>
		{/if}

		{#if lifecycle === 'poster'}
			<div class="stage-overlay">
				<div class="overlay-card">
					<p>{reducedMotion || saveData ? 'Static mode is active.' : 'The poster is ready.'}</p>
					<button type="button" class="pill pill-primary" onclick={requestLoad}>
						Load interactive version
					</button>
				</div>
			</div>
		{:else if lifecycle === 'initializing'}
			<div class="loading-badge" role="status">Preparing one WebGL canvas…</div>
		{:else if lifecycle === 'unavailable' || lifecycle === 'shader-error' || lifecycle === 'context-lost'}
			<div class="stage-overlay fallback-overlay">
				<div class="overlay-card fallback-card">
					<strong
						>{lifecycle === 'context-lost'
							? 'WebGL context lost'
							: lifecycle === 'shader-error'
								? 'Shader could not start'
								: 'Static fallback'}</strong
					>
					<p>{statusMessage}</p>
					{#if !forcedWebglOff}
						<button type="button" class="pill" onclick={retry}>Retry</button>
					{/if}
				</div>
			</div>
		{/if}

		<noscript>
			<p class="noscript-note">
				JavaScript is unavailable, so the deterministic shader poster is shown. The complete
				walkthrough, diagram, and source remain readable below.
			</p>
		</noscript>
	</div>

	<div class="control-deck">
		<div class="primary-controls" aria-label="Cathedral controls">
			<div class="segmented" aria-label="Experience mode">
				<button
					type="button"
					class:active={sceneState.mode === 'explore'}
					aria-pressed={sceneState.mode === 'explore'}
					onclick={explore}>Explore</button
				>
				<button
					type="button"
					class:active={sceneState.mode === 'build'}
					aria-pressed={sceneState.mode === 'build'}
					onclick={buildIt}>Build it</button
				>
			</div>

			{#if sceneState.mode === 'build'}
				<button
					type="button"
					class="pill compact"
					disabled={sceneState.stage === 1}
					onclick={() => selectStage((sceneState.stage - 1) as RayMarchingStageId)}
					aria-label="Previous build stage">←</button
				>
				<span class="stage-count" aria-hidden="true">{sceneState.stage}/8</span>
				<button
					type="button"
					class="pill compact"
					disabled={sceneState.stage === 8}
					onclick={() => selectStage((sceneState.stage + 1) as RayMarchingStageId)}
					aria-label="Next build stage">→</button
				>
			{/if}

			<button
				type="button"
				class="pill pulse-button"
				disabled={sceneState.stage !== 8}
				aria-describedby={`${uid}-pulse-help`}
				onclick={pulse}>Pulse</button
			>
			<span id={`${uid}-pulse-help`} class="sr-only"
				>Pulse is available in Explore mode and completed stage 8.</span
			>
			<button
				type="button"
				class="pill"
				disabled={sceneState.stage !== 8}
				aria-describedby={`${uid}-motion-help`}
				onclick={togglePlayback}
			>
				{sceneState.playing ? 'Pause' : 'Start'}
			</button>
			<button
				type="button"
				class="pill"
				disabled={sceneState.stage !== 8}
				aria-describedby={`${uid}-motion-help`}
				onclick={restartMotion}>Restart motion</button
			>
			<span id={`${uid}-motion-help`} class="sr-only"
				>Motion controls are available in Explore mode and completed stage 8.</span
			>
			<button type="button" class="pill" onclick={resetAll}>Reset all</button>
			<button type="button" class="pill" onclick={toggleFullscreen}>
				{expanded ? 'Exit expanded view' : 'Fullscreen'}
			</button>
			<button type="button" class="pill" onclick={openSource}>Source</button>
		</div>

		{#if sceneState.mode === 'build'}
			<nav class="stage-rail" aria-label="Ray-marching build stages">
				{#each rayMarchingStages as stage (stage.stage)}
					<button
						type="button"
						class:active={stage.stage === sceneState.stage}
						aria-current={stage.stage === sceneState.stage ? 'step' : undefined}
						onclick={() => selectStage(stage.stage)}
					>
						<span>{stage.label}</span>{stage.title}
					</button>
				{/each}
			</nav>

			<section class="stage-reading" aria-labelledby={`${uid}-stage-title`}>
				<div>
					<p class="stage-kicker">Stage {currentStage.stage} of 8</p>
					<h3 id={`${uid}-stage-title`}>{currentStage.title}</h3>
					<p>{currentStage.explanation}</p>
					<p class="stage-callout">{currentStage.callout}</p>
				</div>
				<div class="stage-source">
					<p>{currentStage.filename} · running excerpt</p>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard-scrollable running source) -->
					<pre tabindex="0"><code>{currentStage.code}</code></pre>
				</div>
			</section>
		{/if}

		<details class="settings">
			<summary>Scene settings and explanatory views</summary>
			<div class="settings-grid">
				<label>
					<span
						>Quality <output
							>{qualityLabels[sceneState.quality]}{sceneState.quality === 'auto'
								? ` · ${qualityLabels[qualityTier]}`
								: ''}</output
						></span
					>
					<select
						value={sceneState.quality}
						onchange={(event) =>
							updateQuality(event.currentTarget.value as RayMarchingQualityChoice)}
					>
						<option value="auto">Auto</option>
						<option value="high">High</option>
						<option value="balanced">Balanced</option>
						<option value="saver">Saver</option>
					</select>
					<small>
						{qualityTier === 'saver'
							? '48 march steps; shadows and AO are compiled out.'
							: qualityTier === 'balanced'
								? `${RAY_MARCHING_QUALITY_PROFILES.balanced.mainSteps} march, 14 shadow, 4 AO samples.`
								: '96 march, 24 shadow, 5 AO samples.'}
					</small>
				</label>

				<label>
					<span>Debug view <output>{debugLabels[sceneState.debugView]}</output></span>
					<select
						value={sceneState.debugView}
						onchange={(event) =>
							replaceState({ debugView: event.currentTarget.value as RayMarchingDebugView })}
					>
						{#each Object.entries(debugLabels) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
					<small>March cost varies luminance as well as hue.</small>
				</label>

				<label>
					<span>Palette <output>{paletteLabels[sceneState.palette]}</output></span>
					<select
						value={sceneState.palette}
						onchange={(event) =>
							replaceState({ palette: event.currentTarget.value as RayMarchingPalette })}
					>
						{#each Object.entries(paletteLabels) as [value, label] (value)}
							<option {value}>{label}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Fog <output>{Math.round(sceneState.fogAmount * 100)}%</output></span>
					<input
						type="range"
						min="0.2"
						max="1"
						step="0.01"
						value={sceneState.fogAmount}
						oninput={(event) => replaceState({ fogAmount: Number(event.currentTarget.value) })}
					/>
				</label>

				<label>
					<span>Pulse speed <output>{sceneState.pulseSpeed.toFixed(1)}×</output></span>
					<input
						type="range"
						min="0.5"
						max="1.8"
						step="0.1"
						value={sceneState.pulseSpeed}
						oninput={(event) => replaceState({ pulseSpeed: Number(event.currentTarget.value) })}
					/>
				</label>

				<label>
					<span>Focal length <output>{sceneState.focalLength.toFixed(2)}</output></span>
					<input
						type="range"
						min="1.1"
						max="2.2"
						step="0.05"
						value={sceneState.focalLength}
						oninput={(event) => replaceState({ focalLength: Number(event.currentTarget.value) })}
					/>
				</label>
			</div>

			<div class="settings-footer">
				<button type="button" class="pill" onclick={copySceneLink}>Copy scene link</button>
				<p aria-live="polite">{copyStatus}</p>
			</div>
		</details>
	</div>

	<RayMarchingSourceExplorer onopen={() => safeTrack('ray_marching_source_opened')} />

	<figcaption id={`${uid}-caption`}>
		<strong>The Cathedral of Distance.</strong> A symmetrical hall of dark arches recedes into blue fog
		around a floating black orb. A narrow cyan-and-gold ring expands over the floor, columns, and archways.
		The visible 3D surfaces are procedural and implicit; p5 still rasterises one host rectangle underneath.
	</figcaption>
</figure>

<style>
	.cathedral-exhibit {
		--panel: #07111f;
		--line: rgb(165 243 252 / 0.17);
		isolation: isolate;
		width: 100%;
		max-width: 100%;
	}

	.exhibit-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(14rem, 0.42fr);
		gap: 1rem;
		align-items: end;
		padding: 1.1rem 1.25rem;
		border-bottom: 1px solid var(--line);
		background:
			radial-gradient(circle at 12% -20%, rgb(34 211 238 / 0.13), transparent 42%), #030812;
	}

	.eyebrow,
	.deck,
	.visible-status,
	.stage-kicker,
	.stage-source > p,
	.settings-footer p {
		margin: 0;
		text-align: left;
	}

	.eyebrow,
	.stage-kicker {
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #67e8f9;
	}

	.exhibit-header h2 {
		margin: 0.2rem 0 0;
		font-size: clamp(1.25rem, 2.5vw, 1.8rem);
		line-height: 1.15;
		color: white;
	}

	.deck {
		margin-top: 0.45rem;
		font-size: 0.92rem;
		line-height: 1.5;
		color: #bac8da;
	}

	.visible-status {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
		font-size: 0.75rem;
		line-height: 1.45;
		color: #94a3b8;
	}

	.status-dot {
		width: 0.5rem;
		height: 0.5rem;
		margin-top: 0.27rem;
		flex: none;
		border-radius: 999px;
		background: #22d3ee;
		box-shadow: 0 0 0.7rem rgb(34 211 238 / 0.7);
	}

	.stage-frame {
		position: relative;
		width: 100%;
		min-height: 18rem;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background: #02050b;
	}

	.poster {
		position: absolute;
		z-index: 2;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 1;
		transition: opacity 180ms ease;
	}

	.poster-hidden {
		opacity: 0;
		pointer-events: none;
	}

	.stage-overlay {
		position: absolute;
		z-index: 4;
		inset: 0;
		display: grid;
		place-items: end center;
		padding: 1rem;
		pointer-events: none;
	}

	.overlay-card {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		max-width: 36rem;
		padding: 0.55rem 0.65rem 0.55rem 1rem;
		border: 1px solid rgb(255 255 255 / 0.24);
		border-radius: 999px;
		background: rgb(2 6 23 / 0.88);
		box-shadow: 0 0.8rem 2.5rem rgb(0 0 0 / 0.45);
		backdrop-filter: blur(10px);
		pointer-events: auto;
	}

	.overlay-card p {
		margin: 0;
		font-size: 0.78rem;
		color: #d7e3ef;
	}

	.fallback-overlay {
		place-items: center;
		background: rgb(2 6 23 / 0.2);
	}

	.fallback-card {
		display: grid;
		max-width: 34rem;
		border-radius: 0.9rem;
		padding: 1rem;
	}

	.fallback-card strong {
		color: white;
	}

	.loading-badge {
		position: absolute;
		z-index: 5;
		right: 0.8rem;
		bottom: 0.8rem;
		padding: 0.55rem 0.8rem;
		border: 1px solid rgb(103 232 249 / 0.3);
		border-radius: 999px;
		background: rgb(2 6 23 / 0.86);
		font-size: 0.75rem;
		color: #cffafe;
	}

	.noscript-note {
		position: absolute;
		z-index: 6;
		inset: auto 0 0;
		margin: 0;
		padding: 0.75rem 1rem;
		background: rgb(2 6 23 / 0.9);
		font-size: 0.78rem;
		color: #e2e8f0;
	}

	.control-deck {
		border-top: 1px solid var(--line);
		background: #050c17;
	}

	.primary-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		padding: 0.8rem 1rem;
	}

	.pill,
	.segmented button,
	.stage-rail button {
		min-height: 2.75rem;
		border: 1px solid rgb(148 163 184 / 0.34);
		border-radius: 0.62rem;
		background: rgb(15 23 42 / 0.76);
		padding: 0.55rem 0.85rem;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 750;
		color: #e2e8f0;
		cursor: pointer;
	}

	.pill:hover,
	.segmented button:hover,
	.stage-rail button:hover {
		border-color: rgb(103 232 249 / 0.65);
		background: #101d2e;
	}

	.pill:focus-visible,
	.segmented button:focus-visible,
	.stage-rail button:focus-visible,
	.settings summary:focus-visible,
	.settings :is(select, input):focus-visible {
		outline: 2px solid #67e8f9;
		outline-offset: 2px;
	}

	.pill:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.pill-primary,
	.pulse-button,
	.segmented .active {
		border-color: #67e8f9;
		background: #67e8f9;
		color: #03111a;
	}

	.pulse-button {
		border-color: #fbbf24;
		background: linear-gradient(110deg, #67e8f9, #fbbf24);
	}

	.compact {
		width: 2.75rem;
		padding-inline: 0;
		font-size: 1rem;
	}

	.segmented {
		display: inline-grid;
		grid-template-columns: 1fr 1fr;
		border-radius: 0.68rem;
		background: #020617;
	}

	.segmented button:first-child {
		border-radius: 0.62rem 0 0 0.62rem;
	}

	.segmented button:last-child {
		margin-left: -1px;
		border-radius: 0 0.62rem 0.62rem 0;
	}

	.stage-count {
		min-width: 2.2rem;
		text-align: center;
		font:
			700 0.75rem/1 ui-monospace,
			monospace;
		color: #a5f3fc;
	}

	.stage-rail {
		display: grid;
		grid-template-columns: repeat(8, minmax(6.5rem, 1fr));
		gap: 0.45rem;
		overflow-x: auto;
		padding: 0 1rem 0.9rem;
		scrollbar-color: #334155 transparent;
	}

	.stage-rail button {
		display: grid;
		gap: 0.18rem;
		min-width: 6.5rem;
		text-align: left;
		font-size: 0.72rem;
		font-weight: 650;
	}

	.stage-rail button span {
		font:
			800 0.66rem/1 ui-monospace,
			monospace;
		color: #67e8f9;
	}

	.stage-rail button.active {
		border-color: #fbbf24;
		background: rgb(251 191 36 / 0.1);
		box-shadow: inset 0 -2px #fbbf24;
	}

	.stage-reading {
		display: grid;
		grid-template-columns: minmax(16rem, 0.72fr) minmax(0, 1.28fr);
		gap: 1rem;
		padding: 1rem;
		border-top: 1px solid var(--line);
		background: #06101d;
	}

	.stage-reading h3 {
		margin: 0.2rem 0 0.55rem;
		font-size: 1.2rem;
		color: white;
	}

	.stage-reading p {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.6;
		color: #cbd5e1;
	}

	.stage-reading .stage-callout {
		margin-top: 0.75rem;
		padding-left: 0.75rem;
		border-left: 2px solid #fbbf24;
		color: #fde68a;
	}

	.stage-source {
		min-width: 0;
		overflow: hidden;
		border: 1px solid #1e293b;
		border-radius: 0.65rem;
		background: #020617;
	}

	.stage-source > p {
		padding: 0.55rem 0.75rem;
		border-bottom: 1px solid #1e293b;
		font:
			600 0.68rem/1.4 ui-monospace,
			monospace;
		color: #94a3b8;
	}

	.stage-source pre {
		max-height: 15rem;
		margin: 0;
		overflow: auto;
		padding: 0.8rem;
		background: transparent;
		font-size: 0.72rem;
		line-height: 1.55;
		color: #e2e8f0;
	}

	.settings {
		border-top: 1px solid var(--line);
	}

	.settings summary {
		min-height: 2.75rem;
		padding: 0.8rem 1rem;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 750;
		color: #cbd5e1;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		padding: 0.2rem 1rem 1rem;
	}

	.settings label {
		display: grid;
		align-content: start;
		gap: 0.4rem;
		min-width: 0;
		font-size: 0.76rem;
		font-weight: 700;
		color: #e2e8f0;
	}

	.settings label > span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.settings output,
	.settings small {
		font-weight: 500;
		color: #94a3b8;
	}

	.settings :is(select, input[type='range']) {
		width: 100%;
		min-height: 2.75rem;
	}

	.settings select {
		border: 1px solid #475569;
		border-radius: 0.45rem;
		background: #0f172a;
		padding: 0 0.65rem;
		color: white;
	}

	.settings input[type='range'] {
		accent-color: #22d3ee;
		cursor: pointer;
	}

	.settings-footer {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0 1rem 1rem;
	}

	.settings-footer p {
		font-size: 0.75rem;
		color: #a5f3fc;
	}

	figcaption {
		padding: 0.85rem 1rem;
		border-top: 1px solid var(--line);
		font-size: 0.78rem;
		line-height: 1.55;
		color: #94a3b8;
	}

	figcaption strong {
		color: #dbeafe;
	}

	.cathedral-exhibit.is-expanded,
	.cathedral-exhibit:fullscreen {
		display: flex;
		flex-direction: column;
		width: 100vw;
		height: 100dvh;
		max-width: none;
		margin: 0;
		border: 0;
		border-radius: 0;
		background: #02050b;
	}

	.cathedral-exhibit.is-expanded {
		position: fixed;
		z-index: 1000;
		inset: 0;
	}

	.is-expanded .stage-frame,
	.cathedral-exhibit:fullscreen .stage-frame {
		flex: 1 1 auto;
		min-height: min(58dvh, 42rem);
		aspect-ratio: auto;
	}

	.is-expanded .control-deck,
	.cathedral-exhibit:fullscreen .control-deck {
		max-height: 42dvh;
		overflow: auto;
	}

	.is-expanded :global(.source-explorer),
	.cathedral-exhibit:fullscreen :global(.source-explorer),
	.is-expanded figcaption,
	.cathedral-exhibit:fullscreen figcaption {
		display: none;
	}

	@media (max-width: 760px) {
		.exhibit-header {
			grid-template-columns: 1fr;
			gap: 0.6rem;
			padding: 0.9rem;
		}

		.stage-frame {
			min-height: 16rem;
			aspect-ratio: 4 / 3;
		}

		.poster {
			object-position: center;
		}

		.primary-controls,
		.stage-rail,
		.stage-reading,
		.settings-grid,
		.settings-footer {
			padding-right: 0.75rem;
			padding-left: 0.75rem;
		}

		.stage-reading {
			grid-template-columns: 1fr;
		}

		.settings-grid {
			grid-template-columns: 1fr;
		}

		.overlay-card {
			width: 100%;
			border-radius: 0.8rem;
		}

		.settings-footer {
			align-items: flex-start;
			flex-direction: column;
		}
	}

	@media (max-width: 380px) {
		.stage-frame {
			min-height: 15rem;
		}

		.primary-controls {
			gap: 0.4rem;
		}

		.pill,
		.segmented button {
			padding-inline: 0.66rem;
			font-size: 0.73rem;
		}
	}

	@media (max-height: 520px) and (orientation: landscape) {
		.cathedral-exhibit.is-expanded .exhibit-header,
		.cathedral-exhibit:fullscreen .exhibit-header {
			display: none;
		}

		.is-expanded .stage-frame,
		.cathedral-exhibit:fullscreen .stage-frame {
			min-height: 62dvh;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.poster,
		.pill,
		.segmented button,
		.stage-rail button {
			transition: none;
		}
	}
</style>
