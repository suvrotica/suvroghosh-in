<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getPalette,
		isHexColor,
		MAX_PALETTE_STOPS,
		MIN_PALETTE_STOPS,
		normalizeHexColor,
		PALETTE_REGISTRY,
		samplePalette,
		validatePaletteStops
	} from '$lib/visualizations/fractal-atlas/palettes';
	import {
		cloneCustomMapRecipe,
		customMapSupportsDistanceEstimate
	} from '$lib/visualizations/fractal-atlas/custom-map';
	import type {
		ColoringMode,
		FractalViewState,
		OrbitTrapKind,
		OrbitTrapState,
		PaletteStop
	} from '$lib/visualizations/fractal-atlas/types';

	type Props = {
		state: FractalViewState;
		onchange: (next: FractalViewState) => void;
	};

	type ModeOption = {
		id: ColoringMode;
		label: string;
		description: string;
	};

	const ESCAPE_MODES: readonly ModeOption[] = [
		{
			id: 'binary',
			label: 'Binary status',
			description: 'Uses two treatments: escaped, and unresolved at the present iteration limit.'
		},
		{
			id: 'bands',
			label: 'Escape bands',
			description: 'Shows the integer iteration at which each orbit escaped.'
		},
		{
			id: 'smooth',
			label: 'Smooth escape',
			description:
				'Interpolates between escape counts to reduce artificial rings without changing the orbit test.'
		},
		{
			id: 'histogram',
			label: 'Histogram equalised',
			description:
				'Builds a bounded frame histogram and cumulative distribution, then spreads observed escape counts across the palette.'
		},
		{
			id: 'distance',
			label: 'Distance estimate',
			description:
				'Uses a derivative-based numerical estimate where the selected family supports one.'
		},
		{
			id: 'orbit-trap',
			label: 'Orbit trap',
			description:
				'Colours each pixel by the closest approach of its orbit to a chosen geometric trap.'
		}
	];

	const MODE_COPY: Readonly<Record<ColoringMode, ModeOption>> = Object.fromEntries(
		[
			...ESCAPE_MODES,
			{
				id: 'root-basin',
				label: 'Root basin',
				description:
					'Hue identifies the root reached; luminance records how quickly Newton’s method converged.'
			},
			{
				id: 'density',
				label: 'Orbit density',
				description:
					'Brightness records accumulated visits or points. It is a sampled count, not set membership.'
			}
		].map((option) => [option.id, option])
	) as Record<ColoringMode, ModeOption>;

	let { state: viewState, onchange }: Props = $props();
	let paletteMessage = $state('');
	let paletteTitle = $state('My field palette');
	let savedPalettes = $state<Array<{ id: string; title: string; stops: PaletteStop[] }>>([]);
	let interiorError = $state('');
	let stopErrors = $state<Record<number, string>>({});

	let selectedPalette = $derived(getPalette(viewState.paletteId));
	let customActive = $derived(Boolean(viewState.customPalette?.length));
	let editableStops = $derived(
		validatePaletteStops(viewState.customPalette ?? selectedPalette.stops, selectedPalette.stops)
			.stops
	);
	let activeStops = $derived(
		viewState.customPalette?.length ? editableStops : selectedPalette.stops
	);
	let activeGradient = $derived(gradientFor(activeStops));
	let modeOptions = $derived(optionsFor(viewState));
	let activeMode = $derived(
		modeOptions.find((option) => option.id === viewState.coloring) ?? modeOptions[0]
	);
	let modeFixed = $derived(modeOptions.length === 1);
	let paletteAffectsRenderer = $derived(viewState.family !== 'buddhabrot');

	const SAVED_PALETTES_KEY = 'fractal-atlas-palettes-v1';

	function optionsFor(next: FractalViewState): readonly ModeOption[] {
		if (next.family === 'newton') return [MODE_COPY['root-basin']];
		if (
			next.family === 'buddhabrot' ||
			next.family === 'barnsley-fern' ||
			next.family === 'sierpinski' ||
			next.plane === 'density'
		) {
			return [MODE_COPY.density];
		}
		if (next.family === 'l-system') return [MODE_COPY.bands];
		if (
			next.family === 'custom-map' &&
			!customMapSupportsDistanceEstimate(
				cloneCustomMapRecipe(next.customMap),
				next.plane === 'parameter' ? 'parameter' : 'dynamical'
			)
		) {
			return ESCAPE_MODES.filter((option) => option.id !== 'distance');
		}
		if (next.family === 'burning-ship' || next.family === 'tricorn' || next.family === 'phoenix') {
			return ESCAPE_MODES.filter((option) => option.id !== 'distance');
		}
		return ESCAPE_MODES;
	}

	function patch(changes: Partial<FractalViewState>) {
		onchange({ ...viewState, ...changes });
	}

	function setMode(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value as ColoringMode;
		if (modeOptions.some((option) => option.id === value)) patch({ coloring: value });
	}

	function selectPalette(paletteId: string) {
		paletteMessage = '';
		stopErrors = {};
		patch({ paletteId, customPalette: undefined });
	}

	function beginCustomPalette() {
		commitStops(activeStops.map((stop) => ({ ...stop })));
		paletteMessage = 'Custom copy created. Curated palettes remain unchanged.';
	}

	function restoreCuratedPalette() {
		paletteMessage = 'Returned to the selected curated palette.';
		stopErrors = {};
		patch({ customPalette: undefined });
	}

	function reversePalette() {
		const reversed = [...activeStops]
			.reverse()
			.map((stop) => ({ position: 1 - stop.position, color: stop.color }));
		commitStops(reversed);
		paletteMessage = 'The active colour ramp was reversed as a custom palette.';
	}

	function persistSavedPalettes(next: typeof savedPalettes) {
		savedPalettes = next.slice(-12);
		try {
			localStorage.setItem(SAVED_PALETTES_KEY, JSON.stringify(savedPalettes));
		} catch {
			paletteMessage = 'This browser could not save the palette locally.';
		}
	}

	function savePaletteLocally() {
		const title = paletteTitle.trim().slice(0, 60) || 'Untitled field palette';
		const record = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			title,
			stops: activeStops.map((stop) => ({ ...stop }))
		};
		persistSavedPalettes([...savedPalettes, record]);
		paletteMessage = `Saved “${title}” in this browser.`;
	}

	function loadSavedPalette(record: (typeof savedPalettes)[number]) {
		commitStops(record.stops);
		paletteTitle = record.title;
		paletteMessage = `Loaded “${record.title}”.`;
	}

	function removeSavedPalette(id: string) {
		persistSavedPalettes(savedPalettes.filter((palette) => palette.id !== id));
		paletteMessage = 'Removed the saved palette from this browser.';
	}

	function currentTrap(): OrbitTrapState {
		return (
			viewState.orbitTrap ?? {
				kind: 'point',
				position: { re: 0, im: 0 },
				radius: 0.5,
				spacing: 0.5,
				rotation: 0,
				mix: 1
			}
		);
	}

	function patchTrap(changes: Partial<OrbitTrapState>) {
		const trap = currentTrap();
		patch({
			orbitTrap: {
				...trap,
				...changes,
				position: changes.position ? { ...changes.position } : { ...trap.position }
			}
		});
	}

	function setTrapNumber(
		key: 'radius' | 'spacing' | 'mix',
		value: string,
		minimum: number,
		maximum: number
	) {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return;
		patchTrap({ [key]: Math.max(minimum, Math.min(maximum, parsed)) });
	}

	function setTrapCoordinate(key: 're' | 'im', value: string) {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return;
		const trap = currentTrap();
		patchTrap({ position: { ...trap.position, [key]: parsed } });
	}

	function commitStops(value: readonly PaletteStop[]) {
		const result = validatePaletteStops(value, selectedPalette.stops);
		paletteMessage = result.issues.join(' ');
		patch({ customPalette: result.stops.map((stop) => ({ ...stop })) });
	}

	function setStopColour(index: number, value: string) {
		if (!isHexColor(value.trim())) {
			stopErrors = {
				...stopErrors,
				[index]: 'Enter a six-digit hex colour such as #2B1D55.'
			};
			return;
		}
		const next = editableStops.map((stop) => ({ ...stop }));
		next[index] = { ...next[index], color: normalizeHexColor(value) };
		const remainingErrors = { ...stopErrors };
		delete remainingErrors[index];
		stopErrors = remainingErrors;
		commitStops(next);
	}

	function setStopPosition(index: number, value: string) {
		const position = Number(value);
		if (!Number.isFinite(position) || position < 0 || position > 1) {
			stopErrors = {
				...stopErrors,
				[index]: 'Stop position must be between 0 and 1.'
			};
			return;
		}
		const next = editableStops.map((stop) => ({ ...stop }));
		next[index] = { ...next[index], position };
		stopErrors = {};
		commitStops(next);
	}

	function addStop() {
		if (editableStops.length >= MAX_PALETTE_STOPS) return;
		let insertionIndex = 1;
		let widestGap = -1;
		for (let index = 1; index < editableStops.length; index += 1) {
			const gap = editableStops[index].position - editableStops[index - 1].position;
			if (gap > widestGap) {
				widestGap = gap;
				insertionIndex = index;
			}
		}
		const left = editableStops[insertionIndex - 1];
		const right = editableStops[insertionIndex];
		const position = (left.position + right.position) / 2;
		const next = editableStops.map((stop) => ({ ...stop }));
		next.splice(insertionIndex, 0, {
			position,
			color: samplePalette(editableStops, position)
		});
		stopErrors = {};
		commitStops(next);
	}

	function removeStop(index: number) {
		if (editableStops.length <= MIN_PALETTE_STOPS) return;
		stopErrors = {};
		commitStops(editableStops.filter((_, stopIndex) => stopIndex !== index));
	}

	function moveStop(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= editableStops.length) return;
		const positions = editableStops.map((stop) => stop.position);
		const next = editableStops.map((stop) => ({ ...stop }));
		const [moving] = next.splice(index, 1);
		next.splice(target, 0, moving);
		commitStops(
			next.map((stop, stopIndex) => ({
				...stop,
				position: positions[stopIndex]
			}))
		);
		stopErrors = {};
	}

	function setInteriorColour(value: string) {
		if (!isHexColor(value.trim())) {
			interiorError = 'Enter a six-digit hex colour such as #090B12.';
			return;
		}
		interiorError = '';
		patch({ interiorColor: normalizeHexColor(value) });
	}

	function setFiniteNumber(
		key: 'paletteCycles' | 'paletteOffset' | 'distanceLightStrength',
		value: string,
		minimum: number,
		maximum: number
	) {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return;
		patch({ [key]: Math.max(minimum, Math.min(maximum, parsed)) });
	}

	function gradientFor(stops: readonly PaletteStop[]) {
		return `linear-gradient(90deg, ${stops
			.map((stop) => `${normalizeHexColor(stop.color)} ${Math.round(stop.position * 1000) / 10}%`)
			.join(', ')})`;
	}

	onMount(() => {
		try {
			const raw = localStorage.getItem(SAVED_PALETTES_KEY);
			if (!raw) return;
			const candidate = JSON.parse(raw) as unknown;
			if (!Array.isArray(candidate)) return;
			savedPalettes = candidate.slice(-12).flatMap((item) => {
				if (!item || typeof item !== 'object') return [];
				const record = item as { id?: unknown; title?: unknown; stops?: unknown };
				if (
					typeof record.id !== 'string' ||
					typeof record.title !== 'string' ||
					!Array.isArray(record.stops)
				) {
					return [];
				}
				const validated = validatePaletteStops(record.stops as PaletteStop[]);
				return [
					{
						id: record.id.slice(0, 100),
						title: record.title.slice(0, 60),
						stops: validated.stops
					}
				];
			});
		} catch {
			savedPalettes = [];
		}
	});
