<script lang="ts">
	import { onMount } from 'svelte';
	import KagojerDanaGame from './KagojerDanaGame.svelte';
	import FlightHud from './FlightHud.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import FlightFolio from './FlightFolio.svelte';
	import type { GameCatalogEntry } from '$lib/games/catalog';
	import type {
		FlightCallbacks,
		FlightEngineApi,
		FlightFolioResult,
		FlightHudSnapshot,
		FlightPhase
	} from '$lib/games/kagojer-dana/runtime-types';
	import { emptyHud } from '$lib/games/kagojer-dana/runtime-types';
	import {
		DEFAULT_SETTINGS,
		SETTINGS_STORAGE_KEY,
		parseSettings,
		serializeSettings,
		withReducedMotionDefault,
		type KagojerDanaSettings
	} from '$lib/games/kagojer-dana/settings';
	import {
		createReadableSeed,
		flightShareUrl,
		parseFlightQuery,
		type FlightMode
	} from '$lib/games/kagojer-dana/share';
	import {
		KAGOJER_DANA_PROGRESSION_STORAGE_KEY,
		applyFlightProgression,
		createDefaultProgressionState,
		parseProgressionState,
		serializeProgressionState,
		type ProgressionCompletableVariant,
		type ProgressionFlightOutcome,
		type ProgressionLandingKind,
		type ProgressionRegister,
		type ProgressionUnlockEvent,
		type ProgressionUnlockId
	} from '$lib/games/kagojer-dana/engine/Progression';

	type ShellPhase = 'poster' | FlightPhase;
	type SurfaceHandle = Pick<
		FlightEngineApi,
		| 'pause'
		| 'resume'
		| 'resize'
		| 'setMuted'
		| 'setQuality'
		| 'setTouchVector'
		| 'relaunch'
		| 'finish'
	> & {
		focusCanvas(): void;
		enableAudioFromGesture?(context: AudioContext): Promise<boolean>;
	};

	let { game }: { game: GameCatalogEntry } = $props();
	let shell: HTMLElement;
	let surface = $state<SurfaceHandle | undefined>();
	let settings = $state<KagojerDanaSettings>({ ...DEFAULT_SETTINGS });
	let hud = $state<FlightHudSnapshot>(emptyHud());
	let result = $state<FlightFolioResult | null>(null);
	let progression = $state(createDefaultProgressionState());
	let progressionUnlocks = $state<readonly ProgressionUnlockEvent[]>([]);
	let phase = $state<ShellPhase>('poster');
	let started = $state(false);
	let currentSeed = $state('KD-OLD-ROOFS');
	let flightMode = $state<FlightMode>('curated');
	let sessionId = $state(0);
	let showSettings = $state(false);
	let showControls = $state(false);
	let fullscreenSupported = $state(false);
	let isFullscreen = $state(false);
	let portraitPhone = $state(false);
	let portraitPaused = $state(false);
	let debug = $state(false);
	let caption = $state('');
	let gentleWindOffer = $state(false);
	let announcement = $state('');
	let errorMessage = $state('');
	let primedAudioContext = $state<AudioContext | undefined>();
	let pauseFirstButton = $state<HTMLButtonElement | undefined>();
	let portraitActionButton = $state<HTMLButtonElement | undefined>();
	let portraitHeading = $state<HTMLHeadingElement | undefined>();
	let landscapeResumeButton = $state<HTMLButtonElement | undefined>();
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let captionTimer: ReturnType<typeof setTimeout> | undefined;

	const muted = $derived(!settings.soundEnabled);
	const callbacks: FlightCallbacks = {
		onReady: () => {
			if (portraitPhone) {
				portraitPaused = true;
				phase = 'paused';
				requestAnimationFrame(() => surface?.pause(true));
				return;
			}
			phase = 'playing';
			requestAnimationFrame(() => surface?.focusCanvas());
			announce(settings.soundEnabled ? 'Calcutta sound is on.' : 'The flight remains silent.');
		},
		onHud: (next) => {
			hud = next;
		},
		onPhase: (next) => {
			if (portraitPhone && next === 'playing') {
				portraitPaused = true;
				phase = 'paused';
				requestAnimationFrame(() => surface?.pause(true));
			} else phase = next;
		},
		onResult: (next) => {
			const update = applyFlightProgression(progression, progressionOutcome(next));
			progression = update.state;
			progressionUnlocks = update.newUnlocks;
			try {
				localStorage.setItem(
					KAGOJER_DANA_PROGRESSION_STORAGE_KEY,
					serializeProgressionState(progression)
				);
			} catch {
				// Progression still survives for this page when storage is unavailable.
			}
			result = next;
			phase = 'ended';
			announce(
				update.newUnlocks.length > 0
					? `The flight folio is ready with ${update.newUnlocks.length} new wind ${update.newUnlocks.length === 1 ? 'page' : 'pages'}.`
					: 'The flight folio is ready.'
			);
		},
		onError: (message) => {
			errorMessage = message || 'The paper plane could not find the wind.';
			phase = 'error';
			started = false;
		},
		onCommand: (command) => {
			if (command === 'pause') pauseFlight();
			else if (command === 'mute') void toggleSound();
			else if (command === 'fullscreen') void toggleFullscreen();
			else if (command === 'relaunch') relaunch();
			else if (command === 'finish') surface?.finish();
			else if (command === 'resume') resumeFlight();
		},
		onCaption: (message) => {
			caption = message;
			if (captionTimer) clearTimeout(captionTimer);
			captionTimer = setTimeout(() => {
				caption = '';
				captionTimer = undefined;
			}, 4_000);
		},
		onAssistanceOffer: () => {
			gentleWindOffer = true;
			announce('Gentle Wind assistance is available if you want it.');
		}
	};

	function progressionOutcome(next: FlightFolioResult): ProgressionFlightOutcome {
		const registers: ProgressionRegister[] = [];
		const addRegister = (register: ProgressionRegister) => {
			if (!registers.includes(register)) registers.push(register);
		};
		for (const point of next.altitudeProfile) {
			if (point.altitudeMetres < 28) addRegister('low');
			else if (point.altitudeMetres < 150) addRegister('middle');
			else addRegister('high');
		}
		if (registers.length === 0) addRegister('low');
		const winds = next.windsBorrowed.map((wind) => wind.toLocaleLowerCase('en'));
		const landingText = next.landing.toLocaleLowerCase('en');
		let landingKind: ProgressionLandingKind = 'other';
		if (landingText.includes('ghat') || landingText.includes('hooghly')) landingKind = 'ghat';
		else if (landingText.includes('maidan')) landingKind = 'maidan-edge';
		else if (landingText.includes('new town')) landingKind = 'new-town-terrace';
		else if (landingText.includes('courtyard')) landingKind = 'courtyard';
		else if (landingText.includes('roof')) landingKind = 'rooftop';
		const sequence: readonly {
			variant: ProgressionCompletableVariant;
			unlockId: ProgressionUnlockId;
		}[] = [
			{ variant: 'afternoon-heat', unlockId: 'weather:afternoon-heat' },
			{ variant: 'winter-haze', unlockId: 'weather:winter-haze' },
			{ variant: 'river-evening', unlockId: 'time:river-evening' },
			{ variant: 'approaching-monsoon', unlockId: 'weather:approaching-monsoon' }
		];
		const completedVariant =
			next.mode === 'curated'
				? (sequence.find(
						(item) =>
							progression.unlocked.includes(item.unlockId) &&
							!progression.completedVariants.includes(item.variant)
					)?.variant ?? null)
				: null;
		return {
			visitedRegisters: registers,
			landmarkObservations: next.landmarks.map((landmarkId) => ({
				landmarkId,
				visibleSeconds: 10
			})),
			windTransfers:
				winds.some((wind) => wind.includes('river')) && winds.some((wind) => wind.includes('roof'))
					? [{ from: 'river-breeze', to: 'roof-thermal' }]
					: [],
			landing: { kind: landingKind, graceful: true },
			completedVariant
		};
	}

	function announce(message: string) {
		announcement = message;
		if (noticeTimer) clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => {
			announcement = '';
			noticeTimer = undefined;
		}, 4_000);
	}

	function createGestureAudioContext(): AudioContext | undefined {
		if (typeof window === 'undefined') return undefined;
		const audioWindow = window as typeof window & {
			webkitAudioContext?: typeof AudioContext;
		};
		const Context = window.AudioContext ?? audioWindow.webkitAudioContext;
		if (!Context) return undefined;
		try {
			const context = new Context({ latencyHint: 'interactive' });
			void context.resume().catch(() => undefined);
			return context;
		} catch {
			return undefined;
		}
	}

	function persistSettings(next: KagojerDanaSettings) {
		settings = next;
		try {
			localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(next));
		} catch {
			announce('This browser did not permit saving flight settings.');
		}
	}

	function startFlight(sound: boolean, seed = currentSeed, mode: FlightMode = flightMode) {
		if (portraitPhone) {
			announce('Rotate to landscape before the plane can take the wind.');
			return;
		}
		primedAudioContext = sound ? createGestureAudioContext() : undefined;
		persistSettings({ ...settings, soundEnabled: sound });
		currentSeed = seed;
		flightMode = mode;
		hud = emptyHud(seed);
		result = null;
		progressionUnlocks = [];
		errorMessage = '';
		caption = '';
		gentleWindOffer = false;
		phase = 'loading';
		started = true;
		portraitPaused = false;
		sessionId += 1;
		requestAnimationFrame(() => shell?.scrollIntoView({ block: 'start' }));
	}

	function startNewWind(mode: FlightMode = 'curated') {
		startFlight(settings.soundEnabled, createReadableSeed(), mode);
	}

	function pauseFlight() {
		if (!started || phase === 'ended' || phase === 'error') return;
		surface?.pause();
		phase = 'paused';
	}

	function resumeFlight() {
		if (portraitPhone) return;
		portraitPaused = false;
		showSettings = false;
		surface?.resume();
		phase = 'playing';
		requestAnimationFrame(() => surface?.focusCanvas());
	}

	function relaunch() {
		if (!started) return;
		result = null;
		surface?.relaunch();
		phase = 'playing';
		announce('Another nearby gust has the paper.');
	}

	async function toggleSound() {
		const soundEnabled = !settings.soundEnabled;
		persistSettings({ ...settings, soundEnabled });
		if (soundEnabled) {
			const context = createGestureAudioContext();
			if (context && surface?.enableAudioFromGesture) {
				const running = await surface.enableAudioFromGesture(context);
				if (!running) announce('The browser kept sound suspended; the visual flight continues.');
			} else surface?.setMuted(false);
		} else {
			surface?.setMuted(true);
			announce('Sound muted.');
		}
	}

	async function toggleFullscreen() {
		if (!fullscreenSupported || !shell) {
			announce('Fullscreen is not available in this browser.');
			return;
		}
		try {
			if (document.fullscreenElement === shell) await document.exitFullscreen();
			else await shell.requestFullscreen();
		} catch {
			announce('The browser declined fullscreen.');
		}
	}

	async function requestLandscapeFullscreen() {
		await toggleFullscreen();
		try {
			await (
				screen.orientation as ScreenOrientation & {
					lock?(orientation: 'landscape'): Promise<void>;
				}
			).lock?.('landscape');
		} catch {
			announce('Rotate the phone manually; orientation lock was unavailable.');
		}
	}

	function updateSettings(next: KagojerDanaSettings) {
		persistSettings(next);
		surface?.setQuality(next.quality);
		surface?.setMuted(!next.soundEnabled);
	}

	function handleTouchVector(bank: number, pitch: number) {
		surface?.setTouchVector(bank, pitch);
	}

	async function shareFlight() {
		const url = flightShareUrl(new URL(window.location.href), currentSeed, flightMode);
		history.replaceState(history.state, '', url);
		const shareData = {
			title: game.title,
			text: 'You do not command the wind. You borrow it.',
			url: url.href
		};
		try {
			if (navigator.share) await navigator.share(shareData);
			else {
				await navigator.clipboard.writeText(url.href);
				announce('City-and-wind link copied.');
			}
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return;
			announce('The share sheet was unavailable; the URL now contains this city and wind.');
		}
	}

	function updatePortraitState() {
		const next = window.innerWidth < 700 && window.innerHeight > window.innerWidth;
		if (next && !portraitPhone && started && (phase === 'playing' || phase === 'loading')) {
			surface?.pause(true);
			portraitPaused = true;
			phase = 'paused';
			announce('Flight paused until the wider horizon returns.');
		}
		portraitPhone = next;
		requestAnimationFrame(() => surface?.resize());
	}

	$effect(() => {
		const target = portraitPhone
			? (portraitActionButton ?? portraitHeading)
			: portraitPaused
				? landscapeResumeButton
				: phase === 'paused' && !showSettings
					? pauseFirstButton
					: undefined;
		if (!target) return;
		const frame = requestAnimationFrame(() => target.focus({ preventScroll: true }));
		return () => cancelAnimationFrame(frame);
	});

	onMount(() => {
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
		} catch {
			// Privacy modes may deny storage; the in-memory defaults remain fully usable.
		}
		try {
			progression = parseProgressionState(
				localStorage.getItem(KAGOJER_DANA_PROGRESSION_STORAGE_KEY)
			);
		} catch {
			progression = createDefaultProgressionState();
		}
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		settings = withReducedMotionDefault(parseSettings(stored), reducedMotion, stored !== null);
		try {
			localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
		} catch {
			// Persistence is optional; defaults still work.
		}
		const query = parseFlightQuery(new URL(window.location.href));
		currentSeed = query.seed ?? createReadableSeed();
		flightMode = query.mode;
		hud = emptyHud(currentSeed);
		debug = new URL(window.location.href).searchParams.get('kd_debug') === '1';
		fullscreenSupported = Boolean(document.fullscreenEnabled && shell?.requestFullscreen);
		updatePortraitState();

		const handleResize = () => updatePortraitState();
		const handleFullscreen = () => {
			isFullscreen = document.fullscreenElement === shell;
			requestAnimationFrame(() => surface?.resize());
		};
		window.addEventListener('resize', handleResize, { passive: true });
		document.addEventListener('fullscreenchange', handleFullscreen);

		return () => {
			if (noticeTimer) clearTimeout(noticeTimer);
			if (captionTimer) clearTimeout(captionTimer);
			window.removeEventListener('resize', handleResize);
			document.removeEventListener('fullscreenchange', handleFullscreen);
			if (document.fullscreenElement === shell) void document.exitFullscreen();
		};
	});
