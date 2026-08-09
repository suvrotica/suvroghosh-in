<script lang="ts">
	import {
		NUMERIC_RANGES,
		QUALITY_LEVELS,
		VIEW_MODES,
		type NumericGenomeKey
	} from '$lib/visualizations/chitin-engine/genome';
	import { CREATURE_PRESETS, WORLD_PRESETS } from '$lib/visualizations/chitin-engine/presets';
	import type {
		BodyPlanFamily,
		CreatureGenome,
		ExhibitState,
		EyeLayout,
		GaitFamily,
		GenomeGroup,
		MaterialId,
		MutationLocks,
		PaletteId,
		QualityLevel,
		TerminalModule,
		ViewMode,
		WingMode
	} from '$lib/visualizations/chitin-engine/types';

	type NumericControl = Readonly<{ key: NumericGenomeKey; help?: string }>;
	type Props = {
		state: ExhibitState;
		mutationStrength: number;
		locks: MutationLocks;
		canUndo: boolean;
		canRedo: boolean;
		comparing: boolean;
		onPreset: (id: CreatureGenome['preset']) => void;
		onWorld: (id: CreatureGenome['world']) => void;
		onGenomePatch: (patch: Partial<CreatureGenome>, commit?: boolean) => void;
		onStatePatch: (patch: Partial<ExhibitState>, commit?: boolean) => void;
		onMutationStrength: (value: number) => void;
		onLock: (group: GenomeGroup, value: boolean) => void;
		onMutate: () => void;
		onUndo: () => void;
		onRedo: () => void;
		onCompare: () => void;
		onSingleStep: () => void;
		onExportGenome: () => void;
		onImportGenome: (file: File) => void;
		onReset: () => void;
	};

	let {
		state,
		mutationStrength,
		locks,
		canUndo,
		canRedo,
		comparing,
		onPreset,
		onWorld,
		onGenomePatch,
		onStatePatch,
		onMutationStrength,
		onLock,
		onMutate,
		onUndo,
		onRedo,
		onCompare,
		onSingleStep,
		onExportGenome,
		onImportGenome,
		onReset
	}: Props = $props();

	const bodyControls: readonly NumericControl[] = [
		{ key: 'bodySegments', help: 'Validated plate count; regions remain connected.' },
		{ key: 'bodyLength' },
		{ key: 'bodyWidth' },
		{ key: 'headScale' },
		{ key: 'centralScale' },
		{ key: 'terminalScale' },
		{ key: 'axisCurvature' },
		{ key: 'lateralBend' },
		{ key: 'dorsalArch' },
		{ key: 'taper' },
		{ key: 'compression' },
		{ key: 'symmetry' },
		{ key: 'asymmetry' }
	];
	const armourControls: readonly NumericControl[] = [
		{ key: 'segmentOverlap' },
		{ key: 'shellExponent', help: 'Changes the implicit contour, not a biological growth law.' },
		{ key: 'dorsalRidge' },
		{ key: 'ridgeSharpness' },
		{ key: 'lateralFlare' },
		{ key: 'serration' },
		{ key: 'spineDensity' },
		{ key: 'membraneExposure' }
	];
	const appendageControls: readonly NumericControl[] = [
		{
			key: 'walkingLegPairs',
			help: 'Terrestrial discipline repairs this to the valid family count.'
		},
		{ key: 'graspingPairs' },
		{ key: 'legBones' },
		{ key: 'legLength' },
		{ key: 'legThickness' },
		{ key: 'stanceWidth' },
		{ key: 'clawCount' },
		{ key: 'antennaCount' },
		{ key: 'antennaLength' },
		{ key: 'palpLength' }
	];
	const senseControls: readonly NumericControl[] = [
		{ key: 'eyeCount' },
		{ key: 'eyeScale' },
		{ key: 'eyeAsymmetry' },
		{ key: 'poreDensity' }
	];
	const surfaceControls: readonly NumericControl[] = [
		{ key: 'cellularScale' },
		{ key: 'cellularContrast' },
		{ key: 'bristleDensity' },
		{ key: 'iridescence' },
		{ key: 'roughness' },
		{ key: 'corrosion' },
		{ key: 'fluorescence' },
		{ key: 'membraneTranslucency' },
		{ key: 'eyeEmission' },
		{ key: 'seamEmission' }
	];
	const motionControls: readonly NumericControl[] = [
		{ key: 'cadence' },
		{ key: 'stanceRatio' },
		{ key: 'swingHeight' },
		{ key: 'bodyBob' },
		{ key: 'idleMotion' },
		{ key: 'appendageLag' },
		{ key: 'startle' },
		{ key: 'threatIntensity' }
	];
	const groups: readonly GenomeGroup[] = [
		'body',
		'armour',
		'limbs',
		'senses',
		'ornaments',
		'surface',
		'motion',
		'color',
		'world'
	];
	const bodyPlans: readonly BodyPlanFamily[] = [
		'terrestrial-insect',
		'terrestrial-arachnid',
		'myriapod',
		'armoured-crawler',
		'xeno-bilateral',
		'xeno-radial',
		'unclassified'
	];
	const eyeLayouts: readonly EyeLayout[] = [
		'frontal-pair',
		'lateral-compound',
		'clustered-lenses',
		'dorsal-ocelli',
		'asymmetric-cluster',
		'annular',
		'sensory-pits',
		'none'
	];
	const materials: readonly MaterialId[] = [
		'obsidian-iridescent',
		'iridescent-chitin',
		'oxidized-metal',
		'ceramic-bone',
		'translucent-brine',
		'velvet-black',
		'reactor-enamel'
	];
	const palettes: readonly PaletteId[] = [
		'ultraviolet-petrol',
		'reactor-acid',
		'cobalt-velvet',
		'brine-frost',
		'orbital-cyan',
		'monsoon-tram',
		'dune-gold',
		'ash-ember',
		'methane-lantern',
		'high-contrast'
	];
	const gaits: readonly GaitFamily[] = [
		'tripod',
		'arachnoid-scuttle',
		'wave',
		'stalk',
		'skitter',
		'clamp-crawl',
		'dormant'
	];
	const wingModes: readonly WingMode[] = ['none', 'folded', 'half-open', 'display', 'dormant'];
	const terminalModules: readonly TerminalModule[] = [
		'none',
		'split-cerci',
		'tail',
		'fan',
		'stinger-form',
		'lure'
	];

	function label(value: string): string {
		return value.replaceAll('-', ' ');
	}

	function numericPatch(key: NumericGenomeKey, raw: string, commit = false) {
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		onGenomePatch({ [key]: value } as Partial<CreatureGenome>, commit);
	}

	function formatValue(key: NumericGenomeKey): string {
		const value = state.genome[key];
		const range = NUMERIC_RANGES[key];
		if ('integer' in range && range.integer) return String(Math.round(value));
		return value.toFixed(range.step < 0.01 ? 3 : range.step < 0.1 ? 2 : 1);
	}

	function imported(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onImportGenome(file);
		input.value = '';
	}
