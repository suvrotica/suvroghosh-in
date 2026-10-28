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
				<dd>{Math.round(hud.altitudeMetres)} <span>m</span></dd>
			</div>
			<div>
				<dt>Airspeed</dt>
				<dd>{hud.airspeedMps.toFixed(1)} <span>m/s</span></dd>
			</div>
			<div>
				<dt>Climb</dt>
				<dd>{signed(hud.verticalSpeedMps)} <span>m/s</span></dd>
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
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}

	.telemetry {
		position: absolute;
		top: max(14px, env(safe-area-inset-top));
		left: max(14px, env(safe-area-inset-left));
		display: grid;
		gap: 0;
		width: min(330px, calc(100% - 170px));
		border-left: 2px solid #d8c49b;
		background: linear-gradient(90deg, rgb(22 23 21 / 0.9), rgb(22 23 21 / 0.74));
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
		padding: 10px 12px;
	}

	.district-card,
	.wind-card,
	.hazard-card,
	.telemetry dl {
		width: 100%;
		max-width: 100%;
		padding: 6px 0;
	}

	.district-card span,
	.wind-card span,
	.hazard-card span {
		display: block;
		color: #d9c9a9;
		font-size: 0.6rem;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.district-card strong {
		display: block;
		margin-top: 2px;
		color: #fff4df;
		font-family: Georgia, serif;
		font-size: clamp(1.05rem, 1.7vw, 1.4rem);
		line-height: 1.15;
	}

	.wind-card strong,
	.hazard-card strong {
		display: block;
		font-size: 0.72rem;
		line-height: 1.3;
	}

	.wind-card,
	.hazard-card {
		display: grid;
		grid-template-columns: 76px minmax(0, 1fr);
		align-items: baseline;
		gap: 8px;
		border-top: 1px solid rgb(244 225 187 / 0.13);
	}

	.hazard-card span {
		letter-spacing: 0.04em;
	}

	.hazard-card.warning {
		border-left: 3px solid #ffcb80;
		background: rgb(137 82 23 / 0.25);
		padding-left: 7px;
		color: #fff2c5;
	}

	.telemetry dl {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		margin: 0;
		padding-block: 9px 11px;
		font-size: 0.66rem;
	}

	.telemetry dl div {
		display: grid;
		gap: 1px;
	}

	.telemetry dt {
		color: #cfc3ab;
		font-size: 0.59rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.telemetry dd {
		margin: 0;
		color: #fff3d8;
		font-weight: 900;
		font-size: 0.93rem;
		white-space: nowrap;
	}

	.telemetry dd span {
		font-size: 0.6rem;
		font-weight: 400;
		color: #d4c8b0;
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
		border-radius: 4px;
		background: rgb(22 23 21 / 0.86);
		box-shadow: 0 3px 12px rgb(0 0 0 / 0.15);
		color: #f4e1bb;
		font: inherit;
		font-size: 0.64rem;
		font-weight: 900;
		padding: 0 12px;
		backdrop-filter: blur(5px);
	}

	.utility-buttons button[aria-pressed='true'] {
		border-color: #f4e1bb;
		background: #e6d6b7;
		color: #24241e;
	}

	@media (hover: hover) {
		.utility-buttons button:hover {
			background: #e6d6b7;
			color: #24241e;
		}
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
		border-radius: 4px;
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
		bottom: 9%;
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
		top: 14px;
		max-width: min(340px, 26%);
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
			width: min(45%, 280px);
			gap: 0;
			padding: 5px 9px;
		}
		.telemetry dl {
			gap: 8px;
			padding-block: 3px;
		}
		.telemetry dd {
			font-size: 0.78rem;
		}
		.district-card {
			padding-block: 2px 5px;
		}
		.wind-card,
		.hazard-card {
			grid-template-columns: 60px minmax(0, 1fr);
			padding-block: 3px;
		}
		.wind-card span,
		.hazard-card span {
			font-size: 0.53rem;
		}
		.wind-card strong,
		.hazard-card strong {
			font-size: 0.62rem;
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
		.marginal-note {
			top: auto;
			bottom: 94px;
			left: 10px;
			max-width: calc(100% - min(46vw, 205px) - 30px);
			transform: none;
			font-size: 0.75rem;
		}
		.sound-caption {
			bottom: 52px;
			left: 10px;
			max-width: 46%;
			transform: none;
		}
	}
</style>
