<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		KagojerDanaSettings,
		QualityMode,
		WindMode
	} from '$lib/games/kagojer-dana/settings';

	let {
		settings,
		onupdate,
		onclose
	}: {
		settings: KagojerDanaSettings;
		onupdate(next: KagojerDanaSettings): void;
		onclose(): void;
	} = $props();
	let closeButton: HTMLButtonElement;

	onMount(() => closeButton.focus({ preventScroll: true }));

	function update<K extends keyof KagojerDanaSettings>(key: K, value: KagojerDanaSettings[K]) {
		onupdate({ ...settings, [key]: value });
	}
</script>

<div class="settings-panel" role="dialog" aria-modal="false" aria-labelledby="kd-settings-title">
	<div class="settings-heading">
		<div>
			<p>Flight folio · controls</p>
			<h2 id="kd-settings-title">Wind and comfort</h2>
		</div>
		<button
			bind:this={closeButton}
			type="button"
			class="close-button"
			onclick={onclose}
			aria-label="Close settings">×</button
		>
	</div>

	<label>
		<span>Wind character</span>
		<select
			value={settings.windMode}
			onchange={(event) => update('windMode', event.currentTarget.value as WindMode)}
		>
			<option value="gentle">Gentle Wind — more assistance, calmer gusts</option>
			<option value="calcutta">Calcutta Wind — intended flight</option>
			<option value="kalbaishakhi">Kalbaishakhi — turbulence, sink and crosswind</option>
		</select>
	</label>

	<label>
		<span>Drawing quality</span>
		<select
			value={settings.quality}
			onchange={(event) => update('quality', event.currentTarget.value as QualityMode)}
		>
			<option value="auto">Auto</option>
			<option value="high">High</option>
			<option value="balanced">Balanced</option>
			<option value="battery">Battery</option>
		</select>
	</label>

	<label>
		<span>Control sensitivity: {settings.sensitivity.toFixed(2)}×</span>
		<input
			type="range"
			min="0.55"
			max="1.6"
			step="0.05"
			value={settings.sensitivity}
			oninput={(event) => update('sensitivity', Number(event.currentTarget.value))}
		/>
	</label>

	<div class="check-grid">
		<label class="check-row">
			<input
				type="checkbox"
				checked={settings.calmFlight}
				onchange={(event) => update('calmFlight', event.currentTarget.checked)}
			/>
			<span><strong>Calm Flight</strong><small>Gentler angular motion and gusts</small></span>
		</label>
		<label class="check-row">
			<input
				type="checkbox"
				checked={settings.calmCamera}
				onchange={(event) => update('calmCamera', event.currentTarget.checked)}
			/>
			<span
				><strong>Calm Camera</strong><small>Stable horizon, no tremor or FOV pumping</small></span
			>
		</label>
		<label class="check-row">
			<input
				type="checkbox"
				checked={settings.strongWindMarks}
				onchange={(event) => update('strongWindMarks', event.currentTarget.checked)}
			/>
			<span
				><strong>Stronger wind marks</strong><small>Clearer cloth, smoke and debris cues</small
				></span
			>
		</label>
		<label class="check-row">
			<input
				type="checkbox"
				checked={settings.highContrastCorridor}
				onchange={(event) => update('highContrastCorridor', event.currentTarget.checked)}
			/>
			<span
				><strong>High-contrast corridor</strong><small>Darker obstacles, lighter safe air</small
				></span
			>
		</label>
		<label class="check-row">
			<input
				type="checkbox"
				checked={settings.soundCaptions}
				onchange={(event) => update('soundCaptions', event.currentTarget.checked)}
			/>
			<span
				><strong>Sound captions</strong><small>Direction and distance for important sounds</small
				></span
			>
		</label>
		<label class="check-row">
			<input
				type="checkbox"
				checked={settings.invertPitch}
				onchange={(event) => update('invertPitch', event.currentTarget.checked)}
			/>
			<span><strong>Invert pitch</strong><small>Flight-simulator vertical control</small></span>
		</label>
		<label class="check-row">
			<input
				type="checkbox"
				checked={settings.showScore}
				onchange={(event) => update('showScore', event.currentTarget.checked)}
			/>
			<span
				><strong>Numeric score</strong><small>Poetic flight notes stay visible either way</small
				></span
			>
		</label>
	</div>

	<button type="button" class="done-button" onclick={onclose}>Return to the flight</button>
</div>

<style>
	.settings-panel {
		position: absolute;
		z-index: 40;
		top: max(18px, env(safe-area-inset-top));
		right: max(18px, env(safe-area-inset-right));
		bottom: max(18px, env(safe-area-inset-bottom));
		width: min(440px, calc(100% - 36px));
		overflow: auto;
		border: 1px solid rgb(240 217 175 / 0.45);
		border-radius: 18px;
		background: rgb(25 23 20 / 0.96);
		box-shadow: 0 24px 80px rgb(0 0 0 / 0.62);
		color: #f4e5c8;
		padding: 22px;
		backdrop-filter: blur(16px);
	}

	.settings-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 18px;
	}

	.settings-heading p {
		margin: 0 0 4px;
		color: #d0a85d;
		font-size: 0.67rem;
		font-weight: 900;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.settings-heading h2 {
		margin: 0;
		font-family: Georgia, serif;
		font-size: 1.55rem;
	}

	.close-button,
	.done-button {
		min-width: 44px;
		min-height: 44px;
		border: 1px solid rgb(240 217 175 / 0.35);
		border-radius: 999px;
		background: rgb(255 255 255 / 0.06);
		color: inherit;
		font: inherit;
		font-weight: 800;
	}

	.close-button {
		font-size: 1.5rem;
	}

	.settings-panel > label {
		display: grid;
		gap: 7px;
		margin-top: 15px;
		font-size: 0.78rem;
		font-weight: 800;
	}

	select,
	input[type='range'] {
		width: 100%;
		min-height: 44px;
		border: 1px solid rgb(240 217 175 / 0.28);
		border-radius: 9px;
		background: #35312b;
		color: #fff8e9;
		padding: 0 10px;
	}

	.check-grid {
		display: grid;
		gap: 8px;
		margin-top: 18px;
	}

	.check-row {
		display: grid;
		grid-template-columns: 24px 1fr;
		gap: 11px;
		align-items: start;
		padding: 9px;
		border-radius: 9px;
		background: rgb(255 255 255 / 0.035);
	}

	.check-row input {
		width: 20px;
		height: 20px;
		margin-top: 2px;
		accent-color: #e3b85f;
	}

	.check-row span {
		display: grid;
		gap: 2px;
		font-size: 0.82rem;
	}

	.check-row small {
		color: #bcad95;
		font-weight: 400;
		line-height: 1.35;
	}

	.done-button {
		width: 100%;
		margin-top: 18px;
		background: #e6c276;
		color: #201a13;
	}

	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 3px solid #ffd76a;
		outline-offset: 2px;
	}
</style>