</script>

{#snippet numericControls(controls: readonly NumericControl[])}
	<div class="control-grid">
		{#each controls as control (control.key)}
			{@const range = NUMERIC_RANGES[control.key]}
			<label class="range-control">
				<span><b>{range.label}</b><output>{formatValue(control.key)}</output></span>
				<input
					type="range"
					aria-label={range.label}
					min={range.min}
					max={range.max}
					step={range.step}
					value={state.genome[control.key]}
					oninput={(event) => numericPatch(control.key, event.currentTarget.value)}
					onchange={(event) => numericPatch(control.key, event.currentTarget.value, true)}
				/>
				{#if control.help}<small>{control.help}</small>{/if}
			</label>
		{/each}
	</div>
{/snippet}

<div class="controls" data-testid="chitin-controls">
	<details open>
		<summary>Body plan</summary>
		<div class="panel">
			<div class="select-grid">
				<label
					><span>Curated specimen</span><select
						value={state.genome.preset}
						onchange={(event) => onPreset(event.currentTarget.value as CreatureGenome['preset'])}
						>{#each CREATURE_PRESETS as preset (preset.id)}<option value={preset.id}
								>{preset.name}</option
							>{/each}</select
					></label
				>
				<label
					><span>Discipline</span><select
						value={state.genome.discipline}
						onchange={(event) =>
							onGenomePatch(
								{ discipline: event.currentTarget.value as CreatureGenome['discipline'] },
								true
							)}
						><option value="xeno-license">Xeno license</option><option
							value="terrestrial-discipline">Terrestrial discipline</option
						></select
					></label
				>
				<label
					><span>Family</span><select
						value={state.genome.bodyPlan}
						onchange={(event) =>
							onGenomePatch({ bodyPlan: event.currentTarget.value as BodyPlanFamily }, true)}
						>{#each bodyPlans as item (item)}<option value={item}>{label(item)}</option
							>{/each}</select
					></label
				>
			</div>
			{@render numericControls(bodyControls)}
		</div>
	</details>

	<details>
		<summary>Armour</summary>
		<div class="panel">{@render numericControls(armourControls)}</div>
	</details>

	<details>
		<summary>Appendages</summary>
		<div class="panel">
			<div class="select-grid">
				<label
					><span>Wing module</span><select
						value={state.genome.wingMode}
						onchange={(event) =>
							onGenomePatch({ wingMode: event.currentTarget.value as WingMode }, true)}
						>{#each wingModes as item (item)}<option value={item}>{label(item)}</option
							>{/each}</select
					></label
				>
				<label
					><span>Terminal module</span><select
						value={state.genome.terminalModule}
						onchange={(event) =>
							onGenomePatch({ terminalModule: event.currentTarget.value as TerminalModule }, true)}
						>{#each terminalModules as item (item)}<option value={item}>{label(item)}</option
							>{/each}</select
					></label
				>
			</div>
			{@render numericControls(appendageControls)}
		</div>
	</details>

	<details>
		<summary>Senses</summary>
		<div class="panel">
			<div class="select-grid">
				<label
					><span>Eye arrangement</span><select
						value={state.genome.eyeLayout}
						onchange={(event) =>
							onGenomePatch({ eyeLayout: event.currentTarget.value as EyeLayout }, true)}
						>{#each eyeLayouts as item (item)}<option value={item}>{label(item)}</option
							>{/each}</select
					></label
				>
			</div>
			{@render numericControls(senseControls)}
		</div>
	</details>

	<details>
		<summary>Surface and light</summary>
		<div class="panel">
			<div class="select-grid">
				<label
					><span>Material family</span><select
						value={state.genome.material}
						onchange={(event) =>
							onGenomePatch({ material: event.currentTarget.value as MaterialId }, true)}
						>{#each materials as item (item)}<option value={item}>{label(item)}</option
							>{/each}</select
					></label
				>
				<label
					><span>Palette</span><select
						value={state.genome.palette}
						onchange={(event) =>
							onGenomePatch({ palette: event.currentTarget.value as PaletteId }, true)}
						>{#each palettes as item (item)}<option value={item}>{label(item)}</option
							>{/each}</select
					></label
				>
			</div>
			{@render numericControls(surfaceControls)}
			<div class="control-grid rendering">
				<label class="range-control"
					><span><b>Scanner intensity</b><output>{state.scannerIntensity.toFixed(2)}</output></span
					><input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={state.scannerIntensity}
						oninput={(event) =>
							onStatePatch({ scannerIntensity: Number(event.currentTarget.value) })}
						onchange={(event) =>
							onStatePatch({ scannerIntensity: Number(event.currentTarget.value) }, true)}
					/></label
				>
				<label class="range-control"
					><span><b>Bloom</b><output>{state.bloom.toFixed(2)}</output></span><input
						type="range"
						min="0"
						max="0.8"
						step="0.01"
						value={state.bloom}
						oninput={(event) => onStatePatch({ bloom: Number(event.currentTarget.value) })}
						onchange={(event) => onStatePatch({ bloom: Number(event.currentTarget.value) }, true)}
					/></label
				>
				<label class="range-control"
					><span><b>Grain</b><output>{state.grain.toFixed(3)}</output></span><input
						type="range"
						min="0"
						max="0.12"
						step="0.005"
						value={state.grain}
						oninput={(event) => onStatePatch({ grain: Number(event.currentTarget.value) })}
						onchange={(event) => onStatePatch({ grain: Number(event.currentTarget.value) }, true)}
					/></label
				>
			</div>
		</div>
	</details>

	<details>
		<summary>Motion</summary>
		<div class="panel">
			<div class="select-grid">
				<label
					><span>Gait family</span><select
						value={state.genome.gait}
						onchange={(event) =>
							onGenomePatch({ gait: event.currentTarget.value as GaitFamily }, true)}
						>{#each gaits as item (item)}<option value={item}>{label(item)}</option>{/each}</select
					></label
				>
			</div>
			{@render numericControls(motionControls)}
			<div class="inline-actions">
				<button type="button" onclick={onSingleStep}>Single gait step</button>
			</div>
		</div>
	</details>

	<details>
		<summary>World</summary>
		<div class="panel">
			<div class="select-grid">
				<label
					><span>World preset</span><select
						value={state.genome.world}
						onchange={(event) => onWorld(event.currentTarget.value as CreatureGenome['world'])}
						>{#each WORLD_PRESETS as world (world.id)}<option value={world.id}>{world.name}</option
							>{/each}</select
					></label
				>
			</div>
			{@render numericControls([
				{
					key: 'worldInfluence',
					help: 'A speculative morphology transform; zero restores the stored base genome.'
				}
			])}
			<p class="world-note">
				{WORLD_PRESETS.find((world) => world.id === state.genome.world)?.mechanism}
			</p>
		</div>
	</details>

	<details>
		<summary>Mutation laboratory</summary>
		<div class="panel mutation-panel">
			<label class="range-control"
				><span><b>Mutation radius</b><output>{mutationStrength.toFixed(2)}</output></span><input
					type="range"
					min="0.02"
					max="1"
					step="0.01"
					value={mutationStrength}
					oninput={(event) => onMutationStrength(Number(event.currentTarget.value))}
				/><small
					>Low values preserve identity; high values may restructure compatible xeno modules.</small
				></label
			>
			<fieldset>
				<legend>Lock parameter groups</legend>
				<div class="lock-grid">
					{#each groups as group (group)}<label
							><input
								type="checkbox"
								checked={locks[group]}
								onchange={(event) => onLock(group, event.currentTarget.checked)}
							/><span>{label(group)}</span></label
						>{/each}
				</div>
			</fieldset>
			<div class="inline-actions">
				<button type="button" class="primary" onclick={onMutate}>Mutate</button>
				<button type="button" onclick={onUndo} disabled={!canUndo}>Undo</button>
				<button type="button" onclick={onRedo} disabled={!canRedo}>Redo</button>
				<button type="button" class:active={comparing} aria-pressed={comparing} onclick={onCompare}
					>Compare parent</button
				>
			</div>
		</div>
	</details>

	<details>
		<summary>Output and diagnostics</summary>
		<div class="panel">
			<div class="select-grid">
				<label
					><span>View channel</span><select
						value={state.view}
						onchange={(event) =>
							onStatePatch({ view: event.currentTarget.value as ViewMode }, true)}
						>{#each VIEW_MODES as item (item)}<option value={item}>{label(item)}</option
							>{/each}</select
					></label
				>
				<label
					><span>Quality</span><select
						value={state.quality}
						onchange={(event) =>
							onStatePatch({ quality: event.currentTarget.value as QualityLevel }, true)}
						>{#each QUALITY_LEVELS as item (item)}<option value={item}>{label(item)}</option
							>{/each}</select
					></label
				>
			</div>
			<div class="inline-actions">
				<button type="button" onclick={onExportGenome}>Export genome JSON</button>
				<label class="file-button"
					><span>Import genome JSON</span><input
						type="file"
						accept="application/json,.json"
						onchange={imported}
					/></label
				>
				<button type="button" onclick={onReset}>Reset exact preset</button>
			</div>
		</div>
	</details>
</div>

<style>
	.controls {
		display: grid;
		gap: 0.55rem;
		color: #d9dbe5;
		font: 0.77rem/1.45 var(--font-sans, system-ui, sans-serif);
	}
	details {
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 0.75rem;
		background: rgb(5 6 15 / 80%);
		overflow: clip;
	}
	summary {
		min-height: 2.85rem;
		padding: 0.8rem 0.9rem;
		cursor: pointer;
		color: #f0f1f7;
		font-weight: 680;
		letter-spacing: 0.01em;
	}
	details[open] > summary {
		border-bottom: 1px solid rgb(255 255 255 / 7%);
	}
	.panel {
		display: grid;
		gap: 0.9rem;
		padding: 0.9rem;
	}
	.control-grid,
	.select-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.8rem;
	}
	.select-grid label,
	.range-control {
		display: grid;
		gap: 0.42rem;
		min-width: 0;
	}
	.select-grid label > span {
		color: #a9acbb;
		font-weight: 620;
	}
	.range-control > span {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.range-control b {
		color: #c9cbd6;
		font-weight: 620;
	}
	output {
		color: #b8ff3d;
		font: 0.69rem/1.2 var(--font-mono, monospace);
	}
	small,
	.world-note {
		margin: 0;
		color: #898c9f;
		font-size: 0.69rem;
	}
	select {
		width: 100%;
		min-height: 2.75rem;
		padding: 0.5rem 2rem 0.5rem 0.6rem;
		border: 1px solid rgb(255 255 255 / 14%);
		border-radius: 0.5rem;
		background: #0b0c17;
		color: white;
		text-transform: capitalize;
	}
	input[type='range'] {
		width: 100%;
		min-height: 1.65rem;
		accent-color: #b8ff3d;
		cursor: pointer;
	}
	fieldset {
		margin: 0;
		padding: 0.75rem;
		border: 1px solid rgb(255 255 255 / 9%);
		border-radius: 0.55rem;
	}
	legend {
		padding-inline: 0.3rem;
		color: #a9acbb;
		font-weight: 620;
	}
	.lock-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
	}
	.lock-grid label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.5rem;
		text-transform: capitalize;
	}
	.lock-grid input {
		width: 1rem;
		height: 1rem;
		accent-color: #b8ff3d;
	}
	.inline-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	button,
	.file-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.55rem 0.78rem;
		border: 1px solid rgb(255 255 255 / 14%);
		border-radius: 0.5rem;
		background: rgb(255 255 255 / 5%);
		color: #e8eaf1;
		cursor: pointer;
		font: inherit;
	}
	button:hover,
	.file-button:hover {
		border-color: rgb(184 255 61 / 52%);
	}
	button.primary {
		border-color: rgb(184 255 61 / 55%);
		background: rgb(184 255 61 / 12%);
		color: #e5ffb5;
		font-weight: 720;
	}
	button.active {
		border-color: #d2a2ff;
		background: rgb(170 90 255 / 14%);
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}
	.file-button input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	@media (max-width: 48rem) {
		.control-grid,
		.select-grid {
			grid-template-columns: 1fr;
		}
		.lock-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (forced-colors: active) {
		details,
		select,
		fieldset,
		button,
		.file-button {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}
		output {
			color: LinkText;
		}
	}
</style>
