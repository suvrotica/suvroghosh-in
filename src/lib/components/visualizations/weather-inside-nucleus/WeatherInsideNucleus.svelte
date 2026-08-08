<script module lang="ts">
	let stageFailedThisSession = false;
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ColdOpenStage from './ColdOpenStage.svelte';
	import PortraitPoster from './PortraitPoster.svelte';
	import {
		evaluateStageEligibility,
		evaluateStagePrerequisites,
		isEligibleViewport,
		type StageEligibilityMode
	} from '$lib/visualizations/weather-inside-nucleus/eligibility';

	type ExperienceMode = 'cold-open' | 'guided' | 'experiment' | 'static';
	type GuidedComponent = typeof import('./WeatherGuidedFilm.svelte').default;
	type ExperimentComponent = typeof import('./WeatherExperiment.svelte').default;

	const COLD_OPEN_DURATION_MS = 3_000;
	const MAX_FRAME_DELTA_MS = 100;

	let root!: HTMLElement;
	let hydrated = $state(false);
	let experienceMode: ExperienceMode = $state('static');
	let eligibilityMode: StageEligibilityMode = $state('static-viewport');
	let coldElapsedMs = $state(0);
	let coldRunning = $state(false);
	let coldPaused = $state(false);
	let coldComplete = $state(false);
	let reducedMotion = $state(false);
	let highContrast = $state(false);
	let explicitSaveDataOverride = $state(false);
	let rotatedIntoEligibility = $state(false);
	let loadingExperience = $state(false);
	let loadMessage = $state('');
	let visible = true;
	let guidedComponent: GuidedComponent | null = $state(null);
	let experimentComponent: ExperimentComponent | null = $state(null);
	let animationFrame = 0;
	let previousFrame = 0;
	let resizeFrame = 0;
	let cachedWebgl2Availability: boolean | null = null;

	let coldProgress = $derived(Math.min(1, coldElapsedMs / COLD_OPEN_DURATION_MS));
	let staticReason = $derived(posterReason(eligibilityMode));
	let mayOfferLoad = $derived(canOfferInteractiveLoad(eligibilityMode));

	function posterReason(mode: StageEligibilityMode): 'viewport' | 'save-data' | 'failure' {
		if (mode === 'static-save-data') return 'save-data';
		if (mode === 'static-failure') return 'failure';
		return 'viewport';
	}

	function canOfferInteractiveLoad(mode: StageEligibilityMode): boolean {
		if (!hydrated || typeof window === 'undefined') return false;
		return (
			(rotatedIntoEligibility && mode === 'eligible') ||
			(mode === 'static-save-data' && isEligibleViewport(window.innerWidth, window.innerHeight))
		);
	}

	function webgl2Available(): boolean {
		if (cachedWebgl2Availability !== null) return cachedWebgl2Availability;
		const probe = document.createElement('canvas');
		const context = probe.getContext('webgl2', {
			alpha: false,
			antialias: false,
			depth: true,
			failIfMajorPerformanceCaveat: true,
			powerPreference: 'high-performance'
		});
		if (!context) {
			stageFailedThisSession = true;
			cachedWebgl2Availability = false;
			return false;
		}
		context.getExtension('WEBGL_lose_context')?.loseContext();
		cachedWebgl2Availability = true;
		return cachedWebgl2Availability;
	}

	function currentPreferences() {
		const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
		const motionSetting = new URLSearchParams(window.location.search).get('motion')?.toLowerCase();
		return {
			width: window.innerWidth,
			height: window.innerHeight,
			saveData: connection.connection?.saveData === true,
			explicitSaveDataOverride,
			sessionFailure: stageFailedThisSession,
			prefersReducedMotion:
				window.matchMedia('(prefers-reduced-motion: reduce)').matches || motionSetting === 'reduce',
			stillSetting: document.documentElement.dataset.motion === 'still' || motionSetting === 'still'
		};
	}

	function updatePreferences(): void {
		const query = new URLSearchParams(window.location.search);
		const motionSetting = query.get('motion')?.toLowerCase();
		reducedMotion =
			window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
			document.documentElement.dataset.motion === 'still' ||
			motionSetting === 'reduce' ||
			motionSetting === 'still';
		highContrast =
			window.matchMedia('(forced-colors: active), (prefers-contrast: more)').matches ||
			document.documentElement.dataset.theme === 'high-contrast' ||
			query.get('contrast')?.toLowerCase() === 'high';
	}

	function assessEligibility(initial = false): void {
		updatePreferences();
		const preferences = currentPreferences();
		const previous = eligibilityMode;
		const prerequisites = evaluateStagePrerequisites(preferences);
		if (prerequisites.kind === 'probe-webgl2' && !initial && experienceMode === 'static') {
			eligibilityMode = 'eligible';
			rotatedIntoEligibility = true;
			experienceMode = 'static';
			stopColdOpen();
			return;
		}

		const next =
			prerequisites.kind === 'resolved'
				? prerequisites.result.mode
				: evaluateStageEligibility(preferences, webgl2Available).mode;
		eligibilityMode = next;

		if (!initial && previous !== 'eligible' && next === 'eligible') {
			rotatedIntoEligibility = true;
			experienceMode = 'static';
			stopColdOpen();
			return;
		}

		if (next === 'eligible') {
			if (initial) beginColdOpen();
			return;
		}

		if (next === 'reduced-stills') {
			coldElapsedMs = COLD_OPEN_DURATION_MS;
			coldComplete = true;
			coldPaused = true;
			coldRunning = false;
			experienceMode = 'cold-open';
			return;
		}

		unmountInteractive();
		experienceMode = 'static';
	}

	function shouldAdvanceColdOpen(): boolean {
		return (
			experienceMode === 'cold-open' &&
			coldRunning &&
			!coldPaused &&
			!coldComplete &&
			visible &&
			!document.hidden
		);
	}

	function scheduleColdOpen(): void {
		if (!animationFrame && shouldAdvanceColdOpen())
			animationFrame = requestAnimationFrame(coldFrame);
	}

	function coldFrame(now: number): void {
		animationFrame = 0;
		if (!shouldAdvanceColdOpen()) {
			previousFrame = 0;
			return;
		}
		const delta = previousFrame
			? Math.min(MAX_FRAME_DELTA_MS, Math.max(0, now - previousFrame))
			: 1000 / 60;
		previousFrame = now;
		coldElapsedMs = Math.min(COLD_OPEN_DURATION_MS, coldElapsedMs + delta);
		if (coldElapsedMs >= COLD_OPEN_DURATION_MS) {
			coldElapsedMs = COLD_OPEN_DURATION_MS;
			coldComplete = true;
			coldRunning = false;
			previousFrame = 0;
			return;
		}
		scheduleColdOpen();
	}

	function beginColdOpen(): void {
		experienceMode = 'cold-open';
		rotatedIntoEligibility = false;
		coldElapsedMs = 0;
		coldComplete = false;
		coldPaused = false;
		coldRunning = !reducedMotion;
		previousFrame = 0;
		if (reducedMotion) {
			coldElapsedMs = COLD_OPEN_DURATION_MS;
			coldComplete = true;
			coldPaused = true;
		} else {
			scheduleColdOpen();
		}
	}

	function stopColdOpen(): void {
		if (animationFrame) cancelAnimationFrame(animationFrame);
		animationFrame = 0;
		previousFrame = 0;
		coldRunning = false;
	}

	function toggleColdPause(): void {
		if (coldComplete) return;
		coldPaused = !coldPaused;
		previousFrame = 0;
		if (!coldPaused) scheduleColdOpen();
	}

	async function settleExperienceAtTop(): Promise<void> {
		await tick();
		root.scrollIntoView({ block: 'start', behavior: 'auto' });
		root.focus({ preventScroll: true });
	}

	function replayOpening(): void {
		beginColdOpen();
		void settleExperienceAtTop();
	}

	async function followSignal(): Promise<void> {
		if (loadingExperience) return;
		loadingExperience = true;
		loadMessage = 'Preparing the guided scientific film…';
		try {
			const loaded = await import('./WeatherGuidedFilm.svelte');
			guidedComponent = loaded.default;
			experimentComponent = null;
			experienceMode = 'guided';
			stopColdOpen();
			loadMessage = '';
			await settleExperienceAtTop();
		} catch (error) {
			handleStageFailure(
				error instanceof Error ? error.message : 'The guided film could not load.'
			);
		} finally {
			loadingExperience = false;
		}
	}

	async function openExperiment(): Promise<void> {
		if (loadingExperience) return;
		loadingExperience = true;
		loadMessage = 'Preparing the intervention experiment…';
		try {
			const loaded = await import('./WeatherExperiment.svelte');
			experimentComponent = loaded.default;
			guidedComponent = null;
			experienceMode = 'experiment';
			stopColdOpen();
			loadMessage = '';
			await settleExperienceAtTop();
		} catch (error) {
			handleStageFailure(error instanceof Error ? error.message : 'The experiment could not load.');
		} finally {
			loadingExperience = false;
		}
	}

	function handleStageFailure(message = 'The live stage could not continue safely.'): void {
		stageFailedThisSession = true;
		eligibilityMode = 'static-failure';
		loadMessage = message;
		unmountInteractive();
		experienceMode = 'static';
	}

	function unmountInteractive(): void {
		guidedComponent = null;
		experimentComponent = null;
		stopColdOpen();
	}

	function overrideSaveData(): void {
		explicitSaveDataOverride = true;
		rotatedIntoEligibility = false;
		assessEligibility(true);
	}

	function handleLoadInteractive(): void {
		if (eligibilityMode === 'static-save-data') {
			overrideSaveData();
			return;
		}
		if (eligibilityMode === 'eligible') beginColdOpen();
	}

	onMount(() => {
		hydrated = true;
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const contrastQuery = window.matchMedia('(forced-colors: active), (prefers-contrast: more)');
		const observer = new IntersectionObserver(
			(entries) => {
				visible = entries[0]?.isIntersecting ?? true;
				previousFrame = 0;
				if (visible) scheduleColdOpen();
			},
			{ rootMargin: '120px' }
		);
		const attributeObserver = new MutationObserver(() => assessEligibility());
		const handlePreference = () => assessEligibility();
		const handleVisibility = () => {
			previousFrame = 0;
			if (!document.hidden) scheduleColdOpen();
		};
		const handleResize = () => {
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(() => {
				resizeFrame = 0;
				assessEligibility();
			});
		};

		observer.observe(root);
		attributeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-motion', 'data-theme']
		});
		motionQuery.addEventListener('change', handlePreference);
		contrastQuery.addEventListener('change', handlePreference);
		window.addEventListener('resize', handleResize, { passive: true });
		document.addEventListener('visibilitychange', handleVisibility);
		assessEligibility(true);

		return () => {
			unmountInteractive();
			observer.disconnect();
			attributeObserver.disconnect();
			motionQuery.removeEventListener('change', handlePreference);
			contrastQuery.removeEventListener('change', handlePreference);
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('visibilitychange', handleVisibility);
			if (resizeFrame) cancelAnimationFrame(resizeFrame);
		};
	});
