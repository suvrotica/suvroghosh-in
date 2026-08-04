<script lang="ts">
	import { PLACEABLE_FEATURES, TERRAIN_PRESETS } from '$lib/visualizations/lightning-atlas/config';
	import type {
		AtlasMode,
		CameraPreset,
		FlashTypeChoice,
		LayerId,
		PlaceableFeatureKind,
		QualityChoice,
		SerializableAtlasState,
		StrikeScale,
		TerrainPresetId
	} from '$lib/visualizations/lightning-atlas/types';

	type ParameterSection = 'storm' | 'environment' | 'stormPosition' | 'observer';

	type Props = {
		state: SerializableAtlasState;
		playing: boolean;
		busy: boolean;
		hasFlash: boolean;
		soundEnabled: boolean;
		crossSectionOpen: boolean;
		soundVolume: number;
		compressedThunder: boolean;
		placementKind: PlaceableFeatureKind;
		placementRotation: number;
		placementX: number;
		placementZ: number;
		actionStatus: string;
		oncall?: () => void;
		onhero?: () => void;
		onfeatured?: () => void;
		onreplay?: () => void;
		onnewseed?: () => void;
		onplaytoggle?: () => void;
		onfollow?: () => void;
		onatlas?: () => void;
		onshare?: () => void;
		onsound?: () => void;
		oncrosssection?: () => void;
		onreset?: () => void;
		onmode?: (mode: AtlasMode) => void;
		onterrain?: (terrain: TerrainPresetId) => void;
		onflash?: (flash: FlashTypeChoice) => void;
		ondisplay?: (display: 'night' | 'field-map') => void;
		onquality?: (quality: QualityChoice) => void;
		oncamera?: (camera: CameraPreset) => void;
		onstrikescale?: (scale: StrikeScale) => void;
		onparameter?: (section: ParameterSection, key: string, value: number | boolean) => void;
		onlayer?: (layer: LayerId, visible: boolean) => void;
		onflashsafe?: (value: boolean) => void;
		onplacementkind?: (kind: PlaceableFeatureKind) => void;
		onplacementrotation?: (rotation: number) => void;
		onplacementcoordinate?: (axis: 'x' | 'z', value: number) => void;
		onplacekeyboard?: () => void;
		onremovefeature?: (id: string) => void;
		onclearfeatures?: () => void;
		onvolume?: (volume: number) => void;
		oncompressedthunder?: (compressed: boolean) => void;
	};

	let {
		state,
		playing,
		busy,
		hasFlash,
		soundEnabled,
		crossSectionOpen,
		soundVolume,
		compressedThunder,
		placementKind,
		placementRotation,
		placementX,
		placementZ,
		actionStatus,
		oncall,
		onhero,
		onfeatured,
		onreplay,
		onnewseed,
		onplaytoggle,
		onfollow,
		onatlas,
		onshare,
		onsound,
		oncrosssection,
		onreset,
		onmode,
		onterrain,
		onflash,
		ondisplay,
		onquality,
		oncamera,
		onstrikescale,
		onparameter,
		onlayer,
		onflashsafe,
		onplacementkind,
		onplacementrotation,
		onplacementcoordinate,
		onplacekeyboard,
		onremovefeature,
		onclearfeatures,
		onvolume,
		oncompressedthunder
	}: Props = $props();

	const modes: Array<{ id: AtlasMode; label: string }> = [
		{ id: 'live', label: 'Live Storm' },
		{ id: 'study', label: 'Terrain Study' },
		{ id: 'replay', label: 'Storm Replay' },
		{ id: 'cross-section', label: 'Cross-Section' }
	];

	const layers: Array<{ id: LayerId; label: string }> = [
		{ id: 'field', label: 'Field proxy' },
		{ id: 'charge', label: 'Charge regions' },
		{ id: 'branches', label: 'Discarded branches' },
		{ id: 'streamers', label: 'Upward streamers' },
		{ id: 'ground-current', label: 'Ground-current footprint' },
		{ id: 'contours', label: 'Terrain contours' }
	];

	const strikeScales: Array<{ id: StrikeScale; label: string }> = [
		{ id: 'compact', label: 'Compact' },
		{ id: 'standard', label: 'Standard' },
		{ id: 'large', label: 'Large' },
		{ id: 'heroic', label: 'Heroic' }
	];
