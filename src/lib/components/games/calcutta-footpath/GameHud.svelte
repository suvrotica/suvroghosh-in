<script lang="ts">
	import type { HudSnapshot } from '$lib/games/calcutta-footpath/runtime-types';

	type Props = {
		hud: HudSnapshot;
		soundEnabled: boolean;
		audioNeedsGesture: boolean;
		fullscreenSupported: boolean;
		isFullscreen: boolean;
		localNotice: string;
		mapOpen: boolean;
		onpause: () => void;
		onmute: () => void;
		onaudioretry: () => void;
		onfullscreen: () => void;
		onmap: () => void;
		oninteract: () => void;
		onstop: () => void;
		onturnaround: () => void;
	};

	let {
		hud,
		soundEnabled,
		audioNeedsGesture,
		fullscreenSupported,
		isFullscreen,
		localNotice,
		mapOpen,
		onpause,
		onmute,
		onaudioretry,
		onfullscreen,
		onmap,
		oninteract,
		onstop,
		onturnaround
	}: Props = $props();

	const stamina = $derived(Math.round(Math.max(0, Math.min(100, hud.stamina))));
	const morale = $derived(Math.round(Math.max(0, Math.min(100, hud.morale))));
	const destination = $derived(
		Math.max(0, Math.round(hud.destinationMetres ?? Math.max(0, 180 - hud.distanceMetres)))
	);
</script>

<div
	class:high-contrast={hud.highContrastWarnings}
	class="game-hud"
	aria-label="Current walk status"
