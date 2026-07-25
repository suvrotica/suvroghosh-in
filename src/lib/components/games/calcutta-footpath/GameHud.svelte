<script lang="ts">
	import type { HudSnapshot } from '$lib/games/calcutta-footpath/runtime-types';

	type Props = {
		hud: HudSnapshot;
		soundEnabled: boolean;
		fullscreenSupported: boolean;
		isFullscreen: boolean;
		localNotice: string;
		onpause: () => void;
		onmute: () => void;
		onfullscreen: () => void;
	};

	let {
		hud,
		soundEnabled,
		fullscreenSupported,
		isFullscreen,
		localNotice,
		onpause,
		onmute,
		onfullscreen
	}: Props = $props();

	const numberFormatter = new Intl.NumberFormat('en-IN');

	const stamina = $derived(clampPercentage(hud.stamina));
	const morale = $derived(clampPercentage(hud.morale));
	const distance = $derived(clampPercentage(hud.distance * 100));
	const weather = $derived(
		hud.weather === 'post-rain' ? 'After rain' : hud.weather === 'rain' ? 'Rain' : 'Dry'
	);

	function clampPercentage(value: number): number {
		return Math.round(Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)));
	}
</script>

<div class="game-hud" aria-label="Current walk status">
	<section class="hud-stats" aria-label="Player status">
		<div class="vitals">
			<div class:critical={stamina <= 25} class="vital stamina">
				<div class="vital-heading">
					<span>Stamina</span>
					<strong>{stamina}%</strong>
				</div>
				<progress max="100" value={stamina} aria-label={`Stamina: ${stamina} percent`}>
					{stamina}%
				</progress>
			</div>

			<div class:critical={morale <= 25} class="vital morale">
				<div class="vital-heading">
					<span>Morale</span>
					<strong>{morale}%</strong>
				</div>
				<progress max="100" value={morale} aria-label={`Morale: ${morale} percent`}>
					{morale}%
				</progress>
			</div>
		</div>

		<dl class="journey">
			<div>
				<dt>Distance</dt>
				<dd>{numberFormatter.format(Math.max(0, hud.distanceMetres))} m · {distance}%</dd>
			</div>
			<div>
				<dt>Zone</dt>
				<dd>{hud.zone}</dd>
			</div>
			<div>
				<dt>Weather</dt>
				<dd>{weather}</dd>
			</div>
			<div>
				<dt>Score</dt>
				<dd>{numberFormatter.format(Math.max(0, Math.round(hud.score)))}</dd>
			</div>
		</dl>
	</section>

	<nav class="hud-actions" aria-label="Game controls">
		<button type="button" onclick={onpause} aria-label="Pause game" title="Pause game">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M7 5.5h3v13H7zM14 5.5h3v13h-3z"></path>
			</svg>
		</button>
		<button
			type="button"
			onclick={onmute}
			aria-label="Sound"
			aria-pressed={soundEnabled}
			title={soundEnabled ? 'Mute sound' : 'Turn sound on'}
		>
			{#if soundEnabled}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 9.5v5h4l5 4v-13l-5 4H4z"></path>
					<path
						d="M16 8.2c1 .9 1.5 2.2 1.5 3.8s-.5 2.9-1.5 3.8M18.6 5.7c1.7 1.7 2.6 3.8 2.6 6.3s-.9 4.6-2.6 6.3"
						class="stroke"
					></path>
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 9.5v5h4l5 4v-13l-5 4H4z"></path>
					<path d="m16 9 5 6m0-6-5 6" class="stroke"></path>
				</svg>
			{/if}
		</button>
		{#if fullscreenSupported}
			<button
				type="button"
				onclick={onfullscreen}
				aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
				aria-pressed={isFullscreen}
				title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
			>
				{#if isFullscreen}
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M9.5 4v5.5H4M14.5 4v5.5H20M9.5 20v-5.5H4M14.5 20v-5.5H20" class="stroke"
						></path>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" class="stroke"></path>
					</svg>
				{/if}
			</button>
		{/if}
	</nav>

	<div class="announcements">
		{#if hud.tutorialCue}
			<p class="banner tutorial" role="status" aria-live="polite" aria-atomic="true">
				<span aria-hidden="true">?</span>
				{hud.tutorialCue}
			</p>
		{/if}
		{#if hud.warning}
			<p class="banner warning" role="alert" aria-atomic="true">
				<span aria-hidden="true">!</span>
				{hud.warning}
			</p>
		{/if}
		{#if hud.reaction}
			<p class="banner reaction" role="status" aria-live="polite" aria-atomic="true">
				{hud.reaction}
			</p>
		{/if}
		{#if hud.foodEffect}
			<p class="banner food" role="status" aria-live="polite" aria-atomic="true">
				<span aria-hidden="true">+</span>
				{hud.foodEffect}
			</p>
		{/if}
		{#if localNotice}
			<p class="banner notice" role="status" aria-live="polite" aria-atomic="true">
				{localNotice}
			</p>
		{/if}
	</div>
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

	.hud-stats {
		position: absolute;
		top: var(--safe-top);
		left: var(--safe-left);
		width: min(
			36rem,
			calc(100% - 11.25rem - env(safe-area-inset-left) - env(safe-area-inset-right))
		);
		padding: 0.65rem 0.75rem;
		border: 1px solid rgb(255 233 185 / 42%);
		border-radius: 0.65rem;
		background: rgb(23 17 13 / 88%);
		box-shadow: 0 0.4rem 1.4rem rgb(0 0 0 / 34%);
		backdrop-filter: blur(8px);
	}

	.vitals {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.vital-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
		color: #f8e7c2;
		font-size: 0.68rem;
		font-weight: 850;
		letter-spacing: 0.09em;
		line-height: 1;
		text-transform: uppercase;
	}

	.vital-heading strong {
		color: #fffdf6;
		font-size: 0.78rem;
		letter-spacing: 0;
	}

	progress {
		display: block;
		width: 100%;
		height: 0.55rem;
		overflow: hidden;
		border: 1px solid rgb(255 255 255 / 24%);
		border-radius: 999px;
		appearance: none;
		background: #191410;
	}

	progress::-webkit-progress-bar {
		background: #191410;
	}

	progress::-webkit-progress-value {
		border-radius: inherit;
		background: #f4c84d;
	}

	progress::-moz-progress-bar {
		border-radius: inherit;
		background: #f4c84d;
	}

	.morale progress::-webkit-progress-value {
		background: #73d3a3;
	}

	.morale progress::-moz-progress-bar {
		background: #73d3a3;
	}

	.critical progress::-webkit-progress-value {
		background: #ff6b57;
	}

	.critical progress::-moz-progress-bar {
		background: #ff6b57;
	}

	.journey {
		display: grid;
		grid-template-columns: 1.2fr 1.8fr 1fr 1fr;
		gap: 0.45rem 0.75rem;
		margin: 0.6rem 0 0;
		padding-top: 0.55rem;
		border-top: 1px solid rgb(255 244 218 / 18%);
	}

	.journey div {
		min-width: 0;
	}

	.journey dt {
		color: #e7c98e;
		font-size: 0.59rem;
		font-weight: 850;
		letter-spacing: 0.1em;
		line-height: 1;
		text-transform: uppercase;
	}

	.journey dd {
		margin: 0.18rem 0 0;
		overflow: hidden;
		color: #fffdf6;
		font-size: clamp(0.7rem, 1.6vw, 0.82rem);
		font-weight: 760;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hud-actions {
		position: absolute;
		top: var(--safe-top);
		right: var(--safe-right);
		display: flex;
		gap: 0.4rem;
		pointer-events: auto;
	}

	.hud-actions button {
		display: grid;
		width: 2.75rem;
		height: 2.75rem;
		flex: none;
		padding: 0;
		place-items: center;
		border: 1px solid rgb(255 235 193 / 48%);
		border-radius: 0.55rem;
		background: rgb(25 18 13 / 90%);
		box-shadow: 0 0.3rem 1rem rgb(0 0 0 / 30%);
		color: #fff8e7;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
		backdrop-filter: blur(8px);
	}

	.hud-actions button:hover {
		border-color: #ffd878;
		background: rgb(68 43 24 / 95%);
	}

	.hud-actions button:focus-visible {
		outline: 3px solid #fff2bd;
		outline-offset: 2px;
	}

	.hud-actions svg {
		width: 1.35rem;
		height: 1.35rem;
		fill: currentColor;
	}

	.hud-actions .stroke {
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 2;
	}

	.announcements {
		position: absolute;
		top: clamp(7.5rem, 20vh, 11rem);
		right: max(1rem, env(safe-area-inset-right));
		left: max(1rem, env(safe-area-inset-left));
		display: grid;
		justify-items: center;
		gap: 0.45rem;
	}

	.banner {
		max-width: min(40rem, 92vw);
		margin: 0;
		padding: 0.5rem 0.8rem;
		border: 1px solid rgb(255 255 255 / 38%);
		border-radius: 0.45rem;
		background: rgb(24 18 14 / 91%);
		box-shadow: 0 0.45rem 1.6rem rgb(0 0 0 / 40%);
		color: #fffdf5;
		font-size: clamp(0.78rem, 2.2vw, 1rem);
		font-weight: 800;
		line-height: 1.3;
		text-align: center;
		text-wrap: balance;
		backdrop-filter: blur(8px);
	}

	.banner span {
		display: inline-grid;
		min-width: 1.35rem;
		height: 1.35rem;
		margin-right: 0.3rem;
		place-items: center;
		border-radius: 50%;
		background: currentColor;
		color: #28120b;
		font-size: 0.8rem;
		line-height: 1;
	}

	.warning {
		border-color: #ffb39c;
		background: rgb(93 25 13 / 94%);
		color: #fff0e8;
	}

	.tutorial {
		border-color: #f0cd75;
		background: rgb(56 42 21 / 94%);
		color: #fff4ce;
	}

	.reaction {
		border-color: #f1d28e;
		background: rgb(48 34 20 / 92%);
		color: #fff3d6;
		font-style: italic;
	}

	.food {
		border-color: #8ee0a9;
		background: rgb(13 65 43 / 94%);
		color: #edfff2;
	}

	.notice {
		border-color: rgb(255 255 255 / 38%);
		background: rgb(25 24 23 / 88%);
		color: #fffdf5;
		font-weight: 650;
	}

	@media (max-width: 42rem) {
		.hud-stats {
			top: calc(var(--safe-top) + 3.2rem);
			right: var(--safe-right);
			width: auto;
			padding: 0.5rem 0.6rem;
		}

		.journey {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 0.35rem;
			margin-top: 0.45rem;
			padding-top: 0.45rem;
		}

		.journey dt {
			font-size: 0.53rem;
		}

		.journey dd {
			font-size: 0.68rem;
		}

		.announcements {
			top: clamp(8.8rem, 24vh, 10.5rem);
		}
	}

	@media (max-width: 25rem) {
		.hud-stats {
			padding-inline: 0.5rem;
		}

		.vitals {
			gap: 0.45rem;
		}

		.journey {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-height: 31rem) and (orientation: landscape) {
		.hud-stats {
			top: var(--safe-top);
			width: min(
				32rem,
				calc(100% - 10.5rem - env(safe-area-inset-left) - env(safe-area-inset-right))
			);
			padding: 0.42rem 0.55rem;
		}

		.journey {
			margin-top: 0.35rem;
			padding-top: 0.35rem;
		}

		.announcements {
			top: 5.6rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hud-actions button {
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.hud-stats,
		.hud-actions button,
		.banner {
			border: 2px solid CanvasText;
			background: Canvas;
			color: CanvasText;
			forced-color-adjust: none;
		}

		progress {
			border-color: CanvasText;
		}
	}
</style>