</script>

<aside class="control-rail" aria-label="Lightning Atlas controls">
	<div class="mode-tabs" role="group" aria-label="Experience mode">
		{#each modes as mode (mode.id)}
			<button
				type="button"
				aria-pressed={state.mode === mode.id}
				class:active={state.mode === mode.id}
				onclick={() => onmode?.(mode.id)}
			>
				{mode.label}
			</button>
		{/each}
	</div>

	<section class="featured-storm" aria-labelledby="featured-storm-heading">
		<div>
			<span>Featured showpiece</span>
			<h3 id="featured-storm-heading">Kalbaisakhi / Bengal Nor'wester</h3>
			<p>
				Kalbaisakhi: a severe Bengal pre-monsoon storm mode tuned for broad, branching, sky-filling
				lightning.
			</p>
		</div>
		<button type="button" onclick={onfeatured} disabled={busy}>
			{state.terrain === 'kalbaisakhi-bengal' && state.strikeScale === 'heroic'
				? 'Reload featured storm'
				: 'Load featured storm'}
		</button>
	</section>

	<div class="primary-selects">
		<label>
			<span>Terrain</span>
			<select
				value={state.terrain}
				onchange={(event) => onterrain?.(event.currentTarget.value as TerrainPresetId)}
			>
				{#each TERRAIN_PRESETS as preset (preset.id)}
					<option value={preset.id}
						>{preset.name}{preset.featured ? ' · featured' : ''}{preset.experimental
							? ' · experimental'
							: ''}</option
					>
				{/each}
			</select>
		</label>
		<label>
			<span>Flash type</span>
			<select
				value={state.flashType}
				onchange={(event) => onflash?.(event.currentTarget.value as FlashTypeChoice)}
			>
				<option value="storm-decides">Storm decides</option>
				<option value="negative-cg">Negative cloud-to-ground</option>
				<option value="positive-cg">Positive cloud-to-ground</option>
				<option value="intra-cloud">Intra-cloud</option>
			</select>
		</label>
		<label>
			<span>Strike scale</span>
			<select
				value={state.strikeScale}
				aria-describedby="lightning-atlas-strike-scale-note"
				onchange={(event) => onstrikescale?.(event.currentTarget.value as StrikeScale)}
			>
				{#each strikeScales as scale (scale.id)}
					<option value={scale.id}>{scale.label}</option>
				{/each}
			</select>
			<small id="lightning-atlas-strike-scale-note"
				>Changes channel morphology and branch hierarchy, not just brightness.</small
			>
		</label>
		<label>
			<span>Camera</span>
			<select
				value={state.cameraPreset}
				onchange={(event) => oncamera?.(event.currentTarget.value as CameraPreset)}
			>
				<option value="hero">Hero Sky View</option>
				<option value="wide">Wide Storm</option>
				<option value="attachment">Attachment</option>
				<option value="follow">Follow Bolt</option>
				<option value="overview">Terrain overview</option>
				<option value="observer">Observer view</option>
			</select>
		</label>
	</div>

	<div class="primary-actions">
		<button class="strike" type="button" onclick={oncall} disabled={busy}>
			{busy ? 'Tracing leader…' : 'Call a strike'}
		</button>
		<div class="hero-action">
			<button
				class="hero-strike"
				type="button"
				onclick={onhero}
				disabled={busy}
				aria-describedby="lightning-atlas-hero-strike-tooltip"
				title="Generates a high-energy, highly branched strike within the current storm model."
			>
				{busy ? 'Tracing leader…' : 'Call a hero strike'}
			</button>
			<span id="lightning-atlas-hero-strike-tooltip" class="tooltip" role="tooltip">
				Generates a high-energy, highly branched strike within the current storm model.
			</span>
		</div>
		<button type="button" onclick={onplaytoggle} disabled={!hasFlash}
			>{playing ? 'Pause' : 'Play'}</button
		>
		<button type="button" onclick={onreplay} disabled={!hasFlash}>Replay last flash</button>
		<button type="button" onclick={onnewseed}>New storm</button>
	</div>

	<div class="secondary-actions">
		<button type="button" onclick={onfollow} disabled={!hasFlash}>Follow the bolt</button>
		<button
			id="lightning-atlas-cross-section-trigger"
			type="button"
			aria-expanded={crossSectionOpen}
			aria-controls="lightning-atlas-cross-section"
			onclick={oncrosssection}
		>
			{crossSectionOpen ? 'Close cross-section' : 'Open cross-section'}
		</button>
		<button type="button" onclick={onatlas}>Open Atlas</button>
		<button type="button" onclick={onshare}>Share this storm</button>
		<button type="button" onclick={onsound} aria-pressed={soundEnabled}
			>{soundEnabled ? 'Sound on' : 'Sound off'}</button
		>
	</div>

	<details class="advanced">
		<summary>Scene and model controls</summary>
		<div class="control-grid">
			<label>
				<span>Presentation</span>
				<select
					value={state.displayMode}
					onchange={(event) => ondisplay?.(event.currentTarget.value as 'night' | 'field-map')}
				>
					<option value="night">Night instrument</option>
					<option value="field-map">Field map</option>
				</select>
			</label>
			<label>
				<span>Quality</span>
				<select
					value={state.quality}
					onchange={(event) => onquality?.(event.currentTarget.value as QualityChoice)}
				>
					<option value="auto">Auto</option>
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
				</select>
			</label>
		</div>

		<fieldset>
			<legend>Atmospheric electricity</legend>
			<label class="range"
				><span>Relative charge <output>{state.storm.chargeStrength.toFixed(2)}</output></span><input
					type="range"
					min="0.2"
					max="1"
					step="0.01"
					value={state.storm.chargeStrength}
					oninput={(event) =>
						onparameter?.('storm', 'chargeStrength', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Charge separation <output>{state.storm.chargeSeparation.toFixed(2)}</output></span
				><input
					type="range"
					min="0.15"
					max="1"
					step="0.01"
					value={state.storm.chargeSeparation}
					oninput={(event) =>
						onparameter?.('storm', 'chargeSeparation', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Branching <output>{state.storm.branching.toFixed(2)}</output></span><input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.storm.branching}
					oninput={(event) =>
						onparameter?.('storm', 'branching', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Leader persistence <output>{state.storm.leaderPersistence.toFixed(2)}</output></span
				><input
					type="range"
					min="0.1"
					max="1"
					step="0.01"
					value={state.storm.leaderPersistence}
					oninput={(event) =>
						onparameter?.('storm', 'leaderPersistence', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span
					>Cloud base <output>{(state.storm.cloudBaseMetres / 1000).toFixed(2)} km</output></span
				><input
					type="range"
					min="450"
					max="4500"
					step="10"
					value={state.storm.cloudBaseMetres}
					oninput={(event) =>
						onparameter?.('storm', 'cloudBaseMetres', Number(event.currentTarget.value))}
				/></label
			>
			<label class="check"
				><input
					type="checkbox"
					checked={state.storm.lowerPositiveCharge}
					onchange={(event) =>
						onparameter?.('storm', 'lowerPositiveCharge', event.currentTarget.checked)}
				/> Lower positive screening region</label
			>
		</fieldset>

		<fieldset>
			<legend>Storm, ground and observer</legend>
			<label class="range"
				><span>Storm east–west <output>{Math.round(state.stormPosition.x * 100)}%</output></span
				><input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.stormPosition.x}
					oninput={(event) =>
						onparameter?.('stormPosition', 'x', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Storm north–south <output>{Math.round(state.stormPosition.z * 100)}%</output></span
				><input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.stormPosition.z}
					oninput={(event) =>
						onparameter?.('stormPosition', 'z', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Surface wetness <output>{state.environment.surfaceWetness.toFixed(2)}</output></span
				><input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.environment.surfaceWetness}
					oninput={(event) =>
						onparameter?.('environment', 'surfaceWetness', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span
					>Conductivity proxy <output>{state.environment.conductivityProxy.toFixed(2)}</output
					></span
				><input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.environment.conductivityProxy}
					oninput={(event) =>
						onparameter?.('environment', 'conductivityProxy', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Rain intensity <output>{state.environment.rainIntensity.toFixed(2)}</output></span
				><input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.environment.rainIntensity}
					oninput={(event) =>
						onparameter?.('environment', 'rainIntensity', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Wind speed <output>{state.environment.windSpeed.toFixed(0)} m/s</output></span><input
					type="range"
					min="0"
					max="45"
					step="1"
					value={state.environment.windSpeed}
					oninput={(event) =>
						onparameter?.('environment', 'windSpeed', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Wind direction <output>{state.environment.windDirection.toFixed(0)}°</output></span
				><input
					type="range"
					min="0"
					max="359"
					step="1"
					value={state.environment.windDirection}
					oninput={(event) =>
						onparameter?.('environment', 'windDirection', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Visibility <output>{state.environment.visibility.toFixed(2)}</output></span><input
					type="range"
					min="0.1"
					max="1"
					step="0.01"
					value={state.environment.visibility}
					oninput={(event) =>
						onparameter?.('environment', 'visibility', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Observer east–west <output>{Math.round(state.observer.x * 100)}%</output></span
				><input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.observer.x}
					oninput={(event) => onparameter?.('observer', 'x', Number(event.currentTarget.value))}
				/></label
			>
			<label class="range"
				><span>Observer north–south <output>{Math.round(state.observer.z * 100)}%</output></span
				><input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.observer.z}
					oninput={(event) => onparameter?.('observer', 'z', Number(event.currentTarget.value))}
				/></label
			>
		</fieldset>

		<fieldset>
			<legend>Visible analytical layers</legend>
			<div class="checks">
				{#each layers as layer (layer.id)}
					<label class="check"
						><input
							type="checkbox"
							checked={state.visibleLayers.includes(layer.id)}
							onchange={(event) => onlayer?.(layer.id, event.currentTarget.checked)}
						/>
						{layer.label}</label
					>
				{/each}
			</div>
		</fieldset>

		<fieldset>
			<legend>Motion, flash and sound safety</legend>
			<label class="check"
				><input
					type="checkbox"
					checked={state.flashSafe}
					onchange={(event) => onflashsafe?.(event.currentTarget.checked)}
				/> Flash-safe mode</label
			>
			<label class="range"
				><span>Sound volume <output>{Math.round(soundVolume * 100)}%</output></span><input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={soundVolume}
					disabled={!soundEnabled}
					oninput={(event) => onvolume?.(Number(event.currentTarget.value))}
				/></label
			>
			<label class="check"
				><input
					type="checkbox"
					checked={compressedThunder}
					onchange={(event) => oncompressedthunder?.(event.currentTarget.checked)}
				/> Compress audio and countdown for demonstration; exported model time stays unchanged</label
			>
		</fieldset>
	</details>

	{#if state.mode === 'study'}
		<section class="placement" aria-labelledby="feature-placement-heading">
			<h3 id="feature-placement-heading">Place a feature</h3>
			<p>Choose a semantic feature, then tap the terrain or use the bounded coordinates.</p>
			<label
				><span>Feature</span><select
					value={placementKind}
					onchange={(event) => onplacementkind?.(event.currentTarget.value as PlaceableFeatureKind)}
					>{#each PLACEABLE_FEATURES as feature (feature.id)}<option value={feature.id}
							>{feature.label}</option
						>{/each}</select
				></label
			>
			<label class="range"
				><span>Rotation <output>{Math.round(placementRotation)}°</output></span><input
					type="range"
					min="0"
					max="359"
					step="1"
					value={placementRotation}
					oninput={(event) => onplacementrotation?.(Number(event.currentTarget.value))}
				/></label
			>
			<div class="coordinates">
				<label
					><span>East–west</span><input
						type="number"
						min="0"
						max="1"
						step="0.01"
						value={placementX}
						onchange={(event) => onplacementcoordinate?.('x', Number(event.currentTarget.value))}
					/></label
				>
				<label
					><span>North–south</span><input
						type="number"
						min="0"
						max="1"
						step="0.01"
						value={placementZ}
						onchange={(event) => onplacementcoordinate?.('z', Number(event.currentTarget.value))}
					/></label
				>
			</div>
			<button type="button" onclick={onplacekeyboard} disabled={state.placedFeatures.length >= 20}
				>Place at coordinates</button
			>
			{#if state.placedFeatures.length}
				<ul>
					{#each state.placedFeatures as feature (feature.id)}
						<li>
							<span
								>{feature.kind.replaceAll('-', ' ')} · {feature.x.toFixed(2)}, {feature.z.toFixed(
									2
								)}</span
							><button type="button" onclick={() => onremovefeature?.(feature.id)}>Delete</button>
						</li>
					{/each}
				</ul>
				<button type="button" onclick={onclearfeatures}>Clear all user features</button>
			{/if}
		</section>
	{/if}

	<div class="rail-footer">
		<button type="button" onclick={onreset}>Reset scene</button>
		<p aria-live="polite">{actionStatus}</p>
	</div>
</aside>

<style>
	.control-rail {
		height: 100%;
		overflow: auto;
		border-right: 1px solid var(--atlas-line);
		background: var(--atlas-panel);
		padding: 0.8rem;
		color: var(--atlas-text);
	}

	.mode-tabs {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.35rem;
	}

	button,
	select,
	input[type='number'] {
		min-height: 2.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-control);
		padding: 0.45rem 0.62rem;
		color: inherit;
		font: inherit;
		font-size: 0.74rem;
	}

	button {
		cursor: pointer;
	}
	button:hover:not(:disabled),
	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		border-color: var(--atlas-accent);
		outline: 2px solid transparent;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.46;
	}
	.mode-tabs button[aria-pressed='true'] {
		border-color: var(--atlas-accent);
		background: color-mix(in srgb, var(--atlas-accent) 14%, var(--atlas-control));
		color: var(--atlas-accent);
	}

	.primary-selects,
	.control-grid,
	.coordinates {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-top: 0.7rem;
	}

	.featured-storm {
		display: grid;
		gap: 0.6rem;
		margin-top: 0.7rem;
		border: 1px solid color-mix(in srgb, var(--atlas-accent) 58%, var(--atlas-line));
		border-radius: 0.48rem;
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--atlas-accent) 13%, transparent),
				transparent
			),
			var(--atlas-control);
		padding: 0.7rem;
	}
	.featured-storm span {
		color: var(--atlas-accent);
		font:
			0.62rem 'Courier Prime',
			monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.featured-storm h3,
	.featured-storm p {
		margin: 0;
	}
	.featured-storm h3 {
		margin-top: 0.2rem;
		font-size: 0.86rem;
	}
	.featured-storm p {
		margin-top: 0.25rem;
		color: var(--atlas-muted);
		font-size: 0.7rem;
		line-height: 1.45;
	}
	label {
		min-width: 0;
	}
	.primary-selects label,
	.control-grid label,
	.placement > label,
	.coordinates label {
		display: grid;
		gap: 0.25rem;
	}
	label > span,
	legend {
		color: var(--atlas-muted);
		font-size: 0.66rem;
		letter-spacing: 0.035em;
	}
	.primary-selects small {
		color: var(--atlas-muted);
		font-size: 0.62rem;
		line-height: 1.35;
	}
	select,
	input[type='number'] {
		width: 100%;
		min-width: 0;
	}

	.primary-actions,
	.secondary-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
		margin-top: 0.55rem;
	}

	.primary-actions .strike,
	.primary-actions .hero-strike {
		border-color: color-mix(in srgb, var(--atlas-accent) 78%, var(--atlas-line));
		background: color-mix(in srgb, var(--atlas-accent) 18%, var(--atlas-control));
		color: var(--atlas-text-strong);
		font-weight: 800;
	}
	.primary-actions .hero-strike {
		width: 100%;
		background: color-mix(in srgb, var(--atlas-accent) 32%, var(--atlas-control));
	}
	.hero-action {
		position: relative;
	}
	.tooltip {
		position: absolute;
		z-index: 5;
		top: calc(100% + 0.35rem);
		right: 0;
		width: min(18rem, 100%);
		border: 1px solid var(--atlas-line);
		border-radius: 0.35rem;
		background: var(--atlas-panel-strong);
		padding: 0.5rem 0.58rem;
		color: var(--atlas-text);
		font-size: 0.67rem;
		line-height: 1.4;
		opacity: 0;
		pointer-events: none;
		transform: translateY(-0.2rem);
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}
	.hero-action:hover .tooltip,
	.hero-action:focus-within .tooltip {
		opacity: 1;
		transform: translateY(0);
	}

	.advanced {
		margin-top: 0.75rem;
		border-top: 1px solid var(--atlas-line);
		padding-top: 0.65rem;
	}
	summary {
		min-height: 2.75rem;
		cursor: pointer;
		color: var(--atlas-accent);
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 2.75rem;
	}
	fieldset {
		display: grid;
		gap: 0.58rem;
		margin: 0.8rem 0 0;
		border: 1px solid var(--atlas-line);
		border-radius: 0.4rem;
		padding: 0.7rem;
	}
	legend {
		padding-inline: 0.3rem;
		text-transform: uppercase;
	}
	.range {
		display: grid;
		gap: 0.25rem;
	}
	.range > span {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}
	output {
		color: var(--atlas-text);
		font-family: 'Courier Prime', monospace;
	}
	input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		accent-color: var(--atlas-accent);
	}
	.check {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.5rem;
		color: var(--atlas-text);
		font-size: 0.72rem;
	}
	.check input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--atlas-accent);
	}
	.checks {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}

	.placement {
		margin-top: 0.75rem;
		border: 1px solid var(--atlas-line);
		border-radius: 0.45rem;
		background: color-mix(in srgb, var(--atlas-control) 72%, transparent);
		padding: 0.75rem;
	}
	.placement h3,
	.placement p {
		margin: 0;
	}
	.placement h3 {
		font-size: 0.9rem;
	}
	.placement p {
		margin-top: 0.25rem;
		color: var(--atlas-muted);
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.placement > label,
	.placement > button {
		margin-top: 0.6rem;
	}
	.placement ul {
		display: grid;
		gap: 0.3rem;
		max-height: 11rem;
		overflow: auto;
		margin: 0.65rem 0 0;
		padding: 0;
		list-style: none;
	}
	.placement li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		border-bottom: 1px solid var(--atlas-line);
		padding-bottom: 0.25rem;
		color: var(--atlas-muted);
		font-size: 0.68rem;
	}
	.placement li button {
		min-height: 2.75rem;
		padding-block: 0.2rem;
	}

	.rail-footer {
		margin-top: 0.75rem;
		border-top: 1px solid var(--atlas-line);
		padding-top: 0.7rem;
	}
	.rail-footer p {
		margin: 0.55rem 0 0;
		color: var(--atlas-muted);
		font-size: 0.68rem;
		line-height: 1.4;
	}

	@media (max-width: 960px) {
		.control-rail {
			height: auto;
			max-height: 35rem;
			border-top: 1px solid var(--atlas-line);
			border-right: 0;
		}
		.mode-tabs {
			grid-template-columns: repeat(4, minmax(7rem, 1fr));
			overflow-x: auto;
		}
		.primary-actions,
		.secondary-actions {
			grid-template-columns: repeat(4, minmax(8rem, 1fr));
			overflow-x: auto;
		}
		.primary-actions .strike {
			grid-column: auto;
		}
	}

	@media (max-width: 540px) {
		.control-rail {
			max-height: none;
			padding: 0.65rem;
		}
		.primary-selects,
		.control-grid,
		.coordinates {
			grid-template-columns: 1fr;
		}
		.primary-actions,
		.secondary-actions {
			grid-template-columns: 1fr 1fr;
			overflow: visible;
		}
		.primary-actions .strike,
		.primary-actions .hero-action {
			grid-column: 1 / -1;
		}
		.checks {
			grid-template-columns: 1fr;
		}
	}
</style>