>
	<section class="destination-card" aria-label="Journey">
		<span>Destination</span>
		<strong>{destination} m</strong>
		<small>{hud.streetName ?? hud.zone}</small>
	</section>

	<nav class="hud-actions" aria-label="Walk controls">
		<button type="button" onclick={onmap} aria-expanded={mapOpen}>Map</button>
		<button type="button" onclick={onmute} aria-pressed={soundEnabled}>
			Sound {soundEnabled ? 'on' : 'off'}
		</button>
		<button type="button" class="pause" onclick={onpause}>Pause</button>
	</nav>

	{#if stamina < 92 || morale < 34}
		<section class="vitals" aria-label="Walking condition">
			{#if stamina < 92}
				<label>
					<span>Stamina <strong>{stamina}%</strong></span>
					<progress max="100" value={stamina}>{stamina}%</progress>
				</label>
			{/if}
			{#if morale < 34}
				<p class="morale">Morale is low — {morale}%</p>
			{/if}
		</section>
	{/if}

	<div class="announcements">
		{#if soundEnabled && audioNeedsGesture}
			<button class="banner audio-retry" type="button" onclick={onaudioretry}>
				Tap to hear the street
			</button>
		{/if}
		{#if hud.tutorialCue}
			<p class="banner tutorial" role="status" aria-live="polite" aria-atomic="true">
				{hud.tutorialCue}
			</p>
		{/if}
		{#if hud.visualCue || hud.warning}
			<p class="banner warning" role="alert" aria-atomic="true">
				<span aria-hidden="true">!</span>
				{hud.visualCue || hud.warning}
			</p>
		{/if}
		{#if hud.reaction}
			<p class="banner reaction" role="status" aria-live="polite" aria-atomic="true">
				{hud.reaction}
			</p>
		{/if}
		{#if hud.foodEffect}
			<p class="banner food" role="status" aria-live="polite" aria-atomic="true">
				{hud.foodEffect}
			</p>
		{/if}
		{#if localNotice}
			<p class="banner notice" role="status" aria-live="polite" aria-atomic="true">
				{localNotice}
			</p>
		{/if}
	</div>

	{#if hud.interactionPrompt}
		<div class="interaction">
			<button type="button" onclick={oninteract}>{hud.interactionPrompt}</button>
			<small>or press Enter</small>
		</div>
	{/if}

	<div class="quick-walk-actions" aria-label="Immediate walking actions">
		{#if hud.walkingAutomatically}
			<button type="button" onclick={onstop}>Stop walking</button>
		{/if}
		<button type="button" onclick={onturnaround}>Turn around</button>
	</div>

	{#if fullscreenSupported && isFullscreen}
		<button class="exit-fullscreen" type="button" onclick={onfullscreen}>Exit full screen</button>
	{/if}
</div>

<style>
	.game-hud {
		--safe-top: max(0.65rem, env(safe-area-inset-top));
		--safe-right: max(0.65rem, env(safe-area-inset-right));
		--safe-left: max(0.65rem, env(safe-area-inset-left));
		position: absolute;
		z-index: 20;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		color: #fff8e7;
		font-family: var(--font-sans, system-ui, sans-serif);
		font-variant-numeric: tabular-nums;
	}

	.destination-card,
	.hud-actions,
	.vitals,
	.interaction,
	.quick-walk-actions,
	.exit-fullscreen {
		pointer-events: auto;
	}

	.destination-card {
		position: absolute;
		top: var(--safe-top);
		left: var(--safe-left);
		display: grid;
		min-width: 8.5rem;
		gap: 0.06rem;
		border: 1px solid rgb(255 239 207 / 25%);
		border-radius: 0.55rem;
		background: rgb(18 17 15 / 72%);
		padding: 0.55rem 0.7rem;
		box-shadow: 0 0.35rem 1.2rem rgb(0 0 0 / 25%);
		backdrop-filter: blur(7px);
	}

	.destination-card span {
		color: #d8cbb5;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.destination-card strong {
		font-size: 1.1rem;
		line-height: 1.1;
	}

	.destination-card small {
		max-width: 12rem;
		margin-top: 0.12rem;
		color: #e7d9c0;
		font-size: 0.68rem;
	}

	.hud-actions {
		position: absolute;
		top: var(--safe-top);
		right: var(--safe-right);
		display: flex;
		gap: 0.35rem;
	}

	button {
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 1px solid rgb(255 239 207 / 32%);
		border-radius: 0.5rem;
		background: rgb(18 17 15 / 76%);
		padding: 0.48rem 0.68rem;
		color: #fff8ea;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 820;
		cursor: pointer;
		backdrop-filter: blur(7px);
	}

	button:hover,
	button:focus-visible {
		border-color: #f2cc73;
		background: rgb(47 40 32 / 90%);
	}

	button:focus-visible {
		outline: 3px solid #f2cc73;
		outline-offset: 2px;
	}

	.hud-actions .pause {
		background: rgb(244 222 171 / 90%);
		color: #251d16;
	}

	.vitals {
		position: absolute;
		top: calc(var(--safe-top) + 5.25rem);
		left: var(--safe-left);
		width: min(11rem, 42vw);
		border-radius: 0.45rem;
		background: rgb(18 17 15 / 65%);
		padding: 0.45rem 0.6rem;
		backdrop-filter: blur(6px);
	}

	.vitals label,
	.vitals label span {
		display: grid;
		gap: 0.2rem;
	}

	.vitals label span {
		grid-template-columns: 1fr auto;
		font-size: 0.68rem;
	}

	progress {
		width: 100%;
		height: 0.4rem;
		accent-color: #e5b85c;
	}

	.morale {
		margin: 0.35rem 0 0;
		color: #ffd6c7;
		font-size: 0.68rem;
	}

	.announcements {
		position: absolute;
		top: max(5.2rem, 13vh);
		left: 50%;
		display: grid;
		width: min(34rem, calc(100% - 2rem));
		transform: translateX(-50%);
		justify-items: center;
		gap: 0.42rem;
	}

	.banner {
		margin: 0;
		border: 1px solid rgb(255 239 207 / 35%);
		border-radius: 999px;
		background: rgb(18 17 15 / 82%);
		padding: 0.46rem 0.78rem;
		color: #fff8e8;
		font-size: clamp(0.72rem, 1.7vw, 0.84rem);
		font-weight: 760;
		line-height: 1.3;
		text-align: center;
		box-shadow: 0 0.35rem 1.3rem rgb(0 0 0 / 24%);
		backdrop-filter: blur(7px);
	}

	.banner.warning {
		border-color: #ffe59f;
		background: rgb(68 42 24 / 91%);
	}

	.audio-retry {
		border-color: #f3d57f;
		background: #f0cc75;
		color: #281e15;
		pointer-events: auto;
	}

	.high-contrast .banner.warning {
		border: 3px solid #fff;
		background: #000;
		color: #fff;
	}

	.banner.food {
		border-color: #d7d299;
	}
	.banner.reaction {
		font-style: italic;
	}

	.interaction {
		position: absolute;
		bottom: max(5.6rem, calc(env(safe-area-inset-bottom) + 5rem));
		left: 50%;
		display: grid;
		transform: translateX(-50%);
		justify-items: center;
		gap: 0.18rem;
	}

	.interaction button {
		min-height: 3rem;
		border-color: #f0d08a;
		background: rgb(241 213 153 / 94%);
		padding-inline: 1rem;
		color: #2b2017;
		font-size: 0.86rem;
	}

	.interaction small {
		color: #fff4db;
		font-size: 0.65rem;
		text-shadow: 0 1px 4px #000;
	}

	.quick-walk-actions {
		position: absolute;
		bottom: max(0.65rem, env(safe-area-inset-bottom));
		left: 50%;
		display: flex;
		transform: translateX(-50%);
		gap: 0.4rem;
	}

	.exit-fullscreen {
		position: absolute;
		right: var(--safe-right);
		bottom: max(0.65rem, env(safe-area-inset-bottom));
	}

	@media (max-width: 40rem) {
		.destination-card {
			min-width: 7.4rem;
		}
		.hud-actions {
			gap: 0.22rem;
		}
		.hud-actions button {
			padding-inline: 0.48rem;
			font-size: 0.67rem;
		}
		.exit-fullscreen {
			display: none;
		}
	}

	@media (hover: none), (pointer: coarse) {
		.quick-walk-actions {
			display: none;
		}
	}

	@media (max-height: 34rem) and (orientation: landscape) {
		.vitals {
			display: none;
		}
		.announcements {
			top: 3.7rem;
		}
	}
</style>
