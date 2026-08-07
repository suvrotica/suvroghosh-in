<script lang="ts">
	import type { GalleryState } from '$lib/visualizations/invisible-weather';

	type Choice = { id: string; name: string; description?: string };
	type Props = {
		state: GalleryState;
		presets: readonly Choice[];
		palettes: readonly Choice[];
		onPreset: (id: string) => void;
		onState: (patch: Partial<GalleryState>) => void;
		onReset: () => void;
	};

	let { state, presets, palettes, onPreset, onState, onReset }: Props = $props();

	const layoutOptions = [
		['quiet-grid', 'Quiet Grid'],
		['salon-wall', 'Salon Wall'],
		['cabinet', 'Cabinet'],
		['triptych', 'Triptych'],
		['procession', 'Procession']
	] as const;
	const angleOptions = [
		['free', 'Free current'],
		['orthogonal', 'Orthogonal · 90°'],
		['diagonal', 'Diagonal · 45°'],
		['hexagonal', 'Hexagonal · 60°'],
		['alternating', 'Alternating regions'],
		['soft', 'Soft geometry']
	] as const;
	const thresholdOptions = [
		['off', 'Off'],
		['river', 'River · middle band'],
		['islands', 'Islands · outer tails'],
		['delta', 'Delta · local difference']
	] as const;
	const frameOptions = [
		['quiet-wood', 'Quiet wood'],
		['oxidised-brass', 'Oxidised brass'],
		['limewash', 'Limewash'],
		['white-oak', 'White oak'],
		['indigo-black', 'Indigo black'],
		['dark-jute', 'Dark jute'],
		['black-lacquer', 'Black lacquer']
	] as const;

	function value(event: Event) {
		return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
	}

	function numberValue(event: Event) {
		const parsed = Number(value(event));
		return Number.isFinite(parsed) ? parsed : 0;
	}
</script>

