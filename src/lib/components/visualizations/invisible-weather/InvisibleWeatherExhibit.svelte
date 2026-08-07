<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import ArtworkInspector from './ArtworkInspector.svelte';
	import ExportMenu from './ExportMenu.svelte';
	import GalleryControls from './GalleryControls.svelte';
	import InvisibleWeatherCanvas from './InvisibleWeatherCanvas.svelte';
	import {
		DEFAULT_GALLERY_STATE,
		PALETTES,
		PRESETS,
		createExhibitionRecipe,
		createJsonExport,
		normalizeGalleryState,
		parseInvisibleWeatherState,
		serializeInvisibleWeatherState,
		stateForPreset,
		type GalleryState
	} from '$lib/visualizations/invisible-weather';

	const uid = $props.id();
	const namespacedKeys = new Set([
		'iw_v',
		'iw_seed',
		'iw_preset',
		'iw_layout',
		'iw_count',
		'iw_palette',
		'iw_noise',
		'iw_depth',
		'iw_freq',
		'iw_warp',
		'iw_angle',
		'iw_soft',
		'iw_threshold',
		'iw_band',
		'iw_motion',
		'iw_phase',
		'iw_frozen',
		'iw_selected',
		'iw_density',
		'iw_length',
		'iw_multiplier',
		'iw_turns',
		'iw_stroke',
		'iw_dual',
		'iw_grain',
		'iw_shadow',
		'iw_frame',
		'iw_orientation',
		'iw_speed'
	]);

	let exhibit: HTMLElement;
	let canvas: InvisibleWeatherCanvas;
	let focusCloseButton = $state<HTMLButtonElement>();
	let previousFocus: HTMLElement | null = null;
	let galleryState: GalleryState = $state({ ...DEFAULT_GALLERY_STATE });
	let paused = $state(false);
	let focusIndex = $state<number | null>(null);
	let canvasStatus = $state<'loading' | 'ready' | 'error'>('loading');
	let statusMessage = $state('Preparing the weather field…');
	let posterMode = $state(false);
	let mounted = $state(false);
	let latestPhase = $state(0);
	let allowMotionOverride = $state(false);
	let systemMotionBlocked = $state(false);
	let recipe = $derived(createExhibitionRecipe(galleryState));
	let focusedArtwork = $derived(
		recipe.artworks[galleryState.selectedArtwork] ?? recipe.artworks[0]
	);
	let currentPreset = $derived(
		PRESETS.find((preset) => preset.id === galleryState.presetId) ?? PRESETS[0]
	);
	let motionLabel = $derived(
		paused || galleryState.motion === 'still' || (systemMotionBlocked && !allowMotionOverride)
			? 'Still'
			: galleryState.motion === 'migrate'
				? 'Migrating'
				: 'Breathing'
	);

	function isTypingTarget(target: EventTarget | null) {
		return (
			target instanceof Element &&
			Boolean(
				target.closest('input, select, textarea, [contenteditable="true"], [contenteditable=""]')
			)
		);
	}

	function isButtonActivation(event: KeyboardEvent) {
		return (
			(event.key === ' ' || event.key === 'Enter') &&
			event.target instanceof Element &&
			Boolean(event.target.closest('button, summary'))
		);
	}

	function compactSeed(seed: string) {
		return seed.length > 28 ? `${seed.slice(0, 25)}…` : seed;
	}

	function safeSeed(seed: string) {
		return (
			seed
				.toLocaleLowerCase('en')
				.replace(/[^a-z0-9._-]+/gu, '-')
				.replace(/^-+|-+$/gu, '')
				.slice(0, 64) || 'weather'
		);
	}

	function structuralPatch(patch: Partial<GalleryState>) {
		return Object.keys(patch).some(
			(key) => !['selectedArtwork', 'motion', 'speed', 'phase', 'frozenPhase'].includes(key)
		);
	}

	function updateState(patch: Partial<GalleryState>) {
		if ('motion' in patch) allowMotionOverride = patch.motion !== 'still';
		const next = { ...galleryState, ...patch };
		if (structuralPatch(patch)) next.frozenPhase = null;
		galleryState = normalizeGalleryState(next);
		if ('motion' in patch && patch.motion !== 'still') paused = false;
		if (galleryState.layout === 'triptych' && galleryState.artworkCount !== 3) {
			galleryState = normalizeGalleryState({ ...galleryState, artworkCount: 3 });
		}
		statusMessage = structuralPatch(patch)
			? `Recipe updated. ${galleryState.artworkCount} works now share field ${galleryState.seed}.`
			: statusMessage;
	}

	function applyPreset(id: string) {
		galleryState = stateForPreset(id, galleryState.seed);
		paused = galleryState.motion === 'still';
		focusIndex = null;
		latestPhase = 0;
		canvas?.resetPhase(0);
		statusMessage = `${PRESETS.find((preset) => preset.id === id)?.name ?? 'Preset'} installed without changing the master seed.`;
	}

	function resetPreset() {
		applyPreset(galleryState.presetId);
		statusMessage = `${currentPreset.name} restored to its curated defaults.`;
	}

	function generatedSeed() {
		const bytes = new Uint32Array(2);
		crypto.getRandomValues(bytes);
		return `weather-${Date.now().toString(36)}-${bytes[0].toString(36)}${bytes[1].toString(36)}`;
	}

	function newExhibition() {
		galleryState = normalizeGalleryState({
			...stateForPreset(galleryState.presetId, generatedSeed()),
			motion: galleryState.motion,
			selectedArtwork: 0,
			phase: 0,
			frozenPhase: null
		});
		paused = galleryState.motion === 'still';
		focusIndex = null;
		latestPhase = 0;
		canvas?.resetPhase(0);
		statusMessage = `New exhibition generated from seed ${galleryState.seed}.`;
	}

	function replaySeed() {
		galleryState = normalizeGalleryState({
			...galleryState,
			selectedArtwork: 0,
			phase: 0,
			frozenPhase: null
		});
		paused = galleryState.motion === 'still';
		focusIndex = null;
		latestPhase = 0;
		canvas?.resetPhase(0);
		statusMessage = `Replaying seed ${galleryState.seed} from phase zero.`;
	}

	function togglePause() {
		if (galleryState.motion === 'still') {
			galleryState = normalizeGalleryState({
				...galleryState,
				motion: 'breathe',
				frozenPhase: null
			});
			allowMotionOverride = true;
			paused = false;
		} else if (systemMotionBlocked && !allowMotionOverride) {
			allowMotionOverride = true;
			paused = false;
		} else {
			paused = !paused;
		}
		statusMessage = paused ? 'Invisible weather paused.' : 'Invisible weather resumed.';
	}

	function selectArtwork(index: number) {
		const selected = Math.max(0, Math.min(recipe.artworks.length - 1, index));
		galleryState = normalizeGalleryState({ ...galleryState, selectedArtwork: selected });
		if (focusIndex !== null) focusIndex = selected;
		statusMessage = `Work ${String(selected + 1).padStart(2, '0')} selected.`;
	}

	async function openFocus() {
		if (recipe.artworks.length === 0) return;
		previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		focusIndex = galleryState.selectedArtwork;
		await tick();
		focusCloseButton?.focus({ preventScroll: true });
		statusMessage = `Focus view opened for work ${String(galleryState.selectedArtwork + 1).padStart(2, '0')}.`;
	}

	async function closeFocus() {
		if (focusIndex === null) return;
		focusIndex = null;
		await tick();
		(previousFocus ?? canvasElementFallback())?.focus({ preventScroll: true });
		statusMessage = 'Focus view closed.';
	}

	function canvasElementFallback() {
		canvas?.focusCanvas();
		return document.activeElement instanceof HTMLElement ? document.activeElement : null;
	}

	function previousArtwork() {
		selectArtwork((galleryState.selectedArtwork - 1 + recipe.artworkCount) % recipe.artworkCount);
	}

	function nextArtwork() {
		selectArtwork((galleryState.selectedArtwork + 1) % recipe.artworkCount);
	}

	function phaseNow() {
		return canvas?.getPhase() ?? latestPhase ?? galleryState.phase;
	}

	function frozenState(): GalleryState {
		const phase = phaseNow();
		return normalizeGalleryState({
			...galleryState,
			phase,
			frozenPhase: phase,
			motion: 'still'
		});
	}

	function permanentUrl(nextState: GalleryState) {
		const url = new SvelteURL(window.location.href);
		const serialized = serializeInvisibleWeatherState(nextState, url.searchParams);
		url.search = serialized.toString();
		return url;
	}

	function replacePermanentUrl(nextState: GalleryState) {
		const url = permanentUrl(nextState);
		window.history.replaceState(window.history.state, '', url);
		return url;
	}

	function freezeFrame() {
		galleryState = frozenState();
		allowMotionOverride = false;
		paused = true;
		canvas?.resetPhase(galleryState.frozenPhase ?? galleryState.phase);
		if (mounted) replacePermanentUrl(galleryState);
		statusMessage = `Frame frozen at phase ${(galleryState.frozenPhase ?? 0).toFixed(4)} and written into the permanent state.`;
	}

	async function copyText(text: string) {
		if (navigator.clipboard?.writeText) {
			try {
				await navigator.clipboard.writeText(text);
				return;
			} catch {
				// Fall through to the local selection-based copy path.
			}
		}
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.append(textarea);
		textarea.select();
		const copied = document.execCommand('copy');
		textarea.remove();
		if (!copied) throw new Error('The browser denied clipboard access.');
	}

	async function copyPermanentLink() {
		galleryState = frozenState();
		allowMotionOverride = false;
		paused = true;
		canvas?.resetPhase(galleryState.frozenPhase ?? galleryState.phase);
		const url = replacePermanentUrl(galleryState);
		try {
			await copyText(url.toString());
			statusMessage = `Permanent link copied at frozen phase ${(galleryState.frozenPhase ?? 0).toFixed(4)}.`;
		} catch {
			statusMessage =
				'This browser blocked clipboard access. The permanent state is now in the address bar for manual copying.';
		}
	}

	function downloadText(text: string, filename: string, type: string) {
		const blob = new Blob([text], { type });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	async function exportGallery(scale: 1 | 2 | 4) {
		const result = await canvas.exportPng(
			scale,
			false,
			`invisible-weather_${safeSeed(galleryState.seed)}_${galleryState.layout}`
		);
		statusMessage = result.clamped
			? `The requested export exceeded the safe browser budget; saved ${result.width} × ${result.height} instead.`
			: `Gallery PNG saved at ${result.width} × ${result.height}.`;
	}

	async function exportSelected() {
		const result = await canvas.exportPng(
			2,
			true,
			`invisible-weather_${safeSeed(galleryState.seed)}_work-${String(galleryState.selectedArtwork + 1).padStart(2, '0')}`
		);
		statusMessage = `Work ${String(galleryState.selectedArtwork + 1).padStart(2, '0')} saved at ${result.width} × ${result.height}.`;
	}

	function exportJson() {
		const frozen = normalizeGalleryState({ ...galleryState, phase: phaseNow() });
		const payload = createJsonExport(frozen, createExhibitionRecipe(frozen));
		downloadText(
			`${JSON.stringify(payload, null, 2)}\n`,
			`invisible-weather_${safeSeed(galleryState.seed)}_${galleryState.layout}_${recipe.recipeHash}.json`,
			'application/json'
		);
		statusMessage = `Recipe ${recipe.recipeHash} exported as JSON.`;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (isTypingTarget(event.target) || isButtonActivation(event)) return;
		const key = event.key.toLocaleLowerCase('en');
		if (event.key === ' ') {
			event.preventDefault();
			togglePause();
		} else if (key === 'n') {
			event.preventDefault();
			newExhibition();
		} else if (key === 'r') {
			event.preventDefault();
			resetPreset();
		} else if (key === 'f') {
			event.preventDefault();
			if (focusIndex === null) void openFocus();
			else void closeFocus();
		} else if (event.key === 'Escape' && focusIndex !== null) {
			event.preventDefault();
			void closeFocus();
		} else if (event.key === 'Escape') {
			const openPanel = [...exhibit.querySelectorAll<HTMLDetailsElement>('details[open]')].at(-1);
			if (openPanel) {
				event.preventDefault();
				openPanel.open = false;
				statusMessage = 'Open panel closed.';
			}
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			previousArtwork();
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			nextArtwork();
		} else if (event.key === 'Home') {
			event.preventDefault();
			selectArtwork(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			selectArtwork(recipe.artworkCount - 1);
		}
	}

	onMount(() => {
		exhibit.addEventListener('keydown', handleKeydown);
		const parameters = new URLSearchParams(window.location.search);
		posterMode = parameters.get('iw_poster') === '1';
		const parsed = parseInvisibleWeatherState(parameters);
		galleryState = parsed.state;
		allowMotionOverride = parameters.has('iw_motion') && galleryState.motion !== 'still';
		latestPhase = galleryState.frozenPhase ?? galleryState.phase;
		mounted = true;
		statusMessage = parsed.issues.length
			? `The exhibition loaded with ${parsed.issues.length} repaired URL setting${parsed.issues.length === 1 ? '' : 's'}.`
			: `Exhibition restored from seed ${galleryState.seed}.`;

		// Preserve every unrelated parameter; only the iw_ namespace belongs to this exhibit.
		for (const key of parameters.keys()) {
			if (key.startsWith('iw_') && !namespacedKeys.has(key) && key !== 'iw_poster') {
				statusMessage = `Exhibition restored. Unknown setting ${key} was left untouched.`;
				break;
			}
		}

		return () => exhibit.removeEventListener('keydown', handleKeydown);
	});
</script>

<section
	bind:this={exhibit}
	id="invisible-weather-exhibit"
	class:poster-mode={posterMode}
	class="exhibit article-breakout not-prose"
	aria-labelledby={`${uid}-title`}
	tabindex="-1"
	data-recipe-hash={recipe.recipeHash}
	data-phase={latestPhase.toFixed(5)}
>
	<header class="exhibit-header">
		<div>
			<p class="collection-mark">Procedural room · plate IW–01</p>
			<h2 id={`${uid}-title`}>The invisible weather room</h2>
			<p class="intro">
				One field, {recipe.artworkCount} instruments. The wall is responsive; the recipe is not.
			</p>
		</div>
		<div class="ledger" aria-label="Current exhibition identity">
			<span>Seed <strong title={galleryState.seed}>{compactSeed(galleryState.seed)}</strong></span>
			<span
				>Recipe <strong data-testid="invisible-weather-recipe-hash">{recipe.recipeHash}</strong
				></span
			>
			<span>Field <strong>{motionLabel}</strong></span>
		</div>
	</header>

	<p id="invisible-weather-instructions" class="instructions">
		Select a framed work on the wall or in the numbered list. Keyboard: Left/Right moves between
		works, Home/End jumps to the first or last, F enters Focus, N makes a new exhibition, R restores
		the preset, Space pauses, and Escape leaves Focus. Shortcuts stay inactive while you edit a
		control.
	</p>

	<div class="action-bar" aria-label="Exhibition actions">
		<button type="button" class="primary" onclick={newExhibition}>New exhibition</button>
		<button type="button" onclick={replaySeed}>Replay seed</button>
		<button type="button" onclick={togglePause}
			>{motionLabel === 'Still' ? 'Resume' : 'Pause'}</button
		>
		<button type="button" onclick={freezeFrame}>Freeze frame</button>
		<button type="button" onclick={openFocus}>Focus selected work</button>
		<button type="button" onclick={copyPermanentLink}>Copy permanent link</button>
		<ExportMenu
			disabled={canvasStatus !== 'ready'}
			selectedAvailable={recipe.artworks.length > 0}
			onGallery={exportGallery}
			onSelected={exportSelected}
			onJson={exportJson}
			onStatus={(message) => (statusMessage = message)}
		/>
	</div>

	<div class="room-grid">
		<div
			class:focused={focusIndex !== null}
			class="stage-column"
			role={focusIndex !== null ? 'dialog' : undefined}
			aria-label={focusIndex !== null
				? `Focus view for work ${galleryState.selectedArtwork + 1}`
				: undefined}
			data-testid={focusIndex !== null ? 'invisible-weather-focus' : undefined}
		>
			{#if focusIndex !== null}
				<div class="focus-toolbar" aria-label="Focus view controls">
					<div>
						<p>Focus view</p>
						<strong
							>Work {String(galleryState.selectedArtwork + 1).padStart(2, '0')} of {recipe.artworkCount}</strong
						>
					</div>
					<button type="button" onclick={previousArtwork}>Previous work</button>
					<button type="button" onclick={nextArtwork}>Next work</button>
					<button type="button" onclick={exportSelected}>Save this work</button>
					<button
						bind:this={focusCloseButton}
						type="button"
						class="close-focus"
						onclick={closeFocus}
					>
						Close focus
					</button>
				</div>
			{/if}
			<div class="stage-shell" data-focus={focusIndex !== null ? 'true' : 'false'}>
				<InvisibleWeatherCanvas
					bind:this={canvas}
					{recipe}
					state={galleryState}
					{paused}
					{focusIndex}
					{posterMode}
					{allowMotionOverride}
					onSelect={selectArtwork}
					onStatus={(status, message) => {
						canvasStatus = status;
						if (message) statusMessage = message;
					}}
					onPhase={(phase) => {
						latestPhase = phase;
					}}
					onSystemMotionChange={(blocked) => {
						systemMotionBlocked = blocked;
					}}
				/>
			</div>
			{#if focusIndex !== null && focusedArtwork}
				<aside class="focus-anatomy" aria-label="Field anatomy for the selected work">
					<div>
						<span>Instrument</span>
						<strong>{focusedArtwork.angleMode.replaceAll('-', ' ')}</strong>
					</div>
					<div>
						<span>Nested field</span>
						<strong
							>Depth {focusedArtwork.field.depth} · warp {focusedArtwork.field.warpStrength.toFixed(
								2
							)}</strong
						>
					</div>
					<div>
						<span>Secondary region</span>
						<strong
							>{focusedArtwork.threshold.mode} · {focusedArtwork.threshold.width.toFixed(3)}</strong
						>
					</div>
					<div>
						<span>Print structure</span>
						<strong
							>{focusedArtwork.mask.replaceAll('-', ' ')} · {focusedArtwork.pathCount.toLocaleString(
								'en'
							)} traces</strong
						>
					</div>
				</aside>
			{/if}
			<div class="museum-label" aria-label="Museum caption">
				<p>The Museum of Invisible Weather</p>
				<span
					>{currentPreset.name} · seed {compactSeed(galleryState.seed)} · {recipe.artworkCount} deterministic
					field instruments</span
				>
			</div>
		</div>

		<aside class="curator-panel" aria-label="Curator controls and selected artwork">
			<GalleryControls
				state={galleryState}
				presets={PRESETS}
				palettes={PALETTES}
				onPreset={applyPreset}
				onState={updateState}
				onReset={resetPreset}
			/>
			<ArtworkInspector
				{recipe}
				selectedIndex={galleryState.selectedArtwork}
				palettes={PALETTES}
				onSelect={selectArtwork}
				onFocus={openFocus}
			/>
		</aside>
	</div>

	<p class="status" role="status" aria-live="polite" data-testid="invisible-weather-status">
		{statusMessage}
	</p>
</section>

<style>
	.exhibit {
		--iw-panel: #eee7da;
		--iw-control: #f7f2e8;
		--iw-ink: #24231f;
		--iw-muted: #625c52;
		--iw-rule: #a99f8c;
		--iw-accent: #75583b;
		--iw-focus: #205c72;
		position: relative;
		left: calc(50% + var(--article-breakout-offset, 0rem));
		width: min(88rem, calc(100vw - 1rem));
		margin: 2rem 0 3rem;
		transform: translateX(-50%);
		border: 1px solid #8e8576;
		border-radius: 0.85rem;
		background: var(--iw-panel);
		box-shadow: 0 1.4rem 4rem rgb(45 38 29 / 18%);
		color: var(--iw-ink);
		font-family: var(--font-sans);
		isolation: isolate;
	}

	.exhibit-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1.5rem;
		border-bottom: 1px solid var(--iw-rule);
		padding: 1.2rem 1.25rem 1rem;
	}

	.collection-mark {
		margin: 0 0 0.35rem;
		color: var(--iw-accent);
		font: 800 0.65rem/1 var(--font-sans);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		color: inherit;
		font: 650 clamp(1.7rem, 4vw, 3.15rem)/0.98 var(--font-serif);
		letter-spacing: -0.035em;
	}

	.intro {
		margin: 0.55rem 0 0;
		color: var(--iw-muted);
		font: 500 0.84rem/1.45 var(--font-sans);
		text-align: left;
	}

	.ledger {
		display: grid;
		flex: 0 0 auto;
		gap: 0.25rem;
		min-width: 15rem;
		border-left: 1px solid var(--iw-rule);
		padding-left: 1rem;
		font: 650 0.62rem/1.3 var(--font-mono);
		text-transform: uppercase;
	}

	.ledger span {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		color: var(--iw-muted);
	}

	.ledger strong {
		max-width: 13rem;
		overflow: hidden;
		color: var(--iw-ink);
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-transform: none;
	}

	.instructions {
		margin: 0;
		border-bottom: 1px solid color-mix(in srgb, var(--iw-rule) 65%, transparent);
		padding: 0.7rem 1.25rem;
		color: var(--iw-muted);
		font: 500 0.7rem/1.45 var(--font-sans);
		text-align: left;
	}

	.action-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		border-bottom: 1px solid var(--iw-rule);
		padding: 0.75rem 1.25rem;
		background: color-mix(in srgb, var(--iw-control) 72%, transparent);
	}

	.action-bar > button,
	.focus-toolbar button {
		min-height: 2.75rem;
		border: 1px solid var(--iw-rule);
		border-radius: 999px;
		background: transparent;
		padding: 0.55rem 0.88rem;
		color: var(--iw-ink);
		font: 720 0.73rem/1 var(--font-sans);
		cursor: pointer;
	}

	.action-bar > button.primary {
		border-color: var(--iw-accent);
		background: var(--iw-accent);
		color: #fff;
	}

	.action-bar > button:hover,
	.focus-toolbar button:hover {
		background: color-mix(in srgb, var(--iw-accent) 12%, transparent);
	}

	.action-bar > button.primary:hover {
		background: color-mix(in srgb, var(--iw-accent) 88%, #000);
	}

	.room-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);
		align-items: start;
		gap: 1rem;
		padding: 1rem;
	}

	.stage-column {
		min-width: 0;
	}

	.stage-shell {
		width: 100%;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		border: 1px solid #776f62;
		border-radius: 0.45rem;
		background: #d7cdbc;
		box-shadow: 0 0.7rem 2rem rgb(52 43 32 / 16%);
	}

	.museum-label {
		display: inline-grid;
		gap: 0.15rem;
		max-width: 31rem;
		margin-top: 0.65rem;
		border-left: 3px solid var(--iw-accent);
		background: var(--iw-control);
		padding: 0.55rem 0.7rem;
		color: var(--iw-ink);
	}

	.museum-label p {
		margin: 0;
		font: 750 0.7rem/1.2 var(--font-serif);
		text-align: left;
	}

	.museum-label span {
		font: 500 0.58rem/1.35 var(--font-sans);
	}

	.curator-panel {
		min-width: 0;
		border: 1px solid var(--iw-rule);
		border-radius: 0.65rem;
		background: var(--iw-control);
		padding: 0.85rem;
	}

	.status {
		margin: 0;
		border-top: 1px solid var(--iw-rule);
		padding: 0.7rem 1.25rem;
		color: var(--iw-muted);
		font: 600 0.68rem/1.35 var(--font-sans);
		text-align: left;
	}

	.stage-column.focused {
		position: relative;
		z-index: 2;
		display: grid;
		grid-column: 1 / -1;
		grid-template-rows: auto minmax(24rem, 1fr) auto;
		gap: 0.75rem;
		background: #171915;
		padding: 0.75rem;
		color: #f2eadb;
	}

	.stage-column.focused + .curator-panel {
		grid-column: 1 / -1;
	}

	.stage-column.focused .stage-shell {
		width: min(72rem, 100%);
		height: min(78vh, 58rem);
		aspect-ratio: auto;
		justify-self: center;
		border-color: #8e846f;
		box-shadow: none;
	}

	.stage-column.focused .museum-label {
		justify-self: center;
		background: #eee7da;
		color: #24231f;
	}

	.focus-toolbar {
		display: flex;
		width: min(72rem, 100%);
		align-items: center;
		justify-self: center;
		gap: 0.45rem;
		color: #f2eadb;
	}

	.focus-toolbar > div {
		margin-right: auto;
	}

	.focus-toolbar p,
	.focus-toolbar strong {
		display: block;
		margin: 0;
		color: inherit;
		text-align: left;
	}

	.focus-toolbar p {
		font: 750 0.6rem/1.2 var(--font-sans);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.focus-toolbar strong {
		font: 650 0.9rem/1.3 var(--font-serif);
	}

	.focus-toolbar button {
		border-color: #a99f8c;
		color: #f2eadb;
	}

	.focus-toolbar .close-focus {
		border-color: #f2eadb;
		background: #f2eadb;
		color: #171915;
	}

	.focus-anatomy {
		display: grid;
		width: min(72rem, 100%);
		grid-template-columns: repeat(4, minmax(0, 1fr));
		justify-self: center;
		border: 1px solid #6f746c;
		background: #20231f;
		color: #f2eadb;
	}

	.focus-anatomy div {
		min-width: 0;
		border-right: 1px solid #6f746c;
		padding: 0.55rem 0.65rem;
	}

	.focus-anatomy div:last-child {
		border-right: 0;
	}

	.focus-anatomy span,
	.focus-anatomy strong {
		display: block;
		text-align: left;
	}

	.focus-anatomy span {
		margin-bottom: 0.16rem;
		color: #c5bcad;
		font: 720 0.55rem/1.2 var(--font-sans);
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.focus-anatomy strong {
		overflow-wrap: anywhere;
		font: 620 0.68rem/1.35 var(--font-sans);
	}

	button:focus-visible {
		outline: 3px solid var(--iw-focus);
		outline-offset: 2px;
	}

	@media (max-width: 68rem) {
		.room-grid {
			grid-template-columns: 1fr;
		}

		.curator-panel {
			width: 100%;
		}
	}

	@media (max-width: 48rem) {
		.exhibit {
			width: min(100%, calc(100vw - 0.5rem));
			border-radius: 0.55rem;
		}

		.exhibit-header {
			display: grid;
			align-items: start;
		}

		.ledger {
			width: 100%;
			border-top: 1px solid var(--iw-rule);
			border-left: 0;
			padding-top: 0.65rem;
			padding-left: 0;
		}

		.action-bar,
		.exhibit-header,
		.instructions,
		.status {
			padding-right: 0.75rem;
			padding-left: 0.75rem;
		}

		.room-grid {
			gap: 0.75rem;
			padding: 0.75rem;
		}

		.stage-shell {
			aspect-ratio: 4 / 5;
		}

		.focus-toolbar {
			flex-wrap: wrap;
		}

		.focus-toolbar > div {
			width: 100%;
		}

		.stage-column.focused {
			display: block;
		}

		.stage-column.focused .focus-toolbar,
		.stage-column.focused .stage-shell,
		.stage-column.focused .focus-anatomy,
		.stage-column.focused .museum-label {
			margin-bottom: 0.75rem;
		}

		.stage-column.focused .stage-shell {
			height: min(72vh, 50rem);
		}

		.focus-anatomy {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.focus-anatomy div:nth-child(2) {
			border-right: 0;
		}

		.focus-anatomy div:nth-child(-n + 2) {
			border-bottom: 1px solid #6f746c;
		}
	}

	.exhibit.poster-mode .exhibit-header,
	.exhibit.poster-mode .instructions,
	.exhibit.poster-mode .action-bar,
	.exhibit.poster-mode .curator-panel,
	.exhibit.poster-mode .museum-label,
	.exhibit.poster-mode .status {
		display: none;
	}

	.exhibit.poster-mode,
	.exhibit.poster-mode .room-grid {
		width: 100%;
		margin: 0;
		border: 0;
		border-radius: 0;
		box-shadow: none;
		padding: 0;
	}

	.exhibit.poster-mode .room-grid {
		display: block;
	}

	.exhibit.poster-mode .stage-shell {
		aspect-ratio: 16 / 9;
		border: 0;
		border-radius: 0;
	}

	:global(html[data-theme='high-contrast']) .exhibit,
	:global(html[data-theme='high-contrast']) .curator-panel,
	:global(html[data-theme='high-contrast']) .stage-shell,
	:global(html[data-theme='high-contrast']) .action-bar > button {
		border-width: 2px;
		box-shadow: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.exhibit,
		button {
			scroll-behavior: auto;
			transition: none;
		}
	}

	@media (forced-colors: active) {
		.exhibit,
		.curator-panel,
		.stage-shell,
		.action-bar > button {
			border-color: CanvasText;
		}

		.action-bar > button.primary {
			background: Highlight;
			color: HighlightText;
		}
	}
</style>