</script>

<svelte:head>
	<meta name="theme-color" content="#03050b" />
</svelte:head>

<h1 class="sr-only">Weather Inside the Nucleus</h1>

<section
	bind:this={root}
	class:high-contrast={highContrast}
	class:reduced-motion={reducedMotion}
	class="weather-directed-experience article-breakout not-prose"
	data-testid="weather-inside-nucleus"
	data-experience-mode={experienceMode}
	data-eligibility={eligibilityMode}
	tabindex="-1"
>
	{#if !hydrated}
		<div class="ssr-desktop-primer" aria-hidden="true">
			<ColdOpenStage progress={0} />
		</div>
		<div class="ssr-static-primer">
			<PortraitPoster />
		</div>
	{:else if experienceMode === 'static'}
		<div class="static-route">
			<PortraitPoster
				reason={staticReason}
				showLoad={mayOfferLoad}
				onloadinteractive={handleLoadInteractive}
			/>
			{#if loadMessage}<p class="fallback-note" role="status">{loadMessage}</p>{/if}
		</div>
	{:else if experienceMode === 'cold-open'}
		<div
			class="cinematic-stage"
			data-cold-complete={coldComplete}
			data-cold-elapsed-ms={coldElapsedMs.toFixed(0)}
		>
			<div class="cold-visual">
				<ColdOpenStage progress={coldProgress} {highContrast} {reducedMotion} />
			</div>
			<button class="cold-pause" type="button" disabled={coldComplete} onclick={toggleColdPause}>
				{coldComplete ? 'Opening held' : coldPaused ? 'Resume opening' : 'Pause opening'}
			</button>
			{#if coldProgress >= 1.65 / 3}
				<p class="cold-cue">A signal arrives. A gene hesitates.</p>
			{/if}
			{#if coldComplete}
				<div class="title-sting" aria-hidden="true">
					<span>Weather Inside</span>
					<strong>the Nucleus</strong>
				</div>
				<p class="cold-disclosure">
					schematic prelude · not an individual ligand count or model event
				</p>
				<div class="cold-actions" aria-label="Opening controls">
					<button
						class="primary"
						type="button"
						disabled={loadingExperience}
						onclick={() => void followSignal()}
					>
						{loadingExperience ? 'Preparing film…' : 'Follow the signal'}
					</button>
					<button type="button" disabled={loadingExperience} onclick={() => void openExperiment()}>
						Skip to the experiment
					</button>
					<button type="button" onclick={replayOpening}>Replay opening</button>
				</div>
			{/if}
			{#if loadMessage}<p class="load-status" role="status">{loadMessage}</p>{/if}
			<p class="sr-only" aria-live="polite">
				{coldComplete
					? 'The cold open is paused. EGF remains outside, docked at EGFR, and the first local intracellular response has begun.'
					: ''}
			</p>
		</div>
	{:else if experienceMode === 'guided' && guidedComponent}
		{@const GuidedExperience = guidedComponent}
		<GuidedExperience
			{reducedMotion}
			{highContrast}
			onexperiment={() => void openExperiment()}
			onreplaytour={replayOpening}
			onfailure={handleStageFailure}
		/>
	{:else if experienceMode === 'experiment' && experimentComponent}
		{@const ExperimentExperience = experimentComponent}
		<div class="experiment-shell">
			<div class="experiment-heading">
				<p>Free experiment</p>
				<h2>Change one modeled cause.</h2>
				<button type="button" onclick={replayOpening}>Replay the guided tour</button>
			</div>
			<ExperimentExperience startInExperiment={true} />
		</div>
	{/if}

	{#if experienceMode === 'guided' || experienceMode === 'experiment' || (experienceMode === 'cold-open' && coldComplete)}
		<footer class="directed-meta">
			<span>synthetic gene-regulation demonstration locus</span>
			<span>film time ≠ model time</span>
			<span>By Suvro Ghosh · Updated <time datetime="2026-08-09">9 August 2026</time></span>
		</footer>
	{/if}
</section>

<style>
	:global(body:has(.weather-directed-experience) nav[aria-label='Breadcrumb']) {
		display: none;
	}

	.weather-directed-experience {
		--film-bg: #03050b;
		--film-text: #f8fbff;
		--film-muted: #b9bdca;
		--film-amber: #ffd58a;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: 100vw;
		margin: 0 0 clamp(2.5rem, 8vw, 7rem);
		transform: translateX(-50%);
		background: var(--film-bg);
		color: var(--film-text);
		color-scheme: dark;
		isolation: isolate;
		scroll-margin-top: 4.5rem;
	}

	.ssr-desktop-primer,
	.cinematic-stage {
		min-height: max(680px, calc(100svh - 4.5rem));
	}

	.ssr-static-primer {
		display: none;
		padding: 1rem;
	}

	.ssr-desktop-primer {
		display: block;
	}

	.static-route {
		min-height: 35rem;
		padding: clamp(0.75rem, 3vw, 2rem);
	}

	.cinematic-stage {
		position: relative;
		overflow: hidden;
		background: #03050b;
	}

	.cold-visual {
		position: absolute;
		inset: 0;
	}

	.cold-cue {
		position: absolute;
		top: clamp(5rem, 17vh, 9rem);
		right: clamp(2rem, 9vw, 9rem);
		z-index: 2;
		width: min(42vw, 31rem);
		margin: 0;
		color: #f8edd2;
		font: 660 clamp(1rem, 2vw, 1.55rem) / 1.25 var(--font-serif, serif);
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.title-sting {
		position: absolute;
		right: clamp(2rem, 7vw, 7rem);
		bottom: clamp(8.5rem, 18vh, 12rem);
		z-index: 3;
		display: grid;
		width: min(46vw, 39rem);
		pointer-events: none;
	}

	.title-sting span,
	.title-sting strong {
		font: 790 clamp(2.35rem, 6vw, 6.4rem) / 0.84 var(--font-sans, sans-serif);
		letter-spacing: -0.065em;
		text-wrap: balance;
	}

	.title-sting span {
		color: #f7f9ff;
	}

	.title-sting strong {
		color: var(--film-amber);
	}

	.cold-disclosure {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		z-index: 3;
		max-width: min(32rem, 44vw);
		margin: 0;
		color: #8f93a4;
		font:
			700 0.62rem/1.35 var(--font-mono, 'Courier Prime'),
			ui-monospace,
			monospace;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.cold-actions {
		position: absolute;
		right: clamp(1rem, 4vw, 4rem);
		bottom: clamp(1rem, 4vh, 2.5rem);
		z-index: 4;
		display: flex;
		max-width: min(92vw, 54rem);
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.55rem;
	}

	.cold-pause {
		position: absolute;
		top: 1rem;
		right: 1rem;
		z-index: 5;
	}

	button {
		border: 1px solid rgb(244 239 223 / 40%);
		border-radius: 999px;
		background: rgb(4 6 13 / 84%);
		padding: 0.72rem 1rem;
		color: #f7f7fb;
		font: 720 0.78rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
		backdrop-filter: blur(12px);
	}

	button.primary {
		border-color: var(--film-amber);
		background: var(--film-amber);
		color: #191204;
	}

	button:focus-visible {
		outline: 3px solid #8ceafa;
		outline-offset: 3px;
	}

	button:disabled {
		cursor: wait;
		opacity: 0.6;
	}

	.load-status,
	.fallback-note {
		position: absolute;
		left: 50%;
		bottom: 1.2rem;
		z-index: 5;
		margin: 0;
		transform: translateX(-50%);
		border-radius: 999px;
		background: rgb(3 5 11 / 90%);
		padding: 0.5rem 0.8rem;
		color: #d8d9e3;
		font: 0.72rem/1.3 var(--font-sans, sans-serif);
	}

	.fallback-note {
		position: relative;
		bottom: auto;
		margin-top: 1rem;
		text-align: center;
	}

	.directed-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.45rem 1.25rem;
		border-top: 1px solid rgb(160 164 190 / 22%);
		background: #050711;
		padding: 0.8rem 1rem;
		color: #8f92a3;
		font:
			700 0.62rem/1.4 var(--font-mono, 'Courier Prime'),
			ui-monospace,
			monospace;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.experiment-shell {
		background: #050711;
		padding-top: 1rem;
	}

	.experiment-heading {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		width: min(92vw, 88rem);
		margin-inline: auto;
		padding: clamp(1rem, 3vw, 2rem);
	}

	.experiment-heading p,
	.experiment-heading h2 {
		margin: 0;
	}

	.experiment-heading p {
		grid-column: 1;
		color: #8de5f5;
		font: 750 0.66rem/1.2 var(--font-sans, sans-serif);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.experiment-heading h2 {
		grid-column: 1;
		font: 780 clamp(1.7rem, 4vw, 3.5rem) / 1 var(--font-sans, sans-serif);
		letter-spacing: -0.045em;
	}

	.experiment-heading button {
		grid-column: 2;
		grid-row: 1 / span 2;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.high-contrast button {
		border-color: #fff;
		background: #000;
		color: #fff;
	}

	.high-contrast button.primary {
		background: #fff;
		color: #000;
	}

	@media (max-width: 899px), (max-height: 599px), (max-aspect-ratio: 4/3) {
		.weather-directed-experience {
			left: auto;
			width: auto;
			margin-inline: calc(var(--article-breakout-offset, 0rem) * -1);
			transform: none;
			background: transparent;
		}

		.ssr-desktop-primer {
			display: none;
		}

		.ssr-static-primer {
			display: block;
		}

		.static-route {
			min-height: 0;
			padding: 0.5rem 0;
		}
	}

	@media (max-width: 680px) {
		.experiment-heading {
			grid-template-columns: 1fr;
			gap: 0.8rem;
		}

		.experiment-heading button {
			grid-column: 1;
			grid-row: auto;
			justify-self: start;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
		}
	}

	@media (forced-colors: active) {
		.weather-directed-experience,
		.cinematic-stage,
		.experiment-shell,
		.directed-meta,
		button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
