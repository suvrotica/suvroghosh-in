<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { GameCatalogEntry } from '$lib/games/catalog';
	import {
		DEFAULT_REPAIR_SHOP_SETTINGS,
		SETTINGS_STORAGE_KEY,
		clearSavedProgress,
		loadFromStorage,
		saveToStorage
	} from '$lib/games/the-repair-shop-on-the-corner/persistence';
	import type { WorkbenchActionPayload } from '$lib/games/the-repair-shop-on-the-corner/runtime';
	import {
		createInitialGameState,
		getActiveBenchJobs,
		resetSingleRepair,
		syncDerivedState
	} from '$lib/games/the-repair-shop-on-the-corner/state';
	import type {
		CharacterId,
		JobId,
		RepairShopGameState,
		RepairShopSettings
	} from '$lib/games/the-repair-shop-on-the-corner/types';
	import DialogueSheet from './DialogueSheet.svelte';
	import NeighbourhoodHud from './NeighbourhoodHud.svelte';
	import PauseSettingsModal from './PauseSettingsModal.svelte';
	import RepairShopCanvas from './RepairShopCanvas.svelte';
	import WorkbenchPanel from './WorkbenchPanel.svelte';

	type ShellPhase = 'poster' | 'loading' | 'playing' | 'paused' | 'error';

	let { game }: { game: GameCatalogEntry } = $props();

	let shellEl: HTMLElement;
	let canvasRef = $state<RepairShopCanvas | undefined>();
	let phase = $state<ShellPhase>('poster');
	let started = $state(false);
	let sessionId = $state(0);
	let hasSavedGame = $state(false);
	let recoveredNotice = $state('');
	let errorMessage = $state('');
	let announcement = $state('');
	let fullscreenSupported = $state(false);
	let isFullscreen = $state(false);
	let primedAudioContext = $state<AudioContext | undefined>();

	let gameState = $state<RepairShopGameState>(createInitialGameState());
	let settings = $state<RepairShopSettings>({ ...DEFAULT_REPAIR_SHOP_SETTINGS });

	const returnedCount = $derived(
		(['radio', 'clock', 'projector'] as const).filter((j) => gameState.jobs[j] === 'returned')
			.length
	);

	const activeRepairJob = $derived.by((): JobId | null => {
		if (gameState.workbench) return gameState.workbench.activeJob;
		const bench = getActiveBenchJobs(gameState.jobs);
		return bench[0] ?? null;
	});

	function safeStorage(): Storage | null {
		try {
			return typeof window !== 'undefined' ? window.localStorage : null;
		} catch {
			return null;
		}
	}

	function persistNow(nextState: RepairShopGameState = gameState, nextSettings = settings) {
		const ok = saveToStorage(safeStorage(), nextState, nextSettings);
		if (ok) hasSavedGame = true;
	}

	function primeAudioFromClick(wantSound: boolean): AudioContext | undefined {
		if (!wantSound || typeof window === 'undefined') return undefined;
		const AudioCtor =
			window.AudioContext ||
			(window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtor) return undefined;
		try {
			const ctx = new AudioCtor();
			void ctx.resume().catch(() => undefined);
			return ctx;
		} catch {
			return undefined;
		}
	}

	function enterWorkshop(opts: { withSound: boolean; freshStart?: boolean }) {
		if (opts.freshStart) {
			clearSavedProgress(safeStorage());
			hasSavedGame = false;
			gameState = createInitialGameState();
		}
		const nextSettings: RepairShopSettings = {
			...settings,
			soundEnabled: opts.withSound
		};
		settings = nextSettings;
		try {
			safeStorage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
		} catch {
			// In-memory settings still work if storage is blocked.
		}

		primedAudioContext = primeAudioFromClick(opts.withSound);
		errorMessage = '';
		phase = 'loading';
		sessionId += 1;
		started = true;
		announcement = opts.withSound
			? 'Entering Kusumtala Corner with workshop sound enabled.'
			: 'Entering Kusumtala Corner quietly with visual captions.';
	}

	function handleStateChange(next: RepairShopGameState) {
		gameState = next;
	}

	function handleSaveMilestone(next: RepairShopGameState) {
		gameState = next;
		persistNow(next, settings);
	}

	function handleUpdateSettings(next: RepairShopSettings) {
		const turnedSoundOn = !settings.soundEnabled && next.soundEnabled;
		settings = next;
		persistNow(gameState, next);
		if (turnedSoundOn) {
			void canvasRef?.enableAudioFromGesture();
		}
	}

	function toggleMute() {
		handleUpdateSettings({
			...settings,
			soundEnabled: !settings.soundEnabled
		});
	}

	function openPause() {
		if (phase === 'playing') {
			phase = 'paused';
			persistNow();
		}
	}

	function resumeFromPause() {
		if (phase === 'paused') {
			phase = 'playing';
			requestAnimationFrame(() => canvasRef?.focusCanvas());
		}
	}

	function togglePause() {
		if (phase === 'paused') resumeFromPause();
		else if (phase === 'playing') openPause();
	}

	function handleWorkbenchAction(action: WorkbenchActionPayload) {
		canvasRef?.dispatchWorkbench(action);
	}

	function handleReturnToCustomer(job: JobId) {
		canvasRef?.dispatchWorkbench({ type: 'leave-bench' });
		const customerByJob: Record<JobId, CharacterId> = {
			radio: 'bapi',
			clock: 'mala',
			projector: 'ruma'
		};
		requestAnimationFrame(() => {
			canvasRef?.interactWithTarget(`char:${customerByJob[job]}`);
		});
	}

	function handleResetRepairFromPause(job: JobId) {
		const updated = resetSingleRepair(gameState, job);
		gameState = updated;
		canvasRef?.replaceState(updated);
		persistNow(updated, settings);
		announcement = `Reset ${job} repair on the workbench.`;
	}

	function handleStartNewGame() {
		clearSavedProgress(safeStorage());
		hasSavedGame = false;
		const fresh = syncDerivedState(createInitialGameState());
		gameState = fresh;
		persistNow(fresh, settings);
		sessionId += 1;
		phase = 'loading';
		started = true;
		announcement = 'Started a new afternoon at the repair shop.';
	}

	async function toggleFullscreen() {
		if (!shellEl) return;
		try {
			if (document.fullscreenElement === shellEl) {
				await document.exitFullscreen();
			} else if (shellEl.requestFullscreen) {
				await shellEl.requestFullscreen();
			}
		} catch {
			// Fullscreen may be declined by browser policy; layout stays usable.
		}
	}

	onMount(() => {
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const loaded = loadFromStorage(safeStorage(), reducedMotion);
		gameState = loaded.state;
		settings = loaded.settings;
		hasSavedGame = loaded.hasSave;
		if (loaded.recoveredFromInvalid) {
			recoveredNotice =
				'An older or unreadable local save was skipped so your workshop could start cleanly.';
		}

		fullscreenSupported = Boolean(document.fullscreenEnabled && shellEl?.requestFullscreen);
		const onFullscreenChange = () => {
			isFullscreen = document.fullscreenElement === shellEl;
		};
		document.addEventListener('fullscreenchange', onFullscreenChange);

		return () => {
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			if (document.fullscreenElement === shellEl) {
				void document.exitFullscreen().catch(() => undefined);
			}
		};
	});
