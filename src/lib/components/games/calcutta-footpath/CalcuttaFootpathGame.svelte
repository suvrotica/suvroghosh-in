<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import GameSurface from './GameSurface.svelte';
	import GameHud from './GameHud.svelte';
	import TouchControls from './TouchControls.svelte';
	import GameDialog from './GameDialog.svelte';
	import ResultsOverlay from './ResultsOverlay.svelte';
	import NeighbourhoodMap from './NeighbourhoodMap.svelte';
	import { primeSpatialAudioFromGesture } from '$lib/games/calcutta-footpath/spatial-audio';
	import type { GameCatalogEntry } from '$lib/games/catalog';
	import type {
		HudSnapshot,
		RunResult,
		RuntimePhase,
		StoredRunRecord
	} from '$lib/games/calcutta-footpath/runtime-types';
	import type { InputCommand } from '$lib/games/calcutta-footpath/input';
	import {
		DEFAULT_GAME_SETTINGS,
		SETTINGS_STORAGE_KEY,
		SETTINGS_VERSION,
		parseSettings,
		serializeSettings,
		type GameSettings
	} from '$lib/games/calcutta-footpath/settings';
	import {
		EMPTY_STORED_RUNS,
		RUNS_STORAGE_KEY,
		parseStoredRuns,
		recentFailureCount,
		recordRun,
		serializeStoredRuns
	} from '$lib/games/calcutta-footpath/persistence';

	type Overlay = 'none' | 'pause' | 'instructions' | 'settings' | 'error';
	type DialogReturn = 'title' | 'game' | 'pause' | 'result';
	type SurfaceHandle = {
		pause(byVisibility?: boolean): void;
		resume(): void;
		restart(seed: string, tutorial: boolean, previousFailedRuns?: number): void;
		enableAudioFromGesture(): Promise<boolean>;
		setTouchVector(x: number, y: number): void;
		setTouchDash(pressed: boolean): void;
		stopWalking(): void;
		turnAround(): void;
		interact(): void;
		focusCanvas(): void;
	};

	let { game }: { game: GameCatalogEntry } = $props();
	let shell: HTMLElement;
	let surface = $state<SurfaceHandle | undefined>();
	let started = $state(false);
	let phase = $state<RuntimePhase>('title');
	let overlay = $state<Overlay>('none');
	let dialogReturn = $state<DialogReturn>('title');
	let result = $state<RunResult | null>(null);
	let currentSeed = $state('');
	let sessionId = $state(0);
	let settings = $state<GameSettings>({ ...DEFAULT_GAME_SETTINGS });
	let storedRuns = $state<StoredRunRecord>({ ...EMPTY_STORED_RUNS, recent: [] });
	let hydrated = $state(false);
	let fullscreenSupported = $state(false);
	let isFullscreen = $state(false);
	let errorMessage = $state('');
	let localNotice = $state('');
	let audioNeedsGesture = $state(false);
	let mapOpen = $state(false);
	let mapReturnToPause = $state(false);
	let mapPausedWalk = $state(false);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let hud = $state<HudSnapshot>({
		phase: 'title',
		stamina: 100,
		morale: 82,
		reflex: 1,
		distance: 0,
		distanceMetres: 0,
		zone: 'Cramped residential lane',
		weather: 'dry',
		elapsedMs: 0,
		score: 0,
		warning: '',
		tutorialCue: '',
		reaction: '',
		foodEffect: '',
		seed: '',
		dashReady: true,
		pausedByVisibility: false,
		destinationMetres: 211,
		streetName: 'South lane entrance',
		interactionPrompt: '',
		visualCue: '',
		walkingAutomatically: false,
		visitedEdges: [],
		playerMapPosition: { x: -8, z: 0, heading: 0 }
	});

	function newSeed(): string {
		if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
			const words = crypto.getRandomValues(new Uint32Array(2));
			return `KOL-${words[0].toString(36)}-${words[1].toString(36)}`.toLocaleUpperCase('en');
		}
		return `KOL-${Date.now().toString(36)}`.toLocaleUpperCase('en');
	}

	async function startWalk(seed = newSeed(), fullScreen = false) {
		// Start audio work synchronously inside the Play gesture. Fullscreen is requested before
		// awaiting it so both browser-gated capabilities retain their activation opportunity.
		const audioAttempt = settings.soundEnabled
			? primeSpatialAudioFromGesture()
			: Promise.resolve(true);
		if (fullScreen && fullscreenSupported && shell) {
			try {
				await shell.requestFullscreen();
			} catch {
				announceNotice('Full screen was unavailable, so the walk opened here.');
			}
		}
		currentSeed = seed;
		result = null;
		errorMessage = '';
		overlay = 'none';
		phase = 'loading';
		started = true;
		mapOpen = false;
		sessionId += 1;
		void audioAttempt.then((running) => {
			audioNeedsGesture = settings.soundEnabled && !running;
		});
		requestAnimationFrame(() => shell?.scrollIntoView({ block: 'start' }));
	}

	function restartWalk(seed = newSeed()) {
		currentSeed = seed;
		result = null;
		overlay = 'none';
		errorMessage = '';
		if (surface) {
			surface.restart(
				seed,
				settings.tutorialEnabled && !settings.tutorialCompleted,
				recentFailureCount(storedRuns)
			);
		} else {
			void startWalk(seed);
		}
	}

	function announceNotice(message: string) {
		localNotice = message;
		if (noticeTimer) clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => {
			localNotice = '';
			noticeTimer = undefined;
		}, 3_600);
	}

	function restoreGameFocus() {
		if (started && overlay === 'none' && (phase === 'playing' || phase === 'tutorial')) {
			requestAnimationFrame(() => surface?.focusCanvas());
		}
	}

	function handleReady() {
		announceNotice(
			settings.soundEnabled && !audioNeedsGesture
				? 'Sound on. Headphones make approaching traffic easier to locate.'
				: settings.soundEnabled
					? 'The street is ready. Tap the sound prompt if it remains quiet.'
					: 'Sound remains off because you muted it.'
		);
	}

	function handleHud(snapshot: HudSnapshot) {
		hud = snapshot;
	}

	function handlePhase(nextPhase: RuntimePhase) {
		if (phase === 'tutorial' && nextPhase === 'playing' && !settings.tutorialCompleted) {
			settings = { ...settings, tutorialCompleted: true };
		}
		phase = nextPhase;
		if (nextPhase === 'paused' && overlay === 'none') overlay = 'pause';
		if ((nextPhase === 'playing' || nextPhase === 'tutorial') && overlay === 'pause') {
			overlay = 'none';
		}
	}

	function handleResult(nextResult: RunResult) {
		result = nextResult;
		phase = nextResult.won ? 'won' : 'lost';
		storedRuns = recordRun(storedRuns, nextResult);
		if (hydrated) {
			try {
				localStorage.setItem(RUNS_STORAGE_KEY, serializeStoredRuns(storedRuns));
			} catch {
				announceNotice('This browser did not permit saving the run.');
			}
		}
	}

	function handleError(message: string) {
		errorMessage = message || 'The street failed to assemble itself.';
		phase = 'error';
		overlay = 'error';
	}

	async function retryAudio() {
		if (!settings.soundEnabled) return;
		const primed = await primeSpatialAudioFromGesture();
		const running = surface ? await surface.enableAudioFromGesture() : primed;
		audioNeedsGesture = !(primed || running);
		announceNotice(
			audioNeedsGesture
				? 'The browser still has sound suspended. Tap again or check this site’s audio permission.'
				: 'Street sound is on. Headphones make direction easier to hear.'
		);
		restoreGameFocus();
	}

	async function toggleSound() {
		const soundEnabled = !settings.soundEnabled;
		settings = { ...settings, soundEnabled };
		if (soundEnabled) await retryAudio();
		else {
			audioNeedsGesture = false;
			announceNotice('Sound muted.');
			restoreGameFocus();
		}
	}

	async function toggleFullscreen() {
		if (!fullscreenSupported || !shell) {
			announceNotice('Browser fullscreen is not available here.');
			return;
		}
		try {
			if (document.fullscreenElement === shell) await document.exitFullscreen();
			else await shell.requestFullscreen();
		} catch {
			announceNotice('The browser declined fullscreen.');
		} finally {
			restoreGameFocus();
		}
	}

	function handleCommand(command: InputCommand) {
		if (command === 'mute') void toggleSound();
		else if (command === 'fullscreen') void toggleFullscreen();
		else if (command === 'restart' && result) restartWalk();
		else if (command === 'interact') surface?.interact();
		else if (command === 'turn-around') surface?.turnAround();
		else if (command === 'stop') surface?.stopWalking();
	}

	function toggleMap() {
		if (overlay === 'pause') {
			mapReturnToPause = true;
			mapPausedWalk = false;
			overlay = 'none';
			mapOpen = true;
			return;
		}
		if (mapOpen) return;
		mapReturnToPause = false;
		mapPausedWalk = phase === 'playing' || phase === 'tutorial';
		if (mapPausedWalk) surface?.pause();
		overlay = 'none';
		mapOpen = true;
	}

	function stopWalking() {
		surface?.stopWalking();
		restoreGameFocus();
	}

	function turnAround() {
		surface?.turnAround();
		restoreGameFocus();
	}

	function interact() {
		surface?.interact();
		restoreGameFocus();
	}

	function pauseGame() {
		if (!started || !['playing', 'tutorial'].includes(phase)) return;
		surface?.pause();
		mapOpen = false;
		overlay = 'pause';
	}

	function resumeGame() {
		overlay = 'none';
		surface?.resume();
		requestAnimationFrame(() => surface?.focusCanvas());
	}

	function openInstructions(returnTo?: DialogReturn) {
		dialogReturn =
			returnTo ??
			(!started ? 'title' : overlay === 'pause' || phase === 'paused' ? 'pause' : 'game');
		if (started && ['playing', 'tutorial'].includes(phase)) surface?.pause();
		overlay = 'instructions';
	}

	function openSettings(returnTo?: DialogReturn) {
		dialogReturn =
			returnTo ??
			(!started ? 'title' : overlay === 'pause' || phase === 'paused' ? 'pause' : 'game');
		if (started && ['playing', 'tutorial'].includes(phase)) surface?.pause();
		overlay = 'settings';
	}

	function closeSecondaryDialog() {
		if (dialogReturn === 'result') {
			overlay = 'none';
		} else if (dialogReturn === 'pause') {
			overlay = 'pause';
		} else if (dialogReturn === 'game') {
			overlay = 'none';
			surface?.resume();
			requestAnimationFrame(() => surface?.focusCanvas());
		} else {
			overlay = 'none';
		}
	}

	function updateSetting<Key extends keyof GameSettings>(key: Key, value: GameSettings[Key]) {
		settings = { ...settings, [key]: value, version: SETTINGS_VERSION };
		if (key === 'soundEnabled') {
			audioNeedsGesture = false;
			if (value === true) void retryAudio();
		}
	}

	function clearLocalData() {
		try {
			localStorage.removeItem(SETTINGS_STORAGE_KEY);
			localStorage.removeItem(RUNS_STORAGE_KEY);
		} catch {
			// The in-memory reset still succeeds if storage is blocked.
		}
		settings = {
			...DEFAULT_GAME_SETTINGS,
			reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
		};
		storedRuns = { ...EMPTY_STORED_RUNS, recent: [] };
		announceNotice('Local scores and settings cleared.');
	}

	function retryEngine() {
		started = false;
		overlay = 'none';
		phase = 'loading';
		requestAnimationFrame(() => void startWalk(currentSeed || newSeed()));
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (
			result &&
			event.key.toLocaleLowerCase('en') === 'r' &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey
		) {
			event.preventDefault();
			restartWalk();
		}
	}

	function formatBestTime(milliseconds: number | null): string {
		if (milliseconds === null) return 'No completed walk yet';
		const totalSeconds = Math.round(milliseconds / 1_000);
		return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
	}

	onMount(() => {
		let storedSettings: string | null = null;
		try {
			storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
			settings = parseSettings(storedSettings).settings;
			storedRuns = parseStoredRuns(localStorage.getItem(RUNS_STORAGE_KEY));
		} catch {
			settings = { ...DEFAULT_GAME_SETTINGS };
			storedRuns = { ...EMPTY_STORED_RUNS, recent: [] };
		}

		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		if (storedSettings === null && motionQuery.matches) {
			settings = { ...settings, reducedMotion: true };
		}
		const updateMotion = () => {
			try {
				if (localStorage.getItem(SETTINGS_STORAGE_KEY) === null) {
					settings = { ...settings, reducedMotion: motionQuery.matches };
				}
			} catch {
				// The current in-memory preference remains valid if storage becomes unavailable.
			}
		};
		const updateFullscreen = () => {
			isFullscreen = document.fullscreenElement === shell;
		};
		fullscreenSupported = document.fullscreenEnabled;
		isFullscreen = document.fullscreenElement === shell;
		motionQuery.addEventListener('change', updateMotion);
		document.addEventListener('fullscreenchange', updateFullscreen);
		hydrated = true;

		return () => {
			if (noticeTimer) clearTimeout(noticeTimer);
			motionQuery.removeEventListener('change', updateMotion);
			document.removeEventListener('fullscreenchange', updateFullscreen);
		};
	});

	$effect(() => {
		if (!hydrated) return;
		try {
			localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
		} catch {
			// Settings remain effective for the current page even when persistence is unavailable.
		}
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section
	bind:this={shell}
	id="game-experience"
	class="calcutta-game"
	class:reduced-motion={settings.reducedMotion}
	data-phase={phase}
	aria-label="Calcutta Footpath Simulator"
>
	{#if started}
		<div class="game-stage">
			{#key sessionId}
				<GameSurface
					bind:this={surface}
					seed={currentSeed}
					{settings}
					tutorial={settings.tutorialEnabled && !settings.tutorialCompleted}
					previousFailedRuns={recentFailureCount(storedRuns)}
					onready={handleReady}
					onhud={handleHud}
					onphase={handlePhase}
					onresult={handleResult}
					onerror={handleError}
					oncommand={handleCommand}
				/>
			{/key}

			{#if phase !== 'loading' && phase !== 'error'}
				<GameHud
					{hud}
					soundEnabled={settings.soundEnabled}
					{audioNeedsGesture}
					{fullscreenSupported}
					{isFullscreen}
					{localNotice}
					{mapOpen}
					onpause={pauseGame}
					onmute={toggleSound}
					onaudioretry={retryAudio}
					onfullscreen={toggleFullscreen}
					onmap={toggleMap}
					oninteract={interact}
					onstop={stopWalking}
					onturnaround={turnAround}
				/>
				<TouchControls
					controlScheme={settings.controlScheme}
					dashReady={hud.dashReady}
					walkingAutomatically={Boolean(hud.walkingAutomatically)}
					onvector={(x, y) => surface?.setTouchVector(x, y)}
					ondash={(pressed) => surface?.setTouchDash(pressed)}
					onpause={pauseGame}
					onstop={stopWalking}
					onturnaround={turnAround}
				/>
				<NeighbourhoodMap
					open={mapOpen}
					player={hud.playerMapPosition}
					visitedEdges={hud.visitedEdges ?? []}
					onclose={() => {
						mapOpen = false;
						if (mapReturnToPause) {
							mapReturnToPause = false;
							overlay = 'pause';
						} else if (mapPausedWalk) {
							mapPausedWalk = false;
							overlay = 'none';
							surface?.resume();
							requestAnimationFrame(() => surface?.focusCanvas());
						} else if (phase === 'paused') {
							overlay = 'pause';
						} else {
							restoreGameFocus();
						}
					}}
				/>
			{/if}

			{#if phase === 'loading'}
				<div class="loading-panel" role="status" aria-live="polite">
					<span class="loading-mark" aria-hidden="true">প</span>
					<strong>Preparing the street…</strong>
					<span>Buildings · people · sound</span>
				</div>
			{/if}
		</div>
	{:else}
		<div class="title-screen">
			<img src={game.cover} alt="" class="title-poster" width="1200" height="800" />
			<div class="title-scrim" aria-hidden="true"></div>
			<div class="title-content">
				<nav aria-label="Game navigation" class="title-nav">
					<a href={resolve('/blog/games')}>← Games</a>
					<a href="#about-the-game">About</a>
				</nav>
				<p class="eyebrow">A walking game through an ordinary impossible city</p>
				<h1 id="game-title">{game.title}</h1>
				<p class="premise">
					Get to the other end of this North Calcutta neighbourhood. There is no permanently correct
					side of the road.
				</p>
				<div class="title-actions">
					{#if fullscreenSupported}
						<button
							type="button"
							class="play-button fullscreen-play"
							onclick={() => startWalk(newSeed(), true)}
						>
							Play full screen
						</button>
					{:else}
						<button type="button" disabled title="Full screen is not available in this browser">
							Full screen unavailable
						</button>
					{/if}
					<button type="button" class="play-here" onclick={() => startWalk()}>Play in page</button>
					<button type="button" onclick={() => openInstructions('title')}>How to walk</button>
					<button
						type="button"
						onclick={toggleSound}
						aria-pressed={settings.soundEnabled}
						aria-label="Sound"
					>
						Sound: {settings.soundEnabled ? 'On' : 'Off'}
					</button>
					<button type="button" onclick={() => openSettings('title')}>Settings</button>
				</div>
				<div class="local-best" aria-label="Local best runs">
					<span>Best score <strong>{storedRuns.bestScore.toLocaleString('en-IN')}</strong></span>
					<span
						>Fastest arrival <strong>{formatBestTime(storedRuns.fastestCompletionMs)}</strong></span
					>
					<span>One walk <strong>{game.duration}</strong></span>
				</div>
				<p class="sound-note">
					Sound begins with Play and stays on unless you switch it off. Settings and recent routes
					stay only in this browser.
				</p>
			</div>
		</div>
	{/if}

	{#if overlay === 'pause'}
		<GameDialog
			title={hud.pausedByVisibility ? 'The tab moved. Calcutta waited.' : 'Walk paused'}
			description={hud.pausedByVisibility
				? 'The simulation paused when the page became hidden.'
				: `${hud.zone} · ${Math.max(0, Math.round(hud.destinationMetres ?? 0))} m to the destination`}
			onclose={resumeGame}
		>
			<div class="dialog-actions">
				<button type="button" class="primary-dialog-button" onclick={resumeGame}>Resume walk</button
				>
				<button type="button" onclick={() => openInstructions('pause')}>How do I walk?</button>
				<button type="button" onclick={toggleMap}>Map</button>
				<button type="button" onclick={() => openSettings('pause')}>Settings</button>
				<button type="button" onclick={toggleSound}>
					Sound: {settings.soundEnabled ? 'On' : 'Off'}
				</button>
				<button
					type="button"
					onclick={() =>
						updateSetting(
							'cameraMovement',
							settings.cameraMovement === 'gentle' ? 'normal' : 'gentle'
						)}>Camera: {settings.cameraMovement === 'gentle' ? 'Gentle' : 'Normal'}</button
				>
				{#if isFullscreen}
					<button type="button" onclick={toggleFullscreen}>Exit full screen</button>
				{/if}
				<button type="button" onclick={() => restartWalk()}>Restart walk</button>
				<a href={resolve('/blog/games')}>Return to Games</a>
			</div>
			<p class="dialog-status">
				Reduced motion: <strong>{settings.reducedMotion ? 'On' : 'Off'}</strong> · Seed:
				<code>{currentSeed}</code>
			</p>
		</GameDialog>
	{:else if overlay === 'instructions'}
		<GameDialog
			title="How to Walk"
			description="You do not need to know video-game controls."
			onclose={closeSecondaryDialog}
			wide
		>
			<div class="instructions-grid simple-instructions">
				<section>
					<h3>Click or tap the road</h3>
					<p>
						Choose a clear place on the visible street. You will walk towards it. Tap farther ahead
						to continue or tap into a side lane to turn there.
					</p>
				</section>
				<section>
					<h3>Arrow keys</h3>
					<dl>
						<div>
							<dt>↑ Up</dt>
							<dd>Walk forward</dd>
						</div>
						<div>
							<dt>← → Left / Right</dt>
							<dd>Turn while walking</dd>
						</div>
						<div>
							<dt>↓ Down</dt>
							<dd>Step back</dd>
						</div>
						<div>
							<dt>Space</dt>
							<dd>Hurry briefly</dd>
						</div>
						<div>
							<dt>Escape</dt>
							<dd>Pause</dd>
						</div>
					</dl>
				</section>
				<details>
					<summary>More controls and street advice</summary>
					<ul>
						<li>Use the labelled Turn around and Stop buttons whenever you need them.</li>
						<li>
							Hold the right mouse button and drag gently to look around. Release it and the view
							returns behind you.
						</li>
						<li>
							When a tea or food prompt appears, click it or press Enter. You will stop while the
							street continues moving.
						</li>
						<li>
							Headphones make approaching traffic easier to locate, but every essential warning also
							appears on screen.
						</li>
						<li>Experienced controls (WASD, mouse-look and gamepad) can be enabled in Settings.</li>
					</ul>
				</details>
			</div>
			<div class="dialog-actions">
				<button type="button" class="primary-dialog-button" onclick={closeSecondaryDialog}>
					{dialogReturn === 'title'
						? 'Back to title'
						: dialogReturn === 'pause'
							? 'Back to pause'
							: 'Continue walk'}
				</button>
			</div>
		</GameDialog>
	{:else if overlay === 'settings'}
		<GameDialog
			title="Street settings"
			description="Saved only in this browser."
			onclose={closeSecondaryDialog}
			wide
		>
			<div class="settings-list">
				<label>
					<span
						><strong>Sound</strong><small
							>Street ambience, spatial traffic, rain, people and footsteps. Your explicit choice is
							remembered.</small
						></span
					>
					<input
						type="checkbox"
						checked={settings.soundEnabled}
						onchange={(event) => updateSetting('soundEnabled', event.currentTarget.checked)}
					/>
				</label>
				<label>
					<span
						><strong>Reduced motion</strong><small
							>Reduces camera bob, shake, quick camera movement and rain streaks while keeping the
							street alive.</small
						></span
					>
					<input
						type="checkbox"
						checked={settings.reducedMotion}
						onchange={(event) => updateSetting('reducedMotion', event.currentTarget.checked)}
					/>
				</label>
				<label>
					<span
						><strong>High-contrast warnings</strong><small
							>Adds black, white, shape, and text cues.</small
						></span
					>
					<input
						type="checkbox"
						checked={settings.highContrastWarnings}
						onchange={(event) => updateSetting('highContrastWarnings', event.currentTarget.checked)}
					/>
				</label>
				<label>
					<span
						><strong>Interactive tutorial</strong><small
							>Replay short cues during the first stretch.</small
						></span
					>
					<input
						type="checkbox"
						checked={settings.tutorialEnabled}
						onchange={(event) => updateSetting('tutorialEnabled', event.currentTarget.checked)}
					/>
				</label>
				<label>
					<span
						><strong>Visual quality</strong><small
							>Auto chooses a conservative Three.js detail level for this device.</small
						></span
					>
					<select
						value={settings.detailLevel}
						onchange={(event) =>
							updateSetting(
								'detailLevel',
								event.currentTarget.value as GameSettings['detailLevel']
							)}
					>
						<option value="auto">Auto</option>
						<option value="low">Low</option>
						<option value="high">High</option>
					</select>
				</label>
				<label>
					<span
						><strong>Walking controls</strong><small
							>Simple keeps click/tap and arrow controls. Experienced adds WASD, mouse-look and
							gamepad.</small
						></span
					>
					<select
						value={settings.controlScheme}
						onchange={(event) =>
							updateSetting(
								'controlScheme',
								event.currentTarget.value as GameSettings['controlScheme']
							)}
					>
						<option value="simple">Simple (recommended)</option>
						<option value="experienced">Experienced</option>
					</select>
				</label>
				<label>
					<span
						><strong>Camera movement</strong><small
							>Gentle follows turns more slowly and reduces disorientation.</small
						></span
					>
					<select
						value={settings.cameraMovement}
						onchange={(event) =>
							updateSetting(
								'cameraMovement',
								event.currentTarget.value as GameSettings['cameraMovement']
							)}
					>
						<option value="gentle">Gentle (recommended)</option>
						<option value="normal">Normal</option>
					</select>
				</label>
			</div>
			<div class="dialog-actions">
				<button type="button" class="primary-dialog-button" onclick={closeSecondaryDialog}>
					Done
				</button>
				<button type="button" class="danger-button" onclick={clearLocalData}>
					Clear local scores and settings
				</button>
			</div>
			{#if localNotice}<p class="dialog-status" aria-live="polite">{localNotice}</p>{/if}
		</GameDialog>
	{:else if overlay === 'error'}
		<GameDialog
			title="The pavement could not be assembled"
			description={errorMessage}
			onclose={retryEngine}
		>
			<p>
				The rest of the site is still working. Retrying creates a fresh client engine without
				reloading the article or duplicating the old simulation.
			</p>
			<div class="dialog-actions">
				<button type="button" class="primary-dialog-button" onclick={retryEngine}>Retry</button>
				<a href={resolve('/blog/games')}>Return to Games</a>
			</div>
		</GameDialog>
	{/if}

	{#if result && overlay === 'none'}
		<ResultsOverlay
			{result}
			onreplay={() => restartWalk()}
			onsameseed={() => restartWalk(result!.seed)}
			oninstructions={() => openInstructions('result')}
			onexit={() => {
				window.location.href = resolve('/blog/games');
			}}
		/>
	{/if}

	<p class="sr-only" aria-live="polite">
		{phase === 'loading'
			? 'Loading the game.'
			: phase === 'paused'
				? 'The walk is paused.'
				: phase === 'won'
					? 'Destination reached.'
					: phase === 'lost'
						? 'The walk has ended.'
						: ''}
	</p>
</section>

<style>
	.calcutta-game {
		--game-paper: #f6e9cd;
		--game-ink: #251d18;
		--game-amber: #f2bc4d;
		--game-rust: #a94431;
		position: relative;
		width: 100%;
		height: 100vh;
		height: 100dvh;
		min-height: 100svh;
		overflow: hidden;
		background: #171612;
		color: var(--game-paper);
		font-family: var(--font-sans);
		isolation: isolate;
	}

	.game-stage,
	.title-screen {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}

	.title-screen {
		display: grid;
		place-items: center;
		background: #2a211a;
	}

	.title-poster,
	.title-scrim {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.title-poster {
		object-fit: cover;
		filter: saturate(0.8) contrast(1.04) brightness(0.58);
	}

	.title-scrim {
		background:
			linear-gradient(90deg, rgb(19 14 11 / 0.88), rgb(19 14 11 / 0.42) 65%, rgb(19 14 11 / 0.7)),
			linear-gradient(0deg, rgb(18 13 10 / 0.82), transparent 52%);
	}

	.title-content {
		position: relative;
		z-index: 1;
		width: min(62rem, 100%);
		max-height: 100%;
		overflow-y: auto;
		padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
			max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
		overscroll-behavior: contain;
	}

	.title-nav {
		display: flex;
		gap: 1rem;
		margin-bottom: clamp(1.2rem, 5vh, 4rem);
	}

	.title-nav a,
	.dialog-actions a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		color: inherit;
		font-weight: 800;
		text-decoration: underline;
		text-decoration-color: rgb(242 188 77 / 0.65);
		text-underline-offset: 0.28rem;
	}

	.eyebrow {
		margin: 0 0 0.65rem;
		color: #f7ca6c;
		font-size: 0.75rem;
		font-weight: 900;
		letter-spacing: 0.18em;
		text-align: left;
		text-transform: uppercase;
	}

	h1 {
		max-width: 56rem;
		margin: 0;
		color: #fff5df;
		font-size: clamp(2.25rem, 7vw, 5.8rem);
		font-weight: 950;
		letter-spacing: -0.045em;
		line-height: 0.94;
		text-wrap: balance;
		text-shadow: 0 5px 30px rgb(0 0 0 / 0.56);
	}

	.premise {
		max-width: 46rem;
		margin: 1.25rem 0 0;
		color: #eadcc3;
		font-size: clamp(1rem, 2.2vw, 1.35rem);
		font-weight: 600;
		line-height: 1.55;
		text-align: left;
		text-wrap: balance;
	}

	.title-actions,
	.dialog-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
		margin-top: 1.5rem;
	}

	.title-actions button,
	.dialog-actions button,
	.dialog-actions a {
		min-height: 2.75rem;
		border: 1px solid rgb(255 240 207 / 0.32);
		border-radius: 0.6rem;
		background: rgb(28 21 17 / 0.78);
		padding: 0.65rem 1rem;
		color: #fff4df;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 850;
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	.title-actions button:hover,
	.dialog-actions button:hover,
	.dialog-actions a:hover {
		border-color: #f2bc4d;
		background: #37271e;
	}

	.title-actions button:disabled {
		opacity: 0.58;
		cursor: not-allowed;
	}

	.title-actions .play-button,
	.dialog-actions .primary-dialog-button {
		border-color: #f4d37f;
		background: var(--game-amber);
		color: #281c12;
		font-weight: 950;
	}

	.title-actions .play-button {
		min-width: 12rem;
		font-size: 1.05rem;
		text-transform: uppercase;
	}

	.title-actions .play-here {
		border-color: rgb(244 211 127 / 72%);
	}

	.local-best {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1.25rem;
		margin-top: 1.25rem;
		color: #cfbfa8;
		font-size: 0.78rem;
	}

	.local-best strong {
		color: #fff3dc;
	}

	.sound-note {
		margin: 0.75rem 0 0;
		color: #b7a68e;
		font-size: 0.75rem;
		text-align: left;
	}

	.loading-panel {
		position: absolute;
		inset: 0;
		z-index: 30;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 0.55rem;
		background:
			repeating-linear-gradient(-8deg, transparent 0 12px, rgb(255 255 255 / 0.018) 13px), #211b17;
		color: #f3e6ce;
		text-align: center;
	}

	.loading-panel span:last-child {
		color: #bfae92;
		font-size: 0.82rem;
	}

	.loading-mark {
		display: grid;
		width: 4.25rem;
		height: 4.25rem;
		place-items: center;
		border: 3px dashed #e9b64c;
		border-radius: 50%;
		color: #f4ce79;
		font-family: var(--font-serif);
		font-size: 2rem;
		animation: municipal-turn 1.8s steps(8) infinite;
	}

	.dialog-actions {
		margin-top: 1.25rem;
	}

	.dialog-actions .danger-button {
		border-color: rgb(220 92 70 / 0.68);
		color: #ffcabf;
	}

	.dialog-status {
		margin: 1rem 0 0;
		color: #bdad96;
		font-size: 0.78rem;
		text-align: left;
	}

	.dialog-status code {
		overflow-wrap: anywhere;
		color: #f4ce79;
	}

	.instructions-grid {
		display: grid;
		gap: 1rem;
	}

	.instructions-grid section {
		border: 1px solid rgb(255 239 207 / 0.13);
		border-radius: 0.75rem;
		background: rgb(255 255 255 / 0.035);
		padding: 1rem;
	}

	.instructions-grid h3 {
		margin: 0 0 0.65rem;
		color: #f4c866;
		font-size: 1rem;
	}

	.instructions-grid p,
	.instructions-grid li {
		color: #ded0b9;
		font-size: 0.86rem;
		line-height: 1.55;
		text-align: left;
	}

	.instructions-grid ul {
		margin: 0;
		padding-left: 1.1rem;
	}

	.instructions-grid details {
		grid-column: 1 / -1;
		border: 1px solid rgb(255 239 207 / 13%);
		border-radius: 0.75rem;
		background: rgb(255 255 255 / 3.5%);
		padding: 1rem;
	}

	.instructions-grid summary {
		color: #f4c866;
		font-size: 0.9rem;
		font-weight: 850;
		cursor: pointer;
	}

	.instructions-grid details ul {
		margin-top: 0.75rem;
	}

	.calcutta-game:fullscreen {
		width: 100vw;
		height: 100vh;
		height: 100dvh;
		background: #11110f;
	}

	.instructions-grid dl {
		display: grid;
		gap: 0.45rem;
		margin: 0;
	}

	.instructions-grid dl div {
		display: grid;
		grid-template-columns: minmax(7rem, 0.8fr) 1.2fr;
		gap: 0.75rem;
		font-size: 0.84rem;
	}

	.instructions-grid dt {
		color: #f3e5ca;
		font-weight: 850;
	}

	.instructions-grid dd {
		margin: 0;
		color: #bfae93;
	}

	.settings-list {
		display: grid;
		gap: 0.55rem;
	}

	.settings-list label {
		display: grid;
		min-height: 3.6rem;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 1rem;
		border-bottom: 1px solid rgb(255 239 207 / 0.1);
		padding: 0.45rem 0;
	}

	.settings-list label > span {
		display: grid;
		gap: 0.15rem;
	}

	.settings-list small {
		color: #bbaa90;
		line-height: 1.35;
	}

	.settings-list input {
		width: 1.35rem;
		height: 1.35rem;
		accent-color: #eeb849;
	}

	.settings-list select {
		min-height: 2.75rem;
		max-width: 10rem;
		border: 1px solid rgb(255 239 207 / 0.3);
		border-radius: 0.45rem;
		background: #251e19;
		padding: 0.45rem 0.6rem;
		color: #f3e7d1;
		font: inherit;
	}

	button:focus-visible,
	a:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 3px solid #f6cd70;
		outline-offset: 3px;
	}

	@keyframes municipal-turn {
		to {
			transform: rotate(1turn);
		}
	}

	@media (min-width: 42rem) {
		.instructions-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (orientation: portrait) and (max-width: 42rem) {
		.title-content {
			display: flex;
			flex-direction: column;
			justify-content: flex-end;
		}

		.title-nav {
			position: absolute;
			top: max(1rem, env(safe-area-inset-top));
			left: max(1rem, env(safe-area-inset-left));
			margin: 0;
		}

		h1 {
			font-size: clamp(2.15rem, 12vw, 4.25rem);
		}

		.title-actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.title-actions .play-button {
			grid-column: 1 / -1;
		}

		.local-best span:nth-child(3) {
			display: none;
		}
	}

	@media (max-height: 40rem) and (orientation: landscape) {
		.title-content {
			padding-top: max(0.6rem, env(safe-area-inset-top));
			padding-bottom: max(0.6rem, env(safe-area-inset-bottom));
		}

		.title-nav {
			margin-bottom: 0.75rem;
		}

		h1 {
			max-width: 44rem;
			font-size: clamp(2rem, 7vw, 4.1rem);
		}

		.premise {
			margin-top: 0.7rem;
			font-size: 0.95rem;
		}

		.title-actions {
			margin-top: 0.75rem;
		}

		.local-best,
		.sound-note {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.loading-mark {
			animation: none;
		}
	}

	.reduced-motion .loading-mark {
		animation: none;
	}
</style>