<div class="controls" data-testid="invisible-weather-controls">
	<div class="primary-grid">
		<label>
			<span>Curated preset</span>
			<select value={state.presetId} onchange={(event) => onPreset(value(event))}>
				{#each presets as preset (preset.id)}
					<option value={preset.id}>{preset.name}</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Wall arrangement</span>
			<select
				value={state.layout}
				onchange={(event) => onState({ layout: value(event) as GalleryState['layout'] })}
			>
				{#each layoutOptions as option (option[0])}
					<option value={option[0]}>{option[1]}</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Palette family</span>
			<select value={state.paletteId} onchange={(event) => onState({ paletteId: value(event) })}>
				{#each palettes as palette (palette.id)}
					<option value={palette.id}>{palette.name}</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Weather motion</span>
			<select
				value={state.motion}
				onchange={(event) => onState({ motion: value(event) as GalleryState['motion'] })}
			>
				<option value="still">Still</option>
				<option value="breathe">Breathe</option>
				<option value="migrate">Migrate</option>
			</select>
		</label>
	</div>

	<details class="studio">
		<summary>Studio controls</summary>
		<div class="studio-grid">
			<fieldset>
				<legend>Exhibition</legend>
				<label>
					<span>Artwork count <output>{state.artworkCount}</output></span>
					<input
						type="range"
						min="3"
						max="15"
						step="1"
						value={state.artworkCount}
						disabled={state.layout === 'triptych'}
						oninput={(event) => onState({ artworkCount: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Orientation</span>
					<select
						value={state.orientation}
						onchange={(event) =>
							onState({ orientation: value(event) as GalleryState['orientation'] })}
					>
						<option value="auto">Responsive</option>
						<option value="landscape">Landscape room</option>
						<option value="portrait">Portrait room</option>
					</select>
				</label>
				<label>
					<span>Frame family</span>
					<select
						value={state.frameFamily}
						onchange={(event) => onState({ frameFamily: value(event) })}
					>
						{#each frameOptions as option (option[0])}
							<option value={option[0]}>{option[1]}</option>
						{/each}
					</select>
				</label>
			</fieldset>

			<fieldset>
				<legend>Nested weather</legend>
				<label>
					<span>Nested depth <output>{state.depth}</output></span>
					<input
						type="range"
						min="1"
						max="4"
						step="1"
						value={state.depth}
						oninput={(event) => onState({ depth: numberValue(event) as GalleryState['depth'] })}
					/>
				</label>
				<label>
					<span>Field scale <output>{state.frequency.toFixed(2)}</output></span>
					<input
						type="range"
						min="0.45"
						max="3.2"
						step="0.05"
						value={state.frequency}
						oninput={(event) => onState({ frequency: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Coordinate warp <output>{state.warpStrength.toFixed(2)}</output></span>
					<input
						type="range"
						min="0"
						max="2.4"
						step="0.05"
						value={state.warpStrength}
						oninput={(event) => onState({ warpStrength: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Field multiplier <output>{state.multiplier.toFixed(2)}</output></span>
					<input
						type="range"
						min="0.35"
						max="2.8"
						step="0.05"
						value={state.multiplier}
						oninput={(event) => onState({ multiplier: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Angular turns <output>{state.turns.toFixed(1)}</output></span>
					<input
						type="range"
						min="0.5"
						max="5"
						step="0.1"
						value={state.turns}
						oninput={(event) => onState({ turns: numberValue(event) })}
					/>
				</label>
			</fieldset>

			<fieldset>
				<legend>Marks and directions</legend>
				<label>
					<span>Direction grammar</span>
					<select
						value={state.angleMode}
						onchange={(event) => onState({ angleMode: value(event) as GalleryState['angleMode'] })}
					>
						{#each angleOptions as option (option[0])}
							<option value={option[0]}>{option[1]}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>Quantization softness <output>{state.softness.toFixed(2)}</output></span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.02"
						value={state.softness}
						oninput={(event) => onState({ softness: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Line density <output>{state.pathDensity.toFixed(2)}</output></span>
					<input
						type="range"
						min="0.3"
						max="1.8"
						step="0.05"
						value={state.pathDensity}
						oninput={(event) => onState({ pathDensity: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Path length <output>{state.pathLength.toFixed(2)}</output></span>
					<input
						type="range"
						min="8"
						max="96"
						step="1"
						value={state.pathLength}
						oninput={(event) => onState({ pathLength: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Stroke weight <output>{state.strokeWidth.toFixed(2)}</output></span>
					<input
						type="range"
						min="0.45"
						max="1.8"
						step="0.05"
						value={state.strokeWidth}
						oninput={(event) => onState({ strokeWidth: numberValue(event) })}
					/>
				</label>
			</fieldset>

			<fieldset>
				<legend>River and material</legend>
				<label>
					<span>Secondary region</span>
					<select
						value={state.thresholdMode}
						onchange={(event) =>
							onState({ thresholdMode: value(event) as GalleryState['thresholdMode'] })}
					>
						{#each thresholdOptions as option (option[0])}
							<option value={option[0]}>{option[1]}</option>
						{/each}
					</select>
				</label>
				<label>
					<span>Threshold band <output>{state.thresholdWidth.toFixed(3)}</output></span>
					<input
						type="range"
						min="0.025"
						max="0.22"
						step="0.005"
						value={state.thresholdWidth}
						oninput={(event) => onState({ thresholdWidth: numberValue(event) })}
					/>
				</label>
				<label class="check">
					<input
						type="checkbox"
						checked={state.dualInk}
						onchange={(event) =>
							onState({ dualInk: (event.currentTarget as HTMLInputElement).checked })}
					/>
					<span>Use compatible second ink</span>
				</label>
				<label>
					<span>Paper grain <output>{state.grain.toFixed(2)}</output></span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={state.grain}
						oninput={(event) => onState({ grain: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Frame shadow <output>{state.shadow.toFixed(2)}</output></span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={state.shadow}
						oninput={(event) => onState({ shadow: numberValue(event) })}
					/>
				</label>
				<label>
					<span>Motion speed <output>{state.speed.toFixed(2)}</output></span>
					<input
						type="range"
						min="0.2"
						max="2"
						step="0.05"
						value={state.speed}
						oninput={(event) => onState({ speed: numberValue(event) })}
					/>
				</label>
			</fieldset>
		</div>
		<div class="studio-footer">
			<button type="button" onclick={onReset}>Restore preset defaults</button>
			<p>Structural controls change the recipe; resizing the room does not.</p>
		</div>
	</details>
</div>

<style>
	.controls {
		display: grid;
		gap: 0.7rem;
	}

	.primary-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
		margin: 0;
		color: var(--iw-muted, #5c574e);
		font: 650 0.69rem/1.2 var(--font-sans);
		letter-spacing: 0.035em;
	}

	label > span:first-child {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	output {
		color: var(--iw-ink, #25231f);
		font-family: var(--font-mono);
		font-weight: 500;
		letter-spacing: 0;
	}

	select,
	input[type='range'] {
		width: 100%;
	}

	select {
		min-height: 2.75rem;
		border: 1px solid var(--iw-rule, #aaa08d);
		border-radius: 0.45rem;
		background: var(--iw-control, #f5efe4);
		padding: 0.45rem 1.8rem 0.45rem 0.6rem;
		color: var(--iw-ink, #25231f);
		font: 650 0.75rem/1.2 var(--font-sans);
	}

	input[type='range'] {
		min-height: 2.75rem;
		accent-color: var(--iw-accent, #725a3d);
	}

	input:focus-visible,
	select:focus-visible,
	button:focus-visible,
	summary:focus-visible {
		outline: 3px solid var(--iw-focus, #245c73);
		outline-offset: 2px;
	}

	.studio {
		border-top: 1px solid var(--iw-rule, #aaa08d);
		padding-top: 0.45rem;
	}

	.studio > summary {
		min-height: 2.75rem;
		padding: 0.7rem 0.25rem;
		color: var(--iw-ink, #25231f);
		font: 750 0.78rem/1.2 var(--font-sans);
		cursor: pointer;
	}

	.studio-grid {
		display: grid;
		gap: 0.85rem;
		padding-top: 0.55rem;
	}

	fieldset {
		display: grid;
		gap: 0.7rem;
		min-width: 0;
		margin: 0;
		border: 1px solid color-mix(in srgb, var(--iw-rule, #aaa08d) 68%, transparent);
		border-radius: 0.6rem;
		padding: 0.75rem;
	}

	legend {
		padding: 0 0.3rem;
		color: var(--iw-ink, #25231f);
		font: 750 0.7rem/1 var(--font-sans);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.check {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.55rem;
	}

	.check input {
		width: 1.15rem;
		height: 1.15rem;
		margin: 0;
		accent-color: var(--iw-accent, #725a3d);
	}

	.studio-footer {
		display: grid;
		gap: 0.4rem;
		padding-top: 0.85rem;
	}

	.studio-footer button {
		min-height: 2.75rem;
		border: 1px solid var(--iw-rule, #aaa08d);
		border-radius: 999px;
		background: transparent;
		padding: 0.55rem 0.9rem;
		color: var(--iw-ink, #25231f);
		font: 700 0.74rem/1 var(--font-sans);
		cursor: pointer;
	}

	.studio-footer p {
		margin: 0;
		color: var(--iw-muted, #5c574e);
		font: 500 0.68rem/1.45 var(--font-sans);
		text-align: left;
	}

	@media (min-width: 36rem) and (max-width: 68rem) {
		.studio-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 24rem) {
		.primary-grid {
			grid-template-columns: 1fr;
		}
	}

	:global(html[data-theme='high-contrast']) select,
	:global(html[data-theme='high-contrast']) fieldset,
	:global(html[data-theme='high-contrast']) .studio-footer button {
		border-width: 2px;
	}

	@media (forced-colors: active) {
		select,
		fieldset,
		.studio-footer button {
			border-color: CanvasText;
		}
	}
</style>