</script>

<section
	bind:this={shellEl}
	id="game-experience"
	class="repair-shop-shell"
	class:fullscreen={isFullscreen}
	class:high-contrast={settings.highContrastLabels}
	data-phase={phase}
	data-mode={started ? gameState.mode : 'poster'}
	aria-label={game.title}
>
	{#if !started && phase === 'poster'}
		<div class="poster-screen">
			<div class="poster-topbar">
				<a href={resolve('/blog/games')} class="poster-nav-link">← Games</a>
				<a href="#about-the-game" class="poster-nav-link">About & controls ↓</a>
			</div>

			<div class="poster-card">
				<p class="poster-eyebrow">Kusumtala Corner · কুসুমতলা মোড় · First Chapter</p>
				<h1>{game.title}</h1>
				<p class="poster-lead">
					The rolling shutter is up and the task lamp is warm. Neighbours bring everyday things that
					have stopped working — listen to the symptom, open the casing, find the actual fault, test
					your work, and watch each repaired object return to life down the lane.
				</p>

				<ul class="poster-jobs" aria-label="Repairs in this chapter">
					<li>
						<strong>Portable Battery Radio</strong>
						<span>Bapi’s tea stall · Power light stays on, sound cuts when moved</span>
					</li>
					<li>
						<strong>Wind-Up Wall Clock</strong>
						<span>Sen Brothers Stores · Spring winds cleanly, hands stay still</span>
					</li>
					<li>
						<strong>8mm Film Projector</strong>
						<span>Shared courtyard · Lamp glows, evening reel will not feed</span>
					</li>
				</ul>

				{#if recoveredNotice}
					<p class="poster-notice" role="status">{recoveredNotice}</p>
				{/if}

				{#if hasSavedGame}
					<div class="save-summary">
						<p>
							<strong>Saved afternoon found in this browser:</strong>
							{returnedCount} of 3 repairs returned to neighbours.
						</p>
						<div class="poster-cta-row">
							<button
								type="button"
								class="cta-primary"
								onclick={() => enterWorkshop({ withSound: false })}
							>
								Continue quietly
							</button>
							<button
								type="button"
								class="cta-secondary"
								onclick={() => enterWorkshop({ withSound: true })}
							>
								Continue with sound
							</button>
							<button
								type="button"
								class="cta-ghost"
								onclick={() => enterWorkshop({ withSound: false, freshStart: true })}
							>
								Start new game
							</button>
						</div>
					</div>
				{:else}
					<div class="poster-cta-row">
						<button
							type="button"
							class="cta-primary"
							onclick={() => enterWorkshop({ withSound: false })}
						>
							Enter shop quietly
						</button>
						<button
							type="button"
							class="cta-secondary"
							onclick={() => enterWorkshop({ withSound: true })}
						>
							Enter shop with sound
						</button>
					</div>
				{/if}

				<p class="poster-footnote">
					No timers, scores, or permanent mistakes. Playable with mouse, touch, or keyboard, with or
					without sound. Progress saves privately in this browser.
				</p>
			</div>
		</div>
	{:else if phase === 'error'}
		<div class="poster-screen">
			<div class="poster-topbar">
				<a href={resolve('/blog/games')} class="poster-nav-link">← Games</a>
				<a href="#about-the-game" class="poster-nav-link">About & controls ↓</a>
			</div>
			<div class="poster-card error-card" role="alert">
				<p class="poster-eyebrow">3D Workshop Paused</p>
				<h2>Could not display the 3D workbench</h2>
				<p class="poster-lead">{errorMessage}</p>
				<div class="poster-cta-row">
					<button
						type="button"
						class="cta-primary"
						onclick={() => enterWorkshop({ withSound: settings.soundEnabled })}
					>
						Reload 3D Workshop
					</button>
					<a href={resolve('/blog/games')} class="cta-secondary link-btn">Return to Games</a>
				</div>
			</div>
		</div>
	{:else}
		<div
			class="stage-layout"
			class:workbench-active={gameState.mode === 'workbench'}
			aria-hidden={phase === 'paused'}
			inert={phase === 'paused'}
		>
			<div class="canvas-pane">
				{#key sessionId}
					<RepairShopCanvas
						bind:this={canvasRef}
						initialState={gameState}
						{settings}
						paused={phase === 'paused'}
						{primedAudioContext}
						onStateChange={handleStateChange}
						onSaveMilestone={handleSaveMilestone}
						onRequestPauseToggle={togglePause}
						onReady={() => {
							if (phase === 'loading') {
								phase = 'playing';
								requestAnimationFrame(() => canvasRef?.focusCanvas());
							}
						}}
						onWebGLError={(msg) => {
							errorMessage = msg;
							started = false;
							phase = 'error';
						}}
					/>
				{/key}

				{#if phase === 'loading'}
					<div class="loading-pill" role="status">Raising the shop shutter…</div>
				{/if}

				{#if gameState.mode !== 'workbench'}
					<NeighbourhoodHud
						state={gameState}
						{settings}
						{fullscreenSupported}
						{isFullscreen}
						onInteract={(targetId) => canvasRef?.interactWithTarget(targetId)}
						onOpenBenchJob={(job) => {
							if (gameState.mode === 'explore') {
								canvasRef?.interactWithTarget('workbench');
								requestAnimationFrame(() => canvasRef?.dispatchWorkbench({ type: 'set-job', job }));
							}
						}}
						onCloseDrawer={() => canvasRef?.closeDrawerNotice()}
						onFinishScreening={() => canvasRef?.finishScreening()}
						onToggleMute={toggleMute}
						onToggleFullscreen={() => void toggleFullscreen()}
						onOpenPause={openPause}
					/>
				{:else}
					<div class="bench-canvas-overlay">
						<a href={resolve('/blog/games')} class="canvas-chip">← Games</a>
						<span class="canvas-hint"
							>Drag 3D view to rotate · Scroll or +/− to zoom · Click parts</span
						>
						<div class="bench-canvas-right">
							<button type="button" class="canvas-chip" onclick={toggleMute}>
								{settings.soundEnabled ? 'Sound: On' : 'Muted'}
							</button>
							<button type="button" class="canvas-chip" onclick={openPause}>Options</button>
						</div>
					</div>
				{/if}

				{#if gameState.mode === 'dialogue' && gameState.activeDialogue}
					<DialogueSheet
						dialogue={gameState.activeDialogue}
						highContrast={settings.highContrastLabels}
						onChoose={(choiceId) => canvasRef?.chooseDialogue(choiceId)}
					/>
				{/if}
			</div>

			{#if gameState.mode === 'workbench'}
				<div class="workbench-pane">
					<WorkbenchPanel
						state={gameState}
						{settings}
						onAction={handleWorkbenchAction}
						onReturnToCustomer={handleReturnToCustomer}
					/>
				</div>
			{/if}
		</div>

		{#if phase === 'paused'}
			<PauseSettingsModal
				{settings}
				{activeRepairJob}
				onUpdateSettings={handleUpdateSettings}
				onResetCurrentRepair={handleResetRepairFromPause}
				onStartNewGame={handleStartNewGame}
				onResume={resumeFromPause}
			/>
		{/if}
	{/if}

	<p class="sr-only" aria-live="polite">{announcement}</p>
</section>

<style>
	:global(body:has(.repair-shop-shell:fullscreen)) {
		overflow: hidden;
	}

	.repair-shop-shell {
		position: relative;
		isolation: isolate;
		width: 100%;
		height: min(88dvh, 860px);
		min-height: 620px;
		overflow: hidden;
		background:
			radial-gradient(circle at 22% 18%, rgba(214, 138, 52, 0.16), transparent 52%),
			linear-gradient(165deg, #241c15 0%, #17130f 100%);
		color: #f8efe0;
		color-scheme: dark;
	}

	.repair-shop-shell.fullscreen {
		width: 100vw;
		height: 100dvh;
		min-height: 0;
	}

	.poster-screen {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 1rem 1.25rem 1.5rem;
	}

	.poster-topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		max-width: 820px;
		width: 100%;
		margin: 0 auto;
	}

	.poster-nav-link {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0.35rem 0.8rem;
		border-radius: 10px;
		border: 1px solid rgba(244, 214, 168, 0.28);
		background: rgba(255, 255, 255, 0.05);
		color: #f7ead5;
		font-size: 0.86rem;
		font-weight: 700;
		text-decoration: none;
	}

	.poster-card {
		max-width: 780px;
		width: 100%;
		margin: auto;
		padding: 1.5rem 1.65rem;
		border-radius: 20px;
		border: 1px solid rgba(244, 214, 168, 0.28);
		background: rgba(29, 23, 18, 0.9);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
	}

	.poster-eyebrow {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: #ebb76c;
	}

	h1 {
		margin: 0.35rem 0 0;
		font-size: clamp(1.75rem, 3.6vw, 2.55rem);
		line-height: 1.12;
		font-weight: 900;
		color: #fff7e8;
	}

	.error-card h2 {
		margin: 0.35rem 0 0;
		font-size: 1.55rem;
		font-weight: 800;
	}

	.poster-lead {
		margin: 0.85rem 0 0;
		font-size: 1rem;
		line-height: 1.58;
		color: #efe2cd;
	}

	.poster-jobs {
		list-style: none;
		margin: 1.1rem 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(205px, 1fr));
		gap: 0.65rem;
	}

	.poster-jobs li {
		padding: 0.7rem 0.85rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.045);
		border: 1px solid rgba(244, 214, 168, 0.18);
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.poster-jobs strong {
		font-size: 0.9rem;
		color: #fff4e1;
	}

	.poster-jobs span {
		font-size: 0.79rem;
		line-height: 1.38;
		color: #d8c6ae;
	}

	.poster-notice {
		margin: 0.9rem 0 0;
		padding: 0.55rem 0.75rem;
		border-radius: 10px;
		background: rgba(235, 183, 108, 0.14);
		border: 1px solid rgba(235, 183, 108, 0.35);
		font-size: 0.84rem;
	}

	.save-summary {
		margin-top: 1.1rem;
		padding-top: 0.95rem;
		border-top: 1px solid rgba(244, 214, 168, 0.16);
	}

	.save-summary p {
		margin: 0 0 0.7rem;
		font-size: 0.9rem;
		color: #f6e7cf;
	}

	.poster-cta-row {
		margin-top: 1.1rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.save-summary .poster-cta-row {
		margin-top: 0;
	}

	.cta-primary,
	.cta-secondary,
	.cta-ghost {
		min-height: 48px;
		padding: 0.65rem 1.15rem;
		border-radius: 12px;
		font-size: 0.94rem;
		font-weight: 800;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
	}

	.cta-primary {
		background: #d8892d;
		border: 1px solid #f7c47c;
		color: #191108;
	}

	.cta-secondary {
		background: rgba(255, 248, 236, 0.1);
		border: 1px solid rgba(244, 214, 168, 0.38);
		color: #fff5e5;
	}

	.cta-ghost {
		background: transparent;
		border: 1px solid rgba(244, 214, 168, 0.25);
		color: #decbb1;
	}

	.poster-footnote {
		margin: 1rem 0 0;
		font-size: 0.8rem;
		line-height: 1.45;
		color: #cab79e;
	}

	.stage-layout {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
	}

	.stage-layout.workbench-active {
		grid-template-columns: minmax(0, 1fr) minmax(350px, 420px);
		grid-template-rows: minmax(0, 1fr);
	}

	.canvas-pane {
		position: relative;
		min-width: 0;
		min-height: 0;
		width: 100%;
		height: 100%;
	}

	.workbench-pane {
		min-width: 0;
		min-height: 0;
		width: 100%;
		height: 100%;
		z-index: 20;
	}

	.loading-pill {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 18;
		padding: 0.65rem 1.1rem;
		border-radius: 999px;
		background: rgba(22, 17, 13, 0.92);
		border: 1px solid rgba(244, 214, 168, 0.34);
		font-size: 0.9rem;
		font-weight: 700;
	}

	.bench-canvas-overlay {
		position: absolute;
		top: 0.6rem;
		left: 0.65rem;
		right: 0.65rem;
		z-index: 16;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		pointer-events: none;
	}

	.bench-canvas-right {
		display: flex;
		gap: 0.35rem;
		pointer-events: auto;
	}

	.canvas-chip {
		pointer-events: auto;
		min-height: 38px;
		padding: 0.3rem 0.68rem;
		border-radius: 9px;
		border: 1px solid rgba(244, 214, 168, 0.3);
		background: rgba(22, 18, 14, 0.85);
		color: #f7ecdc;
		font-size: 0.78rem;
		font-weight: 700;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		cursor: pointer;
	}

	.canvas-hint {
		padding: 0.28rem 0.62rem;
		border-radius: 8px;
		background: rgba(22, 18, 14, 0.72);
		color: #e4d3bc;
		font-size: 0.74rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 899px) {
		.repair-shop-shell {
			height: 92dvh;
			min-height: 580px;
		}

		.stage-layout.workbench-active {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: 44% 56%;
		}

		.canvas-hint {
			display: none;
		}

		.poster-card {
			padding: 1.15rem 1.1rem;
		}
	}
</style>
