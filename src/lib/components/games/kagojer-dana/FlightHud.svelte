<script lang="ts">
	import TouchFlightField from './TouchFlightField.svelte';
	import type { FlightHudSnapshot } from '$lib/games/kagojer-dana/runtime-types';

	let {
		hud,
		muted,
		captions,
		caption,
		showScore,
		debug,
		fullscreenSupported,
		isFullscreen,
		onpause,
		onmute,
		onfullscreen,
		onsettings,
		onvector
	}: {
		hud: FlightHudSnapshot;
		muted: boolean;
		captions: boolean;
		caption: string;
		showScore: boolean;
		debug: boolean;
		fullscreenSupported: boolean;
		isFullscreen: boolean;
		onpause(): void;
		onmute(): void;
		onfullscreen(): void;
		onsettings(): void;
		onvector(bank: number, pitch: number): void;
	} = $props();

	const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
</script>

<div class="hud" role="group" aria-label="Current flight status">
	<div class="telemetry" aria-live="off">
		<div class="district-card">
			<span>{hud.register}</span>
			<strong>{hud.district}</strong>
		</div>
		<dl>
			<div>
				<dt>Altitude</dt>
				<dd>{Math.round(hud.altitudeMetres)} m</dd>
			</div>
			<div>
				<dt>Airspeed</dt>
				<dd>{hud.airspeedMps.toFixed(1)} m/s</dd>
			</div>
			<div>
				<dt>Climb</dt>
				<dd>{signed(hud.verticalSpeedMps)} m/s</dd>
			</div>
		</dl>
		<div class="wind-card"><span>Wind</span><strong>{hud.windLabel}</strong></div>
		<div class:warning={hud.hazard !== 'Clear flight corridor'} class="hazard-card">
			<span>Immediate air</span><strong>{hud.hazard}</strong>
		</div>
		{#if showScore}<p class="score">{hud.score.toLocaleString('en-IN')}</p>{/if}
	</div>

	<div class="utility-buttons" role="group" aria-label="Flight controls">
		<button type="button" onclick={onpause}>Pause</button>
		<button type="button" onclick={onmute} aria-label="Sound" aria-pressed={!muted}
			><span aria-hidden="true">{muted ? 'Sound off' : 'Sound on'}</span></button
		>
		{#if fullscreenSupported}
			<button type="button" onclick={onfullscreen}
				>{isFullscreen ? 'Exit full screen' : 'Full screen'}</button
			>
		{/if}
		<button type="button" onclick={onsettings}>Settings</button>
	</div>

	{#if hud.tutorialCue}
		<p class="tutorial-cue">{hud.tutorialCue}</p>
	{/if}
	{#if hud.flightPhrase}
		<p class="flight-phrase">{hud.flightPhrase}</p>
	{/if}
	{#if hud.marginalNote}
		<p class="marginal-note">{hud.marginalNote}</p>
	{/if}
	{#if captions && caption}
		<p class="sound-caption">{caption}</p>
	{/if}

	<div class="touch-field"><TouchFlightField {onvector} /></div>

	{#if debug}
		<dl class="debug-panel" aria-label="Development flight diagnostics">
			<div>
				<dt>FPS</dt>
				<dd>{hud.fps.toFixed(0)}</dd>
			</div>
			<div>
				<dt>Seed</dt>
				<dd>{hud.seed}</dd>
			</div>
			<div>
				<dt>Quality</dt>
				<dd>{hud.quality}</dd>
			</div>
			<div>
				<dt>Chunks</dt>
				<dd>{hud.chunkCount}</dd>
			</div>
			<div>
				<dt>Draw calls</dt>
				<dd>{hud.drawCalls}</dd>
			</div>
			<div>
				<dt>Triangles</dt>
				<dd>{hud.triangleCount.toLocaleString('en')}</dd>
			</div>
			<div>
				<dt>Voices</dt>
				<dd>{hud.activeSoundVoices}</dd>
			</div>
			<div>
				<dt>Sim time</dt>
				<dd>{hud.simulationTime.toFixed(1)} s</dd>
			</div>
		</dl>
	{/if}
</div>

<style>
	.hud {
		position: absolute;
		z-index: 12;
		inset: 0;
		color: #f8eed8;
		font-family: 'Courier New', monospace;
		pointer-events: none;
	}

	.telemetry {
		position: absolute;
		top: max(14px, env(safe-area-inset-top));
		left: max(14px, env(safe-area-inset-left));
		display: grid;
		gap: 7px;
		width: min(410px, calc(100% - 170px));
		text-shadow: 0 2px 6px #000;
	}

	.district-card,
	.wind-card,
	.hazard-card,
	.telemetry dl {
		width: fit-content;
		max-width: 100%;
		border-left: 3px solid rgb(236 198 115 / 0.8);
		background: linear-gradient(90deg, rgb(20 18 15 / 0.76), rgb(20 18 15 / 0));
		padding: 5px 18px 5px 9px;
	}

	.district-card span,
	.wind-card span,
	.hazard-card span {
		display: block;
		color: #d9bd82;
		font-size: 0.58rem;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.district-card strong {
		display: block;
		margin-top: 2px;
		font-family: Georgia, serif;
		font-size: clamp(0.95rem, 1.7vw, 1.3rem);
		line-height: 1.08;
	}

	.wind-card strong,
	.hazard-card strong {
		display: block;
		font-size: 0.72rem;
		line-height: 1.3;
	}

	.hazard-card.warning {
		border-left-color: #ffb24f;
		color: #fff2c5;
	}

	.telemetry dl {
		display: flex;
		gap: 14px;
		margin: 0;
		font-size: 0.66rem;
	}

	.telemetry dl div {
		display: grid;
		gap: 1px;
	}

	.telemetry dt {
		color: #d6c4a3;
		text-transform: uppercase;
	}

	.telemetry dd {
		margin: 0;
		font-weight: 900;
	}

	.score {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 900;
	}

	.utility-buttons {
		position: absolute;
		top: max(12px, env(safe-area-inset-top));
		right: max(12px, env(safe-area-inset-right));
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
		max-width: min(360px, 50%);
		pointer-events: auto;
	}

	.utility-buttons button {
		min-width: 44px;
		min-height: 44px;
		border: 1px solid rgb(244 225 187 / 0.55);
		border-radius: 999px;
		background: rgb(22 20 17 / 0.68);
		box-shadow: 0 5px 18px rgb(0 0 0 / 0.3);
		color: #f4e1bb;
		font: inherit;
		font-size: 0.64rem;
		font-weight: 900;
		padding: 0 12px;
		backdrop-filter: blur(5px);
	}

	.utility-buttons button:focus-visible {
		outline: 3px solid #ffd76a;
		outline-offset: 2px;
	}

	.tutorial-cue,
	.flight-phrase,
	.marginal-note,
	.sound-caption {
		position: absolute;
		left: 50%;
		max-width: min(640px, calc(100% - 32px));
		transform: translateX(-50%);
		margin: 0;
		border-radius: 999px;
		background: rgb(22 20 17 / 0.78);
		box-shadow: 0 8px 34px rgb(0 0 0 / 0.32);
		color: #f8eed8;
		text-align: center;
		text-wrap: balance;
		backdrop-filter: blur(6px);
	}

	.tutorial-cue {
		bottom: 18%;
		padding: 9px 16px;
		font-size: 0.78rem;
	}

	.flight-phrase {
		top: 14px;
		left: 50%;
		border: 1px solid rgb(244 225 187 / 0.25);
		background: rgb(22 20 17 / 0.58);
		color: #e8c882;
		padding: 6px 12px;
		font-size: 0.66rem;
		font-weight: 900;
		letter-spacing: 0.04em;
	}

	.marginal-note {
		top: 24%;
		border: 1px solid rgb(244 225 187 / 0.35);
		padding: 8px 14px;
		font-family: Georgia, serif;
		font-style: italic;
	}

	.sound-caption {
		bottom: max(12px, env(safe-area-inset-bottom));
		padding: 7px 14px;
		font-size: 0.7rem;
	}

	.touch-field {
		position: absolute;
		right: max(14px, env(safe-area-inset-right));
		bottom: max(14px, env(safe-area-inset-bottom));
		display: none;
		pointer-events: auto;
	}

	.debug-panel {
		position: absolute;
		right: max(12px, env(safe-area-inset-right));
		bottom: max(12px, env(safe-area-inset-bottom));
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 3px 12px;
		margin: 0;
		border: 1px solid rgb(255 255 255 / 0.25);
		border-radius: 8px;
		background: rgb(0 0 0 / 0.74);
		padding: 9px;
		font-size: 0.6rem;
	}

	.debug-panel div {
		display: contents;
	}

	.debug-panel dt {
		color: #c9b27f;
	}

	.debug-panel dd {
		margin: 0;
		text-align: right;
	}

	@media (pointer: coarse), (max-width: 900px) {
		.touch-field {
			display: block;
		}
		.debug-panel {
			right: auto;
			left: 12px;
		}
	}

	@media (max-width: 720px), (max-height: 520px) {
		.telemetry {
			top: 9px;
			left: 9px;
			width: min(56%, 350px);
			gap: 4px;
		}
		.telemetry dl {
			gap: 8px;
			padding-block: 3px;
		}
		.wind-card,
		.hazard-card {
			max-width: min(100%, 320px);
			padding-block: 3px;
		}
		.utility-buttons {
			top: 8px;
			right: 8px;
			max-width: 43%;
		}
		.utility-buttons button {
			padding: 0 9px;
			font-size: 0.57rem;
		}
		.tutorial-cue {
			bottom: 8px;
			left: 10px;
			max-width: calc(100% - min(46vw, 205px) - 30px);
			transform: none;
			font-size: 0.66rem;
		}
		.flight-phrase {
			display: none;
		}
		.sound-caption {
			bottom: 52px;
			left: 10px;
			max-width: 46%;
			transform: none;
		}
	}
</style>
