<script lang="ts">
	import ColorPalette from './ColorPalette.svelte';
	import { PIGMENTS } from '$lib/visualizations/living-pigment/colors';
	import { BRUSHES } from '$lib/visualizations/living-pigment/presets';
	import type {
		ArtMode,
		BackgroundMode,
		BackgroundSettings,
		ColorHarmony,
		ColorMode,
		PhysicsOverlay,
		QualityLevel,
		SimulationSettings,
		StudioPreset
	} from '$lib/visualizations/living-pigment/types';

	type Props = {
		settings: SimulationSettings;
		presets: readonly StudioPreset[];
		customColor: string;
		recentColors: string[];
		onsettings: (next: SimulationSettings) => void;
		oncustomcolor: (hex: string) => void;
		onpreset: (id: string) => void;
		onrandompalette: () => void;
		onsurprise: () => void;
		onnewbackground: () => void;
		onresetcontrols: () => void;
	};

	let {
		settings,
		presets,
		customColor,
		recentColors,
		onsettings,
		oncustomcolor,
		onpreset,
		onrandompalette,
		onsurprise,
		onnewbackground,
		onresetcontrols
	}: Props = $props();

	const uid = $props.id();
	const modeOptions: readonly { value: ArtMode; label: string }[] = [
		{ value: 'watercolor', label: 'Watercolor' },
		{ value: 'oil', label: 'Oil paint' },
		{ value: 'hybrid', label: 'Living pigment' }
	];
	const colorModeOptions: readonly { value: ColorMode; label: string }[] = [
		{ value: 'single', label: 'Single pigment' },
		{ value: 'gradient', label: 'Two-pigment gradient' },
		{ value: 'controlled-random', label: 'Controlled random' },
		{ value: 'shuffle', label: 'Palette shuffle' }
	];
	const backgroundOptions: readonly { value: BackgroundMode; label: string }[] = [
		{ value: 'clean', label: 'Clean paper' },
		{ value: 'handmade', label: 'Handmade paper' },
		{ value: 'canvas', label: 'Canvas' },
		{ value: 'wet-field', label: 'Wet field' },
		{ value: 'pigment-cloud', label: 'Pigment cloud' },
		{ value: 'atmospheric-wash', label: 'Atmospheric wash' },
		{ value: 'random-pigments', label: 'Random evolving pigments' },
		{ value: 'dark-ground', label: 'Dark ground' },
		{ value: 'custom', label: 'Custom ground color' }
	];
	const harmonyOptions: readonly { value: ColorHarmony; label: string }[] = [
		{ value: 'analogous', label: 'Neighboring colors' },
		{ value: 'earth', label: 'Earth colors' },
		{ value: 'monsoon', label: 'Monsoon greys' },
		{ value: 'complementary', label: 'Muted complements' },
		{ value: 'quiet', label: 'Quiet neutral' }
	];
	const qualityOptions: readonly { value: QualityLevel; label: string }[] = [
		{ value: 'low', label: 'Low · battery saver' },
		{ value: 'medium', label: 'Medium · balanced' },
		{ value: 'high', label: 'High · detailed' }
	];
	const overlayOptions: readonly { value: PhysicsOverlay; label: string }[] = [
		{ value: 'artwork', label: 'Artwork' },
		{ value: 'moisture', label: 'Moisture' },
		{ value: 'pigment', label: 'Mobile pigment' },
		{ value: 'velocity', label: 'Flow velocity' },
		{ value: 'drying', label: 'Drying state' },
		{ value: 'grain', label: 'Paper grain' },
		{ value: 'deposited', label: 'Deposited pigment' }
	];

	let selectedBrush = $derived(BRUSHES.find((brush) => brush.id === settings.brush) ?? BRUSHES[0]);
	let validRecentColors = $derived.by(() =>
		[...new Set(recentColors.filter((color) => /^#[0-9a-f]{6}$/i.test(color)))].slice(0, 8)
	);

	function patchSettings(patch: Partial<Omit<SimulationSettings, 'background'>>) {
		onsettings({
			...settings,
			...patch,
			paletteIds: patch.paletteIds ? [...patch.paletteIds] : [...settings.paletteIds],
			background: { ...settings.background }
		});
	}

	function patchBackground(patch: Partial<BackgroundSettings>) {
		onsettings({
			...settings,
			paletteIds: [...settings.paletteIds],
			background: { ...settings.background, ...patch }
		});
	}

	function inputValue(event: Event) {
		return (event.currentTarget as HTMLInputElement).value;
	}

	function selectValue(event: Event) {
		return (event.currentTarget as HTMLSelectElement).value;
	}

	function numericValue(event: Event) {
		return Number((event.currentTarget as HTMLInputElement).value);
	}

	function percent(value: number) {
		return `${Math.round(value * 100)}%`;
	}

	function selectPreset(event: Event) {
		const select = event.currentTarget as HTMLSelectElement;
		if (select.value) onpreset(select.value);
		select.value = '';
	}

	function togglePalettePigment(id: string) {
		const included = settings.paletteIds.includes(id);
		const paletteIds = included
			? settings.paletteIds.filter((candidate) => candidate !== id)
			: [...settings.paletteIds, id];
		if (paletteIds.length > 0) patchSettings({ paletteIds });
	}

	function useCustomColor(hex: string) {
		oncustomcolor(hex);
		patchSettings({ primaryPigmentId: 'custom' });
	}
</script>

<section class="studio-controls" aria-labelledby={`${uid}-heading`}>
	<header class="controls-header">
		<div>
			<p class="controls-kicker">Studio controls</p>
			<h3 id={`${uid}-heading`}>Shape the living pigment</h3>
		</div>
		<button type="button" class="action-button surprise" onclick={onsurprise}>Surprise me</button>
	</header>

	<details class="control-section" open>
		<summary>
			<span>Start painting</span>
			<small>Mode, preset, and brush</small>
		</summary>
		<div class="section-body">
			<label class="control-label" for={`${uid}-preset`}>
				<span>Studio preset</span>
				<select id={`${uid}-preset`} value="" onchange={selectPreset}>
					<option value="">Choose a tested starting point…</option>
					{#each presets as preset (preset.id)}
						<option value={preset.id}>{preset.name}</option>
					{/each}
				</select>
				<small>Presets coordinate paint behavior, palette, and the starting surface.</small>
			</label>

			<label class="control-label" for={`${uid}-mode`}>
				<span>Art mode</span>
				<select
					id={`${uid}-mode`}
					value={settings.mode}
					onchange={(event) => patchSettings({ mode: selectValue(event) as ArtMode })}
				>
					{#each modeOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<small>Watercolor spreads; oil drags; Living Pigment combines both.</small>
			</label>

			<label class="control-label" for={`${uid}-brush`}>
				<span>Brush</span>
				<select
					id={`${uid}-brush`}
					value={settings.brush}
					onchange={(event) =>
						patchSettings({ brush: selectValue(event) as SimulationSettings['brush'] })}
				>
					{#each BRUSHES as brush (brush.id)}
						<option value={brush.id}>{brush.name}</option>
					{/each}
				</select>
				<small>{selectedBrush.description}</small>
			</label>

			<label class="range-control" for={`${uid}-brush-size`}>
				<span class="range-heading">
					<span>Brush size</span>
					<output for={`${uid}-brush-size`}>{Math.round(settings.brushSize)} px</output>
				</span>
				<input
					id={`${uid}-brush-size`}
					type="range"
					min="4"
					max="140"
					step="1"
					value={settings.brushSize}
					oninput={(event) => patchSettings({ brushSize: numericValue(event) })}
				/>
				<small>Larger footprints make broad washes and knife marks.</small>
			</label>

			<label class="control-label" for={`${uid}-color-mode`}>
				<span>Color behavior</span>
				<select
					id={`${uid}-color-mode`}
					value={settings.colorMode}
					onchange={(event) => patchSettings({ colorMode: selectValue(event) as ColorMode })}
				>
					{#each colorModeOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<small>Random modes stay inside the checked pigment palette.</small>
			</label>
		</div>
	</details>

	<details class="control-section">
		<summary>
			<span>Colors and palette</span>
			<small>Named pigments, custom colors, and recent choices</small>
		</summary>
		<div class="section-body">
			<ColorPalette
				selectedId={settings.primaryPigmentId}
				paletteIds={settings.paletteIds}
				onselect={(id) => patchSettings({ primaryPigmentId: id })}
				ontoggle={togglePalettePigment}
			/>

			<label class="control-label" for={`${uid}-secondary-pigment`}>
				<span>Second pigment</span>
				<select
					id={`${uid}-secondary-pigment`}
					value={settings.secondaryPigmentId}
					onchange={(event) => patchSettings({ secondaryPigmentId: selectValue(event) })}
				>
					{#each PIGMENTS as pigment (pigment.id)}
						<option value={pigment.id}>{pigment.name}</option>
					{/each}
				</select>
				<small>Used by the two-pigment gradient and compatible presets.</small>
			</label>

			<div class="custom-color-block">
				<label for={`${uid}-custom-color`}>
					<span>Custom pigment</span>
					<span class="color-input-row">
						<input
							id={`${uid}-custom-color`}
							type="color"
							value={customColor}
							oninput={(event) => useCustomColor(inputValue(event))}
						/>
						<output for={`${uid}-custom-color`}>{customColor.toUpperCase()}</output>
						<span class="selection-label">
							{settings.primaryPigmentId === 'custom' ? '✓ Selected' : 'Choose a color'}
						</span>
					</span>
				</label>
				<p>Changing this picker selects a neutral-behavior custom pigment.</p>
			</div>

			{#if validRecentColors.length > 0}
				<fieldset class="recent-colors">
					<legend>Recent colors</legend>
					<div>
						{#each validRecentColors as color (color)}
							<button
								type="button"
								onclick={() => useCustomColor(color)}
								aria-pressed={settings.primaryPigmentId === 'custom' &&
									customColor.toLowerCase() === color.toLowerCase()}
								class="recent-color"
							>
								<span style={`background-color: ${color}`} aria-hidden="true"></span>
								<small>{color.toUpperCase()}</small>
							</button>
						{/each}
					</div>
				</fieldset>
			{/if}

			<button type="button" class="action-button wide" onclick={onrandompalette}>
				Random palette
			</button>
		</div>
	</details>

	<details class="control-section">
		<summary>
			<span>Paint and correction</span>
			<small>Load, transparency, lifting, and clearing</small>
		</summary>
		<div class="section-body">
			<label class="range-control" for={`${uid}-pigment-amount`}>
				<span class="range-heading">
					<span>Pigment load</span>
					<output for={`${uid}-pigment-amount`}>{percent(settings.pigmentAmount)}</output>
				</span>
				<input
					id={`${uid}-pigment-amount`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.pigmentAmount}
					oninput={(event) => patchSettings({ pigmentAmount: numericValue(event) })}
				/>
				<small>How much colored material enters each stroke.</small>
			</label>

			<label class="range-control" for={`${uid}-transparency`}>
				<span class="range-heading">
					<span>Transparency</span>
					<output for={`${uid}-transparency`}>{percent(settings.transparency)}</output>
				</span>
				<input
					id={`${uid}-transparency`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.transparency}
					oninput={(event) => patchSettings({ transparency: numericValue(event) })}
				/>
				<small>Higher values reveal more of the surface below.</small>
			</label>

			<label class="range-control" for={`${uid}-eraser-strength`}>
				<span class="range-heading">
					<span>Correction strength</span>
					<output for={`${uid}-eraser-strength`}>{percent(settings.eraserStrength)}</output>
				</span>
				<input
					id={`${uid}-eraser-strength`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.eraserStrength}
					oninput={(event) => patchSettings({ eraserStrength: numericValue(event) })}
				/>
				<small>Controls how much the lifter or true-clear tool removes.</small>
			</label>

			<label class="range-control" for={`${uid}-eraser-softness`}>
				<span class="range-heading">
					<span>Correction softness</span>
					<output for={`${uid}-eraser-softness`}>{percent(settings.eraserSoftness)}</output>
				</span>
				<input
					id={`${uid}-eraser-softness`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.eraserSoftness}
					oninput={(event) => patchSettings({ eraserSoftness: numericValue(event) })}
				/>
				<small>Soft edges make corrections blend into neighboring pigment.</small>
			</label>

			<label class="check-control" for={`${uid}-wet-lifting`}>
				<input
					id={`${uid}-wet-lifting`}
					type="checkbox"
					checked={settings.wetLifting}
					onchange={(event) =>
						patchSettings({ wetLifting: (event.currentTarget as HTMLInputElement).checked })}
				/>
				<span>
					<strong>Wet lifting</strong>
					<small>Add a little water while lifting so nearby pigment can move again.</small>
				</span>
			</label>
		</div>
	</details>

	<details class="control-section">
		<summary>
			<span>Flow, mixing, and drying</span>
			<small>The material response after a stroke</small>
		</summary>
		<div class="section-body two-column-controls">
			<label class="range-control" for={`${uid}-water`}>
				<span class="range-heading"
					><span>Water or solvent</span><output for={`${uid}-water`}
						>{percent(settings.waterAmount)}</output
					></span
				>
				<input
					id={`${uid}-water`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.waterAmount}
					oninput={(event) => patchSettings({ waterAmount: numericValue(event) })}
				/>
				<small>More liquid increases mobility and blooming.</small>
			</label>

			<label class="range-control" for={`${uid}-diffusion`}>
				<span class="range-heading"
					><span>Diffusion</span><output for={`${uid}-diffusion`}
						>{percent(settings.diffusion)}</output
					></span
				>
				<input
					id={`${uid}-diffusion`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.diffusion}
					oninput={(event) => patchSettings({ diffusion: numericValue(event) })}
				/>
				<small>How readily pigment crosses into nearby wet cells.</small>
			</label>

			<label class="range-control" for={`${uid}-surface-moisture`}>
				<span class="range-heading"
					><span>Surface moisture</span><output for={`${uid}-surface-moisture`}
						>{percent(settings.surfaceMoisture)}</output
					></span
				>
				<input
					id={`${uid}-surface-moisture`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.surfaceMoisture}
					oninput={(event) => patchSettings({ surfaceMoisture: numericValue(event) })}
				/>
				<small>The global dampness added around locally wet strokes.</small>
			</label>

			<label class="range-control" for={`${uid}-drying`}>
				<span class="range-heading"
					><span>Drying speed</span><output for={`${uid}-drying`}
						>{percent(settings.dryingSpeed)}</output
					></span
				>
				<input
					id={`${uid}-drying`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.dryingSpeed}
					oninput={(event) => patchSettings({ dryingSpeed: numericValue(event) })}
				/>
				<small>Faster drying fixes mobile pigment sooner.</small>
			</label>

			<label class="range-control" for={`${uid}-viscosity`}>
				<span class="range-heading"
					><span>Viscosity</span><output for={`${uid}-viscosity`}
						>{percent(settings.viscosity)}</output
					></span
				>
				<input
					id={`${uid}-viscosity`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.viscosity}
					oninput={(event) => patchSettings({ viscosity: numericValue(event) })}
				/>
				<small>Thicker paint resists spreading and keeps dragged ridges.</small>
			</label>

			<label class="range-control" for={`${uid}-flow`}>
				<span class="range-heading"
					><span>Flow strength</span><output for={`${uid}-flow`}
						>{percent(settings.flowStrength)}</output
					></span
				>
				<input
					id={`${uid}-flow`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.flowStrength}
					oninput={(event) => patchSettings({ flowStrength: numericValue(event) })}
				/>
				<small>How strongly stroke direction carries nearby pigment.</small>
			</label>

			<label class="range-control" for={`${uid}-turbulence`}>
				<span class="range-heading"
					><span>Turbulence</span><output for={`${uid}-turbulence`}
						>{percent(settings.turbulence)}</output
					></span
				>
				<input
					id={`${uid}-turbulence`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.turbulence}
					oninput={(event) => patchSettings({ turbulence: numericValue(event) })}
				/>
				<small>Adds restrained local eddies instead of random noise.</small>
			</label>

			<label class="range-control" for={`${uid}-granulation`}>
				<span class="range-heading"
					><span>Granulation</span><output for={`${uid}-granulation`}
						>{percent(settings.granulation)}</output
					></span
				>
				<input
					id={`${uid}-granulation`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.granulation}
					oninput={(event) => patchSettings({ granulation: numericValue(event) })}
				/>
				<small>Settles heavy pigment into the surface grain.</small>
			</label>

			<label class="range-control" for={`${uid}-edge-darkening`}>
				<span class="range-heading"
					><span>Edge darkening</span><output for={`${uid}-edge-darkening`}
						>{percent(settings.edgeDarkening)}</output
					></span
				>
				<input
					id={`${uid}-edge-darkening`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.edgeDarkening}
					oninput={(event) => patchSettings({ edgeDarkening: numericValue(event) })}
				/>
				<small>Deposits more pigment near drying boundaries.</small>
			</label>

			<label class="range-control" for={`${uid}-mixing`}>
				<span class="range-heading"
					><span>Color mixing</span><output for={`${uid}-mixing`}
						>{percent(settings.mixingStrength)}</output
					></span
				>
				<input
					id={`${uid}-mixing`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.mixingStrength}
					oninput={(event) => patchSettings({ mixingStrength: numericValue(event) })}
				/>
				<small>Higher values merge neighboring pigments more readily.</small>
			</label>

			<label class="range-control" for={`${uid}-texture`}>
				<span class="range-heading"
					><span>Surface texture</span><output for={`${uid}-texture`}
						>{percent(settings.textureStrength)}</output
					></span
				>
				<input
					id={`${uid}-texture`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.textureStrength}
					oninput={(event) => patchSettings({ textureStrength: numericValue(event) })}
				/>
				<small>Strength of the paper tooth or canvas weave.</small>
			</label>

			<label class="range-control" for={`${uid}-simulation-speed`}>
				<span class="range-heading"
					><span>Simulation speed</span><output for={`${uid}-simulation-speed`}
						>{settings.simulationSpeed.toFixed(2)}×</output
					></span
				>
				<input
					id={`${uid}-simulation-speed`}
					type="range"
					min="0.1"
					max="3"
					step="0.05"
					value={settings.simulationSpeed}
					oninput={(event) => patchSettings({ simulationSpeed: numericValue(event) })}
				/>
				<small>Changes evolution speed without changing brush input.</small>
			</label>
		</div>
	</details>

	<details class="control-section">
		<summary>
			<span>Starting surface</span>
			<small>Seeded paper, canvas, and evolving backgrounds</small>
		</summary>
		<div class="section-body">
			<label class="control-label" for={`${uid}-background-mode`}>
				<span>Background mode</span>
				<select
					id={`${uid}-background-mode`}
					value={settings.background.mode}
					onchange={(event) => patchBackground({ mode: selectValue(event) as BackgroundMode })}
				>
					{#each backgroundOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<small>Seeds coherent moisture, pigment, and surface conditions.</small>
			</label>

			<label class="control-label" for={`${uid}-background-seed`}>
				<span>Background seed</span>
				<input
					id={`${uid}-background-seed`}
					type="number"
					min="0"
					max="4294967295"
					step="1"
					value={settings.background.seed}
					onchange={(event) => patchBackground({ seed: numericValue(event) })}
				/>
				<small>The same seed and settings recreate the same starting arrangement.</small>
			</label>

			<label class="range-control" for={`${uid}-regions`}>
				<span class="range-heading"
					><span>Pigment regions</span><output for={`${uid}-regions`}
						>{Math.round(settings.background.regions)}</output
					></span
				>
				<input
					id={`${uid}-regions`}
					type="range"
					min="1"
					max="12"
					step="1"
					value={settings.background.regions}
					oninput={(event) => patchBackground({ regions: numericValue(event) })}
				/>
				<small>How many broad areas organize an evolving background.</small>
			</label>

			<label class="control-label" for={`${uid}-harmony`}>
				<span>Color harmony</span>
				<select
					id={`${uid}-harmony`}
					value={settings.background.harmony}
					onchange={(event) => patchBackground({ harmony: selectValue(event) as ColorHarmony })}
				>
					{#each harmonyOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<small>Constrains the seeded background to a useful family of colors.</small>
			</label>

			<label class="range-control" for={`${uid}-background-moisture`}>
				<span class="range-heading"
					><span>Initial moisture</span><output for={`${uid}-background-moisture`}
						>{percent(settings.background.moisture)}</output
					></span
				>
				<input
					id={`${uid}-background-moisture`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.background.moisture}
					oninput={(event) => patchBackground({ moisture: numericValue(event) })}
				/>
				<small>Wet backgrounds begin moving and mixing immediately.</small>
			</label>

			<label class="range-control" for={`${uid}-background-turbulence`}>
				<span class="range-heading"
					><span>Initial turbulence</span><output for={`${uid}-background-turbulence`}
						>{percent(settings.background.turbulence)}</output
					></span
				>
				<input
					id={`${uid}-background-turbulence`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.background.turbulence}
					oninput={(event) => patchBackground({ turbulence: numericValue(event) })}
				/>
				<small>Sets the starting flow without changing later brush turbulence.</small>
			</label>

			<label class="range-control" for={`${uid}-background-scale`}>
				<span class="range-heading"
					><span>Background scale</span><output for={`${uid}-background-scale`}
						>{settings.background.scale.toFixed(2)}×</output
					></span
				>
				<input
					id={`${uid}-background-scale`}
					type="range"
					min="0.4"
					max="2.5"
					step="0.05"
					value={settings.background.scale}
					oninput={(event) => patchBackground({ scale: numericValue(event) })}
				/>
				<small>Moves between broad fields and smaller pigment islands.</small>
			</label>

			<label class="range-control" for={`${uid}-symmetry`}>
				<span class="range-heading"
					><span>Symmetry</span><output for={`${uid}-symmetry`}
						>{percent(settings.background.symmetry)}</output
					></span
				>
				<input
					id={`${uid}-symmetry`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.background.symmetry}
					oninput={(event) => patchBackground({ symmetry: numericValue(event) })}
				/>
				<small>Zero is freely asymmetric; higher values echo forms across the surface.</small>
			</label>

			<label class="range-control" for={`${uid}-background-intensity`}>
				<span class="range-heading"
					><span>Background intensity</span><output for={`${uid}-background-intensity`}
						>{percent(settings.background.intensity)}</output
					></span
				>
				<input
					id={`${uid}-background-intensity`}
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={settings.background.intensity}
					oninput={(event) => patchBackground({ intensity: numericValue(event) })}
				/>
				<small>Controls how strongly the starting field competes with new marks.</small>
			</label>

			<label class="control-label" for={`${uid}-background-color`}>
				<span>Custom background color</span>
				<span class="color-input-row">
					<input
						id={`${uid}-background-color`}
						type="color"
						value={settings.background.customColor}
						oninput={(event) => patchBackground({ customColor: inputValue(event) as `#${string}` })}
					/>
					<output for={`${uid}-background-color`}
						>{settings.background.customColor.toUpperCase()}</output
					>
				</span>
				<small>Used by Custom ground color and retained when another mode is selected.</small>
			</label>

			<button type="button" class="action-button wide" onclick={onnewbackground}>
				New evolving background
			</button>
		</div>
	</details>

	<details class="control-section">
		<summary>
			<span>View and performance</span>
			<small>Quality and educational field overlays</small>
		</summary>
		<div class="section-body">
			<label class="control-label" for={`${uid}-quality`}>
				<span>Simulation quality</span>
				<select
					id={`${uid}-quality`}
					value={settings.quality}
					onchange={(event) => patchSettings({ quality: selectValue(event) as QualityLevel })}
				>
					{#each qualityOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<small>Higher quality uses larger GPU textures and more battery.</small>
			</label>

			<label class="control-label" for={`${uid}-overlay`}>
				<span>See the physics</span>
				<select
					id={`${uid}-overlay`}
					value={settings.overlay}
					onchange={(event) => patchSettings({ overlay: selectValue(event) as PhysicsOverlay })}
				>
					{#each overlayOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<small>Diagnostic views never modify the artwork.</small>
			</label>
		</div>
	</details>

	<footer class="controls-footer">
		<button type="button" class="action-button wide" onclick={onresetcontrols}>
			Reset controls
		</button>
		<p>Resetting controls does not erase the artwork.</p>
	</footer>
</section>

<style>
	.studio-controls {
		container-type: inline-size;
		color-scheme: light;
		border: 1px solid #b9aa96;
		border-radius: 0.85rem;
		background: #eee6d9;
		color: #29241e;
		font-variant-numeric: tabular-nums;
	}

	.controls-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.9rem;
		border-bottom: 1px solid #c9bcaa;
		background: #e6dac9;
	}

	.controls-kicker,
	.controls-header h3,
	.controls-footer p,
	.custom-color-block p {
		margin: 0;
	}

	.controls-kicker {
		font-size: 0.63rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #705a43;
	}

	.controls-header h3 {
		margin-top: 0.15rem;
		font-size: 1rem;
		line-height: 1.2;
		color: #29241e;
	}

	.control-section {
		border-bottom: 1px solid #c9bcaa;
	}

	.control-section > summary {
		display: grid;
		min-height: 2.75rem;
		cursor: pointer;
		list-style: none;
		align-content: center;
		gap: 0.12rem;
		padding: 0.7rem 0.9rem;
		font-size: 0.78rem;
		font-weight: 800;
		color: #352d25;
	}

	.control-section > summary::-webkit-details-marker {
		display: none;
	}

	.control-section > summary::after {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		content: '+';
		font-size: 1.1rem;
		font-weight: 500;
		color: #705a43;
	}

	.control-section[open] > summary::after {
		content: '−';
	}

	.control-section > summary small {
		font-size: 0.65rem;
		font-weight: 500;
		line-height: 1.35;
		color: #74695d;
	}

	.section-body {
		display: grid;
		gap: 1rem;
		border-top: 1px solid #d5c9b9;
		padding: 0.9rem;
		background: #f7f1e8;
	}

	.control-label,
	.range-control,
	.custom-color-block > label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.75rem;
		font-weight: 750;
		color: #352d25;
	}

	.control-label > small,
	.range-control > small,
	.custom-color-block p {
		font-size: 0.66rem;
		font-weight: 450;
		line-height: 1.45;
		color: #74695d;
	}

	.control-label select,
	.control-label input[type='number'] {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid #ac9c87;
		border-radius: 0.5rem;
		background: #fffaf2;
		padding: 0.5rem 0.65rem;
		font-size: 0.76rem;
		color: #29241e;
	}

	.range-heading,
	.color-input-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.range-heading output,
	.color-input-row output {
		font-family: ui-monospace, monospace;
		font-size: 0.66rem;
		font-weight: 700;
		color: #705a43;
	}

	.range-control input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		cursor: pointer;
		accent-color: #594737;
	}

	.check-control {
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr);
		align-items: start;
		gap: 0.65rem;
		min-height: 2.75rem;
		border: 1px solid #c9bcaa;
		border-radius: 0.6rem;
		background: #fffaf2;
		padding: 0.7rem;
	}

	.check-control input {
		width: 1.15rem;
		height: 1.15rem;
		margin-top: 0.1rem;
		accent-color: #594737;
	}

	.check-control strong,
	.check-control small {
		display: block;
	}

	.check-control strong {
		font-size: 0.75rem;
	}

	.check-control small {
		margin-top: 0.18rem;
		font-size: 0.66rem;
		line-height: 1.4;
		color: #74695d;
	}

	.color-input-row input[type='color'] {
		width: 3.25rem;
		height: 2.75rem;
		border: 1px solid #ac9c87;
		border-radius: 0.5rem;
		background: #fffaf2;
		padding: 0.2rem;
		cursor: pointer;
	}

	.selection-label {
		font-size: 0.64rem;
		font-weight: 800;
		color: #594737;
	}

	.custom-color-block {
		display: grid;
		gap: 0.35rem;
	}

	.recent-colors {
		margin: 0;
		border: 0;
		padding: 0;
	}

	.recent-colors legend {
		margin-bottom: 0.45rem;
		font-size: 0.72rem;
		font-weight: 800;
		color: #352d25;
	}

	.recent-colors > div {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.recent-color {
		display: grid;
		min-height: 3.3rem;
		place-items: center;
		gap: 0.15rem;
		border: 1px solid #c0b19e;
		border-radius: 0.5rem;
		background: #fffaf2;
		padding: 0.3rem;
		color: #5c5147;
		cursor: pointer;
	}

	.recent-color[aria-pressed='true'] {
		border: 2px solid #29241e;
		box-shadow: inset 0 0 0 1px #fffaf2;
	}

	.recent-color > span {
		width: 1.5rem;
		height: 1.5rem;
		border: 1px solid rgb(0 0 0 / 20%);
		border-radius: 999px;
	}

	.recent-color small {
		font-family: ui-monospace, monospace;
		font-size: 0.54rem;
	}

	.action-button {
		min-height: 2.75rem;
		border: 1px solid #8c7963;
		border-radius: 0.55rem;
		background: #fffaf2;
		padding: 0.5rem 0.75rem;
		font-size: 0.72rem;
		font-weight: 800;
		color: #352d25;
		cursor: pointer;
	}

	.action-button:hover {
		background: #ded0bd;
	}

	.action-button.surprise {
		border-color: #594737;
		background: #594737;
		color: #fffaf2;
	}

	.action-button.wide {
		width: 100%;
	}

	.controls-footer {
		display: grid;
		gap: 0.4rem;
		padding: 0.9rem;
	}

	.controls-footer p {
		font-size: 0.64rem;
		text-align: center;
		color: #74695d;
	}

	@container (min-width: 40rem) {
		.two-column-controls {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.action-button,
		.control-section > summary {
			transition: none;
		}
	}
</style>