</script>

<section class="palette-lab" aria-labelledby="palette-lab-heading">
	<header>
		<div>
			<p>Colour laboratory</p>
			<h3 id="palette-lab-heading">Evidence, then appearance</h3>
		</div>
		<span>{customActive ? 'custom palette' : selectedPalette.label}</span>
	</header>

	<div class="mode-block">
		<label>
			<span>Colouring method</span>
			<select
				value={activeMode.id}
				onchange={setMode}
				disabled={modeFixed}
				aria-describedby="colouring-method-help"
			>
				{#each modeOptions as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
		</label>
		<p id="colouring-method-help">
			{activeMode.description}
			{#if modeFixed}
				<strong>This encoding is fixed for the selected family.</strong>
			{/if}
		</p>
	</div>

	{#if paletteAffectsRenderer}
		<fieldset class="palette-fieldset">
			<legend>Curated palettes</legend>
			<div class="palette-grid">
				{#each PALETTE_REGISTRY as palette (palette.id)}
					<button
						type="button"
						class:selected={!customActive && viewState.paletteId === palette.id}
						aria-pressed={!customActive && viewState.paletteId === palette.id}
						aria-label={`Use ${palette.label} palette${palette.id === 'categorical-roots' ? ', categorical colours' : ''}`}
						onclick={() => selectPalette(palette.id)}
					>
						<i style:background={gradientFor(palette.stops)} aria-hidden="true"></i>
						<span>{palette.label}</span>
						{#if !customActive && viewState.paletteId === palette.id}<b aria-hidden="true">✓</b
							>{/if}
					</button>
				{/each}
			</div>
		</fieldset>

		<div
			class="preview"
			aria-label={`Current palette preview: ${customActive ? 'custom palette' : selectedPalette.label}`}
		>
			<i style:background={activeGradient}></i>
			<div>
				<span>low numerical value</span>
				<span>high numerical value</span>
			</div>
		</div>

		<div class="display-controls">
			<label class="colour-control">
				<span>Interior / unresolved</span>
				<span class="colour-input">
					<input
						type="color"
						value={viewState.interiorColor}
						aria-label="Interior or unresolved colour picker"
						oninput={(event) => setInteriorColour((event.currentTarget as HTMLInputElement).value)}
					/>
					<input
						type="text"
						value={viewState.interiorColor}
						inputmode="text"
						pattern="#[0-9A-Fa-f]{6}"
						maxlength="7"
						spellcheck="false"
						aria-label="Interior or unresolved six-digit hex colour"
						aria-invalid={Boolean(interiorError)}
						onchange={(event) => setInteriorColour((event.currentTarget as HTMLInputElement).value)}
					/>
				</span>
				{#if interiorError}<small class="error">{interiorError}</small>{/if}
			</label>

			<label>
				<span>Palette cycles <output>{viewState.paletteCycles.toFixed(2)}</output></span>
				<input
					type="range"
					min="0.25"
					max="16"
					step="0.25"
					value={viewState.paletteCycles}
					oninput={(event) =>
						setFiniteNumber(
							'paletteCycles',
							(event.currentTarget as HTMLInputElement).value,
							0.25,
							16
						)}
				/>
			</label>

			<label>
				<span>Palette offset <output>{viewState.paletteOffset.toFixed(2)}</output></span>
				<input
					type="range"
					min="-1"
					max="1"
					step="0.01"
					value={viewState.paletteOffset}
					oninput={(event) =>
						setFiniteNumber(
							'paletteOffset',
							(event.currentTarget as HTMLInputElement).value,
							-1,
							1
						)}
				/>
			</label>
		</div>

		{#if viewState.coloring === 'distance'}
			<fieldset class="distance-light-controls">
				<legend>Distance-relief light</legend>
				<label>
					<span>
						Light direction
						<output
							>{Math.round(
								((viewState.distanceLightAngle ?? -Math.PI / 4) * 180) / Math.PI
							)}°</output
						>
					</span>
					<input
						type="range"
						aria-label="Light direction"
						min="-180"
						max="180"
						step="1"
						value={((viewState.distanceLightAngle ?? -Math.PI / 4) * 180) / Math.PI}
						oninput={(event) => {
							const degrees = Number((event.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(degrees)) {
								patch({ distanceLightAngle: (degrees * Math.PI) / 180 });
							}
						}}
					/>
				</label>
				<label>
					<span>
						Light strength
						<output>{Math.round((viewState.distanceLightStrength ?? 0.72) * 100)}%</output>
					</span>
					<input
						type="range"
						aria-label="Light strength"
						min="0"
						max="1"
						step="0.01"
						value={viewState.distanceLightStrength ?? 0.72}
						oninput={(event) =>
							setFiniteNumber(
								'distanceLightStrength',
								(event.currentTarget as HTMLInputElement).value,
								0,
								1
							)}
					/>
				</label>
				<p>
					This changes only the directional relief applied to the derivative-based distance tone;
					the escape calculation and estimated distance stay fixed.
				</p>
			</fieldset>
		{/if}

		{#if viewState.coloring === 'orbit-trap'}
			<fieldset class="trap-controls">
				<legend>Orbit-trap geometry</legend>
				<label>
					<span>Geometry</span>
					<select
						value={currentTrap().kind}
						onchange={(event) =>
							patchTrap({
								kind: (event.currentTarget as HTMLSelectElement).value as OrbitTrapKind
							})}
					>
						<option value="point">Point</option>
						<option value="line">Line</option>
						<option value="circle">Circle</option>
						<option value="cross">Cross</option>
						<option value="grid">Grid</option>
					</select>
				</label>
				<label>
					<span>Position real</span>
					<input
						type="number"
						step="0.01"
						value={currentTrap().position.re}
						onchange={(event) =>
							setTrapCoordinate('re', (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				<label>
					<span>Position imaginary</span>
					<input
						type="number"
						step="0.01"
						value={currentTrap().position.im}
						onchange={(event) =>
							setTrapCoordinate('im', (event.currentTarget as HTMLInputElement).value)}
					/>
				</label>
				{#if currentTrap().kind === 'circle'}
					<label>
						<span>Circle radius</span>
						<input
							type="number"
							min="0"
							max="1000"
							step="0.01"
							value={currentTrap().radius}
							onchange={(event) =>
								setTrapNumber('radius', (event.currentTarget as HTMLInputElement).value, 0, 1000)}
						/>
					</label>
				{/if}
				{#if currentTrap().kind === 'grid'}
					<label>
						<span>Grid spacing</span>
						<input
							type="number"
							min="0.000001"
							max="1000"
							step="0.01"
							value={currentTrap().spacing}
							onchange={(event) =>
								setTrapNumber(
									'spacing',
									(event.currentTarget as HTMLInputElement).value,
									0.000001,
									1000
								)}
						/>
					</label>
				{/if}
				<label>
					<span
						>Rotation <output>{Math.round((currentTrap().rotation * 180) / Math.PI)}°</output></span
					>
					<input
						type="range"
						min="-180"
						max="180"
						step="1"
						value={(currentTrap().rotation * 180) / Math.PI}
						oninput={(event) => {
							const degrees = Number((event.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(degrees)) patchTrap({ rotation: (degrees * Math.PI) / 180 });
						}}
					/>
				</label>
				<label>
					<span>Trap mix <output>{currentTrap().mix.toFixed(2)}</output></span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={currentTrap().mix}
						oninput={(event) =>
							setTrapNumber('mix', (event.currentTarget as HTMLInputElement).value, 0, 1)}
					/>
				</label>
			</fieldset>
		{/if}

		<details class="custom-editor" open={customActive}>
			<summary>Custom palette editor</summary>
			<p>
				Two to eight validated hex stops are allowed. Position 0 is the beginning of the ramp;
				position 1 is the end.
			</p>

			{#if !customActive}
				<button class="custom-start" type="button" onclick={beginCustomPalette}>
					Make a custom copy of {selectedPalette.label}
				</button>
			{:else}
				<ol>
					{#each editableStops as stop, index (index)}
						<li>
							<div class="stop-number" aria-hidden="true">{index + 1}</div>
							<label>
								<span>Stop {index + 1} colour</span>
								<span class="colour-input">
									<input
										type="color"
										value={stop.color}
										aria-label={`Stop ${index + 1} colour picker`}
										oninput={(event) =>
											setStopColour(index, (event.currentTarget as HTMLInputElement).value)}
									/>
									<input
										type="text"
										value={stop.color}
										pattern="#[0-9A-Fa-f]{6}"
										maxlength="7"
										spellcheck="false"
										aria-label={`Stop ${index + 1} six-digit hex colour`}
										aria-invalid={Boolean(stopErrors[index])}
										onchange={(event) =>
											setStopColour(index, (event.currentTarget as HTMLInputElement).value)}
									/>
								</span>
							</label>
							<label class="position">
								<span>Position</span>
								<input
									type="number"
									min="0"
									max="1"
									step="0.01"
									value={stop.position}
									disabled={index === 0 || index === editableStops.length - 1}
									aria-label={`Stop ${index + 1} position from zero to one`}
									onchange={(event) =>
										setStopPosition(index, (event.currentTarget as HTMLInputElement).value)}
								/>
							</label>
							<div class="stop-actions">
								<button
									type="button"
									disabled={index === 0}
									aria-label={`Move stop ${index + 1} earlier`}
									onclick={() => moveStop(index, -1)}>←</button
								>
								<button
									type="button"
									disabled={index === editableStops.length - 1}
									aria-label={`Move stop ${index + 1} later`}
									onclick={() => moveStop(index, 1)}>→</button
								>
								<button
									type="button"
									disabled={editableStops.length <= MIN_PALETTE_STOPS}
									aria-label={`Remove stop ${index + 1}`}
									onclick={() => removeStop(index)}>Remove</button
								>
							</div>
							{#if stopErrors[index]}<small class="error">{stopErrors[index]}</small>{/if}
						</li>
					{/each}
				</ol>
				<div class="editor-actions">
					<button
						type="button"
						onclick={addStop}
						disabled={editableStops.length >= MAX_PALETTE_STOPS}
					>
						Add stop ({editableStops.length}/{MAX_PALETTE_STOPS})
					</button>
					<button type="button" onclick={reversePalette}>Reverse ramp</button>
					<button type="button" onclick={restoreCuratedPalette}>Use curated palette</button>
				</div>
			{/if}
			<div class="local-palette-save">
				<label>
					<span>Local palette title</span>
					<input type="text" maxlength="60" bind:value={paletteTitle} />
				</label>
				<button type="button" onclick={savePaletteLocally}>Save palette locally</button>
			</div>
			{#if savedPalettes.length}
				<ul class="saved-palettes" aria-label="Palettes saved in this browser">
					{#each savedPalettes as palette (palette.id)}
						<li>
							<button type="button" onclick={() => loadSavedPalette(palette)}>
								Load {palette.title}
							</button>
							<button
								type="button"
								aria-label={`Remove saved palette ${palette.title}`}
								onclick={() => removeSavedPalette(palette.id)}>Remove</button
							>
						</li>
					{/each}
				</ul>
			{/if}
			{#if paletteMessage}<p class="message" aria-live="polite">{paletteMessage}</p>{/if}
		</details>
	{:else}
		<div class="density-palette-note">
			<strong>Density channels use their own exposure map.</strong>
			The Buddhabrot Worker currently maps its iteration windows to fixed luminance or RGB channels; ordinary
			escape palettes are intentionally disabled here rather than shown as inert controls.
		</div>
	{/if}

	<aside aria-labelledby="palette-semantics-heading">
		<h4 id="palette-semantics-heading">What colour can—and cannot—say</h4>
		<p>
			The palette changes the display, not the orbit calculation. Cycles repeat the ramp; offset
			slides it. Neither adds mathematical detail.
		</p>
		<p>
			Luminance carries structure more reliably than hue alone. In Newton mode, distinct hues name
			roots while brightness records convergence speed. An interior colour means “not resolved as
			escaped here”, not a proof of eternal boundedness.
		</p>
	</aside>
</section>

<style>
	.palette-lab {
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 0.45rem;
		background: var(--atlas-panel, #11131b);
		padding: 0.9rem;
		color: var(--atlas-text, #f0ece3);
	}

	header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	header p {
		margin: 0;
		color: var(--atlas-brass, #d1a65d);
		font: 700 0.62rem/1.2 var(--font-sans);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0.25rem 0 0;
		font: 750 1.05rem/1.2 var(--font-sans);
	}

	header > span {
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 999px;
		padding: 0.28rem 0.5rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.58rem/1.2 var(--font-mono);
		white-space: nowrap;
	}

	.mode-block {
		display: grid;
		grid-template-columns: minmax(10rem, 0.75fr) minmax(0, 1.25fr);
		gap: 0.75rem;
		margin-top: 0.8rem;
		border-block: 1px solid var(--atlas-rule, #353846);
		padding-block: 0.7rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 650 0.63rem/1.3 var(--font-sans);
	}

	select,
	input[type='text'],
	input[type='number'] {
		box-sizing: border-box;
		width: 100%;
		min-height: 2.65rem;
		border: 1px solid #555968;
		border-radius: 0.3rem;
		background: #0b0d14;
		padding: 0.45rem 0.55rem;
		color: #f0ece3;
		font: 0.68rem/1.2 var(--font-mono);
	}

	select:disabled,
	input:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.mode-block p {
		align-self: center;
		margin: 0;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.68rem/1.45 var(--font-sans);
	}

	.mode-block strong {
		display: block;
		margin-top: 0.2rem;
		color: #d8bd85;
		font-weight: 650;
	}

	fieldset {
		min-width: 0;
		margin: 0.8rem 0 0;
		border: 0;
		padding: 0;
	}

	legend {
		margin-bottom: 0.45rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 700 0.62rem/1.2 var(--font-sans);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.palette-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.palette-grid button {
		position: relative;
		display: grid;
		gap: 0.35rem;
		min-height: 3.45rem;
		border: 1px solid #404351;
		border-radius: 0.34rem;
		background: #141620;
		padding: 0.38rem;
		color: #ded9cf;
		font: 620 0.6rem/1.2 var(--font-sans);
		text-align: left;
		cursor: pointer;
	}

	.palette-grid button:hover {
		border-color: #777b8d;
	}

	.palette-grid button.selected {
		border-color: var(--atlas-brass, #d1a65d);
		box-shadow: inset 0 0 0 1px var(--atlas-brass, #d1a65d);
	}

	.palette-grid button i {
		display: block;
		height: 0.72rem;
		border-radius: 999px;
	}

	.palette-grid button b {
		position: absolute;
		right: 0.32rem;
		bottom: 0.28rem;
		color: #f0ca78;
		font-size: 0.72rem;
	}

	.preview {
		margin-top: 0.7rem;
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 0.34rem;
		background: #090b11;
		padding: 0.45rem;
	}

	.preview > i {
		display: block;
		height: 1.2rem;
		border-radius: 0.18rem;
	}

	.preview div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.25rem;
		color: #8f91a0;
		font: 0.52rem/1.2 var(--font-mono);
	}

	.display-controls {
		display: grid;
		grid-template-columns: minmax(9rem, 1.2fr) 1fr 1fr;
		gap: 0.65rem;
		margin-top: 0.75rem;
	}

	.trap-controls,
	.distance-light-controls {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
		border-top: 1px solid var(--atlas-rule, #353846);
		padding-top: 0.75rem;
	}

	.distance-light-controls {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.distance-light-controls p {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--atlas-muted, #9b9aaa);
		font-size: 0.62rem;
		line-height: 1.5;
	}

	.display-controls label > span:first-child {
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
	}

	output {
		color: #eee8dc;
		font-family: var(--font-mono);
	}

	input[type='range'] {
		width: 100%;
		min-height: 2.3rem;
		margin: 0;
		accent-color: var(--atlas-brass, #d1a65d);
	}

	.colour-input {
		display: grid;
		grid-template-columns: 2.65rem minmax(0, 1fr);
		gap: 0.35rem;
	}

	input[type='color'] {
		box-sizing: border-box;
		width: 2.65rem;
		height: 2.65rem;
		border: 1px solid #555968;
		border-radius: 0.3rem;
		background: #0b0d14;
		padding: 0.2rem;
		cursor: pointer;
	}

	.custom-editor {
		margin-top: 0.8rem;
		border-top: 1px solid var(--atlas-rule, #353846);
		padding-top: 0.55rem;
	}

	summary {
		min-height: 2.5rem;
		color: #e6dfd3;
		font: 700 0.7rem/1.3 var(--font-sans);
		cursor: pointer;
	}

	.custom-editor > p {
		margin: 0 0 0.6rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.65rem/1.4 var(--font-sans);
	}

	.custom-editor ol {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.custom-editor li {
		display: grid;
		grid-template-columns: 1.8rem minmax(10rem, 1fr) minmax(5rem, 0.45fr) auto;
		gap: 0.45rem;
		align-items: end;
		border: 1px solid #353846;
		border-radius: 0.34rem;
		background: #0d0f17;
		padding: 0.45rem;
	}

	.stop-number {
		display: grid;
		width: 1.65rem;
		height: 1.65rem;
		place-items: center;
		align-self: center;
		border: 1px solid #555968;
		border-radius: 50%;
		color: #d8bd85;
		font: 0.62rem/1 var(--font-mono);
	}

	.stop-actions {
		display: flex;
		gap: 0.25rem;
	}

	button {
		min-height: 2.65rem;
		border: 1px solid #555968;
		border-radius: 0.3rem;
		background: #171924;
		padding: 0.4rem 0.55rem;
		color: #eee9de;
		font: 650 0.62rem/1.2 var(--font-sans);
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.stop-actions button {
		min-width: 2.65rem;
		padding-inline: 0.4rem;
	}

	.editor-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.55rem;
	}

	.local-palette-save {
		display: grid;
		grid-template-columns: minmax(10rem, 1fr) auto;
		gap: 0.5rem;
		align-items: end;
		margin-top: 0.65rem;
	}

	.saved-palettes {
		display: grid;
		gap: 0.35rem;
		margin: 0.55rem 0 0;
		padding: 0;
		list-style: none;
	}

	.saved-palettes li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.35rem;
	}

	.saved-palettes button:first-child {
		overflow: hidden;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.density-palette-note {
		margin-top: 0.8rem;
		border: 1px solid var(--atlas-rule, #353846);
		border-radius: 0.34rem;
		background: #0b0d14;
		padding: 0.7rem;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.67rem/1.45 var(--font-sans);
	}

	.density-palette-note strong {
		display: block;
		margin-bottom: 0.2rem;
		color: #e7d8b7;
	}

	.custom-start {
		width: 100%;
	}

	.error {
		grid-column: 2 / -1;
		color: #f0a093;
		font: 0.6rem/1.35 var(--font-sans);
	}

	.message {
		margin-top: 0.5rem !important;
		border-left: 2px solid #6fae98;
		padding-left: 0.55rem;
		color: #a9d7c5 !important;
	}

	aside {
		margin-top: 0.8rem;
		border-left: 3px solid var(--atlas-brass, #d1a65d);
		background: #0b0d14;
		padding: 0.65rem 0.72rem;
	}

	h4 {
		margin: 0;
		color: #e9dfcc;
		font: 720 0.7rem/1.25 var(--font-sans);
	}

	aside p {
		margin: 0.35rem 0 0;
		color: var(--atlas-muted, #aaa6b5);
		font: 0.65rem/1.45 var(--font-sans);
	}

	select:focus-visible,
	input:focus-visible,
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid #f0c870;
		outline-offset: 2px;
	}

	@media (max-width: 46rem) {
		.palette-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.display-controls {
			grid-template-columns: 1fr 1fr;
		}

		.trap-controls,
		.distance-light-controls {
			grid-template-columns: 1fr 1fr;
		}

		.colour-control {
			grid-column: 1 / -1;
		}

		.custom-editor li {
			grid-template-columns: 1.8rem minmax(0, 1fr) minmax(5rem, 0.4fr);
		}

		.stop-actions,
		.error {
			grid-column: 2 / -1;
		}
	}

	@media (max-width: 30rem) {
		header,
		.mode-block {
			grid-template-columns: 1fr;
		}

		header {
			display: grid;
		}

		header > span {
			justify-self: start;
		}

		.palette-grid,
		.display-controls,
		.trap-controls,
		.distance-light-controls,
		.local-palette-save {
			grid-template-columns: 1fr;
		}

		.colour-control {
			grid-column: auto;
		}

		.custom-editor li {
			grid-template-columns: 1.8rem minmax(0, 1fr);
		}

		.position {
			grid-column: 2;
		}
	}

	@media (forced-colors: active) {
		.palette-lab,
		.palette-grid button,
		.custom-editor li,
		.preview {
			border-color: CanvasText;
			background: Canvas;
			color: CanvasText;
		}

		.palette-grid button.selected {
			outline: 3px solid Highlight;
			box-shadow: none;
		}
	}
</style>
