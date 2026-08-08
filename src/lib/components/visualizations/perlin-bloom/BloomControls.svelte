<script lang="ts">
	import {
		CONFIG_RANGES,
		MAX_SEED_LENGTH,
		type FlowerConfig
	} from '$lib/visualizations/perlin-bloom';

	type NumericConfigKey = {
		[K in keyof FlowerConfig]: FlowerConfig[K] extends number ? K : never;
	}[keyof FlowerConfig];

	type PresetChoice = {
		id: FlowerConfig['preset'];
		name: string;
		description?: string;
	};

	type Props = {
		config: FlowerConfig;
		presets: readonly PresetChoice[];
		exportScale: 1 | 2 | 4;
		includeSignature: boolean;
		disabled?: boolean;
		onPatch: (patch: Partial<FlowerConfig>) => void;
		onPalette: (palette: FlowerConfig['palette']) => void;
		onExportScale: (scale: 1 | 2 | 4) => void;
		onSignature: (include: boolean) => void;
		onCopyLink: () => void;
		onReset: () => void;
		onSave: () => void;
	};

	let {
		config,
		presets,
		exportScale,
		includeSignature,
		disabled = false,
		onPatch,
		onPalette,
		onExportScale,
		onSignature,
		onCopyLink,
		onReset,
		onSave
	}: Props = $props();

	const uid = $props.id();

	function value(event: Event) {
		return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
	}

	function numericValue(event: Event) {
		const parsed = Number(value(event));
		return Number.isFinite(parsed) ? parsed : 0;
	}

	function rangeFor(key: NumericConfigKey) {
		return CONFIG_RANGES[key];
	}

	function formattedValue(key: NumericConfigKey) {
		const setting = rangeFor(key);
		return config[key].toFixed(setting.decimals);
	}

	function patchNumber(key: NumericConfigKey, event: Event) {
		onPatch({ [key]: numericValue(event) } as Partial<FlowerConfig>);
	}
</script>

{#snippet slider(key: NumericConfigKey, help: string, suffix = '')}
	{@const setting = rangeFor(key)}
	<label class="range-control" for={`${uid}-${key}`}>
		<span class="range-heading">
			<span>{setting.label}</span>
			<output for={`${uid}-${key}`}>{formattedValue(key)}{suffix}</output>
		</span>
		<input
			id={`${uid}-${key}`}
			type="range"
			min={setting.min}
			max={setting.max}
			step={setting.step}
			value={config[key]}
			{disabled}
			oninput={(event) => patchNumber(key, event)}
		/>
		<small>{help}</small>
	</label>
{/snippet}

{#snippet toggle(
	key: 'boundaryPhysics' | 'boxVisible' | 'motionEnabled',
	label: string,
	help: string
)}
	<label class="toggle-control" for={`${uid}-${key}`}>
		<input
			id={`${uid}-${key}`}
			type="checkbox"
			checked={config[key]}
			{disabled}
			onchange={(event) => onPatch({ [key]: (event.currentTarget as HTMLInputElement).checked })}
		/>
		<span>
			<strong>{label}</strong>
			<small>{help}</small>
		</span>
	</label>
{/snippet}

