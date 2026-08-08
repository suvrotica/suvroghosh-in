<script lang="ts">
	import { onMount } from 'svelte';
	import {
		createFilmClock,
		reduceFilmClock,
		sampleDirectedFrame,
		type FilmClockState
	} from '$lib/visualizations/weather-inside-nucleus/film/clock';
	import {
		DIRECTED_BEATS,
		TOUR_DURATION_MS,
		type DirectedBeatId
	} from '$lib/visualizations/weather-inside-nucleus/film/direction';
	import { createModelParameters } from '$lib/visualizations/weather-inside-nucleus/model';
	import type { NucleusDirectedBeat } from '$lib/visualizations/weather-inside-nucleus/render/types';
	import {
		createWeatherNucleusWorkerClient,
		type WeatherNucleusWorkerClient
	} from '$lib/visualizations/weather-inside-nucleus/worker/client';
	import type {
		CompactMatchedEnsembleResult,
		FocalPairResult
	} from '$lib/visualizations/weather-inside-nucleus/worker/protocol';
	import DirectedTableau from './DirectedTableau.svelte';
	import WeatherStage, {
		type WeatherStageFallbackContext,
		type WeatherStageStatus
	} from './WeatherStage.svelte';

	type Props = {
		reducedMotion?: boolean;
		highContrast?: boolean;
		onexperiment?: () => void;
		onreplaytour?: () => void;
		onfailure?: (message?: string) => void;
	};

	let {
		reducedMotion = false,
		highContrast = false,
		onexperiment,
		onreplaytour,
		onfailure
	}: Props = $props();

	const reducedOpening = DIRECTED_BEATS[0].autoplayDurationMs;

	let filmRoot!: HTMLElement;
	let workerClient = $state<WeatherNucleusWorkerClient | null>(null);
	let focal = $state<FocalPairResult | null>(null);
	let ensemble = $state<CompactMatchedEnsembleResult | null>(null);
	let modelStatus = $state<'loading' | 'ready' | 'error'>('loading');
	let modelMessage = $state('Calculating the pinned seed 0 history…');
	let focalRunMs = $state(0);
	let ensembleRunMs = $state(0);
	let fullscreen = $state(false);
	let clock: FilmClockState = $state(createFilmClock({ status: 'paused' }));

	let frame = $derived(sampleDirectedFrame(clock));
	let beat = $derived(frame.beat);
	let directedBeat = $derived(rendererBeat(beat.id));
	let modelTime = $derived(frame.model.kind === 'trace' ? frame.model.modelTime : null);
	let modelBoundary = $derived(frame.model.kind === 'trace' ? frame.model.boundary : 'at');
	let activeCaption = $derived.by(() => {
		const captions = frame.visibleTextCues.filter((cue) => cue.kind === 'caption');
		return captions.at(-1)?.text ?? '';
	});
	let overlayTableau = $derived(
		reducedMotion || ['histories', 'silent', 'burst', 'probability'].includes(directedBeat)
	);
	let tourElapsedMs = $derived.by(() => {
		let elapsed = frame.beatTimeMs;
		for (let index = 0; index < frame.beatIndex; index += 1) {
			elapsed += DIRECTED_BEATS[index].autoplayDurationMs;
		}
		return elapsed;
	});
	let ensembleReady = $derived(ensemble !== null);

	function rendererBeat(id: DirectedBeatId): NucleusDirectedBeat {
		switch (id) {
			case 'boundary':
				return 'boundary';
			case 'relay':
				return 'relay';
			case 'nuclear-activity':
				return 'nuclear';
			case 'scale-cut':
				return 'scale-cut';
			case 'separate-histories':
				return 'histories';
			case 'closer-still-silent':
				return 'silent';
			case 'one-possible-burst':
				return 'burst';
			case 'probability-not-obedience':
				return 'probability';
		}
	}

	function dispatch(action: Parameters<typeof reduceFilmClock>[1]): void {
		clock = reduceFilmClock(clock, action);
	}

	function advanceFilm(): void {
		if (modelStatus !== 'ready' || reducedMotion) return;
		dispatch({ type: 'TICK', nowMs: performance.now() });
	}

	function nextBeat(): void {
		if (reducedMotion) {
			const nextIndex = Math.min(DIRECTED_BEATS.length - 1, frame.beatIndex + 1);
			clock = createFilmClock({
				beatIndex: nextIndex,
				beatTimeMs: DIRECTED_BEATS[nextIndex].autoplayDurationMs,
				status: 'held'
			});
		} else {
			dispatch({ type: 'NEXT' });
		}
		filmRoot.focus({ preventScroll: true });
	}

	function previousBeat(): void {
		dispatch({ type: 'PREVIOUS' });
		filmRoot.focus({ preventScroll: true });
	}

	function replayBeat(): void {
		dispatch({ type: 'REPLAY_BEAT' });
		if (reducedMotion) {
			clock = createFilmClock({
				beatIndex: frame.beatIndex,
				beatTimeMs: beat.autoplayDurationMs,
				status: 'held'
			});
		}
		filmRoot.focus({ preventScroll: true });
	}

	function replayTour(): void {
		if (reducedMotion) {
			clock = createFilmClock({ beatTimeMs: reducedOpening, status: 'held' });
		} else {
			dispatch({ type: 'REPLAY_TOUR' });
		}
		filmRoot.focus({ preventScroll: true });
	}

	function togglePause(): void {
		if (clock.status === 'paused') dispatch({ type: 'PLAY' });
		else if (clock.status === 'running') dispatch({ type: 'PAUSE' });
		else dispatch({ type: 'NEXT' });
	}

	function toggleAutoplay(): void {
		if (clock.autoplay) dispatch({ type: 'STOP_AUTOPLAY' });
		else dispatch({ type: 'START_AUTOPLAY' });
	}

	async function toggleFullscreen(): Promise<void> {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await filmRoot.requestFullscreen();
		} catch {
			// Fullscreen is an enhancement. The entire film remains usable inline.
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement | null;
		if (target?.closest('button, a, input, select, textarea, summary')) return;
		switch (event.key) {
			case ' ':
				event.preventDefault();
				togglePause();
				break;
			case 'ArrowRight':
				event.preventDefault();
				nextBeat();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				previousBeat();
				break;
			case 'r':
			case 'R':
				event.preventDefault();
				replayBeat();
				break;
			case 'Escape':
				if (!document.fullscreenElement && clock.status === 'running') dispatch({ type: 'PAUSE' });
				break;
		}
	}

	function handleStageStatus(status: WeatherStageStatus, message: string): void {
		if (status === 'fallback' || status === 'context-lost') onfailure?.(message);
	}

	function formatFilmTime(milliseconds: number): string {
		const seconds = Math.round(milliseconds / 1_000);
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	}

	function formatModelTime(value: number | null): string {
		return value === null ? '48 histories · 0–60 min' : `${value.toFixed(2)} model min`;
	}

	function errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : 'The scientific calculation could not finish.';
	}

	onMount(() => {
		let disposed = false;
		if (reducedMotion) {
			clock = createFilmClock({ beatTimeMs: reducedOpening, status: 'held' });
		}
		const client = createWeatherNucleusWorkerClient();
		workerClient = client;
		const baseline = createModelParameters();
		const increasedContact = createModelParameters({ ...baseline, geometryBias: 1 });

		const handleVisibility = () => {
			dispatch({ type: 'SET_VISIBLE', visible: !document.hidden });
		};
		const handleFullscreen = () => {
			fullscreen = document.fullscreenElement === filmRoot;
		};
		document.addEventListener('visibilitychange', handleVisibility);
		document.addEventListener('fullscreenchange', handleFullscreen);

		void (async () => {
			try {
				const focalStarted = performance.now();
				const nextFocal = await client.runFocalPair({
					seed: 0,
					baseline,
					intervention: increasedContact
				});
				if (disposed) return;
				focalRunMs = performance.now() - focalStarted;
				focal = nextFocal;
				modelStatus = 'ready';
				modelMessage = 'Seed 0 history ready; calculating the paired 48-history field…';
				if (!reducedMotion) dispatch({ type: 'PLAY' });

				const ensembleStarted = performance.now();
				const nextEnsemble = await client.runMatchedEnsemble({
					rootSeed: 0,
					baseline,
					intervention: increasedContact
				});
				if (disposed) return;
				ensembleRunMs = performance.now() - ensembleStarted;
				ensemble = nextEnsemble;
				modelMessage = 'Pinned trace and paired 48-history field ready.';
			} catch (error) {
				if (disposed) return;
				modelStatus = 'error';
				modelMessage = errorMessage(error);
				onfailure?.(`The scientific model could not start: ${modelMessage}`);
			}
		})();

		return () => {
			disposed = true;
			document.removeEventListener('visibilitychange', handleVisibility);
			document.removeEventListener('fullscreenchange', handleFullscreen);
			client.dispose();
			workerClient = null;
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<section
	bind:this={filmRoot}
	class:high-contrast={highContrast}
	class:reduced-motion={reducedMotion}
	class="guided-film"
	data-testid="weather-guided-film"
	data-beat={beat.number}
	data-beat-id={beat.id}
	data-film-status={clock.status}
	data-beat-time-ms={frame.beatTimeMs.toFixed(0)}
	data-model-time={modelTime === null ? 'ensemble' : modelTime.toFixed(6)}
	data-model-status={modelStatus}
	data-worker-focal-ms={focalRunMs.toFixed(1)}
	data-worker-ensemble-ms={ensembleRunMs.toFixed(1)}
	data-worker-mode={workerClient?.usingFallback() ? 'main-thread-recovery' : 'worker'}
	aria-label="Weather Inside the Nucleus guided scientific film"
	tabindex="-1"
>
	<div class="film-stage">
		{#if !reducedMotion}
			{#snippet fallback(context: WeatherStageFallbackContext)}
				<DirectedTableau
					beat={directedBeat}
					progress={frame.progress}
					filmTime={frame.beatTimeMs}
					{modelTime}
					{modelBoundary}
					trace={focal?.baseline ?? null}
					{ensemble}
					{highContrast}
					reducedMotion={context.reducedMotion}
				/>
			{/snippet}
			<WeatherStage
				trace={focal?.baseline ?? null}
				playbackTime={modelTime ?? 0}
				{directedBeat}
				directedProgress={frame.progress}
				filmTime={frame.beatTimeMs}
				{highContrast}
				paused={clock.status !== 'running'}
				active={modelStatus !== 'error'}
				{fallback}
				onframe={advanceFilm}
				onstatus={handleStageStatus}
			/>
		{/if}

		{#if overlayTableau}
			<div class="tableau-overlay">
				<DirectedTableau
					beat={directedBeat}
					progress={frame.progress}
					filmTime={frame.beatTimeMs}
					{modelTime}
					{modelBoundary}
					trace={focal?.baseline ?? null}
					{ensemble}
					{highContrast}
					{reducedMotion}
				/>
			</div>
		{/if}

		<header class="beat-heading">
			<div class="beat-number">
				<span>Beat {beat.number} / 8</span>
				<strong>{beat.title}</strong>
			</div>
			<p class="beat-cue">{beat.cue}</p>
		</header>

		{#if beat.id === 'one-possible-burst'}
			<p class="time-cut-badge">later · same seed 0 history</p>
		{/if}

		{#if beat.id === 'separate-histories'}
			<aside class="term-card">
				<strong>occupancy propensity</strong>
				<span>a continuous model memory of signal-dependent binding readiness</span>
			</aside>
		{/if}

		{#if activeCaption}
			<p class="film-caption">{activeCaption}</p>
		{/if}

		{#if beat.id === 'probability-not-obedience'}
			<aside class="probability-card">
				<strong>Probability, not obedience.</strong>
				<p>
					The same 48 fixed random histories give
					<b>{ensemble?.baseline.summary.burstingRunCount ?? '—'}/48</b> histories with a burst at
					the usual contact setting and
					<b>{ensemble?.intervention.summary.burstingRunCount ?? '—'}/48</b> with increased contact propensity.
				</p>
				<small
					>These are paired model histories, not cells. Initiation events are not completed RNA
					molecules.</small
				>
			</aside>
		{/if}

		{#if modelStatus === 'loading' || (beat.number === 8 && !ensembleReady)}
			<div class="model-status" role="status">
				<span class="status-mark" aria-hidden="true"></span>
				{modelMessage}
			</div>
		{/if}
	</div>

	<div class="film-console">
		<div class="beat-rail" aria-label="Guided film progress">
			{#each DIRECTED_BEATS as item, index (item.id)}
				<span
					class:past={index < frame.beatIndex}
					class:current={index === frame.beatIndex}
					aria-current={index === frame.beatIndex ? 'step' : undefined}
				>
					<i></i><b>{item.number}</b><em>{item.title}</em>
				</span>
			{/each}
		</div>

		<div class="film-readout">
			<span>{formatFilmTime(tourElapsedMs)} / {formatFilmTime(TOUR_DURATION_MS)} film</span>
			<span>{formatModelTime(modelTime)}</span>
			<strong>film time ≠ model time</strong>
		</div>

		<div class="film-controls" aria-label="Guided film controls">
			<button type="button" disabled={frame.beatIndex === 0} onclick={previousBeat}
				>← Previous</button
			>
			<button
				class="primary"
				type="button"
				disabled={modelStatus !== 'ready' || reducedMotion}
				onclick={togglePause}
			>
				{clock.status === 'running' ? 'Pause' : clock.status === 'paused' ? 'Resume' : 'Continue'}
			</button>
			<button type="button" onclick={nextBeat}>
				{clock.status === 'held' && frame.beatIndex < 7 ? 'Next →' : 'Finish beat →'}
			</button>
			<button type="button" onclick={replayBeat}>Replay beat</button>
			<button type="button" onclick={replayTour}>Replay tour</button>
			<button
				type="button"
				disabled={reducedMotion || (frame.beatIndex === 7 && clock.status === 'held')}
				aria-pressed={clock.autoplay}
				onclick={toggleAutoplay}
			>
				{reducedMotion
					? 'Autoplay off · Still mode'
					: clock.autoplay
						? 'Stop autoplay'
						: 'Autoplay · 78 sec'}
			</button>
			<button type="button" aria-pressed={fullscreen} onclick={() => void toggleFullscreen()}>
				{fullscreen ? 'Exit full screen' : 'Full screen'}
			</button>
			<button type="button" onclick={() => onexperiment?.()}>Skip to experiment</button>
			<button type="button" onclick={() => onreplaytour?.()}>Replay opening</button>
		</div>

		<p class="keyboard-hint">
			Space pause · ←/→ beats · R replay beat · Esc pause/exit full screen
		</p>
	</div>

	<p class="sr-only" aria-live="polite" aria-atomic="true">
		Beat {beat.number} of 8. {beat.accessibleSummary}
	</p>

	{#if import.meta.env.DEV}
		<aside class="dev-overlay" aria-label="Development timing overlay">
			<span>film {frame.beatTimeMs.toFixed(0)} ms</span>
			<span>model {modelTime?.toFixed(4) ?? 'ensemble'}</span>
			<span>worker focal {focalRunMs.toFixed(1)} ms</span>
			<span>worker ensemble {ensembleRunMs.toFixed(1)} ms</span>
			<span>{workerClient?.usingFallback() ? 'main-thread recovery' : 'worker'}</span>
		</aside>
	{/if}
</section>

<style>
	.guided-film {
		position: relative;
		display: grid;
		min-height: max(680px, calc(100svh - 4.5rem));
		grid-template-rows: minmax(31rem, 1fr) auto;
		background: #03050b;
		color: #f7f8fc;
		outline: none;
		isolation: isolate;
	}

	.guided-film:focus-visible {
		box-shadow: inset 0 0 0 3px #8ceafa;
	}

	.film-stage {
		position: relative;
		min-height: 31rem;
		overflow: hidden;
		background: #03050b;
	}

	.tableau-overlay {
		position: absolute;
		inset: 0;
		z-index: 3;
		min-height: inherit;
	}

	.beat-heading {
		position: absolute;
		top: clamp(1rem, 3vw, 2.4rem);
		left: clamp(1rem, 4vw, 4rem);
		z-index: 8;
		display: grid;
		width: min(42rem, calc(100% - 2rem));
		gap: 0.5rem;
		pointer-events: none;
	}

	.beat-number {
		display: grid;
		gap: 0.25rem;
	}

	.beat-number span,
	.time-cut-badge,
	.film-readout,
	.keyboard-hint,
	.dev-overlay {
		font-family: var(--font-mono, 'Courier Prime'), ui-monospace, monospace;
	}

	.beat-number span {
		color: #9be9ef;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.beat-number strong {
		max-width: 29rem;
		color: #fafbff;
		font: 790 clamp(1.6rem, 3.3vw, 3.6rem) / 0.96 var(--font-sans, sans-serif);
		letter-spacing: -0.052em;
		text-shadow: 0 2px 24px #03050b;
		text-wrap: balance;
	}

	.beat-cue {
		margin: 0;
		color: #f2dbab;
		font: 650 clamp(0.95rem, 1.6vw, 1.25rem) / 1.25 var(--font-serif, serif);
		text-shadow: 0 2px 18px #03050b;
	}

	.film-caption {
		position: absolute;
		left: 50%;
		bottom: clamp(1.4rem, 4vh, 3.4rem);
		z-index: 8;
		width: min(52rem, calc(100% - 2rem));
		margin: 0;
		transform: translateX(-50%);
		border-left: 3px solid #ffd58a;
		background: linear-gradient(90deg, rgb(3 5 11 / 88%), rgb(3 5 11 / 58%));
		padding: 0.72rem 0.9rem;
		color: #f8f5ed;
		font: 680 clamp(0.93rem, 1.6vw, 1.25rem) / 1.42 var(--font-sans, sans-serif);
		text-align: center;
		text-wrap: balance;
	}

	.time-cut-badge,
	.term-card,
	.probability-card,
	.model-status {
		position: absolute;
		z-index: 9;
		border: 1px solid rgb(238 224 185 / 35%);
		background: rgb(4 6 14 / 88%);
		box-shadow: 0 12px 44px rgb(0 0 0 / 36%);
		backdrop-filter: blur(14px);
	}

	.time-cut-badge {
		top: clamp(8rem, 22vh, 13rem);
		left: clamp(1rem, 4vw, 4rem);
		margin: 0;
		border-radius: 999px;
		padding: 0.45rem 0.7rem;
		color: #ffe3a8;
		font-size: 0.67rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.term-card {
		top: clamp(1rem, 4vw, 3rem);
		right: clamp(1rem, 4vw, 4rem);
		display: grid;
		width: min(22rem, 36vw);
		gap: 0.3rem;
		border-radius: 0.65rem;
		padding: 0.75rem 0.9rem;
	}

	.term-card strong {
		color: #9cecf2;
		font: 770 0.78rem/1.2 var(--font-sans, sans-serif);
	}

	.term-card span {
		color: #c1c3cf;
		font: 0.72rem/1.4 var(--font-sans, sans-serif);
	}

	.probability-card {
		right: clamp(1rem, 4vw, 4rem);
		bottom: clamp(1rem, 3vw, 2.4rem);
		width: min(37rem, calc(100% - 2rem));
		border-radius: 0.8rem;
		padding: clamp(0.9rem, 2vw, 1.25rem);
	}

	.probability-card strong {
		color: #ffd992;
		font: 780 clamp(1rem, 2vw, 1.45rem) / 1.15 var(--font-sans, sans-serif);
	}

	.probability-card p {
		margin: 0.45rem 0;
		color: #eeeef4;
		font: 0.82rem/1.48 var(--font-sans, sans-serif);
	}

	.probability-card b {
		color: #fff0c8;
	}

	.probability-card small {
		display: block;
		color: #a9abb8;
		font: 0.68rem/1.45 var(--font-sans, sans-serif);
	}

	.model-status {
		left: 50%;
		bottom: 1.2rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0;
		transform: translateX(-50%);
		border-radius: 999px;
		padding: 0.55rem 0.78rem;
		color: #d7d8e2;
		font: 0.72rem/1.2 var(--font-sans, sans-serif);
	}

	.status-mark {
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 50%;
		background: #ffd58a;
		box-shadow: 0 0 0 5px rgb(255 213 138 / 13%);
	}

	.film-console {
		position: relative;
		z-index: 10;
		display: grid;
		gap: 0.65rem;
		border-top: 1px solid rgb(168 172 197 / 22%);
		background: #060812;
		padding: 0.75rem clamp(0.8rem, 3vw, 2.4rem) 0.65rem;
	}

	.beat-rail {
		display: grid;
		grid-template-columns: repeat(8, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.beat-rail span {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		min-width: 0;
		gap: 0.35rem;
		color: #777b8d;
	}

	.beat-rail span::before {
		position: absolute;
		top: -0.75rem;
		left: 0;
		width: 100%;
		height: 2px;
		background: #343748;
		content: '';
	}

	.beat-rail span.past::before,
	.beat-rail span.current::before {
		background: #8ceaf1;
	}

	.beat-rail span.current {
		color: #f8e3b5;
	}

	.beat-rail i {
		width: 0.43rem;
		height: 0.43rem;
		border-radius: 50%;
		background: currentColor;
	}

	.beat-rail b,
	.beat-rail em {
		font: 700 0.62rem/1.2 var(--font-sans, sans-serif);
	}

	.beat-rail em {
		grid-column: 1 / -1;
		overflow: hidden;
		font-size: 0.58rem;
		font-style: normal;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.film-readout {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1rem;
		color: #a4a7b6;
		font-size: 0.63rem;
		letter-spacing: 0.035em;
	}

	.film-readout strong {
		color: #f0d8a4;
	}

	.film-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	button {
		border: 1px solid rgb(238 237 248 / 28%);
		border-radius: 999px;
		background: #0b0d19;
		padding: 0.55rem 0.75rem;
		color: #e6e7ed;
		font: 720 0.66rem/1 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	button.primary {
		border-color: #ffd58a;
		background: #ffd58a;
		color: #1b1305;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.38;
	}

	button:focus-visible {
		outline: 3px solid #8ceaf1;
		outline-offset: 2px;
	}

	.keyboard-hint {
		margin: 0;
		color: #787b8a;
		font-size: 0.58rem;
	}

	.dev-overlay {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 20;
		display: grid;
		gap: 0.15rem;
		border: 1px solid #4b5066;
		background: rgb(0 0 0 / 82%);
		padding: 0.4rem;
		color: #a9f2f3;
		font-size: 0.55rem;
		pointer-events: none;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.high-contrast {
		--film-contrast: #fff;
	}

	.high-contrast .film-console,
	.high-contrast .time-cut-badge,
	.high-contrast .term-card,
	.high-contrast .probability-card,
	.high-contrast button {
		border-color: #fff;
		background: #000;
		color: #fff;
	}

	.high-contrast button.primary {
		background: #fff;
		color: #000;
	}

	@media (max-width: 900px), (max-height: 680px) {
		.guided-film {
			grid-template-rows: minmax(27rem, 1fr) auto;
		}

		.film-stage {
			min-height: 27rem;
		}

		.beat-rail em,
		.keyboard-hint {
			display: none;
		}

		.term-card {
			width: min(19rem, 44vw);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
			transition: none !important;
		}
	}

	@media (forced-colors: active) {
		.guided-film,
		.film-stage,
		.film-console,
		button,
		.time-cut-badge,
		.term-card,
		.probability-card,
		.model-status {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
	}
</style>