</script>

<section
	bind:this={shell}
	id="game-experience"
	class:fullscreen={isFullscreen}
	class:portrait-phone={portraitPhone}
	class:calm-flight={settings.calmFlight}
	class:high-contrast={settings.highContrastCorridor}
	class="kagojer-shell"
	data-phase={phase}
	data-seed={currentSeed}
	aria-label="Kagojer Dana paper-plane game"
>
	{#if started}
		<div
			class:visually-paused={portraitPhone}
			class="live-flight"
			aria-hidden={portraitPhone || phase !== 'playing'}
			inert={portraitPhone || phase !== 'playing'}
		>
			{#key sessionId}
				<KagojerDanaGame
					bind:this={surface}
					seed={currentSeed}
					mode={flightMode}
					{settings}
					audioContext={primedAudioContext}
					{callbacks}
				/>
			{/key}
			{#if phase === 'playing'}
				<FlightHud
					{hud}
					{muted}
					captions={settings.soundCaptions}
					{caption}
					showScore={settings.showScore}
					{debug}
					{fullscreenSupported}
					{isFullscreen}
					onpause={pauseFlight}
					onmute={() => void toggleSound()}
					onfullscreen={() => void toggleFullscreen()}
					onsettings={() => {
						pauseFlight();
						showSettings = true;
					}}
					onvector={handleTouchVector}
				/>
			{/if}
		</div>
	{/if}

	{#if (!started || phase === 'error') && !portraitPhone}
		<div class="poster-layer">
			<img
				src="/images/games/kagojer-dana-poster.webp"
				alt=""
				width="1200"
				height="800"
				class="poster-image"
				fetchpriority="high"
			/>
			<div class="poster-wash" aria-hidden="true"></div>
			<div class="opening-card">
				<p class="eyebrow">A paper plane through Calcutta</p>
				<h1>{game.shortTitle}</h1>
				<p class="bengali" lang="bn">কাগজের ডানা</p>
				<blockquote>You do not command the wind. You borrow it.</blockquote>
				{#if phase === 'error'}
					<p class="error-message" role="alert">{errorMessage}</p>
				{/if}
				<div class="opening-actions">
					<button type="button" class="primary" onclick={() => startFlight(true)}>
						Fly with Calcutta sound
					</button>
					<button type="button" onclick={() => startFlight(false)}>Fly silently</button>
					<button
						type="button"
						onclick={() => (showControls = !showControls)}
						aria-expanded={showControls}
					>
						Controls
					</button>
					<button
						type="button"
						aria-pressed={settings.calmFlight}
						onclick={() => updateSettings({ ...settings, calmFlight: !settings.calmFlight })}
					>
						Calm flight: {settings.calmFlight ? 'On' : 'Off'}
					</button>
					{#if fullscreenSupported}
						<button type="button" onclick={() => void toggleFullscreen()}>Fullscreen</button>
					{/if}
				</div>
				{#if showControls}
					<div class="controls-note">
						<p><strong>Raise:</strong> W / ↑ · <strong>Lower:</strong> S / ↓</p>
						<p><strong>Bank:</strong> A / D or ← / → · <strong>Pause:</strong> Escape</p>
						<p>On touch, drag the single oval field. Raising the nose spends speed.</p>
					</div>
				{/if}
				<button type="button" class="free-flight-link" onclick={() => startNewWind('free')}>
					New Wind · no-score free flight
				</button>
				<p class="seed-line">City & wind seed · {currentSeed}</p>
			</div>
		</div>
	{/if}

	{#if phase === 'loading' && !portraitPhone}
		<div class="loading-card" role="status">
			<span class="paper-plane" aria-hidden="true">△</span>
			<strong>Folding the city around this wind…</strong>
			<small>{currentSeed}</small>
		</div>
	{/if}

	{#if portraitPhone}
		<div class="portrait-fallback">
			<img src="/images/games/kagojer-dana-portrait.webp" alt="" width="800" height="1200" />
			<div>
				<p class="eyebrow">{currentSeed}</p>
				<h2 bind:this={portraitHeading} tabindex="-1">Kagojer Dana</h2>
				<p>This flight needs a wider horizon. Rotate your phone to fly.</p>
				{#if fullscreenSupported}
					<button
						bind:this={portraitActionButton}
						type="button"
						onclick={() => void requestLandscapeFullscreen()}
					>
						Enter landscape fullscreen
					</button>
				{:else}
					<p>Rotate the phone manually; this browser does not offer landscape fullscreen.</p>
				{/if}
				<p class="scenic-description">
					A warm notebook-paper plane banks above a narrow charcoal lane of green shutters, laundry
					and rooftop water tanks; the dark cantilever truss of Howrah Bridge opens over the pale
					Hooghly beyond.
				</p>
				{#if portraitPaused}
					<p>The plane, score and loaded city are paused exactly where you left them.</p>
				{/if}
			</div>
		</div>
	{:else if portraitPaused}
		<div class="resume-landscape-card">
			<p>The wider horizon has returned.</p>
			<button bind:this={landscapeResumeButton} type="button" onclick={resumeFlight}
				>Resume flight</button
			>
		</div>
	{/if}

	{#if phase === 'paused' && !portraitPhone && !portraitPaused && !showSettings}
		<div class="pause-card" role="dialog" aria-modal="false" aria-labelledby="paused-title">
			<p class="eyebrow">Paper held in a quiet hand</p>
			<h2 id="paused-title">Flight paused</h2>
			<p>{hud.district} · {Math.round(hud.altitudeMetres)} metres · {currentSeed}</p>
			<div>
				<button bind:this={pauseFirstButton} type="button" class="primary" onclick={resumeFlight}
					>Resume flight</button
				>
				<button type="button" onclick={() => (showSettings = true)}>Settings</button>
				<button type="button" onclick={relaunch}>Catch another gust</button>
				<button type="button" onclick={() => surface?.finish()}>End flight and open folio</button>
			</div>
		</div>
	{/if}

	{#if gentleWindOffer && phase === 'playing' && !portraitPhone}
		<div class="assistance-offer" role="status">
			<p>
				<strong>Would a steadier fold help?</strong> Gentle Wind adds stronger auto-levelling and calmer
				gusts.
			</p>
			<div>
				<button
					type="button"
					onclick={() => {
						updateSettings({ ...settings, windMode: 'gentle' });
						gentleWindOffer = false;
						announce('Gentle Wind enabled.');
					}}>Use Gentle Wind</button
				>
				<button type="button" onclick={() => (gentleWindOffer = false)}>Keep this wind</button>
			</div>
		</div>
	{/if}

	{#if showSettings}
		<SettingsPanel
			{settings}
			onupdate={updateSettings}
			onclose={() => {
				showSettings = false;
				if (started && phase === 'paused' && !portraitPaused) resumeFlight();
			}}
		/>
	{/if}

	{#if result}
		{@const folio = result}
		<FlightFolio
			result={folio}
			unlocks={progressionUnlocks}
			showScore={settings.showScore}
			onshare={() => void shareFlight()}
			onsamewind={() => startFlight(settings.soundEnabled, folio.seed, folio.mode)}
			onnewwind={() => startNewWind('free')}
			onfreeflight={() => startFlight(settings.soundEnabled, folio.seed, 'free')}
		/>
	{/if}

	<p class="sr-only" aria-live="polite">{announcement}</p>
</section>

<style>
	:global(body:has(.kagojer-shell:fullscreen)) {
		overflow: hidden;
	}

	.kagojer-shell {
		position: relative;
		isolation: isolate;
		width: 100%;
		height: min(82vh, 820px);
		min-height: 610px;
		overflow: hidden;
		background: #171511;
		color: #f7ecd3;
		font-family: Georgia, serif;
	}

	.kagojer-shell.fullscreen {
		width: 100vw;
		height: 100dvh;
		min-height: 0;
	}

	.live-flight,
	.poster-layer,
	.poster-image,
	.poster-wash {
		position: absolute;
		inset: 0;
	}

	.live-flight.visually-paused {
		visibility: hidden;
	}

	.high-contrast :global(.game-surface canvas) {
		filter: contrast(1.24) brightness(1.08);
	}

	.high-contrast :global(.hazard-card) {
		border-left-width: 5px;
		background: rgb(8 8 7 / 0.9);
	}

	.poster-layer {
		z-index: 2;
		overflow: hidden;
	}

	.poster-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: saturate(0.88) contrast(1.08);
	}

	.poster-wash {
		background:
			linear-gradient(
				90deg,
				rgb(18 16 13 / 0.9) 0%,
				rgb(18 16 13 / 0.64) 42%,
				rgb(18 16 13 / 0.1) 76%
			),
			linear-gradient(0deg, rgb(18 16 13 / 0.46), transparent 45%);
	}

	.poster-wash::after {
		position: absolute;
		inset: 0;
		background-image: repeating-linear-gradient(
			8deg,
			transparent 0 8px,
			rgb(246 230 196 / 0.035) 9px 10px
		);
		content: '';
		mix-blend-mode: screen;
		pointer-events: none;
	}

	.opening-card {
		position: absolute;
		z-index: 3;
		top: 50%;
		left: clamp(22px, 6vw, 92px);
		width: min(610px, calc(100% - 44px));
		transform: translateY(-50%);
		text-shadow: 0 3px 18px #000;
	}

	.eyebrow {
		margin: 0 0 7px;
		color: #e2bd73;
		font:
			900 0.7rem/1.2 'Courier New',
			monospace;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.opening-card h1 {
		margin: 0;
		max-width: 11ch;
		font:
			900 clamp(3.2rem, 8.8vw, 7.4rem)/0.78 Georgia,
			serif;
		letter-spacing: -0.065em;
	}

	.bengali {
		margin: 14px 0 0;
		color: #f0d8a7;
		font:
			700 clamp(1.35rem, 3vw, 2.2rem)/1.1 'Noto Serif Bengali',
			Georgia,
			serif;
	}

	.opening-card blockquote {
		margin: 24px 0 22px;
		border-left: 2px solid #d7ad60;
		padding-left: 14px;
		font-size: clamp(1.05rem, 2vw, 1.35rem);
		font-style: italic;
		text-wrap: balance;
	}

	.opening-actions,
	.pause-card > div {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.opening-actions button,
	.free-flight-link,
	.pause-card button,
	.portrait-fallback button,
	.resume-landscape-card button {
		min-height: 46px;
		border: 1px solid rgb(240 218 178 / 0.56);
		border-radius: 999px;
		background: rgb(20 18 15 / 0.56);
		box-shadow: 0 8px 28px rgb(0 0 0 / 0.32);
		color: #f5e6c9;
		font:
			800 0.72rem/1 'Courier New',
			monospace;
		padding: 0 17px;
		backdrop-filter: blur(6px);
	}

	.opening-actions button.primary,
	.pause-card button.primary,
	.resume-landscape-card button {
		border-color: #e6c479;
		background: #e6c479;
		color: #211b13;
	}

	button:focus-visible {
		outline: 3px solid #ffd76a;
		outline-offset: 3px;
	}

	.controls-note {
		width: min(540px, 100%);
		margin-top: 12px;
		border-left: 2px solid rgb(230 196 121 / 0.75);
		background: rgb(20 18 15 / 0.6);
		padding: 9px 12px;
		font:
			0.75rem/1.45 'Courier New',
			monospace;
	}

	.controls-note p {
		margin: 2px 0;
	}

	.free-flight-link {
		margin-top: 14px;
		border: 0;
		box-shadow: none;
		background: transparent;
		padding-inline: 2px;
		text-decoration: underline;
		text-underline-offset: 5px;
	}

	.seed-line {
		margin: 12px 0 0;
		color: #d4c09b;
		font:
			700 0.62rem/1.2 'Courier New',
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.error-message {
		width: fit-content;
		max-width: 520px;
		border: 1px solid #d99568;
		background: rgb(60 24 17 / 0.74);
		padding: 10px 12px;
		font:
			0.78rem/1.4 'Courier New',
			monospace;
	}

	.loading-card,
	.resume-landscape-card {
		position: absolute;
		z-index: 28;
		top: 50%;
		left: 50%;
		display: grid;
		gap: 8px;
		justify-items: center;
		width: min(430px, calc(100% - 40px));
		transform: translate(-50%, -50%);
		border: 1px solid rgb(240 218 178 / 0.42);
		border-radius: 14px;
		background: rgb(20 18 15 / 0.86);
		box-shadow: 0 24px 80px rgb(0 0 0 / 0.55);
		padding: 26px;
		text-align: center;
		backdrop-filter: blur(12px);
	}

	.loading-card strong {
		font-size: 1.1rem;
	}

	.loading-card small {
		color: #d3bc91;
		font:
			0.65rem 'Courier New',
			monospace;
	}

	.paper-plane {
		display: block;
		color: #f1dfbd;
		font-size: 2.7rem;
		transform: rotate(36deg);
		animation: paper-wait 1.8s ease-in-out infinite;
	}

	.calm-flight .paper-plane {
		animation: none;
	}

	@keyframes paper-wait {
		50% {
			transform: translateY(-6px) rotate(42deg);
		}
	}

	.pause-card {
		position: absolute;
		z-index: 30;
		top: 50%;
		left: 50%;
		width: min(600px, calc(100% - 34px));
		transform: translate(-50%, -50%);
		border: 1px solid rgb(240 218 178 / 0.42);
		border-radius: 16px;
		background: rgb(20 18 15 / 0.9);
		box-shadow: 0 28px 90px rgb(0 0 0 / 0.6);
		padding: clamp(22px, 5vw, 42px);
		backdrop-filter: blur(14px);
	}

	.assistance-offer {
		position: absolute;
		z-index: 26;
		right: max(14px, env(safe-area-inset-right));
		bottom: max(14px, env(safe-area-inset-bottom));
		width: min(390px, calc(100% - 28px));
		border: 1px solid rgb(240 218 178 / 0.5);
		border-radius: 14px;
		background: rgb(20 18 15 / 0.9);
		box-shadow: 0 18px 54px rgb(0 0 0 / 0.5);
		padding: 14px;
		font:
			0.76rem/1.45 'Courier New',
			monospace;
		backdrop-filter: blur(10px);
	}

	.assistance-offer p {
		margin: 0 0 10px;
	}

	.assistance-offer div {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}

	.assistance-offer button {
		min-height: 44px;
		border: 1px solid rgb(240 218 178 / 0.45);
		border-radius: 999px;
		background: #e6c479;
		color: #211b13;
		font: inherit;
		font-weight: 900;
		padding: 0 13px;
	}

	.assistance-offer button + button {
		background: transparent;
		color: #f5e6c9;
	}

	.pause-card h2 {
		margin: 0;
		font-size: clamp(2rem, 5vw, 3.8rem);
	}

	.pause-card p:not(.eyebrow) {
		font:
			0.78rem/1.5 'Courier New',
			monospace;
	}

	.portrait-fallback {
		position: absolute;
		z-index: 50;
		inset: 0;
		overflow: auto;
		background: #1b1813;
		color: #f7ecd3;
	}

	.portrait-fallback > img {
		display: block;
		width: 100%;
		height: 43%;
		object-fit: cover;
		filter: saturate(0.88) contrast(1.1) brightness(1.22);
	}

	.portrait-fallback > div {
		padding: 22px;
	}

	.portrait-fallback h2 {
		margin: 0;
		color: #fff5de;
		font-size: 2.5rem;
	}

	.portrait-fallback p:not(.eyebrow) {
		color: #f1e4ca;
		line-height: 1.48;
	}

	.portrait-fallback .scenic-description {
		color: #cfc0a4;
		font-size: 0.78rem;
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}

	@media (max-width: 760px) {
		.kagojer-shell {
			min-height: 560px;
		}
		.opening-card {
			left: 20px;
		}
	}

	@media (max-height: 520px) and (orientation: landscape) {
		.kagojer-shell {
			height: 100svh;
			min-height: 0;
		}
		.opening-card {
			top: 53%;
			left: 22px;
			width: min(570px, calc(100% - 44px));
		}
		.opening-card h1 {
			font-size: clamp(2.5rem, 10vh, 4.6rem);
		}
		.bengali,
		.opening-card blockquote {
			margin-top: 8px;
			margin-bottom: 9px;
		}
		.controls-note,
		.seed-line {
			display: none;
		}
	}
</style>