<section class="controls" aria-labelledby={`${uid}-title`} data-testid="perlin-bloom-controls">
	<header>
		<div>
			<p>Specimen controls</p>
			<h2 id={`${uid}-title`}>Bloom instrument</h2>
		</div>
		<span aria-hidden="true">PB–01</span>
	</header>

	<details open>
		<summary>
			<span>Bloom</span>
			<small>Petal anatomy and symmetry</small>
		</summary>
		<fieldset>
			<legend>Bloom geometry</legend>
			<div class="control-grid">
				{@render slider('petals', 'Petals in each whorl.')}
				{@render slider('whorls', 'Layered rings from the luminous core.')}
				{@render slider('bloomScale', 'Overall reach inside the specimen chamber.')}
				{@render slider('petalLength', 'Length of each curved ribbon.')}
				{@render slider('petalWidth', 'Fullness of the petal membranes.')}
				{@render slider('widthProfile', 'How quickly each ribbon narrows at base and tip.')}
				{@render slider('symmetry', 'Higher values repeat structure more strictly.')}
				{@render slider('asymmetry', 'Seeded differences between neighboring petals.')}
				{@render slider('curl', 'Angular bend accumulated towards each tip.')}

				<label class="select-control" for={`${uid}-tipStyle`}>
					<span>Tip style</span>
					<select
						id={`${uid}-tipStyle`}
						value={config.tipStyle}
						{disabled}
						onchange={(event) => onPatch({ tipStyle: value(event) as FlowerConfig['tipStyle'] })}
					>
						<option value="rounded">Rounded</option>
						<option value="pointed">Pointed</option>
						<option value="split">Lightly split</option>
						<option value="recurved">Recurved</option>
						<option value="filamented">Filamented</option>
					</select>
					<small>Changes tip anatomy without replacing the seed.</small>
				</label>

				<label class="select-control" for={`${uid}-view`}>
					<span>Specimen view</span>
					<select
						id={`${uid}-view`}
						value={config.view}
						{disabled}
						onchange={(event) => onPatch({ view: value(event) as FlowerConfig['view'] })}
					>
						<option value="artwork">Artwork</option>
						<option value="anatomy">Anatomy</option>
					</select>
					<small>Anatomy exposes centerlines, normals, whorls, and rupture points.</small>
				</label>
			</div>
		</fieldset>
	</details>

	<details>
		<summary>
			<span>Noise</span>
			<small>Coherence, scale, and warped coordinates</small>
		</summary>
		<fieldset>
			<legend>Noise field</legend>
			<div class="control-grid">
				{@render slider('noiseStrength', 'How strongly coherent noise deforms petal anatomy.')}
				{@render slider('noiseScale', 'Moves between broad folds and fine variation.')}
				{@render slider('domainWarp', 'Bends the map before the main field is sampled.')}
			</div>
			<details class="advanced">
				<summary>Advanced noise detail</summary>
				<div class="control-grid advanced-grid">
					{@render slider('octaves', 'Layers of progressively finer coherent detail.')}
					{@render slider('falloff', 'Contribution retained by each finer octave.')}
				</div>
			</details>
		</fieldset>
	</details>

	<details>
		<summary>
			<span>Motion</span>
			<small>Breathing, drift, response, and trails</small>
		</summary>
		<fieldset>
			<legend>Motion</legend>
			<div class="control-grid">
				{@render toggle(
					'motionEnabled',
					'Continuous motion',
					'Can be enabled explicitly when the site requests reduced motion.'
				)}
				{@render slider('breath', 'Phase-shifted expansion through core and whorls.')}
				{@render slider('noiseDrift', 'Speed of coherent change, not a morphology reset.')}
				{@render slider('rotation', 'Slow deliberate turning; zero remains still.')}
				{@render slider(
					'pointerInfluence',
					'Strength of local petal recoil and highlight response.'
				)}
				{@render slider('trails', 'Persistence of light from the previous frame.')}
			</div>
		</fieldset>
	</details>

	<details>
		<summary>
			<span>Boundary</span>
			<small>The square field that the organism escapes</small>
		</summary>
		<fieldset>
			<legend>Boundary field</legend>
			<div class="control-grid">
				{@render toggle(
					'boundaryPhysics',
					'Boundary physics',
					'Compress and refract petals near the square signed-distance field.'
				)}
				{@render toggle(
					'boxVisible',
					'Visible chamber',
					'Hide the instrument while optionally retaining its force field.'
				)}
				{@render slider('boxSize', 'Half-size of the square relative to the bloom.')}
				{@render slider('constraint', 'Pressure applied as petals approach the walls.')}
				{@render slider(
					'ruptureThreshold',
					'Signed release point: negative values rupture before the wall; positive values rupture beyond it.'
				)}
				{@render slider('breakout', 'Curl, colour separation, and release after crossing.')}
				{@render slider('boxOpacity', 'Brightness of the glass chamber and its grid.')}
			</div>
		</fieldset>
	</details>

	<details>
		<summary>
			<span>Light</span>
			<small>Palette, membranes, veins, and atmosphere</small>
		</summary>
		<fieldset>
			<legend>Light and colour</legend>
			<div class="control-grid">
				<label class="select-control wide" for={`${uid}-palette`}>
					<span>Light palette</span>
					<select
						id={`${uid}-palette`}
						value={config.palette}
						{disabled}
						onchange={(event) => onPalette(value(event) as FlowerConfig['palette'])}
					>
						{#each presets as preset (preset.id)}
							<option value={preset.id}>{preset.name}</option>
						{/each}
					</select>
					<small>Changes only illumination and colour; anatomy and seed stay unchanged.</small>
				</label>
				{@render slider('membraneOpacity', 'Transparency of layered petal tissue.')}
				{@render slider('veinBrightness', 'Selective vascular and midrib light.')}
				{@render slider('glow', 'Reduced-resolution bloom around bright structures.')}
				{@render slider('grain', 'Fine surface texture; reduced at lower quality.')}
				{@render slider('pollen', 'Density of sparse particles near core and ruptures.')}
			</div>
		</fieldset>
	</details>

	<details>
		<summary>
			<span>Output</span>
			<small>Repeat, share, and render the specimen</small>
		</summary>
		<fieldset>
			<legend>Output</legend>
			<div class="control-grid">
				<label class="select-control wide" for={`${uid}-seed`}>
					<span>Seed text</span>
					<input
						id={`${uid}-seed`}
						type="text"
						value={config.seed}
						maxlength={MAX_SEED_LENGTH}
						spellcheck="false"
						autocomplete="off"
						{disabled}
						onchange={(event) => onPatch({ seed: value(event) })}
					/>
					<small>Any short text becomes a repeatable 32-bit morphology.</small>
				</label>

				<label class="select-control" for={`${uid}-quality`}>
					<span>Render quality</span>
					<select
						id={`${uid}-quality`}
						value={config.quality}
						{disabled}
						onchange={(event) => onPatch({ quality: value(event) as FlowerConfig['quality'] })}
					>
						<option value="auto">Auto</option>
						<option value="low">Low</option>
						<option value="high">High</option>
					</select>
					<small>Auto sheds secondary effects before changing flower anatomy.</small>
				</label>

				<label class="select-control" for={`${uid}-export-scale`}>
					<span>Export scale</span>
					<select
						id={`${uid}-export-scale`}
						value={exportScale}
						{disabled}
						onchange={(event) => onExportScale(Number(value(event)) as 1 | 2 | 4)}
					>
						<option value="1">1×</option>
						<option value="2">2×</option>
						<option value="4">4× · safely capped</option>
					</select>
					<small>The engine rerenders normalized geometry; it does not stretch the bitmap.</small>
				</label>

				<label class="toggle-control wide" for={`${uid}-signature`}>
					<input
						id={`${uid}-signature`}
						type="checkbox"
						checked={includeSignature}
						{disabled}
						onchange={(event) => onSignature((event.currentTarget as HTMLInputElement).checked)}
					/>
					<span>
						<strong>Title + seed signature</strong>
						<small>Add a restrained specimen ledger to the rendered PNG.</small>
					</span>
				</label>
			</div>

			<div class="output-actions">
				<button type="button" onclick={onCopyLink}>Copy bloom link</button>
				<button type="button" onclick={onReset}>Reset defaults</button>
				<button type="button" class="primary" onclick={onSave} {disabled}>Save PNG</button>
			</div>
		</fieldset>
	</details>
</section>

<style>
	.controls {
		--panel: rgb(8 11 30 / 88%);
		--panel-raised: rgb(16 20 45 / 90%);
		--line: rgb(136 206 255 / 16%);
		--line-bright: rgb(114 236 255 / 42%);
		--ink: #e8f2ff;
		--muted: #94a8c4;
		--cyan: #82f4ff;
		overflow: hidden;
		border: 1px solid var(--line-bright);
		border-radius: 0.9rem;
		background: var(--panel);
		box-shadow: inset 0 1px rgb(255 255 255 / 5%);
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		backdrop-filter: blur(18px);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--line);
		padding: 0.8rem 0.9rem;
		background: linear-gradient(120deg, rgb(76 25 112 / 25%), rgb(8 17 42 / 55%));
	}

	header p,
	header h2 {
		margin: 0;
	}

	header p,
	header > span {
		color: var(--cyan);
		font: 750 0.58rem/1.2 var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	header h2 {
		margin-top: 0.18rem;
		font: 650 0.95rem/1.1 var(--font-sans, sans-serif);
		letter-spacing: -0.01em;
	}

	.controls > details {
		border-bottom: 1px solid var(--line);
	}

	.controls > details:last-child {
		border-bottom: 0;
	}

	.controls > details > summary,
	.advanced > summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		min-height: 3rem;
		cursor: pointer;
		list-style: none;
		align-content: center;
		gap: 0.16rem 0.6rem;
		padding: 0.65rem 0.9rem;
	}

	.controls > details > summary::-webkit-details-marker,
	.advanced > summary::-webkit-details-marker {
		display: none;
	}

	.controls > details > summary::after,
	.advanced > summary::after {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		content: '+';
		color: var(--cyan);
		font-size: 1rem;
	}

	.controls > details[open] > summary::after,
	.advanced[open] > summary::after {
		content: '−';
	}

	.controls > details > summary > span {
		font: 760 0.8rem/1.1 var(--font-sans, sans-serif);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.controls > details > summary small {
		grid-column: 1;
		color: var(--muted);
		font: 500 0.75rem/1.3 var(--font-sans, sans-serif);
	}

	.controls > details > summary:hover {
		background: rgb(90 158 255 / 6%);
	}

	summary:focus-visible,
	button:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--cyan);
		outline-offset: -2px;
	}

	fieldset {
		margin: 0;
		border: 0;
		border-top: 1px solid var(--line);
		padding: 0.85rem;
		background: rgb(4 7 21 / 42%);
	}

	fieldset > legend {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}

	.control-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.9rem 0.75rem;
	}

	.range-control,
	.select-control {
		display: grid;
		min-width: 0;
		gap: 0.36rem;
		align-content: start;
		color: var(--ink);
		font: 650 0.78rem/1.25 var(--font-sans, sans-serif);
	}

	.range-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.range-heading output {
		color: var(--cyan);
		font: 700 0.72rem/1 var(--font-mono, ui-monospace, monospace);
	}

	.range-control small,
	.select-control small,
	.toggle-control small {
		display: block;
		color: var(--muted);
		font: 470 0.75rem/1.42 var(--font-sans, sans-serif);
	}

	.range-control input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		margin: 0;
		cursor: pointer;
		accent-color: #55dcff;
	}

	.select-control select,
	.select-control input[type='text'] {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid rgb(143 211 255 / 26%);
		border-radius: 0.55rem;
		background: rgb(13 18 42 / 94%);
		padding: 0.55rem 0.65rem;
		color: var(--ink);
		font: 600 0.78rem/1 var(--font-sans, sans-serif);
	}

	.select-control input[type='text'] {
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.toggle-control {
		display: grid;
		grid-template-columns: 1.2rem minmax(0, 1fr);
		grid-column: 1 / -1;
		align-items: start;
		gap: 0.6rem;
		min-height: 2.75rem;
		border: 1px solid rgb(143 211 255 / 18%);
		border-radius: 0.6rem;
		background: var(--panel-raised);
		padding: 0.65rem;
		cursor: pointer;
	}

	.toggle-control input {
		width: 1.15rem;
		height: 1.15rem;
		margin: 0.12rem 0 0;
		accent-color: #57e7ff;
	}

	.toggle-control strong {
		display: block;
		margin-bottom: 0.16rem;
		font: 680 0.78rem/1.2 var(--font-sans, sans-serif);
	}

	.advanced {
		margin-top: 0.8rem;
		border: 1px solid var(--line);
		border-radius: 0.65rem;
		background: rgb(8 14 34 / 48%);
	}

	.advanced > summary {
		min-height: 2.75rem;
		font: 700 0.75rem/1.2 var(--font-sans, sans-serif);
		letter-spacing: 0.04em;
	}

	.advanced-grid {
		border-top: 1px solid var(--line);
		padding: 0.75rem;
	}

	.output-actions {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
		margin-top: 0.9rem;
	}

	.output-actions button {
		min-height: 2.75rem;
		border: 1px solid rgb(143 211 255 / 28%);
		border-radius: 0.55rem;
		background: rgb(15 22 49 / 92%);
		padding: 0.5rem;
		color: #dceaff;
		font: 690 0.75rem/1.2 var(--font-sans, sans-serif);
		cursor: pointer;
	}

	.output-actions button:hover {
		border-color: rgb(109 238 255 / 66%);
		background: rgb(24 34 70 / 96%);
	}

	.output-actions button.primary {
		border-color: rgb(120 239 255 / 62%);
		background: linear-gradient(120deg, #1b6f8a, #6c267f);
		color: #fff;
	}

	button:disabled,
	input:disabled,
	select:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	@media (max-width: 72rem) and (min-width: 56rem) {
		.control-grid {
			grid-template-columns: 1fr;
		}

		.wide,
		.toggle-control {
			grid-column: 1;
		}

		.output-actions {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 31rem) {
		.control-grid,
		.output-actions {
			grid-template-columns: 1fr;
		}

		.wide,
		.toggle-control {
			grid-column: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.controls *,
		.controls *::before,
		.controls *::after {
			scroll-behavior: auto;
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.controls,
		fieldset,
		.advanced,
		.toggle-control,
		.select-control select,
		.select-control input,
		.output-actions button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
			backdrop-filter: none;
		}

		.output-actions button.primary {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
